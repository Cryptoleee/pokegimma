import { BOSSES, RAID_LEVEL, RAID_LIVES, RAID_TIME, RESPAWN_TIME, type BossAttack, type BossDef, type HazardShape } from '../data/bosses'
import type { Move, MoveFx } from '../data/moves'
import { SPECIES } from '../data/pokemon'
import { TYPE_COLOR, type PType } from '../data/types'
import { Mon, type Trainer } from './entities'
import type { Game } from './game'
import { onBeam, onBurst, onImpact } from './moveFx'
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
      r.moveT = [1.6, 1.3, 1.0][r.phase] + Math.random() * 0.5
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
        r.nextT = [3.1, 2.5, 2.0][r.phase] + a.warn + (a.sweep ? a.sweep.count * (a.stagger ?? 0) : 0)
      } else r.nextT = 0.5
    }
    // Lava vents erupt on their own every few seconds (the arena fights too)
    if (r.def.arena === 'crater') {
      r.ventT -= dt
      if (r.ventT <= 0) {
        r.ventT = [9, 7, 5][r.phase]
        const v = g.world.vents[Math.floor(Math.random() * g.world.vents.length)]
        addHazard(g, { shape: 'circle', x: v.x, y: v.y, ang: 0, r: 2.6, inner: 0, width: 0, t: 1.35, dmg: 0.35, fx: 'earthpower', type: 'fire', freeze: 0, cover: false, both: false })
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
  const base = { ang: 0, r: a.r ?? 2, inner: a.inner ?? 0, width: a.width ?? 1, dmg: a.dmg, fx: a.fx, type: a.type, freeze: a.freeze ?? 0, cover: !!a.cover, both: false }
  const pick = a.target === 'random' ? foes[Math.floor(Math.random() * foes.length)] : closest(boss, foes)
  const aimAt = pick ?? { x: boss.x, y: boss.y + 3 }
  const ang = Math.atan2(aimAt.y - boss.y, aimAt.x - boss.x)
  boss.castT = 0.5
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
  const mv = moveFor({ name: '', fx: h.fx, type: h.type })
  // Big, readable impacts
  const v = g.vfx
  if (h.shape === 'circle') {
    if (h.r > 10) {
      v.mark(h.x, h.y)
      v.flash(0.5, h.type === 'ice' ? '220,240,255' : '255,200,140')
      v.shakeBy(9)
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, rd = Math.random() * (ARENA_R - 1)
        onBurst(v, mv, ARENA_C + Math.cos(a) * rd, ARENA_C + Math.sin(a) * rd, 2.5)
      }
    } else onImpact(v, mv, h.x, h.y, h.r)
  } else if (h.shape === 'ring') {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, rd = (h.inner + Math.min(h.r, ARENA_R)) / 2
      onBurst(v, mv, h.x + Math.cos(a) * rd, h.y + Math.sin(a) * rd, 2)
    }
    v.ring(h.x, h.y, h.inner * TILE / 8, TYPE_COLOR[h.type], 0.5, 6)
    v.shakeBy(6)
  } else {
    const ex = h.x + Math.cos(h.ang) * h.r, ey = h.y + Math.sin(h.ang) * h.r
    const sx = h.both ? h.x - Math.cos(h.ang) * h.r : h.x, sy = h.both ? h.y - Math.sin(h.ang) * h.r : h.y
    onBeam(v, mv, sx, sy - 0.4, ex, ey - 0.4, () => [sx, sy - 0.4])
    if (h.shape === 'cone') {
      for (let i = 1; i <= 4; i++)
        for (const s of [-1, 0, 1]) {
          const a = h.ang + s * h.width * 0.7, rd = (h.r * i) / 4
          onBurst(v, mv, h.x + Math.cos(a) * rd, h.y + Math.sin(a) * rd, 1.2 + i * 0.3)
        }
    }
    v.shakeBy(5)
  }
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

// ---------------------------------------------------------------- drawing

/** Telegraphs on the ground: the shape, filling up until it hits. */
export function drawHazards(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  for (const h of g.hazards) {
    const k = Math.max(0, Math.min(1, 1 - h.t / h.total))
    const col = h.type === 'ice' ? '120,210,255' : h.type === 'dragon' ? '170,120,255' : '255,70,40'
    const pulse = 0.55 + 0.45 * Math.sin(time * 18)
    const x = h.x * TILE, y = h.y * TILE
    ctx.save()
    const path = () => {
      ctx.beginPath()
      switch (h.shape) {
        case 'circle':
          ctx.arc(x, y, Math.min(h.r, ARENA_R + 2) * TILE, 0, Math.PI * 2)
          break
        case 'ring':
          ctx.arc(x, y, Math.min(h.r, ARENA_R + 2) * TILE, 0, Math.PI * 2)
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
    // Whole area faint, then a brighter fill that grows with the countdown
    path()
    ctx.fillStyle = `rgba(${col},0.16)`
    ctx.fill('evenodd')
    ctx.globalAlpha = 0.25 + 0.4 * k
    ctx.fillStyle = `rgba(${col},${0.25 + 0.35 * k})`
    if (h.shape === 'circle' || h.shape === 'cone') {
      ctx.beginPath()
      if (h.shape === 'circle') ctx.arc(x, y, Math.min(h.r, ARENA_R + 2) * TILE * k, 0, Math.PI * 2)
      else {
        ctx.moveTo(x, y)
        ctx.arc(x, y, h.r * TILE * k, h.ang - h.width, h.ang + h.width)
        ctx.closePath()
      }
      ctx.fill()
    } else {
      path()
      ctx.fill('evenodd')
    }
    ctx.globalAlpha = 1
    path()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * pulse * k})`
    ctx.stroke()
    ctx.restore()
  }
}
