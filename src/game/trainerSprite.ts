import type { TrainerLook } from '../data/trainers'

/** One overworld frame is FW x FH native pixels. */
export const FW = 18
export const FH = 24

export type Dir = 'down' | 'up' | 'left' | 'right'
const ROW: Record<Exclude<Dir, 'right'>, number> = { down: 0, up: 1, left: 2 }
const OUTLINE = '#282830'
const EYE = '#202028'

/**
 * Draws a Black/White style overworld trainer procedurally: 3 directions x 3 frames
 * (stand, step A, step B). "right" is "left" mirrored at draw time.
 */
export function buildTrainerSheet(look: TrainerLook): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = FW * 3
  c.height = FH * 3
  const g = c.getContext('2d')!
  for (const dir of ['down', 'up', 'left'] as const) {
    for (let f = 0; f < 3; f++) {
      const ox = f * FW + 1
      const oy = ROW[dir] * FH + 1
      const px = (x: number, y: number, w: number, h: number, col: string) => {
        g.fillStyle = col
        g.fillRect(ox + x, oy + y, w, h)
      }
      drawFrame(px, look, dir, f)
    }
  }
  outline(g, c.width, c.height)
  return c
}

type Px = (x: number, y: number, w: number, h: number, col: string) => void

function drawFrame(px: Px, L: TrainerLook, dir: 'down' | 'up' | 'left', f: number) {
  const stepA = f === 1 ? 1 : 0
  const stepB = f === 2 ? 1 : 0
  if (dir === 'left') return drawSide(px, L, stepA, stepB)

  const back = dir === 'up'
  // Hair behind the body
  if (L.bigHair) px(0, 0, 16, 11, L.hair)
  if (L.longHair) px(2, 5, 12, back ? 9 : 8, L.hair)

  // Legs
  px(4, 15 - stepA, 3, 4, L.pants)
  px(9, 15 - stepB, 3, 4, L.pants)
  px(4, 19 - stepA, 3, 1, L.shoes)
  px(9, 19 - stepB, 3, 1, L.shoes)
  // Body
  px(3, 10, 10, 6, L.shirt)
  if (!back) {
    px(6, 10, 4, 1, L.shirtAccent)
    px(7, 11, 2, 4, L.shirtAccent)
  } else {
    px(4, 11, 8, 3, L.shirtAccent) // backpack
    px(5, 12, 6, 1, L.shirt)
  }
  // Arms swing opposite to legs
  px(2, 11 - stepB, 1, 4, L.shirt)
  px(13, 11 - stepA, 1, 4, L.shirt)
  px(2, 15 - stepB, 1, 1, L.skin)
  px(13, 15 - stepA, 1, 1, L.skin)
  // Head
  px(3, 3, 10, 7, L.skin)
  if (back) {
    px(3, 2, 10, 8, L.hair)
  } else {
    px(3, 2, 10, 3, L.hair)
    px(3, 5, 1, 3, L.hair)
    px(12, 5, 1, 3, L.hair)
    px(5, 6, 1, 2, EYE)
    px(10, 6, 1, 2, EYE)
    px(7, 8, 2, 1, '#e8a888')
  }
  // Hat
  if (L.hat) {
    px(3, 0, 10, 3, L.hat)
    if (L.hatBand) px(3, 3, 10, 1, L.hatBand)
    if (!back) px(2, 4, 12, 1, L.hat)
  }
}

function drawSide(px: Px, L: TrainerLook, stepA: number, stepB: number) {
  const fwd = stepA - stepB // -1, 0, 1
  if (L.bigHair) px(2, 0, 14, 11, L.hair)
  if (L.longHair) px(8, 5, 6, 8, L.hair)
  // Legs (front leg forward on step)
  px(6 - fwd, 15, 3, 4, L.pants)
  px(8 + fwd, 15, 3, 4, L.pants)
  px(5 - fwd, 19, 4, 1, L.shoes)
  px(8 + fwd, 19, 3, 1, L.shoes)
  // Body + backpack
  px(5, 10, 7, 6, L.shirt)
  px(11, 10, 3, 5, L.shirtAccent)
  px(5, 10, 2, 1, L.shirtAccent)
  // Arm
  px(7 + fwd, 11, 2, 4, L.shirt)
  px(7 + fwd, 15, 2, 1, L.skin)
  // Head
  px(4, 3, 9, 7, L.skin)
  px(5, 2, 8, 2, L.hair)
  px(9, 3, 4, 6, L.hair)
  px(5, 6, 1, 2, EYE)
  if (L.hat) {
    px(4, 0, 9, 3, L.hat)
    if (L.hatBand) px(4, 3, 9, 1, L.hatBand)
    px(2, 3, 4, 1, L.hat)
  }
}

function outline(g: CanvasRenderingContext2D, w: number, h: number) {
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0
  const add: number[] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) add.push(x, y)
  g.fillStyle = OUTLINE
  for (let i = 0; i < add.length; i += 2) g.fillRect(add[i], add[i + 1], 1, 1)
}

export function frameRect(dir: Dir, frame: number): { sx: number; sy: number; flip: boolean } {
  const row = dir === 'right' ? ROW.left : ROW[dir]
  return { sx: frame * FW, sy: row * FH, flip: dir === 'right' }
}
