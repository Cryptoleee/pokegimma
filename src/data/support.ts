import type { SupportTier } from '../../api/_progress'
import { L } from '../i18n'
import spark from '../assets/support/brons-vonk.png'
import storm from '../assets/support/zilver-storm.png'
import legend from '../assets/support/goud-legende.png'

/** Supporting the game: the Patreon page, its tiers and the people on it. */
export const PATREON_URL = 'https://www.patreon.com/cw/StormbreakGame'

export const TIERS: { id: SupportTier; badge: string; name: () => string; price: string; perks: () => string }[] = [
  { id: 'spark', badge: spark, name: () => L('Spark', 'Vonk'), price: '€3', perks: () => L('Your name in the thanks list, supporter-only devlogs', 'Je naam in de bedankt-lijst, devlogs alleen voor supporters') },
  { id: 'storm', badge: storm, name: () => 'Storm', price: '€7', perks: () => L('Early access to new dungeons, a vote on what comes next', 'Vroege toegang tot nieuwe dungeons, meestemmen over wat er komt') },
  { id: 'legend', badge: legend, name: () => L('Legend', 'Legende'), price: '€15', perks: () => L('The golden ★ Supporter title, and your idea gets built', 'De gouden ★ Supporter-titel, en jouw idee wordt gebouwd') },
]

/**
 * The thanks list: supporters who said their name may be shown. (The golden
 * title is given by account on the server, in api/_supporters.ts.)
 */
export const SUPPORTER_NAMES: { name: string; tier: SupportTier }[] = []
