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

## Nog open (opnieuw vragen voordat er iets aan gebouwd wordt)

- OPT-001 — wat telt als "openstaand punt" op het werkdagscherm.
- OPT-009 — mag de app zelf een vervanger voorstellen/toewijzen, en op welke criteria.
- OPT-017 — welke statusomkeringen mogen, en door wie.
- OPT-025 — welke velden verplicht zijn voordat een voertuig verhuurd mag worden.
- OPT-026 — BV → Opnaam: vooraf vragen of achteraf melden.
- OPT-029 — pechomruil: wat gebeurt er met de oorspronkelijke huur.
- OPT-032 — wat de sleutelkastaudit moet vastleggen en afdrukken.
