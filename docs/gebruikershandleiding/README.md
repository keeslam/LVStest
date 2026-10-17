# Gebruikershandleiding Car Rental Manager

```
Car Rental Manager
Gebruikershandleiding
Voor nieuwe medewerkers

Versie: 1.1
Datum: 17 oktober 2026
```

---

## Waar deze handleiding over gaat

Car Rental Manager is de beheerapplicatie van Auto Lease LAM. Alles wat op kantoor met een
voertuig, een klant, een verhuring, onderhoud, transport of een document gebeurt, gaat via deze
app. In de app zelf staat linksboven de naam **Auto Lease LAM**.

Deze handleiding beschrijft de app zoals die nu werkt. Elke handeling die erin staat, is in de
app nagelopen. Staat iets er niet in, dan kan het zijn dat het niet bestaat of dat je er geen
rechten voor hebt — zie hoofdstuk 15.

## Voor wie

Voor nieuwe medewerkers op kantoor en aan de balie. Je hoeft niets van computers te weten. Waar
een scherm iets doet wat je niet verwacht, staat dat er gewoon bij.

De handleiding spreekt je aan met **je**. Knoppen, menu's en tabbladen staan **vet** en met
exact de tekst die de app laat zien. Staat er in de app een Engels woord, dan staat dat Engelse
woord ook hier — dan weet je zeker dat je het goede knopje hebt.

**De afbeeldingen.** Bij elke handeling staat een afbeelding van het scherm of het venster. De rode
omlijningen met een nummer erop staan alleen in de handleiding, niet in de app: ze wijzen aan waar je
moet klikken of typen, en de regel onder de afbeelding zegt wat elk nummer is. De namen en kentekens
op de afbeeldingen zijn verzonnen testgegevens.

**In de app.** Dezelfde handleiding staat in de app: klik rechtsboven op je naam en kies
**Handleiding**. Daar kun je ook zoeken: typ een woord in het zoekveld boven de hoofdstukken en klik
op een treffer.

## Hoe je deze handleiding gebruikt

- Wil je weten wat er sinds de laatste uitrol anders werkt? Hoofdstuk 0.
- Wil je alles zelf uitproberen en afvinken? Hoofdstuk 19, de acceptatiechecklist.
- Ben je vandaag begonnen? Lees hoofdstuk 1 en 2, en werk daarna hoofdstuk 17 af.
- Zoek je één handeling? Kijk in hoofdstuk 13, het snel naslagwerk.
- Wil je weten hoe een werkdag hoort te lopen? Hoofdstuk 16.
- Snap je een woord niet? Hoofdstuk 14, de woordenlijst.

---

## Inhoudsopgave

| # | Hoofdstuk | Waarover |
|---|---|---|
| 0 | [Wat is er nieuw](00-wat-is-nieuw.md) | Wat er sinds de uitrol van 12 oktober 2026 anders werkt, per rol: balie, werkplaats en beheerder |
| 1 | [Snel aan de slag](01-snel-aan-de-slag.md) | Inloggen, het hoofdscherm, iets opzoeken, de meest voorkomende taken, uitloggen |
| 2 | [Navigatie](02-navigatie.md) | Het menu, het dashboard, zoeken, snelle acties, sneltoetsen |
| 3 | [Klanten](03-klanten.md) | Klanten opzoeken, aanmaken en bijwerken, chauffeurs en portaalaccounts |
| 4 | [Voertuigen](04-voertuigen.md) | Het wagenpark, voertuiggegevens, statussen, APK, sleutellabels |
| 5 | [Reserveringen](05-reserveringen.md) | Boeken, ophalen, innemen, terugdraaien, wijzigen, annuleren en achterstallige verhuringen nalopen |
| 6 | [Transport](06-transport.md) | Leveringen, wissels, sleepacties, terughalen en het transportrapport |
| 7 | [Onderhoud](07-onderhoud.md) | Onderhoud plannen en afronden, de werkplaatsstatus en vervangende voertuigen |
| 8 | [Documenten en afdrukken](08-documenten.md) | Contracten, schadechecks, sjablonen en verouderde documenten |
| 9 | [E-mail versturen vanuit de app](09-email.md) | Welke mail er uitgaat, naar wie, en wat je doet als het misgaat |
| 10 | [Beheer](10-beheer.md) | Gebruikers en rechten, instellingen, back-ups, geschiedenis en de prullenbakken |
| 11 | [Veelgemaakte fouten en hoe je ze herstelt](11-veelgemaakte-fouten.md) | Wat er misgaat, hoe je het voorkomt en hoe je het herstelt |
| 12 | [Problemen oplossen](12-problemen-oplossen.md) | De meest voorkomende problemen, de foutmeldingen en de bekende beperkingen |
| 13 | [Snel naslagwerk](13-snel-naslagwerk.md) | Elke veelgebruikte taak als één regel klikpad |
| 14 | [Woordenlijst](14-woordenlijst.md) | De woorden die de app gebruikt, uitgelegd |
| 15 | [Rollen en rechten](15-rollen-en-rechten.md) | Wie wat mag, en wat je ziet als je een recht mist |
| 16 | [Dagelijks werk](16-dagelijks-werk.md) | De ochtend, de dag, het einde van de dag |
| 17 | [Inwerkpad](17-inwerkpad.md) | In welke volgorde je dit leert, met oefeningen |
| 18 | [Barcode en scannen](18-barcode-en-scannen.md) | Sleutellabels scannen, doorwerken vanaf het scanscherm, de sleutelkast-audit |
| 19 | [Acceptatiechecklist](19-acceptatiechecklist.md) | Een afvinkbare lijst van alles wat de app doet, hoofdstuk voor hoofdstuk, om zelf uit te proberen |

Alle achttien hoofdstukken zijn af, met daarbij een overzicht van wat nieuw is (hoofdstuk 0) en een
acceptatiechecklist (hoofdstuk 19). De schermafbeeldingen staan in de map `afbeeldingen/` en
worden vanuit de hoofdstukken zelf getoond.

**Versie 1.1, 17 oktober 2026.** Elk hoofdstuk is langs de app gelopen (de lijst van afwijkingen
staat in `afwijkingen-2026-10-17.md`), de tekst is gecorrigeerd en elke handeling heeft nu een
afbeelding met genummerde omlijningen. Nieuw sinds 12 oktober: de handleiding in de app met
zoekfunctie, **Voertuig blokkeren** op de klantkaart, de nieuwe opzet van **Kosten**, klikbare rijen
en sorteerbare kolomkoppen, het afdrukvoorbeeld bij **Rapporten**, de korte code op sleutellabels en
een uitgebreider activiteitenlog (hoofdstuk 0). De afbeeldingen worden gemaakt met
`node scripts/handleiding/run.mjs` tegen de testomgeving (zie `scripts/handleiding/lib.mjs`). Het
PDF-bestand (`Gebruikershandleiding-Car-Rental-Manager-v1.1.pdf`) maak je opnieuw met
`node scripts/build-manual-pdf.cjs`.

---

## Wat er in versie 1.0 bewust níét staat

- **Het klantenportaal vanaf de kant van de klant.** Wat de klant online ziet, valt buiten deze
  handleiding. Hoofdstuk 2 en 3 leggen wel uit wat jij met portaalaanvragen en portaalaccounts
  doet.
- **Installatie en beheer van de server.** Dat is werk voor de beheerder.
- **Kosten en rapporten als eigen hoofdstuk.** Die twee schermen staan kort beschreven in
  hoofdstuk 2, paragraaf 2.8, en hun klikpaden in hoofdstuk 13.

## Als er iets niet klopt

Wijkt de app af van wat hier staat, geloof dan de app en meld het. De handleiding hoort de app
te volgen, niet andersom.
