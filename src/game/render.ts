import { TYPE_COLOR } from '../data/types'
import type { Game } from './game'
import { INTRO_TIME, ITEM_SPRITE } from './game'
import type { Mon, Trainer } from './entities'
import { getSprite, itemUrl, monSprite } from './sprites'
import { trainerSpriteUrl } from '../data/trainers'
import { drawCharge, drawDashAura, drawIncoming, drawMelee, drawProjectile } from './moveFx'
import { drawGlow } from './vfx'
import { T, TILE } from './world'

const FONT = '"Pixelify Sans", monospace'

export function zoomFor(cw: number, ch: number) {
  return Math.max(2, Math.min(6, Math.min(cw, ch) / (TILE * 11.5)))
}

export function render(g: Game, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  // Drop-in: start high above the arena and swoop down to the player
  const ik = Math.max(0, g.introT / INTRO_TIME)
  const Z = zoomFor(cw, ch) * (1 - 0.62 * ik * ik * (3 - 2 * ik))
  const vw = cw / Z, vh = ch / Z
  let ox = g.camX * TILE - vw / 2
  let oy = g.camY * TILE - vh / 2
  if (g.vfx.shake > 0) {
    ox += (Math.random() - 0.5) * g.vfx.shake
    oy += (Math.random() - 0.5) * g.vfx.shake
  }
  ox = Math.round(ox * Z) / Z
  oy = Math.round(oy * Z) / Z
  const time = g.time

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#1c4a28'
  ctx.fillRect(0, 0, cw, ch)
  ctx.setTransform(Z, 0, 0, Z, -ox * Z, -oy * Z)

  // Ground
  const sx = Math.max(0, Math.floor(ox) - 1), sy = Math.max(0, Math.floor(oy) - 1)
  const sw = Math.min(g.world.ground.width - sx, Math.ceil(vw) + 3)
  const sh = Math.min(g.world.ground.height - sy, Math.ceil(vh) + 3)
  ctx.drawImage(g.world.ground, sx, sy, sw, sh, sx, sy, sw, sh)

  const inView = (x: number, y: number, m = 3) =>
    x * TILE > ox - m * TILE && x * TILE < ox + vw + m * TILE && y * TILE > oy - m * TILE && y * TILE < oy + vh + m * TILE

  // Ground marks (scorch, frost, craters) under everything else
  drawWater(g, ctx, ox, oy, vw, vh, time)
  g.vfx.drawDecals(ctx)
  g.vfx.drawUnder(ctx)
  drawItems(g, ctx, inView)

  // Entities, y-sorted
  type Ent = { y: number; draw: () => void }
  const ents: Ent[] = []
  for (const tr of g.trainers) {
    if (tr.alive && inView(tr.x, tr.y)) ents.push({ y: tr.y, draw: () => drawTrainer(g, ctx, tr, time) })
    const m = tr.mon
    if (tr.isPlayer && !g.partnerOut) continue
    if (tr.alive && m && !m.fainted && inView(m.x, m.y)) ents.push({ y: m.y, draw: () => drawMon(g, ctx, m, time) })
  }
  for (const w of g.wilds) if (inView(w.x, w.y)) ents.push({ y: w.y, draw: () => drawMon(g, ctx, w, time) })
  ents.sort((a, b) => a.y - b.y)
  for (const e of ents) e.draw()

  // Canopies and roofs
  ctx.drawImage(g.world.overlay, sx, sy, sw, sh, sx, sy, sw, sh)

  // Ultimates dim the world so the effect pops (like BW's battle backdrop fade)
  g.vfx.drawDim(ctx, ox - 4, oy - 4, vw + 8, vh + 8)

  // Telegraphs (and meteors on their way down)
  for (const n of g.novas)
    drawIncoming(ctx, n.move.fx, n.x * TILE, n.y * TILE, n.r * TILE, 1 - n.t / n.total, TYPE_COLOR[n.move.type], time, n.sx * TILE, n.sy * TILE)

  // Projectiles
  for (const p of g.projs)
    if (inView(p.x, p.y)) drawProjectile(ctx, p.move.fx, p.x * TILE, p.y * TILE, p.vx, p.vy, time, p.seed)

  g.vfx.draw(ctx, time)
  drawFx(g, ctx)
  for (const tr of g.trainers) if (tr.throwFx) drawThrow(ctx, tr.throwFx)

  // Cloud shadows drift across the land
  drawClouds(ctx, ox, oy, vw, vh, time)

  // Storm: tinted, rain-swept outside, a crackling energy wall on the edge
  drawStorm(g, ctx, ox, oy, vw, vh, time)

  // Ambient pollen
  drawMotes(ctx, ox, oy, vw, vh, time)

  // Overhead bars and labels on top of everything
  for (const tr of g.trainers) {
    if (!tr.alive || !inView(tr.x, tr.y)) continue
    const top = tr.y * TILE - trainerHeight(tr) - 2
    if (!tr.isPlayer) label(ctx, tr.name.split(' ').pop()!, tr.x * TILE, top, '#ffffff')
    else {
      const b = Math.sin(time * 6) * 1.5
      ctx.fillStyle = '#f84040'
      ctx.strokeStyle = '#282830'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(tr.x * TILE - 3, top - 5 + b)
      ctx.lineTo(tr.x * TILE + 3, top - 5 + b)
      ctx.lineTo(tr.x * TILE, top - 1 + b)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    const m = tr.mon
    if (!m.fainted && !tr.isPlayer) monBar(ctx, m)
  }
  for (const w of g.wilds) {
    if (!inView(w.x, w.y)) continue
    if (w.state === 'aggro' || w.hp < w.maxHp || w.rarity !== 'common') monBar(ctx, w)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // Cinematic vignette
  ctx.drawImage(vignette(), 0, 0, cw, ch)
  if (g.vfx.screenFlash > 0) {
    ctx.fillStyle = `rgba(${g.vfx.screenFlashCol},${Math.min(0.75, g.vfx.screenFlash * 0.6)})`
    ctx.fillRect(0, 0, cw, ch)
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(x, y, w / 2, w / 5, 0, 0, Math.PI * 2)
  ctx.fill()
}

function grassOver(g: Game, ctx: CanvasRenderingContext2D, x: number, y: number) {
  const tx = Math.floor(x), ty = Math.floor(y)
  for (let dx = -1; dx <= 1; dx++)
    if (g.world.isTall(tx + dx + 0.5, ty + 0.5))
      ctx.drawImage(g.world.ground, (tx + dx) * TILE, ty * TILE + 8, TILE, 8, (tx + dx) * TILE, ty * TILE + 8, TILE, 8)
}

const TRAINER_SCALE = 0.42

function trainerHeight(tr: Trainer) {
  const s = getSprite(trainerSpriteUrl(tr.def.sprite))
  return s.ready ? s.bh * TRAINER_SCALE : 28
}

function drawTrainer(g: Game, ctx: CanvasRenderingContext2D, tr: Trainer, _time: number) {
  const s = getSprite(trainerSpriteUrl(tr.def.sprite))
  const px = tr.x * TILE, py = tr.y * TILE
  shadow(ctx, px, py + 1, 13)
  if (!s.ready) return
  const dw = s.bw * TRAINER_SCALE, dh = s.bh * TRAINER_SCALE
  // Walk cycle: a little hop and sway, like BW overworld bobbing.
  const step = tr.walkT > 0 ? tr.walkT * 0.9 : 0
  const hop = tr.walkT > 0 ? -Math.abs(Math.sin(step)) * 1.8 : 0
  const sway = tr.walkT > 0 ? Math.sin(step) * 0.07 : 0
  ctx.save()
  ctx.translate(Math.round(px), Math.round(py + hop))
  ctx.rotate(sway)
  if (tr.faceRight) ctx.scale(-1, 1)
  ctx.drawImage(s.img, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh + 1, dw, dh)
  ctx.restore()
  grassOver(g, ctx, tr.x, tr.y)
}

function drawMon(g: Game, ctx: CanvasRenderingContext2D, m: Mon, time: number) {
  const back = m.dir === 'up'
  const s = monSprite(m.species.id, back, m.shiny)
  const px = m.x * TILE, py = m.y * TILE
  const sc = m.scale
  const dw = s.bw * sc, dh = s.bh * sc
  const moving = Math.abs(m.mvx) + Math.abs(m.mvy) > 0.001
  let bob = Math.sin(time * (moving ? 12 : 3) + m.bob) * (moving ? 1.2 : 0.6)
  if (m.state === 'weak') bob = 0

  // Legendary aura
  if (m.legendary && !m.owner) {
    ctx.globalAlpha = 0.35 + Math.sin(time * 4) * 0.15
    ctx.fillStyle = '#ffd040'
    ctx.beginPath()
    ctx.ellipse(px, py, dw * 0.55, dw * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  shadow(ctx, px, py + 1, Math.max(10, dw * 0.55))

  if (!s.ready) {
    ctx.fillStyle = '#f04040'
    circle(ctx, px, py - 6, 5)
    ctx.fill()
    return
  }

  if (m.dash) drawDashAura(ctx, m.dash.move.fx, px, py - dh * 0.45, m.dash.vx, m.dash.vy, time)
  if (m.charging) drawCharge(ctx, m.charging.move.fx, px, py - dh * 0.5, 1 - m.charging.t / m.charging.total, time)
  const lunge = m.castT > 0 ? Math.sin((m.castT / 0.18) * Math.PI) * 3 : 0
  let alpha = 1
  if (m.state === 'weak' && m.weakT < 3) alpha = Math.sin(time * 20) > 0 ? 1 : 0.35
  if (m.catching) alpha = 0.5
  ctx.globalAlpha = alpha
  const flip = back ? m.dir === 'left' : m.dir === 'right'
  ctx.save()
  const jolt = m.joltT > 0 ? (Math.random() - 0.5) * 3 : 0
  const lift = m.liftT > 0 ? -Math.sin(Math.min(1, m.liftT / 0.5) * Math.PI) * 6 : 0
  ctx.translate(Math.round(px + m.aimX * lunge + jolt), Math.round(py + bob + m.aimY * lunge + lift))
  if (flip) ctx.scale(-1, 1)
  if (m.state === 'weak') ctx.rotate(0.25)
  if (m.castT > 0) ctx.scale(1 + lunge * 0.02, 1 - lunge * 0.02)
  ctx.drawImage(s.img, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
  const glow = Math.max(
    m.flash > 0 ? 0.85 : 0,
    m.evolveFx > 0 ? 0.5 + 0.5 * Math.sin(time * 18) : 0,
    m.catching ? 0.6 : 0,
    m.charging ? 0.25 + 0.25 * Math.sin(time * 30) : 0,
  )
  if (glow > 0 && s.white) {
    ctx.globalAlpha = glow * alpha
    ctx.drawImage(s.white, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
  }
  // Type-coloured tint after a hit (yellow crackle for electric, orange for fire, ...)
  if (m.tintT > 0 && m.flash <= 0) {
    const t = tinted(s, m.tintCol)
    if (t) {
      ctx.globalAlpha = alpha * Math.min(1, m.tintT / 0.35) * (0.45 + Math.random() * 0.25)
      ctx.drawImage(t, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
    }
  }
  ctx.restore()
  ctx.globalAlpha = 1
  if (!m.legendary) grassOver(g, ctx, m.x, m.y)

  if (m.state === 'weak') {
    // Dizzy stars
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + (i * Math.PI * 2) / 3
      ctx.fillStyle = '#ffe040'
      ctx.fillRect(px + Math.cos(a) * 8 - 1, py - dh - 2 + Math.sin(a) * 3, 2, 2)
    }
    if (!m.catching) label(ctx, 'VANG!', px, py - dh - 8, '#ffe040')
  }
  if (m.shiny) {
    const a = time * 3
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(px + Math.cos(a) * dw * 0.4, py - dh / 2 + Math.sin(a * 1.3) * dh * 0.3, 1.5, 1.5)
  }
}

const tintCache = new Map<string, HTMLCanvasElement>()

/** The sprite's silhouette filled with a colour (cached per sprite + colour). */
function tinted(s: ReturnType<typeof monSprite>, col: string): HTMLCanvasElement | null {
  if (!s.white) return null
  const key = s.img.src + col
  let c = tintCache.get(key)
  if (!c) {
    if (tintCache.size > 400) tintCache.clear()
    c = document.createElement('canvas')
    c.width = s.white.width
    c.height = s.white.height
    const g = c.getContext('2d')!
    g.drawImage(s.white, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = col
    g.fillRect(0, 0, c.width, c.height)
    tintCache.set(key, c)
  }
  return c
}

function monBar(ctx: CanvasRenderingContext2D, m: Mon) {
  const s = monSprite(m.species.id, m.dir === 'up', m.shiny)
  const dh = s.ready ? s.bh * m.scale : 16
  const x = m.x * TILE, y = m.y * TILE - dh - 4
  const w = m.legendary ? 26 : 18
  const k = Math.max(0, m.hp / m.maxHp)
  ctx.fillStyle = '#282830'
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4)
  ctx.fillStyle = '#505058'
  ctx.fillRect(x - w / 2, y, w, 2)
  ctx.fillStyle = k > 0.5 ? '#40d860' : k > 0.2 ? '#f8c020' : '#f84030'
  ctx.fillRect(x - w / 2, y, w * k, 2)
  const col = m.legendary ? '#ffd040' : m.rarity === 'rare' ? '#80c0ff' : m.rarity === 'uncommon' ? '#90f090' : '#ffffff'
  label(ctx, `${m.shiny ? '✦' : ''}Lv${m.level}`, x, y - 2, col)
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, col: string) {
  ctx.font = `600 6px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = 2
  ctx.strokeStyle = '#282830'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = col
  ctx.fillText(text, x, y)
}

function drawItems(g: Game, ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
  for (const it of g.items) {
    if (!inView(it.x, it.y)) continue
    const s = getSprite(itemUrl(ITEM_SPRITE[it.kind]))
    const px = it.x * TILE, py = it.y * TILE
    const b = Math.sin(it.bob * 3) * 1.5
    shadow(ctx, px, py + 2, 8)
    if (it.kind === 'master') {
      ctx.globalAlpha = 0.3 + Math.sin(it.bob * 4) * 0.15
      ctx.fillStyle = '#c070ff'
      circle(ctx, px, py - 3, 8)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    if (s.ready) ctx.drawImage(s.img, s.bx, s.by, s.bw, s.bh, px - s.bw / 2, py - s.bh - 1 + b, s.bw, s.bh)
    if (Math.sin(it.bob * 2.3) > 0.9) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(px + 4, py - 12 + b, 2, 2)
    }
  }
}

function drawFx(g: Game, ctx: CanvasRenderingContext2D) {
  for (const f of g.fx) {
    const k = f.t / f.life
    const px = f.x * TILE, py = f.y * TILE
    ctx.globalAlpha = 1 - k
    switch (f.kind) {
      case 'melee':
        drawMelee(ctx, f.style!, px, py, f.x2!, f.y2!, k)
        break
      case 'callout': {
        ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
        ctx.font = `700 ${f.big ? 8.5 : 6.5}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        const ty = py - Math.min(1, k * 6) * 4
        const w = ctx.measureText(f.text!).width + 6
        const bh = f.big ? 12.5 : 10
        if (f.big) drawGlow(ctx, px, ty - bh / 2, w * 0.7, f.color.length === 7 ? f.color : '#ffffff', 0.5 * (1 - k))
        ctx.fillStyle = 'rgba(248,248,248,0.95)'
        ctx.strokeStyle = '#282830'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(px - w / 2, ty - bh + 1, w, bh, 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = f.color
        ctx.fillRect(px - w / 2 + 1, ty - 2, w - 2, 1.5)
        ctx.fillStyle = '#282830'
        ctx.fillText(f.text!, px, ty - 1.5)
        break
      }
      case 'text': {
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
        const pop = 1 + Math.max(0, 0.6 - k * 4)
        ctx.font = `700 ${(f.big ? 10 : 7.5) * pop}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 2.5
        ctx.strokeStyle = '#282830'
        const ty = py - k * 10
        ctx.strokeText(f.text!, px, ty)
        ctx.fillStyle = f.color
        ctx.fillText(f.text!, px, ty)
        break
      }
      case 'spark':
        ctx.fillStyle = f.color
        ctx.fillRect(px - 1, py - 1, 2.5, 2.5)
        break
      case 'poof':
        ctx.strokeStyle = f.color
        ctx.lineWidth = 1.5
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + k
          circle(ctx, px + Math.cos(a) * 5 * k, py + Math.sin(a) * 5 * k, (f.r ?? 1) * 4 * (1 - k * 0.5))
          ctx.stroke()
        }
        break
      case 'heal':
        ctx.fillStyle = f.color
        for (let i = 0; i < 4; i++) {
          const hx = px + Math.sin(i * 2.1) * 8, hy = py - k * 14 - i * 3
          ctx.fillRect(hx - 2, hy - 0.5, 4, 1.5)
          ctx.fillRect(hx - 0.75, hy - 2, 1.5, 4)
        }
        break
    }
    ctx.globalAlpha = 1
  }
}

function drawThrow(ctx: CanvasRenderingContext2D, t: NonNullable<Trainer['throwFx']>) {
  const fly = Math.min(1, t.t / 0.45)
  const x = (t.x + (t.tx - t.x) * fly) * TILE
  const arc = Math.sin(fly * Math.PI) * 18
  let y = (t.y + (t.ty - t.y) * fly) * TILE - arc
  let rot = fly * 12
  if (fly >= 1) {
    rot = Math.sin(t.t * 25) * 0.5
    y += 6
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.fillStyle = '#282830'
  circle(ctx, 0, 0, 4.5)
  ctx.fill()
  ctx.fillStyle = t.master ? '#8848c8' : '#e83838'
  ctx.beginPath()
  ctx.arc(0, 0, 3.7, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#f8f8f8'
  ctx.beginPath()
  ctx.arc(0, 0, 3.7, 0, Math.PI)
  ctx.fill()
  ctx.fillStyle = '#282830'
  ctx.fillRect(-3.7, -0.5, 7.4, 1)
  ctx.fillStyle = '#f8f8f8'
  circle(ctx, 0, 0, 1.2)
  ctx.fill()
  ctx.restore()
}


// ---------------- Ambience ----------------

let vigCanvas: HTMLCanvasElement | null = null
function vignette() {
  if (vigCanvas) return vigCanvas
  vigCanvas = document.createElement('canvas')
  vigCanvas.width = vigCanvas.height = 256
  const g = vigCanvas.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 70, 128, 128, 182)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(8,10,30,0.42)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return vigCanvas
}

let cloudCanvas: HTMLCanvasElement | null = null
function cloudSprite() {
  if (cloudCanvas) return cloudCanvas
  cloudCanvas = document.createElement('canvas')
  cloudCanvas.width = cloudCanvas.height = 128
  const g = cloudCanvas.getContext('2d')!
  const blobs = [[64, 64, 44], [36, 70, 30], [92, 72, 32], [60, 44, 30], [84, 52, 26]]
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(20,30,60,0.55)')
    grad.addColorStop(1, 'rgba(20,30,60,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  return cloudCanvas
}

function drawClouds(ctx: CanvasRenderingContext2D, ox: number, oy: number, vw: number, vh: number, time: number) {
  const span = 128 * TILE
  const c = cloudSprite()
  ctx.globalAlpha = 0.22
  for (let i = 0; i < 14; i++) {
    const size = (10 + (i % 4) * 4) * TILE
    const x = (((i * 977) % 128) * TILE + time * (10 + (i % 3) * 4)) % span
    const y = (((i * 613) % 128) * TILE + time * 4) % span
    if (x + size < ox || x - size > ox + vw || y + size < oy || y - size > oy + vh) continue
    ctx.drawImage(c, x - size, y - size * 0.7, size * 2, size * 1.4)
  }
  ctx.globalAlpha = 1
}

function drawWater(g: Game, ctx: CanvasRenderingContext2D, ox: number, oy: number, vw: number, vh: number, time: number) {
  const tx0 = Math.max(0, Math.floor(ox / TILE)), ty0 = Math.max(0, Math.floor(oy / TILE))
  const tx1 = Math.min(127, Math.ceil((ox + vw) / TILE)), ty1 = Math.min(127, Math.ceil((oy + vh) / TILE))
  if ((tx1 - tx0) * (ty1 - ty0) > 9000) return
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      if (g.world.at(tx, ty) !== T.WATER) continue
      const seed = (tx * 73856093) ^ (ty * 19349663)
      const ph = (seed & 1023) / 163
      const k = Math.sin(time * 1.6 + ph)
      // Rolling wave line
      const wy = ty * TILE + 4 + ((time * 6 + ph * 3) % 10)
      ctx.fillStyle = 'rgba(200,228,255,0.45)'
      ctx.fillRect(tx * TILE + 2 + Math.sin(time * 2 + ph) * 2, wy, 6, 1)
      // Sparkle
      if (k > 0.86) {
        const sx = tx * TILE + (seed & 15), sy = ty * TILE + ((seed >> 4) & 15)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(sx - 1, sy, 3, 1)
        ctx.fillRect(sx, sy - 1, 1, 3)
      }
    }
}

const motes: { x: number; y: number; s: number; ph: number }[] = []
function drawMotes(ctx: CanvasRenderingContext2D, ox: number, oy: number, vw: number, vh: number, time: number) {
  while (motes.length < 26) motes.push({ x: ox + Math.random() * vw, y: oy + Math.random() * vh, s: 0.6 + Math.random(), ph: Math.random() * 6 })
  ctx.fillStyle = 'rgba(255,250,210,0.75)'
  for (const m of motes) {
    m.x += Math.sin(time * 0.7 + m.ph) * 0.15 + 0.12
    m.y += Math.cos(time * 0.5 + m.ph) * 0.1 - 0.05
    if (m.x < ox - 10 || m.x > ox + vw + 10 || m.y < oy - 10 || m.y > oy + vh + 10) {
      m.x = ox + Math.random() * vw
      m.y = oy + Math.random() * vh
    }
    const a = 0.4 + 0.4 * Math.sin(time * 2 + m.ph)
    ctx.globalAlpha = a
    ctx.fillRect(m.x, m.y, m.s, m.s)
  }
  ctx.globalAlpha = 1
}

let stormBolt = { t: 0, a: 0, seedT: 0 }
function drawStorm(g: Game, ctx: CanvasRenderingContext2D, ox: number, oy: number, vw: number, vh: number, time: number) {
  const z = g.zone
  const cx = z.x * TILE, cy = z.y * TILE, r = Math.max(0.01, z.r * TILE)
  // Is any of the storm visible?
  const camX = ox + vw / 2, camY = oy + vh / 2
  const dCam = Math.hypot(camX - cx, camY - cy)
  const stormVisible = dCam + Math.hypot(vw, vh) / 2 > r
  if (stormVisible) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox - 2, oy - 2, vw + 4, vh + 4)
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true)
    ctx.clip('evenodd')
    ctx.fillStyle = 'rgba(80, 30, 150, 0.4)'
    ctx.fillRect(ox - 2, oy - 2, vw + 4, vh + 4)
    // Slanted rain
    ctx.strokeStyle = 'rgba(220, 200, 255, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 70; i++) {
      const x = ox + ((i * 53.7 + time * 220) % (vw + 40)) - 20
      const y = oy + ((i * 91.3 + time * 380) % (vh + 40)) - 20
      ctx.moveTo(x, y)
      ctx.lineTo(x - 4, y + 12)
    }
    ctx.stroke()
    ctx.restore()

    // Energy wall
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = 'rgba(170, 90, 255, 0.35)'
    ctx.lineWidth = 9
    circle(ctx, cx, cy, r)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(220, 170, 255, 0.8)'
    ctx.lineWidth = 2.5
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = -time * 40
    circle(ctx, cx, cy, r)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    circle(ctx, cx, cy, r)
    ctx.stroke()
    ctx.restore()

    // Lightning crawling on the wall near the camera
    stormBolt.t -= 1 / 60
    if (stormBolt.t <= 0 && Math.random() < 0.04) {
      stormBolt = { t: 0.18, a: Math.atan2(camY - cy, camX - cx) + (Math.random() - 0.5) * (vw / Math.max(r, 1)), seedT: time }
    }
    if (stormBolt.t > 0) {
      const a = stormBolt.a
      const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r
      const x2 = cx + Math.cos(a) * (r + 40), y2 = cy + Math.sin(a) * (r + 40) - 30
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = '#e8d0ff'
      ctx.lineWidth = 2
      ctx.shadowColor = '#a060ff'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      for (let i = 1; i <= 5; i++) ctx.lineTo(x1 + (x2 - x1) * (i / 5) + (Math.random() - 0.5) * 12, y1 + (y2 - y1) * (i / 5) + (Math.random() - 0.5) * 12)
      ctx.stroke()
      ctx.restore()
    }
  }
  if (z.phase < 6 && z.nr > 0) {
    // Next safe zone: soft white ring with marching dashes
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = time * 20
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1.5
    circle(ctx, z.nx * TILE, z.ny * TILE, z.nr * TILE)
    ctx.stroke()
    ctx.setLineDash([])
  }
}
