import { SLOT_UNLOCK } from '../data/moves'
import { LiveBoard } from './scoreboard'
import { animatedUrl, spriteUrl } from '../data/pokemon'
import { trainerSpriteUrl } from '../data/trainers'
import { TYPE_COLOR, TYPE_NL } from '../data/types'
import { isMuted, setMuted, sfx } from '../audio'
import { say, type VoiceLine } from '../voice'
import { xpNeeded } from '../game/entities'
import { INTRO_TIME, type Banner, type FeedIcon, type Game } from '../game/game'
import { itemUrl } from '../game/sprites'
import { ARENA_C, MAP } from '../game/world'
import { dungeonOf, fightsIn } from '../data/dungeons'
import type { DungeonView } from '../game/dungeon'
import type { Mon } from '../game/entities'
import type { ChatLine } from '../net/protocol'
import { esc, QUICK_CHAT } from './menu'
import { BOSSES, RAID_LIVES } from '../data/bosses'
import { DUEL_WINS, ROUND_TIME } from '../game/duel'
import { L, tx, type Txt } from '../i18n'
import { keyName, keyOf } from '../keys'

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (html) el.innerHTML = html
  return el
}

const BANNER_LIFE: Record<Banner['kind'], number> = {
  go: 1100, levelup: 1600, move: 2600, legendary: 4200, ko: 2200, caught: 2200, storm: 2600, win: 3000, fainted: 2000,
}

export class Hud {
  private card = h('div', 'hcard')
  private portrait = h('img', 'px') as HTMLImageElement
  private portraitId = -1
  private monName = h('b')
  private monLv = h('span', 'lv')
  private xpFill = h('i')
  private lastK = 1
  private hurtUntil = 0
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
  /** Sound state: in the grass last frame, next heartbeat, respawn second shown, raid-timer warnings given. */
  private wasGrass = false
  private beatAt = 0
  private respawnSec = 0
  private timerWarned = new Set<number>()
  private itemBtns: Record<string, HTMLDivElement> = {}
  private catchBtn = h('button', 'catch2 hidden', `<span>${L('CATCH!', 'VANG!')}</span><kbd data-pad="B">${keyName(keyOf('catch'))}</kbd>`)
  private knob = h('div', 'stick-knob')
  private base = h('div', 'stick-base hidden')
  private vLow = h('div', 'vign low')
  private vStorm = h('div', 'vign storm', `<span>${L('OUTSIDE THE ZONE!', 'BUITEN DE ZONE!')}</span>`)
  private countdown = h('div', 'countdown')
  private hideBadge = h('div', 'hidebadge', `<i class="eye"></i><span>${L('Hidden', 'Verborgen')}</span>`)
  private cdShown = ''
  /** Legendary alert: where it is and how to get it. */
  private legend = h('div', 'legend hidden')
  /** When the legend/event pill last popped up big; after a few seconds it shrinks to a small tracker at the top. */
  private legendAt = 0
  private legendState = ''
  private legendId = -1
  private chat: ChatWidget | null = null
  /** Raid: boss bar, team lives and the respawn countdown. */
  private bossBar = h('div', 'bossbar hidden')
  private respawnEl = h('div', 'respawn hidden')
  private bossKey = ''
  /** 1 vs 1: score, both HP bars, ring timer and your power-ups. */
  private duelBar = h('div', 'duelbar hidden')
  private duelKey = ''
  private countSec = 0
  /** Resets for every touch control, so a lost touch can never leave one stuck. */
  private releasers: (() => void)[] = []

  /** Live scoreboard (🏆 button or Tab). */
  board: LiveBoard
  constructor(private root: HTMLElement, private g: Game, onMenu: () => void, opts: { chat?: (text: string) => void } = {}) {
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

    // Team capsule: one pill with the active Pokémon (HP as a ring around the
    // portrait, level underneath), its name and XP, then the rest of the team
    // (tap to switch). HP numbers live on the nameplate above the Pokémon
    // itself, types on the attack buttons.
    const pf = h('div', 'hc-portrait')
    const face = h('div', 'hc-face')
    face.append(this.portrait)
    pf.append(face, this.monLv)
    const main = h('div', 'hc-main')
    const xp = h('div', 'hc-xp')
    xp.append(this.xpFill)
    main.append(this.monName, xp)
    this.card.append(pf, main, h('div', 'hc-div'), this.party)
    root.append(this.card, this.hideBadge)

    // Top right: map, chips, feed
    const tr = h('div', 'topright')
    const frame = h('div', 'mapframe')
    this.mini.width = MAP * 2
    this.mini.height = MAP * 2
    frame.append(this.mini, h('span', 'maplabel', g.kind === 'raid' && g.world.gates.length ? 'DUNGEON' : 'UNOVA'))
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
    menu.setAttribute('aria-label', L('Pause', 'Pauze'))
    menu.onclick = onMenu
    const score = h('button', 'sysbtn', '🏆')
    score.setAttribute('aria-label', L('Scoreboard', 'Scorebord'))
    score.title = L('Scoreboard (Tab)', 'Scorebord (Tab)')
    score.onclick = () => this.board.toggle()
    sys.append(menu, mute, score)
    root.append(sys, this.toastEl, this.bannerEl, this.legend, this.bossBar, this.duelBar, this.respawnEl)
    this.board = new LiveBoard(root, g, () => g.player.id)
    if (g.kind === 'raid') root.classList.add('raid-mode')
    else root.classList.remove('raid-mode')
    root.classList.toggle('dungeon-mode', g.kind === 'raid' && g.world.gates.length > 0)
    root.classList.toggle('duel-mode', g.kind === 'duel')

    // Multiplayer chat: the conversation bottom left, a button (or Enter) to talk
    if (opts.chat) {
      this.chat = chatWidget(opts.chat)
      sys.append(this.chat.btn)
      root.append(this.chat.panel)
    }

    // Items
    const items = h('div', 'items2')
    // A raid has no wild Pokémon to catch: its first slot holds Max Ethers instead of Master Balls
    const first = g.kind === 'raid' ? (['master', 'max-ether', 'Max Ether'] as const) : (['master', 'master-ball', 'Master'] as const)
    for (const [key, sprite, label] of [first, ['potion', 'potion', 'Potion'], ['revive', 'revive', 'Revive']] as const) {
      const kb = keyName(keyOf(key))
      const b = h('div', `ib ${key}`, `<img class="px" src="${itemUrl(sprite)}" alt="${label}"><b>0</b><kbd data-pad="${{ master: '◀', potion: '▲', revive: '▶' }[key]}">${kb}</kbd>`) as HTMLDivElement
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
    if (key === 'master' && g.kind === 'raid') {
      if (p.ethers <= 0) return this.deny(L('No Max Ethers', 'Geen Max Ethers'))
      if (!g.useEther(p)) this.deny(L('Your moves are already ready', 'Je aanvallen zijn al klaar'))
    } else if (key === 'master') {
      if (p.masterBalls <= 0) return this.deny(L("You don't have a Master Ball", 'Je hebt geen Master Ball'))
      const t = g.masterTarget(p)
      if (!t) return this.deny(L('No wild Pokémon nearby', 'Geen wilde Pokémon dichtbij'))
      g.throwBall(p, t, true)
    } else if (key === 'potion') {
      if (p.potions <= 0) return this.deny(L('No Potions', 'Geen Potions'))
      if (!g.usePotion(p)) this.deny(L('Your Pokémon is already healthy', 'Je Pokémon is al fit'))
    } else {
      if (p.revives <= 0) return this.deny(L('No Revives', 'Geen Revives'))
      if (!g.useRevive(p)) this.deny(g.kind === 'raid' ? L('No teammate needs it right now', 'Geen teamgenoot die hem nu nodig heeft') : L('Nobody has fainted', 'Niemand is verslagen'))
    }
  }

  private deny(text: string) {
    sfx.denied()
    this.toast(text)
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
      let fired = true
      if (ok && aiming && d > DEAD) fired = g.useMove(p.mon, slot, undefined, { x: dx / d, y: dy / d, k: Math.min(1, d / MAXD) })
      else if (ok && !aiming && !autoFired) fired = g.useMove(p.mon, slot)
      if (!fired && (p.mon.cds[slot] > 0 || !p.mon.unlocked(slot))) sfx.denied()
      reset()
    }
    // iOS can take over a long press (text selection, system menus) without ever
    // sending pointerup: treat a cancelled or lost touch as letting go.
    b.onpointercancel = reset
    b.onlostpointercapture = (e) => e.pointerId === id && reset()
    this.releasers.push(reset)
  }

  /** Desktop: Enter opens the chat. Returns false when there's no chat. */
  openChat() {
    if (!this.chat) return false
    this.chat.open()
    return true
  }

  /** A chat line in the conversation. */
  chatLine(m: ChatLine, mine: boolean) {
    this.chat?.line(m, mine)
  }

  /** Let go of every attack button and the joystick (e.g. when no finger is on the screen). */
  releaseAll() {
    for (const r of this.releasers) r()
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
    const release = () => {
      id = -1
      this.g.input.mx = 0
      this.g.input.my = 0
      this.base.classList.add('hidden')
      this.knob.style.transform = ''
    }
    const end = (e: PointerEvent) => e.pointerId === id && release()
    zone.onpointerup = end
    zone.onpointercancel = end
    zone.onlostpointercapture = end
    this.releasers.push(release)
  }

  toast(text: Txt, color?: string) {
    const d = h('div')
    d.textContent = tx(text)
    if (color) d.style.setProperty('--c', color)
    this.toastEl.append(d)
    while (this.toastEl.children.length > 2) this.toastEl.firstChild!.remove()
    setTimeout(() => d.remove(), 2700)
  }

  feed(text: Txt, icon?: FeedIcon) {
    feedLine(this.feedEl, tx(text), icon)
  }

  /** Big centre-screen moments: GO!, level ups, new moves, legendaries, KOs. */
  banner(b: Banner) {
    if (b.kind === 'go') {
      this.root.classList.remove('intro-mode')
      this.countdown.className = 'countdown go'
      this.countdown.innerHTML = '<b>GO!</b>'
      sfx.countdown(true)
      say('go')
      setTimeout(() => (this.countdown.className = 'countdown hidden'), 900)
      return
    }
    const el = h('div', `bn ${b.kind}`)
    if (b.color) el.style.setProperty('--c', b.color)
    let art = ''
    if (b.mon) art = `<img class="px art" src="${animatedUrl(b.mon)}" onerror="this.onerror=null;this.src='${spriteUrl(b.mon, { shiny: b.shiny })}'" alt="">`
    else if (b.trainer) art = `<img class="px art tr" src="${trainerSpriteUrl(b.trainer)}" alt="">`
    const kicker: Partial<Record<Banner['kind'], string>> = {
      levelup: 'LEVEL UP', move: L('NEW MOVE', 'NIEUWE AANVAL'), legendary: L('★ LEGENDARY ★', '★ LEGENDARISCH ★'), ko: 'K.O.', caught: 'POKÉ BALL', storm: L('WARNING', 'WAARSCHUWING'), fainted: L('OOPS', 'OEPS'), win: 'BATTLE ROYALE',
    }
    el.innerHTML = `${art}<div class="txt"><small>${b.kicker ? tx(b.kicker) : kicker[b.kind] ?? ''}</small><b>${tx(b.title)}</b>${b.sub ? `<span>${tx(b.sub)}</span>` : ''}</div>`
    // Only one big banner at a time; small ones stack
    const big = b.kind === 'legendary' || b.kind === 'win' || b.kind === 'storm'
    if (b.kind === 'legendary') {
      // Hard to miss: a golden pulse over the whole screen
      const flash = h('div', 'legend-flash')
      this.root.append(flash)
      setTimeout(() => flash.remove(), 1800)
    }
    if (big) this.bannerEl.querySelectorAll('.bn').forEach((x) => x.remove())
    this.bannerEl.append(el)
    while (this.bannerEl.children.length > 2) this.bannerEl.firstChild!.remove()
    // Each kind of moment has its own sound (level ups, catches and KOs already played theirs)
    if (b.kind === 'storm') b.voice === 'storm' || b.voice === 'final_circle' ? sfx.siren() : sfx.banner()
    else if (b.kind === 'win') sfx.fanfare()
    else if (b.kind === 'move') sfx.newMove()
    else if (b.kind === 'fainted') b.voice && sfx.down()
    else if (b.kind !== 'levelup' && b.kind !== 'caught' && b.kind !== 'ko' && b.kind !== 'legendary') sfx.banner()
    if (b.voice) say(b.voice)
    setTimeout(() => el.classList.add('out'), BANNER_LIFE[b.kind] - 350)
    setTimeout(() => el.remove(), BANNER_LIFE[b.kind])
  }

  update() {
    const g = this.g, p = g.player
    const m = p.mon

    // Countdown
    if (g.introT > 0) {
      const t = g.introT
      // A title card while the announcer speaks, then 3-2-1 (2 s)
      const label = t > INTRO_TIME - 2 ? 'title' : String(Math.ceil(t / (2 / 3)))
      if (label !== this.cdShown) {
        this.cdShown = label
        if (label === 'title') {
          const boss = g.kind === 'raid' ? BOSSES[g.setup.boss ?? 'reshiram'] : null
          this.countdown.innerHTML = boss
            ? `<div class="cd-title raid"><small>RAID · ${tx(boss.title).toUpperCase()}</small><b>${boss.name.toUpperCase()}</b></div>`
            : `<div class="cd-title"><small>${g.total} TRAINERS · ${L('1 WINNER', '1 WINNAAR')}</small><b>BATTLE ROYALE</b></div>`
          say(boss ? (`raid_${boss.id}` as VoiceLine) : 'br_intro')
        }
        else {
          this.countdown.innerHTML = `<b class="num">${label}</b>`
          sfx.countdown(false)
          say(`count${label}` as VoiceLine)
        }
        this.countdown.className = `countdown ${label === 'title' ? 'tt' : 'n'}`
      }
    }

    // Battle card
    if (this.portraitId !== m.species.id * 2 + (m.shiny ? 1 : 0)) {
      this.portraitId = m.species.id * 2 + (m.shiny ? 1 : 0)
      this.portrait.src = spriteUrl(m.species.id, { shiny: m.shiny })
      this.card.classList.remove('swap')
      void this.card.offsetWidth
      this.card.classList.add('swap')
    }
    this.monName.textContent = `${m.shiny ? '✦' : ''}${m.name}`
    this.monLv.textContent = `Lv${m.level}`
    const k = Math.max(0, m.hp / m.maxHp)
    // The ring flashes red for a moment on every hit
    const now = performance.now()
    if (k < this.lastK - 0.001) this.hurtUntil = now + 220
    this.card.classList.toggle('hurt', now < this.hurtUntil)
    this.lastK = k
    this.card.style.setProperty('--hp', `${k * 360}deg`)
    this.card.style.setProperty('--hc', k > 0.5 ? '#40d860' : k > 0.2 ? '#f8c020' : '#f84030')
    this.card.classList.toggle('low', k > 0 && k < 0.25)
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
        b.innerHTML = `<div class="ring"></div><div class="cd"></div><div class="lbl">${locked ? `<span class="lock">🔒</span><small>Lv ${SLOT_UNLOCK[s]}</small>` : `<span>${mv.name}</span><small>${TYPE_NL[mv.type]}</small>`}</div><div class="secs"></div><div class="aimknob"></div><kbd data-pad="${['A', 'X', 'Y', 'RT'][s]}">${s === 0 ? L('Click', 'Klik') : keyName(keyOf((['move1', 'move2', 'move3', 'move4'] as const)[s]))}</kbd>`
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
        if (s === 3 && p.alive) sfx.ready()
        b.classList.remove('ping')
        void b.offsetWidth
        b.classList.add('ping')
      }
      this.readyState[s] = ready
      b.classList.toggle('ready', ready)
    })

    // Items
    const counts = { master: g.kind === 'raid' ? p.ethers : p.masterBalls, potion: p.potions, revive: p.revives }
    for (const [key2, n] of Object.entries(counts)) {
      const b = this.itemBtns[key2]
      b.classList.toggle('empty', n <= 0)
      b.querySelector('b')!.textContent = `${n}`
    }

    this.catchBtn.classList.toggle('hidden', !p.alive || !g.catchable(p))

    const inGrass = p.alive && g.introT <= 0 && g.world.isTall(p.x, p.y)
    if (inGrass && !this.wasGrass) sfx.rustle()
    this.wasGrass = inGrass
    const seen = inGrass && !g.hidden(p)
    this.hideBadge.classList.toggle('on', inGrass)
    this.hideBadge.classList.toggle('seen', seen)
    const label = seen ? L('Spotted!', 'Gezien!') : L('Hidden', 'Verborgen')
    const span = this.hideBadge.querySelector('span')!
    if (span.textContent !== label) span.textContent = label
    this.card.classList.toggle('regen', g.regenerating(m))

    // Vignettes
    const low = p.alive && !m.fainted && k < 0.25
    this.vLow.classList.toggle('on', low)
    // Low health: a heartbeat that quickens as it drops
    const beatNow = performance.now()
    if (low && g.introT <= 0 && beatNow >= this.beatAt) {
      sfx.heartbeat()
      this.beatAt = beatNow + 620 + k * 2400
    }
    this.vStorm.classList.toggle('on', p.alive && g.introT <= 0 && g.zone.outside(p.x, p.y))

    if (g.kind === 'raid') return this.updateRaid()
    if (g.kind === 'duel') return this.updateDuel()

    // Chips
    this.aliveChip.innerHTML = `<i>👤</i>${g.alive.length}`
    this.updateLegend()
    const z = g.zone
    const t = Math.max(0, Math.ceil(z.timeLeft))
    const mm = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
    this.stormChip.innerHTML = z.phase >= 6 ? `<i>⚡</i>${L('FINAL', 'FINALE')}` : `<i>${z.shrinking ? '⚡' : '⏱'}</i>${mm}`
    this.stormChip.classList.toggle('closing', z.shrinking)

    this.drawMini()
  }

  /** Raid HUD: the boss bar (HP, phase marks, timer), everyone's lives, respawn countdown. */
  private updateRaid() {
    const g = this.g, p = g.player
    const boss = g.wilds.find((w) => w.boss)
    const def = BOSSES[g.setup.boss ?? 'reshiram']
    this.legend.classList.add('hidden')
    const dg = g.raidView?.dg
    if (dg && dg.stage < 2) return this.updateDungeon(dg)
    this.bossBar.classList.toggle('hidden', !boss || g.introT > INTRO_TIME * 0.45)
    if (boss) {
      // The bar follows the boss into its next form (Black Kyurem, Mega Rayquaza, …)
      const ph = g.raidView?.phase ?? 0
      const key = `${def.id}:${ph}`
      if (this.bossKey !== key) {
        this.bossKey = key
        this.bossBar.style.setProperty('--c', def.looks[ph].aura ?? def.color)
        this.bossBar.innerHTML = `
          <div class="bb-top"><b>${ph === 2 && def.finalName ? def.finalName : def.name}</b><span class="bb-team"></span><span class="bb-time"></span></div>
          <div class="bb-bar"><i class="bb-lag"></i><i class="bb-fill"></i>${def.phases.map((f) => `<em style="left:${f * 100}%"></em>`).join('')}</div>`
      }
      const k = Math.max(0, boss.hp / boss.maxHp)
      ;(this.bossBar.querySelector('.bb-fill') as HTMLElement).style.width = `${k * 100}%`
      ;(this.bossBar.querySelector('.bb-lag') as HTMLElement).style.width = `${Math.max(0, boss.hpLag / boss.maxHp) * 100}%`
      const rv = g.raidView
      const t = Math.ceil(rv?.timeLeft ?? 0)
      const time = this.bossBar.querySelector('.bb-time') as HTMLElement
      time.textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
      time.classList.toggle('low', t <= 30)
      // Time running out: a warning at 30 and 10 seconds, then every second
      if ((t === 30 || t === 10 || (t <= 5 && t > 0)) && !this.timerWarned.has(t) && g.introT <= 0) {
        this.timerWarned.add(t)
        sfx.warn()
      }
      this.bossBar.classList.toggle('enraged', (rv?.phase ?? 0) >= 2)
      // Lives: just your hearts solo; with friends a short name before each row of hearts
      // Your own hearts first, then the others
      const humans = g.trainers.filter((t) => t.human).sort((a, b) => (b === p ? 1 : 0) - (a === p ? 1 : 0))
      const max = g.raidView?.dg?.lives ?? RAID_LIVES
      const hearts = (t: typeof p) => '♥'.repeat(Math.max(0, t.lives)) + '♡'.repeat(Math.max(0, max - t.lives))
      const team = humans.length < 2
        ? `<span class="mine">${hearts(p)}</span>`
        : humans.map((t) => `<span class="${t === p ? 'mine' : ''} ${t.alive ? '' : 'out'}">${esc(t.name.slice(0, 6))} ${hearts(t)}</span>`).join('')
      const tEl = this.bossBar.querySelector('.bb-team') as HTMLElement
      if (tEl.innerHTML !== team) tEl.innerHTML = team
    }
    // Down: big countdown until you're back
    const down = p.alive && p.mon.fainted && p.respawnT > 0
    const sec = down ? Math.ceil(p.respawnT) : 0
    if (sec !== this.respawnSec && sec > 0) sfx.countdown(false)
    this.respawnSec = sec
    this.respawnEl.classList.toggle('hidden', !down)
    if (down) this.respawnEl.innerHTML = `<small>${L(`${p.mon.name} fainted`, `${p.mon.name} is verslagen`)}</small><b>${Math.ceil(p.respawnT)}</b><span>${L(`${p.lives} ${p.lives === 1 ? 'life' : 'lives'} left`, `nog ${p.lives} ${p.lives === 1 ? 'leven' : 'levens'}`)}</span>`
    if (g.raidView?.dg) this.drawMini()
  }

  /**
   * Raid dungeon: the bar shows the room and its wave (or the warden's health
   * while one stands), how far you are through the dungeon, and everyone's lives.
   */
  private updateDungeon(dg: DungeonView) {
    const g = this.g, p = g.player
    const dd = dungeonOf(g.setup.boss)
    if (!dd) return
    const warden = dg.warden ? g.wilds.find((w) => w.id === dg.warden) : undefined
    this.bossBar.classList.toggle('hidden', g.introT > INTRO_TIME * 0.45)
    const room = dd.rooms[dg.room]
    const key = `dg:${dg.room}:${dg.stage}:${warden?.id ?? 0}:${dg.relics.join()}`
    if (this.bossKey !== key) {
      this.bossKey = key
      const title = warden ? warden.name : dg.stage === 1 ? dd.theme.toBoss() : room.name
      this.bossBar.style.setProperty('--c', warden ? dd.theme.accent : '#ffb040')
      // Where each room starts on the progress bar
      let acc = 0
      const marks = dd.rooms.map((r, i) => {
        const at = (acc / dg.total) * 100
        acc += fightsIn(r)
        return i ? `<em style="left:${at}%"></em>` : ''
      }).join('')
      const relics = dg.relics.map((r) => `<i class="bb-relic" title="${dd.theme.relics[r]()}: ${r === 'ember' ? L('+15% damage', '+15% schade') : L('−15% damage taken', '−15% schade')}">${r === 'ember' ? dd.theme.icon : '🛡️'}</i>`).join('')
      this.bossBar.innerHTML = `
        <div class="bb-top"><b>${esc(title)}</b>${relics}<span class="bb-team"></span><span class="bb-time"></span></div>
        <div class="bb-bar ${warden ? '' : 'dg'}"><i class="bb-lag"></i><i class="bb-fill"></i>${warden ? '' : marks}</div>`
    }
    const fill = this.bossBar.querySelector('.bb-fill') as HTMLElement
    const lag = this.bossBar.querySelector('.bb-lag') as HTMLElement
    if (warden) {
      fill.style.width = `${Math.max(0, warden.hp / warden.maxHp) * 100}%`
      lag.style.width = `${Math.max(0, warden.hpLag / warden.maxHp) * 100}%`
    } else {
      // How far through the dungeon: fights won
      fill.style.width = `${(Math.min(dg.total, dg.stage === 1 ? dg.total : dg.fights) / dg.total) * 100}%`
      lag.style.width = '0'
    }
    const time = this.bossBar.querySelector('.bb-time') as HTMLElement
    const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
    const txt = dg.stage === 1
      ? L('Enter the arena →', 'Ga de arena in →')
      : warden
        ? dg.enrage < 0 ? L('ENRAGED', 'WOEDEND') : L(`Enrage ${mmss(dg.enrage)}`, `Woede ${mmss(dg.enrage)}`)
        : dg.waves
          ? !dg.wave
            ? L('Step in…', 'Loop de zaal in…')
            : dg.next
              ? L(`Wave ${dg.wave}/${dg.waves} in ${dg.next}`, `Wave ${dg.wave}/${dg.waves} over ${dg.next}`)
              : L(`Wave ${dg.wave}/${dg.waves} · ${dg.left} left`, `Wave ${dg.wave}/${dg.waves} · nog ${dg.left}`)
          : dg.packs
            ? L(`${dg.packs} ${dg.packs === 1 ? 'pack' : 'packs'} left${dg.left ? ` · ${dg.left} fighting` : ''}`, `${dg.packs} ${dg.packs === 1 ? 'groep' : 'groepen'} over${dg.left ? ` · ${dg.left} in gevecht` : ''}`)
            : room?.warden ? L('The warden waits…', 'De wachter wacht…') : L(`Room ${dg.room + 1}/${dd.rooms.length}`, `Kamer ${dg.room + 1}/${dd.rooms.length}`)
    time.classList.toggle('low', !!warden && (dg.enrage < 0 || dg.enrage <= 15))
    if (time.textContent !== txt) time.textContent = txt
    const humans = g.trainers.filter((t) => t.human).sort((a, b) => (b === p ? 1 : 0) - (a === p ? 1 : 0))
    const hearts = (t: typeof p) => '♥'.repeat(Math.max(0, t.lives)) + '♡'.repeat(Math.max(0, dg.lives - t.lives))
    const team = humans.length < 2
      ? `<span class="mine">${hearts(p)}</span>`
      : humans.map((t) => `<span class="${t === p ? 'mine' : ''} ${t.alive ? '' : 'out'}">${esc(t.name.slice(0, 6))} ${hearts(t)}</span>`).join('')
    const tEl = this.bossBar.querySelector('.bb-team') as HTMLElement
    if (tEl.innerHTML !== team) tEl.innerHTML = team
    // Down: big countdown until you're back
    const down = p.alive && p.mon.fainted && p.respawnT > 0
    const sec = down ? Math.ceil(p.respawnT) : 0
    if (sec !== this.respawnSec && sec > 0) sfx.countdown(false)
    this.respawnSec = sec
    this.respawnEl.classList.toggle('hidden', !down)
    this.drawMini()
    if (down) this.respawnEl.innerHTML = `<small>${L(`${p.mon.name} fainted`, `${p.mon.name} is verslagen`)}</small><b>${Math.ceil(p.respawnT)}</b><span>${L(`${p.lives} ${p.lives === 1 ? 'life' : 'lives'} left · back at the last gate`, `nog ${p.lives} ${p.lives === 1 ? 'leven' : 'levens'} · terug bij de laatste poort`)}</span>`
  }

  /** 1 vs 1: rounds won (pips), both HP bars, the round and ring timer, your power-ups; big countdown between rounds. */
  private updateDuel() {
    const g = this.g, p = g.player
    const opp = g.trainers.find((t) => t !== p)
    const dv = g.duelView
    this.legend.classList.add('hidden')
    this.duelBar.classList.toggle('hidden', !opp || !dv || g.introT > INTRO_TIME * 0.45)
    if (!opp || !dv) return
    const key = `${opp.id}:${opp.name}`
    if (this.duelKey !== key) {
      this.duelKey = key
      this.duelBar.innerHTML = `
        <div class="db-top"><b class="db-me">${L('You', 'Jij')}</b><span class="db-pips me"></span><span class="db-mid"></span><span class="db-pips them"></span><b class="db-them">${esc(opp.name)}</b></div>
        <div class="db-bars"><div class="db-hp me"><i></i></div><div class="db-hp them"><i></i></div></div>
        <div class="db-buffs"></div>`
    }
    const pips = (n: number) => '●'.repeat(Math.min(DUEL_WINS, n)) + '○'.repeat(Math.max(0, DUEL_WINS - n))
    const set = (sel: string, html: string) => {
      const el = this.duelBar.querySelector(sel) as HTMLElement
      if (el.innerHTML !== html) el.innerHTML = html
    }
    set('.db-pips.me', pips(p.kos))
    set('.db-pips.them', pips(opp.kos))
    // Round and the time left in it (red in the last ten seconds)
    const left = Math.max(0, Math.ceil(ROUND_TIME - dv.roundT))
    set('.db-mid', `${L('R', 'R')}${dv.round}${dv.phase === 'fight' ? ` · <span class="${left <= 10 ? 'low' : ''}">⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>` : ''}`)
    const hp = (m: Mon | undefined) => (m ? Math.max(0, m.hp / m.maxHp) : 0)
    ;(this.duelBar.querySelector('.db-hp.me i') as HTMLElement).style.width = `${hp(p.mon) * 100}%`
    ;(this.duelBar.querySelector('.db-hp.them i') as HTMLElement).style.width = `${hp(opp.mon) * 100}%`
    // A rival hiding in the grass: you don't see their health change
    this.duelBar.querySelector('.db-hp.them')!.classList.toggle('hid', !!opp.mon && !g.canSee(p.mon, opp.mon))
    const buffs = ([['atkT', '⚔', 'X Attack', 'atk'], ['spdT', '»', 'X Speed', 'spd'], ['defT', '◈', 'X Defense', 'def']] as const)
      .filter(([k]) => p[k] > 0)
      .map(([k, icon, name, cls]) => `<span class="${cls} ${p[k] < 2.5 ? 'end' : ''}">${icon} ${name} ${Math.ceil(p[k])}</span>`).join('')
    set('.db-buffs', buffs)
    // Between rounds: the big countdown
    const counting = dv.phase === 'count' && dv.t > 0
    const sec = counting ? Math.ceil(dv.t) : 0
    this.respawnEl.classList.toggle('hidden', !counting)
    if (counting && sec !== this.countSec) this.respawnEl.innerHTML = `<small>${L(`Round ${dv.round}`, `Ronde ${dv.round}`)}</small><b>${sec}</b><span>${p.kos} - ${opp.kos}</span>`
    this.countSec = sec
  }

  /** Gold alert while a legendary roams: name, distance, an arrow toward it and how to catch it. */
  private updateLegend() {
    const g = this.g, p = g.player
    const w: Mon | undefined = g.wilds.find((x) => x.legendary && !x.catching && !x.boss)
    // No legendary around: point at a supply drop or swarm instead
    if (!w && p.alive && g.introT <= 0 && g.events.length) return this.updateEventPill()
    const show = !!w && p.alive && g.introT <= 0
    this.legend.classList.toggle('hidden', !show)
    this.legend.classList.remove('evt', 'drop', 'swarm')
    if (!show || !w) {
      this.legendId = -1
      return
    }
    // Big again for a moment when it's new, or once it's weakened
    const st = w.state === 'weak' ? 'weak' : ''
    if (this.legendId === w.id && st !== this.legendState) this.legendAt = performance.now()
    this.legendState = st
    if (this.legendId !== w.id) {
      this.legendId = w.id
      this.legendAt = performance.now()
      this.legend.innerHTML = `<img class="px" src="${spriteUrl(w.species.id, { shiny: w.shiny })}" alt=""><div class="lg-txt"><b>★ ${w.name} <small>Lv ${w.level}</small></b><span></span></div><i class="lg-arrow">➤</i>`
      this.legend.classList.remove('pop')
      void this.legend.offsetWidth
      this.legend.classList.add('pop')
    }
    const dx = w.x - p.x, dy = w.y - p.y
    const d = Math.hypot(dx, dy)
    ;(this.legend.querySelector('.lg-arrow') as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
    const how = w.state === 'weak'
      ? (g.claimedByOther(w, p) ? L('Weakened, someone else gets first try', 'Verzwakt, iemand anders mag eerst') : L('Weakened! Catch it fast!', 'Verzwakt! Snel vangen!'))
      : p.masterBalls > 0 ? L('Throw your Master Ball!', 'Gooi je Master Ball!') : L('Beat it, or catch it with a Master Ball', 'Versla hem, of vang hem met een Master Ball')
    const mini = this.legendMini()
    ;(this.legend.querySelector('span') as HTMLElement).textContent = mini ? `${Math.round(d)} m` : `${Math.round(d)} m · ${how}`
    this.legend.classList.toggle('near', d < 6)
  }

  /** Tracker pill for the nearest event (blue = supply drop, green = swarm). */
  private updateEventPill() {
    const g = this.g, p = g.player
    let e = g.events[0], bd = Infinity
    for (const x of g.events) {
      const d = Math.hypot(x.x - p.x, x.y - p.y) - (x.kind === 'drop' ? 30 : 0)
      if (d < bd) { bd = d; e = x }
    }
    this.legend.classList.remove('hidden')
    this.legend.classList.add('evt', e.kind)
    const key = -1000 - e.id
    if (this.legendId !== key) {
      this.legendId = key
      this.legendAt = performance.now()
      const icon = e.kind === 'drop' ? `<img class="px" src="${itemUrl('master-ball')}" alt="">` : `<img class="px" src="${spriteUrl(e.species ?? 25)}" alt="">`
      this.legend.innerHTML = `${icon}<div class="lg-txt"><b>${e.kind === 'drop' ? L('📦 Supply drop', '📦 Bevoorrading') : L('🐾 Swarm', '🐾 Zwerm')}</b><span></span></div><i class="lg-arrow">➤</i>`
      this.legend.classList.remove('pop')
      void this.legend.offsetWidth
      this.legend.classList.add('pop')
    }
    const dx = e.x - p.x, dy = e.y - p.y
    const d = Math.hypot(dx, dy)
    ;(this.legend.querySelector('.lg-arrow') as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
    ;(this.legend.querySelector('span') as HTMLElement).textContent = e.kind === 'drop'
      ? `${Math.round(d)} m · ${e.t > 0.5 ? L(`lands in ${Math.ceil(e.t)}s`, `landt over ${Math.ceil(e.t)}s`) : L('landed!', 'geland!')}`
      : `${Math.round(d)} m · ${L('six wild Pokémon', 'zes wilde Pokémon')}`
    if (this.legendMini()) (this.legend.querySelector('span') as HTMLElement).textContent = `${Math.round(d)} m`
    this.legend.classList.toggle('near', d < 6)
  }

  /** After 5 s the pill shrinks to a small tracker at the top edge, out of the way. */
  private legendMini() {
    const mini = performance.now() - this.legendAt > 5000
    this.legend.classList.toggle('mini', mini)
    return mini
  }

  /** The minimap as a picture (for a second screen). */
  miniUrl() {
    return this.mini.toDataURL()
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
    for (const e of g.events) {
      c.fillStyle = blink ? (e.kind === 'drop' ? '#58d0ff' : '#7ce07c') : '#282830'
      c.fillRect(e.x * s - 4, e.y * s - 4, 8, 8)
    }
    for (const w of g.wilds)
      if (w.legendary) {
        c.fillStyle = blink ? '#ffd040' : '#282830'
        c.beginPath()
        c.arc(w.x * s, w.y * s, 5, 0, Math.PI * 2)
        c.fill()
      }
    // Raid dungeon: closed gates, foes, teammates and where to go next
    const dg = g.raidView?.dg
    if (dg && dg.stage < 2) {
      for (const gt of g.world.gates) {
        if (gt.open) continue
        c.fillStyle = '#ff5030'
        c.fillRect(gt.x * s - 1, gt.y * s - 1, gt.w * s + 2, gt.h * s + 2)
      }
      for (const w of g.wilds) {
        if (!w.foe) continue
        c.fillStyle = w.foe === 3 ? '#ffb040' : '#ff4040'
        c.beginPath()
        c.arc(w.x * s, w.y * s, w.foe === 3 ? 5 : 2.5, 0, Math.PI * 2)
        c.fill()
      }
      const [ox, oy] = objective(g)
      const pulse = 7 + 4 * Math.sin(performance.now() / 250)
      c.strokeStyle = '#ffd040'
      c.lineWidth = 2.5
      c.beginPath()
      c.arc(ox * s, oy * s, pulse, 0, Math.PI * 2)
      c.stroke()
      for (const t of g.trainers) {
        if (t === g.player || !t.alive) continue
        c.fillStyle = '#58c8ff'
        c.beginPath()
        c.arc(t.x * s, t.y * s, 3.5, 0, Math.PI * 2)
        c.fill()
      }
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
    this.board.destroy()
    this.root.innerHTML = ''
    this.root.classList.add('hidden')
    this.root.classList.remove('intro-mode')
  }
}

/**
 * The chat during a match (and while spectating): the last lines of the
 * conversation bottom left, a button (or Enter on desktop) to open quick
 * phrases and a text field, and a count of unread lines on the button.
 * What people say also pops up above their trainer (see chatBubble in render).
 */
export type ChatWidget = ReturnType<typeof chatWidget>
const CHAT_KEEP = 6

export function chatWidget(say: (text: string) => void) {
  const btn = h('button', 'sysbtn chatbtn', `${CHAT_ICON}<i class="chat-n"></i>`) as HTMLButtonElement
  btn.setAttribute('aria-label', 'Chat')
  const panel = h('div', 'hchat', `
    <div class="hchat-log" aria-live="polite"></div>
    <form class="hchat-bar hidden">
      <div class="hchat-quick">${QUICK_CHAT.map((q) => `<button type="button">${tx(q)}</button>`).join('')}</div>
      <div class="hchat-row"><input maxlength="80" placeholder="${L('Say something…', 'Zeg iets…')}" autocomplete="off" enterkeyhint="send" aria-label="${L('Message', 'Bericht')}"><button type="submit" aria-label="${L('Send', 'Verstuur')}">${SEND_ICON}</button></div>
    </form>
    <div class="hchat-hint"><kbd>${keyName(keyOf('chat'))}</kbd>${L('to chat', 'om te chatten')}</div>`)
  const log = panel.querySelector('.hchat-log') as HTMLElement
  const bar = panel.querySelector('.hchat-bar') as HTMLFormElement
  const input = bar.querySelector('input') as HTMLInputElement
  const count = btn.querySelector('.chat-n') as HTMLElement
  let unread = 0
  const setUnread = (n: number) => {
    unread = n
    count.textContent = n > 9 ? '9+' : n ? String(n) : ''
    btn.classList.toggle('unread', n > 0)
  }
  const isOpen = () => !bar.classList.contains('hidden')
  const open = () => {
    bar.classList.remove('hidden')
    panel.classList.add('open')
    btn.classList.add('on')
    setUnread(0)
    input.focus()
  }
  const close = () => {
    bar.classList.add('hidden')
    panel.classList.remove('open')
    btn.classList.remove('on')
    input.blur()
  }
  const send = (text: string) => {
    if (text.trim()) {
      sfx.blip()
      say(text)
    }
    close()
  }
  btn.onclick = () => {
    sfx.select()
    if (isOpen()) close()
    else open()
  }
  bar.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = input.value
    input.value = ''
    send(text)
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })
  // Typing must not move your trainer or fire attacks
  input.addEventListener('keyup', (e) => e.stopPropagation())
  panel.addEventListener('pointerdown', (e) => isOpen() && e.stopPropagation())
  bar.querySelectorAll<HTMLButtonElement>('.hchat-quick button').forEach((b) => b.addEventListener('click', () => send(b.textContent!)))
  return {
    btn,
    panel,
    open,
    /** A line in the conversation; counts as unread while the chat is closed. */
    line(m: ChatLine, mine: boolean) {
      const d = h('div', `hchat-line ${mine ? 'mine' : ''}`, `<b>${esc(m.name)}</b><span>${esc(m.text)}</span>`)
      log.append(d)
      const all = log.querySelectorAll('.hchat-line')
      for (let i = 0; i < all.length - CHAT_KEEP; i++) all[i].remove()
      setTimeout(() => d.classList.add('old'), 12000)
      if (!mine) {
        sfx.blip()
        if (!isOpen()) setUnread(unread + 1)
      }
    },
  }
}

const CHAT_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>'
const SEND_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>'

/** How many announcements stay in view (they dim after a few seconds instead of vanishing). */
const FEED_KEEP = 5

/** An announcement in a feed: kills, spawns, drops, storm and boss moments. */
export function feedLine(feed: HTMLElement, text: string, icon?: FeedIcon) {
  const d = h('div', `ev ev-${icon?.kind ?? 'info'}`)
  if (icon?.mon) d.innerHTML = `<img class="px" src="${spriteUrl(icon.mon)}" alt="">`
  else if (icon?.trainer) d.innerHTML = `<img class="px tr" src="${trainerSpriteUrl(icon.trainer)}" alt="">`
  d.append(document.createTextNode(text))
  feed.append(d)
  const all = feed.querySelectorAll('.ev')
  for (let i = 0; i < all.length - FEED_KEEP; i++) all[i].remove()
  setTimeout(() => d.classList.add('old'), 7000)
}

/** Raid dungeon: where to head now (the room being fought, the next room, or the arena). */
export function objective(g: Game): [number, number] {
  const dd = dungeonOf(g.setup.boss), dg = g.raidView?.dg
  if (!dd || !dg || dg.stage >= 1 || !dd.rooms[dg.room]) return [ARENA_C, ARENA_C]
  const r = dd.rooms[dg.room].rect
  return [r.x + r.w / 2, r.y + r.h / 2]
}
