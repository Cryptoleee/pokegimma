import { badgeOf } from '../data/support'
import { addFriendButton } from './friends'
import { spriteUrl } from '../data/pokemon'
import { RAID_LIVES } from '../data/bosses'
import { trainerSpriteUrl } from '../data/trainers'
import { sfx } from '../audio'
import type { Game } from '../game/game'
import { decided, scoreRows, type ScoreRow } from '../game/score'
import { L } from '../i18n'
import { appEsc as esc, IC, icon } from './app'
import { actionsHtml, bindActions, MODE_RGB, type ResultAction } from './results'

/**
 * The match scoreboard: a table of every trainer. Shown live during a match
 * (🏆 button or Tab), on the results screen, and as the final standings when
 * you watched a match to the end.
 */

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`

/**
 * The scoreboard for the results screens (new style): one row per trainer with
 * their place, trainer and Pokémon, and the numbers that matter for the mode.
 * Phones leave out caught and time.
 */
export function boardList(rows: ScoreRow[], raid: boolean, me: number) {
  const multi = rows.filter((r) => r.human).length > 1
  const head = raid
    ? `<span>#</span><span>Trainer</span><span>Pokémon</span><span>${L('Damage', 'Schade')}</span><span>${L('Lives', 'Levens')}</span>`
    : `<span>#</span><span>Trainer</span><span>Pokémon</span><span>K.O.</span><span>${L('Damage', 'Schade')}</span><span class="opt">${L('Caught', 'Gevangen')}</span><span class="opt">${L('Time', 'Tijd')}</span>`
  const body = rows
    .map((r, i) => {
      const rank = raid ? `${i + 1}` : r.place ? `${r.place}` : `<i class="nrb-live" title="${L('Still in the game', 'Nog in het spel')}"></i>`
      const tag = r.id === me ? `<em class="me">${L('you', 'jij')}</em>` : multi && r.human ? `<em>${L('player', 'speler')}</em>` : ''
      const out = raid ? r.lives <= 0 && !r.alive : !r.alive && r.place !== 1
      return `<div class="nrb-row ${r.id === me ? 'me' : ''} ${out ? 'out' : ''} ${!raid && r.place === 1 ? 'win' : ''}">
        <span class="nrb-rank">${rank}</span>
        <span class="nrb-who"><img class="px" src="${trainerSpriteUrl(r.sprite)}" alt="">${r.sup ? `<img class="sup-badge" src="${badgeOf(r.sup)}" alt="" title="${L('Supporter', 'Supporter')}">` : ''}<b class="${r.sup === 'legend' ? 'sup-gold' : ''}">${r.name}</b>${tag}${addFriendButton(r.fc)}</span>
        <span class="nrb-mon">${r.mon ? `<img class="px" src="${spriteUrl(r.mon, { shiny: r.shiny })}" alt=""><small>Lv ${r.lv}</small>` : ''}</span>
        ${raid
          ? `<span class="nrb-n"><b>${r.bossDmg}</b><small>${r.share}%</small></span><span class="nrb-lives">${'<i></i>'.repeat(Math.max(0, r.lives))}${'<i class="lost"></i>'.repeat(Math.max(0, RAID_LIVES - r.lives))}</span>`
          : `<span class="nrb-n"><b>${r.kos}</b></span><span class="nrb-n">${r.dmg}</span><span class="nrb-n opt">${r.caught}</span><span class="nrb-n opt">${time(r.time)}</span>`}
      </div>`
    })
    .join('')
  return `<div class="nrb ${raid ? 'raid' : ''}"><div class="nrb-row nrb-head">${head}</div>${body}</div>`
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
      <div class="sb-head"><b>${raid ? L('Raid · damage', 'Raid · schade') : L('Standings', 'Stand')}</b><small>${raid ? L(`${left} of ${g.trainers.length} still fighting`, `${left} van ${g.trainers.length} nog in de strijd`) : decided(g) ? L('Over', 'Afgelopen') : L(`${left} of ${g.trainers.length} trainers left`, `${left} van ${g.trainers.length} trainers over`)}</small><button class="sb-close" aria-label="${L('Close', 'Sluiten')}">${icon(IC.close, 16)}</button></div>
      <div class="sb-scroll">${boardList(scoreRows(g), raid, this.me())}</div>`
  }

  destroy() {
    clearInterval(this.timer)
    this.el.remove()
  }
}

export type BoardAction = ResultAction

/** Final standings after watching a match to the end. */
export function showFinalBoard(rows: ScoreRow[], raid: boolean, me: number, main: BoardAction, more: BoardAction[]) {
  const el = document.getElementById('screen')!
  const top = rows[0]
  const champ = !raid && top && top.place === 1 ? top : null
  const title = raid
    ? L('Raid over', 'Raid voorbij')
    : champ
      ? champ.id === me ? L('You win!', 'Jij wint!') : L(`${champ.name} wins!`, `${champ.name} wint!`)
      : L('Final standings', 'Eindstand')
  const kind = raid ? 'raid' : 'royale'
  el.innerHTML = `
    <div class="nres nres-final nres-${kind}" style="--mc:${MODE_RGB[kind]}" data-tab="board">
      <div class="nr-glow"></div>
      <div class="nr-shell">
        <section class="nr-hero">
          <header class="nr-head">
            <div class="nr-badge"><b>${raid ? '★' : '#1'}</b></div>
            <div class="nr-headtxt"><span class="n-label">${raid ? 'Raid' : L('Winner', 'Winnaar')}</span><h1>${esc(title)}</h1><p>${raid ? L('Who dealt the most damage?', 'Wie deed de meeste schade?') : L('Final standings of the match', 'Eindstand van het potje')}</p></div>
          </header>
          ${champ ? `<div class="nr-stage"><div class="n-duo"><i class="n-plat"></i><img class="px n-tr" src="${trainerSpriteUrl(champ.sprite)}" alt="">${champ.mon ? `<img class="px n-mon" src="${spriteUrl(champ.mon, { shiny: champ.shiny })}" alt="">` : ''}</div></div>` : ''}
        </section>
        <section class="nr-pane" data-pane="board">
          <div class="nr-panehead"><b>${L('Final standings', 'Eindstand')}</b></div>
          ${boardList(rows, raid, me)}
        </section>
        ${actionsHtml(main, more)}
      </div>
    </div>`
  bindActions(el, [main, ...more])
}
