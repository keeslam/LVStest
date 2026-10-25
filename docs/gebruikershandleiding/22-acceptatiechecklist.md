# 22. Acceptatiechecklist

Met deze lijst loop je de hele app zelf na. Dat doe je voordat je de app vrijgeeft, of nadat hij is
uitgerold. De lijst volgt de handleiding hoofdstuk voor hoofdstuk (1 tot en met 21). Alles wat de
handleiding over de app zegt, probeer je hier één keer zelf uit. Daarna vink je het af.

Elke regel is op dezelfde manier opgebouwd. Eerst staat **wat je test**. Dan het **klikpad en wat je
doet**. Dan het **verwachte resultaat**. Daarin staat de tekst van de knop of de melding zoals die in de app
staat. Tussen haakjes staat het onderdeel van de handleiding waar het bij hoort. Zie je iets anders dan er
staat? Noteer dan de regel en wat je zag. Maak er ook een schermafbeelding van. Dan kan de handleiding
worden aangepast. Of de app wordt hersteld, als jij vindt dat de app fout is. Bij verschil geldt de app.

## Hoe je dit gebruikt

- **Streep af in je eigen kopie.** Verander `- [ ]` in `- [x]` in een tekstverwerker of editor. Een
  voorvertoning toont het dan als een aangevinkt vakje. Je kunt de lijst ook afdrukken en met een pen afstrepen.
- **(nieuw)** achter een regel betekent: dit is nieuw in deze uitrol. Die regels zijn het
  belangrijkst. Alles zonder dat woord werkte al. Dat hoort nog steeds zo te werken.
- **[beheerder]**, **[balie]**, **[werkplaats]** enzovoort tussen vierkante haken zegt met welk
  account je de regel moet doen. Zie "Welke accounts je nodig hebt" hieronder. Staat er niets,
  dan kan elk account met genoeg rechten het.
- **(hfst 5.7)** achter een regel verwijst naar hoofdstuk 5, paragraaf 5.7 van de handleiding.
- Soms kun je een regel **niet doen**, omdat de situatie er niet is. Bijvoorbeeld "een klant zonder
  e-mailadres". Laat die regel dan open staan. Schrijf een korte notitie in de kantlijn. Niet afstrepen.

## Zo voorkom je dat je echte gegevens verandert

- Doe dit het liefst op de **testomgeving**. Dat is de lokale test- of acceptatiedatabase. Heb je geen
  testomgeving? Maak dan **oefengegevens**. Zet *OEFEN* voor de naam van elke klant die je aanmaakt.
  Zet het ook in de notities van elke reservering. Ruim de oefengegevens aan het eind op via de prullenbak.
- **E-mail:** vul bij het testen van mail altijd **je eigen e-mailadres** in. Stuur nooit een testmail
  naar een echte klant.
- **Definitief verwijderen** en **Prullenbak leegmaken** doe je alleen op je eigen oefengegevens.
- Bij de regel over de blokkade na vijf foute inlogpogingen moet je een kwartier wachten. Doe die regel
  één keer, op de testomgeving.
- **Back-up terugzetten** test je niet op productie. Die regel staat als "alleen lezen" in de lijst.

## Welke accounts je nodig hebt

Maak deze accounts vooraf aan via **Gebruikers** → **Gebruiker toevoegen**. Het wachtwoord heeft minimaal 10
tekens, met een hoofdletter, een kleine letter en een cijfer. De vinkjes staan in hoofdstuk 15,
paragraaf 15.7.

| Naam in deze lijst | Rol en vinkjes |
|---|---|
| **[beheerder]** | De rol **Beheerder**. Die mag alles. Het vinkje **Kilometerverlaging goedkeuren** staat apart aan. |
| **[balie]** | Dashboard bekijken · Voertuigen bekijken · Klanten bekijken · Reserveringen beheren · Documenten bekijken · Klantportaal bekijken. Maak ook een tweede balie-account. Geef dat de vinkjes **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren**. Dat heb je nodig voor de regels over terugdraaien en de prullenbak. Zo zie je ook de grijze knop zonder die vinkjes. |
| **[kantoor]** | Verhuurmedewerker: Dashboard bekijken · Voertuigen beheren · Klanten beheren · Reserveringen beheren · Documenten bewerken en genereren · Schadecontroles beheren · Klantportaal beheren · Kosten beheren · Boetes beheren · Kilometerverlaging goedkeuren · Overdracht terugdraaien · Opgehaalde huur annuleren of verwijderen · Prullenbak beheren |
| **[werkplaats]** | Voertuigen beheren · Onderhoud beheren · Kosten beheren · Reserveringen bekijken · Voertuigen bekijken |
| **[alleen Voertuigen beheren]** | Alleen **Voertuigen beheren**. Dit is een scanaccount. |
| **[kijker]** | Dashboard bekijken · Voertuigen bekijken · Klanten bekijken · Reserveringen bekijken |
| **[zonder Prullenbak beheren]** | Een account met Reserveringen beheren, maar zonder **Prullenbak beheren**. |

---

## Hoofdstuk 1 — Snel aan de slag

### Inloggen en je wachtwoord

- [ ] **Inloggen.** Open het adres van de app. Vul **Gebruikersnaam** en **Wachtwoord** in. Klik op **Inloggen** of druk op Enter. Verwacht: je staat op het **Dashboard**. (hfst 1.1)
- [ ] **Fout wachtwoord.** Typ één keer een fout wachtwoord. Klik op **Inloggen**. Verwacht: *Ongeldige gebruikersnaam of wachtwoord*. De app zegt niet welke van de twee fout is. Doe dit maximaal twee keer. (hfst 1.1)
- [ ] **Blokkade na vijf pogingen** (alleen op de testomgeving, je zit daarna een kwartier vast). Typ vijf keer achter elkaar een fout wachtwoord. Verwacht: *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.* (hfst 1.1, 12.1)
- [ ] **Eigen wachtwoord, de hint.** Klik rechtsboven op je naam. Kies **Profiel**. Open het tabblad **Wachtwoord**. Verwacht onder het veld: *Minimaal 10 tekens, met hoofdletter, kleine letter en cijfer*. **(nieuw)** (hfst 1.1, 10.2)
- [ ] **Wachtwoord van 9 tekens.** Vul **Huidig wachtwoord** in. Vul een nieuw wachtwoord van 9 tekens in. Vul de bevestiging in. Klik op **Wachtwoord wijzigen**. Verwacht: *Het nieuwe wachtwoord heeft minimaal 10 tekens nodig.* Er wordt niets gewijzigd. **(nieuw)** (hfst 1.1, 10.2)
- [ ] **Wachtwoord zonder hoofdletter of cijfer.** Probeer een wachtwoord van 10 kleine letters. Verwacht: een melding dat het wachtwoord een kleine letter, een hoofdletter en een cijfer nodig heeft (*Gebruik een kleine letter, een hoofdletter en een cijfer.*). **(nieuw)** (hfst 1.1, 10.2)
- [ ] **Bevestigingsveld leeg.** Laat **Bevestig nieuw wachtwoord** leeg. Verwacht: *Bevestig je nieuwe wachtwoord.* (hfst 1.1)
- [ ] **Twee verschillende wachtwoorden.** Vul twee verschillende wachtwoorden in. Verwacht: *De wachtwoorden komen niet overeen.* Wijzig daarna het nieuwe wachtwoord. De app controleert het bevestigingsveld dan opnieuw. (hfst 1.1)
- [ ] **Wachtwoord echt wijzigen** (op een testaccount). Vul een geldig nieuw wachtwoord in, bijvoorbeeld `OefenWacht1x`. Verwacht: de melding *Gelukt* met de tekst *Je wachtwoord is succesvol gewijzigd!* Log uit. Log in met het nieuwe wachtwoord. Zet het daarna terug. **(nieuw)** (hfst 1.1)

### Het hoofdscherm

- [ ] **Menu van de beheerder.** [beheerder] Verwacht links: **Dashboard · Voertuigen · Scannen · Klanten · Klantenportaal · Reserveringen · Onderhoud · Kosten · Documenten · Transporten · Communicatie · Rapporten**. (hfst 1.2)
- [ ] **Menu van een beperkt account.** [kijker] Verwacht: je ziet alleen de items waar je rechten voor hebt. **Onderhoud**, **Kosten** en **Documenten** ontbreken. Er is geen foutmelding. (hfst 1.2, 15.8)
- [ ] **Bolletje achter Klantenportaal.** Kijk of er een rood getal achter **Klantenportaal** staat. Verwacht: dat getal is het aantal ongelezen portaalmeldingen. (hfst 1.2)
- [ ] **De balk bovenin.** Verwacht van links naar rechts: de naam van het scherm, het zoekveld **Zoeken...**, het belletje, en je initialen en naam. Staat er iets open in het portaal? Dan staat er ook een tegel zoals *2 nieuwe aanvragen · 7 meldingen · Klantenportaal*. (hfst 1.2)
- [ ] **Een venster sluiten.** Open een klant met **Bekijken**. Sluit het venster met **Sluiten**. Doe het ook met **Terug**, met het kruisje en met Esc. Verwacht: het scherm eronder blijft staan. (hfst 1.2)

### Zoeken

- [ ] **Zoeken op kenteken.** Klik in **Zoeken...**. Typ een half kenteken zonder streepjes. Verwacht na een korte pauze: een groep **Voertuigen** met de auto. (hfst 1.3)
- [ ] **Minimaal twee tekens.** Typ één teken. Verwacht: er gebeurt niets. (hfst 1.3)
- [ ] **Zoeken op klant.** Typ een naam of e-mailadres. Verwacht: de groepen **Klanten** en **Reserveringen**. (hfst 1.3)
- [ ] **Zoeken op contractnummer.** Typ het nummer van een opgehaalde huur. Verwacht: de reservering, met *Contractnr. …* bij het resultaat. (hfst 1.3)
- [ ] **Zoeken op merk of model.** Typ een merk of model. Verwacht: de voertuigen van dat merk. (hfst 1.3)
- [ ] **Sneltoetsen voor zoeken.** Druk op `/`. Druk daarna op `Ctrl+K`. Verwacht: de cursor staat in het zoekveld. (hfst 1.3, 2.11)
- [ ] **Alle resultaten.** Zoek iets met veel treffers. Klik op **Bekijk alle resultaten** of druk op Enter. Verwacht: een groter venster *Zoekresultaten voor "…"*. (hfst 1.3)
- [ ] **Een resultaat openen.** Klik een resultaat aan. Verwacht: het opent in een venster over je scherm heen. (hfst 1.3)

### De taken die je het vaakst doet

- [ ] **Wat er vandaag meegaat.** Ga naar **Reserveringen**. Kijk in het vakje van vandaag. Verwacht: per auto het kenteken met **uit** of **in**, en de klant. (hfst 1.4, 5.1)
- [ ] **Een auto meegeven, de hele weg.** De uitgebreide regels staan bij hoofdstuk 5 (5.7). Hier: ga naar **Dashboard** → **Snelle acties** → **Ophalen starten**. Scan of typ het kenteken. Verwacht: het venster **Ophaalproces starten**. (hfst 1.4)
- [ ] **Geen ophaling klaar.** Scan een auto zonder ophaling. Verwacht: geen venster, alleen de gegevens van de auto. (hfst 1.4)
- [ ] **Een auto terugnemen, de hele weg.** Zie 5.8. Hier: klik op **Innemen starten**. Scan een opgehaalde auto. Verwacht: **Inleverproces starten**. (hfst 1.4)
- [ ] **Lagere kilometerstand bij het inleveren.** Vul een stand in die lager is dan bij het ophalen. Verwacht: *Kilometerstand bij inleveren kan niet lager zijn dan bij ophalen (… km).* (hfst 1.4, 5.8)
- [ ] **Een nieuwe klant, kort.** Ga naar **Klanten** → **Klant toevoegen**. Vul de naam en het **Klanttype** in. Klik op **Klant toevoegen**. Verwacht: *Klant succesvol aangemaakt*. De uitgebreide regels staan bij hoofdstuk 3. (hfst 1.4, 3.3)
- [ ] **Een nieuwe reservering, kort.** Druk op `N`. Kies datums, een voertuig en een klant. Klik op **Reservering aanmaken**. Verwacht: *Reservering succesvol aangemaakt*. Er is geen statusveld. Er staat een knop **Nu ophalen**. **(nieuw)** (hfst 1.4, 5.3)
- [ ] **Gele balk bij onderhoud.** Boek een auto die in die periode gepland onderhoud heeft. Verwacht: een gele balk *Let op: dit voertuig staat in deze periode ingepland voor onderhoud (… t/m …). Opslaan mag; het onderhoudsblok blijft staan.* (hfst 1.4, 5.3)
- [ ] **Rode balk bij een bezette auto.** Boek een auto die in die periode al gereserveerd is. Verwacht: een rode balk en een grijze knop **Reservering aanmaken**. (hfst 1.4, 5.3)
- [ ] **Een voertuig opzoeken.** Ga naar **Voertuigen**. Klik op **Bekijken**. Verwacht: **Voertuiggegevens** met de tabbladen **Algemeen**, **Kosten**, **Documenten**, **Reserveringen**, **Onderhoud**, **Geschiedenis** en **Fiscaal**. Een klik ergens op de regel opent de auto ook. (hfst 1.4, 4.2)
- [ ] **Een reservering opzoeken.** Typ in het zoekveld een kenteken, klantnaam of contractnummer. Klik onder **Reserveringen** op de regel. Verwacht: **Reserveringsdetails**. (hfst 1.4, 5.4)

### Uitloggen en de sessie

- [ ] **Uitloggen.** Klik rechtsboven op je naam. Kies **Uitloggen**. Verwacht: je staat weer op het inlogscherm. (hfst 1.5)
- [ ] **Waarschuwing voor het verlopen van de sessie** (laat het scherm 14 minuten met rust). Verwacht: het venster **Sessie verloopt binnenkort** met een aftelling en de knoppen **Ingelogd blijven** en **Nu uitloggen**. (hfst 1.5)
- [ ] **Sessie verlopen.** Doe niets na die waarschuwing. Verwacht: de melding *Sessie verlopen* met de tekst *Je bent uitgelogd wegens inactiviteit*. (hfst 1.5, 12.1)
- [ ] **Niet doen in de eerste week.** Probeer een bestaande reservering "even" op een andere status te zetten. Verwacht: dat kan niet. Het formulier heeft geen statuslijstje. **(nieuw)** (hfst 1.6, 5.6)

---

## Hoofdstuk 2 — Navigatie

### Het menu

- [ ] **Elk menu-item opent.** [beheerder] Klik alle twaalf items één voor één aan. Verwacht: elk scherm laadt zonder rode melding. (hfst 2.1)
- [ ] **Geen menu-item Bekeuringen.** [kantoor met Boetes beheren] Verwacht: **Bekeuringen** staat niet in het menu. De lijst open je met de knop **Bekeuringen** bovenaan **Klantenportaal**. (hfst 2.1, 2.6)
- [ ] **Instellingen, gebruikers en back-up staan niet in het menu.** Verwacht: ze staan rechtsboven achter je naam, onder het kopje **Beheer**. Alleen [beheerder] ziet ze. (hfst 2.1, 2.10)
- [ ] **Smal scherm.** Maak het browservenster smal. Verwacht: het menu klapt open met het knopje linksboven. (hfst 2.1)

### Dashboard

- [ ] **Back-upbalk.** Kijk of er een balk staat met *Geen geverifieerde back-up bekend* of *Geen geverifieerde back-up in … uur*. Verwacht: staat die balk er, dan meld je dat aan de beheerder. (hfst 2.2)
- [ ] **Balk met geweigerde pogingen.** [beheerder] Zie hoofdstuk 10 in deze lijst, onderdeel Geweigerde pogingen. **(nieuw)** (hfst 2.2, 10.2)
- [ ] **Snelle acties.** Verwacht: vijf grote tegels (**Ophalen starten**, **Innemen starten**, **Scannen**, **Nieuwe reservering**, **Schadecheck starten**). Zie ook 2.9. (hfst 2.2)
- [ ] **Vier signaalblokken.** Verwacht: **Beschikbare voertuigen**, **APK verloopt binnenkort**, **Achterstallige verhuringen** en **Garantie verloopt binnenkort**. (hfst 2.2)
- [ ] **Achterstallig, het oogje.** Klik op het oogje achter een regel. Verwacht: de reservering opent. (hfst 2.2)
- [ ] **Beheer vervangende voertuigen.** Verwacht: de tabbladen **Nog te bepalen**, **Aankomend** en **Actief**. Op **Nog te bepalen** staat de knop **Voertuig toewijzen**. (hfst 2.2)
- [ ] **Recente kosten.** Verwacht: de knop **Alles bekijken** staat er alleen voor wie **Kosten beheren** heeft. Een categorie staat in het Nederlands (**Banden**, niet *Tires*). (hfst 2.2)
- [ ] **Aankomende reserveringen en kalender.** Verwacht: een tabel met **Voertuig**, **Klant**, **Periode** en **Acties**. Daarnaast een kleine maandkalender met **Reservering toevoegen**. (hfst 2.2)

### Voertuigen

- [ ] **Knoppen rechtsboven.** Verwacht: **Verwijderde voertuigen**, **Barcodeboek**, **Sleutelkast-audit**, **Reservesleutelkast-audit**, **Bulk importeren** en **Voertuig toevoegen**. (hfst 2.3)
- [ ] **Voertuigenpark.** Verwacht: een lijst met kenteken, statuslabel, merk en model en APK-datum. Per regel staat **Bekijken** en **Reserveren** of **Verhuur bekijken**. (hfst 2.3)
- [ ] **Statuslabels.** Zoek een voorbeeld van *Beschikbaar*, *Gepland*, *Verhuurd*, *Reparatie nodig* en *Niet voor verhuur*. (hfst 2.3, 4.6)
- [ ] **Niet voor verhuur is niet te reserveren.** Verwacht: **Reserveren** is grijs met *Voertuig is niet beschikbaar voor verhuur*. (hfst 4.1)
- [ ] **Beschikbaar overal gelijk.** Kijk naar een auto die in onderhoud staat. Verwacht: die telt nergens als beschikbaar, ook niet op het dashboard. (hfst 2.3, 4.6)
- [ ] **De acht prullenbakken.** Controleer dat elk scherm zijn eigen prullenbak heeft: **Verwijderde voertuigen**, **Verwijderde klanten**, **Verwijderde reserveringen**, **Verwijderd onderhoud**, **Verwijderde transporten**, **Verwijderde kostenposten** **(nieuw)**, **Prullenbak** bij de bekeuringen en **Verwijderde chauffeurs** **(nieuw)**. (hfst 2.3, 10.6)
- [ ] **Prullenbak grijs zonder vinkje.** [zonder Prullenbak beheren] Verwacht: de knop **Verwijderde voertuigen** staat er, maar is grijs. Er staat uitleg bij. (hfst 2.3, 4.12)

### Scannen

- [ ] **Scanscherm.** Druk op `S` of klik op **Scannen**. Verwacht: **Barcode scannen** met de tekst *Scan een sleutellabel met een barcodescanner of camera, of typ de code handmatig.* (hfst 2.4, 18.1)
- [ ] **Een code typen.** Typ een `VEH-…`-code. Typ daarna een `RES-…`-code en een kenteken. Verwacht: het voertuig of de reservering met status, APK-datum, kilometerstand, brandstof en de acties. (hfst 2.4, 18.2)
- [ ] **Recente scans.** Verwacht: onderaan staan je laatste scans. (hfst 2.4, 18.5)

### Klanten

- [ ] **Klantendatabase.** Verwacht: **Klant toevoegen** en **Verwijderde klanten** rechtsboven. Verder een zoekveld, een sorteerkeuze en **Filters**. De kolommen zijn **Naam**, **E-mail**, **Telefoon** en **Plaats**. Per regel staat **Bekijken**, **Nieuwe reservering** en **Verwijderen**. (hfst 2.5, 3.1)
- [ ] **Klantkaart.** Klik op **Bekijken**. Verwacht: **Klantgegevens** met de tabbladen **Persoonlijke gegevens**, **Chauffeurs**, **Actieve verhuringen**, **Geschiedenis** en **Portaal**. Onderaan staat **Geblokkeerde voertuigen** met de knop **Voertuig blokkeren**. Een klik ergens op de regel opent de klant ook. (hfst 2.5, 3.2)

### Klantenportaal en bekeuringen

- [ ] **Scherm Klantenportaal beheren.** Verwacht: de knoppen **Bekeuringen**, **Brieven scannen** en **Account uitnodigen**. Verder acht tegels (**Aanvragen**, **Onderhoud**, **Bekeuringen**, **Klanten**, **Accounts**, **Voertuigen online**, **Blacklist**, **Activiteit**) en vier panelen (**Aandacht nodig**, **Meldingen**, **Aankomende reserveringen**, **Klanten**). (hfst 2.6)
- [ ] **Een bekeuring openen.** Klik op de tegel **Bekeuringen**. Klik op een regel. Verwacht: het bedrag, de **Administratiekosten**, het **Totaal**, de klant, de reservering en de bestuurder. (hfst 2.6)
- [ ] **Administratiekosten wijzigen.** Wijzig het bedrag. Klik op **Opslaan**. Sluit de bekeuring en open hem opnieuw. Verwacht: het bedrag is bewaard. (hfst 2.6)
- [ ] **Opmaak.** Verwacht: bedragen als € 95,00, tijden zonder seconden en kentekens met streepjes. (hfst 2.6)
- [ ] **Bekeuring annuleren.** Open een bekeuring. Klik op **Bekeuring annuleren**. Verwacht: *Bekeuring PT-99-ZY van € 95,00 annuleren? Je kunt hem daarna weer heractiveren.* met de knop **Nee, laten staan**. Kies **Nee, laten staan**. Doe het dan nog een keer en bevestig wel. Verwacht: *Bekeuring geannuleerd.* (hfst 2.6)
- [ ] **Bekeuring heractiveren.** Heractiveer de bekeuring. Verwacht: *Bekeuring heractiveerd.* (hfst 2.6)
- [ ] **Wijzigingen verwerpen in een bekeuring.** Typ iets. Sluit het venster. Verwacht: **Wijzigingen verwerpen?** (hfst 2.6)
- [ ] **Nieuwe bekeuring en Brieven scannen.** Bekijk beide knoppen. Verwacht: beide hebben uitleg in het venster en een tekstje bij de muis. (hfst 2.6)
- [ ] **Alleen registreren.** Open het filter **Alle statussen**. Verwacht: alleen **Niet gekoppeld**, **Gekoppeld** en **Geannuleerd**. **Doorbelast**, **Betaald** en **Betwist** ontbreken. Alleen oude bekeuringen die ze al hadden, houden ze. **(nieuw)** (hfst 2.6)
- [ ] **Geen automatische mail.** Voer een bekeuring in. Lees er een in. Koppel er een aan een klant. Verwacht: de klant ontvangt niets. Kijk dat na in het **E-maillogboek** onder **Communicatie**. **(nieuw)** (hfst 2.6, 9.1)
- [ ] **Klant informeren.** Open een gekoppelde bekeuring. Klik op **Klant informeren**. Verwacht: **Klant informeren?** met *Een e-mail over bekeuring … gaat naar …, en de klant krijgt een melding in het portaal.* Kies **Nee, niet sturen**. Verwacht: er gebeurt niets. **(nieuw)** (hfst 2.6)
- [ ] **Klant informeren, versturen.** [kantoor, mailadres = je eigen adres] Bevestig. Verwacht: **Klant geïnformeerd.** In het venster staat *Klant geïnformeerd op <datum>*. De mail komt aan. De knop heet nu **Opnieuw informeren**. **(nieuw)** (hfst 2.6)
- [ ] **Opnieuw informeren.** Klik op **Opnieuw informeren**. Verwacht: *De klant is al geïnformeerd op <datum>. Opnieuw een e-mail … sturen naar …?* **(nieuw)** (hfst 2.6)
- [ ] **Klant informeren staat er niet altijd.** Verwacht: de knop staat er alleen bij een gekoppelde bekeuring met een klant. En alleen voor wie **Boetes beheren** heeft. **(nieuw)** (hfst 2.6)
- [ ] **Bekeuring zonder bedrijfsnaam.** Open een bekeuring van een klant zonder **Bedrijfsnaam**. Verwacht: in de bekeuring staat de naam van de klant, geen lege regel. (hfst 2.6)

### Reserveringen en de andere schermen

- [ ] **Reserveringskalender.** Verwacht: **Lijstweergave**, **Voltooid bekijken (…)**, **Verwijderde reserveringen**, **… achterstallig** (als die er zijn), **Administratie** en **Nieuwe reservering**. Boven de kalender staan **Kleuren**, **Vandaag**, de maandnavigatie en de filters. (hfst 2.7, 5.1)
- [ ] **Administratie.** Klik op **Administratie**. Verwacht: *Administratie - Factuurgegevens* met de tabbladen **Huidige verhuur** en **Geschiedenis**. Zoek en sorteer op **Ophaaldatum**, **Kenteken**, **Bedrijf** en **Contract #**. (hfst 2.7)
- [ ] **Onderhoud, het scherm.** [werkplaats] Verwacht: **Onderhoudskalender** met **Lijstweergave**, **Voltooide bekijken (…)**, **Verwijderd onderhoud** en **Onderhoud plannen**. (hfst 2.8, 7.1)
- [ ] **Kosten, het scherm.** [kantoor] Verwacht: **Kostenbeheer** met **Factuur scannen**, **Kosten registreren**, **Kostenoverzicht** en **Kostensamenvatting**. (hfst 2.8)
- [ ] **Kostenoverzicht filteren.** Filter op **Voertuig** (kenteken met of zonder streepjes), **Van**, **Tot en met**, **Categorie** en het zoekveld. Verwacht: de **Kostensamenvatting** rekent precies over wat je ziet (*Totaal van de gekozen filters*). **Filters wissen** zet alles terug. **Deze maand**, **Vorige maand** en **Dit jaar** zetten de periode in één klik. (hfst 2.8, 13.10)
- [ ] **Per categorie en Alle kosten.** Verwacht: standaard staat elke categorie ingeklapt, met aantal en totaal. Klik erop. Je ziet dan de vijf nieuwste en **Alle N tonen**. Kies **Alle kosten**. Je ziet dan één tabel met sorteerbare koppen en een paginakiezer. (hfst 2.8)
- [ ] **Exporteren (CSV).** Klik op **Exporteren (CSV)**. Verwacht: de melding **Bestand gemaakt** en een csv-bestand met puntkomma's, een decimale komma en datums als dd-mm-jjjj. Open het bestand in Excel. Met **Prijzen verbergen** staat de knop er niet. (hfst 2.8, 12)
- [ ] **Kosten registreren, een voertuig is verplicht.** Laat het voertuig leeg. Verwacht: *Kies een voertuig*. Ontbreekt de categorie, dan zie je *Kies een categorie*. Het venster heet **Nieuwe kosten toevoegen**, ook vanaf het Dashboard. (hfst 2.8)
- [ ] **Categorieën.** Verwacht de lijst **Onderhoud**, **Banden**, **Remmen**, **Schade**, **Brandstof**, **Verzekering**, **Registratie**, **Schoonmaak**, **Accessoires**, **Tol**, **Parkeren** en **Overig**. (hfst 2.8)
- [ ] **Verwijderde kostenposten.** [kantoor] Verwijder een oefenkostenpost. Open **Verwijderde kostenposten**. Verwacht: de kostenpost staat er, met zijn bon. **Terugzetten** brengt hem terug. **(nieuw)** (hfst 2.8, 10.6)
- [ ] **Ontvangen facturen: Logboek.** Open het venster **Ontvangen facturen**. Verwacht: naast **Nu ophalen** staat de knop **Logboek**. (hfst 2.8, 9.9)
- [ ] **Documenten, het scherm.** Verwacht: **Documentbeheer** met **Document uploaden** en de tabbladen **Documentbibliotheek**, **Contractsjablonen**, **Transportrapportsjablonen**, **Barcodelabels** en **Schadecheck-sjablonen**. (hfst 2.8, 8.3)
- [ ] **Transporten, het scherm.** Verwacht: **Transportdashboard** met **Route-optimalisatie**, de vier tellers, de zes tabbladen, **Nieuw transport** en **Verwijderde transporten**. De kolomkoppen sorteren. Een klik op een regel opent het transport. (hfst 2.8, 6.1)
- [ ] **Communicatie, het scherm.** Verwacht: **Klantcommunicatie** met de tabbladen **Meldingen versturen**, **Sjabloonbouwer**, **E-maillogboek** en **Analyse**. Onder **Meldingen versturen** staan **APK-herinneringen**, **Onderhoud** en **Aangepast bericht**. (hfst 2.8, 9)
- [ ] **Rapporten, het scherm.** Verwacht bovenaan de filterbalk met **Periode**, **Vergelijk met**, **Voertuig**, **Rapportbouwer** en **Onderhoudsanalyse**. De tabbladen zijn **Overzicht**, **Kosten**, **Voertuigen**, **Klanten**, **Transporten**, **Financieel**, **Fiscaal**, **Portaal** en **Kantoor**. Er zijn geen losse knoppen *Afdrukken: APK* enzovoort meer. (hfst 2.8, 13.13, 21.1)
- [ ] **Periode in de filterbalk.** Open **Periode**. Verwacht: **Deze maand**, **Vorige maand**, **Volgende maand**, **Dit kwartaal**, **Dit jaar**, **Alle gegevens** en **Zelf kiezen**. Naast het veld staan de datums, bijvoorbeeld *1-10-2026 t/m 31-10-2026*. (hfst 2.8, 21.1)
- [ ] **Afdrukken met voorbeeld.** Klik bij een rapport op **Afdrukken**. Verwacht: eerst een voorbeeld op A4 met **Tegels**, **Grafiek**, **Tabel** en **Liggend**. Pas **Afdrukken** in het voorbeeld opent het afdrukvenster van de browser. (hfst 2.8, 21.7)
- [ ] **Stijging vanaf 0.** Kies **Vergelijk met** **Vorige periode**. Verwacht: was een getal 0, dan staat er *nieuw* in plaats van een percentage. (hfst 2.8, 21.6)
- [ ] **Analyse onderhoudskosten.** Verwacht: *Telt alleen onderhoudskosten (...)*. Kosten per km zie je alleen bij **Alle tijd**, anders een streepje. Bij een merk met te weinig regels staat **Onvoldoende gegevens**. De maanden staan in het Nederlands. (hfst 2.8)
- [ ] **Rapportbouwer.** Maak een rapport. Voer het uit. Verwacht: **Exporteren naar CSV** en **Afdrukken** zijn grijs zolang er geen resultaat is. (hfst 2.8)
- [ ] **Opgeslagen rapport verwijderen.** Klik op *Rapport verwijderen: <naam>*. Verwacht: **Rapport verwijderen?** met de tekst *U staat op het punt het opgeslagen rapport "<naam>" te verwijderen. Dit kan niet ongedaan worden gemaakt.* Pas na **Verwijderen** is het weg. (hfst 2.8)
- [ ] **Alleen de fiscale check zien.** [account met Fiscaal bekijken, zonder rapportvinkje] Verwacht: **Rapporten** toont alleen de fiscale check, met de knop **Fiscale check**. (hfst 2.6, 15.4)

### Snelle acties en de balk

- [ ] **Ophalen starten opent eerst het scanvenster.** Verwacht onder de tegel: *Auto meegeven aan de klant*. Bij **Innemen starten** staat *Auto terugnemen van de klant*. Bij **Scannen** staat *Alleen opzoeken, niets starten*. (hfst 2.9, 18.7)
- [ ] **Nieuwe reservering vanaf het Dashboard.** Klik op **Annuleren**. Verwacht: alleen het venster sluit. Je blijft op het Dashboard. (hfst 2.9)
- [ ] **De kleinere knoppen.** Verwacht: **Voertuig toevoegen**, **Klant toevoegen**, **RDW APK-datums scannen**, **Document uploaden**, **Kosten registreren**, **Brandstofstatus bijwerken**, **Registratie wijzigen**, **APK-rapport uploaden** en **APK-meldingen versturen**. (hfst 2.9)
- [ ] **RDW APK-datums scannen.** Klik op de tegel. Verwacht: **RDW APK-datums scannen?** met **Scan starten**. Start de scan alleen op de testomgeving. Verwacht dan *De scan is gestart en loopt op de achtergrond.* (hfst 2.9, 4.7)
- [ ] **Meldingencentrum.** Klik op het belletje. Verwacht: de tabbladen **Alle**, **Reserveringen**, **Onderhoud**, **APK**, **Garantie** en **Aangepast**. Bij een melding staat **Markeer als gelezen** of **Markeer als ongelezen**. **Nieuwe melding** vraagt een titel, omschrijving, datum en prioriteit (**Hoog**, **Normaal**, **Laag**). (hfst 2.10, 16.4)
- [ ] **Eigen menu.** Klik op je naam. Verwacht: je naam en e-mailadres, **Profiel** en de taalknop (**English** of **Nederlands**). Voor [beheerder] staat er ook het kopje **Beheer** met **Gebruikers**, **Back-upbeheer** en **App-instellingen**. Onderaan staat **Uitloggen**. (hfst 2.10)
- [ ] **De taal omzetten.** Klik op **English**. Verwacht: de app staat in het Engels. Zet hem terug op **Nederlands**. (hfst 13.1)

### Sneltoetsen

- [ ] **`?`.** Druk op `?`. Verwacht: het overzicht **Sneltoetsen**. (hfst 2.11)
- [ ] **`N`.** Druk op `N`. Verwacht: het boekingsvenster **Nieuwe reservering**. (hfst 2.11)
- [ ] **`S`.** Druk op `S`. Verwacht: het scanvenster. (hfst 2.11)
- [ ] **`Esc` met niet-opgeslagen wijzigingen.** Typ iets in een formulier. Druk op Esc. Verwacht: **Wijzigingen verwerpen?** (hfst 2.11)
- [ ] **Losse letters in een invoerveld.** Typ `n`, `s` en `?` in een tekstveld. Verwacht: er opent geen venster. `Ctrl+K` werkt wel. (hfst 2.11)
- [ ] **Keuzelijst met het toetsenbord.** Open de klantkeuze in het reserveringsformulier. Typ iets. Ga met de pijltjes omhoog en omlaag. Kies met Enter. Sluit met Escape. Verwacht: dit werkt. Past er niets bij, dan staat er een melding in plaats van een lege lijst. (hfst 2.11)

---

## Hoofdstuk 3 — Klanten

### Opzoeken en bekijken

- [ ] **Klanten zoeken.** Ga naar **Klanten** → **Klanten zoeken**. Typ een deel van een naam, e-mailadres of plaats. Verwacht: de lijst filtert terwijl je typt. (hfst 3.1)
- [ ] **Sorteren.** Open de sorteerkeuze. Verwacht de keuzes: **Naam (A-Z)**, **Naam (Z-A)**, **Nieuwste eerst**, **Oudste eerst**, **Meeste verhuur**, **Recente activiteit** en **Actieve verhuur**. (hfst 3.1)
- [ ] **Filters.** Klik op **Filters**. Verwacht: *Klanten filteren* met **Recente klanten (30 dagen)**, **Frequente klanten (3+ reserveringen)**, **Volledig profiel**, **Onvolledig profiel**, **Actieve verhuur**, **Heeft chauffeurs**, **Zakelijk** en **Particulier**. **Filters wissen** zet ze uit. (hfst 3.1)
- [ ] **Portaallabel.** Zoek een klant met portaalaccounts. Verwacht: een blauw label zoals **Portaal (1)** onder het e-mailadres. (hfst 3.1)
- [ ] **Paginering.** Kijk onderaan. Verwacht: *1-10 van 300 getoond*, **Vorige** en **Volgende**, en *Pagina 1 van 30* met het invulveld **Pagina**. Typ een nummer en druk op Enter. Typ een nummer voorbij de laatste pagina. Verwacht: je komt op de laatste pagina. (hfst 3.1)
- [ ] **Klantkaart.** Klik op **Bekijken**. Verwacht: *Klant sinds <datum>* en vier tegels (**Totaal aantal verhuringen**, **Actieve verhuringen**, **Voltooid**, **Totaal aantal km gereden**). Verder de knoppen **Terug**, **Bewerken** en **Nieuwe reservering**, en vijf tabbladen. (hfst 3.2)
- [ ] **Niet opgegeven.** Kijk naar een leeg veld. Verwacht: er staat **Niet opgegeven**, geen fout. (hfst 3.2)
- [ ] **Geblokkeerde voertuigen.** Dit blok staat onderaan het eerste tabblad. Bij een klant zonder blokkade staat er *Deze klant is niet geblokkeerd voor enig voertuig.* Klik op **Voertuig blokkeren**. Kies een auto. Vul een reden in. Klik op **Blokkeren**. Verwacht: de auto staat in het blok, met de reden. **Blokkade opheffen** vraagt **Blokkade opheffen?** en haalt de auto weer weg. Open de voertuigkaart, tabblad **Reserveringen**, **Klant zwarte lijst**. Verwacht: daar zie je dezelfde blokkade. **(nieuw)** (hfst 3.2)
- [ ] **Geschiedenis exporteren.** Open het tabblad **Geschiedenis**. Klik op **Exporteren (CSV)**. Verwacht: **Bestand gemaakt**. (hfst 3.2)

### Aanmaken en bijwerken

- [ ] **Uitleg bovenin het formulier.** Klik op **Klant toevoegen**. Verwacht: een blokje met uitleg. Het zegt dat alleen de naam verplicht is. Het zegt ook wat je nodig hebt voor een reservering en het contract. (hfst 3.3)
- [ ] **Alleen naam invullen.** Vul alleen **Volledige naam** in. Klik op **Klant toevoegen**. Verwacht: *Klant succesvol aangemaakt* met de tekst *De klant is toegevoegd aan je systeem.* (hfst 3.3)
- [ ] **Naam te kort.** Typ één teken. Verwacht onder het veld: *De naam moet minimaal 2 tekens bevatten*. (hfst 3.3)
- [ ] **Hoofdletters.** Typ *jan van der berg*. Verwacht: *Jan van der Berg*. Typ *DHL Express B.V.*. Verwacht: dit blijft zoals je het typte. (hfst 3.3)
- [ ] **Alle tabbladen.** Vul **Basisgegevens**, **Contact**, **Bedrijf** en **Aanvullend** in. Sla op. Verwacht: alles staat op de klantkaart. (hfst 3.3)
- [ ] **Voorbeelden zijn alleen voorbeelden.** Kijk naar de grijze voorbeeldtekst (*Jan Jansen*). Verwacht: die wordt niet opgeslagen. (hfst 3.3)
- [ ] **Wijzigingen verwerpen?** Typ iets. Sluit het venster. Verwacht: **Wijzigingen verwerpen?** met **Verder bewerken** en **Verwerpen**. Hetzelfde gebeurt bij **Klant bewerken**. (hfst 3.3)
- [ ] **Waarschuwing "bestaat mogelijk al".** Typ op **Contact** een e-mailadres of telefoonnummer dat al bestaat. Verwacht: een oranje kader *Deze klant bestaat mogelijk al* met de naam, *zelfde e-mailadres* en een knop **Openen**. Er staat ook *Je kunt gewoon doorgaan; dit is een waarschuwing, geen blokkade.* (hfst 3.4)
- [ ] **Klant bijwerken.** Klik op **Bekijken** → **Bewerken**. Wijzig iets. Klik op **Klant bijwerken**. Verwacht: *Klant succesvol bijgewerkt*. In de **Geschiedenis** staat een regel met de oude en de nieuwe waarde. (hfst 3.5)

### Chauffeurs

- [ ] **Chauffeur toevoegen.** Open een klant. Ga naar het tabblad **Chauffeurs**. Klik op **Chauffeur toevoegen**. Vul alleen **Weergavenaam** in. Klik op **Chauffeur toevoegen**. Verwacht: *Chauffeur toegevoegd* met de tekst *De chauffeur is succesvol toegevoegd.* (hfst 3.6)
- [ ] **Alle chauffeurvelden.** Vul ook de rijbewijsgegevens in. Voeg een **Kopie rijbewijs (optioneel)** toe (jpg, png of pdf, maximaal 10 MB). Vul **Status** en **Hoofdchauffeur** in. Verwacht: de lijst toont het label **Hoofd**. (hfst 3.6)
- [ ] **Rijbewijs verloopt.** Vul een **Vervaldatum rijbewijs** in de toekomst in. Vul daarna een datum in het verleden in. Verwacht: **Verloopt: <datum>** en **Verlopen**. (hfst 3.6)
- [ ] **Chauffeurlijst.** Verwacht: de kolommen **Chauffeur**, **Contact**, **Rijbewijs**, **Voertuig**, **Status** en **Acties** met **Bekijken**, **Bewerken** en **Verwijderen**. Verder het zoekveld *Zoek chauffeurs op naam, e-mail, telefoon of rijbewijs...* en paginering. (hfst 3.6)
- [ ] **Chauffeur verwijderen.** Klik op **Verwijderen**. Verwacht: *Weet je zeker dat je <naam> wilt verwijderen? De chauffeur gaat naar de prullenbak van deze klant; terugzetten kan via Prullenbak.* **(nieuw)** (hfst 3.6)
- [ ] **Verwijderde chauffeurs.** [kantoor] Klik op **Verwijderde chauffeurs** in de kop van **Bevoegde chauffeurs**. Verwacht: alleen de verwijderde chauffeurs van déze klant. **(nieuw)** (hfst 3.6, 10.6)
- [ ] **Chauffeur terugzetten.** Klik op **Terugzetten**. Verwacht: de chauffeur staat weer in de lijst. **(nieuw)** (hfst 3.6)
- [ ] **Chauffeur terugzetten terwijl de klant in de prullenbak staat.** Probeer dit. Verwacht: *De klant van deze chauffeur bestaat niet meer. Zet eerst de klant terug (Klanten, Verwijderde klanten) en daarna de chauffeur.* **(nieuw)** (hfst 3.6, 12)
- [ ] **Chauffeur definitief verwijderen.** [kantoor, oefenchauffeur] Klik op **Definitief verwijderen**. Bevestig. Verwacht: de chauffeur is weg, samen met de kopie van het rijbewijs. **(nieuw)** (hfst 3.6, 10.6)
- [ ] **Prullenbak chauffeurs grijs zonder vinkje.** [zonder Prullenbak beheren] Verwacht: de knop **Verwijderde chauffeurs** is grijs. Een tik toont het vinkje dat je mist. **(nieuw)** (hfst 3.6, 15.16)

### Het portaal van een klant

- [ ] **Tabblad Portaal.** Open het tabblad. Verwacht van boven naar beneden: **Portaalaccounts**, **Instellingen voor deze klant**, **Aanvragen**, **Bekeuringen** en **Activiteit in het portaal**. Zonder accounts staat er *Nog geen accounts. Nodig een contactpersoon uit.* (hfst 3.7)
- [ ] **Uitnodigen.** [kantoor, je eigen mailadres] Klik op **Uitnodigen**. Verwacht: het e-mailadres staat voorgevuld (*Vooraf ingevuld vanuit de klantgegevens; aanpassen mag.*). Vul **Naam** en **Rol** in (**Beheerder** of **Bestuurder**). Bij **Bestuurder** vul je ook **Gekoppelde bestuurder** in. Haal onder **Rechten voor dit account** een vinkje weg. Klik op **Uitnodigen**. Verwacht: de status **Uitnodiging open**. De uitnodiging komt aan. (hfst 3.7)
- [ ] **Accountlijst.** Verwacht: de kolommen **Naam**, **E-mail**, **Rol**, **Status** en **Laatste login**. De statussen zijn **Uitnodiging open**, **Niet geactiveerd**, **Actief** en **Geblokkeerd**. (hfst 3.7)
- [ ] **Menu achter een account.** Open het menu. Verwacht: **Bewerken en rechten**, **Uitnodiging opnieuw sturen** (alleen bij niet geactiveerd), **Wachtwoord-reset sturen** (alleen bij geactiveerd), **Blokkeren** of **Deblokkeren**, en **Verwijderen** (alleen bij niet geactiveerd). (hfst 3.7)
- [ ] **Mail niet verstuurd.** Maak de mailinstelling kapot (testomgeving). Stuur een uitnodiging. Verwacht in het rood: *De e-mail is niet verstuurd. Controleer de e-mailinstellingen en probeer het opnieuw.* (hfst 3.7)
- [ ] **Blokkeren.** Klik op **Blokkeren**. Verwacht: **Account blokkeren?** met de tekst *<naam> kan daarna niet meer inloggen in het portaal. U kunt het account later weer deblokkeren.* Daarna zie je **Account geblokkeerd.** **Deblokkeren** geeft **Account gedeblokkeerd.** Bij een geblokkeerd account ontbreken de uitnodiging en de reset. (hfst 3.7)
- [ ] **Account verwijderen.** Klik op **Verwijderen**. Verwacht: **Account verwijderen?** en daarna **Account verwijderd.** (hfst 3.7)
- [ ] **Portaalwachtwoord.** Verwacht: het portaal vraagt van de klant minimaal 10 tekens. Er zijn geen eisen aan hoofdletters of cijfers. Jij zet nooit het wachtwoord. (hfst 3.7)
- [ ] **Instellingen voor deze klant.** Zet de schakelaars om: **Portaal actief**, **Mag online huren (aanvraag)**, **Mag bestuurders beheren**, **Mag aanvragen indienen**, **Mag eerder inleveren (terugbrengen) aanvragen**, **Ziet bekeuringen**, **Ziet contracten en schadeformulieren** en **Ziet prijzen**. Verwacht: een regel onder elke schakelaar. Een melding zegt welke schakelaar je omzette. Er staat blijvend *Opgeslagen om 14:32*. Na **Opslaan** zie je *Instellingen opgeslagen.* (hfst 3.7)
- [ ] **Fiscale schakelaars grijs.** Zet de hoofdschakelaar uit. Verwacht: de fiscale schakelaars zijn grijs, met uitleg. (hfst 3.7)
- [ ] **Bovengrens.** Zet **Ziet prijzen** uit bij de klant. Verwacht: geen enkel account van die klant ziet prijzen. (hfst 3.7)
- [ ] **Aanvragen afhandelen.** Klik op **Alles bekijken en zoeken**. Ga naar **Klantenportaal** → tegel **Aanvragen**. Open een aanvraag. Klik op **Standaardantwoord invullen**. Kies **Ontvangen**, **Akkoord** of **Afwijzing**. Er zijn twee knoppen. **Bericht plaatsen** houdt de aanvraag open en stuurt geen mail. **Antwoord mailen (blijft open)** stuurt wel een mail. (hfst 3.7)
- [ ] **Voertuigen online.** Klik op de tegel **Voertuigen online**. Zet een auto met de status **Reparatie nodig** online. Verwacht: *<kenteken> heeft de status "…" en kan niet worden verhuurd. … Toch online aanbieden?* met de knop **Toch online aanbieden**. Dit werkt ook bij meerdere auto's tegelijk. (hfst 3.7)

### Een klant verwijderen en terugzetten

- [ ] **Venster Klant verwijderen.** Klik op **Verwijderen** bij een oefenklant. Verwacht: *Dit verwijdert ook:* met een lijst (of *Er is niets anders aan deze klant gekoppeld.*). Er staat ook *Een beheerder kan de klant daarna terugzetten vanuit de prullenbak.* (hfst 3.8)
- [ ] **Naam overtypen.** Verwacht: **Klant verwijderen** staat uit tot je de naam hebt overgetypt. Hoofdletters en extra spaties maken niet uit. (hfst 3.8)
- [ ] **Klant met lopende huur.** Probeer een klant met een lopende huur te verwijderen. Verwacht in het rood: *Verwijderen kan niet: deze klant heeft een lopende of toekomstige reservering.* met de reserveringen erbij. De knop blijft uit, ook als je de naam overtypt. (hfst 3.8)
- [ ] **Terugzetten.** Ga naar **Verwijderde klanten**. Klik op **Terugzetten**. Verwacht: de klant is terug. (hfst 3.8, 10.6)
- [ ] **Definitief verwijderen.** [kantoor, oefenklant] Klik op **Definitief verwijderen**. Verwacht: **Definitief verwijderen?**. Bevestig. Verwacht: de klant is weg. Het debiteurnummer komt vrij. Heeft de klant fiscale beoordelingen? Dan gaan die mee. De bevestiging noemt dan het aantal. **(nieuw)** (hfst 3.8, 10.6)

### Debiteurnummer

- [ ] **Nummer al bezet.** Geef een tweede klant een **Debiteurnummer** dat al bestaat. Verwacht: een rode veldfout *Dit debiteurnummer is al in gebruik bij klant <naam>.* Er komt geen melding rechtsboven. Zat je op een ander tabblad? Dan springt het formulier terug naar **Basisgegevens**. (hfst 3.9)
- [ ] **Nummer van een klant in de prullenbak.** Gebruik het nummer van een klant die in de prullenbak staat. Verwacht: *Dit debiteurnummer hoort bij klant <naam> in de prullenbak. Zet die klant terug of verwijder hem definitief uit de prullenbak.* (hfst 3.9)
- [ ] **Leeg nummer mag.** Laat het debiteurnummer leeg. Verwacht: opslaan lukt. (hfst 3.9)

---

## Hoofdstuk 4 — Voertuigen

### Doorzoeken

- [ ] **Zoeken.** Ga naar **Voertuigen**. Typ in *Zoeken op kenteken, merk of model...*. Verwacht: de lijst filtert. Het kruisje wist de zoekterm. (hfst 4.1)
- [ ] **Sorteren op.** Open de sorteerkeuze. Verwacht de keuzes: **Standaard (ID)**, **Kenteken**, **Merk**, **APK-datum (eerst vroegste)**, **APK-datum (eerst laatste)**, **Beschikbaarheid (beschikbaar eerst)** en **Beschikbaarheid (gereserveerd eerst)**. (hfst 4.1)
- [ ] **Tonen, los van sorteren.** Open de keuzelijst **Tonen:**. Verwacht: **Alle voertuigen**, **Reparatie nodig**, **Opnaam**, **BV** en **Niet opgegeven**. Kies *Opnaam* en sorteer op **Kenteken**. Verwacht: beide werken samen. (hfst 4.1)
- [ ] **Filter functies.** Vink **GPS**, **Reservesleutel** en andere functies aan. Verwacht: **Alles geselecteerd** of **Iets geselecteerd**, en een knop **Wissen**. (hfst 4.1)
- [ ] **Kolommen.** Verwacht: **Acties**, **Kenteken**, **Merk**, **Model**, **Type**, **Status**, **Registratie**, **GPS**, **Radiocode**, **Bandenmaat** en **APK verloopt**. (hfst 4.1)
- [ ] **Pagina.** Typ in het invulveld **Pagina** een nummer voorbij de laatste pagina. Verwacht: je komt op de laatste pagina. (hfst 4.1)
- [ ] **Registratie en APK-kolom.** Verwacht: *Sinds: <datum>*. Bij APK staat het aantal dagen of *… dagen te laat*. Zonder datum staat er **Niet ingesteld**. Bij onbekend staat er **N.v.t.** (hfst 4.1)

### Bekijken en toevoegen

- [ ] **Voertuigkaart.** Klik op **Bekijken**. Verwacht: **Voertuiggegevens - <merk> <model> (<kenteken>)** met de barcode. De knoppen zijn **Sleutellabel**, **Reservesleutel-label**, **Terug**, **Barcode bekijken**, **Bewerken**, **Brandstofstatus bijwerken**, **Verwijderen** en **Nieuwe reservering**. Er zijn zes tegels en zes tabbladen. Zonder garantiedatum staat er *Geen garantiedatum*. (hfst 4.2)
- [ ] **Voertuig toevoegen.** Klik op **Voertuig toevoegen**. Vul **Kenteken**, **Merk** en **Model** in. Klik op **Voertuig toevoegen**. Verwacht: *Voertuig succesvol aangemaakt* met de tekst *Het voertuig is toegevoegd aan je wagenpark.* (hfst 4.3)
- [ ] **Formulier niet compleet.** Laat het kenteken leeg. Verwacht: een rood blok **Het formulier is nog niet compleet** en dezelfde melding rechtsboven. (hfst 4.3)
- [ ] **RDW opzoeken.** Vul een kenteken in. Klik op **Opzoeken**. Verwacht: *Voertuiggegevens gevonden* met de tekst *Voertuiggegevens succesvol opgehaald uit de RDW-database.* Merk, model, type, brandstof, chassisnummer, APK-datum en bouwdatum zijn ingevuld. (hfst 4.3)
- [ ] **RDW kent het kenteken niet.** Vul een onbekend kenteken in. Verwacht: *Voertuig niet gevonden* met de tekst *Geen voertuig gevonden met dit kenteken in de RDW-database. Controleer het kenteken en probeer het opnieuw.* (hfst 4.3)
- [ ] **Bus met negen zitplaatsen.** Zoek een bus met negen zitplaatsen op (Transporter, Ducato, Boxer, Transit, Vito, Trafic of Scudo). Verwacht: het voertuigtype is **Van**, niet **SUV**. Een gewone gezinsauto of MPV met minder zitplaatsen blijft **SUV**. (hfst 4.3)
- [ ] **Sluiten met wijzigingen.** Vul iets in. Klik op **Annuleren**. Verwacht: **Wijzigingen verwerpen?** (hfst 4.3)

### Bulk importeren

- [ ] **Bulk importeren, handmatig.** Klik op **Bulk importeren**. Ga naar het tabblad **Handmatig invoeren**. Typ een bestaand en een nieuw kenteken, één per regel. Klik op **Import starten**. Verwacht: *Import verwerken...* en daarna **Importresultaten** met *<n> geïmporteerd, <n> met waarschuwing, <n> mislukt*. (hfst 4.4)
- [ ] **Vinkje Ook onbekende kentekens aanmaken, uit.** Importeer een kenteken dat de RDW niet kent. Verwacht onder **Met waarschuwing**: *Onbekend bij de RDW: niet aangemaakt.* De auto bestaat niet. **(nieuw)** (hfst 4.4)
- [ ] **Vinkje aan.** Importeer hetzelfde kenteken met het vinkje aan. Verwacht: *Onbekend bij de RDW: wel aangemaakt, zonder RDW-gegevens.* Merk en model zijn *Unknown*. **(nieuw)** (hfst 4.4)
- [ ] **Drie uitkomsten.** Verwacht de blokken **Succesvol geïmporteerd (n)**, **Met waarschuwing (n)** en **Mislukte imports (n)**. Bij een bestaand kenteken staat *Dit voertuig bestaat al.* **(nieuw)** (hfst 4.4)
- [ ] **Leeg veld.** Laat het veld leeg. Verwacht: **Geen kentekens gevonden** met de tekst *Voer minstens één geldig kenteken in.* (hfst 4.4)
- [ ] **CSV uploaden.** Ga naar het tabblad **CSV uploaden**. Sleep een bestand in het venster. Verwacht: **Importgegevens voorbeeld**. Rijen zonder kenteken zijn rood met een driehoekje. Klik op **Import bevestigen (<aantal> voertuigen)** of op **Terug**. Verwacht: **Import voltooid** met de tekst *<aantal> voertuigen geïmporteerd, <aantal> met waarschuwing, <aantal> mislukt.* Een rij met een onleesbare datum geeft *Een datum kon niet worden gelezen (gebruik dd-mm-jjjj).* (hfst 4.4)
- [ ] **Afwijkingen ten opzichte van de RDW.** Importeer een bestand met andere gegevens dan de RDW heeft. Verwacht: het resultaat toont *Afwijkingen ten opzichte van de RDW:*. De waarde van de RDW geldt. (hfst 4.4)

### Bijwerken, statussen, APK

- [ ] **Voertuig bijwerken.** Klik op **Bewerken**. Loop de vijf tabbladen na (**Algemeen**, **Technisch**, **Datums**, **Contract**, **Overig**). Klik op **Voertuig bijwerken**. Verwacht: *Voertuig succesvol bijgewerkt* met de tekst *Het voertuig in je wagenpark is bijgewerkt.* (hfst 4.5)
- [ ] **Verplichte velden.** Maak het kenteken leeg. Verwacht: *Vul alle verplichte velden in: kenteken, merk en model.* Onder het veld staat *Kenteken is verplicht*. (hfst 4.5)
- [ ] **Dagprijs.** Vul een **Dagprijs (€)** in. Maak daarna een reservering. Verwacht: de **Totaalprijs (€)** is de dagprijs maal het aantal dagen. (hfst 4.5, 5.3)
- [ ] **Opmerkingen bij het ophalen.** Zet tekst in **Opmerkingen**. Haal de auto later op. Verwacht: het venster **Voertuigopmerkingen - Ophaalwaarschuwing**. (hfst 4.5, 5.7)
- [ ] **De status wijzigen.** Klik op **Bewerken** → **Algemeen** → **Beschikbaarheidsstatus**. Of klik op de kaart op **Wijzigen**. Verwacht vier keuzes: **Beschikbaar**, **Moet gerepareerd worden**, **Niet voor verhuur** en **Verhuurd**. **Gepland** staat er niet bij. (hfst 4.6)
- [ ] **Gepland onderhoud maakt geen Reparatie nodig.** Plan onderhoud voor een beschikbare auto. Verwacht: de status is **Gepland**, niet **Reparatie nodig**. **(nieuw)** (hfst 4.6, 7.3)
- [ ] **Binnen geeft Reparatie nodig.** Zet dat onderhoud op **Binnen**. Verwacht: **Reparatie nodig**. **(nieuw)** (hfst 4.6, 7.8)
- [ ] **Weghalen geeft de auto vrij.** Verwijder of annuleer dat onderhoud. Verwacht: de auto is niet langer **Reparatie nodig**. Dit geldt als er geen ander onderhoud op **Binnen** staat. **(nieuw)** (hfst 4.6, 7.8)
- [ ] **Een stand met de hand blijft staan.** Zet een auto zelf op **Moet gerepareerd worden**. Haal een onderhoud weg. Verwacht: de stand blijft. **(nieuw)** (hfst 4.6)
- [ ] **Handmatig op Verhuurd.** Zet een auto zonder actieve reservering met de hand op **Verhuurd**. Verwacht: een waarschuwing, *Geen actieve reservering* of *Reservering nog niet opgehaald*. (hfst 4.6)
- [ ] **Uitgifte geblokkeerd.** Zet een auto op **Onderhoud nodig** (werkplaatsstatus). Probeer hem op te halen. Verwacht: **Uitgifte geblokkeerd** met de tekst *Dit voertuig staat in de werkplaats en kan niet worden uitgegeven. Rond de werkplaatsklus eerst af.* (hfst 4.6, 5.7)
- [ ] **Forceren door de beheerder.** [beheerder] Kijk in dat venster. Verwacht: **Reden voor het forceren** en **Toch uitgeven**. [kantoor] ziet in plaats daarvan *Alleen een beheerder kan de uitgifte forceren*. (hfst 4.6, 5.7)
- [ ] **APK-datum invullen.** Klik op **Bewerken** → **Datums** → **APK-vervaldatum**. Verwacht: de datum staat in de lijst, op de tegel en op het Dashboard. Op het tabblad **Onderhoud** staat **APK-keuring** met **Huidige APK geldig tot**, **Dagen resterend** en het label **Verlopen**, **Actie binnenkort nodig** of **OK**. (hfst 4.7)
- [ ] **APK-keuring plannen.** Ga naar het tabblad **Onderhoud**. Klik op **APK-keuring plannen**. Vul de datum en **Duur (dagen)** in. Heeft de auto een lopende huur? Dan staat er *Actieve verhuur gedetecteerd* en *Er is een vervangend voertuig nodig voor deze klant.* met **Vervangend voertuig aanvragen**. (hfst 4.7)
- [ ] **Verlopen APK bij boeken.** Boek een auto met verlopen APK. Verwacht: een rode waarschuwing, geen blokkade. In de keuzelijst staat het label **APK verlopen**. (hfst 4.7, 5.3)
- [ ] **APK-datums gewijzigd bij de RDW.** Kijk na de RDW-scan. Verwacht: het venster **APK-datums gewijzigd bij de RDW**. Per voertuig staat er **Bevestigen** of **Negeren**. Er is ook **Later (morgen opnieuw)**. (hfst 4.7)

### Kilometerstand en brandstof

- [ ] **Kilometerstand bijwerken.** Klik op **Km-stand bijwerken** (op de kaart of na een scan). Vul **Nieuwe kilometerstand** in. Klik op **Opslaan**. Verwacht: *Kilometerstand opgeslagen* met de tekst *Nieuwe stand: <getal> km.* (hfst 4.8)
- [ ] **Lagere stand.** [kantoor] Vul een lagere stand in. Verwacht: een oranje regel *Lager dan de huidige stand (<getal> km). Hiervoor is een autorisatiewachtwoord nodig.* Daarna zie je **Kilometerstand-overschrijving vereist** met de huidige stand, de nieuwe stand en het verschil. Vul je **eigen** wachtwoord in. Klik op **Overschrijving bevestigen**. (hfst 4.8)
- [ ] **Lagere stand zonder het recht.** [balie] Vul een lagere stand in. Verwacht: *Je hebt geen recht om een verlaging van de kilometerstand te autoriseren. Vraag iemand met het recht 'authorize_mileage_decrease'.* (hfst 4.8)
- [ ] **Brandstof zonder bedrag.** Klik op **Brandstofstatus bijwerken**. Vul alleen **Brandstofniveau** in. Sla op. Verwacht: geen kostenpost. (hfst 4.9)
- [ ] **Leeg formulier.** Sla op zonder iets in te vullen. Verwacht: *Geef minstens één veld op om bij te werken.* (hfst 4.9)
- [ ] **Bedrag met een komma of punt.** Vul bij **Tankkosten (€)** *45,50* in. Probeer ook *45.50* en *1.234,50*. Verwacht: alle drie worden gelezen als bedrag. (hfst 4.9)
- [ ] **Ongeldig bedrag.** Typ *abc* of *45,555*. Verwacht onder het veld: *Vul een geldig bedrag in, bijvoorbeeld 45,50.* Er wordt niets opgeslagen. (hfst 4.9)
- [ ] **Bedrag nul of te groot.** Typ 0 of een heel groot bedrag. Verwacht: *Het tankbedrag moet een positief bedrag zijn van ten hoogste € 1.000.000.* **(nieuw)** (hfst 4.9)
- [ ] **Een tankbedrag wordt een kostenpost.** [kantoor of werkplaats] Vul een bedrag in. Voeg een **Bon** toe. Verwacht: **Brandstofstatus bijgewerkt; kostenpost van € 45,50 geboekt**. Op het scherm **Kosten** staat een kostenpost in de categorie **Brandstof**. De omschrijving is *Tankbeurt <niveau> <datum>*. De bon zit erbij. **(nieuw)** (hfst 4.9)
- [ ] **Geen extra recht nodig.** [alleen Voertuigen beheren] Doe hetzelfde. Verwacht: het lukt zonder **Kosten beheren**. **(nieuw)** (hfst 4.9)
- [ ] **Dubbel klikken.** Verstuur hetzelfde bedrag twee keer binnen twee minuten. Verwacht: één kostenpost. Een ander bedrag later wordt wel een nieuwe kostenpost. **(nieuw)** (hfst 4.9)
- [ ] **Laatste tankbedrag.** Kijk op de tegel **Huidig brandstofniveau**. Verwacht: *Laatste tankbedrag: € 45,50 (9 okt. 2026)*, met jouw bedrag en datum. Dit blijft staan, ook als je de kostenpost daarna verwijdert. **(nieuw)** (hfst 4.9)
- [ ] **Alleen niveau, geen kostenpost.** Vul alleen het **Brandstofniveau** in, zonder bedrag. Verwacht: het niveau is bijgewerkt. Er komt geen kostenpost bij. (hfst 4.9)
- [ ] **Kostenpost kon niet geboekt worden.** (Testomgeving, forceer een fout.) Verwacht: *De kostenpost voor de tankbeurt kon niet worden geboekt; er is niets opgeslagen. Probeer het opnieuw.* Ook het brandstofniveau is niet gewijzigd. **(nieuw)** (hfst 4.9)

### Documenten, barcode, verwijderen

- [ ] **Documenten bij het voertuig.** Open het tabblad **Documenten**. Verwacht: het kaartje **Voertuigdocumenten**. Onder **Snel uploaden categorieën** staan de knoppen **APK-keuring**, **Contract**, **Schaderapport**, **Voertuigfoto's** en **Onderhoud**. Het blok **Interactieve schadechecks** heeft **Nieuwe check** en **PDF**. (hfst 4.10)
- [ ] **Document verwijderen.** Verwijder een document. Verwacht: *"Weet je zeker dat je het document "<naam>" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."* (hfst 4.10)
- [ ] **Voertuigbarcode.** Klik op **Barcode bekijken** → **Labelsjabloon** → **Sleutellabel afdrukken**. Verwacht: **Afdrukvenster geopend** met de tekst *Het afdrukvenster van je browser is geopend voor het label van <kenteken>. Kies daar de printer.* (hfst 4.11)
- [ ] **Reservesleutel-label.** Klik op **Reservesleutel-label afdrukken**. Verwacht: de code eindigt op **-S**. (hfst 4.11)
- [ ] **DYMO-tape.** Kies bij **Labelsjabloon** de optie **DYMO-tape (labelmaker, staand)**. Verwacht: de velden **Tapebreedte** (12 mm), **Labellengte (mm)** (48) en **Uitvoer**. Staat DYMO Connect op de pc? Dan staat eronder *DYMO Connect gevonden: 1 labelmaker.* **Uitvoer** biedt dan *DYMO LabelManager 420P (rechtstreeks via DYMO Connect)*, *Bestand .label (openen in DYMO Connect)* en *Afdrukvenster van de browser*. (hfst 4.11, 18.9)
- [ ] **Rechtstreeks naar de labelmaker.** Zet **Uitvoer** op de labelmaker. Klik op **Afdrukken**. Verwacht: **Naar de labelmaker gestuurd** met de tekst *1 label is naar DYMO LabelManager 420P gestuurd.* De 420P drukt één label en snijdt het af. De barcode staat over de lengte. Daarnaast staan het kenteken en **Hoofd**. Het label is scanbaar in de sleutelkast. Bij **Reservesleutel-label** staat er **Reserve**. Open het venster opnieuw. Verwacht: tape en labelmaker staan nog ingevuld. Zet de labelmaker uit. Verwacht: **Afdrukken op de labelmaker mislukt** met de reden van DYMO Connect. (hfst 4.11, 18.9)
- [ ] **Bestand .label.** Zet **Uitvoer** op *Bestand .label (openen in DYMO Connect)*. Klik op **Afdrukken**. Verwacht: **Bestand gemaakt** met de naam *sleutellabel-<kenteken>-<code>.label*. Dubbelklik op het bestand. Verwacht: het opent in DYMO Connect met dezelfde barcode en tekst. (hfst 4.11, 18.9)
- [ ] **Barcode opnieuw genereren.** Verwacht eerst de waarschuwing *De oude barcode (<code>) werkt daarna niet meer. Reeds afgedrukte labels moeten opnieuw worden afgedrukt. Deze actie kan niet ongedaan worden gemaakt.* Doe dit alleen op een oefenauto. (hfst 4.11)
- [ ] **Barcodeboek.** Klik op **Barcodeboek** → **Alles afdrukken (…)**. Verwacht: **Afdrukvenster geopend** met de tekst *… voor het barcodeboek (12 voertuigen) …*. (hfst 4.11)
- [ ] **Voertuig verwijderen.** Klik op het prullenbakje bij een oefenauto. Verwacht: *Je staat op het punt om <merk> <model> te verwijderen met kenteken <kenteken>.* en *Controleren wat aan dit voertuig gekoppeld is...*. Daarna **Dit verwijdert ook:**. De knop is grijs tot je het kenteken overtypt. (hfst 4.12)
- [ ] **Voertuig met lopende huur.** Probeer een auto met een lopende huur te verwijderen. Verwacht: *Verwijderen kan niet: dit voertuig heeft een lopende of geplande huur.* met de reserveringen die dit blokkeren. (hfst 4.12)
- [ ] **Voertuig verwijderd.** Verwijder de oefenauto. Verwacht: **Voertuig verwijderd** met de tekst *<merk> <model> is verwijderd. Een beheerder kan het terugzetten vanuit de prullenbak.* Deed je dit vanuit het detailscherm? Dan sluit dat scherm. Er komt geen tweede melding *Vehicle not found*. (hfst 4.12)
- [ ] **Voertuig terugzetten.** Ga naar **Verwijderde voertuigen**. Klik op **Terugzetten**. Verwacht: **Teruggezet** met de tekst *12-AB-34 Kia Picanto is teruggezet.* De regel krijgt het label **Teruggezet**. (hfst 4.12)
- [ ] **Terugzetten met een bezet kenteken.** Zet een auto terug waarvan het kenteken al bestaat. Verwacht: *Er bestaat al een voertuig met hetzelfde kenteken. Verwijder of hernoem dat eerst.* (hfst 4.12)

### RDW-voertuigtypes

- [ ] **De kaart.** [beheerder] Klik op het tandwiel → **Instellingen** → tabblad **Voertuigen**. Verwacht: de kaart **RDW-voertuigtypes** met *Er wordt niets aangepast voordat een beheerder op Toepassen drukt.* **(nieuw)** (hfst 4.13)
- [ ] **Controleren.** Klik op **Controleren**. Verwacht: *Controleren… 12 van 99 voertuigen*. Daarna een lijst met per kenteken **Type: oud → nieuw**. **(nieuw)** (hfst 4.13)
- [ ] **Slechts één controle tegelijk.** Start in een tweede tabblad nog een controle. Verwacht: *Er loopt al een controle. Wacht tot die klaar is.* **(nieuw)** (hfst 4.13)
- [ ] **Slotregel.** Verwacht: *7 voertuigen krijgen een ander type (controle van <datum>: 99 voertuigen bekeken, 2 niet gevonden bij de RDW, 1 mislukt).* Onderaan staat *Niet gevonden bij de RDW, type blijft: …*. **(nieuw)** (hfst 4.13)
- [ ] **Alles gelijk.** Is er niets te wijzigen? Verwacht: *Alle gecontroleerde voertuigen hebben al het type dat de RDW geeft.* **(nieuw)** (hfst 4.13)
- [ ] **Toepassen vraagt bevestiging.** [beheerder] Klik op **Toepassen**. Verwacht: **RDW-voertuigtypes toepassen?** met de tekst *Het type van 7 voertuigen wordt aangepast zoals in de lijst staat. … Dit kan niet in één keer ongedaan worden gemaakt.* **(nieuw)** (hfst 4.13)
- [ ] **Toepassen, resultaat.** Bevestig (alleen op de testomgeving). Verwacht: **RDW-voertuigtypes toegepast** met de tekst *7 voertuigen aangepast, 0 overgeslagen (type intussen gewijzigd).* Per auto staat er een regel in het activiteitenlog. **(nieuw)** (hfst 4.13)
- [ ] **Toepassen is alleen voor de beheerder.** [kantoor met Instellingen niet] Verwacht: geen knop **Toepassen**. **(nieuw)** (hfst 4.13, 15.3)
- [ ] **Lijst weg na toepassen.** Klik nog een keer op **Toepassen** zonder nieuwe controle. Verwacht: *Er is geen controle-uitkomst meer om toe te passen. Draai eerst Controleren.* **(nieuw)** (hfst 4.13)

---

## Hoofdstuk 5 — Reserveringen

### De kalender en de lijst

- [ ] **Kalender.** Ga naar **Reserveringen**. Verwacht: een maandweergave. Rechtsboven staan **Lijstweergave**, **Voltooid bekijken (…)**, **Verwijderde reserveringen**, **… achterstallig** (als die er zijn), **… niet opgehaald** (als die er zijn), **Administratie** en **Nieuwe reservering**. (hfst 5.1)
- [ ] **Filters en navigatie.** Kijk boven de kalender. Verwacht: **Kleuren**, **Vandaag**, pijltjes, **Voertuigen zoeken...**, **Voertuigtype** (**Alle typen**) en **Beschikbaarheid** (**Alle voertuigen**, **Beschikbaar**, **Gereserveerd**). (hfst 5.1)
- [ ] **Dagvakje.** Kijk in een dagvakje. Verwacht: alleen reserveringen die die dag beginnen of eindigen. Per regel staat het kenteken, **uit** of **in**, en de klant. Bij meer dan vijf staat er **+… meer**. Die opent **Reserveringen voor <datum>**. (hfst 5.1)
- [ ] **Bijzondere regels.** Zoek een moersleuteltje (*Onderhoud: <type> - <status>*), **TBD**, **🚗 VERVANGER** en **Feestdag** of **Geblokkeerd**. (hfst 5.1)
- [ ] **Legenda.** Kijk onder de kalender. Verwacht: *Legenda reserveringskalender* met **Bevestigde reservering**, **Reservering in behandeling**, **Voltooide reservering**, **Geannuleerde reservering**, **Vervangend voertuig**, **Vervangend voertuig (nog te bepalen)**, **Ophaaldag** en **Inleverdag**. Klik op **Kleuren**. Verwacht: het venster **Kalenderkleuren** met de tabbladen **Reserveringsstatus**, **Reserveringstype**, **Onderhoudstype**, **Prioriteit** en **Indicatoren**, en de knoppen **Terugzetten naar standaard** en **Wijzigingen opslaan**. (hfst 5.1)
- [ ] **Verslepen.** Sleep een blok naar een andere dag. Verwacht: **Reservering verplaatsen?** met de oude en de nieuwe periode. **Verplaatsen** bevestigt. (hfst 5.1)
- [ ] **Lijstweergave.** Klik op **Lijstweergave**. Verwacht: *Reserveringen — Bekijk en beheer alle reserveringen* met **Actief (…)**, **Achterstallig (…)** en **Geschiedenis (…)**. Er is een zoekveld *Zoek op kenteken, klant, contract, ID...*. De sorteerknoppen zijn **Ophalen**, **Klant**, **Kenteken** en **Inleveren**. (hfst 5.2)
- [ ] **Regel in de lijst.** Verwacht per regel: het nummer (#3366) met status, het kenteken met merk en model, de klant, het contractnummer, **Uit:** en **In:**, kilometers, prijs, een oogje, een potlood en een prullenbak. Bij een open vervanger staat **Voertuig toewijzen**. (hfst 5.2)
- [ ] **Tabblad Achterstallig.** Open het tabblad. Verwacht: *Voertuigen die ingeleverd hadden moeten zijn maar nog bij de klant zijn*, met *… dag(en) te laat* en *Verwacht: <datum>*. (hfst 5.2)
- [ ] **50 per pagina.** Kijk bij meer dan 50 reserveringen. Verwacht: *50 van 366 getoond* en **Toon 50 meer**. Zoeken gaat over de hele lijst. Tijdens het laden staat er *Laden...* met een rondje. (hfst 5.2)
- [ ] **Eigen adres per tabblad.** Ga naar **Achterstallig**. Vernieuw de pagina. Verwacht: je komt op hetzelfde tabblad terug. (hfst 5.2)

### Een reservering maken

- [ ] **Venster openen.** Druk op `N`. Of ga naar **Reserveringen** → **Nieuwe reservering**. Verwacht: **Nieuwe reservering** met drie stappen: **1. Selecteer huurdata**, **2. Selecteer voertuig en klant** en **3. Reserveringsdetails**. (hfst 5.3)
- [ ] **Standaardwaarden van de datums.** Verwacht: **Startdatum** staat op vandaag. **Einddatum** staat drie dagen later. "Vandaag" is volgens de kantoorklok. Dat is de tijdzone uit de app-instellingen, standaard Nederland. **(nieuw)** (hfst 5.3, 10.3)
- [ ] **Huur zonder einddatum.** Zet deze optie aan. Verwacht: het veld **Einddatum** verdwijnt. De duur toont **Open einde**. (hfst 5.3)
- [ ] **Duur.** Pas de einddatum aan. Verwacht: **Duur:** met het aantal dagen. (hfst 5.3)
- [ ] **Ophaaltijd en inlevertijd (optioneel).** Vul ze in. Dat is handig voor een wissel op dezelfde dag. (hfst 5.3)
- [ ] **Datums eerst.** Kies datums. Open dan de voertuigkeuze. Verwacht: *Alleen beschikbare voertuigen voor je geselecteerde data worden getoond.* Een bezette auto staat er niet bij. Is er niets vrij, dan staat er *Geen voertuigen gevonden.* (hfst 5.3)
- [ ] **Toon alle voertuigen.** Vink **Toon alle voertuigen (voor langdurige verhuur)** aan. Verwacht: ook bezette auto's staan erbij. Botst een auto echt, dan zie je de rode waarschuwing. (hfst 5.3)
- [ ] **Datum in het verleden.** Kies een periode in het verleden. Verwacht: geen waarschuwing. In een verstreken periode is de auto **beschikbaar**. (hfst 5.3)
- [ ] **Klantkeuze.** Zoek op naam, telefoon of plaats. Verwacht: onder elke naam staan het telefoonnummer en het e-mailadres. (hfst 5.3)
- [ ] **Gemachtigde chauffeur.** Kies een klant. Verwacht: **Gemachtigde chauffeur (optioneel)** verschijnt, met **Snel chauffeur toevoegen**. De hoofdchauffeur heeft het label **Primaire chauffeur**. (hfst 5.3)
- [ ] **Nieuw toevoegen / Bewerken in het venster.** Maak vanuit de voertuigkeuze een voertuig aan. Bewerk er ook een. Verwacht: dit lukt. (hfst 5.3)
- [ ] **De drie meldingen.** Verwacht rood: *Dit voertuig is al gereserveerd voor de geselecteerde data. Kies andere data of een ander voertuig.* De knop is dan grijs. Geel is onderhoud. Opslaan mag dan. Rood is ook *De APK (keuring) van dit voertuig is verlopen op <datum>. Bevestig dat het veilig en legaal is om te verhuren voordat je verdergaat.* (hfst 5.3)
- [ ] **Meerdere onderhoudsblokken.** Boek een auto met meerdere blokken. Verwacht: *Let op: dit voertuig heeft … onderhoudsblokken in deze periode (…). Opslaan mag; de blokken blijven staan.* (hfst 7.3)
- [ ] **APK-melding vanuit een auto.** Open het formulier via **Nieuwe reservering** op de voertuigkaart. Verwacht: de auto staat ingevuld. De APK-waarschuwing staat er toch. (hfst 5.3)
- [ ] **Zwarte lijst.** Kies een klant met een geblokkeerde auto. Verwacht: die auto staat stil niet in de lijst. (hfst 5.3)
- [ ] **Nieuwe reservering is altijd Geboekt.** Kijk in stap 3. Verwacht: geen statusveld. **(nieuw)** (hfst 5.3, 5.13)
- [ ] **Totaalprijs automatisch.** Verwacht: **Totaalprijs (€) (optioneel)** vult zichzelf met het dagtarief maal het aantal dagen. Eronder staat *Automatisch ingevuld op basis van het dagtarief van €… voor … dagen — bewerk om te overschrijven*. Typ je zelf iets, dan blijft dat staan. Zonder dagprijs staat er € 0,00. (hfst 5.3)
- [ ] **Bezorgservice.** Zet **Bezorgservice vereist** aan. Verwacht: de velden **Bezorgadres**, **Stad**, **Postcode** en **Bezorgnotities**. (hfst 5.3)
- [ ] **Reservering aanmaken.** Klik op **Reservering aanmaken**. Verwacht: **Reservering succesvol aangemaakt** met de tekst *Reservering voor <merk> <model> is aangemaakt.* De knop **Annuleren** wordt **Sluiten**. (hfst 5.3)
- [ ] **Nu ophalen.** Kijk in de groene melding in het formulier. Daar staat **Nu ophalen**. Klik erop. Verwacht: het venster **Ophaalproces starten** voor déze reservering, met kenteken en klant. **(nieuw)** (hfst 5.3)
- [ ] **Nu ophalen vanuit andere plekken.** Boek vanaf het Dashboard. Boek ook vanuit de klantenlijst en vanuit de voertuigenlijst. Verwacht: het venster sluit zichzelf. Linksonder staat twaalf seconden een melding met dezelfde knop **Nu ophalen**. **(nieuw)** (hfst 5.3)
- [ ] **Nu ophalen zonder het recht.** [kijker of balie zonder Reserveringen beheren] Verwacht: de knop is niet bruikbaar zonder het recht. Hij is grijs of afwezig. Er verandert niets. **(nieuw)** (hfst 5.3, 15.9)
- [ ] **Reservering blijft Geboekt na Nu ophalen annuleren.** Sluit het ophaalvenster zonder af te ronden. Verwacht: de reservering staat nog op **Geboekt**. **(nieuw)** (hfst 5.3)
- [ ] **Annuleren vanaf het Dashboard.** Klik op **Annuleren**. Verwacht: alleen het venster sluit. Je springt niet naar Reserveringen. (hfst 5.3)
- [ ] **Wijzigingen verwerpen? bij het aanmaken.** Vul iets in. Druk op Escape. Probeer ook het kruisje, naast het venster klikken en **Annuleren**. Verwacht: **Wijzigingen verwerpen?** met **Verder bewerken** en **Verwerpen**. Heb je nog niets ingevuld, dan sluit het venster gewoon. (hfst 5.3)
- [ ] **BV naar Opnaam.** Boek een auto die op **BV** staat. Verwacht achteraf: *Voertuig automatisch gewijzigd van BV naar Opnaam (vereist voor verhuur - verzekering & wegenbelasting)*. (hfst 5.3, 11.17)
- [ ] **Achterstallige huur van dezelfde auto.** Boek een auto met een achterstallige huur. Verwacht: **Achterstallige reserveringen gevonden** met **Markeer als voltooid**, **Details bekijken** en **Doorgaan met reservering**. (hfst 5.3)

### Een reservering openen

- [ ] **Het korte venster.** Klik in de kalender een regel aan. Verwacht onderaan: **Ophalen starten** of **Inleveren starten** · **Bewerken** · **Onderhoud** · **Sluiten**. Bij een opgehaalde, afgesloten of geannuleerde huur staat er ook **Overdracht terugdraaien** (bij geannuleerd **Annulering terugdraaien**) en een prullenbakje. (hfst 5.4)
- [ ] **Het volledige venster.** Open dezelfde reservering via het zoekveld bovenin. Verwacht: de code (**RES-003366**), status, periode, prijs, voertuig, klant, chauffeur, documenten, **Voertuigservice** en **Geschiedenis**. De knoppen zijn **Datums wijzigen** · **Klant wijzigen** · **Voertuig wijzigen** · **Bewerken** · **Reservering annuleren** · **Verwijderen** · **Sluiten**. (hfst 5.4)
- [ ] **Annuleren verdwijnt bij een afgesloten huur.** Open een afgesloten huur. Verwacht: de knop **Reservering annuleren** staat er niet. (hfst 5.4)
- [ ] **Verouderd-label en geschiedenis in woorden.** Verwacht: een document dat niet meer klopt, heeft het label **Verouderd**. De **Geschiedenis** noemt *Ophalen*, *Inleveren*, *Overdracht teruggedraaid*, *Status gewijzigd*, *Contract gemaakt*, *Reservering aangemaakt*, *Document gemaild*, enzovoort. (hfst 5.4)

### De kleine wijzigvensters

- [ ] **Datums wijzigen.** Klik op **Datums wijzigen**. Verwacht: *Alleen de begin- en einddatum worden gewijzigd; de rest van de boeking blijft zoals hij is.* Kies nieuwe datums. Klik op **Opslaan**. Verwacht: de periode is gewijzigd. (hfst 5.5)
- [ ] **Einddatum vóór begindatum.** Kies een einddatum vóór de begindatum. Verwacht: *De einddatum kan niet vóór de begindatum liggen.* (hfst 5.5)
- [ ] **Datums botsen.** Kies datums die botsen met een andere reservering. Verwacht: een weigering, met de botsende reservering erbij. (hfst 5.5)
- [ ] **Klant wijzigen.** Klik op **Klant wijzigen**. Typ in *Zoek op naam, bedrijf of debiteurnummer...*. Klik op **Andere klant kiezen**. Klik op **Opslaan**. Verwacht: **Klant gewijzigd**. (hfst 5.5)
- [ ] **Voertuig wijzigen.** Klik op **Voertuig wijzigen**. Kies in *Kies een voertuig...*. Klik op **Opslaan**. Verwacht: **Voertuig gewijzigd**. De beschikbaarheid wordt opnieuw gecontroleerd. (hfst 5.5)
- [ ] **Contractnummer bewerken.** Klik op het potloodje bij het blauwe contractnummer. Verwacht: **Contractnummer bewerken** met **Beschikbaarheid controleren...**. Daarna zie je **Beschikbaar**, of *Al in gebruik door reservering #… Kies een ander nummer.* (hfst 5.5)
- [ ] **Contractnummer niet in het bewerkformulier.** Klik op **Bewerken** bij een reservering. Verwacht: geen veld **Contractnummer**. **(nieuw)** (hfst 5.6)
- [ ] **Document wordt Verouderd.** Wijzig een reservering met een contract. Verwacht: na elke wijziging krijgt het contract het oranje label **Verouderd** met **Opnieuw genereren**. (hfst 5.5)

### Het bewerkformulier

- [ ] **Bewerken.** Klik op **Bewerken** bij een reservering. Verwacht: hetzelfde formulier met drie stappen. Er is geen statusveld. De velden **Kilometerstand bij inleveren**, **Brandstofniveau bij inleveren**, **Brandstofkosten (€)** en **Contractnummer** ontbreken. **(nieuw)** (hfst 5.6)
- [ ] **Annuleren in het bewerkformulier.** Open een lopende reservering. Verwacht onderaan: de knop **Reservering annuleren**. Die opent hetzelfde annuleervenster. **(nieuw)** (hfst 5.6, 5.9)
- [ ] **Reservering bijwerken.** Wijzig de notities. Klik op **Reservering bijwerken**. Verwacht: **Reservering succesvol bijgewerkt**. (hfst 5.6)
- [ ] **Sluiten met wijzigingen.** Vul iets in. Druk op Escape. Probeer ook het kruisje, naast het venster klikken en **Sluiten**. Verwacht: **Wijzigingen verwerpen?** (hfst 5.6)
- [ ] **Een oude verhuring bewerken.** Open een reservering die meer dan drie weken geleden is opgehaald. Klik op **Bewerken**. Sla op. Verwacht: **Beheerdersgoedkeuring vereist** met de tekst *Deze verhuur is meer dan 3 weken geleden opgehaald. Voer een beheerderswachtwoord in om je wijzigingen op te slaan.* Klik daarna op **Bevestigen**. (hfst 5.6)
- [ ] **Status via een gewone wijziging kan niet.** Dit kun je alleen controleren op een oude pagina. Een gewone wijziging van de status geeft *De invoer klopt niet. Controleer de velden en probeer het opnieuw.* (code `USE_STATUS_ROUTE`). Vernieuw de pagina. **(nieuw)** (hfst 12 deel 2)

### Ophalen

- [ ] **Drie startpunten.** Ga naar het Dashboard → **Ophalen starten** en scan. Ga naar **Scannen**, scan en klik op **Ophalen starten**. Open een reservering en klik op **Ophalen starten**. Verwacht: steeds hetzelfde venster **Ophaalproces starten** met de tekst *Voer de huidige kilometerstand en het brandstofniveau van het voertuig bij ophalen in. Er wordt automatisch een contract gegenereerd.* (hfst 5.7)
- [ ] **Voertuiginformatie.** Verwacht: **Kenteken**, **Voertuig** en **Klant** staan bovenin. **Annuleren** sluit zonder iets te doen. (hfst 5.7)
- [ ] **Velden.** Verwacht: **Contractnummer** is vooringevuld (*Automatisch gegenereerd, je kunt het indien nodig bewerken*). **Ophaaldatum** staat op vandaag. Verder **Kilometerstand bij ophalen** (*Huidig: 25.000 km*), **Brandstofniveau bij ophalen** (**Vol**, **3/4**, **1/2**, **1/4**, **Leeg**) en **Aanvullende notities (optioneel)**. (hfst 5.7)
- [ ] **Schadecheck.** Verwacht: de knoppen **Ophaal-schadecheck aanmaken** en **Papieren check uploaden**. (hfst 5.7, 8.4)
- [ ] **Ophalen voltooien.** Klik op **Ophalen voltooien & contract genereren**. Verwacht: **Ophalen voltooid** met de tekst *Voertuig succesvol opgehaald. Contract is gegenereerd.* Daarna zie je **Contract klaar** met **Afdrukken**, **Mail naar klant** en **Sluiten**. (hfst 5.7)
- [ ] **Ophalen vanaf een auto in gepland onderhoud.** Haal een auto op met ingepland onderhoud die nog niet **Binnen** is. Verwacht: een gele regel *Let op: dit voertuig staat ingepland voor onderhoud (<periode>) en is nog niet binnengemeld. Ophalen mag; de balie beslist.* Het ophalen lukt. **(nieuw)** (hfst 5.7, 7.3)
- [ ] **Mail naar klant.** [je eigen adres] Klik op **Mail naar klant**. Verwacht: het adres van de klant staat voorgesteld. Is de knop grijs? Dan staat er *Nog nodig om te versturen:* met wat ontbreekt. (hfst 5.7)
- [ ] **Voertuigopmerkingen.** Haal een auto met een opmerking op. Verwacht: **Voertuigopmerkingen - Ophaalwaarschuwing** met de tekst *BELANGRIJK: Bekijk deze opmerkingen voordat het voertuig vertrekt:* en de knop **Ik bevestig & ga door**. **Annuleren** sluit alles. Naast het venster klikken doet niets. Het venster licht dan even op. Bevestig je niet, dan zie je **Opmerkingen niet bevestigd**. (hfst 5.7)
- [ ] **De huur start eerder.** Haal op vóór de startdatum. Verwacht: **De huur start eerder — datum aanpassen?** met **Ja, startdatum naar vandaag** of **Nee, niet ophalen**. Bij het laatste wordt niets opgeslagen. (hfst 5.7)
- [ ] **Dubbel contractnummer.** Vul een nummer in dat al bestaat. Verwacht: **Dubbel contractnummer** met de tekst *Dit contractnummer is al in gebruik.* en de knoppen **Annuleren** of **Overschrijven & doorgaan**. (hfst 5.7)
- [ ] **Kilometerstand-overschrijving.** Vul een lagere stand in. Verwacht: **Kilometerstand-overschrijving vereist** met je eigen wachtwoord. (hfst 5.7, 4.8)
- [ ] **Uitgifte geblokkeerd.** Haal een auto met werkplaatsstatus op. Verwacht: **Uitgifte geblokkeerd**. Er is niets opgeslagen. [kantoor] ziet *Alleen een beheerder kan de uitgifte forceren. Los de werkplaatsstatus op, of vraag een beheerder.* [beheerder] ziet **Reden voor het forceren**, **Toch uitgeven** (uit zonder reden) en **Niet uitgeven**. De reden komt in de notities (*[WORKSHOP OVERRIDE …]*). (hfst 5.7)
- [ ] **Reparatie nodig en niet voor verhuur.** Haal zo'n auto op. Verwacht: *Dit voertuig staat op "reparatie nodig"…* en *Dit voertuig staat op "niet voor verhuur"…* in hetzelfde venster. (hfst 5.7)
- [ ] **Eén venster tegelijk.** Start het ophalen vanaf het scanscherm. Verwacht: het scankaartje is weg zolang het formulier en **Contract klaar** open zijn. Vanaf het Dashboard sluit het scanvenster vanzelf. (hfst 5.7)
- [ ] **Contract mislukt.** (Test: verwijder alle velden uit het standaardsjabloon op de testomgeving.) Verwacht: *Voertuig succesvol opgehaald.* zonder de belofte van een contract. Daarna **Contract kon niet gemaakt worden** met een Nederlandse reden. (hfst 5.7, 8.4)
- [ ] **Contractnummer wordt niet hergebruikt.** Annuleer een opgehaalde huur met nummer 1012. Verwacht: de volgende huur stelt 1013 voor. (hfst 5.7)

### Innemen

- [ ] **Drie startpunten.** Klik op **Innemen starten** en scan. Ga naar **Scannen** en klik op **Inleveren starten**. Open een reservering en klik op **Inleveren starten**. Verwacht: **Inleverproces starten**. (hfst 5.8)
- [ ] **Velden.** Verwacht: **Bij ophalen:** met de stand van toen. **Inleverdatum** staat op vandaag. Verder **Kilometerstand bij inleveren** en **Brandstofniveau bij inleveren**. Dat laatste begint op het niveau van het ophalen (of **Vol**). Ook **Inlever-schadecheck aanmaken** en **Aanvullende notities (optioneel)**. (hfst 5.8)
- [ ] **Inleveren voltooien.** Klik op **Inleveren voltooien & schadecheck genereren**. Verwacht: **Inleveren voltooid** met de tekst *Voertuig succesvol ingeleverd. Schadecheck is gegenereerd.* Daarna **Schadeformulier klaar** met **Afdrukken**, **Mail naar klant** en **Sluiten**. (hfst 5.8)
- [ ] **Huur meteen Voltooid.** Verwacht: de reservering staat op **Voltooid**. De auto staat op **Beschikbaar**. De einddatum is niet veranderd. De kilometerstand van de auto is bijgewerkt. (hfst 5.8)
- [ ] **Te lage stand.** Vul een lagere stand in dan bij het ophalen. Verwacht: **Ongeldige kilometerstand** met de tekst *Kilometerstand bij inleveren kan niet lager zijn dan bij ophalen (25000 km).* (hfst 5.8)
- [ ] **Werkplaatsstatus blijft.** Neem een auto met werkplaatsstatus in. Verwacht: die status verdwijnt niet vanzelf. (hfst 5.8, 7.5)
- [ ] **Voltooid bekijken.** Klik op **Voltooid bekijken (…)**. Verwacht: **Geschiedenis voltooide verhuur** met de tekst *Bekijk, herstel of verwijder voltooide verhuurgegevens*. Zoek op voertuig, klant of kenteken. Kies een **Periode** (**Alle tijd**, 7, 30, 90 dagen, jaar). De knoppen zijn **Bekijken**, **Overdracht terugdraaien** en **Verwijderen**. (hfst 5.8)

### Annuleren en verwijderen

- [ ] **Reservering annuleren.** Open het volledige venster. Klik op **Reservering annuleren**. Verwacht: *Reservering #… wordt geannuleerd. Kies hieronder wat er met het gekoppelde moet gebeuren.* en **Hieraan hangt nog:** (transport, vervangingsreservering, placeholder, chauffeurstoewijzing). (hfst 5.9)
- [ ] **Per onderdeel kiezen.** Vink **Transport meeannuleren**, **Vervangingsreservering meeannuleren**, **Placeholder-reservering meeannuleren** en **Chauffeurstoewijzing meeannuleren** aan of uit. Verwacht de tekst *Wat je niet aanvinkt, blijft gewoon staan.* (hfst 5.9)
- [ ] **Bevestigen.** Klik op **Reservering annuleren** of **Niet annuleren**. Verwacht: **Reservering geannuleerd** met de tekst *Reservering #… staat nu op Geannuleerd.* De regel blijft zichtbaar. Hangt er niets aan, dan staat er *Er hangt niets anders aan deze reservering.* (hfst 5.9)
- [ ] **Bericht aan de klant bij annuleren.** [je eigen adres als portaalklant] Annuleer de reservering van een klant mét portaalaccount. Verwacht: een melding in het portaal en een e-mail *Uw reservering is geannuleerd*. Een klant zonder account krijgt niets. Die moet je zelf bellen. (hfst 5.9, 9.8)
- [ ] **Annuleren staat vanuit Niet opgehaald.** Klik op **… niet opgehaald** → **Annuleren**. Verwacht: hetzelfde venster, met kenteken, merk en model en klant bovenin. (hfst 5.12)
- [ ] **Reservering verwijderen.** Klik op **Verwijderen**. Verwacht: **Weet je het zeker?** met de tekst *Reservering #… wordt naar de prullenbak verplaatst; terugzetten kan via Prullenbak.* Daarna **Reservering verwijderd** met de tekst *De reservering is succesvol verwijderd.* (hfst 5.10)
- [ ] **Verwijderde reserveringen.** Klik op **Verwijderde reserveringen**. Verwacht: de regel met het label **Reservering**, bijvoorbeeld *Reservering #3366 — HL-02-HL 2026-10-05*. Er staat **Terugzetten** en **Definitief verwijderen** bij. (hfst 5.10)
- [ ] **Terugzetten botst.** Boek de auto in die periode opnieuw. Zet daarna de verwijderde reservering terug. Verwacht: *Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode.* (hfst 5.10)
- [ ] **Geen lijst van wat eraan hangt.** Kijk in het verwijdervenster van een reservering. Verwacht: geen lijst. Bij een voertuig staat die lijst er wel. (hfst 5.10)

### Achterstallig en niet opgehaald

- [ ] **Te late verhuren.** Klik op **… achterstallig**. Verwacht: **Te late verhuren** met merk en model, kenteken en klant met telefoonnummer. Verder *Had ingeleverd moeten zijn: <datum>*, **… dag(en) te laat** en **Details bekijken**. (hfst 5.11)
- [ ] **Alsnog afsluiten.** Klik op **Details bekijken** → **Inleveren starten**. Verwacht: hetzelfde venster als bij 5.8. (hfst 5.11)
- [ ] **Drie plekken.** Verwacht: de lijst staat ook onder **Lijstweergave** → **Achterstallig (…)**. En op het Dashboard bij **Achterstallige verhuringen**. (hfst 5.11)
- [ ] **Niet opgehaalde reserveringen.** Zorg voor een boeking van een maand geleden die nooit is opgehaald. Open de kalender. Verwacht: het venster **Niet opgehaalde reserveringen** (één keer per sessie) en de knop **… niet opgehaald**. (hfst 5.12)
- [ ] **Zoeken in die lijst.** Verwacht: *Zoek op kenteken, klant, contractnummer of reserveringsnummer...*, een telling (*12 van 144*) en bij geen treffer *Geen niet opgehaalde reservering komt overeen met je zoekopdracht.* (hfst 5.12)
- [ ] **Bekijken en Annuleren.** Verwacht per regel: **Bekijken** en **Annuleren**. Zonder **Reserveringen beheren** is **Annuleren** grijs. [kijker] ziet de lijst wel. (hfst 5.12)
- [ ] **Lege lijst.** Verwacht: *Geen niet opgehaalde reserveringen.* (hfst 5.12)

### Statussen en terugdraaien

- [ ] **Statussen op een rij.** Verwacht overal dezelfde namen: **Geboekt**, **Opgehaald**, **Ingeleverd**, **Voltooid** en **Geannuleerd**. Ook op het scanscherm. (hfst 5.13)
- [ ] **Een ophaling terugdraaien.** [kantoor] Open een opgehaalde reservering. Klik op **Overdracht terugdraaien**. Verwacht: **Overdracht terugdraaien** met de tekst *Controleer wat er met reservering #… gebeurt voordat je bevestigt.* en *Status: Opgehaald wordt Geboekt.* Verder **Deze gegevens worden gewist:**, het blok **Voertuig**, **Deze documenten worden als vervallen gemarkeerd (ze worden niet verwijderd):** en **Let op**. (hfst 5.14)
- [ ] **Vinkje voor de kilometerstand.** Gaat de stand van de auto omlaag? Verwacht: *Ik bevestig dat de kilometerstand van het voertuig omlaag gaat, van … km naar … km.* De bevestigknop is grijs tot je het vinkje aanzet. (hfst 5.14)
- [ ] **Terugdraaien bevestigen.** Bevestig. Verwacht: **Overdracht teruggedraaid** met de tekst *Reservering #… heeft weer de status Geboekt.* Het contractnummer komt vrij. Het niet-ondertekende contract krijgt **Verouderd**. In de notities staat *[TERUGGEDRAAID …]*. (hfst 5.14)
- [ ] **Annuleren in het terugdraaivenster.** Klik op Annuleren. Verwacht: er is niets veranderd. (hfst 5.14)
- [ ] **Een inname terugdraaien.** Klik op **Voltooid bekijken (…)** → **Overdracht terugdraaien**. Verwacht: de reservering gaat van **Voltooid** naar **Opgehaald**. De inleverdatum, de stand en de brandstof worden gewist. De schadecheck van de inname krijgt **Verouderd**. (hfst 5.8, 5.14)
- [ ] **Een annulering terugdraaien.** Open een geannuleerde reservering. Klik op **Annulering terugdraaien**. Verwacht: **Annulering teruggedraaid**. De status wordt **Opgehaald** (als de huur was opgehaald) of **Geboekt**. Er staat een waarschuwing: *Vervangende voertuigen, transporten en chauffeurtoewijzingen die bij de annulering zijn gesloten, worden niet opnieuw geopend.* (hfst 5.14)
- [ ] **Annulering terugdraaien, auto niet meer vrij.** Verwacht: een rood blok *Het voertuig is voor deze periode niet meer vrij, dus de annulering kan niet worden teruggedraaid.* en een grijze knop. (hfst 5.14)
- [ ] **Knop zonder het vinkje.** [zonder Overdracht terugdraaien] Verwacht: **Overdracht terugdraaien** is grijs. Een tik toont het recht. (hfst 5.14, 15.9)
- [ ] **Waar de knop staat.** Controleer deze plekken: de kalender (het korte venster en de hoverkaart), de lijstweergave (het draai-pijltje), **Voltooid bekijken (…)**, het Dashboard bij lopende verhuringen en de voertuigkaart bovenaan. Het volledige venster heeft de knop niet. (hfst 5.14)
- [ ] **Als er onderweg iets verandert.** Open het venster dubbel. Verwacht: *De reservering of het voertuig is intussen gewijzigd. Hierboven staat het bijgewerkte overzicht; controleer het en bevestig opnieuw.* en *Er is niets om terug te draaien voor deze reservering.* (hfst 5.14)

### Opgehaalde huur annuleren of verwijderen

- [ ] **De waarschuwing.** [kantoor] Annuleer of verwijder een opgehaalde huur. Verwacht: *Deze huur is al opgehaald op <datum> met contract <nummer>.* en *Het voertuig telt daarna weer als beschikbaar en de kilometerstand blijft de stand van het ophalen.* Er is een vinkje *Ik weet dat deze huur al is opgehaald en wil doorgaan*. Zonder vinkje is de knop grijs. (hfst 5.15)
- [ ] **Zonder het recht.** [balie zonder Opgehaalde huur annuleren of verwijderen] Verwacht: de knop is grijs, met een tekstballon. Via een omweg zie je *Voor een opgehaalde huur is het recht 'Opgehaalde huur annuleren of verwijderen' nodig.* (hfst 5.15)
- [ ] **Vervangende huur via een onderhoudsvenster.** Probeer een opgehaalde vervanger daar te verwijderen. Verwacht: *Dit vervangende voertuig is al opgehaald, dus de toewijzing kan hier niet worden verwijderd. Annuleer of verwijder de vervangreservering via Reserveringen; daar krijg je de waarschuwing en bevestig je het.* (hfst 5.15)

---

## Hoofdstuk 6 — Transport

- [ ] **Transportdashboard.** Ga naar **Transporten**. Verwacht: **Aankomend transport**, **Laatste transport** en de tellers **Wacht op planning**, **Klaar voor levering**, **In uitvoering** en **Leveringen voltooid**. Verder **Route-optimalisatie**, de zes tabbladen met aantallen en de tabel **Voertuigtransporten**. (hfst 6.1)
- [ ] **Zoeken en filter.** Verwacht: *Transporten zoeken...* en het filter **Alle statussen** (**Gepland**, **Bezig**, **Voltooid**, **Geannuleerd**). (hfst 6.1)
- [ ] **Kolommen.** Verwacht: **Voertuig**, **Vervangend voertuig**, **Type**, **Route**, **Datum**, **Afstand**, **Tolkosten**, **Facturatie**, **Status** en **Acties**. Een auto die niet van ons is, heeft het label **Extern**. Is één kant onbekend, dan staat er *Eindhoven → onbekend*. (hfst 6.1)
- [ ] **Iconen hebben een naam.** Houd de muis op elk icoon. Verwacht: **Bekijken**, **Markeren als voltooid**, **Vervangend voertuig markeren als opgehaald**, **Vervangend voertuig markeren als teruggebracht**, **Afdrukken / rapport genereren**, **Bewerken** en **Verwijderen**. Ook het prullenbakje heeft een naam. Grijze iconen hebben uitleg: *Al voltooid of geannuleerd*, *Nog geen vervangend voertuig toegewezen* of *Vervangend voertuig nog niet opgehaald*. (hfst 6.1)
- [ ] **Meerdere regels.** Vink regels aan. Verwacht: een balk met **… geselecteerd**, **Afdrukken**, **Markeer voltooid** en **Wissen**. (hfst 6.1)
- [ ] **Transport plannen.** Klik op **Nieuw transport**. Verwacht: **Transport registreren**. Kies een **Type** (**Voertuigwissel**, **Slepen**, **Terughalen**, **Levering**, **Overig**). Zet **Status** op **Gepland**. Kies een **Voertuig**. Vul **Geplande datum** in (verplicht). Klik op **Transport registreren**. Verwacht: **Transport geregistreerd** met de tekst *De transportopdracht is geregistreerd.* (hfst 6.2)
- [ ] **Extern voertuig.** Vink **Extern voertuig (niet in ons wagenpark)** aan. Verwacht: de velden **Kenteken** (met **Opzoeken via RDW**), **Kleur**, **Merk**, **Model**, **Naam eigenaar** en **Telefoon eigenaar**. Het voertuig komt niet in **Voertuigen**. (hfst 6.2)
- [ ] **Adressen en afstand.** Vul **Van (optioneel)** en **Naar (optioneel)** in. Klik op **Berekenen**. Verwacht: een afstand in km. Zonder adressen staat er een streepje. (hfst 6.2)
- [ ] **Tolkosten voorstellen.** Klik op **Voorstellen**. Verwacht: een bedrag op basis van *€0.15/km — instelbaar in Instellingen*. Staat **Retour — voorstel omvat de lege terugrit** aan? Dan rekent het voorstel de lege terugrit mee. (hfst 6.2)
- [ ] **Doorbelasten.** Zet **Doorbelasten aan klant** aan. Kies de **Klant**. Vul **Te factureren bedrag (€)** in. Er is ook **Al gefactureerd aan de klant**. Verwacht: **Facturatie** toont **Gefactureerd**, **Niet gefactureerd** of **Niet factureerbaar**. (hfst 6.2)
- [ ] **Chauffeur, reden, notities.** Verwacht de velden **Chauffeur (optioneel)**, **Reden (optioneel)** en **Notities (optioneel)**. (hfst 6.2)
- [ ] **Auto staat uit bij een klant.** Kies een verhuurde auto. Verwacht: een oranje kader *Dit voertuig staat momenteel uit bij <klant>. …* met de knop **Vervangend voertuig vereist markeren**. (hfst 6.2)
- [ ] **Voertuigwissel.** Zet **Type = Voertuigwissel**. Zet **Pech- of onderhoudswissel** aan. Verwacht de tekst *Onze eigen kosten, niet die van de klant — standaard niet gefactureerd.* (hfst 6.3)
- [ ] **Vervangend voertuig kiezen.** Zet **Vervangend voertuig vereist** aan. Kies een auto. Verwacht: het label **Vervangend voertuig (het voertuig dat als vervanger wordt ingezet)**. Je ziet alleen auto's die op de geplande datum vrij zijn. (hfst 6.4)
- [ ] **TBD.** Laat het vervangende voertuig leeg. Verwacht: **Vervangend voertuig (TBD — nog niet geselecteerd)**. Op het dashboard staat het label **TBD**. Het kruisje (*Wissen (terug naar TBD)*) zet hem terug. (hfst 6.4)
- [ ] **Later toewijzen.** Klik op het dashboard op **Selecteren** bij **TBD**. Kies een auto. Klik op **Wijzigingen opslaan**. Verwacht: **Transport bijgewerkt** met de tekst *De transportopdracht is bijgewerkt.* Het label wordt **Toegewezen**. (hfst 6.4)
- [ ] **Rapport zonder vervanger.** Verwacht: **Afdrukken / rapport genereren** is grijs met *Voor dit transport is een vervangend voertuig vereist, maar er is er nog geen geselecteerd. …* (hfst 6.4)
- [ ] **Transport starten op het scanscherm.** Ga naar **Scannen**. Scan een auto met transport. Verwacht: het blok **Actief transport** met de route en **Gepland**. Klik op **Transport starten**. Verwacht: **Transport gestart**, het label **Onderweg** en de knop **Transport afronden**. Op het dashboard staat **Bezig**. Op het transportdashboard zelf is er geen startknop. (hfst 6.5)
- [ ] **Transport afronden op het scanscherm.** Klik op **Transport afronden**. Verwacht: **Transport afgerond**. (hfst 6.6)
- [ ] **Transport afronden vanaf het dashboard.** Klik op **Markeren als voltooid**. Verwacht: **Transport afronden?** met de tekst *Het transport wordt als voltooid gemarkeerd. Dat kun je daarna niet zomaar terugdraaien.* Er staan **Afgerond op** (vandaag) en **Uitkomst**. Klik op **Afronden**. Verwacht: **Transport gemarkeerd als voltooid**. De uitkomst staat in de notities met *Uitkomst:*. (hfst 6.6)
- [ ] **In bulk.** Vink regels aan. Klik op **Markeer voltooid**. Verwacht: geen extra vraag. (hfst 6.6)
- [ ] **Vraag over de vervanger.** Rond een transport met vervanger af. Verwacht: **Vervangend voertuig markeren als opgehaald?** met **Later** en **Nu markeren als opgehaald**. Kies het laatste. Verwacht: het gewone ophaalvenster. (hfst 6.6)
- [ ] **Vervanger terug.** Klik op **Vervangend voertuig markeren als teruggebracht**. Verwacht: **Vervangend voertuig markeren als teruggebracht?**. De vier standen zijn **TBD** → **Toegewezen** → **Opgehaald** → **Teruggebracht**. (hfst 6.6)
- [ ] **Rapport maken.** Klik op **Afdrukken / rapport genereren**. Verwacht: **Rapport gemaakt** met de tekst *Het rapport staat in Documenten en wordt hieronder getoond.* Je ziet een voorvertoning met een bestandsnaam zoals *Transport_Report_…pdf*. Kies **Afdrukken** of **Sluiten**. (hfst 6.7)
- [ ] **Rapport voor meerdere.** Vink regels aan. Klik op **Afdrukken** (maximaal 50). Verwacht: het rapport staat ook bij **Documenten**. (hfst 6.7)
- [ ] **Fouten bij het rapport.** Blokkeer pop-ups. Verwacht: **Pop-up geblokkeerd** met de tekst *Sta pop-ups voor deze site toe en klik daarna opnieuw op Afdrukken.* Bij een geblokkeerde voorvertoning zie je **Openen in nieuw tabblad**. (hfst 6.7)
- [ ] **Route-optimalisatie.** Klik op **Route-optimalisatie**. Kies een **Datum**. Klik op **Route optimaliseren**. Verwacht: een volgorde met **Totale afstand** en **Openen in Google Maps (nieuw tabblad)**. Is de knop grijs, dan staat er *Er is op deze datum niets gepland. Kies een andere datum.* of *Geen van de geplande ritten heeft een adres of plaats. Vul die eerst in.* (hfst 6.8)
- [ ] **Bekijken.** Klik op **Bekijken**. Verwacht: **Type**, **Status**, **Vervangend voertuig**, **Route**, **Datum**, **Voltooiingsdatum**, **Afstand**, **Tolkosten**, **Facturatie**, **Klant**, **Chauffeur**, **Reden** en **Notities**. Hoort het transport bij een reservering? Dan staat er **Levering vanuit reservering #…** met **Open reservering**. (hfst 6.9)
- [ ] **Bewerken.** Klik op **Bewerken**. Klik op **Wijzigingen opslaan**. Verwacht: de wijziging is bewaard. (hfst 6.9)
- [ ] **Verwijderen en terugzetten.** Klik op het prullenbakje. Verwacht: **Dit transport verwijderen?**. Ga naar **Verwijderde transporten**. Verwacht: de regel met het label **Transport** (*Transport #47 — …*). Klik op **Terugzetten**. Verwacht: het vervangend voertuig wordt heropend als het nog vrij is. **Definitief verwijderen** werkt op dezelfde plek. (hfst 6.9)

---

## Hoofdstuk 7 — Onderhoud

### Kalender en dagvenster

- [ ] **Onderhoudskalender.** [werkplaats] Ga naar **Onderhoud**. Verwacht: **Onderhoudsplanning** met **Lijstweergave**, **Voltooide bekijken (…)**, **Verwijderd onderhoud** en **Onderhoud plannen**. Verder **Kleuren**, **Vandaag** en de filters **Zoek voertuigen of evenementen...**, **Voertuigtype** en **Evenementtype**. (hfst 7.1)
- [ ] **Signalen.** Verwacht: **APK-keuring verschuldigd**, **APK Herinnering (2 maanden)**, **APK Herinnering (1 maand)**, **Garantie verloopt**, **Garantie Herinnering (2 maanden)** en **Garantie Herinnering (1 maand)**. Bij een weekenddatum staat **(Verplaatst van het weekend)**. (hfst 7.1)
- [ ] **Blokken en labels.** Verwacht: **Gepland onderhoud**, **In onderhoud** en **Onderhoudsbeurt nodig**. De labels zijn **Vervanger nodig**, **Vervangend voertuig nodig**, **Verhuur komt eraan** en **Verhuur komt eraan (binnen 3 weken)**. (hfst 7.1)
- [ ] **Dag openen.** Klik op een dagvakje. Verwacht: **Onderhoudsevenementen - <datum>**. Bij een signaal staat alleen **Onderhoud plannen**. Bij een blok staan **Afronden**, **Bewerken**, **Verwijderen** en **Onderhoud bekijken**. Bij een lege dag staat *Geen onderhoudsevenementen gepland voor deze dag*. (hfst 7.1)

### Onderhoud plannen

- [ ] **Venster.** Klik op **Onderhoud plannen**. Verwacht: *Meld pech, plan reparaties of onderhoud voor je voertuigen. …* (hfst 7.2)
- [ ] **Voertuigkeuze en filters.** Verwacht: *Selecteer een voertuig...* met **Alleen beschikbare voertuigen tonen** en **Voertuigen met bestaand onderhoud uitsluiten**. (hfst 7.2)
- [ ] **Klant.** Verwacht: het zoekveld *Zoek op naam, telefoon of plaats...* en bij geen treffer *Geen klanten gevonden.* Bovenaan staat **Geen (geen klant)**. Bij een lopende verhuring staat het label **Actieve verhuur**. (hfst 7.2)
- [ ] **Veertien onderhoudstypen.** Verwacht: **Voertuigpech**, **Bandenwissel**, **Remmenonderhoud**, **Motorreparatie**, **Transmissiereparatie**, **Elektrisch probleem**, **Airconditioning**, **Accuwissel**, **Olieverversing**, **Regulier onderhoud**, **APK-keuring**, **Garantieservice**, **Ongevalschade** en **Overig**. (hfst 7.2)
- [ ] **Geplande datum en duur.** Verwacht: **Geplande datum**, **Duur (dagen)**, **Omschrijving** en **Notities**. Er is geen einddatum. (hfst 7.2)
- [ ] **Geen statusveld bij het plannen.** Verwacht: een nieuw blok staat op gepland. **Status** zie je pas bij **Bewerken**. **(nieuw)** (hfst 7.2)
- [ ] **Plannen.** Klik op **Onderhoud plannen**. Verwacht: **Onderhoud gepland** met de tekst *Het onderhoud is gepland en de herinneringen zijn bijgewerkt.* Het blok staat in de kalender. (hfst 7.2)
- [ ] **Geannuleerde huur telt niet.** Plan onderhoud op een auto met alleen een geannuleerde of voltooide huur. Verwacht: geen tweede stap. Je plant gewoon. (hfst 7.2)

### Vervangers en plannen afbreken

- [ ] **Tweede stap.** Plan onderhoud op een auto met een lopende huur. Verwacht: **Vervangende voertuigen toewijzen** met de tekst *Het geselecteerde voertuig heeft actieve reserveringen tijdens de onderhoudsperiode. …* Per reservering staat **Vervoersoplossing:** met **Nu vervangend voertuig toewijzen**, **Later vervanger toewijzen (nog te bepalen)** en **Klant regelt eigen vervoer**. (hfst 7.2)
- [ ] **Huurperiode vervanger.** Klik op **Bewerken** achter *Vervangende verhuur*. Verwacht: **Huurperiode vervanger instellen** met **Onderhoudsdata gebruiken** en **Open einde maken**. (hfst 7.2)
- [ ] **Geen keuze gemaakt.** Ga door zonder een keuze. Verwacht: **Ontbrekende toewijzingen vervangend voertuig** met de tekst *Kies een specifiek voertuig of 'Nog te bepalen' voor alle betrokken reserveringen.* (hfst 7.2)
- [ ] **Afronden met één klik.** Klik op **Vervangers toewijzen & onderhoud plannen**. Verwacht: één klik is genoeg, ook als de lijst met auto's openstaat. (hfst 7.2)
- [ ] **Plannen afbreken.** Klik in dit venster op **Annuleren** (of druk op Escape, klik op het kruisje of klik naast het venster). Verwacht: **Plannen afbreken?** met de tekst *Het onderhoud wordt weer weggehaald. Wilt u zonder vervanger plannen, kies dan bij de klant 'Later vervanger toewijzen'.* **(nieuw)** (hfst 7.2)
- [ ] **Doorgaan met plannen.** Klik op **Doorgaan met plannen**. Verwacht: je bent terug in het venster. Het onderhoud staat er nog. **(nieuw)** (hfst 7.2)
- [ ] **Plannen afbreken bevestigen.** Klik op **Plannen afbreken**. Verwacht: **Plannen afgebroken** met de tekst *Het onderhoud is weer weggehaald.* Het blok staat niet in de kalender. Het staat ook niet in **Verwijderd onderhoud**. **(nieuw)** (hfst 7.2)
- [ ] **Afbreken zonder omweg gaat alleen bij nieuw onderhoud.** Open het venster een uur later opnieuw voor bestaand onderhoud (of voor onderhoud met een vervanger). Breek af. Verwacht: **Onderhoud verwijderd** met de tekst *Het onderhoud staat in de prullenbak en kan daar worden teruggezet.* **(nieuw)** (hfst 7.2)
- [ ] **De klant hoort ervan.** Had de klant al een melding "onderhoud gepland"? Verwacht: dan hoort hij ook dat het niet doorgaat. Anders hoort hij niets. **(nieuw)** (hfst 7.2)

### Beschikbaarheid en onderhoud

- [ ] **Gepland blok zet de auto op Gepland.** Plan een blok. Verwacht: de lijst en het scanscherm tonen **Gepland**. **(nieuw)** (hfst 7.3)
- [ ] **Een verhuurde auto blijft Verhuurd.** Plan vandaag onderhoud op een auto die bij een klant staat. Verwacht: **Verhuurd**. **(nieuw)** (hfst 7.3)
- [ ] **Boeken mag, met geel.** Boek de auto. Verwacht: de auto staat in de keuzelijst met de gele waarschuwing. Opslaan mag. (hfst 7.3)
- [ ] **Telling voorzichtig.** Kijk op het Dashboard. Verwacht: zo'n auto telt niet bij **Beschikbare voertuigen**. (hfst 7.3)
- [ ] **Ophalen mag met waarschuwing; Binnen weigert.** Zie ook hoofdstuk 5. Verwacht: op **Binnen** verschijnt **Uitgifte geblokkeerd**. (hfst 7.3)
- [ ] **Vervanger toewijzen vanuit de huur.** Open de reservering. Klik op **Voertuig markeren voor onderhoud** → **Vervangend voertuig toewijzen**. Vul **Startdatum** en **Einddatum** in. Kies uit **Beschikbare vervangende voertuigen**. Klik op **Vervangend voertuig toewijzen**. Verwacht: **Vervangend voertuig toegewezen** met de tekst *Het vervangende voertuig is succesvol toegewezen.* (hfst 7.4)
- [ ] **Slechts één knop tegelijk.** Kijk in **Voertuigservice**. Verwacht: is alles in orde, dan staat er alleen **Voertuig markeren voor onderhoud**. Bij **Onderhoud nodig** of **Momenteel in onderhoud** staat er **Vervangend voertuig toewijzen**. Met een vervanger zie je het oranje blok met **Terug van onderhoud**. (hfst 7.4)
- [ ] **Later toewijzen (placeholder).** Kies "later toewijzen". Verwacht: **TBD** in de kalender. Op het Dashboard bij **Beheer vervangende voertuigen** → **Nog te bepalen** staat *Vervangend voertuig (nog te bepalen)* met **Voertuig toewijzen**. In het overzicht staat het tabblad **Vervangers (…)** met *Toewijzing nodig* en **Toewijzen**. (hfst 7.4)
- [ ] **Meerdere tegelijk.** Wijs meerdere vervangers toe. Verwacht: **Vervangende voertuigen toewijzen** met per regel **Selecteer voertuig** en de knop **… voertuigen toewijzen**. (hfst 7.4)
- [ ] **In het onderhoudsvenster.** Klik op **Onderhoud bekijken**. Verwacht: **Toewijzingen vervangend voertuig** met **Toegewezen vervangend voertuig** en de opties **Nog te bepalen (Placeholder)** en **Eigen vervoer**. (hfst 7.4)

### Werkplaatsstatus

- [ ] **Voertuig markeren voor onderhoud.** Open een reservering. Klik op **Voertuig markeren voor onderhoud**. Kies een **Onderhoudsstatus** (**Onderhoud nodig** of **Momenteel in onderhoud**). Vul **Servicenotities** in. Klik op **Markeren voor onderhoud**. Verwacht: **Voertuig gemarkeerd voor onderhoud** met de tekst *Het voertuig is succesvol gemarkeerd als onderhoud nodig.* De auto staat op **In reparatie**. Er is een blok. (hfst 7.5)
- [ ] **Onderhoud inplannen vanaf het scanscherm.** Klik op **Onderhoud inplannen**. Verwacht: **Onderhoud plannen** opent, met de auto ingevuld. (hfst 7.5, 18.4)
- [ ] **Terug uit onderhoud, met een lopend onderhoud.** [werkplaats] Neem een auto op **Binnen** in een blok van vandaag. Ga naar **Scannen**. Klik op **Terug uit onderhoud**. Verwacht: het venster **Onderhoud afronden** opent (geen directe klik). **Afronden** geeft **Onderhoud afgerond**. **(nieuw)** (hfst 7.5, 18.4)
- [ ] **Terug uit onderhoud zonder blok.** Neem een auto in de werkplaats zonder blok op Binnen. Verwacht: één klik, **Voertuig is terug uit onderhoud**. (hfst 7.5)
- [ ] **Alleen Voertuigen beheren is niet genoeg.** [alleen Voertuigen beheren] Neem dezelfde auto op **Binnen**. Verwacht: **Terug uit onderhoud** is grijs. Een tik zegt dat **Onderhoud beheren** of **Reserveringen beheren** ontbreekt. Een auto in de werkplaats *zonder* lopend onderhoud kan dit account wel vrijgeven. **(nieuw)** (hfst 7.5, 15.11)
- [ ] **Alleen Onderhoud beheren is genoeg.** [werkplaats zonder Voertuigen beheren] Verwacht: het venster **Onderhoud afronden** opent meteen. **(nieuw)** (hfst 7.5)
- [ ] **Terug van onderhoud (vervanger).** Open een reservering met het oranje blok **Vervangend voertuig toegewezen** (*Voertuig wordt momenteel onderhouden*). Klik op **Terug van onderhoud**. Vul **Inleverdatum**, **Huidige kilometerstand** en **Servicenotities** in. Verwacht: **Voertuig teruggekeerd van onderhoud** met de tekst *Het voertuig staat weer op beschikbaar, het onderhoudsblok van vandaag is afgesloten en de vervangende reservering is beëindigd.* (hfst 7.5)
- [ ] **Onderhoud later in de kalender blijft staan.** Kijk in de kalender. Verwacht: een later blok staat er nog. (hfst 7.5)

### Onderhoud afronden

- [ ] **Wie het mag.** [werkplaats] Verwacht: **Afronden** werkt met **Onderhoud beheren** of **Reserveringen beheren**. Zonder een van beide is de knop grijs. (hfst 7.6)
- [ ] **Venster Onderhoud afronden.** Open het dagvenster. Klik op **Afronden**. Verwacht: *Bekijk en werk de voertuiggegevens bij na het afronden van het onderhoud.* met **Voertuiginformatie** (**Kenteken**, **Voertuig**, **Onderhoudstype**, **Laatst bekende kilometerstand**, **Huidige APK**) en **Afrondingsdetails**. (hfst 7.6)
- [ ] **Voorgevulde velden.** Verwacht: **Afrondingsdatum** (de begindatum van het blok), **APK-datum** (de huidige datum of berekend) en **Huidige kilometerstand (km)**. Wat er staat, wordt opgeslagen. Maak de APK-datum leeg als de auto niet gekeurd is. (hfst 7.6)
- [ ] **APK-formulier.** Verwacht: **APK-keuringsformulier (optioneel)** (pdf, jpg of png). (hfst 7.6)
- [ ] **Servicecategorie en details.** Verwacht: **Servicecategorie** (**Gepland onderhoud** of **Reparatie**) en **Onderhoudsdetails**. (hfst 7.6)
- [ ] **Afronden.** Klik op **Afronden**. Verwacht: **Onderhoud afgerond** met je omschrijving (*Onderhoud afgerond: olie- en filterwissel.*). Het blok verdwijnt uit de kalender. Het staat onder **Voltooide bekijken**. **(nieuw: Afronden in plaats van Uit)** (hfst 7.6)
- [ ] **Alles in één handeling.** Controleer daarna het volgende. De einddatum van het blok is de afrondingsdatum. De APK-datum en de kilometerstand staan op de voertuigkaart. Bij **Gepland onderhoud** staan ook de laatste servicedatum en de laatste stand erbij. Het APK-formulier staat als document bij de auto én bij het blok. De werkplaatsstatus is eraf. Een open vervanger is gesloten. (hfst 7.6)
- [ ] **Afrondingsdatum vóór de begindatum.** Vul zo'n datum in. Verwacht: geweigerd. (hfst 7.6)
- [ ] **Te lage kilometerstand.** Vul een lagere stand in. Verwacht: *De kilometerstand (… km) is lager dan de huidige stand van het voertuig (… km). Controleer de stand; er is niets opgeslagen.* Het blok blijft open. Een gelijke stand mag wel. (hfst 7.6)
- [ ] **Alles of niets.** Laat het afronden mislukken (testomgeving). Verwacht: *Onderhoud afronden mislukt. Probeer het opnieuw.* Het venster blijft open. Er is niets half opgeslagen. (hfst 7.6)
- [ ] **Alle plekken hetzelfde woord.** Verwacht: **Afronden** staat in het dagvenster, in het tabblad **Gepland** van het overzicht, in het bewerkvenster en in het scanvenster. Het woord *Voltooien* komt bij onderhoud nergens meer voor. **(nieuw)** (hfst 7.6)
- [ ] **Uit bestaat niet meer.** Klik op **Bewerken** bij een blok. Verwacht: **Status** heeft alleen **Gepland (voertuig nog niet gearriveerd)** en **Binnen (voertuig is in onderhoud)**. Onderaan staat de knop **Afronden**. **(nieuw)** (hfst 7.6)
- [ ] **Afgerond blok bewerken.** Open een afgerond blok. Verwacht: in plaats van een statuskeuze staat er *Afgerond op <datum>*. (hfst 7.6)
- [ ] **Afronden via de status kan niet.** Dit kun je alleen op een oude pagina proberen. Verwacht: *Een onderhoud rond je af met de knop Afronden, niet met de status.* (code `USE_COMPLETE_ROUTE`). Een tweede afronding geeft *Dit onderhoud is al afgerond.* (code `ALREADY_COMPLETED`). **(nieuw)** (hfst 7.6, 12)
- [ ] **Onderhoudstype in het Nederlands.** Kijk in het venster. Verwacht: het type staat er zoals *Pech*. (hfst 7.6)
- [ ] **Terug in dienst.** Scan de auto na **Afronden**. Verwacht: **Beschikbaar** en geen oranje blok **Onderhoud**. Stond de auto op **Niet voor verhuur**? Dan blijft dat zo. (hfst 7.7)

### Overzicht en geschiedenis

- [ ] **Onderhoudsoverzicht.** Klik op **Lijstweergave**. Verwacht: **Onderhoudsoverzicht** met een totaal en het zoekveld *Zoek voertuigen, kentekens, klanten...*. Er zijn vier tabbladen: **APK (…)**, **Garantie (…)**, **Gepland (…)** en **Vervangers (…)**. (hfst 7.8)
- [ ] **APK-tab.** Open het tabblad. Verwacht: de kolom **Urgentie** met *… dagen te laat*, *Vandaag verschuldigd* of *… dagen resterend*. De knoppen zijn **Plannen** en **Bekijken**. (hfst 7.8)
- [ ] **Afronden vanuit het overzicht.** Ga naar het tabblad **Gepland**. Klik op **Afronden**. Verwacht: hetzelfde venster, al ingevuld met de APK-datum en de kilometerstand van de auto. (hfst 7.8)
- [ ] **Binnen melden.** [werkplaats] Neem een blok op *gepland*. Klik op **Binnen melden**. Verwacht: **Voertuig binnen gemeld** met de tekst *Het onderhoud staat op Binnen en het voertuig is in onderhoud.* De auto staat op **Reparatie nodig**. Een blok dat al *Binnen* is, heeft alleen **Afronden**. **(nieuw)** (hfst 7.8)
- [ ] **Rechten bij de knoppen.** Verwacht: **Afronden** vraagt **Onderhoud beheren** of **Reserveringen beheren**. **Binnen melden** vraagt **Voertuigen beheren**. Zonder recht is de knop grijs. Een tik zegt welk vinkje je mist. (hfst 7.8)
- [ ] **Verwijderen of annuleren wist de reparatiestand.** Zet een blok op **Binnen** (de auto staat dan op **Reparatie nodig**). Verwijder het blok. Verwacht: de auto is niet langer **Reparatie nodig**. **(nieuw)** (hfst 7.8)
- [ ] **Omschrijving in het Nederlands.** Verwacht: *Pech: lekke band* in plaats van *breakdown: lekke band*. Oude blokken heten *Onderhoudsblok*. (hfst 7.8)
- [ ] **Voltooide bekijken.** Klik op **Voltooide bekijken (…)**. Verwacht: **Geschiedenis voltooid onderhoud** met de tekst *Voltooide onderhoudsrecords bekijken, bewerken, terugdraaien of verwijderen*. Per regel staat het type, het label **Gepland** of **Reparatie**, en *Voltooid: <datum>*. (hfst 7.8)
- [ ] **Terugdraaien.** Klik op **Terugdraaien**. Verwacht: **Onderhoud teruggedraaid** met de tekst *Onderhoud is weer gemarkeerd als actief*. Het blok staat weer op **Binnen**. De auto staat op **Reparatie nodig**. Je kunt het blok bewerken of opnieuw met **Afronden** afsluiten. **(nieuw)** (hfst 7.8)
- [ ] **Verwijderen.** Klik in deze lijst op **Verwijderen**. Verwacht: *Dit onderhoudsrecord wordt naar de prullenbak van dit scherm verplaatst (knop Verwijderd onderhoud); terugzetten kan daar.* (hfst 7.8)
- [ ] **Prullenbak van Onderhoud.** [kantoor] Klik op **Verwijderd onderhoud**. Verwacht: het label **Onderhoud**. **Terugzetten** werkt ook als er intussen een verhuring op die dagen staat. **Definitief verwijderen** kan per regel, per selectie of met **Prullenbak leegmaken**. Documenten van de auto, zoals een APK-bewijs, blijven staan. (hfst 7.8)
- [ ] **Grijs zonder vinkje.** [zonder Prullenbak beheren] Verwacht: **Verwijderd onderhoud** is grijs. (hfst 7.8)

### Portaalaanvraag voor onderhoud

- [ ] **Aanvraag openen.** Ga naar **Klantenportaal** → tegel **Aanvragen** of **Onderhoud**. Verwacht: **Aanvraag #<nummer>** met het soort (**Onderhoud/storing** of **Onderhoud wijzigen**) en de klant. (hfst 7.9)
- [ ] **Melding van de klant.** Verwacht: **Klacht**, **Kilometerstand**, **Dringend**, **Vervangend vervoer gewenst** en **Gewenste datum**. Bij verzetten staan er **Nu gepland op**, **Gevraagde datum** en **Reden**. Ook **Bijlagen**. (hfst 7.9)
- [ ] **In behandeling nemen.** Klik op de knop. Verwacht: de status verandert. (hfst 7.9)
- [ ] **Inplannen.** Klik op **Inplannen in de onderhoudskalender**. Vul **Datum** (*Alleen werkdagen (ma t/m vr)*), **Duur (dagen)** en **Soort** in. Vul **Notitie voor de klant** in. Klik op **Inplannen en bevestigen**. Verwacht: **Onderhoud #… staat in de kalender**. (hfst 7.9)
- [ ] **Verplaatsen.** Klik op **Onderhoud verplaatsen** → **Verplaatsen en bevestigen**. Verwacht: **Onderhoud #… is verplaatst**. (hfst 7.9)
- [ ] **Antwoord sturen en afwijzen.** Klik op **Antwoord mailen (blijft open)**. Klik op **Afwijzen** zonder tekst. Verwacht: *Vul een antwoord in.* (hfst 7.9)
- [ ] **Geen Beantwoorden en afhandelen bij onderhoud.** Verwacht: de tip *Een onderhoudsmelding kan alleen worden afgehandeld via Inplannen (zet het in de kalender) of Afwijzen.* (hfst 7.9)

---

## Hoofdstuk 8 — Documenten en afdrukken

- [ ] **Vier soorten papier.** Controleer wat de app maakt. Verwacht: **Huurcontract**, **Schadecheck**, **Transportrapport** en labels. De app maakt géén getekend contract en géén factuur. (hfst 8.1)
- [ ] **Nederlandse notatie.** Open een contract. Verwacht: datums als 13-09-2026 en bedragen als € 1.234,50. Zonder einddatum staat er **nader te bepalen**. (hfst 8.2)
- [ ] **Tijd op een gedrukt document.** Controleer een tijd op een document of export. Verwacht: de Nederlandse klok, niet 1 of 2 uur ernaast. **(nieuw)** (hfst 10.3)
- [ ] **Documentbibliotheek.** Ga naar **Documenten** → **Documentbibliotheek**. Verwacht: de aantallen voertuigen, documenten en documenttypen. De filters zijn **Alle voertuigen** en **Alle documenttypen**. Het zoekveld **Documenten zoeken...** zoekt op bestandsnaam, kenteken (met of zonder streepjes), merk, model en documenttype. Er is **Alles uitklappen** en **Alles inklappen**. De lijst sorteert op kenteken. Bij geen treffer staat er *Geen documenten gevonden die overeenkomen met je filters.* (hfst 8.3)
- [ ] **Document uploaden.** [kantoor] Klik op **Document uploaden**. Verwacht: je kiest eerst het voertuig. Het formulier verschijnt in hetzelfde venster. Met een voertuigfilter staat het voertuig voorgevuld. Zonder **Documenten bewerken en genereren** is de knop grijs. Een tik zegt welk vinkje je mist. (hfst 8.3, 8.7)
- [ ] **Documenten bij het voertuig en bij de reservering.** Open de voertuigkaart → **Documenten**. Open een reservering → **Reserveringsdocumenten**. Verwacht daar de tekst *Documenten specifiek gekoppeld aan deze reservering (contracten, schaderapporten, foto's)*. (hfst 8.3)
- [ ] **Nederlandse kopjes.** Verwacht: **Contract (niet ondertekend)**, **Contract (ondertekend)**, **Schadecheck (ophalen)**, **Schadecheck (inleveren)** en **Transportrapport**. Kentekens hebben streepjes. (hfst 8.3)
- [ ] **Contract klaar.** Haal een auto op. Verwacht: **Contract klaar** met de tekst *<bestandsnaam> is aangemaakt. Print het of mail het direct naar de klant.* en de knoppen **Afdrukken** en **Mail naar klant**. (hfst 8.4)
- [ ] **Contract kon niet gemaakt worden.** Verwacht: een Nederlandse reden (zie hieronder) en **Opnieuw proberen**. Het ophalen is wel verwerkt. Er staat geen kapot bestand in de bibliotheek. (hfst 8.4)
- [ ] **Mislukte schadecheck.** Verwacht: geen knop **Opnieuw proberen**. Maak de check opnieuw vanuit het schadecheckscherm. (hfst 8.4)
- [ ] **Vijf knoppen per document.** Verwacht: **Bekijken** (voorvertoning), **Downloaden**, **Afdrukken**, **E-mailen** en **Verwijderen**. (hfst 8.4)
- [ ] **Afdrukken.** Klik op **Afdrukken**. Verwacht: *Afdrukken gestart — Het afdrukvenster zou nu open moeten zijn. De pop-up sluit automatisch.* Bij een pop-upblokkade zie je *Je browser heeft afdrukken geblokkeerd. Gebruik de downloadknop en druk handmatig af.* of *Sta pop-ups toe en probeer het opnieuw, of gebruik de downloadknop.* (hfst 8.4)
- [ ] **Interactieve schadecheck.** Open de voertuigkaart → **Documenten** → **Nieuwe check**. Verwacht: een diagram. Ontbreekt het modeldiagram? Dan staat er **Geen diagram voor dit model** met merk en model van het getoonde diagram. Bij een onbruikbaar diagram zie je een rood blok **Dit diagram is niet bruikbaar**. (hfst 8.4)
- [ ] **Wat je aanklikte.** Kies een antwoord. Verwacht: het heeft een vinkje en een rand. Een leeg veld zegt *niet ingevuld*. Per blok staat *3 van 8 ingevuld*. (hfst 8.4)
- [ ] **Alles goed.** Klik per blok op **Alles goed**. Verwacht: alleen de lege velden worden ingevuld. (hfst 8.4)
- [ ] **Opslaan.** Sla op. Verwacht: *Bezig met opslaan…* en daarna *Opgeslagen om 14:32. De PDF is klaar.* Er is geen melding **Check geladen**. (hfst 8.4)
- [ ] **Check en inleveren.** Kijk boven het formulier. Verwacht: daar staat dat de schadecheck-PDF bij het inleveren de laatst opgeslagen check overneemt. (hfst 8.4)
- [ ] **Sjablonen: tabbladen.** Verwacht: **Contractsjablonen**, **Transportrapportsjablonen**, **Barcodelabels** en **Schadecheck-sjablonen**. [kantoor zonder PDF-sjablonen beheren] ziet **Contractsjablonen** en **Transportrapportsjablonen** grijs. Een tik zegt welk vinkje je mist. (hfst 8.5)
- [ ] **Tapesjabloon maken.** Ga naar **Barcodelabels** → **Nieuw sjabloon**. Vul een naam in. Zet **Soort label** op **DYMO-tape (48 x 12 mm)**. Maak het sjabloon aan. Verwacht: een sjabloon van 48 bij 12 met **Lengte (mm)** en **Tapebreedte (mm)**. De schakelaar **DYMO-tape: staand afdrukken, inhoud gedraaid** staat aan. Er zijn drie velden: barcode, kenteken en **Sleutel (Hoofd/Reserve)** met het voorbeeld *Hoofd*. Voeg een veld **Vaste tekst** toe. Sla op. Kies dit sjabloon op de voertuigkaart bij **Labelsjabloon**. Druk af. Verwacht: staand, gedraaid, met je tekst. (hfst 8.5, 18.9)
- [ ] **Sjablooneditor.** Klik op **Sjablooneditor openen**. Sleep velden. Klik op **Als standaard instellen**. Verwacht: het label **Standaard**. (hfst 8.5)
- [ ] **Sjabloon zonder velden.** Zet een leeg sjabloon op standaard. Verwacht: *Een sjabloon zonder velden kan niet het standaardsjabloon zijn: elk contract dat ermee wordt gemaakt zou leeg zijn. Plaats eerst minstens één veld.* Maak het standaardsjabloon leeg. Verwacht: een rood blok **Dit standaardsjabloon heeft geen velden**. (hfst 8.5)
- [ ] **Niet-opgeslagen wijzigingen.** Kijk in de editor. Verwacht: *Er zijn niet-opgeslagen wijzigingen.* of *Alle wijzigingen zijn opgeslagen.* Sluit met wijzigingen. Verwacht: **Wijzigingen niet opgeslagen** met de tekst *Je hebt wijzigingen aan dit sjabloon die nog niet zijn opgeslagen. Als je de editor nu sluit, gaan ze verloren.* en de knoppen **Verder bewerken** en **Wijzigingen weggooien**. Dit gebeurt ook als je een ander sjabloon kiest. Het geldt voor de editor van contracten, transportrapporten en barcodelabels. (hfst 8.5)
- [ ] **Escape na opslaan.** Druk direct na **Opslaan** op Escape. Verwacht: de eerste Escape wordt door de melding opgevangen. Wacht even of klik op **Sluiten**. (hfst 8.5)
- [ ] **Contractfouten in het Nederlands.** Boots één voor één na wat je kunt. Geen sjabloon geeft *Er is geen contractsjabloon ingesteld. Maak er een aan onder Documenten → Contractsjablonen en klik dan op Opnieuw proberen.* Meerdere sjablonen zonder standaard geeft *Er zijn meerdere sjablonen maar geen standaard. Kies een standaardsjabloon onder Documenten → Contractsjablonen.* Een sjabloon zonder velden geeft *Het contractsjabloon 'naam' heeft geen velden. …* Enzovoort. (hfst 8.5)
- [ ] **Opnieuw genereren geeft ook Nederlands.** Verwacht bij een fout: *Er is geen contractsjabloon ingesteld. Maak er een aan onder Documenten → Contractsjablonen.* Er staat nooit een Engelse tekst met *400:* ervoor. (hfst 8.5)
- [ ] **Verouderd.** Wijzig de datums van een reservering met een contract. Verwacht: het contract krijgt het oranje label **Verouderd** · versie 1. De uitleg is *Dit document is gemaakt vóór een wijziging aan de reservering en klopt mogelijk niet meer.* De reden is *de reservering is gewijzigd nadat dit document was gemaakt*. (hfst 8.6)
- [ ] **Opnieuw genereren.** Klik op **Opnieuw genereren**. Verwacht: *Bezig met genereren…* en daarna **Nieuwe versie aangemaakt** met de tekst *Versie 2 van <bestandsnaam> staat nu in het dossier. De oude versie blijft bewaard.* De oude versie houdt **Verouderd**. De nieuwe is schoon. De knop staat in de bibliotheek én in **Reserveringsdocumenten**. (hfst 8.6)
- [ ] **Waar de knop niet staat.** Verwacht: de knop ontbreekt bij een geüpload document, een transportrapport en een document zonder reservering. (hfst 8.6)
- [ ] **Verouderd na terugdraaien.** Draai een ophaling terug. Verwacht: het niet-ondertekende contract krijgt **Verouderd** (*de overdracht is teruggedraaid*). Het wordt niet verwijderd. **(nieuw)** (hfst 8.6)
- [ ] **De twee documentrechten.** [kijker met Documenten bekijken] Verwacht: openen, downloaden en afdrukken lukt. Genereren, mailen, uploaden en verwijderen lukt niet: *Not authorized. One of these permissions required: manage_documents*. [zonder beide] ziet het menu-item **Documenten** niet. (hfst 8.7)

---

## Hoofdstuk 9 — E-mail versturen vanuit de app

Gebruik bij deze regels **altijd je eigen e-mailadres** als ontvanger.

### Documenten mailen

- [ ] **Venster openen.** Klik bij een document op **E-mailen**. Of klik op **Mail naar klant** na het ophalen. Of open het vanuit de kalender. Verwacht: **Documenten e-mailen naar klant** met de tekst *Selecteer documenten, ontvanger en taal om naar de klant te sturen*. (hfst 9.3)
- [ ] **Documenten kiezen.** Verwacht: de groepen **Contracten**, **Schadechecks** en **Overige documenten**. Alles wat je aanvinkt, gaat in één e-mail. (hfst 9.3)
- [ ] **Ontvanger.** Kijk bij **E-mailadres ontvanger**. Verwacht: **Algemeen**, het adres van de klant (*Klant: <adres>*), **Facturen** of **Aangepast e-mailadres**. (hfst 9.3)
- [ ] **Sjabloon en taal.** Verwacht: **Contract-e-mail**, **Schadecheck-e-mail** en **Gecombineerde documenten-e-mail**. Bij meer dan één document springt de keuze vanzelf naar gecombineerd. **E-mailtaal** is **Nederlands** of **Engels**. **Onderwerp** en **Bericht** kun je aanpassen. (hfst 9.3)
- [ ] **Versturen.** Klik op **E-mail versturen**. Verwacht: *Versturen...* en daarna **Gelukt** met de tekst *E-mail succesvol verstuurd naar <adres> met 2 documenten bijgevoegd*. De mail komt aan. (hfst 9.3)
- [ ] **Knop grijs.** Kijk onder het venster. Verwacht: *Nog nodig om te versturen:* met *kies minstens één document*, *een geldig e-mailadres van de ontvanger* of *een onderwerp*. (hfst 9.3)
- [ ] **Controles vooraf.** Verwacht: **Ongeldig e-mailadres** met de tekst *Voer een geldig e-mailadres in*. **Geen documenten** met de tekst *Selecteer minstens één document om te versturen*. En *Geen e-mailadres ontvanger geselecteerd*. (hfst 9.3)
- [ ] **Mislukt.** (Testomgeving, kapotte mailinstelling.) Verwacht: het venster blijft open en zegt *De e-mail kon niet verstuurd worden. Controleer de e-mailinstellingen onder Instellingen en probeer het opnieuw.* (hfst 9.3, 9.5)
- [ ] **Verzendstatus bij het document.** Open **Reserveringsdocumenten**. Verwacht: groen **Verzonden op 13-09-2026 aan klant@voorbeeld.nl** of rood **Verzenden mislukt — <reden>**. Bij meerdere pogingen zie je de laatste. (hfst 9.4)

### Welke mails er bestaan

- [ ] **Bekeuring: geen mail tot Klant informeren.** Zie hoofdstuk 2 in deze lijst. Verwacht: in het **E-maillogboek** staat de mail onder het soort **Bekeuring**. **(nieuw)** (hfst 9.1)
- [ ] **Bekeuring: waarom het niet lukte.** Klik op **Klant informeren**. Verwacht een van deze meldingen: *Er is geen klant aan deze bekeuring gekoppeld, dus er is niets verstuurd.*, *Deze klant heeft geen e-mailadres, dus er is niets verstuurd.*, *Het portaal staat uit voor deze klant, dus er is niets verstuurd.* of *De mail kon niet worden verstuurd. Controleer de e-mailinstellingen en probeer het opnieuw.* **(nieuw)** (hfst 9.1, 12)
- [ ] **Onderhoudsmail.** Plan, verzet en rond onderhoud af voor een klant met portaalaccount. Verwacht de onderwerpen **Onderhoud gepland**, **Onderhoud verplaatst**, **Auto in onderhoud**, **Onderhoud klaar**, **Onderhoud vervalt**, **Onderhoud hoort niet meer bij uw huur** en **Vervangend vervoer staat klaar**. Staat het portaal uit? Dan gaat er niets. (hfst 9.1)

### APK-herinneringen

- [ ] **Alleen de huidige huurder.** Open de voertuigkaart. Klik op **APK-herinnering versturen**. Verwacht: één ontvanger met het label **Huidige huurder** en de periode van de huur. (hfst 9.2)
- [ ] **Auto zonder huurder.** Doe hetzelfde bij een auto zonder huurder. Verwacht: **Dit voertuig is nu niet verhuurd** en de knop **Melding naar kantoor versturen**. (hfst 9.2)
- [ ] **Verzamelmail aan kantoor.** Verwacht het onderwerp *Herinnering: 3 voertuig(en) zonder huurder*. De mail noemt kenteken, merk, model en APK-datum. Er staat *Deze melding gaat alleen naar kantoor.* (hfst 9.2)
- [ ] **Kantooradres.** [beheerder] Ga naar **App-instellingen** → **E-mail & GPS** → **Kantooradres voor meldingen**. Klik op **Kantooradres opslaan**. Is het veld leeg? Dan noemt het scherm het afzenderadres waar de mail dan naartoe gaat. (hfst 9.2)

### Communicatie

- [ ] **APK-herinneringen versturen.** Ga naar **Communicatie** → **Meldingen versturen** → **APK-herinneringen**. Kies ontvangers. Klik op **Voorvertonen & versturen naar … voertuigen**. Verwacht: **E-mailvoorvertoning**. (hfst 9.5)
- [ ] **Persoonlijke voorvertoning.** Klik op een ontvanger. Verwacht: *Zo ziet <naam> de e-mail* met zijn eigen kenteken en klantnaam. Bij een auto zonder huurder staat *Zo ziet kantoor de melding over dit voertuig*. Zonder bruikbaar adres staat *Geen geschikt e-mailadres: wordt niet verstuurd. Kies een ander adres of een andere ontvanger.* Bij een leeg veld staat *Leeg voor deze ontvanger:* met de veldnaam. (hfst 9.5)
- [ ] **Grijze voorvertoonknop.** Kijk eronder. Verwacht: *Kies minstens één ontvanger (klant of voertuig) om te kunnen voorvertonen.* of *Vul een onderwerp en een bericht in, of kies een sjabloon, om te kunnen voorvertonen.* (hfst 9.5)
- [ ] **Veel ontvangers.** Kies 25 of meer ontvangers. Verwacht: **Let op: veel ontvangers**. De knop blijft grijs tot **Ik heb de tekst en de ontvangers gecontroleerd** is aangevinkt. (hfst 9.5)
- [ ] **Uitkomst na het versturen.** Verwacht: **Meldingen verstuurd** met de tekst *3 e-mails verstuurd*. Of **Gedeeltelijk verstuurd**. Of **Er is niets verstuurd** (in het rood, het formulier blijft ingevuld). Of *Er was niemand om naar te mailen.* (hfst 9.5)
- [ ] **Onderhoud en Aangepast bericht.** Volg dezelfde route voor **Onderhoud** en **Aangepast bericht**. Kies een sjabloon. Verwacht: welke sjablonen je ziet, hangt van de categorie af. Portaalsjablonen zie je hier nooit. (hfst 9.7)
- [ ] **E-maillogboek.** Open **E-maillogboek**. Verwacht: *Elke verstuurde en mislukte e-mail, de nieuwste bovenaan.* Per regel staat het onderwerp, de datum en tijd en het soort (**APK**, **Onderhoud**, **Aangepast**, **GPS-activatie**, **Document per e-mail**, **Overige e-mail**). Ook de ontvanger of *N ontvangers · X verstuurd, Y mislukt* en het label **verzonden**, **mislukt** of **deels mislukt**. Je verstuurde mail staat er meteen in. (hfst 9.4)
- [ ] **Reden van mislukking.** Verwacht: **Reden van mislukking:** in het Nederlands (bijvoorbeeld *De e-mailserver weigerde de verbinding.* of *Geen geschikt e-mailadres gevonden.*). Per reden staat hoe vaak. Er is ook **Technische melding:**. (hfst 9.4)
- [ ] **Details.** Klik op **Details**. Verwacht: **E-mail in het logboek**. Onderaan staat dat de inhoud niet wordt bewaard. (hfst 9.4)
- [ ] **Lege en foute toestand.** Verwacht: *Er zijn nog geen e-mails verstuurd* of *Het e-maillogboek kon niet worden geladen. Probeer het later opnieuw.* (hfst 9.4)
- [ ] **Analyse.** Open **Analyse**. Verwacht: **Verstuurde e-mails**, **Mislukte e-mails**, **Verzendrondes** en **Rondes met mislukkingen**. Ook per soort (**APK-meldingen**, **Onderhoudsherinneringen**, **Aangepaste berichten**, **Overige e-mails**). (hfst 9.4)
- [ ] **Zonder het recht.** [zonder E-mailsjablonen beheren] Verwacht: *Geen toegang tot deze gegevens*. (hfst 9.4)
- [ ] **Meldingencentrum is geen mailstatus.** Klik op het belletje. Verwacht: het toont gebeurtenissen uit het klantenportaal (een nieuwe aanvraag, een reactie). Het toont niet of een mail is aangekomen. (hfst 9.4)

### Mailinstellingen en sjablonen

- [ ] **E-mail & GPS.** [beheerder] Ga naar **App-instellingen** → **E-mail & GPS** → **E-mailconfiguratie**. Verwacht de doelen **APK-herinneringen**, **Onderhoudsmeldingen**, **GPS/IEI-informatie**, **Documenten-e-mail**, **Aangepaste berichten** en **Standaard/Algemeen**. De velden zijn **Afzender-e-mail**, **Afzendernaam**, **SMTP-host**, **SMTP-poort**, **SMTP-gebruikersnaam** en **SMTP-wachtwoord**. Er is een knop **Configuratie opslaan**. (hfst 9.6)
- [ ] **Verbinding testen.** Verwacht: de knop is uit zolang host, gebruikersnaam of wachtwoord leeg zijn. De test logt alleen in. Het antwoord is *Connection successful. The SMTP server accepted the credentials.* of een reden uit 9.5. (hfst 9.6)
- [ ] **Wachtwoord blijft verborgen.** Open de instelling opnieuw. Verwacht: het wachtwoordveld is leeg. (hfst 9.6)
- [ ] **Niets ingesteld.** Verwacht: **Geen e-mailconfiguratie ingesteld**. (hfst 9.6)
- [ ] **Bedrijfsnaam in de mails.** Zie hoofdstuk 10, onderdeel Bedrijfsnaam. Verwacht: de naam staat onderaan de herinneringen, in de portaalmails en als standaard afzendernaam. Een ingevulde **Afzendernaam** gaat voor. **(nieuw)** (hfst 9.6, 10.3)
- [ ] **Doc-e-mails.** Ga naar **App-instellingen** → **Doc-e-mails**. Verwacht: **Huurcontract E-mail**, **Schade Controle E-mail** en **Gecombineerde Documenten E-mail**. Elk is er in het Engels en het Nederlands, met **Onderwerp** en **Bericht**. Er is een knop **E-mailsjablonen opslaan**. (hfst 9.7)
- [ ] **Sjabloonbouwer.** Ga naar **Communicatie** → **Sjabloonbouwer** → **Nieuw sjabloon**. Verwacht: **Sjabloonnaam**, **E-mailonderwerp**, **Sjablooncategorie** (APK-herinneringen, Onderhoud, Aangepast), **E-mailinhoud** en **Placeholders invoegen**. (hfst 9.7)
- [ ] **Accolades.** Typ `{customerName}` en `{{customerName}}`. Verwacht: beide werken. (hfst 9.7)
- [ ] **Portaalsjablonen.** Kijk in de bouwer. Verwacht: *Portaal: uitnodiging* met het label **PORTAAL** en een eigen categorie. Bewerken en opslaan kan. Nieuw maken kan niet. De naam is grijs, want vaste sjablonen kun je niet hernoemen. (hfst 9.7)
- [ ] **Bewerken en dupliceren.** Klik op bewerken. Verwacht: de pagina scrolt naar de bouwer en de cursor staat in de naam. Een kopie heet *<naam> (kopie)*. Na opslaan of verwijderen klopt de lijst direct. (hfst 9.7)
- [ ] **De elf placeholders.** Maak een bericht met `{customerName}`, `{vehiclePlate}`, `{vehicleBrand}`, `{vehicleModel}`, `{apkDate}`, `{companyName}`, `{customerEmail}`, `{customerPhone}`, `{reservationStart}`, `{reservationEnd}` en `{maintenanceDate}`. Bekijk de voorvertoning en de mail. Verwacht: alles is ingevuld. De datums staan als dd-mm-jjjj. **Bedrijfsnaam** komt uit de instelling. **Telefoon klant** is het nummer van de klant. **(nieuw)** (hfst 9.7)
- [ ] **Onderhoudsdatum.** Verwacht: `{maintenanceDate}` bestaat alleen bij de categorie **Onderhoud**. De voorvertoning toont dezelfde datum als de mail. **(nieuw)** (hfst 9.7)
- [ ] **Leeg blijft leeg.** Kies een voertuig zonder huurder. Verwacht: `{reservationStart}` en `{reservationEnd}` zijn leeg. De voorvertoning zegt *Leeg voor deze ontvanger: …*. Maak een typefout in een placeholder. Verwacht: *Deze placeholders worden nergens ingevuld en gaan zo naar de klant: …* **(nieuw)** (hfst 9.7)

### Automatische meldingen en facturen per e-mail

- [ ] **Reservering gewijzigd.** Wijzig de datums of het voertuig van een huur van een klant met portaalaccount. Verwacht: een portaalmelding en een e-mail *Uw reservering is gewijzigd*. Twee wijzigingen kort achter elkaar geven niet twee berichten. (hfst 9.8)
- [ ] **Nieuw document.** Genereer een document voor de klant. Verwacht: *Nieuw document beschikbaar*. (hfst 9.8)
- [ ] **Klant zonder portaalaccount.** Doe hetzelfde bij een klant zonder account. Verwacht: er gaat niets uit. (hfst 9.8)
- [ ] **Postvak: instellen.** [beheerder] Ga naar **Instellingen** → tabblad **E-mail** → kaart **Facturen per e-mail (inkomend)**. Verwacht: IMAP-server, gebruikersnaam, wachtwoord, **Map na verwerking** (`Verwerkt`), **Vertrouwde afzenders** en **Naam van jullie mailserver (Authentication-Results)**. De kaart waarschuwt in het geel als dat laatste veld leeg is. Verder **Verbinding testen** (*Verbonden, 3 ongelezen*), **Postvak automatisch uitlezen** en **Opslaan**. (hfst 9.9)
- [ ] **Factuur ontvangen.** Mail een factuur-PDF van een vertrouwde afzender naar het factuuradres. Wacht op de ronde of klik op **Nu ophalen**. Verwacht: een boeking per categorie, met de factuur als bon. In de bel staat een melding *Factuur van … geboekt op …*. (hfst 9.9)
- [ ] **Twijfel: Te controleren.** Ga naar **Kosten** → **Ontvangen facturen** (met een getal). Verwacht: de tabbladen **Te controleren**, **Geboekt** en **Afgewezen**. Per factuur staat de reden (*Onbekende afzender*, *Geen kenteken gevonden*, *Meerdere kentekens*, *Kenteken niet in de vloot*, *Mogelijk dubbel*, *Geen factuur …*, *Bedragen of datum kloppen niet*, *Uitlezen mislukt*, *Geen bruikbare bijlage*). Klik op **Controleren**. Verwacht: links de factuur, rechts de gelezen gegevens. Klik op **Boeken** of **Afwijzen**. (hfst 9.9)
- [ ] **Logboek.** Klik op **Logboek** (bij **Nu ophalen**, voor wie **Kosten beheren** of **Instellingen beheren** heeft). Verwacht: de tabbladen **Facturen**, **Overige mail** en **Ophaalrondes**. Er is een schakelaar **Alleen rondes met mail of fouten**. Je kunt zoeken op afzender, onderwerp, bestandsnaam, leverancier, factuurnummer, kenteken (met of zonder streepjes) en foutmelding. (hfst 9.9)
- [ ] **Als het niet werkt.** Verwacht: *Ophalen mislukt* of *Postvak facturen onbereikbaar* bij een fout wachtwoord. *Uitlezen mislukt* zonder sleutel. *Deze factuur is al geboekt* bij een dubbele scan. (hfst 9.9)

---

## Hoofdstuk 10 — Beheer

### Gebruikers

- [ ] **Waar het beheer zit.** [beheerder] Klik rechtsboven op je naam. Verwacht onder **Beheer**: **Gebruikers**, **Back-upbeheer** en **App-instellingen**. (hfst 10.1)
- [ ] **Zonder beheerdersrol.** [kantoor] Open Gebruikers. Verwacht: **Toegang geweigerd** met de tekst *Je hebt geen toestemming voor deze functie.* (hfst 10.2)
- [ ] **Gebruiker toevoegen.** Ga naar **Gebruikers** → **Gebruiker toevoegen**. Verwacht: **Nieuwe gebruiker toevoegen** met **Gebruikersnaam**, **Wachtwoord**, **Volledige naam**, **E-mail**, **Rol**, **Actief** en **Prijzen verbergen**. Klik op **Gebruiker aanmaken**. Verwacht: **Gelukt** en *Gebruiker "jan" is aangemaakt*. (hfst 10.2)
- [ ] **Wachtwoord verplicht.** Laat het wachtwoord leeg. Verwacht: *Een wachtwoord is verplicht*. (hfst 10.2)
- [ ] **Wachtwoordregel bij een nieuwe gebruiker.** Verwacht de hint *Minimaal 10 tekens, met hoofdletter, kleine letter en cijfer*. Vul een wachtwoord van 9 tekens in, of een zonder hoofdletter. Verwacht: *Het wachtwoord voldoet niet aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer.* **(nieuw)** (hfst 10.2)
- [ ] **Wachtwoord van een ander resetten.** Bewerk een andere gebruiker. Vul een nieuw wachtwoord in dat aan de regel voldoet. Verwacht: **Gelukt**. De oude wachtwoorden blijven werken voor wie niets wijzigt. **(nieuw)** (hfst 10.2)
- [ ] **Eigen wachtwoord via Gebruikers.** Bewerk je **eigen** account. Vul een wachtwoord in. Verwacht: *Je eigen wachtwoord wijzig je via je profiel, onder Wachtwoord wijzigen*. **(nieuw)** (hfst 10.2)
- [ ] **Leeg wachtwoordveld.** Bewerk een gebruiker. Laat het veld leeg (of vul spaties in). Verwacht: het wachtwoord blijft zoals het was. De gebruiker kan nog inloggen. (hfst 10.2)
- [ ] **Gebruikersnaam bestaat al.** Vul een bestaande gebruikersnaam in. Verwacht: *Deze gebruikersnaam is al in gebruik* onder het veld. (hfst 10.2)
- [ ] **Meerdere veldfouten tegelijk.** Vul een te korte gebruikersnaam in en geen wachtwoord. Verwacht: alle meldingen tegelijk (*De gebruikersnaam moet minstens 3 tekens hebben*, *Vul een geldig e-mailadres in*). (hfst 10.2)
- [ ] **Gebruiker bijwerken.** Klik op **Gebruiker bijwerken**. Verwacht: *Gebruiker "jan" is opgeslagen*. (hfst 10.2)
- [ ] **Inactief.** Zet een account op inactief. Verwacht: inloggen lukt niet (*403: Account has been disabled*). De geschiedenis blijft zichtbaar. (hfst 10.2, 15.14)
- [ ] **Eigen account verwijderen kan niet.** Kijk achter je eigen regel. Verwacht: het verwijderknopje is grijs. Houd de muis erboven. Verwacht: *Je kunt je eigen account niet verwijderen*. (hfst 10.2)
- [ ] **De laatste beheerder.** [alleen één actieve beheerder] Verwacht: het knopje is grijs met *Dit is de laatste actieve beheerder; die kan niet worden verwijderd*. Zet hem op inactief of geef hem een andere rol. Verwacht: *De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere rol krijgen*. **(nieuw)** (hfst 10.2)
- [ ] **Een andere beheerder verwijderen.** Maak een tweede beheerder aan. Verwijder hem. Verwacht: *Weet je zeker dat je gebruiker "…" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.* Daarna is hij weg. **(nieuw)** (hfst 10.2)
- [ ] **Verwijderen van een gebruikt account.** Verwijder een account dat al ingelogd is of iets gedaan heeft. Verwacht: het account verdwijnt echt. Zijn wijzigingen blijven in de geschiedenis staan, met de gebruikersnaam als tekst. **(nieuw)** (hfst 10.2)
- [ ] **Alleen een beheerder maakt een beheerder.** Probeer dit met een ander account. Verwacht: dat lukt niet. (hfst 10.2)
- [ ] **Zeven rollen.** Verwacht: **Beheerder**, **Manager**, **Gebruiker**, **Schoonmaker**, **Kijker**, **Accountant** en **Onderhoud**. (hfst 10.2)
- [ ] **Rechtenraster.** Kijk onder **Aanvullende rechten**. Verwacht: *Selecteer aanvullende rechten voor deze gebruiker* met het raster. Daarin staan ook **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren**. (hfst 10.2)
- [ ] **Heeft nodig.** Vink **Reserveringen beheren** aan, zonder **Voertuigen bekijken** en **Klanten bekijken**. Verwacht: onder het vinkje een oranje regel *Heeft nodig: Voertuigen bekijken, Klanten bekijken* met een waarschuwingsteken. Staan die rechten aan, dan is de regel grijs. **(nieuw)** (hfst 10.2, 15.17)
- [ ] **Handig erbij.** Kijk in de tekstballon. Verwacht: *Handig erbij: …*. **(nieuw)** (hfst 10.2)
- [ ] **Benodigde rechten ook aanzetten.** Klik op **Benodigde rechten ook aanzetten**. Verwacht: de ontbrekende benodigde rechten worden in één keer aangevinkt. De knop is grijs als er niets ontbreekt. Bij het opslaan gebeurt niets vanzelf. Je kunt een recht daarna weer uitzetten. **(nieuw)** (hfst 10.2)
- [ ] **Alleen voor beheerders.** Open een medewerker die geen beheerder is. Verwacht: **Gebruikers beheren**, **Instellingen beheren** en **Back-ups beheren** tonen *alleen voor beheerders*. Je kunt ze niet aanvinken. Staat zo'n vinkje al aan, dan kun je het wel uitzetten. **(nieuw)** (hfst 10.2, 15.17)
- [ ] **Bekijken van een gebruiker.** Klik op **Bekijken** → **Rechten**. Verwacht: bij een beheerder staat alles aangevinkt. Dezelfde regels staan er alleen bij de rechten die het account heeft. **(nieuw)** (hfst 10.2)
- [ ] **Rechtenwijziging werkt meteen.** Pas de vinkjes aan van een collega die is ingelogd. Verwacht: zijn scherm volgt zonder opnieuw inloggen. (hfst 10.2)
- [ ] **Eenmalige start voor managers.** Verwacht: bestaande accounts met de rol **Manager** hebben **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren**. Een nieuwe manager krijgt ze niet vanzelf. (hfst 10.2, 15.16)
- [ ] **Profiel toont de rechten met Nederlandse namen.** Open je profiel. Verwacht: de rechten hebben Nederlandse namen. (hfst 10.2)

### Geweigerde pogingen

- [ ] **Poging veroorzaken.** [kijker] Open een scherm of druk op een knop waar je geen recht voor hebt. Gebruik bijvoorbeeld een oude link naar `/maintenance`. Verwacht: een melding, of een scherm met "U heeft geen toegang tot dit scherm". **(nieuw)** (hfst 10.2, 15.9)
- [ ] **De balk.** [beheerder] Log uit en log weer in (niet je allereerste inlog). Verwacht bovenaan het **Dashboard**: *Sinds je vorige inlog (<datum>) probeerden 3 medewerkers iets waarvoor ze geen recht hebben*. Bij één medewerker staat er *probeerde 1 medewerker iets waarvoor die geen recht heeft*. **(nieuw)** (hfst 10.2)
- [ ] **Bekijken.** Klik op **Bekijken**. Verwacht: **Geweigerde pogingen** met de tekst *Wat medewerkers probeerden sinds je vorige inlog (<datum>) en niet mochten.* De kolommen zijn **Wie**, **Wat**, **Recht dat ontbrak** en **Wanneer**. **(nieuw)** (hfst 10.2)
- [ ] **Sluiten.** Klik op het kruisje. Verwacht: de balk is weg voor de rest van de sessie. Er is geen balk als er niets te melden is. Bij je allereerste inlog is er ook geen balk. **(nieuw)** (hfst 10.2)
- [ ] **Activiteitenlog.** Kijk in het activiteitenlog. Verwacht: dezelfde pogingen staan onder de actie *access.denied* met de status *mislukt*. Er gaat geen e-mail uit. **(nieuw)** (hfst 10.2)
- [ ] **Dubbele pogingen tellen als één.** Doe dezelfde poging twee keer binnen vijf minuten, als dezelfde medewerker op dezelfde plek. Verwacht: hij staat er één keer. **(nieuw)** (hfst 10.2)
- [ ] **Alleen de rol Beheerder.** [kantoor met Gebruikers beheren, geen beheerder] Verwacht: geen balk. **(nieuw)** (hfst 10.2)

### App-instellingen

- [ ] **Negen tabbladen.** [beheerder] Open **App-instellingen**. Verwacht: *Applicatie-instellingen — Beheer de configuratie van je verhuursysteem* met de tabbladen **Bedrijfsregels**, **Meldingen**, **Documenten**, **Doc-e-mails**, **Kalender**, **E-mail & GPS**, **Activiteit**, **Klantenportaal** en **Voertuigen**. (hfst 10.3)
- [ ] **Startcontractnummer.** Ga naar **Documenten**. Verwacht: **Startcontractnummer**, **Volgend contractnummer** en **Startnummer opslaan**. Bij **Slimme override** staan **Override instellen** en **Override wissen**. Een onmogelijk getal geeft *Must be a whole number between 1 and 2147483647*. (hfst 10.3)
- [ ] **Toltarief.** Verwacht: het veld **Toltarief (€ per km)**. (hfst 10.3)
- [ ] **Tijdzone: bekijken.** Ga naar **Bedrijfsregels** → **Tijdzone van het kantoor**. Verwacht: standaard *Europe/Amsterdam*. Erbij staat of zomer- of wintertijd actief is. **(nieuw)** (hfst 10.3)
- [ ] **Tijdzone: zoeken.** Typ in **Zoek een tijdzone**. Kies bij **Tijdzone**. Verwacht: de zone is gekozen. **(nieuw)** (hfst 10.3)
- [ ] **Tijdzone opslaan** (alleen testomgeving, zet hem daarna terug). Klik op **Tijdzone opslaan**. Verwacht: *De app rekent nu met <zone>.* Bij een fout staat er *De tijdzone kon niet worden opgeslagen.* **(nieuw)** (hfst 10.3)
- [ ] **Bedrijfsnaam: standaard.** Ga naar **Bedrijfsregels** → **Bedrijfsnaam**. Verwacht: zolang je niets opslaat staat er *Autolease Lam*. **(nieuw)** (hfst 10.3)
- [ ] **Bedrijfsnaam opslaan.** Vul een naam in. Klik op **Bedrijfsnaam opslaan**. Verwacht: *De bedrijfsnaam is opgeslagen.* Een mail (herinnering of portaalmail) noemt de nieuwe naam. **(nieuw)** (hfst 10.3)
- [ ] **Bedrijfsnaam te lang.** Vul 101 tekens in, of een regeleinde. Verwacht: *Vul een naam in van maximaal 100 tekens, zonder regeleinden.* **(nieuw)** (hfst 10.3)
- [ ] **Afzendernaam gaat voor.** Vul een **Afzendernaam** in bij de e-mailinstellingen. Verwacht: die gaat voor op de bedrijfsnaam. **(nieuw)** (hfst 10.3)
- [ ] **Portaalmeldingen volgen de naam.** Verwacht: voor het eerste opslaan zeggen de portaalmails en de portaalmeldingen *Lam Groep*. Daarna zeggen ze de ingestelde naam. Een al bestaande melding houdt zijn tekst. Een zelf aangepast sjabloon houdt zijn eigen tekst. **(nieuw)** (hfst 10.3)
- [ ] **Wat je typt, blijft staan.** Wissel van tabblad tijdens het invullen. Verwacht: een eenmaal geopend tabblad houdt zijn ingevulde waarden. Dat geldt ook voor **Klantenportaal**, de fiscale check, de CJIB-koppeling en de filters van de activiteit. (hfst 10.3)
- [ ] **Administratiekosten per bekeuring.** Ga naar **Klantenportaal** → **Standaard administratiekosten per bekeuring (€)**. Vul een negatief of leeg bedrag in. Verwacht: *Vul een bedrag van 0 of hoger in, bijvoorbeeld 12,50.* Het bedrag blijft bewaard na opslaan. (hfst 10.3)
- [ ] **CJIB-koppeling.** Verwacht: **Automatisch ophalen aan** kan pas aan met een **Server (host)**. Zonder server zijn **Verbinding testen** en **Nu ophalen** grijs, met uitleg. Er staat *Automatisch ophalen elke 15 min* of *Automatisch ophalen staat uit*. Een mislukte test geeft *Verbinding mislukt* met de tekst *De verbinding met het CJIB is mislukt. Controleer de instellingen en probeer het opnieuw.* (hfst 10.3)
- [ ] **Zonder Instellingen beheren.** Open de instellingen zonder dit recht. Verwacht: openen kan, opslaan niet (*Not authorized. One of these permissions required: manage_settings*). (hfst 10.3)

### Back-ups

- [ ] **Back-upscherm lezen.** [beheerder] Ga naar **Back-upbeheer** → **Back-up & Herstel**. Verwacht: **Laatste back-up** (datum en tijd, of **Nooit**) en **Volgende back-up** (**Vannacht om 02:00 uur**). Soms staat er **Laatste back-upfout:** in het Nederlands. **Back-uplocatie:** zegt dat de map vast is ingesteld, zonder pad. (hfst 10.4)
- [ ] **Waarschuwing bij oude back-up.** Is de laatste geslaagde back-up ouder dan een dag? Verwacht: *De laatste geslaagde back-up is ouder dan een dag.* Een back-up zonder leesbare datum toont **Onbekende datum**. (hfst 10.4)
- [ ] **Recente back-ups.** Verwacht: gesplitst in **Database-back-ups** en **Bestand-back-ups**. (hfst 10.4)
- [ ] **Nu back-uppen.** Klik op **Nu back-uppen** (testomgeving). Verwacht: een nieuwe regel. Mislukt het, dan staat er *De back-up is mislukt.* Loopt er al een, dan staat er *Er loopt al een back-up. Wacht tot die klaar is.* (hfst 10.4)
- [ ] **Schema aan/uit.** Verwacht: de schakelaar **Ingeschakeld / Uitgeschakeld**. (hfst 10.4)
- [ ] **Downloaden.** Klik op **Downloaden** achter een back-up. Verwacht: **Bestand gemaakt** met naam en grootte, en een bestand in je downloads. Bij een fout staat er *De back-up kon niet worden gedownload.* (hfst 10.4)
- [ ] **Handmatige back-up.** Kijk onder **Handmatige back-up & herstel**. Verwacht: **App-gegevens**, **Geüploade bestanden** en **App-code**. Probeer elke download één keer. (hfst 10.4, 12.13)
- [ ] **Herstellen, alleen lezen.** Klik op **Herstellen** (niet bevestigen). Verwacht: **Waarschuwing: deze back-up herstellen** met de uitleg en *Typ de exacte bestandsnaam hieronder ter bevestiging:*. De knop **Ja, herstel deze back-up** is grijs tot je de naam letterlijk hebt overgetypt. Sluit zonder te herstellen. (hfst 10.4)
- [ ] **Dashboardbalk bij geen back-up.** Verwacht: **Geen geverifieerde back-up in 30 uur** met de tekst *Open Back-up & Herstel om er nu een uit te voeren.* (hfst 10.4)

### Geschiedenis en activiteitenlog

- [ ] **Geschiedenis per record.** Open een reservering (onderaan), een voertuig en een klant (tabblad **Geschiedenis**). Verwacht: *Elke wijziging aan dit record, met wie het deed en wanneer.* Per regel staat in woorden wat er gebeurde, wie het deed (of **Systeem**), wanneer, en welk veld oud (doorgestreept) en nieuw is. Leeg staat als `—`. Aan en uit staan als `ja` en `nee`. (hfst 10.5)
- [ ] **Leeg record.** Open een record zonder wijzigingen. Verwacht: *Er is nog niets gewijzigd aan dit record.* (hfst 10.5)
- [ ] **Zonder recht.** [kijker] Open de geschiedenis. Verwacht: *Je hebt geen rechten om de geschiedenis van dit record te bekijken.* (hfst 10.5)
- [ ] **Activiteitenlog.** [beheerder] Ga naar **App-instellingen** → **Activiteit** → **Activiteitenlog**. Verwacht: *Wie heeft wat gewijzigd, en wanneer.* De filters zijn **Zoeken**, **Gebruiker**, **Actie**, **Vanaf**, **Tot en met** en **Filters wissen**. De kolommen zijn **Wanneer**, **Wie**, **Actie**, **Object** en **Wijzigingen**. (hfst 10.5)

### Prullenbakken

- [ ] **Acht prullenbakken, één per scherm.** Open elke prullenbak: **Voertuigen** → **Verwijderde voertuigen**, **Klanten** → **Verwijderde klanten**, **Reserveringen** → **Verwijderde reserveringen**, **Onderhoud** → **Verwijderd onderhoud**, **Transporten** → **Verwijderde transporten**, **Klantenportaal** → **Bekeuringen** → **Prullenbak** (venster **Verwijderde bekeuringen**), **Kosten** → **Verwijderde kostenposten** **(nieuw)** en klant → **Chauffeurs** → **Verwijderde chauffeurs** **(nieuw)**. Verwacht: elke bak toont alleen zijn eigen soort. (hfst 10.6)
- [ ] **Grijs zonder vinkje.** [zonder Prullenbak beheren] Verwacht: de knoppen staan er, maar grijs, met een tekstballon. (hfst 10.6, 15.9)
- [ ] **Wat je ziet.** Verwacht: een zoekveld *Zoeken op omschrijving of naam…* en **Alles selecteren**. Per regel staat een vinkje, een label, een omschrijving, *Verwijderd <datum> door <naam>*, **Bevat: …** (of *geen gekoppelde gegevens*), **Terugzetten** en **Definitief verwijderen**. Een lege bak zegt *Geen verwijderde voertuigen.* (hfst 10.6)
- [ ] **Teruggezette items.** Zet iets terug. Verwacht: de regel verdwijnt uit de lijst. Het vinkje **Teruggezette items ook tonen (3)** toont ze met het groene label **Teruggezet** en een grijze knop. (hfst 10.6)
- [ ] **Terugzetten, per soort.** Zet van elk soort iets terug. Verwacht: het komt terug met zijn gekoppelde gegevens, met de melding **Teruggezet** en de tekst *<omschrijving> is teruggezet.* Een klant behoudt zijn debiteurnummer. Een transport komt terug met zijn vervanger. Een kostenpost komt terug met zijn bon. (hfst 10.6)
- [ ] **Kostenpost zonder voertuig.** Zet een kostenpost terug van een definitief verwijderd voertuig. Verwacht: *Let op: het voertuig van deze kostenpost bestaat niet meer. De kostenpost staat er weer, maar hoort bij een voertuig dat ontbreekt.* **(nieuw)** (hfst 10.6)
- [ ] **Weigeringen bij terugzetten.** Verwacht deze meldingen: *Dit record is al teruggezet.* (bij twee tabbladen), *Er bestaat al een voertuig met hetzelfde kenteken. Verwijder of hernoem dat eerst.*, *Dit debiteurnummer is al in gebruik bij klant <naam>.* en *Deze reservering kan niet terug: …*. (hfst 10.6)
- [ ] **Definitief verwijderen, drie manieren.** Doe dit op oefengegevens. Verwijder één regel. Verwijder een selectie (**Geselecteerde verwijderen (…)**). Klik op **Prullenbak leegmaken**. Verwacht: altijd **Definitief verwijderen?** met het aantal en het soort. Er staat *Dit kan niet ongedaan worden gemaakt.* en *Een bestand dat nog door andere gegevens wordt gebruikt, blijft staan.* Daarna zie je **Definitief verwijderd** met de tekst *2 regels definitief verwijderd.* (hfst 10.6)
- [ ] **Leegmaken telt verborgen regels mee.** Verwacht: *Dat zijn ook 3 teruggezette regels die nu verborgen zijn.* Bij 200 regels staat er een opmerking. (hfst 10.6)
- [ ] **Fiscale beoordelingen gaan mee.** [beheerder] Verwijder definitief een oefenreservering, onderhoudsplanning of klant met fiscale beoordelingen. Verwacht: in de lijst staat bij **Bevat** het aantal fiscale beoordelingen. De bevestiging noemt het aantal. Het fiscale auditlog heeft de actie *Definitief verwijderd (prullenbak)* met wie en hoeveel. **(nieuw)** (hfst 10.6)
- [ ] **Chauffeurs leegmaken.** Klik in de bak van de chauffeurs van een klant op **Prullenbak leegmaken**. Verwacht: alleen de regels die je ziet worden verwijderd. **(nieuw)** (hfst 10.6)
- [ ] **Wissen op verzoek.** Verwijder een chauffeur. Klik dan ook op **Definitief verwijderen**. Verwacht: de naam, het rijbewijsnummer en de kopie zijn weg. **(nieuw)** (hfst 3.6, 10.6)
- [ ] **Mislukt een regel.** Verwacht: **Niet alles is gelukt** met per regel de reden (*Dit record stond al niet meer in de prullenbak.* enzovoort). (hfst 10.6)
- [ ] **Activiteitenlog.** Kijk in het activiteitenlog. Verwacht: elke definitieve verwijdering staat er als *<soort>.purge* (bijvoorbeeld *customer.purge*). (hfst 10.6)

---

## Hoofdstuk 11 — Veelgemaakte fouten

Deze regels bootsen de fout na. Daarna kijk je of het herstel werkt. Doe ze op oefengegevens.

- [ ] **11.1 Verkeerde klant.** Open een reservering. Klik op **Klant wijzigen**. Kies een andere klant. Klik op **Opslaan**. Verwacht: **Klant gewijzigd**. Een bestaand contract krijgt **Verouderd**. De wijziging staat in de **Geschiedenis**. (hfst 11.1)
- [ ] **11.2 Verkeerd voertuig.** Klik op **Voertuig wijzigen**. Verwacht: **Voertuig gewijzigd**. Bij een al opgehaalde huur klopt het getekende contract niet meer. Je genereert het dan opnieuw. (hfst 11.2)
- [ ] **11.3 Verkeerde datums.** Klik op **Datums wijzigen**. Zet de einddatum vóór het begin. Verwacht: *De einddatum kan niet vóór de begindatum liggen.* (hfst 11.3)
- [ ] **11.4 Dubbele reservering.** Boek dezelfde auto in dezelfde periode twee keer (in twee tabbladen). Verwacht: *Reservation conflicts with existing bookings* met de botsende reservering. (hfst 11.4)
- [ ] **11.5 Dubbele klant.** Zie hoofdstuk 3, "bestaat mogelijk al". Heb je een dubbele klant zonder lopende huur? Zet de huren over met **Klant wijzigen**. Verwijder dan de dubbele klant. Heb je een dubbele chauffeur? Klik op **Verwijderen** op het tabblad **Chauffeurs**. Je vindt hem terug in **Verwijderde chauffeurs**. **(nieuw: prullenbak chauffeurs)** (hfst 11.5)
- [ ] **11.6 Huur nooit afgesloten.** Klik op **… achterstallig** → **Details bekijken** → **Inleveren starten**. Verwacht: de huur sluit. De auto is weer beschikbaar. (hfst 11.6)
- [ ] **11.7 Te vroeg ophalen.** Haal te vroeg op. Verwacht: **Ja, startdatum naar vandaag** schuift de start en berekent het bedrag opnieuw. **Nee, niet ophalen** doet niets. (hfst 11.7)
- [ ] **11.8 Gekoppeld record vergeten.** Annuleer een reservering met een vervanger en een transport. Vink ze niet aan. Verwacht: ze blijven staan. Loop dat na op het Dashboard (**Beheer vervangende voertuigen**) en bij **… achterstallig**. (hfst 11.8)
- [ ] **11.9 Document te vroeg gegenereerd.** Wijzig een reservering met contract. Verwacht: **Verouderd**. Klik op **Opnieuw genereren**. Verwacht: **Nieuwe versie aangemaakt**. (hfst 11.9)
- [ ] **11.10 Mail naar de verkeerde klant.** Open het venster **Documenten e-mailen naar klant**. Verwacht: je kiest het adres zelf. Bij een mailronde laat **Voorvertonen & versturen** per ontvanger zien wat hij krijgt. (hfst 11.10)
- [ ] **11.11 Auto ten onrechte in de werkplaats.** Verwacht: **Uitgifte geblokkeerd**. Herstel het met **Afronden**, **Terug van onderhoud** of **Terug uit onderhoud**. Een beheerder kan forceren met een reden. Klopt een onderhoud op **Binnen** niet? Verwijder of annuleer het dan. Staat er geen ander onderhoud op **Binnen**, dan verdwijnt **Reparatie nodig** vanzelf. **(nieuw)** (hfst 11.11)
- [ ] **11.12 Per ongeluk opgehaald.** Klik op **Overdracht terugdraaien**. Verwacht: **Overdracht teruggedraaid** met de tekst *Reservering #… heeft weer de status Geboekt.* Het contractnummer komt vrij. Het contract krijgt vanzelf **Verouderd**. (hfst 11.12)
- [ ] **11.13 Per ongeluk ingenomen.** Klik op **Voltooid bekijken (…)** → **Overdracht terugdraaien**. Verwacht: terug naar **Opgehaald**. Stond de auto intussen op **Onderhoud nodig**? Dan blijft dat staan. (hfst 11.13)
- [ ] **11.14 Per ongeluk geannuleerd.** Klik op **Annulering terugdraaien**. Verwacht: dit lukt niet als de auto intussen is geboekt. (hfst 11.14)
- [ ] **11.15 Per ongeluk verwijderd.** Doe dit voor elk soort: voertuig, klant, reservering, transport, chauffeur en kostenpost. Verwijder een oefenrecord. Zet het terug in de bak van dat scherm. Verwacht: een voertuig vraagt het kenteken. Een klant vraagt de naam. Een opgehaalde huur vraagt een vinkje. Een chauffeur en een kostenpost gaan zonder tussenstap naar de bak. **Teruggezette items ook tonen** laat de al teruggezette zien. **(nieuw: chauffeur en kostenpost)** (hfst 11.15)
- [ ] **11.16 Kilometerstand verkeerd.** Vul een lagere stand in. Verwacht: **Kilometerstand-overschrijving vereist** met de tekst *Je probeert de kilometerstand van het voertuig te verlagen, wat autorisatie vereist.* (hfst 11.16)
- [ ] **11.17 BV naar Opnaam.** Zie de BV-regel bij hoofdstuk 5. Lukt het omzetten niet? Verwacht: *Kon de voertuigregistratie niet bijwerken. Wijzig het handmatig van BV naar Opnaam.* (hfst 11.17)

---

## Hoofdstuk 12 — Problemen oplossen

### De acht veelvoorkomende problemen

- [ ] **12.1 Niet kunnen inloggen.** Zie hoofdstuk 1. De meldingen zijn *Ongeldige gebruikersnaam of wachtwoord*, *Je hebt hier geen recht voor.* (inactief account) en *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.* Een beheerder kan de blokkade niet opheffen. (hfst 12.1)
- [ ] **12.2 Voertuig niet beschikbaar.** Controleer de vier oorzaken: een reservering erover, de werkplaats, **Niet voor verhuur** en een nooit afgesloten huur. Een gepland onderhoud heet **Gepland**. Pas **Binnen** geeft **Reparatie nodig**. **(nieuw)** (hfst 12.2)
- [ ] **12.3 Geen reservering aanmaken.** Controleer de vier gevallen: een botsing (*Reservation conflicts with existing bookings*), onderhoud (waarschuwing), de zwarte lijst (*This customer is blacklisted for this vehicle and cannot be booked on it.*) en de APK (waarschuwing). (hfst 12.3)
- [ ] **12.4 PDF klopt niet.** Controleer: **Verouderd**, lege velden, een ander standaardsjabloon, *nader te bepalen* en **Downloaden** in plaats van **Bekijken**. (hfst 12.4)
- [ ] **12.5 PDF mislukt.** Verwacht: **Contract kon niet gemaakt worden** met de tekst *De handeling is vastgelegd, maar het document is niet aangemaakt. Probeer het opnieuw of controleer de sjablonen.* en de knop **Opnieuw proberen**. (hfst 12.5)
- [ ] **12.6 E-mail komt niet aan.** Kijk bij het document. Verwacht: **Verzonden op … aan …** of **Verzenden mislukt — …**. (hfst 12.6)
- [ ] **12.7 Op de verkeerde reservering.** Loop de tabel na: ophalen, innemen, annuleren (terugdraaien), verwijderen (prullenbak), wijzigen, document (opnieuw genereren) en e-mail (bellen). (hfst 12.7)
- [ ] **12.8 Wie wijzigde iets.** Kijk in de **Geschiedenis**. De beheerder kijkt in het activiteitenlog. Een ontbrekend record zoek je in de prullenbak van dat scherm. (hfst 12.8)

### Foutmeldingen (Nederlands)

- [ ] **De korte zinnen.** Boots na wat je kunt. Controleer dat er geen kale *Fout*, *500: {...}* of Engelse tekst staat. De meldingen zijn: *De invoer klopt niet. Controleer de velden en probeer het opnieuw.*, *Je sessie is verlopen. Log opnieuw in.*, *Je hebt hier geen recht voor.*, *Dit item is niet gevonden. Misschien is het al verwijderd.*, *Dit kan nu niet: het botst met een andere wijziging of een bestaand item.*, *Het bestand is te groot.*, *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.*, *Er ging iets mis op de server. …*, *De server is tijdelijk niet bereikbaar. …*, *De server antwoordde niet op tijd. …* en *Geen verbinding met de server. …* **(nieuw: vier nieuwe foutcodes)** (hfst 12, deel 2)
- [ ] **Geen verbinding.** Zet je netwerk uit. Klik ergens op. Verwacht: *Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.* (hfst 12, deel 2)
- [ ] **Veldmeldingen in het Nederlands.** Laat een verplicht veld leeg. Verwacht: *Dit veld is verplicht*. Een fout e-mailadres geeft *Vul een geldig e-mailadres in*. Te kort geeft *Minimaal 3 tekens*. (hfst 12, deel 2)
- [ ] **Tankbedrag en kostenpost.** Verwacht: *Het tankbedrag moet een positief bedrag zijn van ten hoogste € 1.000.000.* en *De kostenpost voor de tankbeurt kon niet worden geboekt; er is niets opgeslagen. Probeer het opnieuw.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Wachtwoord en laatste beheerder.** Verwacht: *Het wachtwoord voldoet niet aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer.*, *Je eigen wachtwoord wijzig je via je profiel, onder Wachtwoord wijzigen.* en *De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere rol krijgen.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Onderhoud afronden.** Verwacht: *Een onderhoud rond je af met de knop Afronden, niet met de status.* en *Dit onderhoud is al afgerond.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Chauffeur terugzetten.** Verwacht: *De klant van deze chauffeur bestaat niet meer. Zet eerst de klant terug (Klanten, Verwijderde klanten) en daarna de chauffeur.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Rechtenmelding.** Verwacht: *Not authorized. One of these permissions required: …* met de naam van het ontbrekende recht (bijvoorbeeld `manage_recycle_bin` of `revert_handover`). (hfst 12, deel 2, 15.16)
- [ ] **Bestand gemaakt.** Maak een export of download. Verwacht: **Bestand gemaakt** met de tekst *<naam>.csv (2 kB)*. (hfst 12, deel 2)
- [ ] **Laden…** Open **Documenten**, **Rapporten** en **Communicatie**. Verwacht: *Laden…* met een rondje. (hfst 12, deel 2)
- [ ] **CSV in Excel.** Exporteer de klantgeschiedenis, de kosten, de bekeuringen en een rapportbouwerrapport. Dubbelklik op het bestand. Verwacht: het opent in Excel met de kolommen goed. Het bestand heeft puntkomma's, een decimale komma (*112,50*), datums als dd-mm-jjjj, tijden als uu:mm en kentekens met streepjes. De bestandsnaam is zoals *boetes-2026-10-10.csv*. Tekst die met `=`, `+`, `-` of `@` begint, heeft een aanhalingsteken ervoor. (hfst 12, deel 2)

### Bekende beperkingen

- [ ] **12.9 Annulering terugdraaien lukt niet altijd.** Draai een annulering terug terwijl de auto intussen opnieuw is geboekt. Verwacht: een rood blok en een grijze knop. Je maakt dan een nieuwe reservering. (hfst 12.9, 5.14)
- [ ] **12.10 Bij annuleren beslis je zelf.** Annuleer zonder een gekoppeld onderdeel aan te vinken. Verwacht: wat je niet aanvinkt, blijft staan. De vervanger houdt de auto bezet. Het transport blijft gepland. (hfst 12.10, 5.9)
- [ ] **12.11 De klant krijgt niet overal bericht van.** Verwacht: een bekeuring invoeren, inlezen of koppelen stuurt de klant niets. Dat gebeurt pas als jij op **Klant informeren** klikt. Een klant zonder portaalaccount hoort ook niets over wijzigingen of annuleringen. **(nieuw)** (hfst 12.11)
- [ ] **12.12 E-maillogboek toont de echte geschiedenis.** Ga naar **Communicatie** → **E-maillogboek**. Verwacht: geen vaste voorbeeldregels uit maart 2024. Achter elke regel staat **Details**. Of een document is verstuurd, zie je nog steeds bij het document zelf in **Reserveringsdocumenten**. (hfst 12.12)
- [ ] **12.13 Handmatige downloadknoppen.** [beheerder] Ga naar **Back-upbeheer**. Probeer elke download: **App-gegevens**, **Geüploade bestanden** en **App-code**. Verwacht: een bestand. Mislukt het, dan staat er *De back-up kon niet worden gedownload.* zonder pad. De **Downloaden**-knop bij een **Bestand-back-up** in de lijst werkt altijd. (hfst 12.13)
- [ ] **12.14 Wat leegmaken niet doet.** Controleer drie dingen. **Prullenbak leegmaken** haalt alles van die soort weg, ook wat niet in de lijst van 200 staat. Een verwijderde chauffeur verdwijnt pas na **Definitief verwijderen**. Een reservering of klant met fiscale beoordelingen kan worden verwijderd. **(nieuw)** (hfst 12.14)
- [ ] **12.15 Een klein deel van de meldingen is nog Engels.** Zoek een Engelse melding (bijvoorbeeld *Reservation conflicts with existing bookings*). Vergelijk hem met de tabellen in deel 2. Alle labels in de schermen moeten Nederlands zijn. Dat geldt ook voor de kostencategorieën in rapporten (**Onderhoud**, **Banden**, **Remmen**, **Schade**, **Brandstof**, **Verzekering**, **Registratie**, **Schoonmaak**, **Parkeren**, **Tol**, **Accessoires**, **Overig**). (hfst 12.15)
- [ ] **12.16 Twee mensen in hetzelfde scherm.** Open twee tabbladen. Klik in beide op **Bewerken** bij één reservering. Verwacht: wie het laatst opslaat, wint. De kleine vensters (**Datums wijzigen**, **Klant wijzigen**, **Voertuig wijzigen**) overschrijven elkaar niet. (hfst 12.16)
- [ ] **12.17 Tablet.** Open **Reserveringen** op een tablet of in een smal venster. Verwacht: je moet horizontaal scrollen. (hfst 12.17)
- [ ] **12.18 Ontbrekende bestanden.** Staat een document wel in de lijst, maar is het bestand weg? Verwacht: dat merk je pas bij **Bekijken** of **Downloaden**. Meld dat bij een beheerder. (hfst 12.18)

---

## Hoofdstuk 13 — Snel naslagwerk

Het naslagwerk is een lijst klikpaden. Deze regels controleren dat de klikpaden kloppen met de app. Volg het pad letterlijk. Kijk of je op de genoemde knop uitkomt.

- [ ] **13.1 Inloggen en je eigen account.** Volg de paden: wachtwoord wijzigen (minimaal 10 tekens, met hoofdletter, kleine letter en cijfer), taal omzetten, **Ingelogd blijven** en uitloggen. **(nieuw: 10 tekens)** (hfst 13.1)
- [ ] **13.2 Zoeken.** Volg de paden: `Ctrl+K` of `/`, **Bekijk alle resultaten**, kenteken, contractnummer, sleutellabel scannen en **Recente scans**. (hfst 13.2)
- [ ] **13.3 Ophalen en innemen.** Volg de eerste vier klikpaden tot en met de bevestigknop. Volg ook de laatste vijf (schadecheck, papieren check, voertuigopmerkingen, lagere kilometerstand). (hfst 13.3)
- [ ] **13.4 Reserveringen.** Volg elk pad: nieuwe reservering, zonder einddatum, **Nu ophalen** (groene melding of twaalf seconden linksonder), lijstweergave (50 regels, **Toon 50 meer**), niet opgehaald → **Annuleren**, **Vandaag**, **Voltooid bekijken (…)**, **… achterstallig**, wijzigen (klant, voertuig, datums, contractnummer), terugdraaien, annuleren en **Administratie**. **(nieuw: Nu ophalen)** (hfst 13.4)
- [ ] **13.5 Klanten.** Volg elk pad. Ook **Verwijderde chauffeurs** → **Terugzetten**, **Geblokkeerde voertuigen**, **Filters** → *Onvolledig profiel* en het invulveld **Pagina** (ook bij **Voertuigen**). **(nieuw: Verwijderde chauffeurs)** (hfst 13.5)
- [ ] **13.6 Voertuigen.** Volg elk pad. Let vooral op **Ook onbekende kentekens aanmaken**, de keuzelijst **Tonen:** los van **Sorteren op:**, **Brandstofstatus bijwerken** met **Tankkosten (€)**, het laatste tankbedrag en **RDW-voertuigtypes**. **(nieuw)** (hfst 13.6)
- [ ] **13.7 Onderhoud.** Volg elk pad. Let vooral op het plannen afbreken (**Annuleren** → **Plannen afbreken** of **Doorgaan met plannen**), **Afronden** (kalender, overzicht, bewerkvenster), **Binnen melden** en **Terug uit onderhoud**. **(nieuw)** (hfst 13.7)
- [ ] **13.8 Transport.** Volg de paden: nieuw transport, filteren per soort, rapporten afdrukken en in bulk afronden. (hfst 13.8)
- [ ] **13.9 Documenten.** Volg de paden: alle documenten, per auto, per huur, uploaden (ook via **Scannen** → **Document uploaden**), zoeken, afdrukken, downloaden, mailen, **Opnieuw genereren** en de sjablonen. (hfst 13.9)
- [ ] **13.10 Kosten.** Volg de paden: kosten vastleggen (ook vanaf het Dashboard en via **Scannen** → **Kosten registreren**), filteren, **Exporteren (CSV)**, **Logboek**, **Verwijderde kostenposten** → **Terugzetten**, **Factuur scannen**, kosten van één auto en **Recente kosten** → **Alles bekijken**. **(nieuw: prullenbak Kosten)** (hfst 13.10)
- [ ] **13.11 Klantenportaal en bekeuringen.** Volg elk pad. Zie ook de aparte regels hieronder. (hfst 13.11)
- [ ] **Aanvraag oppakken.** Klik in het aanvraagvenster op **In behandeling nemen**. (hfst 13.11, 16.8)
- [ ] **Verlenging goedkeuren.** Klik op **Goedkeuren (past reservering aan)**. Verwacht: de reservering is meteen aangepast. (hfst 13.11, 16.8)
- [ ] **Van een huuraanvraag een boeking maken.** Klik op **Goedkeuren: reservering aanmaken**. Verwacht: *Reservering aanmaken uit deze aanvraag*. (hfst 13.11, 16.8)
- [ ] **Alleen antwoorden.** Klik op **Beantwoorden en afhandelen**, of op **Antwoord mailen (blijft open)**. Botst de gevraagde periode? Dan zie je **Conflict met reservering #…**. (hfst 13.11, 16.8)
- [ ] **Een klant een portaalaccount geven.** Ga naar **Klantenportaal** → **Account uitnodigen**. (hfst 13.11)
- [ ] **Een bekeuring invoeren en inlezen.** Klik op de tegel **Bekeuringen** → **Nieuwe bekeuring**. Probeer ook **Brieven scannen**. Verwacht: een geregistreerde bekeuring zonder mail. **(nieuw)** (hfst 13.11)
- [ ] **De hele lijst met bekeuringen openen.** [kantoor met Boetes bekijken] Ga naar **Klantenportaal** → knop **Bekeuringen**. Verwacht: de lijst opent. Zonder Boetes-vinkje is de knop grijs. Het ontbrekende vinkje wordt genoemd. (hfst 13.11)
- [ ] **Een klant voor een auto blokkeren.** Ga naar **Klantenportaal** → tegel **Blacklist** → **Blokkade toevoegen**. Verwacht: de combinatie verdwijnt stil uit de boekingslijsten. **Geblokkeerde voertuigen** bij de klant toont hem. (hfst 13.11)
- [ ] **Meldingen op gelezen zetten.** Ga naar **Klantenportaal** → **Meldingen** → **Alles gelezen**. Verwacht: het rode bolletje verdwijnt. (hfst 13.11)
- [ ] **13.12 Communicatie en meldingen.** Volg elk pad: het belletje, **Nieuwe melding**, APK-herinneringen, **Aangepast bericht**, **E-maillogboek** → **Details**, **Voorvertonen & versturen** en **Sjabloonbouwer**. (hfst 13.12)
- [ ] **13.13 Rapporten.** Volg elk pad. (hfst 13.13)
- [ ] **13.14 Als er iets misgaat.** Volg elk pad. Let vooral op de prullenbak van elk scherm, en op **Verwijderde bekeuringen** via **Prullenbak**. (hfst 13.14)
- [ ] **13.15 Sneltoetsen.** Zie hoofdstuk 2.11. (hfst 13.15)
- [ ] **13.16 Als een knop er niet staat.** Een ontbrekende knop betekent een ontbrekend recht. Een grijze knop toont bij een klik of tik een tekstballon met het vinkje, bijvoorbeeld *Hiervoor heeft u het recht 'Reserveringen beheren' nodig.* Probeer het ook met alleen het toetsenbord (Tab, dan Enter of spatie). (hfst 13.16, 15.9)
- [ ] **13.17 Beheer.** Volg elk pad: gebruiker toevoegen (10 tekens), *Heeft nodig*, **Benodigde rechten ook aanzetten**, een andere beheerder verwijderen, de balk met geweigerde pogingen, tijdzone, bedrijfsnaam en RDW-voertuigtypes. **(nieuw)** (hfst 13.17)

---

## Hoofdstuk 14 — Woordenlijst

- [ ] **Woorden vinden.** Zoek vijf woorden uit de lijst op in de app. Wijs aan waar ze staan: **Achterstallig**, **Nog te bepalen**, **Verouderd**, **Opgehaald** en **Voltooid**. (hfst 14, 17.4)
- [ ] **Nieuwe woorden.** Controleer dat de woordenlijst de nieuwe woorden uitlegt. Controleer dat de uitleg klopt met wat je zelf hebt gezien. Het gaat om **Afgerond** (en **Afronden** bij onderhoud), **Bedrijfsnaam**, **Bekeuring** (alleen registreren, met **Klant informeren**), **Geboekt** (het begin van elke nieuwe reservering), **Overdracht terugdraaien**, **Prullenbak**, **Tijdzone van het kantoor** en **Voertuigstatus** (**Gepland**, **Reparatie nodig**). **(nieuw)** (hfst 14)
- [ ] **Beschikbaar uitleggen.** Leg een collega in eigen woorden uit wat *beschikbaar* betekent. Leg ook uit waarom een auto in onderhoud niet beschikbaar is. (hfst 14, 17.4)

---

## Hoofdstuk 15 — Rollen en rechten

- [ ] **De regel.** De rol doet niets, behalve de rol Beheerder. De vinkjes bepalen wat je mag. Controleer: een **Manager** zonder vinkjes ziet een leeg menu. (hfst 15.1)
- [ ] **De beheerder herkennen.** [beheerder] Verwacht: alle twaalf menu-items. Rechtsboven staat **Beheer** met **Gebruikers**, **Back-upbeheer** en **App-instellingen**. Er staat geen prullenbak meer bij **Beheer**. (hfst 15.3)
- [ ] **Beheerschermen zitten aan de rol.** Vink bij een medewerker **Gebruikers beheren** aan. Verwacht: dat kan niet. Er staat *alleen voor beheerders*. Maak de rol **Beheerder** om de schermen te openen. **(nieuw)** (hfst 15.3, 15.17)
- [ ] **Alleen een beheerder kan.** Controleer deze dingen: accounts beheren, het activiteitenlog, back-ups, instellingen, een beheerder aanmaken, de uitgifte forceren, geweigerde pogingen zien **(nieuw)**, RDW-types toepassen **(nieuw)** en een andere beheerder verwijderen **(nieuw)**. (hfst 15.3)
- [ ] **Voertuigen, klanten en verhuur: vinkjes.** Controleer per vinkje welk menu-item en welke handeling je krijgt. De vinkjes zijn **Voertuigen bekijken/beheren**, **Klanten bekijken/beheren**, **Reserveringen bekijken/beheren**, **Kilometerverlaging goedkeuren**, **Overdracht terugdraaien** en **Opgehaalde huur annuleren of verwijderen**. (hfst 15.4)
- [ ] **Werkplaats, kosten, rapporten: vinkjes.** Controleer **Onderhoud beheren**, **Kosten beheren** en **Rapporten bekijken/beheren**. (hfst 15.4)
- [ ] **Documenten en schadechecks: vinkjes.** Controleer **Documenten bekijken**, **Documenten bewerken en genereren**, **PDF-sjablonen beheren** en **Schadecontroles bekijken/beheren**. (hfst 15.4)
- [ ] **Portaal, boetes, communicatie: vinkjes.** Controleer **Klantportaal bekijken/beheren**, **Boetes bekijken/beheren** (knop **Bekeuringen** op **Klantenportaal**), **Meldingen beheren** en **E-mailsjablonen beheren**. (hfst 15.4)
- [ ] **Algemeen: vinkjes.** Controleer **Dashboard bekijken** en **Prullenbak beheren** (niet aan de rol Beheerder gebonden). (hfst 15.4)
- [ ] **Fiscale vinkjes.** Controleer dat de zes fiscale vinkjes bestaan: **Fiscaal bekijken**, **Fiscale beoordelingen en gegevens beheren**, **Fiscale configuratie voorbereiden/goedkeuren/publiceren** en **Fiscale auditlog bekijken**. Het fiscale overzicht staat onder **Klantenportaal** → **Fiscale check** en **Rapporten** → **Fiscaal**. (hfst 15.4)
- [ ] **Documentvinkjes.** [account met Reserveringen beheren, zonder documentrechten] Verwacht: het menu-item **Documenten** ontbreekt. Het tabblad **Documenten** op de voertuigkaart is leeg. Bij het ophalen wordt het contract wel gemaakt, maar je kunt het niet openen. (hfst 15.5)
- [ ] **Kilometerverlaging ook voor een beheerder.** [beheerder zonder het vinkje **Kilometerverlaging goedkeuren**] Verwacht: *Je hebt geen recht om een verlaging van de kilometerstand te autoriseren. …* (hfst 15.6)
- [ ] **Profiel baliemedewerker.** [balie] Verwacht in het menu: **Dashboard**, **Voertuigen**, **Scannen**, **Klanten**, **Klantenportaal**, **Reserveringen**, **Documenten** en **Transporten**. Dit account kan ophalen en innemen. Het kan geen klant of voertuig wijzigen. Het kan geen kosten registreren, geen onderhoud plannen en geen rapporten openen. Het kan geen document genereren of mailen. (hfst 15.7)
- [ ] **Profiel verhuurmedewerker.** [kantoor] Verwacht: **Onderhoud**, **Communicatie** en **Rapporten** ontbreken. Dit account kan klanten aanmaken, boekingen wijzigen, contracten genereren en mailen, en kosten vastleggen. (hfst 15.7)
- [ ] **Profiel kijker.** [kijker] Verwacht: alleen lezen. **Ophalen starten** en **Innemen starten** op het Dashboard lopen stuk op een rechtenmelding. (hfst 15.7)
- [ ] **Profiel werkplaats.** [werkplaats] Verwacht in het menu: **Voertuigen**, **Scannen**, **Onderhoud** en **Kosten**. Zonder **Reserveringen bekijken** toont het onderhoudsscherm *Geen toegang tot deze gegevens (recht 'Reserveringen bekijken')*. (hfst 15.7)
- [ ] **Profiel boekhouding.** [Kosten beheren, Rapporten bekijken, Voertuigen bekijken] Verwacht: **Voertuigen**, **Scannen**, **Kosten** en **Rapporten**. **Administratie** vraagt ook **Reserveringen bekijken**. (hfst 15.7)
- [ ] **Drie manieren waarop je een recht mist.** Verwacht: (1) het menu-item ontbreekt, (2) *Not authorized. One of these permissions required: view_documents, manage_documents*, (3) **Toegang geweigerd** met de tekst *Je hebt geen toestemming voor deze functie.* (hfst 15.8)
- [ ] **Scherm zonder recht.** Open met een oud adres een scherm waarvoor je geen recht hebt (bijvoorbeeld `/maintenance`, `/reservations/edit/…` of `/expenses/add`). Verwacht: de pagina **U heeft geen toegang tot dit scherm** met de tekst *Hiervoor is het recht 'Onderhoud beheren' nodig. Vraag een beheerder om het aan te zetten.* Er is een knop naar het eerste scherm dat je wel mag zien. (hfst 15.9)
- [ ] **Grijze knoppen.** Wijs een grijze knop aan. Spring er met Tab naartoe. Of tik erop op een tablet. Verwacht: een tekstballon met het vinkje. Geen foutmelding. Geen half uitgevoerde actie. Dit geldt ook voor een grijs tabblad (**Contractsjablonen**). (hfst 15.9)
- [ ] **Stukjes zonder recht.** Verwacht: *Geen toegang tot deze gegevens (recht '…')*. Of het stukje is weggelaten, zonder foutmelding. (hfst 15.9)
- [ ] **Transporten, Communicatie, Onderhoud.** Verwacht: **Transporten** hoort bij **Reserveringen bekijken/beheren** óf **Voertuigen bekijken/beheren**. **Communicatie** hoort bij **Meldingen beheren** óf **E-mailsjablonen beheren**. Sjabloonbeheer en het e-maillogboek vragen **E-mailsjablonen beheren**. **Onderhoud** vraagt **Onderhoud beheren**. (hfst 15.10)
- [ ] **Onderhoud beheren: wat het wel en niet dekt.** [account met alleen Onderhoud beheren plus de leesrechten] Probeer dit: nieuw onderhoud inplannen (lukt niet), een blok bewerken (lukt niet), **Afronden** (lukt wel), **Binnen melden** (lukt niet, vraagt **Voertuigen beheren**) en de prullenbak (lukt niet, vraagt **Prullenbak beheren**). **(nieuw: Binnen melden en Terug uit onderhoud)** (hfst 15.11)
- [ ] **Etiketsjablonen.** Verwacht: iedereen kan de lijst zien. **Barcode-etiketten beheren** is grijs zonder **PDF-sjablonen beheren**. (hfst 15.12)
- [ ] **Prijzen verbergen.** Zet de schakelaar aan voor een testaccount. Verwacht: overal **•••** in plaats van een bedrag. Alles blijft verder werken. (hfst 15.13)
- [ ] **Actief en inactief.** Zet een account op inactief. Verwacht: het kan niet inloggen. (hfst 15.14)
- [ ] **De drie eigen vinkjes.** Zet **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren** aan en uit bij een testaccount. Verwacht: de knoppen volgen. (hfst 15.16)
- [ ] **Rechten-afhankelijkheden.** Zie hoofdstuk 10: *Heeft nodig*, *Handig erbij*, **Benodigde rechten ook aanzetten** en *alleen voor beheerders*. **(nieuw)** (hfst 15.17)

---

## Hoofdstuk 16 — Werkstromen

Doe dit als een echte werkdag. Het liefst met twee collega's.

### De ochtend

- [ ] **Stap 1: het Dashboard lezen.** Bekijk de back-upbalk, **APK verloopt binnenkort**, **Achterstallige verhuringen** en **Beheer vervangende voertuigen** → **Nog te bepalen**. (hfst 16.1)
- [ ] **Stap 2: vervangers toewijzen.** Klik op **Voertuig toewijzen** bij een regel op **Nog te bepalen**. (hfst 16.1)
- [ ] **Stap 3: wat er vandaag meegaat.** Bekijk **Reserveringen** (vandaag: **uit**/**in**, **+… meer**, **Vandaag**). Bekijk **Onderhoud** (label **Vervanger nodig**). Bekijk **Transporten** (tellers **Wacht op planning** en **Klaar voor levering**). (hfst 16.1)
- [ ] **Stap 4: achterstallig nalopen.** Klik op **… achterstallig**. Kies per regel: laten staan, **Details bekijken** → **Inleveren starten**, of corrigeren. (hfst 16.1)
- [ ] **Stap 5: portaalaanvragen.** Ga naar **Klantenportaal** → **Aandacht nodig**. (hfst 16.1)

### Tijdens de dag

- [ ] **Een klant komt ophalen.** Volg de stappen in 16.2. Controleer de eerdere startdatum, de werkplaats-melding en de volgorde. (hfst 16.2)
- [ ] **Een auto komt terug.** Volg de zes stappen. De huur sluit meteen. Controleer het kenteken en de klant vóór je afrondt. (hfst 16.2)
- [ ] **Een klant belt.** Zoek op contractnummer. Probeer: langer doorrijden (**Datums wijzigen**), een vrije auto volgende week (eerst datums), schade (notities) en een bekeuring (**Klantenportaal** → **Bekeuringen**). (hfst 16.3)
- [ ] **Een auto moet naar de werkplaats.** Houd de goede volgorde aan. Zet de auto eerst op onderhoud (**Voertuig markeren voor onderhoud**, of **Onderhoud plannen**, of scan → **Onderhoud inplannen**). Regel dan de vervanger. Regel dan het transport. Rond af met **Terug van onderhoud** (of **Afronden**). Vergeet je een keuze? Dan zie je **Ontbrekende toewijzingen vervangend voertuig**. **(nieuw: Afronden)** (hfst 16.4)
- [ ] **Een portaalaanvraag komt binnen.** Kijk naar het rode bolletje, de portaaltegel en **Aandacht nodig**. De soorten zijn **Verlenging**, **Eerder inleveren**, **Schademelding**, **Vraag over bekeuring**, **Huuraanvraag**, **Onderhoud/storing**, **Kilometerstand** en **Overig**. Handel af met de vijf knoppen. **Afwijzen** vraagt een toelichting in **Antwoord aan klant**. (hfst 16.8)
- [ ] **Een transport.** Bekijk de tabbladen. Probeer meerdere regels in één keer. Verwacht: **Vervangend voertuig vereist** als er geen vervanger is toegewezen. (hfst 16.4)
- [ ] **Een nieuwe auto in de vloot.** Volg 16.5: **Voertuig toevoegen** → kenteken → **Opzoeken**, opslaan, daarna het sleutellabel afdrukken. Verwacht: *Voertuiggegevens gevonden*, en het label met de barcode van de auto. (hfst 16.5)

### Het einde van de dag

- [ ] **1. Alles ingenomen?** Loop in het vakje van vandaag elke regel met **in** na. (hfst 16.9)
- [ ] **2. Vervangers.** Controleer dat er geen rij meer op **Nog te bepalen** staat. (hfst 16.9)
- [ ] **3. Portaalaanvragen aangeraakt.** Controleer dat het rode bolletje weg is, of dat de aanvragen op **In behandeling** staan. (hfst 16.9)
- [ ] **4. Geannuleerd?** Controleer dat alles wat eraan hing, is meegegaan. (hfst 16.9)
- [ ] **5. Wat morgen moet.** Klik op het belletje → **Nieuwe melding**. Vul een titel, datum en prioriteit in. (hfst 16.9)
- [ ] **Uitloggen.** Log uit. (hfst 16.9)
- [ ] **Eén keer per week.** Controleer **APK verloopt binnenkort**, de achterstallige verhuringen (ook de oude), de back-up en nieuwe klanten op dubbelen. (hfst 16.9)

---

## Hoofdstuk 17 — Inwerkpad

Het inwerkpad is voor een nieuwe medewerker. Loop met een testaccount de "Doen"-oefeningen na. Controleer dat ze met de app kloppen.

- [ ] **Stap 0.** Maak een eigen account met de rechten van een profiel uit 15.7. (hfst 17.2)
- [ ] **Stap 1 (dag 1, ochtend).** Log in. Wijzig je wachtwoord (10 tekens). Lees het Dashboard. Bekijk het vakje van vandaag. Zoek drie dingen op. Probeer `?` en `Ctrl+K`, `N` en `S`. Scan een label. Log uit. (hfst 17.3)
- [ ] **Stap 2 (dag 1, middag).** Wijs vijf woorden aan in de app. (hfst 17.4)
- [ ] **Stap 3 (dag 2).** Klanten en voertuigen: drie klanten, een oefenklant, "bestaat mogelijk al", de zes tabbladen, de statuslabels en de **Geschiedenis**. (hfst 17.5)
- [ ] **Stap 4 (dag 3).** Reserveringen: de kalender, **Lijstweergave**, **Voltooid bekijken (…)**, **… achterstallig**, een oefenreservering, een bezette auto (rood), onderhoud (geel) en **Datums wijzigen**. De oefening noemt geen statusveld meer. **(nieuw)** (hfst 17.6)
- [ ] **Stap 5 (dag 4).** Ophalen en innemen onder begeleiding. Loop **… achterstallig** na met je begeleider. Beantwoord de drie vragen. (hfst 17.7)
- [ ] **Stap 6 (dag 5).** Documenten en e-mail: een contract zoeken, bekijken, downloaden en afdrukken. Ook **Verouderd** en mailen tot en met de adreskeuze. (hfst 17.8)
- [ ] **Stap 7 (week 2).** Onderhoud en transport: de kalender lezen, **Onderhoud plannen** doorlopen zonder opslaan, een vervanger toewijzen en de volgorde uitleggen. (hfst 17.9)
- [ ] **Stap 8 (week 2).** Fouten: de tabel in 11.18, drie meldingen in hoofdstuk 12, een ophaling terugdraaien met **Overdracht terugdraaien**, de **Geschiedenis** en wie **Prullenbak beheren** heeft. (hfst 17.10)
- [ ] **Stap 9 (week 3).** Rollen en rechten: je eigen menu-items verklaren, de twee documentvinkjes, wat alleen een beheerder kan en wat een eigen vinkje vraagt (15.16). (hfst 17.11)
- [ ] **Stap 10 (week 3).** Een hele dag zelf, met scannen als gewoonte, en de **Sleutelkast-audit**. (hfst 17.12)
- [ ] **De afrondende controle.** Kun je de twaalf dingen in 17.13 zonder de handleiding? (hfst 17.13)

---

## Hoofdstuk 18 — Barcode en scannen

### Het scanscherm

- [ ] **Openen.** Klik op **Scannen** in het menu. Of druk op `S`. Of klik op **Scannen** bij **Snelle acties**. Verwacht: **Barcode scannen** met een invoerveld, **Zoeken**, een cameraknopje en onderaan **Recente scans**. (hfst 18.1)
- [ ] **USB-scanner.** Zet de cursor in het veld. Scan. Verwacht: de scanner typt de code en drukt zelf op Enter. (hfst 18.1)
- [ ] **Met de hand.** Typ een code. Klik op **Zoeken** of druk op Enter. Verwacht: *Bezig met zoeken...* (hfst 18.1)
- [ ] **Letters in het scanveld.** Typ `N`, `S` en `?` in het scanveld. Verwacht: ze doen niets. (hfst 18.1)
- [ ] **Codes.** Probeer `VEH-000123` (voertuig), `VEH-000123-S` (reservesleutel, met het extra label **Reservesleutel**), `VEH-000123-R2` (opnieuw aangemaakt label), `RES-003366` (reservering) en een kenteken. Verwacht: hoofdletters, kleine letters en spaties maken niet uit. (hfst 18.2)
- [ ] **Niet gevonden.** Typ een onbekende code. Verwacht: *Geen voertuig of reservering gevonden voor "ZZ-00-ZZ"*. Bij een storing staat er *Opzoeken mislukt. Controleer de verbinding en probeer opnieuw.* (hfst 18.2)
- [ ] **Resultaat bij een voertuig.** Verwacht: merk en model, het statuslabel (**Beschikbaar**, **Gepland**, **Verhuurd**, **Reparatie nodig**, **Niet voor verhuur**) en het kenteken met barcode. Bij een boeking van vandaag die nog niet is opgehaald staat **Geboekt, nog niet opgehaald**. De gegevens zijn **APK-vervaldatum**, **Garantie tot**, **Kilometerstand**, **Brandstof** en **Registratie** (**N.v.t.** als onbekend). (hfst 18.3)
- [ ] **Blokken.** Verwacht: **Actieve reservering** of **Aankomende reservering** (met **Reservering openen**, of leeg: *Geen actieve of aankomende reservering*). Een oranje blok **Onderhoud** (met **Onderhoudsblok openen** en de stand **Gepland**, **In werkplaats** of **Voltooid**). En **Actief transport** (**Gepland** of **Onderweg**). (hfst 18.3)
- [ ] **Bij een reservering.** Scan een reserveringscode. Verwacht: **Reservering gevonden** met auto, klant, status, periode, **Reservering openen** en **Voertuig openen**. (hfst 18.3)

### Wat je kunt doen

- [ ] **Altijd zichtbaar.** Verwacht: **Opnieuw scannen**, **Voertuig openen**, **Kosten registreren**, **Document uploaden**, **Tanken** en **Km-stand bijwerken**. (hfst 18.4)
- [ ] **Afhankelijk van de situatie.** Verwacht: **Ophalen starten** · **Inleveren starten** (altijd maar één van de twee) · **Reservering maken** (bij geen reservering) · **Onderhoud inplannen** of **Terug uit onderhoud** (die sluiten elkaar uit) · **Transport starten** / **Transport afronden**. (hfst 18.4)
- [ ] **Ophalen en inleveren vanaf het scankaartje.** Zie hoofdstuk 5. Verwacht: het kaartje verdwijnt zolang het formulier openstaat. Daarna komt het terug. (hfst 18.4)
- [ ] **Tanken en Km-stand.** Klik op **Tanken**. Verwacht: **Brandstofstatus bijwerken** (met een kostenpost bij een bedrag). Klik op **Km-stand bijwerken**. Verwacht: **Kilometerstand bijwerken**. **(nieuw: kostenpost)** (hfst 18.4)
- [ ] **Terug uit onderhoud, twee manieren.** Scan een auto op **Binnen** in een blok van vandaag. Verwacht: **Onderhoud afronden** opent. Scan een auto zonder blok. Verwacht: één klik en **Voertuig is terug uit onderhoud**. De tegel ontbreekt als de auto geen werkplaatsstatus heeft. Dat is bijvoorbeeld zo bij een blok dat je via het bewerkvenster op **Binnen** zette. Rond dan af via **Onderhoudsblok openen** → **Afronden**. **(nieuw)** (hfst 18.4)
- [ ] **Alleen Voertuigen beheren.** [alleen Voertuigen beheren] Scan een auto op **Binnen**. Verwacht: **Terug uit onderhoud** is grijs. De ballon noemt **Onderhoud beheren** of **Reserveringen beheren**. **(nieuw)** (hfst 18.4, 15.11)
- [ ] **Transport starten/afronden.** Klik op de knoppen. Verwacht: **Transport gestart** en daarna **Transport afgerond**. De fouten zijn **Onderhoudsstatus wijzigen mislukt** en **Transportstatus wijzigen mislukt**. (hfst 18.4)
- [ ] **Het scanscherm start zelf geen ophaling.** Scan op het scanscherm. Verwacht: je ziet eerst het kaartje. Scan via een tegel op het Dashboard. Verwacht: het ophaalvenster opent direct. (hfst 18.4, 18.7)

### Recente scans en camera

- [ ] **Recente scans.** Verwacht per regel: het tijdstip, de code, het kenteken en wie scande. Is er niets gevonden, dan staat er **geen match**. Is de lijst leeg, dan staat er *Nog geen scans*. De tijden staan op de Nederlandse klok. **(nieuw)** (hfst 18.5)
- [ ] **Camera.** Klik op het cameraknopje. Verwacht: **Camera scannen** met de tekst *Richt de camera op de barcode van het sleutellabel.* Zodra de code gelezen is, gaat het venster dicht. **Sluiten** stopt. Via gewoon http staat er *De browser blokkeert de camera omdat de app via onbeveiligd HTTP wordt geopend. …* Andere meldingen zijn *Cameratoegang geweigerd. …*, *Geen camera gevonden op dit apparaat.* en *Camera starten mislukt.* (hfst 18.6)

### Vanuit het Dashboard

- [ ] **Ophalen starten.** Klik op de tegel. Verwacht: het venster **Ophalen starten** met de tekst *Scan het sleutellabel of typ het kenteken. De juiste handeling wordt meteen geopend.* (hfst 18.7)
- [ ] **Innemen starten.** Klik op de tegel. Verwacht: hetzelfde voor inleveren. De knop heet hier **Innemen starten**. Op het scanscherm heet hij **Inleveren starten**. (hfst 18.7)
- [ ] **Schadecheck starten.** Klik op de tegel. Verwacht: *Scan de barcode van het voertuig. Bij een opgehaald voertuig start de retourcheck, anders de ophaalcheck.* en de knop **Doorgaan zonder scan**. (hfst 18.7)

### Sleutelkast-audit en labels

- [ ] **Sleutelkast-audit.** Ga naar **Voertuigen** → **Sleutelkast-audit**. Verwacht: *Scan alle sleutels in de kast; daarna zie je welke ontbreken.* en de teller *0 van 305 verwachte sleutels gescand*. Na elke scan staat er *Gescand: AB-123-C*. Er zijn lijsten **Gescand (n)** en **Nog niet gescand (n)**. Verder *Nog niets gescand* en *Alle verwachte sleutels zijn gescand*. (hfst 18.8)
- [ ] **Audit afronden.** Klik op **Audit afronden**. Verwacht: **Ontbrekende sleutels**, **Onverwacht aanwezig (voertuig staat als verhuurd)**, of *Geen sleutels ontbreken 🎉*. **Opnieuw beginnen** wist de telling. Er is een knop **Sluiten**. De uitslag wordt niet bewaard. Je kunt hem niet afdrukken. (hfst 18.8)
- [ ] **Meldingen tijdens het scannen.** Verwacht: *Al gescand*, *Onbekende code: <code>*, *Dit is een reserveringscode, geen voertuigsleutel*, *Dit is een hoofdsleutel. Scan het reservesleutel-label (-S).* en *Dit is een reservesleutel. Gebruik hiervoor de reservesleutelkast-audit.* (hfst 18.8)
- [ ] **Reservesleutelkast-audit.** Klik op **Reservesleutelkast-audit**. Verwacht: *Scan alle reservesleutels in de kast; daarna zie je welke ontbreken.* Het tweede blok heet **Onverwacht aanwezig (staat als bij klant of zonder reservesleutel)**. Zet een reservesleutel bij de klant: **Bewerken** → **Technisch** → **Reservesleutel bij klant** met **Klantnaam**. (hfst 18.8)
- [ ] **Een label afdrukken.** Klik op **Barcode bekijken** → **Labelsjabloon** → **Sleutellabel afdrukken**. Op de voertuigkaart staan ook **Sleutellabel** en **Reservesleutel-label** (eerst **Labelsjabloon**, dan **Afdrukken**). Verwacht: het **Labelsjabloon** biedt **Standaardindeling**, **DYMO-tape (labelmaker, staand)** en de eigen sjablonen. (hfst 18.9)
- [ ] **Stickers op de DYMO-tape.** Ga naar **Barcodeboek**. Zet **Labelsjabloon** op **DYMO-tape (labelmaker, staand)**. Vink twee auto's aan. Klik op **Stickers afdrukken**. Verwacht: **Afdrukvenster geopend** met de tekst *Het afdrukvenster van je browser is geopend voor 2 tapelabels. …* Er komen twee labels na elkaar uit de labelmaker. (hfst 18.9)
- [ ] **Barcode opnieuw genereren.** Verwacht de waarschuwing **Barcode opnieuw genereren?** met de tekst *De oude barcode (<code>) werkt daarna niet meer. …* Daarna staat er **Nieuwe barcode: <code>**. Doe dit alleen op een oefenauto. (hfst 18.9)
- [ ] **Barcodeboek.** Ga naar **Voertuigen** → **Barcodeboek**. Verwacht: *Druk alle voertuigbarcodes af voor in een map of klapper.* Verder **Labelsjabloon**, een zoekveld, **Alle statussen**, **Alles selecteren**, **Selectie wissen** en *… geselecteerd*. De afdrukknoppen zijn **Selectie afdrukken** / **Gefilterde afdrukken (…)** / **Alles afdrukken (…)** en **Stickers afdrukken**. De kop is *Barcodeboek — Auto Lease LAM*. Bij een pop-upblokkade staat er *Je browser heeft afdrukken geblokkeerd. Gebruik de downloadknop en druk handmatig af.* (hfst 18.9)

---

## Hoofdstuk 19 — Kosten en facturen

Alle bedragen in dit hoofdstuk zijn **exclusief btw**. Gebruik een oefenauto en verzonnen bonnen.

### Het scherm Kostenbeheer

- [ ] **Kostenbeheer openen.** [werkplaats] Klik in het menu op **Kosten**. Verwacht: het scherm **Kostenbeheer** met bovenaan **Verwijderde kostenposten**, **Ontvangen facturen**, **Factuur scannen** en **Kosten registreren**. Links staat het **Kostenoverzicht**. Rechts staat de **Kostensamenvatting** met **Totale kosten** en **Per categorie**. (hfst 19.1)
- [ ] **Rechten.** [kijker] Kijk in het menu. Verwacht: **Kosten** staat er niet. [werkplaats] Klik op **Verwijderde kostenposten**. Verwacht: zonder **Prullenbak beheren** is **Terugzetten** grijs. (hfst 19.7, 19.8)
- [ ] **Filteren.** Kies bij **Voertuig** een kenteken. Typ het zonder streepjes. Vul **Van** en **Tot en met** in. Kies bij **Categorie** **Banden**. Typ een woord uit een omschrijving in *Zoeken op kenteken, merk, categorie of omschrijving...*. Verwacht: alleen de kosten die passen. Beide dagen tellen mee. Onder de filters staat het aantal en het totaal, zoals *11 kostenposten · totaal € 2.856,85*. De **Kostensamenvatting** rekent met je filters mee. (hfst 19.1)
- [ ] **Snelknoppen, Filters wissen en exporteren.** Klik op **Deze maand**, **Vorige maand** en **Dit jaar**. Verwacht: de datums staan meteen goed. **Filters wissen** zie je pas als er een filter aan staat. Daarmee staat alles weer terug. Zet een filter aan en klik op **Exporteren (CSV)**. Verwacht: een bestand met alleen de kosten die je nu ziet. (hfst 19.1)
- [ ] **Per categorie en Alle kosten.** Open het scherm. Verwacht: **Per categorie** staat aan. Elke categorie is een ingeklapte regel met het aantal en het totaal. Klik op **Banden**. Verwacht: de vijf nieuwste kostenposten. Zijn het er meer, dan staat er **Alle N tonen**. Dat venster heeft een eigen zoekveld en **Sorteren**. Klik op **Alle kosten**. Verwacht: de kolommen **Datum**, **Voertuig**, **Categorie**, **Omschrijving** en **Bedrag (excl. btw)**. Een klik op een kolomkop sorteert. (hfst 19.1)
- [ ] **Kostendetails en bewerken.** Klik op het oogje op een regel. Verwacht: **Kostendetails** met de datum, de categorie, het bedrag, het voertuig, de omschrijving, de bon en wie de post maakte of veranderde. Klik op **Kosten bewerken**. Pas iets aan. Klik op **Kosten bijwerken**. Verwacht: *Kosten succesvol bijgewerkt*. (hfst 19.1)

### Kosten registreren

- [ ] **Het venster.** Klik op **Kosten registreren**. Verwacht: **Nieuwe kosten toevoegen** met *Registreer nieuwe kosten voor je wagenpark*. Bij **Voertuig** staat *Een voertuig is verplicht: elke kostenpost hoort bij één voertuig.* Het bedrag heet **Bedrag (€, excl. btw)**. Bij **Datum** staat vandaag. **Categorie** biedt Onderhoud, Banden, Remmen, Schade, Brandstof, Verzekering, Registratie, Schoonmaak, Parkeren, Tol, Accessoires en Overig. Zonder voertuig kun je niet opslaan. (hfst 19.2)
- [ ] **Bon en opslaan.** Klik bij **Bon** op **Bestand uploaden**. Kies een PDF, PNG, JPG of GIF (tot 25 MB). Probeer ook het tabblad **URL**. Klik op **Kosten registreren**. Verwacht: *Kosten succesvol geregistreerd*. De kostenpost staat meteen in het **Kostenoverzicht**. (hfst 19.2)
- [ ] **Andere ingangen.** Open het venster via **Dashboard** → **Kosten registreren**, de voertuigkaart → tabblad **Kosten** → **Kosten toevoegen**, **Reserveringsdetails** → **Kosten toevoegen** en **Scannen** → tegel **Kosten registreren**. Verwacht: steeds hetzelfde venster. Vanaf de voertuigkaart en het scanscherm staat het voertuig al ingevuld. (hfst 19.2)
- [ ] **Tanken maakt zelf een kostenpost.** [alleen Voertuigen beheren] Klik bij een auto op **Tanken**. Vul **Tankkosten (€)** in. Verwacht: *Brandstofstatus bijgewerkt; kostenpost van € x geboekt*. Bij **Kosten** staat een post **Brandstof**. Voer hem niet nog een keer in. Anders staat hij er dubbel. (hfst 19.2, 19.8)

### Facturen per e-mail

- [ ] **Ontvangen facturen en Nu ophalen.** [kantoor] Klik op **Ontvangen facturen**. Verwacht: het getal op de knop is het aantal dat op controle wacht. Er zijn drie tabbladen: **Te controleren** (met de kolom **Reden**, zoals *Onbekende afzender* of *Geen kenteken gevonden*), **Geboekt** (met **Bekijken**) en **Afgewezen**. Klik op **Nu ophalen**. Verwacht: bijvoorbeeld *2 mail(s) opgehaald: 1 geboekt, 1 ter controle*. Rechts staat wanneer de app voor het laatst keek. (hfst 19.3)
- [ ] **Logboek.** Klik op **Logboek**. Verwacht: de tabbladen **Facturen** (met **Resultaat**, **PDF openen** en **Naar controleren**), **Overige mail** en **Ophaalrondes**. De schakelaar **Alleen rondes met mail of fouten** staat aan. **Meer laden** toont oudere regels. Je kunt hier niets veranderen. (hfst 19.3)
- [ ] **Als de functie uit staat.** Verwacht: *Facturen per e-mail staat uit. Zet het aan bij Instellingen, tabblad E-mail.* **Nu ophalen** is grijs. Facturen die al binnen waren, kun je nog controleren. [beheerder] Aanzetten gaat via **App-instellingen** → **E-mail & GPS** (smal scherm: **E-mail**) → **Facturen per e-mail (inkomend)** → **Postvak automatisch uitlezen** → **Opslaan**. (hfst 19.3)

### Een factuur controleren en boeken

- [ ] **Factuur controleren.** Klik op **Controleren** bij een factuur. Verwacht: **Factuur controleren**. Links staat de factuur. Rechts staan **Leverancier**, **Factuurnummer**, **Factuurdatum** en **Voertuig** met *Gevonden kentekens:*. Elke regel heeft **Omschrijving**, **Bedrag (excl. btw)** en **Categorie**. Er zijn **Alles selecteren** en **Regel toevoegen**. Haal het voertuig weg, of alle vinkjes, of het bedrag van een gekozen regel. Verwacht: **Boeken** is grijs. (hfst 19.4)
- [ ] **Boeken.** Laat **Eén kostenregel per categorie** aan. Klik op **Boeken**. Verwacht: bijvoorbeeld *1 kostenregel(s) geboekt*. De factuur staat onder **Geboekt**. De kostenposten staan in het **Kostenoverzicht**, met de factuur als bon. Regels met dezelfde categorie zijn één kostenpost. Een tweede keer boeken op een andere auto kan niet. Verkeerde auto? Verwijder de posten (19.7) en registreer ze zelf bij de goede auto. (hfst 19.4)
- [ ] **Afzender vertrouwen.** [beheerder] Open een factuur van een testafzender. Klik op **Afzender vertrouwen**. Verwacht: *&lt;adres&gt; wordt voortaan automatisch verwerkt*. [kantoor] Verwacht: zonder **Instellingen beheren** zie je deze knop niet. Klik nooit op deze knop bij een onbekende afzender. (hfst 19.4, 19.8)
- [ ] **Afwijzen en opnieuw uitlezen.** Pas bij een factuur een veld aan. Klik op **Opnieuw uitlezen**. Verwacht: *Factuur opnieuw uitgelezen*. Je eigen aanpassing is weg. Typ bij **Waarom afwijzen? (optioneel)** een reden. Klik op **Afwijzen**. Verwacht: *Factuur afgewezen*. De factuur staat onder **Afgewezen**. Er is niets geboekt. (hfst 19.4)
- [ ] **Factuur zelf scannen.** Klik op **Factuur scannen**. Verwacht: *Upload een PDF-factuur om kosten automatisch te herkennen en te categoriseren*. Alleen een PDF werkt. Kies de PDF en klik op **Factuur scannen**. Verwacht: *Factuur succesvol gescand*, en bij een kenteken uit de vloot *Voertuig automatisch geselecteerd*. Klik op **n kostenposten aanmaken**. Verwacht: *Kosten succesvol aangemaakt*. Bij **Ontvangen facturen** staat *handmatige scan*. Scan dezelfde PDF nog eens. Verwacht: *Deze factuur is al geboekt.* of *Deze factuur staat al bij Ontvangen facturen ter controle. Boek hem daar.* (hfst 19.5)
- [ ] **Schade.** Registreer een post met de categorie **Schade**. Zet het reserveringsnummer in de **Omschrijving**. Verwacht: de app koppelt de post niet aan de schadecheck of de klant. Er is geen knop om schade door te rekenen aan de klant. De post telt in de rapporten als eigen kosten. (hfst 19.6)
- [ ] **Verwijderen en terugzetten.** [kantoor] Klik op het rode prullenbakje op een oefenpost. Verwacht: **Weet je het zeker?** met *Deze kostenpost gaat naar de prullenbak; terugzetten kan via Prullenbak op de pagina Kosten.* Klik op **Verwijderen**. Verwacht: *Kosten verwijderd*. Open **Verwijderde kostenposten**. Verwacht: het zoekveld *Zoeken op omschrijving of naam…* en per regel wanneer en door wie. Klik op **Terugzetten**. Verwacht: **Teruggezet**, met de bon erbij. Was de auto intussen verwijderd? Verwacht: *Let op: het voertuig van deze kostenpost bestaat niet meer. …* (hfst 19.7)

---

## Hoofdstuk 20 — Klantenportaal en bekeuringen

Stuur geen echte mail naar een klant. Gebruik een oefenklant met je eigen e-mailadres.

### Het scherm en de aanvragen

- [ ] **Klantenportaal beheren.** [balie] Klik in het menu op **Klantenportaal**. Verwacht: **Klantenportaal beheren** met rechtsboven **Bekeuringen**, **Fiscale check** (alleen met **Fiscaal bekijken**), **Brieven scannen** en **Account uitnodigen**. Er zijn acht tegels: **Aanvragen**, **Onderhoud**, **Bekeuringen**, **Klanten**, **Accounts**, **Voertuigen online**, **Blacklist** en **Activiteit**. Een tegel met een gele rand vraagt om actie. Het rode bolletje in het menu telt de nieuwe aanvragen en de ongelezen meldingen samen. (hfst 20.1)
- [ ] **Aandacht nodig en Meldingen.** Verwacht: in **Aandacht nodig** een blauw label **Nieuw** bij een aanvraag en een rood label **Niet gekoppeld** bij een bekeuring. Soms staat er *Start binnenkort* of *Wacht al lang*. Een klik op een regel opent de aanvraag of de bekeuring. Bij **Meldingen** staat zonder meldingen *Nog geen meldingen vanuit het portaal.* Klik op **Alles gelezen**. Verwacht: het rode bolletje wordt kleiner. **Aankomende reserveringen** toont *Ophalen en inleveren in de komende 14 dagen*. (hfst 20.1)
- [ ] **Aanvraag openen en een bericht plaatsen.** [kantoor] Open een aanvraag. Verwacht: **Aanvraag #<nummer>** met het soort, de klant, **Bericht van klant** en **Bijlagen**. **In behandeling nemen** staat er alleen zolang de status **Nieuw** is. Typ een vraag onder **Berichten met de klant**. Klik op **Bericht plaatsen**. Verwacht: het bericht staat in de draad. Er gaat geen e-mail uit. De aanvraag blijft open. (hfst 20.2)
- [ ] **Standaardantwoord en leeg afwijzen.** Klik achter **Standaardantwoord invullen** op **Ontvangen**, **Akkoord** of **Afwijzing**. Verwacht: de tekst komt in **Antwoord aan klant**. Je kunt hem aanpassen. Maak het vak leeg. Klik op **Afwijzen**. Verwacht: *Vul een antwoord in.* (hfst 20.2)
- [ ] **Verlenging goedkeuren.** Open een verlenging. Verwacht: **Reservering** en **Gevraagde nieuwe einddatum**. Klik op **Goedkeuren (past reservering aan)**. Verwacht: de reservering heeft de nieuwe einddatum. Het contract staat op **Verouderd**. De klant krijgt een melding en een e-mail. (hfst 20.2)
- [ ] **Bekend: je eigen tekst gaat niet mee.** Typ een eigen tekst in **Antwoord aan klant**. Klik op **Goedkeuren (past reservering aan)**. Verwacht: de app meldt *Antwoord verstuurd.* De klant krijgt toch het vaste standaardbericht, niet jouw tekst. Plaats extra uitleg eerst met **Bericht plaatsen**. (hfst 20.2)
- [ ] **Beantwoorden en afhandelen bij een verlenging.** Klik bij een verlenging op **Beantwoorden en afhandelen**. Verwacht: de aanvraag is gesloten, maar de reservering is niet veranderd. Keur een **Eerder inleveren** goed. Verwacht: de einddatum is eerder. De auto moet je nog aan de balie innemen. (hfst 20.2)
- [ ] **Huuraanvraag.** Open een huuraanvraag. Klik op **Goedkeuren: reservering aanmaken**. Verwacht: het blok **Reservering aanmaken uit deze aanvraag** met **Periode**, **Ophaaltijd**, **Inlevertijd** en **Voertuig**. Een bezette auto heeft het rode label **Bezet in deze periode**. Eronder staat **Zelfde type, vrij**. Onderaan staat *Wordt geboekt: …*. Laat **Geen bestuurder (later toewijzen)** staan. Klik op **Reservering aanmaken en goedkeuren**. Verwacht: *Reservering #… aangemaakt; de klant is geïnformeerd.* De reservering opent vanzelf. Met **Antwoord mailen (blijft open)** blijft de aanvraag open. (hfst 20.2)
- [ ] **Onderhoudsmelding.** Open een **Onderhoud/storing**. Lees **Melding van de klant**. Klik op **Inplannen in de onderhoudskalender** (bij verzetten: **Onderhoud verplaatsen**). Vul **Datum**, **Duur (dagen)**, **Soort** en **Notitie voor de klant** in. Klik op **Inplannen en bevestigen**. Verwacht: *Onderhoud #… staat in de kalender*. Vroeg de klant vervangend vervoer en valt de datum in de huur? Verwacht: *Er wordt een vervanger-placeholder aangemaakt; wijs later een auto toe in de onderhoudskalender.* Valt de datum buiten de huur? Verwacht: geen placeholder. (hfst 20.2)
- [ ] **Bedrijfsnaam en overige aanvragen.** Open een wijziging van de bedrijfsnaam. Verwacht: **Gevraagde bedrijfsnaam** en **Goedkeuren (past de bedrijfsnaam aan)**. Afsluiten zonder goedkeuren of **Afwijzen** kan niet. Open een **Schademelding**, **Vraag over bekeuring**, **Kilometerstand** of **Overig**. Klik op **Ontvangen** → **Beantwoorden en afhandelen**. Verwacht: de aanvraag is klaar. (hfst 20.2)
- [ ] **Account uitnodigen.** Klik op **Account uitnodigen**. Verwacht: het venster **Portaalaccount** met **Klant**, **E-mailadres**, **Naam**, **Rol** en **Rechten voor dit account**. Bij de rol **Bestuurder** staat ook **Gekoppelde bestuurder**. Vul je eigen e-mailadres in. Klik op **Uitnodigen**. Verwacht: *Uitnodiging verstuurd naar …*. Bij de tegel **Accounts** staan **Bewerken en rechten**, **Uitnodiging opnieuw sturen**, **Wachtwoord-reset sturen**, **Blokkeren** / **Deblokkeren** en **Verwijderen**. (hfst 20.3)

### Bekeuringen

- [ ] **Het scherm Bekeuringen.** Kijk in het menu. Verwacht: er is geen menu-item **Bekeuringen**. Klik op **Klantenportaal** → **Bekeuringen**. Verwacht: **Exporteren (CSV)**, **Prullenbak**, **CJIB-importen**, **Brieven scannen** en **Nieuwe bekeuring**. Er zijn een zoekveld, **Alle statussen**, **Kenteken**, **Van** en **Tot**. De kolommen zijn **Kenteken**, **Datum/tijd**, **Omschrijving**, **Klant**, **Bestuurder**, **Bedrag** en **Status**. Het bedrag is inclusief administratiekosten. (hfst 20.4)
- [ ] **Eén bekeuring invoeren.** [kantoor] Klik op **Nieuwe bekeuring**. Verwacht: **Brief scannen** is grijs zolang je geen brief koos. Kies bij **Brief (PDF/JPG/PNG)** een brief. Klik op **Brief scannen**. Verwacht: *Brief lezen…* en daarna *Brief gelezen. Controleer de velden en sla op.* Een onzeker veld heeft een oranje rand met *Onzeker gelezen: …*. Verplicht zijn **Kenteken**, **Datum en tijd overtreding**, **Bedrag (€)** en **Omschrijving**. Klik op **Opslaan**. Verwacht: **Bekeuring #<nummer>** opent. Voer hetzelfde kenmerk nog eens in. Verwacht: *Kenmerk bestaat al: bekeuring #…* met **Openen**. (hfst 20.4)
- [ ] **Vanzelf gekoppeld.** Maak een nieuwe bekeuring op een kenteken dat op dat moment aan één klant verhuurd was. Typ het kenteken met of zonder streepjes. Verwacht: na **Opslaan** staat de bekeuring op **Gekoppeld**, met de klant en de reservering van dat moment. (hfst 20.4)
- [ ] **Voorgestelde huur.** Maak een bekeuring op een datum een dag vóór of na een huur van die auto. Verwacht: **Niet gekoppeld**, en in het venster onder **Reserveringen rond die datum** een knop voor die huur. Klik erop en daarna op **Koppelen**. Verwacht: *Bekeuring gekoppeld.* (hfst 20.4)
- [ ] **Koppelen.** Zoek in de reservering wie de auto had. Klik bij **Klant** in **Klant zoeken…**. Kies de klant. Verwacht: een vinkje voor de naam, met **Wijzigen**. Laat **Bestuurder (optioneel)** leeg of kies er een. Typ een **Toelichting voor klant**. Klik op **Koppelen**. Verwacht: *Bekeuring gekoppeld.* en bovenaan **Gekoppeld**. De klant krijgt geen e-mail. Zonder **Klanten bekijken** staat er *Om een klant aan deze bekeuring te koppelen heb je ook het recht Klanten bekijken nodig.* (hfst 20.4)
- [ ] **Brieven scannen en CJIB-importen.** Klik op **Brieven scannen**. Sleep twee brieven in het vak. Verwacht: **Bekeuringsbrieven importeren** met per regel *Wachten*, *Lezen…*, *Klaar*, *Dubbel* of *Mislukt*. Een dubbele brief is niet aangevinkt. De kolom **Koppeling** zegt wat de app wil doen. Klik op **Aanmaken (n)**. Verwacht: hoeveel er zijn aangemaakt en gekoppeld. Open **CJIB-importen**. Verwacht: **Nu ophalen** is grijs zonder verbinding met het CJIB. **Bestand uploaden** werkt wel. (hfst 20.4)
- [ ] **Klant informeren.** Open een gekoppelde bekeuring van een oefenklant met je eigen adres. Klik op **Klant informeren**. Verwacht: **Klant informeren?** met het e-mailadres en **Nee, niet sturen**. Verstuur. Verwacht: *Klant geïnformeerd.*, in het venster *Klant geïnformeerd op <datum>*, en de knop heet nu **Opnieuw informeren**. Bij een klant zonder e-mailadres: *Deze klant heeft geen e-mailadres, dus er is niets verstuurd.* Bij portaal uit: *Het portaal staat uit voor deze klant, dus er is niets verstuurd.* (hfst 20.4)
- [ ] **Wijzigen, annuleren en de prullenbak.** [kantoor] Klik op **Opslaan**, **Ontkoppelen**, **Bekeuring annuleren** (veilige keuze **Nee, laten staan**) en **Heractiveren**. Verwacht: *Bekeuring opgeslagen.*, *Bekeuring ontkoppeld.*, de status **Geannuleerd** en *Bekeuring heractiveerd.* De **Administratiekosten** kun je hier niet wijzigen. Klik op **Verwijderen**. Verwacht: *Bekeuring naar de prullenbak verplaatst*. Klik op **Prullenbak**. Verwacht: **Verwijderde bekeuringen** met **Terugzetten**. (hfst 20.4)
- [ ] **Wat de klant ziet.** Log in het portaal in met een oefenaccount. Verwacht: alleen bekeuringen op **Gekoppeld** en alleen als **Ziet bekeuringen** aan staat. Er staat *Het doorbelasten aan uw bestuurder regelt u zelf.* Klik op **Vraag stellen over deze bekeuring**. Verwacht: in **Aandacht nodig** komt een aanvraag **Vraag over bekeuring**. (hfst 20.4)
- [ ] **Fiscale check.** [beheerder] Klik op **Klantenportaal** → **Fiscale check**. Verwacht: **Fiscale check: overzicht** met bovenaan de regelversie en tegels zoals **Niet van toepassing**, **Van toepassing**, **Handmatige beoordeling nodig** en **Gegevens ontbreken**. Onderaan staan **Open perioden**, **Nog niet beoordeeld** en **Open beoordelingszaken**. Zonder versie staat er *Geen regelversie beschikbaar* en blijven de tegels op 0. Je kunt hier niets invullen. [balie] Verwacht: zonder **Fiscaal bekijken** geen knop **Fiscale check**. (hfst 20.5, 20.6)

---

## Hoofdstuk 21 — Rapporten

### Het scherm Rapporten

- [ ] **Rapporten openen.** [beheerder] Klik in het menu op **Rapporten**. Verwacht: *Genereer en analyseer rapporten voor je autoverhuurbedrijf*, de filterbalk met **Periode** (**Deze maand**), **Vergelijk met** (**Niet vergelijken**), **Voertuig** (**Alle voertuigen**), **Rapportbouwer** en **Onderhoudsanalyse**. Het tabblad **Overzicht** staat open. Er komt geen rode foutmelding. (hfst 21.1)
- [ ] **Periodes.** Open **Periode**. Verwacht: **Deze maand**, **Vorige maand**, **Volgende maand**, **Dit kwartaal**, **Dit jaar**, **Alle gegevens** en **Zelf kiezen**. Kies **Zelf kiezen**. Verwacht: de velden **Van** en **Tot**. Kies **Alle gegevens**. Verwacht: naast het veld *Alle gegevens*. (hfst 21.1)
- [ ] **Voertuig zoeken.** Klik op **Voertuig** en typ een stuk van een kenteken, of een merk. Verwacht: de auto staat in de lijst. Kies hem. Verwacht: de rapporten tonen alleen die auto; een rapport waar het voertuig niet telt, zegt dat. (hfst 21.1)
- [ ] **Kostencategorie alleen waar nodig.** Open **Kosten** → **Kosten per categorie**. Verwacht: het veld **Kostencategorie** met **Alle categorieën**. Open **Financieel** → **Bekeuringen**. Verwacht: het veld staat er niet (tenzij er een categorie gekozen is). (hfst 21.1)
- [ ] **Lijst links, rapport rechts.** Open **Voertuigen**. Verwacht: links de lijst met rapporten, rechts één rapport met zijn naam en **Afdrukken**. Klik op een ander rapport. Verwacht: dat rapport staat rechts. De adresbalk toont *?tab=vehicles&report=…*; de terugknop van de browser gaat terug. (hfst 21.1)
- [ ] **Laatst gekozen rapport onthouden.** Kies op **Voertuigen** **Bezetting per dag**. Ga naar **Overzicht** en weer naar **Voertuigen**. Log uit en weer in. Verwacht: **Bezetting per dag** staat weer open. (hfst 21.1)
- [ ] **Getallen in de lijst.** Verwacht: een rood getal achter **APK-keuring overzicht**, **Onderhoud en APK vooruit**, **Bekeuringen**, **Binnengekomen facturen**, **Portaalaanvragen** of **Bezorgen en ophalen** als daar iets openstaat. Verander de **Periode**. Verwacht: alleen het getal bij **Bezorgen en ophalen** verandert mee. (hfst 21.1)
- [ ] **Telefoon.** [telefoon of smal venster] Open **Rapporten** → **Voertuigen**. Verwacht: geen lijst links, maar een keuzemenu **Kies een rapport**. Het getal staat tussen haakjes, bijvoorbeeld *APK-keuring overzicht (1)*. (hfst 21.1)

### Overzicht

- [ ] **De acht getallen.** [beheerder] Open **Overzicht**. Verwacht: **Marge**, **Bezetting (% verhuurd)**, **Open bekeuringen**, **APK verlopen**, **Onderhoud te laat**, **Facturen ter controle**, **Te laat bezorgd** en **Open portaalaanvragen**, met *In deze periode* of *Alles wat nog openstaat* eronder. (hfst 21.2)
- [ ] **Klikken op een getal.** Klik op **Open bekeuringen**. Verwacht: tabblad **Financieel** met het rapport **Bekeuringen**. Probeer ook **Marge** (→ **Kosten en opbrengst per voertuig**) en **Facturen ter controle** (→ **Binnengekomen facturen**). (hfst 21.2)
- [ ] **Overzicht afdrukken.** Klik op **Overzicht** op **Afdrukken**. Verwacht: de acht getallen op één A4 in het voorbeeld. (hfst 21.2, 21.7)
- [ ] **Alleen wat je mag zien.** [account met Rapporten bekijken zonder Klantportaal bekijken] Verwacht: **Open portaalaanvragen** staat niet op **Overzicht** en het tabblad **Portaal** ontbreekt. (hfst 21.2, 21.11)

### De rapporten per tabblad

- [ ] **Kosten.** Verwacht: **Kosten per categorie** (met **Totale kosten**, **Gem. kosten per voertuig**, grafiek en **Kostenoverzicht per categorie**), **Kostentrends** (*Altijd de laatste 3 maanden.*) en **Kosten in deze periode**. (hfst 21.3)
- [ ] **Voertuigen.** [beheerder] Verwacht: **Voertuigbenutting** (tegel, grafiek en tabel samen), **Onderhoudskosten per voertuig**, **APK-keuring overzicht**, **Garantiestatus overzicht**, **Bezetting per dag**, **Onderhoud en APK vooruit**, **Stilstand in de werkplaats**, **Kilometerstanden vloot** en **Km-historie per voertuig**. (hfst 21.3)
- [ ] **Klanten.** Verwacht: **Klantimpactanalyse**, **Kostencategorieën per klant**, **Klantreserveringen in deze periode** en **Klantwaarde**. (hfst 21.3)
- [ ] **Transporten.** Verwacht: **Voertuigtransporten** met **Totale tolkosten**, **Openstaande klantfacturatie**, **Vermelde transporten**, **Alle types**, **Alle statussen** en een vinkje per regel. Er staat *Periode en voertuig gelden niet voor dit rapport.* (hfst 21.3)
- [ ] **Financieel.** Verwacht: **Kosten en opbrengst per voertuig** (**Omzet**, **Kosten**, **Marge**, de grafiek **Omzet versus kosten per voertuig** met de top 10 en de tabel met **CSV**), **Bekeuringen**, **Meer-km en brandstof** en **Transport en facturatie**. De marge telt altijd alle kosten. (hfst 21.3)
- [ ] **Fiscaal, Portaal en Kantoor.** Verwacht: **Fiscale check per maand**; **Portaalaanvragen** en **Wachtlijst**; **Ophaalrondes**, **Binnengekomen facturen**, **Bezorgen en ophalen** en **Schadechecks**. Bij portaal en postvak staat dat het voertuigfilter niet geldt. (hfst 21.3)

### Tabellen en Kolommen

- [ ] **Pagina's, zoeken en sorteren.** Open **Kosten** → **Kosten in deze periode** met **Periode** **Alle gegevens**. Verwacht: tien regels per pagina, **Per pagina** (10, 25, 50) en pijltjes. Typ in **Zoeken** een kenteken zonder streepjes. Verwacht: alleen de regels van die auto. Klik op een kolomkop. Verwacht: de volgorde draait om bij een tweede klik. (hfst 21.4)
- [ ] **Kolommen.** Klik op **Kolommen**. Verwacht: **Kolommen tonen** met een vinkje per kolom, **Extra velden** (**Kenteken**, **Merk**, **Model**, en **Klantnaam** waar dat past) en **Terug naar standaard**. Haal een kolom weg en zet **Merk** aan. Verwacht: de tabel verandert; de afdruk en de CSV volgen. De laatste kolom kun je niet uitzetten. (hfst 21.4)
- [ ] **Kolomkeuze onthouden.** Log uit en weer in. Verwacht: je kolomkeuze staat er nog. **Terug naar standaard** zet alles terug. (hfst 21.4)

### Doorklikken en dossier

- [ ] **Tegel.** Open **Financieel** → **Bekeuringen**. Klik op **Nieuw**. Verwacht: een venster met evenveel regels als het getal, met **Kolommen**, **CSV** en **Afdrukken**. (hfst 21.5)
- [ ] **Staaf en regel.** Open **Kosten per categorie**. Klik op een staaf en daarna op een regel in de tabel. Verwacht: het venster *Kosten per categorie · <categorie>* met de kosten van die categorie. (hfst 21.5)
- [ ] **Dossiervenster.** Klik in een lijst op een blauw kenteken. Verwacht: het venster *Auto · <kenteken>* met **Kenteken**, **Merk en model**, **APK**, **Km-stand** (alleen beheerder) en **Huidige huurder**. **Openen in nieuw tabblad** opent het voertuig in een nieuw browsertabblad; het rapport blijft staan. (hfst 21.5)

### Vergelijken

- [ ] **Vergelijk met.** Kies **Vorige periode**. Verwacht: onder **Marge**, **Bezetting (% verhuurd)** en **Te laat bezorgd** het oude getal (*was …*) en het verschil met ↑ of ↓; groen is beter, rood slechter, grijs gelijk. Was het oude getal 0, dan *nieuw*. **Open bekeuringen** en **APK verlopen** krijgen geen vergelijking. (hfst 21.6)
- [ ] **Vergelijken bij Alle gegevens.** Kies **Periode** **Alle gegevens**. Verwacht: **Vergelijk met** is grijs met *Bij Alle gegevens is er niets om mee te vergelijken.* (hfst 21.6)

### Afdrukken en CSV

- [ ] **Afdrukvoorbeeld.** Open **Voertuigen** → **Voertuigbenutting**. Klik op **Afdrukken**. Verwacht: links **Wat afdrukken** met **Tegels**, **Grafiek**, **Tabel**, **Alle regels** en **Liggend**; rechts het voorbeeld met bedrijfsnaam, rapportnaam en periode. Zet **Grafiek** uit en **Liggend** aan. Verwacht: het voorbeeld verandert meteen. Klik op **Afdrukken**. Verwacht: het afdrukvenster van de browser, met *Gedrukt op* en een paginanummer onderaan. (hfst 21.7)
- [ ] **Alleen deze pagina.** Zoek in een tabel en klik op **Afdrukken**. Kies **Alleen deze pagina**. Verwacht: alleen de regels die je op het scherm ziet. (hfst 21.7)
- [ ] **Alleen aangevinkte.** Open **Transporten**. Vink één regel aan. Klik op **Afdrukken** en kies **Alleen aangevinkte**. Verwacht: alleen die regel in het voorbeeld. (hfst 21.7)
- [ ] **CSV.** Klik bij **Kosten en opbrengst per voertuig** op **CSV**. Verwacht: een bestand in Downloads met alle regels van de periode, niet alleen de pagina. (hfst 21.7)

### De rapportbouwer

- [ ] **Openen.** Klik op **Rapportbouwer**. Verwacht: **Aangepaste rapportbouwer** met **Bouwer** en **Opgeslagen rapporten**, **Gegevensbronnen** (**Voertuigen** aangevinkt), **Opslaan**, **Rapport uitvoeren** (grijs zonder kolom) en **Filter toevoegen**. [beheerder] ziet ook **Km-historie**. (hfst 21.8)
- [ ] **Bronnen per vinkje.** [account met Rapporten bekijken en Boetes bekijken] Verwacht: geen **Transporten**, **Werkplaatsbezoeken**, **Schadechecks** en **Km-historie**. (hfst 21.8, 21.11)
- [ ] **Gekoppelde velden.** Haal **Voertuigen** weg en vink **Bekeuringen** aan. Verwacht: **Gekoppeld: Voertuig**, **Gekoppeld: Klant**, **Gekoppeld: Reservering** en **Gekoppeld: Bestuurder**. Klik op **+ Kenteken** onder **Gekoppeld: Voertuig**. Verwacht: de kolom **Voertuig · Kenteken**. (hfst 21.8)
- [ ] **Rekensom.** Klik op **Berekend veld toevoegen**. Typ **Naam** *Incl. btw*, klik **Totaalbedrag**, **×**, typ *1,21* bij **Getal** en klik **Getal toevoegen**. Kies **Soort** **Bedrag** en **Opslaan**. Klik op **+ Incl. btw**. Voer uit. Verwacht: een kolom met het bedrag × 1,21 in euro's. (hfst 21.8)
- [ ] **Procent.** Maak een rekensom met **Soort** **Procent**. Verwacht: de uitleg *Bijvoorbeeld Marge ÷ Omzet geeft 25 %.* en in de resultaten bijvoorbeeld *17,36 %*. Delen door nul geeft een leeg vakje, geen fout. (hfst 21.8)
- [ ] **Als-dan regel.** Maak een **Als-dan regel**: **Als** **Totaalbedrag** **groter dan** *100* **dan** *Hoog* **anders** *Laag*. Verwacht: per regel *Hoog* of *Laag*. (hfst 21.8)
- [ ] **Totaalregel.** Kies bij **Totaalbedrag** **Totaalregel** **Som**. Voer uit. Verwacht: onderaan de regel **Totaal** met de som; ook in **Exporteren naar CSV** en de afdruk. (hfst 21.8)
- [ ] **Groeperen per maand.** Kies **Groeperen op** **Datum overtreding**, vink **Per maand** aan en kies bij de bedragen **Berekening** **Som**. Voer uit. Verwacht: één regel per maand en het blok **Grafiek** met **Soort grafiek** (**Staaf**, **Lijn**, **Taart**). Een kolom zonder berekening buiten de groep geeft een melding met de naam van die kolom. (hfst 21.8)
- [ ] **Opslaan op een tabblad.** Klik op **Opslaan**. Verwacht: **Rapport opslaan** met **Rapportnaam \***, **Omschrijving**, **Tabblad** en **Periodeveld**. Kies **Financieel** en **Datum overtreding**. Klik op **Rapport opslaan**. Sluit de bouwer. Verwacht: het rapport staat onderaan op **Financieel**, met een sleuteltje, **Bewerken**, **CSV**, **Afdrukken** en de totaalregel. De **Periode** werkt op de datum van de overtreding. (hfst 21.8)
- [ ] **Bewerken.** Klik bij het eigen rapport op **Bewerken**. Verwacht: **Bewerken: <naam>** met **Stop met bewerken**. Klik op **Opslaan**. Verwacht: **Opslaan** en **Opslaan als nieuw**. **Opslaan** werkt het rapport bij; **Opslaan als nieuw** maakt een tweede. (hfst 21.8)
- [ ] **Opgeslagen rapporten.** Klik op **Opgeslagen rapporten**. Verwacht: per rapport het aantal kolommen en filters, de bron, het tabblad, **Gebruiken als begin**, **Bewerken**, **Uitvoeren** en het prullenbakje, dat eerst **Rapport verwijderen?** vraagt. Doe dit alleen op je eigen oefenrapport. (hfst 21.8)
- [ ] **Eigen rapport volgt het recht van de bron.** [beheerder] Zet een rapport met de bron **Km-historie** op een tabblad. Log in met een ander account met **Rapporten bekijken**. Verwacht: het rapport staat niet op het tabblad en niet bij **Opgeslagen rapporten**. (hfst 21.8, 21.11)
- [ ] **Opslaan zonder recht.** [account met alleen Rapporten bekijken] Verwacht: **Opslaan**, **Bewerken** en het prullenbakje werken niet. (hfst 21.11)

### Onderhoudsanalyse en km-historie

- [ ] **Onderhoudsanalyse.** Klik op **Onderhoudsanalyse**. Verwacht: **Analyse onderhoudskosten** met **Alle tijd** en **Alle merken**, de tellers en de tabbladen **Overzicht**, **Merkvergelijking**, **Voertuigdetails** en **Trends**. Alleen **Onderhoud**, **Banden** en **Remmen** tellen. **Kosten per km** alleen bij **Alle tijd**. (hfst 21.9)
- [ ] **Km-historie in het voertuigscherm.** [beheerder] Open een voertuig → **Km-historie**. Verwacht: **Van** en **Tot en met**, **Gereden km**, **Gemiddeld per maand**, **Vrije km**, **Waarschuwingen**, de grafiek **Km-stand in de tijd**, **Afdrukken** en **CSV**. **Afdrukken** opent hetzelfde voorbeeld als bij de rapporten. Een ander account ziet het tabblad niet. (hfst 21.10)
- [ ] **Km alleen beheerder.** [account met Rapporten bekijken en Voertuigen bekijken] Verwacht: geen **Kilometerstanden vloot** en **Km-historie per voertuig** op **Voertuigen**, en de km-stand ontbreekt in het dossiervenster. (hfst 21.11)

---

## Na de uitrol (beheerder)

Deze regels doe je **na** de uitrol op productie, in deze volgorde. Ze komen uit besluit B-43 en de eindbeoordeling. Het zijn de enige regels in deze lijst die iets in de echte gegevens veranderen. Ze zijn bedoeld voor de beheerder.

### Instellingen die je zelf moet zetten

- [ ] **Bedrijfsnaam opslaan.** [beheerder] Ga naar **App-instellingen** → **Bedrijfsregels** → **Bedrijfsnaam**. Controleer de naam (standaard *Autolease Lam*). Klik op **Bedrijfsnaam opslaan**. Verwacht: *De bedrijfsnaam is opgeslagen.* **Doe dit echt:** tot dit moment zeggen de portaalmails en de meldingen in het klantenportaal nog *Lam Groep*. (hfst 10.3)
- [ ] **Containerlog na het opslaan van de bedrijfsnaam.** Kijk in het containerlog. Verwacht: de regel `📧 portal e-mail templates: n unedited template(s) now follow the company name setting`. (B-43)
- [ ] **Portaalmail controleren.** Stuur een portaaluitnodiging of wachtwoord-reset naar je eigen adres. Verwacht: de mail noemt de nieuwe bedrijfsnaam. (hfst 10.3)
- [ ] **Tijdzone controleren.** Ga naar **App-instellingen** → **Bedrijfsregels** → **Tijdzone van het kantoor**. Verwacht: *Europe/Amsterdam*. Niet wijzigen. (hfst 10.3)
- [ ] **Tijd op een gedrukt document.** Maak een contract of transportrapport. Controleer de tijd. Verwacht: de Nederlandse klok. (hfst 8.2)

### Voertuigtypes

- [ ] **RDW-controle.** Ga naar **App-instellingen** → **Voertuigen** → **RDW-voertuigtypes**. Klik op **Controleren**. Wacht tot *Controleren… 12 van 99 voertuigen* klaar is. Doe dit **niet** terwijl een collega ook **Controleren** draait. (hfst 4.13)
- [ ] **De lijst helemaal lezen.** Lees de hele lijst (*Type: oud → nieuw*). Lees ook de typen die iemand ooit met de hand zette. Hoort een auto zijn type te houden? Noteer hem. Na **Toepassen** zet je hem met **Bewerken** terug. (hfst 4.13)
- [ ] **Toepassen.** Klik pas daarna op **Toepassen**. Verwacht: **RDW-voertuigtypes toepassen?**. Klik op **Toepassen**. Verwacht: **RDW-voertuigtypes toegepast** met de tekst *7 voertuigen aangepast, 0 overgeslagen (type intussen gewijzigd).* (hfst 4.13)

### Log en database

- [ ] **Containerlog bij de eerste start.** Kijk in het containerlog. Verwacht: de regel `User foreign keys set to ON DELETE SET NULL: 20 key(s) changed` (marker `migration:d19_user_fk_set_null`). Staat er een regel `⚠️ D19: …`? Dan is een koppeling overgeslagen. Die wordt bij elke start opnieuw geprobeerd. Meld dat. (B-43)
- [ ] **De app start zonder fouten.** Er zijn vijf nieuwe kolommen via `schema-columns.json` (`expenses.source`, `expenses.source_ref`, `vehicles.maintenance_status_block_id`, `fines.customer_notified_at`, `users.last_login_at`). Controleer dat de app zonder fouten opstart. (B-43)
- [ ] **Bekeuringsstatussen.** Draai `SELECT status, count(*) FROM fines GROUP BY 1`. Verwacht: **Doorbelast**, **Betaald** en **Betwist** komen alleen voor bij oude bekeuringen die ze mogen houden. (B-43)
- [ ] **Tijdkolommen (B-22) zitten niet in deze uitrol.** Het stappenplan staat in `docs/superpowers/specs/2026-10-11-timestamptz-kolommen.md`. Dat blijft een aparte actie met jou erbij: back-up, kopie, rapport, onderhoudsvenster, één keer `TIMESTAMPTZ_MIGRATION=apply`, en daarna drie bekende tijden controleren. (B-43)

### Collega's en rechten

- [ ] **Wachtwoordregel melden aan collega's.** Meld het volgende. Een wachtwoord heeft minimaal 10 tekens, met een hoofdletter, een kleine letter en een cijfer. Dit geldt alleen bij een nieuw wachtwoord. Bestaande wachtwoorden blijven werken. Ieder wijzigt zijn eigen wachtwoord via je naam → **Profiel** → **Wachtwoord wijzigen**. (hfst 10.2)
- [ ] **Vinkjes voor managers.** Controleer dat de bestaande managers **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren** hebben. Dat is eenmalig automatisch gedaan. Bij elk ander account zet je ze zelf aan. (hfst 15.16)
- [ ] **Laatste beheerder.** Controleer dat er minstens twee actieve beheerders zijn. (hfst 10.2)
- [ ] **De open vraag D21.** Mag een collega met **Gebruikers beheren** die zelf geen beheerder is, een beheerder verwijderen of degraderen? Via de app kan het niet. Via de API kan het wel. Er is een nieuw besluit nodig. Noteer jouw keuze. (B-43)

### Een dag na de uitrol

- [ ] **Geweigerde pogingen.** [beheerder] Log een tweede keer in. Verwacht: de balk *Sinds je vorige inlog …* op het **Dashboard**. **Bekijken** laat zien wie wat probeerde. Een rij pogingen op hetzelfde onderdeel wijst eerder op een vergeten vinkje dan op rondsnuffelen. (hfst 10.2)
- [ ] **Back-up.** Open **Back-upbeheer**. Verwacht: **Laatste back-up** is van de afgelopen nacht (02:00). Er staat geen **Laatste back-upfout:**. (hfst 10.4)
- [ ] **Nachtelijke taken in de nieuwe klok.** Controleer de volgende ochtend dat de back-up, de APK-scan, de fiscale run en het postvak om de verwachte tijd draaiden. (hfst 10.3)

---

## De controles die alleen jij in de browser kunt doen

Dit zijn de handmatige browsercontroles die de eindbeoordeling noemt. Ze vragen een echte browsersessie. Ze kunnen niet automatisch getest worden.

- [ ] **Balk met geweigerde pogingen.** Log een tweede keer in als beheerder. Verwacht: de balk staat bovenaan het **Dashboard**. **Bekijken** opent **Geweigerde pogingen**. **(nieuw)** (hfst 10.2)
- [ ] **Scanscherm Terug uit onderhoud.** Scan een auto die op **Binnen** staat. Verwacht: het venster **Onderhoud afronden** opent. **(nieuw)** (hfst 18.4, 7.5)
- [ ] **Nu ophalen vanaf een klantkaart.** Ga naar **Klanten** → **Bekijken** → **Nieuwe reservering**. Boek. Verwacht: de melding met **Nu ophalen** (twaalf seconden, linksonder, als het venster zichzelf sluit). Die opent het ophaalvenster voor déze reservering. **(nieuw)** (hfst 5.3)
- [ ] **Portaalmail na het opslaan van de bedrijfsnaam.** Zie "Na de uitrol". **(nieuw)** (hfst 10.3)
- [ ] **De tijd op een gedrukt document.** Controleer een tijd op een gedrukt contract of schadeformulier. **(nieuw)** (hfst 8.2)

---

## Afsluiting

Ga na afloop door je regels. Staan er nog open regels? Dan hoort daar een notitie bij met wat je zag. Alles wat je als fout hebt aangemerkt, geef je door aan degene die de app bijhoudt. Is alles afgestreept, of bewust opengelaten met een reden? Dan kun je de uitrol als geaccepteerd beschouwen.

| | |
|---|---|
| Gecontroleerd door | |
| Datum | |
| Omgeving (test of productie) | |
| Open punten | |
