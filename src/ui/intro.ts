import { animatedUrl, PARTY_MAX, spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { sfx } from '../audio'
import { itemUrl } from '../game/sprites'

/**
 * Short animated tutorial shown after "Tik om te starten", styled like a
 * Black/White battle scene with a typewriter dialogue box.
 */

interface Slide {
  stage: string
  text: string
}

const gif = (id: number, cls = '') => `<img class="px ${cls}" src="${animatedUrl(id)}" onerror="this.onerror=null;this.src='${spriteUrl(id)}'" alt="">`

const bolt = `<svg class="bolt" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline points="0,20 22,8 40,28 62,10 84,30 104,8 126,26 148,10 170,28 200,18" /></svg>`

const SLIDES: Slide[] = [
  {
    stage: `
      <div class="plat far"></div>
      <img class="px prof" src="${trainerSpriteUrl('juniper')}" alt="">
      <div class="sparkles"><i></i><i></i><i></i><i></i></div>`,
    text: 'Welkom bij BattleMon Royale! Ik ben Professor Juniper. Twaalf trainers stappen de arena in… maar er kan er maar één winnen!',
  },
  {
    stage: `
      <div class="plat near"></div>
      <div class="trio">
        <div class="pick p1">${gif(25)}</div>
        <div class="pick p2">${gif(4)}</div>
        <div class="pick p3">${gif(501)}</div>
      </div>`,
    text: 'Kies eerst één partner-Pokémon. Samen trek je door een enorme wereld vol hoog gras, wilde Pokémon en rivalen.',
  },
  {
    stage: `
      <div class="pad">
        <div class="stick"><div class="knob"></div></div>
        <div class="walker"><img class="px" src="${trainerSpriteUrl('hilbert')}" alt=""></div>
        <div class="btns"><span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="b4"></span></div>
      </div>`,
    text: matchMedia('(pointer: fine)').matches
      ? 'Loop met WASD, of houd de muisknop ingedrukt en je loopt naar je cursor. Aanvallen zitten op 1 t/m 4 en richten op de vijand bij je cursor!'
      : 'Beweeg met de joystick links op je scherm. Rechts zitten je aanvallen. Richten gaat vanzelf: tik en je Pokémon valt aan!',
  },
  {
    stage: `
      <div class="plat near"></div><div class="plat far"></div>
      <div class="me">${gif(25)}</div>
      <div class="foe hit">${gif(504)}</div>
      ${bolt}
      <div class="dmg">32!</div>`,
    text: 'Versla wilde Pokémon voor extra XP. Hoe langer je overleeft, hoe sterker je partner wordt. Op Lv 8, 16 en 25 leert hij een nieuwe aanval!',
  },
  {
    stage: `
      <div class="plat far"></div>
      <div class="foe dizzy">${gif(504)}<div class="stars"><i>★</i><i>★</i><i>★</i></div></div>
      <img class="px ball" src="${itemUrl('poke-ball')}" alt="">
      <div class="caught">Gevangen!</div>`,
    text: `Is een wilde Pokémon verzwakt? Tik snel op VANG! Zo bouw je een team van maximaal ${PARTY_MAX} Pokémon.`,
  },
  {
    stage: `
      <div class="plat far"></div>
      <div class="legend">${gif(644)}</div>
      <img class="px mball" src="${itemUrl('master-ball')}" alt="">
      <div class="glow"></div>`,
    text: 'Vind je een Master Ball? Daarmee vang je elke wilde Pokémon direct, zelfs een legendarische!',
  },
  {
    stage: `
      <div class="storm">
        <div class="ring"></div>
        <div class="dot you"></div><div class="dot r1"></div><div class="dot r2"></div><div class="dot r3"></div>
      </div>`,
    text: 'Pas op voor de storm! Het speelveld krimpt steeds verder. Blijf binnen de cirkel en wees de laatste trainer die overblijft. Succes!',
  },
]

export function showIntro(onDone: () => void) {
  const el = document.getElementById('screen')!
  el.innerHTML = `
    <div class="intro">
      <button class="skip">Overslaan ▶▶</button>
      <div class="stage"></div>
      <div class="dots">${SLIDES.map(() => '<i></i>').join('')}</div>
      <div class="dialog panel"><p></p><span class="more">▼</span></div>
    </div>`
  const stage = el.querySelector('.stage') as HTMLElement
  const text = el.querySelector('.dialog p') as HTMLElement
  const more = el.querySelector('.more') as HTMLElement
  const dots = [...el.querySelectorAll('.dots i')] as HTMLElement[]
  let idx = -1
  let typing: number | undefined
  let full = ''
  let done = false

  const finish = () => {
    if (done) return
    done = true
    clearInterval(typing)
    onDone()
  }

  const show = (i: number) => {
    idx = i
    const s = SLIDES[i]
    stage.className = `stage s${i}`
    stage.innerHTML = s.stage
    dots.forEach((d, j) => d.classList.toggle('on', j <= i))
    full = s.text
    text.textContent = ''
    more.classList.add('hidden')
    more.textContent = i === SLIDES.length - 1 ? 'Start! ▶' : '▼'
    clearInterval(typing)
    let n = 0
    typing = window.setInterval(() => {
      n += 1
      text.textContent = full.slice(0, n)
      if (n % 3 === 0 && full[n - 1] !== ' ') sfx.blip()
      if (n >= full.length) {
        clearInterval(typing)
        typing = undefined
        more.classList.remove('hidden')
      }
    }, 24)
  }

  const advance = () => {
    if (typing !== undefined) {
      // First tap completes the text, second tap moves on (like the games)
      clearInterval(typing)
      typing = undefined
      text.textContent = full
      more.classList.remove('hidden')
      return
    }
    sfx.select()
    if (idx + 1 >= SLIDES.length) finish()
    else show(idx + 1)
  }

  el.querySelector('.intro')!.addEventListener('click', advance)
  el.querySelector('.skip')!.addEventListener('click', (e) => {
    e.stopPropagation()
    sfx.select()
    finish()
  })
  show(0)
}
