# Rapporten uitbreiden en km-historie per auto — ontwerp

Datum: 2026-10-24. Opdrachtgever: Kees. Status: ter goedkeuring.

## Waarom

Kees vroeg: "is er nog iets met de rapporten dat we toe kunnen voegen en meer
data krijgen?" Een inventarisatie liet zien dat veel gegevens die de app al
opslaat (bekeuringen, meer-km, brandstof, transporten, portaalaanvragen,
wachtlijst, factuurpostvak, bezorging, schadechecks) in geen enkel rapport
terechtkomen, en dat de rapportbouwer velden aanbiedt die niet bestaan.
Daarnaast wil Kees per auto een km-standhistorie bijhouden en kunnen
afdrukken; die bestaat nu niet: een nieuwe km-stand overschrijft de oude.

Succes: kantoor ziet in Rapporten waar geld blijft liggen (niet-gefactureerd
transport, bekeuringen), hoe de vloot benut wordt, wat klanten opleveren en
kosten, en hoe de kantoorprocessen lopen. Elke auto heeft een volledige,
afdrukbare km-historie.

## Doelen

- 0. De rapportbouwer werkt weer voor alle velden die hij aanbiedt.
- K. Km-historie per auto, bijgehouden vanaf nu en aangevuld uit het verleden.
- 1–3, 5. Geld: bekeuringen, meer-km/brandstof, niet-gefactureerd transport,
  CSV op het tabblad Financieel.
- 6–8. Vloot: bezettings-heatmap, onderhoud/APK vooruit, kilometerstanden.
- 9–11. Klanten en portaal: klantwaarde, portaalaanvragen, wachtlijst.
- 12–14. Kantoor: factuurpostvak, bezorging/ophalen, schadechecks.
- 15. Rapportbouwer: nieuwe bronnen en grafieken.

## Niet-doelen

- Voorstel 4 (wat een verkochte auto netto opleverde) vervalt; Kees: "dat
  hoeft hier niet bij". Er komt geen aankoopprijsveld.
- Km-historie komt **niet** in het klantportaal.
- Geen nieuwe stap "betaald" bij bekeuringen; het rapport volgt de huidige
  stappen.

## Anti-doelen (mislukt, ook als het technisch werkt)

- Een rapport dat bij veel data traag wordt omdat de browser alle rijen laadt.
  Alles wat kan groeien wordt op de server geteld, gefilterd en gepagineerd,
  zoals het e-maillogboek (`server/services/email-log-query.ts`).
- Een medewerker zonder adminrol die de km-historie kan zien, afdrukken of
  downloaden.
- Een getal op een tegel dat niet overeenkomt met de lijst die de tegel opent.
- Bestaande tabbladen die er anders uitzien of anders werken dan nu, behalve
  waar dit document dat noemt (de km-grafiek op Financieel wordt admin-only).

## Wat Kees besliste

| Onderwerp | Besluit |
|---|---|
| Omvang | Alle voorstellen 1–3, 5–15 plus de reparatie van de rapportbouwer en de km-historie |
| Plek | Bij de bestaande tabbladen: geld onder Financieel, vloot onder Voertuigen, klanten onder Klanten; nieuwe tabbladen **Portaal** en **Kantoor** |
| Elk nieuw rapport | CSV-export, afdrukken (bestaande afdrukweergave), grafiek waar zinvol, klikbare tegels die een lijst met details openen |
| Volgorde | Aan de bouwer (zie onder) |
| Bekeuringen | De drie huidige stappen: nieuw / gekoppeld / vervallen |
| Bezetting | Alleen verhuur telt als bezet; werkplaats en vervangend apart getoond |
| Bezorging te laat | Alleen als het niet op de geplande dag is afgerond |
| Km-bronnen | Ophalen en inleveren, schadechecks, handmatige wijziging op kantoor, klant via portaal, onderhoudsbeurt |
| Km-verleden | Eenmalig terughalen uit bestaande gegevens; vanaf nu wordt elke stand bewaard |
| Km-plek | In het voertuigscherm (onderdeel "Km-historie") en in Rapporten > Voertuigen |
| Km-rechten | **Alles alleen admin**: bekijken, afdrukken, CSV, en de km-historie als bron in de rapportbouwer |
| Km-afdruk | Lijst (datum, stand, bron, door wie, km sinds vorige), grafiek, samenvatting (gereden km in de periode, gemiddeld per maand, vergelijking met vrije km), waarschuwingen (teruglopende stand, onlogische sprong) |
| Geld-rechten | Zelfde als het tabblad Financieel nu (`VIEW_REPORTS` of `MANAGE_REPORTS`) |
| Overige rechten | Rapportrecht **plus** het recht van het onderdeel waar de gegevens vandaan komen (bijv. portaal, bekeuringen, kosten/factuurpostvak); zonder dat recht is de tegel/het tabblad niet zichtbaar en weigert de route |
| Bestaande km-grafiek | De grafiek "km per maand" op Financieel (`/api/reports/mileage-per-month`) wordt ook **alleen admin**; "onderhoud vooruit" (7) toont voor niet-admins wel de verwachte datum, maar geen km-standen |
| Oude bekeuringsstatussen | `charged`, `paid`, `disputed` als aparte groep **"oud"**: eigen tegel met lijst, telt mee in het totaalbedrag |
| Klantwaarde | Omzet en huurdagen; kosten door de klant (bekeuringen, schades, meer-km, brandstof); gedrag (te laat ingeleverd, annuleringen, portaalaanvragen); rangorde top 10 beste en top 10 duurste als grafiek |
| Rapportbouwer | Nieuwe bronnen bekeuringen, transporten, onderhoud, schadechecks, km-historie (admin); grafiek (staaf/lijn/taart) bij een gegroepeerd resultaat |

## Onderdelen

### 0. Rapportbouwer repareren

`shared/report-builder-config.ts` biedt velden die `executeReport`
(`server/database-storage.ts`) niet kent: bij reserveringen `reservationType`,
`dailyRate`, `totalAmount`, `paymentStatus`, `paidAmount`; bij kosten
`mileage`; bij bestuurders `isPrimary`. Elk veld wijst naar een bestaande kolom
(`type`, `totalPrice`, `isPrimaryDriver`, …) of verdwijnt. Een test legt vast
dat elk aangeboden veld van elke bron opvraagbaar is, zodat dit niet opnieuw
uit elkaar loopt. Opgeslagen rapporten die een verdwenen veld gebruiken,
krijgen een duidelijke melding in plaats van een fout *(keuze bouwer)*.

### K. Km-historie per auto

- **Opslag**: nieuwe tabel (bijv. `vehicle_mileage_readings`): voertuig,
  datum/tijd, km-stand, bron (`pickup`, `return`, `damage_check`, `manual`,
  `portal`, `service`, `import`), verwijzing naar de bron-rij, wie (gebruiker
  of portaalgebruiker), aangemaakt-op. Toegevoegd via `startup-migration.js`
  (additief; productie krijgt geen `drizzle-kit push`).
- **Vastleggen vanaf nu**: elke plek die een km-stand opslaat schrijft ook een
  regel: ophalen/inleveren van een reservering, schadecheck, handmatige
  wijziging van `currentMileage` op kantoor, km-melding van de klant via het
  portaal, onderhoudsbeurt (`lastServiceMileage`).
- **Terughalen**: eenmalig en herhaalbaar zonder dubbelingen, uit
  reserveringen (`pickupMileage`, `returnMileage`), schadechecks en wijzigingen
  van de km-stand in het activiteitenlog (`audit_logs`). Wat `collectOdometerReadings`
  (`server/utils/financial-reports.ts`) al leest, is het startpunt.
- **Waarschuwingen**: een stand lager dan de vorige, en een onlogische sprong
  (meer km tussen twee standen dan redelijk is voor de tijd ertussen;
  drempel *keuze bouwer*, bijv. meer dan 2.000 km per dag).
- **Tonen**: onderdeel "Km-historie" in het voertuigscherm en een rapport in
  Rapporten > Voertuigen (auto en periode kiezen): lijst, grafiek,
  samenvatting, waarschuwingen; knoppen Afdrukken en CSV.
- **Rechten**: alle routes en knoppen alleen voor admin (`requireAdmin`); voor
  anderen is het onderdeel niet zichtbaar.
- **Rapport 8 (kilometerstanden over de vloot)** leest dezelfde tabel: km per
  auto per maand en een lijst met waarschuwingen; alleen admin. De bestaande
  grafiek "km per maand" op Financieel gaat hierin op of wordt admin-only
  (Kees, 2026-10-24).
- **Teruggedraaid of verwijderd** *(keuze bouwer)*: draait iemand een
  ophaal-/inlevermoment terug of verwijdert hij een reservering of schadecheck,
  dan blijft de regel bestaan maar wordt hij gemarkeerd als vervallen (met
  wie/wanneer). Vervallen regels tellen niet mee in samenvatting en
  waarschuwingen en staan grijs in de lijst. Een vlag in de tabel is daarvoor
  nodig.
- **Portaal** *(keuze bouwer)*: alleen een km-stand die op kantoor is
  overgenomen (handmatig of automatisch) komt in de historie, met bron
  `portal` en de klant als melder; niet-overgenomen meldingen staan al bij de
  portaalaanvraag.
- **Terughalen uit het activiteitenlog** *(keuze bouwer)*: alleen
  logregels met een duidelijke oude en nieuwe km-stand en een tijdstip;
  bron `import` met "uit activiteitenlog". Regels zonder gebruiker heten
  "systeem". Terughalen is idempotent via de verwijzing naar de bronrij.

### 1. Bekeuringen (Financieel)

Aantal en bedrag per stap (nieuw / gekoppeld / vervallen, plus de groep "oud" voor `charged`/`paid`/`disputed`), per maand, per
klant, per voertuig, per bestuurder; gemiddeld aantal dagen van ontvangst
(`receivedAt`) tot koppelen. Bedrag = `totalAmount` (boete +
administratiekosten). Tegels: nieuw, gekoppeld, vervallen, oud, totaalbedrag.

### 2. Meer-km en brandstof (Financieel)

Uit reserveringen: `extraKm`, `extraKmCost`, `fuelCost`, per klant en per
voertuig, per maand. Tegels: totaal meer-km-kosten, totaal brandstof, aantal
reserveringen met meer-km.

### 3. Transport niet gefactureerd (Financieel)

Uit `vehicle_transports`: factureerbaar bedrag en tol, gefactureerd of niet,
per maand en per soort. Tegel "nog niet gefactureerd" opent de lijst.

### 5. CSV op Financieel

De bestaande voertuigfinanciën-tabel krijgt een CSV-knop, via `downloadCsv`
(`client/src/lib/csv.ts`).

### 6. Bezettings-heatmap (Voertuigen)

Per dag (kalenderweergave, weken als rijen) het percentage van de actieve vloot
dat verhuurd is. Werkplaats en vervangend tonen als aparte lijnen of kleuren,
niet als bezet. Klik op een dag opent de lijst van auto's: verhuurd, in de
werkplaats, beschikbaar.

### 7. Onderhoud en APK vooruit (Voertuigen)

Auto's die in de komende 3 maanden (instelbaar) een APK hebben, of een beurt
op basis van `serviceIntervalKm`/`serviceIntervalMonths` en `lastServiceDate`/
`lastServiceMileage`. Bij km-interval: verwachte datum uit het gemiddelde
km per dag (uit de km-historie). Per week gegroepeerd voor de
werkplaatsplanning.

### 9. Klantwaarde (Klanten)

Per klant in de periode: omzet, reserveringen, huurdagen; bekeuringen (aantal,
bedrag), schadechecks met schade, meer-km- en brandstofkosten; te laat
ingeleverd (`actualReturnDate` na `endDate`), annuleringen,
portaalaanvragen. Grafiek: top 10 hoogste omzet en top 10 hoogste kosten.

### 10. Portaalaanvragen (nieuw tabblad Portaal)

Uit `portal_requests`: aantal per soort en status per maand, mediane
reactietijd (`createdAt` → `repliedAt`), afgehandeld per medewerker
(`handledBy`), open aanvragen ouder dan X dagen *(X = 2, keuze bouwer)*.

### 11. Wachtlijst (tabblad Portaal)

Uit `vehicle_waitlist`: aantal aanvragen per maand, per gewenst type,
vervuld / niet vervuld, gemiddelde wachttijd tot vervuld. Laat zien welk type
auto vaak ontbreekt.

### 12. Factuurpostvak (nieuw tabblad Kantoor)

Uit `invoice_inbox_runs` en `invoice_inbox_items`: per maand mails, bijlagen,
automatisch geboekt, ter controle, overgeslagen, mislukt; meest voorkomende
redenen voor controle.

### 13. Bezorging en ophalen (tabblad Kantoor)

Uit `delivery_tasks`: aantal per maand, op tijd versus te laat (**te laat =
niet afgerond op de geplande dag**), km per rit, per medewerker.

### 14. Schadechecks (tabblad Kantoor)

Uit `interactive_damage_checks`: aantal per maand per soort (ophalen/inleveren),
aantal met schade, voertuigen en klanten met de meeste schades.

### 15. Rapportbouwer uitbreiden

Nieuwe bronnen: bekeuringen, transporten, onderhoud (werkplaatsbezoeken),
schadechecks, km-historie (alleen admin). Bij een resultaat met groepering kan
de gebruiker kiezen uit staaf-, lijn- of taartgrafiek. Elke nieuwe bron staat
in de server-whitelist met dezelfde rechtencontrole als nu.

## Gemeenschappelijke regels voor elk nieuw rapport

- Server telt, filtert en pagineert; de browser krijgt alleen wat hij toont.
- Bovenaan tegels met de kerncijfers; elke tegel is een knop die een dialoog
  opent met precies de rijen die de tegel telt (zoals Analyse in
  Communicatie).
- Periodefilter zoals de bestaande filterbalk; datums in de kantoortijdzone.
- CSV via `downloadCsv`; afdrukken via de bestaande afdrukweergave.
- Grafiek met de bestaande grafiekbibliotheek van de rapportpagina.
- Teksten in alle zeven talen (`client/src/locales/*`), pariteitstest groen.
- Elke route met servertest (rechten, filters, cijfers), elk scherm met een
  paginatest.

## Volgorde (keuze bouwer)

1. 0 Rapportbouwer repareren (klein, iets wat nu kapot is)
2. K Km-historie (nieuwe data; 7 en 8 bouwen erop)
3. 1, 2, 3, 5 Geld
4. 6, 7, 8 Vloot
5. 9, 10, 11 Klanten en portaal
6. 12, 13, 14 Kantoor
7. 15 Rapportbouwer uitbreiden

Elke stap wordt apart vastgelegd en kan los naar `main`.

## Aan de bouwer overgelaten

Precieze kolommen en volgorde in tabellen, grafiektype per rapport, de
drempel voor een onlogische km-sprong, standaardperiode (huidig jaar), en de
indeling van de nieuwe tabbladen.
