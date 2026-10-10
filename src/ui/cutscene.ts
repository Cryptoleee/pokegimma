import { animatedUrl, SPECIES, spriteUrl } from '../data/pokemon'
import { cry, sfx } from '../audio'

/**
 * Classic evolution sequence: the Pokémon glows white and flickers between
 * its old and new silhouettes faster and faster, a flash, then the reveal.
 */
export function showEvolution(from: number, to: number, shiny: boolean, done: () => void) {
  const app = document.getElementById('app')!
  const el = document.createElement('div')
  el.className = 'evo-scene'
  const oldName = SPECIES[from].name
  const newName = SPECIES[to].name
  el.innerHTML = `
    <div class="evo-glow"></div>
    <div class="evo-orbs">${Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    <div class="evo-fig">
      <img class="px a" src="${spriteUrl(from, { shiny })}" alt="">
      <img class="px b" src="${spriteUrl(to, { shiny })}" alt="">
    </div>
    <div class="evo-flash"></div>
    <div class="evo-box panel"><p></p></div>`
  app.append(el)
  const a = el.querySelector('.a') as HTMLElement
  const b = el.querySelector('.b') as HTMLElement
  const p = el.querySelector('p') as HTMLElement
  const fig = el.querySelector('.evo-fig') as HTMLElement

  const type = (text: string) => {
    let n = 0
    const id = setInterval(() => {
      n++
      p.textContent = text.slice(0, n)
      if (n % 3 === 0) sfx.blip()
      if (n >= text.length) clearInterval(id)
    }, 22)
  }

  requestAnimationFrame(() => el.classList.add('in'))
  cry(from, 0.3)
  type(`Wat? ${oldName} evolueert!`)

  // Flicker between silhouettes, accelerating
  let showNew = false
  let delay = 360
  let finished = false
  const flick = () => {
    if (finished) return
    showNew = !showNew
    a.style.opacity = showNew ? '0' : '1'
    b.style.opacity = showNew ? '1' : '0'
    delay = Math.max(45, delay * 0.82)
    setTimeout(flick, delay)
  }
  setTimeout(() => {
    fig.classList.add('glow')
    flick()
  }, 600)

  const reveal = () => {
    finished = true
    el.classList.add('flash')
    sfx.evolve()
    setTimeout(() => {
      fig.classList.remove('glow')
      fig.classList.add('revealed')
      a.style.opacity = '0'
      b.style.opacity = '1'
      b.setAttribute('src', animatedUrl(to))
      b.onerror = () => b.setAttribute('src', spriteUrl(to, { shiny }))
      el.classList.add('done')
      cry(to, 0.35)
      type(`Gefeliciteerd! ${oldName} evolueerde in ${newName}!`)
    }, 220)
  }
  setTimeout(reveal, 3300)

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    el.classList.add('out')
    setTimeout(() => {
      el.remove()
      done()
    }, 350)
  }
  el.addEventListener('click', () => {
    if (el.classList.contains('done')) close()
  })
  setTimeout(close, 6200)
}
