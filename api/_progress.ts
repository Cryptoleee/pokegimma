/**
 * Progression rules, shared by the server (accounts) and the game (guests keep
 * the same progress locally). Pure: no Redis, no DOM. Everything is keyed by id;
 * names and descriptions live in src/data/rewards.ts.
 *
 * Rewards are cosmetic only (titles, emblems, shiny partners): progress never
 * changes how strong you are, so PvP stays fair.
 */

export type Kind = 'br' | 'raid' | 'duel'
export type Mode = 'solo' | 'quick' | 'friends'

/** What one player's match looked like (from the results screen). */
export interface Report {
  kind: Kind
  mode: Mode
  /** People in the match (1 = you and bots). */
  humans: number
  won: boolean
  place: number
  total: number
  /** Seconds survived (raid: the raid's length). */
  time: number
  kos: number
  caught: number
  /** Species id of the partner you started with (mastery). */
  partner: number
  boss?: string
  /** Raid: your share of the boss's HP (%), lives left. */
  share?: number
  lives?: number
  /** Raid dungeon you went through (id), if any. */
  dungeon?: string
  /** Duel: rounds you lost (rounds won are `kos`). */
  lost?: number
  /** Legendaries caught, evolutions, grabbed the Evolution Crystal. */
  legend?: number
  evolved?: number
  crystal?: boolean
  /** How hard the bots, CPU or boss played (scales PvE ranking points). */
  diff?: 'easy' | 'normal' | 'hard'
}

/** The 24 free partners (same list as ROSTER in src/data/pokemon.ts). */
export const BASE_PARTNERS = [25, 4, 7, 1, 133, 495, 498, 501, 447, 443, 570, 610, 92, 66, 63, 147, 246, 446, 374, 123, 258, 255, 403, 633]

/**
 * The reward road: every few trainer levels a new partner or trainer. Existing
 * partners and trainers stay free; these come on top.
 */
export const REWARD_ROAD: { lv: number; kind: 'partner' | 'trainer'; id: string }[] = [
  { lv: 2, kind: 'trainer', id: 'elesa' },
  { lv: 3, kind: 'partner', id: '81' }, // Magnemite → Magnezone
  { lv: 4, kind: 'trainer', id: 'hugh' },
  { lv: 5, kind: 'partner', id: '390' }, // Chimchar → Infernape
  { lv: 6, kind: 'trainer', id: 'skyla' },
  { lv: 7, kind: 'partner', id: '138' }, // Omanyte → Omastar
  { lv: 8, kind: 'trainer', id: 'roxie' },
  { lv: 9, kind: 'partner', id: '220' }, // Swinub → Mamoswine
  { lv: 10, kind: 'trainer', id: 'burgh' },
  { lv: 11, kind: 'partner', id: '359' }, // Absol
  { lv: 12, kind: 'trainer', id: 'shauntal' },
  { lv: 13, kind: 'partner', id: '111' }, // Rhyhorn → Rhyperior
  { lv: 14, kind: 'trainer', id: 'colress' },
  { lv: 15, kind: 'partner', id: '280' }, // Ralts → Gardevoir
  { lv: 16, kind: 'trainer', id: 'drayden' },
  { lv: 18, kind: 'partner', id: '607' }, // Litwick → Chandelure
  { lv: 20, kind: 'partner', id: '371' }, // Bagon → Salamence
  { lv: 21, kind: 'trainer', id: 'grimsley' },
  { lv: 23, kind: 'partner', id: '142' }, // Aerodactyl
  { lv: 25, kind: 'partner', id: '636' }, // Larvesta → Volcarona
  { lv: 26, kind: 'trainer', id: 'steven' },
  { lv: 28, kind: 'partner', id: '144' }, // Articuno
  { lv: 30, kind: 'trainer', id: 'lance' },
  { lv: 32, kind: 'partner', id: '145' }, // Zapdos
  { lv: 34, kind: 'trainer', id: 'cynthia' },
  { lv: 36, kind: 'partner', id: '146' }, // Moltres
  { lv: 38, kind: 'trainer', id: 'ghetsis' },
  { lv: 41, kind: 'partner', id: '382' }, // Kyogre
  { lv: 44, kind: 'partner', id: '383' }, // Groudon
  { lv: 47, kind: 'trainer', id: 'red' },
  { lv: 50, kind: 'partner', id: '151' }, // Mew
]

/** Raid dungeons (ids, as in src/data/dungeons.ts). */
export const DUNGEON_IDS = ['depths', 'storm']
/** Raid dungeon lives (a clean run keeps all of them). */
export const DUNGEON_LIVES = 3

/** Raid unlocks: clear a dungeon and one of its wardens joins you as a partner. */
export const RAID_UNLOCKS: { kind: 'partner'; id: string; dungeon: string }[] = [
  { kind: 'partner', id: '240', dungeon: 'depths' }, // Magby, who grows into Magmortar, the Warden of the Flame
  { kind: 'partner', id: '239', dungeon: 'storm' }, // Elekid, who grows into Electivire, the Warden of Thunder
]
/** Followers (species) for a flawless clear (no life lost) of a dungeon. */
export const DUNGEON_PETS: Record<string, number> = { depths: 643, storm: 644 }
export const raidUnlockOf = (kind: 'partner' | 'trainer', id: string | number) => RAID_UNLOCKS.find((r) => r.kind === kind && r.id === String(id))

/** Every partner you can pick: the free ones, those on the reward road and the raid unlocks. */
export const PARTNERS = [...BASE_PARTNERS, ...REWARD_ROAD.filter((r) => r.kind === 'partner').map((r) => Number(r.id)), ...RAID_UNLOCKS.map((r) => Number(r.id))]

/** Trainer level that unlocks a partner or trainer (1 = free from the start; raid unlocks sort after the road). */
export function unlockLevel(kind: 'partner' | 'trainer', id: string | number) {
  if (raidUnlockOf(kind, id)) return MAX_LEVEL + 1
  return REWARD_ROAD.find((r) => r.kind === kind && r.id === String(id))?.lv ?? 1
}

/** Can you play with this partner or trainer yet? */
export function isUnlocked(p: Progress, kind: 'partner' | 'trainer', id: string | number) {
  const raid = raidUnlockOf(kind, id)
  if (raid) return (p.stats.dg ?? []).includes(raid.dungeon)
  return levelOf(p.xp).lv >= unlockLevel(kind, id)
}

/** The next thing on the reward road for you (null when you have everything). */
export function nextUnlock(p: Progress) {
  const lv = levelOf(p.xp).lv
  return REWARD_ROAD.find((r) => r.lv > lv) ?? null
}
export const BOSS_IDS = ['reshiram', 'kyurem', 'zekrom', 'rayquaza', 'mewtwo']
export const RAID_LIVES = 2

export interface Stats {
  /** Matches, battle royale wins, top 3 finishes, trainers knocked out, Pokémon caught. */
  m: number
  w: number
  top3: number
  kos: number
  caught: number
  /** Raids cleared, bosses beaten (ids), legendaries, crystals, evolutions. */
  raids: number
  bosses: string[]
  legend: number
  crystal: number
  evolved: number
  /** Matches with other people, and wins against them. */
  mp: number
  mpw: number
  /** Seconds played. */
  time: number
  /** Partners you've played with. */
  used: number[]
  /** Best single match: knockouts. */
  bestKos: number
  /** 1 vs 1 duels won, and won against a person. */
  dw: number
  dpw: number
  /** Raid dungeons cleared, cleared on hard, and cleared without losing a life (ids). */
  dg?: string[]
  dgHard?: string[]
  dgFlawless?: string[]
}

export interface Daily {
  day: string
  /** Progress on today's three quests (same order as questsFor(day)). */
  p: number[]
  firstWin: boolean
}

export interface Progress {
  v: 1
  xp: number
  /** Mastery XP per partner (species id). */
  partners: Record<string, number>
  /** Unlocked achievements. */
  ach: string[]
  stats: Stats
  /** Last day you played, days in a row, longest run. */
  day: string
  streak: number
  bestStreak: number
  daily: Daily
  /** Chosen title (id from titlesOf), '' = the newest one. */
  title: string
  /** Partners shown shiny (only those with mastery ≥ SHINY_AT). */
  shiny: number[]
  /** Ranking points, all time. */
  pvp: number
  pve: number
  /** Guest progress was merged into this account. */
  imported?: boolean
}

export function newProgress(): Progress {
  return {
    v: 1, xp: 0, partners: {}, ach: [],
    stats: { m: 0, w: 0, top3: 0, kos: 0, caught: 0, raids: 0, bosses: [], legend: 0, crystal: 0, evolved: 0, mp: 0, mpw: 0, time: 0, used: [], bestKos: 0, dw: 0, dpw: 0 },
    day: '', streak: 0, bestStreak: 0, daily: { day: '', p: [0, 0, 0], firstWin: false }, title: '', shiny: [], pvp: 0, pve: 0,
  }
}

/** Fill in anything missing (older saves, imports). */
export function normalize(p: Partial<Progress> | null | undefined): Progress {
  const n = newProgress()
  if (!p || typeof p !== 'object') return n
  const s = { ...n.stats, ...(p.stats ?? {}) }
  return {
    ...n, ...p, v: 1,
    partners: { ...(p.partners ?? {}) },
    ach: Array.isArray(p.ach) ? p.ach.filter((a) => ACH_IDS.has(a)) : [],
    stats: { ...s, bosses: Array.isArray(s.bosses) ? s.bosses : [], used: Array.isArray(s.used) ? s.used : [], dg: Array.isArray(s.dg) ? s.dg : [], dgHard: Array.isArray(s.dgHard) ? s.dgHard : [], dgFlawless: Array.isArray(s.dgFlawless) ? s.dgFlawless : [] },
    daily: { ...n.daily, ...(p.daily ?? {}) },
    shiny: Array.isArray(p.shiny) ? p.shiny : [],
  }
}

// ---------------------------------------------------------------- levels

export const MAX_LEVEL = 50

/** XP from level L to L+1. */
export const levelCost = (lv: number) => 200 + 50 * (lv - 1)

/** Trainer level from total XP, with the progress inside that level. */
export function levelOf(xp: number) {
  let lv = 1, left = Math.max(0, xp)
  while (lv < MAX_LEVEL && left >= levelCost(lv)) {
    left -= levelCost(lv)
    lv++
  }
  const need = lv >= MAX_LEVEL ? 0 : levelCost(lv)
  return { lv, into: lv >= MAX_LEVEL ? 0 : left, need, k: need ? left / need : 1 }
}

/** Partner mastery: total XP needed for each level (index = level - 1). */
export const MASTERY = [0, 250, 700, 1400, 2400, 3800, 5600, 8000, 11000, 15000]
export const MAX_MASTERY = MASTERY.length
/** Mastery level that unlocks the partner's shiny form. */
export const SHINY_AT = 5

export function masteryOf(xp: number) {
  let lv = 1
  while (lv < MAX_MASTERY && xp >= MASTERY[lv]) lv++
  const from = MASTERY[lv - 1], to = MASTERY[lv] ?? from
  return { lv, into: xp - from, need: to - from, k: to > from ? (xp - from) / (to - from) : 1 }
}

/** Emblem on your name for a partner: bronze at 3, silver at 7, gold at 10. */
export const emblemOf = (lv: number): '' | 'bronze' | 'silver' | 'gold' => (lv >= 10 ? 'gold' : lv >= 7 ? 'silver' : lv >= 3 ? 'bronze' : '')

// ---------------------------------------------------------------- titles

/** Titles from your trainer level. */
export const LEVEL_TITLES: [number, string][] = [
  [1, 'rookie'], [3, 'explorer'], [5, 'ace'], [10, 'veteran'], [15, 'elite'], [20, 'champion'], [25, 'stormchaser'], [30, 'legend'], [40, 'mythic'], [50, 'stormbreaker'],
]

/** Every title you've unlocked, newest last: level titles, achievement titles, partner masters. */
export function titlesOf(p: Progress): string[] {
  const lv = levelOf(p.xp).lv
  const out = LEVEL_TITLES.filter(([l]) => lv >= l).map(([, t]) => t)
  for (const a of ACHIEVEMENTS) if (a.title && p.ach.includes(a.id)) out.push(a.title)
  for (const id of PARTNERS) if (masteryOf(p.partners[id] ?? 0).lv >= MAX_MASTERY) out.push(`master:${id}`)
  return out
}

/** The title shown next to your name: the one you picked, else your level title. */
export function titleOf(p: Progress) {
  if (p.title && titlesOf(p).includes(p.title)) return p.title
  const lv = levelOf(p.xp).lv
  return LEVEL_TITLES.filter(([l]) => lv >= l).pop()![1]
}

// ---------------------------------------------------------------- achievements

export interface Achievement {
  id: string
  xp: number
  /** Title it unlocks. */
  title?: string
  /** Unlocked when this is true after the match (stats already include it). */
  test: (p: Progress, r: Report | null) => boolean
}

const lvOf = (p: Progress) => levelOf(p.xp).lv
const bestMastery = (p: Progress) => Math.max(1, ...Object.values(p.partners).map((x) => masteryOf(x).lv))

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_match', xp: 50, test: (p) => p.stats.m >= 1 },
  { id: 'first_win', xp: 150, test: (p) => p.stats.w >= 1 },
  { id: 'wins_10', xp: 300, title: 'arenaking', test: (p) => p.stats.w >= 10 },
  { id: 'wins_50', xp: 600, title: 'unbeatable', test: (p) => p.stats.w >= 50 },
  { id: 'top3_10', xp: 200, test: (p) => p.stats.top3 >= 10 },
  { id: 'kos_match_5', xp: 200, title: 'wrecker', test: (p) => p.stats.bestKos >= 5 },
  { id: 'kos_100', xp: 400, test: (p) => p.stats.kos >= 100 },
  { id: 'pacifist', xp: 250, title: 'pacifist', test: (_, r) => !!r && r.kind === 'br' && r.won && r.kos === 0 },
  { id: 'survivor', xp: 100, test: (_, r) => !!r && r.kind === 'br' && r.time >= 300 },
  { id: 'catch_50', xp: 150, test: (p) => p.stats.caught >= 50 },
  { id: 'catch_500', xp: 400, title: 'collector', test: (p) => p.stats.caught >= 500 },
  { id: 'legend', xp: 250, test: (p) => p.stats.legend >= 1 },
  { id: 'crystal', xp: 150, test: (p) => p.stats.crystal >= 1 },
  { id: 'raid_first', xp: 150, test: (p) => p.stats.raids >= 1 },
  { id: 'raid_all', xp: 600, title: 'legendhunter', test: (p) => BOSS_IDS.every((b) => p.stats.bosses.includes(b)) },
  { id: 'raid_flawless', xp: 300, test: (_, r) => !!r && r.kind === 'raid' && r.won && (r.lives ?? 0) >= (r.dungeon ? DUNGEON_LIVES : RAID_LIVES) },
  { id: 'dg_depths', xp: 500, title: 'flametamer', test: (p) => (p.stats.dg ?? []).includes('depths') },
  { id: 'dg_storm', xp: 500, title: 'stormrider', test: (p) => (p.stats.dg ?? []).includes('storm') },
  { id: 'dg_hard', xp: 600, title: 'infernal', test: (p) => (p.stats.dgHard ?? []).length > 0 },
  { id: 'dg_flawless', xp: 500, title: 'unscathed', test: (_, r) => !!r && r.kind === 'raid' && r.won && !!r.dungeon && (r.lives ?? 0) >= DUNGEON_LIVES },
  { id: 'raid_mvp', xp: 250, test: (_, r) => !!r && r.kind === 'raid' && r.won && r.humans >= 2 && (r.share ?? 0) >= 50 },
  { id: 'duel_first', xp: 150, test: (p) => p.stats.dw >= 1 },
  { id: 'duel_10', xp: 400, title: 'gladiator', test: (p) => p.stats.dw >= 10 },
  { id: 'duel_flawless', xp: 250, test: (_, r) => !!r && r.kind === 'duel' && r.won && r.humans >= 2 && (r.lost ?? 1) === 0 },
  { id: 'mp_first', xp: 100, test: (p) => p.stats.mp >= 1 },
  { id: 'mp_win', xp: 300, title: 'duelist', test: (p) => p.stats.mpw >= 1 },
  { id: 'partners_5', xp: 150, test: (p) => p.stats.used.length >= 5 },
  { id: 'partners_all', xp: 500, title: 'allrounder', test: (p) => BASE_PARTNERS.every((id) => p.stats.used.includes(id)) },
  { id: 'mastery_5', xp: 200, test: (p) => bestMastery(p) >= SHINY_AT },
  { id: 'mastery_10', xp: 500, test: (p) => bestMastery(p) >= MAX_MASTERY },
  { id: 'level_10', xp: 200, test: (p) => lvOf(p) >= 10 },
  { id: 'level_25', xp: 400, test: (p) => lvOf(p) >= 25 },
  { id: 'streak_7', xp: 300, title: 'dedicated', test: (p) => p.bestStreak >= 7 },
  { id: 'matches_100', xp: 400, title: 'regular', test: (p) => p.stats.m >= 100 },
]
const ACH_IDS = new Set(ACHIEVEMENTS.map((a) => a.id))

// ---------------------------------------------------------------- daily quests

export interface Quest {
  id: string
  target: number
  xp: number
  /** How far this match gets you. */
  add: (r: Report) => number
}

export const QUESTS: Quest[] = [
  { id: 'play3', target: 3, xp: 100, add: () => 1 },
  { id: 'win1', target: 1, xp: 150, add: (r) => (r.kind === 'br' && r.won ? 1 : 0) },
  { id: 'kos5', target: 5, xp: 120, add: (r) => r.kos },
  { id: 'catch10', target: 10, xp: 100, add: (r) => r.caught },
  { id: 'raid1', target: 1, xp: 150, add: (r) => (r.kind === 'raid' && r.won ? 1 : 0) },
  { id: 'top3x2', target: 2, xp: 120, add: (r) => (r.kind === 'br' && r.place <= 3 ? 1 : 0) },
  { id: 'survive4', target: 1, xp: 80, add: (r) => (r.kind === 'br' && r.time >= 240 ? 1 : 0) },
  { id: 'friends1', target: 1, xp: 120, add: (r) => (r.humans >= 2 ? 1 : 0) },
  { id: 'evolve2', target: 2, xp: 80, add: (r) => r.evolved ?? 0 },
  { id: 'damage', target: 100, xp: 100, add: (r) => (r.kind === 'raid' ? r.share ?? 0 : 0) },
]

/** Today's three quests: the same for everyone, picked from the day. */
export function questsFor(day: string): Quest[] {
  let h = 2166136261
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619)
  const pool = [...QUESTS]
  const out: Quest[] = []
  for (let i = 0; i < 3; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    out.push(pool.splice(h % pool.length, 1)[0])
  }
  return out
}

/** First battle royale win of the day. */
export const FIRST_WIN_XP = 100

// ---------------------------------------------------------------- one match

/** Clamp a report from the outside world to sane values. `maxTime`: seconds since the match started. */
export function sanitize(raw: Partial<Report>, maxTime = 1800): Report | null {
  const int = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)))
  const kind: Kind = raw.kind === 'raid' || raw.kind === 'duel' ? raw.kind : 'br'
  const mode: Mode = raw.mode === 'quick' || raw.mode === 'friends' ? raw.mode : 'solo'
  if (kind === 'duel') return sanitizeDuel(raw, mode, maxTime, int)
  const total = int(raw.total, kind === 'br' ? 4 : 1, 12)
  const time = int(raw.time, 0, Math.min(1500, maxTime))
  // Nobody wins a battle royale in under a minute and a half
  const place = kind === 'br' && time < 90 ? Math.max(2, int(raw.place, 1, total)) : int(raw.place, 1, total)
  const r: Report = {
    kind, mode,
    humans: mode === 'solo' ? 1 : int(raw.humans, 1, 12),
    // A raid takes at least a minute
    won: kind === 'raid' ? !!raw.won && time >= 60 : place === 1,
    place: kind === 'raid' ? 1 : place,
    total,
    time,
    // Nobody knocks out a trainer every few seconds or catches faster than a ball can fly
    kos: kind === 'raid' ? 0 : int(raw.kos, 0, Math.min(total - 1, 1 + Math.floor(time / 20))),
    caught: int(raw.caught, 0, Math.min(40, 2 + Math.floor(time / 8))),
    partner: PARTNERS.includes(Number(raw.partner)) ? Number(raw.partner) : 0,
    legend: int(raw.legend, 0, 3),
    evolved: int(raw.evolved, 0, 6),
    crystal: kind === 'br' && !!raw.crystal,
    diff: raw.diff === 'easy' || raw.diff === 'hard' ? raw.diff : 'normal',
  }
  if (kind === 'raid') {
    if (!BOSS_IDS.includes(String(raw.boss))) return null
    r.boss = String(raw.boss)
    r.share = int(raw.share, 0, 100)
    // A dungeon: three lives, and nobody gets through six halls and the boss in under three minutes
    if (DUNGEON_IDS.includes(String(raw.dungeon))) {
      r.dungeon = String(raw.dungeon)
      if (time < 180) r.won = false
    }
    r.lives = int(raw.lives, 0, r.dungeon ? DUNGEON_LIVES : RAID_LIVES)
  }
  return r
}

/**
 * A duel: best of three rounds. A round takes at least ~6 s (moves need to land
 * and the next round starts after a countdown), so a 2-0 needs ~20 s.
 */
function sanitizeDuel(raw: Partial<Report>, mode: Mode, maxTime: number, int: (v: unknown, lo: number, hi: number) => number): Report {
  const time = int(raw.time, 0, Math.min(900, maxTime))
  const rounds = Math.min(3, Math.floor(time / 6))
  const kos = int(raw.kos, 0, Math.min(2, rounds))
  const lost = int(raw.lost, 0, Math.min(2, rounds - kos))
  const won = !!raw.won && kos === 2 && lost < 2 && time >= 20
  return {
    kind: 'duel', mode,
    humans: mode === 'solo' ? 1 : int(raw.humans, 1, 2),
    won, place: won ? 1 : 2, total: 2, time, kos, lost, caught: 0,
    partner: PARTNERS.includes(Number(raw.partner)) ? Number(raw.partner) : 0,
    legend: 0, evolved: 0, crystal: false,
    diff: raw.diff === 'easy' || raw.diff === 'hard' ? raw.diff : 'normal',
  }
}

export type XpLine = [key: string, xp: number]

/** XP for the match itself (before quests and achievements), with what it's for. */
export function matchXp(r: Report): XpLine[] {
  const lines: XpLine[] = [['match', 25]]
  if (r.time >= 10) lines.push(['time', Math.min(60, Math.floor(r.time / 10))])
  if (r.kind === 'duel') {
    // Against a person it's worth more than against the CPU (no quick XP farm)
    const people = r.humans >= 2
    if (r.kos) lines.push(['rounds', r.kos * (people ? 15 : 10)])
    if (r.won) lines.push(['duelwin', people ? 100 : 30])
  } else if (r.kind === 'br') {
    if (r.kos) lines.push(['kos', Math.min(10, r.kos) * 30])
    if (r.caught) lines.push(['caught', Math.min(10, r.caught) * 8])
    if (r.won) lines.push(['win', 150])
    else if (r.place <= 3) lines.push(['top3', 75])
    else if (r.place <= Math.ceil(r.total / 2)) lines.push(['tophalf', 30])
    if (r.crystal) lines.push(['crystal', 40])
  } else {
    if (r.won) lines.push(['clear', 150])
    if (r.share) lines.push(['damage', Math.round((r.won ? 1 : 0.6) * (r.share ?? 0))])
    if (r.caught) lines.push(['caught', Math.min(10, r.caught) * 8])
  }
  if (r.legend) lines.push(['legend', r.legend * 50])
  if (r.evolved) lines.push(['evolved', r.evolved * 10])
  const sum = lines.reduce((t, [, x]) => t + x, 0)
  // Playing with other people is worth a bit more
  if (r.humans >= 2) lines.push(['friends', Math.round(sum * 0.2)])
  return lines
}

/** Ranking points: PvP = battle royale with other people; PvE = raids and battle royale against bots. */
export function pointsFor(r: Report): { pvp: number; pve: number } {
  // Against the computer: easy is worth half, hard one and a half times as much
  const k = r.diff === 'easy' ? 0.5 : r.diff === 'hard' ? 1.5 : 1
  const pve = (n: number) => ({ pvp: 0, pve: Math.round(n * k) })
  if (r.kind === 'raid') return pve(r.won ? 25 + Math.round(Math.min(100, r.share ?? 0) / 4) : Math.round((r.share ?? 0) / 10))
  if (r.kind === 'duel') return r.humans >= 2 ? { pvp: (r.won ? 20 : 3) + 4 * r.kos, pve: 0 } : pve((r.won ? 6 : 1) + r.kos)
  const place = r.won ? 30 : r.place === 2 ? 20 : r.place === 3 ? 15 : r.place <= Math.ceil(r.total / 2) ? 8 : 3
  if (r.humans >= 2) return { pvp: place + 4 * Math.min(10, r.kos), pve: 0 }
  return pve((r.won ? 10 : r.place <= 3 ? 5 : 1) + Math.min(10, r.kos))
}

/** Yesterday's date for a YYYY-MM-DD day. */
export function prevDay(day: string) {
  return new Date(Date.parse(`${day}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
}

/** ISO week for a YYYY-MM-DD day, like 2026-W42. */
export function weekOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  const wd = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - wd + 3)
  const y = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const w = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}

export interface Outcome {
  /** XP lines: the match, the daily first win, finished quests, new achievements. */
  lines: XpLine[]
  quests: { id: string; xp: number }[]
  ach: { id: string; xp: number }[]
  total: number
  level: { from: number; to: number }
  /** Partner mastery before and after (0 when the partner isn't a roster partner). */
  mastery: { partner: number; from: number; to: number; xpFrom: number; xpTo: number }
  /** Things this match unlocked: 'shiny:25', 'title:veteran', 'emblem:25:silver'. */
  unlocks: string[]
  points: { pvp: number; pve: number }
  /** Today's quests after the match. */
  daily: { id: string; p: number; target: number; xp: number }[]
  streak: number
}

/** Apply one match to a player's progress (in place) and say what it brought. */
export function applyMatch(p: Progress, r: Report, day: string): Outcome {
  const before = { lv: levelOf(p.xp).lv, titles: new Set(titlesOf(p)) }
  const s = p.stats
  let newDungeon = ''
  let newFlawless = ''
  // Streak: days in a row with at least one match
  if (p.day !== day) {
    p.streak = p.day === prevDay(day) ? p.streak + 1 : 1
    p.bestStreak = Math.max(p.bestStreak, p.streak)
    p.day = day
  }
  if (p.daily.day !== day) p.daily = { day, p: [0, 0, 0], firstWin: false }

  // Lifetime stats
  s.m++
  s.time += r.time
  s.caught += r.caught
  s.legend += r.legend ?? 0
  s.evolved += r.evolved ?? 0
  if (r.crystal) s.crystal++
  if (r.humans >= 2) s.mp++
  if (r.kind === 'br') {
    s.kos += r.kos
    s.bestKos = Math.max(s.bestKos, r.kos)
    if (r.won) s.w++
    if (r.place <= 3) s.top3++
    if (r.won && r.humans >= 2) s.mpw++
  } else if (r.kind === 'duel') {
    if (r.won) s.dw++
    if (r.won && r.humans >= 2) s.dpw++
  } else if (r.won) {
    s.raids++
    if (r.boss && !s.bosses.includes(r.boss)) s.bosses.push(r.boss)
    if (r.dungeon) {
      s.dg = s.dg ?? []
      s.dgHard = s.dgHard ?? []
      if (!s.dg.includes(r.dungeon)) {
        s.dg.push(r.dungeon)
        newDungeon = r.dungeon
      }
      if (r.diff === 'hard' && !s.dgHard.includes(r.dungeon)) s.dgHard.push(r.dungeon)
      // A flawless clear earns the dungeon's follower (once)
      s.dgFlawless = s.dgFlawless ?? []
      if ((r.lives ?? 0) >= DUNGEON_LIVES && !s.dgFlawless.includes(r.dungeon)) {
        s.dgFlawless.push(r.dungeon)
        newFlawless = r.dungeon
      }
    }
  }
  if (r.partner && !s.used.includes(r.partner)) s.used.push(r.partner)

  const lines = matchXp(r)
  const base = lines.reduce((t, [, x]) => t + x, 0)
  if (r.kind === 'br' && r.won && !p.daily.firstWin) {
    p.daily.firstWin = true
    lines.push(['firstwin', FIRST_WIN_XP])
  }

  // Daily quests
  const qs = questsFor(day)
  const quests: Outcome['quests'] = []
  qs.forEach((q, i) => {
    const was = p.daily.p[i] ?? 0
    const now = Math.min(q.target, was + q.add(r))
    p.daily.p[i] = now
    if (was < q.target && now >= q.target) {
      quests.push({ id: q.id, xp: q.xp })
      lines.push([`quest:${q.id}`, q.xp])
    }
  })

  // Partner mastery: the match XP goes to the partner you started with (if it's yours to play)
  if (r.partner && !isUnlocked(p, 'partner', r.partner)) r.partner = 0
  const pk = String(r.partner)
  const xpFrom = r.partner ? p.partners[pk] ?? 0 : 0
  if (r.partner) p.partners[pk] = xpFrom + base
  const mFrom = masteryOf(xpFrom).lv, mTo = r.partner ? masteryOf(p.partners[pk]).lv : 0

  p.xp += lines.reduce((t, [, x]) => t + x, 0)

  // Achievements (may chain: an achievement's XP can push you to a level achievement)
  const ach: Outcome['ach'] = []
  for (let pass = 0; pass < 3; pass++) {
    let any = false
    for (const a of ACHIEVEMENTS) {
      if (p.ach.includes(a.id) || !a.test(p, r)) continue
      p.ach.push(a.id)
      p.xp += a.xp
      ach.push({ id: a.id, xp: a.xp })
      lines.push([`ach:${a.id}`, a.xp])
      any = true
    }
    if (!any) break
  }

  const points = pointsFor(r)
  p.pvp += points.pvp
  p.pve += points.pve

  const unlocks: string[] = []
  // A flawless dungeon clear earns its legendary as a follower (src/data/pets.ts)
  if (newFlawless && DUNGEON_PETS[newFlawless]) unlocks.push(`pet:${DUNGEON_PETS[newFlawless]}`)
  if (r.partner) {
    for (const [lv, key] of [[SHINY_AT, 'shiny'], [3, 'emblem'], [7, 'emblem'], [10, 'emblem']] as const) {
      if (mFrom < lv && mTo >= lv) unlocks.push(key === 'shiny' ? `shiny:${r.partner}` : `emblem:${r.partner}:${emblemOf(lv)}`)
    }
    // A freshly unlocked shiny is switched on straight away
    if (mFrom < SHINY_AT && mTo >= SHINY_AT && !p.shiny.includes(r.partner)) p.shiny.push(r.partner)
  }
  for (const t of titlesOf(p)) if (!before.titles.has(t)) unlocks.push(`title:${t}`)
  const lvNow = levelOf(p.xp).lv
  for (const u of REWARD_ROAD) if (u.lv > before.lv && u.lv <= lvNow) unlocks.push(`${u.kind}:${u.id}`)
  // A dungeon cleared for the first time: its legendary joins you
  for (const u of RAID_UNLOCKS) if (u.dungeon === newDungeon) unlocks.push(`raid:${u.kind}:${u.id}`)

  return {
    lines, quests, ach,
    total: lines.reduce((t, [, x]) => t + x, 0),
    level: { from: before.lv, to: levelOf(p.xp).lv },
    mastery: { partner: r.partner, from: mFrom, to: mTo, xpFrom, xpTo: r.partner ? p.partners[pk] : 0 },
    unlocks, points,
    daily: qs.map((q, i) => ({ id: q.id, p: p.daily.p[i] ?? 0, target: q.target, xp: q.xp })),
    streak: p.streak,
  }
}

/** Today's quests and how far you are (for the profile screen). */
export function dailyOf(p: Progress, day: string) {
  const same = p.daily.day === day
  return questsFor(day).map((q, i) => ({ id: q.id, p: same ? p.daily.p[i] ?? 0 : 0, target: q.target, xp: q.xp }))
}

/** A guest's local progress merged into an account (once), with hard caps. */
export function mergeGuest(acc: Progress, guest: Partial<Progress>): Progress {
  const g = normalize(guest)
  const cap = (v: number, hi: number) => Math.max(0, Math.min(hi, Math.floor(Number(v) || 0)))
  acc.xp += cap(g.xp, 6000)
  let partnerXp = 0
  for (const id of PARTNERS) {
    const add = Math.min(cap(g.partners[id] ?? 0, 3000), 9000 - partnerXp)
    if (add <= 0) continue
    partnerXp += add
    acc.partners[id] = (acc.partners[id] ?? 0) + add
  }
  const s = acc.stats, gs = g.stats
  s.m += cap(gs.m, 200)
  s.w += cap(gs.w, 30)
  s.top3 += cap(gs.top3, 100)
  s.kos += cap(gs.kos, 400)
  s.caught += cap(gs.caught, 1000)
  s.legend += cap(gs.legend, 30)
  s.crystal += cap(gs.crystal, 30)
  s.evolved += cap(gs.evolved, 300)
  s.time += cap(gs.time, 200 * 600)
  s.bestKos = Math.max(s.bestKos, cap(gs.bestKos, 11))
  s.raids += cap(gs.raids, 60)
  s.dw += cap(gs.dw, 60)
  for (const b of gs.bosses) if (BOSS_IDS.includes(b) && !s.bosses.includes(b)) s.bosses.push(b)
  for (const id of gs.used) if (PARTNERS.includes(id) && !s.used.includes(id)) s.used.push(id)
  // Achievements follow from the merged stats (not taken over as-is)
  for (const a of ACHIEVEMENTS) if (!acc.ach.includes(a.id) && a.test(acc, null)) acc.ach.push(a.id)
  for (const id of g.shiny) if (masteryOf(acc.partners[id] ?? 0).lv >= SHINY_AT && !acc.shiny.includes(id)) acc.shiny.push(id)
  acc.imported = true
  return acc
}
