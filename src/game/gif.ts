/**
 * Turns a Black/White animated GIF into sprite-sheet frames. Pure (no DOM), so
 * it runs in the sprite worker as well as on the main thread.
 */

export interface Frames {
  w: number
  h: number
  /** Fully composited RGBA frames of the whole canvas. */
  frames: Uint8ClampedArray[]
  /** Milliseconds per frame. */
  durs: number[]
}

/** A small GIF decoder: LZW, local/global palettes, transparency, interlacing and disposal. */
export function decodeGif(b: Uint8Array): Frames {
  let p = 0
  const u16 = () => b[p++] | (b[p++] << 8)
  if (String.fromCharCode(b[0], b[1], b[2]) !== 'GIF') throw new Error('not a gif')
  p = 6
  const W = u16(), H = u16()
  const flags = b[p++]
  p += 2
  let gct: Uint8Array | null = null
  if (flags & 0x80) {
    const n = 3 * (1 << ((flags & 7) + 1))
    gct = b.subarray(p, p + n)
    p += n
  }
  const screen = new Uint8ClampedArray(W * H * 4)
  const frames: Uint8ClampedArray[] = []
  const durs: number[] = []
  let delay = 100, trans = -1, disposal = 0
  const subBlocks = () => {
    const parts: Uint8Array[] = []
    let len = 0
    for (let n = b[p++]; n > 0; n = b[p++]) {
      parts.push(b.subarray(p, p + n))
      len += n
      p += n
    }
    const out = new Uint8Array(len)
    let o = 0
    for (const s of parts) {
      out.set(s, o)
      o += s.length
    }
    return out
  }
  while (p < b.length) {
    const tag = b[p++]
    if (tag === 0x3b) break
    if (tag === 0x21) {
      const label = b[p++]
      if (label === 0xf9) {
        p++ // block size (4)
        const f = b[p++]
        disposal = (f >> 2) & 7
        const d = u16() * 10
        delay = d < 20 ? 100 : d
        trans = f & 1 ? b[p] : -1
        p += 2 // transparent index + terminator
      } else subBlocks()
      continue
    }
    if (tag !== 0x2c) break
    const fx = u16(), fy = u16(), fw = u16(), fh = u16()
    const f = b[p++]
    let ct = gct
    if (f & 0x80) {
      const n = 3 * (1 << ((f & 7) + 1))
      ct = b.subarray(p, p + n)
      p += n
    }
    const interlaced = !!(f & 0x40)
    const minCode = b[p++]
    const idx = lzw(subBlocks(), minCode, fw * fh)
    const before = disposal === 3 ? screen.slice() : null
    // Rows in the order they were stored
    const rows: number[] = []
    if (interlaced) for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < fh; y += step) rows.push(y)
    else for (let y = 0; y < fh; y++) rows.push(y)
    if (ct)
      rows.forEach((y, r) => {
        const sy = fy + y
        if (sy >= H) return
        for (let x = 0; x < fw; x++) {
          const c = idx[r * fw + x]
          if (c === trans) continue
          const sx = fx + x
          if (sx >= W) continue
          const o = (sy * W + sx) * 4
          screen[o] = ct![c * 3]
          screen[o + 1] = ct![c * 3 + 1]
          screen[o + 2] = ct![c * 3 + 2]
          screen[o + 3] = 255
        }
      })
    frames.push(screen.slice())
    durs.push(delay)
    // What happens to this frame before the next one is drawn
    if (disposal === 2)
      for (let y = fy; y < Math.min(H, fy + fh); y++) screen.fill(0, (y * W + fx) * 4, (y * W + Math.min(W, fx + fw)) * 4)
    else if (disposal === 3 && before) screen.set(before)
    delay = 100
    trans = -1
    disposal = 0
  }
  return { w: W, h: H, frames, durs }
}

function lzw(data: Uint8Array, minCode: number, size: number): Uint8Array {
  const out = new Uint8Array(size)
  const clear = 1 << minCode, end = clear + 1
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096)
  const stack = new Uint8Array(4097)
  for (let i = 0; i < clear; i++) {
    prefix[i] = -1
    suffix[i] = i
    first[i] = i
  }
  let codeSize = minCode + 1, mask = (1 << codeSize) - 1, next = end + 1
  let prev = -1, bits = 0, acc = 0, o = 0, pos = 0
  while (o < size) {
    while (bits < codeSize) {
      if (pos >= data.length) return out
      acc |= data[pos++] << bits
      bits += 8
    }
    const code = acc & mask
    acc >>>= codeSize
    bits -= codeSize
    if (code === clear) {
      codeSize = minCode + 1
      mask = (1 << codeSize) - 1
      next = end + 1
      prev = -1
      continue
    }
    if (code === end) break
    let c = code, sp = 0
    if (prev === -1) {
      out[o++] = suffix[code]
      prev = code
      continue
    }
    if (code >= next) {
      // The code that's being defined right now: prev's string plus its own first byte
      stack[sp++] = first[prev]
      c = prev
    }
    while (c >= clear) {
      stack[sp++] = suffix[c]
      c = prefix[c]
    }
    stack[sp++] = c
    const head = c
    while (sp > 0 && o < size) out[o++] = stack[--sp]
    if (next < 4096) {
      prefix[next] = prev
      suffix[next] = head
      first[next] = first[prev]
      next++
      if (next > mask && codeSize < 12) {
        codeSize++
        mask = (1 << codeSize) - 1
      }
    }
    prev = code
  }
  return out
}

// ---------------------------------------------------------------- frames

/** Sheets get big with many frames: longer animations play every other frame. */
const MAX_FRAMES = 48

export interface Cells {
  /** Cell size: the box the whole animation moves in. */
  w: number
  h: number
  /** Every cell's RGBA, one after the other. */
  data: Uint8ClampedArray
  durs: number[]
}

/** Crop every frame to the box the animation moves in and drop repeats. */
export function toCells(a: Frames): Cells | null {
  if (!a.frames.length) return null
  const { w: W, h: H } = a
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (const f of a.frames)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (f[(y * W + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
  if (x1 < 0) return null
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  // Merge identical frames in a row
  let frames: Uint8ClampedArray[] = [a.frames[0]]
  let durs = [a.durs[0]]
  for (let i = 1; i < a.frames.length; i++) {
    const f = a.frames[i], last = frames[frames.length - 1]
    let same = true
    for (let k = 0; k < f.length; k++) if (f[k] !== last[k]) { same = false; break }
    if (same) durs[durs.length - 1] += a.durs[i]
    else {
      frames.push(f)
      durs.push(a.durs[i])
    }
  }
  // Too many frames: keep every other one (each lasting twice as long)
  while (frames.length > MAX_FRAMES) {
    frames = frames.filter((_, i) => i % 2 === 0)
    durs = durs.reduce<number[]>((acc, d, i) => (i % 2 === 0 ? acc.push(d) : (acc[acc.length - 1] += d), acc), [])
  }
  const data = new Uint8ClampedArray(frames.length * cw * ch * 4)
  frames.forEach((f, i) => {
    for (let y = 0; y < ch; y++) data.set(f.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + cw) * 4), (i * ch + y) * cw * 4)
  })
  return { w: cw, h: ch, data, durs }
}
