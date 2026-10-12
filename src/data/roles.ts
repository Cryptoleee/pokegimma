import { movesetFor, type MoveKind } from './moves'
import { SPECIES } from './pokemon'
import { L } from '../i18n'

/**
 * Roles in the spirit of Pokémon Unite. Every roster line has a fixed role
 * (evolutions keep it); anything else gets one from its stats. Each role comes
 * with a small passive bonus so the pick matters in a match.
 */

export type Role = 'attacker' | 'allrounder' | 'defender' | 'speedster'
export type Style = 'melee' | 'ranged'

export interface RoleInfo {
  name: string
  color: string
  icon: string
  /** One line for the select screen. */
  bonus: string
  dmg: number
  hp: number
  /** Knockback taken. */
  knock: number
  /** Trainer walking speed. */
  speed: number
  /** Cooldown of dash moves. */
  dashCd: number
}

export const ROLES: Record<Role, RoleInfo> = {
  attacker: { get name() { return L('Attacker', 'Aanvaller') }, color: '#f05a48', icon: '✦', get bonus() { return L('+10% damage', '+10% schade') }, dmg: 1.1, hp: 1, knock: 1, speed: 1, dashCd: 1 },
  allrounder: { get name() { return L('All-Rounder', 'Allrounder') }, color: '#b070f0', icon: '◆', get bonus() { return L('+5% damage, +7% HP', '+5% schade, +7% HP') }, dmg: 1.05, hp: 1.07, knock: 1, speed: 1, dashCd: 1 },
  defender: { get name() { return L('Defender', 'Verdediger') }, color: '#48b860', icon: '⬢', get bonus() { return L('+15% HP, less knockback', '+15% HP, minder knockback') }, dmg: 1, hp: 1.15, knock: 0.5, speed: 1, dashCd: 1 },
  speedster: { get name() { return L('Speedster', 'Snelheid') }, color: '#3aa8f0', icon: '➤', get bonus() { return L('+12% walk speed, faster dash', '+12% loopsnelheid, snellere dash') }, dmg: 1, hp: 1, knock: 1, speed: 1.12, dashCd: 0.8 },
}

export const STYLES: Record<Style, string> = { melee: 'Melee', ranged: 'Ranged' }

/** Roles of the roster lines, by the first stage. */
const LINE_ROLE: Record<number, Role> = {
  25: 'attacker', 4: 'attacker', 1: 'attacker', 92: 'attacker', 63: 'attacker', 403: 'attacker', 633: 'attacker',
  133: 'allrounder', 498: 'allrounder', 501: 'allrounder', 443: 'allrounder', 610: 'allrounder', 66: 'allrounder', 147: 'allrounder', 374: 'allrounder',
  7: 'defender', 246: 'defender', 446: 'defender', 258: 'defender',
  495: 'speedster', 447: 'speedster', 570: 'speedster', 123: 'speedster', 255: 'speedster',
}

// Pre-evolution map, so evolutions inherit their line's role
const PREVO: Record<number, number> = {}
for (const sp of Object.values(SPECIES)) for (const e of sp.evo ?? []) PREVO[e] = sp.id

const cache = new Map<number, Role>()

/** The role of any species: its roster line's role, or one from its stats. */
export function roleOf(id: number): Role {
  const hit = cache.get(id)
  if (hit) return hit
  let cur = id
  for (let i = 0; i < 4 && LINE_ROLE[cur] === undefined && PREVO[cur] !== undefined; i++) cur = PREVO[cur]
  let role = LINE_ROLE[cur]
  if (!role) {
    const sp = SPECIES[id]
    role = sp.hp + sp.def > sp.atk + sp.spe + 25 ? 'defender' : sp.spe >= 100 ? 'speedster' : sp.atk >= 100 ? 'attacker' : 'allrounder'
  }
  cache.set(id, role)
  return role
}

export const roleInfo = (id: number) => ROLES[roleOf(id)]

const MELEE: MoveKind[] = ['melee', 'dash', 'burst']

/** Melee or ranged, like Unite: decided by the basic attack you spam the most. */
export function styleOf(id: number): Style {
  return MELEE.includes(movesetFor(SPECIES[id].types)[0].kind) ? 'melee' : 'ranged'
}
