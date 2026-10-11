import { movesetFor, SLOT_UNLOCK } from '../data/moves'
import { animatedUrl, PARTY_MAX, ROSTER, SPECIES, spriteUrl, TEAM_SIZE, type Species } from '../data/pokemon'
import { TRAINERS, trainerSpriteUrl, type TrainerDef } from '../data/trainers'
import { TYPE_COLOR, TYPE_NL } from '../data/types'
import { cry, sfx } from '../audio'
import { ROLES, roleOf, STYLES, styleOf, type Role, type Style } from '../data/roles'

/**
 * Selection screens built like a character-select in a fighting game: a big
 * lit stage with the current pick, a nameplate, and a picker strip below.
 */

const screen = () => document.getElementById('screen')!

const TRAINER_INFO: Record<string, { tag: string; accent: string; quote: string }> = {
  hilbert: { tag: 'Onverschrokken avonturier', accent: '#3870c8', quote: 'Laten we gaan!' },
  hilda: { tag: 'Kampioen in wording', accent: '#e05080', quote: 'Ik geef nooit op.' },
  nate: { tag: 'Snelle starter uit Aspertia', accent: '#e08030', quote: 'Wie is de volgende?' },
  rosa: { tag: 'Ster van Pokéstar Studios', accent: '#f070b0', quote: 'Camera\'s draaien!' },
  cheren: { tag: 'IJskoude strateeg', accent: '#4060a8', quote: 'Alles volgens plan.' },
  bianca: { tag: 'Onvoorspelbaar en vrolijk', accent: '#58b048', quote: 'Wacht op mij!' },
  n: { tag: 'Spreekt de taal van Pokémon', accent: '#78c890', quote: 'Hoor je ze ook?' },
  iris: { tag: 'Drakenmeester van Opelucid', accent: '#9058c8', quote: 'Drakenkracht!' },
}

export function typeChips(sp: Species) {
  return sp.types.map((t) => `<span class="type" style="background:${TYPE_COLOR[t]}">${TYPE_NL[t]}</span>`).join('')
}

function gif(id: number, cls = '') {
  return `<img class="px ${cls}" src="${animatedUrl(id)}" onerror="this.onerror=null;this.src='${spriteUrl(id)}'" alt="">`
}

function shell(step: string, title: string, body: string, cta: string) {
  return `
    <div class="sel">
      <div class="sel-head">
        <button class="sel-back" aria-label="Terug">◀</button>
        <div class="sel-title"><small>${step}</small><b>${title}</b></div>
      </div>
      ${body}
      <div class="sel-foot"><button class="cta">${cta}</button></div>
    </div>`
}

// ---------------- Trainer ----------------

export function showTrainerSelect(current: string | null, onBack: () => void, onPick: (t: TrainerDef) => void) {
  const el = screen()
  let sel = TRAINERS.find((t) => t.key === current) ?? TRAINERS[0]
  el.innerHTML = shell('STAP 1 / 2', 'Kies je trainer', `
    <div class="hero trainer-hero">
      <div class="hero-bg"></div>
      <div class="hero-beam"></div>
      <div class="hero-plat"></div>
      <div class="hero-fig"></div>
      <div class="plate"><b></b><span></span></div>
      <div class="quote"></div>
    </div>
    <div class="strip">
      ${TRAINERS.map((t) => `<button class="thumb" data-k="${t.key}"><img class="px" src="${trainerSpriteUrl(t.sprite)}" alt=""><span>${t.name}</span></button>`).join('')}
    </div>`, 'Verder ▶')

  const hero = el.querySelector('.hero') as HTMLElement
  const paint = (animate: boolean) => {
    const info = TRAINER_INFO[sel.key]
    hero.style.setProperty('--accent', info.accent)
    el.querySelector('.hero-fig')!.innerHTML = `<img class="px" src="${trainerSpriteUrl(sel.sprite)}" alt="">`
    el.querySelector('.plate b')!.textContent = sel.name
    el.querySelector('.plate span')!.textContent = info.tag
    el.querySelector('.quote')!.textContent = `“${info.quote}”`
    el.querySelectorAll<HTMLElement>('.thumb').forEach((b) => b.classList.toggle('on', b.dataset.k === sel.key))
    if (animate) {
      hero.classList.remove('swap')
      void hero.offsetWidth
      hero.classList.add('swap')
    }
  }
  el.querySelectorAll<HTMLElement>('.thumb').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.k === sel.key) return
      sel = TRAINERS.find((t) => t.key === b.dataset.k)!
      sfx.select()
      paint(true)
    }),
  )
  el.querySelector('.sel-back')!.addEventListener('click', () => {
    sfx.select()
    onBack()
  })
  el.querySelector('.cta')!.addEventListener('click', () => {
    sfx.select()
    onPick(sel)
  })
  paint(true)
}

// ---------------- Partner Pokémon ----------------

export function showRoster(initial: number[], onBack: () => void, onGo: (team: number[]) => void, cta = 'Start de battle ▶') {
  const el = screen()
  let pick = initial.find((id) => ROSTER.includes(id)) ?? ROSTER[0]
  el.innerHTML = shell('STAP 2 / 2', 'Kies je partner', `
    <div class="hero mon-hero">
      <div class="hero-bg"></div>
      <div class="hero-rays"></div>
      <div class="hero-plat"></div>
      <div class="hero-fig"></div>
      <div class="plate"><b></b><span class="chips"></span><span class="role-line"></span></div>
      <div class="info">
        <div class="stats"></div>
        <div class="moves2"></div>
        <div class="evo"></div>
      </div>
    </div>
    <div class="mon-filter">
      <div class="mf-row" role="group" aria-label="Rol">
        <button class="mf on" data-role="all">Alle</button>
        ${(Object.keys(ROLES) as Role[]).map((r) => `<button class="mf" data-role="${r}" style="--rc:${ROLES[r].color}"><i>${ROLES[r].icon}</i>${ROLES[r].name}</button>`).join('')}
      </div>
      <div class="mf-row" role="group" aria-label="Aanvalsstijl">
        <button class="mf on" data-style="all">Alle stijlen</button>
        <button class="mf" data-style="melee">Melee</button>
        <button class="mf" data-style="ranged">Ranged</button>
        <span class="mf-count"></span>
      </div>
    </div>
    <div class="mon-grid">
      ${ROSTER.map((id) => {
        const r = ROLES[roleOf(id)]
        return `<button class="tile" data-id="${id}" data-role="${roleOf(id)}" data-style="${styleOf(id)}" style="--tc:${TYPE_COLOR[SPECIES[id].types[0]]};--rc:${r.color}"><i class="rl" title="${r.name}">${r.icon}</i><img class="px" src="${spriteUrl(id)}" alt=""><span>${SPECIES[id].name}</span></button>`
      }).join('')}
      <div class="mf-empty hidden">Geen partners met deze filters</div>
    </div>
    <div class="sel-note">Je start met 1 partner. In de wereld vang je er nog ${PARTY_MAX - TEAM_SIZE} bij.</div>`, cta)

  const hero = el.querySelector('.hero') as HTMLElement
  const paint = (animate: boolean) => {
    const sp = SPECIES[pick]
    const c1 = TYPE_COLOR[sp.types[0]]
    const c2 = TYPE_COLOR[sp.types[1] ?? sp.types[0]]
    hero.style.setProperty('--accent', c1)
    hero.style.setProperty('--accent2', c2)
    el.querySelector('.hero-fig')!.innerHTML = gif(pick)
    el.querySelector('.plate b')!.textContent = sp.name
    el.querySelector('.plate .chips')!.innerHTML = typeChips(sp)
    const role = ROLES[roleOf(pick)]
    el.querySelector('.plate .role-line')!.innerHTML =
      `<em class="rb" style="--rc:${role.color}"><i>${role.icon}</i>${role.name}</em><em class="sb">${STYLES[styleOf(pick)]}</em><small>${role.bonus}</small>`
    const stat = (label: string, v: number) =>
      `<div class="st"><span>${label}</span><i><em style="--w:${Math.min(100, (v / 120) * 100)}%"></em></i><b>${v}</b></div>`
    el.querySelector('.stats')!.innerHTML = stat('HP', sp.hp) + stat('ATK', sp.atk) + stat('DEF', sp.def) + stat('SPE', sp.spe)
    el.querySelector('.moves2')!.innerHTML = movesetFor(sp.types)
      .map((m, i) => `<div class="mv2" style="--tc:${TYPE_COLOR[m.type]}"><span>${m.name}</span><small>${i === 0 ? 'Start' : `Lv ${SLOT_UNLOCK[i]}`}</small></div>`)
      .join('')
    // Evolution line
    const line: string[] = [`<img class="px" src="${spriteUrl(sp.id)}" alt="">`]
    let cur: Species | undefined = sp
    while (cur?.evo) {
      const next: Species = SPECIES[cur.evo[0]]
      line.push(`<span class="arrow">Lv ${cur.evoLevel}<br>▶</span>`)
      line.push(cur.evo.length > 1 ? `<span class="multi">${cur.evo.map((e) => `<img class="px" src="${spriteUrl(e)}" alt="">`).join('')}</span>` : `<img class="px" src="${spriteUrl(next.id)}" alt="">`)
      cur = cur.evo.length === 1 ? next : undefined
    }
    el.querySelector('.evo')!.innerHTML = line.length > 1 ? line.join('') : '<span class="arrow">Evolueert niet</span>'
    el.querySelectorAll<HTMLElement>('.tile').forEach((b) => b.classList.toggle('on', Number(b.dataset.id) === pick))
    if (animate) {
      hero.classList.remove('swap')
      void hero.offsetWidth
      hero.classList.add('swap')
    }
  }
  // Filters: role and attack style
  let fRole: Role | 'all' = 'all', fStyle: Style | 'all' = 'all'
  const applyFilter = () => {
    let n = 0
    el.querySelectorAll<HTMLElement>('.tile').forEach((t) => {
      const ok = (fRole === 'all' || t.dataset.role === fRole) && (fStyle === 'all' || t.dataset.style === fStyle)
      t.classList.toggle('hidden', !ok)
      if (ok) n++
    })
    el.querySelector('.mf-count')!.textContent = `${n} van ${ROSTER.length}`
    el.querySelector('.mf-empty')!.classList.toggle('hidden', n > 0)
    el.querySelectorAll<HTMLElement>('[data-role].mf').forEach((b) => b.classList.toggle('on', b.dataset.role === fRole))
    el.querySelectorAll<HTMLElement>('[data-style].mf').forEach((b) => b.classList.toggle('on', b.dataset.style === fStyle))
  }
  el.querySelectorAll<HTMLElement>('.mf').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      if (b.dataset.role) fRole = b.dataset.role as Role | 'all'
      if (b.dataset.style) fStyle = b.dataset.style as Style | 'all'
      applyFilter()
    }),
  )
  applyFilter()
  el.querySelectorAll<HTMLElement>('.tile').forEach((b) =>
    b.addEventListener('click', () => {
      const id = Number(b.dataset.id)
      if (id === pick) return
      pick = id
      sfx.select()
      cry(id, 0.25)
      paint(true)
    }),
  )
  el.querySelector('.sel-back')!.addEventListener('click', () => {
    sfx.select()
    onBack()
  })
  el.querySelector('.cta')!.addEventListener('click', () => {
    sfx.select()
    cry(pick, 0.3)
    onGo([pick])
  })
  paint(true)
}
