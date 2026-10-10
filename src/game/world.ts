import { Rng } from './rng'
import { THEMES, type ThemeId, type WorldTheme } from '../data/themes'

export const TILE = 16
export const MAP = 128

export enum T {
  GRASS, TALL, PATH, SAND, WATER, TREE, ROCK, HOUSE, FLOWER, BRIDGE,
  /** Arena only: walkable but burns. */
  LAVA,
  /** Arena only: slippery floor. */
  ICE,
  /** Arena only: blocks movement and beams; can shatter. */
  PILLAR,
}

export interface House {
  x: number
  y: number
  w: number
  h: number
  roof: string
  center: boolean
}

export interface Town {
  x: number
  y: number
  name: string
}

const TOWN_NAMES = ['Nuvema', 'Accumula', 'Striaton', 'Nacrene', 'Castelia', 'Nimbasa', 'Driftveil', 'Icirrus', 'Opelucid']

/** Raid arenas carved out of the middle of the map. */
export type ArenaKind = 'crater' | 'icecave'

export interface WorldOpts {
  theme?: ThemeId
  arena?: ArenaKind
}

/** Arena centre and radius (tiles). */
export const ARENA_C = MAP / 2
export const ARENA_R = 15

export class World {
  tiles = new Uint8Array(MAP * MAP)
  houses: House[] = []
  towns: Town[] = []
  tall: number[] = []
  walkable: number[] = []
  ground!: HTMLCanvasElement
  overlay!: HTMLCanvasElement
  mini!: HTMLCanvasElement
  theme: WorldTheme
  arena: ArenaKind | null
  /** Crater: lava vents that erupt during the fight. */
  vents: { x: number; y: number }[] = []
  /** Ice cave: 2x2 ice pillars (top-left tile) that block beams and can shatter. */
  pillars: { x: number; y: number; hp: number }[] = []

  constructor(public rng: Rng, opts: WorldOpts = {}) {
    this.theme = THEMES[opts.theme ?? (opts.arena ?? 'forest')]
    this.arena = opts.arena ?? null
    if (this.arena) this.generateArena(this.arena)
    else this.generate()
    this.render()
  }

  at(tx: number, ty: number): T {
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) return T.TREE
    return this.tiles[ty * MAP + tx]
  }

  set(tx: number, ty: number, t: T) {
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) return
    this.tiles[ty * MAP + tx] = t
  }

  blockedTile(tx: number, ty: number): boolean {
    const t = this.at(tx, ty)
    return t === T.WATER || t === T.TREE || t === T.ROCK || t === T.HOUSE || t === T.PILLAR
  }

  /** World coords are in tiles (floats). */
  blocked(x: number, y: number): boolean {
    return this.blockedTile(Math.floor(x), Math.floor(y))
  }

  isTall(x: number, y: number): boolean {
    return this.at(Math.floor(x), Math.floor(y)) === T.TALL
  }

  private generate() {
    const rng = this.rng
    const mix = this.theme.mix
    const elev = new Noise(rng, 26)
    const moist = new Noise(rng, 15)
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++) {
        const e = elev.fbm(x, y)
        const m = moist.fbm(x + 500, y + 500)
        const edge = Math.min(x, y, MAP - 1 - x, MAP - 1 - y)
        let t: T
        if (edge < 3) t = T.TREE
        else if (e < mix.water) t = T.WATER
        else if (e < mix.sand) t = T.SAND
        else if (m > mix.tree && rng.next() > 0.1) t = T.TREE
        else if (m > mix.tall) t = T.TALL
        else if (rng.next() < mix.flower) t = T.FLOWER
        else if (rng.next() < mix.rock) t = T.ROCK
        else t = T.GRASS
        this.set(x, y, t)
      }

    // Towns
    const spots: Town[] = []
    for (let tries = 0; spots.length < 6 && tries < 500; tries++) {
      const x = rng.int(16, MAP - 18)
      const y = rng.int(16, MAP - 16)
      if (spots.every((s) => Math.hypot(s.x - x, s.y - y) > 32)) spots.push({ x, y, name: TOWN_NAMES[spots.length] })
    }
    this.towns = spots
    spots.forEach((s, i) => this.buildTown(s, i === 0))

    // Roads between towns (each town to its nearest already-connected town)
    for (let i = 1; i < spots.length; i++) {
      let best = 0
      for (let j = 1; j < i; j++)
        if (Math.hypot(spots[j].x - spots[i].x, spots[j].y - spots[i].y) < Math.hypot(spots[best].x - spots[i].x, spots[best].y - spots[i].y)) best = j
      this.road(spots[i], spots[best])
    }

    // Anything not reachable from the first town becomes forest.
    this.collect(spots[0].x, spots[0].y)
  }

  /** Mark unreachable ground as wall and list walkable / tall tiles. */
  private collect(sx: number, sy: number) {
    const seen = this.flood(sx, sy)
    this.walkable = []
    this.tall = []
    for (let i = 0; i < MAP * MAP; i++) {
      const t = this.tiles[i]
      const walk = !(t === T.WATER || t === T.TREE || t === T.ROCK || t === T.HOUSE || t === T.PILLAR)
      if (walk && !seen[i]) this.tiles[i] = T.TREE
      else if (walk) {
        this.walkable.push(i)
        if (t === T.TALL) this.tall.push(i)
      }
    }
  }

  /** A round raid arena in the middle of a walled-off map. */
  private generateArena(kind: ArenaKind) {
    const rng = this.rng
    const c = ARENA_C, R = ARENA_R
    const veins = new Noise(rng, 5)
    this.tiles.fill(T.TREE)
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
        // A slightly ragged edge
        if (d > R + Math.sin(Math.atan2(y - c, x - c) * 5) * 0.8) continue
        let t = kind === 'icecave' ? T.ICE : T.GRASS
        if (kind === 'crater') {
          if (veins.fbm(x, y) > 0.62) t = T.SAND
          else if (rng.next() < 0.008 && d > 5) t = T.ROCK
        } else if (rng.next() < 0.06 && d > 3) t = T.SAND
        this.set(x, y, t)
      }
    if (kind === 'crater') {
      // Glowing cracks running out from the middle of the crater
      for (let i = 0; i < 6; i++) {
        let a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3)
        let d = 4.5
        while (d < R - 1.5) {
          const x = Math.floor(c + Math.cos(a) * d), y = Math.floor(c + Math.sin(a) * d)
          if (this.at(x, y) !== T.TREE) this.set(x, y, T.LAVA)
          d += 0.6
          a += rng.range(-0.09, 0.09)
        }
      }
      // Four lava vents between centre and edge
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2
        const vx = Math.round(c + Math.cos(a) * 9.5), vy = Math.round(c + Math.sin(a) * 9.5)
        for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) this.set(vx + dx, vy + dy, T.LAVA)
        this.vents.push({ x: vx, y: vy })
      }
    } else {
      // Six ice pillars in a ring: cover from beams and blizzards (none right
      // between the spawn at the bottom and the boss)
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3
        const px = Math.round(c + Math.cos(a) * 9 - 1), py = Math.round(c + Math.sin(a) * 9 - 1)
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.set(px + dx, py + dy, T.PILLAR)
        this.pillars.push({ x: px, y: py, hp: 1 })
      }
    }
    this.collect(c, c)
  }

  /** Is the straight line between two points blocked by an ice pillar (or wall)? */
  lineBlocked(x1: number, y1: number, x2: number, y2: number): boolean {
    const d = Math.hypot(x2 - x1, y2 - y1)
    const n = Math.ceil(d * 3)
    for (let i = 1; i < n; i++) {
      const t = this.at(Math.floor(x1 + ((x2 - x1) * i) / n), Math.floor(y1 + ((y2 - y1) * i) / n))
      if (t === T.PILLAR) return true
    }
    return false
  }

  /** A pillar shatters: rubble on the ground, the canvases get repainted there. */
  breakPillar(i: number) {
    const p = this.pillars[i]
    if (!p || this.at(p.x, p.y) !== T.PILLAR) return
    p.hp = 0
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      this.set(p.x + dx, p.y + dy, T.SAND)
      this.walkable.push((p.y + dy) * MAP + p.x + dx)
    }
    this.render()
  }

  private buildTown(s: Town, center: boolean) {
    const w = 16, h = 12
    const x0 = s.x - w / 2, y0 = s.y - h / 2
    for (let y = y0 - 1; y < y0 + h + 1; y++)
      for (let x = x0 - 1; x < x0 + w + 1; x++) this.set(x, y, this.rng.next() < 0.05 ? T.FLOWER : T.GRASS)
    for (let x = x0; x < x0 + w; x++) {
      this.set(x, s.y, T.PATH)
      this.set(x, s.y + 1, T.PATH)
    }
    const roofs = ['#d85840', '#4878c8', '#58a058', '#a868c0', '#e09038']
    const slots = [
      [x0 + 1, y0 + 1], [x0 + 6, y0 + 1], [x0 + 11, y0 + 1],
      [x0 + 1, s.y + 3], [x0 + 6, s.y + 3], [x0 + 11, s.y + 3],
    ]
    slots.forEach(([hx, hy], i) => {
      if (!center && i !== 1 && this.rng.next() < 0.3) return
      const isCenter = center ? i === 1 : false
      const house: House = { x: hx, y: hy, w: 4, h: 4, roof: isCenter ? '#e04040' : this.rng.pick(roofs), center: isCenter }
      this.houses.push(house)
      for (let y = hy; y < hy + 4; y++) for (let x = hx; x < hx + 4; x++) this.set(x, y, T.HOUSE)
      // doorstep path to the main street
      const doorX = hx + 1
      if (hy < s.y) for (let y = hy + 4; y < s.y; y++) this.set(doorX, y, T.PATH)
      else this.set(doorX, hy - 1, T.PATH)
    })
  }

  private road(a: Town, b: Town) {
    const lay = (x: number, y: number) => {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const t = this.at(x + dx, y + dy)
        if (t === T.HOUSE) continue
        this.set(x + dx, y + dy, t === T.WATER || t === T.BRIDGE ? T.BRIDGE : T.PATH)
      }
    }
    let x = a.x, y = a.y
    const horizFirst = this.rng.next() < 0.5
    const stepX = () => { while (x !== b.x) { x += Math.sign(b.x - x); lay(x, y) } }
    const stepY = () => { while (y !== b.y) { y += Math.sign(b.y - y); lay(x, y) } }
    if (horizFirst) { stepX(); stepY() } else { stepY(); stepX() }
  }

  flood(sx: number, sy: number): Uint8Array {
    const seen = new Uint8Array(MAP * MAP)
    const q = [sy * MAP + sx]
    seen[q[0]] = 1
    while (q.length) {
      const i = q.pop()!
      const x = i % MAP, y = (i / MAP) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        const ni = ny * MAP + nx
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP || seen[ni] || this.blockedTile(nx, ny)) continue
        seen[ni] = 1
        q.push(ni)
      }
    }
    return seen
  }

  /** BFS distance field toward a tile; -1 = unreachable. Used for bot navigation. */
  flowTo(tx: number, ty: number): Int32Array {
    const dist = new Int32Array(MAP * MAP).fill(-1)
    let start = ty * MAP + tx
    if (this.blockedTile(tx, ty)) start = this.nearestWalkable(tx, ty)
    dist[start] = 0
    const q = new Int32Array(MAP * MAP)
    let head = 0, tail = 0
    q[tail++] = start
    while (head < tail) {
      const i = q[head++]
      const x = i % MAP, y = (i / MAP) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue
        const ni = ny * MAP + nx
        if (dist[ni] !== -1 || this.blockedTile(nx, ny)) continue
        dist[ni] = dist[i] + 1
        q[tail++] = ni
      }
    }
    return dist
  }

  nearestWalkable(tx: number, ty: number): number {
    let best = this.walkable[0], bd = Infinity
    for (const i of this.walkable) {
      const d = Math.abs((i % MAP) - tx) + Math.abs(((i / MAP) | 0) - ty)
      if (d < bd) { bd = d; best = i }
    }
    return best
  }

  randomWalkable(filter?: (x: number, y: number) => boolean): [number, number] {
    for (let k = 0; k < 200; k++) {
      const i = this.rng.pick(this.walkable)
      const x = i % MAP + 0.5, y = ((i / MAP) | 0) + 0.5
      if (!filter || filter(x, y)) return [x, y]
    }
    const i = this.rng.pick(this.walkable)
    return [i % MAP + 0.5, ((i / MAP) | 0) + 0.5]
  }

  // ---------- Rendering (pre-baked into canvases) ----------

  private render() {
    const size = MAP * TILE
    const th = this.theme
    this.ground = canvas(size, size)
    this.overlay = canvas(size, size)
    const g = this.ground.getContext('2d')!
    const o = this.overlay.getContext('2d')!
    const r = new Rng(1234)
    for (let ty = 0; ty < MAP; ty++)
      for (let tx = 0; tx < MAP; tx++) {
        const t = this.at(tx, ty)
        const x = tx * TILE, y = ty * TILE
        if (t === T.ICE || t === T.PILLAR) drawIce(g, x, y, th, tx, ty)
        else drawGrass(g, x, y, r, th)
        switch (t) {
          case T.TALL: drawTall(g, x, y, th); break
          case T.PATH: drawPath(g, x, y, r, this, tx, ty, th); break
          case T.SAND: drawSand(g, x, y, r, th); break
          case T.WATER: drawWater(g, x, y, this, tx, ty, th); break
          case T.BRIDGE: drawBridge(g, x, y, th); break
          case T.FLOWER: drawFlower(g, x, y, r, th); break
          case T.ROCK: drawRock(g, x, y, th); break
          case T.TREE: drawTrunk(g, o, x, y, th, this, tx, ty); break
          case T.LAVA: drawLava(g, x, y, this, tx, ty); break
        }
      }
    // Canopies on the overlay so things walking "behind" a tree are covered.
    if (th.decor === 'oak' || th.decor === 'pine' || th.decor === 'dead' || th.decor === 'cactus')
      for (let ty = 0; ty < MAP; ty++)
        for (let tx = 0; tx < MAP; tx++)
          if (this.at(tx, ty) === T.TREE) drawCanopy(o, tx * TILE, ty * TILE, (tx * 7 + ty * 13) % 3, th)
    for (const h of this.houses) drawHouse(g, o, h)
    for (const p of this.pillars) if (p.hp > 0) drawPillar(g, o, p.x * TILE, p.y * TILE)
    for (const v of this.vents) drawVent(g, v.x * TILE, v.y * TILE)

    // Minimap
    this.mini = canvas(MAP, MAP)
    const m = this.mini.getContext('2d')!
    const mc = th.mini
    const col: Record<number, string> = {
      [T.GRASS]: mc.grass, [T.TALL]: mc.tall, [T.PATH]: mc.path, [T.SAND]: mc.sand, [T.WATER]: mc.water,
      [T.TREE]: mc.tree, [T.ROCK]: '#909098', [T.HOUSE]: '#e05848', [T.FLOWER]: mc.grass, [T.BRIDGE]: '#c09060',
      [T.LAVA]: '#ff7020', [T.ICE]: '#cce8f8', [T.PILLAR]: '#ffffff',
    }
    for (let ty = 0; ty < MAP; ty++)
      for (let tx = 0; tx < MAP; tx++) {
        m.fillStyle = col[this.at(tx, ty)]
        m.fillRect(tx, ty, 1, 1)
      }
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// ---------- Tile painters (Black/White style, coloured by the world theme) ----------

function drawGrass(g: CanvasRenderingContext2D, x: number, y: number, r: Rng, th: WorldTheme) {
  const [base, dark, light] = th.grass
  g.fillStyle = base
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = dark
  for (let i = 0; i < 3; i++) {
    const px = x + r.int(1, 13), py = y + r.int(1, 13)
    g.fillRect(px, py, 1, 1)
    g.fillRect(px + 2, py, 1, 1)
    g.fillRect(px + 1, py + 1, 1, 1)
  }
  if (r.next() < 0.3) {
    g.fillStyle = light
    g.fillRect(x + r.int(1, 14), y + r.int(1, 14), 1, 1)
  }
}

function drawTall(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme) {
  const [base, dark, light] = th.tall
  g.fillStyle = base
  g.fillRect(x, y, TILE, TILE)
  for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
    const bx = x + ox, by = y + oy
    g.fillStyle = dark
    g.fillRect(bx + 1, by + 5, 6, 3)
    g.fillRect(bx + 1, by + 2, 1, 3)
    g.fillRect(bx + 3, by + 1, 1, 4)
    g.fillRect(bx + 5, by + 2, 1, 3)
    g.fillStyle = light
    g.fillRect(bx + 2, by + 3, 1, 3)
    g.fillRect(bx + 4, by + 2, 1, 3)
    g.fillRect(bx + 6, by + 3, 1, 3)
  }
}

function drawPath(g: CanvasRenderingContext2D, x: number, y: number, r: Rng, w: World, tx: number, ty: number, th: WorldTheme) {
  const [base, speck, edge] = th.path
  g.fillStyle = base
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = speck
  for (let i = 0; i < 3; i++) g.fillRect(x + r.int(1, 14), y + r.int(1, 14), 2, 1)
  // soft edge
  g.fillStyle = edge
  const isPath = (a: number, b: number) => { const t = w.at(a, b); return t === T.PATH || t === T.BRIDGE || t === T.HOUSE }
  if (!isPath(tx, ty - 1)) g.fillRect(x, y, TILE, 1)
  if (!isPath(tx, ty + 1)) g.fillRect(x, y + 15, TILE, 1)
  if (!isPath(tx - 1, ty)) g.fillRect(x, y, 1, TILE)
  if (!isPath(tx + 1, ty)) g.fillRect(x + 15, y, 1, TILE)
}

function drawSand(g: CanvasRenderingContext2D, x: number, y: number, r: Rng, th: WorldTheme) {
  g.fillStyle = th.sand[0]
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = th.sand[1]
  for (let i = 0; i < 4; i++) g.fillRect(x + r.int(0, 15), y + r.int(0, 15), 1, 1)
}

function drawWater(g: CanvasRenderingContext2D, x: number, y: number, w: World, tx: number, ty: number, th: WorldTheme) {
  const [base, wave, foam, shade] = th.water
  g.fillStyle = base
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = wave
  const s = (tx * 3 + ty * 5) % 8
  if (th.liquid === 'lava') {
    // Cooling crust plates on the lava
    g.fillStyle = shade
    g.fillRect(x + s, y + 3, 6, 3)
    g.fillRect(x + ((s + 7) % 11), y + 10, 5, 3)
    g.fillStyle = wave
    g.fillRect(x + s + 1, y + 6, 4, 1)
  } else {
    g.fillRect(x + s, y + 4, 5, 1)
    g.fillRect(x + ((s + 6) % 10), y + 11, 5, 1)
  }
  g.fillStyle = th.liquid === 'lava' ? '#3a2420' : foam
  const land = (a: number, b: number) => { const t = w.at(a, b); return t !== T.WATER && t !== T.BRIDGE }
  if (land(tx, ty - 1)) g.fillRect(x, y, TILE, 2)
  if (land(tx - 1, ty)) g.fillRect(x, y, 2, TILE)
  if (land(tx + 1, ty)) g.fillRect(x + 14, y, 2, TILE)
  g.fillStyle = shade
  if (land(tx, ty + 1)) g.fillRect(x, y + 14, TILE, 2)
}

function drawLava(g: CanvasRenderingContext2D, x: number, y: number, w: World, tx: number, ty: number) {
  g.fillStyle = '#c83a10'
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = '#ff8a20'
  g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
  g.fillStyle = '#ffd060'
  const s = (tx * 5 + ty * 3) % 7
  g.fillRect(x + 3 + s, y + 5, 3, 2)
  g.fillRect(x + 4, y + 10, 2, 2)
  // Dark crusty rim where it meets rock
  g.fillStyle = '#2a1a16'
  const solid = (a: number, b: number) => w.at(a, b) !== T.LAVA
  if (solid(tx, ty - 1)) g.fillRect(x, y, TILE, 2)
  if (solid(tx, ty + 1)) g.fillRect(x, y + 14, TILE, 2)
  if (solid(tx - 1, ty)) g.fillRect(x, y, 2, TILE)
  if (solid(tx + 1, ty)) g.fillRect(x + 14, y, 2, TILE)
}

function drawIce(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme, tx: number, ty: number) {
  const [base, dark, light] = th.grass
  g.fillStyle = base
  g.fillRect(x, y, TILE, TILE)
  // Polished sheen: diagonal streaks and a few cracks
  g.fillStyle = light
  const s = (tx * 7 + ty * 11) % 16
  for (let i = 0; i < 6; i++) g.fillRect(x + ((s + i) % 16), y + i * 2, 3, 1)
  g.fillStyle = dark
  if ((tx + ty * 3) % 5 === 0) {
    g.fillRect(x + 3, y + 9, 5, 1)
    g.fillRect(x + 7, y + 10, 4, 1)
  }
}

function drawBridge(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme) {
  g.fillStyle = th.water[0]
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = '#c89860'
  g.fillRect(x, y + 1, TILE, 14)
  g.fillStyle = '#986838'
  for (let i = 0; i < 4; i++) g.fillRect(x, y + 1 + i * 4, TILE, 1)
  g.fillRect(x + 7, y + 1, 1, 14)
}

function drawFlower(g: CanvasRenderingContext2D, x: number, y: number, r: Rng, th: WorldTheme) {
  const col = r.pick(th.flowers)
  for (const [ox, oy] of [[3, 3], [10, 9]]) {
    g.fillStyle = col
    g.fillRect(x + ox, y + oy - 1, 2, 1)
    g.fillRect(x + ox - 1, y + oy, 4, 2)
    g.fillRect(x + ox, y + oy + 2, 2, 1)
    g.fillStyle = '#f8f0a0'
    g.fillRect(x + ox, y + oy, 2, 2)
  }
}

function drawRock(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme) {
  const [outline, base, hi] = th.rock
  disc(g, x + 8, y + 9, 6.5, outline)
  disc(g, x + 8, y + 9, 5.5, base)
  disc(g, x + 7, y + 7, 3, hi)
  g.fillStyle = outline
  g.globalAlpha = 0.5
  g.fillRect(x + 4, y + 12, 9, 2)
  g.globalAlpha = 1
}

/** Blocking "tree" tiles: real trees, or cliffs / ice walls around an arena. */
function drawTrunk(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme, w: World, tx: number, ty: number) {
  const [shadow, trunk, trunkDark] = th.trunk
  if (th.decor === 'cliff' || th.decor === 'icewall') {
    const [sh, a, b, c, hi] = th.canopy
    g.fillStyle = sh
    g.fillRect(x, y, TILE, TILE)
    // Rocky texture: a few irregular stones per tile
    let h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0
    const cols = [a, b, c]
    for (let i = 0; i < 4; i++) {
      h = (h * 1103515245 + 12345) >>> 0
      g.fillStyle = cols[h % 3]
      g.fillRect(x + ((h >> 4) % 11), y + ((h >> 9) % 11), 3 + ((h >> 14) % 4), 2 + ((h >> 17) % 3))
    }
    if (th.decor === 'icewall' && h % 3 === 0) {
      g.fillStyle = hi
      g.fillRect(x + ((h >> 6) % 12), y + ((h >> 11) % 10), 1, 4)
    }
    // Lit face where the wall meets the floor below it
    const floorBelow = !w.blockedTile(tx, ty + 1) && ty + 1 < MAP
    if (floorBelow) {
      g.fillStyle = trunk
      g.fillRect(x, y + 6, TILE, 10)
      g.fillStyle = trunkDark
      for (let i = 0; i < 3; i++) g.fillRect(x + ((tx * 5 + i * 6) % 14), y + 7, 1, 9)
      o.fillStyle = hi
      o.globalAlpha = 0.5
      o.fillRect(x, y + 5, TILE, 1)
      o.globalAlpha = 1
    }
    return
  }
  g.fillStyle = shadow
  g.fillRect(x + 2, y + 12, 12, 3)
  if (th.decor === 'cactus') {
    g.fillStyle = trunkDark
    g.fillRect(x + 6, y + 4, 4, 11)
    g.fillStyle = trunk
    g.fillRect(x + 6, y + 4, 3, 11)
    g.fillRect(x + 2, y + 7, 4, 2)
    g.fillRect(x + 2, y + 4, 2, 4)
    g.fillRect(x + 10, y + 9, 4, 2)
    g.fillRect(x + 12, y + 6, 2, 4)
    return
  }
  g.fillStyle = trunk
  g.fillRect(x + 6, y + 8, 4, 7)
  g.fillStyle = trunkDark
  g.fillRect(x + 6, y + 8, 1, 7)
}

function drawCanopy(o: CanvasRenderingContext2D, x: number, y: number, v: number, th: WorldTheme) {
  const [sh, a, b, c, hi] = th.canopy
  const cx = x + 8, cy = y + 3
  switch (th.decor) {
    case 'pine': {
      // Layered triangle with snow on the tips
      for (let i = 0; i < 3; i++) {
        const ty = cy - 9 + i * 5, half = 4 + i * 2.5
        o.fillStyle = sh
        o.beginPath(); o.moveTo(cx, ty - 1); o.lineTo(cx + half + 1, ty + 7); o.lineTo(cx - half - 1, ty + 7); o.closePath(); o.fill()
        o.fillStyle = v === 0 ? a : v === 1 ? b : c
        o.beginPath(); o.moveTo(cx, ty); o.lineTo(cx + half, ty + 6); o.lineTo(cx - half, ty + 6); o.closePath(); o.fill()
        o.fillStyle = hi
        o.fillRect(cx - 2, ty + 1, 3, 1)
        o.fillRect(cx - half + 1, ty + 5, Math.max(2, half - 1), 1)
      }
      return
    }
    case 'cactus':
      // Just a flower on top of some cacti
      if (v === 0) {
        o.fillStyle = '#f070a0'
        o.fillRect(cx - 1, cy, 3, 2)
      }
      return
    case 'dead': {
      // Bare, twisted branches
      o.strokeStyle = a
      o.lineWidth = 2
      o.beginPath()
      o.moveTo(cx, cy + 6); o.lineTo(cx, cy - 4)
      o.moveTo(cx, cy); o.lineTo(cx - 6, cy - 6)
      o.moveTo(cx, cy - 2); o.lineTo(cx + 6, cy - 8)
      o.moveTo(cx - 3, cy - 3); o.lineTo(cx - 4, cy - 9)
      o.stroke()
      o.fillStyle = hi
      o.fillRect(cx + 5, cy - 9, 2, 2)
      return
    }
    default:
      disc(o, cx, cy, 10, sh)
      disc(o, cx, cy, 9, v === 0 ? a : v === 1 ? b : c)
      disc(o, cx - 1, cy - 1, 6.5, th.id === 'forest' || th.id === 'night' ? '#3c9a48' : c)
      disc(o, cx - 3, cy - 4, 3, hi)
  }
}

/** Ice pillar (2x2 tiles): base on the ground, a tall crystal on the overlay. */
function drawPillar(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, x: number, y: number) {
  const w = TILE * 2
  g.fillStyle = 'rgba(20,40,80,0.35)'
  g.fillRect(x + 2, y + w - 6, w - 2, 6)
  g.fillStyle = '#6aa0d0'
  g.fillRect(x + 4, y + 6, w - 8, w - 8)
  o.fillStyle = '#24406a'
  o.beginPath(); o.moveTo(x + w / 2, y - 26); o.lineTo(x + w - 3, y + 4); o.lineTo(x + w - 5, y + w - 4); o.lineTo(x + 5, y + w - 4); o.lineTo(x + 3, y + 4); o.closePath(); o.fill()
  o.fillStyle = '#8cc4f0'
  o.beginPath(); o.moveTo(x + w / 2, y - 24); o.lineTo(x + w - 5, y + 4); o.lineTo(x + w - 7, y + w - 6); o.lineTo(x + 7, y + w - 6); o.lineTo(x + 5, y + 4); o.closePath(); o.fill()
  o.fillStyle = '#e8f8ff'
  o.beginPath(); o.moveTo(x + w / 2 - 1, y - 20); o.lineTo(x + w / 2 + 3, y + 6); o.lineTo(x + w / 2 - 2, y + 20); o.lineTo(x + 9, y + 6); o.closePath(); o.fill()
}

/** Lava vent: a dark cone around a glowing pool. */
function drawVent(g: CanvasRenderingContext2D, x: number, y: number) {
  disc(g, x, y, 22, '#1e1412')
  disc(g, x, y, 19, '#3a2622')
  disc(g, x, y, 13, '#a02810')
  disc(g, x, y, 10, '#ff7a20')
  disc(g, x - 2, y - 2, 5, '#ffd060')
}

function disc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  g.fillStyle = col
  for (let dy = -Math.ceil(r); dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)))
    g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1)
  }
}

function drawHouse(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, h: House) {
  const x = h.x * TILE, y = h.y * TILE, w = h.w * TILE, hh = h.h * TILE
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.18)'
  g.fillRect(x + 4, y + hh - 2, w, 4)
  // walls
  g.fillStyle = '#f0e8d8'
  g.fillRect(x + 2, y + hh * 0.45, w - 4, hh * 0.55)
  g.fillStyle = '#c8c0b0'
  g.fillRect(x + 2, y + hh - 3, w - 4, 3)
  // windows
  g.fillStyle = '#383848'
  g.fillRect(x + w - 22, y + hh * 0.55, 12, 10)
  g.fillStyle = '#88c0f0'
  g.fillRect(x + w - 21, y + hh * 0.55 + 1, 10, 8)
  g.fillStyle = '#f8f8f8'
  g.fillRect(x + w - 21, y + hh * 0.55 + 1, 3, 3)
  // door
  g.fillStyle = h.center ? '#f8f8f8' : '#7a5030'
  g.fillRect(x + 18, y + hh - 18, 12, 18)
  g.fillStyle = h.center ? '#88c0f0' : '#5a3818'
  g.fillRect(x + 20, y + hh - 16, 8, 16)
  // roof on overlay with BW stripes
  const ry = y - 6
  const rh = hh * 0.5 + 6
  o.fillStyle = '#383848'
  o.fillRect(x, ry, w, rh + 1)
  o.fillStyle = h.roof
  o.fillRect(x + 1, ry + 1, w - 2, rh - 1)
  o.fillStyle = 'rgba(0,0,0,0.18)'
  for (let i = 4; i < rh; i += 5) o.fillRect(x + 1, ry + i, w - 2, 1)
  o.fillStyle = 'rgba(255,255,255,0.35)'
  o.fillRect(x + 1, ry + 1, w - 2, 2)
  if (h.center) {
    // Poké Ball emblem
    disc(o, x + w / 2, ry + rh / 2, 7, '#383848')
    disc(o, x + w / 2, ry + rh / 2, 6, '#f8f8f8')
    o.fillStyle = '#e04040'
    o.fillRect(x + w / 2 - 6, ry + rh / 2 - 6, 12, 6)
    o.fillStyle = '#383848'
    o.fillRect(x + w / 2 - 6, ry + rh / 2 - 1, 12, 2)
    disc(o, x + w / 2, ry + rh / 2, 2, '#f8f8f8')
  }
}

/** Seeded smooth value noise with a few octaves, returns 0..1. */
class Noise {
  private grid = new Float32Array(64 * 64)
  constructor(rng: Rng, private scale: number) {
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = rng.next()
  }
  private v(x: number, y: number) {
    return this.grid[(((y % 64) + 64) % 64) * 64 + (((x % 64) + 64) % 64)]
  }
  private smooth(x: number, y: number) {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const fx = x - x0, fy = y - y0
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const a = this.v(x0, y0), b = this.v(x0 + 1, y0), c = this.v(x0, y0 + 1), d = this.v(x0 + 1, y0 + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
  fbm(x: number, y: number) {
    let s = 0, amp = 0.55, f = 1 / this.scale, norm = 0
    for (let o = 0; o < 3; o++) {
      s += this.smooth(x * f, y * f) * amp
      norm += amp
      amp *= 0.45
      f *= 2.1
    }
    return s / norm
  }
}
