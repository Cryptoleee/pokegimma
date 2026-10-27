/**
 * Optional account (Discord login) with friends. Guests never need it: when the
 * server has no accounts set up (or you run it locally) everything here stays 'off'
 * and the game shows no account buttons at all.
 *
 * Signed in, a heartbeat every 30 s (60 s in a match, 10 s with the friends panel
 * open, none while the tab is hidden) tells friends where you are and brings in
 * their status, friend requests and lobby invites.
 */

export interface Presence {
  s: 'menu' | 'lobby' | 'game'
  code?: string
  q?: number
  n?: number
  run?: boolean
  name?: string
  at?: number
}
export interface Friend {
  id: string
  name: string
  avatar: string
  fc?: string
  online: boolean
  pres?: Presence
}
export interface Invite {
  id: string
  name: string
  avatar: string
  code: string
  q: number
  at: number
}
export interface AccountState {
  me: { id: string; name: string; dname: string; avatar: string; code: string }
  friends: Friend[]
  requests: { id: string; name: string; avatar: string }[]
  invites: Invite[]
}
export type Status = 'loading' | 'off' | 'guest' | 'in'

let status: Status = 'loading'
let state: AccountState | null = null
let getPres: () => Presence = () => ({ s: 'menu' })
let fast = false
let timer = 0
const listeners = new Set<() => void>()
const inviteListeners = new Set<(i: Invite) => void>()
const seenInvites = new Set<string>()

export const accountStatus = () => status
export const accountState = () => state

/** Called on every change of the account state (returns an unsubscribe). */
export function onAccount(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
export function onInvite(fn: (i: Invite) => void) {
  inviteListeners.add(fn)
}
const notify = () => listeners.forEach((f) => f())

function apply(data: Record<string, unknown> | null) {
  if (!data || data.off) {
    status = 'off'
    state = null
  } else if (data.guest) {
    status = 'guest'
    state = null
  } else if (data.me) {
    status = 'in'
    state = data as unknown as AccountState
    for (const inv of state.invites) {
      const key = `${inv.id}:${inv.at}`
      if (seenInvites.has(key)) continue
      seenInvites.add(key)
      inviteListeners.forEach((f) => f(inv))
    }
  }
  notify()
}

async function call(url: string, body?: unknown): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, body === undefined ? { credentials: 'same-origin' } : {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // Local dev has no API (the page itself comes back): accounts are simply off
    if (!(r.headers.get('content-type') ?? '').includes('json')) return { off: true }
    return (await r.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Heartbeat + fresh state; schedules the next one. */
export async function pollNow() {
  clearTimeout(timer)
  if (status === 'in' && document.visibilityState === 'visible') {
    const data = await call('/api/me', { ...getPres(), at: undefined })
    // A network hiccup keeps what we had
    if (data && !data.error) apply(data)
  }
  if (status === 'in') {
    const p = getPres()
    // In the menus and a lobby often enough that a friend's invite shows up within seconds, wherever you are
    timer = window.setTimeout(pollNow, fast ? 8_000 : p.s === 'game' ? 45_000 : 12_000)
  }
}

export async function initAccount(pres: () => Presence) {
  getPres = pres
  const data = await call('/api/me')
  apply(data ?? { off: true })
  if (status === 'in') void pollNow()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status === 'in') void pollNow()
  })
}

/** Poll faster while the friends panel is open. */
export function setFast(on: boolean) {
  if (fast === on) return
  fast = on
  if (on) void pollNow()
}

/** Something changed for your friends to see (joined a lobby, a match started, ...). */
export function presenceChanged() {
  if (status === 'in') void pollNow()
}

export function login() {
  location.href = '/api/auth/login'
}

export async function logout() {
  await call('/api/auth/logout', {})
  clearTimeout(timer)
  apply({ guest: true })
}

export type FriendResult = 'ok' | 'sent' | 'friends' | 'already' | 'notfound' | 'self' | 'full' | 'invited' | 'deleted' | 'error'

/** A friend action; resolves with the server's verdict and updates the state. */
export async function friendAction(body: { a: string; code?: string; id?: string; q?: number }): Promise<FriendResult> {
  const data = await call('/api/friends', body)
  if (!data || data.error) return 'error'
  apply(data)
  if (body.a === 'delete') clearTimeout(timer)
  return (data.result as FriendResult) ?? 'ok'
}

/** Can you hop into this friend's lobby right now? */
export function joinable(p: Presence | undefined, max: { quick: number; room: number }) {
  if (!p || p.s !== 'lobby' || p.run || !p.code) return false
  return (p.n ?? 0) < ((p.q ?? -1) >= 0 ? max.quick : max.room)
}
