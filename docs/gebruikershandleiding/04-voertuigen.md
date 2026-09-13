# 4. Voertuigen

Het wagenpark staat op het scherm **Voertuigbeheer**. Hier zoek je een auto op, kijk je wat er
mee aan de hand is, houd je de APK bij, druk je sleutellabels af en haal je een auto uit de
verhuur.

Eén regel om te onthouden: **werk altijd op kenteken.** Merk en model komen tientallen keren voor
in het park; het kenteken maar één keer.

---

## 4.1 Het wagenpark doorzoeken

1. Klik links op **Voertuigen**. Je komt op **Voertuigbeheer**, met daaronder het kaartje
   **Voertuigenpark**.
2. Typ in **Zoeken op kenteken, merk of model...** wat je zoekt. De lijst filtert meteen mee.
   Met het kruisje ernaast wis je de zoekterm.
3. Met **Sorteren op:** kies je de volgorde: **Standaard (ID)**, **Kenteken**, **Merk**,
   **APK-datum (eerst vroegste)**, **APK-datum (eerst laatste)**, **Beschikbaarheid (beschikbaar
   eerst)**, **Beschikbaarheid (gereserveerd eerst)**, **Reparatie nodig**, **Opnaam**, **BV** of
   **Niet opgegeven**.
4. Met **Filter functies** zoek je op uitrusting. In het vakje **Filter op functies** vink je aan
   wat de auto moet hebben: **Toegang milieuzone**, **Move IZI**, **GPS**, **GPS gewisseld**,
   **Stoelhoezen**, **Achteruitrijsignalering** of **Reservesleutel**. Kies met **Alles
   geselecteerd** of **Iets geselecteerd** of de auto álles moet hebben of één van de
   aangevinkte dingen. **Wissen** zet het filter uit.

De tabel heeft de kolommen **Acties**, **Kenteken**, **Merk**, **Model**, **Type**, **Status**,
**Registratie**, **GPS**, **Radiocode**, **Bandenmaat** en **APK verloopt**.

- **Registratie** toont **Opnaam** of **BV** met *Sinds: <datum>*, of **Niet opgegeven**.
- **APK verloopt** toont de datum met eronder hoeveel dagen er nog zijn, of *… dagen te laat*.
  Is er geen datum, dan staat er **Niet ingesteld**.
- Onbekende waarden tonen **N.v.t.**

Per regel staan de knoppen **Bekijken**, een potlood (bewerken), een prullenbak (verwijderen) en
daarachter **Reserveren** of **Verhuur bekijken**. Bij een auto die op *niet voor verhuur* staat,
is **Reserveren** grijs met de tekst *Voertuig is niet beschikbaar voor verhuur*.

---

## 4.2 Een voertuig bekijken

Klik op **Bekijken**. Je krijgt **Voertuiggegevens - <merk> <model> (<kenteken>)**.

Bovenin staan de barcode van de auto (bijvoorbeeld *VEH-001821*) met de knoppen
**Sleutellabel** en **Reservesleutel-label**, en daarnaast:

**Terug · Barcode bekijken · Bewerken · Brandstofstatus bijwerken · Verwijderen · Nieuwe
reservering**

Daaronder zes tegels: **Voertuigtype**, **Huidige kilometerstand**, **Huidig brandstofniveau**,
**APK-vervaldatum** (met het aantal dagen), **Garantievervaldatum** en de statusinformatie.

En zes tabbladen:

| Tabblad | Wat je er ziet |
|---|---|
| **Algemeen** | Basisinformatie, techniek, datums, status en uitrusting |
| **Kosten** | Alle kosten die op deze auto zijn geboekt |
| **Documenten** | Alles wat bij deze auto is opgeslagen, plus de schadechecks |
| **Reserveringen** | De verhuurgeschiedenis |
| **Onderhoud** | APK, garantie en de volgende onderhoudsbeurt |
| **Geschiedenis** | Wie wat wanneer aan deze auto heeft gewijzigd |

> **Beperking:** een paar waarden op dit scherm staan in het Engels omdat ze rechtstreeks uit de
> database komen, bijvoorbeeld het brandstofniveau (*Full* in plaats van *Vol*). De betekenis is
> dezelfde.

---

## 4.3 Een voertuig toevoegen

Vul minstens **Kenteken**, **Merk** en **Model** in en klik onderaan op **Voertuig toevoegen**.
De datumvelden mag je leeg laten; een leeg datumveld betekent gewoon "geen datum".

Is er toch iets mis, dan zie je dat: boven de knoppen verschijnt een rood blok **Het formulier is
nog niet compleet** met per veld wat eraan mankeert, plus dezelfde melding als tegel rechtsboven.
De knop doet dus nooit meer "niets".

> **Tip:** heb je meerdere auto's tegelijk, gebruik dan **Bulk importeren** (4.4). Dat haalt de
> gegevens meteen bij de RDW op.

Wat je in het formulier wél kunt gebruiken, is het opzoeken bij de RDW:

1. Klik rechtsboven op **Voertuig toevoegen**.
2. Typ het kenteken in het veld bovenaan.
3. Klik op **Opzoeken**. Er staat bij: *Voer het kenteken in en klik op "Opzoeken" om
   voertuiggegevens automatisch aan te vullen vanuit de RDW-database.*
4. Wordt de auto gevonden, dan vult de app merk, model, voertuigtype, brandstof, chassisnummer,
   APK-datum en bouwdatum zelf in. Je krijgt **Voertuiggegevens gevonden** —
   *Voertuiggegevens succesvol opgehaald uit de RDW-database.*
5. Wordt de auto niet gevonden, dan staat er **Voertuig niet gevonden** — *Geen voertuig gevonden
   met dit kenteken in de RDW-database. Controleer het kenteken en probeer het opnieuw.*
   Controleer dan de schrijfwijze van het kenteken.

Andere meldingen die je kunt krijgen: **Kenteken vereist**, **Service time-out** (*De
RDW-service reageert te langzaam*), **Service niet beschikbaar** en **Opzoeken mislukt**. In alle
gevallen: probeer het later nog eens of typ de gegevens zelf in.

Sluit het venster met **Annuleren**.

---

## 4.4 Bulk importeren — ook voor één auto

1. Klik rechtsboven op **Bulk importeren**. Het venster **Voertuigen bulk importeren** opent,
   met twee tabbladen: **Handmatig invoeren** en **CSV uploaden**.

### Tabblad "Handmatig invoeren"

Dit is de snelste manier, ook voor één auto.

2. Typ in het veld **Kentekens** één kenteken per regel, of scheid ze met komma's. Er staat bij:
   *Voorbeeldformaten: "AA-BB-12" of "AABB12" of "12-ABC-3"*.
3. Klik op **Import starten**. De knop verandert in *Import verwerken...*
4. De app zoekt elk kenteken op bij de RDW en legt het voertuig aan.

Laat je het veld leeg, dan meldt de app **Geen kentekens gevonden** — *Voer minstens één geldig
kenteken in.*

### Tabblad "CSV uploaden"

Heb je een lijst van de leverancier, gebruik dan dit tabblad.

2. Sleep het bestand naar het vak **Sleep je bestand hierheen**, of klik op **Bestanden
   doorzoeken**. CSV en Excel (.xlsx, .xls) kunnen allebei.
3. De eerste rij moet kolomkoppen bevatten. Het verwachte formaat staat in het venster:
   *Eerste rij: kolomkoppen (Kenteken, Merk, Model, Voertuigsoort, Brandstof, Bedrijf, Op naam,
   Chassisnummer, Productie datum)* en *Volgende rijen: voertuiggegevens*.
4. Je krijgt eerst **Importgegevens voorbeeld** te zien met alle rijen. Rijen zonder kenteken
   krijgen een rode achtergrond met een waarschuwingsdriehoekje.
5. Controleer de lijst en klik op **Import bevestigen (<aantal> voertuigen)**, of ga met **Terug**
   naar het bestand.

### Het resultaat lezen

Na de import zie je het kaartje **Importresultaten** met de regel *<aantal> voertuigen succesvol
geïmporteerd, <aantal> mislukt.* Daaronder staan twee blokken:

- **Succesvol geïmporteerd (n)** — per regel `KENTEKEN - Merk Model`. Kon de RDW het kenteken
  niet vinden, dan staat er als extra regel: *Niet gevonden bij de RDW; alleen het kenteken is
  opgeslagen.* De auto is dan wél aangelegd, maar met merk en model op *Unknown*. Werk hem
  daarna bij met **Bewerken**.
  Wijken jouw kolommen af van wat de RDW zegt, dan staat er *Afwijkingen ten opzichte van de
  RDW:* met per veld wat er in het blad stond en wat de RDW weet. De RDW-waarde wordt gebruikt.
- **Mislukte imports (n)** — per regel `KENTEKEN - reden`. Deze redenen zijn Engels:

| Melding | Betekenis |
|---|---|
| *License plate is required* | De regel heeft geen kenteken |
| *Vehicle already exists* | Dit kenteken staat al in het park |
| *… is not a date we can read (use dd-mm-yyyy or yyyy-MM-dd)* | Een datum in die regel is onleesbaar |
| *Unknown error* | Onbekende fout; probeer die regel los opnieuw |

Een afgekeurde regel houdt de rest niet tegen: de andere rijen worden gewoon geïmporteerd. Er is
geen categorie "overgeslagen" — een regel lukt of hij lukt niet.

Je krijgt ook de melding **Import voltooid** — *<aantal> voertuigen succesvol geïmporteerd.
<aantal> mislukt.*

---

## 4.5 Een voertuig bijwerken

1. Klik in de lijst op het potloodje, of open de auto met **Bekijken** en klik op **Bewerken**.
2. Het venster **Voertuig bewerken** opent — *Werk voertuiginformatie en -gegevens bij*. Boven de
   tabbladen staat weer het kenteken met **Opzoeken** (4.3).
3. Vul aan wat nodig is en klik onderaan op **Voertuig bijwerken**.

Je krijgt **Voertuig succesvol bijgewerkt** — *Het voertuig in je vloot is bijgewerkt.*

De vijf tabbladen:

| Tabblad | Wat erin staat |
|---|---|
| **Algemeen** | **Merk**, **Model**, **Voertuigtype**, **Chassisnummer**, **Aangepast voertuigtype** en **Beschikbaarheidsstatus** |
| **Technisch** | **Brandstoftype**, **Aanbevolen olie**, **Onderhoudsinterval (km)** en **(maanden)**, **AdBlue**, **GPS** en **IMEI-nummer**, **Pechhulp**, **Reservesleutel** (en of die bij de klant ligt), **Winterbanden**, **WOK-melding**, **Stoelhoezen**, **Achteruitrijsignalering**, **Reserveband**, **Boordgereedschap & krik**, **Bandenmaat** en **Radiocode** |
| **Datums** | **APK-vervaldatum**, **Vervaldatum garantie**, **Bouwdatum**, de **Registratiestatus** (Opnaam of BV, met datum), **Vervaldatum Euro-zone**, **Toegang milieuzone**, **Move IZI** |
| **Contract** | **Maandprijs (€)**, **Dagprijs (€)** en **Retourkilometerstand (km)** |
| **Overig** | **Interne afspraken** en **Opmerkingen** |

**Verplicht zijn kenteken, merk en model.** Ontbreekt er één, dan meldt de app *Vul alle
verplichte velden in: kenteken, merk en model.* Onder het veld zelf staat de Engelse tekst
*License plate is required*, *Brand is required* of *Model is required*.

**De dagprijs telt bij het boeken.** Vul je op het tabblad **Contract** een **Dagprijs (€)** in,
dan rekent de app bij een nieuwe reservering het totaalbedrag zelf uit (hoofdstuk 5.3). Zonder
dagprijs blijft het bedrag op nul staan en moet je het handmatig invullen.

**Opmerkingen worden aan de balie getoond.** Wat je op het tabblad **Overig** in **Opmerkingen**
zet, verschijnt bij het ophalen in een apart venster dat de medewerker moet bevestigen
(hoofdstuk 5.7). Gebruik dat veld dus voor dingen die de klant echt moet weten — een bekende
kras, een klemmende schuifdeur — en niet voor kantoornotities. Die horen bij **Interne
afspraken**.

---

## 4.6 De statussen en wat ze betekenen voor beschikbaarheid

Een voertuig heeft **twee** aparte statussen. Ze doen allebei iets anders.

### A. De beschikbaarheidsstatus

Dit is de status die je in de lijst ziet en die je op het tabblad **Algemeen** instelt onder
**Beschikbaarheidsstatus**.

| Status | Wat het betekent | Kun je hem verhuren? |
|---|---|---|
| **Beschikbaar** | De auto staat klaar | Ja |
| **Gepland** | Er ligt een reservering op | Ja, buiten die periode |
| **Verhuurd** | De auto is opgehaald en staat bij een klant | Nee |
| **Reparatie nodig** (in het formulier: **Moet gerepareerd worden**) | Er is iets kapot | Nee |
| **Niet voor verhuur** | De auto is bewust uit de verhuur gehaald | Nee |

In de lijst kom je ook combinaties tegen: **Vervangend voertuig**, **Vervangend voertuig
(actief)**, **Gepland (vervanger toegewezen)**, **Reparatie nodig (vervanger toegewezen)** en
**Verhuurd (vervanger toegewezen)**. Die vertellen je dat de auto als vervanger is ingezet
(hoofdstuk 7).

Op het scanscherm heten dezelfde statussen net iets anders: **Beschikbaar**, **Gereserveerd**,
**Verhuurd**, **In reparatie** en **Niet voor verhuur** (hoofdstuk 18).

De status wijzigen doe je met **Bewerken** → tabblad **Algemeen**, of op de voertuigkaart met de
knop **Wijzigen** bij het blok **Beschikbaarheidsstatus**. Zet een auto **nooit** met de hand op
**Verhuurd**: dat doet het ophaalproces voor je, samen met het contractnummer en de
kilometerstand. De app waarschuwt daar ook voor met **Geen actieve reservering** of
**Reservering nog niet opgehaald**.

### B. De onderhoudsstatus (de werkplaatsvlag)

Daarnaast heeft de auto een onderhoudsstatus: in orde, **Onderhoud nodig** of **In onderhoud**.
Die zie je terug op het scanscherm en in het oranje blok **Onderhoud** daar.

**Deze vlag blokkeert de uitgifte.** Staat hij aan, dan weigert de app het ophalen met de
melding:

> *This vehicle is in the workshop and cannot be handed over. Close the workshop job first, or
> have an administrator force the handover with a reason.*

Dat is bewust: een auto die kapot naar binnen ging, mag er niet stilletjes weer uitkomen. Je
zet de vlag om met **Voertuig markeren voor onderhoud** en **Terug van onderhoud** (hoofdstuk 7),
of vanaf het scanscherm met **Onderhoud inplannen** en **Terug uit onderhoud** (hoofdstuk 18).

> **Let op — dit zijn twee aparte knoppen voor twee aparte statussen.** **Terug uit onderhoud**
> haalt alleen de werkplaatsvlag eraf. De **Beschikbaarheidsstatus** blijft daarna op **Reparatie
> nodig** staan, en dan is de auto nog steeds niet te verhuren. Zet die er zelf met **Bewerken**
> weer op **Beschikbaar**. Zie hoofdstuk 7.7.

> **Een beheerder kan de uitgifte forceren.** Weigert de app het ophalen, dan opent het venster
> **Uitgifte geblokkeerd**. Ben je beheerder, dan staat daar een veld **Reden voor het forceren**
> en de knop **Toch uitgeven**; de reden komt in de notities van de reservering. Ben je dat niet,
> dan is de werkplaatsstatus vrijgeven de weg. Zie 5.6.

### Wat "beschikbaar" precies betekent

Een auto telt als **beschikbaar** wanneer hij in de gevraagde periode vrij is **én** zijn status
in orde is: geen overlappende reservering, niet in onderhoud, niet op *niet voor verhuur*, niet
verwijderd. Die definitie geldt overal hetzelfde — op het dashboard, in het boekingsformulier en
in de tellingen.

**Eén uitzondering om te kennen:** een auto met een *gepland* onderhoudsblok staat nog steeds in
de keuzelijst van het boekingsformulier. Je mag hem bewust boeken; je krijgt dan een gele
waarschuwing met de onderhoudsperiode erbij (hoofdstuk 5.3).

---

## 4.7 APK en garantie

**Waar je de datums invult:** **Bewerken** → tabblad **Datums** → **APK-vervaldatum** en
**Vervaldatum garantie**.

**Waar je ze terugziet:**

- In de lijst, kolom **APK verloopt**, met het aantal dagen of *… dagen te laat*.
- Op de voertuigkaart, tegels **APK-vervaldatum** en **Garantievervaldatum**.
- Op het tabblad **Onderhoud** van de auto, in de blokken **APK-keuring** (met **Huidige APK
  geldig tot**, **Dagen resterend** en de labels **Verlopen**, **Actie binnenkort nodig** of
  **OK**) en **Garantie-informatie**.
- Op het **Dashboard**, in de blokken **APK verloopt binnenkort** en **Garantie verloopt
  binnenkort**.
- Op de **Onderhoudskalender**, als de signalen **APK-keuring verschuldigd**, **APK Herinnering
  (2 maanden)** en **APK Herinnering (1 maand)** (hoofdstuk 7).

**Een APK-keuring inplannen.** Op het tabblad **Onderhoud** van de auto staat de knop
**APK-keuring plannen**. Je kiest een datum in de **Werkplaatskalender**, vult **Geselecteerde
datum** en **Duur (dagen)** in en klikt op **APK-keuring plannen**. Heeft de auto in die periode
een lopende verhuur, dan meldt de app **Actieve verhuur gedetecteerd** met de periode erbij en
de regel *Er is een vervangend voertuig nodig voor deze klant.* Vink dan **Vervangend voertuig
aanvragen** aan; je wijst de auto later toe (hoofdstuk 7).

**Een verlopen APK blokkeert het boeken niet.** Bij het maken van een reservering krijg je alleen
een rode waarschuwing: *De APK (keuring) van dit voertuig is verlopen op <datum>. Bevestig dat
het veilig en legaal is om te verhuren voordat je verdergaat.* Verhuur zo'n auto niet; laat hem
eerst keuren.

**De RDW-scan.** Op het **Dashboard** staat onder **Snelle acties** de knop **RDW APK-datums
scannen**. Die haalt de APK-datums van het hele park bij de RDW op en werkt ze bij. Dat loopt op
de achtergrond en is werk voor wie het wagenpark bijhoudt, niet voor de balie.

---

## 4.8 De kilometerstand

De kilometerstand wordt automatisch bijgewerkt bij het ophalen en het innemen (hoofdstuk 5). Doe
je het los, bijvoorbeeld na een werkplaatsbezoek:

1. Open de auto, of scan hem (hoofdstuk 18).
2. Klik op **Km-stand bijwerken**. Het venster **Kilometerstand bijwerken** opent, met daaronder
   *Huidige stand: <getal> km*.
3. Vul **Nieuwe kilometerstand** in en klik op **Opslaan**.

Je krijgt **Kilometerstand opgeslagen** — *Nieuwe stand: <getal> km.*

**Een lagere stand invoeren mag niet zomaar.** Typ je een stand die lager is dan de vorige, dan
verschijnt eerst een oranje regel: *Lager dan de huidige stand (<getal> km). Hiervoor is een
autorisatiewachtwoord nodig.* Ga je door, dan opent het venster **Kilometerstand-overschrijving
vereist** met de huidige stand, de nieuwe stand en het verschil, en moet je **je eigen
accountwachtwoord** invullen en op **Overschrijving bevestigen** klikken.

Heb je dat recht niet, dan meldt de app: *Je hebt geen recht om een verlaging van de
kilometerstand te autoriseren. Vraag iemand met het recht 'authorize_mileage_decrease'.* Haal er
dan een collega bij.

Waarom zo streng: de kilometerstand bepaalt de afrekening en het onderhoudsmoment. Een stand
omlaag zetten kan alleen een fout herstellen, en dat moet je kunnen terugvinden. Een té hoge
stand wordt overigens niet tegengehouden — lees de teller dus twee keer af.

---

## 4.9 Brandstof en tanken

Klik op de voertuigkaart op **Brandstofstatus bijwerken**, of gebruik **Tanken** op het
scanscherm. In het venster **Brandstofstatus bijwerken** vul je in:

- **Brandstofniveau** — van **Leeg** tot **Vol**; de huidige stand staat erbij.
- **Tankkosten (€)**.
- **Bon (optioneel)** — met **Bon uploaden**.
- **Notities (optioneel)**.

Vul je niets in, dan meldt de app *Geef minstens één veld op om bij te werken.*

---

## 4.10 Documenten bij een voertuig

Op de voertuigkaart, tabblad **Documenten**, staat het kaartje **Voertuigdocumenten** — *Alle
documenten met betrekking tot dit voertuig*.

- Onder **Snel uploaden categorieën** staan de knoppen **APK-keuring**, **Contract**,
  **Schaderapport**, **Voertuigfoto's** en **Onderhoud**. Klik op de categorie die past, kies het
  bestand, klaar.
- Daarboven staat het blok **Interactieve schadechecks** met de knop **Nieuwe check**. Per check
  zie je het label **Ophalen** of **Inleveren**, wie hem maakte, de kilometerstand, de brandstof
  en de knop **PDF**.
- Een document verwijderen vraagt om bevestiging: *"Weet je zeker dat je het document "<naam>"
  wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."*

Meer over documenten, sjablonen en afdrukken staat in hoofdstuk 8.

---

## 4.11 Barcode, sleutellabel en sleutelkast

Elke auto heeft een eigen barcode, in de vorm **VEH-000123**. Die staat op het sleutellabel dat
aan de sleutelbos hangt. Scannen is het snelste en veiligste pad in de app: je kunt er niet de
verkeerde auto mee pakken.

**Het label bekijken en afdrukken**

1. Open de auto met **Bekijken**.
2. Klik op **Barcode bekijken**. Het venster **Voertuigbarcode** opent.
3. Kies bij **Labelsjabloon** de indeling die bij jullie labelprinter hoort.
4. Klik op **Sleutellabel afdrukken** of op **Reservesleutel-label afdrukken**.

De reservesleutel krijgt een eigen label; de code eindigt dan op **-S**. Zo weet de sleutelkast
het verschil tussen de hoofdsleutel en de reserve.

**Een barcode opnieuw genereren** doe je alleen als het label onleesbaar of kwijt is. De app
waarschuwt: *"De oude barcode (<code>) werkt daarna niet meer. Reeds afgedrukte labels moeten
opnieuw worden afgedrukt. Deze actie kan niet ongedaan worden gemaakt."*

**Alle labels tegelijk** druk je af met de knop **Barcodeboek** rechtsboven op het scherm
**Voertuigbeheer** — *Druk alle voertuigbarcodes af voor in een map of klapper.* Je kiest een
**Labelsjabloon**, filtert eventueel op status, en klikt op **Alles afdrukken (…)**,
**Gefilterde afdrukken (…)**, **Selectie afdrukken** of **Stickers afdrukken**.

**De sleutelkast nalopen** doe je met **Sleutelkast-audit** en **Reservesleutelkast-audit**.
Uitgebreid in hoofdstuk 18.

---

## 4.12 Een voertuig verwijderen en terugzetten

1. Klik in de lijst op het prullenbakje, of open de auto en klik op **Verwijderen**.
2. Het venster **Voertuig verwijderen** opent: *"Je staat op het punt om <merk> <model> te
   verwijderen met kenteken <kenteken>."*
3. De app zoekt uit wat eraan hangt (*Controleren wat aan dit voertuig gekoppeld is...*) en toont
   dan een oranje blok **Dit verwijdert ook:** met per soort een regel, bijvoorbeeld
   *1 reserveringen* en *1 documenten*. Hangt er niets aan, dan staat er *Er is niets anders aan
   dit voertuig gekoppeld.* Daaronder: *Een beheerder kan het daarna terugzetten vanuit de
   prullenbak op de voertuigenpagina.*
4. Typ het kenteken over in het veld **Typ <kenteken> om te bevestigen**. Zolang dat niet klopt,
   blijft de knop grijs. Dat overtypen is de rem: je verwijdert nooit per ongeluk de regel
   erboven.
5. Klik op **Voertuig verwijderen**.

Je krijgt **Voertuig verwijderd** — *<merk> <model> is verwijderd. Een beheerder kan het
terugzetten vanuit de prullenbak.*

**De app weigert bij een lopende of geplande huur.** Je krijgt dan een rood blok in hetzelfde
venster:

> *Verwijderen kan niet: dit voertuig heeft een lopende of geplande huur.*
> *Reservering #3366 — 2026-09-13 t/m 2026-09-25 (picked_up)*
> *Rond de huur af of annuleer hem eerst; daarna kan het voertuig naar de prullenbak.*

De blokkerende huren staan er dus bij, met hun periode. De status achter de periode is Engelse
technische tekst (*booked*, *picked_up*). De knop blijft grijs tot je die huren hebt afgerond of
geannuleerd.

### De prullenbak

De knop **Verwijderde voertuigen** rechtsboven op **Voertuigbeheer** is de prullenbak. **Alleen
een beheerder ziet die knop.**

De naam is misleidend: het venster toont **alle** verwijderde records. Per regel zie je een label
**Voertuig**, **Klant**, **Reservering**, **Transport** of **Boete**, de omschrijving van het
record, de regel *Verwijderd <datum> door <naam>* en *Bevat: <wat er aan hing>* (of *geen
gekoppelde records*).

1. Zoek de regel, eventueel met het zoekveld *Zoeken op kenteken, omschrijving of naam…*
2. Klik op **Terugzetten**.

Je krijgt **Teruggezet** met een bevestiging erbij. Het record staat weer op zijn plek, met alles
wat eraan hing. Een record dat al teruggezet is, krijgt het groene label **Teruggezet** en de
knop wordt grijs.

Twee dingen om te weten:

- Een verwijderde **reservering** en een verwijderd **transport** komen hier ook in te staan, en
  zijn dus terug te halen — ook al zegt het verwijdervenster van een reservering iets anders.
- Zit er inmiddels een andere auto op hetzelfde kenteken, dan lukt terugzetten niet: *A vehicle
  with the same license plate already exists. Delete or rename it first.*

> **Beperking:** de prullenbak kan niet geleegd worden en toont de honderd meest recente regels.

---

## 4.13 Snel naslaan

| Wat je wilt | Waar |
|---|---|
| Een auto zoeken | **Voertuigen** → **Zoeken op kenteken, merk of model...** |
| Een auto bekijken | **Bekijken** |
| Een nieuwe auto aanleggen | **Voertuig toevoegen**, of **Bulk importeren** → **Handmatig invoeren** voor meerdere tegelijk |
| Gegevens aanvullen | **Bewerken** |
| APK-datum invullen | **Bewerken** → **Datums** → **APK-vervaldatum** |
| Kilometerstand bijwerken | **Km-stand bijwerken** (of via **Scannen**) |
| Tanken vastleggen | **Brandstofstatus bijwerken** |
| Sleutellabel afdrukken | **Bekijken** → **Barcode bekijken** → **Sleutellabel afdrukken** |
| Alle labels afdrukken | **Barcodeboek** |
| Een auto uit de verhuur halen | **Bewerken** → **Beschikbaarheidsstatus** → **Niet voor verhuur** |
| Een auto verwijderen | Prullenbakje in de lijst; kenteken overtypen |
| Iets terugzetten | Beheerder: **Verwijderde voertuigen** → **Terugzetten** |
