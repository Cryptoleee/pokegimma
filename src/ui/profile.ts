import { sfx } from '../audio'
import { L } from '../i18n'
import { ALL_PARTNERS, SPECIES, spriteUrl } from '../data/pokemon'
import { TRAINERS, trainerSpriteUrl } from '../data/trainers'
import { accountState, accountStatus, login } from '../account'
import { progress, onProgress, setCosmetics, signedIn, today } from '../progress'
import { ACHIEVEMENTS, BOSS_IDS, dailyOf, isUnlocked, levelCost, nextUnlock, REWARD_ROAD, unlockLevel, emblemOf, levelOf, masteryOf, MAX_MASTERY, prevDay, SHINY_AT, titleOf, titlesOf, type Progress } from '../../api/_progress'

/** Days in a row, still alive when you last played yesterday. */
const liveStreak = (p: Progress) => (p.day === today() || p.day === prevDay(today()) ? p.streak : 0)
import { achDesc, achName, ACH_INFO, questText, titleName, trainerName } from '../data/rewards'
import { esc } from './menu'

/**
 * Your profile: trainer level and title, today's quests and streak, lifetime
 * stats, partner mastery (with the shiny switch), achievements and the world
 * rankings.
 */

type Tab = 'me' | 'road' | 'mons' | 'ach' | 'rank'

const screen = () => document.getElementById('screen')!

function bar(k: number, cls = '') {
  return `<div class="rw-track ${cls}"><i style="width:${Math.max(0, Math.min(1, k)) * 100}%"></i></div>`
}

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  return h ? `${h}u ${m}m` : `${m}m`
}

/** Hours until the quests change (midnight in Amsterdam). */
function untilReset() {
  const now = new Date()
  const ams = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
  const left = (24 * 60 - (ams.getHours() * 60 + ams.getMinutes()))
  return left >= 60 ? `${Math.floor(left / 60)}${L('h', 'u')}` : `${left}m`
}

function meTab(p: Progress, trainerSprite: string, name: string) {
  const lv = levelOf(p.xp)
  const s = p.stats
  const quests = dailyOf(p, today())
  const guest = accountStatus() === 'guest'
  return `
    <div class="pf-card pf-head">
      <img class="px pf-tr" src="${trainerSpriteUrl(trainerSprite)}" alt="">
      <div class="pf-id">
        <b>${esc(name)}</b>
        <button class="pf-title">🏷️ ${esc(titleName(titleOf(p)))} <small>▾</small></button>
        <div class="pf-lv"><em>Lv ${lv.lv}</em>${bar(lv.k)}<small>${lv.need ? `${lv.into}/${lv.need} XP` : 'MAX'}</small></div>
      </div>
    </div>
    ${guest ? `<div class="pf-card pf-guest"><span>💾 ${L('Your progress is saved on this device. Log in with Discord to keep it everywhere and join the world rankings.', 'Je voortgang staat op dit apparaat. Log in met Discord om hem overal te bewaren en mee te doen in de wereldranglijst.')}</span><button class="rw-login pf-login">${L('Log in', 'Inloggen')}</button></div>` : ''}
    <div class="pf-card">
      <h4>${L('Daily quests', 'Dagopdrachten')} <small>${L(`new in ${untilReset()}`, `nieuw over ${untilReset()}`)}</small></h4>
      ${quests.map((q) => `
        <div class="rwd-q ${q.p >= q.target ? 'done' : ''}">
          <span>${q.p >= q.target ? '✅' : '📜'} ${esc(questText(q.id, q.target))}</span>
          <em>${Math.min(q.p, q.target)}/${q.target} · +${q.xp}</em>
          ${bar(q.p / q.target)}
        </div>`).join('')}
      <div class="pf-bonus">
        <span>🔥 ${L(`${liveStreak(p)}-day streak`, `${liveStreak(p)} dagen op rij`)} <small>(${L('best', 'record')} ${p.bestStreak})</small></span>
        <span>${p.daily.day === today() && p.daily.firstWin ? `✅ ${L('First win today', 'Eerste winst vandaag')}` : `🏆 ${L('First win today: +100 XP', 'Eerste winst vandaag: +100 XP')}`}</span>
      </div>
    </div>
    <div class="pf-card">
      <h4>${L('Stats', 'Statistieken')}</h4>
      <div class="pf-stats">
        ${[
          [s.m, L('Matches', 'Potjes')], [s.w, L('Wins', 'Gewonnen')], [s.top3, 'Top 3'],
          [s.kos, L('Knockouts', 'Uitgeschakeld')], [s.caught, L('Caught', 'Gevangen')], [s.raids, L('Raids cleared', 'Raids gehaald')],
          [`${s.bosses.length}/${BOSS_IDS.length}`, L('Bosses beaten', 'Bazen verslagen')], [s.legend, L('Legendaries', 'Legendarisch')], [fmtTime(s.time), L('Played', 'Gespeeld')],
        ].map(([v, t]) => `<div><b>${v}</b><span>${t}</span></div>`).join('')}
      </div>
    </div>`
}

function monsTab(p: Progress) {
  return `
    <p class="pf-intro">${L(`Every match gives your partner mastery XP. ★${SHINY_AT} unlocks its shiny form, ★3/★7/★10 a bronze, silver and gold emblem.`, `Elk potje geeft je partner mastery-XP. ★${SHINY_AT} speelt de shiny vorm vrij, ★3/★7/★10 een bronzen, zilveren en gouden embleem.`)}</p>
    <div class="pf-mons">${ALL_PARTNERS.map((id) => {
      if (!isUnlocked(p, 'partner', id)) return `
        <div class="pf-mon locked">
          <img class="px" src="${spriteUrl(id)}" alt="" loading="lazy">
          <b>${SPECIES[id].name}</b>
          <small>🔒 ${L(`Trainer Lv ${unlockLevel('partner', id)}`, `Trainerlevel ${unlockLevel('partner', id)}`)}</small>
        </div>`
      const xp = p.partners[id] ?? 0
      const m = masteryOf(xp)
      const shinyOk = m.lv >= SHINY_AT
      const shiny = shinyOk && p.shiny.includes(id)
      const em = emblemOf(m.lv)
      return `
        <div class="pf-mon ${em} ${xp ? '' : 'new'}">
          <img class="px" src="${spriteUrl(id, { shiny })}" alt="" loading="lazy">
          <b>${SPECIES[id].name}</b>
          <span class="pf-star">★${m.lv}${m.lv >= MAX_MASTERY ? ' MAX' : ''}</span>
          ${bar(m.k, 'mini')}
          ${shinyOk
            ? `<button class="pf-shiny ${shiny ? 'on' : ''}" data-id="${id}">✨ ${shiny ? L('Shiny on', 'Shiny aan') : L('Shiny off', 'Shiny uit')}</button>`
            : `<small>✨ ${L(`at ★${SHINY_AT}`, `bij ★${SHINY_AT}`)}</small>`}
        </div>`
    }).join('')}</div>`
}

/** XP still needed from where you are to a trainer level. */
function toGo(at: { lv: number; into: number }, lv: number) {
  let n = -at.into
  for (let l = at.lv; l < lv; l++) n += levelCost(l)
  return Math.max(0, n)
}

/** The reward road: a new partner or trainer every few trainer levels. */
function roadTab(p: Progress) {
  const lv = levelOf(p.xp).lv
  const next = nextUnlock(p)
  const got = REWARD_ROAD.filter((r) => r.lv <= lv).length
  return `
    <p class="pf-intro">${L(`Level up to unlock new partners and trainers. ${got} of ${REWARD_ROAD.length} unlocked.`, `Stijg in level voor nieuwe partners en trainers. ${got} van de ${REWARD_ROAD.length} vrijgespeeld.`)}</p>
    <div class="pf-road">${REWARD_ROAD.map((r) => {
      const done = r.lv <= lv, isNext = next === r
      const img = r.kind === 'partner' ? spriteUrl(Number(r.id)) : trainerSpriteUrl(TRAINERS.find((t) => t.key === r.id)?.sprite ?? r.id)
      const name = r.kind === 'partner' ? SPECIES[Number(r.id)]?.name : trainerName(r.id)
      const left = isNext ? levelOf(p.xp) : null
      return `
        <div class="pf-step ${done ? 'done' : ''} ${isNext ? 'next' : ''} ${r.kind}">
          <span class="pf-steplv"><small>LV</small><b>${r.lv}</b></span>
          <img class="px" src="${img}" alt="" loading="lazy">
          <span class="pf-stepname"><b>${esc(name ?? r.id)}</b><small>${r.kind === 'partner' ? L('Partner Pokémon', 'Partner-Pokémon') : L('Trainer', 'Trainer')}${isNext && left ? ` · ${L(`${toGo(left, r.lv)} XP to go`, `nog ${toGo(left, r.lv)} XP`)}` : ''}</small>${isNext && left && left.lv === r.lv - 1 ? bar(left.k) : ''}</span>
          <em>${done ? '✓' : '🔒'}</em>
        </div>`
    }).join('')}</div>`
}

function achTab(p: Progress) {
  const done = ACHIEVEMENTS.filter((a) => p.ach.includes(a.id)).length
  return `
    <p class="pf-intro">${L(`${done} of ${ACHIEVEMENTS.length} unlocked`, `${done} van de ${ACHIEVEMENTS.length} gehaald`)}</p>
    ${[...ACHIEVEMENTS].sort((a, b) => Number(p.ach.includes(b.id)) - Number(p.ach.includes(a.id))).map((a) => `
      <div class="rwd-ach ${p.ach.includes(a.id) ? '' : 'locked'}">
        <i>${ACH_INFO[a.id]?.icon ?? '🏆'}</i>
        <span><b>${esc(achName(a.id))}</b><small>${esc(achDesc(a.id))}${a.title ? ` · 🏷️ ${esc(titleName(a.title))}` : ''}</small></span>
        <em>${p.ach.includes(a.id) ? '✓' : `+${a.xp}`}</em>
      </div>`).join('')}`
}

// ---------------------------------------------------------------- rankings

interface RankRow { rank: number; id: string; name: string; avatar: string; lv: number; title: string; score: number }
const rankCache = new Map<string, { at: number; data: { top: RankRow[]; me: RankRow | null; count: number; off?: boolean } | null }>()

async function fetchRank(board: string, period: string) {
  const key = `${board}:${period}`
  const c = rankCache.get(key)
  if (c && Date.now() - c.at < 60_000) return c.data
  try {
    const r = await fetch(`/api/rank?board=${board}&period=${period}`, { credentials: 'same-origin' })
    const data = (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : { off: true, top: [], me: null, count: 0 }
    rankCache.set(key, { at: Date.now(), data })
    return data
  } catch {
    return null
  }
}

function rankRow(r: RankRow, me = false) {
  const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank ? `#${r.rank}` : '–'
  return `<div class="pf-rank ${me ? 'me' : ''}"><em>${medal}</em>${r.avatar ? `<img src="${esc(r.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<i></i>'}<span><b>${esc(r.name)}</b><small>Lv ${r.lv}${r.title ? ` · ${esc(titleName(r.title))}` : ''}</small></span><strong>${r.score}</strong></div>`
}

function rankTab(board: string, period: string) {
  return `
    <div class="pf-seg" data-k="board"><button data-v="pvp" class="${board === 'pvp' ? 'on' : ''}">⚔️ PvP</button><button data-v="pve" class="${board === 'pve' ? 'on' : ''}">🐉 PvE</button></div>
    <div class="pf-seg" data-k="period"><button data-v="week" class="${period === 'week' ? 'on' : ''}">${L('This week', 'Deze week')}</button><button data-v="all" class="${period === 'all' ? 'on' : ''}">${L('All time', 'Altijd')}</button></div>
    <p class="pf-intro">${board === 'pvp'
      ? L('Battle royale against other people: points for your place (+4 per knockout).', 'Battle royale tegen andere mensen: punten voor je plaats (+4 per uitgeschakelde trainer).')
      : L('Raids (clear + boss damage) and battle royale against bots.', 'Raids (gehaald + baasschade) en battle royale tegen bots.')}</p>
    <div class="pf-ranks"><div class="pf-empty">${L('Loading…', 'Laden…')}</div></div>`
}

async function fillRank(el: HTMLElement, board: string, period: string) {
  const box = el.querySelector('.pf-ranks') as HTMLElement | null
  if (!box) return
  const d = await fetchRank(board, period)
  if (!box.isConnected) return
  if (!d || d.off) {
    box.innerHTML = `<div class="pf-empty">${L('Rankings aren’t available right now.', 'De ranglijst is nu niet beschikbaar.')}</div>`
    return
  }
  const meIn = d.me && d.top.some((r: RankRow) => r.id === d.me!.id)
  box.innerHTML = (d.top.length ? d.top.map((r: RankRow) => rankRow(r, r.id === d.me?.id)).join('') : `<div class="pf-empty">${L('Nobody yet. Be the first!', 'Nog niemand. Wees de eerste!')}</div>`)
    + (d.me && !meIn ? `<div class="pf-rank-sep">⋯</div>${rankRow(d.me, true)}` : '')
    + (!signedIn() && accountStatus() === 'guest' ? `<div class="pf-guest pf-card"><span>🏆 ${L('Log in to appear in the rankings.', 'Log in om in de ranglijst te komen.')}</span><button class="rw-login pf-login">${L('Log in', 'Inloggen')}</button></div>` : '')
  box.querySelector('.pf-login')?.addEventListener('click', () => {
    sfx.select()
    login()
  })
}

// ---------------------------------------------------------------- screen

export function showProfile(o: { trainerSprite: string; name: string; tab?: Tab; back: () => void }) {
  const el = screen()
  let tab: Tab = o.tab ?? 'me'
  let board = 'pvp', period = 'week'
  const paint = () => {
    const p = progress()
    const tabs: [Tab, string][] = [['me', L('Profile', 'Profiel')], ['road', L('Unlocks', 'Vrijspelen')], ['mons', 'Pokémon'], ['ach', L('Awards', 'Prestaties')], ['rank', L('Rankings', 'Ranglijst')]]
    const scroll = (el.querySelector('.pf-body') as HTMLElement | null)?.scrollTop ?? 0
    el.innerHTML = `
      <div class="sel pf">
        <div class="sel-head">
          <button class="sel-back" aria-label="${L('Back', 'Terug')}">◀</button>
          <div class="sel-title"><small>${signedIn() ? `${L('ACCOUNT', 'ACCOUNT')} · ${esc(accountState()?.me.dname ?? '')}` : L('GUEST · THIS DEVICE', 'GAST · DIT APPARAAT')}</small><b>${L('Trainer profile', 'Trainerprofiel')}</b></div>
        </div>
        <nav class="pf-tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</nav>
        <div class="pf-body">${tab === 'me' ? meTab(p, o.trainerSprite, o.name) : tab === 'road' ? roadTab(p) : tab === 'mons' ? monsTab(p) : tab === 'ach' ? achTab(p) : rankTab(board, period)}</div>
      </div>`
    const body = el.querySelector('.pf-body') as HTMLElement
    body.scrollTop = scroll
    el.querySelector('.sel-back')!.addEventListener('click', () => {
      sfx.select()
      off()
      o.back()
    })
    el.querySelectorAll<HTMLElement>('.pf-tabs button').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      tab = b.dataset.tab as Tab
      body.scrollTop = 0
      paint()
      ;(el.querySelector('.pf-body') as HTMLElement).scrollTop = 0
    }))
    el.querySelectorAll('.pf-login').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      login()
    }))
    el.querySelector('.pf-title')?.addEventListener('click', () => {
      sfx.select()
      pickTitle(p)
    })
    el.querySelectorAll<HTMLElement>('.pf-shiny').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      const id = Number(b.dataset.id)
      const on = p.shiny.includes(id)
      void setCosmetics({ shiny: on ? p.shiny.filter((x) => x !== id) : [...p.shiny, id] })
    }))
    el.querySelectorAll<HTMLElement>('.pf-seg button').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      if ((b.parentElement as HTMLElement).dataset.k === 'board') board = b.dataset.v!
      else period = b.dataset.v!
      paint()
    }))
    if (tab === 'rank') void fillRank(el, board, period)
  }
  const off = onProgress(() => (el.querySelector('.pf') ? paint() : off()))
  paint()
}

/** Choose which of your titles is shown next to your name. */
function pickTitle(p: Progress) {
  const modal = document.getElementById('modal')!
  const cur = titleOf(p)
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel fr-invite pf-titles">
      <h2>${L('Your title', 'Jouw titel')}</h2>
      <div class="fr-list">${[...titlesOf(p)].reverse().map((t) => `<button class="pf-tpick ${t === cur ? 'on' : ''}" data-t="${esc(t)}">🏷️ ${esc(titleName(t))}${t === cur ? ' ✓' : ''}</button>`).join('')}</div>
      <p class="pf-intro">${L('Earn more titles with levels, achievements and partner mastery ★10.', 'Verdien meer titels met levels, prestaties en partner-mastery ★10.')}</p>
      <button class="btn" id="fr-done">${L('Done', 'Klaar')}</button>
    </div>`
  const close = () => {
    modal.classList.add('hidden')
    modal.innerHTML = ''
    modal.onclick = null
  }
  modal.querySelectorAll<HTMLElement>('.pf-tpick').forEach((b) => b.addEventListener('click', () => {
    sfx.select()
    close()
    void setCosmetics({ title: b.dataset.t! })
  }))
  modal.querySelector('#fr-done')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.onclick = (e) => e.target === modal && close()
}

/** The level badge on the home screen. */
export function homeBadge() {
  const p = progress()
  const lv = levelOf(p.xp)
  const q = dailyOf(p, today())
  const done = q.filter((x) => x.p >= x.target).length
  const next = nextUnlock(p)
  return `
    <button class="hs-prog">
      <span class="hs-lv"><small>LV</small><b>${lv.lv}</b></span>
      <span class="hs-pinfo"><em>${esc(titleName(titleOf(p)))}</em>${bar(lv.k)}<small>📜 ${done}/${q.length}${liveStreak(p) > 1 ? ` · 🔥${liveStreak(p)}` : ''}${next ? ` · 🔓 Lv ${next.lv}` : ''}</small></span>
      ${next ? `<img class="px hs-next" src="${next.kind === 'partner' ? spriteUrl(Number(next.id)) : trainerSpriteUrl(TRAINERS.find((t) => t.key === next.id)?.sprite ?? next.id)}" alt="">` : ''}
    </button>`
}
