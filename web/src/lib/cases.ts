// The 45 cases (English, with Thai beside them), as the first version had
// them. Each case runs the same steps; the trainer, the submission and the
// marking view all speak "questions[]".
import EN from '../data/cases.en.json'
import TH from '../data/cases.th.json'
import { STEP_PROMPTS, type Lang } from './strings'

type RawCase = {
  id: string; level: number; type: string; title: string; brief: string; reveal: string; model: string; q5key: string
  q1: { prompt: string; opts: string[]; answer: number; why: string }
}
type ThCase = { title?: string; brief?: string; reveal?: string; model?: string; q5key?: string
  q?: { prompt?: string; options?: string[]; why?: string; key?: string; rubric?: string }[] }

export type Question = {
  type: 'mc' | 'long' | 'image'; phase: 1 | 2; prompt: string
  options?: string[]; answer?: number; why?: string; key?: string; rubric?: string
}
export type Case = {
  id: string; track: string; level: number; type: string; title: string; brief: string; reveal: string; model: string
  questions: Question[]; thPartial?: boolean
}

const RAW = EN as RawCase[]
const THT = TH as Record<string, ThCase>

export function caseView(id: string, lang: Lang): Case | null {
  const c = RAW.find(x => x.id === id)
  if (!c) return null
  const p = STEP_PROMPTS[lang] || STEP_PROMPTS.en
  const t = lang === 'th' ? THT[c.id] : undefined
  const tq = (i: number) => (t && t.q && t.q[i]) || {}
  return {
    id: c.id, track: 'Pre-arrival', level: c.level, type: c.type,
    title: (t && t.title) || c.title,
    brief: (t && t.brief) || c.brief,
    reveal: (t && t.reveal) || c.reveal,
    model: (t && t.model) || c.model,
    thPartial: lang === 'th' && !t,
    questions: [
      { type: 'mc', phase: 1, prompt: tq(0).prompt || c.q1.prompt, options: tq(0).options || c.q1.opts, answer: c.q1.answer, why: tq(0).why || c.q1.why },
      { type: 'long', phase: 1, prompt: p.q2, key: (t && t.model) || c.model },
      { type: 'long', phase: 1, prompt: p.q3 },
      { type: 'image', phase: 2, prompt: p.q5, key: (t && t.q5key) || c.q5key }
    ]
  }
}

// Taken out of new sets on 13/10/2026: the clinic wants the basics, where you
// call the patient yourself. These were booked by someone else (a friend, an
// employer, a wife, a mother) or could not be called at all. Answers already
// given to them stay in the record and can still be opened and marked.
const RETIRED = ['c03', 'c06', 'c32', 'c33', 'c34']
const LIVE = RAW.filter(c => RETIRED.indexOf(c.id) < 0)

export const ALL_IDS = LIVE.map(c => c.id)
export const levelOf = (id: string) => (RAW.find(x => x.id === id) || { level: 0 }).level

// One set of four that still climbs to a level-5 case. Every progress label
// derives from BUCKETS.length.
export const BUCKETS = [[1, 2], [3], [4], [5]]

export function buildQueue(offset: number, done: string[]): string[] {
  const picked: string[] = []
  BUCKETS.slice(offset || 0).forEach(levels => {
    const inBand = (c: RawCase) => levels.indexOf(c.level) > -1 && picked.indexOf(c.id) < 0
    let pool = LIVE.filter(c => inBand(c) && done.indexOf(c.id) < 0)
    if (!pool.length) pool = LIVE.filter(inBand)
    if (pool.length) picked.push(pool[Math.floor(Math.random() * pool.length)].id)
  })
  return picked
}
