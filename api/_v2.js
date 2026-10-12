// Version 2 cases, read from the same files the trainer shows
// (web/src/data/v2/*.json, shipped with the function; see vercel.json).
// Each case is a list of steps; a question is marked against everything the
// junior had seen when they answered it, and what came after is shown to
// Claude as what happened next.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'web', 'src', 'data', 'v2');
let _cases = null;

function all() {
  if (_cases) return _cases;
  _cases = {};
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.json')) continue;
    const c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    _cases[c.id] = c;
  }
  return _cases;
}

const isV2 = id => String(id || '').indexOf('v2-') === 0;
const en = x => (x && (x.en || x.th)) || '';

function stepText(s) {
  if (s.t === 'chat') return `${en(s.label)} (${en(s.meta)})\n` + s.msgs.map(m => (m.name ? en(m.name) + ': ' : '') + en(m.text)).join('\n');
  return `${en(s.label)}:\n${en(s.body)}`;
}

// The written parts of a case, which Claude reads.
function writtenKeys(caseId) {
  const c = all()[caseId];
  return c ? c.steps.filter(s => s.t === 'q' && s.type !== 'mc').map(s => s.q) : [];
}

const KIND = {
  call: 'Before the visit: the pre-arrival call',
  journey: 'The whole patient journey, from the booking chat to the LINE message after the first visit',
  line: 'After the visit: writing to the patient on LINE'
};

function questionFor(caseId, qk) {
  const c = all()[caseId];
  if (!c) return null;
  const i = c.steps.findIndex(s => s.t === 'q' && s.q === qk);
  if (i < 0) return null;
  const q = c.steps[i];
  const before = [], after = [];
  c.steps.forEach((s, n) => { if (s.t !== 'q') (n < i ? before : after).push(stepText(s)); });
  const earlier = c.steps.slice(0, i).filter(s => s.t === 'q').map(s => `- ${en(s.stage)}: ${en(s.prompt)}`);
  return {
    case: {
      title: `${en(c.title)} (${KIND[c.kind] || c.kind})`,
      brief: before.join('\n\n') + (earlier.length ? `\n\nThe junior had already answered:\n${earlier.join('\n')}` : ''),
      reveal: after.join('\n\n'),
      briefLabel: 'What the junior had in front of them when answering',
      revealLabel: 'What happens later in the case (shown to the junior only after this answer locked)'
    },
    question: {
      prompt: `${en(q.stage)}: ${en(q.prompt)}`,
      model: en(q.model),
      points: (q.points || []).map(p => ({ en: p.en, th: p.th }))
    }
  };
}

module.exports = { all, isV2, writtenKeys, questionFor, kindOf: id => (all()[id] || {}).kind || null };
