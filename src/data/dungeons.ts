import type { BossAttack, BossId } from './bosses'
import { L } from '../i18n'

/**
 * Raid dungeons: before the legendary you fight your way through a dungeon.
 * Room after room of waves, a warden (mini-boss) on the way, a last wave, and
 * only then the gate to the legendary's arena opens.
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

/** A kind of foe in a wave: species, how many (for one player), level. */
export interface FoeSpec {
  sp: number
  n: number
  lv: number
  /** Bigger and tougher, with a name tag. */
  elite?: boolean
}

/** A warden: a big Pokémon with its own health bar and telegraphed attacks. */
export interface Warden {
  sp: number
  lv: number
  /** HP multiplier (one player; more players scale it up). */
  hp: number
  title: string
  attacks: BossAttack[]
  /** Foes it calls in when its health drops below these shares. */
  calls?: { at: number; foes: FoeSpec[] }[]
}

export interface Wave {
  foes: FoeSpec[]
  warden?: Warden
  /** Shown big: "Final wave". */
  final?: boolean
}

export type RoomDeco = 'gate' | 'river' | 'hall' | 'forge' | 'den' | 'bastion'

export interface Room {
  name: string
  rect: Rect
  deco: RoomDeco
  waves: Wave[]
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
}

const fire = (a: Omit<BossAttack, 'type' | 'phase' | 'weight'> & Partial<Pick<BossAttack, 'weight'>>): BossAttack => ({ type: 'fire', phase: 0, weight: 1, ...a })

export const DUNGEONS: Partial<Record<BossId, DungeonDef>> = {
  reshiram: {
    id: 'depths',
    boss: 'reshiram',
    get name() { return L('The Burning Depths', 'De Brandende Diepten') },
    get blurb() { return L('Fight down through the volcano: six halls of fire Pokémon, two wardens, and Reshiram waiting in the crater.', 'Vecht je een weg door de vulkaan: zes zalen vol vuur-Pokémon, twee wachters, en Reshiram wacht in de krater.') },
    start: [21, 116],
    lives: 3,
    arenaEntry: [76, 64],
    rooms: [
      {
        get name() { return L('Gate of Ash', 'Poort der As') }, deco: 'gate', rect: { x: 8, y: 98, w: 26, h: 24 },
        waves: [
          { foes: [{ sp: 58, n: 3, lv: 40 }] },
          { foes: [{ sp: 554, n: 2, lv: 41 }, { sp: 218, n: 2, lv: 40 }, { sp: 58, n: 1, lv: 41 }] },
        ],
      },
      {
        get name() { return L('River of Fire', 'Vuurrivier') }, deco: 'river', rect: { x: 8, y: 60, w: 26, h: 24 },
        waves: [
          { foes: [{ sp: 228, n: 3, lv: 42 }, { sp: 322, n: 2, lv: 41 }] },
          { foes: [{ sp: 126, n: 1, lv: 44, elite: true }, { sp: 228, n: 2, lv: 42 }, { sp: 218, n: 2, lv: 41 }] },
        ],
      },
      {
        get name() { return L('Warden\'s Hall', 'Wachterszaal') }, deco: 'hall', rect: { x: 5, y: 16, w: 32, h: 30 },
        waves: [
          {
            foes: [{ sp: 240, n: 2, lv: 42 }],
            warden: {
              sp: 467, lv: 48, hp: 5, get title() { return L('Warden of the Flame', 'Wachter van de Vlam') },
              calls: [{ at: 0.6, foes: [{ sp: 240, n: 2, lv: 42 }] }, { at: 0.3, foes: [{ sp: 126, n: 1, lv: 44 }, { sp: 240, n: 1, lv: 42 }] }],
              attacks: [
                fire({ id: 'w_flame', name: 'Flamethrower', shape: 'cone', warn: 1.15, cd: 4, dmg: 0.26, target: 'nearest', len: 8, width: 0.45, weight: 3, fx: 'flamethrower' }),
                fire({ id: 'w_blast', name: 'Fire Blast', shape: 'circle', warn: 1.3, cd: 6, dmg: 0.27, target: 'players', r: 2.1, extra: 1, stagger: 0.15, weight: 2, fx: 'fireblast' }),
                fire({ id: 'w_heat', get name() { return L('Heat Wave', 'Hittegolf') }, shape: 'circle', warn: 1.4, cd: 9, dmg: 0.3, target: 'self', r: 3.8, weight: 2, fx: 'fireblast' }),
              ],
            },
          },
        ],
      },
      {
        get name() { return L('The Forges', 'De Smeltovens') }, deco: 'forge', rect: { x: 53, y: 8, w: 28, h: 28 },
        waves: [
          { foes: [{ sp: 607, n: 3, lv: 43 }, { sp: 636, n: 2, lv: 43 }] },
          { foes: [{ sp: 324, n: 1, lv: 46, elite: true }, { sp: 499, n: 2, lv: 43 }, { sp: 391, n: 2, lv: 43 }] },
        ],
      },
      {
        get name() { return L('Den of the Hounds', 'Hol van de Honden') }, deco: 'den', rect: { x: 96, y: 6, w: 26, h: 30 },
        waves: [
          {
            foes: [{ sp: 228, n: 2, lv: 43 }],
            warden: {
              sp: 323, lv: 49, hp: 5.5, get title() { return L('Heart of the Volcano', 'Hart van de Vulkaan') },
              calls: [{ at: 0.65, foes: [{ sp: 228, n: 3, lv: 43 }] }, { at: 0.35, foes: [{ sp: 229, n: 1, lv: 46, elite: true }, { sp: 228, n: 1, lv: 43 }] }],
              attacks: [
                fire({ id: 'w_erupt', get name() { return L('Eruption', 'Uitbarsting') }, shape: 'ring', warn: 1.4, cd: 7, dmg: 0.3, target: 'self', inner: 3.2, r: 8, weight: 2, fx: 'earthpower' }),
                fire({ id: 'w_quake', get name() { return L('Earthquake', 'Aardbeving') }, shape: 'circle', warn: 1.35, cd: 8, dmg: 0.28, target: 'self', r: 4.2, weight: 2, fx: 'earthpower' }),
                fire({ id: 'w_rocks', name: 'Lava Plume', shape: 'circle', warn: 1.25, cd: 6, dmg: 0.25, target: 'players', r: 2, extra: 3, stagger: 0.12, weight: 3, fx: 'fireblast' }),
              ],
            },
          },
        ],
      },
      {
        get name() { return L('Last Bastion', 'Laatste Bastion') }, deco: 'bastion', rect: { x: 92, y: 54, w: 30, h: 28 },
        waves: [
          { foes: [{ sp: 229, n: 2, lv: 45 }, { sp: 219, n: 2, lv: 44 }, { sp: 555, n: 1, lv: 46, elite: true }] },
          { final: true, foes: [{ sp: 59, n: 1, lv: 47, elite: true }, { sp: 609, n: 1, lv: 47, elite: true }, { sp: 126, n: 2, lv: 45 }, { sp: 631, n: 2, lv: 45 }] },
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
export const WARDEN_ATTACKS: BossAttack[] = Object.values(DUNGEONS).flatMap((d) => d!.rooms.flatMap((r) => r.waves.flatMap((w) => w.warden?.attacks ?? [])))
