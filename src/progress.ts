import { accountStatus, onAccount } from './account'
import { ACHIEVEMENTS, applyMatch, BOSS_IDS, levelCost, MASTERY, MAX_LEVEL, newProgress, normalize, PARTNERS, sanitize, SHINY_AT, type Outcome, type Progress, type Report } from '../api/_progress'

/**
 * Your progress: trainer level, partner mastery, achievements, quests. Signed in
 * it lives on the server (and counts for the rankings); as a guest the same rules
 * run here and it's kept in this browser, merged into your account (once) when
 * you log in.
 */

const GUEST_KEY = 'sb:progress'
const MERGED_KEY = 'sb:progressMerged'

let guest: Progress = load()
let account: Progress | null = null
let fetched = false
const listeners = new Set<() => void>()

function load(): Progress {
  try {
    return normalize(JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null'))
  } catch {
    return newProgress()
  }
}
function saveGuest() {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
  } catch {
    /* private mode */
  }
}

/** Signed in (and the server has answered) = account progress, otherwise the guest one. */
export const signedIn = () => accountStatus() === 'in' && !!account
export const progress = (): Progress => showcase ?? (signedIn() ? account! : guest)
/** Recording mode is on (see below). */
export const inShowcase = () => !!showcase
/** Recording mode with a head start in solo matches. */
export const showcaseBoost = () => !!showcase && showArg === 'boost'

export function onProgress(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const notify = () => listeners.forEach((f) => f())

/**
 * Recording mode, for trailers (?showcase): a made-up profile that lives only in
 * this tab. Nothing is saved and nothing goes to the server or the rankings.
 *   ?showcase        everything unlocked: level 50, shiny for every partner
 *   ?showcase=boost  the same, and in solo matches your Pokémon starts fully
 *                    evolved at Lv 25 with every move
 *   ?showcase=12     level 12, a few XP short of 13: your next match levels up
 *   ?showcase=off    back to normal (closing the tab does that too)
 * Only for the maker: it needs the /stats password on this device (log in to
 * /stats once), checked with the server once per tab.
 */
const SHOW_KEY = 'sb:showcase'
const SHOW_OK = 'sb:showcaseOk'
let showArg: string | null = null
let showcase: Progress | null = null

function showcaseProgress(arg: string): Progress {
  const p = newProgress()
  const want = Math.round(Number(arg))
  const lv = want >= 1 && want < MAX_LEVEL ? want : MAX_LEVEL
  for (let l = 1; l < lv; l++) p.xp += levelCost(l)
  p.day = today()
  if (lv < MAX_LEVEL) {
    // A match always gives at least 25 XP
    p.xp += levelCost(lv) - 20
    return p
  }
  // A seasoned trainer: every achievement, shiny unlocked for every partner, one master
  for (const id of PARTNERS) p.partners[id] = MASTERY[SHINY_AT - 1]
  p.partners[25] = MASTERY[MASTERY.length - 1]
  p.ach = ACHIEVEMENTS.map((a) => a.id)
  p.stats = { m: 412, w: 63, top3: 171, kos: 1384, caught: 2650, raids: 48, bosses: [...BOSS_IDS], legend: 41, crystal: 26, evolved: 830, mp: 156, mpw: 31, time: 412 * 230, used: [...PARTNERS], bestKos: 11, dw: 38, dpw: 14 }
  p.streak = 9
  p.bestStreak = 14
  return p
}

function initShowcase() {
  let arg: string | null = null
  let ok = false
  let key = ''
  try {
    const q = new URLSearchParams(location.search).get('showcase')
    if (q === 'off') {
      sessionStorage.removeItem(SHOW_KEY)
      sessionStorage.removeItem(SHOW_OK)
    } else if (q !== null) sessionStorage.setItem(SHOW_KEY, q)
    arg = sessionStorage.getItem(SHOW_KEY)
    ok = sessionStorage.getItem(SHOW_OK) === '1'
    key = localStorage.getItem('sb:statskey') ?? ''
  } catch {
    return
  }
  if (arg === null) return
  const on = () => {
    showArg = arg
    showcase = showcaseProgress(arg!)
    notify()
  }
  if (ok) return on()
  if (!key) return console.warn('[showcase] Log in to /stats on this device first')
  void fetch('/api/stats?days=1', { headers: { 'x-stats-key': key } })
    .then((r) => {
      if (!r.ok) return console.warn('[showcase] The /stats password was not accepted')
      try {
        sessionStorage.setItem(SHOW_OK, '1')
      } catch {
        /* private mode */
      }
      on()
    })
    .catch(() => console.warn('[showcase] Could not check the /stats password'))
}
initShowcase()


/** Today on the game's clock (Amsterdam), the same day the server uses. */
export function today() {
  const p: Record<string, string> = {}
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}`
}

async function call(body?: unknown): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/api/match', body === undefined ? { credentials: 'same-origin' } : {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!(r.headers.get('content-type') ?? '').includes('json')) return null
    return (await r.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Signed in: fetch the account's progress, and bring the guest progress along once. */
async function sync() {
  if (accountStatus() !== 'in') {
    if (account) {
      account = null
      notify()
    }
    fetched = false
    return
  }
  if (fetched) return
  fetched = true
  const d = await call()
  const p = d?.progress as Progress | undefined
  if (!p) {
    fetched = false
    return
  }
  account = normalize(p)
  let mergedFor = ''
  try {
    mergedFor = localStorage.getItem(MERGED_KEY) ?? ''
  } catch {
    /* private mode */
  }
  if (guest.stats.m > 0 && !account.imported && !mergedFor && !showcase) {
    const m = await call({ a: 'import', guest })
    if (m?.progress) {
      account = normalize(m.progress as Progress)
      try {
        localStorage.setItem(MERGED_KEY, '1')
      } catch {
        /* private mode */
      }
    }
  }
  notify()
}

export function initProgress() {
  onAccount(() => void sync())
  void sync()
}

// ---------------------------------------------------------------- matches

let ticket: Promise<string | null> | null = null
let startedAt = 0

/** A match starts (every mode goes through here). */
export function matchStarted(kind: Report['kind'], mode: Report['mode'], humans: number) {
  startedAt = Date.now()
  ticket = signedIn() && !showcase
    ? call({ a: 'start', kind, mode, humans }).then((d) => (typeof d?.id === 'string' ? d.id : null))
    : null
}

export interface Reward {
  outcome: Outcome
  progress: Progress
  /** Saved to the account (otherwise: kept as a guest in this browser). */
  saved: boolean
  /** Recording mode: kept in this tab only. */
  showcase?: boolean
}

/** Your match is over: work out the rewards (on the server when signed in). Once per match. */
export async function matchEnded(raw: Report): Promise<Reward | null> {
  const t = ticket
  ticket = null
  if (!startedAt) return null
  const elapsed = (Date.now() - startedAt) / 1000
  startedAt = 0
  if (t) {
    const id = await t
    const d = id ? await call({ a: 'end', id, report: raw }) : null
    if (d?.outcome && d.progress) {
      account = normalize(d.progress as Progress)
      notify()
      return { outcome: d.outcome as Outcome, progress: account, saved: true }
    }
    return null
  }
  const r = sanitize(raw, elapsed + 15)
  if (!r) return null
  if (showcase) {
    const outcome = applyMatch(showcase, r, today())
    notify()
    return { outcome, progress: showcase, saved: false, showcase: true }
  }
  const outcome = applyMatch(guest, r, today())
  saveGuest()
  notify()
  return { outcome, progress: guest, saved: false }
}

/** Pick a title or the shiny partners (account: on the server too). */
export async function setCosmetics(c: { title?: string; shiny?: number[] }) {
  const p = progress()
  if (c.title !== undefined) p.title = c.title
  if (c.shiny) p.shiny = c.shiny
  notify()
  if (showcase) return
  if (signedIn()) {
    const d = await call({ a: 'set', ...c })
    if (d?.progress) {
      account = normalize(d.progress as Progress)
      notify()
    }
  } else saveGuest()
}
