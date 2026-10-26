# Onderhoudsanalyse — ontwerp

Datum: 2026-10-26. Opdrachtgever: Kees. Vervolg op het rapportenherontwerp (main 3932e690).

## Waarom

Het venster **Analyse onderhoudskosten** is niet interactief genoeg en laat te weinig zien. Kees wil merken met
elkaar vergelijken, binnen een merk per type (model), en eerlijk rekening houden met de km-stand: een auto met
200.000 km heeft meer onderhoud nodig dan een nieuwe met 20.000 km die voor de eerste beurt komt.

## Besluiten van Kees

- **Het venster blijft** (knop **Onderhoudsanalyse**), maar wordt helemaal interactief.
- **Inhoud:** kosten per km en per maand; per merk/type/bouwjaar; werkplaats en leverancier; signalen en
  verwachting.
- **Interactief:** overal doorklikken (taartstuk, staaf, merk, type, leverancier, auto, km-klasse-vak ⇒ de
  kostenposten erachter; kenteken ⇒ dossiervenster), zelf filteren en sorteren, grafieken wisselen (wat:
  bedrag / per auto per maand / per km / aantal; hoe: staaf / lijn / taart) en vergelijken met vorige periode of
  vorig jaar.
- **Leverancier:** nieuw veld **Leverancier** bij kosten. Facturen uit het factuurpostvak vullen het automatisch
  met de leverancier van de factuur (ook met terugwerkende kracht voor bestaande postvakkosten); bij handmatige
  kosten kiezen (eerder gebruikte namen) of typen. Zonder leverancier ⇒ "Onbekend".
- **Km alleen beheerder:** kosten per km, km-klassen, km-standen en de verwachting zijn alleen voor beheerders.
  Medewerkers vergelijken merken en typen per maand en per auto.
- **Km-klassen per merk/type:** elke kostenpost telt bij de km-stand die de auto toen had (uit de km-historie,
  laatste geldige stand op of vóór de datum van de post). Klassen 0–50.000, 50–100.000, 100–150.000,
  150–200.000, 200.000+. Per merk en per type: kosten per km in elke klasse (tabel + grafiek; vak klikbaar).
  Een auto wordt alleen vergeleken met hetzelfde type in dezelfde klasse.
- **Signalen** (alleen auto's met genoeg vergelijking): kosten per maand (beheerder: per km in dezelfde km-klasse)
  minstens 50% boven het gemiddelde van hetzelfde merk en type, met minimaal 3 vergelijkbare auto's; stijgende
  kosten in de laatste 3 maanden; dezelfde categorie reparatie twee keer binnen 90 dagen.
- **Verwachting** (beheerder): verwachte onderhoudskosten voor de komende 3 maanden per auto = kosten per km van
  zijn type en km-klasse × km per dag (uit de km-historie) × dagen; opgeteld per type, merk en vloot.

## Indeling van het venster

- **Filterbalk** bovenin: periode (zelfde snelkeuzes als de rapporten), **Vergelijk met**, categorie
  (Onderhoud, Banden, Remmen), merk, type, bouwjaar/leeftijd (uit `productionDate`), km-klasse (beheerder),
  leverancier.
- **Tabbladen:**
  - **Overzicht:** tegels (totale kosten, per auto per maand, aantal posten; beheerder: per km), kosten per
    categorie (grafiek wisselbaar), duurste auto's.
  - **Merken en typen:** merk-tegen-merk en binnen een merk per type; keuze wat je ziet; oordeel alleen bij genoeg
    auto's en posten (bestaande regel); beheerder: km-klassentabel per merk en per type.
  - **Voertuigen:** tabel met zoeken, sorteren, pagina's, **Kolommen** (merk, type, bouwjaar, km-klasse (beheerder),
    kosten, per maand, per km (beheerder), aantal, laatste post).
  - **Leveranciers:** kosten, aantal posten, gemiddelde per post per leverancier; stilstanddagen in de
    werkplaats; duurste reparaties.
  - **Trends:** kosten per maand met vergelijkingsperiode; beheerder: verwachting 3 maanden als stippellijn.
  - **Signalen:** de drie soorten signalen, elk met de reden in gewone taal en doorklik naar de posten.
- Elk tabblad **Afdrukken** (zelfde afdrukvoorbeeld) en **CSV**; doorklikvenster met pagina's/zoeken/CSV/afdrukken.

## Fouten die meegaan

- De taart toont "0 : € …": een categorie zonder naam (labels missen).
- Het merk staat dubbel in het type ("FIAT FIAT DUCATO").
- Kentekens zonder streepjes ("12XPDZ").

## Niet-doelen

- Geen wijziging aan rechten behalve: alles met km blijft beheerder.
- Geen nieuwe rapporttabbladen; het venster blijft een venster.

## Aan de bouwer overgelaten

- Of de server één groot antwoord geeft of per tabblad een eindpunt (rapport-kit stijl met drill-parameters).
- Styling binnen het bestaande design system; hergebruik van de rapportkit (ReportTable, print, drill, quick view,
  vergelijken, Kolommen).
- Leverancierswaarde uit het postvak: de geparste leveranciersnaam van de factuur, anders de afzender.

## Aanvulling na test door Kees (2026-10-26): merk/type-profiel

Kees wil filteren op merk en type en daar informatie uit halen.
- Merk gekozen (filter of klik) ⇒ **Merken en typen** toont de typen van dat merk (grafiek, tabel, km-klassentabel per type).
- Merk + type gekozen ⇒ **profiel** van dat type: aantal auto's, gemiddelde leeftijd en km (km alleen beheerder), kosten per auto per
  maand t.o.v. de hele vloot, kosten per categorie, meest voorkomende reparaties (omschrijving/categorie, aantal, bedrag),
  kosten per bouwjaar, per km-klasse (beheerder), beste en slechtste auto (per auto per maand), leveranciers.
- **Onderhoudsinterval**: gemiddelde maanden (en km, beheerder) tussen twee onderhoudsbeurten (categorie Onderhoud) per type,
  en de auto's die er duidelijk van afwijken (≥ 50 % korter interval dan het typegemiddelde).
- **Advies vervangen** (hint, geen besluit): een auto krijgt de hint als hij in de laatste 12 maanden ≥ 50 % duurder per maand
  was dan zijn type (beheerder: per km in dezelfde km-klasse) én in de laatste 6 maanden ook, met minstens 3 vergelijkbare auto's.
  Tekst: "Deze auto is al een jaar duidelijk duurder dan andere <type>'s. Misschien tijd om vervanging te overwegen."
- Kleine fouten die meegaan: het oordeel vergelijkt altijd met de hele vloot (ook bij filteren); km-tabel toont "–" i.p.v.
  "€ 0,000" en de kolom Onbekende km toont geen bedrag als tarief.

## Aanvulling: meer keuzes in het afdrukvenster (Kees, 2026-10-26)

Geldt voor het afdrukvenster van alle rapporten en de onderhoudsanalyse (de gedeelde kit).
- **Regels kiezen:** per tabel naast Alle regels / Deze pagina / Aangevinkte een keuze **Zelf kiezen** met een lijst vinkjes
  (eerste kolommen als omschrijving), zoekveld (kenteken ook zonder streepjes), **Alles aan**, **Alles uit**, teller "x van y gekozen".
  Vinkjes uit de tabel op het scherm staan dan al aan.
- **Kolommen kiezen:** per tabel vinkjes welke kolommen op papier komen (standaard de kolommen op het scherm).
- **Onderdelen per stuk:** elk onderdeel (tegels, elke grafiek, elke tabel) apart aan/uit, de volgorde aanpassen (omhoog/omlaag)
  en **Elk onderdeel op een nieuwe pagina**.
- **Opmaak en kop:** eigen titel, notitie bovenaan, lettergrootte (Klein / Normaal / Groot), filterregels tonen of verbergen,
  sorteren op een kolom (op/aflopend) vóór het afdrukken. Liggend blijft.
- Het voorbeeld toont altijd precies wat geprint wordt; de keuzes worden per rapport onthouden zolang het venster open is
  (niet per gebruiker opgeslagen). Totalen gelden voor de gekozen regels ("Totaal (gekozen regels)").
