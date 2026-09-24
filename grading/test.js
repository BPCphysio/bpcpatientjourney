/*
 * How good is the grader? Measured, not assumed.
 *
 *     node grading/test.js           report, and fail if below the bar
 *     node grading/test.js --tune    also search the two thresholds
 *
 * Four checks:
 *
 *   1. Real answers. Real staff answers, marked point by point by a careful
 *      human marker who never saw the grader (testset.json). This is the
 *      number that matters: how often the grader's suggested mark out of 5
 *      lands within one of the human's.
 *   2. Reference answers, each graded against the other nine. All of them
 *      are full-marks answers, so they should score high.
 *   3. The wrong case. A full-marks answer for one case, graded as if it
 *      were an answer to another. It should score low.
 *   4. Empty talk. Answers that fit every case ("to plan the treatment")
 *      should score low.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const G = require('./grader.js');

const HERE = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(HERE, 'answers.json'), 'utf8'));
const tests = fs.existsSync(path.join(HERE, 'testset.json'))
  ? JSON.parse(fs.readFileSync(path.join(HERE, 'testset.json'), 'utf8')) : [];
G.load(data);

const BAR = {
  withinOne: 0.80,     // real answers: suggested /5 within one of the human
  mae: 16,             // real answers: mean gap in percentage points
  selfMean: 80,        // reference answers against the other nine
  crossMean: 30,       // an answer to the wrong case
  emptyMax: 34         // generic filler
};

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const cases = Object.keys(data.cases).sort((a, b) => +a.slice(1) - +b.slice(1));

// hold half the real answers back when tuning, chosen by id so it is stable
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function real(subset) {
  const rows = [];
  subset.forEach(t => {
    const g = G.grade(t.case, t.q, t.text);
    if (!g.graded) return;
    rows.push({ t, g, gap: Math.abs(g.pct - t.pct), step: Math.abs(g.suggested - Math.round(t.pct / 20)) });
  });
  return {
    n: rows.length,
    mae: mean(rows.map(r => r.gap)),
    withinOne: mean(rows.map(r => (r.step <= 1 ? 1 : 0))),
    exact: mean(rows.map(r => (r.step === 0 ? 1 : 0))),
    pointAgree: mean(rows.flatMap(r => r.g.points.map((p, i) => (p.credit === r.t.credits[i] ? 1 : 0)))),
    rows
  };
}

function self() {
  const out = [];
  cases.forEach(cid => ['q1', 'q2'].forEach(q => ['en', 'th'].forEach(lang => {
    data.cases[cid][q].answers[lang].forEach((a, n) => {
      out.push(G.grade(cid, q, a.map((x, i) => `${i + 1}. ${x}`).join('\n'), { lang, n }).pct);
    });
  })));
  return { mean: mean(out), low: out.filter(x => x < 67).length, n: out.length };
}

function cross() {
  const out = [];
  cases.forEach((cid, i) => {
    const other = cases[(i + 7) % cases.length];
    ['q1', 'q2'].forEach(q => ['en', 'th'].forEach(lang => {
      const a = data.cases[other][q].answers[lang][0];
      out.push(G.grade(cid, q, a.map((x, k) => `${k + 1}. ${x}`).join('\n')).pct);
    }));
  });
  return { mean: mean(out), high: out.filter(x => x >= 67).length, n: out.length };
}

const FILLER = [
  'To understand the patient symptoms and plan the treatment properly.',
  'I would ask about the pain, the symptoms and the history.',
  'เพื่อให้เข้าใจอาการของคนไข้ และวางแผนการรักษาได้ถูกต้อง',
  'ถามอาการ ถามประวัติ และถามเรื่องการรักษา',
  'Build rapport and make the patient feel confident in us.',
  'สร้างความเชื่อใจกับคนไข้ ให้คนไข้มั่นใจ'
];
function filler() {
  const out = [];
  cases.forEach(cid => ['q1', 'q2'].forEach(q => FILLER.forEach(f => {
    const g = G.grade(cid, q, f);
    if (g.graded) out.push(g.pct);
  })));
  return { mean: mean(out), max: Math.max(...out), n: out.length };
}

function report(label) {
  const r = real(tests), s = self(), c = cross(), f = filler();
  console.log(`\n${label}  (lo ${G.params().lo}, hi ${G.params().hi})`);
  console.log('-'.repeat(64));
  console.log(`real answers        ${r.n} graded`);
  console.log(`  within one mark   ${(r.withinOne * 100).toFixed(0)}%   (bar ${BAR.withinOne * 100}%)`);
  console.log(`  same mark         ${(r.exact * 100).toFixed(0)}%`);
  console.log(`  average gap       ${r.mae.toFixed(1)} points  (bar ${BAR.mae})`);
  console.log(`  points agreeing   ${(r.pointAgree * 100).toFixed(0)}%`);
  console.log(`reference vs nine   ${s.mean.toFixed(0)}% average, ${s.low}/${s.n} under 67%  (bar ${BAR.selfMean}%)`);
  console.log(`wrong case          ${c.mean.toFixed(0)}% average, ${c.high}/${c.n} at 67% or more  (bar under ${BAR.crossMean}%)`);
  console.log(`generic filler      ${f.mean.toFixed(0)}% average, worst ${f.max}%  (bar ${BAR.emptyMax}% or less)`);
  return { r, s, c, f };
}

if (process.argv.includes('--tune')) {
  const train = tests.filter(t => hash(t.rid + t.q) % 2 === 0);
  const hold = tests.filter(t => hash(t.rid + t.q) % 2 === 1);
  // score every setting on the training half alone (fast), then check the
  // best few against the wrong-case, filler and self tests before choosing
  const cands = [];
  for (const common of [3, 4, 6, 8, 12]) {
    for (let lo = 0.16; lo <= 0.40001; lo += 0.02) {
      for (let hi = lo + 0.08; hi <= 0.70001; hi += 0.02) {
        G.set({ lo: +lo.toFixed(2), hi: +hi.toFixed(2), common });
        const r = real(train);
        cands.push({ lo: +lo.toFixed(2), hi: +hi.toFixed(2), common, score: r.mae - r.withinOne * 20 });
      }
    }
  }
  cands.sort((a, b) => a.score - b.score);
  let best = null;
  for (const c of cands.slice(0, 25)) {
    G.set(c);
    const s = self(), x = cross(), f = filler();
    if (s.mean >= BAR.selfMean && x.mean <= BAR.crossMean && f.max <= BAR.emptyMax) { best = c; break; }
  }
  best = best || cands[0];
  G.set(best);
  const tr = real(train), h = real(hold);
  console.log(`
best on the training half: lo ${best.lo}, hi ${best.hi}, common ${best.common}`);
  console.log(`training half: ${tr.n} answers, within one mark ${(tr.withinOne * 100).toFixed(0)}%, average gap ${tr.mae.toFixed(1)}`);
  console.log(`held-back half: ${h.n} answers, within one mark ${(h.withinOne * 100).toFixed(0)}%, average gap ${h.mae.toFixed(1)}`);
  G.set(G.defaults);
  const d = real(hold);
  console.log(`held-back half at the current defaults: within one mark ${(d.withinOne * 100).toFixed(0)}%, average gap ${d.mae.toFixed(1)}`);
  G.set(best);
}

const out = report('grader');
if (process.argv.includes('--rows')) {
  out.r.rows.sort((a, b) => b.gap - a.gap).slice(0, 12).forEach(x => {
    console.log(`\n${x.t.case} ${x.t.q} ${x.t.lang}  human ${x.t.pct}% [${x.t.credits}]  auto ${x.g.pct}% [${x.g.points.map(p => p.credit)}]`);
    console.log('  ' + x.t.text.replace(/\n/g, ' / ').slice(0, 160));
    x.g.points.forEach((p, i) => p.credit && console.log(`   p${i + 1} ${p.how}: ${String(p.evidence).slice(0, 70)}`));
  });
}

const fail = [];
if (tests.length && out.r.withinOne < BAR.withinOne) fail.push('real answers: within-one agreement below the bar');
if (tests.length && out.r.mae > BAR.mae) fail.push('real answers: average gap above the bar');
if (out.s.mean < BAR.selfMean) fail.push('reference answers score too low against each other');
if (out.c.mean > BAR.crossMean) fail.push('answers to the wrong case score too high');
if (out.f.max > BAR.emptyMax) fail.push('generic filler scores too high');
if (fail.length) { console.log('\nFAIL\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('\nall checks passed');
