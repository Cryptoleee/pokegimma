import type { MoveFx } from './moves'
import type { PType } from './types'
import type { ArenaKind } from '../game/world'

/**
 * Raid bosses as data: who they are, where they live, and their signature
 * attacks. Every attack is telegraphed on the ground before it lands, so it can
 * be dodged; damage is a share of the target's max HP.
 */

export type BossId = 'reshiram' | 'kyurem'
export type HazardShape = 'circle' | 'cone' | 'line' | 'ring'

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
}

export const BOSSES: Record<BossId, BossDef> = {
  reshiram: {
    id: 'reshiram', species: 643, name: 'Reshiram', title: 'Heerser van de Vulkaankrater', arena: 'crater',
    level: 60, hp: 8.5, phases: [0.66, 0.33], color: '#ff7a30',
    blurb: 'Witte vlammen, meteoren en een krater vol lava.',
    envTip: 'Lavascheuren branden: blijf er niet op staan. Uit de vier vulkaankraters spuit lava.',
    attacks: [
      { id: 'blueflare', name: 'Blue Flare', shape: 'cone', warn: 1.25, cd: 5, dmg: 0.45, phase: 0, weight: 3, target: 'nearest', len: 10, width: 0.5, fx: 'flamethrower', type: 'fire' },
      { id: 'fusionflare', name: 'Fusion Flare', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.4, phase: 0, weight: 3, target: 'players', r: 2.2, extra: 3, stagger: 0.12, fx: 'fireblast', type: 'fire' },
      { id: 'heatwave', name: 'Hittegolf', shape: 'circle', warn: 1.5, cd: 8, dmg: 0.5, phase: 0, weight: 2, target: 'self', r: 4.6, fx: 'fireblast', type: 'fire' },
      { id: 'firering', name: 'Vuurring', shape: 'ring', warn: 1.4, cd: 9, dmg: 0.5, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'fireblast', type: 'fire' },
      { id: 'eruption', name: 'Uitbarsting', shape: 'circle', warn: 1.35, cd: 8, dmg: 0.5, phase: 1, weight: 2, target: 'vents', r: 3.4, stagger: 0.35, fx: 'earthpower', type: 'fire' },
      { id: 'crossflame', name: 'Cross Flame', shape: 'line', warn: 1.0, cd: 13, dmg: 0.35, phase: 2, weight: 3, target: 'nearest', len: 16, width: 1.5, sweep: { count: 9, step: 0.26 }, stagger: 0.32, fx: 'flamethrower', type: 'dragon' },
    ],
  },
  kyurem: {
    id: 'kyurem', species: 646, name: 'Kyurem', title: 'Bevroren draak van de IJsgrot', arena: 'icecave',
    level: 60, hp: 8, phases: [0.66, 0.33], color: '#7ac8ff',
    blurb: 'IJzige golven, vallende ijspegels en een verwoestende blizzard.',
    envTip: 'Het ijs is glad: je glijdt door. Verstop je achter een ijspilaar voor de blizzard.',
    attacks: [
      { id: 'freezebreath', name: 'IJsadem', shape: 'cone', warn: 1.25, cd: 6, dmg: 0.35, phase: 0, weight: 3, target: 'nearest', len: 9, width: 0.55, freeze: 1.2, fx: 'icebeam', type: 'ice' },
      { id: 'iciclecrash', name: 'Icicle Crash', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.4, phase: 0, weight: 3, target: 'players', r: 2.0, extra: 5, stagger: 0.1, fx: 'stoneedge', type: 'ice' },
      { id: 'dragonpulse', name: 'Dragon Pulse', shape: 'line', warn: 1.05, cd: 6, dmg: 0.45, phase: 0, weight: 2, target: 'random', len: 18, width: 1.8, fx: 'dragonpulse', type: 'dragon' },
      { id: 'glaciate', name: 'Glaciate', shape: 'ring', warn: 1.4, cd: 10, dmg: 0.5, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'blizzard', type: 'ice' },
      { id: 'frostnova', name: 'Vriesgolf', shape: 'circle', warn: 1.6, cd: 9, dmg: 0.5, phase: 1, weight: 2, target: 'self', r: 5, freeze: 1, fx: 'blizzard', type: 'ice' },
      { id: 'blizzard', name: 'Blizzard', shape: 'circle', warn: 2.6, cd: 16, dmg: 0.6, phase: 2, weight: 3, target: 'self', r: 30, cover: true, fx: 'blizzard', type: 'ice' },
    ],
  },
}

export const BOSS_LIST: BossId[] = ['reshiram', 'kyurem']

/** Raid rules */
export const RAID_LEVEL = 50
export const RAID_LIVES = 3
export const RAID_TIME = 240
export const RESPAWN_TIME = 4
