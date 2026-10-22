import { DUO_CHANNEL, type DuoCmd, type DuoMsg, type DuoState, type PresentationConnection, type PresentationConnectionList } from '../duo'
import { spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { itemUrl } from '../game/sprites'
import { QUICK_CHAT } from './menu'
import { appEsc as esc } from './app'
import { setLang } from '../i18n'
import logoUrl from '../assets/stormbreak-logo-small.webp'

/**
 * The second screen (/duo): the AYN Thor's lower display, or any window next
 * to the game. Shows the map (or the boss, or the duel score), your team, your
 * items and the chat, and turns taps into commands for the game: switch
 * Pokémon, use an item, say something, open the scoreboard or pause.
 */

type Link = { send: (m: DuoMsg) => void }

const ITEMS = [
  ['master', 'master-ball', 'Master Ball'],
  ['potion', 'potion', 'Potion'],
  ['revive', 'revive', 'Revive'],
] as const

export function startDuoView() {
  document.title = 'Stormbreak · 2nd screen'
  document.body.classList.add('duo-view')
  const root = document.getElementById('screen')!
  const links: Link[] = []

  // Same browser: a BroadcastChannel; presented by the game: the presentation's connection(s)
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DUO_CHANNEL) : null
  if (channel) {
    channel.onmessage = (e: MessageEvent) => receive(e.data)
    links.push({ send: (m) => channel.postMessage(m) })
  }
  // Installed as its own app on duo.<site>: the channel is on the game's origin (www.<site>), reached through a hidden frame there
  if (location.hostname.startsWith('duo.')) {
    const game = location.origin.replace('//duo.', '//www.')
    const frame = document.createElement('iframe')
    frame.src = `${game}/duo-bridge.html`
    frame.hidden = true
    frame.tabIndex = -1
    frame.setAttribute('aria-hidden', 'true')
    document.body.append(frame)
    addEventListener('message', (e) => {
      if (e.origin === game && e.source === frame.contentWindow) receive(e.data)
    })
    links.push({ send: (m) => frame.contentWindow?.postMessage(m, game) })
  }
  const pres = (navigator as unknown as { presentation?: { receiver?: { connectionList: Promise<PresentationConnectionList> } } }).presentation
  pres?.receiver?.connectionList.then((list) => {
    const wire = (c: PresentationConnection) => {
      c.onmessage = (e) => {
        try {
          receive(JSON.parse(String(e.data)))
        } catch {
          /* not ours */
        }
      }
      links.push({ send: (m) => c.state === 'connected' && c.send(JSON.stringify(m)) })
    }
    list.connections.forEach(wire)
    list.onconnectionavailable = (e) => wire(e.connection)
  })
  const send = (m: DuoMsg) => links.forEach((l) => l.send(m))
  const cmd = (c: DuoCmd) => {
    send(c)
    navigator.vibrate?.(12)
  }
  // Say hello now and then, so the game knows someone's listening
  const hello = () => send({ t: 'hello' })
  hello()
  setInterval(hello, 2000)

  let state: DuoState | null = null
  let lastAt = 0
  let shape = ''
  function receive(d: unknown) {
    const m = d as DuoMsg | null
    if (!m || typeof m !== 'object' || m.t !== 'state') return
    state = m
    lastAt = performance.now()
    if (m.lang) setLang(m.lang)
    paint()
  }
  // Nothing for a while: the game was closed
  setInterval(() => {
    if (state && performance.now() - lastAt > 5000) {
      state = null
      paint()
    }
  }, 1000)

  /** Rebuild when what's on screen changes; otherwise just update the numbers (so taps never land on a vanishing button). */
  function paint() {
    const s = state
    const next = !s ? 'wait' : [s.scene, s.kind, s.canChat, s.party?.map((m) => m.id).join(), s.lang].join('|')
    if (next !== shape) {
      shape = next
      root.innerHTML = s ? layout(s) : waiting()
      bind()
    }
    if (s) update(s)
  }

  const t = (en: string, nl: string) => (state?.lang === 'nl' ? nl : en)

  function waiting() {
    return `
      <div class="dv dv-wait">
        <img class="dv-logo" src="${logoUrl}" alt="Stormbreak Royale">
        <b>${t('Waiting for the game…', 'Wachten op het spel…')}</b>
        <p>${t('Open Stormbreak on the other screen. This screen then shows the map, your team, items and the chat.', 'Open Stormbreak op het andere scherm. Dit scherm toont dan de kaart, je team, items en de chat.')}</p>
      </div>`
  }

  function layout(s: DuoState) {
    const head = `
      <header class="dv-head">
        <span class="dv-htxt"><small class="dv-label"></small><b class="dv-title"></b><em class="dv-sub"></em></span>
        ${s.scene === 'match' ? `<button class="dv-ic" data-c="board" aria-label="${t('Scoreboard', 'Scorebord')}">🏆</button><button class="dv-ic" data-c="pause" aria-label="${t('Pause', 'Pauze')}">⏸</button>` : ''}
      </header>`
    const chat = s.canChat
      ? `<section class="dv-chat">
          <div class="dv-log"></div>
          <div class="dv-quick">${QUICK_CHAT.map((q) => `<button data-say="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        </section>`
      : ''
    if (s.scene === 'match') {
      const view = s.kind === 'raid'
        ? `<div class="dv-boss"><img class="px" alt=""><span><b class="dv-bname"></b><span class="dv-bar"><i></i></span><small class="dv-bphase"></small></span></div>`
        : s.kind === 'duel'
          ? `<div class="dv-duel"><b class="dv-score"></b><small class="dv-opp"></small></div>`
          : `<div class="dv-map"><img alt=""></div>`
      return `
        <div class="dv dv-match dv-${s.kind}">
          ${head}
          <div class="dv-top">
            ${view}
            <section class="dv-team">${(s.party ?? []).map((m, i) => `
              <button class="dv-mon" data-i="${i}"><img class="px" src="${spriteUrl(m.id, { shiny: m.shiny })}" alt=""><span><b>${esc(m.name)}</b><small></small><span class="dv-bar"><i></i></span></span></button>`).join('')}
            </section>
          </div>
          ${s.kind === 'duel' ? '' : `<section class="dv-items">${ITEMS.map(([k, sprite, name]) => `<button class="dv-item" data-item="${k}"><img class="px" src="${itemUrl(sprite)}" alt=""><span>${name}</span><b>0</b></button>`).join('')}</section>`}
          ${chat}
        </div>`
    }
    return `
      <div class="dv dv-menu">
        ${head}
        <div class="dv-hero">
          <img class="dv-logo" src="${logoUrl}" alt="Stormbreak Royale">
          ${s.trainer ? `<div class="dv-duo"><img class="px" src="${trainerSpriteUrl(s.trainer)}" alt="">${s.mon ? `<img class="px" src="${spriteUrl(s.mon)}" alt="">` : ''}</div>` : ''}
        </div>
        ${chat}
      </div>`
  }

  function bind() {
    root.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.addEventListener('click', () => cmd({ t: 'cmd', c: b.dataset.c as 'board' | 'pause' })))
    root.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.addEventListener('click', () => cmd({ t: 'cmd', c: 'switch', i: Number(b.dataset.i) })))
    root.querySelectorAll<HTMLElement>('[data-item]').forEach((b) => b.addEventListener('click', () => cmd({ t: 'cmd', c: 'item', key: b.dataset.item as 'master' | 'potion' | 'revive' })))
    root.querySelectorAll<HTMLElement>('[data-say]').forEach((b) => b.addEventListener('click', () => cmd({ t: 'cmd', c: 'say', text: b.dataset.say! })))
  }

  const setText = (sel: string, text: string) => {
    const el = root.querySelector(sel)
    if (el && el.textContent !== text) el.textContent = text
  }

  function update(s: DuoState) {
    setText('.dv-label', s.label)
    setText('.dv-title', s.title)
    setText('.dv-sub', s.sub)
    if (s.mini) (root.querySelector('.dv-map img') as HTMLImageElement | null)?.setAttribute('src', s.mini)
    s.party?.forEach((m, i) => {
      const b = root.querySelector<HTMLElement>(`.dv-mon[data-i="${i}"]`)
      if (!b) return
      b.classList.toggle('on', m.active)
      b.classList.toggle('out', m.fainted)
      ;(b.querySelector('small') as HTMLElement).textContent = `Lv ${m.lv} · ${Math.ceil(m.hp)}/${m.max}`
      const k = Math.max(0, Math.min(1, m.hp / Math.max(1, m.max)))
      const bar = b.querySelector('.dv-bar i') as HTMLElement
      bar.style.width = `${k * 100}%`
      bar.style.background = k > 0.5 ? '#3ddc84' : k > 0.2 ? '#ffd60a' : '#ff4058'
    })
    if (s.items)
      for (const [k] of ITEMS) {
        const b = root.querySelector<HTMLElement>(`.dv-item[data-item="${k}"]`)
        if (!b) continue
        const n = s.items[k]
        ;(b.querySelector('b') as HTMLElement).textContent = String(n)
        b.classList.toggle('none', n <= 0)
      }
    if (s.boss) {
      const img = root.querySelector('.dv-boss img') as HTMLImageElement | null
      const src = spriteUrl(s.boss.species)
      if (img && img.getAttribute('src') !== src) img.src = src
      setText('.dv-bname', s.boss.name)
      const bar = root.querySelector('.dv-boss .dv-bar i') as HTMLElement | null
      if (bar) bar.style.width = `${Math.max(0, s.boss.k) * 100}%`
      setText('.dv-bphase', `${t('Phase', 'Fase')} ${s.boss.phase + 1} · ${'♥'.repeat(Math.max(0, s.boss.lives))}`)
    }
    if (s.duel) {
      setText('.dv-score', `${s.duel.mine} – ${s.duel.theirs}`)
      setText('.dv-opp', `${t('vs', 'tegen')} ${s.duel.opp}`)
    }
    const log = root.querySelector('.dv-log')
    if (log) {
      const html = s.chat.slice(-4).map((l) => `<div class="${l.mine ? 'mine' : ''}"><b>${esc(l.name)}</b> ${esc(l.text)}</div>`).join('')
      if (log.innerHTML !== html) log.innerHTML = html
    }
  }

  paint()
  fullscreenGate(() => state?.lang ?? (navigator.language.startsWith('nl') ? 'nl' : 'en'))
}

/**
 * Full screen needs a tap (browsers only allow it after one): a "tap to start"
 * cover the first time, and a small button to go back to full screen after
 * leaving it. Not needed when installed as an app that opens full screen.
 */
function fullscreenGate(lang: () => 'en' | 'nl') {
  const el = document.documentElement
  if (!el.requestFullscreen || matchMedia('(display-mode: fullscreen)').matches) return
  const t = (en: string, nl: string) => (lang() === 'nl' ? nl : en)
  const go = () => el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
  const cover = document.createElement('button')
  cover.className = 'dv-start'
  cover.innerHTML = `<img src="${logoUrl}" alt=""><b>${t('Tap to start', 'Tik om te starten')}</b><small>${t('Full screen on this display', 'Schermvullend op dit scherm')}</small>`
  cover.addEventListener('click', () => {
    void go()
    cover.remove()
  })
  const again = document.createElement('button')
  again.className = 'dv-fs hidden'
  again.setAttribute('aria-label', t('Full screen', 'Schermvullend'))
  again.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
  again.addEventListener('click', () => void go())
  document.addEventListener('fullscreenchange', () => again.classList.toggle('hidden', !!document.fullscreenElement || cover.isConnected))
  document.body.append(cover, again)
  // Shown once the cover is gone and we're not full screen
  cover.addEventListener('click', () => setTimeout(() => again.classList.toggle('hidden', !!document.fullscreenElement), 400))
}
