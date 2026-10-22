import propsUrl from '../assets/dungeon/props.png'
import type { DungeonDef, Rect, Room } from '../data/dungeons'
import type { Rng } from './rng'
import { hash } from './tiles'
import { T, TILE, type World } from './world'

/**
 * Raid dungeon level art: how the rooms are laid out and what's in them, and
 * how it all looks. The layout adds shape (rounded corners, alcoves) and set
 * pieces per room, like the abandoned camp at the Gate of Ash, the warden's
 * dais, the forges with their crucibles and chimneys, the hounds' den and the
 * bastion's towers. Halls are old mine shafts with beams, rails and crystals.
 *
 * Most of it is baked into the world's ground and overlay canvases once; the
 * moving parts (lava, lavafalls, molten metal, smoke, crystals, runes, sparkle)
 * are drawn every frame, and many of them give off light.
 */

/** Floor materials (per tile; 0 = the plain cave floor outside the dungeon's rooms, like the crater). */
export const FM = { none: 0, cave: 1, flag: 2, obsidian: 3, grate: 4, dirt: 5, paving: 6, mine: 7, bridge: 8, carpet: 9, dais: 10, channel: 11 } as const

export type PropKind =
  | 'statue' | 'column' | 'skeleton' | 'bedroll' | 'campfire' | 'crate' | 'barrel' | 'rune' | 'treasure'
  | 'anvil' | 'crucible' | 'chimney' | 'rails' | 'cart' | 'coal' | 'trough' | 'bones' | 'nest' | 'skull' | 'cage'
  | 'tower' | 'barricade' | 'warbanner' | 'beam' | 'crystal' | 'lavafall' | 'steam' | 'rubble' | 'web'
  | 'pillar' | 'throne' | 'torchstand' | 'spire' | 'carcass' | 'tent' | 'ballista' | 'firebowl' | 'weapons' | 'wall' | 'arrows' | 'emblem'
  | 'banner' | 'chains' | 'rack' | 'claws' | 'sconce' | 'railing'

/** A placed thing: footprint in tiles (x, y top-left), variant. */
export interface Prop {
  kind: PropKind
  x: number
  y: number
  w: number
  h: number
  v: number
  /** Drawn from the painted sprite atlas (set when baked). */
  art?: boolean
}

/** Things that block: their tiles become T.PROP (walls of the prop, drawn by the prop itself). */
const BLOCKS = new Set<PropKind>(['statue', 'column', 'crate', 'barrel', 'anvil', 'crucible', 'chimney', 'trough', 'bones', 'skull', 'cage', 'tower', 'barricade', 'tent', 'ballista', 'firebowl', 'weapons', 'wall', 'throne', 'torchstand', 'spire'])
/** Moving parts, drawn every frame. */
export const ANIMATED = new Set<PropKind>(['campfire', 'rune', 'treasure', 'crucible', 'chimney', 'crystal', 'lavafall', 'steam', 'trough', 'firebowl', 'sconce', 'torchstand'])

interface Ctx {
  w: World
  rng: Rng
  def: DungeonDef
  nearHall: (x: number, y: number, pad: number) => boolean
}

const floorTile = (t: T) => t === T.GRASS || t === T.SAND || t === T.PATH

function put(c: Ctx, kind: PropKind, x: number, y: number, w = 1, h = 1, v = 0) {
  // Never block a way through: no blocking prop near where a hall comes in
  if (BLOCKS.has(kind)) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (c.nearHall(x + dx, y + dy, 2) || !floorTile(c.w.at(x + dx, y + dy))) return false
    // Nor right up against lava (it would cut the lava's soft edge square)
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) if (c.w.at(x + dx, y + dy) === T.LAVA) return false
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) c.w.set(x + dx, y + dy, T.PROP)
  } else if (!floorTile(c.w.at(x, y))) return false
  c.w.props.push({ kind, x, y, w, h, v })
  return true
}

function mat(c: Ctx, x: number, y: number, w: number, h: number, m: number) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const tx = x + dx, ty = y + dy
    if (tx < 0 || ty < 0 || tx >= 128 || ty >= 128) continue
    if (c.w.at(tx, ty) !== T.TREE) c.w.floorMat[ty * 128 + tx] = m
  }
}

function lava(c: Ctx, x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (floorTile(c.w.at(x + dx, y + dy))) c.w.set(x + dx, y + dy, T.LAVA)
}

/** A room: its floor, with rounded corners and a few alcoves for the set pieces to sit in. */
export function carveRoom(w: World, room: Room, def: DungeonDef, rng: Rng) {
  const c: Ctx = { w, rng, def, nearHall: hallTest(def) }
  const { x: rx, y: ry, w: rw, h: rh } = room.rect
  const corner = 3
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++) {
      // Rounded corners
      const cx = x < rx + corner ? rx + corner - x : x >= rx + rw - corner ? x - (rx + rw - corner - 1) : 0
      const cy = y < ry + corner ? ry + corner - y : y >= ry + rh - corner ? y - (ry + rh - corner - 1) : 0
      if (cx && cy && Math.hypot(cx, cy) > corner + 0.3) continue
      // A slightly ragged edge (never where a hall comes in)
      const edge = Math.min(x - rx, rx + rw - 1 - x, y - ry, ry + rh - 1 - y)
      if (edge === 0 && !c.nearHall(x, y, 3) && rng.next() < 0.3) continue
      w.set(x, y, T.GRASS)
    }
  // Alcoves: half-round niches in the side walls
  const alcove = (ax: number, ay: number, dx: number, dy: number) => {
    if (c.nearHall(ax, ay, 4)) return
    for (let r = 0; r <= 3; r++)
      for (let s = -2; s <= 2; s++) {
        if (Math.hypot(r, s * 0.9) > 2.6) continue
        const x = ax + dx * r + dy * s, y = ay + dy * r + dx * s
        if (w.at(x, y) === T.TREE && x > 1 && y > 1 && x < 126 && y < 126) w.set(x, y, T.GRASS)
      }
  }
  alcove(rx - 1, ry + Math.floor(rh * 0.35), -1, 0)
  alcove(rx + rw, ry + Math.floor(rh * 0.65), 1, 0)
  alcove(rx + Math.floor(rw * 0.3), ry - 1, 0, -1)
  alcove(rx + Math.floor(rw * 0.7), ry + rh, 0, 1)
}

export function hallTest(def: DungeonDef) {
  const near = (x: number, y: number, r: Rect, pad: number) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad
  return (x: number, y: number, pad: number) => def.halls.some((h) => near(x, y, h, pad))
}

/** A room's look and set pieces (after its floor is carved). Gameplay pieces (bridges, vents, pillars) stay where the fights expect them. */
export function furnishRoom(w: World, room: Room, def: DungeonDef, rng: Rng) {
  const c: Ctx = { w, rng, def, nearHall: hallTest(def) }
  const { x: rx, y: ry, w: rw, h: rh } = room.rect
  const cx = rx + Math.floor(rw / 2), cy = ry + Math.floor(rh / 2)
  const rock = (x: number, y: number, s = 1) => {
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (!c.nearHall(x + dx, y + dy, 3) && floorTile(w.at(x + dx, y + dy))) w.set(x + dx, y + dy, T.ROCK)
  }
  const base = room.deco === 'gate' ? FM.flag : room.deco === 'river' ? FM.cave : room.deco === 'hall' ? FM.obsidian : room.deco === 'forge' ? FM.flag : room.deco === 'den' ? FM.dirt : FM.paving
  mat(c, rx - 4, ry - 4, rw + 8, rh + 8, base)
  // Wall decorations on the north wall (drawn on its face, if there is one)
  const wallDeco = (kinds: PropKind[], every: number) => {
    let i = 0
    for (let x = rx + 2; x < rx + rw - 2; x += every) {
      if (c.nearHall(x, ry, 3) || w.at(x, ry - 1) !== T.TREE || w.at(x, ry) === T.TREE) continue
      c.w.props.push({ kind: kinds[i++ % kinds.length], x, y: ry - 1, w: 1, h: 1, v: i })
    }
  }
  switch (room.deco) {
    case 'gate': {
      // The way in: a red runner from the stairs up to the far gate, two guardian statues by it
      mat(c, cx - 2, ry, 5, rh, FM.carpet)
      put(c, 'statue', cx - 8, ry + 1, 2, 2, 0)
      put(c, 'statue', cx + 6, ry + 1, 2, 2, 1)
      for (const [dx, dy, v] of [[-7, -4, 2], [6, -4, 3], [-7, 3, 1], [6, 3, 0]]) put(c, 'column', cx + dx, cy + dy, 1, 1, v)
      lava(c, rx + 2, ry + rh - 5, 3, 3)
      lava(c, rx + rw - 5, ry + rh - 5, 3, 3)
      // Those who came before: an abandoned camp and what's left of them
      put(c, 'campfire', rx + 4, cy, 1, 1)
      put(c, 'bedroll', rx + 2, cy - 1, 2, 1)
      put(c, 'crate', rx + 2, cy + 1, 1, 1)
      put(c, 'barrel', rx + 3, cy + 2, 1, 1)
      put(c, 'skeleton', cx + 4, ry + 5, 1, 1, 0)
      put(c, 'skeleton', cx - 5, ry + rh - 4, 1, 1, 1)
      put(c, 'rubble', cx + 9, cy - 1, 1, 1)
      put(c, 'rubble', cx - 10, cy + 5, 1, 1, 1)
      put(c, 'rune', cx, cy - 2, 1, 1, 2)
      put(c, 'torchstand', cx - 4, ry + 2, 1, 1)
      put(c, 'torchstand', cx + 4, ry + 2, 1, 1)
      wallDeco(['sconce', 'banner', 'chains', 'banner'], 3)
      break
    }
    case 'river': {
      // A lava river across the hall with two stone bridges, fed by two lavafalls from the north wall
      const bridges: [number, number][] = [[rx + 4, rx + 7], [rx + rw - 7, rx + rw - 4]]
      for (let x = rx; x < rx + rw; x++) {
        const bridge = bridges.some(([a, b]) => x >= a && x < b)
        const wob = Math.round(Math.sin(x * 0.33 + 0.5) * 1.3 + Math.sin(x * 0.9) * 0.35)
        const wide = hash(x, 7, 905) > 0.6 ? 1 : 0
        for (let y = cy - 1 + wob; y <= cy + 1 + wob + wide; y++) {
          if (w.at(x, y) === T.TREE) continue
          if (bridge) {
            w.set(x, y, T.SAND)
            w.floorMat[y * 128 + x] = FM.bridge
          } else w.set(x, y, T.LAVA)
        }
      }
      for (const [a, b] of bridges) {
        put(c, 'railing', a, cy - 3, b - a, 8, 0)
      }
      for (const fx of [rx + 1, rx + rw - 3]) {
        lava(c, fx, ry, 2, cy - 1 - ry)
        c.w.props.push({ kind: 'lavafall', x: fx, y: ry - 2, w: 2, h: 2, v: 0 })
      }
      rock(cx - 1, cy - 6)
      rock(cx + 1, cy + 6)
      put(c, 'steam', cx - 5, cy - 3, 1, 1)
      put(c, 'steam', cx + 5, cy + 3, 1, 1)
      put(c, 'skeleton', cx + 3, cy + 7, 1, 1, 2)
      put(c, 'crystal', rx + 1, ry + rh - 3, 1, 1, 0)
      put(c, 'crystal', rx + rw - 2, ry + rh - 4, 1, 1, 1)
      put(c, 'rubble', cx - 8, cy + 6, 1, 1)
      put(c, 'spire', rx + 3, ry + 3, 2, 1)
      put(c, 'spire', rx + rw - 6, ry + rh - 3, 2, 1)
      put(c, 'carcass', cx - 11, cy + 5, 4, 2)
      wallDeco(['sconce', 'chains', 'claws'], 4)
      break
    }
    case 'hall': {
      // The warden's hall: polished obsidian, a runner to the dais, great columns down both sides
      mat(c, cx - 2, ry + 6, 5, rh - 6, FM.carpet)
      mat(c, cx - 5, ry + 3, 11, 7, FM.dais)
      put(c, 'rune', cx, ry + 6, 1, 1, 3)
      for (const x of [rx + 3, rx + 7, rx + rw - 9, rx + rw - 5])
        for (const y of [ry + 7, ry + rh - 9]) {
          rock(x, y, 2)
          if (w.at(x, y) === T.ROCK) w.props.push({ kind: 'pillar', x, y, w: 2, h: 2, v: x + y })
        }
      lava(c, rx + 2, ry + 4, 1, rh - 8)
      lava(c, rx + rw - 3, ry + 4, 1, rh - 8)
      put(c, 'statue', rx + 3, ry + 1, 2, 2, 2)
      put(c, 'statue', rx + rw - 5, ry + 1, 2, 2, 3)
      put(c, 'treasure', rx + 4, ry + rh - 3, 1, 1, 0)
      put(c, 'treasure', rx + rw - 5, ry + rh - 3, 1, 1, 1)
      put(c, 'skeleton', cx - 3, ry + 12, 1, 1, 3)
      put(c, 'throne', cx - 1, ry + 1, 3, 2)
      put(c, 'torchstand', cx - 7, ry + 4, 1, 1)
      put(c, 'torchstand', cx + 7, ry + 4, 1, 1)
      wallDeco(['sconce', 'banner', 'banner', 'sconce', 'chains'], 3)
      break
    }
    case 'forge': {
      // The forges: iron floor plates, anvils by the vents, a crucible pouring into a molten basin, chimneys
      mat(c, rx + 5, ry + 5, rw - 10, rh - 10, FM.grate)
      // Channels of molten metal under grates, from the basin out toward the vents
      for (const [dx, dy] of [[-8, -6], [7, -6], [-8, 6], [7, 6]]) {
        let x = cx, y = cy
        while (x !== cx + dx) { x += Math.sign(dx); if (floorTile(w.at(x, y))) w.floorMat[y * 128 + x] = FM.channel }
        while (y !== cy + dy) { y += Math.sign(dy); if (floorTile(w.at(x, y))) w.floorMat[y * 128 + x] = FM.channel }
      }
      lava(c, cx - 1, cy - 1, 3, 3)
      put(c, 'crucible', cx - 1, cy - 4, 2, 2)
      for (const [dx, dy] of [[-8, -6], [7, -6], [-8, 6], [7, 6]]) {
        const vx = cx + dx, vy = cy + dy
        lava(c, vx - 1, vy - 1, 2, 2)
        w.dvents.push({ x: vx, y: vy })
        put(c, 'anvil', vx + (dx < 0 ? 2 : -3), vy - 1, 1, 1)
        put(c, 'coal', vx + (dx < 0 ? 2 : -3), vy + 1, 1, 1)
      }
      put(c, 'chimney', rx + 2, ry + 1, 2, 2)
      put(c, 'chimney', rx + rw - 4, ry + 1, 2, 2)
      put(c, 'rails', rx + 3, ry + rh - 3, rw - 6, 1)
      put(c, 'cart', cx - 4, ry + rh - 3, 1, 1)
      put(c, 'trough', cx + 3, ry + rh - 5, 2, 1)
      put(c, 'barrel', rx + rw - 3, cy + 2, 1, 1)
      put(c, 'crate', rx + rw - 3, cy + 3, 1, 1)
      wallDeco(['sconce', 'rack', 'chains', 'rack'], 3)
      break
    }
    case 'den': {
      // The hounds' den: earth and straw, bone heaps round the lair, cages, a great skull
      for (let i = 0; i < 3; i++) {
        let a = rng.range(0, Math.PI * 2), d = 2.5
        while (d < 11) {
          const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d)
          if (w.at(x, y) === T.GRASS || w.at(x, y) === T.SAND) w.set(x, y, T.LAVA)
          d += 0.6
          a += rng.range(-0.12, 0.12)
        }
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2
        put(c, 'bones', Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 9), 1, 1, i)
      }
      put(c, 'nest', cx - 2, cy - 1, 4, 3)
      put(c, 'skull', cx - 1, ry + 1, 3, 2)
      put(c, 'cage', rx + 2, ry + 2, 2, 2, 0)
      put(c, 'cage', rx + rw - 4, ry + 2, 2, 2, 1)
      put(c, 'cage', rx + rw - 4, ry + rh - 4, 2, 2, 2)
      put(c, 'carcass', rx + 3, ry + rh - 6, 4, 2)
      put(c, 'spire', rx + rw - 5, cy - 2, 2, 1)
      put(c, 'spire', rx + 2, cy + 3, 2, 1)
      for (let i = 0; i < 6; i++) put(c, 'skeleton', rx + 3 + Math.floor(rng.next() * (rw - 6)), ry + 3 + Math.floor(rng.next() * (rh - 6)), 1, 1, i)
      wallDeco(['sconce', 'claws', 'claws', 'chains'], 3)
      break
    }
    case 'bastion': {
      // The last bastion: the defenders' camp before the crater. A road from the north gate to the
      // crater gate, the order's crest where the roads meet, gate towers, tents along the walls,
      // ballistas aimed at the crater, fire bowls lining the road, weapon racks and supplies.
      const touch = (h: Rect) => h.x <= rx + rw && h.x + h.w >= rx && h.y <= ry + rh && h.y + h.h >= ry
      const mouths = def.halls.filter(touch)
      const vert = mouths.find((h) => h.h > h.w), hor = mouths.find((h) => h.w > h.h)
      if (vert && hor) {
        mat(c, vert.x, ry, vert.w, hor.y + hor.h - ry, FM.flag)
        mat(c, rx, hor.y, vert.x + vert.w - rx, hor.h, FM.flag)
        const jx = vert.x + Math.floor(vert.w / 2), jy = hor.y + Math.floor(hor.h / 2)
        put(c, 'emblem', jx - 3, jy - 3, 7, 7)
        // Gate towers by both ways in
        put(c, 'tower', rx + 3, hor.y - 3, 2, 2)
        put(c, 'tower', rx + 3, hor.y + hor.h + 1, 2, 2)
        put(c, 'tower', vert.x - 4, ry + 2, 2, 2)
        put(c, 'tower', vert.x + vert.w + 2, ry + 2, 2, 2)
        // War banners flanking both mouths
        put(c, 'warbanner', vert.x - 1, ry + 1, 1, 1)
        put(c, 'warbanner', vert.x + vert.w, ry + 1, 1, 1)
        put(c, 'warbanner', rx + 1, hor.y - 1, 1, 1)
        put(c, 'warbanner', rx + 1, hor.y + hor.h, 1, 1)
        // Fire bowls along the roads
        for (const [x, y] of [[vert.x - 2, ry + 4], [vert.x + vert.w + 1, ry + 4], [rx + 6, hor.y - 2], [rx + 6, hor.y + hor.h + 1], [vert.x - 2, hor.y + hor.h + 2], [vert.x + vert.w + 1, hor.y + hor.h + 2]]) put(c, 'firebowl', x, y, 1, 1)
      }
      // Tents along the walls
      put(c, 'tent', rx + 2, ry + 1, 3, 2, 0)
      put(c, 'tent', rx + rw - 5, ry + 4, 3, 2, 1)
      put(c, 'tent', rx + rw - 5, ry + rh - 8, 3, 2, 2)
      // Ballistas aimed at the crater gate
      put(c, 'ballista', rx + 3, ry + rh - 9, 2, 2, 0)
      put(c, 'ballista', rx + 7, ry + rh - 5, 2, 2, 1)
      // Weapon racks and supplies
      for (const [x, y] of [[rx + rw - 2, cy - 3], [rx + rw - 2, cy], [rx + rw - 2, cy + 3], [rx + 7, ry + 2]]) put(c, 'weapons', x, y, 1, 1)
      for (const [x, y, k] of [[rx + rw - 8, ry + rh - 3, 0], [rx + rw - 7, ry + rh - 3, 1], [rx + rw - 8, ry + rh - 4, 0], [rx + rw - 6, ry + rh - 3, 0], [rx + 2, ry + 4, 1], [rx + 3, ry + 4, 0]] as const) put(c, k ? 'barrel' : 'crate', x, y, 1, 1)
      // Cover in the yard: broken parapets and stakes
      put(c, 'wall', cx + 5, cy + 4, 4, 1, 0)
      put(c, 'wall', cx - 6, cy + 7, 3, 1, 1)
      put(c, 'barricade', cx + 6, cy - 2, 3, 1)
      put(c, 'barricade', cx - 4, cy + 10, 3, 1)
      // A lava gutter along the south wall
      lava(c, rx + 11, ry + rh - 2, rw - 20, 1)
      // The battle that already went on here
      for (let i = 0; i < 12; i++) put(c, 'arrows', rx + 3 + Math.floor(rng.next() * (rw - 6)), ry + 3 + Math.floor(rng.next() * (rh - 6)), 1, 1, i)
      put(c, 'skeleton', cx + 2, cy + 8, 1, 1, 4)
      put(c, 'skeleton', cx - 7, cy - 4, 1, 1, 5)
      put(c, 'rubble', cx + 9, cy + 9, 1, 1)
      wallDeco(['sconce', 'banner', 'chains', 'banner'], 3)
      break
    }
  }
}

/** A hall between rooms: an old mine shaft with beams, rails down the middle and crystals in the rock. */
export function furnishHall(w: World, hall: Rect, def: DungeonDef, index: number) {
  const c: Ctx = { w, rng: null!, def, nearHall: () => false }
  mat(c, hall.x, hall.y, hall.w, hall.h, FM.mine)
  const long = hall.w > hall.h
  const len = long ? hall.w : hall.h
  for (let k = 2; k < len - 1; k += 4) w.props.push({ kind: 'beam', x: long ? hall.x + k : hall.x, y: long ? hall.y : hall.y + k, w: long ? 1 : hall.w, h: long ? hall.h : 1, v: long ? 1 : 0 })
  w.props.push({ kind: 'rails', x: long ? hall.x : hall.x + 2, y: long ? hall.y + 2 : hall.y, w: long ? hall.w : 1, h: long ? 1 : hall.h, v: long ? 0 : 1 })
  for (let k = 3; k < len - 2; k += 6) {
    const side = (k + index) % 2
    const x = long ? hall.x + k : side ? hall.x + hall.w - 1 : hall.x
    const y = long ? (side ? hall.y + hall.h - 1 : hall.y) : hall.y + k
    w.props.push({ kind: 'crystal', x, y, w: 1, h: 1, v: (k + index) % 3 })
  }
  w.props.push({ kind: 'web', x: hall.x, y: hall.y, w: 1, h: 1, v: index })
}

// ---------------------------------------------------------------- baked art

const P = {
  void: '#0c0809', top: '#1e1517', top2: '#251b1d', rim: '#5a4544',
  face: ['#3a2c2e', '#33272a', '#2c2124'], faceHi: '#574446', mortar: '#1a1214', vein: '#ff7a2a',
}

/** A dungeon tile on the baked canvases. Returns false when the regular drawing should do it. */
export function bakeTile(g: CanvasRenderingContext2D, w: World, tx: number, ty: number, t: T) {
  const x = tx * TILE, y = ty * TILE
  if (t === T.TREE) {
    wallTile(g, w, tx, ty, x, y)
    return true
  }
  const m = w.floorMat[ty * 128 + tx]
  if (!m) return false
  if (t === T.LAVA) {
    // Under the moving lava: a dark crust (the lava layer flows over it)
    g.fillStyle = '#2a120c'
    g.fillRect(x, y, TILE, TILE)
    return true
  }
  floorTile16(g, m, tx, ty, x, y)
  return true
}

/** Walls: a basalt face where the floor is in front of it (two tiles high), dark rock tops elsewhere. */
function wallTile(g: CanvasRenderingContext2D, w: World, tx: number, ty: number, x: number, y: number) {
  const open = (a: number, b: number) => w.at(a, b) !== T.TREE
  const below = open(tx, ty + 1), below2 = !below && open(tx, ty + 2)
  const h = hash(tx, ty, 301)
  if (below || below2) {
    // Bricks in rows of 8, offset every other row
    const rows = below ? [0, 8] : [0, 8]
    for (const ry of rows) {
      const off = ((ty * 2 + ry / 8) % 2) * 6
      g.fillStyle = P.mortar
      g.fillRect(x, y + ry, TILE, 8)
      for (let bx = -off; bx < TILE; bx += 12) {
        const v = hash(tx * 4 + bx, ty * 2 + ry, 302)
        g.fillStyle = P.face[Math.floor(v * 3)]
        g.fillRect(x + Math.max(0, bx) + 1, y + ry + 1, Math.min(11, TILE - Math.max(0, bx) - 1), 6)
        g.fillStyle = 'rgba(255,255,255,0.05)'
        g.fillRect(x + Math.max(0, bx) + 1, y + ry + 1, Math.min(11, TILE - Math.max(0, bx) - 1), 1)
      }
    }
    if (below2) {
      // The top of the wall: a rim catching the light
      g.fillStyle = P.top
      g.fillRect(x, y, TILE, 3)
      g.fillStyle = P.rim
      g.fillRect(x, y + 3, TILE, 1)
    } else {
      // The foot of the wall: shadow, and the floor's edge
      g.fillStyle = 'rgba(0,0,0,0.45)'
      g.fillRect(x, y + 13, TILE, 3)
    }
    // A glowing crack of lava in some bricks
    if (h < 0.12) {
      g.fillStyle = P.vein
      let px = x + 3 + Math.floor(h * 60) % 9, py = y + (below2 ? 5 : 2)
      for (let i = 0; i < 6; i++) {
        g.fillRect(px, py, 1, 2)
        px += Math.floor(hash(tx, ty, 310 + i) * 3) - 1
        py += 2
      }
    }
    // Side ends: darker where the face turns a corner
    if (!open(tx - 1, ty + (below ? 1 : 2)) || w.at(tx - 1, ty) !== T.TREE) {
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(x, y, 2, TILE)
    }
    if (!open(tx + 1, ty + (below ? 1 : 2)) || w.at(tx + 1, ty) !== T.TREE) {
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(x + TILE - 2, y, 2, TILE)
    }
    return
  }
  // Top of the rock: near the open floor a lit rim, further in the dark
  const nearOpen = open(tx - 1, ty) || open(tx + 1, ty) || open(tx, ty - 1) || open(tx - 1, ty + 1) || open(tx + 1, ty + 1) || open(tx - 1, ty + 2) || open(tx + 1, ty + 2)
  g.fillStyle = nearOpen ? P.top2 : P.void
  g.fillRect(x, y, TILE, TILE)
  const n = nearOpen ? 5 : 2
  for (let i = 0; i < n; i++) {
    const v = hash(tx, ty, 320 + i)
    g.fillStyle = nearOpen ? (v > 0.5 ? '#2c2124' : '#171012') : '#140d0f'
    g.fillRect(x + Math.floor(v * 13), y + Math.floor(hash(tx, ty, 330 + i) * 13), 2 + Math.floor(v * 3), 2)
  }
  if (nearOpen) {
    g.fillStyle = P.rim
    if (open(tx, ty - 1)) g.fillRect(x, y, TILE, 1)
    if (open(tx - 1, ty)) g.fillRect(x, y, 1, TILE)
    if (open(tx + 1, ty)) g.fillRect(x + TILE - 1, y, 1, TILE)
  }
}

/** Floors by material. */
function floorTile16(g: CanvasRenderingContext2D, m: number, tx: number, ty: number, x: number, y: number) {
  const h = hash(tx, ty, 401), h2 = hash(tx, ty, 402)
  const speck = (cols: string[], n: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[i % cols.length]
      g.fillRect(x + Math.floor(hash(tx, ty, 410 + i) * 15), y + Math.floor(hash(tx, ty, 420 + i) * 15), 1 + Math.floor(hash(tx, ty, 430 + i) * 2), 1)
    }
  }
  switch (m) {
    case FM.cave: {
      g.fillStyle = h > 0.5 ? '#3c2e2b' : '#382a28'
      g.fillRect(x, y, TILE, TILE)
      speck(['#2c201e', '#4a3a36', '#2c201e'], 6)
      if (h2 < 0.15) {
        g.fillStyle = '#251a18'
        g.fillRect(x + 3, y + 8, 7, 1)
        g.fillRect(x + 9, y + 9, 3, 1)
      }
      break
    }
    case FM.flag:
    case FM.paving:
      // Mortar underneath: the stones are laid over it in bakeStones
      g.fillStyle = m === FM.paving ? '#382b26' : '#2a201e'
      g.fillRect(x, y, TILE, TILE)
      break
    case FM.obsidian: {
      // Polished black glass in big tiles with thin glowing seams and a sheen
      g.fillStyle = (tx + ty) % 2 ? '#1d1619' : '#221a1e'
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = 'rgba(160,120,200,0.08)'
      for (let i = 0; i < 3; i++) g.fillRect(x + ((tx * 5 + ty * 3 + i * 4) % 14), y + i * 5 + 1, 3, 1)
      g.fillStyle = 'rgba(255,100,40,0.28)'
      if (tx % 2 === 0) g.fillRect(x, y, 1, TILE)
      if (ty % 2 === 0) g.fillRect(x, y, TILE, 1)
      break
    }
    case FM.grate: {
      // Iron floor plates (2×2 tiles), riveted at the corners
      g.fillStyle = '#2a2624'
      g.fillRect(x, y, TILE, TILE)
      const v = hash(tx >> 1, ty >> 1, 450)
      g.fillStyle = v > 0.5 ? '#3c3836' : '#383432'
      g.fillRect(x + (tx % 2 ? 0 : 1), y + (ty % 2 ? 0 : 1), TILE - 1, TILE - 1)
      g.fillStyle = 'rgba(255,255,255,0.05)'
      if (ty % 2 === 0) g.fillRect(x, y + 1, TILE, 1)
      g.fillStyle = '#5a5452'
      if (tx % 2 === 0 && ty % 2 === 0) g.fillRect(x + 3, y + 3, 1, 1)
      if (tx % 2 === 1 && ty % 2 === 0) g.fillRect(x + 12, y + 3, 1, 1)
      if (tx % 2 === 0 && ty % 2 === 1) g.fillRect(x + 3, y + 12, 1, 1)
      if (tx % 2 === 1 && ty % 2 === 1) g.fillRect(x + 12, y + 12, 1, 1)
      speck(['#2e2a28', '#4a4442'], 3)
      break
    }
    case FM.channel: {
      // A grate over a channel of molten metal running to the basin
      g.fillStyle = '#7a2a0a'
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = '#ff8a2a'
      g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
      g.fillStyle = '#ffc860'
      g.fillRect(x + 4, y + 5 + (tx % 3), TILE - 8, 3)
      g.fillStyle = '#211c1a'
      for (let i = 1; i < TILE; i += 3) g.fillRect(x + i, y, 1, TILE)
      g.fillRect(x, y, TILE, 1)
      g.fillRect(x, y + TILE - 1, TILE, 1)
      break
    }
    case FM.dirt: {
      g.fillStyle = h > 0.5 ? '#3e2e24' : '#3a2a21'
      g.fillRect(x, y, TILE, TILE)
      speck(['#2a1e17', '#4e3a2c', '#5a4a30'], 7)
      if (h2 < 0.25) {
        // Straw
        g.fillStyle = '#a08840'
        g.fillRect(x + 3, y + 6, 4, 1)
        g.fillRect(x + 8, y + 10, 3, 1)
        g.fillStyle = '#7a6430'
        g.fillRect(x + 5, y + 7, 3, 1)
      }
      break
    }
    case FM.mine: {
      g.fillStyle = h > 0.5 ? '#332724' : '#2f2421'
      g.fillRect(x, y, TILE, TILE)
      speck(['#251b19', '#43352f'], 5)
      break
    }
    case FM.bridge: {
      // Stone bridge: slabs across, worn in the middle
      g.fillStyle = '#5a4a44'
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = '#4a3c37'
      for (let i = 0; i < TILE; i += 4) g.fillRect(x, y + i, TILE, 1)
      g.fillStyle = 'rgba(255,230,200,0.08)'
      g.fillRect(x + 4, y, 8, TILE)
      break
    }
    case FM.carpet: {
      // A worn red runner with gold edges and a repeating motif
      floorTile16(g, FM.flag, tx, ty, x, y)
      g.fillStyle = '#6a1a1c'
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = '#7e2224'
      g.fillRect(x, y + 2, TILE, TILE - 4)
      if (ty % 3 === 0) {
        g.fillStyle = '#c89a3a'
        g.fillRect(x + 6, y + 6, 4, 4)
        g.fillStyle = '#6a1a1c'
        g.fillRect(x + 7, y + 7, 2, 2)
      }
      g.fillStyle = 'rgba(0,0,0,0.18)'
      if (h < 0.3) g.fillRect(x + Math.floor(h2 * 10), y + 3, 4, 2)
      break
    }
    case FM.dais: {
      // The raised dais: lighter stone in big slabs, a step down at its edge
      g.fillStyle = (tx + ty) % 2 ? '#5a4844' : '#54433f'
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = '#3a2c28'
      if (tx % 2 === 0) g.fillRect(x, y, 1, TILE)
      if (ty % 2 === 0) g.fillRect(x, y, TILE, 1)
      g.fillStyle = 'rgba(255,220,180,0.07)'
      g.fillRect(x + 1, y + 1, TILE - 2, 2)
      break
    }
  }
  // Where a floor meets a different floor or a wall below it: a soft shadow line
  void h2
}

/** The dais's step and the carpet's border need the neighbours: drawn after all tiles. */
export function bakeEdges(g: CanvasRenderingContext2D, w: World) {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= 128 || y >= 128 ? 0 : w.floorMat[y * 128 + x])
  for (let ty = 1; ty < 127; ty++)
    for (let tx = 1; tx < 127; tx++) {
      const m = at(tx, ty)
      const x = tx * TILE, y = ty * TILE
      if (m === FM.dais && at(tx, ty + 1) !== FM.dais && w.at(tx, ty + 1) !== T.TREE) {
        // Step down: a front face
        g.fillStyle = '#3a2c28'
        g.fillRect(x, y + 11, TILE, 5)
        g.fillStyle = '#4a3a35'
        g.fillRect(x, y + 11, TILE, 1)
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.fillRect(x, y + 15, TILE, 1)
      }
      if (m === FM.flag && w.at(tx, ty) !== T.TREE) {
        // A curb where the road meets the paving
        g.fillStyle = '#6e5a4e'
        if (at(tx - 1, ty) === FM.paving) g.fillRect(x, y, 2, TILE)
        if (at(tx + 1, ty) === FM.paving) g.fillRect(x + TILE - 2, y, 2, TILE)
        if (at(tx, ty - 1) === FM.paving) g.fillRect(x, y, TILE, 2)
        if (at(tx, ty + 1) === FM.paving) g.fillRect(x, y + TILE - 2, TILE, 2)
      }
      if (m === FM.carpet) {
        g.fillStyle = '#c89a3a'
        if (at(tx - 1, ty) !== FM.carpet) g.fillRect(x, y, 1, TILE)
        if (at(tx + 1, ty) !== FM.carpet) g.fillRect(x + TILE - 1, y, 1, TILE)
      }
      // Wall shadow on the floor right below a wall face
      if (m && w.at(tx, ty) !== T.TREE && w.at(tx, ty - 1) === T.TREE) {
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.fillRect(x, y, TILE, 4)
        g.fillStyle = 'rgba(0,0,0,0.15)'
        g.fillRect(x, y + 4, TILE, 3)
      }
    }
}

const px = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1) => {
  g.fillStyle = col
  g.fillRect(Math.round(x), Math.round(y), w, h)
}

/** All static props: their ground part on `g`, anything that stands up tall on `o` (drawn over the actors). */
export function bakeProps(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, w: World) {
  // Flat things first, standing things after (sorted top to bottom so they overlap right)
  const order = (p: Prop) => (p.kind === 'rails' || p.kind === 'rune' || p.kind === 'nest' || p.kind === 'railing' || p.kind === 'emblem' ? 0 : 1) * 1000 + p.y
  for (const p of [...w.props].sort((a, b) => order(a) - order(b))) bakeProp(g, o, w, p)
}

/**
 * Painted sprites for the props (pixel art generated for the dungeon and cut to
 * game size), all in one atlas: [x, y, w, h]. Until it's loaded the props are
 * drawn by hand below, so nothing ever waits on it.
 */
const ATLAS = {
  anvil: [21, 146, 18, 15], ballista: [153, 65, 51, 42], banner: [210, 110, 14, 22], barrel: [242, 110, 13, 17], bones: [57, 146, 20, 14],
  cage: [113, 0, 32, 54], carcass: [55, 110, 64, 35], cart: [183, 110, 26, 24], chest: [160, 110, 22, 26], crate: [225, 110, 16, 17],
  crucible: [114, 65, 38, 42], firebowl: [40, 146, 16, 14], fossil: [0, 110, 54, 35], furnace: [78, 0, 34, 58], gold: [0, 146, 20, 15],
  spire: [205, 65, 34, 41], statue: [41, 0, 36, 58], tent: [146, 0, 56, 44], tent1: [0, 65, 56, 44], tent2: [57, 65, 56, 44],
  throne: [0, 0, 40, 64], torchstand: [143, 110, 16, 26], weapons: [120, 110, 22, 26],
} as const satisfies Record<string, readonly [number, number, number, number]>
type Sprite = keyof typeof ATLAS
const atlas = typeof Image === 'undefined' ? null : new Image()
if (atlas) atlas.src = propsUrl
const atlasReady = () => !!atlas && atlas.complete && atlas.naturalWidth > 0
/** Flat on the ground: nothing of it stands over the actors. */
const FLAT = new Set<Sprite>(['gold', 'carcass', 'banner', 'bones'])

function spriteOf(p: Prop): Sprite | null {
  switch (p.kind) {
    case 'statue': return 'statue'
    case 'skull': return 'fossil'
    case 'cage': return 'cage'
    case 'crucible': return 'crucible'
    case 'tent': return (['tent', 'tent1', 'tent2'] as const)[p.v % 3]
    case 'ballista': return 'ballista'
    case 'treasure': return p.v % 2 ? 'chest' : 'gold'
    case 'weapons': return 'weapons'
    case 'cart': return 'cart'
    case 'firebowl': return 'firebowl'
    case 'anvil': return 'anvil'
    case 'crate': return 'crate'
    case 'barrel': return 'barrel'
    case 'bones': return 'bones'
    case 'chimney': return 'furnace'
    case 'throne': return 'throne'
    case 'torchstand': return 'torchstand'
    case 'spire': return 'spire'
    case 'carcass': return 'carcass'
    case 'banner': return 'banner'
  }
  return null
}

/** A sprite standing on the bottom of the prop's footprint, centred; what rises above the footprint goes on the overlay. */
function bakeSprite(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, p: Prop, name: Sprite) {
  const [sx, sy, sw, sh] = ATLAS[name]
  const x = p.x * TILE, y = p.y * TILE, W = p.w * TILE, H = p.h * TILE
  const dx = Math.round(x + W / 2 - sw / 2), dy = y + H - sh
  if (p.kind !== 'banner' && p.kind !== 'carcass') {
    g.fillStyle = 'rgba(0,0,0,0.32)'
    g.beginPath()
    g.ellipse(x + W / 2, y + H - 2, Math.min(sw / 2, W / 2 + 2), Math.max(3, Math.min(6, H / 4)), 0, 0, Math.PI * 2)
    g.fill()
  }
  const up = FLAT.has(name) ? 0 : Math.max(0, y - dy)
  if (up) o.drawImage(atlas!, sx, sy, sw, up, dx, dy, sw, up)
  g.drawImage(atlas!, sx, sy + up, sw, sh - up, dx, dy + up, sw, sh - up)
}

function bakeProp(g: CanvasRenderingContext2D, o: CanvasRenderingContext2D, w: World, p: Prop) {
  const x = p.x * TILE, y = p.y * TILE, W = p.w * TILE, H = p.h * TILE
  const faceTile0 = w.at(p.x, p.y) === T.TREE && w.at(p.x, p.y + 1) !== T.TREE
  const sprite = atlasReady() ? spriteOf(p) : null
  if (sprite && (p.kind !== 'banner' || faceTile0)) {
    p.art = true
    bakeSprite(g, o, p, sprite)
    return
  }
  const shadow = (cx: number, cy: number, rx: number, ry: number) => {
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.beginPath()
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    g.fill()
  }
  const faceTile = faceTile0
  switch (p.kind) {
    case 'statue': {
      // A guardian statue on a plinth: a horned dragon, wings folded, glowing eyes (the glow is animated)
      shadow(x + W / 2, y + H - 3, W / 2, 5)
      px(g, '#2a2022', x + 2, y + H - 12, W - 4, 11)
      px(g, '#4a3c3c', x + 3, y + H - 12, W - 6, 2)
      px(g, '#3a2e2e', x + 3, y + H - 10, W - 6, 8)
      const cx = x + W / 2, top = y + H - 12
      const stone = ['#5e5250', '#4c4240', '#3a3130', '#706462']
      // Body
      for (let i = 0; i < 18; i++) px(o, stone[1], cx - 7 + (i < 9 ? 0 : 1), top - 1 - i, 14 - (i > 12 ? (i - 12) * 2 : 0), 1)
      px(o, stone[0], cx - 6, top - 18, 4, 16)
      px(o, stone[2], cx + 3, top - 16, 4, 15)
      // Folded wings
      for (let i = 0; i < 12; i++) {
        px(o, stone[2], cx - 12 + i * 0.3, top - 22 + i, 4, 1)
        px(o, stone[2], cx + 8 - i * 0.3, top - 22 + i, 4, 1)
      }
      px(o, stone[3], cx - 12, top - 23, 3, 2)
      px(o, stone[3], cx + 9, top - 23, 3, 2)
      // Head and horns
      px(o, stone[0], cx - 4, top - 26, 8, 8)
      px(o, stone[1], cx - 3, top - 19, 6, 2)
      px(o, stone[3], cx - 6, top - 31, 2, 6)
      px(o, stone[3], cx + 4, top - 31, 2, 6)
      px(o, '#1a1414', cx - 3, top - 23, 2, 1)
      px(o, '#1a1414', cx + 1, top - 23, 2, 1)
      // Weathering
      for (let i = 0; i < 6; i++) px(o, stone[2], cx - 6 + hash(p.x, i, 501) * 12, top - 4 - hash(p.y, i, 502) * 22, 1, 1)
      break
    }
    case 'column': {
      if (p.v >= 2) {
        // A great intact column: plinth, fluted shaft, a capital catching the light
        shadow(x + 8, y + 15, 11, 4)
        px(g, '#2c2224', x - 1, y + 8, 18, 8)
        px(g, '#5a4c4a', x - 1, y + 8, 18, 1)
        px(o, '#4a3e3c', x, y + 3, 16, 6)
        px(o, '#625654', x, y + 3, 16, 1)
        px(o, '#4e4240', x + 2, y - 30, 12, 34)
        for (const fx of [4, 7, 10]) px(o, '#3e3432', x + fx, y - 28, 1, 30)
        px(o, '#6a5e5c', x + 3, y - 30, 2, 34)
        px(o, '#2e2626', x + 12, y - 30, 2, 34)
        px(o, '#5a4e4c', x - 1, y - 36, 18, 6)
        px(o, '#7a6e6a', x - 1, y - 36, 18, 1)
        px(o, '#3a3030', x - 1, y - 31, 18, 1)
        px(o, '#ff7a2a', x + 7, y - 20 + p.v * 3, 1, 5)
        break
      }
      // A broken column: a stump with a fluted shaft and its top lying beside it
      shadow(x + 8, y + 14, 8, 3)
      px(g, '#2c2224', x + 1, y + 9, 14, 6)
      px(g, '#5a4c4a', x + 2, y + 9, 12, 1)
      const hgt = p.v ? 18 : 12
      px(o, '#4e4240', x + 3, y + 9 - hgt, 10, hgt)
      px(o, '#625654', x + 4, y + 9 - hgt, 2, hgt)
      px(o, '#3a3030', x + 10, y + 9 - hgt, 2, hgt)
      px(o, '#706462', x + 3, y + 9 - hgt, 10, 2)
      // Jagged break
      px(o, '#3a3030', x + 5, y + 8 - hgt, 3, 2)
      px(o, '#3a3030', x + 9, y + 7 - hgt, 2, 3)
      // Fallen drum
      px(g, '#4e4240', x + (p.v ? -9 : 14), y + 11, 9, 5)
      px(g, '#625654', x + (p.v ? -9 : 14), y + 11, 9, 1)
      break
    }
    case 'skeleton': {
      // Someone who didn't make it: skull, ribs, a rusty sword
      const v = p.v % 3
      px(g, '#d8ccbc', x + 3, y + 5, 4, 4)
      px(g, '#2a2020', x + 4, y + 6, 1, 1)
      px(g, '#2a2020', x + 6, y + 6, 1, 1)
      for (let i = 0; i < 4; i++) px(g, '#c8bcac', x + 6, y + 9 + i * 1.5, 6, 1)
      px(g, '#c8bcac', x + 8, y + 8, 1, 7)
      px(g, '#b8ac9c', x + 2 + v, y + 13, 5, 1)
      px(g, '#8a8a92', x + 10 - v, y + 3, 1, 9)
      px(g, '#6a4a2a', x + 9 - v, y + 11, 3, 1)
      break
    }
    case 'bedroll':
      px(g, '#2a1c14', x + 1, y + 5, W - 2, 8)
      px(g, '#6a3a2a', x + 2, y + 5, W - 4, 7)
      px(g, '#8a5a3a', x + 2, y + 5, 7, 7)
      px(g, '#a08060', x + 3, y + 6, 5, 3)
      break
    case 'campfire':
      // Ash ring (the dying embers glow, animated)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        px(g, '#4a4040', x + 8 + Math.cos(a) * 6 - 1, y + 9 + Math.sin(a) * 4 - 1, 3, 2)
      }
      px(g, '#1a1414', x + 4, y + 7, 8, 5)
      px(g, '#3a2418', x + 5, y + 8, 6, 1)
      px(g, '#3a2418', x + 6, y + 10, 5, 1)
      break
    case 'crate':
      shadow(x + 8, y + 15, 8, 2)
      px(g, '#3a2414', x + 1, y + 2, 14, 13)
      px(g, '#7a5430', x + 2, y + 3, 12, 11)
      px(g, '#5a3c22', x + 2, y + 8, 12, 1)
      px(g, '#5a3c22', x + 7, y + 3, 1, 11)
      px(o, '#9a7040', x + 2, y + 2, 12, 2)
      px(o, '#3a2414', x + 1, y + 1, 14, 1)
      break
    case 'barrel':
      shadow(x + 8, y + 15, 7, 2)
      px(g, '#3a2414', x + 3, y + 2, 10, 13)
      px(g, '#7a4a28', x + 4, y + 2, 8, 13)
      px(g, '#9a6a3a', x + 5, y + 2, 2, 13)
      px(g, '#4a4448', x + 3, y + 5, 10, 1)
      px(g, '#4a4448', x + 3, y + 11, 10, 1)
      px(o, '#5a3a20', x + 4, y + 1, 8, 2)
      break
    case 'rune':
      // A rune circle (its glow is animated)
      g.strokeStyle = 'rgba(80,30,20,0.9)'
      g.lineWidth = 2
      g.beginPath()
      g.ellipse(x + 8, y + 8, (p.v + 1) * TILE * 0.9, (p.v + 1) * TILE * 0.55, 0, 0, Math.PI * 2)
      g.stroke()
      break
    case 'treasure': {
      // A heap of gold (it glitters, animated)
      shadow(x + 8, y + 14, 9, 3)
      for (let i = 0; i < 16; i++) {
        const a = hash(p.x, i, 520), b = hash(p.y, i, 521)
        px(g, i % 3 ? '#e0b030' : '#ffe080', x + 2 + a * 12, y + 8 + b * 6 - (1 - Math.abs(a - 0.5) * 2) * 4, 3, 2)
      }
      px(g, '#c88a20', x + 4, y + 11, 8, 3)
      px(g, '#7a2a8a', x + 10, y + 7, 3, 3)
      px(g, '#2a8aca', x + 4, y + 8, 2, 2)
      break
    }
    case 'anvil':
      shadow(x + 8, y + 14, 8, 2)
      px(g, '#2a2a2c', x + 5, y + 9, 6, 6)
      px(g, '#4a4a4e', x + 1, y + 4, 14, 5)
      px(g, '#6a6a70', x + 1, y + 4, 14, 1)
      px(g, '#4a4a4e', x - 2, y + 5, 4, 2)
      px(o, '#7a7a80', x + 2, y + 3, 12, 1)
      break
    case 'coal':
      for (let i = 0; i < 10; i++) px(g, i % 2 ? '#1a1616' : '#2a2424', x + 2 + hash(p.x, i, 530) * 11, y + 6 + hash(p.y, i, 531) * 7, 3, 2)
      break
    case 'crucible':
      // A big iron crucible on a stand, tipped toward the basin (the pour is animated)
      shadow(x + W / 2, y + H - 2, W / 2, 4)
      px(g, '#2a2626', x + 4, y + H - 10, 4, 9)
      px(g, '#2a2626', x + W - 8, y + H - 10, 4, 9)
      px(o, '#3a3436', x + 3, y + 2, W - 6, H - 12)
      px(o, '#5a5254', x + 3, y + 2, W - 6, 2)
      px(o, '#2a2426', x + 3, y + H - 11, W - 6, 2)
      px(o, '#ff9a3a', x + 5, y + 3, W - 10, 2)
      break
    case 'chimney':
      // A stone chimney stack rising out of sight (smoke animated)
      shadow(x + W / 2, y + H - 2, W / 2, 4)
      px(g, '#2a1e1e', x + 2, y + H - 8, W - 4, 7)
      px(g, '#ff7a2a', x + 8, y + H - 6, W - 16, 4)
      px(o, '#3a2c2c', x + 3, y - 30, W - 6, H + 22)
      for (let i = 0; i < 7; i++) px(o, '#2a1e1e', x + 3, y - 28 + i * 7, W - 6, 1)
      px(o, '#4a3a3a', x + 3, y - 30, 2, H + 22)
      px(o, '#1a1212', x + 2, y - 33, W - 4, 3)
      break
    case 'rails': {
      // Mine rails: two iron rails on wooden sleepers
      const long = p.v === 0
      for (let i = 0; i < (long ? p.w : p.h) * 2; i++) {
        if (long) px(g, '#3a2818', x + i * 8 + 2, y + 3, 3, 10)
        else px(g, '#3a2818', x + 3, y + i * 8 + 2, 10, 3)
      }
      g.fillStyle = '#6a6a72'
      if (long) {
        g.fillRect(x, y + 5, W, 1)
        g.fillRect(x, y + 10, W, 1)
      } else {
        g.fillRect(x + 5, y, 1, H)
        g.fillRect(x + 10, y, 1, H)
      }
      break
    }
    case 'cart':
      shadow(x + 8, y + 14, 8, 2)
      px(g, '#2a2a2c', x + 3, y + 12, 3, 3)
      px(g, '#2a2a2c', x + 11, y + 12, 3, 3)
      px(g, '#4a3a2a', x + 1, y + 4, 14, 9)
      px(g, '#6a5040', x + 1, y + 4, 14, 1)
      for (let i = 0; i < 6; i++) px(g, i % 2 ? '#e08a3a' : '#5a4a3e', x + 3 + i * 2, y + 3, 2, 2)
      break
    case 'trough':
      shadow(x + W / 2, y + 14, W / 2, 2)
      px(g, '#3a3232', x, y + 4, W, 11)
      px(g, '#2a6a8a', x + 2, y + 6, W - 4, 6)
      px(g, '#4a8aaa', x + 3, y + 7, W - 6, 1)
      break
    case 'bones':
      // A heap of bones (blocking)
      shadow(x + 8, y + 14, 8, 3)
      for (let i = 0; i < 9; i++) {
        const a = hash(p.x + p.v, i, 540)
        px(g, i % 3 ? '#d0c4b0' : '#a89c88', x + 1 + a * 10, y + 4 + hash(p.y, i, 541) * 8, 5, 2)
      }
      px(o, '#e0d4c4', x + 5, y + 1, 5, 4)
      px(o, '#2a2020', x + 6, y + 2, 1, 1)
      px(o, '#2a2020', x + 8, y + 2, 1, 1)
      break
    case 'nest':
      // Straw ring round the lair
      g.strokeStyle = '#8a7030'
      g.lineWidth = 3
      g.beginPath()
      g.ellipse(x + W / 2, y + H / 2, W / 2, H / 2.4, 0, 0, Math.PI * 2)
      g.stroke()
      g.strokeStyle = '#b09a50'
      g.lineWidth = 1
      g.stroke()
      break
    case 'skull': {
      // A giant fossil skull half sunk in the rock
      shadow(x + W / 2, y + H - 2, W / 2, 5)
      const bone = '#d8ccb8', dark = '#8a7e6c'
      px(o, bone, x + 4, y - 8, W - 8, H)
      px(o, bone, x + 1, y - 2, W - 2, H - 8)
      px(o, dark, x + 4, y + H - 9, W - 8, 2)
      px(o, '#1a1212', x + 9, y - 2, 7, 6)
      px(o, '#1a1212', x + W - 16, y - 2, 7, 6)
      px(o, '#ff5a2a', x + 11, y, 2, 2)
      px(o, '#ff5a2a', x + W - 14, y, 2, 2)
      for (let i = 0; i < 6; i++) px(o, bone, x + 8 + i * 5, y + H - 8, 3, 6)
      px(o, dark, x + W / 2 - 2, y - 6, 4, 8)
      break
    }
    case 'cage': {
      // An iron cage, bones inside
      shadow(x + W / 2, y + H - 2, W / 2, 4)
      px(g, '#2a2222', x + 2, y + H - 4, W - 4, 3)
      px(g, '#c8bcac', x + 8, y + H - 8, 6, 2)
      px(g, '#d8ccbc', x + 14, y + H - 10, 4, 3)
      o.fillStyle = '#4a4448'
      for (let i = 2; i < W - 1; i += 4) o.fillRect(x + i, y - 10, 1, H + 8)
      o.fillStyle = '#5a5458'
      o.fillRect(x + 2, y - 10, W - 4, 2)
      o.fillRect(x + 2, y + 4, W - 4, 1)
      o.fillRect(x + W / 2 - 1, y - 14, 2, 4)
      break
    }
    case 'tower': {
      // A squat stone tower with crenellations and an arrow slit
      shadow(x + W / 2, y + H - 2, W / 2 + 2, 5)
      px(g, '#3a2e2a', x, y + 8, W, H - 8)
      px(o, '#4e403a', x, y - 22, W, H + 14)
      for (let i = 0; i < 6; i++) px(o, '#3a2e2a', x, y - 20 + i * 6, W, 1)
      for (let i = 0; i < W; i += 8) px(o, '#5e4e46', x + i, y - 28, 5, 6)
      px(o, '#1a1212', x + W / 2 - 1, y - 12, 2, 7)
      px(o, '#62524a', x, y - 22, 2, H + 14)
      break
    }
    case 'barricade': {
      // Wooden stakes, sharpened, lashed together
      shadow(x + W / 2, y + 14, W / 2, 2)
      for (let i = 0; i < p.w * 3; i++) {
        const sx = x + i * 5 + 1
        px(g, '#4a3220', sx, y + 4, 3, 11)
        px(o, '#6a4a2c', sx, y - 4, 3, 9)
        px(o, '#8a6a40', sx + 1, y - 6, 1, 3)
      }
      px(o, '#3a2414', x, y + 1, W, 2)
      break
    }
    case 'warbanner':
      // A war banner on a pole (the cloth hangs on the overlay)
      shadow(x + 8, y + 14, 4, 2)
      px(g, '#2a2020', x + 7, y + 6, 2, 9)
      px(o, '#3a2a20', x + 7, y - 26, 2, 34)
      px(o, '#8a1e1e', x + 9, y - 24, 10, 16)
      px(o, '#6a1414', x + 9, y - 10, 10, 2)
      px(o, '#c89a3a', x + 12, y - 20, 4, 6)
      px(o, '#8a1e1e', x + 13, y - 19, 2, 4)
      break
    case 'beam': {
      // Mine beams: posts at both sides, a crossbeam overhead (vertical halls only)
      const long = p.v === 1
      if (long) {
        px(g, '#4a3220', x + 6, y, 4, TILE)
        px(g, '#4a3220', x + 6, y + H - TILE, 4, TILE)
        px(o, '#5a3c26', x + 5, y - 6, 6, 8)
        px(o, '#5a3c26', x + 5, y + H - TILE - 6, 6, 8)
      } else {
        px(g, '#3a2414', x, y + 4, 4, 12)
        px(g, '#3a2414', x + W - 4, y + 4, 4, 12)
        px(o, '#5a3c26', x, y - 14, 4, 20)
        px(o, '#5a3c26', x + W - 4, y - 14, 4, 20)
        px(o, '#6a4a2e', x, y - 18, W, 5)
        px(o, '#3a2414', x, y - 14, W, 1)
      }
      break
    }
    case 'rubble':
      for (let i = 0; i < 7; i++) {
        const a = hash(p.x, i, 550), b = hash(p.y, i, 551)
        px(g, i % 2 ? '#4a3c38' : '#5c4c46', x + a * 13, y + 6 + b * 8, 2 + a * 3, 2)
      }
      break
    case 'web':
      g.strokeStyle = 'rgba(220,220,230,0.25)'
      g.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + 14 - i * 3, y + 2 + i * 4)
        g.stroke()
      }
      break
    case 'railing': {
      // Bridge balustrades: posts along both sides of the bridge
      for (let i = 0; i < p.h; i++) {
        const ty = p.y + i
        if (w.at(p.x - 1, ty) !== T.LAVA && w.at(p.x + p.w, ty) !== T.LAVA) continue
        for (const sx of [x - 2, x + W - 1]) {
          px(g, '#2a2020', sx, ty * TILE + 2, 3, 14)
          px(o, '#6a5a52', sx, ty * TILE - 2, 3, 5)
        }
      }
      break
    }
    case 'throne':
      // An obsidian throne with a spiked back
      shadow(x + W / 2, y + H - 3, W / 2, 5)
      px(g, '#1e1618', x + 4, y + H - 12, W - 8, 11)
      px(o, '#262022', x + 10, y - 26, W - 20, H + 14)
      for (let i = 0; i < 3; i++) px(o, '#2e2628', x + 10 + i * ((W - 22) / 2), y - 34 + (i === 1 ? -6 : 0), 4, 10)
      px(o, '#ff7a2a', x + W / 2 - 1, y - 20, 2, 14)
      break
    case 'torchstand':
      // A stone torch stand with a bowl of coals on top (the fire is animated)
      shadow(x + 8, y + 15, 6, 2)
      px(g, '#2a2224', x + 4, y + 4, 8, 12)
      px(o, '#3a3032', x + 4, y - 8, 8, 12)
      px(o, '#4a4042', x + 2, y - 10, 12, 3)
      px(o, '#ff8a2a', x + 3, y - 10, 10, 1)
      break
    case 'spire':
      // Sharp basalt stalagmites with glowing cracks
      shadow(x + W / 2, y + 14, W / 2, 3)
      for (const [sx2, h2] of [[6, 18], [16, 30], [26, 16]]) {
        o.fillStyle = '#2a2224'
        o.beginPath(); o.moveTo(x + sx2 - 6, y + 14); o.lineTo(x + sx2, y + 14 - h2); o.lineTo(x + sx2 + 6, y + 14); o.closePath(); o.fill()
        px(o, '#ff7a2a', x + sx2, y + 14 - h2 / 2, 1, h2 / 3)
      }
      break
    case 'carcass':
      for (let i = 0; i < 9; i++) px(g, '#d0c4b0', x + 10 + i * 5, y + 8 + Math.sin(i) * 2, 2, 12)
      px(g, '#d0c4b0', x + 8, y + 14, W - 12, 2)
      break
    case 'pillar': {
      // A great basalt column rising from its footing (the footing is the rock tile under it)
      const top = y - 34, bw = W - 6
      px(o, '#2a2022', x + 3, top, bw, H - 4 - (top - y))
      for (let i = 0; i < 4; i++) px(o, ['#3c3032', '#342a2c', '#2e2527', '#272022'][i], x + 4 + i * (bw / 4 - 0.5), top + 4, bw / 4 - 1, H - 10 - (top - y))
      px(o, '#4e4244', x + 4, top + 4, 2, H - 10 - (top - y))
      // A vein of lava running down it
      let vx = x + 8 + (p.v % 3) * 5
      for (let vy = top + 8; vy < y + H - 10; vy += 3) {
        px(o, '#ff7a2a', vx, vy, 1, 3)
        vx += (hash(p.v, vy, 575) > 0.5 ? 1 : -1) * (hash(vy, p.v, 576) > 0.6 ? 1 : 0)
      }
      // Capital and a band at its foot
      px(o, '#3e3234', x + 1, top - 5, W - 2, 6)
      px(o, '#5a4e50', x + 1, top - 5, W - 2, 1)
      px(o, '#1e1618', x + 1, top + 1, W - 2, 1)
      px(o, '#3e3234', x + 2, y + H - 8, W - 4, 3)
      px(o, '#5a4e50', x + 2, y + H - 8, W - 4, 1)
      break
    }
    case 'tent': {
      // A soldier's tent: red canvas over a ridge pole, the flap open, guy ropes pegged out
      shadow(x + W / 2, y + H - 3, W / 2 + 2, 5)
      g.strokeStyle = '#6a5a48'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x + W / 2, y - 12); g.lineTo(x - 2, y + H - 1)
      g.moveTo(x + W / 2, y - 12); g.lineTo(x + W + 1, y + H - 1)
      g.stroke()
      const cloth = [['#7a2a22', '#8e3a2c', '#5a1c18'], ['#6a4a2a', '#7e5a34', '#4a321c'], ['#4a3a5a', '#5a4a6e', '#33283e']][p.v % 3]
      o.fillStyle = cloth[2]
      o.beginPath(); o.moveTo(x + 1, y + H - 3); o.lineTo(x + W / 2, y - 14); o.lineTo(x + W - 1, y + H - 3); o.closePath(); o.fill()
      o.fillStyle = cloth[0]
      o.beginPath(); o.moveTo(x + 3, y + H - 4); o.lineTo(x + W / 2, y - 12); o.lineTo(x + W - 3, y + H - 4); o.closePath(); o.fill()
      o.fillStyle = cloth[1]
      o.beginPath(); o.moveTo(x + 3, y + H - 4); o.lineTo(x + W / 2, y - 12); o.lineTo(x + W / 2, y + H - 4); o.closePath(); o.fill()
      // Seams, the open flap and the dark inside
      o.fillStyle = 'rgba(0,0,0,0.18)'
      for (let i = 1; i < 4; i++) o.fillRect(x + 3, y + H - 4 - i * 9, W - 6, 1)
      o.fillStyle = '#140c0c'
      o.beginPath(); o.moveTo(x + W / 2 - 7, y + H - 4); o.lineTo(x + W / 2, y + 2); o.lineTo(x + W / 2 + 7, y + H - 4); o.closePath(); o.fill()
      o.fillStyle = '#c8a060'
      o.beginPath(); o.moveTo(x + W / 2 + 1, y + 3); o.lineTo(x + W / 2 + 9, y + H - 4); o.lineTo(x + W / 2 + 5, y + H - 4); o.closePath(); o.fill()
      px(o, '#3a2a20', x + W / 2 - 1, y - 20, 2, 8)
      px(o, '#c89a3a', x + W / 2 + 1, y - 20, 6, 3)
      break
    }
    case 'ballista': {
      // A siege ballista on a wheeled frame, loaded and aimed west at the crater gate
      shadow(x + W / 2, y + H - 3, W / 2 + 2, 4)
      px(g, '#3a2414', x + 4, y + 14, 24, 14)
      px(g, '#5a3c22', x + 5, y + 15, 22, 2)
      for (const [wx, wy] of [[x + 3, y + 22], [x + 23, y + 22]]) {
        px(g, '#1e1818', wx, wy, 7, 7)
        px(g, '#4a4448', wx + 2, wy + 2, 3, 3)
      }
      px(o, '#6a4a2c', x + 2, y + 9, 27, 5)
      px(o, '#8a6a40', x + 2, y + 9, 27, 1)
      px(o, '#3a2414', x + 20, y + 4, 4, 12)
      o.strokeStyle = '#5a3c22'
      o.lineWidth = 3
      o.beginPath(); o.moveTo(x + 13, y - 6); o.quadraticCurveTo(x + 6, y + 11, x + 13, y + 28); o.stroke()
      o.strokeStyle = '#d8ccb0'
      o.lineWidth = 1
      o.beginPath(); o.moveTo(x + 13, y - 6); o.lineTo(x + 22, y + 11); o.lineTo(x + 13, y + 28); o.stroke()
      px(o, '#8a8a92', x - 6, y + 10, 28, 2)
      o.fillStyle = '#c8c8d0'
      o.beginPath(); o.moveTo(x - 11, y + 11); o.lineTo(x - 5, y + 7); o.lineTo(x - 5, y + 15); o.closePath(); o.fill()
      px(o, '#a83a2a', x + 18, y + 8, 3, 6)
      break
    }
    case 'firebowl':
      // An iron fire bowl on a tripod (the fire is animated)
      shadow(x + 8, y + 15, 7, 2)
      px(g, '#1e1a1a', x + 3, y + 8, 2, 8)
      px(g, '#1e1a1a', x + 11, y + 8, 2, 8)
      px(g, '#2a2424', x + 7, y + 9, 2, 6)
      px(o, '#3a3436', x + 1, y + 2, 14, 7)
      px(o, '#5a5254', x + 1, y + 2, 14, 1)
      px(o, '#2a2426', x + 3, y + 8, 10, 2)
      px(o, '#ff8a2a', x + 2, y + 1, 12, 2)
      break
    case 'weapons':
      // A standing rack: spears, a sword and a round shield
      shadow(x + 8, y + 15, 7, 2)
      px(g, '#3a2414', x + 1, y + 12, 14, 3)
      px(o, '#4a3220', x + 1, y - 2, 2, 15)
      px(o, '#4a3220', x + 13, y - 2, 2, 15)
      px(o, '#5a3c22', x + 1, y + 1, 14, 2)
      for (const sx of [4, 7, 10]) {
        px(o, '#6a4a2a', x + sx, y - 12, 1, 24)
        px(o, '#b8b8c0', x + sx - 1, y - 16, 3, 4)
        px(o, '#e0e0e8', x + sx, y - 17, 1, 1)
      }
      px(o, '#7a1e1e', x + 6, y + 5, 8, 8)
      px(o, '#5a1414', x + 6, y + 11, 8, 2)
      px(o, '#c89a3a', x + 9, y + 8, 2, 2)
      break
    case 'wall': {
      // A stretch of crenellated parapet, half fallen
      shadow(x + W / 2, y + 15, W / 2 + 1, 3)
      px(g, '#2a2020', x, y + 10, W, 6)
      px(o, '#4e403a', x, y - 8, W, 20)
      for (let i = 0; i < 4; i++) {
        const off = (i % 2) * 4
        for (let bx = -off; bx < W; bx += 8) px(o, '#3a2e2a', x + Math.max(0, bx), y - 7 + i * 5, 1, 4)
        px(o, '#3a2e2a', x, y - 3 + i * 5, W, 1)
      }
      for (let i = 0; i < W; i += 8) if (!(p.v && i === 8)) px(o, '#5e4e46', x + i, y - 14, 5, 6)
      px(o, '#6e5e56', x, y - 8, W, 1)
      px(o, '#2a2020', x, y + 11, W, 1)
      if (p.v) for (let i = 0; i < 5; i++) px(g, '#4e403a', x + W + 1 + hash(p.x, i, 570) * 8, y + 6 + hash(p.y, i, 571) * 8, 3, 2)
      break
    }
    case 'arrows': {
      // Spent arrows stuck in the ground, sometimes a broken shield
      for (let i = 0; i < 3; i++) {
        const ax = x + 2 + hash(p.x + p.v, i, 580) * 11, ay = y + 6 + hash(p.y, i, 581) * 8
        const lean = hash(p.v, i, 582) > 0.5 ? 1 : -1
        px(g, 'rgba(0,0,0,0.3)', ax + 1, ay + 1, 3, 1)
        for (let k = 0; k < 5; k++) px(o, '#6a4a2a', ax + lean * k * 0.5, ay - k, 1, 1)
        px(o, '#d8d0c0', ax + lean * 2.5 - 1, ay - 6, 3, 1)
      }
      if (p.v % 4 === 0) {
        g.fillStyle = '#5a1a1a'
        g.beginPath(); g.arc(x + 8, y + 11, 4, Math.PI * 0.2, Math.PI * 1.3); g.fill()
        px(g, '#a8823a', x + 7, y + 10, 2, 2)
      }
      break
    }
    case 'emblem': {
      // The order's crest set into the road: a ring of gold, rays, a flame in the middle
      const cx2 = x + W / 2, cy2 = y + H / 2, R = W / 2 - 2
      g.fillStyle = '#2a1e1c'
      g.beginPath(); g.arc(cx2, cy2, R, 0, Math.PI * 2); g.fill()
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#3e2c28' : '#4a3630'
        g.beginPath(); g.moveTo(cx2, cy2)
        g.arc(cx2, cy2, R - 6, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2)
        g.closePath(); g.fill()
      }
      g.strokeStyle = '#8a6a3a'
      g.lineWidth = 4
      g.beginPath(); g.arc(cx2, cy2, R - 3, 0, Math.PI * 2); g.stroke()
      g.strokeStyle = '#c89a3a'
      g.lineWidth = 1
      g.beginPath(); g.arc(cx2, cy2, R - 1, 0, Math.PI * 2); g.stroke()
      g.beginPath(); g.arc(cx2, cy2, R - 5, 0, Math.PI * 2); g.stroke()
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        px(g, '#5a4426', cx2 + Math.cos(a) * (R - 3) - 1, cy2 + Math.sin(a) * (R - 3), 2, 1)
      }
      // A three-tongued flame
      const flame = (fx: number, fy: number, sc: number, col: string) => {
        g.fillStyle = col
        g.beginPath()
        g.moveTo(fx, fy - 16 * sc)
        g.quadraticCurveTo(fx + 9 * sc, fy - 4 * sc, fx + 7 * sc, fy + 6 * sc)
        g.quadraticCurveTo(fx, fy + 12 * sc, fx - 7 * sc, fy + 6 * sc)
        g.quadraticCurveTo(fx - 9 * sc, fy - 4 * sc, fx, fy - 16 * sc)
        g.fill()
      }
      flame(cx2, cy2 + 2, 1.4, '#7a1e14')
      flame(cx2 - 9, cy2 + 6, 0.7, '#7a1e14')
      flame(cx2 + 9, cy2 + 6, 0.7, '#7a1e14')
      flame(cx2, cy2 + 3, 1, '#c8501e')
      flame(cx2, cy2 + 5, 0.55, '#e8a040')
      break
    }
    case 'sconce':
      if (!faceTile) break
      // An iron sconce with a torch (the flame is animated)
      px(g, 'rgba(0,0,0,0.3)', x + 5, y + 4, 6, 10)
      px(g, '#2a2628', x + 5, y + 11, 6, 2)
      px(g, '#3a3438', x + 7, y + 9, 2, 5)
      px(g, '#5a3c22', x + 7, y + 4, 2, 6)
      px(g, '#3a2414', x + 6, y + 3, 4, 2)
      break
    case 'banner':
      if (!faceTile) break
      px(g, '#3a3030', x + 2, y + 1, 12, 1)
      px(g, '#7a1a1c', x + 4, y + 2, 8, 12)
      px(g, '#9a2224', x + 4, y + 2, 2, 12)
      px(g, '#c89a3a', x + 6, y + 5, 4, 4)
      px(g, '#7a1a1c', x + 7, y + 6, 2, 2)
      px(g, '#7a1a1c', x + 4, y + 14, 3, 1)
      px(g, '#7a1a1c', x + 9, y + 14, 3, 1)
      break
    case 'chains':
      if (!faceTile) break
      for (const cx of [x + 4, x + 11]) for (let i = 0; i < 6; i++) px(g, i % 2 ? '#5a5458' : '#7a747a', cx, y + 1 + i * 2, 2, 2)
      px(g, '#5a5458', x + 4, y + 13, 9, 1)
      break
    case 'rack':
      if (!faceTile) break
      px(g, '#4a3220', x + 1, y + 3, 14, 2)
      px(g, '#4a3220', x + 1, y + 11, 14, 2)
      for (const sx of [x + 3, x + 7, x + 11]) {
        px(g, '#9a9aa2', sx, y + 1, 1, 12)
        px(g, '#6a4a2a', sx - 1, y + 9, 3, 1)
      }
      break
    case 'claws':
      if (!faceTile) break
      for (let i = 0; i < 3; i++) for (let k = 0; k < 7; k++) px(g, '#151012', x + 4 + i * 3 + k * 0.4, y + 3 + k, 1, 1)
      break
    case 'crystal':
    case 'lavafall':
    case 'steam':
      break
  }
}

// ---------------------------------------------------------------- moving lava

let lavaTex: HTMLCanvasElement | null = null
/**
 * A seamless 128×128 lava texture: a warped flow with bright veins. Built from
 * sines with whole-number frequencies, so it tiles without seams or a grid.
 */
function lavaTexture() {
  if (lavaTex) return lavaTex
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const img = g.createImageData(s, s)
  const TAU = Math.PI * 2
  const stops: [number, number, number, number][] = [[0, 70, 14, 6], [0.3, 160, 40, 12], [0.5, 230, 95, 24], [0.7, 255, 160, 50], [0.88, 255, 225, 130], [1, 255, 250, 205]]
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s
      // Domain warp, then a few waves on top of each other
      const wu = u + 0.08 * Math.sin(TAU * (2 * v + 0.3)) + 0.05 * Math.sin(TAU * (3 * u - 2 * v))
      const wv = v + 0.08 * Math.sin(TAU * (2 * u + 0.7)) + 0.05 * Math.sin(TAU * (u + 3 * v))
      let k = 0.5 + 0.22 * Math.sin(TAU * (2 * wu + wv)) + 0.16 * Math.sin(TAU * (3 * wv - wu) + 1.3) + 0.1 * Math.sin(TAU * (5 * wu + 4 * wv) + 2.1)
      // Veins: thin bright ridges where a wave crosses zero
      const ridge = 1 - Math.abs(Math.sin(TAU * (3 * wu - 2 * wv) + 2 * Math.sin(TAU * (wu + wv))))
      k = Math.min(1, Math.max(0, k * 0.85 + Math.pow(ridge, 6) * 0.45))
      let i = 0
      while (i < stops.length - 2 && k > stops[i + 1][0]) i++
      const [a0, r0, g0, b0] = stops[i], [a1, r1, g1, b1] = stops[i + 1]
      const t = Math.max(0, Math.min(1, (k - a0) / (a1 - a0)))
      const o = (y * s + x) * 4
      img.data[o] = r0 + (r1 - r0) * t
      img.data[o + 1] = g0 + (g1 - g0) * t
      img.data[o + 2] = b0 + (b1 - b0) * t
      img.data[o + 3] = 255
    }
  g.putImageData(img, 0, 0)
  lavaTex = c
  return c
}

/**
 * Where the lava is, as a mask with soft, organic edges (built once per world),
 * and its shore baked onto the ground: a dark cooled crust with a hot glowing
 * line where it meets the lava. The edge comes from soft blobs round the lava
 * tiles, so a river that steps from tile to tile flows in curves instead.
 */
export function buildLavaMask(w: World, ground?: CanvasRenderingContext2D) {
  const N = 128, S = TILE, size = N * S
  const lv = new Uint8Array(N * N)
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) lv[ty * N + tx] = w.at(tx, ty) === T.LAVA ? 1 : 0
  // Never spill over walls, rocks, props or bridges
  const hard = (tx: number, ty: number) => {
    const t = w.at(tx, ty)
    return t === T.TREE || t === T.ROCK || t === T.PROP || w.floorMat[ty * N + tx] === FM.bridge
  }
  const ramp = (v: number, a: number, z: number) => (v <= a ? 0 : v >= z ? 1 : (v - a) / (z - a))
  // Metaballs: every lava tile adds a soft blob; where they add up past the line it's lava.
  // Neighbouring blobs melt together, so steps and diagonals flow into curves.
  const R = 1.1, R2 = R * R
  const mask = new ImageData(size, size)
  const shore = ground ? new ImageData(size, size) : null
  for (let ty = 1; ty < N - 1; ty++)
    for (let tx = 1; tx < N - 1; tx++) {
      const inLava = lv[ty * N + tx] === 1
      if (!inLava && hard(tx, ty)) continue
      let any = false
      for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) if (lv[(ty + dy) * N + tx + dx]) { any = true; break }
      if (!any) continue
      for (let py = ty * S; py < ty * S + S; py++)
        for (let px = tx * S; px < tx * S + S; px++) {
          const gx = (px + 0.5) / S, gy = (py + 0.5) / S
          let f = 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (!lv[(ty + dy) * N + tx + dx]) continue
              const ex = gx - (tx + dx + 0.5), ey = gy - (ty + dy + 0.5), d2 = (ex * ex + ey * ey) / R2
              if (d2 < 1) f += (1 - d2) * (1 - d2)
            }
          const a = ramp(f, 0.44, 0.54)
          const o = (py * size + px) * 4
          if (a > 0) {
            mask.data[o] = mask.data[o + 1] = mask.data[o + 2] = 255
            mask.data[o + 3] = a * 255
          }
          if (shore && a < 1) {
            // Cooled crust fading out from the edge, a hot line right at it
            const crust = ramp(f, 0.12, 0.4), hot = ramp(f, 0.34, 0.47)
            if (crust <= 0) continue
            const n = hash(px >> 1, py >> 1, 480)
            shore.data[o] = 30 + hot * 200 + n * 14
            shore.data[o + 1] = 13 + hot * 64 + n * 6
            shore.data[o + 2] = 9 + hot * 8
            shore.data[o + 3] = Math.min(1, crust * (0.6 + n * 0.25) + hot * 0.45) * 255
          }
        }
    }
  const c = document.createElement('canvas')
  c.width = c.height = size
  c.getContext('2d')!.putImageData(mask, 0, 0)
  if (ground && shore) {
    const t = document.createElement('canvas')
    t.width = t.height = size
    t.getContext('2d')!.putImageData(shore, 0, 0)
    ground.drawImage(t, 0, 0)
  }
  return c
}

let lavaBuf: HTMLCanvasElement | null = null
/** The lava, flowing: two layers of the texture drifting different ways, cut to the lava's shape. */
export function drawLavaLayer(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement, ox: number, oy: number, vw: number, vh: number, time: number) {
  const W = Math.ceil(vw) + 2, H = Math.ceil(vh) + 2
  if (!lavaBuf) lavaBuf = document.createElement('canvas')
  if (lavaBuf.width < W || lavaBuf.height < H) {
    lavaBuf.width = Math.max(W, lavaBuf.width)
    lavaBuf.height = Math.max(H, lavaBuf.height)
  }
  const sx = Math.floor(ox), sy = Math.floor(oy)
  const b = lavaBuf.getContext('2d')!
  b.setTransform(1, 0, 0, 1, 0, 0)
  b.globalCompositeOperation = 'source-over'
  b.clearRect(0, 0, W, H)
  const tex = lavaTexture()
  const pat = b.createPattern(tex, 'repeat')!
  // Slow base flow
  pat.setTransform(new DOMMatrix([1.5, 0, 0, 1.5, -sx + time * 6, -sy + time * 3.5]))
  b.fillStyle = pat
  b.fillRect(0, 0, W, H)
  // A brighter second layer the other way, shimmering
  const pat2 = b.createPattern(tex, 'repeat')!
  pat2.setTransform(new DOMMatrix([1.1, 0, 0, 1.1, -sx - time * 9, -sy + time * 5]))
  b.globalCompositeOperation = 'lighter'
  b.globalAlpha = 0.35 + 0.08 * Math.sin(time * 1.7)
  b.fillStyle = pat2
  b.fillRect(0, 0, W, H)
  b.globalAlpha = 1
  b.globalCompositeOperation = 'destination-in'
  b.drawImage(mask, sx, sy, W, H, 0, 0, W, H)
  ctx.drawImage(lavaBuf, 0, 0, W, H, sx, sy, W, H)
}

// ---------------------------------------------------------------- moving props

/** Lights from the dungeon: lava pools, lavafalls, crystals, crucibles, chimney fires, runes, campfire embers. */
export function propLights(w: World, add: (x: number, y: number, r: number, col: string, a: number) => void, time: number) {
  const T2 = TILE
  for (const p of w.anim) {
    const cx = (p.x + p.w / 2) * T2, cy = (p.y + p.h / 2) * T2
    const fl = 0.85 + 0.15 * Math.sin(time * 7 + p.x)
    switch (p.kind) {
      case 'lavafall': add(cx, cy + T2 * 2, 60, '#ff7a2a', 0.7 * fl); break
      case 'crucible': add(cx, cy + T2 * 2, 50, '#ffa040', 0.6 * fl); break
      case 'chimney': add(cx, cy + 4, 30, '#ff7a2a', 0.5 * fl); break
      case 'crystal': add(cx, cy, 34, CRYSTAL[p.v % 3][1], 0.5 + 0.2 * Math.sin(time * 2 + p.x)); break
      case 'rune': add(cx, cy, 30 + p.v * 22, '#ff5a2a', 0.25 + 0.15 * Math.sin(time * 1.5)); break
      case 'campfire': add(cx, cy, 22, '#ff8a3a', 0.35 * fl); break
      case 'treasure': add(cx, cy, 24, '#ffd060', 0.25); break
      case 'firebowl': add(cx, cy - 6, 50, '#ff8a3a', 0.6 * fl); break
      case 'torchstand': add(cx, cy - 16, 52, '#ff8a3a', 0.6 * fl); break
      case 'sconce': add(cx, cy + 2, 40, '#ff9a4a', 0.45 * fl); break
    }
  }
  // The lava itself, sampled every few tiles
  for (const [x, y] of w.lavaLights) add(x * T2, y * T2, 46, '#ff6a20', 0.4 + 0.08 * Math.sin(time * 2 + x * 0.7 + y))
}

const CRYSTAL: [string, string, string][] = [['#ff9a4a', '#ff7a2a', '#ffe0b0'], ['#ff4a6a', '#ff3050', '#ffd0dc'], ['#b07aff', '#9a5aff', '#e8d8ff']]

/** The props that move, every frame (y-sorted by the caller through `drawAnimProp`). */
export function drawAnimProp(ctx: CanvasRenderingContext2D, p: Prop, time: number) {
  const x = p.x * TILE, y = p.y * TILE, W = p.w * TILE, H = p.h * TILE
  ctx.save()
  switch (p.kind) {
    case 'lavafall': {
      // Molten rock pouring down the wall face into the channel below
      const top = y, bot = y + H + 6
      ctx.fillStyle = '#7a2008'
      ctx.fillRect(x + 1, top, W - 2, bot - top)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 7; i++) {
        const lx = x + 2 + ((i * 5) % (W - 4))
        const off = ((time * 60 + i * 13) % 20)
        ctx.fillStyle = i % 2 ? 'rgba(255,170,60,0.9)' : 'rgba(255,230,140,0.8)'
        for (let k = -20; k < bot - top; k += 20) ctx.fillRect(lx, top + k + off, 2, 9)
      }
      // Splash
      const s = Math.sin(time * 9)
      ctx.fillStyle = 'rgba(255,200,90,0.8)'
      ctx.fillRect(x - 1 + s, bot - 3, W + 2, 3)
      ctx.fillRect(x + 3 - s * 2, bot - 6, 3, 2)
      ctx.fillRect(x + W - 5 + s * 2, bot - 5, 3, 2)
      break
    }
    case 'torchstand': {
      // Fire on top of the stand
      ctx.globalCompositeOperation = 'lighter'
      const top = y - 8
      for (let i = 0; i < 6; i++) {
        const k = (time * 1.8 + i / 6 + p.x * 0.17) % 1
        const s = (1 - k) * 4 + 1
        ctx.fillStyle = k < 0.3 ? `rgba(255,240,170,${0.9 - k})` : k < 0.6 ? `rgba(255,160,50,${0.85 - k * 0.6})` : `rgba(230,70,20,${(1 - k) * 0.9})`
        ctx.fillRect(x + 8 + Math.sin(time * 5 + i * 2.1) * (2 - k) + (i - 2.5) * 0.7 - s / 2, top - k * 13 - s / 2, s, s)
      }
      break
    }
    case 'crucible': {
      if (p.art) break
      // The pour: a stream of glowing metal from the crucible's lip into the basin
      ctx.globalCompositeOperation = 'lighter'
      const sx = x + W / 2 - 2, sy = y + H - 9
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k ? 'rgba(255,200,80,0.7)' : 'rgba(255,250,200,0.9)'
        ctx.fillRect(sx + k, sy, 4 - k * 2 + 1, TILE + 12)
      }
      const off = (time * 50) % 6
      ctx.fillStyle = 'rgba(255,255,220,0.9)'
      for (let k = 0; k < 4; k++) ctx.fillRect(sx + 1, sy + off + k * 6, 2, 2)
      ctx.fillStyle = `rgba(255,220,120,${0.5 + 0.3 * Math.sin(time * 12)})`
      ctx.fillRect(sx - 3, sy + TILE + 10, 10, 3)
      break
    }
    case 'chimney': {
      // Smoke and sparks rising from the stack
      for (let i = 0; i < 6; i++) {
        const k = (time * 0.35 + i / 6) % 1
        const r = 4 + k * 12
        ctx.fillStyle = `rgba(40,30,30,${(1 - k) * 0.5})`
        ctx.beginPath()
        ctx.arc(x + W / 2 + Math.sin(time + i * 2) * 4 + k * 10, y - 34 - k * 50, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 4; i++) {
        const k = (time * 0.8 + i / 4) % 1
        ctx.fillStyle = `rgba(255,170,60,${1 - k})`
        ctx.fillRect(x + W / 2 + Math.sin(time * 3 + i) * 5, y - 34 - k * 30, 1, 1)
      }
      break
    }
    case 'crystal': {
      // A cluster of glowing crystals, pulsing
      const [a, b, c] = CRYSTAL[p.v % 3]
      const pulse = 0.6 + 0.4 * Math.sin(time * 2 + p.x * 1.3)
      const shards: [number, number, number][] = [[5, 13, 3], [8, 15, 4], [11, 11, 3], [3, 9, 2], [13, 8, 2]]
      for (const [sx, h, sw] of shards) {
        ctx.fillStyle = b
        ctx.beginPath()
        ctx.moveTo(x + sx - sw, y + 15)
        ctx.lineTo(x + sx, y + 15 - h)
        ctx.lineTo(x + sx + sw, y + 15)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = a
        ctx.fillRect(x + sx - 1, y + 15 - h + 3, 1, h - 4)
      }
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = pulse
      ctx.fillStyle = c
      ctx.fillRect(x + 8, y + 2, 1, 3)
      ctx.fillRect(x + 7, y + 3, 3, 1)
      break
    }
    case 'rune': {
      // The rune circle glows and turns
      const R = (p.v + 1) * TILE * 0.9
      ctx.translate(x + 8, y + 8)
      ctx.scale(1, 0.6)
      ctx.globalCompositeOperation = 'lighter'
      const a = 0.35 + 0.25 * Math.sin(time * 1.5 + p.x)
      ctx.strokeStyle = `rgba(255,110,40,${a})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = `rgba(255,170,80,${a + 0.2})`
      const n = 8 + p.v * 4
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 + time * 0.25
        ctx.fillRect(Math.cos(t) * R * 0.86 - 1.5, Math.sin(t) * R * 0.86 - 1.5, 3, 3)
      }
      // A star inside
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const t = (i * 2 * Math.PI * 2) / 5 - time * 0.15
        if (i) ctx.lineTo(Math.cos(t) * R * 0.7, Math.sin(t) * R * 0.7)
        else ctx.moveTo(Math.cos(t) * R * 0.7, Math.sin(t) * R * 0.7)
      }
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'campfire': {
      // Dying embers that flare now and then
      ctx.globalCompositeOperation = 'lighter'
      const f = 0.5 + 0.5 * Math.sin(time * 3 + p.x)
      ctx.fillStyle = `rgba(255,120,40,${0.4 + f * 0.4})`
      ctx.fillRect(x + 6, y + 9, 4, 2)
      ctx.fillStyle = `rgba(255,200,90,${f})`
      ctx.fillRect(x + 7, y + 9, 1, 1)
      const k = (time * 0.7) % 1
      ctx.fillStyle = `rgba(255,170,60,${1 - k})`
      ctx.fillRect(x + 8 + Math.sin(time * 4) * 2, y + 6 - k * 12, 1, 1)
      break
    }
    case 'treasure': {
      // Glints on the gold
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.9 + i * 0.37 + p.v * 0.2) % 1
        if (k > 0.3) continue
        const a = 1 - k / 0.3
        const gx = x + 3 + hash(p.x, i, 560) * 10, gy = y + 6 + hash(p.y, i, 561) * 6
        ctx.fillStyle = `rgba(255,255,220,${a})`
        ctx.fillRect(gx, gy - 2, 1, 5)
        ctx.fillRect(gx - 2, gy, 5, 1)
      }
      break
    }
    case 'steam': {
      // Hissing steam from a crack
      for (let i = 0; i < 4; i++) {
        const k = (time * 0.5 + i / 4 + p.x * 0.1) % 1
        ctx.fillStyle = `rgba(230,220,220,${(1 - k) * 0.28})`
        ctx.beginPath()
        ctx.arc(x + 8 + Math.sin(time * 2 + i) * 3, y + 10 - k * 26, 3 + k * 6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#1a1212'
      ctx.fillRect(x + 5, y + 10, 6, 2)
      break
    }
    case 'firebowl': {
      // A big fire, licking up out of the bowl
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 7; i++) {
        const k = (time * 1.6 + i / 7 + p.x * 0.13) % 1
        const fx = x + 8 + Math.sin(time * 5 + i * 2.1) * (3 - k * 2) + (i - 3) * 0.8
        const fy = y + 2 - k * 16
        const s = (1 - k) * 5 + 1
        ctx.fillStyle = k < 0.3 ? `rgba(255,240,170,${0.9 - k})` : k < 0.6 ? `rgba(255,160,50,${0.85 - k * 0.6})` : `rgba(230,70,20,${(1 - k) * 0.9})`
        ctx.fillRect(fx - s / 2, fy - s / 2, s, s)
      }
      ctx.fillStyle = 'rgba(255,200,90,0.8)'
      ctx.fillRect(x + 3, y + 1, 10, 2)
      const k2 = (time * 0.6 + p.y * 0.21) % 1
      ctx.fillStyle = `rgba(255,170,60,${1 - k2})`
      ctx.fillRect(x + 8 + Math.sin(time * 3 + p.x) * 4, y - 14 - k2 * 22, 1, 1)
      break
    }
    case 'sconce': {
      // A torch flame on the wall
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 4; i++) {
        const k = (time * 2.2 + i / 4 + p.x * 0.31) % 1
        const s = (1 - k) * 3 + 1
        ctx.fillStyle = k < 0.35 ? `rgba(255,235,160,${0.9 - k})` : `rgba(255,120,40,${(1 - k) * 0.8})`
        ctx.fillRect(x + 8 + Math.sin(time * 6 + i) * 1.2 - s / 2, y + 2 - k * 8 - s / 2, s, s)
      }
      break
    }
    case 'trough': {
      // Steam off the cooling water
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.4 + i / 3) % 1
        ctx.fillStyle = `rgba(230,230,240,${(1 - k) * 0.22})`
        ctx.beginPath()
        ctx.arc(x + 6 + i * 8, y + 6 - k * 18, 3 + k * 5, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
  }
  ctx.restore()
}

/** Embers rising off the lava now and then, drifting and fading (additive, over everything on the ground). */
export function drawLavaEmbers(ctx: CanvasRenderingContext2D, w: World, time: number, inView: (x: number, y: number, m?: number) => boolean) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const [lx, ly] of w.lavaLights) {
    if (!inView(lx, ly, 2)) continue
    for (let i = 0; i < 3; i++) {
      const seed = hash(lx * 2, ly * 2 + i, 590)
      const k = (time * (0.35 + seed * 0.3) + seed * 7) % 1
      const ex = (lx + (hash(lx, ly + i, 591) - 0.5) * 1.6) * TILE + Math.sin(time * 1.3 + seed * 9) * 6 * k
      const ey = (ly + (hash(ly, lx + i, 592) - 0.5) * 1.2) * TILE - k * 40
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85
      ctx.fillStyle = i ? `rgba(255,150,50,${a * 0.85})` : `rgba(255,230,140,${a})`
      ctx.fillRect(ex, ey, i ? 1 : 2, i ? 1 : 2)
    }
  }
  ctx.restore()
}

/** Glowing eyes on the statues and the great skull: drawn every frame, additive. */
export function drawEyes(ctx: CanvasRenderingContext2D, w: World, time: number, inView: (x: number, y: number, m?: number) => boolean) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const a = 0.6 + 0.4 * Math.sin(time * 2.2)
  for (const p of w.props) {
    if (p.kind !== 'statue' || p.art || !inView(p.x + 1, p.y + 1, 3)) continue
    const cx = (p.x + p.w / 2) * TILE, top = (p.y + p.h) * TILE - 12
    ctx.fillStyle = `rgba(255,90,30,${a})`
    ctx.fillRect(cx - 3, top - 23, 2, 1)
    ctx.fillRect(cx + 1, top - 23, 2, 1)
    ctx.fillStyle = `rgba(255,120,50,${a * 0.25})`
    ctx.fillRect(cx - 5, top - 25, 10, 5)
  }
  ctx.restore()
}

// ---------------------------------------------------------------- stones and grime

/**
 * Flagstones and paving, laid per 2×2-tile block: one big slab, two halves, or
 * a half and two quarters; every stone bevelled, its own shade, sometimes cracked.
 */
export function bakeStones(g: CanvasRenderingContext2D, w: World) {
  const isStone = (tx: number, ty: number, m: number) => w.floorMat[ty * 128 + tx] === m && w.at(tx, ty) !== T.TREE && w.at(tx, ty) !== T.LAVA
  for (let by = 0; by < 128; by += 2)
    for (let bx = 0; bx < 128; bx += 2)
      for (const m of [FM.flag, FM.paving]) {
        const cells = [[0, 0], [1, 0], [0, 1], [1, 1]].filter(([dx, dy]) => isStone(bx + dx, by + dy, m))
        if (!cells.length) continue
        const pav = m === FM.paving
        g.save()
        g.beginPath()
        for (const [dx, dy] of cells) g.rect((bx + dx) * TILE, (by + dy) * TILE, TILE, TILE)
        g.clip()
        const X = bx * TILE, Y = by * TILE, S = TILE * 2
        const pick = Math.floor(hash(bx, by, 460) * 4)
        const stones: [number, number, number, number][] =
          pick === 0 ? [[0, 0, S, S]]
            : pick === 1 ? [[0, 0, S, S / 2], [0, S / 2, S, S / 2]]
              : pick === 2 ? [[0, 0, S / 2, S], [S / 2, 0, S / 2, S]]
                : [[0, 0, S, S / 2], [0, S / 2, S / 2, S / 2], [S / 2, S / 2, S / 2, S / 2]]
        stones.forEach(([sx, sy, sw, sh], i) => {
          const v = hash(bx * 3 + i, by * 5 + i, 461)
          const base = pav ? [[94, 76, 66], [88, 70, 60], [100, 82, 70]][Math.floor(v * 3)] : [[72, 58, 54], [66, 52, 48], [78, 62, 56]][Math.floor(v * 3)]
          const [r, gg, b] = base
          const x0 = X + sx + 1, y0 = Y + sy + 1, ww = sw - 2, hh = sh - 2
          g.fillStyle = `rgb(${r},${gg},${b})`
          g.fillRect(x0, y0, ww, hh)
          // Bevel: lit top-left, dark bottom-right
          g.fillStyle = `rgba(255,236,210,0.12)`
          g.fillRect(x0, y0, ww, 1)
          g.fillRect(x0, y0, 1, hh)
          g.fillStyle = 'rgba(0,0,0,0.28)'
          g.fillRect(x0, y0 + hh - 1, ww, 1)
          g.fillRect(x0 + ww - 1, y0, 1, hh)
          // Wear and grain
          for (let k = 0; k < (ww * hh) / 60; k++) {
            const a = hash(bx * 7 + i, by * 11 + k, 462), c = hash(bx * 13 + k, by * 3 + i, 463)
            g.fillStyle = a > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,240,220,0.06)'
            g.fillRect(x0 + 1 + a * (ww - 3), y0 + 1 + c * (hh - 3), 2, 1)
          }
          // A crack across some stones
          if (v < 0.18) {
            g.fillStyle = 'rgba(20,12,10,0.7)'
            let cx2 = x0 + 2 + hash(bx, by + i, 464) * (ww - 6), cy2 = y0 + 1
            while (cy2 < y0 + hh - 1) {
              g.fillRect(Math.round(cx2), cy2, 1, 2)
              cx2 += (hash(Math.round(cx2), cy2, 465) - 0.5) * 3
              cy2 += 2
            }
          }
        })
        g.restore()
      }
}

/** Large, soft patches of soot and dirt over the floors, so no room looks stamped out of one tile. */
export function bakeGrime(g: CanvasRenderingContext2D, w: World) {
  const val = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const p = (a: number, b: number) => hash(a, b, 470)
    return (p(xi, yi) * (1 - sx) + p(xi + 1, yi) * sx) * (1 - sy) + (p(xi, yi + 1) * (1 - sx) + p(xi + 1, yi + 1) * sx) * sy
  }
  for (let ty = 0; ty < 128; ty++)
    for (let tx = 0; tx < 128; tx++) {
      if (!w.floorMat[ty * 128 + tx] || w.at(tx, ty) === T.TREE || w.at(tx, ty) === T.LAVA) continue
      // Four sub-cells per tile, so the patches have soft edges
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const n = val((tx + sx / 2) / 5, (ty + sy / 2) / 5) * 0.7 + val((tx + sx / 2) / 2, (ty + sy / 2) / 2) * 0.3
          const a = Math.max(0, n - 0.5) * 0.55
          if (a <= 0.01) continue
          g.fillStyle = `rgba(14,8,8,${a})`
          g.fillRect(tx * TILE + sx * 8, ty * TILE + sy * 8, 8, 8)
        }
    }
}
