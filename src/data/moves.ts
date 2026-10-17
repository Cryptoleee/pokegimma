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
  /** Unlockable partners: their moves look extra flashy (accent colour). */
  elite?: string
  /** Their own signature ultimate: a name of its own and a much bigger show. */
  sig?: boolean
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

/**
 * Signature ultimates for the unlockable partners (whole evolution line), with
 * an accent colour. Same power as a normal ultimate: the difference is the show.
 */
const SIGNATURE: { ids: number[]; name: string; kind: MoveKind; fx: MoveFx; type: PType; color: string }[] = [
  { ids: [81, 82, 462], name: 'Zap Cannon', kind: 'nova', fx: 'thunder', type: 'electric', color: '#f8e048' },
  { ids: [390, 391, 392], name: 'Flare Blitz', kind: 'dash', fx: 'flamewheel', type: 'fire', color: '#ff7a20' },
  { ids: [138, 139], name: 'Ancient Power', kind: 'nova', fx: 'stoneedge', type: 'rock', color: '#e0b060' },
  { ids: [220, 221, 473], name: 'Avalanche', kind: 'burst', fx: 'blizzard', type: 'ice', color: '#a8e8ff' },
  { ids: [359], name: 'Night Slash', kind: 'dash', fx: 'shadowsneak', type: 'dark', color: '#e04070' },
  { ids: [111, 112, 464], name: 'Rock Wrecker', kind: 'nova', fx: 'rocktomb', type: 'rock', color: '#e09050' },
  { ids: [280, 281, 282], name: 'Future Sight', kind: 'nova', fx: 'psyshock', type: 'psychic', color: '#ff70c8' },
  { ids: [607, 608, 609], name: 'Inferno', kind: 'nova', fx: 'fireblast', type: 'fire', color: '#a060ff' },
  { ids: [371, 372, 373], name: 'Outrage', kind: 'nova', fx: 'dracometeor', type: 'dragon', color: '#5878ff' },
  { ids: [142], name: 'Sky Attack', kind: 'dash', fx: 'aerialace', type: 'flying', color: '#f0d080' },
  { ids: [636, 637], name: 'Fiery Dance', kind: 'nova', fx: 'fireblast', type: 'fire', color: '#ffa030' },
  { ids: [144], name: 'Sheer Cold', kind: 'burst', fx: 'blizzard', type: 'ice', color: '#80d8ff' },
  { ids: [145], name: 'Thunder Cage', kind: 'nova', fx: 'thunder', type: 'electric', color: '#fff060' },
  { ids: [146], name: 'Heat Wave', kind: 'beam', fx: 'flamethrower', type: 'fire', color: '#ff5020' },
  { ids: [382], name: 'Origin Pulse', kind: 'beam', fx: 'hydropump', type: 'water', color: '#3888ff' },
  { ids: [383], name: 'Precipice Blades', kind: 'burst', fx: 'quake', type: 'ground', color: '#ff4020' },
  { ids: [151], name: 'Psystrike', kind: 'nova', fx: 'psyshock', type: 'psychic', color: '#ff90e0' },
]
const SIG_OF = new Map<number, (typeof SIGNATURE)[number]>()
for (const sg of SIGNATURE) for (const id of sg.ids) SIG_OF.set(id, sg)

/** The accent colour of an unlockable partner's line (undefined for everyone else). */
export const eliteColor = (id: number) => SIG_OF.get(id)?.color

function signature(sg: (typeof SIGNATURE)[number]): Move {
  return { name: sg.name, type: sg.type, kind: sg.kind, fx: sg.fx, power: Math.round(TIER_POWER[3] * (CHARGE[sg.fx] ? CHARGE_POWER : 1)), cooldown: TIER_CD[3], range: RANGE[sg.kind], tier: 3, charge: CHARGE[sg.fx] ?? 0, elite: sg.color, sig: true }
}

/**
 * Four move slots derived from a species' types. Slot 3 borrows the secondary type.
 * Unlockable partners (by species id) get their signature ultimate and flashier moves.
 */
export function movesetFor(types: PType[], id = 0): Move[] {
  const [a, b] = types
  const moves = [make(a, 0), make(a, 1), make(b ?? a, 2), make(a, 3)]
  const sg = SIG_OF.get(id)
  if (!sg) return moves
  return [...moves.slice(0, 3).map((m) => ({ ...m, elite: sg.color })), signature(sg)]
}

const BY_NAME = new Map<string, Move>()
for (const type of Object.keys(TABLE) as PType[]) for (let i = 0; i < 4; i++) {
  const m = make(type, i)
  if (!BY_NAME.has(m.name)) BY_NAME.set(m.name, m)
}

for (const sg of SIGNATURE) if (!BY_NAME.has(sg.name)) BY_NAME.set(sg.name, signature(sg))

/** Looks a move up by name (used to send moves over the network). */
export function moveByName(name: string): Move {
  return BY_NAME.get(name) ?? make('normal', 0)
}
