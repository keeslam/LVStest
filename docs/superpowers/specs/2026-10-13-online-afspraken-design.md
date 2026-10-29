# Online afspraken van de garageplanner in de onderhoudsplanner

Datum: 2026-10-13. Status: akkoord Kees 2026-10-29.

## Besluiten (Kees, 2026-10-29)

- Bouwen zoals ontworpen, inclusief de melding aan de klant in het portaal (alleen als de klant een portaalaccount heeft).
- De afzenders van de planner zijn een instelbare lijst `appointmentSenders` in de instellingen van het factuurpostvak
  (Instellingen, tabblad E-mail). Leeg = de functie staat uit. Standaard leeg; `noreply@garage.software` staat als
  voorbeeld in het veld.

Uitwerking bij de bouw op main (2026-10-29):

- Herkenning: afzender op `appointmentSenders` (envelop en From-kop), onderwerp "Afspraak Aanvraag", en dezelfde
  `Authentication-Results`-regel als bij facturen. Andere mail van de planner (bijvoorbeeld een bevestiging) gaat
  gewoon door de factuurflow.
- De map is vast: **online afspraken**.
- Categorie: alleen als alle werkzaamheden APK zijn is het `scheduled_maintenance` (soort `apk_inspection`),
  anders `repair` (soort `other`).
- Koppelen met de hand kan alleen aan een huur die op de afspraakdag loopt; weekend en verleden worden geweigerd.
- Tabel `online_appointments` wordt in productie aangemaakt door `startup-migration.js` (createTableIfNotExists,
  met foreign keys) en staat in `schema-columns.json`. Alleen toevoegen, nooit wijzigen.
- Auditlog: `online-appointment.confirm|cancel|link|dismiss` (via de activiteitenmiddleware) en
  `system.online-appointment-import` per verwerkte mail.
- Klantmelding in het portaal: type `online_appointment` met params `date`, `time`, `work`. Het portaal toont de
  Nederlandse tekst zolang `portal.json` geen `notifications.kinds.online_appointment` heeft.

## Aanleiding

Klanten kunnen in het klantenportaal een afspraak maken in de online agenda van de garage (Garagesoftware,
`planner.garage.software`). Die agenda is een externe pagina: de app kan er niets in lezen en hun API is dicht. Een
afspraak die daar wordt gemaakt staat dus alleen in de planner van de garage en niet in de onderhoudsplanner van de app.
De receptioniste bedient beide en stuurt de klant zelf een bevestiging. Zonder koppeling wordt er dubbel gepland en
dubbel gecommuniceerd.

## Wat er al is

- De planner stuurt per afspraak één mail "Afspraak Aanvraag" naar de klant, en die komt ook binnen in het postvak
  `faktapp@keeslam.nl` (Postvak IN). Voorbeeld: `afspraakvoorbeeld`, echte mail van 13-10-2026. Velden: aanhef met titel en
  naam, merk, model, kenteken (met streepjes, `XX-LL-20`), tellerstand, afspraakdatum (`30-10-2026`), aflevertijd
  (`08:00`), werkzaamheden (een of meer regels), vervangend vervoer (naam, bijvoorbeeld `Leenauto`), afzendernaam.
  Er staat geen afspraaknummer, e-mailadres of klantnummer in.
- De factuurinbox (`server/services/invoice-inbox/`) leest hetzelfde soort postvak al uit: IMAP-verbinding, poller,
  runlog, "Te controleren"-lijst, melding aan kantoor.
- Een onderhoudsregel is een reservering van het type `maintenance_block` (`storage.createMaintenanceBlock`), gekoppeld
  aan de auto, de klant en de verhuring (`affectedRentalId`); vervangend vervoer is een placeholder-reservering
  (`ensurePlaceholderSpare`, in de app "TBD vervangend vervoer").

## Ontwerp

### 1. Eén postvak, één poller

Het postvak van de factuurinbox is mogelijk hetzelfde als dat van de afsprakenmails (`faktapp@keeslam.nl`). Twee pollers op
één Postvak IN zouden elkaars mails opeten: de factuurpoller zou een afspraakmail als "overige mail" wegzetten. Daarom
krijgt de bestaande poller een stap vooraf: elke ongelezen mail wordt eerst gecontroleerd op "is dit een afspraakmail van
de planner". Zo ja, dan verwerkt de afsprakenmodule hem en verplaatst de mail naar de map **online afspraken**; zo nee,
dan gaat hij ongewijzigd door de factuurflow. Eén verbinding, één schema, geen race.

Herkenning: afzender op de lijst van toegestane planner-afzenders (nieuw veld `appointmentSenders` in de inboxinstellingen,
leeg = functie uit) én het onderwerp en de kop "Afspraak Aanvraag" met de herkenbare velden (kenteken, afspraakdatum,
aflevertijd). Dezelfde controle op `Authentication-Results` als bij de facturen, zodat een vervalste mail niets aanmaakt.

### 2. Uitlezen

Een parser haalt uit de tekst: kenteken (genormaliseerd), merk, model, tellerstand, datum (`dd-MM-yyyy` naar ISO), tijd,
werkzaamheden (lijst), vervangend vervoer (tekst), klantnaam. Alles wat de parser niet met zekerheid vindt (ontbrekende
datum of kenteken, onleesbaar formaat) maakt een regel **Te controleren** zonder iets in de planner te zetten.

### 3. Opslag: tabel `online_appointments`

Eén rij per mail: `message_id` (uniek), ontvangen op, kenteken, merk, model, tellerstand, datum, tijd, werkzaamheden,
vervangend vervoer, klantnaam, `status` (`pending` | `confirmed` | `cancelled` | `review`), koppelingen
(`vehicle_id`, `customer_id`, `rental_id`, `block_id`), wie en wanneer bevestigd. Een tweede mail met hetzelfde kenteken, dezelfde
datum en dezelfde tijd binnen 24 uur wordt als dubbel herkend en niet nog eens aangemaakt (de planner stuurt geen
afspraaknummer). Nieuwe tabel: komt via `schema-columns.json` additief mee bij de deploy.

### 4. Koppelen en aanmaken

Het kenteken levert de auto; de lopende of geplande verhuring van de klant (`booked` of `picked_up`) die de afspraakdatum
overlapt, levert klant en verhuring. Lukt dat niet (auto onbekend, geen passende verhuring), dan status `review`.
Gelukt: er wordt meteen een onderhoudsregel aangemaakt op de afspraakdatum (weekdag; valt het in het weekend, dan
`review`), met als notitie de werkzaamheden en "Online agenda". Categorie: alleen APK is `scheduled_maintenance`,
al het andere `repair`. Staat er vervangend vervoer in de mail (alles behalve leeg, "geen" of "nee"), dan komt er een
placeholder voor TBD vervangend vervoer, hetzelfde als bij een melding via het portaal. De regel krijgt de herkomst
"online agenda" en de status `pending` ("te bevestigen"), zodat de auto direct geblokkeerd staat voor andere planning.

### 5. Bevestigen in de onderhoudskalender

Op de onderhoudskalender staat een knop **Online afspraken (n)** met het aantal te bevestigen afspraken. Die opent een
venster met de lijst: datum en tijd, klant, auto, werkzaamheden, vervangend vervoer. Per afspraak:

- **Bevestigd in de planner:** de afspraak is bevestigd, de regel verliest het label "te bevestigen".
- **Annuleren:** de onderhoudsregel en de placeholder voor vervangend vervoer worden geannuleerd.
- Een regel met `review` heeft **Koppelen aan reservering** (kies auto en verhuring) en **Negeren**.

Alle acties komen in het auditlog. Op de kalender zelf staan afspraken met `pending` herkenbaar (andere kleur of rand).

### 6. Klant en kantoor

- Klant: een melding in het portaal ("Afspraak aangevraagd op 30-10-2026 om 08:00 voor APK"), alleen als de klant een
  portaalaccount heeft. Geen e-mail van ons: de receptioniste bevestigt zelf.
- Kantoor: een melding "Online afspraak binnengekomen", en een regel in het logboek van het postvak (tabblad
  "Online afspraken", naast Facturen en Overige mail).

### 7. Veiligheid en grenzen

- Een mail maakt alleen iets aan na de afzender- en authenticatiecontrole; tekst uit de mail wordt nooit als HTML getoond.
- Een afspraak voor een andere klant dan die van de verhuring is niet mogelijk: de klant komt altijd uit de verhuring.
- Wijziging of annulering door de klant in de planner zelf: de planner stuurt daar (voor zover bekend) geen mail
  voor. Dat wordt niet gesynchroniseerd; kantoor annuleert dan zelf in het venster.
- Niet in dit ontwerp: de bevestigingspagina van de planner lezen (kan niet, andere herkomst), tellerstand uit de mail overnemen.

## Testen

Server (met een nepmailclient, zoals bij de factuurinbox): echte voorbeeldmail wordt een regel met juiste velden; APK is
`scheduled_maintenance`, overig `repair`; vervangend vervoer geeft een placeholder, leeg of "geen" niet; onbekend kenteken,
weekend of ontbrekende datum geeft `review`; dubbele mail geeft één regel; verkeerde afzender of mislukte
authenticatie wordt overgeslagen en gaat door de factuurflow; een gewone factuurmail blijft ongewijzigd; verplaatsen naar
de map "online afspraken". Client: venster met aantal, bevestigen, annuleren, koppelen.

## Open punten

1. Het adres waarvan de afspraakmail komt (en of die `Authentication-Results` van onze mailserver draagt).
2. Wat in de planner "geen vervangend vervoer" heet; tot dan telt leeg, "geen" en "nee" als geen.
3. Of de factuurinbox en dit postvak echt hetzelfde account zijn (zo ja, geldt punt 1 van het ontwerp; zo nee, een
   tweede, losse verbinding met dezelfde code).
