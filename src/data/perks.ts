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

/**
 * Upgrades. Each role has three paths of three steps (a step needs the one
 * before it), plus upgrades for anyone. Every room you clear shows three
 * different cards: the next step of some of your paths and something for
 * anyone, never the same three you just passed on.
 */
export interface UpgradeDef {
  id: string
  role: RaidRole | 'any'
  /** Path (its name) and step 1-3; none for the anyone upgrades. */
  path?: () => string
  tier?: number
  name: () => string
  text: () => string
}

const path = (role: RaidRole, key: string, pname: () => string, steps: [() => string, () => string][]): UpgradeDef[] =>
  steps.map(([name, text], i) => ({ id: `${key}${i + 1}`, role, path: pname, tier: i + 1, name, text }))

export const UPGRADES: UpgradeDef[] = [
  // Tank
  ...path('tank', 'bulwark', () => L('Bulwark', 'Bolwerk'), [
    [() => L('Thick skin', 'Dikke huid'), () => L('+15% max HP', '+15% max HP')],
    [() => L('Stone wall', 'Stenen muur'), () => L('10% less damage taken', '10% minder schade')],
    [() => L('Last stand', 'Laatste verzet'), () => L('Below 30% HP you take 40% less damage', 'Onder 30% HP krijg je 40% minder schade')],
  ]),
  ...path('tank', 'provoke', () => L('Provoker', 'Uitdager'), [
    [() => L('Loudmouth', 'Grote bek'), () => L('Foes go for you even more often', 'Vijanden kiezen nog vaker jou')],
    [() => L('Battle cry', 'Strijdkreet'), () => L('Taunt reaches 2 tiles further and recharges 4 s faster', 'Uitdagen reikt 2 tegels verder en laadt 4 s sneller op')],
    [() => L('Second breath', 'Tweede adem'), () => L('Taunt also heals you for 20%', 'Uitdagen geneest je ook 20%')],
  ]),
  ...path('tank', 'thorns', () => L('Thorns', 'Doornen'), [
    [() => L('Spikes', 'Stekels'), () => L('Foes that hit you take 15% of it back', 'Vijanden die jou raken krijgen 15% terug')],
    [() => L('Iron thorns', 'IJzeren doornen'), () => L('They take 30% back', 'Ze krijgen 30% terug')],
    [() => L('Shield bash', 'Schildslag'), () => L('Taunt hits every foe it reaches for 20% of your max HP', 'Uitdagen raakt elke vijand binnen bereik voor 20% van je max HP')],
  ]),
  // Healer
  ...path('healer', 'aura', () => L('Aura', 'Aura'), [
    [() => L('Wide aura', 'Brede aura'), () => L('Your aura reaches 1.5 tiles further', 'Je aura reikt 1,5 tegel verder')],
    [() => L('Soothing aura', 'Zachte aura'), () => L('Your aura heals 1% more per second', 'Je aura geneest 1% meer per seconde')],
    [() => L('Sanctuary', 'Heiligdom'), () => L('Teammates in your aura take 10% less damage', 'Teamgenoten in je aura krijgen 10% minder schade')],
  ]),
  ...path('healer', 'wave', () => L('Wave', 'Golf'), [
    [() => L('Big wave', 'Grote golf'), () => L('Healing wave heals 20% more', 'Helende golf geneest 20% meer')],
    [() => L('Quick wave', 'Snelle golf'), () => L('Healing wave recharges 5 s faster', 'Helende golf laadt 5 s sneller op')],
    [() => L('Lifeline', 'Reddingslijn'), () => L('Healing wave brings back a teammate who is down nearby, right away', 'Helende golf haalt een gevallen teamgenoot dichtbij meteen terug')],
  ]),
  ...path('healer', 'bless', () => L('Blessing', 'Zegen'), [
    [() => L('Inspire', 'Bezielen'), () => L('Teammates in your aura deal 8% more damage', 'Teamgenoten in je aura doen 8% meer schade')],
    [() => L('Lifelink', 'Levensband'), () => L('Your hits heal the weakest teammate for 15% of the damage', 'Je treffers genezen de zwakste teamgenoot met 15% van de schade')],
    [() => L('Battle hymn', 'Strijdlied'), () => L('Healing wave also gives +25% damage for 4 s', 'Helende golf geeft ook 4 s +25% schade')],
  ]),
  // Striker
  ...path('striker', 'power', () => L('Power', 'Kracht'), [
    [() => L('Sharp claws', 'Scherpe klauwen'), () => L('+10% damage', '+10% schade')],
    [() => L('Heavy hitter', 'Zware klap'), () => L('+10% damage', '+10% schade')],
    [() => L('Critical', 'Voltreffer'), () => L('15% chance to deal double damage', '15% kans op dubbele schade')],
  ]),
  ...path('striker', 'fury', () => L('Fury', 'Furie'), [
    [() => L('Rage', 'Razernij'), () => L('Fury lasts 3 s longer', 'Furie duurt 3 s langer')],
    [() => L('Short fuse', 'Kort lontje'), () => L('Fury recharges 5 s faster', 'Furie laadt 5 s sneller op')],
    [() => L('Bloodlust', 'Bloeddorst'), () => L('During Fury every hit heals you 3%', 'Tijdens Furie geneest elke treffer je 3%')],
  ]),
  ...path('striker', 'hunter', () => L('Hunter', 'Jager'), [
    [() => L('Big game', 'Groot wild'), () => L('+25% damage to elites, wardens and the boss', '+25% schade tegen elites, wachters en de baas')],
    [() => L('Quick hands', 'Snelle handen'), () => L('Your moves recharge 12% faster', 'Je aanvallen laden 12% sneller op')],
    [() => L('Finisher', 'Afmaker'), () => L('Your ultimate recharges 30% faster', 'Je ultimate laadt 30% sneller op')],
  ]),
  // Anyone
  { id: 'any_speed', role: 'any', name: () => L('Light feet', 'Lichte voeten'), text: () => L('+10% walking speed', '+10% loopsnelheid') },
  { id: 'any_potion', role: 'any', name: () => L('Medic bag', 'Dokterstas'), text: () => L('Potions heal 75% instead of 50%, and +1 Potion now', 'Potions genezen 75% in plaats van 50%, en nu +1 Potion') },
  { id: 'any_life', role: 'any', name: () => L('Extra life', 'Extra leven'), text: () => L('+1 life', '+1 leven') },
  { id: 'any_iron', role: 'any', name: () => L('Iron will', 'IJzeren wil'), text: () => L('5% less damage taken', '5% minder schade') },
  { id: 'any_sharp', role: 'any', name: () => L('Keen eye', 'Scherp oog'), text: () => L('+5% damage', '+5% schade') },
  { id: 'any_pack', role: 'any', name: () => L('Packrat', 'Hamsteraar'), text: () => L('+1 Potion, +1 Revive and +1 Max Ether now', 'Nu +1 Potion, +1 Revive en +1 Max Ether') },
]

export const upgradeOf = (id: string) => UPGRADES.find((u) => u.id === id)
