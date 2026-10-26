import { spriteUrl } from '../data/pokemon'
import { TRAINERS } from '../data/trainers'
import { cry, sfx } from '../audio'
import { playMusic } from '../music'
import type { GameResult } from '../game/game'
import { BOSSES } from '../data/bosses'
import { boardList } from './scoreboard'
import { L } from '../i18n'
import type { Reward } from '../progress'
import { rewardsHtml, runRewards } from './rewards'
import { appEsc as esc, IC, icon, teamStage } from './app'
import { askAfterWin, showSupport } from './support'
import { showFeedback } from './feedback'

/** End-of-match screen: where you placed, your team, counted stats, rewards and the scoreboard. */
export interface ResultAction {
  label: string
  run: () => void
  /** An icon from IC (the big button gets an arrow when it has none). */
  icon?: string
}

/** Each mode's colour, as on its cards in the menu. */
export const MODE_RGB = { royale: '255, 170, 40', duel: '80, 145, 255', raid: '255, 64, 88' } as const

type Tab = 'mine' | 'rw' | 'board'
/** Wide screens show your match on the left at all times; the tabs on the right switch between rewards and the scoreboard. */
const wide = matchMedia('(min-width: 1000px)')

/** Buttons under the results (and under the final standings). */
export function actionsHtml(main: ResultAction, more: ResultAction[]) {
  return `
    <div class="nr-actions">
      <button class="n-btn nr-main" data-a="0">${esc(main.label)}${icon(main.icon ?? IC.next, 20)}</button>
      ${more.length ? `<div class="nr-more">${more.map((a, i) => `<button class="n-btn3" data-a="${i + 1}">${a.icon ? icon(a.icon, 16) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`
}

export function bindActions(el: HTMLElement, actions: ResultAction[]) {
  el.querySelectorAll<HTMLElement>('.nr-actions [data-a]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      actions[Number(b.dataset.a)].run()
    }),
  )
}

/** `main` is the big button; `more` are the smaller ones below it (e.g. other team, main menu). */
export function showResults(r: GameResult, trainerSprite: string, main: ResultAction, more: ResultAction[], reward?: Promise<Reward | null>) {
  const el = document.getElementById('screen')!
  const boss = r.raid ? BOSSES[r.raid.boss] : null
  const duel = r.duel
  const kind = duel ? 'duel' : boss ? 'raid' : 'royale'
  const trainer = TRAINERS.find((t) => t.sprite === trainerSprite) ?? TRAINERS[0]
  const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`

  // What you got: the big badge, a kicker above the title, the title and a line under it
  const badge = duel
    ? `<div class="nr-badge"><b>${duel.mine}<i>–</i>${duel.theirs}</b></div>`
    : boss
      ? `<div class="nr-badge nr-boss"><img class="px" src="${spriteUrl(boss.species)}" alt=""></div>`
      : `<div class="nr-badge"><b>#${r.place}</b></div>`
  const kicker = duel
    ? r.won ? L('Victory', 'Gewonnen') : L('Defeat', 'Verloren')
    : boss
      ? 'Raid'
      : r.won ? L('Winner', 'Winnaar') : L('Place', 'Plaats')
  const title = duel
    ? r.won ? L('Duel won!', 'Duel gewonnen!') : L('Duel lost', 'Duel verloren')
    : boss
      ? r.won ? L('Raid cleared!', 'Raid geslaagd!') : L('Raid failed', 'Raid mislukt')
      : r.won ? L('Arena champion!', 'Kampioen van de arena!') : r.place <= 3 ? L('So close! Top 3', 'Bijna! Top 3') : L('Knocked out', 'Uitgeschakeld')
  const sub = duel
    ? L(`1 vs 1 against ${esc(duel.opp)}`, `1 tegen 1 tegen ${esc(duel.opp)}`)
    : boss
      ? r.won ? L(`${boss.name} is defeated`, `${boss.name} is verslagen`) : L(`${boss.name} was too strong… try again`, `${boss.name} was te sterk… probeer het nog eens`)
      : L(`out of ${r.total} trainers`, `van de ${r.total} trainers`)
  const stat = (n: number, label: string, fmt = '') => `<div class="nr-stat"><b data-n="${n}" ${fmt ? `data-fmt="${fmt}"` : ''}>0</b><span>${label}</span></div>`
  const stats = duel
    ? stat(Math.floor(r.time), L('Time', 'Tijd'), 'time') + stat(duel.mine, L('Rounds won', 'Rondes gewonnen')) + stat(duel.dmg, L('Damage', 'Schade'))
    : r.raid
      ? stat(Math.floor(r.time), L('Time', 'Tijd'), 'time') + stat(r.raid.dmg, `${L('Damage', 'Schade')} · ${r.raid.share}%`) + stat(r.raid.lives, L('Lives left', 'Levens over'))
      : stat(Math.floor(r.time), L('Survived', 'Overleefd'), 'time') + stat(r.kos, L("Trainers K.O.'d", 'Trainers K.O.')) + stat(r.caught, L('Caught', 'Gevangen'))

  const tabs: [Tab, string][] = [['mine', L('Your match', 'Jouw potje')], ...(reward ? [['rw', L('Rewards', 'Beloningen')] as [Tab, string]] : []), ['board', L('Scoreboard', 'Scorebord')]]
  el.innerHTML = `
    <div class="nres nres-${kind} ${r.won ? 'won' : ''}" style="--mc:${r.won && kind === 'royale' ? '255, 214, 10' : MODE_RGB[kind]}">
      <canvas class="confetti"></canvas>
      <div class="nr-glow"></div>
      <div class="nr-shell">
        <div class="n-seg nr-tabs" role="tablist">${tabs.map(([t, label]) => `<button role="tab" data-tab="${t}">${label}</button>`).join('')}</div>
        <section class="nr-hero" data-pane="mine">
          <header class="nr-head">
            ${badge}
            <div class="nr-headtxt"><span class="n-label">${kicker}</span><h1>${title}</h1><p>${sub}</p></div>
          </header>
          <div class="nr-stage">${teamStage(trainer, r.best.species.id, !!r.best.shiny)}</div>
          <div class="nr-best"><b>${esc(r.best.name)}</b><span>Lv ${r.best.level}</span></div>
          <div class="nr-stats">${stats}</div>
          ${reward ? rewardsHtml() : ''}
          ${r.won && askAfterWin() ? `<button class="nr-support">♥ ${L('Enjoying it? Support the game', 'Plezier gehad? Steun de game')}</button>` : ''}
          <button class="nr-feedback">💬 ${L('Send feedback', 'Feedback sturen')}</button>
        </section>
        <section class="nr-pane" data-pane="rw"></section>
        <section class="nr-pane" data-pane="board">
          <div class="nr-panehead"><b>${r.final ? L('Final standings', 'Eindstand') : L('Standings so far', 'Tussenstand')}</b><small>${r.final ? (boss ? L('Who dealt the most damage?', 'Wie deed de meeste schade?') : '') : L('the match is still going', 'het potje loopt nog')}</small></div>
          ${boardList(r.board, !!r.raid, r.me)}
        </section>
        ${actionsHtml(main, more)}
      </div>
    </div>`
  const root = el.querySelector('.nres') as HTMLElement
  playMusic(r.won ? 'victory' : 'defeat')
  setTimeout(() => cry(r.best.species.id, 0.3), 600)
  // The badge lands with a ding (higher for a better place)
  setTimeout(() => sfx.medal(r.raid || r.duel ? (r.won ? 1 : 0) : r.place), 350)

  // Count the stats up
  el.querySelectorAll<HTMLElement>('.nr-stat b').forEach((b, i) => {
    const target = Number(b.dataset.n)
    const t0 = performance.now() + 500 + i * 250
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 900))
      const v = Math.round(target * (1 - Math.pow(1 - k, 3)))
      const text = b.dataset.fmt === 'time' ? time(v) : `${v}`
      if (text !== b.textContent && k > 0 && k < 1) sfx.tick()
      b.textContent = text
      if (k < 1) requestAnimationFrame(tick)
      else if (target > 0) sfx.blip()
    }
    requestAnimationFrame(tick)
  })

  el.querySelector('.nr-feedback')?.addEventListener('click', () => {
    sfx.select()
    showFeedback({ mode: kind === 'royale' ? 'br' : kind, result: kind === 'raid' ? (r.won ? 'clear' : 'fail') : r.won ? 'win' : 'lose' })
  })
  el.querySelector('.nr-support')?.addEventListener('click', () => {
    sfx.select()
    showSupport()
  })
  if (r.won) confetti(el.querySelector('.confetti') as HTMLCanvasElement, `rgb(${MODE_RGB[kind]})`)

  // Tabs. On a wide screen your match stays on the left, so the right side starts on the rewards
  const has = (t: Tab) => !!el.querySelector(`.nr-tabs [data-tab="${t}"]:not(.hidden)`)
  const show = (t: Tab) => {
    if (wide.matches && t === 'mine') t = has('rw') ? 'rw' : 'board'
    root.dataset.tab = t
    el.querySelectorAll<HTMLElement>('.nr-tabs [data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === t)
      b.setAttribute('aria-selected', String(b.dataset.tab === t))
    })
  }
  el.querySelectorAll<HTMLElement>('.nr-tabs [data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      show(b.dataset.tab as Tab)
    }),
  )
  show('mine')
  const resized = () => (root.isConnected ? show(root.dataset.tab as Tab) : wide.removeEventListener('change', resized))
  wide.addEventListener('change', resized)

  if (reward) runRewards(el, reward, () => show('rw'), () => root.dataset.tab === 'rw' && show('board'))

  bindActions(el, [main, ...more])
}

/** Confetti for winners, in gold, white and the mode's colour. */
function confetti(c: HTMLCanvasElement, accent: string) {
  const g = c.getContext('2d')!
  c.width = innerWidth
  c.height = innerHeight
  const cols = ['#ffd60a', '#ffffff', accent, '#ffd60a', '#f5f5f7']
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * c.width, y: -Math.random() * c.height, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, w: 4 + Math.random() * 5, h: 6 + Math.random() * 8, col: cols[Math.floor(Math.random() * cols.length)],
  }))
  let last = performance.now()
  const loop = (now: number) => {
    if (!c.isConnected) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    g.clearRect(0, 0, c.width, c.height)
    for (const b of bits) {
      b.x += (b.vx + Math.sin(now / 400 + b.r) * 30) * dt
      b.y += b.vy * dt
      b.r += b.vr * dt
      if (b.y > c.height + 20) {
        b.y = -20
        b.x = Math.random() * c.width
      }
      g.save()
      g.translate(b.x, b.y)
      g.rotate(b.r)
      g.scale(1, Math.cos(b.r * 2))
      g.fillStyle = b.col
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      g.restore()
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
