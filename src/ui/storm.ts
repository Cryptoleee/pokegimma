/**
 * The storm behind the menu on desktop: now and then a branching bolt strikes
 * behind the cards, the sky lights up and the light falls over the whole
 * screen for a moment. Idle between strikes (no frames drawn), off on phones
 * and for anyone who prefers less motion.
 */

const desktop = matchMedia('(min-width: 1100px) and (pointer: fine)')
const calm = matchMedia('(prefers-reduced-motion: reduce)')

/** Bolt colour per mode, matching the glow on its cards. */
export const STORM_TINT = { royale: '255, 196, 110', duel: '125, 170, 255', raid: '255, 110, 130' } as const

type Pt = [number, number]
interface Branch {
  pts: Pt[]
  /** 0 = the main channel, 1 = a fork, 2 = a fork of a fork. */
  depth: number
}

/** Jagged line from a to b by midpoint displacement. */
function jag(ax: number, ay: number, bx: number, by: number, disp: number, depth: number): Pt[] {
  let pts: Pt[] = [[ax, ay], [bx, by]]
  let d = disp
  for (let k = 0; k < depth; k++) {
    const next: Pt[] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
      const len = Math.hypot(x1 - x0, y1 - y0) || 1
      const o = (Math.random() * 2 - 1) * d
      next.push([(x0 + x1) / 2 - ((y1 - y0) / len) * o, (y0 + y1) / 2 + ((x1 - x0) / len) * o], [x1, y1])
    }
    pts = next
    d *= 0.52
  }
  return pts
}

/** A bolt from (x, 0) down to (x2, y2), with forks (and forks of forks). */
function bolt(x: number, x2: number, y2: number): Branch[] {
  const main = jag(x, -10, x2, y2, Math.max(30, y2 * 0.08), 7)
  const out: Branch[] = [{ pts: main, depth: 0 }]
  const forks = 3 + Math.floor(Math.random() * 4)
  for (let i = 0; i < forks; i++) {
    const at = main[Math.floor(main.length * (0.12 + Math.random() * 0.6))]
    const dir = Math.random() < 0.5 ? -1 : 1
    const ang = Math.PI / 2 + dir * (0.35 + Math.random() * 0.6)
    const len = y2 * (0.12 + Math.random() * 0.28)
    const pts = jag(at[0], at[1], at[0] + Math.cos(ang) * len, at[1] + Math.sin(ang) * len, len * 0.22, 5)
    out.push({ pts, depth: 1 })
    if (Math.random() < 0.6) {
      const at2 = pts[Math.floor(pts.length * (0.3 + Math.random() * 0.4))]
      const a2 = ang + dir * (0.3 + Math.random() * 0.5)
      const l2 = len * (0.3 + Math.random() * 0.3)
      out.push({ pts: jag(at2[0], at2[1], at2[0] + Math.cos(a2) * l2, at2[1] + Math.sin(a2) * l2, l2 * 0.25, 4), depth: 2 })
    }
  }
  return out
}

/** Draw a bolt once onto its own canvas (glow, halo, white core), so each frame is one drawImage. */
function render(w: number, h: number, dpr: number, branches: Branch[], tint: string) {
  const c = document.createElement('canvas')
  c.width = w * dpr
  c.height = h * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const path = (b: Branch) => {
    g.beginPath()
    b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  }
  const passes: [number, string, number, number][] = [
    // width, colour, alpha, blur
    [16, tint, 0.18, 40],
    [6, tint, 0.55, 18],
    [2.4, '#ffffff', 1, 6],
  ]
  for (const [lw, col, a, blur] of passes)
    for (const b of branches) {
      const k = b.depth === 0 ? 1 : b.depth === 1 ? 0.55 : 0.35
      g.globalAlpha = a * (b.depth === 0 ? 1 : 0.7)
      g.lineWidth = Math.max(0.6, lw * k)
      g.strokeStyle = col
      g.shadowColor = tint
      g.shadowBlur = blur * k
      path(b)
      g.stroke()
    }
  return c
}

/**
 * Start the storm in `app` (the menu shell); it stops by itself once that
 * element leaves the page. `tint` is the glow colour as "r, g, b".
 */
export function storm(app: HTMLElement | null, tint = '150, 175, 255') {
  if (!app || !desktop.matches || calm.matches) return
  const main = app.querySelector('.n-main') as HTMLElement | null
  if (!main) return
  const cv = document.createElement('canvas')
  cv.className = 'n-storm'
  cv.setAttribute('aria-hidden', 'true')
  const light = document.createElement('div')
  light.className = 'n-storm-light'
  light.setAttribute('aria-hidden', 'true')
  app.append(cv, light)
  const g = cv.getContext('2d')!
  const col = `rgb(${tint})`
  let w = 0, h = 0, dpr = 1

  const fit = () => {
    const r = main.getBoundingClientRect()
    const a = app.getBoundingClientRect()
    for (const el of [cv, light]) {
      el.style.left = `${r.left - a.left}px`
      el.style.width = `${r.width}px`
    }
    dpr = Math.min(1.25, devicePixelRatio || 1)
    w = r.width
    h = r.height
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
  }
  fit()
  const ro = new ResizeObserver(fit)
  ro.observe(main)

  let timer = 0
  let glass = true
  const alive = () => {
    if (app.isConnected && desktop.matches) return true
    ro.disconnect()
    clearTimeout(timer)
    return false
  }

  /** Brightness over time: a few quick re-strikes, then the glow dies away. */
  const curve = (t: number) => {
    const flick: [number, number][] = [[0, 1], [0.05, 0.25], [0.09, 0.95], [0.15, 0.15], [0.21, 0.8], [0.3, 0.55], [1.1, 0]]
    for (let i = 1; i < flick.length; i++) {
      const [t0, v0] = flick[i - 1], [t1, v1] = flick[i]
      if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0))
    }
    return 0
  }

  const strike = () => {
    if (!alive()) return
    if (document.hidden || !w) return schedule()
    // Mostly in the outer thirds and the gutters, sometimes straight down the middle
    const x = w * (Math.random() < 0.7 ? (Math.random() < 0.5 ? 0.04 + Math.random() * 0.3 : 0.66 + Math.random() * 0.3) : 0.35 + Math.random() * 0.3)
    const x2 = x + (Math.random() * 2 - 1) * w * 0.08
    const y2 = h * (0.55 + Math.random() * 0.4)
    const img = render(w, h, dpr, bolt(x, x2, y2), col)
    // Sometimes it strikes twice in a row
    const twice = Math.random() < 0.3
    const img2 = twice ? render(w, h, dpr, bolt(x + (Math.random() * 2 - 1) * w * 0.2, x2 + (Math.random() * 2 - 1) * w * 0.15, y2 * (0.7 + Math.random() * 0.3)), col) : null
    light.style.setProperty('--lx', `${(x / w) * 100}%`)
    // The panels turn to frosted glass only while it strikes (blur costs, and there's nothing to see otherwise)
    if (glass) app.classList.add('n-storming')
    let frames = 0
    const t0 = performance.now()
    const frame = (now: number) => {
      if (!alive()) return
      const t = (now - t0) / 1000
      frames++
      const k = curve(t)
      const k2 = img2 ? curve(t - 0.35) : 0
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, cv.width, cv.height)
      // The sky lights up around the top of the bolt
      const sky = Math.max(k, k2)
      if (sky > 0.01) {
        const gr = g.createRadialGradient(x * dpr, 0, 0, x * dpr, 0, h * 0.7 * dpr)
        gr.addColorStop(0, `rgba(${tint}, ${0.22 * sky})`)
        gr.addColorStop(0.45, `rgba(${tint}, ${0.04 * sky})`)
        gr.addColorStop(1, `rgba(${tint}, 0)`)
        g.fillStyle = gr
        g.fillRect(0, 0, cv.width, cv.height)
      }
      g.globalAlpha = k
      g.drawImage(img, 0, 0)
      if (img2 && k2 > 0) {
        g.globalAlpha = k2
        g.drawImage(img2, 0, 0)
      }
      g.globalAlpha = 1
      // Where it lands: a short burst of light on the ground
      if (k > 0.01) {
        const gl = g.createRadialGradient(x2 * dpr, y2 * dpr, 0, x2 * dpr, y2 * dpr, 140 * dpr)
        gl.addColorStop(0, `rgba(${tint}, ${0.35 * k})`)
        gl.addColorStop(1, `rgba(${tint}, 0)`)
        g.fillStyle = gl
        g.fillRect(0, 0, cv.width, cv.height)
      }
      // And the light falls over the cards in front
      light.style.opacity = String(Math.min(1, sky * 0.9))
      if (t < 1.6) requestAnimationFrame(frame)
      else {
        g.clearRect(0, 0, cv.width, cv.height)
        light.style.opacity = '0'
        app.classList.remove('n-storming')
        // A machine that can't keep up gets the bolts without the frosted glass
        if (frames / t < 40) glass = false
        schedule()
      }
    }
    requestAnimationFrame(frame)
  }

  const schedule = (ms = 5000 + Math.random() * 7000) => {
    clearTimeout(timer)
    timer = window.setTimeout(strike, ms)
  }
  schedule(1200 + Math.random() * 1500)
}
