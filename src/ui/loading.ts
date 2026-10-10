import { animatedUrl, spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { itemUrl } from '../game/sprites'
import { sfx } from '../audio'
import { esc } from './menu'
import { BOSSES, type BossDef, type BossId } from '../data/bosses'

/**
 * Pre-match splash: who's in, plus rotating tips. People who joined through a
 * shared link skipped the tutorial, so this is where they learn the basics.
 */

interface Tip {
  icon: string
  title: string
  text: string
}

const TIPS: Tip[] = [
  { icon: `<img class="px" src="${animatedUrl(150)}" onerror="this.onerror=null;this.src='${spriteUrl(150)}'" alt="">`, title: 'Legendarische Pokémon', text: 'Twee keer per potje verschijnt er een, met een alarm en een pijl die de weg wijst. Met een <b>Master Ball</b> vang je hem direct!' },
  { icon: `<img class="px" src="${itemUrl('master-ball')}" alt="">`, title: 'Master Ball', text: 'Raap ze op in de wereld en in dorpjes. Gooi er een (knop links van je aanvallen) en je vangt élke wilde Pokémon meteen.' },
  { icon: '<i class="ld-eye"></i>', title: 'Verstop je in het hoge gras', text: 'Een oogje boven je laat zien dat je onzichtbaar bent. Alleen wie heel dichtbij staat ziet je. Aanvallen verraadt je even.' },
  { icon: '<i class="ld-heart">♥</i>', title: 'HP herstelt vanzelf', text: 'Ben je 3 seconden niet in gevecht, dan krijgt je Pokémon langzaam HP terug. Trek je dus even terug als het misgaat.' },
  { icon: `<img class="px" src="${itemUrl('poke-ball')}" alt="">`, title: 'Vangen', text: 'Versla een wilde Pokémon en tik snel op <b>VANG!</b> Wie hem verslaat mag eerst. Je team kan tot 3 Pokémon groot worden.' },
  { icon: '<i class="ld-storm">⚡</i>', title: 'De storm', text: 'De paarse storm krimpt. Blijf binnen de witte cirkel op de kaart, anders verliest je Pokémon HP.' },
  { icon: '<i class="ld-up">▲</i>', title: 'Levelen', text: 'Vechten levert XP op. Op Lv 8, 16 en 25 krijg je een nieuwe aanval, en je Pokémon evolueert onderweg.' },
  { icon: '<i class="ld-aim">◎</i>', title: 'Richten', text: 'Tik een aanval = automatisch richten. Houd vast = blijven aanvallen. Sleep = zelf richten, loslaten = vuren.' },
  { icon: `<img class="px" src="${itemUrl('potion')}" alt="">`, title: 'Items', text: 'Potions genezen je Pokémon, met een Revive komt een verslagen Pokémon terug. Tik op je team linksboven om te wisselen.' },
]

/** Raid tips: dodging, lives, phases and the arena. */
function raidTips(boss: BossDef): Tip[] {
  return [
    { icon: '<i class="ld-warn">⚠</i>', title: 'Rood op de grond = wegwezen!', text: 'Elke grote aanval van de baas zie je eerst als rode vorm op de grond. Loop eruit voordat hij volloopt.' },
    { icon: `<img class="px" src="${spriteUrl(boss.species)}" alt="">`, title: boss.name, text: boss.envTip },
    { icon: '<i class="ld-heart">♥</i>', title: '3 levens', text: 'Ga je neer, dan kom je na 4 seconden terug. Na 3 keer kijk je mee. De raid mislukt als iedereen op is of na 4 minuten.' },
    { icon: '<i class="ld-up">▲</i>', title: 'Drie fases', text: `Op 66% en 33% HP wordt ${boss.name} woedend: hij brult je weg, krijgt nieuwe aanvallen en laat Potions vallen.` },
    { icon: `<img class="px" src="${itemUrl('potion')}" alt="">`, title: 'Geen herstel vanzelf', text: 'In een raid herstelt je HP niet vanzelf. Raap de Potions op die in de arena verschijnen.' },
    { icon: '<i class="ld-aim">◎</i>', title: 'Samen sterker', text: 'Met meer spelers heeft de baas meer HP, maar verdeelt hij zijn aanvallen. Blijf niet allemaal op één plek staan!' },
  ]
}

export interface LoadingPlayer {
  name: string
  sprite: string
  mon?: number
}

/**
 * Shows the splash for `seconds`, then calls `done`. With `skippable` a button
 * lets you start right away (solo); in multiplayer everyone waits together.
 */
export function showLoading(opts: { seconds: number; players: LoadingPlayer[]; skippable: boolean; bots: number; raid?: BossId }, done: () => void) {
  const app = document.getElementById('app')!
  const el = document.createElement('div')
  el.className = 'loading'
  // Legendary + Master Ball first (most asked), then a random mix
  const rest = TIPS.slice(2).sort(() => Math.random() - 0.5)
  const boss = opts.raid ? BOSSES[opts.raid] : null
  const tips = boss ? raidTips(boss) : [TIPS[Math.random() < 0.5 ? 0 : 1], TIPS[2], ...rest]
  el.innerHTML = `
    <div class="ld-bg"></div>
    <div class="ld-l">
    ${boss
      ? `<div class="ld-head"><small>RAID · ${boss.title.toUpperCase()}</small><b>${boss.name}</b></div>
    <div class="ld-boss" style="--c:${boss.color}"><img class="px" src="${animatedUrl(boss.species)}" onerror="this.onerror=null;this.src='${spriteUrl(boss.species)}'" alt=""></div>`
      : '<div class="ld-head"><small>BATTLE ROYALE</small><b>Potje wordt geladen</b></div>'}
    <div class="ld-players">
      ${opts.players.map((p, i) => `<div class="ld-p" style="--d:${i * 70}ms"><img class="px" src="${trainerSpriteUrl(p.sprite)}" alt="">${p.mon ? `<img class="px ld-mon" src="${spriteUrl(p.mon)}" alt="">` : ''}<span>${esc(p.name)}</span></div>`).join('')}
      ${opts.bots && !boss ? `<div class="ld-p bots" style="--d:${opts.players.length * 70}ms"><b>+${opts.bots}</b><span>bots</span></div>` : ''}
    </div>
    </div>
    <div class="ld-r">
    <div class="ld-tip"></div>
    <div class="ld-dots">${tips.map(() => '<i></i>').join('')}</div>
    <div class="ld-bar"><i></i></div>
    <div class="ld-foot">${opts.skippable ? '<button class="cta ld-go">Ik ben er klaar voor ▶</button>' : '<span class="ld-wait">Iedereen start tegelijk…</span>'}</div>
    </div>`
  app.append(el)
  requestAnimationFrame(() => el.classList.add('in'))

  const tipEl = el.querySelector('.ld-tip') as HTMLElement
  const dots = [...el.querySelectorAll<HTMLElement>('.ld-dots i')]
  let idx = -1
  const next = () => {
    idx = (idx + 1) % tips.length
    const t = tips[idx]
    tipEl.innerHTML = `<div class="ld-card"><div class="ld-icon">${t.icon}</div><div><small>TIP</small><b>${t.title}</b><p>${t.text}</p></div></div>`
    dots.forEach((d, i) => d.classList.toggle('on', i === idx))
  }
  next()
  const tipTimer = window.setInterval(next, 2700)
  // Tap the tip to see the next one
  tipEl.addEventListener('click', () => {
    clearInterval(tipTimer)
    next()
  })

  const bar = el.querySelector('.ld-bar i') as HTMLElement
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
