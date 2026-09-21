# Besluiten van de eigenaar (fase 33 goedkeuringspoort)

Kees heeft op 2026-09-11 de 33 OPT-voorstellen uit `08-phase-20-33-workflow-rapport.md` als geheel
goedgekeurd ("ook goedkeuring"). De BUSINESS DECISION-voorstellen bevatten elk nog een inhoudelijke
keuze; die worden hieronder vastgelegd naarmate ze gesteld en beantwoord zijn. Alleen wat hier staat
mag als besluit worden geïmplementeerd. Alles wat hier nog niet staat: opnieuw vragen (STOP).

## Vastgelegd 2026-09-11

### B-01 — Betekenis van "beschikbaar" (OPT-004)
**Besluit:** vrij in de gevraagde periode **én** status ok.
Eén definitie voor dashboard, boekingsformulier en het nieuwe beschikbaarheidsscherm: geen
overlappende reservering in de gevraagde periode, niet in onderhoud, niet `not_for_rental`, niet in de
prullenbak. Het dashboard toont "vrij vandaag" volgens diezelfde definitie.
Raakt: OPT-004, OPT-006, BUG-018, BUG-130, de vier uiteenlopende definities uit fase 22.

### B-02 — Afsluiten van een huur bij inname (OPT-003)
**Besluit:** automatisch afsluiten bij inname.
Inname zet de reservering direct op `completed`; het voertuig komt meteen weer vrij. Eenmalige
bulkactie sluit de bestaande oude rijen af die nu voertuigen blokkeren (788 rijen / 423 voertuigen in
de dev-kloon; vóór uitvoering opnieuw meten in productie).
Raakt: OPT-003, BUG-113, BUG-129, BUG-144.

### B-03 — Werkplaatsstatus en uitgifte (OPT-007, OPT-023)
**Besluit:** blokkeren, alleen een beheerder kan forceren.
Uitgifte wordt geweigerd zolang het voertuig `needs_fixing` of `in_service` is; een beheerder kan met
opgaaf van reden toch doorgaan. De werkplaatsvlag verdwijnt niet meer bij inname of bij het afronden
van een transport.
Raakt: OPT-007, OPT-023, BUG-109, BUG-211, en de drie schrijvers van `availability_status` (OPT-006).

### B-04 — Annuleren met gekoppelde records (OPT-028)
**Besluit:** vragen wat er mee moet, daarna uitvoeren.
Bij annuleren toont de app wat eraan hangt (transport, vervangingsreservering, placeholder,
chauffeurstoewijzing) en vraagt per onderdeel: meeannuleren of laten staan. De gekozen actie wordt in
één keer uitgevoerd en in de historie vastgelegd.
Raakt: OPT-028, BUG-112, BUG-115, BUG-118.

### B-05 — Verouderde documenten na een wijziging (OPT-014)
**Besluit:** markeren als verouderd plus een knop "opnieuw genereren".
Het oude document blijft bewaard maar krijgt zichtbaar de status "verouderd"; het versienummer komt in
een eigen kolom in plaats van in `document_type`. De medewerker genereert bewust een nieuwe versie.
Raakt: OPT-014, BUG-027, en de documentketen uit fase 22.

### B-06 — Meldingen aan de portaalklant bij kantoorwijzigingen (OPT-027)
**Besluit:** melden bij alle vier de gebeurtenissen:
1. datums of voertuig gewijzigd;
2. reservering geannuleerd;
3. onderhoud gepland of verzet (inclusief toewijzing vervangend vervoer);
4. nieuw document beschikbaar.
Telkens een portaalmelding plus e-mail, via de bestaande `portal_notifications`/mailweg.
Raakt: OPT-027, BUG-134, BUG-155.

### B-07 — Prijs bij gewijzigde datums (OPT-030)
**Besluit:** dagprijs vastleggen, totaal automatisch herberekenen.
De reservering krijgt een dagprijs; het totaal volgt uit de periode en wordt serverzijdig herberekend
en gevalideerd. Handmatig overschrijven blijft mogelijk, met reden.
Raakt: OPT-030, BUG-054, BUG-153.

### B-08 — Klant verwijderen (OPT-033)
**Besluit:** prullenbak plus blokkade bij een lopende of toekomstige huur.
De klant gaat naar de prullenbak (herstelbaar, zoals voertuigen); verwijderen wordt geweigerd zolang
er een lopende of toekomstige reservering is; vooraf een duidelijke impactlijst.
Raakt: OPT-033, BUG-007, BUG-039, BUG-143.

## Vastgelegd 2026-09-12

### B-09 — Verhuring op een auto met een onderhoudsblok (OPT-023, BUG-013, BUG-037)
**Besluit:** waarschuwen, de medewerker mag doorgaan.
Bij het boeken van een periode die over een actief onderhoudsblok valt toont de app een duidelijke
waarschuwing met de onderhoudsperiode erbij; opslaan blijft toegestaan. Het blok blijft zichtbaar in
de kalender. Twee overlappende onderhoudsblokken op één auto vallen onder dezelfde regel.
Let op de samenhang met B-01: "in onderhoud" telt niet mee als *beschikbaar* in tellingen en
suggesties, maar blokkeert het bewust boeken niet.

### B-10 — Kentekens normaliseren (BUG-020)
**Besluit:** ja, bestaande gegevens normaliseren plus een harde uniciteitsregel in de database.
Volgorde: eerst in productie meten of er voertuigen zijn die na normalisatie samenvallen; als die er
zijn, stoppen en de lijst voorleggen. Pas daarna de opschoning en de unieke index.

### B-11 — Wachtwoord van een ander account zetten (BUG-063)
**Besluit:** beheerdersrecht is voldoende, geen extra herbevestiging van het eigen wachtwoord.
De handeling wordt vastgelegd in het auditspoor.

### B-12 — Bulkimport met onleesbare datums (BUG-124)
**Besluit:** de regel afkeuren met een melding per regel; de overige regels worden gewoon
geïmporteerd. Stil weglaten van een APK-datum mag niet meer voorkomen.

### B-13 — Huur verhuist naar een andere auto (BUG-139)
**Besluit:** het onderhoudsblok blijft bij de fysieke auto.
De gekoppelde vervanger en de bijbehorende klantmelding vervallen; de klant krijgt bericht dat het
onderhoud niet meer bij zijn huur hoort (conform B-06).

### B-14 — Voertuig verwijderen met lopende of geplande huur (BUG-022)
**Besluit:** weigeren zolang er een huur loopt of gepland staat, met een impactlijst vooraf; daarna
gaat het voertuig naar de prullenbak. Dezelfde regel als voor klanten (B-08).

### B-15 — Prullenbak voor reserveringen en transporten (BUG-140, BUG-151)
**Besluit:** ja, allebei herstelbaar, met dezelfde impactcontrole als bij voertuigen.

### B-16 — Ophalen vóór de startdatum (BUG-211)
**Besluit:** de medewerker krijgt de vraag of de huur eerder ingaat; na bevestiging schuift de
startdatum naar vandaag, zodat periode en prijs kloppen (samen met B-07). Weigeren gebeurt alleen als
de medewerker de vraag met nee beantwoordt.

### B-17 — Inhoud van het werkdagscherm "Vandaag" (OPT-001)
**Besluit:** onder "Openstaande punten" staan drie dingen:
1. wat vandaag opgehaald en ingenomen moet worden, met de knop om dat direct te doen;
2. onderhoud en transport van vandaag, inclusief vervangers die nog toegewezen moeten worden;
3. nieuwe portaalaanvragen die beoordeeld moeten worden.
**Niet** gekozen: een lijst "te laat terug". Die is bewust weggelaten; zolang de oude rijen niet zijn
afgesloten (B-02) zou die lijst vooral ruis tonen. Later alsnog toevoegen kan, maar pas na de
opschoning en na een nieuw besluit.

### B-18 — Taal en notatie van gegenereerde documenten (BUG-192)
**Besluit:** altijd Nederlands met Nederlandse notatie (dd-mm-jjjj, bedragen met een komma),
ongeacht wie het document genereert of welke taal de klant in het portaal gebruikt.

### B-19 — HTTP-compressie (BUG-214)
**Besluit:** aanzetten in de applicatie zelf, niet afhankelijk van wat de proxy doet. Dubbele
compressie wordt overgeslagen wanneer de proxy het al heeft gedaan.

### B-20 — Bonnetjesveld met een lokaal pad
**Besluit:** weigeren. Alleen een echte link of een geüpload bestand; een lokaal of netwerkpad werkt
voor collega's toch niet.

### B-21 — De ~790 oude, niet-afgesloten reserveringen (uitwerking van B-02)
**Besluit:** gesplitst afhandelen.
- De 380 rijen met status `booked` die nooit zijn opgehaald en de 38 met een verouderde status
  (`active`, `scheduled`, `in`, …) worden automatisch geannuleerd/afgesloten.
- De 363 rijen met status `picked_up` worden **niet** automatisch afgesloten: die beweren dat de auto
  nog buiten staat. Die komen op een werklijst die iemand echt naloopt.
Het bestaande script `scripts/close-returned-reservations.ts` dekt deze regel niet (het sloot er 4
van 790) en moet hierop worden uitgebreid.

### B-22 — Tijdzone van tijdstempels (BUG-224)
**Besluit:** migreren naar tijdzone-bewuste kolommen, met de aanname dat bestaande waarden
Amsterdamse tijd zijn. Daarna kloppen tijden op documenten, in het auditspoor en in meldingen.
Migratie eerst op een kloon draaien en de uitkomst voorleggen voordat productie aan de beurt is.

### B-23 — Wie documenten mag genereren en inzien (BUG-167)
**Besluit (letterlijk van Kees):** "extra vinkje in admin panel of dit ook bekeken/bewerkt mag worden."
Dus: een apart recht voor documenten, per medewerker aan te zetten in het beheerscherm, met
onderscheid tussen **bekijken** en **bewerken/genereren**. Niet meeliften op het voertuigen- of
reserveringenrecht.

### B-24 — Ontvanger van een APK-herinnering (BUG-170)
**Besluit:** alleen de huidige huurder, dat wil zeggen de klant van de lopende of eerstvolgende
reservering op dat voertuig. Staat de auto leeg, dan gaat er alleen een melding naar kantoor. Nooit
meer naar iedereen die ooit op dat kenteken heeft gehuurd.

## Vastgelegd 2026-09-21

Antwoorden op de doorlichting van de baliewerkstroom (`docs/e2e/werkstromen/01-balie.md`,
hoofdstuk 7). De nummers V-1 t/m V-14 verwijzen naar de vragenlijst in dat document.

### B-25 — Twee verbetervoorstellen voor de balie afgewezen (OPT-036, OPT-037)
**Besluit:** allebei niet bouwen.
- OPT-036 wilde telefoonnummer en e-mailadres naast de naam op het eerste tabblad van het
  klantformulier zetten. Het formulier blijft zoals het is, inclusief de tabbladwissel
  halverwege.
- OPT-037 wilde na het opslaan van een reservering een knop die meteen naar die
  reservering gaat. Die komt er niet.
Beide zijn gemeten en beschreven; ze zijn afgewezen, niet over het hoofd gezien. Wie ze
opnieuw wil voorstellen, vraagt eerst een nieuw besluit.
Raakt: OPT-036, OPT-037.

### B-26 — Wie een melding te zien krijgt (V-2)
**Besluit (letterlijk van Kees):** "meldingen moeten weergegeven worden aan de mensen wie de
melding aan gaat en ook betrekking / toegang heeft."
Dus: een melding gaat naar wie hem aangaat én er toegang toe heeft. Niet naar iedereen, en
niet uitsluitend naar wie het recht "meldingen beheren" draagt.
Nog uit te werken en voor te leggen: welke soort melding bij welk recht hoort.
Raakt: V-2, BUG-233 (de rode foutmelding op elk scherm), het meldingenklokje in de kop.

### B-27 — Knoppen die een medewerker niet mag gebruiken (V-3)
**Besluit:** laten staan, maar grijs maken en de functie uitschakelen. Dus niet verbergen:
de medewerker ziet dat de knop bestaat, maar kan hem niet indrukken.
Raakt: V-3, de snelle acties op het dashboard en de knoppen op het voertuigenscherm.

### B-28 — Een scherm openen waar je geen rechten voor hebt (V-4)
**Besluit:** een duidelijke melding "u heeft geen toegang" tonen. Vandaag laadt het lege
scherm gewoon en blijven de gegevens leeg.
Raakt: V-4.

### B-29 — Menu en server gelijktrekken (V-5)
**Besluit:** gelijktrekken. Het recht dat het menu vraagt en het recht dat de server
controleert horen hetzelfde te zijn.
Raakt: V-5, de drie bekende verschillen bij onderhoud, transport en communicatie.

### B-30 — Statusomkeringen: wie ze mag doen (V-6, OPT-017)
**Besluit (letterlijk van Kees):** "manager en admin. met toggel om andere eventueel ook
toegang te geven via de instellingen van de accounts."
Dus: terugdraaien mag door manager en admin; via de accountinstellingen kan het eventueel
ook voor andere accounts worden aangezet.
Gelezen als één nieuw recht per gebruiker, standaard alleen aan bij admin en manager — nog
te bevestigen.
**Aanvulling, letterlijk van Kees:** "ja alles gaat dan terug. als er een km stand is
ingevuld die hoger is dan die daarvoor moet er wel een bevestiging voor ingevuld worden."
Dus: alle drie de omkeringen mogen — een ophaling, een inname en een annulering
terugdraaien. De voertuigstatus en de kilometerstand gaan mee terug. Werd bij de
teruggedraaide stap een hogere kilometerstand ingevuld dan de stand daarvoor, dan moet daar
uitdrukkelijk een bevestiging voor worden ingevuld.
Daarmee is dit besluit compleet: zowel wie het mag als welke omkeringen.
Die laatste zin is gelezen als: terugdraaien verlaagt in dat geval de kilometerstand, en
juist dat verlagen moet bevestigd worden (de applicatie kent daar al een aparte toestemming
voor). Bij het ontwerp nog te bevestigen.
Raakt: OPT-017, V-6, CQ-005, BUG-019, BUG-159.

### B-31 — Pechomruil: wat er met de oorspronkelijke huur gebeurt (V-9, OPT-029)
**Besluit (letterlijk van Kees):** "die blijft op verhuurd staan maar met in werkplaats er
bij. zodat we weten dat de originele auto in de werkplaats is en dit tijdelijk is. mits er
op een later moment wordt besloten dat de auto niet meer terug gaat."
Dus: de oorspronkelijke huur blijft lopen op "verhuurd", met de aanduiding "in werkplaats"
erbij, zodat zichtbaar is dat de eigen auto er tijdelijk uit is.
"Mits" is daarbij gelezen als "tenzij": de huur blijft zo staan tenzij later wordt besloten
dat die auto niet terugkomt.
**Aanvulling, letterlijk van Kees:** "overzetten naar vervangende auto maar dat moet wel
bevestigd worden!"
Dus: wordt later besloten dat de oorspronkelijke auto niet terugkomt, dan gaat de huur over
naar de vervangende auto. Dat gebeurt nooit vanzelf — iemand moet het bevestigen. Daarmee
is de openstaande deelvraag uit de eerste ronde beantwoord.
Raakt: OPT-029, V-9, BUG-114, BUG-115.

### B-32 — Een reservering in het verleden aanmaken (V-10, BUG-040)
**Besluit:** mag. Maar de auto staat dan alleen op "verhuurd" als de huurperiode nog loopt,
niet als die al is afgesloten.
Raakt: BUG-040, V-10 — dit is de reden waarom zo'n reservering nu elke toekomstige boeking
op dat voertuig blokkeert.

### B-33 — Een al opgehaalde verhuring annuleren of verwijderen (V-11, BUG-132)
**Besluit (letterlijk van Kees):** "dat mag door de admin en manager met een extra vinkje bij
de instellingen om het te regelen voor andere accounts, met een waarschuwing dat die al
opgehaald is."
Dus: toegestaan voor admin en manager; via een extra vinkje in de instellingen kan het voor
andere accounts geregeld worden; en er komt een waarschuwing dat de huur al opgehaald is.
Gelezen als hetzelfde soort recht per gebruiker als in B-30 — nog te bevestigen.
**Aanvulling, letterlijk van Kees:** "die moet dan ook gebruikt worden. we moeten ook wel
rekening houden dat we de prullenbak kunnen legen!"
Dus: annuleren én verwijderen mogen allebei. Verwijderen gaat via de bestaande prullenbak
van B-15, die dus ook echt gebruikt wordt. En nieuw: die prullenbak moet geleegd kunnen
worden.
Nog open: wie de prullenbak mag legen, en of dat per soort gaat of in één keer.
Raakt: BUG-132, V-11, B-15, BUG-150 (de prullenbak kan vandaag niet definitief geleegd
worden).

### B-34 — Een contract dat niet gemaakt kan worden (V-12, BUG-163)
**Besluit:** een duidelijke fout. Liever hard mislukken met een begrijpelijke melding dan een
onbruikbaar bestand afleveren.
Raakt: BUG-163, V-12.

### B-35 — Uniciteit van het debiteurnummer (V-13, BUG-045)
**Besluit:** het veld mag leeg blijven, maar is het ingevuld, dan moet het uniek zijn.
Raakt: BUG-045, V-13.

## Nog open (opnieuw vragen voordat er iets aan gebouwd wordt)

- (beslist, zie B-17) OPT-001 — wat telt als "openstaand punt" op het werkdagscherm.
- OPT-009 — mag de app zelf een vervanger voorstellen/toewijzen, en op welke criteria.
- (beslist, zie B-30) OPT-017 — welke statusomkeringen mogen, en door wie.
- (geparkeerd, zie hieronder) OPT-025 — welke velden verplicht zijn voordat een voertuig
  verhuurd mag worden.
- (geparkeerd, zie hieronder) OPT-026 — BV → Opnaam: vooraf vragen of achteraf melden.
- (beslist, zie B-31) OPT-029 — pechomruil: wat gebeurt er met de oorspronkelijke huur.
- OPT-032 — wat de sleutelkastaudit moet vastleggen en afdrukken.

**Geparkeerd op verzoek van Kees (21-09-2026, letterlijk: "moeten genegeerd worden voor
nu").** Hier niet opnieuw naar vragen totdat hij er zelf over begint of het werk erom
vraagt: OPT-035 (onthoud agenda- of lijstweergave), OPT-038 (zeggen welk sjabloon
ontbreekt), V-1 (kloppen de zeven rechtenprofielen met productie), OPT-025 / V-7 (welke
velden verplicht voor verhuur en contract), OPT-026 / V-8 (BV → Opnaam) en V-14 / BUG-056
(terugkerende reservering).

Deelvragen die bij het uitwerken van de besluiten van 21-09 nog voorgelegd moeten worden:

- Bij B-26: welke soort melding bij welk recht hoort.
- Bij B-30: of de zin over de kilometerstand goed gelezen is — dat het verlagen van een
  eerder ingevulde stand degene is die bevestigd moet worden. Bij het ontwerp bevestigen.
- Bij B-33: wie de prullenbak mag legen, en of dat per soort gaat of in één keer.
- Bij B-30 en B-33: of "toggle"/"vinkje bij de instellingen van de accounts" inderdaad één
  nieuw recht per gebruiker is, standaard alleen aan bij admin en manager.
