/**
 * "What's new": the update notes, newest first. Add an entry at the top for a
 * new update; returning players see it once, automatically.
 *
 * A video is optional (only for the big ones). Put the files in public/news/ and
 * point to them here: `wide` is 16:9 (desktop, landscape), `tall` is 9:16 (phones
 * held upright). One of the two is enough; the other screen then shows that one.
 * Keep each file small (H.264 MP4, ~10–20 MB). `poster` holds optional stills, one
 * per format, shown before the video plays.
 */

type T = [en: string, nl: string]

export interface NewsEntry {
  /** Unique and increasing (the date works fine), used to remember what you've seen. Add a letter to show a post to everyone again ('2026-10-18b'). */
  id: string
  title: T
  intro?: T
  items: { icon: string; text: T }[]
  video?: { wide?: string; tall?: string; poster?: { wide?: string; tall?: string } }
}

export const NEWS: NewsEntry[] = [
  {
    id: '2026-10-23',
    title: ['The Raid Revamp', 'De raid-revamp'],
    intro: [
      'Raids are now real dungeons: fight through six rooms of packs and wardens, alone or with friends, to reach the legendary at the end.',
      'Raids zijn nu echte dungeons: vecht je door zes zalen vol groepen en wachters, alleen of met vrienden, naar de legendary aan het eind.',
    ],
    video: {
      wide: '/news/raid-revamp-16x9.mp4',
      tall: '/news/raid-revamp-9x16.mp4',
      poster: { wide: '/news/raid-revamp-16x9.jpg', tall: '/news/raid-revamp-9x16.jpg' },
    },
    items: [
      { icon: '🏰', text: ['Three raid dungeons, each with its own wardens, mechanics and boss: The Burning Depths (Reshiram), The Storm Tower (Zekrom) and The Frozen Citadel (Kyurem). Beat one to unlock the next', 'Drie raid-dungeons, elk met eigen wachters, mechanieken en baas: De Brandende Diepten (Reshiram), De Stormtoren (Zekrom) en De IJscitadel (Kyurem). Versla er een om de volgende te openen'] },
      { icon: '◎', text: ['Pull packs one at a time and take out menders and guards first', 'Pull de groepen één voor één en haal healers en schildwachten eerst neer'] },
      { icon: '⚡', text: ['Interrupt casts: hit a casting foe with a melee, dash or ultimate move and the spell fails', 'Onderbreek casts: raak een castende vijand met een melee-, dash- of ultimate-aanval en de spreuk mislukt'] },
      { icon: '⚠️', text: ['Telegraphed attacks: read the warning on the ground and get out in time', 'Aangekondigde aanvallen: lees de waarschuwing op de grond en ga op tijd opzij'] },
      { icon: '😈', text: ['Easy, Normal or Hard, and checkpoints: go down and you\'re back at the last gate', 'Makkelijk, Normaal of Moeilijk, en checkpoints: ga je neer, dan sta je weer bij de laatste poort'] },
      { icon: '🎁', text: ['Rewards per dungeon: a new partner (Magby, Elekid or Spheal, who grow into the wardens), a title (Flame Tamer, Storm Rider, Frostbound), and a Mini Reshiram, Zekrom or Kyurem follower if you clear it without losing a life', 'Beloningen per dungeon: een nieuwe partner (Magby, Elekid of Spheal, die uitgroeien tot de wachters), een titel (Vlammentemmer, Stormrijder, IJsgeboren), en een Mini-Reshiram, -Zekrom of -Kyurem als volger als je hem haalt zonder een leven te verliezen'] },
      { icon: '♥', text: ['One-time supporter packs (Spark, Storm, Legend) with a badge, a title and more. All cosmetic: the game stays free to play. Tap the heart on the home screen', 'Eenmalige supporter-pakketten (Vonk, Storm, Legende) met een badge, een titel en meer. Alles cosmetisch: de game blijft gratis. Tik op het hartje op het home-scherm'] },
    ],
  },
  {
    id: '2026-10-20b',
    title: ['New mode: 1 vs 1', 'Nieuwe modus: 1 tegen 1'],
    intro: [
      'Face one trainer in a stadium. Best of three, both partners fully evolved at Lv 50. Skill and match-ups decide.',
      'Tegen één trainer in een stadion. Best of three, beide partners volledig geëvolueerd op Lv 50. Skill en match-ups beslissen.',
    ],
    items: [
      { icon: '⚔️', text: ['1 vs 1 online against a random player, against the CPU, or with a friend using a code', '1 tegen 1 online tegen een willekeurige speler, tegen de CPU, of met een vriend via een code'] },
      { icon: '💥', text: ['Power-ups on three pads: X Attack, X Speed, X Defense and Hyper Potions', 'Power-ups op drie plekken: X Attack, X Speed, X Defense en Hyper Potions'] },
      { icon: '🏟️', text: ['Five stadiums: Pokémon Stadium, Desert Arena, Ice Rink, Water Arena and Volcano Arena, with a crowd that cheers you on', 'Vijf stadions: Pokémon Stadion, Woestijnarena, IJsbaan, Waterarena en Vulkaanarena, met publiek dat je aanmoedigt'] },
      { icon: '⏱', text: ['Hide in the grass and ambush your rival; a round lasts 75 seconds, then more HP wins it', 'Verstop je in het gras en verras je tegenstander; een ronde duurt 75 seconden, daarna wint wie meer HP heeft'] },
      { icon: '🏅', text: ['3 new achievements and the title "Gladiator"; online duels count for the PvP ranking', '3 nieuwe prestaties en de titel "Gladiator"; online duels tellen mee voor de PvP-ranglijst'] },
      { icon: '🏠', text: ['A new home screen: pick a mode first, then how you want to play', 'Een nieuw home-scherm: kies eerst een modus, dan hoe je wilt spelen'] },
      { icon: '✨', text: ['Every Pokémon now moves with its animated sprite: breathing, hopping as it walks and lunging when it attacks', 'Elke Pokémon beweegt nu met zijn geanimeerde sprite: ademen, huppelen tijdens het lopen en uitvallen bij een aanval'] },
      { icon: '⚖️', text: ['Battle royale balance: a caught legendary joins at your level and awakens like a legendary partner, KOs on weaker trainers give less XP, and Snorlax is tamed', 'Balans in de battle royale: een gevangen legendary komt op jouw level binnen en ontwaakt net als een legendarische partner, KO\'s op zwakkere trainers geven minder XP, en Snorlax is getemd'] },
    ],
  },
  {
    id: '2026-10-18b',
    title: ['The Progression Update', 'De progressie-update'],
    intro: [
      'Every match now counts. Level up, unlock new partners and trainers, and climb the world rankings.',
      'Elk potje telt nu. Stijg in level, speel nieuwe partners en trainers vrij en klim in de wereldranglijst.',
    ],
    video: {
      wide: '/news/progression-16x9.mp4',
      tall: '/news/progression-9x16.mp4',
      poster: { wide: '/news/progression-16x9.jpg', tall: '/news/progression-9x16.jpg' },
    },
    items: [
      { icon: '⬆️', text: ['Trainer levels 1–50: XP for every match, with a breakdown on the results screen', 'Trainerlevels 1–50: XP voor elk potje, met een overzicht op het resultaatscherm'] },
      { icon: '🎁', text: ['Reward road: unlock 17 new partners like Infernape, Magnezone, Mamoswine and Salamence, and 14 trainers like Cynthia and Red', 'Reward road: speel 17 nieuwe partners vrij zoals Infernape, Magnezone, Mamoswine en Salamence, en 14 trainers zoals Cynthia en Red'] },
      { icon: '🔥', text: ['Legendary partners: Articuno, Zapdos, Moltres, Kyogre, Groudon and Mew. They awaken and grow stronger as they level up', 'Legendarische partners: Articuno, Zapdos, Moltres, Kyogre, Groudon en Mew. Ze ontwaken en worden sterker met elk level'] },
      { icon: '★', text: ['Signature ultimates with their own big effects: Flare Blitz, Origin Pulse, Precipice Blades and more', 'Signature-ultimates met eigen grote effecten: Flare Blitz, Origin Pulse, Precipice Blades en meer'] },
      { icon: '✨', text: ['Partner mastery: play with a partner to unlock its shiny form at ★5, plus emblems and a master title', 'Partner-mastery: speel met een partner om bij ★5 zijn shiny vorm vrij te spelen, plus emblemen en een meestertitel'] },
      { icon: '🏆', text: ['27 achievements, titles and 3 daily quests (the same for everyone)', '27 prestaties, titels en 3 dagopdrachten (voor iedereen dezelfde)'] },
      { icon: '🌍', text: ['World rankings: PvP and PvE, this week and all time', 'Wereldranglijst: PvP en PvE, deze week en altijd'] },
    ],
  },
  {
    id: '2026-10-14',
    title: ['The Friends Update', 'De vrienden-update'],
    intro: [
      'Play together in one tap, and never miss what happens in a match.',
      'Met één tik samen spelen, en mis nooit meer wat er in een potje gebeurt.',
    ],
    video: {
      wide: '/news/friends-16x9.mp4',
      tall: '/news/friends-9x16.mp4',
      poster: { wide: '/news/friends-16x9.jpg', tall: '/news/friends-9x16.jpg' },
    },
    items: [
      { icon: '👥', text: ['Log in with Discord (optional) to save your progress, add friends and join their lobby in one tap', 'Log in met Discord (optioneel) om je voortgang te bewaren, vrienden toe te voegen en met één tik in hun lobby te springen'] },
      { icon: '📰', text: ['Live feed: knockouts, legendary spawns, supply drops and the storm stay in view, also while you watch', 'Live feed: KO\'s, legendarische spawns, bevoorrading en de storm blijven in beeld, ook als je meekijkt'] },
      { icon: '💠', text: ['New item, the Evolution Crystal: one per match, early on. Find the pillar of light first and your Pokémon fully evolves, with every move', 'Nieuw item, het Evolutiekristal: één per potje, vroeg in het spel. Vind als eerste de lichtzuil en je Pokémon evolueert volledig, met alle aanvallen'] },
      { icon: '💬', text: ['Keep chatting while you watch after a knockout', 'Blijf chatten terwijl je meekijkt na een KO'] },
      { icon: '🔊', text: ['New recorded sound effects for every type of attack', 'Nieuwe opgenomen geluidseffecten voor elk type aanval'] },
    ],
  },
]

export const latestNews = () => NEWS[0]
