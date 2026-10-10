# De browsertests

## Wat dit is

Dit is een tweede soort test naast de tests die er al waren. De bestaande tests
controleren losse stukjes code; deze tests bedienen de echte applicatie in een echte
browser, net zoals een medewerker dat doet. Laag A opent elk scherm en elk venster voor
elk soort medewerker en kijkt of er niets stukgaat. Laag B loopt hele werkstromen van
begin tot eind na — de baliestroom van telefoontje tot ingeleverde bus — en telt
daarbij hoeveel handelingen dat kost, zodat een latere wijziging die er een klik bij
doet meteen opvalt.

**Wat laag A niet bewijst.** De rechten worden nagelopen voor tien aangenomen
profielen (beheerder, manager, balie, schoonmaak, meekijker, boekhouding, onderhoud,
`reports-only`, `templates-only`, `notifications-only`). Een groene run zegt dus dat die
tien combinaties kloppen — niet dat élke denkbare combinatie van vinkjes klopt. In deze
applicatie is een rol maar een etiket en staan de rechten per persoon aangevinkt, dus
een medewerker met een ongebruikelijke mix kan nog steeds op een scherm stuiten dat
gegevens opvraagt die hij niet mag zien. Of die tien profielen overeenkomen met de
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

Het tiende profiel, `notifications-only` (B-29a), houdt **Dashboard bekijken** en
**Meldingen beheren** aan, uitdrukkelijk zonder **E-mailsjablonen beheren** — de eigenaar
bevestigde dat zulke accounts echt bestaan (sjablonen zijn met opzet alleen voor admin en
manager). Dat bewijst B-29a's eigen besluit: het scherm gaat nu ook open op **Meldingen
beheren** alleen, terwijl de sjabloonbeheerknoppen (nieuw sjabloon, opslaan, sjabloon
bewerken/verwijderen) zichtbaar, uitgeschakeld blijven en het ontbrekende recht noemen.

**De drie rechten van deelproject C (oktober 2026).** `revert_handover` (*Overdracht terugdraaien*),
`cancel_picked_up_rental` (*Opgehaalde huur annuleren of verwijderen*) en `manage_recycle_bin`
(*Prullenbak beheren*) zitten in de seed alleen bij `admin` (die heeft alles) en `manager`
(`without(MANAGE_USERS, MANAGE_BACKUPS, MANAGE_SETTINGS)`, dus alle andere rechten, ook deze drie): de app
geeft ze in de echte omgeving één keer aan elke manager. Geen enkel ander profiel heeft ze, ook `user`
niet; dat is wat de "zonder recht"-verhalen hieronder en de weigeringstests van `dialogs.spec.ts`
bewijzen. De twee tweelingen `admin-b` en `manager-b` hebben dezelfde rechten als hun profiel.

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
| `npm run e2e` | alles: laag A, laag B, de staart en daarna het dekkingsoverzicht van de vensters |
| `npm run e2e:a` | alleen laag A (schermen en vensters per rol) |
| `npm run e2e:b` | alleen laag B (de werkstromen) |
| `npm run e2e:tail` | de staart (`layer-b-tail`); omdat die van laag A en B afhangt, draait Playwright eerst de hele suite en dan de staart |
| `npm run e2e:coverage` | alleen het dekkingsoverzicht van de vensters |

**De staart (`layer-b-tail`, sinds B-32's aanvulling).** Eén Playwright-project dat pas
draait nadat laag A én laag B allebei klaar zijn (`dependencies: ["layer-a", "layer-b"]`),
en met `workers: 1` — nooit tegelijk met een andere test. Reden: een test hier laat het
"niet opgehaalde reserveringen"-venster (`e2e/layer-b-tail/reservations/past-reservation.spec.ts`)
een tijd lang open terwijl er meerdere stappen achter elkaar in gebeuren (opnieuw openen,
een rij annuleren). Een andere test die op dat moment tegelijk in dezelfde database
(`lvs_e2e`) rijen aanmaakt of annuleert, is dan niet meer te onderscheiden van wat deze
test zelf doet — geen eigen database nodig, wel een eigen plek ná de rest.

**B-34 (taak 6): een tweede staarttest, `e2e/layer-b-tail/contract/template-errors.spec.ts`.**
De seed zet voortaan één werkend PDF-sjabloon klaar ("E2E contract", standaard, een paar
echte velden), zodat een ophaling ergens in de rest van de suite ook echt een contract
oplevert in plaats van steevast `NO_TEMPLATE`. Deze test bewijst de kéérzijde daarvan: een
tweede sjabloon zonder velden, als standaard ingesteld, moet een nette Nederlandse tekst
geven — vertaald op de stabiele foutcode (`TEMPLATE_WITHOUT_FIELDS`), nooit op de Engelse
servertekst — in plaats van een leeg contract (BUG-028). Ook hier `mode: "serial"`: de test
verandert tijdelijk wélk sjabloon standaard is, wat een `lvs_e2e`-brede instelling is, en
zet die aan het eind weer terug.

**Terugdraaien en een opgehaalde huur annuleren (deelproject C, taak 4 en 5): vier verhalen in
`e2e/layer-b/desk/edge-cases.spec.ts`.** De bestaande baliestroom en zijn budgetten zijn niet aangeraakt.
De verhalen draaien als `manager` (heeft de rechten) of als `user` (heeft ze niet), nooit als `admin`: die
account is door laag A al het verst richting de grens van 1000 verzoeken (zie *Het verzoekbudget*). Elk
verhaal maakt zijn voertuig en boeking via de API en laat het eigenlijke werk op het scherm doen.

| Verhaal | Account | Budget (handelingen) | Wat het bewijst |
|---|---|---|---|
| *Overdracht terugdraaien* | `manager` | 10 (gemeten 10) | Ophalen met een tikfout in de kilometerstand (20350 km), daarna terugdraaien: de voorvertoning zegt *van 20.350 km naar 20.000 km*, het vinkje voor de lagere stand is nodig, daarna is de reservering weer geboekt, de teller staat op 20000, de auto is beschikbaar en het niet-ondertekende contract is als verouderd gemarkeerd |
| *Overdracht terugdraaien zonder recht* | `user` | 2 (gemeten 2) | De knop staat er uitgeschakeld met een tekstballon die het recht noemt, en er opent niets |
| *Opgehaalde huur annuleren* | `manager` | 4 (gemeten 4) | Een te late opgehaalde huur vanaf het dashboard: eerst de waarschuwing met datum en contract, pas na het vinkje wordt er geannuleerd; contractnummer en kilometerstand blijven, de auto is beschikbaar |
| *Opgehaalde huur verwijderen zonder recht* | `user` | 3 (gemeten 3) | De verwijderknoppen van een opgehaalde huur (lijst en kalenderkaart) staan uitgeschakeld met het recht genoemd; die van een geboekte huur werkt gewoon |

De knop *Overdracht terugdraaien* staat in het register (`e2e/registry/dialogs.ts`) met
`allowedPathNeedsState` en, omdat hij alleen binnen het detailvenster van een reservering bestaat, met
`deniedPathNeedsState` (zie *Een scherm of een venster toevoegen*); hetzelfde geldt voor *Reservering
annuleren*. Het bewijs per recht staat in de verhalen hierboven en in de componenttests.

**Prullenbakken (deelproject C, taak 7): een derde staarttest, `e2e/layer-b-tail/recycle-bin/bins.spec.ts`.**
Draait als `manager-b`, de tweeling van `manager` (zie *Het verzoekbudget* hieronder), het profiel dat naast de beheerder het recht *Prullenbak beheren*
heeft. Drie verhalen, elk met een eigen handelingenbudget: (1) een reservering verwijderen via
de lijst, zien dat hij alleen in de prullenbak van Reserveringen staat en terugzetten; (2) een
klant met een debiteurnummer verwijderen, zien dat het nummer gereserveerd blijft, de klant
definitief verwijderen (één rij, één bevestiging) en daarna hetzelfde nummer aan een nieuwe
klant geven; (3) twee rijen aanvinken, met één bevestiging die het aantal en de soort noemt
verwijderen, en bij *Prullenbak leegmaken* alleen de bevestiging openen en annuleren. De
benodigde klanten, het voertuig en de boeking komen via de API (zoals de balie ze zou hebben
gemaakt); alles waar de test om draait — verwijderen, terugzetten, definitief verwijderen —
gebeurt op het scherm. De test gaat nergens uit van een lege prullenbak: laag B laat zelf
rijen achter (het debiteurnummer-verhaal), dus rijen worden gevonden op het nummer dat de API
geeft, en *Prullenbak leegmaken* wordt hier nooit bevestigd.

De bevestiging achter *Prullenbak leegmaken* (`dialog-confirm-purge`) staat in het register
(`e2e/registry/dialogs.ts`) met **beide** velden `allowedPathNeedsState` en
`deniedPathNeedsState`, elk met de reden: de knop bestaat alleen binnen het prullenbakvenster en
staat uit zolang de prullenbak leeg is (de seed bevat geen verwijderde rijen), en een rol zonder
het recht kan het prullenbakvenster niet eens openen. `dialogs.spec.ts` maakt voor die ingang
dus geen test; het bewijs is deze staarttest.

**Onderhoud afronden (deelproject C, taak 8): `e2e/layer-b/maintenance/complete-maintenance.spec.ts`.**
Draait als het profiel `maintenance` (*Onderhoud beheren*, voertuigen bekijken en beheren, reserveringen
bekijken, documenten bekijken — uitdrukkelijk **niet** *Documenten beheren*, zodat het bewijst dat
afronden niet meer drie rechten vraagt). Dat profiel heeft *Reserveringen bekijken* al; het is wat het
onderhoudsscherm nodig heeft om de blokken te tonen (B-37 noemt het als bekende grens). Twee verhalen,
elk met een budget van 6 handelingen: (1) een gepland blok afronden met een nieuwe APK-datum, een nieuwe
kilometerstand en een klein pdf-bestand — de test controleert dat er precies één verzoek de deur uit gaat
(`POST /api/reservations/:id/complete-maintenance`, niets naar `/api/documents` of `/api/vehicles`),
dat het blok gesloten is, dat het voertuig de nieuwe APK-datum, stand en laatste beurt heeft en weer
beschikbaar is, en dat de pdf als APK-document bij het voertuig én het blok staat en terug te lezen is;
(2) een kilometerstand lager dan die van het voertuig: de server weigert (`MILEAGE_LOWER_THAN_CURRENT`),
het venster noemt beide getallen en blijft open, er is niets opgeslagen, en de gecorrigeerde stand gaat
daarna wel door. De blokken staan op twee **bestaande** voertuigen uit de seed (`E2E-06-F` en `E2E-07-G`,
in laag B door niets anders gebruikt), nooit op een voertuig van de spec zelf: de voertuigenlijst
toont er tien per pagina en het balieverhaal *Voertuig toevoegen* verwacht zijn nieuwe voertuig op de
eerste pagina — acht seedvoertuigen plus twee van deze spec zetten het op pagina twee (dat gebeurde bij
de eerste run). Het blok en de werkplaatsvlag komen via de API van `admin-b`
(het profiel `maintenance` mag zelf geen blok plannen: dat vraagt *Reserveringen beheren*), zodat het
verzoekbudget van `maintenance` (ongeveer 550 van 1000 na laag A en B) voor de verhalen zelf blijft. De
verhalen kosten dat account samen ongeveer 60 verzoeken (gemeten: 27 en 28 `/api/`-verzoeken); ruim onder de 800.

Het venster zelf (`complete-maintenance-dialog.tsx`) staat in het register met **beide** velden
`allowedPathNeedsState` en `deniedPathNeedsState`: de knop `button-complete-scheduled_maintenance_<id>`
bestaat alleen voor een openstaand blok in het dagvenster van de kalender, en de seed bevat geen blok.
Het bewijs per recht staat in `complete-maintenance-dialog.test.tsx`.

**Communicatie: een bericht dat niet aankomt (auditherstel P3): `e2e/layer-b/communications/send-and-log.spec.ts`.**
Draait als `manager-b` (de tweeling van `manager`: eigen verzoekenteller, en beide rechten *Meldingen beheren* en
*E-mailsjablonen beheren* die `notifications-only` en `templates-only` elk maar half hebben). Eén verhaal, budget
9 handelingen (gemeten 9), ongeveer 19 `/api/`-verzoeken. De testserver heeft geen e-mailconfiguratie en er gaat
niets naar buiten, dus een bericht aan klant *E2E Pieter Bakker* mislukt altijd: het verhaal bewijst dat de pagina dan
niet meer "succesvol verstuurd" zegt maar "Er is niets verstuurd" (en de ontvanger en de tekst laat staan), dat de
voorvertoning de e-mail toont zoals deze klant hem krijgt (naam ingevuld, `{naam}` en `{{naam}}` allebei), dat het
E-maillogboek na de verzending meteen de nieuwe regels toont met de reden in het Nederlands (de Engelse tekst blijft
als technische melding staan) en dat een regel opent in het venster `email-log-detail-dialog.tsx`. Die ene rode
melding is het doel van het verhaal en wordt in de spec op zijn exacte tekst uit de paginabewaking gehaald; de
bewaking zelf is niet versoepeld. Het venster staat in `LAYER_B_SOURCES` (de opener draagt het id van de logregel en
de seed bevat geen logregels). De overige wijzigingen van P3 staan in `customer-communications-p3.test.tsx`.

Voorwaarden:

- PostgreSQL moet lokaal draaien (localhost, poort 5432, gebruiker `postgres`).
- De eerste keer bouwt de applicatie zichzelf. Dat duurt een paar minuten. Daarna wordt
  die bouw hergebruikt zolang er geen bronbestand nieuwer is.

Het dekkingsoverzicht hoef je meestal niet apart te draaien: bij `npm run e2e` gebeurt
dat automatisch aan het eind.

## Het verzoekbudget (`admin-b`, `manager-b`, `user-b`)

De applicatie geeft elke ingelogde gebruiker 1000 API-verzoeken per 15 minuten (`apiLimiter` in
`server/middleware/security/rateLimiter.ts`). De tellers staan in het geheugen van het serverproces,
en één run is één serverproces binnen één venster: alles wat een account in een run doet telt dus
mee, en elke run begint wel weer op nul. De testserver draait met **precies dezelfde limiet als
productie**: er is geen schakelaar en geen hoger plafond (regel 2 hieronder; zie ook het ontwerp,
`docs/superpowers/specs/2026-09-20-e2e-browser-tests-design.md`, "Rate limits"). Een 429 blijft
ook een fout voor de paginabewaking (`e2e/support/guards.ts`), want het is het enige signaal dat een
scherm of werkstroom meer verzoeken doet dan een medewerker mag. Komt één account in de buurt van
de 1000, dan is het middel een **extra gebruiker in de seed**, nooit een ruimere server.

Daarom bestaan er drie *tweelingen* (`e2e/seed/users.ts`, `TWIN_OF`): `admin-b`, `manager-b` en
`user-b`. Ze hebben dezelfde rechten en hetzelfde roletiket als `admin`, `manager` en `user`
(gebruikersnaam `e2e-admin-b` enzovoort), een eigen opgeslagen sessie (`e2e/.tmp/auth/<naam>.json`,
gemaakt door `e2e/setup/auth.setup.ts`) en dus een eigen teller. Ze horen **niet** bij `ROLES`: de
rollenmatrix van laag A loopt over de tien profielen, en een extra kopie van een rol zou alleen
meer verzoeken kosten.

- **Laag A, `dialogs.spec.ts`.** De vensters van `admin`, `manager` en `user` worden verdeeld over
  het profiel zelf en zijn tweeling, op de plek van de ingang in het register
  (`e2e/registry/dialogs.ts`): even plekken als het profiel, oneven plekken als de tweeling. De
  verdeling ligt vast, dus een falende test heeft elke run dezelfde naam (`dialogs as admin-b`).
  Elk ander profiel houdt zijn ene sessie. `pages.spec.ts` en `forbidden.spec.ts` blijven
  ongewijzigd.
- **De staart (`layer-b-tail`).** Die draait als laatste, op de resten van hetzelfde venster. De
  drie specs zijn verdeeld: `template-errors` als `manager` (ongeveer 60 verzoeken), `bins` en
  `past-reservation` als `manager-b` (ongeveer 125 en 105), omdat de tweeling aan het begin van
  de staart de meeste ruimte heeft.
- **De baliewerkstroom en de andere laag-B-verhalen** houden hun rol (`user`, `manager`,
  `maintenance`, `admin`); zij horen bij hun verhaal, niet bij het budget.

**Gemeten (9 oktober 2026, één volledige run, verzoeken per account van 1000).** Links na laag A en B
(het begin van de staart), rechts aan het eind van de run:

| Account | begin staart | einde run |
|---|---|---|
| `admin` / `admin-b` | 781 / 313 | 784 / 316 |
| `manager` / `manager-b` | 652 / 285 | 717 / 515 |
| `user` / `user-b` | 761 / 158 | 764 / 161 |
| `cleaner`, `viewer`, `accountant`, `maintenance` | 466, 542, 536, 544 | 469, 545, 539, 547 |

Zonder de verdeling had `admin` ongeveer 1094 verzoeken nodig gehad (781 + 313), `manager` 937 en
`user` 919. De drie profielen die alleen het dashboard en een of twee schermen openen
(`reports-only`, `templates-only`, `notifications-only`) zitten ver onder de grens.

**Regel voor een nieuwe spec of een groeiend register.** Houd elk account onder de ongeveer 800
verzoeken (80 procent). Een nieuwe laag-B-spec die veel verzoeken doet, kiest het account met de
meeste ruimte uit bovenstaande tabel (in de staart: de tweeling) en zet de reden in de spec; groeit
de staart tot een tweeling te vol raakt, dan krijgt het volgende verhaal een eigen tweeling door een
regel bij `TWIN_OF` te zetten, zoals de verdeling in `dialogs.spec.ts` er ook een kreeg. Meten kan
met een tijdelijk testbestand dat per opgeslagen sessie `GET /api/vehicles` doet en
`1000 - RateLimit-Remaining` afdrukt (`/api/user` staat vóór de limiet en telt niet mee); de
staarttest `past-reservation` drukt het resterende budget van zijn eigen account al af.

## Hoe lang het duurt

Op deze machine, 22 september 2026 (na de doorlichting van de rechten, het tiende
profiel (B-29a) en de nabeoordeling die volgde), één volledige `npm run e2e`:

```
355 geslaagd, 2 bewust overgeslagen, 0 mislukt   (ruim 8 minuten)
```

De twee overslagen zijn allebei al langer bekend: het `menu-settings`-venster voor de
beheerder, en de gekwarantaineerde 1280x800-test van het Logboek — beide met hun eigen
`test.fixme`-reden in de broncode. Reken op **ruim acht minuten**, niet op één exact
getal: het scheelt of de applicatie opnieuw gebouwd moet worden, wat de machine verder
te doen heeft, en (sinds het tiende profiel) een tiende rol erbij in elk van de drie
per-rol specs.

**Bijgewerkt (24-09-2026), na de twee staarttests van B-32 en B-34 hierboven:** de staart telt
mee in `npm run e2e`, dus de tellers zijn iets hoger: `358 geslaagd, 2 bewust overgeslagen, 0
mislukt` (ruim 8 minuten). De twee overslagen zijn nog dezelfde als hierboven.

**Bijgewerkt (09-10-2026), na de prullenbakken van deelproject C en de drie tweelingen:** `398 geslaagd,
2 bewust overgeslagen, 0 mislukt` (8,3 minuten). Het dekkingsoverzicht staat op `120 bestanden met een venster,
33 bereikt door een test, 87 nog niet`.
Met het venster **Onderhoud afronden** (deelproject C, taak 8) erbij: `121 bestanden met een venster, 34 bereikt door een test, 87 nog niet` — de
grens van 87 is niet veranderd. Laag B (`npm run e2e:b`) draait nu `30 geslaagd, 1 bewust overgeslagen`.

Het dekkingsoverzicht van de vensters (`npm run e2e:coverage`, draait ook automatisch
aan het eind van `npm run e2e`):

```
Vensters: 119 bestanden met een venster, 30 bereikt door een test, 89 nog niet
```

Dat is precies de vastgelegde grens, dus er is niets achteruitgegaan. **Bijgewerkt
(24-09-2026):** met het nieuwe venster **Niet opgehaalde reserveringen** erbij (B-32's
aanvulling) staat de teller op `120 bestanden met een venster, 31 bereikt door een test, 89 nog
niet` — de grens van 89 zelf is dus niet veranderd.

**Ruim acht minuten is meer dan de streefwaarde van vijf.** Het langzaamste deel is met
afstand `e2e/layer-a/dialogs.spec.ts`: 194 van de 357 tests (`npx playwright test -c
e2e/playwright.config.ts --list` telt ze precies) en samen zo'n 930 seconden testtijd,
ruim de helft van de ongeveer 1610 seconden die alle tests bij elkaar kosten. Die tests
draaien met vier tegelijk, dus in werkelijke tijd is het ruim vier minuten. De rest van
diezelfde run: de schermen per rol (271 s), de schermen zonder rechten (306 s), de
bewakingstests (47 s) en alle werkstromen samen (56 s).

De vier-tegelijk-grens is bewust gekozen: de applicatie zelf houdt maximaal tien
databaseverbindingen open, en meer tests tegelijk lopen daar tegenaan. Wie het op een
andere machine sneller wil proberen, kan `E2E_WORKERS` op een ander getal zetten.

## Wat er tijdens een run gebeurt

- De database `lvs_e2e` wordt weggegooid en helemaal opnieuw opgebouwd. Niet vanaf een
  kopie, maar vanaf niets: het schema wordt neergezet en daarna draait de echte
  migratie eroverheen — dezelfde weg die een nieuwe productiedatabase aflegt. Zo valt een
  ontbrekende kolom op vóór een medewerker hem tegenkomt.
- Daarna wordt er vaste testdata ingezet: dertien medewerkers (één per profiel, plus de drie tweelingen van het verzoekbudget), acht
  voertuigen, zes klanten, reserveringen in elke status, en (sinds B-34, taak 6) één PDF-
  sjabloon voor het contract ("E2E contract", standaard, drie velden: klantnaam, kenteken,
  startdatum — geen achtergrond).
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
- Een knop die op een kale paginalading niet bestaat, omdat hij alleen binnen een venster van een
  record staat (de *Overdracht terugdraaien*-knop in het reserveringsdetail), krijgt daarnaast
  `deniedPathNeedsState: "<reden>"`. `dialogs.spec.ts` slaat dan ook de weigeringstest voor die ingang
  over, want er is op de pagina niets om uitgeschakeld te vinden. Zonder reden blijft de weigering een
  echte test. Beide velden hebben een geschreven reden nodig; er komt geen uitzondering zonder.
- Sluit `dialogs.spec.ts` een venster dat bovenop een ander venster opende (de prullenbak van de
  bekeuringen opent vanuit de bekeuringenlijst), dan controleert hij dat het *geopende* venster zelf uit
  de pagina verdwijnt, niet dat er geen venster meer over is. Alleen als er maar één venster was, geldt
  ook nog de strenge controle dat er geen enkel venster overblijft.

**Het dekkingsgetal mag alleen omlaag.** In `e2e/registry/coverage-baseline.json` staat
hoeveel bestanden met een venster nog niet door een test worden geopend (nu 87). Kijk
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
