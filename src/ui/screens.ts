import { spriteUrl } from '../data/pokemon'
import { channelPref, setChannel, sfx, type Channel } from '../audio'
import { say } from '../voice'
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

export function showLeaveConfirm(onStay: () => void, onLeave: () => void, text = 'Weet je zeker dat je wilt stoppen? Je voortgang in deze match gaat verloren.') {
  const modal = document.getElementById('modal')!
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel">
      <h2>Game verlaten?</h2>
      <p>${text}</p>
      ${document.body.classList.contains('desk') ? `<div class="keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><em>Lopen (of rechtermuisknop vasthouden)</em>
        <span><kbd>Linkermuis</kbd></span><em>Aanval 1 · vasthouden = blijven schieten</em>
        <span><kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd></span><em>Aanval 2 · 3 · ultimate (richt op je cursor)</em>
        <span><kbd>Spatie</kbd></span><em>Vangen</em>
        <span><kbd>F</kbd></span><em>Wissel Pokémon</em>
        <span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span><em>Master Ball · Potion · Revive</em>
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

/** Options: switch music, the announcer and sound effects on or off. */
export function showOptions() {
  const modal = document.getElementById('modal')!
  const rows: [Channel, string, string, string][] = [
    ['music', '🎵', 'Muziek', 'De soundtrack in menu en gevecht'],
    ['voice', '🎙️', 'Stemmen', 'De omroeper bij grote momenten'],
    ['sfx', '💥', 'Geluidseffecten', 'Aanvallen, items en knoppen'],
  ]
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel opts">
      <h2>Opties</h2>
      <div class="opt-list">
        ${rows.map(([c, icon, name, sub]) => `
          <button class="opt-row" data-c="${c}" role="switch" aria-checked="${channelPref(c)}">
            <i>${icon}</i><span><b>${name}</b><small>${sub}</small></span><em class="opt-sw"></em>
          </button>`).join('')}
      </div>
      <button class="btn" id="opt-done">Klaar</button>
    </div>`
  modal.querySelectorAll<HTMLElement>('.opt-row').forEach((b) =>
    b.addEventListener('click', () => {
      const c = b.dataset.c as Channel
      const on = !channelPref(c)
      setChannel(c, on)
      b.setAttribute('aria-checked', String(on))
      // A taste of what you just switched on
      if (on && c === 'sfx') sfx.select()
      if (on && c === 'voice') say('go')
    }),
  )
  const close = () => {
    modal.classList.add('hidden')
    modal.innerHTML = ''
  }
  modal.querySelector('#opt-done')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.addEventListener('click', (e) => e.target === modal && close(), { once: true })
}
