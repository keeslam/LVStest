# 10. Beheer

Dit hoofdstuk gaat over het beheerdeel van de app: gebruikers en hun rechten, de instellingen,
de mailinstellingen, de back-ups, de geschiedenis per record en de prullenbak.

Bijna alles in dit hoofdstuk kan alleen een **beheerder**. Herken je de schermen hieronder niet,
dan heb je geen beheerdersaccount — dat is geen storing.

---

## 10.1 Waar het beheer zit

Het beheer staat **niet** in het menu aan de linkerkant. Je vindt het via je eigen naam
rechtsboven in het scherm. Onder het kopje **Beheer** staan drie ingangen:

| Ingang | Waarvoor |
|---|---|
| **Gebruikers** | Accounts aanmaken, wijzigen en rechten geven |
| **Back-upbeheer** | Back-ups bekijken, maken, downloaden en terugzetten |
| **App-instellingen** | Alle instellingen van de app, inclusief e-mail |

Daarboven staan **Profiel** (je eigen gegevens en wachtwoord) en de taalknop. Die zijn voor
iedereen.

---

## 10.2 Gebruikers en rechten

Kies **Gebruikers**. Het scherm heet **Gebruikersbeheer**. Heb je geen beheerdersaccount, dan
staat er **Toegang geweigerd** — *"Je hebt geen toestemming voor deze functie."*

### Een gebruiker toevoegen

Klik op **Gebruiker toevoegen**. Je krijgt het formulier **Nieuwe gebruiker toevoegen**:

| Veld | Toelichting |
|---|---|
| **Gebruikersnaam** | De inlognaam. Kan later niet meer gewijzigd worden. |
| **Wachtwoord** | Minimaal 6 tekens. Bij het bewerken van een bestaande gebruiker: leeg laten om het huidige wachtwoord te behouden. |
| **Volledige naam** | De naam die overal in de app bij wijzigingen komt te staan. |
| **E-mail** | Het adres van de medewerker. |
| **Rol** | Zie hieronder. |
| **Actief** | *"Gebruiker kan inloggen wanneer actief"*. Zet je dit uit, dan kan de medewerker niet meer inloggen, maar blijft alles wat hij ooit deed zichtbaar in de geschiedenis. |
| **Prijzen verbergen** | *"Gebruiker ziet nergens in de app prijzen/geldbedragen"*. |

Opslaan met **Gebruiker aanmaken** of **Gebruiker bijwerken**.

**Een medewerker die weggaat, zet je op inactief.** Verwijderen kan ook, maar dan is de link
tussen zijn naam en zijn wijzigingen minder duidelijk. De bevestiging is: *"Weet je zeker dat je
gebruiker "…" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."*

### Rollen

Er zijn zeven rollen: **Beheerder**, **Manager**, **Gebruiker**, **Schoonmaker**, **Kijker**,
**Accountant** en **Onderhoud**.

De rol **Beheerder** is bijzonder: een beheerder mag alles, ongeacht de vinkjes. Alleen een
beheerder kan een nieuwe beheerder aanmaken; probeert iemand anders dat, dan weigert de app met
*"Only an administrator can create an administrator account"*.

Voor de andere rollen bepalen de vinkjes wat iemand mag.

### De rechten (de vinkjes)

Onder **Aanvullende rechten** staat *"Selecteer aanvullende rechten voor deze gebruiker"* en
daaronder een raster met alle rechten. Je vinkt aan wat iemand nodig heeft. De belangrijkste:

| Vinkje | Wat het toestaat |
|---|---|
| Gebruikers beheren | Accounts en rechten wijzigen, en de activiteitenlog bekijken |
| Voertuigen bekijken / Voertuigen beheren | Het wagenpark inzien / voertuigen toevoegen en wijzigen |
| Klanten bekijken / Klanten beheren | Klantgegevens inzien / wijzigen |
| Reserveringen bekijken / Reserveringen beheren | Huren inzien / boeken, wijzigen, ophalen en innemen |
| **Documenten bekijken** | Documenten openen, downloaden en afdrukken |
| **Documenten bewerken en genereren** | Contracten en schadechecks maken, opnieuw genereren, uploaden, mailen en verwijderen |
| PDF-sjablonen beheren | De contract- en transportsjablonen wijzigen |
| Schadecontroles bekijken / beheren | Schadechecks inzien / maken en de sjablonen wijzigen |
| Onderhoud beheren | Onderhoudsblokken plaatsen en afronden |
| Kosten beheren | Kosten registreren |
| Rapporten bekijken / beheren | De rapportenmodule |
| Boetes bekijken / beheren | Bekeuringen |
| Klantportaal bekijken / beheren | Het klantenportaal |
| Meldingen beheren | APK- en onderhoudsherinneringen versturen |
| E-mailsjablonen beheren | De sjabloonbouwer onder Communicatie |
| Instellingen beheren | De app-instellingen, inclusief de mailinstellingen |
| Back-ups beheren | Back-ups maken en terugzetten |
| Kilometerverlaging goedkeuren | Een lagere kilometerstand mogen invoeren dan de vorige |
| Dashboard bekijken | Het dashboard |

**De twee documentvinkjes zijn met opzet gescheiden.** In een contract staan het adres, het
telefoonnummer en het rijbewijsnummer van de klant. Wie die gegevens niet nodig heeft, krijgt
geen van beide vinkjes. Wie contracten moet kunnen uitdraaien, krijgt **Documenten bewerken en
genereren**; dat vinkje geeft automatisch ook inzage.

Met de knop **Bekijken** bij een gebruiker zie je in één oogopslag onder **Rechten** wat hij wel
en niet mag. Bij een beheerder staat alles aangevinkt.

---

## 10.3 App-instellingen

Kies **App-instellingen**. Het scherm heet **Applicatie-instellingen** — *"Beheer de
configuratie van je verhuursysteem"*. Het heeft acht tabbladen:

| Tabblad | Wat je er instelt |
|---|---|
| **Bedrijfsregels** | Standaardwaarden voor een verhuring, het brandstofbeleid, het toltarief per kilometer en het depotadres |
| **Meldingen** | Hoeveel dagen van tevoren een APK-, garantie- of onderhoudsherinnering verschijnt |
| **Documenten** | Factuur- en contractinstellingen, en het **Startcontractnummer** |
| **Doc-e-mails** | De teksten van de mails waarmee je documenten verstuurt |
| **Kalender** | Feestdagen, geblokkeerde datums, de onderhoudskalender en de onderhoudsintervallen |
| **E-mail & GPS** | De mailservers en de GPS-instellingen — zie hoofdstuk 9 |
| **Activiteit** | Het **Activiteitenlog**: wie heeft wat gewijzigd, en wanneer |
| **Klantenportaal** | De instellingen van het portaal |

Twee instellingen komen vaak terug:

- **Startcontractnummer** — *"Dit vormt de basis voor automatisch gegenereerde
  contractnummers"*. Daaronder staat **Volgend contractnummer**. Opslaan met
  **Startnummer opslaan**. Wil je eenmalig van de reeks afwijken, gebruik dan **Slimme override**
  met **Override instellen** en later **Override wissen**. Vul je een onmogelijk getal in, dan
  weigert de app: *"Must be a whole number between 1 and 2147483647"*.
- **Toltarief (€ per km)** — *"Wordt gebruikt om een tolkost voor te stellen op basis van de
  ingevoerde afstand bij een transport"*.

Zonder het recht **Instellingen beheren** kun je de instellingen wel openen maar niet opslaan.
De app antwoordt dan:

> *Not authorized. One of these permissions required: manage_settings*

---

## 10.4 Back-ups

Kies **Back-upbeheer**. Het scherm heet **Back-up & Herstel**.

### Wat er 's nachts gebeurt

De app maakt **elke nacht om 02:00 uur** (Nederlandse tijd) automatisch twee bestanden:

1. **De database** — alle gegevens: voertuigen, klanten, reserveringen, documentregels,
   instellingen, gebruikers.
2. **De geüploade bestanden** — de map met de PDF's en de scans die in de app staan.

De broncode van de app wordt níét meegenomen in de nachtelijke back-up; die staat elders.

De bestanden worden weggeschreven in mappen per jaar, maand en dag. Waar dat is, zie je in het
scherm bij **Back-uplocatie:**.

Draaide de app om 02:00 uur niet, dan wordt de back-up ingehaald: vijf minuten na het opstarten
maakt de app er alsnog een, als de laatste geslaagde ouder is dan een dag.

**Hoelang blijven ze staan?** De app ruimt zelf op, maar houdt altijd van elk soort de nieuwste
back-up. Verder geldt: alles van de laatste twee weken blijft staan; daarna nog de
zondagsback-ups; na acht weken nog alleen die van de eerste van de maand; ouder dan een jaar
wordt opgeruimd. Een back-up die je zelf hebt geüpload, wordt nooit opgeruimd.

### Controleren of er een back-up is

Bovenin het scherm staan drie regels die je regelmatig moet lezen:

- **Laatste back-up** — datum en tijd, of **Nooit** als er nog geen is.
- **Volgende back-up** — **Vannacht om 02:00 uur**.
- **Laatste back-upfout:** — staat er alleen als de laatste poging misging.

Daaronder staan de **Recente automatische back-ups**, gesplitst in **Database-back-ups** en
**Bestand-back-ups**.

Is er langere tijd geen geverifieerde back-up gemaakt, dan verschijnt er ook op het dashboard
een balk: **Geen geverifieerde back-up in 30 uur** met *"Open Back-up & Herstel om er nu een uit
te voeren."* Negeer die balk niet.

Met **Nu back-uppen** maak je er meteen een, los van het schema. De schakelaar
**Ingeschakeld / Uitgeschakeld** zet het nachtelijke schema aan of uit.

### Downloaden

Achter elke back-up staat **Downloaden**. Daarmee haal je het bestand naar je eigen computer.
Bewaar het op een andere plek dan de server.

Onder **Handmatige back-up & herstel** staan drie kaarten: **App-gegevens** ("Al je
bedrijfsgegevens"), **Geüploade bestanden** ("Documenten & contracten") en **App-code**
("Broncodebestanden"). Zie hoofdstuk 12 voor wat daar op dit moment wel en niet van werkt.

### Herstellen — waarom dit een beheerdershandeling is

Herstellen betekent: **alle gegevens van nu worden vervangen door de gegevens uit de back-up.**
Alles wat sinds die back-up is ingevoerd — reserveringen, ophalingen, klanten, contracten — is
daarna weg. Dat is geen "terugzetten van één foutje"; daarvoor gebruik je de prullenbak
(paragraaf 10.6) of de geschiedenis (paragraaf 10.5).

De app maakt het bewust moeilijk. Klik je op **Herstellen**, dan verschijnt:

> **Waarschuwing: deze back-up herstellen**
> *"Dit overschrijft de huidige actieve database met de inhoud van &lt;bestandsnaam&gt;. Er wordt
> automatisch een verse back-up van de huidige status gemaakt en geverifieerd voordat het
> herstel start, maar het herstel zelf kan niet ongedaan worden gemaakt."*
> *"Typ de exacte bestandsnaam hieronder ter bevestiging:"*

De knop **Ja, herstel deze back-up** blijft grijs tot je de bestandsnaam letterlijk hebt
overgetypt. Dat is met opzet: je kunt niet per ongeluk op de verkeerde regel klikken.

**Voordat er ook maar iets wordt overschreven, maakt de app eerst een veiligheidskopie van de
huidige gegevens en controleert of die kopie deugt.** Lukt dat niet, dan gaat het herstel niet
door:

> *Refusing to restore: could not take a verified safety backup of the current data first …
> Restoring now would overwrite live data with no way back.*

Gaat het wel door, dan staat de naam van die veiligheidskopie in de bevestiging: *"Een back-up
van je vorige gegevens is opgeslagen als &lt;bestandsnaam&gt;."* **Schrijf die naam op.** Dat is je
weg terug.

Na het herstellen moet je je browser vernieuwen en opnieuw inloggen.

### Een back-up die niet deugt wordt geweigerd

De app controleert het bestand vóór het herstel en weigert met uitleg in plaats van halverwege
te stoppen. De meldingen beginnen allemaal met *Refusing to restore:* en eindigen met
*Nothing was changed* — er is dan dus niets kapotgegaan:

| Melding | Wat het betekent |
|---|---|
| *the dump is only 45 bytes — it is empty or truncated* | Het bestand is leeg of half gedownload |
| *that file does not look like a PostgreSQL dump* | Verkeerd bestand gekozen |
| *the dump does not end with the "PostgreSQL database dump complete" marker* | Het bestand is afgebroken |
| *the archive is corrupt or truncated and could not be decompressed* | Het bestand is beschadigd |
| *this archive restores into the database "X", not "Y"* | Deze back-up hoort bij een andere omgeving |
| *the archive contains N entries that would be written outside the uploads directory* | Het bestandsarchief bevat iets wat er niet in hoort |

Gaat het herstel zelf onderweg mis, dan wordt alles teruggedraaid: *"The restore failed and was
rolled back; the database was not changed."*

---

## 10.5 Geschiedenis per record

Bij elke reservering, elk voertuig en elke klant houdt de app bij wie wat wanneer veranderde.

Je vindt het onder het kopje **Geschiedenis**:

- **Reservering** — onderaan het venster van de reservering.
- **Voertuig** — het tabblad **Geschiedenis**.
- **Klant** — het tabblad **Geschiedenis**.

Onder het kopje staat: *"Elke wijziging aan dit record, met wie het deed en wanneer."*

Per regel zie je:

- **wat er gebeurde** (aanmaken, wijzigen, verwijderen, terugzetten);
- **wie** het deed — de gebruikersnaam, of **Systeem** als de app het zelf deed;
- **wanneer**, op de minuut;
- **welk veld** veranderde, met de oude waarde doorgestreept en de nieuwe erachter. Een leeg veld
  staat als `—`, een aan/uit-veld als `ja` of `nee`.

Is er niets veranderd, dan staat er: *"Er is nog niets gewijzigd aan dit record."*

Mag je de geschiedenis van dit soort record niet zien, dan staat er: *"Je hebt geen rechten om de
geschiedenis van dit record te bekijken."* Je hebt daarvoor het beheerrecht van dát soort record
nodig — dus **Reserveringen beheren** voor een reservering, **Voertuigen beheren** voor een
voertuig, **Klanten beheren** voor een klant.

**Gebruik dit bij elke discussie.** "Wie heeft die datum veranderd?" en "wanneer is dat
contractnummer gewijzigd?" staan hier gewoon in.

### Het volledige activiteitenlog

Een beheerder ziet alles bij elkaar: **App-instellingen → tabblad Activiteit → Activiteitenlog**
— *"Wie heeft wat gewijzigd, en wanneer."* Je filtert op **Zoeken** (kenteken, klant, veld of
actie), **Gebruiker**, **Actie**, **Vanaf** en **Tot en met**, en wist alles met
**Filters wissen**. De kolommen zijn **Wanneer**, **Wie**, **Actie**, **Object** en
**Wijzigingen**.

---

## 10.6 De prullenbak

Wat je verwijdert is niet weg. Het gaat naar de prullenbak en is daar terug te halen.

**Waar:** op het scherm **Voertuigen** staat rechtsboven de knop **Verwijderde voertuigen**.
Ondanks de naam staat daar alles in. Bij de bekeuringen staat een eigen knop **Prullenbak**.
Beide knoppen zijn alleen zichtbaar voor een beheerder.

**Wat erin zit:** vijf soorten records, elk met een label:
**Voertuig**, **Klant**, **Reservering**, **Transport** en **Boete**.

Per regel zie je wat het was, **Verwijderd &lt;datum&gt; door &lt;naam&gt;**, en **Bevat: …** — wat er nog
aan hangt (reserveringen, documenten, kosten). Is er niets, dan staat er *"geen gekoppelde
records"*.

**Terugzetten:** klik op **Terugzetten**. Alles wat met het record mee is gegaan, komt mee terug.
Je krijgt de melding **Teruggezet** — *"Het voertuig en zijn gegevens zijn terug."* Daarna staat
er bij de regel **Teruggezet &lt;datum&gt; door &lt;naam&gt;** en is de knop grijs.

De app weigert het terugzetten als dat niet meer kan. De meldingen:

| Melding | Wat het betekent |
|---|---|
| *This record was already restored.* | Iemand was je voor |
| *That deleted record no longer exists.* | De regel bestaat niet meer |
| *A vehicle with the same license plate already exists. Delete or rename it first.* | Er is intussen een nieuwe auto met datzelfde kenteken |
| *Another vehicle already uses the same barcode. Clear it there first.* | De barcode zit nu op een andere auto |
| **"Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode."** | De auto is inmiddels opnieuw verhuurd in die periode |

Elke keer dat iemand iets terugzet, komt dat in de geschiedenis te staan.

**Er is geen knop om de prullenbak definitief te legen.** Wat erin zit, blijft erin. De lijst
toont de honderd meest recente regels.

**Wie mag terugzetten:** alleen een beheerder. Dat betekent in de praktijk dat degene die de
fout maakte hem meestal niet zelf kan herstellen. Loop dus naar een beheerder in plaats van het
opnieuw in te typen.
