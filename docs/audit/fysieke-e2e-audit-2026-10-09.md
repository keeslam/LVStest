# Fysieke E2E-audit — 2026-10-09

Voor: de eigenaar van Auto Lease LAM. Uitgevoerd door een QA-agent in de ingebouwde browser van de Claude-app, handmatig doorgeklikt (geen Playwright), op http://localhost:5000 tegen de lokale database `lvstest` (kopie met de echte vloot, geen productie). Account: `e2e-admin` (testaccount, nooit `admin` of `ike`). Er is geen code gewijzigd.

Ernst: Hoog = werkt niet of geeft verkeerde gegevens/risico; Middel = hinderlijk of misleidend; Laag = cosmetisch of taal.

Testrecords die deze audit aanmaakt dragen het voorvoegsel `AUDIT`.

---

## Module 1 — Auth (inloggen, uitloggen, profiel, wachtwoord wijzigen)

### Getest
- Uitloggen uit een al openstaande sessie (de browser stond ingelogd als systeembeheerder); POST /api/logout gaf 200 en de pagina sprong naar /auth.
- Inlogformulier leeg verzenden; verkeerd wachtwoord bij een bestaande gebruiker; onbekende gebruikersnaam.
- Een beschermde pagina (/vehicles) rechtstreeks openen terwijl uitgelogd.
- Inloggen als e2e-admin (juist wachtwoord), terugkeer naar het dashboard, sessie blijft behouden na volledige herlaadbeurt.
- Gebruikersmenu: Profiel, taalknop (Engels en weer terug naar Nederlands), Gebruikers, Back-upbeheer, App-instellingen, Uitloggen zijn aanwezig.
- Profiel (dialoog "Mijn profiel") met drie tabs: Profiel, Bewerken, Wachtwoord. Naam wijzigen en opslaan; ongeldig e-mailadres proberen op te slaan; Annuleren.
- Wachtwoord wijzigen: verkeerd huidig wachtwoord; nieuw en bevestiging ongelijk; te kort wachtwoord; echte wijziging (200) en meteen teruggezet naar de oorspronkelijke waarde (200).

### Werkt
- Inloggen, uitloggen, redirect naar /auth voor beschermde pagina's, sessiebehoud na herladen.
- Leeg formulier toont veldmeldingen; mislukte login toont een toast "Inloggen mislukt" en blijft op het formulier (401).
- Profiel opslaan: PATCH /api/users/4 gaf 200, toast "Profiel bijgewerkt", de dialoog springt terug naar het tabblad Profiel met de nieuwe naam.
- Ongeldig e-mailadres wordt door de browser tegengehouden, er gaat geen verzoek de deur uit.
- Wachtwoord wijzigen: foute huidige waarde geeft 400 plus foutmelding; juiste waarde geeft 200 en toast "Je wachtwoord is succesvol gewijzigd!". Terugzetten werkte ook.
- Taalwissel Nederlands/Engels werkt direct in menu, navigatie en snelle acties en blijft na herladen op Nederlands staan.

### Werkt niet
1. **Verschillende foutmelding voor onbekende gebruiker en fout wachtwoord (gebruikers raden).** Stappen: op /auth een bestaande gebruikersnaam met fout wachtwoord invoeren, daarna een bestaande naam niet bestaand. Verwacht: één neutrale melding. Werkelijk: "Incorrect password" tegenover "Incorrect username" (server/auth.ts regel 239 en 245). Een aanvaller kan zo vaststellen welke accounts bestaan. Ernst: **Middel**.
2. **Engelse teksten in het Nederlandse inlogscherm.** Veldmeldingen "Username is required" en "Password is required"; toast-tekst "Incorrect password" / "Incorrect username". Ernst: **Laag**.
3. **Engelse teksten in het wachtwoordformulier van het profiel.** "Passwords do not match", "New password must be at least 6 characters", "Please confirm your new password" en de servermelding "Current password is incorrect". Bij een te kort wachtwoord staat de Nederlandse hint ("minimaal 6 tekens") naast de Engelse foutmelding. Ernst: **Laag**.
4. **Meldingen onder het bevestigingsveld lijken onjuist.** Na het invullen van "abc" in het veld bevestigen verscheen toch "Please confirm your new password" (de melding kwam na een mislukte submit, mogelijk een verouderde validatiestatus). Niet verder uitgezocht. Ernst: **Laag**.

### UX-opmerkingen
- Het wachtwoordminimum is slechts 6 tekens. Voor een app met klantgegevens en contracten is dat zwak; advies minstens 10 tot 12 tekens. Ernst: Laag (beleid).
- In de tab Profiel staat "Aanvullende rechten" als een lijst ruwe Engelse sleutelnamen (manage_users, view_vehicles, revert_handover enzovoort, ongeveer 40 stuks). Voor een gewone gebruiker onleesbaar; Nederlandse omschrijvingen zouden helpen. Ernst: Laag.
- De console op het inlogscherm toont "Socket connection error: unauthorized" omdat de realtimeverbinding al probeert te verbinden zonder sessie. Geen zichtbare fout, wel ruis in de console. Ernst: Laag.
- Het menu sluit zodra je opnieuw op de gebruikersnaam klikt; geen bevestiging bij Uitloggen (is gangbaar).

---

## Module 2 — Dashboard (tegels, snelle acties, widgets, meldingencentrum)

### Getest
- Alle 14 snelle acties geklikt: Ophalen starten, Innemen starten, Scannen, Nieuwe reservering, Schadecheck starten, Voertuig toevoegen, Klant toevoegen, RDW APK-datums scannen, Document uploaden, Kosten registreren, Brandstofstatus bijwerken, Registratie wijzigen, APK-rapport uploaden, APK-meldingen versturen (dialoog geopend, niets verstuurd).
- Scandialoog: onbekend kenteken (XX-NOPE-1), bestaand kenteken (11-RH-DF), uitklapper "Recente scans".
- Widgets: Beschikbare voertuigen (rijknop opent "Nieuwe reservering" met het voertuig voor ingevuld), APK verloopt binnenkort (rijknop opent "APK-keuring plannen" met werkplaatskalender), Achterstallige verhuringen (rijknop opent Reserveringsdetails), Garantie, Beheer vervangende voertuigen (dialoog "Vervangende voertuigen toewijzen"), Recente kosten, Aankomende reserveringen, Reserveringskalender ("Full Calendar" gaat naar /reservations/calendar).
- Meldingencentrum (belletje, 66 meldingen): lijst en knop "Instellingen & overzicht" met drempelwaarden en tabellen.
- Globale zoekbalk bovenin: gedeeltelijk kenteken, volledig kenteken met en zonder streepjes, Enter ("Zoekresultaten"-dialoog).
- Netwerk en console tijdens het laden van het dashboard.

### Werkt
- Alle snelle acties openen binnen enkele seconden de juiste dialoog (de eerste keer in de dev-server enkele seconden door het inladen van de module).
- Scan: onbekend kenteken geeft de nette melding "Geen voertuig of reservering gevonden voor ..." (404 van /api/barcodes). Bestaand kenteken toont een kaart met voertuiggegevens, APK-datum, km-stand, brandstof en snelkoppelingen (Voertuig openen, Reservering maken, Kosten registreren, Document uploaden, Tanken, Km-stand bijwerken, Onderhoud inplannen).
- Kosten- en reserveringsformulier tonen alle velden en categorieën; validatie "Please select a vehicle" voorkomt een lege toewijzing.
- Rijknoppen in de widgets sturen netjes door naar de juiste vervolgactie (reserveren, APK plannen, reserveringsdetails).
- Globale zoekbalk geeft een uitklaplijst met voertuigen, klanten en reserveringen; Enter opent "Alle resultaten"; /api-verzoeken geven 200.
- Er staan geen React-waarschuwingen in de console.

### Werkt niet
1. **"Annuleren" in het dialoog Nieuwe reservering sluit het dialoog niet maar stuurt je naar /reservations.** Stappen: dashboard, klik "Nieuwe reservering", klik "Annuleren". Verwacht: terug op het dashboard (zoals bij Escape, dat het dialoog sluit en op / blijft). Werkelijk: URL wordt /reservations (twee keer gereproduceerd). Ernst: **Laag**.
2. **"RDW APK-datums scannen" start meteen een scan voor het hele wagenpark zonder bevestiging.** Eén klik gaf POST /api/apk-date-changes/scan-now (200) en de toast "De scan is gestart en loopt op de achtergrond". Dat is tijdens deze audit per ongeluk twee keer gebeurd. De scan schrijft alleen voorstellen (status "pending") weg; er is hier één voorstel uitgekomen (2-XJT-31: 3 september 2026 naar 24 september 2027), dat ik bewust niet heb bevestigd of genegeerd. Ernst: **Laag** (geen schade, wel verrassend voor een knop die er als een gewone snelkoppeling uitziet).
3. **Meldingencentrum toont "undefined undefined -" bij Aankomend onderhoud.** Alle 114 onderhoudsregels in /api/reservations/upcoming-maintenance verwijzen naar voertuig-id's die niet in /api/vehicles staan (95 voertuigen); de UI maakt er "Reparatie gepland / undefined undefined -" van. De oorzaak is deze testdatabase (voertuigen vervangen, onderhoudsblokken niet meegenomen), maar de interface hoort een ontbrekend voertuig netjes af te vangen ("Voertuig onbekend") in plaats van "undefined" te tonen. Ernst: **Laag** (testdata-gevolg; bij echte data zou dit alleen bij verwijderde voertuigen optreden).
4. **Reserveringsdetails van een opgehaalde reservering toont een rode foutregel.** Stappen: Achterstallige verhuringen, rijknop van reservering #214. Onder de klantgegevens staat "Er ging iets mis: Geen gebruiksperiode voor deze reservering"; de achterliggende aanroep GET /api/reservations/214/usage-period geeft 404. Reserveringen die niet via de overdrachtsstroom zijn opgehaald (geïmporteerd of ouder) hebben geen gebruiksperiode; dat hoort een lege toestand te zijn, geen foutmelding. Ernst: **Laag**.
5. **Engelstalige teksten op het Nederlandse dashboard.** Widget "Recente kosten" toont categorieën als "tires", "maintenance", "other", "toll", "fuel"; de Reserveringskalender-widget heeft "New Reservation", "Full Calendar", "Today", "Mon Tue Wed ...", "out/in"; aangepaste meldingen als "Spare Vehicle Assignment Required: TBD spare vehicle needs assignment for 2098-06-20 - 2098-06-21 [placeholder:3186]" en de melding "Onderhoudsbeurt nodig ... [service:155]" tonen interne labels tussen haakjes. Ernst: **Laag**.

### UX-opmerkingen
- Het dashboard haalt bij elke keer laden ongeveer 20 API-verzoeken op, waaronder de complete reserveringslijst (2,7 MB, 415 ms in deze database met 1400+ reserveringen) en tweemaal /api/vehicles. Op een trage verbinding of met meer data wordt het dashboard zwaar. Ernst: Laag/Middel (prestaties).
- De bovenste rode balk "Geen geverifieerde back-up bekend ... pg_dump executable not found on PATH" is een gevolg van deze ontwikkelcomputer (PostgreSQL-clienttools ontbreken in het PATH), maar de Engelse technische tekst "Laatste fout: ..." staat zo ook in productie voor de eigenaar op het dashboard. Ernst: Laag.
- Drie knoppen openen vrijwel dezelfde scandialoog (Ophalen starten, Innemen starten, Scannen); het onderscheid zit pas in het resultaat. Overweeg één knop "Scannen" of een duidelijker onderscheid.
- Recente scans toont alleen tijden ("23:34") zonder datum; oudere scans zijn daardoor niet te plaatsen.
- Datumnotatie loopt uiteen: "9 oktober 2026", "04-06-2026" (zoekresultaten), "2026-10-09" (Startdatum in het reserveringsformulier). Eén formaat zou rustiger zijn.
- Het Meldingencentrum-dialoog opent daaroverheen een tweede dialoog ("Instellingen & overzicht"); Escape sluit er per keer één, wat bij snelle bediening verwarrend is.
- Sidebar-knop en kopknoppen (hamburger, bel) hebben geen toegankelijke naam (geen aria-label); schermlezers lezen alleen "knop". Ernst: Laag.
- Vervangende voertuigen: de knop onderaan het dialoog heet "1 voertuig toewijzen" terwijl er nog niets gekozen is, en is wel klikbaar.
- Reserveringen zonder klant verschijnen in de zoekresultaten als "Onbekende klant".

---

## Module 3 — Voertuigen (lijst, filters, details, toevoegen/bewerken, bulkimport, RDW, prullenbak)

### Getest
- Lijst (95 voertuigen, 10 per pagina): zoeken op merk en op kenteken (met en zonder streepjes), sorteerlijst (o.a. APK-datum eerst vroegste), "Filter functies" (Toegang milieuzone aangevinkt en gewist), pagineren met Vorige/Volgende.
- Voertuigdetails (dialoog) van een echt voertuig: alle zeven tabs (Algemeen, Kosten, Documenten, Reserveringen, Onderhoud, Geschiedenis, Fiscaal) alleen gelezen, niets gewijzigd.
- Eigen testvoertuig AUDIT1 (id 1667): toevoegen (leeg formulier, RDW "Opzoeken" met onbekend kenteken, opslaan), bewerken (vijf tabs, opmerking opslaan), details openen (waarschuwingspopup met de opmerking), Sleutellabel afdrukken, Barcode bekijken en "Barcode opnieuw genereren" (alleen de bevestiging geopend), Brandstofstatus bijwerken (leeg, met niveau, met bedrag), kilometerstand snel aanpassen (omhoog en omlaag), verwijderen met typ-bevestiging, terugzetten uit de prullenbak.
- Barcodeboek, Sleutelkast-audit (een sleutel gescand, audit afgerond), Reservesleutelkast-audit, Bulk importeren (handmatig: bestaand kenteken plus twee onbekende), RDW "Opzoeken" voor een bestaand kenteken (formulier niet opgeslagen).

### Werkt
- Zoeken, sorteren, filteren en pagineren werken; kentekenzoekopdracht normaliseert streepjes ("5tdb45" vindt 5-TDB-45).
- Toevoegen: validatiemelding bij leeg formulier, RDW-onbekend geeft een Nederlandse melding (404 afgevangen), opslaan geeft 201 en toast "Voertuig succesvol aangemaakt". Bewerken slaat op (opmerking terug te vinden via API), toast "Voertuig succesvol bijgewerkt".
- Opmerkingen bij een voertuig worden bij openen als waarschuwing getoond met "Ik begrijp het" en "Opmerkingen bewerken" (sterk punt).
- Kilometerstand omlaag wordt tegengehouden met een duidelijk dialoog "Kilometerstand-overschrijving vereist" (vraagt het wachtwoord van een account met recht authorize_mileage_decrease); de eerste PATCH geeft 400 en de stand blijft 5000. Dit is gewenst gedrag.
- Barcode opnieuw genereren vraagt eerst bevestiging met waarschuwing dat oude labels vervallen.
- Verwijderen toont een typ-bevestiging met het kenteken en de impact ("Er is niets anders aan dit voertuig gekoppeld"), DELETE geeft 200, vanuit de lijst verschijnt de toast "Voertuig verwijderd ... Een beheerder kan het terugzetten vanuit de prullenbak"; het voertuig staat in "Verwijderde voertuigen" en "Terugzetten" geeft de toast "Teruggezet" en het voertuig is weer opvraagbaar (200).
- Sleutelkast-audit rekent 19 verwachte sleutels, na afronden verschijnt de lijst met ontbrekende sleutels. RDW-opzoeking van een bestaand kenteken vult merk, model, type en datums.
- Bulkimport meldt per kenteken wat er gebeurde (bestaand kenteken wordt geweigerd).

### Werkt niet
1. **Tankkosten uit "Brandstofstatus bijwerken" komen nergens in de administratie.** Stappen: voertuig, Brandstofstatus bijwerken, niveau 3/4, Tankkosten 45.50, opslaan. Verwacht: een kostenpost in Kosten. Werkelijk: toast "Brandstofstatus succesvol bijgewerkt"; het bedrag staat alleen in een veld op het voertuig (fuelRefillCost, wordt bij de volgende tankbeurt overschreven); /api/expenses/vehicle/1667 blijft leeg. Het dashboard, de Kosten-tab en de rapporten tellen deze tankbeurten dus nooit mee (server/routes.ts regel 1980). Ernst: **Middel**.
2. **Tankkosten met een komma verdwijnen stil.** Het veld is type=number met als voorbeeld "bijv. 75,50"; in een browser waar de komma niet als decimaalteken geldt (deze test-browser) wordt "45,50" geweigerd en blijft het veld leeg, zonder foutmelding, terwijl wel "Gelukt" getoond wordt. Op een Nederlands ingestelde browser zou dit werken. Ernst: **Laag**.
3. **Bulkimport slaat onbekende kentekens op als voertuig "Unknown Unknown" en meldt dat als geslaagd.** ZZ-ZZ-99 en AUDIT2 (beide niet bij de RDW) werden als voertuigen aangemaakt; de toast zegt "2 voertuigen succesvol geïmporteerd. 1 mislukt." en de regel zegt alleen in het resultaat "Niet gevonden bij de RDW; alleen het kenteken is opgeslagen". Een typefout in een kenteken levert zo een spookvoertuig op. Daarnaast staan de weigerreden en de naam in het Engels ("Vehicle already exists", "Unknown Unknown"). Ernst: **Middel** (spookvoertuigen), **Laag** (taal). ZZ-ZZ-99 is door mij weer verwijderd (in de prullenbak).
4. **Na verwijderen vanuit het detailscherm verschijnt een rode foutmelding.** Stappen: voertuig openen, Verwijderen, kenteken typen, bevestigen. DELETE geeft 200, maar het nog geopende detailscherm vraagt het verwijderde voertuig opnieuw op (GET /api/vehicles/1667 geeft 404) en toont de toast "Kon de gegevens niet laden: Vehicle not found". Vanuit de lijst gebeurt dit niet. Ernst: **Laag**.
5. **Voertuigtype uit de RDW is onbetrouwbaar.** Een VW Transporter, Fiat Ducato, Peugeot Boxer en Ford Transit staan als "SUV", terwijl een Renault Master en Mercedes 515 CDI als "Van" staan (zowel in de lijst als na RDW-opzoeking van 11-RH-DF). Dit beïnvloedt filteren en rapporten. Ernst: **Laag/Middel**.
6. **Details-tab Onderhoud toont "Dagen resterend: 0" als er geen garantiedatum is ingesteld** (daarnaast "Niet ingesteld"). Ernst: **Laag**.
7. **Engelstalige teksten.** Formuliervalidatie "License plate is required", "Brand is required", "Model is required" (de toast eromheen is wel Nederlands); in Kosten en Geschiedenis staan categorieën als "fuel", "maintenance" ("fuel kosten toegevoegd"). Ernst: **Laag**.

### UX-opmerkingen
- De keuzelijst "Sorteren op" bevat ook filters ("Reparatie nodig", "Opnaam", "BV", "Niet opgegeven"); sorteren en filteren zijn zo niet te combineren en niet te onderscheiden.
- De prullenbak heet "Verwijderde voertuigen" maar bevat ook verwijderde boetes (30 oude "Annuleertest"-boetes die al teruggezet zijn en nog steeds in de lijst staan). Een lijst met alleen nog terug te zetten items, of een filter, zou rustiger zijn.
- Escape of Annuleren in het formulier "Voertuig toevoegen/bewerken" gooit alle ingevulde gegevens zonder waarschuwing weg.
- Pagineren kent alleen Vorige/Volgende en een aantal per pagina; bij 95 voertuigen is er geen sprong naar een pagina.
- De Sleutelkast-audit toont na elke scan alleen het getal "1 van 19"; welke sleutel net gescand is, is niet te zien. Een kort groen vinkje met kenteken zou helpen.
- De dialoog "Sleutellabel afdrukken" sluit na "Afdrukken" zonder toast of voorvertoning; de daadwerkelijke afdruk is in de ingebouwde browser niet te beoordelen (geen printer/PDF).
- APK-datum in de lijst: "27 februari 2026, 224 dagen te laat" bij een voertuig met status Beschikbaar; een beschikbaar voertuig met verlopen APK krijgt geen waarschuwing bij reserveren (niet verder getest).
- Hot-reloads door het bouwen aan deelproject C hebben tijdens de test twee keer een open dialoog gesloten (geen bevinding).

---

## Module 4 — Klanten (lijst, toevoegen/bewerken, chauffeurs, portaaltab, debiteurnummer, prullenbak)

### Getest
- Lijst (300 klanten, 10 per pagina): zoeken ("audit"), sorteerkeuze, filterpaneel "Klanten filteren" (negen filters geopend).
- Eigen testklant (id 1247): toevoegen (leeg formulier, daarna met naam, e-mailadres op e2e.invalid en telefoon), details openen (alle vijf tabs: Persoonlijke gegevens, Chauffeurs, Actieve verhuringen, Geschiedenis, Portaal), bewerken (naam en debiteurnummer), chauffeur toevoegen en verwijderen, tweede klant met hetzelfde debiteurnummer, klant verwijderen met typ-bevestiging, terugzetten uit de prullenbak.

### Werkt
- Klant aanmaken: validatie bij een lege naam; opslaan geeft toast "Klant succesvol aangemaakt"; er is een controle op dubbele klanten (/api/customers/duplicates op e-mail en telefoon).
- Klantdetails tonen tellers (verhuringen, km), alle gegevens, geblokkeerde voertuigen, auditgeschiedenis.
- Chauffeur toevoegen (met rijbewijs, taal en hoofdchauffeur-vinkje) en verwijderen werkt; lijst ververst direct.
- Debiteurnummer is uniek: tweede klant met 900001 geeft 409 en een inline melding "Dit debiteurnummer is al in gebruik bij klant ...".
- Verwijderen toont de impact ("Dit verwijdert ook: 1 portaalinstellingen") en vraagt de naam te typen (hoofdletterongevoelig); de klant gaat naar de prullenbak; Terugzetten brengt naam en debiteurnummer terug (200).

### Werkt niet
1. **De naam van een zakelijke klant wordt door het formulier verminkt.** Stappen: Klant toevoegen of bewerken, in "Volledige naam" typen "AUDIT Testklant B.V.". Verwacht: precies zoals getypt, of in elk geval "B.V." intact. Werkelijk: het veld toont meteen "Audit Testklant B.v." en dat wordt zo opgeslagen (GET /api/customers/1247). Oorzaak: client/src/lib/format-utils.ts, capitalizeName zet alles na de eerste letter van elk woord in kleine letters (bedoeld voor persoonsnamen met "van der"). Voor een zakelijk bedrijf als "DHL Express B.V." of "ABN AMRO" levert dat "Dhl Express B.v." op. In deze app, waar bijna alle klanten B.V.'s zijn, is dat hinderlijk. Ernst: **Middel**.
2. **De prullenbak voor klanten is niet te vinden vanaf het klantenscherm.** Het scherm Klanten heeft geen prullenbak-knop; de klant staat in dezelfde lijst als de voertuigen, achter de knop "Verwijderde voertuigen" op het scherm Voertuigen. De verwijdertoast van de klant zegt alleen "is succesvol verwijderd" (niet waar terug te zetten); in de lijst staat de klant met "Bevat: 1 portal_customer_settings" (interne tabelnaam). Ernst: **Middel** (ontdekbaarheid) en **Laag** (interne naam).
3. **Chauffeur verwijderen is definitief en heeft een Engelse knop.** De bevestiging zegt "kan niet ongedaan worden gemaakt" met knoppen "Annuleren" en "Delete". Voertuigen en klanten gaan wel naar de prullenbak en vragen een typ-bevestiging; de chauffeur niet. Ernst: **Laag**.
4. **Dubbele en Engelse foutmelding bij een dubbel debiteurnummer.** Naast de nette Nederlandse veldmelding verschijnt een rode toast "Fout: Kon klant niet aanmaken: Another customer (...) already uses this debtor number." Ernst: **Laag**.
5. **Engelse teksten en Amerikaanse voorbeeldwaarden.** Validatie "Name must be at least 2 characters."; voorbeeldteksten "John Doe", "Main Street", "123 Main St", "john.doe@example.com"; in de chauffeursdialoog "Land van afgifte rijbewijs: Netherlands" met erachter "1 driver"; in de tab Actieve verhuringen een knop "New Reservation"; de auditgeschiedenis toont de ruwe code "customer.create". Ernst: **Laag**.

### UX-opmerkingen
- Het formulier "Klant toevoegen" vraagt veel velden verspreid over vier tabs; voor een snelle klant is alleen naam nodig (goed), maar er is geen aanwijzing welke velden voor een reservering of factuur nodig zijn.
- In de Portaal-tab van de klant staan ruim 15 aan/uit-schakelaars zonder uitleg per schakelaar.
- De bestaande klanten (Klant 1 B.V. ... Klant 300 B.V.) hebben geen debiteurnummer; de nieuwe regel "debiteurnummer uniek" wordt dus pas relevant zodra ze worden ingevuld.
- Escape sluit het formulier "Klant toevoegen" zonder waarschuwing, ook met ingevulde gegevens.

---

## Module 5 — Reserveringen (kalender, nieuwe reservering, lijst, niet-opgehaald popup, bewerken, annuleren, verwijderen)

### Getest
- Reserveringskalender (/reservations): maandweergave, "+2 meer" per dag (dagdialoog), filter "Alle typen" (opties geopend), "Kleuren" (kalenderkleuren geopend, niets gewijzigd), "Vandaag", "Voltooid bekijken (171)" (geschiedenisdialoog), "150 achterstallig" (dialoog "Te late verhuren"), "144 niet opgehaald" (dialoog "Niet opgehaalde reserveringen"), "Administratie" (Factuurgegevens), "Lijstweergave" (dialoog "Reserveringen" met tabs Actief/Achterstallig/Geschiedenis en zoekveld).
- Nieuwe reservering aanmaken met mijn testvoertuig AUDIT1 en testklant "Audit Testklant B.v." (reservering #3200, 9 t/m 12 oktober 2026): voertuigkiezer, klantkiezer, waarschuwingspopup bij een voertuig met opmerking, opslaan. Daarna Reserveringsdetails (#3200), Bewerken (prijs en notitie), zoeken in de lijst, verwijderen met bevestiging (geannuleerd, #3200 bewust bewaard voor module 6).

### Werkt
- Aanmaken: POST gaf een nieuwe reservering (status Geboekt) en opent direct de details; bewerken (prijs 150, notitie) slaat op ("Reservering succesvol bijgewerkt").
- Het voertuig met een opmerking toont bij het kiezen een gele waarschuwing "Voertuigopmerkingen waarschuwing" met "Annuleren" en "Ik bevestig & ga door" (sterk punt, maar de popup verschijnt bovenop het formulier en blokkeert de volgende klik totdat je bevestigt).
- Zoeken in de lijst op "AUDIT" vindt precies reservering #3200 (kenteken, klant, contractnummer en ID doorzoekbaar).
- Verwijderen vraagt een eenvoudige bevestiging ("Ze wordt naar de prullenbak verplaatst; terugzetten kan via Prullenbak"); Annuleren laat de reservering staan (GET 200).
- Kalenderdialogen (te late, niet opgehaalde, geschiedenis, dagdetail, kleuren, administratie) openen en tonen gegevens met knoppen Bekijken/Bewerken/Verwijderen en per niet-opgehaalde reservering een knop Annuleren.
- Reserveringsdetails van een geboekte reservering tonen "Ophalen starten", "Bewerken" en Verwijderen; die van een opgehaalde reservering ook "Datums wijzigen", "Klant wijzigen", "Voertuig wijzigen", "Reservering annuleren" en "Inleveren starten".

### Werkt niet
1. **De status van een reservering is vrij te kiezen in het aanmaak- en bewerkformulier.** Het statusveld biedt "Geboekt/Opgehaald" bij aanmaken en "Geboekt, Opgehaald, Ingeleverd, Voltooid, Geannuleerd" bij bewerken. Zo is een reservering "Opgehaald" te maken zonder de overdrachtsstroom (kilometerstand, brandstof, schadecheck, contract) en kan een geannuleerde of voltooide reservering met een klik terug. Ik heb de gevolgen niet doorgetest (de overdrachtsroute wordt in module 6 gedaan). Ernst: **Middel** (omzeilt de beveiligingen van overdracht en terugdraaien).
2. **De waarschuwingspopup voor voertuigopmerkingen verscheen ook toen het formulier zelf nog leeg was en onderschepte een klik.** Pas na "Ik bevestig & ga door" kon ik de klant kiezen. Gewenst, maar de eerste klik lijkt dan "niets te doen". Ernst: **Laag**.
3. **Dialoog "Niet opgehaalde reserveringen" bevat 144 regels met per regel een knop Annuleren, zonder zoekveld of bulkactie.** Een misklik op "Annuleren" in een lange lijst is makkelijk. Ernst: **Laag/Middel**.
4. **Het openen van de Lijstweergave kost de eerste keer enkele seconden zonder laadindicator** (de knop lijkt niets te doen; ik klikte twee keer). Waarschijnlijk dev-modus, maar een laadstatus ontbreekt. Ernst: **Laag**.
5. **Een lijst met 366 actieve reserveringen staat in een dialoog, niet op een eigen pagina.** Geen deeplink, geen paginering zichtbaar (alles in één lange lijst). Ernst: **Laag** (UX).
6. **Datums in de formulieren zijn ISO ("2026-10-09") terwijl de rest "9 okt. 2026" is**, en "Geschiedenis voltooide verhuur" toont voltooide verhuren met datums in november 2026 (testdata). Ernst: **Laag**.
7. **Iconknoppen in de lijst (bekijken, bewerken, verwijderen) hebben geen toegankelijke naam.** Schermlezers en de zoekfunctie van de browser vinden ze niet. Ernst: **Laag**.

### UX-opmerkingen
- Een nieuwe reservering aanmaken kost: knop, voertuig kiezen, bevestigen van de opmerking, klant kiezen, opslaan = ongeveer 6 kliks; goed. Daarna opent meteen de detailweergave met "Ophalen starten" (prettig).
- De dagweergave toont per dag een samenvatting en "+N meer"; de dagdialoog is overzichtelijk.
- De toast "Niet opgeslagen wijzigingen. Gebruik Annuleren of het kruisje om te sluiten; je ingevoerde gegevens blijven anders behouden" is goed: Escape sluit het reserveringsformulier niet zomaar. Bij voertuig- en klantformulieren gebeurt dat wel (zie modules 3 en 4); het gedrag is dus niet overal gelijk.
- De prullenbak waarnaar de verwijdertekst verwijst ("terugzetten kan via Prullenbak") is alleen bereikbaar via "Verwijderde voertuigen" op het scherm Voertuigen.

---

## Module 6 — Overdracht (ophalen, innemen, schadecheck, contract, terugdraaien)

### Getest
Volledige keten op mijn eigen reservering #3200 (voertuig AUDIT1, klant "Audit Testklant B.v."): dashboard "Ophalen starten" met scan van AUDIT1, opmerkingswaarschuwing, kilometerstand te laag proberen, kilometerstand geldig, ophalen voltooien (contract), "Contract opnieuw proberen", via de scankaart "Inleveren starten", inleveren voltooien (schadecheck-PDF), schadecheck-PDF controleren, "Mail naar klant" (naar audit@e2e.invalid), "Overdracht terugdraaien" via "Voltooid bekijken", daarna "Reservering annuleren" van de weer opgehaalde huur.

### Werkt
- Scan van AUDIT1 vindt de actieve reservering en opent meteen "Ophaalproces starten" met contractnummer (1012, automatisch en bewerkbaar), ophaaldatum, kilometerstand (voorgevuld met 5.000), brandstofniveau, optie voor een interactieve schadecheck of papieren check, en een notitieveld.
- Een lagere kilometerstand bij ophalen (100 tegenover 5.000) geeft 400 en een dialoog "Kilometerstand-overschrijving vereist" (account met recht authorize_mileage_decrease en wachtwoord nodig); Annuleren laat het formulier intact.
- Ophalen met 5.100 km: POST /pickup 200, toast "Ophalen voltooid", reservering wordt Opgehaald, voertuig Verhuurd, km 5.100.
- Inleveren: scankaart toont nu "Inleveren starten"; het formulier toont "Bij ophalen: 5.100 km / 3/4"; inleveren met 5.250 km, brandstof Vol geeft 200, toast "Voertuig succesvol ingeleverd. Schadecheck is gegenereerd.", reservering Voltooid, voertuig weer Beschikbaar met km 5.250.
- De schadecheck-PDF ("AUDIT1_damage_check_...pdf") is echt aangemaakt: /uploads/documents/1667/damage_check/... geeft 200, application/pdf, 722 kB, begint met %PDF-1.7. Het dialoog "Schadeformulier klaar" biedt Afdrukken en Mail naar klant.
- Terugdraaien toont een voorvertoning ("Status: Voltooid wordt Opgehaald", welke velden gewist worden, "Kilometerstand van 5.250 naar 5.100", "Brandstofniveau van Vol naar 3/4", "Deze documenten worden als vervallen gemarkeerd: Schadecheck"), vraagt een vinkje voor de kilometerverlaging en voert dan uit: toast "Overdracht teruggedraaid. Reservering #3200 heeft weer de status Opgehaald"; reservering Opgehaald, voertuig Verhuurd, 5.100 km, 3/4 (klopt met de voorvertoning).
- Reservering annuleren van een opgehaalde huur vraagt een vinkje "Ik weet dat deze huur al is opgehaald en wil doorgaan", legt uit wat er gebeurt ("Het voertuig telt daarna weer als beschikbaar en de kilometerstand blijft de stand van het ophalen") en voert uit: reservering Geannuleerd, voertuig Beschikbaar (5.100 km).

### Werkt niet
1. **Ophalen meldt "Contract is gegenereerd" terwijl het contract niet gemaakt is.** Stappen: Ophalen voltooien. Verwacht: een succesmelding alleen als het contract er is. Werkelijk: toast "Ophalen voltooid: Voertuig succesvol opgehaald. Contract is gegenereerd." en meteen daarna een dialoog "Contract kon niet gemaakt worden: Het contractsjabloon 'gffg' heeft geen velden. Vul het sjabloon onder Documenten, Contractsjablonen." (POST /contract geeft 409; "Opnieuw proberen" geeft dezelfde 409). De reservering is dus Opgehaald zonder contractdocument. Het dialoog zelf is helder en Nederlands; de tegenstrijdige groene toast niet. De oorzaak is een testsjabloon ("gffg") dat als actief contractsjabloon staat; zo'n sjabloon blokkeert bij de eigenaar elk ophaalcontract. Ernst: **Middel** (misleidende toast; ophalen zonder contract).
2. **Elke opgehaalde reservering toont een rode foutregel "Er ging iets mis: Geen gebruiksperiode voor deze reservering" en een toast "Kon de gegevens niet laden".** Nu bevestigd bij een reservering die zelf via de overdrachtsstroom is opgehaald (#3200; GET /api/reservations/3200/usage-period geeft 404). Eerder (module 2) bij #214. Ook na annuleren verschijnt de toast. De melding klinkt als een storing, maar het gaat om een niet-bestaand optioneel gegeven. Ernst: **Middel**.
3. **"Mail naar klant" geeft alleen een Engelstalige fout bij ontbrekende mailinstellingen.** POST /api/email/send-documents gaf 500; de toast zegt "Failed to send email. Please check your email configuration in Settings." (de server logt "No email settings configured"). Dat de lokale omgeving geen SMTP heeft is verwacht; de Engelse tekst niet. De knop "E-mail versturen" is bovendien uitgeschakeld zolang geen ontvanger, onderwerp en bericht zijn ingevuld, zonder aanwijzing welk veld ontbreekt, en het adres van de klant wordt niet voorgesteld (alleen "Aangepast e-mailadres"). Ernst: **Laag**.
4. **De auditgeschiedenis in de reserveringsdetails toont ruwe codes** ("reservation.pickup", "reservation.return", "reservation.revert") en de schadecheck blijft na het terugdraaien als document staan (de voorvertoning zei "vervallen"; in de lijst is dat niet te zien). Ernst: **Laag**.
5. **Drie dialogen liggen na het scannen over elkaar** (scankaart, ophaalformulier, opmerkingswaarschuwing) en de scankaart blijft na afronden open. Ernst: **Laag**.
6. **Brandstofniveau bij inleveren staat standaard op "Vol"**, ook als het voertuig met 3/4 is opgehaald; een geheugensteun als "Bij ophalen: 3/4" staat er wel. Ernst: **Laag**.

### UX-opmerkingen
- Een gewone overdracht kost vanaf het dashboard: knop, kenteken typen, Enter, opmerking bevestigen, km invullen, afronden = 6 handelingen; zeer behapbaar.
- De beveiligingen (kilometerverlaging, terugdraaien met voorvertoning, annuleren van een opgehaalde huur) zijn consequent en goed uitgelegd; dit is het sterkste deel van de app.
- Er is geen weergave van het gegenereerde contract in het dialoog "Ophalen voltooid" (alleen een toast); bij een geslaagd contract zou een knop "Contract openen" of "Afdrukken" praktisch zijn (niet te testen door bevinding 1).
- De schadecheck-PDF opent in de ingebouwde browser alleen via de directe URL; de knoppen Afdrukken en Mail naar klant zijn de enige acties in het dialoog.

---

## Module 7 — Onderhoud (kalender, plannen, vervangend voertuig, afronden, terug uit onderhoud)

### Getest
- Onderhoudskalender (/maintenance): kalender met APK-herinneringen, "Onderhoud plannen", "Lijstweergave" (dialoog "Onderhoudsoverzicht" met tabs APK, Garantie, Gepland, Vervangers en zoekveld), "Voltooide bekijken" (geschiedenis voltooid onderhoud).
- Eigen onderhoudsrecord op AUDIT1 (reservering-id 3201, type Voertuigpech, 9 oktober 2026, 1 dag): plannen, vervangend-voertuigdialoog ("Klant regelt eigen vervoer"), bewerken zonder iets te wijzigen, status op "Uit (onderhoud voltooid)" zetten, "Terugdraaien" uit de geschiedenis, scankaart van het voertuig bekijken.
- Niet doorgetest: een echt vervangend voertuig toewijzen (er was geen geldige klantreservering op een tweede voertuig, zie bevinding 1) en annuleren in het vervangend-voertuigdialoog.

### Werkt
- Plannen: formulier met voertuigkiezer (97 voertuigen), klantkeuze, onderhoudstype (14 soorten), datum, duur, status (Gepland/Binnen/Uit), omschrijving en notities; toast "Onderhoud gepland. Het onderhoud is gepland en de herinneringen zijn bijgewerkt." en het record staat in "Gepland" (1 dag, GEPLAND, door e2e-admin).
- Het overzicht "Onderhoudsoverzicht" telt 268 items (APK 5, Garantie 0, Gepland 261, Vervangers 2) en zoeken op AUDIT1 vindt precies mijn record.
- Terugdraaien uit de geschiedenis: toast "Onderhoud teruggedraaid. Onderhoud is weer gemarkeerd als actief", onderhoudsstatus wordt weer "in".
- Records met een verwijderd voertuig worden in de geschiedenis netjes als "Onbekend voertuig" getoond (geen "undefined").

### Werkt niet
1. **Een geannuleerde reservering geldt bij het plannen van onderhoud nog als actieve reservering.** Stappen: onderhoud plannen op AUDIT1 voor 9 oktober, terwijl reservering #3200 (9 t/m 12 oktober) al geannuleerd was. Verwacht: geen conflict. Werkelijk: het dialoog "Vervangende voertuigen toewijzen: Het geselecteerde voertuig heeft actieve reserveringen tijdens de onderhoudsperiode" toont de geannuleerde reservering van Audit Testklant. Na "Vervangers toewijzen & onderhoud plannen" blijft een leeg schaduwdialoog met dezelfde titel achter (zonder inhoud, alleen Annuleren en Sluiten). Het onderhoudsblok (3201) bestond al vóór de keuze, dus Annuleren in dat dialoog ruimt het waarschijnlijk niet op (niet getest). Ernst: **Middel**.
2. **Bewerken van een gepland onderhoud zonder iets te wijzigen zet het onderhoud en het voertuig op "in onderhoud".** Stappen: onderhoudsrecord (status GEPLAND) openen via Bewerken, direct "Onderhoud bijwerken". Verwacht: status blijft Gepland. Werkelijk: het veld Status toont bij openen "Binnen (voertuig is in onderhoud)" (niet de opgeslagen waarde), opslaan zet maintenanceStatus op "in", de reservering op picked_up en het voertuig op "needs_fixing" (Reparatie nodig, niet verhuurbaar). Een enkele correctie aan de omschrijving kan zo een voertuig uit de verhuur halen. Ernst: **Hoog**.
3. **Na afronden van het onderhoud blijft het voertuig op "Reparatie nodig".** Stappen: status op "Uit (onderhoud voltooid)" zetten en opslaan. Verwacht: voertuig weer Beschikbaar. Werkelijk: onderhoudsrecord "out/completed", maar het voertuig blijft availabilityStatus "needs_fixing"; de scankaart toont "Reparatie nodig" met alleen "Onderhoud inplannen" (de knop "Terug uit onderhoud" verschijnt niet omdat vehicle.maintenanceStatus "ok" is). Het voertuig is alleen weer verhuurbaar door het handmatig via Voertuig bewerken op Beschikbaar te zetten. Ernst: **Hoog**.
4. **De omschrijving van een onderhoud krijgt een Engelse categorieprefix** ("breakdown: AUDIT onderhoud test"); in de geschiedenis staan blokken met de titel "Vehicle Maintenance Block". Ernst: **Laag**.
5. **Kentekens staan in de onderhoudskalender zonder streepjes** ("14PLV1", "44DDHF") terwijl overal elders "14-PLV-1" staat. Ernst: **Laag**.
6. **De klantkiezer in "Onderhoud plannen" laadt alle 301 klanten als platte lijst zonder zoekveld** (geen typeahead zoals bij reserveringen). Ernst: **Laag**.

### UX-opmerkingen
- Het formulier combineert "meld pech", "plan onderhoud" en "APK" in één scherm; de Status-keuze (Gepland/Binnen/Uit) hoort bij een bestaand record en niet bij nieuw aanmaken.
- Er zijn twee begrippen voor onderhoud: een reserveringsblok (onderhoudsstatus scheduled/in/out) en een eigenschap van het voertuig (maintenanceStatus ok), plus de beschikbaarheid (needs_fixing). Ze lopen uit elkaar (bevindingen 2 en 3); voor de gebruiker is niet te zien welke leidend is.
- In het onderhoudsoverzicht ontbreken "Afronden" en "Binnen melden" als losse knoppen; alles loopt via het bewerkformulier.

---

## Module 8 — Transporten (/delivery)

### Getest
Transportdashboard (tegels, tabs per type, statusfilter, zoeken), "Nieuw transport" (leeg verzenden, voertuig AUDIT2 kiezen, opslaan als Voertuigwissel, status Gepland), details bekijken, rapport afdrukken, afronden ("voltooid"), verwijderen met bevestiging, "Route-optimalisatie".

### Werkt
- Het dashboard toont aankomend en laatste transport, tellers per status en tabs Alle/Voertuigwissel/Slepen/Terughalen/Levering/Overig; er staat één oud transport (XX-LL-20, "Extern", voltooid).
- Registreren: validatie bij leeg formulier; opslaan geeft de toast "Transport geregistreerd" en transport #30 verschijnt als Gepland met datum 9 oktober 2026.
- Details-dialoog toont type, status, vervangend voertuig, datum en facturatie; "Bewerken" is bereikbaar.
- "Print" maakt een rapport (POST /api/delivery/transports/generate-report 201); het PDF-bestand (document 149) is een geldige PDF (application/pdf, begint met %PDF-1.7, 1.476 bytes) en staat in Documenten; "Afronden" toont de toast "Transport gemarkeerd als voltooid" en een kijkscherm "Rapport gegenereerd en opgeslagen in Documenten" met Afdrukken.
- Verwijderen vraagt "Dit transport verwijderen?" en verwijdert na bevestigen (toast "Transport verwijderd"; lijst bevat weer alleen #29).

### Werkt niet
1. **"Afronden" gebeurt zonder bevestiging en zonder invoer van de werkelijke uitkomst.** Eén klik op het vinkje maakt het transport definitief voltooid en genereert een rapport; dat vinkje staat naast Bewerken en Verwijderen in de actiekolom. Ernst: **Laag**.
2. **Verwijderen van een transport is definitief** ("kan niet ongedaan worden gemaakt") terwijl voertuigen, klanten en reserveringen naar de prullenbak gaan. Ernst: **Laag**.
3. **Het rapport komt in de ingebouwde browser alleen als dialoog terug na "Afronden"; bij "Print" in de rij zag ik geen zichtbare uitkomst** (wel het PDF-document op de server). Een gebruiker weet dus niet dat er een rapport is gemaakt. Ernst: **Laag**.
4. **Engelse tekst** in de formuliervalidatie ("Please select a vehicle"); het externe transport heet "? → laan" in de routekolom (onvolledig adres wordt als "?" getoond); het transport-PDF heet "Transport_Report_Unknown_Unknown_..." zodra het voertuig geen merk heeft. Ernst: **Laag**.
5. **"Route optimaliseren" blijft klikbaar terwijl er op de gekozen datum niets gepland staat** ("Geen geplande leveringen of transporten op deze datum."). Ernst: **Laag**.

### UX-opmerkingen
- Het formulier heeft veel optionele velden (afstand berekenen, tolkosten voorstellen met €0,15/km, doorbelasten, retour). De knoppen "Berekenen" en "Voorstellen" zijn handig maar de uitleg (bijv. "instelbaar in Instellingen") staat klein.
- Het scherm heet "Transporten", de URL is /delivery; menu-item en dashboardtitel ("Transportdashboard ... leveringen zijn ook transporten") zijn consistent genoeg.
- De iconen in de actiekolom (bekijken, afronden, spare pick-up, spare return, print, bewerken, verwijderen) hebben geen zichtbare naam; zonder tooltip is het raden.
- Een daadwerkelijk bezorgtransport bij een klantreservering ("Bezorgservice vereist" in het reserveringsformulier) en vervangend voertuig koppelen is niet doorgetest.

---

## Module 9 — Kosten (lijst, toevoegen, factuurpostvak, logboek)

### Getest
Kostenbeheer (/expenses): categorietegels en samenvatting, zoeken, "Kosten registreren" (pagina /expenses/add: leeg verzenden, voertuig AUDIT1, categorie Brandstof, bedrag 25,50, omschrijving "AUDIT testkosten", opslaan), tegel openen en kostenpost bekijken, verwijderknop (alleen de bevestiging geopend, geannuleerd), "Ontvangen facturen" (alle drie de tabs), "Factuur scannen" (dialoog geopend; uploaden niet mogelijk).

### Werkt
- Aanmaken: validatie "Category is required" bij een leeg formulier; opslaan geeft toast "Kosten succesvol geregistreerd" en brengt je terug op de lijst; de kostenpost (id 1999, 25,50, 9 oktober 2026, voertuig AUDIT1) is terug te vinden in de lijst en via /api/expenses/vehicle/1667.
- Overzicht: tegel per categorie met aantal en totaal, totaaloverzicht (€ 89.140,04 vóór mijn post) en een tabel per categorie met Bekijken en verwijderen.
- Verwijderen vraagt "Weet je het zeker?" en annuleren laat de post staan.
- "Ontvangen facturen" opent met de tabs Te controleren, Geboekt, Afgewezen; ze tonen netjes lege toestanden ("Niets te controleren", "Nog geen geboekte facturen", "Geen afgewezen facturen"). De melding "Facturen per e-mail staat uit. Zet het aan bij Instellingen, tabblad E-mail" is duidelijk.
- "Factuur scannen" is uitgeschakeld zolang er geen PDF is gekozen.

### Werkt niet
1. **Handmatig geregistreerde kosten komen onder een andere categorie-sleutel dan de bestaande kosten en worden daardoor apart getoond.** Stappen: Kosten registreren met categorie "Brandstof". De post wordt opgeslagen als "Fuel" (hoofdletter); de 53 bestaande posten staan als "fuel". Gevolg: er staan twee tegels "Brandstof" (53 posten € 14.727,77 en 1 post € 25,50) en in de samenvatting "Per categorie" staat Brandstof twee keer; /api/expenses telt 9 sleutels waar het er 8 zouden moeten zijn. Elk rapport of filter dat op de sleutel groepeert, mist daardoor de handmatige posten. Ernst: **Middel**.
2. **Tol en Parkeren zijn bij bestaande kosten de grootste categorieën (54 en 42 posten) maar niet te kiezen in het formulier.** Het formulier biedt Onderhoud, Banden, Remmen, Schade, Brandstof, Verzekering, Registratie, Schoonmaak, Accessoires, Overig; de bestaande data kent toll, parking, cleaning, tires, insurance, maintenance, other, fuel. Remmen, Schade, Registratie en Accessoires komen in de data niet voor. Nieuwe tol- of parkeerkosten zijn dus alleen onder "Overig" te boeken. Ernst: **Middel**.
3. **Tankkosten uit "Brandstofstatus bijwerken" (module 3) en kosten van deze pagina zijn twee losse administraties.** Zie module 3, bevinding 1. Ernst: **Middel** (genoemd).
4. **De knop "Logboek" bij Ontvangen facturen bestaat in deze build niet.** Het projectgeheugen noemt een Logboek met tabs Facturen/Overige mail/Ophaalrondes; in de gebouwde versie op deze werkmap (branch fix/audit-remediation) toont het dialoog alleen "Nu ophalen" en drie tabs. Niet als fout bedoeld; hoort bij een nog niet samengevoegde tak. Ernst: **Laag** (informatief).
5. **Engelse validatie** "Category is required" en bij het leeg laten van het voertuigveld verscheen geen melding (alleen Categorie); het is niet duidelijk of een voertuig verplicht is. Ernst: **Laag**.
6. **Verwijderen van een kostenpost is definitief** ("kan niet ongedaan worden gemaakt"), zonder prullenbak. Ernst: **Laag**.
7. **Het formulier opent als aparte pagina (/expenses/add) vanaf Kostenbeheer, maar als dialoog vanaf het dashboard.** Twee gedragingen voor dezelfde actie. Ernst: **Laag**.

### UX-opmerkingen
- De Kostenpagina toont alleen tegels; de lijst met kostenposten verschijnt pas na klikken op een tegel. Een totaallijst met filters (voertuig, periode, categorie) ontbreekt, al is "Zoeken op kenteken, categorie of omschrijving" aanwezig.
- Het Kosten-tabblad bij een voertuig toont de categorie nog in het Engels ("fuel", "maintenance"), de Kostenpagina in het Nederlands; zie module 3.
- Niet getest: een echte factuur-PDF scannen (de ingebouwde browser kan geen bestand kiezen) en de knop "Nu ophalen" (zou de echte postbus fakturenapp@lamgroep.nl kunnen benaderen; de instelling staat uit).

---

## Module 10 — Documenten (bibliotheek, uploaden, sjablonen, contract genereren en voorvertoning, PDF openen)

### Getest
Documentbibliotheek (10 voertuigen, 22 documenten; uitklappen per voertuig en documenttype; knoppen Bekijken, Downloaden, E-mailen, Afdrukken, Verwijderen), alle vijf tabs (Documentbibliotheek, Contractsjablonen, Transportrapportsjablonen, Barcodelabels, Schadecheck-sjablonen), sjabloonvoorvertoning (PDF), sjablooneditor voor contracten (veld toevoegen en opslaan), "Document uploaden" (voertuig kiezen, formulier bekijken), en een tweede volledige overdracht (reservering #3202, voertuig AUDIT2) om contractgeneratie te bewijzen.

### Werkt
- Documentbibliotheek toont per voertuig het aantal documenten; AUDIT1 toont de schadecheck-PDF met "Verouderd" (na het terugdraaien in module 6), datum, omschrijving en grootte (705,49 KB). GET /api/documents/view/148 geeft 200 (opent in een apart venster dat de ingebouwde browser niet toont).
- Sjabloonvoorvertoning (/api/pdf-templates/2/preview) geeft een geldige PDF (612.923 bytes).
- Sjablooneditor: toolbar (ongedaan maken, opnieuw, kopiëren, dupliceren, uitlijnen, zoom, raster, linialen, hulplijnen), "Veld toevoegen" met 34 gegevensbronnen (Contractnummer, Kenteken, Klantnaam, Klantadres, Bedrijfsnaam, Naam bestuurder, Totaalprijs, Kilometerstand ophalen, enzovoort), positievoorinstellingen, "Voorvertoning genereren". Opslaan werkt (template 2 "gffg" kreeg een veld Klantnaam; updatedAt 9 oktober 19:35).
- Na het toevoegen van dat ene veld slaagt de contractgeneratie: bij ophalen van AUDIT2 (reservering #3202, contract 1013) verscheen het dialoog "Contract klaar: AUDIT2_contract_unsigned_...pdf is aangemaakt" met Afdrukken en Mail naar klant; het bestand is een geldige PDF (application/pdf, 613.268 bytes, %PDF-1.7) en staat als "Contract (Unsigned)" bij de reservering. Dit bewijst dat de fout in module 6 volledig aan het lege testsjabloon lag.
- Transportrapport-sjabloon "Driver Handoff Sheet" (standaard), twee barcodelabelsjablonen (Sleutelkast 30x18 standaard, Label voor op auto 62x29) en één voertuigdiagram (Mitsubishi Spacestar) zijn zichtbaar en bewerkbaar.
- "Document uploaden" vraagt eerst een voertuig, daarna documenttype (13 types), bestand (PDF, Word, Excel, afbeeldingen en tekst, maximaal 5 MB) en notities; de knop blijft uitgeschakeld zonder bestand.

### Werkt niet
1. **Ik heb de standaardsjabloon van de testdatabase gewijzigd.** De enige sjabloon ("gffg", Standaard) had geen velden; ik heb één veld (Klantnaam) toegevoegd en opgeslagen om contractgeneratie te kunnen testen. Dat is een wijziging in lvstest (niet in productie); de sjabloon heeft nu één veld. Een eerdere poging om daarna de sjabloonlijst via het scherm uit te lezen werd door de automatische rechtencontrole van de omgeving geweigerd (reden "Modify Shared Resources"); ik heb daarna zonder omweg verder gewerkt en het resultaat via een gewone pagina-aanroep gecontroleerd. De eigenaar kan het veld in de sjablooneditor weer weghalen. Ernst: **Laag** (testdata).
2. **Een sjabloon zonder velden kan Standaard zijn en blokkeert dan elk contract.** De app voorkomt niet dat een lege sjabloon de standaard wordt, en bij het ophalen is de waarschuwing pas achteraf te zien (zie module 6, bevinding 1). Een controle bij Opslaan of bij het kiezen als standaard ("Dit sjabloon heeft geen velden") zou dat voorkomen. Ernst: **Middel**.
3. **De editor is een dialoog over het scherm dat niet met Escape sluit en zonder waarschuwing over niet-opgeslagen wijzigingen.** Na Opslaan bleef de editor open en de tabs achter de editor reageerden niet totdat de editor was gesloten; bij het sluiten verscheen geen bevestiging. Ernst: **Laag**.
4. **Na het openen van een document met "Bekijken" reageerde "Document uploaden" niet meer tot de pagina werd herladen.** Twee keer gereproduceerd (klik zonder uitwerking, geen foutmelding); na herladen opende het dialoog direct. De oorzaak is niet bepaald (mogelijk het apart geopende venster). Ernst: **Laag**.
5. **Kentekens staan zonder streepjes in de bibliotheek** ("11RHDF", "44DDHF") en documentbeschrijvingen staan in het Engels ("Damage check recorded at return of reservation #3200", "Damage Check", "Contract (Unsigned)", sjabloonnaam "Driver Handoff Sheet"). Ernst: **Laag**.
6. **De schadecheck-sjablonen bevatten maar één voertuigdiagram** (Mitsubishi Spacestar, 2015 tot 2026, Hatchback). Voor de overige modellen is geen diagram beschikbaar. Ernst: **Laag/Middel** (zie module 11).
7. **Het contractnummer wordt verbruikt ook als het contract niet gemaakt wordt** (1012 bij #3200 zonder contractbestand; daarna 1013). Dat laat gaten in de nummering achter. Ernst: **Laag**.

### UX-opmerkingen
- De bibliotheek heeft geen globale zoek- en filterbalk boven de lijst met voertuigen behalve "Documenten zoeken..." en twee filters; bij honderden voertuigen is dat niet genoeg.
- Het uploaden vraagt vier handelingen voordat je een bestand kiest (knop, voertuig kiezen, doorgaan, type kiezen).
- Niet getest: een echt bestand uploaden en afdrukken/downloaden (ingebouwde browser kan geen bestand kiezen en geen printdialoog tonen).

---

## Module 11 — Schadechecks en scannen (/scan, interactieve schadecheck, PDF)

### Getest
- Scanpagina /scan: kenteken zonder streepjes (AUDIT1, AUDIT2) typen, scankaart met vehicle-, reserverings- en snelkoppelingen (zie ook module 2 en 6).
- Dashboard "Schadecheck starten": scan van AUDIT2 (opgehaald via #3202), dialoog "Interactieve schadecheck" (retourinspectie), schadetype "Deuk" kiezen en op het diagram klikken, "Check opslaan", "PDF afdrukken".

### Werkt
- Scannen op kenteken zonder streepjes werkt op /scan en in de dashboarddialogen; onbekend kenteken geeft een Nederlandse melding (module 2).
- De schadecheck herkent een opgehaald voertuig en kiest zelf "Retourinspectie" en de bijbehorende reservering #3202 (kilometerstand voorgevuld met 1.000).
- Het formulier is uitgebreid: schadetypes (Deuk, Kras, Scheur, Ontbrekend onderdeel, Overig), Interieur (bekleding, asbak, reservewiel, krik, wielsleutel, matten, hoofdsteunen), Exterieur (wieldoppen, kentekenplaten, spiegels, antenne, ruitenwisser, deurvangers, schuifdeur, sloten, mistlampen), Aflever-check (olie-water, ruitenproeiervloeistof, verlichting, bandenspanning, kachelfan, enzovoort), Voertuiggegevens (brandstof, kilometerstand) en notities.
- "Check opslaan" legt een check vast (id 15, type return) en "PDF afdrukken" levert /api/interactive-damage-checks/15/pdf als geldige PDF (200, application/pdf, 722.426 bytes, %PDF-1.7) die in een nieuw venster opent.

### Werkt niet
1. **Een schade is niet te markeren op het diagram.** Stappen: "Deuk" kiezen, op het diagram klikken. Verwacht: een markering en een actief "Tekeningen wissen". Werkelijk: er verschijnt niets (de canvas bevat 0 getekende pixels en "Tekeningen wissen" blijft uitgeschakeld). Het diagram dat voor dit voertuig wordt geladen (/api/vehicle-diagram-templates/1/image) is slechts 1198 x 24 pixels groot (een platte strook), waardoor tekenen in de praktijk niet kan; waarschijnlijk is het testdiagram "Mitsubishi Spacestar" verkeerd geüpload. De oorzaak ligt dus mogelijk in de testdata, maar de app waarschuwt niet voor een onbruikbaar diagram. Ernst: **Middel** (kernfunctie schadecheck niet te gebruiken met dit diagram).
2. **De toast na "Check opslaan" zegt "Check geladen: Schadecheck succesvol geladen voor bewerking".** Het opslaan slaagde (check bestaat), maar de melding doet voorkomen dat er alleen is geladen. Ernst: **Laag**.
3. **Voor een voertuig zonder eigen diagram wordt het diagram van een ander type (Spacestar) getoond.** Er is maar één diagramsjabloon (zie module 10). Ernst: **Laag**.
4. **De scankaart noemt een voertuig "Verhuurd" terwijl de reservering nog "Geboekt" is** (AUDIT1 en AUDIT2, zodra een reservering voor vandaag bestaat). De status lijkt uit de reserveringsperiode te komen, niet uit het daadwerkelijk ophalen. Ernst: **Laag/Middel** (misleidend voor het balieteam).
5. **Twee werkwijzen voor hetzelfde:** op het dashboard opent een scan met een geboekte reservering meteen "Ophaalproces starten", op /scan toont dezelfde scan eerst een kaart en moet je op "Ophalen starten" klikken. Ernst: **Laag**.
6. **De schadecheckformulieren hebben veel knoppen voor ja/nee zonder duidelijke standaard** ("schoon / vuil", "ja / nee", "goed / kapot"); ik kon niet zien welke waarde actief is voordat ik klikte. Ernst: **Laag**.

### UX-opmerkingen
- De schadecheck voelt voor een balie veel te lang (ongeveer 50 keuzes) zonder een korte versie "alles in orde"; een knop "Alles goed" per blok zou veel kliks besparen.
- Bij "Check opslaan" is er geen zichtbare voortgang; de PDF opent pas via een aparte knop.
- De schadecheck-PDF bij het inleveren (module 6) en de interactieve check (hier) zijn twee verschillende producten (kopie van het formulier tegenover een eigen check); het is niet duidelijk hoe ze samenhangen.
- Niet getest: foto's toevoegen, handtekening zetten en het mailen van de check (geen bestandskeuze en geen SMTP in de ingebouwde browser).

---

## Module 17 — Instellingen en beheer (app-instellingen, back-ups, gebruikers en rechten)

> Deze module is bewust vóór de modules 12 tot en met 16 gedaan, omdat de rechtenproef (module 18) het gebruikersbeheer nodig had. De modules Boetes, Communicatie, Rapporten, Portaalbeheer en Fiscaal zijn nog niet doorgelopen.

### Getest
- Gebruikersbeheer (menu, Gebruikers): lijst van 12 accounts (admin, ike, de tien e2e-accounts), bewerkformulier van e2e-user met 35 rechten en de velden Rol, Actief, Prijzen verbergen en wachtwoord; twee keer opgeslagen. Er is niets aan de accounts "admin" en "ike" gedaan.
- App-instellingen: acht tabs doorgelopen (Bedrijfsregels, Meldingen, Documenten, Doc-e-mails, Kalender, E-mail en GPS, Activiteit, Klantenportaal), alleen lezend; niets opgeslagen.
- Back-upbeheer: overzicht gelezen, "Nu back-uppen" geklikt. "Herstellen" is bewust niet geklikt.
- Niet getest: gebruiker toevoegen of verwijderen, instellingen opslaan, een back-up herstellen.

### Werkt
- Gebruikerslijst met rol, status, naam en e-mail; het bewerkscherm toont de rechten met Nederlandse namen ("Klanten beheren", "Overdracht terugdraaien", "Fiscale configuratie goedkeuren" enzovoort), niet met de ruwe sleutels van het profielscherm.
- Opslaan van de rechten werkt: PATCH /api/users/6 geeft 200 en de rechten staan direct in de database en in /api/user (8 in plaats van 11 rechten); de auditlog toont "user.update ... permissions: [8 items] naar [11 items]".
- App-instellingen: de tabs openen zonder fouten; E-mail en GPS meldt duidelijk "Geen e-mailconfiguratie ingesteld" en dat er nog geen afzenderadres is; Activiteit toont het activiteitenlog (1.548 regels) met filters op gebruiker, actie en periode, inclusief mislukte logins (user.login.failed) en wijzigingen aan rechten.
- Back-upbeheer toont planning (dagelijks 02:00), laatste fout, back-uplocatie en een waarschuwing dat BACKUP_PATH ontbreekt, lijsten met database- en bestandsback-ups met Downloaden en Herstellen, en handmatige back-up per onderdeel (App-gegevens, Geüploade bestanden, App-code).

### Werkt niet
1. **Een gebruiker opslaan zonder nieuw wachtwoord wist het wachtwoord, waarna inloggen niet meer kan.** Stappen: Gebruikers, e2e-user, Bewerken, alleen rechten wijzigen, "Gebruiker bijwerken" (het veld "Nieuw wachtwoord (leeg laten om te behouden)" blijft leeg). Verwacht: wachtwoord blijft behouden. Werkelijk: PATCH /api/users/6 geeft 200, maar in de database is de lengte van het opgeslagen wachtwoord 0 (bij alle andere accounts 172); inloggen als e2e-user geeft daarna "Incorrect password". Oorzaak in de code: het formulier stuurt `password: ""`; server/routes/users.ts (regel 307) behandelt alleen een niet-lege waarde als wachtwoordwijziging en geeft anders het hele object met `password: ""` door aan `storage.updateUser` (server/database-storage.ts regel 229), dat alleen een niet-lege waarde verwijdert, zodat een lege tekst als nieuw wachtwoord wordt weggeschreven. Elke beheerder die iemands rechten, rol of naam wijzigt zonder een nieuw wachtwoord in te vullen, sluit die persoon dus buiten. Ik heb het hersteld door in het bewerkformulier een nieuw wachtwoord in te vullen (lengte weer 172). Ernst: **Hoog**.
2. **Geen terugkoppeling na het opslaan van een gebruiker.** Na "Gebruiker bijwerken" gaat het scherm terug naar de lijst zonder succesmelding; de beheerder kan niet zien of het gelukt is. Ernst: **Laag**.
3. **De foutmelding bij een mislukte back-up toont ruwe tekst:** "Back-up mislukt: 500: {"error":"The backup failed. Check the server log for details."}". De werkelijke oorzaak (pg_dump ontbreekt) staat wel bij "Laatste back-upfout", maar in het Engels. Ernst: **Laag**.
4. **De back-uplijst toont een back-up met datum "1 jan 1970, 01:00"** (files-backup-2025-10-13...). De laatste geslaagde back-up is van 23 augustus 2026, terwijl de planning "dagelijks 02:00" zegt; bovenaan het scherm staat geen waarschuwing "laatste back-up is ouder dan een dag" (alleen een rode balk op het dashboard met de technische foutregel). Ernst: **Laag/Middel**.
5. **Elke back-up heeft naast Downloaden een knop Herstellen zonder zichtbare uitleg over wat er overschreven wordt.** Niet geklikt; de bevestigingsstap is dus niet getest. Ernst: **Laag** (niet getest).

### UX-opmerkingen
- Het wachtwoordveld in het bewerkformulier belooft "leeg laten om te behouden"; dat zou ook moeten kloppen (zie bevinding 1).
- In de gebruikerslijst staat bij elke rij een verwijderknop, ook bij de eigenaar-accounts "admin" en "ike" (niet geklikt).
- App-instellingen heeft acht tabs in één dialoog met elk een eigen Opslaan-knop; of een wijziging in het ene tab verloren gaat bij wisselen zonder opslaan is niet getest.

---

## Module 18 — Rechten fysiek (admin handelt, rechten strippen, inloggen als die gebruiker, knoppen grijs of verborgen, directe navigatie geblokkeerd)

### Getest
Als e2e-admin heb ik drie rechten van e2e-user afgenomen: "Klanten beheren", "Reserveringen beheren" en "Documenten bewerken en genereren" (11 rechten werden 8). Uitgelogd, ingelogd als e2e-user (na het herstellen van het wachtwoord, zie module 17) en gecontroleerd: zijbalk, directe URL's, dashboardknoppen, knoppen op Klanten, Reserveringen en Documenten, tooltips, gebruikersmenu en een directe API-aanroep. Daarna als e2e-admin de drie rechten teruggezet (controle in de database: 11 rechten en wachtwoord weer aanwezig).

### Werkt
- Zijbalk: e2e-user ziet alleen Dashboard, Voertuigen, Scannen, Klanten, Reserveringen, Documenten en Transporten; Kosten, Onderhoud, Communicatie, Rapporten en Klantenportaal zijn verborgen.
- Rechtstreeks typen van /expenses, /maintenance, /reports, /communications en /portal-admin geeft het scherm "U heeft geen toegang tot dit scherm" met de exacte reden in het Nederlands, bijvoorbeeld "Hiervoor is het recht 'Kosten beheren' nodig. Vraag een beheerder om het aan te zetten." en een knop "Ga naar een scherm dat u wel mag gebruiken".
- Knoppen zonder recht zijn grijs (disabled) en leggen bij zweven uit waarom ("Hiervoor heeft u het recht 'Reserveringen beheren' nodig."): op Klanten "Klant toevoegen", "Nieuwe reservering" en "Verwijderen"; op Reserveringen "Nieuwe reservering"; op het dashboard 12 van de 14 snelle acties. Scannen en Schadecheck starten blijven actief omdat het recht Schadecontroles beheren er nog is.
- Het gebruikersmenu van e2e-user bevat alleen Profiel, English en Uitloggen (Gebruikers, Back-upbeheer en App-instellingen zijn verborgen).
- De server dwingt het af: PATCH /api/pdf-templates/2 als e2e-user geeft 403.
- De audittrail legt de rechtenwijziging en de logins en uitlogs vast.

### Werkt niet
1. **"Document uploaden" op de pagina Documenten is voor een gebruiker zonder het recht "Documenten bewerken en genereren" gewoon klikbaar**, terwijl dezelfde actie op het dashboard grijs is. Het dialoog opent; ook de tab Contractsjablonen en de knop "Sjablooneditor openen" zijn zichtbaar zonder het recht PDF-sjablonen beheren. Pas de server weigert (403). Ernst: **Middel** (de interface belooft iets wat niet mag, en is inconsistent met het dashboard).
2. **Het dashboard toont "Alles bekijken" bij Recente kosten (link naar /expenses) aan een gebruiker zonder recht**; de link leidt naar het scherm "geen toegang". Ernst: **Laag**.
3. **Het profielscherm toont de rechten als ruwe Engelse sleutels** ("manage_users", "view_vehicles", enz.), terwijl het beheerscherm Nederlandse namen gebruikt (zie module 1). Ernst: **Laag**.
4. **Niet getest of een rechtenwijziging meteen werkt voor een gebruiker die al is ingelogd** (ik heb de gebruiker steeds uitgelogd laten zijn tijdens de wijziging). Ernst: **Laag** (niet getest).

### UX-opmerkingen
- De uitleg bij uitgeschakelde knoppen is voorbeeldig, maar verschijnt alleen bij zweven; op een tablet bestaat zweven niet. Een korte vaste regel bij de knop zou helpen.
- Doordat een beheerder bij elke bewerking het wachtwoord kwijtraakt (module 17), is deze rechtenproef alleen te herhalen als het wachtwoord telkens opnieuw wordt ingevuld.
---

## Module 19 — Generatie (PDF's, exports, back-up, wachtstanden en toasts): tussenstand

Deze module is nog niet apart doorgelopen; wat al is gezien tijdens de andere modules staat hier bij elkaar. Nog te doen: CSV-export bij klantgeschiedenis, rapport-exports (module 14), back-upbestand downloaden (pg_dump ontbreekt op deze computer, dus een echte back-up is hier niet te maken).

### Bewezen uitvoer
| Uitvoer | Waar | Resultaat |
|---|---|---|
| Schadecheck-PDF bij inleveren | module 6 | Geldige PDF (722 kB), staat in Documenten |
| Interactieve schadecheck-PDF | module 11 | Geldige PDF (722 kB), opent in nieuw venster |
| Contract-PDF bij ophalen | module 10 | Geldige PDF (613 kB) nadat het sjabloon een veld kreeg; zonder veld 409 met duidelijke melding |
| Sjabloonvoorvertoning contract | module 10 | Geldige PDF (613 kB, lege achtergrond zolang er geen velden zijn) |
| Transportrapport-PDF | module 8 | Geldige PDF (1,5 kB), staat in Documenten |
| Documentbibliotheek: bekijken | module 10 | GET 200 (opent in een apart venster) |
| E-mail met bijlage | module 6 | 500, "No email settings configured" (geen SMTP lokaal; Engelse toast) |
| Back-up maken | module 17 | 500, pg_dump ontbreekt (lokaal; toast met ruwe JSON) |

### Wachtstanden en toasts (algemeen)
- Eerste keer openen van de meeste dialogen kost 3 tot 6 seconden zonder laadindicator (dev-modus); knoppen lijken dan niets te doen.
- Toasts verdwijnen na ongeveer 5 seconden; fouttoasts bevatten vaak Engels of ruwe JSON ("Failed to send email", "500: {...}", "Vehicle not found").
- Opslaan van een gebruiker en na "Check opslaan" geven geen of een verkeerde toast (zie modules 11 en 17).

---

## Module 20 — UX-samenvatting (voorlopig, gebaseerd op de modules 1 tot en met 11, 17 en 18)

### Aantallen (alleen de modules die zijn doorgelopen)
13 modules doorgeklikt, 74 bevindingen: **3 Hoog, 15 Middel, 56 Laag**.

### De ernstigste bevindingen
1. **Gebruiker opslaan wist het wachtwoord (Hoog, module 17).** Elke beheerder die rechten of naam van een collega wijzigt zonder een nieuw wachtwoord in te vullen, sluit die collega buiten. Aan de code ligt een lege tekst die wordt opgeslagen als wachtwoord (server/routes/users.ts regel 307, server/database-storage.ts regel 229).
2. **Onderhoud: bewerken zet voertuig en onderhoud ongevraagd op "in onderhoud" en na afronden blijft het voertuig niet verhuurbaar (twee keer Hoog, module 7).** Het formulier toont als status "Binnen" in plaats van de opgeslagen "Gepland"; afronden ("Uit") zet het voertuig niet terug op Beschikbaar en de knop "Terug uit onderhoud" is dan niet bereikbaar.
3. **Kosten worden niet betrouwbaar geboekt (Middel, modules 3 en 9).** Handmatige kosten krijgen de categoriesleutel "Fuel" naast de bestaande "fuel" (twee tegels, dubbel in de samenvatting), Tol en Parkeren zijn niet te kiezen, en tankkosten uit "Brandstofstatus bijwerken" komen helemaal niet in de kostenadministratie.
4. **Contract: groene toast "Contract is gegenereerd" terwijl het sjabloon geen velden heeft (Middel, modules 6 en 10).** Een leeg standaardsjabloon blokkeert alle contracten en de app voorkomt dat niet.
5. **Een naam van een zakelijke klant wordt verminkt tot "B.v." en "Dhl" (Middel, module 4)**, en de prullenbak voor klanten is alleen te vinden onder "Verwijderde voertuigen" op het voertuigenscherm.
6. **Rechten: grijze knoppen en geen-toegang-schermen zijn goed uitgelegd (module 18), maar "Document uploaden" op de documentenpagina is wel klikbaar zonder recht (Middel).**

### Sterke punten
- Beveiligingen bij overdracht: kilometerverlaging met wachtwoord, annuleren van een opgehaalde huur met vinkje, terugdraaien met voorvertoning, typ-bevestiging bij verwijderen van voertuig en klant, waarschuwing bij voertuigopmerkingen.
- Rechtenmeldingen met de naam van het ontbrekende recht in het Nederlands.
- Zoeken op kenteken werkt met en zonder streepjes.

### Te veel kliks, ontbrekende bevestigingen, trage terugkoppeling
- **Te veel kliks:** de interactieve schadecheck heeft circa 50 keuzes zonder "alles goed"; een document uploaden kost vier handelingen vóór de bestandskeuze; een reservering aanmaken ongeveer zes.
- **Ontbrekende bevestiging:** "RDW APK-datums scannen" start een volledige scan met één klik; "Afronden" van een transport en verwijderen van chauffeur, transport en kostenpost zijn definitief zonder prullenbak.
- **Trage of ontbrekende terugkoppeling:** geen laadindicator bij eerste keer openen van dialogen; geen toast na gebruiker opslaan; toast na "Check opslaan" zegt "geladen"; foutteksten in het Engels.
- **Taal:** formuliervalidatie (Zod) staat overal nog in het Engels ("Category is required", "Please select a vehicle"), net als categorieën in widgets ("tires", "fuel"), raw auditcodes ("reservation.pickup") en voorbeeldteksten ("John Doe", "Main Street").

Deze samenvatting wordt aangevuld zodra de modules 12 tot en met 16 en 19 zijn doorgelopen.
