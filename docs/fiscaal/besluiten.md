# Besluiten van de eigenaar: fiscale mobiliteitscheck

Alleen wat hier staat mag als besluit worden geïmplementeerd. Alles wat hier nog niet staat: opnieuw
vragen (STOP). Nummering F-nn, los van de B-nn-besluiten van de audit in `docs/audit/besluiten.md`.

## Vastgelegd 2026-09-16

### F-00 — Voorstel STOP POINT 1
**Besluit:** het voorstel in `00-audit-en-voorstel.md` is goedgekeurd ("q10 is 1-1-2027 rest is
goed"), inclusief het ontwerp (versiebeheerde regels, zeven nieuwe tabellen, rechten, portaalintegratie,
stopmomenten) en de aannames in hoofdstuk 13.

### F-01 — Doelgroep (Q1)
**Besluit:** alleen zakelijke klanten (`customers.customer_type = 'business'`).
Voor particuliere klanten geeft de beoordeling `NOT_APPLICABLE` met reden `customer_type_not_business`;
er wordt niets verborgen of verwijderd.

### F-02 — Gebruik bevestigen door de klant (Q2)
**Besluit:** de klantbeheerder mag in het portaal het gebruik bevestigen (privégebruik, woon-werkverkeer,
al vóór 2027 ter beschikking gesteld, reden van vervanging). Elke bevestiging wordt geaudit met account
en tijdstip; kantoor kan een bevestiging overrulen, ook geaudit. Bestuurdersaccounts mogen niet bevestigen.

### F-03 — Beoordelingsmoment (Q3)
**Besluit:** nachtelijke beoordeling voor klanten met de hoofdschakelaar aan, beperkt tot lopende en
recent afgesloten perioden; daarnaast altijd op verzoek (kantoor per auto, klant of periode) en direct na
een bevestiging van gebruik.

### F-04 — Publiceren (Q4)
**Besluit:** geen vier-ogenprincipe in de eerste versie; indiener, goedkeurder en publiceerder mogen
dezelfde persoon zijn. De bestaande adminbypass blijft. Elke stap wordt volledig geaudit.

### F-05 — Bedragen in het portaal (Q5)
**Besluit:** het portaal toont status en uitleg; bedragen alleen als `fiscal_dashboard_enabled` aan
staat voor de klant, altijd gelabeld als schatting op basis van de geconfigureerde regels.

### F-06 — Meldingen (Q6)
**Besluit:** kantoor: beoordeling nodig, gegevens ontbreken, regelversie wordt actief. Klant (alleen bij
`fiscal_warnings_enabled`): gegevens ontbreken, beoordeling door Lam Groep nodig, waarschuwing wanneer
een vervanging de vrijstellingsgrens of een maandgrens nadert. Nooit conceptversies of interne
parameters naar klanten.

### F-07 — Navigatie (Q7)
**Besluit:** zijbalkitem **Fiscaal** onder Rapporten, zichtbaar met recht `view_fiscal`.

### F-08 — Ontbrekende catalogusprijs (Q8)
**Besluit:** alleen kantoor vult een ontbrekende catalogusprijs of marktwaarde in, met bron; de klant
ziet in dat geval "gegevens ontbreken".

### F-09 — Reden van vervanging (Q9)
**Besluit:** optioneel veld bij het reserveren; verplicht op het moment dat iemand het gebruik van de
periode bevestigt. Bij vervangingen van een auto van Lam wordt de reden voorgevuld uit het onderhoudsblok.

### F-11 — Schema en dataflow (STOP POINT 2)
**Besluit:** `03-schema-en-dataflow.md` is goedgekeurd ("akkord"), inclusief de zeven punten S2-1 t/m
S2-7: het systeem sluit bij publicatie de open voorganger; werkelijke ophaal-/innamedatum gaat vóór de
geplande datums; echte `date`-kolommen; klantbevestiging in dezelfde tabel als kantoor; Engelse codes
in de database met Nederlandse labels; één open beoordelingszaak per periode met automatische sluiting;
nachtelijk venster van 45 dagen terug tot 31 dagen vooruit.

### F-12 — Stap 3 (STOP POINT 3), 17 september 2026
**Besluit:** `04-stap3-rapport.md` is goedgekeurd ("ja verder met de volgende stap"), inclusief de twee
verfijningen (regelversie op de datums van de periode; dedupe-hash zonder beoordelingsdatum). Stap 4
(kantoorschermen, impactvoorbeeld, publicatiedialoog, beveiligingstests) mag worden gebouwd.

### F-13 — Plaats in de applicatie (vervangt F-07), 17 september 2026
**Besluit:** geen pagina "Fiscaal" in het hoofdmenu. De configuratie (regelversies, publiceren), de
beoordelingswachtrij en de fiscale auditlog staan in de **app-instellingen, onder Klantenportaal**.
Het **overzicht** (tegels per status, open zaken, geldende versie) verschijnt als **dialoog** achter een
knop op de pagina Klantenportaal.

### F-14 — Stap 4 (STOP POINT 4), 17 september 2026
**Besluit:** `05-stap4-rapport.md` is goedgekeurd ("ja akkoord") inclusief de plaatsing volgens F-13.
Stap 5 (RDW-profiel, nachtelijke beoordeling, portaalpagina en -routes, meldingen) mag worden gebouwd.

### F-10 — Startdatum afleiding (Q10)
**Besluit:** gebruiksperioden worden afgeleid uit reserveringen met een startdatum **vanaf 1 januari
2027**. Eerdere reserveringen worden alleen gelezen om "al vóór 2027 ter beschikking gesteld" voor te
vullen (aaneengesloten eerdere huur van dezelfde auto bij dezelfde klant).

### F-15 — Open einde: per maand en per jaar, eindberekening bij afsluiten, 17 september 2026
**Besluit (Kees, tijdens stap 5):** "als er een open eind is dan moet het gewoon per maand / jaar
berekend worden, en dan als de reservering wordt afgesloten een eindberekening".

**Uitwerking (stap 6):**
- Een periode zonder einddatum wordt niet langer alleen "tot de beoordelingshorizon" beoordeeld. Elke
  afgesloten kalendermaand wordt bij de nachtelijke run vastgelegd als een eigen, onveranderlijke
  maandbeoordeling (bedrag per maand, opgeteld per kalenderjaar). De dedupe-hash krijgt daarvoor de
  laatst afgesloten maand als onderdeel, zodat iedere nieuwe maand een nieuwe beoordeling oplevert en
  een ongewijzigde maand niets schrijft.
- De lopende maand blijft **voorlopig**; het jaartotaal in overzicht en rapport telt de vastgelegde
  maanden plus de lopende maand als voorlopig bedrag, expliciet zo gelabeld.
- Zodra de reservering wordt afgesloten (werkelijke innamedatum bekend, de periode krijgt een
  einddatum) volgt automatisch een **eindberekening** over de hele periode (trigger `final`). Die
  vervangt in overzicht en portaal de voorlopige maandbeoordelingen; de historie blijft bewaard, want
  elke beoordeling is een snapshot.
- Kantoor en portaal tonen het onderscheid "voorlopig, per maand" en "eindberekening" altijd
  expliciet; de disclaimer blijft staan.
- De vooruitkijkdagen blijven alleen bestaan voor waarschuwingen (vrijstellingsgrens, maandgrens);
  ze bepalen niet meer tot waar een open periode wordt beoordeeld.

### F-16 — Stap 5 (STOP POINT 5), 17 september 2026
**Besluit:** `06-stap5-rapport.md` is goedgekeurd ("ja akkoord"), inclusief de hook op alle
schrijfroutes met herstelronde en het besluit F-15. Stap 6 (volledige berekeningen: open einde per
maand en per jaar met eindberekening, rapporten en CSV, PDF per beoordeling, randgevallen over maand-
en jaargrenzen, documentatie, eindaudit, regressie en de productie-vormige migratietest) mag worden
gebouwd.
