# 0. Wat is er nieuw

Op 12 oktober 2026 is een nieuwe versie van de app uitgerold. Deze pagina zegt in het kort wat er
anders werkt, per rol: **Balie**, **Werkplaats** en **Beheerder**. Bij elk punt staat wat het is, hoe je het
doet en waar je er meer over leest. De schermafbeeldingen in de handleiding zijn niet vernieuwd; de
tekst klopt, lees die.

Wat je in de app mag, hangt af van je vinkjes (hoofdstuk 15), niet van de naam van je rol. Staat een knop
er niet, of is hij grijs, dan klik of tik je erop: de app zegt welk vinkje je mist.

---

## Balie

1. **Een nieuwe reservering is altijd Geboekt.** Het formulier heeft geen statusveld meer. Kies datums,
   voertuig en klant en klik op **Reservering aanmaken**; verder hoef je niets met een status te doen.
   Meer in [hoofdstuk 5, paragraaf 5.3](05-reserveringen.md).

2. **De status verandert alleen met een knop.** Een auto meegeven doe je met **Ophalen starten**,
   terugnemen met **Inleveren starten** (op het Dashboard heet het **Innemen starten**), afzeggen met
   **Reservering annuleren**, en een vergissing herstel je met **Overdracht terugdraaien** of
   **Annulering terugdraaien**. Een reservering "even" op een andere status zetten kan niet meer. Het
   contractnummer pas je niet meer in het bewerkformulier aan maar met het potloodje bij het nummer
   (**Contractnummer bewerken**). Meer in [hoofdstuk 5, paragraaf 5.13, 5.14 en 5.5](05-reserveringen.md).

3. **Na het boeken kun je meteen ophalen.** Staat de klant al aan de balie, klik dan na **Reservering
   aanmaken** op **Nu ophalen**: het ophaalvenster opent voor die reservering. Sluit het boekvenster
   zichzelf (bijvoorbeeld vanaf het Dashboard of een klantkaart), dan staat dezelfde knop twaalf seconden
   in de melding linksonder. Meer in [hoofdstuk 5, paragraaf 5.3](05-reserveringen.md).

4. **Een bekeuring mailt de klant niet meer vanzelf.** Invoeren, inlezen, importeren en koppelen leggen
   alleen vast. Wil je dat de klant het weet, open dan de gekoppelde bekeuring en klik op **Klant
   informeren**; daarna heet de knop **Opnieuw informeren**. Meer in
   [hoofdstuk 2, paragraaf 2.6](02-navigatie.md) en [hoofdstuk 9, paragraaf 9.1](09-email.md).

5. **Een tankbedrag wordt meteen een kostenpost.** Vul je bij **Brandstofstatus bijwerken** (of bij
   **Tanken** op het scanscherm) een bedrag in bij **Tankkosten (€)**, dan staat er ook een kostenpost in
   de categorie **Brandstof**. Typ het bedrag dus niet nog eens op het scherm **Kosten**. Meer in
   [hoofdstuk 4, paragraaf 4.9](04-voertuigen.md).

6. **Chauffeurs en kostenposten hebben een prullenbak.** Een verwijderde chauffeur staat bij de klant
   onder **Verwijderde chauffeurs** (tabblad **Chauffeurs**), een verwijderde kostenpost op het scherm
   **Kosten** onder **Verwijderde kostenposten**. Met **Terugzetten** haal je ze terug; daar heb je het
   vinkje **Prullenbak beheren** voor nodig. Meer in
   [hoofdstuk 3, paragraaf 3.6](03-klanten.md) en [hoofdstuk 10, paragraaf 10.6](10-beheer.md).

7. **Foutmeldingen zijn in het Nederlands.** In plaats van een kale *Fout* of een stuk code staat er een
   zin die zegt wat er aan de hand is en wat je eraan doet. Staat er toch iets in het Engels, zoek het dan op
   in de tabellen van [hoofdstuk 12, deel 2](12-problemen-oplossen.md).

8. **Sluit je een venster met wijzigingen, dan vraagt de app eerst.** Zie je **Wijzigingen verwerpen?**,
   kies dan **Verder bewerken** om terug te gaan of **Verwerpen** om te sluiten. Dit geldt ook bij het
   boek- en het bewerkvenster van een reservering. Meer in
   [hoofdstuk 5, paragraaf 5.3 en 5.6](05-reserveringen.md).

9. **Een auto in gepland onderhoud is te boeken en op te halen, met een waarschuwing.** Een gele regel
   zegt dat het onderhoud nog niet is binnengemeld; de balie beslist. Staat de auto wél op **Binnen**,
   dan weigert de app het ophalen (**Uitgifte geblokkeerd**). Meer in
   [hoofdstuk 5, paragraaf 5.7](05-reserveringen.md).

10. **Bulk importeren maakt onbekende kentekens alleen aan op verzoek.** Kent de RDW een kenteken niet,
    dan wordt het overgeslagen, tenzij je het vinkje **Ook onbekende kentekens aanmaken** aanzet. Meer in
    [hoofdstuk 4, paragraaf 4.4](04-voertuigen.md).

11. **Sleutellabels op de DYMO-labelmaker.** Kies bij **Labelsjabloon** de optie **DYMO-tape (labelmaker,
    staand)**, laat **Tapebreedte** op 12 mm en **Labellengte (mm)** op 48 staan en druk af. De app zet de
    barcode over de lengte van de tape, met het kenteken en **Hoofd** of **Reserve** eronder; in het
    afdrukvenster kies je de DYMO-printer, papier 12 mm, staand, marges Geen, schaal 100%. Meer in
    [hoofdstuk 18, paragraaf 18.9](18-barcode-en-scannen.md).

---

## Werkplaats

1. **Gepland, Binnen en Reparatie nodig zijn drie verschillende dingen.** Plan je onderhoud, dan staat de
   auto op **Gepland** en is hij nog te verhuren. Pas als je het onderhoud op **Binnen** zet (of in het
   overzicht op **Binnen melden** klikt), wordt de auto **Reparatie nodig**. Een auto die bij een klant
   staat, blijft **Verhuurd**. Meer in [hoofdstuk 7, paragraaf 7.3 en 7.8](07-onderhoud.md).

2. **Je rondt onderhoud af met Afronden, niet met "Uit".** De status **Uit** bestaat niet meer, en het woord
   *Voltooien* is overal **Afronden**. In één venster (**Onderhoud afronden**) vul je de afrondingsdatum, de
   nieuwe APK-datum met het formulier, de kilometerstand en wat er gedaan is in. De auto komt daarna vrij.
   Meer in [hoofdstuk 7, paragraaf 7.6](07-onderhoud.md).

3. **Je kunt het plannen afbreken.** Bedenk je je in het venster **Vervangende voertuigen toewijzen**, klik
   dan op **Annuleren** en kies **Plannen afbreken**: het net aangemaakte onderhoud wordt weggehaald. Wil je
   plannen zonder vervanger, kies dan bij de klant **Later vervanger toewijzen (nog te bepalen)**. Meer in
   [hoofdstuk 7, paragraaf 7.2](07-onderhoud.md).

4. **Een auto binnen melden kan met één klik.** Op **Onderhoud** → **Lijstweergave** → tabblad **Gepland**
   staat bij een blok dat nog niet binnen is de knop **Binnen melden**. Daarvoor heb je het vinkje
   **Voertuigen beheren** nodig. Meer in [hoofdstuk 7, paragraaf 7.8](07-onderhoud.md).

5. **Op het scanscherm opent Terug uit onderhoud het venster Onderhoud afronden.** Staat de auto op
   **Binnen** in een blok van vandaag, dan vul je daar de afronding in. Een scanaccount met alleen
   **Voertuigen beheren** ziet de knop grijs; hij vraagt **Onderhoud beheren** of **Reserveringen beheren**.
   Meer in [hoofdstuk 7, paragraaf 7.5](07-onderhoud.md) en [hoofdstuk 18, paragraaf 18.4](18-barcode-en-scannen.md).

6. **Een onderhoud weghalen geeft de auto vrij.** Verwijder of annuleer je een blok dat de auto op
   **Reparatie nodig** zette, en staat er geen ander blok op **Binnen**, dan is de auto weer verhuurbaar.
   Een stand die iemand met de hand zette, blijft staan. Meer in
   [hoofdstuk 7, paragraaf 7.8](07-onderhoud.md).

7. **Een afgerond onderhoud kun je terugdraaien.** **Voltooide bekijken (…)** → **Terugdraaien**: het blok
   staat weer op **Binnen** en je kunt het opnieuw met **Afronden** sluiten. Meer in
   [hoofdstuk 7, paragraaf 7.8](07-onderhoud.md).

---

## Beheerder

1. **Een wachtwoord van een medewerker heeft minimaal 10 tekens**, met een hoofdletter, een kleine letter
   en een cijfer. De regel geldt alleen voor een nieuw wachtwoord; bestaande wachtwoorden blijven werken. Je
   eigen wachtwoord zet je via je naam → **Profiel** → **Wachtwoord wijzigen**, niet in **Gebruikers**. Meer in
   [hoofdstuk 10, paragraaf 10.2](10-beheer.md).

2. **De laatste actieve beheerder is beschermd.** Hij kan niet worden verwijderd, op inactief gezet of een
   andere rol krijgen (*De laatste actieve beheerder kan niet worden verwijderd, gedeactiveerd of een andere
   rol krijgen*). Een andere beheerder verwijderen kan wel. Maak dus eerst een tweede beheerder aan. Meer in
   [hoofdstuk 10, paragraaf 10.2](10-beheer.md).

3. **Je ziet wat medewerkers probeerden zonder recht.** Als beheerder staat bij het inloggen bovenaan het
   Dashboard een balk *Sinds je vorige inlog … probeerden … medewerkers iets waarvoor ze geen recht hebben*.
   Klik op **Bekijken** voor wie wat probeerde. Een rij pogingen op hetzelfde onderdeel wijst meestal op een
   vergeten vinkje. Meer in [hoofdstuk 10, paragraaf 10.2](10-beheer.md).

4. **Bij elk recht staat wat het nodig heeft.** Onder een vinkje in **Gebruikers** staat *Heeft nodig: …*;
   mist er een, dan is die regel oranje. De knop **Benodigde rechten ook aanzetten** vinkt de ontbrekende
   rechten in één keer aan. **Gebruikers beheren**, **Instellingen beheren** en **Back-ups beheren** zijn
   *alleen voor beheerders*. Meer in [hoofdstuk 10, paragraaf 10.2](10-beheer.md).

5. **Stel de bedrijfsnaam en controleer de tijdzone.** Bij **App-instellingen** → **Bedrijfsregels** sla je
   de **Bedrijfsnaam** op (standaard *Autolease Lam*); tot je dat doet, zeggen de portaalmails en de
   portaalmeldingen nog *Lam Groep*. Controleer ook de **Tijdzone van het kantoor** (*Europe/Amsterdam*).
   Meer in [hoofdstuk 10, paragraaf 10.3](10-beheer.md).

6. **Laat de voertuigtypes nalopen door de RDW.** **App-instellingen** → **Voertuigen** → **RDW-voertuigtypes**:
   klik **Controleren**, lees de hele lijst en klik pas dan op **Toepassen**. Toepassen doet alles of niets en
   is niet in één keer terug te draaien. Doe dit niet terwijl een collega ook controleert. Meer in
   [hoofdstuk 4, paragraaf 4.13](04-voertuigen.md).

7. **Bekeuringen worden alleen geregistreerd.** De statussen zijn **Niet gekoppeld**, **Gekoppeld** en
   **Geannuleerd**; **Doorbelast**, **Betaald** en **Betwist** kun je niet meer kiezen (oude bekeuringen
   houden hun status). Het doorbelasten en betalen regel je buiten de app. De lijst heeft geen eigen
   menu-item meer: je opent hem met de knop **Bekeuringen** bovenaan **Klantenportaal**. Meer in
   [hoofdstuk 2, paragraaf 2.6](02-navigatie.md).

8. **Definitief verwijderen neemt fiscale beoordelingen mee.** Verwijder je een reservering, een
   onderhoudsplanning of een klant definitief, dan gaan de bijbehorende fiscale beoordelingen mee; de
   bevestiging noemt het aantal en het fiscale auditlog onthoudt het. Meer in
   [hoofdstuk 10, paragraaf 10.6](10-beheer.md).

9. **Na de uitrol heb je een kort lijstje.** Bedrijfsnaam opslaan, tijdzone controleren, RDW-typen
   controleren en toepassen, het opstartlog lezen en de collega's de wachtwoordregel melden. Het staat
   afvinkbaar onder "Na de uitrol (beheerder)" in [hoofdstuk 19](19-acceptatiechecklist.md).

---

## Sinds 11 oktober

Deze wijzigingen stonden al in de app voordat de uitrol van 12 oktober kwam. Je merkt ze misschien nog
niet, omdat ze in een eerder deel van het werk zaten.

- **Foutmeldingen in het Nederlands.** Een korte zin die zegt wat er aan de hand is, in plaats van *Fout* of
  een stuk code ([hoofdstuk 12, deel 2](12-problemen-oplossen.md)).
- **CSV-bestanden voor Excel.** Een export met **Exporteren (CSV)** heeft puntkomma's, een decimale komma
  (*112,50*), datums als dd-mm-jjjj en kentekens met streepjes; dubbelklikken opent hem goed in Excel
  ([hoofdstuk 12, deel 2](12-problemen-oplossen.md)).
- **Bevestigingen voor je iets kwijtraakt.** **Wijzigingen verwerpen?** bij sluiten, een bevestiging bij
  **Bekeuring annuleren**, **Account blokkeren?**, **Rapport verwijderen?** en **Definitief verwijderen?**
  ([hoofdstuk 2, paragraaf 2.6 en 2.8](02-navigatie.md)).
- **Lijsten die niet meer vastlopen.** De lijstweergave van reserveringen toont 50 regels met **Toon 50
  meer** en een eigen adres per tabblad ([hoofdstuk 5, paragraaf 5.2](05-reserveringen.md)); onder
  **Klanten** en **Voertuigen** springt het invulveld **Pagina** naar een pagina; bij **Voertuigen** staan
  **Sorteren op:** en **Tonen:** los van elkaar; **Kosten** is één lijst met filters en een **Meer tonen**
  ([hoofdstuk 2, paragraaf 2.8](02-navigatie.md)).
- **Een tik op een grijze knop zegt waarom.** Een knop waarvoor je een vinkje mist, blijft zichtbaar maar
  grijs. Klik of tik erop en er staat welk vinkje je nodig hebt; dat werkt ook op een tablet en met het
  toetsenbord ([hoofdstuk 13, paragraaf 13.16](13-snel-naslagwerk.md) en
  [hoofdstuk 15, paragraaf 15.9](15-rollen-en-rechten.md)).
- **Terugdraaien en meer prullenbakken.** Een ophaling, een inname en een annulering draai je terug met
  **Overdracht terugdraaien** (daar is het vinkje voor nodig), en elk scherm heeft zijn eigen prullenbak
  ([hoofdstuk 5, paragraaf 5.14](05-reserveringen.md) en [hoofdstuk 10, paragraaf 10.6](10-beheer.md)).
- **Een echt e-maillogboek.** **Communicatie** → **E-maillogboek** toont wat de app echt heeft verstuurd,
  met de reden in het Nederlands als een mail mislukte ([hoofdstuk 9, paragraaf 9.4](09-email.md)).
- **Contractfouten noemen het sjabloon.** Mislukt een contract, dan staat er een Nederlandse zin die zegt
  wat er mist en waar je het oplost ([hoofdstuk 8, paragraaf 8.5](08-documenten.md)).

---

## Wat je nog moet weten

- De schermafbeeldingen in de handleiding zijn niet vernieuwd. De tekst is leidend.
- Zie je in de app iets anders dan hier staat, geloof dan de app en meld het.
- Wil je alles zelf uitproberen, doorloop dan [de acceptatiechecklist](19-acceptatiechecklist.md).
