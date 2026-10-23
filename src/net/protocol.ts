import type { Difficulty } from '../data/difficulty'
import type { StadiumId } from '../data/stadiums'
import type { AimDir, Dir } from '../game/entities'
import type { MatchKind, MatchSetup } from '../game/game'
import type { ThemeId } from '../data/themes'

/** A player in the lobby. `pid` is a local profile id for now (an account id later). */
export interface LobbyPlayer {
  pid: string
  name: string
  trainer: string
  team: number[]
  /** Picked a team and tapped "Klaar". */
  ready?: boolean
  /** Progress cosmetics: partner shown shiny, follower (species), trainer level, title id. */
  shiny?: boolean
  pet?: number
  lv?: number
  title?: string
}

/** What the next match will be: chosen by the host (or you, solo). */
export interface MatchChoice {
  kind: MatchKind
  theme: ThemeId | 'random'
  /** 1 vs 1 stadium. */
  stadium?: StadiumId | 'random'
  /** How hard the bots, the CPU or the boss play. */
  diff?: Difficulty
  /** Raid: through a dungeon (its id; unset = the furthest one the host has opened) to its boss, or a classic raid against a random boss. */
  raid?: string
}

/** A chat line (lobby and in-game). */
export interface ChatLine {
  pid: string
  name: string
  text: string
}

/** Client → host while a match is running. */
export type Command =
  /** Your own position (players move themselves, so walking feels instant) plus where your camera is. */
  | { t: 'in'; x: number; y: number; d: Dir; f: 0 | 1; w: number; m: number; cx: number; cy: number }
  | { t: 'move'; s: number; tg?: number; d?: AimDir }
  | { t: 'switch'; i: number }
  | { t: 'ball'; w: number; m: boolean }
  | { t: 'item'; k: 'potion' | 'revive' }
  /** Answer to "your team is full": which slot to replace (-1 = let it go). */
  | { t: 'pick'; i: number }

/** One trainer as clients need to know it (bots included). */
export interface RosterEntry {
  i: number
  key: string
  sprite: string
  name: string
  human: boolean
  pid: string
}

/** Something that happened on the host that a client should see or hear. */
export type NetEvent =
  | ['v', string, number, number, ...unknown[]]
  | ['fx', unknown]
  | ['sfx', string, ...unknown[]]
  | ['cry', number, number]
  | ['hook', 'banner' | 'toast' | 'feed' | 'end', ...unknown[]]
  | ['full', number, number, boolean]

export type HostMsg =
  | { t: 'lobby'; players: LobbyPlayer[]; running: boolean; choice?: MatchChoice; quick?: { endsIn: number } }
  /** Answer to a peek: how a public lobby is doing (then the connection closes). */
  | { t: 'status'; players: number; running: boolean; open: boolean }
  | { t: 'start'; setup: MatchSetup; roster: RosterEntry[]; you: number }
  | { t: 's'; s: unknown; e: NetEvent[] }
  | { t: 'bye'; reason: string }
  | { t: 'ping' }
  | { t: 'chat'; m: ChatLine }

export type GuestMsg = { t: 'hello'; p: LobbyPlayer } | { t: 'cmd'; c: Command } | { t: 'ping' } | { t: 'chat'; text: string } | { t: 'peek' }
