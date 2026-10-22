import { L } from '../i18n'

/**
 * How hard the computer plays: the bots in a battle royale, the CPU in a
 * duel and the boss in a raid. Chosen for solo matches and by the host of a
 * lobby; other people in a match are never affected.
 */
export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

export const diffName = (d: Difficulty) => (d === 'easy' ? L('Easy', 'Makkelijk') : d === 'hard' ? L('Hard', 'Moeilijk') : L('Normal', 'Normaal'))
export const diffNote = (d: Difficulty) =>
  d === 'easy'
    ? L('Slower bots, less damage taken · half the ranking points', 'Tragere bots, minder schade · halve rankingpunten')
    : d === 'hard'
      ? L('Sharp bots, more damage taken · 1.5× ranking points', 'Scherpe bots, meer schade · 1,5× rankingpunten')
      : L('The standard game', 'Het standaardspel')

/** Bot skill (reaction, aim, smart choices) per difficulty: a random range for bots, one value for the duel CPU. */
export const BOT_SKILL: Record<Difficulty, [number, number]> = { easy: [0.12, 0.45], normal: [0.3, 0.85], hard: [0.72, 1] }
export const CPU_SKILL: Record<Difficulty, number> = { easy: 0.42, normal: 0.72, hard: 0.96 }
/** Damage people take from bots, wild Pokémon and raid bosses. */
export const TAKEN: Record<Difficulty, number> = { easy: 0.7, normal: 1, hard: 1.3 }

const KEY = 'sb:diff'
export function savedDiff(): Difficulty {
  try {
    const d = localStorage.getItem(KEY) as Difficulty | null
    return d && DIFFICULTIES.includes(d) ? d : 'normal'
  } catch {
    return 'normal'
  }
}
export function saveDiff(d: Difficulty) {
  try {
    localStorage.setItem(KEY, d)
  } catch {
    /* private mode */
  }
}
