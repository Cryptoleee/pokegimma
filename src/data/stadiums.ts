import { L } from '../i18n'
import type { ThemeId, Weather } from './themes'

/**
 * 1 vs 1 stadiums: a battle field with lines and a Poké Ball in the middle,
 * stands full of people around it. Each one has its own floor and layout
 * (mirrored, so both sides are the same); the palette comes from a world theme.
 */

export type StadiumId = 'classic' | 'desert' | 'ice' | 'water' | 'volcano'

export interface StadiumDef {
  id: StadiumId
  name: string
  icon: string
  /** One line for the loading screen. */
  tip: string
  /** Palette (grass, sand, rocks, water or lava) and weather. */
  theme: ThemeId
  weather: Weather
  /** Seat colours: [your side (bottom), their side (top), the long sides]. */
  seats: [string, string, string]
  /** Field lines and the emblem. */
  lines: string
}

export const STADIUMS: Record<StadiumId, StadiumDef> = {
  classic: {
    id: 'classic', get name() { return L('Pokémon Stadium', 'Pokémon Stadion') }, icon: '🏟️',
    get tip() { return L('Hide in the hedges on the flanks; the statues by the middle block shots.', 'Verstop je in de hagen langs de zijkant; de beelden bij het midden houden aanvallen tegen.') },
    theme: 'forest', weather: 'none', seats: ['#d84848', '#4870d8', '#6a6a88'], lines: 'rgba(255,255,255,0.8)',
  },
  desert: {
    id: 'desert', get name() { return L('Desert Arena', 'Woestijnarena') }, icon: '🏜️',
    get tip() { return L('Boulders give cover; the dry grass hides you.', 'Rotsblokken geven dekking; in het droge gras ben je onzichtbaar.') },
    theme: 'desert', weather: 'none', seats: ['#e08030', '#8a50c0', '#8a7058'], lines: 'rgba(255,250,235,0.75)',
  },
  ice: {
    id: 'ice', get name() { return L('Ice Rink', 'IJsbaan') }, icon: '❄️',
    get tip() { return L('The rink in the middle is slippery; the snow at the edges gives grip.', 'De ijsbaan in het midden is glad; op de sneeuw langs de rand heb je grip.') },
    theme: 'snow', weather: 'snow', seats: ['#3890e0', '#e04870', '#7888a8'], lines: 'rgba(220,60,80,0.75)',
  },
  water: {
    id: 'water', get name() { return L('Water Arena', 'Waterarena') }, icon: '🌊',
    get tip() { return L('Two pools split the field: cross the bridges or shoot over the water.', 'Twee bassins splitsen het veld: neem de bruggen of schiet over het water.') },
    theme: 'forest', weather: 'none', seats: ['#30a0d0', '#f0a030', '#5878a0'], lines: 'rgba(255,255,255,0.75)',
  },
  volcano: {
    id: 'volcano', get name() { return L('Volcano Arena', 'Vulkaanarena') }, icon: '🌋',
    get tip() { return L('Lava pools block the way, but not your attacks.', 'Lavapoelen versperren de weg, maar niet je aanvallen.') },
    theme: 'volcano', weather: 'embers', seats: ['#e04030', '#303848', '#584848'], lines: 'rgba(255,200,120,0.7)',
  },
}

export const STADIUM_LIST: StadiumId[] = ['classic', 'desert', 'ice', 'water', 'volcano']

/** A stadium from a choice ('random' picks one from the seed). */
export function pickStadium(c: StadiumId | 'random' | undefined, seed: number): StadiumId {
  if (c && c !== 'random' && c in STADIUMS) return c
  return STADIUM_LIST[Math.floor(Math.abs(Math.sin(seed * 78.233) * 43758.5453) % 1 * STADIUM_LIST.length)]
}
