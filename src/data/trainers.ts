export interface TrainerDef {
  key: string
  name: string
  /** Pokémon Showdown trainer sprite id (Black/White battle art). */
  sprite: string
}

/** Playable trainers (BW + BW2 protagonists and rivals). */
export const TRAINERS: TrainerDef[] = [
  { key: 'hilbert', name: 'Hilbert', sprite: 'hilbert' },
  { key: 'hilda', name: 'Hilda', sprite: 'hilda' },
  { key: 'nate', name: 'Nate', sprite: 'nate' },
  { key: 'rosa', name: 'Rosa', sprite: 'rosa' },
  { key: 'cheren', name: 'Cheren', sprite: 'cheren' },
  { key: 'bianca', name: 'Bianca', sprite: 'bianca' },
  { key: 'n', name: 'N', sprite: 'n' },
  { key: 'iris', name: 'Iris', sprite: 'iris' },
  // Unlocked on the reward road (trainer level)
  { key: 'elesa', name: 'Elesa', sprite: 'elesa-masters' }, // standing (her BW sprite lies on the floor)
  { key: 'hugh', name: 'Hugh', sprite: 'hugh' },
  { key: 'skyla', name: 'Skyla', sprite: 'skyla' },
  { key: 'roxie', name: 'Roxie', sprite: 'roxie' },
  { key: 'burgh', name: 'Burgh', sprite: 'burgh' },
  { key: 'shauntal', name: 'Shauntal', sprite: 'shauntal' },
  { key: 'colress', name: 'Colress', sprite: 'colress' },
  { key: 'drayden', name: 'Drayden', sprite: 'drayden' },
  { key: 'grimsley', name: 'Grimsley', sprite: 'grimsley' },
  { key: 'steven', name: 'Steven', sprite: 'steven' },
  { key: 'lance', name: 'Lance', sprite: 'lance' },
  { key: 'cynthia', name: 'Cynthia', sprite: 'cynthia' },
  { key: 'ghetsis', name: 'Ghetsis', sprite: 'ghetsis' },
  { key: 'red', name: 'Red', sprite: 'red' },
]

/** Rival trainer classes; the sprite matches the class in the name. */
export const BOT_TRAINERS: TrainerDef[] = [
  { key: 'acetrainer', name: 'Ace Trainer Kai', sprite: 'acetrainer' },
  { key: 'acetrainerf', name: 'Ace Trainer Mila', sprite: 'acetrainerf' },
  { key: 'youngster', name: 'Youngster Joey', sprite: 'youngster' },
  { key: 'lass', name: 'Lass Noor', sprite: 'lass' },
  { key: 'hiker', name: 'Hiker Bram', sprite: 'hiker' },
  { key: 'veteran', name: 'Veteran Ruben', sprite: 'veteran' },
  { key: 'backpacker', name: 'Backpacker Thijs', sprite: 'backpacker' },
  { key: 'backpackerf', name: 'Backpacker Fenna', sprite: 'backpackerf' },
  { key: 'psychic', name: 'Psychic Sem', sprite: 'psychic' },
  { key: 'psychicf', name: 'Psychic Luna', sprite: 'psychicf' },
  { key: 'blackbelt', name: 'Black Belt Daan', sprite: 'blackbelt' },
  { key: 'swimmerf', name: 'Swimmer Tess', sprite: 'swimmerf' },
  { key: 'pokemonranger', name: 'Ranger Stijn', sprite: 'pokemonranger' },
  { key: 'pokemonrangerf', name: 'Ranger Fleur', sprite: 'pokemonrangerf' },
  { key: 'pokemonbreeder', name: 'Breeder Lieke', sprite: 'pokemonbreederf' },
  { key: 'scientist', name: 'Scientist Jules', sprite: 'scientist' },
  { key: 'biker', name: 'Biker Rik', sprite: 'biker' },
  { key: 'artist', name: 'Artist Vince', sprite: 'artist' },
]

export function trainerSpriteUrl(sprite: string): string {
  return `https://play.pokemonshowdown.com/sprites/trainers/${sprite}.png`
}
