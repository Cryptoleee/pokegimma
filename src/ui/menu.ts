import { DUNGEON_LIST } from '../data/dungeons'
import qrcode from 'qrcode-generator'
import { animatedUrl, SPECIES, spriteUrl } from '../data/pokemon'
import { TRAINERS, trainerSpriteUrl, type TrainerDef } from '../data/trainers'
import { sfx } from '../audio'
import { CHAT_MAX, type Room } from '../net/room'
import type { ChatLine, MatchChoice } from '../net/protocol'
import { ROYALE_THEMES, THEMES } from '../data/themes'
import { SEATS } from '../game/game'
import { accountStatus } from '../account'
import { DIFFICULTIES, diffName, saveDiff, type Difficulty } from '../data/difficulty'
import { L } from '../i18n'
import { openInvite } from './friends'
import { progress } from '../progress'
import { local } from '../stats'
import { STADIUM_LIST, STADIUMS } from '../data/stadiums'
import { titleName } from '../data/rewards'
import { masteryOf, SHINY_AT } from '../../api/_progress'
import { discordAvatar, icon, IC, teamCard } from './app'
import { openTeamSheet } from './team'
import { storm, STORM_TINT } from './storm'

/** Your partner is shown shiny (unlocked with mastery and switched on). */
export function shinyPartner(id: number) {
  const p = progress()
  return p.shiny.includes(id) && masteryOf(p.partners[id] ?? 0).lv >= SHINY_AT
}

/**
 * Home menu (your team, name, solo or multiplayer) and the multiplayer lobby.
 */

const screen = () => document.getElementById('screen')!
/** Which raid is picked: a dungeon's id ('dungeon' and nothing mean the first one), or 'classic'. */
/** A dungeon opens once you've beaten the one before it. */
export const dungeonOpen = (id: string) => {
  const i = DUNGEON_LIST.findIndex((d) => d.id === id)
  return i <= 0 || (progress().stats.dg ?? []).includes(DUNGEON_LIST[i - 1].id)
}
/** On a test build (a preview, your own machine) a locked dungeon can still be played. */
export const dungeonPlayable = (id: string) => dungeonOpen(id) || local
/** The dungeon that's picked: the chosen one if you can play it, else the furthest one that's open. */
export const raidPick = (raid: string | undefined) => {
  if (raid === 'classic') return 'classic'
  const open = DUNGEON_LIST.filter((d) => dungeonOpen(d.id))
  return (DUNGEON_LIST.find((d) => d.id === raid && dungeonPlayable(d.id)) ?? open[open.length - 1] ?? DUNGEON_LIST[0])?.id ?? 'classic'
}
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function gif(id: number, cls = '', shiny = false) {
  return `<img class="px ${cls}" src="${animatedUrl(id, shiny)}" onerror="this.onerror=null;this.src='${spriteUrl(id, { shiny })}'" alt="">`
}

/** Quick chat phrases: one tap on a phone (in the current language). */
const quickPhrases = () => [
  'GG!',
  L('Ready?', 'Klaar?'),
  L('Wait a sec', 'Even wachten'),
  'Haha 😂',
  L('Watch out!', 'Let op!'),
  'Help!',
]
/** Call it (`QUICK_CHAT()`) or map over it (`QUICK_CHAT.map(...)`): both follow the current language. */
export const QUICK_CHAT = Object.assign(quickPhrases, {
  map: <T>(f: (q: string, i: number, all: string[]) => T): T[] => quickPhrases().map(f),
})

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
        <button data-kind="royale" class="${c.kind === 'royale' ? 'on' : ''}" ${ro ? 'disabled' : ''}><b>Battle Royale</b><small>${L('12 trainers · 1 winner', '12 trainers · 1 winnaar')}</small></button>
        <button data-kind="duel" class="${c.kind === 'duel' ? 'on' : ''}" ${ro ? 'disabled' : ''}><b>1 vs 1</b><small>${L('duel · best of 3', 'duel · best of 3')}</small></button>
        <button data-kind="raid" class="${c.kind === 'raid' ? 'on' : ''}" ${ro ? 'disabled' : ''}><b>Raid</b><small>${L('team up against a boss', 'samen tegen een eindbaas')}</small></button>
      </div>
      ${c.kind === 'duel'
        ? `<div class="cp-worlds">${(['random', ...STADIUM_LIST] as const).map((id) => {
            const st = id === 'random' ? null : STADIUMS[id]
            const th = st ? THEMES[st.theme] : null
            return `<button data-stadium="${id}" class="${(c.stadium ?? 'random') === id ? 'on' : ''}" ${ro ? 'disabled' : ''} style="--c:${th ? th.grass[0] : '#5a6a9a'};--c2:${th ? th.tall[0] : '#3a4470'}"><i>${st ? st.icon : '🎲'}</i>${st ? st.name : L('Random', 'Willekeurig')}</button>`
          }).join('')}</div>`
        : c.kind !== 'raid'
        ? `<div class="cp-worlds">${(['random', ...ROYALE_THEMES] as const).map((t) => {
            const th = t === 'random' ? null : THEMES[t]
            return `<button data-theme="${t}" class="${c.theme === t ? 'on' : ''}" ${ro ? 'disabled' : ''} style="--c:${th ? th.grass[0] : '#5a6a9a'};--c2:${th ? th.tall[0] : '#3a4470'}"><i>${th ? th.icon : '🎲'}</i>${th ? th.name : L('Random', 'Willekeurig')}</button>`
          }).join('')}</div>`
        : `<div class="cp-worlds cp-raid">${DUNGEON_LIST.map((dd) => {
          // (The host's progress decides: a guest just sees what's picked)
          const lock = !ro && !dungeonOpen(dd.id)
          return `<button data-raid="${dd.id}" class="${raidPick(c.raid) === dd.id ? 'on' : ''} ${lock ? 'locked' : ''}" ${ro || (lock && !local) ? 'disabled' : ''} style="--c:${dd.theme.dark};--c2:${dd.theme.accent}"><i>${lock ? '🔒' : dd.theme.icon}</i>${esc(dd.name)}</button>`
        }).join('')}<button data-raid="classic" class="${c.raid === 'classic' ? 'on' : ''}" ${ro ? 'disabled' : ''} style="--c:#5a6a9a;--c2:#3a4470"><i>🎲</i>${L('Classic: random boss', 'Klassiek: willekeurige baas')}</button></div>`}
      <div class="cp-diff" role="radiogroup" aria-label="${L('Difficulty', 'Moeilijkheid')}"><span>${c.kind === 'raid' ? L('Boss', 'Baas') : c.kind === 'duel' ? 'CPU' : 'Bots'}</span>${DIFFICULTIES.map((d) => `<button data-diff="${d}" role="radio" aria-checked="${(c.diff ?? 'normal') === d}" class="${(c.diff ?? 'normal') === d ? 'on' : ''}" ${ro ? 'disabled' : ''}>${diffName(d)}</button>`).join('')}</div>`
    el.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        if (!set) return
        sfx.select()
        const c = { ...get() }
        if (b.dataset.kind) c.kind = b.dataset.kind as MatchChoice['kind']
        if (b.dataset.theme) c.theme = b.dataset.theme as MatchChoice['theme']
        if (b.dataset.stadium) c.stadium = b.dataset.stadium as MatchChoice['stadium']
        if (b.dataset.raid) c.raid = b.dataset.raid as MatchChoice['raid']
        if (b.dataset.diff) {
          c.diff = b.dataset.diff as Difficulty
          saveDiff(c.diff)
        }
        set(c)
        paint()
      }),
    )
  }
  paint()
  return { paint }
}

// ---------------- Lobby ----------------

export interface LobbyActions {
  start(): void
  choice(c: MatchChoice): void
  /** The full Team screen (from the switch sheet's "see all"). */
  team(): void
  /** A quick switch from the sheet, staying in the lobby. */
  pickTeam(t: TrainerDef, mon: number): void
  ready(on: boolean): void
  leave(): void
}

/** Are you sure? Shown before leaving a lobby (button or the phone's back gesture). */
export function confirmLeaveLobby(room: Room, leave: () => void) {
  const modal = document.getElementById('modal')!
  const others = room.players.length - 1
  const text = room.quick
    ? L('You leave this public lobby. You can always find a new one with Quick play.', 'Je verlaat deze openbare lobby. Met Snel spel vind je altijd een nieuwe.')
    : room.isHost
      ? others > 0
        ? L(`You're the host: leaving closes the lobby for everyone (${others} other player${others === 1 ? '' : 's'}).`, `Jij bent de host: als je weggaat, sluit de lobby voor iedereen (${others} andere speler${others === 1 ? '' : 's'}).`)
        : L('You\'re the host: leaving closes this lobby and its code.', 'Jij bent de host: als je weggaat, sluit deze lobby en vervalt de code.')
      : L(`You can come back with code ${room.code}, or from the home screen.`, `Je kunt terugkomen met code ${room.code}, of via het home-scherm.`)
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel">
      <h2>${room.isHost && !room.quick ? L('Close the lobby?', 'Lobby sluiten?') : L('Leave the lobby?', 'Lobby verlaten?')}</h2>
      <p>${esc(text)}</p>
      <div class="actions">
        <button class="btn" id="stay">${L('Stay', 'Blijven')}</button>
        <button class="btn red" id="leave">${room.isHost && !room.quick ? L('Close lobby', 'Lobby sluiten') : L('Leave', 'Verlaten')}</button>
      </div>
    </div>`
  const close = () => {
    modal.classList.add('hidden')
    modal.innerHTML = ''
    modal.onclick = null
  }
  modal.querySelector('#stay')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.querySelector('#leave')!.addEventListener('click', () => {
    sfx.select()
    close()
    leave()
  })
  modal.onclick = (e) => {
    if (e.target === modal) close()
  }
}

export function showLobby(room: Room, on: LobbyActions) {
  const el = screen()
  const quick = room.quick
  const qr = qrcode(0, 'M')
  qr.addData(room.link)
  qr.make()
  const loggedIn = accountStatus() === 'in'
  const codeCard = `
      <section class="nl-code">
        ${room.isHost ? `<div class="nl-qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>` : ''}
        <div class="nl-codetext">
          <span class="n-label">${L('Lobby code', 'Lobbycode')}</span>
          <b>${esc(room.code)}</b>
          <small>${room.isHost ? L('Have friends enter this code or scan the QR code', 'Laat vrienden deze code invoeren of de QR-code scannen') : L('Share this code with anyone who wants to join', 'Deel deze code met wie nog mee wil doen')}</small>
          <div class="nl-codeacts">
            <button class="n-btn3 nl-share">${icon(IC.share, 16)}${L('Share link', 'Link delen')}</button>
            ${loggedIn ? `<button class="n-btn3 nl-invite">${icon(IC.plus, 16)}${L('Invite friends', 'Vrienden uitnodigen')}</button>` : ''}
          </div>
        </div>
      </section>`
  const quickCard = `
      <section class="nl-quick">
        <div class="nl-radar"><i></i><i></i><svg viewBox="0 0 100 100"><circle class="nl-ring-bg" cx="50" cy="50" r="44"/><circle class="nl-ring" cx="50" cy="50" r="44"/></svg><b class="nl-time">--</b></div>
        <div class="nl-qtext"><span class="n-label">${L('Public lobby', 'Openbare lobby')}</span><b class="nl-qtitle">${L('Finding players…', 'Spelers zoeken…')}</b><small class="nl-qsub"></small>${loggedIn ? `<button class="n-btn3 nl-invite">${icon(IC.plus, 16)}${L('Invite friends', 'Vrienden uitnodigen')}</button>` : ''}</div>
      </section>`
  const title = quick ? (room.choice.kind === 'duel' ? L('1 vs 1 online', '1 tegen 1 online') : L('Quick play', 'Snel spel')) : L('Lobby', 'Lobby')
  el.innerHTML = `
    <div class="n-app n-focus nl ${quick ? 'quick' : ''} ${room.isHost ? 'host' : ''}" data-tab="lobby">
      <main class="n-main">
        <div class="n-page nl-page">
          <header class="nl-head">
            <button class="n-icon nl-leave" data-act="leave" aria-label="${L('Leave the lobby', 'Lobby verlaten')}">${icon(IC.back)}</button>
            <div class="nl-title"><b>${title}</b><small class="nl-sub"></small></div>
            <span class="nl-me" data-acct-slot>${discordAvatar('n-av-chip')}</span>
            ${quick ? '' : `<button class="nl-pill nl-share" aria-label="${L(`Share code ${room.code}`, `Code ${room.code} delen`)}">${esc(room.code)}${icon(IC.share, 16)}</button>`}
          </header>
          <div class="nl-body">
            <div class="nl-col nl-left" data-page="lobby">
              <div class="nl-teamslot"></div>
              ${quick ? quickCard : ''}
              ${quick ? '' : `<section class="nl-choice"><div class="n-sec"><h3 class="n-h3">${L('Match', 'Potje')}</h3><small>${room.isHost ? L('you choose as host', 'jij kiest als host') : L('the host chooses', 'de host kiest')}</small></div><div class="cp"></div></section>`}
              <div class="nl-steps"></div>
              <div class="n-sec"><h3 class="n-h3">${L('Players', 'Spelers')} <span class="nl-count"></span></h3><small class="nl-botnote"></small></div>
              <div class="nl-list"></div>
              ${quick ? '' : `<button class="nl-addfriend">${icon(IC.plus, 16)}${L('Invite a friend', 'Nodig een vriend uit')}</button>`}
            </div>
            <div class="nl-col nl-right">
              ${quick ? '' : codeCard}
              <section class="nl-chat" data-page="chat">
                <div class="n-sec nl-chathead"><h3 class="n-h3">Chat</h3></div>
                <div class="nl-log" aria-live="polite" data-empty="${L('Say hi to the lobby 👋', 'Zeg hoi tegen de lobby 👋')}"></div>
                <div class="nl-quickchat">${QUICK_CHAT.map((q) => `<button>${q}</button>`).join('')}</div>
                <form class="nl-say"><input maxlength="${CHAT_MAX}" placeholder="${L('Type a message…', 'Typ een bericht…')}" autocomplete="off" enterkeyhint="send"><button type="submit" aria-label="${L('Send', 'Versturen')}">${icon('<path d="M4 12l16-8-6 16-3-7z"/>', 18)}</button></form>
              </section>
            </div>
          </div>
          <div class="nl-dock">
            <button class="nl-chatbtn" aria-label="Chat">${icon(IC.chat, 22)}<i class="nl-unread hidden"></i></button>
            <button class="n-btn nl-start lb-start"></button>
          </div>
          <div class="nl-toast hidden" role="status"></div>
        </div>
      </main>
    </div>`

  const root = el.querySelector('.nl') as HTMLElement
  storm(root, STORM_TINT[room.choice.kind])
  const list = el.querySelector('.nl-list') as HTMLElement
  const steps = el.querySelector('.nl-steps') as HTMLElement
  const start = el.querySelector('.nl-start') as HTMLButtonElement
  const head = el.querySelector('.nl-sub') as HTMLElement
  const log = el.querySelector('.nl-log') as HTMLElement
  const count = el.querySelector('.nl-count') as HTMLElement
  const botNote = el.querySelector('.nl-botnote') as HTMLElement
  const unread = el.querySelector('.nl-unread') as HTMLElement
  const teamSlot = el.querySelector('.nl-teamslot') as HTMLElement
  const picker = quick ? null : choicePicker(el.querySelector('.nl-choice .cp') as HTMLElement, () => room.choice, room.isHost ? (c) => on.choice(c) : null)
  const others = () => room.players.filter((p) => p.pid !== room.players[0]?.pid)
  let page = 'lobby'
  let unreadN = 0
  // What someone just said pops up over their row in the list (kept when the list repaints)
  const said = new Map<string, { text: string; t: number }>()
  const BUBBLE_MS = 5000
  const bubble = (pid: string, fresh: boolean) => {
    const b = said.get(pid)
    if (!b || performance.now() - b.t > BUBBLE_MS) return ''
    return `<span class="nl-bub ${fresh ? '' : 'stay'} ${pid === room.me.pid ? 'mine' : ''}" style="--left:${BUBBLE_MS - (performance.now() - b.t)}ms">${esc(b.text)}</span>`
  }
  const sayOver = (m: ChatLine) => {
    said.set(m.pid, { text: m.text, t: performance.now() })
    const row = [...root.querySelectorAll<HTMLElement>('.nl-p')].find((r) => r.dataset.pid === m.pid)
    if (!row) return
    row.querySelector('.nl-bub')?.remove()
    row.querySelector('.nl-p-pic')!.insertAdjacentHTML('afterend', bubble(m.pid, true))
  }
  let teamKey = ''

  // Your team, big, with Switch: changing it right here is how you level other partners
  const paintTeam = () => {
    const tr = TRAINERS.find((t) => t.key === room.me.trainer) ?? TRAINERS[0]
    const mon = room.me.team[0]
    const key = `${tr.key}:${mon}:${progress().partners[mon] ?? 0}`
    if (key === teamKey) return
    teamKey = key
    teamSlot.innerHTML = teamCard(tr, mon, shinyPartner(mon))
    teamSlot.querySelector('[data-act="switch"]')!.addEventListener('click', () => {
      sfx.select()
      openTeamSheet({ trainer: tr, mon, pick: (t, m) => on.pickTeam(t, m), seeAll: on.team })
    })
  }

  // Quick play: the countdown ring and the "found so far" line
  const paintQuick = () => {
    if (!quick) return
    const left = Math.max(0, room.quickEnds - performance.now()) / 1000
    const n = room.players.length
    const duel = room.choice.kind === 'duel'
    const ring = el.querySelector('.nl-ring') as SVGCircleElement | null
    if (!ring) return
    const time = el.querySelector('.nl-time') as HTMLElement
    time.textContent = room.running ? '▶' : `${Math.ceil(left)}`
    ring.style.strokeDashoffset = `${276.5 * (1 - Math.min(1, left / room.quickWait))}`
    const title = el.querySelector('.nl-qtitle') as HTMLElement
    const sub = el.querySelector('.nl-qsub') as HTMLElement
    title.textContent = room.running
      ? L('Match in progress', 'Potje is bezig')
      : duel
        ? n > 1 ? L('Opponent found!', 'Tegenstander gevonden!') : L('Finding an opponent…', 'Tegenstander zoeken…')
        : n > 1 ? L(`${n} players found!`, `${n} spelers gevonden!`) : L('Finding players…', 'Spelers zoeken…')
    sub.textContent = room.running
      ? L('You\'ll join the next match', 'Je doet mee met het volgende potje')
      : duel
        ? n > 1
          ? L(`The duel starts in ${Math.ceil(left)} s`, `Het duel start over ${Math.ceil(left)} s`)
          : L(`No one in ${Math.ceil(left)} s? Then you face the CPU`, `Niemand binnen ${Math.ceil(left)} s? Dan speel je tegen de CPU`)
      : L(
          `${n} player${n === 1 ? '' : 's'} + ${Math.max(0, SEATS - n)} bots · starts in ${Math.ceil(left)} s`,
          `${n} speler${n === 1 ? '' : 's'} + ${Math.max(0, SEATS - n)} bots · start over ${Math.ceil(left)} s`,
        )
  }

  /** "Battle Royale · Forest": what this lobby is going to play. */
  const matchLine = () => {
    const c = room.choice
    if (c.kind === 'raid') return c.raid === 'classic' || !DUNGEON_LIST.length ? `Raid · ${L('random boss', 'willekeurige baas')}` : `Raid · ${DUNGEON_LIST.find((d) => d.id === raidPick(c.raid))?.name ?? ''}`
    if (c.kind === 'duel') return `1 vs 1 · ${c.stadium && c.stadium !== 'random' ? STADIUMS[c.stadium].name : L('random stadium', 'willekeurig stadion')}`
    return `Battle Royale · ${c.theme && c.theme !== 'random' ? THEMES[c.theme].name : L('random world', 'willekeurige wereld')}`
  }

  const refresh = () => {
    const bots = Math.max(0, SEATS - room.players.length)
    const me = room.players.find((p) => p.pid === room.me.pid) ?? room.me
    head.textContent = quick ? matchLine().replace(/ · .*/, '') : matchLine()
    count.textContent = `${room.players.length}/${room.cap}`
    root.classList.toggle('alone', room.players.length < 2)
    paintTeam()
    if (picker && !room.isHost) picker.paint()
    const raid = room.choice.kind === 'raid'
    const duel = room.choice.kind === 'duel'
    list.innerHTML = room.players.map((p, i) => {
      const tr = TRAINERS.find((t) => t.key === p.trainer) ?? TRAINERS[0]
      const isMe = p.pid === room.me.pid
      const ready = quick ? !!p.ready : i === 0 || p.ready
      const state = quick ? (p.ready ? 'Start ✓' : L('waiting', 'wacht')) : i === 0 ? 'Host' : p.ready ? L('Ready', 'Klaar') : L('Picking…', 'Kiest team')
      const tags = [isMe ? L('you', 'jij') : '', !quick && i === 0 ? 'host' : ''].filter(Boolean).join(' · ')
      const lv = p.lv ? `Lv ${Math.max(1, Math.min(99, Number(p.lv) || 1))} · ` : ''
      return `
        <div class="nl-p ${isMe ? 'me' : ''} ${ready ? 'ready' : ''}" style="--d:${i * 60}ms" data-pid="${esc(p.pid)}">
          <span class="nl-p-pic"><img class="px" src="${trainerSpriteUrl(tr.sprite)}" alt="">${p.team[0] ? gif(p.team[0], '', !!p.shiny) : ''}</span>${bubble(p.pid, false)}
          <span class="nl-p-info"><b>${esc(p.name)}${tags ? ` <em>(${tags})</em>` : ''}</b><small>${lv}${p.title ? `${esc(titleName(String(p.title)))} · ` : ''}${tr.name}${p.team[0] ? ` &amp; ${SPECIES[p.team[0]].name}` : ''}</small></span>
          <span class="nl-state">${state}</span>
        </div>`
    }).join('')
    botNote.textContent = duel
      ? room.players.length < 2 ? L('alone you face the CPU', 'alleen speel je tegen de CPU') : L('best of 3', 'best of 3')
      : raid
        ? L('together against a random boss', 'samen tegen een willekeurige baas')
        : L(`+ ${bots} bot${bots === 1 ? '' : 's'} fill up the arena`, `+ ${bots} bot${bots === 1 ? '' : 's'} vullen de arena aan`)

    if (quick) {
      const n = room.players.length, votes = room.players.filter((p) => p.ready).length
      steps.innerHTML = n < 2 && duel
        ? L(
            '<b>Looking for an opponent</b><span>Someone else tapping 1 vs 1 online lands here. Don\'t want to wait? Play the CPU right away.</span>',
            '<b>Even zoeken naar een tegenstander</b><span>Wie ook 1 tegen 1 online kiest, komt hier terecht. Geen zin om te wachten? Speel meteen tegen de CPU.</span>',
          )
        : n < 2
        ? L(
            '<b>Waiting for other players</b><span>The match starts by itself when time runs out; empty spots become bots. Don\'t want to wait? Start right away.</span>',
            '<b>Even wachten op andere spelers</b><span>Het potje begint vanzelf als de tijd om is; lege plekken worden bots. Geen zin om te wachten? Start meteen.</span>',
          )
        : L(
            `<b>${votes}/${n} want${votes === 1 ? 's' : ''} to start now</b><span>If everyone taps Start, it begins right away. Otherwise when time runs out.</span>`,
            `<b>${votes}/${n} wil${votes === 1 ? '' : 'len'} nu starten</b><span>Als iedereen op Start tikt, begint het meteen. Anders zodra de tijd om is.</span>`,
          )
      start.disabled = room.running
      start.classList.toggle('on', !!me.ready)
      start.innerHTML = room.running
        ? L('Match in progress…<small>you\'ll join the next one</small>', 'Potje is bezig…<small>je doet mee met het volgende</small>')
        : n < 2 && duel
          ? L('Play the CPU now<small>don\'t wait for an opponent</small>', 'Nu tegen de CPU<small>niet wachten op een tegenstander</small>')
        : n < 2
          ? L('Start now with bots<small>don\'t wait for others</small>', 'Start nu met bots<small>niet wachten op anderen</small>')
          : me.ready
            ? L(`Ready ✓<small>waiting for the rest · ${votes}/${n}</small>`, `Klaar ✓<small>wachten op de rest · ${votes}/${n}</small>`)
            : L(`Start now<small>${votes}/${n} want${votes === 1 ? 's' : ''} to start</small>`, `Start nu<small>${votes}/${n} wil starten</small>`)
    } else if (room.isHost) {
      const waiting = others().filter((p) => !p.ready)
      const names = waiting.map((p) => esc(p.name)).join(', ')
      steps.innerHTML = room.players.length < 2
        ? L(
            room.choice.kind === 'duel' ? '<b>Waiting for your opponent</b><span>Share the code or QR code. You can also start alone against the CPU.</span>' : '<b>Waiting for players</b><span>Share the code or QR code. You can also start alone against bots.</span>',
            room.choice.kind === 'duel' ? '<b>Wacht op je tegenstander</b><span>Deel de code of QR-code. Je kunt ook alleen starten tegen de CPU.</span>' : '<b>Wacht op spelers</b><span>Deel de code of QR-code. Je kunt ook alleen starten tegen bots.</span>',
          )
        : waiting.length
          ? L(
              `<b>Waiting until everyone is ready</b><span>${names} ${waiting.length === 1 ? 'is' : 'are'} still picking a team.</span>`,
              `<b>Wachten tot iedereen klaar is</b><span>${names} ${waiting.length === 1 ? 'kiest nog een' : 'kiezen nog hun'} team.</span>`,
            )
          : L(
              '<b>Everyone is ready!</b><span>Tap Start to begin the match.</span>',
              '<b>Iedereen is klaar!</b><span>Tik op Start om het potje te beginnen.</span>',
            )
      start.disabled = room.running || waiting.length > 0
      const np = room.players.length
      start.innerHTML = room.running
        ? L('Match still running…', 'Potje loopt nog…')
        : waiting.length
          ? L(`Waiting… <small>${others().length - waiting.length}/${others().length} ready</small>`, `Wachten… <small>${others().length - waiting.length}/${others().length} klaar</small>`)
          : duel
            ? np < 2
              ? L('Start 1 vs 1<small>against the CPU</small>', 'Start 1 tegen 1<small>tegen de CPU</small>')
              : L(`Start 1 vs 1<small>you vs. ${esc(others()[0]?.name ?? '')}</small>`, `Start 1 tegen 1<small>jij tegen ${esc(others()[0]?.name ?? '')}</small>`)
          : raid
            ? L(`Start raid<small>${np} player${np === 1 ? '' : 's'} vs. a boss</small>`, `Start raid<small>${np} speler${np === 1 ? '' : 's'} tegen een eindbaas</small>`)
            : L(`Start match<small>${np} player${np === 1 ? '' : 's'} + ${bots} bots</small>`, `Start potje<small>${np} speler${np === 1 ? '' : 's'} + ${bots} bots</small>`)
    } else {
      steps.innerHTML = me.ready
        ? L(
            `<b>You're ready ✓</b><span>Waiting for ${esc(room.players[0]?.name ?? 'the host')} to start the match.</span>`,
            `<b>Je bent klaar ✓</b><span>Wachten tot ${esc(room.players[0]?.name ?? 'de host')} het potje start.</span>`,
          )
        : L(
            '<b>Happy with your team?</b><span>Switch it above if you like, then tap Ready.</span>',
            '<b>Tevreden met je team?</b><span>Wissel het hierboven als je wilt en tik dan op Klaar.</span>',
          )
      steps.classList.toggle('todo', !me.ready)
      start.disabled = room.running
      start.classList.toggle('on', !!me.ready)
      start.innerHTML = room.running
        ? L('A match is still running…', 'Er loopt nog een potje…')
        : me.ready
          ? L('Ready ✓<small>tap to cancel</small>', 'Klaar ✓<small>tik om te annuleren</small>')
          : L('I\'m ready<small>my team is set</small>', 'Ik ben klaar<small>mijn team staat</small>')
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

  // Phones: the lobby or the chat (the chat button flips between them). Desktop shows both.
  const wide = matchMedia('(min-width: 1100px)')
  const show = (p: string) => {
    page = p
    root.dataset.page = p
    if (p === 'chat' || wide.matches) {
      unreadN = 0
      unread.classList.add('hidden')
      log.scrollTop = log.scrollHeight
    }
  }
  show('lobby')
  el.querySelector('.nl-chatbtn')!.addEventListener('click', () => {
    sfx.select()
    show(page === 'chat' ? 'lobby' : 'chat')
  })
  el.querySelector('.nl-leave')!.addEventListener('click', () => {
    sfx.select()
    if (page === 'chat' && !wide.matches) return show('lobby')
    confirmLeaveLobby(room, on.leave)
  })
  start.addEventListener('click', () => {
    if (room.running) return
    sfx.select()
    if (room.isHost && !quick) on.start()
    else on.ready(!room.me.ready)
  })
  const input = el.querySelector('.nl-say input') as HTMLInputElement
  // While typing, the dock steps aside so the keyboard doesn't push everything up
  input.addEventListener('focus', () => root.classList.add('typing'))
  input.addEventListener('blur', () => root.classList.remove('typing'))
  el.querySelector('.nl-say')!.addEventListener('submit', (e) => {
    e.preventDefault()
    if (input.value.trim()) sfx.blip()
    room.say(input.value)
    input.value = ''
  })
  el.querySelectorAll<HTMLButtonElement>('.nl-quickchat button').forEach((b) => b.addEventListener('click', () => {
    sfx.blip()
    room.say(b.textContent!)
  }))
  const share = async (btn: HTMLElement) => {
    sfx.select()
    const data = { title: 'Stormbreak Royale', text: L(`Join my match! Code ${room.code}`, `Doe mee met mijn potje! Code ${room.code}`), url: room.link }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(room.link)
        toast(L('Link copied ✓', 'Link gekopieerd ✓'))
        btn.classList.add('done')
      }
    } catch {
      /* cancelled */
    }
  }
  el.querySelectorAll<HTMLElement>('.nl-share').forEach((b) => b.addEventListener('click', () => share(b)))
  el.querySelectorAll<HTMLElement>('.nl-invite').forEach((b) => b.addEventListener('click', () => {
    sfx.select()
    openInvite(room)
  }))
  el.querySelector('.nl-addfriend')?.addEventListener('click', (e) => {
    if (accountStatus() === 'in') {
      sfx.select()
      openInvite(room)
    } else share(e.currentTarget as HTMLElement)
  })
  const toastEl = el.querySelector('.nl-toast') as HTMLElement
  let toastT = 0
  const toast = (text: string) => {
    toastEl.textContent = text
    toastEl.classList.remove('hidden')
    clearTimeout(toastT)
    toastT = window.setTimeout(() => toastEl.classList.add('hidden'), 3500)
  }
  return {
    refresh,
    chat: (m: ChatLine) => {
      addLine(m)
      sayOver(m)
      if (m.pid !== room.me.pid) {
        sfx.blip()
        if (page !== 'chat' && !wide.matches) {
          unreadN++
          unread.classList.remove('hidden')
        }
      }
    },
    toast,
  }
}
