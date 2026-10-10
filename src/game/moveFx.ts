import type { Move, MoveFx } from '../data/moves'
import type { Mon } from './entities'
import { disc, drawGlow, drawShape, lightning, star, type Shape, type Vfx } from './vfx'

/**
 * Per-move choreography. Each move gets an anticipation (cast/charge), a main
 * effect, an impact and an aftermath (smoke, embers, ground marks).
 */

interface Pal {
  /** Bright → dark, particles walk through these over their life. */
  cols: string[]
  shape: Shape
  glow: string
  add: boolean
  grav: number
}

const P = {
  fire: { cols: ['#ffe878', '#ffb830', '#f87020', '#e04010', '#a02010', '#502018'], shape: 'flame', glow: '#f87820', add: false, grav: -5 },
  water: { cols: ['#ffffff', '#c8e8ff', '#78b0f8', '#3868d8'], shape: 'drop', glow: '#68a8f8', add: false, grav: 12 },
  grass: { cols: ['#d8f8a0', '#88d858', '#48a838', '#2c7a30'], shape: 'leaf', glow: '#a8f070', add: false, grav: 2 },
  solar: { cols: ['#ffffff', '#fffcc0', '#d8f878', '#88d858'], shape: 'glow', glow: '#f8f8a0', add: true, grav: -2 },
  ice: { cols: ['#ffffff', '#e8faff', '#b8e8f8', '#80c8e8'], shape: 'flake', glow: '#a8e0f8', add: false, grav: 1 },
  electric: { cols: ['#ffffff', '#fffcc0', '#f8e048', '#f8c020'], shape: 'streak', glow: '#f8e048', add: true, grav: 0 },
  aura: { cols: ['#ffffff', '#d0e8ff', '#78a8ff', '#3860e0'], shape: 'glow', glow: '#4878f8', add: true, grav: -1 },
  focus: { cols: ['#fff8e0', '#ffd070', '#f88030', '#c04010'], shape: 'glow', glow: '#f88030', add: true, grav: -1 },
  fist: { cols: ['#ffffff', '#fff0c0', '#ffc860', '#f88030'], shape: 'star', glow: '#ffe0a0', add: false, grav: 0 },
  poison: { cols: ['#f8d0ff', '#d080e8', '#a040a0', '#682878'], shape: 'bubble', glow: '#c060d0', add: false, grav: -3 },
  ground: { cols: ['#f0d8a0', '#c8a060', '#987040', '#684828'], shape: 'rock', glow: '#e0b070', add: false, grav: 0 },
  wind: { cols: ['#ffffff', '#f4f8ff', '#d8e0f8'], shape: 'streak', glow: '#e0e8ff', add: false, grav: 0 },
  psychic: { cols: ['#fff0f8', '#ffb8e0', '#f870b0', '#c04888'], shape: 'ring', glow: '#f878b8', add: true, grav: -1 },
  bug: { cols: ['#f8ffc0', '#d8e860', '#a8b820', '#708010'], shape: 'sq', glow: '#c8d840', add: false, grav: 3 },
  rock: { cols: ['#f0e8c8', '#d0b878', '#a88838', '#685820'], shape: 'rock', glow: '#e0d090', add: false, grav: 0 },
  ghost: { cols: ['#f0e0ff', '#b898f0', '#7858a8', '#382848'], shape: 'glow', glow: '#9070d0', add: true, grav: -3 },
  dragon: { cols: ['#f0e8ff', '#b8a0ff', '#8050f8', '#4020a8'], shape: 'flame', glow: '#8050f8', add: true, grav: -3 },
  dark: { cols: ['#f0a098', '#b05850', '#603838', '#201418'], shape: 'smoke', glow: '#c05048', add: false, grav: -1 },
  steel: { cols: ['#ffffff', '#f0f0ff', '#c8c8e0', '#9090b0'], shape: 'star', glow: '#e0e0f8', add: true, grav: 0 },
  star: { cols: ['#ffffff', '#fffcc0', '#f8e048', '#f8c020'], shape: 'star', glow: '#f8e048', add: true, grav: 0 },
  normal: { cols: ['#ffffff', '#f8f0d8', '#e8d8b0', '#c8b890'], shape: 'sq', glow: '#ffffff', add: false, grav: 3 },
  hyper: { cols: ['#ffffff', '#fff4c0', '#ffc050', '#f88020'], shape: 'glow', glow: '#ffc050', add: true, grav: -1 },
} satisfies Record<string, Pal>

export function pal(fx: MoveFx): Pal {
  switch (fx) {
    case 'ember': case 'flamethrower': case 'fireblast': case 'flamewheel': return P.fire
    case 'water': case 'hydropump': case 'aquajet': case 'surf': return P.water
    case 'leaf': case 'whip': case 'energy': return P.grass
    case 'solarbeam': return P.solar
    case 'ice': case 'icebeam': case 'snow': case 'blizzard': return P.ice
    case 'thundershock': case 'thunderbolt': case 'spark': case 'discharge': case 'thunder': return P.electric
    case 'aura': return P.aura
    case 'focusblast': return P.focus
    case 'kick': case 'closecombat': case 'tackle': return P.fist
    case 'poison': case 'sting': case 'sludgebomb': case 'gunkshot': return P.poison
    case 'mud': case 'quake': case 'earthpower': return P.ground
    case 'wind': case 'aerialace': case 'hurricane': return P.wind
    case 'psy': case 'psybeam': case 'psyshock': case 'psychic': return P.psychic
    case 'pin': case 'bugbite': case 'signalbeam': case 'bugbuzz': return P.bug
    case 'rock': case 'rocktomb': case 'stoneedge': return P.rock
    case 'shadowball': case 'shadowsneak': case 'shadowforce': case 'lick': return P.ghost
    case 'dragonrage': case 'dragonclaw': case 'dragonpulse': case 'dracometeor': return P.dragon
    case 'darkpulse': case 'bite': case 'nightdaze': return P.dark
    case 'mirror': case 'metalclaw': case 'flashcannon': case 'meteormash': return P.steel
    case 'star': return P.star
    case 'hyperbeam': return P.hyper
    default: return P.normal
  }
}

/** Screen tint used when an ultimate goes off. */
const DIM: Partial<Record<MoveFx, string>> = {
  thunder: '#101830', fireblast: '#301008', dracometeor: '#140828', hyperbeam: '#281404', solarbeam: '#142008',
  hydropump: '#081830', blizzard: '#102030', quake: '#201408', focusblast: '#281008', shadowforce: '#100818',
  nightdaze: '#180808', hurricane: '#101420', psychic: '#200818', bugbuzz: '#141808', stoneedge: '#181408',
  gunkshot: '#180818', meteormash: '#101018', voice: '#181818',
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** Generic particle burst in a move's palette. */
function spray(v: Vfx, fx: MoveFx, x: number, y: number, n: number, speed: number, extra: Parameters<Vfx['burst']>[2] = {}) {
  const p = pal(fx)
  v.burst(x, y, { n, speed, cols: p.cols, shape: p.shape, add: p.add, grav: p.grav, s0: 3, s1: 0.8, life: 0.55, flat: 0.75, ...extra })
}

function smoke(v: Vfx, x: number, y: number, n: number, dark = false, size = 6) {
  v.burst(x, y, {
    n, speed: 1.6, cols: dark ? ['#605860', '#403840', '#282428'] : ['#e8e0d8', '#c8c0b8', '#a8a098'],
    shape: 'smoke', s0: size * 0.5, s1: size * 1.4, life: 0.9, grav: -1.2, drag: 2.5, flat: 0.6,
  })
}

function debris(v: Vfx, x: number, y: number, n: number, cols: string[], power = 1) {
  v.burst(x, y, { n, speed: 3 * power, cols, shape: 'rock', s0: rnd(1.6, 2.6), s1: 1.6, life: 1.1, vz: 7 * power, zgrav: 30, drag: 0.6, flat: 0.7 })
}

function shockwave(v: Vfx, fx: MoveFx, x: number, y: number, r: number, big = false) {
  const p = pal(fx)
  v.ring(x, y, r, p.glow, big ? 0.55 : 0.4, big ? 7 : 4)
  if (big) v.ring(x, y, r * 0.6, '#ffffff', 0.35, 3)
}

// ---------------- Cast / charge ----------------

export function onCast(v: Vfx, mv: Move, m: Mon, near: boolean) {
  if (!near) return
  const p = pal(mv.fx)
  const x = m.x, y = m.y - 0.45
  if (mv.tier >= 3 && DIM[mv.fx]) v.dimScreen(DIM[mv.fx]!, mv.charge > 0 ? 1.1 + mv.charge : 0.9)
  // Muzzle flash toward the target
  v.glow(x + m.aimX * 0.4, y + m.aimY * 0.4, mv.tier >= 2 ? 14 : 9, p.glow, 0.18)
  if (mv.tier >= 1) spray(v, mv.fx, x + m.aimX * 0.4, y + m.aimY * 0.4, 4 + mv.tier * 2, 2.5, { dir: Math.atan2(m.aimY, m.aimX), spread: 0.7 })
}

/** Called every frame while a big move charges up (k: 0→1). */
export function chargeTick(v: Vfx, mv: Move, x: number, y: number, k: number) {
  const p = pal(mv.fx)
  // Particles stream inward and the core swells
  for (let i = 0; i < 2; i++) {
    const a = rnd(0, Math.PI * 2)
    const d = rnd(1.2, 2)
    v.burst(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, {
      n: 1, dir: a + Math.PI, spread: 0.05, speed: d * 3.2, cols: p.cols, shape: mv.fx === 'hyperbeam' || mv.fx === 'solarbeam' ? 'streak' : p.shape,
      add: true, s0: 2.5, s1: 1, life: 0.32, drag: 0,
    })
  }
  if (Math.random() < 0.3) v.glow(x, y, 8 + k * 16, p.glow, 0.15)
}

// ---------------- Projectiles ----------------

export function projectileTick(v: Vfx, fx: MoveFx, x: number, y: number, vx: number, vy: number) {
  const back = Math.atan2(-vy, -vx)
  const p = pal(fx)
  switch (fx) {
    case 'ember': case 'dragonrage':
      v.burst(x, y, { n: 2, dir: back, spread: 0.5, speed: 2, cols: p.cols, shape: 'flame', add: true, s0: 3, s1: 0.6, life: 0.32, grav: -3 })
      if (Math.random() < 0.3) smoke(v, x, y, 1, true, 3)
      break
    case 'energy': case 'aura': case 'shadowball': case 'mirror': case 'star':
      v.burst(x, y, { n: 2, dir: back, spread: 0.6, speed: 1.6, cols: p.cols, shape: fx === 'star' ? 'star' : 'glow', add: true, s0: 4, s1: 1, life: 0.35 })
      break
    case 'water': case 'mud':
      v.burst(x, y, { n: 2, dir: back, spread: 0.5, speed: 2, cols: p.cols, shape: p.shape, s0: 1.8, s1: 0.8, life: 0.35, grav: 8 })
      break
    case 'snow': case 'ice':
      v.burst(x, y, { n: 1, dir: back, spread: 0.6, speed: 1, cols: P.ice.cols, shape: 'flake', s0: 2, s1: 0.5, life: 0.45 })
      break
    case 'poison': case 'sting':
      if (Math.random() < 0.6) v.burst(x, y, { n: 1, dir: back, spread: 0.6, speed: 1, cols: p.cols, shape: 'bubble', s0: 1.8, s1: 0.6, life: 0.4, grav: -2 })
      break
    case 'psy': case 'darkpulse':
      if (Math.random() < 0.5) v.burst(x, y, { n: 1, speed: 0.4, cols: p.cols, shape: 'ring', add: fx === 'psy', s0: 2, s1: 7, life: 0.35 })
      break
    case 'wind': case 'pin':
      v.burst(x, y, { n: 1, dir: back, spread: 0.2, speed: 3, cols: P.wind.cols, shape: 'streak', s0: 1.5, s1: 0.5, life: 0.2 })
      break
    case 'rock':
      if (Math.random() < 0.4) v.burst(x, y, { n: 1, speed: 0.6, cols: ['#c8b890', '#a09070'], shape: 'smoke', s0: 2, s1: 4, life: 0.4 })
      break
    case 'leaf':
      if (Math.random() < 0.35) v.burst(x, y, { n: 1, speed: 0.6, cols: P.grass.cols, shape: 'sq', s0: 1.2, s1: 0.4, life: 0.4 })
      break
  }
}

export function projectileEnd(v: Vfx, fx: MoveFx, x: number, y: number, hit: boolean) {
  const p = pal(fx)
  const n = hit ? 12 : 6
  v.glow(x, y, hit ? 16 : 9, p.glow, 0.22)
  switch (fx) {
    case 'ember': case 'dragonrage':
      spray(v, fx, x, y, n, 3.5)
      smoke(v, x, y, 3, true, 4)
      if (hit) v.decal(x, y + 0.4, 0.45, 'scorch', 3)
      break
    case 'water': case 'mud':
      spray(v, fx, x, y, n, 3.5, { vz: 0 })
      v.ring(x, y + 0.3, 0.8, p.glow, 0.3, 2)
      v.decal(x, y + 0.4, 0.45, fx === 'water' ? 'puddle' : 'crack', 3)
      break
    case 'energy': case 'aura': case 'focusblast': case 'shadowball': case 'mirror':
      spray(v, fx, x, y, n, 4)
      shockwave(v, fx, x, y + 0.2, 1.2)
      v.burst(x, y, { n: 6, speed: 5, cols: ['#ffffff'], shape: 'streak', add: true, s0: 2, s1: 0.5, life: 0.25 })
      break
    case 'rock':
      debris(v, x, y, 7, P.rock.cols.slice(1))
      smoke(v, x, y, 3)
      break
    case 'ice': case 'snow':
      v.burst(x, y, { n, speed: 4, cols: P.ice.cols, shape: 'shard', add: false, s0: 2.6, s1: 1, life: 0.45 })
      if (hit) v.decal(x, y + 0.4, 0.5, 'frost', 3)
      break
    case 'leaf':
      v.burst(x, y, { n: 6, speed: 3, cols: P.grass.cols, shape: 'leaf', s0: 2.4, s1: 1.4, life: 0.7, grav: 1.5 })
      break
    case 'poison': case 'sting':
      spray(v, fx, x, y, n, 3)
      if (hit) v.decal(x, y + 0.4, 0.4, 'slime', 3)
      break
    case 'star':
      v.burst(x, y, { n: 8, speed: 4, cols: P.star.cols, shape: 'star', add: true, s0: 3, s1: 0.8, life: 0.5, vr: 12 })
      break
    default:
      spray(v, fx, x, y, n, 3.5)
  }
}

// ---------------- Lightning ----------------

export function onZap(v: Vfx, mv: Move, x1: number, y1: number, x2: number, y2: number, big: boolean, chain = false) {
  v.bolt(x1, y1, x2, y2, { w: big ? 2.6 : 1.7, jag: big ? 9 : 6, branches: big ? 3 : 1, strands: big ? 2 : 1, life: big ? 0.38 : 0.22 })
  if (!chain && big) v.bolt(x1, y1, x2, y2, { w: 1.2, jag: 12, branches: 1, life: 0.3 })
  v.glow(x2, y2, big ? 26 : 16, '#f8e048', 0.3)
  v.burst(x2, y2, { n: big ? 18 : 9, speed: big ? 7 : 5, cols: P.electric.cols, shape: 'streak', add: true, s0: 2, s1: 0.5, life: 0.35 })
  if (big) {
    v.ring(x2, y2 + 0.3, 1.3, '#f8e048', 0.35, 3)
    v.decal(x2, y2 + 0.45, 0.45, 'scorch', 2.5)
  }
  // Static crackle around the caster
  v.burst(x1, y1, { n: big ? 6 : 3, speed: 3, cols: P.electric.cols, shape: 'streak', add: true, s0: 1.5, s1: 0.4, life: 0.2 })
  void mv
}

// ---------------- Beams ----------------

export function onBeam(v: Vfx, mv: Move, x1: number, y1: number, x2: number, y2: number, origin: () => [number, number]) {
  const p = pal(mv.fx)
  const a = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.hypot(x2 - x1, y2 - y1)
  const dx = Math.cos(a), dy = Math.sin(a)
  const big = mv.tier >= 3
  switch (mv.fx) {
    case 'flamethrower': {
      // A real stream: lots of flame particles flying out for half a second.
      v.beam(x1, y1, x2, y2, 'flamethrower', 0.55, 7)
      v.emitter(0.55, (dt) => {
        const [ox, oy] = origin()
        const n = Math.round(90 * dt) + 1
        for (let i = 0; i < n; i++) {
          v.burst(ox + dx * 0.3, oy + dy * 0.3, {
            n: 1, dir: a, spread: 0.16, speed: 13, cols: P.fire.cols, shape: 'flame', add: false,
            s0: rnd(2, 3), s1: rnd(6.5, 9.5), life: len / 11, drag: 0.4, grav: -2, jitter: 0.05,
          })
        }
        if (Math.random() < dt * 25) smoke(v, ox + dx * len * rnd(0.5, 1), oy + dy * len * rnd(0.5, 1), 1, true, 5)
      })
      for (let s = 2; s < len; s += 1.6) v.decal(x1 + dx * s, y1 + dy * s + 0.45, 0.45, 'scorch', 3.5)
      v.glow(x2, y2, 24, '#f87820', 0.5)
      break
    }
    case 'hydropump':
      v.beam(x1, y1, x2, y2, 'hydropump', 0.6, 9)
      v.emitter(0.5, (dt) => {
        const [ox, oy] = origin()
        for (let i = 0; i < Math.round(60 * dt) + 1; i++) {
          const s = rnd(0, len)
          v.burst(ox + dx * s, oy + dy * s, { n: 1, speed: 3, cols: P.water.cols, shape: 'drop', s0: 2, s1: 0.8, life: 0.4, grav: 10 })
        }
        v.burst(x2, y2, { n: 3, speed: 6, cols: P.water.cols, shape: 'drop', s0: 2.4, s1: 1, life: 0.5, grav: 12, vz: 0 })
      })
      v.ring(x2, y2 + 0.3, 1.6, '#68a8f8', 0.5, 5)
      v.decal(x2, y2 + 0.45, 1.1, 'puddle', 4)
      break
    case 'solarbeam':
    case 'hyperbeam': {
      v.beam(x1, y1, x2, y2, mv.fx, 0.7, 13)
      v.emitter(0.6, (dt) => {
        const [ox, oy] = origin()
        for (let i = 0; i < Math.round(50 * dt) + 1; i++) {
          const s = rnd(0, len)
          const side = rnd(-1, 1) * 0.4
          v.burst(ox + dx * s - dy * side, oy + dy * s + dx * side, {
            n: 1, dir: a, spread: 0.3, speed: 6, cols: p.cols, shape: 'glow', add: true, s0: 4, s1: 1, life: 0.3,
          })
        }
      })
      v.ring(x1, y1 + 0.2, 1.4, p.glow, 0.35, 5)
      v.ring(x2, y2 + 0.2, 2.2, p.glow, 0.6, 7)
      v.glow(x2, y2, 40, p.glow, 0.6)
      v.decal(x2, y2 + 0.45, 1.2, mv.fx === 'solarbeam' ? 'glass' : 'crater', 4)
      smoke(v, x2, y2, 6, mv.fx === 'hyperbeam', 8)
      break
    }
    case 'icebeam':
      v.beam(x1, y1, x2, y2, 'icebeam', 0.5, 5)
      for (let s = 1; s < len; s += 1.2) {
        v.burst(x1 + dx * s, y1 + dy * s, { n: 2, speed: 1.2, cols: P.ice.cols, shape: 'flake', s0: 2.5, s1: 0.6, life: 0.8 })
        v.decal(x1 + dx * s, y1 + dy * s + 0.45, 0.5, 'frost', 4)
      }
      v.burst(x2, y2, { n: 12, speed: 4, cols: P.ice.cols, shape: 'shard', s0: 3, s1: 1, life: 0.6 })
      break
    case 'psybeam':
      v.beam(x1, y1, x2, y2, 'psybeam', 0.5, 6)
      v.burst(x2, y2, { n: 8, speed: 2, cols: P.psychic.cols, shape: 'ring', add: true, s0: 2, s1: 10, life: 0.5 })
      break
    case 'dragonpulse':
      v.beam(x1, y1, x2, y2, 'dragonpulse', 0.55, 7)
      spray(v, mv.fx, x2, y2, 14, 4)
      v.ring(x2, y2 + 0.2, 1.5, '#8050f8', 0.45, 4)
      break
    case 'flashcannon':
      v.beam(x1, y1, x2, y2, 'flashcannon', 0.55, 8)
      v.burst(x2, y2, { n: 14, speed: 5, cols: P.steel.cols, shape: 'star', add: true, s0: 3, s1: 0.6, life: 0.5, vr: 10 })
      v.ring(x2, y2 + 0.2, 1.5, '#ffffff', 0.4, 4)
      break
    case 'signalbeam':
      v.beam(x1, y1, x2, y2, 'signalbeam', 0.45, 5)
      v.burst(x2, y2, { n: 10, speed: 4, cols: ['#f85858', '#f8d030', '#58d858', '#58a8f8', '#c058f8'], shape: 'sq', s0: 2.5, s1: 0.5, life: 0.45 })
      break
    case 'gunkshot':
      v.beam(x1, y1, x2, y2, 'gunkshot', 0.5, 7)
      spray(v, mv.fx, x2, y2, 16, 4)
      v.decal(x2, y2 + 0.45, 1, 'slime', 4)
      break
    default:
      v.beam(x1, y1, x2, y2, mv.fx, 0.5, 6)
  }
  if (big) v.shakeBy(6)
}

// ---------------- Bursts around the caster ----------------

export function onBurst(v: Vfx, mv: Move, x: number, y: number, r: number) {
  const big = mv.tier >= 3
  const p = pal(mv.fx)
  switch (mv.fx) {
    case 'surf': {
      // A rolling wave crest that sweeps outward
      v.emitter(0.6, (_dt, k) => {
        const rr = r * (0.2 + k * 0.9)
        for (let i = 0; i < 10; i++) {
          const a = rnd(0, Math.PI * 2)
          v.burst(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62, {
            n: 1, dir: a, spread: 0.2, speed: 2, cols: P.water.cols, shape: i % 3 ? 'drop' : 'smoke', s0: 3, s1: 1, life: 0.45, grav: 4,
          })
        }
      })
      v.ring(x, y, r, '#3868d8', 0.6, 9)
      v.ring(x, y, r * 0.8, '#b8e0ff', 0.5, 4)
      v.decal(x, y + 0.3, r * 0.7, 'puddle', 4)
      break
    }
    case 'quake': {
      v.shakeBy(big ? 11 : 6)
      v.decal(x, y + 0.3, r * 0.9, 'crack', 5)
      v.ring(x, y + 0.2, r, '#c8a060', 0.6, big ? 8 : 5)
      for (let i = 0; i < (big ? 3 : 2); i++) v.ring(x, y + 0.2, r * (0.5 + i * 0.25), '#987040', 0.5 + i * 0.1, 3)
      for (let i = 0; i < (big ? 10 : 6); i++) {
        const a = rnd(0, Math.PI * 2), d = rnd(0.3, r)
        debris(v, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 2, P.ground.cols, big ? 1.4 : 1)
        smoke(v, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 1, false, 7)
      }
      break
    }
    case 'blizzard':
      v.emitter(0.9, (dt, k) => {
        for (let i = 0; i < Math.round(110 * dt); i++) {
          const a = rnd(0, Math.PI * 2), d = rnd(0.2, r)
          v.burst(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.65 - 0.4, {
            n: 1, dir: a + Math.PI / 2, spread: 0.2, speed: 5 + k * 2, cols: P.ice.cols, shape: i % 2 ? 'flake' : 'streak', s0: 2.4, s1: 0.8, life: 0.5, drag: 0.5,
          })
        }
      })
      v.decal(x, y + 0.3, r * 0.9, 'frost', 5)
      v.ring(x, y, r, '#a8e0f8', 0.7, 6)
      break
    case 'discharge':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + rnd(-0.2, 0.2)
        v.bolt(x, y - 0.4, x + Math.cos(a) * r, y - 0.2 + Math.sin(a) * r * 0.65, { w: 1.6, jag: 6, branches: 1, life: 0.3 })
      }
      v.glow(x, y - 0.3, 40, '#f8e048', 0.35)
      v.ring(x, y, r, '#f8e048', 0.4, 4)
      break
    case 'voice':
      for (let i = 0; i < 4; i++) v.emitter(0.12 * (i + 1), (_dt, k) => { if (k > 0.9) v.ring(x, y - 0.3, r, i % 2 ? '#ffffff' : '#e8d8b0', 0.45, 5) })
      v.burst(x, y - 0.5, { n: 10, speed: 4, cols: ['#ffffff', '#e8d8b0'], shape: 'note', s0: 2.6, s1: 2, life: 0.7, grav: -2 })
      break
    case 'bugbuzz':
      for (let i = 0; i < 3; i++) v.emitter(0.1 * (i + 1), (_dt, k) => { if (k > 0.9) v.ring(x, y - 0.2, r, '#a8b820', 0.45, 4) })
      v.burst(x, y - 0.4, { n: 18, speed: 5, cols: P.bug.cols, shape: 'streak', s0: 1.6, s1: 0.4, life: 0.4 })
      break
    case 'psychic':
      v.emitter(0.7, (_dt, k) => {
        if (Math.random() < 0.6) v.ring(x, y - 0.3, r * (0.3 + k * 0.7), ['#f878b8', '#b080f0', '#ffd0e8'][Math.floor(Math.random() * 3)], 0.3, 3)
      })
      v.glow(x, y - 0.4, 44, '#f878b8', 0.5)
      v.burst(x, y - 0.4, { n: 20, speed: r * 2.5, cols: P.psychic.cols, shape: 'glow', add: true, s0: 3, s1: 0.5, life: 0.5 })
      break
    case 'shadowforce':
    case 'nightdaze': {
      const dark = mv.fx === 'shadowforce'
      // Implode first, then blow out
      v.burst(x, y - 0.4, { n: 24, speed: 0.1, cols: dark ? P.ghost.cols : P.dark.cols, shape: dark ? 'glow' : 'smoke', add: dark, s0: 4, s1: 1, life: 0.25 })
      v.emitter(0.18, (_dt, k) => {
        if (k < 0.9) return
        v.ring(x, y, r, dark ? '#7858a8' : '#c05048', 0.55, 9)
        v.ring(x, y, r * 0.7, '#201418', 0.5, 6)
        v.burst(x, y - 0.3, { n: 30, speed: r * 3.2, cols: dark ? P.ghost.cols : P.dark.cols, shape: dark ? 'glow' : 'smoke', add: dark, s0: 5, s1: 2, life: 0.7, flat: 0.65 })
        v.decal(x, y + 0.3, r * 0.6, 'scorch', 4)
        v.shakeBy(6)
      })
      break
    }
    default:
      shockwave(v, mv.fx, x, y, r, big)
      spray(v, mv.fx, x, y - 0.3, big ? 26 : 14, r * 2.5)
  }
  void p
}

// ---------------- Targeted (nova) impacts ----------------

export function onImpact(v: Vfx, mv: Move, x: number, y: number, r: number) {
  const big = mv.tier >= 3
  switch (mv.fx) {
    case 'thunder':
      v.bolt(x, y - 14, x, y - 0.3, { w: 4.5, jag: 14, branches: 5, strands: 3, life: 0.5 })
      v.bolt(x + rnd(-1, 1), y - 14, x + rnd(-1.5, 1.5), y, { w: 2, jag: 10, branches: 2, life: 0.35 })
      v.flash(0.8)
      v.shakeBy(9)
      v.glow(x, y, 70, '#fff8a0', 0.6)
      v.ring(x, y, r * 1.3, '#f8e048', 0.6, 8)
      v.decal(x, y + 0.2, r * 0.8, 'scorch', 5)
      v.burst(x, y - 0.2, { n: 34, speed: 9, cols: P.electric.cols, shape: 'streak', add: true, s0: 2.6, s1: 0.5, life: 0.5 })
      debris(v, x, y, 6, P.ground.cols)
      break
    case 'fireblast': {
      // 大: five flame arms
      const arms = [-Math.PI / 2, Math.PI / 2 + 0.65, Math.PI / 2 - 0.65, Math.PI, 0]
      for (const a of arms)
        v.burst(x, y - 0.3, { n: 16, dir: a, spread: 0.1, speed: r * 5, cols: P.fire.cols, shape: 'flame', add: true, s0: 4, s1: 7, life: 0.55, drag: 2.5, grav: -1, flat: 0.8 })
      v.burst(x, y - 0.3, { n: 20, speed: 3, cols: P.fire.cols, shape: 'flame', add: true, s0: 5, s1: 9, life: 0.7, grav: -3 })
      v.glow(x, y, 64, '#f87820', 0.7)
      v.ring(x, y, r * 1.4, '#f87820', 0.55, 8)
      v.flash(0.4, '255,200,140')
      v.shakeBy(9)
      smoke(v, x, y - 0.3, 10, true, 9)
      v.decal(x, y + 0.2, r, 'scorch', 6)
      v.emitter(1.2, (dt) => { if (Math.random() < dt * 20) v.burst(x + rnd(-r, r) * 0.6, y + rnd(-0.5, 0.5), { n: 1, speed: 1, cols: P.fire.cols, shape: 'flame', add: true, s0: 2, s1: 0.5, life: 0.6, grav: -4 }) })
      break
    }
    case 'dracometeor':
    case 'meteormash': {
      const p = pal(mv.fx)
      v.glow(x, y, 50, p.glow, 0.6)
      v.ring(x, y, r * 1.5, p.glow, 0.55, 7)
      v.ring(x, y, r, '#ffffff', 0.35, 3)
      v.burst(x, y - 0.2, { n: 24, speed: 7, cols: p.cols, shape: mv.fx === 'dracometeor' ? 'flame' : 'star', add: true, s0: 4, s1: 1, life: 0.6, flat: 0.7 })
      debris(v, x, y, 8, P.rock.cols.slice(1), 1.3)
      smoke(v, x, y, 6, true, 8)
      v.decal(x, y + 0.2, r * 0.9, 'crater', 6)
      v.shakeBy(8)
      v.flash(0.25, mv.fx === 'dracometeor' ? '200,170,255' : '255,255,255')
      break
    }
    case 'earthpower':
      v.decal(x, y + 0.2, r, 'crack', 5)
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, d = r * rnd(0.2, 0.7)
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.6
        v.pillar(px, py, rnd(10, 18), 3, '#f8a040', '#d05818', 0.6, i * 0.03)
        v.burst(px, py - 0.3, { n: 5, dir: -Math.PI / 2, spread: 0.4, speed: 8, cols: P.fire.cols, shape: 'flame', add: true, s0: 3, s1: 0.8, life: 0.5, grav: 12 })
      }
      v.glow(x, y, 46, '#f8a040', 0.5)
      debris(v, x, y, 8, P.ground.cols)
      v.shakeBy(6)
      break
    case 'rocktomb':
    case 'stoneedge': {
      const edge = mv.fx === 'stoneedge'
      const n = edge ? 8 : 5
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3, d = r * (edge ? rnd(0.3, 0.8) : 0.55)
        v.pillar(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, edge ? rnd(18, 28) : rnd(12, 16), edge ? 4 : 6, edge ? '#b8c0d8' : '#c8b070', edge ? '#7880a0' : '#8a7038', 1, i * 0.035)
      }
      v.emitter(1, (_dt, k) => { if (k > 0.95) debris(v, x, y, 10, P.rock.cols.slice(1)) })
      smoke(v, x, y, 6, false, 8)
      v.shakeBy(big ? 8 : 5)
      break
    }
    case 'hurricane':
      v.emitter(1.1, (dt, k) => {
        for (let i = 0; i < Math.round(90 * dt); i++) {
          const h = rnd(0, 2.6)
          const rad = 0.3 + h * 0.5
          const a = rnd(0, Math.PI * 2)
          v.burst(x + Math.cos(a) * rad, y - h + Math.sin(a) * rad * 0.3, {
            n: 1, dir: a + Math.PI / 2, spread: 0.05, speed: 8, cols: P.wind.cols, shape: 'streak', s0: 1.4, s1: 0.4, life: 0.25, drag: 0,
          })
        }
        if (Math.random() < 0.3) debris(v, x + rnd(-r, r) * 0.5, y, 1, ['#78c860', '#a07838'], 0.8)
        void k
      })
      v.ring(x, y, r * 1.2, '#e0e8ff', 0.8, 5)
      v.shakeBy(4)
      break
    case 'sludgebomb':
      v.burst(x, y - 0.2, { n: 26, speed: 6, cols: P.poison.cols, shape: 'bubble', s0: 3.2, s1: 1.2, life: 0.7, vz: 6, zgrav: 25, flat: 0.7 })
      v.ring(x, y, r, '#a040a0', 0.5, 6)
      v.decal(x, y + 0.2, r * 0.9, 'slime', 6)
      smoke(v, x, y, 4, true, 6)
      break
    case 'psyshock':
      v.glow(x, y - 0.3, 44, '#f878b8', 0.6)
      v.ring(x, y, r * 1.2, '#f878b8', 0.5, 6)
      v.burst(x, y - 0.4, { n: 22, speed: 6, cols: P.psychic.cols, shape: 'glow', add: true, s0: 4, s1: 0.8, life: 0.5 })
      v.burst(x, y - 0.4, { n: 6, speed: 2, cols: P.psychic.cols, shape: 'ring', add: true, s0: 3, s1: 14, life: 0.5 })
      break
    case 'focusblast':
      v.glow(x, y - 0.3, 60, '#f88030', 0.7)
      v.ring(x, y, r * 1.4, '#f88030', 0.55, 8)
      v.ring(x, y, r * 0.8, '#78a8ff', 0.45, 4)
      v.burst(x, y - 0.3, { n: 28, speed: 8, cols: P.focus.cols, shape: 'glow', add: true, s0: 5, s1: 1, life: 0.55 })
      v.decal(x, y + 0.2, r * 0.8, 'crater', 5)
      smoke(v, x, y, 6, false, 8)
      v.shakeBy(8)
      v.flash(0.3, '255,210,160')
      break
    default:
      shockwave(v, mv.fx, x, y, r, big)
      spray(v, mv.fx, x, y - 0.3, 18, 5)
  }
}

// ---------------- Melee ----------------

export function onMelee(v: Vfx, mv: Move, x: number, y: number, ax: number, ay: number, hit: boolean) {
  const p = pal(mv.fx)
  const a = Math.atan2(ay, ax)
  v.glow(x, y, hit ? 18 : 10, p.glow, 0.2)
  switch (mv.fx) {
    case 'whip':
      v.burst(x, y, { n: hit ? 14 : 7, dir: a, spread: 0.9, speed: 5, cols: P.grass.cols, shape: 'leaf', s0: 2.8, s1: 1.6, life: 0.7, grav: 2 })
      v.burst(x, y, { n: 6, speed: 6, cols: ['#ffffff', '#d8f8a0'], shape: 'streak', add: true, s0: 2, s1: 0.5, life: 0.2 })
      break
    case 'dragonclaw':
    case 'metalclaw':
      v.burst(x, y, { n: hit ? 12 : 6, dir: a + 0.8, spread: 0.3, speed: 6, cols: p.cols, shape: 'streak', add: true, s0: 2, s1: 0.5, life: 0.3 })
      break
    case 'bite':
    case 'bugbite':
      v.burst(x, y, { n: hit ? 8 : 3, speed: 3, cols: ['#ffffff', '#f0f0f0'], shape: 'shard', s0: 2, s1: 0.8, life: 0.35 })
      break
    case 'lick':
      v.burst(x, y, { n: 6, speed: 2, cols: P.ghost.cols, shape: 'glow', add: true, s0: 3, s1: 0.5, life: 0.5, grav: -2 })
      break
    default:
      // Tackle / Low Kick: big impact star and dust
      v.burst(x, y, { n: hit ? 10 : 4, speed: 5, cols: ['#ffffff', '#fff0c0'], shape: 'streak', add: true, s0: 2, s1: 0.5, life: 0.25 })
      smoke(v, x, y + 0.35, 2, false, 4)
  }
  if (hit) v.ring(x, y + 0.2, 0.9, p.glow, 0.25, 3)
}

// ---------------- Dash ----------------

export function dashTick(v: Vfx, fx: MoveFx, x: number, y: number, vx: number, vy: number) {
  const back = Math.atan2(-vy, -vx)
  const p = pal(fx)
  switch (fx) {
    case 'flamewheel':
      for (let i = 0; i < 3; i++) {
        const a = rnd(0, Math.PI * 2)
        v.burst(x + Math.cos(a) * 0.65, y + Math.sin(a) * 0.55, { n: 1, dir: back, spread: 0.6, speed: 2, cols: P.fire.cols, shape: 'flame', add: true, s0: 3.5, s1: 1, life: 0.4, grav: -3 })
      }
      v.decal(x, y + 0.45, 0.35, 'scorch', 2.5)
      break
    case 'aquajet':
      v.burst(x, y, { n: 4, dir: back, spread: 0.7, speed: 4, cols: P.water.cols, shape: 'drop', s0: 2.4, s1: 1, life: 0.45, grav: 10 })
      break
    case 'spark':
      v.burst(x, y, { n: 3, speed: 6, cols: P.electric.cols, shape: 'streak', add: true, s0: 2, s1: 0.5, life: 0.2 })
      if (Math.random() < 0.4) v.bolt(x, y, x + rnd(-0.9, 0.9), y + rnd(-0.9, 0.6), { w: 1.2, jag: 3, branches: 0, life: 0.1 })
      break
    case 'aerialace':
      v.burst(x, y, { n: 3, dir: back, spread: 0.15, speed: 9, cols: P.wind.cols, shape: 'streak', s0: 1.6, s1: 0.4, life: 0.2 })
      break
    case 'closecombat':
      if (Math.random() < 0.6) v.burst(x + rnd(-0.6, 0.6), y + rnd(-0.6, 0.3), { n: 1, speed: 0.5, cols: P.fist.cols, shape: 'star', s0: 4, s1: 1, life: 0.2 })
      smoke(v, x, y + 0.4, 1, false, 3)
      break
    case 'shadowsneak':
      v.burst(x, y, { n: 3, dir: back, spread: 0.5, speed: 1.5, cols: P.ghost.cols, shape: 'glow', add: true, s0: 5, s1: 1, life: 0.45 })
      break
    default:
      v.burst(x, y, { n: 2, dir: back, speed: 2, cols: p.cols, shape: p.shape, add: p.add, s0: 2, s1: 0.5, life: 0.3 })
  }
}

// ---------------- Being hit ----------------

export function onHit(v: Vfx, mv: Move, tgt: Mon, eff: number, near: boolean) {
  const p = pal(mv.fx)
  tgt.tintCol = p.glow
  tgt.tintT = 0.35
  tgt.joltT = mv.tier >= 2 || eff > 1 ? 0.22 : 0.12
  if (mv.fx === 'psychic' || mv.fx === 'psyshock' || mv.fx === 'psybeam') tgt.liftT = 0.5
  if (!near) return
  const x = tgt.x, y = tgt.y - 0.5
  // White impact star
  v.burst(x, y, { n: eff > 1 ? 10 : 6, speed: eff > 1 ? 7 : 5, cols: ['#ffffff', p.cols[1]], shape: 'streak', add: true, s0: 2.2, s1: 0.5, life: 0.25 })
  v.glow(x, y, eff > 1 ? 22 : 14, '#ffffff', 0.15)
  if (eff > 1) v.ring(x, y + 0.3, 1.1, '#ffd040', 0.35, 3)
}

// ---------------- Drawing helpers used by the renderer ----------------

export function drawProjectile(ctx: CanvasRenderingContext2D, fx: MoveFx, px: number, py: number, vx: number, vy: number, time: number, seed: number) {
  const a = Math.atan2(vy, vx)
  const p = pal(fx)
  const flick = Math.sin(time * 40 + seed) * 0.5 + 0.5
  switch (fx) {
    case 'ember':
    case 'dragonrage': {
      drawGlow(ctx, px, py, 16, p.glow, 0.6)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 4; i >= 0; i--)
        disc(ctx, px - Math.cos(a) * i * 2 + rnd(-0.7, 0.7), py - Math.sin(a) * i * 2 + rnd(-0.7, 0.7), 5.5 - i * 0.9 + flick * 0.8, p.cols[Math.min(4, i)])
      ctx.globalCompositeOperation = 'source-over'
      disc(ctx, px, py, 2.4, '#ffffff')
      break
    }
    case 'water':
    case 'mud': {
      drawGlow(ctx, px, py, 9, p.glow, 0.35)
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.fillStyle = '#282830'
      ctx.beginPath()
      ctx.ellipse(-1.5, 0, 8, 4.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = p.cols[2]
      ctx.beginPath()
      ctx.ellipse(-1.5, 0, 7, 3.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = p.cols[1]
      ctx.fillRect(0, -2.4, 4, 1.6)
      ctx.restore()
      break
    }
    case 'leaf':
      drawShape(ctx, 'leaf', px, py, 4.2, '#68c048', time * 22 + seed)
      drawShape(ctx, 'leaf', px, py, 2.6, '#a8e878', time * 22 + seed)
      break
    case 'energy': {
      const r = 6.5 + flick * 1.2
      drawGlow(ctx, px, py, r + 12, '#a8f070', 0.7)
      disc(ctx, px, py, r, '#2c7a30')
      disc(ctx, px, py, r - 1.3, '#58b840')
      disc(ctx, px, py, r - 3, '#b8f088')
      disc(ctx, px - 2, py - 2, 1.8, '#ffffff')
      break
    }
    case 'ice': {
      drawGlow(ctx, px, py, 12, '#a8e0f8', 0.5)
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.fillStyle = '#78c8e8'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(9, 0)
      ctx.lineTo(0, -3.2)
      ctx.lineTo(-8, 0)
      ctx.lineTo(0, 3.2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#e8faff'
      ctx.fillRect(-2, -1.2, 7, 1.2)
      ctx.restore()
      break
    }
    case 'snow':
      drawGlow(ctx, px, py, 10, '#c8f0ff', 0.6)
      drawShape(ctx, 'flake', px, py, 4.5, '#ffffff', time * 6 + seed)
      break
    case 'aura': {
      drawGlow(ctx, px, py, 22, '#4878f8', 0.8)
      disc(ctx, px, py, 7, '#3860e0')
      disc(ctx, px, py, 5.4, '#a8d0ff')
      disc(ctx, px, py, 3, '#ffffff')
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.2
      for (let i = 0; i < 2; i++) {
        ctx.beginPath()
        ctx.ellipse(px, py, 10, 4, time * 6 + i * 1.6, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'sting':
    case 'pin': {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.fillStyle = '#282830'
      ctx.fillRect(-7, -1.6, 13, 3.2)
      ctx.fillStyle = fx === 'sting' ? '#c070d8' : '#d8e860'
      ctx.fillRect(-6, -0.9, 11, 1.8)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(3, -0.5, 3.5, 1)
      ctx.restore()
      break
    }
    case 'poison':
      drawGlow(ctx, px, py, 11, '#c060d0', 0.4)
      disc(ctx, px, py, 6, '#4a1858')
      disc(ctx, px, py, 5, '#a040a0')
      disc(ctx, px - 1.5, py - 1.8, 1.8, '#f0c0ff')
      break
    case 'wind': {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a)
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 2.6
      ctx.beginPath()
      ctx.arc(-4, 0, 8, -1.15, 1.15)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(200,210,248,0.85)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(-8, 0, 7, -1, 1)
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'psy':
      drawGlow(ctx, px, py, 14, '#f878b8', 0.5)
      ctx.lineWidth = 1.6
      for (let i = 0; i < 3; i++) {
        const r = ((time * 20 + i * 4) % 12) + 1
        ctx.strokeStyle = i % 2 ? '#f878b8' : '#ffd0e8'
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    case 'rock':
      drawShape(ctx, 'rock', px, py, 6, '#b8a038', time * 8 + seed)
      break
    case 'shadowball': {
      drawGlow(ctx, px, py, 24, '#7050c0', 0.8)
      disc(ctx, px, py, 8, '#201828')
      disc(ctx, px, py, 6.5, '#583c88')
      disc(ctx, px, py, 3.8, '#100c18')
      ctx.strokeStyle = '#c0a0f0'
      ctx.lineWidth = 1.2
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(px, py, 9 + i, time * 9 + seed + i * 2, time * 9 + seed + i * 2 + 1.2)
        ctx.stroke()
      }
      break
    }
    case 'darkpulse':
      drawGlow(ctx, px, py, 14, '#c05048', 0.35)
      ctx.lineWidth = 3
      ctx.strokeStyle = '#201418'
      ctx.beginPath()
      ctx.arc(px, py, 6.5 + flick, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1.4
      ctx.strokeStyle = '#e06058'
      ctx.stroke()
      disc(ctx, px, py, 2.4, '#603838')
      break
    case 'mirror':
      drawGlow(ctx, px, py, 16, '#ffffff', 0.6)
      disc(ctx, px, py, 5.5, '#9090b0')
      disc(ctx, px, py, 4.2, '#f0f0ff')
      star(ctx, px, py, 11, 1.8, time * 5, 4)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      break
    case 'star':
      drawGlow(ctx, px, py, 13, '#f8e048', 0.6)
      star(ctx, px, py, 7, 3, time * 10 + seed)
      ctx.fillStyle = '#f8d030'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.stroke()
      break
    default:
      drawGlow(ctx, px, py, 10, p.glow, 0.5)
      disc(ctx, px, py, 4, '#282830')
      disc(ctx, px, py, 3.2, p.cols[1])
  }
}

/** Telegraph circle plus whatever is incoming: lobbed orbs, meteors, storm clouds. */
export function drawIncoming(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, r: number, k: number, col: string, time: number, sx: number, sy: number) {
  // Danger zone
  ctx.globalAlpha = 0.14 + k * 0.32
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.ellipse(x, y, r * (0.25 + 0.75 * k), r * (0.25 + 0.75 * k) * 0.62, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.6 + Math.sin(time * 25) * 0.3
  ctx.strokeStyle = col
  ctx.lineWidth = 1.6
  ctx.setLineDash([5, 3])
  ctx.lineDashOffset = -time * 30
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  const lob = (size: number, draw: (bx: number, by: number) => void) => {
    // Arc from the caster to the target
    const bx = sx + (x - sx) * k
    const by = sy + (y - 6 - sy) * k - Math.sin(k * Math.PI) * 40 + 6 * k
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(sx + (x - sx) * k, sy + 8 + (y - sy - 8) * k, size, size * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
    draw(bx, by)
  }
  const meteor = (c1: string, c2: string, glow: string, size: number, ox = 0, delay = 0) => {
    const kk = Math.max(0, (k - delay) / (1 - delay))
    if (kk <= 0) return
    const mx = x + ox + 90 * (1 - kk), my = y - 200 * (1 - kk)
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = glow + '88'
    ctx.lineCap = 'round'
    ctx.lineWidth = size * 1.8
    ctx.beginPath()
    ctx.moveTo(mx + 40, my - 90)
    ctx.lineTo(mx, my)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    drawGlow(ctx, mx, my, size * 4, glow, 0.8)
    disc(ctx, mx, my, size + 1.2, '#282830')
    disc(ctx, mx, my, size, c1)
    disc(ctx, mx - size * 0.3, my - size * 0.3, size * 0.45, c2)
  }

  switch (fx) {
    case 'fireblast':
      lob(6, (bx, by) => {
        drawGlow(ctx, bx, by, 26, '#f87820', 0.8)
        ctx.globalCompositeOperation = 'lighter'
        for (let i = 0; i < 6; i++) disc(ctx, bx + rnd(-3, 3), by + rnd(-3, 3), rnd(4, 7), pal('fireblast').cols[i % 4])
        ctx.globalCompositeOperation = 'source-over'
        disc(ctx, bx, by, 3.5, '#ffffff')
      })
      break
    case 'focusblast':
      lob(6, (bx, by) => {
        drawGlow(ctx, bx, by, 26, '#f88030', 0.8)
        disc(ctx, bx, by, 8, '#c04010')
        disc(ctx, bx, by, 6.5, '#f8a040')
        disc(ctx, bx, by, 3.5, '#fff8e0')
        ctx.strokeStyle = '#78a8ff'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(bx, by, 10, time * 10, time * 10 + 2.5)
        ctx.stroke()
      })
      break
    case 'sludgebomb':
      lob(5, (bx, by) => {
        drawGlow(ctx, bx, by, 14, '#c060d0', 0.5)
        disc(ctx, bx, by, 7, '#4a1858')
        disc(ctx, bx, by, 6, '#a040a0')
        disc(ctx, bx - 2, by - 2, 2.2, '#f0c0ff')
      })
      break
    case 'dracometeor':
      meteor('#7038f8', '#e8d8ff', '#8050f8', 7)
      break
    case 'meteormash':
      meteor('#a8a8c8', '#ffffff', '#e0e0f8', 7)
      break
    case 'thunder': {
      // A dark storm cloud gathers above the target
      const cy = y - 120
      ctx.globalAlpha = Math.min(1, k * 2) * 0.85
      for (let i = 0; i < 6; i++) disc(ctx, x + (i - 2.5) * 11, cy + Math.sin(i * 1.7) * 5, 13 + (i % 2) * 4, '#383848')
      for (let i = 0; i < 4; i++) disc(ctx, x + (i - 1.5) * 12, cy - 6, 10, '#505868')
      ctx.globalAlpha = 1
      if (k > 0.4 && Math.random() < 0.25) lightning(ctx, x + rnd(-25, 25), cy + 8, x + rnd(-30, 30), cy + rnd(25, 50), 1, 4)
      // Light shaft
      ctx.globalAlpha = k * 0.25
      ctx.fillStyle = '#fff8a0'
      ctx.fillRect(x - r * 0.3, cy, r * 0.6, y - cy)
      ctx.globalAlpha = 1
      break
    }
    case 'earthpower':
      ctx.globalAlpha = k * 0.7
      drawGlow(ctx, x, y, r * (0.5 + k * 0.6), '#f8a040', 0.8)
      ctx.globalAlpha = 1
      break
    case 'psyshock':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + time * 5
        const d = r * (1.5 - k * 1.2)
        drawGlow(ctx, x + Math.cos(a) * d, y - 6 + Math.sin(a) * d * 0.62, 9, '#f878b8', 0.8)
        disc(ctx, x + Math.cos(a) * d, y - 6 + Math.sin(a) * d * 0.62, 2, '#ffffff')
      }
      break
    case 'hurricane':
      ctx.strokeStyle = 'rgba(230,236,255,0.7)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.ellipse(x, y - i * 4, r * (1 - k * 0.6) + i * 3, (r * (1 - k * 0.6) + i * 3) * 0.35, 0, time * 10 + i, time * 10 + i + 3)
        ctx.stroke()
      }
      break
    case 'stoneedge':
    case 'rocktomb':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + time * 3
        drawShape(ctx, 'rock', x + Math.cos(a) * r * 0.9, y - 10 - k * 6 + Math.sin(a) * r * 0.3, 3.5, '#b8a038', time * 5 + i)
      }
      break
  }
}

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
      const col = fx === 'dragonclaw' ? '#a080ff' : '#e8e8f8'
      const grow = Math.min(1, k * 5)
      ctx.rotate(a + 0.8)
      drawGlow(ctx, 0, 0, 22, fx === 'dragonclaw' ? '#8050f8' : '#ffffff', 0.5 * fade)
      for (let i = -1; i <= 1; i++) {
        ctx.strokeStyle = '#282830'
        ctx.lineWidth = 4.5
        ctx.beginPath()
        ctx.moveTo(i * 5, -13)
        ctx.lineTo(i * 5, -13 + 26 * grow)
        ctx.stroke()
        ctx.strokeStyle = col
        ctx.lineWidth = 2.8
        ctx.stroke()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      break
    }
    case 'bite':
    case 'bugbite': {
      const close = Math.min(1, k * 3.5)
      const off = 13 * (1 - close)
      ctx.rotate(a)
      if (close >= 1) drawGlow(ctx, 0, 0, 20, '#ffffff', 0.5 * fade)
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = fx === 'bugbite' ? '#708010' : '#282830'
      ctx.lineWidth = 1.2
      for (const side of [-1, 1]) {
        ctx.beginPath()
        for (let i = 0; i < 5; i++) {
          const px = -12 + i * 5
          ctx.moveTo(px, side * (off + 1.5))
          ctx.lineTo(px + 2.5, side * (off - 5))
          ctx.lineTo(px + 5, side * (off + 1.5))
        }
        ctx.fill()
        ctx.stroke()
      }
      break
    }
    case 'whip': {
      ctx.rotate(a)
      // Two vines lash out from the caster and crack on the target
      const reach = Math.min(1, k * 4)
      for (const sd of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(-34, sd * 6)
        ctx.bezierCurveTo(-20, sd * (26 - k * 30), -4 + 10 * reach, sd * (-18 + k * 20), 16 * reach, sd * 3)
        ctx.strokeStyle = '#1c5a20'
        ctx.lineWidth = 5
        ctx.stroke()
        ctx.strokeStyle = '#58b840'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.strokeStyle = '#b8f088'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      drawGlow(ctx, 16 * reach, 0, 18, '#a8f070', 0.5 * fade)
      if (k > 0.2 && k < 0.6) {
        star(ctx, 16, 0, 12, 4, 0, 6)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
      }
      break
    }
    case 'lick': {
      ctx.rotate(a)
      drawGlow(ctx, 0, 0, 16, '#9070d0', 0.4 * fade)
      ctx.fillStyle = '#f080b0'
      ctx.beginPath()
      ctx.ellipse(-2 + k * 8, 0, 12, 5, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#a04070'
      ctx.lineWidth = 1.2
      ctx.stroke()
      break
    }
    default: {
      // Tackle / Low Kick: big comic impact star
      const s = 9 + Math.min(1, k * 4) * 9
      drawGlow(ctx, 0, 0, s * 1.8, '#ffffff', 0.6 * fade)
      star(ctx, 0, 0, s, s * 0.42, a, 7)
      ctx.fillStyle = fx === 'kick' ? '#ffc860' : '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#282830'
      ctx.lineWidth = 1.4
      ctx.stroke()
      star(ctx, 0, 0, s * 0.5, s * 0.22, a + 0.3, 7)
      ctx.fillStyle = fx === 'kick' ? '#ffffff' : '#fff0c0'
      ctx.fill()
    }
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Aura drawn around a dashing Pokémon. */
export function drawDashAura(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, vx: number, vy: number, time: number) {
  const a = Math.atan2(vy, vx)
  switch (fx) {
    case 'flamewheel':
      drawGlow(ctx, x, y, 26, '#f87820', 0.7)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2 + time * 18
        disc(ctx, x + Math.cos(t) * 13, y + Math.sin(t) * 11, 4.5 - (i % 3), P.fire.cols[i % 4])
      }
      ctx.globalCompositeOperation = 'source-over'
      break
    case 'aquajet':
      drawGlow(ctx, x, y, 20, '#68a8f8', 0.6)
      ctx.strokeStyle = 'rgba(104,168,248,0.9)'
      ctx.lineWidth = 4
      ctx.beginPath()
      for (let s = 0; s < 40; s += 2) ctx.lineTo(x - Math.cos(a) * s + Math.sin(s * 0.5 + time * 30) * 4, y - Math.sin(a) * s + Math.cos(s * 0.5 + time * 30) * 2)
      ctx.stroke()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      break
    case 'spark':
      drawGlow(ctx, x, y, 24, '#f8e048', 0.7)
      for (let i = 0; i < 3; i++) {
        const t = Math.random() * Math.PI * 2
        lightning(ctx, x, y, x + Math.cos(t) * 16, y + Math.sin(t) * 13, 1.3, 3)
      }
      break
    case 'aerialace':
      drawGlow(ctx, x, y, 16, '#ffffff', 0.5)
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1.6
      for (let i = -2; i <= 2; i++) {
        const ox = -Math.sin(a) * i * 5, oy = Math.cos(a) * i * 5
        ctx.beginPath()
        ctx.moveTo(x + ox - Math.cos(a) * 10, y + oy - Math.sin(a) * 10)
        ctx.lineTo(x + ox - Math.cos(a) * (28 + Math.abs(i) * -4), y + oy - Math.sin(a) * (28 + Math.abs(i) * -4))
        ctx.stroke()
      }
      break
    case 'closecombat':
      drawGlow(ctx, x, y, 18, '#ffe0a0', 0.5)
      break
    case 'shadowsneak':
      ctx.fillStyle = 'rgba(40,24,56,0.6)'
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath()
        ctx.ellipse(x - Math.cos(a) * i * 7, y + 8 - Math.sin(a) * i * 7, 10 - i, 5 - i * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      drawGlow(ctx, x, y, 18, '#7050c0', 0.6)
      break
  }
}

/** Energy gathering around a Pokémon charging a big move. */
export function drawCharge(ctx: CanvasRenderingContext2D, fx: MoveFx, x: number, y: number, k: number, time: number) {
  const p = pal(fx)
  drawGlow(ctx, x, y, 10 + k * 26, p.glow, 0.45 + k * 0.4)
  drawGlow(ctx, x, y, 4 + k * 9, '#ffffff', 0.5 + k * 0.5)
  ctx.strokeStyle = p.cols[1]
  ctx.lineWidth = 1.2
  ctx.globalAlpha = 0.8
  for (let i = 0; i < 3; i++) {
    const rr = 26 * (1 - ((k * 2 + i / 3) % 1))
    ctx.beginPath()
    ctx.ellipse(x, y, rr, rr * 0.7, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  void time
}
