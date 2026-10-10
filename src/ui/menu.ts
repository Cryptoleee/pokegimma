import qrcode from 'qrcode-generator'
import { animatedUrl, SPECIES, spriteUrl } from '../data/pokemon'
import { TRAINERS, trainerSpriteUrl, type TrainerDef } from '../data/trainers'
import { sfx } from '../audio'
import { NAME_MAX, profile, setName } from '../profile'
import { cleanCode, MAX_PLAYERS, type Room } from '../net/room'
import { SEATS } from '../game/game'

/**
 * Main menu (name + play solo / host / join) and the multiplayer lobby.
 */

const screen = () => document.getElementById('screen')!
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function gif(id: number, cls = '') {
  return `<img class="px ${cls}" src="${animatedUrl(id)}" onerror="this.onerror=null;this.src='${spriteUrl(id)}'" alt="">`
}

export interface MenuActions {
  solo(): void
  host(): void
  join(code: string): void
  team(): void
}

export interface MenuState {
  trainer: TrainerDef
  team: number[]
  /** Pre-filled join code (from a shared link). */
  code?: string
  error?: string
  busy?: string
}

export function showMenu(st: MenuState, on: MenuActions) {
  const el = screen()
  const mon = st.team[0]
  el.innerHTML = `
    <div class="mm">
      <div class="mm-logo"><i class="tball"></i><b>BATTLEMON</b><span>ROYALE</span></div>
      <div class="mm-card">
        <div class="mm-team">
          <img class="px mm-tr" src="${trainerSpriteUrl(st.trainer.sprite)}" alt="">
          ${mon ? gif(mon, 'mm-mon') : ''}
        </div>
        <div class="mm-who">
          <label for="mm-name">Jouw naam</label>
          <input id="mm-name" maxlength="${NAME_MAX}" autocomplete="nickname" spellcheck="false" placeholder="Typ je naam" value="${esc(profile().name)}">
          <button class="mm-edit">${st.trainer.name}${mon ? ` &amp; ${SPECIES[mon].name}` : ''} · wijzig ✎</button>
        </div>
      </div>
      <div class="mm-actions">
        <button class="cta mm-solo">Solo spelen ▶<small>tegen ${SEATS - 1} bots</small></button>
        <div class="mm-row">
          <button class="mm-tile mm-host"><i>＋</i><b>Potje maken</b><small>speel met vrienden</small></button>
          <button class="mm-tile mm-join"><i>⌗</i><b>Meedoen</b><small>met een code</small></button>
        </div>
        <form class="mm-code ${st.code || st.error ? 'open' : ''}">
          <input id="mm-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" value="${esc(st.code ?? '')}" inputmode="text">
          <button class="mm-go" type="submit">Meedoen ▶</button>
        </form>
        <div class="mm-msg ${st.error ? 'err' : st.busy ? 'busy' : ''}">${esc(st.error ?? st.busy ?? '')}</div>
      </div>
      <div class="mm-foot">Zit je naast iemand? Maak een potje en laat je vriend de code invoeren of de QR-code scannen. Tot ${MAX_PLAYERS} spelers, lege plekken worden bots.</div>
    </div>`

  const name = el.querySelector('#mm-name') as HTMLInputElement
  const code = el.querySelector('#mm-code') as HTMLInputElement
  const form = el.querySelector('.mm-code') as HTMLFormElement
  const msg = el.querySelector('.mm-msg') as HTMLElement
  name.addEventListener('input', () => setName(name.value))
  name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur())
  code.addEventListener('input', () => (code.value = cleanCode(code.value)))

  /** Multiplayer needs a name so others know who you are. */
  const named = () => {
    setName(name.value)
    if (profile().name) return true
    name.focus()
    name.classList.remove('shake')
    void name.offsetWidth
    name.classList.add('shake')
    msg.className = 'mm-msg err'
    msg.textContent = 'Vul eerst je naam in'
    sfx.select()
    return false
  }
  const busy = (text: string) => {
    msg.className = 'mm-msg busy'
    msg.textContent = text
    el.querySelectorAll('button').forEach((b) => (b.disabled = true))
  }

  el.querySelector('.mm-edit')!.addEventListener('click', () => {
    sfx.select()
    setName(name.value)
    on.team()
  })
  el.querySelector('.mm-solo')!.addEventListener('click', () => {
    sfx.select()
    setName(name.value)
    on.solo()
  })
  el.querySelector('.mm-host')!.addEventListener('click', () => {
    if (!named()) return
    sfx.select()
    busy('Potje aanmaken…')
    on.host()
  })
  el.querySelector('.mm-join')!.addEventListener('click', () => {
    sfx.select()
    form.classList.add('open')
    code.focus()
  })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (!named()) return
    const c = cleanCode(code.value)
    if (c.length !== 4) {
      msg.className = 'mm-msg err'
      msg.textContent = 'Een code heeft 4 tekens'
      code.focus()
      return
    }
    sfx.select()
    busy(`Verbinden met ${c}…`)
    on.join(c)
  })
  if (st.busy) busy(st.busy)
  else if (!profile().name) setTimeout(() => name.focus(), 300)
}

// ---------------- Lobby ----------------

export interface LobbyActions {
  start(): void
  team(): void
  leave(): void
}

export function showLobby(room: Room, on: LobbyActions) {
  const el = screen()
  const qr = qrcode(0, 'M')
  qr.addData(room.link)
  qr.make()
  el.innerHTML = `
    <div class="sel lobby">
      <div class="sel-head">
        <button class="sel-back" aria-label="Verlaten">◀</button>
        <div class="sel-title"><small>${room.isHost ? 'JOUW POTJE' : 'LOBBY'}</small><b>Samen spelen</b></div>
      </div>
      <div class="lb-code">
        ${room.isHost ? `<div class="lb-qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>` : ''}
        <div class="lb-codetext">
          <small>Code</small>
          <b>${room.code.split('').map((c) => `<i>${c}</i>`).join('')}</b>
          <span>${room.isHost ? 'Laat je vriend deze code invoeren of de QR-code scannen' : 'Deel deze code met wie nog mee wil doen'}</span>
          <button class="ghost2 lb-share">Link delen ⤴</button>
        </div>
      </div>
      <div class="lb-list"></div>
      <div class="sel-foot lb-foot">
        <button class="ghost2 lb-team">Team wijzigen</button>
        <button class="cta lb-start"></button>
      </div>
    </div>`

  const list = el.querySelector('.lb-list') as HTMLElement
  const start = el.querySelector('.lb-start') as HTMLButtonElement
  const refresh = () => {
    const bots = Math.max(0, SEATS - room.players.length)
    list.innerHTML = room.players.map((p, i) => {
      const tr = TRAINERS.find((t) => t.key === p.trainer) ?? TRAINERS[0]
      const me = p.pid === room.me.pid
      return `
        <div class="lb-p ${me ? 'lb-me' : ''}" style="--d:${i * 60}ms">
          <img class="px lb-tr" src="${trainerSpriteUrl(tr.sprite)}" alt="">
          <div class="lb-name"><b>${esc(p.name)}</b><span>${i === 0 ? '<em>HOST</em>' : ''}${me ? '<em class="you">JIJ</em>' : ''}${tr.name}${p.team[0] ? ` &amp; ${SPECIES[p.team[0]].name}` : ''}</span></div>
          ${p.team[0] ? gif(p.team[0], 'lb-mon') : ''}
        </div>`
    }).join('') + `<div class="lb-bots">+ ${bots} bot${bots === 1 ? '' : 's'} vullen de arena aan</div>`
    if (room.isHost) {
      start.disabled = room.running
      start.innerHTML = room.running ? 'Potje loopt nog…' : `Start! ▶<small>${room.players.length} speler${room.players.length === 1 ? '' : 's'} + ${bots} bots</small>`
    } else {
      start.disabled = true
      start.innerHTML = room.running ? 'Er loopt nog een potje…' : `Wachten op ${esc(room.players[0]?.name ?? 'de host')}…`
    }
  }
  refresh()

  el.querySelector('.sel-back')!.addEventListener('click', () => {
    sfx.select()
    on.leave()
  })
  el.querySelector('.lb-team')!.addEventListener('click', () => {
    sfx.select()
    on.team()
  })
  start.addEventListener('click', () => {
    if (!room.isHost || room.running) return
    sfx.select()
    on.start()
  })
  const share = el.querySelector('.lb-share') as HTMLButtonElement
  share.addEventListener('click', async () => {
    sfx.select()
    const data = { title: 'BattleMon Royale', text: `Doe mee met mijn potje! Code ${room.code}`, url: room.link }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(room.link)
        share.textContent = 'Link gekopieerd ✓'
      }
    } catch {
      /* cancelled */
    }
  })
  return { refresh }
}
