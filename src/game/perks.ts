import { RAID_ROLES, ROLE_DEF, roleFor, UPGRADES, type RaidRole } from '../data/perks'
import { roleOf } from '../data/roles'
import { both, inBoth, L } from '../i18n'
import type { Mon, Trainer } from './entities'
import type { Game } from './game'
import { respawnAt } from './dungeon'

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

const has = (tr: Trainer, id: string) => (tr.perks.includes(id) ? 1 : 0)

// ---------------------------------------------------------------- what a role and its perks do

/** A healer close enough that you're in their aura (and they're up). */
function healerOver(g: Game, m: Mon, perk?: string) {
  for (const o of g.trainers) {
    if (o.rr !== 'healer' || !o.alive || o.mon.fainted || (perk && !has(o, perk))) continue
    if (Math.hypot(o.mon.x - m.x, o.mon.y - m.y) <= auraR(o)) return o
  }
  return null
}

/** Damage a Pokémon deals (to tgt). */
export function dealtMul(g: Game, src: Mon, tgt: Mon) {
  const tr = src.owner
  if (!tr) return 1
  let k = 1 + 0.05 * has(tr, 'any_sharp')
  if (tr.rr === 'striker') {
    k *= 1.2 + 0.1 * (has(tr, 'power1') + has(tr, 'power2'))
    if (tr.abT > 0) k *= 1.4
    if (has(tr, 'hunter1') && (tgt.boss || tgt.foe >= 2)) k *= 1.25
    if (has(tr, 'power3') && Math.random() < 0.15) k *= 2
  }
  if (tr.blessT > 0) k *= 1.25
  if (healerOver(g, src, 'bless1')) k *= 1.08
  return k
}
/** Damage a player's Pokémon takes. */
export function takenMul(g: Game, m: Mon) {
  const tr = m.owner
  if (!tr) return 1
  let k = 1 - 0.05 * has(tr, 'any_iron')
  if (tr.rr === 'tank') {
    k *= 0.85 - 0.1 * has(tr, 'bulwark2')
    if (tr.abT > 0) k *= 0.5
    if (has(tr, 'bulwark3') && m.hp < m.maxHp * 0.3) k *= 0.6
  }
  if (healerOver(g, m, 'aura3')) k *= 0.9
  return k
}
/** A tank's thorns: a foe that hit them gets some of it back. */
export function thorns(g: Game, tgt: Mon, src: Mon | null, dmg: number) {
  const tr = tgt.owner
  if (!tr || tr.rr !== 'tank' || !src || (!src.foe && !src.boss) || src.fainted) return
  const k = has(tr, 'thorns2') ? 0.3 : has(tr, 'thorns1') ? 0.15 : 0
  if (k > 0) g.applyDamage(src, dmg * k, tgt, true)
}
/** After a hit lands: a healer's lifelink, a striker's bloodlust. */
export function onDealt(g: Game, src: Mon, dmg: number) {
  const tr = src.owner
  if (!tr || dmg <= 0) return
  if (tr.rr === 'healer' && has(tr, 'bless2')) {
    let low: Mon | null = null, lk = 1
    for (const o of g.trainers) {
      if (!o.alive || o.mon.fainted) continue
      const k = o.mon.hp / o.mon.maxHp
      if (k < lk) { lk = k; low = o.mon }
    }
    if (low) low.hp = Math.min(low.maxHp, low.hp + dmg * 0.15)
  }
  if (tr.rr === 'striker' && tr.abT > 0 && has(tr, 'fury3')) src.hp = Math.min(src.maxHp, src.hp + src.maxHp * 0.03)
}
/** How angry your damage makes a foe (a tank's counts for much more: foes pick you more often, not always). */
export const threatMul = (tr: Trainer) => (tr.rr === 'tank' ? 2.5 * (has(tr, 'provoke1') ? 1.6 : 1) : 1)
export const speedMul = (tr: Trainer) => (has(tr, 'any_speed') ? 1.1 : 1)
/** Move cooldowns (slot 3 is the ultimate). */
export const cdMul = (tr: Trainer | null, slot = 0) => (tr ? (has(tr, 'hunter2') ? 0.88 : 1) * (slot === 3 && has(tr, 'hunter3') ? 0.7 : 1) : 1)
export const potionHeal = (tr: Trainer) => (has(tr, 'any_potion') ? 0.75 : 0.5)
const hpMulOf = (tr: Trainer) => (tr.rr === 'tank' ? 1.3 + 0.15 * has(tr, 'bulwark1') : 1)
/** The healer's aura: how far it reaches (tiles). Everyone draws it. */
export const auraR = (tr: Trainer) => 4.5 + 1.5 * has(tr, 'aura1')
export const abilityCd = (tr: Trainer) => (tr.rr ? ROLE_DEF[tr.rr].cd - (tr.rr === 'tank' ? 4 * has(tr, 'provoke2') : tr.rr === 'healer' ? 5 * has(tr, 'wave2') : 5 * has(tr, 'fury2')) : 0)
const abilityDur = (tr: Trainer) => (tr.rr === 'tank' ? 4 : tr.rr === 'striker' ? 6 + 3 * has(tr, 'fury1') : 0.9)
const tauntR = (tr: Trainer) => TAUNT_R + 2 * has(tr, 'provoke2')

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

/**
 * A room cleared: three different upgrades. What can come up: the next step of
 * each of your role's paths, and the upgrades for anyone you don't have yet.
 * Usually two path steps and one for anyone; never the same three you just
 * passed on (as far as there's anything else).
 */
export function offerUpgrade(tr: Trainer) {
  if (!tr.human || !tr.rr || tr.pick) return
  const next = UPGRADES.filter((u) => u.role === tr.rr && !has(tr, u.id) && (u.tier === 1 || has(tr, u.id.slice(0, -1) + (u.tier! - 1))))
  const any = UPGRADES.filter((u) => u.role === 'any' && !has(tr, u.id))
  const fresh = (l: typeof UPGRADES) => {
    const notLast = l.filter((u) => !tr.lastOffer.includes(u.id)).sort(() => Math.random() - 0.5)
    const last = l.filter((u) => tr.lastOffer.includes(u.id)).sort(() => Math.random() - 0.5)
    return [...notLast, ...last]
  }
  const a = fresh(next), b = fresh(any)
  const opts = [...a.slice(0, 2), ...b.slice(0, 1)]
  for (const u of [...a.slice(2), ...b.slice(1)]) if (opts.length < 3) opts.push(u)
  if (!opts.length) return
  tr.lastOffer = opts.map((u) => u.id)
  tr.pick = { kind: 'up', opts: tr.lastOffer, t: PICK_TIME }
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
  if (id === 'any_pack') {
    tr.potions++
    tr.revives++
    tr.ethers++
  }
  if (id === 'any_life') tr.lives = Math.min(tr.lives + 1, (g.raid?.dg?.def.lives ?? 3) + 1)
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
    // Every foe close by turns on you (a shield bash hits them too)
    const r = tauntR(tr)
    for (const w of [...g.wilds]) {
      // Packs still waiting stay put (a taunt isn't a pull)
      if (!w.foe || w.fainted || w.idle || Math.hypot(w.x - m.x, w.y - m.y) > r) continue
      tauntOne(w, tr)
      if (has(tr, 'thorns3')) g.applyDamage(w, m.maxHp * 0.2, m)
    }
    if (has(tr, 'provoke3')) {
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.2)
      g.addFxPublic({ kind: 'heal', x: m.x, y: m.y - 0.5, t: 0, life: 0.7, color: '#80f0a0' })
    }
    g.vfx.ring(m.x, m.y - 0.2, r, d.color, 0.6, 10)
    g.vfx.ring(m.x, m.y - 0.2, r * 0.5, '#ffffff', 0.4, 6)
    g.vfx.shakeBy(4)
    g.callout(m, both('Over here!', 'Hierheen!'), d.color)
  } else if (tr.rr === 'healer') {
    const heal = 0.3 + 0.2 * has(tr, 'wave1')
    for (const o of g.trainers) {
      const om = o.mon
      // Lifeline: a teammate who is down close by is back on their feet, next to you
      if (has(tr, 'wave3') && o !== tr && o.alive && om.fainted && o.respawnT > 0 && Math.hypot(om.x - m.x, om.y - m.y) <= WAVE_R) {
        o.respawnT = 0
        respawnAt(g, o, [m.x, m.y])
        continue
      }
      if (!o.alive || om.fainted || Math.hypot(om.x - m.x, om.y - m.y) > WAVE_R) continue
      if (has(tr, 'bless3')) o.blessT = 4
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
    tr.blessT = Math.max(0, tr.blessT - dt)
    const m = tr.mon
    if (!tr.alive || m.fainted) continue
    // Fury: your moves recharge twice as fast
    if (tr.rr === 'striker' && tr.abT > 0) for (let i = 0; i < 4; i++) m.cds[i] = Math.max(0, m.cds[i] - dt)
    // Taunt: foes close by stay on you while it lasts
    if (tr.rr === 'tank' && tr.abT > 0)
      for (const w of g.wilds) if (w.foe && !w.fainted && !w.idle && Math.hypot(w.x - m.x, w.y - m.y) < tauntR(tr)) tauntOne(w, tr)
    // The healing aura: you and everyone in it, a little every second
    if (tr.rr === 'healer') {
      const r = auraR(tr), per = 0.015 + 0.01 * has(tr, 'aura2')
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
