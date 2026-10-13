<p align="center"><img src="branding/stormbreak-logo-1200.png" alt="Stormbreak Royale" width="600"></p>

# Stormbreak Royale

Een real-time Pokémon battle royale voor de browser, mobile first, in de stijl van Black/White.

**Speel:** https://stormbreak.app

Er zijn twee modi: **Battle Royale** (12 trainers, laatste die overblijft wint) en **Raid** (alleen of samen tegen één enorme eindbaas). Beide kun je solo of met vrienden spelen.

Na een korte uitleg vul je je naam in en kies je: **solo** tegen bots, of **samen** met vrienden. Je kiest een trainer en één partner-Pokémon uit een roster van 24 (te filteren op rol en op melee/ranged); in de wereld vang je er nog twee bij (max. 3). Daarna word je gedropt op een grote kaart met in totaal 12 trainers. Je Pokémon loopt achter je aan en vecht in real time. Versla en vang wilde Pokémon, raap Master Balls en items op en blijf binnen de zone. Wie als laatste trainer overblijft, wint.

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

1. Speler 1 vult in het hoofdmenu een naam in, tikt **Multiplayer** en dan **Potje maken**. Er verschijnt een code van 4 tekens en een QR-code.
2. Speler 2 tikt **Multiplayer** en typt de code bij **Meedoen**, of scant de QR-code met de camera. De link opent de game en doet meteen mee.
3. In de lobby kiest iedereen een trainer en Pokémon met **Team kiezen** en tikt op **Klaar**. Je ziet bij iedereen of die klaar is, en je kunt chatten (ook met snelle knoppen).
4. De host kiest bovenin de lobby de modus (Battle Royale of Raid) en bij een battle royale de wereld. De anderen zien die keuze meteen.
5. Zodra iedereen klaar is, tikt de host **Start!** Iedereen ziet 8 seconden een laadscherm met tips en start dan tegelijk. De lege plekken (tot 12) worden bots.

In het potje zelf kun je ook chatten via de 💬-knop (op desktop: Enter).

Na afloop ga je terug naar de lobby voor een rematch, of kijk je mee tot het potje klaar is. Valt iemand weg, dan neemt een bot die trainer over.

**Hoe het technisch werkt:** de telefoons praten rechtstreeks met elkaar via WebRTC; PeerJS helpt ze alleen elkaar te vinden. Er is dus geen eigen gameserver nodig.
- **De host** rekent het hele potje uit: bots, wilde Pokémon, schade, de storm en in een raid de baas en zijn aanvallen. Hij stuurt 20× per seconde de stand naar de anderen, met de effecten, geluiden en banners die zij moeten zien.
- **Je eigen trainer** beweegt lokaal, zodat lopen direct aanvoelt.
- **Elke speler krijgt alleen details van wat in de buurt is,** plus het minimum van de rest (positie, of iemand nog leeft, legendarische Pokémon voor de minimap). Dat is ~30 KB/s per medespeler. Getest met 8 spelers tegelijk; een potje kan er 12 hebben.
- **De host moet de game open houden.** Gaat het scherm van de host op slot, dan staat het potje stil.

Je naam en een willekeurige speler-id worden op je toestel bewaard (`src/profile.ts`). Een account/inlog kan dat later vervangen.

Lokaal testen zonder internet: start een eigen PeerJS-server (`npx peer --port 9000`) en open de game met `?peer=127.0.0.1:9000`.

## Hoe het werkt

- **Levelen:** je hele team krijgt passief XP zolang je leeft. Schade doen en KO's leveren veel meer op. Een match duurt maar een paar minuten, dus het gaat snel: de eerste evolutie komt rond 1:30–2:00. Op Lv 8, 16 en 25 komt er een nieuwe aanval vrij (de vierde is een ultimate). Starters evolueren op hun echte levels.
- **Aanvallen:** elke Pokémon krijgt 4 echte aanvallen op basis van zijn types, elk met een eigen gedrag en effect. Thunder Shock is een bliksemflits die direct raakt, Thunderbolt springt door naar extra doelen, Thunder slaat in vanuit de lucht, Flamethrower is een vlammenstraal, Fire Blast een 大-explosie, Draco Meteor laat drie meteoren neerkomen, Aura Sphere en Swift zoeken hun doel zelf op, en Solar Beam, Hyper Beam, Hydro Pump, Flash Cannon en Focus Blast moeten eerst opladen (een draaiende cirkel op de grond, toestromende energie, een groeiende witgloeiende bol en een trillende Pokémon), maar slaan dan 15% harder toe. Daarbovenop geldt het complete Gen V-typeschema.
- **Licht en impact:** projectielen, opladers, inslagen, bliksem, stralen en raid-aanvallen werpen dynamisch licht op de grond (ook in het donker van de nacht). Treffers worden zwaarder naarmate de aanval sterker is: meer vonken, lichtflares, schokgolven en schermschok, en het doelwit veert in bij een klap.
- **Duidelijk vechten:** boven elke Pokémon staat een naamplaat met een HP-balk in teamkleur (groen jij, rood rivalen, geel wild) en een nazakkende schadestrook. Je huidige doelwit krijgt rode haken. Treffers geven grote schadegetallen, "Super effectief!" en een tik-geluid; missers tonen "Mis". Melee-aanvallen laten je Pokémon naar het doel schieten.
- **Verstoppen in het hoge gras:** trainers en hun Pokémon in het hoge gras zijn onzichtbaar en niet aan te vallen voor iedereen die verder dan ~3 tegels weg staat. Aanvallen of geraakt worden verraadt je even. Een oogje boven je trainer laat zien of je verborgen bent (dicht, groen) of net gezien bent (open, rood). Wilde Pokémon blijven zichtbaar.
- **Herstellen:** ben je 3 seconden niet in gevecht geweest (geen schade gedaan of gekregen, niet in de storm), dan herstelt je actieve Pokémon 12% HP per seconde en je reserve-Pokémon 6%. Bewusteloze Pokémon hebben nog steeds een Revive nodig.
- **Wilde Pokémon:** die leven in het hoge gras en zijn er in gewoon, ongewoon en zeldzaam, met een kleine kans op shiny. Er zijn er niet veel (~24 bij de start, minder naarmate de zone krimpt), maar hoe langer de match duurt, hoe vaker er zeldzame tussen zitten. Versla er een en hij is een paar seconden verzwakt: tik dan op VANG!. Twee keer per match verschijnt er op een willekeurig moment een legendarische Pokémon (ergens tussen 1:00–1:40 en 3:10–4:10), zichtbaar op de minimap.
- **Master Ball:** daarmee vang je elke wilde Pokémon direct, dus ook een legendarische, zonder te vechten.
- **Legendarisch alarm:** als er een legendarische Pokémon verschijnt, flitst het scherm goud. Een gouden balk bovenin toont de naam, de afstand, een pijl in de juiste richting en hoe je hem vangt.
- **Eerlijk vangen:** wie een wilde Pokémon verslaat, mag hem eerst vangen: 3 seconden, bij een legendarische 8. Daarna mag iedereen een poging doen.
- **Zone:** de storm krimpt in 6 fases. Daarbuiten verliest je actieve Pokémon HP.
- **Bots:** AI-trainers met verschillende skill. Ze farmen wilde Pokémon, vangen, rapen items op, vluchten de zone in en vallen aan of vluchten afhankelijk van hun HP en level.
  - Ze hebben een reactietijd, richten niet altijd perfect en kiezen niet altijd hun beste aanval.
  - Ze krijgen iets minder XP.
  - Ze bemoeien zich niet met een gevecht dat al bezig is, tenzij ze zelf geraakt worden.
  - Ze laten andere trainers de eerste minuut met rust.
  - Een legendarische Pokémon pakken ze alleen aan als ze duidelijk sterk genoeg zijn. Ze gebruiken er nooit een Master Ball voor, en hij breekt vaak uit hun bal.

## Rollen

Net als in Pokémon Unite heeft elke partner een rol en een aanvalsstijl. Je ziet ze bij de stats op het keuzescherm en kunt erop filteren. De rol geeft een klein voordeel; evoluties houden de rol van hun lijn, en wilde Pokémon krijgen een rol op basis van hun stats.

| Rol | Bonus | Partners |
| --- | --- | --- |
| **Aanvaller** | +10% schade | Pikachu, Charmander, Bulbasaur, Gastly, Abra, Shinx, Deino |
| **Allrounder** | +5% schade, +7% HP | Eevee, Tepig, Oshawott, Gible, Axew, Machop, Dratini, Beldum |
| **Verdediger** | +15% HP, halve knockback | Squirtle, Larvitar, Munchlax, Mudkip |
| **Snelheid** | +12% loopsnelheid, 20% kortere cooldown op dash-aanvallen | Snivy, Riolu, Zorua, Scyther, Torchic |

**Melee** of **Ranged** volgt uit de basisaanval (de aanval die je het vaakst gebruikt).

## Werelden en gebeurtenissen

Elke battle royale speelt in een van vijf werelden. In solo kies je die zelf, in multiplayer de host; standaard is het **Willekeurig**.

| Wereld | Wat is anders |
| --- | --- |
| **Bos** | Het klassieke groen met eiken, vijvers en dorpjes |
| **Woestijn** | Duinen, cactussen en droge struiken als verstopplek, een oase en zandstormen |
| **Sneeuw** | Besneeuwde dennen, bevroren meertjes en sneeuwval |
| **Vulkaan** | Asgrond, dode bomen, gloeiende lava in plaats van water en asregen |
| **Nacht** | Het bos in het donker, met vuurvliegjes en een donkere rand om het beeld |

Elk potje heeft twee gebeurtenissen, tussen de legendarische Pokémon door. Beide krijgen een banner, een pijl bovenin en een marker op de minimap.
- **Bevoorrading:** na 10 seconden aftellen valt er een kist met een Master Ball, Potions, Rare Candy en een Revive.
- **Zwerm:** zes wilde Pokémon van dezelfde ongewone of zeldzame soort in een stuk hoog gras.

## Raid

Een raid is PvE: jij (en tot 11 vrienden) tegen één legendarische baas, in een eigen arena. Er is geen storm en er zijn geen bots of wilde Pokémon. De baas is een verrassing: hij wordt willekeurig gekozen (nooit twee keer dezelfde na elkaar) en je ziet hem pas op het laadscherm.

- **Jouw team:** je partner is in de raid volledig geëvolueerd en Lv 50 met alle vier de aanvallen (Pikachu wordt Raichu, Charmander Charizard, enzovoort). Je hebt 2 Potions en HP herstelt niet vanzelf. Er verschijnen wel geregeld Potions in de arena.
- **Ontwijken:** elke grote aanval zie je eerst als rode vorm op de grond die langzaam volloopt: een cirkel, kegel, lijn of ring. Sta je erin als hij vol is, dan kost dat een groot deel van je HP. Elke waarschuwing is lang genoeg om eruit te lopen als je meteen reageert.
- **Fases:** op 66% en 33% HP wordt de baas woedend. Dat is een korte cinematic: de camera zwenkt naar de baas, de wereld wordt donker, hij brult (een eigen animatie), en op een flits met schokgolf verschijnt zijn nieuwe vorm. Hij brult iedereen weg, krijgt nieuwe aanvallen en valt sneller aan, en er vallen Potions.
- **Elke fase voelt anders:** een eigen kleur over het scherm, een pulserende rand (in de laatste fase op het ritme van een hartslag), meer weer en een arena die escaleert: hitte uit de vloer, sneeuwstormvlagen, onweer dat de lucht verlicht, windstrepen of een vervormende werkelijkheid. De baas gloeit in de kleur van zijn fase.
- **Laatste fase, nieuwe vorm:** Kyurem wordt **Black Kyurem** (ijs + bliksem: Freeze Shock, Fusion Bolt), Rayquaza wordt **Mega Rayquaza** (Extreme Speed), Mewtwo wordt **Mega Mewtwo Y** (Aura Sphere). Reshiram gaat over op blauw vuur (Dragon Rush, Blauwe Vlammenstorm) en Zekrom op Teravolt (Teravolt-sprong: springt op en landt op je).
- **Animatie:** de bazen spelen hun echte geanimeerde Black/White-sprites af, zweven (Rayquaza, Mewtwo) of stampen, en laten nabeelden achter bij een dash.
- **Levens en tijd:** iedereen heeft 3 levens. Ga je neer, dan kom je na 4 seconden terug aan de rand. De raid mislukt als iedereen op is of na 4 minuten. Met meer spelers heeft de baas meer HP.
- **Afloop:** "Raid geslaagd!" of "Raid mislukt" met je tijd, je aandeel in de schade en je levens.

| Baas | Arena | Wat de omgeving doet | Signature-aanvallen |
| --- | --- | --- | --- |
| **Reshiram** | Vulkaankrater | Lavascheuren branden als je erop staat; uit vier kraters spuit lava (Uitbarsting) | Blue Flare (kegel), Fusion Flare (meteoren), Hittegolf, Vuurring, en in fase 3 Cross Flame: draaiende vlammenstralen |
| **Kyurem** | IJsgrot | De vloer is glad, waardoor je doorglijdt; ijspilaren geven dekking en breken na drie treffers | IJsadem (bevriest je), Icicle Crash, Dragon Pulse, Glaciate, Vriesgolf, en in fase 3 Blizzard: de hele arena, behalve achter een pilaar |
| **Zekrom** | Stormtop | Vier bliksemafleiders blokkeren je pad en schieten om de paar seconden stroom naar elkaar: sta niet tussen twee masten | Bolt Strike (inslagen uit een donderwolk), Fusion Bolt (Zekrom raast over de lijn), Discharge, Donderring, en in fase 3 Onweer: inslagen over de hele arena en alle afleiders tegelijk |
| **Rayquaza** | Hemelpilaar | Het oude stenen dak van de toren, met mos, gebroken pilaren en open lucht als rand; wervelwinden trekken door de arena en doen schade zolang je erin staat | Dragon Ascent (vliegt op en landt op een speler), Outrage (drie lijnen), Draco Meteor, Hurricane (tornado's), en in fase 3 Delta Stream: harde wind die iedereen één kant op duwt |
| **Mewtwo** | Psychisch lab | Het vloerraster laadt op: de helft van de vakken (dambordpatroon) slaat toe, dus ga op tijd naar een donker vak | Psystrike (kegel), Shadow Ball, Teleport (verschijnt naast je en slaat om zich heen), Psychische ring, en in fase 3 twee klonen die de aanvallen meedoen |

Nieuwe bazen zijn vooral data: een rij in `src/data/bosses.ts` met hun aanvallen, vormen en uiterlijk per fase, plus eventueel een arena in `src/game/world.ts`.

**Sprites en animaties van de bazen**
- `scripts/bake-boss-sprites.py` zet de geanimeerde BW-sprites (GIF) om in sprite sheets (`src/assets/boss/<id>.png`) met frametijden (`src/data/bossAnims.ts`). Nieuwe vorm erbij: zet het id in de lijst en draai het script opnieuw.
- `scripts/bake-ai-anim.py` maakt van een AI-animatie een pixel-art actie (zoals de brul bij een fasewissel). Werkwijze: zet de sprite 6× vergroot op een effen greenscreen (#00b140; magenta #ff00ff voor groene Pokémon zoals Rayquaza), animeer die met MiniMax H3 (startframe = eindframe, vaste camera), en draai het script. Dat haalt de achtergrond weg, schaalt terug naar spritegrootte en zet elke pixel op het palet van de echte sprite. Resultaat: `src/assets/boss/<id>-<actie>.png` en `src/data/bossActions.ts`.

## Presentatie

- **Soundtrack:** "Castelia Nights", eigen muziek in Black/White-stijl die live in de browser wordt gespeeld door een kleine DS-achtige synth (`src/synth.ts`): pulse-lead, marimba, synthbas, strijkers, drums en galm. Er zijn nummers voor het titelscherm, het menu, de battle royale (versnelt in de finale), de raid-baas (versnelt in de laatste fase), overwinning en nederlaag. Twee alternatieve sets staan in `src/data/soundtracks.ts`. Plus Pokémon-cries via PokéAPI.
- **Geluidseffecten:** elke aanval heeft een eigen gesynthetiseerd geluid (`src/moveSfx.ts`): de klank van het type, de vorm van de aanval en zwaarder naarmate de aanval sterker is. Geluiden van anderen komen uit de goede richting en worden zachter op afstand. Items (potion, revive, ballen, oppakken) hebben ook hun eigen geluid. Raid-bazen hebben een eigen, zwaardere set: elke aanval zwelt aan tijdens de waarschuwing en slaat in met een diepe dreun over de hele arena, plus geluid voor de dash, het opstijgen en neerkomen, de teleport, de klonen, tornado's en Delta Stream, de bliksemafleiders, lavagaten, het vloerraster en brekende ijspilaren. De baas brult bij de start, de nieuwe fase klinkt als een ontlading en zijn nederlaag als een instorting.
- **Omroeper:** een stem met een Japans accent (ElevenLabs, `src/assets/voice/`, afgespeeld door `src/voice.ts`) roept het titelscherm, het aftellen, de storm, legendarische Pokémon, K.O.'s, raid-fases en winst of verlies om. De muziek gaat even zachter terwijl hij praat.
- **Opties:** via ⚙️ in het menu zet je muziek, stemmen en geluidseffecten los aan of uit; de keuze wordt onthouden.
- **Talen:** Engels (standaard) en Nederlands, te kiezen op het titelscherm, het home-scherm en in Opties (`src/i18n.ts`).
- **Cinematisch:** een titelscherm met Zekrom en Reshiram, Black/White-schermovergangen, keuzeschermen als podium, een drop-in met aftelling bij de start, een evolutie-cutscene, banners voor level-ups, nieuwe aanvallen, legendarische Pokémon en KO's, en een resultaatscherm met confetti.
- **Wereld:** weer per wereld (sneeuw, zand, as, gloeiende vonken, vuurvliegjes), wolkschaduwen, golvend en glinsterend water, ritselend gras, stofwolkjes, zwevende pollen, een gloeiende stormmuur met bliksem en regen, en een vignet.

## Statistieken (voor de maker)

`/stats` is een los paneel met anonieme tellingen: wie er nu online is (menu, lobby, battle royale of raid), spelers per dag en per maand, nieuwe spelers, potjes per modus, speeltijd, drukte per uur, populaire partners, bazen met hun winstpercentage, werelden, uitslagen, apparaat, taal en bronnen. Deel je link met `?via=naam` (bijv. `stormbreak.app/?via=tiktok`) en die bron telt apart.

- **Hoe:** de game stuurt kleine events naar `api/t.ts` (Vercel Function); `api/stats.ts` levert ze aan het paneel. Opslag in Upstash Redis. Per apparaat een willekeurige id (niet je speler-id), geen namen, geen IP-adressen. Op localhost en het lokale netwerk wordt niets verstuurd; in het paneel kun je je eigen apparaat uitzetten.
- **Instellen (eenmalig, in Vercel):** Storage → Create Database → Upstash for Redis → verbinden met dit project; Settings → Environment Variables → `STATS_KEY` = je eigen wachtwoord; daarna opnieuw deployen. Zonder deze instellingen doet de game niets met stats en toont `/stats` deze stappen.
- **Kosten:** een speler met het spel open kost ongeveer één Redis-commando per 90 seconden. Houd de gratis limiet van Upstash in de gaten als het druk wordt.

## Code

```
src/
  data/       Pokémon, aanvallen, types, trainers, werelden (themes.ts), raid-bazen (bosses.ts)
  game/       wereldgeneratie, engine, bot-AI, renderer, aanvalseffecten (vfx.ts),
              raid-baas en telegrafen (boss.ts), BR-gebeurtenissen (events.ts)
  net/        multiplayer: rooms (PeerJS), protocol, state-sync tussen host en spelers
  ui/         titel, uitleg, menu, lobby, keuzeschermen, HUD, cutscenes, resultaten (DOM boven de canvas)
  music.ts    chiptune-sequencer en soundtrack
  panel/      het stats-paneel (/stats)
  i18n.ts     Engels en Nederlands
  stats.ts    anonieme events voor het stats-paneel
  profile.ts  je naam en speler-id (later te vervangen door een login)
api/          Vercel Functions: t.ts (events in), stats.ts (paneel-data)
```

## Assets en rechten

Pokémon-sprites (Gen V Black/White), item-sprites en trainersprites (BW-battle-art, ook gebruikt in de wereld) worden tijdens het spelen geladen van [PokéAPI/sprites](https://github.com/PokeAPI/sprites) en Pokémon Showdown. Ze staan dus niet in deze repo. Pokémon en alle bijbehorende namen en art zijn © Nintendo / Game Freak / The Pokémon Company. Dit is een niet-commercieel fanproject.

De wereld en alle aanvalseffecten worden in code getekend.
