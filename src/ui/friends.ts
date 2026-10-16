import { sfx } from '../audio'
import { accountState, accountStatus, friendAction, joinable, login, logout, onAccount, setFast, type Friend, type FriendResult, type Invite } from '../account'
import { MAX_PLAYERS, QUICK_MAX, type Room } from '../net/room'
import { L } from '../i18n'
import { esc } from './menu'

/**
 * Friends: the card on the home screen, the friends sheet (log in with Discord,
 * your friend code, requests, who's online and a Join button), the lobby's
 * "invite friends" list and the invite pop-up.
 */

const MAX = { quick: QUICK_MAX, room: MAX_PLAYERS }
const DISCORD = '<svg class="dc" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>'

const avatar = (url: string, cls = 'fr-av') => `<img class="${cls}" src="${esc(url)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`

function statusLine(f: Friend) {
  const p = f.pres
  if (!f.online || !p) return L('Offline', 'Offline')
  if (p.s === 'game' || (p.s === 'lobby' && p.run)) return L('In a match', 'In een potje')
  if (p.s === 'lobby') {
    const quick = (p.q ?? -1) >= 0
    const max = quick ? QUICK_MAX : MAX_PLAYERS
    const where = quick ? L('Quick play lobby', 'Snel spel-lobby') : `Lobby <span class="cd">${p.code}</span>`
    return `${where} · ${p.n ?? 1}/${max}${(p.n ?? 0) >= max ? L(' · full', ' · vol') : ''}`
  }
  return L('Online · on the home screen', 'Online · op het home-scherm')
}

const rank = (f: Friend) => (joinable(f.pres, MAX) ? 0 : f.online ? 1 : 2)

// ---------------------------------------------------------------- home card

/** The friends card on the home screen (empty when accounts are off). */
export function friendsCard() {
  return '<button class="home-friends hidden"></button>'
}

export function paintFriendsCard(btn: HTMLElement) {
  const st = accountStatus()
  btn.classList.toggle('hidden', st === 'off' || st === 'loading')
  const s = accountState()
  if (!s) {
    btn.innerHTML = `<i class="hf-dc">${DISCORD}</i><span><b>${L('Friends', 'Vrienden')}</b><small>${L('Log in with Discord to add friends (optional)', 'Log in met Discord om vrienden toe te voegen (optioneel)')}</small></span><em>▶</em>`
    return
  }
  const online = s.friends.filter((f) => f.online).length
  const lobbies = s.friends.filter((f) => joinable(f.pres, MAX)).length
  const asks = s.requests.length
  btn.innerHTML = `${avatar(s.me.avatar, 'hf-me')}<span><b>${L('Friends', 'Vrienden')}</b><small>${
    s.friends.length
      ? `<i class="dot ${online ? 'on' : ''}"></i>${L(`${online} online`, `${online} online`)}${lobbies ? L(` · ${lobbies} in a lobby you can join`, ` · ${lobbies} in een lobby waar je bij kunt`) : ''}`
      : L('Add your first friend with their friend code', 'Voeg je eerste vriend toe met een vriendcode')
  }</small></span>${asks ? `<b class="hf-badge">${asks}</b>` : ''}<em>▶</em>`
}

// ---------------------------------------------------------------- sheet

export interface FriendsActions {
  join(code: string, q: number): void
}

const RESULT: Record<FriendResult, () => string> = {
  ok: () => '',
  sent: () => L('Request sent! They\'ll see it next time they\'re online.', 'Verzoek verstuurd! Ze zien het zodra ze online zijn.'),
  friends: () => L('You\'re friends now 🎉', 'Jullie zijn nu vrienden 🎉'),
  already: () => L('You\'re already friends.', 'Jullie zijn al vrienden.'),
  notfound: () => L('No player found with that code.', 'Geen speler gevonden met die code.'),
  self: () => L('That\'s your own code 😄', 'Dat is je eigen code 😄'),
  full: () => L('Friend list or requests are full.', 'Vriendenlijst of verzoeken zitten vol.'),
  invited: () => '',
  deleted: () => '',
  error: () => L('Something went wrong. Try again.', 'Er ging iets mis. Probeer het opnieuw.'),
}

/** Open the friends sheet (inside `host`, e.g. the home screen). */
export function openFriends(host: HTMLElement, on: FriendsActions) {
  host.querySelector('.fr-sheet')?.remove()
  const sheet = document.createElement('div')
  sheet.className = 'sheet fr-sheet'
  sheet.innerHTML = `<div class="sheet-card"><button class="sheet-x" aria-label="${L('Close', 'Sluiten')}">✕</button><h3>${L('Friends', 'Vrienden')}</h3><div class="fr-body"></div></div>`
  host.append(sheet)
  const body = sheet.querySelector('.fr-body') as HTMLElement
  let msg = ''
  let msgErr = false
  let armed = ''
  let typed = ''

  const paint = () => {
    const s = accountState()
    // Keep what you were typing across repaints
    typed = (body.querySelector('.fr-add input') as HTMLInputElement | null)?.value ?? typed
    if (!s) {
      body.innerHTML = `
        <p>${L('Log in with Discord to add friends, see who\'s online and join their lobby in one tap.', 'Log in met Discord om vrienden toe te voegen, te zien wie er online is en met één tik in hun lobby te springen.')}</p>
        <button class="cta fr-login">${DISCORD} ${L('Log in with Discord', 'Inloggen met Discord')}</button>
        <small class="fr-fine">${L('Optional: you can always keep playing as a guest. We only get your Discord name and avatar.', 'Optioneel: je kunt altijd als gast blijven spelen. We krijgen alleen je Discord-naam en avatar.')}</small>`
      body.querySelector('.fr-login')!.addEventListener('click', () => {
        sfx.select()
        login()
      })
      return
    }
    const friends = [...s.friends].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    body.innerHTML = `
      <div class="fr-me">${avatar(s.me.avatar)}<span><b>${esc(s.me.dname)}</b><small>${L('Logged in with Discord', 'Ingelogd met Discord')}</small></span><button class="ghost2 fr-out">${L('Log out', 'Uitloggen')}</button></div>
      <div class="fr-code"><small>${L('YOUR FRIEND CODE', 'JOUW VRIENDCODE')}</small><b>${esc(s.me.code)}</b><button class="ghost2 fr-copy">${L('Copy', 'Kopieer')}</button></div>
      <form class="fr-add"><input maxlength="6" placeholder="${L('Friend code', 'Vriendcode')}" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(typed)}"><button type="submit">${L('Add', 'Toevoegen')}</button></form>
      <div class="fr-msg ${msgErr ? 'err' : ''}">${esc(msg)}</div>
      ${s.requests.length ? `<div class="fr-h">${L('Friend requests', 'Vriendverzoeken')}</div>${s.requests.map((r) => `
        <div class="fr-row req">${avatar(r.avatar)}<span><b>${esc(r.name)}</b><small>${L('wants to be your friend', 'wil je vriend worden')}</small></span>
          <button class="fr-yes" data-id="${esc(r.id)}" aria-label="${L('Accept', 'Accepteren')}">✓</button><button class="fr-no" data-id="${esc(r.id)}" aria-label="${L('Decline', 'Weigeren')}">✕</button></div>`).join('')}` : ''}
      <div class="fr-h">${L('Friends', 'Vrienden')} · ${s.friends.filter((f) => f.online).length}/${s.friends.length} online</div>
      <div class="fr-list">${friends.length ? friends.map((f) => `
        <div class="fr-row ${f.online ? 'on' : ''}"><span class="fr-avw">${avatar(f.avatar)}<i></i></span><span><b>${esc(f.pres?.name || f.name)}</b><small>${statusLine(f)}</small></span>
          ${joinable(f.pres, MAX) ? `<button class="fr-join" data-code="${esc(f.pres!.code!)}" data-q="${f.pres!.q ?? -1}">${L('Join ▶', 'Meedoen ▶')}</button>` : ''}
          <button class="fr-rm ${armed === f.id ? 'armed' : ''}" data-id="${esc(f.id)}" aria-label="${L('Remove friend', 'Vriend verwijderen')}">${armed === f.id ? L('Remove?', 'Weg?') : '✕'}</button></div>`).join('') : `<div class="fr-empty">${L('No friends yet. Send them your code!', 'Nog geen vrienden. Stuur ze je code!')}</div>`}</div>
      <button class="fr-del ${armed === 'me' ? 'armed' : ''}">${armed === 'me' ? L('Tap again to delete your account for good', 'Tik nog eens om je account echt te verwijderen') : L('Delete account', 'Account verwijderen')}</button>`

    const act = async (body: Parameters<typeof friendAction>[0], keepMsg = false) => {
      const r = await friendAction(body)
      if (!keepMsg || RESULT[r]()) {
        msg = RESULT[r]()
        msgErr = r === 'error' || r === 'notfound' || r === 'self' || r === 'full'
      }
      if (msgErr) sfx.error()
      paint()
      return r
    }
    const input = body.querySelector('.fr-add input') as HTMLInputElement
    input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')))
    body.querySelector('.fr-add')!.addEventListener('submit', (e) => {
      e.preventDefault()
      const code = input.value
      if (code.length !== 6) {
        msg = L('A friend code has 6 characters', 'Een vriendcode heeft 6 tekens')
        msgErr = true
        sfx.error()
        return paint()
      }
      sfx.select()
      void act({ a: 'add', code }).then((r) => {
        if (r === 'sent' || r === 'friends' || r === 'already') {
          typed = ''
          paint()
        }
      })
    })
    body.querySelector('.fr-copy')!.addEventListener('click', () => {
      sfx.select()
      void navigator.clipboard?.writeText(s.me.code).then(() => {
        msg = L('Copied! Send it to your friends.', 'Gekopieerd! Stuur hem naar je vrienden.')
        msgErr = false
        paint()
      })
    })
    body.querySelector('.fr-out')!.addEventListener('click', () => {
      sfx.select()
      void logout()
    })
    body.querySelectorAll<HTMLElement>('.fr-yes').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      void act({ a: 'accept', id: b.dataset.id })
    }))
    body.querySelectorAll<HTMLElement>('.fr-no').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      void act({ a: 'decline', id: b.dataset.id })
    }))
    body.querySelectorAll<HTMLElement>('.fr-join').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      close()
      on.join(b.dataset.code!, Number(b.dataset.q))
    }))
    body.querySelectorAll<HTMLElement>('.fr-rm').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      if (armed !== b.dataset.id) {
        armed = b.dataset.id!
        return paint()
      }
      armed = ''
      void act({ a: 'remove', id: b.dataset.id })
    }))
    body.querySelector('.fr-del')!.addEventListener('click', () => {
      sfx.select()
      if (armed !== 'me') {
        armed = 'me'
        return paint()
      }
      armed = ''
      void act({ a: 'delete' })
    })
  }

  const off = onAccount(() => (document.body.contains(sheet) ? paint() : off()))
  const close = () => {
    setFast(false)
    off()
    sheet.classList.remove('open')
    setTimeout(() => sheet.remove(), 350)
  }
  sheet.querySelector('.sheet-x')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  sheet.addEventListener('click', (e) => e.target === sheet && close())
  paint()
  setFast(true)
  requestAnimationFrame(() => sheet.classList.add('open'))
}

// ---------------------------------------------------------------- lobby

/** In a lobby: a list of your online friends with an Invite button each. */
export function openInvite(room: Room) {
  const modal = document.getElementById('modal')!
  modal.classList.remove('hidden')
  const sent = new Set<string>()
  const inLobby = () => new Set(room.players.map((p) => p.name))
  const paint = () => {
    const s = accountState()
    const list = (s?.friends ?? []).filter((f) => f.online).sort((a, b) => rank(a) - rank(b))
    modal.innerHTML = `
      <div class="panel fr-invite">
        <h2>${L('Invite friends', 'Vrienden uitnodigen')}</h2>
        <div class="fr-list">${list.length ? list.map((f) => {
          const here = f.pres?.code === room.code || inLobby().has(f.pres?.name ?? '\u0000')
          const busy = f.pres?.s === 'game' || !!f.pres?.run
          return `<div class="fr-row on"><span class="fr-avw">${avatar(f.avatar)}<i></i></span><span><b>${esc(f.pres?.name || f.name)}</b><small>${here ? L('Already in this lobby', 'Zit al in deze lobby') : statusLine(f)}</small></span>
            ${here ? '' : `<button class="fr-join fr-inv ${sent.has(f.id) ? 'sent' : ''}" data-id="${esc(f.id)}" ${sent.has(f.id) ? 'disabled' : ''}>${sent.has(f.id) ? L('Sent ✓', 'Verstuurd ✓') : busy ? L('Invite for later', 'Nodig uit voor straks') : L('Invite', 'Uitnodigen')}</button>`}</div>`
        }).join('') : `<div class="fr-empty">${L('None of your friends are online right now.', 'Er zijn nu geen vrienden online.')}</div>`}</div>
        <button class="btn" id="fr-done">${L('Done', 'Klaar')}</button>
      </div>`
    modal.querySelector('#fr-done')!.addEventListener('click', close)
    modal.querySelectorAll<HTMLElement>('.fr-inv').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      sent.add(b.dataset.id!)
      paint()
      void friendAction({ a: 'invite', id: b.dataset.id, code: room.code, q: room.quickSlot })
    }))
  }
  const off = onAccount(() => (modal.querySelector('.fr-invite') ? paint() : off()))
  const close = () => {
    sfx.select()
    setFast(false)
    off()
    modal.classList.add('hidden')
    modal.innerHTML = ''
    modal.onclick = null
  }
  modal.onclick = (e) => e.target === modal && close()
  paint()
  setFast(true)
}

// ---------------------------------------------------------------- invites

let toastEl: HTMLElement | null = null

/** A friend invited you: a pop-up with Join (only shown on the home screen or in a lobby). */
export function showInviteToast(inv: Invite, join: () => void) {
  toastEl?.remove()
  const t = document.createElement('div')
  t.className = 'fr-toast'
  t.innerHTML = `${avatar(inv.avatar)}<span><b>${esc(inv.name)}</b><small>${L('invites you to their lobby', 'nodigt je uit voor de lobby')}</small></span><button class="fr-join">${L('Join ▶', 'Meedoen ▶')}</button><button class="fr-no" aria-label="${L('Ignore', 'Negeren')}">✕</button>`
  document.body.append(t)
  toastEl = t
  sfx.banner()
  const close = () => {
    t.classList.add('out')
    setTimeout(() => t.remove(), 300)
    if (toastEl === t) toastEl = null
  }
  t.querySelector('.fr-join')!.addEventListener('click', () => {
    sfx.select()
    close()
    join()
  })
  t.querySelector('.fr-no')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  setTimeout(close, 20_000)
}

/** Hide any open invite pop-up (e.g. a match starts). */
export function hideInviteToast() {
  toastEl?.remove()
  toastEl = null
}
