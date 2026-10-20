import { both } from '../i18n'
import { Mon, type Trainer } from './entities'
import type { Game, ItemKind } from './game'
import { finalForm } from './boss'
import { preloadMon } from './sprites'
import { ARENA_C, DUEL_R } from './world'

/**
 * 1 vs 1: two trainers in a small arena, best of three rounds. Both partners
 * are fully evolved at Lv 50 with every move, so it's down to skill and the
 * match-up. Power-ups on three pads give a short edge; tall grass hides you;
 * after a while a ring closes in so nobody can hide forever.
 */

export const DUEL_LEVEL = 50
/** Rounds to win the match. */
export const DUEL_WINS = 2
/** Seconds into a round before the ring starts closing, and how long that takes. */
export const RING_AT = 40
const RING_SHRINK = 25
const RING_MIN = 2.5
/** Share of max HP per second outside the ring. */
const RING_DPS = 0.09
/** Pause after a knockout, and the countdown before the next round. */
const BREAK_TIME = 3
export const COUNT_TIME = 3
/** Power-ups: first ones a few seconds into a round, then again after a pickup. */
const PAD_FIRST = 6
const PAD_AGAIN = 14
/** Power-up length (seconds) and strength. */
export const BUFF_TIME = 10
export const BUFF = { atk: 1.35, def: 0.6, spd: 1.3, cd: 0.75, heal: 0.4 }
/** Hits at Lv 50 are big: this keeps a round long enough to play. */
export const DUEL_DMG = 0.55

export const POWER_UPS: ItemKind[] = ['xatk', 'xspd', 'xdef', 'heal']
export const isPowerUp = (k: ItemKind) => POWER_UPS.includes(k)

export type DuelPhase = 'intro' | 'fight' | 'break' | 'count' | 'over'

export interface DuelState {
  round: number
  phase: DuelPhase
  /** Seconds left in a break or countdown. */
  t: number
  /** Seconds into the current round. */
  roundT: number
  /** Per pad: seconds until a power-up appears (0 = one is there). */
  pads: number[]
  /** Winner of the last round (trainer id), for the banner. */
  lastWin: number
  /** When the deciding round ended (match time). */
  endAt: number
}

/** What clients need for the HUD: round, phase, timers. */
export interface DuelView {
  round: number
  phase: DuelPhase
  t: number
  roundT: number
  pads: number[]
}

/** Host and solo: turn the match into a duel. */
export function setupDuel(g: Game) {
  const w = g.world
  g.trainers.forEach((tr, i) => {
    tr.party = tr.party.slice(0, 1).map((m) => {
      const mon = new Mon(finalForm(m.species.id), DUEL_LEVEL, m.shiny)
      mon.owner = tr
      mon.awaken = m.awaken
      if (mon.awaken) mon.legendary = false
      mon.hp = mon.maxHp
      preloadMon(mon.species.id, mon.shiny)
      return mon
    })
    tr.active = 0
    tr.potions = tr.revives = tr.masterBalls = 0
    const [x, y] = w.spawns[i % 2]
    tr.x = x
    tr.y = y
    tr.dir = i % 2 ? 'down' : 'up'
    tr.mon.x = x
    tr.mon.y = y + (i % 2 ? -0.8 : 0.8)
  })
  g.total = 2
  g.duel = { round: 1, phase: 'intro', t: 0, roundT: 0, pads: w.pads.map(() => PAD_FIRST), lastWin: 0, endAt: 0 }
  resetRing(g)
}

/** No ring at the start of a round: it only appears (at the arena's edge) once it starts closing. */
function resetRing(g: Game) {
  const z = g.zone
  z.x = z.nx = z.fromX = ARENA_C
  z.y = z.ny = z.fromY = ARENA_C
  z.r = z.fromR = z.nr = RING_OFF
  z.phase = 0
  z.t = 0
  z.shrinking = false
}
/** Far outside the arena: the ring is out of sight. */
const RING_OFF = 60

/** Frozen in place: between rounds and during the countdown. */
export const duelFrozen = (g: Game) => !!g.duel && g.duel.phase !== 'fight'

// ---------------------------------------------------------------- host tick

export function updateDuel(g: Game, dt: number) {
  const d = g.duel!
  if (d.phase === 'intro') {
    // The drop-in intro just ended (GO!)
    d.phase = 'fight'
    d.roundT = 0
    return
  }
  if (d.phase === 'over') return
  if (d.phase === 'break' || d.phase === 'count') {
    const before = Math.ceil(d.t)
    d.t -= dt
    if (d.phase === 'count' && Math.ceil(d.t) !== before && d.t > 0) for (const v of g.viewers) v.sfx('countdown', false)
    if (d.t > 0) return
    if (d.phase === 'break') return startCountdown(g, d)
    d.phase = 'fight'
    d.roundT = 0
    for (const v of g.viewers) {
      v.sfx('countdown', true)
      v.hooks.banner({ kind: 'go', title: both('FIGHT!', 'VECHTEN!') })
    }
    return
  }

  // Fighting
  d.roundT += dt
  for (const tr of g.trainers) {
    tr.atkT = Math.max(0, tr.atkT - dt)
    tr.spdT = Math.max(0, tr.spdT - dt)
    tr.defT = Math.max(0, tr.defT - dt)
  }
  updateRing(g, d, dt)
  // Power-up pads
  g.world.pads.forEach((p, i) => {
    if (d.pads[i] <= 0) return
    d.pads[i] -= dt
    if (d.pads[i] > 0) return
    d.pads[i] = 0
    // The middle pad is the one worth fighting over: mostly X Attack or a heal
    const pool: ItemKind[] = i === 0 ? ['xatk', 'xatk', 'heal', 'heal', 'xdef', 'xspd'] : POWER_UPS
    const kind = pool[Math.floor(g.rng.next() * pool.length)]
    g.items.push({ x: p.x, y: p.y, kind, bob: 0 })
    g.soundAt(p.x, p.y, 'spawnChime', [], { range: 30 })
    g.vfx.mark(p.x, p.y)
    g.vfx.ring(p.x, p.y, 1.4, '#ffe060', 0.5, 4)
  })
}

function updateRing(g: Game, d: DuelState, dt: number) {
  const z = g.zone
  if (d.roundT < RING_AT) {
    z.t = d.roundT
    return
  }
  if (!z.shrinking && z.phase === 0) {
    z.shrinking = true
    z.t = 0
    z.r = z.fromR = DUEL_R + 0.5
    z.nr = RING_MIN
    for (const v of g.viewers) {
      v.hooks.banner({ kind: 'storm', title: both('The ring is closing!', 'De ring trekt samen!'), sub: both('Stay inside the white circle', 'Blijf binnen de witte cirkel'), color: '#c080ff', voice: 'storm' })
      v.hooks.feed(both('🌀 The ring is closing in! Stay inside', '🌀 De ring trekt samen! Blijf binnen'), { kind: 'storm' })
    }
  }
  if (z.shrinking) {
    z.t += dt
    const k = Math.min(1, z.t / RING_SHRINK)
    z.r = z.fromR + (RING_MIN - z.fromR) * k
    if (k >= 1) {
      z.shrinking = false
      z.phase = 1
    }
  }
}

/** Ring damage per second (share of max HP). */
export const ringDps = () => RING_DPS

/** Host and solo: a partner fainted. The other trainer takes the round. */
export function duelDown(g: Game, tr: Trainer) {
  const d = g.duel!
  // A double knockout in the same moment: the first one counts
  if (d.phase !== 'fight') return
  const win = g.trainers.find((t) => t !== tr)!
  win.kos++
  d.lastWin = win.id
  for (const v of g.viewers) {
    v.hooks.feed(both(`⚔ ${win === v.tr ? 'You' : win.name} won round ${d.round}`, `⚔ ${win === v.tr ? 'Jij' : win.name} wint ronde ${d.round}`), { trainer: win.def.sprite, kind: 'ko' })
  }
  if (win.kos >= DUEL_WINS) return endDuel(g, win, tr)
  d.phase = 'break'
  d.t = BREAK_TIME
  for (const v of g.viewers) {
    const mine = v.tr === win
    v.hooks.banner(mine
      ? { kind: 'ko', title: both(`Round ${d.round}: yours!`, `Ronde ${d.round}: voor jou!`), sub: score(g, v.tr), trainer: tr.def.sprite, voice: 'ko' }
      : { kind: 'fainted', title: both(`${tr.mon.name} fainted!`, `${tr.mon.name} is verslagen!`), sub: score(g, v.tr), mon: tr.mon.species.id })
  }
  g.soundAt(tr.x, tr.y, 'ko', [], { owners: [tr, win], range: 30 })
}

/** "1 - 0" from this viewer's side. */
function score(g: Game, me: Trainer) {
  const other = g.trainers.find((t) => t !== me)
  return `${me.kos} - ${other?.kos ?? 0}`
}

function startCountdown(g: Game, d: DuelState) {
  d.round++
  d.phase = 'count'
  d.t = COUNT_TIME
  resetRound(g, d)
  for (const v of g.viewers) {
    v.hooks.banner({ kind: 'go', title: both(`ROUND ${d.round}`, `RONDE ${d.round}`), sub: score(g, v.tr) })
    v.sfx('countdown', false)
  }
}

/** Fresh start: full HP, back to the spawns, nothing left flying around. */
function resetRound(g: Game, d: DuelState) {
  g.projs = []
  g.novas = []
  g.hazards = []
  g.items = g.items.filter((it) => !isPowerUp(it.kind))
  d.pads = g.world.pads.map(() => PAD_FIRST)
  g.trainers.forEach((tr, i) => {
    const [x, y] = g.world.spawns[i % 2]
    tr.x = x
    tr.y = y
    tr.tpN++
    tr.vx = tr.vy = tr.slideX = tr.slideY = 0
    tr.dir = i % 2 ? 'down' : 'up'
    tr.atkT = tr.spdT = tr.defT = 0
    tr.revealT = 0
    const m = tr.mon
    m.hp = m.maxHp
    m.hpLag = m.maxHp
    m.cds = m.cds.map(() => 0)
    m.dash = null
    m.charging = null
    m.frozenT = 0
    m.tintT = 0
    m.combatT = 99
    m.revealT = 0
    m.x = x
    m.y = y + (i % 2 ? -0.8 : 0.8)
    g.sendOut(tr, tr.active)
    g.vfx.ring(m.x, m.y - 0.2, 1.6, '#ffffff', 0.5, 6)
  })
  resetRing(g)
}

function endDuel(g: Game, win: Trainer, lose: Trainer) {
  const d = g.duel!
  d.phase = 'over'
  d.endAt = g.time
  win.place = 1
  lose.place = 2
  lose.alive = false
  lose.diedAt = g.time
  for (const v of g.viewers) {
    const won = v.tr === win
    v.hooks.banner(won
      ? { kind: 'win', title: both('VICTORY!', 'GEWONNEN!'), sub: both(`You win the duel ${score(g, v.tr)}`, `Je wint het duel met ${score(g, v.tr)}`), trainer: win.def.sprite, voice: 'win' }
      : { kind: 'fainted', title: both('Defeated', 'Verloren'), sub: both(`${win.name} wins ${score(g, win)}`, `${win.name} wint met ${score(g, win)}`), trainer: win.def.sprite, voice: 'lose' })
    v.endT = 2.4
  }
  g.soundAt(lose.x, lose.y, 'ko', [], { owners: [lose, win], range: 30 })
}

/** Picked up a power-up. Returns false if it isn't one. */
export function applyPowerUp(g: Game, tr: Trainer, kind: ItemKind): boolean {
  if (!isPowerUp(kind)) return false
  const d = g.duel
  // Its pad starts counting down to the next one
  if (d) g.world.pads.forEach((p, i) => {
    if (d.pads[i] === 0 && Math.hypot(p.x - tr.x, p.y - tr.y) < 1.5 && !g.items.some((it) => Math.hypot(it.x - p.x, it.y - p.y) < 0.2)) d.pads[i] = PAD_AGAIN
  })
  const v = g.vOf(tr)
  const m = tr.mon
  const label = {
    xatk: { t: both('X Attack! Your moves hit harder', 'X Attack! Je aanvallen raken harder'), c: '#ff7050', ring: '#ff6040' },
    xspd: { t: both('X Speed! Faster on your feet, quicker moves', 'X Speed! Sneller lopen, sneller aanvallen'), c: '#60c0ff', ring: '#50b0ff' },
    xdef: { t: both('X Defense! You take less damage', 'X Defense! Je krijgt minder schade'), c: '#ffd040', ring: '#ffd040' },
    heal: { t: both('Hyper Potion! HP restored', 'Hyper Potion! HP hersteld'), c: '#80f080', ring: '#80f080' },
  }[kind as 'xatk' | 'xspd' | 'xdef' | 'heal']
  if (kind === 'xatk') tr.atkT = BUFF_TIME
  else if (kind === 'xspd') tr.spdT = BUFF_TIME
  else if (kind === 'xdef') tr.defT = BUFF_TIME
  else if (!m.fainted) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BUFF.heal)
  v?.sfx('item', kind === 'heal' ? 'pickupPotion' : 'pickupSurge')
  v?.hooks.toast(label.t, label.c)
  g.vfx.ring(m.x, m.y - 0.3, 1.8, label.ring, 0.5, 6)
  g.vfx.burst(m.x, m.y - 0.6, { n: 16, speed: 5, cols: ['#ffffff', label.ring], shape: 'star', add: true, s0: 2.5, s1: 0.5, life: 0.6 })
  for (const o of g.viewers) if (o !== v) o.hooks.feed(both(`${tr.name} grabbed ${ITEM_EN[kind]}`, `${tr.name} pakte ${ITEM_EN[kind]}`), { kind: 'drop' })
  return true
}

const ITEM_EN: Partial<Record<ItemKind, string>> = { xatk: 'X Attack', xspd: 'X Speed', xdef: 'X Defense', heal: 'a Hyper Potion' }

/** Damage multiplier from power-ups (attacker's X Attack, target's X Defense). */
export function buffDamage(src: Mon, tgt: Mon) {
  return (src.owner && src.owner.atkT > 0 ? BUFF.atk : 1) * (tgt.owner && tgt.owner.defT > 0 ? BUFF.def : 1)
}

export function duelView(g: Game): DuelView {
  const d = g.duel!
  return { round: d.round, phase: d.phase, t: d.t, roundT: d.roundT, pads: d.pads }
}
