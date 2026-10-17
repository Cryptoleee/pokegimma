import { L } from '../i18n'
import { SPECIES } from './pokemon'
import { QUESTS } from '../../api/_progress'

/** Names and descriptions for everything in api/_progress.ts (which only knows ids). */

type T = [en: string, nl: string]
const t = ([en, nl]: T) => L(en, nl)

const TITLES: Record<string, T> = {
  rookie: ['Rookie', 'Beginner'],
  explorer: ['Explorer', 'Ontdekker'],
  ace: ['Ace Trainer', 'Ace Trainer'],
  veteran: ['Veteran', 'Veteraan'],
  elite: ['Elite', 'Elite'],
  champion: ['Champion', 'Kampioen'],
  stormchaser: ['Storm Chaser', 'Stormjager'],
  legend: ['Legend', 'Legende'],
  mythic: ['Mythic', 'Mythisch'],
  stormbreaker: ['Stormbreaker', 'Stormbreker'],
  arenaking: ['Arena King', 'Arenakoning'],
  unbeatable: ['Unbeatable', 'Onverslaanbaar'],
  wrecker: ['Wrecker', 'Sloper'],
  pacifist: ['Pacifist', 'Pacifist'],
  collector: ['Collector', 'Verzamelaar'],
  legendhunter: ['Legend Hunter', 'Legendejager'],
  duelist: ['Duelist', 'Duellist'],
  allrounder: ['Jack of All Trades', 'Alleskunner'],
  dedicated: ['Dedicated', 'Toegewijd'],
  regular: ['Regular', 'Vaste klant'],
}

export function titleName(id: string) {
  if (id.startsWith('master:')) {
    const sp = SPECIES[Number(id.slice(7))]
    return L(`${sp?.name ?? '?'} Master`, `${sp?.name ?? '?'}-meester`)
  }
  return TITLES[id] ? t(TITLES[id]) : id
}

export const ACH_INFO: Record<string, { icon: string; name: T; desc: T }> = {
  first_match: { icon: '🎮', name: ['First steps', 'Eerste stappen'], desc: ['Play your first match', 'Speel je eerste potje'] },
  first_win: { icon: '🏆', name: ['Champion of the arena', 'Kampioen van de arena'], desc: ['Win a battle royale', 'Win een battle royale'] },
  wins_10: { icon: '👑', name: ['Ten crowns', 'Tien kronen'], desc: ['Win 10 battle royales', 'Win 10 battle royales'] },
  wins_50: { icon: '💎', name: ['Unbeatable', 'Onverslaanbaar'], desc: ['Win 50 battle royales', 'Win 50 battle royales'] },
  top3_10: { icon: '🥉', name: ['Always close', 'Altijd dichtbij'], desc: ['Finish in the top 3 ten times', 'Eindig 10 keer in de top 3'] },
  kos_match_5: { icon: '💥', name: ['Rampage', 'Op oorlogspad'], desc: ['Knock out 5 trainers in one match', 'Schakel 5 trainers uit in één potje'] },
  kos_100: { icon: '⚔️', name: ['Hundred down', 'Honderd neer'], desc: ['Knock out 100 trainers in total', 'Schakel in totaal 100 trainers uit'] },
  pacifist: { icon: '🕊️', name: ['Pacifist', 'Pacifist'], desc: ['Win a battle royale without knocking anyone out', 'Win een battle royale zonder iemand uit te schakelen'] },
  survivor: { icon: '⏱️', name: ['Survivor', 'Overlever'], desc: ['Survive 5 minutes in a battle royale', 'Overleef 5 minuten in een battle royale'] },
  catch_50: { icon: '🔴', name: ['Gotta catch them', 'Vang ze allemaal'], desc: ['Catch 50 Pokémon', 'Vang 50 Pokémon'] },
  catch_500: { icon: '🎒', name: ['Collector', 'Verzamelaar'], desc: ['Catch 500 Pokémon', 'Vang 500 Pokémon'] },
  legend: { icon: '⭐', name: ['Legendary!', 'Legendarisch!'], desc: ['Catch a legendary Pokémon', 'Vang een legendarische Pokémon'] },
  crystal: { icon: '💠', name: ['Crystal clear', 'Kristalhelder'], desc: ['Grab the Evolution Crystal', 'Pak het Evolutiekristal'] },
  raid_first: { icon: '🐉', name: ['Raid cleared', 'Raid geslaagd'], desc: ['Defeat a raid boss', 'Versla een raid-baas'] },
  raid_all: { icon: '🌋', name: ['Legend hunter', 'Legendejager'], desc: ['Defeat all 5 raid bosses', 'Versla alle 5 raid-bazen'] },
  raid_flawless: { icon: '🛡️', name: ['Untouchable', 'Onaantastbaar'], desc: ['Clear a raid without losing a life', 'Haal een raid zonder een leven te verliezen'] },
  raid_mvp: { icon: '🎖️', name: ['Raid MVP', 'Raid-MVP'], desc: ['Do half the boss damage in a raid with others', 'Doe de helft van de baasschade in een raid met anderen'] },
  mp_first: { icon: '🤝', name: ['Better together', 'Samen sterker'], desc: ['Play a match with other people', 'Speel een potje met andere mensen'] },
  mp_win: { icon: '🥇', name: ['Duelist', 'Duellist'], desc: ['Win a battle royale against other people', 'Win een battle royale tegen andere mensen'] },
  partners_5: { icon: '🧩', name: ['Team player', 'Teamspeler'], desc: ['Play with 5 different partners', 'Speel met 5 verschillende partners'] },
  partners_all: { icon: '🌈', name: ['Jack of all trades', 'Alleskunner'], desc: ['Play with all 24 partners', 'Speel met alle 24 partners'] },
  mastery_5: { icon: '✨', name: ['Shiny!', 'Shiny!'], desc: ['Reach mastery 5 with a partner (shiny unlocked)', 'Haal mastery 5 met een partner (shiny vrijgespeeld)'] },
  mastery_10: { icon: '🏅', name: ['Master', 'Meester'], desc: ['Reach mastery 10 with a partner', 'Haal mastery 10 met een partner'] },
  level_10: { icon: '🔟', name: ['Level 10', 'Level 10'], desc: ['Reach trainer level 10', 'Haal trainerlevel 10'] },
  level_25: { icon: '🚀', name: ['Level 25', 'Level 25'], desc: ['Reach trainer level 25', 'Haal trainerlevel 25'] },
  streak_7: { icon: '🔥', name: ['On fire', 'In vuur en vlam'], desc: ['Play 7 days in a row', 'Speel 7 dagen op rij'] },
  matches_100: { icon: '💯', name: ['Regular', 'Vaste klant'], desc: ['Play 100 matches', 'Speel 100 potjes'] },
}
export const achName = (id: string) => (ACH_INFO[id] ? t(ACH_INFO[id].name) : id)
export const achDesc = (id: string) => (ACH_INFO[id] ? t(ACH_INFO[id].desc) : '')

const QUEST_INFO: Record<string, (n: number) => T> = {
  play3: (n) => [`Play ${n} matches`, `Speel ${n} potjes`],
  win1: () => ['Win a battle royale', 'Win een battle royale'],
  kos5: (n) => [`Knock out ${n} trainers`, `Schakel ${n} trainers uit`],
  catch10: (n) => [`Catch ${n} Pokémon`, `Vang ${n} Pokémon`],
  raid1: () => ['Clear a raid', 'Haal een raid'],
  top3x2: (n) => [`Finish top 3 (${n}×)`, `Eindig in de top 3 (${n}×)`],
  survive4: () => ['Survive 4 minutes in one match', 'Overleef 4 minuten in één potje'],
  friends1: () => ['Play a match with other people', 'Speel een potje met andere mensen'],
  evolve2: (n) => [`Evolve your Pokémon ${n} times`, `Laat je Pokémon ${n} keer evolueren`],
  damage: (n) => [`Deal ${n}% boss damage in raids`, `Doe ${n}% baasschade in raids`],
}
export const questText = (id: string, target: number) => (QUEST_INFO[id] ? t(QUEST_INFO[id](target)) : id)

/** Labels for the XP lines on the results screen. */
export function xpLabel(key: string) {
  if (key.startsWith('quest:')) {
    const id = key.slice(6)
    return `📜 ${questText(id, QUESTS.find((q) => q.id === id)?.target ?? 1)}`
  }
  if (key.startsWith('ach:')) return `🏆 ${achName(key.slice(4))}`
  const m: Record<string, T> = {
    match: ['Match played', 'Potje gespeeld'],
    time: ['Time survived', 'Tijd overleefd'],
    kos: ['Knockouts', 'Uitgeschakeld'],
    caught: ['Pokémon caught', 'Pokémon gevangen'],
    win: ['Victory!', 'Gewonnen!'],
    top3: ['Top 3', 'Top 3'],
    tophalf: ['Top half', 'Bovenste helft'],
    crystal: ['Evolution Crystal', 'Evolutiekristal'],
    clear: ['Raid cleared', 'Raid gehaald'],
    damage: ['Boss damage', 'Baasschade'],
    legend: ['Legendary caught', 'Legendarische gevangen'],
    evolved: ['Evolutions', 'Evoluties'],
    friends: ['With other players +20%', 'Met andere spelers +20%'],
    firstwin: ['First win of the day', 'Eerste winst van de dag'],
  }
  return m[key] ? t(m[key]) : key
}

/** "Unlocked!" lines for 'shiny:25', 'title:veteran', 'emblem:25:silver'. */
export function unlockText(u: string) {
  const [kind, a, b] = u.split(':')
  const name = SPECIES[Number(a)]?.name ?? '?'
  if (kind === 'shiny') return { icon: '✨', text: L(`Shiny ${name} unlocked!`, `Shiny ${name} vrijgespeeld!`) }
  if (kind === 'emblem') {
    const col: Record<string, T> = { bronze: ['Bronze', 'Bronzen'], silver: ['Silver', 'Zilveren'], gold: ['Gold', 'Gouden'] }
    return { icon: b === 'gold' ? '🥇' : b === 'silver' ? '🥈' : '🥉', text: L(`${t(col[b] ?? ['', ''])} ${name} emblem`, `${t(col[b] ?? ['', ''])} ${name}-embleem`) }
  }
  return { icon: '🏷️', text: `${L('New title', 'Nieuwe titel')}: ${titleName(u.slice(6))}` }
}
