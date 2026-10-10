import './style.css'
import { ROSTER, TEAM_SIZE } from './data/pokemon'
import { BOSS_LIST, type BossId } from './data/bosses'
import { TRAINERS, type TrainerDef } from './data/trainers'
import { Game, INTRO_TIME, SEATS, type GameHooks, type GameResult, type MatchSetup } from './game/game'
import { render, view } from './game/render'
import { TILE } from './game/world'
import { Hud } from './ui/hud'
import { clearScreen, showLeaveConfirm, showPartyFull } from './ui/screens'
import { showIntro } from './ui/intro'
import { showTitle } from './ui/title'
import { showRoster, showTrainerSelect } from './ui/select'
import { showResults } from './ui/results'
import { showEvolution } from './ui/cutscene'
import { showLobby, showMenu, type MenuState } from './ui/menu'
import { showLoading } from './ui/loading'
import { wipe } from './ui/transition'
import { playMusic, setTempo } from './music'
import { profile } from './profile'
import { cleanCode, Room } from './net/room'
import type { ChatLine, HostMsg, LobbyPlayer, MatchChoice } from './net/protocol'
import { pickTheme } from './data/themes'
import { applyEvents, applySnapshot, initClient, recordVfx, remoteViewer, runCommand, snapshot, type RemoteViewer } from './net/sync'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudRoot = document.getElementById('hud')!

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`battlemon:${k}`)
      return v ? (JSON.parse(v) as T) : d
    } catch {
      return d
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`battlemon:${k}`, JSON.stringify(v))
    } catch {
      /* private mode */
    }
  },
}

let trainer: TrainerDef = TRAINERS.find((t) => t.key === store.get('trainer', '')) ?? TRAINERS[0]
let team: number[] = store.get<number[]>('team', []).filter((id) => ROSTER.includes(id))
if (team.length !== TEAM_SIZE) team = [ROSTER[0]]
let game: Game | null = null
let hud: Hud | null = null
/** The match is on screen (false while the host sits in the lobby and the match runs on). */
let viewing = false

/** Multiplayer room, if you're in one. */
let room: Room | null = null
let lobbyUi: ReturnType<typeof showLobby> | null = null
/** Host: remote players in the running match, by player id. */
const remotes = new Map<string, RemoteViewer>()
let netT = 0
/** Join code from a shared link (?join=ABCD). */
let pendingJoin = cleanCode(new URLSearchParams(location.search).get('join') ?? '')

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
}
window.addEventListener('resize', resize)
resize()

/** Mode and world / boss: last solo pick, and the host's default for a new room. */
const saved = store.get<Partial<MatchChoice>>('choice', {})
let choice: MatchChoice = { kind: saved.kind ?? 'royale', theme: saved.theme ?? 'random' }

/**
 * A concrete match setup from a choice: a random world from the seed, and a
 * random raid boss that is never the same as last time on this device.
 */
function setupFor(c: MatchChoice, humans: LobbyPlayer[]): MatchSetup {
  const seed = Date.now() % 1e9
  if (c.kind !== 'raid') return { seed, humans, kind: c.kind, theme: pickTheme(c.theme, seed) }
  const last = store.get<BossId | ''>('lastBoss', '')
  const pool = BOSS_LIST.filter((b) => b !== last)
  const boss = pool[Math.floor(Math.random() * pool.length)] ?? BOSS_LIST[0]
  store.set('lastBoss', boss)
  return { seed, humans, kind: c.kind, theme: pickTheme(c.theme, seed), boss }
}

/** Lobby: you picked a team and tapped "Klaar". */
let ready = false

function me(): LobbyPlayer {
  return { pid: profile().id, name: profile().name || trainer.name, trainer: trainer.key, team, ready }
}

// ---------- Menus ----------

function toTitle() {
  stopGame()
  showTitle(() => (pendingJoin ? toMenu() : showIntro(() => wipe(() => toMenu()))))
}

function toMenu(extra: Partial<MenuState> = {}) {
  stopGame()
  lobbyUi = null
  playMusic('menu')
  const code = pendingJoin
  showMenu({ trainer, team, choice, code: code || undefined, ...extra }, {
    solo: (c) => {
      choice = c
      store.set('choice', c)
      wipe(startSolo, { flash: true })
    },
    host: hostRoom,
    join: joinRoom,
    team: () => wipe(() => pickTeam(() => wipe(() => toMenu()), () => wipe(() => toMenu()), 'Klaar ▶')),
    back: () => wipe(toTitle),
  })
  // Opened a shared link and we already know your name: straight in.
  if (code && profile().name && !extra.error) {
    pendingJoin = ''
    const none = () => {}
    showMenu({ trainer, team, choice, code, busy: `Verbinden met ${code}…` }, { solo: none, host: none, join: none, team: none, back: none })
    joinRoom(code)
  }
}

/** Trainer, then partner. */
function pickTeam(done: () => void, back: () => void, cta: string) {
  playMusic('menu')
  showTrainerSelect(trainer.key, back, (t) => {
    trainer = t
    store.set('trainer', t.key)
    wipe(() =>
      showRoster(team, () => wipe(() => pickTeam(done, back, cta)), (picked) => {
        team = picked
        store.set('team', picked)
        done()
      }, cta),
    )
  })
}

// ---------- Matches ----------

function hooks(): GameHooks {
  return {
    toast: (t, c) => hud?.toast(t, c),
    feed: (t, icon) => hud?.feed(t, icon),
    banner: (b) => hud?.banner(b),
    evolve: (from, to, shiny, done) => showEvolution(from, to, shiny, done),
    partyFull: (mon, choose) => showPartyFull(mon, game!.player.party, choose),
    end: (r) => onEnd(r),
  }
}

function enterMatch(g: Game) {
  clearScreen()
  stopGame()
  game = g
  viewing = true
  playMusic('battle')
  if (g.mode !== 'client') hud = makeHud(g)
  if (desktop) setTimeout(() => game === g && hud?.toast('WASD lopen · klik = aanval · Q E R = krachten · Esc pauze'), INTRO_TIME * 1000 + 600)
  // Extra history entry so the phone's back button asks before leaving.
  history.pushState({ battlemon: 'game' }, '')
  guardActive = true
}

function makeHud(g: Game) {
  return new Hud(hudRoot, g, confirmLeave, room ? { chat: (t) => room?.say(t) } : {})
}

/** Seconds of the pre-match splash with tips (everyone in a multiplayer match waits together). */
const LOADING_TIME = 8

/** Tips splash before a match; `start` drops you in afterwards. */
function loadingThen(setup: MatchSetup, skippable: boolean, start: () => void) {
  clearScreen()
  playMusic('menu')
  const players = setup.humans.map((h) => ({
    name: h.name,
    sprite: (TRAINERS.find((t) => t.key === h.trainer) ?? TRAINERS[0]).sprite,
    mon: h.team[0],
  }))
  showLoading({ seconds: LOADING_TIME, players, skippable, bots: Math.max(0, SEATS - players.length), raid: setup.kind === 'raid' ? setup.boss : undefined }, start)
}

function startSolo() {
  if (team.length !== TEAM_SIZE) return toMenu()
  const setup = setupFor(choice, [me()])
  const g = new Game(setup, 0, hooks(), 'solo')
  loadingThen(setup, true, () => enterMatch(g))
}

function onEnd(r: GameResult) {
  hud?.destroy()
  hud = null
  if (!room) {
    showResults(r, trainer.sprite, { label: 'Nog een keer ▶', run: () => wipe(startSolo, { flash: true }) }, [
      { label: 'Ander team', run: () => wipe(() => pickTeam(() => wipe(startSolo, { flash: true }), () => wipe(() => toMenu()), 'Start de battle ▶')) },
      { label: 'Hoofdmenu', run: () => wipe(() => toMenu()) },
    ])
    return
  }
  showResults(r, trainer.sprite, { label: 'Naar de lobby ▶', run: () => wipe(toLobby) }, [
    { label: 'Kijk mee', run: () => spectate() },
    { label: 'Hoofdmenu', run: () => leaveRoom() },
  ])
}

/** Watch the rest of the match after you're out. */
function spectate() {
  clearScreen()
  viewing = true
  hudRoot.innerHTML = '<button class="spec-pill">Toeschouwer · naar de lobby ▶</button>'
  hudRoot.querySelector('.spec-pill')!.addEventListener('click', () => wipe(toLobby))
}

// ---------- Multiplayer ----------

function roomEvents() {
  return {
    lobby: () => lobbyUi?.refresh(),
    chat: (m: ChatLine) => {
      lobbyUi?.chat(m)
      if (viewing) hud?.chatLine(m, m.pid === profile().id)
    },
    closed: (reason: string) => {
      room = null
      remotes.clear()
      wipe(() => toMenu({ error: reason }))
    },
    host: (msg: HostMsg) => onHostMsg(msg),
    command: (pid: string, c: Parameters<typeof runCommand>[2]) => {
      const v = remotes.get(pid)
      if (v && game?.mode === 'host') runCommand(game, v, c)
    },
    left: (p: LobbyPlayer) => {
      const v = remotes.get(p.pid)
      remotes.delete(p.pid)
      if (!v || game?.mode !== 'host') return
      // A bot takes over their trainer
      game.removeViewer(v.tr)
      v.tr.remote = false
      if (v.tr.alive) game.giveBrain(v.tr)
      hud?.toast(`${p.name} heeft het potje verlaten`)
    },
  }
}

function hostRoom() {
  Room.create(me(), roomEvents())
    .then((r) => {
      room = r
      r.choice = { ...choice }
      wipe(toLobby)
    })
    .catch((e: Error) => toMenu({ error: e.message }))
}

function joinRoom(code: string) {
  Room.join(code, me(), roomEvents())
    .then((r) => {
      room = r
      pendingJoin = ''
      if (location.search.includes('join=')) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]join=[^&]*/, '').replace(/^&/, '?'))
      wipe(toLobby)
    })
    .catch((e: Error) => {
      pendingJoin = ''
      toMenu({ error: e.message, code })
    })
}

function toLobby() {
  if (!room) return toMenu()
  // Guests drop the match they were watching; the host keeps simulating until it's over.
  if (game?.mode !== 'host') stopGame()
  else {
    viewing = false
    hud?.destroy()
    hud = null
    hudRoot.innerHTML = ''
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  guardActive = false
  playMusic('menu')
  lobbyUi = showLobby(room, {
    start: hostStart,
    choice: (c) => room?.setChoice(c),
    team: () => {
      lobbyUi = null
      // Picking a new team: not ready until you're done
      ready = false
      room?.updateMe(me())
      wipe(() => pickTeam(() => {
        ready = true
        room?.updateMe(me())
        wipe(toLobby)
      }, () => wipe(toLobby), 'Klaar ▶'))
    },
    ready: (on) => {
      ready = on
      room?.updateMe(me())
    },
    leave: leaveRoom,
  })
}

/** Leave the multiplayer room (as host this closes it for everyone) and go to the main menu. */
function leaveRoom() {
  ready = false
  room?.leave()
  room = null
  remotes.clear()
  stopGame()
  wipe(() => toMenu())
}

function hostStart() {
  const r = room
  if (!r?.isHost || r.running) return
  r.updateMe(me())
  // The previous match (still kept for the lobby) is done for good
  stopGame()
  const setup = setupFor(r.choice, r.players)
  const g = new Game(setup, 0, hooks(), 'host')
  recordVfx(g)
  remotes.clear()
  for (const tr of g.trainers) {
    if (!tr.human || tr.isPlayer) continue
    tr.remote = true
    const v = remoteViewer(tr)
    g.addViewer(v)
    remotes.set(tr.pid, v)
  }
  const roster = g.trainers.map((t) => ({ i: t.id, key: t.def.key, sprite: t.def.sprite, name: t.name, human: t.human, pid: t.pid }))
  for (const v of remotes.values()) r.sendTo(v.tr.pid, { t: 'start', setup, roster, you: v.tr.id })
  // Everyone confirms again for the next match
  r.players.forEach((p) => (p.ready = false))
  r.setRunning(true)
  lobbyUi = null
  loadingThen(setup, false, () => enterMatch(g))
}

/** Guest: the host started a match, or sent a state update. */
function onHostMsg(msg: HostMsg) {
  if (msg.t === 'start') {
    const idx = msg.setup.humans.findIndex((h) => h.pid === profile().id)
    const g = new Game(msg.setup, idx, hooks(), 'client')
    initClient(g, msg.roster, msg.you)
    g.send = (c) => room?.command(c)
    lobbyUi = null
    pendingMatch = g
    ready = false
    if (room) room.me = me()
    // Close any open picker or modal, then the tips splash, then drop in
    document.getElementById('modal')!.classList.add('hidden')
    loadingThen(msg.setup, false, () => enterMatch(g))
  } else if (msg.t === 's') {
    const g = game?.mode === 'client' ? game : pendingMatch
    if (!g) return
    applySnapshot(g, msg.s)
    applyEvents(g, msg.e, g.hooks, (c) => room?.command(c))
    if (g === game && viewing && !hud && !g.over) hud = makeHud(g)
  }
}
/** Guest: match that started while the wipe transition is still running. */
let pendingMatch: Game | null = null

/** Host: send each remote player their view of the match, 20× a second. */
function hostNet(g: Game, dt: number) {
  if (!room) return
  netT -= dt
  if (netT > 0) return
  netT = 0.05
  for (const v of remotes.values()) {
    room.sendTo(v.tr.pid, { t: 's', s: snapshot(g, v), e: v.out.splice(0) })
  }
  if (g.allDone && room.running) room.setRunning(false)
}

// ---------- Leaving a running match ----------

let guardActive = false
let confirming = false
const inMatch = () => !!game && viewing && !game.over

function confirmLeave() {
  if (!inMatch() || confirming) return
  const g = game!
  const wasPaused = g.paused
  g.paused = true
  g.held.fill(false)
  g.input.mx = g.input.my = 0
  confirming = true
  const text = !room ? undefined : room.isHost
    ? 'Jij bent de host: als je stopt, stopt het potje voor iedereen.'
    : 'Je verlaat het potje en de lobby.'
  showLeaveConfirm(
    () => {
      confirming = false
      if (game === g) g.paused = wasPaused
    },
    () => {
      confirming = false
      leaveMatch()
    },
    text,
  )
}

function leaveMatch() {
  if (guardActive) {
    guardActive = false
    history.back()
  }
  if (room) {
    room.leave()
    room = null
    remotes.clear()
    stopGame()
    wipe(() => toMenu())
    return
  }
  wipe(() => toMenu())
}

window.addEventListener('popstate', () => {
  if (!guardActive) return
  if (inMatch()) {
    // Swallow the back press and ask first.
    history.pushState({ battlemon: 'game' }, '')
    confirmLeave()
  } else guardActive = false
})

window.addEventListener('beforeunload', (e) => {
  if (inMatch() || room) {
    e.preventDefault()
    e.returnValue = ''
  }
})

function stopGame() {
  hud?.destroy()
  hud = null
  game = null
  pendingMatch = null
  viewing = false
  hudRoot.innerHTML = ''
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

// ---------- Desktop: keyboard + mouse ----------

/** Mouse/trackpad users get keyboard + mouse controls instead of the joystick. */
export const desktop = matchMedia('(pointer: fine)').matches
if (desktop) document.body.classList.add('desk')

const keys = new Set<string>()
/**
 * Desktop layout (left hand on WASD, right hand on the mouse):
 * LMB = attack 1, Q/E/R = attacks 2/3/4 (R = ultimate), RMB hold = walk to cursor,
 * Space = catch, F = switch Pokémon, 1/2/3 = Master Ball / Potion / Revive.
 */
const ATTACK_KEYS: Record<string, number> = { q: 1, e: 2, r: 3 }
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  keys.add(k)
  if (e.key === 'Escape') return confirmLeave()
  if (e.key === 'Enter' && viewing && hud?.openChat()) return e.preventDefault()
  if (!game || !hud || game.paused) return
  if (k === ' ' || k === 'tab' || k.startsWith('arrow')) e.preventDefault()
  const g = game, p = g.player
  if (k in ATTACK_KEYS) {
    const slot = ATTACK_KEYS[k]
    // Fire on press (a quick tap must never be lost), keep firing while held
    if (!e.repeat && p.alive && g.introT <= 0) g.useMove(p.mon, slot, undefined, g.cursorDir(p.mon))
    g.held[slot] = true
  }
  if (e.repeat) return
  if (k === 'f') {
    for (let i = 1; i <= p.party.length; i++) if (g.switchTo(p, (p.active + i) % p.party.length)) break
  }
  if (k === ' ') {
    const w = g.catchable(p)
    if (w) g.throwBall(p, w, false)
  }
  if (k === '1') hud.useItem('master')
  if (k === '2') hud.useItem('potion')
  if (k === '3') hud.useItem('revive')
})
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase()
  keys.delete(k)
  if (game && k in ATTACK_KEYS) game.held[ATTACK_KEYS[k]] = false
})
window.addEventListener('blur', () => {
  keys.clear()
  mouse.attack = mouse.walk = false
  releaseInput()
})

// LMB fires attack 1 at the cursor (hold to keep firing); RMB held walks toward the cursor.
const mouse = { x: 0, y: 0, attack: false, walk: false, inside: false }
canvas.addEventListener('mousedown', (e) => {
  mouse.x = e.clientX
  mouse.y = e.clientY
  mouse.inside = true
  if (e.button === 0) {
    mouse.attack = true
    if (game && !game.paused && game.player.alive && game.introT <= 0) {
      updateAim(game)
      game.useMove(game.player.mon, 0, undefined, game.cursorDir(game.player.mon))
      game.held[0] = true
    }
  }
  if (e.button === 2) mouse.walk = true
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    mouse.attack = false
    if (game) game.held[0] = false
  }
  if (e.button === 2) mouse.walk = false
})
canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX
  mouse.y = e.clientY
  mouse.inside = true
})
canvas.addEventListener('mouseleave', () => (mouse.inside = false))
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

// Mobile: long-pressing during play must never select text or open the browser's
// search/copy menu. Text fields (name, room code) keep working normally.
const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
document.addEventListener('selectstart', (e) => !typing(e.target) && e.preventDefault())
document.addEventListener('contextmenu', (e) => !typing(e.target) && e.preventDefault())
document.addEventListener('touchstart', (e) => {
  if (typing(e.target)) return
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) sel.removeAllRanges()
}, { passive: true })

// During play, a long press must stay ours: cancelling touchstart stops iOS from starting
// its own gesture (text selection, search menu, magnifier, double-tap zoom), which would
// otherwise swallow the release and leave an attack or the joystick stuck. Pointer events
// still fire; real buttons (pause, mute) are left alone so their clicks keep working.
const ownTouch = (e: TouchEvent) => {
  const t = e.target as Element | null
  if (typing(t) || t?.closest?.('button')) return
  e.preventDefault()
}
hudRoot.addEventListener('touchstart', ownTouch, { passive: false })
canvas.addEventListener('touchstart', ownTouch, { passive: false })

/** Let go of every attack and the joystick. */
function releaseInput() {
  hud?.releaseAll()
  if (game) {
    game.held.fill(false)
    game.aimPreview = null
    game.input.mx = game.input.my = 0
  }
}
// Safety net: with no finger on the screen nothing can be held, whatever events got lost.
const allUp = (e: TouchEvent) => e.touches.length === 0 && releaseInput()
window.addEventListener('touchend', allUp, { passive: true })
window.addEventListener('touchcancel', allUp, { passive: true })
document.addEventListener('visibilitychange', () => document.hidden && releaseInput())

/** Map the mouse position to world tiles and store it as the aim point. */
function updateAim(g: Game) {
  const dpr = canvas.width / innerWidth
  const wx = (mouse.x * dpr / view.Z + view.ox) / TILE
  const wy = (mouse.y * dpr / view.Z + view.oy) / TILE
  g.aimAt = desktop && (mouse.inside || mouse.attack || mouse.walk) ? { x: wx, y: wy } : null
  return { wx, wy }
}

function desktopInput(g: Game) {
  let x = 0, y = 0
  if (keys.has('a') || keys.has('arrowleft')) x--
  if (keys.has('d') || keys.has('arrowright')) x++
  if (keys.has('w') || keys.has('arrowup')) y--
  if (keys.has('s') || keys.has('arrowdown')) y++

  const { wx, wy } = updateAim(g)

  if (x || y) {
    const l = Math.hypot(x, y)
    g.input.mx = x / l
    g.input.my = y / l
    steering = true
  } else if (mouse.walk && !g.paused) {
    const p = g.player
    const dx = wx - p.x, dy = wy - (p.y - 0.4)
    const d = Math.hypot(dx, dy)
    // Full speed when the cursor is a few tiles away, ease in close by
    const k = d < 0.35 ? 0 : Math.min(1, d / 2.5) / d
    g.input.mx = dx * k
    g.input.my = dy * k
    steering = true
  } else if (steering) {
    g.input.mx = g.input.my = 0
    steering = false
  }
}
let steering = false

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (game) {
    const g = game
    if (viewing) desktopInput(g)
    g.update(dt)
    if (g.mode === 'host') hostNet(g, dt)
    if (viewing && (g.mode !== 'client' || g.net?.placed)) {
      setTempo(g.kind === 'raid' ? ((g.raidView?.phase ?? 0) >= 2 ? 1.22 : 1.12) : g.zone.phase >= 4 ? 1.12 : 1)
      render(g, ctx, canvas.width, canvas.height)
      hud?.update()
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Handy for debugging from the console.
;(window as unknown as { battlemon: unknown }).battlemon = { get game() { return game }, get room() { return room }, remotes, snapshot }

toTitle()
