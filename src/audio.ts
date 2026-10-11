/** Tiny chiptune-ish sound effects with WebAudio; no audio files needed. */
import type { MoveFx } from './data/moves'
import { playItem, playMoveCast, playMoveCharge, playMoveHit, type ItemSound } from './moveSfx'
let ctx: AudioContext | null = null
let muted = false

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

const muteListeners: ((m: boolean) => void)[] = []

export function setMuted(m: boolean) {
  muted = m
  muteListeners.forEach((f) => f(m))
}
export function onMuteChange(f: (m: boolean) => void) {
  muteListeners.push(f)
}
/** Shared AudioContext (null until the first user gesture). */
export const audioCtx = () => ctx
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
  /** Crisp tick when your attack connects. */
  hitConfirm() {
    tone(1760, 0.04, 'square', 0.03)
    tone(2640, 0.03, 'square', 0.015, 0, 0.02)
  },
    whoosh() {
    noise(0.22, 0.05)
    tone(220, 0.25, 'sawtooth', 0.025, 600)
  },
  countdown(final = false) {
    tone(final ? 1046 : 523, final ? 0.4 : 0.14, 'square', 0.06)
    if (final) tone(1568, 0.4, 'square', 0.03, 0, 0.02)
  },
  banner() {
    ;[784, 988, 1175].forEach((f, i) => tone(f, 0.09, 'square', 0.04, 0, i * 0.05))
  },
  release() {
    tone(300, 0.2, 'square', 0.05, 900)
    noise(0.15, 0.04)
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
  /** A move going off (its own sound per move, heavier for stronger moves); pan -1..1, gain 0..1. */
  moveCast(fx: MoveFx, tier: number, pan = 0, gain = 1) {
    playMoveCast(ctx, muted, fx, tier, pan, gain)
  },
  /** A move landing on something. */
  moveHit(fx: MoveFx, tier: number, pan = 0, gain = 1) {
    playMoveHit(ctx, muted, fx, tier, pan, gain)
  },
  /** A big move charging up before it fires. */
  moveCharge(fx: MoveFx, tier: number, dur: number, pan = 0, gain = 1) {
    playMoveCharge(ctx, muted, fx, tier, dur, pan, gain)
  },
  /** Items: potion, revive, ball throws and wobbles, pickups. */
  item(name: ItemSound, pan = 0, gain = 1) {
    playItem(ctx, muted, name, pan, gain)
  },
  /** Raid: a boss attack is coming (two quick alarm beeps). */
  warn() {
    tone(880, 0.07, 'square', 0.035)
    tone(660, 0.09, 'square', 0.035, 0, 0.09)
  },
}

// ---------- Pokémon cries (PokéAPI) ----------

const cryCache = new Map<number, Promise<AudioBuffer | null>>()

/** Plays a Pokémon's cry. Fails silently where the browser can't decode Ogg. */
export function cry(id: number, vol = 0.35) {
  if (!ctx || muted) return
  const c = ctx
  let p = cryCache.get(id)
  if (!p) {
    p = fetch(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .catch(() => null)
    cryCache.set(id, p)
  }
  void p.then((buf) => {
    if (!buf || muted) return
    const s = c.createBufferSource()
    const g = c.createGain()
    g.gain.value = vol
    s.buffer = buf
    s.connect(g).connect(c.destination)
    s.start()
  })
}
