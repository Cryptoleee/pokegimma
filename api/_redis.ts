/**
 * Tiny Upstash Redis client over its REST API (no dependencies). Works with the
 * env vars the Vercel Marketplace integration sets (KV_* or UPSTASH_REDIS_*).
 * Without them every call is a no-op, so the game never notices.
 */
declare const process: { env: Record<string, string | undefined> }

/** Pasted values often keep the quotes from a .env snippet, or a stray space. */
export const clean = (v: string | undefined) => v?.trim().replace(/^(['"])(.*)\1$/, '$2').trim() || undefined

/** One matching pair (KV_* from the Vercel integration, else UPSTASH_REDIS_*), never a mix. */
const env = () => {
  const e = process.env
  const kv = { url: clean(e.KV_REST_API_URL), token: clean(e.KV_REST_API_TOKEN), from: 'KV_REST_API_*' }
  const up = { url: clean(e.UPSTASH_REDIS_REST_URL), token: clean(e.UPSTASH_REDIS_REST_TOKEN), from: 'UPSTASH_REDIS_REST_*' }
  return kv.url && kv.token ? kv : up
}
export const configured = () => !!(env().url && env().token)
export const statsKey = () => clean(process.env.STATS_KEY) ?? ''

export type Cmd = (string | number)[]

export async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
  const { url, token } = env()
  const r = await fetch(`${url!.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  })
  if (!r.ok) throw new Error(`redis ${r.status} (${env().from})`)
  const out = (await r.json()) as { result?: unknown; error?: string }[]
  return out.map((o) => {
    if (o.error) throw new Error(o.error)
    return o.result
  })
}

/** Day / month / hour on the clock of the Netherlands. */
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
})
export function clock(t = Date.now()) {
  const p: Record<string, string> = {}
  for (const x of fmt.formatToParts(t)) p[x.type] = x.value
  return { day: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}`, hour: String(Number(p.hour)) }
}

/** The `n` days up to and including `day`, oldest first. */
export function daysBack(day: string, n: number) {
  const base = Date.parse(`${day}T12:00:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86400000).toISOString().slice(0, 10))
}

/** Daily keys live a bit over a year. */
export const TTL = 400 * 86400
/** Seen within this window = online (pings come every 90 s while the tab is visible). */
export const ONLINE_MS = 200_000
