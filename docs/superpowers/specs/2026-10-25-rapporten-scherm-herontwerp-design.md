# Rapportenscherm herontwerp — ontwerp

Datum: 2026-10-25. Opdrachtgever: Kees (eigenaar Lam Groep, niet-technisch).
Vervolg op `2026-10-24-rapporten-uitbreiding-design.md` (fases 1-6, gepusht main 1b5ec6dd).

## Waarom

Kees vindt het rapportenscherm onoverzichtelijk: de tabbladen zijn te lang (Voertuigen ~6.500 px,
Financieel ~7.100 px; de tabel "Kosten en opbrengst per voertuig" alleen al ~3.500 px omdat elke auto
een regel is), met veel regels wordt het onduidelijk, en het werkt onprettig. Hij wil dat het hele
rapportenscherm op de schop gaat, dat elk rapport makkelijk te printen is, en dat hij het later zelf
kan uitbreiden: eigen rapporten op de tabbladen, extra velden uit gekoppelde gegevens, en berekende velden.

Succes voor Kees: hij vindt elk rapport in twee klikken, ziet nooit een eindeloze pagina, kan elk
rapport netjes op A4 afdrukken, en kan zonder ontwikkelaar een nieuw rapport of veld toevoegen.

## Doelen

1. Eén rapport tegelijk in beeld; korte pagina's.
2. Lange tabellen hanteerbaar: pagina's, zoeken, sorteren.
3. Elk rapport afdrukbaar met een duidelijk afdrukvoorbeeld en keuze wat mee gaat.
4. Rapporten uit de bouwer op een tabblad zetten.
5. Gekoppelde velden (auto, klant, reservering, bestuurder) in de bouwer en als extra kolommen bij vaste rapporten.
6. Berekende velden (rekensom, als-dan) en een totaalregel in de bouwer.
7. Handleiding hoofdstuk 21 opnieuw, met nieuwe afbeeldingen.

## Niet-doelen

- De rest van de app (dashboard, voertuigen, reserveringen, …) blijft buiten dit project. Kan later op dezelfde manier.
- Tegels en grafieken van vaste rapporten worden niet door Kees aanpasbaar.
- Geen nieuwe rechten of rollen; bestaande rechtenregels blijven (zie "Rechten").
- APK-overzicht en Garantiestatus blijven aparte rapporten (Kees koos dit samenvoegen niet).
- Geen geplande/automatisch gemailde rapporten.

## Anti-doelen (mislukt, ook als het technisch werkt)

- Een rapport toont gegevens die de gebruiker zonder het juiste recht nu niet kan zien (km-data blijft alleen beheerder).
- Een afdruk of CSV mist regels zonder dat dat zichtbaar is.
- Bestaande opgeslagen rapporten werken niet meer.
- Een berekend veld kan code of SQL uitvoeren (formules worden nooit als tekst in SQL geplakt).

## Besluiten van Kees

### Deel 1 — Nieuw rapportenscherm

- **Filterbalk** bovenaan, blijft staan bij scrollen (sticky). Snelkeuzes: Deze maand, Vorige maand,
  Dit kwartaal, Dit jaar, Zelf kiezen (van/tot). Voertuigfilter. Rechts de knoppen **Rapportbouwer** en
  **Onderhoudsanalyse** (voorheen de kaarten "Aangepaste rapportbouwer" en "Analyse onderhoudskosten").
  De losse knoppen "Afdrukken: APK / Garantie / Kosten / Bekeuring / Klanten" verdwijnen: elk rapport heeft zelf Afdrukken.
  *(Mijn keuze; Kees heeft dit gezien in de mockup.)*
- De periode en het voertuigfilter gelden voor elk rapport dat er iets mee kan. Een rapport dat een filter
  niet gebruikt, zegt dat (bestaand gedrag, bv. Factuurpostvak en het voertuigfilter).
- **Tabbladen blijven.** Operaties wordt **Overzicht**: per tabblad de belangrijkste getallen
  (bv. marge, bezetting, open bekeuringen, APK te laat, facturen ter controle). Een klik op een getal opent
  het rapport zelf (juiste tabblad en rapport geselecteerd). Getallen die de gebruiker niet mag zien, staan er niet.
- **Lijst links, rapport rechts** binnen elk tabblad. Eén rapport tegelijk. Bij elk rapport in de lijst mag
  een klein getal staan als er iets te doen is (bv. "3 open"). De app onthoudt per gebruiker per tabblad het laatst gekozen rapport.
  Op een smal scherm (telefoon) wordt de lijst een keuzemenu bovenaan. *(Mijn keuze.)*
- Het tabblad en rapport staan in de URL (bv. `/reports?tab=financieel&report=fines`) zodat een link of de
  terugknop werkt. *(Mijn keuze.)*
- **Tabellen**: standaard 10 regels per pagina, keuze 25/50; zoekveld; klikbare kolomkoppen om te sorteren.
  CSV bevat altijd alle regels (van het gekozen filter).
- **Samenvoegen** (door Kees goedgekeurd):
  - Voertuigbenutting (Operaties + Voertuigen + "Voertuigbenutting visualisatie") → één rapport op Voertuigen.
  - Kosten per categorie (Operaties) + Kostenoverzicht per categorie + Kostenvisualisatie (Kosten) → één rapport op Kosten;
    Kostentrends naar Kosten.
  - Omzet versus kosten per voertuig (grafiek) + Kosten en opbrengst per voertuig (tabel) → één rapport op Financieel:
    grafiek met top 10, daaronder de tabel met pagina's.
- **Afdrukken** bij elk rapport (vast én bouwer): knop opent een dialoog met een **afdrukvoorbeeld** (A4) en keuzes:
  Tegels, Grafiek, Tabel (Alle regels / Alleen deze pagina), Liggend. Standaard alles aan met alle regels.
  De afdruk heeft: bedrijfsnaam/logo, rapportnaam, periode en filters, tegels met getallen, grafiek, tabel,
  "gedrukt op <datum>" en paginanummers. Het voorbeeld toont wat werkelijk geprint wordt.
- De km-historie in het voertuigscherm krijgt hetzelfde afdrukvoorbeeld.

### Deel 2 — Bouwer-rapporten op tabbladen

- Bij **Rapport opslaan** kies je een tabblad (één van de bestaande tabbladen) of "Niet op een tabblad".
- Het rapport staat dan links in de lijst van dat tabblad (herkenbaar als eigen rapport) en werkt als elk
  rapport: filterbalk, pagina's, zoeken, sorteren, Afdrukken met voorbeeld, CSV, en de grafiek als het gegroepeerd is.
- Hoe de filterbalk op een bouwer-rapport werkt: de periode geldt voor het datumveld dat bij het opslaan is
  gekozen als "periodeveld" (optioneel); het voertuigfilter geldt als de bron een voertuig heeft. *(Mijn keuze.)*
- **Bewerken** opent de bouwer met de opgeslagen instelling; opslaan werkt het rapport op het tabblad bij.
- Zichtbaar voor iedereen die het recht voor de bron heeft (bestaande regel `canUseReportSource`); verwijderen/
  bewerken zoals nu (Rapporten beheren).

### Deel 3 — Gekoppelde velden

- De bouwer kan naast velden van de hoofdbron ook velden tonen van de **gekoppelde auto, klant, reservering en
  bestuurder** (waar de bron zo'n koppeling heeft), en daarop filteren, sorteren en groeperen.
  Voorbeeld: Bekeuringen met kenteken, merk, model van de auto en naam van de klant.
- Rechten: een gekoppeld veld is alleen te kiezen als de gebruiker ook de bron van dat gekoppelde veld mag gebruiken
  (bv. klantnaam alleen met het klantenrecht). Km-velden blijven alleen beheerder.
- Vaste rapporten krijgen een knop **Kolommen**: kolommen verbergen/tonen en extra gekoppelde velden aanzetten.
  De keuze wordt per gebruiker onthouden *(mijn keuze, zoals het dashboard per gebruiker B-60)*, met
  "Terug naar standaard". Tegels en grafieken veranderen niet. Afdruk en CSV volgen de gekozen kolommen.

### Deel 4 — Berekende velden en totaalregel

- **Rekensom**: nieuw veld met naam, formule van velden en getallen met + − × ÷ en haakjes, en soort
  (bedrag / getal / procent). Voorbeelden: Marge = Omzet − Kosten; Bedrag incl. btw = Bedrag × 1,21.
  Delen door nul geeft leeg, geen fout.
- **Als-dan regel**: als <veld> <is gelijk / is niet gelijk / groter dan / kleiner dan / is leeg> <waarde>
  dan <tekst of veld> anders <tekst of veld>.
- Berekende velden zijn te filteren en sorteren, en kunnen in een berekening (Som, Gemiddelde) en groep.
- **Totaalregel** onder de tabel: per kolom Som, Gemiddelde of Aantal; ook op de afdruk en in de CSV.
- Veiligheid: formules worden als gestructureerde boom opgeslagen en server-side gevalideerd en als
  geparametriseerde SQL opgebouwd; nooit tekst in SQL.
- Dit geldt voor bouwer-rapporten (ook die op een tabblad). Vaste rapporten krijgen geen berekende velden.

### Handleiding

- Hoofdstuk 21 helemaal opnieuw in eenvoudig Nederlands, korte zinnen, knopnamen vet zoals in de app.
- Nieuwe afbeeldingen van elk tabblad en elk rapport, het afdrukvoorbeeld, de bouwer (tabblad kiezen,
  gekoppelde velden, berekend veld, totaalregel) en de knop Kolommen, met labels en close-ups zoals versie 1.2,
  via de bestaande pijplijn `scripts/handleiding` (shots-21.mjs) tegen de E2E-omgeving met echte vloot.
- Daarna de in-app handleiding en de PDF bijwerken zoals bij eerdere versies; acceptatiechecklist (22) alleen
  de regels van hoofdstuk 21 bijwerken.

## Volgorde en oplevering

Vier delen, elk afzonderlijk te testen door Kees: 1 scherm + afdrukken + samenvoegen, 2 bouwer-rapporten op
tabbladen, 3 gekoppelde velden + Kolommen, 4 berekende velden + totaalregel; daarna de handleiding.
Per deel een plan, bouw met subagent-controle, volledige testrun, en pas pushen na Kees' akkoord
(werkwijze zoals fases 1-6: eerst alles maken, dan testen, dan pushen — Kees bevestigt per deel of het samen mag).

## Rechten (ongewijzigd, ter herinnering)

- Geld-rapporten: alleen het rapportenrecht. Overige rapporten: rapportenrecht plus het recht van de bron.
- Km-gegevens overal alleen beheerder (ook als gekoppeld veld, Kolommen en berekend veld).
- Tabblad Portaal en Kantoor verborgen zonder hun recht; een tabblad zonder enig zichtbaar rapport verbergen.

## Keuzes van mij na de bouwerscheck (Kees kan ze nog omgooien)

- **Opslag per gebruiker** (laatst gekozen rapport per tabblad, kolomkeuze bij vaste rapporten): de bestaande
  tabel `user_settings` (sleutel + jsonb per gebruiker, ook gebruikt voor het dashboard B-60). Geen migratie.
- **Tabblad van een opgeslagen rapport**: in `saved_reports.configuration` (`tab`, `periodField`); geen nieuwe kolom.
  Zonder `tab` = "Niet op een tabblad": blijft alleen in de lijst **Opgeslagen rapporten** van de rapportbouwer.
  Oude rapporten hebben geen `tab` en werken ongewijzigd.
- **Wie ziet een rapport op een tabblad**: iedereen met het recht voor de bron (Kees koos "Iedereen met recht").
  De oude velden `isPublic`/`sharedWithUsers` worden voor rapporten op een tabblad niet gebruikt.
- **Gekoppelde velden**: alleen "veel-op-één" koppelingen (een bekeuring heeft één auto, een reservering één klant),
  vast vastgelegd per bron in de gedeelde bronconfiguratie. Geen "één-op-veel" (zoals alle reserveringen van een
  klant), zodat regels nooit verdubbelen.
- **Kolommen bij vaste rapporten**: geldt voor de lijsten/tabellen van vaste rapporten. Extra velden alleen van de
  auto (kenteken, merk, model) en de klant (naam) als de regel die koppeling heeft. Afdruk en CSV volgen de keuze.
- **Pagina's, zoeken, sorteren**: in de browser op de opgehaalde regels (vloot ~100 auto's; bestaande servergrenzen
  blijven). "Alleen deze pagina" bij afdrukken volgt de huidige zoekterm en sortering.
- **Formules**: per regel berekend, vóór groeperen; Som/Gemiddelde werken daarna op het berekende veld. Een berekend
  veld mag een eerder berekend veld gebruiken (geen kringen). De totaalregel biedt voor een procentkolom alleen
  Gemiddelde.
- **Overzicht** heeft ook **Afdrukken** (de getallen van het overzicht op één A4).

## Aan de bouwer overgelaten

- Exacte styling binnen het bestaande design system van de app (shadcn/Tailwind), iconen, spacing.
- Welke getallen precies op Overzicht komen (maximaal ~8, de belangrijkste per tabblad) — voorstel tonen aan Kees.
- Hoe de afdruk technisch wordt gemaakt (bestaande `report-table-print` uitbreiden of print-CSS), zolang het
  voorbeeld exact gelijk is aan de afdruk.
- Opslag van kolomkeuze per gebruiker en tabbladkeuze van een opgeslagen rapport (bestaande tabellen/kolommen
  waar mogelijk; nieuwe kolommen additief via schema-columns.json).

## Deel 1b — Details (Kees, 2026-10-25, na het zien van deel 1)

Kees mist detailinformatie in alle rapporten (Voertuigen, Financieel en Kosten, Klanten, Kantoor en Portaal).
Hij koos: doorklikken naar de regels, doorklikken naar het dossier, en vergelijken met een eerdere periode.
Wordt gebouwd vóór Kees deel 1 test; daarna test hij 1 en 1b samen.

### Doorklikken naar de regels
- Klikbaar in elk rapport: elke tegel, elke staaf/punt in een grafiek (maand, dag, top-N), en elke regel van een
  uitsplitsing (per klant, per voertuig, per bestuurder, per categorie, per soort …).
- Een klik opent een venster met de losse regels die dat getal vormen, met pagina's, zoeken, sorteren, **CSV** en
  **Afdrukken** (zelfde afdrukvoorbeeld). Het aantal regels in het venster is gelijk aan het getal waarop je klikte.
- Voor de serverrapporten (kit) geeft de server de regels (bestaande `/rows` en `/export`, uitgebreid met een
  uitsplitsing- of maandfilter). Voor de rapporten die in de browser rekenen, filtert de browser.

### Doorklikken naar het dossier
- In elke lijst zijn kenteken, klant, reservering, bekeuring en factuur klikbaar.
- Een klik opent eerst een **venster met de belangrijkste gegevens** (auto: kenteken, merk/model, APK, km-stand,
  huidige huurder; klant: contactgegevens, aantal reserveringen (open bedragen vervallen, Kees 2026-10-25); reservering: klant, auto, periode,
  status, bedrag; bekeuring: datum, kenteken, bedrag, status, gekoppelde klant/bestuurder; factuur: leverancier,
  datum, bedrag, status). Daarin de knop **Openen in nieuw tabblad**, die het volledige dossier in de app opent;
  het rapport blijft staan.
- Rechten: het venster toont alleen wat de gebruiker in de app ook mag zien; zonder recht geen klikbare link.
  Km-gegevens alleen voor beheerder.

### Vergelijken
- Filterbalk: **Vergelijk met**: **Niet vergelijken** (standaard), **Vorige periode** (even lang, direct ervoor),
  **Zelfde periode vorig jaar**.
- Aan: elke tegel die de periode volgt toont ook het oude getal en het verschil in % met pijl ↑/↓. Groen/rood alleen
  waar duidelijk is wat beter is (meer omzet/marge/bezetting = beter; meer kosten/te laat/bekeuringen = slechter);
  anders neutraal. Bij een oud getal 0 geen percentage maar "nieuw".
- Maandgrafieken tonen de vergelijkingsperiode als lichtere reeks.
- Tegels die geen periode volgen (APK verlopen, "Alles wat nog openstaat", onderhoud vooruit) krijgen geen vergelijking.
- De afdruk toont de vergelijking (oud getal en verschil) en noemt de vergelijkingsperiode in de kop.
- De keuze geldt voor alle rapporten en wordt onthouden zoals de periode (in de filtercontext, niet per gebruiker opgeslagen).
