// The marking view: the passcode at the door, the answer list (shown at once
// from the last visit, refreshed behind), pictures and recordings fetched when
// an answer is opened, Claude's readings, saving marks (confirmed by id),
// deleting, and exports. Same clinic API and records as the first version.
import { useCallback, useEffect, useRef, useState } from 'react'
import { LS, load, loadStr, save, drop, passcodeKnown, clinicGet, clinicPost, q, isListedMarker, canonical, type Json, type Person, type Marker } from './core'
import { MK, type Lang } from './strings'
import { isV2, v2View, writtenKeys } from './v2'

// Version 2 has no wording grader: the suggestion on each written answer is
// Claude's reading, in the same shape the grader gives.
function fromClaude(r: Resp) {
  const en = v2View(r.scenarioId, 'en'), th = v2View(r.scenarioId, 'th')
  if (!en || !th) return null
  const out: Record<string, Json> = {}
  en.questions.forEach((q, i) => {
    const c = r.ai && r.ai['c' + q.qk]
    if (q.type === 'mc' || !c) return
    const labels = (q.points || []).map((p, n) => ({ en: p, th: (th.questions[i].points || [])[n] || p }))
    out[q.qk] = {
      source: 'claude', pct: Number(c.score) * 20, suggested: Number(c.score), comment: c.comment || '', examples: c.examples || 0,
      points: (c.credits || []).map((credit: number, n: number) => ({ credit, label: labels[n] || { en: (c.notes || [])[n] || '', th: (c.notes || [])[n] || '' }, how: 'model', evidence: (c.notes || [])[n] || '' }))
    }
  })
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { BPCGrader?: any } }

export type Resp = Json
export type MarkEntry = { score?: string; comment?: string; auto?: number; autoBy?: string; commentBy?: string }

// The wording grader (grading/grader.js) sits beside the site; it turns the
// stored readings into the suggestion shown on each written answer.
function loadGrader(): Promise<boolean> {
  return new Promise(done => {
    if (window.BPCGrader) { if (window.BPCGrader.loaded()) return done(true); window.BPCGrader.ready('/grading/answers.json').then(() => done(true), () => done(false)); return }
    const s = document.createElement('script')
    s.src = '/grading/grader.js'
    s.onload = () => window.BPCGrader ? window.BPCGrader.ready('/grading/answers.json').then(() => done(true), () => done(false)) : done(false)
    s.onerror = () => done(false)
    document.head.appendChild(s)
  })
}

export function useMarking(lang: Lang, roster: Person[], markers: Marker[]) {
  const mk = MK[lang]
  const [adminKey, setAdminKey] = useState('')
  const [markerName, setMarkerNameState] = useState(() => loadStr(LS.marker))
  const [resps, setResps] = useState<Resp[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [graderOn, setGraderOn] = useState(false)
  const [pending, setPending] = useState<Record<string, Record<string, MarkEntry>>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [claude, setClaude] = useState<Record<string, string>>({})
  const autoCache = useRef<Record<string, Json>>({})
  const claudeOff = useRef<string>('')
  const [, bump] = useState(0)

  const canon = useCallback((n: string) => canonical(n, roster), [roster])
  const setMarkerName = (n: string) => { const c = canon(n.trim()); if (c) save(LS.marker, c); else drop(LS.marker); setMarkerNameState(c) }

  // ---- in at the door ----
  const open = useCallback(async (key: string, who: string): Promise<'ok' | 'bad' | 'notmarker' | 'offline'> => {
    if (!isListedMarker(who, markers, roster)) return 'notmarker'
    const known = await passcodeKnown(key)
    if (known) {
      setResps(load<Resp[]>(LS.list, []))
      setAdminKey(key); save(LS.admin, key)
      loadGrader().then(ok => { setGraderOn(ok); autoCache.current = {}; bump(x => x + 1) })
    } else setBusy(true)
    setRefreshing(true); setError('')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const d = await clinicGet(q({ key }), 30000)
        if (d && d.ok) {
          setResps(d.responses || []); save(LS.list, d.responses || [])
          setAdminKey(key); save(LS.admin, key); setRefreshing(false); setBusy(false)
          autoCache.current = {}
          if (!known) loadGrader().then(ok => { setGraderOn(ok); bump(x => x + 1) })
          clinicPost({ action: 'visit', key, by: who }).catch(() => {})
          return 'ok'
        }
        if (d && String(d.error || '').indexOf('bad key') > -1) {
          setRefreshing(false); setBusy(false); setAdminKey(''); drop(LS.admin); return 'bad'
        }
      } catch { /* try again */ }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
    }
    setRefreshing(false); setBusy(false)
    if (known) { setError(lang === 'th' ? 'ยังดึงคำตอบล่าสุดจากคลินิกไม่ได้ ที่เห็นอยู่คือรายการจากครั้งก่อน กด “รีเฟรช” อีกครั้งในอีกสักครู่' : 'Could not fetch the newest answers from the clinic yet. You are seeing the list from your last visit. Tap Refresh again in a moment.'); return 'ok' }
    return 'offline'
  }, [markers, roster, lang])

  const leave = () => { drop(LS.admin); setAdminKey(''); setResps([]) }
  const refresh = () => open(adminKey, markerName)

  // ---- one answer opened: its pictures and recordings, and Claude ----
  const hydrating = useRef<Record<string, boolean>>({})
  const hydrate = useCallback(async (r: Resp) => {
    if (!r || r.full || hydrating.current[r.id]) return
    hydrating.current[r.id] = true
    const merge = (ans: Json, patch?: Json) => setResps(list => list.map(x => x.id === r.id ? { ...x, answers: { ...x.answers, ...(ans || {}) }, ...(patch || {}) } : x))
    try {
      let failed = 0
      const media: string[] = (r.media || []).slice().sort((a: string, b: string) => (/:img\d*$/.test(a) ? 0 : 1) - (/:img\d*$/.test(b) ? 0 : 1))
      for (const k of media) {
        try {
          const d = await clinicGet(q({ key: adminKey, id: r.id, k }), 30000)
          if (d && d.ok && d.value != null) merge({ [d.key || k]: d.value }); else failed++
        } catch { failed++ }
      }
      merge(null, failed ? { mediaErr: true } : { full: true, mediaErr: false })
    } finally { hydrating.current[r.id] = false }
  }, [adminKey])

  const askClaude = useCallback(async (r: Resp) => {
    if (claudeOff.current) return
    const scored = (m: MarkEntry | undefined) => m && m.score !== undefined && m.score !== '' && m.score !== null
    const v2 = isV2(r.scenarioId) ? v2View(r.scenarioId, 'en') : null
    const keys = v2 ? writtenKeys(v2) : ['q1', 'q2', 'q3']
    const parts = keys.filter(qk => !scored((r.marks || {})[qk]) &&
      (String(r.answers[qk + ':text'] || '').trim().length > 2 || (r.media || []).some((k: string) => k.indexOf(qk + ':img') === 0)))
    if (!parts.length) return
    const note = (v: string) => setClaude(c => { const n = { ...c }; parts.forEach(qk => { n[r.id + qk] = v }); return n })
    if (parts.some(qk => !(r.ai && r.ai['c' + qk]))) note('reading')
    let d: Json = null
    try { d = await clinicPost({ action: 'regrade', key: adminKey, id: r.id }, 170000) } catch { d = null }
    if (!d || !d.ok) {
      const err = d && d.error
      if (err === 'not configured' || err === 'credit') claudeOff.current = err
      note(err === 'credit' ? 'credit' : err === 'not configured' ? '' : (r.ai && parts.every(qk => r.ai['c' + qk]) ? '' : 'failed'))
      return
    }
    autoCache.current = {}
    setResps(list => list.map(x => x.id === r.id ? { ...x, ai: { ...(x.ai || {}), ...(d.ai || {}) } } : x))
    note('')
  }, [adminKey])

  // ---- the suggestion on each written answer ----
  const autoFor = useCallback((r: Resp, mcAnswer?: number) => {
    if (r && isV2(r.scenarioId)) return fromClaude(r)
    const G = window.BPCGrader
    if (!r || !G || !G.loaded()) return null
    const cacheKey = r.id + JSON.stringify(r.ai || {}).length
    if (autoCache.current[cacheKey]) return autoCache.current[cacheKey]
    const g = G.gradeResponse(r, mcAnswer)
    autoCache.current[cacheKey] = g
    return g
  }, [])

  // ---- marking ----
  const setMark = (rid: string, qk: string, field: keyof MarkEntry, val: string) => {
    setPending(p => ({ ...p, [rid]: { ...(p[rid] || {}), [qk]: { ...((p[rid] || {})[qk] || {}), [field]: val } } }))
    setSaved(s => ({ ...s, [rid]: '' }))
  }

  const saveLanded = async (rid: string, saveId: string) => {
    try { const d = await clinicGet(q({ key: adminKey, id: rid, saved: '1' }), 30000); return !!(d && d.ok && d.saveId === saveId) } catch { return false }
  }

  const saveMarks = async (r: Resp, mcAnswer: number | undefined) => {
    if (!markerName.trim()) { setError(mk.markerNeeded); return }
    if (!isListedMarker(markerName, markers, roster)) { setError(mk.notMarker); return }
    // the server replaces the whole set: send what was saved, what changed,
    // and for a written answer nobody touched, the suggested mark showing
    const marks: Record<string, MarkEntry> = {}
    Object.keys(r.marks || {}).forEach(k => { marks[k] = { ...r.marks[k] } })
    const pend = pending[r.id] || {}
    Object.keys(pend).forEach(k => { marks[k] = { ...(marks[k] || {}), ...pend[k] } })
    const auto = autoFor(r, mcAnswer)
    if (auto) Object.keys(auto).filter(k => /^q\d+$/.test(k)).forEach(k => {
      const g = auto[k]
      if (!g) return
      const m = { ...(marks[k] || {}) }
      if (m.score === undefined || m.score === '') m.score = String(g.suggested)
      m.auto = g.pct; m.autoBy = g.source || 'wording'
      if (g.source === 'claude' && g.comment && String(m.comment || '').trim() === g.comment.trim()) m.commentBy = 'claude'
      else delete m.commentBy
      marks[k] = m
    })
    setBusy(true); setError(''); setSaved(s => ({ ...s, [r.id]: '' }))
    const by = markerName
    const saveId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    let ok = false, last = ''
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        const d = await clinicPost({ action: 'mark', key: adminKey, id: r.id, marks, by, saveId }, 45000)
        if (d && d.ok) ok = true
        else { last = (d && d.error) || 'refused'; if (/bad key|not found|not a marker|not your branch/.test(last)) break }
      } catch { last = 'timed out' }
      if (!ok && await saveLanded(r.id, saveId)) ok = true
      if (!ok) await new Promise(res => setTimeout(res, 3000 * (i + 1)))
    }
    setBusy(false)
    if (ok) {
      const now = Date.now()
      setResps(list => list.map(x => x.id === r.id ? { ...x, marks, markedAt: now, markedBy: by, markHistory: (x.markHistory || []).concat([{ by, at: now }]) } : x))
      setPending(p => { const n = { ...p }; delete n[r.id]; return n })
      setSaved(s => ({ ...s, [r.id]: lang === 'th' ? 'บันทึกคะแนนลงข้อมูลคลินิกแล้ว' : 'Marks saved to the clinic record.' }))
      return true
    }
    setError(/not a marker/.test(last) ? mk.notMarker : lang === 'th'
      ? 'ยังยืนยันไม่ได้ว่าบันทึกคะแนนแล้ว คะแนนยังอยู่บนหน้าจอนี้ กดบันทึกคะแนนอีกครั้งในอีกหนึ่งนาที'
      : 'Could not confirm the marks were saved. Your marks are still on this screen; tap Save marks again in a minute.')
    return false
  }

  const deleteResp = async (rid: string) => {
    setBusy(true)
    try {
      const d = await clinicPost({ action: 'delete', key: adminKey, id: rid })
      if (d && d.ok) setResps(list => list.filter(x => x.id !== rid))
      else setError(lang === 'th' ? 'ลบไม่สำเร็จ ลองอีกครั้ง' : 'Could not delete; try again.')
    } catch { setError(lang === 'th' ? 'ลบไม่สำเร็จ ลองอีกครั้ง' : 'Could not delete; try again.') }
    setBusy(false)
  }

  // a remembered passcode and name open the view directly
  const tried = useRef(false)
  useEffect(() => {
    if (tried.current) return
    tried.current = true
    const key = loadStr(LS.admin)
    if (key && markerName) open(key, markerName)
  }, [open, markerName])

  return {
    adminKey, markerName, setMarkerName, resps, refreshing, busy, error, setError, graderOn, pending, saved, claude,
    open, leave, refresh, hydrate, askClaude, autoFor, setMark, saveMarks, deleteResp
  }
}

export type Marking = ReturnType<typeof useMarking>
