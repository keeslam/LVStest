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

**Een dag openen.** Klik op een dagvakje. Je krijgt het venster **Onderhoudsevenementen -
<datum>** — *Onderhoudsevenementen voor deze dag bekijken en beheren*. Wat je per regel kunt doen,
hangt af van het soort regel:

- Bij een **signaal** (APK of garantie) staat alleen **Onderhoud plannen**. Daarmee zet je de
  keuring in de kalender.
- Bij een **onderhoudsblok** staan **Voltooien**, **Bewerken**, **Verwijderen** en **Onderhoud
  bekijken**.

Is er niets, dan staat er *Geen onderhoudsevenementen gepland voor deze dag*.

---

## 7.2 Onderhoud plannen

1. Klik rechtsboven op **Onderhoud plannen**. Het venster opent — *Meld pech, plan reparaties of
   onderhoud voor je voertuigen. Ideaal wanneer een voertuig direct aandacht nodig heeft of
   versleten onderdelen heeft.*
2. Kies het **Voertuig** via *Selecteer een voertuig...* en typ het kenteken. Onder
   **Voertuigfilters** kun je de lijst inkorten met **Alleen beschikbare voertuigen tonen** en
   **Voertuigen met bestaand onderhoud uitsluiten**.
3. Kies eventueel een **Klant** — *Wie brengt het voertuig voor onderhoud?* Heeft de auto een
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
7. Laat **Status** op **Gepland (voertuig nog niet gearriveerd)** staan. De andere twee zijn
   **Binnen (voertuig is in onderhoud)** en **Uit (onderhoud voltooid)**.
8. Vul **Omschrijving** in — kort en concreet, bijvoorbeeld *voorremmen* of *olie- en
   filterwissel*. Extra uitleg zet je in **Notities**.
9. Klik op **Onderhoud plannen**.

Je krijgt **Onderhoud gepland** — *Het onderhoud is gepland en de herinneringen zijn bijgewerkt.*
Het blok staat nu in de kalender op de gekozen dagen, met het kenteken en het type.

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

Met **Bewerken** achter *Vervangende verhuur* stel je in het venster **Huurperiode vervanger
instellen** de start- en einddatum van de vervangende huur in. Laat je de einddatum leeg, dan is
het een huur zonder einddatum. De knoppen **Onderhoudsdata gebruiken** en **Open einde maken**
schelen typwerk.

Sla af met **Vervangers toewijzen & onderhoud plannen**.

Vergeet je een keuze te maken, dan meldt de app **Ontbrekende toewijzingen vervangend voertuig** —
*Kies een specifiek voertuig of 'Nog te bepalen' voor alle betrokken reserveringen.*

---

## 7.3 Wat een onderhoudsblok doet met de beschikbaarheid

Dit is de vraag die aan de balie het vaakst misgaat, dus hier staat het apart.

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
- *… vervangers nog toe te wijzen* met **Nog geen voertuig** en de knop **Vervanger toewijzen**
  op het scherm **Vandaag**;
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

**Deze status blokkeert de uitgifte.** Staat hij aan, dan weigert de app het ophalen met de
melding **Ophalen mislukt** en de Engelse tekst:

> *This vehicle is in the workshop and cannot be handed over. Close the workshop job first, or
> have an administrator force the handover with a reason.*

Er wordt dan niets opgeslagen.

### De status aanzetten

1. Open de reservering via het zoekveld bovenin.
2. Klik onder **Voertuigservice** op **Voertuig markeren voor onderhoud**.
3. Kies bij **Onderhoudsstatus**: **Onderhoud nodig** of **Momenteel in onderhoud** — *Kies of
   het voertuig onderhoud nodig heeft of momenteel wordt onderhouden.*
4. Zet in **Servicenotities** wat er aan de hand is.
5. Vul eventueel **Startdatum onderhoud** en **Einddatum onderhoud** in.
6. Klik op **Markeren voor onderhoud**.

Je krijgt **Voertuig gemarkeerd voor onderhoud** — *Het voertuig is succesvol gemarkeerd als
onderhoud nodig.* De app zet de auto op **In reparatie** en maakt er meteen een onderhoudsblok
bij aan.

Het kan ook vanaf het scanscherm: scan de auto en klik op **Onderhoud inplannen**. Dat opent het
gewone venster **Onderhoud plannen** met de auto al ingevuld.

> **Beperking:** in het venster **Voertuig markeren voor onderhoud** staat de regel *Markeer ()
> als onderhoud nodig of momenteel in onderhoud.* — met lege haakjes waar merk, model en kenteken
> horen te staan. Controleer daarom zelf in de titelbalk van de reservering welke auto je
> bewerkt.

### De status weer uitzetten

Er zijn twee knoppen, met een belangrijk verschil.

**A. Terug uit onderhoud (scanscherm).** Scan de auto en klik op **Terug uit onderhoud**. Je
krijgt **Voertuig is terug uit onderhoud**. De werkplaatsvlag gaat uit, het onderhoudsblok dat
vandaag loopt wordt afgesloten, en de auto komt meteen in een verhuurbare staat — dus niet meer
op **Reparatie nodig**. Je hoeft de beschikbaarheidsstatus niet meer met de hand terug te zetten.

Onderhoud dat verderop in de kalender staat, blijft gewoon staan. Alleen het blok dat vandaag
loopt gaat dicht.

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

> **De werkplaatsvlag verdwijnt nooit vanzelf.** Niet bij het innemen van een huur, en niet bij
> het afronden van een transport. Dat is met opzet: een auto die kapot naar binnen ging, mag er
> niet stilletjes weer uitkomen. Je moet hem dus zelf vrijgeven.

---

## 7.6 Onderhoud afronden

Als de werkplaats klaar is, rond je het blok af.

1. Ga naar **Onderhoud** en klik op de dag waarop het blok staat.
2. Zoek in het venster **Onderhoudsevenementen - <datum>** de regel van jouw auto.
3. Klik op **Voltooien**. Het venster **Onderhoud voltooien** opent — *Bekijk en werk de
   voertuiggegevens bij na het voltooien van het onderhoud.*
4. Bovenin staat **Voertuiginformatie** met het **Kenteken**, het **Voertuig**, het
   **Onderhoudstype** en de **Laatst bekende kilometerstand**.
5. Vul onder **Voltooiingsdetails** de **Voltooiingsdatum** in — *Wanneer is het onderhoud
   voltooid?*
6. Is de auto gekeurd, vul dan de nieuwe **APK-datum** in — *Vervaldatum APK (indien bijgewerkt)*
   — en voeg met **APK-keuringsformulier (optioneel)** het formulier toe. Zo hoef je de APK-datum
   niet apart op de voertuigkaart bij te werken.
7. Vul onder **Servicedetails** de **Servicecategorie** in (**Gepland onderhoud** of
   **Reparatie**) en de **Huidige kilometerstand (km)**.
8. Beschrijf in **Onderhoudsdetails** wat er gedaan is — *Welke werkzaamheden zijn aan het
   voertuig uitgevoerd?* Bijvoorbeeld *olieverversing, luchtfilter, bougies*.
9. Klik op **Voltooien**.

Je krijgt **Onderhoud voltooid** met je omschrijving erbij, bijvoorbeeld *Onderhoud voltooid:
olie- en filterwissel.* Het blok verdwijnt uit de kalender en staat voortaan onder **Voltooide
bekijken**.

**Vul de kilometerstand en de werkzaamheden echt in.** Ze bepalen wanneer de volgende beurt aan
de orde is en ze zijn het enige bewijs van wat er aan de auto gedaan is.

> **Beperking:** in dit venster staat het **Onderhoudstype** in het Engels, bijvoorbeeld
> *breakdown* in plaats van *Voertuigpech*. Het is dezelfde waarde die je bij het plannen koos.

**Vergeet de auto niet vrij te geven.** Het afronden van het blok zet de werkplaatsstatus van de
auto niet om. Gebruik daarna **Terug van onderhoud** of **Terug uit onderhoud** (7.5), anders
blijft het ophalen geweigerd worden.

---

## 7.7 Terug in dienst — de auto weer verhuurbaar maken

Een auto is pas weer verhuurbaar als **twee** statussen in orde zijn: de werkplaatsvlag én de
beschikbaarheidsstatus. Het afronden van het onderhoud zet ze geen van beide om. Loop daarom na
elk onderhoud dit rijtje langs — het kost een halve minuut en voorkomt de fout die het vaakst
gemaakt wordt: een auto die op het terrein staat maar in geen enkele lijst met vrije auto's
voorkomt.

1. **Haal de werkplaatsvlag eraf.** Scan de auto en klik op **Terug uit onderhoud**. Je krijgt
   **Voertuig is terug uit onderhoud**.
2. **Zet de beschikbaarheidsstatus terug.** Kijk in de lijst **Voertuigen** naar de kolom
   **Status**. Staat er nog **Reparatie nodig**, klik dan op het potloodje → tabblad **Algemeen**
   → **Beschikbaarheidsstatus** → **Beschikbaar** → **Voertuig bijwerken**. Stap 1 doet dit
   namelijk niet voor je.
3. **Rond het onderhoudsblok af.** Kijk op de **Onderhoudskalender**. Staat het blok er nog, sluit
   het dan met **Voltooien** (7.6).
4. **Kijk of er nog een vervanger loopt.** Kijk op **Nog buiten** en op **Vandaag**. Een
   vervangende auto die nog op opgehaald staat terwijl de originele auto allang terug is,
   blokkeert die vervanger voor iedereen. Neem hem in, of annuleer de reservering als de auto
   nooit is meegegaan.
5. **Controleer de APK-datum.** Is de auto gekeurd, dan moet de nieuwe datum op de voertuigkaart
   staan.

Controleer stap 1 en 2 door de auto te scannen: pas als er **Beschikbaar** staat en er geen
oranje blok **Onderhoud** meer is, kun je hem weer meegeven.

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
| **Gepland (…)** | *Actieve onderhoudsblokken en geplande service-afspraken*, met **Bewerken**, **Verwijderen** en **Voertuig** |
| **Vervangers (…)** | De nog toe te wijzen vervangers, met **Toewijzen** |

**Voltooide bekijken.** Klik op **Voltooide bekijken (…)**. Je krijgt **Geschiedenis voltooid
onderhoud** — *Voltooide onderhoudsrecords bekijken, bewerken, terugdraaien of verwijderen*. Per
regel staan het type, het label **Gepland** of **Reparatie**, de auto, de regel *Voltooid:
<datum>* en je omschrijving, met twee knoppen:

- **Terugdraaien** — het onderhoud is toch niet klaar. Je krijgt **Onderhoud teruggedraaid** —
  *Onderhoud is weer gemarkeerd als actief*, en het blok staat weer in de kalender.
- **Verwijderen** — *Dit verwijdert dit onderhoudsrecord permanent. Deze actie kan niet ongedaan
  worden gemaakt.* Doe dit alleen bij een regel die er nooit had moeten staan.

---

## 7.9 Een onderhoudsaanvraag uit het klantenportaal

Klanten kunnen online zelf een storing melden of vragen om hun onderhoudsafspraak te verzetten.
Die aanvragen komen bij jou terecht.

**Waar je ze ziet**

- Op **Vandaag**, onder **Nieuwe portaalaanvragen**, met de knop **Beoordelen**.
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
| Een vervanger aanwijzen | **Vervangend voertuig toewijzen**, of **Vandaag** → **Vervanger toewijzen** |
| Een TBD-vervanger invullen | **Onderhoud** → **Lijstweergave** → **Vervangers** → **Toewijzen** |
| Het onderhoud afronden | Dag openen in de kalender → **Voltooien** |
| De vervangende huur afsluiten | Reservering → **Terug van onderhoud** |
| De auto weer vrijgeven | **Scannen** → **Terug uit onderhoud**, daarna status op **Beschikbaar** zetten (7.7) |
| Een afgerond onderhoud terugdraaien | **Voltooide bekijken (…)** → **Terugdraaien** |
| Een portaalaanvraag afhandelen | **Vandaag** → **Beoordelen**, of **Klantenportaal** → **Aanvragen** |
