// Shared by the clinic API and the copy from Google: the staff roster and
// markers (still kept in the Google Sheet, so the clinic edits them where it
// always has), name matching, record shapes, and the Google backup queue.
const { sql } = require('./_db.js');

// The old clinic script. It stays the backup: every write here is sent on to
// it in order, so the Drive folder and the sheet keep a complete copy.
const GOOGLE = 'https://script.google.com/macros/s/AKfycby_T7t0CboCz5iMvfRa7oykcGl_xOcglRxWnT1iTVjc3WLONXefgV7WzY5Powcyozs/exec';

const nameKey = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

function resolve(name, people) {
  const k = nameKey(name);
  if (!k) return String(name || '').trim();
  for (const p of people) {
    if (nameKey(p.name) === k || nameKey(p.th) === k) return p.name;
    if ((p.aliases || []).some(a => nameKey(a) === k)) return p.name;
  }
  return String(name || '').trim();
}

function branchOf(person, people) {
  const k = nameKey(person);
  const p = people.find(x => nameKey(x.name) === k);
  return p ? p.branch || '' : '';
}

function isMarker(name, roster) {
  const mks = roster.markers || [];
  if (!mks.length) return true;
  const k = nameKey(resolve(name, roster.people || []));
  if (!k) return false;
  return mks.some(m => nameKey(resolve(m.name, roster.people || [])) === k);
}

async function googleGet(qs, ms) {
  const res = await fetch(GOOGLE + '?' + qs, { signal: AbortSignal.timeout(ms || 60000) });
  const d = JSON.parse(await res.text());
  if (!d || !d.ok) throw new Error((d && d.error) || 'refused');
  return d;
}

// People and markers, from the Google Sheet, kept for ten minutes. A stale
// copy is served at once and refreshed behind the answer.
async function roster(later) {
  const rows = await sql()`SELECT v, extract(epoch from now() - updated_at) AS age FROM kv WHERE k = 'roster'`;
  const have = rows.length ? rows[0].v : null;
  const fresh = rows.length && Number(rows[0].age) < 600;
  if (have && fresh) return have;
  const refresh = async () => {
    const d = await googleGet('roster=1', 60000);
    const v = { people: d.people || [], markers: d.markers || [] };
    await sql()`INSERT INTO kv (k, v, updated_at) VALUES ('roster', ${JSON.stringify(v)}::jsonb, now())
                ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
    return v;
  };
  if (have) {
    // keep the old copy for another ten minutes whatever happens, then refresh
    await sql()`UPDATE kv SET updated_at = now() WHERE k = 'roster'`;
    if (later) later(refresh().catch(() => {}));
    return have;
  }
  try { return await refresh(); } catch (e) { return { people: [], markers: [] }; }
}

// A record as the page knows it: the light form (no picture or recording
// data, just their keys) plus marks and readings.
function light(row) {
  return Object.assign({}, row.rec, {
    marks: row.marks || undefined, markedAt: row.marked_at ? Number(row.marked_at) : undefined,
    markedBy: row.marked_by || undefined, markHistory: row.mark_history || undefined,
    ai: row.ai && Object.keys(row.ai).length ? row.ai : undefined
  });
}

// Split an incoming record into its light part and its media.
const SPLIT_OUT = ['marks', 'markedAt', 'markedBy', 'markHistory', 'ai', 'saveId', 'person', 'branch', 'full', 'mediaErr'];
function split(r, isMedia) {
  const rec = {}, media = {};
  for (const k of Object.keys(r)) if (k !== 'answers' && SPLIT_OUT.indexOf(k) < 0) rec[k] = r[k];
  rec.answers = {};
  const keys = (r.media || []).slice();
  for (const [k, v] of Object.entries(r.answers || {})) {
    if (isMedia(k)) { if (v != null) media[k] = v; if (keys.indexOf(k) < 0) keys.push(k); } else rec.answers[k] = v;
  }
  rec.media = keys;
  return { rec, media };
}

async function log(who, what, rec) {
  await sql()`INSERT INTO marking_log (who, what, answer_from, case_title, response_id)
              VALUES (${who || '(name not given)'}, ${what}, ${rec ? (rec.person || rec.who || '') : ''},
                      ${rec ? (rec.scenarioTitle || '') : ''}, ${rec ? (rec.id || '') : ''})`;
}

// ---- the Google backup queue ----

async function queue(body) {
  await sql()`INSERT INTO google_outbox (body) VALUES (${JSON.stringify(body)}::jsonb)`;
}

// Send waiting writes to Google, oldest first, one at a time, for up to
// `budget` ms. A write that fails is tried again on a later run.
async function drain(budget) {
  const until = Date.now() + (budget || 40000);
  let sent = 0;
  while (Date.now() < until) {
    // claim the oldest waiting write; a claim older than three minutes
    // belongs to a run that stopped, and a failed write waits as long
    const got = await sql()`
      UPDATE google_outbox SET tries = tries + 1, claimed_at = now()
      WHERE id = (SELECT id FROM google_outbox
                  WHERE done_at IS NULL AND tries < 8
                    AND (claimed_at IS NULL OR claimed_at < now() - interval '3 minutes')
                  ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id, body`;
    if (!got.length) break;
    const item = got[0];
    try {
      const res = await fetch(GOOGLE, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item.body), signal: AbortSignal.timeout(60000)
      });
      const d = JSON.parse(await res.text());
      if (!d || !d.ok) throw new Error((d && d.error) || 'refused');
      await sql()`UPDATE google_outbox SET done_at = now(), last_error = NULL WHERE id = ${item.id}`;
      sent++;
    } catch (e) {
      await sql()`UPDATE google_outbox SET last_error = ${String(e && e.message || e).slice(0, 300)} WHERE id = ${item.id}`;
      break; // Google is busy or waking; leave the rest for the next run
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return sent;
}

module.exports = { GOOGLE, nameKey, resolve, branchOf, isMarker, roster, light, split, log, queue, drain, googleGet };
