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

## Nog open (opnieuw vragen voordat er iets aan gebouwd wordt)

- (beslist, zie B-17) OPT-001 — wat telt als "openstaand punt" op het werkdagscherm.
- OPT-009 — mag de app zelf een vervanger voorstellen/toewijzen, en op welke criteria.
- OPT-017 — welke statusomkeringen mogen, en door wie.
- OPT-025 — welke velden verplicht zijn voordat een voertuig verhuurd mag worden.
- OPT-026 — BV → Opnaam: vooraf vragen of achteraf melden.
- OPT-029 — pechomruil: wat gebeurt er met de oorspronkelijke huur.
- OPT-032 — wat de sleutelkastaudit moet vastleggen en afdrukken.
