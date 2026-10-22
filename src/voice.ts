import { audioCtx, audioOut, channelOn, onAudioChange } from './audio'
import { duckMusic } from './music'

/**
 * The announcer: recorded lines (ElevenLabs) for the big moments. One line at
 * a time; the music ducks while he speaks. Big moments cut in, small ones
 * (level up, gotcha, ...) are skipped when he's already talking.
 */

export type VoiceLine =
  | 'title' | 'br_intro' | 'raid_reshiram' | 'raid_kyurem' | 'raid_zekrom' | 'raid_rayquaza' | 'raid_mewtwo'
  | 'count3' | 'count2' | 'count1' | 'go'
  | 'storm' | 'final_circle' | 'supply' | 'swarm' | 'legendary' | 'ko' | 'win' | 'lose'
  | 'enraged' | 'final_phase' | 'raid_win' | 'raid_fail' | 'levelup' | 'evolve' | 'caught' | 'new_move'

const URLS = import.meta.glob('./assets/voice/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const urlOf = (l: VoiceLine) => URLS[`./assets/voice/${l}.mp3`]

/** Small lines: dropped if he's busy, and not repeated too often. */
const MINOR: Partial<Record<VoiceLine, number>> = { levelup: 12, caught: 4, new_move: 6, evolve: 2, ko: 2 }
const VOLUME = 0.6

const raw = new Map<VoiceLine, Promise<ArrayBuffer | null>>()
const decoded = new Map<VoiceLine, Promise<AudioBuffer | null>>()
const lastSaid = new Map<VoiceLine, number>()
let bus: GainNode | null = null
let speaking: AudioBufferSourceNode | null = null
/** Lines actually spoken (for testing). */
export const voiceLog: VoiceLine[] = []

function fetchRaw(l: VoiceLine) {
  let p = raw.get(l)
  if (!p) {
    const url = urlOf(l)
    p = url ? fetch(url).then((r) => r.arrayBuffer()).catch(() => null) : Promise.resolve(null)
    raw.set(l, p)
  }
  return p
}

function buffer(ctx: AudioContext, l: VoiceLine) {
  let p = decoded.get(l)
  if (!p) {
    p = fetchRaw(l).then((b) => (b ? ctx.decodeAudioData(b.slice(0)).catch(() => null) : null))
    decoded.set(l, p)
  }
  return p
}

/** Download the lines early so the first ones play without a delay. */
export function preloadVoice(lines: VoiceLine[] = Object.keys(URLS).map((k) => k.slice(15, -4) as VoiceLine)) {
  const ctx = audioCtx()
  for (const l of lines) (ctx ? buffer(ctx, l) : fetchRaw(l))
}

function stop() {
  if (!speaking) return
  speaking.onended = null
  try {
    speaking.stop()
  } catch {
    /* already stopped */
  }
  speaking = null
  duckMusic(false)
}

onAudioChange(() => {
  if (!channelOn('voice')) stop()
})

/** Say a line (no-op while voices are off). */
export function say(l: VoiceLine) {
  const ctx = audioCtx()
  if (!ctx || !channelOn('voice')) return
  const now = performance.now()
  const minor = MINOR[l]
  if (minor !== undefined) {
    if (speaking || now - (lastSaid.get(l) ?? -1e9) < minor * 1000) return
  }
  lastSaid.set(l, now)
  void buffer(ctx, l).then((buf) => {
    // Too late (slow network) or switched off meanwhile: skip it
    if (!buf || !channelOn('voice') || performance.now() - now > 1500) return
    if (minor !== undefined && speaking) return
    stop()
    if (!bus) {
      bus = ctx.createGain()
      bus.gain.value = VOLUME
      bus.connect(audioOut())
    }
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.connect(bus)
    s.onended = () => {
      if (speaking === s) {
        speaking = null
        duckMusic(false)
      }
    }
    speaking = s
    voiceLog.push(l)
    duckMusic(true)
    s.start()
  })
}
