import type { SupportTier } from '../../api/_progress'
import type { Game } from './game'

/**
 * The scoreboard of one match: every trainer with their stats. Built from the
 * game state on the host (and in solo); guests get the numbers synced in the
 * snapshot, so the same function works for them too.
 */
export interface ScoreRow {
  id: number
  name: string
  sprite: string
  human: boolean
  /** A supporter's pack (badge by the name, gold for Legend). */
  sup?: SupportTier
  /** Another player's friend code (an add-friend button). */
  fc?: string
  alive: boolean
  /** Final place (0 while still in the match). */
  place: number
  /** Seconds survived (or so far). */
  time: number
  kos: number
  caught: number
  /** Damage to other trainers' Pokémon. */
  dmg: number
  /** Raid: damage to the boss and its share of the boss's HP. */
  bossDmg: number
  share: number
  lives: number
  mon: number
  lv: number
  shiny: boolean
}

export function scoreRows(g: Game): ScoreRow[] {
  const boss = g.wilds.find((w) => w.boss)
  const rows: ScoreRow[] = g.trainers.map((tr) => {
    const m = tr.mon
    return {
      id: tr.id, name: tr.name, sprite: tr.def.sprite, human: tr.human, alive: tr.alive, place: tr.place,
      time: Math.floor(tr.alive ? g.time : tr.diedAt), kos: tr.kos, caught: tr.caught, dmg: Math.round(tr.dmg),
      bossDmg: Math.round(tr.bossDmg), share: boss ? Math.round((tr.bossDmg / boss.maxHp) * 100) : 0, lives: tr.lives,
      mon: m?.species.id ?? 0, lv: m?.level ?? 0, shiny: !!m?.shiny,
      sup: tr.human ? g.setup.humans.find((h) => h.pid === tr.pid)?.sup : undefined,
      fc: tr.human && !tr.isPlayer ? g.setup.humans.find((h) => h.pid === tr.pid)?.fc : undefined,
    }
  })
  return sortRows(rows, g.kind === 'raid')
}

/** Raid: most damage first. Royale: still standing (most K.O.'s first), then by place. */
export function sortRows(rows: ScoreRow[], raid: boolean) {
  return rows.sort((a, b) =>
    raid
      ? b.bossDmg - a.bossDmg
      : (a.alive === b.alive ? 0 : a.alive ? -1 : 1) || (a.alive ? b.kos - a.kos || b.dmg - a.dmg : a.place - b.place),
  )
}

/** Has the match been decided (one trainer left, or the raid is over)? Works on guests too. */
export function decided(g: Game) {
  if (g.kind === 'raid') {
    if (g.raid) return !!g.raid.result
    const boss = g.wilds.find((w) => w.boss)
    return (boss ? boss.hp <= 0 : false) || g.trainers.every((t) => !t.alive) || (g.raidView ? g.raidView.timeLeft <= 0 : false)
  }
  return g.trainers.filter((t) => t.alive).length <= 1
}
