import { ArrowRight, Eye, FileText, ListChecks, Loader2, Phone, Image as ImageIcon, CloudOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UI } from '@/lib/strings'
import { X } from '@/lib/extra'
import { BUCKETS } from '@/lib/cases'
import { folderKey } from '@/lib/core'
import type { Trainer } from '@/lib/useTrainer'

const STEP_ICONS = [FileText, ListChecks, Phone, Eye, ImageIcon]

export function Start({ tr }: { tr: Trainer }) {
  const t = UI[tr.lang], x = X[tr.lang]
  const nameOk = !!tr.taker.trim()
  // names used on this device first, then the clinic roster
  const chips = (() => {
    const seen = new Set<string>(), out: { label: string; value: string }[] = []
    const add = (value: string, label: string) => { const k = folderKey(value); if (k && !seen.has(k)) { seen.add(k); out.push({ value, label }) } }
    tr.names.forEach(n => add(n, n))
    tr.roster.forEach(p => add(p.name, tr.lang === 'th' && p.th ? p.th : p.name))
    return out.slice(0, 40)
  })()
  const s = tr.session
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <section>
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-soft px-3 py-1 text-xs font-medium text-teal-dark">
            <span className="size-1.5 rounded-full bg-teal" />{t.kicker}
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.08] text-navy text-balance sm:text-5xl">{t.startTitle}</h1>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-navy/80 text-pretty">{t.startBody}</p>
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-muted-foreground text-pretty">{t.startNote}</p>

          <ol className="mt-8 grid grid-cols-5 gap-2" aria-label="Steps">
            {x.journey.map((label, i) => {
              const Icon = STEP_ICONS[i]
              return (
                <li key={i} className="flex flex-col items-center gap-2 text-center">
                  <div className="relative flex w-full items-center justify-center">
                    {i > 0 && <span className="absolute right-1/2 top-1/2 h-px w-full -translate-y-1/2 bg-gradient-to-r from-teal/20 to-teal/60" />}
                    <span className="relative z-10 grid size-10 place-items-center rounded-full border border-teal/40 bg-white text-teal-dark shadow-sm sm:size-11">
                      <Icon className="size-[18px]" />
                    </span>
                  </div>
                  <span className="text-[11px] leading-tight text-navy/70 sm:text-xs">{label}</span>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="lg:pt-6">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_30px_-12px_rgba(31,36,76,0.18)] sm:p-7">
            <div className="h-1 -mx-5 -mt-5 mb-5 rounded-t-2xl bg-gradient-to-r from-teal to-navy sm:-mx-7 sm:-mt-7" />
            {s && (
              <div className="mb-6 rounded-xl border border-teal/40 bg-teal-soft/60 p-4">
                <p className="text-[15px] leading-relaxed text-navy">{x.resumeNote(s.taker || '', (s.qi || 0) + (s.qiOffset || 0) + 1, BUCKETS.length)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={tr.resume} className="h-10 px-4">{t.resume}<ArrowRight /></Button>
                  <Button variant="ghost" onClick={tr.startFresh} className="h-10 px-3 text-navy/70">{t.startFresh}</Button>
                </div>
              </div>
            )}
            <label htmlFor="taker" className="text-sm font-medium text-navy">{t.yourName}</label>
            <Input id="taker" value={tr.taker} onChange={e => tr.setTaker(e.target.value)} placeholder={t.namePh}
              onKeyDown={e => { if (e.key === 'Enter' && nameOk) tr.begin() }}
              className="mt-2 h-12 rounded-xl bg-white text-base" autoComplete="off" />
            {chips.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-muted-foreground">{x.knownNote(tr.roster.length > 0)}</p>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {chips.map(c => {
                    const on = folderKey(c.value) === folderKey(tr.taker)
                    return (
                      <button key={c.value} type="button" onClick={() => tr.setTaker(c.value)}
                        className={'min-h-9 rounded-full border px-3 text-sm transition-colors ' +
                          (on ? 'border-teal bg-teal text-white' : 'border-border bg-white text-navy hover:border-teal hover:bg-teal-soft')}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <Button onClick={tr.begin} disabled={!nameOk || tr.checking}
              className="mt-6 h-12 w-full rounded-xl text-base font-semibold uppercase tracking-wide shadow-[0_6px_16px_-6px_rgba(56,194,205,0.7)]">
              {tr.checking ? <><Loader2 className="animate-spin" />{x.checking}</> : <>{t.begin}<ArrowRight /></>}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">{nameOk ? t.ready : t.needName}</p>
            {tr.pending > 0 && (
              <p className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900">
                <CloudOff className="mt-0.5 size-4 shrink-0" />{x.pendingNote(tr.pending)}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
