/**
 * World themes: palette, decor style, tile mix and weather. Battle royale maps
 * pick one per match; raid arenas have their own.
 */

export type ThemeId = 'forest' | 'desert' | 'snow' | 'volcano' | 'night' | 'crater' | 'icecave' | 'plateau' | 'sky' | 'lab'

/** What stands where trees would: also decides how the blocked border looks. */
export type DecorStyle = 'oak' | 'pine' | 'cactus' | 'dead' | 'cliff' | 'icewall' | 'sky' | 'labwall'
export type Weather = 'none' | 'rain' | 'snow' | 'sand' | 'ash' | 'embers' | 'fireflies' | 'wind' | 'psy'

export interface WorldTheme {
  id: ThemeId
  name: string
  icon: string
  /** Shown in battle royale world pickers. */
  royale: boolean
  /** [base, dark specks, light specks] */
  grass: [string, string, string]
  /** [base, dark blades, light blades] */
  tall: [string, string, string]
  /** [base, specks, edge] */
  path: [string, string, string]
  /** [base, specks] */
  sand: [string, string]
  /** 'lava' animates as glowing lava instead of waves (still blocks movement). */
  liquid: 'water' | 'lava' | 'ice'
  /** [base, wave, foam, shade] */
  water: [string, string, string, string]
  decor: DecorStyle
  /** [shadow, base A, base B, base C, highlight] for canopies / decor tops */
  canopy: [string, string, string, string, string]
  /** [ground shadow, trunk, trunk dark] */
  trunk: [string, string, string]
  /** [outline, base, highlight] */
  rock: [string, string, string]
  flowers: string[]
  /** Colour behind the map edge. */
  border: string
  weather: Weather
  /** Full-screen tint over the world (night, heat haze). */
  tint?: string
  /** Darker cinematic vignette (night). */
  dark?: boolean
  /** Thresholds for the noise-based tile mix (battle royale layout). */
  mix: { water: number; sand: number; tree: number; tall: number; flower: number; rock: number }
  /** Minimap colours for the main tiles. */
  mini: { grass: string; tall: string; path: string; sand: string; water: string; tree: string }
}

const FOREST: WorldTheme = {
  id: 'forest', name: 'Bos', icon: '🌳', royale: true,
  grass: ['#78c860', '#60b050', '#98d878'],
  tall: ['#4c9c44', '#2e6e30', '#7ccc5c'],
  path: ['#e8d098', '#d0b478', '#a8c870'],
  sand: ['#f0e0a8', '#dcc888'],
  liquid: 'water',
  water: ['#5890e8', '#80b0f8', '#d0e8ff', '#3870c0'],
  decor: 'oak',
  canopy: ['#1c4a28', '#2c7a3c', '#2a7238', '#307e40', '#68c060'],
  trunk: ['#3a6a30', '#6a4a2a', '#4a3018'],
  rock: ['#585860', '#a8a8b0', '#d8d8e0'],
  flowers: ['#f05858', '#f8d038', '#f890c0', '#ffffff'],
  border: '#1c4a28',
  weather: 'none',
  mix: { water: 0.3, sand: 0.34, tree: 0.63, tall: 0.5, flower: 0.04, rock: 0.006 },
  mini: { grass: '#78c060', tall: '#4a9a40', path: '#e0c890', sand: '#f0e0a0', water: '#5890e8', tree: '#2c6a34' },
}

export const THEMES: Record<ThemeId, WorldTheme> = {
  forest: FOREST,
  desert: {
    ...FOREST, id: 'desert', name: 'Woestijn', icon: '🏜️',
    grass: ['#e8c878', '#d4b060', '#f4dc98'],
    tall: ['#b8a050', '#7a6a30', '#d8c070'],
    path: ['#d8b070', '#c09858', '#c8a860'],
    sand: ['#f4dca0', '#e0c080'],
    water: ['#40b0c8', '#78d0e0', '#e0f4f0', '#2890a8'],
    decor: 'cactus',
    canopy: ['#2a5a30', '#4a9a48', '#48944a', '#52a250', '#88d070'],
    trunk: ['#c8a868', '#4a8a40', '#2e6a2c'],
    rock: ['#7a5a40', '#c09070', '#e0c0a0'],
    flowers: ['#e8603c', '#f0a030', '#c050a0'],
    border: '#8a6838',
    weather: 'sand',
    tint: 'rgba(255,170,60,0.08)',
    mix: { water: 0.22, sand: 0.42, tree: 0.7, tall: 0.6, flower: 0.01, rock: 0.02 },
    mini: { grass: '#e8c878', tall: '#b8a050', path: '#d8b070', sand: '#f4dca0', water: '#40b0c8', tree: '#4a8a40' },
  },
  snow: {
    ...FOREST, id: 'snow', name: 'Sneeuw', icon: '❄️',
    grass: ['#eef4fa', '#d4e0ee', '#ffffff'],
    tall: ['#b8d0dc', '#7898b0', '#e0eef6'],
    path: ['#c8d4e0', '#aebccc', '#dce8f2'],
    sand: ['#dfe8f0', '#c4d2e0'],
    water: ['#3a78b0', '#6aa0d0', '#e8f4ff', '#28588a'],
    decor: 'pine',
    canopy: ['#163a30', '#22584a', '#205448', '#265e50', '#f4faff'],
    trunk: ['#c8d8e4', '#5a4030', '#3a2818'],
    rock: ['#58606c', '#a0acb8', '#eef4fa'],
    flowers: ['#a0d0ff', '#ffffff'],
    border: '#163a30',
    weather: 'snow',
    tint: 'rgba(120,170,255,0.06)',
    mix: { water: 0.28, sand: 0.3, tree: 0.6, tall: 0.5, flower: 0.01, rock: 0.012 },
    mini: { grass: '#e8f0f8', tall: '#b8d0dc', path: '#c8d4e0', sand: '#dfe8f0', water: '#3a78b0', tree: '#22584a' },
  },
  volcano: {
    ...FOREST, id: 'volcano', name: 'Vulkaan', icon: '🌋',
    grass: ['#5a4a48', '#4a3c3a', '#6e5c58'],
    tall: ['#6a5a3a', '#3e3220', '#8a7448'],
    path: ['#7a6a5a', '#665646', '#4e4040'],
    sand: ['#3a3236', '#2c2629'],
    liquid: 'lava',
    water: ['#e8501c', '#ffb030', '#fff0a0', '#a02810'],
    decor: 'dead',
    canopy: ['#1a1414', '#2e2422', '#2a201e', '#342826', '#5a4440'],
    trunk: ['#2a2020', '#3a2c28', '#1e1614'],
    rock: ['#1e1a1c', '#4a4448', '#7a7276'],
    flowers: ['#ff8030', '#ffb040'],
    border: '#1a1012',
    weather: 'ash',
    tint: 'rgba(255,80,20,0.07)',
    mix: { water: 0.27, sand: 0.33, tree: 0.66, tall: 0.53, flower: 0.01, rock: 0.02 },
    mini: { grass: '#5a4a48', tall: '#6a5a3a', path: '#7a6a5a', sand: '#3a3236', water: '#e8501c', tree: '#2e2422' },
  },
  night: {
    ...FOREST, id: 'night', name: 'Nacht', icon: '🌙',
    weather: 'fireflies',
    tint: 'rgba(10,20,70,0.42)',
    dark: true,
    border: '#0c2016',
  },
  crater: {
    ...FOREST, id: 'crater', name: 'Vulkaankrater', icon: '🌋', royale: false,
    grass: ['#4a3a38', '#3a2e2c', '#5e4a46'],
    tall: ['#4a3a38', '#3a2e2c', '#5e4a46'],
    path: ['#5a4a44', '#4a3c38', '#3a2e2c'],
    sand: ['#2e2628', '#221c1e'],
    liquid: 'lava',
    water: ['#e8501c', '#ffb030', '#fff0a0', '#a02810'],
    decor: 'cliff',
    canopy: ['#140e0e', '#2e2220', '#2a1e1c', '#342624', '#6a4a40'],
    trunk: ['#1a1212', '#3a2a26', '#241a18'],
    rock: ['#1e1a1c', '#4a4448', '#7a7276'],
    border: '#140c0c',
    weather: 'embers',
    tint: 'rgba(255,70,20,0.1)',
    mini: { grass: '#4a3a38', tall: '#4a3a38', path: '#5a4a44', sand: '#2e2628', water: '#e8501c', tree: '#140e0e' },
  },
  icecave: {
    ...FOREST, id: 'icecave', name: 'IJsgrot', icon: '🧊', royale: false,
    grass: ['#bcdcf0', '#a4c8e4', '#e4f4ff'],
    tall: ['#bcdcf0', '#a4c8e4', '#e4f4ff'],
    path: ['#a8cce4', '#90b8d8', '#cce4f4'],
    sand: ['#d4e8f6', '#b8d4ea'],
    liquid: 'ice',
    water: ['#2a5a8a', '#4a80b8', '#d8f0ff', '#1a3a64'],
    decor: 'icewall',
    canopy: ['#24406a', '#4a7ab0', '#4676ac', '#5084ba', '#e8f8ff'],
    trunk: ['#7aa8d0', '#a8d0f0', '#6890c0'],
    rock: ['#4a6a90', '#9cc4e8', '#f0faff'],
    border: '#16284a',
    weather: 'snow',
    tint: 'rgba(80,140,255,0.08)',
    mini: { grass: '#bcdcf0', tall: '#bcdcf0', path: '#a8cce4', sand: '#d4e8f6', water: '#2a5a8a', tree: '#24406a' },
  },
  plateau: {
    ...FOREST, id: 'plateau', name: 'Stormtop', icon: '⛈️', royale: false,
    grass: ['#5a6474', '#4a5262', '#6e788a'],
    tall: ['#5a6474', '#4a5262', '#6e788a'],
    path: ['#646e80', '#525a6a', '#7a8496'],
    sand: ['#4a5262', '#3e4654'],
    decor: 'cliff',
    canopy: ['#12161e', '#262c38', '#222834', '#2a303c', '#6a7a98'],
    trunk: ['#14181e', '#363e4c', '#262c38'],
    rock: ['#1a1e26', '#4a5262', '#7a8496'],
    border: '#0a0c12',
    weather: 'rain',
    tint: 'rgba(30,50,120,0.18)',
    dark: true,
    mini: { grass: '#5a6474', tall: '#5a6474', path: '#646e80', sand: '#4a5262', water: '#2a5a8a', tree: '#12161e' },
  },
  sky: {
    ...FOREST, id: 'sky', name: 'Hemelpilaar', icon: '🌪️', royale: false,
    grass: ['#e8f0fa', '#d0dcee', '#ffffff'],
    tall: ['#e8f0fa', '#d0dcee', '#ffffff'],
    path: ['#d8e4f4', '#c4d2e8', '#f4f8ff'],
    sand: ['#c8d6ea', '#b4c4de'],
    decor: 'sky',
    canopy: ['#5a9ae0', '#7ab4f0', '#8cc0f4', '#a0ccf8', '#ffffff'],
    trunk: ['#7ab4f0', '#8cc0f4', '#6aa4e4'],
    rock: ['#5a6a7a', '#a8b4c0', '#e4ecf4'],
    border: '#5a9ae0',
    weather: 'wind',
    tint: 'rgba(120,200,255,0.06)',
    mini: { grass: '#e8f0fa', tall: '#e8f0fa', path: '#d8e4f4', sand: '#c8d6ea', water: '#5a9ae0', tree: '#5a9ae0' },
  },
  lab: {
    ...FOREST, id: 'lab', name: 'Psychisch lab', icon: '🧪', royale: false,
    grass: ['#3a2e58', '#30264a', '#4a3c6e'],
    tall: ['#3a2e58', '#30264a', '#4a3c6e'],
    path: ['#443666', '#382c56', '#56487c'],
    sand: ['#2e2448', '#261e3c'],
    decor: 'labwall',
    canopy: ['#140e22', '#2a2040', '#261c3a', '#30244a', '#a080e0'],
    trunk: ['#18122a', '#3a2e58', '#2a2040'],
    rock: ['#1e1830', '#5a4a80', '#a090d0'],
    border: '#0c0816',
    weather: 'psy',
    tint: 'rgba(150,80,255,0.08)',
    mini: { grass: '#3a2e58', tall: '#3a2e58', path: '#443666', sand: '#2e2448', water: '#5a3a8a', tree: '#140e22' },
  },
}

/** Worlds you can pick for a battle royale. */
export const ROYALE_THEMES: ThemeId[] = ['forest', 'desert', 'snow', 'volcano', 'night']

/** Resolve "random" to a concrete theme from the seed (same on every device). */
export function pickTheme(choice: ThemeId | 'random', seed: number): ThemeId {
  if (choice !== 'random') return choice
  return ROYALE_THEMES[Math.floor(Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1 * ROYALE_THEMES.length)]
}
