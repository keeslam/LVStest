# 7. Onderhoud

Onderhoud gaat over auto's die tijdelijk niet verhuurd kunnen worden: een beurt, een APK, een
reparatie of pech. Je legt dat vast als een **onderhoudsblok** in de werkplaatskalender. Daarnaast
heeft een auto een **werkplaatsstatus** die de uitgifte tegenhoudt. Die twee zijn niet hetzelfde
— lees 7.5 goed.

---

## 7.1 De onderhoudskalender

Klik links op **Onderhoud**. Je komt op de **Onderhoudskalender**, met daaronder de
**Onderhoudsplanning** — *Voertuigonderhoudsevenementen bekijken en beheren*.

Rechtsboven staan:

| Knop | Waarvoor |
|---|---|
| **Lijstweergave** | Hetzelfde als lijst, zie 7.8 |
| **Voltooide bekijken (…)** | De afgeronde onderhoudsbeurten, zie 7.8 |
| **Verwijderd onderhoud** | De prullenbak van dit scherm, zie 7.8 |
| **Onderhoud plannen** | Een nieuw onderhoudsblok, zie 7.2 |

Boven de kalender: **Kleuren** (de legenda), **Vandaag**, de maandnavigatie en drie filters:
**Zoek voertuigen of evenementen...**, **Voertuigtype** (**Alle types**) en **Evenementtype**
(**Alle evenementen**).

**Wat er in de kalender staat.** Twee soorten regels door elkaar:

1. **Signalen** die de app zelf uitrekent uit de APK- en garantiedatums van de auto:
   **APK-keuring verschuldigd**, **APK Herinnering (2 maanden)**, **APK Herinnering (1 maand)**,
   **Garantie verloopt**, **Garantie Herinnering (2 maanden)** en **Garantie Herinnering (1
   maand)**. Die staan er automatisch; je kunt ze niet weghalen, alleen opvolgen.
2. **Onderhoudsblokken** die iemand heeft ingepland: **Gepland onderhoud**, **In onderhoud** en
   **Onderhoudsbeurt nodig**.

Achter een signaal kan **(Verplaatst van het weekend)** staan. Dat betekent dat de datum zelf in
het weekend viel en de app hem naar de eerstvolgende werkdag heeft geschoven, zodat je hem op een
werkdag onder ogen krijgt.

Bij een blok kun je labels tegenkomen: **Vervanger nodig**, **Vervangend voertuig nodig**,
**Verhuur komt eraan** of **Verhuur komt eraan (binnen 3 weken)**. Dat is een waarschuwing dat er
een klant aan vastzit.

![De onderhoudskalender met de APK-signalen](afbeeldingen/07-onderhoud.png)
*De **Onderhoudskalender**: per dag de APK-signalen en de ingeplande onderhoudsblokken, met
labels als **Verhuur komt eraan**.*

![De knoppen van de Onderhoudskalender: Lijstweergave (1), Voltooide bekijken (2), Verwijderd onderhoud (3), Onderhoud plannen (4) en Kleuren (5)](afbeeldingen/07-kalender-knoppen.png)
*De knoppen: 1 **Lijstweergave**, 2 **Voltooide bekijken (…)**, 3 **Verwijderd onderhoud**, 4
**Onderhoud plannen**, 5 **Kleuren**.*

**Een dag openen.** Klik op een dagvakje. Je krijgt het venster **Onderhoudsevenementen -
<datum>** — *Onderhoudsevenementen voor deze dag bekijken en beheren*. Wat je per regel kunt doen,
hangt af van het soort regel:

- Bij een **signaal** (APK of garantie) staat alleen **Onderhoud plannen**. Daarmee zet je de
  keuring in de kalender.
- Bij een **onderhoudsblok** staan **Afronden**, **Bewerken**, **Verwijderen** en **Onderhoud
  bekijken**.

![Het dagvenster Onderhoudsevenementen met per blok Afronden (1), Bewerken (2) en Onderhoud bekijken (3)](afbeeldingen/07-dagvenster.png)
*Het dagvenster: per onderhoudsblok 1 **Afronden**, 2 **Bewerken**, 3 **Onderhoud bekijken**; het
label **Vervangend voertuig nodig** zegt dat er een klant aan vastzit.*

Is er niets, dan staat er *Geen onderhoudsevenementen gepland voor deze dag*.

---

## 7.2 Onderhoud plannen

1. Klik rechtsboven op **Onderhoud plannen**. Het venster opent — *Meld pech, plan reparaties of
   onderhoud voor je voertuigen. Ideaal wanneer een voertuig direct aandacht nodig heeft of
   versleten onderdelen heeft.*
2. Kies het **Voertuig** via *Selecteer een voertuig...* en typ het kenteken. Onder
   **Voertuigfilters** kun je de lijst inkorten met **Alleen beschikbare voertuigen tonen** en
   **Voertuigen met bestaand onderhoud uitsluiten**.
3. Kies eventueel een **Klant** — *Wie brengt het voertuig voor onderhoud?* Dit is een zoekveld,
   net als in het reserveringsformulier: typ een deel van de naam, het telefoonnummer of de plaats
   (*Zoek op naam, telefoon of plaats...*) en klik op de juiste regel. Past er niemand bij, dan
   staat er *Geen klanten gevonden.* Bovenaan de lijst staat **Geen (geen klant)**. Heeft de auto een
   lopende verhuring, dan staat bij die klant het label **Actieve verhuur**.
4. Kies het **Onderhoudstype**. Er zijn er veertien, elk met een korte toelichting:

| Type | Waarvoor |
|---|---|
| **Voertuigpech** | Auto start niet, motorproblemen |
| **Bandenwissel** | Versleten banden, lekke band |
| **Remmenonderhoud** | Versleten remblokken, remvloeistof |
| **Motorreparatie** | Motorproblemen, oververhitting |
| **Transmissiereparatie** | Problemen met schakelen |
| **Elektrisch probleem** | Verlichting, sensoren, elektronica |
| **Airconditioning** | Airco-reparatie, gas bijvullen |
| **Accuwissel** | Lege accu, laadproblemen |
| **Olieverversing** | Reguliere oliebeurt |
| **Regulier onderhoud** | Geplande servicebeurt |
| **APK-keuring** | Jaarlijkse voertuigkeuring |
| **Garantieservice** | Gedekte reparaties |
| **Ongevalschade** | Reparaties na aanrijding |
| **Overig** | Aangepast onderhoud |

5. Vul de **Geplande datum** in — *Wanneer moet dit onderhoud worden uitgevoerd?*
6. Vul **Duur (dagen)** in — *Hoe lang duurt dit?* Er is geen einddatum; de app rekent die uit
   als startdatum plus duur.
7. Een nieuw blok staat altijd op *gepland*: het veld **Status** zie je daarom niet bij het plannen.
   Het verschijnt pas als je een bestaand blok bewerkt, en heeft dan twee keuzes: **Gepland (voertuig
   nog niet gearriveerd)** en **Binnen (voertuig is in onderhoud)**. Een onderhoud rond je niet af met
   een status maar met de knop **Afronden** (7.6).
8. Vul **Omschrijving** in — kort en concreet, bijvoorbeeld *voorremmen* of *olie- en
   filterwissel*. Extra uitleg zet je in **Notities**.
9. Klik op **Onderhoud plannen**.

![Het venster Onderhoud plannen met Voertuig (1), Onderhoudstype (2), Geplande datum (3), Duur (4), Omschrijving (5) en de knop Onderhoud plannen (6)](afbeeldingen/07-onderhoud-plannen.png)
*Het venster **Onderhoud plannen**: 1 **Voertuig**, 2 **Onderhoudstype**, 3 **Geplande datum**, 4 **Duur
(dagen)**, 5 **Omschrijving**, 6 **Onderhoud plannen**.*

Je krijgt **Onderhoud gepland** — *Het onderhoud is gepland en de herinneringen zijn bijgewerkt.*
Het blok staat nu in de kalender op de gekozen dagen, met het kenteken en het type.

**Een geannuleerde of afgeronde verhuring telt niet als conflict.** De app kijkt bij het plannen
alleen naar verhuringen die nog lopen of nog moeten komen. Staat er op die dagen alleen een
**Geannuleerd**, **Voltooid** of al ingeleverde huur, dan krijg je niet de tweede stap met
vervangers, en ook geen leeg venster. Je plant gewoon door.

> **Waarom je dit vastlegt en niet alleen afspreekt met de werkplaats:** het blok maakt zichtbaar
> dat de auto die dagen geclaimd is. Iedereen die de kalender bekijkt, ziet het, en wie in die
> periode wil boeken krijgt een waarschuwing (7.3).

### Als er een klant aan vastzit

Heeft de gekozen auto in die periode een lopende verhuring, dan verschijnt een tweede stap:
**Vervangende voertuigen toewijzen** — *Het geselecteerde voertuig heeft actieve reserveringen
tijdens de onderhoudsperiode. Wijs vervangende voertuigen toe aan de betrokken klanten.*

Per betrokken reservering kies je onder **Vervoersoplossing:** één van drie:

| Keuze | Wat het betekent |
|---|---|
| **Nu vervangend voertuig toewijzen** | Je kiest meteen een auto uit de beschikbare voertuigen |
| **Later vervanger toewijzen (nog te bepalen)** | Er komt een placeholder; je wijst later een auto aan (7.4) |
| **Klant regelt eigen vervoer** | Er komt geen vervanger |

![Het venster Vervangende voertuigen toewijzen met per reservering de drie keuzes onder Vervoersoplossing](afbeeldingen/07-vervangende-voertuigen-toewijzen.png)
*De tweede stap **Vervangende voertuigen toewijzen**: per betrokken klant kies je een van de drie
keuzes.*

![Hetzelfde venster met Later vervanger toewijzen (1) gekozen en de knop Vervangers toewijzen & onderhoud plannen (2)](afbeeldingen/07-vervangende-voertuigen-keuze.png)
*Met 1 **Later vervanger toewijzen (nog te bepalen)** gekozen klik je op 2 **Vervangers toewijzen &
onderhoud plannen**.*

Met **Bewerken** achter *Vervangende verhuur* stel je in het venster **Huurperiode vervanger
instellen** de start- en einddatum van de vervangende huur in. Laat je de einddatum leeg, dan is
het een huur zonder einddatum. De knoppen **Onderhoudsdata gebruiken** en **Open einde maken**
schelen typwerk.

Sla af met **Vervangers toewijzen & onderhoud plannen**. Eén klik op die knop is genoeg, ook als
de lijst met auto's nog openstaat; die lijst staat los van het venster en houdt je klik niet meer
tegen.

Vergeet je een keuze te maken, dan meldt de app **Ontbrekende toewijzingen vervangend voertuig** —
*Kies een specifiek voertuig of 'Nog te bepalen' voor alle betrokken reserveringen.*

### Plannen afbreken

Ben je bij **Vervangende voertuigen toewijzen** en bedenk je je, klik dan op **Annuleren** (of druk op
Escape, klik op het kruisje of naast het venster). Dat maakt het hele plannen ongedaan, niet alleen deze
tweede stap: het onderhoud dat je net aanmaakte is er anders al. De app vraagt eerst **Plannen
afbreken?** — *Het onderhoud wordt weer weggehaald. Wilt u zonder vervanger plannen, kies dan bij de klant
'Later vervanger toewijzen'.* Met **Plannen afbreken** haal je het onderhoud weg (je krijgt **Plannen
afgebroken** — *Het onderhoud is weer weggehaald.*), met **Doorgaan met plannen** ga je terug naar het
venster.

![De vraag Plannen afbreken? met de knoppen Plannen afbreken (1) en Doorgaan met plannen (2)](afbeeldingen/07-plannen-afbreken.png)
*De vraag **Plannen afbreken?**: 1 **Plannen afbreken** haalt het onderhoud weg, 2 **Doorgaan met
plannen** gaat terug.*

Wil je wél plannen, maar nog geen vervanger kiezen? Kies dan bij de klant **Later vervanger toewijzen
(nog te bepalen)** (7.4) en plan door; **Annuleren** is daar niet voor bedoeld.

**Wanneer het écht weggehaald wordt.** Het afbreken verwijdert het onderhoud zonder omweg, zodat het niet
in de prullenbak komt, maar alleen als het nog helemaal nieuw is: het onderhoud is door jou zelf
aangemaakt, minder dan een uur geleden, staat nog op *gepland* en heeft nog geen vervanger of placeholder
aan zich hangen. Klopt een van die dingen niet, dan breekt de app het plannen niet af maar verwijdert hij
het onderhoud op de gewone manier; je krijgt dan **Onderhoud verwijderd** — *Het onderhoud staat in de
prullenbak en kan daar worden teruggezet.* Had de klant al een melding "onderhoud gepland" gekregen, dan
hoort hij daarna ook dat het onderhoud niet doorgaat; was die melding nog niet verstuurd, dan hoort hij
niets.

---

## 7.3 Wat een onderhoudsblok doet met de beschikbaarheid

Dit is de vraag die aan de balie het vaakst misgaat, dus hier staat het apart.

**Een gepland onderhoudsblok zet de auto op Gepland, niet op Reparatie nodig.** Zolang het blok op
*gepland* staat (de auto is er nog niet), zie je de auto in de lijst en op het scanscherm als
**Gepland**. Pas als je het blok op **Binnen** zet (of **Binnen melden** gebruikt, 7.8), wordt het
**Reparatie nodig**. Een auto die al bij een klant staat, blijft **Verhuurd**, ook als er vandaag een
gepland blok ligt. Eerder werd de auto al bij het plannen **Reparatie nodig**; dat is niet meer zo.

**Een gepland onderhoudsblok haalt de auto niet uit de keuzelijst.** Je kunt hem gewoon
selecteren in het boekingsformulier. Wat je krijgt, is een gele waarschuwing:

> *Let op: dit voertuig staat in deze periode ingepland voor onderhoud (05-10-2026 t/m
> 07-10-2026). Opslaan mag; het onderhoudsblok blijft staan.*

Opslaan mag dus. Staan er meerdere blokken, dan meldt de app: *Let op: dit voertuig heeft …
onderhoudsblokken in deze periode (…). Opslaan mag; de blokken blijven staan.*

**Doe je dat, dan heb je iets op te lossen.** De auto is nu twee keer geclaimd: door de klant en
door de werkplaats. Verzet het onderhoud, of bel de werkplaats. De app doet dat niet voor je en
waarschuwt daarna nooit meer.

**In de tellingen telt de auto wél als niet-beschikbaar.** Op het dashboard, bij "beschikbare
voertuigen", zie je hem niet staan. Dat is geen tegenspraak: de telling is voorzichtig, het
boeken is een bewuste keuze van jou.

**Ophalen mag, met een waarschuwing.** Haal je een huur op met een auto die voor onderhoud is ingepland
maar nog niet binnen is gemeld, dan staat in het ophaalvenster: *Let op: dit voertuig staat ingepland
voor onderhoud (<periode>) en is nog niet binnengemeld. Ophalen mag; de balie beslist.* Er wordt niets
geblokkeerd. Staat de auto wél op **Binnen**, dan weigert de app het ophalen met het venster **Uitgifte
geblokkeerd** (7.5).

**De werkplaatsstatus is iets anders en die blokkeert wél.** Zie 7.5.

---

## 7.4 Het vervangend voertuig

Een klant wiens auto naar de werkplaats gaat, krijgt vaak een vervanger. In de app is dat een
eigen reservering op de vervangende auto, gekoppeld aan het onderhoud.

**Meteen toewijzen.** Kies bij het plannen (7.2) **Nu vervangend voertuig toewijzen**.

Of doe het vanuit de lopende huur:

1. Open de reservering via het zoekveld bovenin.
2. Zet de auto eerst op onderhoud met **Voertuig markeren voor onderhoud** (7.5).
3. Onder **Voertuigservice** staat nu de knop **Vervangend voertuig toewijzen**. Klik erop.
4. Het venster legt uit: *Wijs een vervangend voertuig toe om de klant te blijven bedienen
   terwijl het originele voertuig in onderhoud is.* Vul **Startdatum** en **Einddatum** in
   (*Laat leeg voor vervanging zonder einddatum*) en kies een auto uit **Beschikbare vervangende
   voertuigen**. Alleen auto's die in die periode vrij zijn, staan erin.
5. Klik op **Vervangend voertuig toewijzen**.

Je krijgt **Vervangend voertuig toegewezen** — *Het vervangende voertuig is succesvol
toegewezen.*

> **Waarom de auto eerst naar onderhoud moet:** het blok **Voertuigservice** toont maar één knop
> tegelijk. Zolang de auto in orde is, staat er alleen **Voertuig markeren voor onderhoud**. Pas
> als hij op **Onderhoud nodig** of **Momenteel in onderhoud** staat, verschijnt **Vervangend
> voertuig toewijzen**. En zodra er een vervanger loopt, verschijnt in plaats daarvan het oranje
> blok met **Terug van onderhoud**. Zie je de knop die je zoekt niet, kijk dan eerst in welke van
> die drie standen deze auto staat.

**Later toewijzen (nog te bepalen).** Kies je bij het plannen **Later vervanger toewijzen (nog te
bepalen)**, dan maakt de app een placeholder. Die herken je aan:

- **TBD** in plaats van een kenteken op de reserveringskalender;
- op het **Dashboard** in het blok **Beheer vervangende voertuigen**, tabblad **Nog te bepalen**,
  met *Vervangend voertuig (nog te bepalen)* en de knop **Voertuig toewijzen**;
- het tabblad **Vervangers (…)** in het **Onderhoudsoverzicht**, met per regel **Toewijzing
  nodig** en de knop **Toewijzen**.

Er is ook een venster waarmee je er meerdere tegelijk afhandelt: **Vervangende voertuigen
toewijzen** — *Selecteer beschikbare voertuigen om toe te wijzen aan nog te bepalen vervangende-
voertuigreserveringen.* Per regel kies je bij **Selecteer voertuig** een auto en daarna klik je
op **… voertuigen toewijzen**.

**In het onderhoudsvenster zelf.** Open een onderhoudsblok met **Onderhoud bekijken**. In het
blok **Toewijzingen vervangend voertuig** staat de keuzelijst **Toegewezen vervangend voertuig**
met twee bijzondere opties: **Nog te bepalen (Placeholder)** en **Eigen vervoer**. Daarnaast
staat de huidige stand, bijvoorbeeld *(Nog toe te wijzen)* of *(Klant regelt zelf)*.

**Waarom je de auto eerst naar onderhoud zet en pas daarna een vervanger aanwijst:** zolang het
onderhoud niet vastligt, weet de app niet voor welke periode de vervanger nodig is en welke
auto's in die periode vrij zijn. Andersom werken levert een vervanger op die zelf al verhuurd
blijkt te zijn.

---

## 7.5 De werkplaatsstatus: de auto echt op slot zetten

Naast het onderhoudsblok in de kalender heeft elke auto een **werkplaatsstatus**. Die staat
standaard op in orde en kan twee andere waarden hebben: **Onderhoud nodig** of **Momenteel in
onderhoud**.

**Deze status blokkeert de uitgifte.** Staat hij aan, dan weigert de app het ophalen. Je krijgt
het venster **Uitgifte geblokkeerd**:

> *Dit voertuig staat in de werkplaats en kan niet worden uitgegeven. Rond de werkplaatsklus
> eerst af.*

Er wordt dan niets opgeslagen. Ben je beheerder, dan kun je de uitgifte in datzelfde venster
alsnog doorzetten met een reden; zie hoofdstuk 5, paragraaf 5.7.

### De status aanzetten

1. Open de reservering via het zoekveld bovenin.
2. Klik onder **Voertuigservice** op **Voertuig markeren voor onderhoud**.

   ![Het blok Voertuigservice in de reservering met de knop Voertuig markeren voor onderhoud (1)](afbeeldingen/07-voertuigservice.png)
   *Het blok **Voertuigservice** in het volledige reserveringsvenster: klik op **Voertuig markeren voor
   onderhoud** (1).*
3. Kies bij **Onderhoudsstatus**: **Onderhoud nodig** of **Momenteel in onderhoud** — *Kies of
   het voertuig onderhoud nodig heeft of momenteel wordt onderhouden.*
4. Zet in **Servicenotities** wat er aan de hand is.
5. Vul eventueel **Startdatum onderhoud** en **Einddatum onderhoud** in.
6. Klik op **Markeren voor onderhoud**.

   ![Het venster Voertuig markeren voor onderhoud met de knop Markeren voor onderhoud (1)](afbeeldingen/07-voertuig-markeren-onderhoud.png)
   *Het venster: kies de status, vul de notities in en klik op **Markeren voor onderhoud** (1).*

Je krijgt **Voertuig gemarkeerd voor onderhoud** — *Het voertuig is succesvol gemarkeerd als
onderhoud nodig.* De app zet de auto op **In reparatie** en maakt er meteen een onderhoudsblok
bij aan. Dat **Reparatie nodig** onthoudt de app bij het blok waardoor het kwam (zie *Verwijderen of
annuleren wist ook de reparatiestand* in 7.8).

Het kan ook vanaf het scanscherm: scan de auto en klik op **Onderhoud inplannen**. Dat opent het
gewone venster **Onderhoud plannen** met de auto al ingevuld.

### De status weer uitzetten

Er zijn twee knoppen, met een belangrijk verschil.

**A. Terug uit onderhoud (scanscherm).** Scan de auto en klik op **Terug uit onderhoud**. Staat de
auto op **Binnen** in een onderhoudsblok dat vandaag loopt, dan opent de app het venster **Onderhoud
afronden** voor dat blok (7.6): een onderhoud rond je altijd af met de gegevens van de werkplaats, niet met
één klik. Vul het in en klik op **Afronden**; je krijgt **Onderhoud afgerond**. Staat de auto in de
werkplaats zonder dat er een blok **Binnen** is, dan werkt de knop zoals voorheen in één klik en
krijg je **Voertuig is terug uit onderhoud**. In beide gevallen gaat de werkplaatsstatus eraf en
komt de auto meteen in een verhuurbare staat — dus niet meer op **Reparatie nodig**. Je hoeft de
beschikbaarheidsstatus niet meer met de hand terug te zetten.

Onderhoud dat verderop in de kalender staat, blijft gewoon staan. Alleen het blok dat vandaag
loopt gaat dicht.

> **Alleen Voertuigen beheren is niet genoeg.** Staat de auto op **Binnen** in een lopend onderhoud, dan
> is **Terug uit onderhoud** het afronden van dat onderhoud, en dat vraagt het vinkje **Onderhoud beheren**
> of **Reserveringen beheren**. Een scanaccount dat alleen **Voertuigen beheren** heeft, ziet de knop
> grijs; wijs of tik erop en de app zegt welk vinkje er ontbreekt (hoofdstuk 15, paragraaf 15.9). Vraag
> iemand die een van die vinkjes heeft. Wie **Onderhoud beheren** heeft, hoeft **Voertuigen beheren** niet
> te hebben: het venster **Onderhoud afronden** opent meteen. Een auto in de werkplaats zonder lopend
> onderhoud geef je wel vrij met alleen **Voertuigen beheren**.

**B. Terug van onderhoud (bij een vervanger).** Heeft de klant een vervangende auto gekregen, dan
staat er in de reservering een oranje blok **Vervangend voertuig toegewezen** — *Voertuig wordt
momenteel onderhouden* — met de knop **Terug van onderhoud**. Het venster **Voertuig terug van
onderhoud** legt uit: *Markeer het originele voertuig als teruggekeerd van onderhoud en sluit de
vervangende reservering.* Je vult de **Inleverdatum** in en eventueel de **Huidige
kilometerstand** en **Servicenotities**, en klikt op **Terug van onderhoud**.

Deze knop doet de hele handeling in één keer: de vervangende reservering wordt afgesloten, het
onderhoudsblok dat op de inleverdatum loopt wordt afgerond, en het originele voertuig komt uit de
werkplaats en staat weer op **Beschikbaar**. Je krijgt **Voertuig teruggekeerd van onderhoud** —
*Het voertuig staat weer op beschikbaar, het onderhoudsblok van vandaag is afgesloten en de
vervangende reservering is beëindigd.* Je hoeft de auto daarna niet meer zelf vrij te geven.

Onderhoud dat verderop in de kalender staat, blijft gewoon staan.

> **De werkplaatsstatus verdwijnt niet vanzelf bij een huur of een transport.** Niet bij het innemen
> van een huur en niet bij het afronden van een transport. Dat is met opzet: een auto die kapot naar
> binnen ging, mag er niet stilletjes weer uitkomen. Je geeft hem vrij met één van deze twee knoppen
> — of door het onderhoud zelf af te ronden met **Afronden** (7.6): dat is een bewuste handeling van
> de werkplaats en haalt de status er wél af.

---

## 7.6 Onderhoud afronden

Als de werkplaats klaar is, rond je het blok af. Sinds oktober 2026 is dat **één handeling**: de nieuwe
APK-datum, het APK-formulier en de kilometerstand gaan in dezelfde stap mee. Vroeger waren het drie
losse stappen met drie verschillende vinkjes, en bleef er bij een fout halverwege een half resultaat
achter.

**Wie het mag.** **Onderhoud beheren** of **Reserveringen beheren**, meer niet. Je hebt dus geen
**Voertuigen beheren** en geen **Documenten bewerken en genereren** nodig om de APK-datum, de
kilometerstand en het formulier mee te geven (hoofdstuk 15, paragraaf 15.11). Zonder een van de twee
vinkjes staat **Afronden** er grijs. Eén grens blijft: je opent het afrondvenster vanuit de
onderhoudskalender, en die toont de blokken pas als je ook voertuigen en reserveringen mag bekijken.

1. Ga naar **Onderhoud** en klik op de dag waarop het blok staat.
2. Zoek in het venster **Onderhoudsevenementen - <datum>** de regel van jouw auto.
3. Klik op **Afronden**. Het venster **Onderhoud afronden** opent — *Bekijk en werk de
   voertuiggegevens bij na het afronden van het onderhoud.*
4. Bovenin staat **Voertuiginformatie** met het **Kenteken**, het **Voertuig**, het
   **Onderhoudstype**, de **Laatst bekende kilometerstand** en de **Huidige APK**.
5. Vul onder **Afrondingsdetails** de **Afrondingsdatum** in — *Wanneer is het onderhoud
   afgerond?* Die staat vooraf op de begindatum van het blok; zet hem op de dag dat het werk
   werkelijk klaar was.
6. Is de auto gekeurd, vul dan de nieuwe **APK-datum** in — *Vervaldatum APK (indien bijgewerkt)* —
   en voeg met **APK-keuringsformulier (optioneel)** het formulier toe (pdf, jpg of png). Let op: het
   veld staat vooraf ingevuld met de huidige APK-datum van de auto, of met de datum die de app zelf
   uitrekent. **Wat er staat, wordt bij het afronden opgeslagen**; maak het veld leeg als de auto
   niet gekeurd is.
7. Vul onder **Servicedetails** de **Servicecategorie** in (**Gepland onderhoud** of
   **Reparatie**) en de **Huidige kilometerstand (km)**. Ook die staat vooraf ingevuld, met de stand
   die de app van de auto kent.
8. Beschrijf in **Onderhoudsdetails** wat er gedaan is — *Welke werkzaamheden zijn aan het
   voertuig uitgevoerd?* Bijvoorbeeld *olieverversing, luchtfilter, bougies*.
9. Klik op **Afronden**.

![Het venster Onderhoud afronden met Afrondingsdatum (1), APK-datum (2), APK-keuringsformulier (3), Huidige kilometerstand (4), Onderhoudsdetails (5) en de knop Afronden (6)](afbeeldingen/07-onderhoud-afronden.png)
*Het venster **Onderhoud afronden**: 1 **Afrondingsdatum**, 2 **APK-datum**, 3
**APK-keuringsformulier (optioneel)**, 4 **Huidige kilometerstand (km)**, 5 **Onderhoudsdetails**, 6
**Afronden**.*

Je krijgt **Onderhoud afgerond** met je omschrijving erbij, bijvoorbeeld *Onderhoud afgerond:
olie- en filterwissel.* Het blok verdwijnt uit de kalender en staat voortaan onder **Voltooide
bekijken**.

Alle plekken waar je een onderhoud kunt afronden, gebruiken dit ene venster en dit ene woord:
**Afronden** in het dagvenster van de kalender, in het tabblad **Gepland** van het overzicht, in het
bewerkvenster (zie onder) en in het venster van het scanscherm. Het woord *Voltooien* komt voor
onderhoud nergens meer voor.

**Vul de kilometerstand en de werkzaamheden echt in.** Ze bepalen wanneer de volgende beurt aan
de orde is en ze zijn het enige bewijs van wat er aan de auto gedaan is.

In het venster staat het **Onderhoudstype** in het Nederlands, bijvoorbeeld *Pech* — dezelfde
waarde die je bij het plannen koos.

### Wat er in die ene handeling gebeurt

Alles gebeurt in één keer, of helemaal niet:

- **Het blok sluit.** De **Afrondingsdatum** wordt de einddatum van het blok; de begindatum blijft
  staan, want het werk is begonnen toen het begon. Een afrondingsdatum vóór de begindatum wordt
  geweigerd.
- **De voertuigkaart wordt bijgewerkt:** de **APK-datum** en de **kilometerstand**, voor zover je ze
  invulde. Is de categorie **Gepland onderhoud**, dan wordt ook de **laatste servicedatum** de
  afrondingsdatum en, als je een kilometerstand invulde, de laatste servicestand die kilometerstand.
- **Het APK-formulier wordt een document**, bij de auto én bij het blok, met documenttype *APK
  Inspection* en een notitie als *APK inspection completed on &lt;datum&gt;; APK valid until &lt;datum&gt;*.
- **De werkplaatsstatus gaat eraf** en de beschikbaarheid van de auto wordt opnieuw berekend (zie de
  verbetering hieronder).
- **Een openstaand vervangend voertuig van deze auto wordt in dezelfde stap afgesloten.**

**Alles of niets.** Mislukt er iets, dan blijft alles zoals het was: geen half opgeslagen formulier,
geen gewijzigde kilometerstand, en het geüploade bestand wordt weer weggehaald. Je krijgt *Onderhoud
afronden mislukt. Probeer het opnieuw.* en het venster blijft open.

**Een te lage kilometerstand wordt geweigerd.** Vul je een stand in die lager is dan de stand die de
app van de auto kent, dan staat er: *De kilometerstand (… km) is lager dan de huidige stand van het
voertuig (… km). Controleer de stand; er is niets opgeslagen.* Er wordt dan niets gewijzigd en het
blok blijft open. Dit venster kent geen wachtwoordstap zoals het ophalen en innemen (hoofdstuk 15,
paragraaf 15.6): lees de teller opnieuw af en corrigeer de stand. Een stand die gelijk is aan de
huidige, mag wel.

**De verbetering: het afronden geeft de auto vrij.** In eerdere versies van deze handleiding stond
dat het afronden van een blok de werkplaatsstatus niet omzet en dat je daarna altijd nog **Terug van
onderhoud** of **Terug uit onderhoud** moest gebruiken. Dat klopte niet: **Afronden** haalt de
werkplaatsstatus er wél af en maakt de auto weer verhuurbaar. Twee uitzonderingen: loopt er vandaag
nog een ánder openstaand onderhoudsblok op dezelfde auto, dan blijft hij op **Reparatie nodig**, en
**Niet voor verhuur** laat de app staan (7.7). De twee knoppen uit 7.5 blijven nodig voor een auto
die in de werkplaats staat zonder dat je een blok afrondt.

**Het bewerkvenster.** Met **Bewerken** in het dagvenster verander je de gegevens van een blok. De
**Status** heeft daar nog maar twee keuzes: **Gepland (voertuig nog niet gearriveerd)** en **Binnen
(voertuig is in onderhoud)**; het venster toont de opgeslagen status van het blok. De keuze **Uit
(onderhoud voltooid)** bestaat niet meer, want een afronding zonder APK-datum, formulier en
kilometerstand is geen afronding. Onder in het bewerkvenster staat daarom de knop **Afronden**; die
opent hetzelfde venster **Onderhoud afronden** als in 7.6 en sluit het bewerkvenster zodra het
afronden gelukt is. Het plan-venster van het scanscherm, in de bewerkstand, heeft dezelfde knop.

![Het bewerkvenster van een onderhoudsblok met de keuze Status (1) en de knop Afronden (2)](afbeeldingen/07-onderhoud-bewerken.png)
*Het bewerkvenster: 1 **Status** (**Gepland** of **Binnen**), 2 **Afronden** om het blok te sluiten.*

Is een blok al afgerond, dan staat er in het bewerkvenster geen statuskeuze maar de tekst *Afgerond
op <datum>*. Probeert een oudere pagina toch een afronding via de status te bewaren, dan weigert de
app met *Een onderhoud rond je af met de knop Afronden, niet met de status.* Is het blok al afgerond
en probeer je het nog eens, dan staat er *Dit onderhoud is al afgerond.*

---

## 7.7 Terug in dienst — de auto weer verhuurbaar maken

Het afronden van een onderhoudsblok (7.6) geeft de auto zelf vrij: de werkplaatsstatus gaat eraf en
hij is weer verhuurbaar, tenzij er vandaag nog een ander openstaand blok loopt. Staat de auto op een
andere manier in de werkplaats — bijvoorbeeld omdat iemand zijn werkplaatsstatus met de hand zette,
zonder dat er een blok aan hangt — dan doet één van de twee knoppen uit 7.5 dat. Loop daarom na elk
onderhoud dit rijtje langs — het kost een halve minuut en voorkomt de fout die het vaakst gemaakt
wordt: een auto die op het terrein staat maar in geen enkele lijst met vrije auto's voorkomt.

1. **Controleer of de auto vrij is.** Na **Afronden** (7.6) is dat al gebeurd. Is het niet zo,
   scan hem dan en klik op **Terug uit onderhoud**, of gebruik bij een vervanger **Terug van
   onderhoud** in de reservering. Je krijgt **Voertuig is terug uit
   onderhoud**, respectievelijk **Voertuig teruggekeerd van onderhoud**. Beide knoppen halen de
   werkplaatsstatus eraf, sluiten het onderhoudsblok dat op dat moment loopt, en zetten de
   **Beschikbaarheidsstatus** meteen terug op een verhuurbare waarde. Je hoeft die status dus
   niet zelf om te zetten.
2. **Rond een blok af dat nog openstaat.** Kijk op de **Onderhoudskalender**. Staat er nog een
   blok op een andere dag, sluit het dan met **Afronden** (7.6). Onderhoud dat verderop in de
   kalender staat, blijft bewust staan.
3. **Kijk of er nog een vervanger loopt.** Kijk op het **Dashboard** onder **Beheer vervangende
   voertuigen** → tabblad **Actief**, en op **Reserveringen** achter **… achterstallig**. Een
   vervangende auto die nog op opgehaald staat terwijl de originele auto allang terug is,
   blokkeert die vervanger voor iedereen. Neem hem in, of annuleer de reservering als de auto
   nooit is meegegaan.
4. **Controleer de APK-datum.** Is de auto gekeurd, dan moet de nieuwe datum op de voertuigkaart
   staan. Vulde je hem bij het afronden in (7.6), dan staat hij er al.

Controleer stap 1 door de auto te scannen: pas als er **Beschikbaar** staat en er geen oranje
blok **Onderhoud** meer is, kun je hem weer meegeven.

> **Eén uitzondering.** Stond de auto op **Niet voor verhuur**, dan laat de app hem daarop staan.
> Dat is geen werkplaatsstatus maar een bewuste keuze, en die zet je met de hand terug
> (hoofdstuk 4, paragraaf 4.6).

---

## 7.8 Het onderhoudsoverzicht en de geschiedenis

**Lijstweergave.** Klik op **Lijstweergave**. Je krijgt het **Onderhoudsoverzicht** — *Uitgebreid
overzicht van alle onderhoudsgerelateerde items en aankomende serviceverplichtingen*, met het
totale aantal items en een zoekveld *Zoek voertuigen, kentekens, klanten...*

Vier tabbladen:

| Tabblad | Wat erin staat |
|---|---|
| **APK (…)** | *Voertuigen met APK-keuringen die binnen 60 dagen verlopen*, met de kolom **Urgentie** (*… dagen te laat*, *Vandaag verschuldigd*, *… dagen resterend*) en de knoppen **Plannen** en **Bekijken** |
| **Garantie (…)** | Hetzelfde voor de garantie |
| **Gepland (…)** | *Actieve onderhoudsblokken en geplande service-afspraken*, met **Afronden**, **Binnen melden**, **Bewerken**, **Verwijderen** en **Voertuig** |
| **Vervangers (…)** | De nog toe te wijzen vervangers, met **Toewijzen** |

**Afronden en Binnen melden vanuit het overzicht.** Je hoeft niet meer naar de kalender om een blok
af te handelen. Op het tabblad **Gepland** staat achter elk blok dat nog loopt de knop **Afronden**;
die opent hetzelfde venster **Onderhoud afronden** als in 7.6, al ingevuld met de APK-datum en de
kilometerstand die de app van de auto kent. Staat het blok nog op *gepland* (de auto is er nog niet),
dan staat er ook **Binnen melden**: die zet in één klik het blok op *Binnen* en de auto op in onderhoud,
en je krijgt **Voertuig binnen gemeld** — *Het onderhoud staat op Binnen en het voertuig is in
onderhoud.* Een blok dat al *Binnen* is, heeft alleen **Afronden**; een afgerond of geannuleerd blok
heeft geen van beide. De twee knoppen vragen elk een eigen recht:

| Knop | Welk vinkje je nodig hebt |
|---|---|
| **Afronden** | **Onderhoud beheren** of **Reserveringen beheren** (net als **Afronden** in het dagvenster van de kalender) |
| **Binnen melden** | **Voertuigen beheren** |

![Het Onderhoudsoverzicht, tabblad Gepland, met de tabbladen (1) en per blok Binnen melden (2) en Afronden (3)](afbeeldingen/07-lijstweergave-gepland.png)
*Het **Onderhoudsoverzicht**, tabblad **Gepland**: 1 de tabbladen, 2 **Binnen melden**, 3 **Afronden**.*

![Het tabblad Vervangers met per regel de knop Toewijzen (1)](afbeeldingen/07-lijstweergave-vervangers.png)
*Het tabblad **Vervangers**: klik op **Toewijzen** (1) om een auto aan een placeholder te geven.*

Heb je het vinkje niet, dan staat de knop er wel, maar grijs; tik of klik erop en de app zegt welk
vinkje je mist (hoofdstuk 15, paragraaf 15.9). Een werkplaatsprofiel heeft beide vinkjes.

**Verwijderen of annuleren wist ook de reparatiestand.** Zet je een blok op **Binnen**, dan krijgt de auto
**Reparatie nodig** en onthoudt de app welk blok dat deed. Verwijder je dat blok daarna, of annuleer je
het, en loopt er vandaag geen ander blok dat **Binnen** is, dan gaat de auto ook weer van **Reparatie
nodig** af en is hij verhuurbaar. Heeft iemand de auto met de hand op **Reparatie nodig** gezet, of komt
de stand van een ander blok, of van een transport, dan blijft die staan: dan haal je hem zelf weg
(hoofdstuk 4, paragraaf 4.6). Auto's die al op **Reparatie nodig** stonden vóór deze wijziging, houden
die stand; de app weet bij hen niet welk blok het veroorzaakte.

**De omschrijving in het overzicht** staat in het Nederlands. Een blok dat als *pech* is
opgeslagen, toont *Pech: lekke band*, en niet meer het Engelse *breakdown: lekke band*. Oude
blokken die ooit zonder omschrijving zijn geïmporteerd, heten nu *Onderhoudsblok* in plaats van
*Vehicle maintenance block*. Je ziet dit ook bij de geschiedenis op de voertuigkaart en bij de
APK-keuring.

**Voltooide bekijken.** Klik op **Voltooide bekijken (…)**. Je krijgt **Geschiedenis voltooid
onderhoud** — *Voltooide onderhoudsrecords bekijken, bewerken, terugdraaien of verwijderen*. Per
regel staan het type, het label **Gepland** of **Reparatie**, de auto, de regel *Voltooid:
<datum>* en je omschrijving, met twee knoppen:

- **Terugdraaien** — het onderhoud is toch niet klaar. Je krijgt **Onderhoud teruggedraaid** —
  *Onderhoud is weer gemarkeerd als actief*. Het blok staat weer op **Binnen**, de auto weer op
  **Reparatie nodig**, en het blok staat weer in de kalender én in het tabblad **Gepland** van het
  overzicht. Je kunt het daarna gewoon bewerken of opnieuw met **Afronden** afsluiten.
- **Verwijderen** — *Dit onderhoudsrecord wordt naar de prullenbak van dit scherm verplaatst (knop Verwijderd
  onderhoud); terugzetten kan daar.* Doe dit alleen bij een regel die er nooit had moeten
  staan.

![Het venster Geschiedenis voltooid onderhoud met per regel de knop Terugdraaien (1)](afbeeldingen/07-voltooide-bekijken.png)
*Het venster **Geschiedenis voltooid onderhoud**: per regel **Terugdraaien** (1) en **Verwijderen**.*

**De prullenbak van Onderhoud.** Rechtsboven staat de knop **Verwijderd onderhoud**. Daarin staan de
verwijderde onderhoudsplanningen, met het label **Onderhoud** (vroeger stonden ze tussen de
reserveringen). Je kunt een regel **terugzetten** — dat lukt ook als er intussen een verhuring op die
dagen staat, want een blok mag overlappen (7.3) — of **definitief verwijderen**, per regel, per
selectie of met **Prullenbak leegmaken**. Een definitief verwijderd blok verdwijnt met zijn contracten
en schadechecks; **documenten van de auto, zoals een APK-bewijs, blijven staan**. Heeft de planning
fiscale beoordelingen, dan worden die mee definitief verwijderd (hoofdstuk 10, paragraaf 10.6). De knop is er voor iedereen
met het vinkje **Prullenbak beheren**; zonder dat vinkje staat hij grijs (hoofdstuk 10, paragraaf
10.6, en hoofdstuk 15, paragraaf 15.16).

---

## 7.9 Een onderhoudsaanvraag uit het klantenportaal

Klanten kunnen online zelf een storing melden of vragen om hun onderhoudsafspraak te verzetten.
Die aanvragen komen bij jou terecht.

**Waar je ze ziet**

- Op **Klantenportaal**, op de tegel **Aanvragen** en op de tegel **Onderhoud** (*meldingen en
  placeholders*).
- Aan de portaaltegel bovenin het scherm en het rode bolletje achter **Klantenportaal** in het
  menu.

**Hoe je er een afhandelt**

1. Klik op de aanvraag. Je krijgt het venster **Aanvraag #<nummer>** met bovenaan het soort
   aanvraag (**Onderhoud/storing** of **Onderhoud wijzigen**) en de klant.
2. Lees het blok **Melding van de klant**. Bij een storingsmelding staan daar de **Klacht**, de
   **Kilometerstand**, of het **Dringend** is, of de klant **Vervangend vervoer gewenst** heeft
   en de **Gewenste datum**. Bij een verzoek om te verzetten staan er **Nu gepland op**, de
   **Gevraagde datum** en de **Reden**.
3. Kijk of er **Bijlagen** bij zitten — vaak een foto van het dashboard of de schade.
4. Klik op **In behandeling nemen** zolang de aanvraag nog op **Nieuw** staat. De klant ziet dan
   dat je ermee bezig bent.
5. Nu kies je:

| Knop | Wanneer |
|---|---|
| **Inplannen in de onderhoudskalender** | Een nieuwe storingsmelding die je inplant |
| **Onderhoud verplaatsen** | Een verzoek om een bestaande afspraak te verzetten |
| **Antwoord sturen (blijft open)** | Je hebt een vraag of wilt iets melden; de aanvraag blijft openstaan |
| **Afwijzen** | De aanvraag gaat niet door |

6. Kies je een van de eerste twee, dan klapt een klein formulier open. Vul de **Datum** in
   (*Alleen werkdagen (ma t/m vr)*), de **Duur (dagen)** en bij een nieuwe melding het **Soort**
   (**Onderhoudsbeurt** of **Reparatie**). Vroeg de klant om vervangend vervoer, dan staat er:
   *Er wordt een vervanger-placeholder aangemaakt; wijs later een auto toe in de
   onderhoudskalender.*
7. Schrijf een **Notitie voor de klant** en klik op **Inplannen en bevestigen** of **Verplaatsen
   en bevestigen**.

Je krijgt **Onderhoud #… staat in de kalender** of **Onderhoud #… is verplaatst**. Het blok staat
nu op de onderhoudskalender, met de aantekening dat het uit het klantenportaal komt.

**Afwijzen** kan alleen met een toelichting: zonder tekst in **Antwoord aan klant** meldt de app
*Vul een antwoord in.* Leg altijd kort uit waarom, want de klant leest dat online terug.

> **Let op:** een onderhoudsmelding sluit je niet af met **Beantwoorden en afhandelen**. Er staat
> ook een tip in het venster: *Een onderhoudsmelding kan alleen worden afgehandeld via Inplannen
> (zet het in de kalender) of Afwijzen.*

De klant krijgt automatisch bericht zodra je het onderhoud inplant of verzet, en ook als er een
vervangend voertuig aan wordt toegewezen.

---

## 7.10 Snel naslaan

| Wat je wilt | Waar |
|---|---|
| Een beurt of reparatie inplannen | **Onderhoud** → **Onderhoud plannen** |
| Een APK inplannen | Voertuigkaart → **Onderhoud** → **APK-keuring plannen**, of het signaal in de kalender → **Onderhoud plannen** |
| De auto echt op slot zetten | Reservering → **Voertuig markeren voor onderhoud** |
| Een vervanger aanwijzen | **Vervangend voertuig toewijzen**, of **Dashboard** → **Beheer vervangende voertuigen** → **Nog te bepalen** → **Voertuig toewijzen** |
| Een TBD-vervanger invullen | **Onderhoud** → **Lijstweergave** → **Vervangers** → **Toewijzen** |
| Het onderhoud afronden (met APK-datum, formulier en kilometerstand in één keer) | Dag openen in de kalender → **Afronden** (7.6) |
| De vervangende huur afsluiten | Reservering → **Terug van onderhoud** |
| De auto weer vrijgeven | **Scannen** → **Terug uit onderhoud** (zet ook de status terug, 7.7) |
| Een afgerond onderhoud terugdraaien | **Voltooide bekijken (…)** → **Terugdraaien** |
| Een verwijderd onderhoud terugzetten | **Verwijderd onderhoud** → **Terugzetten** (vraagt het vinkje **Prullenbak beheren**) |
| Een portaalaanvraag afhandelen | **Klantenportaal** → tegel **Aanvragen** → klik op de aanvraag |
