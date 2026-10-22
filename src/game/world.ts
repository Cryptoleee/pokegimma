import { Rng } from './rng'
import { THEMES, type ThemeId, type WorldTheme } from '../data/themes'
import { STADIUMS, type StadiumDef, type StadiumId } from '../data/stadiums'
import type { DungeonDef, Rect } from '../data/dungeons'
import { hash, mix, paintGrass, shade, tallBed, tileArt, tone } from './tiles'

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
  /** Arena only (Stormtop): a lightning rod, blocks movement. */
  ROD,
  /** 1 vs 1 stadium: the stands around the field (blocks movement). */
  STAND,
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
export type ArenaKind = 'crater' | 'icecave' | 'plateau' | 'sky' | 'lab'

export interface WorldOpts {
  theme?: ThemeId
  arena?: ArenaKind
  /** 1 vs 1 stadium (instead of the clearing). */
  stadium?: StadiumId
  /** Raid dungeon: rooms and halls winding around the arena. */
  dungeon?: DungeonDef
}

/** A dungeon gate: blocks the way (and shots) until it's opened. */
export interface Gate extends Rect {
  open: boolean
  /** Game time it opened at (drives the crumbling animation). */
  openAt: number
}

/** Arena centre and radius (tiles). */
export const ARENA_C = MAP / 2
export const ARENA_R = 15
/** 1 vs 1 stadium field: half its width and height (tiles), around ARENA_C. */
export const FIELD_W = 10
export const FIELD_H = 13

export class World {
  tiles = new Uint8Array(MAP * MAP)
  houses: House[] = []
  towns: Town[] = []
  tall: number[] = []
  /** Tall grass someone just walked through (tile index → time): it shakes. */
  rustle = new Map<number, number>()
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
  /** Stormtop: lightning rods (tile coords) that arc to their neighbours. */
  rods: { x: number; y: number }[] = []
  /** Psychic lab: size of the floor grid cells (tiles). */
  static readonly LAB_CELL = 3
  /** 1 vs 1: power-up pads (centre first) and the two spawn spots. */
  pads: { x: number; y: number }[] = []
  spawns: [number, number][] = []
  /** 1 vs 1 stadium this world is (null elsewhere). */
  stadium: StadiumDef | null = null
  /** Raid dungeon gates (closed until their room is cleared). */
  gates: Gate[] = []
  /** Dungeon vents in the forge rooms: they erupt now and then. */
  dvents: { x: number; y: number }[] = []
  /** Dungeon braziers along the walls (drawn and lit every frame). */
  braziers: { x: number; y: number }[] = []

  constructor(public rng: Rng, opts: WorldOpts = {}) {
    const st = opts.stadium ? STADIUMS[opts.stadium] : null
    this.theme = st ? { ...THEMES[st.theme], weather: st.weather } : THEMES[opts.theme ?? (opts.arena ?? 'forest')]
    this.arena = opts.arena ?? null
    if (opts.dungeon && this.arena) this.generateDungeon(opts.dungeon, this.arena)
    else if (this.arena) this.generateArena(this.arena)
    else if (st) this.generateStadium(st)
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
    return t === T.WATER || t === T.TREE || t === T.ROCK || t === T.HOUSE || t === T.PILLAR || t === T.ROD || t === T.STAND || (this.gates.length > 0 && this.gateAt(tx, ty) >= 0)
  }

  /** The closed gate on a tile (-1 = none). */
  gateAt(tx: number, ty: number): number {
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i]
      if (!g.open && tx >= g.x && tx < g.x + g.w && ty >= g.y && ty < g.y + g.h) return i
    }
    return -1
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
      const walk = !(t === T.WATER || t === T.TREE || t === T.ROCK || t === T.HOUSE || t === T.PILLAR || t === T.ROD || t === T.STAND)
      if (walk && !seen[i]) this.tiles[i] = T.TREE
      else if (walk) {
        this.walkable.push(i)
        if (t === T.TALL) this.tall.push(i)
      }
    }
  }

  /**
   * 1 vs 1 stadium: a rectangular battle field with stands all around. Every
   * layout is mirrored through the centre, so both trainers get the same field.
   */
  private generateStadium(def: StadiumDef) {
    const c = ARENA_C, W = FIELD_W, H = FIELD_H
    this.stadium = def
    this.tiles.fill(T.STAND)
    const floor = def.id === 'desert' || def.id === 'volcano' || def.id === 'water' ? T.SAND : T.GRASS
    for (let y = c - H; y < c + H; y++) for (let x = c - W; x < c + W; x++) this.set(x, y, floor)
    // (dx, dy) from the centre, plus its mirror image
    const both = (dx: number, dy: number, t: T) => {
      this.set(c + dx, c + dy, t)
      this.set(c - 1 - dx, c - 1 - dy, t)
    }
    const rect = (dx: number, dy: number, w: number, h: number, t: T) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) both(dx + i, dy + j, t)
    }
    switch (def.id) {
      case 'classic':
        // Hedges along the side walls, statues beside the centre circle
        rect(-10, -8, 2, 4, T.TALL)
        rect(-10, 4, 2, 4, T.TALL)
        both(-5, -1, T.ROCK)
        both(-4, -7, T.ROCK)
        break
      case 'desert':
        // Boulder clusters and dry grass
        rect(-7, -2, 2, 1, T.ROCK)
        both(-7, -1, T.ROCK)
        rect(2, -8, 2, 1, T.ROCK)
        rect(-9, 5, 3, 2, T.TALL)
        rect(4, 1, 2, 2, T.TALL)
        break
      case 'ice':
        // A rink in the middle (slippery), snow around it; snowy bushes in the corners
        for (let y = c - 9; y < c + 9; y++) for (let x = c - 7; x < c + 7; x++) this.set(x, y, T.ICE)
        rect(-10, -13, 3, 2, T.TALL)
        rect(8, -13, 2, 3, T.TALL)
        both(-8, -2, T.ROCK)
        both(-3, -6, T.ROCK)
        break
      case 'water':
        // Two pools split the field, a bridge over each, reeds along the sides
        rect(-8, -4, 6, 8, T.WATER)
        rect(-8, -1, 6, 1, T.BRIDGE)
        rect(-10, -4, 1, 8, T.TALL)
        both(-5, -9, T.ROCK)
        break
      case 'volcano':
        // Lava pools (block the way, not attacks) and obsidian rocks
        rect(-10, -6, 6, 2, T.WATER)
        rect(-4, -6, 1, 1, T.WATER)
        rect(-2, -2, 1, 1, T.ROCK)
        rect(-9, 2, 2, 3, T.TALL)
        both(-7, -10, T.ROCK)
        break
    }
    this.pads = [{ x: c, y: c }, { x: c - 6.5, y: c + 4.5 }, { x: c + 6.5, y: c - 4.5 }]
    if (def.id === 'water') this.pads = [{ x: c, y: c }, { x: c - 8.5, y: c + 6.5 }, { x: c + 8.5, y: c - 6.5 }]
    this.spawns = [[c, c + 10.5], [c, c - 10.5]]
    // Pads and spawns always stand on open floor
    for (const p of [...this.pads, ...this.spawns.map(([x, y]) => ({ x, y }))]) {
      const tx = Math.floor(p.x), ty = Math.floor(p.y)
      const t = this.at(tx, ty)
      if (t !== T.ICE && t !== T.BRIDGE) this.set(tx, ty, floor)
    }
    this.collect(c, c + 10)
  }

  /** A round raid arena in the middle of a walled-off map. */
  private generateArena(kind: ArenaKind) {
    this.tiles.fill(T.TREE)
    this.carveArena(kind)
    this.collect(ARENA_C, ARENA_C)
  }

  /**
   * A raid dungeon: rooms joined by halls that wind around the arena in the
   * middle, the last hall running into it. Each room gets its own look; nothing
   * that blocks is ever put near a room's edge, so every way through stays open.
   */
  private generateDungeon(def: DungeonDef, kind: ArenaKind) {
    const rng = this.rng
    const veins = new Noise(rng, 5)
    this.tiles.fill(T.TREE)
    const near = (x: number, y: number, r: Rect, pad: number) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad
    const nearHall = (x: number, y: number, pad: number) => def.halls.some((h) => near(x, y, h, pad))
    const floor = (x: number, y: number) => (veins.fbm(x, y) > 0.62 ? T.SAND : T.GRASS)
    // Halls: plain stone floor
    for (const h of def.halls) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) this.set(x, y, T.SAND)
    for (const room of def.rooms) {
      const { x: rx, y: ry, w, h } = room.rect
      for (let y = ry; y < ry + h; y++)
        for (let x = rx; x < rx + w; x++) {
          // A ragged edge (never where a hall comes in)
          const edge = Math.min(x - rx, rx + w - 1 - x, y - ry, ry + h - 1 - y)
          if (edge === 0 && !nearHall(x, y, 3) && rng.next() < 0.45) continue
          this.set(x, y, floor(x, y))
        }
      const cx = rx + Math.floor(w / 2), cy = ry + Math.floor(h / 2)
      const rock = (x: number, y: number, s = 1) => {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (!nearHall(x + dx, y + dy, 3)) this.set(x + dx, y + dy, T.ROCK)
      }
      const lava = (x: number, y: number, pw: number, ph: number) => {
        for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) if (this.at(x + dx, y + dy) !== T.TREE && this.at(x + dx, y + dy) !== T.ROCK) this.set(x + dx, y + dy, T.LAVA)
      }
      switch (room.deco) {
        case 'gate':
          // Broken pillars either side of the way in, lava seeping in at the corners
          for (const [dx, dy] of [[-6, -5], [6, -5], [-6, 3], [6, 3]]) rock(cx + dx, cy + dy)
          lava(rx + 2, ry + h - 5, 3, 3)
          lava(rx + w - 5, ry + h - 5, 3, 3)
          break
        case 'river': {
          // A lava river across the hall with two stone bridges
          for (let x = rx; x < rx + w; x++) {
            const bridge = (x >= rx + 4 && x < rx + 7) || (x >= rx + w - 7 && x < rx + w - 4)
            const wob = Math.round(Math.sin(x * 0.6) * 0.8)
            for (let y = cy - 1 + wob; y <= cy + 1 + wob; y++) if (this.at(x, y) !== T.TREE) this.set(x, y, bridge ? T.SAND : T.LAVA)
          }
          rock(cx - 1, cy - 6)
          rock(cx + 1, cy + 6)
          break
        }
        case 'hall':
          // Two rows of great pillars and lava channels along the walls
          for (let i = 0; i < 4; i++) {
            rock(rx + 6 + i * 6, ry + 7, 2)
            rock(rx + 6 + i * 6, ry + h - 9, 2)
          }
          lava(rx + 2, ry + 4, 1, h - 8)
          lava(rx + w - 3, ry + 4, 1, h - 8)
          break
        case 'forge':
          // Lava pools, and vents that erupt now and then
          lava(cx - 1, cy - 1, 3, 3)
          for (const [dx, dy] of [[-8, -6], [7, -6], [-8, 6], [7, 6]]) {
            const vx = cx + dx, vy = cy + dy
            lava(vx - 1, vy - 1, 2, 2)
            this.dvents.push({ x: vx, y: vy })
          }
          break
        case 'den':
          // A ring of boulders around the warden's lair, cracks of lava running through
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.2
            rock(Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 9))
          }
          for (let i = 0; i < 3; i++) {
            let a = rng.range(0, Math.PI * 2), d = 2.5
            while (d < 11) {
              const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d)
              if (this.at(x, y) === T.GRASS || this.at(x, y) === T.SAND) this.set(x, y, T.LAVA)
              d += 0.6
              a += rng.range(-0.12, 0.12)
            }
          }
          break
        case 'bastion':
          // Four towers and a lava moat line in front of the arena gate
          for (const [dx, dy] of [[-8, -7], [6, -7], [-8, 5], [6, 5]]) rock(cx + dx, cy + dy, 2)
          lava(rx + 4, cy - 1, 1, 3)
          break
      }
    }
    // Braziers along the room walls and both sides of every hall
    const floorAt = (x: number, y: number) => {
      const t = this.at(x, y)
      return t === T.GRASS || t === T.SAND
    }
    for (const room of def.rooms) {
      const { x: rx, y: ry, w, h } = room.rect
      const spots: [number, number][] = []
      for (let x = rx + 3; x < rx + w - 3; x += 6) spots.push([x, ry + 1], [x, ry + h - 2])
      for (let y = ry + 4; y < ry + h - 4; y += 6) spots.push([rx + 1, y], [rx + w - 2, y])
      for (const [x, y] of spots) if (floorAt(x, y) && !nearHall(x, y, 2)) this.braziers.push({ x: x + 0.5, y: y + 0.5 })
    }
    for (const hl of def.halls) {
      const long = hl.w > hl.h
      for (let k = 2; k < (long ? hl.w : hl.h) - 1; k += 5) {
        if (long) this.braziers.push({ x: hl.x + k + 0.5, y: hl.y + 0.6 }, { x: hl.x + k + 0.5, y: hl.y + hl.h - 0.4 })
        else this.braziers.push({ x: hl.x + 0.6, y: hl.y + k + 0.5 }, { x: hl.x + hl.w - 0.4, y: hl.y + k + 0.5 })
      }
    }
    this.carveArena(kind)
    this.collect(def.start[0], def.start[1])
    // Gates go in last: closed, they'd cut the flood above in two
    this.gates = def.gates.map((r) => ({ ...r, open: false, openAt: 0 }))
  }

  /** The arena itself (on an already walled-off map). */
  private carveArena(kind: ArenaKind) {
    const rng = this.rng
    const c = ARENA_C, R = ARENA_R
    const veins = new Noise(rng, 5)
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
        // A slightly ragged edge
        if (d > R + Math.sin(Math.atan2(y - c, x - c) * 5) * 0.8) continue
        let t = kind === 'icecave' ? T.ICE : T.GRASS
        if (kind === 'crater') {
          if (veins.fbm(x, y) > 0.62) t = T.SAND
          else if (rng.next() < 0.008 && d > 5) t = T.ROCK
        } else if (kind === 'icecave' && rng.next() < 0.06 && d > 3) t = T.SAND
        else if (kind === 'plateau' && veins.fbm(x, y) > 0.6) t = T.SAND
        else if (kind === 'sky' && veins.fbm(x, y) > 0.64) t = T.SAND
        this.set(x, y, t)
      }
    if (kind === 'plateau') {
      // Four lightning rods on the diagonals (none between the spawn and the boss)
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2
        const rx = Math.floor(c + Math.cos(a) * 9.5), ry = Math.floor(c + Math.sin(a) * 9.5)
        this.set(rx, ry, T.ROD)
        this.rods.push({ x: rx, y: ry })
      }
    } else if (kind === 'sky') {
      // Broken pillars of the Sky Pillar's roof: a little cover, clear of the
      // spawn arc at the bottom of the arena
      for (let i = 0; i < 6; i++) {
        if (i === 1) continue
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6
        this.set(Math.floor(c + Math.cos(a) * 7.5), Math.floor(c + Math.sin(a) * 7.5), T.ROCK)
      }
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
    } else if (kind === 'icecave') {
      // Six ice pillars in a ring: cover from beams and blizzards (none right
      // between the spawn at the bottom and the boss)
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3
        const px = Math.round(c + Math.cos(a) * 9 - 1), py = Math.round(c + Math.sin(a) * 9 - 1)
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.set(px + dx, py + dy, T.PILLAR)
        this.pillars.push({ x: px, y: py, hp: 1 })
      }
    }
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
        if (t === T.STAND) {
          paintStand(g, x, y, tx, ty, this.stadium!)
          continue
        }
        // Open-world maps get the detailed BW tiles; raid arenas keep their own floors
        const fancy = !this.arena
        if (t === T.ICE || t === T.PILLAR) drawIce(g, x, y, this.stadium ? RINK : th, tx, ty)
        else if (this.arena === 'lab' && t !== T.TREE) drawLabFloor(g, x, y, th, tx, ty)
        else if (this.arena === 'sky' && t !== T.TREE) drawSkyStone(g, x, y, th, tx, ty, t === T.SAND)
        else if (fancy) paintGrass(g, x, y, tx, ty, th)
        else drawGrass(g, x, y, r, th)
        switch (t) {
          // Tall grass and flowers are drawn (animated) every frame on top of this
          case T.TALL: fancy ? tallBed(g, x, y, th) : drawTall(g, x, y, th); break
          case T.PATH: fancy ? paintPath(g, x, y, this, tx, ty, th) : drawPath(g, x, y, r, this, tx, ty, th); break
          case T.SAND: if (this.arena !== 'sky') fancy ? paintSand(g, x, y, tx, ty, th, this) : drawSand(g, x, y, r, th); break
          case T.WATER: fancy && th.liquid === 'water' ? paintWater(g, x, y, this, tx, ty, th) : fancy && th.liquid === 'lava' ? paintLava(g, x, y, this, tx, ty, th) : drawWater(g, x, y, this, tx, ty, th); break
          case T.BRIDGE: drawBridge(g, x, y, th); break
          case T.FLOWER: if (!fancy) drawFlower(g, x, y, r, th); break
          case T.ROCK: fancy ? paintRock(g, x, y, tx, ty, th) : this.arena === 'sky' ? drawPillarStub(g, o, x, y, th) : this.gates.length ? drawBasalt(g, o, x, y, this, tx, ty) : drawRock(g, x, y, th); break
          case T.TREE: fancy && isTree(th) ? treeBase(g, x, y, th) : drawTrunk(g, o, x, y, th, this, tx, ty); break
          case T.LAVA: drawLava(g, x, y, this, tx, ty); break
        }
      }
    // Trees on the overlay so things walking "behind" a tree are covered.
    if (isTree(th)) {
      const art = tileArt(th)
      for (let ty = 0; ty < MAP; ty++)
        for (let tx = 0; tx < MAP; tx++) {
          if (this.at(tx, ty) !== T.TREE) continue
          if (this.arena) {
            drawCanopy(o, tx * TILE, ty * TILE, (tx * 7 + ty * 13) % 3, th)
            continue
          }
          const v = Math.floor(hash(tx, ty, 77) * 3)
          const c = art.trees[v]
          // A pixel of jitter so a forest doesn't look stamped
          const jx = Math.round((hash(tx, ty, 78) - 0.5) * 2), jy = Math.round((hash(tx, ty, 79) - 0.5) * 2)
          const ax = th.decor === 'pine' ? 3 : th.decor === 'dead' ? 4 : th.decor === 'cactus' ? 0 : 7
          o.drawImage(c, tx * TILE - ax + jx, ty * TILE + TILE - c.height + (th.decor === 'oak' ? -4 : th.decor === 'pine' ? -5 : th.decor === 'dead' ? -1 : 0) + jy)
        }
    }
    if (this.stadium) paintField(g, this)
    for (const h of this.houses) (this.arena ? drawHouse : paintHouse)(g, o, h)
    for (const p of this.pillars) if (p.hp > 0) drawPillar(g, o, p.x * TILE, p.y * TILE)
    for (const v of [...this.vents, ...this.dvents]) drawVent(g, v.x * TILE, v.y * TILE)
    if (this.gates.length) paintDungeonFloor(g, this)
    for (const rd of this.rods) drawRod(g, o, rd.x * TILE, rd.y * TILE)

    // Minimap
    this.mini = canvas(MAP, MAP)
    const m = this.mini.getContext('2d')!
    const mc = th.mini
    const col: Record<number, string> = {
      [T.GRASS]: mc.grass, [T.TALL]: mc.tall, [T.PATH]: mc.path, [T.SAND]: mc.sand, [T.WATER]: mc.water,
      [T.TREE]: mc.tree, [T.ROCK]: '#909098', [T.HOUSE]: '#e05848', [T.FLOWER]: mc.grass, [T.BRIDGE]: '#c09060',
      [T.LAVA]: '#ff7020', [T.ICE]: '#cce8f8', [T.PILLAR]: '#ffffff', [T.ROD]: '#ffe060', [T.STAND]: '#303040',
    }
    for (let ty = 0; ty < MAP; ty++)
      for (let tx = 0; tx < MAP; tx++) {
        m.fillStyle = col[this.at(tx, ty)]
        m.fillRect(tx, ty, 1, 1)
      }
  }
}

// ---------- 1 vs 1 stadium ----------

/** The ice rink in a stadium: blue-white, so it stands out from the snow around it. */
const RINK = { ...THEMES.snow, grass: ['#cce6f8', '#9ccaee', '#f0f9ff'] as [string, string, string] }
export const SKIN = ['#f8d0b0', '#e8b088', '#c08860', '#8a5a3a', '#f0c8a0']
const SHIRTS = ['#e84848', '#4878e8', '#f8d040', '#58c058', '#f0f0f0', '#a058d8', '#f08838', '#40c8c8', '#303040']

/**
 * The stands: the wall with ad boards right at the field, then rows of seats
 * full of people (your side's colour at the bottom, theirs at the top), then
 * the dark back of the stadium.
 */
export function standCell(tx: number, ty: number, s: StadiumDef) {
  const c = ARENA_C
  const ox = Math.abs(tx + 0.5 - c) - FIELD_W, oy = Math.abs(ty + 0.5 - c) - FIELD_H
  const vertical = ox > oy
  return { row: Math.floor(Math.max(ox, oy)), vertical, seat: vertical ? s.seats[2] : ty < c ? s.seats[1] : s.seats[0] }
}

/** Where the k-th person (0-3) of a stand tile sits, if anyone does (same in the baked stands and the live crowd). */
export function standPerson(tx: number, ty: number, k: number, vertical: boolean): [number, number, number] | null {
  const h = hash(tx, ty, 60 + k)
  if (h > 0.66) return null
  const a = (k % 2) * 8 + 2, b = Math.floor(k / 2) * 8 + 1
  return [vertical ? b + 1 : a, vertical ? a : b, h]
}

function paintStand(g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, s: StadiumDef) {
  const { row, vertical, seat } = standCell(tx, ty, s)
  if (row === 0) {
    // The wall: ad boards in turn, white lettering, a shadow on the field side
    const along = vertical ? ty : tx
    const board = Math.floor(along / 3) % 3
    const col = [seat, '#f8f8f8', '#283048'][board]
    g.fillStyle = '#20202c'
    g.fillRect(x, y, TILE, TILE)
    g.fillStyle = col
    if (vertical) g.fillRect(x + 3, y, 10, TILE)
    else g.fillRect(x, y + 3, TILE, 10)
    g.fillStyle = board === 1 ? seat : '#ffffff'
    const k = hash(tx, ty, 41)
    for (let i = 0; i < 3; i++) {
      const len = 2 + Math.floor(hash(tx, ty, 42 + i) * 3)
      if (vertical) g.fillRect(x + 6 + (i % 2) * 3, y + 2 + i * 4 + Math.floor(k * 2), 2, len)
      else g.fillRect(x + 2 + i * 5 + Math.floor(k * 2), y + 6 + (i % 2) * 3, len, 2)
    }
    return
  }
  if (row > 8) {
    // The back of the stadium: dark, with a lamp here and there
    g.fillStyle = row > 9 ? '#12121c' : '#1c1c28'
    g.fillRect(x, y, TILE, TILE)
    if (row === 10 && hash(tx, ty, 50) < 0.12) {
      g.fillStyle = '#fff8d0'
      g.fillRect(x + 4, y + 5, 8, 6)
    }
    return
  }
  // Seats: two rows per tile, a step line between rows, higher rows a little lighter
  const lift = Math.min(0.3, row * 0.035)
  const base = mix('#14141c', seat, 0.3 + lift), chair = mix('#14141c', seat, 0.55 + lift), step = mix('#0c0c12', seat, 0.15)
  g.fillStyle = base
  g.fillRect(x, y, TILE, TILE)
  for (let k = 0; k < 2; k++) {
    g.fillStyle = step
    if (vertical) g.fillRect(x + k * 8 + 7, y, 1, TILE)
    else g.fillRect(x, y + k * 8 + 7, TILE, 1)
    g.fillStyle = chair
    // Two chairs per row
    for (let j = 0; j < 2; j++) {
      if (vertical) g.fillRect(x + k * 8 + 2, y + j * 8 + 1, 4, 6)
      else g.fillRect(x + j * 8 + 1, y + k * 8 + 2, 6, 4)
    }
  }
  // People: about two thirds of the chairs, mostly in their side's colour
  for (let k = 0; k < 4; k++) {
    const p = standPerson(tx, ty, k, vertical)
    if (!p) continue
    const [dx, dy, h] = p
    const px = x + dx, py = y + dy
    const shirt = h < 0.36 ? seat : h < 0.46 ? '#f4f4f4' : SHIRTS[Math.floor(hash(tx, ty, 70 + k) * SHIRTS.length)]
    g.fillStyle = shirt
    g.fillRect(px, py + 3, 4, 3)
    g.fillStyle = SKIN[Math.floor(hash(tx, ty, 80 + k) * SKIN.length)]
    g.fillRect(px + 1, py, 2, 3)
    // Now and then a flag
    if (h < 0.04) {
      g.fillStyle = '#ffffff'
      g.fillRect(px + 4, py - 2, 1, 5)
      g.fillStyle = seat
      g.fillRect(px + 5, py - 2, 3, 2)
    }
  }
}

/**
 * The battle field's markings: mown stripes (grass), the outer line, the centre
 * line and circle, the Poké Ball in the middle and a trainer box at each end.
 */
function paintField(g: CanvasRenderingContext2D, w: World) {
  const s = w.stadium!
  const c = ARENA_C, W = FIELD_W, H = FIELD_H
  const X0 = (c - W) * TILE, Y0 = (c - H) * TILE, X1 = (c + W) * TILE, Y1 = (c + H) * TILE
  const open = (t: T) => t === T.GRASS || t === T.SAND || t === T.ICE
  // Mown stripes on grass
  if (s.id === 'classic')
    for (let ty = c - H; ty < c + H; ty++)
      for (let tx = c - W; tx < c + W; tx++)
        if (Math.floor((ty - (c - H)) / 2) % 2 === 0 && w.at(tx, ty) === T.GRASS) {
          g.fillStyle = 'rgba(255,255,255,0.07)'
          g.fillRect(tx * TILE, ty * TILE, TILE, TILE)
        }
  g.save()
  g.strokeStyle = s.lines
  g.lineWidth = 2
  // Outer line, centre line, centre circle
  g.strokeRect(X0 + 8, Y0 + 8, X1 - X0 - 16, Y1 - Y0 - 16)
  g.beginPath()
  g.moveTo(X0 + 8, c * TILE)
  g.lineTo(X1 - 8, c * TILE)
  g.stroke()
  g.beginPath()
  g.arc(c * TILE, c * TILE, 3 * TILE, 0, Math.PI * 2)
  g.stroke()
  // Trainer boxes at both ends
  for (const dir of [1, -1]) {
    const yEdge = c * TILE + dir * (H * TILE - 8)
    g.strokeRect(c * TILE - 2.5 * TILE, dir > 0 ? yEdge - 4.5 * TILE : yEdge, 5 * TILE, 4.5 * TILE)
  }
  // The Poké Ball in the middle
  const R = 1.7 * TILE
  g.globalAlpha = 0.55
  g.fillStyle = '#e83838'
  g.beginPath()
  g.arc(c * TILE, c * TILE, R, Math.PI, 0)
  g.fill()
  g.fillStyle = '#f4f4f4'
  g.beginPath()
  g.arc(c * TILE, c * TILE, R, 0, Math.PI)
  g.fill()
  g.globalAlpha = 0.7
  g.fillStyle = '#202028'
  g.fillRect(c * TILE - R, c * TILE - 2, R * 2, 4)
  g.beginPath()
  g.arc(c * TILE, c * TILE, 7, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#f4f4f4'
  g.beginPath()
  g.arc(c * TILE, c * TILE, 4, 0, Math.PI * 2)
  g.fill()
  g.restore()
  // Whatever stands on the lines goes back on top (rocks, water, bridges)
  const th = w.theme
  for (let ty = c - H; ty < c + H; ty++)
    for (let tx = c - W; tx < c + W; tx++) {
      const t = w.at(tx, ty)
      if (open(t) || t === T.TALL || t === T.FLOWER) continue
      const x = tx * TILE, y = ty * TILE
      if (t === T.ROCK) {
        paintGrass(g, x, y, tx, ty, th)
        if (s.id !== 'classic' && s.id !== 'ice') paintSand(g, x, y, tx, ty, th, w)
        paintRock(g, x, y, tx, ty, th)
      } else if (t === T.WATER) th.liquid === 'lava' ? paintLava(g, x, y, w, tx, ty, th) : paintWater(g, x, y, w, tx, ty, th)
      else if (t === T.BRIDGE) {
        paintWater(g, x, y, w, tx, ty, th)
        drawBridge(g, x, y, th)
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

/**
 * Raid dungeon boulders and columns: dark basalt blocks, lit orange along the
 * edges by the lava, rising above their tile (the top goes on the overlay).
 */
function drawBasalt(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, x: number, y: number, w: World, tx: number, ty: number) {
  const up = w.at(tx, ty - 1) === T.ROCK, down = w.at(tx, ty + 1) === T.ROCK
  const left = w.at(tx - 1, ty) === T.ROCK, right = w.at(tx + 1, ty) === T.ROCK
  const v = hash(tx, ty, 91)
  // Face (on the ground canvas)
  g.fillStyle = '#16100f'
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = v > 0.5 ? '#2c2224' : '#261e20'
  g.fillRect(x + (left ? 0 : 1), y, TILE - (left ? 0 : 1) - (right ? 0 : 1), TILE - (down ? 0 : 2))
  g.fillStyle = '#3a2e30'
  for (let i = 0; i < 3; i++) g.fillRect(x + 3 + Math.floor(hash(tx, ty, 92 + i) * 9), y + 3 + i * 4, 2 + Math.floor(hash(tx, ty, 95 + i) * 3), 1)
  if (!down) {
    // Lava light along the foot
    g.fillStyle = 'rgba(255,110,40,0.55)'
    g.fillRect(x + (left ? 0 : 1), y + TILE - 3, TILE - (left ? 0 : 1) - (right ? 0 : 1), 1)
  }
  // Top (on the overlay, above the tile: things behind it are hidden)
  if (!up) {
    o.fillStyle = '#16100f'
    o.fillRect(x, y - 9, TILE, 9)
    o.fillStyle = '#4a3c3c'
    o.fillRect(x + (left ? 0 : 1), y - 8, TILE - (left ? 0 : 1) - (right ? 0 : 1), 7)
    o.fillStyle = '#5e4c4a'
    o.fillRect(x + (left ? 0 : 1), y - 8, TILE - (left ? 0 : 1) - (right ? 0 : 1), 2)
  }
}

/** Raid dungeon floors: cracks, glowing fissures, old bones, scorch marks by the lava. */
function paintDungeonFloor(g: CanvasRenderingContext2D, w: World) {
  for (let ty = 1; ty < MAP - 1; ty++)
    for (let tx = 1; tx < MAP - 1; tx++) {
      const t = w.at(tx, ty)
      if (t !== T.GRASS && t !== T.SAND) continue
      // Leave the crater arena as it is
      if (Math.hypot(tx + 0.5 - ARENA_C, ty + 0.5 - ARENA_C) < ARENA_R + 1.5) continue
      const x = tx * TILE, y = ty * TILE
      const v = hash(tx, ty, 201)
      const nearLava = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.at(tx + dx, ty + dy) === T.LAVA)
      if (nearLava) {
        g.fillStyle = 'rgba(20,6,4,0.35)'
        g.fillRect(x, y, TILE, TILE)
        g.fillStyle = 'rgba(255,120,40,0.18)'
        g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
      }
      if (v < 0.05) {
        // A crack, sometimes with lava glowing in it
        const glow = v < 0.018
        g.fillStyle = glow ? '#ff7a28' : '#1a1212'
        let cx = x + 2 + Math.floor(hash(tx, ty, 202) * 5), cy = y + 3 + Math.floor(hash(tx, ty, 203) * 6)
        for (let i = 0; i < 6; i++) {
          g.fillRect(cx, cy, 2, 1)
          cx += 1 + Math.floor(hash(tx, ty, 210 + i) * 2)
          cy += Math.floor(hash(tx, ty, 220 + i) * 3) - 1
        }
        if (glow) {
          g.fillStyle = 'rgba(255,160,60,0.25)'
          g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
        }
      } else if (v < 0.062) {
        // Old bones
        g.fillStyle = '#d8ccbc'
        g.fillRect(x + 4, y + 9, 8, 2)
        g.fillRect(x + 3, y + 8, 2, 4)
        g.fillRect(x + 11, y + 8, 2, 4)
        g.fillStyle = '#9a8e80'
        g.fillRect(x + 4, y + 11, 8, 1)
      } else if (v < 0.07) {
        // A skull
        g.fillStyle = '#e4d8c8'
        g.fillRect(x + 5, y + 6, 6, 5)
        g.fillRect(x + 6, y + 11, 4, 2)
        g.fillStyle = '#2a2020'
        g.fillRect(x + 6, y + 8, 1, 2)
        g.fillRect(x + 9, y + 8, 1, 2)
      } else if (v < 0.11) {
        // Ash and pebbles
        g.fillStyle = 'rgba(0,0,0,0.22)'
        g.fillRect(x + Math.floor(hash(tx, ty, 230) * 10), y + Math.floor(hash(tx, ty, 231) * 10), 3, 2)
        g.fillStyle = 'rgba(160,140,130,0.3)'
        g.fillRect(x + Math.floor(hash(tx, ty, 232) * 12), y + Math.floor(hash(tx, ty, 233) * 12), 2, 2)
      }
    }
}

/** Blocking "tree" tiles: real trees, or cliffs / ice walls around an arena. */
function drawTrunk(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme, w: World, tx: number, ty: number) {
  const [shadow, trunk, trunkDark] = th.trunk
  if (th.decor === 'sky') {
    // Open sky around the tower top: deeper blue further out, drifting cloud
    // banks, and the pillar's stone wall dropping away under the floor's edge
    const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0
    const far = Math.hypot(tx + 0.5 - ARENA_C, ty + 0.5 - ARENA_C) - ARENA_R
    g.fillStyle = far > 9 ? th.canopy[0] : far > 4 ? th.canopy[1] : th.canopy[2]
    g.fillRect(x, y, TILE, TILE)
    if (h % 5 === 0) {
      g.fillStyle = 'rgba(255,255,255,0.75)'
      g.fillRect(x + (h % 4), y + 6 + ((h >> 3) % 5), 12, 4)
      g.fillRect(x + (h % 4) + 3, y + 3 + ((h >> 3) % 5), 6, 3)
      g.fillStyle = 'rgba(190,215,245,0.8)'
      g.fillRect(x + (h % 4), y + 9 + ((h >> 3) % 5), 12, 1)
    }
    // Stone wall of the tower below the floor's edge
    let up = 0
    while (up < 3 && ty - up - 1 >= 0 && w.blockedTile(tx, ty - up - 1) && w.at(tx, ty - up - 1) === T.TREE) up++
    const floorAbove = ty - up - 1 >= 0 && !(w.at(tx, ty - up - 1) === T.TREE)
    if (floorAbove && up < 2) {
      const [outline, base, hi] = th.rock
      g.fillStyle = up === 0 ? base : outline
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = outline
      g.fillRect(x, y + (up === 0 ? 7 : 3), TILE, 1)
      g.fillRect(x + (ty % 2 ? 4 : 11) , y, 1, TILE)
      if (up === 0) {
        g.fillStyle = hi
        g.fillRect(x, y, TILE, 2)
      } else {
        // Fade into the sky
        g.fillStyle = th.canopy[2]
        g.globalAlpha = 0.6
        g.fillRect(x, y + 8, TILE, 8)
        g.globalAlpha = 1
      }
    }
    return
  }
  if (th.decor === 'labwall') {
    // Lab wall: dark panels with glowing seams
    g.fillStyle = th.canopy[0]
    g.fillRect(x, y, TILE, TILE)
    g.fillStyle = th.canopy[1]
    g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
    g.fillStyle = th.canopy[0]
    g.fillRect(x + 1, y + 8, TILE - 2, 1)
    if ((tx * 5 + ty * 3) % 9 === 0) {
      g.fillStyle = th.canopy[4]
      g.fillRect(x + 4, y + 4, 2, 2)
    }
    const floorBelow = !w.blockedTile(tx, ty + 1) && ty + 1 < MAP
    if (floorBelow) {
      g.fillStyle = trunk
      g.fillRect(x, y + 8, TILE, 8)
      g.fillStyle = th.canopy[4]
      g.globalAlpha = 0.6
      g.fillRect(x, y + 8, TILE, 1)
      g.globalAlpha = 1
    }
    return
  }
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

/** Psychic lab floor: metal plates with the 3x3 grid the floor attack follows. */
function drawLabFloor(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme, tx: number, ty: number) {
  const [base, dark, light] = th.grass
  g.fillStyle = base
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = dark
  g.fillRect(x, y + TILE - 1, TILE, 1)
  g.fillRect(x + TILE - 1, y, 1, TILE)
  g.fillStyle = light
  if ((tx * 3 + ty * 5) % 7 === 0) g.fillRect(x + 3, y + 3, 2, 2)
  // Cell borders every LAB_CELL tiles, aligned to the arena
  const cell = World.LAB_CELL, o = ARENA_C - ARENA_R
  g.fillStyle = 'rgba(190,150,255,0.35)'
  if ((tx - o) % cell === 0) g.fillRect(x, y, 1, TILE)
  if ((ty - o) % cell === 0) g.fillRect(x, y, TILE, 1)
}

/** Cloud floor of the Sky Pillar: soft white with blue shading. */
/**
 * Sky Pillar roof: weathered green-grey flagstones with moss and cracks, and
 * two carved rings around the centre (Rayquaza's resting place).
 */
function drawSkyStone(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme, tx: number, ty: number, moss: boolean) {
  const [base, grout, light] = th.grass
  const h = ((tx * 92837111) ^ (ty * 689287499)) >>> 0
  // Two flagstones per tile, offset every other row like old masonry
  g.fillStyle = grout
  g.fillRect(x, y, TILE, TILE)
  const off = ty % 2 ? 8 : 0
  for (const [sx, sw] of [[-off, 8], [8 - off, 8], [16 - off, 8]] as const) {
    const a = Math.max(0, sx), b = Math.min(TILE, sx + sw)
    if (b - a <= 0) continue
    g.fillStyle = base
    g.fillRect(x + a + (a === sx ? 1 : 0), y + 1, b - a - (a === sx ? 1 : 0), TILE - 2)
    g.fillStyle = light
    g.fillRect(x + a + (a === sx ? 1 : 0), y + 1, b - a - (a === sx ? 1 : 0), 1)
  }
  // Wear: a few darker pits and a crack now and then
  g.fillStyle = grout
  g.fillRect(x + (h % 13) + 1, y + ((h >> 4) % 11) + 3, 2, 1)
  if (h % 5 === 0) {
    const cx = x + 3 + ((h >> 7) % 9), cy = y + 3 + ((h >> 11) % 8)
    g.fillRect(cx, cy, 1, 2)
    g.fillRect(cx + 1, cy + 2, 1, 2)
    g.fillRect(cx + 2, cy + 3, 2, 1)
  }
  // Carved rings with a faint gold inlay
  for (const R of [4.5, 11]) {
    for (let py = 0; py < TILE; py++)
      for (let px = 0; px < TILE; px++) {
        const d = Math.hypot(tx + (px + 0.5) / TILE - ARENA_C, ty + (py + 0.5) / TILE - ARENA_C)
        const e = Math.abs(d - R) * TILE
        if (e < 1.2) {
          g.fillStyle = e < 0.5 ? '#c8a860' : grout
          g.fillRect(x + px, y + py, 1, 1)
        }
      }
  }
  if (moss) {
    // Moss creeping over the stones
    const [m1, m2] = th.sand
    for (let i = 0; i < 7; i++) {
      const k = (h >> (i * 3)) & 0xff
      g.fillStyle = i % 3 ? m1 : m2
      g.fillRect(x + (k % 13), y + ((k >> 3) % 13) + (i & 1), 3 + (i % 3), 2 + (i % 2))
    }
  }
}

/** A broken pillar of the old roof (blocks movement). */
function drawPillarStub(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme) {
  const [outline, base, hi] = th.rock
  g.fillStyle = 'rgba(0,0,0,0.3)'
  g.fillRect(x, y + 12, TILE, 4)
  g.fillStyle = outline
  g.fillRect(x + 1, y + 2, 14, 13)
  g.fillStyle = base
  g.fillRect(x + 2, y + 3, 12, 11)
  g.fillStyle = hi
  g.fillRect(x + 3, y + 3, 2, 11)
  g.fillStyle = outline
  g.fillRect(x + 6, y + 3, 1, 11)
  g.fillRect(x + 10, y + 3, 1, 11)
  // Jagged broken top on the overlay so trainers walk "behind" it
  o.fillStyle = outline
  o.fillRect(x + 1, y - 7, 14, 10)
  o.fillStyle = base
  o.fillRect(x + 2, y - 6, 12, 9)
  o.fillStyle = hi
  o.fillRect(x + 3, y - 6, 2, 9)
  o.fillStyle = outline
  o.fillRect(x + 6, y - 6, 1, 9)
  o.fillRect(x + 10, y - 6, 1, 9)
  o.fillStyle = th.grass[1]
  o.fillRect(x + 1, y - 8, 4, 2)
  o.fillRect(x + 8, y - 10, 5, 4)
  o.fillStyle = th.sand[0]
  o.fillRect(x + 2, y - 8, 3, 1)
}

/** Lightning rod: a metal mast with a glowing coil (the top sits on the overlay). */
function drawRod(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(x + 1, y + 12, 14, 4)
  g.fillStyle = '#3a404c'
  g.fillRect(x + 4, y + 6, 8, 10)
  o.fillStyle = '#1a1e26'
  o.fillRect(x + 6, y - 30, 4, 38)
  o.fillStyle = '#8a94a8'
  o.fillRect(x + 7, y - 30, 2, 38)
  for (let i = 0; i < 4; i++) {
    o.fillStyle = i % 2 ? '#ffd030' : '#c89018'
    o.fillRect(x + 3, y - 22 + i * 4, 10, 2)
  }
  o.fillStyle = '#fff6a0'
  o.fillRect(x + 6, y - 34, 4, 4)
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

// ---------- Detailed BW tiles for the open-world maps (see tiles.ts) ----------

const isTree = (th: WorldTheme) => th.decor === 'oak' || th.decor === 'pine' || th.decor === 'dead' || th.decor === 'cactus'

function px(g: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) {
  g.fillStyle = c
  g.fillRect(x, y, w, h)
}

/** Shadow (and a trunk) on the ground under a tree; the crown is on the overlay. */
function treeBase(g: CanvasRenderingContext2D, x: number, y: number, th: WorldTheme) {
  const [, trunk, trunkDark] = th.trunk
  const sh = mix(th.grass[0], '#000000', 0.32)
  for (let yy = 0; yy < 5; yy++) {
    const half = Math.round(7 * Math.sqrt(1 - ((yy - 2) / 2.6) ** 2))
    px(g, x + 8 - half, y + 11 + yy, sh, half * 2, 1)
  }
  if (th.decor === 'dead' || th.decor === 'cactus') return
  const out = shade(trunkDark, -0.4)
  px(g, x + 5, y + 6, out, 6, 9)
  px(g, x + 6, y + 6, trunk, 4, 8)
  px(g, x + 6, y + 6, mix(trunk, '#ffffff', 0.2), 1, 8)
  px(g, x + 9, y + 6, trunkDark, 1, 8)
  px(g, x + 4, y + 14, out, 2, 1)
  px(g, x + 10, y + 14, out, 2, 1)
}

/** Dirt path with grassy, slightly ragged edges and a few pebbles. */
function paintPath(g: CanvasRenderingContext2D, x: number, y: number, w: World, tx: number, ty: number, th: WorldTheme) {
  const [base, speck] = th.path
  const t = tone(tx, ty)
  px(g, x, y, mix(base, t > 0 ? '#ffffff' : speck, Math.abs(t) * 0.12), TILE, TILE)
  for (let i = 0; i < 4; i++) {
    const sx = x + 1 + Math.floor(hash(tx, ty, 60 + i) * 13), sy = y + 1 + Math.floor(hash(tx, ty, 70 + i) * 13)
    px(g, sx, sy, speck, i % 2 ? 2 : 1, 1)
  }
  if (hash(tx, ty, 80) < 0.25) {
    const sx = x + 3 + Math.floor(hash(tx, ty, 81) * 9), sy = y + 3 + Math.floor(hash(tx, ty, 82) * 9)
    px(g, sx, sy + 1, shade(speck, -0.25), 3, 1)
    px(g, sx, sy, mix(base, '#ffffff', 0.45), 2, 1)
  }
  const isPath = (a: number, b: number) => { const k = w.at(a, b); return k === T.PATH || k === T.BRIDGE || k === T.HOUSE }
  const [gb, gd] = th.grass
  const lip = shade(base, -0.18)
  // Grass creeps over the edge: 1-2 px, ragged
  const edge = (horizontal: boolean, at: number, inward: number) => {
    for (let i = 0; i < TILE; i++) {
      const deep = hash(tx * 3 + (horizontal ? i : at), ty * 3 + (horizontal ? at : i), 90) < 0.35 ? 2 : 1
      for (let d = 0; d < deep + 1; d++) {
        const c = d < deep ? (d === deep - 1 && hash(i, d, tx + ty) < 0.4 ? gd : gb) : lip
        const xx = horizontal ? x + i : x + at + inward * d, yy = horizontal ? y + at + inward * d : y + i
        px(g, xx, yy, c)
      }
    }
  }
  if (!isPath(tx, ty - 1)) edge(true, 0, 1)
  if (!isPath(tx, ty + 1)) edge(true, TILE - 1, -1)
  if (!isPath(tx - 1, ty)) edge(false, 0, 1)
  if (!isPath(tx + 1, ty)) edge(false, TILE - 1, -1)
}

/** Sand with soft wind ripples; grass creeps over its edges. */
function paintSand(g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, th: WorldTheme, w?: World) {
  const [base, speck] = th.sand
  const t = tone(tx, ty)
  px(g, x, y, mix(base, t > 0 ? '#ffffff' : speck, Math.abs(t) * 0.15), TILE, TILE)
  const lt = mix(base, '#ffffff', 0.18), rip = mix(base, speck, 0.65)
  for (let r = 0; r < 3; r++) {
    if (hash(tx, ty, 160 + r) < 0.55) continue
    const ry = y + 2 + r * 5 + Math.floor(hash(tx, ty, 100 + r) * 2)
    const x0 = Math.floor(hash(tx, ty, 110 + r) * 6), len = 5 + Math.floor(hash(tx, ty, 120 + r) * 6)
    for (let i = 0; i < len && x0 + i < TILE; i++) {
      const dy = Math.round(Math.sin((i / len) * Math.PI) * -1)
      px(g, x + x0 + i, ry + dy, rip)
      px(g, x + x0 + i, ry + dy - 1, lt)
    }
  }
  if (!w) return
  const grassy = (a: number, b: number) => { const k = w.at(a, b); return k === T.GRASS || k === T.TALL || k === T.FLOWER || k === T.TREE }
  const [gb, gd] = th.grass
  const lip = shade(base, -0.12)
  const edge = (horizontal: boolean, at: number, inward: number) => {
    for (let i = 0; i < TILE; i++) {
      const deep = 1 + Math.floor(hash(tx * 5 + (horizontal ? i : at), ty * 5 + (horizontal ? at : i), 150) * 3)
      for (let d = 0; d <= deep; d++) {
        const c = d < deep ? (d === deep - 1 && hash(i, d, tx * 7 + ty) < 0.45 ? gd : gb) : lip
        px(g, horizontal ? x + i : x + at + inward * d, horizontal ? y + at + inward * d : y + i, c)
      }
    }
  }
  if (grassy(tx, ty - 1)) edge(true, 0, 1)
  if (grassy(tx, ty + 1)) edge(true, TILE - 1, -1)
  if (grassy(tx - 1, ty)) edge(false, 0, 1)
  if (grassy(tx + 1, ty)) edge(false, TILE - 1, -1)
}

/** Water: shallow near the shore, deeper in the middle (per pixel, in bands), foam on the shore and a dark lip under banks. */
function paintWater(g: CanvasRenderingContext2D, x: number, y: number, w: World, tx: number, ty: number, th: WorldTheme) {
  const [base, , foam, deep] = th.water
  const land = (a: number, b: number) => { const k = w.at(a, b); return k !== T.WATER && k !== T.BRIDGE }
  const R = 2
  const near: [number, number][] = []
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (land(tx + dx, ty + dy)) near.push([(tx + dx) * TILE, (ty + dy) * TILE])
  const bands = [mix(base, foam, 0.24), mix(base, foam, 0.11), base, mix(base, deep, 0.3)]
  const cuts = [4, 11, 24]
  for (let yy = 0; yy < TILE; yy++)
    for (let xx = 0; xx < TILE; xx++) {
      const pxl = x + xx + 0.5, pyl = y + yy + 0.5
      let d = 99
      for (const [lx, ly] of near) {
        const ddx = Math.max(lx - pxl, 0, pxl - (lx + TILE)), ddy = Math.max(ly - pyl, 0, pyl - (ly + TILE))
        d = Math.min(d, Math.hypot(ddx, ddy))
      }
      // A checker dither where two bands meet keeps the steps soft
      let band = cuts.findIndex((c) => d < c)
      if (band < 0) band = 3
      if (band < 3 && d > cuts[band] - 1.2 && (xx + yy) % 2 === 0) band++
      px(g, x + xx, y + yy, bands[band])
    }
  const fm = mix(foam, '#ffffff', 0.3), soft = mix(foam, bands[0], 0.5)
  const up = land(tx, ty - 1), dn = land(tx, ty + 1), lf = land(tx - 1, ty), rt = land(tx + 1, ty)
  if (up) { px(g, x, y, shade(th.grass[0], -0.35), TILE, 1); px(g, x, y + 1, fm, TILE, 1); px(g, x, y + 2, soft, TILE, 1) }
  if (lf) { px(g, x, y, fm, 1, TILE); px(g, x + 1, y, soft, 1, TILE) }
  if (rt) { px(g, x + 15, y, fm, 1, TILE); px(g, x + 14, y, soft, 1, TILE) }
  if (dn) { px(g, x, y + 14, mix(bands[0], deep, 0.6), TILE, 1); px(g, x, y + 15, shade(deep, -0.2), TILE, 1) }
  // Inner corners: a little foam where only the diagonal is land
  if (!up && !lf && land(tx - 1, ty - 1)) { px(g, x, y, fm, 2, 1); px(g, x, y + 1, fm, 1, 1) }
  if (!up && !rt && land(tx + 1, ty - 1)) { px(g, x + 14, y, fm, 2, 1); px(g, x + 15, y + 1, fm, 1, 1) }
}

/** Lava lake: a dark crust along the shore, hotter toward the middle, with cooling plates. */
function paintLava(g: CanvasRenderingContext2D, x: number, y: number, w: World, tx: number, ty: number, th: WorldTheme) {
  const [base, wave, foam, deep] = th.water
  const land = (a: number, b: number) => { const k = w.at(a, b); return k !== T.WATER && k !== T.BRIDGE }
  const near: [number, number][] = []
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (land(tx + dx, ty + dy)) near.push([(tx + dx) * TILE, (ty + dy) * TILE])
  const crust = '#2a1a16'
  const bands = [crust, shade(deep, -0.15), deep, base, mix(base, wave, 0.55), wave]
  const cuts = [1.5, 3, 6, 12, 22]
  for (let yy = 0; yy < TILE; yy++)
    for (let xx = 0; xx < TILE; xx++) {
      const pxl = x + xx + 0.5, pyl = y + yy + 0.5
      let d = 99
      for (const [lx, ly] of near) {
        const ddx = Math.max(lx - pxl, 0, pxl - (lx + TILE)), ddy = Math.max(ly - pyl, 0, pyl - (ly + TILE))
        d = Math.min(d, Math.hypot(ddx, ddy))
      }
      let band = cuts.findIndex((c) => d < c)
      if (band < 0) band = 5
      if (band > 0 && band < 5 && d > cuts[band] - 1 && (xx + yy) % 2 === 0) band++
      // Cooling crust plates drifting on the hot middle
      const gx = x + xx, gy = y + yy
      const plate = Math.sin(gx * 0.09 + Math.sin(gy * 0.05) * 3) + Math.sin(gy * 0.11 + Math.sin(gx * 0.07) * 2) + Math.sin((gx + gy) * 0.047)
      let col = bands[band]
      if (band >= 3 && plate > 2.0) col = plate > 2.3 ? shade(deep, -0.35) : deep
      else if (band >= 4 && plate < -2.15) col = foam
      px(g, gx, gy, col)
    }
}

/** A round boulder lit from the top left, with an outline and a crack. */
function paintRock(g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, th: WorldTheme) {
  const [outline, base, hi] = th.rock
  const cx = 8, cy = 9, rx = 6.5, ry = 5.5
  px(g, x + 2, y + 13, 'rgba(0,0,0,0.22)', 13, 2)
  for (let yy = 0; yy < TILE; yy++)
    for (let xx = 0; xx < TILE; xx++) {
      const nx = (xx + 0.5 - cx) / rx, ny = (yy + 0.5 - cy) / ry
      const d = nx * nx + ny * ny
      if (d > 1.25) continue
      if (d > 1) { px(g, x + xx, y + yy, outline); continue }
      const l = -(nx * 0.6 + ny * 0.8)
      px(g, x + xx, y + yy, l > 0.45 ? hi : l > -0.15 ? base : mix(base, outline, 0.45))
    }
  const s = hash(tx, ty, 140) < 0.5 ? 1 : -1
  px(g, x + 8, y + 7, mix(base, outline, 0.6))
  px(g, x + 8 + s, y + 8, mix(base, outline, 0.6))
  px(g, x + 8 + s, y + 9, mix(base, outline, 0.6))
}

/** BW-style house: shingled roof with a chimney (overlay), sided walls, framed windows, door and step. */
function paintHouse(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, h: House) {
  const x = h.x * TILE, y = h.y * TILE, W = h.w * TILE, H = h.h * TILE
  const ink = '#2a2430'
  // Shadow on the ground (light comes from the top left)
  g.fillStyle = 'rgba(0,0,0,0.2)'
  g.fillRect(x + 6, y + H - 3, W, 5)
  g.fillRect(x + W - 2, y + 30, 6, H - 30)
  // Walls
  const wall = h.center ? '#f8f8f6' : '#f2e8d6', wallDark = h.center ? '#d8dce4' : '#ddd0b8'
  px(g, x + 2, y + 28, ink, W - 4, H - 28)
  px(g, x + 3, y + 28, wall, W - 6, H - 31)
  for (let i = x + 7; i < x + W - 4; i += 6) px(g, i, y + 34, wallDark, 1, H - 40)
  px(g, x + 3, y + 28, 'rgba(0,0,0,0.28)', W - 6, 4) // shade under the eaves
  // Stone foundation
  const stone = '#a8a090'
  px(g, x + 3, y + H - 7, stone, W - 6, 4)
  px(g, x + 3, y + H - 7, '#c8c0b0', W - 6, 1)
  for (let i = x + 6; i < x + W - 4; i += 7) px(g, i, y + H - 6, '#888070', 1, 3)
  if (h.center) {
    // Red band and big sliding glass doors
    px(g, x + 3, y + 32, '#e04848', W - 6, 4)
    px(g, x + 3, y + 35, '#a82c30', W - 6, 1)
    px(g, x + 13, y + 40, ink, 22, H - 43)
    for (const dx of [14, 24]) {
      px(g, x + dx, y + 41, '#78b8f0', 10, H - 45)
      px(g, x + dx, y + 41, '#a8d8ff', 10, 3)
      px(g, x + dx + 2, y + 45, '#e8f6ff', 1, 6)
      px(g, x + dx + 3, y + 44, '#e8f6ff', 1, 3)
    }
    px(g, x + 24, y + 41, ink, 1, H - 45)
  } else {
    // Wooden door in a frame, with a knob and a step
    px(g, x + 18, y + 42, ink, 12, H - 45)
    px(g, x + 19, y + 43, '#a87040', 10, H - 47)
    px(g, x + 19, y + 43, '#c08850', 10, 1)
    px(g, x + 21, y + 46, '#8a5830', 6, 5)
    px(g, x + 21, y + 53, '#8a5830', 6, 5)
    px(g, x + 26, y + 51, '#f8d040', 2, 2)
  }
  px(g, x + 16, y + H - 3, '#c8c0b0', 16, 3)
  px(g, x + 16, y + H - 3, '#e0d8c8', 16, 1)
  // Window with a frame, cross bar, reflection, sill and flower box
  const wx = x + W - 24, wy = y + 40
  px(g, wx - 1, wy - 1, ink, 16, 13)
  px(g, wx, wy, '#5a90d0', 14, 11)
  px(g, wx, wy, '#9ad0f8', 14, 5)
  px(g, wx + 6, wy, '#f8f8f8', 2, 11)
  px(g, wx, wy + 5, '#f8f8f8', 14, 1)
  px(g, wx + 2, wy + 2, '#ffffff', 2, 1)
  px(g, wx + 1, wy + 3, '#ffffff', 1, 1)
  px(g, wx - 2, wy + 11, '#8a6040', 18, 3)
  for (let i = 0; i < 8; i++) px(g, wx - 1 + i * 2, wy + 10 - (i % 2), ['#f05868', '#f8d038', '#f890c0'][i % 3], 1, 1)
  if (h.center) px(g, wx - 2, wy + 11, '#d8dce4', 18, 2)

  // Roof on the overlay: shingle rows, ridge cap, eaves, verges
  const rx = x - 1, ry = y - 8, rw = W + 2, rh = 41
  const roof = h.roof
  o.fillStyle = ink
  o.fillRect(rx, ry, rw, rh)
  o.fillStyle = roof
  o.fillRect(rx + 1, ry + 1, rw - 2, rh - 2)
  const rowH = 5
  for (let r = 0, yy = ry + 5; yy < ry + rh - 4; r++, yy += rowH) {
    const k = (yy - ry) / rh
    o.fillStyle = mix(roof, '#000000', 0.05 + k * 0.12)
    o.fillRect(rx + 1, yy, rw - 2, rowH)
    o.fillStyle = mix(roof, '#ffffff', 0.16)
    o.fillRect(rx + 1, yy, rw - 2, 1)
    o.fillStyle = shade(roof, -0.3)
    o.fillRect(rx + 1, yy + rowH - 1, rw - 2, 1)
    o.fillStyle = shade(roof, -0.22)
    for (let sx = rx + 3 + (r % 2) * 4; sx < rx + rw - 2; sx += 8) o.fillRect(sx, yy + 1, 1, rowH - 2)
  }
  // Ridge cap
  o.fillStyle = shade(roof, 0.28)
  o.fillRect(rx + 1, ry + 1, rw - 2, 3)
  o.fillStyle = ink
  o.fillRect(rx + 1, ry + 4, rw - 2, 1)
  // Verges and eaves
  o.fillStyle = shade(roof, -0.35)
  o.fillRect(rx + 1, ry + 1, 2, rh - 2)
  o.fillRect(rx + rw - 3, ry + 1, 2, rh - 2)
  o.fillStyle = shade(roof, -0.45)
  o.fillRect(rx + 1, ry + rh - 4, rw - 2, 3)
  o.fillStyle = mix(roof, '#ffffff', 0.35)
  o.fillRect(rx + 1, ry + rh - 4, rw - 2, 1)
  if (h.center) {
    // Poké Ball emblem on a white band
    o.fillStyle = '#f8f8f8'
    o.fillRect(rx + rw / 2 - 11, ry + 12, 22, 16)
    o.fillStyle = ink
    o.fillRect(rx + rw / 2 - 11, ry + 12, 22, 1)
    o.fillRect(rx + rw / 2 - 11, ry + 27, 22, 1)
    const cx = rx + rw / 2, cy = ry + 20
    for (let yy = -7; yy <= 7; yy++)
      for (let xx = -7; xx <= 7; xx++) {
        const d = xx * xx + yy * yy
        if (d > 49) continue
        o.fillStyle = d > 36 || Math.abs(yy) < 1 ? ink : d < 5 ? (d < 2 ? '#f8f8f8' : ink) : yy < 0 ? '#e83838' : '#f8f8f8'
        o.fillRect(cx + xx, cy + yy, 1, 1)
      }
  } else {
    // Brick chimney
    const cx = rx + rw - 18, cy = ry - 6
    o.fillStyle = ink
    o.fillRect(cx - 1, cy - 1, 10, 16)
    o.fillStyle = '#b05a48'
    o.fillRect(cx, cy + 2, 8, 12)
    o.fillStyle = '#7a3a30'
    for (let r = 0; r < 4; r++) o.fillRect(cx, cy + 4 + r * 3, 8, 1)
    for (let r = 0; r < 4; r++) o.fillRect(cx + (r % 2 ? 2 : 5), cy + 2 + r * 3, 1, 2)
    o.fillStyle = '#6a5e60'
    o.fillRect(cx - 1, cy, 10, 3)
    o.fillStyle = '#8a8084'
    o.fillRect(cx - 1, cy, 10, 1)
  }
}
