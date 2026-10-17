import { accountStatus, onAccount } from './account'
import { applyMatch, newProgress, normalize, sanitize, type Outcome, type Progress, type Report } from '../api/_progress'

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
export const progress = (): Progress => (signedIn() ? account! : guest)

export function onProgress(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const notify = () => listeners.forEach((f) => f())

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
  if (guest.stats.m > 0 && !account.imported && !mergedFor) {
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
export function matchStarted(kind: 'br' | 'raid', mode: Report['mode'], humans: number) {
  startedAt = Date.now()
  ticket = signedIn()
    ? call({ a: 'start', kind, mode, humans }).then((d) => (typeof d?.id === 'string' ? d.id : null))
    : null
}

export interface Reward {
  outcome: Outcome
  progress: Progress
  /** Saved to the account (otherwise: kept as a guest in this browser). */
  saved: boolean
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
  if (signedIn()) {
    const d = await call({ a: 'set', ...c })
    if (d?.progress) {
      account = normalize(d.progress as Progress)
      notify()
    }
  } else saveGuest()
}
