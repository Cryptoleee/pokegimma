import type { BossAttack, BossId } from './bosses'
import type { MoveFx } from './moves'
import { L } from '../i18n'
import type { Cinematic } from '../ui/cinematic'

/**
 * Raid dungeons, in the spirit of WoW dungeons: you fight your way through a
 * dungeon before the legendary. Every hall has packs of foes standing around
 * (and some on patrol): you choose when to pull them, and walking too close
 * pulls them for you, sometimes with the pack next to it. Inside a pack every
 * foe has a job: brutes hit hard, casters cast fire bolts from afar, menders
 * heal the pack and guards shield it. Wardens guard the way with their own
 * mechanics, and the last hall is a gauntlet of waves. Only then does the gate
 * to the legendary's arena open.
 *
 * The map is the raid map (128 × 128 tiles) with the boss arena in the middle
 * (ARENA_C, ARENA_R): the rooms wind around it and the last hall runs into
 * the arena, so the boss fight itself works exactly like a classic raid.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type FoeRole = 'brute' | 'caster' | 'mender' | 'guard'

/** A kind of foe: species, how many (for one player), level, its job. */
export interface FoeSpec {
  sp: number
  n: number
  lv: number
  /** Bigger and tougher, with a name tag. */
  elite?: boolean
  role?: FoeRole
}

/** A pack standing in a room, at a spot relative to the room's corner. */
export interface PackSpec {
  at: [number, number]
  foes: FoeSpec[]
  /** Walks back and forth between `at` and this spot until pulled. */
  patrol?: [number, number]
  /** Pulling this pack pulls that one too (index in the room's packs). */
  link?: number
}

/** A warden: a big Pokémon with its own health bar, telegraphed attacks and an enrage timer. */
export interface Warden {
  sp: number
  lv: number
  /** HP multiplier (one player; more players scale it up). */
  hp: number
  title: string
  /** Where it waits, relative to the room's corner. */
  at: [number, number]
  attacks: BossAttack[]
  /** Foes it calls in when its health drops below these shares. */
  calls?: { at: number; foes: FoeSpec[] }[]
  /** Seconds after the pull before it enrages (faster, harder attacks). */
  enrage: number
  /** What it leaves behind for the team. */
  relic: Relic
}

export type Relic = 'ember' | 'shell'

export interface Wave {
  foes: FoeSpec[]
  /** Shown big: "Final wave". */
  final?: boolean
}

export type RoomDeco =
  // The Burning Depths
  | 'gate' | 'river' | 'hall' | 'forge' | 'den' | 'bastion'
  // The Storm Tower
  | 'sgate' | 'flooded' | 'chapel' | 'dynamo' | 'cistern' | 'ramparts'
  // The Frozen Citadel
  | 'igate' | 'frozen' | 'pillars' | 'icefall' | 'icelake' | 'summit'
  // The Sky Pillar
  | 'skygate' | 'cloister' | 'aerie' | 'gallery' | 'belfry' | 'peak'
  // The Forsaken Lab
  | 'airlock' | 'archive' | 'cloning' | 'reactor' | 'mind' | 'core'
  // The Whirl Islands
  | 'shore' | 'tidepool' | 'grotto' | 'wreck' | 'falls' | 'sanctum'
  // The Distortion World
  | 'portal' | 'upside' | 'crypt' | 'mirror' | 'spiral' | 'abyss'

/** A dungeon's element: what its casters throw, how its foes arrive, what its relics are called. */
export interface DungeonTheme {
  /** Hazard type of its casters' bolts, pools and room hazards. */
  type: 'fire' | 'electric' | 'ice' | 'dragon' | 'psychic' | 'water' | 'ghost'
  /** Effect (and sound) of its casters' bolts and its foes' arrival. */
  fx: MoveFx
  /** Colours of a foe's arrival burst, hot to cool. */
  burst: string[]
  /** Accent colour for its banners and rings. */
  accent: string
  /** Its casters' bolts, in a tip ("fire bolts"). */
  bolts: () => string
  /** The relics its wardens drop: the damage one and the defence one. */
  relics: { ember: () => string; shell: () => string }
  /** Its icon (relic, menu button) and the dark colour of its menu button. */
  icon: string
  dark: string
  /** The banner on the way to the boss ("To the crater"). */
  toBoss: () => string
  /** Loading tips in its own words: its wardens, its "lava", the partner advice and the way to the boss. */
  tips: { wardens: () => string; liquid: () => string; partner: () => string; boss: (name: string) => string }
}

export interface Room {
  name: string
  rect: Rect
  deco: RoomDeco
  packs?: PackSpec[]
  warden?: Warden
  /** A gauntlet: waves one after the other once you walk in. */
  waves?: Wave[]
}

export interface DungeonDef {
  id: string
  boss: BossId
  theme: DungeonTheme
  name: string
  blurb: string
  /** Where everyone starts (tiles). */
  start: [number, number]
  rooms: Room[]
  /** Corridors between rooms; the last one runs into the boss arena. */
  halls: Rect[]
  /** gates[i] closes room i's way out until it's cleared (the last one is the arena gate). */
  gates: Rect[]
  /** Where you come back in the boss fight (just inside the arena). */
  arenaEntry: [number, number]
  /** Lives for the whole run. */
  lives: number
  /** The story told before the run starts. */
  intro?: Cinematic
  /** The scene when its legendary falls (before the victory screen). */
  outro?: Cinematic
}

const fire = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'fire', phase: 0, weight: 1, ...a })
const f = (sp: number, n: number, lv: number, role?: FoeRole, elite?: boolean): FoeSpec => ({ sp, n, lv, ...(role ? { role } : {}), ...(elite ? { elite } : {}) })

/** The Storm Tower winds the other way round the arena: rooms mirrored left to right. */
const MAPW = 128
const mx = (r: Rect): Rect => ({ x: MAPW - r.x - r.w, y: r.y, w: r.w, h: r.h })
/** A spot inside a room of width w, mirrored. */
const ma = (w: number, at: [number, number]): [number, number] => [w - 1 - at[0], at[1]]
/** The Frozen Citadel runs the other way: rooms mirrored top to bottom (you start at the top). */
const my = (r: Rect): Rect => ({ x: r.x, y: MAPW - r.y - r.h, w: r.w, h: r.h })
/** A spot inside a room of height h, mirrored top to bottom. */
const mya = (h: number, at: [number, number]): [number, number] => [at[0], h - 1 - at[1]]
const ic = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'ice', phase: 0, weight: 1, ...a })
/** The Sky Pillar winds round the arena the fourth way: mirrored both ways (you start top right). */
const mxy = (r: Rect): Rect => mx(my(r))
const mxya = (w: number, h: number, at: [number, number]): [number, number] => [w - 1 - at[0], h - 1 - at[1]]
const dr = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'dragon', phase: 0, weight: 1, ...a })
const fl = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'flying', phase: 0, weight: 1, ...a })
/** The Forsaken Lab winds round the arena a fifth way: the Depths turned over its diagonal (you start top right, head west along the top, then down). */
const mt = (r: Rect): Rect => ({ x: r.y, y: r.x, w: r.h, h: r.w })
const mta = (at: [number, number]): [number, number] => [at[1], at[0]]
const ps = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'psychic', phase: 0, weight: 1, ...a })
/** The Whirl Islands: the Storm Tower turned over its diagonal (you start bottom right, head west along the bottom, then up). */
const mtx = (r: Rect): Rect => mt(mx(r))
const mtxa = (w: number, at: [number, number]): [number, number] => mta(ma(w, at))
/** The Distortion World: the Frozen Citadel turned over its diagonal (you start top left, head east along the top, then down). */
const mty = (r: Rect): Rect => mt(my(r))
const mtya = (h: number, at: [number, number]): [number, number] => mta(mya(h, at))
const wa = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'water', phase: 0, weight: 1, ...a })
const gh = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'ghost', phase: 0, weight: 1, ...a })
const el = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'electric', phase: 0, weight: 1, ...a })

export const DUNGEONS: Partial<Record<BossId, DungeonDef>> = {
  reshiram: {
    id: 'depths',
    boss: 'reshiram',
    theme: {
      type: 'fire', fx: 'fireblast', burst: ['#fff2a0', '#ffc840', '#ff7020'], accent: '#ff7a30',
      bolts: () => L('fire bolts', 'vuurballen'),
      relics: { ember: () => L('Ember of the Flame', 'Sintel van de Vlam'), shell: () => L('Shell of the Volcano', 'Pantser van de Vulkaan') },
      icon: '🔥', dark: '#5a2a1c',
      toBoss: () => L('To the crater', 'Naar de krater'),
      tips: {
        wardens: () => L('Two wardens guard the way, each with their own tricks: a Living Bomb that follows you, pools of magma (don\'t stand in the fire!). They call help and enrage after two minutes. Beat one for a relic for the team and a life back.', 'Twee wachters bewaken de weg, elk met eigen trucs: een Levende Bom die je volgt, poelen van magma (niet in het vuur staan!). Ze roepen hulp en worden na twee minuten woedend. Versla er een voor een reliek voor het team en een leven terug.'),
        liquid: () => L('Lava burns: cross at the bridges.', 'Lava brandt: steek over bij de bruggen.'),
        partner: () => L('Everything down here is fire. Types still count, but no more than 1.5× either way: no partner carries you through.', 'Alles hier beneden is vuur. Types tellen mee, maar nooit meer dan 1,5× (beide kanten op): geen partner sleept je erdoorheen.'),
        boss: (n) => L(`After the last stand the gate to the crater opens. Step in and ${n} wakes: you have 4 minutes. `, `Na het laatste gevecht gaat de poort naar de krater open. Stap erin en ${n} ontwaakt: je hebt 4 minuten. `),
      },
    },
    get name() { return L('The Burning Depths', 'De Brandende Diepten') },
    get blurb() { return L('Fight down through the volcano: halls full of fire Pokémon packs, two wardens, a last stand, and Reshiram waiting in the crater.', 'Vecht je een weg door de vulkaan: zalen vol groepen vuur-Pokémon, twee wachters, een laatste stand, en Reshiram wacht in de krater.') },
    start: [21, 117],
    lives: 3,
    // One flight through the dungeon, past its wardens, to its legendary
    intro: {
      id: 'depths-intro',
      shots: [
        {
          src: 'depths-intro', len: 22.5, lines: [
            { at: 0.6, until: 3.2, title: true, text: () => L('THE BURNING DEPTHS', 'DE BRANDENDE DIEPTEN'), kicker: () => L('Raid dungeon', 'Raid-dungeon') },
            { at: 18.4, until: 22.5, title: true, text: () => 'RESHIRAM', kicker: () => L('Lord of the volcano crater', 'Heer van de vulkaankrater') },
          ],
        },
      ],
    },
    outro: {
      id: 'depths-outro',
      shots: [
        {
          src: 'depths-outro', len: 14, lines: [
            { at: 8.8, until: 14, title: true, heroes: true, text: () => L('RESHIRAM DEFEATED', 'RESHIRAM VERSLAGEN'), kicker: () => L('The crater falls quiet', 'De krater valt stil') },
          ],
        },
      ],
    },
    arenaEntry: [76, 64],
    rooms: [
      {
        get name() { return L('Gate of Ash', 'Poort der As') }, deco: 'gate', rect: { x: 8, y: 98, w: 26, h: 24 },
        packs: [
          { at: [13, 10], foes: [f(58, 2, 41), f(218, 1, 41, 'caster')] },
          { at: [5, 4], foes: [f(554, 1, 42, 'brute'), f(322, 1, 41, 'mender'), f(228, 1, 41)] },
          { at: [20, 4], foes: [f(58, 1, 41), f(218, 2, 41, 'caster')] },
        ],
      },
      {
        get name() { return L('River of Fire', 'Vuurrivier') }, deco: 'river', rect: { x: 8, y: 60, w: 26, h: 24 },
        packs: [
          { at: [7, 18], foes: [f(228, 2, 42), f(322, 1, 42, 'mender')] },
          { at: [20, 18], foes: [f(126, 1, 44, 'caster', true), f(228, 2, 42)] },
          { at: [5, 6], patrol: [21, 6], foes: [f(228, 1, 43), f(58, 1, 42)] },
          { at: [13, 3], link: 2, foes: [f(554, 1, 43, 'brute'), f(218, 1, 42, 'guard'), f(218, 1, 42, 'caster')] },
        ],
      },
      {
        get name() { return L('Warden\'s Hall', 'Wachterszaal') }, deco: 'hall', rect: { x: 5, y: 16, w: 32, h: 30 },
        packs: [
          { at: [8, 22], foes: [f(240, 2, 43), f(322, 1, 43, 'mender')] },
          { at: [24, 22], foes: [f(126, 1, 44, 'brute'), f(240, 1, 43, 'caster')] },
        ],
        warden: {
          sp: 467, lv: 48, hp: 6, at: [16, 7], enrage: 120, relic: 'ember', get title() { return L('Warden of the Flame', 'Wachter van de Vlam') },
          calls: [{ at: 0.6, foes: [f(240, 1, 43, 'caster'), f(240, 1, 42)] }, { at: 0.3, foes: [f(126, 1, 44, 'brute'), f(240, 1, 43, 'mender')] }],
          attacks: [
            fire({ id: 'w_flame', name: 'Flamethrower', shape: 'cone', warn: 1.1, cd: 4, dmg: 0.32, target: 'nearest', len: 8, width: 0.45, weight: 3, fx: 'flamethrower' }),
            fire({ id: 'w_bomb', get name() { return L('Living Bomb', 'Levende Bom') }, shape: 'circle', warn: 3.6, cd: 11, dmg: 0.4, target: 'random', r: 2.6, weight: 3, follow: true, linger: { dur: 7, dps: 0.12 }, fx: 'fireblast' }),
            fire({ id: 'w_blast', name: 'Fire Blast', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.3, target: 'players', r: 2.1, extra: 2, stagger: 0.15, weight: 2, fx: 'fireblast' }),
            fire({ id: 'w_heat', get name() { return L('Heat Wave', 'Hittegolf') }, shape: 'circle', warn: 1.4, cd: 9, dmg: 0.34, target: 'self', r: 3.8, weight: 2, fx: 'fireblast' }),
          ],
        },
      },
      {
        get name() { return L('The Forges', 'De Smeltovens') }, deco: 'forge', rect: { x: 53, y: 8, w: 28, h: 28 },
        packs: [
          { at: [7, 13], foes: [f(607, 2, 44, 'caster'), f(636, 1, 44)] },
          { at: [14, 22], foes: [f(324, 1, 46, 'guard', true), f(499, 1, 44, 'brute'), f(607, 1, 44, 'caster')] },
          { at: [14, 5], foes: [f(391, 2, 44), f(636, 1, 44, 'mender')] },
          { at: [22, 14], link: 2, foes: [f(499, 1, 45, 'brute'), f(391, 1, 44), f(607, 1, 44, 'mender')] },
        ],
      },
      {
        get name() { return L('Den of the Hounds', 'Hol van de Honden') }, deco: 'den', rect: { x: 96, y: 6, w: 26, h: 30 },
        packs: [
          { at: [5, 6], foes: [f(228, 3, 44)] },
          { at: [5, 24], foes: [f(229, 1, 46, 'brute', true), f(228, 1, 44, 'mender')] },
        ],
        warden: {
          sp: 323, lv: 49, hp: 6.5, at: [14, 16], enrage: 130, relic: 'shell', get title() { return L('Heart of the Volcano', 'Hart van de Vulkaan') },
          calls: [{ at: 0.65, foes: [f(228, 3, 44)] }, { at: 0.35, foes: [f(229, 1, 46, 'brute', true), f(228, 1, 44, 'mender')] }],
          attacks: [
            fire({ id: 'w_erupt', get name() { return L('Eruption', 'Uitbarsting') }, shape: 'ring', warn: 1.4, cd: 7, dmg: 0.34, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'earthpower' }),
            fire({ id: 'w_quake', get name() { return L('Earthquake', 'Aardbeving') }, shape: 'circle', warn: 1.35, cd: 8, dmg: 0.32, target: 'self', r: 4.2, weight: 2, fx: 'earthpower' }),
            fire({ id: 'w_pool', get name() { return L('Magma Flood', 'Magmavloed') }, shape: 'circle', warn: 1.5, cd: 9, dmg: 0.22, target: 'players', r: 2.4, extra: 2, stagger: 0.2, weight: 3, linger: { dur: 9, dps: 0.1 }, fx: 'fireblast' }),
            fire({ id: 'w_rocks', name: 'Lava Plume', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 2, fx: 'fireblast' }),
          ],
        },
      },
      {
        get name() { return L('Last Bastion', 'Laatste Bastion') }, deco: 'bastion', rect: { x: 92, y: 54, w: 30, h: 28 },
        waves: [
          { foes: [f(229, 2, 45), f(219, 1, 44, 'guard'), f(219, 1, 44, 'caster')] },
          { foes: [f(555, 1, 46, 'brute', true), f(126, 2, 45, 'caster'), f(631, 1, 45, 'mender')] },
          { final: true, foes: [f(59, 1, 47, 'brute', true), f(609, 1, 47, 'caster', true), f(126, 1, 45, 'mender'), f(631, 2, 45), f(219, 1, 45, 'guard')] },
        ],
      },
    ],
    halls: [
      { x: 18, y: 84, w: 5, h: 14 },
      { x: 18, y: 46, w: 5, h: 14 },
      { x: 37, y: 26, w: 16, h: 5 },
      { x: 81, y: 18, w: 15, h: 5 },
      { x: 106, y: 36, w: 5, h: 18 },
      { x: 76, y: 62, w: 16, h: 5 },
    ],
    gates: [
      { x: 18, y: 96, w: 5, h: 2 },
      { x: 18, y: 58, w: 5, h: 2 },
      { x: 37, y: 26, w: 2, h: 5 },
      { x: 81, y: 18, w: 2, h: 5 },
      { x: 106, y: 36, w: 5, h: 2 },
      { x: 89, y: 62, w: 2, h: 5 },
    ],
  },
  zekrom: {
    id: 'storm',
    boss: 'zekrom',
    theme: {
      type: 'electric', fx: 'thunder', burst: ['#ffffff', '#fff27a', '#5ab8ff'], accent: '#ffd23a',
      bolts: () => L('lightning bolts', 'bliksemschichten'),
      relics: { ember: () => L('Spark of the Storm', 'Vonk van de Storm'), shell: () => L('Coil of the Deep', 'Spoel van de Diepte') },
      icon: '⚡', dark: '#1c2a5a',
      toBoss: () => L('To the roof', 'Naar het dak'),
      tips: {
        wardens: () => L('Two wardens guard the way, each with their own tricks: a Static Charge that follows you, a Zap Cannon in a straight line, fields of current (don\'t stand in them!). They call help and enrage after two minutes. Beat one for a relic for the team and a life back.', 'Twee wachters bewaken de weg, elk met eigen trucs: een Statische Lading die je volgt, een Zap Cannon in een rechte lijn, velden vol stroom (niet in gaan staan!). Ze roepen hulp en worden na twee minuten woedend. Versla er een voor een reliek voor het team en een leven terug.'),
        liquid: () => L('Charged water shocks: walk around it, and get away from the pools when they light up.', 'Water onder stroom schokt: loop eromheen, en ga weg bij de plassen als ze oplichten.'),
        partner: () => L('Everything in this tower is electric. Types still count, but no more than 1.5× either way: no partner carries you through.', 'Alles in deze toren is elektrisch. Types tellen mee, maar nooit meer dan 1,5× (beide kanten op): geen partner sleept je erdoorheen.'),
        boss: (n) => L(`After the battlements the way to the roof opens. Step out and ${n} wakes: you have 4 minutes. `, `Na de kantelen gaat de weg naar het dak open. Stap naar buiten en ${n} ontwaakt: je hebt 4 minuten. `),
      },
    },
    get name() { return L('The Storm Tower', 'De Stormtoren') },
    get blurb() { return L('Climb the ruined tower through the storm: flooded halls that come alive with current, a thunder chapel, a hall of humming dynamos, a drowned cistern, the battlements, and Zekrom waiting on the roof.', 'Beklim de verwoeste toren door de storm: ondergelopen zalen waar stroom door het water jaagt, een donderkapel, een zaal vol zoemende dynamo\'s, een verdronken cisterne, de kantelen, en Zekrom wacht op het dak.') },
    start: [106, 117],
    lives: 3,
    intro: {
      id: 'storm-intro',
      look: 'storm',
      shots: [
        {
          src: 'storm-intro', len: 22.5, lines: [
            { at: 0.6, until: 3.2, title: true, text: () => L('THE STORM TOWER', 'DE STORMTOREN'), kicker: () => L('Raid dungeon', 'Raid-dungeon') },
            { at: 18.4, until: 22.5, title: true, text: () => 'ZEKROM', kicker: () => L('Ruler of Storm Peak', 'Heerser van de Stormtop') },
          ],
        },
      ],
    },
    outro: {
      id: 'storm-outro',
      look: 'storm',
      shots: [
        {
          src: 'storm-outro', len: 12.2, lines: [
            { at: 8.2, until: 12.2, title: true, heroes: true, text: () => L('ZEKROM DEFEATED', 'ZEKROM VERSLAGEN'), kicker: () => L('The storm breaks', 'De storm breekt') },
          ],
        },
      ],
    },
    arenaEntry: [52, 64],
    rooms: [
      {
        get name() { return L('The Broken Gate', 'De Gebroken Poort') }, deco: 'sgate', rect: mx({ x: 8, y: 98, w: 26, h: 24 }),
        packs: [
          { at: ma(26, [13, 10]), foes: [f(522, 2, 41), f(595, 1, 41, 'caster')] },
          { at: ma(26, [5, 4]), foes: [f(125, 1, 42, 'brute'), f(181, 1, 41, 'mender'), f(81, 1, 41)] },
          { at: ma(26, [20, 4]), foes: [f(522, 1, 41), f(595, 2, 41, 'caster')] },
        ],
      },
      {
        get name() { return L('The Flooded Hall', 'De Ondergelopen Hal') }, deco: 'flooded', rect: mx({ x: 8, y: 60, w: 26, h: 24 }),
        packs: [
          { at: ma(26, [7, 18]), foes: [f(602, 2, 42), f(603, 1, 42, 'mender')] },
          { at: ma(26, [20, 18]), foes: [f(479, 1, 44, 'caster', true), f(522, 2, 42)] },
          { at: ma(26, [5, 6]), patrol: ma(26, [21, 6]), foes: [f(523, 1, 43), f(522, 1, 42)] },
          { at: ma(26, [13, 3]), link: 2, foes: [f(125, 1, 43, 'brute'), f(82, 1, 42, 'guard'), f(81, 1, 42, 'caster')] },
        ],
      },
      {
        get name() { return L('The Thunder Chapel', 'De Donderkapel') }, deco: 'chapel', rect: mx({ x: 5, y: 16, w: 32, h: 30 }),
        packs: [
          { at: ma(32, [8, 22]), foes: [f(310, 2, 43), f(181, 1, 43, 'mender')] },
          { at: ma(32, [24, 22]), foes: [f(125, 1, 44, 'brute'), f(479, 1, 43, 'caster')] },
        ],
        warden: {
          sp: 466, lv: 48, hp: 6, at: ma(32, [16, 7]), enrage: 120, relic: 'ember', get title() { return L('Warden of Thunder', 'Wachter van de Donder') },
          calls: [{ at: 0.6, foes: [f(125, 1, 43, 'caster'), f(310, 1, 42)] }, { at: 0.3, foes: [f(125, 1, 44, 'brute'), f(181, 1, 43, 'mender')] }],
          attacks: [
            el({ id: 'e_punch', name: 'Thunder Punch', shape: 'cone', warn: 1.1, cd: 4, dmg: 0.32, target: 'nearest', len: 7, width: 0.45, weight: 3, fx: 'discharge' }),
            el({ id: 'e_static', get name() { return L('Static Charge', 'Statische Lading') }, shape: 'circle', warn: 3.6, cd: 11, dmg: 0.4, target: 'random', r: 2.6, weight: 3, follow: true, linger: { dur: 7, dps: 0.12 }, fx: 'thunder' }),
            el({ id: 'e_thunder', name: 'Thunder', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.3, target: 'players', r: 2.1, extra: 2, stagger: 0.15, weight: 2, fx: 'thunder' }),
            el({ id: 'e_discharge', name: 'Discharge', shape: 'circle', warn: 1.4, cd: 9, dmg: 0.34, target: 'self', r: 3.8, weight: 2, fx: 'discharge' }),
          ],
        },
      },
      {
        get name() { return L('The Dynamo Hall', 'De Dynamozaal') }, deco: 'dynamo', rect: mx({ x: 53, y: 8, w: 28, h: 28 }),
        packs: [
          { at: ma(28, [7, 13]), foes: [f(81, 2, 44, 'caster'), f(82, 1, 44)] },
          { at: ma(28, [14, 22]), foes: [f(462, 1, 46, 'guard', true), f(125, 1, 44, 'brute'), f(81, 1, 44, 'caster')] },
          { at: ma(28, [14, 5]), foes: [f(595, 2, 44), f(596, 1, 44, 'mender')] },
          { at: ma(28, [22, 14]), link: 2, foes: [f(523, 1, 45, 'brute'), f(522, 1, 44), f(181, 1, 44, 'mender')] },
        ],
      },
      {
        get name() { return L('The Drowned Cistern', 'De Verdronken Cisterne') }, deco: 'cistern', rect: mx({ x: 96, y: 6, w: 26, h: 30 }),
        packs: [
          { at: ma(26, [5, 6]), foes: [f(595, 3, 44)] },
          { at: ma(26, [5, 24]), foes: [f(596, 1, 46, 'brute', true), f(603, 1, 44, 'mender')] },
        ],
        warden: {
          sp: 604, lv: 49, hp: 6.5, at: ma(26, [14, 16]), enrage: 130, relic: 'shell', get title() { return L('Terror of the Deep', 'Verschrikking van de Diepte') },
          calls: [{ at: 0.65, foes: [f(602, 3, 44)] }, { at: 0.35, foes: [f(596, 1, 46, 'brute', true), f(603, 1, 44, 'mender')] }],
          attacks: [
            el({ id: 'x_ring', name: 'Discharge', shape: 'ring', warn: 1.4, cd: 7, dmg: 0.34, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'discharge' }),
            el({ id: 'x_zap', name: 'Zap Cannon', shape: 'line', warn: 1.35, cd: 7, dmg: 0.34, target: 'nearest', len: 13, width: 1.5, weight: 3, fx: 'discharge' }),
            el({ id: 'x_pool', get name() { return L('Electric Terrain', 'Elektrisch Veld') }, shape: 'circle', warn: 1.5, cd: 9, dmg: 0.22, target: 'players', r: 2.4, extra: 2, stagger: 0.2, weight: 3, linger: { dur: 9, dps: 0.1 }, fx: 'thunder' }),
            el({ id: 'x_wave', name: 'Thunder Wave', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 2, fx: 'thunder' }),
          ],
        },
      },
      {
        get name() { return L('The Battlements', 'De Kantelen') }, deco: 'ramparts', rect: mx({ x: 92, y: 54, w: 30, h: 28 }),
        waves: [
          { foes: [f(523, 2, 45), f(82, 1, 44, 'guard'), f(479, 1, 44, 'caster')] },
          { foes: [f(405, 1, 46, 'brute', true), f(479, 2, 45, 'caster'), f(181, 1, 45, 'mender')] },
          { final: true, foes: [f(523, 1, 47, 'brute', true), f(462, 1, 47, 'caster', true), f(181, 1, 45, 'mender'), f(310, 2, 45), f(82, 1, 45, 'guard')] },
        ],
      },
    ],
    halls: [
      mx({ x: 18, y: 84, w: 5, h: 14 }),
      mx({ x: 18, y: 46, w: 5, h: 14 }),
      mx({ x: 37, y: 26, w: 16, h: 5 }),
      mx({ x: 81, y: 18, w: 15, h: 5 }),
      mx({ x: 106, y: 36, w: 5, h: 18 }),
      mx({ x: 76, y: 62, w: 16, h: 5 }),
    ],
    gates: [
      mx({ x: 18, y: 96, w: 5, h: 2 }),
      mx({ x: 18, y: 58, w: 5, h: 2 }),
      mx({ x: 37, y: 26, w: 2, h: 5 }),
      mx({ x: 81, y: 18, w: 2, h: 5 }),
      mx({ x: 106, y: 36, w: 5, h: 2 }),
      mx({ x: 89, y: 62, w: 2, h: 5 }),
    ],
  },
  kyurem: {
    id: 'citadel',
    boss: 'kyurem',
    theme: {
      type: 'ice', fx: 'blizzard', burst: ['#ffffff', '#c8f0ff', '#7ac8ff'], accent: '#8ad8ff',
      bolts: () => L('ice shards', 'ijsscherven'),
      relics: { ember: () => L('Tusk of the Mammoth', 'Slagtand van de Mammoet'), shell: () => L('Hide of the Frozen Lake', 'Vacht van het IJsmeer') },
      icon: '❄️', dark: '#1c3a52',
      toBoss: () => L('To the summit', 'Naar de top'),
      tips: {
        wardens: () => L('Two wardens guard the way, each with their own tricks: Frozen Ground that follows you, an Ice Beam in a straight line that can freeze you, fields of freezing water (don\'t stand in them!). They call help and enrage after two minutes. Beat one for a relic for the team and a life back.', 'Twee wachters bewaken de weg, elk met eigen trucs: Bevroren Grond die je volgt, een Ice Beam in een rechte lijn die je kan bevriezen, velden ijswater (niet in gaan staan!). Ze roepen hulp en worden na twee minuten woedend. Versla er een voor een reliek voor het team en een leven terug.'),
        liquid: () => L('The open water freezes you to the bone: stay on the ice, and step back when a hole starts to frost over. Watch the ceiling for icicles.', 'Het open water bevriest je tot op het bot: blijf op het ijs, en stap terug als een wak begint te bevriezen. Let op het plafond: ijspegels vallen.'),
        partner: () => L('Everything in this citadel is ice. Types still count, but no more than 1.5× either way: no partner carries you through.', 'Alles in deze citadel is ijs. Types tellen mee, maar nooit meer dan 1,5× (beide kanten op): geen partner sleept je erdoorheen.'),
        boss: (n) => L(`After the ice walls the way to the summit opens. Step out and ${n} wakes: you have 4 minutes. `, `Na de ijswallen gaat de weg naar de top open. Stap naar buiten en ${n} ontwaakt: je hebt 4 minuten. `),
      },
    },
    get name() { return L('The Frozen Citadel', 'De IJscitadel') },
    get blurb() { return L('Fight down through a citadel swallowed by the glacier: halls of creatures frozen in the ice, falling icicles, a frozen lake that breaks open, the ice walls, and Kyurem waiting at the summit.', 'Vecht je een weg door een citadel die de gletsjer heeft opgeslokt: zalen vol in ijs gevangen Pokémon, vallende ijspegels, een bevroren meer dat openbreekt, de ijswallen, en Kyurem wacht op de top.') },
    start: [21, 10],
    lives: 3,
    intro: {
      id: 'citadel-intro',
      look: 'ice',
      shots: [
        {
          src: 'citadel-intro', len: 22.5, lines: [
            { at: 0.6, until: 3.2, title: true, text: () => L('THE FROZEN CITADEL', 'DE IJSCITADEL'), kicker: () => L('Raid dungeon', 'Raid-dungeon') },
            { at: 18.4, until: 22.5, title: true, text: () => 'KYUREM', kicker: () => L('The frozen dragon', 'De bevroren draak') },
          ],
        },
      ],
    },
    outro: {
      id: 'citadel-outro',
      look: 'ice',
      shots: [
        {
          src: 'citadel-outro', len: 12.2, lines: [
            { at: 8.2, until: 12.2, title: true, heroes: true, text: () => L('KYUREM DEFEATED', 'KYUREM VERSLAGEN'), kicker: () => L('The ice breaks', 'Het ijs breekt') },
          ],
        },
      ],
    },
    arenaEntry: [76, 63],
    rooms: [
      {
        get name() { return L('The Frozen Gate', 'De Bevroren Poort') }, deco: 'igate', rect: my({ x: 8, y: 98, w: 26, h: 24 }),
        packs: [
          { at: mya(24, [13, 10]), foes: [f(361, 2, 41), f(582, 1, 41, 'caster')] },
          { at: mya(24, [5, 4]), foes: [f(613, 1, 42, 'brute'), f(225, 1, 41, 'mender'), f(86, 1, 41)] },
          { at: mya(24, [20, 4]), foes: [f(361, 1, 41), f(582, 2, 41, 'caster')] },
        ],
      },
      {
        get name() { return L('Hall of the Frozen', 'Zaal der Bevrorenen') }, deco: 'frozen', rect: my({ x: 8, y: 60, w: 26, h: 24 }),
        packs: [
          { at: mya(24, [7, 18]), foes: [f(220, 2, 42), f(225, 1, 42, 'mender')] },
          { at: mya(24, [20, 18]), foes: [f(615, 1, 44, 'caster', true), f(361, 2, 42)] },
          { at: mya(24, [5, 6]), patrol: mya(24, [21, 6]), foes: [f(215, 1, 43), f(361, 1, 42)] },
          { at: mya(24, [13, 3]), link: 2, foes: [f(614, 1, 43, 'brute'), f(91, 1, 42, 'guard'), f(583, 1, 42, 'caster')] },
        ],
      },
      {
        get name() { return L('The Pillar Hall', 'De Pilarenzaal') }, deco: 'pillars', rect: my({ x: 5, y: 16, w: 32, h: 30 }),
        packs: [
          { at: mya(30, [8, 22]), foes: [f(215, 2, 43), f(225, 1, 43, 'mender')] },
          { at: mya(30, [24, 22]), foes: [f(614, 1, 44, 'brute'), f(124, 1, 43, 'caster')] },
        ],
        warden: {
          sp: 473, lv: 48, hp: 6, at: mya(30, [16, 7]), enrage: 120, relic: 'ember', get title() { return L('Warden of the Frost', 'Wachter van de Vorst') },
          calls: [{ at: 0.6, foes: [f(459, 1, 43, 'caster'), f(220, 1, 42)] }, { at: 0.3, foes: [f(221, 1, 44, 'brute'), f(225, 1, 43, 'mender')] }],
          attacks: [
            ic({ id: 'm_ava', name: 'Avalanche', shape: 'cone', warn: 1.1, cd: 4, dmg: 0.32, target: 'nearest', len: 7, width: 0.45, weight: 3, fx: 'blizzard' }),
            ic({ id: 'm_frost', get name() { return L('Frozen Ground', 'Bevroren Grond') }, shape: 'circle', warn: 3.6, cd: 11, dmg: 0.4, target: 'random', r: 2.6, weight: 3, follow: true, linger: { dur: 7, dps: 0.12 }, fx: 'blizzard' }),
            ic({ id: 'm_crash', name: 'Icicle Crash', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.3, target: 'players', r: 2.1, extra: 2, stagger: 0.15, weight: 2, fx: 'stoneedge' }),
            ic({ id: 'm_quake', get name() { return L('Earthquake', 'Aardbeving') }, shape: 'circle', warn: 1.4, cd: 9, dmg: 0.34, target: 'self', r: 3.8, weight: 2, fx: 'quake' }),
          ],
        },
      },
      {
        get name() { return L('The Icicle Gallery', 'De IJspegelgalerij') }, deco: 'icefall', rect: my({ x: 53, y: 8, w: 28, h: 28 }),
        packs: [
          { at: mya(28, [7, 13]), foes: [f(583, 2, 44, 'caster'), f(459, 1, 44)] },
          { at: mya(28, [14, 22]), foes: [f(362, 1, 46, 'guard', true), f(614, 1, 44, 'brute'), f(583, 1, 44, 'caster')] },
          { at: mya(28, [14, 5]), foes: [f(86, 2, 44), f(225, 1, 44, 'mender')] },
          { at: mya(28, [22, 14]), link: 2, foes: [f(461, 1, 45, 'brute'), f(215, 1, 44), f(225, 1, 44, 'mender')] },
        ],
      },
      {
        get name() { return L('The Frozen Lake', 'Het Bevroren Meer') }, deco: 'icelake', rect: my({ x: 96, y: 6, w: 26, h: 30 }),
        packs: [
          { at: mya(30, [5, 6]), foes: [f(363, 3, 44)] },
          { at: mya(30, [5, 24]), foes: [f(364, 1, 46, 'brute', true), f(86, 1, 44, 'mender')] },
        ],
        warden: {
          sp: 365, lv: 49, hp: 6.5, at: mya(30, [14, 16]), enrage: 130, relic: 'shell', get title() { return L('Terror of the Frozen Lake', 'Verschrikking van het IJsmeer') },
          calls: [{ at: 0.65, foes: [f(363, 3, 44)] }, { at: 0.35, foes: [f(364, 1, 46, 'brute', true), f(87, 1, 44, 'mender')] }],
          attacks: [
            ic({ id: 'i_ring', name: 'Sheer Cold', shape: 'ring', warn: 1.4, cd: 7, dmg: 0.34, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'blizzard' }),
            ic({ id: 'i_beam', name: 'Ice Beam', shape: 'line', warn: 1.35, cd: 7, dmg: 0.34, target: 'nearest', len: 13, width: 1.5, weight: 3, freeze: 0.6, fx: 'icebeam' }),
            ic({ id: 'i_pool', get name() { return L('Freezing Water', 'IJswater') }, shape: 'circle', warn: 1.5, cd: 9, dmg: 0.22, target: 'players', r: 2.4, extra: 2, stagger: 0.2, weight: 3, linger: { dur: 9, dps: 0.1 }, fx: 'blizzard' }),
            ic({ id: 'i_hail', name: 'Hail', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 2, fx: 'stoneedge' }),
          ],
        },
      },
      {
        get name() { return L('The Ice Walls', 'De IJswallen') }, deco: 'summit', rect: my({ x: 92, y: 54, w: 30, h: 28 }),
        waves: [
          { foes: [f(461, 2, 45), f(362, 1, 44, 'guard'), f(478, 1, 44, 'caster')] },
          { foes: [f(460, 1, 46, 'brute', true), f(478, 2, 45, 'caster'), f(225, 1, 45, 'mender')] },
          { final: true, foes: [f(614, 1, 47, 'brute', true), f(584, 1, 47, 'caster', true), f(225, 1, 45, 'mender'), f(461, 2, 45), f(362, 1, 45, 'guard')] },
        ],
      },
    ],
    halls: [
      my({ x: 18, y: 84, w: 5, h: 14 }),
      my({ x: 18, y: 46, w: 5, h: 14 }),
      my({ x: 37, y: 26, w: 16, h: 5 }),
      my({ x: 81, y: 18, w: 15, h: 5 }),
      my({ x: 106, y: 36, w: 5, h: 18 }),
      my({ x: 76, y: 62, w: 16, h: 5 }),
    ],
    gates: [
      my({ x: 18, y: 96, w: 5, h: 2 }),
      my({ x: 18, y: 58, w: 5, h: 2 }),
      my({ x: 37, y: 26, w: 2, h: 5 }),
      my({ x: 81, y: 18, w: 2, h: 5 }),
      my({ x: 106, y: 36, w: 5, h: 2 }),
      my({ x: 89, y: 62, w: 2, h: 5 }),
    ],
  },
  rayquaza: {
    id: 'pillar',
    boss: 'rayquaza',
    theme: {
      type: 'dragon', fx: 'hurricane', burst: ['#ffffff', '#c8f8e0', '#58d090'], accent: '#58d090',
      bolts: () => L('gusts of wind', 'windstoten'),
      relics: { ember: () => L('Feather of the Gale', 'Veer van de Storm'), shell: () => L('Scale of the Sky', 'Schub van de Hemel') },
      icon: '🌪️', dark: '#1c4a3a',
      toBoss: () => L('To the top', 'Naar de top'),
      tips: {
        wardens: () => L('Two wardens guard the way up, each with their own tricks: a Twister that follows you, Dragon Breath in a cone, a Hyper Beam in a straight line, Draco Meteors raining down. They call help and enrage after two minutes. Beat one for a relic for the team and a life back.', 'Twee wachters bewaken de weg omhoog, elk met eigen trucs: een Wervelwind die je volgt, Drakenadem in een kegel, een Hyper Beam in een rechte lijn, regens van Draco Meteors. Ze roepen hulp en worden na twee minuten woedend. Versla er een voor een reliek voor het team en een leven terug.'),
        liquid: () => L('Where the floor has broken away there is only sky: don\'t step into the gaps. Cracked stone gives way under your feet, and in the wind gallery the gusts push you toward the edge.', 'Waar de vloer is weggebroken is alleen lucht: stap niet in de gaten. Gebarsten steen bezwijkt onder je voeten, en in de windgalerij duwen de windstoten je naar de rand.'),
        partner: () => L('Everything up here is dragons and birds. Types still count, but no more than 1.5× either way: no partner carries you through.', 'Alles hier boven is draak en vogel. Types tellen mee, maar nooit meer dan 1,5× (beide kanten op): geen partner sleept je erdoorheen.'),
        boss: (n) => L(`After the peak the way to the top opens. Step out and ${n} comes down from the storm: you have 4 minutes. `, `Na de top gaat de weg naar het dak open. Stap naar buiten en ${n} daalt neer uit de storm: je hebt 4 minuten. `),
      },
    },
    get name() { return L('The Sky Pillar', 'De Hemelpilaar') },
    get blurb() { return L('Climb an ancient tower above the clouds: crumbling cloisters, a dragons\' aerie, a gallery where the wind tries to blow you off, the old bell tower, and Rayquaza circling above the top.', 'Klim een eeuwenoude toren boven de wolken op: afbrokkelende kloostergangen, een drakennest, een galerij waar de wind je eraf probeert te blazen, de oude klokkentoren, en Rayquaza cirkelt boven de top.') },
    start: [106, 10],
    lives: 3,
    intro: {
      id: 'pillar-intro',
      look: 'sky',
      shots: [
        {
          src: 'pillar-intro', len: 22.5, lines: [
            { at: 0.6, until: 3.2, title: true, text: () => L('THE SKY PILLAR', 'DE HEMELPILAAR'), kicker: () => L('Raid dungeon', 'Raid-dungeon') },
            { at: 18.4, until: 22.5, title: true, text: () => 'RAYQUAZA', kicker: () => L('The sky dragon', 'De hemeldraak') },
          ],
        },
      ],
    },
    outro: {
      id: 'pillar-outro',
      look: 'sky',
      shots: [
        {
          src: 'pillar-outro', len: 12.2, lines: [
            { at: 8.2, until: 12.2, title: true, heroes: true, text: () => L('RAYQUAZA DEFEATED', 'RAYQUAZA VERSLAGEN'), kicker: () => L('The storm clears', 'De storm gaat liggen') },
          ],
        },
      ],
    },
    arenaEntry: [51, 63],
    rooms: [
      {
        get name() { return L('The Sky Gate', 'De Hemelpoort') }, deco: 'skygate', rect: mxy({ x: 8, y: 98, w: 26, h: 24 }),
        packs: [
          { at: mxya(26, 24, [13, 10]), foes: [f(17, 2, 41), f(329, 1, 41, 'caster')] },
          { at: mxya(26, 24, [5, 4]), foes: [f(621, 1, 42, 'brute'), f(357, 1, 41, 'mender'), f(397, 1, 41)] },
          { at: mxya(26, 24, [20, 4]), foes: [f(17, 1, 41), f(329, 2, 41, 'caster')] },
        ],
      },
      {
        get name() { return L('The Cloud Cloister', 'Het Wolkenklooster') }, deco: 'cloister', rect: mxy({ x: 8, y: 60, w: 26, h: 24 }),
        packs: [
          { at: mxya(26, 24, [7, 18]), foes: [f(397, 2, 42), f(357, 1, 42, 'mender')] },
          { at: mxya(26, 24, [20, 18]), foes: [f(148, 1, 44, 'caster', true), f(17, 2, 42)] },
          { at: mxya(26, 24, [5, 6]), patrol: mxya(26, 24, [21, 6]), foes: [f(397, 1, 43), f(17, 1, 42)] },
          { at: mxya(26, 24, [13, 3]), link: 2, foes: [f(621, 1, 43, 'brute'), f(227, 1, 42, 'guard'), f(329, 1, 42, 'caster')] },
        ],
      },
      {
        get name() { return L('The Dragons\' Aerie', 'Het Drakennest') }, deco: 'aerie', rect: mxy({ x: 5, y: 16, w: 32, h: 30 }),
        packs: [
          { at: mxya(32, 30, [8, 22]), foes: [f(333, 2, 43), f(357, 1, 43, 'mender')] },
          { at: mxya(32, 30, [24, 22]), foes: [f(611, 1, 44, 'brute'), f(164, 1, 43, 'caster')] },
        ],
        warden: {
          sp: 334, lv: 48, hp: 5.5, at: mxya(32, 30, [16, 7]), enrage: 120, relic: 'ember', get title() { return L('Warden of the Wind', 'Wachter van de Wind') },
          calls: [{ at: 0.6, foes: [f(333, 1, 43, 'caster'), f(397, 1, 42)] }, { at: 0.3, foes: [f(621, 1, 44, 'brute'), f(357, 1, 43, 'mender')] }],
          attacks: [
            dr({ id: 'a_breath', get name() { return L('Dragon Breath', 'Drakenadem') }, shape: 'cone', warn: 1.1, cd: 4, dmg: 0.32, target: 'nearest', len: 8, width: 0.45, weight: 3, fx: 'dragonpulse' }),
            fl({ id: 'a_twister', get name() { return L('Twister', 'Wervelwind') }, shape: 'circle', warn: 3.6, cd: 16, dmg: 0.3, target: 'random', r: 2.4, weight: 2, follow: true, linger: { dur: 5, dps: 0.1 }, fx: 'hurricane' }),
            fl({ id: 'a_sky', name: 'Sky Attack', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.3, target: 'players', r: 2.1, extra: 2, stagger: 0.15, weight: 2, fx: 'hurricane' }),
            dr({ id: 'a_pulse', name: 'Dragon Pulse', shape: 'circle', warn: 1.4, cd: 9, dmg: 0.34, target: 'self', r: 3.8, weight: 2, fx: 'dracometeor' }),
          ],
        },
      },
      {
        get name() { return L('The Wind Gallery', 'De Windgalerij') }, deco: 'gallery', rect: mxy({ x: 53, y: 8, w: 28, h: 28 }),
        packs: [
          { at: mxya(28, 28, [7, 13]), foes: [f(329, 2, 44, 'caster'), f(333, 1, 44)] },
          { at: mxya(28, 28, [14, 22]), foes: [f(227, 1, 46, 'guard', true), f(611, 1, 44, 'brute'), f(329, 1, 44, 'caster')] },
          { at: mxya(28, 28, [14, 5]), foes: [f(397, 2, 44), f(357, 1, 44, 'mender')] },
          { at: mxya(28, 28, [22, 14]), link: 2, foes: [f(611, 1, 45, 'brute'), f(17, 1, 44), f(357, 1, 44, 'mender')] },
        ],
      },
      {
        get name() { return L('The Old Bell Tower', 'De Oude Klokkentoren') }, deco: 'belfry', rect: mxy({ x: 96, y: 6, w: 26, h: 30 }),
        packs: [
          { at: mxya(26, 30, [5, 6]), foes: [f(398, 2, 44), f(397, 1, 44)] },
          { at: mxya(26, 30, [5, 24]), foes: [f(372, 1, 46, 'guard', true), f(621, 1, 44, 'brute'), f(357, 1, 44, 'mender')] },
        ],
        warden: {
          sp: 149, lv: 49, hp: 6.5, at: mxya(26, 30, [14, 16]), enrage: 130, relic: 'shell', get title() { return L('Lord of the Skies', 'Heer van de Hemel') },
          calls: [{ at: 0.65, foes: [f(398, 2, 44)] }, { at: 0.35, foes: [f(372, 1, 46, 'brute', true), f(334, 1, 44, 'mender')] }],
          attacks: [
            fl({ id: 'd_hurricane', name: 'Hurricane', shape: 'ring', warn: 1.4, cd: 7, dmg: 0.34, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'hurricane' }),
            dr({ id: 'd_beam', name: 'Hyper Beam', shape: 'line', warn: 1.35, cd: 7, dmg: 0.34, target: 'nearest', len: 13, width: 1.5, weight: 3, fx: 'hyperbeam' }),
            dr({ id: 'd_twister', get name() { return L('Whirlwind', 'Draaikolk') }, shape: 'circle', warn: 1.5, cd: 9, dmg: 0.22, target: 'players', r: 2.4, extra: 2, stagger: 0.2, weight: 3, linger: { dur: 9, dps: 0.1 }, fx: 'hurricane' }),
            dr({ id: 'd_meteor', name: 'Draco Meteor', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 2, fx: 'dracometeor' }),
          ],
        },
      },
      {
        get name() { return L('The Peak', 'De Top') }, deco: 'peak', rect: mxy({ x: 92, y: 54, w: 30, h: 28 }),
        waves: [
          { foes: [f(398, 2, 45), f(227, 1, 44, 'guard'), f(330, 1, 44, 'caster')] },
          { foes: [f(628, 1, 46, 'brute', true), f(330, 2, 45, 'caster'), f(357, 1, 45, 'mender')] },
          { final: true, foes: [f(373, 1, 47, 'brute', true), f(635, 1, 47, 'caster', true), f(334, 1, 45, 'mender'), f(398, 2, 45), f(227, 1, 45, 'guard')] },
        ],
      },
    ],
    halls: [
      mxy({ x: 18, y: 84, w: 5, h: 14 }),
      mxy({ x: 18, y: 46, w: 5, h: 14 }),
      mxy({ x: 37, y: 26, w: 16, h: 5 }),
      mxy({ x: 81, y: 18, w: 15, h: 5 }),
      mxy({ x: 106, y: 36, w: 5, h: 18 }),
      mxy({ x: 76, y: 62, w: 16, h: 5 }),
    ],
    gates: [
      mxy({ x: 18, y: 96, w: 5, h: 2 }),
      mxy({ x: 18, y: 58, w: 5, h: 2 }),
      mxy({ x: 37, y: 26, w: 2, h: 5 }),
      mxy({ x: 81, y: 18, w: 2, h: 5 }),
      mxy({ x: 106, y: 36, w: 5, h: 2 }),
      mxy({ x: 89, y: 62, w: 2, h: 5 }),
    ],
  },
  mewtwo: {
    id: 'lab',
    boss: 'mewtwo',
    theme: {
      type: 'psychic', fx: 'psychic', burst: ['#ffffff', '#ffc8f4', '#c060ff'], accent: '#c070ff',
      bolts: () => L('psychic orbs', 'psychische bollen'),
      relics: { ember: () => L('Spark of the Mind', 'Vonk van de Geest'), shell: () => L('Plate of Steel', 'Plaat van Staal') },
      icon: '🧪', dark: '#2c1c4a',
      toBoss: () => L('To the test chamber', 'Naar de testkamer'),
      tips: {
        wardens: () => L('Two wardens guard the lab, each with their own tricks: a Cell Bomb that follows you, Psychic in a cone, a Flash Cannon in a straight line, fields of psychic energy that linger. They call help and enrage after two minutes. Beat one for a relic for the team and a life back.', 'Twee wachters bewaken het lab, elk met eigen trucs: een Celbom die je volgt, Psychic in een kegel, een Flash Cannon in een rechte lijn, velden van psychische energie die blijven hangen. Ze roepen hulp en worden na twee minuten woedend. Versla er een voor een reliek voor het team en een leven terug.'),
        liquid: () => L('Where the floor broke open, psychic coolant glows: don\'t stand in it. Lasers sweep the archive, the reactor core pulses (stay close to it or keep well away), and in the mind chamber the floor grid lights up: find a dark tile.', 'Waar de vloer is opengebroken gloeit psychische koelvloeistof: niet in gaan staan. Lasers vegen door het archief, de reactorkern pulseert (blijf er vlak bij of juist ver vandaan), en in de gedachtenkamer licht het vloerraster op: zoek een donker vak.'),
        partner: () => L('Everything down here is psychic, steel or ghost. Types still count, but no more than 1.5× either way: no partner carries you through.', 'Alles hier beneden is psychisch, staal of geest. Types tellen mee, maar nooit meer dan 1,5× (beide kanten op): geen partner sleept je erdoorheen.'),
        boss: (n) => L(`After the heart of the lab the door to the test chamber opens. Step in and ${n} breaks free: you have 4 minutes. `, `Na het hart van het lab gaat de deur naar de testkamer open. Stap erin en ${n} breekt los: je hebt 4 minuten. `),
      },
    },
    get name() { return L('The Forsaken Lab', 'Het Verlaten Lab') },
    get blurb() { return L('Break into a secret lab deep under the mountain: an archive swept by lasers, a hall of cloning tanks, a pulsing reactor, a chamber where the floor reads your mind, and Mewtwo waiting in the test chamber.', 'Breek in in een geheim lab diep onder de berg: een archief vol lasers, een zaal vol kloontanks, een pulserende reactor, een kamer waar de vloer je gedachten leest, en Mewtwo wacht in de testkamer.') },
    start: [117, 21],
    lives: 3,
    intro: {
      id: 'lab-intro',
      look: 'lab',
      shots: [
        {
          src: 'lab-intro', len: 20.3, lines: [
            { at: 0.6, until: 3.2, title: true, text: () => L('THE FORSAKEN LAB', 'HET VERLATEN LAB'), kicker: () => L('Raid dungeon', 'Raid-dungeon') },
            { at: 16.2, until: 20.3, title: true, text: () => 'MEWTWO', kicker: () => L('The clone that broke free', 'De kloon die losbrak') },
          ],
        },
      ],
    },
    outro: {
      id: 'lab-outro',
      look: 'lab',
      shots: [
        {
          src: 'lab-outro', len: 12.2, lines: [
            { at: 8.2, until: 12.2, title: true, heroes: true, text: () => L('MEWTWO DEFEATED', 'MEWTWO VERSLAGEN'), kicker: () => L('The lab falls silent', 'Het lab valt stil') },
          ],
        },
      ],
    },
    arenaEntry: [64, 76],
    rooms: [
      {
        get name() { return L('The Airlock', 'De Sluis') }, deco: 'airlock', rect: mt({ x: 8, y: 98, w: 26, h: 24 }),
        packs: [
          { at: mta([13, 10]), foes: [f(599, 2, 41), f(605, 1, 41, 'caster')] },
          { at: mta([5, 4]), foes: [f(622, 1, 42, 'brute'), f(96, 1, 41, 'mender'), f(137, 1, 41)] },
          { at: mta([20, 4]), foes: [f(599, 1, 41), f(605, 2, 41, 'caster')] },
        ],
      },
      {
        get name() { return L('The Archive', 'Het Archief') }, deco: 'archive', rect: mt({ x: 8, y: 60, w: 26, h: 24 }),
        packs: [
          { at: mta([7, 18]), foes: [f(137, 2, 42), f(96, 1, 42, 'mender')] },
          { at: mta([20, 18]), foes: [f(64, 1, 44, 'caster', true), f(599, 2, 42)] },
          { at: mta([5, 6]), patrol: mta([21, 6]), foes: [f(137, 1, 43), f(177, 1, 42)] },
          { at: mta([13, 3]), link: 2, foes: [f(600, 1, 43, 'brute'), f(436, 1, 42, 'guard'), f(605, 1, 42, 'caster')] },
        ],
      },
      {
        get name() { return L('The Cloning Hall', 'De Kloonzaal') }, deco: 'cloning', rect: mt({ x: 5, y: 16, w: 32, h: 30 }),
        packs: [
          { at: mta([8, 22]), foes: [f(577, 2, 43), f(96, 1, 43, 'mender')] },
          { at: mta([24, 22]), foes: [f(622, 1, 44, 'brute'), f(178, 1, 43, 'caster')] },
        ],
        warden: {
          sp: 579, lv: 48, hp: 5.5, at: mta([16, 7]), enrage: 120, relic: 'ember', get title() { return L('Keeper of the Cells', 'Hoeder van de Cellen') },
          calls: [{ at: 0.6, foes: [f(577, 1, 43, 'caster'), f(578, 1, 43, 'mender')] }, { at: 0.3, foes: [f(622, 1, 44, 'brute'), f(578, 1, 43, 'mender')] }],
          attacks: [
            ps({ id: 'r_psychic', name: 'Psychic', shape: 'cone', warn: 1.1, cd: 4, dmg: 0.32, target: 'nearest', len: 8, width: 0.45, weight: 3, fx: 'psychic' }),
            ps({ id: 'r_cell', get name() { return L('Cell Bomb', 'Celbom') }, shape: 'circle', warn: 3.6, cd: 16, dmg: 0.3, target: 'random', r: 2.4, weight: 2, follow: true, linger: { dur: 5, dps: 0.1 }, fx: 'psyshock' }),
            ps({ id: 'r_future', name: 'Future Sight', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.3, target: 'players', r: 2.1, extra: 2, stagger: 0.15, weight: 2, fx: 'psychic' }),
            ps({ id: 'r_shock', name: 'Psyshock', shape: 'circle', warn: 1.4, cd: 9, dmg: 0.34, target: 'self', r: 3.8, weight: 2, fx: 'psyshock' }),
          ],
        },
      },
      {
        get name() { return L('The Reactor', 'De Reactor') }, deco: 'reactor', rect: mt({ x: 53, y: 8, w: 28, h: 28 }),
        packs: [
          { at: mta([7, 13]), foes: [f(605, 2, 44, 'caster'), f(577, 1, 44)] },
          { at: mta([14, 22]), foes: [f(437, 1, 46, 'guard', true), f(600, 1, 44, 'brute'), f(605, 1, 44, 'caster')] },
          { at: mta([14, 5]), foes: [f(137, 2, 44), f(97, 1, 44, 'mender')] },
          { at: mta([22, 14]), link: 2, foes: [f(600, 1, 45, 'brute'), f(599, 1, 44), f(97, 1, 44, 'mender')] },
        ],
      },
      {
        get name() { return L('The Mind Chamber', 'De Gedachtenkamer') }, deco: 'mind', rect: mt({ x: 96, y: 6, w: 26, h: 30 }),
        packs: [
          { at: mta([5, 6]), foes: [f(233, 2, 44), f(137, 1, 44)] },
          { at: mta([5, 24]), foes: [f(437, 1, 46, 'guard', true), f(600, 1, 44, 'brute'), f(97, 1, 44, 'mender')] },
        ],
        warden: {
          sp: 376, lv: 49, hp: 6.5, at: mta([14, 16]), enrage: 130, relic: 'shell', get title() { return L('Mind of the Lab', 'Brein van het Lab') },
          calls: [{ at: 0.65, foes: [f(233, 2, 44)] }, { at: 0.35, foes: [f(601, 1, 46, 'brute', true), f(578, 1, 44, 'mender')] }],
          attacks: [
            ps({ id: 'm_wave', get name() { return L('Psychic Wave', 'Psychische Golf') }, shape: 'ring', warn: 1.4, cd: 7, dmg: 0.34, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'psychic' }),
            ps({ id: 'm_cannon', name: 'Flash Cannon', shape: 'line', warn: 1.35, cd: 7, dmg: 0.34, target: 'nearest', len: 13, width: 1.5, weight: 3, fx: 'flashcannon' }),
            ps({ id: 'm_field_pool', get name() { return L('Psychic Field', 'Psychisch Veld') }, shape: 'circle', warn: 1.5, cd: 9, dmg: 0.22, target: 'players', r: 2.4, extra: 2, stagger: 0.2, weight: 3, linger: { dur: 9, dps: 0.1 }, fx: 'psychic' }),
            ps({ id: 'm_meteor', name: 'Meteor Mash', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 2, fx: 'meteormash' }),
          ],
        },
      },
      {
        get name() { return L('The Heart of the Lab', 'Het Hart van het Lab') }, deco: 'core', rect: mt({ x: 92, y: 54, w: 30, h: 28 }),
        waves: [
          { foes: [f(600, 2, 45), f(436, 1, 44, 'guard'), f(606, 1, 44, 'caster')] },
          { foes: [f(623, 1, 46, 'brute', true), f(606, 2, 45, 'caster'), f(97, 1, 45, 'mender')] },
          { final: true, foes: [f(601, 1, 47, 'brute', true), f(65, 1, 47, 'caster', true), f(579, 1, 45, 'mender'), f(233, 2, 45), f(437, 1, 45, 'guard')] },
        ],
      },
    ],
    halls: [
      mt({ x: 18, y: 84, w: 5, h: 14 }),
      mt({ x: 18, y: 46, w: 5, h: 14 }),
      mt({ x: 37, y: 26, w: 16, h: 5 }),
      mt({ x: 81, y: 18, w: 15, h: 5 }),
      mt({ x: 106, y: 36, w: 5, h: 18 }),
      mt({ x: 76, y: 62, w: 16, h: 5 }),
    ],
    gates: [
      mt({ x: 18, y: 96, w: 5, h: 2 }),
      mt({ x: 18, y: 58, w: 5, h: 2 }),
      mt({ x: 37, y: 26, w: 2, h: 5 }),
      mt({ x: 81, y: 18, w: 2, h: 5 }),
      mt({ x: 106, y: 36, w: 5, h: 2 }),
      mt({ x: 89, y: 62, w: 2, h: 5 }),
    ],
  },
  lugia: {
    id: 'whirl',
    boss: 'lugia',
    theme: {
      type: 'water', fx: 'surf', burst: ['#ffffff', '#c8f0ff', '#50b0f0'], accent: '#6ab0f0',
      bolts: () => L('water bolts', 'waterstralen'),
      relics: { ember: () => L('Pearl of the Tide', 'Parel van het Getij'), shell: () => L('Shell of the Deep', 'Schelp van de Diepte') },
      icon: '🌊', dark: '#123048',
      toBoss: () => L('To the eye of the storm', 'Naar het oog van de storm'),
      tips: {
        wardens: () => L('Two wardens guard the islands, each with their own tricks: a Whirlpool that follows you, Hydro Pump in a cone, a Hyper Beam in a straight line, a Twister that roams the room. They call help and enrage after two minutes. Beat one for a relic for the team and a life back.', 'Twee wachters bewaken de eilanden, elk met eigen trucs: een Draaikolk die je volgt, Hydro Pump in een kegel, een Hyper Beam in een rechte lijn, een Twister die door de zaal zwerft. Ze roepen hulp en worden na twee minuten woedend. Versla er een voor een reliek voor het team en een leven terug.'),
        liquid: () => L('The sea comes into the cave: stay out of the deep water. The tide surges through the pools, the old wreck sheds planks and barrels, and under the falls the current pulls you along.', 'De zee loopt de grot in: blijf uit het diepe water. Het getij raast door de poelen, het oude wrak verliest planken en vaten, en onder de watervallen trekt de stroming je mee.'),
        partner: () => L('Everything here is water. Types still count, but no more than 1.5× either way: no partner carries you through.', 'Alles hier is water. Types tellen mee, maar nooit meer dan 1,5× (beide kanten op): geen partner sleept je erdoorheen.'),
        boss: (n) => L(`After the sanctum the way to the eye of the storm opens. Step in and ${n} rises from the sea: you have 4 minutes. `, `Na het heiligdom gaat de weg naar het oog van de storm open. Stap erin en ${n} rijst op uit de zee: je hebt 4 minuten. `),
      },
    },
    get name() { return L('The Whirl Islands', 'De Draaikolkeilanden') },
    get blurb() { return L('Wade into a sea cave under a stormy island: tide pools, a coral grotto, a wreck on the rocks, the roaring falls, and Lugia rising from the sea at the eye of the storm.', 'Waad een zeegrot in onder een stormachtig eiland: getijdenpoelen, een koraalgrot, een wrak op de rotsen, de razende watervallen, en Lugia rijst op uit de zee in het oog van de storm.') },
    start: [117, 106],
    lives: 3,
    intro: {
      id: 'whirl-intro',
      look: 'sea',
      shots: [
        {
          src: 'whirl-intro', len: 22.5, lines: [
            { at: 0.6, until: 3.2, title: true, text: () => L('THE WHIRL ISLANDS', 'DE DRAAIKOLKEILANDEN'), kicker: () => L('Raid dungeon', 'Raid-dungeon') },
            { at: 18.4, until: 22.5, title: true, text: () => 'LUGIA', kicker: () => L('Guardian of the sea', 'Hoeder van de zee') },
          ],
        },
      ],
    },
    outro: {
      id: 'whirl-outro',
      look: 'sea',
      shots: [
        {
          src: 'whirl-outro', len: 12.2, lines: [
            { at: 8.2, until: 12.2, title: true, heroes: true, text: () => L('LUGIA DEFEATED', 'LUGIA VERSLAGEN'), kicker: () => L('The storm dies down', 'De storm gaat liggen') },
          ],
        },
      ],
    },
    arenaEntry: [64, 52],
    rooms: [
      {
        get name() { return L('The Cave Shore', 'De Grotkust') }, deco: 'shore', rect: mtx({ x: 8, y: 98, w: 26, h: 24 }),
        packs: [
          { at: mtxa(26, [13, 10]), foes: [f(98, 2, 41), f(120, 1, 41, 'caster')] },
          { at: mtxa(26, [5, 4]), foes: [f(318, 1, 42, 'brute'), f(222, 1, 41, 'mender'), f(72, 1, 41)] },
          { at: mtxa(26, [20, 4]), foes: [f(98, 1, 41), f(120, 2, 41, 'caster')] },
        ],
      },
      {
        get name() { return L('The Tide Pools', 'De Getijdenpoelen') }, deco: 'tidepool', rect: mtx({ x: 8, y: 60, w: 26, h: 24 }),
        packs: [
          { at: mtxa(26, [7, 18]), foes: [f(72, 2, 42), f(222, 1, 42, 'mender')] },
          { at: mtxa(26, [20, 18]), foes: [f(121, 1, 44, 'caster', true), f(98, 2, 42)] },
          { at: mtxa(26, [5, 6]), patrol: mtxa(26, [21, 6]), foes: [f(72, 1, 43), f(318, 1, 42)] },
          { at: mtxa(26, [13, 3]), link: 2, foes: [f(99, 1, 43, 'brute'), f(90, 1, 42, 'guard'), f(170, 1, 42, 'caster')] },
        ],
      },
      {
        get name() { return L('The Coral Grotto', 'De Koraalgrot') }, deco: 'grotto', rect: mtx({ x: 5, y: 16, w: 32, h: 30 }),
        packs: [
          { at: mtxa(32, [8, 22]), foes: [f(116, 2, 43), f(594, 1, 43, 'mender')] },
          { at: mtxa(32, [24, 22]), foes: [f(319, 1, 44, 'brute'), f(171, 1, 43, 'caster')] },
        ],
        warden: {
          sp: 230, lv: 48, hp: 5.5, at: mtxa(32, [16, 7]), enrage: 120, relic: 'ember', get title() { return L('Lord of the Deep', 'Heer van de Diepte') },
          calls: [{ at: 0.6, foes: [f(117, 1, 43, 'caster'), f(116, 1, 42)] }, { at: 0.3, foes: [f(319, 1, 44, 'brute'), f(594, 1, 43, 'mender')] }],
          attacks: [
            wa({ id: 'k_pump', name: 'Hydro Pump', shape: 'cone', warn: 1.1, cd: 4, dmg: 0.32, target: 'nearest', len: 8, width: 0.45, weight: 3, fx: 'hydropump' }),
            wa({ id: 'k_whirl', get name() { return L('Whirlpool', 'Draaikolk') }, shape: 'circle', warn: 3.6, cd: 16, dmg: 0.3, target: 'random', r: 2.4, weight: 2, follow: true, linger: { dur: 5, dps: 0.1 }, fx: 'surf' }),
            wa({ id: 'k_pulse', name: 'Water Pulse', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.3, target: 'players', r: 2.1, extra: 2, stagger: 0.15, weight: 2, fx: 'surf' }),
            dr({ id: 'k_dragon', name: 'Dragon Pulse', shape: 'circle', warn: 1.4, cd: 9, dmg: 0.34, target: 'self', r: 3.8, weight: 2, fx: 'dragonpulse' }),
          ],
        },
      },
      {
        get name() { return L('The Wreck', 'Het Wrak') }, deco: 'wreck', rect: mtx({ x: 53, y: 8, w: 28, h: 28 }),
        packs: [
          { at: mtxa(28, [7, 13]), foes: [f(170, 2, 44, 'caster'), f(116, 1, 44)] },
          { at: mtxa(28, [14, 22]), foes: [f(91, 1, 46, 'guard', true), f(99, 1, 44, 'brute'), f(120, 1, 44, 'caster')] },
          { at: mtxa(28, [14, 5]), foes: [f(72, 2, 44), f(594, 1, 44, 'mender')] },
          { at: mtxa(28, [22, 14]), link: 2, foes: [f(99, 1, 45, 'brute'), f(318, 1, 44), f(222, 1, 44, 'mender')] },
        ],
      },
      {
        get name() { return L('Under the Falls', 'Onder de Watervallen') }, deco: 'falls', rect: mtx({ x: 96, y: 6, w: 26, h: 30 }),
        packs: [
          { at: mtxa(26, [5, 6]), foes: [f(73, 2, 44), f(72, 1, 44)] },
          { at: mtxa(26, [5, 24]), foes: [f(593, 1, 46, 'guard', true), f(319, 1, 44, 'brute'), f(594, 1, 44, 'mender')] },
        ],
        warden: {
          sp: 130, lv: 49, hp: 6.5, at: mtxa(26, [14, 16]), enrage: 130, relic: 'shell', get title() { return L('Terror of the Falls', 'Schrik van de Watervallen') },
          calls: [{ at: 0.65, foes: [f(73, 2, 44)] }, { at: 0.35, foes: [f(320, 1, 46, 'brute', true), f(594, 1, 44, 'mender')] }],
          attacks: [
            wa({ id: 'g_surf', name: 'Surf', shape: 'ring', warn: 1.4, cd: 7, dmg: 0.34, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'surf' }),
            wa({ id: 'g_beam', name: 'Hyper Beam', shape: 'line', warn: 1.35, cd: 7, dmg: 0.34, target: 'nearest', len: 13, width: 1.5, weight: 3, fx: 'hyperbeam' }),
            dr({ id: 'g_twister', name: 'Twister', shape: 'circle', warn: 1.5, cd: 9, dmg: 0.22, target: 'players', r: 2.4, extra: 2, stagger: 0.2, weight: 3, linger: { dur: 9, dps: 0.1 }, fx: 'hurricane' }),
            wa({ id: 'g_fall', name: 'Waterfall', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 2, fx: 'surf' }),
          ],
        },
      },
      {
        get name() { return L('The Sanctum of the Sea', 'Het Heiligdom van de Zee') }, deco: 'sanctum', rect: mtx({ x: 92, y: 54, w: 30, h: 28 }),
        waves: [
          { foes: [f(99, 2, 45), f(90, 1, 44, 'guard'), f(171, 1, 44, 'caster')] },
          { foes: [f(319, 1, 46, 'brute', true), f(121, 2, 45, 'caster'), f(594, 1, 45, 'mender')] },
          { final: true, foes: [f(130, 1, 47, 'brute', true), f(593, 1, 47, 'caster', true), f(594, 1, 45, 'mender'), f(73, 2, 45), f(91, 1, 45, 'guard')] },
        ],
      },
    ],
    halls: [
      mtx({ x: 18, y: 84, w: 5, h: 14 }),
      mtx({ x: 18, y: 46, w: 5, h: 14 }),
      mtx({ x: 37, y: 26, w: 16, h: 5 }),
      mtx({ x: 81, y: 18, w: 15, h: 5 }),
      mtx({ x: 106, y: 36, w: 5, h: 18 }),
      mtx({ x: 76, y: 62, w: 16, h: 5 }),
    ],
    gates: [
      mtx({ x: 18, y: 96, w: 5, h: 2 }),
      mtx({ x: 18, y: 58, w: 5, h: 2 }),
      mtx({ x: 37, y: 26, w: 2, h: 5 }),
      mtx({ x: 81, y: 18, w: 2, h: 5 }),
      mtx({ x: 106, y: 36, w: 5, h: 2 }),
      mtx({ x: 89, y: 62, w: 2, h: 5 }),
    ],
  },
  giratina: {
    id: 'distortion',
    boss: 'giratina',
    theme: {
      type: 'ghost', fx: 'shadowforce', burst: ['#ffffff', '#d8c0ff', '#8050d0'], accent: '#a070e0',
      bolts: () => L('shadow orbs', 'schaduwbollen'),
      relics: { ember: () => L('Shard of the Void', 'Scherf van de Leegte'), shell: () => L('Chain of the Grave', 'Keten van het Graf') },
      icon: '🌀', dark: '#24163a',
      toBoss: () => L('Through the last tear', 'Door de laatste scheur'),
      tips: {
        wardens: () => L('Two wardens guard the way through, each with their own tricks: a Curse that follows you, Shadow Punch in a cone, a beam of darkness in a straight line, pools of Grudge that stay. They call help and enrage after two minutes. Beat one for a relic for the team and a life back.', 'Twee wachters bewaken de weg erdoor, elk met eigen trucs: een Vloek die je volgt, Shadow Punch in een kegel, een straal duisternis in een rechte lijn, poelen van Wrok die blijven liggen. Ze roepen hulp en worden na twee minuten woedend. Versla er een voor een reliek voor het team en een leven terug.'),
        liquid: () => L('Where the floor falls away there is only the void: don\'t step in. Gravity tips over in the upside-down hall, shadows reach out of the mirrors, and on the twisted stair tears open under your feet.', 'Waar de vloer wegvalt is alleen de leegte: stap er niet in. In de omgekeerde hal kantelt de zwaartekracht, uit de spiegels grijpen schaduwen naar je, en op de verwrongen trap scheurt de vloer onder je voeten open.'),
        partner: () => L('Everything here is ghost and dark. Types still count, but no more than 1.5× either way: no partner carries you through.', 'Alles hier is geest en duister. Types tellen mee, maar nooit meer dan 1,5× (beide kanten op): geen partner sleept je erdoorheen.'),
        boss: (n) => L(`After the abyss the last tear opens. Step through and ${n} comes out of the shadows: you have 4 minutes. `, `Na de afgrond gaat de laatste scheur open. Stap erdoor en ${n} komt uit de schaduw: je hebt 4 minuten. `),
      },
    },
    get name() { return L('The Distortion World', 'De Verwrongen Wereld') },
    get blurb() { return L('Step through a tear into a world turned inside out: a hall where gravity tips over, a crypt of shadows, mirrors that reach for you, a stair to nowhere, and Giratina waiting at the edge of the abyss.', 'Stap door een scheur een wereld binnen die binnenstebuiten is gekeerd: een hal waar de zwaartekracht kantelt, een crypte vol schimmen, spiegels die naar je grijpen, een trap naar nergens, en Giratina wacht aan de rand van de afgrond.') },
    start: [10, 21],
    lives: 3,
    intro: {
      id: 'distortion-intro',
      look: 'void',
      shots: [
        {
          src: 'distortion-intro', len: 22.5, lines: [
            { at: 0.6, until: 3.2, title: true, text: () => L('THE DISTORTION WORLD', 'DE VERWRONGEN WERELD'), kicker: () => L('Raid dungeon', 'Raid-dungeon') },
            { at: 18.4, until: 22.5, title: true, text: () => 'GIRATINA', kicker: () => L('Lord of the other side', 'Heer van de andere kant') },
          ],
        },
      ],
    },
    outro: {
      id: 'distortion-outro',
      look: 'void',
      shots: [
        {
          src: 'distortion-outro', len: 12.2, lines: [
            { at: 8.2, until: 12.2, title: true, heroes: true, text: () => L('GIRATINA DEFEATED', 'GIRATINA VERSLAGEN'), kicker: () => L('The world turns right again', 'De wereld keert terug') },
          ],
        },
      ],
    },
    arenaEntry: [63, 76],
    rooms: [
      {
        get name() { return L('The Tear', 'De Scheur') }, deco: 'portal', rect: mty({ x: 8, y: 98, w: 26, h: 24 }),
        packs: [
          { at: mtya(24, [13, 10]), foes: [f(92, 2, 41), f(200, 1, 41, 'caster')] },
          { at: mtya(24, [5, 4]), foes: [f(353, 1, 42, 'brute'), f(425, 1, 41, 'mender'), f(198, 1, 41)] },
          { at: mtya(24, [20, 4]), foes: [f(92, 1, 41), f(200, 2, 41, 'caster')] },
        ],
      },
      {
        get name() { return L('The Upside-Down Hall', 'De Omgekeerde Hal') }, deco: 'upside', rect: mty({ x: 8, y: 60, w: 26, h: 24 }),
        packs: [
          { at: mtya(24, [7, 18]), foes: [f(198, 2, 42), f(425, 1, 42, 'mender')] },
          { at: mtya(24, [20, 18]), foes: [f(93, 1, 44, 'caster', true), f(353, 2, 42)] },
          { at: mtya(24, [5, 6]), patrol: mtya(24, [21, 6]), foes: [f(92, 1, 43), f(198, 1, 42)] },
          { at: mtya(24, [13, 3]), link: 2, foes: [f(354, 1, 43, 'brute'), f(562, 1, 42, 'guard'), f(200, 1, 42, 'caster')] },
        ],
      },
      {
        get name() { return L('The Crypt of Shadows', 'De Schimmencrypte') }, deco: 'crypt', rect: mty({ x: 5, y: 16, w: 32, h: 30 }),
        packs: [
          { at: mtya(30, [8, 22]), foes: [f(355, 2, 43), f(425, 1, 43, 'mender')] },
          { at: mtya(30, [24, 22]), foes: [f(302, 1, 44, 'brute'), f(608, 1, 43, 'caster')] },
        ],
        warden: {
          sp: 477, lv: 48, hp: 5.5, at: mtya(30, [16, 7]), enrage: 120, relic: 'ember', get title() { return L('Warden of Shadows', 'Wachter van de Schimmen') },
          calls: [{ at: 0.6, foes: [f(356, 1, 43, 'caster'), f(355, 1, 42)] }, { at: 0.3, foes: [f(302, 1, 44, 'brute'), f(426, 1, 43, 'mender')] }],
          attacks: [
            gh({ id: 'd_punch', name: 'Shadow Punch', shape: 'cone', warn: 1.1, cd: 4, dmg: 0.32, target: 'nearest', len: 7, width: 0.5, weight: 3, fx: 'nightdaze' }),
            gh({ id: 'd_curse', get name() { return L('Curse', 'Vloek') }, shape: 'circle', warn: 3.6, cd: 16, dmg: 0.3, target: 'random', r: 2.4, weight: 2, follow: true, linger: { dur: 5, dps: 0.1 }, fx: 'shadowforce' }),
            gh({ id: 'd_wind', name: 'Ominous Wind', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.3, target: 'players', r: 2.1, extra: 2, stagger: 0.15, weight: 2, fx: 'shadowforce' }),
            gh({ id: 'd_quake', get name() { return L('Shadow Quake', 'Schaduwbeving') }, shape: 'circle', warn: 1.4, cd: 9, dmg: 0.34, target: 'self', r: 3.8, weight: 2, fx: 'nightdaze' }),
          ],
        },
      },
      {
        get name() { return L('The Hall of Mirrors', 'De Spiegelzaal') }, deco: 'mirror', rect: mty({ x: 53, y: 8, w: 28, h: 28 }),
        packs: [
          { at: mtya(28, [7, 13]), foes: [f(200, 2, 44, 'caster'), f(355, 1, 44)] },
          { at: mtya(28, [14, 22]), foes: [f(442, 1, 46, 'guard', true), f(354, 1, 44, 'brute'), f(200, 1, 44, 'caster')] },
          { at: mtya(28, [14, 5]), foes: [f(198, 2, 44), f(426, 1, 44, 'mender')] },
          { at: mtya(28, [22, 14]), link: 2, foes: [f(354, 1, 45, 'brute'), f(92, 1, 44), f(426, 1, 44, 'mender')] },
        ],
      },
      {
        get name() { return L('The Twisted Stair', 'De Verwrongen Trap') }, deco: 'spiral', rect: mty({ x: 96, y: 6, w: 26, h: 30 }),
        packs: [
          { at: mtya(30, [5, 6]), foes: [f(430, 2, 44), f(198, 1, 44)] },
          { at: mtya(30, [5, 24]), foes: [f(442, 1, 46, 'guard', true), f(302, 1, 44, 'brute'), f(426, 1, 44, 'mender')] },
        ],
        warden: {
          sp: 563, lv: 49, hp: 6.5, at: mtya(30, [14, 16]), enrage: 130, relic: 'shell', get title() { return L('Keeper of the Tomb', 'Bewaker van de Tombe') },
          calls: [{ at: 0.65, foes: [f(430, 2, 44)] }, { at: 0.35, foes: [f(94, 1, 46, 'brute', true), f(429, 1, 44, 'mender')] }],
          attacks: [
            gh({ id: 'c_shade', get name() { return L('Night Shade', 'Nachtschaduw') }, shape: 'ring', warn: 1.4, cd: 7, dmg: 0.34, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'nightdaze' }),
            gh({ id: 'c_beam', get name() { return L('Dark Beam', 'Duistere Straal') }, shape: 'line', warn: 1.35, cd: 7, dmg: 0.34, target: 'nearest', len: 13, width: 1.5, weight: 3, fx: 'nightdaze' }),
            gh({ id: 'c_grudge_pool', get name() { return L('Grudge', 'Wrok') }, shape: 'circle', warn: 1.5, cd: 9, dmg: 0.22, target: 'players', r: 2.4, extra: 2, stagger: 0.2, weight: 3, linger: { dur: 9, dps: 0.1 }, fx: 'shadowforce' }),
            gh({ id: 'c_hex', name: 'Hex', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 2, fx: 'shadowforce' }),
          ],
        },
      },
      {
        get name() { return L('The Edge of the Abyss', 'De Rand van de Afgrond') }, deco: 'abyss', rect: mty({ x: 92, y: 54, w: 30, h: 28 }),
        waves: [
          { foes: [f(354, 2, 45), f(562, 1, 44, 'guard'), f(429, 1, 44, 'caster')] },
          { foes: [f(94, 1, 46, 'brute', true), f(429, 2, 45, 'caster'), f(426, 1, 45, 'mender')] },
          { final: true, foes: [f(430, 1, 47, 'brute', true), f(609, 1, 47, 'caster', true), f(426, 1, 45, 'mender'), f(354, 2, 45), f(563, 1, 45, 'guard')] },
        ],
      },
    ],
    halls: [
      mty({ x: 18, y: 84, w: 5, h: 14 }),
      mty({ x: 18, y: 46, w: 5, h: 14 }),
      mty({ x: 37, y: 26, w: 16, h: 5 }),
      mty({ x: 81, y: 18, w: 15, h: 5 }),
      mty({ x: 106, y: 36, w: 5, h: 18 }),
      mty({ x: 76, y: 62, w: 16, h: 5 }),
    ],
    gates: [
      mty({ x: 18, y: 96, w: 5, h: 2 }),
      mty({ x: 18, y: 58, w: 5, h: 2 }),
      mty({ x: 37, y: 26, w: 2, h: 5 }),
      mty({ x: 81, y: 18, w: 2, h: 5 }),
      mty({ x: 106, y: 36, w: 5, h: 2 }),
      mty({ x: 89, y: 62, w: 2, h: 5 }),
    ],
  },
}

/** Every dungeon, in menu order. */
export const DUNGEON_LIST: DungeonDef[] = Object.values(DUNGEONS).filter((d): d is DungeonDef => !!d)

export const dungeonOf = (boss: BossId | undefined): DungeonDef | null => (boss && DUNGEONS[boss]) || null

/** Every warden attack (clients look them up by id to draw the right effects). */
export const WARDEN_ATTACKS: BossAttack[] = Object.values(DUNGEONS).flatMap((d) => d!.rooms.flatMap((r) => r.warden?.attacks ?? []))

/** How many fights a dungeon has: packs, wardens and waves (for the progress bar). */
export const fightsIn = (r: Room) => (r.packs?.length ?? 0) + (r.warden ? 1 : 0) + (r.waves?.length ?? 0)
