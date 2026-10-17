# Afwijkingen handleiding ↔ app, 17 oktober 2026

Inventarisatie van de gebruikershandleiding (versie 1.0, laatst bijgewerkt 12 oktober 2026) tegen de
app op main `cda7df36`. Gecontroleerd: elk hoofdscherm en de belangrijkste vensters in de
ontwikkelserver (ingelogd als beheerder), de teksten in `client/src/locales/nl/` en de commits sinds
de laatste handleidingswijziging (`3fde1e10` tot en met `cda7df36`).

**Uitkomst in één zin:** de stappen in de hoofdstukken 1, 3, 5, 7, 8, 9 (op 9.9 na) en 10 kloppen nog;
de afwijkingen zitten in wat er na 12 oktober is bijgebouwd: het Kostenoverzicht (nieuwe opzet),
de transporttabel, de afdrukknoppen van Rapporten, het activiteitenlog, de sleutellabels (korte
code, drie standaardsjablonen, extra DYMO-opties), de klikbare rijen en kolomkoppen, de
**Handleiding** in het gebruikersmenu en **Voertuig blokkeren** op de klantkaart.

Teller: **38 afwijkingen** in 12 hoofdstukken (0, 1, 2, 3, 4, 6, 8, 9, 10, 13, 18, 19). De
hoofdstukken 5, 7, 11, 12, 14, 15, 16 en 17 hadden bij deze controle geen afwijking; die worden bij
het maken van de screenshots nog eens venster voor venster nagelopen.

---

## Per hoofdstuk

### Hoofdstuk 0 — Wat is er nieuw (6)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 0.1 | Kop en slot: *De schermafbeeldingen zijn niet vernieuwd; de tekst is leidend.* | Vervalt zodra de screenshots er zijn. |
| 0.2 | Niets over de **Handleiding** in het gebruikersmenu (commit 3fde1e10). | Nieuw punt onder Balie: je naam rechtsboven → **Handleiding**; ook op `/handleiding`. |
| 0.3 | Niets over **Voertuig blokkeren** op de klantkaart (cda7df36). | Nieuw punt onder Balie, met verwijzing naar 3.2. |
| 0.4 | Niets over de nieuwe opzet van **Kosten** (74f066eb, 08d2a44c). | Nieuw punt: **Per categorie** / **Alle kosten**, snelle periodes, categorieën ingeklapt. |
| 0.5 | Niets over klikbare rijen (klant, voertuig, transport), sorteerbare kolomkoppen (transporten, aanvragen, voertuigen online, blacklist), klikbare **Recente scans**, afdrukvoorbeeld bij **Rapporten**. | Nieuwe punten onder Balie. |
| 0.6 | Niets over het activiteitenlog (bekijken/afdrukken/exporteren gelogd, schermen en vensters, filter **Soort**, achtergrondtaken als *systeem*), **Geschiedenis** bij kostenpost/document/bestuurder, korte labelcode V123/S123, drie standaardsjablonen, factuurcontrole (**Opnieuw uitlezen**, **Afzender vertrouwen**, excl. btw). | Nieuwe punten onder Beheerder en Werkplaats. |

### Hoofdstuk 1 — Snel aan de slag (3)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 1.1 | 1.2: je eigen menu heeft **Profiel**, taal, **Uitloggen**. | Ook **Handleiding** (voor iedereen), bij een beheerder daarna **Gebruikers**, **Back-upbeheer**, **App-instellingen**. |
| 1.2 | 1.4 *Een voertuig opzoeken en bekijken*: zes tabbladen (**Algemeen** … **Geschiedenis**). | Zeven: ook **Fiscaal** (voor wie **Fiscaal bekijken** heeft). |
| 1.3 | 1.4: *Klik bij de juiste regel op **Bekijken**.* | Klopt, maar een klik ergens op de regel opent de kaart ook (klanten én voertuigen, 054991c4). |

### Hoofdstuk 2 — Navigatie (10)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 2.1 | 2.2 punt 6: **Aankomende reserveringen** met kolommen **Voertuig**, **Klant**, **Periode**, **Acties**. | Er staat ook een kolom **Status**. |
| 2.2 | 2.3: zes tabbladen op de voertuigkaart. | Zeven, met **Fiscaal**; een klik op de regel opent de kaart. |
| 2.3 | 2.4: *Onderaan staat **Recente scans**, zodat je kunt terugzien…* | Elke regel is nu een knop (**Opnieuw opzoeken**): klikken zoekt de code opnieuw op (cd2d1f2e). |
| 2.4 | 2.5: per regel **Bekijken**, **Nieuwe reservering**, **Verwijderen**. | Klopt; plus: een klik op de regel opent **Klantgegevens**. |
| 2.5 | 2.6: bovenaan **Bekeuringen**, **Brieven scannen**, **Account uitnodigen**. | Er staat ook **Fiscale check** tussen (voor wie **Fiscaal bekijken** heeft). De aanvragentabel sorteert op elke kolomkop (0ccf3f09); **Voertuigen online** en **Blacklist** hebben zoekveld, filters, sorteerbare koppen en pagina's van 50 (b2c9cda1, e9c43e87). |
| 2.6 | 2.8 **Kosten**: *Eén lijst met filters … 100 tegelijk … **Meer tonen** … kolommen Datum, Voertuig, Categorie, Omschrijving, Bedrag.* | Volledig anders (74f066eb, 08d2a44c): boven de lijst **Voertuig**, **Van**, **Tot en met**, **Categorie**, de snelle periodes **Deze maand** / **Vorige maand** / **Dit jaar**, **Exporteren (CSV)** en de regel *N kostenposten · totaal € …*. Daaronder de weergave **Per categorie** (elke categorie ingeklapt met aantal en totaal; klik opent de vijf nieuwste en de knop **Alle N tonen** naar een venster met eigen zoekveld en **Sorteren**) of **Alle kosten** (tabel met sorteerbare koppen, kolom **Bedrag (excl. btw)**, paginakiezer). Geen **Meer tonen** meer. |
| 2.7 | 2.8 **Transporten**: alleen de tellers en tabbladen. | Klopt, maar de tabel is veranderd, zie hoofdstuk 6. |
| 2.8 | 2.8 **Rapporten**: *vijf afdrukknoppen … tabbladen Operaties, Kosten, Voertuigen, Klanten, Transporten en Financieel.* | Ook het tabblad **Fiscaal**. Bij **Rapportfilters** staan **Filters herstellen** en de snelle keuzes **Alle gegevens (verleden & toekomst)**, **Deze maand**, **Volgende maand**. De afdrukknoppen (en **Afdrukken** in de rapportbouwer) openen eerst een afdrukvoorbeeld met **Sluiten** en **Afdrukken** (048dc4a6); *Afdrukken: APK* enzovoort blijft de naam van de knop. |
| 2.9 | 2.10 je eigen menu: naam, **Profiel**, taalknop, Beheer, **Uitloggen**. | Ook **Handleiding**, na de taalknop en vóór het kopje Beheer. |
| 2.10 | 2.11: sneltoetsen. | Klopt. (Geen afwijking; vermeld om aan te geven dat dit is nagelopen.) |

### Hoofdstuk 3 — Klanten (4)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 3.1 | 3.2 **Geblokkeerde voertuigen**: alleen *Staat daar … dan mag de klant alles huren.* | Nieuw (cda7df36): de knop **Voertuig blokkeren** opent **Voertuig blokkeren voor deze klant** — *Kies een voertuig dat <naam> niet mag huren.* Veld **Voertuig** (*Zoek op kenteken, merk of model...*; al geblokkeerde auto's staan er niet in), **Reden (optioneel)**, knop **Blokkeren**. Per blokkade de knop **Blokkade opheffen** met de vraag **Blokkade opheffen?** — *<voertuig> (<kenteken>) wordt vrijgegeven; deze klant kan het voertuig daarna weer huren.* Vereist **Klanten beheren** of **Voertuigen beheren**; zonder vinkje grijs. Spiegelbeeld op de voertuigkaart: **Klant zwarte lijst**. Lege staat: *Deze klant is niet geblokkeerd voor enig voertuig.* met eronder *Ze kunnen alle beschikbare voertuigen huren.* |
| 3.2 | 3.2: *vijf tabbladen* vast. | **Portaal** staat er alleen voor wie een portaalvinkje heeft; een klik op de regel in de lijst opent de kaart ook. |
| 3.3 | 3.6: het venster van een chauffeur. | Heeft nu onderaan een blok **Geschiedenis** (9cec1296). |
| 3.4 | 3.3 adresgegevens: de app vult **Straatnaam**, **Straatadres** en **Plaats**. | Klopt; de kaart toont **Straatnaam** en **Adres** (straat + huisnummer samen, 8518b79b). Formulering in 3.2 aanvullen. |

### Hoofdstuk 4 — Voertuigen (5)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 4.1 | 4.2: zes tabbladen. | Zeven, met **Fiscaal**. |
| 4.2 | 4.10: per document de knoppen. | Per document ook een knop **Geschiedenis** (9cec1296). |
| 4.3 | 4.11: *Op het label staat de barcode … VEH-000123.* | Het sleutellabel draagt de **korte code** V123 (reserve S123, na opnieuw genereren V123R2); de scanner zet die om naar de opgeslagen VEH-code (df829fd5). Op het scherm en in het barcodeboek blijft VEH-000123 staan. |
| 4.4 | 4.11 DYMO: *Tapebreedte (9, 12 of 19 mm; standaard 12) en Labellengte (standaard 48).* | **Tapebreedte** 6, 9, 12, 19 of 24 mm; **Labellengte (mm)** vanaf 15; **Marge links/rechts (mm)**, **Marge boven/onder (mm)**; bij rechtstreeks printen **Positie op de tape** (Links / Midden / Rechts) en **Doorlopend printen**; het vinkje **Meerdere labels op één strook, met kniplijn ertussen (zelf knippen)** met **Ruimte naast de kniplijn (mm)** (66a21fb9). **Labelsjabloon** kent drie standaarden: **Hoofdsleutel**, **Reservesleutel**, **Autolabel (sticker in de auto)** (d32e8ce9). |
| 4.5 | 4.13 stap 1: *Klik op het tandwiel (**Instellingen**)…* | Er is geen tandwiel: je naam rechtsboven → **App-instellingen** → tabblad **Voertuigen**. |

### Hoofdstuk 6 — Transport (3)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 6.1 | 6.1 kolommen: **Voertuig**, **Vervangend voertuig**, **Type**, **Route**, **Datum**, **Afstand**, **Tolkosten**, **Facturatie**, **Status**, **Acties**. | Na het selectievakje eerst een kolom met **Afdrukken / rapport genereren**; **Afstand** en **Tolkosten** zijn samen **Afstand / tol**; de overige acties staan rechts (c6684c5d, a21915fd). De kolomkoppen sorteren (klik, nog een klik draait om); een klik op de regel opent het transport (a9962172). |
| 6.2 | 6.1/6.4: knopje **Vervangend voertuig selecteren** bij **TBD**. | De knop in de tabel heet **Selecteren** (de volledige naam staat in de tekstballon). |
| 6.3 | 6.10 snel naslaan: *Later een auto toewijzen → **Vervangend voertuig selecteren** op het dashboard.* | → **Selecteren** bij **TBD**. |

### Hoofdstuk 8 — Documenten (2)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 8.1 | 8.5 Barcodelabels: één standaard met **Als standaard instellen**. | De editor toont drie standaarden naast elkaar — **Hoofdsleutel**, **Reservesleutel**, **Autolabel (sticker in de auto)** — met een gevulde ster op de huidige; klikken slaat direct op. Een sjabloon is standaard voor één soort of voor geen (d32e8ce9, f446be45). Nieuwe knop **Kenteken onder barcode** in de editor (cc465f03). |
| 8.2 | 8.3/8.4: documenten op de voertuigkaart. | Per document de knop **Geschiedenis** (zie 4.2). |

### Hoofdstuk 9 — E-mail (1)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 9.1 | 9.9: *De bedragen worden geboekt zoals ze op de factuur staan … De app rekent niets om.* | Mailfacturen worden **exclusief btw** geboekt: regels die incl. btw staan rekent de app terug naar excl. btw (976ad874). Velden en kolommen heten **Bedrag (excl. btw)**. In het venster **Controleren** staan de knoppen **Opnieuw uitlezen** (75b38eb7) en **Afzender vertrouwen** (zet het adres op de vertrouwde lijst). |

### Hoofdstuk 10 — Beheer (2)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 10.1 | 10.5: geschiedenis bij reservering, voertuig en klant. | Ook bij een **kostenpost**, een **document** (knop **Geschiedenis** op de documentkaart) en een **chauffeur** (9cec1296). In de geschiedenis staan ook *bekeken*, *gedownload*, *afgedrukt* en *geëxporteerd* (6956d838). |
| 10.2 | 10.5 **Activiteitenlog**: filters **Zoeken**, **Gebruiker**, **Actie**, **Vanaf**, **Tot en met**; kolommen. | Ook het filter **Soort** (**Wijzigingen** / **Schermen en vensters** / **Alles**, standaard Wijzigingen); elk geopend scherm en venster staat als *Scherm geopend* / *Venster geopend* met de menunaam (4a182c45, 4db74d13); 50 regels per pagina, wijzigingen op één regel met **+n meer**; de nachtelijke taken (RDW APK-scan, servicebeurt-scan, fiscale run, CJIB, factuurpostvak) staan als gebruiker *systeem* (62a0e25b). |

### Hoofdstuk 13 — Snel naslagwerk (3)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 13.1 | 13.1: geen regel voor de handleiding. | Nieuwe regel: *De handleiding openen → je naam rechtsboven → **Handleiding***. |
| 13.2 | 13.10 Kosten: klikpaden met **Meer tonen** / de ene lijst. | Aanpassen aan **Per categorie** / **Alle kosten** / **Alle N tonen**. |
| 13.3 | 13.13 Rapporten: *Afdrukken: APK* drukt af. | → opent het afdrukvoorbeeld → **Afdrukken**. Plus 13.5: *Een auto blokkeren voor een klant → klantkaart → **Voertuig blokkeren***. |

### Hoofdstuk 18 — Barcode en scannen (3)

| # | Staat er | Hoort er te staan |
|---|---|---|
| 18.1 | 18.2 tabel: *VEH-000123 het sleutellabel*. | Op het label staat de korte code **V123** (reserve **S123**, nieuw label **V123R2**); scannen of typen van beide vormen werkt. |
| 18.2 | 18.5 **Recente scans**: alleen terugkijken. | Klik op een regel (of Enter) zoekt de code opnieuw op; bij *geen match* blijft de code in het veld staan om te verbeteren. |
| 18.3 | 18.9 DYMO: zie 4.4. | Zelfde aanvulling als 4.4; de standaardsjablonen **Hoofdsleutel** / **Reservesleutel** / **Autolabel**; het barcodeboek kiest bij **Stickers afdrukken** het autolabel-sjabloon vooraf. |

### Hoofdstuk 19 — Acceptatiechecklist (volgt de hoofdstukken)

De regels 100 (tabbladen voertuigkaart), 151 (klantkaart), 176–178 (Kosten, **Meer tonen**), 185–193
(Transporten, Rapporten, afdrukken), 229 (**Geblokkeerde voertuigen**), 364–365 (DYMO) en 536–551
(transporttabel, **Vervangend voertuig selecteren**) gaan mee met de correcties hierboven; er komen
regels bij voor **Handleiding**, **Voertuig blokkeren**, klikbare rijen en het filter **Soort**.

### README

Versie en datum (1.0 → 1.1, 17 oktober 2026); de alinea *De schermafbeeldingen zijn nog niet opnieuw
gemaakt* vervalt; de inhoudsopgave blijft.

---

## Voorgestelde screenshots per hoofdstuk

Alle screenshots op 1280 px breed, met de testgegevens van de ontwikkeldatabase (klanten *Klant N B.V.*,
de echte kentekens van de vloot, geen persoonsgegevens). Bestandsnamen `NN-onderwerp.png`. De elf
bestaande worden opnieuw gemaakt (zelfde naam, zelfde plek). Een venster staat direct onder de stap
waar het hoort.

| Hoofdstuk | Screenshots (nieuw, tenzij *bestaand*) |
|---|---|
| 1 Snel aan de slag | 01-inlogscherm *(bestaand)* · 01-bovenbalk (zoekveld, belletje, naam) · 01-zoekresultaten · 01-gebruikersmenu · 01-ophaalvenster · 01-inleververster · 01-klant-toevoegen · 01-nieuwe-reservering |
| 2 Navigatie | 03-dashboard *(bestaand)* · 02-menu-links · 02-snelle-acties · 02-meldingencentrum · 02-sneltoetsen · 02-kosten-overzicht · 02-rapporten-afdrukvoorbeeld · 11-rapporten *(bestaand)* · 12-klantenportaal-beheer *(bestaand)* · 02-communicatie |
| 3 Klanten | 06-klanten *(bestaand)* · 03-klantgegevens · 03-klant-toevoegen-basis · 03-klant-toevoegen-contact · 03-klant-toevoegen-bedrijf · 03-bestaat-mogelijk-al · 03-chauffeurs · 03-chauffeur-toevoegen · 03-portaal-tabblad · 03-portaalaccount-uitnodigen · 03-klant-verwijderen · 03-geblokkeerde-voertuigen · 03-voertuig-blokkeren · 03-blokkade-opheffen |
| 4 Voertuigen | 05-voertuigen *(bestaand)* · 04-voertuiggegevens · 04-voertuig-toevoegen (met **Opzoeken**) · 04-bulk-importeren · 04-voertuig-bewerken-technisch · 04-voertuig-bewerken-datums · 04-beschikbaarheidsstatus · 04-brandstofstatus · 04-kilometerstand · 04-documenten-tabblad · 04-voertuigbarcode · 04-voertuigbarcode-dymo · 04-barcodeboek · 04-voertuig-verwijderen · 04-verwijderde-voertuigen · 04-rdw-voertuigtypes |
| 5 Reserveringen | 04-reserveringskalender *(bestaand)* · 05-kleuren-legenda · 05-lijstweergave · 05-nieuwe-reservering-stap1 · 05-nieuwe-reservering-voertuig · 05-nieuwe-reservering-details · 05-reserveringsdetails-kort · 05-reserveringsdetails-volledig · 05-datums-wijzigen · 05-contractnummer-bewerken · 05-ophaalproces · 05-contract-klaar · 05-inleverproces · 05-reservering-annuleren · 05-overdracht-terugdraaien · 05-achterstallig · 05-niet-opgehaald · 05-voltooid-bekijken · 05-administratie |
| 6 Transport | 08-transporten *(bestaand)* · 06-transport-registreren · 06-vervangend-voertuig-tbd · 06-transport-bekijken · 06-transport-afronden · 06-transportrapport · 06-routeoptimalisatie |
| 7 Onderhoud | 07-onderhoud *(bestaand)* · 07-dagvenster · 07-onderhoud-plannen · 07-vervangende-voertuigen-toewijzen · 07-plannen-afbreken · 07-voertuigservice (reservering) · 07-onderhoud-afronden · 07-lijstweergave-gepland · 07-voltooide-bekijken · 07-portaalaanvraag |
| 8 Documenten | 09-documenten *(bestaand)* · 08-document-uploaden · 08-documentknoppen · 08-reserveringsdocumenten (met **Verouderd**) · 08-contractsjablonen · 08-sjablooneditor · 08-barcodelabels · 08-schadecheck |
| 9 E-mail | 09-documenten-emailen · 09-meldingen-versturen · 09-voorvertoning · 09-sjabloonbouwer · 09-emaillogboek · 09-email-gps-instellingen · 09-ontvangen-facturen · 09-factuur-controleren |
| 10 Beheer | 10-gebruikersmenu-beheer · 10-gebruikersbeheer · 10-nieuwe-gebruiker-rechten · 10-geweigerde-pogingen · 10-app-instellingen · 10-bedrijfsregels · 10-activiteitenlog · 10-backup-herstel · 10-prullenbak · 10-geschiedenis |
| 15 Rollen en rechten | 15-grijze-knop-uitleg · 15-rechtenraster |
| 18 Barcode en scannen | 10-scannen *(bestaand)* · 18-scanresultaat (tegels) · 18-recente-scans · 18-camera · 18-sleutelkast-audit · 18-barcodeboek-dymo |
| 0, 11, 12, 13, 14, 16, 17, 19 | Geen eigen screenshots; ze verwijzen naar de hoofdstukken hierboven. |

Dat zijn ongeveer 105 schermafbeeldingen, waarvan 11 bestaande die opnieuw worden gemaakt.

---

## Twee dingen die ik nodig heb

1. **Een inlog voor de schermfoto's.** Het browserpaneel maakt schermfoto's op maximaal 800 px breed,
   te klein voor de handleiding. Daarom wil ik ze maken met Playwright (zit al in het project) op
   1280 px, en dat vraagt een eigen inlog op de ontwikkelserver (poort 5001, zelfde database als
   poort 5000). Het aanmaken van zo'n account vanuit mijn kant is geblokkeerd. Twee opties:
   - maak in **Gebruikers** een beheerdersaccount `handleiding` aan (wachtwoord naar keuze, mag je
     daarna weer verwijderen) en geef mij de gebruikersnaam en het wachtwoord; of
   - geef me het wachtwoord van een bestaand testaccount met beheerdersrechten op de testdatabase.
2. **Handelingen in de testdatabase.** Voor vensters als **Contract klaar**, **Schadeformulier klaar**,
   **Onderhoud afronden** en **Overdracht terugdraaien** moet de handeling echt worden uitgevoerd. Ik
   wil dat alleen doen met de testauto's **AUDIT1**/**AUDIT2** en de klant **Audit Testklant B.v.**, en
   daarna niets terugdraaien. Akkoord?
