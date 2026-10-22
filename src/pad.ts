import type { Game } from './game/game'
import type { Hud } from './ui/hud'
import { sfx } from './audio'
import { L } from './i18n'

/**
 * Controllers (handhelds like the AYN Thor, or a pad on a PC), through the
 * Gamepad API with the standard (Xbox-style) layout.
 *
 * In a match: left stick (or nothing else) walks, right stick aims (let go and
 * attacks aim themselves), A / X / Y are moves 1-3, RT or RB the ultimate,
 * B catches, LB switches Pokémon, the D-pad uses items (← Master Ball,
 * ↑ Potion, → Revive), Start pauses, Select shows the scoreboard and LT opens
 * the chat.
 *
 * Everywhere else (menus, lobby, results, pop-ups, the chat): the D-pad or the
 * left stick moves between buttons, A presses, B goes back, LB / RB switch tabs.
 */

/** Standard mapping button indices. */
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const

export interface PadHooks {
  /** The match you're playing right now (not watching, not in a menu), or null. */
  control(): { g: Game; hud: Hud } | null
  pause(): void
  board(): void
  chat(): boolean
}

const DEAD = 0.22
/** Stick with a radial dead zone, rescaled so it starts from 0 just outside it. */
function stick(x: number, y: number): [number, number, number] {
  const m = Math.hypot(x, y)
  if (m < DEAD) return [0, 0, 0]
  const k = Math.min(1, (m - DEAD) / (1 - DEAD))
  return [(x / m) * k, (y / m) * k, k]
}

let prev: boolean[] = []
let walking = false
let aiming = false
let held = [false, false, false, false]
/** Menu navigation: direction held and when it repeats. */
let navDir = ''
let navNext = 0
let usingPad = false

function pads() {
  return [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p && p.connected)
}

/** Call once per frame. */
export function padTick(hooks: PadHooks) {
  const list = pads()
  if (!list.length) return
  // Several pads (or a handheld's built-in one plus a USB one): any of them counts
  const down: boolean[] = []
  let lx = 0, ly = 0, rx = 0, ry = 0
  for (const p of list) {
    p.buttons.forEach((b, i) => (down[i] = down[i] || b.pressed || b.value > 0.5))
    const [ax, ay] = stick(p.axes[0] ?? 0, p.axes[1] ?? 0)
    if (Math.hypot(ax, ay) > Math.hypot(lx, ly)) [lx, ly] = [ax, ay]
    const [bx, by] = stick(p.axes[2] ?? 0, p.axes[3] ?? 0)
    if (Math.hypot(bx, by) > Math.hypot(rx, ry)) [rx, ry] = [bx, by]
  }
  const pressed = (i: number) => !!down[i] && !prev[i]
  const released = (i: number) => !down[i] && !!prev[i]
  if (down.some(Boolean) || lx || ly || rx || ry) markPad()

  const c = hooks.control()
  if (c && !uiOpen()) playTick(c.g, c.hud, hooks, lx, ly, rx, ry, pressed, released)
  else {
    if (c) letGo(c.g)
    navTick(lx, ly, down, pressed)
  }
  prev = down
}

// ---------------------------------------------------------------- in a match

const ATTACKS: [number, number][] = [[B.A, 0], [B.X, 1], [B.Y, 2], [B.RT, 3], [B.RB, 3]]

function playTick(g: Game, hud: Hud, hooks: PadHooks, lx: number, ly: number, rx: number, ry: number, pressed: (i: number) => boolean, released: (i: number) => boolean) {
  const p = g.player
  // Walking (the keyboard and the touch stick keep working when the stick is idle)
  if (lx || ly) {
    g.input.mx = lx
    g.input.my = ly
    walking = true
  } else if (walking) {
    g.input.mx = g.input.my = 0
    walking = false
  }
  // Aiming: a point a few tiles out in the stick's direction
  const am = Math.hypot(rx, ry)
  if (am > 0.35 && p.mon) {
    g.aimAt = { x: p.mon.x + (rx / am) * 5, y: p.mon.y - 0.3 + (ry / am) * 5 }
    aiming = true
  } else if (aiming) {
    g.aimAt = null
    aiming = false
  }
  // Moves: fire on press, keep firing while held
  const now = [false, false, false, false]
  for (const [btn, slot] of ATTACKS) {
    if (pressed(btn) && !g.paused && p.alive && g.introT <= 0) {
      if (!g.useMove(p.mon, slot, undefined, g.cursorDir(p.mon)) && (p.mon.cds[slot] > 0 || !p.mon.unlocked(slot))) sfx.denied()
    }
  }
  for (const [btn, slot] of ATTACKS) if (prev[btn] || pressed(btn)) now[slot] = now[slot] || !released(btn)
  for (let s = 0; s < 4; s++) {
    if (now[s] !== held[s]) g.held[s] = now[s]
    held[s] = now[s]
  }
  if (g.paused) return
  if (pressed(B.B)) {
    const w = g.catchable(p)
    if (w) g.throwBall(p, w, false)
  }
  if (pressed(B.LB)) {
    for (let i = 1; i <= p.party.length; i++) if (g.switchTo(p, (p.active + i) % p.party.length)) break
  }
  if (pressed(B.LEFT)) hud.useItem('master')
  if (pressed(B.UP)) hud.useItem('potion')
  if (pressed(B.RIGHT)) hud.useItem('revive')
  if (pressed(B.SELECT) || pressed(B.DOWN)) hooks.board()
  if (pressed(B.START)) {
    letGo(g)
    hooks.pause()
  }
  if (pressed(B.LT) && hooks.chat()) letGo(g)
}

/** Stop walking and firing (a menu or the chat opened over the match). */
function letGo(g: Game) {
  if (walking) g.input.mx = g.input.my = 0
  if (aiming) g.aimAt = null
  for (let s = 0; s < 4; s++) if (held[s]) g.held[s] = false
  walking = aiming = false
  held = [false, false, false, false]
}

// ---------------------------------------------------------------- menus

/** Something over the match that needs the buttons: a pop-up, a screen, the loading splash, the chat. */
function uiOpen() {
  return !!document.querySelector('#modal:not(.hidden), .n-sheet, .nld, #screen > *, .hchat.open, .sb-live-panel:not(.hidden)')
}

/** Where the buttons are: the top-most layer that's open. */
function scope(): HTMLElement {
  const pick = (sel: string) => {
    const all = [...document.querySelectorAll<HTMLElement>(sel)].filter(visible)
    return all[all.length - 1]
  }
  return (
    pick('#modal:not(.hidden)') ??
    pick('.nrw-pop') ??
    pick('.n-sheet') ??
    pick('.nld') ??
    pick('.hchat.open') ??
    pick('.sb-live-panel:not(.hidden)') ??
    ((document.getElementById('screen')?.children.length ? document.getElementById('screen') : document.getElementById('hud')) as HTMLElement)
  )
}

function visible(el: HTMLElement) {
  if (el.closest('.hidden')) return false
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  const s = getComputedStyle(el)
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], .title2'

function candidates(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => visible(el) && !el.closest('[inert]'))
}

function center(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }
}

/** The closest button in a direction, preferring ones straight ahead. */
function nearest(from: HTMLElement, all: HTMLElement[], dir: string) {
  const a = center(from)
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of all) {
    if (el === from || el.contains(from) || from.contains(el)) continue
    const b = center(el)
    const dx = b.x - a.x, dy = b.y - a.y
    // Edges, so long buttons next to each other still count as "to the right"
    const ahead = dir === 'right' ? b.r.left - a.r.right + 1 : dir === 'left' ? a.r.left - b.r.right + 1 : dir === 'down' ? b.r.top - a.r.bottom + 1 : a.r.top - b.r.bottom + 1
    const main = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    if (main <= 0 || ahead < -Math.min(a.r.width, a.r.height) / 2) continue
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = Math.max(0, ahead) + side * 2.2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** The button to start on: the big call to action, else the first one. */
function first(all: HTMLElement[]) {
  return all.find((el) => el.matches('.title2, .ld-go, .nr-main, .n-go, .lb-start, #stay, .n-btn')) ?? all[0]
}

function navTick(lx: number, ly: number, down: boolean[], pressed: (i: number) => boolean) {
  const root = scope()
  if (!root) return
  const all = candidates(root)
  if (!all.length) return
  const cur = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) && document.activeElement !== root ? document.activeElement : null
  const typing = cur instanceof HTMLInputElement || cur instanceof HTMLTextAreaElement

  // Directions, with a repeat while held
  const dir = down[B.UP] || ly < -0.6 ? 'up' : down[B.DOWN] || ly > 0.6 ? 'down' : down[B.LEFT] || lx < -0.6 ? 'left' : down[B.RIGHT] || lx > 0.6 ? 'right' : ''
  const t = performance.now()
  if (dir && (dir !== navDir || t >= navNext)) {
    navNext = t + (dir !== navDir ? 380 : 130)
    navDir = dir
    // In a text field left and right move the caret; up and down leave it
    if (!(typing && (dir === 'left' || dir === 'right'))) {
      const next = cur ? nearest(cur, all, dir) : first(all)
      if (next) {
        focusEl(next)
        sfx.tick()
      }
    }
  } else if (!dir) navDir = ''

  if (pressed(B.A)) {
    const el = cur ?? first(all)
    if (el) {
      if (!cur) focusEl(el)
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        // A on a text field opens the keyboard; on a filled-in one it sends the form
        if (cur && el.value && el.form) el.form.requestSubmit()
        else el.focus()
      } else el.click()
    }
  }
  if (pressed(B.B)) back(root, cur)
  if (pressed(B.LB) || pressed(B.RB)) switchTab(root, pressed(B.RB) ? 1 : -1)
  if (pressed(B.START)) {
    const go = all.find((el) => el.matches('.ld-go, .nr-main, .lb-start, .n-go, .title2'))
    go?.click()
  }
}

/** B: close what's open, else go back a screen. */
function back(root: HTMLElement, cur: HTMLElement | null) {
  if (cur instanceof HTMLInputElement || cur instanceof HTMLTextAreaElement) {
    // Leaving a text field (the chat closes itself on Escape)
    cur.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    cur.blur()
    return
  }
  const close = [...root.querySelectorAll<HTMLElement>('#stay, .sheet-x, .n-x, .sb-close, [data-act="back"], [data-act="close"], .n-backpill, .nl-leave, .nrw-pop')].find(visible)
  if (close) {
    close.click()
    return
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

/** LB / RB: the previous or next tab (bottom bar or rail, or tabs on the screen). */
function switchTab(root: HTMLElement, d: number) {
  for (const sel of ['.nr-tabs [data-tab]', '.n-seg [data-opt]', '.n-nav .n-tab']) {
    const tabs = [...root.querySelectorAll<HTMLElement>(sel)].filter(visible)
    if (tabs.length < 2) continue
    const i = tabs.findIndex((t) => t.classList.contains('on') || t.getAttribute('aria-selected') === 'true' || t.getAttribute('aria-current') === 'page')
    const next = tabs[(Math.max(0, i) + d + tabs.length) % tabs.length]
    next.click()
    // The screen may have been redrawn: put focus back on the new tab
    requestAnimationFrame(() => {
      const again = [...document.querySelectorAll<HTMLElement>(sel)].find((t) => t.classList.contains('on') || t.getAttribute('aria-current') === 'page')
      again?.focus({ preventScroll: true })
    })
    return
  }
}

// ---------------------------------------------------------------- hints

/** Using a pad: show its buttons on the HUD and a clear focus ring in menus; a mouse or touch turns that off. */
function markPad() {
  if (usingPad) return
  usingPad = true
  document.body.classList.add('pad')
}
for (const ev of ['pointerdown', 'keydown'] as const)
  window.addEventListener(ev, () => {
    if (!usingPad) return
    usingPad = false
    document.body.classList.remove('pad')
  }, { capture: true, passive: true })

addEventListener('gamepadconnected', (e) => {
  const name = ((e as GamepadEvent).gamepad?.id ?? '').replace(/\s*\(.*$/, '').slice(0, 40) || L('Controller', 'Controller')
  toast(L(`🎮 ${name} connected`, `🎮 ${name} verbonden`))
  markPad()
})
addEventListener('gamepaddisconnected', () => {
  toast(L('🎮 Controller disconnected', '🎮 Controller losgekoppeld'))
  if (!pads().length) {
    usingPad = false
    document.body.classList.remove('pad')
  }
})

function toast(text: string) {
  const el = document.createElement('div')
  el.className = 'pad-toast'
  el.textContent = text
  document.body.append(el)
  setTimeout(() => el.classList.add('out'), 2600)
  setTimeout(() => el.remove(), 3000)
}
