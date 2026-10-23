import type { SupportTier } from '../../api/_progress'
import { L } from '../i18n'
import spark from '../assets/support/brons-vonk.png'
import storm from '../assets/support/zilver-storm.png'
import legend from '../assets/support/goud-legende.png'
import wisp from '../assets/support/wisp.png'

/** Supporting the game: the Patreon page and shop, its one-time packs and the people who bought one. */
export const PATREON_URL = 'https://www.patreon.com/cw/StormbreakGame'
export const SHOP_URL = 'https://www.patreon.com/cw/StormbreakGame/shop'

export const TIERS: { id: SupportTier; badge: string; name: () => string; price: string; perks: () => string }[] = [
  { id: 'spark', badge: spark, name: () => L('Spark', 'Vonk'), price: '€3', perks: () => L('A bronze badge by your name, the title ⚡ Spark, your name in the thanks list', 'Een bronzen badge bij je naam, de titel ⚡ Vonk, je naam in de bedankt-lijst') },
  { id: 'storm', badge: storm, name: () => 'Storm', price: '€10', perks: () => L('A silver badge, the title 🌩️ Stormchaser, the Storm Wisp follower, your name in the thanks list', 'Een zilveren badge, de titel 🌩️ Stormjager, de Storm Wisp als volger, je naam in de bedankt-lijst') },
  { id: 'legend', badge: legend, name: () => L('Legend', 'Legende'), price: '€25', perks: () => L('A gold badge, the title ★ Legend, your name in gold with sparks, the Storm Wisp, your name on the Wall of Legends, and your idea in the game', 'Een gouden badge, de titel ★ Legende, je naam in goud met vonkjes, de Storm Wisp, je naam op de Muur der Legendes, en jouw idee in de game') },
]

export const badgeOf = (t: SupportTier | undefined) => TIERS.find((x) => x.id === t)?.badge

/** The Storm Wisp: the supporters' own follower (not a Pokémon: drawn by the game itself). */
export const WISP = 9001
export const WISP_ICON = wisp

/**
 * Thanks list (and the Wall of Legends): supporters who said their name may be
 * shown. Their pack itself is given by account on the server, in api/_supporters.ts.
 */
export const SUPPORTER_NAMES: { name: string; tier: SupportTier }[] = []
