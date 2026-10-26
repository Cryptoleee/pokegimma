import { configured, pipeline, statsKey } from './_redis.js'
import { cleanName, json, parse, sameOrigin, sessionUid, type User } from './_account.js'

/**
 * Player feedback ("Send feedback" on home and after a match) and the creator's
 * inbox in the /stats panel.
 *
 *   POST                     a player sends a message: {text, kind, ctx}
 *   GET    (x-stats-key)     the inbox, newest first, and how many are unread
 *   POST   ?seen=1 (key)     everything up to now counts as read
 *   DELETE ?id=… (key)       throw one away
 *
 *   fb:list   list of JSON messages, newest first (the last 500 are kept)
 *   fb:seen   time the creator last looked
 *   fb:rl:<h> sends from one connection this hour (hashed, never stored as such)
 */

const MAX = 500
const PER_HOUR = 6
const KINDS = ['bug', 'idea', 'other']
const MODES = ['menu', 'br', 'raid', 'duel']

export interface Feedback {
  id: string
  t: number
  text: string
  kind: string
  /** Where they were: the home screen, or after which kind of match (and how it went). */
  mode: string
  result?: string
  lang?: string
  dev?: string
  /** Their name in the game, and their Discord name when logged in. */
  name?: string
  discord?: string
}

function same(a: string, b: string) {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
const creator = (req: Request) => {
  const key = statsKey()
  return !!key && same(req.headers.get('x-stats-key') ?? '', key)
}

async function hashOf(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fb:${s}`))
  return Array.from(new Uint8Array(d).slice(0, 8), (x) => x.toString(16).padStart(2, '0')).join('')
}

export async function GET(req: Request) {
  if (!configured()) return json({ error: 'not-configured' }, 503)
  if (!creator(req)) return json({ error: 'unauthorized' }, 401)
  const [list, seen] = await pipeline([['LRANGE', 'fb:list', 0, MAX - 1], ['GET', 'fb:seen']])
  const items = (Array.isArray(list) ? list : []).map((v) => parse<Feedback>(v)).filter((x): x is Feedback => !!x)
  const seenAt = Number(seen) || 0
  return json({ items, seen: seenAt, unread: items.filter((x) => x.t > seenAt).length })
}

export async function DELETE(req: Request) {
  if (!configured()) return json({ error: 'not-configured' }, 503)
  if (!creator(req)) return json({ error: 'unauthorized' }, 401)
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const [list] = await pipeline([['LRANGE', 'fb:list', 0, MAX - 1]])
  const raw = (Array.isArray(list) ? list : []).find((v) => parse<Feedback>(v)?.id === id)
  if (raw) await pipeline([['LREM', 'fb:list', 1, String(raw)]])
  return json({ ok: !!raw })
}

export async function POST(req: Request) {
  if (!configured()) return json({ error: 'not-configured' }, 503)
  const url = new URL(req.url)
  // The creator marks the inbox as read
  if (url.searchParams.get('seen') === '1') {
    if (!creator(req)) return json({ error: 'unauthorized' }, 401)
    await pipeline([['SET', 'fb:seen', Date.now()]])
    return json({ ok: true })
  }
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)
  let b: Record<string, unknown>
  try {
    b = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'bad' }, 400)
  }
  const text = typeof b.text === 'string' ? b.text.replace(/\s+\n/g, '\n').trim().slice(0, 1000) : ''
  if (text.length < 3) return json({ error: 'empty' }, 400)
  const ctx = (b.ctx && typeof b.ctx === 'object' ? b.ctx : {}) as Record<string, unknown>
  const pick = (v: unknown, list: string[]) => (typeof v === 'string' && list.includes(v) ? v : undefined)

  // A few messages an hour per connection, no more
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const rl = `fb:rl:${await hashOf(ip)}`
  const [n] = await pipeline([['INCR', rl], ['EXPIRE', rl, 3600]])
  if (Number(n) > PER_HOUR) return json({ error: 'slow-down' }, 429)

  // Logged in with Discord: their Discord name too (so you can find them)
  let discord: string | undefined
  try {
    const uid = await sessionUid(req)
    if (uid) {
      const [u] = await pipeline([['GET', `user:${uid}`]])
      const user = parse<User>(u)
      discord = user?.dname || user?.name || undefined
    }
  } catch {
    /* fine without */
  }

  const fb: Feedback = {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    t: Date.now(),
    text,
    kind: pick(b.kind, KINDS) ?? 'other',
    mode: pick(ctx.mode, MODES) ?? 'menu',
    result: pick(ctx.result, ['win', 'lose', 'clear', 'fail']),
    lang: pick(ctx.lang, ['en', 'nl']),
    dev: pick(ctx.dev, ['mobile', 'desktop']),
    name: cleanName(ctx.name, 16) || undefined,
    discord,
  }
  await pipeline([['LPUSH', 'fb:list', JSON.stringify(fb)], ['LTRIM', 'fb:list', 0, MAX - 1]])
  return json({ ok: true })
}
