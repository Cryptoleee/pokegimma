# BattleMon Royale

Een real-time Pokémon battle royale voor de browser, mobile first, in de stijl van Black/White.

**Speel:** https://pokegimma.vercel.app

Na een korte uitleg kies je een trainer en één partner-Pokémon uit een roster van 12; in de wereld vang je er nog twee bij (max. 3). Daarna word je gedropt op een grote kaart samen met 11 andere trainers. Je Pokémon loopt achter je aan en vecht in real time. Versla en vang wilde Pokémon, raap Master Balls en items op en blijf binnen de zone. Wie als laatste trainer overblijft, wint.

## Spelen

```sh
npm install
npm run dev       # http://localhost:5173 (ook bereikbaar via je LAN voor je telefoon)
npm run build     # type-check + productie-build naar dist/
```

Vercel herkent het project automatisch als Vite-app (build: `npm run build`, output: `dist`).

### Besturing

| Actie | Mobiel | Toetsenbord |
| --- | --- | --- |
| Lopen | Joystick: tik ergens op de linkerhelft | WASD / pijltjes, of houd de linkermuisknop ingedrukt (je loopt naar de cursor) |
| Aanvallen | Tik = automatisch richten, ingedrukt houden = blijven aanvallen, slepen vanaf de knop = zelf richten (met richtvoorbeeld), loslaten = vuren | 1–4, gericht op je cursor |
| Pokémon wisselen | Tik op een Pokémon in je team (linksboven) | Q |
| Vangen (verzwakte wilde Pokémon) | VANG!-knop | Spatie / E |
| Master Ball / Potion / Revive | Itemknoppen | 5 / 6 / 7 |
| Pauze / game verlaten | ❚❚-knop of de terugknop van je telefoon (vraagt eerst om bevestiging) | Esc |

## Hoe het werkt

- **Levelen:** je hele team krijgt passief XP zolang je leeft. Schade doen en KO's leveren veel meer op. Op Lv 8, 16 en 25 komt er een nieuwe aanval vrij (de vierde is een ultimate). Starters evolueren op hun echte levels.
- **Aanvallen:** elke Pokémon krijgt 4 echte aanvallen op basis van zijn types, elk met een eigen gedrag en effect. Thunder Shock is een bliksemflits die direct raakt, Thunderbolt springt door naar extra doelen, Thunder slaat in vanuit de lucht, Flamethrower is een vlammenstraal, Fire Blast een 大-explosie, Draco Meteor laat drie meteoren neerkomen, Aura Sphere en Swift zoeken hun doel zelf op, en Solar Beam en Hyper Beam moeten eerst opladen. Daarbovenop geldt het complete Gen V-typeschema.
- **Duidelijk vechten:** boven elke Pokémon staat een naamplaat met een HP-balk in teamkleur (groen jij, rood rivalen, geel wild) en een nazakkende schadestrook. Je huidige doelwit krijgt rode haken. Treffers geven grote schadegetallen, "Super effectief!" en een tik-geluid; missers tonen "Mis". Melee-aanvallen laten je Pokémon naar het doel schieten.
- **Wilde Pokémon:** die leven in het hoge gras en zijn er in gewoon, ongewoon en zeldzaam, met een kleine kans op shiny. Versla er een en hij is een paar seconden verzwakt: tik dan op VANG!. Rond 2:20 en 5:00 verschijnt er een legendarische Pokémon, zichtbaar op de minimap.
- **Master Ball:** daarmee vang je elke wilde Pokémon direct, dus ook een legendarische, zonder te vechten.
- **Zone:** de storm krimpt in 6 fases. Daarbuiten verliest je actieve Pokémon HP.
- **Bots:** 11 AI-trainers met verschillende skill. Ze farmen wilde Pokémon, vangen, rapen items op, vluchten de zone in en vallen aan of vluchten afhankelijk van hun HP en level.

## Presentatie

- **Soundtrack:** eigen chiptune-muziek die live gesequenced wordt met WebAudio: titel, menu, gevecht (versnelt in de finale), overwinning en nederlaag. Plus Pokémon-cries via PokéAPI.
- **Cinematisch:** een titelscherm met Zekrom en Reshiram, Black/White-schermovergangen, keuzeschermen als podium, een drop-in met aftelling bij de start, een evolutie-cutscene, banners voor level-ups, nieuwe aanvallen, legendarische Pokémon en KO's, en een resultaatscherm met confetti.
- **Wereld:** wolkschaduwen, golvend en glinsterend water, ritselend gras, stofwolkjes, zwevende pollen, een gloeiende stormmuur met bliksem en regen, en een vignet.

## Code

```
src/
  data/       Pokémon, aanvallen, types, trainers
  game/       wereldgeneratie, engine, bot-AI, renderer, aanvalseffecten (vfx.ts)
  ui/         titel, uitleg, keuzeschermen, HUD, cutscenes, resultaten (DOM boven de canvas)
  music.ts    chiptune-sequencer en soundtrack
```

## Assets en rechten

Pokémon-sprites (Gen V Black/White), item-sprites en trainersprites (BW-battle-art, ook gebruikt in de wereld) worden tijdens het spelen geladen van [PokéAPI/sprites](https://github.com/PokeAPI/sprites) en Pokémon Showdown. Ze staan dus niet in deze repo. Pokémon en alle bijbehorende namen en art zijn © Nintendo / Game Freak / The Pokémon Company. Dit is een niet-commercieel fanproject.

De wereld en alle aanvalseffecten worden in code getekend.
