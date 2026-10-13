import type { Game } from './game'
import { BOSSES, type PhaseLook } from '../data/bosses'
import { ENRAGE_TIME } from './boss'

/**
 * How a raid feels per phase, drawn on every screen from the synced phase only
 * (no extra network): the phase-change cinematic (darken, roar, form change on a
 * flash, shockwave), a colour grade and pulsing edge, and arena escalation
 * (heat, whiteout, storm, gale, warp).
 */

interface PhaseState {
  /** Phase the cinematic is heading to. */
  phase: number
  /** g.time the phase changed (-1: no cinematic). */
  at: number
  /** The flash has gone off (form change). */
  flashed: boolean
}
const states = new WeakMap<Game, PhaseState>()

/** Share of the cinematic at which the form changes (with a flash and shockwave). */
export const SWAP_AT = 0.42

function stateOf(g: Game): PhaseState {
  let s = states.get(g)
  const phase = g.raidView?.phase ?? 0
  if (!s) {
    s = { phase, at: -1, flashed: true }
    states.set(g, s)
  }
  if (phase > s.phase) {
    s.phase = phase
    s.at = g.time
    s.flashed = false
  }
  return s
}

/** Progress of the phase-change cinematic (0..1), or -1 when none is playing. */
export function cinematic(g: Game): number {
  if (g.kind !== 'raid') return -1
  const s = stateOf(g)
  if (s.at < 0) return -1
  const k = (g.time - s.at) / ENRAGE_TIME
  return k >= 0 && k < 1 ? k : -1
}

/** Phase as shown: the new form appears on the flash, not before. */
export function shownPhase(g: Game): number {
  const s = stateOf(g)
  const k = cinematic(g)
  return k >= 0 && k < SWAP_AT ? s.phase - 1 : s.phase
}

export function phaseLook(g: Game): PhaseLook | null {
  if (g.kind !== 'raid' || !g.setup.boss) return null
  return BOSSES[g.setup.boss].looks[shownPhase(g)]
}

/** World-space part of the cinematic: the flash, shockwave and shake when the form changes. */
export function updateCinematic(g: Game) {
  const k = cinematic(g)
  const s = states.get(g)
  if (!s || k < 0 || s.flashed || k < SWAP_AT) return
  s.flashed = true
  const boss = g.wilds.find((w) => w.boss)
  const look = phaseLook(g)
  const col = look?.aura ?? '#ffffff'
  // Every screen plays this itself: don't also send it over the network
  g.vfxMute++
  if (boss) {
    for (let i = 0; i < 3; i++) g.vfx.ring(boss.x, boss.y, 5 + i * 3.5, col, 0.6 + i * 0.15, 8 - i * 2)
    g.vfx.glow(boss.x, boss.y - 1, 140, col, 0.9)
    g.vfx.burst(boss.x, boss.y - 1.2, { n: 40, speed: 9, cols: [col, '#ffffff'], shape: 'star', add: true, s0: 6, s1: 1, life: 0.9 })
  }
  g.vfx.flash(0.9, '255,255,255')
  g.vfx.shakeBy(14)
  g.vfxMute--
}

// ---------------- Screen-space overlays ----------------

const edgeCache = new Map<string, HTMLCanvasElement>()
/** A soft coloured frame around the screen (cached per colour). */
function edge(col: string) {
  let c = edgeCache.get(col)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')!
  const gr = x.createRadialGradient(64, 64, 34, 64, 64, 92)
  gr.addColorStop(0, 'rgba(0,0,0,0)')
  gr.addColorStop(1, col)
  x.fillStyle = gr
  x.fillRect(0, 0, 128, 128)
  edgeCache.set(col, c)
  return c
}

const streaks = Array.from({ length: 16 }, (_, i) => ({ y: (i * 0.618) % 1, s: 0.6 + ((i * 0.37) % 1), l: 0.15 + ((i * 0.53) % 1) * 0.25 }))

/** Phase mood over the whole screen, plus the cinematic darkening. Call in screen space. */
export function drawPhaseScreen(g: Game, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  const look = phaseLook(g)
  if (!look) return
  const t = g.time
  const ph = shownPhase(g)
  ctx.save()
  if (look.grade) {
    ctx.fillStyle = look.grade
    ctx.fillRect(0, 0, cw, ch)
  }
  // Danger pulse at the edges: a heartbeat in the final phase
  if (look.edge) {
    const beat = ph >= 2 ? Math.pow(Math.max(0, Math.sin(t * 7.5)), 6) * 0.5 + 0.5 : 0.5 + 0.2 * Math.sin(t * 2)
    ctx.globalAlpha = (ph >= 2 ? 0.75 : 0.45) * beat
    ctx.drawImage(edge(look.edge), -cw * 0.05, -ch * 0.05, cw * 1.1, ch * 1.1)
    ctx.globalAlpha = 1
  }
  switch (look.fx) {
    case 'heat': {
      // Heat rising off the floor
      const gr = ctx.createLinearGradient(0, ch, 0, ch * 0.55)
      const a = (ph >= 2 ? 0.22 : 0.14) * (0.7 + 0.3 * Math.sin(t * 3))
      gr.addColorStop(0, hexA(look.aura ?? look.edge, a))
      gr.addColorStop(1, hexA(look.aura ?? look.edge, 0))
      ctx.fillStyle = gr
      ctx.fillRect(0, ch * 0.55, cw, ch * 0.45)
      break
    }
    case 'whiteout': {
      // Blizzard gusts sweep the screen white
      const a = Math.max(0, Math.sin(t * 0.8)) ** 3 * (ph >= 2 ? 0.3 : 0.22)
      ctx.fillStyle = `rgba(235,245,255,${a})`
      ctx.fillRect(0, 0, cw, ch)
      break
    }
    case 'storm': {
      // Lightning lights up the sky now and then (more often in the final phase)
      const every = ph >= 2 ? 2.2 : 4.5
      const k = (t % every) / every
      const seed = Math.floor(t / every)
      if (k < 0.05) {
        const a = (1 - k / 0.05) * (ph >= 2 ? 0.4 : 0.28)
        ctx.fillStyle = `rgba(200,225,255,${a})`
        ctx.fillRect(0, 0, cw, ch)
        // A bolt across the top of the screen
        ctx.strokeStyle = `rgba(230,245,255,${Math.min(1, a * 2.4)})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        let x = ((seed * 0.731) % 1) * cw, y = 0
        ctx.moveTo(x, y)
        for (let i = 1; i <= 7; i++) {
          x += (((seed * 13 + i * 7) % 11) / 11 - 0.5) * cw * 0.12
          y = (i / 7) * ch * 0.45
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      break
    }
    case 'gale': {
      // Wind streaks racing across the screen
      ctx.strokeStyle = ph >= 2 ? 'rgba(255,240,180,0.22)' : 'rgba(255,255,255,0.16)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (const s of streaks) {
        const x = (((t * s.s * (ph >= 2 ? 1.3 : 0.9) + s.y * 3) % 1.4) - 0.2) * cw
        const y = s.y * ch
        ctx.moveTo(x, y)
        ctx.lineTo(x + s.l * cw, y + 2)
      }
      ctx.stroke()
      break
    }
    case 'warp': {
      // Reality bends: colour bands sweep over the screen, and it flickers now and then
      const y = ((t * 0.35) % 1.2 - 0.1) * ch
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = 'rgba(255,60,220,0.07)'
      ctx.fillRect(0, y, cw, ch * 0.08)
      ctx.fillStyle = 'rgba(60,220,255,0.07)'
      ctx.fillRect(0, ch - y, cw, ch * 0.06)
      ctx.globalCompositeOperation = 'source-over'
      if (ph >= 2 && t % 3.1 < 0.07) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fillRect(0, 0, cw, ch)
      }
      break
    }
  }
  // The cinematic: the world darkens around the boss, then lifts after the form change
  const k = cinematic(g)
  if (k >= 0) {
    const dark = k < SWAP_AT ? (k / SWAP_AT) * 0.5 : 0.5 * (1 - (k - SWAP_AT) / (1 - SWAP_AT))
    ctx.fillStyle = `rgba(0,0,10,${dark})`
    ctx.fillRect(0, 0, cw, ch)
    // Letterbox bars
    const bar = Math.min(1, Math.min(k, 1 - k) * 6) * ch * 0.07
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, cw, bar)
    ctx.fillRect(0, ch - bar, cw, bar)
  }
  ctx.restore()
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
