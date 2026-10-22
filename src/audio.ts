/** Sound effects with WebAudio: recorded move samples on top of a small synth. */
import type { MoveFx } from './data/moves'
import { moveByName } from './data/moves'
import { loadSfx, namePitch, playBoss, playItem, playMoveCast, playMoveCharge, playMoveHit, sfxOutput, type BossSound, type ItemSound } from './moveSfx'
import { connected as duoConnected } from './duo'
let ctx: AudioContext | null = null
/** Every live sound goes here; it goes on to the speakers, or to the media player (see route). */
let out: GainNode | null = null
let muted = false

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext()
    out = ctx.createGain()
    out.connect(ctx.destination)
    sfxOutput(out)
    void loadSfx(ctx)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  route()
}

/**
 * Sound through a media player instead of straight to the speakers. On the AYN
 * Thor, the game on the top screen with /duo in a second Chrome window on the
 * bottom one went completely silent (both AudioContexts "running", nothing
 * heard). A playing <audio> element with a media session is what Android
 * treats as real media, so the same sound goes out that way instead.
 * 'auto' does that while a second screen is connected.
 */
export type OutMode = 'auto' | 'on' | 'off'
const OUT_KEY = 'sb:audioOut'
let outMode: OutMode = 'auto'
try {
  const m = localStorage.getItem(OUT_KEY)
  if (m === 'on' || m === 'off') outMode = m
} catch {
  /* private mode */
}
let sink: { dest: MediaStreamAudioDestinationNode; el: HTMLAudioElement } | null = null
let viaPlayer = false
let starting = false

export const outputMode = () => outMode
export function setOutputMode(m: OutMode) {
  outMode = m
  try {
    localStorage.setItem(OUT_KEY, m)
  } catch {
    /* private mode */
  }
  route()
}
/** Whether the sound goes through the media player right now. */
export const viaMediaPlayer = () => viaPlayer

const wantPlayer = () => outMode === 'on' || (outMode === 'auto' && duoConnected())

function route() {
  if (!ctx || !out || ctx.state === 'closed') return
  const want = wantPlayer() && typeof ctx.createMediaStreamDestination === 'function'
  if (!want) {
    if (!viaPlayer) return
    out.disconnect()
    out.connect(ctx.destination)
    viaPlayer = false
    sink?.el.pause()
    session(false)
    return
  }
  if (viaPlayer && !sink!.el.paused) return
  if (starting) return
  if (!sink) {
    const dest = ctx.createMediaStreamDestination()
    const el = new Audio()
    el.srcObject = dest.stream
    sink = { dest, el }
  }
  const s = sink
  starting = true
  // Switch over only once the player really plays (it needs an earlier tap); until then the speakers keep it
  s.el.play().then(
    () => {
      starting = false
      if (!wantPlayer() || !out) return route()
      if (!viaPlayer) {
        out.disconnect()
        out.connect(s.dest)
        viaPlayer = true
      }
      session(true)
    },
    () => {
      starting = false
    },
  )
}

/** The media session that comes with the player: a title and icon, and play/pause from the notification as the sound switch. */
function session(on: boolean) {
  const ms = navigator.mediaSession
  if (!ms) return
  try {
    if (on) {
      ms.metadata = new MediaMetadata({
        title: 'Stormbreak Royale',
        artist: 'Stormbreak',
        artwork: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      })
      ms.setActionHandler('play', () => setMuted(false))
      ms.setActionHandler('pause', () => setMuted(true))
    }
    ms.playbackState = on ? (muted ? 'paused' : 'playing') : 'none'
  } catch {
    /* an older browser without some of it */
  }
}

/**
 * Keep the sound going. Browsers may suspend (or "interrupt") the AudioContext
 * when the window loses focus: on a dual-screen handheld, tapping the second
 * screen (/duo) did exactly that. Resume it whenever this window is visible
 * again, gets focus or input, and check every moment just in case.
 */
function wake() {
  if (ctx && document.visibilityState === 'visible' && (ctx.state as string) !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {})
  // A second screen came or went, or Android paused the player: put the sound on the right road again
  route()
}
for (const ev of ['focus', 'pageshow', 'pointerdown', 'keydown', 'touchend'] as const) addEventListener(ev, wake, { passive: true, capture: true })
document.addEventListener('visibilitychange', wake)
setInterval(wake, 1500)

/** Sound channels the player can switch on and off in the options. */
export type Channel = 'music' | 'voice' | 'sfx'
const PREFS_KEY = 'battlemon:audio'
const prefs: Record<Channel, boolean> = { music: true, voice: true, sfx: true }
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'))
} catch {
  /* private mode */
}

const listeners: (() => void)[] = []
const notify = () => listeners.forEach((f) => f())

/** The in-game speaker button: silences everything at once. */
export function setMuted(m: boolean) {
  muted = m
  if (viaPlayer) session(true)
  notify()
}
export function setChannel(c: Channel, on: boolean) {
  prefs[c] = on
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode */
  }
  notify()
}
/** Whether a channel's switch is on (ignores the speaker button). */
export const channelPref = (c: Channel) => prefs[c]
/** Whether a channel is audible right now. */
export const channelOn = (c: Channel) => !muted && prefs[c]
export function onAudioChange(f: () => void) {
  listeners.push(f)
}
/** Shared AudioContext (null until the first user gesture). */
export const audioCtx = () => ctx
/** Where live sounds connect to (instead of ctx.destination). */
export const audioOut = (): AudioNode => out ?? ctx!.destination
export const isMuted = () => muted
const sfxOff = () => !channelOn('sfx')

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slide = 0, delay = 0) {
  if (!ctx || sfxOff()) return
  const t = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(audioOut())
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, vol = 0.05) {
  if (!ctx || sfxOff()) return
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const s = ctx.createBufferSource()
  const g = ctx.createGain()
  g.gain.value = vol
  s.buffer = buf
  s.connect(g).connect(audioOut())
  s.start()
}

/** Noise through a band-pass filter (rustles, thuds, hisses). */
function bandNoise(dur: number, vol: number, f: number, q = 1, delay = 0, f2 = 0) {
  if (!ctx || sfxOff()) return
  const t = ctx.currentTime + delay
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const s = ctx.createBufferSource()
  const flt = ctx.createBiquadFilter()
  flt.type = 'bandpass'
  flt.frequency.setValueAtTime(f, t)
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur)
  flt.Q.value = q
  const g = ctx.createGain()
  g.gain.value = vol
  s.buffer = buf
  s.connect(flt).connect(g).connect(audioOut())
  s.start(t)
}

/** Throttle: at most one of `key` every `ms`. */
const lastAt = new Map<string, number>()
function every(key: string, ms: number) {
  const now = performance.now()
  if (now - (lastAt.get(key) ?? -1e9) < ms) return false
  lastAt.set(key, now)
  return true
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
  hitConfirm(weak = false, strong = false) {
    if (weak) return tone(520, 0.06, 'square', 0.03, -120)
    tone(1760, 0.04, 'square', 0.03)
    tone(strong ? 3520 : 2640, strong ? 0.06 : 0.03, 'square', strong ? 0.025 : 0.015, 0, 0.02)
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
  /** A move going off, by move name (its own sound per move, heavier for stronger moves); pan -1..1, gain 0..1. */
  moveCast(name: string, pan = 0, gain = 1) {
    const mv = moveByName(name)
    playMoveCast(ctx, sfxOff(), mv.fx, mv.tier, pan, gain, mv.kind, namePitch(name))
  },
  /** A move landing on something. */
  moveHit(fx: MoveFx, tier: number, pan = 0, gain = 1) {
    playMoveHit(ctx, sfxOff(), fx, tier, pan, gain)
  },
  /** A big move charging up before it fires. */
  moveCharge(fx: MoveFx, tier: number, dur: number, pan = 0, gain = 1) {
    playMoveCharge(ctx, sfxOff(), fx, tier, dur, pan, gain)
  },
  /** Raid boss: charge-ups, impacts, its moves, the arena and the big moments. */
  boss(kind: BossSound, fx: MoveFx, size = 1, dur = 1, pan = 0, gain = 1) {
    playBoss(ctx, sfxOff(), kind, fx, size, dur, pan, gain)
  },
  /** Items: potion, revive, ball throws and wobbles, pickups. */
  item(name: ItemSound, pan = 0, gain = 1) {
    playItem(ctx, sfxOff(), name, pan, gain)
  },
  // ---------- World (these arrive with pan/gain when sent from a spot in the world) ----------
  /** Your Pokémon comes out of its ball. */
  sendOut(_pan = 0, gain = 1) {
    tone(260, 0.16, 'square', 0.05 * gain, 700)
    bandNoise(0.18, 0.12 * gain, 2400, 1.2, 0.02)
    tone(1180, 0.08, 'triangle', 0.05 * gain, 0, 0.14)
  },
  /** A projectile smacks into a wall or fizzles out. */
  fizzle(_pan = 0, gain = 1) {
    if (!every('fizzle', 70)) return
    bandNoise(0.12, 0.16 * gain, 700, 1.5, 0, 200)
  },
  /** Hitting something that can't be hurt right now (a boss roaring into its next phase). */
  clink() {
    if (!every('clink', 120)) return
    tone(2200, 0.09, 'triangle', 0.05)
    tone(3300, 0.12, 'sine', 0.03, 0, 0.02)
  },
  /** A Pokémon frozen solid. */
  freeze(_pan = 0, gain = 1) {
    ;[2600, 3400, 2900, 3900].forEach((f, i) => tone(f, 0.12, 'sine', 0.035 * gain, -600, i * 0.04))
    bandNoise(0.35, 0.1 * gain, 5000, 2)
  },
  /** A wild Pokémon is worn out: now's your chance to catch it. */
  catchable(_pan = 0, gain = 1) {
    tone(988, 0.08, 'square', 0.04 * gain)
    tone(1319, 0.14, 'square', 0.04 * gain, 0, 0.08)
  },
  /** A Pokémon runs off or disappears in a puff. */
  poof(_pan = 0, gain = 1) {
    if (!every('poof', 120)) return
    bandNoise(0.25, 0.14 * gain, 1500, 0.8, 0, 400)
    tone(700, 0.15, 'triangle', 0.03 * gain, -400)
  },
  /** Loot spilling on the ground. */
  loot(_pan = 0, gain = 1) {
    if (!every('loot', 150)) return
    ;[1568, 2093, 1760, 2349].forEach((f, i) => tone(f, 0.06, 'square', 0.025 * gain, 0, i * 0.05))
  },
  /** Something new appears to pick up (a potion in the raid arena). */
  spawnChime(_pan = 0, gain = 1) {
    ;[1047, 1568].forEach((f, i) => tone(f, 0.18, 'triangle', 0.04 * gain, 0, i * 0.08))
  },
  /** The supply crate whistling down. */
  incoming(_pan = 0, gain = 1) {
    tone(1800, 1.1, 'sine', 0.035 * gain, -1300)
  },
  /** The crate slams down and bursts open. */
  crate(_pan = 0, gain = 1) {
    tone(110, 0.35, 'square', 0.07 * gain, -70)
    bandNoise(0.4, 0.3 * gain, 300, 0.7)
    bandNoise(0.2, 0.15 * gain, 2200, 1, 0.05)
    ;[1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.1, 'square', 0.035 * gain, 0, 0.2 + i * 0.06))
  },
  /** Standing in the storm: an electric sting. */
  stormTick() {
    if (!every('storm', 450)) return
    bandNoise(0.12, 0.12, 3000, 2)
    tone(180, 0.12, 'sawtooth', 0.03, -60)
  },
  /** Burning on lava. */
  burn() {
    if (!every('burn', 400)) return
    bandNoise(0.2, 0.14, 900, 0.8, 0, 2500)
  },
  /** Out of combat: health starts coming back. */
  regen() {
    if (!every('regen', 2500)) return
    ;[784, 1047].forEach((f, i) => tone(f, 0.1, 'triangle', 0.03, 0, i * 0.07))
  },

  // ---------- HUD / UI (local only) ----------
  /** Stepping into tall grass. */
  rustle() {
    if (!every('rustle', 300)) return
    bandNoise(0.22, 0.09, 3200, 0.8)
    bandNoise(0.15, 0.06, 1800, 1, 0.07)
  },
  /** Can't do that (move on cooldown, no item, ...). */
  denied() {
    if (!every('denied', 180)) return
    tone(160, 0.09, 'square', 0.04)
    tone(120, 0.1, 'square', 0.04, 0, 0.07)
  },
  /** Something went wrong (no name, bad code, couldn't connect). */
  error() {
    tone(220, 0.12, 'square', 0.05)
    tone(165, 0.18, 'square', 0.05, 0, 0.11)
  },
  /** Your ultimate is ready again. */
  ready() {
    tone(1319, 0.06, 'square', 0.035)
    tone(1976, 0.12, 'square', 0.03, 0, 0.06)
  },
  /** Low health: a heartbeat. */
  heartbeat() {
    tone(70, 0.12, 'sine', 0.12, -20)
    tone(62, 0.14, 'sine', 0.1, -20, 0.16)
  },
  /** The storm starts closing in: a rising siren. */
  siren() {
    tone(330, 0.5, 'sawtooth', 0.03, 330)
    tone(330, 0.5, 'sawtooth', 0.03, 330, 0.55)
    bandNoise(0.9, 0.08, 200, 0.6)
  },
  /** Learned a new move. */
  newMove() {
    ;[659, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'square', 0.045, 0, i * 0.08))
  },
  /** You win! */
  fanfare() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.12, 'square', 0.05, 0, i * 0.12))
    ;[392, 523, 659].forEach((f, i) => tone(f, 0.45, 'triangle', 0.04, 0, 0.36 + i * 0.01))
  },
  /** Knocked out / out of lives / raid lost. */
  down() {
    ;[523, 466, 415, 349].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.16, 'square', 0.045, 0, i * 0.16))
  },
  /** Lobby: someone joined, left, got ready, everyone is ready. */
  join() {
    tone(784, 0.08, 'square', 0.04)
    tone(1175, 0.12, 'square', 0.04, 0, 0.08)
  },
  leave() {
    tone(784, 0.08, 'square', 0.04)
    tone(523, 0.14, 'square', 0.04, 0, 0.08)
  },
  readyTick() {
    tone(1568, 0.06, 'square', 0.03)
  },
  allReady() {
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1, 'square', 0.04, 0, i * 0.06))
  },
  /** Results: a number counting up. */
  tick() {
    if (!every('tick', 45)) return
    tone(1760, 0.02, 'square', 0.02)
  },
  /** Results: your medal (1 gold, 2 silver, 3 bronze, else a plain ding). */
  medal(place = 0) {
    const base = place === 1 ? 1568 : place === 2 ? 1319 : place === 3 ? 1175 : 988
    tone(base, 0.4, 'triangle', 0.06)
    tone(base * 1.5, 0.5, 'sine', 0.035, 0, 0.05)
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
  if (!ctx || sfxOff()) return
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
    if (!buf || sfxOff()) return
    const s = c.createBufferSource()
    const g = c.createGain()
    g.gain.value = vol
    s.buffer = buf
    s.connect(g).connect(audioOut())
    s.start()
  })
}
