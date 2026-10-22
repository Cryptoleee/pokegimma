/**
 * A second screen (the AYN Thor's lower display, or any second window): the
 * game sends what's going on a few times a second, the second screen sends
 * taps back (use an item, switch Pokémon, say something).
 *
 * Two ways in, same messages:
 * - "/duo" opened in another window of the same browser: a BroadcastChannel.
 * - The Presentation API (Options → Second screen), where the browser offers
 *   the extra display: a PresentationConnection.
 */

export interface DuoMon {
  id: number
  name: string
  lv: number
  hp: number
  max: number
  active: boolean
  fainted: boolean
  shiny: boolean
}

export interface DuoState {
  t: 'state'
  scene: 'menu' | 'lobby' | 'match' | 'watch'
  kind?: 'royale' | 'duel' | 'raid'
  /** Header: a small label and a big line, ready to show (already in the player's language). */
  label: string
  title: string
  sub: string
  lang: 'en' | 'nl'
  party?: DuoMon[]
  items?: { master: number; potion: number; revive: number }
  /** Battle royale: the minimap as a picture. */
  mini?: string
  boss?: { name: string; species: number; k: number; phase: number; lives: number }
  duel?: { mine: number; theirs: number; opp: string }
  chat: { name: string; text: string; mine: boolean }[]
  canChat: boolean
  /** Menu: your team. */
  trainer?: string
  mon?: number
}

export type DuoCmd =
  | { t: 'cmd'; c: 'item'; key: 'master' | 'potion' | 'revive' }
  | { t: 'cmd'; c: 'switch'; i: number }
  | { t: 'cmd'; c: 'say'; text: string }
  | { t: 'cmd'; c: 'board' }
  | { t: 'cmd'; c: 'pause' }

export type DuoMsg = DuoState | DuoCmd | { t: 'hello' }

export const DUO_CHANNEL = 'stormbreak-duo'

/** The bits of the Presentation API we use (not in TypeScript's DOM types). */
export interface PresentationConnection {
  state: 'connecting' | 'connected' | 'closed' | 'terminated'
  send(data: string): void
  onmessage: ((e: MessageEvent) => void) | null
  onclose: (() => void) | null
  onterminate: (() => void) | null
}
export interface PresentationConnectionList {
  connections: PresentationConnection[]
  onconnectionavailable: ((e: { connection: PresentationConnection }) => void) | null
}
type PresentationRequestCtor = new (urls: string[]) => { start(): Promise<PresentationConnection> }

// ---------------------------------------------------------------- the game's side

/** This window is the second screen itself (/duo), not the game. */
export const isDuoPage = /^\/duo(\/|\.html)?$/.test(location.pathname) || new URLSearchParams(location.search).get('screen') === '2'

const channel = !isDuoPage && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DUO_CHANNEL) : null
const conns: PresentationConnection[] = []
let seen = 0
let lastPush = 0
let lastMini = 0
let hooks: { state: (withMini: boolean) => DuoState; cmd: (c: DuoCmd) => void } | null = null

function receive(d: unknown) {
  const m = d as DuoMsg | null
  if (!m || typeof m !== 'object') return
  if (m.t === 'hello') {
    const fresh = !connected()
    seen = performance.now()
    if (fresh) push(true)
  } else if (m.t === 'cmd') hooks?.cmd(m)
}
if (channel) channel.onmessage = (e) => receive(e.data)

function wire(c: PresentationConnection) {
  conns.push(c)
  c.onmessage = (e) => {
    try {
      receive(JSON.parse(String(e.data)))
    } catch {
      /* not ours */
    }
  }
  c.onterminate = c.onclose = () => conns.splice(conns.indexOf(c), 1)
}

function send(m: DuoMsg) {
  channel?.postMessage(m)
  const text = conns.length ? JSON.stringify(m) : ''
  for (const c of conns) if (c.state === 'connected') c.send(text)
}

/** A second screen said hello in the last few seconds (or a presentation is open). */
export const connected = () => performance.now() - seen < 6000 || conns.some((c) => c.state === 'connected')

function push(withMini = false) {
  if (!hooks) return
  const now = performance.now()
  const mini = withMini || now - lastMini > 500
  if (mini) lastMini = now
  lastPush = now
  send(hooks.state(mini))
}

export function duoInit(h: NonNullable<typeof hooks>) {
  hooks = h
}

/** Call every frame: sends the state four times a second while a second screen listens. */
export function duoTick() {
  const on = connected()
  document.body.classList.toggle('duo-on', on)
  if (on && performance.now() - lastPush > 250) push()
}

/** Something changed right now (a chat line, a switch): send it without waiting. */
export function duoNow() {
  if (connected()) push()
}

/**
 * Options → Second screen: present /duo on another display through the
 * browser. 'unavailable' when the browser can't (then the player opens /duo
 * themselves).
 */
export async function presentDuo(): Promise<'presented' | 'unavailable' | 'cancelled'> {
  const Req = (window as unknown as { PresentationRequest?: PresentationRequestCtor }).PresentationRequest
  if (!Req) return 'unavailable'
  try {
    const conn = await new Req(['/duo/']).start()
    wire(conn)
    return 'presented'
  } catch (e) {
    return (e as DOMException).name === 'NotAllowedError' ? 'cancelled' : 'unavailable'
  }
}
