import './style.css'
import { ROSTER, TEAM_SIZE } from './data/pokemon'
import { TRAINERS, type TrainerDef } from './data/trainers'
import { Game, INTRO_TIME } from './game/game'
import { render, view } from './game/render'
import { TILE } from './game/world'
import { Hud } from './ui/hud'
import { clearScreen, showLeaveConfirm, showPartyFull } from './ui/screens'
import { showIntro } from './ui/intro'
import { showTitle } from './ui/title'
import { showRoster, showTrainerSelect } from './ui/select'
import { showResults } from './ui/results'
import { showEvolution } from './ui/cutscene'
import { wipe } from './ui/transition'
import { playMusic, setTempo } from './music'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudRoot = document.getElementById('hud')!

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`battlemon:${k}`)
      return v ? (JSON.parse(v) as T) : d
    } catch {
      return d
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`battlemon:${k}`, JSON.stringify(v))
    } catch {
      /* private mode */
    }
  },
}

let trainer: TrainerDef = TRAINERS.find((t) => t.key === store.get('trainer', '')) ?? TRAINERS[0]
let team: number[] = store.get<number[]>('team', []).filter((id) => ROSTER.includes(id))
let game: Game | null = null
let hud: Hud | null = null

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
}
window.addEventListener('resize', resize)
resize()

function toTitle() {
  stopGame()
  showTitle(() => showIntro(() => wipe(toTrainer)))
}

function toTrainer() {
  playMusic('menu')
  showTrainerSelect(
    trainer.key,
    () => wipe(toTitle),
    (t) => {
      trainer = t
      store.set('trainer', t.key)
      wipe(toRoster)
    },
  )
}

function toRoster() {
  stopGame()
  playMusic('menu')
  showRoster(
    team,
    () => wipe(toTrainer),
    (picked) => {
      team = picked
      store.set('team', picked)
      wipe(startGame, { flash: true })
    },
  )
}

function startGame() {
  clearScreen()
  stopGame()
  if (team.length !== TEAM_SIZE) return toRoster()
  playMusic('battle')
  game = new Game(trainer, team, {
    toast: (t, c) => hud?.toast(t, c),
    feed: (t, icon) => hud?.feed(t, icon),
    banner: (b) => hud?.banner(b),
    evolve: (from, to, shiny, done) => showEvolution(from, to, shiny, done),
    partyFull: (mon, choose) => showPartyFull(mon, game!.player.party, choose),
    end: (r) => {
      hud?.destroy()
      hud = null
      showResults(r, trainer.sprite, () => wipe(startGame, { flash: true }), () => wipe(toRoster))
    },
  })
  hud = new Hud(hudRoot, game, confirmLeave)
  if (desktop) setTimeout(() => hud?.toast('WASD of muis om te lopen · 1–4 aanvallen · Esc pauze'), INTRO_TIME * 1000 + 600)
  // Extra history entry so the phone's back button asks before leaving.
  history.pushState({ battlemon: 'game' }, '')
  guardActive = true
}

// ---------- Leaving a running match ----------

let guardActive = false
let confirming = false
const inMatch = () => !!game && !game.over

function confirmLeave() {
  if (!inMatch() || confirming) return
  const g = game!
  const wasPaused = g.paused
  g.paused = true
  g.held.fill(false)
  g.input.mx = g.input.my = 0
  confirming = true
  showLeaveConfirm(
    () => {
      confirming = false
      if (game === g) g.paused = wasPaused
    },
    () => {
      confirming = false
      leaveMatch()
    },
  )
}

function leaveMatch() {
  if (guardActive) {
    guardActive = false
    history.back()
  }
  wipe(toRoster)
}

window.addEventListener('popstate', () => {
  if (!guardActive) return
  if (inMatch()) {
    // Swallow the back press and ask first.
    history.pushState({ battlemon: 'game' }, '')
    confirmLeave()
  } else guardActive = false
})

window.addEventListener('beforeunload', (e) => {
  if (inMatch()) {
    e.preventDefault()
    e.returnValue = ''
  }
})

function stopGame() {
  hud?.destroy()
  hud = null
  game = null
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

// ---------- Desktop: keyboard + mouse ----------

/** Mouse/trackpad users get keyboard + mouse controls instead of the joystick. */
export const desktop = matchMedia('(pointer: fine)').matches
if (desktop) document.body.classList.add('desk')

const keys = new Set<string>()
const MOVE_KEYS = ['1', '2', '3', '4']
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  keys.add(k)
  if (e.key === 'Escape') return confirmLeave()
  if (!game || !hud || game.paused) return
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault()
  const g = game, p = g.player
  const slot = MOVE_KEYS.indexOf(k)
  if (slot >= 0) g.held[slot] = true
  if (k === 'q' && !e.repeat) {
    for (let i = 1; i <= p.party.length; i++) if (g.switchTo(p, (p.active + i) % p.party.length)) break
  }
  if ((k === 'e' || k === ' ') && !e.repeat) {
    const w = g.catchable(p)
    if (w) g.throwBall(p, w, false)
  }
  if (e.repeat) return
  if (k === '5' || k === 'm') hud.useItem('master')
  if (k === '6' || k === 'r') hud.useItem('potion')
  if (k === '7' || k === 'f') hud.useItem('revive')
})
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase()
  keys.delete(k)
  if (!game) return
  const slot = MOVE_KEYS.indexOf(k)
  if (slot >= 0) game.held[slot] = false
})
window.addEventListener('blur', () => {
  keys.clear()
  mouse.down = false
  if (game) game.held.fill(false)
})

// Hold the left mouse button to walk toward the cursor; attacks aim at the cursor.
const mouse = { x: 0, y: 0, down: false, inside: false }
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  mouse.down = true
  mouse.x = e.clientX
  mouse.y = e.clientY
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.down = false
})
canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX
  mouse.y = e.clientY
  mouse.inside = true
})
canvas.addEventListener('mouseleave', () => (mouse.inside = false))
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

function desktopInput(g: Game) {
  let x = 0, y = 0
  if (keys.has('a') || keys.has('arrowleft')) x--
  if (keys.has('d') || keys.has('arrowright')) x++
  if (keys.has('w') || keys.has('arrowup')) y--
  if (keys.has('s') || keys.has('arrowdown')) y++

  const dpr = canvas.width / innerWidth
  const wx = (mouse.x * dpr / view.Z + view.ox) / TILE
  const wy = (mouse.y * dpr / view.Z + view.oy) / TILE
  g.aimAt = desktop && (mouse.inside || mouse.down) ? { x: wx, y: wy } : null

  if (x || y) {
    const l = Math.hypot(x, y)
    g.input.mx = x / l
    g.input.my = y / l
    steering = true
  } else if (mouse.down && !g.paused) {
    const p = g.player
    const dx = wx - p.x, dy = wy - (p.y - 0.4)
    const d = Math.hypot(dx, dy)
    // Full speed when the cursor is a few tiles away, ease in close by
    const k = d < 0.35 ? 0 : Math.min(1, d / 2.5) / d
    g.input.mx = dx * k
    g.input.my = dy * k
    steering = true
  } else if (steering) {
    g.input.mx = g.input.my = 0
    steering = false
  }
}
let steering = false

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (game) {
    desktopInput(game)
    game.update(dt)
    setTempo(game.zone.phase >= 4 ? 1.12 : 1)
    render(game, ctx, canvas.width, canvas.height)
    hud?.update()
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Handy for debugging from the console.
;(window as unknown as { battlemon: unknown }).battlemon = { get game() { return game } }

toTitle()
