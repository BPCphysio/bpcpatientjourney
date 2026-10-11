// Reads one written answer the way a BPC senior would, and suggests a mark
// out of 5, a note per key point and a comment to the junior.
//
// The marking view calls this when a senior opens an answer. It sends the
// case, the question and, as examples, answers to the same case that seniors
// have already marked, with their scores and comments. So every mark a senior
// saves makes the next suggestion for that case closer to theirs.
//
// Vercel runs this file as a serverless function at /api/grade. The Claude
// API key lives in the project's environment variables (ANTHROPIC_API_KEY),
// never in the page or the repository. Without it, the function answers
// "not configured" and the page keeps its other readers.
const crypto = require('crypto');
const sdk = require('@anthropic-ai/sdk');
const { GUIDE, GUIDE_VERSION } = require('./_guide.js');

const Anthropic = sdk.default || sdk;
const MODEL = 'claude-opus-5-5';
// The staff passcode's fingerprint, as in index.html. Only the marking view's
// users can spend the clinic's API credit.
const STAFF_PASSCODE_SHA256 = 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f';

const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          credit: { type: 'number', enum: [0, 0.5, 1] },
          note: { type: 'string' }
        },
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
const sha256 = s => crypto.createHash('sha256').update(String(s || '').trim()).digest('hex');

function caseBlock(b) {
  const c = b.case || {}, q = b.question || {};
  const pts = (q.points || []).slice(0, 5).map((p, i) => `${i + 1}. ${clip(p.en, 200)}${p.th ? '  |  ' + clip(p.th, 200) : ''}`).join('\n');
  const same = (b.examples || []).filter(x => x && x.same).slice(0, 10);
  const other = (b.examples || []).filter(x => x && !x.same).slice(0, 8);
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
    `QUESTION THE JUNIOR ANSWERED: ${clip(q.prompt, 600)}`,
    q.model ? `The clinic's model answer:\n${clip(q.model, 2000)}` : '',
    pts ? `Key points (a guide, not a checklist):\n${pts}` : '',
    same.length ? `ANSWERS TO THIS CASE ALREADY MARKED BY SENIORS:\n\n${same.map(ex).join('\n\n')}` : 'No senior has marked an answer to this case and question yet.',
    other.length ? `SENIORS' MARKS ON THE SAME QUESTION IN OTHER CASES (for their general standard):\n\n${other.map(ex).join('\n\n')}` : ''
  ].filter(Boolean).join('\n\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const b = req.body || {};
  if (sha256(b.key) !== STAFF_PASSCODE_SHA256) return res.status(403).json({ ok: false, error: 'bad key' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ ok: false, error: 'not configured' });

  const text = clip(b.answer && b.answer.text, 4000).trim();
  const images = ((b.answer && b.answer.images) || []).slice(0, 4)
    .map(u => /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(u || '')))
    .filter(Boolean);
  if (!text && !images.length) return res.status(400).json({ ok: false, error: 'nothing to read' });
  const nPoints = ((b.question && b.question.points) || []).length;

  const answerContent = images.map(m => ({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }));
  answerContent.push({
    type: 'text',
    text: `THE JUNIOR'S ANSWER TO MARK (written in ${b.lang === 'th' ? 'Thai' : 'English'}` +
      (images.length ? `, with the ${images.length === 1 ? 'picture' : images.length + ' pictures'} above` : '') + `):\n"""${text || '(no written reason given)'}"""\n\n` +
      (nPoints ? `Give one note per key point, in the order listed (${nPoints} in all).` : 'There are no key points for this question; give one or two notes on what the seniors would look for.') +
      ` Write the comment in ${b.lang === 'th' ? 'Thai' : 'English'}.`
  });

  const client = new Anthropic();
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: GUIDE }],
      messages: [{
        role: 'user',
        content: [
          // the case and its marked examples are the same for every answer to
          // this case, so they are cached between answers marked in a row
          { type: 'text', text: caseBlock(b), cache_control: { type: 'ephemeral' } },
          ...answerContent
        ]
      }]
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ ok: false, error: 'declined' });
    const out = msg.content.find(x => x.type === 'text');
    const got = JSON.parse(out ? out.text : '');
    const pts = (got.points || []).slice(0, Math.max(nPoints, 2));
    return res.status(200).json({
      ok: true,
      reading: {
        score: Math.max(0, Math.min(5, Math.round(Number(got.score) || 0))),
        credits: pts.map(p => Number(p.credit) || 0),
        notes: pts.map(p => clip(p.note, 300)),
        comment: clip(got.comment, 1500),
        model: msg.model, v: GUIDE_VERSION,
        examples: (b.examples || []).filter(x => x && x.same).length
      },
      usage: msg.usage
    });
  } catch (e) {
    // The monthly API credit has run out: say so plainly, the page carries on
    // with its other readers until the credit comes back.
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(String(e.message))) {
      return res.status(402).json({ ok: false, error: 'credit' });
    }
    if (e instanceof Anthropic.AuthenticationError) return res.status(503).json({ ok: false, error: 'not configured' });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ ok: false, error: 'busy' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ ok: false, error: 'claude ' + e.status });
    return res.status(500).json({ ok: false, error: String(e && e.message || e).slice(0, 200) });
  }
};
