import { clean, configured, pipeline } from './_redis.js'

/**
 * Optional accounts (Discord login) with friends, presence and invites, kept in
 * the same Redis as the stats. Playing as a guest never touches any of this.
 *
 *   sess:<token>   uid                 a login session (cookie sb_s)
 *   user:<uid>     {name, dname, avatar, code}
 *   fc:<CODE>      uid                 friend code → user
 *   fr:<uid>       set of uids         friends
 *   freq:<uid>     set of uids         friend requests waiting for you
 *   pres:<uid>     {s, code, q, n, run, name, at}  presence, expires when the pings stop
 *   inv:<uid>      list of {from, code, q, at}     lobby invites, expire after a few minutes
 *
 * Presence lives on its own keys, apart from the anonymous stats.
 */
declare const process: { env: Record<string, string | undefined> }

export const SESSION_DAYS = 180
export const PRES_TTL = 75
export const INVITE_TTL = 300
export const MAX_FRIENDS = 100
export const MAX_REQUESTS = 50

export const discordEnv = () => ({ id: clean(process.env.DISCORD_CLIENT_ID), secret: clean(process.env.DISCORD_CLIENT_SECRET) })
export const accountsOn = () => configured() && !!(discordEnv().id && discordEnv().secret)

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

// ---------------------------------------------------------------- cookies

export function cookies(req: Request) {
  const out: Record<string, string> = {}
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

export function token(bytes = 24) {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/** POSTs only from our own pages (the session cookie is SameSite=Lax, this is a second lock). */
export function sameOrigin(req: Request) {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin
}

// ---------------------------------------------------------------- users

export interface User {
  name: string
  dname: string
  avatar: string
  code: string
}

export interface Presence {
  /** menu | lobby | game */
  s: string
  code?: string
  /** Quick play slot (-1: a private room). */
  q?: number
  n?: number
  run?: boolean
  name?: string
  at: number
}

/** Same rules as the in-game names (src/profile.ts). */
export const cleanName = (s: unknown, max = 12) =>
  typeof s === 'string' ? s.replace(/[<>&"'`]/g, '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : ''

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function friendCode() {
  const b = new Uint8Array(6)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join('')
}
export const cleanCode = (s: unknown) => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '')

export function parse<T>(v: unknown): T | null {
  if (typeof v !== 'string' || !v) return null
  try {
    return JSON.parse(v) as T
  } catch {
    return null
  }
}

/** The signed-in user id for this request, or ''. */
export async function sessionUid(req: Request) {
  const t = cookies(req).sb_s
  if (!t || !/^[0-9a-f]{48}$/.test(t)) return ''
  const [uid] = await pipeline([['GET', `sess:${t}`]])
  return typeof uid === 'string' ? uid : ''
}

/** A presence from the client, whitelisted. */
export function presenceFrom(b: Record<string, unknown>, now = Date.now()): Presence {
  const s = b.s === 'lobby' || b.s === 'game' ? b.s : 'menu'
  const p: Presence = { s, at: now, name: cleanName(b.name) || undefined }
  if (s === 'lobby' || s === 'game') {
    const code = typeof b.code === 'string' && /^(Q\d{1,2}|[A-Z0-9]{4})$/.test(b.code) ? b.code : undefined
    const q = typeof b.q === 'number' && Number.isInteger(b.q) && b.q >= -1 && b.q < 64 ? b.q : -1
    const n = typeof b.n === 'number' && Number.isInteger(b.n) && b.n >= 0 && b.n <= 64 ? b.n : 0
    Object.assign(p, { code, q, n, run: b.run === true || s === 'game' })
  }
  return p
}

export interface FriendView {
  id: string
  name: string
  avatar: string
  online: boolean
  pres?: Presence
}

export interface State {
  me: User & { id: string }
  friends: FriendView[]
  requests: { id: string; name: string; avatar: string }[]
  invites: { id: string; name: string; avatar: string; code: string; q: number; at: number }[]
}

/**
 * Heartbeat (when `pres` is given) and everything the friends screen shows, in two
 * round trips: own data, friends and requests and invites; then their profiles and presence.
 */
export async function stateFor(uid: string, pres: Presence | null, now = Date.now()): Promise<State | null> {
  const first: (string | number)[][] = [
    ['GET', `user:${uid}`],
    ['SMEMBERS', `fr:${uid}`],
    ['SMEMBERS', `freq:${uid}`],
    ['LRANGE', `inv:${uid}`, 0, 19],
    ['DEL', `inv:${uid}`],
  ]
  if (pres) first.push(['SET', `pres:${uid}`, JSON.stringify(pres), 'EX', PRES_TTL])
  const [u, fr, rq, inv] = await pipeline(first)
  const me = parse<User>(u)
  if (!me) return null
  const friends = (Array.isArray(fr) ? fr : []).map(String)
  const reqs = (Array.isArray(rq) ? rq : []).map(String)
  const invites = (Array.isArray(inv) ? inv : [])
    .map((x) => parse<{ from: string; code: string; q: number; at: number }>(x))
    .filter((x): x is { from: string; code: string; q: number; at: number } => !!x && now - x.at < INVITE_TTL * 1000 && friends.includes(x.from))
  const ids = [...new Set([...friends, ...reqs])]
  const second: (string | number)[][] = []
  if (ids.length) second.push(['MGET', ...ids.map((id) => `user:${id}`)])
  if (friends.length) second.push(['MGET', ...friends.map((id) => `pres:${id}`)])
  const res = second.length ? await pipeline(second) : []
  const users = new Map<string, User>()
  ;((res[0] as unknown[]) ?? []).forEach((v, i) => {
    const x = parse<User>(v)
    if (x) users.set(ids[i], x)
  })
  const presList = (friends.length ? (res[1] as unknown[]) : []) ?? []
  const view = (id: string) => ({ id, name: users.get(id)?.name ?? '?', avatar: users.get(id)?.avatar ?? '' })
  return {
    me: { ...me, id: uid },
    friends: friends.flatMap((id, i) => {
      if (!users.has(id)) return []
      const p = parse<Presence>(presList[i])
      return [{ ...view(id), online: !!p, pres: p ?? undefined }]
    }),
    requests: reqs.filter((id) => users.has(id)).map(view),
    invites: invites.filter((x) => users.has(x.from)).map((x) => ({ ...view(x.from), code: x.code, q: x.q, at: x.at })),
  }
}
