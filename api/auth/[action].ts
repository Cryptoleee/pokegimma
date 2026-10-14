import { pipeline } from '../_redis.js'
import { accountsOn, cleanName, cookie, cookies, discordEnv, friendCode, json, parse, sameOrigin, SESSION_DAYS, token, type User } from '../_account.js'

/**
 * Discord login (scope `identify`: id, name and avatar only).
 *   GET  /api/auth/login     → Discord
 *   GET  /api/auth/callback  ← Discord, makes the account on first login, sets the session
 *   POST /api/auth/logout
 * Register https://www.stormbreak.app/api/auth/callback as the redirect in the Discord portal.
 */
declare const process: { env: Record<string, string | undefined> }

const API = () => process.env.DISCORD_API || 'https://discord.com/api'
const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/auth/callback`
const back = (req: Request, result: string, extra: string[] = []) => {
  const h = new Headers({ Location: `${new URL(req.url).origin}/?login=${result}`, 'Cache-Control': 'no-store' })
  h.append('Set-Cookie', cookie('sb_state', '', 0))
  for (const c of extra) h.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers: h })
}
const action = (req: Request) => new URL(req.url).pathname.split('/').pop()

interface DiscordUser {
  id: string
  username: string
  global_name?: string | null
  discriminator?: string
  avatar?: string | null
}

function avatarOf(d: DiscordUser) {
  if (d.avatar && /^[a-z0-9_]+$/i.test(d.avatar)) return `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=64`
  const n = d.discriminator && d.discriminator !== '0' ? Number(d.discriminator) % 5 : Number((BigInt(d.id) >> 22n) % 6n)
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`
}

export async function GET(req: Request) {
  const a = action(req)
  if (a === 'login') {
    if (!accountsOn()) return back(req, 'off')
    const state = token(16)
    const u = new URL('https://discord.com/oauth2/authorize')
    u.searchParams.set('client_id', discordEnv().id!)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('redirect_uri', redirectUri(req))
    u.searchParams.set('scope', 'identify')
    u.searchParams.set('state', state)
    u.searchParams.set('prompt', 'none')
    const h = new Headers({ Location: u.toString(), 'Cache-Control': 'no-store' })
    h.append('Set-Cookie', cookie('sb_state', state, 600))
    return new Response(null, { status: 302, headers: h })
  }
  if (a === 'callback') {
    if (!accountsOn()) return back(req, 'off')
    const q = new URL(req.url).searchParams
    const state = cookies(req).sb_state
    if (q.get('error')) return back(req, 'cancel')
    if (!state || q.get('state') !== state || !q.get('code')) return back(req, 'err')
    try {
      const { id, secret } = discordEnv()
      const tr = await fetch(`${API()}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code')!, redirect_uri: redirectUri(req), client_id: id!, client_secret: secret! }),
      })
      if (!tr.ok) return back(req, 'err')
      const { access_token } = (await tr.json()) as { access_token?: string }
      const ur = await fetch(`${API()}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } })
      if (!ur.ok) return back(req, 'err')
      const d = (await ur.json()) as DiscordUser
      if (!/^\d{5,25}$/.test(d.id)) return back(req, 'err')
      const uid = `d${d.id}`
      const dname = cleanName(d.global_name || d.username, 32) || 'Trainer'
      const [old] = await pipeline([['GET', `user:${uid}`]])
      const prev = parse<User>(old)
      let code = prev?.code ?? ''
      // A new friend code that nobody has yet
      for (let i = 0; !code && i < 8; i++) {
        const c = friendCode()
        const [ok] = await pipeline([['SET', `fc:${c}`, uid, 'NX']])
        if (ok === 'OK') code = c
      }
      if (!code) return back(req, 'err')
      const user: User = { name: prev?.name || cleanName(dname) || 'Trainer', dname, avatar: avatarOf(d), code }
      const sess = token(24)
      await pipeline([
        ['SET', `user:${uid}`, JSON.stringify(user)],
        ['SET', `sess:${sess}`, uid, 'EX', SESSION_DAYS * 86400],
      ])
      return back(req, prev ? 'ok' : 'new', [cookie('sb_s', sess, SESSION_DAYS * 86400)])
    } catch {
      return back(req, 'err')
    }
  }
  return json({ error: 'not found' }, 404)
}

export async function POST(req: Request) {
  if (action(req) !== 'logout' || !sameOrigin(req)) return json({ error: 'not found' }, 404)
  const t = cookies(req).sb_s
  if (t && /^[0-9a-f]{48}$/.test(t)) await pipeline([['DEL', `sess:${t}`]]).catch(() => {})
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('sb_s', '', 0) })
}
