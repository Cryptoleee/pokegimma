import { movesetFor } from '../data/moves'
import { animatedUrl, PARTY_MAX, SPECIES, spriteUrl } from '../data/pokemon'
import { ROLES, roleOf } from '../data/roles'
import { trainerSpriteUrl } from '../data/trainers'
import { TYPE_COLOR, TYPE_NL } from '../data/types'
import { sfx } from '../audio'
import { itemUrl } from '../game/sprites'

/**
 * How-to-play shown after "Tik om te starten": a framed battle scene per
 * slide (built from the real game pieces: attack buttons, joystick, HP plates)
 * with a typewriter dialogue box. You can go back and forth with the buttons,
 * the dots, the arrow keys or a swipe.
 */

interface Slide {
  title: string
  /** Backdrop: day field, stormy night or the raid's volcano. */
  bg: 'field' | 'storm' | 'raid'
  stage: () => string
  text: string
}

const desk = matchMedia('(pointer: fine)').matches

const gif = (id: number, cls = '') =>
  `<img class="px ${cls}" src="${animatedUrl(id)}" onerror="this.onerror=null;this.src='${spriteUrl(id)}'" alt="">`
const plat = (cls: string) => `<div class="tp ${cls}"></div>`
const key = (k: string, cls = '') => `<span class="tk ${cls}">${k}</span>`

/** The attack buttons exactly as in the game (same classes), with key hints on desktop. */
function moveButtons() {
  const moves = movesetFor(SPECIES[25].types)
  return `<div class="t-moves">${moves
    .map((m, s) => `<div class="mb s${s} t-press" style="--tc:${TYPE_COLOR[m.type]};--d:${s * 0.7}s"><div class="ring"></div><div class="lbl"><span>${m.name}</span><small>${TYPE_NL[m.type]}</small></div>${desk ? `<span class="tk on-btn">${['Klik', 'Q', 'E', 'R'][s]}</span>` : ''}</div>`)
    .join('')}</div>`
}

/** BW-style HP plate. */
const hpPlate = (name: string, lv: number, cls: string) =>
  `<div class="t-plate ${cls}"><b>${name}</b><small>Lv${lv}</small><div class="t-hp"><span>HP</span><i><em></em></i></div></div>`

const SLIDES: Slide[] = [
  {
    title: 'Welkom',
    bg: 'field',
    stage: () => `
      <div class="t-sun"></div>
      ${plat('t-prof-plat')}
      <img class="px t-prof" src="${trainerSpriteUrl('juniper')}" alt="">
      <div class="t-modes">
        <div class="t-mode br"><b>Battle Royale</b><small>12 trainers · 1 winnaar</small></div>
        <div class="t-mode raid"><b>Raid</b><small>samen tegen een eindbaas</small></div>
      </div>
      <div class="t-spark"><i></i><i></i><i></i><i></i><i></i></div>`,
    text: 'Welkom bij BattleMon Royale! Ik ben Professor Juniper. Je kunt op twee manieren spelen: een Battle Royale, waarin je als laatste trainer overblijft, of een Raid, waarin je samen een eindbaas verslaat.',
  },
  {
    title: 'Je partner',
    bg: 'field',
    stage: () => `
      <div class="t-trio">
        ${[25, 446, 123]
          .map((id, i) => {
            const r = ROLES[roleOf(id)]
            return `<div class="t-pick" style="--i:${i}">${plat('')}${gif(id)}<em class="t-role" style="--rc:${r.color}"><i>${r.icon}</i>${r.name}</em><small class="t-bonus">${r.bonus}</small></div>`
          })
          .join('')}
      </div>`,
    text: 'Kies eerst een partner-Pokémon. Elke partner heeft een rol: Aanvaller, Allrounder, Verdediger of Snelheid. Die rol geeft een klein voordeel, zoals meer schade, meer HP of sneller lopen.',
  },
  {
    title: 'Besturing',
    bg: 'field',
    stage: () => `
      ${desk
        ? `<div class="t-keys">
            <div class="t-wasd">${key('W', 'w')}${key('A', 'a')}${key('S', 's')}${key('D', 'd')}</div>
            <small>lopen</small>
          </div>`
        : `<div class="t-stick"><div class="stick-base"><em class="n"></em><em class="e"></em><em class="s"></em><em class="w"></em><div class="stick-knob"></div></div><small>lopen</small></div>`}
      <div class="t-walk">${plat('')}<img class="px t-trainer" src="${trainerSpriteUrl('hilbert')}" alt="">${gif(25, 't-buddy')}</div>
      ${desk ? '<div class="t-mouse"><i></i><small>klik = aanval</small></div>' : '<div class="t-tap"></div>'}
      ${moveButtons()}`,
    text: desk
      ? 'Loop met WASD. Klik om aan te vallen en gebruik Q, E en R voor je krachten: ze richten op je muis. Je kunt ook lopen door de rechtermuisknop ingedrukt te houden.'
      : 'Beweeg met de joystick links op je scherm. Rechts zitten je aanvallen. Tik om aan te vallen; richten gaat vanzelf. Houd een knop vast en sleep om zelf te richten.',
  },
  {
    title: 'Vechten en groeien',
    bg: 'field',
    stage: () => `
      ${plat('t-foe-plat')}${plat('t-me-plat')}
      <div class="t-foe t-hurt">${gif(504)}</div>
      <img class="px t-me" src="${spriteUrl(25, { back: true })}" alt="">
      <svg class="t-bolt" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline points="0,20 22,8 40,28 62,10 84,30 104,8 126,26 148,10 170,28 200,18" /></svg>
      <div class="t-dmg">32</div>
      ${hpPlate('Patrat', 6, 'foe')}
      <div class="t-plate me"><b>Pikachu</b><small>Lv7</small><div class="t-hp full"><span>HP</span><i><em></em></i></div><div class="t-xp"><em></em></div></div>
      <div class="t-newmove">Nieuwe aanval op Lv 8!</div>`,
    text: 'Versla wilde Pokémon voor XP. Hoe langer je overleeft, hoe sterker je partner wordt. Op Lv 8, 16 en 25 leert hij een nieuwe aanval, en zo nu en dan evolueert hij!',
  },
  {
    title: 'Vangen',
    bg: 'field',
    stage: () => `
      ${plat('t-foe-plat')}
      <div class="t-foe t-dizzy">${gif(504)}<div class="t-stars"><i>★</i><i>★</i><i>★</i></div></div>
      <img class="px t-ball" src="${itemUrl('poke-ball')}" alt="">
      <div class="t-catch"><span>VANG!</span></div>
      <div class="t-caught">Gevangen!</div>
      <div class="t-party">${[25, 504, 0].map((id) => `<i class="${id ? '' : 'empty'}">${id ? `<img class="px" src="${spriteUrl(id)}" alt="">` : ''}</i>`).join('')}</div>`,
    text: `Is een wilde Pokémon verzwakt? Dan verschijnt de knop VANG!${desk ? ' (of druk op Spatie)' : ''}. Zo bouw je een team van maximaal ${PARTY_MAX} Pokémon, en je kunt tijdens het gevecht wisselen.`,
  },
  {
    title: 'Legendarische Pokémon',
    bg: 'field',
    stage: () => `
      <div class="t-rays"></div>
      ${plat('t-leg-plat')}
      <div class="t-leg">${gif(644)}</div>
      <div class="t-legtag">★ LEGENDARISCH ★</div>
      <img class="px t-mball" src="${itemUrl('master-ball')}" alt="">
      <div class="t-flash"></div>
      <div class="t-caught gold">Zekrom gevangen!</div>`,
    text: 'Soms verschijnt er een legendarische Pokémon, zoals Zekrom. Die is ijzersterk. Vind je een Master Ball? Daarmee vang je elke Pokémon in één keer, zelfs een legendarische!',
  },
  {
    title: 'De storm',
    bg: 'storm',
    stage: () => `
      <div class="t-map">
        <div class="t-zone"></div>
        <div class="t-dot you"></div><div class="t-dot r1"></div><div class="t-dot r2"></div><div class="t-dot r3"></div><div class="t-dot out"></div>
      </div>
      <div class="t-stormtag">De storm komt eraan!</div>`,
    text: 'Pas op voor de storm! Het speelveld krimpt steeds verder en buiten de cirkel verlies je HP. Blijf binnen de cirkel en wees de laatste trainer die overblijft.',
  },
  {
    title: 'Raid',
    bg: 'raid',
    stage: () => `
      ${plat('t-boss-plat')}
      <div class="t-boss">${gif(643)}</div>
      <div class="t-tele"><i></i></div>
      <div class="t-runner">${gif(25)}</div>
      <div class="t-warn">Rood op de grond = wegwezen!</div>`,
    text: 'In een raid vecht je met vrienden tegen een enorme eindbaas. Elke grote aanval zie je eerst als vorm op de grond: loop eruit voordat hij volloopt. Succes!',
  },
]

export function showIntro(onDone: () => void) {
  const el = document.getElementById('screen')!
  el.innerHTML = `
    <div class="tut">
      <div class="tut-top">
        <span class="tut-step"></span>
        <b class="tut-title"></b>
        <button class="tut-skip skip">Overslaan ▶▶</button>
      </div>
      <div class="tut-main">
        <div class="tut-stage"></div>
        <div class="tut-box">
          <p></p>
          <div class="tut-nav">
            <button class="tut-prev" aria-label="Vorige">◀ Terug</button>
            <div class="tut-dots">${SLIDES.map((s, i) => `<button data-i="${i}" aria-label="${s.title}"></button>`).join('')}</div>
            <button class="tut-next">Verder ▶</button>
          </div>
        </div>
      </div>
    </div>`
  const root = el.querySelector('.tut') as HTMLElement
  const stage = el.querySelector('.tut-stage') as HTMLElement
  const text = el.querySelector('.tut-box p') as HTMLElement
  const prev = el.querySelector('.tut-prev') as HTMLButtonElement
  const next = el.querySelector('.tut-next') as HTMLButtonElement
  const dots = [...el.querySelectorAll('.tut-dots button')] as HTMLButtonElement[]
  let idx = -1
  let typing: number | undefined
  let full = ''
  let done = false
  /** Furthest slide seen: going back to it shows the text at once. */
  let seen = -1

  const finish = () => {
    if (done) return
    done = true
    clearInterval(typing)
    window.removeEventListener('keydown', onKey)
    onDone()
  }

  const stopTyping = () => {
    clearInterval(typing)
    typing = undefined
    text.textContent = full
  }

  const show = (i: number) => {
    if (i < 0 || i >= SLIDES.length) return
    const fwd = i > idx
    idx = i
    const s = SLIDES[i]
    stage.className = `tut-stage bg-${s.bg} sl${i} ${fwd ? 'fwd' : 'back'}`
    stage.innerHTML = s.stage()
    el.querySelector('.tut-step')!.textContent = `${i + 1} / ${SLIDES.length}`
    el.querySelector('.tut-title')!.textContent = s.title
    dots.forEach((d, j) => {
      d.classList.toggle('on', j === i)
      d.classList.toggle('seen', j <= Math.max(seen, i))
    })
    prev.disabled = i === 0
    next.textContent = i === SLIDES.length - 1 ? 'Spelen! ▶' : 'Verder ▶'
    next.classList.toggle('last', i === SLIDES.length - 1)
    full = s.text
    clearInterval(typing)
    typing = undefined
    if (i <= seen) {
      text.textContent = full
      return
    }
    seen = i
    text.textContent = ''
    let n = 0
    typing = window.setInterval(() => {
      n += 1
      text.textContent = full.slice(0, n)
      if (n % 3 === 0 && full[n - 1] !== ' ') sfx.blip()
      if (n >= full.length) stopTyping()
    }, 22)
  }

  const forward = () => {
    // First tap completes the text, the next one moves on (like the games)
    if (typing !== undefined) return stopTyping()
    sfx.select()
    if (idx + 1 >= SLIDES.length) finish()
    else show(idx + 1)
  }
  const back = () => {
    if (idx <= 0) return
    sfx.select()
    show(idx - 1)
  }

  function onKey(e: KeyboardEvent) {
    if (done) return
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') forward()
    else if (e.key === 'ArrowLeft' || e.key === 'Backspace') back()
    else if (e.key === 'Escape') finish()
    else return
    e.preventDefault()
  }
  window.addEventListener('keydown', onKey)

  next.addEventListener('click', (e) => {
    e.stopPropagation()
    forward()
  })
  prev.addEventListener('click', (e) => {
    e.stopPropagation()
    back()
  })
  dots.forEach((d) =>
    d.addEventListener('click', (e) => {
      e.stopPropagation()
      const i = Number(d.dataset.i)
      if (i === idx) return
      sfx.select()
      show(i)
    }),
  )
  el.querySelector('.tut-skip')!.addEventListener('click', (e) => {
    e.stopPropagation()
    sfx.select()
    finish()
  })
  // Tap the scene or the text box to go on; swipe to go back and forth
  let sx = 0, sy = 0, swiped = false
  root.addEventListener('pointerdown', (e) => {
    sx = e.clientX
    sy = e.clientY
    swiped = false
  })
  root.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true
      if (dx < 0) forward()
      else back()
    }
  })
  for (const t of [stage, el.querySelector('.tut-box p')!])
    t.addEventListener('click', () => {
      if (!swiped) forward()
    })
  show(0)
}
