import type { Progress } from '../../api/_progress'
import { L } from '../i18n'

/**
 * Followers: a small Pokémon that trots (or floats) after your trainer, in
 * every mode, for everyone to see. Purely for show: it never fights. Earned,
 * not bought: each one belongs to an achievement.
 */
export interface Pet {
  id: string
  /** Species shown. */
  sp: number
  /** Achievement that unlocks it. */
  ach: string
  how: () => string
}

export const PETS: Pet[] = [
  { id: 'reshiram', sp: 643, ach: 'dg_flawless', how: () => L('Clear The Burning Depths without losing a life', 'Haal De Brandende Diepten zonder een leven te verliezen') },
]

const KEY = 'sb:pet'
const read = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const petUnlocked = (p: Progress, pet: Pet) => p.ach.includes(pet.ach)
/** Whether you've switched this follower off (they're on once unlocked). */
export const petOff = (pet: Pet) => read() === `off:${pet.id}`
export function setPetOn(pet: Pet, on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, `off:${pet.id}`)
  } catch {
    /* private mode */
  }
}
/** The follower you bring into a match (its species), if any. */
export function myPet(p: Progress): number | undefined {
  return PETS.find((pet) => petUnlocked(p, pet) && !petOff(pet))?.sp
}
