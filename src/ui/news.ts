import { sfx } from '../audio'
import { L } from '../i18n'
import { playMusic } from '../music'
import { NEWS, latestNews, type NewsEntry } from '../data/news'
import { esc } from './menu'

/**
 * "What's new": the update notes with an optional video (16:9 or 9:16, picked by
 * the screen). Returning players see a new update once, on the home screen; the
 * button stays on home with a dot until you've seen it.
 */

const SEEN_KEY = 'sb:newsSeen'

function seenId() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, latestNews().id)
  } catch {
    /* private mode */
  }
}

/** Has played here before (so an update is news to them). */
function returning() {
  try {
    const prog = JSON.parse(localStorage.getItem('sb:progress') ?? 'null')
    return !!(prog?.stats?.m || localStorage.getItem('battlemon:team') || localStorage.getItem('battlemon:profile'))
  } catch {
    return false
  }
}

export const hasUnseen = () => seenId() < latestNews().id

/** The button on the home screen (with a dot while there's something new). */
export function newsButton() {
  return `<button class="sel-back home-news ${hasUnseen() ? 'dot' : ''}" aria-label="${L('What’s new', 'Wat is er nieuw')}">📰</button>`
}

const tx = (t: [string, string]) => L(t[0], t[1])
const fmtDate = (id: string) => {
  const d = new Date(`${id.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? id : d.toLocaleDateString(L('en-GB', 'nl-NL'), { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Which video fits this screen: 9:16 on an upright phone, 16:9 otherwise (or whichever exists). */
function pickVideo(v: NonNullable<NewsEntry['video']>) {
  const upright = matchMedia('(orientation: portrait)').matches
  const tall = upright ? !!v.tall : !v.wide
  const src = tall ? v.tall : v.wide
  return src ? { src, tall, poster: tall ? v.poster?.tall : v.poster?.wide } : null
}

/** `open`: shown in full (new to you); otherwise it sits under "Earlier updates" and loads nothing. */
function entryHtml(e: NewsEntry, open: boolean) {
  const vid = e.video ? pickVideo(e.video) : null
  return `
    <article class="nw-entry">
      <small class="nw-date">${fmtDate(e.id)}</small>
      <h3>${esc(tx(e.title))}</h3>
      ${vid ? `<div class="nw-video ${vid.tall ? 'tall' : 'wide'}"><video src="${esc(vid.src)}" ${vid.poster ? `poster="${esc(vid.poster)}"` : ''} controls playsinline preload="${open ? 'metadata' : 'none'}"></video></div>` : ''}
      ${e.intro ? `<p class="nw-intro">${esc(tx(e.intro))}</p>` : ''}
      <ul class="nw-items">${e.items.map((it) => `<li><i>${it.icon}</i><span>${esc(tx(it.text))}</span></li>`).join('')}</ul>
    </article>`
}

/** Open the update notes. */
export function showNews(onClose?: () => void) {
  const modal = document.getElementById('modal')!
  // Everything you haven't seen yet is open (at least the newest); the rest folds away
  const seen = seenId()
  const fresh = NEWS.filter((e, i) => i === 0 || e.id > seen)
  const older = NEWS.slice(fresh.length)
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel nw">
      <button class="sheet-x nw-x" aria-label="${L('Close', 'Sluiten')}">✕</button>
      <div class="nw-head"><span>📰</span><b>${L('What’s new', 'Wat is er nieuw')}</b></div>
      <div class="nw-scroll">
        ${fresh.map((e) => entryHtml(e, true)).join('')}
        ${older.length ? `<details class="nw-older"><summary>${L('Earlier updates', 'Eerdere updates')}</summary>${older.map((e) => entryHtml(e, false)).join('')}</details>` : ''}
      </div>
      <button class="btn nw-ok">${L('Let’s play!', 'Spelen maar!')}</button>
    </div>`
  // A 16:9 video gets a wider panel on big screens
  if (modal.querySelector('.nw-video.wide')) modal.querySelector('.panel')!.classList.add('wide')
  markSeen()
  document.querySelector('.home-news')?.classList.remove('dot')
  // A video plays with its own sound: the music (and any other video) steps aside
  const videos = [...modal.querySelectorAll('video')]
  let musicOff = false
  for (const v of videos)
    v.addEventListener('play', () => {
      for (const o of videos) if (o !== v) o.pause()
      if (!musicOff) playMusic(null)
      musicOff = true
    })
  // Leaving home underneath (joining a friend, quick play found a lobby) closes the notes too
  const scr = document.getElementById('screen')!
  const leave = new MutationObserver(() => !scr.querySelector('.n-app[data-tab="play"]') && close())
  leave.observe(scr, { childList: true })
  const close = () => {
    leave.disconnect()
    for (const v of videos) v.pause()
    if (musicOff) playMusic('menu')
    modal.classList.add('hidden')
    modal.innerHTML = ''
    modal.onclick = null
    onClose?.()
  }
  modal.querySelector('.nw-x')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.querySelector('.nw-ok')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.onclick = (e) => e.target === modal && close()
}

let shownThisSession = false

/**
 * Home screen: show a new update once to returning players. New players don't get
 * a changelog on day one; for them the current update simply counts as seen.
 */
export function maybeShowNews() {
  if (shownThisSession || !hasUnseen()) return
  if (!returning()) {
    markSeen()
    document.querySelector('.home-news')?.classList.remove('dot')
    return
  }
  shownThisSession = true
  setTimeout(() => {
    // Only on a quiet home screen (no sheet or dialog open)
    if (!document.querySelector('#screen .n-home') || !document.getElementById('modal')!.classList.contains('hidden') || document.querySelector('.n-sheet, .sheet.open, #screen .n-main button:disabled')) return
    sfx.banner()
    showNews()
  }, 700)
}
