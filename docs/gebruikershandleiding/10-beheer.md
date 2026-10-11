# 10. Beheer

Dit hoofdstuk gaat over het beheerdeel van de app: gebruikers en hun rechten, de instellingen,
de mailinstellingen, de back-ups, de geschiedenis per record en de prullenbak.

Bijna alles in dit hoofdstuk kan alleen een **beheerder**. Herken je de schermen hieronder niet,
dan heb je geen beheerdersaccount — dat is geen storing. De prullenbakken (10.6) zijn de uitzondering:
die openen ook voor wie het vinkje **Prullenbak beheren** heeft.

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
| **Wachtwoord** | Bij een nieuwe gebruiker verplicht; laat je het leeg, dan staat er *Een wachtwoord is verplicht*. Het moet voldoen aan de wachtwoordregel hieronder. Bij het bewerken van een bestaande gebruiker: leeg laten om het huidige wachtwoord te behouden. |
| **Volledige naam** | De naam die overal in de app bij wijzigingen komt te staan. |
| **E-mail** | Het adres van de medewerker. |
| **Rol** | Zie hieronder. |
| **Actief** | *"Gebruiker kan inloggen wanneer actief"*. Zet je dit uit, dan kan de medewerker niet meer inloggen, maar blijft alles wat hij ooit deed zichtbaar in de geschiedenis. |
| **Prijzen verbergen** | *"Gebruiker ziet nergens in de app prijzen/geldbedragen"*. |

Opslaan met **Gebruiker aanmaken** of **Gebruiker bijwerken**. Het lukt, dan staat er **Gelukt** met
de naam erbij, bijvoorbeeld *Gebruiker "jan" is aangemaakt* of *Gebruiker "jan" is opgeslagen*. Lukt
het niet, dan staat er in het Nederlands waarom. Een gebruikersnaam die al bestaat geeft *Deze
gebruikersnaam is al in gebruik* onder het veld. Klopt er meer dan één veld niet (bijvoorbeeld de
gebruikersnaam is te kort en het wachtwoord ontbreekt), dan staan alle meldingen tegelijk onder hun
veld, zoals *De gebruikersnaam moet minstens 3 tekens hebben* en *Vul een geldig e-mailadres in*. Je
hoeft ze niet één voor één af te werken.

**De wachtwoordregel.** Elk wachtwoord van een medewerker heeft minimaal 10 tekens, met een hoofdletter, een
kleine letter en een cijfer. Onder het wachtwoordveld staat de hint *Minimaal 10 tekens, met hoofdletter,
kleine letter en cijfer*. Voldoet het wachtwoord niet, dan weigert de app met *Het wachtwoord voldoet niet
aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer*. Dezelfde regel geldt overal
waar een wachtwoord wordt gekozen: een nieuwe gebruiker, een wachtwoord dat een beheerder voor een ander
instelt, het wijzigen van je eigen wachtwoord in je **Profiel** (10.1). Een
wachtwoord dat al bestond, blijft gewoon werken; de regel geldt alleen voor een nieuw wachtwoord.
Portaalaccounts van klanten hebben een eigen, kortere regel (hoofdstuk 3, paragraaf 3.7).

**Je eigen wachtwoord zet je niet in Gebruikersbeheer.** Je eigen wachtwoord wijzig je in je **Profiel**,
onder **Wachtwoord wijzigen**, met je huidige wachtwoord erbij. Probeer je het via het formulier van je
eigen account, dan weigert de app met *Je eigen wachtwoord wijzig je via je profiel, onder Wachtwoord
wijzigen*. Een nieuw wachtwoord voor een ander account (een reset) zet een beheerder wel hier.

**Een leeg wachtwoordveld verandert nooit iets.** Sinds oktober 2026 geldt bij het bijwerken van een
gebruiker: staat het veld leeg (of staan er alleen spaties), dan blijft het wachtwoord zoals het was.
Tot dan kon een leeg veld het wachtwoord van het account leegmaken, of vervangen door spaties; dat is
hersteld. Een nieuw wachtwoord voor een **andere** gebruiker instellen kan alleen een beheerder; een
ander account dat het probeert, krijgt *Only an administrator can set another account's password*.

**Een medewerker die weggaat, zet je op inactief.** Verwijderen kan ook, maar dan is de link
tussen zijn naam en zijn wijzigingen minder duidelijk. Het verwijderknopje achter je **eigen** regel
en achter de **laatste actieve beheerder** is grijs en kan niet worden aangeklikt; houd je de muis
erboven, dan staat er *Je kunt je eigen account niet verwijderen* of *Dit is de laatste actieve beheerder;
die kan niet worden verwijderd*. Een andere beheerder kun je wél verwijderen, zolang er daarna nog een
actieve beheerder overblijft. De bevestiging is: *Weet je zeker dat je gebruiker "…" wilt verwijderen?
Deze actie kan niet ongedaan worden gemaakt.*

**De laatste beheerder blijft beschermd.** Er moet altijd minstens één actieve beheerder zijn. De app
weigert daarom met *De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere
rol krijgen* als je probeert de laatste actieve beheerder te verwijderen, op inactief te zetten of een
andere rol te geven. Wil je een nieuwe beheerder in plaats van de oude, maak dan eerst de nieuwe aan en
verwijder of degradeer daarna de oude.

**Verwijderen werkt nu ook bij wie ooit ingelogd of iets gedaan heeft.** Vroeger antwoordde de app *niet
gevonden* als je een account verwijderde dat al eens was gebruikt. Nu verdwijnt het account echt en
blijven de wijzigingen die het deed in de geschiedenis staan, met de gebruikersnaam als tekst erbij.

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
| **Overdracht terugdraaien** | Een ophaling, een inname of een annulering ongedaan maken (hoofdstuk 5, paragraaf 5.14) |
| **Opgehaalde huur annuleren of verwijderen** | Een huur die al is opgehaald annuleren of verwijderen (5.15) |
| **Prullenbak beheren** | De prullenbakken openen, iets terugzetten en definitief verwijderen (10.6) |

**De drie vinkjes van oktober 2026 hebben een eenmalige start.** **Overdracht terugdraaien**,
**Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren** hebben alle accounts met de
rol **Manager** één keer automatisch gekregen, bij de eerste start na de uitrol. Een beheerder heeft
ze altijd. Een manager die je daarna aanmaakt, krijgt ze niet vanzelf; vink ze zelf aan. Wie alleen
**Reserveringen beheren** heeft, kan niet terugdraaien en geen opgehaalde huur annuleren. Zie
hoofdstuk 15, paragraaf 15.16.

**De twee documentvinkjes zijn met opzet gescheiden.** In een contract staan het adres, het
telefoonnummer en het rijbewijsnummer van de klant. Wie die gegevens niet nodig heeft, krijgt
geen van beide vinkjes. Wie contracten moet kunnen uitdraaien, krijgt **Documenten bewerken en
genereren**; dat vinkje geeft automatisch ook inzage.

Met de knop **Bekijken** bij een gebruiker zie je in één oogopslag onder **Rechten** wat hij wel
en niet mag. Bij een beheerder staat alles aangevinkt. Ook in je eigen **Profiel** staan je rechten
met dezelfde Nederlandse namen als hier, en niet meer met de interne naam van het vinkje.

**Bij elk vinkje staat wat het nodig heeft.** Een recht werkt vaak pas als een ander recht ook aanstaat:
wie **Reserveringen beheren** heeft maar niet **Voertuigen bekijken** en **Klanten bekijken**, ziet op het
reserveringsscherm een lege lijst of een melding dat de gegevens ontbreken. Daarom staat onder elk vinkje
een regel *Heeft nodig: Voertuigen bekijken, Klanten bekijken* (de rechten die het scherm nodig heeft).

- Staan de benodigde rechten al aan, dan is de regel grijs.
- Mist er een, dan is de regel oranje, met een waarschuwingsteken.
- Rechten die het scherm prettiger maken maar niet nodig zijn, staan in de tekstballon als *Handig erbij: …*.
- Boven het raster staat de knop **Benodigde rechten ook aanzetten**. Die vinkt in één keer de ontbrekende
  benodigde rechten aan van alles wat je al hebt aangevinkt. De knop is grijs als er niets ontbreekt. Er
  gebeurt niets vanzelf bij het opslaan: jij beslist, en je kunt een recht daarna gewoon weer uitzetten.
- Een paar rechten zijn alleen voor beheerders: **Gebruikers beheren**, **Instellingen beheren** en **Back-ups
  beheren**. Bij een medewerker die geen beheerder is, staat daar *alleen voor beheerders* en kun je ze niet
  aanvinken. Stond zo'n vinkje al aan, dan kun je het wel uitzetten. De server zelf blijft dezelfde
  controle doen; dit is een hulp bij het kiezen, geen nieuwe beveiliging.
- Met de knop **Bekijken** zie je dezelfde regels, alleen bij de rechten die het account heeft.

**Een wijziging van rechten werkt meteen.** De app leest de rechten bij elke handeling opnieuw. Heb je
zojuist iemands vinkjes aangepast terwijl hij ingelogd is, dan ziet zijn scherm dat vanzelf; hij hoeft
niet uit en weer in te loggen.

### Geweigerde pogingen: de balk op het dashboard

Probeert een medewerker iets te doen waarvoor hij geen recht heeft, dan weigert de app dat en schrijft hij
het op. Als **beheerder** (de rol Beheerder, niet iedereen met het vinkje **Gebruikers beheren**) zie je
dat bij het inloggen: bovenaan het **Dashboard** staat een balk met *Sinds je vorige inlog (<datum>)
probeerden 3 medewerkers iets waarvoor ze geen recht hebben* (bij één medewerker: *probeerde 1 medewerker
iets waarvoor die geen recht heeft*).

- Klik op **Bekijken**. Het venster **Geweigerde pogingen** laat zien *Wat medewerkers probeerden sinds je
  vorige inlog (<datum>) en niet mochten.* Per regel staan **Wie**, **Wat** (een scherm, gegevens ophalen
  of wijzigen), het **Recht dat ontbrak** en **Wanneer**.
- Met het kruisje sluit je de balk voor de rest van die sessie. Er is geen balk als er niets te melden is,
  en ook niet bij je allereerste inlog (er is dan geen vorige inlog om mee te vergelijken).
- Dezelfde pogingen staan in het activiteitenlog (10.5) onder de actie *access.denied*, met de status
  *mislukt*. Er gaat geen e-mail uit.
- Dezelfde poging van dezelfde medewerker op dezelfde plek binnen vijf minuten telt als één. Ook één
  medewerker die een storm van pogingen veroorzaakt, vult het log niet: na 50 pogingen in een kwartier
  schrijft de app één regel *Meer geweigerde pogingen zijn niet apart vastgelegd* en daarna niets meer tot
  het kwartier om is. Zijn er meer regels dan het venster toont, dan staat er *Alleen de nieuwste … van …
  pogingen worden getoond.*

**Wat als "poging" telt.** Een poging is ook een onderdeel van een scherm dat een medewerker wel mag
openen, maar waarvan hij één stukje niet mag zien (bijvoorbeeld een tegel op het scherm waarvoor het
bijbehorende recht ontbreekt). De medewerker deed dan niets bewusts, en toch staat het erbij. Een rij
pogingen van één persoon die steeds hetzelfde onderdeel raakt, wijst dus eerder op een recht dat je
vergat aan te vinken (zie *Bij elk vinkje staat wat het nodig heeft*) dan op iemand die ergens
rondsnuffelt.

---

## 10.3 App-instellingen

Kies **App-instellingen**. Het scherm heet **Applicatie-instellingen** — *"Beheer de
configuratie van je verhuursysteem"*. Het heeft negen tabbladen:

| Tabblad | Wat je er instelt |
|---|---|
| **Bedrijfsregels** | Standaardwaarden voor een verhuring, het brandstofbeleid, het toltarief per kilometer, het depotadres, de tijdzone van het kantoor en de bedrijfsnaam voor alle mails |
| **Meldingen** | Hoeveel dagen van tevoren een APK-, garantie- of onderhoudsherinnering verschijnt |
| **Documenten** | Factuur- en contractinstellingen, en het **Startcontractnummer** |
| **Doc-e-mails** | De teksten van de mails waarmee je documenten verstuurt |
| **Kalender** | Feestdagen, geblokkeerde datums, de onderhoudskalender en de onderhoudsintervallen |
| **E-mail & GPS** | De mailservers en de GPS-instellingen — zie hoofdstuk 9 |
| **Activiteit** | Het **Activiteitenlog**: wie heeft wat gewijzigd, en wanneer |
| **Klantenportaal** | De instellingen van het portaal |
| **Voertuigen** | De kaart **RDW-voertuigtypes**: het wagenpark laten nalopen door de RDW (hoofdstuk 4, paragraaf 4.13) |

Vier instellingen komen vaak terug:

- **Startcontractnummer** — *"Dit vormt de basis voor automatisch gegenereerde
  contractnummers"*. Daaronder staat **Volgend contractnummer**. Opslaan met
  **Startnummer opslaan**. Wil je eenmalig van de reeks afwijken, gebruik dan **Slimme override**
  met **Override instellen** en later **Override wissen**. Vul je een onmogelijk getal in, dan
  weigert de app: *"Must be a whole number between 1 and 2147483647"*.
- **Toltarief (€ per km)** — *"Wordt gebruikt om een tolkost voor te stellen op basis van de
  ingevoerde afstand bij een transport"*.
- **Tijdzone van het kantoor** (tabblad **Bedrijfsregels**) — de tijdzone waarin de app bepaalt wat
  "vandaag" is, hoe laat de nachtelijke taken draaien en welke tijd op documenten en in exports staat.
  Zomer- en wintertijd gaan vanzelf mee. Standaard staat hij op *Europe/Amsterdam*, en dat is voor een
  kantoor in Nederland goed. Zoek een andere zone met **Zoek een tijdzone**, kies hem bij **Tijdzone**
  (de kaart zegt erbij of de zomer- of wintertijd nu actief is) en klik op **Tijdzone opslaan**. Je krijgt
  *De app rekent nu met <zone>.* Na het opslaan plannen de nachtelijke taken (back-up, APK-scan, fiscale
  run, meldingen en postvakken) zichzelf opnieuw in de nieuwe zone. Zet de tijdzone alleen om als het
  kantoor echt verhuist; kies je per ongeluk een andere, dan lopen datums en tijden een of meer uren
  verkeerd. Lukt het opslaan niet, dan staat er *De tijdzone kon niet worden opgeslagen.*
- **Bedrijfsnaam** (tabblad **Bedrijfsregels**) — de naam waaronder de app mailt: onderaan de
  herinneringen, als standaard afzendernaam, in de portaalmails en in de plekhouder `{companyName}` van
  berichtsjablonen (hoofdstuk 9). Eén naam voor alle mails. Zolang je niets opslaat, is dit *Autolease
  Lam*. Klik na het invullen op **Bedrijfsnaam opslaan**; je krijgt *De bedrijfsnaam is opgeslagen.*
  Een naam van meer dan 100 tekens, of met een regeleinde, wordt geweigerd met *Vul een naam in van
  maximaal 100 tekens, zonder regeleinden.* Een afzendernaam die je bij de e-mailinstellingen hebt
  ingevuld, gaat voor op de bedrijfsnaam. Mails aan portaalklanten zeiden vroeger *Lam Groep*. De portaalsjablonen
  die nog de oude standaardtekst hebben, gaan de bedrijfsnaam volgen zodra je hem **voor het eerst
  opslaat**; tot dan blijven die mails *Lam Groep* zeggen. Wil je dus dat de portaalmails ook *Autolease
  Lam* (of een andere naam) zeggen, sla dan één keer de bedrijfsnaam op. Een portaalsjabloon dat je zelf
  hebt aangepast, houdt altijd zijn eigen tekst. De meldingen die de klant in het portaal zelf ziet (het belletje),
  volgen dezelfde regel: *Lam Groep* totdat je de bedrijfsnaam voor het eerst opslaat, daarna deze
  instelling; een melding die al was aangemaakt, houdt zijn oude tekst.

**Wat je typt, blijft staan.** Wissel je tijdens het invullen van tabblad, dan raak je niets kwijt:
een tabblad dat je eenmaal hebt geopend, houdt wat je erin hebt ingevuld, ook de onderdelen met een
eigen formulier (**Klantenportaal**, de fiscale check, de CJIB-koppeling en de filters van de
activiteit). Wat je niet hebt opgeslagen, is natuurlijk wel weg zodra je de instellingen sluit.

**Het klantenportaal en de bekeuringen.** Onder het tabblad **Klantenportaal** staat het veld
**Standaard administratiekosten per bekeuring (€)** — *Dit bedrag staat bij een nieuwe bekeuring alvast
ingevuld en komt bovenop het boetebedrag. Vul 0 in voor geen kosten.* Een negatief of leeg bedrag
wordt geweigerd met *Vul een bedrag van 0 of hoger in, bijvoorbeeld 12,50.* Het bedrag blijft nu ook
echt bewaard: vroeger werd het bij elke keer opslaan van dit formulier op 0 gezet. De bekeuringen zelf
staan sinds oktober 2026 ook onder een eigen menu-item **Bekeuringen** (hoofdstuk 2, paragraaf 2.6).

**De CJIB-koppeling** (*Het CJIB levert beschikkingen als XML- of CSV-bestand op een beveiligde
FTPS-server*) staat bij de bekeuringen, achter **CJIB-importen**. De schakelaar **Automatisch ophalen
aan** kun je pas aanzetten als er een server (**Server (host)**) is ingevuld; zonder server zijn ook
**Verbinding testen** en **Nu ophalen** grijs, en onder de knoppen staat waarom. In het overzicht
leest de status als een zin: *Automatisch ophalen elke 15 min* of *Automatisch ophalen staat uit*.
Mislukt de test, dan staat er *Verbinding mislukt* met een Nederlandse zin als *De verbinding met het
CJIB is mislukt. Controleer de instellingen en probeer het opnieuw.* De technische tekst van de
FTPS-server zelf zie je niet meer in het scherm; een beheerder vindt hem in het serverlog.

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

De bestanden worden weggeschreven in mappen per jaar, maand en dag. In het scherm staat bij
**Back-uplocatie:** alleen dat de map *vast ingesteld* is via de omgevingsvariabele BACKUP_PATH; het
pad zelf wordt om veiligheidsredenen niet meer getoond. Wil je weten waar de bestanden staan, vraag
het dan aan de beheerder van de server.

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
- **Laatste back-upfout:** — staat er alleen als de laatste poging misging, als een zin in het
  Nederlands (bijvoorbeeld *de schijf van de server is vol* of *de server kan de database niet
  bereiken*). Bij een fout die de app niet kent, staat er dat de reden in het serverlog staat.

Is de laatste geslaagde back-up ouder dan een dag, of is er nog nooit een geslaagde, dan staat er
bovenaan een gele waarschuwing: *De laatste geslaagde back-up is ouder dan een dag.* Een back-up
waarvan de datum niet te lezen is, toont **Onbekende datum** in plaats van een datum in 1970.

Daaronder staan de **Recente automatische back-ups**, gesplitst in **Database-back-ups** en
**Bestand-back-ups**.

Is er langere tijd geen geverifieerde back-up gemaakt, dan verschijnt er ook op het dashboard
een balk: **Geen geverifieerde back-up in 30 uur** met *"Open Back-up & Herstel om er nu een uit
te voeren."* Negeer die balk niet.

Met **Nu back-uppen** maak je er meteen een, los van het schema. Mislukt dat, dan staat er een
Nederlandse zin, zoals *De back-up is mislukt.* of, als er al een loopt, *Er loopt al een
back-up. Wacht tot die klaar is.* De schakelaar
**Ingeschakeld / Uitgeschakeld** zet het nachtelijke schema aan of uit.

### Downloaden

Achter elke back-up staat **Downloaden**. Daarmee haal je het bestand naar je eigen computer.
Bewaar het op een andere plek dan de server. Het downloaden begint meteen; de app maakt het
bestand tijdens het downloaden, dus ook een groot archief blijft niet eerst minutenlang hangen. Is
het bestand klaar, dan meldt de app **Bestand gemaakt** met de naam en de grootte. Mislukt het,
dan staat er *De back-up kon niet worden gedownload.* en geen pad of technische tekst van de server.

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

- **wat er gebeurde**, in woorden: bijvoorbeeld *Reservering aangemaakt*, *Ophalen*, *Inleveren*,
  *Overdracht teruggedraaid*, *Status gewijzigd*, *Klant aangemaakt*, *Document gemaild*,
  *Kilometerstand gewijzigd*, *definitief verwijderd* en *hersteld*. Een actie die de app niet kent,
  staat er met de ruwe naam; de technische code zie je als je de muis erop zet;
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

## 10.6 De prullenbakken

Wat je verwijdert is niet weg. Het gaat naar de prullenbak van het scherm waar je het verwijderde, en
is daar terug te halen — of voorgoed te verwijderen.

**Acht prullenbakken, één per scherm.** Sinds oktober 2026 is er niet meer één gedeeld venster met
alles door elkaar. Elk scherm heeft zijn eigen prullenbak, met alleen zijn eigen soort:

| Scherm | De knop | Wat erin staat |
|---|---|---|
| **Voertuigen** | **Verwijderde voertuigen** | Voertuigen (label **Voertuig**), met hun reserveringen, documenten en kosten |
| **Klanten** | **Verwijderde klanten** | Klanten (**Klant**), met hun chauffeurs en portaalgegevens |
| **Reserveringen** (de kalender) | **Verwijderde reserveringen** | Reserveringen (**Reservering**) |
| **Onderhoud** | **Verwijderd onderhoud** | Onderhoudsplanningen (**Onderhoud**) |
| **Transporten** | **Verwijderde transporten** | Transporten (**Transport**) |
| **Klantenportaal** → **Bekeuringen** | **Prullenbak** | Bekeuringen (**Boete**); het venster heet **Verwijderde bekeuringen** |
| **Kosten** | **Verwijderde kostenposten** | Kostenposten (**Kostenpost**), met hun bon |
| **Klanten** → een klant openen → tabblad **Chauffeurs** | **Verwijderde chauffeurs** | De verwijderde chauffeurs van die ene klant (**Chauffeur**) |

Onderhoud heeft zijn eigen soort. Een verwijderd onderhoudsblok stond vroeger met het label
**Reservering** tussen de rest; bij de eerste start na de uitrol zijn die oude regels verhuisd naar
**Onderhoud**. Een vervangreservering die automatisch meegaat met een verwijderd onderhoudsblok of
transport krijgt geen eigen regel in de prullenbak.

**Wie erbij kan.** Iedereen met het vinkje **Prullenbak beheren** (hoofdstuk 15, paragraaf 15.16):
een beheerder altijd, een manager eenmalig vanzelf, een ander account alleen als je het vinkje
aanzet. Wie het vinkje mist, ziet de knop wel, maar grijs, met een tekstballon die het recht noemt
(15.9). Je hoeft dus geen beheerder meer te zijn om iets terug te zetten; wie het vinkje heeft, kan
dat ook zelf doen als hij de fout maakte.

**Wat je ziet.** Bovenin een zoekveld (*Zoeken op omschrijving of naam…*), **Alles selecteren** en
twee knoppen om voorgoed te verwijderen (hieronder). Per regel:

- een vinkje, het label en de omschrijving, bijvoorbeeld *Reservering #3366 — HL-02-HL 2026-10-05*;
- *Verwijderd &lt;datum&gt; door &lt;naam&gt;*;
- **Bevat: …** — wat er nog aan hing, in woorden, bijvoorbeeld *2 reserveringen, 1 document*. Hing er
  niets aan, dan staat er *geen gekoppelde gegevens*;
- de knoppen **Terugzetten** en **Definitief verwijderen**.

Per soort staan de nieuwste 200 regels erin, de nieuwste bovenaan. Een regel die al is teruggezet,
wordt standaard **niet meer getoond**, zodat je alleen ziet wat er nog te doen is. Wil je ze wel zien,
vink dan **Teruggezette items ook tonen (3)** aan; het getal zegt hoeveel het er zijn, en het vinkje
staat er alleen als er zijn. Zo'n regel heeft het groene label **Teruggezet** en *Teruggezet
&lt;datum&gt; door &lt;naam&gt;*, en zijn knop **Terugzetten** is grijs. Is er niets, dan staat er bijvoorbeeld
*Geen verwijderde voertuigen.*

### Terugzetten

Klik op **Terugzetten**. Alles wat met het record mee is gegaan, komt mee terug. Je krijgt
**Teruggezet** — *&lt;omschrijving&gt; is teruggezet.* Elke keer dat iemand iets terugzet, komt dat in de
geschiedenis te staan.

Per soort goed om te weten:

- Een **reservering** komt alleen terug als de auto in die periode vrij is. Gesloten vervangers,
  transporten en chauffeurtoewijzingen komen niet vanzelf terug.
- Een **onderhoudsplanning** kan terug, ook als er intussen een verhuring op die dagen staat: een
  blok mag overlappen met een verhuring (hoofdstuk 7, paragraaf 7.3). Gesloten vervangers komen
  niet vanzelf terug.
- Een **transport** komt terug met zijn vervangend voertuig, als dat nog vrij is.
- Een **klant** behield zijn debiteurnummer zolang hij in de prullenbak stond (3.9).
- Een **chauffeur** komt terug zolang zijn klant nog bestaat, met de koppelingen aan reserveringen,
  bekeuringen en portaalaccounts waar die nog bestaan en nog leeg zijn. Bestaat de klant niet meer, dan
  moet je eerst de klant terugzetten.
- Een **kostenpost** komt terug met zijn bon. Hing hij aan een factuur uit het postvak, dan komt die
  koppeling mee terug als de factuur er nog is. Bestaat het voertuig van de kostenpost niet meer, dan
  komt de kostenpost toch terug en zegt de app *Let op: het voertuig van deze kostenpost bestaat niet
  meer. De kostenpost staat er weer, maar hoort bij een voertuig dat ontbreekt.*

De app weigert het terugzetten als dat niet meer kan. De meldingen:

| Melding | Wat het betekent |
|---|---|
| *Dit record is al teruggezet.* | Iemand was je voor |
| *Dit record staat niet meer in de prullenbak.* | De regel bestaat niet meer, bijvoorbeeld omdat hij net definitief is verwijderd |
| *Het oorspronkelijke nummer is intussen aan iets anders gegeven, dus terugzetten kan niet.* | Het nummer van het record is niet meer vrij |
| *Er bestaat al een voertuig met hetzelfde kenteken. Verwijder of hernoem dat eerst.* | Er is intussen een nieuwe auto met datzelfde kenteken |
| *Een ander voertuig gebruikt dezelfde barcode. Maak die daar eerst leeg.* | De barcode zit nu op een andere auto |
| **Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode.** | De auto is inmiddels opnieuw verhuurd in die periode |
| *Dit debiteurnummer is al in gebruik bij klant &lt;naam&gt;.* | Een andere klant heeft het nummer intussen gekregen |
| *De klant van deze chauffeur bestaat niet meer. Zet eerst de klant terug (Klanten, Verwijderde klanten) en daarna de chauffeur.* | Je zet een chauffeur terug terwijl zijn klant in de prullenbak staat of definitief weg is |
| *De bewaarde gegevens zijn leeg, er is niets om terug te zetten.* en *Dit soort record kan nog niet worden teruggezet.* | Zeldzaam; meld het aan wie de app beheert |

### Definitief verwijderen (de prullenbak legen)

Sinds oktober 2026 kun je een prullenbak ook leegmaken, op drie manieren:

1. **Eén regel:** klik achter de regel op **Definitief verwijderen**.
2. **Een selectie:** vink de regels aan (of kies **Alles selecteren**, dat alleen de regels aanvinkt
   die je nu in de lijst ziet; heb je gezocht, dan alleen de gevonden regels) en klik op
   **Geselecteerde verwijderen (…)**.
3. **Alles van die soort:** klik op **Prullenbak leegmaken**. Dat haalt *alles* uit deze prullenbak
   weg, ook de regels die niet in de lijst staan. Toont de lijst er het maximum van 200, dan zegt
   het venster dat ook.

Staan er teruggezette regels verborgen, dan zegt de bevestiging van **Prullenbak leegmaken** dat ook:
*Dat zijn ook 3 teruggezette regels die nu verborgen zijn.* Ook die gaan dus weg.

Er verschijnt altijd een bevestiging, **Definitief verwijderen?**, die het aantal en de soort noemt
— bijvoorbeeld *2 klanten worden definitief uit de prullenbak verwijderd.* — en zegt wat er
verdwijnt, *Een bestand dat nog door andere gegevens wordt gebruikt, blijft staan.* en *Dit kan niet
ongedaan worden gemaakt.* Pas na **Definitief verwijderen** gebeurt er iets; **Annuleren** laat
alles zoals het was. Je krijgt dan **Definitief verwijderd** — *2 regels definitief verwijderd.*

Lukt een regel niet, dan staat er **Niet alles is gelukt** met per regel de reden, in het Nederlands.
Dit kan voorkomen:

| Melding | Wat het betekent |
|---|---|
| *Dit record stond al niet meer in de prullenbak.* | Iemand was je voor |
| *Dit record kon niet worden verwijderd en staat nog in de prullenbak.* | Er ging iets mis; er is niets weggehaald. Probeer het opnieuw |
| *Het record is verwijderd, maar een of meer bestanden konden niet van de schijf worden gehaald.* | De regel is weg; een bestand staat er nog. Meld het aan wie de app beheert |

**Wat definitief verwijderen weghaalt**, per soort:

| Soort | Wat er verdwijnt | Wat blijft staan |
|---|---|---|
| **Voertuig** | Het voertuig, met alles wat erbij hoort: reserveringen, documenten en kosten, en hun bestanden | — |
| **Klant** | De klant, met zijn chauffeurs en portaalgegevens, en hun bestanden. Het **debiteurnummer komt weer vrij**. De **fiscale beoordelingen** van de klant gaan mee | — |
| **Reservering** | De reservering, met haar contracten, schadechecks, transportrapporten en bezorgtaken, en hun bestanden. Haar **fiscale beoordelingen** gaan mee | **Overige documenten van het voertuig** (zoals een APK-bewijs, een factuur of een verzekering) blijven staan, zonder reservering |
| **Onderhoud** | De onderhoudsplanning, met eventuele contracten en schadechecks, en hun bestanden. Eventuele **fiscale beoordelingen** gaan mee | Documenten van het voertuig, zoals een **APK-bewijs**, blijven staan |
| **Transport** | Het transport | — |
| **Boete** | De boete, met de bijgevoegde brief | — |
| **Chauffeur** | De chauffeur, met de kopie van het rijbewijs. Reserveringen en bekeuringen die naar hem verwezen, krijgen die koppeling niet meer terug | — |
| **Kostenpost** | De kostenpost, met de bon | Een bon die ook de bijlage van een factuur in het postvak is, blijft staan |

**Een chauffeur verwijderen is niet hetzelfde als zijn gegevens wissen.** Een verwijderde chauffeur blijft met
naam, contactgegevens, rijbewijsnummer en de kopie van het rijbewijs in de prullenbak staan tot die is
geleegd. Vraagt iemand om zijn gegevens te laten wissen, kies dan ook **Definitief verwijderen** in
**Verwijderde chauffeurs**. In de prullenbak van de chauffeurs van een klant verwijdert **Prullenbak
leegmaken** precies de regels die je op dat moment ziet, niet de chauffeurs van andere klanten.

**Bestanden gaan alleen weg als niets ze nog gebruikt.** De app haalt een bestand pas van de schijf
nadat de regel definitief is verwijderd, en alleen een bestand in de uploadmap van de app waar geen
ander levend record meer naar verwijst. Een bestand dat nog ergens anders wordt gebruikt, blijft
staan.

**Fiscale beoordelingen gaan mee.** Wordt een reservering, een onderhoudsplanning of een klant
definitief verwijderd, dan worden ook de fiscale beoordelingen en de bijbehorende beoordelingszaken
(zie `docs/fiscaal/07-handleiding-kantoor.md`) definitief verwijderd, ook de beoordelingen van een
andere periode die naar die reservering verwijzen. In de lijst staat bij zo'n regel bij **Bevat** hoeveel
fiscale beoordelingen het zijn, en de bevestiging **Definitief verwijderen?** noemt het aantal nog een
keer. Het activiteitenlog (10.5) telt ze mee in de regel *&lt;soort&gt;.purge*, en het fiscale auditlog
(app-instellingen, Klantenportaal) krijgt de actie *Definitief verwijderd (prullenbak)* met wie het
deed en hoeveel het er waren. Dat auditlog kan niemand in de app wissen: het blijft het bewijs dat er iets is
weggehaald. Eén kanttekening: ook een beoordeling van een *andere* periode die naar de verwijderde reservering
verwees, gaat weg. De reeks beoordelingen van die andere periode kan daardoor een gat krijgen: een
volgnummer ontbreekt, een verwijzing naar de beoordeling die ze vervangt is leeg, en de laatste beoordeling
van die periode kan een oudere zijn. Er blijft niets hangen dat naar niets wijst, maar kijk bij twijfel
eerst in het fiscale overzicht van die andere periode.

> **Let op: bewaarplicht.** Fiscale gegevens vallen onder de wettelijke bewaarplicht. Dat de
> beoordelingen met de reservering meegaan, is een bewuste keuze van de eigenaar (besluit B-41), niet
> een eis van de wet. Wie twijfelt of een reservering nog nodig is voor de administratie, laat hem in de
> prullenbak staan.

**Wat je niet terugkrijgt.** Wat je definitief verwijdert, kun je niet meer terugzetten. De app
schrijft elke definitieve verwijdering op in het activiteitenlog (10.5), met de actie
*&lt;soort&gt;.purge* (bijvoorbeeld *customer.purge*), wie het deed en wat er is weggehaald.

> **Loop eerst langs wat erin staat.** Een regel die je niet herkent, is vaak van een collega. Met
> **Prullenbak leegmaken** gaat álles van die soort weg, ook wat anderen er gisteren in hebben gezet.
