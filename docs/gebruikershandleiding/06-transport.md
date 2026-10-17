# 6. Transport

Een **transport** is elke verplaatsing van een auto die geen gewone verhuring is: een auto
wegbrengen, een wissel bij de klant, een sleepactie, een auto terughalen of een bezorging.

Je legt het vast omdat er iemand mee op pad gaat, er kilometers en tol tegenover staan, en omdat
de klant vaak een vervangende auto nodig heeft zolang de zijne weg is.

---

## 6.1 Het transportdashboard

Klik links op **Transporten**. Je komt op het **Transportdashboard** — *Leveringen, wissels,
sleepacties, inbeslagnames en andere voertuigbewegingen — leveringen zijn ook transporten*.

Bovenaan staan drie kaartjes: **Aankomend transport** (het eerstvolgende), **Laatste transport**
(het laatst afgeronde) en een blokje met vier tellers: **Wacht op planning**, **Klaar voor
levering**, **In uitvoering** en **Leveringen voltooid**. Rechtsboven staat
**Route-optimalisatie** (6.8).

Daaronder staan de tabbladen, met per tabblad het aantal:

**Alle transporten (…) · Voertuigwissel (…) · Slepen (…) · Terughalen (…) · Levering (…) ·
Overig (…)**

En dan de tabel **Voertuigtransporten** met een zoekveld **Transporten zoeken...**, het filter
**Alle statussen** (**Gepland**, **Bezig**, **Voltooid**, **Geannuleerd**) en de knop **Nieuw
transport**.

De kolommen zijn: een selectievakje, **Afdrukken / rapport genereren**, **Voertuig**, **Vervangend
voertuig**, **Type**, **Route**, **Datum**, **Afstand / tol**, **Facturatie**, **Status** en
**Acties**. Klik op een kolomkop om op die kolom te sorteren; nog een klik draait de volgorde om.
Een klik ergens op een regel opent het transport (hetzelfde als **Bekijken**).

![Het Transportdashboard met Route-optimalisatie (1), Verwijderde transporten (2), de tabbladen (3), het zoekveld (4) en Nieuw transport (5)](afbeeldingen/06-transportdashboard-knoppen.png)
*Het **Transportdashboard**: 1 **Route-optimalisatie**, 2 **Verwijderde transporten**, 3 de tabbladen
per soort, 4 het zoekveld, 5 **Nieuw transport**.*

- **Vervangend voertuig** toont het kenteken met de stand van zaken: **TBD**, **Toegewezen**,
  **Opgehaald** of **Teruggebracht**. Bij **TBD** staat er een knopje **Selecteren** bij (met de
  muis erop lees je *Vervangend voertuig selecteren*).
- **Facturatie** toont **Gefactureerd**, **Niet gefactureerd** of **Niet factureerbaar**.
- **Status** is **Gepland**, **Bezig**, **Voltooid** of **Geannuleerd**.
- Een auto die niet van ons is, krijgt het label **Extern**.
- Bij **Route** staat *van → naar*. Is één kant nog niet ingevuld, dan staat daar *onbekend*,
  bijvoorbeeld *Eindhoven → onbekend*, en geen vraagteken of Engels woord.

![Het transportdashboard met de tellers en de tabbladen](afbeeldingen/08-transporten.png)
*Het **Transportdashboard**: bovenaan **Aankomend transport**, **Laatste transport** en de vier
tellers, daaronder de tabbladen per soort en de tabel **Voertuigtransporten**.*

**De knoppen achter een regel** (het zijn icoontjes; de tekst zie je als je erop stilstaat):

| Knop | Waarvoor |
|---|---|
| **Bekijken** | Het transport openen |
| **Markeren als voltooid** | Het transport afronden; grijs bij *Al voltooid of geannuleerd* |
| **Vervangend voertuig markeren als opgehaald** | De vervanger is meegegeven; grijs bij *Nog geen vervangend voertuig toegewezen* |
| **Vervangend voertuig markeren als teruggebracht** | De vervanger is terug; grijs bij *Vervangend voertuig nog niet opgehaald* |
| **Afdrukken / rapport genereren** | Het transportrapport maken, zie 6.7 |
| **Bewerken** | Het transport wijzigen |
| **Verwijderen** (prullenbak) | Het transport verwijderen |

Elk icoontje heeft een naam: staat de muis erop, dan verschijnt er een tekstje, en een
schermlezer leest hem voor. Dat geldt ook voor het prullenbakje, dat vroeger geen naam had.
**Afdrukken / rapport genereren** staat vooraan in de tabel, direct na het selectievakje; de andere
knoppen staan rechts onder **Acties**.

![De tabel Voertuigtransporten met Afdrukken / rapport genereren (1), Bekijken (2), Markeren als voltooid (3), Bewerken (4) en Verwijderen (5)](afbeeldingen/06-transporttabel-knoppen.png)
*De knoppen in een regel: 1 **Afdrukken / rapport genereren**, 2 **Bekijken**, 3 **Markeren als
voltooid**, 4 **Bewerken**, 5 **Verwijderen**. De grijze knoppen ertussen zijn **Vervangend voertuig
markeren als opgehaald** en **… als teruggebracht**; die werken pas als er een vervanger is.*

Vink je meerdere regels aan, dan verschijnt bovenin een balk met **… geselecteerd**,
**Afdrukken**, **Markeer voltooid** en **Wissen**.

---

## 6.2 Een transport plannen

1. Klik op het transportdashboard op **Nieuw transport**. Het venster **Transport registreren**
   opent — *Registreer een losstaande voertuigverplaatsing — een wissel, sleepactie of
   terughaalactie — los van een normale verhuurlevering.*
2. Kies het **Type**: **Voertuigwissel**, **Slepen**, **Terughalen**, **Levering** of **Overig**.
3. Laat **Status** op **Gepland** staan.
4. Kies het **Voertuig** in het veld *Zoek en selecteer een voertuig...* Typ het kenteken en klik
   de juiste regel aan.
   - Gaat het om een auto die niet van ons is — bijvoorbeeld een ophaalactie bij een garage —
     vink dan **Extern voertuig (niet in ons wagenpark)** aan. Er staat bij: *Een voertuig van
     een klant of van buitenaf … Het wordt niet toegevoegd aan Voertuigen, alleen vastgelegd op
     dit transport.* Je vult dan zelf **Kenteken** (met **Opzoeken via RDW**), **Kleur**,
     **Merk**, **Model**, **Naam eigenaar** en **Telefoon eigenaar** in.
5. Heeft de klant een vervanger nodig, vink dan **Vervangend voertuig vereist** aan. Zie 6.4.
6. Vul de **Geplande datum** in. Dat veld is verplicht. **Voltooiingsdatum (optioneel)** laat je
   meestal leeg; die vult zichzelf als je het transport afrondt.

   ![Het venster Transport registreren met Type (1), Voertuig (2), Vervangend voertuig vereist (3) en Geplande datum (4)](afbeeldingen/06-transport-registreren.png)
   *Het venster **Transport registreren**, bovenste deel: 1 **Type**, 2 **Voertuig**, 3 **Vervangend
   voertuig vereist**, 4 **Geplande datum**.*
7. Vul onder **Van (optioneel)** en **Naar (optioneel)** het **Straatadres** en de **Plaats** in.
   Doe dat ook als het om ons eigen terrein gaat: zonder adressen kan de app geen afstand
   berekenen en staat er op het dashboard alleen een streepje.
8. Klik op **Berekenen** naast **Afstand (km) (optioneel)**. De app rekent de rijafstand uit op
   basis van de Van/Naar-adressen.
9. Klik op **Voorstellen** naast **Tolkosten (€) (optioneel)**. De app rekent met een vast tarief
   per kilometer (*€0.15/km — instelbaar in Instellingen*). Gaat de chauffeur leeg terug, vink
   dan **Retour — voorstel omvat de lege terugrit** aan.

   ![Het middelste deel van Transport registreren met Van (1), Naar (2), Berekenen (3) en Voorstellen (4)](afbeeldingen/06-transport-registreren-adres.png)
   *Adressen en kosten: 1 **Van**, 2 **Naar** (straat en plaats), 3 **Berekenen** voor de afstand,
   4 **Voorstellen** voor de tolkosten.*
10. Moet de klant dit transport betalen, zet dan **Doorbelasten aan klant** aan — *Breng dit
    transport in rekening bij de klant, los van wat het ons aan tol heeft gekost*. Kies de
    **Klant** en vul het **Te factureren bedrag (€)** in. Is de rit al gefactureerd, zet dan
    **Al gefactureerd aan de klant** aan.
11. Vul **Chauffeur (optioneel)** in — *Wie voerde het transport uit*. Dit is een vrij tekstveld
    voor de naam van de rijder.
12. Zet zo nodig iets in **Reden (optioneel)** (*bijv. Niet-betaling, pech*) en **Notities
    (optioneel)**.
13. Klik op **Transport registreren**.

    ![Het onderste deel van Transport registreren met Doorbelasten aan klant (1), Chauffeur (2) en de knop Transport registreren (3)](afbeeldingen/06-transport-registreren-opslaan.png)
    *Onderaan: 1 **Doorbelasten aan klant**, 2 **Chauffeur (optioneel)**, 3 **Transport registreren**.*

Je krijgt **Transport geregistreerd** — *De transportopdracht is geregistreerd.*

**Staat de auto uit bij een klant?** Dan verschijnt er een oranje kader: *Dit voertuig staat
momenteel uit bij <klant>. Als dit transport het voertuig buiten dienst stelt, heeft die klant
waarschijnlijk een vervangend voertuig nodig.* Met de knop **Vervangend voertuig vereist
markeren** zet je het vinkje van stap 5 meteen aan. Lees dat kader altijd: het is het enige
moment waarop de app je erop wijst dat er een klant zonder auto komt te staan.

---

## 6.3 De voertuigwissel

Een wissel is geen apart scherm: het is een transport met **Type = Voertuigwissel**. De opbouw is
altijd dezelfde:

- het **Voertuig** is de auto die weggaat;
- het **Vervangend voertuig** is de auto die ervoor in de plaats komt.

Het transport verandert niets aan de auto's zelf: het legt alleen de beweging vast. Wat er met de
lopende huur en het onderhoud moet gebeuren, regel je in hoofdstuk 5 en 7.

Is de wissel voor onze eigen rekening — pech of onderhoud — zet dan **Pech- of onderhoudswissel**
aan. Er staat bij: *Onze eigen kosten, niet die van de klant — standaard niet gefactureerd.* Wil
je hem toch doorbelasten, zet dan daarnaast **Doorbelasten aan klant** aan.

---

## 6.4 Het vervangend voertuig en de TBD-placeholder

Vink je bij het plannen **Vervangend voertuig vereist** aan, dan verschijnt een extra veld. Er
staat bij: *Het voertuig van dit transport heeft een vervanger nodig. Je kunt het vervangend
voertuig als TBD (nog te bepalen) laten staan en later toewijzen, op elk moment vóór het
transport plaatsvindt.*

**Meteen een auto kiezen.** Klik op *Zoek en selecteer het vervangend voertuig...* en kies. Het
label verandert dan in **Vervangend voertuig (het voertuig dat als vervanger wordt ingezet)**.
Alleen auto's die op de geplande datum vrij zijn, staan in de lijst.

**Of laat het leeg — de TBD-placeholder.** Laat je het veld leeg, dan staat er **Vervangend
voertuig (TBD — nog niet geselecteerd)** en krijgt het transport op het dashboard het oranje
label **TBD**. Dat is bewust mogelijk: je weet op het moment van plannen vaak nog niet welke auto
er vrij is, en je wilt de afspraak toch al vastleggen.

Met het kruisje achter een gekozen auto (*Wissen (terug naar TBD)*) zet je hem weer op TBD.

![Het venster Transport registreren met het vinkje Vervangend voertuig vereist (1) aan en daaronder het veld voor de vervanger](afbeeldingen/06-vervangend-voertuig-tbd.png)
*Met **Vervangend voertuig vereist** (1) aan verschijnt het veld voor de vervanger; laat je het leeg,
dan wordt het **TBD**.*

### Later een echte auto toewijzen

Er zijn twee plekken waar dat kan:

**1. Vanaf het transportdashboard.** Klik in de kolom **Vervangend voertuig** op **Selecteren** (de
knop bij **TBD**). Het venster **Transport bewerken** opent bij het veld **Vervangend voertuig**. Kies
de auto en klik op **Wijzigingen opslaan**. Je krijgt **Transport bijgewerkt** — *De transportopdracht
is bijgewerkt.* Het label springt van **TBD** naar **Toegewezen**.

![De tabel met bij een transport zonder vervanger de knop Selecteren (1) in de kolom Vervangend voertuig](afbeeldingen/06-vervangend-voertuig-selecteren.png)
*Een transport met **TBD**: klik op **Selecteren** (1) om alsnog een auto te kiezen.*

**2. Vanuit het onderhoud.** Zie hoofdstuk 7: **Onderhoud** → **Lijstweergave** → tabblad
**Vervangers (…)** → **Toewijzen**.

> **Zonder toegewezen auto kun je geen rapport maken.** De knop **Afdrukken / rapport genereren**
> is dan grijs met de tekst: *Voor dit transport is een vervangend voertuig vereist, maar er is
> er nog geen geselecteerd. Wijs een vervangend voertuig toe voordat je de transportbrief
> genereert of afdrukt.* Logisch: de chauffeur moet weten welke auto hij meeneemt.

---

## 6.5 De transportdag

Op de dag zelf werkt de chauffeur het snelst via het scanscherm.

**Het transport starten**

1. Klik links op **Scannen**, of druk op `S`.
2. Scan het sleutellabel of typ het kenteken.
3. Onder de voertuiggegevens verschijnt het blok **Actief transport** met de route en het label
   **Gepland**.
4. Klik op **Transport starten**.

Je krijgt de melding **Transport gestart**. Het label verandert in **Onderweg**, en de knop heet
nu **Transport afronden**. Op het dashboard staat het transport op **Bezig**.

> **Let op:** het transport is alleen op het scanscherm te *starten*. Op het transportdashboard
> zit daar geen knop voor.

Staan er geen adressen bij het transport, dan toont de route *onbekend* bij de ontbrekende kant. Vul
de adressen dan alsnog in met **Bewerken**, zodat de chauffeur en de afstandsberekening kloppen.

---

## 6.6 Het transport afronden

Dat kan op drie manieren:

- **Op het scanscherm:** scan de auto en klik op **Transport afronden**. Je krijgt **Transport
  afgerond**.
- **Op het dashboard:** klik achter de regel op **Markeren als voltooid**. Er opent eerst het venster
  **Transport afronden?** — *Het transport wordt als voltooid gemarkeerd. Dat kun je daarna niet
  zomaar terugdraaien.* Je vult **Afgerond op** in (standaard vandaag) en eventueel een
  **Uitkomst**, bijvoorbeeld *auto afgeleverd, klant niet thuis, schade gemeld*. Die uitkomst wordt
  aan de notities van het transport toegevoegd, met *Uitkomst:* ervoor. Klik op **Afronden** om het
  door te zetten, of sluit het venster als je je bedacht hebt. Daarna krijg je **Transport
  gemarkeerd als voltooid**. Zit er een vervangend voertuig aan het transport, dan volgt daarna
  nog de vraag hieronder.

  ![Het venster Transport afronden? met Afgerond op, Uitkomst en de knop Afronden (1)](afbeeldingen/06-transport-afronden.png)
  *Het venster **Transport afronden?**: vul **Afgerond op** en eventueel **Uitkomst** in en klik op
  **Afronden** (1).*
- **In bulk:** vink meerdere regels aan en klik op **Markeer voltooid**. Je hebt dan zelf een
  selectie gemaakt, en er komt geen extra vraag.

De status wordt **Voltooid** en de voltooiingsdatum wordt vastgelegd.

### De vraag over de vervanger

Rond je een transport af waar een vervangend voertuig aan hangt, dan vraagt de app:

> **Vervangend voertuig markeren als opgehaald?**
> *<merk> <kenteken> is toegewezen als vervangend voertuig. Markeer het nu als opgehaald, of doe
> dit later vanuit de transportenlijst.*
> **Later** · **Nu markeren als opgehaald**

Kies **Nu markeren als opgehaald** als de klant de vervanger echt heeft meegekregen; je krijgt
dan het gewone ophaalvenster met contractnummer, kilometerstand, brandstof en schadecheck
(hoofdstuk 5, paragraaf 5.7). Kies **Later** als dat nog moet gebeuren; je kunt het dan op het
dashboard alsnog doen met de knop **Vervangend voertuig markeren als opgehaald**.

Komt de vervanger terug, dan gebruik je **Vervangend voertuig markeren als teruggebracht**. Ook
daar vraagt de app eerst: **Vervangend voertuig markeren als teruggebracht?** — *… staat nog uit
als vervangend voertuig. Markeer het nu als teruggebracht, of doe dit later vanuit de
transportenlijst.*

De vervanger doorloopt dus vier standen: **TBD** → **Toegewezen** → **Opgehaald** →
**Teruggebracht**.

---

## 6.7 Het transportrapport

Het transportrapport is het papier dat de chauffeur meeneemt: één pagina per transport, met de
auto, de route en de datum.

1. Klik op het dashboard achter de regel op **Afdrukken / rapport genereren**. Wil je er meerdere
   in één keer, vink de regels dan aan en klik bovenin op **Afdrukken**.
2. De app maakt het rapport en slaat het op. Je krijgt de melding **Rapport gemaakt** — *Het rapport
   staat in Documenten en wordt hieronder getoond.* Er verschijnt een voorvertoning met de bestandsnaam
   als titel, bijvoorbeeld *Transport_Report_HANDLEIDING_Unknown_18-09-2026_55544.pdf*, en de
   regel: *Rapport gegenereerd en opgeslagen in Documenten — hieronder bekijken en afdrukken.*
3. Klik op **Afdrukken**, of op **Sluiten** als je het alleen wilde opslaan.

Het rapport staat daarna ook bij **Documenten** (hoofdstuk 8), zodat je later kunt terugvinden
wat de chauffeur mee had.

**Wat er mis kan gaan:**

| Melding | Wat je doet |
|---|---|
| De knop is grijs met *Voor dit transport is een vervangend voertuig vereist, maar er is er nog geen geselecteerd…* | Wijs eerst een vervanger toe (6.4) |
| **Pop-up geblokkeerd** — *Sta pop-ups voor deze site toe en klik daarna opnieuw op Afdrukken.* | Zet pop-ups aan voor deze site |
| *Je browser heeft de inline voorvertoning geblokkeerd…* | Klik op **Openen in nieuw tabblad** |
| **Genereren van rapport mislukt** | Probeer het opnieuw; blijft het misgaan, meld het bij een beheerder |

Je kunt maximaal 50 transporten in één rapport zetten.

De bestandsnaam is Engels. Dat is alleen de naam van het bestand; de inhoud is Nederlands. Heeft de
auto nog geen echt merk en model (hij is een placeholder, of die velden zijn leeg), dan staat het
kenteken in de bestandsnaam. Eerder stond daar *Unknown_Unknown*.

---

## 6.8 Route-optimalisatie

Heb je meerdere ritten op één dag, dan kun je de volgorde laten uitrekenen.

1. Klik rechtsboven op **Route-optimalisatie**. Het venster **Routeoptimalisatie** opent — *Plan
   een efficiënte bezoekvolgorde voor de leveringen en transporten van een dag, met echte
   rijafstanden.*
2. Kies de **Datum**.
3. Klik op **Route optimaliseren**.

![Het venster Routeoptimalisatie met het datumveld (1) en de knop Route optimaliseren (2)](afbeeldingen/06-routeoptimalisatie.png)
*Het venster **Routeoptimalisatie**: 1 kies de **Datum**, 2 klik op **Route optimaliseren**.*

Is de knop grijs, dan staat er onder het venster waarom: *Er is op deze datum niets gepland. Kies
een andere datum.* of *Geen van de geplande ritten heeft een adres of plaats. Vul die eerst in.*

Je krijgt de voorgestelde volgorde met de **Totale afstand**, en met de knop **Openen in Google
Maps (nieuw tabblad)** zet je de route op de kaart. Staat er *(schatting in rechte lijn)* bij,
dan ontbraken er adressen en is de afstand een ruwe schatting.

---

## 6.9 Een transport wijzigen, verwijderen en terugzetten

**Bekijken.** Klik achter een regel op **Bekijken**. Je ziet alle gegevens op een rij: **Type**,
**Status**, **Vervangend voertuig**, **Route**, **Datum**, **Voltooiingsdatum**, **Afstand**,
**Tolkosten**, **Facturatie**, **Klant**, **Chauffeur**, **Reden** en **Notities**. Hoort het
transport bij een reservering, dan staat er **Levering vanuit reservering #…** en kun je met
**Open reservering** meteen naar de huur.

![Het venster met de gegevens van een transport na Bekijken](afbeeldingen/06-transport-bekijken.png)
*Een transport na **Bekijken** (of een klik op de regel): alle gegevens op een rij.*

**Wijzigen.** Klik op **Bewerken**, pas aan en klik op **Wijzigingen opslaan**.

**Verwijderen.** Klik op het prullenbakje. Je krijgt **Dit transport verwijderen?** — *Dit
verwijdert dit transportrecord permanent. Deze actie kan niet ongedaan worden gemaakt.*

**Terugzetten kan wel.** Net als bij reserveringen klopt die tekst niet helemaal: een verwijderd
transport komt in de prullenbak. Die staat op dit scherm, rechtsboven: de knop **Verwijderde
transporten**. De regel staat daar met het label **Transport**, bijvoorbeeld *Transport #47 —
P36T64813O3 2027-04-10*, met de knop **Terugzetten**. Dat kan iedereen met het vinkje **Prullenbak
beheren** (hoofdstuk 15, paragraaf 15.16); wie het mist, ziet de knop grijs. Bij het terugzetten
wordt het bijbehorende vervangend voertuig heropend als het nog vrij is. Een transport voorgoed
weghalen kan op dezelfde plek met **Definitief verwijderen** (hoofdstuk 10, paragraaf 10.6).

---

## 6.10 Snel naslaan

| Wat je wilt | Waar |
|---|---|
| Een rit vastleggen | **Transporten** → **Nieuw transport** |
| Een wissel plannen | **Nieuw transport** → **Type: Voertuigwissel** |
| Een vervanger openhouden | **Vervangend voertuig vereist** aan, veld leeg = **TBD** |
| Later een auto toewijzen | **Selecteren** bij **TBD** op het dashboard |
| Het transport starten | **Scannen** → **Transport starten** |
| Het transport afronden | **Scannen** → **Transport afronden**, of **Markeren als voltooid** |
| Het rapport maken | **Afdrukken / rapport genereren** achter de regel |
| De dagroute plannen | **Route-optimalisatie** |
| Een transport terughalen | **Transporten** → **Verwijderde transporten** → **Terugzetten** (vraagt het vinkje **Prullenbak beheren**) |
