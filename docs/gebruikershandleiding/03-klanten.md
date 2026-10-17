# 3. Klanten

Alles wat je met een klant doet, gebeurt op het scherm **Klanten**: opzoeken, aanmaken,
bijwerken, chauffeurs bijhouden, een portaalaccount regelen en — als het echt moet — verwijderen.

Een klant is de partij die de auto huurt. Dat is meestal een bedrijf. De persoon die achter het
stuur zit, is de **chauffeur**; die leg je apart vast bij de klant (3.6). Dat onderscheid is
belangrijk: het contract gaat naar de klant, het rijbewijs hoort bij de chauffeur.

---

## 3.1 Een klant opzoeken

1. Klik links op **Klanten**. Je komt op de **Klantendatabase**.
2. Typ in het veld **Klanten zoeken** een deel van de naam, het e-mailadres of de plaats. De
   lijst filtert zichzelf terwijl je typt.
3. Sorteer eventueel met het keuzelijstje ernaast: **Naam (A-Z)**, **Naam (Z-A)**, **Nieuwste
   eerst**, **Oudste eerst**, **Meeste verhuur**, **Recente activiteit** of **Actieve verhuur**.
4. Wil je alleen een bepaald soort klanten zien, klik dan op **Filters**. Je krijgt het vakje
   **Klanten filteren** met onder andere **Recente klanten (30 dagen)**, **Frequente klanten
   (3+ reserveringen)**, **Volledig profiel**, **Onvolledig profiel**, **Actieve verhuur**,
   **Heeft chauffeurs**, **Zakelijk** en **Particulier**. Met **Filters wissen** zet je ze weer
   uit.

De tabel heeft de kolommen **Naam**, **E-mail**, **Telefoon** en **Plaats**. Achter elke regel
staan **Bekijken**, **Nieuwe reservering** en **Verwijderen**. Een leeg veld toont een streepje.
Staat er onder het e-mailadres een blauw label **Portaal (1)**, dan heeft deze klant zoveel
portaalaccounts (3.7).

Onderaan staat hoeveel regels je ziet, bijvoorbeeld *1-10 van 300 getoond*, met **Vorige** en
**Volgende**. Ernaast staat *Pagina 1 van 30* met een invulveld **Pagina**: typ een paginanummer
en druk op Enter om er meteen heen te springen. Typ je een nummer dat niet bestaat, dan kom je
op de laatste (of eerste) pagina uit.

![De Klantendatabase met het zoekveld (1), Filters (2), Klant toevoegen (3), Bekijken (4) en Verwijderde klanten (5)](afbeeldingen/03-klanten-lijst-knoppen.png)
*De **Klantendatabase**: 1 het zoekveld **Klanten zoeken**, 2 **Filters**, 3 **Klant toevoegen**,
4 **Bekijken** achter een regel (een klik ergens op de regel werkt ook), 5 **Verwijderde klanten**,
de prullenbak van dit scherm.*

**Sneller:** het zoekveld bovenin het scherm (hoofdstuk 1, paragraaf 1.3) doorzoekt klanten,
voertuigen en reserveringen tegelijk. Zoek je alleen een klant, dan is de klantenlijst
overzichtelijker.

---

## 3.2 Een klant bekijken

Klik bij de juiste regel op **Bekijken**, of klik ergens op de regel zelf. Je krijgt het venster
**Klantgegevens** met als ondertitel *Bekijk klantinformatie en reserveringsgeschiedenis*.

Bovenin staan de naam, de regel *Klant sinds <datum>* en de knoppen **Terug**, **Bewerken** en
**Nieuwe reservering**. Daaronder vier tegels: **Totaal aantal verhuringen**, **Actieve
verhuringen**, **Voltooid** en **Totaal aantal km gereden**.

![Het venster Klantgegevens met de knoppen Bewerken (1) en Nieuwe reservering (2) en de tabbladen (3)](afbeeldingen/03-klantgegevens.png)
*Het venster **Klantgegevens**: 1 **Bewerken**, 2 **Nieuwe reservering**, 3 de tabbladen. Het tabblad
**Persoonlijke gegevens** staat open; scrol naar beneden voor de rest van de gegevens en het blok
**Geblokkeerde voertuigen**.*

Daaronder staan vijf tabbladen (**Portaal** alleen voor wie **Klantportaal bekijken** of **Klantportaal
beheren** heeft):

| Tabblad | Wat je er ziet |
|---|---|
| **Persoonlijke gegevens** | Alle vastgelegde gegevens: persoonlijke informatie, contactgegevens, adres, bedrijfsgegevens en de recordgegevens (wie het aanmaakte en wanneer) |
| **Chauffeurs** | De bevoegde chauffeurs van deze klant, zie 3.6 |
| **Actieve verhuringen** | Wat er nu loopt |
| **Geschiedenis** | De afgeronde verhuringen, met **Exporteren (CSV)** |
| **Portaal** | Het klantenportaal van deze klant, zie 3.7 |

Wat niet is ingevuld, staat er als **Niet opgegeven**. Dat is geen fout; het betekent gewoon dat
het veld leeg is. Vul het aan zodra je het weet: wat leeg is op de klantkaart, blijft ook leeg op
het contract (hoofdstuk 8).

### Geblokkeerde voertuigen: een auto blokkeren voor deze klant

Onderaan het tabblad **Persoonlijke gegevens** staat het blok **Geblokkeerde voertuigen** —
*Voertuigen die deze klant niet mag huren*. Staat daar *Deze klant is niet geblokkeerd voor enig
voertuig.* (met eronder *Ze kunnen alle beschikbare voertuigen huren.*), dan mag de klant alles
huren. Een geblokkeerde auto staat hier met het kenteken, de **Reden** en wie de blokkade wanneer
toevoegde. In het boekingsvenster verschijnt zo'n auto voor deze klant niet meer in de keuzelijst
(hoofdstuk 5, paragraaf 5.3).

![Het blok Geblokkeerde voertuigen met de knop Voertuig blokkeren (1) en bij een blokkade de knop Blokkade opheffen (2)](afbeeldingen/03-geblokkeerde-voertuigen.png)
*Het blok **Geblokkeerde voertuigen**: 1 **Voertuig blokkeren**, 2 **Blokkade opheffen** achter een
bestaande blokkade.*

**Een auto blokkeren**

1. Open de klant met **Bekijken** en scrol op **Persoonlijke gegevens** naar beneden tot
   **Geblokkeerde voertuigen**.
2. Klik op **Voertuig blokkeren**. Het venster **Voertuig blokkeren voor deze klant** opent — *Kies
   een voertuig dat <naam> niet mag huren.*
3. Klik op **Voertuig** en zoek de auto op kenteken, merk of model (*Zoek op kenteken, merk of
   model...*). Auto's die al geblokkeerd zijn voor deze klant staan niet in de lijst.
4. Vul eventueel **Reden (optioneel)** in — *Waarom mag deze klant dit voertuig niet huren?* Die reden
   ziet elke collega die de klant of de auto opent.
5. Klik op **Blokkeren**.

![Het venster Voertuig blokkeren voor deze klant met het veld Voertuig (1), Reden (2) en de knop Blokkeren (3)](afbeeldingen/03-voertuig-blokkeren.png)
*Het venster **Voertuig blokkeren voor deze klant**: 1 kies het **Voertuig**, 2 vul de **Reden** in,
3 klik op **Blokkeren**.*

Je krijgt **Voertuig geblokkeerd** en de auto staat meteen in het blok. Staat de auto er al, dan weigert
de app met een rode melding.

**Een blokkade opheffen.** Klik achter de blokkade op **Blokkade opheffen**. De app vraagt **Blokkade
opheffen?** — *<voertuig> (<kenteken>) wordt vrijgegeven; deze klant kan het voertuig daarna weer
huren.* Bevestig met **Blokkade opheffen**, of kies **Annuleren**.

![De vraag Blokkade opheffen? met de knop Blokkade opheffen (1)](afbeeldingen/03-blokkade-opheffen.png)
*De bevestiging **Blokkade opheffen?**: pas na een klik op **Blokkade opheffen** (1) is de blokkade weg.*

Beide knoppen zijn er voor wie **Klanten beheren** of **Voertuigen beheren** heeft; zonder dat vinkje
staan ze er grijs. Hetzelfde kun je vanaf de andere kant doen: op de voertuigkaart heet het blok
**Klant zwarte lijst**, met **Toevoegen aan zwarte lijst** (hoofdstuk 4). Het is dezelfde lijst; wat je
aan de ene kant doet, zie je meteen aan de andere kant.

Sluit het venster met **Sluiten** of **Terug**.

---

## 3.3 Een nieuwe klant aanmaken

1. Klik links op **Klanten**.
2. Klik rechtsboven op **Klant toevoegen**. Het venster **Nieuwe klant toevoegen** opent.
3. Boven de tabbladen staat een kort blokje dat uitlegt wat je minimaal nodig hebt: alleen de naam
   is verplicht; voor een reservering heb je ook een telefoonnummer en e-mailadres nodig, en voor
   het contract (pdf) horen adres, postcode, plaats, bedrijfsnaam en rijbewijsnummer erbij.
   Vul het tabblad **Basisgegevens** in:
   - **Klanttype** — kies **Zakelijk** of **Particulier**. Standaard staat hij op **Zakelijk**.
   - **Debiteurnummer** — het nummer waarop de boekhouding deze klant kent.
   - **Volledige naam** — het enige veld dat écht verplicht is.
   - **Voornaam**, **Achternaam**, **Naam chauffeur**, **Rijbewijsnummer**.
   - Onder **Adresgegevens**: begin met **Postcode** en **Huisnummer** (en zo nodig **Toevoeging**).
     Zijn die compleet, dan vult de app **Straatnaam**, **Straatadres** en **Plaats** zelf in
     (zie hieronder, *Postcode en huisnummer*). Daarna staat nog **Land** (staat al op *Nederland*).

   ![Het tabblad Basisgegevens met Klanttype (1), Volledige naam (2), Postcode (3), Huisnummer (4) en het tabblad Contact (5)](afbeeldingen/03-klant-toevoegen-basis.png)
   *Het tabblad **Basisgegevens**: 1 **Klanttype**, 2 **Volledige naam**, 3 **Postcode** en 4
   **Huisnummer** (de app vult straat en plaats in), 5 het tabblad **Contact** voor de volgende stap.*
4. Ga naar het tabblad **Contact** en vul minstens **Primair e-mailadres** en **Primair
   telefoonnummer** in. Doe dit meteen: zonder e-mailadres kun je deze klant later geen contract
   en geen herinnering sturen. Verder kun je hier een apart **E-mailadres voor APK-keuring**,
   **E-mailadres voor facturen**, **Algemeen e-mailadres** en **Telefoonnummer chauffeur**
   kwijt.

   ![Het tabblad Contact met Primair e-mailadres (1), Primair telefoonnummer (2) en het tabblad Bedrijf (3)](afbeeldingen/03-klant-toevoegen-contact.png)
   *Het tabblad **Contact**: 1 **Primair e-mailadres**, 2 **Primair telefoonnummer**, 3 het tabblad
   **Bedrijf**.*
5. Is het een bedrijf, vul dan het tabblad **Bedrijf** in: **Bedrijfsnaam**, **Contactpersoon**,
   **Kamer van Koophandel nummer (KvK)**, **BTW-nummer**, **RSIN**, het **Facturatiecontact**,
   de **Accountmanager**, de **Zakelijke korting (%)** en zo nodig een afwijkend
   **Facturatieadres**.

   ![Het tabblad Bedrijf met Bedrijfsnaam (1), Kamer van Koophandel nummer (2) en de knop Klant toevoegen (3)](afbeeldingen/03-klant-toevoegen-bedrijf.png)
   *Het tabblad **Bedrijf**: 1 **Bedrijfsnaam**, 2 **Kamer van Koophandel nummer (KvK)**, 3 de knop
   **Klant toevoegen** onderaan.*
6. Het tabblad **Aanvullend** is voor **Status**, **Statusdatum** en **Notities**.
7. Klik onderaan op **Klant toevoegen**.

Je krijgt de melding **Klant succesvol aangemaakt** — *De klant is toegevoegd aan je systeem.*

![De groene melding Klant succesvol aangemaakt rechtsonder in beeld](afbeeldingen/03-klant-aangemaakt.png)
*De melding rechtsonder na het opslaan. Zo'n melding verdwijnt na een paar seconden vanzelf.*

### Postcode en huisnummer

Bij een Nederlands adres zoekt de app straat en plaats voor je op, uit het adresregister van het Kadaster
(BAG, via PDOK). Typ de **Postcode** (hoofdletters en spatie maken niet uit) en het **Huisnummer**. Na een
kort moment staat onder de velden *Adres gevonden: straat en plaats zijn ingevuld.* en zijn **Straatnaam**,
**Straatadres** (met nummer, bijvoorbeeld *Coolsingel 4A*) en **Plaats** ingevuld. De postcode krijgt zelf
de spatie (*3011 AD*).

- Een letter hoort bij het huisnummer: typ je *12a* in het veld **Huisnummer**, dan komt de *A* vanzelf in
  **Toevoeging**.
- Alles blijft aan te passen. Wat de app invulde, kun je gewoon overschrijven.
- Vindt de app het adres niet, dan staat er *We vinden dit adres niet. Controleer de postcode en het
  huisnummer, of vul straat en plaats zelf in.* Vul het dan met de hand in. Kent de app alleen de
  toevoeging niet, dan staan straat en plaats er wel en vraagt de melding om het huisnummer te controleren.
- Werkt het opzoeken even niet, dan zegt de app dat ook; het formulier blijft gewoon bruikbaar.
- Bij een ander land dan Nederland zoekt de app niets op. Een bestaand adres dat je opent wordt nooit
  automatisch veranderd; er wordt alleen gezocht als jij de postcode of het huisnummer wijzigt.
- Hetzelfde staat bij **Facturatieadres** op het tabblad **Bedrijf**, en in het klantenportaal (zie 3.7).

**Twee dingen om te weten:**

- De app zet een naam die je helemaal in kleine letters typt om naar hoofdletters per woord. Typ
  je *jan van der berg*, dan staat er *Jan van der Berg*; *van*, *de*, *der*, *den*, *het*, *ten*
  en *ter* blijven klein. Een woord waar je zelf al een hoofdletter midden in of een punt in
  hebt gezet, laat de app staan zoals je het typte. *DHL Express B.V.*, *ABN AMRO* en *AUDIT
  Testklant B.V.* blijven dus precies zo staan. Typ je een naam helemaal in hoofdletters, dan
  blijft die ook zo: de app maakt er niets kleiner van.
- Vul je de naam niet of te kort in, dan verschijnt onder het veld de melding *De naam moet
  minimaal 2 tekens bevatten*.
- De voorbeelden in de lege velden zijn Nederlands, bijvoorbeeld *Jan Jansen*, *Hoofdstraat 1*,
  *jan.jansen@voorbeeld.nl* en *Voorbeeld Transport B.V.* Het zijn alleen voorbeelden; ze worden
  niet opgeslagen.
- Sluit je het venster terwijl je al iets hebt getypt, dan vraagt de app **Wijzigingen
  verwerpen?** — *Je hebt wijzigingen gemaakt die nog niet zijn opgeslagen. Als je sluit, gaan ze
  verloren.* Met **Verder bewerken** blijf je in het formulier, met **Verwerpen** sluit je het.
  Dat geldt ook bij **Klant bewerken**.

---

## 3.4 De waarschuwing "Deze klant bestaat mogelijk al"

Zodra je op het tabblad **Contact** een e-mailadres of telefoonnummer intypt dat al bij een
andere klant staat, verschijnt er direct onder dat veld een oranje kader:

> **Deze klant bestaat mogelijk al**
> *<naam> — zelfde e-mailadres*
> *Je kunt gewoon doorgaan; dit is een waarschuwing, geen blokkade.*

Staat de klant er al op met **zelfde telefoonnummer** of met **zelfde e-mailadres +
telefoonnummer**, dan zie je dat er ook bij.

![Het oranje kader Deze klant bestaat mogelijk al onder het e-mailveld, met de knop Openen (1)](afbeeldingen/03-bestaat-mogelijk-al.png)
*De waarschuwing onder het veld: klik op **Openen** (1) om de bestaande klant te bekijken.*

**Wat je doet:** klik op **Openen** naast de naam. Je opent dan de klant die er al is. Gebruik
die, en sluit het formulier dat je aan het invullen was.

De app blokkeert niet, en dat is met opzet: twee chauffeurs van hetzelfde bedrijf mogen best
hetzelfde telefoonnummer hebben. Maar één klant twee keer in het systeem betekent dat zijn huren
over twee kaarten verdeeld raken en dat je zijn geschiedenis nooit meer in één keer ziet. Neem
de waarschuwing dus serieus.

De waarschuwing verschijnt pas als het e-mailadres een `@` bevat of het telefoonnummer minstens
acht cijfers heeft, en met een kleine vertraging. Dat is normaal.

---

## 3.5 Een klant bijwerken

1. Open de klant met **Bekijken** en klik op **Bewerken**, of gebruik het potloodje in de lijst.
2. Het venster **Klant bewerken** opent — *Werk klantinformatie en gegevens bij*. Het is
   hetzelfde formulier als bij het aanmaken, met dezelfde vier tabbladen.

   ![Het venster Klant bewerken met de vier tabbladen (1) en de knop Klant bijwerken (2)](afbeeldingen/03-klant-bewerken.png)
   *Het venster **Klant bewerken**: 1 de tabbladen, 2 **Klant bijwerken** onderaan.*
3. Wijzig wat nodig is en klik onderaan op **Klant bijwerken**.

Je krijgt **Klant succesvol bijgewerkt** — *De klant is bijgewerkt in je systeem.*

Wat je verandert, staat daarna in de geschiedenis van de klant: wie het deed, wanneer, en wat de
oude en nieuwe waarde waren.

> **Let op:** een lopend contract verandert niet mee. Wijzig je het adres of de naam van een
> klant nadat het contract gemaakt is, genereer het contract dan opnieuw (hoofdstuk 8).

---

## 3.6 Chauffeurs

Een chauffeur is de persoon die namens de klant mag rijden. Je koppelt hem aan de klant, en bij
het maken van een reservering kun je hem als **Gemachtigde chauffeur** aanwijzen (hoofdstuk 5).
Zo weet je achteraf wie de auto werkelijk had.

**Een chauffeur toevoegen**

1. Open de klant met **Bekijken**.
2. Klik op het tabblad **Chauffeurs**. Je ziet het kaartje **Bevoegde chauffeurs** — *Beheer
   chauffeurs die voertuigen mogen huren voor deze klant*.
3. Klik rechtsboven in dat kaartje op **Chauffeur toevoegen**.

   ![Het tabblad Chauffeurs met de knoppen Chauffeur toevoegen (1) en Verwijderde chauffeurs (2) en de lijst met chauffeurs](afbeeldingen/03-chauffeurs.png)
   *Het tabblad **Chauffeurs**: 1 **Chauffeur toevoegen**, 2 **Verwijderde chauffeurs** (de prullenbak
   van deze klant). In de lijst staat de hoofdchauffeur met het label **Hoofd**.*
4. Vul in het venster **Chauffeur toevoegen** minstens **Weergavenaam** in; dat is het enige
   verplichte veld (er staat een sterretje bij). Verder kun je kwijt: **Voornaam**,
   **Achternaam**, **E-mailadres**, **Telefoonnummer**, **Rijbewijsnummer**, **Land van afgifte
   rijbewijs**, **Vervaldatum rijbewijs**, een **Kopie rijbewijs (optioneel)** (JPG, PNG of PDF,
   maximaal 10 MB), **Voorkeurstaal**, **Status** (**Actief** of **Inactief**) en **Notities**.
5. Is dit de vaste bestuurder van deze klant, zet dan **Hoofdchauffeur** aan.
6. Klik op **Chauffeur toevoegen**.

![Het venster Chauffeur toevoegen met het veld Weergavenaam (1) en de knop Chauffeur toevoegen (2)](afbeeldingen/03-chauffeur-toevoegen.png)
*Het venster **Chauffeur toevoegen**: 1 **Weergavenaam** (verplicht), 2 **Chauffeur toevoegen**.*

Je krijgt **Chauffeur toegevoegd** — *De chauffeur is succesvol toegevoegd.*

Vul de **Vervaldatum rijbewijs** in als je hem weet. In de lijst krijgt de chauffeur dan het
label **Verloopt: <datum>**, en na die datum **Verlopen**. Dat is het enige plekje waar je ziet
dat een rijbewijs afloopt.

**Een chauffeur bekijken, wijzigen of verwijderen.** In de lijst staan per regel de kolommen
**Chauffeur**, **Contact**, **Rijbewijs**, **Voertuig**, **Status** en **Acties**, met de knoppen
**Bekijken**, **Bewerken** en **Verwijderen**. De hoofdchauffeur heeft het label **Hoofd**; een
chauffeur met een eigen portaallogin het label **Portaalaccount**. Onderaan het venster van een
chauffeur staat **Geschiedenis**: wie wat wanneer aan deze chauffeur heeft gewijzigd (hoofdstuk 10,
paragraaf 10.5).

Bij **Verwijderen** vraagt de app: *Weet je zeker dat je <naam> wilt verwijderen? De chauffeur gaat naar
de prullenbak van deze klant; terugzetten kan via Prullenbak.* Een verwijderde chauffeur is dus niet weg:
hij staat in de prullenbak van deze klant en je kunt hem terugzetten. Twijfel
je of je hem ooit nog nodig hebt, zet hem dan op **Inactief** in plaats van hem te verwijderen.

**De prullenbak van de chauffeurs.** In de kop van het kaartje **Bevoegde chauffeurs** staat de knop
**Verwijderde chauffeurs**. Hij laat alleen de verwijderde chauffeurs van déze klant zien. De knop staat er
grijs als je het vinkje **Prullenbak beheren** niet hebt (hoofdstuk 15, paragraaf 15.16). Per regel kun je:

- **Terugzetten** — de chauffeur komt terug, met de koppelingen aan reserveringen en bekeuringen waar die
  reserveringen en bekeuringen nog bestaan. Bestaat de klant zelf niet meer, dan weigert de app met *De
  klant van deze chauffeur bestaat niet meer. Zet eerst de klant terug (Klanten, Verwijderde klanten) en
  daarna de chauffeur.* Zet de klant dan eerst terug (3.8).
- **Definitief verwijderen** — de chauffeur is dan echt weg, samen met de kopie van het rijbewijs.
  Reserveringen en bekeuringen die naar hem verwezen, krijgen die koppeling nooit meer terug.

> **Let op bij een verzoek om gegevens te wissen.** De persoonsgegevens van een verwijderde chauffeur
> (naam, contactgegevens, rijbewijsnummer en de kopie van het rijbewijs) blijven in de prullenbak staan
> tot die geleegd is. Vraagt iemand om zijn gegevens te laten wissen, verwijder de chauffeur dan niet
> alleen, maar kies ook **Definitief verwijderen** in **Verwijderde chauffeurs**. Alles over de
> prullenbakken staat in hoofdstuk 10, paragraaf 10.6.

Staan er veel chauffeurs, gebruik dan het zoekveld *Zoek chauffeurs op naam, e-mail, telefoon of
rijbewijs...* boven de lijst. Onder de lijst staat bijvoorbeeld *Pagina 1 van 2 (12 chauffeurs)*
met **Vorige** en **Volgende**.

---

## 3.7 Het portaalaccount van een klant

Via het klantenportaal kan een klant zelf online meekijken en aanvragen doen. Je regelt dat per
klant op het tabblad **Portaal**.

Het tabblad bestaat van boven naar beneden uit: **Portaalaccounts**, **Instellingen voor deze
klant**, **Aanvragen**, **Bekeuringen** en **Activiteit in het portaal**.

### Iemand uitnodigen

1. Open de klant met **Bekijken** en ga naar het tabblad **Portaal**.
2. Staat er nog niets, dan lees je *Nog geen accounts. Nodig een contactpersoon uit.*

   ![Het tabblad Portaal (1) met bovenaan Portaalaccounts en de knop Uitnodigen (2)](afbeeldingen/03-portaal-tabblad.png)
   *Het tabblad **Portaal** (1): bovenaan **Portaalaccounts** met de knop **Uitnodigen** (2), daaronder
   **Instellingen voor deze klant**.*
3. Klik op **Uitnodigen**. Het venster **Portaalaccount** opent.

   ![Het venster Portaalaccount met het e-mailadres (1) en de knop Uitnodigen (2)](afbeeldingen/03-portaalaccount-uitnodigen.png)
   *Het venster **Portaalaccount**: 1 het **E-mailadres** staat al ingevuld, 2 **Uitnodigen** verstuurt de
   uitnodiging.*
4. **E-mailadres** is alvast ingevuld vanuit de klantgegevens — er staat bij: *Vooraf ingevuld
   vanuit de klantgegevens; aanpassen mag.* Controleer het adres, want de uitnodiging gaat
   daarheen.
5. Vul de **Naam** in en kies de **Rol**: **Beheerder** (mag alles wat de klant mag) of
   **Bestuurder** (één chauffeur). Kies je **Bestuurder**, dan moet je ook een **Gekoppelde
   bestuurder** aanwijzen.
6. Onder **Rechten voor dit account** kun je per onderdeel een vinkje weghalen. Er staat bij:
   *Uitvinken haalt een onderdeel weg voor dit account. De instellingen van de klant blijven de
   bovengrens.* Je kunt dus nooit méér geven dan de klant zelf mag (zie hieronder).
7. Klik op **Uitnodigen**.

De klant krijgt een uitnodiging per e-mail. In de tabel staat de regel daarna met status
**Uitnodiging open**.

### De accountlijst lezen

De tabel heeft de kolommen **Naam**, **E-mail**, **Rol**, **Status** en **Laatste login**. De
statussen die je tegenkomt:

| Status | Betekenis |
|---|---|
| **Uitnodiging open** | De uitnodiging is verstuurd, de klant heeft nog niets gedaan |
| **Niet geactiveerd** | Er is een account, maar het is nog nooit gebruikt |
| **Actief** | De klant kan inloggen |
| **Geblokkeerd** | Het account is dichtgezet |

Achter een regel zit een menuutje met **Bewerken en rechten**, **Uitnodiging opnieuw sturen**
(alleen zolang het account niet geactiveerd is), **Wachtwoord-reset sturen** (alleen als het wél
geactiveerd is), **Blokkeren** / **Deblokkeren** en **Verwijderen** (alleen bij een
niet-geactiveerd account).

Met **Alles bekijken en zoeken** open je de volledige accountlijst van alle klanten.

> **Wachtwoorden van portaalaccounts.** De wachtwoordregel van hoofdstuk 10 (10 tekens met hoofdletter,
> kleine letter en cijfer) geldt voor medewerkers van het kantoor, niet voor portaalaccounts. De klant
> kiest zelf een wachtwoord via de uitnodiging; daarvoor geldt een eigen, kortere regel (minimaal 10
> tekens, zonder eisen aan hoofdletters of cijfers). Jij zet dat wachtwoord nooit; je stuurt alleen een
> uitnodiging of een reset.

**De melding klopt nu met wat er gebeurde.** Stuur je een uitnodiging of een wachtwoord-reset en komt de
mail niet uit de mailserver, dan staat er in het rood *De e-mail is niet verstuurd. Controleer de
e-mailinstellingen en probeer het opnieuw.* Vroeger stond er toch **E-mail verstuurd.** **Blokkeren**
vraagt eerst **Account blokkeren?** — *<naam> kan daarna niet meer inloggen in het portaal. U kunt het
account later weer deblokkeren.*, en geeft daarna **Account geblokkeerd.** (of **Account gedeblokkeerd.**).
**Verwijderen** vraagt in hetzelfde soort venster **Account verwijderen?** en geeft **Account
verwijderd.** Bij een geblokkeerd account staan **Uitnodiging opnieuw sturen** en **Wachtwoord-reset
sturen** niet in het menu.

### Wat deze klant online mag

Onder **Instellingen voor deze klant** zet je per onderdeel een schakelaar aan of uit:

**Portaal actief · Mag online huren (aanvraag) · Mag bestuurders beheren · Mag aanvragen
indienen · Mag eerder inleveren (terugbrengen) aanvragen · Ziet bekeuringen · Ziet contracten en
schadeformulieren · Ziet prijzen**

Daaronder is ruimte voor **Interne notities (wat heeft deze klant nodig?)**. Klik op **Opslaan**;
je krijgt *Instellingen opgeslagen.*

![De schakelaars onder Instellingen voor deze klant, met Portaal actief (1) en Ziet prijzen (2)](afbeeldingen/03-portaal-instellingen.png)
*De schakelaars onder **Instellingen voor deze klant**: 1 **Portaal actief** is de hoofdschakelaar,
2 **Ziet prijzen** staat hier uit, dus deze klant ziet geen bedragen in het portaal.*

Onder elke schakelaar staat één regel die zegt wat hij doet, bijvoorbeeld bij **Portaal actief**: *Uit:
niemand van deze klant kan nog inloggen in het portaal.* Zet je een schakelaar om, dan meldt de app
welke schakelaar je hebt omgezet en staat er blijvend *Opgeslagen om 14:32*. De schakelaars van de
fiscale check zijn grijs zolang de hoofdschakelaar uit staat, met een regel die dat uitlegt.

Deze instellingen zijn de bovengrens. Staat **Ziet prijzen** hier uit, dan ziet geen enkel
account van deze klant prijzen, ook niet als dat vinkje bij het account zelf aan staat.

### Bedrijfsgegevens die de klant zelf aanpast

In het portaal ziet een beheerder van de klant onder **Mijn account** → **Bedrijf** de gegevens die jij
van het bedrijf hebt: contactpersoon, telefoonnummer, adres, factuuradres en de vier e-mailadressen. Die
past de klant zelf aan, en ze staan meteen in het klantrecord. Je krijgt een melding met in woorden wat
er is gewijzigd (bijvoorbeeld *telefoonnummer, adres*). Slaat de klant op zonder iets te wijzigen, dan
krijg je geen melding. KvK-nummer en btw-nummer staan niet in het portaal en blijven van jou.

Wijzigt de klant een van de vier **e-mailadressen**, dan vraagt het portaal om het wachtwoord van de klant ter bevestiging: die adressen bepalen waar facturen, bekeuringen en APK-berichten naartoe gaan. Voor adres en contactgegevens is dat niet nodig.

De **bedrijfsnaam** kan de klant niet zelf wijzigen, omdat die op contracten en facturen staat. Hij klikt
op **Wijziging aanvragen**, vult de nieuwe naam in en verstuurt. Dat komt bij jou als aanvraag
**Wijziging bedrijfsnaam** in het overzicht van aanvragen, met de gevraagde naam bovenaan. Met
**Goedkeuren** wordt de naam in het klantrecord aangepast; staat de korte naam van de klant nog gelijk aan
de oude bedrijfsnaam, dan gaat die mee. Met **Afwijzen** (met een antwoord) blijft alles zoals het was.
**Afhandelen** zonder goedkeuren kan niet, zodat de klant nooit hoort dat de naam is gewijzigd terwijl dat
niet zo is. Per klant staat er maar één aanvraag tegelijk open. Contracten en facturen die al gemaakt zijn
houden de oude naam tot je ze opnieuw aanmaakt.

Ook de klant vult zijn adres in met postcode en huisnummer: de straat en plaats verschijnen vanzelf, zoals
hierboven beschreven. Dat geldt voor het adres en het factuuradres.

### Wat een bestuurder in het portaal ziet

Een account met de rol **Bestuurder** ziet alleen zijn eigen reserveringen, bekeuringen, aanvragen en documenten. Het ziet ook niet de bestuurderslijst van het bedrijf (naam, telefoon, e-mail en rijbewijsnummer van collega's) en krijgt alleen meldingen onder het belletje die over zijn eigen auto gaan. Meldingen over bekeuringen, documenten en aanvragen verschijnen alleen als die onderdelen voor dat account aanstaan. Per klant staan maximaal 30 aanvragen tegelijk open; daarna moet de klant er eerst een laten afhandelen of intrekken.

### Ophalen en inleveren in het portaal

In elke reservering die loopt of nog moet beginnen staat bovenaan een blok met twee stappen onder elkaar: **Ophalen** en **Inleveren**. Elke stap zegt waar de auto wordt opgehaald of ingeleverd. Wat al gebeurd is staat in de verleden tijd met een vinkje en de datum (*Opgehaald bij ons*, *Gebracht naar …*, *Opgehaald bij …*); wat nog komt staat in de toekomende tijd. De stap die nu aan de beurt is toont een telling (*Over 3 dagen*, *Morgen*, *Nog 8 dagen*) en de knoppen.

- **Bij ons aan de zaak:** de stap toont het adres van de zaak. Is de stap nog niet geweest, dan staan ook de openingstijden erbij en bij ophalen de ophaalinstructies.
- **Gebracht of opgehaald op een locatie:** de stap noemt de plek in vet: *Wij brengen de auto naar …*, *Wij halen de auto bij u op …*, later *Gebracht naar …* en *Opgehaald bij …*. Het adres van de zaak staat er dan niet. De plek komt uit het reserveringsformulier (**Bezorgservice vereist** en **Ophaalservice bij inleveren**, zie hoofdstuk 5). Is er nog geen adres ingevuld, dan staat er *een locatie die we met u afspreken*.
- **Bij elk inleveren** (ook als wij de auto ophalen) staan de inleverinstructies: de auto schoon en compleet inleveren, anders brengen wij kosten in rekening. Onder het blok staat voor klanten die nog bij de zaak ophalen of inleveren de tekst dat brengen en ophalen kan, vanaf € 125.
- **Is de einddatum verstreken,** dan kleurt het blok rood met *x dagen te laat* en staat de knop **Verlengen** vooraan. **Eerder inleveren** vervalt dan.
- De knoppen **Verlengen** en **Eerder inleveren** staan bij de stap Inleveren, voor accounts die dat mogen.

De teksten **Inleverinstructies** en **Brengen en ophalen** pas je aan onder het portaalbeheer, bij de instellingen van het portaal (naast adres, openingstijden en ophaalinstructies).

### Welke e-mails de klant krijgt

De klant kiest zelf welke e-mails hij van het portaal wil ontvangen, in het portaal onder **Mijn
account** → **E-mailmeldingen**. Alles staat standaard aan. Er zijn twee soorten:

- **Per account:** de waarschuwing bij inloggen op een nieuw apparaat en het antwoord op een eigen
  aanvraag. Elk account kiest dit voor zichzelf. Zet iemand de waarschuwing voor een nieuw apparaat
  uit, dan staat daar in het portaal een waarschuwing bij dat hij dan niet merkt dat iemand anders inlogt.
- **Per bedrijf:** de mails over een verplaatste of geannuleerde reservering, over onderhoud en over
  een nieuw document. Deze gaan naar het e-mailadres van het bedrijf, niet naar één account. Alleen een
  beheerder van de klant wijzigt ze. Jij ziet ze ook onder **Instellingen voor deze klant**, bij
  **E-mails naar het bedrijfsadres**, en kunt ze daar zelf omzetten.

Wat de klant niet kan uitzetten: de uitnodiging, het herstellen van een wachtwoord en het bevestigen van
een nieuw e-mailadres. De melding onder het belletje in het portaal blijft altijd staan; alleen de e-mail
valt weg. Heeft een klant het antwoord op een aanvraag uitgezet, dan slaat de app het antwoord wel op en
ziet de klant het in het portaal, maar gaat er geen mail. Een bekeuring mail je zelf met **Klant
informeren**; dat staat los van deze keuzes.

Elke wijziging staat in **Activiteit in het portaal**, als *E-mailvoorkeur van account gewijzigd* of
*E-mailvoorkeur van bedrijf gewijzigd*. Zo zie je later wie een mail uitzette.

### Aanvragen, bekeuringen en activiteit

Onder het accountblok staan drie overzichtjes: **Aanvragen** (wat deze klant online heeft
gevraagd), **Bekeuringen** en **Activiteit in het portaal**. Ze tonen alleen de laatste regels;
met **Alles bekijken en zoeken** ga je naar het volledige overzicht op het scherm
**Klantenportaal**.

Het afhandelen van aanvragen doe je niet hier, maar op het scherm **Klantenportaal**, via de
tegel **Aanvragen**. Een onderhoudsaanvraag staat in hoofdstuk 7. In een aanvraag kun je met
**Standaardantwoord invullen** een van de knoppen **Ontvangen**, **Akkoord** of **Afwijzing** kiezen:
de tekst komt in het antwoordveld en je mag hem nog aanpassen. **Bericht plaatsen** zet een bericht in
de draad met de klant, *de aanvraag blijft open en er gaat geen e-mail uit*; **Antwoord mailen (blijft
open)** stuurt wél een e-mail. Datums in dit venster staan als dd-mm-jjjj.

**Voertuigen online** (de tegel op het scherm **Klantenportaal**) toont de status van elke auto in
woorden. Zet je een auto online die niet verhuurbaar is (bijvoorbeeld **Reparatie nodig** of **Niet voor
verhuur**), dan vraagt de app eerst *<kenteken> heeft de status "…" en kan niet worden verhuurd. Klanten
kunnen het dus niet boeken zolang die status zo blijft. Toch online aanbieden?*, met de knop **Toch online
aanbieden**. Dat geldt ook als je er meerdere tegelijk aanvinkt. De tegel **Activiteit** en de
meldingen laten acties en velden in gewone woorden zien, niet meer met de interne naam van het veld.

---

## 3.8 Een klant verwijderen

Verwijder een klant alleen als hij er echt niet hoort te staan — bijvoorbeeld een dubbel
aangemaakte kaart. Een klant met geschiedenis laat je staan.

1. Klik in de klantenlijst bij de juiste regel op **Verwijderen**.
2. Je krijgt het venster **Klant verwijderen**. Daarin staat eerst *Dit verwijdert ook:* met de
   lijst van wat er aan deze klant hangt — bijvoorbeeld *6 reserveringen*, *1 chauffeur*,
   *1 portaalinstelling*. Hangt er niets aan, dan staat er *Er is niets anders aan deze klant
   gekoppeld.*
3. Eronder staat *Een beheerder kan de klant daarna terugzetten vanuit de prullenbak.*
4. Typ de naam van de klant over in het veld **Typ <naam> om te bevestigen**. Zolang die niet
   klopt, blijft **Klant verwijderen** uitgeschakeld. Hoofdletters en extra spaties maken niet uit.

   ![Het venster Klant verwijderen met het veld om de naam over te typen (1) en de knop Klant verwijderen (2)](afbeeldingen/03-klant-verwijderen.png)
   *Het venster **Klant verwijderen**: typ de naam over in veld 1; pas dan wordt knop 2, **Klant
   verwijderen**, blauw.*
5. Klik op **Klant verwijderen**, of op **Annuleren** als je twijfelt.

**De app weigert als er nog een huur aan hangt.** Heeft de klant een lopende of toekomstige
reservering, dan zie je dat meteen bovenin het venster, in het rood:

> *Verwijderen kan niet: deze klant heeft een lopende of toekomstige reservering.*
> *Reservering #3370 — 13-09-2026 t/m 16-09-2026 (Geboekt)*
> *Rond die reservering af of annuleer hem eerst; daarna kan de klant naar de prullenbak.*

De knop **Klant verwijderen** blijft dan uit, ook als je de naam correct overtypt — je hoeft dus
niet eerst te klikken om de weigering te zien. Sluit het venster met **Annuleren**, rond eerst de
huur af of annuleer hem (5.9), en probeer het daarna opnieuw. Dat is met opzet: een klant
weghalen onder een lopende huur zou het contract en de factuur losmaken van de persoon die de
auto heeft.

**Terugzetten kan.** Een verwijderde klant komt in de prullenbak van dit scherm: de knop
**Verwijderde klanten** naast **Klant toevoegen**. Daar zet je hem terug met **Terugzetten**, of
haal je hem — als hij er echt nooit had moeten staan — voorgoed weg met **Definitief verwijderen**.
Dat mag iedereen met het vinkje **Prullenbak beheren** (hoofdstuk 15, paragraaf 15.16); zonder dat
vinkje staat de knop er grijs. Let op: de tekst in het venster zegt nog *Een beheerder*, maar het
vinkje bepaalt wie het mag. Alles over de prullenbak staat in hoofdstuk 10, paragraaf 10.6.

![Het venster Verwijderde klanten met per regel Terugzetten en Definitief verwijderen](afbeeldingen/03-verwijderde-klanten.png)
*De prullenbak **Verwijderde klanten**: per regel wie de klant wanneer verwijderde, wat eraan hing,
en de knoppen **Terugzetten** en **Definitief verwijderen**.*

**Een dubbele klant opruimen doe je zo:**

1. Zet de reserveringen van de dubbele kaart over met **Klant wijzigen** op de reservering
   (hoofdstuk 5, paragraaf 5.5).
2. Verwijder daarna de lege dubbele kaart.

---

## 3.9 Debiteurnummer: als het al bezet is

Vul je op het tabblad **Basisgegevens** een **Debiteurnummer** in dat al bij een andere klant
hoort, dan weigert de app op te slaan. Dat geldt bij het aanmaken, bij het bewerken, én bij het
snel toevoegen van een klant vanuit een reservering (hoofdstuk 5) — het is overal hetzelfde
formulier. Onder het veld verschijnt een rode veldfout:

> *Dit debiteurnummer is al in gebruik bij klant <naam>.*

Dit is een echte blokkade, geen waarschuwing zoals in 3.4: opslaan lukt pas als je een ander
nummer intypt of het veld leeg maakt. Het maakt niet uit of je het net iets anders schrijft —
hoofdletters of een spatie erbij maken geen verschil, de app vergelijkt op het kale nummer.
Verbeter je het veld, dan verdwijnt de foutmelding vanzelf bij de eerstvolgende toets.

Je krijgt alleen deze veldmelding, geen rode melding rechtsboven erbij. Zat je op een ander
tabblad toen je op **Klant toevoegen** klikte, dan springt de app terug naar **Basisgegevens** en
staat de cursor in het veld **Debiteurnummer**.

**Zit de andere klant in de prullenbak?** Dan blijft zijn nummer toch bezet, en zie je in plaats
daarvan:

> *Dit debiteurnummer hoort bij klant <naam> in de prullenbak. Zet die klant terug of verwijder
> hem definitief uit de prullenbak.*

Je hebt twee mogelijkheden, allebei in **Verwijderde klanten** op het scherm **Klanten** (3.8): de
klant **terugzetten**, of hem **definitief verwijderen**. Verwijder je hem definitief, dan komt het
debiteurnummer meteen weer vrij en kun je het aan een andere klant geven. Beide kan iedereen met het
vinkje **Prullenbak beheren**; heb je dat niet, overleg dan met iemand die het wel heeft.

**Het veld mag gewoon leeg blijven.** Een debiteurnummer is niet verplicht. Alleen als je er wel
een invult, moet het uniek zijn.

---

## 3.10 Snel naslaan

| Wat je wilt | Waar |
|---|---|
| Een klant zoeken | **Klanten** → **Klanten zoeken**, of het zoekveld bovenin |
| Een klant aanmaken | **Klanten** → **Klant toevoegen** |
| Een klant wijzigen | **Bekijken** → **Bewerken** |
| Meteen boeken voor deze klant | **Nieuwe reservering** in de lijst of in het klantvenster |
| Een chauffeur toevoegen | **Bekijken** → **Chauffeurs** → **Chauffeur toevoegen** |
| Een verwijderde chauffeur terughalen | **Bekijken** → **Chauffeurs** → **Verwijderde chauffeurs** → **Terugzetten** (vraagt het vinkje **Prullenbak beheren**) |
| Een portaallogin regelen | **Bekijken** → **Portaal** → **Uitnodigen** |
| Zien wat een klant online mag | **Bekijken** → **Portaal** → **Instellingen voor deze klant** |
| Een auto blokkeren voor deze klant | **Bekijken** → **Persoonlijke gegevens** → **Geblokkeerde voertuigen** → **Voertuig blokkeren** |
| Een blokkade opheffen | **Bekijken** → **Geblokkeerde voertuigen** → **Blokkade opheffen** → bevestigen |
| Een klant verwijderen | **Verwijderen** in de lijst (lukt niet bij een lopende huur) |
| Debiteurnummer al bezet | Veldfout onder **Debiteurnummer** (ook tegen de prullenbak), zie 3.9 |
| Een verwijderde klant terughalen | **Klanten** → **Verwijderde klanten** → **Terugzetten** (vraagt het vinkje **Prullenbak beheren**) |
| Een debiteurnummer vrijmaken van een verwijderde klant | **Klanten** → **Verwijderde klanten** → **Definitief verwijderen** |
