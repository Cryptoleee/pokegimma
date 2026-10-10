import { spriteUrl } from '../data/pokemon'
import { sfx } from '../audio'
import type { Mon } from '../game/entities'

const screen = () => document.getElementById('screen')!

export function showPartyFull(mon: Mon, party: Mon[], choose: (idx: number) => void) {
  const modal = document.getElementById('modal')!
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel">
      <h2>Je team is vol!</h2>
      <p>Wie ruil je in voor <b>${mon.name}</b> (Lv ${mon.level})?</p>
      <div class="choice">
        ${party.map((m, i) => `<button data-i="${i}"><img src="${spriteUrl(m.species.id, { shiny: m.shiny })}" alt="">${m.name}<br>Lv ${m.level}</button>`).join('')}
      </div>
      <button class="btn ghost" data-i="-1">Laat ${mon.name} gaan</button>
    </div>`
  modal.querySelectorAll<HTMLElement>('[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      modal.classList.add('hidden')
      modal.innerHTML = ''
      choose(Number(b.dataset.i))
    }),
  )
}

export function showLeaveConfirm(onStay: () => void, onLeave: () => void) {
  const modal = document.getElementById('modal')!
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel">
      <h2>Game verlaten?</h2>
      <p>Weet je zeker dat je wilt stoppen? Je voortgang in deze match gaat verloren.</p>
      ${document.body.classList.contains('desk') ? `<div class="keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> of muis ingedrukt</span><em>Lopen</em>
        <span><kbd>1</kbd>–<kbd>4</kbd></span><em>Aanvallen (richten op je cursor)</em>
        <span><kbd>Spatie</kbd></span><em>Vangen</em>
        <span><kbd>Q</kbd></span><em>Wissel Pokémon</em>
        <span><kbd>5</kbd> <kbd>6</kbd> <kbd>7</kbd></span><em>Master Ball · Potion · Revive</em>
        <span><kbd>Esc</kbd></span><em>Pauze</em>
      </div>` : ''}
      <div class="actions">
        <button class="btn" id="stay">Verder spelen</button>
        <button class="btn red" id="leave">Verlaten</button>
      </div>
    </div>`
  const close = () => {
    modal.classList.add('hidden')
    modal.innerHTML = ''
  }
  modal.querySelector('#stay')!.addEventListener('click', () => {
    sfx.select()
    close()
    onStay()
  })
  modal.querySelector('#leave')!.addEventListener('click', () => {
    sfx.select()
    close()
    onLeave()
  })
}

export function clearScreen() {
  screen().innerHTML = ''
}
