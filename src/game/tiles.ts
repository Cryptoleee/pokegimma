import type { WorldTheme } from '../data/themes'

/**
 * Black/White-style pixel art for the overworld, generated in code so it tiles
 * cleanly on the 16 px grid and takes its colours from the world theme.
 * Animated pieces (tall grass, flowers, water ripples) come as frame strips
 * that the renderer picks from every frame; the rest is baked into the map.
 * Everything is cached per theme.
 */

export const TS = 16

// ---------------------------------------------------------------- colour helpers

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
/** Blend a toward b by k (0..1). */
export function mix(a: string, b: string, k: number) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b)
  return hex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k)
}
/** Darker (k < 0) or lighter (k > 0). */
export const shade = (c: string, k: number) => (k < 0 ? mix(c, '#000000', -k) : mix(c, '#ffffff', k))

function mk(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
/** Cheap integer hash → 0..1. */
export function hash(a: number, b: number, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** Soft low-frequency tone (-1..1) so big fields aren't one flat colour. */
export function tone(tx: number, ty: number) {
  return (Math.sin(tx * 0.23 + Math.sin(ty * 0.11) * 2) + Math.sin(ty * 0.19 + tx * 0.07) + Math.sin((tx - ty) * 0.13)) / 3
}

type Px = (x: number, y: number, c: string) => void
const pxOf = (g: CanvasRenderingContext2D): Px => (x, y, c) => {
  g.fillStyle = c
  g.fillRect(x, y, 1, 1)
}

// ---------------------------------------------------------------- short grass

/** Little grass tufts (dark strokes with a lit tip), BW style. [dx, dy, kind] kind 0 = dark, 1 = light */
const TUFTS: [number, number, number][][] = [
  // "w" tuft
  [[0, 2, 0], [1, 1, 0], [2, 2, 0], [3, 1, 0], [4, 2, 0], [1, 0, 1], [3, 0, 1]],
  // two blades
  [[0, 2, 0], [1, 1, 0], [1, 0, 1], [3, 2, 0], [2, 1, 0], [2, 0, 1]],
  // single "v"
  [[0, 1, 0], [1, 2, 0], [2, 1, 0], [0, 0, 1], [2, 0, 1]],
  // small clump
  [[1, 0, 1], [0, 1, 0], [1, 1, 0], [2, 1, 0], [1, 2, 0], [3, 2, 0], [3, 1, 1]],
]

/** One short-grass tile: base with a soft tone, a few tufts, now and then a pebble or a tiny flower. */
export function paintGrass(g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, th: WorldTheme) {
  const [base, dark, light] = th.grass
  const t = tone(tx, ty)
  g.fillStyle = t > 0 ? mix(base, light, t * 0.18) : mix(base, dark, -t * 0.22)
  g.fillRect(x, y, TS, TS)
  const px = pxOf(g)
  const dk = mix(dark, base, 0.15), lt = mix(light, '#ffffff', 0.1)
  const n = 2 + Math.floor(hash(tx, ty, 1) * 3)
  for (let i = 0; i < n; i++) {
    const shape = TUFTS[Math.floor(hash(tx, ty, 10 + i) * TUFTS.length)]
    const ox = 1 + Math.floor(hash(tx, ty, 20 + i) * 10), oy = 1 + Math.floor(hash(tx, ty, 30 + i) * 11)
    for (const [dx, dy, k] of shape) px(x + ox + dx, y + oy + dy, k ? lt : dk)
  }
  // Light specks
  if (hash(tx, ty, 40) < 0.5) px(x + 1 + Math.floor(hash(tx, ty, 41) * 14), y + 1 + Math.floor(hash(tx, ty, 42) * 14), lt)
  const r = hash(tx, ty, 50)
  if (r < 0.035) {
    // pebble
    const ox = x + 3 + Math.floor(hash(tx, ty, 51) * 9), oy = y + 4 + Math.floor(hash(tx, ty, 52) * 8)
    const [ol, rb, rh] = th.rock
    px(ox, oy + 1, ol); px(ox + 1, oy + 1, ol); px(ox + 2, oy + 1, ol)
    px(ox, oy, rb); px(ox + 1, oy, rh); px(ox + 2, oy, rb)
  } else if (r < 0.07 && th.flowers.length) {
    // a tiny flower in the lawn
    const c = th.flowers[Math.floor(hash(tx, ty, 53) * th.flowers.length)]
    const ox = x + 3 + Math.floor(hash(tx, ty, 54) * 9), oy = y + 3 + Math.floor(hash(tx, ty, 55) * 9)
    px(ox, oy, c); px(ox + 2, oy, c); px(ox + 1, oy - 1, c); px(ox + 1, oy + 1, c)
    px(ox + 1, oy, '#fff4b0')
  }
}

// ---------------------------------------------------------------- tall grass

export const TALL_FRAMES = 4
export const TALL_VARIANTS = 3
/** Tall grass sprites stick out this many pixels above their tile. */
export const TALL_TOP = 5

interface Blade { x: number; h: number; w: number; lean: number; front: boolean }

/** The dark bed under the blades (baked into the ground). */
function tallBed(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme) {
  const [base, dark] = th.tall
  g.fillStyle = mix(base, dark, 0.55)
  g.fillRect(x, y, TS, TS)
}

/**
 * Tall grass: a dense row of blades with dark roots and lit tips, swaying.
 * Returns frames[variant][frame], each TS x (TS + TALL_TOP).
 */
function makeTall(th: WorldTheme) {
  const [base, dark, light] = th.tall
  const out = shade(dark, -0.35)
  const H = TS + TALL_TOP
  const variants: HTMLCanvasElement[][] = []
  for (let v = 0; v < TALL_VARIANTS; v++) {
    const blades: Blade[] = []
    // Back row: tall and darker; front row: shorter and brighter
    for (let i = 0; i < 7; i++) blades.push({ x: i * 2.3 + hash(v, i, 1) * 1.6, h: 15 + Math.floor(hash(v, i, 2) * 5), w: 2, lean: hash(v, i, 3) * 2 - 1, front: false })
    for (let i = 0; i < 6; i++) blades.push({ x: 1 + i * 2.6 + hash(v, i, 4) * 1.4, h: 10 + Math.floor(hash(v, i, 5) * 4), w: 2, lean: hash(v, i, 6) * 2 - 1, front: true })
    const frames: HTMLCanvasElement[] = []
    for (let f = 0; f < TALL_FRAMES; f++) {
      const sway = [0, 1, 0, -1][f]
      const c = mk(TS, H)
      const g = c.getContext('2d')!
      // Mass of grass filling the lower part of the tile
      g.fillStyle = mix(base, dark, 0.55)
      g.fillRect(0, TALL_TOP + 5, TS, TS - 5)
      for (const b of blades) {
        const bx = Math.round(b.x), top = H - b.h
        for (let yy = H - 1; yy >= top; yy--) {
          const k = (H - 1 - yy) / b.h // 0 at the root, 1 at the tip
          const off = Math.round((b.lean * 0.6 + sway * 0.9) * k * k * 2)
          const xx = bx + off
          const w = k > 0.75 ? 1 : b.w
          const col = k > 0.82 ? light : k > 0.45 ? (b.front ? mix(base, light, 0.35) : base) : b.front ? base : mix(base, dark, 0.45)
          g.fillStyle = col
          g.fillRect(xx, yy, w, 1)
          // Outline on the left edge of each blade, darker toward the root
          if (k < 0.9) {
            g.fillStyle = k < 0.35 ? out : dark
            g.fillRect(xx - 1, yy, 1, 1)
          }
        }
      }
      // Dark band at the root so the patch sits on the ground
      g.fillStyle = out
      g.fillRect(0, H - 1, TS, 1)
      g.fillStyle = dark
      g.globalAlpha = 0.6
      g.fillRect(0, H - 3, TS, 2)
      g.globalAlpha = 1
      frames.push(c)
    }
    variants.push(frames)
  }
  return variants
}

// ---------------------------------------------------------------- flowers

export const FLOWER_FRAMES = 4

/** Two flowers per tile on little stems, nodding in the wind. frames[colour][frame] */
function makeFlowers(th: WorldTheme) {
  const [, dark] = th.tall
  const stem = mix(dark, th.grass[0], 0.3)
  return th.flowers.map((col) => {
    const frames: HTMLCanvasElement[] = []
    for (let f = 0; f < FLOWER_FRAMES; f++) {
      const sway = [0, 1, 0, -1][f]
      const c = mk(TS, TS + 2)
      const g = c.getContext('2d')!
      const px = pxOf(g)
      const petal = col, petalDark = shade(col, -0.25), centre = col === '#ffffff' ? '#f8d038' : '#fff4b0'
      for (const [fx, fy, s] of [[4, 6, 1], [11, 10, -1]] as [number, number, number][]) {
        const hx = fx + sway * s * (f % 2 ? 1 : 0) + (f === 1 ? 1 : f === 3 ? -1 : 0)
        // stem and a leaf
        for (let yy = fy + 2; yy <= fy + 6; yy++) px(fx + (yy < fy + 4 ? hx - fx : 0), yy, stem)
        px(fx + 1, fy + 5, stem)
        px(fx + 2, fy + 4, stem)
        // four petals around a bright centre, with a dark underside
        px(hx, fy - 1, petal); px(hx - 1, fy, petal); px(hx + 1, fy, petal); px(hx, fy + 1, petalDark)
        px(hx - 1, fy + 1, petalDark); px(hx + 1, fy + 1, petalDark)
        px(hx, fy, centre)
      }
      frames.push(c)
    }
    return frames
  })
}

// ---------------------------------------------------------------- trees

/** Fill a pixel disc into a mask grid. */
interface Blob { x: number; y: number; r: number }

/**
 * A round, clumpy BW-style tree canopy: several leaf clusters lit from the top
 * left, each with a dark rim where it overlaps the one behind, outlined.
 */
function makeOak(th: WorldTheme, v: number) {
  const [sh, a, b, c, hi] = th.canopy
  const fill = [a, b, c][v % 3]
  const W = 30, H = 28
  const cv = mk(W, H)
  const g = cv.getContext('2d')!
  const px = pxOf(g)
  // Clusters, back to front
  const blobs: Blob[] = [
    { x: 9, y: 9, r: 6 }, { x: 20, y: 9, r: 6 }, { x: 15, y: 6, r: 6 },
    { x: 7, y: 15, r: 6 }, { x: 22, y: 15, r: 6 }, { x: 15, y: 13, r: 8 },
    { x: 11, y: 19, r: 5.5 }, { x: 19, y: 19, r: 5.5 },
  ].map((o, i) => ({ x: o.x + (hash(v, i, 7) - 0.5) * 1.6, y: o.y + (hash(v, i, 8) - 0.5) * 1.4, r: o.r + (hash(v, i, 9) - 0.5) }))
  const owner = new Int8Array(W * H).fill(-1)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      blobs.forEach((o, i) => {
        if ((x + 0.5 - o.x) ** 2 + (y + 0.5 - o.y) ** 2 <= o.r * o.r) owner[y * W + x] = i
      })
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && owner[y * W + x] >= 0
  const dark = mix(fill, sh, 0.5), mid = fill, lite = mix(fill, hi, 0.45), top = mix(fill, hi, 0.8)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = owner[y * W + x]
      if (i < 0) {
        if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) px(x, y, sh)
        continue
      }
      const o = blobs[i]
      const nx = (x + 0.5 - o.x) / o.r, ny = (y + 0.5 - o.y) / o.r
      const d = Math.hypot(nx, ny)
      // Where this cluster's edge lies over a cluster behind it: a dark rim
      const behind = blobs.some((p, j) => j < i && (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 <= p.r * p.r)
      if (d > 0.82 && behind && ny > -0.2) {
        px(x, y, dark)
        continue
      }
      const l = -(nx * 0.55 + ny * 0.85) // light from the top left
      let col = l > 0.55 ? top : l > 0.12 ? lite : l > -0.45 ? mid : dark
      // Leaf texture: a sprinkle of lighter and darker pixels
      const r = hash(x, y, v * 31 + 5)
      if (r < 0.08) col = col === dark ? mid : dark
      else if (r < 0.13 && l > -0.2) col = top
      px(x, y, col)
    }
  return cv
}

/** Snowy pine: stacked tiers lit from the left, with snow along each tier's top edge. */
function makePine(th: WorldTheme, v: number) {
  const [sh, a, b, c, hi] = th.canopy
  const fill = [a, b, c][v % 3]
  const W = 22, H = 30
  const cv = mk(W, H)
  const g = cv.getContext('2d')!
  const px = pxOf(g)
  const tiers = [{ top: 1, h: 10, half: 5 }, { top: 7, h: 11, half: 8 }, { top: 14, h: 12, half: 10.5 }]
  const inTier = (x: number, y: number, t: (typeof tiers)[number]) => {
    if (y < t.top || y >= t.top + t.h) return false
    const k = (y - t.top + 1) / t.h
    return Math.abs(x + 0.5 - W / 2) <= t.half * k
  }
  const owner = (x: number, y: number) => {
    let o = -1
    tiers.forEach((t, i) => { if (inTier(x, y, t)) o = i })
    return o
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = owner(x, y)
      if (o < 0) {
        if (owner(x + 1, y) >= 0 || owner(x - 1, y) >= 0 || owner(x, y + 1) >= 0 || owner(x, y - 1) >= 0) px(x, y, sh)
        continue
      }
      const t = tiers[o]
      const above = y - 1 < t.top || !inTier(x, y - 1, t) || (y - 1 >= 0 && owner(x, y - 1) !== o)
      const above2 = y - 2 < t.top || !inTier(x, y - 2, t)
      const left = x + 0.5 < W / 2
      const k = (y - t.top) / t.h
      let col = left ? mix(fill, hi === '#f4faff' ? '#9ad0b0' : hi, 0.18) : fill
      if (k > 0.7) col = mix(col, sh, 0.35)
      if (hash(x, y, v + 3) < 0.1) col = mix(col, sh, 0.4)
      // snow on the upper edge (and a little on the left slope)
      if (above || (above2 && left)) col = above ? hi : mix(hi, fill, 0.35)
      px(x, y, col)
    }
  return cv
}

/** Dead, twisted tree for the volcano: bare branches, dark outline. */
function makeDead(th: WorldTheme, v: number) {
  const [sh, a, , , hi] = th.canopy
  const W = 24, H = 26
  const cv = mk(W, H)
  const g = cv.getContext('2d')!
  const pts = new Set<string>()
  const line = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n)
      for (let d = 0; d < w; d++) pts.add(`${x + d},${y}`)
    }
  }
  const s = v % 2 ? -1 : 1
  line(12, 25, 12, 10, 3)
  line(12, 15, 12 - 7 * s, 6, 2)
  line(12, 12, 12 + 6 * s, 3, 2)
  line(12 - 4 * s, 10, 12 - 3 * s, 2, 1)
  line(12 + 3 * s, 8, 12 + 9 * s, 7, 1)
  line(12 - 6 * s, 7, 12 - 10 * s, 5, 1)
  const has = (x: number, y: number) => pts.has(`${x},${y}`)
  const px = pxOf(g)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (has(x, y)) px(x, y, has(x - 1, y) ? a : mix(a, hi, 0.5))
      else if (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)) px(x, y, sh)
    }
  // glowing embers caught in the branches
  px(12 + 6 * s, 2, '#ff9040')
  return cv
}

/** Saguaro cactus with ribs and a flower, for the desert. */
function makeCactus(th: WorldTheme, v: number) {
  const [, trunk, trunkDark] = th.trunk
  const W = 16, H = 22
  const cv = mk(W, H)
  const g = cv.getContext('2d')!
  const px = pxOf(g)
  const body = new Set<string>()
  const rect = (x: number, y: number, w: number, h: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) body.add(`${xx},${yy}`) }
  rect(6, 2, 5, 20)
  if (v % 2 === 0) { rect(2, 9, 4, 3); rect(2, 4, 3, 6) } else { rect(2, 12, 4, 3); rect(2, 7, 3, 6) }
  rect(11, 11, 3, 3); rect(12, 6, 3, 6)
  const has = (x: number, y: number) => body.has(`${x},${y}`)
  const out = shade(trunkDark, -0.4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (has(x, y)) {
        const lit = !has(x - 1, y)
        const rib = x === 8 || x === 3 || x === 13
        px(x, y, lit ? mix(trunk, '#ffffff', 0.25) : rib ? trunkDark : trunk)
        if (!has(x, y - 1)) px(x, y, mix(trunk, '#ffffff', 0.3))
      } else if (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)) px(x, y, out)
    }
  if (v === 0) { px(8, 1, '#f070a0'); px(7, 1, '#f8a0c0'); px(9, 1, '#f8a0c0') }
  return cv
}

// ---------------------------------------------------------------- water

export const WATER_FRAMES = 8

/** 32x32 ripple patterns: little light wave marks drifting, tiling seamlessly. */
function makeWater(th: WorldTheme) {
  const [, wave, foam] = th.water
  const frames: HTMLCanvasElement[] = []
  const marks = Array.from({ length: 5 }, (_, i) => ({ x: hash(i, 1, 9) * 32, y: hash(i, 2, 9) * 32, w: 3 + Math.floor(hash(i, 3, 9) * 4), ph: hash(i, 4, 9) }))
  for (let f = 0; f < WATER_FRAMES; f++) {
    const c = mk(32, 32)
    const g = c.getContext('2d')!
    for (const m of marks) {
      const k = (f / WATER_FRAMES + m.ph) % 1
      const x = Math.floor(m.x + k * 6) % 32, y = Math.floor(m.y)
      const a = Math.sin(k * Math.PI) // fade in and out
      if (a < 0.15) continue
      g.globalAlpha = 0.25 + 0.4 * a
      g.fillStyle = wave
      for (let i = 0; i < m.w; i++) g.fillRect((x + i) % 32, y + (i === 0 || i === m.w - 1 ? 1 : 0), 1, 1)
      g.fillStyle = foam
      g.globalAlpha = 0.6 * a
      g.fillRect((x + 1) % 32, y - 1 < 0 ? 31 : y - 1, Math.max(1, m.w - 3), 1)
    }
    g.globalAlpha = 1
    frames.push(c)
  }
  return frames
}

// ---------------------------------------------------------------- cache

export interface TileArt {
  tall: HTMLCanvasElement[][]
  flowers: HTMLCanvasElement[][]
  trees: HTMLCanvasElement[]
  water: HTMLCanvasElement[]
}

const cache = new Map<string, TileArt>()

export function tileArt(th: WorldTheme): TileArt {
  let a = cache.get(th.id)
  if (!a) {
    const tree = th.decor === 'pine' ? makePine : th.decor === 'dead' ? makeDead : th.decor === 'cactus' ? makeCactus : makeOak
    a = { tall: makeTall(th), flowers: makeFlowers(th), trees: [0, 1, 2].map((v) => tree(th, v)), water: makeWater(th) }
    cache.set(th.id, a)
  }
  return a
}

export { tallBed }
