import { Peer, type DataConnection, type PeerOptions } from 'peerjs'
import type { ChatLine, Command, GuestMsg, HostMsg, LobbyPlayer, MatchChoice } from './protocol'

/**
 * A multiplayer room: one phone hosts, the others join with a 4-letter code.
 * Phones talk directly to each other over WebRTC (PeerJS only helps them find
 * each other), so there's no game server to run.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PREFIX = 'battlemon-royale-v1-'
export const MAX_PLAYERS = 12

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
  choice: MatchChoice = { kind: 'royale', theme: 'random', boss: 'reshiram' }
  /** Recent chat, oldest first. */
  chatLog: ChatLine[] = []
  /** Host: a match is still being played. Guests get this through the lobby message. */
  running = false
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
      if (now - (this.seen.get(this.host) ?? now) > 10000) this.shut('De verbinding met de host is weggevallen.')
    }
  }

  get isHost() {
    return this.role === 'host'
  }

  /** Opens a new room and resolves with it once others can join. */
  static create(me: LobbyPlayer, on: RoomEvents): Promise<Room> {
    const room = new Room('host', me, on)
    room.players = [me]
    return new Promise((resolve, reject) => {
      let tries = 0
      const open = () => {
        room.code = newCode()
        const peer = new Peer(PREFIX + room.code, peerOptions())
        room.peer = peer
        peer.on('open', () => resolve(room))
        peer.on('connection', (c) => room.accept(c))
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && tries++ < 5) {
            peer.destroy()
            open()
          } else if (!peer.open) {
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
    const room = new Room('guest', me, on)
    room.code = code
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions())
      room.peer = peer
      let settled = false
      const fail = (msg: string) => {
        if (settled) return
        settled = true
        peer.destroy()
        reject(new Error(msg))
      }
      const timer = setTimeout(() => fail('Geen verbinding. Zitten jullie allebei op internet?'), 12000)
      peer.on('error', (e) => {
        if (!settled) fail(friendlyError(e.type, code))
        else console.warn('[room]', e.type, e.message)
      })
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })
        room.host = c
        c.on('open', () => c.send({ t: 'hello', p: me } satisfies GuestMsg))
        c.on('data', (d) => {
          const msg = d as HostMsg
          room.seen.set(c, performance.now())
          if (msg.t === 'ping') return
          if (!settled) {
            if (msg.t === 'bye') return fail(msg.reason)
            settled = true
            clearTimeout(timer)
            resolve(room)
          }
          room.fromHost(msg)
        })
        c.on('close', () => {
          if (!settled) fail('De verbinding werd verbroken.')
          else room.shut('De host heeft het potje verlaten.')
        })
        c.on('error', () => fail('De verbinding werd verbroken.'))
      })
    })
  }

  // ---------------- host ----------------

  private accept(c: DataConnection) {
    let pid = ''
    c.on('data', (d) => {
      const msg = d as GuestMsg
      this.seen.set(c, performance.now())
      if (msg.t === 'ping') return
      if (msg.t === 'chat') {
        const p = this.players.find((x) => x.pid === pid)
        if (p) this.addChat({ pid, name: p.name, text: msg.text })
        return
      }
      if (msg.t === 'hello') {
        if (this.players.length >= MAX_PLAYERS && !this.players.some((p) => p.pid === msg.p.pid)) {
          c.send({ t: 'bye', reason: 'Dit potje zit vol.' } satisfies HostMsg)
          setTimeout(() => c.close(), 300)
          return
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
    const msg: HostMsg = { t: 'lobby', players: this.players, running: this.running, choice: this.choice }
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
      this.on.lobby()
    } else if (msg.t === 'bye') this.shut(msg.reason)
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
    if (this.isHost) for (const c of this.conns.values()) if (c.open) c.send({ t: 'bye', reason: 'De host heeft het potje gesloten.' } satisfies HostMsg)
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
      return `Geen potje gevonden met code ${code}. Klopt de code?`
    case 'browser-incompatible':
      return 'Deze browser ondersteunt geen multiplayer. Probeer Chrome of Safari.'
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Kan de multiplayer-server niet bereiken. Check je internet.'
    default:
      return 'Er ging iets mis met de verbinding.'
  }
}
