import { BOSSES, RAID_LEVEL, RAID_LIVES, RAID_TIME, RESPAWN_TIME, type BossAttack, type BossDef, type HazardShape } from '../data/bosses'
import type { Move, MoveFx } from '../data/moves'
import { SPECIES } from '../data/pokemon'
import { TYPE_COLOR, type PType } from '../data/types'
import { Mon, type Trainer } from './entities'
import type { Game } from './game'
import { drawCharge, onBeam, onImpact } from './moveFx'
import { disc, drawGlow, drawShape, type DecalKind, type Shape } from './vfx'
import { preloadMon } from './sprites'
import { ARENA_C, ARENA_R, T, TILE, World } from './world'
import { both, inBoth, L } from '../i18n'
import { dungeonOf, WARDEN_ATTACKS } from '../data/dungeons'
import { dungeonTick, respawnAt, setupDungeon, viewOf, type DungeonRun, type DungeonView } from './dungeon'

/**
 * Raid mode: a boss in the middle of an arena, everyone else against it.
 * Signature attacks are hazards: a shape on the ground that fills up during
 * its warning time and then hits every Pokémon still inside.
 */

export interface Hazard {
  id: number
  shape: HazardShape
  x: number
  y: number
  /** Direction for cones and lines (radians). */
  ang: number
  /** Circle radius / ring outer radius / cone and line length. */
  r: number
  /** Ring inner radius. */
  inner: number
  /** Line width or cone half-angle. */
  width: number
  t: number
  total: number
  dmg: number
  fx: MoveFx
  type: PType
  freeze: number
  cover: boolean
  /** Lines through the boss: hit both directions. */
  both: boolean
  /** Which attack made it (boss attack id, or 'vent'): picks the build-up visuals. */
  atk: string
  /** Tornados: velocity (tiles/s) while active. */
  vx: number
  vy: number
  /** Seconds a lingering hazard (tornado) stays active after its warning. */
  dur: number
  /** Damage per second while active, as a share of max HP. */
  dps: number
  /** Host only: time until the next damage tick of a lingering hazard. */
  tick?: number
}

export interface RaidState {
  def: BossDef
  boss: Mon
  phase: number
  /** Seconds until the next signature attack. */
  nextT: number
  cds: Record<string, number>
  /** Seconds until the next ordinary move. */
  moveT: number
  /** Phase change: briefly can't be hurt. */
  invulnT: number
  /** Seconds until the phase banner shows (it lands with the form change). */
  bannerT: number
  /** Raid time left. */
  timeLeft: number
  /** Raid result once decided. */
  result: 'won' | 'lost' | null
  goalX: number
  goalY: number
  /** The arena's own hazard (vents, lightning rods, tornados, the floor grid). */
  envT: number
  /** A potion appears in the arena every so often. */
  potionT: number
  /** The boss stands still for its attack (no wandering). */
  busyT: number
  /** Rayquaza in the air: leaps up, comes down on (x, y). */
  air: { t: number; total: number; x: number; y: number } | null
  /** Delta Stream: shoves every player along (dx, dy) tiles/s once delay runs out. */
  wind: { dx: number; dy: number; delay: number; t: number } | null
  /** Mirror images that cast along (Mewtwo's last phase). */
  clones: { x: number; y: number; a: number }[]
  /** Raid dungeon: the run through the rooms before the boss (null for a classic raid). */
  dg?: DungeonRun
}

/** What every player sees of the raid (host and clients): synced as `rv`. */
export interface RaidView {
  timeLeft: number
  phase: number
  /** Delta Stream blowing: push per second (tiles). */
  wind?: [number, number]
  /** Mirror images' positions. */
  clones?: [number, number][]
  /** How far up the boss flew (0 on the ground, 1 out of sight). */
  air?: number
  /** Raid dungeon: rooms, waves, gates. */
  dg?: DungeonView
}

let hazardId = 1

/** Final evolution of a species (first branch when it splits). */
export function finalForm(id: number): number {
  let sp = SPECIES[id]
  for (let i = 0; i < 4 && sp.evo?.length; i++) sp = SPECIES[sp.evo[0]]
  return sp.id
}

/** Spots around the arena edge to (re)spawn at, one per player (never inside a rock or rod). */
export function spawnPoint(g: Game, i: number, n: number): [number, number] {
  const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.42
  const x = ARENA_C + Math.cos(a) * (ARENA_R - 4.5), y = ARENA_C + Math.sin(a) * (ARENA_R - 4.5)
  const free = (x: number, y: number) => [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].every(([dx, dy]) => !g.world.blocked(x + dx, y + dy))
  for (let d = 0; d <= 3; d += 0.5)
    for (let k = 0; k < (d ? 12 : 1); k++) {
      const sx = x + Math.cos((k / 12) * Math.PI * 2) * d, sy = y + Math.sin((k / 12) * Math.PI * 2) * d
      if (free(sx, sy)) return [sx, sy]
    }
  return [x, y]
}

/** Host and solo: turn the match into a raid. */
export function setupRaid(g: Game, id: keyof typeof BOSSES) {
  const def = BOSSES[id]
  const humans = g.trainers
  humans.forEach((tr, i) => {
    tr.party = tr.party.slice(0, 1).map((m) => {
      const mon = new Mon(finalForm(m.species.id), RAID_LEVEL, m.shiny)
      mon.owner = tr
      mon.awaken = m.awaken
      if (mon.awaken) mon.legendary = false
      mon.hp = mon.maxHp
      preloadMon(mon.species.id, mon.shiny)
      return mon
    })
    tr.active = 0
    tr.potions = 2
    tr.revives = 0
    tr.masterBalls = 0
    tr.lives = RAID_LIVES
    const [x, y] = spawnPoint(g, i, humans.length)
    tr.x = x
    tr.y = y
    tr.mon.x = x
    tr.mon.y = y + 0.8
  })
  const boss = new Mon(def.species, def.level)
  boss.boss = true
  boss.bossMul = def.hp * (1 + 0.65 * (humans.length - 1))
  boss.hp = boss.maxHp
  boss.x = boss.homeX = ARENA_C
  boss.y = boss.homeY = ARENA_C - 2
  boss.aggressive = true
  preloadMon(def.species)
  const dungeon = g.world.gates.length ? dungeonOf(id) : null
  // A dungeon first: the boss waits out of sight until you reach its arena
  if (!dungeon) g.wilds.push(boss)
  g.raid = {
    def, boss, phase: 0, nextT: 3, cds: {}, moveT: 2, invulnT: 0, bannerT: 0, timeLeft: RAID_TIME, result: null,
    goalX: boss.x, goalY: boss.y, envT: def.arena === 'crater' ? 6 : 7, potionT: 20,
    busyT: 0, air: null, wind: null, clones: [],
  }
  g.clones = []
  if (dungeon) setupDungeon(g, g.raid, dungeon, g.setup.room ?? 0)
  // The arena has no storm: park the zone far outside it
  g.zone.x = g.zone.nx = ARENA_C
  g.zone.y = g.zone.ny = ARENA_C
  g.zone.r = g.zone.nr = 999
}

/** A Move object so boss attacks can use the regular effects. */
function moveFor(a: { name: string; fx: MoveFx; type: PType }): Move {
  return { name: a.name, type: a.type, kind: 'nova', fx: a.fx, power: 120, cooldown: 0, range: 8, tier: 3, charge: 0 }
}

/** Pokémon the boss can hurt. */
function targets(g: Game): Mon[] {
  return g.trainers.filter((t) => t.alive && !t.mon.fainted).map((t) => t.mon)
}

// ---------------------------------------------------------------- host tick

export function updateRaid(g: Game, dt: number) {
  const r = g.raid!
  if (r.result) return
  // A dungeon run first: rooms and waves; the boss fight starts in its arena
  const inDungeon = !!r.dg && dungeonTick(g, r, dt)
  if (!inDungeon) r.timeLeft -= dt
  const boss = r.boss
  r.invulnT = Math.max(0, r.invulnT - dt)
  if (r.bannerT > 0 && (r.bannerT -= dt) <= 0) phaseBanner(g, r)
  r.busyT = Math.max(0, r.busyT - dt)

  // Lava burns, players come back after going down
  for (const tr of g.trainers) {
    if (!tr.alive) continue
    const m = tr.mon
    if (!m.fainted && g.world.at(Math.floor(m.x), Math.floor(m.y)) === T.LAVA) {
      // The dungeon's lava rivers and pools burn less than the crater (you have to cross them)
      g.applyDamage(m, m.maxHp * (inDungeon ? 0.05 : 0.1) * dt, null, true)
      // (In the Storm Tower it's charged water: it shocks instead)
      // (in the Citadel it's freezing water: frost instead)
      const kind = inDungeon ? r.dg!.def.theme.type : 'fire'
      g.vOf(tr)?.sfx('burn')
      if (Math.random() < dt * 8) g.vfx.burst(m.x, m.y - 0.2, kind === 'electric'
        ? { n: 2, speed: 3, dir: -Math.PI / 2, spread: 1.4, cols: ['#ffffff', '#8ae0ff'], shape: 'streak', s0: 2.5, s1: 0.5, life: 0.3 }
        : kind === 'ice'
          ? { n: 2, speed: 1.5, dir: -Math.PI / 2, spread: 1.2, cols: ['#ffffff', '#bfeaff'], shape: 'shard', s0: 2.5, s1: 0.5, life: 0.5 }
          : { n: 2, speed: 2, dir: -Math.PI / 2, spread: 0.6, cols: ['#ffb030', '#ff6020'], shape: 'flame', s0: 2.5, s1: 0.5, life: 0.4 })
    }
    if (m.fainted && tr.respawnT > 0) {
      tr.respawnT -= dt
      if (tr.respawnT <= 0) respawn(g, tr)
    }
  }

  if (inDungeon) {
    tickHazards(g, dt)
    if (g.trainers.every((t) => !t.alive)) {
      r.result = 'lost'
      endRaid(g, r)
    }
    return
  }

  // Every ~22 s a potion shows up somewhere in the arena (keeps everyone moving)
  r.potionT -= dt
  if (r.potionT <= 0) {
    r.potionT = 22
    if (g.items.filter((it) => it.kind === 'potion').length < 3) {
      const [x, y] = g.world.randomWalkable((x, y) => g.world.at(Math.floor(x), Math.floor(y)) !== T.LAVA && Math.hypot(x - ARENA_C, y - ARENA_C) < ARENA_R - 3)
      g.items.push({ x, y, kind: 'potion', bob: 0 })
      g.soundAt(x, y, 'spawnChime', [], { range: 26 })
      g.vfx.mark(x, y)
      g.vfx.ring(x, y, 1.2, '#80f080', 0.5, 4)
    }
  }

  // Phases
  const ratio = boss.hp / boss.maxHp
  if (r.phase < 2 && ratio < r.def.phases[r.phase]) enrage(g, r)

  // Ordinary attacks keep the pressure up between signature moves
  for (const k in r.cds) r.cds[k] = Math.max(0, r.cds[k] - dt)
  const foes = targets(g)
  const nearest = closest(boss, foes)
  if (!boss.fainted && nearest && r.invulnT <= 0) {
    r.moveT -= dt
    if (r.moveT <= 0) {
      r.moveT = [2.0, 1.7, 1.4][r.phase] + Math.random() * 0.5
      const d = Math.hypot(nearest.x - boss.x, nearest.y - boss.y)
      const slot = g.bestSlot(boss, d)
      if (slot >= 0) g.useMove(boss, slot, nearest)
    }
  }
  if (!boss.fainted && nearest && r.invulnT <= 0 && !r.air) {
    r.nextT -= dt
    if (r.nextT <= 0) {
      const a = pickAttack(r)
      if (a) {
        castAttack(g, r, a, foes)
        r.cds[a.id] = a.cd
        r.nextT = [4.0, 3.4, 2.7][r.phase] + a.warn + (a.sweep ? a.sweep.count * (a.stagger ?? 0) : 0)
      } else r.nextT = 0.5
    }
    // The arena fights too: vents, lightning rods, tornados, the floor grid
    r.envT -= dt
    if (r.envT <= 0) arenaHazard(g, r)
  }

  // Rayquaza in the air: once out of sight it moves over the landing spot
  if (r.air) {
    r.air.t -= dt
    if (r.air.total - r.air.t > AIR_UP) {
      boss.x = r.goalX = r.air.x
      boss.y = r.goalY = r.air.y
    }
    if (r.air.t <= 0) r.air = null
  }

  // Lumber around: keep close to the action, stay in the middle part of the arena
  if (!boss.fainted && boss.castT <= 0 && !boss.charging && r.busyT <= 0 && !r.air) {
    if (nearest && Math.random() < dt * 0.6) {
      const a = Math.random() * Math.PI * 2
      r.goalX = ARENA_C + (nearest.x - ARENA_C) * 0.4 + Math.cos(a) * 2
      r.goalY = ARENA_C + (nearest.y - ARENA_C) * 0.4 + Math.sin(a) * 2
    }
    const dx = r.goalX - boss.x, dy = r.goalY - boss.y, d = Math.hypot(dx, dy)
    if (d > 0.3) {
      const sp = 1.2 + r.phase * 0.3
      boss.x += (dx / d) * sp * dt
      boss.y += (dy / d) * sp * dt
      boss.mvx = dx / d
      boss.mvy = dy / d
    } else boss.mvx = boss.mvy = 0
    if (nearest) {
      boss.aimX = nearest.x - boss.x
      boss.aimY = nearest.y - boss.y
      boss.aimT = 0.3
    }
  } else boss.mvx = boss.mvy = 0

  // Mirror images circle the arena
  r.clones.forEach((c, i) => {
    c.a += dt * 0.22
    c.x = ARENA_C + Math.cos(c.a) * 7.5
    c.y = ARENA_C + Math.sin(c.a) * 6.5
    const m = g.clones[i]
    if (m) {
      m.mvx = c.x - m.x
      m.mvy = c.y - m.y
      m.x = c.x
      m.y = c.y
      if (nearest) {
        m.aimX = nearest.x - m.x
        m.aimY = nearest.y - m.y
        m.dir = Math.abs(m.aimX) > Math.abs(m.aimY) ? (m.aimX > 0 ? 'right' : 'left') : m.aimY > 0 ? 'down' : 'up'
      }
    }
  })

  // Delta Stream: a wind that pushes every player along
  let wind: [number, number] | undefined
  if (r.wind) {
    if (r.wind.delay > 0) r.wind.delay -= dt
    else {
      r.wind.t -= dt
      wind = [r.wind.dx, r.wind.dy]
      if (r.wind.t <= 0) r.wind = null
    }
  }
  g.raidView = {
    timeLeft: Math.max(0, r.timeLeft), phase: r.phase, wind,
    clones: r.clones.length ? r.clones.map((c) => [c.x, c.y] as [number, number]) : undefined,
    air: r.air ? airLift(r.air.total - r.air.t, r.air.t) : 0,
    dg: r.dg ? viewOf(g, r.dg) : undefined,
  }

  tickHazards(g, dt)

  // How does it end?
  if (boss.fainted) r.result = 'won'
  else if (r.timeLeft <= 0 || g.trainers.every((t) => !t.alive)) r.result = 'lost'
  if (r.result) endRaid(g, r)
}

/** Hazards land; tornados then stay a while and roam. */
function tickHazards(g: Game, dt: number) {
  for (const h of [...g.hazards]) {
    const was = h.t
    h.t -= dt
    if (h.t > 0) continue
    if (h.dur <= 0) {
      g.hazards.splice(g.hazards.indexOf(h), 1)
      resolveHazard(g, h)
      continue
    }
    if (was > 0) resolveHazard(g, h)
    if (isPool(h)) updatePool(g, h, dt)
    else updateTornado(g, h, dt)
    h.dur -= dt
    if (h.dur <= 0) {
      g.hazards.splice(g.hazards.indexOf(h), 1)
      if (!isPool(h)) g.vfx.burst(h.x, h.y - 0.5, { n: 14, speed: 4, cols: PAL.flying.cols, shape: 'smoke', s0: 4, s1: 9, life: 0.6, flat: 0.5 })
    }
  }
}

/** Seconds the phase change takes (the roar and form change on screen). */
export const ENRAGE_TIME = 2.6

/** Seconds Rayquaza takes to fly out of sight, and to come back down. */
const AIR_UP = 0.45, AIR_DOWN = 0.3
/** How far up the boss is (0 on the ground, 1 out of sight). */
function airLift(up: number, left: number) {
  return Math.max(0, Math.min(1, up / AIR_UP, left / AIR_DOWN))
}

/** Each arena's own trouble, on a timer that speeds up with the phases. */
function arenaHazard(g: Game, r: RaidState) {
  const w = g.world
  switch (r.def.arena) {
    case 'crater': {
      r.envT = [11, 9, 7][r.phase]
      const v = w.vents[Math.floor(Math.random() * w.vents.length)]
      addHazard(g, { shape: 'circle', x: v.x, y: v.y, ang: 0, r: 2.6, inner: 0, width: 0, t: 1.35, dmg: 0.35, fx: 'earthpower', type: 'fire', freeze: 0, cover: false, both: false, atk: 'vent' })
      g.soundAt(v.x, v.y, 'boss', ['charge', 'earthpower', 0.7, 1.35], { range: 24 })
      break
    }
    case 'plateau':
      r.envT = [8, 6.5, 5][r.phase]
      rodArc(g, Math.floor(Math.random() * w.rods.length))
      break
    case 'sky':
      r.envT = [12, 10, 8][r.phase]
      spawnTornado(g, { n: 1, speed: 1.5, dur: 5, dps: 0.24 }, 1.4, 0.25, 'flying')
      break
    case 'lab': {
      r.envT = [10, 8, 6.5][r.phase]
      addHazard(g, { shape: 'grid', x: ARENA_C, y: ARENA_C, ang: 0, r: ARENA_R, inner: Math.random() < 0.5 ? 0 : 1, width: World.LAB_CELL, t: 1.8, dmg: 0.3, fx: 'psychic', type: 'psychic', freeze: 0, cover: false, both: false, atk: 'grid' })
      for (const v of g.viewers) v.hooks.toast(both('The floor grid is charging: find a dark tile!', 'Het vloerraster laadt op: zoek een donker vak!'), '#ff90e0')
      g.soundAt(ARENA_C, ARENA_C, 'boss', ['charge', 'psychic', 0.8, 1.8], { global: true })
      break
    }
    default:
      r.envT = 10
  }
}

/** Stormtop: lightning jumps from rod i to the next one round the arena. */
function rodArc(g: Game, i: number, warn = 1.4) {
  const rods = g.world.rods
  if (rods.length < 2) return
  const a = rods[i % rods.length], b = rods[(i + 1) % rods.length]
  const ax = a.x + 0.5, ay = a.y + 0.5, bx = b.x + 0.5, by = b.y + 0.5
  addHazard(g, { shape: 'line', x: ax, y: ay, ang: Math.atan2(by - ay, bx - ax), r: Math.hypot(bx - ax, by - ay), inner: 0, width: 1.4, t: warn, dmg: 0.35, fx: 'discharge', type: 'electric', freeze: 0, cover: false, both: false, atk: 'arc' })
  g.soundAt((ax + bx) / 2, (ay + by) / 2, 'boss', ['charge', 'discharge', 0.7, warn], { range: 24 })
}

/** Whirlwinds that rise near the edge of the arena and then go after people. */
function spawnTornado(g: Game, tw: { n: number; speed: number; dur: number; dps: number }, warn: number, dmg: number, atk: string) {
  const foes = targets(g)
  for (let i = 0; i < tw.n; i++) {
    // Start on the edge, on the side of someone (but not on top of them)
    const f = foes.length ? foes[(i + Math.floor(Math.random() * foes.length)) % foes.length] : null
    const base = f ? Math.atan2(f.y - ARENA_C, f.x - ARENA_C) : Math.random() * Math.PI * 2
    const a = base + (i - (tw.n - 1) / 2) * 1.1 + (Math.random() - 0.5) * 0.6
    const x = ARENA_C + Math.cos(a) * (ARENA_R - 2.5), y = ARENA_C + Math.sin(a) * (ARENA_R - 2.5)
    const dir = Math.atan2(ARENA_C - y, ARENA_C - x)
    addHazard(g, {
      shape: 'circle', x, y, ang: 0, r: 1.7, inner: 0, width: 0, t: warn + i * 0.25, dmg, fx: 'hurricane', type: 'flying', freeze: 0, cover: false, both: false, atk,
      vx: Math.cos(dir) * tw.speed, vy: Math.sin(dir) * tw.speed, dur: tw.dur, dps: tw.dps,
    })
  }
}

/** A tornado on the move: turns (slowly) toward the closest Pokémon and hurts anyone inside. */
/** Pools of magma that stay a while (raid dungeons): they don't move, they burn whoever stands in them. */
export const isPool = (h: Hazard) => h.atk === 'pool' || h.atk.endsWith('_pool')

function updatePool(g: Game, h: Hazard, dt: number) {
  if (Math.random() < dt * 6) g.vfx.burst(h.x + (Math.random() - 0.5) * h.r * 1.4, h.y + (Math.random() - 0.5) * h.r * 0.8, { n: 1, speed: 1.5, dir: -Math.PI / 2, spread: 0.5, cols: ['#ffd060', '#ff8030'], shape: 'flame', add: true, s0: 2.5, s1: 0.5, life: 0.5 })
  h.tick = (h.tick ?? 0) - dt
  if (h.tick > 0) return
  h.tick = 0.5
  for (const m of targets(g)) if (Math.hypot(m.x - h.x, m.y - h.y) <= h.r) {
    g.applyDamage(m, m.maxHp * h.dps * 0.5, null)
    g.vOf(m.owner)?.sfx('burn')
  }
}

function updateTornado(g: Game, h: Hazard, dt: number) {
  const foes = targets(g)
  let best: Mon | null = null, bd = Infinity
  for (const f of foes) {
    const d = Math.hypot(f.x - h.x, f.y - h.y)
    if (d < bd) { bd = d; best = f }
  }
  const sp = Math.hypot(h.vx, h.vy) || 1.6
  let ang = Math.atan2(h.vy, h.vx)
  // Lazy homing: only on someone close by, and it turns slowly (you can step aside)
  if (best && bd < 9 && (h.tick ?? 0) < 0.3) {
    let da = Math.atan2(best.y - h.y, best.x - h.x) - ang
    da = Math.atan2(Math.sin(da), Math.cos(da))
    ang += Math.max(-0.7 * dt, Math.min(0.7 * dt, da))
  }
  ang += Math.sin(g.time * 1.7 + h.id) * 0.6 * dt
  // Bounce back off the edge of the arena
  const cx = h.x + Math.cos(ang) * sp * dt, cy = h.y + Math.sin(ang) * sp * dt
  if (Math.hypot(cx - ARENA_C, cy - ARENA_C) > ARENA_R - 1.5) ang = Math.atan2(ARENA_C - h.y, ARENA_C - h.x)
  h.vx = Math.cos(ang) * sp
  h.vy = Math.sin(ang) * sp
  h.x += h.vx * dt
  h.y += h.vy * dt
  if (Math.random() < dt * 10) g.vfx.burst(h.x + (Math.random() - 0.5) * 2, h.y, { n: 2, speed: 3, dir: -Math.PI / 2, spread: 1.2, cols: PAL.flying.cols, shape: 'streak', s0: 3, s1: 1, life: 0.4, flat: 0.5 })
  // Damage in ticks so the numbers stay readable
  // (after a hit it wanders off for a moment instead of chasing the same Pokémon)
  h.tick = (h.tick ?? 0) - dt
  if (h.tick > 0) return
  let hit = false
  for (const m of foes) {
    if (Math.hypot(m.x - h.x, m.y - h.y) > h.r) continue
    g.applyDamage(m, m.maxHp * h.dps * 0.5, null)
    g.vfx.burst(m.x, m.y - 0.5, { n: 6, speed: 4, cols: PAL.flying.cols, shape: 'streak', s0: 3, s1: 1, life: 0.35 })
    hit = true
  }
  h.tick = hit ? 1.2 : 0
}

function closest(boss: Mon, foes: Mon[]) {
  let best: Mon | null = null, bd = Infinity
  for (const f of foes) {
    const d = Math.hypot(f.x - boss.x, f.y - boss.y)
    if (d < bd) { bd = d; best = f }
  }
  return best
}

function pickAttack(r: RaidState): BossAttack | null {
  const ready = r.def.attacks.filter((a) => a.phase <= r.phase && !(r.cds[a.id] > 0))
  if (!ready.length) return null
  let roll = Math.random() * ready.reduce((s, a) => s + a.weight, 0)
  for (const a of ready) if ((roll -= a.weight) <= 0) return a
  return ready[0]
}

type NewHazard = Omit<Hazard, 'id' | 'total' | 'vx' | 'vy' | 'dur' | 'dps'> & Partial<Pick<Hazard, 'vx' | 'vy' | 'dur' | 'dps'>>
export function addHazard(g: Game, h: NewHazard) {
  g.hazards.push({ vx: 0, vy: 0, dur: 0, dps: 0, ...h, id: hazardId++, total: h.t })
  g.vfx.mark(h.x, h.y)
}

/** A spot near (x, y) the boss can stand on, inside the arena. */
function standSpot(g: Game, x: number, y: number) {
  const d = Math.hypot(x - ARENA_C, y - ARENA_C), max = ARENA_R - 3
  if (d > max) {
    x = ARENA_C + ((x - ARENA_C) / d) * max
    y = ARENA_C + ((y - ARENA_C) / d) * max
  }
  for (let i = 0; i < 8 && g.world.blocked(x, y); i++) {
    x += (ARENA_C - x) * 0.25
    y += (ARENA_C - y) * 0.25
  }
  return [x, y] as const
}

/** Lay out an attack's hazards on the ground. */
function castAttack(g: Game, r: RaidState, a: BossAttack, foes: Mon[]) {
  const boss = r.boss
  const pick = a.target === 'random' ? foes[Math.floor(Math.random() * foes.length)] : closest(boss, foes)
  const aimAt = pick ?? { x: boss.x, y: boss.y + 3 }
  // Teleport: blink next to the target first (a step toward the middle, so it's never in a wall)
  if (a.move === 'teleport' && pick) {
    const v = g.vfx, p = palOf(a.type, a.id)
    v.mark(boss.x, boss.y)
    v.burst(boss.x, boss.y - 1, { n: 22, speed: 6, cols: p.cols, shape: 'star', add: true, s0: 4, s1: 1, life: 0.5 })
    v.ring(boss.x, boss.y - 0.5, 2.4, p.cols[2], 0.4, 5)
    const d = Math.hypot(ARENA_C - pick.x, ARENA_C - pick.y) || 1
    const [nx, ny] = standSpot(g, pick.x + ((ARENA_C - pick.x) / d) * 2.5, pick.y + ((ARENA_C - pick.y) / d) * 2.5)
    boss.x = r.goalX = nx
    boss.y = r.goalY = ny
    v.mark(nx, ny)
    v.glow(nx, ny - 1, 70, p.glow, 0.5)
    v.burst(nx, ny - 1, { n: 26, speed: 7, cols: p.cols, shape: 'star', add: true, s0: 5, s1: 1, life: 0.6 })
    v.flash(0.25, '255,190,255')
    g.soundAt(nx, ny, 'boss', ['teleport', a.fx], { global: true })
    r.busyT = a.warn
  }
  castFrom(g, r, a, foes, boss.x, boss.y, aimAt, true)
  if (a.move === 'dash' || a.move === 'land') r.busyT = a.warn + 0.2
  if (a.move === 'land' && pick) {
    // Up it goes: out of reach until it lands on the circle
    r.air = { t: a.warn, total: a.warn, x: pick.x, y: pick.y }
    r.invulnT = Math.max(r.invulnT, a.warn)
    boss.liftT = 0.5
    g.soundAt(boss.x, boss.y, 'boss', ['takeoff', a.fx], { global: true })
    g.vfx.mark(boss.x, boss.y)
    g.vfx.burst(boss.x, boss.y - 0.3, { n: 24, speed: 7, cols: palOf(a.type, a.id).cols, shape: 'streak', add: true, s0: 5, s1: 1, life: 0.5, flat: 0.5 })
    g.vfx.ring(boss.x, boss.y, 3, palOf(a.type, a.id).cols[2], 0.5, 6)
    g.vfx.shakeBy(5)
  }
  // Mirror images join in with the aimed and self-centred attacks
  if (r.clones.length && (a.shape === 'cone' || (a.shape === 'circle' && a.target === 'self')))
    for (const c of r.clones) castFrom(g, r, { ...a, move: undefined }, foes, c.x, c.y, closestTo(c.x, c.y, foes) ?? aimAt, false)
  // The storm sets every lightning rod off as well
  if (a.rods) g.world.rods.forEach((_, i) => rodArc(g, i, a.warn + 0.4))
  if (a.tornado) spawnTornado(g, a.tornado, a.warn, a.dmg, a.id)
  if (a.wind) {
    // Blow everyone toward the side of the arena furthest from them... mostly
    const ang = Math.random() * Math.PI * 2
    r.wind = { dx: Math.cos(ang) * a.wind.force, dy: Math.sin(ang) * a.wind.force, delay: a.warn, t: a.wind.dur }
    for (const v of g.viewers) v.hooks.toast(both('Delta Stream: walk against the wind!', 'Delta Stream: loop tegen de wind in!'), '#a0f0e8')
    g.soundAt(ARENA_C, ARENA_C, 'boss', ['wind', a.fx, 1, a.warn + a.wind.dur], { global: true })
  }
}

function closestTo(x: number, y: number, foes: Mon[]) {
  let best: Mon | null = null, bd = Infinity
  for (const f of foes) {
    const d = Math.hypot(f.x - x, f.y - y)
    if (d < bd) { bd = d; best = f }
  }
  return best
}

/** One caster (the boss or a mirror image) lays out an attack from (ox, oy). */
function castFrom(g: Game, r: RaidState, a: BossAttack, foes: Mon[], ox: number, oy: number, aimAt: { x: number; y: number }, main: boolean) {
  const boss = r.boss
  const base = { ang: 0, r: a.r ?? 2, inner: a.inner ?? 0, width: a.width ?? 1, dmg: a.dmg, fx: a.fx, type: a.type, freeze: a.freeze ?? 0, cover: !!a.cover, both: false, atk: a.id }
  const ang = Math.atan2(aimAt.y - oy, aimAt.x - ox)
  if (main) {
    boss.castT = 0.9
    boss.aimX = Math.cos(ang)
    boss.aimY = Math.sin(ang)
    boss.aimT = a.warn
    g.callout(boss, inBoth(() => a.name), TYPE_COLOR[a.type])
    for (const v of g.viewers) if (Math.hypot(v.camX - boss.x, v.camY - boss.y) < 20) v.sfx('warn')
    g.soundAt(boss.x, boss.y, 'boss', ['charge', a.fx, 1, a.warn], { global: true })
  }
  // Tornado and wind attacks are all about the whirlwinds: no circles of their own
  if (a.tornado) return

  switch (a.shape) {
    case 'circle': {
      if (a.target === 'self') {
        addHazard(g, { ...base, shape: 'circle', x: ox, y: oy, t: a.warn })
        break
      }
      if (a.target === 'vents') {
        g.world.vents.forEach((v, i) => addHazard(g, { ...base, shape: 'circle', x: v.x, y: v.y, t: a.warn + i * (a.stagger ?? 0) }))
        break
      }
      if (a.target === 'nearest' || a.target === 'random') {
        addHazard(g, { ...base, shape: 'circle', x: aimAt.x, y: aimAt.y, t: a.warn })
        break
      }
      const spots: [number, number][] = foes.map((f) => [f.x, f.y])
      for (let i = 0; i < (a.extra ?? 0); i++) {
        const ra = Math.random() * Math.PI * 2, rd = Math.sqrt(Math.random()) * (ARENA_R - 2)
        spots.push([ARENA_C + Math.cos(ra) * rd, ARENA_C + Math.sin(ra) * rd])
      }
      spots.forEach(([x, y], i) => addHazard(g, { ...base, shape: 'circle', x, y, t: a.warn + i * (a.stagger ?? 0) }))
      break
    }
    case 'ring':
      addHazard(g, { ...base, shape: 'ring', x: ox, y: oy, t: a.warn })
      break
    case 'cone':
      addHazard(g, { ...base, shape: 'cone', x: ox, y: oy, ang, r: a.len ?? 9, t: a.warn })
      break
    case 'line': {
      const n = a.sweep?.count ?? 1
      const dirSign = Math.random() < 0.5 ? 1 : -1
      // One-way sweeps fan out from the aim (centred on it); sweeps through the boss turn one way
      const start = a.oneWay ? -((n - 1) / 2) * (a.sweep?.step ?? 0) * dirSign : 0
      for (let i = 0; i < n; i++) {
        const la = ang + start + dirSign * i * (a.sweep?.step ?? 0)
        addHazard(g, { ...base, shape: 'line', x: ox, y: oy, ang: la, r: a.len ?? 14, t: a.warn + i * (a.stagger ?? 0), both: !!a.sweep && !a.oneWay })
      }
      break
    }
    case 'grid':
      break
  }
}

/** Is (x, y) inside the hazard's shape? */
export function inHazard(h: Hazard, x: number, y: number) {
  const dx = x - h.x, dy = y - h.y
  const d = Math.hypot(dx, dy)
  switch (h.shape) {
    case 'circle':
      return d <= h.r
    case 'ring':
      return d >= h.inner && d <= h.r
    case 'cone': {
      if (d > h.r) return false
      if (d < 0.8) return true
      let da = Math.atan2(dy, dx) - h.ang
      da = Math.atan2(Math.sin(da), Math.cos(da))
      return Math.abs(da) <= h.width
    }
    case 'line': {
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang)
      const along = dx * ux + dy * uy
      const across = Math.abs(-dx * uy + dy * ux)
      return across <= h.width / 2 && (h.both ? Math.abs(along) <= h.r : along >= -0.5 && along <= h.r)
    }
    case 'grid':
      return d <= h.r + 1 && gridLit(h, x, y)
  }
}

/** The floor grid: is the cell under (x, y) one of the lit ones? */
function gridLit(h: Hazard, x: number, y: number) {
  const o = ARENA_C - ARENA_R
  const cx = Math.floor((x - o) / h.width), cy = Math.floor((y - o) / h.width)
  return (((cx + cy) % 2) + 2) % 2 === h.inner
}

function resolveHazard(g: Game, h: Hazard) {
  const v = g.vfx
  // The boss's attacks land with the heaviest version of their move's sound
  const r = g.raid
  const a = r?.def.attacks.find((x) => x.id === h.atk)
  const kind = h.atk === 'vent' || isPool(h) ? 'vent' : h.atk === 'arc' ? 'arc' : h.atk === 'grid' ? 'grid' : h.dur > 0 ? 'tornado' : a?.move === 'land' ? 'quake' : a?.move === 'dash' ? 'dash' : 'impact'
  const size = h.shape === 'circle' && h.r < 2.5 ? 0.75 : 1
  // Tornados and the floor grid are heard where they are; the boss's blows fill the arena
  g.soundAt(h.x, h.y, 'boss', [kind, h.fx, size, h.dur > 0 ? h.dur : 1], kind === 'tornado' || kind === 'vent' || kind === 'arc' ? { range: 24 } : { global: true })
  // Fusion Bolt: Zekrom races down the line it just lit up
  if (r && a?.move === 'dash' && !r.boss.fainted) {
    const [ex, ey] = standSpot(g, h.x + Math.cos(h.ang) * (h.r - 1), h.y + Math.sin(h.ang) * (h.r - 1))
    const p = palOf(h.type, h.atk)
    for (let i = 0; i < 3; i++) v.bolt(r.boss.x, r.boss.y - 1, ex, ey - 1, { col: i ? p.cols[2] : '#ffffff', w: 3.2 - i * 0.8, life: 0.45, jag: 10, branches: 3, strands: 2 })
    r.boss.x = r.goalX = ex
    r.boss.y = r.goalY = ey
    r.boss.liftT = 0.4
    v.mark(ex, ey)
    v.glow(ex, ey - 1, 90, p.glow, 0.5)
  }
  impactFx(g, h)
  // Ice pillars take a beating from everything but the blizzard they shelter you from
  if (!h.cover)
    g.world.pillars.forEach((pl, i) => {
      if (pl.hp <= 0 || !inHazard(h, pl.x + 1, pl.y + 1)) return
      pl.hp = Math.max(0, pl.hp - 0.34)
      g.soundAt(pl.x + 1, pl.y + 1, 'boss', ['shatter', 'ice', pl.hp <= 0 ? 1 : 0.4], { range: 24 })
      v.mark(pl.x + 1, pl.y + 1)
      v.burst(pl.x + 1, pl.y + 0.5, { n: 10, speed: 5, cols: ['#ffffff', '#c8ecff', '#8cc4f0'], shape: 'shard', s0: 3, s1: 1, life: 0.6, grav: 8 })
      if (pl.hp <= 0) {
        v.burst(pl.x + 1, pl.y, { n: 30, speed: 8, cols: ['#ffffff', '#c8ecff', '#8cc4f0'], shape: 'shard', s0: 4, s1: 1, life: 0.9, grav: 10 })
        v.shakeBy(6)
        g.world.breakPillar(i)
        for (const vw of g.viewers) vw.hooks.feed(both('🧊 An ice pillar shattered!', '🧊 Een ijspilaar is versplinterd!'), { kind: 'boss' })
      }
    })
  // Damage everyone inside (behind a pillar is safe from cover attacks)
  for (const m of targets(g)) {
    if (!inHazard(h, m.x, m.y)) continue
    if (h.cover && g.world.lineBlocked(h.x, h.y, m.x, m.y)) continue
    g.applyDamage(m, m.maxHp * h.dmg, null)
    if (h.freeze && !m.fainted) {
      m.frozenT = Math.max(m.frozenT, h.freeze)
      g.soundAt(m.x, m.y, 'freeze', [], { owners: [m.owner], range: 14 })
      m.tintCol = '#a0e0ff'
      m.tintT = h.freeze
      g.addFxPublic({ kind: 'text', x: m.x, y: m.y - 2.1, t: 0, life: 0.9, color: '#a0e0ff', text: both('Frozen!', 'Bevroren!'), small: true })
    }
  }
}

/** The fight is about to start: the boss roars and the ground shakes. */
export function raidIntro(g: Game) {
  const r = g.raid
  // In a dungeon the boss wakes when you reach its arena (dungeon.ts calls this then)
  if (!r || (r.dg && r.dg.stage !== 'boss')) return
  const b = r.boss
  for (const v of g.viewers) v.cry(b.species.id, 0.5)
  g.soundAt(b.x, b.y, 'boss', ['intro', r.def.attacks[0].fx], { global: true })
  g.vfx.shakeBy(6)
}

function phaseBanner(g: Game, r: RaidState) {
  const boss = r.boss
  for (const v of g.viewers) {
    const final = r.phase === 2
    const name = final && r.def.finalName ? r.def.finalName : r.def.name
    v.hooks.banner({
      kind: 'legendary',
      title: final && r.def.finalName ? both(`${r.def.name} becomes ${name}!`, `${r.def.name} wordt ${name}!`) : both(`${name} is enraged!`, `${name} wordt woedend!`),
      sub: final ? inBoth(() => `${L('Final phase', 'Laatste fase')} · ${r.def.finalSub}`) : both('Phase 2 · new attacks', 'Fase 2 · nieuwe aanvallen'),
      mon: r.def.forms?.[r.phase] ?? boss.species.id, color: r.def.looks[r.phase].aura ?? r.def.color, voice: r.phase === 1 ? 'enraged' : 'final_phase',
    })
    v.hooks.feed(final
      ? both(`🔥 Final phase: ${name} unleashes everything`, `🔥 Laatste fase: ${name} gooit alles in de strijd`)
      : both(`🔥 Phase 2: ${name} is enraged`, `🔥 Fase 2: ${name} is woedend`), { mon: r.def.forms?.[r.phase] ?? boss.species.id, kind: 'boss' })
  }
}

function enrage(g: Game, r: RaidState) {
  r.phase++
  // A short cinematic (roar, form change) plays on every screen: the boss holds still meanwhile
  r.invulnT = ENRAGE_TIME
  r.nextT = ENRAGE_TIME + 0.8
  const boss = r.boss
  boss.charging = null
  for (const v of g.viewers) v.cry(boss.species.id, 0.5)
  // The banner lands with the flash and the form change, not over the roar
  r.bannerT = ENRAGE_TIME * 0.42
  // Powering up (the big flash and the form change come a moment later: see bossFx)
  g.vfx.mark(boss.x, boss.y)
  g.vfx.ring(boss.x, boss.y, 4, r.def.color, 0.8, 8)
  g.vfx.glow(boss.x, boss.y - 0.8, 80, r.def.color, 0.6)
  g.vfx.shakeBy(5)
  g.soundAt(boss.x, boss.y, 'boss', ['enrage', r.def.attacks[0].fx], { global: true })
  // Roar: shove everyone back
  for (const tr of g.trainers) {
    if (!tr.alive) continue
    for (const o of [tr, tr.mon]) {
      const dx = o.x - boss.x, dy = o.y - boss.y, d = Math.hypot(dx, dy) || 1
      if (d < 7) for (let i = 0; i < 10; i++) g.tryMove(o, (dx / d) * 0.3, (dy / d) * 0.3, 0.3)
    }
  }
  // Mewtwo splits: mirror images that cast along with it
  if (r.def.clonesFrom != null && r.phase >= r.def.clonesFrom && !r.clones.length) {
    for (let i = 0; i < 2; i++) {
      const a = Math.atan2(boss.y - ARENA_C, boss.x - ARENA_C) + (i ? -1 : 1) * (Math.PI * 2) / 3
      r.clones.push({ x: ARENA_C + Math.cos(a) * 7.5, y: ARENA_C + Math.sin(a) * 6.5, a })
    }
    g.clones = r.clones.map((c) => cloneMon(r.def.species, c.x, c.y))
    g.soundAt(boss.x, boss.y, 'boss', ['clones', 'psychic'], { global: true })
    for (const c of r.clones) {
      g.vfx.mark(c.x, c.y)
      g.vfx.bolt(boss.x, boss.y - 1.2, c.x, c.y - 1.2, { col: r.def.color, w: 2.4, jag: 10, branches: 2, strands: 2, life: 0.5 })
      g.vfx.burst(c.x, c.y - 1, { n: 26, speed: 7, cols: palOf('psychic').cols, shape: 'star', add: true, s0: 5, s1: 1, life: 0.7 })
    }
    for (const v of g.viewers) v.hooks.toast(both('Mewtwo splits: the clones join the attack!', 'Mewtwo splitst zich: de klonen vallen mee aan!'), r.def.color)
  }
  // Two potions to keep going
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2
    g.items.push({ x: ARENA_C + Math.cos(a) * 8, y: ARENA_C + Math.sin(a) * 8, kind: 'potion', bob: 0 })
  }
  g.soundAt(ARENA_C, ARENA_C, 'spawnChime', [], { global: true })
}

/** A see-through copy of the boss (drawn only, it can't be hit). */
export function cloneMon(species: number, x: number, y: number) {
  const m = new Mon(species, 60)
  m.boss = true
  m.x = x
  m.y = y
  return m
}

/** A player's Pokémon went down: lose a life, come back in a moment (or you're out). */
export function raidDown(g: Game, tr: Trainer) {
  tr.lives = Math.max(0, tr.lives - 1)
  const v = g.vOf(tr)
  if (tr.lives > 0) {
    tr.respawnT = RESPAWN_TIME
    for (const o of g.viewers) if (o !== v) o.hooks.feed(both(`💥 ${tr.name}'s ${tr.mon.name} fainted · back in ${RESPAWN_TIME} s`, `💥 ${tr.mon.name} van ${tr.name} is verslagen · terug over ${RESPAWN_TIME} s`), { mon: tr.mon.species.id, kind: 'ko' })
    v?.hooks.banner({ kind: 'fainted', title: both(`${tr.mon.name} fainted!`, `${tr.mon.name} is verslagen!`), sub: both(`Back in ${RESPAWN_TIME} s · ${tr.lives} ${tr.lives === 1 ? 'life' : 'lives'} left`, `Terug over ${RESPAWN_TIME} s · nog ${tr.lives} ${tr.lives === 1 ? 'leven' : 'levens'}`), mon: tr.mon.species.id })
    return
  }
  g.eliminateRaid(tr)
}

function respawn(g: Game, tr: Trainer) {
  if (g.raid?.dg) {
    respawnAt(g, tr, g.raid.dg.checkpoint)
    g.vOf(tr)?.hooks.toast(both(`Back in the fight! ${tr.lives} ${tr.lives === 1 ? 'life' : 'lives'} left`, `Terug in de strijd! Nog ${tr.lives} ${tr.lives === 1 ? 'leven' : 'levens'}`), '#80f080')
    return
  }
  const i = g.trainers.indexOf(tr)
  const [x, y] = spawnPoint(g, i, g.trainers.length)
  tr.x = x
  tr.y = y
  const m = tr.mon
  m.hp = m.maxHp
  m.frozenT = 0
  g.sendOut(tr, tr.active)
  m.revealT = 0
  g.vfx.mark(m.x, m.y)
  g.vfx.ring(m.x, m.y - 0.2, 1.6, '#ffffff', 0.5, 6)
  const v = g.vOf(tr)
  v?.hooks.toast(both(`Back in the fight! ${tr.lives} ${tr.lives === 1 ? 'life' : 'lives'} left`, `Terug in de strijd! Nog ${tr.lives} ${tr.lives === 1 ? 'leven' : 'levens'}`), '#80f080')
}

function endRaid(g: Game, r: RaidState) {
  const won = r.result === 'won'
  r.clones = []
  g.clones = []
  if (won) {
    const b = r.boss
    g.vfx.mark(b.x, b.y)
    g.vfx.flash(0.9, '255,255,255')
    g.vfx.shakeBy(14)
    g.vfx.ring(b.x, b.y, 6, '#ffffff', 1, 10)
    g.soundAt(b.x, b.y, 'boss', ['down', r.def.attacks[0].fx], { global: true })
  }
  for (const v of g.viewers) {
    if (v.done) continue
    v.hooks.banner(won
      ? { kind: 'win', title: both('RAID CLEARED!', 'RAID GESLAAGD!'), sub: both(`${r.def.name} is defeated`, `${r.def.name} is verslagen`), mon: r.boss.species.id, color: '#ffd040', voice: 'raid_win' }
      : { kind: 'fainted', title: both('Raid failed', 'Raid mislukt'), sub: r.timeLeft <= 0 ? both('Time is up', 'De tijd is op') : both('Everyone fainted', 'Iedereen is verslagen'), mon: r.boss.species.id, voice: 'raid_fail' })
    v.endT = 2.6
  }
}

// ---------------------------------------------------------------- effects

// Mostly bright colours: impacts should glow, not fade to dark dots
const PAL = {
  fire: { cols: ['#ffffff', '#fff2a0', '#ffc840', '#ff9028', '#f05818'], glow: '#ff7a30', rgb: '255,80,30', spike: ['#ffb040', '#c04818'] },
  blue: { cols: ['#ffffff', '#e0f4ff', '#90d0ff', '#50a0ff', '#3068f0'], glow: '#5aa0ff', rgb: '60,130,255', spike: ['#c8e8ff', '#4070d0'] },
  ice: { cols: ['#ffffff', '#e4f6ff', '#a8dcff', '#70b8f0', '#4a88d0'], glow: '#9ad8ff', rgb: '40,120,240', spike: ['#f4fcff', '#5a9ee0'] },
  dragon: { cols: ['#ffffff', '#e8dcff', '#b898ff', '#8860f0', '#6038d0'], glow: '#9a70ff', rgb: '150,90,255', spike: ['#c0a8ff', '#6040c0'] },
  emerald: { cols: ['#ffffff', '#e0ffe8', '#98f0b0', '#50d070', '#20a050'], glow: '#60f090', rgb: '70,215,120', spike: ['#c0ffd0', '#208048'] },
  electric: { cols: ['#ffffff', '#fffbd0', '#ffe860', '#ffc820', '#e09a10'], glow: '#ffe040', rgb: '255,215,50', spike: ['#fff4a0', '#c09010'] },
  flying: { cols: ['#ffffff', '#f0fcff', '#c8f0f0', '#90dcd8', '#58b8c0'], glow: '#b0f4ec', rgb: '160,235,225', spike: ['#ffffff', '#70c0c8'] },
  psychic: { cols: ['#ffffff', '#ffe0f4', '#ff98d8', '#e060c0', '#a040b0'], glow: '#ff70d0', rgb: '240,100,210', spike: ['#ffc8ec', '#a03890'] },
  ghost: { cols: ['#ffffff', '#e8d8ff', '#a888e0', '#7050b8', '#402878'], glow: '#9060e0', rgb: '125,75,210', spike: ['#d0c0ff', '#402878'] },
}
type Pal = (typeof PAL)['fire']
const palOf = (t: PType, atk = ''): Pal =>
  atk === 'blueflare' ? PAL.blue
  : atk === 'dragonascent' || atk === 'outrage' ? PAL.emerald
  : t === 'ice' ? PAL.ice : t === 'dragon' ? PAL.dragon : t === 'electric' ? PAL.electric
  : t === 'flying' ? PAL.flying : t === 'psychic' ? PAL.psychic : t === 'ghost' ? PAL.ghost : PAL.fire
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** The boss attack behind a hazard (none for the crater's own vents). */
export function bossAttack(g: Game, atk: string): BossAttack | undefined {
  return BOSSES[g.setup.boss ?? 'reshiram'].attacks.find((a) => a.id === atk) ?? WARDEN_ATTACKS.find((a) => a.id === atk)
}

/** Particle shape and ground mark that go with an attack type. */
const shapeOf = (t: PType): Shape => (t === 'ice' ? 'shard' : t === 'fire' ? 'flame' : t === 'electric' ? 'streak' : t === 'flying' ? 'smoke' : 'star')
const decalOf = (t: PType): DecalKind | null => (t === 'ice' ? 'frost' : t === 'fire' || t === 'electric' ? 'scorch' : t === 'flying' ? null : t === 'psychic' ? 'glass' : 'crack')

/** Big impacts that fill the whole shape and leave marks on the ground. */
function impactFx(g: Game, h: Hazard) {
  const v = g.vfx, p = palOf(h.type, h.atk), ice = h.type === 'ice', elec = h.type === 'electric'
  const mv = moveFor({ name: '', fx: h.fx, type: h.type })
  const shape = shapeOf(h.type), decal = decalOf(h.type)
  v.mark(h.x, h.y)
  switch (h.shape) {
    case 'circle': {
      if (h.r > 10) {
        // Blizzard: the whole cave turns white
        v.flash(0.7, '230,245,255')
        v.shakeBy(11)
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, rd = Math.sqrt(Math.random()) * (ARENA_R - 1)
          v.burst(ARENA_C + Math.cos(a) * rd, ARENA_C + Math.sin(a) * rd - 0.5, { n: 8, dir: 0.35, spread: 0.35, speed: 13, cols: p.cols, shape: i % 2 ? 'streak' : 'flake', add: true, s0: 3.5, s1: 1.5, life: 0.8, flat: 0.5 })
        }
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2, rd = Math.random() * (ARENA_R - 3)
          v.decal(ARENA_C + Math.cos(a) * rd, ARENA_C + Math.sin(a) * rd, 2.6, 'frost', 8)
        }
        // Shards spatter off the pillars people hid behind
        for (const pl of g.world.pillars)
          if (pl.hp > 0) v.burst(pl.x + 1, pl.y + 0.6, { n: 8, speed: 5, cols: p.cols, shape: 'shard', s0: 3, s1: 1, life: 0.5, grav: 8 })
        return
      }
      const r = h.r
      if (h.dur > 0 && !isPool(h)) {
        // A tornado touches down: a gust and a ring of dust
        v.burst(h.x, h.y - 0.3, { n: 20, speed: 6, cols: p.cols, shape: 'smoke', s0: 5, s1: 10, life: 0.7, flat: 0.5, drag: 2 })
        v.burst(h.x, h.y - 0.6, { n: 14, dir: -Math.PI / 2, spread: 0.6, speed: 9, cols: p.cols, shape: 'streak', add: true, s0: 4, s1: 1, life: 0.5 })
        v.ring(h.x, h.y, r * 1.4, p.cols[2], 0.5, 6)
        v.shakeBy(4)
        return
      }
      onImpact(v, mv, h.x, h.y, r)
      v.glow(h.x, h.y, 34 * r, p.glow, 0.9)
      v.ring(h.x, h.y, r * 1.25, p.cols[2], 0.55, 7)
      v.ring(h.x, h.y, r * 0.7, '#ffffff', 0.35, 4)
      if (ice) {
        // Ice spikes burst out of the ground
        const n = Math.round(3 + r)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), d = r * rand(0.15, 0.75)
          v.pillar(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, rand(14, 28), rand(3, 5), p.spike[0], p.spike[1], 0.9, i * 0.03, '#e8f6ff')
        }
        v.burst(h.x, h.y - 0.3, { n: 24, speed: 8, cols: p.cols, shape: 'shard', s0: 3.5, s1: 1, life: 0.7, grav: 10, flat: 0.7 })
        v.decal(h.x, h.y, r * 0.9, 'frost', 7)
      } else if (h.type === 'fire') {
        // A column of fire, a flame shockwave and flying rocks
        v.burst(h.x, h.y - 0.2, { n: 20, dir: -Math.PI / 2, spread: 0.35, speed: 10 + r * 2, cols: p.cols, shape: 'flame', add: true, s0: 7, s1: 11, life: 0.95, grav: -3, drag: 1.5 })
        v.burst(h.x, h.y, { n: 14, speed: r * 4, cols: p.cols, shape: 'flame', add: true, s0: 6, s1: 9, life: 0.7, flat: 0.6, drag: 3 })
        v.burst(h.x, h.y - 0.3, { n: 8, speed: 7, cols: ['#3a2a20', '#5a4030', '#2a1a14'], shape: 'rock', s0: 2.5, s1: 1.5, life: 0.8, grav: 14, vr: 8 })
        v.decal(h.x, h.y, r * 0.9, h.atk === 'vent' || h.atk === 'eruption' ? 'crater' : 'scorch', 7)
      } else {
        // Lightning out of the sky, a dragon's crash or a psychic blast: a column, a shockwave, debris
        if (elec)
          for (let i = 0; i < 2; i++)
            v.bolt(h.x + rand(-1.5, 1.5), h.y - 9, h.x + rand(-0.4, 0.4), h.y - 0.2, { col: i ? p.cols[2] : '#ffffff', w: 3 - i * 0.9, jag: 12, branches: 2 - i, strands: 1, life: 0.4 })
        v.burst(h.x, h.y - 0.2, { n: 18, dir: -Math.PI / 2, spread: 0.45, speed: 9 + r * 2, cols: p.cols, shape, add: true, s0: 6, s1: 2, life: 0.75, grav: elec ? 4 : -2, drag: 1.5 })
        v.burst(h.x, h.y, { n: 16, speed: r * 4.5, cols: p.cols, shape, add: true, s0: 5, s1: 2, life: 0.6, flat: 0.6, drag: 3 })
        v.burst(h.x, h.y - 0.3, { n: 7, speed: 7, cols: ['#3a3440', '#585060', '#24202a'], shape: 'rock', s0: 2.5, s1: 1.5, life: 0.8, grav: 14, vr: 8 })
        if (decal) v.decal(h.x, h.y, r * 0.9, decal, 7)
      }
      v.shakeBy(Math.min(9, 3 + r * 1.2))
      return
    }
    case 'ring': {
      // A crown of flame columns, ice spikes or sparks all the way round
      const mid = (h.inner + Math.min(h.r, ARENA_R)) / 2, n = 18
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.08, 0.08)
        const x = h.x + Math.cos(a) * mid, y = h.y + Math.sin(a) * mid
        if (ice) v.pillar(x, y, rand(20, 34), 5, p.spike[0], p.spike[1], 1, i * 0.015, '#e8f6ff')
        else {
          v.burst(x, y - 0.2, { n: 5, dir: -Math.PI / 2, spread: 0.4, speed: 9, cols: p.cols, shape, add: true, s0: 6, s1: shape === 'flame' ? 9 : 2, life: 0.9, grav: -3, drag: 1.5 })
          if (elec && i % 3 === 0) v.bolt(x, y - 6, x, y - 0.2, { col: p.cols[1], w: 2, jag: 10, branches: 1, strands: 1, life: 0.35 })
          if (i % 3 === 0) v.glow(x, y, 40, p.glow, 0.8)
        }
      }
      v.ring(h.x, h.y, h.inner, '#ffffff', 0.45, 5)
      v.ring(h.x, h.y, Math.min(h.r, ARENA_R), p.cols[2], 0.7, 9)
      v.glow(h.x, h.y, 120, p.glow, 0.5)
      v.shakeBy(8)
      return
    }
    case 'cone': {
      // A wave rolling over the whole cone
      const ox = h.x, oy = h.y - 0.6
      v.glow(ox, oy, 60, p.glow, 0.5)
      onBeam(v, mv, ox, oy, h.x + Math.cos(h.ang) * h.r, h.y + Math.sin(h.ang) * h.r - 0.4, () => [ox, oy])
      for (let i = 1; i <= 4; i++)
        for (let s = -2; s <= 2; s++) {
          const a = h.ang + (s / 2) * h.width * 0.8, d = (h.r * i) / 4.4
          const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d
          if (ice && i % 2 === 0) v.pillar(x, y, 12 + i * 4, 3.5, p.spike[0], p.spike[1], 0.9, i * 0.05, '#e8f6ff')
          v.burst(x, y - 0.2, { n: 5, dir: h.ang, spread: 0.5, speed: 6 + i, cols: p.cols, shape: ice ? 'flake' : shape, add: !ice, s0: 5 + i * 0.6, s1: shape === 'flame' ? 8 : 2, life: 0.8, drag: 2, grav: h.type === 'fire' ? -2 : 0, flat: 0.7 })
          if (s === 0) v.glow(x, y, 30 + i * 8, p.glow, 0.7)
        }
      if (decal)
        for (let i = 1; i <= 3; i++)
          v.decal(h.x + Math.cos(h.ang) * h.r * (i / 3.5), h.y + Math.sin(h.ang) * h.r * (i / 3.5), 1.2 + i * 0.3, decal, 6)
      v.shakeBy(7)
      return
    }
    case 'line': {
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang)
      const sx = h.both ? h.x - ux * h.r : h.x, sy = h.both ? h.y - uy * h.r : h.y
      if (h.atk === 'arc') {
        // Lightning jumps from rod to rod
        for (let i = 0; i < 2; i++) v.bolt(sx, sy - 1.6, h.x + ux * h.r, h.y + uy * h.r - 1.6, { col: i ? p.cols[2] : '#ffffff', w: 3 - i * 0.8, jag: 14, branches: 2, strands: 1, life: 0.5 })
        for (const [x, y] of [[sx, sy], [h.x + ux * h.r, h.y + uy * h.r]]) {
          v.glow(x, y - 1.6, 70, p.glow, 0.5)
          v.burst(x, y - 1.6, { n: 14, speed: 7, cols: p.cols, shape: 'streak', add: true, s0: 4, s1: 1, life: 0.5 })
        }
      } else onBeam(v, mv, sx, sy - 0.4, h.x + ux * h.r, h.y + uy * h.r - 0.4, () => [sx, sy - 0.4])
      // Then a trail of sparks along its whole length
      let n = 0
      for (let d = (h.both ? -h.r : 0) + 1; d <= h.r; d += h.both ? 3 : 2.2) {
        const x = h.x + ux * d, y = h.y + uy * d
        if (Math.hypot(x - ARENA_C, y - ARENA_C) > ARENA_R + 1) continue
        v.burst(x, y - 0.2, { n: h.both ? 3 : 5, speed: 3, cols: p.cols, shape, add: true, s0: 6, s1: shape === 'flame' ? 8 : 2, life: 0.8, grav: ice ? 6 : -3, flat: 0.6 })
        if (decal && n++ % (h.both ? 4 : 2) === 0) v.decal(x, y, 1.1, decal, 4)
      }
      v.glow(h.x, h.y - 0.6, 50, p.glow, 0.4)
      v.shakeBy(h.both ? 4 : 6)
      return
    }
    case 'grid': {
      // Every lit cell bursts with psychic energy at once
      const c = h.width, o = ARENA_C - ARENA_R
      for (let gy = o; gy < ARENA_C + ARENA_R; gy += c)
        for (let gx = o; gx < ARENA_C + ARENA_R; gx += c) {
          const x = gx + c / 2, y = gy + c / 2
          if (Math.hypot(x - ARENA_C, y - ARENA_C) > ARENA_R || !gridLit(h, x, y)) continue
          v.burst(x, y - 0.3, { n: 4, dir: -Math.PI / 2, spread: 0.8, speed: 6, cols: p.cols, shape: 'star', add: true, s0: 5, s1: 1, life: 0.6 })
          v.glow(x, y, 46, p.glow, 0.5)
        }
      v.flash(0.35, '255,170,240')
      v.shakeBy(6)
      return
    }
  }
}

// ---------------------------------------------------------------- drawing

/** Seconds before it fires that a sweep beam shows in full. */
const SWEEP_SHOW = 0.9

/** The outline of a hazard as a canvas path (world px). */
function hazardPath(ctx: CanvasRenderingContext2D, h: Hazard) {
  const x = h.x * TILE, y = h.y * TILE, R = Math.min(h.r, ARENA_R + 2) * TILE
  ctx.beginPath()
  switch (h.shape) {
    case 'circle':
      ctx.arc(x, y, R, 0, Math.PI * 2)
      break
    case 'ring':
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.arc(x, y, h.inner * TILE, 0, Math.PI * 2, true)
      break
    case 'cone':
      ctx.moveTo(x, y)
      ctx.arc(x, y, h.r * TILE, h.ang - h.width, h.ang + h.width)
      ctx.closePath()
      break
    case 'line': {
      // A beam: rectangle along the direction (both ways through the boss for sweeps)
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang), px = -uy, py = ux
      const back = h.both ? h.r : 0.5, hw = h.width / 2
      const pts = [[-back, -hw], [h.r, -hw], [h.r, hw], [-back, hw]].map(([a, b]) => [x + (ux * a + px * b) * TILE, y + (uy * a + py * b) * TILE])
      ctx.moveTo(pts[0][0], pts[0][1])
      for (const [a, b] of pts.slice(1)) ctx.lineTo(a, b)
      ctx.closePath()
      break
    }
    case 'grid': {
      // The lit cells of the checkerboard inside the arena
      const c = h.width, o = ARENA_C - ARENA_R
      for (let gy = o; gy < ARENA_C + ARENA_R; gy += c)
        for (let gx = o; gx < ARENA_C + ARENA_R; gx += c) {
          if (Math.hypot(gx + c / 2 - ARENA_C, gy + c / 2 - ARENA_C) > ARENA_R || !gridLit(h, gx + c / 2, gy + c / 2)) continue
          ctx.rect(gx * TILE + 1, gy * TILE + 1, c * TILE - 2, c * TILE - 2)
        }
      break
    }
  }
}

/** A whirlwind on the ground: dust spinning round, darker in the middle. */
/** A pool of magma: a glowing, bubbling puddle that cools at the edges as it runs out. */
function drawPool(ctx: CanvasRenderingContext2D, h: Hazard, time: number) {
  const x = h.x * TILE, y = h.y * TILE, R = h.r * TILE
  const fade = Math.min(1, h.dur / 1.2)
  ctx.save()
  ctx.globalAlpha = fade
  const grd = ctx.createRadialGradient(x, y, R * 0.1, x, y, R)
  // Molten fire, or a crackling electric field
  const zap = h.type === 'electric', ice = h.type === 'ice'
  grd.addColorStop(0, zap ? 'rgba(235,250,255,0.85)' : ice ? 'rgba(250,254,255,0.85)' : 'rgba(255,230,140,0.9)')
  grd.addColorStop(0.45, zap ? 'rgba(80,190,255,0.7)' : ice ? 'rgba(170,225,255,0.7)' : 'rgba(255,120,30,0.8)')
  grd.addColorStop(0.85, zap ? 'rgba(30,70,170,0.6)' : ice ? 'rgba(70,130,200,0.55)' : 'rgba(160,40,10,0.7)')
  grd.addColorStop(1, zap ? 'rgba(10,20,60,0)' : ice ? 'rgba(20,40,80,0)' : 'rgba(40,10,6,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const rr = R * (0.88 + 0.1 * Math.sin(a * 3 + h.id + time * 1.5))
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.62
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  // Bubbles popping
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 5; i++) {
    const k = (time * 0.8 + i / 5 + h.id * 0.13) % 1
    const a = i * 2.4 + h.id
    ctx.fillStyle = zap ? `rgba(255,245,140,${(1 - k) * 0.9})` : ice ? `rgba(255,255,255,${(1 - k) * 0.8})` : `rgba(255,240,170,${(1 - k) * 0.8})`
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.3, 1 + k * 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawTornadoGround(ctx: CanvasRenderingContext2D, h: Hazard, time: number) {
  const x = h.x * TILE, y = h.y * TILE, R = h.r * TILE
  ctx.save()
  ctx.fillStyle = 'rgba(40,70,80,0.22)'
  ctx.beginPath()
  ctx.ellipse(x, y, R, R * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    const a = time * 7 + i * 2.1
    ctx.strokeStyle = `rgba(200,250,245,${0.5 - i * 0.12})`
    ctx.beginPath()
    ctx.ellipse(x, y, R * (1 - i * 0.22), R * 0.55 * (1 - i * 0.22), 0, a, a + 2.2)
    ctx.stroke()
  }
  ctx.restore()
}

/** The funnel of a whirlwind, rising from the ground (k grows it while it forms). */
function drawTornadoFunnel(ctx: CanvasRenderingContext2D, h: Hazard, time: number, k: number) {
  const x = h.x * TILE, y = h.y * TILE, R = h.r * TILE
  const H = 90 * k, n = 9
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1)
    const wob = Math.sin(time * 5 + f * 4 + h.id) * 6 * f
    const cy = y - f * H, rx = R * (0.35 + f * 1.1), ry = rx * 0.32
    const a = time * 9 + f * 3
    ctx.strokeStyle = `rgba(210,250,245,${(0.35 + 0.3 * (1 - f)) * k})`
    ctx.lineWidth = 2.5 - f
    ctx.beginPath()
    ctx.ellipse(x + wob, cy, rx, ry, 0, a, a + 4.2)
    ctx.stroke()
  }
  // Debris caught in the wind
  for (let i = 0; i < 7; i++) {
    const f = (time * 0.9 + i / 7) % 1
    const a = time * 8 + i * 2.4
    const rx = R * (0.4 + f * 1.1)
    disc(ctx, x + Math.cos(a) * rx, y - f * H + Math.sin(a) * rx * 0.3, 1.6, i % 2 ? '#e0fff8' : '#a0d8d0')
  }
  ctx.restore()
}

/** Telegraphs on the ground: the shape, a texture that moves, filling up until it hits. */
export function drawHazards(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  for (const h of g.hazards) {
    if (h.dur > 0 && h.t <= 0) {
      if (isPool(h)) drawPool(ctx, h, time)
      else drawTornadoGround(ctx, h, time)
      continue
    }
    // A sweep (Cross Flame) lays all its beams at once; only the next ones show in
    // full, a short while before they fire. The rest is a faint outline that shows
    // which way the sweep turns.
    const win = h.shape === 'line' && h.both ? Math.min(h.total, SWEEP_SHOW) : h.total
    if (h.t > win) {
      ctx.save()
      hazardPath(ctx, h)
      ctx.setLineDash([4, 6])
      ctx.lineWidth = 1.2
      ctx.strokeStyle = `rgba(${palOf(h.type, h.atk).rgb},0.3)`
      ctx.stroke()
      ctx.restore()
      continue
    }
    const k = Math.max(0, Math.min(1, 1 - h.t / win))
    const p = palOf(h.type, h.atk), col = p.rgb
    const pulse = 0.55 + 0.45 * Math.sin(time * 18)
    const x = h.x * TILE, y = h.y * TILE, R = Math.min(h.r, ARENA_R + 2) * TILE
    const ice = h.type === 'ice'
    ctx.save()
    // Whole area, then a brighter fill that grows with the countdown
    hazardPath(ctx, h)
    ctx.fillStyle = `rgba(${col},${0.14 + 0.12 * k})`
    ctx.fill('evenodd')
    ctx.fillStyle = `rgba(${col},${0.22 + 0.38 * k})`
    if (h.shape === 'circle' || h.shape === 'cone') {
      ctx.beginPath()
      if (h.shape === 'circle') ctx.arc(x, y, R * k, 0, Math.PI * 2)
      else {
        ctx.moveTo(x, y)
        ctx.arc(x, y, h.r * TILE * k, h.ang - h.width, h.ang + h.width)
        ctx.closePath()
      }
      ctx.fill()
    } else {
      ctx.globalAlpha = 0.4 + 0.6 * k
      hazardPath(ctx, h)
      ctx.fill('evenodd')
      ctx.globalAlpha = 1
    }

    // Moving texture inside the shape
    ctx.save()
    hazardPath(ctx, h)
    ctx.clip('evenodd')
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(${col},${0.25 + 0.4 * k})`
    ctx.lineWidth = 2
    if (h.shape === 'cone') {
      // Streaks racing outward from the boss
      ctx.setLineDash([10, 12])
      ctx.lineDashOffset = -time * 90
      for (let i = -3; i <= 3; i++) {
        const a = h.ang + (i / 3) * h.width * 0.9
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(a) * h.r * TILE, y + Math.sin(a) * h.r * TILE)
        ctx.stroke()
      }
      ctx.setLineDash([])
    } else if (h.shape === 'line') {
      // Chevrons running along the beam, and a hot core line
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang), px = -uy, py = ux
      const hw = (h.width / 2) * TILE * 0.7, gap = 20, back = (h.both ? h.r : 0.5) * TILE
      // Sweeps stay calmer: no chevrons, just the fill and the core line
      if (!h.both) for (let d = -back + ((time * 80) % gap); d < h.r * TILE; d += gap) {
        ctx.beginPath()
        ctx.moveTo(x + ux * (d - 7) + px * hw, y + uy * (d - 7) + py * hw)
        ctx.lineTo(x + ux * d, y + uy * d)
        ctx.lineTo(x + ux * (d - 7) - px * hw, y + uy * (d - 7) - py * hw)
        ctx.stroke()
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.2 + 0.6 * k})`
      ctx.lineWidth = 1 + 3 * k
      ctx.beginPath()
      ctx.moveTo(x - ux * back, y - uy * back)
      ctx.lineTo(x + ux * h.r * TILE, y + uy * h.r * TILE)
      ctx.stroke()
    } else {
      // Ripples drawn inward: energy gathering
      const inner = h.shape === 'ring' ? h.inner * TILE : 0
      for (let i = 0; i < 3; i++) {
        const f = 1 - ((time * 0.9 + i / 3) % 1)
        ctx.beginPath()
        ctx.arc(x, y, inner + (R - inner) * f, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.restore()

    // Glowing edge with marching dashes
    hazardPath(ctx, h)
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineWidth = 6
    ctx.strokeStyle = `rgba(${col},${0.2 + 0.35 * k})`
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.lineWidth = 3.5
    ctx.strokeStyle = `rgba(10,16,40,${0.3 + 0.3 * k})`
    ctx.stroke()
    ctx.setLineDash([7, 5])
    ctx.lineDashOffset = -time * 40
    ctx.lineWidth = 2
    ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.45 * pulse * k})`
    ctx.stroke()
    ctx.setLineDash([])

    // A rotating crown of flames / shards on rings
    if (h.shape === 'ring') {
      const mid = ((h.inner + Math.min(h.r, ARENA_R)) / 2) * TILE, n = 14
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * 1.4
        drawShape(ctx, ice ? 'shard' : 'flame', x + Math.cos(a) * mid, y + Math.sin(a) * mid - 3, 3 + 3 * k, p.cols[1 + (i % 3)], a + time * 3)
      }
    }
    // Vents glow and bubble before they blow
    if (h.atk === 'vent' || h.atk === 'eruption') {
      const zap = h.type === 'electric', ice = h.type === 'ice'
      drawGlow(ctx, x, y, 14 + 34 * k, zap ? '#4ab8ff' : ice ? '#bfeaff' : '#ff8020', 0.4 + 0.5 * k)
      for (let i = 0; i < 6; i++) {
        const f = (time * 2.2 + i * 0.37) % 1
        disc(ctx, x + Math.sin(i * 2.7) * R * 0.45, y + Math.cos(i * 1.9) * R * 0.3, 1 + f * 3 * (0.5 + k), zap ? (f < 0.8 ? '#8ae0ff' : '#ffffff') : ice ? (f < 0.8 ? '#d8f4ff' : '#ffffff') : f < 0.8 ? '#ffb040' : '#fff0a0')
      }
    }
    // Lightning rods: sparks crawl along the line between them
    if (h.atk === 'arc') {
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang)
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgba(255,240,140,${0.35 + 0.55 * k})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      const n = Math.ceil(h.r * 2)
      for (let i = 0; i <= n; i++) {
        const d = (i / n) * h.r * TILE, j = (Math.sin(time * 40 + i * 1.7) * 4 + Math.sin(time * 23 + i * 3.1) * 3) * (0.4 + k)
        const px = x + ux * d - uy * j, py = y + uy * d + ux * j - 18
        if (i) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      }
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    }
    // About to hit: the shape flashes white
    if (h.t < 0.22) {
      hazardPath(ctx, h)
      ctx.fillStyle = `rgba(255,255,255,${(1 - h.t / 0.22) * 0.45})`
      ctx.fill('evenodd')
    }
    ctx.restore()
  }
}

/** Delta Stream: streaks blowing across the arena and an arrow next to you. */
function drawWind(g: Game, ctx: CanvasRenderingContext2D, time: number, w: [number, number]) {
  const ang = Math.atan2(w[1], w[0]), ux = Math.cos(ang), uy = Math.sin(ang)
  const span = (ARENA_R + 4) * 2 * TILE, x0 = (ARENA_C - ARENA_R - 4) * TILE, y0 = x0
  ctx.save()
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < 70; i++) {
    // Each streak runs along the wind, wrapping round the arena square
    const along = (i * 61.7 + time * (380 + (i % 5) * 40)) % span
    const side = (i * 97.3) % span - span / 2
    const sx = x0 + span / 2 + ux * (along - span / 2) - uy * side, sy = y0 + span / 2 + uy * (along - span / 2) + ux * side
    const len = 14 + (i % 4) * 6
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx - ux * len, sy - uy * len)
  }
  // A dark edge under each white streak so it reads on the white cloud floor too
  ctx.strokeStyle = 'rgba(40,90,110,0.45)'
  ctx.lineWidth = 3.5
  ctx.stroke()
  ctx.strokeStyle = 'rgba(240,255,252,0.85)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // An arrow by your trainer so you know which way to fight it
  const p = g.player
  if (p?.alive) {
    const pulse = 0.6 + 0.4 * Math.sin(time * 8)
    const cx = p.x * TILE + ux * 26, cy = p.y * TILE - 20 + uy * 26
    ctx.translate(cx, cy)
    ctx.rotate(ang)
    ctx.fillStyle = `rgba(255,255,255,${0.75 * pulse + 0.2})`
    ctx.strokeStyle = 'rgba(20,60,70,0.8)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(10, 0)
    ctx.lineTo(-4, -8)
    ctx.lineTo(-4, -3)
    ctx.lineTo(-12, -3)
    ctx.lineTo(-12, 3)
    ctx.lineTo(-4, 3)
    ctx.lineTo(-4, 8)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Drawn above the actors: what is on its way (meteors, icicles, embers), the
 * blizzard closing in, and the boss charging up its attack.
 */
export function drawHazardsSky(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  if (g.raidView?.wind) drawWind(g, ctx, time, g.raidView.wind)
  if (!g.hazards.length) return
  const boss = g.wilds.find((w) => w.boss && !w.fainted)
  let charge: { h: Hazard; k: number } | null = null
  for (const h of g.hazards) {
    const k = Math.max(0, Math.min(1, 1 - h.t / h.total))
    const p = palOf(h.type, h.atk)
    const x = h.x * TILE, y = h.y * TILE
    const a = bossAttack(g, h.atk)
    if (h.dur > 0 && !isPool(h)) {
      // A tornado forming, then roaming
      drawTornadoFunnel(ctx, h, time, h.t > 0 ? k * 0.6 : Math.min(1, h.dur / 0.4))
      continue
    }
    if (a && (a.shape !== 'circle' || a.target === 'self') && !a.cover && (!charge || k > charge.k)) charge = { h, k }
    if (a?.cover) {
      // Blizzard: snow fog and wind sweeping the cave, thicker as it builds
      ctx.save()
      ctx.fillStyle = `rgba(225,242,255,${0.08 + 0.22 * k})`
      ctx.beginPath()
      ctx.arc(ARENA_C * TILE, ARENA_C * TILE, (ARENA_R + 3) * TILE, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.5 * k})`
      ctx.lineWidth = 1.5
      const span = (ARENA_R + 3) * 2 * TILE, x0 = (ARENA_C - ARENA_R - 3) * TILE, y0 = x0
      ctx.beginPath()
      for (let i = 0; i < 20 + 60 * k; i++) {
        const sx = x0 + ((i * 53.7 + time * (320 + (i % 7) * 30)) % span)
        const sy = y0 + ((i * 97.3 + time * 90) % span)
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - 16, sy - 5)
      }
      ctx.stroke()
      ctx.restore()
      continue
    }
    if (h.atk === 'vent' || h.atk === 'eruption') {
      // Embers and smoke rising out of the vent
      for (let i = 0; i < 6; i++) {
        const f = (time * 1.4 + i / 6) % 1
        drawGlow(ctx, x + Math.sin(i * 5 + time * 3) * 6, y - f * (20 + 40 * k), 4 + 3 * k, h.type === 'electric' ? '#7ad8ff' : h.type === 'ice' ? '#d8f4ff' : '#ff9030', (1 - f) * (0.4 + 0.5 * k))
      }
      continue
    }
    if (a?.target !== 'players' && h.atk !== 'icicle') continue
    // Something falls out of the sky onto each circle; its shadow grows on the ground
    const kk = Math.max(0, (k - 0.25) / 0.75)
    ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.2 * kk})`
    ctx.beginPath()
    ctx.ellipse(x, y, (4 + h.r * 6) * kk, (2 + h.r * 3) * kk, 0, 0, Math.PI * 2)
    ctx.fill()
    if (kk <= 0) continue
    const size = 3 + h.r * 1.8
    if (h.type === 'electric') {
      // A thundercloud gathers over the spot, flickering more as it charges
      const cy = y - 70, w = 10 + h.r * 9 * (0.5 + 0.5 * kk)
      ctx.fillStyle = `rgba(40,44,70,${0.5 + 0.35 * kk})`
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.ellipse(x + i * w * 0.35, cy + Math.abs(i) * 3, w * 0.4, w * 0.24, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      if (Math.sin(time * 37 + h.id * 7) > 0.6 - kk * 0.8) {
        drawGlow(ctx, x, cy, w * 1.2, p.glow, 0.35 * kk)
        ctx.strokeStyle = `rgba(255,245,170,${0.4 + 0.5 * kk})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(x + Math.sin(time * 50) * 6, cy + 6)
        ctx.lineTo(x + Math.sin(time * 31) * 8, cy + 18)
        ctx.lineTo(x + Math.sin(time * 43) * 5, cy + 28)
        ctx.stroke()
      }
    } else if (h.type === 'ice') {
      const ix = x + 24 * (1 - kk), iy = y - 4 - 230 * (1 - kk) * (1 - kk)
      drawGlow(ctx, ix, iy - size * 2, size * 4, p.glow, 0.7)
      ctx.fillStyle = '#4a88d0'
      ctx.strokeStyle = '#1a3060'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(ix - size * 1.1, iy - size * 4.4)
      ctx.lineTo(ix + size * 1.1, iy - size * 4.4)
      ctx.lineTo(ix, iy)
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = '#eaf8ff'
      ctx.beginPath()
      ctx.moveTo(ix - size * 0.9, iy - size * 4.4)
      ctx.lineTo(ix + size * 0.1, iy - size * 4.4)
      ctx.lineTo(ix, iy - 2)
      ctx.fill()
    } else {
      const mx = x + 80 * (1 - kk), my = y - 4 - 230 * (1 - kk) * (1 - kk)
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = p.glow + '99'
      ctx.lineCap = 'round'
      ctx.lineWidth = size * 1.8
      ctx.beginPath()
      ctx.moveTo(mx + 36, my - 100)
      ctx.lineTo(mx, my)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      drawGlow(ctx, mx, my, size * 4.5, p.glow, 0.9)
      disc(ctx, mx, my, size + 1.2, '#3a1a10')
      disc(ctx, mx, my, size, p.cols[2])
      disc(ctx, mx - size * 0.3, my - size * 0.3, size * 0.5, p.cols[0])
    }
  }
  // The boss gathers power for the attack it's about to unleash
  if (boss && charge) {
    const { h, k } = charge
    const p = palOf(h.type, h.atk)
    const bx = boss.x * TILE + Math.cos(h.ang) * 10, by = boss.y * TILE - 30 + Math.sin(h.ang) * 6
    drawGlow(ctx, bx, by, 26 + 60 * k, p.glow, 0.25 + 0.5 * k)
    drawCharge(ctx, h.fx, bx, by, k, time)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + time * 2.2
      const d = 70 * (1 - ((time * 1.6 + i / 12) % 1))
      disc(ctx, bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.7, 1.4 + k, p.cols[1 + (i % 3)])
    }
  }
}
