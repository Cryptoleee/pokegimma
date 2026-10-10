import { animatedUrl, spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { cry, sfx } from '../audio'
import { playMusic } from '../music'
import type { GameResult } from '../game/game'
import { BOSSES } from '../data/bosses'

/** End-of-match screen: placement badge, your trainer and best Pokémon, counted stats. */
export interface ResultAction {
  label: string
  run: () => void
}

/** `main` is the big button; `more` are the smaller ones below it (e.g. other team, main menu). */
export function showResults(r: GameResult, trainerSprite: string, main: ResultAction, more: ResultAction[]) {
  const el = document.getElementById('screen')!
  const tier = r.won ? 'gold' : r.place <= 3 ? 'silver' : 'bronze'
  const boss = r.raid ? BOSSES[r.raid.boss] : null
  el.innerHTML = `
    <div class="res ${r.won ? 'won' : ''}">
      <canvas class="confetti"></canvas>
      <div class="res-glow"></div>
      <div class="res-card">
        ${boss
          ? `<div class="medal raid ${r.won ? 'gold' : 'bronze'}" style="--c:${boss.color}"><img class="px" src="${spriteUrl(boss.species)}" alt=""></div>
        <div class="res-title">${r.won ? 'Raid geslaagd!' : 'Raid mislukt'}</div>
        <div class="res-sub">${r.won ? `${boss.name} is verslagen` : `${boss.name} was te sterk… probeer het nog eens`}</div>`
          : `<div class="medal ${tier}"><small>${r.won ? 'WINNAAR' : 'PLAATS'}</small><b>#${r.place}</b></div>
        <div class="res-title">${r.won ? 'Kampioen van de arena!' : r.place <= 3 ? 'Bijna! Top 3' : 'Uitgeschakeld'}</div>
        <div class="res-sub">van de ${r.total} trainers</div>`}
        <div class="res-stage">
          <img class="px res-tr" src="${trainerSpriteUrl(trainerSprite)}" alt="">
          <img class="px res-mon" src="${animatedUrl(r.best.species.id)}" onerror="this.onerror=null;this.src='${spriteUrl(r.best.species.id)}'" alt="">
          <div class="res-plat"></div>
        </div>
        <div class="res-best"><b>${r.best.name}</b> · Lv ${r.best.level}</div>
        <div class="res-stats">${r.raid
          ? `<div><b data-n="${Math.floor(r.time)}" data-fmt="time">0:00</b><span>Tijd</span></div>
          <div><b data-n="${r.raid.dmg}">0</b><span>Schade (${r.raid.share}%)</span></div>
          <div><b data-n="${r.raid.lives}">0</b><span>Levens over</span></div>`
          : `<div><b data-n="${Math.floor(r.time)}" data-fmt="time">0:00</b><span>Overleefd</span></div>
          <div><b data-n="${r.kos}">0</b><span>Trainers K.O.</span></div>
          <div><b data-n="${r.caught}">0</b><span>Gevangen</span></div>`}
        </div>
        <div class="res-actions">
          <button class="cta" data-a="0">${main.label}</button>
          <div class="res-more">${more.map((a, i) => `<button class="ghost2" data-a="${i + 1}">${a.label}</button>`).join('')}</div>
        </div>
      </div>
    </div>`
  playMusic(r.won ? 'victory' : 'defeat')
  setTimeout(() => cry(r.best.species.id, 0.3), 600)

  // Count the stats up
  el.querySelectorAll<HTMLElement>('.res-stats b').forEach((b, i) => {
    const target = Number(b.dataset.n)
    const t0 = performance.now() + 500 + i * 250
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 900))
      const v = Math.round(target * (1 - Math.pow(1 - k, 3)))
      b.textContent = b.dataset.fmt === 'time' ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v}`
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

  const actions = [main, ...more]
  el.querySelectorAll<HTMLElement>('.res-actions [data-a]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      actions[Number(b.dataset.a)].run()
    }),
  )
}
