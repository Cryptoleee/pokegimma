import type { Sprite } from './sprites'
import { decodeGif, toCells, type Cells } from './gif'

/**
 * Animated Black/White sprites for every Pokémon. The game draws a still PNG
 * until the animated GIF (front or back, shiny or not) has been fetched and
 * decoded into a sprite sheet; after that it plays the real animation.
 * Decoding happens in a worker, so a burst of new Pokémon never stalls a frame.
 */

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated'
/** Sprites being fetched at the same time. */
const PARALLEL = 3

const sheets = new Map<string, Sprite | null>()
const queue: { key: string; url: string }[] = []
let inFlight = 0
/** Jobs handed to the worker, to redo here if the worker dies. */
const sent = new Map<string, { key: string; url: string }>()

let worker: Worker | null = null
try {
  worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ key: string; cells: Cells | null }>) => done(e.data.key, e.data.cells)
  worker.onerror = () => {
    worker = null
    inFlight -= sent.size
    queue.unshift(...sent.values())
    sent.clear()
    pump()
  }
} catch {
  worker = null
}

/** The animated sheet for a Pokémon, or null while it loads (or if there is none). */
export function liveSprite(id: number, back: boolean, shiny: boolean): Sprite | null {
  if (id > 649) return null
  const key = `${back ? 'b' : 'f'}${shiny ? 's' : ''}${id}`
  const got = sheets.get(key)
  if (got !== undefined) return got
  sheets.set(key, null)
  queue.push({ key, url: `${BASE}/${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${id}.gif` })
  pump()
  return null
}

function pump() {
  while (inFlight < PARALLEL && queue.length) {
    const job = queue.shift()!
    inFlight++
    if (worker) {
      sent.set(job.key, job)
      worker.postMessage(job)
    } else
      // No worker: decode here (the still sprite stays if anything fails)
      fetch(job.url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => done(job.key, toCells(decodeGif(new Uint8Array(buf)))))
        .catch(() => done(job.key, null))
  }
}

function done(key: string, cells: Cells | null) {
  sent.delete(key)
  inFlight--
  if (cells) sheets.set(key, buildSheet(key, cells))
  pump()
}

/** Lays the frames out in a grid, plus a white silhouette for hit flashes. */
function buildSheet(key: string, c: Cells): Sprite {
  const { w, h, durs } = c
  const n = durs.length
  const cols = Math.ceil(Math.sqrt(n))
  const sheet = document.createElement('canvas')
  sheet.width = cols * w
  sheet.height = Math.ceil(n / cols) * h
  const g = sheet.getContext('2d')!
  const size = w * h * 4
  for (let i = 0; i < n; i++) g.putImageData(new ImageData(c.data.slice(i * size, (i + 1) * size), w, h), (i % cols) * w, Math.floor(i / cols) * h)
  const white = document.createElement('canvas')
  white.width = sheet.width
  white.height = sheet.height
  const wg = white.getContext('2d')!
  wg.drawImage(sheet, 0, 0)
  wg.globalCompositeOperation = 'source-in'
  wg.fillStyle = '#ffffff'
  wg.fillRect(0, 0, white.width, white.height)
  let t = 0
  const ends = durs.map((d) => (t += d))
  return { img: sheet, key: `anim:${key}`, bx: 0, by: 0, bw: w, bh: h, white, ready: true, anim: { w, h, cols, durs, ends, total: t } }
}
