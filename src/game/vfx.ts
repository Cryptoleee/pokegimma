import { TILE } from './world'

/**
 * Effect engine: particles, emitters, shockwaves, lightning, beams, ground decals
 * and screen effects. Positions are in tiles; sizes are in world px.
 * Per-move choreography lives in moveFx.ts.
 */

export type Shape =
  | 'glow' | 'dot' | 'sq' | 'flame' | 'leaf' | 'flake' | 'star' | 'drop' | 'rock' | 'ring' | 'streak'
  | 'smoke' | 'bubble' | 'shard' | 'note'

export interface Particle {
  x: number
  y: number
  /** Height above the ground (tiles); debris hops on this axis. */
  z: number
  vx: number
  vy: number
  vz: number
  t: number
  life: number
  s0: number
  s1: number
  cols: string[]
  shape: Shape
  rot: number
  vr: number
  grav: number
  zgrav: number
  drag: number
  add: boolean
  alpha: number
}

export interface Emitter {
  t: number
  life: number
  fn: (dt: number, k: number) => void
}

export type DecalKind = 'scorch' | 'crater' | 'frost' | 'puddle' | 'crack' | 'slime' | 'leaves' | 'glass'

export interface Decal {
  x: number
  y: number
  r: number
  kind: DecalKind
  t: number
  life: number
  seed: number
}

interface Ring {
  x: number
  y: number
  r: number
  t: number
  life: number
  col: string
  w: number
}

/** Anime-style hit flare: a bright four-point star of light. */
interface Flare {
  x: number
  y: number
  size: number
  col: string
  t: number
  life: number
  rot: number
}

interface Flash {
  x: number
  y: number
  r: number
  t: number
  life: number
  col: string
}

export interface Bolt {
  x1: number
  y1: number
  x2: number
  y2: number
  t: number
  life: number
  w: number
  jag: number
  branches: number
  strands: number
  col: string
}

export interface Beam {
  x1: number
  y1: number
  x2: number
  y2: number
  style: string
  t: number
  life: number
  w: number
}

export interface Pillar {
  x: number
  y: number
  h: number
  w: number
  t: number
  life: number
  col: string
  dark: string
  delay: number
  /** Dust kicked up as it rises (default: earth). */
  dust?: string
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export interface BurstOpts {
  n?: number
  speed?: number
  cols?: string[]
  shape?: Shape
  s0?: number
  s1?: number
  life?: number
  grav?: number
  zgrav?: number
  vz?: number
  drag?: number
  add?: boolean
  dir?: number
  spread?: number
  /** Squash vertical spread for a top-down feel. */
  flat?: number
  jitter?: number
  alpha?: number
  vr?: number
}

export class Vfx {
  parts: Particle[] = []
  emitters: Emitter[] = []
  decals: Decal[] = []
  rings: Ring[] = []
  flashes: Flash[] = []
  flares: Flare[] = []
  bolts: Bolt[] = []
  beams: Beam[] = []
  pillars: Pillar[] = []
  shake = 0
  screenFlash = 0
  screenFlashCol = '255,255,230'
  dim: { col: string; t: number; life: number } | null = null

  burst(x: number, y: number, o: BurstOpts = {}) {
    const n = o.n ?? 8
    if (this.parts.length > 1500) return
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + rnd(-(o.spread ?? 0.5), o.spread ?? 0.5) : rnd(0, Math.PI * 2)
      const sp = rnd((o.speed ?? 3) * 0.35, o.speed ?? 3)
      const j = o.jitter ?? 0.1
      this.parts.push({
        x: x + rnd(-j, j), y: y + rnd(-j, j), z: 0,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * (o.flat ?? 1), vz: o.vz !== undefined ? rnd(o.vz * 0.5, o.vz) : 0,
        t: 0, life: rnd((o.life ?? 0.5) * 0.6, o.life ?? 0.5),
        s0: o.s0 ?? rnd(2, 3.5), s1: o.s1 ?? 0.5,
        cols: o.cols ?? ['#ffffff'], shape: o.shape ?? 'dot',
        rot: rnd(0, 6.28), vr: o.vr ?? rnd(-8, 8), grav: o.grav ?? 0, zgrav: o.zgrav ?? 0, drag: o.drag ?? 1.5,
        add: o.add ?? false, alpha: o.alpha ?? 1,
      })
    }
  }

  emitter(life: number, fn: (dt: number, k: number) => void) {
    this.emitters.push({ t: 0, life, fn })
  }
  ring(x: number, y: number, r: number, col: string, life = 0.45, w = 4) {
    this.rings.push({ x, y, r, t: 0, life, col, w })
  }
  glow(x: number, y: number, r: number, col: string, life = 0.3) {
    this.flashes.push({ x, y, r, t: 0, life, col })
  }
  /** A four-point star of light (size in world px). */
  flare(x: number, y: number, size: number, col: string, life = 0.22) {
    if (this.flares.length > 18) this.flares.shift()
    this.flares.push({ x, y, size, col, t: 0, life, rot: (Math.random() - 0.5) * 0.5 })
  }
  decal(x: number, y: number, r: number, kind: DecalKind, life = 4) {
    if (this.decals.length > 80) this.decals.shift()
    this.decals.push({ x, y, r, kind, t: 0, life, seed: Math.random() * 1000 })
  }
  bolt(x1: number, y1: number, x2: number, y2: number, o: Partial<Bolt> = {}) {
    this.bolts.push({ x1, y1, x2, y2, t: 0, life: 0.25, w: 2, jag: 6, branches: 1, strands: 1, col: '#f8d030', ...o })
  }
  beam(x1: number, y1: number, x2: number, y2: number, style: string, life: number, w: number) {
    this.beams.push({ x1, y1, x2, y2, style, t: 0, life, w })
  }
  pillar(x: number, y: number, h: number, w: number, col: string, dark: string, life = 0.9, delay = 0, dust?: string) {
    this.pillars.push({ x, y, h, w, t: -delay, life, col, dark, delay, dust })
  }
  /** Position hint for the screen effects that follow (used to sync effects in multiplayer). */
  mark(_x: number, _y: number) {}
  shakeBy(a: number) {
    this.shake = Math.max(this.shake, a)
  }
  flash(a: number, col = '255,255,230') {
    this.screenFlash = Math.max(this.screenFlash, a)
    this.screenFlashCol = col
  }
  dimScreen(col: string, life = 0.9) {
    this.dim = { col, t: 0, life }
  }

  update(dt: number) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]
      e.t += dt
      if (e.t >= e.life) {
        this.emitters.splice(i, 1)
        continue
      }
      e.fn(dt, e.t / e.life)
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      p.t += dt
      if (p.t >= p.life) {
        this.parts.splice(i, 1)
        continue
      }
      const d = 1 - Math.min(1, dt * p.drag)
      p.vx *= d
      p.vy = p.vy * d + p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.zgrav) {
        p.vz -= p.zgrav * dt
        p.z += p.vz * dt
        if (p.z < 0) {
          p.z = 0
          p.vz = -p.vz * 0.4
          p.vx *= 0.6
          p.vy *= 0.6
        }
      }
      p.rot += p.vr * dt
    }
    const age = <T extends { t: number; life: number }>(arr: T[]) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].t += dt
        if (arr[i].t >= arr[i].life) arr.splice(i, 1)
      }
    }
    age(this.rings)
    age(this.flashes)
    age(this.flares)
    age(this.bolts)
    age(this.beams)
    age(this.decals)
    age(this.pillars)
    if (this.dim) {
      this.dim.t += dt
      if (this.dim.t >= this.dim.life) this.dim = null
    }
    this.shake = Math.max(0, this.shake - dt * 22)
    this.screenFlash = Math.max(0, this.screenFlash - dt * 2.5)
  }

  // ---------------- Drawing ----------------

  drawDecals(ctx: CanvasRenderingContext2D) {
    for (const d of this.decals) {
      const k = d.t / d.life
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
      drawDecal(ctx, d, k)
    }
    ctx.globalAlpha = 1
  }

  /** Effects that sit on the ground below the actors. */
  drawUnder(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) if (p.shape === 'rock' || p.shape === 'leaf') shadowDot(ctx, p.x * TILE, p.y * TILE, p.s0 * 0.8)
  }

  drawDim(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const d = this.dim
    if (!d) return
    const k = d.t / d.life
    const env = k < 0.15 ? k / 0.15 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
    ctx.globalAlpha = env * 0.55
    ctx.fillStyle = d.col
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    for (const p of this.pillars) drawPillar(ctx, p, this)
    for (const b of this.beams) drawBeam(ctx, b, time)
    for (const f of this.flashes) {
      const k = f.t / f.life
      drawGlow(ctx, f.x * TILE, f.y * TILE, f.r * (0.6 + k * 0.6), f.col, (1 - k) * 0.95)
    }
    for (const r of this.rings) drawRing(ctx, r)
    for (const b of this.bolts) drawBolt(ctx, b)
    for (const p of this.parts) drawParticle(ctx, p)
    for (const f of this.flares) drawFlare(ctx, f)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}

// ---------------- Primitives ----------------

/** Four-point star flare: two long thin streaks of light that flare out and fade fast. */
function drawFlare(ctx: CanvasRenderingContext2D, f: Flare) {
  const k = f.t / f.life
  // Snaps open, then shrinks away
  const open = k < 0.18 ? k / 0.18 : 1 - (k - 0.18) / 0.82
  const len = f.size * (0.7 + 0.5 * Math.min(1, k * 4))
  const a = Math.max(0, open)
  ctx.save()
  ctx.translate(f.x * TILE, f.y * TILE)
  ctx.rotate(f.rot)
  for (let i = 0; i < 2; i++) {
    ctx.save()
    ctx.rotate((i * Math.PI) / 2)
    ctx.scale(1, 0.09)
    drawGlow(ctx, 0, 0, len, f.col, a)
    ctx.restore()
  }
  drawGlow(ctx, 0, 0, f.size * 0.35, '#ffffff', a)
  ctx.restore()
}

const glowCache = new Map<string, HTMLCanvasElement>()

/** Soft radial glow sprite, drawn additively. */
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha = 1) {
  if (r <= 0 || alpha <= 0) return
  let c = glowCache.get(col)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, col + 'cc')
    grad.addColorStop(0.3, col + '66')
    grad.addColorStop(0.65, col + '1c')
    grad.addColorStop(1, col + '00')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    glowCache.set(col, c)
  }
  const prevOp = ctx.globalCompositeOperation
  const prevA = ctx.globalAlpha
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = prevA * Math.min(1, alpha)
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2)
  ctx.globalCompositeOperation = prevOp
  ctx.globalAlpha = prevA
}

export function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  if (r <= 0) return
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function shadowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, rot: number, points = 5) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? r2 : r1
    const a = rot + (i * Math.PI) / points - Math.PI / 2
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, s: number, col: string, rot = 0) {
  ctx.fillStyle = col
  ctx.strokeStyle = col
  switch (shape) {
    case 'sq':
      ctx.fillRect(x - s / 2, y - s / 2, s, s)
      break
    case 'dot':
      disc(ctx, x, y, s, col)
      break
    case 'bubble':
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillRect(x - s * 0.45, y - s * 0.45, s * 0.45, s * 0.45)
      break
    case 'drop':
      disc(ctx, x, y, s * 0.85, col)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - s * 0.4, y - s * 0.45, s * 0.4, s * 0.4)
      break
    case 'ring':
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'leaf':
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 1.4, s * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(30,80,30,0.8)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(-s * 1.3, 0)
      ctx.lineTo(s * 1.3, 0)
      ctx.stroke()
      ctx.restore()
      break
    case 'flake':
      ctx.lineWidth = 0.9
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3)
        ctx.beginPath()
        ctx.moveTo(-s, 0)
        ctx.lineTo(s, 0)
        ctx.moveTo(s * 0.6, 0)
        ctx.lineTo(s * 0.85, s * 0.3)
        ctx.moveTo(-s * 0.6, 0)
        ctx.lineTo(-s * 0.85, -s * 0.3)
        ctx.stroke()
      }
      ctx.restore()
      break
    case 'star':
      star(ctx, x, y, s * 1.2, s * 0.5, rot)
      ctx.fill()
      break
    case 'shard':
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.moveTo(s * 1.4, 0)
      ctx.lineTo(0, -s * 0.5)
      ctx.lineTo(-s * 1.1, 0)
      ctx.lineTo(0, s * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      break
    case 'note':
      ctx.fillRect(x + s * 0.4, y - s * 1.6, s * 0.3, s * 1.6)
      ctx.beginPath()
      ctx.ellipse(x, y, s * 0.6, s * 0.45, -0.4, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'rock':
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.fillStyle = 'rgba(40,40,48,0.9)'
      rockPath(ctx, s + 0.8)
      ctx.fill()
      ctx.fillStyle = col
      rockPath(ctx, s)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(-s * 0.5, -s * 0.6, s * 0.6, s * 0.35)
      ctx.restore()
      break
  }
}

function rockPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(-s, -s * 0.3)
  ctx.lineTo(-s * 0.3, -s)
  ctx.lineTo(s * 0.8, -s * 0.5)
  ctx.lineTo(s, s * 0.5)
  ctx.lineTo(-s * 0.6, s * 0.8)
  ctx.closePath()
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const k = p.t / p.life
  const s = p.s0 + (p.s1 - p.s0) * k
  const col = p.cols[Math.min(p.cols.length - 1, Math.floor(k * p.cols.length))]
  const a = p.alpha * (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35)
  const px = p.x * TILE, py = (p.y - p.z) * TILE
  ctx.globalAlpha = a
  switch (p.shape) {
    case 'glow':
      drawGlow(ctx, px, py, s, col, a)
      break
    case 'flame':
      drawGlow(ctx, px, py, s * 1.8, col, a * 0.3)
      disc(ctx, px, py, s * 0.85, col)
      if (k < 0.35) disc(ctx, px - s * 0.15, py - s * 0.15, s * 0.4, '#fff8d0')
      break
    case 'streak': {
      const sp = Math.hypot(p.vx, p.vy) || 1
      const len = Math.min(14, sp * 1.6) + s
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'
      ctx.strokeStyle = col
      ctx.lineWidth = Math.max(0.6, s * 0.45)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(px - (p.vx / sp) * len, py - (p.vy / sp) * len)
      ctx.lineTo(px, py)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    case 'smoke':
      ctx.globalAlpha = a * 0.45
      disc(ctx, px, py, s, col)
      ctx.globalAlpha = a * 0.25
      disc(ctx, px - s * 0.3, py - s * 0.3, s * 0.6, '#ffffff')
      break
    default:
      if (p.add) ctx.globalCompositeOperation = 'lighter'
      drawShape(ctx, p.shape, px, py, s, col, p.rot)
      ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = 1
}

function drawRing(ctx: CanvasRenderingContext2D, r: Ring) {
  const k = r.t / r.life
  const e = 1 - Math.pow(1 - k, 3)
  const rad = r.r * TILE * (0.15 + 0.85 * e)
  const px = r.x * TILE, py = r.y * TILE
  ctx.globalAlpha = 1 - k
  ctx.lineWidth = r.w * (1 - k * 0.7) + 0.5
  ctx.strokeStyle = r.col
  ctx.beginPath()
  ctx.ellipse(px, py, rad, rad * 0.62, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = Math.max(0.6, r.w * 0.35 * (1 - k))
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(px, py, rad * 0.94, rad * 0.62 * 0.94, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** Jagged lightning between two points (world px). */
export function lightning(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, jag: number, branches = 0, col = '#f8d030') {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  const segs = Math.max(4, Math.round(len / 6))
  const pts: [number, number][] = [[x1, y1]]
  for (let i = 1; i < segs; i++) {
    const t = i / segs
    const taper = Math.sin(t * Math.PI)
    const o = (Math.random() * 2 - 1) * jag * (0.4 + taper * 0.6)
    pts.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o])
  }
  pts.push([x2, y2])
  const path = () => {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const prev = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = col + '55'
  ctx.lineWidth = width * 4
  path()
  ctx.stroke()
  ctx.strokeStyle = col
  ctx.lineWidth = width * 1.6
  path()
  ctx.stroke()
  ctx.globalCompositeOperation = prev
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(0.7, width * 0.6)
  path()
  ctx.stroke()
  for (let b = 0; b < branches; b++) {
    const [sx, sy] = pts[1 + Math.floor(Math.random() * (pts.length - 2))]
    const a = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 1.1)
    const l = rnd(len * 0.12, len * 0.3)
    lightning(ctx, sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, width * 0.55, jag * 0.6, 0, col)
  }
}

function drawBolt(ctx: CanvasRenderingContext2D, b: Bolt) {
  const k = b.t / b.life
  // Lightning flickers out rather than fading smoothly.
  if (k > 0.5 && Math.random() < 0.35) return
  ctx.globalAlpha = k < 0.5 ? 1 : 1.4 - k
  const x1 = b.x1 * TILE, y1 = b.y1 * TILE, x2 = b.x2 * TILE, y2 = b.y2 * TILE
  for (let s = 0; s < b.strands; s++) lightning(ctx, x1, y1, x2, y2, b.w * (s ? 0.6 : 1), b.jag, b.branches, b.col)
  drawGlow(ctx, x2, y2, 10 + b.w * 4, '#fff8c0', 0.8 * (1 - k))
  drawGlow(ctx, x1, y1, 6 + b.w * 2, '#fff8c0', 0.6 * (1 - k))
  ctx.globalAlpha = 1
}

function drawPillar(ctx: CanvasRenderingContext2D, p: Pillar, v: Vfx) {
  if (p.t < 0) return
  const k = p.t / p.life
  const rise = Math.min(1, p.t / 0.12)
  const sink = k > 0.75 ? (k - 0.75) / 0.25 : 0
  const h = p.h * rise * (1 - sink * 0.6)
  const px = p.x * TILE, py = p.y * TILE
  if (rise < 1 && Math.random() < 0.5) v.burst(p.x, p.y, { n: 1, cols: p.dust ? [p.dust, p.dust] : ['#c8b890', '#a09070'], shape: 'smoke', s0: 3, s1: 7, life: 0.5, speed: 1, flat: 0.5 })
  ctx.globalAlpha = 1 - sink
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(px, py, p.w * 1.1, p.w * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#282830'
  ctx.beginPath()
  ctx.moveTo(px - p.w - 1, py + 1)
  ctx.lineTo(px - p.w * 0.15, py - h - 1.5)
  ctx.lineTo(px + p.w + 1, py + 1)
  ctx.fill()
  ctx.fillStyle = p.col
  ctx.beginPath()
  ctx.moveTo(px - p.w, py)
  ctx.lineTo(px - p.w * 0.15, py - h)
  ctx.lineTo(px + p.w, py)
  ctx.fill()
  ctx.fillStyle = p.dark
  ctx.beginPath()
  ctx.moveTo(px - p.w * 0.15, py - h)
  ctx.lineTo(px + p.w, py)
  ctx.lineTo(px + p.w * 0.2, py)
  ctx.fill()
  ctx.globalAlpha = 1
}

/** Ground marks that linger: scorch, craters, frost, puddles, cracks. */
const softCache = new Map<string, HTMLCanvasElement>()

/** Soft-edged blotch (normal blending) used for ground marks. */
function soft(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, rgb: string, alpha: number) {
  let c = softCache.get(rgb)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, `rgba(${rgb},1)`)
    grad.addColorStop(0.55, `rgba(${rgb},0.75)`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    softCache.set(rgb, c)
  }
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * alpha
  ctx.drawImage(c, x - rx, y - rx * 0.6, rx * 2, rx * 1.2)
  ctx.globalAlpha = prev
}

/** Ground marks that linger: scorch, craters, frost, puddles, cracks. */
function drawDecal(ctx: CanvasRenderingContext2D, d: Decal, k: number) {
  const x = d.x * TILE, y = d.y * TILE, r = d.r * TILE
  let s = d.seed
  const r01 = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const blots = (rgb: string, alpha: number, n = 4) => {
    soft(ctx, x, y, r, rgb, alpha)
    for (let i = 0; i < n; i++) soft(ctx, x + (r01() - 0.5) * r, y + (r01() - 0.5) * r * 0.5, r * (0.35 + r01() * 0.35), rgb, alpha * 0.8)
  }
  switch (d.kind) {
    case 'scorch':
      blots('30,20,12', 0.5)
      if (k < 0.35) {
        const e = 1 - k / 0.35
        for (let i = 0; i < 4; i++) drawGlow(ctx, x + (r01() - 0.5) * r, y + (r01() - 0.5) * r * 0.5, 3 + r01() * 3, '#f87820', e * 0.9)
      }
      break
    case 'crater':
      blots('50,36,22', 0.55)
      ctx.strokeStyle = 'rgba(30,20,12,0.45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.6, r * 0.36, 0, Math.PI + 0.3, -0.3)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.6, r * 0.36, 0, 0.3, Math.PI - 0.3)
      ctx.stroke()
      break
    case 'frost':
      blots('220,244,255', 0.6)
      for (let i = 0; i < 4; i++) drawShape(ctx, 'flake', x + (r01() - 0.5) * r * 1.2, y + (r01() - 0.5) * r * 0.6, 2.2, '#ffffff', r01() * 6)
      break
    case 'puddle':
      blots('70,130,230', 0.45, 2)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillRect(x - r * 0.3, y - r * 0.12, r * 0.35, 1.2)
      break
    case 'slime':
      blots('110,36,130', 0.5, 3)
      break
    case 'leaves':
      for (let i = 0; i < 7; i++) drawShape(ctx, 'leaf', x + (r01() - 0.5) * r * 1.6, y + (r01() - 0.5) * r * 0.9, 2.2, r01() > 0.5 ? '#58b040' : '#3c8c34', r01() * 6)
      break
    case 'glass':
      blots('255,255,220', 0.35, 2)
      break
    case 'crack': {
      soft(ctx, x, y, r * 0.5, '50,34,20', 0.5)
      ctx.strokeStyle = 'rgba(40,26,14,0.7)'
      ctx.lineWidth = 1.4
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + r01()
        let cx = x, cy = y
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        for (let j = 0; j < 4; j++) {
          cx += Math.cos(a + (r01() - 0.5) * 0.9) * (r / 4)
          cy += Math.sin(a + (r01() - 0.5) * 0.9) * (r / 4) * 0.6
          ctx.lineTo(cx, cy)
        }
        ctx.stroke()
      }
      break
    }
  }
}

// ---------------- Beams ----------------

function drawBeam(ctx: CanvasRenderingContext2D, b: Beam, time: number) {
  const k = b.t / b.life
  const x1 = b.x1 * TILE, y1 = b.y1 * TILE
  const fullLen = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) * TILE
  const a = Math.atan2(b.y2 - b.y1, b.x2 - b.x1)
  const grow = Math.min(1, b.t / 0.08)
  const len = fullLen * (1 - Math.pow(1 - grow, 2))
  // Width envelope: punch in, hold, taper out.
  const env = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : k < 0.6 ? 1.2 - ((k - 0.12) / 0.48) * 0.2 : (1 - k) / 0.4
  const w = b.w * env
  ctx.save()
  ctx.translate(x1, y1)
  ctx.rotate(a)
  ctx.lineCap = 'round'
  const band = (width: number, col: string, wob = 0, freq = 0.35, speed = 30, add = false) => {
    if (width <= 0) return
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over'
    ctx.strokeStyle = col
    ctx.lineWidth = width
    ctx.beginPath()
    for (let s = 0; s <= len; s += 2.5) ctx.lineTo(s, Math.sin(s * freq - time * speed) * wob * Math.min(1, s / 12))
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }
  const flare = (col: string, r: number) => {
    drawGlow(ctx, 0, 0, r, col, 0.9)
    drawGlow(ctx, len, 0, r * 1.2, col, 0.9 * grow)
  }
  switch (b.style) {
    case 'flamethrower':
      // the stream itself is mostly particles; this is the hot core
      band(w * 0.9, 'rgba(248,120,32,0.35)', 2, 0.5, 40, true)
      band(w * 0.35, '#fff4b0', 1.5, 0.5, 40, true)
      flare('#f87820', 14)
      break
    case 'hydropump':
      band(w + 6, 'rgba(56,104,216,0.5)', 2)
      band(w + 2, '#3868d8', 2.5)
      band(w, '#68a8f8', 2.5)
      band(w * 0.55, '#b8e0ff', 3.5, 0.5)
      band(w * 0.22, '#ffffff', 4, 0.6, 45)
      flare('#68a8f8', 18)
      break
    case 'solarbeam':
      band(w + 16, 'rgba(200,240,112,0.3)', 0, 0, 0, true)
      band(w + 7, '#c8f070', 0, 0, 0, true)
      band(w, '#f8f8a0', 1, 0.3)
      band(w * 0.55, '#ffffff')
      for (let s = (time * 140) % 18; s < len; s += 18) drawGlow(ctx, s, Math.sin(s + time * 9) * w * 0.4, 5, '#ffffff', 0.9)
      flare('#f8f8a0', 26)
      break
    case 'hyperbeam':
      band(w + 16, 'rgba(248,128,32,0.35)', 0, 0, 0, true)
      band(w + 6, '#f88020', 1)
      band(w, '#ffc050', 1.2)
      band(w * 0.5, '#ffffff', 0.6)
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = '#fff0b0'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        for (let s = 0; s <= len; s += 3) ctx.lineTo(s, Math.sin(s * 0.18 - time * 35 + i * Math.PI) * (w * 0.75 + 3))
        ctx.stroke()
      }
      flare('#ffc050', 26)
      break
    case 'icebeam':
      band(w + 6, 'rgba(168,224,248,0.5)', 0, 0, 0, true)
      band(w * 0.6, '#e0f8ff')
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      for (let s = 0; s <= len; s += 6) ctx.lineTo(s, (Math.floor(s / 6) % 2 ? -1 : 1) * (w * 0.6 + 2))
      ctx.stroke()
      for (let s = 10; s < len; s += 16) drawShape(ctx, 'flake', s, 0, 4, '#ffffff', time * 5 + s)
      flare('#a8e0f8', 16)
      break
    case 'psybeam':
      for (let s = 0; s < len; s += 7) {
        const r = w * 0.7 + Math.sin(s * 0.3 - time * 25) * 2
        ctx.strokeStyle = ['#f878b8', '#ffd0e8', '#b080f0', '#78c8f8', '#f8e060'][Math.floor(s / 7) % 5]
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(s, 0, 2, Math.max(1, r), 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      band(w * 0.3, 'rgba(255,208,232,0.8)', 0, 0, 0, true)
      flare('#f878b8', 14)
      break
    case 'dragonpulse':
      band(w + 8, 'rgba(112,56,248,0.4)', 0, 0, 0, true)
      for (const ph of [0, Math.PI]) {
        ctx.strokeStyle = ph ? '#a080ff' : '#e8d8ff'
        ctx.lineWidth = 3
        ctx.beginPath()
        for (let s = 0; s <= len; s += 2) ctx.lineTo(s, Math.sin(s * 0.22 - time * 22 + ph) * (w * 0.6 + 2))
        ctx.stroke()
      }
      flare('#a080ff', 18)
      break
    case 'flashcannon':
      band(w + 10, 'rgba(255,255,255,0.35)', 0, 0, 0, true)
      band(w, '#c0c0d8')
      band(w * 0.6, '#ffffff')
      star(ctx, len, 0, w + 10, 3, time * 4, 4)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      flare('#ffffff', 18)
      break
    case 'signalbeam': {
      const cols = ['#f85858', '#f8d030', '#58d858', '#58a8f8', '#c058f8']
      for (let s = 0; s < len; s += 6) {
        ctx.strokeStyle = cols[Math.floor(s / 6 + time * 20) % cols.length]
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.moveTo(s, 0)
        ctx.lineTo(Math.min(len, s + 6), 0)
        ctx.stroke()
      }
      band(w * 0.35, '#ffffff')
      flare('#c8d840', 14)
      break
    }
    case 'gunkshot':
      for (let s = 0; s < len; s += 5) {
        const r = w * 0.5 + Math.sin(s * 1.3 + time * 10) * 1.5
        disc(ctx, s, Math.sin(s) * 2, r + 1.2, '#4a1858')
        disc(ctx, s, Math.sin(s) * 2, r, '#a040a0')
        disc(ctx, s - 1, Math.sin(s) * 2 - 1, r * 0.35, '#e0a0f0')
      }
      flare('#a040a0', 12)
      break
    default:
      band(w, '#ffffff')
  }
  ctx.restore()
}
