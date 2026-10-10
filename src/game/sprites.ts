import { spriteUrl } from '../data/pokemon'

export interface Sprite {
  img: HTMLImageElement
  /** Tight bounding box of opaque pixels. */
  bx: number
  by: number
  bw: number
  bh: number
  white?: HTMLCanvasElement
  ready: boolean
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
  img.crossOrigin = 'anonymous'
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
  try {
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
