import { SLOT_UNLOCK } from '../data/moves'
import { animatedUrl, spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { TYPE_COLOR, TYPE_NL } from '../data/types'
import { isMuted, setMuted, sfx } from '../audio'
import { xpNeeded } from '../game/entities'
import { INTRO_TIME, type Banner, type Game } from '../game/game'
import { itemUrl } from '../game/sprites'
import { MAP } from '../game/world'

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html) el.innerHTML = html
  return el
}

const BANNER_LIFE: Record<Banner['kind'], number> = {
  go: 1100, levelup: 1600, move: 2600, legendary: 3200, ko: 2200, caught: 2200, storm: 2600, win: 3000, fainted: 2000,
}

export class Hud {
  private card = h('div', 'hcard')
  private portrait = h('img', 'px') as HTMLImageElement
  private portraitId = -1
  private monName = h('b')
  private monLv = h('span', 'lv')
  private types = h('span', 'types')
  private hpFill = h('i', 'fill')
  private hpLag = h('i', 'lag')
  private hpNums = h('span', 'nums')
  private xpFill = h('i')
  private lagK = 1
  private lastK = 1
  private party = h('div', 'hparty')
  private partyKey = ''
  private mini = h('canvas', 'minimap') as HTMLCanvasElement
  private aliveChip = h('div', 'chip alive')
  private stormChip = h('div', 'chip storm')
  private feedEl = h('div', 'feed')
  private toastEl = h('div', 'toast')
  private bannerEl = h('div', 'banners')
  private moveBtns: HTMLDivElement[] = []
  private moveKey = ''
  private readyState = [true, true, true, true]
  private itemBtns: Record<string, HTMLDivElement> = {}
  private catchBtn = h('button', 'catch2 hidden', '<span>VANG!</span><kbd>Spatie</kbd>')
  private knob = h('div', 'stick-knob')
  private base = h('div', 'stick-base hidden')
  private vLow = h('div', 'vign low')
  private vStorm = h('div', 'vign storm', '<span>BUITEN DE ZONE!</span>')
  private countdown = h('div', 'countdown')
  private hideBadge = h('div', 'hidebadge', '<i class="eye"></i><span>Verborgen</span>')
  private cdShown = ''

  constructor(private root: HTMLElement, private g: Game, onMenu: () => void) {
    root.innerHTML = ''
    root.classList.remove('hidden')
    root.classList.add('intro-mode')

    root.append(this.vLow, this.vStorm)

    // Joystick
    const zone = h('div', 'stick-zone')
    this.base.innerHTML = '<em class="n"></em><em class="e"></em><em class="s"></em><em class="w"></em>'
    this.base.append(this.knob)
    zone.append(this.base)
    this.bindStick(zone)
    root.append(zone)

    // Battle card (BW battle box, upgraded)
    const pf = h('div', 'hc-portrait')
    pf.append(this.portrait)
    const main = h('div', 'hc-main')
    const top = h('div', 'hc-top')
    top.append(this.monName, this.monLv)
    const hp = h('div', 'hc-hp', '<span>HP</span>')
    const bar = h('div', 'bar')
    bar.append(this.hpLag, this.hpFill)
    hp.append(bar)
    const bottom = h('div', 'hc-bottom')
    bottom.append(this.types, this.hpNums)
    const xp = h('div', 'hc-xp')
    xp.append(this.xpFill)
    main.append(top, hp, bottom, xp)
    this.card.append(pf, main)
    root.append(this.card, this.party, this.hideBadge)

    // Top right: map, chips, feed
    const tr = h('div', 'topright')
    const frame = h('div', 'mapframe')
    this.mini.width = MAP * 2
    this.mini.height = MAP * 2
    frame.append(this.mini, h('span', 'maplabel', 'UNOVA'))
    const chips = h('div', 'chips')
    chips.append(this.aliveChip, this.stormChip)
    tr.append(frame, chips, this.feedEl)
    root.append(tr)

    const sys = h('div', 'sysbtns')
    const mute = h('button', 'sysbtn', isMuted() ? '🔇' : '🔊')
    mute.onclick = () => {
      setMuted(!isMuted())
      mute.innerHTML = isMuted() ? '🔇' : '🔊'
    }
    const menu = h('button', 'sysbtn', '❚❚')
    menu.setAttribute('aria-label', 'Pauze')
    menu.onclick = onMenu
    sys.append(menu, mute)
    root.append(sys, this.toastEl, this.bannerEl)

    // Items
    const items = h('div', 'items2')
    for (const [key, sprite, label] of [['master', 'master-ball', 'Master'], ['potion', 'potion', 'Potion'], ['revive', 'revive', 'Revive']] as const) {
      const kb = { master: '1', potion: '2', revive: '3' }[key]
      const b = h('div', `ib ${key}`, `<img class="px" src="${itemUrl(sprite)}" alt="${label}"><b>0</b><kbd>${kb}</kbd>`) as HTMLDivElement
      b.onpointerdown = (e) => {
        e.preventDefault()
        this.useItem(key)
      }
      this.itemBtns[key] = b
      items.append(b)
    }
    root.append(items)

    // Moves
    const moves = h('div', 'moves3')
    for (let s = 0; s < 4; s++) {
      const b = h('div', `mb s${s}`) as HTMLDivElement
      this.bindAimButton(b, s)
      this.moveBtns.push(b)
      moves.append(b)
    }
    root.append(moves)

    this.catchBtn.onpointerdown = (e) => {
      e.preventDefault()
      const w = this.g.catchable(this.g.player)
      if (w) this.g.throwBall(this.g.player, w, false)
    }
    root.append(this.catchBtn, this.countdown)
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

  /**
   * Brawl Stars-style attack button: tap = auto-aim, hold = keep auto-firing,
   * drag = aim yourself (preview in the world), release to fire, drag back to cancel.
   */
  private bindAimButton(b: HTMLDivElement, slot: number) {
    const DEAD = 18, MAXD = 64
    let id = -1, cx = 0, cy = 0, dx = 0, dy = 0, aiming = false, autoFired = false
    let holdTimer: number | undefined
    const g = this.g
    const knob = () => b.querySelector('.aimknob') as HTMLElement | null
    const reset = () => {
      clearTimeout(holdTimer)
      id = -1
      aiming = false
      g.held[slot] = false
      g.aimPreview = null
      b.classList.remove('pressed', 'aiming')
      const k = knob()
      if (k) k.style.transform = ''
    }
    b.onpointerdown = (e) => {
      e.preventDefault()
      if (id !== -1) return
      id = e.pointerId
      try {
        b.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic events */
      }
      const r = b.getBoundingClientRect()
      cx = r.left + r.width / 2
      cy = r.top + r.height / 2
      dx = dy = 0
      aiming = false
      autoFired = false
      b.classList.add('pressed')
      // Holding still = keep auto-firing (great for the basic attack)
      holdTimer = window.setTimeout(() => {
        if (!aiming && id !== -1) {
          g.held[slot] = true
          autoFired = true
        }
      }, 220)
    }
    b.onpointermove = (e) => {
      if (e.pointerId !== id) return
      dx = e.clientX - cx
      dy = e.clientY - cy
      let d = Math.hypot(dx, dy)
      if (d > DEAD && !aiming) {
        aiming = true
        clearTimeout(holdTimer)
        g.held[slot] = false
        b.classList.add('aiming')
      }
      if (!aiming) return
      if (d > MAXD) {
        dx = (dx / d) * MAXD
        dy = (dy / d) * MAXD
        d = MAXD
      }
      const k = knob()
      if (k) k.style.transform = `translate(${dx}px, ${dy}px)`
      g.aimPreview = d > DEAD ? { slot, x: dx / d, y: dy / d, k: Math.min(1, d / MAXD) } : null
    }
    b.onpointerup = (e) => {
      if (e.pointerId !== id) return
      const d = Math.hypot(dx, dy)
      const p = g.player
      const ok = p.alive && !g.paused && g.introT <= 0
      if (ok && aiming && d > DEAD) g.useMove(p.mon, slot, undefined, { x: dx / d, y: dy / d, k: Math.min(1, d / MAXD) })
      else if (ok && !aiming && !autoFired) g.useMove(p.mon, slot)
      reset()
    }
    b.onpointercancel = reset
  }

  private bindStick(zone: HTMLElement) {
    let id = -1, ox = 0, oy = 0
    const R = 52
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
    if (color) d.style.setProperty('--c', color)
    this.toastEl.append(d)
    while (this.toastEl.children.length > 2) this.toastEl.firstChild!.remove()
    setTimeout(() => d.remove(), 2700)
  }

  feed(text: string, icon?: { mon?: number; trainer?: string }) {
    const d = h('div')
    if (icon?.mon) d.innerHTML = `<img class="px" src="${spriteUrl(icon.mon)}" alt="">`
    else if (icon?.trainer) d.innerHTML = `<img class="px tr" src="${trainerSpriteUrl(icon.trainer)}" alt="">`
    d.append(document.createTextNode(text))
    this.feedEl.append(d)
    while (this.feedEl.children.length > 4) this.feedEl.firstChild!.remove()
    setTimeout(() => d.remove(), 6200)
  }

  /** Big centre-screen moments: GO!, level ups, new moves, legendaries, KOs. */
  banner(b: Banner) {
    if (b.kind === 'go') {
      this.root.classList.remove('intro-mode')
      this.countdown.className = 'countdown go'
      this.countdown.innerHTML = '<b>GO!</b>'
      sfx.countdown(true)
      setTimeout(() => (this.countdown.className = 'countdown hidden'), 900)
      return
    }
    const el = h('div', `bn ${b.kind}`)
    if (b.color) el.style.setProperty('--c', b.color)
    let art = ''
    if (b.mon) art = `<img class="px art" src="${animatedUrl(b.mon)}" onerror="this.onerror=null;this.src='${spriteUrl(b.mon, { shiny: b.shiny })}'" alt="">`
    else if (b.trainer) art = `<img class="px art tr" src="${trainerSpriteUrl(b.trainer)}" alt="">`
    const kicker: Partial<Record<Banner['kind'], string>> = {
      levelup: 'LEVEL UP', move: 'NIEUWE AANVAL', legendary: '★ LEGENDARISCH ★', ko: 'K.O.', caught: 'POKÉ BALL', storm: 'WAARSCHUWING', fainted: 'OEPS', win: 'BATTLE ROYALE',
    }
    el.innerHTML = `${art}<div class="txt"><small>${kicker[b.kind] ?? ''}</small><b>${b.title}</b>${b.sub ? `<span>${b.sub}</span>` : ''}</div>`
    // Only one big banner at a time; small ones stack
    const big = b.kind === 'legendary' || b.kind === 'win' || b.kind === 'storm'
    if (big) this.bannerEl.querySelectorAll('.bn').forEach((x) => x.remove())
    this.bannerEl.append(el)
    while (this.bannerEl.children.length > 2) this.bannerEl.firstChild!.remove()
    if (b.kind !== 'fainted') sfx.banner()
    setTimeout(() => el.classList.add('out'), BANNER_LIFE[b.kind] - 350)
    setTimeout(() => el.remove(), BANNER_LIFE[b.kind])
  }

  update() {
    const g = this.g, p = g.player
    const m = p.mon

    // Countdown
    if (g.introT > 0) {
      const t = g.introT
      const label = t > INTRO_TIME - 1.6 ? 'title' : String(Math.ceil(t / ((INTRO_TIME - 1.6) / 3)))
      if (label !== this.cdShown) {
        this.cdShown = label
        if (label === 'title') this.countdown.innerHTML = `<div class="cd-title"><small>${g.total} TRAINERS · 1 WINNAAR</small><b>BATTLE ROYALE</b></div>`
        else {
          this.countdown.innerHTML = `<b class="num">${label}</b>`
          sfx.countdown(false)
        }
        this.countdown.className = `countdown ${label === 'title' ? 'tt' : 'n'}`
      }
    }

    // Battle card
    if (this.portraitId !== m.species.id * 2 + (m.shiny ? 1 : 0)) {
      this.portraitId = m.species.id * 2 + (m.shiny ? 1 : 0)
      this.portrait.src = spriteUrl(m.species.id, { shiny: m.shiny })
      this.types.innerHTML = m.species.types.map((t) => `<em style="background:${TYPE_COLOR[t]}">${TYPE_NL[t]}</em>`).join('')
      this.card.classList.remove('swap')
      void this.card.offsetWidth
      this.card.classList.add('swap')
    }
    this.monName.textContent = `${m.shiny ? '✦' : ''}${m.name}`
    this.monLv.textContent = `Lv${m.level}`
    const k = Math.max(0, m.hp / m.maxHp)
    if (k < this.lastK - 0.001) this.card.classList.add('hurt')
    else this.card.classList.remove('hurt')
    this.lastK = k
    // The red "damage taken" bar trails behind the real one
    this.lagK = k > this.lagK ? k : this.lagK + (k - this.lagK) * 0.06
    this.hpFill.style.width = `${k * 100}%`
    this.hpLag.style.width = `${this.lagK * 100}%`
    this.hpFill.style.background = k > 0.5 ? 'var(--hp-green)' : k > 0.2 ? 'var(--hp-yellow)' : 'var(--hp-red)'
    this.hpNums.textContent = `${Math.ceil(m.hp)} / ${Math.round(m.maxHp)}`
    this.xpFill.style.width = `${(m.xp / xpNeeded(m.level)) * 100}%`

    // Party badges
    const key = p.party.map((x) => `${x.id}:${x.species.id}`).join(',')
    if (key !== this.partyKey) {
      this.partyKey = key
      this.party.innerHTML = ''
      p.party.forEach((pm, i) => {
        const s = h('div', 'pb', `<img class="px" src="${spriteUrl(pm.species.id, { shiny: pm.shiny })}" alt=""><span class="lv"></span>`)
        s.onpointerdown = (e) => {
          e.preventDefault()
          g.switchTo(p, i)
        }
        this.party.append(s)
      })
      for (let i = p.party.length; i < 3; i++) this.party.append(h('div', 'pb empty', '<span class="plus">+</span>'))
    }
    p.party.forEach((pm, i) => {
      const s = this.party.children[i] as HTMLElement
      if (!s) return
      s.classList.toggle('active', i === p.active)
      s.classList.toggle('faint', pm.fainted)
      const hk = Math.max(0, pm.hp / pm.maxHp)
      s.style.setProperty('--hp', `${hk * 360}deg`)
      s.style.setProperty('--hc', hk > 0.5 ? '#40d860' : hk > 0.2 ? '#f8c020' : '#f84030')
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
        b.style.setProperty('--tc', TYPE_COLOR[mv.type])
        b.innerHTML = `<div class="ring"></div><div class="cd"></div><div class="lbl">${locked ? `<span class="lock">🔒</span><small>Lv ${SLOT_UNLOCK[s]}</small>` : `<span>${mv.name}</span><small>${TYPE_NL[mv.type]}</small>`}</div><div class="secs"></div><div class="aimknob"></div><kbd>${['Klik', 'Q', 'E', 'R'][s]}</kbd>`
      })
    }
    m.moves.forEach((mv, s) => {
      const b = this.moveBtns[s]
      const cd = b.children[1] as HTMLElement
      const secs = b.children[3] as HTMLElement
      const f = m.cds[s] / mv.cooldown
      cd.style.background = f > 0 ? `conic-gradient(rgba(8,10,22,.72) ${f * 360}deg, transparent 0)` : ''
      secs.textContent = f > 0 && m.cds[s] > 0.9 ? `${Math.ceil(m.cds[s])}` : ''
      const ready = f <= 0 && m.unlocked(s)
      if (ready && !this.readyState[s]) {
        b.classList.remove('ping')
        void b.offsetWidth
        b.classList.add('ping')
      }
      this.readyState[s] = ready
      b.classList.toggle('ready', ready)
    })

    // Items
    const counts = { master: p.masterBalls, potion: p.potions, revive: p.revives }
    for (const [key2, n] of Object.entries(counts)) {
      const b = this.itemBtns[key2]
      b.classList.toggle('empty', n <= 0)
      b.querySelector('b')!.textContent = `${n}`
    }

    this.catchBtn.classList.toggle('hidden', !p.alive || !g.catchable(p))

    const inGrass = p.alive && g.introT <= 0 && g.world.isTall(p.x, p.y)
    const seen = inGrass && !g.hidden(p)
    this.hideBadge.classList.toggle('on', inGrass)
    this.hideBadge.classList.toggle('seen', seen)
    const label = seen ? 'Gezien!' : 'Verborgen'
    const span = this.hideBadge.querySelector('span')!
    if (span.textContent !== label) span.textContent = label
    this.card.classList.toggle('regen', g.regenerating(m))

    // Vignettes
    this.vLow.classList.toggle('on', p.alive && !m.fainted && k < 0.25)
    this.vStorm.classList.toggle('on', p.alive && g.introT <= 0 && g.zone.outside(p.x, p.y))

    // Chips
    this.aliveChip.innerHTML = `<i>👤</i>${g.alive.length}`
    const z = g.zone
    const t = Math.max(0, Math.ceil(z.timeLeft))
    const mm = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
    this.stormChip.innerHTML = z.phase >= 6 ? '<i>⚡</i>FINALE' : `<i>${z.shrinking ? '⚡' : '⏱'}</i>${mm}`
    this.stormChip.classList.toggle('closing', z.shrinking)

    this.drawMini()
  }

  private drawMini() {
    const g = this.g
    const c = this.mini.getContext('2d')!
    const s = 2
    c.imageSmoothingEnabled = false
    c.drawImage(g.world.mini, 0, 0, MAP * s, MAP * s)
    const z = g.zone
    c.fillStyle = 'rgba(110,50,190,0.5)'
    c.beginPath()
    c.rect(0, 0, MAP * s, MAP * s)
    c.arc(z.x * s, z.y * s, Math.max(0.01, z.r * s), 0, Math.PI * 2, true)
    c.fill('evenodd')
    c.strokeStyle = '#e0b0ff'
    c.lineWidth = 2
    c.beginPath()
    c.arc(z.x * s, z.y * s, Math.max(0.01, z.r * s), 0, Math.PI * 2)
    c.stroke()
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
        c.beginPath()
        c.arc(w.x * s, w.y * s, 5, 0, Math.PI * 2)
        c.fill()
      }
    const p = g.player
    if (p.alive) {
      // Player arrow pointing the way you walk
      const a = Math.atan2(p.vy || 0.0001, p.vx || 0) || 0
      c.save()
      c.translate(p.x * s, p.y * s)
      c.rotate(Math.hypot(p.vx, p.vy) > 0.1 ? a + Math.PI / 2 : 0)
      c.fillStyle = '#f84040'
      c.strokeStyle = '#ffffff'
      c.lineWidth = 2
      c.beginPath()
      c.moveTo(0, -8)
      c.lineTo(6, 6)
      c.lineTo(0, 3)
      c.lineTo(-6, 6)
      c.closePath()
      c.fill()
      c.stroke()
      c.restore()
    }
  }

  destroy() {
    this.root.innerHTML = ''
    this.root.classList.add('hidden')
    this.root.classList.remove('intro-mode')
  }
}
