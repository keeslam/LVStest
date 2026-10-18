# 12. Problemen oplossen

Dit hoofdstuk bestaat uit drie delen:

1. **De acht problemen die het vaakst voorkomen**. Bij elk probleem staat wat je stap voor stap
   doet.
2. **Een tabel met de foutmeldingen** die je in het scherm kunt tegenkomen. Daarin staat wat de
   melding betekent. Je ziet wat je controleert. Je ziet of je het zelf kunt oplossen. En je ziet
   wanneer je een beheerder erbij haalt.
3. **Bekende beperkingen**. Dat zijn dingen die op dit moment niet werken of extra aandacht
   vragen. Dat is geen werkwijze. Het is een eerlijke lijst, zodat je er niet op vastloopt.

---

## Deel 1 — De acht problemen die het vaakst voorkomen

### 12.1 Ik kan niet inloggen

**Eerst het simpele.** Controleer of het Caps Lock-lampje uit staat. Controleer of je de juiste
gebruikersnaam gebruikt. De gebruikersnaam is niet je e-mailadres.

**Wat de app zegt en wat het betekent:**

| Melding onder **Inloggen mislukt** | Wat er aan de hand is |
|---|---|
| *Ongeldige gebruikersnaam of wachtwoord* | De gebruikersnaam bestaat niet, of het wachtwoord klopt niet. De app zegt bewust niet welke van de twee. Zo kan niemand uitproberen welke namen bestaan |
| *Je hebt hier geen recht voor.* | Je account staat op inactief |
| *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.* | Vanaf deze werkplek zijn vijf keer achter elkaar foute inloggegevens ingevuld. Of dit account zelf is tijdelijk op slot |

#### De blokkade na vijf mislukte pogingen

Na **vijf** mislukte inlogpogingen binnen een kwartier gaat de deur dicht. Dat is een beveiliging
tegen het raden van wachtwoorden. Het is geen storing.

**Wat je moet weten:**

- De blokkade geldt **per werkplek/netwerk**, niet per persoon. Zit het hele kantoor achter één
  internetverbinding? Dan kan een collega die vijf keer misklikte de hele balie een kwartier
  buitensluiten.
- De blokkade duurt **15 minuten**. Daarna loopt hij vanzelf af.
- **Een beheerder kan de blokkade niet opheffen.** Er is geen ontgrendelknop. Wachten is de enige
  weg.
- Een geslaagde inlogpoging telt niet mee. Blijf dus vooral niet gokken. Elke misser maakt het
  probleem langer.

**Wat een beheerder wél kan doen** terwijl je wacht:

1. Controleren of je account op **Actief** staat (Beheer → Gebruikers).
2. Een nieuw wachtwoord voor je instellen. Dan kom je na het kwartier zeker binnen. De beheerder
   hoeft daarvoor zijn eigen wachtwoord niet opnieuw in te voeren. De handeling wordt wel
   vastgelegd.
3. In de activiteitenlog kijken wie er aan het proberen was.

**Als je halverwege de dag ineens uitgelogd bent:** je sessie verloopt na een kwartier zonder
activiteit. Een sessie is de tijd dat je ingelogd bent. Je ziet eerst de waarschuwing **Sessie
verloopt binnenkort** met de knop **Ingelogd blijven**. Doe je niets? Dan volgt **Sessie
verlopen** met *"Je bent uitgelogd wegens inactiviteit"*. Log gewoon opnieuw in. Er gaat niets
verloren.

---

### 12.2 Het voertuig is niet beschikbaar terwijl het er gewoon staat

Een auto telt als **beschikbaar** als hij aan twee voorwaarden voldoet. Hij is vrij in de
gevraagde periode, **én** zijn status is in orde. Is de auto niet beschikbaar? Dan is het altijd
één van deze vier oorzaken:

| Oorzaak | Hoe je het ziet | Wat je doet |
|---|---|---|
| Er ligt een reservering overheen | De auto staat op de kalender in die periode | Kies andere datums of een andere auto |
| De auto staat in de werkplaats | De onderhoudsstatus is **Onderhoud nodig** of **Momenteel in onderhoud**. Of de beschikbaarheid is **Reparatie nodig**, omdat een onderhoud op **Binnen** staat | Is hij klaar? Rond het onderhoud af met **Afronden**. Of gebruik **Terug van onderhoud** of **Terug uit onderhoud** (hoofdstuk 7) |
| De auto staat op "niet voor verhuur" | De beschikbaarheidsstatus op de voertuigkaart | Zet de status om als dat klopt |
| Een oude huur is nooit afgesloten | De auto staat bij **Reserveringen** achter **… achterstallig** | Neem de huur alsnog in (hoofdstuk 11, paragraaf 11.6) |

De laatste oorzaak is de sluipende. Staat een auto op je terrein, maar niet in de lijst met
beschikbare auto's? Kijk dan altijd eerst bij **Reserveringen** achter **… achterstallig**.

Een auto met een **onderhoudsblok** in de gevraagde periode is een apart geval. Die telt niet mee
als beschikbaar. Maar je mág hem wel bewust boeken. Zie 12.3. Staat dat onderhoud nog op
*gepland*? Dan heet de auto **Gepland** en niet **Reparatie nodig**. Pas als het onderhoud op
**Binnen** staat, wordt hij **Reparatie nodig** (hoofdstuk 7, paragraaf 7.3).

---

### 12.3 Ik kan geen reservering aanmaken

Loop deze vier langs:

**1. De periode botst met een andere boeking.**

> *Reservation conflicts with existing bookings*

De app toont ook welke reservering botst. Kies andere datums of een andere auto. Twee mensen
kunnen niet tegelijk dezelfde auto boeken. Proberen twee mensen het op hetzelfde moment? Dan lukt
het precies één van hen.

**2. Er staat onderhoud gepland in die periode.** Dit is een **waarschuwing**, geen blokkade:

> *"Let op: dit voertuig staat in deze periode ingepland voor onderhoud (01-10-2026 t/m
> 05-10-2026). Opslaan mag; het onderhoudsblok blijft staan."*

Je mag gewoon opslaan. Zorg dan wel dat het onderhoud wordt verzet of geregeld.

**3. De klant staat op de zwarte lijst voor dit voertuig.**

> *This customer is blacklisted for this vehicle and cannot be booked on it.*

Kies een andere auto. Of laat de zwarte lijst aanpassen door iemand met het recht om klanten te
beheren.

**4. De APK is verlopen.**

> *"De APK (keuring) van dit voertuig is verlopen op &lt;datum&gt;. Bevestig dat het veilig en legaal
> is om te verhuren voordat je verdergaat."*

Dit is ook een waarschuwing. Verhuur geen auto met een verlopen APK. Laat hem eerst keuren.

---

### 12.4 Het PDF klopt niet

**De gegevens op het contract zijn oud.** Kijk of er een oranje label **Verouderd** bij het
document staat. Zo ja: de reservering is veranderd nadat het contract was gemaakt. Klik op
**Opnieuw genereren** (hoofdstuk 8).

**Er staan velden leeg.** Is iets leeg op de klantkaart of de voertuigkaart? Dan blijft het ook
leeg op het contract. Vul het ontbrekende aan. Maak het contract daarna opnieuw.

**Het contract ziet er anders uit dan gewend.** Dan is er een ander sjabloon gebruikt. Of het
standaardsjabloon is gewijzigd. Een sjabloon is het vaste model waarmee de app een contract
maakt. Kijk onder **Documenten → Contractsjablonen** welk sjabloon het label **Standaard** heeft.

**Op het contract staat "nader te bepalen" als einddatum.** Dat klopt. De huur heeft geen
einddatum. Vul de einddatum in. Maak het contract daarna opnieuw.

**Het document opent niet of is leeg.** Probeer **Downloaden** in plaats van **Bekijken**. Blijft
het bestand leeg of onvindbaar? Dan is het bestand van de server verdwenen. Maak het opnieuw als
dat kan. Meld het bij een beheerder.

---

### 12.5 Het maken van een PDF mislukt

Je ziet **Contract kon niet gemaakt worden**. Daarbij staat: *"De handeling is vastgelegd, maar
het document is niet aangemaakt. Probeer het opnieuw of controleer de sjablonen."*

**Het ophalen of innemen zelf is wél verwerkt.** Alleen het document ontbreekt.

Stappen:

1. Klik op **Opnieuw proberen**.
2. Lukt dat niet? Lees dan de melding eronder. Dit zijn de meest voorkomende:

| Melding | Betekenis | Oplossing |
|---|---|---|
| *Het contractsjabloon 'naam' heeft geen velden. Vul het sjabloon onder Documenten → Contractsjablonen.* | Het gekozen sjabloon is leeg | Kies een ander sjabloon. Laat de velden plaatsen |
| *Het contractsjabloon bestaat niet meer. Kies een ander sjabloon onder Documenten → Contractsjablonen.* | Het sjabloon bestaat niet meer | Kies een ander sjabloon |
| *Er is geen contractsjabloon ingesteld. Maak er een aan onder Documenten → Contractsjablonen.* | Er is helemaal geen sjabloon | Beheerder |
| *Aan deze reservering is nog geen voertuig gekoppeld. Ken een voertuig toe en maak het document daarna opnieuw.* | Er hangt nog geen auto aan deze reservering | Wijs eerst een voertuig toe |
| *Aan deze reservering is geen klant gekoppeld, dus het document kan niet worden gemaakt.* | Er hangt geen klant aan | Koppel eerst een klant |
| *Dit is een onderhoudsblok, geen verhuur — hier hoort geen document bij.* | Je probeert een contract te maken op een onderhoudsblok | Dat hoort niet. Er is geen contract |
| *Er is geen schadechecksjabloon. Maak er een aan onder Documenten → Schadecheck-sjablonen.* | Er is geen schadechecksjabloon | Beheerder |

3. Lukt het daarna nog niet? Maak het document dan later alsnog vanuit de reservering. Meld het
   bij een beheerder.

---

### 12.6 De e-mail komt niet aan

Zie hoofdstuk 9 voor de volledige lijst. In het kort:

1. Kijk onder het document in **Reserveringsdocumenten**. Staat er **Verzonden op … aan …**? Dan
   is de mail verstuurd. Het probleem zit dan bij de ontvanger (spamfilter, verkeerd adres).
2. Staat er **Verzenden mislukt — …**? Lees dan de reden.
3. Staat er niets? Dan is er nooit iets verstuurd. Verstuur alsnog.

De reden *Er is geen werkende e-mailconfiguratie voor dit soort e-mail* betekent dat de
mailinstellingen ontbreken. Dat kan alleen een beheerder oplossen.

Gebruik hiervoor niet het tabblad **E-maillogboek** onder **Communicatie**. Zie 12.12.

---

### 12.7 Ik heb iets op de verkeerde reservering gedaan

Kijk eerst wát je hebt gedaan. Het antwoord verschilt per handeling.

| Handeling | Terug te draaien? | Hoe |
|---|---|---|
| Ophalen | Ja, met het vinkje **Overdracht terugdraaien** | **Overdracht terugdraaien** (5.14) |
| Innemen | Ja, met het vinkje **Overdracht terugdraaien** | **Overdracht terugdraaien** (5.14) |
| Annuleren | Ja, als de auto nog vrij is | **Annulering terugdraaien** (5.14) |
| Verwijderen | Ja, met het vinkje **Prullenbak beheren** | De prullenbak van dat scherm → **Terugzetten** (10.6) |
| Klant, voertuig of datums gewijzigd | Ja | **Klant / Voertuig / Datums wijzigen** |
| Document gegenereerd | Niet nodig | **Opnieuw genereren** maakt een nieuwe versie |
| E-mail verstuurd | Nee | Bellen |

Zie hoofdstuk 11 voor elk van deze gevallen.

---

### 12.8 Er is per ongeluk iets gewijzigd en niemand weet door wie

Open het record (de reservering, het voertuig of de klant). Kijk onder **Geschiedenis**. Daar
staat per regel wie het deed en wanneer. Je ziet ook welk veld het was, met de oude en de nieuwe
waarde. Een beheerder ziet alles bij elkaar onder **App-instellingen → Activiteit →
Activiteitenlog**. Daar kan hij filteren op gebruiker, actie en periode.

Ontbreekt het record helemaal? Kijk dan in de **prullenbak van dat scherm**. Daar staat wie het
wanneer heeft verwijderd. Iemand met het vinkje **Prullenbak beheren** kan het daar terugzetten.

---

## Deel 2 — Foutmeldingen

Sinds oktober 2026 spreekt de app bij een fout Nederlands. Je ziet een korte zin die zegt wat er
aan de hand is. Waar het kan, staat er ook wat je eraan doet. Een rood blok met alleen *Fout*
hoort er niet meer te staan. Een stuk technische tekst zoals *500: {...}* ook niet. Een paar
meldingen komen rechtstreeks van de server. Die zijn nog Engels. Gebruik de tabellen hieronder
om te zien wat er wordt bedoeld.

**De korte zinnen voor wanneer de app zelf niet meer weet dan de soort fout:**

| Je ziet | Wat er aan de hand is |
|---|---|
| *De invoer klopt niet. Controleer de velden en probeer het opnieuw.* | Een veld is verkeerd of leeg |
| *Je sessie is verlopen. Log opnieuw in.* | Je bent uitgelogd |
| *Je hebt hier geen recht voor.* | Je mist een vinkje (hoofdstuk 15) |
| *Dit item is niet gevonden. Misschien is het al verwijderd.* | Het record bestaat niet (meer). Kijk in de prullenbak |
| *Dit kan nu niet: het botst met een andere wijziging of een bestaand item.* | Bijvoorbeeld een dubbel nummer. Of een collega was je voor |
| *Het bestand is te groot.* | Kies een kleiner bestand |
| *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.* | Je hebt in korte tijd erg veel gedaan |
| *Er ging iets mis op de server. Probeer het opnieuw; blijft het misgaan, meld het dan aan de beheerder.* | Een fout aan de kant van de server |
| *De server is tijdelijk niet bereikbaar. Probeer het over een minuut opnieuw.* | De server is even weg of wordt opnieuw gestart |
| *De server antwoordde niet op tijd. Controleer de verbinding en probeer het opnieuw.* | Het verzoek duurde langer dan 30 seconden |
| *Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.* | Je computer heeft geen verbinding |

Heeft de fout een eigen oorzaak? Dan staat er een nog preciezere zin. Bijvoorbeeld *Dit
debiteurennummer is al in gebruik.*, *Er loopt al een back-up. Wacht tot die klaar is.* of *Een
ander heeft dit item net gewijzigd. Open het opnieuw en probeer het nog eens.* Een veldmelding in
een formulier staat ook in het Nederlands. Bijvoorbeeld *Dit veld is verplicht*, *Vul een geldig
e-mailadres in* of *Minimaal 3 tekens*.

### Bij ophalen en innemen

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| **"De huur start eerder — datum aanpassen?"** met *"Deze huur staat gepland vanaf …, maar het voertuig gaat vandaag mee."* | De auto gaat vóór de afgesproken begindatum mee | Klopt het dat de huur nu ingaat? | **Ja**. Kies **Ja, startdatum naar vandaag** | Nee |
| **"Uitgifte geblokkeerd"** — *"Dit voertuig staat in de werkplaats en kan niet worden uitgegeven. Rond de werkplaatsklus eerst af."* | De auto staat op **Momenteel in onderhoud** of **Onderhoud nodig** | Is het onderhoud klaar? | **Ja**. Gebruik **Terug van onderhoud** of **Terug uit onderhoud** | Alleen om de uitgifte te forceren |
| **"Uitgifte geblokkeerd"** — *"Dit voertuig staat op \"reparatie nodig\" en kan niet worden uitgegeven. Los dat eerst op."* | De auto staat op **Reparatie nodig** | Wat mankeert eraan? | **Ja**. Los de reparatie op of geef de auto vrij | Alleen om te forceren |
| **"Uitgifte geblokkeerd"** — *"Dit voertuig staat op \"niet voor verhuur\" en kan niet worden uitgegeven."* | De auto is bewust uit de verhuur gehaald | Waarom staat hij zo? | Nee. Zet hem niet zomaar om | **Ja**. Overleg eerst |
| *"Alleen een beheerder kan de uitgifte forceren. Los de werkplaatsstatus op, of vraag een beheerder."* | Je bent geen beheerder. Daarom zie je geen veld voor een reden | — | Los de status op | **Ja**, als het echt geforceerd moet |
| *A reason is required to force a handover of a blocked vehicle.* | Een beheerder klikt op **Toch uitgeven** zonder reden | — | **Ja**. Vul een reden in | Nee |
| **"Dubbel contractnummer"** / *Contract number "…" is already used by reservation #…* | Dit contractnummer zit al op een andere huur | Welke reservering dat is, staat erbij | **Ja**. Kies een ander nummer. Of neem het bewust over met **Overschrijven & doorgaan** | Nee |
| **"Opmerkingen niet bevestigd"** — *"Je moet de voertuigopmerkingen bevestigen voordat je verdergaat met ophalen."* | Er staan opmerkingen bij de auto | Lees de opmerkingen | **Ja**. Klik op **Ik bevestig & ga door** | Nee |
| **"Kilometerstand-overschrijving vereist"** | De ingevoerde stand is lager dan de vorige | Heb je goed afgelezen? | **Ja**, als je het recht hebt. Vul je eigen wachtwoord in | Als je het recht niet hebt |
| *"Je hebt geen recht om een verlaging van de kilometerstand te autoriseren."* | Je mist het recht | — | Nee | **Ja** |
| **"Contractnummer vereist"** | Het veld is leeg | — | **Ja** | Nee |
| *De reservering of het voertuig is intussen gewijzigd. Hierboven staat het bijgewerkte overzicht; controleer het en bevestig opnieuw.* (in het venster **Overdracht terugdraaien**) | Er is iets veranderd terwijl je het venster open had | Lees het nieuwe overzicht | **Ja**. Zet het vinkje voor de kilometerstand opnieuw aan. Bevestig daarna | Nee |
| *Het voertuig is voor deze periode niet meer vrij, dus de annulering kan niet worden teruggedraaid.* | De auto is na de annulering opnieuw geboekt | De nieuwe boeking | Nee. Maak een nieuwe reservering | Nee |

### Bij boeken en wijzigen

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| *Reservation conflicts with existing bookings* | De auto is in die periode al geboekt | De botsende reservering staat erbij | **Ja**. Kies andere datums of een andere auto | Nee |
| *"Let op: dit voertuig staat in deze periode ingepland voor onderhoud (… t/m …). Opslaan mag; het onderhoudsblok blijft staan."* | Een waarschuwing, geen blokkade | Kan het onderhoud worden verzet? | **Ja**. Je mag doorgaan | Nee |
| *This customer is blacklisted for this vehicle and cannot be booked on it.* | Deze klant mag niet in deze auto | Klopt de zwarte lijst nog? | Alleen door een andere auto te kiezen | Voor het aanpassen van de lijst |
| *"De einddatum kan niet vóór de begindatum liggen."* | De datums staan omgedraaid | — | **Ja** | Nee |
| *Undoing a handover or a cancellation goes through POST /api/reservations/:id/revert.* | Een pagina stond nog open van vóór de wijziging. Die probeerde een ophaling, inname of annulering terug te zetten met een status. Het formulier heeft geen statuslijstje meer | — | **Ja**. Gebruik **Overdracht terugdraaien** of **Annulering terugdraaien** (5.14) | Alleen als je het vinkje mist |
| **"De status van een reservering verandert alleen via Ophalen, Inleveren, Annuleren of Terugdraaien."** (`USE_STATUS_ROUTE`) | Iets probeerde de status van een reservering te zetten met een gewone wijziging. Het formulier doet dat niet meer. Je ziet dit alleen op een pagina die nog van vóór de wijziging openstond | Welke handeling je bedoelde | **Ja**. Vernieuw de pagina. Gebruik **Ophalen**, **Inleveren**, **Annuleren** of **Terugdraaien** | Nee |
| **"Een onderhoud rond je af met de knop Afronden, niet met de status."** (`USE_COMPLETE_ROUTE`) | Je probeerde een onderhoud af te sluiten door de status te wijzigen. Of je meldde een auto terug die in een lopend onderhoud staat, zonder dat onderhoud af te ronden | Welk onderhoud er voor deze auto loopt | **Ja**. Klik op **Afronden** (hoofdstuk 7, paragraaf 7.6). Vanaf het scanscherm opent **Terug uit onderhoud** dat venster zelf | Alleen als je het vinkje **Onderhoud beheren** of **Reserveringen beheren** mist |
| **"Dit onderhoud is al afgerond."** (`ALREADY_COMPLETED`) | Iemand anders was je voor. Of je klikte twee keer | Staat het onderhoud onder **Voltooide bekijken (…)**? | **Ja**. Er is niets meer te doen. Is het toch niet klaar? Gebruik dan **Terugdraaien** (7.8) | Nee |
| *Vehicle not found* / *Customer not found* | Het voertuig of de klant bestaat niet (meer) | Staat het record in de prullenbak? | Nee | **Ja**, om terug te zetten |

### Bij tanken en bekeuringen

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| **"Het tankbedrag moet een positief bedrag zijn van ten hoogste € 1.000.000."** (`FUEL_COST_INVALID`) | Het bedrag bij **Tankkosten (€)** is nul, negatief of onzinnig groot | Het bedrag op de bon | **Ja**. Typ een bedrag zoals 45,50 (hoofdstuk 4, paragraaf 4.9) | Nee |
| **"De kostenpost voor de tankbeurt kon niet worden geboekt; er is niets opgeslagen. Probeer het opnieuw."** (`FUEL_EXPENSE_FAILED`) | Het tanken en de kostenpost horen bij elkaar. De kostenpost lukte niet. Daarom is ook het brandstofniveau niet bewaard | — | **Ja**. Probeer het opnieuw | **Ja**, als het blijft misgaan |
| **"Deze status wordt niet meer gebruikt; de app registreert bekeuringen alleen."** (`STATUS_NOT_SUPPORTED`) | Een bekeuring op **Doorbelast**, **Betaald** of **Betwist** zetten kan niet meer. Geen enkel scherm biedt dat nog aan. Je ziet dit alleen op een pagina van vóór de wijziging | — | **Ja**. Vernieuw de pagina | Nee |
| *Er is geen klant aan deze bekeuring gekoppeld, dus er is niets verstuurd.* en *Deze klant heeft geen e-mailadres, dus er is niets verstuurd.* | **Klant informeren** kon niets versturen | Is de bekeuring gekoppeld? Heeft de klant een e-mailadres? | **Ja**. Koppel de klant of vul het adres in | Nee |
| *Het portaal staat uit voor deze klant, dus er is niets verstuurd.* | Het portaal van deze klant staat uit | **Portaal actief** op het tabblad **Portaal** van de klant | **Ja**, als jij de klant beheert | Nee |
| *De mail kon niet worden verstuurd. Controleer de e-mailinstellingen en probeer het opnieuw.* | De mailserver weigerde | De mailinstellingen (hoofdstuk 9, paragraaf 9.6) | Soms | **Ja** |

### Bij verwijderen en terugzetten

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| **"Dit voertuig heeft een lopende of geplande huur en kan niet worden verwijderd."** | Er hangt nog een huur aan | De huren die het tegenhouden, staan erbij | **Ja**. Rond de huur af of annuleer hem eerst | Nee |
| **"Deze klant heeft een lopende of toekomstige reservering en kan niet worden verwijderd."** | Hetzelfde, maar dan bij een klant | Hetzelfde | **Ja** | Nee |
| *Dit record is al teruggezet.* | Iemand was je voor | — | **Ja**. Vernieuw het scherm | Nee |
| *Er bestaat al een voertuig met hetzelfde kenteken. Verwijder of hernoem dat eerst.* | Er staat inmiddels een andere auto op dat kenteken | Welke auto dat is | Nee | **Ja** |
| **"Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode."** | De auto is in die periode opnieuw verhuurd | De nieuwe boeking | **Ja**. Boek de huur opnieuw op andere datums | Nee |
| *Not authorized. One of these permissions required: manage_recycle_bin* | Je mist het vinkje **Prullenbak beheren** voor de prullenbak | — | Nee | **Ja**. Vinkje aanzetten |
| *Not authorized. One of these permissions required: revert_handover* | Je mist het vinkje **Overdracht terugdraaien** | — | Nee | **Ja**. Vinkje aanzetten |
| **"Voor een opgehaalde huur is het recht 'Opgehaalde huur annuleren of verwijderen' nodig."** | Je probeerde een opgehaalde huur te annuleren of te verwijderen. Je hebt dat vinkje niet | — | Nee | **Ja**. Vinkje aanzetten |
| **"De klant van deze chauffeur bestaat niet meer. Zet eerst de klant terug (Klanten, Verwijderde klanten) en daarna de chauffeur."** (`CUSTOMER_MISSING`) | Je zet een verwijderde chauffeur terug. Maar zijn klant staat in de prullenbak | **Klanten** → **Verwijderde klanten** | **Ja**. Zet eerst de klant terug (hoofdstuk 3, paragraaf 3.8) | Alleen met het vinkje **Prullenbak beheren** |
| **"Let op: het voertuig van deze kostenpost bestaat niet meer. De kostenpost staat er weer, maar hoort bij een voertuig dat ontbreekt."** | Een waarschuwing bij het terugzetten van een kostenpost | Is het voertuig definitief verwijderd? | Nee. Zet zo nodig het voertuig terug | Alleen met het vinkje **Prullenbak beheren** |
| *Not authorized. Admin access required.* | Alleen een beheerder mag dit (bijvoorbeeld de beheerschermen). Voor de prullenbak geldt sinds oktober 2026 een eigen vinkje | — | Nee | **Ja** |

### Bij documenten

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| *The PDF template "…" has no fields, so the contract would be completely blank. Open it in the template editor, place the fields, and try again.* | Het sjabloon is leeg | Welk sjabloon op **Standaard** staat | Alleen door een ander sjabloon te kiezen | **Ja**, om het sjabloon te vullen |
| *Template not found* | Het sjabloon bestaat niet meer | — | **Ja**. Kies een ander sjabloon | Nee |
| *A maintenance block is not a rental: there is no contract to generate for it.* | Dit is een onderhoudsblok, geen huur | Zit je op de goede regel? | **Ja** | Nee |
| **"Opnieuw genereren is niet gelukt"** | De nieuwe versie kon niet worden gemaakt | De melding eronder | Soms | Vaak |
| *Not authorized. One of these permissions required: view_documents, manage_documents* | Je mag geen documenten inzien | — | Nee | **Ja**. Vinkje aanzetten |
| *Not authorized. One of these permissions required: manage_documents* | Je mag documenten inzien, maar niet maken | — | Nee | **Ja** |
| **"Je browser heeft afdrukken geblokkeerd. Gebruik de downloadknop en druk handmatig af."** | Een instelling van je browser | Pop-ups toestaan | **Ja**. Download het bestand en druk het dan af | Nee |

### Bij inloggen, rechten en de app zelf

| Melding | Wat het betekent | Wat je controleert | Zelf oplossen? | Beheerder nodig? |
|---|---|---|---|---|
| *401: Incorrect password* | Het wachtwoord is fout | Caps Lock | **Ja**. Maar na vijf keer zit je een kwartier vast | Voor een nieuw wachtwoord |
| *429: Too many login attempts from this IP, please try again after 15 minutes.* | Vijf mislukte pogingen vanaf deze werkplek | — | **Ja**. Wacht een kwartier | Nee (kan het niet opheffen) |
| *429: Account temporarily locked due to too many failed login attempts…* | Dit account staat tijdelijk op slot | — | **Ja**. Wacht | Nee (kan het niet opheffen) |
| *403: Account has been disabled* | Je account staat op inactief | — | Nee | **Ja** |
| *429: Too many requests, please try again later.* | Je hebt in een kwartier heel veel gedaan. Of je hebt heel veel tabbladen openstaan | Sluit overbodige tabbladen | **Ja**. Wacht een paar minuten | Nee |
| *Not authorized. One of these permissions required: …* | Je mist een recht. Achter de dubbele punt staat welk recht | — | Nee | **Ja** |
| **"Het wachtwoord voldoet niet aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer."** (`PASSWORD_TOO_WEAK`) | Het nieuwe wachtwoord is te zwak | De lengte en de tekens | **Ja**. Kies een sterker wachtwoord (hoofdstuk 10, paragraaf 10.2) | Nee |
| **"Je eigen wachtwoord wijzig je via je profiel, onder Wachtwoord wijzigen."** (`USE_CHANGE_PASSWORD`) | Je probeerde je eigen wachtwoord te zetten via Gebruikersbeheer | — | **Ja**. Gebruik **Profiel** → **Wachtwoord wijzigen** | Nee |
| **"De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere rol krijgen."** (`LAST_ADMIN`) | Er moet altijd één actieve beheerder blijven | Hoeveel actieve beheerders er zijn | **Ja**. Maak eerst een tweede beheerder aan | Nee |
| *CSRF token missing* of *403* na lang openstaan | Het tabblad stond te lang open | — | **Ja**. Vernieuw de pagina en log opnieuw in | Nee |
| **"Sessie verlopen"** — *"Je bent uitgelogd wegens inactiviteit"* | Je hebt een kwartier niets gedaan | — | **Ja**. Log opnieuw in | Nee |

### Bij bestanden en laden

| Wat je ziet | Wat het betekent |
|---|---|
| **Bestand gemaakt** — *<naam>.csv (2 kB)* | Het bestand dat je net hebt gevraagd, is klaar. Dat kan een CSV, een PDF of een back-up zijn. Het wordt gedownload. Je ziet de naam en de grootte. Zie je dit niet? Kijk dan in de map Downloads van je browser |
| *Laden…* met een draaiend rondje, in plaats van een leeg scherm | **Documenten**, **Rapporten** en **Communicatie** laden hun scherm bij het openen even na. Wacht tot het rondje weg is |

**Een CSV-bestand openen in Excel.** Een CSV-bestand is een eenvoudig bestand met gegevens in
kolommen. Je maakt het met **Exporteren (CSV)** (klantgeschiedenis, kosten, bekeuringen, de
rapportbouwer). Het is gemaakt voor een Nederlandse Excel. De kolommen zijn gescheiden door een
**puntkomma**. Bedragen hebben een **komma** (*112,50*). Datums zijn **dd-mm-jjjj**. Tijden zijn
**uu:mm**. Kentekens staan met streepjes. Het bestand heet naar het onderwerp en de datum.
Bijvoorbeeld *boetes-2026-10-10.csv*. Dubbelklik erop. Excel zet de kolommen dan goed. Je hoeft
niets te importeren. Begint een tekst met een teken als **=**, **+**, **-** of **@**? Dan krijgt
die tekst een aanhalingsteken ervoor. Zo voert Excel hem niet uit als formule. Het fiscale
CSV-rapport heeft ook datums in **dd-mm-jjjj**. Het heet *fiscaal-<jaar>-<datum>.csv*.

---

## Deel 3 — Bekende beperkingen

Dit zijn dingen die op dit moment **niet** werken zoals je zou verwachten. Ze staan hier zodat je
er niet op vastloopt. **Dit is geen werkwijze.** Gebruik de gewone weg uit de vorige
hoofdstukken. Dit is alleen om te weten waar je moet opletten.

### 12.9 Een annulering terugdraaien lukt niet altijd

Een geannuleerde reservering kun je terugdraaien met **Annulering terugdraaien** (hoofdstuk 5,
paragraaf 5.14). Dat kan alleen als de auto in die periode nog vrij is. Is hij intussen opnieuw
geboekt? Dan moet je een nieuwe reservering aanmaken. Zet dat in de notities. Wat je bij het
annuleren hebt meegegeven (transport, vervanger, chauffeurstoewijzing), komt bovendien niet
vanzelf terug. Kijk dus goed voordat je annuleert.

Een **inname** draai je terug met **Overdracht terugdraaien**. Die knop staat in de lijst achter
**Voltooid bekijken (…)** (hoofdstuk 5, paragraaf 5.8, en hoofdstuk 11, paragraaf 11.13).

### 12.10 Bij annuleren beslis je zelf wat er meegaat

Annuleer je een reservering? Dan laat het venster **Reservering annuleren** zien wat eraan hangt.
Dat kan een transport, een vervangingsreservering, een placeholder en een chauffeurstoewijzing
zijn. Je vinkt per onderdeel aan of het mee moet. Wat je **niet** aanvinkt, blijft staan. De app
ruimt dat later niet alsnog op. **Lees dat lijstje dus voordat je bevestigt** (hoofdstuk 5,
paragraaf 5.9).

### 12.11 De klant krijgt niet overal bericht van

Een klant met een portaalaccount krijgt in deze gevallen automatisch bericht: bij onderhoud, bij
een wijziging of annulering van zijn reservering, bij een nieuw document voor hem, bij een
reactie op zijn portaalaanvraag en rond zijn portaalaccount (hoofdstuk 9, paragraaf 9.8). De
klant krijgt **geen** automatisch bericht:

- over een bekeuring. Dat bericht krijgt hij pas als jij in het venster van de bekeuring op
  **Klant informeren** klikt (hoofdstuk 2, paragraaf 2.6).
- als hij geen portaalaccount heeft, of als het portaal voor hem uitstaat.

Bel of mail in die gevallen zelf. Een document stuur je met **E-mailen** of **Mail naar klant**.

### 12.12 Het tabblad "E-maillogboek" toont de echte verzendgeschiedenis

Onder **Communicatie** staat een tabblad **E-maillogboek**. Tot oktober 2026 stonden daar drie
vaste voorbeeldregels uit maart 2024. Sinds die tijd toont het tabblad wat de app echt heeft
verstuurd. Het tabblad **Analyse** berekent zijn cijfers uit diezelfde regels (hoofdstuk 9,
paragraaf 9.4). Wat je moet weten: de reden van een mislukking staat in het Nederlands. De tekst
van de mailserver staat erachter als technische melding. Een oudere regel zonder vaste code toont
*Verzenden mislukt.* Een mislukking vóór het versturen (bijvoorbeeld een klant zonder
e-mailadres) staat alleen bij de verzendronde. Die telt in de Analyse niet mee. Achter elke regel
opent **Details** meer informatie. Wil je weten of een **document** is verstuurd? Kijk dan nog
steeds in **Reserveringsdocumenten** bij het document zelf.

### 12.13 Twee van de drie handmatige downloadknoppen werken niet

Onder **Back-up & Herstel → Handmatige back-up & herstel** staan drie kaarten.

- **App-gegevens** werkt. Je krijgt een bestand met alle gegevens.
- **Geüploade bestanden** en **App-code** gaven bij de doorlichting van oktober 2026 een
  technische foutmelding. Ze leverden geen bestand op. Sinds de reparaties van die maand wordt
  het bestand tijdens het downloaden gemaakt. Probeer het eerst op jullie eigen server uit
  voordat je erop vertrouwt. Mislukt het? Dan staat er *De back-up kon niet worden gedownload.*
  Je ziet dan geen pad of technische tekst.

Dit raakt de nachtelijke back-up **niet**. Die maakt elke nacht gewoon een back-up van de
gegevens én van de geüploade bestanden. Wil je die bestanden op je eigen computer? Gebruik dan de
knop **Downloaden** bij een van de **Bestand-back-ups** in de lijst erboven.

### 12.14 Wat het leegmaken van de prullenbak niet doet

Sinds oktober 2026 kun je elke prullenbak leegmaken (hoofdstuk 10, paragraaf 10.6). Dat kan per
regel, per selectie of alles van die soort. Een verwijderde klant kan dus echt uit het systeem
verdwijnen. Zijn debiteurnummer komt dan weer vrij. Drie dingen om te weten. Een **reservering,
een onderhoud of een klant met fiscale beoordelingen** kan wél definitief worden verwijderd. De
fiscale beoordelingen gaan dan mee. Alleen het fiscale auditlog onthoudt dat ze er waren
(hoofdstuk 10, paragraaf 10.6). De gegevens van een **verwijderde chauffeur** blijven in de
prullenbak tot die is geleegd. Vraagt iemand om zijn gegevens te wissen? Dan is dus ook
**Definitief verwijderen** nodig. De lijst toont per soort de nieuwste 200 regels. **Prullenbak
leegmaken** haalt wel alles van die soort weg, ook wat niet in de lijst staat. Wat je definitief
verwijdert, kun je niet terugzetten.

### 12.15 Een klein deel van de meldingen is nog Engels

De vensters, knoppen en foutmeldingen zijn Nederlands. Een enkele melding komt rechtstreeks van
de server. Die is nog Engels. Bijvoorbeeld *Reservation conflicts with existing bookings*, *This
customer is blacklisted for this vehicle and cannot be booked on it.* en *Not authorized. One of
these permissions required: …*. Ook de weigeringen bij het terugzetten van een back-up zijn
Engels. De tabellen in deel 2 vertalen de meldingen die je het vaakst ziet. Sinds oktober 2026
zijn er weigeringen bijgekomen. Die hebben wel een Nederlandse zin. Het gaat om de status van een
reservering zetten met een gewone wijziging, en om een bekeuring op **Doorbelast**, **Betaald**
of **Betwist** zetten. Geen scherm laat dat nog toe. Je komt ze dus alleen tegen op een pagina
die nog van vóór de wijziging openstond. Vernieuw die pagina dan.

De **labels in de schermen** zijn wél overal Nederlands. De kostencategorieën heten in het
**Kostenoverzicht** en in de rapporten hetzelfde: **Onderhoud**, **Banden**, **Remmen**,
**Schade**, **Brandstof**, **Verzekering**, **Registratie**, **Schoonmaak**, **Parkeren**,
**Tol**, **Accessoires** en **Overig**.

De melding **"Te veel verzoeken"** (*Te veel verzoeken achter elkaar. Wacht even en probeer het
opnieuw.*) betekent dat je binnen een kwartier heel veel handelingen hebt gedaan. Wacht een paar
minuten. Sluit tabbladen die je niet gebruikt.

### 12.16 Twee mensen in hetzelfde scherm

Werken twee collega's tegelijk aan dezelfde reservering? Dan wint in het volledige
bewerkformulier de laatste die opslaat. De app waarschuwt daar niet bij. De wijziging van de
eerste is dan weg. Gebruik daarom liever de kleine vensters **Datums wijzigen**, **Klant
wijzigen** en **Voertuig wijzigen**. Die sturen alleen het veld dat ze veranderen.

Boeken en ophalen hebben dit probleem niet. Daar houdt de app gelijktijdige handelingen wel
tegen.

### 12.17 Het scherm op een tablet

Het reserveringenscherm past niet netjes op de breedte van een tablet. Je moet er horizontaal in
scrollen. Op een laptop of een groot scherm is dat niet zo.

### 12.18 Ontbrekende bestanden worden niet zichtbaar gemeld

Soms staat een PDF wel in de lijst, maar is het bestand op de server weg. Dat merk je pas als je
op **Bekijken** of **Downloaden** klikt. Er staat geen waarschuwing bij de regel. Kun je een
document niet openen? Meld dat dan bij een beheerder.
