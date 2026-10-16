import { getLang } from './i18n'

/**
 * Anonymous play stats for the creator panel (/stats). A random id per device
 * (not your player id or name), sent with sendBeacon to /api/t. Nothing is
 * sent on localhost or the local network, or on a device excluded from the panel.
 */

export type PlayState = 'menu' | 'lobby' | 'br' | 'raid'
type Event = Record<string, string | number | undefined>

const ID_KEY = 'sb:sid'
export const OPT_OUT_KEY = 'sb:nostats'
const PING_MS = 90_000
const VIA_KEY = 'sb:via'
const VIA_PLAYED_KEY = 'sb:viaPlayed'

const local = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])|\.local$/.test(location.hostname)
const forced = new URLSearchParams(location.search).get('stats') === 'force'
let on = forced || !local
try {
  if (localStorage.getItem(OPT_OUT_KEY) === '1') on = false
} catch {
  /* private mode */
}

let fresh = 0
let id = ''
const makeId = () => {
  try {
    const v = localStorage.getItem(ID_KEY)
    if (v) return v
    const n = crypto.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    localStorage.setItem(ID_KEY, n)
    fresh = 1
    return n
  } catch {
    fresh = 1
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  }
}

function send(e: Event) {
  if (!on || !id) return
  const body = JSON.stringify({ ...e, id })
  try {
    if (navigator.sendBeacon?.('/api/t', body)) return
  } catch {
    /* fall through */
  }
  fetch('/api/t', { method: 'POST', body, keepalive: true }).catch(() => {})
}

let getState: () => PlayState = () => 'menu'
let lastPing = 0
let lastState = ''
let timer = 0

function ping() {
  if (document.visibilityState !== 'visible') return
  const now = Date.now()
  const s = getState()
  // Seconds in a match since the last ping (play time per mode)
  const dt = lastPing && (lastState === 'br' || lastState === 'raid') ? Math.min(300, Math.round((now - lastPing) / 1000)) : 0
  lastPing = now
  lastState = s
  send({ e: 'ping', s, dt })
}

/** Start: one visit, then a ping every 90 s while the tab is visible. */
export function initStats(state: () => PlayState) {
  getState = state
  id = makeId()
  const ref = (() => {
    const via = new URLSearchParams(location.search).get('via')
    if (via && /^[a-z0-9-]{1,20}$/i.test(via)) {
      // Remember where this device first came from, to count who went on to play
      try {
        if (!localStorage.getItem(VIA_KEY)) localStorage.setItem(VIA_KEY, via.toLowerCase())
      } catch {
        /* private mode */
      }
      return via.toLowerCase()
    }
    try {
      const h = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''
      return h && h !== location.hostname ? h.slice(0, 40) : undefined
    } catch {
      return undefined
    }
  })()
  send({ e: 'visit', dev: matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop', lang: getLang(), fresh, ref })
  ping()
  timer = window.setInterval(ping, PING_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastPing = 0
      ping()
    } else send({ e: 'ping', s: 'off' })
  })
  addEventListener('pagehide', () => send({ e: 'ping', s: 'off' }))
}

/** The state changed (menu → lobby → match): tell the panel soon, not 90 s later. */
export function statsStateChanged() {
  // After the caller has switched screens
  setTimeout(() => {
    if (timer && getState() !== lastState) ping()
  }, 300)
}

export function trackMatch(e: { k: 'br' | 'raid'; m: 'solo' | 'quick' | 'friends'; mon?: number; w?: string; boss?: string; h: number }) {
  // The first match of a device that came in via a ?via= link counts as "played" for that source
  let src: string | undefined
  try {
    const via = localStorage.getItem(VIA_KEY)
    if (via && !localStorage.getItem(VIA_PLAYED_KEY)) {
      localStorage.setItem(VIA_PLAYED_KEY, '1')
      src = via
    }
  } catch {
    /* private mode */
  }
  send({ e: 'match', ...e, src })
  statsStateChanged()
}

export function trackEnd(e: { k: 'br' | 'raid'; m: 'solo' | 'quick' | 'friends'; r: 'win' | 'lose' | 'clear' | 'fail'; boss?: string }) {
  send({ e: 'end', ...e })
}
