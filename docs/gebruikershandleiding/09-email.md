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
