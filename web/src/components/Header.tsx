import { cn } from '@/lib/utils'
import type { Lang } from '@/lib/strings'

export function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="inline-flex rounded-full border border-teal/60 bg-white p-0.5 text-sm" role="group" aria-label="Language">
      {(['en', 'th'] as Lang[]).map(l => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={cn('min-h-9 rounded-full px-3.5 font-medium transition-colors',
            lang === l ? 'bg-teal text-white shadow-sm' : 'text-navy hover:bg-teal-soft')}>
          {l === 'en' ? 'English' : 'ไทย'}
        </button>
      ))}
    </div>
  )
}

export function Header({ lang, setLang, right }: { lang: Lang; setLang: (l: Lang) => void; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <img src={import.meta.env.BASE_URL + 'bpc-logo.png'} alt="Bangkok Physiotherapy Center" className="h-9 w-auto sm:h-11" />
        <div className="hidden border-l border-border pl-3 leading-tight text-navy min-[440px]:block">
          <div className="text-[15px] font-medium">Patient Journey <span className="text-teal">Trainer</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {right}
          <LangToggle lang={lang} setLang={setLang} />
        </div>
      </div>
    </header>
  )
}
