import type { MoveFx } from '../data/moves'
import { TILE } from './world'

/**
 * Move visuals: particles plus hand-drawn effects per move (lightning, flame
 * streams, falling meteors, ...). Everything is in tile units, drawn in world px.
 */

export type Shape = 'sq' | 'dot' | 'flame' | 'leaf' | 'flake' | 'star' | 'drop' | 'rock' | 'ring' | 'line' | 'bubble'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
  size: number
  color: string
  shape: Shape
  rot: number
  vr: number
  grav: number
  glow: boolean
}

interface Family {
  colors: string[]
  shape: Shape
  grav: number
  glow?: boolean
}

const F = {
  fire: { colors: ['#fff4b0', '#ffc838', '#f87820', '#e03818'], shape: 'flame', grav: -4, glow: true },
  water: { colors: ['#ffffff', '#b8e0ff', '#68a8f8', '#3868d8'], shape: 'drop', grav: 9 },
  grass: { colors: ['#c8f890', '#78d050', '#40a038', '#2c7a30'], shape: 'leaf', grav: 1.5 },
  solar: { colors: ['#ffffff', '#f8f8a0', '#c8f070', '#78d050'], shape: 'dot', grav: -1, glow: true },
  ice: { colors: ['#ffffff', '#e0f8ff', '#a8e0f8', '#78c8e8'], shape: 'flake', grav: 1 },
  electric: { colors: ['#ffffff', '#fff8a0', '#f8e040', '#f8c020'], shape: 'sq', grav: 0, glow: true },
  aura: { colors: ['#ffffff', '#c0e0ff', '#70a8ff', '#3860e0'], shape: 'dot', grav: -1, glow: true },
  focus: { colors: ['#fff8d0', '#ffc860', '#f88030', '#d04818'], shape: 'dot', grav: -1, glow: true },
  fist: { colors: ['#ffffff', '#ffe0a0', '#f8a040'], shape: 'star', grav: 0 },
  poison: { colors: ['#f0c0ff', '#c070d8', '#a040a0', '#682878'], shape: 'bubble', grav: -2 },
  ground: { colors: ['#e8c890', '#c09858', '#906838', '#604020'], shape: 'rock', grav: 14 },
  wind: { colors: ['#ffffff', '#f0f4ff', '#d0d8f8'], shape: 'line', grav: 0 },
  psychic: { colors: ['#ffe0f0', '#f8a0d0', '#f058a0', '#b03878'], shape: 'ring', grav: -1, glow: true },
  bug: { colors: ['#f0f8a0', '#c8d840', '#a8b820', '#708010'], shape: 'sq', grav: 2 },
  rock: { colors: ['#e8e0c0', '#c8b070', '#a08838', '#685820'], shape: 'rock', grav: 14 },
  ghost: { colors: ['#e0c8ff', '#a080e0', '#705898', '#382848'], shape: 'dot', grav: -2, glow: true },
  dragon: { colors: ['#e8d8ff', '#a080ff', '#7038f8', '#4020a8'], shape: 'flame', grav: -3, glow: true },
  dark: { colors: ['#e09088', '#a05048', '#583838', '#201818'], shape: 'dot', grav: -1 },
  steel: { colors: ['#ffffff', '#e8e8f8', '#c0c0d8', '#8888a8'], shape: 'star', grav: 0, glow: true },
  star: { colors: ['#ffffff', '#fff8a0', '#f8e048'], shape: 'star', grav: 0, glow: true },
  normal: { colors: ['#ffffff', '#f8f0d8', '#e0d0a8'], shape: 'sq', grav: 2 },
  hyper: { colors: ['#ffffff', '#fff0b0', '#ffc050', '#f88020'], shape: 'dot', grav: -1, glow: true },
} satisfies Record<string, Family>

export function family(fx: MoveFx): Family {
  switch (fx) {
    case 'ember': case 'flamethrower': case 'fireblast': case 'flamewheel': return F.fire
    case 'water': case 'hydropump': case 'aquajet': case 'surf': return F.water
    case 'leaf': case 'whip': case 'energy': return F.grass
    case 'solarbeam': return F.solar
    case 'ice': case 'icebeam': case 'snow': case 'blizzard': return F.ice
    case 'thundershock': case 'thunderbolt': case 'spark': case 'discharge': case 'thunder': return F.electric
    case 'aura': return F.aura
    case 'focusblast': return F.focus
    case 'kick': case 'closecombat': return F.fist
    case 'poison': case 'sting': case 'sludgebomb': case 'gunkshot': return F.poison
    case 'mud': case 'quake': case 'earthpower': return F.ground
    case 'wind': case 'aerialace': case 'hurricane': return F.wind
    case 'psy': case 'psybeam': case 'psyshock': case 'psychic': return F.psychic
    case 'pin': case 'bugbite': case 'signalbeam': case 'bugbuzz': return F.bug
    case 'rock': case 'rocktomb': case 'stoneedge': return F.rock
    case 'shadowball': case 'shadowsneak': case 'shadowforce': case 'lick': return F.ghost
    case 'dragonrage': case 'dragonclaw': case 'dragonpulse': case 'dracometeor': return F.dragon
    case 'darkpulse': case 'bite': case 'nightdaze': return F.dark
    case 'mirror': case 'metalclaw': case 'flashcannon': case 'meteormash': return F.steel
    case 'star': return F.star
    case 'hyperbeam': return F.hyper
    default: return F.normal
  }
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export class Vfx {
  parts: Particle[] = []
  shake = 0
  flash = 0

  /** Spray of particles in a style. */
  emit(fx: MoveFx, x: number, y: number, n: number, speed = 3, opts: Partial<Particle> & { spread?: number; dir?: number } = {}) {
    const f = family(fx)
    if (this.parts.length > 900) return
    for (let i = 0; i < n; i++) {
      const a = opts.dir !== undefined ? opts.dir + rnd(-(opts.spread ?? 0.6), opts.spread ?? 0.6) : rnd(0, Math.PI * 2)
      const s = rnd(speed * 0.3, speed)
      this.parts.push({
        x: x + rnd(-0.1, 0.1), y: y + rnd(-0.1, 0.1), vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, life: rnd(0.3, 0.6), size: rnd(1.5, 3.2), color: pick(f.colors), shape: f.shape,
        rot: rnd(0, 6.28), vr: rnd(-8, 8), grav: f.grav, glow: !!f.glow, ...opts,
      })
    }
  }

  update(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      p.t += dt
      if (p.t >= p.life) {
        this.parts.splice(i, 1)
        continue
      }
      p.vy += p.grav * dt
      p.vx *= 1 - dt * 1.5
      p.vy *= 1 - dt * 1.5
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
    }
    this.shake = Math.max(0, this.shake - dt * 18)
    this.flash = Math.max(0, this.flash - dt * 3)
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const k = p.t / p.life
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4
      if (p.glow) ctx.globalCompositeOperation = 'lighter'
      drawShape(ctx, p.shape, p.x * TILE, p.y * TILE, p.size * (p.shape === 'flame' ? 1.4 - k * 0.8 : 1), p.color, p.rot)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = 1
  }
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, s: number, col: string, rot = 0) {
  ctx.fillStyle = col
  ctx.strokeStyle = col
  switch (shape) {
    case 'sq':
      ctx.fillRect(x - s / 2, y - s / 2, s, s)
      break
    case 'dot':
    case 'flame':
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'bubble':
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.5, s * 0.5)
      break
    case 'drop':
      ctx.beginPath()
      ctx.arc(x, y, s * 0.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.4, s * 0.4)
      break
    case 'ring':
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'line':
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x - Math.cos(rot) * s * 2, y - Math.sin(rot) * s * 2)
      ctx.lineTo(x + Math.cos(rot) * s * 2, y + Math.sin(rot) * s * 2)
      ctx.stroke()
      break
    case 'leaf':
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 1.3, s * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#2c6a28'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(-s * 1.2, 0)
      ctx.lineTo(s * 1.2, 0)
      ctx.stroke()
      ctx.restore()
      break
    case 'flake':
      ctx.lineWidth = 0.8
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3)
        ctx.beginPath()
        ctx.moveTo(-s, 0)
        ctx.lineTo(s, 0)
        ctx.stroke()
      }
      ctx.restore()
      break
    case 'star':
      star(ctx, x, y, s * 1.2, s * 0.5, rot)
      ctx.fill()
      break
    case 'rock':
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.moveTo(-s, -s * 0.4)
      ctx.lineTo(-s * 0.2, -s)
      ctx.lineTo(s, -s * 0.3)
      ctx.lineTo(s * 0.6, s * 0.8)
      ctx.lineTo(-s * 0.7, s * 0.7)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      break
  }
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, rot: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}

function glowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha = 0.5) {
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha *= alpha
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha /= alpha
  ctx.globalCompositeOperation = 'source-over'
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
  ctx.fill()
}

/** Jagged lightning between two points (world px). */
export function lightning(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, jag: number, branches = 0) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  const segs = Math.max(4, Math.round(len / 7))
  const pts: [number, number][] = [[x1, y1]]
  for (let i = 1; i < segs; i++) {
    const t = i / segs
    const o = (Math.random() * 2 - 1) * jag
    pts.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o])
  }
  pts.push([x2, y2])
  const path = () => {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = 'rgba(248, 208, 48, 0.55)'
  ctx.lineWidth = width * 2.6
  path()
  ctx.stroke()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = '#f8e048'
  ctx.lineWidth = width
  path()
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(0.7, width * 0.4)
  path()
  ctx.stroke()
  for (let b = 0; b < branches; b++) {
    const [sx, sy] = pts[1 + Math.floor(Math.random() * (pts.length - 2))]
    const a = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.1)
    const l = rnd(6, 14)
    lightning(ctx, sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, width * 0.5, jag * 0.5, 0)
  }
}

// ---------------- Projectiles ----------------

export function drawProjectile(ctx: CanvasRenderingContext2D, fx: MoveFx, px: number, py: number, vx: number, vy: number, time: number, seed: number) {
  const a = Math.atan2(vy, vx)
  const f = family(fx)
  const flick = Math.sin(time * 40 + seed) * 0.5 + 0.5
  switch (fx) {
    case 'ember':
    case 'dragonrage': {
      const c = f.colors
      glowCircle(ctx, px, py, 7, c[2], 0.35)
      for (let i = 3; i >= 0; i--) disc(ctx, px - Math.cos(a) * i * 1.6 + rnd(-0.6, 0.6), py - Math.sin(a) * i * 1.6 + rnd(-0.6, 0.6), 4 - i * 0.7 + flick * 0.6, c[Math.min(3, i)])
      disc(ctx, px, py, 1.6, '#ffffff')
      break
    }
    case 'water':
    case 'mud': {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.fillStyle = '#282830'
      ctx.beginPath()
      ctx.ellipse(-1, 0, 6, 3.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = f.colors[2]
      ctx.beginPath()
      ctx.ellipse(-1, 0, 5, 2.9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = f.colors[1]
      ctx.fillRect(0, -2, 3, 1.5)
      ctx.restore()
      break
    }
    case 'leaf':
      drawShape(ctx, 'leaf', px, py, 3.2, '#68c048', time * 20 + seed)
      break
    case 'energy': {
      const r = 5 + flick
      glowCircle(ctx, px, py, r + 4, '#a8f070', 0.4)
      disc(ctx, px, py, r, '#40a038')
      disc(ctx, px, py, r - 1.5, '#90e060')
      disc(ctx, px - 1.5, py - 1.5, 1.8, '#ffffff')
      break
    }
    case 'ice': {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.fillStyle = '#a8e0f8'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(7, 0)
      ctx.lineTo(0, -2.6)
      ctx.lineTo(-6, 0)
      ctx.lineTo(0, 2.6)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'snow':
      drawShape(ctx, 'flake', px, py, 3.5, '#ffffff', time * 6 + seed)
      glowCircle(ctx, px, py, 4, '#c8f0ff', 0.4)
      break
    case 'aura': {
      glowCircle(ctx, px, py, 9, '#4878f8', 0.45)
      disc(ctx, px, py, 5, '#3860e0')
      disc(ctx, px, py, 3.6, '#a8d0ff')
      disc(ctx, px, py, 1.8, '#ffffff')
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(px, py, 7, time * 12, time * 12 + 2)
      ctx.stroke()
      break
    }
    case 'sting':
    case 'pin': {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.fillStyle = fx === 'sting' ? '#a040a0' : '#c8d840'
      ctx.fillRect(-5, -1, 9, 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(2, -0.5, 3, 1)
      ctx.restore()
      break
    }
    case 'poison': {
      disc(ctx, px, py, 4.5, '#682878')
      disc(ctx, px, py, 3.5, '#a040a0')
      disc(ctx, px - 1, py - 1.2, 1.2, '#f0c0ff')
      break
    }
    case 'wind': {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(-3, 0, 6, -1.1, 1.1)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(200,210,248,0.8)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(-6, 0, 5, -1, 1)
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'psy': {
      ctx.lineWidth = 1.2
      for (let i = 0; i < 3; i++) {
        const r = ((time * 18 + i * 3) % 9) + 1
        ctx.strokeStyle = i % 2 ? '#f878b8' : '#ffd0e8'
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'rock':
      drawShape(ctx, 'rock', px, py, 5, '#685820', time * 8 + seed)
      drawShape(ctx, 'rock', px, py, 4, '#b8a038', time * 8 + seed)
      break
    case 'shadowball': {
      glowCircle(ctx, px, py, 9, '#8060c0', 0.4)
      disc(ctx, px, py, 6, '#382848')
      disc(ctx, px, py, 4.6, '#705898')
      disc(ctx, px, py, 2.5, '#201828')
      ctx.strokeStyle = '#c0a0f0'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(px, py, 6.5, time * 9 + seed, time * 9 + seed + 1.5)
      ctx.stroke()
      break
    }
    case 'darkpulse': {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#201818'
      ctx.beginPath()
      ctx.arc(px, py, 5 + flick, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.strokeStyle = '#c05048'
      ctx.stroke()
      disc(ctx, px, py, 2, '#583838')
      break
    }
    case 'mirror': {
      glowCircle(ctx, px, py, 7, '#ffffff', 0.4)
      disc(ctx, px, py, 4, '#a8a8c8')
      disc(ctx, px, py, 3, '#e8e8f8')
      star(ctx, px, py, 7, 1.5, time * 5)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      break
    }
    case 'star': {
      glowCircle(ctx, px, py, 6, '#f8e048', 0.35)
      star(ctx, px, py, 5.5, 2.4, time * 10 + seed)
      ctx.fillStyle = '#f8d030'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.8
      ctx.stroke()
      break
    }
    default: {
      disc(ctx, px, py, 4, '#282830')
      disc(ctx, px, py, 3.2, f.colors[1])
    }
  }
}

/** Particle trail behind projectiles. */
export function trail(v: Vfx, fx: MoveFx, x: number, y: number, vx: number, vy: number) {
  const back = Math.atan2(-vy, -vx)
  switch (fx) {
    case 'ember': case 'dragonrage': case 'energy': case 'aura': case 'shadowball': case 'star': case 'mirror':
      v.emit(fx, x, y, 1, 1.5, { dir: back, spread: 0.4, life: 0.3 })
      break
    case 'water': case 'snow': case 'poison': case 'mud': case 'psy':
      if (Math.random() < 0.5) v.emit(fx, x, y, 1, 1, { dir: back, spread: 0.8, life: 0.35, size: 1.4 })
      break
  }
}

// ---------------- Beams ----------------

export function drawBeam(ctx: CanvasRenderingContext2D, fx: MoveFx, x1: number, y1: number, x2: number, y2: number, k: number, time: number) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.hypot(x2 - x1, y2 - y1)
  const fade = 1 - k
  ctx.save()
  ctx.translate(x1, y1)
  ctx.rotate(a)
  ctx.lineCap = 'round'
  const band = (w: number, col: string, wob = 0, lighter = false) => {
    if (lighter) ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = col
    ctx.lineWidth = Math.max(0.5, w)
    ctx.beginPath()
    for (let s = 0; s <= len; s += 3) ctx.lineTo(s, Math.sin(s * 0.35 - time * 30) * wob)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }
  switch (fx) {
    case 'flamethrower': {
      // A widening cone of flickering fire puffs
      for (let s = 0; s < len; s += 4) {
        const t = s / len
        const r = (2 + t * 7) * (0.7 + fade * 0.5)
        const j = Math.sin(s * 0.7 + time * 50) * t * 3
        disc(ctx, s, j, r + 1.5, '#e03818')
        disc(ctx, s, j, r, t < 0.3 ? '#fff4b0' : t < 0.6 ? '#ffc838' : '#f87820')
      }
      break
    }
    case 'hydropump': {
      const w = 11 * fade + 3
      band(w + 3, '#3868d8', 1.5)
      band(w, '#68a8f8', 1.5)
      band(w * 0.45, '#ffffff', 2.5)
      break
    }
    case 'solarbeam': {
      const w = 16 * fade + 4
      band(w + 10, 'rgba(200,240,112,0.35)', 0, true)
      band(w + 4, '#c8f070', 0, true)
      band(w, '#f8f8a0')
      band(w * 0.5, '#ffffff')
      break
    }
    case 'hyperbeam': {
      const w = 15 * fade + 4
      band(w + 8, 'rgba(248,128,32,0.4)', 0, true)
      band(w + 3, '#f88020')
      band(w, '#ffc050', 0.8)
      band(w * 0.5, '#ffffff')
      break
    }
    case 'icebeam': {
      band(7 * fade + 2, 'rgba(168,224,248,0.6)', 0, true)
      band(3 * fade + 1.5, '#e0f8ff')
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      for (let s = 0; s <= len; s += 6) ctx.lineTo(s, (s / 6) % 2 ? -3 : 3)
      ctx.stroke()
      for (let s = 8; s < len; s += 14) drawShape(ctx, 'flake', s, 0, 3, '#ffffff', time * 4 + s)
      break
    }
    case 'psybeam': {
      for (let s = 0; s < len; s += 7) {
        const r = 3 + Math.sin(s * 0.3 - time * 25) * 1.5 + fade * 2
        ctx.strokeStyle = ['#f878b8', '#ffd0e8', '#b080f0', '#78c8f8'][Math.floor(s / 7) % 4]
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.ellipse(s, 0, 1.6, r, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'dragonpulse': {
      band(9 * fade + 2, 'rgba(112,56,248,0.45)', 0, true)
      ctx.lineWidth = 2
      for (const ph of [0, Math.PI]) {
        ctx.strokeStyle = ph ? '#a080ff' : '#e8d8ff'
        ctx.beginPath()
        for (let s = 0; s <= len; s += 2) ctx.lineTo(s, Math.sin(s * 0.25 - time * 20 + ph) * (4 + fade * 2))
        ctx.stroke()
      }
      break
    }
    case 'flashcannon': {
      const w = 10 * fade + 3
      band(w + 5, 'rgba(255,255,255,0.4)', 0, true)
      band(w, '#c0c0d8')
      band(w * 0.55, '#ffffff')
      star(ctx, len, 0, 10 * fade + 4, 2, time * 4)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      break
    }
    case 'signalbeam': {
      const cols = ['#f85858', '#f8d030', '#58d858', '#58a8f8', '#c058f8']
      for (let s = 0; s < len; s += 6) {
        ctx.strokeStyle = cols[Math.floor(s / 6 + time * 20) % cols.length]
        ctx.lineWidth = 4 * fade + 2
        ctx.beginPath()
        ctx.moveTo(s, 0)
        ctx.lineTo(Math.min(len, s + 6), 0)
        ctx.stroke()
      }
      break
    }
    case 'gunkshot': {
      for (let s = 0; s < len; s += 5) {
        const r = 3 + Math.sin(s * 1.3) * 1.5 + fade * 2
        disc(ctx, s, Math.sin(s) * 2, r + 1, '#682878')
        disc(ctx, s, Math.sin(s) * 2, r, '#a040a0')
      }
      break
    }
    default:
      band(6 * fade + 2, '#ffffff')
  }
  ctx.restore()
}

// ---------------- Area effects ----------------

export function drawArea(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, r: number, k: number, time: number) {
  const f = family(fx)
  const fade = 1 - k
  ctx.globalAlpha = fade
  switch (fx) {
    case 'discharge': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + time * 3
        lightning(ctx, x, y, x + Math.cos(a) * r * (0.5 + k * 0.5), y + Math.sin(a) * r * (0.5 + k * 0.5) * 0.7, 1.8, 4)
      }
      break
    }
    case 'surf': {
      const rr = r * (0.3 + k * 0.8)
      ctx.lineWidth = 7 * fade + 2
      ctx.strokeStyle = '#3868d8'
      ctx.beginPath()
      ctx.ellipse(x, y, rr, rr * 0.6, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 3
      ctx.strokeStyle = '#ffffff'
      ctx.beginPath()
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.2) {
        const w = rr + Math.sin(a * 8 + time * 20) * 2
        ctx.lineTo(x + Math.cos(a) * w, y + Math.sin(a) * w * 0.6 - 3)
      }
      ctx.stroke()
      break
    }
    case 'quake': {
      ctx.strokeStyle = '#604020'
      ctx.lineWidth = 1.6
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + i
        ctx.beginPath()
        ctx.moveTo(x, y)
        let cx = x, cy = y
        for (let s = 1; s <= 4; s++) {
          cx += Math.cos(a + Math.sin(i * 3 + s) * 0.6) * (r / 4) * Math.min(1, k * 3)
          cy += Math.sin(a + Math.sin(i * 3 + s) * 0.6) * (r / 4) * 0.6 * Math.min(1, k * 3)
          ctx.lineTo(cx, cy)
        }
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(160,120,56,0.7)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(x, y, r * k, r * k * 0.6, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'blizzard': {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + time * 5
        const d = r * (0.3 + ((i * 37) % 10) / 14) * (0.5 + k * 0.5)
        drawShape(ctx, 'flake', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 3, '#ffffff', time * 6 + i)
      }
      ctx.fillStyle = 'rgba(200,240,255,0.25)'
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'voice':
    case 'bugbuzz':
    case 'psychic': {
      for (let i = 0; i < 3; i++) {
        const kk = (k + i * 0.22) % 1
        ctx.globalAlpha = fade * (1 - kk)
        ctx.strokeStyle = f.colors[i % f.colors.length]
        ctx.lineWidth = 2.5
        ctx.beginPath()
        if (fx === 'psychic') {
          for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.15) {
            const w = r * kk * (1 + Math.sin(a * 6 + time * 15) * 0.08)
            ctx.lineTo(x + Math.cos(a) * w, y + Math.sin(a) * w * 0.7)
          }
        } else if (fx === 'bugbuzz') {
          for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.1) {
            const w = r * kk + Math.sin(a * 14) * 2
            ctx.lineTo(x + Math.cos(a) * w, y + Math.sin(a) * w * 0.7)
          }
        } else ctx.ellipse(x, y, r * kk, r * kk * 0.7, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'shadowforce':
    case 'nightdaze': {
      const dark = fx === 'shadowforce' ? '#382848' : '#201818'
      const rim = fx === 'shadowforce' ? '#a080e0' : '#c05048'
      ctx.fillStyle = dark
      ctx.globalAlpha = fade * 0.55
      ctx.beginPath()
      ctx.ellipse(x, y, r * k, r * k * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = fade
      ctx.strokeStyle = rim
      ctx.lineWidth = 3
      ctx.stroke()
      break
    }
    default: {
      ctx.strokeStyle = f.colors[1]
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(x, y, r * k, r * k * 0.7, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

/** Landing effect of a targeted (nova) move. */
export function drawImpact(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, r: number, k: number, time: number) {
  const fade = 1 - k
  ctx.globalAlpha = fade
  switch (fx) {
    case 'thunder': {
      if (k < 0.6) lightning(ctx, x + rnd(-6, 6), y - 220, x, y, 4, 9, 3)
      glowCircle(ctx, x, y, r * (0.6 + k), '#fff8a0', 0.6)
      break
    }
    case 'fireblast': {
      // 大-shaped blast
      const arms = [-Math.PI / 2, Math.PI / 2 + 0.6, Math.PI / 2 - 0.6, Math.PI, 0]
      for (const a of arms) {
        for (let s = 0; s < r * (0.4 + k * 0.8); s += 4) {
          const rr = 5 - (s / r) * 2
          disc(ctx, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.75, rr + 1.5, '#e03818')
          disc(ctx, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.75, rr, s < 10 ? '#fff4b0' : '#ffc838')
        }
      }
      break
    }
    case 'dracometeor':
    case 'meteormash':
    case 'focusblast':
    case 'sludgebomb':
    case 'psyshock': {
      const f = family(fx)
      glowCircle(ctx, x, y, r * (0.4 + k * 0.8), f.colors[2], 0.5)
      ctx.strokeStyle = f.colors[1]
      ctx.lineWidth = 4 * fade + 1
      ctx.beginPath()
      ctx.ellipse(x, y, r * (0.3 + k), r * (0.3 + k) * 0.7, 0, 0, Math.PI * 2)
      ctx.stroke()
      disc(ctx, x, y, r * 0.4 * fade, '#ffffff')
      break
    }
    case 'earthpower': {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.4
        const h = 14 * Math.sin(Math.min(1, k * 2.5) * Math.PI)
        ctx.fillStyle = '#f87820'
        ctx.beginPath()
        ctx.moveTo(px - 3, py)
        ctx.lineTo(px, py - h)
        ctx.lineTo(px + 3, py)
        ctx.fill()
      }
      glowCircle(ctx, x, y, r * 0.8, '#f8a040', 0.35)
      break
    }
    case 'rocktomb':
    case 'stoneedge': {
      const n = fx === 'stoneedge' ? 7 : 5
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3
        const px = x + Math.cos(a) * r * 0.5, py = y + Math.sin(a) * r * 0.35
        const h = (fx === 'stoneedge' ? 20 : 13) * Math.min(1, k * 4)
        ctx.globalAlpha = Math.min(1, fade * 2)
        ctx.fillStyle = '#282830'
        ctx.beginPath()
        ctx.moveTo(px - 5, py + 1)
        ctx.lineTo(px - 1, py - h - 1)
        ctx.lineTo(px + 5, py + 1)
        ctx.fill()
        ctx.fillStyle = fx === 'stoneedge' ? '#a0a8c0' : '#b8a038'
        ctx.beginPath()
        ctx.moveTo(px - 4, py)
        ctx.lineTo(px - 1, py - h)
        ctx.lineTo(px + 4, py)
        ctx.fill()
      }
      break
    }
    case 'hurricane': {
      ctx.lineWidth = 2
      for (let i = 0; i < 9; i++) {
        const h = i * 5
        const w = 5 + i * 2.2
        ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.9)' : 'rgba(200,210,248,0.9)'
        ctx.beginPath()
        ctx.ellipse(x + Math.sin(time * 10 + i) * 2, y - h, w, w * 0.35, 0, time * 12 + i, time * 12 + i + 4)
        ctx.stroke()
      }
      break
    }
    default:
      glowCircle(ctx, x, y, r * k, '#ffffff', 0.5)
  }
  ctx.globalAlpha = 1
}

/** Telegraph circle plus anything falling toward it. */
export function drawIncoming(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, r: number, k: number, col: string, time: number) {
  ctx.globalAlpha = 0.18 + k * 0.3
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.ellipse(x, y, r * (0.3 + 0.7 * k), r * (0.3 + 0.7 * k) * 0.7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = col
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  const fall = (size: number, c1: string, c2: string, tail: string) => {
    const sx = x + 70 * (1 - k), sy = y - 160 * (1 - k)
    ctx.strokeStyle = tail
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx + 25, sy - 55)
    ctx.lineTo(sx, sy)
    ctx.stroke()
    disc(ctx, sx, sy, size * 0.9, c1)
    disc(ctx, sx - 1, sy - 1, size * 0.55, c2)
  }
  switch (fx) {
    case 'dracometeor': fall(6, '#7038f8', '#e8d8ff', 'rgba(160,128,255,0.6)'); break
    case 'meteormash': fall(6, '#a8a8c8', '#ffffff', 'rgba(255,255,255,0.6)'); break
    case 'focusblast': fall(5, '#f88030', '#fff8d0', 'rgba(248,160,64,0.6)'); break
    case 'sludgebomb': fall(4.5, '#a040a0', '#f0c0ff', 'rgba(160,64,160,0.5)'); break
    case 'thunder':
      if (Math.sin(time * 30) > 0.3) {
        ctx.globalAlpha = 0.35
        lightning(ctx, x, y - 200, x, y - 140, 1.2, 4)
        ctx.globalAlpha = 1
      }
      break
    case 'psyshock':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + time * 4
        const d = r * (1.4 - k)
        disc(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 3, '#f878b8')
        disc(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 1.5, '#ffffff')
      }
      break
  }
}

// ---------------- Melee & dashes ----------------

export function drawMelee(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, ax: number, ay: number, k: number) {
  const a = Math.atan2(ay, ax)
  const fade = 1 - k
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = fade
  ctx.lineCap = 'round'
  switch (fx) {
    case 'dragonclaw':
    case 'metalclaw': {
      const col = fx === 'dragonclaw' ? '#a080ff' : fx === 'metalclaw' ? '#e8e8f8' : '#ffffff'
      const grow = Math.min(1, k * 4)
      ctx.rotate(a + 0.8)
      for (let i = -1; i <= 1; i++) {
        ctx.strokeStyle = '#282830'
        ctx.lineWidth = 3.4
        ctx.beginPath()
        ctx.moveTo(i * 4, -9)
        ctx.lineTo(i * 4, -9 + 18 * grow)
        ctx.stroke()
        ctx.strokeStyle = col
        ctx.lineWidth = 2
        ctx.stroke()
      }
      break
    }
    case 'bite':
    case 'bugbite': {
      const close = Math.min(1, k * 3.5)
      const off = 9 * (1 - close)
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = fx === 'bugbite' ? '#708010' : '#282830'
      ctx.lineWidth = 1
      for (const side of [-1, 1]) {
        ctx.beginPath()
        for (let i = 0; i < 4; i++) {
          const px = -8 + i * 4.5
          ctx.moveTo(px, side * (off + 1))
          ctx.lineTo(px + 2.2, side * (off - 4))
          ctx.lineTo(px + 4.5, side * (off + 1))
        }
        ctx.fill()
        ctx.stroke()
      }
      break
    }
    case 'whip': {
      ctx.rotate(a)
      for (const s of [-1, 1]) {
        ctx.strokeStyle = '#2c7a30'
        ctx.lineWidth = 2.6
        ctx.beginPath()
        ctx.moveTo(-14, s * 4)
        ctx.quadraticCurveTo(-2, s * (12 - k * 16), 10, s * 2)
        ctx.stroke()
        ctx.strokeStyle = '#78d050'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      break
    }
    case 'lick': {
      ctx.rotate(a)
      ctx.fillStyle = '#f080b0'
      ctx.beginPath()
      ctx.ellipse(-2 + k * 6, 0, 9, 4, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#a04070'
      ctx.lineWidth = 1
      ctx.stroke()
      break
    }
    default: {
      // tackle / kick: impact star
      const s = 6 + k * 8
      star(ctx, 0, 0, s, s * 0.45, a)
      ctx.fillStyle = fx === 'kick' ? '#ffc860' : '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#282830'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Aura drawn around a dashing Pokémon. */
export function drawDashAura(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, vx: number, vy: number, time: number) {
  const a = Math.atan2(vy, vx)
  switch (fx) {
    case 'flamewheel': {
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2 + time * 16
        disc(ctx, x + Math.cos(t) * 11, y + Math.sin(t) * 9, 3.5, i % 2 ? '#ffc838' : '#f87820')
      }
      break
    }
    case 'aquajet': {
      ctx.strokeStyle = 'rgba(104,168,248,0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      for (let s = 0; s < 30; s += 2) ctx.lineTo(x - Math.cos(a) * s + Math.sin(s * 0.5 + time * 30) * 3, y - Math.sin(a) * s)
      ctx.stroke()
      break
    }
    case 'spark':
      for (let i = 0; i < 3; i++) {
        const t = Math.random() * Math.PI * 2
        lightning(ctx, x, y, x + Math.cos(t) * 13, y + Math.sin(t) * 11, 1.2, 3)
      }
      break
    case 'aerialace':
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.2
      for (let i = -2; i <= 2; i++) {
        const ox = -Math.sin(a) * i * 4, oy = Math.cos(a) * i * 4
        ctx.beginPath()
        ctx.moveTo(x + ox - Math.cos(a) * 10, y + oy - Math.sin(a) * 10)
        ctx.lineTo(x + ox - Math.cos(a) * 26, y + oy - Math.sin(a) * 26)
        ctx.stroke()
      }
      break
    case 'closecombat':
      for (let i = 0; i < 2; i++) {
        star(ctx, x + rnd(-10, 10), y + rnd(-12, 4), 5, 2.2, Math.random() * 6)
        ctx.fillStyle = '#ffe0a0'
        ctx.fill()
      }
      break
    case 'shadowsneak':
      ctx.fillStyle = 'rgba(56,40,72,0.55)'
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath()
        ctx.ellipse(x - Math.cos(a) * i * 7, y - Math.sin(a) * i * 7, 8, 5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
  }
}

/** Energy gathering around a Pokémon charging a big move. */
export function drawCharge(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, k: number, time: number) {
  const f = family(fx)
  glowCircle(ctx, x, y, 6 + k * 10, f.colors[1], 0.35 + k * 0.3)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + time * 3
    const d = 22 * (1 - k) + 4
    disc(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, f.colors[0])
  }
}
