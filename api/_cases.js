// The cases and key points, read on the server the same way the page reads
// them, so Claude marks against exactly what the staff member saw.
// (Vercel ships index.html and grading/answers.json with the functions;
// see includeFiles in vercel.json.)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
let _cases = null, _answers = null;

function cases() {
  if (_cases) return _cases;
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const man = JSON.parse(html.match(/<script type="__bundler\/manifest">\n([\s\S]*?)\n {2}<\/script>/)[1]);
  const ctx = { window: {} };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  const mods = [];
  for (const v of Object.values(man)) {
    if (!String(v.mime || '').includes('javascript')) continue;
    let raw = Buffer.from(v.data, 'base64');
    if (String(v.compressed).toLowerCase() === 'true') raw = zlib.gunzipSync(raw);
    const src = raw.toString('utf8');
    if (src.slice(0, 200).includes('BPC pre-arrival cases')) mods.push(src);
  }
  mods.sort((a, b) => (a.includes('BPC_TH') ? 1 : 0) - (b.includes('BPC_TH') ? 1 : 0));
  mods.forEach(s => vm.runInContext(s, ctx));
  _cases = Object.fromEntries((ctx.window.BPC_CASES_EN || []).map(c => [c.id, c]));
  return _cases;
}

function answers() {
  if (!_answers) _answers = JSON.parse(fs.readFileSync(path.join(ROOT, 'grading', 'answers.json'), 'utf8'));
  return _answers;
}

// The written questions, as the trainer asks them.
const PROMPTS = {
  q1: 'Say the three most important questions you would ask on this call.',
  q2: 'Why those three? Say what each one would change about your first session.',
  q3: 'Upload the image you would have on the screen when the patient walks in (or several), and say why.'
};

// Everything Claude needs about one case and question.
function questionFor(caseId, qk) {
  const c = cases()[caseId];
  if (!c) return null;
  const block = (answers().cases[caseId] || {})[qk];
  return {
    case: { title: c.title, brief: c.brief, reveal: c.reveal },
    question: {
      prompt: PROMPTS[qk],
      model: qk === 'q3' ? c.q5key : c.model,
      points: block ? block.points.map(p => ({ en: p.en, th: p.th })) : []
    }
  };
}

module.exports = { cases, answers, questionFor, PROMPTS };
