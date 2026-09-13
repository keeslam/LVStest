# Eindrapport van de volledige audit

**Voor:** Kees Lam, Auto Lease LAM · **Over:** Car Rental Manager (de beheerapp) ·
**Datum:** 13 september 2026 · **Fases 59, 60 en 61 van het auditprogramma.**

De code zoals die vandaag in productie draait is `main`, commit `3e28645e`. Al het werk uit deze
audit staat op de tak `fix/audit-remediation`: **99 commits, 782 bestanden gewijzigd,
100 641 regels erbij en 5 581 eruit** (geteld met `git diff --stat main..HEAD`). Die tak staat
nog **niet** in productie.

Elk getal in dit rapport komt uit een van de elf fase-rapporten in deze map, uit `besluiten.md`,
of uit `git`. Waar een getal een schatting is, staat dat erbij.

---

## 1. Samenvatting voor de eigenaar

**Wat er is onderzocht.** De hele applicatie, vier dagen lang, in 63 stappen: elk scherm, elke
knop, elk e-mailbericht, elk document, de beveiliging, de database, de back-ups, de snelheid en
de manier waarop een medewerker een werkdag doorloopt. Er is nooit op de echte, draaiende
applicatie getest. Alles gebeurde op wegwerpkopieën van de database op een aparte testserver.

**Wat er is gevonden.** 230 aparte gebreken. Dertien daarvan waren ernstig: twee ervan zetten met
één enkel verzoek de hele applicatie uit voor iedereen tegelijk, een paar gaven toegang tot
gegevens aan mensen die daar geen recht op hadden, en één liet twee medewerkers dezelfde auto in
dezelfde periode verhuren. Twee gebreken waren op dat moment al kapot in productie: het
bewerkformulier van een reservering weigerde sinds 29 augustus élke opslag — twaalf dagen lang, en
niemand had het gemeld — en de knop "Voertuig toevoegen" deed soms helemaal niets, zonder ook maar
één melding. Daarnaast bleek de app traag op de plek waar hij het vaakst wordt gebruikt: één
maandweergave van de kalender stelde 924 vragen aan de database en duurde ruim een seconde.

**Wat er is gerepareerd.** Bijna alles wat technisch te repareren viel. Alle dertien ernstige
gebreken zijn dicht en dat is met echte proeven aangetoond, niet alleen op papier. Bij de grote
controleronde waren 171 van de 230 punten aantoonbaar verholpen; daarna zijn er nog veertien
bijgekomen, waaronder de compressie, de Nederlandse datums op het contract en het gat in de
inlogbeveiliging. De maandweergave opent nu in ongeveer 60 milliseconden in plaats van ruim een
seconde. De schadecheck die de app maakt is van 3,5 megabyte naar 5,6 kilobyte gegaan. Het
vangnet eronder is meegegroeid: er waren 126 automatische controles, er zijn er nu 1 048, en ze
zijn allemaal groen.

**Wat er beter is geworden aan het werk zelf.** Er is een startscherm "Vandaag" dat in één
oogopslag laat zien wat er die dag opgehaald, ingenomen, onderhouden en beoordeeld moet worden —
in plaats van vijf pagina's die de medewerker elke ochtend zelf langsging. Ophalen, innemen en
scannen staan nu vooraan op het dashboard. Het contract kan meteen vanuit het ophaalvenster
worden afgedrukt of gemaild. Een datum of een klant wijzigen kan in een klein venster in plaats
van het hele formulier. De zoekbalk vindt een contractnummer — het nummer dat de klant aan de
telefoon voorleest. En bij elke reservering, auto en klant staat nu een tabblad met de
geschiedenis: wie wat wanneer heeft gewijzigd.

**Hoe de applicatie er nu voor staat.** Technisch beduidend gezonder dan vier dagen geleden. Er is
geen enkel bekend gat meer waarmee iemand van buitenaf de applicatie kan platleggen of gegevens
kan inzien waar hij niet bij hoort. De kern van het verhuurproces is gedekt met tests, wat
daarvoor niet zo was. Tegelijk: er staat nog werk open, en een deel daarvan wacht op jou.

**Wat er van jou wordt gevraagd.** Drie dingen.
1. **Zes vragen die nog beantwoord moeten worden.** Ze staan in hoofdstuk 7a, elk in één regel.
   Zonder antwoord wordt er niets aan gebouwd — dat is de afspraak van dit hele programma.
2. **Drie opruimacties op de bestaande gegevens.** Er staan ruim 400 oude reserveringen open die
   auto's onterecht blokkeren, 258 onderhoudsblokken op auto's die niet meer bestaan, en acht
   auto's die in de werkplaats staan zonder dat er onderhoud gepland is. Alle drie zijn geteld en
   gerapporteerd; geen ervan is aangeraakt, want bestaande gegevens wijzigen is een besluit van
   jou.
3. **De uitrol.** Deze tak moet naar productie, en daar horen een paar concrete handelingen bij:
   het migratiescript moet draaien en moet stoppen als het misgaat, er komen vier nieuwe
   instellingen bij, en het beheerderswachtwoord `admin123` moet worden vervangen. Hoofdstuk 8
   is de lijst, op volgorde.

---

## 2. Wat er is onderzocht

Het programma had 63 fases met vaste stopmomenten: bij elk stopmoment lag er een rapport en werd
er gewacht op jouw akkoord. Hieronder wat er in elke groep is gebeurd.

| Groep | Fases | Wat er is gedaan | Rapport |
|---|---|---|---|
| Omgeving en inventarisatie | 0–1 | Alles wat de app is, uitgeschreven: 352 API-ingangen, 47 databasetabellen, elk scherm, elke rol, elke achtergrondtaak, elke koppeling naar buiten (RDW, CJIB, mail, kaarten). Nog niets aangeraakt. | `00-`, `01-` t/m `01d-` |
| Nulmeting | 2 | De bestaande tests, de typecontrole, de build en de pakketwaarschuwingen gedraaid en vastgelegd: 26 testbestanden / 126 tests groen, geen lint, geen E2E, geen CI, 70 bekende kwetsbaarheden in de gebruikte pakketten. | `02-` |
| Functioneel testen | 3–5 | Elk scherm en elke API-ingang beproefd met goede, rare en foute invoer: lege velden, onmogelijke datums, negatieve bedragen, veel te grote bestanden. | `03-` |
| Beveiliging | 6–8 | Een matrix van 360 ingangen tegen acht verschillende soorten gebruikers — van een beheerder tot iemand die helemaal niet is ingelogd. Plus statische codecontrole op de gevoelige plekken. | `04-` |
| Levenscyclus en gegevens | 9–12 | Een auto, een klant, een reservering en een transport van begin tot eind gevolgd: aanmaken, wijzigen, verhuizen, verwijderen, terughalen. Plus de integriteit van de database zelf. | `05-` |
| Gelijktijdigheid | 13 | Twintig medewerkers die op precies hetzelfde moment dezelfde auto boeken, dezelfde vervanger toewijzen, hetzelfde contractnummer trekken. | `06-` |
| Documenten en e-mail | 14–16 | De gegenereerde PDF's echt opengemaakt en de tekst eruit gelezen. De mail door een eigen SMTP-opvangserver gestuurd, zodat elke verzending zichtbaar werd zonder dat er een bericht de deur uit ging. | `06-` |
| Back-up en herstel | 17 | Op een derde server, met een eigen database en een eigen back-upmap: back-ups gemaakt, kapotgemaakt, half afgekapt, en teruggezet. | `07-` |
| Browser | 18 | De echte schermen in een echte browser bediend, op bureaublad- en tabletbreedte, met het netwerkverkeer en de foutmeldingen erbij. | `07-` |
| Snelheid | 19 | Per scherm geteld hoeveel vragen er naar de database gaan, hoeveel bytes er over de lijn komen en hoe lang het duurt — één gebruiker en tien tegelijk. | `07-` |
| Codekwaliteit | 20 | Dubbele implementaties, kringverwijzingen en ongeteste modules in kaart gebracht. | `08-` |
| Werkprocessen | 21–33 | Elf werkstromen nagelopen zoals een medewerker ze doet, met de klikken geteld. 33 verbetervoorstellen (OPT-001 t/m OPT-033), geen daarvan gebouwd zonder jouw akkoord. | `08-` |
| Repareren | 34–35 | Een herstelplan met 27 clusters in tien golven, daarna het repareren zelf — elke reparatie met een eigen test. | `09-` |
| Controleren | 36 | Alle 230 gevonden punten opnieuw beproefd tegen de gerepareerde code, door vijf controleurs, op een verse kloon. | `10-` |
| Handleiding | 37–58 | Achttien hoofdstukken Nederlandse gebruikershandleiding met dertien schermafbeeldingen, elke instructie in de draaiende app nagelopen. | `docs/gebruikershandleiding/` |
| Eindrapportage | 59–63 | Dit rapport. | `11-` |

### Hoe er is getest

- **Nooit op productie.** Geen enkele handeling in dit hele programma raakte de draaiende
  applicatie of de echte database.
- **Op wegwerpkopieën.** Voor elke zware fase is een verse kopie van de ontwikkeldatabase
  gemaakt, en die kopie is daarna weggegooid. Alle testgegevens dragen een herkenbaar voorvoegsel
  (`AUDIT-…`) zodat ze niet met echte gegevens te verwarren zijn.
- **Op aparte servers.** De audit draaide op eigen poorten (5001, 5002, 5003) met eigen uploads-
  en back-upmappen, naast de gewone ontwikkelserver.
- **Met echt verkeer.** Geen simulaties: echte HTTP-verzoeken, echte SQL, echte bestanden, echte
  PDF's waarvan de tekst is teruggelezen.

### Wat bewust niet is getest

- **Productie zelf.** Alle tellingen over bestaande gegevens (de oude reserveringen, de
  weesblokken, de kentekens) komen van klonen van de ontwikkeldatabase. Ze moeten opnieuw gemeten
  worden tegen productie voordat er iets op wordt gebouwd.
- **Echte e-mail.** Er is niets naar een echte klant verzonden; alles ging naar een eigen
  opvangserver.
- **De FTPS-koppeling met het CJIB en de facturenscan van Google** zijn niet tegen de echte
  diensten beproefd.
- **Werkelijke doorlooptijden.** Er is geen enkele medewerker met een stopwatch gevolgd. Alle
  kliktellingen zijn uit de code geteld; alle tijdwinsten zijn schattingen die daaruit volgen.
- **Belastingproeven op productieschaal.** Tien gelijktijdige gebruikers is het zwaarste dat is
  gemeten; dat is geen echte piekbelasting.
- **De volledige productie-uitvoering.** De controleronde van fase 36 draaide in
  ontwikkelmodus. Het verschil tussen ontwikkel- en productiemodus is niet apart nagemeten en
  hoort in de controle na de uitrol (hoofdstuk 8).

---

## 3. Gebruikte hulpmiddelen

### Plugins en werkwijzen

| Hulpmiddel | Waarvoor gebruikt |
|---|---|
| **superpowers** — brainstorming, writing-plans, executing-plans, subagent-driven development, systematic-debugging, test-driven development, verification-before-completion | De vorm van het hele programma: eerst een plan, dan uitvoeren in kleine stukken, elke reparatie eerst rood aantonen en daarna groen. De zware fases zijn met parallelle deelagenten gedaan, elk met een eigen bugbereik en een eigen testvoorvoegsel. |
| **graphify** | Kennisgraaf van de codebase (`graphify-out/`), gebruikt in fase 1 om de app in kaart te brengen zonder alles opnieuw te lezen. |
| **code-review / coderabbit / security-review** | Beschikbaar en incidenteel gebruikt bij het nalezen van eigen wijzigingen. |
| **anthropic-skills:pdf** | Het openen en uitlezen van gegenereerde PDF's. |
| **Claude Browser (MCP)** | De browserfase (18): echte schermen bedienen, netwerkverkeer en console meelezen, tablet- en mobielbreedte. |

### Testopstelling

| Onderdeel | Wat het is |
|---|---|
| **vitest, twee projecten** | `vitest.workspace.ts` draait een **node**-project (server, gedeelde code, scripts — tegen een echte testdatabase) en een **jsdom**-project (schermcomponenten, zonder database). Dat tweede project bestond vóór deze audit niet. |
| **supertest** | Echte HTTP-verzoeken door de Express-applicatie heen, inclusief inloggen, cookies en CSRF. |
| **Een server in een eigen proces** (`server/__tests__/helpers/childServer.ts`) | Nodig om te bewijzen dat een verzoek het proces niet meer uitzet: de test start een echte server, vuurt de lading af en kijkt of het proces nog leeft. |
| **Een eigen SMTP-opvangserver** (`helpers/smtpStub.cjs`) | Een kale TCP-server die het mailprotocol namaakt op 127.0.0.1:2525 en elk bericht vastlegt. Zo is bewezen dat één APK-herinnering drie mails opleverde. |
| **pdfjs-dist** (`helpers/pdfText.cjs`) | De tekst uit een gegenereerde PDF terugleggen naast wat er had moeten staan. Zo is bewezen dat er "September 13, 2026" op het contract stond. |
| **Headless Chrome via het DevTools-protocol** (`docs/audit/wip/scripts/p52-screenshots.cjs`) | De dertien schermafbeeldingen in de handleiding, gemaakt op een kloon met alleen voorbeeldgegevens. |
| **SQL-statementteller** (`helpers/sqlCounter.ts`, `log_min_duration_statement`) | Het tellen van databasevragen per scherm, drie herhalingen waarvan het minimum. De instelling is na afloop exact teruggezet. |

### Databases

Vier wegwerpklonen naast de gewone ontwikkeldatabase, elk voor een eigen doel:

| Database | Waarvoor |
|---|---|
| `lvs_audit` | De destructieve functionele, beveiligings- en prestatiefases (3–16, 18–19). |
| `lvs_audit_bk` | Alleen de back-up- en herstelfase (17), zodat een mislukt herstel niets anders kon raken. |
| `lvs_fixtest` | De testsuite zelf; daar draaien de 1 048 tests tegenaan. |
| `lvs_regress` | De controleronde van fase 36, een verse kloon zodat de reparaties op schone gegevens werden beproefd. |

Daarnaast zijn de Postgres-cliënttools (`psql`, `pg_dump`, `pg_restore`) lokaal geïnstalleerd — met
jouw toestemming uit fase 0 — omdat de back-upfase zonder die tools niet te doen was.

### Wat níet is gebruikt, en waarom

- **De `claude-security`-plugin (de volledige scan-en-patch-pijplijn) is nooit gedraaid.** Die
  vraagt een expliciete goedkeuring voor de kosten, en die is niet gegeven: bij stopmoment 4 stond
  er "ja", en een kaal "ja" is niet de kostentoestemming die ervoor nodig is. De beveiligingsfase
  is daarom met de hand gedaan: statische codecontrole plus de matrix van 360 ingangen × 8
  identiteiten. Dat heeft 105 bevindingen opgeleverd, dus het gat is gedekt — maar een
  onafhankelijke tweede scan is er niet geweest.
- **Playwright of Cypress.** Er is geen E2E-raamwerk in dit project en er is er geen geïnstalleerd;
  de browserfase is met de hand door de Claude Browser gedaan.
- **ESLint.** Niet geïnstalleerd, omdat dat de projectconfiguratie zou wijzigen. In plaats van
  cyclomatische complexiteit is functiegrootte gemeten.
- **Afhankelijkheden bijwerken.** De 70 waarschuwingen uit de nulmeting zijn wel beoordeeld op
  bereikbaarheid, maar er is geen enkel pakket opgewaardeerd: dat is een aparte, risicovolle
  operatie die niet samen met 230 reparaties in één uitrol hoort.

---

## 4. Wat er gevonden is

### De cijfers

| Zwaarte | Aantal | Aandeel |
|---|---|---|
| **KRITIEK** | 13 | 5,7 % |
| **HOOG** | 64 | 27,8 % |
| **MIDDEL** | 94 | 40,9 % |
| **LAAG** | 59 | 25,7 % |
| **Totaal** | **230** | |

Verdeeld over de fases: 59 punten uit het functionele testen, 46 uit de beveiligingsfase, 53 uit
de levenscyclus- en gegevensfase, 38 uit gelijktijdigheid/documenten/mail, 34 uit
back-up/browser/prestaties. Daarnaast 30 bevindingen over codekwaliteit (CQ-nummers) en 33
verbetervoorstellen voor het werkproces (OPT-nummers) die geen "fout" zijn maar een keuze.

### De tien die er het meest toe deden

**1. BUG-202 — het bewerkformulier van reserveringen faalde bij élke opslag, al twaalf dagen in
productie.** Twee onzichtbare velden (`replacementForTransportId` en `portalRequestId`) werden bij
het opslaan als lege tekst meegestuurd, en de server verwerkte die niet; elke poging om een
reservering te bewerken kwam terug met een foutmelding. Het is er op 29 augustus in geslopen en
een tweede keer op 8 september meegerold met de portaalfunctie, en pas deze audit heeft het
gevonden — er bestond geen enkele test op dat pad, dus dagenlang was elke correctie aan een
boeking alleen via een omweg te doen, en de kortste omweg dubbelboekte.

**2. Het formulier "Voertuig toevoegen" deed niets en zei niets.** Veertien datumvelden stonden
standaard op lege tekst, waarvan er vier niet eens op het scherm staan; het schema wees die lege
tekst af, en de knop deed bij een afgewezen formulier een stille terugkeer zonder melding. Wie een
auto probeerde in te voeren zag de knop bewegen en verder niets gebeuren — de auto kwam er nooit,
en er was geen enkele aanwijzing waarom.

**3. BUG-002 en BUG-061 — één verzoek zette de hele applicatie uit.** Een portaalaanvraag met
rommel in plaats van geldige gegevens, of een opvraging met een klantnummer dat niet bestaat, liet
het serverproces afbreken. De app was daarna 15 à 20 seconden onbereikbaar voor iedereen, en
iedereen die op dat moment ergens middenin zat, raakte dat kwijt. Dit kon door iedereen worden
veroorzaakt, zonder kwade bedoeling.

**4. BUG-006, BUG-106, BUG-107 en BUG-159 — dubbel verhuurde auto's.** De controle op
overlappende reserveringen keek eerst en schreef daarna, zonder slot ertussen. Twee medewerkers
die tegelijk opsloegen kregen allebei "opgeslagen". Bij het slepen in de kalender werd de controle
zelfs helemaal overgeslagen, en een huur van één dag middenin een lopende verhuur werd gewoon
geaccepteerd. Dat is de fout die uiteindelijk bij een klant op de stoep staat: twee mensen met een
contract voor dezelfde auto.

**5. BUG-005 — de realtime-verbinding stuurde volledige records naar iedereen die luisterde,
zonder in te loggen.** Elke wijziging in de app werd uitgezonden inclusief de complete
klantgegevens, en er zat geen enkele controle op wie er meeluisterde. Iemand die het adres van de
server kende kon meelezen zonder account.

**6. BUG-003 en BUG-060 — de kostenroutes stonden helemaal open.** Vier ingangen rond bonnen en
kosten vroegen geen inlog, en via het pad van een bon was elk bestand op de server uit te lezen.
Dat is zowel een gegevenslek als een kans om te zien hoe de server van binnen in elkaar zit.

**7. BUG-001 — een manager kon zichzelf tot beheerder maken.** Wie het recht had om gebruikers te
beheren kon zijn eigen rol op `admin` zetten. Daarmee was elke andere beperking in de app in één
klik weg.

**8. BUG-197 en BUG-069 — het terugzetten van een back-up.** Een beschadigde of half afgekapte
back-up werd teruggezet en gemeld als "gelukt", waarna de database half of leeg was. In dezelfde
hoek zat het omgekeerde risico: een geüpload archief werd uitgepakt over de map van de draaiende
applicatie, waarna de server de zojuist weggeschreven bestanden als eigen code uitvoerde. Het
eerste kost je je gegevens op het moment dat je ze het hardst nodig hebt; het tweede geeft iemand
met een account de sleutel tot de hele server.

**9. BUG-203 en BUG-216 — de app was traag op de plekken waar hij het meest wordt gebruikt.** Eén
maandweergave van de kalender stelde **924** vragen aan de database (2 per regel) en duurde bij
tien gelijktijdige gebruikers bijna zeven seconden. De lijst met schadechecks stuurde **17 MB** aan
ingebakken afbeeldingen mee voor veertien regels, en het kilometerrapport laadde diezelfde 17 MB
om er twee getallen uit te halen. Dat is elke ochtend wachten, en het maakt de hele app traag voor
iedereen die op dat moment iets anders doet.

**10. BUG-170 — één APK-herinnering ging naar iedereen die die auto ooit had gehuurd.** De proef
stuurde één herinnering voor één auto en de opvangserver ving drie berichten: de huidige huurder,
iemand uit 2021 en iemand van wie de huur pas in juli 2027 begint. Naast de verwarring stond er in
die mail wie er nu in die auto rijdt — dat is klantgegevens delen met een derde.

**En als elfde, omdat het stil was:** BUG-224 — elk tijdstempel in de app stond **twee uur** voor
op de werkelijkheid. Een document dat om 21:18 werd gemaakt stond als 23:18 op het scherm. Dat
raakt elk document, elke regel in het auditspoor en elke melding. Precies de kolom waar je naar
kijkt als er ooit weer iets verdwijnt (zoals in augustus met het voertuig) wees twee uur naast de
waarheid.

---

## 5. Wat er gerepareerd is

### Het bewijs

De reparaties zijn in **tien golven** uitgevoerd, elk met een eigen test die eerst de fout
aantoonde en daarna de reparatie bewees. Daarna is in fase 36 **elk van de 230 punten opnieuw
beproefd** tegen de gerepareerde code, door vijf controleurs, op een verse kloon.

| Oordeel bij de controleronde | Aantal | Aandeel |
|---|---|---|
| **Verholpen** | **171** | 74,3 % |
| Niet verholpen | 42 | 18,3 % |
| Bewust anders, volgens jouw besluit | 12 | 5,2 % |
| Vervallen (weerlegd of alleen-ontwikkelomgeving) | 5 | 2,2 % |
| Niet vast te stellen | **0** | 0 % |

Per zwaarte:

| Zwaarte | Verholpen | Niet verholpen | Bewust anders | Vervallen |
|---|---|---|---|---|
| **KRITIEK (13)** | **13** | 0 | 0 | 0 |
| HOOG (64) | 50 | 9 | 5 | 0 |
| MIDDEL (94) | 67 | 18 | 6 | 3 |
| LAAG (59) | 41 | 15 | 1 | 2 |

**Alle dertien kritieke punten zijn dicht en dat is met een echte proef aangetoond.** Er is geen
enkel punt dat "niet vast te stellen" bleef: alle 230 gaven een eenduidige uitkomst.

**Na de controleronde is er doorgewerkt.** Veertien van de 42 openstaande punten zijn daarna
alsnog gesloten (`git log`): het gat in de inloglimiet, het uitpakken van een archief over de
applicatie, het opslaan van een verzonnen bestandspad, de Nederlandse datums op het contract, de
HTTP-compressie, de tijdzone van de tijdstempels, het documentrecht, de ontvanger van de
APK-herinnering, "opgehaald" op een huur die nog niet begonnen is, de barcode die van een andere
auto kon zijn, de kilometerstand die niet meeliep, de sessierij voor een anonieme bezoeker en de
validatiegaten op de sjablonen. Daarmee komt het totaal op **ongeveer 185 van de 230 verholpen**.
Eerlijk erbij: die veertien zijn bewezen met hun eigen tests en met handmatige controle op de
draaiende testserver, maar niet met een tweede volledige controleronde zoals fase 36 die was.

### Het vangnet

| | Vóór de audit | Nu |
|---|---|---|
| Testbestanden | 26 | **141** |
| Tests | 126 | **1 048** |
| Schermtests (jsdom) | 0 | het hele tweede testproject |
| Typecontrole (`npm run check`) | schoon | **schoon** (opnieuw gedraaid, 13 september) |
| Build (`npm run build`) | slaagt | **slaagt** |

De verhuurkern — reserveren, ophalen, innemen, onderhoud, transport, documenten — had vóór deze
audit **geen enkele test**. Die heeft er nu tientallen.

### De gemeten verbeteringen

| Meting | Voor | Na |
|---|---|---|
| Kalendermaand: vragen aan de database | **924** (voor 462 regels) | **9** (voor 392 regels) |
| Kalenderjaar: vragen aan de database | 3 774 | 11 |
| Kalendermaand: wachttijd (p50 / p95) | 1 275 ms / 3 692 ms | **58,4 ms / 67,1 ms** |
| Kalendermaand, tien gebruikers tegelijk (p95) | 6 893 ms | **361 ms** |
| Lijst met schadechecks | **17 043 541 bytes** (14 regels) | **4 408 bytes** — 3 866× kleiner |
| Kilometerrapport | 126,9 ms | 83 ms |
| Schadecheck-PDF | 3 465 695 bytes, 581 ms, piek 2 598 ms | **5 619 bytes**, 96–109 ms, piek 131 ms |
| Voertuigenlijst: schrijfacties tijdens het lezen | tot 3 UPDATE's per leesverzoek | **0** |
| Reserveringenscherm, eerste opbouw | 9 verzoeken / **19,61 MB** (de lijst werd twee keer gehaald) | 8 verzoeken / **11,63 MB** |
| Logregels per schermopbouw op het hete pad | 17 566 bytes | **0** |
| Verzoek met een lichaam van 2 MB | 400 ná het parsen, +100 MB geheugen | **413 in 16 ms** |
| HTTP-compressie | geen | aan in de applicatie zelf; `/api/vehicles` 27–28× kleiner (gemeten met gzip) |

**De twee procesdoders zijn weg, en dat is met de bedrijfstijd van de server bewezen.** De server
liep tijdens de hele controleronde **niet één keer** opnieuw op: van 158 seconden bedrijfstijd bij
aanvang tot 2 755 seconden na de laatste hersteltest, terwijl er duizenden verzoeken, drie
overbelastingsladingen, een databaseherstel en een reeks kapotte archieven doorheen gingen. De
drie ladingen die de app vroeger uitzetten geven nu netjes 404, 400 en 400.

**Dubbel boeken lukt niet meer, ook niet bij gelijktijdigheid.** Van twintig gelijktijdige
pogingen op dezelfde auto en periode slaagde er precies één; de overige negentien kregen een nette
conflictmelding met de botsende reservering erbij.

### Wat een medewerker merkt

1. **Innemen sluit de huur meteen af** en de auto is direct weer vrij; er is geen tussentoestand
   meer die dagen later de auto nog blokkeert. *(besluit B-02)*
2. **De afgesproken einddatum blijft staan** bij innemen; de werkelijke innamedatum komt in een
   eigen veld.
3. **Ophalen vóór de startdatum vraagt eerst:** "Deze huur begint pas op … . Gaat de huur vandaag
   in?" Bij ja schuift de startdatum mee, zodat periode en prijs kloppen. *(B-16)*
4. **Een auto uit de werkplaats gaat niet zomaar mee.** De uitgifte wordt geweigerd; een beheerder
   kan met opgaaf van reden toch doorgaan. *(B-03)*
5. **Boeken over een onderhoudsblok mag, mét een waarschuwing** die de onderhoudsperiode noemt.
   Vroeger weigerde de app dit. *(B-09)*
6. **"Beschikbaar" betekent overal hetzelfde:** vrij in de gevraagde periode én status in orde.
   *(B-01)*
7. **Een auto of klant met een lopende of geplande huur gaat niet weg.** Eerst een impactlijst,
   dan de naam of het kenteken overtypen, en anders een Nederlandse weigering met de blokkerende
   huren erbij. *(B-14, B-08)*
8. **Er is een prullenbak voor reserveringen en transporten**, naast die voor voertuigen. *(B-15)*
9. **Annuleren vraagt per gekoppeld record** — transport, vervanger, chauffeurstoewijzing — wat er
   mee moet. *(B-04)*
10. **Een gewijzigde reservering markeert het contract als "verouderd"**, met een knop "opnieuw
    genereren"; het oude document blijft bewaard. *(B-05)*
11. **Een contractnummer dat al bestaat wordt geweigerd** met de melding welke reservering het al
    gebruikt, in plaats van een technische databasefout.
12. **Een sjabloon zonder velden levert geen blanco contract meer op** maar een weigering met
    uitleg. *Let op: het sjabloon dat nu als standaard staat is er zo één — er moet vóór
    ingebruikname een sjabloon mét velden als standaard gezet worden.*
13. **Onderhoud met vervanger is één handeling** in plaats van drie over twee schermen; afronden
    is één knop.
14. **Bij importeren wordt een onleesbare datum per regel afgekeurd** met de reden erbij; de
    overige regels gaan door. *(B-12)*
15. **De app kan "te veel verzoeken" antwoorden.** Er geldt nu een limiet van 1 000 verzoeken per
    kwartier per gebruiker en vijf mislukte inlogpogingen per kwartier per werkplek. Wie veel
    tabbladen openhoudt of een lange bulkactie draait, kan die grens raken.
16. **Een herstel van een back-up vraagt om de bestandsnaam** (overtypen) en maakt vooraf
    automatisch een veiligheidskopie waarvan de naam in de bevestiging staat.
17. **Een beschadigde back-up wordt geweigerd met uitleg** — "de dump is maar 45 bytes, er is
    niets gewijzigd" — in plaats van "gelukt".
18. **De documenten zijn Nederlands.** dd-mm-jjjj, 24-uursnotatie, bedragen met een komma,
    "7 dagen" in plaats van "7 days", "Voertuigruil" in plaats van "Vehicle Swap". *(B-18)*
19. **De statussen heten overal hetzelfde woord.** *Voltooid* is niet meer ergens anders
    *Afgerond*; *Ingeleverd* is niet meer ergens anders *Geretourneerd*; de kostencategorieën zijn
    Nederlands (Parkeren, Tol, Schoonmaak, Verzekering, Banden).
20. **De knop "Terugzetten" bij een voltooide verhuur werkt.** Die was dood; hij wees naar de
    verkeerde route. Nu is een verkeerd ingenomen verhuur weer terug te draaien.

---

## 6. Wat er verbeterd is aan het werk zelf

De werkprocesfases (21 t/m 33) hebben elf werkstromen nagelopen zoals een medewerker ze doet en de
klikken **uit de code geteld**. De frequenties ("50× per dag") en de tijdwinsten zijn schattingen.

### Wat er mis was aan het werk

- **Een dag kostte te veel klikken op de verkeerde plek.** Eén verhuring van intake tot afsluiten
  is **≈22 klikken** (geteld uit code); bij 50 verhuringen per dag is dat ruim 1 100 klikken
  (schatting). Het scanscherm doet hetzelfde werk in 1–2 klikken, maar stond op navigatiepositie 3
  en helemaal niet op het dashboard.
- **De app vertelde niet wat er vandaag moest gebeuren.** De medewerker opende elke ochtend vijf
  pagina's om zelf een dagbeeld te maken.
- **"Beschikbaar" betekende vier verschillende dingen.** Het dashboard zei 315 vrije auto's, het
  boekingsformulier 593 voor volgende week (gemeten op de kloon). Wie vanaf het dashboard een
  offerte gaf, verkocht de helft van de vloot niet.
- **Er was een onzichtbare achterstand.** In de kloon stonden honderden auto's stil onverhuurbaar
  door oude reserveringsrijen, en het merendeel van die rijen stond op géén enkel scherm.
- **Twee werkstromen waren al goed** en zijn het model geworden voor de rest: de
  bekeuringenafhandeling (systeem stelt voor, mens bevestigt, alles omkeerbaar — ≈5 klikken) en
  het scanpaneel (één fysieke handeling levert het juiste object én de juiste vervolgactie).

### Wat er is gebouwd

Je hebt op 11 september alle 33 voorstellen als geheel goedgekeurd. Het volgende is gebouwd; per
regel staat wat de audit uit de code heeft geteld.

| Wat | Voor | Na |
|---|---|---|
| **Het werkdagscherm "Vandaag"** (OPT-001) — wat vandaag opgehaald en ingenomen moet worden mét de knop die het doet, onderhoud en transport van vandaag inclusief nog toe te wijzen vervangers, en nieuwe portaalaanvragen | 5 pagina's, ≈5 klikken, **9 verzoeken / 56 databasevragen / 9,6 MB** | **1 verzoek / 9 databasevragen / 1 536 bytes**; 0 klikken om het dagbeeld te zien, 1 klik per handeling |
| **Ophalen, innemen en scannen als primaire ingang** (OPT-002) — de twee meest uitgevoerde handelingen stonden niet op het dashboard, terwijl de nachtelijke RDW-scan er wél een primaire tegel had | een ophaling starten kon niet vanaf het dashboard; via het reserveringenscherm ≈22 klikken | 1 tegel + 1 scan, waarna het ophaalvenster zichzelf opent |
| **Het contract direct uit het ophaalvenster** (OPT-005) — met "Afdrukken" en "Mail naar klant", en bij een mislukking de echte reden plus "Opnieuw proberen" | 4 klikken navigatie (sluiten, heropenen, scrollen, uitklappen) — en controleren óf het contract er was kon niet | **1 klik** vanuit hetzelfde venster; en of het contract er is wordt gezegd |
| **Kleine bewerkvensters** (OPT-010) — "Datums wijzigen", "Klant wijzigen", "Voertuig wijzigen" op de reservering zelf | 7 klikken door het volledige formulier van 23 velden, dat bij openen 9 vragen afvuurde | **4 klikken** plus het veld, vanaf het record dat al op het scherm staat |
| **De zoekbalk** (OPT-012) — wacht tot je uitgetypt bent en vindt een contractnummer | **21 API-aanroepen** voor een kenteken van acht tekens; een contractnummer werd niet gevonden | **3 aanroepen** per typepauze; het contractnummer wordt gevonden en getoond |
| **Geschiedenis per record** (OPT-022) — wie wat wanneer wijzigde, bij reservering, voertuig en klant | de vraag stellen kon niet: het filter werd geaccepteerd en genegeerd (906 regels als antwoord) | een tabblad "Geschiedenis" per record |
| **Dubbele klant en chauffeur detecteren** (OPT-019) — waarschuwen en openen, nooit blokkeren | geen enkele controle: dezelfde naam en e-mail tweemaal ingevoerd gaf tweemaal een nieuwe klant | een waarschuwing met de bestaande record erbij, op e-mail en op telefoonnummer (ook over klanten heen) |
| **RDW-verrijking bij voertuigimport** (OPT-031) | de import schreef `brand: "Unknown"`, `model: "Unknown"` en de voortgangsbalk stond op 5 % en bewoog niet | merk, model, type, chassis, brandstof, euroklasse, APK en WOK komen van de RDW; per rij terugvallen bij uitval; de balk beweegt met wat er werkelijk terugkomt |
| **Bulkacties met een resultaat per regel** (OPT-016) | één melding voor de hele stapel | per regel wat er is gebeurd |
| **Sneltoetsen** (OPT-021) — Ctrl+K of "/" naar de zoekbalk, N voor een nieuwe reservering, S voor het scanpaneel, ? voor het overzicht | geen enkele sneltoets buiten vier sjablooneditors | een kleine, bewust veilige set: een losse letter doet niets zolang je in een veld typt, en niets vuurt terwijl de scanner een code intikt |
| **Opmerkingenbevestiging per opmerking** (OPT-011) | bij élke ophaling van een auto met een notitie een extra klik | alleen bij een nieuwe of gewijzigde opmerking |
| **Onderhoud afronden als één handeling** (OPT-015) en **de vervanger krijgt de status die hij fysiek heeft** (OPT-008) | drie handelingen over twee schermen | één handeling |
| **De werklijst "Nog buiten"** (B-21) — de 363 reserveringen die beweren dat de auto nog buiten staat, langst openstaand bovenaan, met de inname-dialoog eraan | die rijen stonden op geen enkel scherm | een eigen scherm met de bestaande inname-actie |

---

## 7. Wat er nog open staat

### 7a. Wacht op een besluit van jou

**Vragen uit het werkproces die nooit beantwoord zijn** (`besluiten.md`, kop "Nog open"):

| Vraag | Wat er beantwoord moet worden |
|---|---|
| OPT-009 | Mag de app zelf een vervanger voorstellen en toewijzen, en op welke criteria? |
| OPT-017 | Welke statusomkeringen mogen, en door wie? |
| OPT-025 | Welke velden zijn verplicht voordat een voertuig verhuurd mag worden? |
| OPT-026 | BV → Opnaam: vooraf vragen of achteraf melden? |
| OPT-029 | Pechomruil: wat gebeurt er met de oorspronkelijke huur? |
| OPT-032 | Wat moet de sleutelkastaudit vastleggen en afdrukken? |

*(In `besluiten.md` staan zeven regels onder "Nog open", maar de eerste — OPT-001 — is met besluit
B-17 al beantwoord en het scherm is gebouwd. Er resteren dus zes vragen.)*

**Vragen die de audit opwierp en die niemand je heeft gesteld** (fase 36, §7.2):

| Punt | Wat er beantwoord moet worden |
|---|---|
| BUG-024 | Mag een nieuw wachtwoord gelijk zijn aan het oude? Nu wel, en er is geen wachtwoordhistorie. |
| BUG-040 | Mag een reservering in het verleden worden aangemaakt? Nu wel — en die blokkeert daarna elke toekomstige boeking op dat voertuig. |
| BUG-045 | Moet een debiteurnummer uniek zijn? Nu niet, en er komt geen waarschuwing. |
| BUG-056 | Wat moet een terugkerende reservering doen? De velden zijn vrij te zetten, er ontstaan geen kindrijen. |
| BUG-132 | Mag een opgehaalde verhuring geannuleerd of verwijderd worden, en door wie? Nu allebei, zonder drempel. |
| BUG-163 | Mag het genereren van een contract hard mislukken in plaats van een onbruikbaar bestand te leveren? |
| BUG-205 | Mogen de lijsten gepagineerd worden en mag de volledige voertuig- en klantrij eruit? Dat is de grootste resterende prestatiewinst. |

**Opruimacties op bestaande gegevens — geteld, gerapporteerd, niet uitgevoerd:**

| Punt | Wat er ligt |
|---|---|
| **De tijdstempelmigratie (B-22)** | Het schema is om; de omzetting van de bestaande 101 kolommen draait alleen als iemand bewust `TIMESTAMPTZ_MIGRATION=apply` zet. Eerst op een kloon draaien, het rapport bekijken, dán productie. Twee kanttekeningen staan in het kloonrapport: de aanname "alles is Amsterdamse tijd" klopt niet voor élke rij (rijen die de applicatie zelf schreef staan in UTC, die schuiven een of twee uur vooruit), en elke omzetting vergrendelt de tabel — dus een onderhoudsvenster. |
| **De ~790 oude, niet-afgesloten reserveringen (B-21)** | Het script doet nu wat het besluit zegt. Droogloop op de kloon, peildag 12 september: **431 rijen automatisch af te sluiten** (4 ingeleverd + 384 nooit opgehaald + 43 met een verouderde status) en **363 rijen op de werklijst** die iemand echt moet nalopen. In productie opnieuw meten, dan met `--apply` draaien. |
| **258 weesrijen** | Onderhoudsblokken op auto's die niet meer bestaan. Het aanmaakpad is dicht (een blok op een niet-bestaande auto geeft nu 404), de oude rijen leven nog, en er is nog steeds geen foreign key op `reservations.vehicle_id`. |
| **8 auto's in de werkplaats zonder onderhoudsblok** | Geteld door `scripts/data-hygiene-report.ts` (telt alleen, schrijft nooit). Die auto's zijn onverhuurbaar zonder dat er iets gepland staat. |
| **De kentekennormalisatie (B-10)** | Op de productievormige kloon (499 voertuigen): **0 kentekens die na normalisatie veranderen, 0 botsingen**. Dat is het antwoord op de vraag die B-10 vooraf stelde. In productie nog één keer meten, en daarna opschonen plus de unieke index plaatsen. |
| **Het kantooradres voor meldingen** | Het veld is er (WAVE 15): **App-instellingen → E-mail & GPS → Kantooradres voor meldingen**, onder de SMTP-configuraties. Het scherm zegt erbij waar het adres voor dient (voertuigen zonder huurder om te waarschuwen) en dat de app terugvalt op het afzenderadres zolang het leeg is. Wat er nog van jou moet komen is alleen nog de waarde zelf: **welk adres moet het worden?** |
| ~~Het bonnetjesveld (B-20)~~ | **Gebouwd (WAVE 15).** Een lokaal pad (`C:\scans\bon.pdf`) en een netwerkpad (`\\server\share\bon.pdf`) worden geweigerd met de uitleg *"Een lokaal pad of netwerkpad werkt niet voor uw collega's. Plak een link die met http:// of https:// begint, of upload het bonnetje als bestand."* Een http(s)-link, een mailto-/tel-link en een pad binnen de app blijven gewoon geldig. De regel zit op het opslagpad, dus de API weigert het net zo goed als het formulier. Bestaande rijen zijn niet aangeraakt. |

### 7b. Technisch werk dat nog kan

Dit is wat de controleronde als "niet verholpen" of "half verholpen" noteerde en wat daarna niet
alsnog is opgepakt. Eerlijk: dit is werk dat nog gedaan moet worden, geen lijstje kleinigheden.

| Punt | Wat er nog is, en waarom het bleef liggen |
|---|---|
| ~~BUG-134 / besluit B-06~~ | **Verholpen (WAVE 15).** Alle vier de gebeurtenissen van B-06 zijn nu aangesloten: gewijzigde datums of een andere auto, een geannuleerde (of verwijderde) reservering en een nieuw document leveren elk een portaalmelding **plus** een e-mail op, naast het onderhoud dat er al was. Alleen een klant met een portaalaccount krijgt bericht, een dedupe-tag per wijziging voorkomt dubbele meldingen, en niets van dit alles kan een opgeslagen wijziging van een medewerker laten mislukken. |
| BUG-205 | Lijsten zonder paginering, met de volledige voertuig- én klantrij in elke regel. De reserveringenlijst is nog 7,7 MB voor 1 984 regels. Formeel een besluit van jou (7a), praktisch de grootste resterende winst. |
| BUG-172 | Twee tabbladen die dezelfde reservering bewerken: de laatste opslag wint stil. De kleine bewerkvensters (OPT-010) maken dit veel kleiner, maar het onderliggende mechanisme is er nog. |
| BUG-185 | Twee gelijktijdige bulkverzendingen sturen alles dubbel; er is geen idempotentie op mail. |
| BUG-150 | De prullenbak kan niet definitief geleegd worden; bestanden blijven na een voertuigverwijdering op schijf staan, en documentmappen zijn nog op kenteken gesleuteld. |
| BUG-153 / BUG-157 | Het aantal huurdagen verschilt één tussen contract en financieel rapport; contractnummers met en zonder voorloopnul bestaan naast elkaar (drie zulke botsingsgroepen op de kloon). |
| BUG-055 / BUG-119 / BUG-183 | Documenten overleven het verwijderen van hun reservering; `contracts/data` geeft nog een verzonnen contractnummer voor een placeholder en een onderhoudsblok; een open reservering krijgt op de schadecheck nog een verzonnen periode van zeven dagen. |
| BUG-179 / BUG-181 | De achtergrond van een ánder sjabloon is selecteerbaar en een verwijderde achtergrond blijft aangewezen; zonder standaardsjabloon wordt gewoon de eerste rij gebruikt. |
| BUG-209 / BUG-219 | `download-files` en `download-code` geven nog 500 omdat `tar` op Windows een stationsletter niet accepteert. Het terugzetten is wél gerepareerd; dit gaat alleen over het downloaden van een back-up vanaf een Windows-host. |
| BUG-210 / BUG-212 / BUG-228 / BUG-230 | Het reserveringenscherm scrolt nog horizontaal op tabletbreedte; er is nog geen verbindingsindicator en vijf rapportcomponenten missen foutafhandeling; van de kalenderoptimalisatie en de nachtelijke scans is telkens één van de genoemde plekken nog ongewijzigd. |
| BUG-082 | Een verzonnen `X-Forwarded-For` komt letterlijk in het auditspoor terecht. Het IP-adres in dat spoor is dus door de client te verzinnen — juist de kolom waar je naar kijkt als er ooit weer iets verdwijnt. Dit is uitgesteld omdat het aantal proxystappen van Coolify moest worden vastgesteld; dat is nu instelbaar (`TRUST_PROXY_HOPS`), dus dit kan alsnog. |
| De 70 pakketwaarschuwingen | Uit de nulmeting: 3 kritiek, 23 hoog, 36 middel, 8 laag. Beoordeeld op bereikbaarheid, geen enkel pakket opgewaardeerd — dat hoort in een aparte, eigen uitrol en niet samen met 230 reparaties. |
| Geen CI, geen lint | Er is nog altijd geen automatische controle die draait bij elke wijziging. Met 1 048 tests is dat nu wél de moeite waard: precies het soort regressie dat op 29 augustus in productie kwam zou daarmee bij de volgende wijziging opvallen. |

### 7c. Voor de deploy

| Wat | Waarom het moet |
|---|---|
| **Het migratiescript moet draaien, en moet stoppen als het misgaat.** | Deze tak voegt kolommen toe (versie en "verouderd" op documenten, bevestigde opmerkingen, de koppeling naar het onderhoudsblok, de mailstatus op een document) en zet de nieuwe documentrechten. Zonder die migratie zoeken schermen naar kolommen die er niet zijn en komen ze terug met een serverfout. De `Dockerfile` doet het goed (`node startup-migration.js && npm start`, en het script eindigt met `process.exit(1)` bij een fout), **maar het startcommando dat in Coolify staat gaat door bij migratiefouten** — dat is vastgesteld in fase 0 en het staat niet in deze repo. Dat moet eerst worden rechtgezet. |
| `ALLOW_CODE_RESTORE` | Nieuw. **Laat hem uit** (niet zetten). De knop "code terugzetten" pakte een geüpload archief uit over de draaiende applicatie; hij staat nu uit tenzij deze variabele op `true` staat. Deze installatie vervangt code door opnieuw te deployen, dus uit is de juiste stand. Zet hem alleen tijdelijk aan als je die knop echt nodig hebt; hij werkt dan veilig, via een aparte map. |
| `TRUST_PROXY_HOPS` | Nieuw. Het aantal proxystappen dat werkelijk vóór de applicatie staat. Standaard **1 in productie** (Coolify zet het echte clientadres achteraan de keten) en 0 daarbuiten. Zonder deze instelling was de inloglimiet van buitenaf uit te zetten met een verzonnen afzender-IP. Klopt het getal niet, dan werkt de limiet niet zoals bedoeld — dus dit één keer nameten na de uitrol. |
| `TIMESTAMPTZ_MIGRATION` | Nieuw. **Niet zetten bij deze uitrol.** Zolang hij niet op `apply` staat converteert de deploy niets; het script meldt bij elke start alleen hoeveel kolommen nog openstaan. Pas zetten nadat je het kloonrapport hebt gezien (7a). |
| `DEFAULT_ADMIN_PASSWORD` | Nieuw. **Verplicht in productie.** De app weigert nu een eerste beheerder aan te maken met een ingebouwd wachtwoord. Zet hier een echt wachtwoord. |
| `NODE_ENV=production` | Moet gezet zijn. In ontwikkelmodus dragen foutmeldingen een volledige technische stacktrace en valt een onbekende API-ingang terug op de startpagina in plaats van een nette foutmelding. De applicatie geeft nu bij het starten een luide waarschuwing als dit niet goed staat. |
| Nieuwe afhankelijkheid: `compression` | Staat in `package.json`; een `npm ci` in de build pakt hem mee. Zonder dit pakket start de applicatie niet. |
| **Het beheerderswachtwoord `admin123` moet weg.** | Dat is het wachtwoord waarmee de hele audit heeft ingelogd en het staat in de rapporten. Wijzig het bij de eerste inlog na de uitrol. |
| Een handmatige back-up vooraf | Deze uitrol raakt onder meer het herstelpad zelf. Maak vóór de deploy een `pg_dump` buiten de applicatie om, en bewaar die ergens anders. |

---

## 8. Hoe je dit in productie zet

Kort en op volgorde. Stap 1 tot en met 4 kun je doen vóór je iets uitrolt.

1. **Maak vooraf een back-up buiten de applicatie om.** Een `pg_dump` van de productiedatabase,
   weggezet op een plek die niet in dezelfde container staat. Dit is geen formaliteit: deze uitrol
   verandert het herstelpad.
2. **Zet het startcommando in Coolify goed.** Het moet `node startup-migration.js && npm start`
   zijn, zodat de applicatie **niet** start als de migratie mislukt. Dat is precies andersom dan
   het nu staat.
3. **Zet de instellingen klaar in Coolify:**
   - `NODE_ENV=production`
   - `DEFAULT_ADMIN_PASSWORD=<een echt wachtwoord>`
   - `TRUST_PROXY_HOPS=1`
   - `ALLOW_CODE_RESTORE` — **niet zetten**
   - `TIMESTAMPTZ_MIGRATION` — **niet zetten**
4. **Zorg dat er een contractsjabloon mét velden als standaard staat.** Het sjabloon dat nu
   standaard is heeft geen velden, en de app weigert daar sinds deze ronde (terecht) een contract
   uit te maken.
5. **Rol de tak `fix/audit-remediation` uit.** Kies een rustig moment; reken op een korte
   onderbreking terwijl de migratie draait.
6. **Lees het startlogboek.** Je moet zien: `✅ Database migration completed successfully!`, geen
   `❌`, geen waarschuwing over `NODE_ENV`, en een regel die meldt hoeveel tijdstempelkolommen nog
   openstaan (dat is verwacht — die migratie draait bewust niet mee).
7. **Log in en verander onmiddellijk het wachtwoord van `admin`.**
8. **Controleer in vijf minuten of het werkt:**
   - Open **Vandaag**. Er staat een dagbeeld, geen foutmelding.
   - Open de **kalender in maandweergave**. Die hoort merkbaar sneller te openen dan je gewend
     bent.
   - Open een **reservering** en klik **Bewerken**, wijzig één veld en sla op. Dit is het formulier
     dat sinds 29 augustus bij elke opslag faalde — het moet nu gewoon opslaan.
   - Klik op een voertuig op **Voertuig toevoegen**, vul in wat zichtbaar is en sla op. Er hoort
     een auto te ontstaan, of een rood blok dat zegt wat er mankeert. Nooit meer "er gebeurt
     niets".
   - Genereer één **contract** en kijk of de datums Nederlands zijn (`13-09-2026`, "7 dagen") en de
     bedragen een komma hebben.
   - Open het tabblad **Geschiedenis** bij een reservering.
   - Controleer of de app **gecomprimeerd** antwoordt: de schermen horen merkbaar sneller te laden
     op een trage verbinding.
9. **Controleer dat de inloglimiet klopt.** Probeer vijf keer met een verkeerd wachtwoord in te
   loggen vanaf één werkplek; de zesde poging hoort geweigerd te worden. Gebeurt dat niet, dan
   staat `TRUST_PROXY_HOPS` verkeerd.
10. **Kijk de eerste dag mee.** Let op twee dingen: meldingen over "te veel verzoeken" (de nieuwe
    limiet kan een bulkactie raken) en het tijdstip op nieuwe documenten (dat staat nog twee uur
    voor tot de tijdstempelmigratie is gedraaid).
11. **Plan daarna, in deze volgorde, de drie opruimacties uit hoofdstuk 7a:** eerst het
    kloonrapport van de tijdstempels, dan de oude reserveringen (meten, voorleggen, uitvoeren), dan
    de kentekens.

---

## Bijlage — waar de cijfers vandaan komen

| Cijfer | Bron |
|---|---|
| 99 commits, 782 bestanden, +100 641 / −5 581 | `git log --oneline main..HEAD`, `git diff --stat main..HEAD` |
| 352 ingangen, 47 tabellen, productiecommit `3e28645e` | `00-phase-0-omgeving.md`, `01-phase-1-rapport.md` |
| 26 bestanden / 126 tests, 70 pakketwaarschuwingen | `02-phase-2-baseline.md` |
| 230 bevindingen, 13/64/94/59 | `10-phase-36-regressierapport.md` §2 |
| 171 verholpen, 42 niet, 12 bewust anders, 5 vervallen | `10-phase-36-regressierapport.md` §2 |
| 924 → 9 databasevragen, 1 275 → 58,4 ms, 17 MB → 4,4 kB, 3,5 MB → 5,6 kB, 19,61 → 11,63 MB | `10-phase-36-regressierapport.md` §5 |
| Bedrijfstijd 158 s → 2 755 s zonder herstart | `10-phase-36-regressierapport.md` §2.2 |
| 431 af te sluiten / 363 op de werklijst; 0 kentekenbotsingen | `10-phase-36-regressierapport.md` §6, commit `1dc96150` |
| 258 weesrijen, 8 auto's in de werkplaats zonder blok | commit `6662118c` (`scripts/data-hygiene-report.ts` op `lvs_regress`) |
| "Vandaag": 1 verzoek / 9 vragen / 1 536 bytes tegen 9 / 56 / 9,6 MB | commit `955495ab` |
| ≈22 klikken, 21 API-aanroepen, 5 pagina's dagstart | `08-phase-20-33-workflow-rapport.md` §1 en §3.1 (geteld uit code) |
| 141 bestanden / 1 048 tests | commit `e6ebe9da`; testbestanden nageteld op 13 september |
| Typecontrole schoon | `npx tsc --noEmit` opnieuw gedraaid op 13 september, afsluitcode 0 |

### Tegenstrijdigheden in de bronnen, eerlijk vermeld

1. **`besluiten.md` noemt zeven openstaande OPT-vragen**, maar de eerste (OPT-001) is met besluit
   B-17 beantwoord en het scherm is gebouwd. Er zijn er zes echt open.
2. **De 788 oude reserveringen uit besluit B-02 en de 790 uit de controleronde meten niet
   hetzelfde**, en beide zijn op verschillende klonen geteld (`lvs_audit` 665 voertuigen,
   `lvstest` 499, `lvs_regress` 499 plus testgegevens). Ook het aantal geblokkeerde voertuigen
   verschilt: 423 in het besluit tegen 417 in de hertelling. Alle drie moeten in productie opnieuw
   gemeten worden; dat staat in 7a.
3. **Het schadecheck-PDF heet in §8 van het regressierapport "van 3,4 MB naar 5,6 kB" en in §5.3
   3 465 695 bytes** (dus 3,5 MB). Ik heb het gemeten getal aangehouden.
4. **De testtellingen in de commitboodschappen lopen één keer uit de pas**: de tijdzonecommit
   noemt 975 → 981 terwijl het beginsaldo 969 was. De commit daarna signaleert dat zelf. De
   eindstand van 141 bestanden / 1 048 tests is nageteld.
5. **Fase 0 noemt "26 bestanden / 125 tests" en fase 2 "26 bestanden / 126 tests".** De nulmeting
   van fase 2 is de gemeten waarde.
6. **BUG-192 staat als LAAG in de tracker** terwijl het op elk document stond dat een klant kreeg.
   De zwaarte is bij de eerste vaststelling bepaald en nooit bijgesteld.
7. **De opdracht bij dit rapport noemde "het ontvangerveld in het APK-venster" als openstaand.**
   Dat is het niet meer: het venster noemt sinds de laatste ronde de werkelijke ontvanger. Wat wél
   openstaat is het kantooradres voor meldingen (`notification_office_email`), waarvoor geen veld
   in het beheerscherm bestaat. Zo staat het in 7a.
