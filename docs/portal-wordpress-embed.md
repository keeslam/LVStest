# Klantenportaal en lamgroep.nl

Het portaal draait in de beheerapp op `https://portaal.lamgroep.nl/portaal` als
eigen pagina in de huisstijl van de site (kop met woordmerk, tabs, voettekst;
zie `client/src/layouts/PortalLayout.tsx` en `client/src/lib/portal-site.ts`
voor de bedrijfsgegevens, die gelijk moeten blijven aan `lamgroep_info()` in
het thema). De website linkt ernaartoe: de knop "Klantenportaal" in de kop en
de pagina /klantenportaal (thema-sectie `portal`). De portaal-URL staat in het
thema als `lamgroep_info('portal_url')`, lokaal te overschrijven met
`define( 'LAMGROEP_PORTAL_URL', 'http://localhost:5000' )` in wp-config.php.

Insluiten in een iframe blijft mogelijk (het portaal laat dan kop en
voettekst weg en meldt zijn hoogte); de rest van dit document beschrijft dat.

## Vereisten

1. De beheerapp is bereikbaar op een subdomein van de website, bijvoorbeeld
   `https://portaal.lamgroep.nl`. Dit is nodig omdat browsers cookies in een
   iframe van een *ander* domein blokkeren; een subdomein telt als hetzelfde.
2. In de beheerapp, Instellingen > Klantenportaal:
   - Toegestane website-adressen: `https://lamgroep.nl` en `https://www.lamgroep.nl`
     (lokaal ook `http://lamgroep.local`).
   - Basis-URL van het portaal: `https://portaal.lamgroep.nl`.
   - E-mailadres voor meldingen.

## Pagina "Klantenportaal" in WordPress

Plaats dit in een HTML-blok (of in het thema-template van die pagina):

```html
<iframe id="lamgroep-portal" src="https://portaal.lamgroep.nl/portaal"
        style="width:100%;border:0;min-height:600px" title="Klantenportaal"></iframe>
<script>
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://portaal.lamgroep.nl') return;
  if (e.data && e.data.type === 'lamgroep-portal:height') {
    document.getElementById('lamgroep-portal').style.height = e.data.height + 'px';
  }
});
</script>
```

Het portaal stuurt zijn hoogte naar de pagina, zodat er geen tweede scrollbalk
ontstaat. Uitnodigingsmails linken rechtstreeks naar
`https://portaal.lamgroep.nl/portaal/activeren?token=…`; die pagina werkt ook
buiten het iframe.

## Lokaal testen

`scripts/portal-iframe-test.html` is een testpagina die het portaal in een
iframe laadt. Serveer hem op een andere poort (bijvoorbeeld
`npx serve scripts -l 8099`) en voeg `http://localhost:8099` toe aan de
toegestane website-adressen.

## E-mails vanuit het portaal

Naast de uitnodigings- en wachtwoordmails gebruikt het portaal twee sjablonen
(te bewerken onder Communicatie > E-mailsjablonen):

- `portal_fine_linked`: naar de klant zodra een bekeuring aan hem is gekoppeld
  (bedrag en link naar de bekeuring in het portaal). Doorbelasten en betaling
  lopen buiten de app om via het boekhoudprogramma: er is geen status
  "doorbelast"/"betaald" en geen administratiekosten meer; de app toont alleen
  het bedrag van de bekeuring.
- `portal_request_replied`: naar de indiener van een aanvraag zodra Lam Groep
  antwoordt of een verlenging/eerder inleveren goedkeurt.

Beide vereisen werkende SMTP-instellingen onder Instellingen > E-mail; zonder
SMTP wordt de actie wel uitgevoerd maar blijft de mail achterwege (zie serverlog).

## Bekeuringsbrieven scannen (AI)

Staff kan een bekeuringsbrief (PDF, JPG of PNG) laten lezen door dezelfde
Gemini-koppeling als de factuurscanner. Vereist `GEMINI_API_KEY` in `.env`;
zonder sleutel geeft `POST /api/fines/scan` een 502 en blijft handmatige invoer
werken. De scan maakt niets aan: het formulier wordt gevuld, staff controleert
(onzeker gelezen velden krijgen een oranje rand) en slaat op via de gewone
flow, waarna de bekeuring automatisch aan voertuig, reservering en bestuurder
wordt gekoppeld. "Brieven scannen" (dashboard Klantenportaal en de
bekeuringenlijst) verwerkt een hele stapel brieven in een keer; dubbele
kenmerken worden gemarkeerd en standaard overgeslagen.

## CJIB-koppeling (FTPS, alleen ontvangen)

Het CJIB levert beschikkingen als XML- of CSV-bestand op een beveiligde
FTPS-server. Instellen: Instellingen, tab Klantenportaal, kaart
"CJIB-koppeling": host, poort (990 impliciet of 21 expliciet), gebruiker,
wachtwoord, map met nieuwe bestanden, map voor verwerkte bestanden en het
interval. "Verbinding testen" toont de bestanden op de server; "Nu ophalen"
draait een import direct. Zet daarna "Automatisch ophalen" aan.

Elk bestand wordt een keer verwerkt (hash), bewaard onder `uploads/cjib/` en
op de server naar de verwerkt-map verplaatst. Per beschikking ontstaat een
bekeuring (bron CJIB) die automatisch aan voertuig, reservering en bestuurder
wordt gekoppeld; een beschikkingsnummer dat al bestaat wordt als dubbel
geteld. Na elke run krijgt staff een melding op het dashboard Klantenportaal
en per e-mail. De dialoog "CJIB-importen" (bekeuringenlijst) toont het
importlog en laat een bestand handmatig uploaden.

De exacte CJIB-bestandsindeling is nog niet bekend. De parser zoekt velden op
naam-aliassen (`server/services/cjib/parser.ts`, `CJIB_FIELDS`); de
voorbeeldbestanden staan in `server/__tests__/fixtures/cjib/`. Zodra de
specificatie er is, hoeven alleen die aliassen en voorbeelden aangepast te
worden. Vereist na deploy: `npm install`,
`node -r dotenv/config startup-migration.js`, en het CJIB moet het uitgaande
IP-adres van de server toestaan.

## Rechten per klant en per account

Instellingen > Klantenportaal per klant (klantdialoog, tab Portaal) bepalen
wat een klant in het portaal kan: online huren, bestuurders beheren,
aanvragen indienen, eerder inleveren (terugbrengen) aanvragen, bekeuringen,
contracten en prijzen zien. Per account kan staff daar bovenop onderdelen
uitvinken (Accounts > actiemenu > Bewerken en rechten); de klantinstelling
blijft de bovengrens, een account kan nooit meer dan de klant. "Alles weer
toestaan" wist de uitzonderingen. Beperkte accounts staan met "Beperkt" in
de accountslijst. De server controleert dezelfde rechten op elke aanvraag.

## Bestuurders in het portaal

Een klant voegt een bestuurder toe met alleen een naam plus een e-mailadres of
telefoonnummer; de server weigert een bestuurder zonder contactgegeven. In
hetzelfde scherm kan de bestuurder direct op een auto (geboekte of lopende
reservering) gezet worden: typ een kenteken of merk, dan verschijnt de auto.
Rijbewijs, taal en notities staan altijd zichtbaar in eigen blokken en kunnen
leeg blijven. De bestuurderslijst toont per bestuurder de auto's
waar die nu op staat (klik op het kenteken opent de reservering), heeft een
zoekveld (naam, e-mail, telefoon, rijbewijs, kenteken) en een knop "Koppel aan
auto". Vanuit een reservering werkt het andersom: "Bestuurder wijzigen" toont
een zoekbare lijst en een knop "Nieuwe bestuurder" die de nieuwe bestuurder
meteen op die auto zet.
Regel: één bestuurder per auto en één auto per bestuurder. Een bestuurder die
al op een geboekte of lopende auto staat wordt in de keuzelijst grijs getoond
("Rijdt al in …") en de server weigert de koppeling (`PORTAL_DRIVER_BUSY`);
"Koppel aan auto" verschijnt alleen bij bestuurders zonder auto. Een
bestuurder wisselen op een auto maakt de vorige bestuurder weer vrij.

## Voertuigen online en de blacklist

Op de pagina Aanvragen ziet een klant met het recht "online huren" (canBook)
alleen voertuigen die staff online heeft gezet (Klantenportaal > Voertuigen
online) én die nu de status "beschikbaar" hebben; verhuurde of geblokkeerde
auto's komen niet mee. Per auto: omschrijving en, als "prijzen tonen" aanstaat, dag- en maandprijs.
De klant kiest eerst een periode (vanaf, tot en met of open einde); de lijst
toont dan alleen auto's die in die periode in de kalender vrij zijn
(`GET /api/portal/vehicles?start=&end=`, één overlapquery via
`portalStorage.listBusyVehicleIds`). "Aanvragen" opent een huuraanvraag (type
`booking`: voertuig, periode, ophaal- en inlevertijd, optioneel een
bestuurder uit de eigen lijst; een bestuurder-account vraagt automatisch voor
zichzelf). De server weigert een aanvraag voor een auto die in die periode bezet
is (`PORTAL_VEHICLE_UNAVAILABLE`) en een tweede open aanvraag voor dezelfde
auto en periode (`PORTAL_DUPLICATE_REQUEST`). Een aanvraag met status
"ingediend" kan de klant zelf intrekken (`DELETE /api/portal/requests/:id`).

Staff keurt een huuraanvraag goed in de aanvraagdialoog via "Goedkeuren:
reservering aanmaken". Dat paneel toont periode, tijden, de gevraagde auto (met
vrij/bezet/blacklist) en suggesties van hetzelfde type die vrij zijn
(`GET /api/portal-requests/:id/alternatives`); alles is nog aan te passen.
`POST /api/portal-requests/:id/approve` maakt dan een reservering met status
booked (klant, auto, periode, tijden, bestuurder, notitie "Via klantenportaal"),
na controle op blacklist, kalenderconflicten (`checkReservationConflicts`) en
de regel één auto per bestuurder. De aanvraag krijgt het reserveringsnummer,
gaat op "afgehandeld" met een bevestiging aan de klant, en de reservering staat
direct in de kalender en bij de klant onder "Aankomend". Op het dashboard
markeert "Aandacht nodig" huuraanvragen die binnen 3 dagen starten of langer
dan 2 dagen open staan.

De blacklist (tabel `vehicle_customer_blacklist`, dezelfde als in de klant-
en voertuigdialoog) wordt op de server toegepast: `GET /api/portal/vehicles`
laat geblokkeerde voertuigen weg en `POST /api/portal/requests` weigert een
huuraanvraag voor een geblokkeerd, niet-online of niet-beschikbaar voertuig
(`PORTAL_VEHICLE_BLOCKED` / 404 / `PORTAL_VEHICLE_UNAVAILABLE`), wat de client ook stuurt. Beheer voor het
portaal: Klantenportaal > Blacklist (tegel op het dashboard, knop in de
werkbalk, kolom "Geblokkeerd" bij Voertuigen online): zoeken, blokkade
toevoegen (voertuig + klant + reden) en opheffen. Routes:
`GET/POST /api/portal-admin/blacklist`, `DELETE /api/portal-admin/blacklist/:id`.

## Mijn account in het portaal

- **Taal**: het portaal volgt de voorkeurstaal van de klant (customers.preferred_language). Een account kan bij Mijn account een eigen taal kiezen (`portal_users.language`, leeg = klantinstelling).
- **E-mailadres wijzigen**: klant vult nieuw adres + huidig wachtwoord in; het nieuwe adres krijgt een mail (sjabloon `portal_email_change`) met een link naar `/portaal/email-bevestigen?token=…` (72 uur geldig, alleen de hash staat in `portal_users.email_change_token_hash`). Pas na bevestiging (`POST /api/portal/email/confirm`) verandert de inlognaam; tot die tijd staat het adres als `pending_email` en kan het worden ingetrokken. Een adres dat al bij een ander account hoort wordt geweigerd.
- **E-mailadressen van het bedrijf**: beheerdersaccounts kunnen het primaire, APK-, factuur- en algemene e-mailadres van de klant bijwerken (`PATCH /api/portal/me/company`); staff krijgt daarvan een melding en het staat in de activiteit.

## Meldingen, gesprekken en overige klantfuncties (2026-09-06)

- **Belletje in het portaal** (`portal_notifications`): antwoorden en beslissingen op aanvragen, nieuwe berichten van staff, gekoppelde bekeuringen, en dagelijks om 04:00 (`PortalAlertScheduler`) waarschuwingen voor voertuigen die de klant in gebruik heeft: APK die binnen 30 dagen verloopt of verlopen is, en onderhoud dat (bijna) nodig is (zelfde berekening als het staff-onderhoudsschema). Eén melding per voertuig per onderwerp per maand.
- **Gesprek per aanvraag** (`portal_request_messages`): klant en staff kunnen berichten toevoegen zolang de aanvraag open is; een staff-antwoord via "Beantwoorden" wordt ook als bericht vastgelegd. Staff: `POST /api/portal-requests/:id/messages`; klant: `POST /api/portal/requests/:id/messages`.
- **Gezien en akkoord** op een contract (`portal_document_acks`): één keer, met naam, tijdstip en IP; staff krijgt een melding en het staat in de activiteit.
- **Nieuw apparaat**: bij inloggen vanaf een browser die het account nog niet kent (cookie `portal_device`, lijst in `portal_users.known_devices`) gaat het mailsjabloon `portal_new_device` naar het account; niet bij de allereerste login. Sessies verlopen na 1 uur zonder activiteit.
- **Aanvraagtypes** `maintenance` (onderhoud/storing: melding, kilometerstand, dringend) en `mileage` (kilometerstand doorgeven), beide vanuit een lopende reservering.
- **Ophaalinformatie** (adres, openingstijden, wat meenemen) en de **privacylink** staan in Instellingen > Klantenportaal en worden getoond bij geboekte reserveringen respectievelijk in de voettekst en op het inlogscherm.
- **AVG**: bestuurdersaccounts zien alleen hun eigen reserveringen, bekeuringen, contracten en aanvragen; rijbewijsnummers staan gemaskeerd op de bestuurderskaart (volledig in het bewerkscherm); openen van een rijbewijsbestand en het lezen van gegevens gaat via de sessie van een beheerdersaccount van de klant zelf. Bedrijfs-e-mailadressen die de klant wijzigt staan met naam en datum op de klantkaart.
- **Exports**: CSV-knoppen bij Bekeuringen (staff, volledige weergave) en bij de huurhistorie op de klantkaart.
