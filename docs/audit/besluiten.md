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

## Nog open (opnieuw vragen voordat er iets aan gebouwd wordt)

- De vragen D1 t/m D20 en de fiscale prullenbak van B-40 zijn beantwoord in B-41 (11-10-2026); de bouw ervan staat sinds B-43 op de branch feat/besluiten-d (nog niet op main, nog niet uitgerold).
- **D21** (nieuw, zie B-43): mag een medewerker met "Gebruikers beheren" die geen beheerder is een beheerder verwijderen of degraderen?
- De omzetting van de database naar tijdzone-bewuste kolommen (B-22) is nog niet uitgevoerd; de kolommenlijst staat klaar.

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
- (beslist, zie B-38) Bij B-33: wie de prullenbak mag legen, en of dat per soort gaat of in één keer.
- Bij B-30 en B-33: of "toggle"/"vinkje bij de instellingen van de accounts" inderdaad één
  nieuw recht per gebruiker is, standaard alleen aan bij admin en manager.
