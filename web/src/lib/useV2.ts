// Version 2 for the seniors testing it: a set of six cases, answered part by
// part (each reveal locks what came before), kept on the device as they type,
// and sent to the same clinic record as version 1. Unsent answers go into the
// same outbox, which the trainer empties by itself when there is signal.
import { useEffect, useState } from 'react'
import { load, save, drop, newAttemptId, isMediaKey, clinicGet, clinicPost, q, LS, type Answers } from './core'
import { v2View, buildV2Set, isV2, V2X, type V2Case } from './v2'
import type { Submission } from './useTrainer'
import type { Lang } from './strings'

const KEY = 'bpc_pj_v2_session'
type Session = { taker: string; queue: string[]; qi: number; phase: number; answers: Answers; attemptId: string }

function stored(taker: string): Session | null {
  const s = load<Session | null>(KEY, null)
  return s && s.queue && s.qi < s.queue.length && s.taker === taker ? s : null
}

export function useV2(lang: Lang, taker: string) {
  const [sess, setSess] = useState<Session | null>(() => stored(taker))
  const [stage, setStage] = useState<'intro' | 'take' | 'sent' | 'done'>('intro')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentNote, setSentNote] = useState('')

  const put = (s: Session | null) => { if (!s) drop(KEY); setSess(s) }
  // every change is kept on the device straight away
  useEffect(() => {
    if (!sess) return
    if (!save(KEY, sess)) {
      const lean: Answers = {}
      Object.keys(sess.answers).forEach(k => { if (!isMediaKey(k)) lean[k] = sess.answers[k] })
      save(KEY, { ...sess, answers: lean })
    }
  }, [sess])

  const current: V2Case | null = sess && sess.queue[sess.qi] ? v2View(sess.queue[sess.qi], lang) : null
  const answers = sess ? sess.answers : {}

  // the same calls the version 1 answer boxes use
  const setAnswers = (f: (a: Answers) => Answers) => setSess(s => (s ? { ...s, answers: f(s.answers) } : s))
  const setAnswer = (k: string, v: string | number | null) =>
    setAnswers(a => { const n = { ...a }; if (v == null || v === '') delete n[k]; else n[k] = v; return n })

  const start = async () => {
    setBusy(true); setError('')
    let done: string[] = []
    try { const d = await clinicGet(q({ who: taker }), 15000); if (d && d.ok && Array.isArray(d.done)) done = d.done.filter(isV2) } catch { /* fresh set anyway */ }
    setBusy(false)
    put({ taker, queue: buildV2Set(done), qi: 0, phase: 0, answers: {}, attemptId: newAttemptId() })
    setStage('take'); window.scrollTo(0, 0)
  }
  const resume = () => { setStage('take'); window.scrollTo(0, 0) }
  const fresh = () => { put(null) }

  const nextPhase = () => {
    if (!sess) return
    put({ ...sess, phase: sess.phase + 1 })
    setTimeout(() => {
      const el = document.querySelector('[data-phase="' + (sess.phase + 1) + '"]')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const landed = async (id: string) => {
    try { const d = await clinicGet(q({ exists: id }), 15000); return !!(d && d.ok && d.exists) } catch { return false }
  }

  const submit = async () => {
    if (!sess || !current) return
    const en = v2View(current.id, 'en')!
    const r: Submission = {
      id: sess.attemptId, scenarioId: current.id, scenarioTitle: en.title, track: 'V2 · ' + V2X.en.kind[current.kind], level: 0,
      who: taker, when: Date.now(), language: lang, answers: sess.answers, marks: null, readMs: null
    }
    const advance = () => {
      const qi = sess.qi + 1
      put(qi >= sess.queue.length ? null : { ...sess, qi, phase: 0, answers: {}, attemptId: newAttemptId() })
      setStage(qi >= sess.queue.length ? 'done' : 'sent'); window.scrollTo(0, 0)
    }
    setBusy(true); setError('')
    try {
      const d = await clinicPost({ response: r })
      if (!d || !d.ok) throw new Error((d && d.error) || 'refused')
      setSentNote(V2X[lang].sent); advance()
    } catch {
      if (await landed(r.id)) { setSentNote(V2X[lang].sent); advance() }
      else {
        const list = load<Submission[]>(LS.outbox, []).filter(x => x.id !== r.id)
        list.push(r); save(LS.outbox, list)
        setSentNote(V2X[lang].queued); advance()
      }
    }
    setBusy(false)
  }

  return {
    lang, taker, sess, stage, setStage, current, answers, setAnswer, setAnswers, setError, error, busy, sentNote,
    start, resume, fresh, nextPhase, submit
  }
}

export type V2 = ReturnType<typeof useV2>
