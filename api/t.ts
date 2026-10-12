import { clock, configured, ONLINE_MS, pipeline, TTL, type Cmd } from './_redis.js'

/**
 * Anonymous play stats from the game (sendBeacon). Only whitelisted events and
 * values; a random per-device id, no names, no IP addresses.
 *
 *   visit  {dev, lang, fresh, ref}       once per page load
 *   ping   {s, dt}                       every 90 s while the tab is visible ('off' on leave)
 *   match  {k, m, mon, w?, boss?, h}     a match starts for this player
 *   end    {k, m, r, boss?}              this player's match ended
 */

const PING = `
if ARGV[3] == 'off' then
  redis.call('ZREM', KEYS[1], ARGV[2])
  redis.call('HDEL', KEYS[2], ARGV[2])
  return 0
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
redis.call('PFADD', KEYS[3], ARGV[2])
redis.call('PFADD', KEYS[5], ARGV[2])
redis.call('PFADD', KEYS[6], ARGV[2])
local dt = tonumber(ARGV[7])
if dt > 0 and (ARGV[3] == 'br' or ARGV[3] == 'raid') then redis.call('HINCRBY', KEYS[4], 'pt:' .. ARGV[3], dt) end
local c = redis.call('ZCOUNT', KEYS[1], ARGV[5], '+inf')
local f = 'pk:' .. ARGV[4]
if c > tonumber(redis.call('HGET', KEYS[4], f) or '0') then redis.call('HSET', KEYS[4], f, c) end
if c > tonumber(redis.call('HGET', KEYS[4], 'pk') or '0') then redis.call('HSET', KEYS[4], 'pk', c) end
redis.call('EXPIRE', KEYS[3], ARGV[6])
redis.call('EXPIRE', KEYS[4], ARGV[6])
redis.call('EXPIRE', KEYS[5], ARGV[6])
return c`

const VISIT = `
redis.call('PFADD', KEYS[1], ARGV[1])
redis.call('PFADD', KEYS[2], ARGV[1])
redis.call('PFADD', KEYS[4], ARGV[1])
for i = 3, #ARGV do redis.call('HINCRBY', KEYS[3], ARGV[i], 1) end
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('EXPIRE', KEYS[3], ARGV[2])
redis.call('EXPIRE', KEYS[4], ARGV[2])
return 1`

/** HINCRBY by 1 for (key index, field) pairs; the first key (the day hash) gets a TTL. */
const BUMP = `
for i = 2, #ARGV, 2 do redis.call('HINCRBY', KEYS[tonumber(ARGV[i])], ARGV[i + 1], 1) end
redis.call('EXPIRE', KEYS[1], ARGV[1])
return 1`

const ID = /^[A-Za-z0-9-]{8,64}$/
const WORD = /^[a-z0-9]{1,16}$/
const KINDS = ['br', 'raid']
const MODES = ['solo', 'quick', 'friends']
const STATES = ['menu', 'lobby', 'br', 'raid', 'off']
const RESULTS = ['win', 'lose', 'clear', 'fail']
const one = (v: unknown, list: string[]) => (typeof v === 'string' && list.includes(v) ? v : null)
const word = (v: unknown) => (typeof v === 'string' && WORD.test(v) ? v : null)
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null)

/** The Redis command for one event, or null when it doesn't validate. */
export function commandFor(b: Record<string, unknown>, now = Date.now()): Cmd | null {
  const id = typeof b.id === 'string' && ID.test(b.id) ? b.id : null
  if (!id) return null
  const { day, month, hour } = clock(now)
  const d = `d:${day}`
  switch (b.e) {
    case 'ping': {
      const s = one(b.s, STATES)
      if (!s) return null
      const dt = int(b.dt, 0, 600) ?? 0
      return ['EVAL', PING, 6, 'online', 'ostate', `u:${day}`, d, `um:${month}`, 'ua', now, id, s, hour, now - ONLINE_MS, TTL, dt]
    }
    case 'visit': {
      const f = ['v']
      const dev = one(b.dev, ['mobile', 'desktop'])
      const lang = one(b.lang, ['en', 'nl'])
      const ref = typeof b.ref === 'string' && /^[a-z0-9.-]{1,40}$/.test(b.ref) ? b.ref : null
      if (dev) f.push(`dev:${dev}`)
      if (lang) f.push(`lang:${lang}`)
      if (ref) f.push(`ref:${ref}`)
      if (b.fresh === 1) f.push('new')
      return ['EVAL', VISIT, 4, `u:${day}`, 'ua', d, `um:${month}`, id, TTL, ...f]
    }
    case 'match': {
      const k = one(b.k, KINDS), m = one(b.m, MODES)
      const mon = int(b.mon, 1, 1025), h = int(b.h, 1, 12)
      if (!k || !m) return null
      const a: Cmd = [TTL, 1, `m:${k}:${m}`]
      if (h) a.push(1, `h:${h}`)
      if (mon) a.push(2, String(mon))
      const boss = word(b.boss), w = word(b.w)
      if (k === 'raid' && boss) a.push(3, `${boss}:play`)
      if (k === 'br' && w) a.push(4, w)
      return ['EVAL', BUMP, 4, d, 'mon', 'boss', 'world', ...a]
    }
    case 'end': {
      const k = one(b.k, KINDS), m = one(b.m, MODES), r = one(b.r, RESULTS)
      if (!k || !m || !r) return null
      const a: Cmd = [TTL, 1, `e:${k}:${r}`, 1, `e:${k}:${m}:${r}`]
      const boss = word(b.boss)
      if (k === 'raid' && boss && r === 'clear') a.push(2, `${boss}:clear`)
      return ['EVAL', BUMP, 2, d, 'boss', ...a]
    }
  }
  return null
}

export async function POST(req: Request) {
  if (!configured()) return new Response(null, { status: 204 })
  let body: Record<string, unknown>
  try {
    const text = await req.text()
    if (text.length > 2000) return new Response(null, { status: 413 })
    body = JSON.parse(text)
  } catch {
    return new Response(null, { status: 400 })
  }
  const cmd = commandFor(body)
  if (!cmd) return new Response(null, { status: 400 })
  try {
    await pipeline([cmd])
  } catch {
    return new Response(null, { status: 502 })
  }
  return new Response(null, { status: 204 })
}
