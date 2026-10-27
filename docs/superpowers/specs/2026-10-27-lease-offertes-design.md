# Lease offertes — ontwerp

Datum: 2026-10-27. Opdrachtgever: Kees.

## Waarom

Kees berekent leaseprijzen nu in een Excel-bestand ("Lease prijs berekenen juist.xlsx"). Offertes zijn daardoor
niet terug te vinden, varianten worden overschreven en de offerte van de dealer zit los in de mail. Hij wil een
module **Lease offertes** in het menu waarin hij de berekening maakt, met restwaarde en looptijd kan "spelen",
de dealerofferte uploadt (die de app uitleest), offertes terugziet en een PDF voor de klant maakt.

Succes: Kees maakt een offerte sneller dan in Excel, krijgt dezelfde uitkomst als zijn Excel, en vindt elke oude
offerte met de varianten die hij toen heeft bekeken.

## De berekening (uit de Excel, Blad1)

Alle bedragen excl. btw. Per variant:

| Regel | Formule | Voorbeeld Excel |
|---|---|---|
| Afschrijving per maand | (aanschafwaarde − restwaarde) / looptijd | (17.318 − 10.000) / 48 = 152,46 |
| Rente per maand | aanschafwaarde × rente% / 12 | 17.318 × 9% / 12 = 129,89 |
| ROB per maand | ROB per jaar / 12 | 275 / 12 = 22,92 |
| Verzekering per maand | ingevuld | 97,80 |
| Wegenbelasting per maand | ingevuld | 34,00 |
| Overige kosten per maand | overige kosten per jaar / 12 | 350 / 12 = 29,17 |
| Marge per maand | ingevuld (nieuw, standaard uit Instellingen) | 0 |
| **Totaal leaseprijs per maand** | som van de regels hierboven | **466,23** |
| Kosten per km | totaal / (km per jaar / 12) | 0,28 |

- De rente blijft precies zoals in de Excel: over de **volle** aanschafwaarde, niet over het gemiddeld uitstaande
  bedrag. Zo blijven uitkomsten gelijk aan wat Kees gewend is. (Kees vult het percentage zelf in; de methode is
  niet besproken als iets om te veranderen.)
- De restwaarde vult Kees **altijd zelf** in. Er is geen automatische restwaarde en de km per jaar rekenen niets
  aan de restwaarde; Kees verwerkt de km zelf in de restwaarde die hij invult.
- Het Excel-veld "ROB totaal over looptijd" is alleen informatie (ROB per jaar × looptijd / 12); het mag als
  meetekst bij de ROB-regel staan, het is geen invoer.
- Een testgeval met de Excel-getallen hierboven (km per jaar **20.000**) moet 466,23 per maand en 0,28 per km
  opleveren. Het Excel-bestand staat bij Kees op `C:\Users\kees lam\Documents\Lease prijs berekenen juist.xlsx`.
- Afronden: alle regels onafgerond optellen, alleen het resultaat op centen tonen (de afgeronde regels tellen op
  tot 466,24, de Excel geeft 466,23).

## Besluiten van Kees

1. **Tab Instellingen** in de module, met de voorinstellingen voor de berekening: **rente %**, **marge per maand**,
   **ROB per jaar**, **overige kosten per jaar**, **meerkilometerprijs** en **minderkilometerprijs**. Elke
   offerte neemt deze waarden over en Kees kan ze per offerte aanpassen.
2. **Vaste kostenregels** zijn alleen ROB en Overige kosten (allebei met een standaard in Instellingen).
   Verzekering en wegenbelasting vult Kees per offerte zelf in; geen automatische berekening.
3. **Varianten:** binnen één offerte kan Kees meerdere varianten naast elkaar zetten met verschillende
   **restwaarde** en **looptijd** (en km per jaar) en direct zien wat de leaseprijs doet. Alle varianten worden
   **bewaard**, de klant ziet ze **niet**: op de PDF staat alleen de gekozen variant.
4. **Meer-/minderkilometerprijs** staat op de offerte voor de klant; standaard uit Instellingen, per offerte aan te
   passen.
5. **Dealerofferte uploaden:** de scanner leest de PDF uit (merk, model, uitvoering, prijs, korting, levertijd) en
   vult de velden voor; Kees controleert. **Aanschafwaarde = excl. btw, inclusief BPM en afleverkosten.** De PDF
   blijft bij de offerte bewaard.
6. **PDF voor de klant**, voorlopig geen mail vanuit de app. Het **sjabloon** van deze PDF wil Kees zelf kunnen
   aanpassen, met een editor zoals die van het contract en de transporten.
7. **De klant ziet alleen** de maandprijs excl. btw en de meer-/minderkilometerprijs — geen kostenopbouw
   (afschrijving, rente, marge enz.).
8. **Rolrecht "Lease offertes"**, standaard alleen voor beheerders.
9. **Offertelijst:** zoeken op klant, merk of kenteken, filteren op status, een offerte kopiëren naar een nieuwe,
   en een "geldig tot"-datum (standaard 30 dagen).
10. **Elke gemaakte PDF wordt bewaard** bij de offerte (lijst met datum en wie hem maakte, te openen en
    downloaden), zodat Kees later precies ziet wat de klant kreeg, ook als sjabloon, klantgegevens of offerte
    daarna veranderen. Bewaarde PDF's gaan mee in de bestaande upload-beveiliging en prullenbak-opruiming.
11. **Waarschuwing bij wijzigen** van een offerte met status Verstuurd of Geaccepteerd: vóór het opslaan vraagt de
    app of Kees het echt wil (bijv. "Deze offerte is al verstuurd. Toch wijzigen?"). Wijzigen blijft mogelijk.
12. Offerte koppelen aan een bestaande klant of alleen een naam typen (prospect). Statussen: Concept, Verstuurd,
    Geaccepteerd, Afgewezen, Verlopen. Een geaccepteerde offerte wordt in deze versie **niet** automatisch een
    voertuig, reservering of contract.

## Niet doen (non-goals)

- Geen e-mail vanuit de app, geen portaal-weergave voor de klant.
- Geen automatische restwaarde, geen automatische wegenbelasting of verzekering.
- Geen omzetting van een offerte naar voertuig/contract.
- Geen kostenopbouw en geen varianten op de PDF.
- De rentemethode niet "verbeteren" (geen annuïteit, geen gemiddeld kapitaal).

## Anti-doelen (mislukt, ook als het technisch werkt)

- Uitkomst wijkt af van Kees' Excel bij dezelfde invoer.
- Een oude offerte verandert als Kees later de Instellingen aanpast.
- De klant kan via de PDF de kostenopbouw of andere varianten zien.
- Meer klikken dan in Excel om een prijs te zien: de leaseprijs moet live meerekenen tijdens het typen.
- De scanner vult stilletjes iets in dat Kees niet heeft gezien.

## Hoe het eruitziet

### Menu en tabs

Menu-item **Lease offertes** (pad `/lease-quotes`), zichtbaar met het nieuwe rolrecht. De pagina heeft drie tabs:

- **Offertes** — de lijst.
- **Instellingen** — voorinstellingen voor de berekening (besluit 1).
- **Sjabloon** — de PDF-sjablooneditor voor de offerte.

*(Mijn keuze: het sjabloon zit in de module zelf, niet tussen de sjablonen onder Documenten, zodat alles voor
lease offertes op één plek staat en onder één rolrecht valt.)*

### Offertelijst

Tabel met: offertenummer, datum, klant (of prospectnaam), auto (merk model uitvoering), kenteken (als bekend),
maandprijs van de gekozen variant, status, geldig tot. Zoekveld (klant, merk, model, kenteken, offertenummer),
statusfilter, sorteren op kolom, pagina's (zoals de andere lijsten in de app). Knoppen per regel: openen, kopiëren,
PDF, verwijderen. Knop **Nieuwe offerte** bovenaan.

**Verlopen** is geen handmatige status maar volgt vanzelf: een offerte met status Concept of Verstuurd waarvan
"geldig tot" voorbij is, toont als Verlopen. *(Mijn keuze.)*

### Offerte openen / maken

Eén scherm, van boven naar beneden:

1. **Klant** — bestaande klant zoeken, of prospect: naam, bedrijf, e-mail, telefoon (vrije velden).
2. **Auto** — merk, model, uitvoering, kenteken (optioneel, nieuwe auto's hebben er vaak nog geen), dealer,
   levertijd, opmerkingen. Knop **Dealerofferte uploaden** (zie onder). Lijst met bijlagen (dealerofferte(s)).
3. **Aanschaf** — aanschafwaarde excl. btw (incl. BPM en afleverkosten). Optioneel daaronder de opbouw zoals de
   scanner die las (catalogusprijs, opties, korting, BPM, afleverkosten) als controle; de aanschafwaarde blijft
   het getal dat telt.
4. **Kosten** — rente %, ROB per jaar, overige kosten per jaar, verzekering per maand, wegenbelasting per maand,
   marge per maand, meerkilometerprijs, minderkilometerprijs. Vooringevuld uit Instellingen.
5. **Varianten** — een vergelijkingstabel: elke kolom is een variant met looptijd (maanden), km per jaar en
   restwaarde als invoer, daaronder de uitkomsten: afschrijving, rente, ROB, verzekering, wegenbelasting,
   overige, marge, **totaal per maand**, kosten per km. Alles rekent live mee. Knoppen: variant toevoegen,
   variant dupliceren, variant verwijderen, **"Deze naar de klant"** (precies één variant is de gekozen variant;
   die staat op de PDF en in de lijst). De eerste variant is standaard gekozen.
6. **Offerte** — status, offertedatum, geldig tot (standaard offertedatum + 30 dagen), interne notitie.

Knoppen: Opslaan, PDF maken, Kopiëren, Geschiedenis. Onopgeslagen wijzigingen waarschuwen bij weggaan (zoals
elders in de app).

### Dealerofferte uploaden

- PDF of foto (PNG/JPG) uploaden. Het bestand wordt bij de offerte bewaard (meerdere bestanden mogelijk).
- De app leest het uit met de AI-scanner en toont een **controlevenster**: per gelezen veld de waarde, met een
  vinkje "overnemen". Niets komt in de offerte zonder dat Kees op "Overnemen" klikt.
- Gelezen velden: dealer, merk, model, uitvoering, catalogusprijs, opties, korting, BPM, afleverkosten, totaal
  excl. btw, totaal incl. btw, levertijd, offertedatum/geldigheid van de dealer.
- Voorstel aanschafwaarde = totaal excl. btw inclusief BPM en afleverkosten. Als de dealer alleen een bedrag
  incl. btw noemt, zegt het venster dat erbij en rekent het niets om zonder dat Kees het ziet.
- Mislukt het lezen, dan blijft het bestand bewaard en vult Kees zelf in.

### Instellingen-tab

De zes standaardwaarden uit besluit 1, plus de standaard geldigheid in dagen (30). Opslaan geldt voor **nieuwe**
offertes; bestaande offertes houden hun eigen waarden (die worden bij het aanmaken in de offerte gekopieerd).

### PDF-sjabloon

Een editor in dezelfde stijl als die van het contract en de transporten: achtergrond (PDF/PNG/JPG) uploaden,
velden op de pagina slepen, lettergrootte/vet/uitlijning, voorbeeld met voorbeeldgegevens. Eén A4-pagina, net als
het transportsjabloon. *(Mijn keuze: de bestaande editors zijn ook één pagina; meer pagina's kan later.)*
Beschikbare velden (bronnen) voor de klant-PDF:

- offertenummer, offertedatum, geldig tot
- klant: naam/bedrijfsnaam, contactpersoon, adres, postcode, plaats, e-mail (bij prospect: wat ingevuld is)
- auto: merk, model, uitvoering, kenteken, levertijd
- gekozen variant: looptijd (maanden), km per jaar, **leaseprijs per maand excl. btw**
- meerkilometerprijs, minderkilometerprijs
- bedrijfsgegevens zoals de andere sjablonen ze al hebben, handtekening verhuurder als die al als bron bestaat

Bewust **geen** bronnen voor afschrijving, rente, marge, ROB, verzekering, wegenbelasting, overige kosten,
aanschafwaarde, restwaarde of andere varianten (anti-doel). Er komt een standaardsjabloon mee zodat PDF maken
meteen werkt.

## Wat er vastligt aan de techniek

Gevonden in de code (2026-10-27); de bouwer bevestigt het bij het plannen.

- **Opslag:** nieuwe tabellen voor offertes, varianten, bijlagen, instellingen en het sjabloon (+ achtergronden),
  in `shared/schema.ts`. Bedragen als numeric. Productie-migraties zijn additief: nieuwe tabellen via
  `schema-columns.json` / `startup-migration.js` (`createTableIfNotExists` als er FK's, indexen of een
  standaardsjabloon nodig zijn). Niets bestaands wordt gewijzigd of verwijderd.
- **Berekening** in een gedeeld bestand (bijv. `shared/lease-quote-calc.ts`) dat client (live meerekenen) en
  server (opslaan, PDF) allebei gebruiken, met unit-tests waaronder het Excel-voorbeeld. De server rekent de
  bewaarde uitkomst zelf na; hij vertrouwt geen totaal van de client.
- **Sjabloon:** volgt het patroon van `transport_report_templates` (eigen tabel + achtergrondbibliotheek, eigen
  editorcomponent, generator in `server/utils/pdf-generator.ts`). De subagent vond de plekken die een
  sjabloontype opsommen (schema, storage, routes, body-limits, stored-path-guard, recycle-bin-purge,
  startup-migration, locales, document-types, tests); die moeten allemaal worden bijgewerkt.
- **Scanner:** een eigen scanner `server/utils/dealer-quote-scanner.ts` naar het voorbeeld van
  `server/utils/fine-scanner.ts` (Gemini, eigen prompt en responseSchema). De factuurscanner niet aanpassen.
- **Uploads:** dealerbestanden onder de uploads-map in een eigen submap per offerte, met dezelfde
  beveiligingscontroles als de andere uploads (`createSecureMulterFilter`, `validateFileBuffer`,
  `assertWithinUploads`). Bestanden alleen te openen met het rolrecht Lease offertes.
- **Rolrecht:** nieuw recht in `UserPermission`, label in `permission-labels.ts`, pagina in `page-access.ts`,
  niet in de manager-preset (alleen beheerders hebben het, en die mogen alles al). Alle API-routes achter
  `hasPermission(<nieuw recht>)`.
- **Menu:** item in `NAV_ITEMS` met icoon; label in alle 7 talen (`client/src/locales/*/nav.json` en een nieuwe
  namespace voor de module, opgenomen in `i18n.ts`); de pariteitstest moet groen blijven.
- **Geschiedenis:** offertes krijgen een Geschiedenis-knop via het bestaande auditsysteem
  (`TRACKED_RESOURCES`, `HISTORY_PERMISSIONS` server en client, `RecordHistoryResourceType`, labels).
- **Offertenummer:** oplopend per jaar, bijv. `LO-2026-0001`. *(Mijn keuze.)*
- **Kopiëren:** maakt een nieuwe offerte (nieuw nummer, status Concept, datum vandaag, nieuwe geldig tot) met
  alle velden en varianten; bijlagen worden niet meegekopieerd. *(Mijn keuze.)*
- **Verwijderen:** via de bestaande prullenbak als dat past in het bestaande patroon; anders met bevestiging.
- **Handleiding:** een hoofdstuk in de in-app handleiding, eenvoudig Nederlands met een plaatje bij elke stap
  (zoals Kees de handleiding wil).

## Aan de bouwer overgelaten

- Exacte tabel- en kolomnamen, route-indeling, componentindeling.
- Hoe de vergelijkingstabel er precies uitziet op een smal scherm.
- Hoe de bewaarde PDF's technisch worden opgeslagen (eigen bijlagentabel per offerte ligt voor de hand;
  `registerGeneratedDocument` koppelt aan voertuig/reservering, wat hier meestal niet bestaat).
