import { pipeline } from './_redis.js'
import { accountsOn, cleanCode, cookie, cookies, INVITE_TTL, json, MAX_FRIENDS, MAX_REQUESTS, parse, sameOrigin, sessionUid, stateFor, type User } from './_account.js'

/**
 * Friend actions for the signed-in player, answered with the new state:
 *   {a: 'add', code}         by friend code (accepts straight away when they already asked you)
 *   {a: 'accept' | 'decline', id}
 *   {a: 'remove', id}
 *   {a: 'invite', id, code, q}  to your lobby
 *   {a: 'delete'}            your account and everything that goes with it
 */
const UID = /^d\d{5,25}$/
const id = (v: unknown) => (typeof v === 'string' && UID.test(v) ? v : '')

async function befriend(a: string, b: string) {
  const [na, nb] = await pipeline([['SCARD', `fr:${a}`], ['SCARD', `fr:${b}`]])
  if (Number(na) >= MAX_FRIENDS || Number(nb) >= MAX_FRIENDS) return 'full'
  await pipeline([
    ['SADD', `fr:${a}`, b],
    ['SADD', `fr:${b}`, a],
    ['SREM', `freq:${a}`, b],
    ['SREM', `freq:${b}`, a],
  ])
  return 'friends'
}

export async function POST(req: Request) {
  if (!accountsOn()) return json({ off: true })
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)
  let b: Record<string, unknown>
  try {
    const text = await req.text()
    if (text.length > 1000) return json({ error: 'too big' }, 413)
    b = JSON.parse(text || '{}')
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  try {
    const uid = await sessionUid(req)
    if (!uid) return json({ guest: true }, 401)
    let result = 'ok'
    switch (b.a) {
      case 'add': {
        const code = cleanCode(b.code)
        const [target] = code.length === 6 ? await pipeline([['GET', `fc:${code}`]]) : [null]
        if (typeof target !== 'string' || target === uid) {
          result = target === uid ? 'self' : 'notfound'
          break
        }
        const [already, asked, waiting] = await pipeline([
          ['SISMEMBER', `fr:${uid}`, target],
          ['SISMEMBER', `freq:${uid}`, target],
          ['SCARD', `freq:${target}`],
        ])
        if (Number(already)) result = 'already'
        else if (Number(asked)) result = await befriend(uid, target)
        else if (Number(waiting) >= MAX_REQUESTS) result = 'full'
        else {
          await pipeline([['SADD', `freq:${target}`, uid]])
          result = 'sent'
        }
        break
      }
      case 'accept': {
        const other = id(b.id)
        const [asked] = other ? await pipeline([['SISMEMBER', `freq:${uid}`, other]]) : [0]
        result = Number(asked) ? await befriend(uid, other) : 'notfound'
        break
      }
      case 'decline': {
        const other = id(b.id)
        if (other) await pipeline([['SREM', `freq:${uid}`, other]])
        break
      }
      case 'remove': {
        const other = id(b.id)
        if (other) await pipeline([['SREM', `fr:${uid}`, other], ['SREM', `fr:${other}`, uid]])
        break
      }
      case 'invite': {
        const other = id(b.id)
        const code = typeof b.code === 'string' && /^(Q\d{1,2}|[A-Z0-9]{4})$/.test(b.code) ? b.code : ''
        const q = typeof b.q === 'number' && Number.isInteger(b.q) && b.q >= -1 && b.q < 64 ? b.q : -1
        const [friend] = other && code ? await pipeline([['SISMEMBER', `fr:${uid}`, other]]) : [0]
        if (!Number(friend)) {
          result = 'notfound'
          break
        }
        await pipeline([
          ['RPUSH', `inv:${other}`, JSON.stringify({ from: uid, code, q, at: Date.now() })],
          ['LTRIM', `inv:${other}`, -20, -1],
          ['EXPIRE', `inv:${other}`, INVITE_TTL],
        ])
        result = 'invited'
        break
      }
      case 'delete': {
        const [u, fr] = await pipeline([['GET', `user:${uid}`], ['SMEMBERS', `fr:${uid}`]])
        const user = parse<User>(u)
        const friends = (Array.isArray(fr) ? fr : []).map(String)
        await pipeline([
          ...friends.map((f) => ['SREM', `fr:${f}`, uid]),
          ['DEL', `user:${uid}`, `fr:${uid}`, `freq:${uid}`, `pres:${uid}`, `inv:${uid}`, `sess:${cookies(req).sb_s}`],
          ...(user?.code ? [['DEL', `fc:${user.code}`]] : []),
        ])
        return json({ guest: true, result: 'deleted' }, 200, { 'Set-Cookie': cookie('sb_s', '', 0) })
      }
      default:
        return json({ error: 'unknown action' }, 400)
    }
    const state = await stateFor(uid, null)
    return json({ ...(state ?? { guest: true }), result })
  } catch {
    return json({ error: 'unavailable' }, 502)
  }
}
