import { spriteUrl } from '../data/pokemon'
import { channelPref, setChannel, sfx, type Channel } from '../audio'
import { say } from '../voice'
import { bindLangSwitch, L, langSwitch } from '../i18n'
import { presentDuo } from '../duo'
import type { Mon } from '../game/entities'

const screen = () => document.getElementById('screen')!

export function showPartyFull(mon: Mon, party: Mon[], choose: (idx: number) => void) {
  const modal = document.getElementById('modal')!
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel">
      <h2>${L('Your team is full!', 'Je team is vol!')}</h2>
      <p>${L(`Who do you swap out for <b>${mon.name}</b> (Lv ${mon.level})?`, `Wie ruil je in voor <b>${mon.name}</b> (Lv ${mon.level})?`)}</p>
      <div class="choice">
        ${party.map((m, i) => `<button data-i="${i}"><img src="${spriteUrl(m.species.id, { shiny: m.shiny })}" alt="">${m.name}<br>Lv ${m.level}</button>`).join('')}
      </div>
      <button class="btn ghost" data-i="-1">${L(`Let ${mon.name} go`, `Laat ${mon.name} gaan`)}</button>
    </div>`
  sfx.banner()
  modal.querySelectorAll<HTMLElement>('[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      Number(b.dataset.i) < 0 ? sfx.release() : sfx.select()
      modal.classList.add('hidden')
      modal.innerHTML = ''
      choose(Number(b.dataset.i))
    }),
  )
}

export function showLeaveConfirm(onStay: () => void, onLeave: () => void, text = L('Are you sure you want to quit? Your progress in this match will be lost.', 'Weet je zeker dat je wilt stoppen? Je voortgang in deze match gaat verloren.')) {
  const modal = document.getElementById('modal')!
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel">
      <h2>${L('Leave game?', 'Game verlaten?')}</h2>
      <p>${text}</p>
      ${document.body.classList.contains('desk') ? `<div class="keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><em>${L('Move (or hold right mouse button)', 'Lopen (of rechtermuisknop vasthouden)')}</em>
        <span><kbd>${L('Left mouse', 'Linkermuis')}</kbd></span><em>${L('Move 1 · hold = keep firing', 'Aanval 1 · vasthouden = blijven schieten')}</em>
        <span><kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd></span><em>${L('Move 2 · 3 · ultimate (aims at your cursor)', 'Aanval 2 · 3 · ultimate (richt op je cursor)')}</em>
        <span><kbd>${L('Space', 'Spatie')}</kbd></span><em>${L('Catch', 'Vangen')}</em>
        <span><kbd>F</kbd></span><em>${L('Switch Pokémon', 'Wissel Pokémon')}</em>
        <span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span><em>Master Ball · Potion · Revive</em>
        <span><kbd>Esc</kbd></span><em>${L('Pause', 'Pauze')}</em>
      </div>` : ''}
      <div class="actions">
        <button class="btn" id="stay">${L('Keep playing', 'Verder spelen')}</button>
        <button class="btn red" id="leave">${L('Leave', 'Verlaten')}</button>
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
    ['music', '🎵', L('Music', 'Muziek'), L('The soundtrack in menus and battle', 'De soundtrack in menu en gevecht')],
    ['voice', '🎙️', L('Voices', 'Stemmen'), L('The announcer at big moments', 'De omroeper bij grote momenten')],
    ['sfx', '💥', L('Sound effects', 'Geluidseffecten'), L('Moves, items and buttons', 'Aanvallen, items en knoppen')],
  ]
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel opts">
      <h2>${L('Options', 'Opties')}</h2>
      <div class="opt-list">
        ${rows.map(([c, icon, name, sub]) => `
          <button class="opt-row" data-c="${c}" role="switch" aria-checked="${channelPref(c)}">
            <i>${icon}</i><span><b>${name}</b><small>${sub}</small></span><em class="opt-sw"></em>
          </button>`).join('')}
      </div>
      <div class="opt-row opt-lang"><i>🌐</i><span><b>${L('Language', 'Taal')}</b><small>${L('English or Dutch', 'Engels of Nederlands')}</small></span>${langSwitch()}</div>
      <button class="opt-row opt-duo"><i>🖥️</i><span><b>${L('Second screen', 'Tweede scherm')}</b><small>${L('Map, team, items and chat on a second display (like the AYN Thor’s lower screen)', 'Kaart, team, items en chat op een tweede scherm (zoals het onderscherm van de AYN Thor)')}</small></span><em class="opt-go">${L('Open', 'Open')}</em></button>
      <p class="opt-duo-help hidden"></p>
      <button class="btn" id="opt-done">${L('Done', 'Klaar')}</button>
    </div>`
  modal.querySelectorAll<HTMLElement>('.opt-row[data-c]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = b.dataset.c as Channel
      const on = !channelPref(c)
      setChannel(c, on)
      b.setAttribute('aria-checked', String(on))
      if (!on) sfx.select()
      // A taste of what you just switched on
      if (on && c === 'sfx') sfx.select()
      if (on && c === 'voice') say('go')
    }),
  )
  // Second screen: let the browser put it on the other display, or explain how to open it there
  const duoBtn = modal.querySelector('.opt-duo') as HTMLElement
  duoBtn.addEventListener('click', async () => {
    sfx.select()
    const help = modal.querySelector('.opt-duo-help') as HTMLElement
    const r = await presentDuo()
    if (r === 'presented') return close()
    help.classList.remove('hidden')
    help.innerHTML = L(
      `Open <b>${location.host}/duo</b> on the other screen, in the same browser. On the AYN Thor: open it in Chrome and move that window to the lower screen with the dual-screen button. It connects by itself.`,
      `Open <b>${location.host}/duo</b> op het andere scherm, in dezelfde browser. Op de AYN Thor: open het in Chrome en zet dat venster met de dual-screen-knop op het onderste scherm. Het verbindt vanzelf.`,
    )
  })
  // New language: rebuild this panel (the screen behind it follows via onLangChange)
  bindLangSwitch(modal, () => {
    sfx.select()
    showOptions()
  })
  const close = () => {
    modal.classList.add('hidden')
    modal.innerHTML = ''
    modal.onclick = null
  }
  modal.querySelector('#opt-done')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.onclick = (e) => {
    if (e.target !== modal) return
    sfx.select()
    close()
  }
}
