import './style.css'
import { ROSTER, TEAM_SIZE } from './data/pokemon'
import { TRAINERS, type TrainerDef } from './data/trainers'
import { Game } from './game/game'
import { render } from './game/render'
import { Hud } from './ui/hud'
import { clearScreen, showPartyFull, showResults, showRoster, showTitle, showTrainerSelect } from './ui/screens'

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
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
}
window.addEventListener('resize', resize)
resize()

function toTitle() {
  stopGame()
  showTitle(toTrainer)
}

function toTrainer() {
  showTrainerSelect(trainer.key, (t) => {
    trainer = t
    store.set('trainer', t.key)
    toRoster()
  })
}

function toRoster() {
  stopGame()
  showRoster(team, toTrainer, (picked) => {
    team = picked
    store.set('team', picked)
    startGame()
  })
}

function startGame() {
  clearScreen()
  if (team.length !== TEAM_SIZE) return toRoster()
  game = new Game(trainer, team, {
    toast: (t, c) => hud?.toast(t, c),
    feed: (t) => hud?.feed(t),
    partyFull: (mon, choose) => showPartyFull(mon, game!.player.party, choose),
    end: (r) => {
      hud?.destroy()
      hud = null
      showResults(r, startGame, toRoster)
    },
  })
  hud = new Hud(hudRoot, game)
  hud.toast('Overleef! Versla wilde Pokémon om sneller te levelen', '#80c0ff')
}

function stopGame() {
  hud?.destroy()
  hud = null
  game = null
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

// Keyboard for desktop play
const keys = new Set<string>()
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase())
  if (!game || !hud) return
  const g = game, p = g.player
  const k = e.key.toLowerCase()
  const slot = ['j', 'k', 'l', ';'].indexOf(k) >= 0 ? ['j', 'k', 'l', ';'].indexOf(k) : ['1', '2', '3', '4'].indexOf(k)
  if (slot >= 0) g.held[slot] = true
  if (k === 'q') {
    for (let i = 1; i <= p.party.length; i++) if (g.switchTo(p, (p.active + i) % p.party.length)) break
  }
  if (k === 'e' || k === ' ') {
    const w = g.catchable(p)
    if (w) g.throwBall(p, w, false)
  }
  if (k === 'm') hud.useItem('master')
  if (k === 'r') hud.useItem('potion')
  if (k === 'f') hud.useItem('revive')
})
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase()
  keys.delete(k)
  if (!game) return
  const slot = ['j', 'k', 'l', ';'].indexOf(k) >= 0 ? ['j', 'k', 'l', ';'].indexOf(k) : ['1', '2', '3', '4'].indexOf(k)
  if (slot >= 0) game.held[slot] = false
})
window.addEventListener('blur', () => {
  keys.clear()
  if (game) game.held.fill(false)
})

function keyboardMove(g: Game) {
  let x = 0, y = 0
  if (keys.has('a') || keys.has('arrowleft')) x--
  if (keys.has('d') || keys.has('arrowright')) x++
  if (keys.has('w') || keys.has('arrowup')) y--
  if (keys.has('s') || keys.has('arrowdown')) y++
  if (x || y) {
    const l = Math.hypot(x, y)
    g.input.mx = x / l
    g.input.my = y / l
    usingKeys = true
  } else if (usingKeys) {
    g.input.mx = g.input.my = 0
    usingKeys = false
  }
}
let usingKeys = false

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (game) {
    keyboardMove(game)
    game.update(dt)
    render(game, ctx, canvas.width, canvas.height)
    hud?.update()
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Handy for debugging from the console.
;(window as unknown as { battlemon: unknown }).battlemon = { get game() { return game } }

toTitle()
