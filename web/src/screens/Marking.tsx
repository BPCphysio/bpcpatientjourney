import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, Download, FileJson, KeyRound, Loader2, LogOut, RefreshCw, Sparkles, Trash2, Users, Building2, TrendingDown, CheckCircle2, Circle, Volume2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MK, type Lang } from '@/lib/strings'
import { caseView } from '@/lib/cases'
import { folderKey, fmtWhen, fmtDay, clock, imgList, isListedMarker, canonical, DEFAULT_MARKERS, type Person, type Marker } from '@/lib/core'
import type { Marking, Resp, MarkEntry } from '@/lib/useMarking'

// ---------------------------------------------------------------- the door
export function Gate({ lang, m, roster, markers, onOpened, onBack }: {
  lang: Lang; m: Marking; roster: Person[]; markers: Marker[]; onOpened: () => void; onBack: () => void
}) {
  const mk = MK[lang]
  const [key, setKey] = useState('')
  const [who, setWho] = useState(m.markerName)
  const [msg, setMsg] = useState('')
  const [checking, setChecking] = useState(false)
  const list = markers.length ? markers : DEFAULT_MARKERS
  const chips = list.map(x => canonical(x.name, roster)).filter((n, i, a) => a.findIndex(y => folderKey(y) === folderKey(n)) === i)
  const go = async () => {
    if (!who.trim()) { setMsg(mk.markerNeeded); return }
    if (!isListedMarker(who, markers, roster)) { setMsg(mk.notMarker); return }
    m.setMarkerName(who)
    setChecking(true); setMsg('')
    const res = await m.open(key.trim(), canonical(who, roster))
    setChecking(false)
    if (res === 'ok') onOpened()
    else setMsg(res === 'bad' ? mk.badPass : res === 'notmarker' ? mk.notMarker
      : (lang === 'th' ? 'ติดต่อคลินิกไม่ได้ในขณะนี้ รอสักครู่แล้วลองอีกครั้ง' : 'Could not reach the clinic just now. Wait a moment and try again.'))
  }
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_8px_30px_-12px_rgba(31,36,76,0.18)] sm:p-8">
        <span className="grid size-12 place-items-center rounded-full bg-navy text-white"><KeyRound className="size-5" /></span>
        <h1 className="mt-4 text-2xl font-semibold text-navy">{mk.gateTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mk.gateBody}</p>
        <label className="mt-6 block text-sm font-medium text-navy" htmlFor="pc">{mk.passcode}</label>
        <Input id="pc" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder={mk.passcodePh}
          onKeyDown={e => { if (e.key === 'Enter') go() }} className="mt-2 h-12 rounded-xl text-base" />
        <p className="mt-5 text-sm font-medium text-navy">{mk.whoMarks}</p>
        <p className="mb-2 text-xs text-muted-foreground">{mk.tapName}</p>
        <div className="flex flex-wrap gap-1.5">
          {chips.map(n => {
            const on = folderKey(n) === folderKey(who)
            return <button key={n} type="button" onClick={() => setWho(n)}
              className={cn('min-h-9 rounded-full border px-3 text-sm transition-colors', on ? 'border-teal bg-teal text-white' : 'border-border bg-white text-navy hover:border-teal hover:bg-teal-soft')}>{n}</button>
          })}
        </div>
        {msg && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{msg}</p>}
        <Button onClick={go} disabled={checking || !key.trim()} className="mt-6 h-12 w-full rounded-xl text-base font-semibold">
          {checking ? <><Loader2 className="animate-spin" />{mk.checking}</> : mk.openMarking}
        </Button>
        <Button variant="ghost" onClick={onBack} className="mt-2 h-10 w-full text-navy/70">{mk.back}</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- helpers
const scoredMark = (e?: MarkEntry) => !!e && e.score !== undefined && e.score !== '' && e.score !== null
const isMarked = (r: Resp) => !!(r.markedAt || r.marks)

function Stat({ n, label }: { n: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className="text-2xl font-semibold text-navy">{n}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type + ';charset=utf-8' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// ---------------------------------------------------------------- the view
export function MarkingView({ lang, m, roster, markers, onLeave }: { lang: Lang; m: Marking; roster: Person[]; markers: Marker[]; onLeave: () => void }) {
  const mk = MK[lang]
  const [openBranch, setOpenBranch] = useState<string | null>(null)
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  const canon = (n: string) => canonical(n, roster)
  const mkList = markers.length ? markers : DEFAULT_MARKERS

  const data = useMemo(() => {
    const fmap: Record<string, { key: string; who: string; items: Resp[]; marked: number; last: number; cases: Record<string, 1>; branch?: string }> = {}
    m.resps.forEach(r => {
      const k = folderKey(r.person || r.who) || '(no name)'
      if (!fmap[k]) fmap[k] = { key: k, who: canonical(r.person || r.who, roster) || '(no name)', items: [], marked: 0, last: 0, cases: {} }
      const f = fmap[k]
      f.items.push(r)
      if (isMarked(r)) f.marked++
      if ((r.when || 0) > f.last) f.last = r.when || 0
      f.cases[r.scenarioId] = 1
      if (!f.branch && r.branch) f.branch = r.branch
    })
    const folders = Object.values(fmap).sort((a, b) => b.last - a.last)
    const bmap: Record<string, { key: string; name: string; people: typeof folders; answers: number; left: number }> = {}
    folders.forEach(f => {
      const key = f.branch || '(none)'
      if (!bmap[key]) bmap[key] = { key, name: f.branch || mk.noBranch, people: [], answers: 0, left: 0 }
      bmap[key].people.push(f); bmap[key].answers += f.items.length; bmap[key].left += f.items.length - f.marked
    })
    const branches = Object.values(bmap).sort((a, b) => Number(a.key === '(none)') - Number(b.key === '(none)') || b.answers - a.answers)
    // which cases the team gets wrong most often, by the multiple choice
    const perCase: Record<string, { title: string; n: number; wrong: number }> = {}
    m.resps.forEach(r => {
      const c = caseView(r.scenarioId, lang)
      if (!c || r.answers['q0:mc'] === undefined) return
      const p = perCase[r.scenarioId] || (perCase[r.scenarioId] = { title: c.title, n: 0, wrong: 0 })
      p.n++; if (String(r.answers['q0:mc']) !== String(c.questions[0].answer)) p.wrong++
    })
    const weak = Object.values(perCase).filter(c => c.n >= 2 && c.wrong > 0).sort((a, b) => b.wrong / b.n - a.wrong / a.n).slice(0, 4)
    return { fmap, folders, bmap, branches, weak }
  }, [m.resps, roster, lang, mk.noBranch])

  const openB = openBranch && data.bmap[openBranch] ? data.bmap[openBranch] : null
  const openF = openFolder && data.fmap[openFolder] ? data.fmap[openFolder] : null
  const peopleList = openB ? openB.people : data.folders
  const markersOf = (bk: string) => mkList.filter(x => folderKey(x.branch) === folderKey(bk)).map(x => canon(x.name))

  const personScore = (f: (typeof data.folders)[number]) => {
    let right = 0, total = 0, wSum = 0, wN = 0, wMarked = 0, autoN = 0
    f.items.forEach(r => {
      const c = caseView(r.scenarioId, 'en')
      if (!c) return
      if (r.answers['q0:mc'] !== undefined) { total++; if (String(r.answers['q0:mc']) === String(c.questions[0].answer)) right++ }
      const auto = m.graderOn ? m.autoFor(r, c.questions[0].answer) : null
      ;['q1', 'q2'].forEach(qk => {
        const e = (r.marks || {})[qk]
        if (scoredMark(e)) { wSum += Number(e.score) * 20; wN++; wMarked++ } else if (auto && auto[qk]) { wSum += auto[qk].pct; wN++; autoN++ }
      })
    })
    const pct = wN ? (right + wSum / 100) / (total + wN) : total ? right / total : 1
    return { right, total, pct, note: mk.scoreOf(right, total) + ' · ' + (wN ? mk.writtenAvg(Math.round(wSum / wN), wMarked, autoN) : mk.noMarksYet) }
  }

  const exportCsv = () => {
    const rows: (string | number)[][] = [['Name', 'Submitted', 'Case', 'Track', 'Level', 'Language', 'Question', 'Type', 'Answer', 'Score /5', 'Marker comment', 'Auto %', 'Auto suggests /5', 'Key points found', 'Auto read by', 'Marked by', 'Marked at (day/month/year)']]
    m.resps.forEach(r => {
      const c = caseView(r.scenarioId, 'en')
      const auto = m.graderOn && c ? m.autoFor(r, c.questions[0].answer) : null
      ;(c ? c.questions : []).forEach((qq, i) => {
        const e = { ...((r.marks || {})['q' + i] || {}), ...((m.pending[r.id] || {})['q' + i] || {}) }
        const ans = qq.type === 'mc' ? ((qq.options || [])[r.answers['q' + i + ':mc']] || '') : (r.answers['q' + i + ':text'] || '')
        const a = auto && auto['q' + i]
        rows.push([r.who, fmtWhen(r.when), r.scenarioTitle, r.track || '', r.level || '', r.language || 'en', qq.prompt, qq.type, ans,
          qq.type === 'mc' ? (String(r.answers['q' + i + ':mc']) === String(qq.answer) ? '1' : '0') : (e.score === undefined ? '' : e.score),
          e.comment || '', a ? a.pct : '', a ? a.suggested : '',
          a ? a.points.filter((p: { credit: number }) => p.credit).map((p: { credit: number; label: { en: string } }) => p.label.en + (p.credit < 1 ? ' (half)' : '')).join('; ') : '',
          a ? (a.source === 'claude' ? 'Claude' : a.source === 'model' ? 'language model' : 'wording') : '', r.markedBy || '', r.markedAt ? fmtWhen(r.markedAt) : ''])
      })
    })
    download('bpc-marks.csv', rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv')
  }

  const unmarked = m.resps.filter(r => !isMarked(r)).length
  const title = openF ? openF.who : openB ? openB.name : mk.submitted

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(openB || openF) && (
          <Button variant="ghost" className="h-9 px-2 text-navy/70" onClick={() => { if (openF) setOpenFolder(null); else setOpenBranch(null) }}>
            <ArrowLeft />{openF ? mk.allPeople.replace('← ', '') : mk.allBranches.replace('← ', '')}
          </Button>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-3 py-1 text-xs font-medium text-teal-dark">{mk.markingAs(m.markerName)}</span>
        <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={m.refresh} disabled={m.refreshing}>
          <RefreshCw className={cn(m.refreshing && 'animate-spin')} />{m.refreshing ? mk.loading : mk.refresh}
        </Button>
        <Button variant="ghost" size="sm" className="h-9 text-navy/70" onClick={() => { m.leave(); onLeave() }}><LogOut />{mk.leave}</Button>
      </div>
      <h1 className="text-3xl font-semibold text-navy sm:text-4xl">{title}</h1>
      {m.error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{m.error}</p>}

      {!openF && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat n={(openB ? openB.people : data.folders).length} label={mk.statPeople} />
            <Stat n={openB ? openB.answers : m.resps.length} label={mk.statIn} />
            <Stat n={openB ? openB.left : unmarked} label={mk.statToMark} />
            <Stat n={new Set((openB ? openB.people.flatMap(p => p.items) : m.resps).map((r: Resp) => r.scenarioId)).size} label={mk.statCases} />
          </div>

          {!openB && (
            <>
              <h2 className="mt-10 mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-navy/60"><Building2 className="size-4" />{mk.branches}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.branches.map(b => (
                  <button key={b.key} type="button" onClick={() => setOpenBranch(b.key)}
                    className="group rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal hover:shadow-md">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-semibold text-navy">{b.name}</span>
                      {b.left > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">{b.left} {mk.toMark}</span>
                        : <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-medium text-teal-dark">{mk.allMarked}</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{mk.branchMeta(b.people.length, b.answers, b.left)}</p>
                    {markersOf(b.key).length > 0 && <p className="mt-3 text-xs text-teal-dark">{mk.branchMarkers}{markersOf(b.key).join(' · ')}</p>}
                  </button>
                ))}
              </div>
              {data.weak.length > 0 && (
                <>
                  <h2 className="mt-10 mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-navy/60"><TrendingDown className="size-4" />{mk.weakest}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.weak.map(w => (
                      <div key={w.title} className="flex items-center gap-4 rounded-xl border border-border bg-white p-4">
                        <span className="text-2xl font-semibold text-red-600">{Math.round(w.wrong / w.n * 100)}%</span>
                        <div><div className="font-medium text-navy">{w.title}</div><div className="text-xs text-muted-foreground">{mk.wrongOf(w.wrong, w.n)}</div></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          <h2 className="mt-10 mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-navy/60"><Users className="size-4" />{mk.byPerson}</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            {peopleList.map(f => ({ f, s: personScore(f) })).sort((a, b) => a.s.pct - b.s.pct).map(({ f, s }, i) => (
              <button key={f.key} type="button" onClick={() => setOpenFolder(f.key)}
                className={cn('flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-teal-soft/50', i > 0 && 'border-t border-border')}>
                <span className="w-12 text-right text-lg font-semibold text-navy">{Math.round(s.pct * 100)}%</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-navy">{f.who}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.note}</div>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs', f.items.length - f.marked ? 'bg-amber-100 text-amber-900' : 'bg-teal-soft text-teal-dark')}>
                  {f.items.length - f.marked ? `${f.items.length - f.marked} ${mk.toMark}` : mk.allMarked}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <Button variant="outline" className="h-10 rounded-full" onClick={exportCsv}><Download />{mk.expCsv}</Button>
            <Button variant="outline" className="h-10 rounded-full" onClick={() => download('bpc-responses.json', JSON.stringify({ responses: m.resps }, null, 2), 'application/json')}><FileJson />{mk.expAll}</Button>
          </div>
        </>
      )}

      {openF && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">{openF.items.length} {openF.items.length === 1 ? mk.answer1 : mk.answerN} · {openF.items.length - openF.marked} {mk.toMark}</p>
          {openF.items.map(r => <AnswerCard key={r.id} lang={lang} m={m} r={r} />)}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- one answer
function AnswerCard({ lang, m, r }: { lang: Lang; m: Marking; r: Resp }) {
  const mk = MK[lang]
  const [open, setOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const c = caseView(r.scenarioId, lang)
  const mcAnswer = c ? c.questions[0].answer : undefined
  const auto = m.graderOn ? m.autoFor(r, mcAnswer) : null
  const marked = isMarked(r)
  const okMc = c && r.answers['q0:mc'] !== undefined && String(r.answers['q0:mc']) === String(c.questions[0].answer)
  const toggle = () => { const will = !open; setOpen(will); if (will) { m.hydrate(r); m.askClaude(r) } }

  return (
    <article className={cn('overflow-hidden rounded-2xl border bg-white shadow-sm', open ? 'border-teal/60' : 'border-border')}>
      <button type="button" onClick={toggle} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
        {marked ? <CheckCircle2 className="size-6 shrink-0 text-teal" /> : <Circle className="size-6 shrink-0 text-border" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-navy">{c ? c.title : r.scenarioTitle}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{fmtWhen(r.when)}</span>
            <span>{marked ? mk.marked : mk.unmarked}</span>
            {c && <span className={okMc ? 'text-teal-dark' : 'text-red-600'}>{okMc ? mk.correct : mk.incorrect}{mk.mcShort}</span>}
            {r.language === 'th' && <span>{mk.inThai.replace(' · ', '')}</span>}
            {auto && auto.pct != null && <span>{mk.autoShort(auto.pct)}</span>}
          </div>
        </div>
        <ChevronDown className={cn('size-5 shrink-0 text-navy/50 transition-transform', open && 'rotate-180')} />
      </button>

      {open && c && (
        <div className="space-y-5 border-t border-border p-4 sm:p-6">
          {r.markedAt && <p className="text-xs text-teal-dark">{r.markedBy ? mk.markedBy(r.markedBy, fmtWhen(r.markedAt)) : mk.markedWhen(fmtWhen(r.markedAt))}</p>}
          <details className="rounded-xl bg-muted/40 p-4">
            <summary className="cursor-pointer text-sm font-medium text-navy">{mk.theCase}</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-navy/85">{c.brief}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-teal-dark">{mk.theCall}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-navy/85">{c.reveal}</p>
          </details>

          {c.questions.map((qq, i) => {
            const qk = 'q' + i
            const e: MarkEntry = { ...((r.marks || {})[qk] || {}), ...((m.pending[r.id] || {})[qk] || {}) }
            const a = qq.type !== 'mc' && auto ? auto[qk] : null
            const imgs = imgList(r.answers, qk)
            const audio = r.answers[qk + ':audio']
            const ask = m.claude[r.id + qk] || ''
            const hasMark = scoredMark(e)
            const score = hasMark ? String(e.score) : a ? String(a.suggested) : ''
            return (
              <div key={qk} className="rounded-xl border border-border p-4">
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-navy px-2 py-0.5 font-medium text-white">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-muted-foreground">{qq.type === 'mc' ? mk.kMc : qq.type === 'long' ? mk.kLong : mk.kImage}</span>
                </div>
                <p className="text-[15px] font-medium leading-snug text-navy">{qq.prompt}</p>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-[15px] leading-relaxed whitespace-pre-wrap text-navy">
                  {qq.type === 'mc' ? ((qq.options || [])[r.answers[qk + ':mc']] ?? mk.noAnswer)
                    : (r.answers[qk + ':text'] || (audio ? mk.spokenOnly : imgs.length ? mk.imageOnly
                      : (r.media || []).some((k: string) => k.indexOf(qk) === 0) && !r.full ? (r.mediaErr ? mk.mediaErr : mk.loading) : mk.noAnswer))}
                </div>
                {qq.type === 'mc' && <p className={cn('mt-2 text-sm', okMc ? 'text-teal-dark' : 'text-red-600')}>{okMc ? mk.correct : mk.incorrect}{!okMc && <span className="text-navy/70"> · {mk.bestAnswer}{(qq.options || [])[qq.answer!]}</span>}</p>}
                {audio && <div className="mt-3 flex items-center gap-2"><Volume2 className="size-4 text-teal-dark" /><audio controls src={String(audio)} className="h-10 max-w-full" />{r.answers[qk + ':audiosec'] && <span className="text-xs text-muted-foreground">{clock(Number(r.answers[qk + ':audiosec']))}</span>}</div>}
                {imgs.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{imgs.map((u, n) => <img key={n} src={u} alt={'submitted visual ' + (n + 1)} className="w-full rounded-lg border border-border object-cover" />)}</div>}

                {qq.type !== 'mc' && (
                  <>
                    {ask === 'reading' && <p className="mt-3 flex items-center gap-2 text-sm text-teal-dark"><Loader2 className="size-4 animate-spin" />{mk.claudeReading}</p>}
                    {ask === 'credit' && <p className="mt-3 text-sm text-amber-800">{mk.claudeCredit}</p>}
                    {ask === 'failed' && <p className="mt-3 text-sm text-amber-800">{mk.claudeFailed}</p>}
                    {a && (
                      <div className={cn('mt-3 rounded-xl border p-4', a.source === 'claude' ? 'border-teal/50 bg-gradient-to-br from-teal-soft to-white' : 'border-border bg-muted/30')}>
                        <div className="flex flex-wrap items-center gap-2">
                          {a.source === 'claude' && <Sparkles className="size-4 text-teal-dark" />}
                          <span className="text-sm font-semibold text-navy">{mk.autoHead(a.pct, a.suggested)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{a.source === 'claude' ? mk.bySrcClaude(a.examples) : a.source === 'model' ? mk.bySrcModel : mk.bySrcWords}</p>
                        <ul className="mt-3 space-y-1.5">
                          {a.points.map((p: { credit: number; label: { en: string; th: string }; how: string; evidence: string }, n: number) => (
                            <li key={n} className="flex gap-2 text-sm leading-snug text-navy">
                              <span className="w-4 shrink-0 font-semibold">{p.credit >= 1 ? '✓' : p.credit > 0 ? '½' : '✗'}</span>
                              <span>{lang === 'th' ? p.label.th : p.label.en}{p.how === 'model' && p.evidence ? <span className="text-navy/60"> — {p.evidence}</span> : null}</span>
                            </li>
                          ))}
                        </ul>
                        {a.second && <p className="mt-2 text-xs text-muted-foreground">{a.second.source === 'model' ? mk.secondModel(a.second.pct) : mk.secondWords(a.second.pct)}{Math.abs(a.second.pct - a.pct) >= 40 ? mk.disagree : ''}</p>}
                        {a.source === 'claude' && a.comment && (
                          <div className="mt-4 rounded-lg bg-white/80 p-3">
                            <p className="text-xs font-semibold text-navy">{mk.claudeDraft}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-navy/85">{a.comment}</p>
                            <Button variant="outline" size="sm" className="mt-2 h-8 rounded-full" onClick={() => m.setMark(r.id, qk, 'comment', a.comment)}><Wand2 />{mk.useComment}</Button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-navy">{mk.scoreLabel}</p>
                        <div className="flex gap-1">
                          {['0', '1', '2', '3', '4', '5'].map(v => (
                            <button key={v} type="button" onClick={() => m.setMark(r.id, qk, 'score', v)}
                              className={cn('size-10 rounded-lg border text-sm font-semibold transition-colors',
                                score === v ? (hasMark ? 'border-navy bg-navy text-white' : 'border-teal bg-teal text-white') : 'border-border bg-white text-navy hover:border-teal')}>{v}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-navy">{mk.commentLabel}</p>
                        <Textarea value={e.comment || ''} onChange={ev => m.setMark(r.id, qk, 'comment', ev.target.value)} placeholder={mk.commentPh} className="min-h-20 rounded-lg bg-white" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => m.saveMarks(r, mcAnswer)} disabled={m.busy} className="h-11 rounded-xl px-6 font-semibold">{m.busy ? mk.saving : mk.saveMarks}</Button>
            <span className="text-sm text-teal-dark">{m.saved[r.id] || <span className="text-muted-foreground">{mk.onlyStaff}</span>}</span>
            <Button variant="ghost" className={cn('ml-auto h-9', confirmDel ? 'text-red-700' : 'text-navy/50')}
              onClick={() => { if (confirmDel) m.deleteResp(r.id); else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 4000) } }}>
              <Trash2 />{confirmDel ? mk.tapAgain : mk.del}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{r.readMs ? mk.readFor(clock(Math.round(r.readMs / 1000))) : mk.readNot} · {fmtDay(r.when)}</p>
        </div>
      )}
    </article>
  )
}
