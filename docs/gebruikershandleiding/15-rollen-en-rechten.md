# 15. Rollen en rechten

Niet iedereen ziet dezelfde app. Wat jij in het menu ziet, hangt af van jouw account. Dat geldt
ook voor de knoppen die werken en de schermen die leeg blijven. Het hangt allemaal af van wat er
bij jouw account is aangevinkt.

Dit hoofdstuk legt uit hoe dat werkt. Het legt uit wat de rechten betekenen. En het laat zien wat
je ziet als je een recht mist. Accounts aanmaken en wijzigen staat in hoofdstuk 10. Dat kan alleen
een beheerder.

---

## 15.1 Hoe het is opgebouwd: een rol plus vinkjes

Elk account heeft twee dingen:

1. **Een rol.** Beheerder, Manager, Gebruiker, Schoonmaker, Kijker, Accountant of Onderhoud.
2. **Een rijtje vinkjes**, in het beheerscherm **Aanvullende rechten** genoemd.

Er is één regel die alles verklaart:

> **De rol doet niets, behalve de rol Beheerder. Voor alle andere rollen bepalen alleen de
> vinkjes wat je mag.**

Een **Manager** zonder vinkjes kan net zo weinig als een **Schoonmaker** zonder vinkjes. Allebei
zien ze een leeg menu. En een **Kijker** met veel vinkjes kan veel. De rol is dus vooral een
etiket. Aan dat etiket zie je wat voor werk iemand doet. De vinkjes zijn de echte rechten.

Een **Beheerder** is de uitzondering. Die mag alles, wat er ook is aangevinkt. Er is één recht dat
ook voor een beheerder apart aangevinkt moet staan. Zie 15.5.

**Wees er niet te makkelijk in.** Iedereen beheerder maken is verleidelijk. Maar dan kan iedereen
gebruikers wijzigen. Dan kan iedereen de instellingen aanpassen en een back-up terugzetten. Geef
mensen de vinkjes die bij hun werk horen. Houd het aantal beheerders klein. Voor de prullenbak hoef
je niemand beheerder te maken. Ook niet voor het terugdraaien van een overdracht. En ook niet voor
het annuleren van een opgehaalde huur. Daar zijn sinds oktober 2026 eigen vinkjes voor (15.16).

---

## 15.2 De zeven rollen

| Rol | Waarvoor bedoeld | Wat de rol op zichzelf geeft |
|---|---|---|
| **Beheerder** | Wie het systeem beheert | **Alles**, plus de drie beheerschermen |
| **Manager** | Wie de verhuur aanstuurt | Niets. Alleen de vinkjes tellen |
| **Gebruiker** | De gewone kantoor- en baliemedewerker | Niets. Alleen de vinkjes tellen |
| **Schoonmaker** | Wie de auto's klaarmaakt | Niets. Alleen de vinkjes tellen |
| **Kijker** | Wie alleen mag meekijken | Niets. Alleen de vinkjes tellen |
| **Accountant** | Wie de cijfers doet | Niets. Alleen de vinkjes tellen |
| **Onderhoud** | De werkplaats | Niets. Alleen de vinkjes tellen |

De rol staat wel bij het account en in de gebruikerslijst. Gebruik de rol dus steeds op dezelfde
manier. Dan ziet een beheerder in één oogopslag wat voor account het is.

---

## 15.3 De beheerder

Een beheerder herken je aan twee dingen:

1. In het menu links staan **alle twaalf** items.
2. Rechtsboven, onder je eigen naam, staat het kopje **Beheer** met **Gebruikers**,
   **Back-upbeheer** en **App-instellingen**.

De prullenbak hoort daar sinds oktober 2026 niet meer bij. De prullenbak staat op elk scherm.
Iedereen met het vinkje **Prullenbak beheren** ziet hem (15.16). De prullenbak is dus geen
herkenningsteken meer voor een beheerder.

**Wat alleen een beheerder kan:**

| Handeling | Waar |
|---|---|
| Accounts aanmaken, wijzigen, op inactief zetten en rechten geven | **Gebruikers** |
| Het volledige activiteitenlog lezen | **App-instellingen → Activiteit** |
| Back-ups bekijken, maken, downloaden en terugzetten | **Back-upbeheer** |
| De app-instellingen wijzigen | **App-instellingen** |
| Een nieuw beheerdersaccount aanmaken | **Gebruikers** |
| Een auto uit de werkplaats toch uitgeven. Je moet dan een reden opgeven | Het venster **Uitgifte geblokkeerd** bij het ophalen |
| De meldingen van geweigerde pogingen zien | De balk op het **Dashboard** (hoofdstuk 10, paragraaf 10.2) |
| De RDW-voertuigtypes van het wagenpark toepassen | **App-instellingen → Voertuigen → RDW-voertuigtypes → Toepassen** |
| Een andere beheerder verwijderen | **Gebruikers**. De laatste actieve beheerder blijft altijd beschermd |

Let op: die drie beheerschermen zitten vast aan de **rol** Beheerder, niet aan de vinkjes. Stel, je
vinkt bij een gewone medewerker **Gebruikers beheren**, **Back-ups beheren** of **Instellingen
beheren** aan. Dan verschijnt het kopje **Beheer** bij hem nog steeds niet. Wil je dat iemand die
schermen kan openen? Dan moet zijn rol op **Beheerder** staan.

Het scherm **Gebruikers** zegt dat nu ook zelf. Bij **Gebruikers beheren**, **Instellingen beheren** en
**Back-ups beheren** staat bij een medewerker die geen beheerder is *alleen voor beheerders*. Je kunt
het vinkje dan niet aanzetten. Een vinkje dat al aanstond, kun je wel uitzetten. Zie 15.17.

**Iemand die geen beheerder is, is dat niet.** Dat klinkt flauw. Maar het is de meestgestelde vraag
aan de balie: "bij mij staat die knop er niet". Dat is meestal geen storing. Het scherm vernieuwen
lost het ook niet op. Zie 15.8.

---

## 15.4 De rechten, één voor één

![Het rechtenraster in Gebruikersbeheer, met de knop Benodigde rechten ook aanzetten (1)](afbeeldingen/15-rechtenraster.png)
*Zo ziet een beheerder de rechten bij een gebruiker. Eén vinkje per recht, met eronder *Heeft nodig:
…*. 1 is de knop **Benodigde rechten ook aanzetten** (hoofdstuk 10, paragraaf 10.2).*

In het beheerscherm staan onder **Aanvullende rechten** vijfendertig vinkjes. Negenentwintig daarvan
bepalen het dagelijkse werk. Die staan hieronder. Bij elk vinkje staat wat het opent. De zes vinkjes
van de fiscale mobiliteitscheck staan onderaan in een eigen tabel.

### Voertuigen, klanten en verhuur

| Vinkje | Wat het toestaat | Welk menu-item je ermee krijgt |
|---|---|---|
| **Voertuigen bekijken** | Het wagenpark inzien, een voertuigkaart openen, de barcode bekijken | **Voertuigen**, **Scannen** |
| **Voertuigen beheren** | Alles hierboven, plus toevoegen, wijzigen en verwijderen. Ook de kilometerstand en brandstof bijwerken. Vul je daarbij een tankbedrag in, dan wordt dat ook een kostenpost. Daar heb je **Kosten beheren** niet voor nodig (hoofdstuk 4, paragraaf 4.9). Verder: bulkimport (veel auto's in één keer inlezen), de zwarte lijst, en een auto in de werkplaats **Binnen melden** (hoofdstuk 7, paragraaf 7.8) | **Voertuigen**, **Scannen** |
| **Klanten bekijken** | De klantendatabase en klantkaarten inzien | **Klanten** |
| **Klanten beheren** | Alles hierboven, plus klanten en chauffeurs aanmaken, wijzigen en verwijderen | **Klanten** |
| **Reserveringen bekijken** | De kalender, de lijst en de details van een verhuring lezen | **Reserveringen**, **Transporten** |
| **Reserveringen beheren** | Alles hierboven, plus boeken, wijzigen, annuleren, **ophalen** en **innemen** | **Reserveringen**, **Transporten** |
| **Kilometerverlaging goedkeuren** | Een kilometerstand invoeren die lager is dan de vorige. Dat doe je met je eigen wachtwoord | — |
| **Overdracht terugdraaien** | Een ophaling, een inname of een annulering ongedaan maken. Je ziet eerst een voorvertoning en bevestigt daarna (hoofdstuk 5, paragraaf 5.14) | — |
| **Opgehaalde huur annuleren of verwijderen** | Een huur annuleren of verwijderen die al is opgehaald. Je krijgt eerst een waarschuwing (hoofdstuk 5, paragraaf 5.15) | — |

### Werkplaats, kosten en rapporten

| Vinkje | Wat het toestaat | Menu-item |
|---|---|---|
| **Onderhoud beheren** | De werkplaatskalender. Onderhoud plannen. Blokken plaatsen en afronden, ook met **Afronden** in het onderhoudsoverzicht. Vervangers toewijzen | **Onderhoud** |
| **Kosten beheren** | Kosten registreren en inzien, facturen scannen | **Kosten** |
| **Rapporten bekijken** | De rapportenmodule lezen | **Rapporten** |
| **Rapporten beheren** | Alles hierboven, plus eigen rapporten opslaan en beheren | **Rapporten** |
| **Lease offertes** | Leaseprijzen uitrekenen, offertes maken, kopiëren en verwijderen, dealerofferten uploaden en de PDF voor de klant maken (hoofdstuk 22). Standaard hebben alleen beheerders dit vinkje | **Lease offertes** |

### Documenten en schadechecks

| Vinkje | Wat het toestaat | Menu-item |
|---|---|---|
| **Documenten bekijken** | De documentbibliotheek, een document openen, downloaden en afdrukken | **Documenten** |
| **Documenten bewerken en genereren** | Alles hierboven, plus genereren, opnieuw genereren, uploaden, mailen en verwijderen | **Documenten** |
| **PDF-sjablonen beheren** | De sjablonen voor contracten en transportrapporten wijzigen. Een sjabloon is een vast voorbeeld dat de app steeds opnieuw gebruikt | — (tabbladen binnen **Documenten**) |
| **Schadecontroles bekijken** | Schadechecks inzien | — |
| **Schadecontroles beheren** | Schadechecks maken en afronden, en de schadecheck-sjablonen wijzigen | — |

### Klantenportaal, boetes en communicatie

| Vinkje | Wat het toestaat | Menu-item |
|---|---|---|
| **Klantportaal bekijken** | Het portaalbeheer lezen: aanvragen, accounts, activiteit | **Klantenportaal** |
| **Klantportaal beheren** | Alles hierboven, plus aanvragen afhandelen, accounts uitnodigen, auto's online zetten, blokkades beheren | **Klantenportaal** |
| **Boetes bekijken** | Bekeuringen inzien | De knop **Bekeuringen** en de tegel **Bekeuringen** op **Klantenportaal** |
| **Boetes beheren** | Bekeuringen invoeren, aan een klant koppelen, de klant erover informeren en verwijderen | De knop **Bekeuringen** en de tegel **Bekeuringen** op **Klantenportaal** |
| **Meldingen beheren** | APK-, garantie- en onderhoudsherinneringen versturen | **Communicatie** |
| **E-mailsjablonen beheren** | De sjabloonbouwer onder **Communicatie** | **Communicatie** |

### Algemeen en beheer

| Vinkje | Wat het toestaat | Menu-item |
|---|---|---|
| **Dashboard bekijken** | Het **Dashboard** met de snelle acties en de signaalblokken | **Dashboard** |
| **Gebruikers beheren** | Accounts en rechten wijzigen en het activiteitenlog lezen, **maar alleen als de rol Beheerder is** | — |
| **Instellingen beheren** | De app-instellingen opslaan. Ook hier: alleen als de rol Beheerder is | — |
| **Back-ups beheren** | Back-ups maken en terugzetten. Ook hier: alleen als de rol Beheerder is | — |
| **Prullenbak beheren** | De prullenbakken van Voertuigen, Klanten (met de chauffeurs van een klant), Reserveringen, Onderhoud, Transporten, Kosten, Boetes en Lease offertes openen. Er iets uit terugzetten. Er iets definitief uit verwijderen (hoofdstuk 10, paragraaf 10.6). Dit vinkje is **niet** aan de rol Beheerder gebonden | — (een knop op elk van die schermen) |

### Fiscale mobiliteitscheck

Deze zes vinkjes horen bij de fiscale check. Dat is de pseudo-eindheffing voor huurauto's, vanaf
2027. De check zelf staat beschreven in `docs/fiscaal/07-handleiding-kantoor.md`. Hier staat alleen
wat elk vinkje opent.

| Vinkje | Wat het toestaat | Waar |
|---|---|---|
| **Fiscaal bekijken** | Het overzicht met de tegels per status, het tabblad **Fiscaal** bij een voertuig, de kaart **Fiscaal gebruik** bij een reservering en het fiscale maandrapport. Heb je dit vinkje, maar geen rapportvinkje? Dan toont **Rapporten** alleen de fiscale check, met de knop **Fiscale check** | **Klantenportaal** → **Fiscale check**, **Rapporten** → **Fiscaal** |
| **Fiscale beoordelingen en gegevens beheren** | Een beoordeling bevestigen, een voertuiggegeven corrigeren en de beoordelingswachtrij afwerken | Het tabblad **Fiscaal**, de kaart **Fiscaal gebruik**, de **Wachtrij** |
| **Fiscale configuratie voorbereiden** | Een nieuwe versie van de fiscale regels voorbereiden | **App-instellingen** → **Klantenportaal** → **Fiscale check** |
| **Fiscale configuratie goedkeuren** | Een voorbereide versie goedkeuren | Idem |
| **Fiscale configuratie publiceren** | Een goedgekeurde versie publiceren | Idem |
| **Fiscale auditlog bekijken** | De auditlog van de fiscale check lezen | Idem, tabblad **Audit** |

---

## 15.5 De twee documentvinkjes: bekijken is niet hetzelfde als maken

Documenten hebben **eigen** rechten. Ze gaan niet vanzelf mee met het recht op voertuigen of
reserveringen. Iemand die de hele dag auto's meegeeft en inneemt, ziet dus niet vanzelf de
documenten die daarbij horen.

| Vinkje | Wat je ermee kunt |
|---|---|
| **Documenten bekijken** | De lijst zien, een document openen, downloaden, afdrukken en de contractgegevens inzien |
| **Documenten bewerken en genereren** | Alles hierboven, **plus** een contract of schadecheck genereren, opnieuw genereren, uploaden, mailen en verwijderen |

**Waarom die twee gescheiden zijn.** Op een contract staan het adres, het telefoonnummer en het
rijbewijsnummer van de klant. Heeft iemand die gegevens niet nodig voor zijn werk? Dan krijgt hij
geen van beide vinkjes. Moet iemand contracten kunnen uitdraaien? Dan krijgt hij **Documenten
bewerken en genereren**. Dat vinkje geeft vanzelf ook inzage. Je hoeft ze dus niet allebei aan te
zetten.

**Wat er donker wordt zonder documentrechten:**

- Het menu-item **Documenten** verdwijnt helemaal.
- Het tabblad **Documenten** op de voertuigkaart blijft leeg.
- Bij een reservering kun je geen contract of schadecheck openen, afdrukken of mailen.
- Bij een verouderd document is er geen **Opnieuw genereren**.

**Wat er wél gewoon blijft werken:** het ophalen zelf. Heb je **Reserveringen beheren**, maar geen
documentrechten? Dan kun je een auto meegeven. En dan **maakt de app het contract gewoon aan**.
Je kunt het alleen niet openen of afdrukken. Laat de klant dan niet met lege handen weggaan. Haal er een
collega bij die het contract kan uitdraaien.

Zie ook hoofdstuk 8, paragraaf 8.7.

---

## 15.6 Het ene recht dat ook voor een beheerder telt

**Kilometerverlaging goedkeuren** werkt anders dan alle andere vinkjes. Dit recht wordt streng
gecontroleerd: **ook een beheerder moet het aangevinkt hebben.** Staat het bij jou uit? Dan kun je
geen lagere kilometerstand bevestigen. Het maakt niet uit hoeveel andere rechten je hebt.

Wanneer heb je het nodig? Je vult bij het ophalen of innemen een kilometerstand in. Die stand is
lager dan de stand die de app van die auto kent. Dan komt het venster
**Kilometerstand-overschrijving vereist**. Je moet dan **je eigen accountwachtwoord** typen. Niet
dat van een collega. En ook geen apart "beheerderswachtwoord". Je eigen wachtwoord.

Heb je het recht niet, dan staat er:

> *"Je hebt geen recht om een verlaging van de kilometerstand te autoriseren. Vraag iemand met het
> recht 'authorize_mileage_decrease'."*

Haal er dan iemand bij die het recht wél heeft. Die vult zijn eigen wachtwoord in. Zie ook hoofdstuk
11, paragraaf 11.16.

---

## 15.7 Vijf profielen die in de praktijk voorkomen

Hieronder staan vijf combinaties van vinkjes. Bij elke combinatie staat wat zo iemand op een dag
doet. Ze zijn bedoeld als voorbeeld voor de beheerder die een nieuw account inricht.

### Baliemedewerker (alleen verhuren)

**Vinkjes:** Dashboard bekijken · Voertuigen bekijken · Klanten bekijken · Reserveringen beheren ·
Documenten bekijken · Klantportaal bekijken.

**Zijn dag:** begint op het **Dashboard** en de **Reserveringskalender**. Hij geeft auto's mee en
neemt ze terug. Hij beantwoordt de telefoon. Hij zoekt reserveringen op contractnummer. Hij drukt
het contract af dat bij het ophalen is gemaakt.

**Wat hij ziet:** **Dashboard**, **Voertuigen**, **Scannen**, **Klanten**, **Klantenportaal**,
**Reserveringen**, **Documenten**, **Transporten**.

**Wat hij niet mag:** een auto of klant wijzigen of aanmaken. Kosten registreren. Onderhoud
plannen. Rapporten openen. Een document genereren of mailen. Een portaalaanvraag afhandelen. Een
overdracht terugdraaien. Een opgehaalde huur annuleren of verwijderen. Voor die laatste twee zijn
sinds oktober 2026 eigen vinkjes (15.16).

**Hoort bij:** de werkstromen ophalen, innemen en achterstallige verhuringen nalopen (hoofdstuk
16).

### Verhuurmedewerker (het volledige kantoorwerk)

**Vinkjes:** Dashboard bekijken · Voertuigen beheren · Klanten beheren · Reserveringen beheren ·
Documenten bewerken en genereren · Schadecontroles beheren · Klantportaal beheren · Kosten beheren ·
Kilometerverlaging goedkeuren.

**Zijn dag:** alles van de baliemedewerker. Daarbij komt: klanten aanmaken en bijwerken, boekingen
wijzigen, contracten genereren en mailen, schadechecks maken, portaalaanvragen beoordelen en kosten
vastleggen.

**Wat hij niet ziet:** **Onderhoud** (daar is **Onderhoud beheren** voor nodig), **Communicatie**
(**Meldingen beheren** of **E-mailsjablonen beheren**) en **Rapporten** (**Rapporten bekijken**).

**Wat hij niet mag:** gebruikers beheren, de instellingen wijzigen, back-ups maken of terugzetten.
Ook niet: iets uit de prullenbak halen, een overdracht terugdraaien of een opgehaalde huur
annuleren. Dat laatste kan wel als je de vinkjes uit 15.16 erbij aanzet.

### Kijker (meekijken, niets wijzigen)

**Vinkjes:** Dashboard bekijken · Voertuigen bekijken · Klanten bekijken · Reserveringen bekijken.

**Zijn dag:** opzoeken en beantwoorden. Hij kan de kalender lezen. Hij kan een klantkaart openen.
Hij kan zien waar een auto is.

**Wat hij niet mag:** letterlijk niets veranderen. Geen boeking maken, geen auto meegeven, geen
kosten, geen documenten. De knoppen **Ophalen starten** en **Innemen starten** bij de **Snelle
acties** op het **Dashboard** werken bij hem niet. Hij krijgt dan een rechtenmelding.

### Werkplaats

**Vinkjes:** Voertuigen beheren · Onderhoud beheren · Kosten beheren.

**Zijn dag:** de onderhoudskalender nalopen. Auto's in en uit de werkplaats zetten. Blokken
afronden. Reparatiekosten vastleggen.

**Wat hij ziet:** **Voertuigen**, **Scannen**, **Onderhoud**, **Kosten**.

**Wat hij niet ziet:** **Dashboard** (daar is **Dashboard bekijken** voor nodig), **Klanten**,
**Reserveringen** en **Transporten**.

**Let op:** zonder **Reserveringen bekijken** (of **beheren**) opent het onderhoudsscherm wel. Maar
het toont geen blokken. De kalender leest namelijk de reserveringen mee, ook voor de blokken zelf.
Je ziet dan alleen de regel *Geen toegang tot deze gegevens (recht 'Reserveringen bekijken')*. Ook
staat **Transporten** dan niet in zijn menu. Voor dit profiel hoort **Reserveringen bekijken** er
dus gewoon bij. Zie ook 15.11.

### Boekhouding

**Vinkjes:** Kosten beheren · Rapporten bekijken · Voertuigen bekijken.

**Zijn dag:** kosten boeken en controleren. Rapporten draaien over kosten, benutting en APK.

**Wat hij ziet:** **Voertuigen**, **Scannen**, **Kosten**, **Rapporten**.

**Wat hij niet ziet:** **Dashboard**, **Klanten**, **Reserveringen**, **Documenten**,
**Transporten**, **Klantenportaal**.

**Let op:** het scherm *Administratie - Factuurgegevens* zit achter de knop **Administratie** op
het scherm **Reserveringen**. Moet iemand de facturatiegegevens kunnen uitlezen? Dan heeft hij dus
ook **Reserveringen bekijken** nodig.

---

## 15.8 Wat je ziet als je een recht mist

Dit gaat over het moment dat je ergens komt waar je het recht niet voor hebt. Of dat je op iets
klikt waar je het recht niet voor hebt. In september 2026 is er een doorlichting geweest. Dat is een
grondige controle van alle rechten. Sinds die doorlichting maken de meeste schermen een ontbrekend
recht al van tevoren duidelijk. Ze tonen een eigen pagina en grijze knoppen, in plaats van een
melding achteraf. Zie 15.9.

Er zijn drie manieren waarop de app je een ontbrekend recht laat merken.

**1. Het menu-item staat er niet.** Dit komt het meest voor. Je ziet **Onderhoud** of
**Documenten** gewoon niet staan. Er is geen grijze knop en geen uitleg. Het item is er niet.

![Het menu links van een account met alleen kijkrechten: Onderhoud, Kosten en Communicatie ontbreken](afbeeldingen/15-menu-kijker.png)
*Het menu van een account met alleen kijkrechten. Vergelijk het met het volledige menu in hoofdstuk 1,
paragraaf 1.2. De items waar je geen recht voor hebt, staan er gewoon niet.*

**2. Een melding met de naam van het recht erin.** Open je een scherm langs een omweg? Of druk je
op een knop waar je het recht niet voor hebt? Dan komt er:

> *Not authorized. One of these permissions required: view_documents, manage_documents*

Achter de dubbele punt staat welk recht ontbreekt. Die namen zijn Engels. In de tabel in 15.4 vind
je waar ze bij horen. Schrijf de melding over. Dan kun je hem laten zien als je de beheerder om het
recht vraagt.

**3. Een scherm met "Toegang geweigerd".** Bij de beheerschermen krijg je een net venster:
**Toegang geweigerd** met de tekst *"Je hebt geen toestemming voor deze functie."*

**Geen van drieën is een storing.** Vernieuwen helpt niet. Opnieuw inloggen helpt niet. Een andere
browser helpt ook niet. Vraag de beheerder om het vinkje. Hij zet het aan in **Gebruikers**. Het
werkt dan bij je volgende handeling.

---

## 15.9 De schermmelding en de grijze knoppen (sinds september 2026)

Sinds de doorlichting van de rechten in september 2026 laten de meeste schermen een ontbrekend
recht al vooraf zien. Dus niet pas na een klik. Drie dingen zijn hierdoor bijgekomen ten opzichte
van 15.8:

**Een scherm zonder recht toont een duidelijke pagina, niet alleen een lege.** Soms kom je toch op
het adres van een scherm waar je het recht niet voor hebt. Bijvoorbeeld door een overgetikte link,
een oude snelkoppeling of een adres dat een collega doorstuurt. Dan opent geen leeg scherm. Je ziet
een pagina met de kop **"U heeft geen toegang tot dit scherm"**. Daaronder staat een zin die het
ontbrekende recht met naam noemt. Bijvoorbeeld: *"Hiervoor is het recht 'Onderhoud beheren' nodig.
Vraag een beheerder om het aan te zetten."* Er staat een knop naar het eerste scherm dat je wél mag
openen. Het scherm zelf vraagt in dit geval niets op bij de server. De server is de computer waarop
de app draait. Dat geldt ook voor een oude bladwijzer of gedeelde link. Bijvoorbeeld naar
**Onderhoud** (`/maintenance`), de bewerkpagina van een reservering (`/reservations/edit/…`) of het
toevoegen van een kostenpost (`/expenses/add`). Mis je het recht daarvoor? Dan zie je voortaan
diezelfde schermmelding in plaats van een leeg of kapot scherm.

**Een knop die je niet mag gebruiken, blijft zichtbaar maar staat uit.** Op steeds meer schermen
zie je nu een knop die er wel staat, maar **grijs** is. Wijs je hem aan met de muis? Of spring je er
met Tab naartoe? Dan verschijnt een tekstballon die het ontbrekende recht noemt. Bijvoorbeeld
*"Hiervoor heeft u het recht 'Reserveringen beheren' nodig."* Op een tablet of telefoon kun je
niets aanwijzen. Daar tik je op de knop. Dan verschijnt dezelfde tekstballon. Met het toetsenbord
spring je er met Tab naartoe. Je opent hem met Enter of de spatiebalk. De ballon noemt het vinkje.
Verder gebeurt er niets: geen foutmelding, geen half uitgevoerde actie. Hetzelfde geldt voor een
tabblad dat je niet mag openen. Bijvoorbeeld **Contractsjablonen** en **Transportrapportsjablonen**
bij het scherm **Documenten**, als je het vinkje **PDF-sjablonen beheren** mist (hoofdstuk 8,
paragraaf 8.5). Het tabblad staat er grijs. Tikken of klikken zegt welk vinkje je mist. Voor deze
knoppen vervangt dit de oude melding uit 15.8, punt 2. Die melding kan nog wel voorkomen bij een
knop die deze behandeling nog niet heeft gekregen.

![Het scherm Voertuigbeheer van een account met alleen kijkrechten: de knop Voertuig toevoegen (1) staat grijs, met een tekstballon die het ontbrekende recht noemt](afbeeldingen/15-grijze-knop-uitleg.png)
*Een grijze knop met uitleg: **Voertuig toevoegen** (1) staat er wel, maar werkt niet. Wijs hem aan
en de tekstballon zegt welk vinkje je mist.*

**Een stukje van een scherm dat gegevens uit een ander recht toont, laat dat nu netjes weg.**
Sommige schermen tonen een detail dat eigenlijk bij een ander recht hoort. Bijvoorbeeld een
klantnaam op een scherm waarvoor je geen klantrecht hebt. Heb je dat andere recht niet? Dan
verschijnt daar de zin **"Geen toegang tot deze gegevens (recht '...')"**. Of het stukje wordt
gewoon weggelaten, als het maar een detail was. Bijvoorbeeld een naam naast een nummer. Ook hier:
geen foutmelding en geen scherm dat blijft laden.

## 15.10 Transporten, Communicatie en Onderhoud: wie het scherm ziet

**Transporten** staat in het menu van iedereen met **Reserveringen bekijken/beheren** of
**Voertuigen bekijken/beheren**. Je hebt daar geen apart transportrecht voor nodig. Dat is bewust
zo. Het scherm toont de overbrengingen die bij een verhuring of een voertuig horen. Wie een van de
twee al mag zien, moet dat dus ook hier kunnen volgen.

**Communicatie** vraagt **Meldingen beheren** of **E-mailsjablonen beheren** om het scherm te
mogen openen. Wie meldingen mag versturen, verliest het scherm dus niet omdat sjablonen apart
staan. Sjabloonbeheer blijft alleen voor **E-mailsjablonen beheren**. Daaronder valt: een sjabloon
aanmaken, bewerken en verwijderen, en het e-maillogboek. Dat recht is met opzet alleen voor admin
en manager. Zonder dat recht staan die knoppen er wel, maar grijs. Of het scherm toont "geen toegang
tot deze gegevens". Zie 15.9. Een herinnering of eigen bericht versturen (APK, garantie, onderhoud)
vraagt **Meldingen beheren**. Zonder dat recht staan de verstuurknoppen er ook wel, maar grijs.

**Onderhoud** vraagt het recht **Onderhoud beheren** om het scherm te mogen openen. Wat dat recht
daar precies wel en niet dekt, staat in 15.11.

## 15.11 Onderhoud beheren: wat het wel en niet dekt

Stel, je hebt alleen **Onderhoud beheren**, en niet ook **Reserveringen beheren**. Dan kom je op een
grens die niet voor de hand ligt. De werkplaatskalender opent gewoon. Een bestaand blok **afronden**
werkt ook. Dat werkt wel alleen als de kalender de blokken mag tonen (zie onderaan).
Maar **nieuw onderhoud inplannen niet**. Dat loopt via dezelfde route als een gewone boeking. En
die vraagt **Reserveringen beheren**.

| Handeling op het onderhoudsscherm | Wat er nodig is | Werkt met alléén 'Onderhoud beheren'? |
|---|---|---|
| Nieuw onderhoud inplannen (kop-knop, dag-tegel "+", vanuit een leeg dag-venster) | Reserveringen beheren | Nee |
| Een bestaand onderhoudsblok bewerken (datum, type, notities) | Reserveringen beheren | Nee |
| Onderhoud **afronden**: het blok sluiten, de werkplaats-vlag wissen, de vervanger terugzetten | Onderhoud beheren **of** Reserveringen beheren | Ja |
| Vanuit het onderhoudsoverzicht (**Lijstweergave** → **Gepland**): **Afronden** | Onderhoud beheren **of** Reserveringen beheren | Ja |
| Vanuit het bewerkvenster van een blok: **Afronden** | Onderhoud beheren **of** Reserveringen beheren (het bewerkvenster zelf openen vraagt Reserveringen beheren) | Nee. Het venster opent niet zonder Reserveringen beheren |
| Vanaf het scanscherm: **Terug uit onderhoud** bij een auto die in een lopend onderhoud (**Binnen**) staat. De knop opent dan het venster **Onderhoud afronden** | Onderhoud beheren **of** Reserveringen beheren | Ja. **Alleen Voertuigen beheren is niet genoeg**. Een scanaccount met alleen dat vinkje kan het onderhoud niet vanaf het scanscherm afronden |
| Vanuit het onderhoudsoverzicht: **Binnen melden** (blok op *Binnen*, auto in onderhoud) | Voertuigen beheren | Nee. Dit loopt via de route waarmee een auto in onderhoud wordt gezet. Die vraagt dit vinkje. Een werkplaatsprofiel (Voertuigen beheren, Onderhoud beheren, Kosten beheren) heeft het |
| Bij het afronden ook de APK-datum, kilometerstand of laatste-onderhoud-datum van het voertuig bijwerken (zelfde formulier, dezelfde handeling) | Onderhoud beheren **of** Reserveringen beheren | Ja, sinds oktober 2026. Vroeger had je hier ook Voertuigen beheren voor nodig |
| Bij het afronden een APK-formulier uploaden (zelfde formulier, dezelfde handeling) | Onderhoud beheren **of** Reserveringen beheren | Ja, sinds oktober 2026. Vroeger had je hier ook Documenten bewerken en genereren voor nodig |
| Een onderhoudsblok verwijderen | Reserveringen beheren | Nee |
| Een afgeronde onderhoudsregistratie terugzetten | Reserveringen beheren | Nee |
| Bij het bekijken van een onderhoudsblok: een vervanger op "nog te bepalen" of "eigen vervoer" zetten | Reserveringen beheren | Nee |
| Bij het bekijken: foto's, servicerapport of overige documenten uploaden | Documenten bewerken en genereren | Nee |
| Bij het bekijken: kosten aanmaken via de factuurscanner | Kosten beheren | Nee |
| De prullenbak van Onderhoud openen, iets terugzetten of definitief verwijderen | Prullenbak beheren | Nee |
| Reservevoertuig toewijzen als een nieuw onderhoudsblok een bestaande verhuring raakt | Onderhoud beheren **of** Reserveringen beheren | Kan pas nadat het blok is aangemaakt. En dat lukt niet zonder Reserveringen beheren (zie regel 1) |

**Kort gezegd:** met alléén **Onderhoud beheren** kun je een bestaand blok afronden. Maar je kunt
geen nieuw onderhoud inplannen. Je kunt geen blok bewerken of verwijderen. En je kunt geen
afgeronde registratie terugzetten. Daar is ook **Reserveringen beheren** voor nodig. Wil je dat de
werkplaats zelf onderhoud kan inplannen? Geef dat account dan ook **Reserveringen beheren**.

Het afronden zelf is sinds oktober 2026 **één handeling met één vinkje**. De APK-datum, het
APK-formulier en de kilometerstand gaan in dezelfde stap mee. Dat kan ook zonder **Voertuigen
beheren** of **Documenten bewerken en genereren** (hoofdstuk 7, paragraaf 7.6). Eén grens blijft.
Je opent het afrondvenster vanuit de onderhoudskalender. En die toont de blokken pas als je ook
voertuigen en reserveringen mag bekijken (**Voertuigen bekijken** of **beheren**, en **Reserveringen
bekijken** of **beheren**). Het afronden vraagt dus één vinkje. Maar om bij het blok te komen heb
je er twee meer nodig.

Eén uitzondering. Vanaf het scanscherm (**Voertuigen → Scannen**) kan iemand met alléén
**Onderhoud beheren** een bestaand onderhoudsblok van het gescande voertuig wél bewerken. Dat gaat
via de knop "Onderhoud openen". Die ene route accepteert sinds deze doorlichting **Onderhoud
beheren** naast **Reserveringen beheren**. De reden: deze route is nergens anders vandaan te
bereiken.

**Het scanscherm en een auto die in een lopend onderhoud staat.** Sinds de wijziging van oktober
2026 rond je een onderhoud altijd af met de knop **Afronden**. Dat geldt ook vanaf het scanscherm.
De knop **Terug uit onderhoud** opent daar het venster **Onderhoud afronden**. Dat gebeurt als de
auto op **Binnen** staat in een blok dat vandaag loopt. Stel, een account heeft op het scanscherm
wel **Voertuigen beheren**, maar niet **Onderhoud beheren** of **Reserveringen beheren**. Dan kan
dat account dat venster niet gebruiken. Het kan het onderhoud dus niet vanaf het scanscherm
afronden. De knop zegt welk vinkje hij mist (15.9). Staat een auto in de werkplaats zonder lopend
onderhoud? Dan geeft zo iemand de auto wel nog met één klik vrij.

## 15.12 Etiketsjablonen: bekijken kan iedereen, wijzigen niet

De sjablonen voor kentekenlabels (**Documenten → Barcode-etiketten**) hebben een bijzondere regel.
**Elke ingelogde medewerker kan de lijst met etiketsjablonen inzien**, ook zonder enig extra
recht. Dat is bewust zo gebouwd. Bij het scannen en printen van een label moet iedereen uit die
lijst kunnen kiezen. **Een sjabloon wijzigen, aanmaken of verwijderen vraagt wél het recht
'PDF-sjablonen beheren'**. Zonder dat recht is de knop **Barcode-etiketten beheren** onder
**Documenten** grijs (zie 15.9).

---

## 15.13 Prijzen verbergen

Naast de rechten staat bij elk account een schakelaar **Prijzen verbergen**. Daarbij staat:
*"Gebruiker ziet nergens in de app prijzen/geldbedragen"*.

Staat die aan? Dan zie je op de plek van elk bedrag drie puntjes: **•••**. Dat geldt overal. Bij de
totaalprijs van een verhuring. Bij de kosten bij een voertuig. Bij de bedragen in de rapporten.

Het is geen recht, maar een afscherming. Met deze schakelaar aan kun je gewoon alles doen wat je
vinkjes toestaan. Je ziet alleen de bedragen niet. Dat is handig voor wie wel met de auto's werkt,
maar niets met de tarieven te maken heeft.

---

## 15.14 Actief en inactief

Bij elk account staat de schakelaar **Actief**. Daarbij staat: *"Gebruiker kan inloggen wanneer actief"*.

Gaat een collega weg? Zet zijn account dan **op inactief**. Verwijder het niet. Alles wat hij ooit
heeft gedaan, blijft dan met zijn naam in de geschiedenis staan. Ook in het activiteitenlog.
Verwijder je het account, dan is die koppeling minder duidelijk.

Probeer je in te loggen op een inactief account? Dan meldt de app:

> *403: Account has been disabled*

Dat is geen wachtwoordfout. Blijf niet proberen. Na vijf mislukte pogingen zit je werkplek
bovendien een kwartier vast (hoofdstuk 12).

---

## 15.15 Korte vuistregels

- De rol zegt wat voor werk iemand doet. De **vinkjes** bepalen wat hij mag.
- **Beheerder** mag alles. Houd het aantal beheerders klein.
- **Bekijken** en **beheren** zijn twee verschillende vinkjes. Moet iemand iets kunnen wijzigen?
  Dan heeft hij het beheer-vinkje nodig. Het bekijk-vinkje hoeft er dan niet apart bij.
- Documenten hebben **eigen** rechten. Zonder die vinkjes kun je wél ophalen. Maar je kunt het
  contract niet openen.
- **Kilometerverlaging goedkeuren** heeft zelfs een beheerder apart nodig.
- De drie beheerschermen (**Gebruikers**, **Back-upbeheer**, **App-instellingen**) zitten vast aan
  de rol Beheerder, niet aan een vinkje. De **prullenbak** niet meer. Die heeft sinds oktober 2026
  zijn eigen vinkje: **Prullenbak beheren**.
- Een overdracht terugdraaien, een opgehaalde huur annuleren of verwijderen en de prullenbak
  beheren: elk heeft een eigen vinkje (15.16). **Reserveringen beheren** alleen is daarvoor niet
  genoeg.
- Zie je een knop niet? Dan is dat bijna altijd een recht. Het is geen storing.
- Zie je een knop wél, maar **grijs**, met een tekstballon die een recht noemt? Zelfde verhaal.
  Alleen laat het scherm het nu al vooraf zien, in plaats van pas na een klik (15.9).
- **Onderhoud beheren** dekt niet alles op het onderhoudsscherm. Nieuw onderhoud inplannen, een
  blok bewerken of verwijderen vraagt ook **Reserveringen beheren** (15.11).

---

## 15.16 Overdracht terugdraaien, opgehaalde huur annuleren en de prullenbak: drie eigen vinkjes (sinds oktober 2026)

Drie handelingen hingen vroeger aan **Reserveringen beheren**. De prullenbak hing aan de rol
Beheerder. Sinds oktober 2026 heeft elk een eigen vinkje:

| Vinkje | Wat het opent | Uitleg |
|---|---|---|
| **Overdracht terugdraaien** | Een ophaling, een inname of een annulering ongedaan maken | Hoofdstuk 5, paragraaf 5.14 |
| **Opgehaalde huur annuleren of verwijderen** | Een huur annuleren of verwijderen die al is opgehaald | Hoofdstuk 5, paragraaf 5.15 |
| **Prullenbak beheren** | De prullenbakken openen (ook die van Kosten en van de chauffeurs van een klant), iets terugzetten en definitief verwijderen | Hoofdstuk 10, paragraaf 10.6 |

**Wie ze heeft.**

- Een **beheerder** altijd. Die gaat voor elk vinkje vanzelf door.
- Elk account met de rol **Manager** heeft ze **één keer** automatisch gekregen. Dat gebeurde bij
  de eerste start na de uitrol van deze versie. Dat is eenmalig. Haal je een vinkje bij een manager
  weg? Dan blijft het weg. En een manager die je ná de uitrol aanmaakt, krijgt ze **niet** vanzelf.
  Vink ze dan zelf aan.
- Voor **elk ander account** staan ze uit totdat je ze in **Gebruikers** aanvinkt. Ze staan vanzelf
  in het rijtje onder **Aanvullende rechten**, met de namen uit de tabel hierboven.

**Wat dit verandert.** Wie alleen **Reserveringen beheren** heeft, kan niet meer terugdraaien. Hij
kan ook geen opgehaalde huur meer annuleren of verwijderen. Daar is het eigen vinkje voor nodig.
Een reservering annuleren of verwijderen die nog niet is opgehaald, vraagt nog steeds alleen
**Reserveringen beheren**. En de prullenbakken zijn niet meer alleen voor de rol Beheerder. Wie
**Prullenbak beheren** heeft, ziet ze. Hij kan er iets uit terugzetten. Hij mag ze ook leegmaken.

**Wat je ziet zonder het vinkje.** De knop staat er, maar is grijs. Er staat een tekstballon bij die
het recht noemt (15.9). Kom je er via een omweg toch langs? Dan antwoordt de app met *Not authorized.
One of these permissions required: …*. De Engelse namen daarin zijn `revert_handover`,
`cancel_picked_up_rental` en `manage_recycle_bin`.

**Niet hetzelfde als Kilometerverlaging goedkeuren.** Soms gaat de kilometerstand van een auto
omlaag doordat je een overdracht terugdraait. Dan vraagt de app geen wachtwoord, maar een vinkje in
het venster zelf (5.14). Het wachtwoordvenster uit 15.6 hoort bij het invoeren van een lagere stand
bij het ophalen of innemen.

---

## 15.17 Welk recht werkt pas met welk ander recht (sinds oktober 2026)

Een vinkje alleen is vaak niet genoeg. Stel, iemand heeft **Reserveringen beheren**, maar niet
**Voertuigen bekijken** en **Klanten bekijken**. Dan kan hij wel boeken. Maar de lijsten waaruit je
een auto of klant kiest, blijven leeg. Of ze melden *Geen toegang tot deze gegevens*. Het scherm
**Gebruikers** (hoofdstuk 10, paragraaf 10.2) helpt daarbij:

- Onder elk vinkje staat *Heeft nodig: …*. Daar staan de rechten die het scherm nodig heeft. Staan
  die aan, dan is de regel grijs. Mist er een, dan is hij oranje met een waarschuwingsteken.
- De knop **Benodigde rechten ook aanzetten** vinkt de ontbrekende benodigde rechten in één keer
  aan. Dat gebeurt voor alles wat je aanvinkte. De knop is grijs als er niets ontbreekt. Bij het
  opslaan gebeurt niets vanzelf.
- Sommige rechten maken het werk prettiger, maar zijn niet nodig. Die staan in de tekstballon als
  *Handig erbij: …*.
- **Gebruikers beheren**, **Instellingen beheren** en **Back-ups beheren** zijn *alleen voor beheerders*
  (15.3). Bij een andere rol zijn ze uitgeschakeld in de lijst. De server controleert zelf nog steeds
  hetzelfde als vroeger. Dit is een hulp bij het kiezen, geen nieuwe beveiliging.

De regels volgen de schermen. Voor elk scherm dat een recht opent, staat vast welke rechten erbij
horen. Dat geldt ook voor elk stukje van een scherm dat gegevens uit een ander recht toont (15.9).
