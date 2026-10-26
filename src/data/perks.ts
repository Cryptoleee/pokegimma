import { L } from '../i18n'

/**
 * Raid roles and perks. At the start of a raid every player picks a role:
 * Tank, Healer or Striker. Each has a passive (always on) and an ability you
 * fire yourself (space / B). In a dungeon, every cleared room lets you pick one
 * upgrade out of three, from your role or for anyone (like a survivors game).
 * The host applies all of it; everyone sees each player's role on the field.
 */
export type RaidRole = 'tank' | 'healer' | 'striker'
export const RAID_ROLES: RaidRole[] = ['tank', 'healer', 'striker']

export interface RoleDef {
  icon: string
  color: string
  name: () => string
  passive: () => string
  ability: () => string
  abilityText: () => string
  /** Seconds between uses of its ability. */
  cd: number
}

export const ROLE_DEF: Record<RaidRole, RoleDef> = {
  tank: {
    icon: '🛡️',
    color: '#58a8ff',
    name: () => L('Tank', 'Tank'),
    passive: () => L('+30% HP, 15% less damage taken, foes go for you more often', '+30% HP, 15% minder schade, vijanden kiezen vaker jou'),
    ability: () => L('Taunt', 'Uitdagen'),
    abilityText: () => L('Every foe close by comes for you, and you take half damage for 4 s', 'Elke vijand dichtbij komt op jou af, en je krijgt 4 s de helft schade'),
    cd: 16,
  },
  healer: {
    icon: '✚',
    color: '#58e080',
    name: () => L('Healer', 'Healer'),
    passive: () => L('A healing aura: you and teammates in it slowly regain HP', 'Een helende aura: jij en teamgenoten erin krijgen langzaam HP terug'),
    ability: () => L('Healing wave', 'Helende golf'),
    abilityText: () => L('Heals you and every teammate close by for 30% at once', 'Geneest jou en elke teamgenoot dichtbij in één keer 30%'),
    cd: 18,
  },
  striker: {
    icon: '⚔️',
    color: '#ff6a48',
    name: () => L('Striker', 'Striker'),
    passive: () => L('+20% damage', '+20% schade'),
    ability: () => L('Fury', 'Furie'),
    abilityText: () => L('+40% damage and your moves recharge twice as fast for 6 s', '+40% schade en je aanvallen laden 6 s twee keer zo snel op'),
    cd: 20,
  },
}

/** The role your partner suits (a default if you don't pick in time). */
export function roleFor(partnerRole: string): RaidRole {
  return partnerRole === 'defender' ? 'tank' : partnerRole === 'allrounder' ? 'healer' : 'striker'
}

export interface UpgradeDef {
  id: string
  role: RaidRole | 'any'
  /** How often it can be taken. */
  max: number
  name: () => string
  text: () => string
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'tank_hp', role: 'tank', max: 2, name: () => L('Thick skin', 'Dikke huid'), text: () => L('+15% max HP', '+15% max HP') },
  { id: 'tank_wall', role: 'tank', max: 1, name: () => L('Stone wall', 'Stenen muur'), text: () => L('Taunt lasts 2 s longer, 10% less damage taken', 'Uitdagen duurt 2 s langer, 10% minder schade') },
  { id: 'tank_aggro', role: 'tank', max: 1, name: () => L('Loudmouth', 'Grote bek'), text: () => L('Foes go for you even more; Taunt recharges 4 s faster', 'Vijanden kiezen nog vaker jou; Uitdagen laadt 4 s sneller op') },
  { id: 'heal_aura', role: 'healer', max: 2, name: () => L('Wide aura', 'Brede aura'), text: () => L('Your aura reaches 1.5 tiles further', 'Je aura reikt 1,5 tegel verder') },
  { id: 'heal_pow', role: 'healer', max: 2, name: () => L('Soothing aura', 'Zachte aura'), text: () => L('Your aura heals 1% more per second', 'Je aura geneest 1% meer per seconde') },
  { id: 'heal_wave', role: 'healer', max: 1, name: () => L('Big wave', 'Grote golf'), text: () => L('Healing wave heals 20% more and recharges 4 s faster', 'Helende golf geneest 20% meer en laadt 4 s sneller op') },
  { id: 'dmg_up', role: 'striker', max: 2, name: () => L('Sharp claws', 'Scherpe klauwen'), text: () => L('+10% damage', '+10% schade') },
  { id: 'dmg_fury', role: 'striker', max: 1, name: () => L('Rage', 'Razernij'), text: () => L('Fury lasts 3 s longer', 'Furie duurt 3 s langer') },
  { id: 'dmg_cd', role: 'striker', max: 1, name: () => L('Quick hands', 'Snelle handen'), text: () => L('Your moves recharge 12% faster', 'Je aanvallen laden 12% sneller op') },
  { id: 'any_speed', role: 'any', max: 1, name: () => L('Light feet', 'Lichte voeten'), text: () => L('+10% walking speed', '+10% loopsnelheid') },
  { id: 'any_potion', role: 'any', max: 1, name: () => L('Medic bag', 'Dokterstas'), text: () => L('Potions heal 75% instead of 50%, and +1 Potion now', 'Potions genezen 75% in plaats van 50%, en nu +1 Potion') },
  { id: 'any_life', role: 'any', max: 1, name: () => L('Second wind', 'Tweede adem'), text: () => L('+1 life', '+1 leven') },
]

export const upgradeOf = (id: string) => UPGRADES.find((u) => u.id === id)
