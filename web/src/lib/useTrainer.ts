// The staff side of the trainer: who is answering, the set of four cases,
// answers kept on the device as they type, submitting, and the outbox that
// sends answers by itself when a phone had no signal. Ported from the first
// version, with the same device keys and the same records.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LS, load, loadStr, save, drop, canonical, folderKey, rememberName, newAttemptId,
  isMediaKey, clinicGet, clinicPost, q, type Answers, type Person, type Marker, DEFAULT_MARKERS
} from './core'
import { buildQueue, caseView, BUCKETS } from './cases'
import type { Lang } from './strings'

export type View = 'start' | 'take' | 'between' | 'done' | 'gate' | 'marker' | 'v2'

type Session = {
  taker: string; queue: string[]; qi: number; answers: Answers
  revealed: boolean; revealedAt: number; qiOffset: number; attemptId: string
}

export type Submission = {
  id: string; scenarioId: string; scenarioTitle: string; track: string; level: number
  who: string; when: number; language: Lang; answers: Answers; marks: null; readMs: number | null
}

function storedSession(): Session | null {
  const s = load<Session | null>(LS.session, null)
  return s && s.queue && s.queue.length && s.qi < s.queue.length ? s : null
}

export function useTrainer() {
  const [lang, setLangState] = useState<Lang>(() => (loadStr(LS.lang) === 'th' ? 'th' : 'en'))
  const [view, setView] = useState<View>('start')
  const [taker, setTaker] = useState(() => loadStr(LS.taker))
  const [names, setNames] = useState<string[]>(() => load<string[]>(LS.names, []))
  const [roster, setRoster] = useState<Person[]>(() => load<Person[]>(LS.roster, []))
  const [markers, setMarkersState] = useState<Marker[]>(() => {
    const m = load<Marker[]>(LS.markers, [])
    return m.length ? m : DEFAULT_MARKERS
  })
  const [done, setDone] = useState<string[]>(() => load<string[]>(LS.done, []))
  const [session, setSession] = useState<Session | null>(() => storedSession())
  const [queue, setQueue] = useState<string[]>([])
  const [qi, setQi] = useState(0)
  const [qiOffset, setQiOffset] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [revealed, setRevealed] = useState(false)
  const [revealedAt, setRevealedAt] = useState(0)
  const [attemptId, setAttemptId] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [thanks, setThanks] = useState<{ body: string; queued: boolean }>({ body: '', queued: false })
  const [pending, setPending] = useState(() => load<Submission[]>(LS.outbox, []).length)

  const canon = useCallback((n: string) => canonical(n, roster), [roster])

  const setLang = (l: Lang) => { save(LS.lang, l); setLangState(l) }

  // ---- the clinic's lists (names on the first screen, markers) ----
  const grabRoster = useCallback(async () => {
    try {
      const d = await clinicGet('roster=1')
      if (d && d.ok && Array.isArray(d.people) && d.people.length) { setRoster(d.people); save(LS.roster, d.people) }
      if (d && d.ok && Array.isArray(d.markers)) { setMarkersState(d.markers); save(LS.markers, d.markers) }
    } catch { /* the cached copy stands */ }
  }, [])
  useEffect(() => { grabRoster() }, [grabRoster])

  // ---- saving the set as they go ----
  const persist = useCallback((patch?: Partial<Session>) => {
    const rec: Session = { taker: taker.trim(), queue, qi, answers, revealed, revealedAt, qiOffset, attemptId, ...(patch || {}) }
    if (!save(LS.session, rec)) {
      // a full device: keep the words, drop the pictures and recordings
      const lean: Answers = {}
      Object.keys(rec.answers || {}).forEach(k => { if (!isMediaKey(k)) lean[k] = rec.answers[k] })
      save(LS.session, { ...rec, answers: lean })
    }
    return rec
  }, [taker, queue, qi, answers, revealed, revealedAt, qiOffset, attemptId])

  useEffect(() => { if (view === 'take' && queue.length) persist() }, [answers, revealed, view, queue.length, persist])

  const current = queue[qi] ? caseView(queue[qi], lang) : null

  const setAnswer = (k: string, v: string | number | null) =>
    setAnswers(a => { const n = { ...a }; if (v == null || v === '') delete n[k]; else n[k] = v; return n })

  // ---- starting, resuming, moving on ----
  const startTake = (s: Session) => {
    setQueue(s.queue); setQi(s.qi || 0); setAnswers(s.answers || {}); setRevealed(!!s.revealed)
    setRevealedAt(s.revealedAt || 0); setQiOffset(s.qiOffset || 0); setAttemptId(s.attemptId || newAttemptId())
    setError(''); setView('take'); window.scrollTo(0, 0)
  }
  const resume = () => { if (session) { if (session.taker) setTaker(session.taker); startTake(session) } }
  const startFresh = () => { drop(LS.session); setSession(null) }

  const begin = async () => {
    const name = taker.trim()
    if (!name) return
    save(LS.taker, name)
    setNames(rememberName(name))
    const sess = storedSession()
    // the same person's unfinished set: carry on rather than start again
    if (sess && folderKey(canon(sess.taker)) === folderKey(canon(name))) { startTake(sess); return }
    let doneList = done
    setChecking(true); setError('')
    try {
      const d = await clinicGet(q({ who: canon(name) }), 20000)
      if (d && d.ok && Array.isArray(d.done)) doneList = d.done.filter((id: string) => id.indexOf('v2-') !== 0)
    } catch { /* the device's own list stands */ }
    setChecking(false)
    setDone(doneList)
    const offset = doneList.length % BUCKETS.length
    startTake({ taker: name, queue: buildQueue(offset, doneList), qi: 0, answers: {}, revealed: false, revealedAt: 0, qiOffset: offset, attemptId: newAttemptId() })
  }

  const reveal = () => { const at = Date.now(); setRevealed(true); setRevealedAt(at); persist({ revealed: true, revealedAt: at }); window.scrollTo({ top: document.body.scrollHeight * 0.5, behavior: 'smooth' }) }

  const next = () => {
    const n = qi + 1
    if (n >= queue.length) { drop(LS.session); setSession(null); setView('done'); return }
    setQi(n); setAnswers({}); setRevealed(false); setRevealedAt(0); setError(''); setView('take')
    window.scrollTo(0, 0)
  }
  const moreCases = () => {
    startTake({ taker, queue: buildQueue(0, done), qi: 0, answers: {}, revealed: false, revealedAt: 0, qiOffset: 0, attemptId: newAttemptId() })
  }
  const goHome = () => {
    const rec = view === 'take' ? persist() : storedSession()
    setSession(rec && rec.queue && rec.queue.length && rec.qi < rec.queue.length ? rec : null)
    setView('start'); setError(''); window.scrollTo(0, 0)
  }
  const finish = () => { drop(LS.session); setSession(null); setQueue([]); setQi(0); setAnswers({}); setView('start') }

  // ---- the outbox: answers that could not be sent yet ----
  const draining = useRef(false)
  const landed = async (id: string) => {
    for (let i = 0; i < 2; i++) {
      try { const d = await clinicGet(q({ exists: id }), 15000); if (d && d.ok) return !!d.exists } catch { /* try again */ }
    }
    return false
  }
  const drainOutbox = useCallback(async () => {
    if (draining.current) return
    let list = load<Submission[]>(LS.outbox, [])
    setPending(list.length)
    if (!list.length) return
    draining.current = true
    try {
      for (const r of list.slice()) {
        let gone = await landed(r.id)
        if (!gone) {
          try { const d = await clinicPost({ response: r }); if (d && d.ok) gone = true } catch { gone = await landed(r.id) }
        }
        if (gone) { list = load<Submission[]>(LS.outbox, []).filter(x => x.id !== r.id); save(LS.outbox, list); setPending(list.length) }
      }
    } finally { draining.current = false }
  }, [])
  useEffect(() => {
    const t = setTimeout(drainOutbox, 3000)
    const every = setInterval(drainOutbox, 60000)
    window.addEventListener('online', drainOutbox)
    return () => { clearTimeout(t); clearInterval(every); window.removeEventListener('online', drainOutbox) }
  }, [drainOutbox])

  // ---- submitting one case ----
  const submit = async (strings: { sent: string; reached: string; queuedBody: string }) => {
    if (!current) return
    const id = attemptId || newAttemptId()
    const r: Submission = {
      id, scenarioId: current.id, scenarioTitle: (caseView(current.id, 'en') || current).title, track: current.track, level: current.level,
      who: canon(taker.trim()) || 'Anonymous', when: Date.now(), language: lang, answers, marks: null,
      readMs: revealedAt ? Math.max(0, Date.now() - revealedAt) : null
    }
    save(LS.taker, r.who)
    setNames(rememberName(r.who))
    const nextDone = done.indexOf(current.id) < 0 ? done.concat([current.id]) : done
    setDone(nextDone); save(LS.done, nextDone)
    const last = qi + 1 >= queue.length
    const advance = () => {
      const nid = newAttemptId()
      setRevealed(false); setRevealedAt(0); setAttemptId(nid)
      if (last) drop(LS.session)
      else save(LS.session, { taker: taker.trim(), queue, qi: qi + 1, answers: {}, revealed: false, revealedAt: 0, qiOffset, attemptId: nid })
    }
    setBusy(true); setError('')
    try {
      const d = await clinicPost({ response: r })
      if (!d || !d.ok) throw new Error((d && d.error) || 'refused')
      advance(); setThanks({ body: strings.sent, queued: false })
    } catch {
      if (await landed(id)) { advance(); setThanks({ body: strings.reached, queued: false }) }
      else {
        const list = load<Submission[]>(LS.outbox, []).filter(x => x.id !== r.id)
        list.push(r); save(LS.outbox, list); setPending(list.length)
        advance(); setThanks({ body: strings.queuedBody, queued: true })
      }
    }
    setBusy(false); setView('between'); window.scrollTo(0, 0)
  }

  return {
    lang, setLang, view, setView, taker, setTaker, names, roster, markers, done, session, queue, qi, qiOffset,
    answers, setAnswer, setAnswers, revealed, reveal, current, busy, checking, error, setError, thanks, pending,
    begin, resume, startFresh, next, moreCases, goHome, finish, submit, canon, grabRoster
  }
}

export type Trainer = ReturnType<typeof useTrainer>
