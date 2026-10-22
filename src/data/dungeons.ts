import type { BossAttack, BossId } from './bosses'
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

export type RoomDeco = 'gate' | 'river' | 'hall' | 'forge' | 'den' | 'bastion'

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

export const DUNGEONS: Partial<Record<BossId, DungeonDef>> = {
  reshiram: {
    id: 'depths',
    boss: 'reshiram',
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
}

/** Every dungeon, in menu order. */
export const DUNGEON_LIST: DungeonDef[] = Object.values(DUNGEONS).filter((d): d is DungeonDef => !!d)

export const dungeonOf = (boss: BossId | undefined): DungeonDef | null => (boss && DUNGEONS[boss]) || null

/** Every warden attack (clients look them up by id to draw the right effects). */
export const WARDEN_ATTACKS: BossAttack[] = Object.values(DUNGEONS).flatMap((d) => d!.rooms.flatMap((r) => r.warden?.attacks ?? []))

/** How many fights a dungeon has: packs, wardens and waves (for the progress bar). */
export const fightsIn = (r: Room) => (r.packs?.length ?? 0) + (r.warden ? 1 : 0) + (r.waves?.length ?? 0)
