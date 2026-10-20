import { Peer, type DataConnection, type PeerOptions } from 'peerjs'
import type { ChatLine, Command, GuestMsg, HostMsg, LobbyPlayer, MatchChoice } from './protocol'
import { L, tx } from '../i18n'

/**
 * A multiplayer room: one phone hosts, the others join with a 4-letter code.
 * Phones talk directly to each other over WebRTC (PeerJS only helps them find
 * each other), so there's no game server to run.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PREFIX = 'battlemon-royale-v1-'
export const MAX_PLAYERS = 12

/**
 * Quick play: public lobbies live at fixed peer ids (slot 0, 1, 2, ...). The first
 * player to look claims slot 0 and hosts it; the next ones find it taken and join.
 * A lobby that's full or already playing sends newcomers on to the next slot.
 * Bump the version whenever the protocol changes so builds don't mix.
 */
const QUICK_PREFIX = 'stormbreak-quick-v1-'
export const QUICK_SLOTS = 6
/** Humans in a quick game before it starts right away. */
export const QUICK_MAX = 8
/** Seconds a fresh quick lobby waits for others. */
export const QUICK_WAIT = 45
/** 1 vs 1 quick play: its own set of public lobbies (slot numbers from DUEL_SLOT up). */
const DUEL_PREFIX = 'stormbreak-duel-v1-'
export const DUEL_SLOT = 100
/** Seconds a fresh 1 vs 1 lobby waits for an opponent (then it's you against the CPU). */
export const DUEL_WAIT = 30
const quickId = (slot: number) => (slot >= DUEL_SLOT ? DUEL_PREFIX + (slot - DUEL_SLOT) : QUICK_PREFIX + slot)
const quickCode = (slot: number) => (slot >= DUEL_SLOT ? `D${slot - DUEL_SLOT}` : `Q${slot}`)

/**
 * Why the host sends someone away. The host sends the English text; each guest
 * shows it in their own language (an unknown reason is shown as is).
 */
const BYE = {
  running: { en: 'This match has already started.', nl: 'Dit potje is al bezig.' },
  full: { en: 'This match is full.', nl: 'Dit potje zit vol.' },
  closed: { en: 'The host closed the match.', nl: 'De host heeft het potje gesloten.' },
}
const byeText = (reason: string) => {
  const b = Object.values(BYE).find((r) => r.en === reason || r.nl === reason)
  return b ? tx(b) : reason
}

/** How one public lobby is doing (from a peek). */
export interface QuickStatus {
  slot: number
  players: number
  running: boolean
  open: boolean
}

export const newCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)

/** `?peer=host:port` points at a self-hosted PeerJS server (handy for testing). */
function peerOptions(): PeerOptions {
  const custom = new URLSearchParams(location.search).get('peer')
  if (!custom) return { debug: 0 }
  const [host, port] = custom.split(':')
  return { debug: 0, host, port: Number(port || 9000), path: '/', secure: location.protocol === 'https:' }
}

export interface RoomEvents {
  /** Lobby changed (someone joined, left or picked a new team). */
  lobby(): void
  /** Room is gone: host left, connection lost, or it never opened. */
  closed(reason: string): void
  /** Guest only: a message from the host while in a match. */
  host?(msg: HostMsg): void
  /** Host only: a command from a player in the match. */
  command?(pid: string, c: Command): void
  /** Host only: a player disconnected. */
  left?(p: LobbyPlayer): void
  /** Someone said something in the chat (including you). */
  chat?(m: ChatLine): void
}

export const CHAT_MAX = 80
const cleanChat = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)

export class Room {
  peer: Peer | null = null
  code = ''
  players: LobbyPlayer[] = []
  /** Mode and world/boss for the next match (host decides). */
  choice: MatchChoice = { kind: 'royale', theme: 'random' }
  /** Recent chat, oldest first. */
  chatLog: ChatLine[] = []
  /** Host: a match is still being played. Guests get this through the lobby message. */
  running = false
  /** Quick play: a public lobby that starts on a timer (slot number, or -1 for a private room). */
  quickSlot = -1
  /** Quick play: when the next match starts (performance.now ms; host decides, guests follow). */
  quickEnds = 0
  private conns = new Map<string, DataConnection>()
  /** Host: when we last heard from each player (to notice phones that vanished). */
  private seen = new Map<DataConnection, number>()
  private beat = 0
  private host: DataConnection | null = null
  private closed = false

  private constructor(public role: 'host' | 'guest', public me: LobbyPlayer, public on: RoomEvents) {
    // Heartbeat: both sides ping every 2 s and drop the other after 10 s of silence
    this.beat = window.setInterval(() => this.heartbeat(), 2000)
  }

  private heartbeat() {
    if (this.closed) return clearInterval(this.beat)
    const now = performance.now()
    if (this.isHost) {
      for (const c of this.conns.values()) {
        if (c.open) c.send({ t: 'ping' } satisfies HostMsg)
        if (now - (this.seen.get(c) ?? now) > 10000) c.close()
      }
    } else if (this.host?.open) {
      this.host.send({ t: 'ping' } satisfies GuestMsg)
      if (now - (this.seen.get(this.host) ?? now) > 10000) this.shut(L('Lost the connection to the host.', 'De verbinding met de host is weggevallen.'))
    }
  }

  get isHost() {
    return this.role === 'host'
  }

  get quick() {
    return this.quickSlot >= 0
  }

  /** People this room takes: 2 for a duel, otherwise a full lobby. */
  get cap() {
    return this.choice.kind === 'duel' ? 2 : this.quick ? QUICK_MAX : MAX_PLAYERS
  }

  /** Quick play: how long a fresh lobby waits for others. */
  get quickWait() {
    return this.choice.kind === 'duel' ? DUEL_WAIT : QUICK_WAIT
  }

  /** Opens a new room and resolves with it once others can join. */
  static create(me: LobbyPlayer, on: RoomEvents): Promise<Room> {
    return Room.host(me, on, -1)
  }

  /**
   * Host a room: a private one with a fresh code, or public quick-play slot `slot`.
   * A taken quick slot rejects with the message 'taken'.
   */
  private static host(me: LobbyPlayer, on: RoomEvents, slot: number): Promise<Room> {
    const room = new Room('host', me, on)
    room.players = [me]
    room.quickSlot = slot
    if (slot >= DUEL_SLOT) room.choice = { kind: 'duel', theme: 'random' }
    return new Promise((resolve, reject) => {
      let tries = 0
      const open = () => {
        room.code = slot >= 0 ? quickCode(slot) : newCode()
        const peer = new Peer(slot >= 0 ? quickId(slot) : PREFIX + room.code, peerOptions())
        room.peer = peer
        peer.on('open', () => {
          if (slot >= 0) room.quickEnds = performance.now() + room.quickWait * 1000
          resolve(room)
        })
        peer.on('connection', (c) => room.accept(c))
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && slot >= 0) {
            room.closed = true
            peer.destroy()
            reject(new Error('taken'))
          } else if (e.type === 'unavailable-id' && tries++ < 5) {
            peer.destroy()
            open()
          } else if (!peer.open) {
            room.closed = true
            peer.destroy()
            reject(new Error(friendlyError(e.type)))
          } else console.warn('[room]', e.type, e.message)
        })
        peer.on('disconnected', () => {
          // Lost the matchmaking server; existing connections keep working. Try to get back.
          if (!room.closed) setTimeout(() => !room.closed && !peer.destroyed && peer.reconnect(), 1500)
        })
      }
      open()
    })
  }

  /** Joins someone's room by code. */
  static join(code: string, me: LobbyPlayer, on: RoomEvents): Promise<Room> {
    return Room.connect(PREFIX + code, code, me, on, 12000, -1)
  }

  private static connect(id: string, code: string, me: LobbyPlayer, on: RoomEvents, timeoutMs: number, slot: number): Promise<Room> {
    const room = new Room('guest', me, on)
    room.code = code
    room.quickSlot = slot
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions())
      room.peer = peer
      let settled = false
      const fail = (msg: string) => {
        if (settled) return
        settled = true
        room.closed = true
        clearInterval(room.beat)
        peer.destroy()
        reject(new Error(msg))
      }
      const timer = setTimeout(() => fail(L('No connection. Are you both online?', 'Geen verbinding. Zitten jullie allebei op internet?')), timeoutMs)
      peer.on('error', (e) => {
        if (!settled) fail(friendlyError(e.type, code))
        else console.warn('[room]', e.type, e.message)
      })
      peer.on('open', () => {
        const c = peer.connect(id, { reliable: true, serialization: 'json' })
        room.host = c
        c.on('open', () => c.send({ t: 'hello', p: me } satisfies GuestMsg))
        c.on('data', (d) => {
          const msg = d as HostMsg
          room.seen.set(c, performance.now())
          if (msg.t === 'ping') return
          if (!settled) {
            if (msg.t === 'bye') return fail(byeText(msg.reason))
            settled = true
            clearTimeout(timer)
            resolve(room)
          }
          room.fromHost(msg)
        })
        c.on('close', () => {
          if (!settled) fail(L('The connection was lost.', 'De verbinding werd verbroken.'))
          else room.shut(L('The host left the match.', 'De host heeft het potje verlaten.'))
        })
        c.on('error', () => fail(L('The connection was lost.', 'De verbinding werd verbroken.')))
      })
    })
  }

  /**
   * Quick play: join the first public lobby that has room, or host a new one.
   * Each slot: try to claim it (instant if it's free); if it's taken, join it;
   * if that lobby is full, playing, or doesn't answer, move on to the next slot.
   * `skip` leaves out a slot (the one you just left).
   */
  static async quick(me: LobbyPlayer, on: RoomEvents, skip = -1, duel = false): Promise<Room> {
    const base = duel ? DUEL_SLOT : 0
    for (let slot = base; slot < base + QUICK_SLOTS; slot++) {
      if (slot === skip) continue
      try {
        return await Room.host(me, on, slot)
      } catch (e) {
        if ((e as Error).message !== 'taken') throw e
      }
      try {
        return await Room.connect(quickId(slot), quickCode(slot), me, on, 4500, slot)
      } catch {
        /* full, playing or gone: next slot */
      }
    }
    throw new Error(L('All public lobbies are full. Try again in a moment.', 'Alle openbare lobby’s zitten vol. Probeer het zo nog eens.'))
  }

  /** Quick play: join one particular public lobby (moving over from your own empty one). */
  static joinQuick(slot: number, me: LobbyPlayer, on: RoomEvents): Promise<Room> {
    return Room.connect(quickId(slot), quickCode(slot), me, on, 4500, slot)
  }

  // ---------------- host ----------------

  /** Quick play, host: can a newcomer get in right now? */
  private get quickOpen() {
    return !this.running && this.players.length < this.cap
  }

  private accept(c: DataConnection) {
    let pid = ''
    c.on('data', (d) => {
      const msg = d as GuestMsg
      this.seen.set(c, performance.now())
      if (msg.t === 'ping') return
      if (msg.t === 'peek') {
        c.send({ t: 'status', players: this.players.length, running: this.running, open: this.quick && this.quickOpen } satisfies HostMsg)
        setTimeout(() => c.close(), 200)
        return
      }
      if (msg.t === 'chat') {
        const p = this.players.find((x) => x.pid === pid)
        if (p) this.addChat({ pid, name: p.name, text: msg.text })
        return
      }
      if (msg.t === 'hello') {
        const known = this.players.some((p) => p.pid === msg.p.pid)
        const turnAway = !known && (this.quick ? !this.quickOpen : this.players.length >= this.cap)
        if (turnAway) {
          c.send({ t: 'bye', reason: this.running ? BYE.running.en : BYE.full.en } satisfies HostMsg)
          setTimeout(() => c.close(), 300)
          return
        }
        // Quick play: someone new joined, give others a moment longer to find us too
        if (this.quick && !known) {
          const now = performance.now()
          this.quickEnds = this.players.length + 1 >= this.cap ? Math.min(this.quickEnds, now + 5000) : Math.max(this.quickEnds, now + 12000)
        }
        pid = msg.p.pid
        // Same player reconnecting on a new connection: drop the old one (not this one;
        // a hello on the same connection is just a lobby update like a new team or "Klaar")
        const old = this.conns.get(pid)
        if (old && old !== c) old.close()
        this.conns.set(pid, c)
        const i = this.players.findIndex((p) => p.pid === pid)
        if (i >= 0) this.players[i] = msg.p
        else this.players.push(msg.p)
        this.broadcastLobby()
        this.on.lobby()
      } else if (msg.t === 'cmd' && pid) this.on.command?.(pid, msg.c)
    })
    c.on('close', () => {
      this.seen.delete(c)
      if (!pid || this.conns.get(pid) !== c) return
      this.conns.delete(pid)
      const p = this.players.find((x) => x.pid === pid)
      this.players = this.players.filter((x) => x.pid !== pid)
      if (p) this.on.left?.(p)
      this.broadcastLobby()
      this.on.lobby()
    })
  }

  broadcastLobby() {
    if (!this.isHost) return
    const msg: HostMsg = {
      t: 'lobby', players: this.players, running: this.running, choice: this.choice,
      ...(this.quick ? { quick: { endsIn: Math.max(0, Math.round(this.quickEnds - performance.now())) } } : {}),
    }
    for (const c of this.conns.values()) if (c.open) c.send(msg)
  }

  /** Host: message to one player. */
  sendTo(pid: string, msg: HostMsg) {
    const c = this.conns.get(pid)
    if (c?.open) c.send(msg)
  }

  /** Host: update your own lobby entry (new team or name). */
  updateMe(p: LobbyPlayer) {
    this.me = p
    if (this.isHost) {
      this.players[0] = p
      this.broadcastLobby()
      this.on.lobby()
    } else if (this.host?.open) this.host.send({ t: 'hello', p } satisfies GuestMsg)
  }

  /** Host: change mode / world / boss for the next match. */
  setChoice(c: MatchChoice) {
    this.choice = c
    this.broadcastLobby()
    this.on.lobby()
  }

  setRunning(running: boolean) {
    this.running = running
    // Quick play: after a match, the next one starts on a fresh timer
    if (!running && this.quick) this.quickEnds = performance.now() + this.quickWait * 1000
    this.broadcastLobby()
    this.on.lobby()
  }

  /** Host: record a chat line and pass it on to everyone. */
  private addChat(m: ChatLine) {
    const text = cleanChat(m.text)
    if (!text) return
    const line = { ...m, text }
    this.pushChat(line)
    for (const c of this.conns.values()) if (c.open) c.send({ t: 'chat', m: line } satisfies HostMsg)
  }

  private pushChat(m: ChatLine) {
    this.chatLog.push(m)
    if (this.chatLog.length > 40) this.chatLog.shift()
    this.on.chat?.(m)
  }

  /** Say something in the room chat. */
  say(text: string) {
    text = cleanChat(text)
    if (!text) return
    if (this.isHost) this.addChat({ pid: this.me.pid, name: this.me.name, text })
    else if (this.host?.open) this.host.send({ t: 'chat', text } satisfies GuestMsg)
  }

  // ---------------- guest ----------------

  private fromHost(msg: HostMsg) {
    if (msg.t === 'chat') return this.pushChat(msg.m)
    if (msg.t === 'lobby') {
      this.players = msg.players
      this.running = msg.running
      if (msg.choice) this.choice = msg.choice
      if (msg.quick) this.quickEnds = performance.now() + msg.quick.endsIn
      this.on.lobby()
    } else if (msg.t === 'bye') this.shut(byeText(msg.reason))
    else this.on.host?.(msg)
  }

  /** Guest: send a command to the host. */
  command(c: Command) {
    if (this.host?.open) this.host.send({ t: 'cmd', c } satisfies GuestMsg)
  }

  // ---------------- both ----------------

  private shut(reason: string) {
    if (this.closed) return
    this.closed = true
    clearInterval(this.beat)
    this.peer?.destroy()
    this.on.closed(reason)
  }

  /** Leave the room (as host this ends it for everyone). */
  leave() {
    if (this.closed) return
    this.closed = true
    clearInterval(this.beat)
    if (this.isHost) for (const c of this.conns.values()) if (c.open) c.send({ t: 'bye', reason: BYE.closed.en } satisfies HostMsg)
    setTimeout(() => this.peer?.destroy(), 200)
  }

  /** Link that opens the game and joins this room straight away. */
  get link() {
    const u = new URL(location.href)
    u.search = ''
    u.hash = ''
    u.searchParams.set('join', this.code)
    const peer = new URLSearchParams(location.search).get('peer')
    if (peer) u.searchParams.set('peer', peer)
    return u.toString()
  }
}

function friendlyError(type: string, code = '') {
  switch (type) {
    case 'peer-unavailable':
      return L(`No match found with code ${code}. Is the code right?`, `Geen potje gevonden met code ${code}. Klopt de code?`)
    case 'browser-incompatible':
      return L('This browser doesn’t support multiplayer. Try Chrome or Safari.', 'Deze browser ondersteunt geen multiplayer. Probeer Chrome of Safari.')
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return L('Can’t reach the multiplayer server. Check your internet.', 'Kan de multiplayer-server niet bereiken. Check je internet.')
    default:
      return L('Something went wrong with the connection.', 'Er ging iets mis met de verbinding.')
  }
}

/**
 * Quick play: how busy are the public lobbies? Peeks at every slot at once from
 * one shared connection to the PeerJS server (kept open while you're on the menu).
 */
let probePeer: Peer | null = null
export function probeQuick(duel = false): Promise<QuickStatus[]> {
  const base = duel ? DUEL_SLOT : 0
  return new Promise((resolve) => {
    const out: QuickStatus[] = []
    let left = QUICK_SLOTS
    const done = () => --left <= 0 && resolve(out.sort((a, b) => a.slot - b.slot))
    const run = (peer: Peer) => {
      for (let slot = base; slot < base + QUICK_SLOTS; slot++) {
        let finished = false
        const finish = () => {
          if (finished) return
          finished = true
          done()
        }
        const c = peer.connect(quickId(slot), { serialization: 'json' })
        c.on('open', () => c.send({ t: 'peek' } satisfies GuestMsg))
        c.on('data', (d) => {
          const m = d as HostMsg
          if (m.t !== 'status') return
          out.push({ slot, players: m.players, running: m.running, open: m.open })
          c.close()
          finish()
        })
        c.on('close', finish)
        c.on('error', finish)
        setTimeout(finish, 6000)
      }
    }
    if (probePeer && !probePeer.destroyed && probePeer.open) return run(probePeer)
    probePeer?.destroy()
    const peer = new Peer(peerOptions())
    probePeer = peer
    // An empty slot shows up here as 'peer-unavailable'; that slot's timer just runs out
    peer.on('error', () => {})
    peer.on('open', () => run(peer))
    setTimeout(() => !peer.open && resolve(out), 6000)
  })
}

/** Leaving the menu: drop the probe connection. */
export function stopProbe() {
  probePeer?.destroy()
  probePeer = null
}
