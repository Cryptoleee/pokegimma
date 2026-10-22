import { ALL_PARTNERS, SPECIES, spriteUrl } from '../data/pokemon'
import { movesetFor, SLOT_UNLOCK } from '../data/moves'
import { TYPE_COLOR } from '../data/types'
import { ROLES, roleOf, STYLES, styleOf, type Role, type Style } from '../data/roles'
import { AWAKENS } from '../game/entities'
import { TRAINER_INFO } from './select'
import { TRAINERS, trainerSpriteUrl, type TrainerDef } from '../data/trainers'
import { cry, sfx } from '../audio'
import { L } from '../i18n'
import { progress } from '../progress'
import { isUnlocked, masteryOf, nextUnlock, levelOf, unlockLevel } from '../../api/_progress'
import { lockText, trainerName } from '../data/rewards'
import { appEsc as esc, appShell, bar, bindShell, IC, icon, masteryLine, monChips, teamStage, type AppTab } from './app'
import { shinyPartner } from './menu'

/**
 * Switching your team without leaving the screen you're on: a sheet with your
 * partners (most-played first, with their mastery), your trainers and the
 * next reward you're working towards.
 */
const arrows = `<button class="n-ts-arrow prev" data-dir="-1" aria-label="${'\u2039'}">${icon(IC.back, 18)}</button><button class="n-ts-arrow next" data-dir="1" aria-label="${'\u203a'}">${icon(IC.next, 18)}</button>`

/**
 * A row of picks you can move through any way you like: swipe on a phone,
 * the mouse wheel or a drag with the mouse, or the arrows at its ends.
 */
function scroller(wrap: HTMLElement) {
  const row = wrap.querySelector('.n-ts-row') as HTMLElement
  const ends = () => {
    wrap.classList.toggle('at-start', row.scrollLeft < 4)
    wrap.classList.toggle('at-end', row.scrollLeft > row.scrollWidth - row.clientWidth - 4)
  }
  row.addEventListener('scroll', ends, { passive: true })
  requestAnimationFrame(ends)
  // A vertical wheel moves the row sideways
  row.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    row.scrollLeft += e.deltaY
  }, { passive: false })
  wrap.querySelectorAll<HTMLElement>('.n-ts-arrow').forEach((b) => b.addEventListener('click', () => {
    row.scrollBy({ left: Number(b.dataset.dir) * row.clientWidth * 0.8, behavior: 'smooth' })
  }))
  // Drag with the mouse (touch already swipes); a drag doesn't count as a click
  let x0 = 0, sl = 0, dragging = false, moved = false
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return
    dragging = true
    moved = false
    x0 = e.clientX
    sl = row.scrollLeft
  })
  row.addEventListener('pointermove', (e) => {
    if (!dragging) return
    if (!moved && Math.abs(e.clientX - x0) > 5) {
      moved = true
      row.setPointerCapture(e.pointerId)
    }
    if (moved) row.scrollLeft = sl - (e.clientX - x0)
  })
  const stop = () => (dragging = false)
  row.addEventListener('pointerup', stop)
  row.addEventListener('pointercancel', stop)
  row.addEventListener('click', (e) => {
    if (!moved) return
    e.stopPropagation()
    e.preventDefault()
    moved = false
  }, true)
}

export function openTeamSheet(o: { trainer: TrainerDef; mon: number | undefined; pick(t: TrainerDef, mon: number): void; seeAll(): void }) {
  const p = progress()
  const mons = ALL_PARTNERS.filter((id) => isUnlocked(p, 'partner', id))
    .sort((a, b) => (p.partners[b] ?? 0) - (p.partners[a] ?? 0))
  const trainers = TRAINERS.filter((t) => isUnlocked(p, 'trainer', t.key))
  let tr = o.trainer
  let mon = o.mon && mons.includes(o.mon) ? o.mon : mons[0]

  const s = document.createElement('div')
  s.className = 'n-sheet n-teamsheet'
  document.body.append(s)

  const reward = () => {
    const next = nextUnlock(p)
    if (!next) return ''
    const lv = levelOf(p.xp)
    const img = next.kind === 'partner' ? spriteUrl(Number(next.id)) : trainerSpriteUrl(TRAINERS.find((t) => t.key === next.id)?.sprite ?? next.id)
    const name = next.kind === 'partner' ? SPECIES[Number(next.id)]?.name : trainerName(next.id)
    return `
      <div class="n-reward">
        <img class="px n-sil" src="${img}" alt="">
        <div><b>${L(`Next reward: ${esc(name ?? '')}`, `Volgende beloning: ${esc(name ?? '')}`)}</b><span class="n-tc-m">Lv ${lv.lv}${bar(lv.lv === next.lv - 1 ? lv.k : (lv.lv + lv.k) / next.lv)}Lv ${next.lv}</span></div>
      </div>`
  }

  const paint = () => {
    const m = masteryLine(mon)
    s.innerHTML = `
      <div class="n-sheet-card" role="dialog" aria-label="${L('Choose your team', 'Kies je team')}">
        <div class="n-sheet-head"><h2>${L('Choose your team', 'Kies je team')}</h2><button class="n-x" aria-label="${L('Close', 'Sluiten')}">${icon(IC.close, 16)}</button></div>
        <div class="n-ts-preview">
          <span class="n-ts-pic">${teamStage(tr, mon, shinyPartner(mon), 'n-duo-s')}</span>
          <div class="n-ts-info">
            <b>${esc(tr.name)} &amp; ${SPECIES[mon].name}</b>
            <div class="n-ts-chips">${monChips(mon)}</div>
            <span class="n-tc-m">${L('Mastery', 'Meesterschap')} ${m.lv}${bar(m.k)}</span>
            <small>${esc(m.hint)}</small>
          </div>
        </div>
        <div class="n-sec"><b class="n-h3">Pokémon</b><button class="n-link" data-act="all">${L(`All ${ALL_PARTNERS.length}`, `Alle ${ALL_PARTNERS.length}`)}</button></div>
        <div class="n-ts-wrap">${arrows}<div class="n-ts-row">${mons.map((id) => `<button class="n-ts-mon ${id === mon ? 'on' : ''}" data-mon="${id}" aria-pressed="${id === mon}" aria-label="${SPECIES[id].name}"><img class="px" src="${spriteUrl(id)}" alt=""><span>★${masteryOf(p.partners[id] ?? 0).lv}</span></button>`).join('')}</div></div>
        <div class="n-sec"><b class="n-h3">Trainer</b><button class="n-link" data-act="all">${L(`All ${TRAINERS.length}`, `Alle ${TRAINERS.length}`)}</button></div>
        <div class="n-ts-wrap">${arrows}<div class="n-ts-row">${trainers.map((t) => `<button class="n-ts-tr ${t.key === tr.key ? 'on' : ''}" data-tr="${t.key}" aria-pressed="${t.key === tr.key}" aria-label="${esc(t.name)}"><img class="px" src="${trainerSpriteUrl(t.sprite)}" alt=""></button>`).join('')}</div></div>
        ${reward()}
        <button class="n-btn" data-act="use">${L('Use this team', 'Gebruik dit team')}</button>
      </div>`
    s.querySelector('.n-x')!.addEventListener('click', () => {
      sfx.select()
      close()
    })
    s.querySelectorAll<HTMLElement>('.n-ts-wrap').forEach(scroller)
    s.querySelectorAll<HTMLElement>('[data-act="all"]').forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      close()
      o.seeAll()
    }))
    s.querySelectorAll<HTMLElement>('[data-mon]').forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.dataset.mon)
      if (id === mon) return
      mon = id
      sfx.select()
      cry(id, 0.25)
      keepScroll(paint)
    }))
    s.querySelectorAll<HTMLElement>('[data-tr]').forEach((b) => b.addEventListener('click', () => {
      const t = TRAINERS.find((x) => x.key === b.dataset.tr)
      if (!t || t.key === tr.key) return
      tr = t
      sfx.select()
      keepScroll(paint)
    }))
    s.querySelector('[data-act="use"]')!.addEventListener('click', () => {
      sfx.select()
      close()
      o.pick(tr, mon)
    })
  }
  /** Repaint without the rows jumping back to the start. */
  const keepScroll = (fn: () => void) => {
    const rows = [...s.querySelectorAll<HTMLElement>('.n-ts-row')].map((r) => r.scrollLeft)
    const top = (s.querySelector('.n-sheet-card') as HTMLElement).scrollTop
    fn()
    s.querySelectorAll<HTMLElement>('.n-ts-row').forEach((r, i) => (r.scrollLeft = rows[i] ?? 0))
    ;(s.querySelector('.n-sheet-card') as HTMLElement).scrollTop = top
  }
  const close = () => {
    removeEventListener('keydown', onKey)
    s.classList.remove('open')
    setTimeout(() => s.remove(), 300)
  }
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
  addEventListener('keydown', onKey)
  s.addEventListener('click', (e) => e.target === s && close())
  paint()
  // Bring the current pick into view
  s.querySelectorAll<HTMLElement>('.n-ts-row .on').forEach((b) => b.scrollIntoView({ inline: 'center', block: 'nearest' }))
  requestAnimationFrame(() => s.classList.add('open'))
}

// ---------------------------------------------------------------- the Team tab

export interface TeamPageOpts {
  trainer: TrainerDef
  mon: number
  /** Which picker is open. */
  pane?: 'mon' | 'trainer'
  /** A new pick (saved straight away). */
  set(t: TrainerDef, mon: number): void
  /** Picker mode (from a lobby): no tab bar, a Done button instead. */
  done?: () => void
  doneLabel?: string
  /** Picker mode: where the back button goes, and what it says ("Back to the lobby"). Default: done. */
  back?: () => void
  backLabel?: string
  /** The mode you came from: the back button takes its colour. */
  backKind?: 'royale' | 'duel' | 'raid'
  tab(t: AppTab): void
}

const STAT_MAX = 130

/**
 * Team: your duo up top (stats, moves and evolution of your partner, or your
 * trainer's quote), then the picker: Pokémon with role and style filters, or
 * trainers. Locked ones can be looked at and say when they unlock.
 */
export function showTeam(o: TeamPageOpts) {
  const el = document.getElementById('screen')!
  let pane = o.pane ?? 'mon'
  let tr = o.trainer
  let mon = o.mon
  let fRole: Role | 'all' = 'all'
  let fStyle: Style | 'all' = 'all'
  // Looking at something locked: shown up top, but your team stays as it was
  let peekMon: number | null = null
  let peekTr: TrainerDef | null = null

  const preview = () => {
    const p = progress()
    const showTr = peekTr ?? tr
    const showMon = peekMon ?? mon
    const locked = peekMon != null || peekTr != null
    const lockLine = peekMon != null
      ? lockText('partner', peekMon).long
      : peekTr ? lockText('trainer', peekTr.key).long : ''
    if (pane === 'trainer') {
      const info = TRAINER_INFO[showTr.key]
      return `
        <section class="n-tp ${locked ? 'locked' : ''}">
          <div class="n-tp-stage">${teamStage(showTr, mon, shinyPartner(mon))}</div>
          <div class="n-tp-info">
            <h2 class="n-h1">${esc(showTr.name)}</h2>
            ${info ? `<p class="n-tp-tag">${esc(info.tag())}</p><p class="n-tp-quote">“${esc(info.quote())}”</p>` : ''}
            <p class="n-note">${L('Trainers are how you look in a match; they don’t change your strength.', 'Trainers bepalen hoe je eruitziet in een potje; ze veranderen niets aan je kracht.')}</p>
            ${locked ? `<span class="n-lockline">${icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 14)}${lockLine}</span>` : ''}
          </div>
        </section>`
    }
    const sp = SPECIES[showMon]
    const role = ROLES[roleOf(showMon)]
    const m = masteryOf(p.partners[showMon] ?? 0)
    const stat = (k: string, v: number) => `<span>${k}</span>${bar(v / STAT_MAX, 'white')}<b>${v}</b>`
    const moves = movesetFor(sp.types, sp.id).map((mv, i) => `<li class="${mv.sig ? 'sig' : ''}"><i style="background:${TYPE_COLOR[mv.type]}"></i><b>${mv.sig ? '★ ' : ''}${esc(mv.name)}</b><small>${i === 0 ? 'Start' : `Lv ${SLOT_UNLOCK[i]}`}</small></li>`).join('')
    const line: string[] = [`<img class="px" src="${spriteUrl(sp.id)}" alt="">`]
    let cur: typeof sp | undefined = sp
    while (cur?.evo) {
      line.push(`<small>Lv ${cur.evoLevel} ›</small>`, cur.evo.map((e) => `<img class="px" src="${spriteUrl(e)}" alt="">`).join(''))
      cur = cur.evo.length === 1 ? SPECIES[cur.evo[0]] : undefined
    }
    return `
      <section class="n-tp ${locked ? 'locked' : ''}">
        <div class="n-tp-stage">${teamStage(tr, showMon, peekMon == null && shinyPartner(showMon))}</div>
        <div class="n-tp-info">
          <h2 class="n-h1">${sp.name}</h2>
          <div class="n-ts-chips">${monChips(showMon)}<span class="n-chip">${STYLES[styleOf(showMon)]}</span></div>
          <p class="n-tp-tag">${esc(role.name)} · ${esc(role.bonus)}</p>
          ${locked ? `<span class="n-lockline">${icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 14)}${lockLine}</span>` : `<span class="n-tc-m">${L('Mastery', 'Meesterschap')} ${m.lv}${bar(m.k)}</span>`}
          <div class="n-tp-stats">${stat('HP', sp.hp)}${stat('ATK', sp.atk)}${stat('DEF', sp.def)}${stat('SPE', sp.spe)}</div>
          <ul class="n-tp-moves">${moves}</ul>
          <div class="n-tp-evo">${line.length > 1 ? line.join('') : AWAKENS[sp.id] ? `<small>${L('Awakens: grows into its full power with level', 'Ontwaakt: groeit met elk level naar zijn volle kracht')}</small>` : `<small>${L('Doesn’t evolve', 'Evolueert niet')}</small>`}</div>
        </div>
      </section>`
  }

  const picker = () => {
    const p = progress()
    if (pane === 'trainer') return `
      <div class="n-grid n-grid-tr">${TRAINERS.map((t) => {
        const ok = isUnlocked(p, 'trainer', t.key)
        const on = t.key === (peekTr ?? tr).key
        return `<button class="n-pick ${on ? 'on' : ''} ${ok ? '' : 'locked'}" data-tr="${t.key}" aria-pressed="${on}" aria-label="${esc(t.name)}${ok ? '' : L(', locked', ', vergrendeld')}"><img class="px" src="${trainerSpriteUrl(t.sprite)}" alt=""><span>${ok ? esc(t.name) : lockText('trainer', t.key).short}</span></button>`
      }).join('')}</div>`
    const list = [...ALL_PARTNERS]
      .sort((a, b) => Number(isUnlocked(p, 'partner', b)) - Number(isUnlocked(p, 'partner', a)) || unlockLevel('partner', a) - unlockLevel('partner', b))
      .filter((id) => (fRole === 'all' || roleOf(id) === fRole) && (fStyle === 'all' || styleOf(id) === fStyle))
    return `
      <div class="n-filters">
        <div class="n-chips-row" role="group" aria-label="${L('Role', 'Rol')}">
          <button class="n-fchip ${fRole === 'all' ? 'on' : ''}" data-role="all">${L('All', 'Alle')}</button>
          ${(Object.keys(ROLES) as Role[]).map((r) => `<button class="n-fchip ${fRole === r ? 'on' : ''}" data-role="${r}">${ROLES[r].name}</button>`).join('')}
        </div>
        <div class="n-chips-row" role="group" aria-label="${L('Attack style', 'Aanvalsstijl')}">
          <button class="n-fchip ${fStyle === 'all' ? 'on' : ''}" data-style="all">${L('All styles', 'Alle stijlen')}</button>
          <button class="n-fchip ${fStyle === 'melee' ? 'on' : ''}" data-style="melee">Melee</button>
          <button class="n-fchip ${fStyle === 'ranged' ? 'on' : ''}" data-style="ranged">Ranged</button>
          <span class="n-note n-count">${list.length}/${ALL_PARTNERS.length}</span>
        </div>
      </div>
      <div class="n-grid">${list.length ? list.map((id) => {
        const ok = isUnlocked(p, 'partner', id)
        const on = id === (peekMon ?? mon)
        return `<button class="n-pick ${on ? 'on' : ''} ${ok ? '' : 'locked'}" data-mon="${id}" aria-pressed="${on}" aria-label="${SPECIES[id].name}${ok ? '' : L(', locked', ', vergrendeld')}"><img class="px" src="${spriteUrl(id)}" alt=""><span>${ok ? `★${masteryOf(p.partners[id] ?? 0).lv}` : lockText('partner', id).short}</span></button>`
      }).join('') : `<p class="n-note">${L('No partners match these filters', 'Geen partners met deze filters')}</p>`}</div>`
  }

  const paint = () => {
    const scroll = (el.querySelector('.n-main') as HTMLElement | null)?.scrollTop ?? 0
    const page = `
      <div class="n-page n-teampage">
        <header class="n-top">${o.done ? `<button class="n-backpill ${o.backKind ? `n-tint-${o.backKind}` : ''}" data-act="back">${icon(IC.back, 18)}<span>${esc(o.backLabel ?? L('Back', 'Terug'))}</span></button>` : ''}<h1 class="n-h1">Team</h1></header>
        ${preview()}
        <div class="n-teampick">
          <div class="n-seg" role="tablist" aria-label="Team"><button role="tab" data-pane="mon" class="${pane === 'mon' ? 'on' : ''}" aria-selected="${pane === 'mon'}">Pokémon</button><button role="tab" data-pane="trainer" class="${pane === 'trainer' ? 'on' : ''}" aria-selected="${pane === 'trainer'}">Trainer</button></div>
          ${picker()}
        </div>
        ${o.done ? `<div class="n-dock"><button class="n-btn" data-act="done">${esc(o.doneLabel ?? L('Done', 'Klaar'))}</button></div>` : ''}
      </div>`
    el.innerHTML = appShell('team', page, { focus: !!o.done, bare: !!o.done })
    bindShell(el, o.tab)
    ;(el.querySelector('.n-main') as HTMLElement).scrollTop = scroll
    const on = (sel: string, fn: (b: HTMLElement) => void) => el.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', () => {
      sfx.select()
      fn(b)
    }))
    on('[data-act="done"]', () => o.done!())
    on('[data-act="back"]', () => (o.back ?? o.done)!())
    on('[data-pane]', (b) => {
      pane = b.dataset.pane as 'mon' | 'trainer'
      peekMon = peekTr = null
      paint()
    })
    on('[data-role]', (b) => {
      fRole = b.dataset.role as Role | 'all'
      paint()
    })
    on('[data-style]', (b) => {
      fStyle = b.dataset.style as Style | 'all'
      paint()
    })
    on('[data-mon]', (b) => {
      const id = Number(b.dataset.mon)
      cry(id, 0.25)
      if (!isUnlocked(progress(), 'partner', id)) {
        peekMon = id
        return paint()
      }
      peekMon = null
      mon = id
      o.set(tr, mon)
      paint()
    })
    on('[data-tr]', (b) => {
      const t = TRAINERS.find((x) => x.key === b.dataset.tr)!
      if (!isUnlocked(progress(), 'trainer', t.key)) {
        peekTr = t
        return paint()
      }
      peekTr = null
      tr = t
      o.set(tr, mon)
      paint()
    })
  }
  paint()
}
