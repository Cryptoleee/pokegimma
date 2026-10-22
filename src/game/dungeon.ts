import { RAID_TIME, type BossAttack } from '../data/bosses'
import { TAKEN } from '../data/difficulty'
import { fightsIn, type DungeonDef, type FoeSpec, type Rect, type Relic, type Warden } from '../data/dungeons'
import { TYPE_COLOR } from '../data/types'
import { both, inBoth, L, tx } from '../i18n'
import { roleOf } from '../data/roles'
import { addHazard, raidIntro, type RaidState } from './boss'
import { Mon, type Trainer } from './entities'
import type { Game } from './game'
import { preloadMon } from './sprites'
import { ARENA_C, ARENA_R, T, TILE, type Gate } from './world'
import { coldLook } from './dungeonArt'

/**
 * Raid dungeons (host and solo): the run through the rooms before the boss.
 *
 * A room's packs stand waiting (some on patrol). Walk within PULL_RANGE of a
 * pack, or hit one of its members, and the whole pack comes for you, plus any
 * pack linked to it. A warden waits at the far end and has its own mechanics
 * and an enrage timer. The last room is a gauntlet of waves. When everything in
 * a room is down its gate opens; after the last one the arena gate opens, and
 * the first one inside wakes the boss: from there it's a classic raid (boss.ts).
 *
 * Inside a pack every foe has a job (role): brutes hit hard, casters cast fire
 * bolts (a circle under you, with a cast bar), menders heal the pack, guards
 * shield it. Casts can be interrupted: a melee, dash or ultimate hit, or two
 * hits of anything. Foes go for whoever made them angriest (threat): damage
 * done, and a Defender's damage counts triple, so a Defender can tank.
 */

/** Tiles: walk this close to a waiting pack and it comes for you. */
export const PULL_RANGE = 5.5
const WARDEN_PULL = 7

interface Pack {
  id: number
  members: Mon[]
  idle: boolean
  /** Pack id pulled along with this one. */
  link: number
  /** Patrol: back and forth between two spots. */
  patrol: { a: [number, number]; b: [number, number]; toB: boolean } | null
  done: boolean
}

export interface DungeonRun {
  def: DungeonDef
  /** The room being fought (or the next one to walk into). */
  room: number
  /** Something in the room has been pulled (the room's banner has shown). */
  started: boolean
  packs: Pack[]
  warden: Mon | null
  wardenDef: Warden | null
  wardenOn: boolean
  /** Warden: next telegraphed attack, cooldowns, help called in, seconds to enrage. */
  atkT: number
  cds: Record<string, number>
  calls: number
  enrageT: number
  enraged: boolean
  /** Living Bombs: the circle follows its target until just before it goes off. */
  bombs: { hz: number; tgt: Mon; x: number; y: number; linger?: { dur: number; dps: number } }[]
  /** Gauntlet: wave in the room, countdown to it, and whether it has begun. */
  wave: number
  waveT: number
  gauntlet: boolean
  /** Foes outside the packs: the warden's help and the gauntlet's waves. */
  adds: Mon[]
  /** 'rooms' → 'arena' (the arena gate is open) → 'boss'. */
  stage: 'rooms' | 'arena' | 'boss'
  /** Where you come back after fainting. */
  checkpoint: [number, number]
  /** Forge vents: next eruption. */
  ventT: number
  /** Fights won so far / in the whole dungeon (packs, wardens, waves). */
  fights: number
  total: number
  /** Team buffs from beaten wardens. */
  relics: Relic[]
  /** Seconds since the run started. */
  time: number
}

/** What every player sees of the run (synced in `rv`). */
export interface DungeonView {
  /** Room index (rooms.length = in the arena). */
  room: number
  /** Packs left / in the room. */
  packs: number
  packsAll: number
  /** Gauntlet: wave (1-based, 0 = not begun) and waves; countdown to the next. */
  wave: number
  waves: number
  next: number
  /** Foes up in the current wave or with the warden. */
  left: number
  /** Gates open (bit per gate). */
  gates: number
  stage: 0 | 1 | 2
  /** The warden's id (its health bar) once pulled, 0 = none; seconds to its enrage (-1 = enraged). */
  warden: number
  enrage: number
  lives: number
  fights: number
  total: number
  relics: Relic[]
}

const inRect = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad
const humansOf = (g: Game) => Math.max(1, g.trainers.filter((t) => t.human).length)
let packIds = 1

/** Set up the run: everyone at the dungeon's start, the boss waits out of sight. */
export function setupDungeon(g: Game, r: RaidState, def: DungeonDef, startRoom = 0) {
  const d: DungeonRun = {
    def, room: 0, started: false, packs: [], warden: null, wardenDef: null, wardenOn: false,
    atkT: 0, cds: {}, calls: 0, enrageT: 0, enraged: false, bombs: [], wave: 0, waveT: 0, gauntlet: false, adds: [],
    stage: 'rooms', checkpoint: [...def.start], ventT: 5, fights: 0, total: def.rooms.reduce((s, rm) => s + fightsIn(rm), 0), relics: [], time: 0,
  }
  r.dg = d
  // Dev and testing: start further in (?room=N), with the gates before it open
  for (let i = 0; i < Math.min(startRoom, def.rooms.length); i++) {
    g.world.gates[i].open = true
    g.world.gates[i].openAt = -10
    d.fights += fightsIn(def.rooms[i])
    d.room = i + 1
  }
  if (d.room > 0) d.checkpoint = d.room >= def.rooms.length ? [...def.arenaEntry] : roomEntry(def, d.room)
  if (d.room >= def.rooms.length) d.stage = 'arena'
  const [sx, sy] = d.checkpoint
  g.trainers.forEach((tr, i) => {
    const [x, y] = freeSpot(g, sx + (i - (g.trainers.length - 1) / 2) * 1.6, sy)
    tr.x = x
    tr.y = y
    tr.mon.x = x
    tr.mon.y = y + 0.8
    tr.lives = def.lives
  })
  for (const rm of def.rooms) for (const s of [...(rm.packs ?? []).flatMap((p) => p.foes), ...(rm.waves ?? []).flatMap((w) => w.foes), ...(rm.warden ? [rm.warden] : [])]) preloadMon(s.sp)
  if (d.stage === 'rooms') prepareRoom(g, d)
  r.timeLeft = RAID_TIME
}

/** Where a room is entered (the end of the hall that leads in). */
function roomEntry(def: DungeonDef, i: number): [number, number] {
  const gt = def.gates[i - 1], rm = def.rooms[i].rect
  const gx = gt.x + gt.w / 2, gy = gt.y + gt.h / 2
  // A couple of tiles past the gate, toward the room
  const cx = rm.x + rm.w / 2, cy = rm.y + rm.h / 2
  const dx = cx - gx, dy = cy - gy, dd = Math.hypot(dx, dy) || 1
  return [gx + (dx / dd) * 4, gy + (dy / dd) * 4]
}

/** A free spot near (x, y) (never in a wall, a rock or lava). */
export function freeSpot(g: Game, x: number, y: number): [number, number] {
  const ok = (x: number, y: number) =>
    [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].every(([dx, dy]) => !g.world.blocked(x + dx, y + dy)) && g.world.at(Math.floor(x), Math.floor(y)) !== T.LAVA
  for (let d = 0; d <= 5; d += 0.5)
    for (let k = 0; k < (d ? 16 : 1); k++) {
      const sx = x + Math.cos((k / 16) * Math.PI * 2) * d, sy = y + Math.sin((k / 16) * Math.PI * 2) * d
      if (ok(sx, sy)) return [sx, sy]
    }
  return [x, y]
}

/** The room you can now walk into: its packs take their places, its warden waits. */
function prepareRoom(g: Game, d: DungeonRun) {
  const room = d.def.rooms[d.room]
  d.packs = []
  d.started = false
  d.gauntlet = false
  d.wave = 0
  d.waveT = 0
  d.adds = []
  d.warden = null
  d.wardenDef = null
  d.wardenOn = false
  const ox = room.rect.x, oy = room.rect.y
  const ids: number[] = []
  for (const ps of room.packs ?? []) {
    const id = packIds++
    ids.push(id)
    const members: Mon[] = []
    const all = ps.foes.flatMap((s) => Array.from({ length: countOf(g, s.n) }, () => s))
    all.forEach((s, i) => {
      const a = (i / all.length) * Math.PI * 2 + 0.6
      const rr = all.length > 1 ? 1.1 + all.length * 0.12 : 0
      const [x, y] = freeSpot(g, ox + ps.at[0] + Math.cos(a) * rr, oy + ps.at[1] + Math.sin(a) * rr * 0.8)
      const m = makeFoe(g, s)
      m.pack = id
      m.idle = true
      place(g, m, x, y)
      members.push(m)
    })
    d.packs.push({ id, members, idle: true, link: 0, patrol: ps.patrol ? { a: [ox + ps.at[0], oy + ps.at[1]], b: [ox + ps.patrol[0], oy + ps.patrol[1]], toB: true } : null, done: false })
  }
  ;(room.packs ?? []).forEach((ps, i) => { if (ps.link != null) d.packs[i].link = ids[ps.link] })
  if (room.warden) {
    const wd = room.warden
    const m = makeFoe(g, { sp: wd.sp, n: 1, lv: wd.lv }, 3)
    m.bossMul = wd.hp * (1 + 0.75 * (humansOf(g) - 1)) * (g.diff === 'easy' ? 0.8 : g.diff === 'hard' ? 1.25 : 1)
    m.hp = m.maxHp
    m.idle = true
    const [x, y] = freeSpot(g, ox + wd.at[0], oy + wd.at[1])
    place(g, m, x, y)
    d.warden = m
    d.wardenDef = wd
  }
}

/** Host tick while the run is on. Returns true until the boss fight starts (then boss.ts takes over). */
export function dungeonTick(g: Game, r: RaidState, dt: number): boolean {
  const d = r.dg!
  if (d.stage === 'boss') return false
  d.time += dt
  const def = d.def
  const standing = g.trainers.filter((t) => t.alive && !t.mon.fainted)
  const near = (x: number, y: number, range: number) => standing.some((t) => Math.hypot(t.mon.x - x, t.mon.y - y) < range || Math.hypot(t.x - x, t.y - y) < range)

  if (d.stage === 'rooms') {
    const room = def.rooms[d.room]
    // Packs: walk too close and they come for you; patrols keep walking until then
    for (const p of d.packs) {
      p.members = p.members.filter((m) => !m.fainted && g.wilds.includes(m))
      if (!p.done && !p.members.length) {
        p.done = true
        d.fights++
      }
      if (!p.idle || p.done) continue
      if (p.members.some((m) => near(m.x, m.y, PULL_RANGE))) {
        pullPack(g, d, p, null)
        continue
      }
      if (p.patrol) {
        const [tx, ty] = p.patrol.toB ? p.patrol.b : p.patrol.a
        const lead = p.members[0]
        if (Math.hypot(lead.x - tx, lead.y - ty) < 0.8) p.patrol.toB = !p.patrol.toB
        p.members.forEach((m, i) => {
          m.goalX = tx + (i % 2 ? 0.9 : -0.9) * (i ? 1 : 0)
          m.goalY = ty + Math.floor(i / 2) * 0.9
        })
      }
    }
    // The warden: wakes when you come close (or hit it)
    if (d.warden && (d.warden.fainted || !g.wilds.includes(d.warden))) {
      if (d.wardenOn) d.fights++
      d.warden = null
    }
    if (d.warden && !d.wardenOn && near(d.warden.x, d.warden.y, WARDEN_PULL)) pullWarden(g, d)
    if (d.warden && d.wardenOn) wardenTick(g, d, dt, standing.map((t) => t.mon))
    // The gauntlet: waves once someone walks in
    if (room.waves) {
      if (!d.gauntlet && standing.some((t) => inRect(room.rect, t.x, t.y, -1)) && g.introT <= 0) {
        d.gauntlet = true
        d.waveT = 1.6
        roomBanner(g, d)
      } else if (d.gauntlet && d.waveT > 0) {
        d.waveT -= dt
        if (d.waveT <= 0) startWave(g, d)
      }
    }
    d.adds = d.adds.filter((m) => !m.fainted && g.wilds.includes(m))
    if (room.waves && d.gauntlet && d.waveT <= 0 && !d.adds.length && d.wave < room.waves.length) {
      d.wave++
      d.fights++
      if (d.wave < room.waves.length) {
        d.waveT = 3
        for (const v of g.viewers) v.hooks.toast(both('Wave cleared · the next one is coming', 'Wave verslagen · de volgende komt eraan'), '#ffd060')
      }
    }
    tickBombs(g, d)
    // The forge vents erupt while the forge is being fought
    if (room.deco === 'forge' && d.started && g.world.dvents.length) {
      d.ventT -= dt
      if (d.ventT <= 0) {
        d.ventT = 3.6 + Math.random() * 2.4
        const v = g.world.dvents[Math.floor(Math.random() * g.world.dvents.length)]
        addHazard(g, { shape: 'circle', x: v.x, y: v.y, ang: 0, r: 2.6, inner: 0, width: 1, t: 1.4, dmg: 0.24, fx: 'earthpower', type: 'fire', freeze: 0, cover: false, both: false, atk: 'vent' })
      }
    }
    if (d.started && d.def.theme.type !== 'fire') roomHazards(g, d, room.deco, dt)
    // Everything down: the gate opens
    const packsLeft = d.packs.some((p) => !p.done)
    const wavesLeft = !!room.waves && d.wave < room.waves.length
    if (!packsLeft && !d.warden && !wavesLeft && !d.adds.length) roomCleared(g, d)
  } else if (d.stage === 'arena') {
    // The first one into the arena wakes the boss
    if (standing.some((t) => Math.hypot(t.x - ARENA_C, t.y - ARENA_C) < ARENA_R - 2.5)) startBoss(g, r, d)
  }

  g.raidView = { timeLeft: r.timeLeft, phase: 0, dg: viewOf(g, d) }
  return (d.stage as string) !== 'boss'
}

/**
 * The Storm Tower's and the Citadel's rooms fight back. The tower: in the
 * flooded halls the charged pools discharge round their edges, in the dynamo
 * hall the coils arc to each other, and on the battlements lightning strikes
 * near whoever's fighting the waves. The citadel: holes in the ice frost over
 * and burst, icicles fall from the gallery's ceiling, and icy gusts sweep the
 * ice walls during the waves.
 */
function roomHazards(g: Game, d: DungeonRun, deco: string, dt: number) {
  const { rect } = d.def.rooms[d.room]
  const inRoom = (p: { x: number; y: number }) => p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h
  const base = { inner: 0, width: 1, freeze: 0, cover: false, both: false, type: 'electric' as const }
  const cold = { ...base, type: 'ice' as const }
  const here = () => g.trainers.filter((t) => t.alive && !t.mon.fainted && inRoom(t))
  d.ventT -= dt
  if (d.ventT > 0) return
  if (deco === 'frozen' || deco === 'icelake') {
    d.ventT = 3.6 + Math.random() * 2
    const holes = g.world.dsparks.filter((s) => s.k === 'puddle' && inRoom(s))
    for (let i = 0; i < Math.min(2, holes.length); i++) {
      const v = holes.splice(Math.floor(Math.random() * holes.length), 1)[0]
      addHazard(g, { ...cold, shape: 'circle', x: v.x, y: v.y, ang: 0, r: 3, t: 1.5 + i * 0.25, dmg: 0.2, freeze: 0.5, fx: 'blizzard', atk: 'vent' })
    }
  } else if (deco === 'icefall') {
    // Icicles: a shadow grows under each before it lands
    d.ventT = 3.2 + Math.random() * 1.4
    const t = here()[Math.floor(Math.random() * here().length)]
    if (!t) return
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, r = i ? 2 + Math.random() * 3.5 : Math.random()
      addHazard(g, { ...cold, shape: 'circle', x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, ang: 0, r: 1.5, t: 1.3 + i * 0.3, dmg: 0.14, fx: 'stoneedge', atk: 'icicle' })
    }
  } else if (deco === 'summit' && d.gauntlet) {
    // An icy gust across the walls, from one side, through whoever's there
    d.ventT = 3.4 + Math.random() * 1.4
    const t = here()[Math.floor(Math.random() * here().length)]
    if (!t) return
    const west = Math.random() < 0.5
    const x0 = west ? rect.x + 1 : rect.x + rect.w - 1
    addHazard(g, { ...cold, shape: 'line', x: x0, y: t.y, ang: west ? 0 : Math.PI, r: rect.w - 2, width: 1.6, t: 1.5, dmg: 0.15, fx: 'icebeam', atk: 'gust' })
  } else if (deco === 'flooded' || deco === 'cistern') {
    d.ventT = 3.4 + Math.random() * 2
    const pools = g.world.dsparks.filter((s) => s.k === 'puddle' && inRoom(s))
    for (let i = 0; i < Math.min(2, pools.length); i++) {
      const v = pools.splice(Math.floor(Math.random() * pools.length), 1)[0]
      addHazard(g, { ...base, shape: 'circle', x: v.x, y: v.y, ang: 0, r: 3, t: 1.4 + i * 0.25, dmg: 0.22, fx: 'discharge', atk: 'vent' })
    }
  } else if (deco === 'dynamo') {
    d.ventT = 3.2 + Math.random() * 1.8
    const coils = g.world.dsparks.filter((s) => s.k === 'coil' && inRoom(s))
    if (coils.length < 2) return
    // Two neighbouring coils (along one side of the square, never across it)
    const a = coils[Math.floor(Math.random() * coils.length)]
    const near = coils.filter((c) => c !== a && (Math.abs(c.x - a.x) < 1 || Math.abs(c.y - a.y) < 1))
    const b = near[Math.floor(Math.random() * near.length)]
    if (!b) return
    addHazard(g, { ...base, shape: 'line', x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x), r: Math.hypot(b.x - a.x, b.y - a.y), width: 1.4, t: 1.5, dmg: 0.3, fx: 'discharge', atk: 'arc' })
  } else if (deco === 'ramparts' && d.gauntlet) {
    d.ventT = 3 + Math.random() * 1.4
    const all = here()
    const t = all[Math.floor(Math.random() * all.length)]
    if (!t) return
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, r = i ? 2 + Math.random() * 3 : Math.random() * 1.5
      addHazard(g, { ...base, shape: 'circle', x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, ang: 0, r: 1.8, t: 1.25 + i * 0.3, dmg: 0.15, fx: 'thunder', atk: 'vent' })
    }
  } else d.ventT = 1
}

export function viewOf(g: Game, d: DungeonRun): DungeonView {
  const room = d.def.rooms[d.room]
  let gates = 0
  g.world.gates.forEach((gt, i) => { if (gt.open) gates |= 1 << i })
  return {
    room: d.room, packs: d.packs.filter((p) => !p.done).length, packsAll: d.packs.length,
    wave: d.gauntlet && room?.waves ? Math.min(d.wave + 1, room.waves.length) : 0, waves: room?.waves?.length ?? 0, next: d.waveT > 0 ? Math.ceil(d.waveT) : 0,
    left: d.adds.length + d.packs.reduce((s, p) => s + (p.idle ? 0 : p.members.length), 0),
    gates, stage: d.stage === 'rooms' ? 0 : d.stage === 'arena' ? 1 : 2,
    warden: d.warden && d.wardenOn ? d.warden.id : 0, enrage: d.enraged ? -1 : Math.max(0, Math.ceil(d.enrageT)),
    lives: d.def.lives, fights: d.fights, total: d.total, relics: d.relics,
  }
}

/** The first fight in a room: its name on screen. */
function roomBanner(g: Game, d: DungeonRun) {
  if (d.started) return
  d.started = true
  const room = d.def.rooms[d.room]
  const n = d.room + 1, of = d.def.rooms.length
  for (const v of g.viewers) {
    v.hooks.banner({ kind: 'storm', kicker: both('DUNGEON', 'DUNGEON'), title: inBoth(() => room.name), sub: both(`Room ${n} of ${of}`, `Kamer ${n} van ${of}`), color: '#ff8a3a' })
    v.sfx('siren')
  }
}

/** How many of a foe come (more players, more foes; the difficulty adds or takes a few). */
function countOf(g: Game, n: number) {
  const k = (1 + 0.5 * (humansOf(g) - 1)) * (g.diff === 'easy' ? 0.75 : g.diff === 'hard' ? 1.3 : 1)
  return Math.max(1, Math.round(n * k))
}

/** A pack (or a lone foe) comes for you: the whole pack, plus any pack linked to it. */
export function pullPack(g: Game, d: DungeonRun, p: Pack, by: Trainer | null) {
  if (!p.idle) return
  p.idle = false
  roomBanner(g, d)
  for (const m of p.members) {
    m.idle = false
    m.thinkT = 0.4 + Math.random() * 0.5
    m.roleT = 1.5 + Math.random() * 2
    if (by) addThreat(m, by, 4)
  }
  const lead = p.members[0]
  if (lead) {
    g.callout(lead, both('!', '!'), '#ff5040')
    g.soundAt(lead.x, lead.y, 'boss', ['charge', d.def.theme.fx, 0.4, 0.4], { range: 20 })
  }
  // An overpull: the linked pack joins in
  const linked = d.packs.find((x) => x.id === p.link) ?? d.packs.find((x) => x.link === p.id)
  if (linked && linked.idle) {
    for (const v of g.viewers) v.hooks.toast(both('The pack next door heard that!', 'De groep ernaast hoorde het ook!'), '#ff7050')
    pullPack(g, d, linked, by)
  }
}

/** Something hit a foe that was still waiting: its pack (or the warden) wakes. */
export function foeHit(g: Game, m: Mon, by: Trainer | null, dmg: number) {
  const d = g.raid?.dg
  if (!d) return
  if (by) addThreat(m, by, dmg)
  if (!m.idle) return
  if (m === d.warden) return pullWarden(g, d)
  const p = d.packs.find((x) => x.id === m.pack)
  if (p) pullPack(g, d, p, by)
}

/** Threat: damage done; a Defender's counts triple (they tank), an All-rounder's a bit more. */
function addThreat(m: Mon, by: Trainer, amount: number) {
  m.threat ??= new Map()
  const role = roleOf(by.mon.species.id)
  m.threat.set(by, (m.threat.get(by) ?? 0) + amount * (role === 'defender' ? 3 : role === 'allrounder' ? 1.3 : 1))
}

/** Who a dungeon foe goes for: the angriest-at player still standing nearby, else the nearest. */
export function foeTarget(g: Game, w: Mon): Mon | null {
  let best: Mon | null = null, bt = -1, near: Mon | null = null, nd = 24
  for (const tr of g.trainers) {
    if (!tr.alive || tr.mon.fainted) continue
    const m = tr.mon, dist = Math.hypot(m.x - w.x, m.y - w.y)
    if (dist > 26) continue
    if (dist < nd) { nd = dist; near = m }
    const t = w.threat?.get(tr) ?? 0
    if (t > bt && t > 0) { bt = t; best = m }
  }
  return best ?? near
}

/**
 * A foe's job, every frame (host). Returns true while it's busy casting (it
 * stands still and doesn't attack).
 */
export function roleTick(g: Game, w: Mon, target: Mon | null, dt: number): boolean {
  if (w.cast) {
    const c = w.cast
    c.t -= dt
    w.castT = 0.3
    if (c.t > 0) return true
    w.cast = null
    if (c.kind === 'heal' && c.tgt && !c.tgt.fainted) {
      const t = c.tgt
      t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.3)
      g.addFxPublic({ kind: 'heal', x: t.x, y: t.y - 0.5, t: 0, life: 0.8, color: '#70f090' })
      g.vfx.ring(t.x, t.y - 0.3, 1.6, '#70f090', 0.5, 5)
      g.vfx.burst(t.x, t.y - 0.6, { n: 14, speed: 3, dir: -Math.PI / 2, spread: 1.2, cols: ['#ffffff', '#a0ffb0', '#40d060'], shape: 'star', add: true, s0: 3, s1: 0.5, life: 0.6 })
      g.soundAt(t.x, t.y, 'heal', [], { range: 16 })
    }
    return false
  }
  if (!w.role || !target || w.role === 'brute' || w.role === 'guard') return false
  w.roleT -= dt
  if (w.roleT > 0) return false
  if (w.role === 'caster') {
    if (Math.hypot(target.x - w.x, target.y - w.y) > 10) return false
    w.roleT = 4.5 + Math.random() * 2
    const warn = 1.6
    const dmg = 0.2 * (g.diff === 'hard' ? 1.25 : g.diff === 'easy' ? 0.8 : 1)
    const th = g.raid!.dg!.def.theme
    addHazard(g, { shape: 'circle', x: target.x, y: target.y, ang: 0, r: 1.7, inner: 0, width: 1, t: warn, dmg, fx: th.fx, type: th.type, freeze: 0, cover: false, both: false, atk: 'f_bolt' })
    w.cast = { kind: 'bolt', t: warn, total: warn, hits: 0, tgt: target, hz: g.hazards[g.hazards.length - 1].id }
    w.aimX = target.x - w.x
    w.aimY = target.y - w.y
    w.aimT = warn
    g.soundAt(w.x, w.y, 'moveCharge', [th.fx, 2, warn], { range: 18 })
    return true
  }
  // Mender: heal the packmate that needs it most
  let low: Mon | null = null, lk = 0.8
  for (const o of g.wilds) {
    if (!o.foe || o.fainted || o.idle || Math.hypot(o.x - w.x, o.y - w.y) > 9) continue
    const k = o.hp / o.maxHp
    if (k < lk) { lk = k; low = o }
  }
  if (!low) {
    w.roleT = 1
    return false
  }
  w.roleT = 6 + Math.random() * 2
  w.cast = { kind: 'heal', t: 2.2, total: 2.2, hits: 0, tgt: low, hz: 0 }
  g.callout(w, both('Healing!', 'Genezen!'), '#70f090')
  return true
}

/**
 * A casting foe got hit: a melee, dash or ultimate hit breaks the cast at once,
 * anything else after the second hit. Its fire bolt fizzles.
 */
export function castHit(g: Game, w: Mon, kind: string, tier: number) {
  const c = w.cast
  if (!c) return
  c.hits++
  if (!(kind === 'melee' || kind === 'dash' || kind === 'burst' || tier >= 3 || c.hits >= 2)) return
  if (c.kind === 'bolt') g.hazards = g.hazards.filter((h) => h.id !== c.hz)
  w.cast = null
  w.roleT = 3
  g.addFxPublic({ kind: 'callout', x: w.x, y: w.y - 2.2, t: 0, life: 1, color: '#ffe060', text: both('Interrupted!', 'Onderbroken!'), big: true })
  g.vfx.burst(w.x, w.y - 0.8, { n: 12, speed: 5, cols: ['#ffffff', '#ffe060'], shape: 'star', add: true, s0: 3, s1: 0.5, life: 0.4 })
  g.soundAt(w.x, w.y, 'clink', [], { range: 18 })
}

/** Guards shield the foes around them: hits on those do less. */
export function guardShield(g: Game, tgt: Mon) {
  if (!tgt.foe) return 1
  for (const o of g.wilds) if (o.role === 'guard' && o !== tgt && !o.fainted && o.pack === tgt.pack && tgt.pack && Math.hypot(o.x - tgt.x, o.y - tgt.y) < 4.5) return 0.6
  for (const o of g.wilds) if (o.role === 'guard' && o !== tgt && !o.fainted && !o.pack && !tgt.pack && Math.hypot(o.x - tgt.x, o.y - tgt.y) < 4.5) return 0.6
  return 1
}

/** Team relics: what the beaten wardens left. */
export function relicMul(g: Game, kind: 'dmg' | 'def') {
  const rel = g.raid?.dg?.relics
  if (!rel?.length) return 1
  const n = rel.filter((r) => r === (kind === 'dmg' ? 'ember' : 'shell')).length
  return kind === 'dmg' ? 1 + 0.15 * n : 1 - 0.15 * n
}

/** A gauntlet wave: foes burst out of the ground around the room. */
function startWave(g: Game, d: DungeonRun) {
  const room = d.def.rooms[d.room]
  const w = room.waves![d.wave]
  for (const s of w.foes) for (let i = 0; i < countOf(g, s.n); i++) d.adds.push(spawnFoe(g, s, room.rect))
  for (const v of g.viewers) {
    v.hooks.banner(w.final
      ? { kind: 'legendary', kicker: both('THE LAST STAND', 'HET LAATSTE GEVECHT'), title: both('FINAL WAVE', 'LAATSTE WAVE'), sub: both('Then the way to the legendary is open', 'Daarna ligt de weg naar de legende open'), color: '#ff5030' }
      : { kind: 'storm', kicker: inBoth(() => room.name.toUpperCase()), title: both(`Wave ${d.wave + 1}`, `Wave ${d.wave + 1}`), sub: both(`${d.adds.length} foes`, `${d.adds.length} vijanden`), color: '#ffb040' })
    v.sfx('warn')
  }
}

/** A dungeon foe: tougher with more players, its damage set by its job and the difficulty. */
function makeFoe(g: Game, s: FoeSpec, kind: 1 | 2 | 3 = s.elite ? 2 : 1) {
  const m = new Mon(s.sp, s.lv + (g.diff === 'hard' ? 2 : g.diff === 'easy' ? -2 : 0))
  m.foe = kind
  m.role = s.role ?? ''
  const roleHp = s.role === 'brute' ? 1.5 : s.role === 'guard' ? 1.4 : s.role === 'caster' || s.role === 'mender' ? 0.85 : 1
  const roleDmg = s.role === 'brute' ? 1.35 : s.role === 'caster' ? 0.9 : s.role === 'mender' ? 0.6 : s.role === 'guard' ? 0.8 : 1
  m.bossMul = (kind === 2 ? 3.2 : 1.25) * roleHp * (1 + 0.3 * (humansOf(g) - 1))
  m.dmgMul = (kind === 3 ? 0.42 : kind === 2 ? 0.52 : 0.4) * roleDmg * TAKEN[g.diff]
  m.hp = m.maxHp
  m.aggressive = true
  m.legendary = false
  m.thinkT = 0.6 + Math.random() * 0.6
  m.roleT = 2 + Math.random() * 2
  preloadMon(s.sp)
  return m
}

function place(g: Game, m: Mon, x: number, y: number) {
  m.x = m.homeX = m.goalX = x
  m.y = m.homeY = m.goalY = y
  m.state = 'aggro'
  m.aggroT = 999
  g.wilds.push(m)
}

/** A foe of a wave or a warden's call: somewhere in the room, not on top of anyone, in a burst of embers. */
function spawnFoe(g: Game, f: FoeSpec, rect: Rect) {
  const m = makeFoe(g, f)
  const players = g.trainers.filter((t) => t.alive)
  let best: [number, number] = [rect.x + rect.w / 2, rect.y + rect.h / 2], bd = -1
  for (let k = 0; k < 14; k++) {
    const [x, y] = freeSpot(g, rect.x + 2 + Math.random() * (rect.w - 4), rect.y + 2 + Math.random() * (rect.h - 4))
    if (!inRect(rect, x, y)) continue
    const near = Math.min(...players.map((t) => Math.hypot(t.x - x, t.y - y)), 99)
    const score = near < 5 ? near : 10 - Math.abs(near - 9) * 0.3 + Math.random() * 2
    if (score > bd) { bd = score; best = [x, y] }
  }
  place(g, m, best[0], best[1])
  const th = g.raid!.dg!.def.theme
  g.vfx.mark(best[0], best[1])
  g.vfx.ring(best[0], best[1], f.elite ? 2.2 : 1.4, th.burst[1], 0.5, 5)
  g.vfx.burst(best[0], best[1] - 0.3, { n: f.elite ? 22 : 12, speed: 5, dir: -Math.PI / 2, spread: 1.4, cols: th.burst, shape: th.type === 'fire' ? 'flame' : th.type === 'ice' ? 'shard' : 'streak', add: true, s0: 3, s1: 0.6, life: 0.5 })
  g.soundAt(best[0], best[1], 'boss', ['vent', th.fx, f.elite ? 0.7 : 0.4], { range: 22 })
  if (f.elite) g.callout(m, both(`★ ${m.name}`, `★ ${m.name}`), '#ffb040')
  return m
}

/** A foe went down: off the field (never catchable); elites and wardens leave a potion, a common foe now and then. */
export function foeDown(g: Game, m: Mon) {
  const i = g.wilds.indexOf(m)
  if (i >= 0) g.wilds.splice(i, 1)
  m.cast = null
  g.addFxPublic({ kind: 'poof', x: m.x, y: m.y - 0.4, t: 0, life: 0.4, color: '#ffb060' })
  g.vfx.burst(m.x, m.y - 0.4, { n: m.foe >= 2 ? 26 : 12, speed: 5, cols: ['#ffffff', '#ffd080', '#ff8030'], shape: 'flame', add: true, s0: 3, s1: 0.5, life: 0.5 })
  const drop = m.foe === 2 || Math.random() < 0.05
  if (drop && g.items.filter((it) => it.kind === 'potion').length < 4) {
    g.items.push({ x: m.x, y: m.y, kind: 'potion', bob: 0 })
    g.soundAt(m.x, m.y, 'spawnChime', [], { range: 20 })
  }
  if (m.foe === 3) wardenDown(g, m)
}

/** A warden wakes: its name on screen, the fight is on, the enrage timer runs. */
function pullWarden(g: Game, d: DungeonRun) {
  const m = d.warden, wd = d.wardenDef
  if (!m || !wd || d.wardenOn) return
  d.wardenOn = true
  m.idle = false
  d.atkT = 2.5
  d.cds = {}
  d.calls = 0
  d.enrageT = wd.enrage * (g.diff === 'easy' ? 1.3 : g.diff === 'hard' ? 0.85 : 1)
  d.enraged = false
  roomBanner(g, d)
  // Everything else in the room joins in too
  for (const p of d.packs) if (p.idle && !p.done) pullPack(g, d, p, null)
  g.vfx.mark(m.x, m.y)
  const th = d.def.theme
  g.vfx.ring(m.x, m.y, 4, th.accent, 0.8, 8)
  g.vfx.glow(m.x, m.y - 1, 90, th.accent, 0.6)
  g.vfx.shakeBy(6)
  for (const v of g.viewers) {
    v.cry(wd.sp, 0.5)
    v.hooks.banner({ kind: 'legendary', kicker: both('⚔ WARDEN ⚔', '⚔ WACHTER ⚔'), title: both(`${m.name} blocks the way!`, `${m.name} verspert de weg!`), sub: inBoth(() => `${wd.title} · ${L('enrages in', 'woedend over')} ${Math.round(d.enrageT)} s`), mon: wd.sp, color: th.accent })
  }
  g.soundAt(m.x, m.y, 'boss', ['intro', th.fx], { global: true })
}

/** The warden is down: a relic for the team, a life back, potions. */
function wardenDown(g: Game, m: Mon) {
  const d = g.raid?.dg
  g.vfx.flash(0.4, '255,200,140')
  g.vfx.shakeBy(8)
  g.vfx.ring(m.x, m.y, 5, '#ffd060', 0.9, 9)
  if (!d || !d.wardenDef) return
  g.soundAt(m.x, m.y, 'boss', ['down', d.def.theme.fx], { global: true })
  const relic = d.wardenDef.relic
  d.relics.push(relic)
  for (let k = 0; k < humansOf(g); k++) g.items.push({ x: m.x + (k - (humansOf(g) - 1) / 2) * 1.2, y: m.y + 1, kind: 'potion', bob: 0 })
  for (const tr of g.trainers)
    if (tr.alive && tr.lives < d.def.lives) tr.lives++
  const named = d.def.theme.relics[relic]
  const name = inBoth(named)
  const what = relic === 'ember' ? both('+15% damage for the team', '+15% schade voor het team') : both('15% less damage taken by the team', '15% minder schade voor het team')
  for (const v of g.viewers) {
    v.hooks.banner({ kind: 'win', kicker: both('LOOT', 'BUIT'), title: name, sub: inBoth(() => `${tx(what)} · ${L('+1 life', '+1 leven')}`), mon: m.species.id, color: '#ffd040' })
    v.hooks.feed(both(`⚔️ ${m.name} is down!`, `⚔️ ${m.name} is verslagen!`), { mon: m.species.id, kind: 'boss' })
    v.sfx('loot')
  }
}

/** The warden: telegraphed attacks, help called in as it weakens, and the enrage timer. */
function wardenTick(g: Game, d: DungeonRun, dt: number, foes: Mon[]) {
  const w = d.warden!, wd = d.wardenDef!
  for (const k in d.cds) d.cds[k] = Math.max(0, d.cds[k] - dt)
  d.enrageT -= dt
  if (!d.enraged && d.enrageT <= 0) {
    d.enraged = true
    w.dmgMul *= 1.6
    w.tintCol = '#ff3020'
    w.tintT = 999
    g.vfx.flash(0.35, '255,60,30')
    g.vfx.shakeBy(8)
    for (const v of g.viewers) {
      v.cry(w.species.id, 0.6)
      v.hooks.banner({ kind: 'storm', kicker: both('ENRAGED', 'WOEDEND'), title: both(`${w.name} is enraged!`, `${w.name} is woedend!`), sub: both('Faster and harder: finish it!', 'Sneller en harder: maak het af!'), color: '#ff3020' })
    }
  }
  const ratio = w.hp / w.maxHp
  const call = wd.calls?.[d.calls]
  if (call && ratio < call.at) {
    d.calls++
    const room = d.def.rooms[d.room]
    for (const s of call.foes) for (let i = 0; i < countOf(g, s.n); i++) {
      const m = spawnFoe(g, s, room.rect)
      m.pack = 0
      d.adds.push(m)
    }
    g.callout(w, both('To me!', 'Help!'), '#ff8a3a')
    for (const v of g.viewers) v.cry(w.species.id, 0.4)
  }
  if (!foes.length || w.frozenT > 0) return
  d.atkT -= dt
  if (d.atkT > 0) return
  const ready = wd.attacks.filter((a) => !(d.cds[a.id] > 0))
  if (!ready.length) return
  let roll = Math.random() * ready.reduce((s, a) => s + a.weight, 0)
  const a = ready.find((x) => (roll -= x.weight) <= 0) ?? ready[0]
  d.cds[a.id] = a.cd * (d.enraged ? 0.6 : 1)
  d.atkT = (3.2 - 0.8 * (1 - ratio)) * (d.enraged ? 0.55 : 1) + a.warn * (a.follow ? 0.4 : 1)
  castWarden(g, d, w, a, foes)
}

function castWarden(g: Game, d: DungeonRun, w: Mon, a: BossAttack, foes: Mon[]) {
  let near = foes[0], nd = Infinity
  for (const f of foes) {
    const dd = Math.hypot(f.x - w.x, f.y - w.y)
    if (dd < nd) { nd = dd; near = f }
  }
  const ang = Math.atan2(near.y - w.y, near.x - w.x)
  const dmg = a.dmg * (d.enraged ? 1.4 : 1)
  const base = { ang: 0, r: a.r ?? 2, inner: a.inner ?? 0, width: a.width ?? 1, dmg, fx: a.fx, type: a.type, freeze: 0, cover: false, both: false, atk: a.id }
  const linger = a.linger && !a.follow ? { dur: a.linger.dur, dps: a.linger.dps } : {}
  w.holdT = a.follow ? 0.6 : a.warn + 0.2
  w.castT = 0.9
  w.aimX = Math.cos(ang)
  w.aimY = Math.sin(ang)
  w.aimT = a.warn
  g.callout(w, inBoth(() => a.name), TYPE_COLOR[a.type])
  for (const v of g.viewers) if (Math.hypot(v.camX - w.x, v.camY - w.y) < 20) v.sfx('warn')
  g.soundAt(w.x, w.y, 'boss', ['charge', a.fx, 0.8, a.warn], { range: 30 })
  if (a.follow) {
    // Living Bomb: on someone, and it follows them: run away from your friends (and out of the fire it leaves)
    const tgt = foes[Math.floor(Math.random() * foes.length)]
    addHazard(g, { ...base, shape: 'circle', x: tgt.x, y: tgt.y, t: a.warn })
    d.bombs.push({ hz: g.hazards[g.hazards.length - 1].id, tgt, x: tgt.x, y: tgt.y, linger: a.linger })
    const v = g.vOf(tgt.owner)
    v?.hooks.toast(inBoth(() => L(`${a.name} on you: get away from the others!`, `${a.name} op jou: weg bij de anderen!`)), '#ff5030')
    v?.sfx('siren')
    return
  }
  if (a.shape === 'cone') addHazard(g, { ...base, shape: 'cone', x: w.x, y: w.y, ang, r: a.len ?? 8, t: a.warn })
  else if (a.shape === 'ring') addHazard(g, { ...base, shape: 'ring', x: w.x, y: w.y, t: a.warn })
  else if (a.shape === 'line') addHazard(g, { ...base, shape: 'line', x: w.x, y: w.y, ang, r: a.len ?? 12, t: a.warn })
  else if (a.target === 'self') addHazard(g, { ...base, shape: 'circle', x: w.x, y: w.y, t: a.warn })
  else {
    const rect = d.def.rooms[d.room].rect
    const spots: [number, number][] = a.target === 'nearest' ? [[near.x, near.y]] : foes.map((f) => [f.x, f.y])
    for (let i = 0; i < (a.extra ?? 0); i++) spots.push([rect.x + 2 + Math.random() * (rect.w - 4), rect.y + 2 + Math.random() * (rect.h - 4)])
    spots.forEach(([x, y], i) => addHazard(g, { ...base, ...linger, shape: 'circle', x, y, t: a.warn + i * (a.stagger ?? 0) }))
  }
}

/** Living Bombs follow their target, lock in just before they go off, and leave a pool of fire. */
function tickBombs(g: Game, d: DungeonRun) {
  d.bombs = d.bombs.filter((b) => {
    const h = g.hazards.find((x) => x.id === b.hz)
    if (h) {
      if (h.t > 0.55 && !b.tgt.fainted) {
        h.x = b.x = b.tgt.x
        h.y = b.y = b.tgt.y
      }
      return true
    }
    const th = d.def.theme
    if (b.linger) addHazard(g, { shape: 'circle', x: b.x, y: b.y, ang: 0, r: 2.2, inner: 0, width: 1, t: 0.05, dmg: 0, fx: th.fx, type: th.type, freeze: 0, cover: false, both: false, atk: 'pool', dur: b.linger.dur, dps: b.linger.dps })
    return false
  })
}

/** The room is empty: its gate opens, the fallen come back, a short breather. */
function roomCleared(g: Game, d: DungeonRun) {
  const i = d.room
  openGate(g, i)
  const last = i === d.def.rooms.length - 1
  d.room++
  d.checkpoint = last ? [...d.def.arenaEntry] : roomEntry(d.def, d.room)
  // A breather: everyone standing gets a little health back; whoever ran out of lives is back with one
  for (const tr of g.trainers) {
    if (!tr.alive || tr.mon.fainted) continue
    const m = tr.mon
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.15)
    g.addFxPublic({ kind: 'heal', x: m.x, y: m.y - 0.5, t: 0, life: 0.7, color: '#80f080' })
  }
  for (const tr of g.trainers) {
    if (tr.alive || !tr.human) continue
    revive(g, tr, d)
  }
  if (last) {
    d.stage = 'arena'
    d.packs = []
    d.adds = []
    d.warden = null
  } else prepareRoom(g, d)
  for (const v of g.viewers) {
    v.hooks.banner(last
      ? { kind: 'legendary', kicker: both('DUNGEON', 'DUNGEON'), title: both('THE WAY IS OPEN', 'DE WEG IS VRIJ'), sub: both(`${g.raid!.def.name} waits in the crater…`, `${g.raid!.def.name} wacht in de krater…`), mon: g.raid!.def.species, color: g.raid!.def.color }
      : { kind: 'win', kicker: both('DUNGEON', 'DUNGEON'), title: both('Room cleared!', 'Kamer veroverd!'), sub: both('The gate is open · on to the next room', 'De poort is open · door naar de volgende kamer'), color: '#ffd040' })
    v.sfx('loot')
  }
}

/** A gate crumbles into the floor. */
export function openGate(g: Game, i: number) {
  const gt = g.world.gates[i]
  if (!gt || gt.open) return
  gt.open = true
  gt.openAt = g.time
  const x = gt.x + gt.w / 2, y = gt.y + gt.h / 2
  g.vfx.mark(x, y)
  g.vfx.shakeBy(7)
  g.vfx.burst(x, y - 0.5, { n: 30, speed: 6, cols: ['#3a3038', '#58484c', '#ff9040', '#ffd080'], shape: 'rock', s0: 3, s1: 1, life: 0.9, grav: 9 })
  g.vfx.glow(x, y - 0.5, 70, '#ff8030', 0.6)
  g.soundAt(x, y, 'boss', ['quake', 'earthpower', 0.9], { global: true })
}

/** Out of lives, but the team cleared a room: back in with one life. */
function revive(g: Game, tr: Trainer, d: DungeonRun) {
  tr.alive = true
  tr.lives = 1
  tr.spectate = null
  if (tr.isPlayer) g.spectate = null
  respawnAt(g, tr, d.checkpoint)
  for (const v of g.viewers) v.hooks.feed(both(`💫 ${tr.name} is back in the dungeon`, `💫 ${tr.name} is terug in de dungeon`), { kind: 'info' })
}

/** Back on your feet at the checkpoint (or wherever the run says). */
export function respawnAt(g: Game, tr: Trainer, at: [number, number]) {
  const [x, y] = freeSpot(g, at[0] + (Math.random() - 0.5) * 2, at[1] + (Math.random() - 0.5) * 2)
  tr.x = x
  tr.y = y
  const m = tr.mon
  m.hp = m.maxHp
  m.frozenT = 0
  g.sendOut(tr, tr.active)
  m.revealT = 0
  g.vfx.mark(m.x, m.y)
  g.vfx.ring(m.x, m.y - 0.2, 1.6, '#ffffff', 0.5, 6)
}

/** Everyone's in the arena: the boss wakes up and the raid clock starts. */
function startBoss(g: Game, r: RaidState, d: DungeonRun) {
  d.stage = 'boss'
  d.checkpoint = [...d.def.arenaEntry]
  for (const m of [...g.wilds]) if (m.foe) foeDown(g, m)
  g.hazards = []
  g.wilds.push(r.boss)
  r.timeLeft = RAID_TIME
  r.nextT = 4.5
  r.moveT = 3
  // Close the arena behind you? No: a late teammate must still get in
  raidIntro(g)
  g.vfx.flash(0.5, '255,240,220')
  for (const v of g.viewers) {
    v.hooks.banner({ kind: 'legendary', kicker: both('★ RAID BOSS ★', '★ RAIDBAAS ★'), title: both(`${r.def.name} awakens!`, `${r.def.name} ontwaakt!`), sub: inBoth(() => r.def.title), mon: r.def.species, color: r.def.color })
    v.sfx('legendary')
  }
  g.raidView = { timeLeft: r.timeLeft, phase: 0, dg: viewOf(g, d) }
}

// ---------------------------------------------------------------- drawing

/** Is the gate still there to draw (closed, or sinking into the floor)? */
export const gateShown = (gt: Gate, time: number) => !gt.open || time - gt.openAt < 1.4

/** A gate: a slab of dark stone with glowing runes; an opened one sinks into the floor. */
export function drawGate(ctx: CanvasRenderingContext2D, gt: Gate, time: number) {
  // The Storm Tower's gates hum blue
  const st = coldLook()
  {
    const age = gt.open ? time - gt.openAt : -1
    const sink = gt.open ? Math.min(1, age / 1.1) : 0
    const x = gt.x * TILE, y = gt.y * TILE, w = gt.w * TILE, h = gt.h * TILE
    const tall = 22 * (1 - sink)
    ctx.save()
    ctx.globalAlpha = 1 - sink * 0.6
    // The slab: a face rising above the gate's tiles
    ctx.fillStyle = '#1e181c'
    ctx.fillRect(x, y - tall, w, h + tall)
    ctx.fillStyle = '#2e2428'
    for (let bx = 0; bx < w; bx += 8) for (let by = -tall; by < h; by += 8) if (((bx + by) / 8) % 2 === 0) ctx.fillRect(x + bx + 1, y + by + 1, 6, 6)
    // Molten seams and a rune that pulses
    const pulse = 0.55 + 0.45 * Math.sin(time * 3 + gt.x)
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = st ? `rgba(${60 + 60 * pulse},${170 + 40 * pulse},255,${0.55 * (1 - sink)})` : `rgba(255,${110 + 60 * pulse},40,${0.55 * (1 - sink)})`
    ctx.fillRect(x, y + h - 2, w, 2)
    ctx.fillRect(x, y - tall, w, 2)
    const rx = x + w / 2, ry = y + h / 2 - tall / 2
    ctx.fillStyle = st ? `rgba(200,240,255,${0.8 * pulse * (1 - sink)})` : `rgba(255,170,60,${0.8 * pulse * (1 - sink)})`
    ctx.beginPath()
    ctx.moveTo(rx, ry - 6)
    ctx.lineTo(rx + 4, ry)
    ctx.lineTo(rx, ry + 6)
    ctx.lineTo(rx - 4, ry)
    ctx.closePath()
    ctx.fill()
    const glow = ctx.createRadialGradient(rx, ry, 0, rx, ry, 26)
    glow.addColorStop(0, st ? `rgba(80,180,255,${0.35 * pulse * (1 - sink)})` : `rgba(255,120,40,${0.35 * pulse * (1 - sink)})`)
    glow.addColorStop(1, st ? 'rgba(80,180,255,0)' : 'rgba(255,120,40,0)')
    ctx.fillStyle = glow
    ctx.fillRect(rx - 26, ry - 26, 52, 52)
    ctx.restore()
  }
}

/** A brazier: an iron bowl on a stand with a fire that never goes out. */
export function drawBrazier(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const px = Math.round(x), py = Math.round(y)
  // The Storm Tower's braziers burn with caught lightning
  const st = coldLook()
  const [c0, c1, c2, c3] = st ? ['#5ac8ff', 'rgba(60,120,255,0.85)', 'rgba(120,215,255,0.9)', 'rgba(235,250,255,0.9)'] : ['#ff6020', 'rgba(255,90,20,0.85)', 'rgba(255,190,60,0.9)', 'rgba(255,250,200,0.9)']
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(px - 5, py - 1, 10, 3)
  // Stand and bowl
  ctx.fillStyle = '#1a1416'
  ctx.fillRect(px - 1, py - 7, 2, 7)
  ctx.fillRect(px - 4, py - 1, 8, 2)
  ctx.fillStyle = '#3a3034'
  ctx.fillRect(px - 6, py - 10, 12, 4)
  ctx.fillStyle = '#54464a'
  ctx.fillRect(px - 6, py - 10, 12, 1)
  // Coals
  ctx.fillStyle = c0
  ctx.fillRect(px - 5, py - 11, 10, 2)
  // Flames: three tongues licking up, the middle one tallest
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = -1; i <= 1; i++) {
    const h = (i ? 7 : 11) + Math.sin(time * 11 + i * 2 + px) * 2.5
    const sway = Math.sin(time * 6 + i + py) * 1.2
    ctx.fillStyle = c1
    ctx.fillRect(px + i * 3 - 2 + sway * 0.5, py - 11 - h, 4, h)
    ctx.fillStyle = c2
    ctx.fillRect(px + i * 3 - 1 + sway, py - 11 - h * 0.7, 2, h * 0.7)
    ctx.fillStyle = c3
    ctx.fillRect(px + i * 3 - 0.5 + sway, py - 11 - h * 0.35, 1, h * 0.35)
  }
  // A spark drifting up now and then
  const k = (time * 0.9 + px * 0.13) % 1
  ctx.fillStyle = st ? `rgba(255,240,120,${1 - k})` : `rgba(255,200,90,${1 - k})`
  ctx.fillRect(px + Math.sin(time * 3 + px) * 3, py - 18 - k * 14, 1, 1)
  ctx.restore()
}
