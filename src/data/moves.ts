import type { PType } from './types'

/** How a move behaves in real time. */
export type MoveKind = 'melee' | 'bolt' | 'spread' | 'dash' | 'beam' | 'burst' | 'nova'

export interface Move {
  name: string
  type: PType
  kind: MoveKind
  power: number
  cooldown: number
  /** Auto-aim range in tiles. */
  range: number
  tier: number
}

/** Level a move slot unlocks at. Survive longer, unlock more. */
export const SLOT_UNLOCK = [1, 8, 16, 25]

const TIER_POWER = [40, 62, 85, 120]
const TIER_CD = [0.55, 2.4, 4.2, 9]

const RANGE: Record<MoveKind, number> = {
  melee: 1.7, dash: 4, bolt: 7, spread: 6, beam: 7, burst: 2.6, nova: 7,
}

const TABLE: Record<PType, [string, MoveKind][]> = {
  normal: [['Tackle', 'melee'], ['Swift', 'spread'], ['Hyper Voice', 'burst'], ['Hyper Beam', 'beam']],
  fire: [['Ember', 'bolt'], ['Flame Wheel', 'dash'], ['Flamethrower', 'beam'], ['Fire Blast', 'nova']],
  water: [['Water Gun', 'bolt'], ['Aqua Jet', 'dash'], ['Surf', 'burst'], ['Hydro Pump', 'beam']],
  grass: [['Vine Whip', 'melee'], ['Razor Leaf', 'spread'], ['Energy Ball', 'bolt'], ['Solar Beam', 'beam']],
  electric: [['Thunder Shock', 'bolt'], ['Spark', 'dash'], ['Discharge', 'burst'], ['Thunder', 'nova']],
  ice: [['Ice Shard', 'bolt'], ['Powder Snow', 'spread'], ['Ice Beam', 'beam'], ['Blizzard', 'burst']],
  fighting: [['Low Kick', 'melee'], ['Aura Sphere', 'bolt'], ['Close Combat', 'dash'], ['Focus Blast', 'nova']],
  poison: [['Poison Sting', 'bolt'], ['Venoshock', 'spread'], ['Sludge Bomb', 'nova'], ['Gunk Shot', 'beam']],
  ground: [['Mud-Slap', 'bolt'], ['Bulldoze', 'burst'], ['Earth Power', 'nova'], ['Earthquake', 'burst']],
  flying: [['Gust', 'bolt'], ['Aerial Ace', 'dash'], ['Air Slash', 'spread'], ['Hurricane', 'nova']],
  psychic: [['Confusion', 'bolt'], ['Psybeam', 'beam'], ['Psyshock', 'nova'], ['Psychic', 'burst']],
  bug: [['Bug Bite', 'melee'], ['Pin Missile', 'spread'], ['Signal Beam', 'beam'], ['Bug Buzz', 'burst']],
  rock: [['Rock Throw', 'bolt'], ['Rock Slide', 'spread'], ['Rock Tomb', 'nova'], ['Stone Edge', 'nova']],
  ghost: [['Lick', 'melee'], ['Shadow Sneak', 'dash'], ['Shadow Ball', 'bolt'], ['Shadow Force', 'burst']],
  dragon: [['Dragon Rage', 'bolt'], ['Dragon Claw', 'melee'], ['Dragon Pulse', 'beam'], ['Draco Meteor', 'nova']],
  dark: [['Bite', 'melee'], ['Snarl', 'spread'], ['Dark Pulse', 'bolt'], ['Night Daze', 'burst']],
  steel: [['Metal Claw', 'melee'], ['Mirror Shot', 'bolt'], ['Flash Cannon', 'beam'], ['Meteor Mash', 'nova']],
}

function make(type: PType, tier: number): Move {
  const [name, kind] = TABLE[type][tier]
  return { name, type, kind, power: TIER_POWER[tier], cooldown: TIER_CD[tier], range: RANGE[kind], tier }
}

/** Four move slots derived from a species' types. Slot 3 borrows the secondary type. */
export function movesetFor(types: PType[]): Move[] {
  const [a, b] = types
  return [make(a, 0), make(a, 1), make(b ?? a, 2), make(a, 3)]
}
