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
  const fam = familyOf(caseId, qk);
  const rows = await marksIn(fam, opts.skip);
  const stats = statsText(rows);
  const nComments = rows.filter(r => fresh(r.m.comment, r.m)).length;
  let summary = null, version = 0;
  if (opts.skip) {
    if (opts.client) summary = await writeSummary(fam, rows, opts.client, opts.model);
    version = nComments;
  } else {
    const got = await sql()`SELECT v FROM kv WHERE k = ${'lessons:' + fam}`;
    const kept = got.length ? got[0].v : null;
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
  const text = [stats, summary ? `What their comments reward and take marks off for:\n${summary}` : ''].filter(Boolean).join('\n\n');
  return { text, version: rows.length + '/' + version };
}

module.exports = { familyOf, standardsFor, marksIn };
