import type { MoveFx } from './data/moves'

/**
 * Synthesised move and item sounds (WebAudio, no files). Every move gets its
 * own sound from three ingredients:
 * - its type's timbre (fire hisses and crackles, water bubbles, electric
 *   buzzes and cracks, ice chimes, rock crunches, a dragon growls, ...),
 * - its kind's shape (a bolt is a short launch, a beam holds, a nova booms on
 *   landing, a burst blasts around the user, a dash whooshes, ...),
 * - its strength: tier 0 is short and light, tier 3 long and heavy with a sub
 *   boom and more reverb.
 * Sounds are panned and faded by distance from the viewer's camera.
 */

type Fam =
  | 'normal' | 'fire' | 'water' | 'grass' | 'electric' | 'ice' | 'fight' | 'poison' | 'ground'
  | 'wind' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel'
type Shape = 'melee' | 'bolt' | 'spread' | 'dash' | 'beam' | 'burst' | 'nova' | 'zap'

/** Each move's family, shape and a pitch of its own (so moves sharing both still differ). */
const MOVES: Record<MoveFx, [Fam, Shape, number]> = {
  tackle: ['normal', 'melee', 1], star: ['normal', 'spread', 1.2], voice: ['normal', 'burst', 1], hyperbeam: ['normal', 'beam', 0.8],
  ember: ['fire', 'bolt', 1.1], flamewheel: ['fire', 'dash', 1], flamethrower: ['fire', 'beam', 0.95], fireblast: ['fire', 'nova', 0.8],
  water: ['water', 'bolt', 1.15], aquajet: ['water', 'dash', 1.05], surf: ['water', 'burst', 0.9], hydropump: ['water', 'beam', 0.85],
  whip: ['grass', 'melee', 1.1], leaf: ['grass', 'spread', 1.15], energy: ['grass', 'bolt', 1], solarbeam: ['grass', 'beam', 0.9],
  thundershock: ['electric', 'zap', 1.2], spark: ['electric', 'dash', 1.05], thunderbolt: ['electric', 'zap', 0.95], thunder: ['electric', 'nova', 0.8],
  ice: ['ice', 'bolt', 1.15], snow: ['ice', 'spread', 1.25], icebeam: ['ice', 'beam', 1], blizzard: ['ice', 'burst', 0.85],
  kick: ['fight', 'melee', 1.05], aura: ['fight', 'bolt', 1], closecombat: ['fight', 'dash', 0.9], focusblast: ['fight', 'nova', 0.85],
  sting: ['poison', 'bolt', 1.2], poison: ['poison', 'spread', 1.05], sludgebomb: ['poison', 'nova', 0.9], gunkshot: ['poison', 'beam', 0.8],
  mud: ['ground', 'bolt', 1.1], quake: ['ground', 'burst', 0.9], earthpower: ['ground', 'nova', 0.85],
  wind: ['wind', 'bolt', 1.1], aerialace: ['wind', 'dash', 1.05], hurricane: ['wind', 'nova', 0.85],
  psy: ['psychic', 'bolt', 1.1], psybeam: ['psychic', 'beam', 1], psyshock: ['psychic', 'nova', 0.9], psychic: ['psychic', 'burst', 0.85],
  bugbite: ['bug', 'melee', 1.1], pin: ['bug', 'spread', 1.2], signalbeam: ['bug', 'beam', 1], bugbuzz: ['bug', 'burst', 0.9],
  rock: ['rock', 'bolt', 1.05], rocktomb: ['rock', 'nova', 0.95], stoneedge: ['rock', 'nova', 0.85],
  lick: ['ghost', 'melee', 1.1], shadowsneak: ['ghost', 'dash', 1], shadowball: ['ghost', 'bolt', 0.9], shadowforce: ['ghost', 'burst', 0.8],
  dragonrage: ['dragon', 'bolt', 1.05], dragonclaw: ['dragon', 'melee', 1], dragonpulse: ['dragon', 'beam', 0.95], dracometeor: ['dragon', 'nova', 0.8],
  bite: ['dark', 'melee', 1.1], darkpulse: ['dark', 'bolt', 0.95], nightdaze: ['dark', 'burst', 0.85],
  metalclaw: ['steel', 'melee', 1.1], mirror: ['steel', 'bolt', 1.2], flashcannon: ['steel', 'beam', 1], meteormash: ['steel', 'nova', 0.85],
  discharge: ['electric', 'burst', 1],
  claw: ['normal', 'melee', 1.15],
}

// ---------------------------------------------------------------- engine

let c: AudioContext | null = null
let bus: GainNode | null = null
let wet: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let voices = 0
const lastPlay = new Map<string, number>()

// ---------------------------------------------------------------- samples

/**
 * Recorded effects per type (cast, hit, big) plus a shared swing, dash and charge.
 * They load in the background on first use; until a sample is in, the synth plays.
 */
const SAMPLE_URLS = import.meta.glob('./assets/sfx/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const samples = new Map<string, AudioBuffer>()
let loading: Promise<void> | null = null
/** Overall level of the samples next to the synth layers. */
const SAMPLE_GAIN = 0.9

/** Where the bus plays to: the game's output node (see audio.ts), not straight to the speakers. */
let output: AudioNode | null = null
export function sfxOutput(n: AudioNode) {
  output = n
}

/** Start loading the samples (an AudioBuffer works in any context, offline ones included). */
export function loadSfx(ctx: BaseAudioContext) {
  loading ??= Promise.all(
    Object.entries(SAMPLE_URLS).map(([path, url]) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => void samples.set(path.slice(path.lastIndexOf('/') + 1, -4), buf))
        .catch(() => {}),
    ),
  ).then(() => {})
  return loading
}

/** Play a sample into a voice; false when it hasn't loaded (so the caller falls back to the synth). */
function sample(x: Ctx, name: string, vol = 1, rate = 1, at = 0, max = 0) {
  const buf = samples.get(name)
  if (!buf) return false
  const src = x.ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = Math.max(0.5, Math.min(2.5, rate))
  const g = x.ctx.createGain()
  const v = vol * SAMPLE_GAIN
  g.gain.value = v
  src.connect(g).connect(x.o)
  const t = x.t + at
  src.start(t)
  if (max > 0 && max < buf.duration / rate) {
    g.gain.setValueAtTime(v, t + max * 0.7)
    g.gain.linearRampToValueAtTime(0, t + max)
    src.stop(t + max + 0.02)
  }
  return true
}

/** Pitch for a sample: follows the synth pitch, but softer so it never turns into a chipmunk. */
const rateOf = (p: number) => Math.pow(p, 0.6)

function setup(ctx: AudioContext) {
  if (c === ctx && bus) return
  c = ctx
  void loadSfx(ctx)
  // Bus: gentle tape-style saturation for weight, then a fast compressor as a limiter
  // (so everything can be louder and fuller without clipping when a lot goes off at once)
  const sat = ctx.createWaveShaper()
  const curve = new Float32Array(1024)
  for (let i = 0; i < 1024; i++) {
    const x = (i / 512) - 1
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6)
  }
  sat.curve = curve
  sat.oversample = '2x'
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 6
  comp.ratio.value = 8
  comp.attack.value = 0.002
  comp.release.value = 0.12
  const makeup = ctx.createGain()
  makeup.gain.value = 1.25
  bus = ctx.createGain()
  bus.gain.value = 1
  bus.connect(sat).connect(comp).connect(makeup).connect(output?.context === ctx ? output : ctx.destination)
  // Short room reverb for the big ones
  const len = Math.floor(ctx.sampleRate * 1.4)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  }
  const conv = ctx.createConvolver()
  conv.buffer = ir
  wet = ctx.createGain()
  wet.gain.value = 0.5
  wet.connect(conv).connect(bus)
  const nlen = ctx.sampleRate * 2
  noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate)
  const nd = noiseBuf.getChannelData(0)
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1
}

/** One voice: a gain (vol) → panner → bus (+ reverb send). Returns its input and start time. */
function voice(ctx: AudioContext, pan: number, vol: number, rev: number, life: number) {
  setup(ctx)
  const g = ctx.createGain()
  g.gain.value = vol
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  g.connect(p).connect(bus!)
  if (rev > 0) {
    const s = ctx.createGain()
    s.gain.value = rev
    p.connect(s).connect(wet!)
  }
  voices++
  setTimeout(() => {
    voices--
    g.disconnect()
  }, (life + 1.6) * 1000)
  return { out: g, t: ctx.currentTime + 0.005 }
}

interface Osc { type?: OscillatorType; f: number; f2?: number; dur: number; vol: number; at?: number; attack?: number; vib?: [number, number]; lin?: boolean; dist?: boolean }
function osc(ctx: AudioContext, out: AudioNode, t0: number, o: Osc) {
  const t = t0 + (o.at ?? 0)
  const s = ctx.createOscillator()
  const g = ctx.createGain()
  s.type = o.type ?? 'square'
  s.frequency.setValueAtTime(o.f, t)
  if (o.f2) {
    if (o.lin) s.frequency.linearRampToValueAtTime(o.f2, t + o.dur)
    else s.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur)
  }
  if (o.vib) {
    const l = ctx.createOscillator()
    const lg = ctx.createGain()
    l.frequency.value = o.vib[0]
    lg.gain.value = o.vib[1]
    l.connect(lg).connect(s.frequency)
    l.start(t)
    l.stop(t + o.dur + 0.05)
  }
  const a = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(o.vol, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  let node: AudioNode = s
  if (o.dist) {
    const ws = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1
      curve[i] = Math.tanh(x * 4)
    }
    ws.curve = curve
    node = s.connect(ws)
  }
  node.connect(g).connect(out)
  s.start(t)
  s.stop(t + o.dur + 0.05)
}

interface Noise { dur: number; vol: number; at?: number; attack?: number; filter?: BiquadFilterType; f?: number; f2?: number; q?: number; wob?: [number, number] }
function noise(ctx: AudioContext, out: AudioNode, t0: number, o: Noise) {
  const t = t0 + (o.at ?? 0)
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  const g = ctx.createGain()
  const a = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(o.vol, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  let node: AudioNode = s
  if (o.filter) {
    const f = ctx.createBiquadFilter()
    f.type = o.filter
    f.frequency.setValueAtTime(o.f ?? 1000, t)
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + o.dur)
    f.Q.value = o.q ?? 1
    if (o.wob) {
      const l = ctx.createOscillator()
      const lg = ctx.createGain()
      l.frequency.value = o.wob[0]
      lg.gain.value = o.wob[1]
      l.connect(lg).connect(f.frequency)
      l.start(t)
      l.stop(t + o.dur + 0.05)
    }
    node = s.connect(f)
  }
  node.connect(g).connect(out)
  s.start(t, Math.random() * 1.5)
  s.stop(t + o.dur + 0.05)
}

/** Random little clicks (crackling fire, gravel, sparks). */
function crackle(ctx: AudioContext, out: AudioNode, t0: number, dur: number, n: number, vol: number, f = 3000) {
  for (let i = 0; i < n; i++) noise(ctx, out, t0, { at: Math.random() * dur, dur: 0.012 + Math.random() * 0.02, vol: vol * (0.5 + Math.random() * 0.5), filter: 'highpass', f })
}

const r = (a: number, b: number) => a + Math.random() * (b - a)

// ---------------------------------------------------------------- timbres

type Ctx = { ctx: AudioContext; o: AudioNode; t: number; p: number; k: number; len: number }

/** The sound of a type, either launching (cast) or landing (impact). */
const TIMBRE: Record<Fam, { cast: (x: Ctx) => void; hit: (x: Ctx) => void }> = {
  normal: {
    cast: ({ ctx, o, t, p, len }) => {
      noise(ctx, o, t, { dur: len, vol: 0.5, filter: 'bandpass', f: 900 * p, f2: 2400 * p, q: 1.2 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      osc(ctx, o, t, { type: 'sine', f: 180 * p, f2: 55, dur: 0.16 + k * 0.1, vol: 0.9 })
      noise(ctx, o, t, { dur: 0.08 + k * 0.05, vol: 0.6, filter: 'lowpass', f: 2600 })
    },
  },
  fire: {
    cast: ({ ctx, o, t, p, len, k }) => {
      noise(ctx, o, t, { dur: len, vol: 0.7, attack: 0.03, filter: 'bandpass', f: 500 * p, f2: 1800 * p, q: 0.8 })
      noise(ctx, o, t, { dur: len * 0.9, vol: 0.35, filter: 'lowpass', f: 700 })
      crackle(ctx, o, t, len, 6 + k * 14, 0.5, 2500)
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.3 + k * 0.4, vol: 0.9, filter: 'lowpass', f: 2200 * p, f2: 260 })
      crackle(ctx, o, t, 0.4 + k * 0.4, 8 + k * 16, 0.45, 2200)
    },
  },
  water: {
    cast: ({ ctx, o, t, p, len, k }) => {
      noise(ctx, o, t, { dur: len, vol: 0.45, attack: 0.02, filter: 'bandpass', f: 1400 * p, q: 0.7 })
      for (let i = 0; i < 3 + k * 5; i++) osc(ctx, o, t, { type: 'sine', at: r(0, len * 0.8), f: r(300, 500) * p, f2: r(900, 1500) * p, dur: 0.06, vol: 0.35 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.25 + k * 0.3, vol: 0.85, filter: 'bandpass', f: 1800 * p, f2: 500, q: 0.6 })
      for (let i = 0; i < 4 + k * 4; i++) osc(ctx, o, t, { type: 'sine', at: r(0.02, 0.3), f: r(400, 700) * p, f2: r(1000, 1800) * p, dur: 0.05, vol: 0.25 })
    },
  },
  grass: {
    cast: ({ ctx, o, t, p, len }) => {
      noise(ctx, o, t, { dur: len * 0.7, vol: 0.4, filter: 'highpass', f: 2800 * p })
      osc(ctx, o, t, { type: 'triangle', f: 520 * p, f2: 880 * p, dur: Math.min(0.25, len), vol: 0.4 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.12 + k * 0.1, vol: 0.7, filter: 'bandpass', f: 2400 * p, q: 1.5 })
      osc(ctx, o, t, { type: 'sine', f: 220 * p, f2: 90, dur: 0.12 + k * 0.08, vol: 0.6 })
      osc(ctx, o, t, { type: 'triangle', at: 0.03, f: 1320 * p, dur: 0.12, vol: 0.18 })
    },
  },
  electric: {
    cast: ({ ctx, o, t, p, len, k }) => {
      osc(ctx, o, t, { type: 'square', f: 900 * p, f2: 260 * p, dur: len, vol: 0.35, vib: [48, 260] })
      osc(ctx, o, t, { type: 'sawtooth', f: 1800 * p, f2: 600 * p, dur: len * 0.7, vol: 0.15, vib: [71, 500] })
      crackle(ctx, o, t, len, 8 + k * 16, 0.55, 4500)
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.06, vol: 1, filter: 'highpass', f: 3000 })
      osc(ctx, o, t, { type: 'square', f: 1400 * p, f2: 180, dur: 0.14 + k * 0.08, vol: 0.45, vib: [55, 300] })
      crackle(ctx, o, t, 0.2 + k * 0.3, 6 + k * 10, 0.5, 5000)
    },
  },
  ice: {
    cast: ({ ctx, o, t, p, len, k }) => {
      for (let i = 0; i < 2 + k * 2; i++) osc(ctx, o, t, { type: 'triangle', at: i * 0.04, f: [1760, 2637, 2093, 3136][i] * p, dur: 0.18 + len * 0.4, vol: 0.28 })
      noise(ctx, o, t, { dur: len, vol: 0.3, filter: 'highpass', f: 5000, attack: 0.02 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.1 + k * 0.08, vol: 0.9, filter: 'highpass', f: 3500 })
      for (let i = 0; i < 4 + k * 4; i++) osc(ctx, o, t, { type: 'sine', at: r(0, 0.12), f: r(2200, 5200) * p, dur: r(0.05, 0.14), vol: 0.22 })
      osc(ctx, o, t, { type: 'sine', f: 300 * p, f2: 120, dur: 0.1, vol: 0.4 })
    },
  },
  fight: {
    cast: ({ ctx, o, t, p, len }) => {
      noise(ctx, o, t, { dur: Math.min(0.18, len), vol: 0.6, filter: 'bandpass', f: 700 * p, f2: 1600 * p, q: 1.3 })
      osc(ctx, o, t, { type: 'sine', f: 260 * p, f2: 520 * p, dur: len, vol: 0.3, vib: [9, 25] })
    },
    hit: ({ ctx, o, t, p, k }) => {
      osc(ctx, o, t, { type: 'sine', f: 150 * p, f2: 45, dur: 0.2 + k * 0.12, vol: 1 })
      noise(ctx, o, t, { dur: 0.06, vol: 0.8, filter: 'lowpass', f: 2200 })
    },
  },
  poison: {
    cast: ({ ctx, o, t, p, len }) => {
      osc(ctx, o, t, { type: 'sine', f: 220 * p, f2: 130 * p, dur: len, vol: 0.45, vib: [14, 30] })
      noise(ctx, o, t, { dur: len, vol: 0.3, filter: 'lowpass', f: 900, f2: 300 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.25 + k * 0.25, vol: 0.8, filter: 'lowpass', f: 1200 * p, f2: 180, q: 4 })
      for (let i = 0; i < 3 + k * 4; i++) osc(ctx, o, t, { type: 'sine', at: r(0.03, 0.35), f: r(120, 220) * p, f2: r(300, 500), dur: 0.07, vol: 0.35 })
    },
  },
  ground: {
    cast: ({ ctx, o, t, p, len }) => {
      noise(ctx, o, t, { dur: len, vol: 0.6, filter: 'lowpass', f: 300 * p, attack: 0.03 })
      osc(ctx, o, t, { type: 'sine', f: 70 * p, f2: 45, dur: len, vol: 0.7 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      osc(ctx, o, t, { type: 'sine', f: 90 * p, f2: 32, dur: 0.35 + k * 0.5, vol: 1 })
      noise(ctx, o, t, { dur: 0.3 + k * 0.6, vol: 0.85, filter: 'lowpass', f: 600 * p, f2: 120 })
      crackle(ctx, o, t, 0.4, 6 + k * 8, 0.35, 1200)
    },
  },
  wind: {
    cast: ({ ctx, o, t, p, len, k }) => {
      noise(ctx, o, t, { dur: len, vol: 0.7, attack: len * 0.3, filter: 'bandpass', f: 600 * p, f2: 2600 * p, q: 2, wob: k > 0.6 ? [6, 500] : undefined })
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.18 + k * 0.4, vol: 0.75, filter: 'bandpass', f: 1600 * p, f2: 500, q: 1.5, wob: k > 0.6 ? [9, 600] : undefined })
      osc(ctx, o, t, { type: 'sine', f: 160 * p, f2: 70, dur: 0.12, vol: 0.4 })
    },
  },
  psychic: {
    cast: ({ ctx, o, t, p, len }) => {
      osc(ctx, o, t, { type: 'sine', f: 420 * p, f2: 900 * p, dur: len, vol: 0.4, vib: [12, 45], attack: 0.04 })
      osc(ctx, o, t, { type: 'sine', f: 427 * p, f2: 912 * p, dur: len, vol: 0.3, vib: [9, 30], attack: 0.04 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      osc(ctx, o, t, { type: 'sine', f: 1100 * p, f2: 260, dur: 0.22 + k * 0.2, vol: 0.55, vib: [18, 80] })
      osc(ctx, o, t, { type: 'triangle', f: 1650 * p, f2: 400, dur: 0.18 + k * 0.15, vol: 0.25 })
      noise(ctx, o, t, { dur: 0.15, vol: 0.3, filter: 'bandpass', f: 2500, q: 3 })
    },
  },
  bug: {
    cast: ({ ctx, o, t, p, len }) => {
      osc(ctx, o, t, { type: 'sawtooth', f: 190 * p, f2: 230 * p, dur: len, vol: 0.35, vib: [32, 18] })
      noise(ctx, o, t, { dur: len, vol: 0.25, filter: 'bandpass', f: 3200 * p, q: 3, wob: [30, 800] })
    },
    hit: ({ ctx, o, t, p, k }) => {
      for (let i = 0; i < 3 + k * 3; i++) noise(ctx, o, t, { at: i * 0.035, dur: 0.025, vol: 0.7, filter: 'highpass', f: 2500 * p })
      osc(ctx, o, t, { type: 'sine', f: 200 * p, f2: 90, dur: 0.1, vol: 0.4 })
    },
  },
  rock: {
    cast: ({ ctx, o, t, p, len }) => {
      noise(ctx, o, t, { dur: len, vol: 0.55, filter: 'bandpass', f: 400 * p, f2: 900 * p, q: 1 })
      crackle(ctx, o, t, len, 5, 0.3, 900)
    },
    hit: ({ ctx, o, t, p, k }) => {
      osc(ctx, o, t, { type: 'sine', f: 110 * p, f2: 38, dur: 0.25 + k * 0.3, vol: 1 })
      noise(ctx, o, t, { dur: 0.2 + k * 0.3, vol: 0.9, filter: 'lowpass', f: 1500 * p, f2: 300 })
      crackle(ctx, o, t, 0.35 + k * 0.3, 10 + k * 10, 0.5, 1000)
    },
  },
  ghost: {
    cast: ({ ctx, o, t, p, len }) => {
      osc(ctx, o, t, { type: 'sine', f: 520 * p, f2: 260 * p, dur: len + 0.1, vol: 0.38, vib: [5, 18], attack: len * 0.4 })
      osc(ctx, o, t, { type: 'triangle', f: 528 * p, f2: 250 * p, dur: len + 0.1, vol: 0.22, vib: [4, 14], attack: len * 0.4 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.3 + k * 0.3, vol: 0.6, attack: 0.05, filter: 'lowpass', f: 900 * p, f2: 200 })
      osc(ctx, o, t, { type: 'sine', f: 230 * p, f2: 70, dur: 0.3 + k * 0.25, vol: 0.7 })
    },
  },
  dragon: {
    cast: ({ ctx, o, t, p, len }) => {
      osc(ctx, o, t, { type: 'sawtooth', f: 95 * p, f2: 70 * p, dur: len + 0.05, vol: 0.45, vib: [24, 12], dist: true, attack: 0.03 })
      noise(ctx, o, t, { dur: len, vol: 0.5, filter: 'bandpass', f: 500 * p, f2: 1200 * p, q: 1.2, attack: 0.03 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      osc(ctx, o, t, { type: 'sine', f: 120 * p, f2: 38, dur: 0.3 + k * 0.35, vol: 1, dist: true })
      noise(ctx, o, t, { dur: 0.25 + k * 0.35, vol: 0.8, filter: 'lowpass', f: 1800 * p, f2: 250 })
    },
  },
  dark: {
    cast: ({ ctx, o, t, p, len }) => {
      osc(ctx, o, t, { type: 'sawtooth', f: 170 * p, f2: 110 * p, dur: len, vol: 0.3, vib: [7, 15] })
      noise(ctx, o, t, { dur: len, vol: 0.35, filter: 'bandpass', f: 1100 * p, q: 2 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      noise(ctx, o, t, { dur: 0.05, vol: 0.9, filter: 'bandpass', f: 1800, q: 2 })
      osc(ctx, o, t, { type: 'sine', f: 140 * p, f2: 45, dur: 0.22 + k * 0.2, vol: 0.9 })
    },
  },
  steel: {
    cast: ({ ctx, o, t, p, len }) => {
      for (const [m, v] of [[1, 0.3], [2.76, 0.18], [5.4, 0.1]]) osc(ctx, o, t, { type: 'sine', f: 900 * p * m, dur: 0.25 + len * 0.5, vol: v })
      noise(ctx, o, t, { dur: len, vol: 0.35, filter: 'highpass', f: 4000, attack: 0.02 })
    },
    hit: ({ ctx, o, t, p, k }) => {
      for (const [m, v] of [[1, 0.45], [2.76, 0.25], [5.4, 0.14], [8.9, 0.08]]) osc(ctx, o, t, { type: 'sine', f: 520 * p * m, dur: 0.3 + k * 0.4, vol: v })
      noise(ctx, o, t, { dur: 0.05, vol: 0.7, filter: 'highpass', f: 2500 })
    },
  },
}

/** A shared swish for melee swings and dashes. */
function swish(x: Ctx, dur: number) {
  noise(x.ctx, x.o, x.t, { dur, vol: 0.55, attack: dur * 0.4, filter: 'bandpass', f: 700 * x.p, f2: 2600 * x.p, q: 1.6 })
}
/** Deep boom under the strongest impacts. */
function sub(x: Ctx, vol: number) {
  osc(x.ctx, x.o, x.t, { type: 'sine', f: 65, f2: 28, dur: 0.5 + x.k * 0.5, vol })
}
/** The body of every impact: a sharp click and a low thump that get heavier with the move's strength. */
function punch(x: Ctx) {
  noise(x.ctx, x.o, x.t, { dur: 0.018, vol: 0.75, filter: 'highpass', f: 1800 })
  osc(x.ctx, x.o, x.t, { type: 'sine', f: 150 * Math.min(1.2, x.p), f2: 48, dur: 0.1 + x.k * 0.18, vol: 0.55 + x.k * 0.45 })
  if (x.k >= 0.33) noise(x.ctx, x.o, x.t, { dur: 0.12 + x.k * 0.2, vol: 0.35 + x.k * 0.25, filter: 'lowpass', f: 900, f2: 120 })
}
/** A short launch transient so a move "fires": a pitch-dropping thwip. */
function launch(x: Ctx, shape: Shape) {
  if (shape === 'melee' || shape === 'dash' || shape === 'burst') return
  const f = shape === 'zap' ? 2400 : shape === 'beam' ? 700 : 1400
  osc(x.ctx, x.o, x.t, { type: 'triangle', f: f * x.p, f2: f * 0.3 * x.p, dur: 0.07 + x.k * 0.05, vol: 0.3 + x.k * 0.2 })
  noise(x.ctx, x.o, x.t, { dur: 0.03, vol: 0.4, filter: 'bandpass', f: 2500 * x.p, q: 1.5 })
  // Beams also hold a low hum under the timbre
  if (shape === 'beam') osc(x.ctx, x.o, x.t, { type: 'sawtooth', f: 80 * x.p, f2: 70 * x.p, dur: x.len, vol: 0.18 + x.k * 0.14, attack: 0.04, dist: true })
}

// ---------------------------------------------------------------- public API

/** Testing: forget the voice count and throttle (e.g. between offline renders). */
export function resetSfx() {
  voices = 0
  lastPlay.clear()
}

function play(ctx: AudioContext | null, muted: boolean, key: string, gap: number, pan: number, vol: number, rev: number, life: number, draw: (o: AudioNode, t: number) => void, own = true) {
  if (!ctx || muted || vol < 0.01) return
  const now = performance.now()
  if (now - (lastPlay.get(key) ?? 0) < gap) return
  // Too much going on: drop other trainers' sounds first, never your own
  if (voices > (own ? 40 : 16)) return
  lastPlay.set(key, now)
  const { out, t } = voice(ctx, pan, vol, rev, life)
  draw(out, t)
}

/** Airy timbres sound thinner at the same gain; lift them a bit. */
const LOUDER: Partial<Record<Fam, number>> = { wind: 1.7, poison: 1.4, water: 1.35, bug: 1.2 }

/** A small pitch offset per move name, so moves sharing an effect still sound apart. */
export function namePitch(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return 0.93 + ((h >>> 0) % 1000) / 1000 * 0.14
}

/**
 * A move going off: the launch (bolt, beam, swing, ...) in its type's timbre.
 * `kind` is the move's real shape (some moves share an effect but not a shape).
 */
export function playMoveCast(ctx: AudioContext | null, muted: boolean, fx: MoveFx, tier: number, pan = 0, gain = 1, kind?: Shape, pitchMul = 1) {
  const m = MOVES[fx]
  if (!m) return
  const [fam, base, pitch] = m
  const shape = kind ?? base
  const k = tier / 3
  const p = pitch * pitchMul * r(0.96, 1.04)
  const len = { melee: 0.14, bolt: 0.16, spread: 0.1, dash: 0.24, beam: 0.35, burst: 0.3, nova: 0.18, zap: 0.13 }[shape] * (1 + k * 0.9)
  const vol = (0.18 + k * 0.1) * gain * (LOUDER[fam] ?? 1)
  play(ctx, muted, 'c' + fx + shape, 45, pan, vol, 0.08 + k * 0.3, len, (o, t) => {
    const x: Ctx = { ctx: ctx!, o, t, p, k, len }
    if (castSample(x, fam, shape)) return
    const T = TIMBRE[fam]
    launch(x, shape)
    switch (shape) {
      case 'melee':
        // Swing plus a quick taste of the type (a lick slurps, a bite snaps, ...)
        swish(x, 0.13 + k * 0.06)
        T.cast({ ...x, t: t + 0.05, len: 0.07 + k * 0.04 })
        break
      case 'dash':
        swish(x, len)
        T.cast({ ...x, len: len * 0.8 })
        break
      case 'spread':
        for (let i = 0; i < 3; i++) T.cast({ ...x, t: t + i * 0.06, len: 0.08 + k * 0.05, p: p * (1 + i * 0.05) })
        break
      case 'burst':
        // The blast happens right around the user: launch and impact at once
        T.cast(x)
        T.hit({ ...x, k: Math.min(1, k + 0.2) })
        if (k >= 0.6) sub(x, 0.6 + k * 0.3)
        break
      case 'nova':
        // Wind-up; the boom comes when it lands
        T.cast({ ...x, len: len * 0.7 })
        osc(x.ctx, o, t, { type: 'sine', f: 300 * p, f2: 900 * p, dur: len, vol: 0.18 })
        break
      default:
        T.cast(x)
    }
  }, gain >= 1)
}

/** The recorded version of a cast; false when the samples aren't in yet. */
function castSample(x: Ctx, fam: Fam, shape: Shape) {
  const lift = 1 / (LOUDER[fam] ?? 1)
  const rate = rateOf(x.p)
  if (!samples.has(fam + '-cast')) return false
  switch (shape) {
    case 'melee':
      // A swing with a taste of the type on top
      sample(x, 'swing', lift * 1.1, rate * (0.95 + x.k * 0.1))
      sample(x, fam + '-cast', lift * 0.55, rate * 1.05, 0.03, 0.4)
      break
    case 'dash':
      sample(x, 'dash', lift, rate)
      sample(x, fam + '-cast', lift * 0.6, rate, 0, 0.5)
      break
    case 'spread':
      sample(x, fam + '-cast', lift, rate)
      sample(x, fam + '-cast', lift * 0.45, rate * 1.08, 0.07, 0.4)
      break
    case 'burst':
      // The blast happens right around the user: launch and impact at once
      sample(x, fam + '-cast', lift * 0.8, rate)
      sample(x, x.k >= 0.6 ? fam + '-big' : fam + '-hit', lift, rate)
      if (x.k >= 0.6) sub(x, 0.5 + x.k * 0.3)
      break
    case 'beam':
      // The strongest beams use the big recording, cut to the beam's length
      if (x.k >= 0.99) sample(x, fam + '-big', lift * 0.85, rate, 0, Math.max(0.8, x.len * 2.5))
      else sample(x, fam + '-cast', lift, rate * 0.95)
      break
    default:
      sample(x, fam + '-cast', lift, rate)
  }
  return true
}

/** A move landing on a target: its type's impact, heavier for stronger moves. */
export function playMoveHit(ctx: AudioContext | null, muted: boolean, fx: MoveFx, tier: number, pan = 0, gain = 1) {
  const m = MOVES[fx]
  if (!m) return
  const [fam, shape, pitch] = m
  const k = tier / 3
  const p = pitch * r(0.95, 1.05)
  const vol = (0.17 + k * 0.13) * gain * (shape === 'nova' ? 1.25 : 1)
  play(ctx, muted, 'h' + fx, 55, pan, vol, 0.12 + k * 0.35, 0.8 + k, (o, t) => {
    const x: Ctx = { ctx: ctx!, o, t, p, k, len: 0.2 }
    const big = shape === 'nova' || k >= 0.66
    if (sample(x, fam + (big ? '-big' : '-hit'), 1 / (shape === 'nova' ? 1.25 : 1), rateOf(p), 0, big ? 0 : 0.9)) {
      // A light thump under it for weight, a deep boom under the strongest
      osc(x.ctx, o, t, { type: 'sine', f: 140, f2: 45, dur: 0.12 + k * 0.15, vol: 0.35 + k * 0.3 })
      if (big) sub(x, 0.5 + k * 0.3)
      return
    }
    punch(x)
    TIMBRE[fam].hit(x)
    if (shape === 'nova' || k >= 0.66) sub(x, 0.7 + k * 0.3)
    // The strongest moves ring out: a quieter echo of the impact a beat later
    if (k >= 0.66) {
      const e = ctx!.createGain()
      e.gain.value = 0.32
      e.connect(o)
      TIMBRE[fam].hit({ ...x, o: e, t: t + 0.12, p: p * 0.97 })
    }
  }, gain >= 1)
}

/** A big move charging up (Solar Beam, Hyper Beam, ...): a rising swell. */
export function playMoveCharge(ctx: AudioContext | null, muted: boolean, fx: MoveFx, tier: number, dur: number, pan = 0, gain = 1) {
  const m = MOVES[fx]
  if (!m) return
  const [, , pitch] = m
  play(ctx, muted, 'g' + fx, 100, pan, (0.06 + tier * 0.02) * gain, 0.2, dur, (o, t) => {
    // Squeeze or stretch the recorded swell so it peaks as the move fires
    const buf = samples.get('charge')
    if (buf && sample({ ctx: ctx!, o, t, p: pitch, k: tier / 3, len: dur }, 'charge', 1.6, buf.duration / Math.max(0.3, dur), 0, dur + 0.08)) return
    osc(ctx!, o, t, { type: 'sine', f: 200 * pitch, f2: 1200 * pitch, dur: dur + 0.05, vol: 0.5, attack: dur * 0.8, lin: true, vib: [14, 20] })
    osc(ctx!, o, t, { type: 'triangle', f: 400 * pitch, f2: 2400 * pitch, dur: dur + 0.05, vol: 0.2, attack: dur * 0.8, lin: true })
    noise(ctx!, o, t, { dur: dur + 0.05, vol: 0.25, attack: dur * 0.9, filter: 'bandpass', f: 600, f2: 4000, q: 3 })
  }, gain >= 1)
}

// ---------------------------------------------------------------- items

export type ItemSound = 'potion' | 'revive' | 'throw' | 'throwMaster' | 'shake' | 'breakOut' | 'pickupBall' | 'pickupPotion' | 'pickupCandy' | 'pickupRevive' | 'pickupMaster' | 'pickupSurge'

export function playItem(ctx: AudioContext | null, muted: boolean, name: ItemSound, pan = 0, gain = 1) {
  play(ctx, muted, 'i' + name, 40, pan, 0.2 * gain, 0.15, 1.2, (o, t) => {
    const x = ctx!
    switch (name) {
      case 'potion':
        // Spray, then a soft healing shimmer
        noise(x, o, t, { dur: 0.32, vol: 0.55, attack: 0.02, filter: 'highpass', f: 3500 })
        ;[784, 988, 1175, 1568].forEach((f, i) => osc(x, o, t, { type: 'triangle', at: 0.18 + i * 0.07, f, dur: 0.22, vol: 0.32 }))
        break
      case 'revive':
        // Crystal chime that climbs
        ;[523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => osc(x, o, t, { type: 'sine', at: i * 0.06, f, dur: 0.4, vol: 0.28 }))
        noise(x, o, t, { dur: 0.6, vol: 0.18, attack: 0.2, filter: 'highpass', f: 6000 })
        break
      case 'throw':
        noise(x, o, t, { dur: 0.28, vol: 0.5, attack: 0.1, filter: 'bandpass', f: 800, f2: 2200, q: 2 })
        osc(x, o, t, { type: 'square', f: 600, f2: 1200, dur: 0.12, vol: 0.12 })
        break
      case 'throwMaster':
        noise(x, o, t, { dur: 0.35, vol: 0.45, attack: 0.1, filter: 'bandpass', f: 900, f2: 3000, q: 2 })
        ;[1319, 1568, 2093, 2637].forEach((f, i) => osc(x, o, t, { type: 'sine', at: 0.05 + i * 0.05, f, dur: 0.25, vol: 0.25 }))
        break
      case 'shake':
        // The ball wobbles: two quick clicks
        osc(x, o, t, { type: 'square', f: 300, f2: 180, dur: 0.05, vol: 0.4 })
        osc(x, o, t, { type: 'square', at: 0.09, f: 260, f2: 160, dur: 0.05, vol: 0.35 })
        break
      case 'breakOut':
        noise(x, o, t, { dur: 0.18, vol: 0.8, filter: 'bandpass', f: 1500, q: 1 })
        osc(x, o, t, { type: 'square', f: 900, f2: 200, dur: 0.22, vol: 0.3 })
        break
      case 'pickupBall':
        osc(x, o, t, { type: 'square', f: 660, dur: 0.06, vol: 0.3 })
        osc(x, o, t, { type: 'square', at: 0.06, f: 990, dur: 0.1, vol: 0.3 })
        break
      case 'pickupPotion':
        for (let i = 0; i < 3; i++) osc(x, o, t, { type: 'sine', at: i * 0.05, f: 500 + i * 220, f2: 900 + i * 300, dur: 0.07, vol: 0.35 })
        break
      case 'pickupCandy':
        ;[1047, 1319, 1568].forEach((f, i) => osc(x, o, t, { type: 'square', at: i * 0.045, f, dur: 0.07, vol: 0.2 }))
        break
      case 'pickupRevive':
        ;[880, 1319, 1760].forEach((f, i) => osc(x, o, t, { type: 'triangle', at: i * 0.06, f, dur: 0.18, vol: 0.3 }))
        break
      case 'pickupSurge':
        // A rising rainbow arpeggio over a swelling shimmer, then a deep boom
        ;[523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => osc(x, o, t, { type: 'square', at: i * 0.055, f, dur: 0.16, vol: 0.18 }))
        osc(x, o, t, { type: 'sine', f: 220, f2: 880, dur: 0.6, vol: 0.3 })
        noise(x, o, t, { dur: 0.9, vol: 0.25, attack: 0.3, filter: 'highpass', f: 5000 })
        osc(x, o, t, { type: 'sine', at: 0.42, f: 120, f2: 40, dur: 0.6, vol: 0.6 })
        break
      case 'pickupMaster':
        ;[784, 988, 1175, 1568, 1976].forEach((f, i) => osc(x, o, t, { type: 'sine', at: i * 0.05, f, dur: 0.3, vol: 0.28 }))
        noise(x, o, t, { dur: 0.5, vol: 0.2, attack: 0.15, filter: 'highpass', f: 6500 })
        break
    }
  }, gain >= 1)
}

// ---------------------------------------------------------------- raid bosses

/**
 * Raid boss sounds: bigger, longer and heavier than anything a partner makes.
 * - charge: the attack building up while its warning is on the ground
 * - impact / quake: the attack landing (quake = the boss itself crashing down)
 * - dash, takeoff, teleport: the boss moving
 * - wind, tornado: Rayquaza's weather, as long as it lasts
 * - arc, vent, grid, shatter: the arenas (lightning rods, lava vents, floor grid, ice pillars)
 * - intro, enrage, clones, down: the big moments of the fight
 */
export type BossSound =
  | 'charge' | 'impact' | 'quake' | 'dash' | 'takeoff' | 'teleport' | 'wind' | 'tornado'
  | 'arc' | 'vent' | 'grid' | 'shatter' | 'intro' | 'enrage' | 'clones' | 'down'

/** A long deep boom with a rumbling tail. */
function boom(x: Ctx, vol: number, len = 1) {
  const { ctx, o, t } = x
  osc(ctx, o, t, { type: 'sine', f: 70, f2: 24, dur: 0.9 * len, vol })
  osc(ctx, o, t, { type: 'square', f: 110, f2: 32, dur: 0.25 * len, vol: vol * 0.35, dist: true })
  noise(ctx, o, t, { dur: 1.3 * len, vol: vol * 0.75, filter: 'lowpass', f: 2600, f2: 70 })
  noise(ctx, o, t, { at: 0.05, dur: 1.8 * len, vol: vol * 0.35, attack: 0.15, filter: 'lowpass', f: 220, f2: 50 })
}

export function playBoss(ctx: AudioContext | null, muted: boolean, kind: BossSound, fx: MoveFx, size = 1, dur = 1, pan = 0, gain = 1) {
  const m = MOVES[fx] ?? MOVES.hyperbeam
  const [fam, , pitch] = m
  const T = TIMBRE[fam]
  const s = Math.max(0.3, Math.min(1.2, size))
  const life = { charge: dur, wind: dur, tornado: dur, down: 3.5, intro: 2.5, enrage: 2, quake: 2.2 }[kind as string] ?? 1.6
  const vol = { charge: 0.13, impact: 0.3, quake: 0.34, dash: 0.24, takeoff: 0.6, teleport: 0.42, wind: 0.6, tornado: 0.75, arc: 0.22, vent: 0.24, grid: 0.2, shatter: 0.2, intro: 0.3, enrage: 0.3, clones: 0.4, down: 0.36 }[kind] * s * gain
  // One charge/impact per attack kind at a time, but volleys of meteors still each thud
  const gap = kind === 'impact' ? 70 : kind === 'charge' ? 150 : 90
  play(ctx, muted, 'b' + kind + fx, gap, pan, vol, kind === 'charge' ? 0.25 : 0.55, life, (o, t) => {
    const c = ctx!
    const x: Ctx = { ctx: c, o, t, p: pitch, k: 1, len: 0.4 }
    switch (kind) {
      case 'charge': {
        // A swell in the attack's own colour that peaks right when it lands
        const d = Math.max(0.4, Math.min(2.6, dur))
        noise(c, o, t, { dur: d, vol: 0.55, attack: d * 0.9, filter: 'bandpass', f: 220 * pitch, f2: 2600 * pitch, q: 1.4 })
        osc(c, o, t, { type: 'sawtooth', f: 45, f2: 95, dur: d, vol: 0.35, attack: d * 0.85, lin: true, vib: [7, 4] })
        osc(c, o, t, { type: 'sine', f: 160 * pitch, f2: 640 * pitch, dur: d, vol: 0.25, attack: d * 0.8, vib: [11, 18] })
        T.cast({ ...x, t: t + d * 0.45, len: d * 0.55 })
        if (fam === 'electric') crackle(c, o, t + d * 0.3, d * 0.7, 26, 0.5, 2500)
        if (fam === 'rock' || fam === 'ground' || fam === 'fire') noise(c, o, t, { dur: d, vol: 0.5, attack: d * 0.7, filter: 'lowpass', f: 160, f2: 260 })
        break
      }
      case 'impact':
        boom(x, 1)
        T.hit({ ...x, k: 1 })
        T.hit({ ...x, t: t + 0.03, k: 1, p: pitch * 0.7 })
        break
      case 'quake':
        // The boss crashing back down: the biggest single hit, with debris after
        boom(x, 1.4)
        T.hit({ ...x, k: 1 })
        noise(c, o, t, { dur: 1.6, vol: 0.6, attack: 0.05, filter: 'lowpass', f: 380, f2: 60, wob: [9, 80] })
        crackle(c, o, t + 0.1, 0.9, 30, 0.45, 1400)
        break
      case 'dash':
        noise(c, o, t, { dur: 0.55, vol: 0.9, attack: 0.08, filter: 'bandpass', f: 400, f2: 3800, q: 1.2 })
        T.cast({ ...x, len: 0.5 })
        boom({ ...x, t: t + 0.32 }, 0.8, 0.8)
        if (fam === 'electric') {
          crackle(c, o, t, 0.6, 40, 0.7, 3000)
          osc(c, o, t, { type: 'sawtooth', f: 1400, f2: 90, dur: 0.45, vol: 0.4, dist: true })
        }
        break
      case 'takeoff':
        // Wings and a rush of air, rising out of earshot
        for (let i = 0; i < 3; i++) noise(c, o, t, { at: i * 0.14, dur: 0.16, vol: 0.7 - i * 0.12, attack: 0.05, filter: 'lowpass', f: 700, f2: 300 })
        noise(c, o, t, { dur: 0.9, vol: 0.8, attack: 0.25, filter: 'bandpass', f: 300, f2: 5000, q: 1.6 })
        osc(c, o, t, { type: 'sawtooth', f: 90, f2: 480, dur: 0.8, vol: 0.3, attack: 0.2, vib: [16, 30] })
        break
      case 'teleport':
        // Vwip: folding out of the world and snapping back somewhere else
        osc(c, o, t, { type: 'sine', f: 2400, f2: 160, dur: 0.14, vol: 0.6 })
        osc(c, o, t, { at: 0.12, type: 'sine', f: 140, f2: 2600, dur: 0.18, vol: 0.6 })
        osc(c, o, t, { at: 0.12, type: 'triangle', f: 210, f2: 3900, dur: 0.18, vol: 0.3 })
        noise(c, o, t, { at: 0.28, dur: 0.35, vol: 0.6, filter: 'bandpass', f: 3000, f2: 500, q: 2 })
        ;[1568, 2093, 2637].forEach((f, i) => osc(c, o, t, { at: 0.3 + i * 0.04, type: 'sine', f, dur: 0.5, vol: 0.18, vib: [9, 14] }))
        boom({ ...x, t: t + 0.3 }, 0.45, 0.6)
        break
      case 'wind': {
        // Delta Stream: a howling gale for as long as it blows
        const d = Math.max(1, dur)
        noise(c, o, t, { dur: d, vol: 0.9, attack: Math.min(1.2, d * 0.3), filter: 'bandpass', f: 500, q: 0.7, wob: [0.45, 320] })
        noise(c, o, t, { dur: d, vol: 0.5, attack: Math.min(1, d * 0.3), filter: 'lowpass', f: 180, wob: [0.3, 60] })
        osc(c, o, t, { type: 'sine', f: 760, dur: d, vol: 0.12, attack: d * 0.4, vib: [0.7, 140] })
        break
      }
      case 'tornado': {
        const d = Math.max(1, dur)
        noise(c, o, t, { dur: d, vol: 0.8, attack: 0.4, filter: 'bandpass', f: 650, q: 2.2, wob: [2.6, 380] })
        noise(c, o, t, { dur: d, vol: 0.55, attack: 0.3, filter: 'lowpass', f: 150, wob: [1.3, 50] })
        break
      }
      case 'arc':
        // Lightning jumping between two masts
        crackle(c, o, t, 0.35, 45, 0.9, 2200)
        osc(c, o, t, { type: 'sawtooth', f: 110, dur: 0.45, vol: 0.5, dist: true, vib: [55, 25] })
        noise(c, o, t, { dur: 0.08, vol: 1, filter: 'highpass', f: 1800 })
        boom(x, 0.55, 0.7)
        break
      case 'vent':
        // Lava bursting out of a vent
        boom(x, 0.8, 0.9)
        noise(c, o, t, { dur: 1.1, vol: 0.8, attack: 0.05, filter: 'bandpass', f: 600, f2: 180, q: 0.8 })
        for (let i = 0; i < 10; i++) osc(c, o, t, { at: r(0.1, 0.9), type: 'sine', f: r(70, 130), f2: r(200, 340), dur: 0.09, vol: 0.4 })
        crackle(c, o, t, 1, 26, 0.5, 2500)
        break
      case 'grid':
        // The floor grid firing: a psychic chord and a hard zap
        ;[220, 277, 330, 440].forEach((f) => osc(c, o, t, { type: 'square', f, f2: f * 0.5, dur: 0.6, vol: 0.18, vib: [23, 12] }))
        noise(c, o, t, { dur: 0.5, vol: 0.8, filter: 'bandpass', f: 3500, f2: 300, q: 1.5 })
        boom(x, 0.6, 0.7)
        break
      case 'shatter':
        // Ice cracking (small) or a whole pillar coming down (big)
        for (let i = 0; i < 8 + s * 10; i++) osc(c, o, t, { at: r(0, 0.25 * s), type: 'sine', f: r(1800, 6200), dur: r(0.08, 0.3), vol: 0.22 })
        noise(c, o, t, { dur: 0.25 + s * 0.4, vol: 0.8, filter: 'highpass', f: 2500 })
        if (s > 0.7) boom(x, 0.7, 0.8)
        break
      case 'intro':
        // The boss makes itself known: a rumble that swells into a hit
        noise(c, o, t, { dur: 1.4, vol: 0.7, attack: 1, filter: 'lowpass', f: 120, f2: 500 })
        osc(c, o, t, { type: 'sawtooth', f: 40, f2: 80, dur: 1.2, vol: 0.4, attack: 1, dist: true })
        boom({ ...x, t: t + 1.05 }, 1, 1.3)
        T.hit({ ...x, t: t + 1.05, k: 1 })
        break
      case 'enrage':
        // Power surging: a rising chord, then a blast
        ;[1, 1.5, 2].forEach((mul) => osc(c, o, t, { type: 'sawtooth', f: 70 * mul, f2: 280 * mul, dur: 0.8, vol: 0.22, attack: 0.6, dist: true }))
        noise(c, o, t, { dur: 0.8, vol: 0.6, attack: 0.7, filter: 'bandpass', f: 200, f2: 4000, q: 1 })
        boom({ ...x, t: t + 0.75 }, 1.1, 1.3)
        T.hit({ ...x, t: t + 0.75, k: 1 })
        break
      case 'clones':
        // Two mirror images shimmering into being
        ;[440, 443, 660, 664, 880].forEach((f, i) => osc(c, o, t, { at: i * 0.05, type: 'sine', f, dur: 1.2, vol: 0.2, attack: 0.4, vib: [5, 9] }))
        noise(c, o, t, { dur: 1, vol: 0.4, attack: 0.5, filter: 'bandpass', f: 1200, f2: 4000, q: 4 })
        break
      case 'down':
        // The boss goes down: three blasts and a long collapse
        for (let i = 0; i < 3; i++) boom({ ...x, t: t + i * 0.28 }, 1 - i * 0.15, 1.2 + i * 0.3)
        T.hit({ ...x, k: 1 })
        osc(c, o, t, { type: 'sawtooth', f: 420, f2: 35, dur: 1.8, vol: 0.3, dist: true })
        noise(c, o, t, { at: 0.4, dur: 2.6, vol: 0.55, attack: 0.3, filter: 'lowpass', f: 600, f2: 60 })
        crackle(c, o, t + 0.3, 1.6, 40, 0.4, 1200)
        break
    }
  }, gain >= 0.99)
}
