// What the seniors have taught the marker so far, per question.
//
// Every question belongs to a family: version 1's q1, q2 and q3 across all
// 45 cases, and in version 2 the same question in every case of one kind.
// For each family the marker is given two things beside the examples:
//   - how seniors score it (how many marks, the average, how often each
//     score was given), counted fresh from the record every time; and
//   - a short summary of what their comments reward and pull marks for,
//     written by Claude from all the comments and kept in the kv table.
//     It is written again once five more commented marks have come in.
// So every mark and comment a senior saves makes the next reading closer to
// how BPC marks.
const { sql } = require('./_db.js');
const V2 = require('./_v2.js');
const { questionFor } = require('./_cases.js');

// The starting summaries for version 1, written on 13/10/2026 by reading all
// 48 senior comments then in the record (20 on the call questions, 12 on
// "why", 16 on the picture). They stand until five more comments arrive on
// that question; then Claude writes the summary again from every comment.
const SEED = {
  'v1:q1': { n: 20, text: [
    '- Recap and confirm what the chart or the patient already said before asking anything new ("confirm the symptoms they already reported"). Asking again what is on the chart loses marks.',
    '- Ask about work and daily life: occupation, working posture or ergonomics, other activities and hobbies, and what the problem stops them doing. Seniors add this to almost every answer that missed it.',
    '- Ask the goal and what they expect from treatment.',
    '- Previous treatment: what they had, whether it helped, when the last session was, and WHY they stopped. Asking about past treatment without the reason it stopped is marked down.',
    '- Ask for reports, scans or blood results from the hospital when the chart mentions them.',
    '- Pin down the problem: exactly where it hurts (e.g. which part of the knee), timeline and severity, what makes it worse AND what eases it, and numbness or weakness when relevant.',
    '- Empathy: ask what the patient is worried about, and respond to it ("may lack empathy" is a common comment). If the patient asked something in the chat (price, how many sessions), answer it on the call.',
    '- If someone else booked, try to speak to the patient directly.',
    'A 5: specific to this patient, covers their life and goal, and nothing important missing. A 3–4: sensible and patient-centred but missing occupation, the reason treatment stopped, the pain area or the patient\'s worry. A 2 or below: a generic history list, or the patient\'s main concern is left unaddressed.'
  ].join('\n') },
  'v1:q2': { n: 12, text: [
    '- Seniors reward a clear reason for EACH question that says what it changes in preparing tomorrow\'s session (the examination plan, the hypotheses, the treatment plan).',
    '- Practical preparation earns credit: the right room or a wheelchair, timing the visit after pending blood results, asking the patient to skip a painkiller so the real pain can be assessed, the post-operative protocol.',
    '- Generic reasons ("to know the goal", "to assess severity") without saying what changes are marked down to 2–3.',
    '- Missing reasons tied to the patient\'s work, timeline or goal are the most common addition.',
    'A 5: each question has its own reason linked to how tomorrow is prepared. A 3–4: reasons are sound but general. A 2 or below: reasons only restate the questions.'
  ].join('\n') },
  'v1:q3': { n: 16, text: [
    '- The picture must match THIS patient: their mechanism of injury, the activity or posture that brings it on, and where it hurts. "Matches the mechanism and is clear" is the comment on a 5.',
    '- Function beats anatomy: pictures of the activity (driving, using the hands at work, the sport) help more than a plain anatomy chart. Anatomy alone, especially if not about the patient, scores low (1–2).',
    '- Keep it to one or a few: several pictures at once "may reduce understanding", and too many is marked down. Offering 2–3 similar postures for the patient to pick the closest is liked.',
    '- Leave out what the patient does not need yet: machine pictures (ultrasound, shockwave) and anything that could frighten them.',
    '- For post-operative or healing cases, a simple healing timeline showing where they are is credited.',
    'A 5: one clear picture tied to the mechanism and the patient\'s activity, with a reason. A 3–4: relevant but generic, too many, or missing the whole-body or activity view. 0–1: the wrong picture, nothing to do with this patient, or a missing reason.'
  ].join('\n') }
};

// Version 2 asks some questions word for word as version 1 did (the three
// questions for the call, why those three, the picture for the iPad). Until
// seniors have commented on a version 2 question themselves, it borrows what
// they taught on its version 1 twin. Questions with no twin (the LINE
// messages, the differentials, the first words in the room) start with only
// the case's own key points.
const TWIN = {
  'v2:call:q1': 'v1:q1', 'v2:call:q2': 'v1:q2', 'v2:call:q3': 'v1:q3',
  'v2:journey:q1': 'v1:q1', 'v2:journey:q2': 'v1:q3'
};
const OWN_NEEDED = 3;   // commented marks of its own before a question stops borrowing

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const scored = m => m && m.score !== undefined && m.score !== null && m.score !== '';
const fresh = (c, m) => String(c || '').trim() && m && m.commentBy !== 'claude';

function familyOf(caseId, qk) {
  return V2.isV2(caseId) ? 'v2:' + (V2.kindOf(caseId) || '?') + ':' + qk : 'v1:' + qk;
}
const inFamily = (fam, caseId, qk) => familyOf(caseId, qk) === fam;

// Every senior mark in the family, newest first. `skip` leaves answers out
// (used when testing the marker on answers it must not have seen).
async function marksIn(fam, skip) {
  const qk = fam.split(':').pop();
  const rows = await sql()`
    SELECT id, scenario_id, rec->>'scenarioTitle' AS title, rec->>'language' AS lang,
           rec->'answers'->>(${qk + ':text'}::text) AS text, marks->(${qk}::text) AS m
    FROM responses WHERE marks ? (${qk}::text) ORDER BY marked_at DESC NULLS LAST`;
  return rows.filter(r => inFamily(fam, r.scenario_id, qk) && scored(r.m) && !(skip && skip.has(r.id)));
}

function statsText(rows) {
  if (!rows.length) return '';
  const n = rows.length, counts = [0, 0, 0, 0, 0, 0];
  rows.forEach(r => { const s = Math.max(0, Math.min(5, Math.round(Number(r.m.score)))); counts[s]++; });
  const mean = rows.reduce((a, r) => a + Number(r.m.score), 0) / n;
  const pct = k => Math.round(counts[k] / n * 100) + '%';
  return `Seniors have marked ${n} answers to this question. Average ${mean.toFixed(1)}/5. ` +
    `Scores given: 5 → ${pct(5)}, 4 → ${pct(4)}, 3 → ${pct(3)}, 2 → ${pct(2)}, 1 → ${pct(1)}, 0 → ${pct(0)}.`;
}

// Claude writes the summary of what the seniors' comments say.
async function writeSummary(fam, rows, client, model) {
  const withComments = rows.filter(r => fresh(r.m.comment, r.m)).slice(0, 80);
  if (withComments.length < 3) return null;
  const sample = rows[0];
  const q = questionFor(sample.scenario_id, fam.split(':').pop());
  const items = withComments.map((r, i) =>
    `#${i + 1} (case: ${clip(r.title, 70)}; senior's score ${r.m.score}/5)\nAnswer: """${clip(r.text, 700)}"""\nSenior's comment: ${clip(r.m.comment, 600)}`).join('\n\n');
  const msg = await client.messages.create({
    model,
    max_tokens: 4000,
    output_config: { effort: 'medium' },
    messages: [{
      role: 'user',
      content: `These are real marks and comments from senior physiotherapists at Bangkok Physiotherapy Center on junior physiotherapists' answers to one training question, asked across several patient cases.\n\nTHE QUESTION: ${q ? q.question.prompt : fam}\n\n${items}\n\n` +
        'Write what these seniors consistently reward and what they take marks off for, as 6 to 10 short bullet points, then one line each on what earns a 5, a 3–4, and a 2 or below. ' +
        'Use only what the comments and scores show; quote a phrase where it helps; no generic advice. If the seniors disagree with each other, say so. Plain English, no preamble.'
    }]
  });
  const out = msg.content.find(x => x.type === 'text');
  return out ? clip(out.text.trim(), 3000) : null;
}

// The block that goes into the marker's prompt for one question.
// opts.skip: answers to leave out entirely (and then nothing is saved).
// opts.client/model: needed only to write a missing or stale summary.
async function standardsFor(caseId, qk, opts) {
  opts = opts || {};
  const own = familyOf(caseId, qk);
  let fam = own;
  let rows = await marksIn(fam, opts.skip);
  let borrowed = false;
  if (TWIN[own] && rows.filter(r => fresh(r.m.comment, r.m)).length < OWN_NEEDED) {
    fam = TWIN[own]; borrowed = true;
    rows = await marksIn(fam, opts.skip);
  }
  const stats = statsText(rows);
  const nComments = rows.filter(r => fresh(r.m.comment, r.m)).length;
  let summary = null, version = 0;
  if (opts.skip) {
    if (opts.client) summary = await writeSummary(fam, rows, opts.client, opts.model);
    version = nComments;
  } else {
    const got = await sql()`SELECT v FROM kv WHERE k = ${'lessons:' + fam}`;
    const kept = got.length ? got[0].v : (SEED[fam] || null);
    if (kept && kept.n + 5 > nComments) { summary = kept.text; version = kept.n; }
    else if (opts.client && nComments >= 3) {
      summary = await writeSummary(fam, rows, opts.client, opts.model);
      if (summary) {
        await sql()`INSERT INTO kv (k, v, updated_at) VALUES (${'lessons:' + fam}, ${JSON.stringify({ n: nComments, text: summary })}::jsonb, now())
                    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
        version = nComments;
      }
    } else if (kept) { summary = kept.text; version = kept.n; }
  }
  const lead = borrowed ? 'No senior has marked this version 2 question yet. The standard below comes from the same question in version 1, which seniors have marked; apply it to this case.' : '';
  const text = [lead, stats, summary ? `What their comments reward and take marks off for:\n${summary}` : ''].filter(Boolean).join('\n\n');
  return { text, version: (borrowed ? 'twin:' : '') + rows.length + '/' + version };
}

// The version 1 question a version 2 question is the twin of, as its question
// key ('q1'..'q3'), or null.
function twinKey(caseId, qk) {
  const t = TWIN[familyOf(caseId, qk)];
  return t ? t.split(':').pop() : null;
}

module.exports = { familyOf, standardsFor, marksIn, twinKey, OWN_NEEDED };
