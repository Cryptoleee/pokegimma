/**
 * Soundtrack engine in the spirit of the Nintendo DS (Black/White) sound chip:
 * sampled-sounding brass and strings, marimba/bell leads, slap and synth bass,
 * punchy drums, orchestra hits and a bit of hall reverb, all made with WebAudio.
 * Works live (lookahead scheduler) and offline (render a whole track at once).
 */

export type Inst = 'pulse' | 'pulse12' | 'brass' | 'strings' | 'bell' | 'slap' | 'synbass' | 'tri' | 'saw'

export interface Track {
  title: string
  bpm: number
  loop: boolean
  /** Lead melody, one string per bar: 16 steps, note (C5, F#4, Bb3), '-' hold, '.' rest. */
  lead: string[]
  /** Optional second voice (harmony / counter melody), same notation. */
  lead2?: string[]
  chords: string[]
  barsPerChord?: number
  /** 16 steps: R root, O octave, F fifth, 3 third, '-' hold, '.' rest. */
  bass: string
  /** 16 steps with chord tone indexes 0-3 (3 = root an octave up), '.' rest. */
  arp?: string
  arpOct?: number
  /** Held chord each bar. */
  pad?: boolean
  inst: { lead: Inst; lead2?: Inst; bass: Inst; arp?: Inst; pad?: Inst }
  /** Drum lines, 16 chars: k kick, s snare, h hat, o open hat, t tom, c crash, x clap, X orchestra hit. */
  drums: string[]
  /** Drum lines for the last bar of every 4 (fills). */
  fill?: string[]
  /** Drum lines for the second half (the B part), if different. */
  drumsB?: string[]
  /** Crash on the first beat every N bars. */
  crashEvery?: number
  /** Shuffle the off 16ths (0..0.3). */
  swing?: number
  /** Overall volume trim. */
  gain?: number
}

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }

function midi(n: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n)
  return m ? NOTE[m[1]] + (Number(m[2]) + 1) * 12 : 60
}
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

/** Chord tones from a name like Am, F#m7, CM7, G7, Bb. */
function chordTones(c: string, octave: number): number[] {
  const m = /^([A-G][#b]?)(m7|M7|m|7)?$/.exec(c)
  if (!m) return [60, 64, 67]
  const root = NOTE[m[1]] + (octave + 1) * 12
  const q = m[2] ?? ''
  const third = q.startsWith('m') && q !== 'M7' ? 3 : 4
  const t = [root, root + third, root + 7]
  if (q === '7' || q === 'm7') t.push(root + 10)
  if (q === 'M7') t.push(root + 11)
  return t
}

// ---------------------------------------------------------------- the rack

interface Rack {
  ctx: BaseAudioContext
  /** Everything ends here: fade and disconnect this to stop a track. */
  master: GainNode
  out: GainNode
  verb: GainNode
  delay: GainNode
  noise: AudioBuffer
  p25: PeriodicWave
  p12: PeriodicWave
}

function pulseWave(ctx: BaseAudioContext, duty: number) {
  const n = 64, real = new Float32Array(n), imag = new Float32Array(n)
  for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty)
  return ctx.createPeriodicWave(real, imag)
}

/** Build the mixer: compressor, hall reverb send and a dotted-8th echo send. */
export function makeRack(ctx: BaseAudioContext, dest: AudioNode, bpm: number): Rack {
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.18
  const master = ctx.createGain()
  comp.connect(master).connect(dest)
  const out = ctx.createGain()
  out.gain.value = 0.72
  out.connect(comp)
  // Reverb: decaying stereo noise impulse
  const len = Math.floor(ctx.sampleRate * 1.8)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
  }
  const conv = ctx.createConvolver()
  conv.buffer = ir
  const verb = ctx.createGain()
  verb.gain.value = 0.22
  verb.connect(conv).connect(comp)
  // Echo
  const dl = ctx.createDelay(1)
  dl.delayTime.value = (60 / bpm) * 0.75
  const fb = ctx.createGain()
  fb.gain.value = 0.28
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2600
  const delay = ctx.createGain()
  delay.gain.value = 0.16
  delay.connect(dl)
  dl.connect(lp).connect(fb).connect(dl)
  lp.connect(comp)
  const nlen = ctx.sampleRate
  const noise = ctx.createBuffer(1, nlen, ctx.sampleRate)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1
  return { ctx, master, out, verb, delay, noise, p25: pulseWave(ctx, 0.25), p12: pulseWave(ctx, 0.125) }
}

function env(g: GainNode, t: number, a: number, peak: number, sus: number, dur: number, rel: number) {
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.setTargetAtTime(peak * sus, t + a, 0.12)
  g.gain.setTargetAtTime(0, t + Math.max(a + 0.01, dur), rel)
}

function osc(r: Rack, type: OscillatorType | 'p25' | 'p12', f: number, t: number, stop: number, detune = 0) {
  const o = r.ctx.createOscillator()
  if (type === 'p25') o.setPeriodicWave(r.p25)
  else if (type === 'p12') o.setPeriodicWave(r.p12)
  else o.type = type
  o.frequency.setValueAtTime(f, t)
  o.detune.value = detune
  o.start(t)
  o.stop(stop)
  return o
}

/** Sends a voice to the dry mix plus reverb / echo. */
function route(r: Rack, node: AudioNode, wet: number, echo = 0) {
  node.connect(r.out)
  if (wet) {
    const s = r.ctx.createGain()
    s.gain.value = wet
    node.connect(s).connect(r.verb)
  }
  if (echo) {
    const s = r.ctx.createGain()
    s.gain.value = echo
    node.connect(s).connect(r.delay)
  }
}

/** Play one note on an instrument. */
function play(r: Rack, inst: Inst, m: number, t: number, dur: number, vol: number) {
  const ctx = r.ctx, f = hz(m), end = t + dur + 0.35
  const g = ctx.createGain()
  switch (inst) {
    case 'pulse':
    case 'pulse12': {
      const o = osc(r, inst === 'pulse' ? 'p25' : 'p12', f, t, end)
      // Delayed vibrato, like the DS leads
      if (dur > 0.2) {
        const lfo = osc(r, 'sine', 5.5, t, end)
        const lg = ctx.createGain()
        lg.gain.setValueAtTime(0, t)
        lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.35))
        lfo.connect(lg).connect(o.frequency)
      }
      env(g, t, 0.006, vol, 0.7, dur, 0.04)
      o.connect(g)
      route(r, g, 0.25, inst === 'pulse' ? 0.6 : 0)
      return
    }
    case 'brass': {
      // Two detuned saws through a filter that blooms open: the BW trumpet
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.Q.value = 2
      lp.frequency.setValueAtTime(f * 1.2, t)
      lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 7), t + 0.06)
      lp.frequency.setTargetAtTime(f * 3.2, t + 0.08, 0.25)
      for (const d of [-7, 7]) osc(r, 'sawtooth', f, t, end, d).connect(lp)
      if (dur > 0.25) {
        const lfo = osc(r, 'sine', 5.2, t, end)
        const lg = ctx.createGain()
        lg.gain.setValueAtTime(0, t + 0.15)
        lg.gain.linearRampToValueAtTime(f * 0.01, t + 0.4)
        lfo.connect(lg)
        // vibrato on both saws via the filter input isn't possible; wobble the filter instead
        lg.connect(lp.frequency)
      }
      env(g, t, 0.025, vol, 0.75, dur, 0.06)
      lp.connect(g)
      route(r, g, 0.3, 0.25)
      return
    }
    case 'strings': {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = Math.min(7000, f * 5)
      for (const d of dur > 0.3 ? [-11, 0, 9] : [-8, 8]) osc(r, 'sawtooth', f, t, end, d).connect(lp)
      env(g, t, dur > 0.4 ? 0.09 : 0.012, vol, 0.85, dur, 0.12)
      lp.connect(g)
      route(r, g, 0.45)
      return
    }
    case 'bell': {
      // Marimba / glockenspiel: sine with a couple of inharmonic partials, quick decay
      for (const [mul, a, dec] of [[1, 1, 0.5], [4, 0.25, 0.08], [9.8, 0.08, 0.03]] as const) {
        const o = osc(r, 'sine', f * mul, t, t + 1.4)
        const pg = ctx.createGain()
        pg.gain.setValueAtTime(vol * a, t)
        pg.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, Math.min(1.2, dur * 2)) * (dec * 2))
        o.connect(pg).connect(g)
      }
      g.gain.value = 1
      route(r, g, 0.35, 0.35)
      return
    }
    case 'slap': {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.Q.value = 6
      lp.frequency.setValueAtTime(f * 14, t)
      lp.frequency.exponentialRampToValueAtTime(f * 2, t + 0.12)
      osc(r, 'square', f, t, end).connect(lp)
      osc(r, 'triangle', f, t, end).connect(lp)
      env(g, t, 0.003, vol, 0.55, dur * 0.9, 0.03)
      lp.connect(g)
      route(r, g, 0.05)
      return
    }
    case 'synbass': {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.Q.value = 4
      lp.frequency.setValueAtTime(f * 10, t)
      lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + 0.15)
      osc(r, 'sawtooth', f, t, end).connect(lp)
      osc(r, 'sawtooth', f / 2, t, end, 5).connect(lp)
      env(g, t, 0.004, vol, 0.7, dur * 0.95, 0.03)
      lp.connect(g)
      route(r, g, 0.05)
      return
    }
    case 'saw': {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = Math.min(8000, f * 6)
      osc(r, 'sawtooth', f, t, end, -5).connect(lp)
      osc(r, 'sawtooth', f, t, end, 5).connect(lp)
      env(g, t, 0.006, vol, 0.6, dur, 0.04)
      lp.connect(g)
      route(r, g, 0.25, 0.4)
      return
    }
    case 'tri': {
      osc(r, 'triangle', f, t, end).connect(g)
      env(g, t, 0.004, vol, 0.85, dur * 0.95, 0.03)
      route(r, g, 0.05)
      return
    }
  }
}

function drum(r: Rack, kind: string, t: number, level: number) {
  const ctx = r.ctx
  const noise = (type: BiquadFilterType, freq: number, q: number, vol: number, dur: number, wet = 0.15) => {
    const s = ctx.createBufferSource()
    s.buffer = r.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol * level, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f).connect(g)
    route(r, g, wet)
    s.start(t, Math.random() * 0.5)
    s.stop(t + dur + 0.05)
  }
  const tone = (f0: number, f1: number, vol: number, dur: number, type: OscillatorType = 'sine', wet = 0.05) => {
    const o = osc(r, type, f0, t, t + dur + 0.05)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol * level, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    route(r, g, wet)
  }
  switch (kind) {
    case 'k':
      tone(150, 42, 0.55, 0.2)
      noise('lowpass', 1200, 1, 0.12, 0.02, 0)
      break
    case 's':
      tone(240, 160, 0.14, 0.1, 'triangle', 0.2)
      noise('bandpass', 2200, 0.8, 0.32, 0.16, 0.3)
      break
    case 'x':
      for (let i = 0; i < 3; i++) noise('bandpass', 1500, 1.2, 0.22, 0.03 + i * 0.03, 0.35)
      break
    case 'h':
      noise('highpass', 8000, 1, 0.07, 0.035, 0.05)
      break
    case 'o':
      noise('highpass', 7000, 1, 0.07, 0.22, 0.1)
      break
    case 't':
      tone(190, 90, 0.35, 0.28, 'sine', 0.25)
      break
    case 'c':
      noise('highpass', 5000, 0.6, 0.14, 1.4, 0.4)
      break
  }
}

/** Orchestra hit: a stab of brass + strings on the chord, with a burst of noise. */
function orchHit(r: Rack, chord: string, t: number) {
  for (const m of chordTones(chord, 4)) {
    play(r, 'brass', m, t, 0.32, 0.07)
    play(r, 'strings', m + 12, t, 0.32, 0.04)
  }
  play(r, 'brass', chordTones(chord, 3)[0], t, 0.32, 0.09)
  drum(r, 'c', t, 0.6)
}

// ---------------------------------------------------------------- sequencing

const VOL: Record<Inst, number> = { pulse: 0.075, pulse12: 0.03, brass: 0.11, strings: 0.045, bell: 0.16, slap: 0.2, synbass: 0.13, tri: 0.22, saw: 0.06 }

/** Schedule one 16th step of a track (bar, step) at time t. */
function step(r: Rack, tr: Track, bar: number, s: number, t: number, sd: number) {
  const chord = tr.chords[Math.floor(bar / (tr.barsPerChord ?? 1)) % tr.chords.length]
  const gain = tr.gain ?? 1
  const melody = (line: string[] | undefined, inst: Inst | undefined, vol: number) => {
    if (!line || !inst) return
    const toks = line[bar % line.length].split(/\s+/)
    const tok = toks[s]
    if (!tok || tok === '-' || tok === '.') return
    let len = 1
    while (s + len < 16 && toks[s + len] === '-') len++
    play(r, inst, midi(tok), t, len * sd, VOL[inst] * vol * gain)
  }
  melody(tr.lead, tr.inst.lead, 1)
  melody(tr.lead2, tr.inst.lead2, 0.7)
  // Bass
  const b = tr.bass[s]
  if (b && b !== '.' && b !== '-') {
    let len = 1
    while (s + len < 16 && tr.bass[s + len] === '-') len++
    const ct = chordTones(chord, 2)
    const m = b === 'O' ? ct[0] + 12 : b === 'F' ? ct[2] : b === '3' ? ct[1] : ct[0]
    play(r, tr.inst.bass, m, t, len * sd, VOL[tr.inst.bass] * gain)
  }
  // Arpeggio
  if (tr.arp && tr.inst.arp) {
    const a = tr.arp[s]
    if (a && a !== '.') {
      const ct = chordTones(chord, tr.arpOct ?? 4)
      const i = Number(a)
      const m = i === 3 ? ct[0] + 12 : ct[i % ct.length]
      play(r, tr.inst.arp, m, t, sd * 0.9, VOL[tr.inst.arp] * gain)
    }
  }
  // Pad
  if (tr.pad && s === 0) for (const m of chordTones(chord, 4)) play(r, tr.inst.pad ?? 'strings', m, t, sd * 16, VOL[tr.inst.pad ?? 'strings'] * 0.7 * gain)
  // Drums
  const lines = tr.fill && bar % 4 === 3 ? tr.fill : tr.drumsB && bar >= tr.lead.length / 2 ? tr.drumsB : tr.drums
  for (const line of lines) {
    const d = line[s]
    if (!d || d === '.') continue
    if (d === 'X') orchHit(r, chord, t)
    else drum(r, d, t, gain)
  }
  if (tr.crashEvery && s === 0 && bar % tr.crashEvery === 0) drum(r, 'c', t, gain)
}

function stepTime(tr: Track, n: number, sd: number) {
  // Swing pushes the off 16ths later
  return n * sd + (n % 2 ? (tr.swing ?? 0) * sd : 0)
}

/** Render a track (or a fixed length) into an offline context and return the buffer. */
export async function renderTrack(tr: Track, seconds?: number, sampleRate = 44100): Promise<AudioBuffer> {
  const sd = 60 / tr.bpm / 4
  const total = tr.lead.length * 16
  const len = seconds ?? total * sd + 2
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sampleRate), sampleRate)
  const r = makeRack(ctx, ctx.destination, tr.bpm)
  for (let n = 0; ; n++) {
    const i = tr.loop ? n % total : n
    if (!tr.loop && n >= total) break
    const t = 0.05 + stepTime(tr, n, sd)
    if (t > len - 0.2) break
    step(r, tr, Math.floor(i / 16), i % 16, t, sd)
  }
  return ctx.startRendering()
}

/** Render several tracks back to back (e.g. a trailer score), each for a number of bars. */
export async function renderSequence(parts: { track: Track; bars: number }[], tail = 2.5, sampleRate = 44100): Promise<AudioBuffer> {
  const sd = 60 / parts[0].track.bpm / 4
  const len = parts.reduce((s, p) => s + p.bars * 16, 0) * sd + tail
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sampleRate), sampleRate)
  const r = makeRack(ctx, ctx.destination, parts[0].track.bpm)
  let n = 0
  for (const p of parts)
    for (let i = 0; i < p.bars * 16; i++, n++) step(r, p.track, Math.floor(i / 16), i % 16, 0.02 + stepTime(p.track, n, sd), sd)
  return ctx.startRendering()
}

/** Live player with a lookahead scheduler. Tempo can change while it plays. */
export class Player {
  private r: Rack | null = null
  private tr: Track | null = null
  private n = 0
  /** Grid time of the next step (swing is added on top). */
  private next = 0
  private timer: number | undefined
  tempo = 1
  onStep?: (bar: number, step: number) => void
  constructor(private ctx: AudioContext, private dest: AudioNode) {}

  play(tr: Track | null) {
    this.stop()
    this.tr = tr
    if (!tr) return
    this.r = makeRack(this.ctx, this.dest, tr.bpm)
    this.n = 0
    this.next = this.ctx.currentTime + 0.08
    this.timer = window.setInterval(() => this.tick(), 25)
    this.tick()
  }

  get playing() {
    return this.tr
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
    if (this.r) {
      const m = this.r.master
      m.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04)
      setTimeout(() => m.disconnect(), 600)
      this.r = null
    }
    this.tr = null
  }

  private tick() {
    const tr = this.tr, r = this.r
    if (!tr || !r) return
    const total = tr.lead.length * 16
    // Back from a background tab: skip what was missed instead of playing it all at once
    if (this.next < this.ctx.currentTime - 0.25) this.next = this.ctx.currentTime + 0.05
    while (this.next < this.ctx.currentTime + 0.15) {
      if (this.n >= total && !tr.loop) {
        this.stop()
        return
      }
      const sd = 60 / (tr.bpm * this.tempo) / 4
      const t = this.next + (this.n % 2 ? (tr.swing ?? 0) * sd : 0)
      const i = this.n % total, bar = Math.floor(i / 16), s = i % 16
      step(r, tr, bar, s, t, sd)
      if (this.onStep) setTimeout(() => this.onStep?.(bar, s), Math.max(0, (t - this.ctx.currentTime) * 1000))
      this.n++
      this.next += sd
    }
  }
}
