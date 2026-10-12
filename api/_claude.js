// Claude reads one written answer the way a BPC senior would: a mark out of
// 5, a note per key point and a comment to the junior in their language.
//
// It is calibrated on the seniors' own marks: with every request go up to ten
// answers to the same case and question that seniors have marked (score and
// comment), and a few from other cases for their general standard. Every
// mark a senior saves therefore becomes an example for the next answer.
// What BPC expects is in _guide.js.
const sdk = require('@anthropic-ai/sdk');
const { GUIDE, GUIDE_VERSION } = require('./_guide.js');
const { sql, isMedia } = require('./_db.js');
const { questionFor } = require('./_cases.js');
const V2 = require('./_v2.js');
const Lessons = require('./_lessons.js');

const Anthropic = sdk.default || sdk;
// The clinic chose the cheapest model to start with. To change it, set
// CLAUDE_MODEL in Vercel (e.g. claude-sonnet-5-5 or claude-opus-5-5) and
// redeploy; answers are read again with the new model when next opened.
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
// Opus and Sonnet can hand a declined request to another model on the
// server; Haiku has no such fallback and rejects the parameter.
const FALLBACKS = !/haiku/.test(MODEL);
const QKEYS = ['q1', 'q2', 'q3'];

const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: { credit: { type: 'number', enum: [0, 0.5, 1] }, note: { type: 'string' } },
        required: ['credit', 'note'],
        additionalProperties: false
      }
    },
    comment: { type: 'string' }
  },
  required: ['score', 'points', 'comment'],
  additionalProperties: false
};

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const scored = m => m && m.score !== undefined && m.score !== null && m.score !== '';

function caseBlock(q, examples, standards) {
  const c = q.case, qq = q.question;
  const pts = qq.points.map((p, i) => `${i + 1}. ${clip(p.en, 200)}${p.th ? '  |  ' + clip(p.th, 200) : ''}`).join('\n');
  const same = examples.filter(x => x.same), other = examples.filter(x => !x.same);
  const ex = (x, i) => [
    `Example ${i + 1}${x.same ? '' : ` (another case: ${clip(x.caseTitle, 80)})`} — senior's score ${x.score}/5` +
      (x.auto != null ? ` (an earlier automatic marker had suggested ${Math.round(Number(x.auto) / 20)}/5)` : ''),
    `Answer: """${clip(x.answer, 1500)}"""`,
    x.comment ? `Senior's comment: ${clip(x.comment, 800)}` : 'Senior left no comment.'
  ].join('\n');
  return [
    `CASE: ${clip(c.title, 120)}`,
    `${c.briefLabel || 'What reception received (the chart before the call)'}:\n${clip(c.brief, 5000)}`,
    c.reveal ? `${c.revealLabel || 'What the call actually found (shown to the junior only after they answered)'}:\n${clip(c.reveal, 5000)}` : '',
    `QUESTION THE JUNIOR ANSWERED: ${clip(qq.prompt, 600)}`,
    qq.model ? `The clinic's model answer:\n${clip(qq.model, 2000)}` : '',
    pts ? `Key points (a guide, not a checklist):\n${pts}` : '',
    standards ? `HOW BPC SENIORS MARK THIS QUESTION (from every answer to it they have marked, across all cases):\n${standards}` : '',
    same.length ? `ANSWERS TO THIS CASE ALREADY MARKED BY SENIORS:\n\n${same.map(ex).join('\n\n')}` : 'No senior has marked an answer to this case and question yet.',
    other.length ? `SENIORS' MARKS ON THE SAME QUESTION IN OTHER CASES (for their general standard):\n\n${other.map(ex).join('\n\n')}` : ''
  ].filter(Boolean).join('\n\n');
}

// Answers seniors have marked, newest first. A comment saved exactly as
// Claude drafted it is not a senior's words and is left out.
async function examplesFor(id, caseId, qk) {
  const rows = await sql()`
    SELECT id, scenario_id, rec->>'scenarioTitle' AS title, rec->'answers'->>(${qk + ':text'}::text) AS text,
           marks->(${qk}::text) AS m
    FROM responses
    WHERE id <> ${id} AND marks ? (${qk}::text) AND COALESCE(rec->'answers'->>(${qk + ':text'}::text), '') <> ''
    ORDER BY marked_at DESC NULLS LAST LIMIT 400`;
  const one = (r, same) => ({
    same, caseTitle: r.title || '', answer: clip(r.text, 1500), score: Number(r.m.score),
    comment: r.m.commentBy === 'claude' ? '' : clip(r.m.comment, 800),
    auto: r.m.auto != null && r.m.autoBy !== 'claude' ? r.m.auto : null
  });
  const ok = rows.filter(r => scored(r.m));
  const same = ok.filter(r => r.scenario_id === caseId).slice(0, 10).map(r => one(r, true));
  // other cases of the same kind only: version 1 with version 1, a version 2
  // call with version 2 calls, and so on (their questions line up)
  const family = x => V2.isV2(x) ? V2.kindOf(x) : 'v1';
  const other = ok.filter(r => r.scenario_id !== caseId && family(r.scenario_id) === family(caseId) && String(r.m.comment || '').trim() && r.m.commentBy !== 'claude')
    .slice(0, 6).map(r => one(r, false));
  return same.concat(other);
}

// Which answer, pictures and same-case examples a reading belongs to. A
// senior marking another answer to the case changes it; the guide too.
function fingerprint(qk, text, nImg, examples, lessonsVersion) {
  const s = GUIDE_VERSION + '|' + MODEL + '|' + qk + '|' + text + '|' + nImg + '|' + (lessonsVersion || '') + '|' +
    examples.filter(x => x.same).map(x => x.score + ':' + x.answer.length).join(',');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function callClaude(q, examples, text, images, lang, standards) {
  const n = q.question.points.length;
  const content = images.map(m => ({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }));
  content.push({
    type: 'text',
    text: `THE JUNIOR'S ANSWER TO MARK (written in ${lang === 'th' ? 'Thai' : 'English'}` +
      (images.length ? `, with the ${images.length === 1 ? 'picture' : images.length + ' pictures'} above` : '') +
      `):\n"""${text || '(no written reason given)'}"""\n\n` +
      (n ? `Give one note per key point, in the order listed (${n} in all).` : 'There are no key points for this question; give one or two notes on what the seniors would look for.') +
      ` Write the comment in ${lang === 'th' ? 'Thai' : 'English'}.`
  });
  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: GUIDE }],
    messages: [{
      role: 'user',
      content: [
        // the case and its examples are the same for every answer to this
        // case, so they are cached between answers read in a row
        { type: 'text', text: caseBlock(q, examples, standards), cache_control: { type: 'ephemeral' } },
        ...content
      ]
    }]
  };
  const msg = FALLBACKS
    ? await client.beta.messages.create(Object.assign({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, params))
    : await client.messages.create(params);
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error('declined'), { code: 'DECLINED' });
  const out = msg.content.find(x => x.type === 'text');
  const got = JSON.parse(out ? out.text : '');
  const pts = (got.points || []).slice(0, Math.max(n, 2));
  return {
    score: Math.max(0, Math.min(5, Math.round(Number(got.score) || 0))),
    credits: pts.map(p => Number(p.credit) || 0),
    notes: pts.map(p => clip(p.note, 300)),
    comment: clip(got.comment, 1500),
    model: msg.model, v: GUIDE_VERSION, examples: examples.filter(x => x.same).length,
    // what this reading cost, so the monthly credit can be watched
    tokens: { in: msg.usage.input_tokens, out: msg.usage.output_tokens,
              cacheRead: msg.usage.cache_read_input_tokens || 0, cacheWrite: msg.usage.cache_creation_input_tokens || 0 }
  };
}

// Read every written part of one stored answer that a senior has not marked
// and that has no up-to-date reading. Returns the answer's ai object.
async function readStored(id, opts) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const rows = await sql()`SELECT id, scenario_id, rec, marks, ai FROM responses WHERE id = ${id}`;
  if (!rows.length) return null;
  const r = rows[0];
  const only = (opts && opts.only) || (V2.isV2(r.scenario_id) ? V2.writtenKeys(r.scenario_id) : QKEYS);
  const answers = (r.rec && r.rec.answers) || {};
  const ai = Object.assign({}, r.ai || {});
  let changed = false;
  // the three parts are read at the same time
  const one = async (qk) => {
    if (scored((r.marks || {})[qk])) return;
    const q = questionFor(r.scenario_id, qk);
    if (!q) return;
    const text = String(answers[qk + ':text'] || '').trim();
    const imgKeys = (r.rec.media || []).filter(k => k.indexOf(qk + ':img') === 0 && isMedia(k));
    if (text.replace(/\s/g, '').length < 3 && !imgKeys.length) return;
    const examples = await examplesFor(id, r.scenario_id, qk);
    const std = await Lessons.standardsFor(r.scenario_id, qk, { client: new Anthropic(), model: MODEL });
    const fp = fingerprint(qk, text, imgKeys.length, examples, std.version);
    if (ai['c' + qk] && ai['c' + qk].fp === fp) return;
    const images = await imagesOf(id, imgKeys);
    const reading = await callClaude(q, examples, text, images, r.rec.language === 'th' ? 'th' : 'en', std.text);
    ai['c' + qk] = Object.assign(reading, { fp, at: Date.now() });
    changed = true;
  };
  const results = await Promise.allSettled(only.map(one));
  const failed = results.find(x => x.status === 'rejected');
  if (changed) {
    await sql()`UPDATE responses SET ai = ${JSON.stringify(ai)}::jsonb, updated_at = now() WHERE id = ${id}`;
  }
  if (failed && !changed) throw failed.reason;
  return ai;
}

async function imagesOf(id, imgKeys) {
  if (!imgKeys.length) return [];
  const media = await sql()`SELECT k, value FROM media WHERE response_id = ${id} AND k = ANY(${imgKeys}::text[])`;
  return media.map(m => /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(m.value || '')))
    .filter(m => m && m[2].length < 6500000).slice(0, 4);
}

// ---------------------------------------------------------------- testing
// How close Claude comes to the seniors, on answers they have already marked.
// Each answer is marked twice without Claude seeing the senior's mark for it:
// "before" as the marker worked until now (examples only), "after" with the
// seniors' standards for the question as well. To keep the test fair, the
// answers are split in two halves, and the summary used for one half is
// written only from the other half's comments. Results build up in kv
// ('calibration') across calls, a slice at a time.
const fold = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 2; };

async function calibrate(opts) {
  const limit = Math.min(Number(opts.limit) || 20, 40), offset = Number(opts.offset) || 0;
  const all = await sql()`SELECT id, scenario_id, rec, marks FROM responses WHERE marks IS NOT NULL ORDER BY id`;
  const parts = [];
  all.forEach(r => {
    const keys = V2.isV2(r.scenario_id) ? V2.writtenKeys(r.scenario_id) : QKEYS;
    keys.forEach(qk => {
      const m = (r.marks || {})[qk];
      const text = String(((r.rec || {}).answers || {})[qk + ':text'] || '').trim();
      if (scored(m) && text.replace(/\s/g, '').length >= 3) parts.push({ r, qk, senior: Number(m.score) });
    });
  });
  const slice = parts.slice(offset, offset + limit);
  const client = new Anthropic();
  const skipOf = f => new Set(all.filter(r => fold(r.id) === f).map(r => r.id));
  const stdCache = {};
  const stdFor = async (caseId, qk, f) => {
    const k = Lessons.familyOf(caseId, qk) + '|' + f;
    // one summary per question and half, shared by every answer that needs it
    if (!stdCache[k]) stdCache[k] = (async () => {
      const kept = await sql()`SELECT v FROM kv WHERE k = ${'lessons-test:' + k}`;
      if (kept.length) return kept[0].v;
      const made = await Lessons.standardsFor(caseId, qk, { skip: skipOf(f), client, model: MODEL });
      await sql()`INSERT INTO kv (k, v) VALUES (${'lessons-test:' + k}, ${JSON.stringify(made)}::jsonb) ON CONFLICT (k) DO NOTHING`;
      return made;
    })();
    return stdCache[k];
  };
  const results = {};
  for (let i = 0; i < slice.length; i += 8) {
    await Promise.all(slice.slice(i, i + 8).map(async ({ r, qk, senior }) => {
      const q = questionFor(r.scenario_id, qk);
      if (!q) return;
      const text = String(r.rec.answers[qk + ':text'] || '').trim();
      const imgKeys = (r.rec.media || []).filter(k => k.indexOf(qk + ':img') === 0 && isMedia(k));
      const examples = await examplesFor(r.id, r.scenario_id, qk);
      const images = await imagesOf(r.id, imgKeys);
      const lang = r.rec.language === 'th' ? 'th' : 'en';
      const std = await stdFor(r.scenario_id, qk, fold(r.id));
      const [before, after] = await Promise.all([
        callClaude(q, examples, text, images, lang, ''),
        callClaude(q, examples, text, images, lang, std.text)
      ]);
      results[r.id + ':' + qk] = { senior, before: before.score, after: after.score, fam: Lessons.familyOf(r.scenario_id, qk) };
    }));
  }
  const got = await sql()`SELECT v FROM kv WHERE k = 'calibration'`;
  const merged = Object.assign({}, got.length ? got[0].v : {}, results);
  await sql()`INSERT INTO kv (k, v, updated_at) VALUES ('calibration', ${JSON.stringify(merged)}::jsonb, now())
              ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
  return { total: parts.length, done: Object.keys(merged).length, next: offset + slice.length < parts.length ? offset + slice.length : null, summary: summarise(merged) };
}

function summarise(res) {
  const rows = Object.values(res);
  const one = (list, k) => {
    if (!list.length) return null;
    const d = list.map(x => x[k] - x.senior);
    return {
      n: list.length,
      off: +(d.reduce((a, b) => a + Math.abs(b), 0) / d.length).toFixed(2),   // average distance from the senior
      bias: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2),            // + marks higher than seniors, - lower
      same: Math.round(d.filter(x => x === 0).length / d.length * 100),        // % exactly the senior's mark
      within1: Math.round(d.filter(x => Math.abs(x) <= 1).length / d.length * 100)
    };
  };
  const fams = [...new Set(rows.map(x => x.fam))].sort();
  return {
    all: { before: one(rows, 'before'), after: one(rows, 'after') },
    byQuestion: Object.fromEntries(fams.map(f => [f, { before: one(rows.filter(x => x.fam === f), 'before'), after: one(rows.filter(x => x.fam === f), 'after') }]))
  };
}

module.exports = { readStored, calibrate, Anthropic };
