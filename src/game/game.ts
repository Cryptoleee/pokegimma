import { PARTY_MAX, ROSTER, SPECIES, WILD, type Rarity } from '../data/pokemon'
import { movesetFor, SLOT_UNLOCK, type Move } from '../data/moves'
import { BOT_NAMES, TRAINERS, type TrainerDef } from '../data/trainers'
import { effectiveness, TYPE_COLOR } from '../data/types'
import { sfx } from '../audio'
import { LEVEL_CAP, Mon, Trainer, xpNeeded } from './entities'
import { Rng } from './rng'
import { preloadMon } from './sprites'
import { MAP, T, World } from './world'
import { botThink } from './ai'
import type { Dir } from './trainerSprite'

export type ItemKind = 'master' | 'potion' | 'candy' | 'revive'
export const ITEM_SPRITE: Record<ItemKind, string> = {
  master: 'master-ball', potion: 'potion', candy: 'rare-candy', revive: 'revive',
}
export const ITEM_NL: Record<ItemKind, string> = {
  master: 'Master Ball', potion: 'Potion', candy: 'Rare Candy', revive: 'Revive',
}

export interface GroundItem {
  x: number
  y: number
  kind: ItemKind
  bob: number
}

export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  move: Move
  src: Mon
  mult: number
}

export interface Nova {
  x: number
  y: number
  t: number
  move: Move
  src: Mon
  r: number
}

export interface Fx {
  kind: 'ring' | 'beam' | 'swipe' | 'text' | 'spark' | 'poof' | 'heal'
  x: number
  y: number
  x2?: number
  y2?: number
  t: number
  life: number
  color: string
  r?: number
  text?: string
  vx?: number
  vy?: number
  big?: boolean
}

interface PendingCatch {
  tr: Trainer
  mon: Mon
  t: number
  master: boolean
}

export interface ZonePhase {
  wait: number
  shrink: number
  r: number
  dps: number
}

const PHASES: ZonePhase[] = [
  { wait: 55, shrink: 35, r: 46, dps: 0.02 },
  { wait: 40, shrink: 30, r: 30, dps: 0.035 },
  { wait: 35, shrink: 28, r: 18, dps: 0.05 },
  { wait: 30, shrink: 24, r: 9, dps: 0.08 },
  { wait: 25, shrink: 20, r: 3.5, dps: 0.12 },
  { wait: 20, shrink: 20, r: 0, dps: 0.2 },
]

export class Zone {
  x = MAP / 2
  y = MAP / 2
  r = 95
  fromX = MAP / 2
  fromY = MAP / 2
  fromR = 95
  nx = MAP / 2
  ny = MAP / 2
  nr = 46
  phase = 0
  t = 0
  shrinking = false
  get dps() {
    return PHASES[Math.min(this.phase, PHASES.length - 1)].dps
  }
  get timeLeft() {
    const p = PHASES[Math.min(this.phase, PHASES.length - 1)]
    return this.shrinking ? p.shrink - this.t : p.wait - this.t
  }
  outside(x: number, y: number) {
    return Math.hypot(x - this.x, y - this.y) > this.r
  }
}

export interface GameHooks {
  toast(text: string, color?: string): void
  feed(text: string): void
  partyFull(mon: Mon, choose: (idx: number) => void): void
  end(result: GameResult): void
}

export interface GameResult {
  won: boolean
  place: number
  total: number
  time: number
  kos: number
  caught: number
  best: Mon
}

const RARITY_XP: Record<Rarity, number> = { common: 1, uncommon: 1.4, rare: 2.5, legendary: 5 }
const LEGEND_TIMES = [140, 300]
const BOTS = 11
const DMG_SCALE = 1.25

export class Game {
  rng: Rng
  world: World
  trainers: Trainer[] = []
  player: Trainer
  wilds: Mon[] = []
  items: GroundItem[] = []
  projs: Projectile[] = []
  novas: Nova[] = []
  fx: Fx[] = []
  catches: PendingCatch[] = []
  zone = new Zone()
  flow!: Int32Array
  time = 0
  paused = false
  over = false
  endT = -1
  camX = 0
  camY = 0
  spectate: Trainer | null = null
  input = { mx: 0, my: 0 }
  held = [false, false, false, false]
  private spawnT = 0
  private legendIdx = 0
  private passiveT = 0
  total = BOTS + 1

  constructor(playerDef: TrainerDef, team: number[], public hooks: GameHooks, seed = Date.now() % 1e9) {
    this.rng = new Rng(seed)
    this.world = new World(this.rng)
    this.pickNextZone()

    this.player = new Trainer(playerDef, playerDef.name, true)
    this.player.party = team.map((id) => this.ownMon(new Mon(id, 5), this.player))
    this.trainers.push(this.player)

    const names = [...BOT_NAMES].sort(() => this.rng.next() - 0.5)
    for (let i = 0; i < BOTS; i++) {
      const def = this.rng.pick(TRAINERS.filter((t) => t.key !== playerDef.key))
      const bot = new Trainer(def, names[i % names.length], false)
      const pool = [...ROSTER].sort(() => this.rng.next() - 0.5)
      bot.party = pool.slice(0, 3).map((id) => this.ownMon(new Mon(id, 5), bot))
      bot.brain = {
        skill: this.rng.range(0.45, 0.95), thinkT: 0, goalX: 0, goalY: 0, target: null,
        lastX: 0, lastY: 0, stuckT: 0, mode: 'wander', strafe: this.rng.chance(0.5) ? 1 : -1,
      }
      this.trainers.push(bot)
    }

    // Spread everyone out over the map.
    const placed: [number, number][] = []
    for (const tr of this.trainers) {
      let p = this.world.randomWalkable()
      for (let k = 0; k < 60; k++) {
        const c = this.world.randomWalkable((x, y) => Math.hypot(x - 64, y - 64) < 52)
        if (placed.every(([a, b]) => Math.hypot(a - c[0], b - c[1]) > 22)) { p = c; break }
      }
      placed.push(p)
      tr.x = p[0]
      tr.y = p[1]
      tr.mon.x = tr.x
      tr.mon.y = tr.y + 0.8
    }
    this.camX = this.player.x
    this.camY = this.player.y

    this.scatterItems()
    for (let i = 0; i < 55; i++) this.spawnWild(true)
    team.forEach((id) => preloadMon(id))
  }

  private ownMon(m: Mon, tr: Trainer) {
    m.owner = tr
    m.hp = m.maxHp
    return m
  }

  get alive() {
    return this.trainers.filter((t) => t.alive)
  }

  // ---------------- Main loop ----------------

  update(dt: number) {
    this.updateFx(dt)
    if (this.paused) return
    if (this.endT >= 0) {
      this.endT -= dt
      if (this.endT < 0 && !this.over) this.finish()
    }
    this.time += dt
    this.updateZone(dt)

    // Player intent
    const p = this.player
    if (p.alive) {
      p.vx = this.input.mx
      p.vy = this.input.my
      for (let s = 0; s < 4; s++) if (this.held[s]) this.useMove(p.mon, s)
    }

    for (const tr of this.trainers) {
      if (!tr.alive) continue
      if (tr.brain) botThink(this, tr, dt)
      this.updateTrainer(tr, dt)
    }
    this.passiveT += dt
    if (this.passiveT >= 1) {
      this.passiveT -= 1
      for (const tr of this.alive)
        tr.party.forEach((m, i) => !m.fainted && this.gainXp(m, i === tr.active ? 2 : 1))
    }

    this.updateWilds(dt)
    this.updateProjectiles(dt)
    this.updateNovas(dt)
    this.updateCatches(dt)
    this.updateItems()
    this.spawnLoop(dt)

    const focus = p.alive ? p : this.spectate && this.spectate.alive ? this.spectate : (this.spectate = this.alive[0] ?? p)
    const k = Math.min(1, dt * 8)
    this.camX += (focus.x - this.camX) * k
    this.camY += (focus.y - this.camY) * k
  }

  private updateTrainer(tr: Trainer, dt: number) {
    tr.swapCd = Math.max(0, tr.swapCd - dt)
    const len = Math.hypot(tr.vx, tr.vy)
    const speed = 4.4
    if (len > 0.08) {
      const n = Math.min(1, len)
      const dx = (tr.vx / len) * n * speed * dt
      const dy = (tr.vy / len) * n * speed * dt
      this.tryMove(tr, dx, dy, 0.3)
      tr.dir = dirOf(tr.vx, tr.vy)
      tr.walkT += dt * n * 7
    } else tr.walkT = 0

    // Active Pokémon
    const m = tr.mon
    for (let i = 0; i < 4; i++) m.cds[i] = Math.max(0, m.cds[i] - dt)
    if (m.fainted) {
      tr.autoSwapT -= dt
      if (tr.autoSwapT <= 0) {
        const idx = tr.healthyIndex()
        if (idx >= 0) this.sendOut(tr, idx)
      }
    } else if (m.dash) this.updateDash(m, dt)
    else {
      const [fx, fy] = dirVec(tr.dir)
      const bx = tr.x - fx * 0.95
      const by = tr.y - fy * 0.75 + 0.15
      const d = Math.hypot(bx - m.x, by - m.y)
      if (d > 7) {
        m.x = bx
        m.y = by
      } else if (d > 0.05) {
        const step = Math.min(d, Math.max(5, d * 6) * dt)
        m.mvx = ((bx - m.x) / d) * step
        m.mvy = ((by - m.y) / d) * step
        m.x += m.mvx
        m.y += m.mvy
      }
    }
    m.aimT -= dt
    m.dir = m.aimT > 0 ? dirOf(m.aimX, m.aimY) : len > 0.08 ? tr.dir : m.dir

    // Storm
    if (this.zone.outside(tr.x, tr.y) && !m.fainted) {
      m.hp -= m.maxHp * this.zone.dps * dt
      if (m.hp <= 0) {
        m.hp = 0
        this.onFaint(m, null)
      }
    }
  }

  sendOut(tr: Trainer, idx: number) {
    tr.active = idx
    const m = tr.mon
    m.x = tr.x
    m.y = tr.y + 0.4
    m.dash = null
    this.fx.push({ kind: 'poof', x: m.x, y: m.y - 0.4, t: 0, life: 0.4, color: '#ffffff' })
  }

  switchTo(tr: Trainer, idx: number): boolean {
    if (!tr.alive || idx === tr.active || !tr.party[idx] || tr.party[idx].fainted || tr.swapCd > 0) return false
    tr.swapCd = 1.2
    this.sendOut(tr, idx)
    if (tr.isPlayer) sfx.select()
    return true
  }

  // ---------------- Combat ----------------

  enemiesOf(m: Mon): Mon[] {
    const out: Mon[] = []
    for (const tr of this.trainers) {
      if (!tr.alive || tr === m.owner) continue
      const a = tr.mon
      if (a && !a.fainted) out.push(a)
    }
    if (m.owner) for (const w of this.wilds) if (w.state !== 'weak') out.push(w)
    return out
  }

  autoTarget(m: Mon, range: number): Mon | null {
    if (!m.owner) return m.aggro && !m.aggro.fainted ? m.aggro : null
    let best: Mon | null = null
    let bd = range
    for (const e of this.enemiesOf(m)) {
      // Prefer trainers' Pokémon slightly over wild ones.
      const d = Math.hypot(e.x - m.x, e.y - m.y) - (e.owner ? 0.8 : 0)
      if (d < bd) { bd = d; best = e }
    }
    return best
  }

  useMove(m: Mon, slot: number, target?: Mon | null): boolean {
    const mv = m.moves[slot]
    if (!mv || !m.unlocked(slot) || m.cds[slot] > 0 || m.fainted || m.state === 'weak' || m.dash || m.catching) return false
    const tgt = target ?? this.autoTarget(m, mv.range + 1.5)
    let ax: number, ay: number
    if (tgt) {
      ax = tgt.x - m.x
      ay = tgt.y - m.y
    } else {
      ;[ax, ay] = m.owner ? dirVec(m.owner.dir) : dirVec(m.dir)
    }
    const l = Math.hypot(ax, ay) || 1
    ax /= l
    ay /= l
    m.aimX = ax
    m.aimY = ay
    m.aimT = 0.6
    m.cds[slot] = mv.cooldown
    const ox = m.x, oy = m.y - 0.45
    const col = TYPE_COLOR[mv.type]
    const visible = this.onScreen(m.x, m.y)
    if (visible && m.owner?.isPlayer) sfx.cast(mv.tier)

    switch (mv.kind) {
      case 'melee': {
        for (const e of this.enemiesOf(m)) {
          const dx = e.x - m.x, dy = e.y - m.y
          const d = Math.hypot(dx, dy)
          if (d < mv.range + 0.4 && (d < 0.6 || (dx * ax + dy * ay) / d > 0.25)) this.hit(m, e, mv)
        }
        this.fx.push({ kind: 'swipe', x: ox + ax * 0.9, y: oy + ay * 0.9, x2: ax, y2: ay, t: 0, life: 0.22, color: col })
        break
      }
      case 'bolt':
        this.shoot(m, mv, ox, oy, ax, ay, 1)
        break
      case 'spread':
        for (const a of [-0.28, 0, 0.28]) {
          const c = Math.cos(a), s = Math.sin(a)
          this.shoot(m, mv, ox, oy, ax * c - ay * s, ax * s + ay * c, 0.55)
        }
        break
      case 'dash':
        m.dash = { vx: ax * 13, vy: ay * 13, t: mv.range / 13, move: mv, hit: new Set() }
        break
      case 'beam': {
        const ex = ox + ax * mv.range, ey = oy + ay * mv.range
        for (const e of this.enemiesOf(m)) if (segDist(e.x, e.y - 0.4, ox, oy, ex, ey) < 0.7) this.hit(m, e, mv)
        this.fx.push({ kind: 'beam', x: ox, y: oy, x2: ex, y2: ey, t: 0, life: 0.3, color: col, big: mv.tier >= 3 })
        break
      }
      case 'burst': {
        const r = mv.tier >= 3 ? 3.4 : mv.range
        for (const e of this.enemiesOf(m)) if (Math.hypot(e.x - m.x, e.y - m.y) < r) this.hit(m, e, mv)
        this.fx.push({ kind: 'ring', x: m.x, y: m.y - 0.3, t: 0, life: 0.4, color: col, r })
        break
      }
      case 'nova': {
        const nx = tgt ? tgt.x : m.x + ax * 4
        const ny = tgt ? tgt.y : m.y + ay * 4
        this.novas.push({ x: nx, y: ny, t: 0.6, move: mv, src: m, r: mv.tier >= 3 ? 2.3 : 1.8 })
        break
      }
    }
    return true
  }

  private shoot(m: Mon, mv: Move, x: number, y: number, ax: number, ay: number, mult: number) {
    const sp = 10
    this.projs.push({ x, y, vx: ax * sp, vy: ay * sp, life: (mv.range + 1) / sp, move: mv, src: m, mult })
  }

  private updateDash(m: Mon, dt: number) {
    const d = m.dash!
    const nx = m.x + d.vx * dt, ny = m.y + d.vy * dt
    if (this.world.blocked(nx, ny)) d.t = 0
    else {
      m.x = nx
      m.y = ny
    }
    for (const e of this.enemiesOf(m))
      if (!d.hit.has(e) && Math.hypot(e.x - m.x, e.y - m.y) < 1) {
        d.hit.add(e)
        this.hit(m, e, d.move)
      }
    if (Math.random() < 0.6)
      this.fx.push({ kind: 'spark', x: m.x, y: m.y - 0.4, t: 0, life: 0.3, color: TYPE_COLOR[d.move.type], vx: 0, vy: -1 })
    d.t -= dt
    if (d.t <= 0) m.dash = null
  }

  hit(src: Mon, tgt: Mon, mv: Move, mult = 1) {
    if (tgt.fainted || tgt.state === 'weak') return
    const eff = effectiveness(mv.type, tgt.species.types)
    const L = src.level
    const raw = (((2 * L) / 5 + 2) * mv.power * (src.atk / tgt.def)) / 50 + 2
    const dmg = Math.max(1, Math.round(raw * eff * mult * DMG_SCALE * this.rng.range(0.9, 1.05)))
    tgt.hp -= dmg
    tgt.flash = 0.12
    if (src.owner) tgt.lastHitBy = src.owner

    // knockback
    const dx = tgt.x - src.x, dy = tgt.y - src.y
    const d = Math.hypot(dx, dy) || 1
    if (!tgt.legendary) this.tryMove(tgt, (dx / d) * 0.12, (dy / d) * 0.12, 0.2)

    const visible = this.onScreen(tgt.x, tgt.y)
    if (visible) {
      this.fx.push({
        kind: 'text', x: tgt.x + this.rng.range(-0.3, 0.3), y: tgt.y - 1.4, t: 0, life: 0.8,
        color: eff > 1 ? '#ffd040' : eff < 1 ? '#c8c8c8' : '#ffffff', text: `${dmg}${eff > 1 ? '!' : ''}`, big: eff > 1,
      })
      for (let i = 0; i < 4; i++)
        this.fx.push({
          kind: 'spark', x: tgt.x, y: tgt.y - 0.5, t: 0, life: 0.35, color: TYPE_COLOR[mv.type],
          vx: this.rng.range(-3, 3), vy: this.rng.range(-3, 1),
        })
      if (src.owner?.isPlayer || tgt.owner?.isPlayer) sfx.hit(eff > 1)
    }
    if (!tgt.owner) {
      tgt.aggro = src
      tgt.aggroT = 8
      tgt.state = 'aggro'
    }
    if (src.owner) this.gainXp(src, (Math.min(dmg, tgt.maxHp) / tgt.maxHp) * 6 * RARITY_XP[tgt.rarity])
    if (tgt.hp <= 0) {
      tgt.hp = 0
      this.onFaint(tgt, src)
    }
  }

  private onFaint(m: Mon, by: Mon | null) {
    if (this.onScreen(m.x, m.y)) sfx.faint()
    m.dash = null
    const koXp = (5 + m.level * 1.2) * RARITY_XP[m.rarity]
    if (!m.owner) {
      m.state = 'weak'
      m.weakT = m.legendary ? 15 : 9
      m.aggro = null
      if (by?.owner) this.gainXp(by, koXp)
      if (m.legendary) this.hooks.feed(`${m.name} is verzwakt! Vang hem snel!`)
      return
    }
    const tr = m.owner
    tr.autoSwapT = 0.9
    if (by?.owner) this.gainXp(by, koXp * 1.5)
    if (tr.isPlayer) this.hooks.toast(`${m.name} is verslagen!`, '#ff8080')
    if (tr.healthyIndex() < 0) this.eliminate(tr, by?.owner ?? m.lastHitBy)
  }

  private eliminate(tr: Trainer, by: Trainer | null) {
    if (!tr.alive) return
    tr.place = this.alive.length
    tr.alive = false
    tr.diedAt = this.time
    if (by && by !== tr) by.kos++
    this.hooks.feed(by && by !== tr ? `${by.isPlayer ? 'Jij' : by.name} schakelde ${tr.isPlayer ? 'jou' : tr.name} uit` : `${tr.isPlayer ? 'Jij' : tr.name} werd gesloopt door de storm`)
    if (this.onScreen(tr.x, tr.y)) sfx.ko()
    // Drop loot
    const drops: ItemKind[] = [
      ...Array(tr.masterBalls).fill('master'), ...Array(tr.potions).fill('potion'), ...Array(tr.revives).fill('revive'),
    ]
    drops.forEach((kind, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2
      this.items.push({ x: tr.x + Math.cos(a) * 0.9, y: tr.y + Math.sin(a) * 0.9, kind, bob: Math.random() * 6 })
    })
    tr.masterBalls = tr.potions = tr.revives = 0
    if (tr.isPlayer) {
      this.spectate = by && by.alive ? by : null
      this.endT = 2.2
    } else if (this.alive.length === 1 && this.alive[0].isPlayer) {
      this.player.place = 1
      this.endT = 1.5
      this.hooks.toast('WINNAAR! Jij bent de laatste trainer!', '#ffd040')
    }
  }

  private finish() {
    this.over = true
    const p = this.player
    const best = [...p.party].sort((a, b) => b.level - a.level)[0]
    this.hooks.end({
      won: p.alive, place: p.alive ? 1 : p.place, total: this.total,
      time: p.alive ? this.time : p.diedAt, kos: p.kos, caught: p.caught, best,
    })
  }

  // ---------------- Leveling ----------------

  gainXp(m: Mon, amount: number) {
    if (m.level >= LEVEL_CAP || !m.owner) return
    m.xp += amount
    while (m.xp >= xpNeeded(m.level) && m.level < LEVEL_CAP) {
      m.xp -= xpNeeded(m.level)
      this.levelUp(m)
    }
  }

  private levelUp(m: Mon) {
    const before = m.maxHp
    m.level++
    m.hp = Math.min(m.maxHp, m.hp + (m.maxHp - before))
    const mine = m.owner?.isPlayer
    if (mine) sfx.level()
    SLOT_UNLOCK.forEach((lv, i) => {
      if (lv === m.level && mine) this.hooks.toast(`${m.name} leerde ${m.moves[i].name}!`, TYPE_COLOR[m.moves[i].type])
    })
    const sp = m.species
    if (sp.evo && sp.evoLevel && m.level >= sp.evoLevel) {
      const ratio = m.hp / m.maxHp
      const old = sp.name
      m.species = SPECIES[this.rng.pick(sp.evo)]
      m.moves = movesetFor(m.species.types)
      m.hp = Math.max(1, Math.round(ratio * m.maxHp))
      m.evolveFx = 1.4
      preloadMon(m.species.id, m.shiny)
      if (mine) {
        sfx.evolve()
        this.hooks.toast(`Wat? ${old} evolueerde in ${m.species.name}!`, '#ffd040')
      }
    }
  }

  // ---------------- Catching & items ----------------

  /** Try to throw a ball. Normal balls only work on weakened wild Pokémon. */
  throwBall(tr: Trainer, w: Mon, master: boolean): boolean {
    if (!tr.alive || w.owner || w.catching || this.catches.some((c) => c.tr === tr)) return false
    if (!master && w.state !== 'weak') return false
    if (master) {
      if (tr.masterBalls <= 0) return false
      tr.masterBalls--
    }
    w.catching = true
    w.dash = null
    tr.throwFx = { x: tr.x, y: tr.y - 0.7, tx: w.x, ty: w.y - 0.4, t: 0, master }
    this.catches.push({ tr, mon: w, t: 1.0, master })
    return true
  }

  private updateCatches(dt: number) {
    for (const c of [...this.catches]) {
      c.t -= dt
      if (c.tr.throwFx) c.tr.throwFx.t += dt
      if (c.t > 0) continue
      this.catches.splice(this.catches.indexOf(c), 1)
      c.tr.throwFx = null
      if (!c.tr.alive) {
        c.mon.catching = false
        continue
      }
      this.completeCatch(c.tr, c.mon)
    }
  }

  private completeCatch(tr: Trainer, w: Mon) {
    this.wilds.splice(this.wilds.indexOf(w), 1)
    w.catching = false
    w.owner = tr
    w.state = 'roam'
    w.aggro = null
    w.hp = w.maxHp
    w.cds = [0, 0, 0, 0]
    w.x = tr.x
    w.y = tr.y + 0.4
    tr.caught++
    preloadMon(w.species.id, w.shiny)
    if (tr.isPlayer) sfx.catch()
    if (w.legendary || w.rarity === 'rare') this.hooks.feed(`${tr.isPlayer ? 'Jij' : tr.name} ving ${w.shiny ? '✦' : ''}${w.name}!`)
    if (tr.party.length < PARTY_MAX) {
      tr.party.push(w)
      if (tr.isPlayer) this.hooks.toast(`Gevangen! ${w.name} (Lv ${w.level}) zit in je team`, '#80e080')
      return
    }
    if (tr.isPlayer) {
      this.paused = true
      this.hooks.partyFull(w, (idx) => {
        if (idx >= 0) {
          tr.party[idx] = w
          if (idx === tr.active) this.sendOut(tr, idx)
          this.hooks.toast(`${w.name} zit nu in je team`, '#80e080')
        }
        this.paused = false
      })
      return
    }
    const power = (m: Mon) => (m.fainted ? 0 : m.level * (m.species.atk + m.species.def + m.species.hp))
    let worst = 0
    tr.party.forEach((m, i) => { if (i !== tr.active && power(m) < power(tr.party[worst])) worst = i })
    if (worst === tr.active) worst = (tr.active + 1) % tr.party.length
    if (power(w) > power(tr.party[worst])) tr.party[worst] = w
  }

  usePotion(tr: Trainer): boolean {
    const m = tr.mon
    if (tr.potions <= 0 || m.fainted || m.hp >= m.maxHp) return false
    tr.potions--
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.5)
    this.fx.push({ kind: 'heal', x: m.x, y: m.y - 0.5, t: 0, life: 0.7, color: '#80f080' })
    if (tr.isPlayer) sfx.heal()
    return true
  }

  useRevive(tr: Trainer): boolean {
    const idx = tr.party.findIndex((m) => m.fainted)
    if (tr.revives <= 0 || idx < 0) return false
    tr.revives--
    const m = tr.party[idx]
    m.hp = Math.round(m.maxHp * 0.5)
    if (tr.isPlayer) {
      sfx.heal()
      this.hooks.toast(`${m.name} is weer fit!`, '#80f080')
    }
    return true
  }

  private scatterItems() {
    const add = (kind: ItemKind, n: number) => {
      for (let i = 0; i < n; i++) {
        const [x, y] = this.world.randomWalkable()
        this.items.push({ x, y, kind, bob: Math.random() * 6 })
      }
    }
    add('master', 10)
    add('potion', 45)
    add('candy', 24)
    add('revive', 12)
    // Towns are worth visiting
    for (const t of this.world.towns) {
      this.items.push({ x: t.x + 0.5, y: t.y + 0.5, kind: this.rng.chance(0.4) ? 'master' : 'revive', bob: 0 })
      this.items.push({ x: t.x - 3.5, y: t.y + 1.5, kind: 'potion', bob: 0 })
    }
  }

  private updateItems() {
    for (const it of [...this.items]) {
      for (const tr of this.trainers) {
        if (!tr.alive || Math.hypot(tr.x - it.x, tr.y - it.y) > 0.8) continue
        this.items.splice(this.items.indexOf(it), 1)
        this.applyItem(tr, it.kind)
        break
      }
    }
  }

  private applyItem(tr: Trainer, kind: ItemKind) {
    if (tr.isPlayer) sfx.pickup()
    switch (kind) {
      case 'master':
        tr.masterBalls++
        if (tr.isPlayer) this.hooks.toast('Master Ball gevonden! Vang elke wilde Pokémon direct', '#c080ff')
        break
      case 'potion':
        tr.potions++
        if (tr.isPlayer) this.hooks.toast('Potion gevonden')
        break
      case 'revive':
        tr.revives++
        if (tr.isPlayer) this.hooks.toast('Revive gevonden')
        break
      case 'candy': {
        const m = tr.mon.fainted ? tr.party.find((x) => !x.fainted) : tr.mon
        if (!m) return
        this.gainXp(m, xpNeeded(m.level) - m.xp + 0.01)
        if (tr.isPlayer) this.hooks.toast(`Rare Candy! ${m.name} is nu Lv ${m.level}`, '#80c0ff')
        break
      }
    }
  }

  // ---------------- Wild Pokémon ----------------

  private spawnLoop(dt: number) {
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = 1
      const frac = Math.min(1, (Math.PI * this.zone.r * this.zone.r) / (MAP * MAP))
      const want = Math.round(16 + 44 * frac)
      for (let i = 0; i < 2 && this.wilds.length < want; i++) this.spawnWild(false)
    }
    if (this.legendIdx < LEGEND_TIMES.length && this.time >= LEGEND_TIMES[this.legendIdx]) {
      this.legendIdx++
      this.spawnLegendary()
    }
  }

  private wildLevel(r: Rarity) {
    const base = 3 + this.time / 16 + this.rng.range(-2, 2)
    return Math.max(2, Math.min(LEVEL_CAP, Math.round(base + (r === 'uncommon' ? 2 : r === 'rare' ? 6 : 0))))
  }

  private spawnWild(initial: boolean) {
    const roll = this.rng.next()
    const rarity: Rarity = roll < 0.68 ? 'common' : roll < 0.93 ? 'uncommon' : 'rare'
    const z = this.zone
    let pos: [number, number] | null = null
    for (let k = 0; k < 30 && !pos; k++) {
      const i = this.rng.pick(this.world.tall.length ? this.world.tall : this.world.walkable)
      const x = (i % MAP) + 0.5, y = Math.floor(i / MAP) + 0.5
      if (Math.hypot(x - z.x, y - z.y) > z.r - 2) continue
      if (this.trainers.some((t) => t.alive && Math.hypot(t.x - x, t.y - y) < (initial ? 6 : 10))) continue
      pos = [x, y]
    }
    if (!pos) return
    const id = this.rng.pick(WILD[rarity])
    const m = new Mon(id, this.wildLevel(rarity), this.rng.chance(1 / 64))
    m.x = m.homeX = m.goalX = pos[0]
    m.y = m.homeY = m.goalY = pos[1]
    m.aggressive = rarity === 'rare' || this.rng.chance(0.15)
    preloadMon(id, m.shiny)
    this.wilds.push(m)
  }

  private spawnLegendary() {
    const z = this.zone
    const [x, y] = this.world.randomWalkable(
      (x, y) => Math.hypot(x - z.nx, y - z.ny) < Math.max(4, z.nr) && this.trainers.every((t) => Math.hypot(t.x - x, t.y - y) > 12),
    )
    const id = this.rng.pick(WILD.legendary)
    const m = new Mon(id, Math.round(26 + this.time / 22), this.rng.chance(1 / 16))
    m.hp = m.maxHp
    m.x = m.homeX = m.goalX = x
    m.y = m.homeY = m.goalY = y
    m.aggressive = true
    preloadMon(id, m.shiny)
    this.wilds.push(m)
    sfx.legendary()
    this.hooks.toast(`Een legendarische ${m.name} is verschenen!`, '#ffd040')
    this.hooks.feed(`★ ${m.name} (Lv ${m.level}) staat op de kaart`)
  }

  private updateWilds(dt: number) {
    for (const w of [...this.wilds]) {
      w.flash = Math.max(0, w.flash - dt)
      w.evolveFx = Math.max(0, w.evolveFx - dt)
      for (let i = 0; i < 4; i++) w.cds[i] = Math.max(0, w.cds[i] - dt)
      w.aimT -= dt
      if (w.catching) continue
      if (w.state === 'weak') {
        w.weakT -= dt
        if (w.weakT <= 0) this.removeWild(w)
        continue
      }
      if (this.zone.outside(w.x, w.y)) {
        this.removeWild(w)
        continue
      }
      if (w.dash) {
        this.updateDash(w, dt)
        continue
      }
      let mx = 0, my = 0, speed = 1.1
      if (w.state === 'aggro' && w.aggro) {
        let t = w.aggro
        // Follow the trainer's new Pokémon if they swapped.
        if (t.fainted || (t.owner && t.owner.mon !== t)) t = t.owner && t.owner.alive && !t.owner.mon.fainted ? t.owner.mon : t
        w.aggroT -= dt
        const d = Math.hypot(t.x - w.x, t.y - w.y)
        if (t.fainted || !t.owner?.alive || d > 11 || Math.hypot(w.x - w.homeX, w.y - w.homeY) > 16 || w.aggroT <= 0) {
          w.aggro = null
          w.state = 'roam'
        } else {
          w.aggro = t
          const slot = this.bestSlot(w, d)
          const range = slot >= 0 ? w.moves[slot].range : w.moves[0].range
          if (d > range * 0.8) {
            mx = (t.x - w.x) / d
            my = (t.y - w.y) / d
          }
          speed = 2.2 + w.species.spe / 60
          w.thinkT -= dt
          if (w.thinkT <= 0) {
            w.thinkT = this.rng.range(0.35, 0.8)
            if (slot >= 0) this.useMove(w, slot, t)
          }
        }
      } else {
        w.thinkT -= dt
        if (w.thinkT <= 0) {
          w.thinkT = this.rng.range(1.5, 4)
          w.goalX = w.homeX + this.rng.range(-4, 4)
          w.goalY = w.homeY + this.rng.range(-4, 4)
          if (w.aggressive) {
            const near = this.trainers.find((tr) => tr.alive && !tr.mon.fainted && Math.hypot(tr.mon.x - w.x, tr.mon.y - w.y) < (w.legendary ? 5 : 3.5))
            if (near) {
              w.aggro = near.mon
              w.aggroT = 8
              w.state = 'aggro'
            }
          }
        }
        const d = Math.hypot(w.goalX - w.x, w.goalY - w.y)
        if (d > 0.3) {
          mx = (w.goalX - w.x) / d
          my = (w.goalY - w.y) / d
        }
      }
      w.mvx = mx
      w.mvy = my
      if (mx || my) {
        if (!this.tryMove(w, mx * speed * dt, my * speed * dt, 0.3)) w.thinkT = 0
        if (w.aimT <= 0) w.dir = dirOf(mx, my)
      }
      if (w.aimT > 0) w.dir = dirOf(w.aimX, w.aimY)
    }
    // Trainer mons tick flashes here too
    for (const tr of this.trainers)
      for (const m of tr.party) {
        m.flash = Math.max(0, m.flash - dt)
        m.evolveFx = Math.max(0, m.evolveFx - dt)
      }
  }

  /** Highest unlocked, ready move that reaches distance d (or -1). */
  bestSlot(m: Mon, d: number): number {
    for (let s = 3; s >= 0; s--) if (m.unlocked(s) && m.cds[s] <= 0 && m.moves[s].range + 0.3 >= d) return s
    return -1
  }

  private removeWild(w: Mon) {
    const i = this.wilds.indexOf(w)
    if (i >= 0) this.wilds.splice(i, 1)
    if (this.onScreen(w.x, w.y)) this.fx.push({ kind: 'poof', x: w.x, y: w.y - 0.4, t: 0, life: 0.4, color: '#ffffff' })
  }

  // ---------------- Projectiles & effects ----------------

  private updateProjectiles(dt: number) {
    for (const p of [...this.projs]) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      const t = this.world.at(Math.floor(p.x), Math.floor(p.y + 0.4))
      let dead = p.life <= 0 || t === T.TREE || t === T.ROCK || t === T.HOUSE
      if (!dead)
        for (const e of this.enemiesOf(p.src)) {
          if (Math.hypot(e.x - p.x, e.y - 0.45 - p.y) < (e.legendary ? 0.9 : 0.6)) {
            this.hit(p.src, e, p.move, p.mult)
            dead = true
            break
          }
        }
      if (dead) {
        this.projs.splice(this.projs.indexOf(p), 1)
        if (this.onScreen(p.x, p.y)) this.fx.push({ kind: 'poof', x: p.x, y: p.y, t: 0, life: 0.2, color: TYPE_COLOR[p.move.type], r: 0.4 })
      }
    }
  }

  private updateNovas(dt: number) {
    for (const n of [...this.novas]) {
      n.t -= dt
      if (n.t > 0) continue
      this.novas.splice(this.novas.indexOf(n), 1)
      for (const e of this.enemiesOf(n.src)) if (Math.hypot(e.x - n.x, e.y - n.y) < n.r) this.hit(n.src, e, n.move)
      this.fx.push({ kind: 'ring', x: n.x, y: n.y, t: 0, life: 0.35, color: TYPE_COLOR[n.move.type], r: n.r })
      for (let i = 0; i < 10; i++)
        this.fx.push({
          kind: 'spark', x: n.x, y: n.y - 0.3, t: 0, life: 0.5, color: TYPE_COLOR[n.move.type],
          vx: this.rng.range(-4, 4), vy: this.rng.range(-5, 0),
        })
    }
  }

  private updateFx(dt: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]
      f.t += dt
      if (f.vx !== undefined) {
        f.x += f.vx * dt
        f.y += (f.vy ?? 0) * dt
        f.vy = (f.vy ?? 0) + 6 * dt
      }
      if (f.t >= f.life) this.fx.splice(i, 1)
    }
    for (const it of this.items) it.bob += dt
  }

  // ---------------- Zone ----------------

  private pickNextZone() {
    const z = this.zone
    const ph = PHASES[Math.min(z.phase, PHASES.length - 1)]
    const slack = Math.max(0, (z.r - ph.r) * 0.75)
    let nx = z.x, ny = z.y
    for (let k = 0; k < 40; k++) {
      const a = this.rng.range(0, Math.PI * 2)
      const d = this.rng.range(0, slack)
      const cx = Math.max(10, Math.min(MAP - 10, z.x + Math.cos(a) * d))
      const cy = Math.max(10, Math.min(MAP - 10, z.y + Math.sin(a) * d))
      if (!this.world.blocked(cx, cy)) { nx = cx; ny = cy; break }
    }
    if (this.world.blocked(nx, ny)) {
      const i = this.world.nearestWalkable(Math.floor(nx), Math.floor(ny))
      nx = (i % MAP) + 0.5
      ny = Math.floor(i / MAP) + 0.5
    }
    z.nx = nx
    z.ny = ny
    z.nr = ph.r
    this.flow = this.world.flowTo(Math.floor(nx), Math.floor(ny))
  }

  private updateZone(dt: number) {
    const z = this.zone
    if (z.phase >= PHASES.length) return
    const ph = PHASES[z.phase]
    z.t += dt
    if (!z.shrinking) {
      if (z.t >= ph.wait) {
        z.shrinking = true
        z.t = 0
        z.fromX = z.x
        z.fromY = z.y
        z.fromR = z.r
        this.hooks.toast('De storm komt dichterbij!', '#d080ff')
      }
    } else {
      const k = Math.min(1, z.t / ph.shrink)
      z.x = z.fromX + (z.nx - z.fromX) * k
      z.y = z.fromY + (z.ny - z.fromY) * k
      z.r = z.fromR + (z.nr - z.fromR) * k
      if (k >= 1) {
        z.shrinking = false
        z.t = 0
        z.phase++
        if (z.phase < PHASES.length) this.pickNextZone()
      }
    }
  }

  // ---------------- Helpers ----------------

  tryMove(o: { x: number; y: number }, dx: number, dy: number, r: number): boolean {
    let moved = false
    if (dx) {
      const nx = o.x + dx
      if (!this.wall(nx, o.y, r)) { o.x = nx; moved = true }
    }
    if (dy) {
      const ny = o.y + dy
      if (!this.wall(o.x, ny, r)) { o.y = ny; moved = true }
    }
    return moved
  }

  private wall(x: number, y: number, r: number) {
    const w = this.world
    return w.blocked(x - r, y - r * 0.6) || w.blocked(x + r, y - r * 0.6) || w.blocked(x - r, y + r * 0.6) || w.blocked(x + r, y + r * 0.6)
  }

  onScreen(x: number, y: number) {
    return Math.abs(x - this.camX) < 14 && Math.abs(y - this.camY) < 12
  }

  /** Weakened wild Pokémon the trainer can catch with a normal ball. */
  catchable(tr: Trainer): Mon | null {
    let best: Mon | null = null, bd = 2.8
    for (const w of this.wilds) {
      if (w.state !== 'weak' || w.catching) continue
      const d = Math.min(Math.hypot(w.x - tr.x, w.y - tr.y), Math.hypot(w.x - tr.mon.x, w.y - tr.mon.y))
      if (d < bd) { bd = d; best = w }
    }
    return best
  }

  /** Best Master Ball target near the trainer. */
  masterTarget(tr: Trainer, range = 5.5): Mon | null {
    const order: Rarity[] = ['common', 'uncommon', 'rare', 'legendary']
    let best: Mon | null = null
    for (const w of this.wilds) {
      if (w.catching || Math.hypot(w.x - tr.x, w.y - tr.y) > range) continue
      if (!best || order.indexOf(w.rarity) > order.indexOf(best.rarity) || (w.rarity === best.rarity && w.level > best.level)) best = w
    }
    return best
  }
}

export function dirOf(x: number, y: number): Dir {
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}

export function dirVec(d: Dir): [number, number] {
  return d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : d === 'left' ? [-1, 0] : [1, 0]
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}
