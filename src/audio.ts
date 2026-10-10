/** Tiny chiptune-ish sound effects with WebAudio; no audio files needed. */
let ctx: AudioContext | null = null
let muted = false

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

export function setMuted(m: boolean) {
  muted = m
}
export const isMuted = () => muted

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slide = 0, delay = 0) {
  if (!ctx || muted) return
  const t = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, vol = 0.05) {
  if (!ctx || muted) return
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const s = ctx.createBufferSource()
  const g = ctx.createGain()
  g.gain.value = vol
  s.buffer = buf
  s.connect(g).connect(ctx.destination)
  s.start()
}

let lastHit = 0
export const sfx = {
  hit(strong = false) {
    const now = performance.now()
    if (now - lastHit < 40) return
    lastHit = now
    noise(strong ? 0.14 : 0.07, strong ? 0.09 : 0.05)
    tone(strong ? 180 : 260, 0.08, 'square', 0.04, -120)
  },
  cast(tier: number) {
    tone(520 + tier * 120, 0.09, 'square', 0.025, 300)
  },
  faint() {
    tone(600, 0.35, 'square', 0.05, -500)
  },
  level() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'square', 0.045, 0, i * 0.07))
  },
  evolve() {
    ;[392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, 0, i * 0.09))
  },
  catch() {
    ;[784, 0, 784, 0, 1047].forEach((f, i) => f && tone(f, 0.08, 'square', 0.05, 0, i * 0.08))
  },
  pickup() {
    tone(880, 0.06, 'square', 0.04, 400)
  },
  heal() {
    ;[660, 880, 1100].forEach((f, i) => tone(f, 0.08, 'triangle', 0.06, 0, i * 0.06))
  },
  select() {
    tone(990, 0.05, 'square', 0.035)
  },
  /** Text scroll blip, like BW dialogue boxes. */
  blip() {
    tone(1320, 0.025, 'square', 0.018)
  },
  legendary() {
    ;[220, 277, 330, 440].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.04, 0, i * 0.18))
  },
  ko() {
    noise(0.25, 0.08)
    tone(140, 0.3, 'sawtooth', 0.05, -80)
  },
}
