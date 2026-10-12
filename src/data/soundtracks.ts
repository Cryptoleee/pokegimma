import type { Track } from '../synth'
import { L } from '../i18n'

/**
 * Three original soundtracks in the Pokémon Black/White (Nintendo DS) style.
 * Each has the same slots so the game can swap the whole set at once.
 */

export type Slot = 'title' | 'menu' | 'battle' | 'boss' | 'victory' | 'defeat'

export interface Pack {
  id: string
  name: string
  blurb: string
  color: string
  tracks: Record<Slot, Track>
}

// Shared drum grooves (16 steps)
const MARCH = ['k.....k.k.......', '....s.......s...', 'h.h.h.h.h.h.h.h.']
const MARCH_FILL = ['k.....k.k.......', '....s.......ssss', 'h.h.h.h.h.h.....']
const DRIVE = ['k.....k...k.....', '....s.......s...', 'h.hhh.hhh.hhh.hh']
const DRIVE_FILL = ['k.....k...k.....', '....s.....s.ssss', 'h.hhh.hhh.......']
const CALM = ['k.......k.....k.', '....x.......x...', '..h...h...h...h.']
const FOUR = ['k...k...k...k...', '....x.......x...', '..o...o...o...o.', 'h.h.h.h.h.h.h.h.']
const FOUR_FILL = ['k...k...k...k...', '....x.......xsss', '..o...o...o.....', 'h.h.h.h.h.h.....']
const EPIC = ['k..k..k...k..k..', '....s.......s...', 'hhhhhhhhhhhhhhhh']
const EPIC_FILL = ['k..k..k...k..k..', '....s...t.t.tttt', 'hhhhhhhh........']

const DEFEAT: Track = {
  get title() { return L('Defeat', 'Verslagen') }, bpm: 84, loop: false,
  chords: ['Am', 'F', 'Dm', 'E'],
  lead: [
    'E5 - - - C5 - - - A4 - - - - - - -',
    'F5 - - - C5 - - - A4 - - - - - - -',
    'D5 - - - A4 - - - F4 - - - - - - -',
    'E4 - - - G#4 - - - B4 - - - - - - -',
  ],
  bass: 'R-------R-------', pad: true, drums: [],
  inst: { lead: 'pulse', bass: 'tri', pad: 'strings' },
}

export const PACKS: Pack[] = [
  {
    id: 'unova',
    get name() { return L('Unova Hero', 'Unova Held') },
    get blurb() { return L('Heroic brass, strings and a slap bass. Closest to the routes and trainer battles of Black/White.', 'Heroïsch koper, strijkers en een slapbas. Het dichtst bij de routes en trainergevechten van Black/White.') },
    color: '#ff9a3a',
    tracks: {
      title: {
        get title() { return L('Title', 'Titel') }, bpm: 120, loop: true, crashEvery: 8,
        chords: ['D', 'Bm', 'G', 'A', 'D', 'F#m', 'G', 'A'],
        lead: [
          'D5 - - - - - A4 - D5 - E5 - F#5 - - -',
          'F#5 - - - E5 - D5 - E5 - - - B4 - - -',
          'G4 - - - B4 - D5 - G5 - - - F#5 - G5 -',
          'A5 - - - - - - - E5 - - - C#5 - - -',
          'D5 - - - - - A4 - D5 - E5 - F#5 - A5 -',
          'C#6 - - - B5 - A5 - F#5 - - - E5 - C#5 -',
          'D5 - - - E5 - F#5 - G5 - - - B5 - - -',
          'A5 - - - - - - - - - - - . . . .',
        ],
        bass: 'R---R-O-R---F-O-', arp: '0120312031203120', arpOct: 4, pad: true,
        inst: { lead: 'brass', bass: 'slap', arp: 'pulse12', pad: 'strings' },
        drums: MARCH, fill: MARCH_FILL,
      },
      menu: {
        title: 'Menu', bpm: 100, loop: true, swing: 0.12,
        chords: ['G', 'Em', 'C', 'D', 'G', 'Bm', 'C', 'D'],
        lead: [
          'B5 - - - D6 - B5 - G5 - - - A5 - B5 -',
          'G5 - - - E5 - - - - - D5 - E5 - - -',
          'C6 - - - B5 - A5 - G5 - - - E5 - G5 -',
          'A5 - - - - - F#5 - - - D5 - - - - -',
          'B5 - - - D6 - B5 - G5 - - - A5 - B5 -',
          'D6 - - - C#6 - B5 - F#5 - - - - - - -',
          'E5 - G5 - C6 - - - B5 - A5 - G5 - E5 -',
          'F#5 - - - A5 - - - D6 - - - - - - -',
        ],
        bass: 'R...R.O.R...O.R.', arp: '0.1.2.1.0.1.2.1.', arpOct: 4,
        inst: { lead: 'bell', bass: 'slap', arp: 'pulse12' },
        drums: CALM,
      },
      battle: {
        get title() { return L('Battle', 'Gevecht') }, bpm: 168, loop: true, crashEvery: 8,
        chords: ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'Am', 'B7'],
        lead: [
          'E5 - - B4 - - E5 - G5 - - F#5 - - E5 -',
          'G5 - - - - - E5 - C5 - D5 - E5 - G5 -',
          'F#5 - - A5 - - D6 - - - C6 - B5 - A5 -',
          'B5 - - - - - - - F#5 - - - D5 - F#5 -',
          'E6 - - D6 - - B5 - G5 - - A5 - - B5 -',
          'C6 - - B5 - - G5 - E5 - - - G5 - C6 -',
          'A5 - - G5 - - E5 - C5 - E5 - A5 - C6 -',
          'B5 - - - - - - - D#6 - - - F#6 - - -',
        ],
        bass: 'R.R.O.R.R.R.O.RO', arp: '0123012301230123', arpOct: 4,
        inst: { lead: 'brass', bass: 'slap', arp: 'strings' },
        drums: DRIVE, fill: DRIVE_FILL,
      },
      boss: {
        get title() { return L('Raid Boss', 'Raid-baas') }, bpm: 176, loop: true,
        chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A7'],
        lead: [
          'D5 - - - A5 - - - G5 - F5 - E5 - F5 -',
          'D5 - - - - - - - . . A4 - D5 - E5 -',
          'F5 - - - D5 - - - Bb5 - - - A5 - G5 -',
          'G5 - - - - - E5 - C5 - - - E5 - G5 -',
          'A5 - - - D6 - - - C6 - Bb5 - A5 - G5 -',
          'F5 - - - E5 - D5 - - - - - D5 - F5 -',
          'G5 - - - Bb5 - - - D6 - - - C6 - Bb5 -',
          'A5 - - - - - - - C#6 - - - E6 - - -',
        ],
        bass: 'R.RO.RR.R.RO.RF.', arp: '0303030303030303', arpOct: 3,
        inst: { lead: 'brass', bass: 'synbass', arp: 'strings' },
        drums: [...EPIC, 'X...............'], fill: EPIC_FILL,
      },
      victory: {
        get title() { return L('Victory', 'Overwinning') }, bpm: 132, loop: false,
        chords: ['C', 'F', 'G', 'C'],
        lead: [
          'C5 . C5 . C5 . G5 - - - E5 - G5 - - -',
          'A5 - - - F5 - A5 - C6 - - - A5 - - -',
          'B5 - - - G5 - B5 - D6 - - - F6 - - -',
          'E6 - - - - - - - C6 - - - - - - -',
        ],
        bass: 'R...R...R.O.R...', arp: '0120012001200120', pad: true,
        inst: { lead: 'brass', bass: 'slap', arp: 'pulse12', pad: 'strings' },
        drums: ['k.......k.......', '....s.......s...', 'c...............'],
      },
      defeat: DEFEAT,
    },
  },
  {
    id: 'castelia',
    name: 'Castelia Nights',
    get blurb() { return L('Jazzy city chords, marimba and a synth bass on all four beats. Think Castelia City and the Pokémon Musical.', 'Jazzy stadsakkoorden, marimba en een synthbas op de vier tellen. Denk aan Castelia City en de Pokémon Musical.') },
    color: '#58c8ff',
    tracks: {
      title: {
        get title() { return L('Title', 'Titel') }, bpm: 116, loop: true, gain: 1.3, crashEvery: 8,
        chords: ['FM7', 'Em7', 'Dm7', 'CM7', 'FM7', 'Em7', 'Dm7', 'CM7', 'Dm7', 'G7', 'Em7', 'Am7', 'Dm7', 'G7', 'CM7', 'C7'],
        lead: [
          'A5 - - - G5 - A5 - C6 - - - A5 - - -',
          'G5 - - - - - E5 - D5 - E5 - G5 - - -',
          'F5 - - - E5 - F5 - A5 - - - C6 - - -',
          'B5 - - - - - - - G5 - - - E5 - - -',
          'A5 - - - G5 - A5 - C6 - - - E6 - - -',
          'D6 - - - B5 - G5 - E5 - - - G5 - - -',
          'A5 - - - G5 - F5 - E5 - - - D5 - - -',
          'E5 - - - - - - - . . . . . . . .',
          // B
          'F5 - - - A5 - C6 - - - A5 - G5 - F5 -',
          'D5 - - - - - B4 - D5 - F5 - - - G5 -',
          'G5 - - - B5 - D6 - - - B5 - A5 - G5 -',
          'E5 - - - - - - - C6 - - - A5 - - -',
          'D6 - - - C6 - A5 - F5 - - - A5 - D6 -',
          'B5 - - - - - G5 - F5 - - - D5 - - -',
          'E5 - - - G5 - B5 - E6 - - - D6 - - -',
          'C6 - - - - - - - Bb5 - - - G5 - - -',
        ],
        lead2: [
          '. . . . . . . . E5 - - - C5 - - -',
          '. . . . . . . . B4 - - - D5 - - -',
          '. . . . . . . . F5 - - - A5 - - -',
          '. . . . . . . . D5 - - - B4 - - -',
        ],
        bass: 'R..R..R.-.R..O..', arp: '0.2.1.3.0.2.1.3.', arpOct: 5,
        inst: { lead: 'pulse', lead2: 'bell', bass: 'synbass', arp: 'bell' },
        drums: FOUR, fill: FOUR_FILL, drumsB: ['k...k...k...k...', '....x.......x...', '..o...o...o...o.', 'hhhhhhhhhhhhhhhh'],
      },
      menu: {
        title: 'Menu', bpm: 98, loop: true, gain: 1.3, swing: 0.18,
        chords: ['CM7', 'Am7', 'Dm7', 'G7', 'CM7', 'Am7', 'Dm7', 'G7', 'FM7', 'Em7', 'Dm7', 'CM7', 'FM7', 'Em7', 'Dm7', 'G7'],
        lead: [
          'E5 - G5 - B5 - - - A5 - G5 - E5 - - -',
          'C5 - - - E5 - - - A5 - - - G5 - - -',
          'F5 - A5 - C6 - - - B5 - A5 - F5 - - -',
          'G5 - - - - - - - D5 - F5 - B5 - - -',
          'E5 - G5 - B5 - - - D6 - C6 - B5 - - -',
          'A5 - - - G5 - E5 - C5 - - - E5 - - -',
          'D5 - F5 - A5 - C6 - B5 - - - A5 - - -',
          'G5 - - - - - - - . . . . . . . .',
          // B
          'A5 - - - C6 - - - E6 - - - C6 - - -',
          'B5 - - - G5 - - - E5 - - - - - - -',
          'F5 - - - A5 - C6 - D6 - - - C6 - A5 -',
          'G5 - - - - - E5 - - - - - . . . .',
          'C6 - - - A5 - F5 - A5 - - - C6 - E6 -',
          'D6 - - - B5 - G5 - E5 - - - G5 - - -',
          'F5 - - - E5 - D5 - C5 - - - D5 - F5 -',
          'B4 - - - D5 - - - F5 - - - G5 - - -',
        ],
        bass: 'R...O...R.R.O...', arp: '..1...2...1...3.', arpOct: 4, pad: true,
        inst: { lead: 'bell', bass: 'slap', arp: 'pulse12', pad: 'strings' },
        drums: CALM, drumsB: ['k.......k.....k.', '....x.......x...', '..h.h.h...h.h.h.'],
      },
      battle: {
        get title() { return L('Battle', 'Gevecht') }, bpm: 160, loop: true, gain: 1.3, crashEvery: 8,
        chords: ['Am', 'F', 'G', 'Em', 'Am', 'F', 'Dm', 'E', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'E'],
        lead: [
          'A5 - - - E5 - A5 - C6 - B5 - A5 - E5 -',
          'F5 - - - - - A5 - C6 - - - A5 - F5 -',
          'G5 - - - D5 - G5 - B5 - A5 - G5 - D5 -',
          'E5 - - - - - - - B5 - - - G5 - E5 -',
          'A5 - - - C6 - E6 - D6 - C6 - B5 - A5 -',
          'C6 - - - A5 - F5 - A5 - - - C6 - F6 -',
          'F6 - - - E6 - D6 - A5 - - - F5 - D5 -',
          'E5 - - - G#5 - B5 - E6 - - - - - - -',
          // B: climbing to the climax
          'C6 - - - A5 - - - F5 - A5 - C6 - F6 -',
          'D6 - - - B5 - - - G5 - B5 - D6 - G6 -',
          'E6 - - - B5 - G5 - E5 - G5 - B5 - E6 -',
          'C6 - - - - - - - A5 - - - E5 - - -',
          'F5 - - - A5 - D6 - F6 - - - E6 - D6 -',
          'D6 - - - B5 - G5 - D6 - - - G6 - - -',
          'E6 - - - G6 - - - E6 - C6 - G5 - E5 -',
          'G#5 - - - B5 - - - E6 - - - G#6 - - -',
        ],
        bass: 'R.O.R.O.R.O.R.O.', arp: '0121012101210121', arpOct: 5,
        inst: { lead: 'pulse', bass: 'synbass', arp: 'pulse12' },
        drums: FOUR, fill: FOUR_FILL, drumsB: ['k...k...k...k...', '....x.......x...', '..o...o...o...o.', 'hhhhhhhhhhhhhhhh'],
      },
      boss: {
        get title() { return L('Raid Boss', 'Raid-baas') }, bpm: 172, loop: true, gain: 1.3, crashEvery: 4,
        chords: ['Cm', 'Ab', 'Bb', 'G', 'Cm', 'Ab', 'Fm', 'G7', 'Ab', 'Bb', 'Gm', 'Cm', 'Ab', 'Bb', 'G', 'G7'],
        lead: [
          'C5 - - - G5 - - - Eb5 - D5 - C5 - G4 -',
          'Ab4 - - - C5 - Eb5 - Ab5 - - - G5 - Eb5 -',
          'F5 - - - D5 - Bb4 - D5 - F5 - Bb5 - - -',
          'B5 - - - - - G5 - D5 - - - B4 - - -',
          'C6 - - - Bb5 - G5 - Eb5 - - - G5 - C6 -',
          'Eb6 - - - C6 - Ab5 - Eb5 - - - Ab5 - C6 -',
          'F6 - - - Eb6 - C6 - Ab5 - - - F5 - Ab5 -',
          'G5 - - - - - - - B5 - - - D6 - - -',
          // B
          'Eb6 - - - C6 - - - Ab5 - C6 - Eb6 - - -',
          'F6 - - - D6 - - - Bb5 - D6 - F6 - - -',
          'G6 - - - D6 - Bb5 - G5 - Bb5 - D6 - G6 -',
          'Eb6 - - - - - C6 - - - G5 - - - - -',
          'C6 - - - Eb6 - Ab6 - G6 - F6 - Eb6 - C6 -',
          'D6 - - - F6 - Bb6 - Ab6 - G6 - F6 - D6 -',
          'B5 - - - D6 - G6 - F6 - D6 - B5 - G5 -',
          'G5 - G5 - B5 - - - D6 - - - F6 - - -',
        ],
        bass: 'R.R.R.O.R.R.R.O.', arp: '0123210301232103', arpOct: 4,
        inst: { lead: 'saw', bass: 'synbass', arp: 'pulse12' },
        drums: ['k...k...k...k...', '....s.......s...', 'hhhhhhhhhhhhhhhh'], fill: EPIC_FILL,
        drumsB: ['k...k...k...k.k.', '....s..s....s...', 'hhhhhhhhhhhhhhhh', 'X.......X.......'],
      },
      victory: {
        get title() { return L('Victory', 'Overwinning') }, bpm: 128, loop: false, gain: 1.3,
        chords: ['FM7', 'G', 'Em7', 'CM7'],
        lead: [
          'C6 - A5 - F5 - A5 - C6 - - - E6 - - -',
          'D6 - B5 - G5 - B5 - D6 - - - G6 - - -',
          'E6 - - - D6 - B5 - G5 - - - B5 - - -',
          'C6 - - - - - - - - - - - . . . .',
        ],
        bass: 'R...R...R.O.R...', arp: '0123012301230123', arpOct: 5,
        inst: { lead: 'bell', bass: 'synbass', arp: 'pulse12' },
        drums: ['k...k...k...k...', '....x.......x...', 'c...............'],
      },
      defeat: DEFEAT,
    },
  },
  {
    id: 'legend',
    get name() { return L('Legend', 'Legende') },
    get blurb() { return L('Dramatic and orchestral: string tremolo, orchestra hits and timpani. In the mood of Dragonspiral Tower and the legendary battle.', 'Dramatisch en orkestraal: strijkers-tremolo, orkesthits en pauken. In de sfeer van de Dragonspiral Tower en het legendarische gevecht.') },
    color: '#c070ff',
    tracks: {
      title: {
        get title() { return L('Title', 'Titel') }, bpm: 108, loop: true,
        chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'E', 'E'],
        lead: [
          'A4 - - - - - E5 - A5 - - - - - B5 -',
          'C6 - - - - - B5 - A5 - - - F5 - - -',
          'G5 - - - - - E5 - C5 - - - E5 - G5 -',
          'D5 - - - - - - - - - - - . . . .',
          'A4 - - - - - E5 - A5 - - - - - B5 -',
          'C6 - - - - - D6 - E6 - - - F6 - - -',
          'E6 - - - - - - - D6 - - - B5 - - -',
          'G#5 - - - - - - - E5 - - - - - - -',
        ],
        bass: 'R-------R---O---', arp: '0303030303030303', arpOct: 3, pad: true,
        inst: { lead: 'brass', bass: 'tri', arp: 'strings', pad: 'strings' },
        drums: ['t.......t...t...', 'X...............'], fill: ['t.......t.t.tttt', 'X...............'],
      },
      menu: {
        title: 'Menu', bpm: 92, loop: true,
        chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'B'],
        lead: [
          'B4 - - - E5 - G5 - B5 - - - A5 - G5 -',
          'E5 - - - - - - - C5 - D5 - E5 - - -',
          'D5 - - - G5 - B5 - D6 - - - C6 - B5 -',
          'A5 - - - - - - - F#5 - - - - - - -',
          'B4 - - - E5 - G5 - B5 - - - E6 - - -',
          'D6 - - - C6 - - - G5 - - - E5 - - -',
          'C5 - - - E5 - A5 - C6 - B5 - A5 - - -',
          'B5 - - - - - - - D#5 - - - F#5 - - -',
        ],
        bass: 'R-------F---R---', arp: '0.1.2.3.2.1.0.1.', arpOct: 4, pad: true,
        inst: { lead: 'bell', bass: 'tri', arp: 'pulse12', pad: 'strings' },
        drums: ['k.......k.......', '............x...'],
      },
      battle: {
        get title() { return L('Battle', 'Gevecht') }, bpm: 152, loop: true, crashEvery: 8,
        chords: ['Gm', 'Eb', 'F', 'D', 'Gm', 'Eb', 'Cm', 'D7'],
        lead: [
          'G5 - - - D5 - G5 - Bb5 - - - A5 - G5 -',
          'G5 - - - Eb5 - - - Bb4 - Eb5 - G5 - - -',
          'A5 - - - F5 - - - C6 - - - Bb5 - A5 -',
          'F#5 - - - - - - - D5 - - - A4 - - -',
          'G5 - - - Bb5 - D6 - G6 - - - F6 - D6 -',
          'Eb6 - - - D6 - Bb5 - G5 - - - Bb5 - Eb6 -',
          'C6 - - - Bb5 - G5 - Eb5 - - - G5 - C6 -',
          'D6 - - - - - - - F#6 - - - A6 - - -',
        ],
        bass: 'R.ROR.RFR.ROR.RF', arp: '0102010201020102', arpOct: 4,
        inst: { lead: 'brass', bass: 'slap', arp: 'strings' },
        drums: DRIVE, fill: EPIC_FILL,
      },
      boss: {
        get title() { return L('Raid Boss', 'Raid-baas') }, bpm: 180, loop: true,
        chords: ['Bm', 'G', 'A', 'F#', 'Bm', 'G', 'Em', 'F#7'],
        lead: [
          'B5 - - - F#5 - - - B5 - C#6 - D6 - - -',
          'D6 - - - B5 - G5 - D5 - - - G5 - B5 -',
          'C#6 - - - A5 - E5 - C#5 - - - E5 - A5 -',
          'A#5 - - - - - - - F#5 - - - C#6 - - -',
          'D6 - - - C#6 - B5 - F#6 - - - E6 - D6 -',
          'B5 - - - - - G5 - B5 - D6 - G6 - - -',
          'E6 - - - D6 - B5 - G5 - - - E5 - G5 -',
          'F#5 - - - - - - - A#5 - - - C#6 - E6 -',
        ],
        lead2: [
          'D5 - - - - - - - F#5 - - - - - - -',
          'B4 - - - - - - - D5 - - - - - - -',
          'E5 - - - - - - - C#5 - - - - - - -',
          'C#5 - - - - - - - F#5 - - - - - - -',
        ],
        bass: 'R.RR.RR.R.RR.ROR', arp: '0303030303030303', arpOct: 3,
        inst: { lead: 'brass', lead2: 'strings', bass: 'synbass', arp: 'strings' },
        drums: [...EPIC, 'X.......X.......'], fill: EPIC_FILL,
      },
      victory: {
        get title() { return L('Victory', 'Overwinning') }, bpm: 120, loop: false,
        chords: ['D', 'G', 'A', 'D'],
        lead: [
          'D5 . D5 . D5 . A5 - - - F#5 - A5 - - -',
          'B5 - - - G5 - B5 - D6 - - - B5 - - -',
          'C#6 - - - A5 - C#6 - E6 - - - G6 - - -',
          'F#6 - - - - - - - D6 - - - - - - -',
        ],
        bass: 'R-------R---O---', arp: '0303030303030303', arpOct: 3, pad: true,
        inst: { lead: 'brass', bass: 'tri', arp: 'strings', pad: 'strings' },
        drums: ['t.......t.t.t...', 'X...............'],
      },
      defeat: DEFEAT,
    },
  },
]
