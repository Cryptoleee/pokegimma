import { RAID_TIME, type BossAttack } from '../data/bosses'
import { TAKEN } from '../data/difficulty'
import type { DungeonDef, FoeSpec, Rect, Warden } from '../data/dungeons'
import { TYPE_COLOR } from '../data/types'
import { both, inBoth } from '../i18n'
import { addHazard, raidIntro, type RaidState } from './boss'
import { Mon, type Trainer } from './entities'
import type { Game } from './game'
import { preloadMon } from './sprites'
import { ARENA_C, ARENA_R, T, TILE, type Gate } from './world'

/**
 * Raid dungeons (host and solo): the run through the rooms before the boss.
 * A room starts when someone walks in; its waves come one after the other, a
 * warden may lead one of them; when the room is empty the gate out of it
 * opens. After the last room the arena gate opens, and the first one inside
 * wakes the boss: from there it's a classic raid (boss.ts).
 */

export interface DungeonRun {
  def: DungeonDef
  /** The room being fought (or the next one to walk into). */
  room: number
  started: boolean
  /** Wave in the current room, and the countdown to it (< 0: it's on). */
  wave: number
  waveT: number
  /** Foes of the wave still standing (the warden among them). */
  foes: Mon[]
  warden: Mon | null
  wardenDef: Warden | null
  /** Warden: next telegraphed attack, its cooldowns, help called in so far. */
  atkT: number
  cds: Record<string, number>
  calls: number
  /** 'rooms' → 'arena' (the arena gate is open) → 'boss'. */
  stage: 'rooms' | 'arena' | 'boss'
  /** Where you come back after fainting. */
  checkpoint: [number, number]
  /** Forge vents: next eruption. */
  ventT: number
  /** Waves fought so far / in the whole dungeon (for the HUD). */
  waveNo: number
  waves: number
  /** Seconds since the run started (the boss fight has its own clock). */
  time: number
}

/** What every player sees of the run (synced in `rv`). */
export interface DungeonView {
  /** Room index (rooms.length = in the arena), wave in it (1-based, 0 = none yet), waves in it. */
  room: number
  wave: number
  waves: number
  /** Foes left in the wave. */
  left: number
  /** Gates open (bit per gate). */
  gates: number
  stage: 0 | 1 | 2
  /** The warden's id (its health bar), 0 = none. */
  warden: number
  /** Countdown to the next wave (s), 0 = none. */
  next: number
  /** Lives per player in this dungeon. */
  lives: number
  waveNo: number
  totalWaves: number
}

const inRect = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad
const humansOf = (g: Game) => Math.max(1, g.trainers.filter((t) => t.human).length)

/** Set up the run: everyone at the dungeon's start, the boss waits out of sight. */
export function setupDungeon(g: Game, r: RaidState, def: DungeonDef, startRoom = 0) {
  const d: DungeonRun = {
    def, room: 0, started: false, wave: 0, waveT: 0, foes: [], warden: null, wardenDef: null,
    atkT: 0, cds: {}, calls: 0, stage: 'rooms', checkpoint: [...def.start], ventT: 5, waveNo: 0,
    waves: def.rooms.reduce((s, rm) => s + rm.waves.length, 0), time: 0,
  }
  r.dg = d
  // Dev and testing: start further in (?room=N), with the gates before it open
  for (let i = 0; i < Math.min(startRoom, def.rooms.length); i++) {
    g.world.gates[i].open = true
    g.world.gates[i].openAt = -10
    d.waveNo += def.rooms[i].waves.length
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
  for (const f of def.rooms.flatMap((rm) => rm.waves.flatMap((w) => [...w.foes, ...(w.warden ? [{ sp: w.warden.sp }] : [])]))) preloadMon(f.sp)
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

/** Host tick while the run is on. Returns true until the boss fight starts (then boss.ts takes over). */
export function dungeonTick(g: Game, r: RaidState, dt: number): boolean {
  const d = r.dg!
  if (d.stage === 'boss') return false
  d.time += dt
  const def = d.def
  const alive = g.trainers.filter((t) => t.alive)
  const standing = alive.filter((t) => !t.mon.fainted)

  if (d.stage === 'rooms') {
    const room = def.rooms[d.room]
    if (!d.started) {
      // Someone walked in: the room wakes up
      if (standing.some((t) => inRect(room.rect, t.x, t.y, -1)) && g.introT <= 0) {
        d.started = true
        d.wave = 0
        d.waveT = d.room === 0 ? 1.8 : 1.4
        roomBanner(g, d)
      }
    } else if (d.waveT > 0) {
      d.waveT -= dt
      if (d.waveT <= 0) startWave(g, d)
    } else {
      d.foes = d.foes.filter((m: Mon) => !m.fainted && g.wilds.includes(m))
      if (d.warden && (d.warden.fainted || !g.wilds.includes(d.warden))) d.warden = null
      if (d.warden) wardenTick(g, d, dt, standing.map((t) => t.mon))
      if (!d.foes.length && !d.warden) {
        d.wave++
        if (d.wave < room.waves.length) {
          d.waveT = 2.6
          for (const v of g.viewers) v.hooks.toast(both(`Wave cleared · next one coming`, `Wave verslagen · de volgende komt eraan`), '#ffd060')
        } else roomCleared(g, d)
      }
    }
    // The forge vents erupt while the forge is being fought
    if (room && room.deco === 'forge' && d.started && g.world.dvents.length) {
      d.ventT -= dt
      if (d.ventT <= 0) {
        d.ventT = 3.6 + Math.random() * 2.4
        const v = g.world.dvents[Math.floor(Math.random() * g.world.dvents.length)]
        addHazard(g, { shape: 'circle', x: v.x, y: v.y, ang: 0, r: 2.6, inner: 0, width: 1, t: 1.4, dmg: 0.22, fx: 'earthpower', type: 'fire', freeze: 0, cover: false, both: false, atk: 'vent' })
      }
    }
  } else if (d.stage === 'arena') {
    // The first one into the arena wakes the boss
    if (standing.some((t) => Math.hypot(t.x - ARENA_C, t.y - ARENA_C) < ARENA_R - 2.5)) startBoss(g, r, d)
  }

  g.raidView = { timeLeft: r.timeLeft, phase: 0, dg: viewOf(g, d) }
  return (d.stage as string) !== 'boss'
}

export function viewOf(g: Game, d: DungeonRun): DungeonView {
  const room = d.def.rooms[d.room]
  let gates = 0
  g.world.gates.forEach((gt, i) => { if (gt.open) gates |= 1 << i })
  return {
    room: d.room, wave: d.started && room ? Math.min(d.wave + 1, room.waves.length) : 0, waves: room?.waves.length ?? 0,
    left: d.foes.length, gates, stage: d.stage === 'rooms' ? 0 : d.stage === 'arena' ? 1 : 2,
    warden: d.warden?.id ?? 0, next: d.waveT > 0 ? Math.ceil(d.waveT) : 0, lives: d.def.lives,
    waveNo: d.waveNo, totalWaves: d.waves,
  }
}

function roomBanner(g: Game, d: DungeonRun) {
  const room = d.def.rooms[d.room]
  const n = d.room + 1, of = d.def.rooms.length
  for (const v of g.viewers) {
    v.hooks.banner({ kind: 'storm', kicker: both('DUNGEON', 'DUNGEON'), title: inBoth(() => room.name), sub: both(`Room ${n} of ${of} · ${room.waves.length} ${room.waves.length === 1 ? 'wave' : 'waves'}`, `Kamer ${n} van ${of} · ${room.waves.length} ${room.waves.length === 1 ? 'wave' : 'waves'}`), color: '#ff8a3a' })
    v.sfx('siren')
  }
}

/** How many of a foe come (more players, more foes; the difficulty adds or takes a few). */
function countOf(g: Game, n: number) {
  const k = (1 + 0.5 * (humansOf(g) - 1)) * (g.diff === 'easy' ? 0.75 : g.diff === 'hard' ? 1.3 : 1)
  return Math.max(1, Math.round(n * k))
}

function startWave(g: Game, d: DungeonRun) {
  const room = d.def.rooms[d.room]
  const w = room.waves[d.wave]
  d.waveNo++
  const others: Mon[] = []
  for (const f of w.foes) for (let i = 0; i < countOf(g, f.n); i++) others.push(spawnFoe(g, f, room.rect))
  d.foes = others
  if (w.warden) {
    const wd = w.warden
    const m = makeFoe(g, wd.sp, wd.lv, 3)
    m.bossMul = wd.hp * (1 + 0.75 * (humansOf(g) - 1)) * (g.diff === 'easy' ? 0.8 : g.diff === 'hard' ? 1.2 : 1)
    m.hp = m.maxHp
    // In the far half of the room from where you came in
    const [ex, ey] = d.room > 0 ? roomEntry(d.def, d.room) : d.def.start
    const cx = room.rect.x + room.rect.w / 2, cy = room.rect.y + room.rect.h / 2
    const [x, y] = freeSpot(g, cx + (cx - ex) * 0.35, cy + (cy - ey) * 0.35)
    place(g, m, x, y)
    d.warden = m
    d.wardenDef = wd
    d.atkT = 2.5
    d.cds = {}
    d.calls = 0
    d.foes.push(m)
    g.vfx.mark(x, y)
    g.vfx.ring(x, y, 4, '#ff7a30', 0.8, 8)
    g.vfx.glow(x, y - 1, 90, '#ff7a30', 0.6)
    g.vfx.shakeBy(6)
    for (const v of g.viewers) {
      v.cry(wd.sp, 0.5)
      v.hooks.banner({ kind: 'legendary', kicker: both('⚔ WARDEN ⚔', '⚔ WACHTER ⚔'), title: both(`${m.name} blocks the way!`, `${m.name} verspert de weg!`), sub: inBoth(() => wd.title), mon: wd.sp, color: '#ff7a30' })
    }
    g.soundAt(x, y, 'boss', ['intro', 'fireblast'], { global: true })
  } else
    for (const v of g.viewers) {
      v.hooks.banner(w.final
        ? { kind: 'legendary', kicker: both('THE LAST STAND', 'HET LAATSTE GEVECHT'), title: both('FINAL WAVE', 'LAATSTE WAVE'), sub: both('Then the way to the legendary is open', 'Daarna ligt de weg naar de legende open'), color: '#ff5030' }
        : { kind: 'storm', kicker: inBoth(() => d.def.rooms[d.room].name.toUpperCase()), title: both(`Wave ${d.wave + 1}`, `Wave ${d.wave + 1}`), sub: both(`${d.foes.length} foes`, `${d.foes.length} vijanden`), color: '#ffb040' })
      v.sfx('warn')
    }
}

/** A dungeon foe: tougher with more players, its damage set by the difficulty. */
function makeFoe(g: Game, sp: number, lv: number, kind: 1 | 2 | 3) {
  const m = new Mon(sp, lv + (g.diff === 'hard' ? 2 : g.diff === 'easy' ? -2 : 0))
  m.foe = kind
  m.bossMul = (kind === 2 ? 3.2 : 1.15) * (1 + 0.3 * (humansOf(g) - 1))
  m.dmgMul = (kind === 3 ? 0.3 : kind === 2 ? 0.42 : 0.34) * TAKEN[g.diff]
  m.hp = m.maxHp
  m.aggressive = true
  m.legendary = false
  m.thinkT = 0.6 + Math.random() * 0.6
  preloadMon(sp)
  return m
}

function place(g: Game, m: Mon, x: number, y: number) {
  m.x = m.homeX = m.goalX = x
  m.y = m.homeY = m.goalY = y
  m.state = 'aggro'
  m.aggroT = 999
  g.wilds.push(m)
}

/** One foe of a wave: somewhere in the room, not on top of anyone. */
function spawnFoe(g: Game, f: FoeSpec, rect: Rect) {
  const m = makeFoe(g, f.sp, f.lv, f.elite ? 2 : 1)
  const players = g.trainers.filter((t) => t.alive)
  let best: [number, number] = [rect.x + rect.w / 2, rect.y + rect.h / 2], bd = -1
  for (let k = 0; k < 14; k++) {
    const [x, y] = freeSpot(g, rect.x + 2 + Math.random() * (rect.w - 4), rect.y + 2 + Math.random() * (rect.h - 4))
    if (!inRect(rect, x, y)) continue
    const near = Math.min(...players.map((t) => Math.hypot(t.x - x, t.y - y)), 99)
    // Not right on top of a player, not miles away either
    const score = near < 5 ? near : 10 - Math.abs(near - 9) * 0.3 + Math.random() * 2
    if (score > bd) { bd = score; best = [x, y] }
  }
  place(g, m, best[0], best[1])
  // Out of the ground in a burst of embers
  g.vfx.mark(best[0], best[1])
  g.vfx.ring(best[0], best[1], f.elite ? 2.2 : 1.4, '#ff8a3a', 0.5, 5)
  g.vfx.burst(best[0], best[1] - 0.3, { n: f.elite ? 22 : 12, speed: 5, dir: -Math.PI / 2, spread: 1.4, cols: ['#fff2a0', '#ffc840', '#ff7020'], shape: 'flame', add: true, s0: 3, s1: 0.6, life: 0.5 })
  g.soundAt(best[0], best[1], 'boss', ['vent', 'fireblast', f.elite ? 0.7 : 0.4], { range: 22 })
  if (f.elite) g.callout(m, both(`★ ${m.name}`, `★ ${m.name}`), '#ffb040')
  return m
}

/** A foe went down: off the field (never catchable), maybe a potion left behind. */
export function foeDown(g: Game, m: Mon) {
  const i = g.wilds.indexOf(m)
  if (i >= 0) g.wilds.splice(i, 1)
  g.addFxPublic({ kind: 'poof', x: m.x, y: m.y - 0.4, t: 0, life: 0.4, color: '#ffb060' })
  g.vfx.burst(m.x, m.y - 0.4, { n: m.foe >= 2 ? 26 : 12, speed: 5, cols: ['#ffffff', '#ffd080', '#ff8030'], shape: 'flame', add: true, s0: 3, s1: 0.5, life: 0.5 })
  // Elites and wardens leave a potion; a common foe now and then
  const drop = m.foe >= 2 || Math.random() < 0.08
  if (drop && g.items.filter((it) => it.kind === 'potion').length < 4) {
    g.items.push({ x: m.x, y: m.y, kind: 'potion', bob: 0 })
    g.soundAt(m.x, m.y, 'spawnChime', [], { range: 20 })
  }
  if (m.foe === 3) {
    g.vfx.flash(0.4, '255,200,140')
    g.vfx.shakeBy(8)
    g.vfx.ring(m.x, m.y, 5, '#ffd060', 0.9, 9)
    g.soundAt(m.x, m.y, 'boss', ['down', 'fireblast'], { global: true })
    for (const v of g.viewers) v.hooks.feed(both(`⚔️ ${m.name} is down!`, `⚔️ ${m.name} is verslagen!`), { mon: m.species.id, kind: 'boss' })
  }
}

/** The warden: telegraphed attacks now and then, and help called in as it weakens. */
function wardenTick(g: Game, d: DungeonRun, dt: number, foes: Mon[]) {
  const w = d.warden!, wd = d.wardenDef!
  for (const k in d.cds) d.cds[k] = Math.max(0, d.cds[k] - dt)
  const ratio = w.hp / w.maxHp
  const call = wd.calls?.[d.calls]
  if (call && ratio < call.at) {
    d.calls++
    const room = d.def.rooms[d.room]
    for (const f of call.foes) for (let i = 0; i < countOf(g, f.n); i++) d.foes.push(spawnFoe(g, f, room.rect))
    g.callout(w, both('Help me!', 'Help!'), '#ff8a3a')
    for (const v of g.viewers) v.cry(w.species.id, 0.4)
  }
  if (!foes.length || w.frozenT > 0) return
  d.atkT -= dt
  if (d.atkT > 0) return
  const ready = wd.attacks.filter((a) => !(d.cds[a.id] > 0))
  if (!ready.length) return
  let roll = Math.random() * ready.reduce((s, a) => s + a.weight, 0)
  const a = ready.find((x) => (roll -= x.weight) <= 0) ?? ready[0]
  d.cds[a.id] = a.cd
  d.atkT = 3.4 - 0.9 * (1 - ratio) + a.warn
  castWarden(g, d, w, a, foes)
}

function castWarden(g: Game, d: DungeonRun, w: Mon, a: BossAttack, foes: Mon[]) {
  let near = foes[0], nd = Infinity
  for (const f of foes) {
    const dd = Math.hypot(f.x - w.x, f.y - w.y)
    if (dd < nd) { nd = dd; near = f }
  }
  const ang = Math.atan2(near.y - w.y, near.x - w.x)
  const base = { ang: 0, r: a.r ?? 2, inner: a.inner ?? 0, width: a.width ?? 1, dmg: a.dmg, fx: a.fx, type: a.type, freeze: 0, cover: false, both: false, atk: a.id }
  w.holdT = a.warn + 0.2
  w.castT = 0.9
  w.aimX = Math.cos(ang)
  w.aimY = Math.sin(ang)
  w.aimT = a.warn
  g.callout(w, inBoth(() => a.name), TYPE_COLOR[a.type])
  for (const v of g.viewers) if (Math.hypot(v.camX - w.x, v.camY - w.y) < 20) v.sfx('warn')
  g.soundAt(w.x, w.y, 'boss', ['charge', a.fx, 0.8, a.warn], { range: 30 })
  if (a.shape === 'cone') addHazard(g, { ...base, shape: 'cone', x: w.x, y: w.y, ang, r: a.len ?? 8, t: a.warn })
  else if (a.shape === 'ring') addHazard(g, { ...base, shape: 'ring', x: w.x, y: w.y, t: a.warn })
  else if (a.target === 'self') addHazard(g, { ...base, shape: 'circle', x: w.x, y: w.y, t: a.warn })
  else {
    const rect = d.def.rooms[d.room].rect
    const spots: [number, number][] = a.target === 'nearest' ? [[near.x, near.y]] : foes.map((f) => [f.x, f.y])
    for (let i = 0; i < (a.extra ?? 0); i++) spots.push([rect.x + 2 + Math.random() * (rect.w - 4), rect.y + 2 + Math.random() * (rect.h - 4)])
    spots.forEach(([x, y], i) => addHazard(g, { ...base, shape: 'circle', x, y, t: a.warn + i * (a.stagger ?? 0) }))
  }
}

/** The room is empty: its gate opens, the fallen come back, a breather. */
function roomCleared(g: Game, d: DungeonRun) {
  const i = d.room
  openGate(g, i)
  const last = i === d.def.rooms.length - 1
  d.room++
  d.started = false
  d.wave = 0
  d.foes = []
  d.warden = null
  d.wardenDef = null
  d.checkpoint = last ? [...d.def.arenaEntry] : roomEntry(d.def, d.room)
  if (last) d.stage = 'arena'
  // A breather: everyone standing gets some health back, a potion each lies by the gate,
  // and whoever ran out of lives is back with one
  for (const tr of g.trainers) {
    if (!tr.alive || tr.mon.fainted) continue
    const m = tr.mon
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.35)
    g.addFxPublic({ kind: 'heal', x: m.x, y: m.y - 0.5, t: 0, life: 0.7, color: '#80f080' })
  }
  const gt = d.def.gates[i]
  for (const tr of g.trainers) {
    if (tr.alive || !tr.human) continue
    revive(g, tr, d)
  }
  // Beating a warden is worth a life
  if (d.def.rooms[i].waves.some((w) => w.warden))
    for (const tr of g.trainers)
      if (tr.alive && tr.lives < d.def.lives) {
        tr.lives++
        g.vOf(tr)?.hooks.toast(both(`Warden beaten: +1 life (${tr.lives})`, `Wachter verslagen: +1 leven (${tr.lives})`), '#ff8080')
      }
  for (let k = 0; k < humansOf(g); k++) g.items.push({ x: gt.x + gt.w / 2 + (k - (humansOf(g) - 1) / 2) * 1.2 - (gt.w > gt.h ? 0 : 2), y: gt.y + gt.h / 2 + (gt.w > gt.h ? 2.5 : 0), kind: 'potion', bob: 0 })
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
    ctx.fillStyle = `rgba(255,${110 + 60 * pulse},40,${0.55 * (1 - sink)})`
    ctx.fillRect(x, y + h - 2, w, 2)
    ctx.fillRect(x, y - tall, w, 2)
    const rx = x + w / 2, ry = y + h / 2 - tall / 2
    ctx.fillStyle = `rgba(255,170,60,${0.8 * pulse * (1 - sink)})`
    ctx.beginPath()
    ctx.moveTo(rx, ry - 6)
    ctx.lineTo(rx + 4, ry)
    ctx.lineTo(rx, ry + 6)
    ctx.lineTo(rx - 4, ry)
    ctx.closePath()
    ctx.fill()
    const glow = ctx.createRadialGradient(rx, ry, 0, rx, ry, 26)
    glow.addColorStop(0, `rgba(255,120,40,${0.35 * pulse * (1 - sink)})`)
    glow.addColorStop(1, 'rgba(255,120,40,0)')
    ctx.fillStyle = glow
    ctx.fillRect(rx - 26, ry - 26, 52, 52)
    ctx.restore()
  }
}

/** A brazier: an iron bowl on a stand with a fire that never goes out. */
export function drawBrazier(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const px = Math.round(x), py = Math.round(y)
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
  ctx.fillStyle = '#ff6020'
  ctx.fillRect(px - 5, py - 11, 10, 2)
  // Flames: three tongues licking up, the middle one tallest
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = -1; i <= 1; i++) {
    const h = (i ? 7 : 11) + Math.sin(time * 11 + i * 2 + px) * 2.5
    const sway = Math.sin(time * 6 + i + py) * 1.2
    ctx.fillStyle = 'rgba(255,90,20,0.85)'
    ctx.fillRect(px + i * 3 - 2 + sway * 0.5, py - 11 - h, 4, h)
    ctx.fillStyle = 'rgba(255,190,60,0.9)'
    ctx.fillRect(px + i * 3 - 1 + sway, py - 11 - h * 0.7, 2, h * 0.7)
    ctx.fillStyle = 'rgba(255,250,200,0.9)'
    ctx.fillRect(px + i * 3 - 0.5 + sway, py - 11 - h * 0.35, 1, h * 0.35)
  }
  // A spark drifting up now and then
  const k = (time * 0.9 + px * 0.13) % 1
  ctx.fillStyle = `rgba(255,200,90,${1 - k})`
  ctx.fillRect(px + Math.sin(time * 3 + px) * 3, py - 18 - k * 14, 1, 1)
  ctx.restore()
}
