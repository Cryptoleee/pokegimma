import type { SupportTier } from './_progress.js'

/**
 * Who supports the game on Patreon, by their friend code (Friends tab in the game,
 * fixed per account) or by account id ('d' + their Discord user id).
 * The server sets `supporter` on their progress from this list every time it's
 * loaded (and takes it away again once someone is off it); the client can't.
 * Packs stack: Spark (badge, title), Storm (+ the Storm Wisp), Legend (+ gold).
 *
 * Example: { 'K7QX2M': 'legend', 'd123456789012345678': 'storm' }
 */
export const SUPPORTERS: Record<string, SupportTier> = {
  SL9WU2: 'legend', // cryptoleee
}
