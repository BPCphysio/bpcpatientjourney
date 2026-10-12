// Version 2 of the trainer: new cases, in three kinds, each a list of steps
// (the booking chat, notes, questions, and reveals that lock what came
// before). Seniors try it from the clinic staff area. The same files are read
// by the clinic API (api/_v2.js), so Claude marks against what was shown.
import type { Lang } from './strings'

type T = { en: string; th: string }
type RawMsg = { from: 'pt' | 'rc' | 'you' | 'sys'; name?: T; text: T }
type RawStep =
  | { t: 'chat'; label: T; meta: T; msgs: RawMsg[] }
  | { t: 'note'; label: T; body: T }
  | { t: 'reveal'; label: T; body: T }
  | { t: 'q'; q: string; type: 'mc' | 'long' | 'short' | 'image'; stage: T; prompt: T; options?: T[]; answer?: number; why?: T; model?: T; points?: T[] }
export type Kind = 'call' | 'journey' | 'line'
// retired: no longer drawn into sets; answers already given can still be marked
type RawCase = { id: string; kind: Kind; title: T; steps: RawStep[]; retired?: string }

const FILES = import.meta.glob('../data/v2/*.json', { eager: true, import: 'default' }) as Record<string, RawCase>
const RAW: RawCase[] = Object.values(FILES).sort((a, b) => a.id.localeCompare(b.id))

export type Msg = { from: RawMsg['from']; name: string; text: string }
export type V2Q = {
  t: 'q'; qk: string; type: 'mc' | 'long' | 'short' | 'image'; stage: string; prompt: string; phase: number; n: number
  options?: string[]; answer?: number; why?: string; model?: string; points?: string[]
}
export type V2Step =
  | { t: 'chat'; label: string; meta: string; msgs: Msg[]; phase: number }
  | { t: 'note'; label: string; body: string; phase: number }
  | { t: 'reveal'; label: string; body: string; phase: number }
  | V2Q
export type V2Case = { id: string; kind: Kind; title: string; steps: V2Step[]; questions: V2Q[]; phases: number }

export const isV2 = (id: unknown) => String(id || '').indexOf('v2-') === 0
export const KINDS: Kind[] = ['call', 'journey', 'line']

export function v2View(id: string, lang: Lang): V2Case | null {
  const c = RAW.find(x => x.id === id)
  if (!c) return null
  const s = (x?: T) => (x ? x[lang] || x.en : '')
  let phase = 0, n = 0
  const steps: V2Step[] = c.steps.map(st => {
    if (st.t === 'reveal') phase++
    if (st.t === 'chat') return { t: 'chat', label: s(st.label), meta: s(st.meta), phase, msgs: st.msgs.map(m => ({ from: m.from, name: s(m.name), text: s(m.text) })) }
    if (st.t === 'note' || st.t === 'reveal') return { t: st.t, label: s(st.label), body: s(st.body), phase }
    return {
      t: 'q', qk: st.q, type: st.type, stage: s(st.stage), prompt: s(st.prompt), phase, n: ++n,
      options: st.options && st.options.map(s), answer: st.answer, why: s(st.why) || undefined,
      model: s(st.model) || undefined, points: st.points && st.points.map(s)
    }
  })
  return { id: c.id, kind: c.kind, title: s(c.title), steps, questions: steps.filter((x): x is V2Q => x.t === 'q'), phases: phase + 1 }
}

export const ALL_V2 = RAW.map(c => c.id)
export const kindOf = (id: string): Kind | null => { const c = RAW.find(x => x.id === id); return c ? c.kind : null }
export const writtenKeys = (c: V2Case) => c.questions.filter(q => q.type !== 'mc').map(q => q.qk)

// One set: two of each kind, in the order of the journey (before the visit,
// the whole visit, after it). Cases this person has not answered come first.
export function buildV2Set(done: string[]): string[] {
  const out: string[] = []
  KINDS.forEach(k => {
    const all = RAW.filter(c => c.kind === k && !c.retired).map(c => c.id)
    const fresh = shuffle(all.filter(id => done.indexOf(id) < 0))
    const old = shuffle(all.filter(id => done.indexOf(id) > -1))
    out.push(...fresh.concat(old).slice(0, 2))
  })
  return out
}
function shuffle<X>(a: X[]): X[] {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

// The case as plain text, for the marking view's "the case" panel.
export function v2Text(c: V2Case, upToPhase = 99): string {
  return c.steps.filter(s => s.t !== 'q' && s.phase <= upToPhase).map(s => {
    if (s.t === 'chat') return s.label + ' · ' + s.meta + '\n' + s.msgs.map(m => (m.name ? m.name + ': ' : '') + m.text).join('\n')
    if (s.t === 'note' || s.t === 'reveal') return s.label + '\n' + s.body
    return ''
  }).join('\n\n')
}

export const V2X = {
  en: {
    kind: { call: 'Before the visit', journey: 'The whole journey', line: 'After the visit · LINE' } as Record<Kind, string>,
    tryV2: 'Try version 2',
    v1: 'Version 1', v2: 'Version 2 (test)',
    v2Intro: 'Version 2 is being tested by the senior physiotherapists. Six new cases: two before the visit, two that follow one patient through the whole journey, and two on LINE after the visit.',
    answeringAs: (n: string) => `Answering as ${n}`,
    startSet: 'Start six cases', resumeSet: (n: number) => `Carry on: case ${n} of 6`, newSet: 'Start a new set',
    backToMarking: 'Back to marking',
    caseOf: (n: number, t: number) => `Case ${n} of ${t}`,
    nextPart: 'Lock these answers and continue', submit: 'Send to the clinic', sending: 'Sending…',
    lockWarn: 'When you continue, the answers above lock and you see what happened next.',
    yourAnswerPh: 'Your answer…', shortPh: 'What you would say…',
    sent: 'Sent. A senior physiotherapist from your branch will mark it.',
    queued: 'Saved on this device; it will send when there is a connection.',
    nextCase: 'Next case', allDone: 'That was all six. Thank you!',
    allDoneBody: 'Your answers are in the clinic record under Version 2. The seniors in your branch mark them in the marking view.',
    branchOnly: (b: string) => `Marked by the senior physiotherapists of ${b}.`,
    notYourBranch: (b: string) => `Only the senior physiotherapists of ${b} can mark this answer. You can read it.`,
    choicesRight: (r: number, t: number) => `${r} of ${t} choices right`,
    modelAnswer: 'A strong answer',
    theCase: 'The case',
    wrongOf: (w: number, n: number) => `${w} of ${n} choices wrong`,
    scoreOf: (r: number, t: number) => `${r} of ${t} choices right`,
    noV2: 'No version 2 answers yet.'
  },
  th: {
    kind: { call: 'ก่อนคนไข้มาถึง', journey: 'ครบทั้ง Patient Journey', line: 'หลังคนไข้กลับ · LINE' } as Record<Kind, string>,
    tryV2: 'ลองทำเวอร์ชัน 2',
    v1: 'เวอร์ชัน 1', v2: 'เวอร์ชัน 2 (ทดลอง)',
    v2Intro: 'เวอร์ชัน 2 กำลังให้นักกายภาพบำบัดอาวุโสทดลองใช้ มีเคสใหม่ 6 เคส: ก่อนคนไข้มาถึง 2 เคส ตามคนไข้หนึ่งคนตลอด Patient Journey 2 เคส และการส่ง LINE หลังคนไข้กลับ 2 เคส',
    answeringAs: (n: string) => `ทำในชื่อ ${n}`,
    startSet: 'เริ่มทำ 6 เคส', resumeSet: (n: number) => `ทำต่อ: เคสที่ ${n} จาก 6`, newSet: 'เริ่มชุดใหม่',
    backToMarking: 'กลับไปหน้าตรวจ',
    caseOf: (n: number, t: number) => `เคสที่ ${n} จาก ${t}`,
    nextPart: 'ล็อกคำตอบแล้วไปต่อ', submit: 'ส่งคำตอบ', sending: 'กำลังส่ง…',
    lockWarn: 'พอกดไปต่อ คำตอบด้านบนจะล็อก แล้วจะได้เห็นว่าเกิดอะไรขึ้นต่อ',
    yourAnswerPh: 'คำตอบของคุณ…', shortPh: 'ประโยคที่คุณจะพูด…',
    sent: 'ส่งแล้ว นักกายภาพบำบัดอาวุโสของสาขาคุณจะเป็นคนตรวจ',
    queued: 'เก็บไว้ในเครื่องแล้ว จะส่งให้เองเมื่อมีสัญญาณ',
    nextCase: 'เคสถัดไป', allDone: 'ครบ 6 เคสแล้ว ขอบคุณมากค่ะ',
    allDoneBody: 'คำตอบอยู่ในข้อมูลของคลินิกแล้ว ในหมวดเวอร์ชัน 2 นักกายภาพบำบัดอาวุโสของสาขาจะตรวจในหน้าตรวจคำตอบ',
    branchOnly: (b: string) => `ตรวจโดยนักกายภาพบำบัดอาวุโสของสาขา ${b}`,
    notYourBranch: (b: string) => `คำตอบนี้ให้นักกายภาพบำบัดอาวุโสของสาขา ${b} เป็นคนตรวจ คุณอ่านได้แต่ให้คะแนนไม่ได้`,
    choicesRight: (r: number, t: number) => `ตอบตัวเลือกถูก ${r} จาก ${t} ข้อ`,
    modelAnswer: 'ตัวอย่างคำตอบที่ดี',
    theCase: 'ข้อมูลเคส',
    wrongOf: (w: number, n: number) => `ตอบผิด ${w} จาก ${n} ข้อ`,
    scoreOf: (r: number, t: number) => `ตอบตัวเลือกถูก ${r} จาก ${t} ข้อ`,
    noV2: 'ยังไม่มีคำตอบเวอร์ชัน 2'
  }
} satisfies Record<Lang, unknown>
