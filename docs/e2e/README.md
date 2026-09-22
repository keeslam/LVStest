# De browsertests

## Wat dit is

Dit is een tweede soort test naast de tests die er al waren. De bestaande tests
controleren losse stukjes code; deze tests bedienen de echte applicatie in een echte
browser, net zoals een medewerker dat doet. Laag A opent elk scherm en elk venster voor
elk soort medewerker en kijkt of er niets stukgaat. Laag B loopt hele werkstromen van
begin tot eind na — de baliestroom van telefoontje tot ingeleverde bus — en telt
daarbij hoeveel handelingen dat kost, zodat een latere wijziging die er een klik bij
doet meteen opvalt.

**Wat laag A niet bewijst.** De rechten worden nagelopen voor negen aangenomen
profielen (beheerder, manager, balie, schoonmaak, meekijker, boekhouding, onderhoud,
`reports-only`, `templates-only`). Een groene run zegt dus dat die negen combinaties
kloppen — niet dat élke denkbare combinatie van vinkjes klopt. In deze applicatie is
een rol maar een etiket en staan de rechten per persoon aangevinkt, dus een
medewerker met een ongebruikelijke mix kan nog steeds op een scherm stuiten dat
gegevens opvraagt die hij niet mag zien. Of die negen profielen overeenkomen met de
echte accounts, is een vraag die in `docs/e2e/werkstromen/01-balie.md` aan de eigenaar
is voorgelegd.

Het achtste profiel, `reports-only` (`e2e/seed/users.ts`), houdt expres alleen
**Dashboard bekijken** en **Rapporten bekijken** aan — niets uit de voertuig-,
reserverings- of klantenfamilie, die de andere toevallig allemaal ook hebben. Dat
bewijst de sluitende zaak uit `docs/superpowers/specs/2026-09-21-toegang-design.md` §3:
een scherm mag nooit onvoorwaardelijk gegevens opvragen die bij een ándere
rechtenfamilie horen dan het scherm zelf. Dit profiel opent precies `/` en `/reports`
(zijn eigen `anyOf` in `shared/page-access.ts`) zonder een enkele schending.

Het negende profiel, `templates-only` (2026-09-21 review, item 6), houdt
**Dashboard bekijken** en **E-mailsjablonen beheren** aan, uitdrukkelijk zonder
**Meldingen beheren**. Dat bewijst de andere helft van B-29's `/communications`-besluit:
het scherm zelf gaat open op het eigen recht, maar de drie voorbeeld-en-verzendknoppen
(één per tabblad: APK, onderhoud, aangepast bericht) blijven zichtbaar, uitgeschakeld en
leggen uit welk recht ontbreekt, in plaats van het scherm zelf te weigeren.

**Wat de rechtentests sinds september 2026 controleren.**
`e2e/layer-a/forbidden.spec.ts` opent voor elke rol elk scherm dat die rol niet mag
gebruiken en controleert drie dingen: de pagina met **"U heeft geen toegang tot dit
scherm"** verschijnt, de tekst noemt het ontbrekende recht met naam, en er gaat geen
enkel `/api/`-verzoek van het scherm zelf uit (alleen de vaste verzoeken van de
koptekst — het meldingencentrum — zijn toegestaan, elk gedekt door zijn eigen recht).
`e2e/layer-a/dialogs.spec.ts` opent voor elke rol elk venster dat die rol niet mag
gebruiken en controleert dat de openknop **zichtbaar** blijft, **uitgeschakeld** is
(`aria-disabled`), en bij aanwijzen of focus een tekstballon toont met het ontbrekende
recht erin — in plaats van, zoals voorheen, die combinatie gewoon over te slaan.

## Draaien

| Commando | Wat het doet |
|---|---|
| `npm run e2e` | alles: laag A, laag B en daarna het dekkingsoverzicht van de vensters |
| `npm run e2e:a` | alleen laag A (schermen en vensters per rol) |
| `npm run e2e:b` | alleen laag B (de werkstromen) |
| `npm run e2e:coverage` | alleen het dekkingsoverzicht van de vensters |

Voorwaarden:

- PostgreSQL moet lokaal draaien (localhost, poort 5432, gebruiker `postgres`).
- De eerste keer bouwt de applicatie zichzelf. Dat duurt een paar minuten. Daarna wordt
  die bouw hergebruikt zolang er geen bronbestand nieuwer is.

Het dekkingsoverzicht hoef je meestal niet apart te draaien: bij `npm run e2e` gebeurt
dat automatisch aan het eind.

## Hoe lang het duurt

Op deze machine, 22 september 2026 (na de doorlichting van de rechten, het negende
profiel en de nabeoordeling die volgde), één volledige `npm run e2e`:

```
335 geslaagd, 2 bewust overgeslagen, 0 mislukt   (ruim 6 minuten)
```

Dat getal is de laatst volledig gemeten run, met de zes tests eraf die
`allowedPathNeedsState` (zie hieronder) inmiddels niet meer aanmaakt — ze stonden erbij
als "overgeslagen", niet als "geslaagd", dus het aantal geslaagde tests verandert niet.
De twee overgebleven overslagen zijn allebei al langer bekend: het `menu-settings`-venster
voor de beheerder, en de gekwarantaineerde 1280x800-test van het Logboek — beide met hun
eigen `test.fixme`-reden in de broncode. Reken op **ruim zes minuten**, niet op één exact
getal: het scheelt of de applicatie opnieuw gebouwd moet worden en wat de machine verder
te doen heeft.

Het dekkingsoverzicht van de vensters (`npm run e2e:coverage`, draait ook automatisch
aan het eind van `npm run e2e`):

```
Vensters: 119 bestanden met een venster, 30 bereikt door een test, 89 nog niet
```

Dat is precies de vastgelegde grens, dus er is niets achteruitgegaan.

**Ruim zes minuten is meer dan de streefwaarde van vijf.** Het langzaamste deel is met
afstand `e2e/layer-a/dialogs.spec.ts`: 188 van de 337 tests (`npx playwright test -c
e2e/playwright.config.ts --project=layer-a --list` telt ze precies) en samen zo'n 800
seconden testtijd, ruim drie vijfde van de ongeveer 1360 seconden die alle tests bij
elkaar kosten. Die tests draaien met vier tegelijk, dus in werkelijke tijd is het
ongeveer drie en een derde minuut. De rest van diezelfde run: de schermen per rol
(221 s), de schermen zonder rechten (228 s), de bewakingstests (43 s) en alle
werkstromen samen (52 s).

De vier-tegelijk-grens is bewust gekozen: de applicatie zelf houdt maximaal tien
databaseverbindingen open, en meer tests tegelijk lopen daar tegenaan. Wie het op een
andere machine sneller wil proberen, kan `E2E_WORKERS` op een ander getal zetten.

## Wat er tijdens een run gebeurt

- De database `lvs_e2e` wordt weggegooid en helemaal opnieuw opgebouwd. Niet vanaf een
  kopie, maar vanaf niets: het schema wordt neergezet en daarna draait de echte
  migratie eroverheen — dezelfde weg die een nieuwe productiedatabase aflegt. Zo valt een
  ontbrekende kolom op vóór een medewerker hem tegenkomt.
- Daarna wordt er vaste testdata ingezet: negen medewerkers (één per profiel), acht
  voertuigen, zes klanten en reserveringen in elke status.
- De applicatie start op **poort 5010**, apart van alles wat er verder draait. De
  kentekenopzoeking praat met een klein lokaal antwoordapparaat op poort 5011.
- **Er gaat niets naar buiten.** Geen e-mail, geen echte RDW-bevraging, geen
  postvakkoppeling. Alles wat de tests schrijven — uploads, back-ups, verslagen — komt
  onder `e2e/.tmp/` terecht en staat niet in git.
- De databases `lvstest`, `lvs_prodtest` en `lvs_fixtest` worden nooit aangeraakt. De
  testopzet weigert te draaien tegen een database met een andere naam dan `lvs_e2e`.

Eén melding in de uitvoer is normaal en hoort niet bij een fout:
`Backup failed: pg_dump executable not found on PATH`. De PostgreSQL-hulpprogramma's
staan op deze machine niet in het zoekpad; de applicatie probeert bij het starten een
back-up en meldt dat het niet lukt. Dat staat los van de tests.

## Een fout lezen

Gaat er iets mis, open dan:

```
e2e/.tmp/report/index.html
```

Dat is een verslag in de browser. Per mislukte test staan daar drie dingen in:

- een **schermafdruk** van het moment waarop het misging;
- een **video** van de hele test;
- een **trace**: een opname waarin je stap voor stap terug kunt lopen, met het scherm,
  de netwerkverzoeken en de foutmeldingen erbij.

De trace open je zo:

```
npx playwright show-trace e2e/.tmp/results/<naam-van-de-test>/trace.zip
```

Schermafdruk, video en trace worden alleen bewaard voor tests die mislukken. Bij een
groene run staat er dus niets.

## Een scherm of een venster toevoegen

- Een nieuw **scherm** komt in `e2e/registry/pages.ts`: het adres, welke rechten het
  vraagt, en welk gegevensverzoek het scherm doet. Laag A opent het scherm daarna
  vanzelf voor elke rol die het mag zien, en controleert voor de andere rollen dat het
  scherm niet in het menu staat en dat de gegevens geweigerd worden.
- Een nieuw **venster** komt in `e2e/registry/dialogs.ts`: op welk scherm het zit, welke
  knop het opent (op `data-testid`), en in welk bestand het venster staat. Heeft de knop
  nog geen `data-testid`, dan voeg je die toe aan de bron — dat is de enige wijziging
  aan de applicatie die deze testsuite mag maken.
- Vensters die alleen opengaan bij een bepaald record (een opgehaalde huur, een
  bekeuring) horen niet in laag A maar in laag B, en worden daar in
  `LAYER_B_SOURCES` genoemd.
- Een knop die WEL een vast scherm heeft maar waarvan het TOEGESTANE pad niet zonder
  een bestaand record kan (een sjabloon kiezen, een voertuig selecteren — iets wat deze
  testsuite niet zelf aanmaakt) krijgt op zijn `DialogEntry` het veld
  `allowedPathNeedsState: "<reden>"`. `dialogs.spec.ts` maakt dan voor een rol die het
  recht al heeft helemaal geen test aan (geen `test.fixme`, geen overgeslagen test in
  het verslag) — dat bewijs hoort bij een laag-B-werkstroom. De WEIGERING blijft wel
  gewoon een echte test: die leest alleen `RequiresPermission`'s tekstballon en klikt
  nooit. Voorbeeld: de drie voorbeeld-en-verzendknoppen op **Communicatie**
  (`e2e/registry/dialogs.ts`, sectie `/communications`).

**Het dekkingsgetal mag alleen omlaag.** In `e2e/registry/coverage-baseline.json` staat
hoeveel bestanden met een venster nog niet door een test worden geopend (nu 89). Kijk
daar voor het getal van vandaag, want het hoort langzaam te dalen.
Wordt dat getal hoger, dan stopt `npm run e2e` met een fout. Bereik je een venster meer,
dan zet je het getal één lager. Andersom nooit.

## Regels

1. **Geen herkansingen.** Een test wordt nooit opnieuw gedraaid tot hij groen is. Een
   test die de ene keer wel en de andere keer niet lukt, is een echte fout — in de test
   of in de applicatie — en wordt opgelost, niet weggeduwd.
2. **Geen testachterdeur in de server.** De applicatie krijgt geen speciale stand voor
   tests: geen uitgeschakelde snelheidslimiet, geen overgeslagen controle, geen
   testgebruiker met extra rechten. Wat de tests doen, kan een medewerker ook doen.
3. **Het aantal handelingen per werkstroom mag alleen omlaag.** Elke werkstroom in laag
   B heeft een teller met een maximum dat gelijk is aan wat er vandaag gemeten is. Komt
   er een klik of een veld bij, dan wordt de test rood met de hele stappenlijst erbij.
   Wordt een werkstroom korter na een goedgekeurde verbetering, dan gaat het maximum in
   diezelfde wijziging mee omlaag.
4. **Geen werkstroom- of bedrijfsregel wijzigen zonder akkoord.** Wat de tests
   tegenkomen aan omslachtig werk gaat als voorstel naar de eigenaar in
   `docs/e2e/werkstromen/`. Technische fouten mogen wel meteen gerepareerd worden, elk
   met een eigen test en een eigen commit.

## Verder lezen

- `docs/e2e/werkstromen/01-balie.md` — de baliewerkstroom doorgelicht, met de gemeten
  stappen, de verbetervoorstellen en de gevonden fouten.
