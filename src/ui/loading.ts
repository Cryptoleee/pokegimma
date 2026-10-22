import { animatedUrl, spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { itemUrl } from '../game/sprites'
import { sfx } from '../audio'
import { esc } from './menu'
import { MODE_RGB } from './results'
import { diffName, type Difficulty } from '../data/difficulty'
import { BOSSES, RESPAWN_TIME, type BossDef, type BossId } from '../data/bosses'
import { dungeonOf, type DungeonDef } from '../data/dungeons'
import { L, tx } from '../i18n'
import { STADIUMS, type StadiumId } from '../data/stadiums'
import { ROUND_TIME } from '../game/duel'

/**
 * Pre-match splash: who's in, plus rotating tips. People who joined through a
 * shared link skipped the tutorial, so this is where they learn the basics.
 */

interface Tip {
  icon: string
  title: string
  text: string
}

/** Built when shown, so the tips follow the chosen language. */
const battleTips = (): Tip[] => [
  { icon: `<img class="px" src="${animatedUrl(150)}" onerror="this.onerror=null;this.src='${spriteUrl(150)}'" alt="">`, title: L('Legendary Pokémon', 'Legendarische Pokémon'), text: L('One shows up twice a match, with an alarm and an arrow pointing the way. A <b>Master Ball</b> catches it instantly!', 'Twee keer per potje verschijnt er een, met een alarm en een pijl die de weg wijst. Met een <b>Master Ball</b> vang je hem direct!') },
  { icon: `<img class="px" src="${itemUrl('master-ball')}" alt="">`, title: 'Master Ball', text: L('Pick them up in the world and in villages. Throw one (button left of your moves) and you catch any wild Pokémon on the spot.', 'Raap ze op in de wereld en in dorpjes. Gooi er een (knop links van je aanvallen) en je vangt élke wilde Pokémon meteen.') },
  { icon: '<i class="ld-eye"></i>', title: L('Hide in the tall grass', 'Verstop je in het hoge gras'), text: L("An eye above you shows you're invisible. Only someone very close can see you. Attacking gives you away for a moment.", 'Een oogje boven je laat zien dat je onzichtbaar bent. Alleen wie heel dichtbij staat ziet je. Aanvallen verraadt je even.') },
  { icon: '<i class="ld-heart">♥</i>', title: L('HP heals by itself', 'HP herstelt vanzelf'), text: L("Stay out of battle for 3 seconds and your Pokémon slowly gets HP back. So back off for a bit when things go wrong.", 'Ben je 3 seconden niet in gevecht, dan krijgt je Pokémon langzaam HP terug. Trek je dus even terug als het misgaat.') },
  { icon: `<img class="px" src="${itemUrl('poke-ball')}" alt="">`, title: L('Catching', 'Vangen'), text: L('Beat a wild Pokémon and quickly tap <b>CATCH!</b> Whoever beats it gets first try. Your team can grow to 3 Pokémon.', 'Versla een wilde Pokémon en tik snel op <b>VANG!</b> Wie hem verslaat mag eerst. Je team kan tot 3 Pokémon groot worden.') },
  { icon: '<i class="ld-storm">⚡</i>', title: L('The storm', 'De storm'), text: L('The purple storm is closing in. Stay inside the white circle on the map, or your Pokémon loses HP.', 'De paarse storm krimpt. Blijf binnen de witte cirkel op de kaart, anders verliest je Pokémon HP.') },
  { icon: '<i class="ld-up">▲</i>', title: L('Leveling up', 'Levelen'), text: L('Battling earns XP. At Lv 8, 16 and 25 you get a new move, and your Pokémon evolves along the way.', 'Vechten levert XP op. Op Lv 8, 16 en 25 krijg je een nieuwe aanval, en je Pokémon evolueert onderweg.') },
  { icon: '<i class="ld-aim">◎</i>', title: L('Aiming', 'Richten'), text: L('Tap a move = auto-aim. Hold = keep attacking. Drag = aim yourself, release = fire.', 'Tik een aanval = automatisch richten. Houd vast = blijven aanvallen. Sleep = zelf richten, loslaten = vuren.') },
  { icon: `<img class="px" src="${itemUrl('potion')}" alt="">`, title: 'Items', text: L('Potions heal your Pokémon, a Revive brings a fainted Pokémon back. Tap your team top left to switch.', 'Potions genezen je Pokémon, met een Revive komt een verslagen Pokémon terug. Tik op je team linksboven om te wisselen.') },
]

/** Raid tips: dodging, lives, phases and the arena. */
function raidTips(boss: BossDef): Tip[] {
  return [
    { icon: '<i class="ld-warn">⚠</i>', title: L('Red on the ground = get out!', 'Rood op de grond = wegwezen!'), text: L("You see every big boss attack first as a red shape on the ground. Get out before it fills up.", 'Elke grote aanval van de baas zie je eerst als rode vorm op de grond. Loop eruit voordat hij volloopt.') },
    { icon: `<img class="px" src="${spriteUrl(boss.species)}" alt="">`, title: boss.name, text: tx(boss.envTip) },
    { icon: '<i class="ld-heart">♥</i>', title: L('One revive', 'Eén revive'), text: L(`Go down and you're back after ${RESPAWN_TIME} seconds, once. The second time you watch. The raid fails when everyone is out or after 4 minutes.`, `Ga je neer, dan kom je na ${RESPAWN_TIME} seconden één keer terug. De tweede keer kijk je mee. De raid mislukt als iedereen op is of na 4 minuten.`) },
    { icon: '<i class="ld-up">▲</i>', title: L('Three phases', 'Drie fases'), text: L(`At 66% and 33% HP ${boss.name} gets furious: it roars you back, gets new attacks and drops Potions.`, `Op 66% en 33% HP wordt ${boss.name} woedend: hij brult je weg, krijgt nieuwe aanvallen en laat Potions vallen.`) },
    { icon: `<img class="px" src="${itemUrl('potion')}" alt="">`, title: L('No healing by itself', 'Geen herstel vanzelf'), text: L("In a raid your HP doesn't heal by itself. Grab the Potions that show up in the arena.", 'In een raid herstelt je HP niet vanzelf. Raap de Potions op die in de arena verschijnen.') },
    { icon: '<i class="ld-aim">◎</i>', title: L('Stronger together', 'Samen sterker'), text: L("With more players the boss has more HP, but it spreads its attacks. Don't all stand in one spot!", 'Met meer spelers heeft de baas meer HP, maar verdeelt hij zijn aanvallen. Blijf niet allemaal op één plek staan!') },
  ]
}

/** Raid dungeon tips: rooms and waves, wardens, lives, then the legendary. */
function dungeonTips(dd: DungeonDef, boss: BossDef): Tip[] {
  const waves = dd.rooms.reduce((s, r) => s + r.waves.length, 0)
  return [
    { icon: '<i class="ld-up">▲</i>', title: L('Room by room', 'Kamer voor kamer'), text: L(`${dd.rooms.length} halls, ${waves} waves. A hall's gate opens once every foe in it is down: then on to the next.`, `${dd.rooms.length} zalen, ${waves} waves. De poort van een zaal gaat pas open als alle vijanden erin verslagen zijn: dan door naar de volgende.`) },
    { icon: '<i class="ld-warn">⚠</i>', title: L('Red on the ground = get out!', 'Rood op de grond = wegwezen!'), text: L('Wardens and the legendary show their big attacks first as a red shape on the ground. Get out before it fills up.', 'Wachters en de legende laten hun grote aanvallen eerst zien als rode vorm op de grond. Loop eruit voordat hij volloopt.') },
    { icon: '<i class="ld-warn">⚔</i>', title: L('Wardens', 'Wachters'), text: L('Twice a warden blocks the way: a big Pokémon with its own health bar that calls in help as it weakens. Beat it for an extra life.', 'Twee keer verspert een wachter de weg: een grote Pokémon met een eigen levensbalk die hulp roept als hij zwakker wordt. Versla hem voor een extra leven.') },
    { icon: '<i class="ld-heart">♥</i>', title: L(`${dd.lives} lives`, `${dd.lives} levens`), text: L(`Go down and you're back at the last gate after ${RESPAWN_TIME} seconds. Out of lives? Your team clears the room and you're back in.`, `Ga je neer, dan sta je na ${RESPAWN_TIME} seconden weer bij de laatste poort. Levens op? Als je team de zaal verovert, ben je terug.`) },
    { icon: `<img class="px" src="${itemUrl('potion')}" alt="">`, title: L('Lava and Potions', 'Lava en Potions'), text: L('Lava burns: cross the rivers at the bridges. Every cleared hall heals you a bit and leaves a Potion by the gate; elites and wardens drop one too.', 'Lava brandt: steek rivieren over bij de bruggen. Elke veroverde zaal geneest je een beetje en laat een Potion bij de poort achter; elites en wachters laten er ook een vallen.') },
    { icon: '<i class="ld-aim">◎</i>', title: L('Pick your partner', 'Kies je partner'), text: L('Almost everything down here is fire: water, rock and ground partners have the edge, grass and bug have a hard time.', 'Bijna alles hier beneden is vuur: water-, rots- en grondpartners hebben een voordeel, gras en insect hebben het zwaar.') },
    { icon: `<img class="px" src="${spriteUrl(boss.species)}" alt="">`, title: boss.name, text: L(`At the end the gate to the crater opens. Step in and ${boss.name} wakes: you have 4 minutes. `, `Aan het eind gaat de poort naar de krater open. Stap erin en ${boss.name} ontwaakt: je hebt 4 minuten. `) + tx(boss.envTip) },
  ]
}

/** 1 vs 1 tips: rounds, power-ups, grass and the ring. */
const duelTips = (): Tip[] => [
  { icon: '<i class="ld-up">▲</i>', title: L('Best of three', 'Best of three'), text: L('Win two rounds to take the duel. Both Pokémon are fully evolved at Lv 50 with all four moves: pick your partner for the match-up!', 'Win twee rondes en het duel is van jou. Beide Pokémon zijn volledig geëvolueerd op Lv 50 met alle vier de aanvallen: kies je partner op de match-up!') },
  { icon: `<img class="px" src="${itemUrl('x-attack')}" alt="">`, title: L('Power-ups', 'Power-ups'), text: L('Three pads drop power-ups: <b>X Attack</b> hits harder, <b>X Speed</b> moves and attacks faster, <b>X Defense</b> takes less damage, a <b>Hyper Potion</b> heals. The middle pad has the best ones.', 'Op drie plekken verschijnen power-ups: <b>X Attack</b> raakt harder, <b>X Speed</b> loopt en valt sneller aan, <b>X Defense</b> krijgt minder schade, een <b>Hyper Potion</b> geneest. In het midden liggen de beste.') },
  { icon: '<i class="ld-eye"></i>', title: L('Hide and ambush', 'Verstoppen en verrassen'), text: L("Tall grass hides you, until you attack. Your rival can't see your HP while you're in there.", 'In het hoge gras ben je onzichtbaar, tot je aanvalt. Je tegenstander ziet je HP dan ook niet.') },
  { icon: '<i class="ld-storm">⏱</i>', title: L('Time limit', 'Tijdslimiet'), text: L(`A round lasts at most ${ROUND_TIME} seconds. When time is up, the one with more HP left wins the round.`, `Een ronde duurt maximaal ${ROUND_TIME} seconden. Is de tijd op, dan wint wie de meeste HP over heeft.`) },
  { icon: '<i class="ld-heart">♥</i>', title: L('No healing by itself', 'Geen herstel vanzelf'), text: L("In a duel your HP doesn't come back by itself. Fight for the Hyper Potions.", 'In een duel komt je HP niet vanzelf terug. Vecht om de Hyper Potions.') },
]

export interface LoadingPlayer {
  name: string
  sprite: string
  mon?: number
}

/**
 * Shows the splash for `seconds`, then calls `done`. With `skippable` a button
 * lets you start right away (solo); in multiplayer everyone waits together.
 */
export function showLoading(opts: { seconds: number; players: LoadingPlayer[]; skippable: boolean; bots: number; raid?: BossId; dungeon?: boolean; duel?: boolean; stadium?: StadiumId; diff?: Difficulty }, done: () => void) {
  const app = document.getElementById('app')!
  const el = document.createElement('div')
  // Legendary + Master Ball first (most asked), then a random mix
  const TIPS = battleTips()
  const rest = TIPS.slice(2).sort(() => Math.random() - 0.5)
  const boss = opts.raid ? BOSSES[opts.raid] : null
  const dd = opts.dungeon ? dungeonOf(opts.raid) : null
  const stadium = opts.stadium ? STADIUMS[opts.stadium] : null
  const tips = boss && dd ? dungeonTips(dd, boss) : boss ? raidTips(boss) : opts.duel ? [...(stadium ? [{ icon: `<i class="ld-up">${stadium.icon}</i>`, title: stadium.name, text: stadium.tip }] : []), ...duelTips()] : [TIPS[Math.random() < 0.5 ? 0 : 1], TIPS[2], ...rest]
  const kind = boss ? 'raid' : opts.duel ? 'duel' : 'royale'
  // Not the standard game: say so up top
  const dl = opts.diff && opts.diff !== 'normal' ? ` · ${diffName(opts.diff)}` : ''
  el.className = `nld nld-${kind}`
  el.style.setProperty('--mc', MODE_RGB[kind])
  el.innerHTML = `
    <div class="nld-glow"></div>
    <div class="nld-in">
      <section class="nld-l">
        ${boss && dd
          ? `<div class="nld-head"><span class="n-label">${L('Raid dungeon', 'Raid-dungeon')} · ${boss.name}${dl}</span><h1>${esc(dd.name)}</h1><p class="nld-blurb">${esc(dd.blurb)}</p></div>
        <div class="nld-boss"><img class="px" src="${animatedUrl(boss.species)}" onerror="this.onerror=null;this.src='${spriteUrl(boss.species)}'" alt=""></div>`
          : boss
          ? `<div class="nld-head"><span class="n-label">Raid · ${esc(tx(boss.title))}${dl}</span><h1>${boss.name}</h1></div>
        <div class="nld-boss"><img class="px" src="${animatedUrl(boss.species)}" onerror="this.onerror=null;this.src='${spriteUrl(boss.species)}'" alt=""></div>`
          : opts.duel
            ? `<div class="nld-head"><span class="n-label">1 vs 1 · best of 3${dl}</span><h1>${stadium ? `${stadium.icon} ${stadium.name}` : L('Duel', 'Duel')}</h1></div>`
            : `<div class="nld-head"><span class="n-label">Battle Royale${dl}</span><h1>${L('Loading match', 'Potje wordt geladen')}</h1></div>`}
        <div class="nld-players ${opts.duel ? 'vs' : ''}">
          ${opts.players.map((p, i) => `${opts.duel && i === 1 ? '<em class="nld-vs">VS</em>' : ''}<div class="nld-p" style="--d:${i * 70}ms"><span class="nld-pic"><img class="px" src="${trainerSpriteUrl(p.sprite)}" alt="">${p.mon ? `<img class="px nld-mon" src="${spriteUrl(p.mon)}" alt="">` : ''}</span><b>${esc(p.name)}</b></div>`).join('')}
          ${opts.bots && !boss && !opts.duel ? `<div class="nld-p bots" style="--d:${opts.players.length * 70}ms"><span class="nld-pic"><i>+${opts.bots}</i></span><b>bots</b></div>` : ''}
        </div>
      </section>
      <section class="nld-r">
        <div class="nld-tip ld-tip" role="button" tabindex="0" aria-label="${L('Next tip', 'Volgende tip')}"></div>
        <div class="nld-dots">${tips.map(() => '<i></i>').join('')}</div>
        <div class="nld-bar"><i></i></div>
        <div class="nld-foot">${opts.skippable ? `<button class="n-btn ld-go">${L("I'm ready", 'Ik ben er klaar voor')}<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>` : `<span class="nld-wait"><i class="n-dot"></i>${L('Everyone starts together…', 'Iedereen start tegelijk…')}</span>`}</div>
      </section>
    </div>`
  app.append(el)
  requestAnimationFrame(() => el.classList.add('in'))

  const tipEl = el.querySelector('.nld-tip') as HTMLElement
  const dots = [...el.querySelectorAll<HTMLElement>('.nld-dots i')]
  let idx = -1
  const next = () => {
    idx = (idx + 1) % tips.length
    const t = tips[idx]
    tipEl.innerHTML = `<div class="nld-card"><div class="nld-icon">${t.icon}</div><div class="nld-txt"><span class="n-label">Tip</span><b>${t.title}</b><p>${t.text}</p></div></div>`
    dots.forEach((d, i) => d.classList.toggle('on', i === idx))
  }
  next()
  const tipTimer = window.setInterval(next, 2700)
  // Tap the tip to see the next one
  tipEl.addEventListener('click', () => {
    clearInterval(tipTimer)
    sfx.select()
    next()
  })

  const bar = el.querySelector('.nld-bar i') as HTMLElement
  bar.style.transition = `width ${opts.seconds}s linear`
  requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = '100%')))

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    clearInterval(tipTimer)
    clearTimeout(timer)
    el.classList.add('out')
    setTimeout(() => el.remove(), 400)
    done()
  }
  const timer = window.setTimeout(close, opts.seconds * 1000)
  el.querySelector('.ld-go')?.addEventListener('click', () => {
    sfx.select()
    close()
  })
  return { close }
}
