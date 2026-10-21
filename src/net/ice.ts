/**
 * ICE servers for player-to-player connections, from /api/ice: a TURN relay
 * when one is set up, so players on mobile data or behind strict routers can
 * still reach each other. Without one (or until it answers, or in local dev)
 * PeerJS keeps its own defaults, exactly as before.
 */
let servers: RTCIceServer[] | null = null
let fetchedAt = 0
let loading: Promise<void> | null = null

/** The relay servers, or null when there are none (use PeerJS's defaults). */
export const iceServers = () => servers

/** Fetch (or refresh, after 12 h) the ICE servers. */
export function loadIce(): Promise<void> {
  if (fetchedAt && Date.now() - fetchedAt < 12 * 3600_000) return Promise.resolve()
  loading ??= fetch('/api/ice', { credentials: 'same-origin' })
    .then((r) => ((r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
    .then((d: { iceServers?: RTCIceServer[]; turn?: boolean } | null) => {
      if (d?.turn && Array.isArray(d.iceServers) && d.iceServers.length) {
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
