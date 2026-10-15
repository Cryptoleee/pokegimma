/**
 * ICE servers for player-to-player connections, from /api/ice (with a TURN relay
 * when it's set up, so phones on mobile data can reach each other too).
 * Until that answers, or without the API (local dev), public STUN servers.
 */
const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]

let servers: RTCIceServer[] = STUN
let fetchedAt = 0
let loading: Promise<void> | null = null

export const iceServers = () => servers

/** Fetch (or refresh, after 12 h) the ICE servers. */
export function loadIce(): Promise<void> {
  if (fetchedAt && Date.now() - fetchedAt < 12 * 3600_000) return Promise.resolve()
  loading ??= fetch('/api/ice', { credentials: 'same-origin' })
    .then((r) => ((r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
    .then((d: { iceServers?: RTCIceServer[] } | null) => {
      if (Array.isArray(d?.iceServers) && d.iceServers.length) {
        servers = d.iceServers
        fetchedAt = Date.now()
      }
    })
    .catch(() => {})
    .finally(() => (loading = null))
  return loading
}

/** Wait for the ICE servers, but never longer than a moment. */
export const iceReady = () => Promise.race([loadIce(), new Promise<void>((r) => setTimeout(r, 2500))])
