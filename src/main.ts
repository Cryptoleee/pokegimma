import { moveByName } from './data/moves'
import { preloadVoice, voiceLog } from './voice'
import './style.css'
import { ALL_PARTNERS, ROSTER, TEAM_SIZE } from './data/pokemon'
import { DUNGEON_LIST, dungeonOf } from './data/dungeons'
import { BOSS_LIST, type BossId } from './data/bosses'
import { TRAINERS, type TrainerDef } from './data/trainers'
import { finalForm } from './game/boss'
import { pickStadium, STADIUMS, type StadiumId } from './data/stadiums'
import { Game, INTRO_TIME, SEATS, type GameHooks, type GameResult, type MatchSetup } from './game/game'
import { chatBubble, render, view } from './game/render'
import { padTick, type PadHooks } from './pad'
import { actionOf, keyOf, type Action } from './keys'
import { duoInit, duoNow, duoTick, isDuoPage, type DuoState } from './duo'
import { startDuoView } from './ui/duoView'
import { TILE } from './game/world'
import { chatWidget, feedLine, Hud } from './ui/hud'
import { clearScreen, showLeaveConfirm, showPartyFull } from './ui/screens'
import { showIntro } from './ui/intro'
import { showTitle } from './ui/title'
import { showTeam } from './ui/team'
import { showFriends } from './ui/friends'
import { showResults } from './ui/results'
import { LiveBoard, showFinalBoard } from './ui/scoreboard'
import { decided, scoreRows } from './game/score'
import { showEvolution } from './ui/cutscene'
import { confirmLeaveLobby, shinyPartner, showLobby } from './ui/menu'
import { askName, setOnline, showMenu, type MenuState } from './ui/home'
import { IC, icon, type AppTab } from './ui/app'
import { showLoading } from './ui/loading'
import { wipe } from './ui/transition'
import { currentMusic, playMusic, setTempo } from './music'
import { sfx } from './audio'
import { loadSfx, namePitch, playBoss, playItem, playMoveCast, playMoveCharge, playMoveHit, resetSfx } from './moveSfx'
import { profile, setName } from './profile'
import { cleanCode, probeQuick, Room, stopProbe } from './net/room'
import { loadIce } from './net/ice'
import type { ChatLine, HostMsg, LobbyPlayer, MatchChoice } from './net/protocol'
import { pickTheme, THEMES, type ThemeId } from './data/themes'
import { applyEvents, applySnapshot, initClient, recordVfx, remoteViewer, runCommand, snapshot, type RemoteViewer } from './net/sync'
import { L, onLangChange, tx } from './i18n'
import { initStats, statsStateChanged, trackEnd, trackMatch } from './stats'
import { accountState, accountStatus, initAccount, onAccount, onInvite, presenceChanged, type Invite, type Presence } from './account'
import { hideInviteToast, showInviteToast } from './ui/friends'
import { initProgress, matchEnded, matchStarted, onProgress, progress, showcaseBoost } from './progress'
import { isUnlocked, levelOf, titleOf } from '../api/_progress'
import { showProfile } from './ui/profile'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudRoot = document.getElementById('hud')!

// Fetch the announcer's lines in the background
preloadVoice()

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
let team: number[] = store.get<number[]>('team', []).filter((id) => ALL_PARTNERS.includes(id))
if (team.length !== TEAM_SIZE) team = [ROSTER[0]]

/**
 * Only play with what you've unlocked (after logging out, or a different account).
 * Starts from your saved picks each time, so they come back once your account has loaded.
 */
function ownedPicks() {
  const p = progress()
  const want = TRAINERS.find((t) => t.key === store.get('trainer', '')) ?? trainer
  trainer = isUnlocked(p, 'trainer', want.key) ? want : TRAINERS[0]
  const saved = store.get<number[]>('team', []).filter((id) => ALL_PARTNERS.includes(id))
  const wantTeam = saved.length === TEAM_SIZE ? saved : team
  team = wantTeam.every((id) => isUnlocked(p, 'partner', id)) ? wantTeam : [ROSTER[0]]
}
// Account progress arrives a moment after start: the home screen follows
onProgress(() => {
  const before = trainer.key + team.join()
  ownedPicks()
  if (trainer.key + team.join() !== before && document.querySelector('#screen .n-app[data-tab="play"]')) toMenu()
})
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

/** For the creator stats: what you're doing, and how you're playing. */
const statsMode = () => (room ? (room.quick ? 'quick' : 'friends') : 'solo') as 'solo' | 'quick' | 'friends'
initStats(() => (game && viewing && !game.over ? statsKind(game) : room ? 'lobby' : 'menu'))

// ---------- Account (optional Discord login) ----------

/** Back from the Discord login: ?login=ok|new|cancel|err|off. */
const loginResult = new URLSearchParams(location.search).get('login') ?? ''
if (loginResult) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]login=[^&]*/, '').replace(/^&/, '?'))
const inMatchNow = () => !!(game && viewing && !game.over)
/** Where you are, for your friends' lists. */
function presence(): Presence {
  const name = profile().name || undefined
  if (inMatchNow()) return { s: 'game', name, code: room?.code, q: room?.quickSlot ?? -1, n: room?.players.length ?? 1 }
  if (room) return { s: 'lobby', code: room.code, q: room.quickSlot, n: room.players.length, run: room.running, name }
  return { s: 'menu', name }
}
void initAccount(presence)
initProgress()
// Fetch the connection (TURN) servers early, so creating or joining a match doesn't wait
void loadIce()
onAccount(() => {
  // Signed in without a name yet: use your Discord one
  const s = accountState()
  if (accountStatus() !== 'in' || !s || profile().name) return
  setName(s.me.name)
})
/** An invite that came in mid-match waits until you're back on the home screen or in a lobby. */
let heldInvite: Invite | null = null
onInvite((inv) => {
  if (room?.code === inv.code) return
  if (inMatchNow()) heldInvite = inv
  else showInviteToast(inv, () => acceptInvite(inv))
})
function showHeldInvite() {
  const inv = heldInvite
  heldInvite = null
  if (inv && Date.now() - inv.at < 5 * 60_000 && room?.code !== inv.code) showInviteToast(inv, () => acceptInvite(inv))
}
function acceptInvite(inv: Invite) {
  if (room?.code === inv.code) return
  if (inMatchNow()) return
  if (room) {
    ready = false
    if (guardActive) {
      guardActive = false
      history.back()
    }
    room.leave()
    room = null
    remotes.clear()
    stopGame()
  }
  joinFriend(inv.code, inv.q)
}
/** Join a friend's lobby: a private room by code, or their quick play slot. */
function joinFriend(code: string, q: number) {
  if (!profile().name) setName(`Trainer ${Math.floor(1000 + Math.random() * 9000)}`)
  if (q < 0) return joinRoom(code)
  ready = false
  Room.joinQuick(q, me(), roomEvents())
    .then((r) => {
      room = r
      wipe(toLobby)
    })
    .catch((e: Error) => {
      sfx.error()
      toMenu({ error: e.message })
    })
}

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
  // Public lobbies always play normal: the bots there are for everyone
  const diff = room?.quick ? 'normal' : c.diff ?? 'normal'
  // Dev/testing: ?theme=<id> fixes the world
  const forcedTheme = new URLSearchParams(location.search).get('theme') as ThemeId | null
  if (c.kind === 'duel') {
    // Dev/testing: ?stadium=<id> fixes the stadium
    const forced = new URLSearchParams(location.search).get('stadium') as StadiumId | null
    return { seed, humans, kind: 'duel', diff, stadium: forced && forced in STADIUMS ? forced : pickStadium(c.stadium, seed) }
  }
  if (c.kind !== 'raid') return { seed, humans, kind: c.kind, diff, theme: forcedTheme && forcedTheme in THEMES ? forcedTheme : pickTheme(c.theme, seed) }
  const q = new URLSearchParams(location.search)
  // Dev/testing: ?boss=<id> fixes the boss, ?classic=1 skips the dungeon, ?room=N starts further in
  const forced = q.get('boss') as BossId | null
  const classic = q.get('classic') === '1' || c.raid === 'classic' || !DUNGEON_LIST.length
  const startRoom = Number(q.get('room')) || 0
  let boss: BossId
  if (forced && BOSS_LIST.includes(forced)) boss = forced
  else if (!classic) boss = DUNGEON_LIST[Math.floor(Math.random() * DUNGEON_LIST.length)].boss
  else {
    const last = store.get<BossId | ''>('lastBoss', '')
    const pool = BOSS_LIST.filter((b) => b !== last)
    boss = pool[Math.floor(Math.random() * pool.length)] ?? BOSS_LIST[0]
    store.set('lastBoss', boss)
  }
  return { seed, humans, kind: c.kind, diff, theme: pickTheme(c.theme, seed), boss, ...(classic ? { classic: true } : {}), ...(startRoom > 0 ? { room: startRoom } : {}) }
}

/** Lobby: you picked a team and tapped "Klaar". */
let ready = false

function me(): LobbyPlayer {
  const p = progress()
  return { pid: profile().id, name: profile().name || trainer.name, trainer: trainer.key, team, ready, shiny: !!team[0] && shinyPartner(team[0]), lv: levelOf(p.xp).lv, title: titleOf(p) }
}

// ---------- Menus ----------

function toTitle() {
  stopGame()
  const logged = loginResult && loginResult !== 'off'
  showTitle(() => (pendingJoin ? toMenu() : logged ? toTab('friends') : showIntro(() => wipe(() => toMenu()))))
}

// A new language re-renders the home screen (the lobby and battle pick it up on their next update)
onLangChange(() => {
  if (document.querySelector('#screen .n-app[data-tab="play"]')) toMenu()
})

function toMenu(extra: Partial<MenuState> = {}) {
  ownedPicks()
  stopGame()
  lobbyUi = null
  playMusic('menu')
  const code = pendingJoin
  statsStateChanged()
  presenceChanged()
  showHeldInvite()
  showMenu({ trainer, team, choice, code: code || undefined, rejoin: rejoinCode(), ...extra }, menuActions())
  watchOnline()
  // Opened a shared link and we already know your name: straight in.
  if (code && profile().name && !extra.error) {
    pendingJoin = ''
    showMenu({ trainer, team, choice, code, busy: L(`Connecting to ${code}…`, `Verbinden met ${code}…`) }, menuActions())
    joinRoom(code)
  }
}

function menuActions() {
  return {
    rejoin: (c: string) => {
      forgetRoom()
      joinRoom(c)
    },
    joinFriend,
    solo: (c: MatchChoice) => {
      choice = c
      store.set('choice', c)
      wipe(startSolo, { flash: true })
    },
    host: hostRoom,
    join: joinRoom,
    quick: () => quickPlay(),
    quickDuel: () => quickPlay(false, true),
    tab: toTab,
    teamAll: (kind: MatchChoice['kind']) => {
      const name = kind === 'raid' ? 'Raid' : kind === 'duel' ? '1 vs 1' : 'Battle Royale'
      const back = () => toMenu({ view: kind })
      wipe(() => teamPicker(back, L('Done', 'Klaar'), { label: L(`Back to ${name}`, `Terug naar ${name}`), go: back, kind }))
    },
    setTeam: (t: TrainerDef, mon: number, view: MenuState['view']) => {
      saveTeam(t, mon)
      toMenu({ view })
    },
    back: () => wipe(toTitle),
  }
}

/** The menu's tabs: Play, Team, Friends and Profile. */
function toTab(t: AppTab) {
  ownedPicks()
  playMusic('menu')
  if (t === 'play') return toMenu()
  if (t === 'profile') return showProfile({ trainerSprite: trainer.sprite, name: profile().name || trainer.name, nav: toTab })
  if (t === 'friends') return showFriends({ tab: toTab, join: (c, q) => askName(() => joinFriend(c, q)) })
  showTeam({ trainer, mon: team[0], set: saveTeam, tab: toTab })
}

function saveTeam(t: TrainerDef, mon: number) {
  trainer = t
  team = [mon]
  store.set('trainer', t.key)
  store.set('team', team)
}

/** The Team screen as a picker (from a lobby or the results): a Done button, no tabs. */
function teamPicker(done: () => void, doneLabel: string, back?: { label: string; go: () => void; kind?: MatchChoice['kind'] }) {
  ownedPicks()
  playMusic('menu')
  showTeam({ trainer, mon: team[0], set: saveTeam, tab: toTab, done, doneLabel, back: back?.go, backLabel: back?.label, backKind: back?.kind })
}

// ---------- Matches ----------

function hooks(): GameHooks {
  return {
    toast: (t, c) => hud?.toast(tx(t), c),
    feed: (t, icon) => (hud ? hud.feed(tx(t), icon) : spec && specFeed && document.body.contains(specFeed) && feedLine(specFeed, tx(t), icon)),
    banner: (b) => hud?.banner(b),
    evolve: (from, to, shiny, done) => showEvolution(from, to, shiny, done),
    partyFull: (mon, choose) => showPartyFull(mon, game!.player.party, choose),
    end: (r) => onEnd(r),
  }
}

/** The match kind as stats and progress know it. */
const statsKind = (g: Game) => (g.kind === 'raid' ? 'raid' : g.kind === 'duel' ? 'duel' : 'br')

function enterMatch(g: Game) {
  clearScreen()
  stopGame()
  game = g
  viewing = true
  hideInviteToast()
  presenceChanged()
  matchStarted(statsKind(g), statsMode(), g.setup.humans.length)
  trackMatch({
    k: statsKind(g),
    m: statsMode(),
    mon: team[0],
    w: g.setup.theme,
    boss: g.setup.boss,
    h: g.setup.humans.length,
  })
  playMusic(g.kind === 'raid' ? 'boss' : 'battle')
  if (g.mode !== 'client') hud = makeHud(g)
  if (desktop) setTimeout(() => game === g && hud?.toast(L('WASD move · click = attack · Q E R = moves · Esc pause', 'WASD lopen · klik = aanval · Q E R = krachten · Esc pauze')), INTRO_TIME * 1000 + 600)
  // Extra history entry so the phone's back button asks before leaving.
  if (!guardActive) history.pushState({ battlemon: 'game' }, '')
  guardActive = true
}

function makeHud(g: Game) {
  return new Hud(hudRoot, g, confirmLeave, room ? { chat: (t) => room?.say(t) } : {})
}

/** Seconds of the pre-match splash with tips (everyone in a multiplayer match waits together). */
const LOADING_TIME = 8

/** Tips splash before a match; `start` drops you in afterwards. */
function loadingThen(setup: MatchSetup, skippable: boolean, start: () => void, g?: Game) {
  clearScreen()
  playMusic('menu')
  const duel = setup.kind === 'duel'
  // A duel shows both sides (the CPU too, fully evolved like yours)
  const players = duel && g?.trainers.length
    ? g.trainers.map((t) => ({ name: t.name, sprite: t.def.sprite, mon: t.mon?.species.id }))
    : setup.humans.map((h) => ({
      name: h.name,
      sprite: (TRAINERS.find((t) => t.key === h.trainer) ?? TRAINERS[0]).sprite,
      mon: duel ? finalForm(h.team[0]) : h.team[0],
    }))
  showLoading({ seconds: LOADING_TIME, players, skippable, bots: duel ? 0 : Math.max(0, SEATS - players.length), raid: setup.kind === 'raid' ? setup.boss : undefined, dungeon: setup.kind === 'raid' && !setup.classic && !!dungeonOf(setup.boss), duel, stadium: setup.stadium, diff: setup.diff }, start)
}

function startSolo() {
  if (team.length !== TEAM_SIZE) return toMenu()
  const setup = setupFor(choice, [me()])
  if (showcaseBoost()) setup.boost = true
  const g = new Game(setup, 0, hooks(), 'solo')
  loadingThen(setup, true, () => enterMatch(g), g)
}

const soloAgain = () => wipe(startSolo, { flash: true })
const soloOtherTeam = () => wipe(() => teamPicker(() => wipe(startSolo, { flash: true }), L('Start the battle', 'Start de battle')))

function onEnd(r: GameResult) {
  if (game) trackEnd({ k: statsKind(game), m: statsMode(), r: r.raid ? (r.won ? 'clear' : 'fail') : r.won ? 'win' : 'lose', boss: r.raid?.boss })
  hud?.destroy()
  hud = null
  // XP, mastery, quests and achievements for this match (on the server when signed in)
  const reward = game ? matchEnded({
    kind: statsKind(game), mode: statsMode(), humans: r.extra?.humans ?? 1,
    won: r.won, place: r.place, total: r.total, time: r.time, kos: r.duel ? r.duel.mine : r.kos, lost: r.duel?.theirs, caught: r.caught, partner: team[0],
    boss: r.raid?.boss, share: r.raid?.share, lives: r.raid?.lives, dungeon: r.raid?.dungeon,
    legend: r.extra?.legend, evolved: r.extra?.evolved, crystal: r.extra?.crystal, diff: game?.diff,
  }) : undefined
  // The match goes on without you (bots or other players still in it): you can watch
  const watch = r.final ? [] : [{ label: L('Keep watching', 'Kijk verder'), run: () => spectate(), icon: IC.eye }]
  if (!room) {
    showResults(r, trainer.sprite, { label: L('Play again', 'Nog een keer'), run: soloAgain, icon: IC.replay }, [
      ...watch,
      { label: L('Other team', 'Ander team'), run: soloOtherTeam },
      { label: L('Main menu', 'Hoofdmenu'), run: () => wipe(() => toMenu()) },
    ], reward)
    return
  }
  // Online the match usually goes on for your friends: watching is the main option, the lobby can wait
  const lobby = { label: L('To the lobby', 'Naar de lobby'), run: () => wipe(toLobby) }
  if (watch.length) showResults(r, trainer.sprite, { label: L('Keep watching', 'Kijk verder'), run: () => spectate(), icon: IC.eye }, [lobby, { label: L('Main menu', 'Hoofdmenu'), run: () => leaveRoom() }], reward)
  else showResults(r, trainer.sprite, { ...lobby, label: L('To the lobby', 'Naar de lobby') }, [{ label: L('Main menu', 'Hoofdmenu'), run: () => leaveRoom() }], reward)
}

// ---------- Watching after you're out ----------

/** Spectating: the bar at the top, the live scoreboard, and the playback speed (solo). */
let spec: { g: Game; board: LiveBoard; speed: number; name: string; endT: number } | null = null

/** Watch the rest of the match after you're out. */
/** Chat while spectating (multiplayer only). */
let specChat: ReturnType<typeof chatWidget> | null = null
let specFeed: HTMLElement | null = null

function spectate() {
  const g = game
  if (!g) return
  clearScreen()
  viewing = true
  // Solo, or the host: keep simulating after every human is done
  if (g.mode !== 'client') g.watch = true
  playMusic(g.kind === 'raid' ? 'boss' : 'battle')
  hudRoot.classList.remove('hidden', 'intro-mode')
  hudRoot.innerHTML = `
    <div class="spec-bar">
      <span class="spec-tag">${icon(IC.eye, 16)}${L('Spectating', 'Toeschouwer')}</span>
      <div class="spec-follow"><button class="spec-prev" aria-label="${L('Previous trainer', 'Vorige trainer')}">${icon(IC.back, 16)}</button><span class="spec-name"></span><button class="spec-next" aria-label="${L('Next trainer', 'Volgende trainer')}">${icon(IC.next, 16)}</button></div>
      <div class="spec-btns">
        ${room ? '' : `<button class="spec-speed" title="${L('Speed', 'Snelheid')}">1×</button>`}
        <button class="spec-board" title="${L('Scoreboard (Tab)', 'Scorebord (Tab)')}" aria-label="${L('Scoreboard', 'Scorebord')}">${icon(IC.star, 16)}</button>
        <button class="spec-leave">${room ? L('To the lobby', 'Naar de lobby') : L('Stop', 'Stoppen')}</button>
      </div>
    </div>`
  const board = new LiveBoard(hudRoot, g, () => g.player.id)
  // Out of the match, still in the conversation
  specChat = null
  // The announcements (kills, spawns, drops) keep coming while you watch
  specFeed = document.createElement('div')
  specFeed.className = 'feed spec-feed'
  hudRoot.append(specFeed)
  if (room) {
    specChat = chatWidget((t) => room?.say(t))
    hudRoot.querySelector('.spec-btns')!.prepend(specChat.btn)
    hudRoot.append(specChat.panel)
  }
  spec = { g, board, speed: 1, name: '', endT: -1 }
  const cycle = (d: number) => {
    const alive = g.trainers.filter((t) => t.alive)
    if (!alive.length) return
    const cur = followed(g)
    const i = cur ? alive.indexOf(cur) : -1
    g.follow = alive[(i + d + alive.length) % alive.length]
    sfx.select()
  }
  hudRoot.querySelector('.spec-prev')!.addEventListener('click', () => cycle(-1))
  hudRoot.querySelector('.spec-next')!.addEventListener('click', () => cycle(1))
  hudRoot.querySelector('.spec-board')!.addEventListener('click', () => board.toggle())
  hudRoot.querySelector('.spec-speed')?.addEventListener('click', (e) => {
    if (!spec) return
    spec.speed = spec.speed === 1 ? 2 : spec.speed === 2 ? 4 : 1
    ;(e.currentTarget as HTMLElement).textContent = `${spec.speed}×`
    sfx.select()
  })
  hudRoot.querySelector('.spec-leave')!.addEventListener('click', () => {
    sfx.select()
    if (room) wipe(toLobby)
    else wipe(() => toMenu())
  })
}

/** Who the camera follows while you watch. */
function followed(g: Game) {
  const p = g.player
  if (g.follow?.alive) return g.follow
  const s = g.mode === 'client' ? p.spectate : g.spectate
  return s?.alive ? s : g.trainers.find((t) => t.alive) ?? null
}

/** Each frame while watching: name of who you follow, and the final standings once it's decided. */
function spectateTick(dt: number) {
  const s = spec
  if (!s || s.g !== game) return
  const f = followed(s.g)
  const name = f ? L(`Following: ${f.name}`, `Volgt: ${f.name}`) : ''
  if (name !== s.name) {
    s.name = name
    const el = hudRoot.querySelector('.spec-name')
    if (el) el.textContent = name
  }
  if (s.endT < 0 && decided(s.g)) s.endT = 2
  if (s.endT > 0) {
    s.endT -= dt
    if (s.endT <= 0) {
      const g = s.g
      const rows = scoreRows(g)
      s.board.destroy()
      spec = null
      hudRoot.innerHTML = ''
      viewing = false
      sfx.select()
      if (room) showFinalBoard(rows, g.kind === 'raid', g.player.id, { label: L('To the lobby', 'Naar de lobby'), run: () => wipe(toLobby) }, [{ label: L('Main menu', 'Hoofdmenu'), run: () => leaveRoom() }])
      else showFinalBoard(rows, g.kind === 'raid', g.player.id, { label: L('Play again', 'Nog een keer'), run: soloAgain, icon: IC.replay }, [
        { label: L('Other team', 'Ander team'), run: soloOtherTeam },
        { label: L('Main menu', 'Hoofdmenu'), run: () => wipe(() => toMenu()) },
      ])
      playMusic('victory')
    }
  }
}

// ---------- Multiplayer ----------

/** Lobby sounds: who joined or left, who got ready, everyone ready. */
let lobbySeen: { pids: string[]; ready: number } | null = null
function lobbySounds() {
  const r = room
  if (!r) return (lobbySeen = null)
  const pids = r.players.map((p) => p.pid)
  const ready = r.players.filter((p) => p.ready).length
  const prev = lobbySeen
  lobbySeen = { pids, ready }
  if (!prev || !lobbyUi) return
  if (pids.some((p) => !prev.pids.includes(p))) sfx.join()
  else if (prev.pids.some((p) => !pids.includes(p))) sfx.leave()
  else if (ready > prev.ready) ready === pids.length && pids.length > 1 ? sfx.allReady() : sfx.readyTick()
}

function roomEvents() {
  return {
    lobby: () => {
      lobbySounds()
      lobbyUi?.refresh()
    },
    chat: (m: ChatLine) => {
      duoChat.push({ name: m.name, text: m.text, mine: m.pid === profile().id })
      if (duoChat.length > 20) duoChat.shift()
      duoNow()
      lobbyUi?.chat(m)
      if (viewing) hud?.chatLine(m, m.pid === profile().id)
      if (spec && specChat) specChat.line(m, m.pid === profile().id)
      // In a match: what they say pops up above their trainer too
      if (viewing || spec) chatBubble(m.pid, m.text, m.pid === profile().id)
    },
    closed: (reason: string) => {
      const wasQuick = room?.quick && !game
      const wasDuel = room?.choice.kind === 'duel'
      rememberRoom()
      room = null
      remotes.clear()
      // Quick play: the host left before the match started: just find another lobby
      if (wasQuick) {
        sfx.leave()
        lobbyUi?.toast(L('The host left: finding a new lobby…', 'De host is weg: we zoeken een nieuwe lobby…'))
        return quickPlay(true, wasDuel)
      }
      sfx.error()
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
      sfx.leave()
      hud?.toast(L(`${p.name} left the match`, `${p.name} heeft het potje verlaten`))
    },
  }
}

function hostRoom(c?: MatchChoice) {
  Room.create(me(), roomEvents())
    .then((r) => {
      room = r
      r.choice = { ...(c ?? choice) }
      wipe(toLobby)
    })
    .catch((e: Error) => {
      sfx.error()
      toMenu({ error: e.message })
    })
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
      sfx.error()
      toMenu({ error: e.message, code })
    })
}

function toLobby() {
  if (!room) return toMenu()
  statsStateChanged()
  presenceChanged()
  showHeldInvite()
  // Guests drop the match they were watching. The host keeps simulating while
  // another player is still in it (silently); once every player is out, it stops.
  const g = game
  if (g?.mode !== 'host') stopGame()
  else if (g.allDone) {
    stopGame()
    if (room.running) room.setRunning(false)
  } else {
    g.watch = false
    g.silent = true
    spec?.board.destroy()
    spec = null
    viewing = false
    hud?.destroy()
    hud = null
    hudRoot.innerHTML = ''
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  // In a lobby the phone's back gesture asks first too
  if (!guardActive) {
    history.pushState({ battlemon: 'lobby' }, '')
    guardActive = true
  }
  playMusic('menu')
  lobbyUi = showLobby(room, {
    start: hostStart,
    choice: (c) => {
      // A duel is for two: not with more people in the lobby
      if (c.kind === 'duel' && room && room.players.length > 2) {
        sfx.error()
        return lobbyUi?.toast(L('1 vs 1 is for exactly 2 players', '1 tegen 1 is voor precies 2 spelers'))
      }
      room?.setChoice(c)
    },
    team: () => {
      lobbyUi = null
      // Picking a new team: not ready until you're done
      ready = false
      room?.updateMe(me())
      wipe(() => teamPicker(() => {
        ready = true
        room?.updateMe(me())
        wipe(toLobby)
      }, L('Ready', 'Klaar'), {
        label: L('Back to the lobby', 'Terug naar de lobby'),
        kind: room?.choice.kind,
        // Back without saying you're ready: tap Ready in the lobby when you are
        go: () => {
          room?.updateMe(me())
          wipe(toLobby)
        },
      }))
    },
    pickTeam: (t, mon) => {
      saveTeam(t, mon)
      room?.updateMe(me())
      lobbyUi?.refresh()
    },
    ready: (on) => {
      ready = on
      room?.updateMe(me())
    },
    leave: leaveRoom,
  })
}

/** Leave the multiplayer room (as host this closes it for everyone) and go to the main menu. */
// ---------- Quick play ----------

/** Find a public lobby (or host one). `again`: we're already on the lobby screen. `duel`: 1 vs 1. */
function quickPlay(again = false, duel = false) {
  stopProbe()
  if (!profile().name) setName(`Trainer ${Math.floor(1000 + Math.random() * 9000)}`)
  ready = false
  Room.quick(me(), roomEvents(), -1, duel)
    .then((r) => {
      room = r
      if (!again) return wipe(toLobby)
      toLobby()
      lobbyUi?.toast(r.isHost
        ? L('The host left: you\'re now the host of a new lobby', 'De host is weg: jij bent nu de host van een nieuwe lobby')
        : L('The host left: you\'re in a new lobby now', 'De host is weg: je zit in een nieuwe lobby'))
    })
    .catch((e: Error) => {
      sfx.error()
      wipe(() => toMenu({ error: e.message }))
    })
}

/**
 * Quick play, host: the timer. Starts the match when it runs out, when everyone
 * tapped Start (straight away if you're on your own), or soon once it's full.
 * A host who's alone moves over to a lobby where people are already waiting.
 */
let quickMerge = { at: 0, busy: false }
window.setInterval(() => {
  const r = room
  if (!r?.quick || !r.isHost || r.running) return
  const now = performance.now()
  const all = r.players.length > 0 && r.players.every((p) => p.ready)
  if (all && r.players.length === 1) return hostStart()
  if (all && r.quickEnds - now > 3000) r.quickEnds = now + 3000
  if (now >= r.quickEnds) return hostStart()
  // Once a second: everyone's timer stays in step
  if (Math.floor((r.quickEnds - now) / 1000) !== Math.floor((r.quickEnds - now - 250) / 1000)) {
    r.broadcastLobby()
    lobbyUi?.refresh()
  }
  if (r.players.length === 1 && !quickMerge.busy && now >= quickMerge.at && lobbyUi) {
    quickMerge = { at: now + 8000, busy: true }
    probeQuick(r.choice.kind === 'duel')
      .then((all) => {
        const target = all.find((s) => s.slot !== r.quickSlot && s.open && s.players >= 1 && (s.players > 1 || s.slot < r.quickSlot))
        if (!target || room !== r || r.players.length !== 1) return
        return Room.joinQuick(target.slot, me(), roomEvents()).then((nr) => {
          if (room !== r || r.players.length !== 1) return nr.leave()
          r.leave()
          room = nr
          toLobby()
        })
      })
      .catch(() => {})
      .finally(() => (quickMerge.busy = false))
  }
}, 250)

/** Home screen: how many people are playing or waiting online right now. */
let onlineTimer = 0
function watchOnline() {
  clearInterval(onlineTimer)
  const tick = () => {
    if (!document.querySelector('.n-app[data-tab="play"]') || room) {
      clearInterval(onlineTimer)
      stopProbe()
      return
    }
    probeQuick().then((all) => setOnline(all))
  }
  tick()
  onlineTimer = window.setInterval(tick, 15000)
}

function leaveRoom() {
  ready = false
  rememberRoom()
  if (guardActive) {
    guardActive = false
    history.back()
  }
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
  ready = false
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
  sfx.select()
  const text = !room ? undefined : room.isHost
    ? L('You\'re the host: if you stop, the match ends for everyone.', 'Jij bent de host: als je stopt, stopt het potje voor iedereen.')
    : L('You\'ll leave the match and the lobby.', 'Je verlaat het potje en de lobby.')
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
  } else if (room) {
    history.pushState({ battlemon: 'lobby' }, '')
    if (!document.querySelector('#modal:not(.hidden)')) confirmLeaveLobby(room, leaveRoom)
  } else guardActive = false
})

/** The friends' lobby you were last in (guests), so you can hop back in from the home screen. */
const REJOIN_KEY = 'battlemon:rejoin'
function rememberRoom() {
  if (!room || room.quick || room.isHost) return
  try {
    sessionStorage.setItem(REJOIN_KEY, JSON.stringify({ code: room.code, at: Date.now() }))
  } catch {
    /* private mode */
  }
}
function rejoinCode(): string | undefined {
  try {
    const r = JSON.parse(sessionStorage.getItem(REJOIN_KEY) ?? 'null') as { code: string; at: number } | null
    if (r && Date.now() - r.at < 15 * 60_000) return r.code
  } catch {
    /* nothing saved */
  }
  return undefined
}
function forgetRoom() {
  try {
    sessionStorage.removeItem(REJOIN_KEY)
  } catch {
    /* private mode */
  }
}

window.addEventListener('beforeunload', (e) => {
  if (inMatch() || room) {
    e.preventDefault()
    e.returnValue = ''
  }
})

function stopGame() {
  spec?.board.destroy()
  spec = null
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
 * Desktop layout (left hand on WASD, right hand on the mouse), by default:
 * LMB = attack 1, Q/E/R = attacks 2/3/4 (R = ultimate), RMB hold = walk to cursor,
 * Space = catch, F = switch Pokémon, 1/2/3 = Master Ball / Potion / Revive.
 * Every key can be changed in Options (see keys.ts); Escape always pauses.
 */
/** Moves on the keyboard: slot per action. */
const ATTACKS: Partial<Record<Action, number>> = { move1: 0, move2: 1, move3: 2, move4: 3 }
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  keys.add(k)
  if (e.key === 'Escape') return confirmLeave()
  const a = actionOf(k)
  if (a === 'chat' && viewing && hud?.openChat()) return e.preventDefault()
  if (a === 'chat' && spec && specChat) {
    specChat.open()
    return e.preventDefault()
  }
  if (a === 'board' && viewing && (hud || spec)) {
    e.preventDefault()
    if (!e.repeat) (spec?.board ?? hud?.board)?.toggle()
    return
  }
  if (!game || !hud || game.paused) return
  if (a || k.startsWith('arrow')) e.preventDefault()
  const g = game, p = g.player
  const slot = a ? ATTACKS[a] : undefined
  if (slot !== undefined) {
    // Fire on press (a quick tap must never be lost), keep firing while held
    if (!e.repeat && p.alive && g.introT <= 0 && !g.useMove(p.mon, slot, undefined, g.cursorDir(p.mon)) && (p.mon.cds[slot] > 0 || !p.mon.unlocked(slot))) sfx.denied()
    g.held[slot] = true
  }
  if (e.repeat) return
  if (a === 'switch') {
    for (let i = 1; i <= p.party.length; i++) if (g.switchTo(p, (p.active + i) % p.party.length)) break
  }
  if (a === 'catch') {
    const w = g.catchable(p)
    if (w) g.throwBall(p, w, false)
  }
  if (a === 'master') hud.useItem('master')
  if (a === 'potion') hud.useItem('potion')
  if (a === 'revive') hud.useItem('revive')
})
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase()
  keys.delete(k)
  const a = actionOf(k)
  const slot = a ? ATTACKS[a] : undefined
  if (game && slot !== undefined) game.held[slot] = false
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
  const held = (a: Action, arrow: string) => keys.has(arrow) || (!!keyOf(a) && keys.has(keyOf(a)))
  if (held('left', 'arrowleft')) x--
  if (held('right', 'arrowright')) x++
  if (held('up', 'arrowup')) y--
  if (held('down', 'arrowdown')) y++

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

/** A controller plays the match you're in (not one you're watching) and drives the menus otherwise. */
const padHooks: PadHooks = {
  control: () => (game && hud && viewing && !spec ? { g: game, hud } : null),
  pause: () => confirmLeave(),
  board: () => hud?.board.toggle(),
  chat: () => !!hud?.openChat(),
}

// ---------- A second screen (AYN Thor's lower display, or /duo in another window) ----------

/** The chat so far (this room), for the second screen. */
const duoChat: DuoState['chat'] = []

function duoState(withMini: boolean): DuoState {
  const lang = L('en', 'nl') as 'en' | 'nl'
  const base = { t: 'state' as const, lang, chat: room ? duoChat : [], canChat: !!room }
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec) % 60).padStart(2, '0')}`
  const g = game
  if (g && (viewing || spec)) {
    const p = g.player
    const kind = g.kind
    const label = kind === 'raid' ? 'Raid' : kind === 'duel' ? '1 vs 1' : 'Battle Royale'
    if (spec || !p.alive) {
      const left = g.trainers.filter((t) => t.alive).length
      return { ...base, scene: 'watch', kind, label, title: L('Spectating', 'Toeschouwer'), sub: kind === 'royale' ? L(`${left} trainers left`, `${left} trainers over`) : clock(g.time) }
    }
    const party = p.party.map((m, i) => ({ id: m.species.id, name: m.name, lv: m.level, hp: Math.max(0, m.hp), max: m.maxHp, active: i === p.active, fainted: m.fainted, shiny: !!m.shiny }))
    const st: DuoState = { ...base, scene: 'match', kind, label, title: '', sub: clock(g.time), party, items: { master: p.masterBalls, potion: p.potions, revive: p.revives } }
    if (kind === 'royale') {
      const left = g.trainers.filter((t) => t.alive).length
      st.title = L(`${left} trainers left`, `${left} trainers over`)
      if (withMini && hud) st.mini = hud.miniUrl()
    } else if (kind === 'raid') {
      const b = g.wilds.find((w) => w.boss)
      st.title = b?.name ?? 'Raid'
      if (b) st.boss = { name: b.name, species: b.species.id, k: Math.max(0, b.hp / b.maxHp), phase: g.raidView?.phase ?? 0, lives: p.lives }
      if (g.raidView) st.sub = clock(g.raidView.timeLeft)
    } else {
      const opp = g.trainers.find((t) => t !== p)
      st.title = L(`Round ${g.duel?.round ?? 1}`, `Ronde ${g.duel?.round ?? 1}`)
      st.duel = { mine: p.kos, theirs: opp?.kos ?? 0, opp: opp?.name ?? '' }
    }
    return st
  }
  const inLobby = !!room && !!lobbyUi
  return {
    ...base,
    scene: inLobby ? 'lobby' : 'menu',
    label: inLobby ? L(`Lobby ${room!.code}`, `Lobby ${room!.code}`) : 'Stormbreak Royale',
    title: inLobby ? L(`${room!.players.length} players`, `${room!.players.length} spelers`) : L('Second screen ready', 'Tweede scherm klaar'),
    sub: L('Play on the other screen', 'Speel op het andere scherm'),
    trainer: trainer.sprite,
    mon: team[0],
  }
}

duoInit({
  state: duoState,
  cmd: (c) => {
    const g = game
    if (c.c === 'say') {
      if (room && c.text.trim()) room.say(c.text.slice(0, 80))
      return
    }
    if (!g || !viewing || spec || !hud) return
    const p = g.player
    if (c.c === 'item') hud.useItem(c.key)
    else if (c.c === 'switch') {
      if (!g.paused && c.i !== p.active) g.switchTo(p, c.i)
    } else if (c.c === 'board') hud.board.toggle()
    else if (c.c === 'pause') confirmLeave()
    duoNow()
  },
})

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (game && viewing) desktopInput(game)
  padTick(padHooks)
  duoTick()
  if (game) {
    const g = game
    const steps = spec && spec.g === g && g.mode === 'solo' ? spec.speed : 1
    for (let i = 0; i < steps; i++) g.update(dt)
    if (spec) spectateTick(dt)
    if (g.mode === 'host') hostNet(g, dt)
    if (viewing && (g.mode !== 'client' || g.net?.placed)) {
      setTempo(g.kind === 'raid' ? ((g.raidView?.phase ?? 0) >= 2 ? 1.08 : 1) : g.zone.phase >= 4 ? 1.08 : 1)
      render(g, ctx, canvas.width, canvas.height)
      hud?.update()
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

/**
 * A hidden tab gets no animation frames, which would freeze the match for everyone
 * when the host alt-tabs. While hidden, a worker's timer (not throttled like the page's)
 * keeps the simulation and the network going; drawing waits until you're back.
 */
let bgLast = 0
const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33)'], { type: 'text/javascript' })))
ticker.onmessage = () => {
  const g = game
  const now = performance.now()
  const dt = Math.min(0.1, (now - (bgLast || now)) / 1000)
  bgLast = now
  if (!document.hidden || !g || g.mode === 'client') {
    bgLast = 0
    return
  }
  // Solo matches may pause in the background; anything with other players keeps running
  if (g.mode !== 'host') return
  // Same step size as the visible loop
  for (let t = dt; t > 0; t -= 0.05) g.update(Math.min(0.05, t))
  hostNet(g, dt)
  last = now
}

// Handy for debugging from the console.
;(window as unknown as { battlemon: unknown }).battlemon = { get game() { return game }, get room() { return room }, get music() { return currentMusic() }, remotes, snapshot, voiceLog, sound: { move: moveByName, namePitch, cast: playMoveCast, hit: playMoveHit, charge: playMoveCharge, item: playItem, boss: playBoss, reset: resetSfx, ready: loadSfx } }

// Installable as an app (and quicker on the next visit): the service worker, once the page has loaded
if ('serviceWorker' in navigator && import.meta.env.PROD)
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))

// This window is the second screen (/duo): no game here, just the companion view
if (isDuoPage) startDuoView()
else toTitle()
