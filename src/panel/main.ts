import './panel.css'
import { SPECIES, spriteUrl } from '../data/pokemon'
import { BOSSES, type BossId } from '../data/bosses'
import { THEMES, type ThemeId } from '../data/themes'
import { OPT_OUT_KEY } from '../stats'

/**
 * Creator stats panel (/stats): who's online right now, players per day, matches,
 * play time and what people pick. Reads /api/stats with the key from STATS_KEY.
 */

type Day = { day: string; players: number } & Record<string, number | string>
interface Live {
  online: number
  states: Record<string, number>
}
interface Full {
  now: number
  day: string
  live: Live
  history: Day[]
  month: { key: string; players: number }
  allTime: { players: number }
  partners: Record<string, number>
  bosses: Record<string, number>
  worlds: Record<string, number>
}

const KEY = 'sb:statskey'
const RANGE_KEY = 'sb:statsrange'
const app = document.getElementById('app')!
const get = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const put = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* private mode */
  }
}

let key = get(KEY) ?? ''
let range = Number(get(RANGE_KEY)) || 30
let data: Full | null = null
let liveAt = 0

// ---------- Helpers ----------

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
const SVG = 'http://www.w3.org/2000/svg'
const s = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.0', '')}K` : n.toLocaleString('nl-NL'))
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const dayLabel = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`
function duration(sec: number) {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const u = Math.floor(m / 60)
  return `${u}u ${String(m % 60).padStart(2, '0')}m`
}
/** Sum of the fields matching a prefix over some days. */
const sum = (days: Day[], test: (field: string) => boolean) =>
  days.reduce((t, d) => t + Object.entries(d).reduce((a, [f, v]) => a + (f !== 'day' && test(f) ? num(v) : 0), 0), 0)
const matches = (d: Day, k?: 'br' | 'raid' | 'duel') => sum([d], (f) => f.startsWith(k ? `m:${k}:` : 'm:'))
const playTime = (d: Day) => num(d['pt:br']) + num(d['pt:raid']) + num(d['pt:duel'])

const STATES: { id: string; name: string; color: string }[] = [
  { id: 'br', name: 'Battle royale', color: 'var(--s1)' },
  { id: 'raid', name: 'Raid', color: 'var(--s2)' },
  { id: 'duel', name: '1 vs 1', color: 'var(--s5)' },
  { id: 'lobby', name: 'Lobby', color: 'var(--s3)' },
  { id: 'menu', name: 'Menu', color: 'var(--s4)' },
]

// ---------- Tooltip ----------

const tip = h('div', 'tip')
tip.setAttribute('role', 'tooltip')
document.body.append(tip)
function showTip(x: number, y: number, head: string, rows: { color: string; value: string; name: string }[]) {
  tip.replaceChildren(h('div', 'h', head))
  for (const r of rows) {
    const row = h('div', 'r')
    const key = h('i')
    key.style.background = r.color
    row.append(key, h('b', '', r.value), h('span', '', r.name))
    tip.append(row)
  }
  tip.classList.add('on')
  const w = tip.offsetWidth, ht = tip.offsetHeight
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`
  tip.style.top = `${y - ht - 12 < 8 ? y + 16 : y - ht - 12}px`
}
const hideTip = () => tip.classList.remove('on')
addEventListener('scroll', hideTip, { passive: true })

// ---------- Column chart (one series, or stacked) ----------

interface Series {
  name: string
  color: string
  values: number[]
  fmt?: (v: number) => string
}

function niceStep(max: number) {
  const raw = max / 4
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  const f = raw / p
  return Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p)
}

function columns(host: HTMLElement, labels: string[], series: Series[], opts: { height?: number; tipHead?: (i: number) => string; fmtAxis?: (v: number) => string } = {}) {
  const W = Math.max(280, host.clientWidth), H = opts.height ?? 180
  const L = 36, R = 8, T = 18, B = 22
  const n = labels.length
  const totals = labels.map((_, i) => series.reduce((t, sr) => t + (sr.values[i] ?? 0), 0))
  const step = niceStep(Math.max(...totals, 1))
  const top = Math.max(step, Math.ceil(Math.max(...totals, 1) / step) * step)
  const iw = W - L - R, ih = H - T - B
  const band = iw / n
  const bw = Math.max(2, Math.min(24, band * 0.68))
  const y = (v: number) => T + ih - (v / top) * ih
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img' })
  const axisFmt = opts.fmtAxis ?? fmt
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }))
    const t = s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' })
    t.textContent = axisFmt(v)
    svg.append(t)
  }
  // X labels: a handful, never crowded
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))))
  for (let i = 0; i < n; i++) {
    if (i % every && i !== n - 1) continue
    if (i !== n - 1 && n - 1 - i < every * 0.6) continue
    const t = s('text', { x: L + band * (i + 0.5), y: H - 6, 'text-anchor': 'middle', class: 'tick' })
    t.textContent = labels[i]
    svg.append(t)
  }
  for (let i = 0; i < n; i++) {
    const cx = L + band * (i + 0.5)
    let base = y(0)
    const parts = series.map((sr) => sr.values[i] ?? 0)
    const lastNonZero = parts.reduce((a, v, j) => (v > 0 ? j : a), -1)
    parts.forEach((v, j) => {
      if (v <= 0) return
      const segH = Math.max(1, (v / top) * ih)
      // 2px surface gap between stacked segments
      const gap = base < y(0) ? 2 : 0
      const y0 = base - segH
      const hh = Math.max(1, segH - gap)
      const x0 = cx - bw / 2
      if (j === lastNonZero) {
        const r = Math.min(4, hh, bw / 2)
        svg.append(s('path', {
          d: `M${x0},${y0 + hh}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y0 + hh}Z`,
          fill: series[j].color,
        }))
      } else svg.append(s('rect', { x: x0, y: y0, width: bw, height: hh, fill: series[j].color }))
      base = y0
    })
  }
  // Selective label: the latest total above its bar
  if (totals[n - 1] > 0) {
    const t = s('text', { x: Math.min(W - R - 2, L + band * (n - 0.5)), y: y(totals[n - 1]) - 6, 'text-anchor': 'middle', class: 'endlbl' })
    t.textContent = fmt(totals[n - 1])
    svg.append(t)
  }
  // Hit targets: the whole band of each column (hover + keyboard)
  for (let i = 0; i < n; i++) {
    const hit = s('rect', { x: L + band * i, y: T, width: band, height: ih, class: 'hit', tabindex: 0 })
    const show = (x: number, yy: number) =>
      showTip(x, yy, opts.tipHead?.(i) ?? labels[i], series.map((sr) => ({ color: sr.color, value: (sr.fmt ?? fmt)(sr.values[i] ?? 0), name: sr.name })))
    hit.addEventListener('pointermove', (e) => show((e as PointerEvent).clientX, (e as PointerEvent).clientY))
    hit.addEventListener('pointerleave', hideTip)
    hit.addEventListener('focus', () => {
      const b = (hit as SVGGraphicsElement).getBoundingClientRect()
      show(b.left + b.width / 2, b.top + 20)
    })
    hit.addEventListener('blur', hideTip)
    svg.append(hit)
  }
  host.replaceChildren(svg)
}

function legend(items: { name: string; color: string; value?: string }[]) {
  const el = h('div', 'legend')
  for (const it of items) {
    const sp = h('span')
    const sw = h('i', 'sw')
    sw.style.background = it.color
    sp.append(sw)
    if (it.value != null) sp.append(h('b', '', it.value))
    sp.append(document.createTextNode(it.name))
    el.append(sp)
  }
  return el
}

// ---------- Ranked bar list ----------

function barList(rows: { name: string; value: number; note?: string; img?: string }[], limit = 10) {
  const list = h('div', 'bars')
  const top = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, limit)
  if (!top.length) {
    list.append(h('div', 'empty', 'Nog geen data'))
    return list
  }
  const max = top[0].value
  for (const r of top) {
    const row = h('div', 'bar')
    const name = h('div', 'name')
    if (r.img) {
      const im = h('img')
      im.src = r.img
      im.alt = ''
      im.loading = 'lazy'
      name.append(im)
    }
    name.append(h('span', '', r.name))
    const track = h('div', 'track')
    const fill = h('div', 'fill')
    fill.style.width = `${(r.value / max) * 100}%`
    track.append(fill)
    const n = h('div', 'num', fmt(r.value))
    if (r.note) n.append(h('small', '', r.note))
    row.append(name, track, n)
    list.append(row)
  }
  return list
}

function card(title: string, sub: string, cls = '') {
  const c = h('section', `card ${cls}`)
  c.append(h('h2', '', title))
  if (sub) c.append(h('p', 'sub', sub))
  return c
}

// ---------- Screens ----------

function gate(kind: 'key' | 'setup', info?: { store: boolean; key: boolean }, error = '') {
  app.replaceChildren()
  const wrap = h('div', 'wrap gate')
  const c = h('section', 'card')
  wrap.append(c)
  app.append(wrap)
  if (kind === 'setup') {
    c.append(h('h1', '', 'Stats nog niet ingesteld'))
    c.append(h('p', '', 'Het paneel werkt zodra Vercel een database en een sleutel heeft. Eenmalig, in het Vercel-dashboard van het project:'))
    const ol = h('ol')
    const step = (ok: boolean, html: string) => {
      const li = h('li')
      li.append(h('span', `check ${ok ? 'ok' : 'no'}`, ok ? '✓' : '✗'))
      const t = h('span')
      t.innerHTML = html // fixed text, no data
      li.append(t)
      ol.append(li)
    }
    step(!!info?.store, ' <b>Storage</b> → <b>Create Database</b> → <b>Upstash for Redis</b> (gratis) → verbind met dit project')
    step(!!info?.key, ' <b>Settings → Environment Variables</b>: <code>STATS_KEY</code> = een eigen wachtwoord')
    step(false, ' <b>Deployments</b> → laatste deploy → <b>Redeploy</b> (nieuwe instellingen gelden pas na een redeploy)')
    c.append(ol)
    const again = h('button', 'btn', 'Opnieuw controleren')
    again.onclick = () => boot()
    c.append(again)
    return
  }
  c.append(h('h1', '', 'Stormbreak stats'))
  c.append(h('p', '', 'Vul je STATS_KEY in. Dit apparaat onthoudt hem.'))
  const form = h('form')
  const input = h('input')
  input.type = 'password'
  input.placeholder = 'Sleutel'
  input.autocomplete = 'current-password'
  input.value = ''
  const go = h('button', 'btn', 'Open')
  go.type = 'submit'
  form.append(input, go)
  c.append(form, h('div', 'err', error))
  form.onsubmit = (e) => {
    e.preventDefault()
    key = input.value.trim()
    put(KEY, key)
    boot()
  }
  input.focus()
}

async function api(full: boolean) {
  const r = await fetch(`/api/stats?${full ? `full=1&days=${range}` : ''}`, { headers: { 'x-stats-key': key }, cache: 'no-store' })
  const body = await r.json().catch(() => ({}))
  return { status: r.status, body }
}

let liveTimer = 0, fullTimer = 0

async function boot() {
  clearInterval(liveTimer)
  clearInterval(fullTimer)
  if (!key) return gate('key')
  let res
  try {
    res = await api(true)
  } catch {
    return gate('key', undefined, 'Kan /api/stats niet bereiken. Draait dit op de live site?')
  }
  if (res.status === 503) return gate('setup', res.body)
  if (res.status === 401) {
    put(KEY, null)
    key = ''
    return gate('key', undefined, 'Verkeerde sleutel.')
  }
  if (res.status !== 200) {
    const detail = String(res.body?.detail ?? res.body?.error ?? '')
    const hint = /redis 401/.test(detail)
      ? ' Upstash weigert de token: plak UPSTASH_REDIS_REST_TOKEN opnieuw in Vercel (de "TOKEN", niet de read-only) en redeploy.'
      : /redis 4\d\d|fetch|URL/i.test(detail)
        ? ' Controleer UPSTASH_REDIS_REST_URL in Vercel en redeploy.'
        : ''
    return gate('key', undefined, `Fout ${res.status}: ${detail}.${hint}`)
  }
  data = res.body as Full
  liveAt = Date.now()
  draw()
  liveTimer = window.setInterval(refreshLive, 15000)
  fullTimer = window.setInterval(refreshFull, 120000)
}

async function refreshLive() {
  if (document.visibilityState !== 'visible' || !data) return
  try {
    const r = await api(false)
    if (r.status !== 200) return
    data.live = r.body.live
    liveAt = Date.now()
    drawLive()
  } catch {
    /* next time */
  }
}

async function refreshFull() {
  if (document.visibilityState !== 'visible') return
  document.body.classList.add('loading')
  try {
    const r = await api(true)
    if (r.status === 200) {
      data = r.body as Full
      liveAt = Date.now()
      draw()
    }
  } catch {
    /* keep the old frame */
  } finally {
    document.body.classList.remove('loading')
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && data && refreshLive())

// ---------- Dashboard ----------

let liveCard: HTMLElement | null = null
let updatedEl: HTMLElement | null = null

function drawLive() {
  if (!data || !liveCard) return
  const { online, states } = data.live
  liveCard.replaceChildren()
  const hero = h('div', 'hero')
  const big = h('div', 'big')
  big.append(h('small', '', 'Nu online'), document.createTextNode(fmt(online)))
  const side = h('div', 'side')
  const bar = h('div', 'stack')
  bar.setAttribute('role', 'img')
  bar.setAttribute('aria-label', STATES.map((st) => `${st.name}: ${states[st.id] ?? 0}`).join(', '))
  for (const st of STATES) {
    const v = states[st.id] ?? 0
    if (!v) continue
    const seg = h('i')
    seg.style.background = st.color
    seg.style.flex = String(v)
    seg.title = `${st.name}: ${v}`
    bar.append(seg)
  }
  side.append(bar, legend(STATES.map((st) => ({ name: st.name, color: st.color, value: String(states[st.id] ?? 0) }))))
  hero.append(big, side)
  liveCard.append(hero)
  if (updatedEl) updatedEl.lastChild!.textContent = ` live · ${new Date(liveAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

function tile(label: string, value: string, ref?: string) {
  const t = h('div', 'tile')
  t.append(h('div', 'lbl', label), h('div', 'val', value))
  // Today isn't over yet, so yesterday is a reference, not a "worse/better" delta
  if (ref) t.append(h('div', 'delta', ref))
  return t
}

function draw() {
  if (!data) return
  const D = data
  const days = D.history
  const today = days[days.length - 1]
  const yday = days[days.length - 2] ?? ({ day: '', players: 0 } as Day)
  app.replaceChildren()
  const wrap = h('div', 'wrap')
  app.append(wrap)

  // Header + the one filter row
  const top = h('div', 'top')
  const title = h('h1', '', 'Stormbreak stats')
  title.append(h('small', '', 'Anonieme tellingen · tijden in NL-tijd'))
  const seg = h('div', 'seg')
  for (const n of [7, 30, 90]) {
    const b = h('button', n === range ? 'on' : '', `${n} dagen`)
    b.onclick = () => {
      range = n
      put(RANGE_KEY, String(n))
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      refreshFull()
    }
    seg.append(b)
  }
  updatedEl = h('div', 'updated')
  updatedEl.append(h('i', 'pulse'), document.createTextNode(''))
  const excluded = get(OPT_OUT_KEY) === '1'
  const me = h('button', 'ghost', excluded ? 'Dit apparaat telt niet mee ✓' : 'Tel dit apparaat niet mee')
  me.title = 'Je eigen potjes op dit apparaat (zelfde browser) niet meetellen'
  me.onclick = () => {
    const now = get(OPT_OUT_KEY) === '1'
    put(OPT_OUT_KEY, now ? null : '1')
    me.textContent = now ? 'Tel dit apparaat niet mee' : 'Dit apparaat telt niet mee ✓'
  }
  const out = h('button', 'ghost', 'Uitloggen')
  out.onclick = () => {
    put(KEY, null)
    key = ''
    boot()
  }
  top.append(title, h('div', 'spacer'), seg, updatedEl, me, out)
  wrap.append(top)

  const grid = h('div', 'grid')
  wrap.append(grid)

  // Live
  liveCard = h('section', 'card')
  grid.append(liveCard)
  drawLive()

  // Tiles: today, with yesterday as the reference
  const tiles = h('div', 'tiles')
  const tilesCard = h('div', 'card')
  tilesCard.style.background = 'transparent'
  tilesCard.style.boxShadow = 'none'
  tilesCard.style.padding = '0'
  tilesCard.append(tiles)
  tiles.append(
    tile('Spelers vandaag', fmt(today.players), `gisteren ${fmt(yday.players)}`),
    tile('Nieuwe spelers vandaag', fmt(num(today.new)), `gisteren ${fmt(num(yday.new))}`),
    tile('Potjes vandaag', fmt(matches(today)), `gisteren ${fmt(matches(yday))}`),
    tile('Speeltijd vandaag', duration(playTime(today)), `gisteren ${duration(playTime(yday))}`),
    tile('Piek vandaag', `${fmt(num(today.pk))} tegelijk`, `gisteren ${fmt(num(yday.pk))}`),
    tile(`Spelers in ${MONTHS[Number(D.month.key.slice(5)) - 1]}`, fmt(D.month.players)),
    tile('Spelers ooit', fmt(D.allTime.players)),
    tile(`Bezoeken (${range} d)`, fmt(sum(days, (f) => f === 'v'))),
  )
  grid.append(tilesCard)

  const labels = days.map((d) => dayLabel(d.day))
  const head = (i: number) => new Date(`${days[i].day}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })

  // Players per day
  const c1 = card('Spelers per dag', `Unieke apparaten die het spel openden, laatste ${range} dagen`, 'c6')
  const ch1 = h('div', 'chart')
  c1.append(ch1)
  grid.append(c1)

  // Matches per day (stacked)
  const c2 = card('Potjes per dag', 'Gestarte potjes per speler', 'c6')
  const ch2 = h('div', 'chart')
  c2.append(legend([{ name: 'Battle royale', color: 'var(--s1)' }, { name: 'Raid', color: 'var(--s2)' }]), ch2)
  grid.append(c2)

  // Busy hours today
  const nowHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' }).format(D.now))
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const c3 = card('Drukte per uur (vandaag)', 'Hoogste aantal spelers tegelijk online per uur', 'c6')
  const ch3 = h('div', 'chart')
  c3.append(ch3)
  grid.append(c3)

  // Play time per day
  const c4 = card('Speeltijd per dag', 'Minuten in een potje (alleen met het tabblad open)', 'c6')
  const ch4 = h('div', 'chart')
  c4.append(legend([{ name: 'Battle royale', color: 'var(--s1)' }, { name: 'Raid', color: 'var(--s2)' }]), ch4)
  grid.append(c4)

  // Ranked lists
  const partners = card('Populairste partners', 'Eerste Pokémon bij de start van een potje · altijd', 'c4')
  partners.append(barList(Object.entries(D.partners).map(([id, v]) => ({ name: SPECIES[Number(id)]?.name ?? `#${id}`, value: v, img: spriteUrl(Number(id)) }))))
  const bosses = card('Raid-bazen', 'Keer gespeeld · % verslagen · altijd', 'c4')
  bosses.append(barList((Object.keys(BOSSES) as BossId[]).map((b) => {
    const play = D.bosses[`${b}:play`] ?? 0, clear = D.bosses[`${b}:clear`] ?? 0
    return { name: BOSSES[b].name, value: play, note: play ? `${Math.round((clear / play) * 100)}%` : '', img: spriteUrl(BOSSES[b].species) }
  })))
  const worlds = card('Werelden', 'Battle royale-wereld · altijd', 'c4')
  worlds.append(barList(Object.entries(D.worlds).map(([w, v]) => ({ name: THEMES[w as ThemeId] ? `${THEMES[w as ThemeId].icon} ${THEMES[w as ThemeId].name}` : w, value: v }))))
  grid.append(partners, bosses, worlds)

  const pct = (a: number, b: number) => (a + b ? `${Math.round((a / (a + b)) * 100)}%` : '')
  const modes = card('Speelwijze', `Gestarte potjes · ${range} dagen`, 'c4')
  modes.append(barList([
    { name: 'Solo', value: sum(days, (f) => f.startsWith('m:') && f.endsWith(':solo')) },
    { name: 'Snel spel', value: sum(days, (f) => f.startsWith('m:') && f.endsWith(':quick')) },
    { name: 'Met vrienden', value: sum(days, (f) => f.startsWith('m:') && f.endsWith(':friends')) },
  ]))
  const brW = sum(days, (f) => f === 'e:br:win'), brL = sum(days, (f) => f === 'e:br:lose')
  const rC = sum(days, (f) => f === 'e:raid:clear'), rF = sum(days, (f) => f === 'e:raid:fail')
  const dW = sum(days, (f) => f === 'e:duel:win'), dL = sum(days, (f) => f === 'e:duel:lose')
  const results = card('Uitslagen', `Afgelopen potjes · ${range} dagen`, 'c4')
  results.append(barList([
    { name: 'BR gewonnen', value: brW, note: pct(brW, brL) },
    { name: 'BR verloren', value: brL },
    { name: 'Raid verslagen', value: rC, note: pct(rC, rF) },
    { name: 'Raid mislukt', value: rF },
    { name: '1v1 gewonnen', value: dW, note: pct(dW, dL) },
    { name: '1v1 verloren', value: dL },
  ]))
  const people = card('Spelers per potje', `Echte spelers in een potje · ${range} dagen`, 'c4')
  people.append(barList(Array.from({ length: 12 }, (_, i) => ({ name: i ? `${i + 1} spelers` : '1 speler', value: sum(days, (f) => f === `h:${i + 1}`) })), 12))
  grid.append(modes, results, people)

  const visits = sum(days, (f) => f === 'v')
  const refs = Object.entries(days.reduce<Record<string, number>>((a, d) => {
    for (const [f, v] of Object.entries(d)) if (f.startsWith('ref:')) a[f.slice(4)] = (a[f.slice(4)] ?? 0) + num(v)
    return a
  }, {}))
  const sources = card('Bronnen', `Waar bezoekers vandaan komen · ${range} dagen · ?via=naam in je link telt ook`, 'c4')
  sources.append(barList([...refs.map(([n, v]) => {
    const played = sum(days, (f) => f === `pv:${n}`)
    return { name: n, value: v, note: played ? `${fmt(played)} gespeeld` : undefined }
  }), { name: 'Direct / onbekend', value: Math.max(0, visits - refs.reduce((t, [, v]) => t + v, 0)) }], 8))
  const devices = card('Apparaat', `Bezoeken · ${range} dagen`, 'c4')
  devices.append(barList([
    { name: '📱 Mobiel', value: sum(days, (f) => f === 'dev:mobile') },
    { name: '💻 Desktop', value: sum(days, (f) => f === 'dev:desktop') },
  ]))
  const langs = card('Taal', `Bezoeken · ${range} dagen`, 'c4')
  langs.append(barList([
    { name: 'English', value: sum(days, (f) => f === 'lang:en') },
    { name: 'Nederlands', value: sum(days, (f) => f === 'lang:nl') },
  ]))
  grid.append(sources, devices, langs)

  // Table view: every number per day
  const tcard = h('section', 'card')
  const det = h('details', 'table')
  det.append(h('summary', '', 'Tabel per dag'))
  const scroll = h('div', 'tscroll')
  const table = h('table')
  const thead = h('tr')
  for (const c of ['Datum', 'Spelers', 'Nieuw', 'Bezoeken', 'BR', 'Raid', '1v1', 'Speeltijd', 'Piek']) thead.append(h('th', '', c))
  table.append(thead)
  for (const d of [...days].reverse()) {
    const tr = h('tr')
    for (const c of [dayLabel(d.day), fmt(d.players), fmt(num(d.new)), fmt(num(d.v)), fmt(matches(d, 'br')), fmt(matches(d, 'raid')), fmt(matches(d, 'duel')), duration(playTime(d)), fmt(num(d.pk))]) tr.append(h('td', '', c))
    table.append(tr)
  }
  scroll.append(table)
  det.append(scroll)
  tcard.append(det)
  grid.append(tcard)

  // Charts need their final width
  const paint = () => {
    columns(ch1, labels, [{ name: 'spelers', color: 'var(--s1)', values: days.map((d) => d.players) }], { tipHead: head })
    columns(ch2, labels, [
      { name: 'Battle royale', color: 'var(--s1)', values: days.map((d) => matches(d, 'br')) },
      { name: 'Raid', color: 'var(--s2)', values: days.map((d) => matches(d, 'raid')) },
      { name: '1 vs 1', color: 'var(--s5)', values: days.map((d) => matches(d, 'duel')) },
    ], { tipHead: head })
    columns(ch3, hours.map((x) => `${x}u`), [{ name: 'tegelijk online (piek)', color: 'var(--s1)', values: hours.map((x) => (x <= nowHour ? num(today[`pk:${x}`]) : 0)) }], {
      height: 150,
      tipHead: (i) => `${i}:00 – ${i}:59`,
    })
    const mins = (v: number) => `${Math.round(v)} min`
    columns(ch4, labels, [
      { name: 'Battle royale', color: 'var(--s1)', values: days.map((d) => num(d['pt:br']) / 60), fmt: mins },
      { name: 'Raid', color: 'var(--s2)', values: days.map((d) => num(d['pt:raid']) / 60), fmt: mins },
      { name: '1 vs 1', color: 'var(--s5)', values: days.map((d) => num(d['pt:duel']) / 60), fmt: mins },
    ], { tipHead: head, fmtAxis: (v) => fmt(Math.round(v)) })
  }
  paint()
  let rt = 0
  window.onresize = () => {
    clearTimeout(rt)
    rt = window.setTimeout(paint, 120)
  }
}

boot()
