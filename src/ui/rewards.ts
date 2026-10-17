import { sfx } from '../audio'
import { L } from '../i18n'
import { spriteUrl, SPECIES } from '../data/pokemon'
import { accountStatus, login } from '../account'
import { levelOf, masteryOf, MAX_MASTERY, SHINY_AT, type Outcome } from '../../api/_progress'
import { achDesc, achName, ACH_INFO, questText, unlockText, xpLabel } from '../data/rewards'
import type { Reward } from '../progress'
import { esc } from './menu'
import { TRAINERS, trainerSpriteUrl } from '../data/trainers'
import { nextUnlock } from '../../api/_progress'
import { trainerName } from '../data/rewards'

/**
 * Rewards on the results screen: XP gained, the trainer level and partner
 * mastery bars filling up, a detail tab (what the XP was for, quests,
 * achievements) and a short celebration for everything newly unlocked.
 */

export function rewardsHtml() {
  return `
    <div class="rw loading">
      <div class="rw-top"><b class="rw-xp">+0 XP</b><span class="rw-note">${L('Counting your rewards…', 'Beloningen tellen…')}</span></div>
      <div class="rw-bar rw-lvl"><span class="rw-a">Lv 1</span><div class="rw-track"><i></i></div><span class="rw-b"></span></div>
      <div class="rw-bar rw-mas hidden"><img class="px" alt=""><span class="rw-a"></span><div class="rw-track"><i></i></div><span class="rw-b"></span></div>
      <div class="rw-foot"></div>
    </div>`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Fill a bar from k0 to k1 (0..1); with `wraps` full levels in between. */
async function fill(track: HTMLElement, k0: number, k1: number, wraps: number, onWrap: (i: number) => void) {
  const bar = track.querySelector('i') as HTMLElement
  bar.style.transition = 'none'
  bar.style.width = `${k0 * 100}%`
  await sleep(30)
  for (let i = 0; i < wraps; i++) {
    bar.style.transition = 'width 0.7s cubic-bezier(0.3, 0.7, 0.4, 1)'
    bar.style.width = '100%'
    await sleep(750)
    onWrap(i)
    track.classList.remove('flash')
    void track.offsetWidth
    track.classList.add('flash')
    bar.style.transition = 'none'
    bar.style.width = '0%'
    await sleep(40)
  }
  bar.style.transition = 'width 0.9s cubic-bezier(0.3, 0.7, 0.4, 1)'
  bar.style.width = `${Math.max(0.02, k1) * 100}%`
  await sleep(900)
}

/** Count a number up in an element. */
function countUp(el: HTMLElement, to: number, fmt: (n: number) => string, ms = 900) {
  const t0 = performance.now()
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms)
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3))))
    if (k < 1 && el.isConnected) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function detailHtml(o: Outcome, saved: boolean) {
  const lines = o.lines.map(([k, x]) => `<div class="rwd-line"><span>${esc(xpLabel(k))}</span><b>+${x}</b></div>`).join('')
  const quests = o.daily.map((q) => `
    <div class="rwd-q ${q.p >= q.target ? 'done' : ''}">
      <span>${q.p >= q.target ? '✅' : '📜'} ${esc(questText(q.id, q.target))}</span>
      <em>${Math.min(q.p, q.target)}/${q.target} · +${q.xp}</em>
      <div class="rw-track"><i style="width:${Math.min(1, q.p / q.target) * 100}%"></i></div>
    </div>`).join('')
  const ach = o.ach.map((a) => `<div class="rwd-ach"><i>${ACH_INFO[a.id]?.icon ?? '🏆'}</i><span><b>${esc(achName(a.id))}</b><small>${esc(achDesc(a.id))}</small></span><em>+${a.xp}</em></div>`).join('')
  const unl = o.unlocks.map((u) => {
    const x = unlockText(u)
    return `<div class="rwd-ach unl"><i>${x.icon}</i><span><b>${esc(x.text)}</b></span></div>`
  }).join('')
  const pts = o.points.pvp || o.points.pve
    ? `<div class="rwd-line pts"><span>${o.points.pvp ? L('PvP ranking points', 'PvP-rankingpunten') : L('PvE ranking points', 'PvE-rankingpunten')}</span><b>+${o.points.pvp || o.points.pve}</b></div>`
    : ''
  return `
    <h4>${L('Experience', 'Ervaring')} <small>+${o.total} XP</small></h4>
    <div class="rwd-lines">${lines}${saved ? pts : ''}</div>
    ${ach || unl ? `<h4>${L('Unlocked', 'Vrijgespeeld')}</h4>${unl}${ach}` : ''}
    <h4>${L('Daily quests', 'Dagopdrachten')} <small>🔥 ${L(`${o.streak}-day streak`, `${o.streak} dagen op rij`)}</small></h4>
    ${quests}`
}

/** A big "unlocked!" card over the results, one after the other. */
async function celebrate(root: HTMLElement, items: { icon: string; title: string; sub: string; img?: string }[]) {
  for (const it of items) {
    if (!root.isConnected) return
    const pop = document.createElement('div')
    pop.className = 'rw-pop'
    pop.innerHTML = `<div class="rw-pop-card">${it.img ? `<img class="px" src="${it.img}" alt="">` : `<i>${it.icon}</i>`}<b>${esc(it.title)}</b><span>${esc(it.sub)}</span></div>`
    root.append(pop)
    sfx.banner()
    await new Promise<void>((done) => {
      const t = setTimeout(close, 2600)
      function close() {
        clearTimeout(t)
        pop.classList.add('out')
        setTimeout(() => {
          pop.remove()
          done()
        }, 250)
      }
      pop.addEventListener('click', close)
    })
  }
}

export async function runRewards(el: HTMLElement, reward: Promise<Reward | null>, openTab: () => void) {
  const box = el.querySelector('.rw') as HTMLElement
  const detail = el.querySelector('.res-rw') as HTMLElement
  const tabBtn = el.querySelector('.res-tabs [data-tab="rw"]') as HTMLElement | null
  const res = await reward.catch(() => null)
  if (!box.isConnected) return
  box.classList.remove('loading')
  const note = box.querySelector('.rw-note') as HTMLElement
  const foot = box.querySelector('.rw-foot') as HTMLElement
  if (!res) {
    note.textContent = L('Couldn’t save this match’s progress', 'Voortgang van dit potje kon niet worden opgeslagen')
    box.querySelector('.rw-lvl')?.classList.add('hidden')
    tabBtn?.classList.add('hidden')
    return
  }
  const { outcome: o, progress: p, saved } = res
  detail.innerHTML = detailHtml(o, saved)

  // Footer: what's next, or (guests) why to log in
  const shinyLeft = o.mastery.partner && masteryOf(o.mastery.xpTo).lv < SHINY_AT ? SHINY_AT - masteryOf(o.mastery.xpTo).lv : 0
  foot.innerHTML = `<button class="rw-more">${L('Details', 'Details')} ▸</button>`
    + (!saved && accountStatus() === 'guest'
      ? `<button class="rw-login">💾 ${L('Log in to save & rank', 'Log in om op te slaan')}</button>`
      : nextUnlock(p)
        ? `<span class="rw-hint">🔓 ${L('Next', 'Volgende')}: ${esc(nextUnlock(p)!.kind === 'partner' ? SPECIES[Number(nextUnlock(p)!.id)]?.name ?? '' : trainerName(nextUnlock(p)!.id))} · Lv ${nextUnlock(p)!.lv}</span>`
        : shinyLeft && o.mastery.partner
        ? `<span class="rw-hint">✨ ${L(`Shiny ${SPECIES[o.mastery.partner]?.name} at mastery ${SHINY_AT}`, `Shiny ${SPECIES[o.mastery.partner]?.name} bij mastery ${SHINY_AT}`)}</span>`
        : '')
  foot.querySelector('.rw-more')!.addEventListener('click', () => {
    sfx.select()
    openTab()
  })
  foot.querySelector('.rw-login')?.addEventListener('click', () => {
    sfx.select()
    login()
  })
  note.textContent = saved ? L('Saved to your account', 'Opgeslagen in je account') : L('Saved on this device', 'Opgeslagen op dit apparaat')

  // XP counts up, then the bars fill
  countUp(box.querySelector('.rw-xp') as HTMLElement, o.total, (n) => `+${n} XP`)
  sfx.tick()
  const lvBefore = levelOf(p.xp - o.total), lvAfter = levelOf(p.xp)
  const lvlA = box.querySelector('.rw-lvl .rw-a') as HTMLElement, lvlB = box.querySelector('.rw-lvl .rw-b') as HTMLElement
  lvlA.textContent = `Lv ${lvBefore.lv}`
  lvlB.textContent = `${lvBefore.into}/${lvBefore.need}`
  const mas = box.querySelector('.rw-mas') as HTMLElement
  const partner = o.mastery.partner
  if (partner) {
    mas.classList.remove('hidden')
    ;(mas.querySelector('img') as HTMLImageElement).src = spriteUrl(partner, { shiny: p.shiny.includes(partner) && o.mastery.to >= SHINY_AT })
    ;(mas.querySelector('.rw-a') as HTMLElement).textContent = `★${o.mastery.from}`
    const mb = masteryOf(o.mastery.xpFrom)
    ;(mas.querySelector('.rw-b') as HTMLElement).textContent = o.mastery.to >= MAX_MASTERY ? 'MAX' : `${mb.into}/${mb.need}`
  }
  await sleep(500)
  const lvTrack = box.querySelector('.rw-lvl .rw-track') as HTMLElement
  await fill(lvTrack, lvBefore.k, lvAfter.k, lvAfter.lv - lvBefore.lv, (i) => {
    lvlA.textContent = `Lv ${lvBefore.lv + i + 1}`
    sfx.medal(1)
  })
  lvlB.textContent = lvAfter.need ? `${lvAfter.into}/${lvAfter.need}` : 'MAX'
  if (partner) {
    const m0 = masteryOf(o.mastery.xpFrom), m1 = masteryOf(o.mastery.xpTo)
    await fill(mas.querySelector('.rw-track') as HTMLElement, m0.k, m1.k, m1.lv - m0.lv, (i) => {
      ;(mas.querySelector('.rw-a') as HTMLElement).textContent = `★${m0.lv + i + 1}`
      sfx.medal(1)
    })
    ;(mas.querySelector('.rw-b') as HTMLElement).textContent = m1.lv >= MAX_MASTERY ? 'MAX' : `${m1.into}/${m1.need}`
  }

  // Celebrations: level up, unlocks, achievements
  const pops: { icon: string; title: string; sub: string; img?: string }[] = []
  if (o.level.to > o.level.from) pops.push({ icon: '⬆️', title: L(`Trainer level ${o.level.to}!`, `Trainerlevel ${o.level.to}!`), sub: L('Level up', 'Level omhoog') })
  for (const u of o.unlocks) {
    const x = unlockText(u)
    const [kind, id] = u.split(':')
    const img = kind === 'shiny' ? spriteUrl(Number(id), { shiny: true }) : kind === 'partner' ? spriteUrl(Number(id)) : kind === 'trainer' ? trainerSpriteUrl(TRAINERS.find((t) => t.key === id)?.sprite ?? id) : undefined
    const sub = kind === 'shiny' ? L('Switch it on or off in your profile', 'Aan of uit te zetten in je profiel')
      : kind === 'partner' ? L('Pick it under “Pick trainer & Pokémon”', 'Kies hem onder “Kies trainer & Pokémon”')
      : kind === 'trainer' ? L('Pick them under “Pick trainer & Pokémon”', 'Kies je nieuwe trainer onder “Kies trainer & Pokémon”')
      : L('Unlocked', 'Vrijgespeeld')
    pops.push({ icon: x.icon, title: x.text, sub, img })
  }
  for (const a of o.ach) pops.push({ icon: ACH_INFO[a.id]?.icon ?? '🏆', title: achName(a.id), sub: `${L('Achievement', 'Prestatie')} · +${a.xp} XP` })
  for (const q of o.quests) pops.push({ icon: '📜', title: L('Quest complete!', 'Opdracht voltooid!'), sub: `${questText(q.id, o.daily.find((d) => d.id === q.id)?.target ?? 1)} · +${q.xp} XP` })
  await celebrate(el.querySelector('.res') as HTMLElement, pops)
}
