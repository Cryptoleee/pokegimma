import type { MoveFx } from './moves'
import type { PType } from './types'
import type { ArenaKind } from '../game/world'

/**
 * Raid bosses as data: who they are, where they live, and their signature
 * attacks. Every attack is telegraphed on the ground before it lands, so it can
 * be dodged; damage is a share of the target's max HP.
 */

export type BossId = 'reshiram' | 'kyurem' | 'zekrom' | 'rayquaza' | 'mewtwo'
/** 'grid' is a checkerboard over the whole arena (cell size = width, parity = inner). */
export type HazardShape = 'circle' | 'cone' | 'line' | 'ring' | 'grid'

export interface BossAttack {
  id: string
  /** Shouted over the boss when it starts. */
  name: string
  shape: HazardShape
  /** Seconds of warning on the ground before it hits. */
  warn: number
  /** Seconds before this attack can be used again. */
  cd: number
  /** Damage as a share of the hit Pokémon's max HP. */
  dmg: number
  /** First phase (0, 1, 2) that uses it. */
  phase: number
  /** How likely it is picked among the ready ones. */
  weight: number
  /** Where it lands. */
  target: 'nearest' | 'random' | 'players' | 'self' | 'vents'
  /** Circle radius / ring outer radius. */
  r?: number
  /** Ring inner radius: standing inside it is safe. */
  inner?: number
  /** Cone / line length. */
  len?: number
  /** Line width (tiles) or cone half-angle (radians). */
  width?: number
  /** Extra random circles on top of the targets. */
  extra?: number
  /** Seconds between hazards in a volley. */
  stagger?: number
  /** Sweeping lines: how many and the turn between them (radians). */
  sweep?: { count: number; step: number }
  /** Hits everyone in the arena who isn't hiding behind a pillar. */
  cover?: boolean
  /** Frozen in place for this long after being hit. */
  freeze?: number
  /** Sweeping lines all point one way from the boss (instead of through it). */
  oneWay?: boolean
  /**
   * The boss moves with the attack: 'dash' races along the line to its end,
   * 'land' leaps into the air and comes down on the circle, 'teleport' blinks
   * next to the target first and then strikes around itself.
   */
  move?: 'dash' | 'land' | 'teleport'
  /** Moving whirlwinds that stay a while after landing and hurt every second. */
  tornado?: { n: number; speed: number; dur: number; dps: number }
  /** Wind that shoves every player one way for a while (seconds, tiles/s). */
  wind?: { dur: number; force: number }
  /** Every lightning rod in the arena fires as well. */
  rods?: boolean
  fx: MoveFx
  type: PType
}

export interface BossDef {
  id: BossId
  species: number
  name: string
  title: string
  arena: ArenaKind
  level: number
  /** Base HP multiplier for one player (more players scale it up). */
  hp: number
  /** HP shares where the next phase starts. */
  phases: [number, number]
  attacks: BossAttack[]
  /** Colour for the boss bar and banners. */
  color: string
  /** One-line description for menus and the loading screen. */
  blurb: string
  /** Arena rule shown as a tip. */
  envTip: string
  /** Mirror images that cast with the boss from this phase on. */
  clonesFrom?: number
}

export const BOSSES: Record<BossId, BossDef> = {
  reshiram: {
    id: 'reshiram', species: 643, name: 'Reshiram', title: 'Heerser van de Vulkaankrater', arena: 'crater',
    level: 60, hp: 8.5, phases: [0.66, 0.33], color: '#ff7a30',
    blurb: 'Witte vlammen, meteoren en een krater vol lava.',
    envTip: 'Lavascheuren branden: blijf er niet op staan. Uit de vier vulkaankraters spuit lava.',
    attacks: [
      { id: 'blueflare', name: 'Blue Flare', shape: 'cone', warn: 1.25, cd: 5, dmg: 0.5, phase: 0, weight: 3, target: 'nearest', len: 10, width: 0.5, fx: 'flamethrower', type: 'fire' },
      { id: 'fusionflare', name: 'Fusion Flare', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.2, extra: 2, stagger: 0.12, fx: 'fireblast', type: 'fire' },
      { id: 'heatwave', name: 'Hittegolf', shape: 'circle', warn: 1.5, cd: 8, dmg: 0.55, phase: 0, weight: 2, target: 'self', r: 4.6, fx: 'fireblast', type: 'fire' },
      { id: 'firering', name: 'Vuurring', shape: 'ring', warn: 1.4, cd: 9, dmg: 0.55, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'fireblast', type: 'fire' },
      { id: 'eruption', name: 'Uitbarsting', shape: 'circle', warn: 1.35, cd: 8, dmg: 0.55, phase: 1, weight: 2, target: 'vents', r: 3.4, stagger: 0.35, fx: 'earthpower', type: 'fire' },
      { id: 'crossflame', name: 'Cross Flame', shape: 'line', warn: 1.0, cd: 13, dmg: 0.4, phase: 2, weight: 3, target: 'nearest', len: 16, width: 1.5, sweep: { count: 7, step: 0.26 }, stagger: 0.32, fx: 'flamethrower', type: 'dragon' },
    ],
  },
  kyurem: {
    id: 'kyurem', species: 646, name: 'Kyurem', title: 'Bevroren draak van de IJsgrot', arena: 'icecave',
    level: 60, hp: 8, phases: [0.66, 0.33], color: '#7ac8ff',
    blurb: 'IJzige golven, vallende ijspegels en een verwoestende blizzard.',
    envTip: 'Het ijs is glad: je glijdt door. Verstop je achter een ijspilaar voor de blizzard.',
    attacks: [
      { id: 'freezebreath', name: 'IJsadem', shape: 'cone', warn: 1.25, cd: 6, dmg: 0.4, phase: 0, weight: 3, target: 'nearest', len: 9, width: 0.55, freeze: 1.2, fx: 'icebeam', type: 'ice' },
      { id: 'iciclecrash', name: 'Icicle Crash', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.0, extra: 3, stagger: 0.1, fx: 'stoneedge', type: 'ice' },
      { id: 'dragonpulse', name: 'Dragon Pulse', shape: 'line', warn: 1.05, cd: 6, dmg: 0.5, phase: 0, weight: 2, target: 'random', len: 18, width: 1.8, fx: 'dragonpulse', type: 'dragon' },
      { id: 'glaciate', name: 'Glaciate', shape: 'ring', warn: 1.4, cd: 10, dmg: 0.55, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'blizzard', type: 'ice' },
      { id: 'frostnova', name: 'Vriesgolf', shape: 'circle', warn: 1.6, cd: 9, dmg: 0.55, phase: 1, weight: 2, target: 'self', r: 5, freeze: 1, fx: 'blizzard', type: 'ice' },
      { id: 'blizzard', name: 'Blizzard', shape: 'circle', warn: 2.6, cd: 16, dmg: 0.6, phase: 2, weight: 3, target: 'self', r: 30, cover: true, fx: 'blizzard', type: 'ice' },
    ],
  },
  zekrom: {
    id: 'zekrom', species: 644, name: 'Zekrom', title: 'Heerser van de Stormtop', arena: 'plateau',
    level: 60, hp: 8.5, phases: [0.66, 0.33], color: '#5aa8ff',
    blurb: 'Blikseminslagen, een razende Fusion Bolt en vier bliksemafleiders.',
    envTip: 'De vier bliksemafleiders schieten stroom naar elkaar: blijf niet tussen twee masten staan.',
    attacks: [
      { id: 'boltstrike', name: 'Bolt Strike', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.2, extra: 2, stagger: 0.12, fx: 'thunder', type: 'electric' },
      { id: 'fusionbolt', name: 'Fusion Bolt', shape: 'line', warn: 1.15, cd: 8, dmg: 0.5, phase: 0, weight: 3, target: 'nearest', len: 14, width: 2.2, move: 'dash', fx: 'dragonpulse', type: 'electric' },
      { id: 'discharge', name: 'Discharge', shape: 'circle', warn: 1.5, cd: 8, dmg: 0.55, phase: 0, weight: 2, target: 'self', r: 4.8, fx: 'discharge', type: 'electric' },
      { id: 'thunderring', name: 'Donderring', shape: 'ring', warn: 1.4, cd: 10, dmg: 0.55, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'discharge', type: 'electric' },
      { id: 'storm', name: 'Onweer', shape: 'circle', warn: 1.4, cd: 14, dmg: 0.4, phase: 2, weight: 3, target: 'players', r: 2.0, extra: 7, stagger: 0.2, rods: true, fx: 'thunder', type: 'electric' },
    ],
  },
  rayquaza: {
    id: 'rayquaza', species: 384, name: 'Rayquaza', title: 'Heerser van de Hemelpilaar', arena: 'sky',
    level: 60, hp: 8.5, phases: [0.66, 0.33], color: '#58d070',
    blurb: 'Een duik uit de hemel, wervelwinden en een storm die je van je plek blaast.',
    envTip: 'Wervelwinden trekken door de arena: loop er omheen. Bij Delta Stream duwt de wind je weg, dus loop ertegenin.',
    attacks: [
      { id: 'dragonascent', name: 'Dragon Ascent', shape: 'circle', warn: 1.7, cd: 9, dmg: 0.55, phase: 0, weight: 2, target: 'nearest', r: 3.4, move: 'land', fx: 'dracometeor', type: 'dragon' },
      { id: 'outrage', name: 'Outrage', shape: 'line', warn: 1.05, cd: 8, dmg: 0.45, phase: 0, weight: 3, target: 'nearest', len: 12, width: 2, sweep: { count: 3, step: 0.45 }, stagger: 0.35, oneWay: true, fx: 'dragonpulse', type: 'dragon' },
      { id: 'dracometeor', name: 'Draco Meteor', shape: 'circle', warn: 1.35, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.2, extra: 3, stagger: 0.12, fx: 'dracometeor', type: 'dragon' },
      { id: 'hurricane', name: 'Hurricane', shape: 'circle', warn: 1.1, cd: 12, dmg: 0.3, phase: 1, weight: 2, target: 'players', r: 1.7, tornado: { n: 2, speed: 1.8, dur: 5, dps: 0.24 }, fx: 'hurricane', type: 'flying' },
      { id: 'deltastream', name: 'Delta Stream', shape: 'circle', warn: 1.1, cd: 15, dmg: 0.3, phase: 2, weight: 3, target: 'players', r: 1.7, wind: { dur: 3.5, force: 2.6 }, tornado: { n: 2, speed: 1.5, dur: 4.5, dps: 0.24 }, fx: 'hurricane', type: 'flying' },
    ],
  },
  mewtwo: {
    id: 'mewtwo', species: 150, name: 'Mewtwo', title: 'Kloon uit het Psychische Lab', arena: 'lab',
    level: 60, hp: 10, phases: [0.66, 0.33], color: '#c070ff', clonesFrom: 2,
    blurb: 'Teleporteert, splitst zich in klonen en zet de vloer onder je voeten onder stroom.',
    envTip: 'Het vloerraster licht vak voor vak op: ga op tijd op een donker vak staan.',
    attacks: [
      { id: 'psystrike', name: 'Psystrike', shape: 'cone', warn: 1.25, cd: 6, dmg: 0.5, phase: 0, weight: 3, target: 'nearest', len: 10, width: 0.5, fx: 'psybeam', type: 'psychic' },
      { id: 'shadowball', name: 'Shadow Ball', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.0, extra: 2, stagger: 0.12, fx: 'psyshock', type: 'ghost' },
      { id: 'teleslam', name: 'Teleport', shape: 'circle', warn: 1.0, cd: 9, dmg: 0.55, phase: 0, weight: 2, target: 'self', r: 3.6, move: 'teleport', fx: 'psychic', type: 'psychic' },
      { id: 'psyring', name: 'Psychische ring', shape: 'ring', warn: 1.4, cd: 9, dmg: 0.5, phase: 1, weight: 2, target: 'self', inner: 5.5, r: 10, fx: 'psychic', type: 'psychic' },
    ],
  },
}

export const BOSS_LIST: BossId[] = ['reshiram', 'kyurem', 'zekrom', 'rayquaza', 'mewtwo']

/** Raid rules */
export const RAID_LEVEL = 50
export const RAID_LIVES = 3
export const RAID_TIME = 240
export const RESPAWN_TIME = 4
