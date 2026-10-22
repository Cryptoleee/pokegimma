import type { MoveFx } from './moves'
import type { PType } from './types'
import type { ArenaKind } from '../game/world'
import { L } from '../i18n'

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
  /** Leaves a pool that keeps burning (seconds, share of max HP per second). */
  linger?: { dur: number; dps: number }
  /** Living Bomb: the circle follows the marked player until just before it goes off, then leaves a pool. */
  follow?: boolean
  fx: MoveFx
  type: PType
}

/** How the arena looks and feels in a phase. */
export interface PhaseLook {
  /** Colour wash over the whole screen ('' = none). */
  grade: string
  /** Colour of the pulsing screen edge ('' = none). */
  edge: string
  /** Glow around the boss. */
  aura?: string
  /** More weather particles (1 = normal). */
  weather: number
  /** Arena escalation drawn over the screen. */
  fx?: 'heat' | 'whiteout' | 'storm' | 'gale' | 'warp'
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
  /** Sprite per phase when it changes form (Black Kyurem, Mega Rayquaza, …). */
  forms?: [number, number, number]
  /** Name in the final phase, when it transforms. */
  finalName?: string
  /** What the final phase is called on the banner. */
  finalSub: string
  looks: [PhaseLook, PhaseLook, PhaseLook]
}

const CALM: PhaseLook = { grade: '', edge: '', weather: 1 }

export const BOSSES: Record<BossId, BossDef> = {
  reshiram: {
    id: 'reshiram', species: 643, name: 'Reshiram', get title() { return L('Ruler of the Volcano Crater', 'Heerser van de Vulkaankrater') }, arena: 'crater',
    level: 60, hp: 9, phases: [0.66, 0.33], color: '#ff7a30',
    get finalSub() { return L('Turboblaze · its fire burns blue!', 'Turboblaze · het vuur brandt blauw!') },
    looks: [CALM, { grade: 'rgba(255,80,20,0.07)', edge: '#ff5a1a', aura: '#ff7a30', weather: 1.8, fx: 'heat' }, { grade: 'rgba(40,120,255,0.10)', edge: '#3a9cff', aura: '#70d0ff', weather: 2.8, fx: 'heat' }],
    get blurb() { return L('White flames, meteors and a crater full of lava.', 'Witte vlammen, meteoren en een krater vol lava.') },
    get envTip() { return L('Lava cracks burn: don\'t stand on them. Lava erupts from the four volcanic vents.', 'Lavascheuren branden: blijf er niet op staan. Uit de vier vulkaankraters spuit lava.') },
    attacks: [
      { id: 'blueflare', name: 'Blue Flare', shape: 'cone', warn: 1.25, cd: 5, dmg: 0.5, phase: 0, weight: 3, target: 'nearest', len: 10, width: 0.5, fx: 'flamethrower', type: 'fire' },
      { id: 'fusionflare', name: 'Fusion Flare', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.2, extra: 2, stagger: 0.12, fx: 'fireblast', type: 'fire' },
      { id: 'heatwave', get name() { return L('Heat Wave', 'Hittegolf') }, shape: 'circle', warn: 1.5, cd: 8, dmg: 0.55, phase: 0, weight: 2, target: 'self', r: 4.6, fx: 'fireblast', type: 'fire' },
      { id: 'firering', get name() { return L('Fire Ring', 'Vuurring') }, shape: 'ring', warn: 1.4, cd: 9, dmg: 0.55, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'fireblast', type: 'fire' },
      { id: 'eruption', get name() { return L('Eruption', 'Uitbarsting') }, shape: 'circle', warn: 1.35, cd: 8, dmg: 0.55, phase: 1, weight: 2, target: 'vents', r: 3.4, stagger: 0.35, fx: 'earthpower', type: 'fire' },
      { id: 'crossflame', name: 'Cross Flame', shape: 'line', warn: 1.0, cd: 13, dmg: 0.4, phase: 2, weight: 3, target: 'nearest', len: 16, width: 1.5, sweep: { count: 7, step: 0.26 }, stagger: 0.32, fx: 'flamethrower', type: 'dragon' },
      { id: 'dragonrush', name: 'Dragon Rush', shape: 'line', warn: 1.15, cd: 9, dmg: 0.5, phase: 2, weight: 3, target: 'nearest', len: 15, width: 2.4, move: 'dash', fx: 'dragonpulse', type: 'dragon' },
      { id: 'blueflare2', get name() { return L('Blue Flare Storm', 'Blauwe Vlammenstorm') }, shape: 'circle', warn: 1.35, cd: 11, dmg: 0.45, phase: 2, weight: 2, target: 'players', r: 2.3, extra: 4, stagger: 0.14, fx: 'fireblast', type: 'fire' },
    ],
  },
  kyurem: {
    id: 'kyurem', species: 646, name: 'Kyurem', get title() { return L('Frozen Dragon of the Ice Cave', 'Bevroren draak van de IJsgrot') }, arena: 'icecave',
    level: 60, hp: 8.6, phases: [0.66, 0.33], color: '#7ac8ff',
    forms: [646, 646, 10022], finalName: 'Black Kyurem',
    get finalSub() { return L('Fused with Zekrom · ice meets lightning!', 'Versmolten met Zekrom · ijs en bliksem!') },
    looks: [CALM, { grade: 'rgba(160,220,255,0.08)', edge: '#9ad8ff', aura: '#a8e0ff', weather: 2.2, fx: 'whiteout' }, { grade: 'rgba(40,60,110,0.16)', edge: '#4ab0ff', aura: '#60b8ff', weather: 3, fx: 'storm' }],
    get blurb() { return L('Icy waves, falling icicles and a devastating blizzard.', 'IJzige golven, vallende ijspegels en een verwoestende blizzard.') },
    get envTip() { return L('The ice is slippery: you keep sliding. Hide behind an ice pillar from the blizzard.', 'Het ijs is glad: je glijdt door. Verstop je achter een ijspilaar voor de blizzard.') },
    attacks: [
      { id: 'freezebreath', get name() { return L('Frost Breath', 'IJsadem') }, shape: 'cone', warn: 1.25, cd: 6, dmg: 0.4, phase: 0, weight: 3, target: 'nearest', len: 9, width: 0.55, freeze: 1.2, fx: 'icebeam', type: 'ice' },
      { id: 'iciclecrash', name: 'Icicle Crash', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.0, extra: 3, stagger: 0.1, fx: 'stoneedge', type: 'ice' },
      { id: 'dragonpulse', name: 'Dragon Pulse', shape: 'line', warn: 1.05, cd: 6, dmg: 0.5, phase: 0, weight: 2, target: 'random', len: 18, width: 1.8, fx: 'dragonpulse', type: 'dragon' },
      { id: 'glaciate', name: 'Glaciate', shape: 'ring', warn: 1.4, cd: 10, dmg: 0.55, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'blizzard', type: 'ice' },
      { id: 'frostnova', get name() { return L('Frost Nova', 'Vriesgolf') }, shape: 'circle', warn: 1.6, cd: 9, dmg: 0.55, phase: 1, weight: 2, target: 'self', r: 5, freeze: 1, fx: 'blizzard', type: 'ice' },
      { id: 'blizzard', name: 'Blizzard', shape: 'circle', warn: 2.6, cd: 16, dmg: 0.6, phase: 2, weight: 3, target: 'self', r: 30, cover: true, fx: 'blizzard', type: 'ice' },
      { id: 'freezeshock', name: 'Freeze Shock', shape: 'circle', warn: 1.3, cd: 8, dmg: 0.45, phase: 2, weight: 3, target: 'players', r: 2.2, extra: 3, stagger: 0.14, freeze: 0.8, fx: 'thunder', type: 'electric' },
      { id: 'fusionbolt2', name: 'Fusion Bolt', shape: 'line', warn: 1.15, cd: 9, dmg: 0.5, phase: 2, weight: 3, target: 'nearest', len: 14, width: 2.2, move: 'dash', fx: 'dragonpulse', type: 'electric' },
    ],
  },
  zekrom: {
    id: 'zekrom', species: 644, name: 'Zekrom', get title() { return L('Ruler of Storm Peak', 'Heerser van de Stormtop') }, arena: 'plateau',
    level: 60, hp: 9.6, phases: [0.66, 0.33], color: '#5aa8ff',
    get finalSub() { return L('Teravolt · overcharged!', 'Teravolt · overladen!') },
    looks: [CALM, { grade: 'rgba(20,30,70,0.12)', edge: '#4a90ff', aura: '#5aa8ff', weather: 1.8, fx: 'storm' }, { grade: 'rgba(10,10,40,0.22)', edge: '#7ad0ff', aura: '#9ae0ff', weather: 2.8, fx: 'storm' }],
    get blurb() { return L('Lightning strikes, a raging Fusion Bolt and four lightning rods.', 'Blikseminslagen, een razende Fusion Bolt en vier bliksemafleiders.') },
    get envTip() { return L('The four lightning rods shoot bolts at each other: don\'t stand between two masts.', 'De vier bliksemafleiders schieten stroom naar elkaar: blijf niet tussen twee masten staan.') },
    attacks: [
      { id: 'boltstrike', name: 'Bolt Strike', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.2, extra: 2, stagger: 0.12, fx: 'thunder', type: 'electric' },
      { id: 'fusionbolt', name: 'Fusion Bolt', shape: 'line', warn: 1.15, cd: 8, dmg: 0.5, phase: 0, weight: 3, target: 'nearest', len: 14, width: 2.2, move: 'dash', fx: 'dragonpulse', type: 'electric' },
      { id: 'discharge', name: 'Discharge', shape: 'circle', warn: 1.5, cd: 8, dmg: 0.55, phase: 0, weight: 2, target: 'self', r: 4.8, fx: 'discharge', type: 'electric' },
      { id: 'thunderring', get name() { return L('Thunder Ring', 'Donderring') }, shape: 'ring', warn: 1.4, cd: 10, dmg: 0.55, phase: 1, weight: 2, target: 'self', inner: 6, r: 11, fx: 'discharge', type: 'electric' },
      { id: 'storm', get name() { return L('Thunderstorm', 'Onweer') }, shape: 'circle', warn: 1.4, cd: 14, dmg: 0.4, phase: 2, weight: 3, target: 'players', r: 2.0, extra: 7, stagger: 0.2, rods: true, fx: 'thunder', type: 'electric' },
      { id: 'teravolt', get name() { return L('Teravolt Slam', 'Teravolt-sprong') }, shape: 'circle', warn: 1.6, cd: 10, dmg: 0.55, phase: 2, weight: 3, target: 'nearest', r: 3.4, move: 'land', fx: 'thunder', type: 'dragon' },
    ],
  },
  rayquaza: {
    id: 'rayquaza', species: 384, name: 'Rayquaza', get title() { return L('Ruler of the Sky Pillar', 'Heerser van de Hemelpilaar') }, arena: 'sky',
    level: 60, hp: 9.6, phases: [0.66, 0.33], color: '#58d070',
    forms: [384, 384, 10079], finalName: 'Mega Rayquaza',
    get finalSub() { return L('Mega Evolution · the sky splits open!', 'Mega-evolutie · de hemel scheurt open!') },
    looks: [CALM, { grade: 'rgba(20,60,40,0.10)', edge: '#58d070', aura: '#70e090', weather: 2, fx: 'gale' }, { grade: 'rgba(10,20,20,0.20)', edge: '#ffd040', aura: '#ffd860', weather: 3, fx: 'gale' }],
    get blurb() { return L('A dive from the heavens, whirlwinds and a storm that blows you off your feet.', 'Een duik uit de hemel, wervelwinden en een storm die je van je plek blaast.') },
    get envTip() { return L('Whirlwinds sweep through the arena: walk around them. During Delta Stream the wind pushes you away, so walk against it.', 'Wervelwinden trekken door de arena: loop er omheen. Bij Delta Stream duwt de wind je weg, dus loop ertegenin.') },
    attacks: [
      { id: 'dragonascent', name: 'Dragon Ascent', shape: 'circle', warn: 1.7, cd: 9, dmg: 0.55, phase: 0, weight: 2, target: 'nearest', r: 3.4, move: 'land', fx: 'dracometeor', type: 'dragon' },
      { id: 'outrage', name: 'Outrage', shape: 'line', warn: 1.05, cd: 8, dmg: 0.45, phase: 0, weight: 3, target: 'nearest', len: 12, width: 2, sweep: { count: 3, step: 0.45 }, stagger: 0.35, oneWay: true, fx: 'dragonpulse', type: 'dragon' },
      { id: 'dracometeor', name: 'Draco Meteor', shape: 'circle', warn: 1.35, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.2, extra: 3, stagger: 0.12, fx: 'dracometeor', type: 'dragon' },
      { id: 'hurricane', name: 'Hurricane', shape: 'circle', warn: 1.1, cd: 12, dmg: 0.3, phase: 1, weight: 2, target: 'players', r: 1.7, tornado: { n: 2, speed: 1.8, dur: 5, dps: 0.24 }, fx: 'hurricane', type: 'flying' },
      { id: 'deltastream', name: 'Delta Stream', shape: 'circle', warn: 1.1, cd: 15, dmg: 0.3, phase: 2, weight: 3, target: 'players', r: 1.7, wind: { dur: 3.5, force: 2.6 }, tornado: { n: 2, speed: 1.5, dur: 4.5, dps: 0.24 }, fx: 'hurricane', type: 'flying' },
      { id: 'extremespeed', name: 'Extreme Speed', shape: 'line', warn: 1.1, cd: 8, dmg: 0.45, phase: 2, weight: 3, target: 'nearest', len: 16, width: 2, move: 'dash', fx: 'dragonpulse', type: 'normal' },
    ],
  },
  mewtwo: {
    id: 'mewtwo', species: 150, name: 'Mewtwo', get title() { return L('Clone from the Psychic Lab', 'Kloon uit het Psychische Lab') }, arena: 'lab',
    level: 60, hp: 10.4, phases: [0.66, 0.33], color: '#c070ff', clonesFrom: 2,
    forms: [150, 150, 10044], finalName: 'Mega Mewtwo Y',
    get finalSub() { return L('Mega Evolution · reality bends!', 'Mega-evolutie · de werkelijkheid buigt!') },
    looks: [CALM, { grade: 'rgba(80,20,120,0.08)', edge: '#c070ff', aura: '#d090ff', weather: 2, fx: 'warp' }, { grade: 'rgba(40,0,70,0.18)', edge: '#ff60e0', aura: '#ff80f0', weather: 3, fx: 'warp' }],
    get blurb() { return L('Teleports, splits into clones and electrifies the floor under your feet.', 'Teleporteert, splitst zich in klonen en zet de vloer onder je voeten onder stroom.') },
    get envTip() { return L('The floor grid lights up tile by tile: get onto a dark tile in time.', 'Het vloerraster licht vak voor vak op: ga op tijd op een donker vak staan.') },
    attacks: [
      { id: 'psystrike', name: 'Psystrike', shape: 'cone', warn: 1.25, cd: 6, dmg: 0.5, phase: 0, weight: 3, target: 'nearest', len: 10, width: 0.5, fx: 'psybeam', type: 'psychic' },
      { id: 'shadowball', name: 'Shadow Ball', shape: 'circle', warn: 1.3, cd: 7, dmg: 0.45, phase: 0, weight: 3, target: 'players', r: 2.0, extra: 2, stagger: 0.12, fx: 'psyshock', type: 'ghost' },
      { id: 'teleslam', name: 'Teleport', shape: 'circle', warn: 1.0, cd: 9, dmg: 0.55, phase: 0, weight: 2, target: 'self', r: 3.6, move: 'teleport', fx: 'psychic', type: 'psychic' },
      { id: 'psyring', get name() { return L('Psychic Ring', 'Psychische ring') }, shape: 'ring', warn: 1.4, cd: 9, dmg: 0.5, phase: 1, weight: 2, target: 'self', inner: 5.5, r: 10, fx: 'psychic', type: 'psychic' },
      { id: 'aurasphere', name: 'Aura Sphere', shape: 'circle', warn: 1.25, cd: 7, dmg: 0.45, phase: 2, weight: 3, target: 'players', r: 1.9, extra: 3, stagger: 0.1, fx: 'focusblast', type: 'fighting' },
    ],
  },
}

export const BOSS_LIST: BossId[] = ['reshiram', 'kyurem', 'zekrom', 'rayquaza', 'mewtwo']

/** Raid rules */
export const RAID_LEVEL = 50
export const RAID_LIVES = 2
export const RAID_TIME = 240
export const RESPAWN_TIME = 10
