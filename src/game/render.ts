import { TYPE_COLOR } from '../data/types'
import type { Game } from './game'
import { ITEM_SPRITE } from './game'
import type { Mon, Trainer } from './entities'
import { getSprite, itemUrl, monSprite } from './sprites'
import { FH, FW, frameRect } from './trainerSprite'
import { TILE } from './world'

const FONT = '"Pixelify Sans", monospace'

export function zoomFor(cw: number, ch: number) {
  return Math.max(2, Math.min(6, Math.min(cw, ch) / (TILE * 11.5)))
}

export function render(g: Game, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  const Z = zoomFor(cw, ch)
  const vw = cw / Z, vh = ch / Z
  let ox = g.camX * TILE - vw / 2
  let oy = g.camY * TILE - vh / 2
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

  // Water shimmer
  drawItems(g, ctx, inView)

  // Entities, y-sorted
  type Ent = { y: number; draw: () => void }
  const ents: Ent[] = []
  for (const tr of g.trainers) {
    if (tr.alive && inView(tr.x, tr.y)) ents.push({ y: tr.y, draw: () => drawTrainer(g, ctx, tr, time) })
    const m = tr.mon
    if (tr.alive && m && !m.fainted && inView(m.x, m.y)) ents.push({ y: m.y, draw: () => drawMon(g, ctx, m, time) })
  }
  for (const w of g.wilds) if (inView(w.x, w.y)) ents.push({ y: w.y, draw: () => drawMon(g, ctx, w, time) })
  ents.sort((a, b) => a.y - b.y)
  for (const e of ents) e.draw()

  // Canopies and roofs
  ctx.drawImage(g.world.overlay, sx, sy, sw, sh, sx, sy, sw, sh)

  // Telegraphs
  for (const n of g.novas) {
    const k = 1 - n.t / 0.6
    const col = TYPE_COLOR[n.move.type]
    ctx.globalAlpha = 0.25 + k * 0.35
    ctx.fillStyle = col
    circle(ctx, n.x * TILE, n.y * TILE, n.r * TILE * (0.3 + 0.7 * k))
    ctx.fill()
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = col
    ctx.lineWidth = 1.5
    circle(ctx, n.x * TILE, n.y * TILE, n.r * TILE)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Projectiles
  for (const p of g.projs) {
    if (!inView(p.x, p.y)) continue
    const col = TYPE_COLOR[p.move.type]
    const px = p.x * TILE, py = p.y * TILE
    ctx.globalAlpha = 0.45
    ctx.fillStyle = col
    circle(ctx, px - p.vx * 0.9, py - p.vy * 0.9, 2.4)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#282830'
    circle(ctx, px, py, 4)
    ctx.fill()
    ctx.fillStyle = col
    circle(ctx, px, py, 3.2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    circle(ctx, px - 0.8, py - 0.8, 1.3)
    ctx.fill()
  }

  drawFx(g, ctx)
  for (const tr of g.trainers) if (tr.throwFx) drawThrow(ctx, tr.throwFx)

  // Storm
  const z = g.zone
  ctx.fillStyle = 'rgba(110, 50, 190, 0.34)'
  ctx.beginPath()
  ctx.rect(ox - 2, oy - 2, vw + 4, vh + 4)
  ctx.arc(z.x * TILE, z.y * TILE, Math.max(0.01, z.r * TILE), 0, Math.PI * 2, true)
  ctx.fill('evenodd')
  ctx.strokeStyle = '#d8a0ff'
  ctx.lineWidth = 2
  circle(ctx, z.x * TILE, z.y * TILE, Math.max(0.01, z.r * TILE))
  ctx.stroke()
  if (z.phase < 6 && z.nr > 0) {
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 1
    circle(ctx, z.nx * TILE, z.ny * TILE, z.nr * TILE)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Overhead bars and labels on top of everything
  for (const tr of g.trainers) {
    if (!tr.alive || !inView(tr.x, tr.y)) continue
    if (!tr.isPlayer) label(ctx, tr.name.split(' ').pop()!, tr.x * TILE, tr.y * TILE - 26, '#ffffff')
    else {
      const b = Math.sin(time * 6) * 1.5
      ctx.fillStyle = '#f84040'
      ctx.strokeStyle = '#282830'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(tr.x * TILE - 3, tr.y * TILE - 30 + b)
      ctx.lineTo(tr.x * TILE + 3, tr.y * TILE - 30 + b)
      ctx.lineTo(tr.x * TILE, tr.y * TILE - 26 + b)
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

function drawTrainer(g: Game, ctx: CanvasRenderingContext2D, tr: Trainer, _time: number) {
  const moving = tr.walkT > 0
  const frame = moving ? [1, 0, 2, 0][Math.floor(tr.walkT) % 4] : 0
  const { sx, sy, flip } = frameRect(tr.dir, frame)
  const px = tr.x * TILE, py = tr.y * TILE
  shadow(ctx, px, py + 1, 11)
  ctx.save()
  ctx.translate(Math.round(px), Math.round(py))
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(tr.sheet, sx, sy, FW, FH, -9, -21, FW, FH)
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

  let alpha = 1
  if (m.state === 'weak' && m.weakT < 3) alpha = Math.sin(time * 20) > 0 ? 1 : 0.35
  if (m.catching) alpha = 0.5
  ctx.globalAlpha = alpha
  const flip = back ? m.dir === 'left' : m.dir === 'right'
  ctx.save()
  ctx.translate(Math.round(px), Math.round(py + bob))
  if (flip) ctx.scale(-1, 1)
  if (m.state === 'weak') ctx.rotate(0.25)
  ctx.drawImage(s.img, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
  const glow = Math.max(m.flash > 0 ? 0.85 : 0, m.evolveFx > 0 ? 0.5 + 0.5 * Math.sin(time * 18) : 0, m.catching ? 0.6 : 0)
  if (glow > 0 && s.white) {
    ctx.globalAlpha = glow * alpha
    ctx.drawImage(s.white, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
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
      case 'ring':
        ctx.strokeStyle = f.color
        ctx.lineWidth = 3
        circle(ctx, px, py, (f.r ?? 1) * TILE * (0.3 + 0.7 * k))
        ctx.stroke()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.stroke()
        break
      case 'beam': {
        const w = (f.big ? 9 : 6) * (1 - k * 0.7)
        ctx.lineCap = 'round'
        ctx.strokeStyle = f.color
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(f.x2! * TILE, f.y2! * TILE)
        ctx.stroke()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = w * 0.35
        ctx.stroke()
        ctx.lineCap = 'butt'
        break
      }
      case 'swipe': {
        const a = Math.atan2(f.y2!, f.x2!)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3 * (1 - k)
        ctx.beginPath()
        ctx.arc(px - f.x2! * 8, py - f.y2! * 8, 14, a - 1 + k * 0.6, a + 1 + k * 0.6)
        ctx.stroke()
        ctx.strokeStyle = f.color
        ctx.lineWidth = 1.5
        ctx.stroke()
        break
      }
      case 'text': {
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
        ctx.font = `700 ${f.big ? 9 : 7}px ${FONT}`
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
