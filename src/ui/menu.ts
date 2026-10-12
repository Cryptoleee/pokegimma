import { showOptions } from './screens'
import qrcode from 'qrcode-generator'
import logoSmall from '../assets/stormbreak-logo-small.webp'
import { animatedUrl, SPECIES, spriteUrl } from '../data/pokemon'
import { TRAINERS, trainerSpriteUrl, type TrainerDef } from '../data/trainers'
import { sfx } from '../audio'
import { NAME_MAX, profile, setName } from '../profile'
import { CHAT_MAX, cleanCode, MAX_PLAYERS, QUICK_MAX, type Room } from '../net/room'
import type { ChatLine, MatchChoice } from '../net/protocol'
import { ROYALE_THEMES, THEMES } from '../data/themes'
import { BOSS_LIST, BOSSES } from '../data/bosses'
import { SEATS } from '../game/game'

/**
 * Home menu (your team, name, solo or multiplayer) and the multiplayer lobby.
 */

const screen = () => document.getElementById('screen')!
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function gif(id: number, cls = '') {
  return `<img class="px ${cls}" src="${animatedUrl(id)}" onerror="this.onerror=null;this.src='${spriteUrl(id)}'" alt="">`
}

/** Quick chat phrases: one tap on a phone. */
export const QUICK_CHAT = ['GG!', 'Klaar?', 'Even wachten', 'Haha 😂', 'Let op!', 'Help!']

/**
 * Mode picker: Battle Royale with a world, or Raid with a boss. Editable for
 * you (solo) or the host; read-only for guests in a lobby.
 */
export function choicePicker(el: HTMLElement, get: () => MatchChoice, set: ((c: MatchChoice) => void) | null) {
  const paint = () => {
    const c = get()
    const ro = !set
    el.innerHTML = `
      <div class="cp-modes">
        <button data-kind="royale" class="${c.kind === 'royale' ? 'on' : ''}" ${ro ? 'disabled' : ''}><b>Battle Royale</b><small>12 trainers · 1 winnaar</small></button>
        <button data-kind="raid" class="${c.kind === 'raid' ? 'on' : ''}" ${ro ? 'disabled' : ''}><b>Raid</b><small>samen tegen een eindbaas</small></button>
      </div>
      ${c.kind === 'royale'
        ? `<div class="cp-worlds">${(['random', ...ROYALE_THEMES] as const).map((t) => {
            const th = t === 'random' ? null : THEMES[t]
            return `<button data-theme="${t}" class="${c.theme === t ? 'on' : ''}" ${ro ? 'disabled' : ''} style="--c:${th ? th.grass[0] : '#5a6a9a'};--c2:${th ? th.tall[0] : '#3a4470'}"><i>${th ? th.icon : '🎲'}</i>${th ? th.name : 'Willekeurig'}</button>`
          }).join('')}</div>`
        : `<div class="cp-mystery"><div class="cp-sil">${BOSS_LIST.map((b) => `<img class="px" src="${spriteUrl(BOSSES[b].species)}" alt="">`).join('')}<i>?</i></div><span><b>Willekeurige baas</b><small>Je ziet pas bij het laden tegen wie je vecht</small></span></div>`}`
    el.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        if (!set) return
        sfx.select()
        const c = { ...get() }
        if (b.dataset.kind) c.kind = b.dataset.kind as MatchChoice['kind']
        if (b.dataset.theme) c.theme = b.dataset.theme as MatchChoice['theme']
        set(c)
        paint()
      }),
    )
  }
  paint()
  return { paint }
}

export interface MenuActions {
  solo(c: MatchChoice): void
  /** Quick play: a public lobby with random players. */
  quick(): void
  host(): void
  join(code: string): void
  team(): void
  back(): void
}

export interface MenuState {
  trainer: TrainerDef
  team: number[]
  /** Last solo choice (mode + world/boss). */
  choice: MatchChoice
  /** Pre-filled join code (from a shared link). */
  code?: string
  error?: string
  busy?: string
}

export function showMenu(st: MenuState, on: MenuActions) {
  const el = screen()
  const mon = st.team[0]
  const sheetOpen = !!(st.code || st.error || st.busy)
  el.innerHTML = `
    <div class="home">
      <div class="home-top">
        <button class="sel-back" aria-label="Terug naar het titelscherm">◀</button>
        <div class="home-logo"><img src="${logoSmall}" alt="Stormbreak Royale"></div>
        <button class="sel-back home-opts" aria-label="Opties">⚙️</button>
      </div>
      <div class="home-stage">
        <div class="hs-bg"></div>
        <div class="hs-beam"></div>
        <div class="hs-plat"></div>
        <img class="px hs-tr" src="${trainerSpriteUrl(st.trainer.sprite)}" alt="">
        ${mon ? gif(mon, 'hs-mon') : ''}
        <div class="hs-tag"><small>JOUW TEAM</small><b>${st.trainer.name}${mon ? ` &amp; ${SPECIES[mon].name}` : ''}</b></div>
        <button class="hs-edit">✎ Kies trainer &amp; Pokémon</button>
      </div>
      <div class="home-name">
        <label for="mm-name">Jouw naam</label>
        <input id="mm-name" maxlength="${NAME_MAX}" autocomplete="nickname" spellcheck="false" placeholder="Typ je naam" value="${esc(profile().name)}">
      </div>
      <div class="home-modes">
        <button class="mode quick"><i>⚡</i><b>Snel spel</b><small>online met willekeurige spelers</small><span class="qp-online"><em></em><span>online zoeken…</span></span></button>
        <button class="mode solo"><i>▶</i><b>Solo</b><small>tegen bots</small></button>
        <button class="mode multi"><i>👥</i><b>Met vrienden</b><small>eigen potje met code</small></button>
      </div>
      <div class="mm-msg ${st.error && !sheetOpen ? 'err' : ''}"></div>

      <div class="sheet solo-sheet">
        <div class="sheet-card">
          <button class="sheet-x" aria-label="Sluiten">✕</button>
          <h3>Solo</h3>
          <div class="cp"></div>
          <button class="cta solo-go"></button>
        </div>
      </div>

      <div class="sheet mp-sheet ${sheetOpen ? 'open' : ''}">
        <div class="sheet-card">
          <button class="sheet-x" aria-label="Sluiten">✕</button>
          <h3>Met vrienden</h3>
          <p>Speel samen met vrienden, naast je of online. Tot ${MAX_PLAYERS} spelers; lege plekken worden bots.</p>
          <button class="cta mm-host">＋ Potje maken<small>jij bent de host en krijgt een code</small></button>
          <div class="sheet-or"><span>of doe mee</span></div>
          <form class="mm-code">
            <input id="mm-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" value="${esc(st.code ?? '')}" inputmode="text">
            <button class="mm-go" type="submit">Meedoen ▶</button>
          </form>
          <div class="mm-msg sheet-msg ${st.error ? 'err' : st.busy ? 'busy' : ''}">${esc(st.error ?? st.busy ?? '')}</div>
        </div>
      </div>
    </div>`

  const name = el.querySelector('#mm-name') as HTMLInputElement
  const code = el.querySelector('#mm-code') as HTMLInputElement
  const sheet = el.querySelector('.mp-sheet') as HTMLElement
  const solo = el.querySelector('.solo-sheet') as HTMLElement
  let choice = { ...st.choice }
  const goBtn = el.querySelector('.solo-go') as HTMLButtonElement
  const goLabel = () => (goBtn.innerHTML = choice.kind === 'raid'
    ? `Start raid ▶<small>jouw ${mon ? SPECIES[mon].name : 'partner'} wordt Lv 50 en volledig geëvolueerd</small>`
    : `Start battle royale ▶<small>tegen ${SEATS - 1} bots</small>`)
  choicePicker(el.querySelector('.solo-sheet .cp') as HTMLElement, () => choice, (c) => {
    choice = c
    goLabel()
  })
  goLabel()
  const msg = el.querySelector('.sheet-msg') as HTMLElement
  name.addEventListener('input', () => setName(name.value))
  name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur())
  code.addEventListener('input', () => (code.value = cleanCode(code.value)))

  /** Multiplayer needs a name so others know who you are. */
  const named = () => {
    setName(name.value)
    if (profile().name) return true
    sheet.classList.remove('open')
    name.focus()
    name.classList.remove('shake')
    void name.offsetWidth
    name.classList.add('shake')
    const m = el.querySelector('.home > .mm-msg') as HTMLElement
    m.className = 'mm-msg err'
    m.textContent = 'Vul eerst je naam in'
    sfx.error()
    return false
  }
  const busy = (text: string) => {
    msg.className = 'mm-msg sheet-msg busy'
    msg.textContent = text
    el.querySelectorAll('button').forEach((b) => (b.disabled = true))
  }
  const click = (sel: string, fn: () => void) =>
    el.querySelector(sel)!.addEventListener('click', () => {
      sfx.select()
      fn()
    })

  click('.sel-back:not(.home-opts)', on.back)
  click('.home-opts', showOptions)
  click('.hs-edit', () => {
    setName(name.value)
    on.team()
  })
  click('.mode.solo', () => {
    setName(name.value)
    solo.classList.add('open')
  })
  click('.solo-go', () => on.solo(choice))
  click('.mode.quick', () => {
    setName(name.value)
    const m = el.querySelector('.home > .mm-msg') as HTMLElement
    m.className = 'mm-msg busy'
    m.textContent = 'Openbare lobby zoeken…'
    el.querySelectorAll('button').forEach((b) => (b.disabled = true))
    on.quick()
  })
  click('.mode.multi', () => {
    if (!named()) return
    sheet.classList.add('open')
  })
  el.querySelectorAll('.sheet-x').forEach((x) => x.addEventListener('click', () => {
    sfx.select()
    el.querySelectorAll('.sheet').forEach((sh) => sh.classList.remove('open'))
  }))
  el.querySelectorAll<HTMLElement>('.sheet').forEach((sh) => sh.addEventListener('click', (e) => e.target === sh && sh.classList.remove('open')))
  click('.mm-host', () => {
    if (!named()) return
    busy('Potje aanmaken…')
    on.host()
  })
  el.querySelector('.mm-code')!.addEventListener('submit', (e) => {
    e.preventDefault()
    if (!named()) return
    const c = cleanCode(code.value)
    if (c.length !== 4) {
      msg.className = 'mm-msg sheet-msg err'
      msg.textContent = 'Een code heeft 4 tekens'
      sfx.error()
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

/** Home: the live "players online" line on the quick play button. */
export function setOnline(all: { players: number; running: boolean; open: boolean }[]) {
  const el = document.querySelector('.qp-online span')
  if (!el) return
  const playing = all.filter((s) => s.running).reduce((n, s) => n + s.players, 0)
  const waiting = all.filter((s) => !s.running).reduce((n, s) => n + s.players, 0)
  const total = playing + waiting
  el.parentElement!.classList.toggle('live', total > 0)
  el.textContent = total === 0
    ? 'niemand online: start er een!'
    : waiting > 0
      ? `${total} online · ${waiting} wacht${waiting === 1 ? '' : 'en'} op een potje`
      : `${total} online aan het spelen`
}

// ---------------- Lobby ----------------

export interface LobbyActions {
  start(): void
  choice(c: MatchChoice): void
  team(): void
  ready(on: boolean): void
  leave(): void
}

export function showLobby(room: Room, on: LobbyActions) {
  const el = screen()
  const quick = room.quick
  const qr = qrcode(0, 'M')
  qr.addData(room.link)
  qr.make()
  const codeCard = `
      <div class="lb-code">
        ${room.isHost ? `<div class="lb-qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>` : ''}
        <div class="lb-codetext">
          <small>Code</small>
          <b>${room.code.split('').map((c) => `<i>${c}</i>`).join('')}</b>
          <span>${room.isHost ? 'Laat vrienden deze code invoeren of de QR-code scannen' : 'Deel deze code met wie nog mee wil doen'}</span>
          <button class="ghost2 lb-share">Link delen ⤴</button>
        </div>
      </div>`
  const quickCard = `
      <div class="qp-card">
        <div class="qp-radar"><i></i><i></i><i></i><svg viewBox="0 0 100 100"><circle class="qp-ring-bg" cx="50" cy="50" r="44"/><circle class="qp-ring" cx="50" cy="50" r="44"/></svg><b class="qp-time">--</b></div>
        <div class="qp-text"><small>OPENBARE LOBBY</small><b class="qp-title">Spelers zoeken…</b><span class="qp-sub"></span></div>
      </div>`
  el.innerHTML = `
    <div class="sel lobby lb2 ${quick ? 'quick' : ''}">
      <div class="sel-head">
        <button class="sel-back" aria-label="Verlaten">◀</button>
        <div class="sel-title"><small></small><b>${quick ? 'Snel spel' : 'Met vrienden'}</b></div>
      </div>
      <div class="lb-pages">
        <section class="lb-page on" data-page="lobby">
          ${quick ? quickCard : codeCard}
          ${quick ? '' : '<div class="lb-choice"><div class="cp"></div></div>'}
          <div class="lb-steps"></div>
          <div class="lb-list"></div>
        </section>
        <section class="lb-page lb-chat" data-page="chat">
          <div class="lb-log"></div>
          <div class="lb-quick">${QUICK_CHAT.map((q) => `<button>${q}</button>`).join('')}</div>
          <form class="lb-say"><input maxlength="${CHAT_MAX}" placeholder="Typ een bericht…" autocomplete="off" enterkeyhint="send"><button type="submit">➤</button></form>
        </section>
      </div>
      <div class="lb-dock">
        <button class="cta lb-start"></button>
        <nav class="lb-tabs">
          <button data-tab="lobby" class="on"><i>👥</i><span>Lobby</span><b class="lb-count"></b></button>
          <button data-tab="chat"><i>💬</i><span>Chat</span><b class="lb-unread hidden"></b></button>
          <button data-tab="team"><i>🎒</i><span>Team</span></button>
        </nav>
      </div>
      <div class="lb-toast hidden"></div>
    </div>`

  const root = el.querySelector('.lb2') as HTMLElement
  const list = el.querySelector('.lb-list') as HTMLElement
  const steps = el.querySelector('.lb-steps') as HTMLElement
  const start = el.querySelector('.lb-start') as HTMLButtonElement
  const head = el.querySelector('.sel-title small') as HTMLElement
  const log = el.querySelector('.lb-log') as HTMLElement
  const count = el.querySelector('.lb-count') as HTMLElement
  const unread = el.querySelector('.lb-unread') as HTMLElement
  const picker = quick ? null : choicePicker(el.querySelector('.lb-choice .cp') as HTMLElement, () => room.choice, room.isHost ? (c) => on.choice(c) : null)
  const others = () => room.players.filter((p) => p.pid !== room.players[0]?.pid)
  let page = 'lobby'
  let unreadN = 0

  // Quick play: the countdown ring and the "found so far" line
  const paintQuick = () => {
    if (!quick) return
    const left = Math.max(0, room.quickEnds - performance.now()) / 1000
    const n = room.players.length
    const ring = el.querySelector('.qp-ring') as SVGCircleElement | null
    if (!ring) return
    const time = el.querySelector('.qp-time') as HTMLElement
    time.textContent = room.running ? '▶' : `${Math.ceil(left)}`
    ring.style.strokeDashoffset = `${276.5 * (1 - Math.min(1, left / 45))}`
    const title = el.querySelector('.qp-title') as HTMLElement
    const sub = el.querySelector('.qp-sub') as HTMLElement
    title.textContent = room.running ? 'Potje is bezig' : n > 1 ? `${n} spelers gevonden!` : 'Spelers zoeken…'
    sub.textContent = room.running
      ? 'Je doet mee met het volgende potje'
      : `${n} speler${n === 1 ? '' : 's'} + ${Math.max(0, SEATS - n)} bots · start over ${Math.ceil(left)} s`
  }

  const refresh = () => {
    const bots = Math.max(0, SEATS - room.players.length)
    const me = room.players.find((p) => p.pid === room.me.pid) ?? room.me
    head.textContent = quick ? `OPENBARE LOBBY · ${room.players.length}/${QUICK_MAX}` : `${room.isHost ? 'JOUW POTJE' : 'LOBBY'} · ${room.players.length}/${MAX_PLAYERS} SPELERS`
    count.textContent = `${room.players.length}`
    if (picker && !room.isHost) picker.paint()
    const raid = room.choice.kind === 'raid'
    list.innerHTML = room.players.map((p, i) => {
      const tr = TRAINERS.find((t) => t.key === p.trainer) ?? TRAINERS[0]
      const isMe = p.pid === room.me.pid
      const ready = quick ? !!p.ready : i === 0 || p.ready
      const state = quick ? (p.ready ? 'START ✓' : 'wacht') : i === 0 ? 'HOST' : p.ready ? 'KLAAR ✓' : 'kiest…'
      return `
        <div class="lb-p ${isMe ? 'lb-me' : ''} ${ready ? 'ready' : ''}" style="--d:${i * 60}ms">
          <img class="px lb-tr" src="${trainerSpriteUrl(tr.sprite)}" alt="">
          <div class="lb-name"><b>${esc(p.name)}</b><span>${!quick && i === 0 ? '<em>HOST</em>' : ''}${isMe ? '<em class="you">JIJ</em>' : ''}${tr.name}${p.team[0] ? ` &amp; ${SPECIES[p.team[0]].name}` : ''}</span></div>
          ${p.team[0] ? gif(p.team[0], 'lb-mon') : ''}
          <span class="lb-state">${state}</span>
        </div>`
    }).join('') + (raid ? '<div class="lb-bots">Raid: samen tegen een willekeurige baas</div>' : `<div class="lb-bots">+ ${bots} bot${bots === 1 ? '' : 's'} vullen de arena aan</div>`)

    if (quick) {
      const n = room.players.length, votes = room.players.filter((p) => p.ready).length
      steps.innerHTML = n < 2
        ? '<b>Even wachten op andere spelers</b><span>Het potje begint vanzelf als de tijd om is; lege plekken worden bots. Geen zin om te wachten? Start meteen.</span>'
        : `<b>${votes}/${n} wil${votes === 1 ? '' : 'len'} nu starten</b><span>Als iedereen op Start tikt, begint het meteen. Anders zodra de tijd om is.</span>`
      start.disabled = room.running
      start.classList.toggle('on', !!me.ready)
      start.innerHTML = room.running
        ? 'Potje is bezig…<small>je doet mee met het volgende</small>'
        : n < 2
          ? 'Start nu met bots ▶<small>niet wachten op anderen</small>'
          : me.ready
            ? `Klaar ✓<small>wachten op de rest · ${votes}/${n}</small>`
            : `Start nu ▶<small>${votes}/${n} wil starten</small>`
    } else if (room.isHost) {
      const waiting = others().filter((p) => !p.ready)
      steps.innerHTML = room.players.length < 2
        ? '<b>Wacht op spelers</b><span>Deel de code of QR-code. Je kunt ook alleen starten tegen bots.</span>'
        : waiting.length
          ? `<b>Wachten tot iedereen klaar is</b><span>${waiting.map((p) => esc(p.name)).join(', ')} ${waiting.length === 1 ? 'kiest nog een' : 'kiezen nog hun'} team.</span>`
          : '<b>Iedereen is klaar!</b><span>Tik op Start om het potje te beginnen.</span>'
      start.disabled = room.running || waiting.length > 0
      start.innerHTML = room.running
        ? 'Potje loopt nog…'
        : waiting.length
          ? `Wachten… <small>${others().length - waiting.length}/${others().length} klaar</small>`
          : raid
            ? `Start raid! ▶<small>${room.players.length} speler${room.players.length === 1 ? '' : 's'} tegen een eindbaas</small>`
            : `Start! ▶<small>${room.players.length} speler${room.players.length === 1 ? '' : 's'} + ${bots} bots</small>`
    } else {
      steps.innerHTML = me.ready
        ? `<b>Je bent klaar ✓</b><span>Wachten tot ${esc(room.players[0]?.name ?? 'de host')} het potje start.</span>`
        : '<ol><li><b>Kies je trainer &amp; Pokémon</b> onder “Team”</li><li>Tik op <b>Klaar</b> zodra je team goed is</li></ol>'
      steps.classList.toggle('todo', !me.ready)
      start.disabled = room.running
      start.classList.toggle('on', !!me.ready)
      start.innerHTML = room.running ? 'Er loopt nog een potje…' : me.ready ? 'Klaar ✓<small>tik om te annuleren</small>' : 'Klaar ▶<small>ik heb mijn team</small>'
    }
    paintQuick()
  }

  const addLine = (m: ChatLine) => {
    const d = document.createElement('div')
    d.className = m.pid === room.me.pid ? 'mine' : ''
    d.innerHTML = `<b>${esc(m.name)}</b> ${esc(m.text)}`
    log.append(d)
    while (log.children.length > 60) log.firstChild!.remove()
    log.scrollTop = log.scrollHeight
  }
  room.chatLog.forEach(addLine)
  refresh()
  // The countdown ticks between lobby updates
  const ticker = window.setInterval(() => (document.body.contains(root) ? paintQuick() : clearInterval(ticker)), 250)

  const show = (p: string) => {
    page = p
    el.querySelectorAll<HTMLElement>('.lb-page').forEach((s) => s.classList.toggle('on', s.dataset.page === p))
    el.querySelectorAll<HTMLElement>('.lb-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === p))
    if (p === 'chat') {
      unreadN = 0
      unread.classList.add('hidden')
      log.scrollTop = log.scrollHeight
    }
  }
  el.querySelectorAll<HTMLElement>('.lb-tabs [data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      if (b.dataset.tab === 'team') on.team()
      else show(b.dataset.tab!)
    }),
  )
  el.querySelector('.sel-back')!.addEventListener('click', () => {
    sfx.select()
    on.leave()
  })
  start.addEventListener('click', () => {
    if (room.running) return
    sfx.select()
    if (room.isHost && !quick) on.start()
    else on.ready(!room.me.ready)
  })
  const input = el.querySelector('.lb-say input') as HTMLInputElement
  // While typing, the dock steps aside so the keyboard doesn't push everything up
  input.addEventListener('focus', () => root.classList.add('typing'))
  input.addEventListener('blur', () => root.classList.remove('typing'))
  el.querySelector('.lb-say')!.addEventListener('submit', (e) => {
    e.preventDefault()
    if (input.value.trim()) sfx.blip()
    room.say(input.value)
    input.value = ''
  })
  el.querySelectorAll<HTMLButtonElement>('.lb-quick button').forEach((b) => b.addEventListener('click', () => {
    sfx.blip()
    room.say(b.textContent!)
  }))
  el.querySelector('.lb-share')?.addEventListener('click', async (e) => {
    const share = e.currentTarget as HTMLButtonElement
    sfx.select()
    const data = { title: 'Stormbreak Royale', text: `Doe mee met mijn potje! Code ${room.code}`, url: room.link }
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
  const toastEl = el.querySelector('.lb-toast') as HTMLElement
  let toastT = 0
  return {
    refresh,
    chat: (m: ChatLine) => {
      addLine(m)
      if (m.pid !== room.me.pid) {
        sfx.blip()
        if (page !== 'chat') {
          unreadN++
          unread.textContent = `${unreadN}`
          unread.classList.remove('hidden')
        }
      }
    },
    toast: (text: string) => {
      toastEl.textContent = text
      toastEl.classList.remove('hidden')
      clearTimeout(toastT)
      toastT = window.setTimeout(() => toastEl.classList.add('hidden'), 3500)
    },
  }
}
