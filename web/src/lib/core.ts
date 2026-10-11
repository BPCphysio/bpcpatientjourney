// The trainer's plumbing, ported from the first version: names, what is kept
// on the device, dates, and talking to the clinic record (/api/clinic, which
// answers exactly as the first version's clinic did).
import { NAME_ALIASES, DEFAULT_MARKERS } from './roster'

export { DEFAULT_MARKERS }

// ---------------------------------------------------------------- device keys
// The same keys as the first version, so a staff member's name, progress,
// unfinished set and unsent answers carry over when the new trainer replaces it.
export const LS = {
  local: 'bpc_pj_local_responses',
  admin: 'bpc_pj_admin_key',
  list: 'bpc_pj_answer_list',
  taker: 'bpc_pj_taker',
  done: 'bpc_pj_done_cases',
  lang: 'bpc_pj_lang',
  session: 'bpc_pj_session',
  names: 'bpc_pj_known_names',
  outbox: 'bpc_pj_outbox',
  roster: 'bpc_pj_roster',
  markers: 'bpc_pj_markers',
  marker: 'bpc_pj_marker'
} as const

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch { return fallback }
}
export function loadStr(key: string): string {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
export function save(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return true } catch { return false }
}
export function drop(key: string) { try { localStorage.removeItem(key) } catch { /* private mode */ } }

// ---------------------------------------------------------------- names
const normName = (n: unknown) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ')
const ALIAS_MAP: Record<string, string> = {}
NAME_ALIASES.forEach(row => {
  const canon = String(row[0] || '').trim()
  row.forEach(v => { const k = normName(v); if (k) ALIAS_MAP[k] = canon })
})
export const canonName = (n: unknown) => ALIAS_MAP[normName(n)] || String(n || '').trim()
export const folderKey = (n: unknown) => normName(canonName(n))

export type Person = { name: string; th?: string; aliases?: string[]; branch?: string }
export type Marker = { branch: string; name: string }

// NAME_ALIASES first, then the clinic's People sheet.
export function canonical(name: unknown, roster: Person[]): string {
  const base = canonName(name)
  const k = folderKey(base)
  const hit = roster.find(p => folderKey(p.name) === k || folderKey(p.th) === k || (p.aliases || []).some(a => folderKey(a) === k))
  return hit ? hit.name : base
}

// On the Markers tab, under any spelling the roster knows. An empty list
// turns nobody away; the server checks again on every save.
export function isListedMarker(name: unknown, markers: Marker[], roster: Person[]): boolean {
  const k = folderKey(canonical(String(name || '').trim(), roster))
  if (!k) return false
  if (!markers.length) return true
  return markers.some(x => folderKey(canonical(x.name, roster)) === k)
}

export function rememberName(n: string): string[] {
  const name = String(n || '').trim()
  const list = load<string[]>(LS.names, []).filter(x => folderKey(x) !== folderKey(name))
  if (name) list.unshift(name)
  const out = list.slice(0, 12)
  save(LS.names, out)
  return out
}

// ---------------------------------------------------------------- dates
// Day/month/year, 24-hour, Bangkok time, however the device is set.
const BKK = (() => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  } catch { return null }
})()
export function fmtWhen(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (BKK) return BKK.format(d).replace(',', '')
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fmtDay = (ts?: number) => fmtWhen(ts).split(' ')[0]
export const clock = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
export const newAttemptId = () => 'r' + Date.now() + Math.random().toString(36).slice(2, 6)

// ---------------------------------------------------------------- answers
// Question 4 can carry several images: q3:img, then q3:img2, q3:img3 ...
export const MAX_IMAGES = 4
export const imgKey = (qid: string, n: number) => qid + ':img' + (n ? String(n + 1) : '')
export const isMediaKey = (k: string) => /:(img\d*|audio)$/.test(k)
export type Answers = Record<string, string | number>
export function imgList(answers: Answers | undefined, qid: string): string[] {
  const out: string[] = []
  for (let n = 0; n < 12; n++) { const v = (answers || {})[imgKey(qid, n)]; if (v) out.push(String(v)) }
  return out
}
export function withImages(answers: Answers, qid: string, list: string[]): Answers {
  const a = { ...answers }
  for (let n = 0; n < 12; n++) delete a[imgKey(qid, n)]
  list.forEach((u, n) => { a[imgKey(qid, n)] = u })
  return a
}

// Pictures go up at no more than 1100 px, as JPEG, so a phone photo stays
// small in the clinic record.
export function shrinkImage(dataUrl: string, max = 1100, quality = 0.72): Promise<string> {
  return new Promise(done => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const cv = document.createElement('canvas')
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k)
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
      try { done(cv.toDataURL('image/jpeg', quality)) } catch { done(dataUrl) }
    }
    img.onerror = () => done(dataUrl)
    img.src = dataUrl
  })
}
export function readFile(f: Blob): Promise<string> {
  return new Promise((done, fail) => {
    const fr = new FileReader()
    fr.onload = () => done(String(fr.result))
    fr.onerror = () => fail(fr.error)
    fr.readAsDataURL(f)
  })
}

// ---------------------------------------------------------------- the clinic
export const API = '/api/clinic'
export const STAFF_PASSCODE_SHA256 = 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f'
export async function passcodeKnown(key: string): Promise<boolean> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key || '').trim()))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('') === STAFF_PASSCODE_SHA256
  } catch { return false }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any
export async function clinicGet(query: string, ms = 30000): Promise<Json> {
  const ctl = new AbortController()
  const to = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(API + '?' + query, { signal: ctl.signal })
    return await res.json()
  } finally { clearTimeout(to) }
}
export async function clinicPost(body: unknown, ms = 45000): Promise<Json> {
  const ctl = new AbortController()
  const to = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl.signal })
    return await res.json()
  } finally { clearTimeout(to) }
}
export const q = (o: Record<string, string>) => new URLSearchParams(o).toString()
