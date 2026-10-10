import { Rng } from './rng'

export const TILE = 16
export const MAP = 128

export enum T {
  GRASS, TALL, PATH, SAND, WATER, TREE, ROCK, HOUSE, FLOWER, BRIDGE,
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

export class World {
  tiles = new Uint8Array(MAP * MAP)
  houses: House[] = []
  towns: Town[] = []
  tall: number[] = []
  walkable: number[] = []
  ground!: HTMLCanvasElement
  overlay!: HTMLCanvasElement
  mini!: HTMLCanvasElement

  constructor(public rng: Rng) {
    this.generate()
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
    return t === T.WATER || t === T.TREE || t === T.ROCK || t === T.HOUSE
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
    const elev = new Noise(rng, 26)
    const moist = new Noise(rng, 15)
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++) {
        const e = elev.fbm(x, y)
        const m = moist.fbm(x + 500, y + 500)
        const edge = Math.min(x, y, MAP - 1 - x, MAP - 1 - y)
        let t: T
        if (edge < 3) t = T.TREE
        else if (e < 0.3) t = T.WATER
        else if (e < 0.34) t = T.SAND
        else if (m > 0.63 && rng.next() > 0.1) t = T.TREE
        else if (m > 0.5) t = T.TALL
        else if (rng.next() < 0.04) t = T.FLOWER
        else if (rng.next() < 0.006) t = T.ROCK
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
    const seen = this.flood(spots[0].x, spots[0].y)
    for (let i = 0; i < MAP * MAP; i++) {
      const t = this.tiles[i]
      const walk = !(t === T.WATER || t === T.TREE || t === T.ROCK || t === T.HOUSE)
      if (walk && !seen[i]) this.tiles[i] = T.TREE
      else if (walk) {
        this.walkable.push(i)
        if (t === T.TALL) this.tall.push(i)
      }
    }
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
    this.ground = canvas(size, size)
    this.overlay = canvas(size, size)
    const g = this.ground.getContext('2d')!
    const o = this.overlay.getContext('2d')!
    const r = new Rng(1234)
    for (let ty = 0; ty < MAP; ty++)
      for (let tx = 0; tx < MAP; tx++) {
        const t = this.at(tx, ty)
        const x = tx * TILE, y = ty * TILE
        drawGrass(g, x, y, r)
        switch (t) {
          case T.TALL: drawTall(g, x, y); break
          case T.PATH: drawPath(g, x, y, r, this, tx, ty); break
          case T.SAND: drawSand(g, x, y, r); break
          case T.WATER: drawWater(g, x, y, this, tx, ty); break
          case T.BRIDGE: drawBridge(g, x, y); break
          case T.FLOWER: drawFlower(g, x, y, r); break
          case T.ROCK: drawRock(g, x, y); break
          case T.TREE: drawTrunk(g, x, y); break
        }
      }
    // Canopies on the overlay so things walking "behind" a tree are covered.
    for (let ty = 0; ty < MAP; ty++)
      for (let tx = 0; tx < MAP; tx++)
        if (this.at(tx, ty) === T.TREE) drawCanopy(o, tx * TILE, ty * TILE, (tx * 7 + ty * 13) % 3)
    for (const h of this.houses) drawHouse(g, o, h)

    // Minimap
    this.mini = canvas(MAP, MAP)
    const m = this.mini.getContext('2d')!
    const col: Record<number, string> = {
      [T.GRASS]: '#78c060', [T.TALL]: '#4a9a40', [T.PATH]: '#e0c890', [T.SAND]: '#f0e0a0', [T.WATER]: '#5890e8',
      [T.TREE]: '#2c6a34', [T.ROCK]: '#909098', [T.HOUSE]: '#e05848', [T.FLOWER]: '#78c060', [T.BRIDGE]: '#c09060',
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

// ---------- Tile painters (Black/White palette) ----------

function drawGrass(g: CanvasRenderingContext2D, x: number, y: number, r: Rng) {
  g.fillStyle = '#78c860'
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = '#60b050'
  for (let i = 0; i < 3; i++) {
    const px = x + r.int(1, 13), py = y + r.int(1, 13)
    g.fillRect(px, py, 1, 1)
    g.fillRect(px + 2, py, 1, 1)
    g.fillRect(px + 1, py + 1, 1, 1)
  }
  if (r.next() < 0.3) {
    g.fillStyle = '#98d878'
    g.fillRect(x + r.int(1, 14), y + r.int(1, 14), 1, 1)
  }
}

function drawTall(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = '#4c9c44'
  g.fillRect(x, y, TILE, TILE)
  for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
    const bx = x + ox, by = y + oy
    g.fillStyle = '#2e6e30'
    g.fillRect(bx + 1, by + 5, 6, 3)
    g.fillRect(bx + 1, by + 2, 1, 3)
    g.fillRect(bx + 3, by + 1, 1, 4)
    g.fillRect(bx + 5, by + 2, 1, 3)
    g.fillStyle = '#7ccc5c'
    g.fillRect(bx + 2, by + 3, 1, 3)
    g.fillRect(bx + 4, by + 2, 1, 3)
    g.fillRect(bx + 6, by + 3, 1, 3)
  }
}

function drawPath(g: CanvasRenderingContext2D, x: number, y: number, r: Rng, w: World, tx: number, ty: number) {
  g.fillStyle = '#e8d098'
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = '#d0b478'
  for (let i = 0; i < 3; i++) g.fillRect(x + r.int(1, 14), y + r.int(1, 14), 2, 1)
  // soft grass edge
  g.fillStyle = '#a8c870'
  const isPath = (a: number, b: number) => { const t = w.at(a, b); return t === T.PATH || t === T.BRIDGE || t === T.HOUSE }
  if (!isPath(tx, ty - 1)) g.fillRect(x, y, TILE, 1)
  if (!isPath(tx, ty + 1)) g.fillRect(x, y + 15, TILE, 1)
  if (!isPath(tx - 1, ty)) g.fillRect(x, y, 1, TILE)
  if (!isPath(tx + 1, ty)) g.fillRect(x + 15, y, 1, TILE)
}

function drawSand(g: CanvasRenderingContext2D, x: number, y: number, r: Rng) {
  g.fillStyle = '#f0e0a8'
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = '#dcc888'
  for (let i = 0; i < 4; i++) g.fillRect(x + r.int(0, 15), y + r.int(0, 15), 1, 1)
}

function drawWater(g: CanvasRenderingContext2D, x: number, y: number, w: World, tx: number, ty: number) {
  g.fillStyle = '#5890e8'
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = '#80b0f8'
  const s = (tx * 3 + ty * 5) % 8
  g.fillRect(x + s, y + 4, 5, 1)
  g.fillRect(x + ((s + 6) % 10), y + 11, 5, 1)
  g.fillStyle = '#d0e8ff'
  const land = (a: number, b: number) => { const t = w.at(a, b); return t !== T.WATER && t !== T.BRIDGE }
  if (land(tx, ty - 1)) g.fillRect(x, y, TILE, 2)
  if (land(tx - 1, ty)) g.fillRect(x, y, 2, TILE)
  if (land(tx + 1, ty)) g.fillRect(x + 14, y, 2, TILE)
  g.fillStyle = '#3870c0'
  if (land(tx, ty + 1)) g.fillRect(x, y + 14, TILE, 2)
}

function drawBridge(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = '#5890e8'
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = '#c89860'
  g.fillRect(x, y + 1, TILE, 14)
  g.fillStyle = '#986838'
  for (let i = 0; i < 4; i++) g.fillRect(x, y + 1 + i * 4, TILE, 1)
  g.fillRect(x + 7, y + 1, 1, 14)
}

function drawFlower(g: CanvasRenderingContext2D, x: number, y: number, r: Rng) {
  const col = r.pick(['#f05858', '#f8d038', '#f890c0', '#ffffff'])
  for (const [ox, oy] of [[3, 3], [10, 9]]) {
    g.fillStyle = col
    g.fillRect(x + ox, y + oy - 1, 2, 1)
    g.fillRect(x + ox - 1, y + oy, 4, 2)
    g.fillRect(x + ox, y + oy + 2, 2, 1)
    g.fillStyle = '#f8f0a0'
    g.fillRect(x + ox, y + oy, 2, 2)
  }
}

function drawRock(g: CanvasRenderingContext2D, x: number, y: number) {
  disc(g, x + 8, y + 9, 6.5, '#585860')
  disc(g, x + 8, y + 9, 5.5, '#a8a8b0')
  disc(g, x + 7, y + 7, 3, '#d8d8e0')
  g.fillStyle = '#787880'
  g.fillRect(x + 4, y + 12, 9, 2)
}

function drawTrunk(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = '#3a6a30'
  g.fillRect(x + 2, y + 12, 12, 3)
  g.fillStyle = '#6a4a2a'
  g.fillRect(x + 6, y + 8, 4, 7)
  g.fillStyle = '#4a3018'
  g.fillRect(x + 6, y + 8, 1, 7)
}

function drawCanopy(o: CanvasRenderingContext2D, x: number, y: number, v: number) {
  const cx = x + 8, cy = y + 3
  disc(o, cx, cy, 10, '#1c4a28')
  disc(o, cx, cy, 9, v === 0 ? '#2c7a3c' : v === 1 ? '#2a7238' : '#307e40')
  disc(o, cx - 1, cy - 1, 6.5, '#3c9a48')
  disc(o, cx - 3, cy - 4, 3, '#68c060')
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
