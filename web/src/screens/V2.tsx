import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardList, Eye, FlaskConical, Loader2, MessageCircle, StickyNote, Image as ImageIcon, ListChecks, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Section, Prompt, LongAnswer, ImageAnswer } from '@/screens/Take'
import { V2X, type V2Q, type V2Step } from '@/lib/v2'
import type { V2 } from '@/lib/useV2'

// ---------------------------------------------------------------- pieces
function Chat({ s }: { s: Extract<V2Step, { t: 'chat' }> }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-[#06c755]/10 px-5 py-3">
        <MessageCircle className="size-5 text-[#06a648]" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-navy/70">{s.label}</p>
          <p className="text-sm text-navy">{s.meta}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 bg-[#eef2f6] p-4 sm:p-5" role="log">
        {s.msgs.map((m, i) => {
          if (m.from === 'sys') return <p key={i} className="self-center rounded-full bg-white/80 px-3 py-1 text-xs text-muted-foreground">{m.text}</p>
          const mine = m.from === 'rc' || m.from === 'you'
          const showName = i === 0 || s.msgs[i - 1].from !== m.from
          return (
            <div key={i} className={cn('flex max-w-[85%] flex-col', mine ? 'self-end items-end' : 'self-start items-start')}>
              {showName && <span className="mb-0.5 px-1 text-[11px] text-muted-foreground">{m.name}</span>}
              <p className={cn('whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed text-navy shadow-sm',
                mine ? 'rounded-br-md bg-[#c9f2c7]' : 'rounded-bl-md bg-white')}>{m.text}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const QICON = { mc: ListChecks, long: PenLine, short: PenLine, image: ImageIcon }

function Question({ v, q, locked }: { v: V2; q: V2Q; locked: boolean }) {
  const x = V2X[v.lang]
  const picked = v.answers[q.qk + ':mc']
  return (
    <Section n={q.n} icon={QICON[q.type]} title={q.stage} locked={locked ? ' ' : undefined}>
      <Prompt>{q.prompt}</Prompt>
      {q.type === 'mc' && (
        <>
          <div role="radiogroup" className="space-y-2.5">
            {(q.options || []).map((o, i) => {
              const on = picked === i
              const right = locked && q.answer === i
              return (
                <button key={i} type="button" role="radio" aria-checked={on} disabled={locked}
                  onClick={() => v.setAnswer(q.qk + ':mc', i)}
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
          {locked && q.why && <p className="mt-4 rounded-xl bg-teal-soft/60 p-4 text-sm leading-relaxed text-navy/85">{q.why}</p>}
        </>
      )}
      {(q.type === 'long' || q.type === 'short') && <LongAnswer tr={v} qid={q.qk} locked={locked} small={q.type === 'short'} ph={q.type === 'short' ? x.shortPh : x.yourAnswerPh} />}
      {q.type === 'image' && <ImageAnswer tr={v} qid={q.qk} locked={locked} />}
      {locked && q.type !== 'mc' && q.model && (
        <div className="mt-4 rounded-xl bg-teal-soft/60 p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-dark">{x.modelAnswer}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy/85">{q.model}</p>
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------- screens
export function V2Screen({ v, onBack }: { v: V2; onBack: () => void }) {
  const x = V2X[v.lang]
  const sess = v.sess

  if (v.stage === 'intro' || (v.stage === 'take' && !v.current)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <Button variant="ghost" className="mb-4 h-9 px-2 text-navy/70" onClick={onBack}><ArrowLeft />{x.backToMarking}</Button>
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
          <span className="grid size-12 place-items-center rounded-full bg-navy text-white"><FlaskConical className="size-5" /></span>
          <h1 className="mt-4 text-3xl font-semibold text-navy">{x.v2}</h1>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-navy/80">{x.v2Intro}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {(['call', 'journey', 'line'] as const).map(k => <span key={k} className="rounded-full bg-teal-soft px-3 py-1 text-sm text-teal-dark">2 × {x.kind[k]}</span>)}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">{x.answeringAs(v.taker)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sess ? (
              <>
                <Button className="h-12 rounded-xl px-6 text-base font-semibold" onClick={v.resume}>{x.resumeSet(sess.qi + 1)}<ArrowRight /></Button>
                <Button variant="outline" className="h-12 rounded-xl" onClick={() => { v.fresh(); v.start() }}>{x.newSet}</Button>
              </>
            ) : (
              <Button className="h-12 rounded-xl px-6 text-base font-semibold" onClick={v.start} disabled={v.busy}>
                {v.busy ? <Loader2 className="animate-spin" /> : null}{x.startSet}<ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (v.stage === 'sent' || v.stage === 'done') {
    const done = v.stage === 'done'
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto size-12 text-teal" />
        <h1 className="mt-4 text-2xl font-semibold text-navy">{done ? x.allDone : v.sentNote}</h1>
        {done && <p className="mt-3 leading-relaxed text-navy/75">{x.allDoneBody}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {!done && <Button className="h-12 rounded-xl px-6 text-base font-semibold" onClick={() => { v.setStage('take'); window.scrollTo(0, 0) }}>{x.nextCase}<ArrowRight /></Button>}
          <Button variant="outline" className="h-12 rounded-xl" onClick={() => { v.setStage('intro'); onBack() }}>{x.backToMarking}</Button>
        </div>
      </div>
    )
  }

  const c = v.current!
  const phase = sess!.phase
  const last = phase >= c.phases - 1
  const total = sess!.queue.length
  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={cn('h-1.5 w-7 rounded-full', i < sess!.qi ? 'bg-teal' : i === sess!.qi ? 'bg-navy' : 'bg-border')} />
          ))}
        </div>
        <span className="text-sm font-medium text-navy">{x.caseOf(sess!.qi + 1, total)}</span>
        <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs text-teal-dark">{x.kind[c.kind]}</span>
        <Button variant="ghost" onClick={() => { v.setStage('intro'); onBack() }} className="ml-auto h-9 text-navy/70"><ArrowLeft />{x.backToMarking}</Button>
      </div>
      <h1 className="mb-6 text-3xl font-semibold leading-tight text-navy text-balance sm:text-4xl">{c.title}</h1>

      <div className="space-y-5">
        {c.steps.filter(s => s.phase <= phase).map((s, i) => {
          const anchor = s.t === 'reveal' ? { 'data-phase': s.phase } : {}
          if (s.t === 'chat') return <div key={i} {...anchor}><Chat s={s} /></div>
          if (s.t === 'note') return (
            <div key={i}><Section icon={s.label.match(/notes|บันทึก/i) ? ClipboardList : StickyNote} title={s.label}>
              <p className="whitespace-pre-wrap rounded-xl border-l-4 border-teal bg-muted/40 p-4 text-[16px] leading-relaxed text-navy">{s.body}</p>
            </Section></div>
          )
          if (s.t === 'reveal') return (
            <div key={i} {...anchor}><Section icon={Eye} title={s.label} tone="reveal">
              <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-navy">{s.body}</p>
            </Section></div>
          )
          return <div key={i}><Question v={v} q={s} locked={s.phase < phase} /></div>
        })}
        {!last && (
          <div className="rounded-2xl border border-dashed border-teal/60 bg-white/60 p-5 text-center">
            <p className="mx-auto max-w-[56ch] text-sm leading-relaxed text-navy/70">{x.lockWarn}</p>
          </div>
        )}
        {v.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{v.error}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <p className="hidden flex-1 text-xs text-muted-foreground sm:block">{last ? '' : x.lockWarn}</p>
          {!last ? (
            <Button onClick={v.nextPhase} className="h-12 flex-1 rounded-xl text-base font-semibold sm:flex-none sm:px-8">{x.nextPart}<ArrowRight /></Button>
          ) : (
            <Button onClick={v.submit} disabled={v.busy} className="h-12 flex-1 rounded-xl text-base font-semibold sm:flex-none sm:px-8">
              {v.busy ? <><Loader2 className="animate-spin" />{x.sending}</> : <>{x.submit}<ArrowRight /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
