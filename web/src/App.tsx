import { useEffect } from 'react'
import { Header } from '@/components/Header'
import { Start } from '@/screens/Start'
import { Take } from '@/screens/Take'
import { Between, Done } from '@/screens/Between'
import { Gate, MarkingView } from '@/screens/Marking'
import { useTrainer } from '@/lib/useTrainer'
import { useMarking } from '@/lib/useMarking'
import { MK } from '@/lib/strings'
import { X } from '@/lib/extra'

export default function App() {
  const tr = useTrainer()
  const m = useMarking(tr.lang, tr.roster, tr.markers)
  useEffect(() => { document.documentElement.lang = tr.lang }, [tr.lang])
  // a remembered passcode and marker open the marking view directly
  useEffect(() => { if (m.adminKey && tr.view === 'start') tr.setView('marker') }, [m.adminKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const mk = MK[tr.lang], x = X[tr.lang]
  const staff = tr.view === 'marker' || tr.view === 'gate'
  return (
    <div className="flex min-h-dvh flex-col">
      <Header lang={tr.lang} setLang={tr.setLang}
        right={staff ? <span className="hidden rounded-full bg-navy px-3 py-1 text-xs font-medium text-white sm:inline">{mk.tag}</span> : null} />
      <main className="flex-1">
        {tr.view === 'start' && <Start tr={tr} />}
        {tr.view === 'take' && <Take tr={tr} />}
        {tr.view === 'between' && <Between tr={tr} />}
        {tr.view === 'done' && <Done tr={tr} />}
        {tr.view === 'gate' && <Gate lang={tr.lang} m={m} roster={tr.roster} markers={tr.markers} onOpened={() => tr.setView('marker')} onBack={() => tr.setView('start')} />}
        {tr.view === 'marker' && <MarkingView lang={tr.lang} m={m} roster={tr.roster} markers={tr.markers} onLeave={() => tr.setView('start')} />}
      </main>
      {tr.view !== 'take' && (
        <footer className="border-t border-border bg-white/60">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-4 text-xs text-muted-foreground sm:px-6">
            <span>{mk.foot}</span>
            {!staff && <button type="button" onClick={() => tr.setView('gate')} className="ml-auto rounded-full px-3 py-1.5 text-navy/70 hover:bg-muted">{x.staffLink}</button>}
          </div>
        </footer>
      )}
    </div>
  )
}
