import type { Game } from './game'
import type { Mon, Trainer } from './entities'
import { MAP } from './world'

/** Simple utility-style AI for rival trainers. */
export function botThink(g: Game, tr: Trainer, dt: number) {
  const b = tr.brain!
  b.thinkT -= dt
  if (b.thinkT <= 0) {
    b.thinkT = 0.18 + (1 - b.skill) * 0.35 + Math.random() * 0.1
    decide(g, tr)
  }
  steer(g, tr, dt)
}

function decide(g: Game, tr: Trainer) {
  const b = tr.brain!
  const m = tr.mon
  const z = g.zone
  const ratio = m.hp / m.maxHp

  // Upkeep
  if (!m.fainted && ratio < 0.35 && tr.potions > 0) g.usePotion(tr)
  if (tr.revives > 0 && tr.party.some((p) => p.fainted) && !nearestEnemyTrainer(g, tr, 7)) g.useRevive(tr)
  if (!m.fainted && ratio < 0.22 && Math.random() < b.skill) {
    let best = -1
    tr.party.forEach((p, i) => { if (i !== tr.active && !p.fainted && p.hp / p.maxHp > 0.5 && (best < 0 || p.level > tr.party[best].level)) best = i })
    if (best >= 0) g.switchTo(tr, best)
  }

  // Free catches
  const weak = g.catchable(tr)
  if (weak) g.throwBall(tr, weak, false)
  if (tr.masterBalls > 0) {
    const mt = g.masterTarget(tr, 5)
    if (mt && (mt.rarity === 'legendary' || mt.rarity === 'rare' || (mt.rarity === 'uncommon' && tr.masterBalls > 1))) g.throwBall(tr, mt, true)
  }

  // Storm first
  const distNext = Math.hypot(tr.x - z.nx, tr.y - z.ny)
  const needZone = z.outside(tr.x, tr.y) || (distNext > Math.max(1.5, z.nr - 2) && (z.shrinking || z.timeLeft < 15))

  // Threats and prey
  let foe = nearestEnemyTrainer(g, tr, 9)
  // Early game: leave other trainers alone unless they started it.
  if (foe && g.time < 45 && m.lastHitBy !== foe) foe = null
  let target: Mon | null = null
  b.mode = 'wander'
  if (foe && !m.fainted) {
    const e = foe.mon
    const er = e.hp / e.maxHp
    const provoked = m.lastHitBy === foe
    const fight = ratio > 0.45 && (provoked || m.level >= e.level - 1 || ratio > er + 0.3)
    if (fight) {
      target = e
      b.mode = 'fight'
    } else if (Math.hypot(e.x - tr.x, e.y - tr.y) < 6.5) {
      target = e
      b.mode = 'flee'
    }
  }
  if (b.mode === 'wander' && !m.fainted) {
    let best: Mon | null = null, bd = 7.5
    for (const w of g.wilds) {
      if (w.state === 'weak' || w.catching) continue
      const d = Math.hypot(w.x - tr.x, w.y - tr.y)
      const angry = w.aggro === m
      const doable = ratio > 0.45 && m.level + 4 >= w.level && (!w.legendary || m.level >= w.level - 6 || tr.party.length >= 4)
      if ((angry || doable) && d < bd) { bd = d; best = w }
    }
    if (best) {
      target = best
      b.mode = 'fight'
    }
  }
  if (b.mode === 'wander') {
    const w = g.wilds.find((w) => w.state === 'weak' && !w.catching && Math.hypot(w.x - tr.x, w.y - tr.y) < 8)
    if (w) {
      b.mode = 'goal'
      b.goalX = w.x
      b.goalY = w.y
    } else {
      let bestItem = null, bd = 10
      for (const it of g.items) {
        const d = Math.hypot(it.x - tr.x, it.y - tr.y)
        if (d < bd && Math.hypot(it.x - z.nx, it.y - z.ny) < z.r) { bd = d; bestItem = it }
      }
      if (bestItem) {
        b.mode = 'goal'
        b.goalX = bestItem.x
        b.goalY = bestItem.y
      }
    }
  }
  if (needZone && b.mode !== 'fight') b.mode = 'zone'
  if (needZone && b.mode === 'fight' && z.outside(tr.x, tr.y)) b.mode = 'zone'
  b.target = target

  // Attack whatever is in reach, even while running
  if (!m.fainted) {
    const t = target && b.mode !== 'flee' ? target : g.autoTarget(m, 6)
    if (t && Math.random() < 0.55 + b.skill * 0.45) {
      const slot = g.bestSlot(m, Math.hypot(t.x - m.x, t.y - m.y))
      if (slot >= 0) g.useMove(m, slot, t)
    }
  }

  // Wander goal upkeep
  if (b.mode === 'wander') {
    const reached = Math.hypot(b.goalX - tr.x, b.goalY - tr.y) < 1.2
    const outsideGoal = Math.hypot(b.goalX - z.nx, b.goalY - z.ny) > Math.max(2, z.nr * 0.85)
    if (reached || outsideGoal || b.stuckT > 0.8 || (b.goalX === 0 && b.goalY === 0)) {
      const [x, y] = g.world.randomWalkable((x, y) => Math.hypot(x - z.nx, y - z.ny) < Math.max(2, z.nr * 0.8) && Math.hypot(x - tr.x, y - tr.y) < 22)
      b.goalX = x
      b.goalY = y
      b.stuckT = 0
    }
  }
}

function nearestEnemyTrainer(g: Game, tr: Trainer, range: number): Trainer | null {
  let best: Trainer | null = null, bd = range
  for (const o of g.trainers) {
    if (o === tr || !o.alive || o.mon.fainted) continue
    const d = Math.hypot(o.mon.x - tr.x, o.mon.y - tr.y)
    if (d < bd) { bd = d; best = o }
  }
  return best
}

function steer(g: Game, tr: Trainer, dt: number) {
  const b = tr.brain!
  let vx = 0, vy = 0
  switch (b.mode) {
    case 'zone': {
      ;[vx, vy] = flowDir(g, tr.x, tr.y)
      break
    }
    case 'fight': {
      const t = b.target
      if (!t || t.fainted || t.state === 'weak') break
      const m = tr.mon
      const slot = g.bestSlot(m, 99)
      const range = slot >= 0 ? m.moves[slot].range : m.moves[0].range
      const want = Math.max(1.1, Math.min(range * 0.75, 4.5))
      const dx = t.x - tr.x, dy = t.y - tr.y
      const d = Math.hypot(dx, dy) || 1
      if (d > want + 0.7) { vx = dx / d; vy = dy / d }
      else if (d < want - 0.9) { vx = -dx / d; vy = -dy / d }
      else { vx = (-dy / d) * b.strafe * 0.7; vy = (dx / d) * b.strafe * 0.7 }
      if (Math.random() < dt * 0.6) b.strafe *= -1
      break
    }
    case 'flee': {
      const t = b.target
      if (!t) break
      const dx = tr.x - t.x, dy = tr.y - t.y
      const d = Math.hypot(dx, dy) || 1
      const [zx, zy] = flowDir(g, tr.x, tr.y)
      vx = dx / d + zx * 0.6
      vy = dy / d + zy * 0.6
      break
    }
    case 'goal':
    case 'wander': {
      const dx = b.goalX - tr.x, dy = b.goalY - tr.y
      const d = Math.hypot(dx, dy)
      if (d > 0.3) { vx = dx / d; vy = dy / d }
      break
    }
  }
  const l = Math.hypot(vx, vy)
  if (l > 0) { vx /= l; vy /= l }
  // Stuck detection: if we tried to move but did not get anywhere, slide sideways / re-plan.
  const moved = Math.hypot(tr.x - b.lastX, tr.y - b.lastY)
  b.lastX = tr.x
  b.lastY = tr.y
  if (l > 0 && moved < 0.02) b.stuckT += dt
  else b.stuckT = Math.max(0, b.stuckT - dt)
  if (b.stuckT > 0.4 && b.mode !== 'zone') {
    ;[vx, vy] = flowDir(g, tr.x, tr.y)
  }
  tr.vx = vx
  tr.vy = vy
}

/** Follow the BFS distance field toward the next safe zone. */
function flowDir(g: Game, x: number, y: number): [number, number] {
  const tx = Math.floor(x), ty = Math.floor(y)
  const f = g.flow
  const here = f[ty * MAP + tx]
  if (here <= 0) return here === 0 ? [g.zone.nx - x, g.zone.ny - y] : [MAP / 2 - x, MAP / 2 - y]
  let bx = 0, by = 0, bd = here
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue
    const v = f[ny * MAP + nx]
    if (v >= 0 && v < bd) { bd = v; bx = dx; by = dy }
  }
  // Aim for the next tile's centre so we don't clip corners.
  return [tx + bx + 0.5 - x, ty + by + 0.5 - y]
}
