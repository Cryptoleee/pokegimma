import { SLOT_UNLOCK } from '../data/moves'
import { spriteUrl } from '../data/pokemon'
import { TYPE_COLOR } from '../data/types'
import { isMuted, setMuted } from '../audio'
import { xpNeeded } from '../game/entities'
import type { Game } from '../game/game'
import { itemUrl } from '../game/sprites'
import { MAP } from '../game/world'

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html) el.innerHTML = html
  return el
}

export class Hud {
  private monName = h('span')
  private monLv = h('span')
  private hpFill = h('div', 'fill')
  private hpNums = h('div', 'nums')
  private xpFill = h('div')
  private party = h('div', 'party')
  private partyKey = ''
  private mini = h('canvas', 'minimap') as HTMLCanvasElement
  private aliveChip = h('div', 'chip')
  private stormChip = h('div', 'chip storm')
  private feedEl = h('div', 'feed')
  private toastEl = h('div', 'toast')
  private moveBtns: HTMLDivElement[] = []
  private moveKey = ''
  private itemBtns: Record<string, HTMLDivElement> = {}
  private catchBtn = h('button', 'btn red catch-btn hidden', 'VANG!')
  private knob = h('div', 'stick-knob')
  private base = h('div', 'stick-base hidden')

  constructor(private root: HTMLElement, private g: Game) {
    root.innerHTML = ''
    root.classList.remove('hidden')

    // Joystick
    const zone = h('div', 'stick-zone')
    this.base.append(this.knob)
    zone.append(this.base)
    this.bindStick(zone)
    root.append(zone)

    // Active Pokémon box (BW battle style)
    const box = h('div', 'panel mon-box')
    const top = h('div', 'top')
    top.append(this.monName, this.monLv)
    const hp = h('div', 'hpbar', '<b>HP</b>')
    const track = h('div', 'track')
    track.append(this.hpFill)
    hp.append(track)
    const xp = h('div', 'xpbar')
    xp.append(this.xpFill)
    box.append(top, hp, this.hpNums, xp)
    root.append(box, this.party)

    // Top right
    const tr = h('div', 'topright')
    this.mini.width = MAP * 2
    this.mini.height = MAP * 2
    const chips = h('div', 'chips')
    chips.append(this.aliveChip, this.stormChip)
    tr.append(this.mini, chips, this.feedEl)
    root.append(tr)

    const mute = h('button', 'mute', isMuted() ? '🔇' : '🔊')
    mute.onclick = () => {
      setMuted(!isMuted())
      mute.innerHTML = isMuted() ? '🔇' : '🔊'
    }
    root.append(mute, this.toastEl)

    // Items
    const items = h('div', 'items')
    for (const [key, sprite] of [['master', 'master-ball'], ['potion', 'potion'], ['revive', 'revive']] as const) {
      const b = h('div', 'ibtn', `<img src="${itemUrl(sprite)}" alt="${key}"><b>0</b>`) as HTMLDivElement
      b.onpointerdown = (e) => {
        e.preventDefault()
        this.useItem(key)
      }
      this.itemBtns[key] = b
      items.append(b)
    }
    root.append(items)

    // Moves
    const moves = h('div', 'moves')
    for (let s = 0; s < 4; s++) {
      const b = h('div', `mbtn s${s}`) as HTMLDivElement
      b.onpointerdown = (e) => {
        e.preventDefault()
        try {
          b.setPointerCapture(e.pointerId)
        } catch {
          /* synthetic events */
        }
        this.g.held[s] = true
        b.classList.add('pressed')
      }
      const up = () => {
        this.g.held[s] = false
        b.classList.remove('pressed')
      }
      b.onpointerup = up
      b.onpointercancel = up
      this.moveBtns.push(b)
      moves.append(b)
    }
    root.append(moves)

    this.catchBtn.onpointerdown = (e) => {
      e.preventDefault()
      const w = this.g.catchable(this.g.player)
      if (w) this.g.throwBall(this.g.player, w, false)
    }
    root.append(this.catchBtn)
  }

  useItem(key: 'master' | 'potion' | 'revive') {
    const g = this.g, p = g.player
    if (!p.alive) return
    if (key === 'master') {
      if (p.masterBalls <= 0) return this.toast('Je hebt geen Master Ball')
      const t = g.masterTarget(p)
      if (!t) return this.toast('Geen wilde Pokémon dichtbij')
      g.throwBall(p, t, true)
    } else if (key === 'potion') {
      if (p.potions <= 0) return this.toast('Geen Potions')
      if (!g.usePotion(p)) this.toast('Je Pokémon is al fit')
    } else {
      if (p.revives <= 0) return this.toast('Geen Revives')
      if (!g.useRevive(p)) this.toast('Niemand is verslagen')
    }
  }

  private bindStick(zone: HTMLElement) {
    let id = -1, ox = 0, oy = 0
    const R = 50
    zone.onpointerdown = (e) => {
      if (id !== -1) return
      id = e.pointerId
      try {
        zone.setPointerCapture(id)
      } catch {
        /* synthetic events */
      }
      const r = zone.getBoundingClientRect()
      ox = e.clientX - r.left
      oy = e.clientY - r.top
      this.base.style.left = `${ox}px`
      this.base.style.top = `${oy}px`
      this.base.classList.remove('hidden')
      this.knob.style.transform = ''
    }
    zone.onpointermove = (e) => {
      if (e.pointerId !== id) return
      const r = zone.getBoundingClientRect()
      let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy
      const d = Math.hypot(dx, dy)
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`
      // Reach full speed at ~70% of the stick radius.
      const k = d < 6 ? 0 : Math.min(1, d / (R * 0.7)) / Math.max(1, Math.min(d, R))
      this.g.input.mx = dx * k
      this.g.input.my = dy * k
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = -1
      this.g.input.mx = 0
      this.g.input.my = 0
      this.base.classList.add('hidden')
    }
    zone.onpointerup = end
    zone.onpointercancel = end
  }

  toast(text: string, color?: string) {
    const d = h('div')
    d.textContent = text
    if (color) d.style.boxShadow = `inset 0 0 0 2px ${color}, 0 3px 0 rgba(0,0,0,.35)`
    this.toastEl.append(d)
    while (this.toastEl.children.length > 3) this.toastEl.firstChild!.remove()
    setTimeout(() => d.remove(), 2700)
  }

  feed(text: string) {
    const d = h('div')
    d.textContent = text
    this.feedEl.append(d)
    while (this.feedEl.children.length > 4) this.feedEl.firstChild!.remove()
    setTimeout(() => d.remove(), 6200)
  }

  update() {
    const g = this.g, p = g.player
    const m = p.mon

    // Active box
    this.monName.textContent = `${m.shiny ? '✦' : ''}${m.name}`
    this.monLv.textContent = `Lv${m.level}`
    const k = Math.max(0, m.hp / m.maxHp)
    this.hpFill.style.width = `${k * 100}%`
    this.hpFill.style.background = k > 0.5 ? 'var(--hp-green)' : k > 0.2 ? 'var(--hp-yellow)' : 'var(--hp-red)'
    this.hpNums.textContent = `${Math.ceil(m.hp)}/${Math.round(m.maxHp)}`
    this.xpFill.style.width = `${(m.xp / xpNeeded(m.level)) * 100}%`

    // Party strip (rebuild only when composition changes)
    const key = p.party.map((x) => `${x.id}:${x.species.id}`).join(',')
    if (key !== this.partyKey) {
      this.partyKey = key
      this.party.innerHTML = ''
      p.party.forEach((pm, i) => {
        const s = h('div', 'pslot', `<span class="lv"></span><img src="${spriteUrl(pm.species.id, { shiny: pm.shiny })}" alt=""><div class="mini"><i></i></div>`)
        s.onpointerdown = (e) => {
          e.preventDefault()
          g.switchTo(p, i)
        }
        this.party.append(s)
      })
    }
    p.party.forEach((pm, i) => {
      const s = this.party.children[i] as HTMLElement
      if (!s) return
      s.classList.toggle('active', i === p.active)
      s.classList.toggle('faint', pm.fainted)
      ;(s.querySelector('.mini i') as HTMLElement).style.width = `${Math.max(0, pm.hp / pm.maxHp) * 100}%`
      ;(s.querySelector('.lv') as HTMLElement).textContent = `${pm.level}`
    })

    // Moves
    const mk = `${m.species.id}:${m.level}`
    if (mk !== this.moveKey) {
      this.moveKey = mk
      m.moves.forEach((mv, s) => {
        const b = this.moveBtns[s]
        const locked = !m.unlocked(s)
        b.classList.toggle('locked', locked)
        b.style.background = `radial-gradient(circle at 35% 30%, ${lighten(TYPE_COLOR[mv.type])}, ${TYPE_COLOR[mv.type]})`
        b.innerHTML = `<div class="cd"></div><span>${locked ? `🔒<br>Lv ${SLOT_UNLOCK[s]}` : mv.name}</span>`
      })
    }
    m.moves.forEach((mv, s) => {
      const cd = this.moveBtns[s].firstElementChild as HTMLElement
      const f = m.cds[s] / mv.cooldown
      cd.style.background = f > 0 ? `conic-gradient(rgba(20,20,30,.6) ${f * 360}deg, transparent 0)` : ''
    })

    // Items
    const counts = { master: p.masterBalls, potion: p.potions, revive: p.revives }
    for (const [key, n] of Object.entries(counts)) {
      const b = this.itemBtns[key]
      b.classList.toggle('empty', n <= 0)
      b.querySelector('b')!.textContent = `${n}`
    }

    this.catchBtn.classList.toggle('hidden', !p.alive || !g.catchable(p))

    // Chips
    this.aliveChip.textContent = `👤 ${g.alive.length}`
    const z = g.zone
    const t = Math.max(0, Math.ceil(z.timeLeft))
    this.stormChip.textContent = z.phase >= 6 ? 'Storm' : z.shrinking ? `⚡ ${t}s` : `⏱ ${t}s`

    this.drawMini()
  }

  private drawMini() {
    const g = this.g
    const c = this.mini.getContext('2d')!
    const s = 2
    c.imageSmoothingEnabled = false
    c.drawImage(g.world.mini, 0, 0, MAP * s, MAP * s)
    const z = g.zone
    c.fillStyle = 'rgba(110,50,190,0.45)'
    c.beginPath()
    c.rect(0, 0, MAP * s, MAP * s)
    c.arc(z.x * s, z.y * s, Math.max(0.01, z.r * s), 0, Math.PI * 2, true)
    c.fill('evenodd')
    if (z.nr > 0 && z.phase < 6) {
      c.strokeStyle = '#ffffff'
      c.lineWidth = 2
      c.setLineDash([5, 4])
      c.beginPath()
      c.arc(z.nx * s, z.ny * s, z.nr * s, 0, Math.PI * 2)
      c.stroke()
      c.setLineDash([])
    }
    const blink = Math.floor(performance.now() / 300) % 2 === 0
    for (const w of g.wilds)
      if (w.legendary) {
        c.fillStyle = blink ? '#ffd040' : '#282830'
        c.fillRect(w.x * s - 4, w.y * s - 4, 8, 8)
      }
    const p = g.player
    if (p.alive) {
      c.fillStyle = '#282830'
      c.fillRect(p.x * s - 5, p.y * s - 5, 10, 10)
      c.fillStyle = '#f84040'
      c.fillRect(p.x * s - 3, p.y * s - 3, 6, 6)
    }
  }

  destroy() {
    this.root.innerHTML = ''
    this.root.classList.add('hidden')
  }
}

function lighten(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, (n >> 16) + 60), g = Math.min(255, ((n >> 8) & 255) + 60), b = Math.min(255, (n & 255) + 60)
  return `rgb(${r},${g},${b})`
}
