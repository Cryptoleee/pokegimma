import { RAID_ROLES, ROLE_DEF, roleFor, UPGRADES, type RaidRole } from '../data/perks'
import { roleOf } from '../data/roles'
import { both, inBoth, L } from '../i18n'
import type { Mon, Trainer } from './entities'
import type { Game } from './game'

/**
 * Raid roles and perks in play (see data/perks.ts for what they are). The host
 * owns all of it: the pick, the stats, the ability and its effect. A client
 * reads its own role, perks and cooldown from the snapshot and only uses the
 * walking speed and move cooldowns itself (it predicts its own movement).
 */

/** Seconds to pick before the game picks for you (the match never waits). */
export const PICK_TIME = 25
/** Taunt and healing wave reach (tiles). */
const TAUNT_R = 8
const WAVE_R = 7

const has = (tr: Trainer, id: string) => tr.perks.filter((p) => p === id).length

// ---------------------------------------------------------------- what a role and its perks do

/** Damage your Pokémon deals. */
export function dealtMul(tr: Trainer | null) {
  if (!tr || tr.rr !== 'striker') return 1
  return (1.2 + 0.1 * has(tr, 'dmg_up')) * (tr.abT > 0 ? 1.4 : 1)
}
/** Damage your Pokémon takes. */
export function takenMul(tr: Trainer | null) {
  if (!tr || tr.rr !== 'tank') return 1
  return (0.85 - 0.1 * has(tr, 'tank_wall')) * (tr.abT > 0 ? 0.5 : 1)
}
/** How angry your damage makes a foe (a tank's counts for much more: foes pick you more often, not always). */
export const threatMul = (tr: Trainer) => (tr.rr === 'tank' ? 2.5 * (has(tr, 'tank_aggro') ? 1.6 : 1) : 1)
export const speedMul = (tr: Trainer) => (has(tr, 'any_speed') ? 1.1 : 1)
/** Move cooldowns. */
export const cdMul = (tr: Trainer | null) => (tr && has(tr, 'dmg_cd') ? 0.88 : 1)
export const potionHeal = (tr: Trainer) => (has(tr, 'any_potion') ? 0.75 : 0.5)
const hpMulOf = (tr: Trainer) => (tr.rr === 'tank' ? 1.3 + 0.15 * has(tr, 'tank_hp') : 1)
/** The healer's aura: how far it reaches (tiles). Everyone draws it. */
export const auraR = (tr: Trainer) => 4.5 + 1.5 * has(tr, 'heal_aura')
export const abilityCd = (tr: Trainer) => (tr.rr ? ROLE_DEF[tr.rr].cd - (tr.rr === 'tank' ? 4 * has(tr, 'tank_aggro') : tr.rr === 'healer' ? 4 * has(tr, 'heal_wave') : 0) : 0)
const abilityDur = (tr: Trainer) => (tr.rr === 'tank' ? 4 + 2 * has(tr, 'tank_wall') : tr.rr === 'striker' ? 6 + 3 * has(tr, 'dmg_fury') : 0.9)

/** Max HP follows the tank's bonus (the bar keeps its share). */
function applyHp(tr: Trainer) {
  const k = hpMulOf(tr)
  for (const m of tr.party) {
    if (m.hpMul === k) continue
    const share = m.hp / m.maxHp
    m.hpMul = k
    m.hp = Math.round(share * m.maxHp)
  }
}

// ---------------------------------------------------------------- picking

/** The start of a raid: choose your role. */
export function offerRole(tr: Trainer) {
  if (!tr.human) return
  tr.pick = { kind: 'role', opts: [...RAID_ROLES], t: PICK_TIME }
}

/** A room cleared: one upgrade out of three (from your role, or for anyone). */
export function offerUpgrade(tr: Trainer) {
  if (!tr.human || !tr.rr || tr.pick) return
  const pool = UPGRADES.filter((u) => (u.role === tr.rr || u.role === 'any') && has(tr, u.id) < u.max)
  const mine = pool.filter((u) => u.role === tr.rr).sort(() => Math.random() - 0.5)
  const any = pool.filter((u) => u.role === 'any').sort(() => Math.random() - 0.5)
  // Two from your role (when there are), one for anyone
  const opts = [...mine.slice(0, 2), ...any.slice(0, 1)]
  for (const u of [...mine.slice(2), ...any.slice(1)]) if (opts.length < 3) opts.push(u)
  if (!opts.length) return
  tr.pick = { kind: 'up', opts: opts.map((u) => u.id), t: PICK_TIME }
}

/** Host: someone picked (or ran out of time: the first card, or the role their partner suits). */
export function choose(g: Game, tr: Trainer, i: number) {
  const pk = tr.pick
  if (!pk) return
  tr.pick = null
  const v = g.vOf(tr)
  if (pk.kind === 'role') {
    const role = (pk.opts[i] ?? roleFor(roleOf(tr.mon.species.id))) as RaidRole
    tr.rr = role
    tr.abCd = 2
    applyHp(tr)
    const d = ROLE_DEF[role]
    g.vfx.ring(tr.mon.x, tr.mon.y - 0.2, 2.2, d.color, 0.6, 7)
    for (const o of g.viewers) o.hooks.feed(inBoth(() => `${d.icon} ${tr.name}: ${d.name()}`), { kind: 'info' })
    v?.sfx('loot')
    return
  }
  const id = pk.opts[i] ?? pk.opts[0]
  tr.perks.push(id)
  if (id === 'any_potion') tr.potions++
  if (id === 'any_life') tr.lives++
  applyHp(tr)
  v?.sfx('loot')
}

// ---------------------------------------------------------------- the ability

/** Host: fire your role's ability. False while it recharges (or you have no role yet). */
export function ability(g: Game, tr: Trainer): boolean {
  const m = tr.mon
  if (!tr.rr || tr.abCd > 0 || !tr.alive || m.fainted) return false
  tr.abCd = abilityCd(tr)
  tr.abT = abilityDur(tr)
  const d = ROLE_DEF[tr.rr]
  if (tr.rr === 'tank') {
    // Every foe close by turns on you
    for (const w of g.wilds) {
      if (!w.foe || w.fainted || Math.hypot(w.x - m.x, w.y - m.y) > TAUNT_R) continue
      tauntOne(w, tr)
      w.idle = false
    }
    g.vfx.ring(m.x, m.y - 0.2, TAUNT_R, d.color, 0.6, 10)
    g.vfx.ring(m.x, m.y - 0.2, TAUNT_R * 0.5, '#ffffff', 0.4, 6)
    g.vfx.shakeBy(4)
    g.callout(m, both('Over here!', 'Hierheen!'), d.color)
  } else if (tr.rr === 'healer') {
    const heal = 0.3 + 0.2 * has(tr, 'heal_wave')
    for (const o of g.trainers) {
      const om = o.mon
      if (!o.alive || om.fainted || Math.hypot(om.x - m.x, om.y - m.y) > WAVE_R) continue
      om.hp = Math.min(om.maxHp, om.hp + om.maxHp * heal)
      om.frozenT = 0
      g.addFxPublic({ kind: 'heal', x: om.x, y: om.y - 0.5, t: 0, life: 0.8, color: '#80f0a0' })
      g.vfx.burst(om.x, om.y - 0.6, { n: 12, speed: 3, dir: -Math.PI / 2, spread: 1.2, cols: ['#ffffff', '#a0ffb0', '#40d060'], shape: 'star', add: true, s0: 3, s1: 0.5, life: 0.6 })
    }
    g.vfx.ring(m.x, m.y - 0.2, WAVE_R, d.color, 0.7, 10)
    g.vfx.glow(m.x, m.y - 0.3, 120, d.color, 0.5)
  } else {
    g.vfx.ring(m.x, m.y - 0.2, 2.6, d.color, 0.5, 8)
    g.vfx.burst(m.x, m.y - 0.6, { n: 20, speed: 5, dir: -Math.PI / 2, spread: 1, cols: ['#ffffff', '#ffb070', '#ff5030'], shape: 'flame', add: true, s0: 4, s1: 1, life: 0.6 })
    g.callout(m, inBoth(() => d.ability() + '!'), d.color)
  }
  if (tr.rr === 'healer') g.soundAt(m.x, m.y, 'heal', [], { range: 20 })
  else g.soundAt(m.x, m.y, 'boss', ['charge', tr.rr === 'tank' ? 'earthpower' : 'flamethrower', 0.5, 0.4], { range: 20 })
  for (const o of g.viewers) if (o.tr !== tr) o.hooks.feed(inBoth(() => `${d.icon} ${tr.name}: ${d.ability()}`), { kind: 'info' })
  return true
}

function tauntOne(w: Mon, tr: Trainer) {
  w.threat ??= new Map()
  let top = 0
  for (const v of w.threat.values()) top = Math.max(top, v)
  w.threat.set(tr, top + 200)
}

// ---------------------------------------------------------------- every frame (host)

export function perkTick(g: Game, dt: number) {
  for (const tr of g.trainers) {
    if (!tr.human) continue
    if (tr.pick) {
      tr.pick.t -= dt
      if (tr.pick.t <= 0) choose(g, tr, tr.pick.kind === 'role' ? RAID_ROLES.indexOf(roleFor(roleOf(tr.mon.species.id))) : 0)
    }
    if (!tr.rr) continue
    tr.abCd = Math.max(0, tr.abCd - dt)
    tr.abT = Math.max(0, tr.abT - dt)
    const m = tr.mon
    if (!tr.alive || m.fainted) continue
    // Fury: your moves recharge twice as fast
    if (tr.rr === 'striker' && tr.abT > 0) for (let i = 0; i < 4; i++) m.cds[i] = Math.max(0, m.cds[i] - dt)
    // Taunt: foes close by stay on you while it lasts
    if (tr.rr === 'tank' && tr.abT > 0)
      for (const w of g.wilds) if (w.foe && !w.fainted && !w.idle && Math.hypot(w.x - m.x, w.y - m.y) < TAUNT_R) tauntOne(w, tr)
    // The healing aura: you and everyone in it, a little every second
    if (tr.rr === 'healer') {
      const r = auraR(tr), per = 0.015 + 0.01 * has(tr, 'heal_pow')
      for (const o of g.trainers) {
        const om = o.mon
        if (!o.alive || om.fainted || om.hp >= om.maxHp || Math.hypot(om.x - m.x, om.y - m.y) > r) continue
        om.hp = Math.min(om.maxHp, om.hp + om.maxHp * per * dt)
      }
    }
  }
}

/** For the HUD: the name of what's on offer. */
export const pickTitle = (kind: 'role' | 'up') => (kind === 'role' ? L('Choose your role', 'Kies je rol') : L('Room cleared · pick an upgrade', 'Kamer veroverd · kies een upgrade'))
