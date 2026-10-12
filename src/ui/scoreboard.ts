import { spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { sfx } from '../audio'
import type { Game } from '../game/game'
import { decided, scoreRows, type ScoreRow } from '../game/score'
import { L } from '../i18n'

/**
 * The match scoreboard: a table of every trainer. Shown live during a match
 * (🏆 button or Tab), on the results screen, and as the final standings when
 * you watched a match to the end.
 */

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`

export function boardHtml(rows: ScoreRow[], raid: boolean, me: number) {
  const multi = rows.filter((r) => r.human).length > 1
  const dmg = L('Damage', 'Schade')
  const head = raid
    ? `<th>#</th><th>Trainer</th><th>Pokémon</th><th>${dmg}</th><th>${L('Lives', 'Levens')}</th>`
    : `<th>#</th><th>Trainer</th><th>Pokémon</th><th>K.O.</th><th>${dmg}</th><th class="opt">${L('Caught', 'Gevangen')}</th><th class="opt">${L('Time', 'Tijd')}</th>`
  const body = rows
    .map((r, i) => {
      const rank = raid ? `${i + 1}` : r.place ? `#${r.place}` : `<span class="sb-live" title="${L('Still in the game', 'Nog in het spel')}">●</span>${i + 1}`
      const tag = r.id === me ? `<em class="sb-me">${L('you', 'jij')}</em>` : multi && r.human ? `<em class="sb-human">${L('player', 'speler')}</em>` : ''
      const mon = r.mon ? `<img class="px" src="${spriteUrl(r.mon, { shiny: r.shiny })}" alt=""><small>Lv ${r.lv}</small>` : ''
      const out = raid ? r.lives <= 0 && !r.alive : !r.alive
      return `<tr class="${r.id === me ? 'me' : ''} ${out ? 'out' : ''} ${!raid && r.place === 1 ? 'win' : ''}">
        <td class="sb-rank">${rank}</td>
        <td><div class="sb-tr"><img class="px" src="${trainerSpriteUrl(r.sprite)}" alt=""><span>${r.name}</span>${tag}</div></td>
        <td><div class="sb-mon">${mon}</div></td>
        ${raid
          ? `<td><b>${r.bossDmg}</b> <small class="sb-share">${r.share}%</small></td><td>${'♥'.repeat(Math.max(0, r.lives))}<span class="sb-lost">${'♥'.repeat(Math.max(0, 3 - r.lives))}</span></td>`
          : `<td><b>${r.kos}</b></td><td>${r.dmg}</td><td class="opt">${r.caught}</td><td class="opt">${time(r.time)}</td>`}
      </tr>`
    })
    .join('')
  return `<table class="sb-table ${raid ? 'raid' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

/** Live scoreboard over the game (toggle with the 🏆 button or Tab). */
export class LiveBoard {
  el = document.createElement('div')
  private timer = 0

  constructor(root: HTMLElement, private g: Game, private me: () => number) {
    this.el.className = 'sb-live-panel hidden'
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation())
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.sb-close')) this.toggle(false)
    })
    root.append(this.el)
  }

  get open() {
    return !this.el.classList.contains('hidden')
  }

  toggle(on = !this.open) {
    if (on === this.open) return
    sfx.select()
    this.el.classList.toggle('hidden', !on)
    clearInterval(this.timer)
    if (on) {
      this.render()
      this.timer = window.setInterval(() => this.render(), 500)
    }
  }

  private render() {
    const g = this.g
    const raid = g.kind === 'raid'
    const left = g.trainers.filter((t) => t.alive).length
    this.el.innerHTML = `
      <div class="sb-head"><b>${raid ? L('Raid · damage', 'Raid · schade') : L('Standings', 'Stand')}</b><small>${raid ? L(`${left} of ${g.trainers.length} still fighting`, `${left} van ${g.trainers.length} nog in de strijd`) : decided(g) ? L('Over', 'Afgelopen') : L(`${left} of ${g.trainers.length} trainers left`, `${left} van ${g.trainers.length} trainers over`)}</small><button class="sb-close" aria-label="${L('Close', 'Sluiten')}">✕</button></div>
      <div class="sb-scroll">${boardHtml(scoreRows(g), raid, this.me())}</div>`
  }

  destroy() {
    clearInterval(this.timer)
    this.el.remove()
  }
}

export interface BoardAction {
  label: string
  run: () => void
}

/** Final standings after watching a match to the end. */
export function showFinalBoard(rows: ScoreRow[], raid: boolean, me: number, main: BoardAction, more: BoardAction[]) {
  const el = document.getElementById('screen')!
  const top = rows[0]
  const title = raid
    ? L('Raid over', 'Raid voorbij')
    : top && top.place === 1
      ? top.id === me ? L('You win!', 'Jij wint!') : L(`${top.name} wins!`, `${top.name} wint!`)
      : L('Final standings', 'Eindstand')
  el.innerHTML = `
    <div class="res sb-final">
      <div class="res-glow"></div>
      <div class="res-card wide">
        <div class="res-title">${title}</div>
        <div class="res-sub">${raid ? L('Who dealt the most damage?', 'Wie deed de meeste schade?') : L('Final standings of the match', 'Eindstand van het potje')}</div>
        ${top && !raid ? `<div class="sb-winner"><img class="px tr" src="${trainerSpriteUrl(top.sprite)}" alt="">${top.mon ? `<img class="px mon" src="${spriteUrl(top.mon, { shiny: top.shiny })}" alt="">` : ''}<span>👑</span></div>` : ''}
        <div class="sb-scroll">${boardHtml(rows, raid, me)}</div>
        <div class="res-actions">
          <button class="cta" data-a="0">${main.label}</button>
          <div class="res-more">${more.map((a, i) => `<button class="ghost2" data-a="${i + 1}">${a.label}</button>`).join('')}</div>
        </div>
      </div>
    </div>`
  const actions = [main, ...more]
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      actions[Number(b.dataset.a)].run()
    }),
  )
}
