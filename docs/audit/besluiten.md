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
**Bevestigd door Kees op 21-09-2026 ("ja"):** het gaat om het **verlagen** van de
kilometerstand. Stond er vóór de ophaling 45.000 en is bij het ophalen 45.350 ingevuld, dan
zakt de stand door het terugdraaien terug naar 45.000, en juist dat zakken moet uitdrukkelijk
bevestigd worden — aansluitend op de toestemming die de applicatie al vraagt voor het
verlagen van een kilometerstand.
Raakt: OPT-017, V-6, CQ-005, BUG-019, BUG-159.
**Uitgevoerd (10-10-2026):** commits `4e5f2496..b1864f49` (deelproject C). Rechten en eenmalige
toekenning aan managers: `c4eebe3f`. Stand van vóór ophalen en innemen bewaard: `16e8a22b`. Server
(voorvertoning, bevestiging, `planHash`): `81c4756d`, `1468d563`, fix-ronde `a4708c89`. Eén venster
**Overdracht terugdraaien** voor alle openers: `2b8949b5`; Layer B: `dc36c630`. Nabeoordeling:
`64ce0455`, `03cc53ec`, `6f93289a`. Alle drie de omkeringen (ophaling, inname, annulering) lopen via
`POST /api/reservations/:id/revert`; `PATCH /:id/status` weigert ze met `USE_REVERT_ROUTE`. De kilometerbevestiging
is een vinkje in het venster, niet het wachtwoord van `authorize_mileage_decrease`. Handleiding §5.14,
§15.16, §10.2, §11.12–11.14.

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
**Aanvulling (23-09-2026):** een reservering die een maand in het verleden ligt en nooit is
opgehaald, moet een melding geven. Lezing: status "geboekt", startdatum 30 dagen of langer
geleden, geen onderhoudsblok. Vorm (23-09-2026, tweede aanwijzing): een popup-dialoog in de
reserveringskalender, niet in het meldingencentrum of op het dashboard; per regel openen en
annuleren; weg zodra de reservering is opgehaald of geannuleerd.
**Uitgevoerd (24-09-2026):** commits `ec09f625..e47004e5`. Boekingsgate: `2ac1c6c4`
(alleen opgehaalde verhuringen tellen), `ae629bb0` (matcht letterlijk status `picked_up`, geen
legacy-spellingen meer). Popup: `1a5a8cf6` (server + venster + kalenderknop), `29b42499`
(laag-b-staart `e2e/layer-b-tail/reservations/past-reservation.spec.ts`). Handleiding
§5.3/§5.11/§5.12.

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
**Uitgevoerd (10-10-2026):** commits `4e5f2496..b1864f49` (deelproject C). Server en client:
`72673e55` (recht `cancel_picked_up_rental`, 409 `PICKED_UP_CONFIRMATION_REQUIRED` en 403 zonder het recht,
waarschuwing met vinkje in elk annuleer- en verwijdervenster); bijkomende fix `c0b5f99e`; Layer B:
`616b595e`; fix-rondes `e0ed1660`, `1b3c42f8`. Twee uitwerkingen die de brief niet noemde, vastgelegd in
`6ccbc385`: ook `PATCH /api/reservations/:id/basic` bewaakt, en onderhoudsblokken zijn uitgezonderd.
Verwijderen gaat via de prullenbak van Reserveringen. Handleiding §5.15, §5.10.

### B-34 — Een contract dat niet gemaakt kan worden (V-12, BUG-163)
**Besluit:** een duidelijke fout. Liever hard mislukken met een begrijpelijke melding dan een
onbruikbaar bestand afleveren.
Raakt: BUG-163, V-12.
**Uitgevoerd (24-09-2026):** commits `ec09f625..e47004e5`. Server: `8300ccef` (falende test),
`3f7072fb` (stabiele foutcode per mislukking, archief weigert bytes zonder `%PDF-`-kop),
`e04de4ae` (fix-ronde 1: één helper voor de foutcode, `/api/contracts/preview` volgt dezelfde
sjabloonkeuze). Client + e2e: `284daad7` (Nederlandse tekst per code in het ophaalvenster),
`e1d82971` (echt sjabloon in de e2e-seed, staarttest voor een leeg standaardsjabloon). Handleiding
§8.4/§8.5.

### B-35 — Uniciteit van het debiteurnummer (V-13, BUG-045)
**Besluit:** het veld mag leeg blijven, maar is het ingevuld, dan moet het uniek zijn.
Raakt: BUG-045, V-13.
**Aanvulling (23-09-2026):** een debiteurnummer van een klant in de prullenbak blijft bezet
totdat die klant definitief uit de prullenbak is verwijderd; wie het nummer intussen wil
gebruiken, krijgt een melding dat het bij een klant in de prullenbak hoort. (Definitief
verwijderen komt met B-38, deelproject C.)
**Uitgevoerd (24-09-2026):** commits `ec09f625..e47004e5`. Server: `ce9e0a75` (falende test),
`fa296d1e` (unieke index, ook tegen de prullenbak), `7aca247e` (fix-ronde 1: conflictcheck
ontdubbeld, herstel normaliseert het nummer). Client + e2e: `aa26340a` (veldfout onder
Debiteurnummer, ook in het snel-toevoegen-formulier), `4fb794a5` (balie-werkstroom bewijst het
end-to-end). Handleiding §3.9.

### B-36 — Aparte prullenbakken per soort (aanvulling op B-15 en B-33)
**Besluit (22-09-2026, letterlijk):** "het moeten wel aparte prullenbakken zijn dat houd het
een stuk overzichtelijker, dus er komt een prullenbak op alle paginas die ook de prullenbak
gebruiken op de voertuigenpagina."
Vandaag is er één gedeeld venster onder Voertuigen (knop "Verwijderde voertuigen") met alle
soorten door elkaar; een verwijderd onderhoudsblok staat daar met het label "Reservering".
Uitwerking: elk scherm krijgt zijn eigen prullenbak met alleen zijn eigen soort — Voertuigen,
Klanten, Reserveringen, Onderhoud (eigen label), Transporten, Boetes (heeft al een gefilterd
venster). Wordt gebouwd in deelproject C, samen met het legen (B-33).
Raakt: B-15, B-33, BUG-140, BUG-151.
**Uitgevoerd (10-10-2026):** commits `4e5f2496..b1864f49` (deelproject C). Zes prullenbakken, elk met zijn
eigen knop en soort (`DELETED_RECORD_KINDS`, `GET /api/deleted-records?type=`): `fd7cd3f4`; onderhoud
als eigen soort `maintenance_block`, met een startstap die oude regels verhuist. Layer B: `7b6520e7`.
Het verzoekbudget van de browsertests is opgelost met tweelingaccounts in de seed, niet met een
schakelaar in de server: `993f1a45`. Weigering bij het terugzetten noemt weer de klant: `fa627124`.
Handleiding §10.6 en de schermhoofdstukken 2, 3, 4, 5, 6, 7.

### B-29a — Aanvulling op B-29: Communicatie voor wie meldingen mag beheren (22-09-2026)
**Wat Kees zei, letterlijk:** op de vraag of er een account bestaat met "meldingen beheren"
zonder "e-mailsjablonen beheren": "ja sjablonen zijn alleen toegankelijk voor de admin en
manager."
**Uitwerking:** het scherm Communicatie opent voor wie "meldingen beheren" óf
"e-mailsjablonen beheren" heeft. Sjabloonbeheer (aanmaken, bewerken, verwijderen, het
e-maillogboek) alleen met "e-mailsjablonen beheren"; voor anderen grijs of "geen toegang tot
deze gegevens". Versturen alleen met "meldingen beheren". Zo verliest geen bestaand account
het versturen van meldingen, en blijven sjablonen bij admin en manager.
Raakt: B-29, B-27, V-5.

### B-37 — Onderhoud afronden met APK en kilometerstand (22-09-2026)
**Besluit (letterlijk):** "nee deze mag ingevuld worden want dat is nodig om het onderhoud af
te sluiten."
**Uitwerking:** wie onderhoud mag afronden, kan daarbij de APK-datum, het APK-document en de
kilometerstand invullen, ook zonder "voertuigen beheren" of "documenten beheren". Vandaag
doet het scherm drie losse aanroepen met drie verschillende rechten, zodat een account met
alleen "onderhoud beheren" halverwege vastloopt. De afrondroute neemt die gegevens zelf mee,
in één handeling. Wordt gebouwd in deelproject C.
Raakt: B-27, B-29, handleiding §15.11.
**Uitgevoerd (10-10-2026):** commits `4e5f2496..b1864f49` (deelproject C). Server (één transactie: blok,
APK-datum, kilometerstand, APK-document; een lagere stand geeft `MILEAGE_LOWER_THAN_CURRENT` en wijzigt
niets): `87898c7e`. Client (één verzoek, één foutpad): `c985b03a`. Layer B als profiel `maintenance`:
`9cfc40c8`. Mee opgelost, uit de fysieke E2E-audit (module 7): het bewerkvenster toont de opgeslagen
status (`c4b9ea3a`) en **Uit** geeft de auto weer vrij (`b35d135f`); een mislukte wijziging van het
vervangende voertuig wordt in het Nederlands uitgelegd (`f8186f31`). De handleiding zei ten onrechte dat
het afronden de werkplaatsstatus niet omzet; dat is gecorrigeerd. Handleiding §7.6, §7.7, §15.11.

### B-38 — Prullenbak legen, en wie de prullenbakken ziet (22-09-2026)
**Besluit (letterlijk):** "per stuk en de mogelijkheid om meerdere tegelijk/ alles te
verwijderen. mag alleen door admin / manager." En over deelproject C: "c moet ook zichtbaar
zijn voor manager."
**Uitwerking:** in elke prullenbak (B-36) kan een beheerder of manager één record definitief
verwijderen, een selectie tegelijk, of alles, telkens met een bevestiging. De prullenbakken
zelf zijn zichtbaar voor admin en manager (vandaag alleen admin). Volgorde van bouwen: eerst
deelproject B, direct daarna C.
**Uitgevoerd (10-10-2026):** commits `4e5f2496..b1864f49` (deelproject C). Rechten `manage_recycle_bin`
(`c4eebe3f`). Legen per regel, per selectie en alles van een soort, met bevestiging, auditregel per record
en bestanden alleen weg als geen levend record ze nog gebruikt: `92feb772`; Layer B: `a2fd9b38`.
Een reservering of onderhoudsplanning met fiscale beoordelingen wordt overgeslagen en blijft in de
prullenbak staan (409 `FISCAL_DATA_PRESENT`); overige documenten van het voertuig, zoals een APK-bewijs,
worden losgekoppeld en blijven bestaan: `586d6f75`, `98d7db8f`, `a118fba8`, `8e433703`. Handleiding §10.6.

### B-39 — Uitwerking deelproject C goedgekeurd (09-10-2026)
**Besluit (letterlijk):** "ja" op het ontwerp van deelproject C en op de drie voorstellen daarin:
1. Drie nieuwe rechten ("Overdracht terugdraaien", "Opgehaalde huur annuleren of verwijderen",
   "Prullenbak beheren"); elk account met rol manager krijgt ze één keer automatisch bij de eerste
   start na de deploy, daarna per account instelbaar. Wie alleen "reserveringen beheren" heeft,
   kan daarna niet meer terugdraaien of een opgehaalde huur annuleren zonder het vinkje.
2. Een annulering terugdraaien gaat naar "opgehaald" als de auto al was opgehaald, anders naar
   "geboekt", mits de auto in die periode nog vrij is; gesloten vervangers en transporten komen
   niet vanzelf terug.
3. Prullenbak legen verwijdert ook de bijbehorende bestanden, alleen als geen ander levend
   record ze nog gebruikt.
Verder: kilometerstand van de auto gaat bij terugdraaien terug naar de stand van vóór de
overdracht (vanaf nu bewaard bij elk ophalen en innemen; oude huren zonder die stand laten de
teller staan), met een apart vinkje als de stand daardoor omlaag gaat; onderhoud afronden in één
handeling binnen één transactie.
Raakt: B-30, B-33, B-36, B-37, B-38.
Raakt: B-15, B-33, B-36, BUG-150.
**Uitgevoerd (10-10-2026):** commits `4e5f2496..b1864f49` (deelproject C; het besluit zelf: `49292a43`).
De drie rechten en de eenmalige toekenning aan elke manager (marker `migration:c_manager_rights`): `c4eebe3f`.
Een annulering terugdraaien gaat naar opgehaald of geboekt, alleen als de auto vrij is (`81c4756d`); het
legen van de prullenbak haalt ook de bestanden weg (`92feb772`). Een manager die ná de uitrol wordt
aangemaakt, krijgt de rechten niet vanzelf. In hetzelfde bereik, uit de fysieke E2E-audit: een leeg
wachtwoord bij het bijwerken van een gebruiker verandert niets meer (`6c30516e`, `422c43eb`, `8dc7c80f`) en het
e-maillogboek toont de echte verzendgeschiedenis (`c3f13460`). Handleiding §15.16.

### B-40 — Auditreparaties (10-10-2026)
**Opdracht (letterlijk van Kees):** "push en pas daarna alle dingen aan die aan het licht zijn gekomen
tijdens de audit, ook die voor elke module zijn geconstateerd". Deelproject C stond op main (gepusht
op 10-10-2026); alle 123 bevindingen van `docs/audit/fysieke-e2e-audit-2026-10-09.md` zijn daarna
gesorteerd (gerepareerd, bug, UX, besluit, omgeving) en per module afgewerkt op de branch
`fix/audit-remediation`. Werkwijze en grootboek: `.superpowers/sdd/2026-10-10-audit-reparaties/`.
**Uitgevoerd (10-10-2026), op branch `fix/audit-remediation`, nog niet op main:** commits
`42908eb0..18e8acda` (100 commits, onder andere `a7496057`, `826d52dc`, `340ce451`, `9ef74b38`, `be9f9e6d`,
`0bf28aba`, `dbfa6b4a`, `49a3407a`, `a38fbb41`, `fa36fcb2`, `7288c4a1`, `608bcbe8`, `e887b42a`). Elke module is
herzien, de slotronde (client, e2e en server) is af en de beoordeling van de hele branch (11-10-2026) gaf
READY. Handleiding bijgewerkt (10/11-10-2026), de PDF is nog niet opnieuw gemaakt.
**Resultaat per module (één regel):**
- Kosten: één kleine-letterlijst van categorieën met Tol en Parkeren, tankbedrag met komma, één kostenvenster, één lijst met filters en CSV, knop Logboek in Ontvangen facturen.
- Boetes: administratiekosten blijven bewaard en het totaal staat erbij, annuleren vraagt eerst, elke handeling meldt zichzelf, € / datum / kenteken overal gelijk, lege bedrijfsnaam geeft niet langer een lege klantnaam.
- Communicatie: eerlijke verzendmelding (verstuurd, deels, niets), persoonlijke voorvertoning, logboek in het Nederlands met detailvenster, placeholders met één of twee accolades, extra vinkje bij 25 mails of meer.
- Onderhoud: geannuleerde of afgeronde huur is geen conflict meer, doorzoekbare klantkeuze, status alleen bij bewerken, Afronden en Binnen melden in het overzicht, Nederlandse omschrijving.
- Reserveringen, overdracht en scan: lijst per pagina met eigen adres, zoeken en bevestigen bij niet opgehaald, APK-waarschuwing, eerlijke ophaalmelding, brandstof bij inleveren begint op het ophaalniveau, geschiedenis in woorden, scankaart zegt Geboekt, één venster tegelijk.
- Voertuigen en klanten: RDW-type Van vanaf acht zitplaatsen, sorteren los van tonen, naar een pagina springen, sleutelkastlijsten, B.V. en DHL blijven staan, debiteurnummer alleen als veldmelding, Nederlandse voorbeelden en meervouden.
- Rapporten: onderhoudsanalyse telt alleen onderhoud, banden en remmen, vaste noemers, werkende filters, CSV en afdrukken in de rapportbouwer, bevestiging bij verwijderen.
- Portaalbeheer en fiscaal: portaalmail meldt de echte uitkomst, namen en acties in woorden, fiscale schermen leggen uit wat er speelt, RDW-fouten per code.
- Beheer en rechten: gebruikersmeldingen, beheerders niet verwijderbaar uit het venster, back-upmeldingen zonder serverpad en gestreamde downloads, prullenbak verbergt teruggezet, instellingentabs houden invoer, eigen menu-item Bekeuringen.
- Dashboard, inloggen en transport: één inlogmelding voor een onbekende gebruiker en een fout wachtwoord, bevestiging bij RDW-scan en transport afronden, benoemde icoonknoppen, lichter dashboard.
- Teksten en vorm (alle schermen): foutzinnen in het Nederlands op code, Nederlandse validatie, één datum- en bedragnotatie, CSV met puntkomma en decimale komma, vraag bij niet-opgeslagen wijzigingen, uitleg bij een tik op een grijze knop, laadindicator.
- Documenten en schadechecks: leeg standaardsjabloon geweigerd, editors vragen voor het weggooien, bibliotheek doorzoekbaar, upload in één venster, Nederlandse documentnamen, te plat diagram geweigerd, knop Alles goed.
- Server (laatste ronde): geen uitzonderingstekst meer naar de client, fiscale CSV tegen formules, één kentekenformatter, FISCAL_VALIDATION met veld en reden.
**Besluiten van de uitvoerder die Kees moet kennen:**
- **A-10-7 (gat in contractnummers):** niet gewijzigd. Een geannuleerde opgehaalde huur houdt zijn nummer (B-33), dus 1012 gevolgd door 1013 kan voorkomen; dit is bedoeld. Een test legt het vast.
- **"Pech":** het type `breakdown` heet in de hele app al "Pech", dus een oude omschrijving leest nu "Pech: lekke band". Wil Kees "Storing", dan is het één woord in de vertaling.
- **"Binnen melden" vraagt "Voertuigen beheren":** de knop volgt de route die de auto in onderhoud zet. "Afronden" vraagt "Onderhoud beheren" of "Reserveringen beheren".
- **Kosten:** de uitklapbare lijst per categorie is vervangen door één lijst met filter; de snelknoppen "kosten toevoegen" per categorie zijn weg; een kostenpost met een eigen, oude categorienaam wordt bij bewerken "Overig".
- **Reserveringsvensters:** De reserveringsvensters vragen nu ook bij Escape, het kruisje en Annuleren of je wijzigingen wilt verwerpen (voorheen sloten die stil; alleen een klik buiten het venster gaf een melding). Consistent met A-3-10/A-4-8; Kees kan het terugdraaien.
- **Hoofdletters:** B.V. en DHL blijven staan. Daardoor wordt een naam die helemaal in hoofdletters is getypt niet meer omgezet.
- **Eenmalige gegevensopschoning bij de eerste start na de uitrol:** kostencategorieën naar kleine letters (markering `p1_expense_category_lowercase`) en lege bedrijfsnamen naar leeg (`p2_empty_company_name_null`). Controleer vooraf op productie: SELECT lower(btrim(category)), count(*) FROM expenses GROUP BY 1.
- **Back-uplocatie:** het scherm toont het pad niet meer, alleen dat het vast is ingesteld.
- **Kosten per km** staat alleen nog bij "Alle tijd" (de kilometerstand is een levensduurtotaal).
**Nog open (aan Kees):**
1. **D1 (A-3-1, A-9-3)** Moet een tankbedrag dat bij "Brandstofstatus bijwerken" wordt ingevuld automatisch als kostenpost (categorie Brandstof) geboekt worden? Advies: ja, één kostenpost per tankbeurt op dat voertuig; het veld op het voertuig blijft alleen als "laatste tankbedrag".
2. **D2 (A-3-3)** Bulkimport: een kenteken dat de RDW niet kent, toch als voertuig aanmaken? Advies: nee bij "niet gevonden" (wel bij een RDW-storing, met waarschuwing), tenzij je het vinkje "ook onbekende kentekens aanmaken" aanzet; zulke regels tellen als waarschuwing, niet als geslaagd.
3. **D3 (A-5-1)** Mag de status van een reservering nog met de hand in het formulier gekozen worden? Advies: nee; nieuw is altijd Geboekt, en de status verandert alleen via Ophalen, Inleveren, Annuleren en Terugdraaien.
4. **D4 (A-7-7)** Wat doet "Annuleren" in het scherm "Vervangende voertuigen toewijzen"? Advies: het hele plannen ongedaan maken (het al aangemaakte onderhoud weer weghalen); wie zonder vervanger wil plannen kiest "Later vervanger toewijzen".
5. **D5 (A-7-10)** Moet een onderhoud dat nog op "Gepland" staat maar vandaag loopt de auto al op "Reparatie nodig" zetten? Advies: nee, pas als de auto "Binnen" is; de geplande periode blokkeert wel nieuwe reserveringen.
6. **D6 (A-7-10)** Als een onderhoud wordt verwijderd of geannuleerd, moet "Reparatie nodig" dan vervallen? Advies: ja, als die stand alleen door dat onderhoud kwam (geen ander open onderhoud, geen handmatige schademelding).
7. **D7 (A-7-11)** De keuze "Uit (onderhoud voltooid)" in het bewerkscherm vervangen door een knop "Afronden" (APK, km-stand, document, vervanger inleveren in één keer)? Advies: ja.
8. **D8 (A-4-3, A-9-6)** Moeten chauffeurs en kostenposten bij verwijderen ook naar de prullenbak (zoals voertuigen, klanten, reserveringen, transporten en bekeuringen)? Advies: ja voor allebei.
9. **D9 (A-12-3)** Bekeuringen: eerder is besloten dat doorbelasten en betalen in de boekhouding gebeuren (de app registreert alleen). Blijft dat zo? Advies: ja; dan halen we "Doorbelast", "Betaald" en "Betwist" uit de filters en keuzes (alleen nog zichtbaar bij oude bekeuringen) en belooft het portaal die statussen niet meer.
10. **D10 (A-12-9)** Mag het koppelen of aanmaken van een bekeuring de klant meteen mailen? Advies: nee; na het koppelen een knop "Klant informeren" (of vinkje, standaard uit), zodat je eerst controleert; de mail komt in het e-maillogboek.
11. **D11 (A-12-4, A-15-6)** De tijdzone-omzetting van de database (besluit B-22) nu uitvoeren? Advies: ja, eerst het rapport op een kopie van productie, per kolom bepalen of de waarde Nederlandse tijd of UTC was, dan in een onderhoudsvenster na een verse back-up.
12. **D12 (A-1-5)** Minimale wachtwoordlengte voor medewerkers? Advies: 10 tekens voor nieuwe wachtwoorden, overal gelijk (nu profielformulier 8 tekens met hoofd- en kleine letter en een cijfer, gelijk aan de server; gebruikersbeheer bij aanmaken geen minimum); bestaande wachtwoorden blijven werken.
13. **D13 (A-R-2, A-R-4)** Rechten die alleen niets kunnen (Meldingen beheren zonder Klanten/Voertuigen bekijken, Rapporten bekijken zonder Voertuigen/Reserveringen bekijken): hoe oplossen? Advies: in Gebruikersbeheer bij elk recht tonen welke leesrechten het scherm nodig heeft, met een knop "benodigde rechten ook aanzetten"; geen stille automatische koppeling.
14. **D14 (A-R-5)** Een knop "Recht aanvragen" op het scherm "geen toegang", die beheerders een melding stuurt? Advies: ja, een eenvoudige melding in het meldingencentrum van wie Gebruikers beheren heeft.
15. **D15 (A-13)** De sjabloonbouwer biedt velden aan die de app bij het versturen nergens invult (bedrijfsnaam, onderhoudsdatum, e-mailadres en telefoonnummer van de klant, begin- en einddatum van de reservering). Invullen (en uit welke gegevens), of uit de bouwer halen? De voorvertoning waarschuwt er nu voor.
16. **D16 (A-11-5)** Moet een gewone scan op het scanscherm de ene mogelijke overdracht direct starten, zoals de tegel op het Dashboard? Nu toont /scan eerst het kaartje, omdat daar ook alleen opgezocht wordt; direct starten zou bij zo'n scan een ophaling kunnen starten.
17. **D17 (A-3-5)** De RDW-typehermapping toepassen op 32 van de 98 auto's in de testdatabase (31 SUV naar Van, 1 Stationwagen naar Van)? Het script `scripts/remap-vehicle-types.ts` doet alleen een dry-run en schrijft niets; op productie is niets aangeraakt.
18. **D18 (A-14-4)** Het categoriefilter van Rapporten ook toepassen op het tabblad Financieel? Nu staat daar een regel dat het niet geldt, omdat een marge over maar een deel van de kosten niets zegt.
19. **D19 (A-17-8)** Een beheerder ook via de API niet verwijderbaar maken, zoals nu in het venster? De server weigert nu alleen dat je jezelf verwijdert.
20. **Fiscale prullenbak (uit deelproject C):** een reservering met fiscale beoordelingen kan niet definitief uit de prullenbak verwijderd worden, alleen teruggezet. Zo houden, of de fiscale regels loskoppelen en definitief verwijderen toestaan?

### B-41 — Antwoorden op de open vragen van B-40 (11-10-2026)

Kees beantwoordde alle vragen een voor een. Besluiten (te bouwen in een volgend deelproject, nog niet gebouwd):

- **D1 ja:** een tankbedrag bij "Brandstofstatus bijwerken" wordt ook een kostenpost (categorie Brandstof) op dat voertuig; "laatste tankbedrag" op het voertuig blijft.
- **D2 ja, met vinkje:** een kenteken dat de RDW niet kent wordt bij de bulkimport niet aangemaakt (bij een RDW-storing wel, met waarschuwing), tenzij het vinkje "ook onbekende kentekens aanmaken" aanstaat; zulke regels tellen als waarschuwing, niet als geslaagd.
- **D3 nee:** het statusveld verdwijnt uit het reserveringsformulier; nieuw is altijd Geboekt; de status verandert alleen via Ophalen, Inleveren, Annuleren en Terugdraaien.
- **D4:** "Annuleren" in "Vervangende voertuigen toewijzen" maakt het hele plannen ongedaan (het aangemaakte onderhoud wordt weer weggehaald); zonder vervanger plannen gaat via "Later vervanger toewijzen".
- **D5 nee:** een gepland onderhoud dat vandaag loopt zet de auto pas op "Reparatie nodig" als de auto "Binnen" is gemeld; de geplande periode blokkeert wel nieuwe reserveringen.
- **D6 ja:** bij verwijderen of annuleren van een onderhoud vervalt "Reparatie nodig" als die stand alleen door dat onderhoud kwam (geen ander open onderhoud, geen handmatige schademelding).
- **D7 ja:** "Uit (onderhoud voltooid)" in het bewerkscherm wordt vervangen door de knop "Afronden".
- **D8 ja:** chauffeurs en kostenposten krijgen elk een prullenbak.
- **D9 ja:** de app registreert bekeuringen alleen; Doorbelast, Betaald en Betwist gaan uit de filters en keuzes (alleen nog zichtbaar bij oude bekeuringen die ze al hebben) en het klantenportaal belooft ze niet meer.
- **D10 nee:** koppelen of aanmaken van een bekeuring mailt de klant niet meer vanzelf; daarna een knop "Klant informeren" (of vinkje, standaard uit); de mail komt in het e-maillogboek.
- **D11 ja, in stappen:** eerst het rapport op een kopie van productie, per kolom bepalen of de waarde Nederlandse tijd of UTC was, dan in een onderhoudsvenster na een verse back-up. **Aanvulling van Kees:** een tijdzone-instelling in App-instellingen, die rekening houdt met zomer- en wintertijd en standaard op Nederlandse tijd staat; de app gebruikt die overal waar nu Nederlandse tijd vast staat.
- **D12:** nieuwe wachtwoorden minimaal 10 tekens met hoofdletter, kleine letter en cijfer, overal gelijk (server, profiel, gebruikersbeheer bij aanmaken en wijzigen); bestaande wachtwoorden blijven werken.
- **D13:** Gebruikersbeheer toont bij elk recht welke leesrechten het scherm nodig heeft, met een knop "benodigde rechten ook aanzetten"; geen stille automatische koppeling.
- **D14 nee, maar:** geen knop "Recht aanvragen". Wel: geweigerde pogingen worden vastgelegd en een beheerder krijgt bij het inloggen een melding wie wat probeerde dat niet mocht, sinds de vorige keer.
- **D15:** plekhouders invullen waar de gegevens er zijn (bedrijfsnaam uit de instellingen; e-mail, telefoon, begin- en einddatum uit de reservering); de onderhoudsdatum alleen aanbieden in onderhoudssjablonen.
- **D16 nee:** /scan blijft een opzoekscherm met kaartje; geen automatische overdracht.
- **D17 ja:** na de uitrol eerst de proefdraai van de RDW-typehermapping op productie, de lijst aan Kees, dan toepassen.
- **D18 nee:** het tabblad Financieel krijgt geen categoriefilter.
- **D19 ja:** de server weigert het verwijderen van het laatste beheerdersaccount en van je eigen account; andere beheerders mag een beheerder wel verwijderen; het venster volgt dezelfde regel.
- **Fiscale prullenbak: nee (afwijkend van het advies):** wordt een reservering definitief verwijderd, dan gaan haar fiscale beoordelingen mee. De bevestiging zegt dat uitdrukkelijk en het logboek legt vast wat er weg is. Kanttekening van de uitvoerder: fiscale gegevens vallen onder de bewaarplicht; dit is Kees' keuze.
- **"Pech" blijft** (geen "Storing").
- **D20 niets doen:** geen schakelaar voor de planners in de testserver; regel: geen browsertests draaien tussen 02:00 en 04:00.

### B-42 — Ontwerp deelproject D goedgekeurd (11-10-2026)

Kees keurde het ontwerp docs/superpowers/specs/2026-10-11-besluiten-d-design.md goed ("oke"), met de elf voorstellen: (1) D1 de kostenpost ontstaat bij de brandstofupdate zonder extra recht, de tankbon wordt de bon van de kostenpost, het laatste tankbedrag wordt zichtbaar; (2) D2 het vinkje geldt voor kentekens en CSV; (3) D3 knop "Nu ophalen" na het opslaan, de ingeleverd-velden verdwijnen uit het formulier; (4) D4 plannen afbreken verwijdert een net aangemaakt onderhoud zonder vervanger echt (binnen een uur), anders prullenbak; (5) D5 de auto krijgt de stand "Gepland", boeken blijft een waarschuwing (B-09), ophalen op zo'n auto waarschuwt; (6) D7 de scanknop "Terug uit onderhoud" opent het Afronden-venster als er een onderhoud loopt; (7) D12 eigen wachtwoord alleen via "Wachtwoord wijzigen" met het huidige wachtwoord, beheerder mag resetten; (8) D14 "beheerder" = rol beheerder, melding als balk op het dashboard met lijst; (9) D15 één instelling Bedrijfsnaam voor alle mails; (10) D17 RDW-typecontrole en toepassen in de app (Instellingen), niet via Coolify; (11) fiscale verwijdering ook bij het definitief verwijderen van een klant. Technische noodzaak: 20 koppelingen naar gebruikers krijgen "bij verwijderen leegmaken", anders werkt een beheerder verwijderen niet.

### B-43 — Deelproject D uitgevoerd (12-10-2026)

Alles hieronder is gebouwd, getest en beoordeeld op de branch `feat/besluiten-d` (basis `main` = a47d98b9). Het staat **nog niet op main, is niet gepusht en niet uitgerold**; pas na Kees' woord gaat het naar main. Ontwerp: docs/superpowers/specs/2026-10-11-besluiten-d-design.md (B-42). De handleiding (hoofdstuk 2, 3, 4, 5, 7, 9 t/m 16 en 18) is bijgewerkt.

Per besluit wat er is gebouwd:

- **D1:** een tankbedrag bij "Brandstofstatus bijwerken" boekt in dezelfde handeling een kostenpost (categorie Brandstof, omschrijving "Tankbeurt <niveau> <datum>"); de tankbon is de bon van de kostenpost; een dubbele verzending binnen twee minuten boekt één keer; ongeldig bedrag geeft FUEL_COST_INVALID, een mislukte kostenpost zet niets op en geeft FUEL_EXPENSE_FAILED; "Laatste tankbedrag" staat op de voertuigkaart. Geen extra recht nodig (Voertuigen beheren volstaat). Op branch feat/besluiten-d, nog niet op main.
- **D2:** de bulkimport (kentekens én CSV) maakt een kenteken dat de RDW niet kent alleen aan met het vinkje "Ook onbekende kentekens aanmaken"; drie uitkomsten (geïmporteerd, met waarschuwing, mislukt); een RDW-storing blijft aanmaken, als waarschuwing. Op branch feat/besluiten-d, nog niet op main.
- **D3:** het statusveld en de ingeleverd-velden zijn uit het reserveringsformulier, een nieuwe reservering is altijd Geboekt, een gewone wijziging van de status geeft USE_STATUS_ROUTE, Annuleren in het bewerkformulier opent het annuleervenster, na het opslaan staat er "Nu ophalen" (ook vanuit klant-, voertuig- en scanlijst en het dashboard; twaalf seconden linksonder), het contractnummer staat niet meer in het formulier. Op branch feat/besluiten-d, nog niet op main.
- **D4:** "Annuleren" in "Vervangende voertuigen toewijzen" vraagt "Plannen afbreken?" en haalt een net aangemaakt onderhoud echt weg (zelf aangemaakt, minder dan een uur, nog gepland, geen vervanger); anders valt de app terug op gewoon verwijderen naar de prullenbak. Op branch feat/besluiten-d, nog niet op main.
- **D5:** een gepland onderhoud zet de auto op "Gepland"; pas "Binnen" geeft "Reparatie nodig"; boeken blijft een waarschuwing (B-09) en ophalen op zo'n auto toont een waarschuwing. Op branch feat/besluiten-d, nog niet op main.
- **D6:** het voertuig onthoudt welk onderhoud "Reparatie nodig" zette (nieuwe kolom `vehicles.maintenance_status_block_id`); verwijderen, annuleren of plannen afbreken van dat onderhoud geeft de auto vrij als er geen ander onderhoud op Binnen staat. Op branch feat/besluiten-d, nog niet op main.
- **D7:** "Uit" is uit het bewerkscherm; er is een knop "Afronden" (overal hetzelfde woord, ook in plaats van "Voltooien"); een status Uit/Voltooid via een gewone wijziging geeft USE_COMPLETE_ROUTE, een tweede afronding ALREADY_COMPLETED; "Terug uit onderhoud" op het scanscherm opent Afronden als er een onderhoud op Binnen loopt; een teruggedraaid blok blijft bruikbaar. Op branch feat/besluiten-d, nog niet op main.
- **D8:** chauffeurs en kostenposten gaan naar een prullenbak (knoppen "Verwijderde chauffeurs" bij de klant en "Verwijderde kostenposten" op Kosten), terugzetten kan, definitief verwijderen ook. Op branch feat/besluiten-d, nog niet op main.
- **D9:** bekeuringen worden alleen geregistreerd; Doorbelast, Betaald en Betwist staan niet meer in filters en keuzes (alleen nog bij oude bekeuringen die ze hebben; een nieuwe overgang geeft STATUS_NOT_SUPPORTED); het portaal belooft ze niet meer. Op branch feat/besluiten-d, nog niet op main.
- **D10:** koppelen, aanmaken, inlezen en importeren van een bekeuring mailt de klant niet meer; de knop "Klant informeren" (daarna "Opnieuw informeren") stuurt mail en portaalmelding, legt "Klant geïnformeerd op" vast en komt in het e-maillogboek onder "Bekeuring". Op branch feat/besluiten-d, nog niet op main.
- **D11:** de tijdzone van het kantoor is een instelling in App-instellingen (standaard Europe/Amsterdam) en wordt gebruikt door "vandaag", de nachtelijke taken, documenten en exports. **De omzetting van de database (B-22) is bewust niet uitgevoerd**; de lijst per kolom en de stappen staan in docs/superpowers/specs/2026-10-11-timestamptz-kolommen.md. Op branch feat/besluiten-d, nog niet op main.
- **D12:** één wachtwoordregel voor medewerkers (10 tekens, hoofdletter, kleine letter, cijfer) in server, profiel en gebruikersbeheer; het eigen wachtwoord zet je alleen via "Wachtwoord wijzigen" (USE_CHANGE_PASSWORD), een beheerder mag een ander resetten; bestaande wachtwoorden blijven werken. Op branch feat/besluiten-d, nog niet op main.
- **D13:** Gebruikersbeheer toont bij elk recht "Heeft nodig: …", heeft de knop "Benodigde rechten ook aanzetten" en markeert Gebruikers, Instellingen en Back-ups beheren als "alleen voor beheerders"; geen stille koppeling, geen serverwijziging. Op branch feat/besluiten-d, nog niet op main.
- **D14:** geweigerde pogingen komen in het activiteitenlog (access.denied, dedupe per route en vijf minuten, plafond 50 per medewerker per kwartier); de rol Beheerder ziet bij het inloggen een balk op het dashboard met "Bekijken". Op branch feat/besluiten-d, nog niet op main.
- **D15:** de instelling Bedrijfsnaam (standaard "Autolease Lam") vervangt de vaste namen in de mails; de sjabloon-plekhouders worden ingevuld (bedrijfsnaam, e-mail, telefoon, begin- en einddatum van de reservering; onderhoudsdatum alleen bij Onderhoud); onbekende plekhouders worden leeg verstuurd. Op branch feat/besluiten-d, nog niet op main.
- **D16 en D18:** niets gebouwd, zoals besloten (geen automatische overdracht vanaf /scan; geen categoriefilter op Financieel). **D20:** geen schakelaar gebouwd; de regel "geen browsertests tussen 02:00 en 04:00" staat in docs/e2e/README.md (commit 40fdfdc7).
- **D17:** Instellingen heeft een tabblad Voertuigen met de kaart "RDW-voertuigtypes": "Controleren" draait op de achtergrond en toont de lijst, "Toepassen" (alleen beheerder, met bevestiging en aantal) past exact die lijst toe en schrijft per voertuig een auditregel. Op branch feat/besluiten-d, nog niet op main.
- **D19:** een beheerder verwijderen werkt (20 koppelingen naar gebruikers staan nu op "bij verwijderen leegmaken"); de laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of gedegradeerd (LAST_ADMIN); de knop volgt dezelfde regel. Op branch feat/besluiten-d, nog niet op main.
- **Fiscale prullenbak:** een reservering, een onderhoudsplanning of een klant met fiscale beoordelingen kan definitief worden verwijderd; de beoordelingen en zaken gaan mee, de bevestiging noemt het aantal en het fiscale auditlog krijgt de actie "Definitief verwijderd (prullenbak)" met de ids. Op branch feat/besluiten-d, nog niet op main.
- **"Pech" blijft:** geen wijziging.

**Uitspraken van de coördinator en opmerkingen voor Kees:**

- **D14 telt breder dan "iets proberen".** Ook een 403 van een onderdeel op een scherm dat de medewerker wel mag openen maar waarvoor de rechten niet volledig zijn (een tegel of lijstje), telt als "poging". Een rij pogingen op hetzelfde onderdeel wijst dus eerder op een vergeten vinkje dan op rondsnuffelen. De dedupe en het plafond gelden per medewerker; ze staan in het geheugen van één proces, na een herstart wordt de eerste poging opnieuw vastgelegd.
- **Scanrol met alleen "Voertuigen beheren"** kan een onderhoud dat op Binnen staat niet afronden vanaf het scanscherm: "Terug uit onderhoud" is dan het afronden van dat onderhoud en vraagt "Onderhoud beheren" of "Reserveringen beheren". De knop staat grijs en zegt zelf welk vinkje ontbreekt. Een auto in de werkplaats zonder lopend onderhoud geeft zo'n account nog wel vrij.
- **RDW-hermapping:** de controle markeert elk typeverschil, ook een type dat iemand met de hand zette, en "Toepassen" is alles-of-niets: de lijst en het aantal staan vooraf in beeld, geen regels uitzetten. Een voertuig waarvan het type tussen controle en toepassen is gewijzigd, wordt overgeslagen. Eén controle is ongeveer twee RDW-verzoeken per voertuig; de voortgang staat in het geheugen van één proces (een herstart tijdens een controle verliest de voortgang, niet het opgeslagen plan).
- **Fiscale verwijdering en andere perioden:** bij het definitief verwijderen van een reservering gaat ook een beoordeling van een andere periode weg die naar haar verwijst; die andere periode kan een gat in haar beoordelingsreeks krijgen (een volgnummer ontbreekt, een "vervangt"-verwijzing is leeg, de laatste beoordeling kan een oudere zijn). Het fiscale auditlog (append-only) blijft het bewijs dat er iets is weggehaald; de gebeurtenis heeft geen rol en geen IP-adres. Fiscale gegevens vallen onder de bewaarplicht; het meegaan is Kees' keuze (B-41).
- **Verwijderde chauffeur en privacy:** de gegevens van een verwijderde chauffeur (naam, contactgegevens, rijbewijsnummer, kopie van het rijbewijs) blijven in de prullenbak tot die geleegd is. Een wisverzoek is dus: verwijderen én "Definitief verwijderen" in "Verwijderde chauffeurs" (staat in de handleiding, 3.6 en 10.6).
- **Bedrijfsnaam:** staat standaard op "Autolease Lam"; het portaal zei "Lam Groep". Nieuwe installaties zeggen "Autolease Lam". Bij een bestaande installatie blijven de portaalmails "Lam Groep" zeggen totdat de bedrijfsnaam voor het eerst is opgeslagen; daarna volgen de ongewijzigde portaalsjablonen de instelling, aangepaste sjablonen niet. **Stel de bedrijfsnaam in na de uitrol.** De meldingen die de klant in het portaal zelf ziet (reserveringen, onderhoud, APK, aanvragen, fiscale check) volgen dezelfde regel als de portaalmails: "Lam Groep" totdat de bedrijfsnaam voor het eerst is opgeslagen, daarna de instelling; een melding die al bestond, houdt zijn oude tekst.
- **Gepland bij een verhuurde auto:** een auto die bij een klant staat blijft "Verhuurd" naast een gepland blok vandaag (voorheen "Reparatie nodig"). Auto's die al op "Reparatie nodig" stonden door een gepland blok houden die stand; er is geen terugvulling (de nieuwe kolom vult zich bij de volgende handeling).
- **Overig:** `Date`-waarden in de client behouden de browserzone; de eerste commit van D1 (4071e338) en enkele D6/D4-commits zijn niet los te bisecten (HEAD klopt wel).

**Nieuw open punt D21:** mag een medewerker met het vinkje "Gebruikers beheren" die zelf geen beheerder is, een beheerder verwijderen of degraderen? De server staat het toe (er is bewust geen guard gewijzigd); het venster Gebruikersbeheer is alleen voor de rol Beheerder bereikbaar, dus via de app kan het niet, via de API wel. Advies: dat ook via de server alleen aan een beheerder laten (een nieuw besluit; er is niets aan gebouwd).

**D21 beslist (19-10-2026, Kees):** "Nee, alleen beheerder." Alleen een beheerder mag een beheerder degraderen, uitschakelen of verwijderen. Dat stond al op de server sinds de beveiligingsronde van 18-10 (commit `c932276e`, server/routes/users.ts: PATCH en DELETE geven 403 als een niet-beheerder een beheerder raakt; test `server/__tests__/security-review-2026-10-18.test.ts` "leaves an administrator's account alone").

**Na de deploy controleren:**

- Het containerlog bij de eerste start: "User foreign keys set to ON DELETE SET NULL: 20 key(s) changed" (marker `migration:d19_user_fk_set_null`). Staat er een waarschuwing "D19: …", dan is een koppeling overgeslagen en volgt een nieuwe poging bij de volgende start.
- De vijf nieuwe kolommen komen via `schema-columns.json` (`expenses.source`, `expenses.source_ref`, `vehicles.maintenance_status_block_id`, `fines.customer_notified_at`, `users.last_login_at`); controleer dat de app zonder fouten opstart.
- De portaalsjablonen-migratie van de bedrijfsnaam: eerst de Bedrijfsnaam opslaan, dan staat in het log "📧 portal e-mail templates: n unedited template(s) now follow the company name setting".
- App-instellingen → Bedrijfsregels: de tijdzone staat op Europe/Amsterdam.
- `SELECT status, count(*) FROM fines GROUP BY 1`: komen Doorbelast, Betaald of Betwist voor, dan zijn dat de oude bekeuringen die ze mogen houden.
- App-instellingen → Voertuigen → RDW-voertuigtypes: "Controleren" draaien en de lijst bekijken **vóór** "Toepassen".
- De B-22-stappen uit docs/superpowers/specs/2026-10-11-timestamptz-kolommen.md (back-up, kopie, rapport, onderhoudsvenster, `TIMESTAMPTZ_MIGRATION=apply` één keer, drie bekende tijden controleren). Dat blijft een aparte actie met Kees erbij.

### B-44 — Bekeuringen zonder eigen menu-item (11-10-2026)

Kees: "bekeuringen hoeft geen aparte tab te zijn, ze worden toch per klant opgeslagen en ingevoerd via het klantenportaal. De pagina moet bereikbaar blijven, maar alleen op de pagina van het klantenportaal onder een knop."

- Het menu-item **Bekeuringen** (A-R-1) verdwijnt. De pagina /fines blijft bestaan, met dezelfde rechten (Boetes bekijken of Boetes beheren) in shared/page-access.ts, en blijft per adres bereikbaar.
- Op de pagina **Klantenportaal** komt bovenaan een knop **Bekeuringen** (`button-open-fines`) die naar /fines gaat. Zonder een boetevinkje staat de knop grijs met het ontbrekende recht genoemd (B-27). De tegel en het venster Bekeuringen op het portaaldashboard blijven zoals ze zijn.
- **Gevolg, door Kees aanvaard:** een medewerker die alleen Boetes bekijken of Boetes beheren heeft en geen vinkje voor het klantenportaal, kan de lijst niet meer openen, ook niet vanuit het menu, want de pagina Klantenportaal is voor hem dicht.
- Handleiding: 2.1, 2.6, 10, 13.11, 15.4, Wat is er nieuw en de acceptatiechecklist volgen dit besluit.

### B-45 — Sleutellabels op de DYMO-labelmaker (11-10-2026)

Kees: "de barcodes die gemaakt worden om te printen om aan sleutels te hangen zoals de hoofd en reserve sleutels zijn niet met de .label output compatible dus ik kan ze niet met mijn dymo labelprinter uitprinten zonder een hele omweg dit moet geintegreerd worden"; de printer is een DYMO LabelManager 420P met tape van 12 mm, het sleutellabel is maximaal 48 bij 22 mm. Na een eerste test: "hij kan via het print menu maar hij wil niet liggend printen alleen staand en dan past de barcode niet op het label".

- Geen apart .label-bestand en geen DYMO-webservice: de Windows-driver van de 420P staat op de balie-pc en het afdrukvenster van de browser bereikt hem al. Het probleem was alleen de richting: de driver drukt de tape staand af (pagina zo breed als de tape), en het liggende sleutellabel van 62 bij 29 mm werd afgesneden.
- Nieuwe keuze **DYMO-tape (labelmaker, staand)** in het **Labelsjabloon** op de voertuigkaart, in het venster Voertuigbarcode en in het Barcodeboek (Stickers afdrukken), met **Tapebreedte** (9, 12 of 19 mm; standaard 12) en **Labellengte (mm)** (30 tot 100; standaard 48). Per label één pagina van tapebreedte bij labellengte, marges 0; de inhoud (barcode over de lengte, kenteken vet, **Hoofd** of **Reserve** uit de code zelf: -S is reserve) wordt een kwartslag gedraaid op die pagina gezet. De barcode blijft exact dezelfde VEH-code, zonder leesbare tekst eronder, zodat de sleutelkast-scanner hem leest.
- De keuze en de maten worden per browser onthouden (localStorage; de printer hangt aan één pc). De melding **Afdrukvenster geopend** noemt de printerinstellingen: *Kies daar de DYMO-printer, papier 12 mm, staand, marges Geen en schaal 100%.*
- Niet door Claude te testen: de afdruk op de 420P zelf. Kees drukt eerst één label af en vergelijkt het met een oud label (checklist hoofdstuk 19, regel **DYMO-tape**). Als de driver een andere papierlengte afdwingt, past hij **Labellengte (mm)** aan.
- Handleiding: 4.11, 18.9, Wat is er nieuw (Balie 11) en de acceptatiechecklist volgen dit besluit.
- **Aanvulling na de eerste proef (Kees: "ik kan hier niet echt aanpassen wat er op het label komt, deze komt niet uit de barcode template editor"):** de sjablooneditor onder Documenten → Barcodelabels kent nu het soort **DYMO-tape (48 x 12 mm)** (nieuwe kolom `barcode_label_templates.tape_print`, standaard onwaar, in schema-columns.json). Een tapesjabloon wordt met zijn eigen velden staand en gedraaid afgedrukt, barcodes zonder code eronder; nieuwe veldbron **Sleutel (Hoofd/Reserve)** leest Hoofd of Reserve uit de code (-S). De schakelaar **DYMO-tape: staand afdrukken, inhoud gedraaid** zet een bestaand sjabloon om. De vaste keuze **DYMO-tape (labelmaker, staand)** blijft bestaan voor wie geen sjabloon wil maken. Handleiding 8.5, 4.11, 18.9, Wat is er nieuw en checklist (regel **Tapesjabloon maken**) bijgewerkt.
- **Tweede aanvulling (Kees: "waarom komt die nog als prn bestand en niet als .label voor de dymo software?"):** oorzaak gevonden op de balie-pc: de Windows-printer *DYMO LabelManager 420P* heeft als poort `FILE:` (DYMO Connect zet die wachtrij zo neer); het afdrukvenster van de browser kan dus nooit echt op de 420P printen. Op diezelfde pc draait wél de DYMO-webservice van DYMO Connect (https://127.0.0.1:41951), die de 420P als aangesloten tapeprinter met automatisch snijden meldt. Gebouwd: bij een tapelabel de keuze **Uitvoer** met (1) elke gevonden labelmaker, rechtstreeks via de webservice (PrintLabel, één opdracht per label, TapePrintParams AutoCut), (2) **Bestand .label (openen in DYMO Connect)** in het .label-formaat van DYMO Label v8 (ContinuousLabel, PaperName 12mm, vaste lengte in twips, BarcodeObject Code128Auto met exact de VEH-code en TextPosition None, tekstregels uit de sjabloonvelden) en (3) het afdrukvenster. Het XML-formaat is gecontroleerd met RenderLabel van de webservice (levert een correct label op: barcode links, kenteken en Hoofd/Reserve rechts). Voorwaarden: DYMO Connect draait op de pc en de browser vertrouwt het DYMO-certificaat (op de balie-pc is dat zo); de CSP laat alleen https://127.0.0.1:41951 en https://localhost:41951 extra toe. Niet door Claude getest: de fysieke afdruk; Kees doet de checklistregels **Rechtstreeks naar de labelmaker** en **Bestand .label**.

### B-46 — Rijbewijscontrole en instelbare dashboardtegels (19-10-2026)

Kees koos uit de lijst met suggesties punt 9, "rijbewijs verlopen", en keurde de aanpak met klikken goed. Zijn aanvulling bij de dashboardtegel: "dashboard tegel maar dan met de mogelijkheid om aan te vinken welke er zichtbaar zijn ( beschikbaar, apk verloopt, garantie verloopt, achterstallige huren) in app instellingen en dat je dan zelf de volgorde kan bepalen in de app instellingen".

- **Waartegen de app controleert.** Het rijbewijs van de hoofdbestuurder wordt vergeleken met één dag:
  - bij boeken de startdatum van de huur;
  - bij ophalen de ophaaldag.
  - Verloopt het rijbewijs tijdens de huur, dan geeft de app géén melding (Kees: "Nee").
  - De vervaldag zelf telt nog als geldig.
- **Boeken en wijzigen.** Bij een verlopen rijbewijs verschijnt een gele melding onder de gekozen bestuurder. Opslaan mag.
- **Ophalen.** Bij een verlopen rijbewijs ziet de medewerker een gele melding met het vinkje **Rijbewijs gecontroleerd**.
  - Zonder vinkje gaat het ophalen niet door. De server weigert dan met `DRIVER_LICENSE_EXPIRED` (409) en schrijft niets.
  - Met vinkje gaat het ophalen door. In de geschiedenis van de reservering komt dan de regel **Rijbewijs gecontroleerd**, met de bestuurder en de vervaldatum.
- **Geen vervaldatum ingevuld.** De medewerker ziet alleen een grijze regel "Vervaldatum rijbewijs onbekend". Er is geen vinkje nodig.
- **Portaal.** De klant krijgt een waarschuwing als hij een bestuurder met een verlopen rijbewijs op een auto zet. Het toewijzen blijft mogelijk.
  - Voor een geboekte huur telt de startdatum, voor een lopende huur vandaag.
- **Dashboardtegel "Rijbewijzen".** De tegel toont elke actieve chauffeur van wie het rijbewijs al verlopen is of binnen 30 dagen verloopt, met of zonder huur. Eerst gold dit alleen voor hoofdbestuurders van geboekte en lopende huren; Kees wilde het later op 19-10 "met en zonder reservering".
  - Elke chauffeur staat er één keer in. Staat hij op een geboekte of lopende huur, dan opent het oog de eerste daarvan; anders opent het oog de chauffeurs van de klant.
  - De tegel is te zien met het recht om reserveringen of klanten te bekijken.
- **Instellingen → Dashboard → Dashboardtegels.** Hier zet je de vijf tegels aan of uit en verschuif je ze met pijltjes. De vijf tegels zijn: beschikbare voertuigen, APK, achterstallige huren, garantie en rijbewijzen.
  - De keuze geldt voor iedereen. Wie de app-instellingen mag wijzigen, mag ook deze wijzigen.
  - Het gaat alleen om de tegels, niet om de andere blokken op het dashboard.
  - Opgeslagen als app-instelling `dashboard_tiles`. Komt er later een nieuwe tegel bij, dan verschijnt die vanzelf achteraan.

### B-47 — Extra kosten bij inleveren (19-10-2026)

Kees koos uit de lijst met suggesties punt 1, "afrekening bij inleveren", en gaf zijn keuzes met klikken. Over de kilometers zei hij: "Standaard + per auto maar dan is de standaard per voertuig categorie in te stellen."

- **Kilometers.**
  - Per voertuigsoort stel je in hoeveel kilometer per dag vrij is en wat een extra kilometer kost. Dat staat onder Instellingen → Bedrijf → **Kilometers per voertuigsoort** (app-instelling `km_allowance`).
  - Er is ook een regel **Overige / geen soort**, voor auto's zonder soort of met een soort zonder eigen regel.
  - Bij een auto kun je beide waarden apart aanpassen (`vehicles.free_km_per_day`, `vehicles.extra_km_price`). Leeg betekent: de standaard van de soort.
  - Is voor een soort niets ingevuld, dan wordt er geen kilometerafrekening gemaakt.
- **Berekening bij inleveren.**
  - Gereden km = km-stand bij inleveren min km-stand bij ophalen.
  - Vrije km = aantal huurdagen × vrije km per dag. De huurdagen tellen van de ophaaldag tot en met de inleverdag, net als de huurprijs.
  - De extra km boven de vrije km × de prijs per km wordt een voorgesteld bedrag.
  - De medewerker kan het bedrag aanpassen. Een aangepast bedrag volgt de km-stand daarna niet meer.
- **Bijtanken.** Geen berekening: de medewerker vult het bedrag zelf in. De tankniveaus bij ophalen en bij inleveren staan ernaast.
- **Te laat terug.** Wordt niet afgerekend.
- **Opslaan.**
  - De bedragen komen als extra kosten bij de reservering: bijtanken in `fuel_cost`, en de extra km met het aantal in `extra_km_cost` en `extra_km`.
  - De huurprijs (`total_price`) blijft ongewijzigd.
  - Het reserveringsoverzicht toont een blok **Extra kosten** met een totaal.
  - Het financiële rapport telt de bedragen bij de omzet van de auto en noemt ze apart: "waarvan extra kosten".
  - Wordt het inleveren teruggedraaid (B-30), dan worden de extra kosten ook gewist.
  - Factureren blijft in de boekhouding (D9).

### B-48 — Verwachte onderhoudsdatum (20-10-2026)

Kees koos uit de lijst met suggesties punt 6. Zijn keuzes, met klikken: het gemiddelde over **alle gegevens**; **niets voorspellen** als er te weinig km-standen zijn; tonen op de **voertuigkaart** en in de **onderhoudskalender**; niet eerder waarschuwen. Over de kalender zei hij: "alle autos maar dan met de optie om ook alleen binnenkort weer te geven of niks weer te geven".

- **Km per dag.**
  - De app gebruikt alle km-standen met een datum: ophalen, inleveren, schadechecks, de laatste beurt en de huidige stand (op de dag dat het voertuig het laatst is gewijzigd).
  - Het gemiddelde loopt van de eerste tot de laatste stand. Een stand die lager is dan een eerdere stand telt niet mee.
  - Bij minder dan 2 standen, of minder dan 14 dagen ertussen, voorspelt de app niets. De voertuigkaart zegt dat dan.
- **Verwachte beurt.** De vroegste van twee datums:
  - vandaag + resterende km ÷ km per dag;
  - de bestaande datum op maanden.
- **Voertuigkaart.** Bij Volgende beurt staat bijvoorbeeld: "Verwachte beurt rond 12-12-2026 · gemiddeld 85 km per dag · eerst bereikt: de km-grens".
- **Onderhoudskalender.**
  - Elke auto met een verwachte datum staat op die dag in de kalender, met de titel "Verwachte onderhoudsbeurt". Een auto die al te laat is, blijft op vandaag staan.
  - Er is een keuze **Onderhoud: alle verwachte / alleen binnenkort / niet tonen**, die per browser wordt onthouden.
  - De schakelaar onder de instellingen blijft werken.
- **Nachtelijke melding.** Ongewijzigd.

### B-49 — Auto uit de vloot halen (20-10-2026)

Kees koos uit de lijst met suggesties punt 7 en gaf zijn keuzes met klikken:
- vaste redenen (Verkocht, Terug naar leasemaatschappij, Gesloopt, Anders);
- de auto verborgen houden, met een filter;
- de verkoopprijs niet in het rapport;
- niet toegestaan zolang er nog een lopende of geplande huur is.

Hij voegde toe: "de bestanden en contraten die ooit zijn aangemaakt voor dat voertuig moeten ook bewaard blijven!"

- **Knop "Uit de vloot halen" op de voertuigkaart.**
  - Je vult in: datum, reden en een notitie. Bij Verkocht ook de verkoopprijs en de koper.
  - Het gaat niet zolang er een lopende of geplande huur of een onderhoudsblok is. Dat is dezelfde regel als bij verwijderen (B-14). Het venster toont welke huren of blokken het tegenhouden.
- **Er wordt niets verwijderd.** Reserveringen, kosten, documenten, contracten, schadechecks, boetes en de geschiedenis blijven bij de auto en blijven te openen op de voertuigkaart.
  - Onder Documenten kun je nog steeds een bestand uploaden bij een auto die uit de vloot is, bijvoorbeeld het verkoopcontract.
  - Rapporten tonen de auto zoals voorheen. De verkoopprijs staat alleen op de voertuigkaart.
- **Gevolgen voor de auto.**
  - Hij krijgt de status Niet voor verhuur. Boeken, het portaal, de beschikbaarheid en de onderhoudskalender slaan hem daardoor al over.
  - De nachtelijke APK-scan bij de RDW slaat hem ook over.
  - De sleutelkastcontrole verwacht zijn sleutel niet meer.
  - Hij staat niet meer in de voertuigenlijst en niet in de keuzelijsten. In de voertuigenlijst zie je hem met **Tonen: Uit de vloot**.
  - De status is niet met Bewerken terug te zetten.
- **Terug in de vloot.** Na een bevestiging wist deze knop de gegevens van het uit de vloot halen. De status volgt daarna weer uit de reserveringen.
- **Vastlegging.** Beide stappen komen in de geschiedenis van het voertuig. De gegevens staan in de nieuwe kolommen `out_of_fleet_date`, `_reason`, `_sale_price`, `_buyer` en `_note`. Het oude veld `date_out` wordt bewust niet gebruikt, omdat bestaande data daarin onbekend is.

### B-50 — Beschikbaarheidsvenster (20-10-2026)

Kees koos uit de lijst met suggesties punt 14 (OPT-004) en gaf zijn keuzes met klikken:
- het venster opent als Snelle actie op het dashboard;
- ook auto's die bijna vrij zijn, met de datum waarop ze vrij komen;
- per auto: vrije km, APK-waarschuwing, tankniveau en km-stand;
- de dashboardtegel gebruikt dezelfde berekening.

- **Tegel "Beschikbaarheid" bij Snelle acties.** Hij opent een venster om alleen te kijken.
  - Je kiest van en tot en met (standaard vandaag plus 3 dagen) en eventueel een voertuigsoort.
  - Er wordt niets aangemaakt tot je op **Reserveren** klikt. Die knop opent het reserveringsformulier met de auto en beide datums al ingevuld.
- **Vrij.**
  - Vrij betekent precies wat het boeken gebruikt (`getAvailableVehiclesInRange`): geen lopende huur in de periode, beide grenzen tellen mee.
  - Ook niet in de werkplaats, niet "niet voor verhuur" en niet uit de vloot.
  - De auto's staan per soort, met het aantal.
  - Een gepland onderhoudsblok maakt een auto niet bezet (B-09), maar krijgt een geel label.
  - Een APK die in de periode verloopt of al verlopen is, krijgt een rood label.
- **Nu bezet.** De overige verhuurbare auto's staan in deze lijst.
  - Is de auto vrij aan het begin en later in de periode verhuurd, dan staat er "vrij t/m (dag voor die huur)".
  - Is hij aan het begin verhuurd, dan staat er "vrij vanaf (eerste vrije dag)", of "terugkomst onbekend" bij een huur zonder einddatum.
- **Opzet na Kees' proef ("super onoverzichtelijk met zo veel voertuigen erin", "de tabel is niet breed genoeg").**
  - Tabbladen Vrij en Bezet met een zoekveld (kenteken, merk of model) en een compacte tabel: één regel per auto, 15 per pagina.
  - Het venster is op desktop bijna schermbreed.
  - Een APK die al verlopen is, krijgt het label "APK verlopen"; de datum staat in de tooltip.
- **Dashboardtegel "Beschikbare voertuigen".** Telt voortaan de auto's die vandaag te boeken zijn, met dezelfde regel. Eerst keek hij naar de status "beschikbaar", en dan telt een auto met een boeking binnen 30 dagen niet mee. In de testdata ging het van 12 naar 86 auto's.

### B-51 — Sleutelkastcontrole bewaren en afdrukken (20-10-2026, beantwoordt OPT-032)

Kees koos uit de lijst met suggesties punt 15 en gaf zijn keuzes met klikken:
- automatisch bewaren bij Afronden;
- altijd bewaren;
- leesbaar voor wie voertuigen mag zien;
- op de afdruk een handtekeningregel, een notitie en alle gescande sleutels.

- **Afronden.** Boven de knop Afronden staat een notitieveld (maximaal 2000 tekens).
  - Afronden bewaart de controle meteen in de nieuwe tabel `key_audits`: kast (hoofd of reserve), datum en tijd, medewerker, verwacht aantal, gescand aantal, de lijsten "ontbreekt", "hoort er niet" en "gescand", en de notitie.
  - De lijsten zijn momentopnamen (kenteken, merk, model). Een latere wijziging aan een voertuig verandert dus nooit wat er die dag is vastgesteld.
  - Mislukt het opslaan, dan zegt het venster dat en kun je het opnieuw proberen.
- **Reservesleutels bij klant.** Kees: "soms heeft de klant ook de reserve sleutel, dit moet ook gedocumenteerd worden".
  - Bij een reservesleutelcontrole staan de auto's waarvan op de voertuigkaart "reservesleutel bij klant" is aangevinkt in een eigen lijst, met de klantnaam van de kaart.
  - Die lijst wordt bewaard (kolom `with_customer`), staat op de afdruk en bij Eerdere controles (kolom Bij klant).
  - Deze sleutels tellen niet als ontbrekend.
- **Afdrukken (A4).** De afdruk bevat:
  - kast, datum en tijd, medewerker en de aantallen;
  - de ontbrekende sleutels, de sleutels die er niet horen en alle gescande sleutels;
  - de notitie, en onderaan Gecontroleerd door, Handtekening en Datum.
  - De afdruk is altijd in het Nederlands (B-18).
- **Eerdere controles.** De knop staat naast Sleutelkast-audit op de voertuigenpagina.
  - Een tabel toont datum, kast, door wie, gescand/verwacht, het aantal ontbrekende, het aantal dat er niet hoort, en de notitie.
  - Je kunt elke controle openen en opnieuw afdrukken.
  - Controles worden altijd bewaard. Lezen mag iedereen met het recht om voertuigen te bekijken of te beheren.

### B-52 — Vervangende auto voorstellen (20-10-2026, beantwoordt OPT-009)

Kees koos uit de lijst met suggesties punt 16 en gaf de criteria met klikken: eerst **dezelfde voertuigsoort**, dan **hetzelfde merk en model**. Is er geen auto van dezelfde soort vrij, dan komen andere soorten in het voorstel. Over een auto met een APK die in de periode verloopt zei hij: "toch ja met waarschuwing voor de apk!"

- **Voorstel.** In **Vervangend voertuig** en in **Voertuig toewijzen** staat bovenaan een blok "Voorstel" met de 3 best passende vrije auto's.
  - Bij elke auto staat de reden (zelfde soort en model, zelfde soort en merk, zelfde soort of andere soort) en een knop **Kiezen**.
  - Is de originele auto onbekend, dan staat er geen reden bij.
- **Volgorde.** Eerst dezelfde soort. Daarbinnen eerst hetzelfde merk en model, dan hetzelfde merk, dan de rest.
  - Een auto met een APK die in de periode verloopt, staat in het voorstel met een rood label, net achter een verder gelijke auto zonder dat probleem.
  - Bij een gelijke stand beslist het kenteken.
  - Niet gekozen als criterium: hoe lang de auto daarna vrij is, en de km-stand.
- **Alles invullen.** In het toewijsvenster vult deze knop bij elke open vervanger het eerste voorstel in.
  - Een auto wordt nooit twee keer gebruikt.
  - Rijen die al een keuze hebben, blijven zoals ze zijn.
  - Opslaan gebeurt pas met Toewijzen.
- **Wat vrij is.** Dat bepalen de bestaande beschikbaarheidszoekers van beide vensters. Het voorstel kiest alleen uit die auto's.

### B-53 — Snelle acties instelbaar (20-10-2026)

Kees wilde de snelle acties net zo instellen als de dashboardtegels: aan- en uitzetten en de volgorde kiezen, met altijd hoogstens 6 grote tegels en de rest als knoppen eronder. Hij koos met klikken:

- **Waar.** In **Instellingen > Dashboard** staat onder de dashboardtegels een kaart **Snelle acties**, met vinkjes, pijltjes en een eigen knop Opslaan. Het is één instelling voor iedereen.
- **Tegels en knoppen.** De lijst heeft twee kolommen naast elkaar: **Tegels** en **Knoppen eronder**. Met een pijltje opzij zet je een actie in de andere kolom. Er mogen hoogstens 6 tegels zijn, minder mag ook (Kees: "het hoeven er niet altijd 6 te zijn").
- **Uitvinken.** Een uitgevinkte actie staat niet op het dashboard.
- **Geen recht.** Een tegel waar iemand geen recht op heeft, valt bij die persoon weg. Er schuift geen knop op, dus die persoon ziet dan minder tegels.
- **Breedte.** Minder dan 6 tegels vullen samen de hele rij.
- **Zonder instelling.** Het dashboard blijft zoals het was: de bekende 6 tegels, en de rest als knoppen. Een actie die later wordt toegevoegd, komt aangevinkt onderaan bij de knoppen.

### B-54 — Contract: km-stand, brandstof en eigen risico (20-10-2026)

Kees koos uit de tweede lijst met suggesties punt 2. Met klikken koos hij deze velden: km-stand en brandstof bij ophalen, en het eigen risico. Vrije km en ophaaltijden koos hij niet.

- **Nieuwe velden in de sjablooneditor:** Eigen risico binnenland en Eigen risico buitenland, als twee aparte velden. Kees zet ze zelf op zijn sjabloon.
  - Het bedrag komt uit **Instellingen > Bedrijfsregels**.
  - Zijn die regels nooit opgeslagen, dan gelden dezelfde standaardbedragen als het formulier toont: € 500 en € 1.000.
- **Km-stand en brandstof bij ophalen** voorbeelden: "12.345 km", "vol", "3/4", "leeg".
  - Is de auto nog niet opgehaald, dan blijven deze velden leeg, zodat ze met de hand ingevuld kunnen worden.
- **Meegenomen:** de sjablooneditor bood al velden aan die op het contract niets printten. Die vullen nu wel:
  - km-stand en brandstof bij ophalen en terugbrengen;
  - voertuigtype, brandstoftype, huidige km-stand en brandstofniveau, APK-datum;
  - e-mail en bedrijfsnaam van de klant.

### B-55 — Ophaal-schadecheck begint met de bekende schade (20-10-2026)

Kees koos uit de tweede lijst met suggesties punt 5. Met klikken koos hij dit: de bekende schade wordt overgenomen als markeringen, en het moet kunnen dat je schade verwijdert ("want soms wordt het gemaakt").

- **Bron.** Een nieuwe ophaal-schadecheck neemt de schade over van de nieuwste check van de auto. Dat kan een ophaal- of inlevercheck zijn, van welke huur ook.
  - Hij neemt zowel de markeringen (met soort, ernst en notitie) als de getekende lijnen over.
  - Zo staat alle schade op de check die de klant tekent. Bij inleveren valt alleen nieuwe schade op.
- **Melding.** Bovenaan staat van welke check de schade komt, met datum en aantal. Overgenomen punten hebben het label "overgenomen".
- **Weghalen.** Gerepareerde schade verwijder je per schadepunt. Lijnen haal je weg met **Laatste lijn weghalen**. **Leeg beginnen** haalt alles weg wat is overgenomen.
- **Grenzen.** Er wordt alleen iets overgenomen in een nieuwe, nog lege ophaalcheck.
  - Niet bij bewerken, niet bij inleveren en niet als je zelf al iets hebt getekend.
  - Kies je een andere auto of een inlevercheck, dan verdwijnt wat is overgenomen.

### B-56 — Herinnering milieuzone en Move IZI (20-10-2026)

Kees koos uit de tweede lijst met suggesties punt 9. De einddatum van de milieuzone (`euroZoneEndDate`) en van Move IZI (`moveIziExpirationDate`) werden tot nu toe alleen ingevuld en getoond. Kees koos met klikken op alle drie de plekken een herinnering; de termijn is instelbaar, en het telt voor dezelfde auto's als bij APK en garantie.

- **Dashboardtegel** "Milieuzone / Move IZI". Op de tegel staat per auto en per soort de einddatum en het aantal dagen. Bij de dashboardtegels zet je hem aan of uit en verander je de volgorde.
- **Meldingencentrum.** Bij het belletje, net als APK en garantie. De melding is weg te klikken.
- **Boeken en ophalen.** Een gele waarschuwing als de datum vóór de huur ligt (verlopen) of in de huurperiode valt (verloopt tijdens de huur). Opslaan en meegeven mag wel.
- **Termijn.** Standaard 30 dagen. Sinds 21-10 (B-58) stel je dit alleen in bij **Instellingen in het meldingencentrum**. Auto's waarvan de datum tot twee maanden verlopen is, blijven op de lijst staan.
- **Welke auto's.** Dezelfde als bij APK en garantie: niet de uitgesloten statussen uit de onderhoudsinstellingen, en niet de auto's die uit de vloot zijn.

### B-57 — Werkplaatsbezoek: soort, kosten en stilstand (21-10-2026, deel A)

Kees koos uit de tweede lijst met suggesties punt 11. Hij koos met klikken alle drie de onderdelen en vroeg daarnaast om de herinnering "factuur ontbreekt" en een wekelijkse mail. Die komen in deel B.

- **Soort als eigen veld.** Een werkplaatsbezoek heeft nu een kolom `maintenanceType` (pech, banden, APK, …). Tot nu toe stond de soort alleen voor de dubbele punt in de notitie.
  - De notitie blijft er hetzelfde uitzien.
  - Bestaande bezoeken worden gelezen uit het begin van de notitie, als dat een bekende soort is.
  - De oude regels "Vehicle maintenance block" hebben geen soort.
- **Kosten per bezoek.** In het venster van het bezoek staan de gekoppelde kosten met het totaal, en er is een knop **Kosten toevoegen**.
  - Bij **Kosten registreren** kies je "Hoort bij werkplaatsbezoek".
  - De server controleert dat het bezoek bij dezelfde auto hoort.
- **Factuur die later komt.** Kees: de garagefactuur komt meestal pas later.
  - Het bezoek meldt "Nieuwe factuur gevonden" voor kosten van die auto die nog niet gekoppeld zijn. Het gaat om kosten vanaf het begin van het bezoek tot 60 dagen na het einde, ook facturen uit het factuurpostvak.
  - Koppelen gebeurt alleen via een bevestiging met de facturen op een rij, de nieuwste al aangevinkt. Soms komt er tussendoor een andere factuur binnen.
  - Ontkoppelen kan per kostenpost.
- **Stilstandrapport.** Staat in **Rapporten > Voertuigen** en volgt de periode bovenaan de pagina, met CSV-export.
  - Per auto: het aantal bezoeken, de dagen in de werkplaats (alleen binnen de periode), hoe vaak het pech was en de gekoppelde kosten.
  - Daaronder dezelfde cijfers per merk en model.

### B-58 — Factuur ontbreekt en werkende meldingsinstellingen (21-10-2026, punt 11 deel B)

Kees koos met klikken: het aantal dagen voor "factuur ontbreekt" is instelbaar, de melding komt op drie plekken, en er gaat een wekelijkse mail uit waarvan hij ontvangers, dag en tijd, onderwerp en tekst en de kolommen zelf instelt. Daarnaast moesten de meldingen in het meldingencentrum aan te passen zijn, net als de andere meldingen.

- **Factuur ontbreekt.** Een werkplaatsbezoek staat op de lijst als het X dagen na het einde nog geen gekoppelde kosten heeft. X is standaard 14.
  - Alleen bezoeken die op of na 1 oktober 2026 eindigden tellen mee. Oudere bezoeken konden nog niet gekoppeld worden.
  - Met **Geen factuur nodig** op het bezoek (bijvoorbeeld bij gratis garantie) gaat het bezoek van de lijst.
- **Waar je het ziet.**
  - Bij het belletje, weg te klikken net als de andere meldingen.
  - Op een nieuwe dashboardtegel **Factuur ontbreekt** met de knop **Lijst afdrukken** (PDF). De tegel staat bij de dashboardtegels aan of uit.
  - Als markering op het bezoek in de onderhoudskalender en als rood label in het bezoekvenster.
- **Wekelijkse mail.** Je stelt in: ontvangers, dag en tijd, onderwerp, tekst boven de lijst en kolommen.
  - Mogelijke kolommen: kenteken, merk en model, soort, periode, omschrijving en dagen sinds einde.
  - De lijst staat in de mail en gaat ook mee als PDF.
  - Is de lijst leeg, dan gaat er geen mail.
  - Met **Nu versturen** stuur je de mail meteen.
  - De mail gaat één keer op de gekozen dag, vanaf de gekozen tijd. De server kijkt elk kwartier.
- **Meldingsinstellingen.** Het scherm Instellingen in het meldingencentrum sloeg niets op; in de code stond letterlijk "in a real application, save these settings". Nu bewaart het echt:
  - de dagen voor APK, garantie, milieuzone/Move IZI, aankomende reserveringen en factuur ontbreekt;
  - de mailinstellingen.
  - Aankomende reserveringen stond vast op 2 dagen en is nu een instelling.
  - Kees (21-10): milieuzone/Move IZI en aankomende reserveringen stel je alleen in het meldingencentrum in. APK, garantie en factuur ontbreekt staan ook in **App-instellingen > Kalender**.
  - De nepschakelaars "App-meldingen" en "E-mailmeldingen" zijn weg.
  - Opslaan mag alleen wie instellingen mag beheren.

### B-59 — Weggeklikte meldingen gelden voor het hele team (21-10-2026)

Kees koos uit de tweede lijst met suggesties punt 12. Tot nu toe onthield alleen de eigen browser dat je een melding had weggeklikt. Daardoor zag elke collega op elke pc dezelfde herinneringen opnieuw. Na herladen kwamen weggeklikte milieuzone- en factuurmeldingen zelfs terug.

- **Voor iedereen.** Wegklikken bewaart de server. Het werkt voor APK, garantie, milieuzone/Move IZI en factuur ontbreekt, in het meldingencentrum en bij het belletje.
- **Hoe lang.** Bij het wegklikken kies je: **1 week** (standaard, zoals voorheen), **1 maand**, of **tot de datum verandert**.
  - Bij de laatste keuze komt de melding terug zodra de APK-datum, de garantiedatum, de einddatum van de milieuzone of het werkplaatsbezoek verandert.
- **Wie.** Wie wat wegklikte, staat alleen in het logboek als "Weggeklikte melding aangemaakt". Kees koos geen aparte tab.
- **Terug.** Een APK- of garantiebeurt plannen of afronden zet de melding weer terug voor iedereen, zoals die eerder alleen in de eigen browser terugkwam.
- **Overgang.** Wat in een browser was weggeklikt, vervalt. Die meldingen komen één keer terug.

### B-60 — Dashboardindeling per gebruiker (21-10-2026)

Kees wilde dat ieder zijn eigen dashboard kan indelen: welke tegels en snelle acties, en in welke volgorde. Dit vervangt de instelling voor iedereen uit B-46 en B-53.

- **Waar.** In **App-instellingen > Dashboard**, zoals voorheen.
  - Ook via het **tandwieltje** rechtsboven in het blok Snelle acties op het dashboard. Via dat tandwieltje kunnen ook collega's die App-instellingen niet mogen openen hun eigen indeling maken.
- **Per gebruiker.** Wat je opslaat, geldt alleen voor jou.
  - Een beheerder kan het dashboard van een ander niet instellen. Kees koos "ieder zelf".
- **Standaard.** Wie niets zelf heeft ingesteld, ziet de indeling die vóór deze wijziging voor iedereen was opgeslagen. Is daar niets opgeslagen, dan de vaste volgorde van de app.
  - Die standaard is niet meer te wijzigen.
- **Terug naar standaard.** Deze knop staat alleen in App-instellingen > Dashboard, niet onder het tandwieltje (Kees). De eigen indeling verdwijnt en de standaard geldt weer.

### B-61 — Contract: getekend te, schade, handtekeningen en eigen risico per klant (21-10-2026)

Kees koos met klikken:

- **Getekend te.** Nieuw veld in de sjablooneditor. De plaats komt uit **Bedrijfsregels > Plaats van ondertekening** (standaard Zuidland).
- **Schade aan voertuig.** Nieuw veld met een vaste tekst uit Bedrijfsregels, standaard "Zie schadecheck". Kees koos "altijd zie schadecheck".
- **Handtekening verhuurder.** Iedere medewerker zet zijn eigen handtekening bij **Profiel > Handtekening**, getekend of als geüploade afbeelding.
  - Het veld "Handtekening verhuurder" toont die van de medewerker die het contract maakt.
  - Heeft die nog geen handtekening, dan blijft het vak leeg.
- **Handtekening huurder.** Het veld "Handtekening huurder" blijft bij het maken leeg; de plek wordt in het PDF bewaard.
  - Tekent de klant in het portaal, dan komt zijn handtekening in dat vak. De bewijspagina blijft.
  - Bij contracten van vóór deze wijziging staat de handtekening alleen op de bewijspagina.
- **Grootte van de vakken.** Een handtekeningvak is 170 x 55 pt, gerekend vanaf de linkerbovenhoek van het veld.
- **Eigen risico per klant.** Bij de klant per voertuigsoort een bedrag binnenland en buitenland.
  - Het contract toont het bedrag voor de soort van de gehuurde auto.
  - Leeg betekent het algemene bedrag uit Bedrijfsregels.

### B-62 — Vervangers scannen en innemen, meegeven vanuit de reserveringsscan (22-10-2026)

Kees koos met klikken:

- **Scan van een vervanger.** Scan je een auto met een vervangende reservering, dan biedt de scan ook ophalen of inleveren aan, net als bij een gewone huur.
  - Een vervanger zonder auto ("nog te bepalen") telt niet mee.
- **Inleveren van een vervanger.** "Markeer als ingeleverd" in het vervanger-blok op het dashboard opent hetzelfde inleverscherm als een gewone huur: km-stand, brandstof en schadecheck.
  - Dit geldt alleen als de vervanger echt is opgehaald. Is hij alleen als "opgehaald" gemarkeerd, dan blijft het bij het wijzigen van de status.
- **Scan van een reservering of contract.** De kaart toont een knop "Ophalen starten" of "Inleveren starten". Het scherm start niet vanzelf; je klikt zelf.

## Nog open (opnieuw vragen voordat er iets aan gebouwd wordt)

- De vragen D1 t/m D20 en de fiscale prullenbak van B-40 zijn beantwoord in B-41 (11-10-2026); de bouw ervan staat sinds B-43 op de branch feat/besluiten-d (nog niet op main, nog niet uitgerold).
- (beslist 19-10-2026) **D21**: alleen een beheerder mag een beheerder verwijderen of degraderen; afgedwongen sinds `c932276e`.
- De omzetting van de database naar tijdzone-bewuste kolommen (B-22) is nog niet uitgevoerd; de kolommenlijst staat klaar.

- (beslist, zie B-17) OPT-001 — wat telt als "openstaand punt" op het werkdagscherm.
- (beslist, zie B-52) OPT-009 — mag de app zelf een vervanger voorstellen/toewijzen, en op welke criteria.
- (beslist, zie B-30) OPT-017 — welke statusomkeringen mogen, en door wie.
- (geparkeerd, zie hieronder) OPT-025 — welke velden verplicht zijn voordat een voertuig
  verhuurd mag worden.
- (geparkeerd, zie hieronder) OPT-026 — BV → Opnaam: vooraf vragen of achteraf melden.
- (beslist, zie B-31) OPT-029 — pechomruil: wat gebeurt er met de oorspronkelijke huur.
- (beslist, zie B-51) OPT-032 — wat de sleutelkastaudit moet vastleggen en afdrukken.

**Geparkeerd op verzoek van Kees (21-09-2026, letterlijk: "moeten genegeerd worden voor
nu").** Hier niet opnieuw naar vragen totdat hij er zelf over begint of het werk erom
vraagt: OPT-035 (onthoud agenda- of lijstweergave), OPT-038 (zeggen welk sjabloon
ontbreekt), V-1 (kloppen de zeven rechtenprofielen met productie), OPT-025 / V-7 (welke
velden verplicht voor verhuur en contract), OPT-026 / V-8 (BV → Opnaam) en V-14 / BUG-056
(terugkerende reservering).

Deelvragen die bij het uitwerken van de besluiten van 21-09 nog voorgelegd moeten worden:

- Bij B-26: welke soort melding bij welk recht hoort.
- (beslist, zie B-38) Bij B-33: wie de prullenbak mag legen, en of dat per soort gaat of in één keer.
- Bij B-30 en B-33: of "toggle"/"vinkje bij de instellingen van de accounts" inderdaad één
  nieuw recht per gebruiker is, standaard alleen aan bij admin en manager.
