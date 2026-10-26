import { eliteColor } from '../data/moves'
import { TYPE_COLOR } from '../data/types'
import type { Game } from './game'
import { BUSH_SIGHT, INTRO_TIME, ITEM_SPRITE } from './game'
import type { Mon, Trainer } from './entities'
import { animSprite, frameAt, getSprite, itemUrl, monSprite } from './sprites'
import { liveSprite } from './monAnim'
import { trainerSpriteUrl } from '../data/trainers'
import { drawCharge, drawChargeCore, drawDashAura, drawIncoming, drawMelee, drawProjectile, pal } from './moveFx'
import { drawGlow } from './vfx'
import { ARENA_C, SKIN, standCell, standPerson, T, TILE } from './world'
import { FLOWER_FRAMES, hash, TALL_FRAMES, TALL_TOP, tileArt, WATER_FRAMES } from './tiles'
import type { Weather } from '../data/themes'
import { drawEvents } from './events'
import { drawHazards, drawHazardsSky } from './boss'
import { drawBrazier, drawGate, drawWell, gateShown, wellOn } from './dungeon'
import { drawAnimProp, drawEyes, drawLavaEmbers, drawLavaLayer, propLights, coldLook, dungeonLook } from './dungeonArt'
import { L, tx } from '../i18n'
import { BOSSES } from '../data/bosses'
import { cinematic, drawPhaseScreen, phaseLook, shownPhase, updateCinematic } from './bossFx'
import { ENRAGE_TIME } from './boss'
import { badgeOf, WISP } from '../data/support'
import type { SupportTier } from '../../api/_progress'

const FONT = '"Pixelify Sans", monospace'

/** Pixels per world pixel: ~11.5 tiles across the short side, ~16.5 in a raid to see the arena. */
export function zoomFor(cw: number, ch: number, wide = false) {
  return Math.max(2, Math.min(6, Math.min(cw, ch) / (TILE * (wide ? 16.5 : 11.5))))
}

/** Last frame's camera, so input can map screen pixels to world tiles. */
export const view = { ox: 0, oy: 0, Z: 1 }

export function render(g: Game, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  if (cur !== g) bubbles.clear()
  cur = g
  if (g.kind === 'raid') updateCinematic(g)
  // Drop-in: start high above the arena and swoop down to the player
  const ik = Math.max(0, g.introT / INTRO_TIME)
  // Raid phase change: the camera swings over to the boss and leans in
  const cine = g.kind === 'raid' ? cinematic(g) : -1
  const boss = cine >= 0 ? g.wilds.find((w) => w.boss) : undefined
  const focus = boss ? Math.sin(Math.min(1, cine / 0.92) * Math.PI) * 0.8 : 0
  const Z = zoomFor(cw, ch, g.kind === 'raid') * (1 - 0.62 * ik * ik * (3 - 2 * ik)) * (1 + 0.18 * focus)
  const vw = cw / Z, vh = ch / Z
  let ox = (g.camX + (boss ? (boss.x - g.camX) * focus : 0)) * TILE - vw / 2
  let oy = (g.camY + (boss ? (boss.y - 2.6 - g.camY) * focus : 0)) * TILE - vh / 2
  if (g.vfx.shake > 0) {
    ox += (Math.random() - 0.5) * g.vfx.shake
    oy += (Math.random() - 0.5) * g.vfx.shake
  }
  ox = Math.round(ox * Z) / Z
  oy = Math.round(oy * Z) / Z
  view.ox = ox
  view.oy = oy
  view.Z = Z
  const time = g.time

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  const theme = g.world.theme
  ctx.fillStyle = theme.border
  ctx.fillRect(0, 0, cw, ch)
  ctx.setTransform(Z, 0, 0, Z, -ox * Z, -oy * Z)

  // Ground
  const sx = Math.max(0, Math.floor(ox) - 1), sy = Math.max(0, Math.floor(oy) - 1)
  const sw = Math.min(g.world.ground.width - sx, Math.ceil(vw) + 3)
  const sh = Math.min(g.world.ground.height - sy, Math.ceil(vh) + 3)
  ctx.drawImage(g.world.ground, sx, sy, sw, sh, sx, sy, sw, sh)
  if (g.world.stadium) drawCrowd(g, ctx, sx, sy, sw, sh, performance.now() / 1000)

  const inView = (x: number, y: number, m = 3) =>
    x * TILE > ox - m * TILE && x * TILE < ox + vw + m * TILE && y * TILE > oy - m * TILE && y * TILE < oy + vh + m * TILE

  // Raid dungeon: the lava flows
  if (g.world.lavaMask) drawLavaLayer(ctx, g.world.lavaMask, ox, oy, vw, vh, time)
  // Ground marks (scorch, frost, craters) under everything else
  drawWater(g, ctx, ox, oy, vw, vh, time)
  g.vfx.drawDecals(ctx)
  // Swaying tall grass and nodding flowers (open-world maps)
  drawFoliage(g, ctx, ox, oy, vw, vh, time)
  g.vfx.drawUnder(ctx)
  // Raid: boss attacks telegraphed on the ground
  drawHazards(g, ctx, time)
  if (g.kind === 'duel') drawPads(g, ctx, time)
  drawItems(g, ctx, inView)

  // Team rings on the ground + target reticle base + aim preview (under actors)
  drawRings(g, ctx, inView, time)
  // Raid dungeon guards: the shield they hold over their pack
  for (const w of g.wilds) {
    if (w.role !== 'guard' || w.fainted || !inView(w.x, w.y, 6)) continue
    const R = 4.5 * TILE
    ctx.save()
    ctx.globalAlpha = w.idle ? 0.25 : 0.55
    ctx.strokeStyle = '#ffd860'
    ctx.lineWidth = 1.4
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -time * 14
    ctx.beginPath()
    ctx.ellipse(w.x * TILE, w.y * TILE, R, R * 0.6, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha *= 0.25
    ctx.fillStyle = '#ffd860'
    ctx.fill()
    ctx.restore()
  }
  drawAimPreview(g, ctx)
  drawMouseTarget(g, ctx, time)

  // Entities, y-sorted
  type Ent = { y: number; draw: () => void }
  const ents: Ent[] = []
  for (const tr of g.trainers) {
    const tv = vis(g, tr, tr.isPlayer)
    if (tr.alive && inView(tr.x, tr.y) && tv > 0) {
      ents.push({ y: tr.y, draw: () => drawTrainer(g, ctx, tr, time, tv) })
      // Glow on top of the partner standing right by the trainer
      if (supOf(g, tr) === 'legend') ents.push({ y: tr.y + 0.7, draw: () => drawSparks(ctx, tr, time) })
    }
    const pet = petFollow(g, tr, time)
    if (pet && inView(pet.x, pet.y) && tv > 0) ents.push({ y: pet.sp === WISP ? pet.y + 0.7 : pet.y, draw: () => drawPet(ctx, pet, time, tv) })
    const m = tr.mon
    if (tr.isPlayer && !g.partnerOut) continue
    const mvis = vis(g, m, tr.isPlayer)
    if (tr.alive && m && !m.fainted && inView(m.x, m.y) && mvis > 0) ents.push({ y: m.y, draw: () => drawMon(g, ctx, m, time, mvis) })
  }
  // Raid: Rayquaza flies out of sight and comes down again; Mewtwo's mirror images are see-through
  const air = g.raidView?.air ?? 0
  for (const w of g.wilds)
    if (inView(w.x, w.y)) ents.push({ y: w.y, draw: () => (w.boss && air > 0 ? drawMon(g, ctx, w, time, 1 - air * 0.9, air * 150) : drawMon(g, ctx, w, time)) })
  for (const c of g.clones)
    if (inView(c.x, c.y)) ents.push({ y: c.y, draw: () => drawMon(g, ctx, c, time, 0.5 + 0.12 * Math.sin(time * 5 + c.x)) })
  // Raid dungeon gates stand up like walls; braziers burn along the walls
  for (const gt of g.world.gates)
    if (gateShown(gt, time) && inView(gt.x + gt.w / 2, gt.y + gt.h / 2, 6)) ents.push({ y: gt.y + gt.h, draw: () => drawGate(ctx, gt, time) })
  for (const b of g.world.braziers) if (inView(b.x, b.y)) ents.push({ y: b.y, draw: () => drawBrazier(ctx, b.x * TILE, b.y * TILE, time) })
  for (const w of g.world.wells) if (inView(w.x, w.y)) ents.push({ y: w.y - 0.4, draw: () => drawWell(ctx, w.x * TILE, w.y * TILE, time, wellOn(g, w.room)) })
  for (const p of g.world.anim) if (inView(p.x + p.w / 2, p.y + p.h / 2, 4)) ents.push({ y: p.y + p.h - (p.kind === 'rune' ? 99 : 0), draw: () => drawAnimProp(ctx, p, time) })
  ents.sort((a, b) => a.y - b.y)
  for (const e of ents) e.draw()

  // Canopies and roofs
  ctx.drawImage(g.world.overlay, sx, sy, sw, sh, sx, sy, sw, sh)
  if (g.world.props.length) drawEyes(ctx, g.world, time, inView)
  if (g.world.lavaMask) drawLavaEmbers(ctx, g.world, time, inView)

  // Supply drops coming down; boss attacks on their way (meteors, icicles, the boss charging up)
  drawEvents(g, ctx, time)
  drawHazardsSky(g, ctx, time)

  // World mood: night darkness, heat haze, cold light (under the effects, so attacks light up the dark)
  if (theme.tint) {
    ctx.fillStyle = theme.tint
    ctx.fillRect(ox - 2, oy - 2, vw + 4, vh + 4)
  }
  // Raid dungeon: deep underground, lit by braziers, lava and the fight
  if (g.world.gates.length) {
    ctx.fillStyle = dungeonLook() === 'ice' ? 'rgba(6,14,30,0.26)' : coldLook() ? 'rgba(2,6,16,0.36)' : 'rgba(10,3,6,0.32)'
    ctx.fillRect(ox - 2, oy - 2, vw + 4, vh + 4)
  }

  // Ultimates dim the world so the effect pops (like BW's battle backdrop fade)
  g.vfx.drawDim(ctx, ox - 4, oy - 4, vw + 8, vh + 8)

  // Light: attacks cast light on the ground around them
  drawLights(g, ctx, inView, time, ox, oy, Z, cw, ch)

  // Telegraphs (and meteors on their way down)
  for (const n of g.novas)
    drawIncoming(ctx, n.move.fx, n.x * TILE, n.y * TILE, n.r * TILE, 1 - n.t / n.total, TYPE_COLOR[n.move.type], time, n.sx * TILE, n.sy * TILE)

  // Projectiles
  for (const p of g.projs)
    if (inView(p.x, p.y)) drawProjectile(ctx, p.move.fx, p.x * TILE, p.y * TILE, p.vx, p.vy, time, p.seed)

  g.vfx.draw(ctx, time)
  drawFx(g, ctx)
  for (const tr of g.trainers) if (tr.throwFx) drawThrow(ctx, tr.throwFx)

  // Cloud shadows drift across the land (not in caves and craters)
  if (!g.world.arena && !g.world.stadium) drawClouds(ctx, ox, oy, vw, vh, time)

  // Storm: tinted, rain-swept outside, a crackling energy wall on the edge
  if (g.kind === 'royale') drawStorm(g, ctx, ox, oy, vw, vh, time)

  // Weather and ambient particles
  drawWeather(theme.weather, ctx, ox, oy, vw, vh, time, phaseLook(g)?.weather ?? 1)

  // Brawl-style nameplates on top of everything
  for (const tr of g.trainers) {
    if (!tr.alive || !inView(tr.x, tr.y)) continue
    const inGrass = tr.isPlayer && g.world.isTall(tr.x, tr.y)
    if (inGrass) {
      // Stealth eye: closed + green while hidden, open red "!" when you've just given yourself away
      const top = tr.y * TILE - trainerHeight(tr) - 2
      drawStealthEye(ctx, tr.x * TILE, top - 6 + Math.sin(time * 4) * 1.2, !g.hidden(tr), time)
    } else if (tr.isPlayer) {
      const top = tr.y * TILE - trainerHeight(tr) - 2
      const b = Math.sin(time * 6) * 1.5
      ctx.fillStyle = '#48e070'
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
    if (m.fainted || (tr.isPlayer && !g.partnerOut) || vis(g, m, tr.isPlayer) === 0) continue
    plate(ctx, m, tr.isPlayer ? 'me' : g.kind === 'raid' ? 'ally' : 'foe', tr.isPlayer ? m.name : tr.name.split(' ').pop()!, supOf(g, tr))
  }
  const p = g.player
  for (const w of g.wilds) {
    if (!inView(w.x, w.y) || w.state === 'weak' || w.catching || w.boss) continue
    // Raid dungeon foes: their job on the nameplate (so you can plan the pull), and a cast bar
    if (w.foe) {
      plate(ctx, w, 'wild', `${ROLE_GLYPH[w.role] ?? ''}${w.foe >= 2 ? '★' : ''}Lv${w.level}`)
      if (w.cast) castBar(ctx, w, time)
      continue
    }
    const near = Math.hypot(w.x - p.x, w.y - p.y) < 7
    if (w.state === 'aggro' || w.hp < w.maxHp || w.rarity !== 'common' || near || g.playerTarget === w)
      plate(ctx, w, 'wild', `${w.shiny ? '✦' : ''}Lv${w.level}${w.legendary ? ' ★' : w.rarity === 'rare' ? ' ◆' : ''}`)
  }
  if (g.playerTarget && p.alive && g.introT <= 0) drawReticle(ctx, g.playerTarget, time)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // Cinematic vignette (heavier at night)
  ctx.drawImage(vignette(), 0, 0, cw, ch)
  if (theme.dark) ctx.drawImage(vignette(), -cw * 0.1, -ch * 0.1, cw * 1.2, ch * 1.2)
  // Chat bubbles, sharp in screen pixels
  drawBubbles(g, ctx, ox, oy, Z, cw, ch)
  // Raid: each phase looks more dangerous; the phase change plays as a short cinematic
  if (g.kind === 'raid') drawPhaseScreen(g, ctx, cw, ch)
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
  const fancy = !g.world.arena
  for (let dx = -1; dx <= 1; dx++)
    if (g.world.isTall(tx + dx + 0.5, ty + 0.5)) {
      if (fancy) {
        // The front half of the (swaying) grass in front of whoever stands in it
        const c = tallFrame(g, tx + dx, ty, g.time)
        ctx.drawImage(c, 0, TALL_TOP + 7, TILE, 9, (tx + dx) * TILE, ty * TILE + 7, TILE, 9)
      } else ctx.drawImage(g.world.ground, (tx + dx) * TILE, ty * TILE + 8, TILE, 8, (tx + dx) * TILE, ty * TILE + 8, TILE, 8)
    }
}

/** The tall-grass frame for a tile right now: a gust rolls across the field; it shakes when walked through. */
function tallFrame(g: Game, tx: number, ty: number, time: number) {
  const art = tileArt(g.world.theme)
  const v = Math.floor(hash(tx, ty, 5) * art.tall.length)
  const rt = g.world.rustle.get(ty * 128 + tx)
  let f: number
  if (rt !== undefined && time - rt < 0.5 && time >= rt) f = Math.floor(time * 18 + tx) % TALL_FRAMES
  else {
    const wave = Math.sin(time * 1.7 - tx * 0.35 - ty * 0.18)
    f = wave > 0.55 ? 1 : wave < -0.55 ? 3 : (Math.floor(time * 0.9 + hash(tx, ty, 6) * 4) % 2) * 2
  }
  return art.tall[v][f]
}

/** Tall grass and flowers in view, drawn per frame so they can move. */
function drawFoliage(g: Game, ctx: CanvasRenderingContext2D, ox: number, oy: number, vw: number, vh: number, time: number) {
  const w = g.world
  if (w.arena) return
  const art = tileArt(w.theme)
  const tx0 = Math.max(0, Math.floor(ox / TILE)), ty0 = Math.max(0, Math.floor(oy / TILE))
  const tx1 = Math.min(127, Math.ceil((ox + vw) / TILE)), ty1 = Math.min(128, Math.ceil((oy + vh) / TILE) + 1)
  if ((tx1 - tx0) * (ty1 - ty0) > 9000) return
  for (let ty = ty0; ty < ty1 && ty < 128; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = w.at(tx, ty)
      if (t === T.TALL) ctx.drawImage(tallFrame(g, tx, ty, time), tx * TILE, ty * TILE - TALL_TOP)
      else if (t === T.FLOWER && art.flowers.length) {
        const c = art.flowers[Math.floor(hash(tx, ty, 7) * art.flowers.length)]
        const f = Math.floor(time * 2.2 + hash(tx, ty, 8) * FLOWER_FRAMES) % FLOWER_FRAMES
        ctx.drawImage(c[f], tx * TILE, ty * TILE - 2)
      }
    }
}

const TRAINER_SCALE = 0.42

/**
 * Run cycles (side view, facing right) baked from video into one strip of
 * 80×80 frames per trainer: one full cycle, the ground line and the body's
 * centre per strip. Trainers without one hop and sway on their still sprite.
 */
const RUN_URLS = import.meta.glob('../assets/run/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const RUNS: Record<string, { frames: number; ground: number; cx: number }> = {
  hilbert: { frames: 16, ground: 78, cx: 37.3 },
  hilda: { frames: 12, ground: 79, cx: 36.0 },
  nate: { frames: 14, ground: 75, cx: 37.1 },
  rosa: { frames: 16, ground: 76, cx: 33.2 },
  cheren: { frames: 16, ground: 78, cx: 34.1 },
  bianca: { frames: 16, ground: 78, cx: 33.2 },
  n: { frames: 16, ground: 77, cx: 42.3 },
  iris: { frames: 14, ground: 78, cx: 38.1 },
  'elesa-masters': { frames: 17, ground: 79, cx: 36.2 },
  hugh: { frames: 16, ground: 73, cx: 34.1 },
  skyla: { frames: 19, ground: 79, cx: 38.4 },
  roxie: { frames: 16, ground: 70, cx: 31.7 },
  burgh: { frames: 16, ground: 78, cx: 36.5 },
  shauntal: { frames: 16, ground: 78, cx: 36.6 },
  colress: { frames: 16, ground: 77, cx: 36.1 },
  drayden: { frames: 16, ground: 79, cx: 37.7 },
  grimsley: { frames: 8, ground: 78, cx: 45.2 },
  steven: { frames: 16, ground: 75, cx: 35.2 },
  lance: { frames: 12, ground: 77, cx: 28.5 },
  cynthia: { frames: 29, ground: 79, cx: 32.3 },
  ghetsis: { frames: 16, ground: 78, cx: 35.1 },
  red: { frames: 16, ground: 77, cx: 31.7 },
}
/** Seconds per strip: each clip's own tempo, a touch quicker, kept within a sensible running pace. */
const runCycle = (frames: number) => Math.min(0.75, Math.max(0.3, (frames / 24) * 0.9))

function runSheet(sprite: string) {
  const r = RUNS[sprite]
  const url = r && RUN_URLS[`../assets/run/${sprite}.png`]
  return url ? { r, s: getSprite(url) } : null
}

/** What players said in the chat, shown above their trainer for a few seconds. */
const bubbles = new Map<string, { text: string; at: number; mine: boolean }>()
export function chatBubble(pid: string, text: string, mine: boolean) {
  if (pid && text.trim()) bubbles.set(pid, { text: text.trim(), at: performance.now(), mine })
}
const bubbleMs = (text: string) => Math.min(8000, 3500 + text.length * 70)
const BUBBLE_FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif'

/** Split text into at most `max` lines that fit `w` (the last one cut off with …). */
function wrap(ctx: CanvasRenderingContext2D, text: string, w: number, max: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= w || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > max) {
    lines.length = max
    lines[max - 1] += '…'
  }
  // A single word longer than the bubble
  return lines.map((l) => {
    if (ctx.measureText(l).width <= w) return l
    while (l.length > 1 && ctx.measureText(`${l}…`).width > w) l = l.slice(0, -1)
    return `${l}…`
  })
}

function drawBubbles(g: Game, ctx: CanvasRenderingContext2D, ox: number, oy: number, Z: number, cw: number, ch: number) {
  if (!bubbles.size) return
  const now = performance.now()
  const dpr = ctx.canvas.width / (ctx.canvas.clientWidth || ctx.canvas.width)
  for (const tr of g.trainers) {
    const b = tr.pid ? bubbles.get(tr.pid) : undefined
    if (!b) continue
    const age = now - b.at, life = bubbleMs(b.text)
    if (age > life) {
      bubbles.delete(tr.pid)
      continue
    }
    // Hidden in the grass stays hidden: no bubble gives you away
    if (!tr.alive || vis(g, tr, tr.isPlayer) <= 0) continue
    // Above the trainer, and above their Pokémon's nameplate when it stands right beside them
    let top = tr.y * TILE - trainerHeight(tr) - 12
    const m = tr.mon
    if (m && !m.fainted && (!tr.isPlayer || g.partnerOut) && Math.abs(m.x - tr.x) < 2.5 && Math.abs(m.y - tr.y) < 2)
      top = Math.min(top, spriteTop(m) - 22)
    const x = (tr.x * TILE - ox) * Z
    const y = (top - oy) * Z
    if (x < -150 * dpr || x > cw + 150 * dpr || y < -20 * dpr || y > ch + 120 * dpr) continue
    const pop = Math.min(1, age / 160)
    const k = 1 - Math.pow(1 - pop, 3)
    ctx.save()
    ctx.globalAlpha = Math.min(1, (life - age) / 400) * Math.min(1, age / 100)
    ctx.translate(Math.round(x), Math.round(y))
    ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k)
    ctx.font = `700 ${13 * dpr}px ${BUBBLE_FONT}`
    const lines = wrap(ctx, b.text, 200 * dpr, 3)
    const lh = 17 * dpr, pad = 10 * dpr
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2
    const h = lines.length * lh + pad * 1.2
    const tail = 7 * dpr
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 10 * dpr
    ctx.shadowOffsetY = 2 * dpr
    ctx.fillStyle = b.mine ? '#ffd60a' : '#f5f5f7'
    ctx.beginPath()
    ctx.roundRect(-w / 2, -h - tail, w, h, 12 * dpr)
    ctx.moveTo(-tail, -tail - 1)
    ctx.lineTo(0, 0)
    ctx.lineTo(tail, -tail - 1)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#0a0a0b'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((l, i) => ctx.fillText(l, 0, -h - tail + pad * 0.6 + lh * (i + 0.5)))
    ctx.restore()
  }
}

function trainerHeight(tr: Trainer) {
  const s = getSprite(trainerSpriteUrl(tr.def.sprite))
  return s.ready ? s.bh * TRAINER_SCALE : 28
}

/** Followers (cosmetic): each one trails its trainer on a loose leash, floating a little off the ground. */
interface PetState { sp: number; x: number; y: number; faceRight: boolean; t: number; seed: number }
const petStates = new WeakMap<Trainer, PetState>()
function petFollow(g: Game, tr: Trainer, time: number): PetState | null {
  const sp = tr.human ? g.setup.humans.find((h) => h.pid === tr.pid)?.pet : undefined
  if (!sp || !tr.alive) return null
  let st = petStates.get(tr)
  if (!st || Math.hypot(st.x - tr.x, st.y - tr.y) > 8) {
    st = { sp, x: tr.x - 1, y: tr.y - 0.4, faceRight: false, t: time, seed: Math.random() * 10 }
    petStates.set(tr, st)
  }
  const dt = Math.min(0.1, Math.max(0, time - st.t))
  st.t = time
  // Hover at the trainer's shoulder (the partner walks behind, lower down)
  const tx = tr.x + (tr.faceRight ? -0.45 : 0.45), ty = tr.y + 0.05
  const dx = tx - st.x, dy = ty - st.y, d = Math.hypot(dx, dy)
  if (d > 0.05) {
    const k = 1 - Math.exp(-dt * (d > 3 ? 6 : 3))
    st.x += dx * k
    st.y += dy * k
    if (Math.abs(dx) > 0.15) st.faceRight = dx > 0
  }
  return st
}

/** A player's supporter pack (from the match setup). */
const supOf = (g: Game, tr: Trainer): SupportTier | undefined => (tr.human ? g.setup.humans.find((h) => h.pid === tr.pid)?.sup : undefined)

const badgeImgs = new Map<string, HTMLImageElement>()
function badgeImg(t: SupportTier) {
  const url = badgeOf(t)
  if (!url || typeof Image === 'undefined') return null
  let i = badgeImgs.get(url)
  if (!i) {
    i = new Image()
    i.src = url
    badgeImgs.set(url, i)
  }
  return i.complete && i.naturalWidth ? i : null
}

/** The Storm Wisp: a little orb of lightning bobbing along, crackling now and then. */
function drawWisp(ctx: CanvasRenderingContext2D, st: PetState, time: number, fade: number) {
  const px = st.x * TILE, py = st.y * TILE - 16 + Math.sin(time * 3.1 + st.seed) * 2.2
  shadow(ctx, st.x * TILE, st.y * TILE + 1, 3)
  ctx.save()
  ctx.globalAlpha = fade
  ctx.globalCompositeOperation = 'lighter'
  const pulse = 0.8 + 0.2 * Math.sin(time * 7 + st.seed)
  drawGlow(ctx, px, py, 12 * pulse, '#4ab8ff', 0.55)
  ctx.fillStyle = 'rgba(120,210,255,0.9)'
  ctx.beginPath()
  ctx.arc(px, py, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(240,252,255,1)'
  ctx.beginPath()
  ctx.arc(px - 0.5, py - 0.6, 1.6, 0, Math.PI * 2)
  ctx.fill()
  // A tiny bolt jumping off it, a new shape a few times a second
  const f = Math.floor(time * 9 + st.seed * 10)
  if (hash(f, 3, 77) > 0.45) {
    let a = hash(f, 4, 78) * Math.PI * 2, x = px, y = py
    ctx.strokeStyle = 'rgba(255,245,150,0.9)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 3; k++) {
      a += (hash(f, 5 + k, 79) - 0.5) * 1.6
      x += Math.cos(a) * 2.6
      y += Math.sin(a) * 2.6
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Legend supporters leave a few golden sparks behind them as they run. */
function drawSparks(ctx: CanvasRenderingContext2D, tr: Trainer, time: number) {
  if (tr.walkT <= 0) return
  ctx.save()
  for (let i = 0; i < 8; i++) {
    const k = (time * 1.6 + i / 8 + tr.id * 0.37) % 1
    const sx = tr.x * TILE + (hash(tr.id, Math.floor(time * 1.6 + i / 8), 90 + i) - 0.5) * 14 - (tr.faceRight ? 8 : -8) * k
    const sy = tr.y * TILE - 4 - k * 14
    if (k < 0.3) drawGlow(ctx, sx, sy, 5, '#ffd04a', 0.6 * (1 - k))
    ctx.fillStyle = k < 0.4 ? '#fff6c0' : `rgba(255,196,40,${Math.min(1, (1 - k) * 1.4)})`
    const z = k < 0.3 ? 3 : k < 0.7 ? 2 : 1
    ctx.fillRect(Math.round(sx), Math.round(sy), z, z)
  }
  ctx.restore()
}

function drawPet(ctx: CanvasRenderingContext2D, st: PetState, time: number, fade: number) {
  if (st.sp === WISP) return drawWisp(ctx, st, time, fade)
  const s = liveSprite(st.sp, false, false) ?? monSprite(st.sp, false, false)
  if (!s.ready) return
  const [fx, fy] = frameAt(s, time, st.seed * 1000)
  // Really small: a keychain-sized companion, never mistaken for a real Pokémon in the fight
  const sc = 0.17
  const dw = s.bw * sc, dh = s.bh * sc
  const px = st.x * TILE, py = st.y * TILE
  const hover = -20 + Math.sin(time * 2.6 + st.seed) * 2
  shadow(ctx, px, py + 1, dw * 0.35)
  ctx.save()
  ctx.globalAlpha = fade
  ctx.translate(Math.round(px), Math.round(py + hover))
  // BW sprites face left
  if (st.faceRight) ctx.scale(-1, 1)
  ctx.drawImage(s.img, fx + s.bx, fy + s.by, s.bw, s.bh, -dw / 2, -dh, dw, dh)
  ctx.restore()
}

function drawTrainer(g: Game, ctx: CanvasRenderingContext2D, tr: Trainer, _time: number, fade = 1) {
  const s = getSprite(trainerSpriteUrl(tr.def.sprite))
  const px = tr.x * TILE, py = tr.y * TILE
  shadow(ctx, px, py + 1, 13)
  if (!s.ready) return
  // Running: the real run cycle if this trainer has one (walkT grows 7 per second while moving)
  const run = tr.walkT > 0 ? runSheet(tr.def.sprite) : null
  if (run?.s.ready) {
    const { frames, ground, cx } = run.r
    const f = Math.floor((tr.walkT / 7 / runCycle(frames)) * frames) % frames
    const sc = TRAINER_SCALE
    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(Math.round(px), Math.round(py))
    if (!tr.faceRight) ctx.scale(-1, 1)
    ctx.drawImage(run.s.img, f * 80, 0, 80, 80, -cx * sc, 1 - (ground + 1) * sc, 80 * sc, 80 * sc)
    ctx.restore()
    grassOver(g, ctx, tr.x, tr.y)
    return
  }
  const dw = s.bw * TRAINER_SCALE, dh = s.bh * TRAINER_SCALE
  // Walk cycle: a little hop and sway, like BW overworld bobbing.
  const step = tr.walkT > 0 ? tr.walkT * 0.9 : 0
  const hop = tr.walkT > 0 ? -Math.abs(Math.sin(step)) * 1.8 : 0
  const sway = tr.walkT > 0 ? Math.sin(step) * 0.07 : 0
  ctx.save()
  ctx.globalAlpha = fade
  ctx.translate(Math.round(px), Math.round(py + hop))
  ctx.rotate(sway)
  if (tr.faceRight) ctx.scale(-1, 1)
  ctx.drawImage(s.img, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh + 1, dw, dh)
  ctx.restore()
  grassOver(g, ctx, tr.x, tr.y)
}

function drawMon(g: Game, ctx: CanvasRenderingContext2D, m: Mon, time: number, fade = 1, rise = 0) {
  // Raid bosses (and wild legendaries) play their animated sprite; bosses change form per phase
  const form = m.legendary || m.boss ? bossForm(g, m) : m.species.id
  let anim = m.legendary || m.boss ? animSprite(form) : null
  // Phase change: the boss roars (its baked action animation if it has one) and rises up
  const cine = m.boss ? cinematic(g) : -1
  // (a boss that changes form has no roar sheet for its new form, so it stops on the flash)
  const roar = cine >= 0 && cine < 0.92 ? animSprite(`${form}-roar`) : null
  if (roar?.ready) anim = roar
  const back = !anim && m.dir === 'up'
  // Everyone else plays their animated BW sprite once it has loaded (a still one until then)
  const live = anim ? null : liveSprite(m.species.id, back, m.shiny)
  const s = anim ?? live ?? monSprite(m.species.id, back, m.shiny)
  const moving = Math.abs(m.mvx) + Math.abs(m.mvy) > 0.001
  const pose = m.boss ? null : poseOf(m, moving)
  const [fx, fy] = roar?.ready ? frameAt(s, cine * ENRAGE_TIME, 0, true) : pose ? frameAt(s, pose.clock) : frameAt(s, time, m.bob * 1000)
  const px = m.x * TILE, py = m.y * TILE
  const sc = m.scale
  const dw = s.bw * sc, dh = s.bh * sc
  let bob = pose ? pose.dy : Math.sin(time * (moving ? 12 : 3) + m.bob) * (moving ? 1.2 : 0.6)
  if (m.state === 'weak') bob = 0
  if (m.boss) {
    // Flyers hover; walkers stomp with a heavier step
    if (FLOATERS.has(form)) bob = Math.sin(time * 2.2 + m.bob) * 3.5 - 5
    else if (moving) bob = -Math.abs(Math.sin(time * 5 + m.bob)) * 2.5
    if (cine >= 0) rise += Math.sin(Math.min(1, cine / 0.9) * Math.PI) * 12
  }
  const look = m.boss ? phaseLook(g) : null
  // Phase aura: the boss glows in its phase colour, harder in the final phase
  if (look?.aura && (g.raidView?.phase ?? 0) > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5)
    drawGlow(ctx, px, py - dh * 0.45 - rise, dw * (0.85 + 0.1 * pulse), look.aura, 0.18 + 0.12 * pulse + (shownPhase(g) >= 2 ? 0.12 : 0))
  }

  // Fast moves leave afterimages (dashes, swoops, teleports)
  if (m.boss && s.ready) drawTrail(ctx, m, s, fx, fy, dw, dh, look?.aura ?? '#ffffff', rise)

  // Unlockable partners: a soft glow in their accent colour with two sparks circling them
  const elite = m.owner && !m.boss ? eliteColor(m.species.id) : undefined
  if (elite && !m.fainted) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + m.bob)
    drawGlow(ctx, px, py - dh * 0.3 - rise, dw * (0.55 + 0.08 * pulse), elite, 0.14 + 0.08 * pulse)
    ctx.fillStyle = elite
    for (let i = 0; i < 2; i++) {
      const a = time * 2.4 + m.bob + i * Math.PI
      const ox = Math.cos(a) * dw * 0.42, oy = Math.sin(a) * dw * 0.14
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(a)
      ctx.fillRect(Math.round(px + ox) - 1, Math.round(py - dh * 0.25 + oy - rise) - 1, 3, 3)
    }
    ctx.globalAlpha = 1
  }

  // 1 vs 1 power-ups: red (X Attack), blue streaks (X Speed), a golden bubble (X Defense)
  const o = m.owner
  if (o && !m.fainted && (o.atkT > 0 || o.spdT > 0 || o.defT > 0)) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 6 + m.bob)
    // Blinks for its last two seconds
    const fade = (t: number) => (t > 2 || Math.sin(time * 18) > 0 ? 1 : 0.25)
    if (o.atkT > 0) drawGlow(ctx, px, py - dh * 0.35 - rise, dw * (0.6 + 0.1 * pulse), '#ff5030', (0.2 + 0.12 * pulse) * fade(o.atkT))
    if (o.spdT > 0) {
      ctx.globalAlpha = 0.7 * fade(o.spdT)
      ctx.fillStyle = '#80d0ff'
      for (let i = 0; i < 4; i++) {
        const k = (time * 3 + i / 4 + m.bob) % 1
        ctx.fillRect(Math.round(px - dw * 0.45 + ((i * 37) % 10)), Math.round(py - dh * 0.15 - i * 5 + k * 4 - rise), Math.round(6 + k * 6), 1)
      }
      ctx.globalAlpha = 1
    }
    if (o.defT > 0) {
      ctx.globalAlpha = (0.35 + 0.2 * pulse) * fade(o.defT)
      ctx.strokeStyle = '#ffe070'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(px, py - dh * 0.35 - rise, dw * 0.5, dh * 0.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

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
  if (m.charging) drawCharge(ctx, m.charging.move.fx, px, py - dh * 0.5, 1 - m.charging.t / m.charging.total, time, py)
  const lunge = pose ? pose.lunge : m.castT > 0 ? Math.sin((m.castT / 0.18) * Math.PI) * 3 : 0
  let alpha = 1
  if (m.state === 'weak' && m.weakT < 3) alpha = Math.sin(time * 20) > 0 ? 1 : 0.35
  if (m.catching) alpha = 0.5
  alpha *= fade
  ctx.globalAlpha = alpha
  const flip = back ? m.dir === 'left' : m.dir === 'right' || (anim != null && (m.dir === 'up' || m.dir === 'down') && m.aimX > 0.2)
  ctx.save()
  // Shaking with power while a big move charges; jolted when hit
  const ck = m.charging ? 1 - m.charging.t / m.charging.total : 0
  const jolt = m.joltT > 0 ? (Math.random() - 0.5) * 3 : ck > 0 ? (Math.random() - 0.5) * ck * ck * 2.6 : 0
  const lift = m.liftT > 0 ? -Math.sin(Math.min(1, m.liftT / 0.5) * Math.PI) * 6 : 0
  ctx.translate(Math.round(px + m.aimX * lunge + jolt), Math.round(py + bob + m.aimY * lunge + lift - rise))
  if (pose && m.state !== 'weak') ctx.rotate(pose.rot)
  if (flip) ctx.scale(-1, 1)
  if (m.state === 'weak') ctx.rotate(0.25)
  if (pose) ctx.scale(pose.sx, pose.sy)
  else if (m.castT > 0) ctx.scale(1 + lunge * 0.02, 1 - lunge * 0.02)
  // (the charge-up's glowing core sits in front of the sprite: see below)
  // Impact frame: squashed for a split second when hit
  if (m.flash > 0) {
    const q = Math.min(1, m.flash / 0.12)
    ctx.scale(1 + q * 0.14, 1 - q * 0.12)
  }
  ctx.drawImage(s.img, fx + s.bx, fy + s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
  const glow = Math.max(
    m.flash > 0 ? 0.85 : 0,
    m.evolveFx > 0 ? 0.5 + 0.5 * Math.sin(time * 18) : 0,
    m.catching ? 0.6 : 0,
    m.charging ? 0.25 + 0.25 * Math.sin(time * 30) : 0,
  )
  if (glow > 0 && (s.white || live)) {
    ctx.globalAlpha = glow * alpha
    if (s.white) ctx.drawImage(s.white, fx + s.bx, fy + s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
    else ctx.drawImage(cellIn(s, fx, fy, '#ffffff'), 0, 0, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
  }
  // Type-coloured tint after a hit (yellow crackle for electric, orange for fire, ...)
  if (m.tintT > 0 && m.flash <= 0) {
    const t = live ? cellIn(s, fx, fy, m.tintCol) : tinted(s, m.tintCol)
    if (t) {
      ctx.globalAlpha = alpha * Math.min(1, m.tintT / 0.35) * (0.45 + Math.random() * 0.25)
      if (live) ctx.drawImage(t, 0, 0, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
      else ctx.drawImage(t, fx + s.bx, fy + s.by, s.bw, s.bh, -dw / 2, -dh + 2, dw, dh)
    }
  }
  ctx.restore()
  ctx.globalAlpha = 1
  if (!m.legendary) grassOver(g, ctx, m.x, m.y)
  // The charge-up's core, held out in front toward the aim
  if (m.charging) drawChargeCore(ctx, m.charging.move.fx, px + m.aimX * dw * 0.35, py - dh * 0.45 + m.aimY * dh * 0.2, 1 - m.charging.t / m.charging.total, time)

  if (m.state === 'weak') {
    // Dizzy stars
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + (i * Math.PI * 2) / 3
      ctx.fillStyle = '#ffe040'
      ctx.fillRect(px + Math.cos(a) * 8 - 1, py - dh - 2 + Math.sin(a) * 3, 2, 2)
    }
    if (!m.catching) label(ctx, L('CATCH!', 'VANG!'), px, py - dh - 8, '#ffe040')
  }
  if (m.shiny) {
    const a = time * 3
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(px + Math.cos(a) * dw * 0.4, py - dh / 2 + Math.sin(a * 1.3) * dh * 0.3, 1.5, 1.5)
  }
}

/** Per Pokémon: its animation clock, walk cycle and attack timeline (all visual only). */
const motion = new WeakMap<Mon, { clock: number; last: number; cast: number; atk: number; step: number }>()
/** Pokémon that hover instead of walking. */
const HOVER = new Set([81, 82, 462, 92, 93, 374, 375, 607, 608, 609, 151, 200, 429, 479, 480, 481, 482, 488, 109, 110, 201, 343, 344, 355, 422, 425, 426, 436, 437, 442, 562, 563, 592, 593, 615, 641, 642, 645])
/** Flying-type Pokémon that walk anyway. */
const WALKERS = new Set([83, 84, 85, 123])
const ease = (k: number) => 1 - (1 - k) * (1 - k)

/**
 * How a Pokémon moves on top of its animation: it breathes while idle, hops
 * with squash and stretch (and leans into the turn) while walking, floats if
 * it flies, and throws itself into an attack: a short wind-up, a lunge toward
 * the target and a springy return. Charging a big move makes it crouch.
 */
function poseOf(m: Mon, moving: boolean) {
  const now = performance.now() / 1000
  let st = motion.get(m)
  if (!st) motion.set(m, (st = { clock: m.bob * 3, last: now, cast: 0, atk: 9, step: 0 }))
  const dt = Math.min(0.1, Math.max(0, now - st.last))
  st.last = now
  st.clock += dt * (moving ? 1.8 : 1)
  if (moving) st.step += dt * 10
  // A new attack: the cast timer jumped up
  if (m.castT > st.cast + 0.04) st.atk = 0
  st.cast = m.castT
  st.atk += dt
  const flier = HOVER.has(m.species.id) || (m.species.types.includes('flying') && !WALKERS.has(m.species.id))
  let dy = 0, sx = 1, sy = 1, rot = 0, lunge = 0
  const lean = Math.max(-1, Math.min(1, m.mvx * 40))
  if (flier) {
    // Hovering: bobbing in the air, banking into a turn
    dy = -3 + Math.sin(now * 3 + m.bob) * 1.6
    rot = lean * 0.14
    const b = Math.sin(now * 3 + m.bob)
    sy = 1 + b * 0.02
  } else if (moving) {
    // A hop per step: up and stretched, down and squashed, leaning forward
    const hop = Math.abs(Math.sin(st.step))
    dy = -hop * 2.4
    sy = 0.93 + hop * 0.11
    sx = 1.05 - hop * 0.07
    rot = lean * 0.08
  } else {
    // Breathing
    const b = Math.sin(st.clock * 2.6 + m.bob)
    sy = 1 + b * 0.025
    sx = 1 - b * 0.012
  }
  // Attack: wind-up (0.07 s), lunge (0.08 s), spring back (0.2 s)
  const a = st.atk
  if (a < 0.35) {
    if (a < 0.07) {
      const k = a / 0.07
      lunge = -2.5 * k
      sx *= 1 + 0.09 * k
      sy *= 1 - 0.09 * k
    } else if (a < 0.15) {
      const k = ease((a - 0.07) / 0.08)
      lunge = -2.5 + 10.5 * k
      sx *= 1.09 - 0.15 * k
      sy *= 0.91 + 0.19 * k
    } else {
      const k = ease((a - 0.15) / 0.2)
      lunge = 8 * (1 - k)
      // A little overshoot as it settles
      const wob = Math.sin(k * Math.PI * 2) * (1 - k) * 0.05
      sx *= 1 + wob
      sy *= 1 - wob
    }
    rot += Math.max(-1, Math.min(1, m.aimX)) * 0.1 * Math.max(0, lunge) / 8
  }
  // Charging a big move: crouched, ready to spring
  if (m.charging) {
    const ck = 1 - m.charging.t / m.charging.total
    sy *= 1 - 0.09 * ck
    sx *= 1 + 0.06 * ck
  }
  return { clock: st.clock, dy, sx, sy, rot, lunge }
}

const tintCache = new Map<string, HTMLCanvasElement>()

/** The sprite's silhouette filled with a colour (cached per sprite + colour). */
/** Bosses that float above the ground. */
const FLOATERS = new Set([384, 10079, 150, 10044])

/** Where each boss has been the last moment (for afterimages). */
const trails = new WeakMap<Mon, { x: number; y: number; t: number }[]>()
function drawTrail(ctx: CanvasRenderingContext2D, m: Mon, s: ReturnType<typeof monSprite>, fx: number, fy: number, dw: number, dh: number, col: string, rise: number) {
  const now = performance.now() / 1000
  let tr = trails.get(m)
  if (!tr) trails.set(m, (tr = []))
  tr.push({ x: m.x, y: m.y, t: now })
  while (tr.length && now - tr[0].t > 0.3) tr.shift()
  const first = tr[0], last = tr[tr.length - 1]
  const speed = first && last.t > first.t ? Math.hypot(last.x - first.x, last.y - first.y) / (last.t - first.t) : 0
  if (speed < 4.5) return
  const tint = tinted(s, col)
  if (!tint) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 5; i++) {
    const p = tr[Math.floor((i / 5) * (tr.length - 1))]
    ctx.globalAlpha = 0.08 + i * 0.06
    ctx.drawImage(tint, fx + s.bx, fy + s.by, s.bw, s.bh, p.x * TILE - dw / 2, p.y * TILE - dh + 2 - rise, dw, dh)
  }
  ctx.restore()
}

/** The match being drawn (for helpers that only get a Pokémon). */
let cur: Game | null = null

/** Which sprite a raid boss shows: some change form in later phases (Black Kyurem, Mega Rayquaza, …). */
export function bossForm(g: Game, m: Mon) {
  if (m.boss && g.kind === 'raid' && g.setup.boss) return BOSSES[g.setup.boss].forms?.[shownPhase(g)] ?? m.species.id
  return m.species.id
}

/** The sprite drawn for a Pokémon (animated sheet for bosses and legendaries). */
function spriteOf(g: Game, m: Mon) {
  return (m.legendary || m.boss ? animSprite(bossForm(g, m)) : null) ?? liveSprite(m.species.id, m.dir === 'up', m.shiny) ?? monSprite(m.species.id, m.dir === 'up', m.shiny)
}

/**
 * One frame of a sheet filled with a colour, on a shared scratch canvas: the
 * animated sheets keep no silhouette copies (that would double their memory).
 */
const scratch = document.createElement('canvas')
function cellIn(s: ReturnType<typeof monSprite>, fx: number, fy: number, col: string): HTMLCanvasElement {
  // (resizing also clears it)
  scratch.width = s.bw
  scratch.height = s.bh
  const g = scratch.getContext('2d')!
  g.drawImage(s.img, fx + s.bx, fy + s.by, s.bw, s.bh, 0, 0, s.bw, s.bh)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = col
  g.fillRect(0, 0, s.bw, s.bh)
  return scratch
}

function tinted(s: ReturnType<typeof monSprite>, col: string): HTMLCanvasElement | null {
  if (!s.white) return null
  const key = (s.key ?? (s.img as HTMLImageElement).src) + col
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

/** Pixel-art stealth eye on a dark pill above the player. */
function drawStealthEye(ctx: CanvasRenderingContext2D, x: number, y: number, revealed: boolean, time: number) {
  const w = 16, h = 9
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  // glow
  ctx.globalAlpha = 0.5 + Math.sin(time * 5) * 0.2
  ctx.fillStyle = revealed ? 'rgba(255,70,60,0.55)' : 'rgba(110,240,140,0.5)'
  ctx.beginPath()
  ctx.ellipse(0, 0, w * 0.8, h * 0.9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  // pill
  ctx.fillStyle = '#16121e'
  ctx.beginPath()
  ctx.roundRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 5)
  ctx.fill()
  ctx.fillStyle = revealed ? '#5a1818' : '#1c4a2a'
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, 4)
  ctx.fill()
  if (revealed) {
    // open eye
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(-1, 0, 5, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff3a3a'
    ctx.beginPath()
    ctx.arc(-1, 0, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#16121e'
    ctx.fillRect(-1.6, -0.6, 1.2, 1.2)
    ctx.fillStyle = '#ffd040'
    ctx.fillRect(5, -3, 1.5, 4)
    ctx.fillRect(5, 2, 1.5, 1.5)
  } else {
    // closed eye with lashes
    ctx.strokeStyle = '#9cf0a8'
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, -1.5, 5, 0.2, Math.PI - 0.2)
    ctx.stroke()
    ctx.lineWidth = 1
    for (const lx of [-3.5, 0, 3.5]) {
      ctx.beginPath()
      ctx.moveTo(lx, 2.6)
      ctx.lineTo(lx * 1.25, 4)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * How visible a trainer or their Pokémon is to the player:
 * 1 = normal, 0.5 = in tall grass but you can see it (yours, or close by), 0 = hidden.
 */
function vis(g: Game, e: { x: number; y: number; revealT: number }, mine: boolean): number {
  if (!g.hidden(e)) return 1
  if (mine) return 0.5
  const p = g.player
  if (!p.alive) return 0.5
  const d = Math.min(Math.hypot(p.x - e.x, p.y - e.y), p.mon.fainted ? 99 : Math.hypot(p.mon.x - e.x, p.mon.y - e.y))
  return d < BUSH_SIGHT ? 0.5 : 0
}

type Team = 'me' | 'ally' | 'foe' | 'wild'
const TEAM_COL: Record<Team, { bar: string; dark: string; name: string; ring: string }> = {
  me: { bar: '#48e070', dark: '#1c7a38', name: '#7cf09c', ring: '#48e070' },
  // Teammates (raid): green like you, the name a touch lighter so you still find yourself
  ally: { bar: '#48e070', dark: '#1c7a38', name: '#d8ffe0', ring: '#48e070' },
  foe: { bar: '#ff4a48', dark: '#8a1c1c', name: '#ff8a80', ring: '#ff4a48' },
  wild: { bar: '#ffc830', dark: '#8a6410', name: '#ffffff', ring: '#ffc830' },
}

function spriteTop(m: Mon) {
  const s = spriteOf(cur!, m)
  return m.y * TILE - (s.ready ? s.bh * m.scale : 16)
}

const ROLE_GLYPH: Record<string, string> = { brute: '⚔ ', caster: '✦ ', mender: '✚ ', guard: '◆ ' }

/** A dungeon foe casting: a bar under its nameplate that fills up; hit it to break the spell. */
function castBar(ctx: CanvasRenderingContext2D, m: Mon, time: number) {
  const c = m.cast!
  const w = 32, h = 4
  const x = m.x * TILE - w / 2
  const y = spriteTop(m) - 1
  const k = Math.max(0, Math.min(1, 1 - c.t / c.total))
  const col = c.kind === 'heal' ? '#60f090' : '#ffb030'
  ctx.fillStyle = '#16121e'
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
  ctx.fillStyle = '#3a3448'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = col
  ctx.fillRect(x, y, w * k, h)
  // A blinking edge: interrupt me!
  if (Math.sin(time * 16) > 0) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.8
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3)
  }
  label(ctx, c.kind === 'heal' ? '✚' : '✦', x - 4, y + h, col)
}

/** Nameplate: name, HP number on a chunky team-coloured bar with a trailing damage strip. */
function plate(ctx: CanvasRenderingContext2D, m: Mon, team: Team, name: string, sup?: SupportTier) {
  const c = TEAM_COL[team]
  const legend = m.legendary && !m.owner
  const w = legend ? 40 : 30, h = 6
  const x = m.x * TILE - w / 2
  const y = spriteTop(m) - 9
  const k = Math.max(0, m.hp / m.maxHp)
  const lag = Math.max(k, Math.min(1, (m.hpLag < 0 ? m.hp : m.hpLag) / m.maxHp))
  // frame
  ctx.fillStyle = '#16121e'
  ctx.beginPath()
  ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 2.5)
  ctx.fill()
  ctx.fillStyle = '#3a3448'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, w * lag, h)
  ctx.fillStyle = legend ? '#ffd040' : c.dark
  ctx.fillRect(x, y, w * k, h)
  ctx.fillStyle = legend ? '#fff0a0' : c.bar
  ctx.fillRect(x, y, w * k, h - 2)
  // segment ticks
  ctx.fillStyle = 'rgba(22,18,30,0.35)'
  for (let i = 1; i < 4; i++) ctx.fillRect(x + (w * i) / 4, y, 0.6, h)
  // HP number inside the bar
  ctx.font = `700 5.5px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 2
  ctx.strokeStyle = '#16121e'
  const hpText = `${Math.ceil(m.hp)}`
  ctx.strokeText(hpText, x + w / 2, y + h / 2 + 0.5)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(hpText, x + w / 2, y + h / 2 + 0.5)
  // name above (a supporter's badge in front of it, a Legend's name in gold)
  label(ctx, name, m.x * TILE, y - 2, legend || sup === 'legend' ? '#ffd040' : c.name)
  const b = sup && badgeImg(sup)
  if (b) {
    const tw = ctx.measureText(name).width
    const s = 7 / Math.max(b.naturalWidth, b.naturalHeight)
    ctx.drawImage(b, Math.round(m.x * TILE - tw / 2 - 9), Math.round(y - 9), b.naturalWidth * s, b.naturalHeight * s)
  }
}

function drawRings(g: Game, ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean, time: number) {
  const ring = (m: Mon, col: string, a: number) => {
    const r = m.legendary ? 15 : 10
    ctx.globalAlpha = a * 0.25
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.ellipse(m.x * TILE, m.y * TILE + 1, r, r * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = a
    ctx.strokeStyle = col
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  for (const tr of g.trainers) {
    const m = tr.mon
    if (!tr.alive || m.fainted || !inView(m.x, m.y) || (tr.isPlayer && !g.partnerOut) || vis(g, m, tr.isPlayer) === 0) continue
    ring(m, tr.isPlayer ? TEAM_COL.me.ring : g.kind === 'raid' ? TEAM_COL.ally.ring : TEAM_COL.foe.ring, 0.85)
  }
  const t = g.playerTarget
  if (t && g.player.alive && inView(t.x, t.y) && g.introT <= 0) {
    // pulsing red ground marker under the current target
    const r = (t.legendary ? 17 : 12) + Math.sin(time * 8) * 1.2
    ctx.strokeStyle = '#ff3a3a'
    ctx.lineWidth = 1.6
    ctx.setLineDash([4, 3])
    ctx.lineDashOffset = -time * 20
    ctx.beginPath()
    ctx.ellipse(t.x * TILE, t.y * TILE + 1, r, r * 0.42, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** Corner brackets around the Pokémon you're attacking. */
function drawReticle(ctx: CanvasRenderingContext2D, m: Mon, time: number) {
  const s = spriteOf(cur!, m)
  const w = (s.ready ? s.bw * m.scale : 16) + 6
  const h = (s.ready ? s.bh * m.scale : 16) + 6
  const cx = m.x * TILE, cy = m.y * TILE - h / 2 + 3
  const pulse = 1 + Math.sin(time * 9) * 0.06
  const hw = (w / 2) * pulse, hh = (h / 2) * pulse
  const L = 5
  ctx.strokeStyle = '#16121e'
  ctx.lineWidth = 3
  const corners = () => {
    ctx.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cx + sx * hw, y = cy + sy * hh
      ctx.moveTo(x, y - sy * -L)
      ctx.lineTo(x, y)
      ctx.lineTo(x - sx * L, y)
    }
  }
  corners()
  ctx.stroke()
  ctx.strokeStyle = '#ff3a3a'
  ctx.lineWidth = 1.5
  corners()
  ctx.stroke()
}

/** Desktop: a clear target on the ground where the mouse points (the cursor alone gets lost on busy pixel art). */
function drawMouseTarget(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  const a = g.aimAt
  if (!a || !document.body.classList.contains('desk') || g.introT > 0 || !g.player.alive) return
  const m = g.player.mon
  const mv = m.moves[0]
  const inRange = !m.fainted && Math.hypot(a.x - m.x, a.y - m.y) <= mv.range + 0.5
  const col = inRange ? TYPE_COLOR[mv.type] : '#ffffff'
  const x = a.x * TILE, y = a.y * TILE
  const r = 7 + Math.sin(time * 6) * 0.8
  ctx.save()
  ctx.lineCap = 'round'
  for (const [w, c] of [[4, 'rgba(20,20,30,0.75)'], [2, col]] as const) {
    ctx.strokeStyle = c
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    // Four ticks pointing in
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2 + time * 0.8
      ctx.moveTo(x + Math.cos(t) * (r + 5), y + Math.sin(t) * (r + 5))
      ctx.lineTo(x + Math.cos(t) * (r - 2), y + Math.sin(t) * (r - 2))
    }
    ctx.stroke()
  }
  ctx.fillStyle = col
  ctx.fillRect(x - 1, y - 1, 2, 2)
  ctx.restore()
}

/** Brawl Stars-style aim preview while dragging an attack button (or aiming with the mouse). */
function drawAimPreview(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  if (!p.alive || !g.partnerOut) return
  const m = p.mon
  if (m.fainted) return
  const prev = g.aimPreview
  const desk = !prev && g.aimAt && document.body.classList.contains('desk')
  if (!prev && !desk) return
  const slot = prev ? prev.slot : 0
  const mv = m.moves[slot]
  let dx: number, dy: number, k: number
  if (prev) {
    dx = prev.x
    dy = prev.y
    k = prev.k
  } else {
    const d = g.cursorDir(m)
    if (!d) return
    dx = d.x
    dy = d.y
    k = d.k
  }
  const ox = m.x * TILE, oy = (m.y - 0.3) * TILE
  const R = mv.range * TILE
  const col = TYPE_COLOR[mv.type]
  const ready = m.cds[slot] <= 0 && m.unlocked(slot)
  ctx.save()
  ctx.globalAlpha = desk ? 0.35 : ready ? 0.55 : 0.3
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeStyle = ready ? col : '#808090'
  ctx.lineWidth = 1.5
  const a = Math.atan2(dy, dx)
  ctx.translate(ox, oy)
  switch (mv.kind) {
    case 'spread': {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, R, a - 0.32, a + 0.32)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'burst': {
      const r = (mv.tier >= 3 ? 3.4 : mv.range) * TILE
      ctx.beginPath()
      ctx.ellipse(0, 4, r, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'nova': {
      const d = Math.max(1.2, mv.range * k) * TILE
      const r = (mv.tier >= 3 ? 2.3 : 1.8) * TILE
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d + 4, r, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    }
    default: {
      // bolt / zap / beam / dash / melee: a bar the length of the reach
      const len = mv.kind === 'melee' ? R : R
      const wid = mv.kind === 'beam' ? 10 : mv.kind === 'melee' || mv.kind === 'dash' ? 9 : 7
      ctx.rotate(a)
      ctx.beginPath()
      ctx.roundRect(0, -wid / 2, len, wid, wid / 2)
      ctx.fill()
      ctx.stroke()
      if (mv.kind === 'melee' || mv.kind === 'dash') {
        ctx.beginPath()
        ctx.moveTo(len + 4, 0)
        ctx.lineTo(len - 4, -6)
        ctx.lineTo(len - 4, 6)
        ctx.closePath()
        ctx.fillStyle = ready ? col : '#808090'
        ctx.fill()
      }
    }
  }
  ctx.restore()
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

/**
 * 1 vs 1: the crowd comes alive. A wave runs round the stadium, people jump up
 * now and then, and the whole place cheers when a round is decided.
 */
function drawCrowd(g: Game, ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number, now: number) {
  const s = g.world.stadium!
  const ph = g.duelView?.phase
  const cheer = ph === 'break' || ph === 'over'
  const wave = (now * 0.9) % (Math.PI * 2)
  const t0x = Math.floor(sx / TILE), t0y = Math.floor(sy / TILE)
  for (let ty = t0y; ty <= t0y + Math.ceil(sh / TILE); ty++)
    for (let tx = t0x; tx <= t0x + Math.ceil(sw / TILE); tx++) {
      if (g.world.at(tx, ty) !== T.STAND) continue
      const cell = standCell(tx, ty, s)
      if (cell.row < 1 || cell.row > 8) continue
      // How close this spot is to the wave going round
      let da = Math.atan2(ty + 0.5 - ARENA_C, tx + 0.5 - ARENA_C) - wave
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)))
      for (let k = 0; k < 4; k++) {
        const p = standPerson(tx, ty, k, cell.vertical)
        if (!p) continue
        const [dx, dy, h] = p
        const up = cheer ? Math.sin(now * 14 + h * 40) > -0.2 : da < 0.22 || Math.sin(now * 3 + h * 90) > 0.97
        if (!up) continue
        // Up on their feet: head a pixel higher, both hands in the air
        const x = tx * TILE + dx, y = ty * TILE + dy
        const skin = SKIN[Math.floor(hash(tx, ty, 80 + k) * SKIN.length)]
        ctx.fillStyle = skin
        ctx.fillRect(x + 1, y - 1, 2, 3)
        ctx.fillRect(x - 1, y - 1, 1, 3)
        ctx.fillRect(x + 4, y - 1, 1, 3)
      }
    }
}

/** 1 vs 1: the power-up pads, with a ring that fills up until the next power-up. */
function drawPads(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  const left = g.duelView?.pads ?? []
  g.world.pads.forEach((p, i) => {
    const px = p.x * TILE, py = p.y * TILE
    const ready = (left[i] ?? 1) <= 0
    ctx.save()
    ctx.translate(px, py + 2)
    ctx.scale(1, 0.5)
    ctx.fillStyle = 'rgba(20, 24, 40, 0.45)'
    circle(ctx, 0, 0, 12)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = i === 0 ? '#ffd040' : '#ffffff'
    ctx.globalAlpha = ready ? 0.6 + 0.3 * Math.sin(time * 5) : 0.35
    circle(ctx, 0, 0, 11)
    ctx.stroke()
    if (!ready && left[i] !== undefined) {
      // Fills up toward the next power-up
      const k = 1 - Math.min(1, left[i] / 14)
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
    if (ready) drawGlow(ctx, px, py - 3, 16, i === 0 ? '#ffd040' : '#ffffff', 0.18 + 0.08 * Math.sin(time * 5))
  })
}

function drawItems(g: Game, ctx: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
  for (const it of g.items) {
    if (!inView(it.x, it.y)) continue
    const s = getSprite(itemUrl(ITEM_SPRITE[it.kind]))
    const px = it.x * TILE, py = it.y * TILE
    const b = Math.sin(it.bob * 3) * 1.5
    shadow(ctx, px, py + 2, 8)
    if (it.kind === 'evolve') {
      drawCrystal(ctx, s, px, py, it.bob)
      continue
    }
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

const RAINBOW = ['#ff6080', '#ffd040', '#60f0a0', '#60c0ff', '#c080ff']

/** The Evolution Crystal on the ground: a pillar of light you see from afar, a rainbow aura and sparkles. */
function drawCrystal(ctx: CanvasRenderingContext2D, s: ReturnType<typeof getSprite>, px: number, py: number, t: number) {
  const hue = (t * 90) % 360
  ctx.save()
  // Light pillar into the sky (coloured, so it shows on snow and sand too)
  const beam = ctx.createLinearGradient(0, py - 240, 0, py)
  beam.addColorStop(0, `hsla(${hue},100%,60%,0)`)
  beam.addColorStop(0.6, `hsla(${hue},100%,60%,0.3)`)
  beam.addColorStop(1, `hsla(${hue},100%,65%,0.55)`)
  ctx.fillStyle = beam
  const w = 7 + Math.sin(t * 6) * 1.5
  ctx.fillRect(px - w, py - 240, w * 2, 238)
  ctx.fillStyle = `hsla(${(hue + 40) % 360},100%,92%,0.75)`
  ctx.fillRect(px - 1.5, py - 240, 3, 238)
  ctx.globalCompositeOperation = 'lighter'
  // Rainbow aura pulsing on the ground
  for (let i = 0; i < 3; i++) {
    const k = ((t * 0.9 + i / 3) % 1)
    ctx.strokeStyle = `hsla(${(hue + i * 120) % 360},100%,70%,${0.7 * (1 - k)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(px, py + 1, 4 + k * 16, (4 + k * 16) * 0.42, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  drawGlow(ctx, px, py - 6, 26 + Math.sin(t * 5) * 4, RAINBOW[Math.floor(t * 1.5) % RAINBOW.length], 0.55)
  // Sparkles orbiting it
  for (let i = 0; i < 6; i++) {
    const a = t * 2.4 + (i * Math.PI) / 3
    const r = 10 + Math.sin(t * 3 + i) * 2
    ctx.fillStyle = `hsla(${(hue + i * 60) % 360},100%,80%,0.9)`
    ctx.fillRect(px + Math.cos(a) * r - 1, py - 8 + Math.sin(a) * r * 0.45 - Math.abs(Math.sin(t * 4 + i)) * 6 - 1, 2, 2)
  }
  ctx.restore()
  // The crystal itself: bigger than other items, floating and glinting
  if (s.ready) {
    const b = Math.sin(t * 3) * 2.5 - 4
    const sc = 1.6
    ctx.drawImage(s.img, s.bx, s.by, s.bw, s.bh, px - (s.bw * sc) / 2, py - s.bh * sc - 1 + b, s.bw * sc, s.bh * sc)
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
        const w = ctx.measureText(tx(f.text)).width + 6
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
        ctx.fillText(tx(f.text), px, ty - 1.5)
        break
      }
      case 'text': {
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
        const pop = 1 + Math.max(0, 0.7 - k * 4)
        ctx.font = `700 ${(f.small ? 5.5 : f.big ? 11 : 7.5) * (f.small ? 1 : pop)}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 2.5
        ctx.strokeStyle = '#282830'
        const ty = py - k * 10
        ctx.strokeText(tx(f.text), px, ty)
        ctx.fillStyle = f.color
        ctx.fillText(tx(f.text), px, ty)
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
  const liquid = g.world.theme.liquid
  const tx0 = Math.max(0, Math.floor(ox / TILE)), ty0 = Math.max(0, Math.floor(oy / TILE))
  const tx1 = Math.min(127, Math.ceil((ox + vw) / TILE)), ty1 = Math.min(127, Math.ceil((oy + vh) / TILE))
  if ((tx1 - tx0) * (ty1 - ty0) > 9000) return
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = g.world.at(tx, ty)
      const lava = tile === T.LAVA || (tile === T.WATER && liquid === 'lava')
      if (tile !== T.WATER && !lava) continue
      const seed = (tx * 73856093) ^ (ty * 19349663)
      const ph = (seed & 1023) / 163
      const k = Math.sin(time * 1.6 + ph)
      if (lava && !g.world.arena && tile === T.WATER) {
        // Lava lake: bright streaks drifting slowly over the surface
        const fr = tileArt(g.world.theme).water[Math.floor(time * 2.5) % WATER_FRAMES]
        ctx.drawImage(fr, (tx % 2) * TILE, (ty % 2) * TILE, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE)
        continue
      }
      // Raid dungeon: its lava has its own flowing layer
      if (lava && g.world.lavaMask) continue
      if (lava) {
        // Pulsing glow and the odd bubble
        ctx.fillStyle = `rgba(255,${180 + Math.round(60 * k)},60,${0.18 + 0.14 * k})`
        ctx.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2)
        if (k > 0.9) {
          const bx = tx * TILE + (seed & 11) + 2, by = ty * TILE + ((seed >> 4) & 11) + 2
          ctx.fillStyle = '#fff0a0'
          ctx.fillRect(bx, by, 2, 2)
        }
        continue
      }
      if (liquid === 'ice') continue
      if (!g.world.arena) {
        // Drifting ripples (a seamless 32 px pattern) and foam breathing along the shore
        const fr = tileArt(g.world.theme).water[Math.floor(time * 5) % WATER_FRAMES]
        ctx.drawImage(fr, (tx % 2) * TILE, (ty % 2) * TILE, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE)
        const up = g.world.at(tx, ty - 1)
        if (up !== T.WATER && up !== T.BRIDGE) {
          ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(time * 2.2 + tx * 0.7)})`
          ctx.fillRect(tx * TILE, ty * TILE + 3 + Math.round(Math.sin(time * 1.5 + tx * 0.5)), TILE, 1)
        }
      } else {
        // Rolling wave line
        const wy = ty * TILE + 4 + ((time * 6 + ph * 3) % 10)
        ctx.fillStyle = 'rgba(200,228,255,0.45)'
        ctx.fillRect(tx * TILE + 2 + Math.sin(time * 2 + ph) * 2, wy, 6, 1)
      }
      // Sparkle
      if (k > 0.86) {
        const sx = tx * TILE + (seed & 15), sy = ty * TILE + ((seed >> 4) & 15)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(sx - 1, sy, 3, 1)
        ctx.fillRect(sx, sy - 1, 1, 3)
      }
    }
}

const motes: { x: number; y: number; s: number; ph: number; v: number }[] = []
/** Ambient particles per world: pollen, rain, snow, sand, ash, embers or fireflies. */
function drawWeather(w: Weather, ctx: CanvasRenderingContext2D, ox: number, oy: number, vw: number, vh: number, time: number, more = 1) {
  const n = Math.round((w === 'rain' ? 90 : w === 'snow' || w === 'sand' ? 70 : w === 'ash' || w === 'wind' ? 50 : w === 'psy' ? 45 : 30) * more)
  while (motes.length < n) motes.push({ x: ox + Math.random() * vw, y: oy + Math.random() * vh, s: 0.6 + Math.random(), ph: Math.random() * 6, v: 0.6 + Math.random() * 0.8 })
  motes.length = n
  for (const m of motes) {
    switch (w) {
      case 'rain': m.x -= 0.6 * m.v; m.y += 5 * m.v; break
      case 'snow': m.x += Math.sin(time + m.ph) * 0.25; m.y += 0.45 * m.v; break
      case 'sand': m.x += 3.2 * m.v; m.y += Math.sin(time * 3 + m.ph) * 0.3; break
      case 'ash': m.x += Math.sin(time * 0.6 + m.ph) * 0.2 + 0.1; m.y += 0.25 * m.v; break
      case 'embers': m.x += Math.sin(time * 1.3 + m.ph) * 0.3; m.y -= 0.5 * m.v; break
      case 'wind': m.x += 6 * m.v; m.y += Math.sin(time * 2 + m.ph) * 0.4; break
      case 'psy': m.x += Math.sin(time * 0.8 + m.ph) * 0.25; m.y -= 0.18 * m.v; break
      default: m.x += Math.sin(time * 0.7 + m.ph) * 0.15 + 0.12; m.y += Math.cos(time * 0.5 + m.ph) * 0.1 - 0.05
    }
    if (m.x < ox - 10 || m.x > ox + vw + 10 || m.y < oy - 10 || m.y > oy + vh + 10) {
      m.x = ox + Math.random() * vw
      m.y = w === 'rain' || w === 'snow' || w === 'ash' ? oy - 5 : w === 'embers' ? oy + vh + 5 : oy + Math.random() * vh
      if (w === 'sand' || w === 'wind') m.x = ox - 5
      if (w === 'psy') m.y = oy + vh + 5
    }
    const tw = 0.5 + 0.5 * Math.sin(time * 2 + m.ph)
    switch (w) {
      case 'rain':
        ctx.fillStyle = 'rgba(190,215,255,0.45)'
        ctx.fillRect(m.x, m.y, 1, 5)
        break
      case 'snow':
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillRect(m.x, m.y, 1.5 * m.s, 1.5 * m.s)
        break
      case 'sand':
        ctx.fillStyle = 'rgba(240,210,150,0.5)'
        ctx.fillRect(m.x, m.y, 4 * m.s, 1)
        break
      case 'ash':
        ctx.fillStyle = 'rgba(70,64,62,0.7)'
        ctx.fillRect(m.x, m.y, 1.4 * m.s, 1.4 * m.s)
        break
      case 'embers':
        ctx.fillStyle = `rgba(255,${140 + Math.round(80 * tw)},40,${0.5 + 0.5 * tw})`
        ctx.fillRect(m.x, m.y, 1.5, 1.5)
        break
      case 'wind':
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(m.x, m.y, 10 * m.s, 1)
        break
      case 'psy':
        ctx.fillStyle = `rgba(230,140,255,${0.25 + 0.6 * tw})`
        ctx.fillRect(m.x, m.y, 1.5 * m.s, 1.5 * m.s)
        break
      case 'fireflies':
        ctx.fillStyle = `rgba(220,255,120,${0.2 + 0.8 * tw * tw})`
        ctx.fillRect(m.x, m.y, 1.5, 1.5)
        break
      default:
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 2 + m.ph)
        ctx.fillStyle = 'rgba(255,250,210,0.75)'
        ctx.fillRect(m.x, m.y, m.s, m.s)
        ctx.globalAlpha = 1
    }
  }
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

/**
 * Dynamic light: every projectile, charge-up, falling meteor, lightning bolt,
 * beam and explosion throws a soft pool of light on the ground around it, and
 * a brighter bloom at its core. Built from state every screen already has, so
 * it looks the same for every player and costs no network traffic.
 */
const HEX = /^#[0-9a-f]{6}$/i

/** Lights are soft, so they're drawn at a quarter of the screen's resolution and scaled up as pixels (fits the pixel art): far cheaper. */
const LIGHT_RES = 4
let lightCanvas: HTMLCanvasElement | null = null

function drawLights(g: Game, ctx: CanvasRenderingContext2D, inView: (x: number, y: number, m?: number) => boolean, time: number, ox: number, oy: number, Z: number, cw: number, ch: number) {
  const T = TILE
  const theme = g.world.theme
  // Brighter on dark worlds, gentler in daylight so it doesn't wash out
  const lit = theme.dark ? 1 : theme.tint ? 0.8 : 0.5
  const pool: [number, number, number, string, number][] = []
  const add = (x: number, y: number, r: number, col: string, a: number) => {
    if (pool.length < (g.world.props.length ? 90 : 50) && a > 0.04 && HEX.test(col) && inView(x / T, y / T, 4)) pool.push([x, y, r, col, a * lit])
  }
  for (const p of g.projs) add(p.x * T, p.y * T, 26 + p.move.tier * 9, pal(p.move.fx).glow, 0.55)
  for (const n of g.novas) {
    const k = 1 - n.t / n.total
    add(n.x * T, n.y * T, n.r * T * (0.5 + k * 0.9), pal(n.move.fx).glow, 0.12 + k * k * 0.6)
  }
  const mons = [...g.wilds, ...g.trainers.filter((t) => t.alive).map((t) => t.mon)]
  for (const m of mons) {
    if (m.charging) {
      const k = 1 - m.charging.t / m.charging.total
      const flick = 0.9 + 0.1 * Math.sin(time * (20 + k * 40))
      add(m.x * T, (m.y - 0.4) * T, 24 + k * 70, pal(m.charging.move.fx).glow, (0.3 + k * 0.6) * flick)
    }
    if (m.dash) add(m.x * T, (m.y - 0.3) * T, 40, pal(m.dash.move.fx).glow, 0.45)
  }
  const v = g.vfx
  for (const f of v.flashes) {
    const k = f.t / f.life
    add(f.x * T, f.y * T, Math.min(110, f.r * 1.8), f.col, (1 - k) * 0.35)
  }
  for (const b of v.bolts) {
    const k = 1 - b.t / b.life, fl = Math.random() < 0.3 ? 0.5 : 1
    add(b.x2 * T, b.y2 * T, 50 + b.w * 8, b.col, k * 0.6 * fl)
    add(((b.x1 + b.x2) / 2) * T, ((b.y1 + b.y2) / 2) * T, 50, b.col, k * 0.45 * fl)
  }
  for (const b of v.beams) {
    const k = 1 - b.t / b.life
    const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), n = Math.min(6, Math.ceil(len / 2))
    const col = pal(b.style as Parameters<typeof pal>[0]).glow
    for (let i = 0; i <= n; i++) add((b.x1 + ((b.x2 - b.x1) * i) / n) * T, (b.y1 + ((b.y2 - b.y1) * i) / n) * T, 30 + b.w * 2, col, k * 0.32)
  }
  for (const f of v.flares) {
    const k = f.t / f.life
    add(f.x * T, f.y * T, f.size * 0.9, f.col, (1 - k) * 0.3)
  }
  for (const r of v.rings) {
    const k = r.t / r.life
    if (r.r > 1.2) add(r.x * T, r.y * T, r.r * T * (0.6 + k), r.col, (1 - k) * 0.25)
  }
  // Raid: the boss's attacks glow brighter just before they land
  for (const h of g.hazards) {
    const k = h.total > 0 ? 1 - Math.max(0, h.t) / h.total : 1
    if (k > 0.6 && h.shape !== 'grid') add(h.x * T, h.y * T, Math.min(6, h.r) * T * 0.9, TYPE_COLOR[h.type], (k - 0.6) * 0.9)
  }
  // Raid dungeon: lava, lavafalls, crystals, forges, runes
  if (g.world.props.length) propLights(g.world, add, time)
  // Raid dungeon braziers: warm, flickering pools of light (cold blue in the Storm Tower)
  const storm = coldLook()
  for (const b of g.world.braziers) {
    const fl = 0.85 + 0.15 * Math.sin(time * 9 + b.x * 3) * Math.sin(time * 13 + b.y)
    add(b.x * T, (b.y - 0.6) * T, 30 * fl, storm ? '#5ac8ff' : '#ff8a30', 0.45 * fl)
  }
  if (!pool.length) return
  const lw = Math.ceil(cw / LIGHT_RES), lh = Math.ceil(ch / LIGHT_RES)
  if (!lightCanvas) lightCanvas = document.createElement('canvas')
  if (lightCanvas.width !== lw || lightCanvas.height !== lh) {
    lightCanvas.width = lw
    lightCanvas.height = lh
  }
  const lc = lightCanvas.getContext('2d')!
  lc.setTransform(1, 0, 0, 1, 0, 0)
  lc.clearRect(0, 0, lw, lh)
  const k = Z / LIGHT_RES
  lc.setTransform(k, 0, 0, k, -ox * k, -oy * k)
  // Only the part of the screen that actually has light in it gets blended
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y, r, col, a] of pool) {
    // Wide, soft pool on the ground + a tighter bloom at the source
    drawGlow(lc, x, y + 4, r * 1.6, col, a * 0.55)
    drawGlow(lc, x, y, r * 0.7, col, a * 0.7)
    const rr = r * 1.6
    x0 = Math.min(x0, x - rr); y0 = Math.min(y0, y - rr); x1 = Math.max(x1, x + rr); y1 = Math.max(y1, y + rr + 4)
  }
  const sx = Math.max(0, Math.floor((x0 - ox) * k)), sy = Math.max(0, Math.floor((y0 - oy) * k))
  const ex = Math.min(lw, Math.ceil((x1 - ox) * k)), ey = Math.min(lh, Math.ceil((y1 - oy) * k))
  if (ex <= sx || ey <= sy) return
  // Blend the light over the scene in one go (in screen space, smoothed)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(lightCanvas, sx, sy, ex - sx, ey - sy, sx * LIGHT_RES, sy * LIGHT_RES, (ex - sx) * LIGHT_RES, (ey - sy) * LIGHT_RES)
  ctx.restore()
}
