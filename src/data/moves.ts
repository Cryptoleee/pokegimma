import type { PType } from './types'

/** How a move behaves in real time. */
export type MoveKind = 'melee' | 'bolt' | 'spread' | 'dash' | 'beam' | 'burst' | 'nova' | 'zap'

/** Which visual effect a move uses. Every move has its own look. */
export type MoveFx =
  // projectiles
  | 'ember' | 'water' | 'leaf' | 'energy' | 'ice' | 'snow' | 'aura' | 'poison' | 'mud' | 'wind' | 'psy'
  | 'pin' | 'rock' | 'shadowball' | 'dragonrage' | 'darkpulse' | 'mirror' | 'star' | 'sting'
  // melee
  | 'tackle' | 'whip' | 'kick' | 'bite' | 'claw' | 'dragonclaw' | 'metalclaw' | 'lick' | 'bugbite'
  // dash
  | 'flamewheel' | 'aquajet' | 'spark' | 'aerialace' | 'closecombat' | 'shadowsneak'
  // beams
  | 'flamethrower' | 'hydropump' | 'solarbeam' | 'icebeam' | 'psybeam' | 'hyperbeam' | 'dragonpulse'
  | 'flashcannon' | 'signalbeam' | 'gunkshot'
  // bursts
  | 'discharge' | 'surf' | 'quake' | 'blizzard' | 'voice' | 'bugbuzz' | 'psychic' | 'shadowforce' | 'nightdaze'
  // novas
  | 'thunder' | 'fireblast' | 'dracometeor' | 'earthpower' | 'stoneedge' | 'rocktomb' | 'hurricane'
  | 'sludgebomb' | 'psyshock' | 'focusblast' | 'meteormash'
  // zaps
  | 'thundershock' | 'thunderbolt'

export interface Move {
  name: string
  type: PType
  kind: MoveKind
  fx: MoveFx
  power: number
  cooldown: number
  /** Auto-aim range in tiles. */
  range: number
  tier: number
  /** Wind-up before the move fires (s). */
  charge: number
}

/** Level a move slot unlocks at. Survive longer, unlock more. */
export const SLOT_UNLOCK = [1, 8, 16, 25]

const TIER_POWER = [40, 62, 85, 120]
const TIER_CD = [0.55, 2.4, 4.2, 9]

const RANGE: Record<MoveKind, number> = {
  melee: 3, dash: 4, bolt: 7, spread: 6, beam: 7, burst: 2.6, nova: 7, zap: 5.5,
}

type Def = [string, MoveKind, MoveFx]

const TABLE: Record<PType, Def[]> = {
  normal: [['Tackle', 'melee', 'tackle'], ['Swift', 'spread', 'star'], ['Hyper Voice', 'burst', 'voice'], ['Hyper Beam', 'beam', 'hyperbeam']],
  fire: [['Ember', 'bolt', 'ember'], ['Flame Wheel', 'dash', 'flamewheel'], ['Flamethrower', 'beam', 'flamethrower'], ['Fire Blast', 'nova', 'fireblast']],
  water: [['Water Gun', 'bolt', 'water'], ['Aqua Jet', 'dash', 'aquajet'], ['Surf', 'burst', 'surf'], ['Hydro Pump', 'beam', 'hydropump']],
  grass: [['Vine Whip', 'melee', 'whip'], ['Razor Leaf', 'spread', 'leaf'], ['Energy Ball', 'bolt', 'energy'], ['Solar Beam', 'beam', 'solarbeam']],
  electric: [['Thunder Shock', 'zap', 'thundershock'], ['Spark', 'dash', 'spark'], ['Thunderbolt', 'zap', 'thunderbolt'], ['Thunder', 'nova', 'thunder']],
  ice: [['Ice Shard', 'bolt', 'ice'], ['Powder Snow', 'spread', 'snow'], ['Ice Beam', 'beam', 'icebeam'], ['Blizzard', 'burst', 'blizzard']],
  fighting: [['Low Kick', 'melee', 'kick'], ['Aura Sphere', 'bolt', 'aura'], ['Close Combat', 'dash', 'closecombat'], ['Focus Blast', 'nova', 'focusblast']],
  poison: [['Poison Sting', 'bolt', 'sting'], ['Venoshock', 'spread', 'poison'], ['Sludge Bomb', 'nova', 'sludgebomb'], ['Gunk Shot', 'beam', 'gunkshot']],
  ground: [['Mud-Slap', 'bolt', 'mud'], ['Bulldoze', 'burst', 'quake'], ['Earth Power', 'nova', 'earthpower'], ['Earthquake', 'burst', 'quake']],
  flying: [['Gust', 'bolt', 'wind'], ['Aerial Ace', 'dash', 'aerialace'], ['Air Slash', 'spread', 'wind'], ['Hurricane', 'nova', 'hurricane']],
  psychic: [['Confusion', 'bolt', 'psy'], ['Psybeam', 'beam', 'psybeam'], ['Psyshock', 'nova', 'psyshock'], ['Psychic', 'burst', 'psychic']],
  bug: [['Bug Bite', 'melee', 'bugbite'], ['Pin Missile', 'spread', 'pin'], ['Signal Beam', 'beam', 'signalbeam'], ['Bug Buzz', 'burst', 'bugbuzz']],
  rock: [['Rock Throw', 'bolt', 'rock'], ['Rock Slide', 'spread', 'rock'], ['Rock Tomb', 'nova', 'rocktomb'], ['Stone Edge', 'nova', 'stoneedge']],
  ghost: [['Lick', 'melee', 'lick'], ['Shadow Sneak', 'dash', 'shadowsneak'], ['Shadow Ball', 'bolt', 'shadowball'], ['Shadow Force', 'burst', 'shadowforce']],
  dragon: [['Dragon Rage', 'bolt', 'dragonrage'], ['Dragon Claw', 'melee', 'dragonclaw'], ['Dragon Pulse', 'beam', 'dragonpulse'], ['Draco Meteor', 'nova', 'dracometeor']],
  dark: [['Bite', 'melee', 'bite'], ['Snarl', 'spread', 'darkpulse'], ['Dark Pulse', 'bolt', 'darkpulse'], ['Night Daze', 'burst', 'nightdaze']],
  steel: [['Metal Claw', 'melee', 'metalclaw'], ['Mirror Shot', 'bolt', 'mirror'], ['Flash Cannon', 'beam', 'flashcannon'], ['Meteor Mash', 'nova', 'meteormash']],
}

/** Big beams need a moment to charge up, like in the games (and hit a bit harder for it). */
const CHARGE: Partial<Record<MoveFx, number>> = { solarbeam: 1.0, hyperbeam: 0.9, hydropump: 0.7, flashcannon: 0.55, focusblast: 0.55 }
const CHARGE_POWER = 1.15

function make(type: PType, tier: number): Move {
  const [name, kind, fx] = TABLE[type][tier]
  return { name, type, kind, fx, power: Math.round(TIER_POWER[tier] * (CHARGE[fx] ? CHARGE_POWER : 1)), cooldown: TIER_CD[tier], range: RANGE[kind], tier, charge: CHARGE[fx] ?? 0 }
}

/** Four move slots derived from a species' types. Slot 3 borrows the secondary type. */
export function movesetFor(types: PType[]): Move[] {
  const [a, b] = types
  return [make(a, 0), make(a, 1), make(b ?? a, 2), make(a, 3)]
}

const BY_NAME = new Map<string, Move>()
for (const type of Object.keys(TABLE) as PType[]) for (let i = 0; i < 4; i++) {
  const m = make(type, i)
  if (!BY_NAME.has(m.name)) BY_NAME.set(m.name, m)
}

/** Looks a move up by name (used to send moves over the network). */
export function moveByName(name: string): Move {
  return BY_NAME.get(name) ?? make('normal', 0)
}
