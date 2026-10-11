import { audioCtx, isMuted, onMuteChange } from './audio'
import { PACKS, type Slot } from './data/soundtracks'
import { Player } from './synth'

/**
 * The game's soundtrack: "Castelia Nights", an original set in the Pokémon
 * Black/White (Nintendo DS) style, played live by the synth in synth.ts.
 */

const PACK = PACKS.find((p) => p.id === 'castelia')!

let player: Player | null = null
let current: Slot | null = null

function ensure(): Player | null {
  if (player) return player
  const ctx = audioCtx()
  if (!ctx) return null
  const bus = ctx.createGain()
  bus.gain.value = isMuted() ? 0 : 0.85
  bus.connect(ctx.destination)
  onMuteChange((m) => bus.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05))
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
