import { audioCtx, channelOn, onAudioChange } from './audio'
import { PACKS, type Slot } from './data/soundtracks'
import { Player } from './synth'

/**
 * The game's soundtrack: "Castelia Nights", an original set in the Pokémon
 * Black/White (Nintendo DS) style, played live by the synth in synth.ts.
 */

const PACK = PACKS.find((p) => p.id === 'castelia')!

let player: Player | null = null
let current: Slot | null = null
let musicBus: GainNode | null = null
let ducked = false
const level = () => (channelOn('music') ? (ducked ? 0.3 : 0.85) : 0)

/** Turn the music down while the announcer speaks. */
export function duckMusic(on: boolean) {
  ducked = on
  const ctx = audioCtx()
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(level(), ctx.currentTime, on ? 0.06 : 0.35)
}

function ensure(): Player | null {
  if (player) return player
  const ctx = audioCtx()
  if (!ctx) return null
  const bus = ctx.createGain()
  musicBus = bus
  bus.gain.value = level()
  bus.connect(ctx.destination)
  onAudioChange(() => bus.gain.setTargetAtTime(level(), ctx.currentTime, 0.05))
  player = new Player(ctx, bus)
  return player
}

/** Switch to a song (no-op if it's already playing). */
export function playMusic(name: Slot | null) {
  const p = ensure()
  if (!p) return
  if (name === current && p.playing) return
  current = name
  p.tempo = 1
  p.play(name ? PACK.tracks[name] : null)
}

/** Speed up the current song (the storm closing in, a raid's last phase). */
export function setTempo(mul: number) {
  if (player) player.tempo = mul
}

/** What's playing (for debugging). */
export const currentMusic = () => (player?.playing ? current : null)
