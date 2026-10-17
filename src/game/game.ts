import { PARTY_MAX, rarityOf, ROSTER, SPECIES, TEAM_SIZE, WILD, type Rarity } from '../data/pokemon'
import { eventTimes, startEvent, updateEvents, type WorldEvent } from './events'
import { roleInfo } from '../data/roles'
import { decided, scoreRows, type ScoreRow } from './score'
import { raidDown, raidIntro, setupRaid, updateRaid, type Hazard, type RaidState, type RaidView } from './boss'
import { movesetFor, SLOT_UNLOCK, type Move, type MoveFx } from '../data/moves'
import { Vfx } from './vfx'
import { chargeTick, dashTick, onBeam, onBurst, onCast as fxCast, onHit, onImpact, onMelee, onRelease, onZap, pal, projectileEnd, projectileTick } from './moveFx'
import { BOT_TRAINERS, TRAINERS } from '../data/trainers'
import { effectiveness, TYPE_COLOR } from '../data/types'
import { cry, sfx } from '../audio'
import type { ItemSound } from '../moveSfx'
import { LEVEL_CAP, Mon, Trainer, xpNeeded, type AimDir } from './entities'
import { Rng } from './rng'
import { preloadMon } from './sprites'
import { MAP, T, World } from './world'
import type { ThemeId } from '../data/themes'
import { BOSSES, type BossId } from '../data/bosses'
import { botThink } from './ai'
import type { Dir } from './entities'
import type { Command } from '../net/protocol'
import type { ClientState } from '../net/sync'
import type { VoiceLine } from '../voice'
import { both, type Txt } from '../i18n'

/** 'evolve' = the Evolution Crystal: walk over it and your Pokémon is fully evolved with every move. */
export type ItemKind = 'master' | 'potion' | 'candy' | 'revive' | 'evolve'
const PICKUP_SOUND: Record<ItemKind, ItemSound> = { master: 'pickupMaster', potion: 'pickupPotion', candy: 'pickupCandy', revive: 'pickupRevive', evolve: 'pickupSurge' }
export const ITEM_SPRITE: Record<ItemKind, string> = {
  master: 'master-ball', potion: 'potion', candy: 'rare-candy', revive: 'revive', evolve: 'shiny-stone',
}
export const ITEM_NL: Record<ItemKind, string> = {
  master: 'Master Ball', potion: 'Potion', candy: 'Rare Candy', revive: 'Revive', evolve: 'Evolution Crystal',
}

export interface GroundItem {
  x: number
  y: number
  kind: ItemKind
  bob: number
}

export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  move: Move
  src: Mon
  mult: number
  tgt: Mon | null
  seed: number
}

const PROJ_SPEED: Partial<Record<MoveFx, number>> = {
  ember: 9, water: 11, ice: 15, aura: 8, shadowball: 8, energy: 8.5, rock: 9, mud: 10, wind: 12, psy: 9,
  pin: 14, star: 11, sting: 15, dragonrage: 10, darkpulse: 10, mirror: 12, leaf: 11, snow: 9, poison: 9,
}

export interface Nova {
  x: number
  y: number
  t: number
  total: number
  move: Move
  src: Mon
  r: number
  mult: number
  /** Where the move was cast from (lobbed orbs fly from here). */
  sx: number
  sy: number
}

export interface Fx {
  kind: 'text' | 'spark' | 'poof' | 'heal' | 'melee' | 'callout'
  style?: MoveFx
  x: number
  y: number
  x2?: number
  y2?: number
  t: number
  life: number
  color: string
  r?: number
  text?: Txt
  vx?: number
  vy?: number
  big?: boolean
  small?: boolean
}

interface PendingCatch {
  tr: Trainer
  mon: Mon
  t: number
  master: boolean
}

export interface ZonePhase {
  wait: number
  shrink: number
  r: number
  dps: number
}

const PHASES: ZonePhase[] = [
  { wait: 55, shrink: 35, r: 46, dps: 0.02 },
  { wait: 40, shrink: 30, r: 30, dps: 0.035 },
  { wait: 35, shrink: 28, r: 18, dps: 0.05 },
  { wait: 30, shrink: 24, r: 9, dps: 0.08 },
  { wait: 25, shrink: 20, r: 3.5, dps: 0.12 },
  { wait: 20, shrink: 20, r: 0, dps: 0.2 },
]

export class Zone {
  x = MAP / 2
  y = MAP / 2
  r = 95
  fromX = MAP / 2
  fromY = MAP / 2
  fromR = 95
  nx = MAP / 2
  ny = MAP / 2
  nr = 46
  phase = 0
  t = 0
  shrinking = false
  get dps() {
    return PHASES[Math.min(this.phase, PHASES.length - 1)].dps
  }
  get timeLeft() {
    const p = PHASES[Math.min(this.phase, PHASES.length - 1)]
    return this.shrinking ? p.shrink - this.t : p.wait - this.t
  }
  outside(x: number, y: number) {
    return Math.hypot(x - this.x, y - this.y) > this.r
  }
}

export type BannerKind = 'go' | 'levelup' | 'move' | 'legendary' | 'ko' | 'caught' | 'storm' | 'win' | 'fainted'

export interface Banner {
  kind: BannerKind
  /** Announcer line to go with it */
  voice?: VoiceLine
  title: Txt
  sub?: Txt
  /** Pokémon or trainer sprite id to show */
  mon?: number
  shiny?: boolean
  trainer?: string
  color?: string
}

/** What a feed line is about (its colour and icon) and who's in it. */
export type FeedKind = 'ko' | 'spawn' | 'drop' | 'storm' | 'boss' | 'info'
export interface FeedIcon {
  mon?: number
  trainer?: string
  kind?: FeedKind
}

export interface GameHooks {
  toast(text: Txt, color?: string): void
  feed(text: Txt, icon?: FeedIcon): void
  banner(b: Banner): void
  evolve(from: number, to: number, shiny: boolean, done: () => void): void
  partyFull(mon: Mon, choose: (idx: number) => void): void
  end(result: GameResult): void
}

/** Length of the drop-in countdown before the match starts (s). */
/** Title card (with the announcer) and then 3-2-1. */
export const INTRO_TIME = 5.3
/** How close you must be to spot someone hiding in tall grass (tiles). */
export const BUSH_SIGHT = 2.8
/** Attacking from the grass gives you (and your trainer) away for this long. */
const REVEAL_TIME = 3
/** Getting hit also shows where you are. */
const HIT_REVEAL = 2
/** Stepping into tall grass: this long before you're actually hidden. */
const GRASS_HIDE = 0.8

export interface GameResult {
  won: boolean
  place: number
  total: number
  time: number
  kos: number
  caught: number
  best: Pick<Mon, 'name' | 'level' | 'shiny'> & { species: { id: number } }
  /** Raid results: your damage to the boss and lives left. */
  raid?: { boss: BossId; dmg: number; share: number; lives: number }
  /** Every trainer's stats when your match ended. */
  board: ScoreRow[]
  /** For progress: legendaries caught, evolutions, the Evolution Crystal, people in the match. */
  extra: { legend: number; evolved: number; crystal: boolean; humans: number }
  /** The match was over for everyone (otherwise it's the standing so far). */
  final: boolean
  /** Your trainer id (to highlight your row). */
  me: number
}

/** One human in a match (solo = just you). */
export interface HumanSetup {
  /** Stable player id (local profile id, later an account id). */
  pid: string
  name: string
  trainer: string
  team: number[]
  /** Partner in its shiny form (unlocked with mastery). */
  shiny?: boolean
}

/** Battle royale (last trainer standing) or raid (everyone against a boss). */
export type MatchKind = 'royale' | 'raid'

export interface MatchSetup {
  seed: number
  humans: HumanSetup[]
  kind?: MatchKind
  /** Battle royale world (already resolved from "random"). */
  theme?: ThemeId
  /** Raid boss. */
  boss?: BossId
}

/** solo = everything local; host = simulates for remote players too; client = renders the host's state. */
export type GameMode = 'solo' | 'host' | 'client'

export type SfxName = keyof typeof sfx

/**
 * Someone watching the match. The local player plays sounds and shows banners
 * directly; remote players (on the host) get them sent over the network.
 */
export interface Viewer {
  tr: Trainer
  local: boolean
  camX: number
  camY: number
  hooks: GameHooks
  sfx(name: SfxName, ...args: unknown[]): void
  cry(id: number, vol: number): void
  fx(f: Fx): void
  /** Countdown to the results screen once this player is out (or won). */
  endT: number
  done: boolean
}

const RARITY_XP: Record<Rarity, number> = { common: 1, uncommon: 1.4, rare: 2.5, legendary: 5 }
/** Seconds out of combat before HP starts regenerating, and regen rates (fraction of max HP / s). */
const REGEN_DELAY = 3
const REGEN_ACTIVE = 0.12
const REGEN_BENCH = 0.06
/** Trainers per match; empty seats are filled with bots. */
export const SEATS = 12
const DMG_SCALE = 1.25
const BOT_XP = 0.8
/** Seconds a weakened wild Pokémon is reserved for whoever knocked it out (legendaries longer). */
const CLAIM_TIME = 3
const CLAIM_TIME_LEGEND = 8
/** Chance a bot's normal ball holds a legendary; on a miss it has to wait before trying again. */
const BOT_LEGEND_CATCH = 0.35
const BOT_RETRY = 5

export class Game {
  rng: Rng
  world: World
  trainers: Trainer[] = []
  player!: Trainer
  wilds: Mon[] = []
  items: GroundItem[] = []
  projs: Projectile[] = []
  novas: Nova[] = []
  fx: Fx[] = []
  vfx = new Vfx()
  hitStop = 0
  introT = INTRO_TIME
  partnerOut = false
  catches: PendingCatch[] = []
  zone = new Zone()
  flow!: Int32Array
  time = 0
  paused = false
  over = false
  camX = 0
  camY = 0
  spectate: Trainer | null = null
  input = { mx: 0, my: 0 }
  /** World position of the mouse cursor (desktop); attacks aim near it. */
  aimAt: { x: number; y: number } | null = null
  /** Live aim preview while the player drags an attack button. */
  aimPreview: { slot: number; x: number; y: number; k: number } | null = null
  /** Who the player is currently fighting (for the target reticle). */
  playerTarget: Mon | null = null
  private lastTarget: Mon | null = null
  private lastTargetT = 0
  held = [false, false, false, false]
  private spawnT = 0
  private legendIdx = 0
  /** When the legendaries show up this match (randomised). */
  private legendTimes: number[] = []
  /** Battle royale: supply drops and swarms (synced to clients). */
  events: WorldEvent[] = []
  private eventPlan: { t: number; kind: WorldEvent['kind'] }[] = []
  private passiveT = 0
  total = SEATS
  /** Everyone watching this match: just you in solo, every human on the host. */
  viewers: Viewer[] = []
  private viewerOf = new Map<Trainer, Viewer>()
  /** Host: every human is out or the match has a winner. */
  allDone = false
  /** Client: sends a command to the host. */
  send: ((c: Command) => void) | null = null
  /** Client: objects by host id and their network positions. */
  net: ClientState | null = null
  /** Raid: the boss fight state (host and solo). */
  raid: RaidState | null = null
  /** Someone keeps watching after their own match ended: the world plays on. */
  watch = false
  /** This screen doesn't show the match (the host is back in the lobby): no sound here. */
  silent = false
  /** Spectating: the trainer the camera follows (picked by the viewer). */
  follow: Trainer | null = null
  /** Raid HUD info, on the host and on clients: time left, boss phase, pillars standing. */
  raidView: RaidView | null = null
  /** Raid: Mewtwo's mirror images (drawn see-through, can't be hit). */
  clones: Mon[] = []
  /** Raid: telegraphed boss attacks on the ground (synced to clients). */
  hazards: Hazard[] = []
  /** >0 while spawning effects that clients draw themselves (not sent over the network). */
  vfxMute = 0
  private netT = 0

  kind: MatchKind
  constructor(public setup: MatchSetup, me: number, public hooks: GameHooks, public mode: GameMode = 'solo') {
    this.kind = setup.kind ?? 'royale'
    this.rng = new Rng(setup.seed)
    this.world = new World(this.rng, this.kind === 'raid' ? { arena: BOSSES[setup.boss ?? 'reshiram'].arena } : { theme: setup.theme })
    // The client only needs the world: everything else comes from the host.
    if (mode === 'client') return
    this.pickNextZone()

    setup.humans.forEach((h, i) => {
      const def = TRAINERS.find((t) => t.key === h.trainer) ?? TRAINERS[0]
      const tr = new Trainer(def, h.name || def.name, i === me)
      tr.human = true
      tr.pid = h.pid
      tr.party = h.team.slice(0, TEAM_SIZE).map((id, j) => this.ownMon(new Mon(id, 5, !!h.shiny && j === 0), tr))
      this.trainers.push(tr)
      if (i === me) {
        this.player = tr
        this.addViewer(this.localViewer(tr))
      }
    })
    if (!this.player) this.player = this.trainers[0]

    if (this.kind === 'raid') {
      // Everyone against one boss: no bots, no wild Pokémon, no storm
      setupRaid(this, setup.boss ?? 'reshiram')
      this.camX = this.player.x
      this.camY = this.player.y
      return
    }

    const bots = [...BOT_TRAINERS].sort(() => this.rng.next() - 0.5)
    for (let i = 0; this.trainers.length < SEATS; i++) {
      const def = bots[i % bots.length]
      const bot = new Trainer(def, def.name, false)
      const pool = [...ROSTER].sort(() => this.rng.next() - 0.5)
      bot.party = pool.slice(0, TEAM_SIZE).map((id) => this.ownMon(new Mon(id, 5), bot))
      this.giveBrain(bot)
      this.trainers.push(bot)
    }

    // Spread everyone out over the map.
    const placed: [number, number][] = []
    for (const tr of this.trainers) {
      let p = this.world.randomWalkable()
      for (let k = 0; k < 60; k++) {
        const c = this.world.randomWalkable((x, y) => Math.hypot(x - 64, y - 64) < 52)
        if (placed.every(([a, b]) => Math.hypot(a - c[0], b - c[1]) > 22)) { p = c; break }
      }
      placed.push(p)
      tr.x = p[0]
      tr.y = p[1]
      tr.mon.x = tr.x
      tr.mon.y = tr.y + 0.8
    }
    this.camX = this.player.x
    this.camY = this.player.y

    this.scatterItems()
    this.legendTimes = [this.rng.range(60, 100), this.rng.range(190, 250)]
    // The Evolution Crystal: one per match, early on (everyone races for it)
    this.crystalAt = this.rng.range(28, 45)
    this.eventPlan = eventTimes(this)
    for (let i = 0; i < 22; i++) this.spawnWild(true)
    for (const tr of this.trainers) if (tr.human) tr.party.forEach((m) => preloadMon(m.species.id))
  }

  /** AI takes over a trainer (bots, or a player who disconnected). */
  giveBrain(tr: Trainer) {
    tr.brain = {
      skill: this.rng.range(0.3, 0.85), thinkT: 0, goalX: 0, goalY: 0, target: null,
      lastX: 0, lastY: 0, stuckT: 0, mode: 'wander', strafe: this.rng.chance(0.5) ? 1 : -1,
    }
  }

  // ---------------- Viewers ----------------

  private localViewer(tr: Trainer): Viewer {
    const g = this
    return {
      tr, local: true, endT: -1, done: false,
      get camX() { return g.camX },
      get camY() { return g.camY },
      hooks: this.hooks,
      sfx: (name, ...args) => !g.silent && (sfx[name] as (...a: unknown[]) => void)(...args),
      cry: (id, vol) => !g.silent && cry(id, vol),
      fx: (f) => this.fx.push(f),
    }
  }

  addViewer(v: Viewer) {
    this.viewers.push(v)
    this.viewerOf.set(v.tr, v)
  }

  removeViewer(tr: Trainer) {
    const v = this.viewerOf.get(tr)
    if (!v) return
    this.viewers.splice(this.viewers.indexOf(v), 1)
    this.viewerOf.delete(tr)
    if (this.viewers.every((o) => o.done)) this.allDone = true
  }

  /** The viewer playing as this trainer, if it's a human. */
  vOf(tr: Trainer | null | undefined): Viewer | null {
    return (tr && this.viewerOf.get(tr)) || null
  }

  private seenBy(v: Viewer, x: number, y: number) {
    return Math.abs(x - v.camX) < 14 && Math.abs(y - v.camY) < 12
  }

  /** Play a sound for everyone who can see (x, y). */
  /**
   * A sound from a spot in the world for everyone in earshot: panned left/right
   * from their camera and fainter further away (full volume for `owners`).
   * `skipRemote`: that player's own device already played it.
   */
  soundAt(x: number, y: number, name: SfxName, args: unknown[], o: { owners?: (Trainer | null | undefined)[]; skipRemote?: Trainer | null; range?: number; global?: boolean } = {}) {
    const range = o.range ?? 15
    for (const v of this.viewers) {
      if (o.skipRemote && v.tr === o.skipRemote && !v.local) continue
      const dx = x - v.camX, dy = y - v.camY, d = Math.hypot(dx, dy)
      // Global: the whole arena hears it at full strength (a raid boss), only the panning follows the spot
      if (o.global) {
        v.sfx(name, ...args, Math.max(-0.6, Math.min(0.6, dx / 16)), 1)
        continue
      }
      if (d > range) continue
      const near = 1 - d / range
      const gain = o.owners?.includes(v.tr) ? 1 : 0.6 * near * near
      v.sfx(name, ...args, Math.max(-1, Math.min(1, dx / 9)), gain)
    }
  }


  /** A floating label for everyone who can see it. */
  private addFx(f: Fx) {
    for (const v of this.viewers) if (this.seenBy(v, f.x, f.y)) v.fx(f)
  }

  /** Per-frame visuals (trails, footsteps): clients draw their own, so only the local screen counts. */
  private localSeen(x: number, y: number) {
    return Math.abs(x - this.camX) < 14 && Math.abs(y - this.camY) < 12
  }

  private ownMon(m: Mon, tr: Trainer) {
    m.owner = tr
    m.hp = m.maxHp
    return m
  }

  get alive() {
    return this.trainers.filter((t) => t.alive)
  }

  // ---------------- Main loop ----------------

  update(dt: number) {
    if (this.mode === 'client') return this.clientUpdate(dt)
    if (this.introT > 0) {
      // Drop-in cinematic: the camera swoops down while everyone waits for GO.
      const was = this.introT
      this.introT -= dt
      if (this.raid && was > INTRO_TIME - 0.3 && this.introT <= INTRO_TIME - 0.3) raidIntro(this)
      this.updateFx(dt)
      this.introCamera()
      if (this.introT <= 0) this.releasePartner()
      return
    }
    if (this.hitStop > 0) {
      // Freeze-frame on big hits; only the camera shake keeps going.
      this.hitStop -= dt
      this.vfx.shake = Math.max(0, this.vfx.shake - dt * 10)
      return
    }
    this.updateFx(dt)
    // Only a solo match can pause: in multiplayer the world keeps going.
    if (this.paused && this.mode === 'solo') return
    // Done for every human; when someone stays to watch, play on until it's decided
    if (this.allDone && !(this.watch && !decided(this))) return
    for (const v of this.viewers) {
      if (v.endT < 0 || v.done) continue
      v.endT -= dt
      if (v.endT < 0) this.finish(v)
    }
    this.time += dt
    if (this.kind === 'royale') this.updateZone(dt)

    // Player intent
    const p = this.player
    if (p.alive) {
      p.vx = this.input.mx
      p.vy = this.input.my
      const dir = this.cursorDir(p.mon)
      for (let s = 0; s < 4; s++) if (this.held[s]) this.useMove(p.mon, s, undefined, dir)
      this.updatePlayerTarget(dt)
    }

    for (const tr of this.trainers) {
      if (!tr.alive) continue
      if (tr.brain) botThink(this, tr, dt)
      this.updateTrainer(tr, dt)
    }
    this.passiveT += dt
    if (this.passiveT >= 1 && this.kind === 'royale') {
      this.passiveT -= 1
      for (const tr of this.alive)
        tr.party.forEach((m, i) => !m.fainted && this.gainXp(m, i === tr.active ? 4 : 2))
    }

    this.updateWilds(dt)
    this.tickHpLag(dt)
    this.updateProjectiles(dt)
    this.updateNovas(dt)
    this.updateCatches(dt)
    this.updateItems()
    if (this.raid) updateRaid(this, dt)
    else {
      this.spawnLoop(dt)
      if (this.crystalAt > 0 && this.time >= this.crystalAt) this.spawnCrystal()
      if (this.eventPlan.length && this.time >= this.eventPlan[0].t) startEvent(this, this.eventPlan.shift()!.kind)
      updateEvents(this, dt)
    }

    const focus = p.alive ? p : this.follow?.alive ? this.follow : this.spectate && this.spectate.alive ? this.spectate : (this.spectate = this.alive[0] ?? p)
    const k = Math.min(1, dt * 8)
    const [fx, fy] = this.camTarget(focus)
    this.camX += (fx - this.camX) * k
    this.camY += (fy - this.camY) * k
  }

  /** Where the camera looks: at you, and in a raid a bit toward the boss so both are in view. */
  private camTarget(focus: { x: number; y: number }): [number, number] {
    const boss = this.kind === 'raid' ? this.wilds.find((w) => w.boss) : null
    if (!boss) return [focus.x, focus.y]
    // Aim at the boss's body, not its feet: the sprite is several tiles tall
    const dx = boss.x - focus.x, dy = boss.y - 1.5 - focus.y, d = Math.hypot(dx, dy)
    const lead = Math.min(d * 0.5, 7)
    return d > 0.01 ? [focus.x + (dx / d) * lead, focus.y + (dy / d) * lead] : [focus.x, focus.y]
  }

  private updateTrainer(tr: Trainer, dt: number) {
    tr.swapCd = Math.max(0, tr.swapCd - dt)
    tr.revealT = Math.max(0, tr.revealT - dt)
    tr.mon.revealT = Math.max(0, tr.mon.revealT - dt)
    // Out of the grass you're always seen, and stay seen for a moment after stepping in
    if (!this.world.isTall(tr.x, tr.y)) tr.revealT = Math.max(tr.revealT, GRASS_HIDE)
    if (!this.world.isTall(tr.mon.x, tr.mon.y)) tr.mon.revealT = Math.max(tr.mon.revealT, GRASS_HIDE)
    // Remote players move themselves; their position arrives over the network.
    const len = tr.remote ? tr.netMoving : this.walk(tr, dt)
    if (!tr.remote) this.windPush(tr, dt)

    // Active Pokémon
    const m = tr.mon
    for (let i = 0; i < 4; i++) m.cds[i] = Math.max(0, m.cds[i] - dt)
    if (m.fainted) {
      tr.autoSwapT -= dt
      if (tr.autoSwapT <= 0) {
        const idx = tr.healthyIndex()
        if (idx >= 0) this.sendOut(tr, idx)
      }
    } else if (m.dash) this.updateDash(m, dt)
    else {
      this.updateCharge(m, dt)
      const [fx, fy] = dirVec(tr.dir)
      const bx = tr.x - fx * 0.95
      const by = tr.y - fy * 0.75 + 0.15
      const d = Math.hypot(bx - m.x, by - m.y)
      if (d > 7) {
        m.x = bx
        m.y = by
      } else if (d > 0.05) {
        const step = Math.min(d, Math.max(5, d * 6) * dt)
        m.mvx = ((bx - m.x) / d) * step
        m.mvy = ((by - m.y) / d) * step
        m.x += m.mvx
        m.y += m.mvy
      }
    }
    m.aimT -= dt
    m.dir = m.aimT > 0 ? dirOf(m.aimX, m.aimY) : len > 0.08 ? tr.dir : m.dir

    m.frozenT = Math.max(0, m.frozenT - dt)

    // Out-of-combat regeneration (Brawl Stars style); a raid has potions instead
    if (this.kind === 'royale') this.regen(tr, dt)

    // Storm
    if (this.kind === 'royale' && this.zone.outside(tr.x, tr.y) && !m.fainted) {
      m.combatT = 0
      this.vOf(tr)?.sfx('stormTick')
      m.hp -= m.maxHp * this.zone.dps * dt
      if (m.hp <= 0) {
        m.hp = 0
        this.onFaint(m, null)
      }
    }
  }

  /** Client: glides toward the host's state and runs the visuals that aren't sent over the network. */
  private clientUpdate(dt: number) {
    this.updateFx(dt)
    const p = this.player
    const cs = this.net
    if (!p || !cs?.placed) return
    if (this.introT > 0) {
      this.introT -= dt
      this.introCamera()
      if (this.introT <= 0) this.partnerOut = true
      return
    }
    this.time += dt

    // Your own trainer moves locally so walking feels instant
    if (p.alive) {
      p.vx = this.input.mx
      p.vy = this.input.my
      const moving = this.walk(p, dt)
      this.windPush(p, dt)
      p.swapCd = Math.max(0, p.swapCd - dt)
      for (const m of p.party) for (let i = 0; i < 4; i++) m.cds[i] = Math.max(0, m.cds[i] - dt)
      const dir = this.cursorDir(p.mon)
      for (let s = 0; s < 4; s++) if (this.held[s]) this.useMove(p.mon, s, undefined, dir)
      this.updatePlayerTarget(dt)
      this.netT -= dt
      if (this.netT <= 0) {
        this.netT = 0.05
        this.send?.({ t: 'in', x: p.x, y: p.y, d: p.dir, f: p.faceRight ? 1 : 0, w: p.walkT, m: Math.min(1, moving), cx: this.camX, cy: this.camY })
      }
    } else {
      this.playerTarget = null
      this.netT -= dt
      if (this.netT <= 0) {
        this.netT = 0.25
        this.send?.({ t: 'in', x: p.x, y: p.y, d: p.dir, f: 0, w: 0, m: 0, cx: this.camX, cy: this.camY })
      }
    }

    // Everything else glides toward where the host says it is
    const k = 1 - Math.exp(-dt * 16)
    for (const [o, [gx, gy]] of cs.goal) {
      const dx = gx - o.x, dy = gy - o.y
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        o.x = gx
        o.y = gy
      } else {
        o.x += dx * k
        o.y += dy * k
      }
      if (o instanceof Mon) {
        o.mvx = dx * k
        o.mvy = dy * k
        if (!o.owner && (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02) && this.localSeen(o.x, o.y)) this.stepFx(o.x, o.y, dt * 0.6)
      } else if (Math.hypot(dx, dy) > 0.05 && this.localSeen(o.x, o.y)) this.stepFx(o.x, o.y, dt)
    }

    // Local-only visuals: charge-ups, dash trails, projectile trails
    const mons = [...this.wilds, ...this.trainers.filter((t) => t.alive).map((t) => t.mon)]
    for (const m of mons) {
      if (!this.localSeen(m.x, m.y)) continue
      if (m.charging) {
        m.charging.t = Math.max(0, m.charging.t - dt)
        chargeTick(this.vfx, m.charging.move, m.x, m.y - 0.5, 1 - m.charging.t / m.charging.total)
      }
      if (m.dash) dashTick(this.vfx, m.dash.strike ? 'aerialace' : m.dash.move.fx, m.x, m.y - 0.4, m.dash.vx, m.dash.vy)
      m.flash = Math.max(0, m.flash - dt)
      m.castT = Math.max(0, m.castT - dt)
      m.tintT = Math.max(0, m.tintT - dt)
      m.joltT = Math.max(0, m.joltT - dt)
      m.liftT = Math.max(0, m.liftT - dt)
      m.evolveFx = Math.max(0, m.evolveFx - dt)
    }
    for (const pr of this.projs) {
      if (this.localSeen(pr.x, pr.y)) projectileTick(this.vfx, pr.move.fx, pr.x, pr.y, pr.vx, pr.vy)
      pr.x += pr.vx * dt
      pr.y += pr.vy * dt
    }
    for (const n of this.novas) n.t = Math.max(0.001, n.t - dt)
    for (const e of this.events) e.t = Math.max(0, e.t - dt)
    for (const h of this.hazards) {
      h.t = Math.max(0, h.t - dt)
      // Tornados keep moving between snapshots
      if (h.t <= 0 && h.dur > 0) {
        h.x += h.vx * dt
        h.y += h.vy * dt
        h.dur = Math.max(0, h.dur - dt)
      }
    }
    if (this.raidView) this.raidView.timeLeft = Math.max(0, this.raidView.timeLeft - dt)
    for (const tr of this.trainers) if (tr.respawnT > 0) tr.respawnT = Math.max(0, tr.respawnT - dt)
    for (const tr of this.trainers) if (tr.throwFx) tr.throwFx.t += dt
    this.tickHpLag(dt)

    const focus = p.alive ? p : this.follow?.alive ? this.follow : p.spectate && p.spectate.alive ? p.spectate : this.alive[0] ?? p
    const kc = Math.min(1, dt * 8)
    const [fx, fy] = this.camTarget(focus)
    this.camX += (fx - this.camX) * kc
    this.camY += (fy - this.camY) * kc
  }

  /** Drop-in camera; in a raid it first shows off the boss, then swings to you. */
  private introCamera() {
    const p = this.player
    const boss = this.kind === 'raid' ? this.wilds.find((w) => w.boss) : null
    if (boss && this.introT > INTRO_TIME * 0.45) {
      this.camX = boss.x
      this.camY = boss.y
    } else if (boss) {
      const k = Math.min(1, 0.12)
      const [fx, fy] = this.camTarget(p)
      this.camX += (fx - this.camX) * k
      this.camY += (fy - this.camY) * k
    } else {
      this.camX = p.x
      this.camY = p.y
    }
  }

  /** Delta Stream: the wind shoves your own trainer along (everyone moves their own). */
  windPush(tr: Trainer, dt: number) {
    const w = this.raidView?.wind
    if (!w || !tr.alive || tr.mon.fainted) return
    this.tryMove(tr, w[0] * dt, w[1] * dt, 0.3)
  }

  /** Walks a trainer along its input vector. Returns the input strength. */
  walk(tr: Trainer, dt: number) {
    let len = Math.hypot(tr.vx, tr.vy)
    // Speedsters make their trainer quicker on their feet
    const speed = 4.4 * (tr.mon && !tr.mon.fainted ? roleInfo(tr.mon.species.id).speed : 1)
    // Frozen solid by an ice attack: can't move for a moment
    if (tr.mon && tr.mon.frozenT > 0 && !tr.mon.fainted) len = 0
    // Ice floor: you keep sliding and turn slowly
    if (this.world.at(Math.floor(tr.x), Math.floor(tr.y)) === T.ICE) {
      const n = Math.min(1, len)
      const tx = len > 0.08 ? (tr.vx / len) * n * speed * 1.1 : 0, ty = len > 0.08 ? (tr.vy / len) * n * speed * 1.1 : 0
      const k = Math.min(1, dt * 2.4)
      tr.slideX += (tx - tr.slideX) * k
      tr.slideY += (ty - tr.slideY) * k
      if (!this.tryMove(tr, tr.slideX * dt, tr.slideY * dt, 0.3)) tr.slideX = tr.slideY = 0
      const sp = Math.hypot(tr.slideX, tr.slideY)
      if (len > 0.08) {
        tr.dir = dirOf(tr.vx, tr.vy)
        if (Math.abs(tr.vx) > 0.15) tr.faceRight = tr.vx > 0
      }
      tr.walkT = sp > 0.3 && len > 0.08 ? tr.walkT + dt * 7 : 0
      return Math.max(len, sp / speed)
    }
    if (len > 0.08) {
      tr.slideX = (tr.vx / len) * Math.min(1, len) * speed
      tr.slideY = (tr.vy / len) * Math.min(1, len) * speed
    } else tr.slideX = tr.slideY = 0
    if (len > 0.08) {
      const n = Math.min(1, len)
      const dx = (tr.vx / len) * n * speed * dt
      const dy = (tr.vy / len) * n * speed * dt
      this.tryMove(tr, dx, dy, 0.3)
      tr.dir = dirOf(tr.vx, tr.vy)
      if (Math.abs(tr.vx) > 0.15) tr.faceRight = tr.vx > 0
      tr.walkT += dt * n * 7
      if (this.localSeen(tr.x, tr.y)) this.quiet(() => this.stepFx(tr.x, tr.y, dt))
    } else tr.walkT = 0
    return len
  }

  /** GO! Every player's partner pops out of its Poké Ball. */
  private releasePartner() {
    this.partnerOut = true
    for (const v of this.viewers) {
      const m = v.tr.mon
      v.sfx('release')
      v.cry(m.species.id, 0.35)
      this.vfx.mark(m.x, m.y)
      this.vfx.ring(m.x, m.y - 0.2, 1.6, '#ffffff', 0.5, 6)
      this.vfx.glow(m.x, m.y - 0.5, 40, '#ffffff', 0.4)
      this.vfx.burst(m.x, m.y - 0.5, { n: 18, speed: 6, cols: ['#ffffff', '#fff0a0', '#ffd040'], shape: 'star', add: true, s0: 3, s1: 0.6, life: 0.7, vr: 10 })
      this.vfx.shakeBy(4)
      v.hooks.banner({ kind: 'go', title: 'GO!' })
    }
  }

  private regen(tr: Trainer, dt: number) {
    tr.party.forEach((m, i) => {
      m.combatT += dt
      if (m.fainted || m.hp >= m.maxHp || m.combatT < REGEN_DELAY) return
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * (i === tr.active ? REGEN_ACTIVE : REGEN_BENCH) * dt)
    })
    const m = tr.mon, v = this.vOf(tr)
    if (v && this.regenerating(m)) {
      tr.regenFxT -= dt
      if (tr.regenFxT <= 0) {
        if (tr.regenFxT < -0.5 || m.combatT - dt < REGEN_DELAY) v.sfx('regen')
        tr.regenFxT = 0.45
        v.fx({ kind: 'heal', x: m.x, y: m.y - 0.5, t: 0, life: 0.7, color: '#80f080' })
      }
    }
  }

  /** True while a Pokémon is healing from out-of-combat regen. */
  regenerating(m: Mon) {
    return !m.fainted && m.hp < m.maxHp && m.combatT >= REGEN_DELAY
  }

  /** Rustling grass and footstep dust. */
  private stepFx(x: number, y: number, dt: number) {
    const t = this.world.at(Math.floor(x), Math.floor(y))
    if (t === T.TALL) this.world.rustle.set(Math.floor(y) * 128 + Math.floor(x), this.time)
    if (t === T.TALL && Math.random() < dt * 9)
      this.vfx.burst(x, y - 0.1, { n: 2, speed: 2, dir: -Math.PI / 2, spread: 1, cols: ['#88d858', '#48a838', '#2c7a30'], shape: 'leaf', s0: 1.8, s1: 1, life: 0.5, grav: 6 })
    else if ((t === T.PATH || t === T.SAND) && Math.random() < dt * 6)
      this.vfx.burst(x, y + 0.1, { n: 1, speed: 0.6, cols: ['#e8d8b0', '#d0c098'], shape: 'smoke', s0: 1.5, s1: 3.5, life: 0.45, flat: 0.4 })
  }

  /** `manual`: the player switched themselves (their own device already played the sound). */
  sendOut(tr: Trainer, idx: number, manual = false) {
    tr.active = idx
    const m = tr.mon
    m.x = tr.x
    m.y = tr.y + 0.4
    m.dash = null
    this.addFx({ kind: 'poof', x: m.x, y: m.y - 0.4, t: 0, life: 0.4, color: '#ffffff' })
    this.soundAt(m.x, m.y, 'sendOut', [], { owners: [tr], skipRemote: manual ? tr : null, range: 12 })
    for (const v of this.viewers) if (Math.hypot(v.camX - m.x, v.camY - m.y) < 10) v.cry(m.species.id, v.tr === tr ? 0.3 : 0.15)
  }

  switchTo(tr: Trainer, idx: number): boolean {
    if (this.send) {
      if (!tr.alive || idx === tr.active || !tr.party[idx] || tr.party[idx].fainted || tr.swapCd > 0) return false
      tr.swapCd = 1.2
      this.send({ t: 'switch', i: idx })
      sfx.sendOut()
      return true
    }
    if (!tr.alive || idx === tr.active || !tr.party[idx] || tr.party[idx].fainted || tr.swapCd > 0) return false
    tr.swapCd = 1.2
    this.sendOut(tr, idx, true)
    return true
  }

  // ---------------- Combat ----------------

  enemiesOf(m: Mon): Mon[] {
    const out: Mon[] = []
    // A raid is everyone against the boss: players never hit each other
    if (!(this.kind === 'raid' && m.owner))
      for (const tr of this.trainers) {
        if (!tr.alive || tr === m.owner) continue
        const a = tr.mon
        if (a && !a.fainted) out.push(a)
      }
    if (m.owner) for (const w of this.wilds) if (w.state !== 'weak') out.push(w)
    return out
  }

  autoTarget(m: Mon, range: number): Mon | null {
    if (!m.owner) return m.aggro && !m.aggro.fainted ? m.aggro : null
    if (m.owner.isPlayer && this.aimAt) {
      // Desktop: take the enemy closest to the cursor (if the cursor is near one)
      let pick: Mon | null = null, pd = 3.5
      for (const e of this.enemiesOf(m)) {
        if (Math.hypot(e.x - m.x, e.y - m.y) > range || !this.canSee(m, e)) continue
        const d = Math.hypot(e.x - this.aimAt.x, e.y - this.aimAt.y)
        if (d < pd) { pd = d; pick = e }
      }
      if (pick) return pick
    }
    let best: Mon | null = null
    let bd = range
    for (const e of this.enemiesOf(m)) {
      if (!this.canSee(m, e)) continue
      // Prefer trainers' Pokémon slightly over wild ones.
      const d = Math.hypot(e.x - m.x, e.y - m.y) - (e.owner ? 0.8 : 0) - bulk(e)
      if (d < bd) { bd = d; best = e }
    }
    return best
  }

  useMove(m: Mon, slot: number, target?: Mon | null, dir?: AimDir): boolean {
    const mv = m.moves[slot]
    if (!mv || !m.unlocked(slot) || m.cds[slot] > 0 || m.fainted || m.state === 'weak' || m.dash || m.catching || m.charging || m.frozenT > 0) return false
    const tgt = target ?? (dir ? this.dirTarget(m, mv.range + 1, dir) : this.autoTarget(m, mv.range + 1.5))
    m.aimDist = dir ? Math.max(1.2, mv.range * dir.k) : null
    m.revealT = REVEAL_TIME
    if (m.owner) m.owner.revealT = REVEAL_TIME
    m.combatT = 0
    if (m.owner?.isPlayer && tgt) {
      this.lastTarget = tgt
      this.lastTargetT = 1.6
    }
    m.cds[slot] = mv.cooldown * (mv.kind === 'dash' ? roleInfo(m.species.id).dashCd : 1)
    if (this.send) {
      // Client: the host runs the move; we only predict the cooldown and facing.
      this.aim(m, tgt, dir)
      // Play our own move right away; the host skips sending it back to us
      if (mv.charge > 0) sfx.moveCharge(mv.fx, mv.tier, mv.charge)
      else sfx.moveCast(mv.name)
      this.send({ t: 'move', s: slot, tg: tgt?.id, d: dir })
      return true
    }
    if (mv.tier >= 1)
      this.addFx({ kind: 'callout', x: m.x, y: m.y - 1.9, t: 0, life: 1, color: TYPE_COLOR[mv.type], text: mv.name, big: mv.tier >= 3 })
    this.aim(m, tgt, dir)
    if (mv.charge > 0) {
      this.soundAt(m.x, m.y, 'moveCharge', [mv.fx, mv.tier, mv.charge], { owners: [m.owner], skipRemote: m.owner })
      m.charging = { move: mv, t: mv.charge, total: mv.charge, tgt, dir }
      fxCast(this.vfx, mv, m, this.nearCam(m.x, m.y))
      return true
    }
    this.fire(m, mv, tgt)
    return true
  }

  /** Trainers and their Pokémon standing in tall grass are hidden, unless revealed. */
  hidden(e: { x: number; y: number; revealT: number }, owned = true): boolean {
    return owned && e.revealT <= 0 && this.world.isTall(e.x, e.y)
  }

  /** Can `viewer` see `e`? Hidden things are only visible up close. */
  canSee(viewer: { x: number; y: number }, e: Mon): boolean {
    if (!e.owner || !this.hidden(e)) return true
    return Math.hypot(viewer.x - e.x, viewer.y - e.y) < BUSH_SIGHT
  }

  /** Enemy closest to an aim line (within ~25°), for manual aiming. */
  private dirTarget(m: Mon, range: number, dir: AimDir): Mon | null {
    let best: Mon | null = null, bs = Infinity
    for (const e of this.enemiesOf(m)) {
      const dx = e.x - m.x, dy = e.y - m.y
      const d = Math.hypot(dx, dy)
      if (d - bulk(e) > range || d < 0.01) continue
      const cos = (dx * dir.x + dy * dir.y) / d
      if (cos < 0.9) continue
      const score = d * Math.sqrt(1 - cos * cos) + d * 0.05
      if (score < bs) { bs = score; best = e }
    }
    return best
  }

  /** Desktop: direction from a Pokémon toward the mouse cursor. */
  cursorDir(m: Mon): AimDir | undefined {
    if (!this.aimAt) return undefined
    const dx = this.aimAt.x - m.x, dy = this.aimAt.y - (m.y - 0.3)
    const d = Math.hypot(dx, dy)
    if (d < 0.3) return undefined
    return { x: dx / d, y: dy / d, k: Math.min(1, d / 7) }
  }

  private updatePlayerTarget(dt: number) {
    const m = this.player.mon
    this.lastTargetT -= dt
    const lt = this.lastTarget
    if (lt && this.lastTargetT > 0 && !lt.fainted && lt.state !== 'weak' && this.canSee(m, lt) && Math.hypot(lt.x - m.x, lt.y - m.y) < 10) this.playerTarget = lt
    else this.playerTarget = m.fainted ? null : this.autoTarget(m, m.moves[0].range + 1.5)
  }

  private aim(m: Mon, tgt: Mon | null, dir?: AimDir) {
    let ax: number, ay: number
    if (dir) {
      ax = dir.x
      ay = dir.y
    } else if (tgt) {
      ax = tgt.x - m.x
      ay = tgt.y - m.y
    } else {
      if (m.owner?.isPlayer && this.aimAt) {
        ax = this.aimAt.x - m.x
        ay = this.aimAt.y - m.y
      } else [ax, ay] = m.owner ? dirVec(m.owner.dir) : dirVec(m.dir)
    }
    const l = Math.hypot(ax, ay) || 1
    m.aimX = ax / l
    m.aimY = ay / l
    m.aimT = 0.6
  }

  /** Ticks a charging move and fires it when ready. */
  private updateCharge(m: Mon, dt: number) {
    const c = m.charging
    if (!c) return
    if (m.fainted || m.state === 'weak' || m.catching) {
      m.charging = null
      return
    }
    c.t -= dt
    if (this.localSeen(m.x, m.y)) this.quiet(() => chargeTick(this.vfx, c.move, m.x, m.y - 0.5, 1 - c.t / c.total))
    if (c.t > 0) return
    m.charging = null
    const tgt = c.tgt && !c.tgt.fainted && c.tgt.state !== 'weak' ? c.tgt : c.dir ? null : this.autoTarget(m, c.move.range + 1.5)
    this.aim(m, tgt, c.dir)
    this.fire(m, c.move, tgt, true)
  }

  private fire(m: Mon, mv: Move, tgt: Mon | null, charged = false) {
    const ax = m.aimX, ay = m.aimY
    const ox = m.x, oy = m.y - 0.45
    const visible = this.onScreen(m.x, m.y)
    const near = this.nearCam(m.x, m.y)
    const v = this.vfx
    m.castT = 0.18
    this.soundAt(m.x, m.y, 'moveCast', [mv.name], { owners: [m.owner], skipRemote: charged ? null : m.owner })
    if (!charged) fxCast(v, mv, m, near)
    else if (near) onRelease(v, mv, m)

    switch (mv.kind) {
      case 'melee': {
        // Lunge: dart to the target (or the aimed spot) and strike on arrival
        let tx: number, ty: number
        if (tgt && Math.hypot(tgt.x - m.x, tgt.y - m.y) <= mv.range + 0.8) {
          const dx = tgt.x - m.x, dy = tgt.y - m.y
          const d = Math.hypot(dx, dy) || 1
          tx = tgt.x - (dx / d) * 0.55
          ty = tgt.y - (dy / d) * 0.55
          m.aimX = dx / d
          m.aimY = dy / d
        } else {
          const reach = m.aimDist !== null ? Math.min(mv.range, m.aimDist) : mv.range * 0.8
          tx = m.x + ax * reach
          ty = m.y + ay * reach
        }
        const dist = Math.hypot(tx - m.x, ty - m.y)
        if (dist < 0.25) this.strike(m, mv)
        else {
          const sp = 18
          m.dash = { vx: ((tx - m.x) / dist) * sp, vy: ((ty - m.y) / dist) * sp, t: dist / sp, move: mv, hit: new Set(), strike: true }
        }
        break
      }
      case 'bolt':
        this.shoot(m, mv, ox, oy, ax, ay, 1, tgt)
        break
      case 'spread': {
        const n = mv.fx === 'pin' || mv.fx === 'snow' ? 5 : 3
        const spreadA = mv.fx === 'pin' ? 0.12 : 0.28
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * spreadA
          const c = Math.cos(a), s = Math.sin(a)
          this.shoot(m, mv, ox, oy, ax * c - ay * s, ax * s + ay * c, n === 5 ? 0.36 : 0.55, mv.fx === 'star' ? tgt : null)
        }
        break
      }
      case 'dash':
        m.dash = { vx: ax * 13, vy: ay * 13, t: mv.range / 13, move: mv, hit: new Set() }
        if (visible) v.ring(m.x, m.y, 0.9, pal(mv.fx).glow, 0.25, 3)
        break
      case 'zap': {
        // Hitscan lightning: Thunder Shock zaps one target, Thunderbolt chains.
        const range = mv.range
        const main = tgt && Math.hypot(tgt.x - m.x, tgt.y - m.y) <= range + 0.5 + bulk(tgt) ? tgt : null
        const ex = main ? main.x : ox + ax * range * 0.7
        const ey = main ? main.y - 0.45 : oy + ay * range * 0.7
        const big = mv.tier >= 2
        if (visible) onZap(v, mv, ox, oy, ex, ey, big)
        if (!main) this.miss(m, ex, ey)
        if (main) {
          this.hit(m, main, mv)
          if (big) {
            let from = main
            const done = new Set([main])
            for (let j = 0; j < 2; j++) {
              const next = this.enemiesOf(m).find((e) => !done.has(e) && Math.hypot(e.x - from.x, e.y - from.y) < 3.5)
              if (!next) break
              done.add(next)
              if (this.onScreen(next.x, next.y)) onZap(v, mv, from.x, from.y - 0.45, next.x, next.y - 0.45, false, true)
              this.hit(m, next, mv, 0.6)
              from = next
            }
          }
        }
        if (near && big) v.shakeBy(4)
        break
      }
      case 'beam': {
        const ex = ox + ax * mv.range, ey = oy + ay * mv.range
        for (const e of this.enemiesOf(m)) if (segDist(e.x, e.y - 0.4, ox, oy, ex, ey) < 0.8 + bulk(e)) this.hit(m, e, mv)
        if (visible) onBeam(v, mv, ox, oy, ex, ey, () => [m.x + m.aimX * 0.3, m.y - 0.45 + m.aimY * 0.3])
        // Pokémon is locked into the beam for a moment
        m.castT = 0.18
        break
      }
      case 'burst': {
        const r = mv.tier >= 3 ? 3.4 : mv.range
        for (const e of this.enemiesOf(m)) if (Math.hypot(e.x - m.x, e.y - m.y) < r + bulk(e)) this.hit(m, e, mv)
        if (visible) onBurst(v, mv, m.x, m.y - 0.1, r)
        break
      }
      case 'nova': {
        const nx = m.aimDist !== null ? m.x + ax * m.aimDist : tgt ? tgt.x : m.x + ax * 4
        const ny = m.aimDist !== null ? m.y + ay * m.aimDist : tgt ? tgt.y : m.y + ay * 4
        const r = mv.tier >= 3 ? 2.3 : 1.8
        if (mv.fx === 'dracometeor') {
          // A shower of three meteors
          for (const [dx, dy, delay] of [[0, 0, 0.8], [1.4, 0.6, 1.0], [-1.3, 0.8, 1.2]])
            this.novas.push({ x: nx + dx, y: ny + dy, t: delay, total: delay, move: mv, src: m, r: 1.6, mult: 0.55, sx: ox, sy: oy })
        } else {
          const t = mv.fx === 'thunder' ? 0.85 : mv.fx === 'fireblast' || mv.fx === 'focusblast' || mv.fx === 'sludgebomb' ? 0.65 : 0.6
          this.novas.push({ x: nx, y: ny, t, total: t, move: mv, src: m, r, mult: 1, sx: ox, sy: oy })
        }
        break
      }
    }
  }

  private shoot(m: Mon, mv: Move, x: number, y: number, ax: number, ay: number, mult: number, tgt: Mon | null = null) {
    const sp = PROJ_SPEED[mv.fx] ?? 10
    const homing = mv.fx === 'aura' || mv.fx === 'star' || mv.fx === 'shadowball'
    this.projs.push({
      x, y, vx: ax * sp, vy: ay * sp, life: (mv.range + 1.5) / sp, move: mv, src: m, mult,
      tgt: homing ? tgt : null, seed: Math.random() * 10,
    })
  }

  shakeAt(x: number, y: number, amount: number) {
    if (!this.nearCam(x, y)) return
    this.vfx.mark(x, y)
    this.vfx.shakeBy(amount)
  }

  /** Close enough to someone's camera for the full effect (and screen shake). */
  nearCam(x: number, y: number) {
    return this.viewers.some((v) => Math.hypot(x - v.camX, y - v.camY) < 11)
  }

  /** Runs per-frame visuals without sending them to clients (they draw their own). */
  private quiet(fn: () => void) {
    this.vfxMute++
    fn()
    this.vfxMute--
  }

  private updateDash(m: Mon, dt: number) {
    const d = m.dash!
    const step = Math.min(dt, Math.max(0, d.t))
    const nx = m.x + d.vx * step, ny = m.y + d.vy * step
    if (this.world.blocked(nx, ny)) d.t = 0
    else {
      m.x = nx
      m.y = ny
    }
    if (d.strike) {
      if (this.localSeen(m.x, m.y)) this.quiet(() => dashTick(this.vfx, 'aerialace', m.x, m.y - 0.4, d.vx, d.vy))
      d.t -= dt
      if (d.t <= 0) {
        m.dash = null
        this.strike(m, d.move)
      }
      return
    }
    for (const e of this.enemiesOf(m))
      if (!d.hit.has(e) && Math.hypot(e.x - m.x, e.y - m.y) < 1 + bulk(e)) {
        d.hit.add(e)
        this.hit(m, e, d.move)
      }
    if (this.localSeen(m.x, m.y)) this.quiet(() => dashTick(this.vfx, d.move.fx, m.x, m.y - 0.4, d.vx, d.vy))
    d.t -= dt
    if (d.t <= 0) m.dash = null
  }

  /** The melee blow at the end of a lunge. */
  private strike(m: Mon, mv: Move) {
    const ax = m.aimX, ay = m.aimY
    let first: Mon | null = null
    for (const e of this.enemiesOf(m)) {
      const dx = e.x - m.x, dy = e.y - m.y
      const d = Math.hypot(dx, dy)
      if (d < 1.4 + bulk(e) && (d < 0.8 + bulk(e) || (dx * ax + dy * ay) / d > 0.2)) {
        this.hit(m, e, mv)
        first = first ?? e
      }
    }
    m.castT = 0.18
    const fx = first ? first.x : m.x + ax * 0.9
    const fy = first ? first.y - 0.45 : m.y - 0.45 + ay * 0.9
    this.addFx({ kind: 'melee', style: mv.fx, x: fx, y: fy, x2: ax, y2: ay, t: 0, life: 0.32, color: TYPE_COLOR[mv.type] })
    if (this.onScreen(m.x, m.y)) {
      onMelee(this.vfx, mv, fx, fy, ax, ay, !!first)
      if (first) this.shakeAt(m.x, m.y, 2)
    }
    if (!first) this.miss(m, fx, fy)
  }

  /** Grey "Mis" so players can see an attack whiffed. */
  private miss(src: Mon, x: number, y: number) {
    const v = this.vOf(src.owner)
    if (!v || !this.seenBy(v, x, y)) return
    v.fx({ kind: 'text', x, y: y - 0.3, t: 0, life: 0.6, color: '#b8b8c8', text: both('Miss', 'Mis'), small: true })
  }

  hit(src: Mon, tgt: Mon, mv: Move, mult = 1) {
    if (tgt.fainted || tgt.state === 'weak') return
    // Raid boss: shrugs off hits while it roars into a new phase; its ordinary moves hit softer
    if (tgt.boss && this.raid && this.raid.invulnT > 0) {
      const v = this.vOf(src.owner)
      if (v && this.seenBy(v, tgt.x, tgt.y)) {
        v.fx({ kind: 'text', x: tgt.x, y: tgt.y - 2.2, t: 0, life: 0.6, color: '#b8b8c8', text: both('Immune', 'Immuun'), small: true })
        v.sfx('clink')
      }
      return
    }
    // Raid bosses never fully resist: every partner can win the fight
    const eff = tgt.boss ? Math.max(0.8, effectiveness(mv.type, tgt.species.types)) : effectiveness(mv.type, tgt.species.types)
    const L = src.level
    const raw = (((2 * L) / 5 + 2) * mv.power * (src.atk / tgt.def)) / 50 + 2
    // The boss's ordinary moves are chip damage (a share of your HP); its telegraphed attacks are the real threat
    const dmg = src.boss
      ? Math.max(1, Math.round(tgt.maxHp * (0.02 + mv.tier * 0.012) * mult * (eff > 1 ? 1.3 : eff < 1 ? 0.75 : 1)))
      : Math.max(1, Math.round(raw * eff * mult * roleInfo(src.species.id).dmg * DMG_SCALE * this.rng.range(0.9, 1.05)))
    tgt.hp -= dmg
    if (tgt.boss && src.owner) src.owner.bossDmg += Math.min(dmg, tgt.hp + dmg)
    if (src.owner && tgt.owner && tgt.owner !== src.owner) src.owner.dmg += Math.min(dmg, tgt.hp + dmg)
    tgt.flash = 0.12
    tgt.revealT = Math.max(tgt.revealT, HIT_REVEAL)
    if (tgt.owner) tgt.owner.revealT = Math.max(tgt.owner.revealT, HIT_REVEAL)
    tgt.combatT = 0
    src.combatT = 0
    if (src.owner) tgt.lastHitBy = src.owner

    // knockback
    const dx = tgt.x - src.x, dy = tgt.y - src.y
    const d = Math.hypot(dx, dy) || 1
    const kb = 0.12 * roleInfo(tgt.species.id).knock
    if (!tgt.legendary) this.tryMove(tgt, (dx / d) * kb, (dy / d) * kb, 0.2)

    // Impact sound for everyone in earshot, even if the target is hidden in the grass.
    // Novas already boomed where they landed.
    if (mv.kind !== 'nova') this.soundAt(tgt.x, tgt.y, 'moveHit', [mv.fx, mv.tier + (eff > 1 ? 0.5 : 0)], { owners: [src.owner, tgt.owner] })
    const visible = this.onScreen(tgt.x, tgt.y)
    if (visible) {
      const jx = this.rng.range(-0.35, 0.35)
      // Damage numbers are coloured per viewer: red when it's your Pokémon getting hit.
      for (const v of this.viewers) {
        if (!this.seenBy(v, tgt.x, tgt.y)) continue
        const mine = src.owner === v.tr, hurt = tgt.owner === v.tr
        v.fx({
          kind: 'text', x: tgt.x + jx, y: tgt.y - 1.5, t: 0, life: 0.85,
          color: hurt ? '#ff5a50' : eff > 1 ? '#ffd040' : eff < 1 ? '#c8c8d0' : '#ffffff',
          text: `${dmg}${eff > 1 ? '!' : ''}`, big: mine || hurt || eff > 1,
        })
        if ((mine || hurt) && eff !== 1)
          v.fx({
            kind: 'text', x: tgt.x, y: tgt.y - 2.1, t: 0, life: 0.9, small: true,
            color: eff > 1 ? '#ffd040' : '#b8b8c8', text: eff > 1 ? both('Super effective!', 'Super effectief!') : both('Not very effective', 'Weinig effect'),
          })
        if (mine) v.sfx('hitConfirm', eff < 1, eff > 1)
        if (hurt) v.sfx('hit', eff > 1)
      }
      onHit(this.vfx, mv, tgt, eff, this.nearCam(tgt.x, tgt.y))
      if (this.mode === 'solo' && (src.owner?.isPlayer || tgt.owner?.isPlayer) && (mv.tier >= 2 || eff > 1)) this.hitStop = Math.max(this.hitStop, 0.035 + mv.tier * 0.015)
    }
    if (!tgt.owner) {
      tgt.aggro = src
      tgt.aggroT = 8
      tgt.state = 'aggro'
    }
    if (src.owner) this.gainXp(src, (Math.min(dmg, tgt.maxHp) / tgt.maxHp) * 9 * RARITY_XP[tgt.rarity])
    if (tgt.hp <= 0) {
      tgt.hp = 0
      this.onFaint(tgt, src)
    }
  }

  private onFaint(m: Mon, by: Mon | null) {
    this.soundAt(m.x, m.y, 'faint', [], { owners: [m.owner, by?.owner], range: 16 })
    if (this.nearCam(m.x, m.y)) {
      // KO punctuation: freeze, flash ring and a burst of stars
      this.vfx.ring(m.x, m.y - 0.2, 1.8, '#ffffff', 0.5, 5)
      this.vfx.glow(m.x, m.y - 0.5, 30, '#ffffff', 0.3)
      this.vfx.burst(m.x, m.y - 0.5, { n: 14, speed: 6, cols: ['#ffffff', '#fff0a0', '#ffd040'], shape: 'star', add: true, s0: 3, s1: 0.8, life: 0.6, vr: 12 })
      if (this.vOf(by?.owner) || this.vOf(m.owner)) {
        if (this.mode === 'solo') this.hitStop = Math.max(this.hitStop, 0.12)
        this.vfx.shakeBy(6)
      }
    }
    m.dash = null
    m.charging = null
    // Raid: the boss is down (the raid tick ends the match), or a player loses a life
    if (m.boss) return
    if (this.raid && m.owner) return raidDown(this, m.owner)
    const koXp = (8 + m.level * 1.8) * RARITY_XP[m.rarity]
    if (!m.owner) {
      m.state = 'weak'
      m.weakT = m.legendary ? 15 : 9
      m.aggro = null
      // Whoever knocked it out gets first dibs: no stealing someone else's catch
      m.claim = by?.owner ?? null
      m.claimT = m.legendary ? CLAIM_TIME_LEGEND : CLAIM_TIME
      if (by?.owner) this.gainXp(by, koXp)
      this.vOf(by?.owner)?.sfx('catchable')
      if (m.legendary)
        for (const v of this.viewers) {
          v.hooks.feed(both(`${m.name} is weakened! Catch it fast!`, `${m.name} is verzwakt! Vang hem snel!`))
          if (v.tr !== by?.owner) v.sfx('catchable')
        }
      return
    }
    const tr = m.owner
    tr.autoSwapT = 0.9
    if (by?.owner) this.gainXp(by, koXp * 1.5)
    this.vOf(tr)?.hooks.banner({ kind: 'fainted', title: both(`${m.name} fainted!`, `${m.name} is verslagen!`), sub: tr.healthyIndex() >= 0 ? both('Your next Pokémon is coming up', 'Je volgende Pokémon komt eraan') : undefined, mon: m.species.id, voice: tr.healthyIndex() >= 0 ? undefined : 'lose' })
    if (tr.healthyIndex() < 0) this.eliminate(tr, by?.owner ?? m.lastHitBy)
  }

  /** Raid: out of lives. You spectate; the raid ends when everyone is out. */
  eliminateRaid(tr: Trainer) {
    if (!tr.alive) return
    tr.alive = false
    tr.diedAt = this.time
    for (const v of this.viewers) v.hooks.feed(both(`${tr === v.tr ? 'You are' : `${tr.name} is`} out of lives`, `${tr === v.tr ? 'Jij bent' : `${tr.name} is`} door je levens heen`), { trainer: tr.def.sprite, kind: 'ko' })
    const v = this.vOf(tr)
    if (v) {
      v.hooks.banner({ kind: 'fainted', title: both('Out of lives', 'Geen levens meer'), sub: both('You can watch until the raid is over', 'Je kijkt mee tot de raid voorbij is'), mon: tr.mon.species.id, voice: 'lose' })
      const mate = this.trainers.find((t) => t.alive)
      tr.spectate = mate ?? null
      if (tr.isPlayer) this.spectate = mate ?? null
    }
  }

  /** Damage that doesn't come from a move (boss hazards, lava). */
  applyDamage(m: Mon, dmg: number, by: Mon | null, quiet = false) {
    if (m.fainted) return
    m.hp -= dmg
    m.combatT = 0
    m.revealT = Math.max(m.revealT, HIT_REVEAL)
    if (!quiet) {
      m.flash = 0.15
      m.joltT = 0.25
      for (const v of this.viewers) {
        if (!this.seenBy(v, m.x, m.y)) continue
        const hurt = m.owner === v.tr
        v.fx({ kind: 'text', x: m.x, y: m.y - 1.5, t: 0, life: 0.9, color: hurt ? '#ff5a50' : '#ffffff', text: `${Math.round(dmg)}`, big: hurt })
        if (hurt) v.sfx('hit', true)
      }
    }
    if (m.hp <= 0) {
      m.hp = 0
      this.onFaint(m, by)
    }
  }

  /** A floating label for everyone who can see it (used by the raid module). */
  addFxPublic(f: Fx) {
    this.addFx(f)
  }

  /** Big name over a Pokémon (boss attack callouts). */
  callout(m: Mon, text: Txt, color: string) {
    this.addFx({ kind: 'callout', x: m.x, y: m.y - 2.8, t: 0, life: 1.3, color, text, big: true })
  }

  private eliminate(tr: Trainer, by: Trainer | null) {
    if (!tr.alive) return
    tr.place = this.alive.length
    tr.alive = false
    tr.diedAt = this.time
    if (by && by !== tr) by.kos++
    for (const v of this.viewers) {
      const who = (t: Trainer, me: string) => (t === v.tr ? me : t.name)
      v.hooks.feed(
        by && by !== tr
          ? both(`⚔ ${who(by, 'You')} knocked ${who(tr, 'you')} out · ${this.alive.length} left`, `⚔ ${who(by, 'Jij')} schakelde ${who(tr, 'jou')} uit · nog ${this.alive.length} over`)
          : both(`🌀 ${who(tr, 'You')} got wrecked by the storm · ${this.alive.length} left`, `🌀 ${who(tr, 'Jij')} werd gesloopt door de storm · nog ${this.alive.length} over`),
        { trainer: tr.def.sprite, kind: 'ko' },
      )
    }
    if (by && by !== tr) this.vOf(by)?.hooks.banner({ kind: 'ko', title: both('Trainer knocked out!', 'Trainer uitgeschakeld!'), sub: both(`${tr.name} · ${this.alive.length} left`, `${tr.name} · nog ${this.alive.length} over`), trainer: tr.def.sprite, voice: 'ko' })
    this.soundAt(tr.x, tr.y, 'ko', [], { owners: [tr, by], range: 18 })
    // Drop loot
    const drops: ItemKind[] = [
      ...Array(tr.masterBalls).fill('master'), ...Array(tr.potions).fill('potion'), ...Array(tr.revives).fill('revive'),
    ]
    drops.forEach((kind, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2
      this.items.push({ x: tr.x + Math.cos(a) * 0.9, y: tr.y + Math.sin(a) * 0.9, kind, bob: Math.random() * 6 })
    })
    if (drops.length) {
      this.soundAt(tr.x, tr.y, 'loot', [], { range: 12 })
      const count = (k: ItemKind) => drops.filter((d) => d === k).length
      const list = (en: boolean) => ([['master', 'Master Ball'], ['potion', 'Potion'], ['revive', 'Revive']] as const)
        .filter(([k]) => count(k))
        .map(([k, n]) => `${count(k) > 1 ? `${count(k)}× ` : ''}${n}${en && count(k) > 1 ? 's' : ''}`)
        .join(', ')
      for (const v of this.viewers) v.hooks.feed(both(`🎁 ${tr.name} dropped ${list(true)}`, `🎁 ${tr.name} liet ${list(false)} vallen`), { kind: 'drop' })
    }
    tr.masterBalls = tr.potions = tr.revives = 0
    const v = this.vOf(tr)
    if (v) {
      if (tr.isPlayer) this.spectate = by && by.alive ? by : null
      tr.spectate = by && by.alive ? by : null
      v.endT = 2.2
    }
    if (this.alive.length === 1) {
      const last = this.alive[0], lv = this.vOf(last)
      last.place = 1
      if (lv) {
        lv.endT = 1.5
        lv.hooks.banner({ kind: 'win', title: both('WINNER!', 'WINNAAR!'), sub: both('You are the last trainer standing', 'Jij bent de laatste trainer'), trainer: last.def.sprite, voice: 'win' })
      }
    }
  }

  /** Results for one player. The match ends once every human has theirs. */
  private finish(v: Viewer) {
    v.done = true
    const p = v.tr
    const b = [...p.party].sort((a, b) => b.level - a.level)[0]
    const r = this.raid
    v.hooks.end({
      won: r ? r.result === 'won' : p.alive, place: p.alive ? 1 : p.place, total: this.total,
      time: r ? this.time : p.alive ? this.time : p.diedAt, kos: p.kos, caught: p.caught,
      best: { name: b.name, level: b.level, shiny: b.shiny, species: { id: b.species.id } },
      raid: r ? { boss: r.def.id, dmg: Math.round(p.bossDmg), share: Math.round((p.bossDmg / r.boss.maxHp) * 100), lives: p.lives } : undefined,
      board: scoreRows(this), final: decided(this), me: p.id,
      extra: { legend: p.legends, evolved: p.evolutions, crystal: p.crystal, humans: this.setup.humans.length },
    })
    if (v.local) this.over = true
    if (this.viewers.every((o) => o.done)) this.allDone = true
  }

  // ---------------- Leveling ----------------

  gainXp(m: Mon, amount: number) {
    if (m.level >= LEVEL_CAP || !m.owner || this.raid) return
    // Bots fight nonstop; a lower XP rate keeps them from out-levelling people
    m.xp += m.owner.brain ? amount * BOT_XP : amount
    while (m.xp >= xpNeeded(m.level) && m.level < LEVEL_CAP) {
      m.xp -= xpNeeded(m.level)
      this.levelUp(m)
    }
  }

  private levelUp(m: Mon) {
    const before = m.maxHp
    m.level++
    m.hp = Math.min(m.maxHp, m.hp + (m.maxHp - before))
    const mine = this.vOf(m.owner)
    mine?.sfx('level')
    let learned = false
    SLOT_UNLOCK.forEach((lv, i) => {
      if (lv === m.level && mine) {
        learned = true
        mine.hooks.banner({ kind: 'move', title: m.moves[i].name, sub: both(`${m.name} learned a new move!`, `${m.name} leerde een nieuwe aanval!`), color: TYPE_COLOR[m.moves[i].type], mon: m.species.id, voice: 'new_move' })
      }
    })
    if (mine && !learned && m.owner?.mon === m) mine.hooks.banner({ kind: 'levelup', title: `Lv ${m.level}`, sub: m.name, mon: m.species.id, shiny: m.shiny, voice: 'levelup' })
    const sp = m.species
    if (sp.evo && sp.evoLevel && m.level >= sp.evoLevel) {
      const ratio = m.hp / m.maxHp
      const old = sp.name
      m.species = SPECIES[this.rng.pick(sp.evo)]
      m.moves = movesetFor(m.species.types)
      m.hp = Math.max(1, Math.round(ratio * m.maxHp))
      m.evolveFx = 1.4
      if (m.owner) m.owner.evolutions++
      preloadMon(m.species.id, m.shiny)
      if (mine && this.mode === 'solo') {
        // Cutscene: pause the match while the evolution plays out
        this.paused = true
        mine.hooks.evolve(sp.id, m.species.id, m.shiny, () => {
          this.paused = false
        })
        mine.hooks.feed(both(`${old} evolved into ${m.species.name}!`, `${old} evolueerde in ${m.species.name}!`), { mon: m.species.id })
      } else if (mine) {
        // Multiplayer can't pause for a cutscene: a banner instead
        mine.sfx('evolve')
        mine.hooks.banner({ kind: 'levelup', title: `${m.species.name}!`, sub: both(`${old} evolved`, `${old} evolueerde`), mon: m.species.id, shiny: m.shiny, color: '#80e0ff', voice: 'evolve' })
        mine.hooks.feed(both(`${old} evolved into ${m.species.name}!`, `${old} evolueerde in ${m.species.name}!`), { mon: m.species.id })
      }
    }
  }

  // ---------------- Catching & items ----------------

  /** Try to throw a ball. Normal balls only work on weakened wild Pokémon. */
  throwBall(tr: Trainer, w: Mon, master: boolean): boolean {
    if (w.boss) return false
    if (this.send) {
      if (!tr.alive || w.catching || (!master && w.state !== 'weak') || (master && tr.masterBalls <= 0) || tr.throwFx) return false
      this.send({ t: 'ball', w: w.id, m: master })
      return true
    }
    if (!tr.alive || w.owner || w.catching || this.catches.some((c) => c.tr === tr)) return false
    if (!master && (w.state !== 'weak' || this.claimedByOther(w, tr))) return false
    if (tr.catchCd > 0) return false
    if (master) {
      if (tr.masterBalls <= 0) return false
      tr.masterBalls--
    }
    w.catching = true
    w.dash = null
    tr.throwFx = { x: tr.x, y: tr.y - 0.7, tx: w.x, ty: w.y - 0.4, t: 0, master }
    this.catches.push({ tr, mon: w, t: 1.0, master })
    this.soundAt(tr.x, tr.y, 'item', [master ? 'throwMaster' : 'throw'], { owners: [tr], range: 12 })
    return true
  }

  /** A weakened wild Pokémon still reserved for the trainer who knocked it out. */
  claimedByOther(w: Mon, tr: Trainer) {
    return w.claimT > 0 && !!w.claim && w.claim !== tr && w.claim.alive
  }

  private updateCatches(dt: number) {
    for (const tr of this.trainers) tr.catchCd = Math.max(0, tr.catchCd - dt)
    for (const c of [...this.catches]) {
      c.t -= dt
      // The ball wobbles twice before it clicks shut (or bursts open)
      for (const at of [0.55, 0.25]) if (c.t + dt > at && c.t <= at) this.soundAt(c.mon.x, c.mon.y, 'item', ['shake'], { owners: [c.tr], range: 12 })
      if (c.tr.throwFx) c.tr.throwFx.t += dt
      if (c.t > 0) continue
      this.catches.splice(this.catches.indexOf(c), 1)
      c.tr.throwFx = null
      if (!c.tr.alive) {
        c.mon.catching = false
        continue
      }
      // Legendaries often break out of a bot's normal ball
      if (c.tr.brain && c.mon.legendary && !c.master && !this.rng.chance(BOT_LEGEND_CATCH)) {
        c.mon.catching = false
        c.tr.catchCd = BOT_RETRY
        this.soundAt(c.mon.x, c.mon.y, 'item', ['breakOut'], { range: 12 })
        this.addFx({ kind: 'poof', x: c.mon.x, y: c.mon.y - 0.4, t: 0, life: 0.4, color: '#ffffff' })
        this.addFx({ kind: 'text', x: c.mon.x, y: c.mon.y - 1.6, t: 0, life: 0.9, color: '#ffd040', text: both('Broke free!', 'Uitgebroken!'), small: true })
        continue
      }
      this.completeCatch(c.tr, c.mon)
    }
  }

  private completeCatch(tr: Trainer, w: Mon) {
    this.wilds.splice(this.wilds.indexOf(w), 1)
    w.catching = false
    w.owner = tr
    w.state = 'roam'
    w.aggro = null
    w.hp = w.maxHp
    w.cds = [0, 0, 0, 0]
    w.x = tr.x
    w.y = tr.y + 0.4
    tr.caught++
    if (w.legendary) tr.legends++
    preloadMon(w.species.id, w.shiny)
    const v = this.vOf(tr)
    if (v) {
      v.sfx('catch')
      v.cry(w.species.id, 0.3)
    }
    if (w.legendary || w.rarity === 'rare')
      for (const o of this.viewers) o.hooks.feed(both(`${tr === o.tr ? 'You' : tr.name} caught ${w.shiny ? '✦' : ''}${w.name}!`, `${tr === o.tr ? 'Jij' : tr.name} ving ${w.shiny ? '✦' : ''}${w.name}!`))
    if (tr.party.length < PARTY_MAX) {
      tr.party.push(w)
      v?.hooks.banner({ kind: 'caught', title: both('Caught!', 'Gevangen!'), sub: `${w.name} · Lv ${w.level}`, mon: w.species.id, shiny: w.shiny, voice: 'caught' })
      return
    }
    if (v) {
      if (this.mode === 'solo') this.paused = true
      v.hooks.partyFull(w, (idx) => {
        if (idx >= 0 && tr.alive && !tr.party.includes(w)) {
          tr.party[idx] = w
          if (idx === tr.active) this.sendOut(tr, idx)
          v.hooks.toast(both(`${w.name} joined your team`, `${w.name} zit nu in je team`), '#80e080')
        }
        this.paused = false
      })
      return
    }
    const power = (m: Mon) => (m.fainted ? 0 : m.level * (m.species.atk + m.species.def + m.species.hp))
    let worst = 0
    tr.party.forEach((m, i) => { if (i !== tr.active && power(m) < power(tr.party[worst])) worst = i })
    if (worst === tr.active) worst = (tr.active + 1) % tr.party.length
    if (power(w) > power(tr.party[worst])) tr.party[worst] = w
  }

  usePotion(tr: Trainer): boolean {
    const m = tr.mon
    if (tr.potions <= 0 || m.fainted || m.hp >= m.maxHp) return false
    if (this.send) {
      this.send({ t: 'item', k: 'potion' })
      return true
    }
    tr.potions--
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.5)
    this.addFx({ kind: 'heal', x: m.x, y: m.y - 0.5, t: 0, life: 0.7, color: '#80f080' })
    this.soundAt(tr.x, tr.y, 'item', ['potion'], { owners: [tr], range: 8 })
    return true
  }

  useRevive(tr: Trainer): boolean {
    const idx = tr.party.findIndex((m) => m.fainted)
    if (tr.revives <= 0 || idx < 0) return false
    if (this.send) {
      this.send({ t: 'item', k: 'revive' })
      return true
    }
    tr.revives--
    const m = tr.party[idx]
    m.hp = Math.round(m.maxHp * 0.5)
    const v = this.vOf(tr)
    v?.sfx('item', 'revive')
    v?.hooks.toast(both(`${m.name} is back on its feet!`, `${m.name} is weer fit!`), '#80f080')
    return true
  }

  private scatterItems() {
    const add = (kind: ItemKind, n: number) => {
      for (let i = 0; i < n; i++) {
        const [x, y] = this.world.randomWalkable()
        this.items.push({ x, y, kind, bob: Math.random() * 6 })
      }
    }
    add('master', 10)
    add('potion', 45)
    add('candy', 24)
    add('revive', 12)
    // Towns are worth visiting
    for (const t of this.world.towns) {
      this.items.push({ x: t.x + 0.5, y: t.y + 0.5, kind: this.rng.chance(0.4) ? 'master' : 'revive', bob: 0 })
      this.items.push({ x: t.x - 3.5, y: t.y + 1.5, kind: 'potion', bob: 0 })
    }
  }

  /** When the Evolution Crystal appears (0 = done). */
  crystalAt = 0

  /** The Evolution Crystal lands somewhere inside the zone, not right next to anyone; everyone hears about it. */
  private spawnCrystal() {
    this.crystalAt = 0
    const z = this.zone
    let at: [number, number] | null = null
    for (let k = 0; k < 60 && !at; k++) {
      const [x, y] = this.world.randomWalkable()
      if (Math.hypot(x - z.x, y - z.y) > z.r * 0.7) continue
      if (this.trainers.some((t) => t.alive && Math.hypot(t.x - x, t.y - y) < 12)) continue
      at = [x, y]
    }
    if (!at) at = this.world.randomWalkable()
    this.items.push({ x: at[0], y: at[1], kind: 'evolve', bob: 0 })
    this.vfx.mark(at[0], at[1])
    this.vfx.ring(at[0], at[1], 3, '#ffffff', 0.8, 6)
    this.vfx.glow(at[0], at[1] - 1, 90, '#c8a0ff', 0.8)
    this.soundAt(at[0], at[1], 'spawnChime', [], { global: true })
    for (const v of this.viewers) {
      v.hooks.banner({ kind: 'legendary', title: both('Evolution Crystal!', 'Evolutiekristal!'), sub: both('Somewhere in the zone. Find it first: your Pokémon evolves fully, with every move', 'Ergens in de zone. Vind hem als eerste: je Pokémon evolueert volledig, met alle aanvallen'), color: '#c8a0ff', voice: 'legendary' })
      v.hooks.feed(both('✦ An Evolution Crystal has appeared somewhere! Look for the pillar of light', '✦ Er is ergens een Evolutiekristal verschenen! Zoek de lichtzuil'), { kind: 'spawn' })
    }
  }

  /** Evolution Crystal: straight to the final form, the level that takes, and all four moves. */
  private evolutionSurge(tr: Trainer) {
    const m = tr.mon.fainted ? tr.party.find((x) => !x.fainted) : tr.mon
    if (!m) return
    tr.crystal = true
    const from = m.species
    let sp = m.species
    let lv = SLOT_UNLOCK[SLOT_UNLOCK.length - 1]
    for (let i = 0; i < 4 && sp.evo?.length; i++) {
      lv = Math.max(lv, sp.evoLevel ?? 0)
      sp = SPECIES[this.rng.pick(sp.evo)]
    }
    m.level = Math.min(LEVEL_CAP, Math.max(m.level, lv))
    m.xp = 0
    m.species = sp
    m.moves = movesetFor(sp.types)
    m.hp = m.maxHp
    m.evolveFx = 2.6
    preloadMon(sp.id, m.shiny)
    // A pillar of light, rainbow shockwaves and stars: everyone close by sees it
    const cols = ['#ff6080', '#ffd040', '#60f0a0', '#60c0ff', '#c080ff']
    this.vfx.glow(m.x, m.y - 1, 160, '#ffffff', 1)
    cols.forEach((c, i) => this.vfx.ring(m.x, m.y, 2 + i * 1.6, c, 0.5 + i * 0.12, 7 - i))
    this.vfx.burst(m.x, m.y - 1.2, { n: 60, speed: 11, cols, shape: 'star', add: true, s0: 7, s1: 1, life: 1.1 })
    this.vfx.burst(m.x, m.y - 0.5, { n: 30, speed: 3, dir: -Math.PI / 2, spread: 0.35, cols: ['#ffffff', '#e0d0ff'], shape: 'streak', add: true, s0: 5, s1: 1, life: 1.4 })
    this.vfx.shakeBy(12)
    this.vfx.flash(0.8, '255,255,255')
    this.soundAt(m.x, m.y, 'evolve', [], { range: 30 })
    const v = this.vOf(tr)
    const evolved = from.id !== sp.id
    const sub = both(`${from.name} → ${sp.name} · Lv ${m.level} · all moves unlocked`, `${from.name} → ${sp.name} · Lv ${m.level} · alle aanvallen`)
    if (v && this.mode === 'solo' && evolved) {
      this.paused = true
      v.hooks.evolve(from.id, sp.id, m.shiny, () => {
        this.paused = false
        v.hooks.banner({ kind: 'legendary', title: both('EVOLUTION SURGE!', 'EVOLUTIE-STOOT!'), sub, mon: sp.id, shiny: m.shiny, color: '#c8a0ff', voice: 'evolve' })
      })
    } else v?.hooks.banner({ kind: 'legendary', title: both('EVOLUTION SURGE!', 'EVOLUTIE-STOOT!'), sub, mon: sp.id, shiny: m.shiny, color: '#c8a0ff', voice: 'evolve' })
    for (const o of this.viewers)
      o.hooks.feed(o === v
        ? both(`✦ You grabbed the Evolution Crystal: ${sp.name} Lv ${m.level}!`, `✦ Jij pakte het Evolutiekristal: ${sp.name} Lv ${m.level}!`)
        : both(`✦ ${tr.name} grabbed the Evolution Crystal: ${sp.name} Lv ${m.level}!`, `✦ ${tr.name} pakte het Evolutiekristal: ${sp.name} Lv ${m.level}!`), { mon: sp.id, kind: 'spawn' })
  }

  private updateItems() {
    for (const it of [...this.items]) {
      for (const tr of this.trainers) {
        if (!tr.alive || Math.hypot(tr.x - it.x, tr.y - it.y) > 0.8) continue
        // The Evolution Crystal is for real players only
        if (it.kind === 'evolve' && !tr.human) continue
        this.items.splice(this.items.indexOf(it), 1)
        this.applyItem(tr, it.kind)
        break
      }
    }
  }

  private applyItem(tr: Trainer, kind: ItemKind) {
    const v = this.vOf(tr)
    v?.sfx('item', PICKUP_SOUND[kind])
    switch (kind) {
      case 'master':
        tr.masterBalls++
        v?.hooks.toast(both('Found a Master Ball! Catches any wild Pokémon instantly', 'Master Ball gevonden! Vang elke wilde Pokémon direct'), '#c080ff')
        break
      case 'potion':
        tr.potions++
        v?.hooks.toast(both('Found a Potion', 'Potion gevonden'))
        break
      case 'revive':
        tr.revives++
        v?.hooks.toast(both('Found a Revive', 'Revive gevonden'))
        break
      case 'evolve':
        this.evolutionSurge(tr)
        break
      case 'candy': {
        const m = tr.mon.fainted ? tr.party.find((x) => !x.fainted) : tr.mon
        if (!m) return
        this.gainXp(m, xpNeeded(m.level) - m.xp + 0.01)
        v?.hooks.toast(both(`Rare Candy! ${m.name} is now Lv ${m.level}`, `Rare Candy! ${m.name} is nu Lv ${m.level}`), '#80c0ff')
        break
      }
    }
  }

  // ---------------- Wild Pokémon ----------------

  private spawnLoop(dt: number) {
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = 1.5
      const frac = Math.min(1, (Math.PI * this.zone.r * this.zone.r) / (MAP * MAP))
      const want = Math.round(6 + 18 * frac)
      if (this.wilds.length < want) this.spawnWild(false)
    }
    if (this.legendIdx < this.legendTimes.length && this.time >= this.legendTimes[this.legendIdx]) {
      this.legendIdx++
      this.spawnLegendary()
    }
  }

  private wildLevel(r: Rarity) {
    const base = 3 + this.time / 11 + this.rng.range(-2, 2)
    return Math.max(2, Math.min(LEVEL_CAP, Math.round(base + (r === 'uncommon' ? 2 : r === 'rare' ? 6 : 0))))
  }

  private spawnWild(initial: boolean) {
    const roll = this.rng.next()
    // Rarer Pokémon show up more as the match goes on
    const p = Math.min(1, this.time / 240)
    const rare = 0.06 + 0.16 * p, uncommon = 0.24 + 0.12 * p
    const rarity: Rarity = roll < rare ? 'rare' : roll < rare + uncommon ? 'uncommon' : 'common'
    const z = this.zone
    let pos: [number, number] | null = null
    for (let k = 0; k < 30 && !pos; k++) {
      const i = this.rng.pick(this.world.tall.length ? this.world.tall : this.world.walkable)
      const x = (i % MAP) + 0.5, y = Math.floor(i / MAP) + 0.5
      if (Math.hypot(x - z.x, y - z.y) > z.r - 2) continue
      if (this.trainers.some((t) => t.alive && Math.hypot(t.x - x, t.y - y) < (initial ? 6 : 10))) continue
      pos = [x, y]
    }
    if (!pos) return
    const id = this.rng.pick(WILD[rarity])
    const m = new Mon(id, this.wildLevel(rarity), this.rng.chance(1 / 64))
    m.x = m.homeX = m.goalX = pos[0]
    m.y = m.homeY = m.goalY = pos[1]
    m.aggressive = rarity === 'rare' || this.rng.chance(0.15)
    preloadMon(id, m.shiny)
    this.wilds.push(m)
  }

  /** A wild Pokémon at a spot (swarms). */
  spawnWildAt(id: number, x: number, y: number) {
    const m = new Mon(id, this.wildLevel(rarityOf(id)), this.rng.chance(1 / 64))
    m.x = m.homeX = m.goalX = x
    m.y = m.homeY = m.goalY = y
    preloadMon(id, m.shiny)
    this.wilds.push(m)
  }

  private spawnLegendary() {
    const z = this.zone
    const [x, y] = this.world.randomWalkable(
      (x, y) => Math.hypot(x - z.nx, y - z.ny) < Math.max(4, z.nr) && this.trainers.every((t) => Math.hypot(t.x - x, t.y - y) > 12),
    )
    const id = this.rng.pick(WILD.legendary)
    const m = new Mon(id, Math.round(10 + this.time / 9), this.rng.chance(1 / 16))
    m.hp = m.maxHp
    m.x = m.homeX = m.goalX = x
    m.y = m.homeY = m.goalY = y
    m.aggressive = true
    preloadMon(id, m.shiny)
    this.wilds.push(m)
    for (const v of this.viewers) {
      v.sfx('legendary')
      v.cry(id, 0.3)
      v.hooks.banner({ kind: 'legendary', title: both(`${m.name} appears!`, `${m.name} verschijnt!`), sub: both(`Lv ${m.level} · follow the golden arrow · Master Ball = instant catch`, `Lv ${m.level} · volg de gouden pijl · Master Ball = direct vangen`), mon: id, shiny: m.shiny, color: '#ffd040', voice: 'legendary' })
      v.hooks.feed(both(`★ ${m.name} (Lv ${m.level}) has appeared! Catch it with a Master Ball`, `★ ${m.name} (Lv ${m.level}) is verschenen! Vang hem met een Master Ball`), { mon: id, kind: 'spawn' })
    }
  }

  private updateWilds(dt: number) {
    for (const w of [...this.wilds]) {
      w.flash = Math.max(0, w.flash - dt)
      w.evolveFx = Math.max(0, w.evolveFx - dt)
      for (let i = 0; i < 4; i++) w.cds[i] = Math.max(0, w.cds[i] - dt)
      w.aimT -= dt
      w.castT = Math.max(0, w.castT - dt)
      w.tintT = Math.max(0, w.tintT - dt)
      w.joltT = Math.max(0, w.joltT - dt)
      w.liftT = Math.max(0, w.liftT - dt)
      if (w.catching) continue
      if (w.state === 'weak') {
        w.claimT = Math.max(0, w.claimT - dt)
        w.weakT -= dt
        if (w.weakT <= 0) this.removeWild(w)
        continue
      }
      if (this.zone.outside(w.x, w.y)) {
        this.removeWild(w)
        continue
      }
      if (w.dash) {
        this.updateDash(w, dt)
        continue
      }
      this.updateCharge(w, dt)
      // The raid boss has its own brain (boss.ts)
      if (w.boss) continue
      let mx = 0, my = 0, speed = 1.1
      if (w.state === 'aggro' && w.aggro) {
        let t = w.aggro
        // Follow the trainer's new Pokémon if they swapped.
        if (t.fainted || (t.owner && t.owner.mon !== t)) t = t.owner && t.owner.alive && !t.owner.mon.fainted ? t.owner.mon : t
        w.aggroT -= dt
        const d = Math.hypot(t.x - w.x, t.y - w.y)
        if (t.fainted || !t.owner?.alive || d > 11 || !this.canSee(w, t) || Math.hypot(w.x - w.homeX, w.y - w.homeY) > 16 || w.aggroT <= 0) {
          w.aggro = null
          w.state = 'roam'
        } else {
          w.aggro = t
          const slot = this.bestSlot(w, d)
          const range = slot >= 0 ? w.moves[slot].range : w.moves[0].range
          if (d > range * 0.8) {
            mx = (t.x - w.x) / d
            my = (t.y - w.y) / d
          }
          speed = 2.2 + w.species.spe / 60
          w.thinkT -= dt
          if (w.thinkT <= 0) {
            w.thinkT = this.rng.range(0.35, 0.8)
            if (slot >= 0) this.useMove(w, slot, t)
          }
        }
      } else {
        w.thinkT -= dt
        if (w.thinkT <= 0) {
          w.thinkT = this.rng.range(1.5, 4)
          w.goalX = w.homeX + this.rng.range(-4, 4)
          w.goalY = w.homeY + this.rng.range(-4, 4)
          if (w.aggressive) {
            const near = this.trainers.find((tr) => tr.alive && !tr.mon.fainted && this.canSee(w, tr.mon) && Math.hypot(tr.mon.x - w.x, tr.mon.y - w.y) < (w.legendary ? 5 : 3.5))
            if (near) {
              w.aggro = near.mon
              w.aggroT = 8
              w.state = 'aggro'
            }
          }
        }
        const d = Math.hypot(w.goalX - w.x, w.goalY - w.y)
        if (d > 0.3) {
          mx = (w.goalX - w.x) / d
          my = (w.goalY - w.y) / d
        }
      }
      w.mvx = mx
      w.mvy = my
      if ((mx || my) && this.localSeen(w.x, w.y)) this.quiet(() => this.stepFx(w.x, w.y, dt * 0.6))
      if (mx || my) {
        if (!this.tryMove(w, mx * speed * dt, my * speed * dt, 0.3)) w.thinkT = 0
        if (w.aimT <= 0) w.dir = dirOf(mx, my)
      }
      if (w.aimT > 0) w.dir = dirOf(w.aimX, w.aimY)
    }
    // Trainer mons tick flashes here too
    for (const tr of this.trainers)
      for (const m of tr.party) {
        m.flash = Math.max(0, m.flash - dt)
        m.evolveFx = Math.max(0, m.evolveFx - dt)
        m.castT = Math.max(0, m.castT - dt)
        m.tintT = Math.max(0, m.tintT - dt)
        m.joltT = Math.max(0, m.joltT - dt)
        m.liftT = Math.max(0, m.liftT - dt)
      }
  }

  private tickHpLag(dt: number) {
    const tick = (m: Mon) => {
      if (m.hpLag < m.hp) m.hpLag = m.hp
      else m.hpLag += (m.hp - m.hpLag) * Math.min(1, dt * 2.5)
    }
    for (const w of this.wilds) tick(w)
    for (const tr of this.trainers) if (tr.alive) tick(tr.mon)
  }

  /** Highest unlocked, ready move that reaches distance d (or -1). */
  bestSlot(m: Mon, d: number): number {
    for (let s = 3; s >= 0; s--) if (m.unlocked(s) && m.cds[s] <= 0 && m.moves[s].range + 0.3 >= d) return s
    return -1
  }

  private removeWild(w: Mon) {
    const i = this.wilds.indexOf(w)
    if (i >= 0) this.wilds.splice(i, 1)
    this.addFx({ kind: 'poof', x: w.x, y: w.y - 0.4, t: 0, life: 0.4, color: '#ffffff' })
    this.soundAt(w.x, w.y, 'poof', [], { range: 10 })
  }

  // ---------------- Projectiles & effects ----------------

  private updateProjectiles(dt: number) {
    for (const p of [...this.projs]) {
      if (p.tgt && !p.tgt.fainted && p.tgt.state !== 'weak') {
        // Homing (Aura Sphere / Swift never miss)
        const sp = Math.hypot(p.vx, p.vy)
        const dx = p.tgt.x - p.x, dy = p.tgt.y - 0.45 - p.y
        const d = Math.hypot(dx, dy) || 1
        const k = Math.min(1, dt * 6)
        p.vx += ((dx / d) * sp - p.vx) * k
        p.vy += ((dy / d) * sp - p.vy) * k
      }
      if (this.localSeen(p.x, p.y)) this.quiet(() => projectileTick(this.vfx, p.move.fx, p.x, p.y, p.vx, p.vy))
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      const t = this.world.at(Math.floor(p.x), Math.floor(p.y + 0.4))
      let dead = p.life <= 0 || t === T.TREE || t === T.ROCK || t === T.HOUSE
      let hit = false
      if (!dead)
        for (const e of this.enemiesOf(p.src)) {
          if (Math.hypot(e.x - p.x, e.y - (e.boss ? 1 : 0.45) - p.y) < (e.boss ? 1.6 : e.legendary ? 0.9 : 0.6)) {
            this.hit(p.src, e, p.move, p.mult)
            dead = hit = true
            break
          }
        }
      if (dead) {
        this.projs.splice(this.projs.indexOf(p), 1)
        if (this.onScreen(p.x, p.y)) projectileEnd(this.vfx, p.move.fx, p.x, p.y, hit)
        if (!hit && p.mult >= 0.5) {
          this.miss(p.src, p.x, p.y)
          this.soundAt(p.x, p.y, 'fizzle', [], { owners: [p.src.owner], range: 10 })
        }
      }
    }
  }

  private updateNovas(dt: number) {
    for (const n of [...this.novas]) {
      n.t -= dt
      if (n.t > 0) continue
      this.novas.splice(this.novas.indexOf(n), 1)
      this.soundAt(n.x, n.y, 'moveHit', [n.move.fx, n.move.tier * Math.min(1, n.mult + 0.3)], { owners: [n.src.owner] })
      let any = false
      for (const e of this.enemiesOf(n.src))
        if (Math.hypot(e.x - n.x, e.y - n.y) < n.r + bulk(e)) {
          this.hit(n.src, e, n.move, n.mult)
          any = true
        }
      if (!any && n.mult >= 1) this.miss(n.src, n.x, n.y - 0.4)
      if (this.onScreen(n.x, n.y)) onImpact(this.vfx, n.move, n.x, n.y, n.r)
    }
  }

  private updateFx(dt: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]
      f.t += dt
      if (f.vx !== undefined) {
        f.x += f.vx * dt
        f.y += (f.vy ?? 0) * dt
        f.vy = (f.vy ?? 0) + 6 * dt
      }
      if (f.t >= f.life) this.fx.splice(i, 1)
    }
    this.vfx.update(dt)
    for (const it of this.items) it.bob += dt
  }

  // ---------------- Zone ----------------

  private pickNextZone() {
    const z = this.zone
    const ph = PHASES[Math.min(z.phase, PHASES.length - 1)]
    const slack = Math.max(0, (z.r - ph.r) * 0.75)
    let nx = z.x, ny = z.y
    for (let k = 0; k < 40; k++) {
      const a = this.rng.range(0, Math.PI * 2)
      const d = this.rng.range(0, slack)
      const cx = Math.max(10, Math.min(MAP - 10, z.x + Math.cos(a) * d))
      const cy = Math.max(10, Math.min(MAP - 10, z.y + Math.sin(a) * d))
      if (!this.world.blocked(cx, cy)) { nx = cx; ny = cy; break }
    }
    if (this.world.blocked(nx, ny)) {
      const i = this.world.nearestWalkable(Math.floor(nx), Math.floor(ny))
      nx = (i % MAP) + 0.5
      ny = Math.floor(i / MAP) + 0.5
    }
    z.nx = nx
    z.ny = ny
    z.nr = ph.r
    this.flow = this.world.flowTo(Math.floor(nx), Math.floor(ny))
  }

  private updateZone(dt: number) {
    const z = this.zone
    if (z.phase >= PHASES.length) return
    const ph = PHASES[z.phase]
    z.t += dt
    if (!z.shrinking) {
      if (z.t >= ph.wait) {
        z.shrinking = true
        z.t = 0
        z.fromX = z.x
        z.fromY = z.y
        z.fromR = z.r
        for (const v of this.viewers) {
          v.hooks.banner({ kind: 'storm', title: both('The storm is coming!', 'De storm komt!'), sub: both(`Phase ${z.phase + 1} of 6 · get into the white circle`, `Fase ${z.phase + 1} van 6 · ga naar de witte cirkel`), color: '#c080ff', voice: z.phase + 1 >= 6 ? 'final_circle' : 'storm' })
          v.hooks.feed(both(`🌀 Storm phase ${z.phase + 1}/6: the circle is closing · ${this.alive.length} left`, `🌀 Stormfase ${z.phase + 1}/6: de cirkel krimpt · nog ${this.alive.length} over`), { kind: 'storm' })
        }
      }
    } else {
      const k = Math.min(1, z.t / ph.shrink)
      z.x = z.fromX + (z.nx - z.fromX) * k
      z.y = z.fromY + (z.ny - z.fromY) * k
      z.r = z.fromR + (z.nr - z.fromR) * k
      if (k >= 1) {
        z.shrinking = false
        z.t = 0
        z.phase++
        if (z.phase < PHASES.length) this.pickNextZone()
      }
    }
  }

  // ---------------- Helpers ----------------

  tryMove(o: { x: number; y: number }, dx: number, dy: number, r: number): boolean {
    let moved = false
    if (dx) {
      const nx = o.x + dx
      if (!this.wall(nx, o.y, r)) { o.x = nx; moved = true }
    }
    if (dy) {
      const ny = o.y + dy
      if (!this.wall(o.x, ny, r)) { o.y = ny; moved = true }
    }
    return moved
  }

  private wall(x: number, y: number, r: number) {
    const w = this.world
    return w.blocked(x - r, y - r * 0.6) || w.blocked(x + r, y - r * 0.6) || w.blocked(x - r, y + r * 0.6) || w.blocked(x + r, y + r * 0.6)
  }

  /** Visible on anyone's screen (worth spawning effects for). */
  onScreen(x: number, y: number) {
    return this.viewers.some((v) => this.seenBy(v, x, y))
  }

  /** Weakened wild Pokémon the trainer can catch with a normal ball. */
  catchable(tr: Trainer): Mon | null {
    let best: Mon | null = null, bd = 2.8
    for (const w of this.wilds) {
      if (w.state !== 'weak' || w.catching || w.boss || this.claimedByOther(w, tr)) continue
      const d = Math.min(Math.hypot(w.x - tr.x, w.y - tr.y), Math.hypot(w.x - tr.mon.x, w.y - tr.mon.y))
      if (d < bd) { bd = d; best = w }
    }
    return best
  }

  /** Best Master Ball target near the trainer. */
  masterTarget(tr: Trainer, range = 5.5): Mon | null {
    const order: Rarity[] = ['common', 'uncommon', 'rare', 'legendary']
    let best: Mon | null = null
    for (const w of this.wilds) {
      if (w.catching || w.boss || Math.hypot(w.x - tr.x, w.y - tr.y) > range) continue
      if (!best || order.indexOf(w.rarity) > order.indexOf(best.rarity) || (w.rarity === best.rarity && w.level > best.level)) best = w
    }
    return best
  }
}

export function dirOf(x: number, y: number): Dir {
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}

export function dirVec(d: Dir): [number, number] {
  return d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : d === 'left' ? [-1, 0] : [1, 0]
}

/** Extra hit radius for the huge raid boss. */
function bulk(m: Mon) {
  return m.boss ? 0.9 : 0
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}
