// How well does the model mark? Measured on the blind-marked real answers in
// grading/testset.json, with the same prompt the job uses.
//
//   node grading/ai/eval.mjs [path to settings]
//
// Prints agreement for the model alone, the wording grader alone, and the
// combination the marking view uses: the model's reading for "why those
// three", the wording grader for "the three questions".
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { MODEL_FILE } from './prompt.mjs';
import { REPO, loadCases, loadAnswers, startServer, judge } from './engine.mjs';

const require = createRequire(import.meta.url);
const G = require(path.join(REPO, 'grading', 'grader.js'));
const CFG_PATH = process.argv[2] || path.join(os.homedir(), 'llm', 'config.json');
const cfg = Object.assign({ port: 8091, model: MODEL_FILE }, JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')), { port: 8091 });

const answers = loadAnswers();
G.load(answers);
const cases = loadCases();
const tests = JSON.parse(fs.readFileSync(path.join(REPO, 'grading', 'testset.json'), 'utf8'));
const pct = c => Math.round(c.reduce((a, b) => a + b, 0) / 3 * 100);

const server = await startServer(cfg);
const rows = [];
try {
  for (const t of tests) {
    const m = await judge(cfg.port, cases[t.case], answers.cases[t.case][t.q], t.q, t.text);
    const lex = G.grade(t.case, t.q, t.text, { src: t.rid });
    rows.push({ t, model: m ? m.credits : null, lex: lex.points.map(p => p.credit) });
    process.stdout.write(m ? '.' : '!');
  }
} finally { await server.stop(); }
console.log();

function stats(get, sel) {
  let gap = 0, one = 0, same = 0, n = 0;
  sel.forEach(r => {
    const c = get(r);
    if (!c) return;
    const p = pct(c), h = r.t.pct, d = Math.abs(Math.round(p / 20) - Math.round(h / 20));
    gap += Math.abs(p - h); if (d <= 1) one++; if (!d) same++; n++;
  });
  return `n ${n}  within one mark ${(one / n * 100).toFixed(0)}%  same mark ${(same / n * 100).toFixed(0)}%  average gap ${(gap / n).toFixed(1)}`;
}
const used = r => (r.t.q === 'q2' && r.model ? r.model : r.lex);
for (const [label, sel] of [['all', rows], ['three questions', rows.filter(r => r.t.q === 'q1')], ['why those three', rows.filter(r => r.t.q === 'q2')]]) {
  console.log(`\n${label}`);
  console.log('  model alone        ', stats(r => r.model, sel));
  console.log('  wording alone      ', stats(r => r.lex, sel));
  console.log('  as the page uses it', stats(used, sel));
}
console.log(`\nreplies the model could not give: ${rows.filter(r => !r.model).length} of ${rows.length}`);
