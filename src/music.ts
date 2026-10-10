import { audioCtx, isMuted, onMuteChange } from './audio'

/**
 * Original chiptune soundtrack, sequenced live with WebAudio: pulse-wave lead,
 * thin pulse arpeggios, triangle bass and noise drums, like a DS sound chip.
 * Melodies are written by hand; harmony, bass and drums follow the chord chart.
 */

type Chord = string // e.g. 'Dm', 'Bb', 'C', 'A', 'F#m'

interface Song {
  bpm: number
  /** 16 steps per bar, space separated: note (C5, F#4, Bb3), '-' hold, '.' rest */
  lead: string[]
  chords: Chord[]
  drums: 'march' | 'drive' | 'calm' | 'none'
  arp?: 'up' | 'updown' | 'pulse'
  loop: boolean
  /** Bars per chord (default 1). */
  barsPerChord?: number
}

const SONGS: Record<string, Song> = {
  // Heroic title theme in D minor
  title: {
    bpm: 118, drums: 'march', arp: 'updown', loop: true,
    chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'C', 'Bb', 'A'],
    lead: [
      'D5 - - - A4 - D5 - F5 - - - E5 - D5 -',
      'C5 - - - D5 - - - Bb4 - - - A4 - - -',
      'G4 - - - C5 - E5 - G5 - - - F5 - E5 -',
      'E5 - - - - - - - C#5 - - - - - - -',
      'F5 - - - E5 - D5 - C5 - - - D5 - F5 -',
      'G5 - - - F5 - E5 - D5 - - - - - - -',
      'Bb5 - - - A5 - G5 - F5 - - - E5 - F5 -',
      'A5 - - - - - - - A4 - C#5 - E5 - A5 -',
    ],
  },
  // Easy-going menu loop in C major
  menu: {
    bpm: 104, drums: 'calm', arp: 'up', loop: true,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
    lead: [
      'E5 - - - G5 - - - C6 - - - B5 - G5 -',
      'A5 - - - - - E5 - - - - - C5 - D5 -',
      'F5 - - - A5 - - - C6 - - - A5 - F5 -',
      'G5 - - - - - D5 - - - B4 - - - - -',
      'E5 - G5 - C6 - - - D6 - C6 - B5 - G5 -',
      'A5 - - - G5 - E5 - C5 - - - - - . .',
      'D5 - F5 - A5 - - - C6 - - - A5 - F5 -',
      'G5 - - - - - - - B4 - D5 - G5 - - -',
    ],
  },
  // Driving field / battle theme in E minor
  battle: {
    bpm: 150, drums: 'drive', arp: 'pulse', loop: true,
    chords: ['Em', 'C', 'D', 'B', 'Em', 'Am', 'D', 'B'],
    lead: [
      'E5 - G5 - B5 - - - A5 - G5 - F#5 - E5 -',
      'E5 - - - C5 - E5 - G5 - - - - - - -',
      'F#5 - A5 - D6 - - - C6 - B5 - A5 - F#5 -',
      'B5 - - - - - D#5 - F#5 - - - B4 - - -',
      'G5 - - - F#5 - E5 - D5 - - - E5 - G5 -',
      'A5 - - - G5 - F#5 - E5 - - - C5 - - -',
      'D5 - F#5 - A5 - D6 - C6 - B5 - A5 - G5 -',
      'F#5 - - - D#5 - - - B4 - D#5 - F#5 - B5 -',
    ],
  },
  victory: {
    bpm: 132, drums: 'none', arp: 'up', loop: false,
    chords: ['C', 'F', 'G', 'C'],
    lead: [
      'C5 . C5 . C5 . G5 - - - E5 - G5 - - -',
      'A5 - - - F5 - A5 - C6 - - - A5 - - -',
      'B5 - - - G5 - B5 - D6 - - - F6 - - -',
      'E6 - - - - - - - C6 - - - - - - -',
    ],
  },
  defeat: {
    bpm: 84, drums: 'none', arp: 'up', loop: false,
    chords: ['Am', 'F', 'Dm', 'E'],
    lead: [
      'E5 - - - C5 - - - A4 - - - - - - -',
      'F5 - - - C5 - - - A4 - - - - - - -',
      'D5 - - - A4 - - - F4 - - - - - - -',
      'E4 - - - G#4 - - - B4 - - - - - - -',
    ],
  },
}

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }

function midi(n: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n)
  if (!m) return 60
  return NOTE[m[1]] + (Number(m[2]) + 1) * 12
}
const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function chordNotes(c: Chord, octave: number): number[] {
  const m = /^([A-G][#b]?)(m?)(7?)$/.exec(c)!
  const root = NOTE[m[1]] + (octave + 1) * 12
  const third = m[2] ? 3 : 4
  const notes = [root, root + third, root + 7]
  if (m[3]) notes.push(root + 10)
  return notes
}

// ---------------- Player ----------------

let master: GainNode | null = null
let pulse25: PeriodicWave | null = null
let pulse12: PeriodicWave | null = null
let current: string | null = null
let timer: number | undefined
let step = 0
let nextTime = 0
let tempoMul = 1
let noiseBuf: AudioBuffer | null = null

function pulseWave(ctx: AudioContext, duty: number) {
  const n = 64
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty)
  return ctx.createPeriodicWave(real, imag)
}

function setup(ctx: AudioContext) {
  if (master) return
  master = ctx.createGain()
  master.gain.value = isMuted() ? 0 : 1
  master.connect(ctx.destination)
  pulse25 = pulseWave(ctx, 0.25)
  pulse12 = pulseWave(ctx, 0.125)
  const len = ctx.sampleRate * 0.3
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  onMuteChange((m) => master && master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05))
}

function voice(ctx: AudioContext, wave: PeriodicWave | 'triangle' | 'square' | 'sine', f: number, t: number, dur: number, vol: number) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  if (typeof wave === "string") o.type = wave as OscillatorType
  else o.setPeriodicWave(wave)
  o.frequency.setValueAtTime(f, t)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.006)
  g.gain.setTargetAtTime(vol * 0.65, t + 0.02, 0.08)
  g.gain.setTargetAtTime(0, t + Math.max(0.03, dur - 0.03), 0.02)
  o.connect(g).connect(master!)
  o.start(t)
  o.stop(t + dur + 0.15)
}

function drum(ctx: AudioContext, kind: 'k' | 's' | 'h', t: number) {
  if (kind === 'k') {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12)
    g.gain.setValueAtTime(0.32, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    o.connect(g).connect(master!)
    o.start(t)
    o.stop(t + 0.16)
    return
  }
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = kind === 'h' ? 'highpass' : 'bandpass'
  f.frequency.value = kind === 'h' ? 7000 : 1800
  const g = ctx.createGain()
  const dur = kind === 'h' ? 0.04 : 0.12
  g.gain.setValueAtTime(kind === 'h' ? 0.05 : 0.14, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(f).connect(g).connect(master!)
  s.start(t)
  s.stop(t + dur + 0.02)
}

const DRUMS: Record<Song['drums'], string> = {
  march: 'k...h.s.k.h.s.hs',
  drive: 'k.h.s.h.k.k.s.hh',
  calm: 'k.....h.....s...',
  none: '................',
}

function schedule(ctx: AudioContext) {
  const song = SONGS[current!]
  const stepDur = 60 / (song.bpm * tempoMul) / 4
  const totalSteps = song.lead.length * 16
  while (nextTime < ctx.currentTime + 0.12) {
    if (step >= totalSteps) {
      if (!song.loop) {
        stopTimer()
        return
      }
      step = 0
    }
    const bar = Math.floor(step / 16)
    const s = step % 16
    const tokens = song.lead[bar].split(/\s+/)
    const tok = tokens[s]
    const t = nextTime
    // Lead
    if (tok && tok !== '-' && tok !== '.') {
      let len = 1
      while (s + len < 16 && tokens[s + len] === '-') len++
      voice(ctx, pulse25!, freq(midi(tok)), t, len * stepDur, 0.07)
    }
    const chord = song.chords[Math.floor(bar / (song.barsPerChord ?? 1)) % song.chords.length]
    // Bass: root in 8ths with an octave hop
    if (s % 2 === 0) {
      const root = chordNotes(chord, 2)[0]
      voice(ctx, 'triangle', freq(root + (s % 8 === 4 ? 12 : 0)), t, stepDur * 1.8, 0.16)
    }
    // Arpeggio
    const notes = chordNotes(chord, 4)
    if (song.arp === 'pulse') {
      if (s % 4 === 2) for (const n of notes.slice(0, 3)) voice(ctx, pulse12!, freq(n), t, stepDur * 1.2, 0.018)
    } else {
      const seq = song.arp === 'updown' ? [...notes, ...notes.slice(1, -1).reverse()] : notes
      voice(ctx, pulse12!, freq(seq[s % seq.length] + (s >= 8 && song.arp === 'up' ? 12 : 0)), t, stepDur * 0.9, 0.02)
    }
    // Drums
    const d = DRUMS[song.drums][s]
    if (d === 'k' || d === 's' || d === 'h') drum(ctx, d, t)
    nextTime += stepDur
    step++
  }
}

function stopTimer() {
  clearInterval(timer)
  timer = undefined
}

/** Switch to a song (no-op if already playing). */
export function playMusic(name: keyof typeof SONGS | null) {
  const ctx = audioCtx()
  if (!ctx) return
  setup(ctx)
  if (name === current && timer !== undefined) return
  stopTimer()
  current = name
  tempoMul = 1
  if (!name) return
  step = 0
  nextTime = ctx.currentTime + 0.08
  timer = window.setInterval(() => schedule(ctx), 25)
  schedule(ctx)
}

/** Speed up the current song (used when the storm closes in). */
export function setTempo(mul: number) {
  tempoMul = mul
}
