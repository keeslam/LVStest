# 9. E-mail versturen vanuit de app

De app kan zelf e-mail versturen: documenten naar de klant, meldingen naar het klantenportaal,
APK-herinneringen en bericht over een bekeuring. In dit hoofdstuk staat welke mail er bestaat,
wie hem krijgt, waar je ziet of hij aangekomen is, en wat je doet als het misgaat.

---

## 9.1 Welke mails er bestaan

| Mail | Wie hem start | Naar wie |
|---|---|---|
| **Documenten naar de klant** | Jij, met de knop **E-mailen** of **Mail naar klant** | Het e-mailadres dat je in het venster kiest |
| **Portaaluitnodiging en wachtwoord-reset** | Jij, vanuit het klantenportaalscherm | De portaalgebruiker |
| **Bevestiging nieuw e-mailadres / nieuwe aanmelding** | De klant zelf, in het portaal | De portaalgebruiker |
| **Onderhoudsmelding** | De app, zodra onderhoud gepland, verzet of afgerond wordt | De klant van de huur waar dat onderhoud bij hoort |
| **Reservering gewijzigd, geannuleerd of nieuw document** | De app, zodra kantoor dat doet | De klant van die reservering — zie 9.8 |
| **Bekeuring gekoppeld** | De app, zodra een bekeuring aan een klant wordt gekoppeld | Die klant |
| **Reactie op een portaalaanvraag** | Jij, als je een aanvraag beantwoordt | De klant die de aanvraag deed |
| **APK-herinnering** | Jij, met **APK-meldingen versturen** of de knop op de voertuigkaart | De huidige huurder — zie 9.2 |
| **Onderhoudsherinnering en vrij bericht** | Jij, vanuit **Communicatie** | De klanten die je selecteert |
| **GPS-activatieverzoek** | Jij, vanuit het voertuig | De GPS-leverancier |
| **Melding aan kantoor** | De app | Het kantooradres uit de instellingen |

De onderhoudsmail kent zeven soorten bericht. De aanleiding staat in het onderwerp:
**Onderhoud gepland**, **Onderhoud verplaatst**, **Auto in onderhoud**, **Onderhoud klaar**,
**Onderhoud vervalt**, **Onderhoud hoort niet meer bij uw huur**, en
**Vervangend vervoer staat klaar**.

> Onderhouds- en bekeuringsmail gaat alleen uit als het klantenportaal aan staat. Staat het
> portaal uit, dan krijgt de klant geen bericht.

---

## 9.2 Wie krijgt een APK-herinnering?

**Alleen de huidige huurder.** Dat is de klant van de huur die op dit moment loopt. Loopt er
geen huur, dan is het de klant van de eerstvolgende geplande huur.

Staat de auto leeg — geen lopende en geen geplande huur — dan gaat er geen klantmail uit. In
plaats daarvan krijgt kantoor één verzamelmail:

> **Herinnering: 3 voertuig(en) zonder huurder**
> *"Deze voertuigen zijn nu niet verhuurd, dus er is geen huurder om te waarschuwen:"*
> … per regel het kenteken, merk, model en de APK-datum …
> *"Deze melding gaat alleen naar kantoor."*

Is er wél een huidige huurder, maar heeft die geen bruikbaar e-mailadres, dan komt die auto ook
op die kantoorlijst. Zo blijft het zichtbaar dat er iemand gebeld moet worden.

Een klant die de auto ooit heeft gehuurd en nu niet meer, krijgt **nooit** een herinnering. Een
klant van wie de huur pas over een halfjaar begint, krijgt hem alleen als er nu niemand anders
in rijdt.

Het venster **APK-herinnering versturen** op de voertuigkaart toont precies die ene ontvanger,
met het label **Huidige huurder** en de periode van zijn huur erbij. Staat de auto niet
verhuurd, dan meldt het venster **Dit voertuig is nu niet verhuurd** en heet de knop **Melding
naar kantoor versturen**.

Het kantooradres stel je in bij **App-instellingen → E-mail & GPS**, in het kader
**Kantooradres voor meldingen** onder de mailservers. Vul het adres in en kies **Kantooradres
opslaan**. Laat je het leeg, dan gaat de kantoormelding naar het afzenderadres van de app — het
scherm noemt dat adres erbij, zodat je ziet waar hij dan terechtkomt.

---

## 9.3 Documenten mailen naar de klant

Je opent dit venster op drie plekken: met de knop **E-mailen** bij een document, met
**Mail naar klant** in het venster na het ophalen, en vanuit de reserveringskalender.

Het venster heet **Documenten e-mailen naar klant** — *"Selecteer documenten, ontvanger en taal
om naar de klant te sturen"*.

Je vult in:

1. **Selecteer documenten** — de documenten staan gegroepeerd onder **Contracten**,
   **Schadechecks** en **Overige documenten**. Vink aan wat mee moet. Alles wat je aanvinkt gaat
   in **één** e-mail als losse bijlagen.
2. **E-mailadres ontvanger** — kies **Algemeen**, **Facturen**, of **Aangepast e-mailadres** en
   typ het adres zelf.
3. **E-mailsjabloon** — **Contract-e-mail**, **Schadecheck-e-mail** of
   **Gecombineerde documenten-e-mail**. Vink je meer dan één document aan, dan springt de app
   vanzelf naar het gecombineerde sjabloon.
4. **E-mailtaal** — **Nederlands** of **Engels**. Dit gaat alleen over de tekst van de e-mail.
   De documenten zelf zijn altijd Nederlands.
5. **Onderwerp** en **Bericht** kun je aanpassen voordat je verstuurt.

Dan klik je op **E-mail versturen**. Tijdens het versturen staat er *"Versturen..."*.

Gaat het goed, dan sluit het venster met de melding:

> **Gelukt** — *"E-mail succesvol verstuurd naar &lt;adres&gt; met 2 documenten bijgevoegd"*

De app controleert vooraf drie dingen en weigert met een duidelijke melding:

| Melding | Wat je moet doen |
|---|---|
| **Ongeldig e-mailadres** — *"Voer een geldig e-mailadres in"* | Corrigeer het adres |
| **Geen documenten** — *"Selecteer minstens één document om te versturen"* | Vink een document aan |
| *"Geen e-mailadres ontvanger geselecteerd"* | Kies een ontvanger |

> **Let op:** in de keuzelijst staan het algemene adres en het factuuradres van de klant. Het
> hoofdadres van de klant staat er níét bij. Heeft de klant alleen dat, kies dan
> **Aangepast e-mailadres** en typ het over.

---

## 9.4 Waar je ziet of een mail verzonden is

### Bij het document — dit is de plek die je moet gebruiken

Open de reservering en dan **Reserveringsdocumenten**. Onder elk document staat de verzendstatus:

- Groen: **Verzonden op 13-09-2026 aan klant@voorbeeld.nl**
- Rood: **Verzenden mislukt — &lt;reden&gt;**

Staat er niets onder een document, dan is het nooit verstuurd. Is een document meerdere keren
verstuurd, dan zie je de **laatste** poging.

Deze regel is het bewijs dat de klant zijn papieren heeft gekregen. Gebruik hem als een klant
belt met "ik heb niks ontvangen".

### Het scherm Communicatie

Onder **Communicatie** staat een tabblad **E-maillogboek**. Let op: **dit tabblad toont geen
echte verzendingen.** Er staan drie vaste voorbeeldregels uit maart 2024 in, die er altijd staan
en die niets met jouw werk te maken hebben. Hetzelfde geldt voor het tabblad **Analyse**.
Gebruik dit tabblad dus niet om te controleren of een mail eruit is; gebruik de regel bij het
document.

### Het meldingencentrum

Het belletje rechtsboven opent het **Meldingencentrum**. Daar komen gebeurtenissen uit het
klantenportaal binnen — een nieuwe aanvraag, een reactie van een klant. Dit is geen
verzendstatus van e-mail.

---

## 9.5 Als versturen mislukt

Mislukken gebeurt buiten de app: bij de mailserver of bij de ontvanger. De app vertelt wat de
mailserver terugzei. Die tekst is Engels.

| Wat je ziet | Wat het betekent | Wat je doet |
|---|---|---|
| *No valid email configuration for purpose: …* | Er is voor dit soort mail geen mailinstelling ingevuld | Beheerder: vul de mailinstellingen aan (hoofdstuk 10) |
| *Email authentication failed. Your username or password is incorrect.* | De gebruikersnaam of het wachtwoord van de mailserver klopt niet | Beheerder |
| *Your email provider has disabled basic authentication (username + password).* | De mailprovider accepteert deze manier van inloggen niet meer | Beheerder |
| *Cannot connect to the email server. The server refused the connection.* | De mailserver is niet bereikbaar | Probeer later opnieuw; blijft het: beheerder |
| *Connection to email server timed out.* | De mailserver reageerde niet op tijd | Probeer later opnieuw |
| *Email server not found. The hostname could not be resolved.* | De naam van de mailserver klopt niet | Beheerder |
| *Email was rejected by the server.* | De ontvanger of het bericht is geweigerd | Controleer het e-mailadres |
| *SSL/TLS certificate validation failed.* | Beveiligingsprobleem met de mailserver | Beheerder |
| *Failed to send email. Please check your email configuration in Settings.* | Verzamelmelding bij het mailen van documenten | Zie de regels hierboven |

**Wat je zelf kunt doen bij het mailen van documenten:** het venster blijft openstaan als het
mislukt. Er is geen wachtrij en de app probeert het niet vanzelf opnieuw. Controleer het
e-mailadres en klik nog een keer op **E-mail versturen**. Blijft het mislukken, dan ligt het aan
de mailinstellingen en moet er een beheerder bij.

**Bij een portaaluitnodiging** krijg je: *"Account aangemaakt, maar de e-mail kon niet worden
verstuurd. Controleer de e-mailinstellingen en stuur de uitnodiging opnieuw."* Het account is
dan wél aangemaakt. Gebruik daarna de knop **Uitnodiging opnieuw sturen**.

**Bij APK- en onderhoudsherinneringen** meldt de app na afloop
**Meldingen succesvol verstuurd** met daaronder *"3 e-mails verstuurd, 2 mislukt"*.

> **Let op:** die kop zegt "succesvol verstuurd" ook als er nul mails uit zijn gegaan. Lees
> altijd het getal achter "verstuurd". Staat daar 0, dan is er niets verzonden. De reden per
> mislukte mail wordt in dit scherm niet getoond.

Op de voertuigkaart luidt de foutmelding **Fout bij versturen APK-herinnering** — *"APK-herinnering
versturen mislukt. Probeer het opnieuw."*

**Onderhouds- en bekeuringsmail die vanzelf uitgaat** en mislukt, zie je nergens in het scherm
terug. Bel de klant als het belangrijk is dat het bericht aankomt.

---

## 9.6 Mailinstellingen

Alleen een beheerder komt hier. Ga via het menu rechtsboven naar
**App-instellingen → tabblad E-mail & GPS**.

Onder **E-mailconfiguratie** kun je per doel een eigen mailserver instellen. De doelen zijn:
**APK-herinneringen**, **Onderhoudsmeldingen**, **GPS/IEI-informatie**, **Documenten-e-mail**,
**Aangepaste berichten** en **Standaard/Algemeen**. Wat je niet apart invult, valt terug op de
standaardinstelling.

Per instelling vul je in: **Afzender-e-mail**, **Afzendernaam**, **SMTP-host**, **SMTP-poort**,
**SMTP-gebruikersnaam** en **SMTP-wachtwoord**. Daarna **Configuratie opslaan**.

Met de knop **Verbinding testen** controleer je of het werkt. De knop is uitgeschakeld zolang
host, gebruikersnaam of wachtwoord leeg zijn. De test **stuurt geen echte e-mail** — hij logt
alleen in op de mailserver. Onder de knop verschijnt het antwoord, groen of rood:

- Goed: *Connection successful. The SMTP server accepted the credentials.*
- Velden leeg: *SMTP host, username and password are required to test the connection.*
- Mislukt: de reden uit de tabel in 9.5, vaak met een tip erachter zoals *"Common ports: 587
  (TLS), 465 (SSL), 25 (unencrypted)."*

Is er nog niets ingevuld, dan staat er **Geen e-mailconfiguratie ingesteld**.

Het opgeslagen wachtwoord wordt nooit teruggetoond: het veld is leeg als je de instelling later
weer opent. Dat is met opzet.

---

## 9.7 E-mailsjablonen

De teksten van de mails staan op twee plekken.

**Voor documentmail:** App-instellingen → tabblad **Doc-e-mails**. Daar staan
**Huurcontract E-mail**, **Schade Controle E-mail** en **Gecombineerde Documenten E-mail**, elk
in een Engelse en een Nederlandse versie, met een **Onderwerp** en een **Bericht**. Opslaan doe
je met **E-mailsjablonen opslaan**. Vereist het recht **Instellingen beheren**.

**Voor APK, onderhoud en vrije berichten:** **Communicatie → Sjabloonbouwer**. Daar maak je met
**Nieuw sjabloon** een sjabloon met een **Sjabloonnaam**, **E-mailonderwerp**,
**Sjablooncategorie** (APK-herinneringen, Onderhoud, Aangepast) en **E-mailinhoud**. Met
**Placeholders invoegen** zet je velden als het kenteken of de naam van de klant in de tekst.
Vereist het recht **E-mailsjablonen beheren**.

De plaatshouders worden bij het versturen automatisch ingevuld met de gegevens van de
reservering en de klant.

---

## 9.8 Wat de klant hoort bij een wijziging van kantoor

Pas je iets aan een reservering aan, dan hoeft de klant dat niet zelf te ontdekken. De app stuurt
bij deze drie gebeurtenissen automatisch een melding in het portaal **en** een e-mail:

| Wat je doet | Onderwerp van de mail |
|---|---|
| De datums of het voertuig van een huur wijzigen | **Uw reservering is gewijzigd** |
| Een reservering annuleren of verwijderen | **Uw reservering is geannuleerd** |
| Een document genereren dat voor de klant bestemd is | **Nieuw document beschikbaar** |

Daarnaast bestaat de onderhoudsmail uit paragraaf 9.1, met zijn eigen zeven onderwerpen.

Drie dingen om te weten:

- Alleen een klant **met een portaalaccount** krijgt bericht. Heeft de klant geen account, dan blijft
  bellen of zelf mailen nodig.
- Wijzig je twee keer kort achter elkaar hetzelfde, dan krijgt de klant daar niet twee losse
  berichten over.
- Gaat het versturen mis, dan mislukt jouw wijziging daar niet door. De wijziging staat gewoon
  opgeslagen; controleer in dat geval het verzendoverzicht uit paragraaf 9.6.

Wat wél vanzelf gaat, staat in de tabel in 9.1: onderhoud, bekeuringen, portaalaccounts en
reacties op portaalaanvragen.

---

## 9.9 Facturen per e-mail ontvangen

De app heeft een eigen postvak: **fakturenapp@lamgroep.nl**. Elke factuur die daar
binnenkomt, leest de app zelf uit en boekt hij als kosten op het juiste voertuig.
Vraag het onderhoudsbedrijf om dit adres als extra ontvanger (CC) op elke factuur te
zetten. Zelf een factuur doorsturen vanaf een `@lamgroep.nl`-adres werkt hetzelfde.

### Wanneer boekt de app automatisch?

Alleen als alles klopt:

- de afzender staat in de lijst **Vertrouwde afzenders**, en de mail is volgens jullie
  eigen mailserver ook echt van dat adres (zie **Instellen**, punt 4);
- het is echt een factuur — een offerte, herinnering of creditnota wordt nooit vanzelf
  geboekt;
- er staat precies één kenteken op de factuur, en dat kenteken zit in de vloot;
- de factuur is niet eerder binnengekomen (ook niet met een ander factuurnummer geschreven
  of een andere schrijfwijze van de leverancier: hetzelfde factuurnummer met hetzelfde
  totaalbedrag telt als dubbel);
- de regels zijn echt van de factuur gelezen en tellen op tot het totaal (excl. of incl.
  btw), op hooguit 1 euro na;
- de factuurdatum is echt gelezen, ligt niet in de toekomst en is niet ouder dan 400 dagen.

Dan maakt de app één kostenregel per categorie (bijvoorbeeld Onderhoud en Remmen), hangt
de factuur als bon aan elke regel en zet een melding in de bel:
"Factuur van Garage Jansen geboekt op V-123-XB".

De bedragen worden geboekt zoals ze op de factuur staan — op garagefacturen is dat
meestal **exclusief btw**, want de regels staan er excl. btw en het totaal incl. btw. De
app rekent niets om.

> **Open het postvak niet met de hand.** De app haalt alleen ongelezen mail op. Lees je
> een factuurmail in de webmail of in Outlook, dan is hij gelezen en ziet de app hem niet
> meer. Moet je toch kijken, zet de mail dan daarna weer op ongelezen.

### Wat als de app twijfelt?

Dan wordt er **niets geboekt**. Op de pagina **Kosten** staat naast **Factuur scannen** de
knop **Ontvangen facturen**, met een getal erop zolang er facturen wachten. Klik erop voor
het venster met de tabbladen **Te controleren**, **Geboekt** en **Afgewezen**. De factuur
staat onder **Te controleren**, met de reden erbij:

| Reden | Wat je doet |
| --- | --- |
| Onbekende afzender | Controleer of de factuur echt is. Zo ja: boeken, en zet de afzender in de lijst. |
| Geen kenteken gevonden | Kies zelf het voertuig. |
| Meerdere kentekens | Kies het voertuig waar de kosten op horen. Splitsen over voertuigen kan niet; boek dan met de hand. |
| Kenteken niet in de vloot | Verkeerd gelezen of niet van ons. Kies het voertuig of wijs af. |
| Mogelijk dubbel | Dezelfde factuur is al geboekt of wacht al. Meestal: afwijzen. |
| Geen factuur (offerte, herinnering of creditnota) | De app las geen factuur maar iets anders. Klopt dat, wijs dan af. Is het tóch een factuur, controleer de regels en boek hem hier. |
| Bedragen of datum kloppen niet | Kijk de regels en de factuurdatum na naast de factuur en verbeter ze. |
| Uitlezen mislukt | Vul leverancier, datum en regels zelf in; de factuur staat ernaast. |
| Geen bruikbare bijlage | De mail had geen PDF of foto. Vraag de factuur opnieuw op of wijs af. |

Klik op **Controleren**. Links staat de factuur, rechts wat de app heeft gelezen. Pas aan
wat niet klopt, kies het voertuig en klik op **Boeken**. Hoort de factuur niet in de app,
klik dan op **Afwijzen** (met eventueel een korte notitie). Afgewezen en geboekte facturen
blijven terug te vinden in de andere twee tabbladen. Wijs je iets af met de reden
**Onbekende afzender** of **Geen bruikbare bijlage**, dan gooit de app het bestand meteen
weg: dat is meestal reclame of spam en hoeft niet bewaard te blijven. Bij alle andere
redenen blijft de bijlage staan.

Iedereen kan naar dit adres mailen. Van onbekende afzenders leest de app hooguit twintig
bijlagen per dag uit; wat daarna binnenkomt, komt wél in de lijst maar wordt niet gelezen
("Niet uitgelezen: de daglimiet voor onbekende afzenders is bereikt"). Ruim de map
**Verwerkt** in de webmail af en toe leeg, dan blijft het postvak overzichtelijk.

Een melding in de bel — "Factuur van ... wacht op controle" — opent dit venster meteen.

### Instellen

**Instellingen, tabblad E-mail, kaart "Facturen per e-mail (inkomend)".** Hiervoor is het
recht *instellingen beheren* nodig.

1. Vul de IMAP-server, de gebruikersnaam en het wachtwoord van het postvak in. Deze
   gegevens staan in het beheerpaneel van de webhosting. Verbinding: TLS (poort 993).
2. **Map na verwerking**: `Verwerkt`. De app verplaatst elke afgehandelde mail daarheen,
   zodat het postvak leeg blijft. Werkt dat bij jullie provider niet, probeer dan
   `INBOX.Verwerkt`. Leeg laten mag ook: de mail blijft dan staan als gelezen.
3. **Vertrouwde afzenders**: één per regel. Een adres (`facturen@garage.nl`) of een heel
   domein (`@garage.nl`). Zet er ook `@lamgroep.nl` in als je zelf facturen wilt doorsturen.
4. **Naam van jullie mailserver (Authentication-Results)**: vul dit in vóór je de app
   aanzet. Zonder die naam kan de app niet controleren of een mail écht van de afzender
   komt, en wordt een mail die alleen maar zegt dat hij van een vertrouwde afzender komt
   gewoon geboekt. De kaart waarschuwt daar in het geel voor zolang het veld leeg is.

   Zo vind je de naam: stuur jezelf een testmail naar `fakturenapp@lamgroep.nl`, open
   die mail in de webmail van de hosting en laat de kopregels (headers, "originele
   bericht", "broncode") zien. Zoek de regel die begint met `Authentication-Results:`.
   Wat daar direct achter staat, tot aan de eerste puntkomma, is de naam — bijvoorbeeld
   `mx.voorbeeld.nl`. Die vul je hier in. Staat die regel er helemaal niet, vraag dan de
   hostingpartij of de mailserver DMARC- en SPF-controle stempelt.
5. Klik op **Verbinding testen**. Je ziet "Verbonden, 3 ongelezen" of de foutmelding van
   de mailserver. Test je een ándere server dan de opgeslagen, vul dan het wachtwoord
   opnieuw in: het opgeslagen wachtwoord wordt alleen voor de opgeslagen server gebruikt.
6. Zet **Postvak automatisch uitlezen** aan en klik op **Opslaan**. De app kijkt daarna
   elke 15 minuten (instelbaar). Met **Nu ophalen** hoef je daar niet op te wachten.

Wie de instellingen mag beheren, mag ook op **Nu ophalen** klikken en de status hier zien.
Voor het boeken en afwijzen van facturen is het recht *kosten beheren* nodig.

### Als het niet werkt

- **"Ophalen mislukt" bij de knop, of de melding "Postvak facturen onbereikbaar"**: het
  wachtwoord is gewijzigd of de mailserver is onbereikbaar. Test de verbinding bij de
  instellingen.
- **Alles komt ter controle met "Uitlezen mislukt"**: de sleutel voor de AI-dienst
  (`GEMINI_API_KEY`) ontbreekt op de server. De instellingenkaart waarschuwt hiervoor.
- **Een factuur is op het verkeerde voertuig geboekt**: verwijder de kostenregels bij dat
  voertuig en voer ze met de hand opnieuw in bij het juiste voertuig (Kosten, knop
  **Kosten vastleggen**). Opnieuw scannen kan niet: de app kent de factuur al en weigert
  hem als dubbel.
- **Handmatig scannen zegt "Deze factuur is al geboekt"**: dat klopt dan ook. Dezelfde
  factuur is al via de mail of een eerdere scan verwerkt. Kijk in het tabblad **Geboekt**.
- **Een mail groter dan 30 MB**: die haalt de app niet op. Hij komt onder **Te controleren**
  met de reden "Geen bruikbare bijlage" en een melding die dat zegt. Vraag de factuur
  opnieuw op, of boek hem met de hand.
