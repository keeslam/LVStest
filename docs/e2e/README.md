# De browsertests

## Wat dit is

Dit is een tweede soort test naast de tests die er al waren. De bestaande tests
controleren losse stukjes code; deze tests bedienen de echte applicatie in een echte
browser, net zoals een medewerker dat doet. Laag A opent elk scherm en elk venster voor
elk soort medewerker en kijkt of er niets stukgaat. Laag B loopt hele werkstromen van
begin tot eind na — de baliestroom van telefoontje tot ingeleverde bus — en telt
daarbij hoeveel handelingen dat kost, zodat een latere wijziging die er een klik bij
doet meteen opvalt.

**Wat laag A niet bewijst.** De rechten worden nagelopen voor zeven aangenomen
profielen (beheerder, manager, balie, schoonmaak, meekijker, boekhouding, onderhoud).
Een groene run zegt dus dat die zeven combinaties kloppen — niet dat élke denkbare
combinatie van vinkjes klopt. In deze applicatie is een rol maar een etiket en staan de
rechten per persoon aangevinkt, dus een medewerker met een ongebruikelijke mix kan nog
steeds op een scherm stuiten dat gegevens opvraagt die hij niet mag zien. Of die zeven
profielen overeenkomen met de echte accounts, is een vraag die in
`docs/e2e/werkstromen/01-balie.md` aan de eigenaar is voorgelegd.

## Draaien

| Commando | Wat het doet |
|---|---|
| `npm run e2e` | alles: laag A, laag B en daarna het dekkingsoverzicht van de vensters |
| `npm run e2e:a` | alleen laag A (schermen en vensters per rol) |
| `npm run e2e:b` | alleen laag B (de werkstromen) |
| `npx tsx scripts/e2e-dialog-coverage.ts` | alleen het dekkingsoverzicht van de vensters |

Voorwaarden:

- PostgreSQL moet lokaal draaien (localhost, poort 5432, gebruiker `postgres`).
- De eerste keer bouwt de applicatie zichzelf. Dat duurt een paar minuten. Daarna wordt
  die bouw hergebruikt zolang er geen bronbestand nieuwer is.

Let op: het ontwerp noemt ook een kortere vorm, `npm run e2e:coverage`. Die stond op
21 september nog niet in `package.json`. Werkt hij bij jou ("Missing script"), gebruik
dan het langere commando uit de tabel hierboven — dat doet precies hetzelfde. Bij
`npm run e2e` draait het dekkingsoverzicht sowieso automatisch aan het eind, dus
meestal hoef je het los helemaal niet te draaien.

## Hoe lang het duurt

Gemeten op deze machine op 21 september 2026, één volledige `npm run e2e`:

```
282 geslaagd, 1 bewust overgeslagen, 0 mislukt   (6,0 minuten)
Vensters: 119 bestanden met een venster, 28 bereikt door een test, 91 nog niet
```

Het dekkingsoverzicht is geslaagd: 91 niet-bereikte vensters was precies de vastgelegde
grens, dus er is niets achteruitgegaan. Van begin tot eind, inclusief die laatste stap,
duurde de run 6 minuten en 4 seconden.

*(Stand 21-09. Kort na deze meting is er één venster bij gekomen dat wél door een test
wordt geopend — dat van het logboek — waarmee de telling op 29 bereikt en 90 nog niet
komt, en de vastgelegde grens op 90. Dat is nagerekend met het dekkingscommando zelf.
De looptijd en de testaantallen hierboven zijn van de gemeten run en veranderen daar
niet door.)*

**Dat is meer dan de streefwaarde van vijf minuten.** Het langzaamste deel is met
afstand `e2e/layer-a/dialogs.spec.ts`: 163 van de 283 tests en samen 783 seconden
testtijd, ruim drie vijfde van de 1278 seconden die alle tests bij elkaar kosten. Die
tests draaien met vier tegelijk, dus in werkelijke tijd is het ongeveer drie en een
halve minuut. De rest: de schermen per rol (226 s), de schermen zonder rechten (158 s),
de bewakingstests (42 s) en alle werkstromen samen (58 s).

De vier-tegelijk-grens is bewust gekozen: de applicatie zelf houdt maximaal tien
databaseverbindingen open, en meer tests tegelijk lopen daar tegenaan. Wie het op een
andere machine sneller wil proberen, kan `E2E_WORKERS` op een ander getal zetten.

## Wat er tijdens een run gebeurt

- De database `lvs_e2e` wordt weggegooid en helemaal opnieuw opgebouwd. Niet vanaf een
  kopie, maar vanaf niets: het schema wordt neergezet en daarna draait de echte
  migratie eroverheen — dezelfde weg die een nieuwe productiedatabase aflegt. Zo valt een
  ontbrekende kolom op vóór een medewerker hem tegenkomt.
- Daarna wordt er vaste testdata ingezet: zeven medewerkers (één per soort), acht
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

**Het dekkingsgetal mag alleen omlaag.** In `e2e/registry/coverage-baseline.json` staat
hoeveel bestanden met een venster nog niet door een test worden geopend. Kijk daar voor
het getal van vandaag; bij het schrijven van deze handleiding ging het van 91 naar 90.
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
