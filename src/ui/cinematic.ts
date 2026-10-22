import { channelOn, isMuted, onAudioChange } from '../audio'
import { playMusic } from '../music'
import { L } from '../i18n'

/**
 * Story cutscenes: a few filmed shots one after the other (crossfading),
 * with the story told in lines of text over them, typed out like the game's
 * dialogue. Everything is skippable; if a video can't play the story still
 * runs as text on black, so a cutscene never holds anyone up.
 *
 * Videos live in /cutscenes as an mp4 (H.264, Safari) and a webm (VP9) of the
 * same shot; the browser takes the first it can play.
 */

export interface CineLine {
  /** Seconds into the shot. */
  at: number
  until: number
  text: () => string
  /** A big title card in the middle instead of a subtitle. */
  title?: boolean
  /** A small line under a title card. */
  kicker?: () => string
}

export interface CineShot {
  /** File name in /cutscenes, without extension (none: a card on black). */
  src?: string
  /** How long the shot plays (the video may be longer). */
  len: number
  lines: CineLine[]
}

export interface Cinematic {
  id: string
  shots: CineShot[]
}

const SKIP_KEY = 'sb:skipCutscenes'
const skipAll = () => {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

const FADE = 0.7

/**
 * Get a cutscene ready (its videos start loading) while the tips splash is up;
 * `play` shows it and calls `done` when it ends or is skipped.
 */
export function prepareCinematic(c: Cinematic) {
  if (skipAll()) return { play: (done: () => void) => done() }
  const vids = c.shots.map((s) => {
    if (!s.src) return null
    const v = document.createElement('video')
    v.className = 'cin-v'
    v.preload = 'auto'
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.innerHTML = `<source src="/cutscenes/${s.src}.mp4" type="video/mp4"><source src="/cutscenes/${s.src}.webm" type="video/webm">`
    v.load()
    return v
  })
  return { play: (done: () => void) => run(c, vids, done) }
}

function run(c: Cinematic, shotVids: (HTMLVideoElement | null)[], done: () => void) {
  const vids = shotVids.filter((v): v is HTMLVideoElement => !!v)
  const app = document.getElementById('app')!
  const el = document.createElement('div')
  el.className = 'cin'
  el.innerHTML = `
    <div class="cin-stage"></div>
    <div class="cin-title"></div>
    <div class="cin-sub"><p></p></div>
    <button class="ghost2 cin-skip">${L('Skip ▶', 'Overslaan ▶')}</button>
    <button class="n-btn cin-tap hidden">${L('Tap to play', 'Tik om af te spelen')}</button>`
  const stage = el.querySelector('.cin-stage') as HTMLElement
  const titleEl = el.querySelector('.cin-title') as HTMLElement
  const subEl = el.querySelector('.cin-sub p') as HTMLElement
  const tap = el.querySelector('.cin-tap') as HTMLElement
  for (const v of vids) stage.append(v)
  app.append(el)
  playMusic(null)
  requestAnimationFrame(() => el.classList.add('in'))

  const volume = () => {
    const on = !isMuted() && (channelOn('music') || channelOn('sfx'))
    for (const v of vids) {
      v.muted = !on
      v.volume = 0.9
    }
  }
  volume()
  onAudioChange(volume)

  let shot = -1
  let shotStart = 0
  let finished = false
  let raf = 0
  let shown = ''
  let typed = 0
  let typeT = 0
  const clock = () => performance.now() / 1000

  const startShot = (i: number) => {
    shot = i
    shotStart = clock()
    shotVids.forEach((v, k) => v?.classList.toggle('on', k === i))
    el.classList.toggle('card', !c.shots[i].src)
    const v = shotVids[i]
    if (!v) return
    v.currentTime = 0
    const p = v.play()
    if (p)
      p.catch(() => {
        // Autoplay with sound refused: ask for a tap, the story waits
        tap.classList.remove('hidden')
        shotStart = Infinity
      })
  }
  tap.addEventListener('click', () => {
    tap.classList.add('hidden')
    shotStart = clock() - (shotVids[shot]?.currentTime ?? 0)
    void shotVids[shot]?.play().catch(() => {})
  })

  const finish = () => {
    if (finished) return
    finished = true
    cancelAnimationFrame(raf)
    removeEventListener('keydown', onKey, true)
    el.classList.add('out')
    for (const v of vids) v.pause()
    setTimeout(() => {
      el.remove()
      for (const v of vids) v.removeAttribute('src')
    }, 600)
    done()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      finish()
    }
  }
  addEventListener('keydown', onKey, true)
  el.querySelector('.cin-skip')!.addEventListener('click', finish)

  const tick = () => {
    if (finished) return
    raf = requestAnimationFrame(tick)
    const s = c.shots[shot]
    const t = clock() - shotStart
    // Next shot (crossfade), or the end
    if (t >= s.len - FADE / 2) {
      if (shot + 1 < c.shots.length) startShot(shot + 1)
      else if (t >= s.len) finish()
      return
    }
    // Story text for this moment
    const line = s.lines.find((l) => t >= l.at && t < l.until)
    const text = line ? line.text() : ''
    const key = `${shot}:${text}`
    if (key !== shown) {
      shown = key
      typed = 0
      typeT = 0
      titleEl.classList.toggle('on', !!line?.title)
      subEl.parentElement!.classList.toggle('on', !!line && !line.title)
      if (line?.title) titleEl.innerHTML = `<b>${text}</b>${line.kicker ? `<small>${line.kicker()}</small>` : ''}`
      else subEl.textContent = ''
    }
    if (line && !line.title && typed < text.length) {
      typeT += 1 / 60
      typed = Math.min(text.length, Math.floor(typeT * 38))
      subEl.textContent = text.slice(0, typed)
    }
    // Fade the last moments of the last filmed shot to black
    if (s.src && !c.shots.slice(shot + 1).some((n) => n.src)) el.classList.toggle('ending', t > s.len - FADE)
  }
  // A shot whose video can't load still plays its story on black
  vids.forEach((v) => v.addEventListener('error', () => v.classList.add('broken'), true))
  startShot(0)
  raf = requestAnimationFrame(tick)
}
