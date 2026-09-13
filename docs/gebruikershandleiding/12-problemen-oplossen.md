# 12. Problemen oplossen

Dit hoofdstuk bestaat uit drie delen:

1. **De acht problemen die het vaakst voorkomen**, met wat je stap voor stap doet.
2. **Een tabel met de foutmeldingen** die je in het scherm kunt tegenkomen: wat de melding
   betekent, wat je controleert, of je het zelf kunt oplossen, en wanneer je een beheerder erbij
   haalt.
3. **Bekende beperkingen** — dingen die op dit moment niet werken of extra aandacht vragen. Dat is
   geen werkwijze; het is een eerlijke lijst zodat je er niet op stukloopt.

---

## Deel 1 — De acht problemen die het vaakst voorkomen

### 12.1 Ik kan niet inloggen

**Eerst het simpele.** Controleer of het Caps Lock-lampje uit staat en of je de juiste
gebruikersnaam gebruikt. De gebruikersnaam is niet je e-mailadres.

**Wat de app zegt en wat het betekent:**

| Melding onder **Inloggen mislukt** | Wat er aan de hand is |
|---|---|
| *401: Incorrect password* | Het wachtwoord klopt niet |
| *401: Invalid username* of *Authentication failed* | De gebruikersnaam bestaat niet |
| *403: Account has been disabled* | Je account staat op inactief |
| *429: Too many login attempts from this IP, please try again after 15 minutes.* | Er zijn vanaf deze werkplek vijf keer achter elkaar foute inloggegevens ingevuld |
| *429: Account temporarily locked due to too many failed login attempts. Please try again in N minute(s).* | Dit account zelf is tijdelijk op slot |

#### De blokkade na vijf mislukte pogingen

Na **vijf** mislukte inlogpogingen binnen een kwartier gaat de deur dicht. Dat is een
beveiliging tegen wachtwoordraden, geen storing.

**Wat je moet weten:**

- De blokkade geldt **per werkplek/netwerk**, niet per persoon. Zit je met het kantoor achter één
  internetverbinding, dan kan een collega die vijf keer misklikte de hele balie een kwartier
  buitensluiten.
- De blokkade duurt **15 minuten** en loopt daarna vanzelf af.
- **Een beheerder kan de blokkade niet opheffen.** Er is geen ontgrendelknop. Wachten is de enige
  weg.
- Een geslaagde inlogpoging telt niet mee, dus blijf vooral niet gokken: elke misser verlengt het
  probleem.

**Wat een beheerder wél kan doen**, terwijl je wacht:

1. Controleren of je account op **Actief** staat (Beheer → Gebruikers).
2. Een nieuw wachtwoord voor je instellen, zodat je na het kwartier zeker binnenkomt. Een
   beheerder hoeft daarvoor zijn eigen wachtwoord niet opnieuw in te voeren; de handeling wordt
   wel vastgelegd.
3. In de activiteitenlog kijken wie er aan het proberen was.

**Als je halverwege de dag ineens uitgelogd bent:** je sessie verloopt na een kwartier
inactiviteit. Je krijgt eerst de waarschuwing **Sessie verloopt binnenkort** met de knop
**Ingelogd blijven**. Doe je niets, dan volgt **Sessie verlopen** — *"Je bent uitgelogd wegens
inactiviteit"*. Log gewoon opnieuw in; er gaat niets verloren.

---

### 12.2 Het voertuig is niet beschikbaar terwijl het er gewoon staat

Een auto telt als **beschikbaar** wanneer aan twee voorwaarden is voldaan: hij is vrij in de
gevraagde periode, **én** zijn status is in orde. Niet beschikbaar is dus altijd één van deze
vier:

| Oorzaak | Hoe je het ziet | Wat je doet |
|---|---|---|
| Er ligt een reservering overheen | De auto staat op de kalender in die periode | Kies andere datums of een andere auto |
| De auto staat in de werkplaats | Onderhoudsstatus **Onderhoud nodig** of **Momenteel in onderhoud** | Is hij klaar? Gebruik **Terug van onderhoud** of **Terug uit onderhoud** |
| De auto staat op "niet voor verhuur" | Beschikbaarheidsstatus op de voertuigkaart | Zet de status om als dat klopt |
| Een oude huur is nooit afgesloten | De auto staat op **Nog buiten** | Neem de huur alsnog in (hoofdstuk 11, paragraaf 11.6) |

De laatste is de sluipende. Staat een auto op je terrein maar niet in de lijst met beschikbare
auto's, kijk dan altijd eerst op **Nog buiten**.

Een auto met een **onderhoudsblok** in de gevraagde periode is een apart geval: die telt niet mee
als beschikbaar, maar je mág hem wel bewust boeken. Zie 12.3.

---

### 12.3 Ik kan geen reservering aanmaken

Loop deze vier langs:

**1. De periode botst met een andere boeking.**

> *Reservation conflicts with existing bookings*

De botsende reservering wordt erbij getoond. Kies andere datums of een andere auto. Twee mensen
kunnen niet tegelijk dezelfde auto boeken: van gelijktijdige pogingen slaagt er precies één.

**2. Er staat onderhoud gepland in die periode.** Dit is een **waarschuwing**, geen blokkade:

> *"Let op: dit voertuig staat in deze periode ingepland voor onderhoud (01-10-2026 t/m
> 05-10-2026). Opslaan mag; het onderhoudsblok blijft staan."*

Je mag gewoon opslaan. Zorg dan wel dat het onderhoud verzet of geregeld wordt.

**3. De klant staat op de zwarte lijst voor dit voertuig.**

> *This customer is blacklisted for this vehicle and cannot be booked on it.*

Kies een andere auto, of laat de zwarte lijst aanpassen door iemand met het recht om klanten te
beheren.

**4. De APK is verlopen.**

> *"De APK (keuring) van dit voertuig is verlopen op &lt;datum&gt;. Bevestig dat het veilig en legaal
> is om te verhuren voordat je verdergaat."*

Dit is ook een waarschuwing. Verhuur geen auto met een verlopen APK; laat hem eerst keuren.

---

### 12.4 Het PDF klopt niet

**De gegevens op het contract zijn oud.** Kijk of er een oranje label **Verouderd** bij het
document staat. Zo ja: de reservering is veranderd nadat het contract gemaakt was. Klik op
**Opnieuw genereren** (hoofdstuk 8).

**Er staan velden leeg.** Wat leeg is op de klantkaart of de voertuigkaart, blijft leeg op het
contract. Vul het ontbrekende aan en genereer opnieuw.

**Het contract ziet er anders uit dan gewend.** Dan is er een ander sjabloon gebruikt, of het
standaardsjabloon is gewijzigd. Kijk onder **Documenten → Contractsjablonen** welk sjabloon het
label **Standaard** heeft.

**Op het contract staat "nader te bepalen" als einddatum.** Dat klopt: de huur heeft geen
einddatum. Vul de einddatum in en genereer opnieuw.

**Het document opent niet of is leeg.** Probeer **Downloaden** in plaats van **Bekijken**. Blijft
het bestand leeg of onvindbaar, dan is het bestand van de server verdwenen; genereer het opnieuw
als dat kan, en meld het bij een beheerder.

---

### 12.5 Het maken van een PDF mislukt

Je krijgt **Contract kon niet gemaakt worden** — *"De handeling is vastgelegd, maar het document
is niet aangemaakt. Probeer het opnieuw of controleer de sjablonen."*

**Het ophalen of innemen zelf is wél verwerkt.** Alleen het document ontbreekt.

Stappen:

1. Klik op **Opnieuw proberen**.
2. Lukt dat niet, lees dan de melding eronder. De meest voorkomende:

| Melding | Betekenis | Oplossing |
|---|---|---|
| *The PDF template "…" has no fields, so the contract would be completely blank.* | Het gekozen sjabloon is leeg | Kies een ander sjabloon; laat de velden plaatsen |
| *Template not found* | Het sjabloon bestaat niet meer | Kies een ander sjabloon |
| *No contract template has been configured.* | Er is helemaal geen sjabloon | Beheerder |
| *This reservation has no vehicle assigned yet (placeholder).* | Er hangt nog geen auto aan deze reservering | Wijs eerst een voertuig toe |
| *This reservation has no customer …* | Er hangt geen klant aan | Koppel eerst een klant |
| *A maintenance block is not a rental: there is no contract to generate for it.* | Je probeert een contract te maken op een onderhoudsblok | Dat hoort niet; er is geen contract |
| *No damage check template found. Create a default template first.* | Er is geen schadechecksjabloon | Beheerder |

3. Lukt het daarna nog niet, maak het document dan later alsnog vanuit de reservering en meld het
   bij een beheerder.

---

### 12.6 De e-mail komt niet aan

Zie hoofdstuk 9 voor de volledige lijst. In het kort:

1. Kijk onder het document in **Reserveringsdocumenten**. Staat er
   **Verzonden op … aan …**, dan is de mail de deur uit; het probleem zit dan bij de ontvanger
   (spamfilter, verkeerd adres).
2. Staat er **Verzenden mislukt — …**, lees dan de reden.
3. Staat er niets, dan is er nooit iets verstuurd. Verstuur alsnog.

De reden *No valid email configuration for purpose: …* betekent dat de mailinstellingen
ontbreken. Dat kan alleen een beheerder oplossen.

Gebruik het tabblad **E-maillogboek** onder **Communicatie** hier niet voor — zie 12.13.

---

### 12.7 Ik heb iets op de verkeerde reservering gedaan

Kijk eerst wát je gedaan hebt; het antwoord verschilt per handeling.

| Handeling | Terug te draaien? | Hoe |
|---|---|---|
| Ophalen | Ja | **Terugzetten naar geboekt** |
| Innemen | Nee | Nieuwe reservering + notitie |
| Annuleren | Nee | Nieuwe reservering + notitie |
| Verwijderen | Ja, door een beheerder | **Prullenbak** → **Terugzetten** |
| Klant, voertuig of datums gewijzigd | Ja | **Klant / Voertuig / Datums wijzigen** |
| Document gegenereerd | Niet nodig | **Opnieuw genereren** maakt een nieuwe versie |
| E-mail verstuurd | Nee | Bellen |

Zie hoofdstuk 11 voor elk van deze gevallen.

---

### 12.8 Er is per ongeluk iets gewijzigd en niemand weet door wie

Open het record (reservering, voertuig of klant) en kijk onder **Geschiedenis**. Daar staat per
regel wie het deed, wanneer, welk veld en de oude en nieuwe waarde. Een beheerder ziet alles bij
elkaar onder **App-instellingen → Activiteit → Activiteitenlog**, met filters op gebruiker,
actie en periode.

Ontbreekt het record helemaal, kijk dan in de **prullenbak**: daar staat wie het wanneer heeft
verwijderd, en kan een beheerder het terugzetten.

---

## Deel 2 — Foutmeldingen

Een deel van de meldingen is Nederlands, een deel Engels. Dat is niet erg: gebruik deze tabel om
te zien wat er bedoeld wordt.

### Bij ophalen en innemen

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| **"De huur start eerder — datum aanpassen?"** met *"Deze huur staat gepland vanaf …, maar het voertuig gaat vandaag mee."* | De auto wordt vóór de afgesproken begindatum meegegeven | Klopt het dat de huur nu ingaat? | **Ja** — kies **Ja, startdatum naar vandaag** | Nee |
| **"Uitgifte geblokkeerd"** — *"Dit voertuig staat in de werkplaats en kan niet worden uitgegeven. Rond de werkplaatsklus eerst af."* | De auto staat op **Momenteel in onderhoud** of **Onderhoud nodig** | Is het onderhoud klaar? | **Ja** — gebruik **Terug van onderhoud** of **Terug uit onderhoud** | Alleen om de uitgifte te forceren |
| **"Uitgifte geblokkeerd"** — *"Dit voertuig staat op \"reparatie nodig\" en kan niet worden uitgegeven. Los dat eerst op."* | De auto staat op **Reparatie nodig** | Wat mankeert eraan? | **Ja** — los de reparatie op of geef de auto vrij | Alleen om te forceren |
| **"Uitgifte geblokkeerd"** — *"Dit voertuig staat op \"niet voor verhuur\" en kan niet worden uitgegeven."* | De auto is bewust uit de verhuur gehaald | Waarom staat hij zo? | Nee, niet zomaar omzetten | **Ja** — overleg eerst |
| *"Alleen een beheerder kan de uitgifte forceren. Los de werkplaatsstatus op, of vraag een beheerder."* | Je bent geen beheerder, dus je krijgt geen reden-veld te zien | — | Los de status op | **Ja**, als het echt geforceerd moet |
| *A reason is required to force a handover of a blocked vehicle.* | Een beheerder klikt op **Toch uitgeven** zonder reden | — | **Ja** — vul een reden in | Nee |
| **"Dubbel contractnummer"** / *Contract number "…" is already used by reservation #…* | Dit contractnummer zit al op een andere huur | Welke reservering dat is, staat erbij | **Ja** — kies een ander nummer, of neem het bewust over met **Overschrijven & doorgaan** | Nee |
| **"Opmerkingen niet bevestigd"** — *"Je moet de voertuigopmerkingen bevestigen voordat je verdergaat met ophalen."* | Er staan opmerkingen bij de auto | Lees de opmerkingen | **Ja** — **Ik bevestig & ga door** | Nee |
| **"Kilometerstand-overschrijving vereist"** | De ingevoerde stand is lager dan de vorige | Heb je goed afgelezen? | **Ja**, als je het recht hebt: vul je eigen wachtwoord in | Als je het recht niet hebt |
| *"Je hebt geen recht om een verlaging van de kilometerstand te autoriseren."* | Je mist het recht | — | Nee | **Ja** |
| **"Contractnummer vereist"** | Het veld is leeg | — | **Ja** | Nee |

### Bij boeken en wijzigen

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| *Reservation conflicts with existing bookings* | De auto is in die periode al geboekt | De botsende reservering staat erbij | **Ja** — andere datums of andere auto | Nee |
| *"Let op: dit voertuig staat in deze periode ingepland voor onderhoud (… t/m …). Opslaan mag; het onderhoudsblok blijft staan."* | Waarschuwing, geen blokkade | Kan het onderhoud verzet worden? | **Ja** — je mag doorgaan | Nee |
| *This customer is blacklisted for this vehicle and cannot be booked on it.* | Deze klant mag niet in deze auto | Klopt de zwarte lijst nog? | Alleen door een andere auto te kiezen | Voor het aanpassen van de lijst |
| *"De einddatum kan niet vóór de begindatum liggen."* | Datums omgedraaid | — | **Ja** | Nee |
| *Invalid status transition from 'cancelled' to 'booked'* | Een annulering kan niet terug | — | Nee — maak een nieuwe reservering | Nee |
| *Vehicle not found* / *Customer not found* | Het voertuig of de klant bestaat niet (meer) | Staat het record in de prullenbak? | Nee | **Ja**, om terug te zetten |

### Bij verwijderen en terugzetten

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| **"Dit voertuig heeft een lopende of geplande huur en kan niet worden verwijderd."** | Er hangt nog een huur aan | De blokkerende huren staan erbij | **Ja** — rond de huur af of annuleer hem eerst | Nee |
| **"Deze klant heeft een lopende of toekomstige reservering en kan niet worden verwijderd."** | Idem, bij een klant | Idem | **Ja** | Nee |
| *This record was already restored.* | Iemand was je voor | — | **Ja** — vernieuw het scherm | Nee |
| *A vehicle with the same license plate already exists. Delete or rename it first.* | Er staat inmiddels een andere auto op dat kenteken | Welke auto dat is | Nee | **Ja** |
| **"Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode."** | De auto is opnieuw verhuurd in die periode | De nieuwe boeking | **Ja** — boek de huur opnieuw op andere datums | Nee |
| *Not authorized. Admin access required.* | Alleen een beheerder mag dit | — | Nee | **Ja** |

### Bij documenten

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| *The PDF template "…" has no fields, so the contract would be completely blank. Open it in the template editor, place the fields, and try again.* | Het sjabloon is leeg | Welk sjabloon op **Standaard** staat | Alleen door een ander sjabloon te kiezen | **Ja**, om het sjabloon te vullen |
| *Template not found* | Het sjabloon bestaat niet meer | — | **Ja** — kies een ander | Nee |
| *A maintenance block is not a rental: there is no contract to generate for it.* | Dit is een onderhoudsblok, geen huur | Zit je op de goede regel? | **Ja** | Nee |
| **"Opnieuw genereren is niet gelukt"** | De nieuwe versie kon niet gemaakt worden | De melding eronder | Soms | Vaak |
| *Not authorized. One of these permissions required: view_documents, manage_documents* | Je mag geen documenten inzien | — | Nee | **Ja** — vinkje aanzetten |
| *Not authorized. One of these permissions required: manage_documents* | Je mag documenten inzien maar niet maken | — | Nee | **Ja** |
| **"Je browser heeft afdrukken geblokkeerd. Gebruik de downloadknop en druk handmatig af."** | Browserinstelling | Pop-ups toestaan | **Ja** — downloaden en dan afdrukken | Nee |

### Bij inloggen, rechten en de app zelf

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| *401: Incorrect password* | Wachtwoord fout | Caps Lock | **Ja** — maar na vijf keer zit je een kwartier vast | Voor een nieuw wachtwoord |
| *429: Too many login attempts from this IP, please try again after 15 minutes.* | Vijf mislukte pogingen vanaf deze werkplek | — | **Ja** — wacht een kwartier | Nee (kan het niet opheffen) |
| *429: Account temporarily locked due to too many failed login attempts…* | Dit account staat tijdelijk op slot | — | **Ja** — wacht | Nee (kan het niet opheffen) |
| *403: Account has been disabled* | Je account staat op inactief | — | Nee | **Ja** |
| *429: Too many requests, please try again later.* | Je hebt in een kwartier heel veel gedaan (of heel veel tabbladen openstaan) | Sluit overbodige tabbladen | **Ja** — wacht een paar minuten | Nee |
| *Not authorized. One of these permissions required: …* | Je mist een recht; achter de dubbele punt staat welk | — | Nee | **Ja** |
| *CSRF token missing* of *403* na lang openstaan | Het tabblad stond te lang open | — | **Ja** — vernieuw de pagina en log opnieuw in | Nee |
| **"Sessie verlopen"** — *"Je bent uitgelogd wegens inactiviteit"* | Een kwartier niets gedaan | — | **Ja** — opnieuw inloggen | Nee |

---

## Deel 3 — Bekende beperkingen

Dit zijn dingen die op dit moment **niet** werken zoals je zou verwachten. Ze staan hier zodat je
er niet op stukloopt. **Dit is geen werkwijze.** Gebruik de gewone weg uit de vorige
hoofdstukken; dit is alleen om te weten waar je moet opletten.

### 12.9 Een annulering en een inname zijn definitief

Een geannuleerde reservering kan niet terug naar geboekt, en een afgeronde inname kan niet
ongedaan worden gemaakt. Beide moet je oplossen door een nieuwe reservering aan te maken en dat
in de notities te zetten. Kijk dus goed voordat je annuleert of inneemt.

In de lijst achter **Voltooid bekijken (…)** staat bij elke afgesloten verhuring wél een knop
**Terugzetten**. Die werkt niet: je krijgt **Fout** — *Verhuur terugzetten mislukt*, en er
verandert niets aan de verhuring. Reken er dus niet op.

### 12.10 Bij annuleren beslis je zelf wat er meegaat

Annuleer je een reservering, dan laat het venster **Reservering annuleren** zien wat eraan hangt
— een transport, een vervangingsreservering, een placeholder en een chauffeurstoewijzing — en
vink je per onderdeel aan of het mee moet. Wat je **niet** aanvinkt, blijft staan; de app ruimt
dat niet later alsnog op. **Lees dat lijstje dus voordat je bevestigt** (hoofdstuk 5, paragraaf
5.9).

### 12.11 De klant krijgt niet overal bericht van

De klant krijgt automatisch bericht bij onderhoud, bij een bekeuring, bij een reactie op zijn
portaalaanvraag en rond zijn portaalaccount. De klant krijgt **geen** automatisch bericht als:

- je de datums of het voertuig van zijn huur wijzigt;
- je zijn reservering annuleert;
- er een nieuw document voor hem klaarstaat.

Bel of mail in die gevallen zelf. Een document stuur je met **E-mailen** of **Mail naar klant**.

### 12.12 De schermtekst bij de APK-herinnering klopt niet meer

In het venster **APK-herinnering versturen** staat nog dat de herinnering naar alle klanten gaat
die het voertuig ooit gehuurd hebben, en je ziet die klanten ook in de lijst staan. Dat is oude
schermtekst. De app stuurt de mail **alleen naar de huidige huurder**, ongeacht wat je aanvinkt.
Staat de auto leeg, dan gaat er alleen een melding naar kantoor.

### 12.13 Het tabblad "E-maillogboek" toont voorbeeldgegevens

Onder **Communicatie** staat een tabblad **E-maillogboek** met drie regels uit maart 2024. Die
regels zijn vast ingebouwd en hebben niets met jouw verzendingen te maken. Hetzelfde geldt voor
het tabblad **Analyse**. Wil je weten of een document verstuurd is, kijk dan in
**Reserveringsdocumenten** bij het document zelf.

### 12.14 Twee van de drie handmatige downloadknoppen werken niet

Onder **Back-up & Herstel → Handmatige back-up & herstel** staan drie kaarten.

- **App-gegevens** werkt: je krijgt een bestand met alle gegevens.
- **Geüploade bestanden** en **App-code** geven op dit moment een technische foutmelding en
  leveren geen bestand op.

Dit raakt de nachtelijke back-up **niet**: die maakt elke nacht gewoon zowel de gegevens als de
geüploade bestanden. Wil je die bestanden op je eigen computer, gebruik dan de knop
**Downloaden** bij een van de **Bestand-back-ups** in de lijst erboven.

### 12.15 De prullenbak kan niet geleegd worden

Wat in de prullenbak zit, blijft daar staan. Er is geen knop om hem definitief te legen, en de
lijst toont de honderd meest recente regels. Dat betekent ook dat een verwijderde klant nooit
echt uit het systeem verdwijnt.

### 12.16 Een deel van de meldingen is Engels

De vensters en knoppen zijn Nederlands. Maar een melding die rechtstreeks van de server komt, is
vaak nog Engels: *Reservation conflicts with existing bookings*, *This customer is blacklisted for
this vehicle and cannot be booked on it.*, *Not authorized. One of these permissions required: …*
en de weigeringen bij het terugzetten van een back-up. In één werkstroom kom je daardoor beide
talen tegen. De tabel in deel 2 vertaalt de meldingen die je het vaakst ziet.

Ook een paar labels in de schermen zelf zijn nog Engels of half vertaald: de kostencategorieën
heten in de rapporten *Cleaning*, *Parking*, *Insurance*, *Tires* en *Toll*, en in het
**Kostenoverzicht** staan *parking* en *toll* met een kleine letter tussen de Nederlandse
categorieën. Het gaat om dezelfde categorieën.

Ook de melding **"Te veel verzoeken"** is kale technische tekst: *429: Too many requests, please
try again later.* Dat betekent dat je binnen een kwartier heel veel handelingen hebt gedaan.
Wacht een paar minuten en sluit tabbladen die je niet gebruikt.

### 12.17 Twee mensen in hetzelfde scherm

Werken twee collega's tegelijk aan dezelfde reservering, dan wint bij het volledige
bewerkformulier de laatste die opslaat, zonder waarschuwing. De wijziging van de eerste is dan
weg. Gebruik daarom liever de kleine vensters **Datums wijzigen**, **Klant wijzigen** en
**Voertuig wijzigen**: die sturen alleen het veld dat ze veranderen.

Boeken en ophalen hebben dit probleem niet: daar houdt de app gelijktijdige handelingen wel
tegen.

### 12.18 Het scherm op een tablet

Het reserveringenscherm past niet netjes op een tabletbreedte; je moet er horizontaal in
scrollen. Op een laptop of een groot scherm is dat niet zo.

### 12.19 Ontbrekende bestanden worden niet zichtbaar gemeld

Als een PDF wel in de lijst staat maar het bestand op de server weg is, merk je dat pas als je op
**Bekijken** of **Downloaden** klikt. Er staat geen waarschuwing bij de regel. Kun je een
document niet openen, meld dat dan bij een beheerder.
