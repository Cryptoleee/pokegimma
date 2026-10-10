import { BOSSES, RAID_LEVEL, RAID_LIVES, RAID_TIME, RESPAWN_TIME, type BossAttack, type BossDef, type HazardShape } from '../data/bosses'
import type { Move, MoveFx } from '../data/moves'
import { SPECIES } from '../data/pokemon'
import { TYPE_COLOR, type PType } from '../data/types'
import { Mon, type Trainer } from './entities'
import type { Game } from './game'
import { drawCharge, onBeam, onImpact } from './moveFx'
import { disc, drawGlow, drawShape } from './vfx'
import { preloadMon } from './sprites'
import { ARENA_C, ARENA_R, T, TILE } from './world'

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
  /** Raid time left. */
  timeLeft: number
  /** Raid result once decided. */
  result: 'won' | 'lost' | null
  goalX: number
  goalY: number
  /** Lava vents take turns erupting. */
  ventT: number
  /** A potion appears in the arena every so often. */
  potionT: number
}

let hazardId = 1

/** Final evolution of a species (first branch when it splits). */
export function finalForm(id: number): number {
  let sp = SPECIES[id]
  for (let i = 0; i < 4 && sp.evo?.length; i++) sp = SPECIES[sp.evo[0]]
  return sp.id
}

/** Spots around the arena edge to (re)spawn at, one per player. */
export function spawnPoint(i: number, n: number): [number, number] {
  const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.42
  return [ARENA_C + Math.cos(a) * (ARENA_R - 4.5), ARENA_C + Math.sin(a) * (ARENA_R - 4.5)]
}

/** Host and solo: turn the match into a raid. */
export function setupRaid(g: Game, id: keyof typeof BOSSES) {
  const def = BOSSES[id]
  const humans = g.trainers
  humans.forEach((tr, i) => {
    tr.party = tr.party.slice(0, 1).map((m) => {
      const mon = new Mon(finalForm(m.species.id), RAID_LEVEL, m.shiny)
      mon.owner = tr
      mon.hp = mon.maxHp
      preloadMon(mon.species.id, mon.shiny)
      return mon
    })
    tr.active = 0
    tr.potions = 2
    tr.revives = 0
    tr.masterBalls = 0
    tr.lives = RAID_LIVES
    const [x, y] = spawnPoint(i, humans.length)
    tr.x = x
    tr.y = y
    tr.mon.x = x
    tr.mon.y = y + 0.8
  })
  const boss = new Mon(def.species, def.level)
  boss.boss = true
  boss.bossMul = def.hp * (1 + 0.75 * (humans.length - 1))
  boss.hp = boss.maxHp
  boss.x = boss.homeX = ARENA_C
  boss.y = boss.homeY = ARENA_C - 2
  boss.aggressive = true
  preloadMon(def.species)
  g.wilds.push(boss)
  g.raid = {
    def, boss, phase: 0, nextT: 3, cds: {}, moveT: 2, invulnT: 0, timeLeft: RAID_TIME, result: null,
    goalX: boss.x, goalY: boss.y, ventT: 6, potionT: 20,
  }
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
  r.timeLeft -= dt
  g.raidView = { timeLeft: Math.max(0, r.timeLeft), phase: r.phase }
  const boss = r.boss
  r.invulnT = Math.max(0, r.invulnT - dt)

  // Lava burns, players come back after going down
  for (const tr of g.trainers) {
    if (!tr.alive) continue
    const m = tr.mon
    if (!m.fainted && g.world.at(Math.floor(m.x), Math.floor(m.y)) === T.LAVA) {
      g.applyDamage(m, m.maxHp * 0.1 * dt, null, true)
      if (Math.random() < dt * 8) g.vfx.burst(m.x, m.y - 0.2, { n: 2, speed: 2, dir: -Math.PI / 2, spread: 0.6, cols: ['#ffb030', '#ff6020'], shape: 'flame', s0: 2.5, s1: 0.5, life: 0.4 })
    }
    if (m.fainted && tr.respawnT > 0) {
      tr.respawnT -= dt
      if (tr.respawnT <= 0) respawn(g, tr)
    }
  }

  // Every ~22 s a potion shows up somewhere in the arena (keeps everyone moving)
  r.potionT -= dt
  if (r.potionT <= 0) {
    r.potionT = 22
    if (g.items.filter((it) => it.kind === 'potion').length < 3) {
      const [x, y] = g.world.randomWalkable((x, y) => g.world.at(Math.floor(x), Math.floor(y)) !== T.LAVA && Math.hypot(x - ARENA_C, y - ARENA_C) < ARENA_R - 3)
      g.items.push({ x, y, kind: 'potion', bob: 0 })
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
    r.nextT -= dt
    if (r.nextT <= 0) {
      const a = pickAttack(r)
      if (a) {
        castAttack(g, r, a, foes)
        r.cds[a.id] = a.cd
        r.nextT = [4.3, 3.6, 2.9][r.phase] + a.warn + (a.sweep ? a.sweep.count * (a.stagger ?? 0) : 0)
      } else r.nextT = 0.5
    }
    // Lava vents erupt on their own every few seconds (the arena fights too)
    if (r.def.arena === 'crater') {
      r.ventT -= dt
      if (r.ventT <= 0) {
        r.ventT = [11, 9, 7][r.phase]
        const v = g.world.vents[Math.floor(Math.random() * g.world.vents.length)]
        addHazard(g, { shape: 'circle', x: v.x, y: v.y, ang: 0, r: 2.6, inner: 0, width: 0, t: 1.35, dmg: 0.35, fx: 'earthpower', type: 'fire', freeze: 0, cover: false, both: false, atk: 'vent' })
      }
    }
  }

  // Lumber around: keep close to the action, stay in the middle part of the arena
  if (!boss.fainted && boss.castT <= 0 && !boss.charging) {
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
  }

  // Hazards land
  for (const h of [...g.hazards]) {
    h.t -= dt
    if (h.t > 0) continue
    g.hazards.splice(g.hazards.indexOf(h), 1)
    resolveHazard(g, h)
  }

  // How does it end?
  if (boss.fainted) r.result = 'won'
  else if (r.timeLeft <= 0 || g.trainers.every((t) => !t.alive)) r.result = 'lost'
  if (r.result) endRaid(g, r)
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

function addHazard(g: Game, h: Omit<Hazard, 'id' | 'total'>) {
  g.hazards.push({ ...h, id: hazardId++, total: h.t })
  g.vfx.mark(h.x, h.y)
}

/** Lay out an attack's hazards on the ground. */
function castAttack(g: Game, r: RaidState, a: BossAttack, foes: Mon[]) {
  const boss = r.boss
  const base = { ang: 0, r: a.r ?? 2, inner: a.inner ?? 0, width: a.width ?? 1, dmg: a.dmg, fx: a.fx, type: a.type, freeze: a.freeze ?? 0, cover: !!a.cover, both: false, atk: a.id }
  const pick = a.target === 'random' ? foes[Math.floor(Math.random() * foes.length)] : closest(boss, foes)
  const aimAt = pick ?? { x: boss.x, y: boss.y + 3 }
  const ang = Math.atan2(aimAt.y - boss.y, aimAt.x - boss.x)
  boss.castT = 0.9
  boss.aimX = Math.cos(ang)
  boss.aimY = Math.sin(ang)
  boss.aimT = a.warn
  g.callout(boss, a.name, TYPE_COLOR[a.type])
  for (const v of g.viewers) if (Math.hypot(v.camX - boss.x, v.camY - boss.y) < 20) v.sfx('warn')

  switch (a.shape) {
    case 'circle': {
      if (a.target === 'self') {
        addHazard(g, { ...base, shape: 'circle', x: boss.x, y: boss.y, t: a.warn })
        break
      }
      if (a.target === 'vents') {
        g.world.vents.forEach((v, i) => addHazard(g, { ...base, shape: 'circle', x: v.x, y: v.y, t: a.warn + i * (a.stagger ?? 0) }))
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
      addHazard(g, { ...base, shape: 'ring', x: boss.x, y: boss.y, t: a.warn })
      break
    case 'cone':
      addHazard(g, { ...base, shape: 'cone', x: boss.x, y: boss.y, ang, r: a.len ?? 9, t: a.warn })
      break
    case 'line': {
      const n = a.sweep?.count ?? 1
      const dirSign = Math.random() < 0.5 ? 1 : -1
      for (let i = 0; i < n; i++) {
        const la = ang + dirSign * i * (a.sweep?.step ?? 0)
        addHazard(g, { ...base, shape: 'line', x: boss.x, y: boss.y, ang: la, r: a.len ?? 14, t: a.warn + i * (a.stagger ?? 0), both: !!a.sweep })
      }
      break
    }
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
  }
}

function resolveHazard(g: Game, h: Hazard) {
  impactFx(g, h)
  const v = g.vfx
  // Ice pillars take a beating from everything but the blizzard they shelter you from
  if (!h.cover)
    g.world.pillars.forEach((pl, i) => {
      if (pl.hp <= 0 || !inHazard(h, pl.x + 1, pl.y + 1)) return
      pl.hp = Math.max(0, pl.hp - 0.34)
      v.mark(pl.x + 1, pl.y + 1)
      v.burst(pl.x + 1, pl.y + 0.5, { n: 10, speed: 5, cols: ['#ffffff', '#c8ecff', '#8cc4f0'], shape: 'shard', s0: 3, s1: 1, life: 0.6, grav: 8 })
      if (pl.hp <= 0) {
        v.burst(pl.x + 1, pl.y, { n: 30, speed: 8, cols: ['#ffffff', '#c8ecff', '#8cc4f0'], shape: 'shard', s0: 4, s1: 1, life: 0.9, grav: 10 })
        v.shakeBy(6)
        g.world.breakPillar(i)
        for (const vw of g.viewers) vw.hooks.feed('🧊 Een ijspilaar is versplinterd!')
      }
    })
  // Damage everyone inside (behind a pillar is safe from cover attacks)
  for (const m of targets(g)) {
    if (!inHazard(h, m.x, m.y)) continue
    if (h.cover && g.world.lineBlocked(h.x, h.y, m.x, m.y)) continue
    g.applyDamage(m, m.maxHp * h.dmg, null)
    if (h.freeze && !m.fainted) {
      m.frozenT = Math.max(m.frozenT, h.freeze)
      m.tintCol = '#a0e0ff'
      m.tintT = h.freeze
      g.addFxPublic({ kind: 'text', x: m.x, y: m.y - 2.1, t: 0, life: 0.9, color: '#a0e0ff', text: 'Bevroren!', small: true })
    }
  }
}

function enrage(g: Game, r: RaidState) {
  r.phase++
  r.invulnT = 1.6
  r.nextT = 2.2
  const boss = r.boss
  boss.charging = null
  for (const v of g.viewers) {
    v.cry(boss.species.id, 0.5)
    v.hooks.banner({ kind: 'legendary', title: `${r.def.name} wordt woedend!`, sub: r.phase === 1 ? 'Fase 2 · nieuwe aanvallen' : 'Laatste fase · alles of niets!', mon: boss.species.id, color: r.def.color })
  }
  g.vfx.mark(boss.x, boss.y)
  g.vfx.ring(boss.x, boss.y, 4, r.def.color, 0.8, 8)
  g.vfx.glow(boss.x, boss.y - 0.8, 80, r.def.color, 0.6)
  g.vfx.flash(0.6, '255,255,255')
  g.vfx.shakeBy(10)
  // Roar: shove everyone back
  for (const tr of g.trainers) {
    if (!tr.alive) continue
    for (const o of [tr, tr.mon]) {
      const dx = o.x - boss.x, dy = o.y - boss.y, d = Math.hypot(dx, dy) || 1
      if (d < 7) for (let i = 0; i < 10; i++) g.tryMove(o, (dx / d) * 0.3, (dy / d) * 0.3, 0.3)
    }
  }
  // Two potions to keep going
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2
    g.items.push({ x: ARENA_C + Math.cos(a) * 8, y: ARENA_C + Math.sin(a) * 8, kind: 'potion', bob: 0 })
  }
}

/** A player's Pokémon went down: lose a life, come back in a moment (or you're out). */
export function raidDown(g: Game, tr: Trainer) {
  tr.lives = Math.max(0, tr.lives - 1)
  const v = g.vOf(tr)
  if (tr.lives > 0) {
    tr.respawnT = RESPAWN_TIME
    v?.hooks.banner({ kind: 'fainted', title: `${tr.mon.name} is verslagen!`, sub: `Terug over ${RESPAWN_TIME} s · nog ${tr.lives} ${tr.lives === 1 ? 'leven' : 'levens'}`, mon: tr.mon.species.id })
    return
  }
  g.eliminateRaid(tr)
}

function respawn(g: Game, tr: Trainer) {
  const i = g.trainers.indexOf(tr)
  const [x, y] = spawnPoint(i, g.trainers.length)
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
  v?.sfx('release')
  v?.hooks.toast(`Terug in de strijd! Nog ${tr.lives} ${tr.lives === 1 ? 'leven' : 'levens'}`, '#80f080')
}

function endRaid(g: Game, r: RaidState) {
  const won = r.result === 'won'
  if (won) {
    const b = r.boss
    g.vfx.mark(b.x, b.y)
    g.vfx.flash(0.9, '255,255,255')
    g.vfx.shakeBy(14)
    g.vfx.ring(b.x, b.y, 6, '#ffffff', 1, 10)
  }
  for (const v of g.viewers) {
    if (v.done) continue
    v.hooks.banner(won
      ? { kind: 'win', title: 'RAID GESLAAGD!', sub: `${r.def.name} is verslagen`, mon: r.boss.species.id, color: '#ffd040' }
      : { kind: 'fainted', title: 'Raid mislukt', sub: r.timeLeft <= 0 ? 'De tijd is op' : 'Iedereen is verslagen', mon: r.boss.species.id })
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
}
type Pal = (typeof PAL)['fire']
const palOf = (t: PType, atk = ''): Pal => (atk === 'blueflare' ? PAL.blue : t === 'ice' ? PAL.ice : t === 'dragon' ? PAL.dragon : PAL.fire)
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** The boss attack behind a hazard (none for the crater's own vents). */
export function bossAttack(g: Game, atk: string): BossAttack | undefined {
  return BOSSES[g.setup.boss ?? 'reshiram'].attacks.find((a) => a.id === atk)
}

/** Big impacts that fill the whole shape and leave marks on the ground. */
function impactFx(g: Game, h: Hazard) {
  const v = g.vfx, p = palOf(h.type, h.atk), ice = h.type === 'ice'
  const mv = moveFor({ name: '', fx: h.fx, type: h.type })
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
      } else {
        // A column of fire, a flame shockwave and flying rocks
        v.burst(h.x, h.y - 0.2, { n: 20, dir: -Math.PI / 2, spread: 0.35, speed: 10 + r * 2, cols: p.cols, shape: 'flame', add: true, s0: 7, s1: 11, life: 0.95, grav: -3, drag: 1.5 })
        v.burst(h.x, h.y, { n: 14, speed: r * 4, cols: p.cols, shape: 'flame', add: true, s0: 6, s1: 9, life: 0.7, flat: 0.6, drag: 3 })
        v.burst(h.x, h.y - 0.3, { n: 8, speed: 7, cols: ['#3a2a20', '#5a4030', '#2a1a14'], shape: 'rock', s0: 2.5, s1: 1.5, life: 0.8, grav: 14, vr: 8 })
        v.decal(h.x, h.y, r * 0.9, h.atk === 'vent' || h.atk === 'eruption' ? 'crater' : 'scorch', 7)
      }
      v.shakeBy(Math.min(9, 3 + r * 1.2))
      return
    }
    case 'ring': {
      // A crown of flame columns or ice spikes all the way round
      const mid = (h.inner + Math.min(h.r, ARENA_R)) / 2, n = 18
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.08, 0.08)
        const x = h.x + Math.cos(a) * mid, y = h.y + Math.sin(a) * mid
        if (ice) v.pillar(x, y, rand(20, 34), 5, p.spike[0], p.spike[1], 1, i * 0.015, '#e8f6ff')
        else {
          v.burst(x, y - 0.2, { n: 5, dir: -Math.PI / 2, spread: 0.4, speed: 9, cols: p.cols, shape: 'flame', add: true, s0: 6, s1: 9, life: 0.9, grav: -3, drag: 1.5 })
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
      // A wave of flame or frost rolling over the whole cone
      const ox = h.x, oy = h.y - 0.6
      v.glow(ox, oy, 60, p.glow, 0.5)
      onBeam(v, mv, ox, oy, h.x + Math.cos(h.ang) * h.r, h.y + Math.sin(h.ang) * h.r - 0.4, () => [ox, oy])
      for (let i = 1; i <= 4; i++)
        for (let s = -2; s <= 2; s++) {
          const a = h.ang + (s / 2) * h.width * 0.8, d = (h.r * i) / 4.4
          const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d
          if (ice && i % 2 === 0) v.pillar(x, y, 12 + i * 4, 3.5, p.spike[0], p.spike[1], 0.9, i * 0.05, '#e8f6ff')
          v.burst(x, y - 0.2, { n: 5, dir: h.ang, spread: 0.5, speed: 6 + i, cols: p.cols, shape: ice ? 'flake' : 'flame', add: !ice, s0: 5 + i * 0.6, s1: 8, life: 0.8, drag: 2, grav: ice ? 0 : -2, flat: 0.7 })
          if (s === 0) v.glow(x, y, 30 + i * 8, p.glow, 0.7)
        }
      for (let i = 1; i <= 3; i++)
        v.decal(h.x + Math.cos(h.ang) * h.r * (i / 3.5), h.y + Math.sin(h.ang) * h.r * (i / 3.5), 1.2 + i * 0.3, ice ? 'frost' : 'scorch', 6)
      v.shakeBy(7)
      return
    }
    case 'line': {
      // The beam, then a trail of fire / ice / dragon sparks along its whole length
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang)
      const sx = h.both ? h.x - ux * h.r : h.x, sy = h.both ? h.y - uy * h.r : h.y
      onBeam(v, mv, sx, sy - 0.4, h.x + ux * h.r, h.y + uy * h.r - 0.4, () => [sx, sy - 0.4])
      const shape = h.type === 'dragon' ? 'star' : ice ? 'shard' : 'flame'
      let n = 0
      for (let d = (h.both ? -h.r : 0) + 1; d <= h.r; d += h.both ? 3 : 2.2) {
        const x = h.x + ux * d, y = h.y + uy * d
        if (Math.hypot(x - ARENA_C, y - ARENA_C) > ARENA_R + 1) continue
        v.burst(x, y - 0.2, { n: h.both ? 3 : 5, speed: 3, cols: p.cols, shape, add: true, s0: 6, s1: 8, life: 0.8, grav: ice ? 6 : -3, flat: 0.6 })
        if (n++ % (h.both ? 4 : 2) === 0) v.decal(x, y, 1.1, ice ? 'frost' : 'scorch', 4)
      }
      v.glow(h.x, h.y - 0.6, 50, p.glow, 0.4)
      v.shakeBy(h.both ? 4 : 6)
      return
    }
  }
}

// ---------------------------------------------------------------- drawing

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
  }
}

/** Telegraphs on the ground: the shape, a texture that moves, filling up until it hits. */
export function drawHazards(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  for (const h of g.hazards) {
    const k = Math.max(0, Math.min(1, 1 - h.t / h.total))
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
      for (let d = -back + ((time * 80) % gap); d < h.r * TILE; d += gap) {
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
      drawGlow(ctx, x, y, 14 + 34 * k, '#ff8020', 0.4 + 0.5 * k)
      for (let i = 0; i < 6; i++) {
        const f = (time * 2.2 + i * 0.37) % 1
        disc(ctx, x + Math.sin(i * 2.7) * R * 0.45, y + Math.cos(i * 1.9) * R * 0.3, 1 + f * 3 * (0.5 + k), f < 0.8 ? '#ffb040' : '#fff0a0')
      }
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

/**
 * Drawn above the actors: what is on its way (meteors, icicles, embers), the
 * blizzard closing in, and the boss charging up its attack.
 */
export function drawHazardsSky(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  if (!g.hazards.length) return
  const boss = g.wilds.find((w) => w.boss && !w.fainted)
  let charge: { h: Hazard; k: number } | null = null
  for (const h of g.hazards) {
    const k = Math.max(0, Math.min(1, 1 - h.t / h.total))
    const p = palOf(h.type, h.atk)
    const x = h.x * TILE, y = h.y * TILE
    const a = bossAttack(g, h.atk)
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
        drawGlow(ctx, x + Math.sin(i * 5 + time * 3) * 6, y - f * (20 + 40 * k), 4 + 3 * k, '#ff9030', (1 - f) * (0.4 + 0.5 * k))
      }
      continue
    }
    if (a?.target !== 'players') continue
    // Something falls out of the sky onto each circle; its shadow grows on the ground
    const kk = Math.max(0, (k - 0.25) / 0.75)
    ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.2 * kk})`
    ctx.beginPath()
    ctx.ellipse(x, y, (4 + h.r * 6) * kk, (2 + h.r * 3) * kk, 0, 0, Math.PI * 2)
    ctx.fill()
    if (kk <= 0) continue
    const size = 3 + h.r * 1.8
    if (h.type === 'ice') {
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
