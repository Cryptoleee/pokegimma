import { movesetFor, SLOT_UNLOCK } from '../data/moves'
import { ALL_PARTNERS, animatedUrl, PARTY_MAX, SPECIES, spriteUrl, TEAM_SIZE, type Species } from '../data/pokemon'
import { TRAINERS, trainerSpriteUrl, type TrainerDef } from '../data/trainers'
import { TYPE_COLOR, TYPE_NL } from '../data/types'
import { cry, sfx } from '../audio'
import { ROLES, roleOf, STYLES, styleOf, type Role, type Style } from '../data/roles'
import { L } from '../i18n'
import { AWAKENS } from '../game/entities'
import { progress } from '../progress'
import { isUnlocked, unlockLevel } from '../../api/_progress'

const owned = (kind: 'partner' | 'trainer', id: string | number) => isUnlocked(progress(), kind, id)
const lockChip = (kind: 'partner' | 'trainer', id: string | number) => owned(kind, id) ? '' : `<em class="lock">🔒 Lv ${unlockLevel(kind, id)}</em>`

/**
 * Selection screens built like a character-select in a fighting game: a big
 * lit stage with the current pick, a nameplate, and a picker strip below.
 */

const screen = () => document.getElementById('screen')!

/** Tag line and quote per trainer, read when painted so they follow the current language. */
const TRAINER_INFO: Record<string, { tag: () => string; accent: string; quote: () => string }> = {
  hilbert: { tag: () => L('Fearless adventurer', 'Onverschrokken avonturier'), accent: '#3870c8', quote: () => L('Let\'s go!', 'Laten we gaan!') },
  hilda: { tag: () => L('Champion in the making', 'Kampioen in wording'), accent: '#e05080', quote: () => L('I never give up.', 'Ik geef nooit op.') },
  nate: { tag: () => L('Fast starter from Aspertia', 'Snelle starter uit Aspertia'), accent: '#e08030', quote: () => L('Who\'s next?', 'Wie is de volgende?') },
  rosa: { tag: () => L('Star of Pokéstar Studios', 'Ster van Pokéstar Studios'), accent: '#f070b0', quote: () => L('Cameras rolling!', 'Camera\'s draaien!') },
  cheren: { tag: () => L('Ice-cold strategist', 'IJskoude strateeg'), accent: '#4060a8', quote: () => L('All according to plan.', 'Alles volgens plan.') },
  bianca: { tag: () => L('Unpredictable and cheerful', 'Onvoorspelbaar en vrolijk'), accent: '#58b048', quote: () => L('Wait for me!', 'Wacht op mij!') },
  n: { tag: () => L('Speaks the language of Pokémon', 'Spreekt de taal van Pokémon'), accent: '#78c890', quote: () => L('Can you hear them too?', 'Hoor je ze ook?') },
  iris: { tag: () => L('Dragon master of Opelucid', 'Drakenmeester van Opelucid'), accent: '#9058c8', quote: () => L('Dragon power!', 'Drakenkracht!') },
  elesa: { tag: () => L('Shining supermodel', 'Stralend supermodel'), accent: '#f0d030', quote: () => L('Shall we make this electrifying?', 'Zullen we het elektrisch maken?') },
  hugh: { tag: () => L('Hot-headed rival', 'Heethoofdige rivaal'), accent: '#3858a8', quote: () => L('I won’t lose this time!', 'Deze keer verlies ik niet!') },
  skyla: { tag: () => L('Ace pilot of Mistralton', 'Toppiloot van Mistralton'), accent: '#58b0e8', quote: () => L('Ready for takeoff!', 'Klaar voor vertrek!') },
  roxie: { tag: () => L('Poison punk rocker', 'Giftige punkrocker'), accent: '#a050c0', quote: () => L('Let’s get loud!', 'Zet hem harder!') },
  burgh: { tag: () => L('Dreamy bug artist', 'Dromerige insectenkunstenaar'), accent: '#78b040', quote: () => L('Battling is art.', 'Vechten is kunst.') },
  shauntal: { tag: () => L('Ghostly novelist', 'Spookachtige schrijfster'), accent: '#7050a0', quote: () => L('This will make a fine story.', 'Dit wordt een mooi verhaal.') },
  colress: { tag: () => L('Curious scientist', 'Nieuwsgierige wetenschapper'), accent: '#48a0d0', quote: () => L('Show me your true strength.', 'Laat me je ware kracht zien.') },
  drayden: { tag: () => L('Dragon-taming mayor', 'Drakentemmende burgemeester'), accent: '#608050', quote: () => L('Fight with all you have.', 'Vecht met alles wat je hebt.') },
  grimsley: { tag: () => L('Elite gambler', 'Elite-gokker'), accent: '#405080', quote: () => L('Let’s roll the dice.', 'Laten we de dobbelsteen gooien.') },
  steven: { tag: () => L('Stone-collecting champion', 'Stenenverzamelende kampioen'), accent: '#8090b0', quote: () => L('Rocks never lie.', 'Stenen liegen nooit.') },
  lance: { tag: () => L('Legendary dragon tamer', 'Legendarische drakentemmer'), accent: '#c03040', quote: () => L('Dragons, to me!', 'Draken, kom!') },
  cynthia: { tag: () => L('Unbeatable champion', 'Onverslaanbare kampioen'), accent: '#303040', quote: () => L('Shall we begin?', 'Zullen we beginnen?') },
  ghetsis: { tag: () => L('Scheming mastermind', 'Sluwe meesterbrein'), accent: '#4a5a40', quote: () => L('Everything goes as planned.', 'Alles gaat volgens plan.') },
  red: { tag: () => L('The silent legend', 'De zwijgende legende'), accent: '#e03030', quote: () => '…' },
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
        <button class="sel-back" aria-label="${L('Back', 'Terug')}">◀</button>
        <div class="sel-title"><small>${step}</small><b>${title}</b></div>
      </div>
      ${body}
      <div class="sel-foot"><button class="cta">${cta}</button></div>
    </div>`
}

// ---------------- Trainer ----------------

export function showTrainerSelect(current: string | null, onBack: () => void, onPick: (t: TrainerDef) => void) {
  const el = screen()
  let sel = TRAINERS.find((t) => t.key === current && owned('trainer', t.key)) ?? TRAINERS[0]
  el.innerHTML = shell(L('STEP 1 / 2', 'STAP 1 / 2'), L('Pick your trainer', 'Kies je trainer'), `
    <div class="hero trainer-hero">
      <div class="hero-bg"></div>
      <div class="hero-beam"></div>
      <div class="hero-plat"></div>
      <div class="hero-fig"></div>
      <div class="plate"><b></b><span></span></div>
      <div class="quote"></div>
    </div>
    <div class="strip">
      ${TRAINERS.map((t) => `<button class="thumb ${owned('trainer', t.key) ? '' : 'locked'}" data-k="${t.key}"><img class="px" src="${trainerSpriteUrl(t.sprite)}" alt=""><span>${t.name}</span>${lockChip('trainer', t.key)}</button>`).join('')}
    </div>`, L('Next ▶', 'Verder ▶'))

  const hero = el.querySelector('.hero') as HTMLElement
  const paint = (animate: boolean) => {
    const info = TRAINER_INFO[sel.key]
    hero.style.setProperty('--accent', info.accent)
    el.querySelector('.hero-fig')!.innerHTML = `<img class="px" src="${trainerSpriteUrl(sel.sprite)}" alt="">`
    el.querySelector('.plate b')!.textContent = sel.name
    el.querySelector('.plate span')!.textContent = info.tag()
    el.querySelector('.quote')!.textContent = `“${info.quote()}”`
    el.querySelectorAll<HTMLElement>('.thumb').forEach((b) => b.classList.toggle('on', b.dataset.k === sel.key))
    // Not yet unlocked: you can look, but not pick
    const ok = owned('trainer', sel.key)
    hero.classList.toggle('locked', !ok)
    const cta = el.querySelector('.cta') as HTMLButtonElement
    cta.disabled = !ok
    cta.innerHTML = ok ? L('Next ▶', 'Verder ▶') : L(`🔒 Unlocks at trainer level ${unlockLevel('trainer', sel.key)}`, `🔒 Vrij bij trainerlevel ${unlockLevel('trainer', sel.key)}`)
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
    if (!owned('trainer', sel.key)) return
    sfx.select()
    onPick(sel)
  })
  paint(true)
}

// ---------------- Partner Pokémon ----------------

export function showRoster(initial: number[], onBack: () => void, onGo: (team: number[]) => void, cta = L('Start the battle ▶', 'Start de battle ▶')) {
  const el = screen()
  let pick = initial.find((id) => ALL_PARTNERS.includes(id) && owned('partner', id)) ?? ALL_PARTNERS[0]
  el.innerHTML = shell(L('STEP 2 / 2', 'STAP 2 / 2'), L('Pick your partner', 'Kies je partner'), `
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
      <div class="mf-row" role="group" aria-label="${L('Role', 'Rol')}">
        <button class="mf on" data-role="all">${L('All', 'Alle')}</button>
        ${(Object.keys(ROLES) as Role[]).map((r) => `<button class="mf" data-role="${r}" style="--rc:${ROLES[r].color}"><i>${ROLES[r].icon}</i>${ROLES[r].name}</button>`).join('')}
      </div>
      <div class="mf-row" role="group" aria-label="${L('Attack style', 'Aanvalsstijl')}">
        <button class="mf on" data-style="all">${L('All styles', 'Alle stijlen')}</button>
        <button class="mf" data-style="melee">Melee</button>
        <button class="mf" data-style="ranged">Ranged</button>
        <span class="mf-count"></span>
      </div>
    </div>
    <div class="mon-grid">
      ${[...ALL_PARTNERS].sort((a, b) => Number(owned('partner', b)) - Number(owned('partner', a)) || unlockLevel('partner', a) - unlockLevel('partner', b)).map((id) => {
        const r = ROLES[roleOf(id)]
        return `<button class="tile ${owned('partner', id) ? '' : 'locked'}" data-id="${id}" data-role="${roleOf(id)}" data-style="${styleOf(id)}" style="--tc:${TYPE_COLOR[SPECIES[id].types[0]]};--rc:${r.color}"><i class="rl" title="${r.name}">${r.icon}</i><img class="px" src="${spriteUrl(id)}" alt=""><span>${SPECIES[id].name}</span>${lockChip('partner', id)}</button>`
      }).join('')}
      <div class="mf-empty hidden">${L('No partners match these filters', 'Geen partners met deze filters')}</div>
    </div>
    <div class="sel-note">${L(`You start with 1 partner. Catch ${PARTY_MAX - TEAM_SIZE} more out in the world.`, `Je start met 1 partner. In de wereld vang je er nog ${PARTY_MAX - TEAM_SIZE} bij.`)}</div>`, cta)

  const hero = el.querySelector('.hero') as HTMLElement
  ;(el.querySelector('.cta') as HTMLElement).dataset.label = cta
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
    el.querySelector('.moves2')!.innerHTML = movesetFor(sp.types, sp.id)
      .map((m, i) => `<div class="mv2 ${m.sig ? 'sig' : ''}" style="--tc:${m.sig && m.elite ? m.elite : TYPE_COLOR[m.type]}"><span>${m.sig ? '★ ' : ''}${m.name}</span><small>${m.sig ? L('Signature · ', 'Signature · ') : ''}${i === 0 ? 'Start' : `Lv ${SLOT_UNLOCK[i]}`}</small></div>`)
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
    el.querySelector('.evo')!.innerHTML = line.length > 1 ? line.join('')
      : AWAKENS[sp.id] ? `<span class="arrow awaken">✨ ${L('Awakens: starts weaker, grows into its full power with level', 'Ontwaakt: begint zwakker, groeit met elk level naar zijn volle kracht')}</span>`
      : `<span class="arrow">${L('Doesn\'t evolve', 'Evolueert niet')}</span>`
    el.querySelectorAll<HTMLElement>('.tile').forEach((b) => b.classList.toggle('on', Number(b.dataset.id) === pick))
    const ok = owned('partner', pick)
    hero.classList.toggle('locked', !ok)
    const cta = el.querySelector('.cta') as HTMLButtonElement
    cta.disabled = !ok
    cta.innerHTML = ok ? cta.dataset.label! : L(`🔒 Unlocks at trainer level ${unlockLevel('partner', pick)}`, `🔒 Vrij bij trainerlevel ${unlockLevel('partner', pick)}`)
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
    el.querySelector('.mf-count')!.textContent = L(`${n} of ${ALL_PARTNERS.length}`, `${n} van ${ALL_PARTNERS.length}`)
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
    if (!owned('partner', pick)) return
    sfx.select()
    cry(pick, 0.3)
    onGo([pick])
  })
  paint(true)
}
