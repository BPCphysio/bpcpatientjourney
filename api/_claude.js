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

function caseBlock(q, examples) {
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
    `What reception received (the chart before the call):\n${clip(c.brief, 3000)}`,
    c.reveal ? `What the call actually found (shown to the junior only after they answered):\n${clip(c.reveal, 3000)}` : '',
    `QUESTION THE JUNIOR ANSWERED: ${clip(qq.prompt, 600)}`,
    qq.model ? `The clinic's model answer:\n${clip(qq.model, 2000)}` : '',
    pts ? `Key points (a guide, not a checklist):\n${pts}` : '',
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
  const other = ok.filter(r => r.scenario_id !== caseId && String(r.m.comment || '').trim() && r.m.commentBy !== 'claude')
    .slice(0, 6).map(r => one(r, false));
  return same.concat(other);
}

// Which answer, pictures and same-case examples a reading belongs to. A
// senior marking another answer to the case changes it; the guide too.
function fingerprint(qk, text, nImg, examples) {
  const s = GUIDE_VERSION + '|' + MODEL + '|' + qk + '|' + text + '|' + nImg + '|' +
    examples.filter(x => x.same).map(x => x.score + ':' + x.answer.length).join(',');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function callClaude(q, examples, text, images, lang) {
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
        { type: 'text', text: caseBlock(q, examples), cache_control: { type: 'ephemeral' } },
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
  const only = (opts && opts.only) || QKEYS;
  const rows = await sql()`SELECT id, scenario_id, rec, marks, ai FROM responses WHERE id = ${id}`;
  if (!rows.length) return null;
  const r = rows[0];
  const answers = (r.rec && r.rec.answers) || {};
  const ai = Object.assign({}, r.ai || {});
  let changed = false;
  // the three parts are read at the same time
  const one = async (qk) => {
    if (scored((r.marks || {})[qk])) return;
    const q = questionFor(r.scenario_id, qk);
    if (!q) return;
    const text = String(answers[qk + ':text'] || '').trim();
    const imgKeys = qk === 'q3' ? ((r.rec.media || []).filter(k => k.indexOf('q3:img') === 0 && isMedia(k))) : [];
    if (text.replace(/\s/g, '').length < 3 && !imgKeys.length) return;
    const examples = await examplesFor(id, r.scenario_id, qk);
    const fp = fingerprint(qk, text, imgKeys.length, examples);
    if (ai['c' + qk] && ai['c' + qk].fp === fp) return;
    let images = [];
    if (imgKeys.length) {
      const media = await sql()`SELECT k, value FROM media WHERE response_id = ${id} AND k = ANY(${imgKeys}::text[])`;
      images = media.map(m => /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(m.value || '')))
        .filter(m => m && m[2].length < 6500000).slice(0, 4);
    }
    const reading = await callClaude(q, examples, text, images, r.rec.language === 'th' ? 'th' : 'en');
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

module.exports = { readStored, Anthropic };
