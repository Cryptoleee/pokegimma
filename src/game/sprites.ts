import { spriteUrl } from '../data/pokemon'
import { BOSS_ANIMS } from '../data/bossAnims'
import { BOSS_ACTIONS } from '../data/bossActions'

/** Baked sprite sheets of the animated BW sprites (raid bosses and their other forms). */
const ANIM_URLS = import.meta.glob('../assets/boss/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export interface Sprite {
  img: HTMLImageElement
  /** Tight bounding box of opaque pixels. */
  bx: number
  by: number
  bw: number
  bh: number
  white?: HTMLCanvasElement
  ready: boolean
  /** Animated: frames in a grid of equal cells (bx/by/bw/bh is the box inside a cell). */
  anim?: { w: number; h: number; cols: number; durs: number[]; ends: number[]; total: number }
}

const cache = new Map<string, Sprite>()

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Kon ${url} niet laden`))
    img.src = url
  })
}

/** Returns a sprite immediately; it fills in once the image arrives. */
export function getSprite(url: string): Sprite {
  let s = cache.get(url)
  if (s) return s
  const img = new Image()
  // PokéAPI (GitHub) sends CORS headers so we can measure the sprite; Showdown does not,
  // and asking for CORS there would block the image. Drawing works either way.
  if (url.includes('githubusercontent.com')) img.crossOrigin = 'anonymous'
  s = { img, bx: 0, by: 0, bw: 96, bh: 96, ready: false }
  const sprite = s
  img.onload = () => {
    measure(sprite)
    sprite.ready = true
  }
  img.src = url
  cache.set(url, s)
  return s
}

export function monSprite(id: number, back: boolean, shiny: boolean): Sprite {
  return getSprite(spriteUrl(id, { back, shiny }))
}

/** The animated sheet for this Pokémon (or form), or an action like '643-roar', if one was baked. */
export function animSprite(id: number | string): Sprite | null {
  const a = typeof id === 'number' ? BOSS_ANIMS[id] : BOSS_ACTIONS[id]
  const url = ANIM_URLS[`../assets/boss/${id}.png`]
  if (!a || !url) return null
  const s = getSprite(url)
  if (!s.anim) {
    let t = 0
    const ends = a.durs.map((d) => (t += d))
    s.anim = { ...a, ends, total: t }
    Object.assign(s, { bx: 0, by: 0, bw: a.w, bh: a.h })
  }
  return s
}

/** Top-left of the frame to draw at `time` (seconds); plain sprites have one frame. */
export function frameAt(s: Sprite, time: number, offset = 0, once = false): [number, number] {
  const a = s.anim
  if (!a) return [s.bx, s.by]
  // One-shot actions stop on their last frame; idles loop
  const t = once ? Math.min(a.total - 1, Math.max(0, time * 1000)) : ((time * 1000 + offset) % a.total + a.total) % a.total
  let i = 0
  while (i < a.ends.length - 1 && a.ends[i] <= t) i++
  return [(i % a.cols) * a.w, Math.floor(i / a.cols) * a.h]
}

export function preloadMon(id: number, shiny = false) {
  monSprite(id, false, shiny)
  monSprite(id, true, shiny)
}

function measure(s: Sprite) {
  const { img } = s
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  if (s.anim) Object.assign(s, { bx: 0, by: 0, bw: s.anim.w, bh: s.anim.h })
  else Object.assign(s, { bx: 0, by: 0, bw: c.width, bh: c.height })
  if (!s.anim) try {
    const d = g.getImageData(0, 0, c.width, c.height).data
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
    if (x1 >= 0) Object.assign(s, { bx: x0, by: y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 })
  } catch {
    // Tainted canvas: keep the full frame.
  }
  // White silhouette for hit flashes.
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  s.white = c
}

const ITEM_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'
export const itemUrl = (key: string) => `${ITEM_BASE}/${key}.png`
