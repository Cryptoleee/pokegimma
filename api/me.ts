import { pipeline } from './_redis.js'
import { accountsOn, cleanName, json, presenceFrom, sameOrigin, sessionUid, stateFor } from './_account.js'

/**
 * Who you are plus your friends, requests and invites.
 *   GET   just the state
 *   POST  {s, code, q, n, run, name}: also a presence heartbeat (every ~30 s while signed in)
 * Answers {off: true} when accounts aren't set up and {guest: true} when you're not signed in.
 */
async function handle(req: Request, body: Record<string, unknown> | null) {
  if (!accountsOn()) return json({ off: true })
  try {
    const uid = await sessionUid(req)
    if (!uid) return json({ guest: true })
    const state = await stateFor(uid, body ? presenceFrom(body) : null)
    if (!state) return json({ guest: true })
    // The in-game name follows what you typed on the home screen
    const name = body ? cleanName(body.name) : ''
    if (name && name !== state.me.name) {
      const { id, ...user } = state.me
      user.name = name
      await pipeline([['SET', `user:${id}`, JSON.stringify(user)]])
      state.me.name = name
    }
    return json(state)
  } catch {
    return json({ error: 'unavailable' }, 502)
  }
}

export const GET = (req: Request) => handle(req, null)

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)
  let body: Record<string, unknown>
  try {
    const text = await req.text()
    if (text.length > 1000) return json({ error: 'too big' }, 413)
    body = JSON.parse(text || '{}')
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  return handle(req, body)
}
