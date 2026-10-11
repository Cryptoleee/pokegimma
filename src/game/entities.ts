import { SPECIES, rarityOf, type Rarity, type Species } from '../data/pokemon'
import { movesetFor, SLOT_UNLOCK, type Move } from '../data/moves'
import type { TrainerDef } from '../data/trainers'
import { roleInfo } from '../data/roles'

export type Dir = 'down' | 'up' | 'left' | 'right'

export const LEVEL_CAP = 60
export const xpNeeded = (level: number) => 8 + level * 2 + level * level * 0.05

export function statHp(sp: Species, level: number) {
  return Math.floor(((2 * sp.hp * level) / 100 + level + 10) * 3)
}
export function stat(base: number, level: number) {
  return (2 * base * level) / 100 + 5
}

let nextId = 1

export type WildState = 'roam' | 'aggro' | 'weak'

export interface Dash {
  vx: number
  vy: number
  t: number
  move: Move
  hit: Set<Mon>
  /** Melee lunge: travel to the spot, then strike once on arrival. */
  strike?: boolean
}

/** Manual aim from dragging an attack button: unit direction plus drag strength 0..1. */
export interface AimDir {
  x: number
  y: number
  k: number
}

export class Mon {
  id = nextId++
  species: Species
  level: number
  xp = 0
  hp: number
  shiny: boolean
  moves: Move[]
  cds = [0, 0, 0, 0]
  owner: Trainer | null = null
  rarity: Rarity

  x = 0
  y = 0
  dir: Dir = 'down'
  /** Angle the mon last attacked toward; drives sprite facing. */
  aimX = 0
  aimY = 1
  aimT = 0
  flash = 0
  bob = Math.random() * 10
  dash: Dash | null = null
  evolveFx = 0
  /** Last movement delta, used for facing. */
  mvx = 0
  mvy = 0
  catching = false
  castT = 0
  /** Hit feedback: colour tint, jitter and psychic lift. */
  tintCol = '#ffffff'
  tintT = 0
  joltT = 0
  liftT = 0
  charging: { move: Move; t: number; total: number; tgt: Mon | null; dir?: AimDir } | null = null
  /** Distance (tiles) a targeted move should land at when aimed manually. */
  aimDist: number | null = null
  /** Trailing HP for the white 'damage taken' strip on nameplates. */
  hpLag = -1
  /** >0 = briefly visible even inside tall grass (after attacking or being hit). */
  revealT = 0
  /** Seconds since this Pokémon last dealt or took damage (drives out-of-combat regen). */
  combatT = 0
  lastHitBy: Trainer | null = null

  // Wild behaviour
  state: WildState = 'roam'
  weakT = 0
  aggro: Mon | null = null
  aggroT = 0
  homeX = 0
  homeY = 0
  goalX = 0
  goalY = 0
  thinkT = 0
  aggressive = false
  legendary = false
  /** Raid boss: huge, can't be caught, HP scaled by bossMul. */
  boss = false
  bossMul = 1
  /** Frozen in place (Kyurem's ice) for this many seconds. */
  frozenT = 0
  /** Weakened wild: reserved for this trainer (who knocked it out) for claimT seconds. */
  claim: Trainer | null = null
  claimT = 0

  constructor(id: number, level: number, shiny = false) {
    this.species = SPECIES[id]
    this.level = level
    this.shiny = shiny
    this.moves = movesetFor(this.species.types)
    this.hp = this.maxHp
    this.rarity = rarityOf(id)
    this.legendary = this.rarity === 'legendary'
  }

  get maxHp() {
    if (this.boss) return statHp(this.species, this.level) * this.bossMul
    if (this.legendary && !this.owner) return statHp(this.species, this.level) * 2.2
    // Defenders and all-rounders get a little extra HP
    return Math.round(statHp(this.species, this.level) * roleInfo(this.species.id).hp)
  }
  get atk() {
    return stat(this.species.atk, this.level)
  }
  get def() {
    return stat(this.species.def, this.level)
  }
  get fainted() {
    return this.hp <= 0
  }
  get name() {
    return this.species.name
  }
  unlocked(slot: number) {
    return this.level >= SLOT_UNLOCK[slot]
  }
  /** Scale in world px per sprite px. */
  get scale() {
    return this.boss ? 1.3 : this.legendary ? 0.68 : 0.55
  }
}

export interface BotBrain {
  skill: number
  thinkT: number
  goalX: number
  goalY: number
  target: Mon | null
  lastX: number
  lastY: number
  stuckT: number
  mode: string
  strafe: number
}

export class Trainer {
  id = nextId++
  x = 0
  y = 0
  vx = 0
  vy = 0
  dir: Dir = 'down'
  walkT = 0
  party: Mon[] = []
  active = 0
  alive = true
  masterBalls = 0
  potions = 1
  revives = 0
  kos = 0
  caught = 0
  place = 0
  diedAt = 0
  swapCd = 0
  autoSwapT = 0
  /** Horizontal facing for the (mirrored) battle sprite. */
  faceRight = false
  revealT = 0
  brain: BotBrain | null = null
  /** Played by a person (local or over the network) rather than a bot. */
  human = false
  /** Player id of the human behind this trainer. */
  pid = ''
  /** Host side: moved by a remote player; position arrives over the network. */
  remote = false
  /** Remote player's last input strength (drives the follow behaviour of their Pokémon). */
  netMoving = 0
  regenFxT = 0
  /** Current velocity (tiles/s): momentum on ice. */
  slideX = 0
  slideY = 0
  /** Raid: lives left and seconds until you're back after going down. */
  lives = 0
  respawnT = 0
  /** Raid: total damage dealt to the boss (results screen). */
  bossDmg = 0
  /** Damage dealt to other trainers' Pokémon (scoreboard). */
  dmg = 0
  /** Bots: wait before throwing another ball after a legendary broke free. */
  catchCd = 0
  /** Who this player is watching after being knocked out. */
  spectate: Trainer | null = null
  /** Throw animation (Poké Ball / Master Ball). */
  throwFx: { x: number; y: number; tx: number; ty: number; t: number; master: boolean } | null = null

  constructor(public def: TrainerDef, public name: string, public isPlayer: boolean) {}

  get mon(): Mon {
    return this.party[this.active]
  }

  healthyIndex(): number {
    return this.party.findIndex((m) => !m.fainted)
  }
}
