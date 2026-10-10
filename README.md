# BattleMon Royale

Een real-time Pokémon battle royale voor de browser, mobile first, in de stijl van Black/White.

**Speel:** https://pokegimma.vercel.app

Na een korte uitleg vul je je naam in en kies je: **solo** tegen bots, of **samen** met vrienden. Je kiest een trainer en één partner-Pokémon uit een roster van 12; in de wereld vang je er nog twee bij (max. 3). Daarna word je gedropt op een grote kaart met in totaal 12 trainers. Je Pokémon loopt achter je aan en vecht in real time. Versla en vang wilde Pokémon, raap Master Balls en items op en blijf binnen de zone. Wie als laatste trainer overblijft, wint.

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
| Lopen | Joystick: tik ergens op de linkerhelft | WASD / pijltjes, of houd de rechtermuisknop vast (lopen naar de cursor) |
| Aanval 1 | Tik = automatisch richten, vasthouden = blijven aanvallen, slepen = zelf richten, loslaten = vuren | Linkermuisknop (vasthouden = blijven schieten) |
| Aanval 2 / 3 / ultimate | Idem op de andere knoppen | Q / E / R, gericht op je cursor |
| Pokémon wisselen | Tik op een Pokémon in je team (linksboven) | F |
| Vangen (verzwakte wilde Pokémon) | VANG!-knop | Spatie |
| Master Ball / Potion / Revive | Itemknoppen | 1 / 2 / 3 |
| Pauze / game verlaten | ❚❚-knop of de terugknop van je telefoon (vraagt eerst om bevestiging) | Esc |

## Samen spelen

Zit je naast iemand? Dan heb je zo een potje:

1. Speler 1 vult een naam in en tikt **Potje maken**. Er verschijnt een code van 4 tekens en een QR-code.
2. Speler 2 tikt **Meedoen** en typt de code, of scant de QR-code met de camera (de link opent de game en doet meteen mee).
3. Iedereen kan in de lobby nog zijn team wijzigen. De host tikt **Start!** De lege plekken (tot 12) worden bots.

Na afloop ga je terug naar de lobby voor een rematch, of kijk je mee tot het potje klaar is. Valt iemand weg, dan neemt een bot die trainer over.

**Hoe het technisch werkt:** de telefoons praten rechtstreeks met elkaar via WebRTC; PeerJS helpt ze alleen elkaar te vinden. Er is dus geen eigen gameserver nodig.
- **De host** rekent het hele potje uit: bots, wilde Pokémon, schade en de storm. Hij stuurt 20× per seconde de stand naar de anderen, met de effecten, geluiden en banners die zij moeten zien.
- **Je eigen trainer** beweegt lokaal, zodat lopen direct aanvoelt.
- **De host moet de game open houden.** Gaat het scherm van de host op slot, dan staat het potje stil.

Je naam en een willekeurige speler-id worden op je toestel bewaard (`src/profile.ts`). Een account/inlog kan dat later vervangen.

Lokaal testen zonder internet: start een eigen PeerJS-server (`npx peer --port 9000`) en open de game met `?peer=127.0.0.1:9000`.

## Hoe het werkt

- **Levelen:** je hele team krijgt passief XP zolang je leeft. Schade doen en KO's leveren veel meer op. Een match duurt maar een paar minuten, dus het gaat snel: de eerste evolutie komt rond 1:30–2:00. Op Lv 8, 16 en 25 komt er een nieuwe aanval vrij (de vierde is een ultimate). Starters evolueren op hun echte levels.
- **Aanvallen:** elke Pokémon krijgt 4 echte aanvallen op basis van zijn types, elk met een eigen gedrag en effect. Thunder Shock is een bliksemflits die direct raakt, Thunderbolt springt door naar extra doelen, Thunder slaat in vanuit de lucht, Flamethrower is een vlammenstraal, Fire Blast een 大-explosie, Draco Meteor laat drie meteoren neerkomen, Aura Sphere en Swift zoeken hun doel zelf op, en Solar Beam en Hyper Beam moeten eerst opladen. Daarbovenop geldt het complete Gen V-typeschema.
- **Duidelijk vechten:** boven elke Pokémon staat een naamplaat met een HP-balk in teamkleur (groen jij, rood rivalen, geel wild) en een nazakkende schadestrook. Je huidige doelwit krijgt rode haken. Treffers geven grote schadegetallen, "Super effectief!" en een tik-geluid; missers tonen "Mis". Melee-aanvallen laten je Pokémon naar het doel schieten.
- **Verstoppen in het hoge gras:** trainers en hun Pokémon in het hoge gras zijn onzichtbaar en niet aan te vallen voor iedereen die verder dan ~3 tegels weg staat. Aanvallen of geraakt worden verraadt je even. Een oogje boven je trainer laat zien of je verborgen bent (dicht, groen) of net gezien bent (open, rood). Wilde Pokémon blijven zichtbaar.
- **Herstellen:** ben je 3 seconden niet in gevecht geweest (geen schade gedaan of gekregen, niet in de storm), dan herstelt je actieve Pokémon 12% HP per seconde en je reserve-Pokémon 6%. Bewusteloze Pokémon hebben nog steeds een Revive nodig.
- **Wilde Pokémon:** die leven in het hoge gras en zijn er in gewoon, ongewoon en zeldzaam, met een kleine kans op shiny. Er zijn er niet veel (~24 bij de start, minder naarmate de zone krimpt), maar hoe langer de match duurt, hoe vaker er zeldzame tussen zitten. Versla er een en hij is een paar seconden verzwakt: tik dan op VANG!. Twee keer per match verschijnt er op een willekeurig moment een legendarische Pokémon (ergens tussen 1:00–1:40 en 3:10–4:10), zichtbaar op de minimap.
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
  net/        multiplayer: rooms (PeerJS), protocol, state-sync tussen host en spelers
  ui/         titel, uitleg, menu, lobby, keuzeschermen, HUD, cutscenes, resultaten (DOM boven de canvas)
  music.ts    chiptune-sequencer en soundtrack
  profile.ts  je naam en speler-id (later te vervangen door een login)
```

## Assets en rechten

Pokémon-sprites (Gen V Black/White), item-sprites en trainersprites (BW-battle-art, ook gebruikt in de wereld) worden tijdens het spelen geladen van [PokéAPI/sprites](https://github.com/PokeAPI/sprites) en Pokémon Showdown. Ze staan dus niet in deze repo. Pokémon en alle bijbehorende namen en art zijn © Nintendo / Game Freak / The Pokémon Company. Dit is een niet-commercieel fanproject.

De wereld en alle aanvalseffecten worden in code getekend.
