import { movesetFor, SLOT_UNLOCK } from '../data/moves'
import { animatedUrl, ROSTER, SPECIES, spriteUrl, TEAM_SIZE, type Species } from '../data/pokemon'
import { TRAINERS, trainerPortraitUrl, type TrainerDef } from '../data/trainers'
import { TYPE_COLOR, TYPE_NL } from '../data/types'
import { sfx, unlockAudio } from '../audio'
import type { GameResult } from '../game/game'
import type { Mon } from '../game/entities'

const screen = () => document.getElementById('screen')!

export function typeBadges(sp: Species) {
  return sp.types.map((t) => `<span class="type" style="background:${TYPE_COLOR[t]}">${TYPE_NL[t]}</span>`).join('')
}

/** Animated BW sprite with a static fallback. */
function animImg(id: number, cls = 'anim') {
  return `<img class="${cls}" src="${animatedUrl(id)}" onerror="this.onerror=null;this.src='${spriteUrl(id)}';this.className='px'" alt="">`
}

export function showTitle(onStart: () => void) {
  const el = screen()
  el.innerHTML = `
    <div class="title">
      <div class="legends">
        <img src="${animatedUrl(644)}" alt="Zekrom">
        <img src="${animatedUrl(643)}" alt="Reshiram">
      </div>
      <div class="logo">POKÉGIMMA</div>
      <div class="subtitle">BATTLE ROYALE</div>
      <div class="press">Tik om te starten</div>
    </div>`
  el.querySelector('.title')!.addEventListener('click', () => {
    unlockAudio()
    sfx.select()
    onStart()
  }, { once: true })
}

export function showTrainerSelect(current: string | null, onPick: (t: TrainerDef) => void) {
  const el = screen()
  let sel = TRAINERS.find((t) => t.key === current) ?? TRAINERS[0]
  el.innerHTML = `
    <div class="menu">
      <h1>Kies je trainer</h1>
      <div class="hint">Met wie stap jij de arena in?</div>
      <div class="grid trainers">
        ${TRAINERS.map((t) => `
          <div class="panel card" data-k="${t.key}">
            <div class="art"><img class="px" src="${trainerPortraitUrl(t.key)}" alt=""></div>
            <div class="name">${t.name}</div>
          </div>`).join('')}
      </div>
      <div class="bottombar">
        <div style="color:#fff;font-weight:700" id="tname"></div>
        <button class="btn" id="next">Volgende ▶</button>
      </div>
    </div>`
  const paint = () => {
    el.querySelectorAll<HTMLElement>('.card').forEach((c) => c.classList.toggle('sel', c.dataset.k === sel.key))
    el.querySelector('#tname')!.textContent = sel.name
  }
  el.querySelectorAll<HTMLElement>('.card').forEach((c) =>
    c.addEventListener('click', () => {
      sel = TRAINERS.find((t) => t.key === c.dataset.k)!
      sfx.select()
      paint()
    }),
  )
  el.querySelector('#next')!.addEventListener('click', () => {
    sfx.select()
    onPick(sel)
  })
  paint()
}

export function showRoster(initial: number[], onBack: () => void, onGo: (team: number[]) => void) {
  const el = screen()
  const team = initial.filter((id) => ROSTER.includes(id)).slice(0, TEAM_SIZE)
  let focus = team[0] ?? ROSTER[0]
  el.innerHTML = `
    <div class="menu">
      <h1>Kies ${TEAM_SIZE} Pokémon</h1>
      <div class="hint">Ze levelen en evolueren hoe langer je overleeft. In de wereld kun je er meer vangen.</div>
      <div class="grid roster">
        ${ROSTER.map((id) => {
          const sp = SPECIES[id]
          return `
          <div class="panel card" data-id="${id}">
            <div class="art">${animImg(id)}</div>
            <div class="name">${sp.name}</div>
            <div class="types">${typeBadges(sp)}</div>
          </div>`
        }).join('')}
      </div>
      <div class="panel detail" id="detail"></div>
      <div class="bottombar">
        <button class="btn ghost" id="back">◀</button>
        <div class="team" id="team"></div>
        <button class="btn red" id="go">Start!</button>
      </div>
    </div>`

  const paint = () => {
    el.querySelectorAll<HTMLElement>('.card').forEach((c) => {
      const id = Number(c.dataset.id)
      const i = team.indexOf(id)
      c.classList.toggle('sel', i >= 0)
      c.querySelector('.badge')?.remove()
      if (i >= 0) c.insertAdjacentHTML('beforeend', `<div class="badge">${i + 1}</div>`)
    })
    el.querySelector('#team')!.innerHTML = Array.from({ length: TEAM_SIZE }, (_, i) =>
      team[i] ? `<div class="slot on"><img src="${spriteUrl(team[i])}" alt=""></div>` : `<div class="slot"></div>`,
    ).join('')
    ;(el.querySelector('#go') as HTMLButtonElement).disabled = team.length !== TEAM_SIZE
    detail(focus)
  }

  const detail = (id: number) => {
    const sp = SPECIES[id]
    const moves = movesetFor(sp.types)
    const chain: string[] = []
    let cur: Species | undefined = sp
    while (cur?.evo) {
      const nexts: string = cur.evo.map((e) => SPECIES[e].name).join(' / ')
      chain.push(`Lv ${cur.evoLevel}: ${nexts}`)
      cur = cur.evo.length === 1 ? SPECIES[cur.evo[0]] : undefined
    }
    const bar = (label: string, v: number) => `<span>${label}</span><i style="width:${Math.min(100, (v / 120) * 100)}%"></i>`
    el.querySelector('#detail')!.innerHTML = `
      <div class="row"><b style="font-size:18px">${sp.name}</b> ${typeBadges(sp)}</div>
      ${chain.length ? `<div style="margin-top:4px;color:var(--ink-soft)">Evolueert → ${chain.join(' → ')}</div>` : ''}
      <div class="stat">${bar('HP', sp.hp)}${bar('ATK', sp.atk)}${bar('DEF', sp.def)}${bar('SPE', sp.spe)}</div>
      <div class="movelist">${moves.map((m, i) => `<div class="mv"><span style="color:${TYPE_COLOR[m.type]};font-weight:700">${m.name}</span><span>Lv ${SLOT_UNLOCK[i]}</span></div>`).join('')}</div>`
  }

  el.querySelectorAll<HTMLElement>('.card').forEach((c) =>
    c.addEventListener('click', () => {
      const id = Number(c.dataset.id)
      focus = id
      const i = team.indexOf(id)
      if (i >= 0) team.splice(i, 1)
      else if (team.length < TEAM_SIZE) team.push(id)
      else team[TEAM_SIZE - 1] = id
      sfx.select()
      paint()
    }),
  )
  el.querySelector('#back')!.addEventListener('click', onBack)
  el.querySelector('#go')!.addEventListener('click', () => {
    if (team.length === TEAM_SIZE) onGo([...team])
  })
  paint()
}

export function showPartyFull(mon: Mon, party: Mon[], choose: (idx: number) => void) {
  const modal = document.getElementById('modal')!
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel">
      <h2>Je team is vol!</h2>
      <p>Wie ruil je in voor <b>${mon.name}</b> (Lv ${mon.level})?</p>
      <div class="choice">
        ${party.map((m, i) => `<button data-i="${i}"><img src="${spriteUrl(m.species.id, { shiny: m.shiny })}" alt="">${m.name}<br>Lv ${m.level}</button>`).join('')}
      </div>
      <button class="btn ghost" data-i="-1">Laat ${mon.name} gaan</button>
    </div>`
  modal.querySelectorAll<HTMLElement>('[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      modal.classList.add('hidden')
      modal.innerHTML = ''
      choose(Number(b.dataset.i))
    }),
  )
}

export function showResults(r: GameResult, onAgain: () => void, onMenu: () => void) {
  const el = screen()
  const mins = Math.floor(r.time / 60)
  const secs = Math.floor(r.time % 60).toString().padStart(2, '0')
  el.innerHTML = `
    <div class="results">
      <div class="panel">
        <div class="place ${r.won ? 'won' : ''}">${r.won ? 'WINNAAR!' : `#${r.place}`}</div>
        <div>${r.won ? `Laatste trainer van de ${r.total}` : `van de ${r.total} trainers`}</div>
        <div class="best">${animImg(r.best.species.id, 'px')}<div><b>${r.best.name}</b> Lv ${r.best.level}</div></div>
        <dl>
          <dt>Overleefd</dt><dd>${mins}:${secs}</dd>
          <dt>Trainers uitgeschakeld</dt><dd>${r.kos}</dd>
          <dt>Pokémon gevangen</dt><dd>${r.caught}</dd>
        </dl>
        <div class="actions">
          <button class="btn red" id="again">Nog een keer</button>
          <button class="btn ghost" id="menu">Team wijzigen</button>
        </div>
      </div>
    </div>`
  el.querySelector('#again')!.addEventListener('click', onAgain)
  el.querySelector('#menu')!.addEventListener('click', onMenu)
}

export function clearScreen() {
  screen().innerHTML = ''
}
