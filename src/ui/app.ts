import './app.css'
import { animateTrainers, trainerArt } from './trainerAnim'
import logoUrl from '../assets/stormbreak-logo-small.webp'
import { animatedUrl, SPECIES, spriteUrl } from '../data/pokemon'
import type { TrainerDef } from '../data/trainers'
import { TYPE_NL } from '../data/types'
import { ROLES, roleOf } from '../data/roles'
import { sfx } from '../audio'
import { L } from '../i18n'
import { progress } from '../progress'
import { masteryOf, MAX_MASTERY, SHINY_AT } from '../../api/_progress'
import { accountState, accountStatus, login, onAccount } from '../account'

/**
 * The menu app: a dark shell with four tabs (Play, Team, Friends, Profile) as a
 * bar at the bottom on phones and a rail on the left on wider screens, plus the
 * shared pieces every menu screen uses (your team on a stage, the team card,
 * lightning in the background).
 */

export type AppTab = 'play' | 'team' | 'friends' | 'profile'

export const appEsc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const ICONS: Record<AppTab, string> = {
  play: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  team: '<circle cx="12" cy="12" r="9"/><path d="M3 12h6M15 12h6"/><circle cx="12" cy="12" r="3"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.4 0 4 1.5 4.5 4"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
}

/** A line icon (24×24, stroked in the text colour). */
export const icon = (paths: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
export const BOLT = '<svg class="n-bolt-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>'
export const IC = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  news: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  opts: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  swap: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-8.9C1.3 8 3 4.5 6.4 4.5c2.1 0 3.6 1.2 4.6 2.8 1-1.6 2.5-2.8 4.6-2.8 3.4 0 5.1 3.5 3.6 6.6C19 15.6 12 20 12 20z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  replay: '<path d="M4 4v6h6"/><path d="M4.5 15a8 8 0 1 0 1.9-8.3L4 10"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.4 0 4 1.5 4.5 4"/>',
}

const TAB_NAMES: Record<AppTab, () => string> = {
  play: () => L('Play', 'Spelen'),
  team: () => 'Team',
  friends: () => L('Friends', 'Vrienden'),
  profile: () => L('Profile', 'Profiel'),
}

// ---------------------------------------------------------------- signed in with Discord

const DISCORD_PATH = 'M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.86-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z'
/** The Discord mark (for "signed in with Discord"). */
export const DISCORD = `<svg class="n-dc" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${DISCORD_PATH}"/></svg>`

/** You, when signed in with Discord (null as a guest). */
export function discordMe() {
  return accountStatus() === 'in' ? accountState()?.me ?? null : null
}

/** Your avatar with a small Discord mark on it. */
export function discordAvatar(cls = '') {
  const me = discordMe()
  return me ? `<span class="n-av ${cls}" title="${appEsc(L(`Signed in with Discord as ${me.dname || me.name}`, `Ingelogd met Discord als ${me.dname || me.name}`))}"><img src="${appEsc(me.avatar)}" alt="">${DISCORD}</span>` : ''
}

/** The account card at the bottom of the rail (desktop and sideways phones). */
function accountCard() {
  const me = discordMe()
  if (!me && accountStatus() === 'guest') return `<button class="n-acct n-acct-login" data-login>${DISCORD}<span class="n-acct-t"><small>Discord</small><b>${L('Log in', 'Inloggen')}</b></span></button>`
  if (!me) return ''
  return `<button class="n-acct" data-acct aria-label="${appEsc(L(`Signed in with Discord as ${me.dname || me.name}`, `Ingelogd met Discord als ${me.dname || me.name}`))}">${discordAvatar()}<span class="n-acct-t"><small>${DISCORD}${L('Discord', 'Discord')}</small><b>${appEsc(me.dname || me.name)}</b></span></button>`
}

/** Signing in or out updates the shell already on screen. */
onAccount(() => {
  document.querySelectorAll<HTMLElement>('.n-nav').forEach((nav) => {
    nav.querySelector('.n-acct')?.remove()
    nav.insertAdjacentHTML('beforeend', accountCard())
    bindAcct(nav)
    const prof = nav.querySelector<HTMLElement>('.n-tab[data-tab="profile"]')
    if (prof) {
      prof.querySelector('.n-av, svg')?.remove()
      prof.insertAdjacentHTML('afterbegin', discordAvatar() || icon(ICONS.profile, 22))
    }
  })
  document.querySelectorAll<HTMLElement>('[data-acct-slot]').forEach((slot) => (slot.innerHTML = discordAvatar('n-av-chip')))
  document.querySelectorAll<HTMLElement>('[data-login-banner]').forEach((slot) => (slot.innerHTML = loginBanner()))
})

const LOGIN_X = 'sb:loginBannerX'
/**
 * For guests, on home: a big Discord login card (progress everywhere, friends,
 * rankings, supporter rewards). Closing it hides it for 3 days; the login button
 * in the rail and on the profile stays.
 */
export function loginBanner() {
  if (accountStatus() !== 'guest') return ''
  try {
    if (Date.now() - Number(localStorage.getItem(LOGIN_X) || 0) < 3 * 86400e3) return ''
  } catch {}
  return `<div class="n-login">
    <span class="n-login-ic">${DISCORD}</span>
    <span class="n-login-t"><b>${L('Log in with Discord', 'Log in met Discord')}</b><small>${L('Keep your progress on every device, add friends, join the world rankings and get supporter rewards.', 'Bewaar je voortgang op elk apparaat, voeg vrienden toe, kom in de wereldranglijst en krijg supporter-beloningen.')}</small></span>
    <button class="n-login-go" data-login>${L('Log in', 'Inloggen')}</button>
    <button class="n-login-x" data-login-x aria-label="${L('Not now', 'Nu niet')}">✕</button>
  </div>`
}
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('[data-login]')) {
    sfx.select()
    login()
  } else if (t.closest('[data-login-x]')) {
    sfx.select()
    try {
      localStorage.setItem(LOGIN_X, String(Date.now()))
    } catch {}
    t.closest('[data-login-banner]')?.replaceChildren()
  }
})
function bindAcct(root: ParentNode) {
  root.querySelector<HTMLElement>('.n-acct')?.addEventListener('click', () => root.querySelector<HTMLElement>('.n-tab[data-tab="profile"]')?.click())
}

/**
 * The shell around a menu page. `focus` hides the tab bar on phones (a mode
 * screen or a picker you came to from somewhere else); the rail stays on desktop.
 * `bare`: no tabs at all (a picker you must leave the way you came, like from a lobby).
 */
export function appShell(tab: AppTab, page: string, o: { focus?: boolean; bare?: boolean; badge?: Partial<Record<AppTab, number>>; cls?: string } = {}) {
  const tabs = (Object.keys(ICONS) as AppTab[]).map((t) => {
    const n = o.badge?.[t] ?? 0
    // Profile: your Discord avatar when you're signed in
    const ic = (t === 'profile' && discordAvatar()) || icon(ICONS[t], 22)
    return `<button class="n-tab ${t === tab ? 'on' : ''}" data-tab="${t}" ${t === tab ? 'aria-current="page"' : ''}>${ic}<span>${TAB_NAMES[t]()}</span>${n ? `<b class="n-badge">${n}</b>` : ''}</button>`
  }).join('')
  return `
    <div class="n-app ${o.focus ? 'n-focus' : ''} ${o.cls ?? ''}" data-tab="${tab}">
      ${o.bare ? '' : `<nav class="n-nav" aria-label="${L('Main menu', 'Hoofdmenu')}">
        <div class="n-brand"><img class="n-logo" src="${logoUrl}" alt="Stormbreak Royale">${BOLT}</div>
        ${tabs}
        ${accountCard()}
      </nav>`}
      <main class="n-main">${page}</main>
    </div>`
}

/** Tab presses go to `go`; the current tab is a no-op. */
export function bindShell(root: ParentNode, go: (t: AppTab) => void) {
  root.querySelectorAll<HTMLElement>('.n-nav').forEach(bindAcct)
  root.querySelectorAll<HTMLElement>('.n-nav .n-tab').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.classList.contains('on')) return
      sfx.select()
      go(b.dataset.tab as AppTab)
    }),
  )
}

// ---------------------------------------------------------------- lightning

/** A tiny seeded random, so the same bolt keeps its shape between repaints. */
function rand(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Jagged line from a to b by midpoint displacement. */
function jag(r: () => number, ax: number, ay: number, bx: number, by: number, disp: number, depth: number) {
  let pts: [number, number][] = [[ax, ay], [bx, by]]
  let d = disp
  for (let k = 0; k < depth; k++) {
    const next: [number, number][] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
      const len = Math.hypot(x1 - x0, y1 - y0) || 1
      const o = (r() * 2 - 1) * d
      next.push([(x0 + x1) / 2 - ((y1 - y0) / len) * o, (y0 + y1) / 2 + ((x1 - x0) / len) * o], [x1, y1])
    }
    pts = next
    d *= 0.55
  }
  return pts
}
const pathOf = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')

let boltN = 0

/**
 * A lightning strike drawn in a w×h box from (x, 0) down to (x2, h·reach): a
 * white core with a blue glow and a few forks. It flickers in now and then
 * (`every` seconds, offset by `delay`); the sky behind lights up with it.
 */
export function strike(o: { w: number; h: number; x: number; x2: number; reach?: number; seed: number; every?: number; delay?: number; size?: number }) {
  const r = rand(o.seed)
  const y2 = o.h * (o.reach ?? 0.75)
  const size = o.size ?? 1
  const main = jag(r, o.x, -4, o.x2, y2, Math.max(14, o.h * 0.09), 6)
  const forks: string[] = []
  for (let i = 0; i < 3; i++) {
    const at = main[Math.floor(main.length * (0.2 + r() * 0.45))]
    const ang = Math.atan2(y2, o.x2 - o.x) + (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.45)
    const len = o.h * (0.12 + r() * 0.16)
    forks.push(pathOf(jag(r, at[0], at[1], at[0] + Math.cos(ang) * len, at[1] + Math.sin(ang) * len, len * 0.25, 5)))
  }
  const id = `nb${++boltN}`
  const style = `--every:${o.every ?? 8}s;--delay:${o.delay ?? 0}s`
  const sx = ((o.x + o.x2) / 2 / o.w) * 100
  return `
    <div class="n-sky" aria-hidden="true" style="${style};--sx:${sx.toFixed(0)}%"></div>
    <svg class="n-strike" aria-hidden="true" viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="none" style="${style}">
      <defs><filter id="${id}" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="${(4 * size).toFixed(1)}"/></filter></defs>
      <path d="${pathOf(main)}" stroke="#9fc0ff" stroke-opacity="0.8" stroke-width="${(7 * size).toFixed(1)}" filter="url(#${id})"/>
      <path d="${pathOf(main)}" stroke="#fff" stroke-width="${(1.8 * size).toFixed(1)}"/>
      ${forks.map((f) => `<path d="${f}" stroke="#fff" stroke-opacity="0.75" stroke-width="${(0.9 * size).toFixed(1)}"/>`).join('')}
    </svg>`
}

// ---------------------------------------------------------------- your team

/** An animated Pokémon (still sprite if the animation fails to load). */
export function monImg(id: number, cls = '', shiny = false) {
  return `<img class="px ${cls}" src="${animatedUrl(id, shiny)}" onerror="this.onerror=null;this.src='${spriteUrl(id, { shiny })}'" alt="${appEsc(SPECIES[id]?.name ?? '')}">`
}

/** Your trainer and partner side by side on a little platform, both alive. */
export function teamStage(trainer: TrainerDef, mon: number | undefined, shiny: boolean, cls = '') {
  queueMicrotask(animateTrainers)
  return `
    <div class="n-duo ${cls}">
      <i class="n-plat"></i>
      ${trainerArt(trainer, 'n-tr')}
      ${mon ? monImg(mon, 'n-mon', shiny) : ''}
    </div>`
}

/** Mastery of a partner, with the next goal to show (shiny at ★5, then max). */
export function masteryLine(id: number) {
  const m = masteryOf(progress().partners[id] ?? 0)
  const left = SHINY_AT - m.lv
  const name = SPECIES[id]?.name ?? ''
  const hint = m.lv >= MAX_MASTERY
    ? L('Mastered', 'Gemeesterd')
    : left > 0
      ? L(`${left} more level${left === 1 ? '' : 's'} to shiny ${name}`, `Nog ${left} level${left === 1 ? '' : 's'} tot shiny ${name}`)
      : L(`Shiny unlocked · ${MAX_MASTERY - m.lv} to mastered`, `Shiny vrijgespeeld · nog ${MAX_MASTERY - m.lv} tot meester`)
  return { lv: m.lv, k: m.k, hint }
}

export const bar = (k: number, cls = '') => `<span class="n-bar ${cls}"><i style="width:${(Math.max(0, Math.min(1, k)) * 100).toFixed(1)}%"></i></span>`

/** Type and role of a species, as small chips. */
export function monChips(id: number) {
  const sp = SPECIES[id]
  const role = ROLES[roleOf(id)]
  return `${sp.types.map((t) => `<span class="n-chip">${TYPE_NL[t]}</span>`).join('')}<span class="n-chip">${role.name}</span>`
}

/**
 * The team card on a mode screen: your duo, mastery and a hint, with a big
 * Switch button (it's how you change your team right before a match).
 */
export function teamCard(trainer: TrainerDef, mon: number | undefined, shiny: boolean, note?: string) {
  const m = mon ? masteryLine(mon) : null
  return `
    <button class="n-teamcard" data-act="switch">
      <span class="n-tc-pic">${teamStage(trainer, mon, shiny, 'n-duo-s')}</span>
      <span class="n-tc-info">
        <b>${appEsc(trainer.name)}${mon ? ` &amp; ${SPECIES[mon].name}` : ''}</b>
        ${m ? `<span class="n-tc-m">${L('Mastery', 'Meesterschap')} ${m.lv}${bar(m.k)}</span><small>${appEsc(note ?? m.hint)}</small>` : ''}
      </span>
      <span class="n-btn2 n-tc-go">${L('Switch', 'Wissel')}</span>
    </button>`
}

// Every modal (options, news, invites, leaving a match, a full team) takes the menu's look
document.body.classList.add('n-ui')
