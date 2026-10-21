import { trainerSpriteUrl, type TrainerDef } from '../data/trainers'

/**
 * Trainers that move: the BW2 battle animations (from PokeRogue's sprite
 * atlases, baked into one strip of 80×80 frames per trainer). In the menu a
 * trainer strikes their pose now and then and breathes in between; trainers
 * without an animation keep their still sprite.
 */

const STRIPS = import.meta.glob('../assets/trainers/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** Frames per strip, played at 24 per second (as in the games). */
const FRAMES: Record<string, number> = {
  nate: 81, rosa: 80, hugh: 77, skyla: 85, roxie: 87, burgh: 93, shauntal: 88, colress: 128,
  drayden: 88, grimsley: 89, steven: 76, lance: 75, cynthia: 58, ghetsis: 172, red: 68,
}

const stripOf = (t: TrainerDef) => (FRAMES[t.key] ? STRIPS[`../assets/trainers/${t.key}.png`] : undefined)

/** The trainer as HTML: animated if we have it, the still sprite otherwise. */
export function trainerArt(t: TrainerDef, cls = '') {
  const url = stripOf(t)
  if (!url) return `<img class="px ${cls}" src="${trainerSpriteUrl(t.sprite)}" alt="${t.name.replace(/"/g, '&quot;')}">`
  return `<span class="px n-tra ${cls}" role="img" aria-label="${t.name.replace(/"/g, '&quot;')}" style="--u:url(${url});--n:${FRAMES[t.key]}"></span>`
}

// One timer for all of them: each animated trainer plays once shortly after it
// appears, then again every 8 to 14 seconds.
const calm = matchMedia('(prefers-reduced-motion: reduce)')
let ticking = 0
function tick() {
  const all = document.querySelectorAll<HTMLElement>('.n-tra')
  if (!all.length) {
    clearInterval(ticking)
    ticking = 0
    return
  }
  const now = performance.now()
  all.forEach((el) => {
    if (el.classList.contains('play')) return
    const next = Number(el.dataset.next || 0)
    if (!next) el.dataset.next = String(now + 1200 + Math.random() * 1800)
    else if (now >= next) el.classList.add('play')
  })
}
document.addEventListener('animationend', (e) => {
  const el = e.target as HTMLElement
  if (e.animationName !== 'n-tra' || !el.classList?.contains('n-tra')) return
  el.classList.remove('play')
  el.dataset.next = String(performance.now() + 8000 + Math.random() * 6000)
})
/** Start the timer (call after putting trainers on the page). */
export function animateTrainers() {
  if (calm.matches || ticking) return
  ticking = window.setInterval(tick, 400)
}
