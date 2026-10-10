# Pokégimma

Een real-time Pokémon battle royale voor de browser, mobile first, in de stijl van Black/White.

Je kiest een trainer en drie Pokémon uit een roster van 12. Daarna word je gedropt op een grote kaart samen met 11 andere trainers. Je Pokémon loopt achter je aan en vecht in real time. Versla en vang wilde Pokémon, raap Master Balls en items op en blijf binnen de zone. Wie als laatste trainer overblijft, wint.

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
| Lopen | Joystick: tik ergens op de linkerhelft | WASD / pijltjes |
| Aanvallen (richten gaat automatisch) | De 4 ronde knoppen (ingedrukt houden = blijven aanvallen) | J K L ; of 1–4 |
| Pokémon wisselen | Tik op een Pokémon in je team (linksboven) | Q |
| Vangen (verzwakte wilde Pokémon) | VANG!-knop | E / spatie |
| Master Ball / Potion / Revive | Itemknoppen | M / R / F |

## Hoe het werkt

- **Levelen:** je hele team krijgt passief XP zolang je leeft. Schade doen en KO's leveren veel meer op. Op Lv 8, 16 en 25 komt er een nieuwe aanval vrij (de vierde is een ultimate). Starters evolueren op hun echte levels.
- **Aanvallen:** elke Pokémon krijgt 4 aanvallen op basis van zijn types, elk met een eigen gedrag: melee, projectiel, spreidschot, dash, straal, AoE rond jezelf en een getelegrafeerde inslag. Daarbovenop geldt het complete Gen V-typeschema.
- **Wilde Pokémon:** die leven in het hoge gras en zijn er in gewoon, ongewoon en zeldzaam, met een kleine kans op shiny. Versla er een en hij is een paar seconden verzwakt: tik dan op VANG!. Rond 2:20 en 5:00 verschijnt er een legendarische Pokémon, zichtbaar op de minimap.
- **Master Ball:** daarmee vang je elke wilde Pokémon direct, dus ook een legendarische, zonder te vechten.
- **Zone:** de storm krimpt in 6 fases. Daarbuiten verliest je actieve Pokémon HP.
- **Bots:** 11 AI-trainers met verschillende skill. Ze farmen wilde Pokémon, vangen, rapen items op, vluchten de zone in en vallen aan of vluchten afhankelijk van hun HP en level.

## Code

```
src/
  data/       Pokémon, aanvallen, types, trainers
  game/       wereldgeneratie, engine, bot-AI, renderer, pixel-trainer-sprites
  ui/         menu's en HUD (DOM boven de canvas)
```

## Assets en rechten

Pokémon-sprites (Gen V Black/White), item-sprites en trainerportretten worden tijdens het spelen geladen van [PokéAPI/sprites](https://github.com/PokeAPI/sprites) en Pokémon Showdown. Ze staan dus niet in deze repo. Pokémon en alle bijbehorende namen en art zijn © Nintendo / Game Freak / The Pokémon Company. Dit is een niet-commercieel fanproject.

De overworld-trainers en de wereld zelf worden in code getekend.
