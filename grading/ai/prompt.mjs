// The instructions the language model marks with. The nightly job and the
// accuracy test both import this file, so what is measured is what runs.
import crypto from 'crypto';

export const MODEL_FILE = 'Qwen3-8B-Q4_K_M.gguf';
export const PROMPT_VERSION = 'v1';

const QTEXT = {
  q1: 'Say the three most important questions you would ask on this call.',
  q2: 'Why those three? Say what each one would change about your first session.'
};

export const SYSTEM = `You are the senior physiotherapist at Bangkok Physiotherapy Center, marking a staff physiotherapist's answer in a training exercise about the phone call before a new patient's first visit.

The clinic has defined exactly three key points for this question. For each key point, decide whether the staff answer covers it:
- 1 = clearly covers it. Meaning is what counts: any wording, Thai, English or mixed, typos and shorthand are fine, and it need not be in the same order.
- 0.5 = covers it only partly: half of a two-part point, or a vague or generic version of it.
- 0 = does not cover it.

Be strict about generic answers. Asking "the cause", "the severity" or "the history", or giving a reason like "to plan the treatment" or "to understand the symptoms", does not cover a point that is specific to this case; it earns at most 0.5 on the single point it is closest to, and usually 0. Credit each part of the answer to at most one key point.

Reply with JSON only. Format: {"credits": [c1, c2, c3], "notes": ["...", "...", "..."]} where each credit is 0, 0.5 or 1 and each note is a few words, in English, on why.`;

export function userPrompt(c, block, q, answer) {
  const pts = block.points.map((p, i) => `${i + 1}. ${p.en}  |  ${p.th}`).join('\n');
  const ex = [block.answers.en[0], block.answers.th[4]].map(a => a.map((x, i) => `${i + 1}) ${x}`).join('\n'));
  return `CASE ${c.id}: ${c.title}
What the chart said before the call:
${c.brief}

What the call actually found:
${c.reveal}

QUESTION: ${QTEXT[q]}

THE THREE KEY POINTS:
${pts}

Two examples of full-marks answers, for calibration only:
Example A:
${ex[0]}
Example B:
${ex[1]}

THE STAFF ANSWER TO MARK:
"""
${answer}
"""

Give the credit for key points 1, 2 and 3, and a few words on each.`;
}

// Which version of the question, answer and instructions a reading belongs
// to. Change any of them and the answer is read again.
export function fingerprint(q, answer) {
  return crypto.createHash('sha1').update(PROMPT_VERSION + '|' + MODEL_FILE + '|' + q + '|' + String(answer).trim()).digest('hex').slice(0, 12);
}

const snap = c => (c >= 0.75 ? 1 : c >= 0.25 ? 0.5 : 0);

// Returns {credits, notes} or null if the reply is not usable.
export function parseReply(txt) {
  txt = String(txt || '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(txt.slice(a, b + 1));
    if (!Array.isArray(o.credits) || o.credits.length !== 3) return null;
    const credits = o.credits.map(Number);
    if (credits.some(x => isNaN(x))) return null;
    const notes = Array.isArray(o.notes) ? o.notes.slice(0, 3).map(n => String(n).slice(0, 140)) : ['', '', ''];
    while (notes.length < 3) notes.push('');
    return { credits: credits.map(snap), notes };
  } catch (e) {
    return null;
  }
}
