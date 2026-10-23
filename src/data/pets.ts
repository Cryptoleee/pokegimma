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
  /** Dungeon whose flawless clear unlocks it. */
  dungeon: string
  how: () => string
}

export const PETS: Pet[] = [
  { id: 'reshiram', sp: 643, dungeon: 'depths', how: () => L('Clear The Burning Depths without losing a life', 'Haal De Brandende Diepten zonder een leven te verliezen') },
  { id: 'zekrom', sp: 644, dungeon: 'storm', how: () => L('Clear The Storm Tower without losing a life', 'Haal De Stormtoren zonder een leven te verliezen') },
  { id: 'kyurem', sp: 646, dungeon: 'citadel', how: () => L('Clear The Frozen Citadel without losing a life', 'Haal De IJscitadel zonder een leven te verliezen') },
]

const KEY = 'sb:pet'
const read = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const petUnlocked = (p: Progress, pet: Pet) => (p.stats.dgFlawless ?? []).includes(pet.dungeon)
/** The follower you picked ('none' = none; unset = the first one you have). */
const picked = () => {
  const v = read() ?? ''
  // An older build stored a switched-off follower as 'off:<id>'
  return v.startsWith('off:') ? 'none' : v
}
/** Whether this follower is the one walking with you. */
export const petOn = (p: Progress, pet: Pet) => {
  const pick = picked()
  if (pick === 'none' || !petUnlocked(p, pet)) return false
  const chosen = PETS.find((x) => x.id === pick && petUnlocked(p, x))
  return chosen ? chosen === pet : PETS.find((x) => petUnlocked(p, x)) === pet
}
/** Take this follower along (or none). One at a time. */
export function setPet(pet: Pet | null) {
  try {
    localStorage.setItem(KEY, pet ? pet.id : 'none')
  } catch {
    /* private mode */
  }
}
/** The follower you bring into a match (its species), if any. */
export function myPet(p: Progress): number | undefined {
  return PETS.find((pet) => petOn(p, pet))?.sp
}
