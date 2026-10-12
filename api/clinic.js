// The clinic record, at /api/clinic. It answers every request the trainer
// makes exactly as the old Google script did (same parameters, same JSON),
// but from Neon: fast, many people at once, and no waking up. Every write is
// also queued for the Google script, which stays as the backup.
//
//   GET  ?roster=1               people and markers (tap-your-name chips)
//   GET  ?exists=<id>            did a submission land
//   GET  ?who=<name>             which cases this person has answered
//   GET  ?key=                   the answer list (light) and the markers
//   GET  ?key=&id=               one answer in full
//   GET  ?key=&id=&k=            one picture or recording
//   GET  ?key=&id=&saved=1       did this save land
//   POST {response}              a new submission (Claude reads it straight after)
//   POST {action:'mark'|'visit'|'ai'|'delete'|'regrade', key, ...}
const { waitUntil } = require('@vercel/functions');
const { sql, ready, keyOk, isMedia } = require('./_db.js');
const C = require('./_clinic.js');
const { readStored, calibrate } = require('./_claude.js');
const V2 = require('./_v2.js');

const ok = (res, o) => res.status(200).json(Object.assign({ ok: true }, o));
const no = (res, error) => res.status(200).json({ ok: false, error });

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch (e) { return {}; }
}

// After answering: send queued writes to Google, and anything else asked.
function after(res, ...jobs) {
  waitUntil(Promise.allSettled(jobs.concat([C.drain(45000)])));
}

async function get(req, res) {
  const p = req.query || {};
  if (p.roster === '1') {
    const r = await C.roster(waitUntil);
    return ok(res, { people: r.people, markers: r.markers });
  }
  if (p.exists) {
    const rows = await sql()`SELECT 1 FROM responses WHERE id = ${String(p.exists)}`;
    return ok(res, { exists: rows.length > 0 });
  }
  if (p.who) {
    const r = await C.roster(waitUntil);
    const k = C.nameKey(C.resolve(p.who, r.people));
    const rows = await sql()`SELECT DISTINCT scenario_id, who FROM responses`;
    const done = [];
    rows.forEach(x => { if (x.scenario_id && C.nameKey(C.resolve(x.who, r.people)) === k && done.indexOf(x.scenario_id) < 0) done.push(x.scenario_id); });
    return ok(res, { done });
  }
  if (!keyOk(p.key)) return no(res, 'bad key');

  if (p.id) {
    const id = String(p.id);
    if (p.saved) {
      const rows = await sql()`SELECT save_id, marked_at, marked_by FROM responses WHERE id = ${id}`;
      if (!rows.length) return no(res, 'not found');
      return ok(res, { id, saveId: rows[0].save_id || '', markedAt: Number(rows[0].marked_at) || 0, markedBy: rows[0].marked_by || '' });
    }
    if (p.k) {
      const k = String(p.k);
      const rows = await sql()`SELECT value FROM media WHERE response_id = ${id} AND k = ${k}`;
      if (!rows.length) {
        const there = await sql()`SELECT rec->'answers'->(${k}::text) AS v FROM responses WHERE id = ${id}`;
        if (!there.length) return no(res, 'not found');
        return ok(res, { id, key: k, value: there[0].v == null ? null : there[0].v });
      }
      return ok(res, { id, key: k, value: rows[0].value === '' ? null : rows[0].value });
    }
    const rows = await sql()`SELECT * FROM responses WHERE id = ${id}`;
    if (!rows.length) return no(res, 'not found');
    const media = await sql()`SELECT k, value FROM media WHERE response_id = ${id}`;
    const one = C.light(rows[0]);
    one.answers = Object.assign({}, one.answers);
    media.forEach(m => { if (m.value !== '') one.answers[m.k] = m.value; });
    one.saveId = rows[0].save_id || '';
    return ok(res, { response: one });
  }

  const [r, rows] = await Promise.all([C.roster(waitUntil), sql()`SELECT * FROM responses ORDER BY sent_at DESC NULLS LAST`]);
  const out = rows.map(row => {
    const x = C.light(row);
    x.person = C.resolve(x.who, r.people);
    x.branch = C.branchOf(x.person, r.people);
    return x;
  });
  return ok(res, { responses: out, markers: r.markers });
}

async function post(req, res) {
  const body = bodyOf(req);

  if (body.action === 'mark') {
    if (!keyOk(body.key)) return no(res, 'bad key');
    const r = await C.roster(waitUntil);
    if (!C.isMarker(body.by, r)) return no(res, 'not a marker');
    const rows = await sql()`SELECT id, rec, save_id, marked_at, marked_by, mark_history FROM responses WHERE id = ${String(body.id)}`;
    if (!rows.length) return no(res, 'not found');
    const row = rows[0];
    // Version 2 answers are marked by the senior physiotherapists of the
    // answerer's branch, or by someone listed for all branches.
    if (V2.isV2(row.rec && row.rec.scenarioId)) {
      const branch = C.branchOf(C.resolve(row.rec.who, r.people), r.people);
      const me = C.nameKey(C.resolve(body.by, r.people));
      const mine = (r.markers || []).filter(x => C.nameKey(C.resolve(x.name, r.people)) === me).map(x => C.nameKey(x.branch));
      if (branch && mine.length && mine.indexOf(C.nameKey(branch)) < 0 && mine.indexOf('all branches') < 0) return no(res, 'not your branch');
    }
    // A repeat of a save that already landed is answered as done.
    if (body.saveId && row.save_id === body.saveId) {
      return ok(res, { markedAt: Number(row.marked_at), markedBy: row.marked_by, repeat: true });
    }
    const by = String(body.by || '').trim().slice(0, 60);
    const at = Date.now();
    const hist = (row.mark_history || []).concat([{ by, at }]).slice(-20);
    await sql()`UPDATE responses SET marks = ${JSON.stringify(body.marks || {})}::jsonb, marked_at = ${at},
                marked_by = ${by}, mark_history = ${JSON.stringify(hist)}::jsonb, save_id = ${String(body.saveId || '')},
                updated_at = now() WHERE id = ${row.id}`;
    const rec = Object.assign({}, row.rec, { person: C.resolve(row.rec.who, r.people) });
    await C.log(by, 'saved marks', rec);
    await C.queue(body);
    after(res);
    return ok(res, { markedAt: at, markedBy: by });
  }

  if (body.action === 'visit') {
    if (!keyOk(body.key)) return no(res, 'bad key');
    await C.log(String(body.by || '').trim().slice(0, 60), 'opened the marking view', null);
    await C.queue(body);
    after(res);
    return ok(res, {});
  }

  // Readings sent in from outside (the page used to send Claude's; the old
  // clinic PC reader sends its own). Merged beside the answer.
  if (body.action === 'ai') {
    if (!keyOk(body.key)) return no(res, 'bad key');
    let saved = 0;
    for (const it of (body.items || [])) {
      const got = await sql()`UPDATE responses SET ai = ai || ${JSON.stringify(it.ai || {})}::jsonb, updated_at = now()
                              WHERE id = ${String(it.id)} RETURNING id`;
      saved += got.length;
    }
    return ok(res, { saved });
  }

  // A senior opened an answer: read whatever is not read for the current
  // examples, and hand back the readings.
  if (body.action === 'regrade') {
    if (!keyOk(body.key)) return no(res, 'bad key');
    if (!process.env.ANTHROPIC_API_KEY) return no(res, 'not configured');
    try {
      const ai = await readStored(String(body.id));
      return ok(res, { ai: ai || {} });
    } catch (e) {
      return no(res, /credit balance|usage limit|spend limit/i.test(String(e && e.message)) ? 'credit' : 'claude: ' + String(e && e.message || e).slice(0, 160));
    }
  }

  // Testing the marker against the seniors (see calibrate in _claude.js).
  if (body.action === 'calibrate') {
    if (!keyOk(body.key)) return no(res, 'bad key');
    if (!process.env.ANTHROPIC_API_KEY) return no(res, 'not configured');
    try { return ok(res, await calibrate(body)); }
    catch (e) { return no(res, /credit balance|usage limit|spend limit/i.test(String(e && e.message)) ? 'credit' : 'claude: ' + String(e && e.message || e).slice(0, 160)); }
  }

  if (body.action === 'delete') {
    if (!keyOk(body.key)) return no(res, 'bad key');
    const id = String(body.id);
    await sql()`DELETE FROM media WHERE response_id = ${id}`;
    await sql()`DELETE FROM responses WHERE id = ${id}`;
    await C.queue(body);
    after(res);
    return ok(res, {});
  }

  const r = body.response;
  if (!r || !r.id) return no(res, 'no response');
  // The trainer re-sends the same id when a phone lost the connection
  // mid-submit. Treat that as already received rather than storing a copy.
  const there = await sql()`SELECT 1 FROM responses WHERE id = ${String(r.id)}`;
  if (there.length) return ok(res, { id: r.id, duplicate: true });
  r.receivedAt = Date.now();
  const { rec, media } = C.split(r, isMedia);
  for (const [k, v] of Object.entries(media)) {
    await sql()`INSERT INTO media (response_id, k, value) VALUES (${r.id}, ${k}, ${String(v)})
                ON CONFLICT (response_id, k) DO UPDATE SET value = EXCLUDED.value`;
  }
  await sql()`INSERT INTO responses (id, scenario_id, who, sent_at, rec)
              VALUES (${r.id}, ${r.scenarioId || null}, ${r.who || ''}, ${Number(r.when) || Date.now()}, ${JSON.stringify(rec)}::jsonb)
              ON CONFLICT (id) DO NOTHING`;
  await C.queue({ response: r });
  // Claude reads the written answers straight away, so the suggested mark is
  // waiting before any senior opens it.
  after(res, readStored(r.id).catch(() => {}));
  return ok(res, { id: r.id });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await ready();
    if (req.method === 'GET') return await get(req, res);
    if (req.method === 'POST') return await post(req, res);
    return res.status(405).json({ ok: false, error: 'GET or POST' });
  } catch (e) {
    if (e && e.code === 'NOCONF') return no(res, 'not configured');
    return no(res, 'server: ' + String(e && e.message || e).slice(0, 200));
  }
};
