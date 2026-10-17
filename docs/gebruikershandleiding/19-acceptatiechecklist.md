# 19. Acceptatiechecklist

Dit is de lijst waarmee je de hele app zelf naloopt voordat je hem vrijgeeft, of nadat hij is
uitgerold. Hij volgt de handleiding hoofdstuk voor hoofdstuk (1 tot en met 18): wat de handleiding
zegt dat de app doet, probeer je hier één keer zelf uit en vink je af.

Elke regel heeft dezelfde opbouw: **wat je test**, het **klikpad en wat je doet**, het **verwacht
resultaat** (met de tekst van de knop of de melding zoals die in de app staat) en tussen haakjes
het onderdeel van de handleiding waar het staat. Zie je iets anders dan er staat, noteer dan de regel,
wat je zag en maak er een schermafbeelding van. Dan kan de handleiding worden aangepast, of de app
worden hersteld als jij vindt dat hij fout is (bij verschil geldt de app).

## Hoe je dit gebruikt

- **Streep af in je eigen kopie.** Verander `- [ ]` in `- [x]` in een tekstverwerker of editor (een
  voorvertoning toont het als een aangevinkt vakje), of druk het af en streep met een pen af.
- **(nieuw)** achter een regel betekent: dit is nieuw in deze uitrol. Die regels zijn het
  belangrijkst om te zien. Alles zonder dat woord werkte al, en hoort nog steeds zo te werken.
- **[beheerder]**, **[balie]**, **[werkplaats]** enzovoort tussen vierkante haken zegt met welk
  account je de regel moet doen (zie "Welke accounts je nodig hebt" hieronder). Staat er niets,
  dan kan elk account met genoeg rechten het.
- **(hfst 5.7)** achter een regel verwijst naar hoofdstuk 5, paragraaf 5.7 van de handleiding.
- Een regel die je **niet kunt doen** omdat de situatie er niet is (bijvoorbeeld "een klant zonder
  e-mailadres"), laat je open staan met een korte notitie in de kantlijn. Niet afstrepen.

## Zo voorkom je dat je echte gegevens verandert

- Doe dit bij voorkeur op de **testomgeving** (de lokale test- of acceptatiedatabase). Heb je geen
  testomgeving, maak dan **oefengegevens**: zet *OEFEN* voor de naam van elke klant die je aanmaakt
  en in de notities van elke reservering, en ruim ze aan het eind op via de prullenbak.
- **E-mail:** vul bij het testen van mail altijd **je eigen e-mailadres** in. Stuur nooit een testmail
  naar een echte klant.
- **Definitief verwijderen** en **Prullenbak leegmaken** doe je alleen op je eigen oefengegevens.
- Het item over de blokkade na vijf foute inlogpogingen kost je een kwartier wachten. Doe dat
  één keer, op de testomgeving.
- **Back-up terugzetten** test je niet op productie. Dat item staat als "alleen lezen" in de lijst.

## Welke accounts je nodig hebt

Maak vooraf deze accounts aan (**Gebruikers** → **Gebruiker toevoegen**, wachtwoord minimaal 10
tekens met een hoofdletter, een kleine letter en een cijfer). De vinkjes staan in hoofdstuk 15,
paragraaf 15.7.

| Naam in deze lijst | Rol en vinkjes |
|---|---|
| **[beheerder]** | De rol **Beheerder** (mag alles; **Kilometerverlaging goedkeuren** staat apart aan) |
| **[balie]** | Dashboard bekijken · Voertuigen bekijken · Klanten bekijken · Reserveringen beheren · Documenten bekijken · Klantportaal bekijken. Voeg voor de regels over terugdraaien en de prullenbak de vinkjes **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren** toe aan een tweede balie-account, zodat je ook de grijze knop zonder die vinkjes ziet |
| **[kantoor]** | Verhuurmedewerker: Dashboard bekijken · Voertuigen beheren · Klanten beheren · Reserveringen beheren · Documenten bewerken en genereren · Schadecontroles beheren · Klantportaal beheren · Kosten beheren · Boetes beheren · Kilometerverlaging goedkeuren · Overdracht terugdraaien · Opgehaalde huur annuleren of verwijderen · Prullenbak beheren |
| **[werkplaats]** | Voertuigen beheren · Onderhoud beheren · Kosten beheren · Reserveringen bekijken · Voertuigen bekijken |
| **[alleen Voertuigen beheren]** | Alleen **Voertuigen beheren** (een scanaccount) |
| **[kijker]** | Dashboard bekijken · Voertuigen bekijken · Klanten bekijken · Reserveringen bekijken |
| **[zonder Prullenbak beheren]** | Een account met Reserveringen beheren maar zonder **Prullenbak beheren** |

---

## Hoofdstuk 1 — Snel aan de slag

### Inloggen en je wachtwoord

- [ ] **Inloggen.** Open het adres van de app → **Gebruikersnaam** → **Wachtwoord** → **Inloggen** (of Enter). Verwacht: je staat op het **Dashboard**. (hfst 1.1)
- [ ] **Fout wachtwoord.** Typ één keer een fout wachtwoord → **Inloggen**. Verwacht: *Ongeldige gebruikersnaam of wachtwoord*. De app zegt niet welke van de twee fout is. Doe dit maximaal twee keer. (hfst 1.1)
- [ ] **Blokkade na vijf pogingen** (alleen testomgeving; je zit daarna een kwartier vast). Vijf keer achter elkaar een fout wachtwoord. Verwacht: *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.* (hfst 1.1, 12.1)
- [ ] **Eigen wachtwoord, de hint.** Rechtsboven je naam → **Profiel** → tabblad **Wachtwoord**. Verwacht onder het veld: *Minimaal 10 tekens, met hoofdletter, kleine letter en cijfer*. **(nieuw)** (hfst 1.1, 10.2)
- [ ] **Wachtwoord van 9 tekens.** Vul **Huidig wachtwoord**, een nieuw wachtwoord van 9 tekens en de bevestiging in → **Wachtwoord wijzigen**. Verwacht: *Het nieuwe wachtwoord heeft minimaal 10 tekens nodig.* en er wordt niets gewijzigd. **(nieuw)** (hfst 1.1, 10.2)
- [ ] **Wachtwoord zonder hoofdletter of cijfer.** Probeer een wachtwoord van 10 kleine letters. Verwacht: een melding dat het wachtwoord een kleine letter, een hoofdletter en een cijfer nodig heeft (*Gebruik een kleine letter, een hoofdletter en een cijfer.*). **(nieuw)** (hfst 1.1, 10.2)
- [ ] **Bevestigingsveld leeg.** Laat **Bevestig nieuw wachtwoord** leeg. Verwacht: *Bevestig je nieuwe wachtwoord.* (hfst 1.1)
- [ ] **Twee verschillende wachtwoorden.** Verwacht: *De wachtwoorden komen niet overeen.* Wijzig daarna het nieuwe wachtwoord: de app controleert het bevestigingsveld opnieuw. (hfst 1.1)
- [ ] **Wachtwoord echt wijzigen** (op een testaccount). Een geldig nieuw wachtwoord (bijvoorbeeld `OefenWacht1x`). Verwacht: *Gelukt* — *Je wachtwoord is succesvol gewijzigd!* Log uit en log in met het nieuwe wachtwoord. Zet het daarna terug. **(nieuw)** (hfst 1.1)

### Het hoofdscherm

- [ ] **Menu van de beheerder.** [beheerder] Verwacht links: **Dashboard · Voertuigen · Scannen · Klanten · Klantenportaal · Reserveringen · Onderhoud · Kosten · Documenten · Transporten · Communicatie · Rapporten**. (hfst 1.2)
- [ ] **Menu van een beperkt account.** [kijker] Je ziet alleen de items waar je rechten voor hebt; **Onderhoud**, **Kosten** en **Documenten** ontbreken. Er is geen foutmelding. (hfst 1.2, 15.8)
- [ ] **Bolletje achter Klantenportaal.** Staat er een rood getal, dan zijn dat de ongelezen portaalmeldingen. (hfst 1.2)
- [ ] **De balk bovenin.** Verwacht van links naar rechts: de naam van het scherm, het zoekveld **Zoeken...**, het belletje en je initialen en naam. Is er iets openstaand in het portaal, dan staat er ook een tegel zoals *2 nieuwe aanvragen · 7 meldingen · Klantenportaal*. (hfst 1.2)
- [ ] **Een venster sluiten.** Open een klant met **Bekijken** en sluit met **Sluiten**, met **Terug**, met het kruisje en met Esc. Verwacht: het onderliggende scherm blijft staan. (hfst 1.2)

### Zoeken

- [ ] **Zoeken op kenteken.** Klik in **Zoeken...** → typ een half kenteken zonder streepjes. Verwacht na een korte pauze: een groep **Voertuigen** met de auto. (hfst 1.3)
- [ ] **Minimaal twee tekens.** Typ één teken. Verwacht: er gebeurt niets. (hfst 1.3)
- [ ] **Zoeken op klant.** Typ een naam of e-mailadres. Verwacht: de groepen **Klanten** en **Reserveringen**. (hfst 1.3)
- [ ] **Zoeken op contractnummer.** Typ het nummer van een opgehaalde huur. Verwacht: de reservering, met *Contractnr. …* bij het resultaat. (hfst 1.3)
- [ ] **Zoeken op merk of model.** Verwacht: de voertuigen van dat merk. (hfst 1.3)
- [ ] **Sneltoetsen voor zoeken.** Druk op `/` en op `Ctrl+K`. Verwacht: de cursor staat in het zoekveld. (hfst 1.3, 2.11)
- [ ] **Alle resultaten.** Zoek iets met veel treffers → **Bekijk alle resultaten** (of Enter). Verwacht: een groter venster *Zoekresultaten voor "…"*. (hfst 1.3)
- [ ] **Een resultaat openen.** Klik een resultaat aan. Verwacht: het opent in een venster over je scherm heen. (hfst 1.3)

### De taken die je het vaakst doet

- [ ] **Wat er vandaag meegaat.** **Reserveringen** → het vakje van vandaag. Verwacht: per auto het kenteken met **uit** of **in**, en de klant. (hfst 1.4, 5.1)
- [ ] **Een auto meegeven, de hele weg.** Zie de uitgebreide regels bij hoofdstuk 5 (5.7). Hier: **Dashboard** → **Snelle acties** → **Ophalen starten** → scan of typ het kenteken. Verwacht: het venster **Ophaalproces starten**. (hfst 1.4)
- [ ] **Geen ophaling klaar.** Scan een auto zonder ophaling. Verwacht: geen venster, alleen de gegevens van de auto. (hfst 1.4)
- [ ] **Een auto terugnemen, de hele weg.** Zie 5.8. Hier: **Innemen starten** → scan een opgehaalde auto. Verwacht: **Inleverproces starten**. (hfst 1.4)
- [ ] **Lagere kilometerstand bij het inleveren.** Vul een stand in die lager is dan bij het ophalen. Verwacht: *Kilometerstand bij inleveren kan niet lager zijn dan bij ophalen (… km).* (hfst 1.4, 5.8)
- [ ] **Een nieuwe klant, kort.** **Klanten** → **Klant toevoegen** → naam en **Klanttype** → **Klant toevoegen**. Verwacht: *Klant succesvol aangemaakt*. Uitgebreid bij hoofdstuk 3. (hfst 1.4, 3.3)
- [ ] **Een nieuwe reservering, kort.** Druk op `N` → datums, voertuig, klant → **Reservering aanmaken**. Verwacht: *Reservering succesvol aangemaakt*, er is geen statusveld en er staat een knop **Nu ophalen**. **(nieuw)** (hfst 1.4, 5.3)
- [ ] **Gele balk bij onderhoud.** Boek een auto met gepland onderhoud in die periode. Verwacht: een gele balk *Let op: dit voertuig staat in deze periode ingepland voor onderhoud (… t/m …). Opslaan mag; het onderhoudsblok blijft staan.* (hfst 1.4, 5.3)
- [ ] **Rode balk bij een bezette auto.** Boek een auto die in die periode al gereserveerd is. Verwacht: een rode balk en een grijze knop **Reservering aanmaken**. (hfst 1.4, 5.3)
- [ ] **Een voertuig opzoeken.** **Voertuigen** → **Bekijken**. Verwacht: **Voertuiggegevens** met de tabbladen **Algemeen**, **Kosten**, **Documenten**, **Reserveringen**, **Onderhoud**, **Geschiedenis**, **Fiscaal**; een klik ergens op de regel opent de auto ook. (hfst 1.4, 4.2)
- [ ] **Een reservering opzoeken.** Zoekveld → kenteken, klantnaam of contractnummer → klik onder **Reserveringen** op de regel. Verwacht: **Reserveringsdetails**. (hfst 1.4, 5.4)

### Uitloggen en de sessie

- [ ] **Uitloggen.** Rechtsboven je naam → **Uitloggen**. Verwacht: je staat weer op het inlogscherm. (hfst 1.5)
- [ ] **Waarschuwing voor het verlopen van de sessie** (laat het scherm 14 minuten met rust). Verwacht: het venster **Sessie verloopt binnenkort** met een aftelling en de knoppen **Ingelogd blijven** en **Nu uitloggen**. (hfst 1.5)
- [ ] **Sessie verlopen.** Doe niets na die waarschuwing. Verwacht: *Sessie verlopen* — *Je bent uitgelogd wegens inactiviteit*. (hfst 1.5, 12.1)
- [ ] **Niet doen in de eerste week.** Probeer een bestaande reservering "even" op een andere status te zetten. Verwacht: dat kan niet: het formulier heeft geen statuslijstje. **(nieuw)** (hfst 1.6, 5.6)

---

## Hoofdstuk 2 — Navigatie

### Het menu

- [ ] **Elk menu-item opent.** [beheerder] Klik alle twaalf de items één voor één aan. Verwacht: elk scherm laadt zonder rode melding. (hfst 2.1)
- [ ] **Geen menu-item Bekeuringen.** [kantoor met Boetes beheren] Verwacht: **Bekeuringen** staat niet in het menu; de lijst open je met de knop **Bekeuringen** bovenaan **Klantenportaal**. (hfst 2.1, 2.6)
- [ ] **Instellingen, gebruikers en back-up staan niet in het menu.** Verwacht: ze staan rechtsboven achter je naam onder het kopje **Beheer**, en alleen voor [beheerder]. (hfst 2.1, 2.10)
- [ ] **Smal scherm.** Maak het browservenster smal. Verwacht: het menu klapt open met het knopje linksboven. (hfst 2.1)

### Dashboard

- [ ] **Back-upbalk.** Verwacht: staat er een balk *Geen geverifieerde back-up bekend* of *Geen geverifieerde back-up in … uur*, dan is er iets te melden aan de beheerder. (hfst 2.2)
- [ ] **Balk met geweigerde pogingen.** [beheerder] Zie hoofdstuk 10, onderdeel Geweigerde pogingen, in deze lijst. **(nieuw)** (hfst 2.2, 10.2)
- [ ] **Snelle acties.** Verwacht: vijf grote tegels (**Ophalen starten**, **Innemen starten**, **Scannen**, **Nieuwe reservering**, **Schadecheck starten**). Zie ook 2.9. (hfst 2.2)
- [ ] **Vier signaalblokken.** Verwacht: **Beschikbare voertuigen**, **APK verloopt binnenkort**, **Achterstallige verhuringen**, **Garantie verloopt binnenkort**. (hfst 2.2)
- [ ] **Achterstallig, het oogje.** Klik het oogje achter een regel. Verwacht: de reservering opent. (hfst 2.2)
- [ ] **Beheer vervangende voertuigen.** Verwacht: tabbladen **Nog te bepalen**, **Aankomend**, **Actief**; op **Nog te bepalen** de knop **Voertuig toewijzen**. (hfst 2.2)
- [ ] **Recente kosten.** Verwacht: de knop **Alles bekijken** staat er alleen voor wie **Kosten beheren** heeft; een categorie staat in het Nederlands (**Banden**, niet *Tires*). (hfst 2.2)
- [ ] **Aankomende reserveringen en kalender.** Verwacht: een tabel met **Voertuig**, **Klant**, **Periode**, **Acties** en een kleine maandkalender met **Reservering toevoegen**. (hfst 2.2)

### Voertuigen

- [ ] **Knoppen rechtsboven.** Verwacht: **Verwijderde voertuigen**, **Barcodeboek**, **Sleutelkast-audit**, **Reservesleutelkast-audit**, **Bulk importeren**, **Voertuig toevoegen**. (hfst 2.3)
- [ ] **Voertuigenpark.** Verwacht: een lijst met kenteken, statuslabel, merk en model, APK-datum en per regel **Bekijken**, **Reserveren** of **Verhuur bekijken**. (hfst 2.3)
- [ ] **Statuslabels.** Zoek een voorbeeld van *Beschikbaar*, *Gepland*, *Verhuurd*, *Reparatie nodig* en *Niet voor verhuur*. (hfst 2.3, 4.6)
- [ ] **Niet voor verhuur is niet te reserveren.** Verwacht: **Reserveren** is grijs met *Voertuig is niet beschikbaar voor verhuur*. (hfst 4.1)
- [ ] **Beschikbaar overal gelijk.** Een auto die in onderhoud staat, telt nergens als beschikbaar, ook niet op het dashboard. (hfst 2.3, 4.6)
- [ ] **De acht prullenbakken.** Controleer dat elk scherm zijn eigen prullenbak heeft: **Verwijderde voertuigen**, **Verwijderde klanten**, **Verwijderde reserveringen**, **Verwijderd onderhoud**, **Verwijderde transporten**, **Verwijderde kostenposten** **(nieuw)**, **Prullenbak** bij de bekeuringen en **Verwijderde chauffeurs** **(nieuw)**. (hfst 2.3, 10.6)
- [ ] **Prullenbak grijs zonder vinkje.** [zonder Prullenbak beheren] Verwacht: de knop **Verwijderde voertuigen** staat er, maar is grijs, met uitleg. (hfst 2.3, 4.12)

### Scannen

- [ ] **Scanscherm.** `S` of **Scannen**. Verwacht: **Barcode scannen** — *Scan een sleutellabel met een barcodescanner of camera, of typ de code handmatig.* (hfst 2.4, 18.1)
- [ ] **Een code typen.** Typ een `VEH-…`-code, een `RES-…`-code en een kenteken. Verwacht: het voertuig of de reservering met status, APK-datum, kilometerstand, brandstof en de acties. (hfst 2.4, 18.2)
- [ ] **Recente scans.** Verwacht: onderaan staan je laatste scans. (hfst 2.4, 18.5)

### Klanten

- [ ] **Klantendatabase.** Verwacht: **Klant toevoegen** en **Verwijderde klanten** rechtsboven; zoekveld, sorteerkeuze, **Filters**; kolommen **Naam**, **E-mail**, **Telefoon**, **Plaats**; per regel **Bekijken**, **Nieuwe reservering**, **Verwijderen**. (hfst 2.5, 3.1)
- [ ] **Klantkaart.** **Bekijken**. Verwacht: **Klantgegevens** met de tabbladen **Persoonlijke gegevens**, **Chauffeurs**, **Actieve verhuringen**, **Geschiedenis**, **Portaal** en onderaan **Geblokkeerde voertuigen** met de knop **Voertuig blokkeren**; een klik ergens op de regel opent de klant ook. (hfst 2.5, 3.2)

### Klantenportaal en bekeuringen

- [ ] **Scherm Klantenportaal beheren.** Verwacht: **Bekeuringen**, **Brieven scannen**, **Account uitnodigen**, acht tegels (**Aanvragen**, **Onderhoud**, **Bekeuringen**, **Klanten**, **Accounts**, **Voertuigen online**, **Blacklist**, **Activiteit**) en vier panelen (**Aandacht nodig**, **Meldingen**, **Aankomende reserveringen**, **Klanten**). (hfst 2.6)
- [ ] **Een bekeuring openen.** Tegel **Bekeuringen** → klik een regel. Verwacht: het bedrag, de **Administratiekosten**, het **Totaal**, de klant, de reservering en de bestuurder. (hfst 2.6)
- [ ] **Administratiekosten wijzigen.** Wijzig het bedrag → **Opslaan** → sluit en open de bekeuring opnieuw. Verwacht: het bedrag is bewaard. (hfst 2.6)
- [ ] **Opmaak.** Verwacht: bedragen als € 95,00, tijden zonder seconden, kentekens met streepjes. (hfst 2.6)
- [ ] **Bekeuring annuleren.** Open een bekeuring → **Bekeuring annuleren**. Verwacht: *Bekeuring PT-99-ZY van € 95,00 annuleren? Je kunt hem daarna weer heractiveren.* met **Nee, laten staan**. Kies **Nee, laten staan** en dan nog een keer bevestigen: *Bekeuring geannuleerd.* (hfst 2.6)
- [ ] **Bekeuring heractiveren.** Verwacht: *Bekeuring heractiveerd.* (hfst 2.6)
- [ ] **Wijzigingen verwerpen in een bekeuring.** Typ iets en sluit het venster. Verwacht: **Wijzigingen verwerpen?** (hfst 2.6)
- [ ] **Nieuwe bekeuring en Brieven scannen.** Beide knoppen hebben uitleg in het venster en een tekstje bij de muis. (hfst 2.6)
- [ ] **Alleen registreren.** In het filter **Alle statussen** staan alleen **Niet gekoppeld**, **Gekoppeld** en **Geannuleerd**; **Doorbelast**, **Betaald** en **Betwist** ontbreken (behalve bij oude bekeuringen die ze al hadden). **(nieuw)** (hfst 2.6)
- [ ] **Geen automatische mail.** Voer een bekeuring in, lees er een in of koppel er een aan een klant. Verwacht: de klant ontvangt niets (kijk in het **E-maillogboek** onder **Communicatie**). **(nieuw)** (hfst 2.6, 9.1)
- [ ] **Klant informeren.** Open een gekoppelde bekeuring → **Klant informeren**. Verwacht: **Klant informeren?** met *Een e-mail over bekeuring … gaat naar …, en de klant krijgt een melding in het portaal.* Kies **Nee, niet sturen**: er gebeurt niets. **(nieuw)** (hfst 2.6)
- [ ] **Klant informeren, versturen.** [kantoor, mailadres = je eigen adres] Bevestig. Verwacht: **Klant geïnformeerd.**, in het venster *Klant geïnformeerd op <datum>*, de mail komt aan en de knop heet nu **Opnieuw informeren**. **(nieuw)** (hfst 2.6)
- [ ] **Opnieuw informeren.** Klik **Opnieuw informeren**. Verwacht: *De klant is al geïnformeerd op <datum>. Opnieuw een e-mail … sturen naar …?* **(nieuw)** (hfst 2.6)
- [ ] **Klant informeren staat er niet altijd.** Verwacht: de knop staat er alleen bij een gekoppelde bekeuring met een klant, en alleen voor wie **Boetes beheren** heeft. **(nieuw)** (hfst 2.6)
- [ ] **Bekeuring zonder bedrijfsnaam.** Bij een klant zonder **Bedrijfsnaam** staat in de bekeuring de naam van de klant, geen lege regel. (hfst 2.6)

### Reserveringen en de andere schermen

- [ ] **Reserveringskalender.** Verwacht: **Lijstweergave**, **Voltooid bekijken (…)**, **Verwijderde reserveringen**, **… achterstallig** (als er zijn), **Administratie**, **Nieuwe reservering**; boven de kalender **Kleuren**, **Vandaag**, maandnavigatie, de filters. (hfst 2.7, 5.1)
- [ ] **Administratie.** **Administratie** → *Administratie - Factuurgegevens* met de tabbladen **Huidige verhuur** en **Geschiedenis**; zoek en sorteer op **Ophaaldatum**, **Kenteken**, **Bedrijf**, **Contract #**. (hfst 2.7)
- [ ] **Onderhoud, het scherm.** [werkplaats] **Onderhoudskalender** met **Lijstweergave**, **Voltooide bekijken (…)**, **Verwijderd onderhoud**, **Onderhoud plannen**. (hfst 2.8, 7.1)
- [ ] **Kosten, het scherm.** [kantoor] **Kostenbeheer** met **Factuur scannen**, **Kosten registreren**, **Kostenoverzicht** en **Kostensamenvatting**. (hfst 2.8)
- [ ] **Kostenoverzicht filteren.** Filter op **Voertuig** (kenteken met of zonder streepjes), **Van**, **Tot en met**, **Categorie**, het zoekveld. Verwacht: de **Kostensamenvatting** rekent precies over wat je ziet (*Totaal van de gekozen filters*). **Filters wissen** zet alles terug; **Deze maand**, **Vorige maand** en **Dit jaar** zetten de periode in één klik. (hfst 2.8, 13.10)
- [ ] **Per categorie en Alle kosten.** Standaard staat elke categorie ingeklapt met aantal en totaal; klik erop voor de vijf nieuwste en **Alle N tonen**. Kies **Alle kosten** voor één tabel met sorteerbare koppen en een paginakiezer. (hfst 2.8)
- [ ] **Exporteren (CSV).** Verwacht: de melding **Bestand gemaakt** en een csv met puntkomma's, decimale komma en datums dd-mm-jjjj; open hem in Excel. Met **Prijzen verbergen** staat de knop er niet. (hfst 2.8, 12)
- [ ] **Kosten registreren, een voertuig is verplicht.** Laat het voertuig leeg. Verwacht: *Kies een voertuig*; ontbreekt de categorie: *Kies een categorie*. Het venster heet **Nieuwe kosten toevoegen**, ook vanaf het Dashboard. (hfst 2.8)
- [ ] **Categorieën.** Verwacht de lijst **Onderhoud**, **Banden**, **Remmen**, **Schade**, **Brandstof**, **Verzekering**, **Registratie**, **Schoonmaak**, **Accessoires**, **Tol**, **Parkeren**, **Overig**. (hfst 2.8)
- [ ] **Verwijderde kostenposten.** [kantoor] Verwijder een oefenkostenpost en open **Verwijderde kostenposten**. Verwacht: de kostenpost staat er met zijn bon; **Terugzetten** brengt hem terug. **(nieuw)** (hfst 2.8, 10.6)
- [ ] **Ontvangen facturen: Logboek.** In het venster **Ontvangen facturen** staat naast **Nu ophalen** de knop **Logboek**. (hfst 2.8, 9.9)
- [ ] **Documenten, het scherm.** **Documentbeheer** met **Document uploaden** en de tabbladen **Documentbibliotheek**, **Contractsjablonen**, **Transportrapportsjablonen**, **Barcodelabels**, **Schadecheck-sjablonen**. (hfst 2.8, 8.3)
- [ ] **Transporten, het scherm.** **Transportdashboard** met **Route-optimalisatie**, de vier tellers, de zes tabbladen, **Nieuw transport** en **Verwijderde transporten**; de kolomkoppen sorteren en een klik op een regel opent het transport. (hfst 2.8, 6.1)
- [ ] **Communicatie, het scherm.** **Klantcommunicatie** met de tabbladen **Meldingen versturen**, **Sjabloonbouwer**, **E-maillogboek**, **Analyse**; onder **Meldingen versturen**: **APK-herinneringen**, **Onderhoud**, **Aangepast bericht**. (hfst 2.8, 9)
- [ ] **Rapporten, het scherm.** Rechtsboven vijf afdrukknoppen (**APK**, **Garantie**, **Kosten**, **Benutting**, **Klanten**), **Aangepaste rapportbouwer**, **Analyse onderhoudskosten**, **Rapportfilters** en de tabbladen **Operaties**, **Kosten**, **Voertuigen**, **Klanten**, **Transporten**, **Financieel**, **Fiscaal**; bij **Rapportfilters** ook **Filters herstellen** en de snelle keuzes **Alle gegevens (verleden & toekomst)**, **Deze maand**, **Volgende maand**. (hfst 2.8, 13.13)
- [ ] **Regel onder de filters.** Verwacht: *Alle cijfers op deze pagina gelden voor <periode> en de hele vloot (N voertuigen).* (hfst 2.8)
- [ ] **Filter werkt, met melding.** Wijzig een filter. Verwacht: kort *Cijfers worden bijgewerkt...*; bij **Financieel** staat *Het categoriefilter (Banden) geldt niet voor dit tabblad.* (hfst 2.8)
- [ ] **Afdrukken noemt wat het afdrukt.** Verwacht: *Afdrukken: APK*, enzovoort; een klik opent eerst een afdrukvoorbeeld met **Sluiten** en **Afdrukken**; het klantenrapport telt alleen klanten met een reservering in de periode. (hfst 2.8)
- [ ] **Stijging vanaf 0.** Verwacht: *nieuw* in plaats van *+100%*; zonder vergelijking een streepje. (hfst 2.8)
- [ ] **Analyse onderhoudskosten.** Verwacht: *Telt alleen onderhoudskosten (...)*, kosten per km alleen bij **Alle tijd** (anders een streepje), **Onvoldoende gegevens** bij een merk met te weinig regels, maanden in het Nederlands. (hfst 2.8)
- [ ] **Rapportbouwer.** Maak een rapport, voer het uit. Verwacht: **Exporteren naar CSV** en **Afdrukken** zijn grijs zolang er geen resultaat is. (hfst 2.8)
- [ ] **Opgeslagen rapport verwijderen.** Klik *Rapport verwijderen: <naam>*. Verwacht: **Rapport verwijderen?** — *U staat op het punt het opgeslagen rapport "<naam>" te verwijderen. Dit kan niet ongedaan worden gemaakt.* Pas na **Verwijderen** is het weg. (hfst 2.8)
- [ ] **Alleen de fiscale check zien.** [account met Fiscaal bekijken, zonder rapportvinkje] Verwacht: **Rapporten** toont alleen de fiscale check, met de knop **Fiscale check**. (hfst 2.6, 15.4)

### Snelle acties en de balk

- [ ] **Ophalen starten opent eerst het scanvenster.** Verwacht onder de tegel: *Auto meegeven aan de klant*; bij **Innemen starten**: *Auto terugnemen van de klant*; bij **Scannen**: *Alleen opzoeken, niets starten*. (hfst 2.9, 18.7)
- [ ] **Nieuwe reservering vanaf het Dashboard.** Klik **Annuleren**. Verwacht: alleen het venster sluit, je blijft op het Dashboard. (hfst 2.9)
- [ ] **De kleinere knoppen.** Verwacht: **Voertuig toevoegen**, **Klant toevoegen**, **RDW APK-datums scannen**, **Document uploaden**, **Kosten registreren**, **Brandstofstatus bijwerken**, **Registratie wijzigen**, **APK-rapport uploaden**, **APK-meldingen versturen**. (hfst 2.9)
- [ ] **RDW APK-datums scannen.** Klik de tegel. Verwacht: **RDW APK-datums scannen?** met **Scan starten**. Start hem alleen op de testomgeving; verwacht dan *De scan is gestart en loopt op de achtergrond.* (hfst 2.9, 4.7)
- [ ] **Meldingencentrum.** Klik het belletje. Verwacht: tabbladen **Alle**, **Reserveringen**, **Onderhoud**, **APK**, **Garantie**, **Aangepast**; een melding **Markeer als gelezen** / **Markeer als ongelezen**; **Nieuwe melding** met titel, omschrijving, datum en prioriteit (**Hoog**, **Normaal**, **Laag**). (hfst 2.10, 16.4)
- [ ] **Eigen menu.** Klik je naam. Verwacht: je naam en e-mailadres, **Profiel**, de taalknop (**English** of **Nederlands**), voor [beheerder] het kopje **Beheer** met **Gebruikers**, **Back-upbeheer**, **App-instellingen**, en **Uitloggen**. (hfst 2.10)
- [ ] **De taal omzetten.** Klik **English**. Verwacht: de app staat in het Engels; zet hem terug op **Nederlands**. (hfst 13.1)

### Sneltoetsen

- [ ] **`?`.** Verwacht: het overzicht **Sneltoetsen**. (hfst 2.11)
- [ ] **`N`.** Verwacht: het boekingsvenster **Nieuwe reservering**. (hfst 2.11)
- [ ] **`S`.** Verwacht: het scanvenster. (hfst 2.11)
- [ ] **`Esc` met niet-opgeslagen wijzigingen.** Typ iets in een formulier, druk Esc. Verwacht: **Wijzigingen verwerpen?** (hfst 2.11)
- [ ] **Losse letters in een invoerveld.** Typ `n`, `s` en `?` in een tekstveld. Verwacht: er opent geen venster. `Ctrl+K` werkt wel. (hfst 2.11)
- [ ] **Keuzelijst met het toetsenbord.** Open de klantkeuze in het reserveringsformulier: typ, ga met de pijltjes omhoog en omlaag, kies met Enter, sluit met Escape. Verwacht: werkt; past er niets bij, dan staat er een melding in plaats van een lege lijst. (hfst 2.11)

---

## Hoofdstuk 3 — Klanten

### Opzoeken en bekijken

- [ ] **Klanten zoeken.** **Klanten** → **Klanten zoeken** → typ een deel van een naam, e-mailadres of plaats. Verwacht: de lijst filtert terwijl je typt. (hfst 3.1)
- [ ] **Sorteren.** Verwacht keuzes: **Naam (A-Z)**, **Naam (Z-A)**, **Nieuwste eerst**, **Oudste eerst**, **Meeste verhuur**, **Recente activiteit**, **Actieve verhuur**. (hfst 3.1)
- [ ] **Filters.** **Filters** → *Klanten filteren* met **Recente klanten (30 dagen)**, **Frequente klanten (3+ reserveringen)**, **Volledig profiel**, **Onvolledig profiel**, **Actieve verhuur**, **Heeft chauffeurs**, **Zakelijk**, **Particulier**; **Filters wissen** zet ze uit. (hfst 3.1)
- [ ] **Portaallabel.** Een klant met portaalaccounts heeft een blauw label zoals **Portaal (1)** onder het e-mailadres. (hfst 3.1)
- [ ] **Paginering.** Onderaan: *1-10 van 300 getoond*, **Vorige** en **Volgende**, *Pagina 1 van 30* met invulveld **Pagina**: typ een nummer en Enter; een nummer voorbij de laatste brengt je naar de laatste pagina. (hfst 3.1)
- [ ] **Klantkaart.** **Bekijken**. Verwacht: *Klant sinds <datum>*, vier tegels (**Totaal aantal verhuringen**, **Actieve verhuringen**, **Voltooid**, **Totaal aantal km gereden**), knoppen **Terug**, **Bewerken**, **Nieuwe reservering**, vijf tabbladen. (hfst 3.2)
- [ ] **Niet opgegeven.** Een leeg veld toont **Niet opgegeven**, geen fout. (hfst 3.2)
- [ ] **Geblokkeerde voertuigen.** Onderaan het eerste tabblad; een niet-geblokkeerde klant: *Deze klant is niet geblokkeerd voor enig voertuig.* Klik op **Voertuig blokkeren**, kies een auto, vul een reden in en klik op **Blokkeren**. Verwacht: de auto staat in het blok met de reden; **Blokkade opheffen** vraagt **Blokkade opheffen?** en haalt hem weer weg. Op de voertuigkaart (tabblad **Reserveringen**, **Klant zwarte lijst**) zie je dezelfde blokkade. **(nieuw)** (hfst 3.2)
- [ ] **Geschiedenis exporteren.** Tabblad **Geschiedenis** → **Exporteren (CSV)**. Verwacht: **Bestand gemaakt**. (hfst 3.2)

### Aanmaken en bijwerken

- [ ] **Uitleg bovenin het formulier.** **Klant toevoegen**. Verwacht: een blokje dat zegt dat alleen de naam verplicht is en wat je voor een reservering en het contract nodig hebt. (hfst 3.3)
- [ ] **Alleen naam invullen.** **Volledige naam** → **Klant toevoegen**. Verwacht: *Klant succesvol aangemaakt* — *De klant is toegevoegd aan je systeem.* (hfst 3.3)
- [ ] **Naam te kort.** Eén teken. Verwacht onder het veld: *De naam moet minimaal 2 tekens bevatten*. (hfst 3.3)
- [ ] **Hoofdletters.** Typ *jan van der berg*. Verwacht: *Jan van der Berg*. Typ *DHL Express B.V.*: blijft zoals getypt. (hfst 3.3)
- [ ] **Alle tabbladen.** Vul **Basisgegevens**, **Contact**, **Bedrijf** en **Aanvullend** in en sla op. Verwacht: alles staat op de klantkaart. (hfst 3.3)
- [ ] **Voorbeelden zijn alleen voorbeelden.** De grijze voorbeeldtekst (*Jan Jansen*) wordt niet opgeslagen. (hfst 3.3)
- [ ] **Wijzigingen verwerpen?** Typ iets en sluit het venster. Verwacht: **Wijzigingen verwerpen?** met **Verder bewerken** en **Verwerpen**. Idem bij **Klant bewerken**. (hfst 3.3)
- [ ] **Waarschuwing "bestaat mogelijk al".** Typ op **Contact** een e-mailadres of telefoonnummer dat al bestaat. Verwacht: een oranje kader *Deze klant bestaat mogelijk al* met de naam, *zelfde e-mailadres* en een knop **Openen**; *Je kunt gewoon doorgaan; dit is een waarschuwing, geen blokkade.* (hfst 3.4)
- [ ] **Klant bijwerken.** **Bekijken** → **Bewerken** → wijzig iets → **Klant bijwerken**. Verwacht: *Klant succesvol bijgewerkt* en een regel in de **Geschiedenis** met oude en nieuwe waarde. (hfst 3.5)

### Chauffeurs

- [ ] **Chauffeur toevoegen.** Klant → tabblad **Chauffeurs** → **Chauffeur toevoegen** → alleen **Weergavenaam** → **Chauffeur toevoegen**. Verwacht: *Chauffeur toegevoegd* — *De chauffeur is succesvol toegevoegd.* (hfst 3.6)
- [ ] **Alle chauffeurvelden.** Vul ook rijbewijsgegevens, een **Kopie rijbewijs (optioneel)** (jpg, png of pdf, maximaal 10 MB), **Status** en **Hoofdchauffeur** in. Verwacht: de lijst toont het label **Hoofd**. (hfst 3.6)
- [ ] **Rijbewijs verloopt.** Vul een **Vervaldatum rijbewijs** in de toekomst en een in het verleden in. Verwacht: **Verloopt: <datum>** en **Verlopen**. (hfst 3.6)
- [ ] **Chauffeurlijst.** Verwacht: kolommen **Chauffeur**, **Contact**, **Rijbewijs**, **Voertuig**, **Status**, **Acties** met **Bekijken**, **Bewerken**, **Verwijderen**; zoekveld *Zoek chauffeurs op naam, e-mail, telefoon of rijbewijs...*; paginering. (hfst 3.6)
- [ ] **Chauffeur verwijderen.** **Verwijderen**. Verwacht: *Weet je zeker dat je <naam> wilt verwijderen? De chauffeur gaat naar de prullenbak van deze klant; terugzetten kan via Prullenbak.* **(nieuw)** (hfst 3.6)
- [ ] **Verwijderde chauffeurs.** [kantoor] Klik **Verwijderde chauffeurs** in de kop van **Bevoegde chauffeurs**. Verwacht: alleen de verwijderde chauffeurs van déze klant. **(nieuw)** (hfst 3.6, 10.6)
- [ ] **Chauffeur terugzetten.** **Terugzetten**. Verwacht: de chauffeur staat weer in de lijst. **(nieuw)** (hfst 3.6)
- [ ] **Chauffeur terugzetten terwijl de klant in de prullenbak staat.** Verwacht: *De klant van deze chauffeur bestaat niet meer. Zet eerst de klant terug (Klanten, Verwijderde klanten) en daarna de chauffeur.* **(nieuw)** (hfst 3.6, 12)
- [ ] **Chauffeur definitief verwijderen.** [kantoor, oefenchauffeur] **Definitief verwijderen** → bevestigen. Verwacht: de chauffeur is weg, met de kopie van het rijbewijs. **(nieuw)** (hfst 3.6, 10.6)
- [ ] **Prullenbak chauffeurs grijs zonder vinkje.** [zonder Prullenbak beheren] Verwacht: de knop **Verwijderde chauffeurs** is grijs; een tik toont het vinkje dat je mist. **(nieuw)** (hfst 3.6, 15.16)

### Het portaal van een klant

- [ ] **Tabblad Portaal.** Verwacht van boven naar beneden: **Portaalaccounts**, **Instellingen voor deze klant**, **Aanvragen**, **Bekeuringen**, **Activiteit in het portaal**. Zonder accounts: *Nog geen accounts. Nodig een contactpersoon uit.* (hfst 3.7)
- [ ] **Uitnodigen.** [kantoor, je eigen mailadres] **Uitnodigen** → het e-mailadres staat voorgevuld (*Vooraf ingevuld vanuit de klantgegevens; aanpassen mag.*) → **Naam**, **Rol** (**Beheerder** of **Bestuurder**; bij **Bestuurder** ook **Gekoppelde bestuurder**) → onder **Rechten voor dit account** een vinkje weghalen → **Uitnodigen**. Verwacht: status **Uitnodiging open**; de uitnodiging komt aan. (hfst 3.7)
- [ ] **Accountlijst.** Verwacht: kolommen **Naam**, **E-mail**, **Rol**, **Status**, **Laatste login**; statussen **Uitnodiging open**, **Niet geactiveerd**, **Actief**, **Geblokkeerd**. (hfst 3.7)
- [ ] **Menu achter een account.** Verwacht: **Bewerken en rechten**, **Uitnodiging opnieuw sturen** (alleen niet-geactiveerd), **Wachtwoord-reset sturen** (alleen geactiveerd), **Blokkeren** / **Deblokkeren**, **Verwijderen** (alleen niet-geactiveerd). (hfst 3.7)
- [ ] **Mail niet verstuurd.** Maak de mailinstelling kapot (testomgeving) en stuur een uitnodiging. Verwacht in het rood: *De e-mail is niet verstuurd. Controleer de e-mailinstellingen en probeer het opnieuw.* (hfst 3.7)
- [ ] **Blokkeren.** Verwacht: **Account blokkeren?** — *<naam> kan daarna niet meer inloggen in het portaal. U kunt het account later weer deblokkeren.*, daarna **Account geblokkeerd.**; **Deblokkeren** geeft **Account gedeblokkeerd.** Bij een geblokkeerd account ontbreken de uitnodiging en reset. (hfst 3.7)
- [ ] **Account verwijderen.** Verwacht: **Account verwijderen?** en daarna **Account verwijderd.** (hfst 3.7)
- [ ] **Portaalwachtwoord.** Het portaal vraagt van de klant minimaal 10 tekens, zonder eisen aan hoofdletters of cijfers. Jij zet nooit het wachtwoord. (hfst 3.7)
- [ ] **Instellingen voor deze klant.** Zet de schakelaars om: **Portaal actief**, **Mag online huren (aanvraag)**, **Mag bestuurders beheren**, **Mag aanvragen indienen**, **Mag eerder inleveren (terugbrengen) aanvragen**, **Ziet bekeuringen**, **Ziet contracten en schadeformulieren**, **Ziet prijzen**. Verwacht: een regel onder elke schakelaar, een melding welke je omzette en blijvend *Opgeslagen om 14:32*; na **Opslaan** *Instellingen opgeslagen.* (hfst 3.7)
- [ ] **Fiscale schakelaars grijs.** Verwacht: zolang de hoofdschakelaar uit staat, zijn de fiscale schakelaars grijs, met uitleg. (hfst 3.7)
- [ ] **Bovengrens.** Zet **Ziet prijzen** uit bij de klant. Verwacht: geen enkel account van die klant ziet prijzen. (hfst 3.7)
- [ ] **Aanvragen afhandelen.** **Alles bekijken en zoeken** → **Klantenportaal** → tegel **Aanvragen**. In een aanvraag: **Standaardantwoord invullen** → **Ontvangen**, **Akkoord** of **Afwijzing**; **Bericht plaatsen** (blijft open, geen mail) en **Antwoord mailen (blijft open)** (wel mail). (hfst 3.7)
- [ ] **Voertuigen online.** Tegel **Voertuigen online** → zet een auto met status **Reparatie nodig** online. Verwacht: *<kenteken> heeft de status "…" en kan niet worden verhuurd. … Toch online aanbieden?* met de knop **Toch online aanbieden**; ook bij meerdere tegelijk. (hfst 3.7)

### Een klant verwijderen en terugzetten

- [ ] **Venster Klant verwijderen.** Klik **Verwijderen** op een oefenklant. Verwacht: *Dit verwijdert ook:* met een lijst (of *Er is niets anders aan deze klant gekoppeld.*) en *Een beheerder kan de klant daarna terugzetten vanuit de prullenbak.* (hfst 3.8)
- [ ] **Naam overtypen.** Verwacht: **Klant verwijderen** is uit tot je de naam hebt overgetypt (hoofdletters en extra spaties maken niet uit). (hfst 3.8)
- [ ] **Klant met lopende huur.** Verwacht in het rood: *Verwijderen kan niet: deze klant heeft een lopende of toekomstige reservering.* met de reserveringen; de knop blijft uit, ook met de naam overgetypt. (hfst 3.8)
- [ ] **Terugzetten.** **Verwijderde klanten** → **Terugzetten**. Verwacht: de klant is terug. (hfst 3.8, 10.6)
- [ ] **Definitief verwijderen.** [kantoor, oefenklant] **Definitief verwijderen** → **Definitief verwijderen?**. Verwacht: weg, en het debiteurnummer komt vrij. Heeft de klant fiscale beoordelingen, dan gaan die mee en noemt de bevestiging het aantal. **(nieuw)** (hfst 3.8, 10.6)

### Debiteurnummer

- [ ] **Nummer al bezet.** Geef een tweede klant een bestaand **Debiteurnummer**. Verwacht: een rode veldfout *Dit debiteurnummer is al in gebruik bij klant <naam>.*, geen melding rechtsboven; springt terug naar **Basisgegevens** als je op een ander tabblad zat. (hfst 3.9)
- [ ] **Nummer van een klant in de prullenbak.** Verwacht: *Dit debiteurnummer hoort bij klant <naam> in de prullenbak. Zet die klant terug of verwijder hem definitief uit de prullenbak.* (hfst 3.9)
- [ ] **Leeg nummer mag.** Verwacht: opslaan lukt zonder debiteurnummer. (hfst 3.9)

---

## Hoofdstuk 4 — Voertuigen

### Doorzoeken

- [ ] **Zoeken.** **Voertuigen** → *Zoeken op kenteken, merk of model...* Verwacht: de lijst filtert; het kruisje wist de zoekterm. (hfst 4.1)
- [ ] **Sorteren op.** Verwacht keuzes: **Standaard (ID)**, **Kenteken**, **Merk**, **APK-datum (eerst vroegste)**, **APK-datum (eerst laatste)**, **Beschikbaarheid (beschikbaar eerst)**, **Beschikbaarheid (gereserveerd eerst)**. (hfst 4.1)
- [ ] **Tonen, los van sorteren.** Keuzelijst **Tonen:** met **Alle voertuigen**, **Reparatie nodig**, **Opnaam**, **BV**, **Niet opgegeven**. Verwacht: *Opnaam* met sortering op **Kenteken** werkt samen. (hfst 4.1)
- [ ] **Filter functies.** Vink **GPS**, **Reservesleutel** enz. aan; **Alles geselecteerd** / **Iets geselecteerd**; **Wissen**. (hfst 4.1)
- [ ] **Kolommen.** **Acties**, **Kenteken**, **Merk**, **Model**, **Type**, **Status**, **Registratie**, **GPS**, **Radiocode**, **Bandenmaat**, **APK verloopt**. (hfst 4.1)
- [ ] **Pagina.** Invulveld **Pagina** → een nummer voorbij de laatste → je komt op de laatste pagina. (hfst 4.1)
- [ ] **Registratie en APK-kolom.** *Sinds: <datum>*; APK met aantal dagen of *… dagen te laat*; geen datum: **Niet ingesteld**; onbekend: **N.v.t.** (hfst 4.1)

### Bekijken en toevoegen

- [ ] **Voertuigkaart.** **Bekijken**. Verwacht: **Voertuiggegevens - <merk> <model> (<kenteken>)** met de barcode en knoppen **Sleutellabel**, **Reservesleutel-label**, **Terug**, **Barcode bekijken**, **Bewerken**, **Brandstofstatus bijwerken**, **Verwijderen**, **Nieuwe reservering**; zes tegels; zes tabbladen. Zonder garantiedatum: *Geen garantiedatum*. (hfst 4.2)
- [ ] **Voertuig toevoegen.** **Voertuig toevoegen** → **Kenteken**, **Merk**, **Model** → **Voertuig toevoegen**. Verwacht: *Voertuig succesvol aangemaakt* — *Het voertuig is toegevoegd aan je wagenpark.* (hfst 4.3)
- [ ] **Formulier niet compleet.** Laat het kenteken leeg. Verwacht: een rood blok **Het formulier is nog niet compleet** en dezelfde melding rechtsboven. (hfst 4.3)
- [ ] **RDW opzoeken.** Kenteken → **Opzoeken**. Verwacht: *Voertuiggegevens gevonden* — *Voertuiggegevens succesvol opgehaald uit de RDW-database.* en merk, model, type, brandstof, chassisnummer, APK-datum en bouwdatum zijn ingevuld. (hfst 4.3)
- [ ] **RDW kent het kenteken niet.** Verwacht: *Voertuig niet gevonden* — *Geen voertuig gevonden met dit kenteken in de RDW-database. Controleer het kenteken en probeer het opnieuw.* (hfst 4.3)
- [ ] **Bus met negen zitplaatsen.** Zoek een bus (Transporter, Ducato, Boxer, Transit, Vito, Trafic, Scudo) met negen zitplaatsen op. Verwacht: voertuigtype **Van**, niet **SUV**; een gewone gezinsauto of MPV met minder zitplaatsen blijft **SUV**. (hfst 4.3)
- [ ] **Sluiten met wijzigingen.** **Annuleren** terwijl je iets invulde. Verwacht: **Wijzigingen verwerpen?** (hfst 4.3)

### Bulk importeren

- [ ] **Bulk importeren, handmatig.** **Bulk importeren** → tabblad **Handmatig invoeren** → typ een bestaand en een nieuw kenteken (één per regel) → **Import starten**. Verwacht: *Import verwerken...* en daarna **Importresultaten** met *<n> geïmporteerd, <n> met waarschuwing, <n> mislukt*. (hfst 4.4)
- [ ] **Vinkje Ook onbekende kentekens aanmaken, uit.** Importeer een kenteken dat de RDW niet kent. Verwacht: onder **Met waarschuwing**: *Onbekend bij de RDW: niet aangemaakt.* en de auto bestaat niet. **(nieuw)** (hfst 4.4)
- [ ] **Vinkje aan.** Zelfde kenteken. Verwacht: *Onbekend bij de RDW: wel aangemaakt, zonder RDW-gegevens.* met merk en model *Unknown*. **(nieuw)** (hfst 4.4)
- [ ] **Drie uitkomsten.** Verwacht de blokken **Succesvol geïmporteerd (n)**, **Met waarschuwing (n)**, **Mislukte imports (n)**; een bestaand kenteken: *Dit voertuig bestaat al.* **(nieuw)** (hfst 4.4)
- [ ] **Leeg veld.** Verwacht: **Geen kentekens gevonden** — *Voer minstens één geldig kenteken in.* (hfst 4.4)
- [ ] **CSV uploaden.** Tabblad **CSV uploaden** → sleep een bestand → **Importgegevens voorbeeld** (rijen zonder kenteken rood met een driehoekje) → **Import bevestigen (<aantal> voertuigen)**, of **Terug**. Verwacht: **Import voltooid** — *<aantal> voertuigen geïmporteerd, <aantal> met waarschuwing, <aantal> mislukt.* Een rij met een onleesbare datum: *Een datum kon niet worden gelezen (gebruik dd-mm-jjjj).* (hfst 4.4)
- [ ] **Afwijkingen ten opzichte van de RDW.** Verwacht: staat het bestand anders dan de RDW, dan toont het resultaat *Afwijkingen ten opzichte van de RDW:* en geldt de RDW-waarde. (hfst 4.4)

### Bijwerken, statussen, APK

- [ ] **Voertuig bijwerken.** **Bewerken** → de vijf tabbladen (**Algemeen**, **Technisch**, **Datums**, **Contract**, **Overig**) → **Voertuig bijwerken**. Verwacht: *Voertuig succesvol bijgewerkt* — *Het voertuig in je wagenpark is bijgewerkt.* (hfst 4.5)
- [ ] **Verplichte velden.** Maak het kenteken leeg. Verwacht: *Vul alle verplichte velden in: kenteken, merk en model.* en onder het veld *Kenteken is verplicht*. (hfst 4.5)
- [ ] **Dagprijs.** Vul een **Dagprijs (€)** in; maak daarna een reservering. Verwacht: de **Totaalprijs (€)** wordt dagprijs maal dagen. (hfst 4.5, 5.3)
- [ ] **Opmerkingen bij het ophalen.** Zet tekst in **Opmerkingen**; haal de auto later op. Verwacht: het venster **Voertuigopmerkingen - Ophaalwaarschuwing**. (hfst 4.5, 5.7)
- [ ] **De status wijzigen.** **Bewerken** → **Algemeen** → **Beschikbaarheidsstatus**, of op de kaart **Wijzigen**. Verwacht: vier keuzes: **Beschikbaar**, **Moet gerepareerd worden**, **Niet voor verhuur**, **Verhuurd**; **Gepland** staat er niet bij. (hfst 4.6)
- [ ] **Gepland onderhoud maakt geen Reparatie nodig.** Plan onderhoud voor een beschikbare auto. Verwacht: status **Gepland**, niet **Reparatie nodig**. **(nieuw)** (hfst 4.6, 7.3)
- [ ] **Binnen geeft Reparatie nodig.** Zet dat onderhoud op **Binnen**. Verwacht: **Reparatie nodig**. **(nieuw)** (hfst 4.6, 7.8)
- [ ] **Weghalen geeft de auto vrij.** Verwijder of annuleer dat onderhoud. Verwacht: de auto is niet langer **Reparatie nodig** (als er geen ander onderhoud op **Binnen** staat). **(nieuw)** (hfst 4.6, 7.8)
- [ ] **Een stand met de hand blijft staan.** Zet een auto zelf op **Moet gerepareerd worden** en haal een onderhoud weg. Verwacht: de stand blijft. **(nieuw)** (hfst 4.6)
- [ ] **Handmatig op Verhuurd.** Zet een auto zonder actieve reservering met de hand op **Verhuurd**. Verwacht: een waarschuwing, *Geen actieve reservering* of *Reservering nog niet opgehaald*. (hfst 4.6)
- [ ] **Uitgifte geblokkeerd.** Zet een auto op **Onderhoud nodig** (werkplaatsstatus) en probeer hem op te halen. Verwacht: **Uitgifte geblokkeerd** — *Dit voertuig staat in de werkplaats en kan niet worden uitgegeven. Rond de werkplaatsklus eerst af.* (hfst 4.6, 5.7)
- [ ] **Forceren door de beheerder.** [beheerder] In dat venster: **Reden voor het forceren** en **Toch uitgeven**. [kantoor] ziet in plaats daarvan *Alleen een beheerder kan de uitgifte forceren*. (hfst 4.6, 5.7)
- [ ] **APK-datum invullen.** **Bewerken** → **Datums** → **APK-vervaldatum**. Verwacht: zichtbaar in de lijst, de tegel, het tabblad **Onderhoud** (**APK-keuring** met **Huidige APK geldig tot**, **Dagen resterend** en het label **Verlopen**, **Actie binnenkort nodig** of **OK**) en op het Dashboard. (hfst 4.7)
- [ ] **APK-keuring plannen.** Tabblad **Onderhoud** → **APK-keuring plannen** → datum en **Duur (dagen)**. Heeft de auto een lopende huur: *Actieve verhuur gedetecteerd* en *Er is een vervangend voertuig nodig voor deze klant.* met **Vervangend voertuig aanvragen**. (hfst 4.7)
- [ ] **Verlopen APK bij boeken.** Verwacht: een rode waarschuwing, geen blokkade; in de keuzelijst het label **APK verlopen**. (hfst 4.7, 5.3)
- [ ] **APK-datums gewijzigd bij de RDW.** Verwacht (na de RDW-scan): het venster **APK-datums gewijzigd bij de RDW** met per voertuig **Bevestigen** of **Negeren**, en **Later (morgen opnieuw)**. (hfst 4.7)

### Kilometerstand en brandstof

- [ ] **Kilometerstand bijwerken.** **Km-stand bijwerken** (kaart of scan) → **Nieuwe kilometerstand** → **Opslaan**. Verwacht: *Kilometerstand opgeslagen* — *Nieuwe stand: <getal> km.* (hfst 4.8)
- [ ] **Lagere stand.** [kantoor] Verwacht: een oranje regel *Lager dan de huidige stand (<getal> km). Hiervoor is een autorisatiewachtwoord nodig.*, daarna **Kilometerstand-overschrijving vereist** met huidige stand, nieuwe stand en verschil; vul je **eigen** wachtwoord in → **Overschrijving bevestigen**. (hfst 4.8)
- [ ] **Lagere stand zonder het recht.** [balie] Verwacht: *Je hebt geen recht om een verlaging van de kilometerstand te autoriseren. Vraag iemand met het recht 'authorize_mileage_decrease'.* (hfst 4.8)
- [ ] **Brandstof zonder bedrag.** **Brandstofstatus bijwerken** → alleen **Brandstofniveau** → opslaan. Verwacht: geen kostenpost. (hfst 4.9)
- [ ] **Leeg formulier.** Verwacht: *Geef minstens één veld op om bij te werken.* (hfst 4.9)
- [ ] **Bedrag met een komma of punt.** **Tankkosten (€)** = *45,50* en *45.50*; ook *1.234,50*. Verwacht: alle drie worden gelezen als bedrag. (hfst 4.9)
- [ ] **Ongeldig bedrag.** Typ *abc* of *45,555*. Verwacht onder het veld: *Vul een geldig bedrag in, bijvoorbeeld 45,50.*, er wordt niets opgeslagen. (hfst 4.9)
- [ ] **Bedrag nul of te groot.** Verwacht: *Het tankbedrag moet een positief bedrag zijn van ten hoogste € 1.000.000.* **(nieuw)** (hfst 4.9)
- [ ] **Een tankbedrag wordt een kostenpost.** [kantoor of werkplaats] Vul een bedrag in, met een **Bon**. Verwacht: **Brandstofstatus bijgewerkt; kostenpost van € 45,50 geboekt**; op het scherm **Kosten** staat een kostenpost in de categorie **Brandstof** met omschrijving *Tankbeurt <niveau> <datum>* en de bon. **(nieuw)** (hfst 4.9)
- [ ] **Geen extra recht nodig.** [alleen Voertuigen beheren] Doe hetzelfde. Verwacht: het lukt zonder **Kosten beheren**. **(nieuw)** (hfst 4.9)
- [ ] **Dubbel klikken.** Verstuur hetzelfde bedrag twee keer binnen twee minuten. Verwacht: één kostenpost. Een ander bedrag later wordt wel een nieuwe. **(nieuw)** (hfst 4.9)
- [ ] **Laatste tankbedrag.** Verwacht: op de tegel **Huidig brandstofniveau** staat *Laatste tankbedrag: € 45,50 (9 okt. 2026)* (met jouw bedrag en datum), ook als je de kostenpost daarna verwijdert. **(nieuw)** (hfst 4.9)
- [ ] **Alleen niveau, geen kostenpost.** Vul alleen het **Brandstofniveau** in, geen bedrag. Verwacht: het niveau is bijgewerkt en er komt geen kostenpost bij. (hfst 4.9)
- [ ] **Kostenpost kon niet geboekt worden.** (Testomgeving, forceer een fout.) Verwacht: *De kostenpost voor de tankbeurt kon niet worden geboekt; er is niets opgeslagen. Probeer het opnieuw.* en ook het brandstofniveau is niet gewijzigd. **(nieuw)** (hfst 4.9)

### Documenten, barcode, verwijderen

- [ ] **Documenten bij het voertuig.** Tabblad **Documenten**: kaartje **Voertuigdocumenten**, knoppen onder **Snel uploaden categorieën** (**APK-keuring**, **Contract**, **Schaderapport**, **Voertuigfoto's**, **Onderhoud**), blok **Interactieve schadechecks** met **Nieuwe check** en **PDF**. (hfst 4.10)
- [ ] **Document verwijderen.** Verwacht: *"Weet je zeker dat je het document "<naam>" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."* (hfst 4.10)
- [ ] **Voertuigbarcode.** **Barcode bekijken** → **Labelsjabloon** → **Sleutellabel afdrukken**. Verwacht: **Afdrukvenster geopend** — *Het afdrukvenster van je browser is geopend voor het label van <kenteken>. Kies daar de printer.* (hfst 4.11)
- [ ] **Reservesleutel-label.** **Reservesleutel-label afdrukken**; de code eindigt op **-S**. (hfst 4.11)
- [ ] **DYMO-tape.** **Labelsjabloon** → **DYMO-tape (labelmaker, staand)**. Verwacht: de velden **Tapebreedte** (12 mm), **Labellengte (mm)** (48) en **Uitvoer**; met DYMO Connect op de pc staat eronder *DYMO Connect gevonden: 1 labelmaker.* en biedt **Uitvoer** *DYMO LabelManager 420P (rechtstreeks via DYMO Connect)*, *Bestand .label (openen in DYMO Connect)* en *Afdrukvenster van de browser*. (hfst 4.11, 18.9)
- [ ] **Rechtstreeks naar de labelmaker.** **Uitvoer** op de labelmaker → **Afdrukken**. Verwacht: **Naar de labelmaker gestuurd** — *1 label is naar DYMO LabelManager 420P gestuurd.*; de 420P drukt en snijdt één label: barcode over de lengte, daarnaast kenteken en **Hoofd**, scanbaar in de sleutelkast; bij **Reservesleutel-label** staat er **Reserve**. Open het venster opnieuw: tape en labelmaker staan nog voor. Labelmaker uit: **Afdrukken op de labelmaker mislukt** met de reden van DYMO Connect. (hfst 4.11, 18.9)
- [ ] **Bestand .label.** **Uitvoer** op *Bestand .label (openen in DYMO Connect)* → **Afdrukken**. Verwacht: **Bestand gemaakt** — *sleutellabel-<kenteken>-<code>.label*; dubbelklik opent het in DYMO Connect met dezelfde barcode en tekst. (hfst 4.11, 18.9)
- [ ] **Barcode opnieuw genereren.** Verwacht eerst de waarschuwing *De oude barcode (<code>) werkt daarna niet meer. Reeds afgedrukte labels moeten opnieuw worden afgedrukt. Deze actie kan niet ongedaan worden gemaakt.* Doe dit alleen op een oefenauto. (hfst 4.11)
- [ ] **Barcodeboek.** **Barcodeboek** → **Alles afdrukken (…)**. Verwacht: **Afdrukvenster geopend** — *… voor het barcodeboek (12 voertuigen) …*. (hfst 4.11)
- [ ] **Voertuig verwijderen.** Prullenbakje op een oefenauto. Verwacht: *Je staat op het punt om <merk> <model> te verwijderen met kenteken <kenteken>.*, *Controleren wat aan dit voertuig gekoppeld is...*, **Dit verwijdert ook:**, en de knop is grijs tot je het kenteken overtypt. (hfst 4.12)
- [ ] **Voertuig met lopende huur.** Verwacht: *Verwijderen kan niet: dit voertuig heeft een lopende of geplande huur.* met de blokkerende reserveringen. (hfst 4.12)
- [ ] **Voertuig verwijderd.** Verwacht: **Voertuig verwijderd** — *<merk> <model> is verwijderd. Een beheerder kan het terugzetten vanuit de prullenbak.* Vanuit het detailscherm sluit dat scherm en komt er geen tweede melding *Vehicle not found*. (hfst 4.12)
- [ ] **Voertuig terugzetten.** **Verwijderde voertuigen** → **Terugzetten**. Verwacht: **Teruggezet** — *12-AB-34 Kia Picanto is teruggezet.* en de regel krijgt het label **Teruggezet**. (hfst 4.12)
- [ ] **Terugzetten met een bezet kenteken.** Verwacht: *Er bestaat al een voertuig met hetzelfde kenteken. Verwijder of hernoem dat eerst.* (hfst 4.12)

### RDW-voertuigtypes

- [ ] **De kaart.** [beheerder] Tandwiel → **Instellingen** → tabblad **Voertuigen**. Verwacht: de kaart **RDW-voertuigtypes** met *Er wordt niets aangepast voordat een beheerder op Toepassen drukt.* **(nieuw)** (hfst 4.13)
- [ ] **Controleren.** Klik **Controleren**. Verwacht: *Controleren… 12 van 99 voertuigen* en daarna een lijst met per kenteken **Type: oud → nieuw**. **(nieuw)** (hfst 4.13)
- [ ] **Slechts één controle tegelijk.** Start in een tweede tabblad nog een. Verwacht: *Er loopt al een controle. Wacht tot die klaar is.* **(nieuw)** (hfst 4.13)
- [ ] **Slotregel.** Verwacht: *7 voertuigen krijgen een ander type (controle van <datum>: 99 voertuigen bekeken, 2 niet gevonden bij de RDW, 1 mislukt).* en onderaan *Niet gevonden bij de RDW, type blijft: …*. **(nieuw)** (hfst 4.13)
- [ ] **Alles gelijk.** Is er niets te wijzigen: *Alle gecontroleerde voertuigen hebben al het type dat de RDW geeft.* **(nieuw)** (hfst 4.13)
- [ ] **Toepassen vraagt bevestiging.** [beheerder] **Toepassen**. Verwacht: **RDW-voertuigtypes toepassen?** — *Het type van 7 voertuigen wordt aangepast zoals in de lijst staat. … Dit kan niet in één keer ongedaan worden gemaakt.* **(nieuw)** (hfst 4.13)
- [ ] **Toepassen, resultaat.** Bevestig (alleen op de testomgeving). Verwacht: **RDW-voertuigtypes toegepast** — *7 voertuigen aangepast, 0 overgeslagen (type intussen gewijzigd).* en per auto een regel in het activiteitenlog. **(nieuw)** (hfst 4.13)
- [ ] **Toepassen is alleen voor de beheerder.** [kantoor met Instellingen niet] Verwacht: geen knop **Toepassen**. **(nieuw)** (hfst 4.13, 15.3)
- [ ] **Lijst weg na toepassen.** Verwacht: een volgende **Toepassen** zonder nieuwe controle geeft *Er is geen controle-uitkomst meer om toe te passen. Draai eerst Controleren.* **(nieuw)** (hfst 4.13)

---

## Hoofdstuk 5 — Reserveringen

### De kalender en de lijst

- [ ] **Kalender.** **Reserveringen**. Verwacht een maandweergave met rechtsboven **Lijstweergave**, **Voltooid bekijken (…)**, **Verwijderde reserveringen**, **… achterstallig** (als er zijn), **… niet opgehaald** (als er zijn), **Administratie**, **Nieuwe reservering**. (hfst 5.1)
- [ ] **Filters en navigatie.** Boven de kalender: **Kleuren**, **Vandaag**, pijltjes, **Voertuigen zoeken...**, **Voertuigtype** (**Alle typen**), **Beschikbaarheid** (**Alle voertuigen**, **Beschikbaar**, **Gereserveerd**). (hfst 5.1)
- [ ] **Dagvakje.** Alleen reserveringen die die dag beginnen of eindigen: kenteken, **uit** of **in**, klant. Meer dan vijf: **+… meer** opent **Reserveringen voor <datum>**. (hfst 5.1)
- [ ] **Bijzondere regels.** Zoek een moersleuteltje (*Onderhoud: <type> - <status>*), **TBD**, **🚗 VERVANGER**, **Feestdag**/**Geblokkeerd**. (hfst 5.1)
- [ ] **Legenda.** **Kleuren** → *Legenda reserveringskalender* met **Bevestigde reservering**, **Reservering in behandeling**, **Voltooide reservering**, **Geannuleerde reservering**, **Vervangend voertuig**, **Vervangend voertuig (nog te bepalen)**, **Ophaaldag**, **Inleverdag**. (hfst 5.1)
- [ ] **Verslepen.** Sleep een blok naar een andere dag. Verwacht: **Reservering verplaatsen?** met oude en nieuwe periode; **Verplaatsen** bevestigt. (hfst 5.1)
- [ ] **Lijstweergave.** **Lijstweergave**. Verwacht: *Reserveringen — Bekijk en beheer alle reserveringen* met **Actief (…)**, **Achterstallig (…)**, **Geschiedenis (…)**; zoekveld *Zoek op kenteken, klant, contract, ID...*; sorteerknoppen **Ophalen**, **Klant**, **Kenteken**, **Inleveren**. (hfst 5.2)
- [ ] **Regel in de lijst.** Verwacht: nummer (#3366) met status, kenteken met merk en model, klant, contractnummer, **Uit:** en **In:**, kilometers, prijs, oogje, potlood, prullenbak; **Voertuig toewijzen** bij een open vervanger. (hfst 5.2)
- [ ] **Tabblad Achterstallig.** Verwacht: *Voertuigen die ingeleverd hadden moeten zijn maar nog bij de klant zijn*, met *… dag(en) te laat* en *Verwacht: <datum>*. (hfst 5.2)
- [ ] **50 per pagina.** Bij meer dan 50 reserveringen: *50 van 366 getoond* en **Toon 50 meer**; zoeken gaat over de hele lijst; tijdens laden *Laden...* met een rondje. (hfst 5.2)
- [ ] **Eigen adres per tabblad.** Ga naar **Achterstallig**, vernieuw de pagina. Verwacht: je komt op hetzelfde tabblad terug. (hfst 5.2)

### Een reservering maken

- [ ] **Venster openen.** `N` of **Reserveringen** → **Nieuwe reservering**. Verwacht: **Nieuwe reservering** met drie stappen: **1. Selecteer huurdata**, **2. Selecteer voertuig en klant**, **3. Reserveringsdetails**. (hfst 5.3)
- [ ] **Standaardwaarden van de datums.** Verwacht: **Startdatum** staat op vandaag en **Einddatum** drie dagen later, "vandaag" volgens de kantoorklok (de tijdzone uit de app-instellingen, standaard Nederland). **(nieuw)** (hfst 5.3, 10.3)
- [ ] **Huur zonder einddatum.** Zet aan. Verwacht: het veld **Einddatum** verdwijnt en de duur toont **Open einde**. (hfst 5.3)
- [ ] **Duur.** Pas de einddatum aan. Verwacht: **Duur:** met het aantal dagen. (hfst 5.3)
- [ ] **Ophaaltijd en inlevertijd (optioneel).** Vul ze in voor een wissel op dezelfde dag. (hfst 5.3)
- [ ] **Datums eerst.** Kies datums en open dan de voertuigkeuze. Verwacht: *Alleen beschikbare voertuigen voor je geselecteerde data worden getoond.* en een bezette auto staat er niet bij; *Geen voertuigen gevonden.* als er niets vrij is. (hfst 5.3)
- [ ] **Toon alle voertuigen.** Vink **Toon alle voertuigen (voor langdurige verhuur)** aan. Verwacht: ook bezette auto's, met de rode waarschuwing als hij echt botst. (hfst 5.3)
- [ ] **Datum in het verleden.** Verwacht: geen waarschuwing; een verstreken periode laat de auto **beschikbaar** zijn. (hfst 5.3)
- [ ] **Klantkeuze.** Zoek op naam, telefoon of plaats. Verwacht: onder elke naam telefoonnummer en e-mailadres. (hfst 5.3)
- [ ] **Gemachtigde chauffeur.** Verwacht: na het kiezen van een klant verschijnt **Gemachtigde chauffeur (optioneel)**, met **Snel chauffeur toevoegen**; de hoofdchauffeur heeft het label **Primaire chauffeur**. (hfst 5.3)
- [ ] **Nieuw toevoegen / Bewerken in het venster.** Vanuit de voertuigkeuze een voertuig aanmaken of bewerken. (hfst 5.3)
- [ ] **De drie meldingen.** Rood *Dit voertuig is al gereserveerd voor de geselecteerde data. Kies andere data of een ander voertuig.* (knop grijs); geel onderhoud (opslaan mag); rood *De APK (keuring) van dit voertuig is verlopen op <datum>. Bevestig dat het veilig en legaal is om te verhuren voordat je verdergaat.* (hfst 5.3)
- [ ] **Meerdere onderhoudsblokken.** Verwacht: *Let op: dit voertuig heeft … onderhoudsblokken in deze periode (…). Opslaan mag; de blokken blijven staan.* (hfst 7.3)
- [ ] **APK-melding vanuit een auto.** Open het formulier via **Nieuwe reservering** op de voertuigkaart. Verwacht: de auto staat ingevuld en de APK-waarschuwing staat er toch. (hfst 5.3)
- [ ] **Zwarte lijst.** Een geblokkeerde combinatie van klant en auto staat stil niet in de lijst. (hfst 5.3)
- [ ] **Nieuwe reservering is altijd Geboekt.** Verwacht in stap 3: geen statusveld. **(nieuw)** (hfst 5.3, 5.13)
- [ ] **Totaalprijs automatisch.** **Totaalprijs (€) (optioneel)** vult zich met dagtarief maal dagen, met *Automatisch ingevuld op basis van het dagtarief van €… voor … dagen — bewerk om te overschrijven*. Typ je zelf iets, dan blijft dat staan; zonder dagprijs: € 0,00. (hfst 5.3)
- [ ] **Bezorgservice.** Zet **Bezorgservice vereist** aan: **Bezorgadres**, **Stad**, **Postcode**, **Bezorgnotities**. (hfst 5.3)
- [ ] **Reservering aanmaken.** Verwacht: **Reservering succesvol aangemaakt** — *Reservering voor <merk> <model> is aangemaakt.*; **Annuleren** wordt **Sluiten**. (hfst 5.3)
- [ ] **Nu ophalen.** In de groene melding in het formulier staat **Nu ophalen**. Klik erop. Verwacht: het venster **Ophaalproces starten** voor déze reservering, met kenteken en klant. **(nieuw)** (hfst 5.3)
- [ ] **Nu ophalen vanuit andere plekken.** Boek vanaf het Dashboard, vanuit de klantenlijst en vanuit de voertuigenlijst. Verwacht: het venster sluit zichzelf en linksonder staat twaalf seconden een melding met dezelfde knop **Nu ophalen**. **(nieuw)** (hfst 5.3)
- [ ] **Nu ophalen zonder het recht.** [kijker of balie zonder Reserveringen beheren] Verwacht: de knop is niet bruikbaar zonder het recht (grijs of afwezig); er verandert niets. **(nieuw)** (hfst 5.3, 15.9)
- [ ] **Reservering blijft Geboekt na Nu ophalen annuleren.** Sluit het ophaalvenster zonder af te ronden. Verwacht: de reservering staat nog op **Geboekt**. **(nieuw)** (hfst 5.3)
- [ ] **Annuleren vanaf het Dashboard.** Verwacht: alleen het venster sluit, geen sprong naar Reserveringen. (hfst 5.3)
- [ ] **Wijzigingen verwerpen? bij het aanmaken.** Escape, het kruisje, naast het venster klikken en **Annuleren** terwijl je al iets invulde. Verwacht: **Wijzigingen verwerpen?** met **Verder bewerken** en **Verwerpen**. Nog niets ingevuld: het venster sluit gewoon. (hfst 5.3)
- [ ] **BV naar Opnaam.** Boek een auto die op **BV** staat. Verwacht: achteraf de melding *Voertuig automatisch gewijzigd van BV naar Opnaam (vereist voor verhuur - verzekering & wegenbelasting)*. (hfst 5.3, 11.17)
- [ ] **Achterstallige huur van dezelfde auto.** Verwacht: **Achterstallige reserveringen gevonden** met **Markeer als voltooid**, **Details bekijken**, **Doorgaan met reservering**. (hfst 5.3)

### Een reservering openen

- [ ] **Het korte venster.** Klik in de kalender een regel aan. Verwacht onderaan: **Ophalen starten** of **Inleveren starten** · **Bewerken** · **Onderhoud** · **Sluiten**; bij een opgehaalde, afgesloten of geannuleerde huur ook **Overdracht terugdraaien** (bij geannuleerd **Annulering terugdraaien**) en een prullenbakje. (hfst 5.4)
- [ ] **Het volledige venster.** Open dezelfde reservering via het zoekveld bovenin. Verwacht: de code (**RES-003366**), status, periode, prijs, voertuig, klant, chauffeur, documenten, **Voertuigservice**, **Geschiedenis**, en de knoppen **Datums wijzigen** · **Klant wijzigen** · **Voertuig wijzigen** · **Bewerken** · **Reservering annuleren** · **Verwijderen** · **Sluiten**. (hfst 5.4)
- [ ] **Annuleren verdwijnt bij een afgesloten huur.** (hfst 5.4)
- [ ] **Verouderd-label en geschiedenis in woorden.** Verwacht: een document dat niet meer klopt, heeft het label **Verouderd**; de **Geschiedenis** noemt *Ophalen*, *Inleveren*, *Overdracht teruggedraaid*, *Status gewijzigd*, *Contract gemaakt*, *Reservering aangemaakt*, *Document gemaild*, enz. (hfst 5.4)

### De kleine wijzigvensters

- [ ] **Datums wijzigen.** **Datums wijzigen** → *Alleen de begin- en einddatum worden gewijzigd; de rest van de boeking blijft zoals hij is.* → nieuwe datums → **Opslaan**. Verwacht: de periode is gewijzigd. (hfst 5.5)
- [ ] **Einddatum vóór begindatum.** Verwacht: *De einddatum kan niet vóór de begindatum liggen.* (hfst 5.5)
- [ ] **Datums botsen.** Verwacht: een weigering met de botsende reservering erbij. (hfst 5.5)
- [ ] **Klant wijzigen.** **Klant wijzigen** → *Zoek op naam, bedrijf of debiteurnummer...* → **Andere klant kiezen** → **Opslaan**. Verwacht: **Klant gewijzigd**. (hfst 5.5)
- [ ] **Voertuig wijzigen.** **Voertuig wijzigen** → *Kies een voertuig...* → **Opslaan**. Verwacht: **Voertuig gewijzigd**; de beschikbaarheid wordt opnieuw gecontroleerd. (hfst 5.5)
- [ ] **Contractnummer bewerken.** Klik het potloodje bij het blauwe contractnummer. Verwacht: **Contractnummer bewerken** met **Beschikbaarheid controleren...**, dan **Beschikbaar**, of *Al in gebruik door reservering #… Kies een ander nummer.* (hfst 5.5)
- [ ] **Contractnummer niet in het bewerkformulier.** **Bewerken** op een reservering. Verwacht: geen veld **Contractnummer**. **(nieuw)** (hfst 5.6)
- [ ] **Document wordt Verouderd.** Is er een contract, dan krijgt het na elke wijziging het oranje label **Verouderd** met **Opnieuw genereren**. (hfst 5.5)

### Het bewerkformulier

- [ ] **Bewerken.** **Bewerken** op een reservering. Verwacht: hetzelfde formulier met drie stappen, geen statusveld, geen **Kilometerstand bij inleveren**, **Brandstofniveau bij inleveren**, **Brandstofkosten (€)** of **Contractnummer**. **(nieuw)** (hfst 5.6)
- [ ] **Annuleren in het bewerkformulier.** Verwacht: onderaan bij een lopende reservering de knop **Reservering annuleren**, die hetzelfde annuleervenster opent. **(nieuw)** (hfst 5.6, 5.9)
- [ ] **Reservering bijwerken.** Wijzig de notities → **Reservering bijwerken**. Verwacht: **Reservering succesvol bijgewerkt**. (hfst 5.6)
- [ ] **Sluiten met wijzigingen.** Verwacht: **Wijzigingen verwerpen?** bij Escape, het kruisje, naast het venster en **Sluiten**. (hfst 5.6)
- [ ] **Een oude verhuring bewerken.** Een reservering die meer dan drie weken geleden is opgehaald: **Bewerken** → opslaan. Verwacht: **Beheerdersgoedkeuring vereist** — *Deze verhuur is meer dan 3 weken geleden opgehaald. Voer een beheerderswachtwoord in om je wijzigingen op te slaan.* → **Bevestigen**. (hfst 5.6)
- [ ] **Status via een gewone wijziging kan niet.** Alleen te controleren op een oude pagina: een gewone wijziging van de status geeft *De invoer klopt niet. Controleer de velden en probeer het opnieuw.* (code `USE_STATUS_ROUTE`). Vernieuw de pagina. **(nieuw)** (hfst 12 deel 2)

### Ophalen

- [ ] **Drie startpunten.** Dashboard → **Ophalen starten** → scan; **Scannen** → scan → **Ophalen starten**; reservering → **Ophalen starten**. Verwacht: steeds hetzelfde venster **Ophaalproces starten** — *Voer de huidige kilometerstand en het brandstofniveau van het voertuig bij ophalen in. Er wordt automatisch een contract gegenereerd.* (hfst 5.7)
- [ ] **Voertuiginformatie.** Verwacht: **Kenteken**, **Voertuig** en **Klant** staan bovenin; **Annuleren** sluit zonder iets te doen. (hfst 5.7)
- [ ] **Velden.** **Contractnummer** vooringevuld (*Automatisch gegenereerd, je kunt het indien nodig bewerken*), **Ophaaldatum** op vandaag, **Kilometerstand bij ophalen** (*Huidig: 25.000 km*), **Brandstofniveau bij ophalen** (**Vol**, **3/4**, **1/2**, **1/4**, **Leeg**), **Aanvullende notities (optioneel)**. (hfst 5.7)
- [ ] **Schadecheck.** **Ophaal-schadecheck aanmaken** en **Papieren check uploaden**. (hfst 5.7, 8.4)
- [ ] **Ophalen voltooien.** **Ophalen voltooien & contract genereren**. Verwacht: **Ophalen voltooid** — *Voertuig succesvol opgehaald. Contract is gegenereerd.* en daarna **Contract klaar** met **Afdrukken**, **Mail naar klant**, **Sluiten**. (hfst 5.7)
- [ ] **Ophalen vanaf een auto in gepland onderhoud.** Haal een auto op waarvoor onderhoud is ingepland maar die nog niet **Binnen** is. Verwacht: een gele regel *Let op: dit voertuig staat ingepland voor onderhoud (<periode>) en is nog niet binnengemeld. Ophalen mag; de balie beslist.* — het ophalen lukt. **(nieuw)** (hfst 5.7, 7.3)
- [ ] **Mail naar klant.** [je eigen adres] Verwacht: het adres van de klant staat voorgesteld; staat de knop grijs, dan staat er *Nog nodig om te versturen:* met wat ontbreekt. (hfst 5.7)
- [ ] **Voertuigopmerkingen.** Auto met opmerking. Verwacht: **Voertuigopmerkingen - Ophaalwaarschuwing** — *BELANGRIJK: Bekijk deze opmerkingen voordat het voertuig vertrekt:* — **Ik bevestig & ga door**; **Annuleren** sluit alles; naast het venster klikken doet niets (het venster licht even op); zonder bevestigen: **Opmerkingen niet bevestigd**. (hfst 5.7)
- [ ] **De huur start eerder.** Haal op vóór de startdatum. Verwacht: **De huur start eerder — datum aanpassen?** — **Ja, startdatum naar vandaag** of **Nee, niet ophalen** (dan wordt niets opgeslagen). (hfst 5.7)
- [ ] **Dubbel contractnummer.** Verwacht: **Dubbel contractnummer** — *Dit contractnummer is al in gebruik.* — **Annuleren** of **Overschrijven & doorgaan**. (hfst 5.7)
- [ ] **Kilometerstand-overschrijving.** Een lagere stand. Verwacht: **Kilometerstand-overschrijving vereist** met eigen wachtwoord. (hfst 5.7, 4.8)
- [ ] **Uitgifte geblokkeerd.** Auto met werkplaatsstatus. Verwacht: **Uitgifte geblokkeerd**; niets opgeslagen. [kantoor]: *Alleen een beheerder kan de uitgifte forceren. Los de werkplaatsstatus op, of vraag een beheerder.* [beheerder]: **Reden voor het forceren**, **Toch uitgeven** (uit zonder reden) of **Niet uitgeven**; de reden komt in de notities (*[WORKSHOP OVERRIDE …]*). (hfst 5.7)
- [ ] **Reparatie nodig en niet voor verhuur.** Verwacht: *Dit voertuig staat op "reparatie nodig"…* en *Dit voertuig staat op "niet voor verhuur"…* in hetzelfde venster. (hfst 5.7)
- [ ] **Eén venster tegelijk.** Start het ophalen vanaf het scanscherm. Verwacht: het scankaartje is weggehaald zolang het formulier en **Contract klaar** open zijn; vanaf het Dashboard sluit het scanvenster vanzelf. (hfst 5.7)
- [ ] **Contract mislukt.** (Test: verwijder alle velden uit het standaardsjabloon op de testomgeving.) Verwacht: *Voertuig succesvol opgehaald.* zonder de belofte van een contract, en **Contract kon niet gemaakt worden** met een Nederlandse reden. (hfst 5.7, 8.4)
- [ ] **Contractnummer wordt niet hergebruikt.** Annuleer een opgehaalde huur met nummer 1012. Verwacht: de volgende huur stelt 1013 voor. (hfst 5.7)

### Innemen

- [ ] **Drie startpunten.** **Innemen starten** → scan; **Scannen** → **Inleveren starten**; reservering → **Inleveren starten**. Verwacht: **Inleverproces starten**. (hfst 5.8)
- [ ] **Velden.** Verwacht: **Bij ophalen:** met de stand van toen; **Inleverdatum** (vandaag); **Kilometerstand bij inleveren**; **Brandstofniveau bij inleveren** begint op het niveau van het ophalen (of **Vol**); **Inlever-schadecheck aanmaken**; **Aanvullende notities (optioneel)**. (hfst 5.8)
- [ ] **Inleveren voltooien.** **Inleveren voltooien & schadecheck genereren**. Verwacht: **Inleveren voltooid** — *Voertuig succesvol ingeleverd. Schadecheck is gegenereerd.* en **Schadeformulier klaar** met **Afdrukken**, **Mail naar klant**, **Sluiten**. (hfst 5.8)
- [ ] **Huur meteen Voltooid.** Verwacht: de reservering staat op **Voltooid**, de auto op **Beschikbaar**, de einddatum is niet veranderd en de kilometerstand van de auto is bijgewerkt. (hfst 5.8)
- [ ] **Te lage stand.** Verwacht: **Ongeldige kilometerstand** — *Kilometerstand bij inleveren kan niet lager zijn dan bij ophalen (25000 km).* (hfst 5.8)
- [ ] **Werkplaatsstatus blijft.** Verwacht: een eventuele werkplaatsstatus verdwijnt niet vanzelf bij het innemen. (hfst 5.8, 7.5)
- [ ] **Voltooid bekijken.** **Voltooid bekijken (…)**. Verwacht: **Geschiedenis voltooide verhuur** — *Bekijk, herstel of verwijder voltooide verhuurgegevens*; zoek op voertuig, klant of kenteken, kies **Periode** (**Alle tijd**, 7, 30, 90 dagen, jaar); knoppen **Bekijken**, **Overdracht terugdraaien**, **Verwijderen**. (hfst 5.8)

### Annuleren en verwijderen

- [ ] **Reservering annuleren.** Volledig venster → **Reservering annuleren**. Verwacht: *Reservering #… wordt geannuleerd. Kies hieronder wat er met het gekoppelde moet gebeuren.* en **Hieraan hangt nog:** (transport, vervangingsreservering, placeholder, chauffeurstoewijzing). (hfst 5.9)
- [ ] **Per onderdeel kiezen.** Vink **Transport meeannuleren**, **Vervangingsreservering meeannuleren**, **Placeholder-reservering meeannuleren**, **Chauffeurstoewijzing meeannuleren** aan of uit; *Wat je niet aanvinkt, blijft gewoon staan.* (hfst 5.9)
- [ ] **Bevestigen.** **Reservering annuleren** of **Niet annuleren**. Verwacht: **Reservering geannuleerd** — *Reservering #… staat nu op Geannuleerd.* en de regel blijft zichtbaar. Hangt er niets aan: *Er hangt niets anders aan deze reservering.* (hfst 5.9)
- [ ] **Bericht aan de klant bij annuleren.** [je eigen adres als portaalklant] Annuleer de reservering van een klant mét portaalaccount. Verwacht: een melding in het portaal en een e-mail *Uw reservering is geannuleerd*; een klant zonder account krijgt niets en moet je zelf bellen. (hfst 5.9, 9.8)
- [ ] **Annuleren staat vanuit Niet opgehaald.** **… niet opgehaald** → **Annuleren** opent hetzelfde venster, met kenteken, merk en model en klant bovenin. (hfst 5.12)
- [ ] **Reservering verwijderen.** **Verwijderen**. Verwacht: **Weet je het zeker?** — *Reservering #… wordt naar de prullenbak verplaatst; terugzetten kan via Prullenbak.* en daarna **Reservering verwijderd** — *De reservering is succesvol verwijderd.* (hfst 5.10)
- [ ] **Verwijderde reserveringen.** **Verwijderde reserveringen**. Verwacht: de regel met label **Reservering**, bijvoorbeeld *Reservering #3366 — HL-02-HL 2026-10-05*, met **Terugzetten** en **Definitief verwijderen**. (hfst 5.10)
- [ ] **Terugzetten botst.** Boek de auto in die periode opnieuw en zet daarna de verwijderde reservering terug. Verwacht: *Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode.* (hfst 5.10)
- [ ] **Geen lijst van wat eraan hangt.** Het verwijdervenster van een reservering toont geen lijst; bij een voertuig wel. (hfst 5.10)

### Achterstallig en niet opgehaald

- [ ] **Te late verhuren.** **… achterstallig**. Verwacht: **Te late verhuren** met merk en model, kenteken, klant met telefoonnummer, *Had ingeleverd moeten zijn: <datum>*, **… dag(en) te laat**, **Details bekijken**. (hfst 5.11)
- [ ] **Alsnog afsluiten.** **Details bekijken** → **Inleveren starten**. Verwacht: hetzelfde venster als bij 5.8. (hfst 5.11)
- [ ] **Drie plekken.** De lijst staat ook onder **Lijstweergave** → **Achterstallig (…)** en op het Dashboard bij **Achterstallige verhuringen**. (hfst 5.11)
- [ ] **Niet opgehaalde reserveringen.** Een boeking van een maand geleden die nooit is opgehaald. Verwacht: bij het openen van de kalender (één keer per sessie) het venster **Niet opgehaalde reserveringen** en knop **… niet opgehaald**. (hfst 5.12)
- [ ] **Zoeken in die lijst.** *Zoek op kenteken, klant, contractnummer of reserveringsnummer...*; telling (*12 van 144*); *Geen niet opgehaalde reservering komt overeen met je zoekopdracht.* (hfst 5.12)
- [ ] **Bekijken en Annuleren.** Per regel **Bekijken** en **Annuleren**; zonder **Reserveringen beheren** staat **Annuleren** grijs. [kijker] ziet de lijst wel. (hfst 5.12)
- [ ] **Lege lijst.** *Geen niet opgehaalde reserveringen.* (hfst 5.12)

### Statussen en terugdraaien

- [ ] **Statussen op een rij.** Verwacht overal dezelfde namen: **Geboekt**, **Opgehaald**, **Ingeleverd**, **Voltooid**, **Geannuleerd**, ook op het scanscherm. (hfst 5.13)
- [ ] **Een ophaling terugdraaien.** [kantoor] Open een opgehaalde reservering → **Overdracht terugdraaien**. Verwacht: **Overdracht terugdraaien** — *Controleer wat er met reservering #… gebeurt voordat je bevestigt.*, *Status: Opgehaald wordt Geboekt.*, **Deze gegevens worden gewist:**, het blok **Voertuig**, **Deze documenten worden als vervallen gemarkeerd (ze worden niet verwijderd):** en **Let op**. (hfst 5.14)
- [ ] **Vinkje voor de kilometerstand.** Gaat de stand van de auto omlaag, dan staat er *Ik bevestig dat de kilometerstand van het voertuig omlaag gaat, van … km naar … km.* en de bevestigknop is grijs tot je het aanzet. (hfst 5.14)
- [ ] **Terugdraaien bevestigen.** Verwacht: **Overdracht teruggedraaid** — *Reservering #… heeft weer de status Geboekt.*; het contractnummer komt vrij; het niet-ondertekende contract krijgt **Verouderd**; in de notities staat *[TERUGGEDRAAID …]*. (hfst 5.14)
- [ ] **Annuleren in het terugdraaivenster.** Verwacht: er is niets veranderd. (hfst 5.14)
- [ ] **Een inname terugdraaien.** **Voltooid bekijken (…)** → **Overdracht terugdraaien**. Verwacht: de reservering gaat van **Voltooid** naar **Opgehaald**; inleverdatum, stand en brandstof worden gewist; de schadecheck van de inname krijgt **Verouderd**. (hfst 5.8, 5.14)
- [ ] **Een annulering terugdraaien.** Geannuleerde reservering → **Annulering terugdraaien**. Verwacht: **Annulering teruggedraaid**; naar **Opgehaald** (was opgehaald) of **Geboekt**; waarschuwing *Vervangende voertuigen, transporten en chauffeurtoewijzingen die bij de annulering zijn gesloten, worden niet opnieuw geopend.* (hfst 5.14)
- [ ] **Annulering terugdraaien, auto niet meer vrij.** Verwacht: een rood blok *Het voertuig is voor deze periode niet meer vrij, dus de annulering kan niet worden teruggedraaid.* en een grijze knop. (hfst 5.14)
- [ ] **Knop zonder het vinkje.** [zonder Overdracht terugdraaien] Verwacht: **Overdracht terugdraaien** is grijs; een tik toont het recht. (hfst 5.14, 15.9)
- [ ] **Waar de knop staat.** Controleer: kalender (kort venster en hoverkaart), lijstweergave (draai-pijltje), **Voltooid bekijken (…)**, Dashboard bij lopende verhuringen, voertuigkaart bovenaan. Het volledige venster heeft hem niet. (hfst 5.14)
- [ ] **Als er onderweg iets verandert.** Verwacht (dubbel venster): *De reservering of het voertuig is intussen gewijzigd. Hierboven staat het bijgewerkte overzicht; controleer het en bevestig opnieuw.* en *Er is niets om terug te draaien voor deze reservering.* (hfst 5.14)

### Opgehaalde huur annuleren of verwijderen

- [ ] **De waarschuwing.** [kantoor] Annuleer of verwijder een opgehaalde huur. Verwacht: *Deze huur is al opgehaald op <datum> met contract <nummer>.* en *Het voertuig telt daarna weer als beschikbaar en de kilometerstand blijft de stand van het ophalen.* en een vinkje *Ik weet dat deze huur al is opgehaald en wil doorgaan*; zonder vinkje is de knop grijs. (hfst 5.15)
- [ ] **Zonder het recht.** [balie zonder Opgehaalde huur annuleren of verwijderen] Verwacht: de knop is grijs met een tekstballon; via een omweg: *Voor een opgehaalde huur is het recht 'Opgehaalde huur annuleren of verwijderen' nodig.* (hfst 5.15)
- [ ] **Vervangende huur via een onderhoudsvenster.** Verwacht: *Dit vervangende voertuig is al opgehaald, dus de toewijzing kan hier niet worden verwijderd. Annuleer of verwijder de vervangreservering via Reserveringen; daar krijg je de waarschuwing en bevestig je het.* (hfst 5.15)

---

## Hoofdstuk 6 — Transport

- [ ] **Transportdashboard.** **Transporten**. Verwacht: **Aankomend transport**, **Laatste transport**, de tellers **Wacht op planning**, **Klaar voor levering**, **In uitvoering**, **Leveringen voltooid**, **Route-optimalisatie**, de zes tabbladen met aantallen, de tabel **Voertuigtransporten**. (hfst 6.1)
- [ ] **Zoeken en filter.** *Transporten zoeken...*; het filter **Alle statussen** (**Gepland**, **Bezig**, **Voltooid**, **Geannuleerd**). (hfst 6.1)
- [ ] **Kolommen.** **Voertuig**, **Vervangend voertuig**, **Type**, **Route**, **Datum**, **Afstand**, **Tolkosten**, **Facturatie**, **Status**, **Acties**; een auto die niet van ons is heeft het label **Extern**; één kant onbekend: *Eindhoven → onbekend*. (hfst 6.1)
- [ ] **Iconen hebben een naam.** Houd de muis op elke icoon: **Bekijken**, **Markeren als voltooid**, **Vervangend voertuig markeren als opgehaald**, **Vervangend voertuig markeren als teruggebracht**, **Afdrukken / rapport genereren**, **Bewerken**, **Verwijderen**; ook het prullenbakje. Grijs met uitleg: *Al voltooid of geannuleerd*, *Nog geen vervangend voertuig toegewezen*, *Vervangend voertuig nog niet opgehaald*. (hfst 6.1)
- [ ] **Meerdere regels.** Vink regels aan. Verwacht: een balk met **… geselecteerd**, **Afdrukken**, **Markeer voltooid**, **Wissen**. (hfst 6.1)
- [ ] **Transport plannen.** **Nieuw transport**. Verwacht: **Transport registreren**. Kies **Type** (**Voertuigwissel**, **Slepen**, **Terughalen**, **Levering**, **Overig**), **Status** op **Gepland**, een **Voertuig**, **Geplande datum** (verplicht) → **Transport registreren**. Verwacht: **Transport geregistreerd** — *De transportopdracht is geregistreerd.* (hfst 6.2)
- [ ] **Extern voertuig.** Vink **Extern voertuig (niet in ons wagenpark)** aan. Verwacht: velden **Kenteken** (met **Opzoeken via RDW**), **Kleur**, **Merk**, **Model**, **Naam eigenaar**, **Telefoon eigenaar**; het voertuig komt niet in **Voertuigen**. (hfst 6.2)
- [ ] **Adressen en afstand.** Vul **Van (optioneel)** en **Naar (optioneel)** in → **Berekenen**. Verwacht: een afstand in km; zonder adressen een streepje. (hfst 6.2)
- [ ] **Tolkosten voorstellen.** **Voorstellen**. Verwacht: een bedrag op basis van *€0.15/km — instelbaar in Instellingen*; met **Retour — voorstel omvat de lege terugrit** aan rekent het voorstel de lege terugrit mee. (hfst 6.2)
- [ ] **Doorbelasten.** Zet **Doorbelasten aan klant** aan, kies de **Klant**, vul **Te factureren bedrag (€)** in; **Al gefactureerd aan de klant**. Verwacht: **Facturatie** toont **Gefactureerd**, **Niet gefactureerd** of **Niet factureerbaar**. (hfst 6.2)
- [ ] **Chauffeur, reden, notities.** Velden **Chauffeur (optioneel)**, **Reden (optioneel)**, **Notities (optioneel)**. (hfst 6.2)
- [ ] **Auto staat uit bij een klant.** Kies een verhuurde auto. Verwacht: een oranje kader *Dit voertuig staat momenteel uit bij <klant>. …* met de knop **Vervangend voertuig vereist markeren**. (hfst 6.2)
- [ ] **Voertuigwissel.** **Type = Voertuigwissel**; zet **Pech- of onderhoudswissel** aan (*Onze eigen kosten, niet die van de klant — standaard niet gefactureerd.*). (hfst 6.3)
- [ ] **Vervangend voertuig kiezen.** Zet **Vervangend voertuig vereist** aan en kies een auto. Verwacht: het label **Vervangend voertuig (het voertuig dat als vervanger wordt ingezet)**; alleen auto's die op de geplande datum vrij zijn. (hfst 6.4)
- [ ] **TBD.** Laat het leeg. Verwacht: **Vervangend voertuig (TBD — nog niet geselecteerd)** en op het dashboard het label **TBD**. Het kruisje (*Wissen (terug naar TBD)*) zet hem terug. (hfst 6.4)
- [ ] **Later toewijzen.** Op het dashboard **Selecteren** bij **TBD** → kies → **Wijzigingen opslaan**. Verwacht: **Transport bijgewerkt** — *De transportopdracht is bijgewerkt.* en het label wordt **Toegewezen**. (hfst 6.4)
- [ ] **Rapport zonder vervanger.** Verwacht: **Afdrukken / rapport genereren** is grijs met *Voor dit transport is een vervangend voertuig vereist, maar er is er nog geen geselecteerd. …* (hfst 6.4)
- [ ] **Transport starten op het scanscherm.** **Scannen** → een auto met transport → blok **Actief transport** (route en **Gepland**) → **Transport starten**. Verwacht: **Transport gestart**, label **Onderweg**, knop **Transport afronden**; op het dashboard **Bezig**. Op het transportdashboard zelf is er geen startknop. (hfst 6.5)
- [ ] **Transport afronden op het scanscherm.** **Transport afronden**. Verwacht: **Transport afgerond**. (hfst 6.6)
- [ ] **Transport afronden vanaf het dashboard.** **Markeren als voltooid**. Verwacht: **Transport afronden?** — *Het transport wordt als voltooid gemarkeerd. Dat kun je daarna niet zomaar terugdraaien.*; **Afgerond op** (vandaag), **Uitkomst**; **Afronden**; daarna **Transport gemarkeerd als voltooid**; de uitkomst staat in de notities met *Uitkomst:*. (hfst 6.6)
- [ ] **In bulk.** Vink regels aan → **Markeer voltooid**. Verwacht: geen extra vraag. (hfst 6.6)
- [ ] **Vraag over de vervanger.** Rond een transport met vervanger af. Verwacht: **Vervangend voertuig markeren als opgehaald?** met **Later** en **Nu markeren als opgehaald**. Kies je het laatste: het gewone ophaalvenster. (hfst 6.6)
- [ ] **Vervanger terug.** **Vervangend voertuig markeren als teruggebracht** → **Vervangend voertuig markeren als teruggebracht?**. De vier standen: **TBD** → **Toegewezen** → **Opgehaald** → **Teruggebracht**. (hfst 6.6)
- [ ] **Rapport maken.** **Afdrukken / rapport genereren**. Verwacht: **Rapport gemaakt** — *Het rapport staat in Documenten en wordt hieronder getoond.* en een voorvertoning met een bestandsnaam zoals *Transport_Report_…pdf*; **Afdrukken** of **Sluiten**. (hfst 6.7)
- [ ] **Rapport voor meerdere.** Vink regels aan → **Afdrukken** (maximaal 50). Het rapport staat ook bij **Documenten**. (hfst 6.7)
- [ ] **Fouten bij het rapport.** Verwacht bij geblokkeerde pop-ups: **Pop-up geblokkeerd** — *Sta pop-ups voor deze site toe en klik daarna opnieuw op Afdrukken.*; bij een geblokkeerde voorvertoning **Openen in nieuw tabblad**. (hfst 6.7)
- [ ] **Route-optimalisatie.** **Route-optimalisatie** → **Datum** → **Route optimaliseren**. Verwacht: een volgorde met **Totale afstand** en **Openen in Google Maps (nieuw tabblad)**. Grijs: *Er is op deze datum niets gepland. Kies een andere datum.* of *Geen van de geplande ritten heeft een adres of plaats. Vul die eerst in.* (hfst 6.8)
- [ ] **Bekijken.** **Bekijken**. Verwacht: **Type**, **Status**, **Vervangend voertuig**, **Route**, **Datum**, **Voltooiingsdatum**, **Afstand**, **Tolkosten**, **Facturatie**, **Klant**, **Chauffeur**, **Reden**, **Notities**; bij een reservering **Levering vanuit reservering #…** met **Open reservering**. (hfst 6.9)
- [ ] **Bewerken.** **Bewerken** → **Wijzigingen opslaan**. (hfst 6.9)
- [ ] **Verwijderen en terugzetten.** Prullenbakje. Verwacht: **Dit transport verwijderen?**; **Verwijderde transporten** → de regel met label **Transport** (*Transport #47 — …*) → **Terugzetten**; het vervangend voertuig wordt heropend als hij nog vrij is. **Definitief verwijderen** werkt op dezelfde plek. (hfst 6.9)

---

## Hoofdstuk 7 — Onderhoud

### Kalender en dagvenster

- [ ] **Onderhoudskalender.** [werkplaats] **Onderhoud**. Verwacht: **Onderhoudsplanning** met **Lijstweergave**, **Voltooide bekijken (…)**, **Verwijderd onderhoud**, **Onderhoud plannen**; **Kleuren**, **Vandaag**, filters **Zoek voertuigen of evenementen...**, **Voertuigtype**, **Evenementtype**. (hfst 7.1)
- [ ] **Signalen.** Verwacht: **APK-keuring verschuldigd**, **APK Herinnering (2 maanden)**, **APK Herinnering (1 maand)**, **Garantie verloopt**, **Garantie Herinnering (2 maanden)**, **Garantie Herinnering (1 maand)**; **(Verplaatst van het weekend)** bij een weekenddatum. (hfst 7.1)
- [ ] **Blokken en labels.** Verwacht: **Gepland onderhoud**, **In onderhoud**, **Onderhoudsbeurt nodig** en labels **Vervanger nodig**, **Vervangend voertuig nodig**, **Verhuur komt eraan**, **Verhuur komt eraan (binnen 3 weken)**. (hfst 7.1)
- [ ] **Dag openen.** Klik een dagvakje. Verwacht: **Onderhoudsevenementen - <datum>**; bij een signaal alleen **Onderhoud plannen**; bij een blok **Afronden**, **Bewerken**, **Verwijderen**, **Onderhoud bekijken**; leeg: *Geen onderhoudsevenementen gepland voor deze dag*. (hfst 7.1)

### Onderhoud plannen

- [ ] **Venster.** **Onderhoud plannen**. Verwacht: *Meld pech, plan reparaties of onderhoud voor je voertuigen. …* (hfst 7.2)
- [ ] **Voertuigkeuze en filters.** *Selecteer een voertuig...* met **Alleen beschikbare voertuigen tonen** en **Voertuigen met bestaand onderhoud uitsluiten**. (hfst 7.2)
- [ ] **Klant.** Zoekveld *Zoek op naam, telefoon of plaats...*; *Geen klanten gevonden.*; bovenaan **Geen (geen klant)**; bij een lopende verhuring het label **Actieve verhuur**. (hfst 7.2)
- [ ] **Veertien onderhoudstypen.** Verwacht: **Voertuigpech**, **Bandenwissel**, **Remmenonderhoud**, **Motorreparatie**, **Transmissiereparatie**, **Elektrisch probleem**, **Airconditioning**, **Accuwissel**, **Olieverversing**, **Regulier onderhoud**, **APK-keuring**, **Garantieservice**, **Ongevalschade**, **Overig**. (hfst 7.2)
- [ ] **Geplande datum en duur.** **Geplande datum**, **Duur (dagen)**, **Omschrijving**, **Notities**. Er is geen einddatum. (hfst 7.2)
- [ ] **Geen statusveld bij het plannen.** Verwacht: een nieuw blok staat op gepland; **Status** zie je pas bij **Bewerken**. **(nieuw)** (hfst 7.2)
- [ ] **Plannen.** **Onderhoud plannen**. Verwacht: **Onderhoud gepland** — *Het onderhoud is gepland en de herinneringen zijn bijgewerkt.* en het blok staat in de kalender. (hfst 7.2)
- [ ] **Geannuleerde huur telt niet.** Plan op een auto met alleen een geannuleerde of voltooide huur. Verwacht: geen tweede stap, gewoon plannen. (hfst 7.2)

### Vervangers en plannen afbreken

- [ ] **Tweede stap.** Plan op een auto met een lopende huur. Verwacht: **Vervangende voertuigen toewijzen** — *Het geselecteerde voertuig heeft actieve reserveringen tijdens de onderhoudsperiode. …* met per reservering **Vervoersoplossing:** **Nu vervangend voertuig toewijzen**, **Later vervanger toewijzen (nog te bepalen)**, **Klant regelt eigen vervoer**. (hfst 7.2)
- [ ] **Huurperiode vervanger.** **Bewerken** achter *Vervangende verhuur*. Verwacht: **Huurperiode vervanger instellen** met **Onderhoudsdata gebruiken** en **Open einde maken**. (hfst 7.2)
- [ ] **Geen keuze gemaakt.** Verwacht: **Ontbrekende toewijzingen vervangend voertuig** — *Kies een specifiek voertuig of 'Nog te bepalen' voor alle betrokken reserveringen.* (hfst 7.2)
- [ ] **Afronden met één klik.** **Vervangers toewijzen & onderhoud plannen**: één klik is genoeg, ook als de lijst met auto's openstaat. (hfst 7.2)
- [ ] **Plannen afbreken.** In dit venster **Annuleren** (of Escape, het kruisje, naast het venster). Verwacht: **Plannen afbreken?** — *Het onderhoud wordt weer weggehaald. Wilt u zonder vervanger plannen, kies dan bij de klant 'Later vervanger toewijzen'.* **(nieuw)** (hfst 7.2)
- [ ] **Doorgaan met plannen.** Verwacht: je bent terug in het venster, het onderhoud staat er nog. **(nieuw)** (hfst 7.2)
- [ ] **Plannen afbreken bevestigen.** **Plannen afbreken**. Verwacht: **Plannen afgebroken** — *Het onderhoud is weer weggehaald.* en het blok staat niet in de kalender en niet in **Verwijderd onderhoud**. **(nieuw)** (hfst 7.2)
- [ ] **Afbreken zonder omweg gaat alleen bij nieuw onderhoud.** Open het venster een uur later opnieuw voor bestaand onderhoud (of met een vervanger). Verwacht: **Onderhoud verwijderd** — *Het onderhoud staat in de prullenbak en kan daar worden teruggezet.* **(nieuw)** (hfst 7.2)
- [ ] **De klant hoort ervan.** Had de klant al een melding "onderhoud gepland", dan krijgt hij ook te horen dat het niet doorgaat; anders hoort hij niets. **(nieuw)** (hfst 7.2)

### Beschikbaarheid en onderhoud

- [ ] **Gepland blok zet de auto op Gepland.** Verwacht: lijst en scanscherm tonen **Gepland**. **(nieuw)** (hfst 7.3)
- [ ] **Een verhuurde auto blijft Verhuurd.** Plan vandaag onderhoud op een auto die bij een klant staat. Verwacht: **Verhuurd**. **(nieuw)** (hfst 7.3)
- [ ] **Boeken mag, met geel.** Verwacht: de auto staat in de keuzelijst met de gele waarschuwing en opslaan mag. (hfst 7.3)
- [ ] **Telling voorzichtig.** Verwacht: zo'n auto telt op het Dashboard niet bij **Beschikbare voertuigen**. (hfst 7.3)
- [ ] **Ophalen mag met waarschuwing; Binnen weigert.** Zie ook hoofdstuk 5. Op **Binnen** verschijnt **Uitgifte geblokkeerd**. (hfst 7.3)
- [ ] **Vervanger toewijzen vanuit de huur.** Open de reservering → **Voertuig markeren voor onderhoud** → **Vervangend voertuig toewijzen** → **Startdatum**, **Einddatum**, **Beschikbare vervangende voertuigen** → **Vervangend voertuig toewijzen**. Verwacht: **Vervangend voertuig toegewezen** — *Het vervangende voertuig is succesvol toegewezen.* (hfst 7.4)
- [ ] **Slechts één knop tegelijk.** Verwacht in **Voertuigservice**: in orde → alleen **Voertuig markeren voor onderhoud**; **Onderhoud nodig** of **Momenteel in onderhoud** → **Vervangend voertuig toewijzen**; met een vervanger → het oranje blok met **Terug van onderhoud**. (hfst 7.4)
- [ ] **Later toewijzen (placeholder).** Verwacht: **TBD** in de kalender; op het Dashboard bij **Beheer vervangende voertuigen** → **Nog te bepalen** *Vervangend voertuig (nog te bepalen)* met **Voertuig toewijzen**; in het overzicht tabblad **Vervangers (…)** met *Toewijzing nodig* en **Toewijzen**. (hfst 7.4)
- [ ] **Meerdere tegelijk.** Verwacht: **Vervangende voertuigen toewijzen** met per regel **Selecteer voertuig** en **… voertuigen toewijzen**. (hfst 7.4)
- [ ] **In het onderhoudsvenster.** **Onderhoud bekijken**. Verwacht: **Toewijzingen vervangend voertuig** met **Toegewezen vervangend voertuig** en de opties **Nog te bepalen (Placeholder)** en **Eigen vervoer**. (hfst 7.4)

### Werkplaatsstatus

- [ ] **Voertuig markeren voor onderhoud.** Reservering → **Voertuig markeren voor onderhoud** → **Onderhoudsstatus** (**Onderhoud nodig** of **Momenteel in onderhoud**) → **Servicenotities** → **Markeren voor onderhoud**. Verwacht: **Voertuig gemarkeerd voor onderhoud** — *Het voertuig is succesvol gemarkeerd als onderhoud nodig.*, de auto staat op **In reparatie** en er is een blok. (hfst 7.5)
- [ ] **Onderhoud inplannen vanaf het scanscherm.** **Onderhoud inplannen** opent **Onderhoud plannen** met de auto ingevuld. (hfst 7.5, 18.4)
- [ ] **Terug uit onderhoud, met een lopend onderhoud.** [werkplaats] Een auto op **Binnen** in een blok van vandaag → **Scannen** → **Terug uit onderhoud**. Verwacht: het venster **Onderhoud afronden** opent (geen directe klik); **Afronden** geeft **Onderhoud afgerond**. **(nieuw)** (hfst 7.5, 18.4)
- [ ] **Terug uit onderhoud zonder blok.** Een auto in de werkplaats zonder blok op Binnen. Verwacht: één klik, **Voertuig is terug uit onderhoud**. (hfst 7.5)
- [ ] **Alleen Voertuigen beheren is niet genoeg.** [alleen Voertuigen beheren] Zelfde auto op **Binnen**. Verwacht: **Terug uit onderhoud** is grijs; een tik zegt dat **Onderhoud beheren** of **Reserveringen beheren** ontbreekt. Een auto in de werkplaats *zonder* lopend onderhoud geeft dit account wel vrij. **(nieuw)** (hfst 7.5, 15.11)
- [ ] **Alleen Onderhoud beheren is genoeg.** [werkplaats zonder Voertuigen beheren] Verwacht: het venster **Onderhoud afronden** opent meteen. **(nieuw)** (hfst 7.5)
- [ ] **Terug van onderhoud (vervanger).** Reservering met oranje blok **Vervangend voertuig toegewezen** (*Voertuig wordt momenteel onderhouden*) → **Terug van onderhoud** → **Inleverdatum**, **Huidige kilometerstand**, **Servicenotities**. Verwacht: **Voertuig teruggekeerd van onderhoud** — *Het voertuig staat weer op beschikbaar, het onderhoudsblok van vandaag is afgesloten en de vervangende reservering is beëindigd.* (hfst 7.5)
- [ ] **Onderhoud later in de kalender blijft staan.** (hfst 7.5)

### Onderhoud afronden

- [ ] **Wie het mag.** [werkplaats] **Afronden** werkt met **Onderhoud beheren** of **Reserveringen beheren**; zonder een van beide staat de knop grijs. (hfst 7.6)
- [ ] **Venster Onderhoud afronden.** Dagvenster → **Afronden**. Verwacht: *Bekijk en werk de voertuiggegevens bij na het afronden van het onderhoud.* met **Voertuiginformatie** (**Kenteken**, **Voertuig**, **Onderhoudstype**, **Laatst bekende kilometerstand**, **Huidige APK**) en **Afrondingsdetails**. (hfst 7.6)
- [ ] **Voorgevulde velden.** **Afrondingsdatum** (begindatum van het blok), **APK-datum** (huidige datum of berekend), **Huidige kilometerstand (km)**. Verwacht: wat er staat wordt opgeslagen; maak de APK-datum leeg als de auto niet gekeurd is. (hfst 7.6)
- [ ] **APK-formulier.** **APK-keuringsformulier (optioneel)** (pdf, jpg of png). (hfst 7.6)
- [ ] **Servicecategorie en details.** **Servicecategorie** (**Gepland onderhoud** of **Reparatie**) en **Onderhoudsdetails**. (hfst 7.6)
- [ ] **Afronden.** **Afronden**. Verwacht: **Onderhoud afgerond** met je omschrijving (*Onderhoud afgerond: olie- en filterwissel.*); het blok verdwijnt uit de kalender en staat onder **Voltooide bekijken**. **(nieuw: Afronden in plaats van Uit)** (hfst 7.6)
- [ ] **Alles in één handeling.** Controleer daarna: einddatum van het blok = afrondingsdatum; APK-datum en kilometerstand op de voertuigkaart; bij **Gepland onderhoud** ook de laatste servicedatum en -stand; het APK-formulier staat als document bij de auto én het blok; de werkplaatsstatus is eraf; een open vervanger is gesloten. (hfst 7.6)
- [ ] **Afrondingsdatum vóór de begindatum.** Verwacht: geweigerd. (hfst 7.6)
- [ ] **Te lage kilometerstand.** Verwacht: *De kilometerstand (… km) is lager dan de huidige stand van het voertuig (… km). Controleer de stand; er is niets opgeslagen.*, het blok blijft open; een gelijke stand mag. (hfst 7.6)
- [ ] **Alles of niets.** Laat het afronden mislukken (testomgeving). Verwacht: *Onderhoud afronden mislukt. Probeer het opnieuw.*, het venster blijft open, niets half opgeslagen. (hfst 7.6)
- [ ] **Alle plekken hetzelfde woord.** **Afronden** staat in het dagvenster, in het tabblad **Gepland** van het overzicht, in het bewerkvenster en in het scanvenster; het woord *Voltooien* komt voor onderhoud nergens meer voor. **(nieuw)** (hfst 7.6)
- [ ] **Uit bestaat niet meer.** **Bewerken** op een blok. Verwacht: **Status** heeft alleen **Gepland (voertuig nog niet gearriveerd)** en **Binnen (voertuig is in onderhoud)**; onderaan de knop **Afronden**. **(nieuw)** (hfst 7.6)
- [ ] **Afgerond blok bewerken.** Verwacht: in plaats van een statuskeuze *Afgerond op <datum>*. (hfst 7.6)
- [ ] **Afronden via de status kan niet.** Alleen op een oude pagina: *Een onderhoud rond je af met de knop Afronden, niet met de status.* (code `USE_COMPLETE_ROUTE`); een tweede afronding: *Dit onderhoud is al afgerond.* (code `ALREADY_COMPLETED`). **(nieuw)** (hfst 7.6, 12)
- [ ] **Onderhoudstype in het Nederlands.** In het venster staat het type zoals *Pech*. (hfst 7.6)
- [ ] **Terug in dienst.** Na **Afronden**: scan de auto. Verwacht: **Beschikbaar** en geen oranje blok **Onderhoud**. Stond de auto op **Niet voor verhuur**, dan blijft dat zo. (hfst 7.7)

### Overzicht en geschiedenis

- [ ] **Onderhoudsoverzicht.** **Lijstweergave**. Verwacht: **Onderhoudsoverzicht** met totaal en zoekveld *Zoek voertuigen, kentekens, klanten...* en vier tabbladen: **APK (…)**, **Garantie (…)**, **Gepland (…)**, **Vervangers (…)**. (hfst 7.8)
- [ ] **APK-tab.** Kolom **Urgentie**: *… dagen te laat*, *Vandaag verschuldigd*, *… dagen resterend*; knoppen **Plannen** en **Bekijken**. (hfst 7.8)
- [ ] **Afronden vanuit het overzicht.** Tabblad **Gepland** → **Afronden**. Verwacht: hetzelfde venster, al ingevuld met APK-datum en kilometerstand van de auto. (hfst 7.8)
- [ ] **Binnen melden.** [werkplaats] Een blok op *gepland* → **Binnen melden**. Verwacht: **Voertuig binnen gemeld** — *Het onderhoud staat op Binnen en het voertuig is in onderhoud.*; de auto staat op **Reparatie nodig**; een blok dat al *Binnen* is, heeft alleen **Afronden**. **(nieuw)** (hfst 7.8)
- [ ] **Rechten bij de knoppen.** **Afronden** vraagt **Onderhoud beheren** of **Reserveringen beheren**; **Binnen melden** vraagt **Voertuigen beheren**. Zonder: de knop is grijs, een tik zegt welk vinkje. (hfst 7.8)
- [ ] **Verwijderen of annuleren wist de reparatiestand.** Zet een blok op **Binnen** (auto: **Reparatie nodig**), verwijder het blok. Verwacht: de auto is niet langer **Reparatie nodig**. **(nieuw)** (hfst 7.8)
- [ ] **Omschrijving in het Nederlands.** *Pech: lekke band* in plaats van *breakdown: lekke band*; oude blokken heten *Onderhoudsblok*. (hfst 7.8)
- [ ] **Voltooide bekijken.** **Voltooide bekijken (…)**. Verwacht: **Geschiedenis voltooid onderhoud** — *Voltooide onderhoudsrecords bekijken, bewerken, terugdraaien of verwijderen* met type, label **Gepland** of **Reparatie**, *Voltooid: <datum>*. (hfst 7.8)
- [ ] **Terugdraaien.** **Terugdraaien**. Verwacht: **Onderhoud teruggedraaid** — *Onderhoud is weer gemarkeerd als actief*; het blok staat weer op **Binnen**, de auto op **Reparatie nodig**, en je kunt het bewerken of opnieuw met **Afronden** afsluiten. **(nieuw)** (hfst 7.8)
- [ ] **Verwijderen.** **Verwijderen** in deze lijst: *Dit onderhoudsrecord wordt naar de prullenbak van dit scherm verplaatst (knop Verwijderd onderhoud); terugzetten kan daar.* (hfst 7.8)
- [ ] **Prullenbak van Onderhoud.** [kantoor] **Verwijderd onderhoud**. Verwacht: label **Onderhoud**; **Terugzetten** werkt ook als er intussen een verhuring op die dagen staat; **Definitief verwijderen** per regel, selectie of **Prullenbak leegmaken**; documenten van de auto zoals een APK-bewijs blijven. (hfst 7.8)
- [ ] **Grijs zonder vinkje.** [zonder Prullenbak beheren] **Verwijderd onderhoud** is grijs. (hfst 7.8)

### Portaalaanvraag voor onderhoud

- [ ] **Aanvraag openen.** **Klantenportaal** → tegel **Aanvragen** of **Onderhoud**. Verwacht: **Aanvraag #<nummer>** met het soort (**Onderhoud/storing** of **Onderhoud wijzigen**) en de klant. (hfst 7.9)
- [ ] **Melding van de klant.** Verwacht: **Klacht**, **Kilometerstand**, **Dringend**, **Vervangend vervoer gewenst**, **Gewenste datum**; bij verzetten **Nu gepland op**, **Gevraagde datum**, **Reden**; **Bijlagen**. (hfst 7.9)
- [ ] **In behandeling nemen.** Verwacht: de status verandert. (hfst 7.9)
- [ ] **Inplannen.** **Inplannen in de onderhoudskalender** → **Datum** (*Alleen werkdagen (ma t/m vr)*), **Duur (dagen)**, **Soort** → **Notitie voor de klant** → **Inplannen en bevestigen**. Verwacht: **Onderhoud #… staat in de kalender**. (hfst 7.9)
- [ ] **Verplaatsen.** **Onderhoud verplaatsen** → **Verplaatsen en bevestigen**. Verwacht: **Onderhoud #… is verplaatst**. (hfst 7.9)
- [ ] **Antwoord sturen en afwijzen.** **Antwoord sturen (blijft open)**; **Afwijzen** zonder tekst: *Vul een antwoord in.* (hfst 7.9)
- [ ] **Geen Beantwoorden en afhandelen bij onderhoud.** Verwacht: de tip *Een onderhoudsmelding kan alleen worden afgehandeld via Inplannen (zet het in de kalender) of Afwijzen.* (hfst 7.9)

---

## Hoofdstuk 8 — Documenten en afdrukken

- [ ] **Vier soorten papier.** Controleer dat de app **Huurcontract**, **Schadecheck**, **Transportrapport** en labels maakt, en géén getekend contract of factuur. (hfst 8.1)
- [ ] **Nederlandse notatie.** Open een contract. Verwacht: datums als 13-09-2026, bedragen als € 1.234,50; zonder einddatum: **nader te bepalen**. (hfst 8.2)
- [ ] **Tijd op een gedrukt document.** Controleer dat een tijd op een document of export de Nederlandse klok is (niet 1 of 2 uur ernaast). **(nieuw)** (hfst 10.3)
- [ ] **Documentbibliotheek.** **Documenten** → **Documentbibliotheek**. Verwacht: aantallen voertuigen, documenten en documenttypen; filters **Alle voertuigen**, **Alle documenttypen**; **Documenten zoeken...** (op bestandsnaam, kenteken met of zonder streepjes, merk, model, documenttype); **Alles uitklappen** / **Alles inklappen**; kenteken-sortering; *Geen documenten gevonden die overeenkomen met je filters.* (hfst 8.3)
- [ ] **Document uploaden.** [kantoor] **Document uploaden**. Verwacht: kies eerst het voertuig, het formulier verschijnt in hetzelfde venster; met een voertuigfilter staat het voertuig voorgevuld. Zonder **Documenten bewerken en genereren**: grijs, een tik zegt welk vinkje. (hfst 8.3, 8.7)
- [ ] **Documenten bij het voertuig en bij de reservering.** Voertuigkaart → **Documenten**; reservering → **Reserveringsdocumenten** — *Documenten specifiek gekoppeld aan deze reservering (contracten, schaderapporten, foto's)*. (hfst 8.3)
- [ ] **Nederlandse kopjes.** Verwacht: **Contract (niet ondertekend)**, **Contract (ondertekend)**, **Schadecheck (ophalen)**, **Schadecheck (inleveren)**, **Transportrapport**; kentekens met streepjes. (hfst 8.3)
- [ ] **Contract klaar.** Na het ophalen: **Contract klaar** — *<bestandsnaam> is aangemaakt. Print het of mail het direct naar de klant.* met **Afdrukken**, **Mail naar klant**. (hfst 8.4)
- [ ] **Contract kon niet gemaakt worden.** Verwacht: een Nederlandse reden (zie hieronder) en **Opnieuw proberen**; het ophalen is wel verwerkt, en er staat geen kapot bestand in de bibliotheek. (hfst 8.4)
- [ ] **Mislukte schadecheck.** Verwacht: geen knop **Opnieuw proberen**; maak de check opnieuw vanuit het schadecheckscherm. (hfst 8.4)
- [ ] **Vijf knoppen per document.** **Bekijken** (voorvertoning), **Downloaden**, **Afdrukken**, **E-mailen**, **Verwijderen**. (hfst 8.4)
- [ ] **Afdrukken.** Verwacht: *Afdrukken gestart — Het afdrukvenster zou nu open moeten zijn. De pop-up sluit automatisch.* Bij een pop-upblokkade: *Je browser heeft afdrukken geblokkeerd. Gebruik de downloadknop en druk handmatig af.* of *Sta pop-ups toe en probeer het opnieuw, of gebruik de downloadknop.* (hfst 8.4)
- [ ] **Interactieve schadecheck.** Voertuigkaart → **Documenten** → **Nieuwe check**. Verwacht: een diagram; ontbreekt het modeldiagram: **Geen diagram voor dit model** met merk en model van het getoonde diagram; een onbruikbaar diagram: een rood blok **Dit diagram is niet bruikbaar**. (hfst 8.4)
- [ ] **Wat je aanklikte.** Een gekozen antwoord heeft een vinkje en rand; een leeg veld zegt *niet ingevuld*; per blok *3 van 8 ingevuld*. (hfst 8.4)
- [ ] **Alles goed.** Per blok **Alles goed**: vult alleen de lege velden. (hfst 8.4)
- [ ] **Opslaan.** Verwacht: *Bezig met opslaan…* en daarna *Opgeslagen om 14:32. De PDF is klaar.* en geen melding **Check geladen**. (hfst 8.4)
- [ ] **Check en inleveren.** Boven het formulier staat dat de schadecheck-PDF bij het inleveren de laatst opgeslagen check overneemt. (hfst 8.4)
- [ ] **Sjablonen: tabbladen.** **Contractsjablonen**, **Transportrapportsjablonen**, **Barcodelabels**, **Schadecheck-sjablonen**. [kantoor zonder PDF-sjablonen beheren] **Contractsjablonen** en **Transportrapportsjablonen** zijn grijs; een tik zegt welk vinkje. (hfst 8.5)
- [ ] **Tapesjabloon maken.** **Barcodelabels** → **Nieuw sjabloon** → naam, **Soort label** op **DYMO-tape (48 x 12 mm)** → aanmaken. Verwacht: een sjabloon van 48 bij 12 met **Lengte (mm)**, **Tapebreedte (mm)**, de schakelaar **DYMO-tape: staand afdrukken, inhoud gedraaid** aan, en drie velden (barcode, kenteken, **Sleutel (Hoofd/Reserve)** met voorbeeld *Hoofd*). Voeg een veld **Vaste tekst** toe, sla op; kies dit sjabloon op de voertuigkaart bij **Labelsjabloon** en druk af: staand, gedraaid, met je tekst. (hfst 8.5, 18.9)
- [ ] **Sjablooneditor.** **Sjablooneditor openen**; sleep velden; **Als standaard instellen**; het label **Standaard**. (hfst 8.5)
- [ ] **Sjabloon zonder velden.** Zet een leeg sjabloon op standaard. Verwacht: *Een sjabloon zonder velden kan niet het standaardsjabloon zijn: elk contract dat ermee wordt gemaakt zou leeg zijn. Plaats eerst minstens één veld.* Leeg je het standaardsjabloon: een rood blok **Dit standaardsjabloon heeft geen velden**. (hfst 8.5)
- [ ] **Niet-opgeslagen wijzigingen.** In de editor staat *Er zijn niet-opgeslagen wijzigingen.* of *Alle wijzigingen zijn opgeslagen.* Sluit met wijzigingen: **Wijzigingen niet opgeslagen** — *Je hebt wijzigingen aan dit sjabloon die nog niet zijn opgeslagen. Als je de editor nu sluit, gaan ze verloren.* met **Verder bewerken** en **Wijzigingen weggooien**; ook bij een ander sjabloon kiezen. Geldt voor contract-, transportrapport- en barcodelabel-editor. (hfst 8.5)
- [ ] **Escape na opslaan.** De eerste Escape direct na **Opslaan** wordt door de melding opgevangen; wacht even of klik **Sluiten**. (hfst 8.5)
- [ ] **Contractfouten in het Nederlands.** Controleer één voor één wat je kunt nabootsen: geen sjabloon (*Er is geen contractsjabloon ingesteld. Maak er een aan onder Documenten → Contractsjablonen en klik dan op Opnieuw proberen.*), meerdere maar geen standaard (*Er zijn meerdere sjablonen maar geen standaard. Kies een standaardsjabloon onder Documenten → Contractsjablonen.*), sjabloon zonder velden (*Het contractsjabloon 'naam' heeft geen velden. …*), enzovoort. (hfst 8.5)
- [ ] **Opnieuw genereren geeft ook Nederlands.** Verwacht: bij een fout *Er is geen contractsjabloon ingesteld. Maak er een aan onder Documenten → Contractsjablonen.*; nooit een Engelse tekst met *400:* ervoor. (hfst 8.5)
- [ ] **Verouderd.** Wijzig de datums van een reservering met een contract. Verwacht: het contract krijgt het oranje label **Verouderd** · versie 1 met de uitleg *Dit document is gemaakt vóór een wijziging aan de reservering en klopt mogelijk niet meer.* en de reden *de reservering is gewijzigd nadat dit document was gemaakt*. (hfst 8.6)
- [ ] **Opnieuw genereren.** **Opnieuw genereren**. Verwacht: *Bezig met genereren…* en **Nieuwe versie aangemaakt** — *Versie 2 van <bestandsnaam> staat nu in het dossier. De oude versie blijft bewaard.*; de oude versie houdt **Verouderd**, de nieuwe is schoon. De knop staat in de bibliotheek én in **Reserveringsdocumenten**. (hfst 8.6)
- [ ] **Waar de knop niet staat.** Bij een geüpload document, een transportrapport en een document zonder reservering. (hfst 8.6)
- [ ] **Verouderd na terugdraaien.** Draai een ophaling terug. Verwacht: het niet-ondertekende contract krijgt **Verouderd** (*de overdracht is teruggedraaid*) en wordt niet verwijderd. **(nieuw)** (hfst 8.6)
- [ ] **De twee documentrechten.** [kijker met Documenten bekijken] kan openen, downloaden, afdrukken maar niet genereren, mailen, uploaden of verwijderen: *Not authorized. One of these permissions required: manage_documents*. [zonder beide] ziet het menu-item **Documenten** niet. (hfst 8.7)

---

## Hoofdstuk 9 — E-mail versturen vanuit de app

Gebruik bij deze regels **altijd je eigen e-mailadres** als ontvanger.

### Documenten mailen

- [ ] **Venster openen.** Bij een document **E-mailen**, of **Mail naar klant** na het ophalen, of vanuit de kalender. Verwacht: **Documenten e-mailen naar klant** — *Selecteer documenten, ontvanger en taal om naar de klant te sturen*. (hfst 9.3)
- [ ] **Documenten kiezen.** Groepen **Contracten**, **Schadechecks**, **Overige documenten**; alles wat je aanvinkt gaat in één e-mail. (hfst 9.3)
- [ ] **Ontvanger.** **E-mailadres ontvanger**: **Algemeen**, het adres van de klant (*Klant: <adres>*), **Facturen** of **Aangepast e-mailadres**. (hfst 9.3)
- [ ] **Sjabloon en taal.** **Contract-e-mail**, **Schadecheck-e-mail**, **Gecombineerde documenten-e-mail** (springt vanzelf naar gecombineerd bij meer dan één document); **E-mailtaal** **Nederlands** of **Engels**; **Onderwerp** en **Bericht** aanpasbaar. (hfst 9.3)
- [ ] **Versturen.** **E-mail versturen**. Verwacht: *Versturen...*, daarna **Gelukt** — *E-mail succesvol verstuurd naar <adres> met 2 documenten bijgevoegd*; de mail komt aan. (hfst 9.3)
- [ ] **Knop grijs.** Verwacht onder het venster: *Nog nodig om te versturen:* met *kies minstens één document*, *een geldig e-mailadres van de ontvanger*, *een onderwerp*. (hfst 9.3)
- [ ] **Controles vooraf.** **Ongeldig e-mailadres** — *Voer een geldig e-mailadres in*; **Geen documenten** — *Selecteer minstens één document om te versturen*; *Geen e-mailadres ontvanger geselecteerd*. (hfst 9.3)
- [ ] **Mislukt.** (Testomgeving, kapotte mailinstelling.) Verwacht: het venster blijft open en zegt *De e-mail kon niet verstuurd worden. Controleer de e-mailinstellingen onder Instellingen en probeer het opnieuw.* (hfst 9.3, 9.5)
- [ ] **Verzendstatus bij het document.** **Reserveringsdocumenten**. Verwacht: groen **Verzonden op 13-09-2026 aan klant@voorbeeld.nl** of rood **Verzenden mislukt — <reden>**; bij meerdere pogingen de laatste. (hfst 9.4)

### Welke mails er bestaan

- [ ] **Bekeuring: geen mail tot Klant informeren.** Zie hoofdstuk 2 in deze lijst; in het **E-maillogboek** staat de mail onder het soort **Bekeuring**. **(nieuw)** (hfst 9.1)
- [ ] **Bekeuring: waarom het niet lukte.** Verwacht bij **Klant informeren**: *Er is geen klant aan deze bekeuring gekoppeld, dus er is niets verstuurd.*, *Deze klant heeft geen e-mailadres, dus er is niets verstuurd.*, *Het portaal staat uit voor deze klant, dus er is niets verstuurd.* of *De mail kon niet worden verstuurd. Controleer de e-mailinstellingen en probeer het opnieuw.* **(nieuw)** (hfst 9.1, 12)
- [ ] **Onderhoudsmail.** Plan, verzet en rond onderhoud af voor een klant met portaalaccount. Verwacht: onderwerpen **Onderhoud gepland**, **Onderhoud verplaatst**, **Auto in onderhoud**, **Onderhoud klaar**, **Onderhoud vervalt**, **Onderhoud hoort niet meer bij uw huur**, **Vervangend vervoer staat klaar**. Staat het portaal uit, dan gaat er niets. (hfst 9.1)

### APK-herinneringen

- [ ] **Alleen de huidige huurder.** Voertuigkaart → **APK-herinnering versturen**. Verwacht: één ontvanger met het label **Huidige huurder** en de periode van de huur. (hfst 9.2)
- [ ] **Auto zonder huurder.** Verwacht: **Dit voertuig is nu niet verhuurd** en de knop **Melding naar kantoor versturen**. (hfst 9.2)
- [ ] **Verzamelmail aan kantoor.** Verwacht onderwerp *Herinnering: 3 voertuig(en) zonder huurder*, met kenteken, merk, model, APK-datum en *Deze melding gaat alleen naar kantoor.* (hfst 9.2)
- [ ] **Kantooradres.** [beheerder] **App-instellingen** → **E-mail & GPS** → **Kantooradres voor meldingen** → **Kantooradres opslaan**. Leeg: het scherm noemt het afzenderadres waar het dan naartoe gaat. (hfst 9.2)

### Communicatie

- [ ] **APK-herinneringen versturen.** **Communicatie** → **Meldingen versturen** → **APK-herinneringen** → ontvangers → **Voorvertonen & versturen naar … voertuigen**. Verwacht: **E-mailvoorvertoning**. (hfst 9.5)
- [ ] **Persoonlijke voorvertoning.** Klik op een ontvanger. Verwacht: *Zo ziet <naam> de e-mail* met zijn eigen kenteken en klantnaam; een auto zonder huurder: *Zo ziet kantoor de melding over dit voertuig*; geen bruikbaar adres: *Geen geschikt e-mailadres: wordt niet verstuurd. Kies een ander adres of een andere ontvanger.*; een leeg veld: *Leeg voor deze ontvanger:* met de veldnaam. (hfst 9.5)
- [ ] **Grijze voorvertoonknop.** Verwacht eronder: *Kies minstens één ontvanger (klant of voertuig) om te kunnen voorvertonen.* of *Vul een onderwerp en een bericht in, of kies een sjabloon, om te kunnen voorvertonen.* (hfst 9.5)
- [ ] **Veel ontvangers.** Bij 25 of meer: **Let op: veel ontvangers**; de knop blijft grijs tot **Ik heb de tekst en de ontvangers gecontroleerd** is aangevinkt. (hfst 9.5)
- [ ] **Uitkomst na het versturen.** Verwacht: **Meldingen verstuurd** — *3 e-mails verstuurd*; **Gedeeltelijk verstuurd**; **Er is niets verstuurd** (in het rood, formulier blijft ingevuld); *Er was niemand om naar te mailen.* (hfst 9.5)
- [ ] **Onderhoud en Aangepast bericht.** Dezelfde route voor **Onderhoud** en **Aangepast bericht**; kies een sjabloon. Welke sjablonen je ziet hangt van de categorie af; portaalsjablonen zie je hier nooit. (hfst 9.7)
- [ ] **E-maillogboek.** **E-maillogboek**. Verwacht: *Elke verstuurde en mislukte e-mail, de nieuwste bovenaan.* met onderwerp, datum en tijd, soort (**APK**, **Onderhoud**, **Aangepast**, **GPS-activatie**, **Document per e-mail**, **Overige e-mail**), ontvanger of *N ontvangers · X verstuurd, Y mislukt*, label **verzonden**, **mislukt**, **deels mislukt**. Je verstuurde mail staat er meteen in. (hfst 9.4)
- [ ] **Reden van mislukking.** Verwacht: **Reden van mislukking:** in het Nederlands (bijvoorbeeld *De e-mailserver weigerde de verbinding.*, *Geen geschikt e-mailadres gevonden.*), per reden hoe vaak, en **Technische melding:**. (hfst 9.4)
- [ ] **Details.** **Details** → **E-mail in het logboek**; onderaan staat dat de inhoud niet wordt bewaard. (hfst 9.4)
- [ ] **Lege en foute toestand.** *Er zijn nog geen e-mails verstuurd*; *Het e-maillogboek kon niet worden geladen. Probeer het later opnieuw.* (hfst 9.4)
- [ ] **Analyse.** Verwacht: **Verstuurde e-mails**, **Mislukte e-mails**, **Verzendrondes**, **Rondes met mislukkingen** en per soort (**APK-meldingen**, **Onderhoudsherinneringen**, **Aangepaste berichten**, **Overige e-mails**). (hfst 9.4)
- [ ] **Zonder het recht.** [zonder E-mailsjablonen beheren] Verwacht: *Geen toegang tot deze gegevens*. (hfst 9.4)
- [ ] **Meldingencentrum is geen mailstatus.** Het belletje toont gebeurtenissen uit het klantenportaal (een nieuwe aanvraag, een reactie), niet of een mail is aangekomen. (hfst 9.4)

### Mailinstellingen en sjablonen

- [ ] **E-mail & GPS.** [beheerder] **App-instellingen** → **E-mail & GPS** → **E-mailconfiguratie**. Verwacht: doelen **APK-herinneringen**, **Onderhoudsmeldingen**, **GPS/IEI-informatie**, **Documenten-e-mail**, **Aangepaste berichten**, **Standaard/Algemeen**; velden **Afzender-e-mail**, **Afzendernaam**, **SMTP-host**, **SMTP-poort**, **SMTP-gebruikersnaam**, **SMTP-wachtwoord**; **Configuratie opslaan**. (hfst 9.6)
- [ ] **Verbinding testen.** Verwacht: de knop is uit zolang host, gebruikersnaam of wachtwoord leeg zijn; de test logt alleen in; antwoord *Connection successful. The SMTP server accepted the credentials.* of een reden uit 9.5. (hfst 9.6)
- [ ] **Wachtwoord blijft verborgen.** Open de instelling opnieuw. Verwacht: het wachtwoordveld is leeg. (hfst 9.6)
- [ ] **Niets ingesteld.** Verwacht: **Geen e-mailconfiguratie ingesteld**. (hfst 9.6)
- [ ] **Bedrijfsnaam in de mails.** Zie hoofdstuk 10, onderdeel Bedrijfsnaam: de naam onderaan de herinneringen, in de portaalmails en als standaard afzendernaam; een ingevulde **Afzendernaam** gaat voor. **(nieuw)** (hfst 9.6, 10.3)
- [ ] **Doc-e-mails.** **App-instellingen** → **Doc-e-mails**: **Huurcontract E-mail**, **Schade Controle E-mail**, **Gecombineerde Documenten E-mail**, elk Engels en Nederlands met **Onderwerp** en **Bericht**; **E-mailsjablonen opslaan**. (hfst 9.7)
- [ ] **Sjabloonbouwer.** **Communicatie** → **Sjabloonbouwer** → **Nieuw sjabloon**: **Sjabloonnaam**, **E-mailonderwerp**, **Sjablooncategorie** (APK-herinneringen, Onderhoud, Aangepast), **E-mailinhoud**, **Placeholders invoegen**. (hfst 9.7)
- [ ] **Accolades.** `{customerName}` en `{{customerName}}` werken allebei. (hfst 9.7)
- [ ] **Portaalsjablonen.** Verwacht in de bouwer: *Portaal: uitnodiging*, label **PORTAAL**, eigen categorie; bewerken en opslaan kan, nieuw maken niet; de naam is grijs (vaste sjablonen hernoemen kan niet). (hfst 9.7)
- [ ] **Bewerken en dupliceren.** De pagina scrolt naar de bouwer, cursor in de naam; een kopie heet *<naam> (kopie)*; na opslaan of verwijderen klopt de lijst direct. (hfst 9.7)
- [ ] **De elf placeholders.** Maak een bericht met `{customerName}`, `{vehiclePlate}`, `{vehicleBrand}`, `{vehicleModel}`, `{apkDate}`, `{companyName}`, `{customerEmail}`, `{customerPhone}`, `{reservationStart}`, `{reservationEnd}`, `{maintenanceDate}` en bekijk de voorvertoning en de mail. Verwacht: alles is ingevuld; de datums als dd-mm-jjjj; **Bedrijfsnaam** uit de instelling; **Telefoon klant** het nummer van de klant. **(nieuw)** (hfst 9.7)
- [ ] **Onderhoudsdatum.** `{maintenanceDate}` bestaat alleen bij de categorie **Onderhoud**; de voorvertoning toont dezelfde datum als de mail. **(nieuw)** (hfst 9.7)
- [ ] **Leeg blijft leeg.** Een voertuig zonder huurder: `{reservationStart}` en `{reservationEnd}` zijn leeg; de voorvertoning zegt *Leeg voor deze ontvanger: …*. Een typefout in een placeholder: *Deze placeholders worden nergens ingevuld en gaan zo naar de klant: …* **(nieuw)** (hfst 9.7)

### Automatische meldingen en facturen per e-mail

- [ ] **Reservering gewijzigd.** Wijzig de datums of het voertuig van een huur van een klant met portaalaccount. Verwacht: een portaalmelding en een e-mail *Uw reservering is gewijzigd*; twee keer kort achter elkaar geeft niet twee berichten. (hfst 9.8)
- [ ] **Nieuw document.** Genereer een document voor de klant. Verwacht: *Nieuw document beschikbaar*. (hfst 9.8)
- [ ] **Klant zonder portaalaccount.** Verwacht: er gaat niets uit. (hfst 9.8)
- [ ] **Postvak: instellen.** [beheerder] **Instellingen** → tabblad **E-mail** → kaart **Facturen per e-mail (inkomend)**: IMAP-server, gebruikersnaam, wachtwoord, **Map na verwerking** (`Verwerkt`), **Vertrouwde afzenders**, **Naam van jullie mailserver (Authentication-Results)** (de kaart waarschuwt in het geel als hij leeg is), **Verbinding testen** (*Verbonden, 3 ongelezen*), **Postvak automatisch uitlezen**, **Opslaan**. (hfst 9.9)
- [ ] **Factuur ontvangen.** Mail een factuur-PDF van een vertrouwde afzender naar het factuuradres. Verwacht: na de ronde of **Nu ophalen** een boeking per categorie, de factuur als bon, en een melding in de bel *Factuur van … geboekt op …*. (hfst 9.9)
- [ ] **Twijfel: Te controleren.** **Kosten** → **Ontvangen facturen** (met een getal) → tabbladen **Te controleren**, **Geboekt**, **Afgewezen**; de reden (*Onbekende afzender*, *Geen kenteken gevonden*, *Meerdere kentekens*, *Kenteken niet in de vloot*, *Mogelijk dubbel*, *Geen factuur …*, *Bedragen of datum kloppen niet*, *Uitlezen mislukt*, *Geen bruikbare bijlage*). **Controleren** → links de factuur, rechts de gelezen gegevens → **Boeken** of **Afwijzen**. (hfst 9.9)
- [ ] **Logboek.** **Logboek** (bij **Nu ophalen**, voor wie **Kosten beheren** of **Instellingen beheren** heeft). Verwacht: tabbladen **Facturen**, **Overige mail**, **Ophaalrondes**; schakelaar **Alleen rondes met mail of fouten**; zoeken op afzender, onderwerp, bestandsnaam, leverancier, factuurnummer, kenteken (met of zonder streepjes), foutmelding. (hfst 9.9)
- [ ] **Als het niet werkt.** *Ophalen mislukt* / *Postvak facturen onbereikbaar* bij een fout wachtwoord; *Uitlezen mislukt* zonder sleutel; *Deze factuur is al geboekt* bij een dubbele scan. (hfst 9.9)

---

## Hoofdstuk 10 — Beheer

### Gebruikers

- [ ] **Waar het beheer zit.** [beheerder] Rechtsboven je naam → onder **Beheer**: **Gebruikers**, **Back-upbeheer**, **App-instellingen**. (hfst 10.1)
- [ ] **Zonder beheerdersrol.** [kantoor] Gebruikers: **Toegang geweigerd** — *Je hebt geen toestemming voor deze functie.* (hfst 10.2)
- [ ] **Gebruiker toevoegen.** **Gebruikers** → **Gebruiker toevoegen** → **Nieuwe gebruiker toevoegen**: **Gebruikersnaam**, **Wachtwoord**, **Volledige naam**, **E-mail**, **Rol**, **Actief**, **Prijzen verbergen** → **Gebruiker aanmaken**. Verwacht: **Gelukt**, *Gebruiker "jan" is aangemaakt*. (hfst 10.2)
- [ ] **Wachtwoord verplicht.** Laat het leeg. Verwacht: *Een wachtwoord is verplicht*. (hfst 10.2)
- [ ] **Wachtwoordregel bij een nieuwe gebruiker.** Hint *Minimaal 10 tekens, met hoofdletter, kleine letter en cijfer*; een wachtwoord van 9 tekens of zonder hoofdletter: *Het wachtwoord voldoet niet aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer.* **(nieuw)** (hfst 10.2)
- [ ] **Wachtwoord van een ander resetten.** Bewerk een andere gebruiker en vul een nieuw wachtwoord in dat aan de regel voldoet. Verwacht: **Gelukt**; de oude wachtwoorden blijven werken voor wie niets wijzigt. **(nieuw)** (hfst 10.2)
- [ ] **Eigen wachtwoord via Gebruikers.** Bewerk je **eigen** account en vul een wachtwoord in. Verwacht: *Je eigen wachtwoord wijzig je via je profiel, onder Wachtwoord wijzigen*. **(nieuw)** (hfst 10.2)
- [ ] **Leeg wachtwoordveld.** Bewerk een gebruiker en laat het veld leeg (of vul spaties). Verwacht: het wachtwoord blijft zoals het was; de gebruiker kan nog inloggen. (hfst 10.2)
- [ ] **Gebruikersnaam bestaat al.** Verwacht: *Deze gebruikersnaam is al in gebruik* onder het veld. (hfst 10.2)
- [ ] **Meerdere veldfouten tegelijk.** Te korte gebruikersnaam en geen wachtwoord. Verwacht: alle meldingen tegelijk (*De gebruikersnaam moet minstens 3 tekens hebben*, *Vul een geldig e-mailadres in*). (hfst 10.2)
- [ ] **Gebruiker bijwerken.** **Gebruiker bijwerken**. Verwacht: *Gebruiker "jan" is opgeslagen*. (hfst 10.2)
- [ ] **Inactief.** Zet een account op inactief. Verwacht: inloggen faalt (*403: Account has been disabled*), de geschiedenis blijft zichtbaar. (hfst 10.2, 15.14)
- [ ] **Eigen account verwijderen kan niet.** Verwacht: het verwijderknopje achter je eigen regel is grijs; houd de muis erboven: *Je kunt je eigen account niet verwijderen*. (hfst 10.2)
- [ ] **De laatste beheerder.** [alleen één actieve beheerder] Verwacht: het knopje is grijs met *Dit is de laatste actieve beheerder; die kan niet worden verwijderd*. Zet hem op inactief of geef hem een andere rol: *De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere rol krijgen*. **(nieuw)** (hfst 10.2)
- [ ] **Een andere beheerder verwijderen.** Maak een tweede beheerder aan en verwijder hem. Verwacht: *Weet je zeker dat je gebruiker "…" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.* en daarna is hij weg. **(nieuw)** (hfst 10.2)
- [ ] **Verwijderen van een gebruikt account.** Verwijder een account dat al ingelogd is of iets gedaan heeft. Verwacht: het account verdwijnt echt; zijn wijzigingen blijven in de geschiedenis staan met de gebruikersnaam als tekst. **(nieuw)** (hfst 10.2)
- [ ] **Alleen een beheerder maakt een beheerder.** (hfst 10.2)
- [ ] **Zeven rollen.** **Beheerder**, **Manager**, **Gebruiker**, **Schoonmaker**, **Kijker**, **Accountant**, **Onderhoud**. (hfst 10.2)
- [ ] **Rechtenraster.** Onder **Aanvullende rechten** staat *Selecteer aanvullende rechten voor deze gebruiker* met het raster, ook **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen**, **Prullenbak beheren**. (hfst 10.2)
- [ ] **Heeft nodig.** Vink **Reserveringen beheren** aan zonder **Voertuigen bekijken** en **Klanten bekijken**. Verwacht: onder het vinkje een oranje regel *Heeft nodig: Voertuigen bekijken, Klanten bekijken* met een waarschuwingsteken; staan ze aan, dan is de regel grijs. **(nieuw)** (hfst 10.2, 15.17)
- [ ] **Handig erbij.** Verwacht in de tekstballon: *Handig erbij: …*. **(nieuw)** (hfst 10.2)
- [ ] **Benodigde rechten ook aanzetten.** **Benodigde rechten ook aanzetten**. Verwacht: de ontbrekende benodigde rechten worden in één keer aangevinkt; de knop is grijs als er niets ontbreekt; bij het opslaan gebeurt niets vanzelf; je kunt een recht daarna weer uitzetten. **(nieuw)** (hfst 10.2)
- [ ] **Alleen voor beheerders.** Bij een medewerker die geen beheerder is: **Gebruikers beheren**, **Instellingen beheren**, **Back-ups beheren** tonen *alleen voor beheerders* en zijn niet aan te vinken; staat zo'n vinkje al aan, dan kun je het wel uitzetten. **(nieuw)** (hfst 10.2, 15.17)
- [ ] **Bekijken van een gebruiker.** **Bekijken** → **Rechten**; bij een beheerder staat alles aangevinkt; dezelfde regels staan er alleen bij de rechten die het account heeft. **(nieuw)** (hfst 10.2)
- [ ] **Rechtenwijziging werkt meteen.** Pas de vinkjes aan van een ingelogde collega. Verwacht: zijn scherm volgt zonder opnieuw inloggen. (hfst 10.2)
- [ ] **Eenmalige start voor managers.** Verwacht: bestaande accounts met de rol **Manager** hebben **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren**; een nieuwe manager krijgt ze niet vanzelf. (hfst 10.2, 15.16)
- [ ] **Profiel toont de rechten met Nederlandse namen.** (hfst 10.2)

### Geweigerde pogingen

- [ ] **Poging veroorzaken.** [kijker] Open een scherm of druk op een knop waar je geen recht voor hebt (bijvoorbeeld via een oude link naar `/maintenance`). Verwacht: een melding of een scherm met "U heeft geen toegang tot dit scherm". **(nieuw)** (hfst 10.2, 15.9)
- [ ] **De balk.** [beheerder] Log uit en weer in (niet je allereerste inlog). Verwacht: bovenaan het **Dashboard** *Sinds je vorige inlog (<datum>) probeerden 3 medewerkers iets waarvoor ze geen recht hebben* (bij één: *probeerde 1 medewerker iets waarvoor die geen recht heeft*). **(nieuw)** (hfst 10.2)
- [ ] **Bekijken.** **Bekijken** → **Geweigerde pogingen** — *Wat medewerkers probeerden sinds je vorige inlog (<datum>) en niet mochten.* met **Wie**, **Wat**, **Recht dat ontbrak**, **Wanneer**. **(nieuw)** (hfst 10.2)
- [ ] **Sluiten.** Het kruisje sluit de balk voor de rest van de sessie; geen balk als er niets te melden is en niet bij je allereerste inlog. **(nieuw)** (hfst 10.2)
- [ ] **Activiteitenlog.** Dezelfde pogingen staan onder de actie *access.denied* met status *mislukt*; er gaat geen e-mail uit. **(nieuw)** (hfst 10.2)
- [ ] **Dubbele pogingen tellen als één.** Dezelfde poging van dezelfde medewerker op dezelfde plek binnen vijf minuten staat één keer. **(nieuw)** (hfst 10.2)
- [ ] **Alleen de rol Beheerder.** [kantoor met Gebruikers beheren, geen beheerder] Verwacht: geen balk. **(nieuw)** (hfst 10.2)

### App-instellingen

- [ ] **Negen tabbladen.** [beheerder] **App-instellingen** → *Applicatie-instellingen — Beheer de configuratie van je verhuursysteem*: **Bedrijfsregels**, **Meldingen**, **Documenten**, **Doc-e-mails**, **Kalender**, **E-mail & GPS**, **Activiteit**, **Klantenportaal**, **Voertuigen**. (hfst 10.3)
- [ ] **Startcontractnummer.** **Documenten** → **Startcontractnummer**, **Volgend contractnummer**, **Startnummer opslaan**; **Slimme override** → **Override instellen** / **Override wissen**; een onmogelijk getal: *Must be a whole number between 1 and 2147483647*. (hfst 10.3)
- [ ] **Toltarief.** **Toltarief (€ per km)**. (hfst 10.3)
- [ ] **Tijdzone: bekijken.** **Bedrijfsregels** → **Tijdzone van het kantoor**. Verwacht: standaard *Europe/Amsterdam*, met erbij of zomer- of wintertijd actief is. **(nieuw)** (hfst 10.3)
- [ ] **Tijdzone: zoeken.** **Zoek een tijdzone** → kies bij **Tijdzone**. **(nieuw)** (hfst 10.3)
- [ ] **Tijdzone opslaan** (alleen testomgeving; zet hem daarna terug). **Tijdzone opslaan**. Verwacht: *De app rekent nu met <zone>.*; bij een fout *De tijdzone kon niet worden opgeslagen.* **(nieuw)** (hfst 10.3)
- [ ] **Bedrijfsnaam: standaard.** **Bedrijfsregels** → **Bedrijfsnaam**. Verwacht: zolang je niets opslaat *Autolease Lam*. **(nieuw)** (hfst 10.3)
- [ ] **Bedrijfsnaam opslaan.** Vul een naam in → **Bedrijfsnaam opslaan**. Verwacht: *De bedrijfsnaam is opgeslagen.*; een mail (herinnering of portaalmail) noemt de nieuwe naam. **(nieuw)** (hfst 10.3)
- [ ] **Bedrijfsnaam te lang.** 101 tekens of een regeleinde. Verwacht: *Vul een naam in van maximaal 100 tekens, zonder regeleinden.* **(nieuw)** (hfst 10.3)
- [ ] **Afzendernaam gaat voor.** Een **Afzendernaam** bij de e-mailinstellingen gaat voor op de bedrijfsnaam. **(nieuw)** (hfst 10.3)
- [ ] **Portaalmeldingen volgen de naam.** Voor het eerste opslaan zeggen de portaalmails en de portaalmeldingen *Lam Groep*; daarna de ingestelde naam (een al bestaande melding houdt zijn tekst; een zelf aangepast sjabloon houdt zijn eigen tekst). **(nieuw)** (hfst 10.3)
- [ ] **Wat je typt, blijft staan.** Wissel van tabblad tijdens het invullen. Verwacht: een eenmaal geopend tabblad houdt zijn ingevulde waarden, ook **Klantenportaal**, de fiscale check, de CJIB-koppeling en de filters van de activiteit. (hfst 10.3)
- [ ] **Administratiekosten per bekeuring.** **Klantenportaal** → **Standaard administratiekosten per bekeuring (€)**. Een negatief of leeg bedrag: *Vul een bedrag van 0 of hoger in, bijvoorbeeld 12,50.* Het bedrag blijft bewaard na opslaan. (hfst 10.3)
- [ ] **CJIB-koppeling.** Verwacht: **Automatisch ophalen aan** kan pas aan met een **Server (host)**; zonder server zijn **Verbinding testen** en **Nu ophalen** grijs met uitleg; *Automatisch ophalen elke 15 min* of *Automatisch ophalen staat uit*; een mislukte test: *Verbinding mislukt* — *De verbinding met het CJIB is mislukt. Controleer de instellingen en probeer het opnieuw.* (hfst 10.3)
- [ ] **Zonder Instellingen beheren.** Verwacht: openen kan, opslaan niet (*Not authorized. One of these permissions required: manage_settings*). (hfst 10.3)

### Back-ups

- [ ] **Back-upscherm lezen.** [beheerder] **Back-upbeheer** → **Back-up & Herstel**. Verwacht: **Laatste back-up** (datum en tijd of **Nooit**), **Volgende back-up** (**Vannacht om 02:00 uur**), eventueel **Laatste back-upfout:** in het Nederlands; **Back-uplocatie:** zegt dat de map vast is ingesteld, zonder pad. (hfst 10.4)
- [ ] **Waarschuwing bij oude back-up.** Is de laatste geslaagde ouder dan een dag: *De laatste geslaagde back-up is ouder dan een dag.* Een back-up zonder leesbare datum toont **Onbekende datum**. (hfst 10.4)
- [ ] **Recente back-ups.** Gesplitst in **Database-back-ups** en **Bestand-back-ups**. (hfst 10.4)
- [ ] **Nu back-uppen.** **Nu back-uppen** (testomgeving). Verwacht: een nieuwe regel; mislukt: *De back-up is mislukt.*; loopt er al een: *Er loopt al een back-up. Wacht tot die klaar is.* (hfst 10.4)
- [ ] **Schema aan/uit.** De schakelaar **Ingeschakeld / Uitgeschakeld**. (hfst 10.4)
- [ ] **Downloaden.** **Downloaden** achter een back-up. Verwacht: **Bestand gemaakt** met naam en grootte, en een bestand in je downloads; bij een fout *De back-up kon niet worden gedownload.* (hfst 10.4)
- [ ] **Handmatige back-up.** Onder **Handmatige back-up & herstel**: **App-gegevens**, **Geüploade bestanden**, **App-code**. Probeer elke download één keer. (hfst 10.4, 12.13)
- [ ] **Herstellen, alleen lezen.** Klik **Herstellen** (niet bevestigen). Verwacht: **Waarschuwing: deze back-up herstellen** met de uitleg en *Typ de exacte bestandsnaam hieronder ter bevestiging:*; **Ja, herstel deze back-up** is grijs tot je de naam letterlijk hebt overgetypt. Sluit zonder te herstellen. (hfst 10.4)
- [ ] **Dashboardbalk bij geen back-up.** **Geen geverifieerde back-up in 30 uur** — *Open Back-up & Herstel om er nu een uit te voeren.* (hfst 10.4)

### Geschiedenis en activiteitenlog

- [ ] **Geschiedenis per record.** Een reservering (onderaan), een voertuig en een klant (tabblad **Geschiedenis**). Verwacht: *Elke wijziging aan dit record, met wie het deed en wanneer.*, met wat er gebeurde in woorden, wie (of **Systeem**), wanneer, welk veld oud (doorgestreept) en nieuw; leeg als `—`; aan/uit als `ja`/`nee`. (hfst 10.5)
- [ ] **Leeg record.** *Er is nog niets gewijzigd aan dit record.* (hfst 10.5)
- [ ] **Zonder recht.** [kijker] Verwacht: *Je hebt geen rechten om de geschiedenis van dit record te bekijken.* (hfst 10.5)
- [ ] **Activiteitenlog.** [beheerder] **App-instellingen** → **Activiteit** → **Activiteitenlog** — *Wie heeft wat gewijzigd, en wanneer.* Filters **Zoeken**, **Gebruiker**, **Actie**, **Vanaf**, **Tot en met**, **Filters wissen**; kolommen **Wanneer**, **Wie**, **Actie**, **Object**, **Wijzigingen**. (hfst 10.5)

### Prullenbakken

- [ ] **Acht prullenbakken, één per scherm.** Open elke: **Voertuigen** → **Verwijderde voertuigen**; **Klanten** → **Verwijderde klanten**; **Reserveringen** → **Verwijderde reserveringen**; **Onderhoud** → **Verwijderd onderhoud**; **Transporten** → **Verwijderde transporten**; **Klantenportaal** → **Bekeuringen** → **Prullenbak** (venster **Verwijderde bekeuringen**); **Kosten** → **Verwijderde kostenposten** **(nieuw)**; klant → **Chauffeurs** → **Verwijderde chauffeurs** **(nieuw)**. Verwacht: elke bak toont alleen zijn eigen soort. (hfst 10.6)
- [ ] **Grijs zonder vinkje.** [zonder Prullenbak beheren] Verwacht: de knoppen staan er, maar grijs, met een tekstballon. (hfst 10.6, 15.9)
- [ ] **Wat je ziet.** Verwacht: een zoekveld *Zoeken op omschrijving of naam…*, **Alles selecteren**, per regel vinkje, label, omschrijving, *Verwijderd <datum> door <naam>*, **Bevat: …** (of *geen gekoppelde gegevens*), **Terugzetten**, **Definitief verwijderen**; een lege bak: *Geen verwijderde voertuigen.* (hfst 10.6)
- [ ] **Teruggezette items.** Zet iets terug. Verwacht: de regel verdwijnt uit de lijst; het vinkje **Teruggezette items ook tonen (3)** toont ze met het groene label **Teruggezet** en een grijze knop. (hfst 10.6)
- [ ] **Terugzetten, per soort.** Controleer voor elk soort dat het terugkomt met zijn gekoppelde gegevens: **Teruggezet** — *<omschrijving> is teruggezet.* Een klant behoudt zijn debiteurnummer; een transport komt terug met zijn vervanger; een kostenpost met zijn bon. (hfst 10.6)
- [ ] **Kostenpost zonder voertuig.** Zet een kostenpost terug van een definitief verwijderd voertuig. Verwacht: *Let op: het voertuig van deze kostenpost bestaat niet meer. De kostenpost staat er weer, maar hoort bij een voertuig dat ontbreekt.* **(nieuw)** (hfst 10.6)
- [ ] **Weigeringen bij terugzetten.** *Dit record is al teruggezet.* (twee tabbladen), *Er bestaat al een voertuig met hetzelfde kenteken. Verwijder of hernoem dat eerst.*, *Dit debiteurnummer is al in gebruik bij klant <naam>.*, *Deze reservering kan niet terug: …*. (hfst 10.6)
- [ ] **Definitief verwijderen, drie manieren.** Op oefengegevens: één regel; een selectie (**Geselecteerde verwijderen (…)**); **Prullenbak leegmaken**. Verwacht: altijd **Definitief verwijderen?** met aantal en soort en *Dit kan niet ongedaan worden gemaakt.* en *Een bestand dat nog door andere gegevens wordt gebruikt, blijft staan.*; daarna **Definitief verwijderd** — *2 regels definitief verwijderd.* (hfst 10.6)
- [ ] **Leegmaken telt verborgen regels mee.** Verwacht: *Dat zijn ook 3 teruggezette regels die nu verborgen zijn.* en bij 200 regels een opmerking. (hfst 10.6)
- [ ] **Fiscale beoordelingen gaan mee.** [beheerder] Verwijder definitief een oefenreservering, onderhoudsplanning of klant die fiscale beoordelingen heeft. Verwacht: in de lijst bij **Bevat** het aantal fiscale beoordelingen; de bevestiging noemt het aantal; het fiscale auditlog heeft de actie *Definitief verwijderd (prullenbak)* met wie en hoeveel. **(nieuw)** (hfst 10.6)
- [ ] **Chauffeurs leegmaken.** In de bak van de chauffeurs van een klant verwijdert **Prullenbak leegmaken** alleen de regels die je ziet. **(nieuw)** (hfst 10.6)
- [ ] **Wissen op verzoek.** Een chauffeur verwijderen en dan ook **Definitief verwijderen**: de naam, het rijbewijsnummer en de kopie zijn weg. **(nieuw)** (hfst 3.6, 10.6)
- [ ] **Mislukt een regel.** Verwacht: **Niet alles is gelukt** met per regel de reden (*Dit record stond al niet meer in de prullenbak.* enz.). (hfst 10.6)
- [ ] **Activiteitenlog.** Elke definitieve verwijdering staat er als *<soort>.purge* (bijvoorbeeld *customer.purge*). (hfst 10.6)

---

## Hoofdstuk 11 — Veelgemaakte fouten

Deze regels bootsen de fout na en kijken of het herstel werkt. Doe ze op oefengegevens.

- [ ] **11.1 Verkeerde klant.** Open een reservering → **Klant wijzigen** → andere klant → **Opslaan**. Verwacht: **Klant gewijzigd**; een bestaand contract krijgt **Verouderd**; de wijziging staat in de **Geschiedenis**. (hfst 11.1)
- [ ] **11.2 Verkeerd voertuig.** **Voertuig wijzigen**. Verwacht: **Voertuig gewijzigd**. Bij een al opgehaalde huur klopt het getekende contract niet meer en genereer je opnieuw. (hfst 11.2)
- [ ] **11.3 Verkeerde datums.** **Datums wijzigen**, einddatum vóór begin: *De einddatum kan niet vóór de begindatum liggen.* (hfst 11.3)
- [ ] **11.4 Dubbele reservering.** Boek dezelfde auto in dezelfde periode twee keer (twee tabbladen). Verwacht: *Reservation conflicts with existing bookings* met de botsende reservering. (hfst 11.4)
- [ ] **11.5 Dubbele klant.** Zie hoofdstuk 3, "bestaat mogelijk al". Een dubbele klant zonder lopende huur: huren overzetten met **Klant wijzigen** en dan verwijderen. Een dubbele chauffeur: **Verwijderen** op het tabblad **Chauffeurs**, in **Verwijderde chauffeurs** terug te vinden. **(nieuw: prullenbak chauffeurs)** (hfst 11.5)
- [ ] **11.6 Huur nooit afgesloten.** **… achterstallig** → **Details bekijken** → **Inleveren starten**. Verwacht: de huur sluit en de auto is weer beschikbaar. (hfst 11.6)
- [ ] **11.7 Te vroeg ophalen.** **Ja, startdatum naar vandaag** schuift de start en herberekent het bedrag; **Nee, niet ophalen** doet niets. (hfst 11.7)
- [ ] **11.8 Gekoppeld record vergeten.** Annuleer een reservering met een vervanger en een transport zonder ze aan te vinken. Verwacht: ze blijven staan. Loop dat na op het Dashboard (**Beheer vervangende voertuigen**) en bij **… achterstallig**. (hfst 11.8)
- [ ] **11.9 Document te vroeg gegenereerd.** Wijzig een reservering met contract → **Verouderd** → **Opnieuw genereren** → **Nieuwe versie aangemaakt**. (hfst 11.9)
- [ ] **11.10 Mail naar de verkeerde klant.** Controleer dat het venster **Documenten e-mailen naar klant** je het adres zelf laat kiezen; bij een mailronde laat **Voorvertonen & versturen** per ontvanger zien wat hij krijgt. (hfst 11.10)
- [ ] **11.11 Auto ten onrechte in de werkplaats.** **Uitgifte geblokkeerd**; herstel met **Afronden**, **Terug van onderhoud** of **Terug uit onderhoud**; een beheerder kan forceren met een reden. Een onderhoud op **Binnen** dat niet klopt: verwijder of annuleer het; staat er geen ander onderhoud op **Binnen**, dan verdwijnt **Reparatie nodig** vanzelf. **(nieuw)** (hfst 11.11)
- [ ] **11.12 Per ongeluk opgehaald.** **Overdracht terugdraaien**. Verwacht: **Overdracht teruggedraaid** — *Reservering #… heeft weer de status Geboekt.*; het contractnummer komt vrij; het contract krijgt zelf **Verouderd**. (hfst 11.12)
- [ ] **11.13 Per ongeluk ingenomen.** **Voltooid bekijken (…)** → **Overdracht terugdraaien**. Verwacht: terug naar **Opgehaald**. Was de auto intussen op **Onderhoud nodig**, dan blijft dat staan. (hfst 11.13)
- [ ] **11.14 Per ongeluk geannuleerd.** **Annulering terugdraaien**; lukt niet als de auto intussen is geboekt. (hfst 11.14)
- [ ] **11.15 Per ongeluk verwijderd.** Voor elk soort (voertuig, klant, reservering, transport, chauffeur, kostenpost): verwijder een oefenrecord en zet het terug in de bak van dat scherm. Verwacht: een voertuig vraagt het kenteken, een klant de naam, een opgehaalde huur een vinkje; een chauffeur en een kostenpost gaan zonder tussenstap naar de bak. **Teruggezette items ook tonen** laat de al teruggezette zien. **(nieuw: chauffeur en kostenpost)** (hfst 11.15)
- [ ] **11.16 Kilometerstand verkeerd.** Een lagere stand → **Kilometerstand-overschrijving vereist** — *Je probeert de kilometerstand van het voertuig te verlagen, wat autorisatie vereist.* (hfst 11.16)
- [ ] **11.17 BV naar Opnaam.** Zie de BV-regel bij hoofdstuk 5. Lukt het omzetten niet: *Kon de voertuigregistratie niet bijwerken. Wijzig het handmatig van BV naar Opnaam.* (hfst 11.17)

---

## Hoofdstuk 12 — Problemen oplossen

### De acht veelvoorkomende problemen

- [ ] **12.1 Niet kunnen inloggen.** Zie hoofdstuk 1; de meldingen zijn *Ongeldige gebruikersnaam of wachtwoord*, *Je hebt hier geen recht voor.* (inactief account) en *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.* Een beheerder kan de blokkade niet opheffen. (hfst 12.1)
- [ ] **12.2 Voertuig niet beschikbaar.** Controleer de vier oorzaken: reservering erover, werkplaats, **Niet voor verhuur**, nooit afgesloten huur. Een gepland onderhoud heet **Gepland**, pas **Binnen** geeft **Reparatie nodig**. **(nieuw)** (hfst 12.2)
- [ ] **12.3 Geen reservering aanmaken.** De vier gevallen: botsing (*Reservation conflicts with existing bookings*), onderhoud (waarschuwing), zwarte lijst (*This customer is blacklisted for this vehicle and cannot be booked on it.*), APK (waarschuwing). (hfst 12.3)
- [ ] **12.4 PDF klopt niet.** **Verouderd**; velden leeg; ander standaardsjabloon; *nader te bepalen*; **Downloaden** in plaats van **Bekijken**. (hfst 12.4)
- [ ] **12.5 PDF mislukt.** **Contract kon niet gemaakt worden** — *De handeling is vastgelegd, maar het document is niet aangemaakt. Probeer het opnieuw of controleer de sjablonen.* met **Opnieuw proberen**. (hfst 12.5)
- [ ] **12.6 E-mail komt niet aan.** Bij het document: **Verzonden op … aan …** of **Verzenden mislukt — …**. (hfst 12.6)
- [ ] **12.7 Op de verkeerde reservering.** De tabel: ophalen, innemen, annuleren (terugdraaien), verwijderen (prullenbak), wijzigen, document (opnieuw genereren), e-mail (bellen). (hfst 12.7)
- [ ] **12.8 Wie wijzigde iets.** **Geschiedenis**; de beheerder het activiteitenlog; ontbrekend record: de prullenbak van dat scherm. (hfst 12.8)

### Foutmeldingen (Nederlands)

- [ ] **De korte zinnen.** Bootst na wat je kunt, controleer dat er geen kale *Fout*, *500: {...}* of Engelse tekst staat: *De invoer klopt niet. Controleer de velden en probeer het opnieuw.*, *Je sessie is verlopen. Log opnieuw in.*, *Je hebt hier geen recht voor.*, *Dit item is niet gevonden. Misschien is het al verwijderd.*, *Dit kan nu niet: het botst met een andere wijziging of een bestaand item.*, *Het bestand is te groot.*, *Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.*, *Er ging iets mis op de server. …*, *De server is tijdelijk niet bereikbaar. …*, *De server antwoordde niet op tijd. …*, *Geen verbinding met de server. …* **(nieuw: vier nieuwe foutcodes)** (hfst 12, deel 2)
- [ ] **Geen verbinding.** Zet je netwerk uit en klik ergens op. Verwacht: *Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.* (hfst 12, deel 2)
- [ ] **Veldmeldingen in het Nederlands.** Laat een verplicht veld leeg: *Dit veld is verplicht*; een fout e-mailadres: *Vul een geldig e-mailadres in*; *Minimaal 3 tekens*. (hfst 12, deel 2)
- [ ] **Tankbedrag en kostenpost.** *Het tankbedrag moet een positief bedrag zijn van ten hoogste € 1.000.000.* en *De kostenpost voor de tankbeurt kon niet worden geboekt; er is niets opgeslagen. Probeer het opnieuw.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Wachtwoord en laatste beheerder.** *Het wachtwoord voldoet niet aan de regel: minimaal 10 tekens, met hoofdletter, kleine letter en cijfer.*, *Je eigen wachtwoord wijzig je via je profiel, onder Wachtwoord wijzigen.*, *De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere rol krijgen.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Onderhoud afronden.** *Een onderhoud rond je af met de knop Afronden, niet met de status.* en *Dit onderhoud is al afgerond.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Chauffeur terugzetten.** *De klant van deze chauffeur bestaat niet meer. Zet eerst de klant terug (Klanten, Verwijderde klanten) en daarna de chauffeur.* **(nieuw)** (hfst 12, deel 2)
- [ ] **Rechtenmelding.** *Not authorized. One of these permissions required: …* met de naam van het ontbrekende recht (bijvoorbeeld `manage_recycle_bin`, `revert_handover`). (hfst 12, deel 2, 15.16)
- [ ] **Bestand gemaakt.** Een export of download meldt **Bestand gemaakt** — *<naam>.csv (2 kB)*. (hfst 12, deel 2)
- [ ] **Laden…** **Documenten**, **Rapporten** en **Communicatie** tonen *Laden…* met een rondje. (hfst 12, deel 2)
- [ ] **CSV in Excel.** Exporteer klantgeschiedenis, kosten, bekeuringen en een rapportbouwerrapport. Verwacht: dubbelklik opent in Excel met de kolommen goed; puntkomma's; decimale komma (*112,50*); datums dd-mm-jjjj; tijden uu:mm; kentekens met streepjes; bestandsnaam zoals *boetes-2026-10-10.csv*; tekst die met `=`, `+`, `-` of `@` begint heeft een aanhalingsteken ervoor. (hfst 12, deel 2)

### Bekende beperkingen

- [ ] **12.9 Annulering terugdraaien lukt niet altijd.** Draai een annulering terug terwijl de auto intussen opnieuw is geboekt. Verwacht: een rood blok en een grijze knop; je maakt dan een nieuwe reservering. (hfst 12.9, 5.14)
- [ ] **12.10 Bij annuleren beslis je zelf.** Annuleer zonder een gekoppeld onderdeel aan te vinken. Verwacht: wat je niet aanvinkt, blijft staan (de vervanger houdt de auto bezet, het transport blijft gepland). (hfst 12.10, 5.9)
- [ ] **12.11 De klant krijgt niet overal bericht van.** Verwacht: een bekeuring invoeren, inlezen of koppelen stuurt de klant niets tot jij op **Klant informeren** klikt; een klant zonder portaalaccount hoort ook niets over wijzigingen of annuleringen. **(nieuw)** (hfst 12.11)
- [ ] **12.12 E-maillogboek toont de echte geschiedenis.** **Communicatie** → **E-maillogboek**: geen vaste voorbeeldregels uit maart 2024; **Details** achter elke regel; of een document is verstuurd zie je nog steeds bij het document zelf in **Reserveringsdocumenten**. (hfst 12.12)
- [ ] **12.13 Handmatige downloadknoppen.** [beheerder] **Back-upbeheer** → **App-gegevens**, **Geüploade bestanden** en **App-code**: probeer elke download. Verwacht: een bestand; mislukt het, dan *De back-up kon niet worden gedownload.* zonder pad. De **Downloaden**-knop bij een **Bestand-back-up** in de lijst werkt altijd. (hfst 12.13)
- [ ] **12.14 Wat leegmaken niet doet.** Controleer dat **Prullenbak leegmaken** alles van die soort weghaalt (ook wat niet in de lijst van 200 staat), dat een verwijderde chauffeur pas verdwijnt na **Definitief verwijderen**, en dat een reservering of klant met fiscale beoordelingen kan worden verwijderd. **(nieuw)** (hfst 12.14)
- [ ] **12.15 Een klein deel van de meldingen is nog Engels.** Zoek een Engelse melding (bijvoorbeeld *Reservation conflicts with existing bookings*) en vergelijk hem met de tabellen in deel 2. Alle labels in de schermen moeten Nederlands zijn, ook de kostencategorieën in rapporten (**Onderhoud**, **Banden**, **Remmen**, **Schade**, **Brandstof**, **Verzekering**, **Registratie**, **Schoonmaak**, **Parkeren**, **Tol**, **Accessoires**, **Overig**). (hfst 12.15)
- [ ] **12.16 Twee mensen in hetzelfde scherm.** Twee tabbladen, beide **Bewerken** op één reservering; wie het laatst opslaat wint. De kleine vensters (**Datums wijzigen**, **Klant wijzigen**, **Voertuig wijzigen**) overschrijven elkaar niet. (hfst 12.16)
- [ ] **12.17 Tablet.** Open **Reserveringen** op een tablet of in een smal venster. Verwacht: je moet horizontaal scrollen. (hfst 12.17)
- [ ] **12.18 Ontbrekende bestanden.** Een document dat wel in de lijst staat maar waarvan het bestand weg is, merk je pas bij **Bekijken** of **Downloaden**; meld dat bij een beheerder. (hfst 12.18)

---

## Hoofdstuk 13 — Snel naslagwerk

Het naslagwerk is een lijst klikpaden. Deze regels controleren dat de klikpaden kloppen met de app: volg het pad letterlijk en kijk of je op de genoemde knop uitkomt.

- [ ] **13.1 Inloggen en je eigen account.** Volg: wachtwoord wijzigen (minimaal 10 tekens, met hoofdletter, kleine letter en cijfer), taal omzetten, **Ingelogd blijven**, uitloggen. **(nieuw: 10 tekens)** (hfst 13.1)
- [ ] **13.2 Zoeken.** `Ctrl+K` of `/`, **Bekijk alle resultaten**, kenteken, contractnummer, sleutellabel scannen, **Recente scans**. (hfst 13.2)
- [ ] **13.3 Ophalen en innemen.** Volg de eerste vier klikpaden tot en met de bevestigknop; de laatste vijf (schadecheck, papieren check, voertuigopmerkingen, lagere kilometerstand). (hfst 13.3)
- [ ] **13.4 Reserveringen.** Volg elk pad: nieuwe reservering, zonder einddatum, **Nu ophalen** (groene melding of twaalf seconden linksonder), lijstweergave (50 regels, **Toon 50 meer**), niet opgehaald → **Annuleren**, **Vandaag**, **Voltooid bekijken (…)**, **… achterstallig**, wijzigen (klant, voertuig, datums, contractnummer), terugdraaien, annuleren, **Administratie**. **(nieuw: Nu ophalen)** (hfst 13.4)
- [ ] **13.5 Klanten.** Volg elk pad, ook **Verwijderde chauffeurs** → **Terugzetten**, **Geblokkeerde voertuigen**, **Filters** → *Onvolledig profiel*, het invulveld **Pagina** (ook bij **Voertuigen**). **(nieuw: Verwijderde chauffeurs)** (hfst 13.5)
- [ ] **13.6 Voertuigen.** Volg elk pad, vooral: **Ook onbekende kentekens aanmaken**, de keuzelijst **Tonen:** los van **Sorteren op:**, **Brandstofstatus bijwerken** met **Tankkosten (€)**, het laatste tankbedrag, **RDW-voertuigtypes**. **(nieuw)** (hfst 13.6)
- [ ] **13.7 Onderhoud.** Volg elk pad, vooral: het plannen afbreken (**Annuleren** → **Plannen afbreken** of **Doorgaan met plannen**), **Afronden** (kalender, overzicht, bewerkvenster), **Binnen melden**, **Terug uit onderhoud**. **(nieuw)** (hfst 13.7)
- [ ] **13.8 Transport.** Nieuw transport, filteren per soort, rapporten afdrukken, in bulk afronden. (hfst 13.8)
- [ ] **13.9 Documenten.** Alle documenten, per auto, per huur, uploaden (ook via **Scannen** → **Document uploaden**), zoeken, afdrukken, downloaden, mailen, **Opnieuw genereren**, de sjablonen. (hfst 13.9)
- [ ] **13.10 Kosten.** Kosten vastleggen (ook vanaf het Dashboard en via **Scannen** → **Kosten registreren**), filteren, **Exporteren (CSV)**, **Logboek**, **Verwijderde kostenposten** → **Terugzetten**, **Factuur scannen**, kosten van één auto, **Recente kosten** → **Alles bekijken**. **(nieuw: prullenbak Kosten)** (hfst 13.10)
- [ ] **13.11 Klantenportaal en bekeuringen.** Volg elk pad. Zie ook de aparte regels hieronder. (hfst 13.11)
- [ ] **Aanvraag oppakken.** In het aanvraagvenster **In behandeling nemen**. (hfst 13.11, 16.3)
- [ ] **Verlenging goedkeuren.** **Goedkeuren (past reservering aan)**. Verwacht: de reservering is meteen aangepast. (hfst 13.11, 16.3)
- [ ] **Van een huuraanvraag een boeking maken.** **Goedkeuren: reservering aanmaken**. Verwacht: *Reservering aanmaken uit deze aanvraag*. (hfst 13.11, 16.3)
- [ ] **Alleen antwoorden.** **Beantwoorden en afhandelen**, of **Antwoord sturen (blijft open)**. Botst de gevraagde periode: **Conflict met reservering #…**. (hfst 13.11, 16.3)
- [ ] **Een klant een portaalaccount geven.** **Klantenportaal** → **Account uitnodigen**. (hfst 13.11)
- [ ] **Een bekeuring invoeren en inlezen.** Tegel **Bekeuringen** → **Nieuwe bekeuring**; **Brieven scannen**. Verwacht: een geregistreerde bekeuring zonder mail. **(nieuw)** (hfst 13.11)
- [ ] **De hele lijst met bekeuringen openen.** [kantoor met Boetes bekijken] **Klantenportaal** → knop **Bekeuringen**. Verwacht: de lijst opent; zonder Boetes-vinkje staat de knop grijs met het ontbrekende vinkje genoemd. (hfst 13.11)
- [ ] **Een klant voor een auto blokkeren.** **Klantenportaal** → tegel **Blacklist** → **Blokkade toevoegen**. Verwacht: de combinatie verdwijnt stil uit de boekingslijsten; **Geblokkeerde voertuigen** bij de klant toont hem. (hfst 13.11)
- [ ] **Meldingen op gelezen zetten.** **Klantenportaal** → **Meldingen** → **Alles gelezen**. Verwacht: het rode bolletje verdwijnt. (hfst 13.11)
- [ ] **13.12 Communicatie en meldingen.** Volg elk pad (belletje, **Nieuwe melding**, APK-herinneringen, **Aangepast bericht**, **E-maillogboek** → **Details**, **Voorvertonen & versturen**, **Sjabloonbouwer**). (hfst 13.12)
- [ ] **13.13 Rapporten.** Volg elk pad. (hfst 13.13)
- [ ] **13.14 Als er iets misgaat.** Volg elk pad, vooral: de prullenbak van elk scherm; **Verwijderde bekeuringen** via **Prullenbak**. (hfst 13.14)
- [ ] **13.15 Sneltoetsen.** Zie hoofdstuk 2.11. (hfst 13.15)
- [ ] **13.16 Als een knop er niet staat.** Een ontbrekende knop is een recht; een grijze knop toont bij klik of tik een tekstballon met het vinkje, bijvoorbeeld *Hiervoor heeft u het recht 'Reserveringen beheren' nodig.* Probeer het ook met alleen het toetsenbord (Tab, dan Enter of spatie). (hfst 13.16, 15.9)
- [ ] **13.17 Beheer.** Volg elk pad: gebruiker toevoegen (10 tekens), *Heeft nodig*, **Benodigde rechten ook aanzetten**, een andere beheerder verwijderen, de balk met geweigerde pogingen, tijdzone, bedrijfsnaam, RDW-voertuigtypes. **(nieuw)** (hfst 13.17)

---

## Hoofdstuk 14 — Woordenlijst

- [ ] **Woorden vinden.** Zoek in de app vijf woorden uit de lijst op en wijs aan waar ze staan: **Achterstallig**, **Nog te bepalen**, **Verouderd**, **Opgehaald**, **Voltooid**. (hfst 14, 17.4)
- [ ] **Nieuwe woorden.** Controleer dat de woordenlijst de nieuwe woorden uitlegt en dat de uitleg klopt met wat je zelf hebt gezien: **Afgerond** (en **Afronden** bij onderhoud), **Bedrijfsnaam**, **Bekeuring** (alleen registreren; **Klant informeren**), **Geboekt** (begin van elke nieuwe reservering), **Overdracht terugdraaien**, **Prullenbak**, **Tijdzone van het kantoor** en **Voertuigstatus** (**Gepland**, **Reparatie nodig**). **(nieuw)** (hfst 14)
- [ ] **Beschikbaar uitleggen.** Leg een collega in eigen woorden uit wat *beschikbaar* betekent en waarom een auto in onderhoud niet beschikbaar is. (hfst 14, 17.4)

---

## Hoofdstuk 15 — Rollen en rechten

- [ ] **De regel.** De rol doet niets, behalve de rol Beheerder; de vinkjes bepalen wat je mag. Controleer: een **Manager** zonder vinkjes ziet een leeg menu. (hfst 15.1)
- [ ] **De beheerder herkennen.** [beheerder] Alle twaalf menu-items en rechtsboven **Beheer** met **Gebruikers**, **Back-upbeheer**, **App-instellingen**. Er staat geen prullenbak meer bij **Beheer**. (hfst 15.3)
- [ ] **Beheerschermen zitten aan de rol.** Vink bij een medewerker **Gebruikers beheren** aan (kan niet, staat *alleen voor beheerders*). Maak de rol **Beheerder** om de schermen te openen. **(nieuw)** (hfst 15.3, 15.17)
- [ ] **Alleen een beheerder kan.** Controleer: accounts beheren, activiteitenlog, back-ups, instellingen, een beheerder aanmaken, de uitgifte forceren, geweigerde pogingen zien **(nieuw)**, RDW-types toepassen **(nieuw)**, een andere beheerder verwijderen **(nieuw)**. (hfst 15.3)
- [ ] **Voertuigen, klanten en verhuur: vinkjes.** Controleer per vinkje (**Voertuigen bekijken/beheren**, **Klanten bekijken/beheren**, **Reserveringen bekijken/beheren**, **Kilometerverlaging goedkeuren**, **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen**) welk menu-item en welke handeling je krijgt. (hfst 15.4)
- [ ] **Werkplaats, kosten, rapporten: vinkjes.** **Onderhoud beheren**, **Kosten beheren**, **Rapporten bekijken/beheren**. (hfst 15.4)
- [ ] **Documenten en schadechecks: vinkjes.** **Documenten bekijken**, **Documenten bewerken en genereren**, **PDF-sjablonen beheren**, **Schadecontroles bekijken/beheren**. (hfst 15.4)
- [ ] **Portaal, boetes, communicatie: vinkjes.** **Klantportaal bekijken/beheren**, **Boetes bekijken/beheren** (knop **Bekeuringen** op **Klantenportaal**), **Meldingen beheren**, **E-mailsjablonen beheren**. (hfst 15.4)
- [ ] **Algemeen: vinkjes.** **Dashboard bekijken**, **Prullenbak beheren** (niet aan de rol Beheerder gebonden). (hfst 15.4)
- [ ] **Fiscale vinkjes.** Controleer dat de zes fiscale vinkjes bestaan: **Fiscaal bekijken**, **Fiscale beoordelingen en gegevens beheren**, **Fiscale configuratie voorbereiden/goedkeuren/publiceren**, **Fiscale auditlog bekijken**; het fiscale overzicht staat onder **Klantenportaal** → **Fiscale check** en **Rapporten** → **Fiscaal**. (hfst 15.4)
- [ ] **Documentvinkjes.** [account met Reserveringen beheren, zonder documentrechten] Verwacht: het menu-item **Documenten** ontbreekt, het tabblad **Documenten** op de voertuigkaart is leeg, bij het ophalen wordt het contract wel gemaakt maar je kunt het niet openen. (hfst 15.5)
- [ ] **Kilometerverlaging ook voor een beheerder.** [beheerder zonder het vinkje **Kilometerverlaging goedkeuren**] Verwacht: *Je hebt geen recht om een verlaging van de kilometerstand te autoriseren. …* (hfst 15.6)
- [ ] **Profiel baliemedewerker.** [balie] Verwacht in het menu: **Dashboard**, **Voertuigen**, **Scannen**, **Klanten**, **Klantenportaal**, **Reserveringen**, **Documenten**, **Transporten**. Kan ophalen en innemen; kan geen klant of voertuig wijzigen, geen kosten registreren, geen onderhoud plannen, geen rapporten openen, geen document genereren of mailen. (hfst 15.7)
- [ ] **Profiel verhuurmedewerker.** [kantoor] Verwacht: **Onderhoud**, **Communicatie**, **Rapporten** ontbreken; kan klanten aanmaken, boekingen wijzigen, contracten genereren en mailen, kosten vastleggen. (hfst 15.7)
- [ ] **Profiel kijker.** [kijker] Verwacht: alleen lezen; **Ophalen starten** en **Innemen starten** op het Dashboard lopen stuk op een rechtenmelding. (hfst 15.7)
- [ ] **Profiel werkplaats.** [werkplaats] Verwacht in het menu: **Voertuigen**, **Scannen**, **Onderhoud**, **Kosten**; zonder **Reserveringen bekijken** toont het onderhoudsscherm *Geen toegang tot deze gegevens (recht 'Reserveringen bekijken')*. (hfst 15.7)
- [ ] **Profiel boekhouding.** [Kosten beheren, Rapporten bekijken, Voertuigen bekijken] Verwacht: **Voertuigen**, **Scannen**, **Kosten**, **Rapporten**; **Administratie** vraagt ook **Reserveringen bekijken**. (hfst 15.7)
- [ ] **Drie manieren waarop je een recht mist.** (1) het menu-item ontbreekt; (2) *Not authorized. One of these permissions required: view_documents, manage_documents*; (3) **Toegang geweigerd** — *Je hebt geen toestemming voor deze functie.* (hfst 15.8)
- [ ] **Scherm zonder recht.** Open met een oud adres een scherm waarvoor je geen recht hebt (bijvoorbeeld `/maintenance`, `/reservations/edit/…`, `/expenses/add`). Verwacht: de pagina **U heeft geen toegang tot dit scherm** met *Hiervoor is het recht 'Onderhoud beheren' nodig. Vraag een beheerder om het aan te zetten.* en een knop naar het eerste scherm dat je wel mag. (hfst 15.9)
- [ ] **Grijze knoppen.** Wijs aan, spring er met Tab naartoe, of tik op een tablet. Verwacht: een tekstballon met het vinkje, geen foutmelding en geen half uitgevoerde actie; ook een grijs tabblad (**Contractsjablonen**). (hfst 15.9)
- [ ] **Stukjes zonder recht.** Verwacht: *Geen toegang tot deze gegevens (recht '…')* of het stukje is weggelaten, zonder foutmelding. (hfst 15.9)
- [ ] **Transporten, Communicatie, Onderhoud.** **Transporten** staat bij **Reserveringen bekijken/beheren** óf **Voertuigen bekijken/beheren**; **Communicatie** bij **Meldingen beheren** óf **E-mailsjablonen beheren**; sjabloonbeheer en het e-maillogboek alleen met **E-mailsjablonen beheren**; **Onderhoud** met **Onderhoud beheren**. (hfst 15.10)
- [ ] **Onderhoud beheren: wat het wel en niet dekt.** [account met alleen Onderhoud beheren plus de leesrechten] Probeer: nieuw onderhoud inplannen (niet), een blok bewerken (niet), **Afronden** (wel), **Binnen melden** (niet; vraagt **Voertuigen beheren**), prullenbak (niet; vraagt **Prullenbak beheren**). **(nieuw: Binnen melden en Terug uit onderhoud)** (hfst 15.11)
- [ ] **Etiketsjablonen.** Iedereen kan de lijst zien; **Barcode-etiketten beheren** is grijs zonder **PDF-sjablonen beheren**. (hfst 15.12)
- [ ] **Prijzen verbergen.** Zet de schakelaar aan voor een testaccount. Verwacht: overal **•••** in plaats van een bedrag; alles blijft verder werken. (hfst 15.13)
- [ ] **Actief en inactief.** Een inactief account kan niet inloggen. (hfst 15.14)
- [ ] **De drie eigen vinkjes.** Zet **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren** aan en uit bij een testaccount en controleer dat de knoppen volgen. (hfst 15.16)
- [ ] **Rechten-afhankelijkheden.** Zie hoofdstuk 10: *Heeft nodig*, *Handig erbij*, **Benodigde rechten ook aanzetten**, *alleen voor beheerders*. **(nieuw)** (hfst 15.17)

---

## Hoofdstuk 16 — Dagelijks werk

Doe dit als een echte werkdag, bij voorkeur met twee collega's.

### De ochtend

- [ ] **Stap 1: het Dashboard lezen.** Back-upbalk, **APK verloopt binnenkort**, **Achterstallige verhuringen**, **Beheer vervangende voertuigen** → **Nog te bepalen**. (hfst 16.2)
- [ ] **Stap 2: vervangers toewijzen.** **Voertuig toewijzen** bij een regel op **Nog te bepalen**. (hfst 16.2)
- [ ] **Stap 3: wat er vandaag meegaat.** **Reserveringen** (vandaag: **uit**/**in**, **+… meer**, **Vandaag**), **Onderhoud** (label **Vervanger nodig**), **Transporten** (tellers **Wacht op planning** en **Klaar voor levering**). (hfst 16.2)
- [ ] **Stap 4: achterstallig nalopen.** **… achterstallig** → per regel kiezen: laten staan, **Details bekijken** → **Inleveren starten**, of corrigeren. (hfst 16.2)
- [ ] **Stap 5: portaalaanvragen.** **Klantenportaal** → **Aandacht nodig**. (hfst 16.2)

### Tijdens de dag

- [ ] **Een klant komt ophalen.** Volg de zes stappen in 16.3 en controleer de eerdere startdatum, de werkplaats-melding en de volgorde. (hfst 16.3)
- [ ] **Een auto komt terug.** Volg de zes stappen; de huur sluit meteen. Controleer kenteken en klant vóór je afrondt. (hfst 16.3)
- [ ] **Een klant belt.** Zoek op contractnummer. Probeer: langer doorrijden (**Datums wijzigen**), een vrije auto volgende week (eerst datums), schade (notities), een bekeuring (**Klantenportaal** → **Bekeuringen**). (hfst 16.3)
- [ ] **Een auto moet naar de werkplaats.** De goede volgorde: auto eerst op onderhoud (**Voertuig markeren voor onderhoud** of **Onderhoud plannen** of scan → **Onderhoud inplannen**), dan de vervanger, dan het transport, dan afronden met **Terug van onderhoud** (of **Afronden**). Vergeet je een keuze: **Ontbrekende toewijzingen vervangend voertuig**. **(nieuw: Afronden)** (hfst 16.3)
- [ ] **Een portaalaanvraag komt binnen.** Het rode bolletje, de portaaltegel en **Aandacht nodig**. Soorten: **Verlenging**, **Eerder inleveren**, **Schademelding**, **Vraag over bekeuring**, **Huuraanvraag**, **Onderhoud/storing**, **Kilometerstand**, **Overig**. Afhandelen met de vijf knoppen. **Afwijzen** vraagt een toelichting in **Antwoord aan klant**. (hfst 16.3)
- [ ] **Een transport.** Tabbladen, meerdere regels in één keer, en **Vervangend voertuig vereist** als er geen vervanger is toegewezen. (hfst 16.3)

### Het einde van de dag

- [ ] **1. Alles ingenomen?** Vakje van vandaag: elke regel met **in** nalopen. (hfst 16.4)
- [ ] **2. Vervangers.** Geen rij meer op **Nog te bepalen**. (hfst 16.4)
- [ ] **3. Portaalaanvragen aangeraakt.** Het rode bolletje is weg of de aanvragen staan op **In behandeling**. (hfst 16.4)
- [ ] **4. Geannuleerd?** Wat eraan hing is meegegaan. (hfst 16.4)
- [ ] **5. Wat morgen moet.** Belletje → **Nieuwe melding** met titel, datum en prioriteit. (hfst 16.4)
- [ ] **Uitloggen.** (hfst 16.4)
- [ ] **Eén keer per week.** **APK verloopt binnenkort**, de achterstallige verhuringen (ook de oude), de back-up, nieuwe klanten op dubbelen. (hfst 16.5)

---

## Hoofdstuk 17 — Inwerkpad

Het inwerkpad is voor een nieuwe medewerker. Loop met een testaccount de "Doen"-oefeningen na en controleer dat ze met de app kloppen.

- [ ] **Stap 0.** Een eigen account met de rechten van een profiel uit 15.7. (hfst 17.2)
- [ ] **Stap 1 (dag 1, ochtend).** Inloggen, wachtwoord wijzigen (10 tekens), Dashboard lezen, het vakje van vandaag, drie dingen zoeken, `?` en `Ctrl+K`, `N`, `S`, een label scannen, uitloggen. (hfst 17.3)
- [ ] **Stap 2 (dag 1, middag).** Vijf woorden in de app aanwijzen. (hfst 17.4)
- [ ] **Stap 3 (dag 2).** Klanten en voertuigen: drie klanten, oefenklant, "bestaat mogelijk al", zes tabbladen, statuslabels, **Geschiedenis**. (hfst 17.5)
- [ ] **Stap 4 (dag 3).** Reserveringen: kalender, **Lijstweergave**, **Voltooid bekijken (…)**, **… achterstallig**, oefenreservering, bezette auto (rood), onderhoud (geel), **Datums wijzigen**. De oefening noemt geen statusveld meer. **(nieuw)** (hfst 17.6)
- [ ] **Stap 5 (dag 4).** Ophalen en innemen onder begeleiding; **… achterstallig** met je begeleider; de drie vragen. (hfst 17.7)
- [ ] **Stap 6 (dag 5).** Documenten en e-mail: contract zoeken, bekijken, downloaden, afdrukken, **Verouderd**, mailen tot en met de adreskeuze. (hfst 17.8)
- [ ] **Stap 7 (week 2).** Onderhoud en transport: kalender lezen, **Onderhoud plannen** doorlopen zonder opslaan, vervanger toewijzen, de volgorde uitleggen. (hfst 17.9)
- [ ] **Stap 8 (week 2).** Fouten: de tabel in 11.18, drie meldingen in hoofdstuk 12, een ophaling terugdraaien met **Overdracht terugdraaien**, de **Geschiedenis**, wie **Prullenbak beheren** heeft. (hfst 17.10)
- [ ] **Stap 9 (week 3).** Rollen en rechten: eigen menu-items verklaren, de twee documentvinkjes, wat alleen een beheerder kan en wat een eigen vinkje vraagt (15.16). (hfst 17.11)
- [ ] **Stap 10 (week 3).** Een hele dag zelf, met scannen als gewoonte, en de **Sleutelkast-audit**. (hfst 17.12)
- [ ] **De afrondende controle.** Kun je de twaalf dingen in 17.13 zonder de handleiding? (hfst 17.13)

---

## Hoofdstuk 18 — Barcode en scannen

### Het scanscherm

- [ ] **Openen.** **Scannen** in het menu, `S`, of **Scannen** bij **Snelle acties**. Verwacht: **Barcode scannen** met invoerveld, **Zoeken**, cameraknopje en onderaan **Recente scans**. (hfst 18.1)
- [ ] **USB-scanner.** Scan met de cursor in het veld. Verwacht: de scanner typt en drukt zelf Enter. (hfst 18.1)
- [ ] **Met de hand.** Typ een code → **Zoeken** of Enter. Verwacht: *Bezig met zoeken...* (hfst 18.1)
- [ ] **Letters in het scanveld.** `N`, `S`, `?` doen niets in het scanveld. (hfst 18.1)
- [ ] **Codes.** `VEH-000123` (voertuig), `VEH-000123-S` (reservesleutel; extra label **Reservesleutel**), `VEH-000123-R2` (opnieuw aangemaakt label), `RES-003366` (reservering), een kenteken; hoofdletters, kleine letters en spaties maken niet uit. (hfst 18.2)
- [ ] **Niet gevonden.** Verwacht: *Geen voertuig of reservering gevonden voor "ZZ-00-ZZ"*; bij een storing *Opzoeken mislukt. Controleer de verbinding en probeer opnieuw.* (hfst 18.2)
- [ ] **Resultaat bij een voertuig.** Verwacht: merk en model, statuslabel (**Beschikbaar**, **Gepland**, **Verhuurd**, **Reparatie nodig**, **Niet voor verhuur**), kenteken met barcode; **Geboekt, nog niet opgehaald** bij een boeking van vandaag die nog niet is opgehaald; gegevens **APK-vervaldatum**, **Garantie tot**, **Kilometerstand**, **Brandstof**, **Registratie** (**N.v.t.** als onbekend). (hfst 18.3)
- [ ] **Blokken.** **Actieve reservering** of **Aankomende reservering** (met **Reservering openen**; leeg: *Geen actieve of aankomende reservering*), oranje **Onderhoud** (met **Onderhoudsblok openen**; stand **Gepland**, **In werkplaats**, **Voltooid**), **Actief transport** (**Gepland** of **Onderweg**). (hfst 18.3)
- [ ] **Bij een reservering.** **Reservering gevonden** met auto, klant, status, periode, **Reservering openen** en **Voertuig openen**. (hfst 18.3)

### Wat je kunt doen

- [ ] **Altijd zichtbaar.** **Opnieuw scannen**, **Voertuig openen**, **Kosten registreren**, **Document uploaden**, **Tanken**, **Km-stand bijwerken**. (hfst 18.4)
- [ ] **Afhankelijk van de situatie.** **Ophalen starten** · **Inleveren starten** (altijd maar één) · **Reservering maken** (geen reservering) · **Onderhoud inplannen** of **Terug uit onderhoud** (sluiten elkaar uit) · **Transport starten** / **Transport afronden**. (hfst 18.4)
- [ ] **Ophalen en inleveren vanaf het scankaartje.** Zie hoofdstuk 5; het kaartje verdwijnt zolang het formulier openstaat en komt terug. (hfst 18.4)
- [ ] **Tanken en Km-stand.** **Tanken** opent **Brandstofstatus bijwerken** (met kostenpost bij een bedrag); **Km-stand bijwerken** opent **Kilometerstand bijwerken**. **(nieuw: kostenpost)** (hfst 18.4)
- [ ] **Terug uit onderhoud, twee manieren.** Op **Binnen** in een blok van vandaag: **Onderhoud afronden** opent; zonder blok: één klik en **Voertuig is terug uit onderhoud**. De tegel ontbreekt als de auto geen werkplaatsstatus heeft (bijvoorbeeld bij een blok dat je via het bewerkvenster op **Binnen** zette): rond dan af via **Onderhoudsblok openen** → **Afronden**. **(nieuw)** (hfst 18.4)
- [ ] **Alleen Voertuigen beheren.** [alleen Voertuigen beheren] **Terug uit onderhoud** bij een auto op **Binnen**: grijs, de ballon noemt **Onderhoud beheren** of **Reserveringen beheren**. **(nieuw)** (hfst 18.4, 15.11)
- [ ] **Transport starten/afronden.** **Transport gestart** → **Transport afgerond**. Fouten: **Onderhoudsstatus wijzigen mislukt**, **Transportstatus wijzigen mislukt**. (hfst 18.4)
- [ ] **Het scanscherm start zelf geen ophaling.** Scan je op het scanscherm, dan zie je eerst het kaartje; scan je via een tegel op het Dashboard, dan opent het ophaalvenster direct. (hfst 18.4, 18.7)

### Recente scans en camera

- [ ] **Recente scans.** Verwacht per regel: tijdstip, code, kenteken, wie scande; **geen match** als er niets gevonden is; *Nog geen scans* als leeg. De tijden staan op de Nederlandse klok. **(nieuw)** (hfst 18.5)
- [ ] **Camera.** Cameraknopje → **Camera scannen** — *Richt de camera op de barcode van het sleutellabel.*; zodra hij gelezen is gaat het venster dicht; **Sluiten** stopt. Via gewoon http: *De browser blokkeert de camera omdat de app via onbeveiligd HTTP wordt geopend. …*; andere meldingen: *Cameratoegang geweigerd. …*, *Geen camera gevonden op dit apparaat.*, *Camera starten mislukt.* (hfst 18.6)

### Vanuit het Dashboard

- [ ] **Ophalen starten.** Venster **Ophalen starten** — *Scan het sleutellabel of typ het kenteken. De juiste handeling wordt meteen geopend.* (hfst 18.7)
- [ ] **Innemen starten.** Zelfde voor inleveren; de knop heet hier **Innemen starten**, op het scanscherm **Inleveren starten**. (hfst 18.7)
- [ ] **Schadecheck starten.** *Scan de barcode van het voertuig. Bij een opgehaald voertuig start de retourcheck, anders de ophaalcheck.*; **Doorgaan zonder scan**. (hfst 18.7)

### Sleutelkast-audit en labels

- [ ] **Sleutelkast-audit.** **Voertuigen** → **Sleutelkast-audit** — *Scan alle sleutels in de kast; daarna zie je welke ontbreken.* Verwacht: de teller *0 van 305 verwachte sleutels gescand*; na elke scan *Gescand: AB-123-C*; lijsten **Gescand (n)** en **Nog niet gescand (n)**; *Nog niets gescand*; *Alle verwachte sleutels zijn gescand*. (hfst 18.8)
- [ ] **Audit afronden.** **Audit afronden**. Verwacht: **Ontbrekende sleutels**, **Onverwacht aanwezig (voertuig staat als verhuurd)**, of *Geen sleutels ontbreken 🎉*. **Opnieuw beginnen** wist de telling; **Sluiten**. De uitslag wordt niet bewaard en kan niet worden afgedrukt. (hfst 18.8)
- [ ] **Meldingen tijdens het scannen.** *Al gescand*; *Onbekende code: <code>*; *Dit is een reserveringscode, geen voertuigsleutel*; *Dit is een hoofdsleutel. Scan het reservesleutel-label (-S).*; *Dit is een reservesleutel. Gebruik hiervoor de reservesleutelkast-audit.* (hfst 18.8)
- [ ] **Reservesleutelkast-audit.** **Reservesleutelkast-audit** — *Scan alle reservesleutels in de kast; daarna zie je welke ontbreken.*; het tweede blok heet **Onverwacht aanwezig (staat als bij klant of zonder reservesleutel)**. Zet een reservesleutel bij de klant: **Bewerken** → **Technisch** → **Reservesleutel bij klant** met **Klantnaam**. (hfst 18.8)
- [ ] **Een label afdrukken.** **Barcode bekijken** → **Labelsjabloon** → **Sleutellabel afdrukken**; op de voertuigkaart ook **Sleutellabel** en **Reservesleutel-label** (eerst **Labelsjabloon**, dan **Afdrukken**). Het **Labelsjabloon** biedt **Standaardindeling**, **DYMO-tape (labelmaker, staand)** en de eigen sjablonen. (hfst 18.9)
- [ ] **Stickers op de DYMO-tape.** **Barcodeboek** → **Labelsjabloon** op **DYMO-tape (labelmaker, staand)** → twee auto's aanvinken → **Stickers afdrukken**. Verwacht: **Afdrukvenster geopend** — *Het afdrukvenster van je browser is geopend voor 2 tapelabels. …*; twee labels na elkaar uit de labelmaker. (hfst 18.9)
- [ ] **Barcode opnieuw genereren.** Waarschuwing **Barcode opnieuw genereren?** — *De oude barcode (<code>) werkt daarna niet meer. …*; daarna **Nieuwe barcode: <code>**. Alleen op een oefenauto. (hfst 18.9)
- [ ] **Barcodeboek.** **Voertuigen** → **Barcodeboek** — *Druk alle voertuigbarcodes af voor in een map of klapper.* Verwacht: **Labelsjabloon**, zoekveld, **Alle statussen**, **Alles selecteren**, **Selectie wissen**, *… geselecteerd*, en de afdrukknoppen **Selectie afdrukken** / **Gefilterde afdrukken (…)** / **Alles afdrukken (…)** en **Stickers afdrukken**; de kop *Barcodeboek — Auto Lease LAM*; bij een pop-upblokkade *Je browser heeft afdrukken geblokkeerd. Gebruik de downloadknop en druk handmatig af.* (hfst 18.9)

---

## Na de uitrol (beheerder)

Deze regels doe je **na** de uitrol op productie, in deze volgorde. Ze komen uit besluit B-43 en de eindbeoordeling. Het zijn de enige regels in deze lijst die iets in de echte gegevens veranderen; ze zijn bedoeld voor de beheerder.

### Instellingen die je zelf moet zetten

- [ ] **Bedrijfsnaam opslaan.** [beheerder] **App-instellingen** → **Bedrijfsregels** → **Bedrijfsnaam** → controleer de naam (standaard *Autolease Lam*) → **Bedrijfsnaam opslaan**. Verwacht: *De bedrijfsnaam is opgeslagen.* **Doe dit echt:** tot dit moment zeggen de portaalmails en de meldingen in het klantenportaal nog *Lam Groep*. (hfst 10.3)
- [ ] **Containerlog na het opslaan van de bedrijfsnaam.** Verwacht: de regel `📧 portal e-mail templates: n unedited template(s) now follow the company name setting`. (B-43)
- [ ] **Portaalmail controleren.** Stuur een portaaluitnodiging of wachtwoord-reset naar je eigen adres. Verwacht: de mail noemt de nieuwe bedrijfsnaam. (hfst 10.3)
- [ ] **Tijdzone controleren.** **App-instellingen** → **Bedrijfsregels** → **Tijdzone van het kantoor**. Verwacht: *Europe/Amsterdam*. Niet wijzigen. (hfst 10.3)
- [ ] **Tijd op een gedrukt document.** Maak een contract of transportrapport en controleer de tijd (de Nederlandse klok). (hfst 8.2)

### Voertuigtypes

- [ ] **RDW-controle.** **App-instellingen** → **Voertuigen** → **RDW-voertuigtypes** → **Controleren**. Wacht tot *Controleren… 12 van 99 voertuigen* klaar is. Doe dit **niet** terwijl een collega ook **Controleren** draait. (hfst 4.13)
- [ ] **De lijst helemaal lezen.** Lees de hele lijst (*Type: oud → nieuw*), ook typen die iemand ooit met de hand zette. Hoort een auto zijn type te houden, noteer hem: na **Toepassen** zet je hem met **Bewerken** terug. (hfst 4.13)
- [ ] **Toepassen.** Pas daarna **Toepassen** → **RDW-voertuigtypes toepassen?** → **Toepassen**. Verwacht: **RDW-voertuigtypes toegepast** — *7 voertuigen aangepast, 0 overgeslagen (type intussen gewijzigd).* (hfst 4.13)

### Log en database

- [ ] **Containerlog bij de eerste start.** Verwacht: de regel `User foreign keys set to ON DELETE SET NULL: 20 key(s) changed` (marker `migration:d19_user_fk_set_null`). Staat er een regel `⚠️ D19: …`, dan is een koppeling overgeslagen en wordt die bij elke start opnieuw geprobeerd: meld dat. (B-43)
- [ ] **De app start zonder fouten.** Er zijn vijf nieuwe kolommen via `schema-columns.json` (`expenses.source`, `expenses.source_ref`, `vehicles.maintenance_status_block_id`, `fines.customer_notified_at`, `users.last_login_at`); controleer dat de app zonder fouten opstart. (B-43)
- [ ] **Bekeuringsstatussen.** Draai `SELECT status, count(*) FROM fines GROUP BY 1`. Verwacht: **Doorbelast**, **Betaald** en **Betwist** komen alleen voor bij oude bekeuringen die ze mogen houden. (B-43)
- [ ] **Tijdkolommen (B-22) zitten niet in deze uitrol.** Het stappenplan staat in `docs/superpowers/specs/2026-10-11-timestamptz-kolommen.md`; dat blijft een aparte actie met jou erbij (back-up, kopie, rapport, onderhoudsvenster, één keer `TIMESTAMPTZ_MIGRATION=apply`, daarna drie bekende tijden controleren). (B-43)

### Collega's en rechten

- [ ] **Wachtwoordregel melden aan collega's.** Meld: minimaal 10 tekens, met een hoofdletter, een kleine letter en een cijfer; geldt alleen bij een nieuw wachtwoord; bestaande wachtwoorden blijven werken; ieder wijzigt zijn eigen wachtwoord via je naam → **Profiel** → **Wachtwoord wijzigen**. (hfst 10.2)
- [ ] **Vinkjes voor managers.** Controleer dat de bestaande managers **Overdracht terugdraaien**, **Opgehaalde huur annuleren of verwijderen** en **Prullenbak beheren** hebben (eenmalig automatisch); bij elk ander account zet je ze zelf aan. (hfst 15.16)
- [ ] **Laatste beheerder.** Controleer dat er minstens twee actieve beheerders zijn. (hfst 10.2)
- [ ] **De open vraag D21.** Mag een collega met **Gebruikers beheren** die zelf geen beheerder is, een beheerder verwijderen of degraderen? Via de app kan het niet, via de API wel. Er is een nieuw besluit nodig; noteer jouw keuze. (B-43)

### Een dag na de uitrol

- [ ] **Geweigerde pogingen.** [beheerder] Na je tweede inlog: de balk *Sinds je vorige inlog …* op het **Dashboard**; **Bekijken** laat zien wie wat probeerde. Een rij pogingen op hetzelfde onderdeel wijst eerder op een vergeten vinkje dan op rondsnuffelen. (hfst 10.2)
- [ ] **Back-up.** **Back-upbeheer**: **Laatste back-up** is van de afgelopen nacht (02:00) en er staat geen **Laatste back-upfout:**. (hfst 10.4)
- [ ] **Nachtelijke taken in de nieuwe klok.** Controleer de volgende ochtend dat de back-up, APK-scan, fiscale run en het postvak om de verwachte tijd draaiden. (hfst 10.3)

---

## De controles die alleen jij in de browser kunt doen

Dit zijn de handmatige browsercontroles die de eindbeoordeling noemt. Ze vragen een echte browsersessie en kunnen niet automatisch getest worden.

- [ ] **Balk met geweigerde pogingen.** Na een tweede inlog als beheerder staat de balk bovenaan het **Dashboard**; **Bekijken** opent **Geweigerde pogingen**. **(nieuw)** (hfst 10.2)
- [ ] **Scanscherm Terug uit onderhoud.** Scan een auto die op **Binnen** staat. Het venster **Onderhoud afronden** moet openen. **(nieuw)** (hfst 18.4, 7.5)
- [ ] **Nu ophalen vanaf een klantkaart.** **Klanten** → **Bekijken** → **Nieuwe reservering** → boeken. Verwacht: de melding met **Nu ophalen** (twaalf seconden, linksonder, als het venster zichzelf sluit) opent het ophaalvenster voor déze reservering. **(nieuw)** (hfst 5.3)
- [ ] **Portaalmail na het opslaan van de bedrijfsnaam.** Zie "Na de uitrol". **(nieuw)** (hfst 10.3)
- [ ] **De tijd op een gedrukt document.** Controleer een tijd op een gedrukt contract of schadeformulier. **(nieuw)** (hfst 8.2)

---

## Afsluiting

Ga na afloop door je regels. Staan er nog open regels, dan hoort daar een notitie bij met wat je zag. Alles wat je als fout hebt aangemerkt, geef je door aan degene die de app bijhoudt. Is alles afgestreept (of bewust opengelaten met een reden), dan kun je de uitrol als geaccepteerd beschouwen.

| | |
|---|---|
| Gecontroleerd door | |
| Datum | |
| Omgeving (test of productie) | |
| Open punten | |
