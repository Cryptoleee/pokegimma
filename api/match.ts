import { clock, pipeline } from './_redis.js'
import { accountsOn, json, parse, sameOrigin, sessionUid, token } from './_account.js'
import { SUPPORTERS } from './_supporters.js'
import { applyMatch, levelOf, mergeGuest, normalize, sanitize, SHINY_AT, masteryOf, titleOf, titlesOf, weekOf, type Progress } from './_progress.js'

/**
 * Progress for signed-in players (guests keep the same progress in their browser).
 *   GET                               your progress
 *   POST {a:'start', kind, mode, humans}   a match begins: returns a ticket
 *   POST {a:'end', id, report}        the match is over: XP, quests, achievements, rankings
 *   POST {a:'import', guest}          merge guest progress into the account (once, capped)
 *   POST {a:'set', title?, shiny?}    pick a title / which partners are shown shiny
 *
 *   prog:<uid>        Progress JSON
 *   card:<uid>        {lv, title}: what the rankings show next to your name
 *   mt:<uid>:<id>     a running match (start time), single use, 1 h
 *   mtc:<uid>:<hour>  matches started this hour (rate limit)
 *   lb:<pvp|pve>:all and lb:<pvp|pve>:<week>   ranking points (sorted sets)
 *
 * Results come from the players' own game, so this is cheat-resistant (tickets,
 * real elapsed time, hard caps), not cheat-proof.
 */

const MATCHES_PER_HOUR = 100
const WEEK_TTL = 70 * 86400

async function load(uid: string): Promise<Progress> {
  const [v] = await pipeline([['GET', `prog:${uid}`]])
  const p = normalize(parse<Progress>(v))
  // Patreon supporters: always from the list, never from what's stored or sent
  p.supporter = SUPPORTERS[uid]
  if (!p.supporter) delete p.supporter
  if (p.title && !titlesOf(p).includes(p.title)) p.title = ''
  return p
}

const card = (p: Progress) => JSON.stringify({ lv: levelOf(p.xp).lv, title: titleOf(p) })

async function save(uid: string, p: Progress, extra: (string | number)[][] = []) {
  await pipeline([['SET', `prog:${uid}`, JSON.stringify(p)], ['SET', `card:${uid}`, card(p)], ...extra])
}

export async function GET(req: Request) {
  if (!accountsOn()) return json({ off: true })
  try {
    const uid = await sessionUid(req)
    if (!uid) return json({ guest: true })
    return json({ progress: await load(uid) })
  } catch {
    return json({ error: 'unavailable' }, 502)
  }
}

export async function POST(req: Request) {
  if (!accountsOn()) return json({ off: true })
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)
  let b: Record<string, unknown>
  try {
    const text = await req.text()
    if (text.length > 20000) return json({ error: 'too big' }, 413)
    b = JSON.parse(text || '{}')
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  try {
    const uid = await sessionUid(req)
    if (!uid) return json({ guest: true }, 401)
    const now = Date.now()

    if (b.a === 'start') {
      const hour = Math.floor(now / 3600_000)
      const [n] = await pipeline([['INCR', `mtc:${uid}:${hour}`], ['EXPIRE', `mtc:${uid}:${hour}`, 3600]])
      if (Number(n) > MATCHES_PER_HOUR) return json({ error: 'slow down' }, 429)
      const id = token(8)
      const kind = b.kind === 'raid' || b.kind === 'duel' ? b.kind : 'br'
      const mode = b.mode === 'quick' || b.mode === 'friends' ? b.mode : 'solo'
      const humans = Math.max(1, Math.min(12, Math.floor(Number(b.humans) || 1)))
      await pipeline([['SET', `mt:${uid}:${id}`, JSON.stringify({ at: now, kind, mode, humans }), 'EX', 3600]])
      return json({ id })
    }

    if (b.a === 'end') {
      const id = typeof b.id === 'string' && /^[0-9a-f]{16}$/.test(b.id) ? b.id : ''
      const [t] = id ? await pipeline([['GETDEL', `mt:${uid}:${id}`]]) : [null]
      const ticket = parse<{ at: number; kind: string; mode: string; humans: number }>(t)
      if (!ticket) return json({ error: 'ticket' }, 409)
      const elapsed = (now - ticket.at) / 1000
      // What the match was is taken from the ticket, not the report
      const r = sanitize({ ...(b.report as object), kind: ticket.kind as 'br', mode: ticket.mode as 'solo', humans: ticket.humans }, elapsed + 15)
      if (!r) return json({ error: 'report' }, 400)
      const p = await load(uid)
      const day = clock(now).day
      const out = applyMatch(p, r, day)
      const week = weekOf(day)
      const lb: (string | number)[][] = []
      for (const k of ['pvp', 'pve'] as const) {
        if (!out.points[k]) continue
        lb.push(['ZINCRBY', `lb:${k}:all`, out.points[k], uid], ['ZINCRBY', `lb:${k}:${week}`, out.points[k], uid], ['EXPIRE', `lb:${k}:${week}`, WEEK_TTL])
      }
      await save(uid, p, lb)
      return json({ outcome: out, progress: p })
    }

    if (b.a === 'import') {
      const p = await load(uid)
      if (p.imported) return json({ result: 'already', progress: p })
      mergeGuest(p, (b.guest ?? {}) as Partial<Progress>)
      await save(uid, p)
      return json({ result: 'merged', progress: p })
    }

    if (b.a === 'set') {
      const p = await load(uid)
      if (typeof b.title === 'string' && (b.title === '' || titlesOf(p).includes(b.title))) p.title = b.title
      if (Array.isArray(b.shiny)) p.shiny = b.shiny.map(Number).filter((id) => masteryOf(p.partners[id] ?? 0).lv >= SHINY_AT).slice(0, 30)
      await save(uid, p)
      return json({ progress: p })
    }

    return json({ error: 'unknown action' }, 400)
  } catch {
    return json({ error: 'unavailable' }, 502)
  }
}
