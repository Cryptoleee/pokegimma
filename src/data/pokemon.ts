import { L } from '../i18n'
import type { PType } from './types'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export interface Species {
  id: number
  name: string
  types: PType[]
  hp: number
  /** Average of Attack and Sp. Atk. */
  atk: number
  /** Average of Defense and Sp. Def. */
  def: number
  spe: number
  /** Evolves into one of these ids at evoLevel. */
  evo?: number[]
  evoLevel?: number
}

type Row = [number, string, string, number, number, number, number, (number | number[])?, number?]

// id, name, types, hp, atk, def, spe, evolves-into, at level
const ROWS: Row[] = [
  // Roster lines
  [1, 'Bulbasaur', 'grass/poison', 45, 57, 57, 45, 2, 16],
  [2, 'Ivysaur', 'grass/poison', 60, 71, 72, 60, 3, 32],
  [3, 'Venusaur', 'grass/poison', 80, 91, 92, 80],
  [4, 'Charmander', 'fire', 39, 56, 47, 65, 5, 16],
  [5, 'Charmeleon', 'fire', 58, 72, 62, 80, 6, 34],
  [6, 'Charizard', 'fire/flying', 78, 97, 82, 100],
  [7, 'Squirtle', 'water', 44, 49, 65, 43, 8, 16],
  [8, 'Wartortle', 'water', 59, 64, 80, 58, 9, 34],
  [9, 'Blastoise', 'water', 79, 84, 103, 78],
  [25, 'Pikachu', 'electric', 35, 52, 45, 90, 26, 22],
  [26, 'Raichu', 'electric', 60, 90, 68, 110],
  [133, 'Eevee', 'normal', 55, 50, 57, 55, [134, 135, 136], 20],
  [134, 'Vaporeon', 'water', 130, 88, 78, 65],
  [135, 'Jolteon', 'electric', 65, 88, 78, 130],
  [136, 'Flareon', 'fire', 65, 113, 85, 65],
  [495, 'Snivy', 'grass', 45, 45, 55, 63, 496, 17],
  [496, 'Servine', 'grass', 60, 60, 75, 83, 497, 36],
  [497, 'Serperior', 'grass', 75, 75, 95, 113],
  [498, 'Tepig', 'fire', 65, 54, 45, 45, 499, 17],
  [499, 'Pignite', 'fire/fighting', 90, 82, 55, 55, 500, 36],
  [500, 'Emboar', 'fire/fighting', 110, 112, 65, 65],
  [501, 'Oshawott', 'water', 55, 59, 45, 45, 502, 17],
  [502, 'Dewott', 'water', 75, 79, 60, 60, 503, 36],
  [503, 'Samurott', 'water', 95, 104, 78, 70],
  [447, 'Riolu', 'fighting', 40, 52, 40, 60, 448, 20],
  [448, 'Lucario', 'fighting/steel', 70, 113, 70, 90],
  [443, 'Gible', 'dragon/ground', 58, 60, 45, 42, 444, 24],
  [444, 'Gabite', 'dragon/ground', 68, 70, 60, 82, 445, 36],
  [445, 'Garchomp', 'dragon/ground', 108, 105, 90, 102],
  [570, 'Zorua', 'dark', 40, 72, 40, 65, 571, 30],
  [571, 'Zoroark', 'dark', 60, 113, 60, 105],
  [610, 'Axew', 'dragon', 46, 58, 50, 57, 611, 26],
  [611, 'Fraxure', 'dragon', 66, 79, 60, 67, 612, 38],
  [612, 'Haxorus', 'dragon', 76, 104, 80, 97],
  [68, 'Machamp', 'fighting', 90, 99, 75, 55],
  [148, 'Dragonair', 'dragon', 61, 74, 63, 70, 149, 38],
  [246, 'Larvitar', 'rock/ground', 50, 55, 50, 41, 247, 30],
  [247, 'Pupitar', 'rock/ground', 70, 65, 70, 51, 248, 36],
  [446, 'Munchlax', 'normal', 135, 62, 68, 5, 143, 20],
  [374, 'Beldum', 'steel/psychic', 40, 45, 70, 30, 375, 20],
  [375, 'Metang', 'steel/psychic', 60, 65, 80, 50, 376, 36],
  [123, 'Scyther', 'bug/flying', 70, 82, 60, 105, 212, 30],
  [212, 'Scizor', 'bug/steel', 70, 93, 90, 65],
  [258, 'Mudkip', 'water', 50, 60, 50, 40, 259, 16],
  [259, 'Marshtomp', 'water/ground', 70, 75, 70, 50, 260, 36],
  [260, 'Swampert', 'water/ground', 100, 102, 90, 60],
  [255, 'Torchic', 'fire', 45, 65, 50, 45, 256, 16],
  [256, 'Combusken', 'fire/fighting', 60, 85, 60, 55, 257, 36],
  [257, 'Blaziken', 'fire/fighting', 80, 115, 70, 80],
  [403, 'Shinx', 'electric', 45, 52, 34, 45, 404, 15],
  [404, 'Luxio', 'electric', 60, 72, 49, 60, 405, 30],
  [405, 'Luxray', 'electric', 80, 108, 69, 70],
  [633, 'Deino', 'dark/dragon', 52, 55, 50, 38, 634, 26],
  [634, 'Zweilous', 'dark/dragon', 72, 75, 70, 58, 635, 38],

  // Wild: common
  [504, 'Patrat', 'normal', 45, 45, 39, 42],
  [506, 'Lillipup', 'normal', 45, 43, 45, 55],
  [509, 'Purrloin', 'dark', 41, 50, 37, 66],
  [519, 'Pidove', 'normal/flying', 50, 46, 40, 43],
  [540, 'Sewaddle', 'bug/grass', 45, 47, 65, 42],
  [543, 'Venipede', 'bug/poison', 30, 38, 49, 57],
  [524, 'Roggenrola', 'rock', 55, 50, 55, 15],
  [527, 'Woobat', 'psychic/flying', 55, 50, 43, 72],
  [535, 'Tympole', 'water', 50, 50, 40, 64],
  [522, 'Blitzle', 'electric', 45, 55, 32, 76],
  [16, 'Pidgey', 'normal/flying', 40, 40, 38, 56],
  [19, 'Rattata', 'normal', 30, 41, 35, 72],
  [41, 'Zubat', 'poison/flying', 40, 38, 38, 55],
  [74, 'Geodude', 'rock/ground', 40, 55, 65, 20],
  [129, 'Magikarp', 'water', 20, 13, 38, 80, 130, 20],
  [10, 'Caterpie', 'bug', 45, 25, 28, 45],

  // Wild: uncommon
  [58, 'Growlithe', 'fire', 55, 70, 48, 60, 59, 25],
  [63, 'Abra', 'psychic', 25, 63, 35, 90, 64, 16],
  [64, 'Kadabra', 'psychic', 40, 78, 50, 105, 65, 36],
  [66, 'Machop', 'fighting', 70, 58, 43, 35, 67, 28],
  [67, 'Machoke', 'fighting', 80, 75, 65, 45, 68, 38],
  [92, 'Gastly', 'ghost/poison', 30, 68, 33, 80, 93, 25],
  [93, 'Haunter', 'ghost/poison', 45, 83, 50, 95, 94, 38],
  [529, 'Drilbur', 'ground', 60, 58, 43, 68, 530, 31],
  [532, 'Timburr', 'fighting', 75, 53, 45, 35],
  [551, 'Sandile', 'ground/dark', 50, 54, 35, 65],
  [554, 'Darumaka', 'fire', 70, 53, 45, 50],
  [595, 'Joltik', 'bug/electric', 50, 52, 50, 65, 596, 36],
  [607, 'Litwick', 'ghost/fire', 50, 48, 55, 20],
  [597, 'Ferroseed', 'grass/steel', 44, 37, 89, 10],
  [585, 'Deerling', 'normal/grass', 60, 50, 50, 75],
  [587, 'Emolga', 'electric/flying', 55, 75, 60, 103],
  [559, 'Scraggy', 'dark/fighting', 50, 55, 70, 48],
  [147, 'Dratini', 'dragon', 41, 57, 48, 50, 148, 30],
  [636, 'Larvesta', 'bug/fire', 55, 68, 55, 60, 637, 40],

  // Wild: rare
  [94, 'Gengar', 'ghost/poison', 60, 98, 68, 110],
  [149, 'Dragonite', 'dragon/flying', 91, 117, 98, 80],
  [130, 'Gyarados', 'water/flying', 95, 93, 90, 81],
  [143, 'Snorlax', 'normal', 160, 88, 88, 30],
  [609, 'Chandelure', 'ghost/fire', 60, 100, 90, 80],
  [637, 'Volcarona', 'bug/fire', 85, 98, 85, 100],
  [635, 'Hydreigon', 'dark/dragon', 92, 115, 90, 98],
  [530, 'Excadrill', 'ground/steel', 110, 93, 63, 88],
  [596, 'Galvantula', 'bug/electric', 70, 87, 60, 108],
  [553, 'Krookodile', 'ground/dark', 95, 91, 75, 92],
  [248, 'Tyranitar', 'rock/dark', 100, 115, 105, 61],
  [376, 'Metagross', 'steel/psychic', 80, 115, 110, 70],
  [131, 'Lapras', 'water/ice', 130, 85, 88, 60],
  [65, 'Alakazam', 'psychic', 55, 93, 70, 120],
  [59, 'Arcanine', 'fire', 90, 105, 80, 95],

  // Wild: legendary
  [150, 'Mewtwo', 'psychic', 106, 132, 90, 130],
  [643, 'Reshiram', 'dragon/fire', 100, 135, 110, 90],
  [644, 'Zekrom', 'dragon/electric', 100, 135, 110, 90],
  [646, 'Kyurem', 'dragon/ice', 125, 130, 90, 95],
  [384, 'Rayquaza', 'dragon/flying', 105, 150, 90, 95],
  [638, 'Cobalion', 'steel/fighting', 91, 90, 101, 108],
  [639, 'Terrakion', 'rock/fighting', 91, 101, 90, 108],
  [640, 'Virizion', 'grass/fighting', 91, 90, 101, 108],
  [494, 'Victini', 'psychic/fire', 100, 100, 100, 100],
  [144, 'Articuno', 'ice/flying', 90, 90, 113, 85],
  [145, 'Zapdos', 'electric/flying', 90, 108, 88, 100],
  [146, 'Moltres', 'fire/flying', 90, 113, 88, 90],
]

export const SPECIES: Record<number, Species> = {}
for (const [id, name, types, hp, atk, def, spe, evo, evoLevel] of ROWS) {
  SPECIES[id] = {
    id, name, types: types.split('/') as PType[], hp, atk, def, spe,
    evo: evo === undefined ? undefined : Array.isArray(evo) ? evo : [evo],
    evoLevel,
  }
}

/** The 24 Pokémon you pick your starting partner from. */
export const ROSTER = [25, 4, 7, 1, 133, 495, 498, 501, 447, 443, 570, 610, 92, 66, 63, 147, 246, 446, 374, 123, 258, 255, 403, 633]
/** You start with one partner and can catch more in the world, up to PARTY_MAX. */
export const TEAM_SIZE = 1
export const PARTY_MAX = 3

export const WILD: Record<Rarity, number[]> = {
  common: [504, 506, 509, 519, 540, 543, 524, 527, 535, 522, 16, 19, 41, 74, 129, 10],
  uncommon: [58, 63, 66, 92, 529, 532, 551, 554, 595, 607, 597, 585, 587, 559, 147, 636],
  rare: [94, 149, 130, 143, 609, 637, 635, 530, 596, 553, 248, 376, 131, 65, 59],
  legendary: [150, 643, 644, 646, 384, 638, 639, 640, 494, 144, 145, 146],
}

const RARITY_EN: Record<Rarity, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary',
}
const RARITY_DUTCH: Record<Rarity, string> = {
  common: 'Gewoon', uncommon: 'Ongewoon', rare: 'Zeldzaam', legendary: 'Legendarisch',
}

/** Rarity display names in the current language (read at the moment of use). */
export const RARITY_NAME: Record<Rarity, string> = new Proxy(RARITY_DUTCH, {
  get: (t, k) => (typeof k === 'string' && k in RARITY_EN ? L(RARITY_EN[k as Rarity], RARITY_DUTCH[k as Rarity]) : Reflect.get(t, k)),
})
/** Old name, kept for existing readers: also follows the current language. */
export const RARITY_NL = RARITY_NAME

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#ffffff', uncommon: '#7ce07c', rare: '#58a8ff', legendary: '#ffc830',
}

export function rarityOf(id: number): Rarity {
  for (const r of ['legendary', 'rare', 'uncommon', 'common'] as Rarity[]) if (WILD[r].includes(id)) return r
  return 'common'
}

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white'

export function spriteUrl(id: number, opts: { back?: boolean; shiny?: boolean } = {}): string {
  return `${SPRITE_BASE}/${opts.back ? 'back/' : ''}${opts.shiny ? 'shiny/' : ''}${id}.png`
}

export function animatedUrl(id: number, shiny = false): string {
  return `${SPRITE_BASE}/animated/${shiny ? 'shiny/' : ''}${id}.gif`
}
