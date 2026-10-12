import { WILD } from '../data/pokemon'
import type { Game } from './game'
import { TILE } from './world'

/**
 * Battle royale events: a supply drop that falls from the sky after a
 * countdown, and a swarm of one species in a patch of tall grass.
 */

export interface WorldEvent {
  id: number
  kind: 'drop' | 'swarm'
  x: number
  y: number
  /** Drop: seconds until it lands. Swarm: seconds the marker stays. */
  t: number
  total: number
  /** Swarm: the species. */
  species?: number
}

export const DROP_TIME = 10
const SWARM_TIME = 35
let nextId = 1

/** When the two events happen this match (between the legendaries). */
export function eventTimes(g: Game): { t: number; kind: WorldEvent['kind'] }[] {
  const first: WorldEvent['kind'] = g.rng.chance(0.5) ? 'drop' : 'swarm'
  return [
    { t: g.rng.range(120, 150), kind: first },
    { t: g.rng.range(265, 290), kind: first === 'drop' ? 'swarm' : 'drop' },
  ]
}

/** Host: start an event. */
export function startEvent(g: Game, kind: WorldEvent['kind']) {
  const z = g.zone
  const inside = (x: number, y: number) => Math.hypot(x - z.nx, y - z.ny) < Math.max(3, z.nr * 0.75)
  if (kind === 'drop') {
    const [x, y] = g.world.randomWalkable((x, y) => inside(x, y) && !g.world.isTall(x, y))
    g.events.push({ id: nextId++, kind, x, y, t: DROP_TIME, total: DROP_TIME })
    for (const v of g.viewers) {
      v.hooks.banner({ kind: 'storm', title: 'Bevoorrading!', sub: 'Een kist valt uit de lucht · volg de pijl', color: '#58d0ff', voice: 'supply' })
      v.hooks.feed('📦 Bevoorrading onderweg: Master Ball, Potions en Rare Candy')
    }
    return
  }
  const pool = [...WILD.uncommon, ...WILD.rare]
  const species = g.rng.pick(pool)
  const centre = g.world.tall.length
    ? (() => {
        for (let k = 0; k < 40; k++) {
          const i = g.rng.pick(g.world.tall)
          const x = (i % 128) + 0.5, y = Math.floor(i / 128) + 0.5
          if (inside(x, y)) return [x, y] as const
        }
        return null
      })()
    : null
  const [cx, cy] = centre ?? g.world.randomWalkable(inside)
  for (let i = 0; i < 6; i++) {
    const [x, y] = g.world.randomWalkable((x, y) => Math.hypot(x - cx, y - cy) < 4)
    g.spawnWildAt(species, x, y)
  }
  g.events.push({ id: nextId++, kind, x: cx, y: cy, t: SWARM_TIME, total: SWARM_TIME, species })
  for (const v of g.viewers) {
    v.cry(species, 0.3)
    v.hooks.banner({ kind: 'storm', title: 'Een zwerm!', sub: 'Zes wilde Pokémon in het gras · volg de pijl', mon: species, color: '#7ce07c', voice: 'swarm' })
    v.hooks.feed('🐾 Er is een zwerm wilde Pokémon gespot', { mon: species })
  }
}

/** Host: tick events; the drop lands and spills its loot. */
export function updateEvents(g: Game, dt: number) {
  for (const e of [...g.events]) {
    const was = e.t
    e.t -= dt
    // The crate whistles down for its last second
    if (e.kind === 'drop' && was > 1.1 && e.t <= 1.1) g.soundAt(e.x, e.y, 'incoming', [], { range: 22 })
    if (e.t > 0) continue
    g.events.splice(g.events.indexOf(e), 1)
    if (e.kind !== 'drop') continue
    const loot = ['master', 'potion', 'potion', 'candy', 'candy', 'revive'] as const
    loot.forEach((kind, i) => {
      const a = (i / loot.length) * Math.PI * 2
      g.items.push({ x: e.x + Math.cos(a) * 1.1, y: e.y + Math.sin(a) * 1.1, kind, bob: Math.random() * 6 })
    })
    g.vfx.mark(e.x, e.y)
    g.vfx.ring(e.x, e.y, 2.6, '#58d0ff', 0.6, 6)
    g.vfx.glow(e.x, e.y - 0.4, 50, '#ffffff', 0.5)
    g.vfx.burst(e.x, e.y - 0.4, { n: 26, speed: 7, cols: ['#ffffff', '#a0e8ff', '#58d0ff'], shape: 'star', add: true, s0: 3, s1: 0.5, life: 0.8, vr: 10 })
    g.vfx.shakeBy(5)
    g.soundAt(e.x, e.y, 'crate', [], { range: 22 })
  }
}

/** World render: the drop's landing ring and the crate falling from the sky. */
export function drawEvents(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  for (const e of g.events) {
    if (e.kind !== 'drop') continue
    const x = e.x * TILE, y = e.y * TILE
    const k = 1 - e.t / e.total
    // Pulsing target ring
    ctx.strokeStyle = `rgba(88,208,255,${0.5 + 0.4 * Math.sin(time * 8)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y, 22, 14, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = `rgba(88,208,255,${0.12 + 0.18 * k})`
    ctx.beginPath()
    ctx.ellipse(x, y, 22 * k, 14 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    // Light beam from the sky
    const grad = ctx.createLinearGradient(x, y - 240, x, y)
    grad.addColorStop(0, 'rgba(160,232,255,0)')
    grad.addColorStop(1, `rgba(160,232,255,${0.25 + 0.2 * k})`)
    ctx.fillStyle = grad
    ctx.fillRect(x - 7, y - 240, 14, 240)
    // The crate on its parachute, coming down
    const cy = y - 8 - (1 - k) * (1 - k) * 220
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(x, y + 2, 6 + 6 * k, 3 + 2 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    if (k < 0.97) {
      ctx.fillStyle = '#f04848'
      ctx.beginPath()
      ctx.arc(x, cy - 16, 12, Math.PI, 0)
      ctx.fill()
      ctx.strokeStyle = '#f0f0f0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x - 11, cy - 16); ctx.lineTo(x - 5, cy - 4)
      ctx.moveTo(x + 11, cy - 16); ctx.lineTo(x + 5, cy - 4)
      ctx.stroke()
    }
    ctx.fillStyle = '#7a4a24'
    ctx.fillRect(x - 7, cy - 6, 14, 12)
    ctx.fillStyle = '#c88a48'
    ctx.fillRect(x - 6, cy - 5, 12, 10)
    ctx.fillStyle = '#7a4a24'
    ctx.fillRect(x - 6, cy - 1, 12, 2)
    ctx.fillRect(x - 1, cy - 5, 2, 10)
  }
}
