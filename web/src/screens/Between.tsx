import { ArrowRight, CheckCircle2, CloudOff, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UI } from '@/lib/strings'
import { X } from '@/lib/extra'
import { BUCKETS } from '@/lib/cases'
import type { Trainer } from '@/lib/useTrainer'

export function Between({ tr }: { tr: Trainer }) {
  const t = UI[tr.lang], x = X[tr.lang]
  const total = BUCKETS.length
  const last = tr.qi + 1 >= tr.queue.length
  const Icon = tr.thanks.queued ? CloudOff : CheckCircle2
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
      <span className={'mx-auto grid size-16 place-items-center rounded-full ' + (tr.thanks.queued ? 'bg-amber-50 text-amber-700' : 'bg-teal-soft text-teal-dark')}>
        <Icon className="size-8" />
      </span>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-teal-dark">{t.received}</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-navy text-balance">{tr.thanks.queued ? x.betweenQueued : x.betweenTitle}</h1>
      <p className="mx-auto mt-4 max-w-[48ch] text-[16px] leading-relaxed text-navy/75 text-pretty">{tr.thanks.body}</p>
      <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <Button onClick={tr.next} className="h-12 w-full rounded-xl px-6 text-base font-semibold sm:w-auto">
          {last ? x.seeWhere : `${t.nextCase} · ${tr.qi + (tr.qiOffset || 0) + 2} / ${total}`}<ArrowRight />
        </Button>
        <Button variant="ghost" onClick={tr.goHome} className="h-12 text-navy/70">{t.finish}</Button>
      </div>
      {tr.pending > 0 && <p className="mx-auto mt-6 max-w-[52ch] text-[13px] text-amber-800">{x.pendingNote(tr.pending)}</p>}
    </div>
  )
}

export function Done({ tr }: { tr: Trainer }) {
  const t = UI[tr.lang], x = X[tr.lang]
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-teal to-navy text-white shadow-lg"><PartyPopper className="size-8" /></span>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-teal-dark">{t.setComplete}</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-navy text-balance">{t.doneTitle}</h1>
      <p className="mx-auto mt-4 max-w-[48ch] text-[16px] leading-relaxed text-navy/75 text-pretty">{x.doneBody}</p>
      <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <Button onClick={tr.moreCases} className="h-12 w-full rounded-xl px-6 text-base font-semibold sm:w-auto">{t.moreCases}<ArrowRight /></Button>
        <Button variant="ghost" onClick={tr.finish} className="h-12 text-navy/70">{t.finish}</Button>
      </div>
    </div>
  )
}
