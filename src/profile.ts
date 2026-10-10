/**
 * Who you are. For now a random id plus the name you typed, kept on this
 * device; an account login can replace this later without touching the game.
 */
export interface Profile {
  id: string
  name: string
}

const KEY = 'battlemon:profile'

function load(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Profile | null
    if (p?.id) return p
  } catch {
    /* private mode */
  }
  const id = crypto.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return { id, name: '' }
}

let current = load()

export function profile(): Profile {
  return current
}

export const NAME_MAX = 12

/** Strip anything weird and keep names short enough for nameplates. */
export function cleanName(name: string) {
  return name.replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

export function setName(name: string) {
  current = { ...current, name: cleanName(name) }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* private mode */
  }
}
