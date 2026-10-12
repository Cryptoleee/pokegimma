import { SPECIES } from '../data/pokemon'
import { moveByName, movesetFor } from '../data/moves'
import { cry, sfx } from '../audio'
import { Mon, Trainer, type Dir, type WildState } from '../game/entities'
import type { Fx, Game, GameHooks, GameResult, ItemKind, Viewer } from '../game/game'
import { preloadMon } from '../game/sprites'
import type { Vfx } from '../game/vfx'
import type { Command, NetEvent, RosterEntry } from './protocol'
import { bossAttack, cloneMon, type Hazard } from '../game/boss'
import { BOSSES } from '../data/bosses'

/**
 * Multiplayer state sync. The host runs the real simulation; ~20 times a second
 * every client gets a snapshot (positions, HP, projectiles, zone...) plus the
 * events since the last one (effects, sounds, banners). Clients smooth the
 * positions and draw per-frame visuals (trails, footsteps) themselves.
 */

const DIRS: Dir[] = ['down', 'up', 'left', 'right']
const STATES: WildState[] = ['roam', 'aggro', 'weak']
const ITEMS: ItemKind[] = ['master', 'potion', 'candy', 'revive']
const SHAPES: Hazard['shape'][] = ['circle', 'cone', 'line', 'ring', 'grid']
const r2 = (v: number) => Math.round(v * 100) / 100
const r1 = (v: number) => Math.round(v * 10) / 10

// ---------------------------------------------------------------- host side

/** A player on another device, as the host sees them. */
export interface RemoteViewer extends Viewer {
  out: NetEvent[]
  /** Waiting for their answer to "your team is full". */
  pending: ((idx: number) => void) | null
  itemsSent: number
  ticks: number
}

export function remoteViewer(tr: Trainer): RemoteViewer {
  const out: NetEvent[] = []
  const v: RemoteViewer = {
    tr, local: false, camX: tr.x, camY: tr.y, endT: -1, done: false, out, pending: null, itemsSent: -1, ticks: 0,
    hooks: {
      toast: (t, c) => out.push(['hook', 'toast', t, c]),
      feed: (t, i) => out.push(['hook', 'feed', t, i]),
      banner: (b) => out.push(['hook', 'banner', b]),
      evolve: (_f, _t, _s, done) => done(),
      partyFull: (m, choose) => {
        v.pending = choose
        out.push(['full', m.species.id, m.level, m.shiny])
      },
      end: (r) => out.push(['hook', 'end', r]),
    },
    sfx: (name, ...a) => out.push(['sfx', name, ...a]),
    cry: (id, vol) => out.push(['cry', id, vol]),
    fx: (f) => out.push(['fx', f]),
  }
  return v
}

const RECORD = new Set(['burst', 'ring', 'glow', 'flare', 'decal', 'bolt', 'beam', 'pillar', 'shakeBy', 'flash', 'dimScreen', 'mark'])
const SCREEN = new Set(['shakeBy', 'flash', 'dimScreen'])

/**
 * Wraps the host's effect engine so every effect it spawns is also sent to the
 * remote players who can see it. Screen effects (shake, flash) are tagged with
 * the position of the effect before them so each player only feels nearby hits.
 */
export function recordVfx(g: Game) {
  const real = g.vfx
  let lx = 0, ly = 0
  g.vfx = new Proxy(real, {
    get(t, k: string) {
      const v = (t as unknown as Record<string, unknown>)[k]
      if (typeof v !== 'function') return v
      if (!RECORD.has(k)) return v.bind(t)
      return (...a: unknown[]) => {
        if (SCREEN.has(k)) {
          if (Math.hypot(lx - g.camX, ly - g.camY) < 11) v.apply(t, a)
        } else {
          lx = a[0] as number
          ly = a[1] as number
          if (k !== 'mark') v.apply(t, a)
        }
        if (g.vfxMute > 0) return
        for (const vw of g.viewers as RemoteViewer[]) {
          if (vw.local || Math.abs(lx - vw.camX) > 18 || Math.abs(ly - vw.camY) > 15) continue
          vw.out.push(['v', k, r2(lx), r2(ly), ...a.map((x) => (typeof x === 'number' ? r2(x) : x))])
        }
      }
    },
  }) as Vfx
}

/** Bare minimum for things far off-screen: who it is and roughly where. */
function farMon(m: Mon) {
  return { i: m.id, s: m.species.id, l: m.level, hp: r1(m.hp), x: r1(m.x), y: r1(m.y), ...(m.shiny ? { sh: 1 } : {}) }
}

function monState(m: Mon, own: boolean) {
  const o: Record<string, unknown> = {
    i: m.id, s: m.species.id, l: m.level, hp: r1(m.hp), x: r2(m.x), y: r2(m.y), d: DIRS.indexOf(m.dir),
    ax: r2(m.aimX), ay: r2(m.aimY), at: r2(m.aimT), rv: r2(m.revealT), st: STATES.indexOf(m.state),
  }
  if (m.shiny) o.sh = 1
  if (m.castT > 0) o.ct = r2(m.castT)
  if (m.flash > 0) o.fl = r2(m.flash)
  if (m.evolveFx > 0) o.ev = r2(m.evolveFx)
  if (m.tintT > 0) { o.tc = m.tintCol; o.tt = r2(m.tintT) }
  if (m.joltT > 0) o.jt = r2(m.joltT)
  if (m.liftT > 0) o.lt = r2(m.liftT)
  if (m.state === 'weak') o.wk = r1(m.weakT)
  if (m.claimT > 0 && m.claim) o.cl = [m.claim.id, r1(m.claimT)]
  if (m.catching) o.ca = 1
  if (m.boss) o.bs = m.bossMul
  if (m.frozenT > 0) o.fz = r2(m.frozenT)
  if (m.dash) o.ds = [r2(m.dash.vx), r2(m.dash.vy), r2(m.dash.t), m.dash.move.name, m.dash.strike ? 1 : 0]
  if (m.charging) o.ch = [m.charging.move.name, r2(m.charging.t), m.charging.total]
  if (own) {
    o.xp = r1(m.xp)
    o.cd = m.cds.map(r2)
    o.cb = r1(m.combatT)
  }
  return o
}

/** Everything one remote player needs to draw the match right now. */
export function snapshot(g: Game, v: RemoteViewer) {
  const me = v.tr
  // Full detail only for what's around this player's camera; far away things get the bare minimum.
  // Keeps each update small, so a host can serve a full lobby.
  const near = (x: number, y: number) => Math.abs(x - v.camX) < 20 && Math.abs(y - v.camY) < 15
  const mons: Record<string, unknown>[] = []
  const trs = g.trainers.map((tr) => {
    const m = tr.mon
    const close = near(tr.x, tr.y) || near(m.x, m.y)
    if (tr !== me) mons.push(close ? monState(m, false) : farMon(m))
    if (!close) return { i: tr.id, x: r1(tr.x), y: r1(tr.y), a: tr.alive ? 1 : 0, m: m.id, pl: tr.place }
    const o: Record<string, unknown> = {
      i: tr.id, x: r2(tr.x), y: r2(tr.y), d: DIRS.indexOf(tr.dir), f: tr.faceRight ? 1 : 0, w: r1(tr.walkT),
      a: tr.alive ? 1 : 0, rv: r2(tr.revealT), m: m.id, pl: tr.place,
    }
    if (g.raid) {
      o.lv = tr.lives
      o.rs = r1(tr.respawnT)
      o.bd = Math.round(tr.bossDmg)
    }
    if (tr.throwFx) {
      const t = tr.throwFx
      o.th = [r2(t.x), r2(t.y), r2(t.tx), r2(t.ty), r2(t.t), t.master ? 1 : 0]
    }
    return o
  })
  for (const m of me.party) mons.push(monState(m, true))
  // Wild Pokémon: nearby ones, plus legendaries (they're on everyone's minimap)
  const wilds = g.wilds.filter((w) => w.legendary || near(w.x, w.y))
  for (const w of wilds) mons.push(near(w.x, w.y) ? monState(w, false) : farMon(w))
  const z = g.zone
  const snap: Record<string, unknown> = {
    t: r2(g.time), tr: trs, m: mons, w: wilds.map((w) => w.id),
    p: g.projs.filter((p) => near(p.x, p.y)).map((p) => [r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), r2(p.life), p.move.name, r2(p.seed)]),
    n: g.novas.filter((n) => near(n.x, n.y)).map((n) => [r2(n.x), r2(n.y), r2(n.t), n.total, n.move.name, n.r, r2(n.sx), r2(n.sy)]),
    z: [r2(z.x), r2(z.y), r2(z.r), r2(z.nx), r2(z.ny), z.nr, z.phase, r2(z.t), z.shrinking ? 1 : 0, r2(z.fromX), r2(z.fromY), r2(z.fromR)],
    ev: g.events.map((e) => [e.id, e.kind === 'drop' ? 0 : 1, r2(e.x), r2(e.y), r1(e.t), e.total, e.species ?? 0]),
    hz: g.hazards.map((h) => [h.id, SHAPES.indexOf(h.shape), r2(h.x), r2(h.y), r2(h.ang), h.r, h.inner, h.width, r2(Math.max(0, h.t)), r2(h.total), h.type, h.both ? 1 : 0, h.atk, r2(h.vx), r2(h.vy), r2(h.dur)]),
    rv: g.raidView ? raidViewState(g) : undefined,
    me: {
      p: me.party.map((m) => m.id), ac: me.active, mb: me.masterBalls, po: me.potions, re: me.revives,
      k: me.kos, c: me.caught, sw: r2(me.swapCd), sp: me.spectate?.id ?? 0, dd: r1(me.diedAt),
    },
  }
  // Ground items rarely change: only send them when the count does (and now and then)
  v.ticks++
  if (g.items.length !== v.itemsSent || v.ticks % 40 === 0) {
    v.itemsSent = g.items.length
    snap.it = g.items.map((it) => [r2(it.x), r2(it.y), ITEMS.indexOf(it.kind)])
  }
  // Scoreboard numbers for every trainer, twice a second
  if (v.ticks % 10 === 1) snap.sb = g.trainers.map((tr) => [tr.id, tr.kos, tr.caught, Math.round(tr.dmg), Math.round(tr.bossDmg), tr.lives, tr.place, Math.round(tr.diedAt)])
  return snap
}

/** Find a Pokémon by id among every trainer's team and the wilds. */
export function monById(g: Game, id: number | undefined): Mon | null {
  if (id === undefined) return null
  for (const w of g.wilds) if (w.id === id) return w
  for (const tr of g.trainers) for (const m of tr.party) if (m.id === id) return m
  return null
}

/** Runs a remote player's command on the host. */
export function runCommand(g: Game, v: RemoteViewer, c: Command) {
  const tr = v.tr
  switch (c.t) {
    case 'in':
      v.camX = c.cx
      v.camY = c.cy
      if (!tr.alive) return
      // Trust the client's own position, but never through walls or across the map
      if (Math.hypot(c.x - tr.x, c.y - tr.y) < 4 && !g.world.blocked(c.x, c.y)) {
        tr.x = c.x
        tr.y = c.y
      }
      tr.dir = c.d
      tr.faceRight = !!c.f
      tr.walkT = c.w
      tr.netMoving = c.m
      return
    case 'move': {
      if (!tr.alive || g.introT > 0) return
      const tgt = monById(g, c.tg)
      g.useMove(tr.mon, c.s, tgt && tgt !== tr.mon && !tgt.fainted ? tgt : undefined, c.d)
      return
    }
    case 'switch':
      g.switchTo(tr, c.i)
      return
    case 'ball': {
      const w = g.wilds.find((x) => x.id === c.w)
      if (w && Math.hypot(w.x - tr.x, w.y - tr.y) < 7) g.throwBall(tr, w, c.m)
      return
    }
    case 'item':
      if (c.k === 'potion') g.usePotion(tr)
      else g.useRevive(tr)
      return
    case 'pick': {
      const p = v.pending
      v.pending = null
      p?.(c.i)
      return
    }
  }
}

// ---------------------------------------------------------------- client side

/** Client-side bookkeeping: objects by host id and where they should be. */
export class ClientState {
  mons = new Map<number, Mon>()
  trainers = new Map<number, Trainer>()
  /** Network target positions; drawn positions glide toward these. */
  goal = new Map<Mon | Trainer, [number, number]>()
  placed = false
}

/** Sets up a client Game from the host's roster. */
export function initClient(g: Game, roster: RosterEntry[], you: number) {
  const cs = new ClientState()
  for (const r of roster) {
    const tr = new Trainer({ key: r.key, name: r.name, sprite: r.sprite }, r.name, r.i === you)
    tr.id = r.i
    tr.human = r.human
    tr.pid = r.pid
    g.trainers.push(tr)
    cs.trainers.set(r.i, tr)
    if (r.i === you) g.player = tr
  }
  g.net = cs
  return cs
}

function getMon(cs: ClientState, o: Record<string, number & string & unknown[]>, owner: Trainer | null) {
  let m = cs.mons.get(o.i)
  if (!m) {
    m = new Mon(o.s, o.l, !!o.sh)
    m.id = o.i
    m.x = o.x
    m.y = o.y
    cs.mons.set(o.i, m)
    preloadMon(o.s, m.shiny)
  }
  if (m.species.id !== o.s) {
    m.species = SPECIES[o.s]
    m.moves = movesetFor(m.species.types)
    preloadMon(o.s, m.shiny)
  }
  m.owner = owner
  m.level = o.l
  m.hp = o.hp
  m.dir = DIRS[o.d] ?? m.dir
  m.aimX = o.ax ?? m.aimX
  m.aimY = o.ay ?? m.aimY
  m.aimT = o.at ?? 0
  m.revealT = o.rv ?? 0
  m.state = STATES[o.st] ?? 'roam'
  m.castT = o.ct ?? 0
  m.flash = o.fl ?? 0
  m.evolveFx = o.ev ?? 0
  if (o.tc) m.tintCol = o.tc
  m.tintT = o.tt ?? 0
  m.joltT = o.jt ?? 0
  m.liftT = o.lt ?? 0
  m.weakT = o.wk ?? 0
  const cl = o.cl as unknown as [number, number] | undefined
  m.claim = cl ? cs.trainers.get(cl[0]) ?? null : null
  m.claimT = cl ? cl[1] : 0
  m.catching = !!o.ca
  if (o.bs) {
    m.boss = true
    m.bossMul = o.bs
  }
  m.frozenT = o.fz ?? 0
  const ds = o.ds as unknown as [number, number, number, string, number] | undefined
  m.dash = ds ? { vx: ds[0], vy: ds[1], t: ds[2], move: moveByName(ds[3]), hit: new Set(), strike: !!ds[4] } : null
  const ch = o.ch as unknown as [string, number, number] | undefined
  m.charging = ch ? { move: moveByName(ch[0]), t: ch[1], total: ch[2], tgt: null } : null
  if (o.cd) {
    m.xp = o.xp
    m.cds = o.cd as unknown as number[]
    m.combatT = o.cb
  }
  cs.goal.set(m, [o.x, o.y])
  return m
}

type Snap = {
  t: number
  tr: Record<string, number & unknown[]>[]
  m: Record<string, number & string & unknown[]>[]
  w: number[]
  p: [number, number, number, number, number, string, number][]
  n: [number, number, number, number, string, number, number, number][]
  z: number[]
  it?: [number, number, number][]
  ev?: [number, number, number, number, number, number, number][]
  hz?: [number, number, number, number, number, number, number, number, number, number, string, number, string, number, number, number][]
  rv?: RaidViewState
  /** Scoreboard: [id, kos, caught, dmg, bossDmg, lives, place, diedAt] per trainer. */
  sb?: number[][]
  me: Record<string, number & number[]>
}

/** Applies a host snapshot on the client. */
export function applySnapshot(g: Game, raw: unknown) {
  const cs = g.net!
  const s = raw as Snap
  const me = g.player
  g.time = s.t
  const byId = new Map(s.m.map((o) => [o.i as number, o]))
  // Not our match (a stale message from before a rematch)
  if (!s.tr.some((t) => t.i === me.id)) return
  const ownerOf = new Map<number, Trainer>()
  for (const t of s.tr) if (cs.trainers.has(t.i)) ownerOf.set(t.m, cs.trainers.get(t.i)!)
  for (const id of s.me.p) ownerOf.set(id, me)

  for (const t of s.tr) {
    const tr = cs.trainers.get(t.i)
    if (!tr) continue
    tr.alive = !!t.a
    tr.revealT = t.rv ?? 0
    tr.place = t.pl
    if (t.lv !== undefined) {
      tr.lives = t.lv
      tr.respawnT = t.rs
      tr.bossDmg = t.bd
    }
    const th = t.th as unknown as number[] | undefined
    tr.throwFx = th ? { x: th[0], y: th[1], tx: th[2], ty: th[3], t: th[4], master: !!th[5] } : null
    // You move yourself; only snap back if the host disagrees a lot (blocked or lagged out)
    if (tr === me && cs.placed && tr.alive && Math.hypot(t.x - tr.x, t.y - tr.y) < 3) continue
    if (t.d !== undefined) {
      tr.dir = DIRS[t.d]
      tr.faceRight = !!t.f
      tr.walkT = t.w
    }
    if (tr === me) {
      tr.x = t.x
      tr.y = t.y
    } else cs.goal.set(tr, [t.x, t.y])
  }
  cs.placed = true

  // Pokémon
  for (const o of s.m) getMon(cs, o, ownerOf.get(o.i) ?? null)
  for (const t of s.tr) {
    const tr = cs.trainers.get(t.i)
    if (!tr || tr === me) continue
    const m = cs.mons.get(t.m)
    if (m) {
      tr.party = [m]
      tr.active = 0
    }
  }
  me.party = s.me.p.map((id) => cs.mons.get(id)!).filter(Boolean)
  me.active = s.me.ac
  me.masterBalls = s.me.mb
  me.potions = s.me.po
  me.revives = s.me.re
  me.kos = s.me.k
  me.caught = s.me.c
  me.swapCd = Math.max(me.swapCd, s.me.sw)
  me.diedAt = s.me.dd
  me.spectate = s.me.sp ? cs.trainers.get(s.me.sp) ?? null : null
  g.wilds = s.w.map((id) => cs.mons.get(id)!).filter(Boolean)

  // Forget Pokémon that are gone (caught wilds, swapped-out rivals)
  const keep = new Set<Mon>([...g.wilds, ...me.party, ...g.trainers.map((t) => t.mon)])
  for (const [id, m] of cs.mons) if (!keep.has(m) && !byId.has(id)) {
    cs.mons.delete(id)
    cs.goal.delete(m)
  }

  g.projs = s.p.map(([x, y, vx, vy, life, mv, seed]) => ({ x, y, vx, vy, life, move: moveByName(mv), src: null!, mult: 1, tgt: null, seed }))
  g.novas = s.n.map(([x, y, t, total, mv, r, sx, sy]) => ({ x, y, t, total, move: moveByName(mv), src: null!, r, mult: 1, sx, sy }))
  const z = g.zone
  ;[z.x, z.y, z.r, z.nx, z.ny, z.nr, z.phase, z.t] = s.z
  z.shrinking = !!s.z[8]
  ;[z.fromX, z.fromY, z.fromR] = [s.z[9], s.z[10], s.z[11]]
  if (s.hz) g.hazards = s.hz.map(([id, sh, x, y, ang, r, inner, width, t, total, type, both, atk, vx, vy, dur]) => {
    const a = bossAttack(g, atk)
    return {
      id, shape: SHAPES[sh], x, y, ang, r, inner, width, t, total, type: type as Hazard['type'], both: !!both,
      dmg: 0, fx: a?.fx ?? 'earthpower', freeze: 0, cover: !!a?.cover, atk, vx, vy, dur, dps: 0,
    }
  })
  if (s.rv) {
    const rv = s.rv
    g.raidView = { timeLeft: rv.t, phase: rv.p, wind: rv.w, clones: rv.c, air: rv.a ?? 0 }
    rv.pl.forEach((hp, i) => { if (!hp) g.world.breakPillar(i) })
    // Mirror images: create or drop them to match, then put them where the host has them
    const cl = rv.c ?? []
    if (g.clones.length !== cl.length) g.clones = cl.map(([x, y]) => cloneMon(BOSSES[g.setup.boss ?? 'reshiram'].species, x, y))
    g.clones.forEach((m, i) => {
      const [x, y] = cl[i]
      m.mvx = x - m.x
      m.mvy = y - m.y
      m.x = x
      m.y = y
    })
  }
  if (s.ev) g.events = s.ev.map(([id, k, x, y, t, total, species]) => ({ id, kind: k ? 'swarm' : 'drop', x, y, t, total, species: species || undefined }))
  if (s.sb)
    for (const [id, kos, caught, dmg, bossDmg, lives, place, diedAt] of s.sb) {
      const tr = cs.trainers.get(id)
      if (!tr) continue
      Object.assign(tr, { kos, caught, dmg, bossDmg, lives, diedAt })
      if (place) tr.place = place
    }
  if (s.it) g.items = s.it.map(([x, y, k], i) => ({ x, y, kind: ITEMS[k], bob: g.items[i]?.bob ?? Math.random() * 6 }))
}

/** The raid HUD and arena state as sent to clients. */
interface RaidViewState {
  t: number
  p: number
  w?: [number, number]
  c?: [number, number][]
  a?: number
  /** Ice pillars' HP (0 = broken). */
  pl: number[]
}

function raidViewState(g: Game): RaidViewState {
  const rv = g.raidView!
  const o: RaidViewState = { t: r1(rv.timeLeft), p: rv.phase, pl: g.world.pillars.map((p) => p.hp) }
  if (rv.wind) o.w = [r2(rv.wind[0]), r2(rv.wind[1])]
  if (rv.clones) o.c = rv.clones.map(([x, y]) => [r2(x), r2(y)])
  if (rv.air) o.a = r2(rv.air)
  return o
}

/** Plays the host's events (effects, sounds, banners) on the client. */
export function applyEvents(g: Game, events: NetEvent[], hooks: GameHooks, send: (c: Command) => void) {
  for (const e of events) {
    switch (e[0]) {
      case 'v': {
        const [, k, lx, ly, ...args] = e
        if (SCREEN.has(k) && Math.hypot(lx - g.camX, ly - g.camY) > 11) break
        if (k === 'mark') break
        ;(g.vfx as unknown as Record<string, (...a: unknown[]) => void>)[k](...args)
        break
      }
      case 'fx':
        g.fx.push(e[1] as Fx)
        break
      case 'sfx': {
        const f = (sfx as unknown as Record<string, (...a: unknown[]) => void>)[e[1]]
        f?.(...e.slice(2))
        break
      }
      case 'cry':
        cry(e[1], e[2])
        break
      case 'hook': {
        const [, name, ...args] = e
        if (name === 'end') {
          g.over = true
          hooks.end(args[0] as GameResult)
        } else (hooks[name] as (...a: unknown[]) => void)(...args)
        break
      }
      case 'full': {
        const m = new Mon(e[1], e[2], e[3])
        hooks.partyFull(m, (i) => send({ t: 'pick', i }))
        break
      }
    }
  }
}
