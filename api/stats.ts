import { clock, configured, daysBack, ONLINE_MS, pipeline, statsKey, type Cmd } from './_redis.js'

/**
 * Creator stats for the /stats panel. Needs the `x-stats-key` header to match
 * STATS_KEY. `?full=1` adds the daily history (`days`, max 90) and all-time
 * tallies; without it you only get who's online right now (cheap to poll).
 */

/** Drop stale players, return the state of everyone still online. */
const LIVE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', '(' .. ARGV[1])
local ids = redis.call('ZRANGE', KEYS[1], 0, -1)
local out = {}
for i, id in ipairs(ids) do out[i] = redis.call('HGET', KEYS[2], id) or 'menu' end
if redis.call('HLEN', KEYS[2]) > #ids + 100 then
  for _, id in ipairs(redis.call('HKEYS', KEYS[2])) do
    if not redis.call('ZSCORE', KEYS[1], id) then redis.call('HDEL', KEYS[2], id) end
  end
end
return out`

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** Upstash returns HGETALL as a flat [field, value, …] list. */
function hash(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (Array.isArray(v)) for (let i = 0; i + 1 < v.length; i += 2) out[String(v[i])] = Number(v[i + 1]) || 0
  return out
}

/** Same-length compare so the key can't be guessed byte by byte from timings. */
function same(a: string, b: string) {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

export async function GET(req: Request) {
  const key = statsKey()
  if (!configured() || !key) return json({ error: 'not-configured', store: configured(), key: !!key }, 503)
  if (!same(req.headers.get('x-stats-key') ?? '', key)) return json({ error: 'unauthorized' }, 401)

  const url = new URL(req.url)
  const full = url.searchParams.get('full') === '1'
  const n = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30))
  const now = Date.now()
  const { day, month } = clock(now)

  const cmds: Cmd[] = [['EVAL', LIVE, 2, 'online', 'ostate', now - ONLINE_MS]]
  const days = full ? daysBack(day, n) : []
  if (full) {
    for (const d of days) cmds.push(['HGETALL', `d:${d}`], ['PFCOUNT', `u:${d}`])
    cmds.push(['PFCOUNT', `um:${month}`], ['PFCOUNT', 'ua'], ['HGETALL', 'mon'], ['HGETALL', 'boss'], ['HGETALL', 'world'])
  }
  let res: unknown[]
  try {
    res = await pipeline(cmds)
  } catch (e) {
    return json({ error: 'store', detail: String((e as Error).message ?? e) }, 502)
  }

  const states: Record<string, number> = {}
  for (const s of (res[0] as string[]) ?? []) states[s] = (states[s] ?? 0) + 1
  const live = { online: ((res[0] as string[]) ?? []).length, states }
  if (!full) return json({ now, day, live })

  const history = days.map((d, i) => ({ day: d, players: Number(res[2 + i * 2]) || 0, ...hash(res[1 + i * 2]) }))
  const at = 1 + days.length * 2
  return json({
    now, day, live, history,
    month: { key: month, players: Number(res[at]) || 0 },
    allTime: { players: Number(res[at + 1]) || 0 },
    partners: hash(res[at + 2]),
    bosses: hash(res[at + 3]),
    worlds: hash(res[at + 4]),
  })
}
