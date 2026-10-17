import { clock, configured, pipeline } from './_redis.js'
import { json, parse, sessionUid, type User } from './_account.js'
import { weekOf } from './_progress.js'

/**
 * World rankings. GET ?board=pvp|pve&period=week|all → the top 50 with name,
 * avatar, level and title, plus your own place when you're signed in.
 * PvP: battle royale with other people. PvE: raids and battle royale against bots.
 */

const TOP = 50

export async function GET(req: Request) {
  if (!configured()) return json({ off: true })
  const q = new URL(req.url).searchParams
  const board = q.get('board') === 'pve' ? 'pve' : 'pvp'
  const period = q.get('period') === 'all' ? 'all' : 'week'
  const week = weekOf(clock().day)
  const key = `lb:${board}:${period === 'all' ? 'all' : week}`
  try {
    const uid = await sessionUid(req).catch(() => '')
    const cmds: (string | number)[][] = [['ZREVRANGE', key, 0, TOP - 1, 'WITHSCORES'], ['ZCARD', key]]
    if (uid) cmds.push(['ZREVRANK', key, uid], ['ZSCORE', key, uid])
    const [flat, count, myRank, myScore] = await pipeline(cmds)
    const list = Array.isArray(flat) ? flat.map(String) : []
    const ids: string[] = [], scores: number[] = []
    for (let i = 0; i + 1 < list.length; i += 2) {
      ids.push(list[i])
      scores.push(Number(list[i + 1]) || 0)
    }
    const who = uid && !ids.includes(uid) ? [...ids, uid] : ids
    const info = who.length ? await pipeline([['MGET', ...who.map((id) => `user:${id}`)], ['MGET', ...who.map((id) => `card:${id}`)]]) : [[], []]
    const users = (info[0] as unknown[]) ?? [], cards = (info[1] as unknown[]) ?? []
    const row = (i: number, rank: number, score: number) => {
      const u = parse<User>(users[i]), c = parse<{ lv: number; title: string }>(cards[i])
      return { rank, id: who[i], name: u?.name ?? '?', avatar: u?.avatar ?? '', lv: c?.lv ?? 1, title: c?.title ?? '', score }
    }
    const top = ids.map((_, i) => row(i, i + 1, scores[i]))
    let me = null
    if (uid) {
      const i = who.indexOf(uid)
      me = myRank === null || myRank === undefined ? row(i, 0, 0) : row(i, Number(myRank) + 1, Number(myScore) || 0)
    }
    return json({ board, period, week, count: Number(count) || 0, top, me })
  } catch {
    return json({ error: 'unavailable' }, 502)
  }
}
