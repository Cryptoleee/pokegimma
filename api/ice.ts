import { clean } from './_redis.js'

/**
 * ICE servers for the WebRTC connections between players. STUN alone only works
 * when both networks allow a direct connection; on mobile data and strict routers
 * the traffic has to go through a TURN relay. Uses Cloudflare's TURN service
 * (CF_TURN_KEY_ID + CF_TURN_API_TOKEN, short-lived credentials) or any TURN
 * server via TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL. Without those: STUN only.
 */
declare const process: { env: Record<string, string | undefined> }

const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const TTL = 86400
let cache: { at: number; servers: RTCIceServer[] } | null = null

const json = (data: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': maxAge ? `private, max-age=${maxAge}` : 'no-store' },
  })

/** Browsers refuse port 53, so those entries only slow the connection down. */
const noPort53 = (s: RTCIceServer): RTCIceServer => ({
  ...s,
  urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)),
})

async function cloudflare(id: string, token: string): Promise<RTCIceServer[] | null> {
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL }),
  })
  if (!r.ok) return null
  const data = (await r.json()) as { iceServers?: RTCIceServer | RTCIceServer[] }
  const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : []
  return list.length ? list.map(noPort53) : null
}

export async function GET(req: Request) {
  // Only for our own pages
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return json({ error: 'forbidden' }, 403)
  const e = process.env
  // Credentials stay valid for a day; hand out the same ones for an hour
  if (cache && Date.now() - cache.at < 3600_000) return json({ iceServers: cache.servers, turn: true }, 200, 1800)
  try {
    const id = clean(e.CF_TURN_KEY_ID), token = clean(e.CF_TURN_API_TOKEN)
    if (id && token) {
      const servers = await cloudflare(id, token)
      if (servers) {
        cache = { at: Date.now(), servers }
        return json({ iceServers: servers, turn: true }, 200, 1800)
      }
    }
    const urls = clean(e.TURN_URLS)
    if (urls) {
      const servers = [...STUN, { urls: urls.split(',').map((u) => u.trim()).filter(Boolean), username: clean(e.TURN_USERNAME), credential: clean(e.TURN_CREDENTIAL) }]
      return json({ iceServers: servers, turn: true }, 200, 1800)
    }
  } catch {
    /* fall back to STUN */
  }
  return json({ iceServers: STUN, turn: false })
}
