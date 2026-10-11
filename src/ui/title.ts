import { animatedUrl } from '../data/pokemon'
import { sfx, unlockAudio } from '../audio'
import { say } from '../voice'
import { playMusic } from '../music'
import logoUrl from '../assets/stormbreak-logo.webp'

/**
 * Cinematic title: a living Black vs. White split. Zekrom's side crackles with
 * blue lightning, Reshiram's side drifts with embers, an energy seam pulses
 * between them, and the logo gets a metallic shine.
 */
/**
 * The Stormbreak logo (artwork), cut into three layers along its lightning crack:
 * STORM, BREAK and the ROYALE ribbon. BREAK keeps getting knocked loose, the
 * crack flashes, sparks fly and a shine sweeps over the letters.
 */
const LOGO = `<div class="tlogo v-art">
  <div class="logo-art" style="--logo: url(${logoUrl})">
    <img class="lp lp-rib" src="${logoUrl}" alt="">
    <img class="lp lp-storm" src="${logoUrl}" alt="Stormbreak Royale">
    <img class="lp lp-break" src="${logoUrl}" alt="">
    <svg class="lp-crack" viewBox="0 0 2220 687" preserveAspectRatio="none"><polyline points="1300,0 1215,110 1160,170 1148,300 1145,420 1150,470 1140,525" /></svg>
    <div class="lp-shine"></div>
    <div class="lp-sparks">${Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
  </div>
  <div class="tag">Breek door de storm</div>
</div>`

export function showTitle(onStart: () => void): () => void {
  const el = document.getElementById('screen')!
  el.innerHTML = `
    <div class="title2">
      <canvas class="tbg"></canvas>
      <div class="tvignette"></div>
      <div class="legend-l"><img class="px" src="${animatedUrl(644)}" alt="Zekrom"></div>
      <div class="legend-r"><img class="px" src="${animatedUrl(643)}" alt="Reshiram"></div>
      ${LOGO}
      <div class="tpress">Tik om te starten</div>
      <div class="tfoot">Fanproject · Pokémon © Nintendo / Game Freak</div>
    </div>`
  const canvas = el.querySelector('.tbg') as HTMLCanvasElement
  const g = canvas.getContext('2d')!
  let raf = 0
  let alive = true

  interface P { x: number; y: number; vx: number; vy: number; life: number; t: number; side: 0 | 1; s: number }
  const parts: P[] = []
  let bolt = 0
  let boltPts: [number, number][] = []

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const seamX = (y: number, W: number, H: number) => W * 0.62 - (y / H) * W * 0.24

  let last = performance.now()
  const frame = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = now / 1000
    const W = innerWidth, H = innerHeight
    // Background halves
    const dark = g.createLinearGradient(0, 0, W * 0.6, H)
    dark.addColorStop(0, '#20202c')
    dark.addColorStop(1, '#08080c')
    g.fillStyle = dark
    g.fillRect(0, 0, W, H)
    const light = g.createLinearGradient(W, 0, W * 0.4, H)
    light.addColorStop(0, '#ffffff')
    light.addColorStop(1, '#c8ccd8')
    g.fillStyle = light
    g.beginPath()
    g.moveTo(seamX(0, W, H), 0)
    g.lineTo(W, 0)
    g.lineTo(W, H)
    g.lineTo(seamX(H, W, H), H)
    g.closePath()
    g.fill()

    // Faint giant Poké Ball rings behind the logo
    g.save()
    g.translate(W / 2, H * 0.47)
    g.rotate(t * 0.08)
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(128,128,160,${0.12 - i * 0.03})`
      g.lineWidth = 2
      g.beginPath()
      g.arc(0, 0, Math.min(W, H) * (0.32 + i * 0.12), 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = 'rgba(128,128,160,0.08)'
    g.fillRect(-Math.min(W, H) * 0.56, -2, Math.min(W, H) * 1.12, 4)
    g.restore()

    // Energy seam
    g.save()
    g.globalCompositeOperation = 'lighter'
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass ? 'rgba(255,255,255,0.9)' : `rgba(160,120,255,${0.35 + Math.sin(t * 3) * 0.15})`
      g.lineWidth = pass ? 1.5 : 10
      g.beginPath()
      for (let y = 0; y <= H; y += 8) {
        const x = seamX(y, W, H) + Math.sin(y * 0.03 + t * 6) * (pass ? 2 : 4)
        y ? g.lineTo(x, y) : g.moveTo(x, y)
      }
      g.stroke()
    }
    g.restore()

    // Particles: blue sparks on the dark side, embers on the light side
    if (parts.length < 140) {
      for (let i = 0; i < 3; i++) {
        const side = Math.random() < 0.5 ? 0 : 1
        const y = H + 10
        const x = side === 0 ? Math.random() * seamX(y, W, H) : seamX(y, W, H) + Math.random() * (W - seamX(y, W, H))
        parts.push({ x, y, vx: (Math.random() - 0.5) * 20, vy: -(30 + Math.random() * 60), life: 3 + Math.random() * 3, t: 0, side, s: 1 + Math.random() * 2.5 })
      }
    }
    g.save()
    g.globalCompositeOperation = 'lighter'
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.t += dt
      p.x += (p.vx + Math.sin(p.t * 2 + p.y * 0.01) * 12) * dt
      p.y += p.vy * dt
      if (p.t > p.life || p.y < -10) {
        parts.splice(i, 1)
        continue
      }
      const a = Math.min(1, p.t) * (1 - p.t / p.life)
      g.fillStyle = p.side === 0 ? `rgba(90,170,255,${a})` : `rgba(255,140,40,${a * 0.85})`
      g.beginPath()
      g.arc(p.x, p.y, p.s, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()

    // Occasional lightning on Zekrom's side
    bolt -= dt
    if (bolt < -2.5 - Math.random() * 3) {
      bolt = 0.18
      boltPts = []
      let x = Math.random() * W * 0.35, y = 0
      while (y < H * 0.65) {
        boltPts.push([x, y])
        x += (Math.random() - 0.5) * 50
        y += 20 + Math.random() * 30
      }
    }
    if (bolt > 0 && boltPts.length) {
      g.save()
      g.globalCompositeOperation = 'lighter'
      g.fillStyle = `rgba(90,140,255,${bolt * 0.6})`
      g.fillRect(0, 0, seamX(0, W, H), H)
      g.strokeStyle = '#c8e0ff'
      g.lineWidth = 2.5
      g.shadowColor = '#5aa0ff'
      g.shadowBlur = 16
      g.beginPath()
      boltPts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      g.restore()
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  const cleanup = () => {
    alive = false
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
  }
  el.querySelector('.title2')!.addEventListener('click', () => {
    unlockAudio()
    playMusic('title')
    say('title')
    sfx.select()
    cleanup()
    onStart()
  }, { once: true })
  return cleanup
}
