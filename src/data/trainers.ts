export interface TrainerLook {
  hat?: string
  hatBand?: string
  hair: string
  longHair?: boolean
  bigHair?: boolean
  skin: string
  shirt: string
  shirtAccent: string
  pants: string
  shoes: string
}

export interface TrainerDef {
  key: string
  name: string
  look: TrainerLook
}

const SKIN = '#f8d0a8'

export const TRAINERS: TrainerDef[] = [
  { key: 'hilbert', name: 'Hilbert', look: { hat: '#e83030', hatBand: '#f8f8f8', hair: '#5a3418', skin: SKIN, shirt: '#3870c8', shirtAccent: '#f8f8f8', pants: '#303040', shoes: '#d83030' } },
  { key: 'hilda', name: 'Hilda', look: { hat: '#f8f8f8', hatBand: '#f05880', hair: '#6a3a18', longHair: true, skin: SKIN, shirt: '#f8f8f8', shirtAccent: '#303040', pants: '#3878d8', shoes: '#f05880' } },
  { key: 'cheren', name: 'Cheren', look: { hair: '#202028', skin: SKIN, shirt: '#3858b0', shirtAccent: '#d83030', pants: '#383848', shoes: '#202028' } },
  { key: 'bianca', name: 'Bianca', look: { hat: '#58b048', hatBand: '#f8f8f8', hair: '#f0d050', skin: SKIN, shirt: '#f09830', shirtAccent: '#f8f8f8', pants: '#f8f8f8', shoes: '#58b048' } },
  { key: 'n', name: 'N', look: { hat: '#202028', hatBand: '#f8f8f8', hair: '#78c890', longHair: true, skin: SKIN, shirt: '#f0f0f0', shirtAccent: '#202028', pants: '#c8b890', shoes: '#606070' } },
  { key: 'iris', name: 'Iris', look: { hair: '#7848a8', bigHair: true, skin: '#c89068', shirt: '#f8f0d8', shirtAccent: '#f080a8', pants: '#f8f0d8', shoes: '#f0c040' } },
]

export function trainerPortraitUrl(key: string): string {
  return `https://play.pokemonshowdown.com/sprites/trainers/${key}.png`
}

export const BOT_NAMES = [
  'Ace Trainer Kai', 'Youngster Joey', 'Lass Mila', 'Hiker Bram', 'Veteran Ruben', 'Backpacker Noor',
  'Psychic Luna', 'Black Belt Sem', 'Swimmer Tess', 'Ranger Daan', 'Breeder Fleur', 'Scientist Jules',
  'Biker Thijs', 'Artist Lieke', 'Pilot Stijn', 'Clerk Fenna',
]
