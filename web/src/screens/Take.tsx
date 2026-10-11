import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, MessageCircleQuestion, Eye, FileText, ImagePlus, ListChecks, Loader2, Lock, Mic, MicOff, Phone, Square, Trash2, Upload, X as XIcon, Image as ImageIcon, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { UI } from '@/lib/strings'
import { X } from '@/lib/extra'
import { BUCKETS } from '@/lib/cases'
import { clock, imgList, withImages, MAX_IMAGES, readFile, shrinkImage } from '@/lib/core'
import type { Trainer } from '@/lib/useTrainer'

function Section({ n, icon: Icon, title, children, tone = 'plain', locked }: {
  n?: number | string; icon: React.ElementType; title: string; children: React.ReactNode; tone?: 'plain' | 'reveal'; locked?: string
}) {
  return (
    <section className={cn('relative rounded-2xl border bg-white p-5 shadow-sm sm:p-7',
      tone === 'reveal' ? 'border-teal/60 bg-gradient-to-b from-teal-soft/70 to-white' : 'border-border')}>
      <div className="mb-4 flex items-center gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold',
          tone === 'reveal' ? 'bg-teal text-white' : 'bg-navy text-white')}>
          {n != null ? n : <Icon className="size-4" />}
        </span>
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-navy/70">
          {n != null && <Icon className="size-4 text-teal-dark" />}{title}
        </h2>
        {locked && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"><Lock className="size-3" /><span className="hidden sm:inline">{locked}</span></span>}
      </div>
      {children}
    </section>
  )
}

function Prompt({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 max-w-[62ch] text-[18px] font-medium leading-snug text-navy text-pretty">{children}</p>
}

// ---------------------------------------------------------------- answers
function LongAnswer({ tr, qid, locked }: { tr: Trainer; qid: string; locked: boolean }) {
  const t = UI[tr.lang], x = X[tr.lang]
  const text = String(tr.answers[qid + ':text'] || '')
  const audio = tr.answers[qid + ':audio'] as string | undefined
  const [dictating, setDictating] = useState(false)
  const [recSec, setRecSec] = useState<number | null>(null)
  const recRef = useRef<{ stop: () => void } | null>(null)
  const dictRef = useRef<{ stop: () => void } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null
  const canRecord = typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof MediaRecorder !== 'undefined'

  useEffect(() => () => { dictRef.current?.stop(); recRef.current?.stop() }, [])
  useEffect(() => { if (locked) { dictRef.current?.stop(); recRef.current?.stop() } }, [locked])

  const toggleDictation = () => {
    if (dictating) { dictRef.current?.stop(); return }
    if (!SR) return
    const rec = new SR()
    rec.lang = tr.lang === 'th' ? 'th-TH' : 'en-US'
    rec.continuous = true; rec.interimResults = false
    const base = text; let acc = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) acc += (acc || base ? ' ' : '') + e.results[i][0].transcript.trim()
      tr.setAnswer(qid + ':text', (base + (base && acc ? ' ' : '') + acc).trim())
    }
    rec.onerror = () => setDictating(false)
    rec.onend = () => { setDictating(false); dictRef.current = null }
    dictRef.current = { stop: () => { try { rec.onend = null; rec.stop() } catch { /* already stopped */ } setDictating(false); dictRef.current = null } }
    try { rec.start(); setDictating(true) } catch { dictRef.current = null }
  }

  const toggleRecording = async () => {
    if (recSec != null) { recRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      let mr: MediaRecorder
      try { mr = new MediaRecorder(stream, { mimeType: 'audio/webm', audioBitsPerSecond: 32000 }) } catch { mr = new MediaRecorder(stream, { audioBitsPerSecond: 32000 }) }
      const chunks: Blob[] = []
      const start = Date.now()
      const tick = setInterval(() => { const s = Math.round((Date.now() - start) / 1000); setRecSec(s); if (s >= 240) mr.stop() }, 500)
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
      mr.onstop = async () => {
        clearInterval(tick); stream.getTracks().forEach(tk => tk.stop())
        const secs = Math.max(1, Math.round((Date.now() - start) / 1000))
        const url = await readFile(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }))
        tr.setAnswers(a => ({ ...a, [qid + ':audio']: url, [qid + ':audiosec']: secs }))
        setRecSec(null); recRef.current = null
      }
      recRef.current = { stop: () => { try { mr.stop() } catch { /* stopped */ } } }
      mr.start(); setRecSec(0); tr.setError('')
    } catch { tr.setError(t.micDenied) }
  }

  return (
    <div className="space-y-3">
      <Textarea value={text} disabled={locked} onChange={e => tr.setAnswer(qid + ':text', e.target.value)} placeholder={t.longPh}
        className="min-h-44 rounded-xl bg-white text-base leading-relaxed" />
      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={toggleDictation} disabled={!SR}
            className={cn('h-10 rounded-full px-4', dictating && 'border-teal bg-teal-soft text-teal-dark')}>
            {dictating ? <><MicOff />{t.stopDictate}</> : <><Mic />{t.dictate}</>}
          </Button>
          <Button type="button" variant="outline" onClick={toggleRecording} disabled={!canRecord}
            className={cn('h-10 rounded-full px-4', recSec != null && 'border-red-300 bg-red-50 text-red-700')}>
            {recSec != null ? <><Square className="fill-current" />{t.stopRecord} · {clock(recSec)}</> : <><span className="size-2.5 rounded-full bg-red-500" />{t.record}</>}
          </Button>
          <span className="text-xs text-muted-foreground">{dictating ? t.listening : recSec != null ? t.recordingNow : !canRecord ? t.noRecord : x.typeOr}</span>
        </div>
      )}
      {audio && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <audio controls src={audio} className="h-10 max-w-full" />
          {!locked && <Button variant="ghost" size="sm" onClick={() => tr.setAnswers(a => { const n = { ...a }; delete n[qid + ':audio']; delete n[qid + ':audiosec']; return n })}
            className="text-destructive"><Trash2 />{t.removeAudio}</Button>}
        </div>
      )}
    </div>
  )
}

function ImageAnswer({ tr, qid }: { tr: Trainer; qid: string }) {
  const t = UI[tr.lang]
  const imgs = imgList(tr.answers, qid)
  const [drag, setDrag] = useState(false)
  const [url, setUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const add = (u: string) => tr.setAnswers(a => {
    const list = imgList(a, qid)
    if (list.indexOf(u) > -1) return a
    if (list.length >= MAX_IMAGES) { tr.setError(t.tooManyImages); return a }
    tr.setError('')
    return withImages(a, qid, list.concat([u]))
  })
  const addBlob = async (b: Blob) => add(await shrinkImage(await readFile(b)))
  const remove = (n: number) => tr.setAnswers(a => { const l = imgList(a, qid); l.splice(n, 1); return withImages(a, qid, l) })
  const useUrl = (raw: string) => {
    const u = raw.trim()
    if (u.indexOf('data:image') === 0) { add(u); return }
    if (!/^https?:\/\//i.test(u)) { tr.setError(t.badUrl); return }
    const probe = new Image()
    probe.onload = () => { setUrl(''); add(u) }
    probe.onerror = () => tr.setError(t.urlFailed)
    probe.src = u
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items || [])
    const blobs = items.filter(i => i.type.indexOf('image') === 0).map(i => i.getAsFile()).filter(Boolean) as Blob[]
    if (blobs.length) { e.preventDefault(); blobs.forEach(addBlob); return }
    const txt = (e.clipboardData.getData('text/plain') || '').trim()
    if (/^https?:\/\//i.test(txt) || txt.indexOf('data:image') === 0) { e.preventDefault(); useUrl(txt) }
  }
  return (
    <div className="space-y-4">
      <div tabIndex={0} onPaste={onPaste}
        onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false)
          const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.indexOf('image/') === 0)
          if (files.length) { files.forEach(addBlob); return }
          const dragged = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
          if (dragged && /^https?:/i.test(dragged.trim())) useUrl(dragged); else if (e.dataTransfer.files.length) tr.setError(t.dropNotImage)
        }}
        className={cn('flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center outline-none transition-colors focus-visible:border-teal',
          drag ? 'border-teal bg-teal-soft' : 'border-border bg-muted/30')}>
        <span className="grid size-12 place-items-center rounded-full bg-white text-teal-dark shadow-sm"><ImagePlus className="size-5" /></span>
        <p className="max-w-[48ch] text-sm leading-relaxed text-navy/75">{drag ? t.dropHere : t.pasteHelp}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={() => fileRef.current?.click()} disabled={imgs.length >= MAX_IMAGES} className="h-10 rounded-full px-4">
            <Upload />{imgs.length ? `${t.addImage} (${imgs.length}/${MAX_IMAGES})` : t.uploadBtn}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={e => { Array.from(e.target.files || []).forEach(addBlob); e.target.value = '' }} />
        </div>
        <p className="text-xs text-muted-foreground">{t.orPaste}</p>
        <div className="flex w-full max-w-md gap-2">
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" aria-label={t.urlLabel} className="h-10 rounded-full bg-white" />
          <Button type="button" variant="outline" onClick={() => useUrl(url)} className="h-10 rounded-full">{t.useUrl}</Button>
        </div>
      </div>
      {imgs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imgs.map((u, n) => (
            <figure key={n} className="group relative overflow-hidden rounded-xl border border-border bg-white shadow-sm">
              <img src={u} alt={'image ' + (n + 1)} className="aspect-[4/3] w-full object-cover" />
              <button type="button" onClick={() => remove(n)} aria-label={t.removeImage}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-navy shadow hover:bg-white"><XIcon className="size-4" /></button>
            </figure>
          ))}
        </div>
      )}
      <Textarea value={String(tr.answers[qid + ':text'] || '')} onChange={e => tr.setAnswer(qid + ':text', e.target.value)}
        placeholder={t.captionPh} className="min-h-28 rounded-xl bg-white text-base" />
    </div>
  )
}

// ---------------------------------------------------------------- the case
export function Take({ tr }: { tr: Trainer }) {
  const t = UI[tr.lang], x = X[tr.lang]
  const c = tr.current
  if (!c) return null
  const total = BUCKETS.length
  const pos = tr.qi + (tr.qiOffset || 0) + 1
  const mc = c.questions[0]
  const picked = tr.answers['q0:mc']
  const locked = tr.revealed

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6 sm:pt-10">
      {/* progress */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5" aria-label={`${t.caseOf} ${pos} ${t.of} ${total}`}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={cn('h-1.5 w-8 rounded-full', i < pos - 1 ? 'bg-teal' : i === pos - 1 ? 'bg-navy' : 'bg-border')} />
          ))}
        </div>
        <span className="text-sm font-medium text-navy">{t.caseOf} {pos} {t.of} {total}</span>
        <span className="text-xs text-muted-foreground">{x.trackLabel(c.level)}</span>
        <Button variant="ghost" onClick={tr.goHome} className="ml-auto h-9 text-navy/70"><Save />{t.saveExit}</Button>
      </div>
      <h1 className="mb-6 text-3xl font-semibold leading-tight text-navy text-balance sm:text-4xl">{c.title}</h1>

      <div className="space-y-5">
        <Section icon={FileText} title={x.stepChart}>
          {c.thPartial && <p className="mb-3 text-[13px] text-teal-dark">{x.thPartial}</p>}
          <p className="whitespace-pre-wrap rounded-xl border-l-4 border-teal bg-muted/40 p-4 text-[17px] leading-relaxed text-navy">{c.brief}</p>
        </Section>

        <Section n={1} icon={ListChecks} title={x.stepPlan} locked={locked ? x.locked : undefined}>
          <Prompt>{mc.prompt}</Prompt>
          <div role="radiogroup" className="space-y-2.5">
            {(mc.options || []).map((o, i) => {
              const on = picked === i
              const right = locked && mc.answer === i
              return (
                <button key={i} type="button" role="radio" aria-checked={on} disabled={locked}
                  onClick={() => tr.setAnswer('q0:mc', i)}
                  className={cn('flex w-full items-start gap-3 rounded-xl border p-4 text-left text-[15px] leading-relaxed transition-colors',
                    on ? 'border-teal bg-teal-soft' : 'border-border bg-white hover:border-teal/60',
                    right && 'ring-2 ring-teal/40', locked && !on && 'opacity-70')}>
                  <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-teal bg-teal' : 'border-input bg-white')}>
                    {on && <span className="size-2 rounded-full bg-white" />}
                  </span>
                  <span className="text-navy">{o}</span>
                  {right && <Check className="ml-auto mt-0.5 size-5 shrink-0 text-teal-dark" />}
                </button>
              )
            })}
          </div>
          {locked && mc.why && <p className="mt-4 rounded-xl bg-teal-soft/60 p-4 text-sm leading-relaxed text-navy/85">{mc.why}</p>}
        </Section>

        <Section n={2} icon={Phone} title={x.stepCall} locked={locked ? x.locked : undefined}>
          <Prompt>{c.questions[1].prompt}</Prompt>
          <LongAnswer tr={tr} qid="q1" locked={locked} />
        </Section>

        <Section n={3} icon={MessageCircleQuestion} title={x.stepWhy} locked={locked ? x.locked : undefined}>
          <Prompt>{c.questions[2].prompt}</Prompt>
          <LongAnswer tr={tr} qid="q2" locked={locked} />
        </Section>

        {!locked && (
          <div className="rounded-2xl border border-dashed border-teal/60 bg-white/60 p-5 text-center">
            <p className="mx-auto max-w-[56ch] text-sm leading-relaxed text-navy/70">{t.revealWarn}</p>
          </div>
        )}

        {locked && (
          <>
            <Section icon={Eye} title={x.stepReveal} tone="reveal">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-dark">{t.onTheCall}</p>
              <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-navy">{c.reveal}</p>
              <div className="my-5 h-px bg-teal/30" />
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-navy/60">{t.shouldHave}</p>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-navy/90">{c.model}</p>
            </Section>
            <Section n={4} icon={ImageIcon} title={x.stepVisual}>
              <Prompt>{c.questions[3].prompt}</Prompt>
              <ImageAnswer tr={tr} qid="q3" />
            </Section>
          </>
        )}
        {tr.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{tr.error}</p>}
      </div>

      {/* the next action stays in reach on a phone */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <p className="hidden flex-1 text-xs text-muted-foreground sm:block">{locked ? t.submitReady : t.revealWarn}</p>
          {!locked ? (
            <Button onClick={tr.reveal} className="h-12 flex-1 rounded-xl text-base font-semibold sm:flex-none sm:px-8">{t.nextStep}<ArrowRight /></Button>
          ) : (
            <Button onClick={() => tr.submit({ sent: x.sent, reached: x.reached, queuedBody: x.queuedBody })} disabled={tr.busy}
              className="h-12 flex-1 rounded-xl text-base font-semibold uppercase tracking-wide sm:flex-none sm:px-8">
              {tr.busy ? <><Loader2 className="animate-spin" />{t.sending}</> : <>{t.submit}<ArrowRight /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
