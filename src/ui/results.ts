import { animatedUrl, spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { cry, sfx } from '../audio'
import { playMusic } from '../music'
import type { GameResult } from '../game/game'
import { BOSSES } from '../data/bosses'
import { boardHtml } from './scoreboard'
import { L } from '../i18n'
import type { Reward } from '../progress'
import { rewardsHtml, runRewards } from './rewards'
import { esc } from './menu'

/** End-of-match screen: placement badge, your trainer and best Pokémon, counted stats. */
export interface ResultAction {
  label: string
  run: () => void
}

/** `main` is the big button; `more` are the smaller ones below it (e.g. other team, main menu). */
export function showResults(r: GameResult, trainerSprite: string, main: ResultAction, more: ResultAction[], reward?: Promise<Reward | null>) {
  const el = document.getElementById('screen')!
  const tier = r.won ? 'gold' : r.place <= 3 ? 'silver' : 'bronze'
  const boss = r.raid ? BOSSES[r.raid.boss] : null
  const duel = r.duel
  el.innerHTML = `
    <div class="res ${r.won ? 'won' : ''} ${reward ? 'has-rw' : ''}">
      <canvas class="confetti"></canvas>
      <div class="res-glow"></div>
      <div class="res-card">
        <div class="res-tabs"><button class="on" data-tab="mine">${L('Your match', 'Jouw potje')}</button>${reward ? `<button data-tab="rw">${L('Rewards', 'Beloningen')}</button>` : ''}<button data-tab="board">${L('Scoreboard', 'Scorebord')}</button></div>
        <div class="res-rw hidden"></div>
        <div class="res-board hidden">
          <div class="res-sub">${r.final ? L('Final standings', 'Eindstand') : L('Standings: the match is still going', 'Tussenstand: het potje loopt nog')}</div>
          <div class="sb-scroll">${boardHtml(r.board, !!r.raid, r.me)}</div>
        </div>
        <div class="res-mine">
        ${duel
          ? `<div class="medal duel ${r.won ? 'gold' : 'bronze'}"><small>${r.won ? L('VICTORY', 'GEWONNEN') : L('DEFEAT', 'VERLOREN')}</small><b>${duel.mine}-${duel.theirs}</b></div>
        <div class="res-title">${r.won ? L('Duel won!', 'Duel gewonnen!') : L('Duel lost', 'Duel verloren')}</div>
        <div class="res-sub">${L(`1 vs 1 against ${esc(duel.opp)}`, `1 tegen 1 tegen ${esc(duel.opp)}`)}</div>`
          : boss
          ? `<div class="medal raid ${r.won ? 'gold' : 'bronze'}" style="--c:${boss.color}"><img class="px" src="${spriteUrl(boss.species)}" alt=""></div>
        <div class="res-title">${r.won ? L('Raid cleared!', 'Raid geslaagd!') : L('Raid failed', 'Raid mislukt')}</div>
        <div class="res-sub">${r.won ? L(`${boss.name} is defeated`, `${boss.name} is verslagen`) : L(`${boss.name} was too strong… try again`, `${boss.name} was te sterk… probeer het nog eens`)}</div>`
          : `<div class="medal ${tier}"><small>${r.won ? L('WINNER', 'WINNAAR') : L('PLACE', 'PLAATS')}</small><b>#${r.place}</b></div>
        <div class="res-title">${r.won ? L('Arena champion!', 'Kampioen van de arena!') : r.place <= 3 ? L('So close! Top 3', 'Bijna! Top 3') : L('Knocked out', 'Uitgeschakeld')}</div>
        <div class="res-sub">${L(`out of ${r.total} trainers`, `van de ${r.total} trainers`)}</div>`}
        <div class="res-stage">
          <img class="px res-tr" src="${trainerSpriteUrl(trainerSprite)}" alt="">
          <img class="px res-mon" src="${animatedUrl(r.best.species.id)}" onerror="this.onerror=null;this.src='${spriteUrl(r.best.species.id)}'" alt="">
          <div class="res-plat"></div>
        </div>
        <div class="res-best"><b>${r.best.name}</b> · Lv ${r.best.level}</div>
        <div class="res-stats">${duel
          ? `<div><b data-n="${Math.floor(r.time)}" data-fmt="time">0:00</b><span>${L('Time', 'Tijd')}</span></div>
          <div><b data-n="${duel.mine}">0</b><span>${L('Rounds won', 'Rondes gewonnen')}</span></div>
          <div><b data-n="${duel.dmg}">0</b><span>${L('Damage', 'Schade')}</span></div>`
          : r.raid
          ? `<div><b data-n="${Math.floor(r.time)}" data-fmt="time">0:00</b><span>${L('Time', 'Tijd')}</span></div>
          <div><b data-n="${r.raid.dmg}">0</b><span>${L('Damage', 'Schade')} (${r.raid.share}%)</span></div>
          <div><b data-n="${r.raid.lives}">0</b><span>${L('Lives left', 'Levens over')}</span></div>`
          : `<div><b data-n="${Math.floor(r.time)}" data-fmt="time">0:00</b><span>${L('Survived', 'Overleefd')}</span></div>
          <div><b data-n="${r.kos}">0</b><span>${L("Trainers K.O.'d", 'Trainers K.O.')}</span></div>
          <div><b data-n="${r.caught}">0</b><span>${L('Caught', 'Gevangen')}</span></div>`}
        </div>
        ${reward ? rewardsHtml() : ''}
        </div>
        <div class="res-actions">
          <button class="cta" data-a="0">${main.label}</button>
          <div class="res-more">${more.map((a, i) => `<button class="ghost2" data-a="${i + 1}">${a.label}</button>`).join('')}</div>
        </div>
      </div>
    </div>`
  playMusic(r.won ? 'victory' : 'defeat')
  setTimeout(() => cry(r.best.species.id, 0.3), 600)
  // The medal lands with a ding (higher for a better place)
  setTimeout(() => sfx.medal(r.raid || r.duel ? (r.won ? 1 : 0) : r.place), 350)

  // Count the stats up
  el.querySelectorAll<HTMLElement>('.res-stats b').forEach((b, i) => {
    const target = Number(b.dataset.n)
    const t0 = performance.now() + 500 + i * 250
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 900))
      const v = Math.round(target * (1 - Math.pow(1 - k, 3)))
      const text = b.dataset.fmt === 'time' ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v}`
      if (text !== b.textContent && k > 0 && k < 1) sfx.tick()
      b.textContent = text
      if (k < 1) requestAnimationFrame(tick)
      else if (target > 0) sfx.blip()
    }
    requestAnimationFrame(tick)
  })

  // Confetti for winners
  if (r.won) {
    const c = el.querySelector('.confetti') as HTMLCanvasElement
    const g = c.getContext('2d')!
    c.width = innerWidth
    c.height = innerHeight
    const cols = ['#ffd84a', '#e83838', '#3870c8', '#58c040', '#f070b0', '#ffffff']
    const bits = Array.from({ length: 160 }, () => ({
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

  // Tabs: your match / the scoreboard
  el.querySelectorAll<HTMLElement>('.res-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      const tab = b.dataset.tab
      el.querySelectorAll('.res-tabs button').forEach((o) => o.classList.toggle('on', o === b))
      el.querySelector('.res-board')!.classList.toggle('hidden', tab !== 'board')
      el.querySelector('.res-rw')?.classList.toggle('hidden', tab !== 'rw')
      el.querySelector('.res-mine')!.classList.toggle('hidden', tab !== 'mine')
      el.querySelector('.res-card')!.classList.toggle('wide', tab === 'board')
    }),
  )

  if (reward) runRewards(el, reward, () => (el.querySelector('.res-tabs [data-tab="rw"]') as HTMLElement | null)?.click())

  const actions = [main, ...more]
  el.querySelectorAll<HTMLElement>('.res-actions [data-a]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      actions[Number(b.dataset.a)].run()
    }),
  )
}
