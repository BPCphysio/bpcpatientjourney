// Copies the clinic record from the Google script into Neon, at
// /api/migrate. Safe to run again and again: an answer already here keeps
// its newer marks and readings, and only what is missing is fetched. Nothing
// is changed or deleted on the Google side.
//
//   POST {key, step: 'list'}    every answer, mark and reading (light)
//   POST {key, step: 'media'}   pictures and recordings, for ~50 s per call;
//                               call again until `left` is 0
//   POST {key, step: 'status'}  counts on both sides
const { sql, ready, keyOk, isMedia } = require('./_db.js');
const C = require('./_clinic.js');

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch (e) { return {}; }
}

async function googleTry(qs, tries) {
  let last;
  for (let i = 0; i < (tries || 3); i++) {
    try { return await C.googleGet(qs, 60000); } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  throw last;
}

async function copyList(key) {
  const d = await googleTry('key=' + encodeURIComponent(key));
  let added = 0, updated = 0;
  for (const item of d.responses || []) {
    const { rec } = C.split(item, isMedia);
    const marks = item.marks ? JSON.stringify(item.marks) : null;
    const hist = item.markHistory ? JSON.stringify(item.markHistory) : null;
    const got = await sql()`
      INSERT INTO responses (id, scenario_id, who, sent_at, rec, marks, marked_at, marked_by, mark_history, ai)
      VALUES (${item.id}, ${item.scenarioId || null}, ${item.who || ''}, ${Number(item.when) || null},
              ${JSON.stringify(rec)}::jsonb, ${marks}::jsonb, ${Number(item.markedAt) || null},
              ${item.markedBy || null}, ${hist}::jsonb, ${JSON.stringify(item.ai || {})}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        marks = CASE WHEN COALESCE(EXCLUDED.marked_at, 0) > COALESCE(responses.marked_at, 0) THEN EXCLUDED.marks ELSE responses.marks END,
        marked_by = CASE WHEN COALESCE(EXCLUDED.marked_at, 0) > COALESCE(responses.marked_at, 0) THEN EXCLUDED.marked_by ELSE responses.marked_by END,
        mark_history = CASE WHEN COALESCE(EXCLUDED.marked_at, 0) > COALESCE(responses.marked_at, 0) THEN EXCLUDED.mark_history ELSE responses.mark_history END,
        marked_at = GREATEST(EXCLUDED.marked_at, responses.marked_at),
        ai = EXCLUDED.ai || responses.ai
      RETURNING (xmax = 0) AS inserted`;
    if (got.length && got[0].inserted) added++; else updated++;
  }
  return { google: (d.responses || []).length, added, updated, markers: (d.markers || []).length };
}

async function copyMedia(key, budget) {
  const until = Date.now() + budget;
  const want = await sql()`
    SELECT r.id, e.mk AS k FROM responses r, jsonb_array_elements_text(COALESCE(r.rec->'media', '[]'::jsonb)) AS e(mk)
    WHERE NOT EXISTS (SELECT 1 FROM media m WHERE m.response_id = r.id AND m.k = e.mk)
    ORDER BY r.sent_at DESC NULLS LAST`;
  let copied = 0, missing = 0;
  for (const w of want) {
    if (Date.now() > until) break;
    const d = await googleTry('key=' + encodeURIComponent(key) + '&id=' + encodeURIComponent(w.id) + '&k=' + encodeURIComponent(w.k), 2);
    if (d.value == null) {
      // listed but empty on Google: remember that, so it is not asked again
      missing++;
      await sql()`INSERT INTO media (response_id, k, value) VALUES (${w.id}, ${w.k}, '') ON CONFLICT DO NOTHING`;
      continue;
    }
    await sql()`INSERT INTO media (response_id, k, value) VALUES (${w.id}, ${w.k}, ${String(d.value)})
                ON CONFLICT (response_id, k) DO UPDATE SET value = EXCLUDED.value`;
    copied++;
  }
  const left = await sql()`
    SELECT count(*)::int AS n FROM responses r, jsonb_array_elements_text(COALESCE(r.rec->'media', '[]'::jsonb)) AS e(mk)
    WHERE NOT EXISTS (SELECT 1 FROM media m WHERE m.response_id = r.id AND m.k = e.mk)`;
  return { copied, missing, left: left[0].n };
}

async function status() {
  const a = await sql()`SELECT count(*)::int AS n, count(marks)::int AS marked FROM responses`;
  const m = await sql()`SELECT count(*)::int AS n, coalesce(sum(length(value)), 0)::bigint AS bytes FROM media`;
  const q = await sql()`SELECT count(*) FILTER (WHERE done_at IS NULL)::int AS waiting, count(*) FILTER (WHERE done_at IS NULL AND tries >= 8)::int AS stuck FROM google_outbox`;
  return { answers: a[0].n, marked: a[0].marked, media: m[0].n, mediaMB: Math.round(Number(m[0].bytes) / 1048576), googleWaiting: q[0].waiting, googleStuck: q[0].stuck };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const b = bodyOf(req);
  if (!keyOk(b.key)) return res.status(200).json({ ok: false, error: 'bad key' });
  try {
    await ready();
    if (b.step === 'list') return res.status(200).json(Object.assign({ ok: true }, await copyList(b.key)));
    if (b.step === 'media') return res.status(200).json(Object.assign({ ok: true }, await copyMedia(b.key, 50000)));
    if (b.step === 'roster') { await C.roster(); return res.status(200).json({ ok: true }); }
    return res.status(200).json(Object.assign({ ok: true }, await status()));
  } catch (e) {
    if (e && e.code === 'NOCONF') return res.status(200).json({ ok: false, error: 'not configured' });
    return res.status(200).json({ ok: false, error: String(e && e.message || e).slice(0, 300) });
  }
};
