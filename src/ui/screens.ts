import { spriteUrl } from '../data/pokemon'
import { channelPref, setChannel, sfx, type Channel } from '../audio'
import { say } from '../voice'
import { bindLangSwitch, L, langSwitch } from '../i18n'
import { presentDuo } from '../duo'
import { ACTIONS, actionName, bind, keyName, keyOf, RESERVED, resetKeys, unbind, type Action } from '../keys'
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
        <span>${(['up', 'left', 'down', 'right'] as const).map((a) => `<kbd>${keyName(keyOf(a))}</kbd>`).join('')}</span><em>${L('Move (or hold right mouse button)', 'Lopen (of rechtermuisknop vasthouden)')}</em>
        <span><kbd>${L('Left mouse', 'Linkermuis')}</kbd>${keyOf('move1') ? `<kbd>${keyName(keyOf('move1'))}</kbd>` : ''}</span><em>${L('Move 1 · hold = keep firing', 'Aanval 1 · vasthouden = blijven schieten')}</em>
        <span>${(['move2', 'move3', 'move4'] as const).map((a) => `<kbd>${keyName(keyOf(a))}</kbd>`).join(' ')}</span><em>${L('Move 2 · 3 · ultimate (aims at your cursor)', 'Aanval 2 · 3 · ultimate (richt op je cursor)')}</em>
        <span><kbd>${keyName(keyOf('catch'))}</kbd></span><em>${L('Catch', 'Vangen')}</em>
        <span><kbd>${keyName(keyOf('switch'))}</kbd></span><em>${L('Switch Pokémon', 'Wissel Pokémon')}</em>
        <span>${(['master', 'potion', 'revive'] as const).map((a) => `<kbd>${keyName(keyOf(a))}</kbd>`).join(' ')}</span><em>Master Ball · Potion · Revive</em>
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
      ${matchMedia('(pointer: fine)').matches ? `<button class="opt-row opt-keys"><i>⌨️</i><span><b>${L('Controls', 'Besturing')}</b><small>${L('Choose your own keys', 'Kies je eigen toetsen')}</small></span><em class="opt-go">${L('Change', 'Wijzig')}</em></button>` : ''}
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
  modal.querySelector('.opt-keys')?.addEventListener('click', () => {
    sfx.select()
    showKeys(() => showOptions())
  })
  // Second screen: let the browser put it on the other display, or explain how to open it there
  const duoBtn = modal.querySelector('.opt-duo') as HTMLElement
  duoBtn.addEventListener('click', async () => {
    sfx.select()
    const help = modal.querySelector('.opt-duo-help') as HTMLElement
    const r = await presentDuo()
    if (r === 'presented') return close()
    help.classList.remove('hidden')
    help.innerHTML = L(
      `Open <b>${location.host}/duo/</b> on the other screen, in the same browser (you can install it as its own app, “Stormbreak Duo”). On the AYN Thor: put that window on the lower screen with the dual-screen button. It connects by itself.`,
      `Open <b>${location.host}/duo/</b> op het andere scherm, in dezelfde browser (je kunt het als eigen app installeren: “Stormbreak Duo”). Op de AYN Thor: zet dat venster met de dual-screen-knop op het onderste scherm. Het verbindt vanzelf.`,
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

/**
 * Options → Controls: every action with its key. Tap one, press a new key
 * (Escape cancels, Backspace clears an optional one); taking a key that's in
 * use swaps the two.
 */
export function showKeys(back: () => void) {
  const modal = document.getElementById('modal')!
  let waiting: Action | null = null
  const paint = () => {
    modal.classList.remove('hidden')
    modal.onclick = null
    modal.innerHTML = `
      <div class="panel opts keys-panel">
        <h2>${L('Controls', 'Besturing')}</h2>
        <p>${L('Tap an action, then press the key you want. Esc always pauses, the arrow keys always walk too.', 'Tik op een actie en druk dan op de toets die je wilt. Esc pauzeert altijd, de pijltjes lopen altijd ook.')}</p>
        <div class="kb-list">${ACTIONS.map((a) => `
          <button class="kb-row ${waiting === a ? 'wait' : ''}" data-a="${a}"><span>${actionName(a)}</span><kbd>${waiting === a ? L('Press a key…', 'Druk een toets…') : keyName(keyOf(a))}</kbd></button>`).join('')}
        </div>
        <div class="actions"><button class="btn ghost" id="kb-reset">${L('Defaults', 'Standaard')}</button><button class="btn" id="kb-done">${L('Done', 'Klaar')}</button></div>
      </div>`
    modal.querySelectorAll<HTMLElement>('.kb-row').forEach((b) =>
      b.addEventListener('click', () => {
        sfx.select()
        waiting = b.dataset.a as Action
        paint()
      }),
    )
    modal.querySelector('#kb-reset')!.addEventListener('click', () => {
      sfx.select()
      resetKeys()
      waiting = null
      paint()
    })
    modal.querySelector('#kb-done')!.addEventListener('click', () => {
      sfx.select()
      stop()
      back()
    })
  }
  // The next key press goes to the action we're waiting on (and nowhere else)
  const onKey = (e: KeyboardEvent) => {
    if (!waiting) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const k = e.key.toLowerCase()
    if (k === 'escape') waiting = null
    else if (k === 'backspace' && (waiting === 'move1')) {
      unbind(waiting)
      waiting = null
    } else if (!RESERVED.has(k)) {
      bind(waiting, k)
      sfx.select()
      waiting = null
    }
    paint()
  }
  addEventListener('keydown', onKey, { capture: true })
  const stop = () => removeEventListener('keydown', onKey, { capture: true })
  paint()
}
