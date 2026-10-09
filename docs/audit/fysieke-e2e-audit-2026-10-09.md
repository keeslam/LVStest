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


### Aanvulling (tweede ronde: vervangend voertuig en Annuleren)
Getest met een eigen vervangende auto AUDIT3 (id 1670, via de voertuig-API aangemaakt): onderhoud plannen op AUDIT2 voor 3 november, de klantreservering #3203 (3 t/m 5 november) die daardoor geraakt wordt, het dialoog "Vervangende voertuigen toewijzen" met "Annuleren", daarna opnieuw plannen met AUDIT3 als vervanger, en het blok verwijderen.

Werkt:
- Het dialoog noemt de geraakte reservering ("Audit Testklant B.v., Reservering: 03-11-2026 - 05-11-2026, Oorspronkelijk voertuig AUDIT2") en biedt drie keuzes: "Nu vervangend voertuig toewijzen", "Later vervanger toewijzen (nog te bepalen)" en "Klant regelt eigen vervoer".
- "Nu vervangend voertuig toewijzen" opent een voertuigkiezer met typefilters en zoekveld; na AUDIT3 kiezen staat "Vervangende verhuur: 3 Nov - 3 Nov" met een knop Bewerken, en bevestigen geeft de toast "Onderhoud gepland. Het onderhoud is gepland en de herinneringen zijn bijgewerkt." Resultaat: onderhoudsblok #3205 op AUDIT2 en vervangreservering #3206 (type replacement, AUDIT3, 3 november, vervanger voor #3203).
- Verwijderen van een onderhoudsblok vraagt een eigen bevestiging ("Onderhoud verwijderen ... Deze actie kan niet ongedaan worden gemaakt."), geeft de toast "Onderhoud verwijderd" en het blok is daarna 404.

Werkt niet:
7. **"Annuleren" in het vervangerdialoog plant het onderhoud toch.** Stappen: onderhoud plannen op AUDIT2 voor 3 november, in het dialoog "Annuleren". Verwacht: er wordt niets gepland. Werkelijk: het dialoog sluit zonder melding, maar onderhoudsblok #3204 (type maintenance_block, Geboekt, AUDIT2, 3 november, aan klant 1247 gekoppeld) bestaat al (het wordt aangemaakt vóór de keuze van de vervanger). Reservering #3203 overlapt dan met het onderhoud, heeft geen vervanger en wordt nergens gesignaleerd: de tab Vervangers in het onderhoudsoverzicht toont alleen de twee oude aanvragen en #3203 staat op spareVehicleStatus "assigned". Ernst: **Middel**.
8. **Na het kiezen van het vervangend voertuig zijn twee klikken op "Vervangers toewijzen & onderhoud plannen" nodig.** De eerste klik sluit alleen de keuzelijst; er verschijnt geen melding en het dialoog blijft staan. Ernst: **Laag**.

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

## Module 12 — Boetes (bekeuringen: lijst, toevoegen, koppelen, prullenbak)

> In de app heten ze "Bekeuringen" en staan ze niet in de zijbalk: ze zitten in het Klantenportaal-scherm (/portal-admin, tegel "Bekeuringen" of "Alle bekeuringen"), in het voertuigdetail (knop "Bekeuringen: 1") en in het klantdetail (portaaltab). Een eigen menu-item "Boetes" bestaat niet.

### Getest
- Lijst (5 bekeuringen bij aanvang): zoeken, filter Status (alle zes), filter Kenteken (met streepjes ingetypt), filters Van en Tot (ook de randdag: Van = Tot = 1 oktober), uitklaplijst, CSV-export.
- Detaildialoog van een bestaande bekeuring (#73, alleen gelezen) en via de URL-parameters ?fine=<id> en ?tab=fines.
- Nieuwe bekeuring: leeg formulier opslaan; twee eigen records: #511 (AUDIT2, 10 oktober, door het systeem gekoppeld aan reservering #3202) en #512 (AUDIT1, 8 oktober, niet gekoppeld).
- Koppelen aan een klant (zoeken op "Audit", kiezen, Koppelen), bewerken (omschrijving en interne notitie), Ontkoppelen, Annuleren, Heractiveren, Verwijderen (beide antwoorden op de bevestiging), Prullenbak en Terugzetten.
- CJIB-importen en Brieven scannen geopend (alleen lezen). Knop "Bekeuringen: 1" in het voertuigdetail van AUDIT2.
- Niet getest: brief scannen, CJIB-bestand uploaden (ingebouwde browser kan geen bestand kiezen), "Nu ophalen" bij CJIB-importen (niet geklikt: zou een echte postbus kunnen raadplegen), doorbelasten en betaald markeren (bestaan niet in de interface, zie bevinding 3).
- Voor bevinding 1 heb ik één eigen bekeuring (#513, AUDIT1, met administratiekosten 12,50) via een directe POST aangemaakt, omdat het formulier geen veld voor administratiekosten heeft; daarna alles via het scherm.

### Werkt
- Lijst, zoeken, statusfilter, kentekenfilter (ook met streepjes: GET /api/fines?licensePlate=94-XT-184 geeft 200 en de juiste drie regels) en datumfilters (inclusief de randdag) werken en geven 200.
- CSV-export levert direct een bestand: kopregel Kenteken;Datum;Omschrijving;Klant;Bestuurder;Bedrag;Status, puntkomma als scheidingsteken, kentekens mét streepjes (94-XT-184), 5 regels, 605 bytes, geen fouttoast.
- Nieuw formulier: de browser meldt "Vul dit veld in." voor kenteken, datum/tijd, bedrag en omschrijving; opslaan geeft 201, daarna opent het detail direct.
- Automatische koppeling: een bekeuring op AUDIT2 op 10 oktober werd direct aan de lopende reservering #3202 en klant 1247 gekoppeld (status Gekoppeld, "Gekoppeld door system"). Een bekeuring op AUDIT1 zonder lopende reservering bleef netjes "Niet gekoppeld" met de tekst "Geen reserveringen gevonden voor dit kenteken. Kies een klant."
- Handmatig koppelen: de knop Koppelen is uitgeschakeld tot een klant is gekozen; na kiezen POST /api/fines/512/link 200, status Gekoppeld, "Gekoppeld door e2e-admin".
- Bewerken, Ontkoppelen, Annuleren (alle velden worden daarna uitgeschakeld) en Heractiveren werken en geven 200 met de toast "Bekeuring opgeslagen.".
- Verwijderen vraagt eerst "Deze bekeuring naar de prullenbak verplaatsen? Een beheerder kan hem daar terugzetten." Antwoord nee laat alles staan; antwoord ja geeft DELETE 200, toast "Bekeuring naar de prullenbak verplaatst" en het detail is daarna 404 (netjes weg uit de lijst).
- Prullenbak (alleen beheerders): toont wie wanneer verwijderde; Terugzetten geeft de toast "Teruggezet — ... is teruggezet" en GET /api/fines/513 geeft weer 200.
- Voertuigdetail van AUDIT2 toont de knop "Bekeuringen: 1" en opent de lijst al gefilterd op dat voertuig.
- CJIB-importen toont het bestand cjib-levering-demo.csv (Upload, 2 regels, 2 aangemaakt, 2 gekoppeld, Verwerkt) en de knoppen Nu ophalen en Bestand uploaden.

### Werkt niet
1. **Opslaan in het bekeuringsdetail wist de administratiekosten.** Stappen: bekeuring met administratiekosten (#513: bedrag 100,00 + 12,50 = totaal 112,50), detail openen, alleen een interne notitie typen, "Opslaan". Verwacht: totaal blijft 112,50. Werkelijk: PATCH /api/fines/513 geeft 200 en de toast "Bekeuring opgeslagen."; daarna is administratiekosten 0,00 en het totaal 100,00. Oorzaak in de code: client/src/components/fines/fine-dialog.tsx (knop Opslaan) stuurt altijd `adminFee: 0` mee. Het dialoog toont de administratiekosten niet, dus de beheerder ziet niets. Het formulier "Nieuwe bekeuring" vult de administratiekosten uit de instelling `fineAdminFee` stil in (new-fine-dialog.tsx regel 35), dus zodra die instelling gevuld is, verliest elke bewerkte bekeuring haar kosten (de klant krijgt een te laag bedrag in het portaal, de eigenaar derft 12,50 per bekeuring). In deze testdatabase hebben alleen de oude testbekeuringen #17 en #27 nog administratiekosten (12,50 en 10,00). Verzachtend: de instelling `fineAdminFee` heeft in App-instellingen (tab Klantenportaal) geen invoerveld en staat op 0, dus in de interface zelf ontstaan geen administratiekosten; het risico bestaat alleen als de waarde via de database of een import is gevuld. Ernst: **Middel** (geldverlies per bewerkte bekeuring, kleine kans zolang de instelling niet in gebruik is).
2. **Klantnaam blijft leeg bij een klant zonder bedrijfsnaam.** Stappen: bekeuring koppelen aan "Audit Testklant B.v." (id 1247). Verwacht: naam in de kolom Klant en op de knop "Klant openen: ...". Werkelijk: kolom Klant is leeg en de knop heet "Klant openen:" zonder naam (ook op de bekeuring van AUDIT2). Oorzaak: de klantenkaart slaat een lege bedrijfsnaam op als tekst "" (niet als leeg veld) en de zoekopdracht gebruikt `coalesce(companyName, name)` zonder `nullif` (server/services/fines-storage.ts regel 15, fine-attribution.ts regel 35, portal-dashboard.ts regel 43, portal-requests-storage.ts regel 17); alleen portal-storage.ts en portal-customer-notifications.ts doen het goed. Daardoor ook lege klantnamen in het portaaldashboard en bij aanvragen. Alle 300 geïmporteerde klanten hebben een leeg veld (NULL), dus het valt pas op bij klanten die via het formulier zijn aangemaakt zonder bedrijfsnaam. Ernst: **Middel**.
3. **De statussen "Doorbelast" en "Betaald" zijn in de interface niet te bereiken.** Het statusfilter en de badges kennen ze, maar in het detail staan bij een gekoppelde bekeuring alleen Opslaan, Ontkoppelen, Annuleren en Verwijderen. De server weigert ook de overgang: POST /api/fines/511/status met `charged` geeft 400 "Cannot go from linked to charged" (toegestaan: cancelled, new; shared/fines.ts regel 13). Er is dus geen manier om te registreren dat een bekeuring is doorbelast of betaald, terwijl de portal-klant die statussen wel verwacht te zien. "Betwist" komt alleen vanuit het portaal. Ernst: **Middel**.
4. **De tijd van de overtreding staat 2 uur eerder dan ingevoerd (lokaal).** Stappen: nieuwe bekeuring met 8 oktober 11:30. Verwacht: lijst en detail tonen 11:30. Werkelijk: 09:30:00 (en 10:00 werd 08:00:00). In de database staat het veld `offence_at` als `timestamp without time zone` terwijl shared/schema.ts `timestamp with time zone` zegt; de Node-server draait op deze Windows-computer in Amsterdam-tijd en schrijft UTC zonder tijdzone weg. Zo is ook "Gekoppeld door ... om 18:04" twee uur te vroeg terwijl de nieuwe record-tijd (createdAt) twee uur te laat is. Op een UTC-server (Coolify) valt dit mogelijk weg; niet gecontroleerd. Het kolomtype in de database wijkt wel af van het schema, en raakt elke tijd in de app (bij de dagwisseling kan een bekeuring zo aan de verkeerde reservering gekoppeld worden). Ernst: **Laag/Middel** (lokaal bewezen).
5. **De knop "Annuleren" in het bekeuringsdetail annuleert de bekeuring, niet het dialoog.** Eén klik zet de status op Geannuleerd zonder bevestiging (alle velden worden uitgeschakeld; terug te draaien met Heractiveren). In elk ander dialoog van de app betekent Annuleren "sluiten zonder opslaan". Ernst: **Laag/Middel** (verwarring).
6. **Verwijderen gebruikt een native browservenster** (window.confirm) in plaats van het eigen bevestigingsdialoog dat de app bij voertuigen en klanten gebruikt, zonder het kenteken of het bedrag in de tekst. Ernst: **Laag**.
7. **Notatie loopt uiteen.** In de lijst "€ 95.00" (punt) en "10-10-2026, 08:00:00" (met seconden); in de CSV "95.00" met puntkomma als scheidingsteken (Nederlands Excel leest "95.00" als tekst of datum). Kentekens staan in de lijst zonder streepjes (94XT184), in de CSV met streepjes. Ernst: **Laag**.
8. **Toasts zijn niet specifiek:** koppelen, ontkoppelen, annuleren en heractiveren geven alle vier "Bekeuring opgeslagen." Ernst: **Laag**.
9. **Koppelen of aanmaken van een bekeuring mailt de klant direct.** Bij het aanmaken van #511 (automatisch gekoppeld) en het koppelen van #512 vertrok meteen een e-mail "Bekeuring AUDIT2 van 2026-10-10" en "Bekeuring AUDIT1 van 2026-10-08" naar het adres van de klant (e-maillog 4 en 5, nu mislukt door ontbrekende e-mailinstelling). Er staat geen waarschuwing in het scherm en geen vinkje "klant niet mailen"; een typefout in kenteken of datum bereikt de klant dus zonder controle, en de beheerder ziet het niet terug omdat het e-maillogboek in Communicatie nepgegevens toont (module 13). Ernst: **Middel**.
10. **De instelling voor administratiekosten ontbreekt in de interface.** `fineAdminFee` (server/services/portal-config.ts) bepaalt de kosten die elk nieuw bekeuringsformulier stil invult, maar App-instellingen > Klantenportaal toont wel adres, openingstijden en privacylink, niet dit bedrag. Ernst: **Laag/Middel**.

### UX-opmerkingen
- Het detaildialoog toont alleen "Bedrag" en nergens administratiekosten of totaal, terwijl de lijst wel het totaal toont (95,00 of 107,50 voor dezelfde overtreding zonder uitleg). Een regel "Administratiekosten" en "Totaal" is nodig.
- Doorbelasten (aan de klant factureren) en betaald markeren ontbreken als werkstroom; nu is de bekeuring na koppelen niet verder te brengen.
- Bekeuringen zijn alleen via het Klantenportaal-scherm of het voertuig te vinden; "Boetes" in de zijbalk of onder Kosten zou sneller zijn voor een medewerker die een brief van het CJIB heeft liggen.
- De prullenbak bevat 30 oude "Annuleertest"-boetes die al zijn teruggezet en nog steeds een knop Terugzetten hebben (ook gezien bij Voertuigen, module 3);.
- De klantkiezer (zoeken, "8 van 301 getoond, typ om te verfijnen") werkt goed, maar de keuzeregels hebben geen toegankelijke naam (schermlezer leest "optie").
- Na een hot-reload toonde de knop "Prullenbak" kort de ruwe vertaalsleutel "admin.fines.bin.button"; direct daarna weer "Prullenbak". Waarschijnlijk veroorzaakt door het bouwen aan deelproject C (prullenbakken per soort); niet als bevinding geteld.
- "Brieven scannen" en "Nieuwe bekeuring" bevatten allebei een brief-uploadveld; de twee routes (direct scannen of eerst invullen) zijn niet duidelijk uit elkaar te houden.
- In het CJIB-dialoog staat "Automatisch ophalen uit" zonder vervolg (de postbus-instelling is hier leeg), dus een afgebroken zin.

---

## Module 13 — Communicatie (meldingen versturen, sjablonen, e-maillogboek, analyse)

### Getest
- Pagina /communications (4 hoofdtabs: Meldingen versturen, Sjabloonbouwer, E-maillogboek, Analyse; onder Meldingen versturen 3 subtabs: APK-herinneringen, Onderhoud, Aangepast bericht).
- APK-herinneringen: sjabloonkeuze, voertuig aanklikken, "Voorvertonen & versturen naar N voertuigen" (voorvertoning geopend, geannuleerd, niets verstuurd).
- Onderhoud en Aangepast bericht: lijsten gelezen, klantzoeker, voertuigkiezer, onderwerp en bericht, "Voorvertonen & versturen" zonder ontvangers, met ontvanger.
- Echt verzenden uitsluitend naar het testadres audit@e2e.invalid (klant "Audit Testklant B.v.", POST /api/notifications/send); de overige klanten hebben adressen op example.com en zijn niet gebruikt.
- Sjabloonbouwer: leeg opslaan, nieuw sjabloon "AUDIT sjabloon" met placeholders, live voorvertoning, Opslaan, Voorvertoning van een opgeslagen sjabloon, Bewerken, Bijwerken, Dupliceren, Verwijderen (annuleren en bevestigen). Het testsjabloon is daarna verwijderd.
- E-maillogboek en Analyse gelezen en vergeleken met /api/email-logs.

### Werkt
- De pagina laadt (eerste keer in de dev-server 8 tot 15 seconden zonder laadindicator) en toont 301 klanten.
- Het verzenden-dialoog is bruikbaar: knop is uitgeschakeld tot er een ontvanger (en een sjabloon of tekst) is; voorvertoning toont ontvangers met hun e-mailadres, het te gebruiken adres per ontvanger en "Annuleren" sluit netjes zonder iets te versturen.
- Klantzoeker ("Audit" vindt direct de klant met adres) en voertuigkiezer werken; selecties tellen mee ("1 klant(en) + 1 voertuig(en) geselecteerd").
- Sjabloonbouwer: validatie bij leeg opslaan (toast "Ontbrekende informatie — Vul alle sjabloonvelden in"); Opslaan geeft POST 201 en toast "Sjabloon aangemaakt"; Bijwerken geeft PUT 200 en "Sjabloon bijgewerkt"; Verwijderen toont een eigen bevestigingsdialoog ("Weet je zeker dat je ... wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.") en geeft DELETE 200 plus toast; Annuleren laat het sjabloon staan.
- Live voorvertoning in de bouwer vervangt placeholders door voorbeeldgegevens (voorbeeldklant, kenteken, merk), dus de bouwer zelf is goed te controleren.
- Een sjabloon met {customerName} wordt in de voorvertoning van het verzenden-dialoog voor de klant ingevuld ("Beste Audit Testklant B.v.").

### Werkt niet
1. **E-maillogboek en Analyse tonen verzonnen gegevens in plaats van de echte verzendgeschiedenis.** Stappen: tab E-maillogboek openen. Verwacht: de werkelijk verstuurde en mislukte e-mails. Werkelijk: drie vaste regels uit maart 2024 ("APK Reminder - Inspection due soon", 12 verstuurd, 100%; "Scheduled maintenance reminder", 7 verstuurd, 1 mislukt; "Important vehicle recall notice", 25 verstuurd) en op Analyse vaste totalen (44 verstuurd, 1 mislukt, 3 campagnes, 15 actieve klanten). De regels staan hard in de code (client/src/pages/CustomerCommunications.tsx regel 197, commentaar "Mock notification history for now - will be replaced with real data"); de echte log (GET /api/email-logs, 200) wordt opgehaald maar nergens getoond. Mijn eigen mislukte testmail (log-id 6 en 7) is dus nergens in de interface terug te vinden. De eigenaar ziet nu nooit welke e-mails mislukken. Ernst: **Hoog** (valse gegevens als echt gepresenteerd).
2. **Een volledig mislukte verzending krijgt een succesmelding.** Stappen: bericht naar audit@e2e.invalid versturen (lokaal is er geen e-mailconfiguratie). Verwacht: foutmelding. Werkelijk: POST /api/notifications/send geeft 200 en de toast luidt "Meldingen succesvol verstuurd — 0 e-mails verstuurd, 1 mislukt"; het dialoog sluit. De log bewaart de reden alleen in het Engels ("No valid email configuration for purpose: custom", "Failed to send to ... for customer ..."). Ernst: **Middel**.
3. **De voorvertoning is geen voorvertoning.** Zonder sjabloon toont het dialoog het onderwerp en de tekst zoals getypt, met ongewijzigde placeholders; bij de portaalsjablonen zelfs de HTML-bron (`<p>Beste {{name}},</p> ...`). Met een eigen sjabloon wordt {customerName} wel ingevuld maar blijft {vehiclePlate} staan als "[Kenteken]" en {vehicleBrand} als "[Merk]", ook nadat een voertuig is aangevinkt (ontvangerregel zegt "N/A"), terwijl het dialoog belooft dat "elke ontvanger een gepersonaliseerde versie" krijgt. De eigenaar kan dus niet zien wat een klant straks ontvangt. Ernst: **Middel**.
4. **Na opslaan, bijwerken of verwijderen van een sjabloon blijft de lijst "Opgeslagen sjablonen" oud.** Stappen: sjabloon opslaan. Werkelijk: toast "Sjabloon aangemaakt", POST 201 en daarna een GET, maar de lijst telt nog 11 (API: 12); na bijwerken blijft de oude naam staan en na verwijderen blijft het sjabloon zichtbaar (lijst 12, API 11). Pas een volledige herlaadbeurt toont de waarheid. De pagina heeft geen enkele invalidatie van de sjabloonlijst. Dubbel opslaan ligt voor de hand. Ernst: **Middel**.
5. **De sjabloonkiezers bij APK en Onderhoud bieden alle sjablonen aan, met ruwe sleutels.** In lvstest zijn er alleen elf portaalsjablonen; de keuzelijst bij "Selecteer een APK-herinneringssjabloon" toont daarom "portal_invite, portal_password_reset, portal_staff_notification ..." (Engelse technische namen) en geen enkel APK-sjabloon. De pagina filtert niet op categorie (apk / onderhoud / aangepast / portaal), zodat een medewerker een portaaluitnodiging als APK-herinnering kan versturen. Ernst: **Laag/Middel**.
6. **Twee placeholderstijlen door elkaar.** De bouwer biedt {customerName}, {vehiclePlate}, {apkDate} enzovoort aan (server/routes/notifications.ts regel 24 vervangt alleen die vorm); de portaalsjablonen gebruiken {{name}}, {{link}}, {{plate}}. Kiest een medewerker een portaalsjabloon in een gewone melding, dan gaan de dubbele accolades ongewijzigd naar de klant (zie ook bevinding 3, waar {{name}} onvervangen in de voorvertoning staat). Ernst: **Middel**.
7. **Bewerken en Dupliceren laden het sjabloon in een formulier dat buiten beeld staat.** Na de klik (op de kaart onderaan de pagina) verschijnt alleen een toast; het formulier staat bovenaan, de pagina blijft 1.631 pixels naar beneden gescrold. Gebruikers klikken dan nog eens of denken dat er niets gebeurd is. De kopie heet "... (Copy)" (Engels) en de toast zegt "Sjabloonhoud is gekopieerd naar de editor" (typfout, bedoeld: Sjablooninhoud). Ernst: **Laag**.
8. **Engelstalige of verzonnen voorbeeldtekst.** De voorvertoning van een opgeslagen sjabloon toont "Van: Car Rental System" en "Aan: customer@example.com"; de live voorvertoning gebruikt "John Doe, Toyota Camry, Car Rental System". Ernst: **Laag**.
9. **Meervoudsfouten en wisselende teller.** "naar 1 voertuigen", "naar 1 ontvangers", "1 klant(en) + 1 voertuig(en)"; de kop "301 klanten • N voertuigen met reserveringen" verandert per subtab (8, 11, 15) zonder uitleg. Ernst: **Laag**.

### UX-opmerkingen
- De knop heet "Voorvertonen & versturen" en is uitgeschakeld zonder uitleg waarom (geen ontvangers, geen sjabloon); een regel "Kies minstens één ontvanger" ontbreekt.
- Eerste keer openen duurt tot 15 seconden zonder laadindicator (grote pagina van 2.300 regels); in productie waarschijnlijk korter.
- De klantkiezer toont alle 301 klanten in één lange lijst met een knop "Alle" (niet geklikt); een waarschuwing "u verstuurt aan 301 klanten" is niet gezien.
- Het per ontvanger te kiezen e-mailadres (Primair) in de voorvertoning is een goed idee; hoeveel adressen een klant heeft is hier niet zichtbaar.
- Er is geen manier om een verzonden e-mail te openen of opnieuw te sturen vanuit het logboek (dat toch de echte log niet toont, zie bevinding 1).
- Niet getest: een echte e-mail verzenden (geen SMTP lokaal), de knop "Alle", filteren van de klantenlijst op "met/zonder reserveringen" en het versturen van APK-herinneringen aan echte klanten.

---

## Module 14 — Rapporten (standaardrapporten, rapportbouwer, export)

### Getest
- Pagina /reports: vijf knoppen rechtsboven (APK, Garantie, Kosten, Benutting, Klanten), zeven tabs (Operaties, Kosten, Voertuigen, Klanten, Transporten, Financieel, Fiscaal), filters (datumvoorinstellingen "Alle gegevens", "Deze maand", "Volgende maand", Kostencategorie, Voertuig, "Filters herstellen").
- Alle vijf afdrukrapporten laten genereren (zie opmerking over afdrukken hieronder) en de inhoud vastgelegd.
- Aangepaste rapportbouwer: kolommen toevoegen, filter toevoegen (Merk = TOYOTA), Rapport uitvoeren, Opslaan, tabblad Opgeslagen rapporten, Uitvoeren van het opgeslagen rapport, Verwijderen. Het testrapport "AUDIT Toyota-lijst" is daarna verwijderd.
- Analyse onderhoudskosten (vier tabs), de Fiscale maandrapportage met CSV-download (via een directe aanroep van /api/fiscal/reports/monthly.csv).
- Controle van de cijfers: totaal Kosten (€ 89.165,54) is gelijk aan de som van alle categorieën plus de AUDIT-kostenpost; Financieel: omzet € 238.641,00 min kosten € 89.165,54 = marge € 149.475,46 (63%) klopt; per voertuig klopt omzet min kosten = marge en omzet / huurdagen = "per huurdag".

### Werkt
- Alle tabs laden binnen enkele seconden zonder foutmelding; filters "Alle gegevens" (1 jan 2000 tot 31 dec 2050), "Volgende maand" (1 tot 30 november 2026) en "Filters herstellen" werken; het categoriefilter "Onderhoud" geeft het juiste totaal (€ 11.192,10, 52 posten).
- De vijf afdrukrapporten leveren een volledig document: APK-vervalrapport (48 verlopen, 2 binnen 30 dagen, 8 binnen 2-3 maanden, per voertuig met aantal dagen), Garantievervalrapport (97 voertuigen zonder garantiedatum), Kostenrapport (categorie Brandstof, 1 post € 25,50, detailregel AUDIT1), Voertuigbenuttingsrapport (17% over 56 voertuigen, 98 reserveringen, 511 gereserveerde dagen) en Klantimpactanalyse; getallen komen overeen met het scherm.
- Rapportbouwer: POST /api/reports/execute geeft 200, toast "Rapport succesvol uitgevoerd — 97 resultaten gevonden" (zonder filter) en 12 Toyota's met het filter; Opslaan geeft 200 en de toast "Rapport succesvol opgeslagen"; het opgeslagen rapport toont "3 kolommen, 1 filter" en voert opnieuw uit met hetzelfde resultaat (12).
- Fiscaal-tab: standaardjaar 2027, filter Jaar en Klant, CSV levert 200 (text/csv, bestand fiscaal-2026.csv en fiscaal-2027.csv) met Nederlandse komma's ("0,00") en de waarschuwing "geen fiscaal advies"; geen beoordeelde perioden, dus alleen nulregels.

### Werkt niet
1. **Het resultaat van de rapportbouwer is niet te exporteren of af te drukken.** Stappen: rapport uitvoeren. Verwacht: knoppen voor CSV/Excel of PDF. Werkelijk: het resultatendialoog heeft alleen "Sluiten"; er is geen export, geen afdrukken, geen kopiëren. Alleen de vaste rapporten hebben "Afdrukken" en alleen de fiscale tab een CSV. Een rapportbouwer zonder uitvoer is nauwelijks bruikbaar voor de administratie. Ernst: **Middel**.
2. **"Analyse onderhoudskosten" telt alle kosten als onderhoud.** Totale kosten € 89.165,54 "over 94 voertuigen" is het totaal van alle kostencategorieën (tol, brandstof, verzekering, parkeren, schoonmaak enzovoort), terwijl onderhoud alleen € 11.192,10 is. De categorielijst toont ruwe Engelse sleutels ("Fuel", "fuel", "cleaning", "toll", "insurance", "maintenance", "tires", "other", "parking") met "Fuel" en "fuel" als twee regels. "Kosten per km € 0,01" is voor een verhuurvloot niet geloofwaardig (waarschijnlijk gedeeld door de som van alle kilometertellers; niet nagerekend). De tab Merkvergelijking geeft "Efficiëntiebeoordeling: Uitstekend" aan merk "AUDIT" met één kostenpost van € 25,50. Ernst: **Middel**.
3. **Dubbele regel "Brandstof" in het kostenoverzicht (gevolg van module 9).** Op tab Kosten staan "Brandstof 53 items € 14.727,77" en "Brandstof 1 items € 25,50" apart (categoriesleutels "fuel" en "Fuel"); ook in Kosten per categorie en in de grafiek. Ernst: **Middel** (herhaling van een bevinding uit module 9, nu zichtbaar in de rapporten).
4. **Het categoriefilter en de kostentrends kloppen niet met de gebruikte categorieën.** Het filter "Kostencategorie" biedt alleen Onderhoud, Banden, Voorruit, Schade, Reparatie en Overig aan; de categorieën die in de data voorkomen (Tol, Brandstof, Verzekering, Parkeren, Schoonmaak) kun je niet kiezen. Met "Onderhoud" geselecteerd toont "Kostentrends" nog steeds de totalen van alle categorieën (okt 2026 € 25,50, een brandstofpost). Ernst: **Laag/Middel**.
5. **Op tab Klanten blijven de kosten per categorie leeg.** "Klantimpactanalyse" toont bij klant 89 B.V. € 732,88 aan kosten, maar "Kostencategorieën per klant" toont alleen streepjes: de kolommen (Banden, Onderhoud, Schade, Reparatie, Overig) dekken de gebruikte categorieën niet. "Recente klantreserveringen" toont statussen in het Engels ("Completed", "Booked", "Picked Up") en toont als "recent" boekingen in november 2026 (de toekomst). Het label "Laag/Gemiddeld" staat zonder scheiding achter het bedrag ("€ 28,19Laag"). Ernst: **Laag/Middel**.
6. **De rapportbouwer is Engelstalig.** Gegevensbronnen "Vehicles, Customers, Reservations, Expenses, Drivers"; veldnamen "License Plate, Brand, Vehicle Type, Fuel Type, Monthly Price, Daily Price, Current Mileage, APK Date, Warranty End Date, Maintenance Status, Has GPS"; operatoren "equals, not equals, contains, starts with, ends with, is null"; het opgeslagen rapport noemt als bron "vehicles". Ernst: **Laag**.
7. **Een opgeslagen rapport verwijderen kan met één klik zonder bevestiging.** Het prullenbakpictogram naast "Uitvoeren" heeft geen tekst of tooltip, verwijdert direct (toast "Rapport verwijderd") en het rapport is niet terug te zetten. Ernst: **Laag/Middel**.
8. **Kleine inconsistenties in de getallen.** De noemers wisselen: "Voor 97 actieve voertuigen", "Gebaseerd op jaarlijkse benutting van 96 voertuigen", "Voor 56 actieve voertuigen", "Voor 38 actieve voertuigen" naargelang de periode (gemiddelde kosten per voertuig delen dus niet door de hele vloot); de kostentrend toont "+100%" als de vorige maand € 0 was; maandnamen in Trends zijn Engels ("May 2026"); de afdrukrapporten tonen "09/10/2026 20:27" terwijl de app elders "9 oktober 2026" gebruikt; de afdruk van het klantimpactrapport bevat alle 301 klanten ook met 0 reserveringen. Ernst: **Laag**.

### UX-opmerkingen
- De knop "Afdrukken" toont in deze ingebouwde browser geen afdrukvoorbeeld: een eerste klik legde het tabblad stil, waarna ik het tabblad moest sluiten en opnieuw openen (de pagina bleef daarna goed werken). Dat ligt aan de printdialoog van de ingebouwde browser, niet aan de app; om de inhoud toch te beoordelen heb ik het document laten opbouwen met de printaanroep onderschept.
- De vijf knoppen rechtsboven (APK, Garantie, Kosten, Benutting, Klanten) hebben alleen een pictogram met kort woord en geen uitleg dat ze afdrukken starten; "Afdrukken" zou erbij mogen staan.
- Bij het wisselen van periode of filter is er geen laadindicator (de cijfers verversen na ongeveer 2 tot 3 seconden).
- Het rapportfilter "Voertuig" biedt eerst typefilters (SUV, Sedan, Van, ...) en daaronder een lange lijst met zoekveld; met kenteken zoeken zou direct moeten kunnen.
- Positief: de cijfers in het financiële overzicht (omzet, kosten, marge, per huurdag) en de somcontrole van de kosten kloppen, en het rapport "Fiscaal" vermeldt bij elke uitvoer dat het geen fiscaal advies is.
- Niet getest: een rapport bewerken ("Bewerken" in Opgeslagen rapporten), datumbereik via de kalender (alleen de voorinstellingen), rapporten met een ander account dan e2e-admin (zie de rechtenronde).

---

## Module 15 — Portaalbeheer (accounts, aanvragen, voertuigen online, blacklist, activiteit)

> Dit is het scherm "Klantenportaal" (/portal-admin) met acht tegels. De bekeuringen daarin staan in module 12, de Fiscale check in module 16. De klantkant (/portaal) is niet doorgelopen: er is geen bekend portaalwachtwoord en uitnodigingsmails kunnen lokaal niet vertrekken.

### Getest
- Dashboard: tegels Aanvragen, Onderhoud, Bekeuringen, Klanten, Accounts, Voertuigen online, Blacklist en Activiteit, de panelen "Aandacht nodig", "Meldingen", "Aankomende reserveringen" en "Klanten" (alleen gelezen, "Alles gelezen" bewust niet geklikt).
- Aanvragen: lijst met filters Status en Type, detail van een afgehandelde aanvraag (#11).
- Accounts: lijst, Uitnodigen (leeg formulier, zonder klant, met klant "Audit Testklant B.v." en adres audit-portal@e2e.invalid), rijmenu (Bewerken en rechten, Uitnodiging opnieuw sturen, Blokkeren/Deblokkeren, Verwijderen), Annuleren in het rechtendialoog. Het testaccount "AUDIT Portaalgebruiker" is daarna verwijderd. Het bestaande account "kees" (keeslam@live.nl, uitnodiging verlopen) is niet aangeraakt: een echt adres.
- Voertuigen online: lijst van 97 voertuigen, schakelaar "Online aangeboden" aan en uit op AUDIT1.
- Blacklist: blokkade toevoegen (AUDIT2 en Audit Testklant, reden "AUDIT blokkadetest") en opheffen.
- Activiteit, Klanten-overzicht, Onderhoud-aanvragen, Aandacht-nodig-lijst, Meldingenlijst, App-instellingen > Klantenportaal (alleen gelezen; "Verbinding testen" is met lege host uitgeschakeld).
- Behandeling van twee aanvragen: ik heb in de database twee eigen aanvragen voor Audit Testklant ingevoegd (#577 type Overig en #578 Huuraanvraag voor AUDIT1, zonder portaalgebruiker, omdat de klantkant niet te gebruiken was); de afhandeling is daarna volledig via het scherm gedaan.

### Werkt
- Tegels en panelen tonen de juiste aantallen (bijvoorbeeld "Voertuigen online 4" stijgt naar 5 als ik AUDIT1 aanzet en daalt terug na uitzetten; API en tegel kloppen).
- Aanvragen: de afgehandelde aanvraag toont type, klant, verzoek, bericht en berichtgeschiedenis. Voor #577 (Overig): "Versturen" stuurt een bericht ("Lam Groep (e2e-admin)" in de draad) en zet de status automatisch op In behandeling; "Beantwoorden en afhandelen" zonder tekst geeft "Vul een antwoord in."; met tekst staat de aanvraag op Afgehandeld, toast "Antwoord verstuurd."
- Voor #578 (Huuraanvraag): de uitleg "Een huuraanvraag wordt pas afgehandeld via Goedkeuren: reservering aanmaken of Afwijzen" is duidelijk. Het formulier "Reservering aanmaken uit deze aanvraag" waarschuwt dat het gevraagde voertuig (AUDIT1, status Reparatie nodig) niet meer verhuurbaar is en laat een ander voertuig zoeken ("AUDIT2 — Vrij"). Goedkeuren maakte reservering #3203 (3 t/m 5 november 2026, Geboekt) aan en opende die direct; toast "Reservering #3203 aangemaakt; de klant is geïnformeerd."
- Account uitnodigen: de browser eist e-mailadres en naam, de app zegt "Kies eerst een klant" zonder verzoek; met klant volgt een eerlijke melding "Account aangemaakt, maar de e-mail kon niet worden verstuurd. Controleer de e-mailinstellingen en stuur de uitnodiging opnieuw." en staat het account als "Uitnodiging open". Het rechtendialoog toont acht rechten per account ("Mag online huren (aanvraag)", "Ziet bekeuringen", "Ziet prijzen" enzovoort) met de uitleg dat de klantinstellingen de bovengrens zijn.
- Blacklist: Blokkade toevoegen (toast "Blokkade toegevoegd."), en Blokkade opheffen vraagt eerst een eigen bevestigingsdialoog ("Audit Testklant B.v. kan Unknown Unknown (AUDIT2) daarna weer zien en aanvragen in het portaal.") en geeft "Blokkade opgeheven."
- Rechten: als medewerker-sessie geeft /api/portal/me 401 "PORTAL_NOT_AUTHENTICATED": medewerkers- en klantsessies zijn gescheiden.

### Werkt niet
1. **"Uitnodiging opnieuw sturen" meldt succes terwijl de e-mail niet verstuurd is.** Stappen: rijmenu van het testaccount, Uitnodiging opnieuw sturen (adres audit-portal@e2e.invalid, lokaal geen e-mailconfiguratie). Verwacht: dezelfde foutmelding als bij het eerste uitnodigen. Werkelijk: POST /api/portal-admin/accounts/934/invite geeft 200 en de toast "E-mail verstuurd."; de e-maillog (id 9) zegt "failed — No valid email configuration for purpose: custom". De beheerder gelooft dat de klant een uitnodiging heeft. Het eerste uitnodigen (log 8) meldde de mislukking wel correct. Ernst: **Middel**.
2. **De klantnaam blijft leeg in het Klanten-overzicht** (en in de bekeuringenlijst, module 12): "Audit Testklant B.v." verschijnt als lege regel met "Aan 0/0 accounts". Oorzaak: lege bedrijfsnaam wordt als "" opgeslagen en `coalesce(companyName, name)` (server/services/portal-dashboard.ts regel 43) valt niet terug op de naam. Ernst: **Middel** (zelfde oorzaak als module 12, bevinding 2).
3. **Het dashboard laat een voertuig online aanbieden dat niet verhuurbaar is en toont ruwe statussen.** "Voertuigen online" toont de interne waarden "rented", "available", "needs_fixing" (Engels) en laat AUDIT1 (needs_fixing) zonder waarschuwing online zetten; de schakelaar bewaart stil (geen toast). Pas bij het goedkeuren van een huuraanvraag waarschuwt de app dat het voertuig niet verhuurbaar is. Ernst: **Laag/Middel**.
4. **Blokkeren van een account en verwijderen van een niet geactiveerd account zijn onopvallend.** Blokkeren is één klik zonder bevestiging of melding (alleen de status verandert naar Geblokkeerd, en "Uitnodiging opnieuw sturen" blijft ook bij een geblokkeerd account mogelijk); verwijderen gebruikt een native browservenster ("Dit account is nog niet geactiveerd en wordt definitief verwijderd. Doorgaan?") en geeft daarna geen toast. De blacklist gebruikt wel een mooi eigen bevestigingsdialoog; de accountacties niet. Ernst: **Laag**.
5. **Activiteit en Meldingen tonen technische codes.** Acties als "login", "request_replied", "request_submitted", "fine_letter_downloaded", "company_emails_updated" en details als `{"by":"admin","status":"done"}`; de melding "heeft via het portaal bijgewerkt: emailForMOT, emailForInvoices, emailGeneral" noemt veldnamen. De lijst Meldingen bevat 34 keer dezelfde testmelding ("__portal_test__Auth BV"), wat de echte meldingen bedekt. Ernst: **Laag**.
6. **Tijden in twee lijsten van hetzelfde scherm verschillen twee uur.** Dezelfde login van "Portaal Tester" staat in Accounts als 16-9-2026 20:26:40 en in Activiteit als 22:26:40; mijn eigen aanvraag toont 20:41 terwijl een bekeuring van dezelfde minuut twee uur eerder werd getoond (zie module 12, bevinding 4: kolommen met en zonder tijdzone in de lokale database). Ernst: **Laag/Middel** (lokaal bewezen).
7. **Kleine taal- en bedieningsfouten.** Aanvraagdetail toont "Gevraagde nieuwe einddatum 2026-10-15" en "Vanaf 2026-11-03" (ISO-notatie) naast "6-9-2026, 17:08:23" in de lijst; "Onderwerp" staat als label zonder inhoud bij aanvraag #577; er zijn twee knoppen voor een antwoord zonder afhandelen ("Versturen" bovenaan en "Antwoord sturen (blijft open)" onderaan); de rijmenuknoppen en de pictogrammen in de accounttabel hebben geen toegankelijke naam. In App-instellingen is bij het CJIB-formulier "Automatisch ophalen" aan terwijl de host leeg is en "Verbinding testen" uitgeschakeld zonder uitleg. Ernst: **Laag**.

### UX-opmerkingen
- Het scherm is een goede centrale plek (tegels, aandachtspunten, meldingen) en elke lijst opent als dialoog zonder paginawissel; de uitleg bij het rechtendialoog en de blacklist is duidelijk.
- Een aanvraag afhandelen kost vier handelingen (openen, tekst, knop, sluiten); goed zou zijn een standaardantwoord per type ("Goedgekeurd", "Afgewezen").
- Niet getest: de klantkant van het portaal, "Alles gelezen", Afwijzen van een aanvraag, aanvraagtypen anders dan Overig en Huur, CJIB "Nu ophalen" en uploaden, activeren van een uitnodiging.

---

## Module 16 — Fiscaal (pseudo-eindheffing: overzicht, configuratie, beoordelingen, voertuigprofiel, klantinstellingen)

> De fiscale mobiliteitscheck zit op vijf plekken: de knop "Fiscale check" op het Klantenportaal-scherm (overzicht), App-instellingen > Klantenportaal (configuratie, beoordelingswachtrij, auditlog), de tab Fiscaal in het voertuigdetail (profiel), de portaalinstellingen per klant, en de tab Fiscaal in Rapporten (module 14). Er zijn geen berekeningen om te beoordelen: er staat nog geen gepubliceerde regelversie en de wet geldt pas vanaf 1 januari 2027.

### Getest
- Overzicht "Fiscale check: overzicht" (tegels per beoordelingsstatus).
- App-instellingen > Klantenportaal > Fiscale mobiliteitscheck: tabs Configuratie, Beoordelingen, Auditlog; de versie "Belastingplan 2026 (wet) — concept, te verifiëren (versie 1)" geopend (alleen lezen), "Impact tonen"; een eigen concept "AUDIT concept" aangemaakt (versie 2), "Indienen ter beoordeling" (validatie), "Archiveren".
- Voertuigdetail AUDIT2, tab Fiscaal: handmatige catalogusprijs (ongeldige en geldige waarde, met reden) en "RDW opnieuw ophalen".
- Klantdetail Audit Testklant, tab Portaal: de zeven fiscale schakelaars (één aan, opgeslagen, weer uit en opgeslagen).
- Tab Fiscaal in Rapporten en de CSV (zie module 14).
- Niet getest (bewuste stoppunten): een versie publiceren of goedkeuren, een versie indienen met volledige gegevens, beoordelingszaken afhandelen en wat een klant of bestuurder in het portaal ziet (klantkant niet beschikbaar).

### Werkt
- Het overzicht legt uit waarom het leeg is: "Geen regelversie beschikbaar: er is nog geen gepubliceerde versie die vandaag geldt. Beoordelingen blijven leeg tot een bevoegde medewerker een versie publiceert." en toont negen tellers (Niet van toepassing, Mogelijk van toepassing, Van toepassing, Handmatige beoordeling nodig, Gegevens ontbreken, Configuratie ongeldig, Geen regelversie beschikbaar, Open perioden, Nog niet beoordeeld) alle op 0, met de vermelding "geen fiscaal advies en geen aangifte".
- Configuratie: de versie toont reden, bron, wettelijke referentie en per parameter een label WETTELIJK of INTERN met eenheid en uitleg in begrijpelijk Nederlands (bijvoorbeeld "Vul een procent in: 12 betekent 12 %, niet 0,12"). Een concept wordt "pas geldig na indienen, goedkeuren en publiceren" (uitleg in het dialoog "Nieuw concept").
- "Impact tonen" geeft direct een impactrapport (Huidig totaal, Totaal met concept, Verschil, Jaarimpact, Maandimpact, Handmatige beoordeling, Gegevens ontbreken; venster 1 januari 2027 t/m 1 januari 2028) en schrijft een regel "Impactvoorbeeld" in de auditlog.
- "Concept aanmaken" is uitgeschakeld tot titel en toelichting zijn ingevuld; aanmaken geeft POST 201 en opent versie 2; "Indienen ter beoordeling" met een leeg concept wordt tegengehouden (POST 400) met "Regelversie is niet compleet" en per ontbrekende parameter een melding; Archiveren zet de versie op Gearchiveerd (POST 200) met de tekst dat die niet meer te wijzigen is.
- Voertuigprofiel: zes feiten (catalogusprijs, waarde economisch verkeer, datum eerste toelating, brandstofklasse, voertuigcategorie, handgeschakelde lesauto) met herkomst ("handmatig", "voertuigrecord", "onbekend"); een handmatige waarde vraagt een reden. "abc" geeft de inline fout "Ongeldig bedrag"; 25000 wordt opgeslagen en getoond als "€ 25.000,00 — handmatig" met de toast "Waarde opgeslagen; open perioden worden opnieuw beoordeeld."
- Klantinstellingen: zeven aparte schakelaars (Fiscale check actief, Pseudo-eindheffing beoordelen, Ziet fiscale bedragen (schatting), Ontvangt fiscale waarschuwingen, Ziet fiscale rapporten, Bestuurders zien hun eigen fiscale status), standaard allemaal uit; opslaan geeft PATCH 200.
- Auditlog: "Alleen toevoegen; niets kan worden gewijzigd of verwijderd." met tijd, wie, actie, wat, was → wordt, reden; mijn handelingen staan erin.

### Werkt niet
1. **De validatie van een onvolledige regelversie toont technische sleutels.** Na "Indienen ter beoordeling" staat onderaan "Regelversie is niet compleet (submit)" gevolgd door zestien regels als "KM_THRESHOLD_APPLIES: verplichte waarde ontbreekt" en "TRANSITION_EXEMPT_UNTIL: verplichte waarde ontbreekt", terwijl de parameters bovenin wel Nederlandse namen hebben ("Kilometergrens van toepassing"). Ook de geschiedenis van een versie toont regels als "ROUNDING_MODE — → half_up_cents" en "REPLACEMENT_VEHICLE_EXEMPTION_REASONS — → maintenance,repair,accident,tyre_change". Ernst: **Laag**.
2. **Archiveren is onomkeerbaar en gebruikt een native bevestigingsvenster.** De eerste klik op "Archiveren" deed niets zichtbaars (het browserbevestigingsvenster werd in de ingebouwde browser niet getoond); pas na het onderscheppen van het venster ("Deze versie archiveren?") werd de versie gearchiveerd. In andere onderdelen van dezelfde sectie (Nieuw concept) gebruikt de app wel een eigen dialoog. Ernst: **Laag**.
3. **De auditlog is niet te filteren en wordt overspoeld.** De lijst toont de laatste 200 regels, waarvan bijna alles "Profiel ververst — fiscal_profile #n" door het systeem (90 regels op één dag), met in de kolom Wat de ruwe sleutel "fiscal_profile #95" zonder kenteken. Een filter op actie of voertuig ontbreekt. Ernst: **Laag**.
4. **Een mislukte RDW-ophaling meldt "RDW API request timed out".** Stappen: voertuigdetail AUDIT2, tab Fiscaal, "RDW opnieuw ophalen". Werkelijk: toast "RDW-ophaling mislukt: RDW API request timed out" en onder het blok "Laatste RDW-fout: RDW API request timed out" (Engels); de app zegt niet of het kenteken onbekend is of de dienst onbereikbaar. Ernst: **Laag** (in deze omgeving was de RDW niet bereikbaar).
5. **Opslaan van de fiscale klantinstellingen geeft geen bevestiging.** Schakelaar aan, Opslaan: PATCH 200 maar geen toast en het scherm blijft ongewijzigd; de beheerder kan niet zien dat het gelukt is. Ernst: **Laag**.

### UX-opmerkingen
- De sectie is zorgvuldig ontworpen (labels WETTELIJK/INTERN, "geen fiscaal advies", audit, stappen indienen-goedkeuren-publiceren); het enige echte nadeel is de verspreiding over vijf schermen zonder één startpunt: een beheerder die "fiscaal" zoekt, vindt het in een dialoog binnen een tab van de App-instellingen.
- De zeven schakelaars per klant zijn onafhankelijk van elkaar; een combinatie als "Ziet fiscale rapporten" aan terwijl "Fiscale check actief" uit staat is mogelijk (niet getest wat de klant dan ziet).
- De rapport-tab Fiscaal staat standaard op 2027 (het eerste jaar met een heffing); in 2026 is de lijst dus leeg zonder dat dat wordt uitgelegd behalve "Geen beoordeelde perioden in dit jaar".
- Testrecords: concept "AUDIT concept" (versie 2, status Gearchiveerd), handmatige catalogusprijs € 25.000 op AUDIT2, regels in de fiscale auditlog.

---

## Rechtenronde bij de modules 13 tot en met 16 (e2e-accountant, e2e-reports-only, e2e-notifications-only)

### Getest
Ingelogd als drie beperkte testaccounts en gekeken wat zij zien en kunnen: e2e-accountant (o.a. Boetes bekijken, Fiscale check bekijken, Rapporten beheren), e2e-reports-only (alleen Rapporten bekijken) en e2e-notifications-only (alleen Meldingen beheren). Niet getest: e2e-templates-only en e2e-manager. Daarna is uitgelogd.

### Werkt
- De meldingen zijn duidelijk en noemen het ontbrekende recht in het Nederlands: "U heeft geen toegang tot dit scherm. Hiervoor is het recht 'Klantportaal bekijken' of 'Klantportaal beheren' nodig." en in een rapportblok "Geen toegang tot deze gegevens (recht 'Voertuigen bekijken')".
- e2e-reports-only ziet alleen Dashboard en Rapporten in de zijbalk; de tab Fiscaal van Rapporten ontbreekt (geen recht Fiscale check bekijken), de overige zes tabs laden (inclusief Financieel). e2e-accountant ziet alle zeven tabs, inclusief Fiscaal, en alle rapportaanroepen geven 200.
- e2e-notifications-only mag de pagina Communicatie openen; de Sjabloonbouwer is zichtbaar maar "Sjabloon opslaan" is uitgeschakeld en GET /api/email-templates geeft 403: de server en de interface zijn het eens.

### Werkt niet
1. **De rechten "Boetes bekijken" en "Fiscale check bekijken" hebben geen eigen ingang.** Het bekeuringenoverzicht en het fiscale overzicht bestaan alleen op het scherm Klantenportaal (/portal-admin), dat het recht "Klantportaal bekijken of beheren" vraagt. e2e-accountant heeft Boetes bekijken en Fiscale check bekijken maar geen Klantportaal in de zijbalk en krijgt bij /portal-admin het scherm "geen toegang". Wie alleen die twee rechten krijgt, kan er dus niets mee (de bekeuringen staan wel bij het voertuig en bij de klant, niet getest voor dit account). Ernst: **Middel** (rechtenmodel en schermen sluiten niet op elkaar aan).
2. **"Meldingen beheren" en "Rapporten bekijken" werken niet zonder andere rechten.** e2e-notifications-only opent Communicatie en ziet "0 klanten • 0 voertuigen met reserveringen" met "Geen toegang tot deze gegevens (recht 'Voertuigen bekijken')": er is geen ontvanger te kiezen, dus de pagina is onbruikbaar. e2e-reports-only ziet bij Operaties twee blokken met "Geen toegang" (Voertuigen en Reserveringen bekijken), terwijl Financieel wel kentekens en omzet per voertuig toont; de knoppen APK, Garantie, Kosten, Benutting en Klanten blijven actief zonder gegevens. In Gebruikersbeheer staat nergens welke rechten bij welk scherm horen. Ernst: **Laag/Middel**.
3. **Het nepdata-logboek is voor iedereen met het recht zichtbaar.** E-maillogboek en Analyse (module 13) tonen de verzonnen cijfers ook aan e2e-notifications-only. Ernst: **Laag** (zelfde oorzaak als module 13, bevinding 1).

### UX-opmerkingen
- Overweeg bij het aanvinken van een recht een regel te tonen welke andere rechten het scherm nodig heeft, of rechten te bundelen in rollen met een voorbeeldprofiel ("Boekhouder", "Planner").
- De meldingen over een ontbrekend recht staan in het midden van het scherm als tekstblok; een knop "Vraag het recht aan" ontbreekt (alleen "Ga naar een scherm dat u wel mag gebruiken").

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


### Aanvulling (tweede ronde: gebruiker toevoegen en verwijderen, instellingen opslaan)
Getest: "Gebruiker toevoegen" (leeg formulier, bestaande gebruikersnaam "e2e-user", daarna nieuwe gebruiker "audit-temp" met rol Kijker en e-mail op e2e.invalid), de gebruiker daarna weer verwijderen, en App-instellingen > Klantenportaal opslaan (afhaalinstructie met " AUDIT" achter de tekst, gecontroleerd en weer teruggezet). Niet getest: een back-up herstellen (bewust).

Werkt:
- Een nieuwe gebruiker verschijnt direct in de lijst met rol Kijker en zonder aanvullende rechten (API: role viewer, permissions leeg); het formulier toont alle 35 rechten met Nederlandse namen, de schakelaars Actief en Prijzen verbergen en een rolkeuze met zeven rollen.
- Verwijderen vraagt een eigen dialoog ("Weet je zeker dat je gebruiker \"audit-temp\" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.") en geeft de toast "Gelukt — Gebruiker succesvol verwijderd"; daarna zijn er weer 12 gebruikers.
- Instellingen opslaan werkt: toast "Portaalinstellingen opgeslagen." en de waarde staat daarna in de API; terugzetten werkt op dezelfde manier.

Werkt niet:
6. **Het formulier "Nieuwe gebruiker toevoegen" meldt fouten in het Engels.** Een leeg formulier toont "Username must be at least 3 characters" (alleen de eerste fout, de andere velden blijven zonder melding), en een bestaande gebruikersnaam geeft de toast "Fout — Username already exists". Ernst: **Laag**.
7. **Een gebruiker aanmaken geeft geen toast** (herhaling van bevinding 2 voor opslaan): het scherm springt terug naar de lijst. Ernst: **Laag**.

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

## Module 19 — Generatie (PDF's, exports, back-up, wachtstanden en toasts)

### Getest
Alle uitvoer van de app laten genereren en de uitkomst vastgelegd: de PDF's uit de modules 6, 8, 10 en 11, de CSV-exports (bekeuringen, klantgeschiedenis, fiscaal), de vijf afdrukrapporten uit Rapporten, de drie handmatige back-ups (app-gegevens, uploads, code), de PDF van een lege schadecheck, en de e-mails (alleen naar adressen op e2e.invalid). Bestanden zijn niet op de computer opgeslagen: exports zijn onderschept en gelezen (blob), back-ups zijn met een directe aanroep gestart en na de eerste bytes afgebroken.

### Uitvoer per soort
| Uitvoer | Waar | Resultaat |
|---|---|---|
| Schadecheck-PDF bij inleveren | module 6 | Geldige PDF (722 kB), staat in Documenten |
| Interactieve schadecheck-PDF | module 11 | Geldige PDF (722 kB), opent in nieuw venster |
| Schadecheck-PDF van een voertuig (leeg formulier) | /api/vehicles/1669/damage-check-pdf | 200, application/pdf, 722.422 bytes, %PDF |
| Contract-PDF bij ophalen | module 10 | Geldige PDF (613 kB) nadat het sjabloon een veld kreeg; zonder veld 409 met duidelijke melding |
| Sjabloonvoorvertoning contract | module 10 | Geldige PDF (613 kB, lege achtergrond zolang er geen velden zijn) |
| Transportrapport-PDF | module 8 | Geldige PDF (1,5 kB), staat in Documenten |
| Documentbibliotheek: bekijken | module 10 | GET 200 (opent in een apart venster) |
| CSV bekeuringen | module 12 | Direct bestand, 605 bytes, puntkomma, bedrag met punt ("95.00"), kentekens met streepjes |
| CSV klantgeschiedenis | klantdetail, tab Geschiedenis | 128 bytes: Nummer;Kenteken;Voertuig;Van;Tot;Status;Contract;Prijs; datum als 2026-10-09, prijs "150" zonder decimalen, geen toast |
| CSV fiscale maandrapportage | Rapporten > Fiscaal | 200 text/csv, fiscaal-2026.csv / fiscaal-2027.csv, 344 bytes, Nederlandse komma ("0,00") |
| Afdrukrapporten APK, Garantie, Kosten, Benutting, Klanten | Rapporten (module 14) | Alle vijf bouwen een volledig document op (cijfers kloppen met het scherm); de native afdrukdialoog legt de ingebouwde browser stil |
| Rapportbouwer | Rapporten (module 14) | Resultaat alleen op het scherm: geen export, geen afdrukken |
| Back-up app-gegevens | Back-upbeheer, /api/backups/download-data | 500 "Failed to download app data" (pg_dump ontbreekt op deze computer) |
| Back-up geüploade bestanden | /api/backups/download-files | 200, application/gzip, car-rental-files-2026-10-09.tar.gz, 448.421.025 bytes (448 MB), geldige gzip-kop, eerste byte na 16,8 seconden |
| Back-up app-code | /api/backups/download-code | 500 "Failed to download app code" met een veld `details` (zie bevinding 2) |
| E-mail met bijlage | module 6 | 500, "No email settings configured" (geen SMTP lokaal; Engelse toast) |
| E-mail aan klanten (Communicatie) | module 13 | POST 200 met toast "Meldingen succesvol verstuurd — 0 e-mails verstuurd, 1 mislukt" |
| Uitnodigingsmail portaal | module 15 | Eerste keer correcte foutmelding, opnieuw sturen meldt "E-mail verstuurd." terwijl de log "failed" zegt |
| Back-up maken (knop "Nu back-uppen") | module 17 | 500, pg_dump ontbreekt (lokaal; toast met ruwe JSON) |
| Fiscaal beoordelingsrapport (PDF) | /api/fiscal/assessments/:id/pdf | Niet te testen: er bestaat nog geen beoordeling |

### Wachtstanden en toasts (algemeen)
- Eerste keer openen van de meeste dialogen en pagina's kost 3 tot 15 seconden zonder laadindicator (dev-modus; Communicatie en Rapporten het langst); knoppen lijken dan niets te doen.
- Toasts verdwijnen na ongeveer 5 seconden; fouttoasts bevatten vaak Engels of ruwe JSON ("Failed to send email", "500: {...}", "Vehicle not found", "RDW API request timed out").
- Bevestigingen zijn inconsistent: soms een eigen dialoog (voertuig, klant, blacklist, sjabloon verwijderen), soms een native browservenster (bekeuring verwijderen, portaalaccount verwijderen, regelversie archiveren), soms niets (rapport verwijderen, account blokkeren). Sommige opslagacties geven geen toast (gebruiker opslaan, fiscale klantinstellingen).
- Succesmeldingen die niet kloppen: "Meldingen succesvol verstuurd" bij 0 verstuurd, "E-mail verstuurd." bij een mislukte uitnodiging, "Check geladen" na "Check opslaan".

### Werkt niet
1. **De back-up van de app-code mislukt en lekt het serverpad.** Stappen: Back-upbeheer, "App-code" (GET /api/backups/download-code). Verwacht: bestand. Werkelijk: 500 met `{"error":"Failed to download app code","details":"Command failed: tar -czf \"C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\temp\\car-rental-code-2026-10-09.tar.gz\" --exclude=node_modules ..."}`: de volledige opdracht met het absolute pad staat in het antwoord. Er blijft een half bestand achter (temp/car-rental-code-2026-10-09.tar.gz, 26 MB); in dezelfde map staan nog 0-byte bestanden van eerdere mislukte gegevensback-ups (car-rental-data-2026-08-22.sql, -08-23.sql, 2026-09-09.sql). Alleen beheerders kunnen dit aanroepen. Ernst: **Laag/Middel**.
2. **De bestandenback-up (448 MB) begint pas na bijna 17 seconden te downloaden.** De server bouwt eerst het hele archief op, daarna pas komt de eerste byte; de interface heeft geen voortgang en een proxy met een standaardtimeout (bijvoorbeeld bij Coolify) kan dit afbreken. Bij meer uploads wordt het erger. Ernst: **Laag/Middel**.
3. **De CSV-exports verschillen in opmaak.** Bekeuringen: puntkomma, bedrag "95.00", datum "1-10-2026, 08:00:00", kenteken met streepjes; klantgeschiedenis: ISO-datum en prijs "150" zonder decimalen; fiscaal: Nederlandse komma ("0,00"). Dezelfde bestanden in Nederlands Excel geven daardoor verschillende resultaten. Geen van de exports toont een toast of een bestandsnaam. Ernst: **Laag**.

### UX-opmerkingen
- Een gemeenschappelijke uitleg bij uitvoer ("Bestand wordt gemaakt…", "Klaar: bestandsnaam, grootte") ontbreekt; vooral de back-ups en de afdrukrapporten geven geen enkele terugkoppeling tijdens het opbouwen.
- Een algemene afspraak voor bevestigingen en toasts (zie hierboven) zou de app rustiger maken.
- Niet getest: een echt bestand uploaden of afdrukken (ingebouwde browser), een back-up herstellen (bewust niet), en de PDF van een fiscale beoordeling.

---

## Module 20 — UX-samenvatting (alle doorgelopen modules, 1 t/m 19)

### Aantallen
19 modules doorgeklikt, 123 bevindingen: **4 Hoog, 30 Middel, 89 Laag** (bevindingen die als "Laag/Middel" zijn aangemerkt zijn bij Laag geteld; het zijn er ruim een dozijn). Alleen de modules 9 en 10 blijven "Partial" door testbeperkingen van de ingebouwde browser (geen bestandskeuze, geen afdrukdialoog, geen echte postbus).

| Module | Hoog | Middel | Laag | Totaal |
|---|---|---|---|---|
| 1 Auth | 0 | 1 | 3 | 4 |
| 2 Dashboard | 0 | 0 | 5 | 5 |
| 3 Voertuigen | 0 | 2 | 5 | 7 |
| 4 Klanten | 0 | 2 | 3 | 5 |
| 5 Reserveringen | 0 | 1 | 6 | 7 |
| 6 Overdracht | 0 | 2 | 4 | 6 |
| 7 Onderhoud | 2 | 2 | 4 | 8 |
| 8 Transporten | 0 | 0 | 5 | 5 |
| 9 Kosten (Partial) | 0 | 3 | 4 | 7 |
| 10 Documenten (Partial) | 0 | 1 | 6 | 7 |
| 11 Schadechecks en scannen | 0 | 1 | 5 | 6 |
| 12 Boetes | 0 | 4 | 6 | 10 |
| 13 Communicatie | 1 | 4 | 4 | 9 |
| 14 Rapporten | 0 | 3 | 5 | 8 |
| 15 Portaalbeheer | 0 | 2 | 5 | 7 |
| 16 Fiscaal | 0 | 0 | 5 | 5 |
| Rechtenronde 13 t/m 16 | 0 | 1 | 2 | 3 |
| 17 Instellingen en beheer | 1 | 0 | 6 | 7 |
| 18 Rechten fysiek | 0 | 1 | 3 | 4 |
| 19 Generatie | 0 | 0 | 3 | 3 |
| **Totaal** | **4** | **30** | **89** | **123** |

### De ernstigste bevindingen
1. **E-maillogboek en Analyse tonen verzonnen gegevens (Hoog, module 13).** Drie vaste regels uit maart 2024 en vaste totalen worden als echte verzendgeschiedenis getoond; de echte log wordt opgehaald maar nergens getoond, dus een mislukte verzending is nergens te zien (CustomerCommunications.tsx regel 197).
2. **Gebruiker opslaan wist het wachtwoord (Hoog, module 17).** Elke beheerder die rechten of naam van een collega wijzigt zonder een nieuw wachtwoord in te vullen, sluit die collega buiten (server/routes/users.ts regel 307, server/database-storage.ts regel 229; er loopt een reparatie).
3. **Onderhoud en vervangers (twee keer Hoog, één Middel, module 7).** Bewerken zet voertuig en onderhoud ongevraagd op "in onderhoud", afronden zet het voertuig niet terug op Beschikbaar, en "Annuleren" in het vervangerdialoog laat het onderhoud tóch plannen zonder vervanger of waarschuwing (blok #3204).
4. **Meldingen die succes zeggen terwijl het misging (Middel, modules 13, 15, 11, 6).** "Meldingen succesvol verstuurd" bij 0 verstuurd, "E-mail verstuurd." bij een mislukte uitnodiging (log "failed"), "Check geladen" na "Check opslaan", groene toast "Contract is gegenereerd" bij een leeg sjabloon.
5. **Boetes werken maar zijn niet af (module 12).** Opslaan in het bekeuringsdetail wist de administratiekosten (Middel), "Doorbelast" en "Betaald" zijn niet te bereiken, het koppelen mailt de klant meteen zonder waarschuwing, en de klantnaam blijft leeg (zie 6).
6. **Lege klantnaam in vier zoekopdrachten (Middel, modules 4, 12, 15).** Een klant zonder bedrijfsnaam wordt als lege tekst bewaard en vier zoekopdrachten gebruiken `coalesce(companyName, name)` zonder `nullif` (fines-storage, fine-attribution, portal-dashboard, portal-requests-storage): de bekeuringenlijst, het bekeuringsdetail, het Klanten-overzicht en de aanvragen tonen een lege naam. Twee andere plekken doen het goed; één hulpfunctie zou dit oplossen.
7. **Kosten en categorieën (Middel, modules 3, 9, 14).** "Fuel" en "fuel" bestaan naast elkaar (twee tegels, twee rijen in elk rapport), Tol en Parkeren zijn in het formulier niet te kiezen, tankkosten uit "Brandstofstatus bijwerken" komen nergens in de administratie, het rapportfilter biedt andere categorieën dan de data bevat, en "Analyse onderhoudskosten" telt alle kosten als onderhoud (€ 89.165,54 in plaats van € 11.192,10).
8. **Contract en overdracht (Middel, modules 6 en 10).** Een leeg standaardsjabloon blokkeert alle contracten en de app voorkomt dat niet; een zakelijke klantnaam wordt verminkt tot "B.v." en "Dhl" (module 4).
9. **Rechten en schermen sluiten niet op elkaar aan (Middel, modules 18 en rechtenronde).** "Document uploaden" is klikbaar zonder recht, de rechten "Boetes bekijken" en "Fiscale check bekijken" hebben geen eigen ingang (alleen Klantenportaal), en "Meldingen beheren" of "Rapporten bekijken" werken niet zonder andere rechten.
10. **Tijden zijn lokaal twee uur verschoven (Laag/Middel, modules 12 en 15).** De database heeft voor de meeste kolommen `timestamp without time zone` terwijl het schema `timestamptz` zegt; een bekeuringstijd van 11:30 toont 09:30, dezelfde login staat in twee lijsten twee uur uit elkaar. Op een UTC-server mogelijk onzichtbaar; niet in productie gecontroleerd.

### Patronen achter de bevindingen (wat het meeste oplevert)
| Patroon | Voorbeelden | Aanpak |
|---|---|---|
| Hardgecodeerde of niet getoonde data | E-maillogboek, Analyse, "Efficiëntiebeoordeling" | Echte log tonen, nepdata verwijderen |
| Lege tekst in plaats van leeg veld | companyName "", opmerkingen | Bij opslaan "" naar NULL; één hulpfunctie voor weergavenaam |
| Succesmeldingen zonder controle van het resultaat | zie ernstigste bevinding 4 | Toast alleen na gecontroleerd resultaat; telling "x van y" tonen |
| Inconsistente bevestigingen | eigen dialoog bij voertuig, klant, blacklist, sjabloon, gebruiker; native venster bij bekeuring, portaalaccount, regelversie; niets bij rapport verwijderen, account blokkeren | Eén bevestigingsdialoog voor alle verwijderen en onomkeerbare acties |
| Ruwe sleutels en Engels in de interface | "rented", "needs_fixing", "Completed", "portal_invite", "ROUNDING_MODE", validatie "Username must be…", rapportbouwer | Vertaaltabel per statuswaarde en formulier-validatie |
| Rechten per knop, niet per scherm | zie bevinding 9 | Rechtenlijst koppelen aan schermen, afhankelijke rechten tonen |
| Geen terugkoppeling bij opslaan | gebruiker aanmaken, fiscale klantinstellingen, fiscaal-CSV | Standaard toast of regel "Opgeslagen" |

### Sterke punten
- Beveiligingen bij overdracht en verwijderen: kilometerverlaging met wachtwoord, annuleren van een opgehaalde huur met vinkje, terugdraaien met voorvertoning, typ-bevestiging bij voertuig en klant, waarschuwing bij voertuigopmerkingen, en bij de blacklist een eigen bevestiging met uitleg wat het gevolg is.
- Rechtenmeldingen noemen het ontbrekende recht in het Nederlands en grijze knoppen leggen bij zweven uit waarom.
- De fiscale sectie is zorgvuldig ontworpen (WETTELIJK/INTERN, "geen fiscaal advies", audit, stappen indienen-goedkeuren-publiceren, impactvoorbeeld met auditregel).
- De afhandeling van portaalaanvragen is helder (bericht sturen, beantwoorden en afhandelen, huuraanvraag goedkeuren maakt de reservering en waarschuwt bij een niet-verhuurbaar voertuig).
- Het vervangerdialoog bij onderhoud noemt de geraakte reservering en biedt drie duidelijke keuzes.
- De cijfers in Rapporten kloppen (omzet min kosten is marge, de som van de categorieën is het totaal) en de kentekenzoeker normaliseert streepjes.

### Te veel kliks, ontbrekende bevestigingen, trage terugkoppeling
- **Te veel kliks:** de interactieve schadecheck heeft circa 50 keuzes zonder "alles goed"; een document uploaden kost vier handelingen vóór de bestandskeuze; een aanvraag afhandelen vier; een bekeuring invoeren en koppelen zes; na het kiezen van een vervangend voertuig zijn twee klikken op de bevestigknop nodig.
- **Ontbrekende of verkeerde bevestiging:** "RDW APK-datums scannen" start een volledige scan met één klik; "Annuleren" bij een bekeuring annuleert de bekeuring zonder vraag; een opgeslagen rapport en een geblokkeerd portaalaccount hebben geen bevestiging; verwijderen van een bekeuring, portaalaccount en archiveren van een regelversie gebruiken een native browservenster (bij het archiveren werd de eerste klik in de ingebouwde browser stil genegeerd); "Afronden" van een transport en verwijderen van chauffeur, transport en kostenpost zijn definitief zonder prullenbak.
- **Trage of ontbrekende terugkoppeling:** geen laadindicator bij het eerste openen van pagina's en dialogen (3 tot 15 seconden in dev-modus); de bestandenback-up (448 MB) begint na 17 seconden; geen toast bij gebruiker aanmaken en fiscale klantinstellingen; de lijst met e-mailsjablonen ververst niet na opslaan; de pop-up "APK-datums gewijzigd bij de RDW" blijft bij een nieuwe sessie terugkomen tot elk voorstel is beslist.
- **Taal en notatie:** formuliervalidatie (Zod) en foutmeldingen staan op meerdere plekken nog in het Engels, net als interne waarden ("rented", "Completed", "portal_invite"); datums, bedragen en kentekens wisselen van notatie per scherm ("9 oktober 2026", "09/10/2026", "2026-10-09"; "€ 95.00" tegenover "€ 95,00"; "94XT184" tegenover "94-XT-184"); exports gebruiken per bestand een andere opmaak.

### Wat niet getest kon worden (omgeving), en dus open blijft
- Een bestand kiezen of uploaden (factuur-PDF scannen, document uploaden, bekeuringsbrieven scannen, CJIB-bestand, foto's en handtekening bij de schadecheck) en afdrukken (printdialoog legt de ingebouwde browser stil).
- Echte e-mail (geen SMTP lokaal) en de klantkant van het portaal (geen bekend portaalwachtwoord).
- Bewust niet gedaan: "Nu ophalen" bij Ontvangen facturen en bij CJIB-importen (echte postbussen), een back-up herstellen, een fiscale versie publiceren of goedkeuren, en e-mails naar echte adressen.

### Aanbevolen volgorde om aan te pakken
1. De twee Hoog-bevindingen (logboek met nepdata, wachtwoord wissen) en de twee Hoog in Onderhoud.
2. De lege klantnamen (één hulpfunctie) en de succesmeldingen die onwaar zijn.
3. Eén bevestigingsdialoog en één toastafspraak voor de hele app.
4. Kostencategorieën en de rapportfilters (module 3, 9, 14) in één keer rechtzetten.
5. Boetes afmaken: Doorbelast en Betaald, administratiekosten tonen en behouden, klant niet automatisch mailen.
6. Rechtenlijst koppelen aan schermen en afhankelijke rechten tonen.
7. Vertalingen en notaties (status- en validatiewaarden, datums, bedragen).
