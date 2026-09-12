
### 7.2 Wachtend op een eigenaarsbesluit dat nooit gesteld is

Deze reproduceren nog precies zoals beschreven, maar het plan verbiedt ze te repareren zonder
besluit, en in `besluiten.md` staat geen B-nummer dat ze dekt. Ze zijn niet gemist — ze zijn
**niet gevraagd**.

| Bug | Zwaarte | De vraag die beantwoord moet worden |
|---|---|---|
| BUG-024 | MEDIUM | Mag een nieuw wachtwoord gelijk zijn aan het oude? Nu wel, en er is geen wachtwoordhistorie. |
| BUG-040 | MEDIUM | Mag een reservering in het verleden worden aangemaakt? Nu wel — en die blokkeert daarna elke toekomstige boeking op dat voertuig. |
| BUG-045 | MEDIUM | Moet een debiteurnummer uniek zijn? Nu niet, en er komt geen waarschuwing. |
| BUG-056 | LOW | Wat moet een terugkerende reservering doen? De velden zijn vrij te zetten, er ontstaan geen kindrijen. |
| BUG-132 | MEDIUM | Mag een opgehaalde verhuring geannuleerd of verwijderd worden, en door wie? Nu allebei, zonder drempel. |
| BUG-163 | HIGH | Mag contractgeneratie hard falen in plaats van een onbruikbaar bestand leveren? De noodoplossing is weg en een onbekend sjabloon geeft 404, maar de OPT-014-vraag is onbeantwoord; B-05 gaat alleen over verouderde documenten. |
| BUG-167 | HIGH | Welke permissie mag een contract genereren en de klantgegevens erin zien? Zie hieronder. |
| BUG-170 | HIGH | Wie krijgt een voertuigherinnering? Zie hieronder. |
| BUG-081 | MEDIUM | Dezelfde OPT-027-vraag over ontvangers; in de tabel als NOT APPLICABLE geteld omdat het plan hem uitstelt. |

Twee daarvan verdienen een eigen zin, omdat het wachten op een besluit hier een open deur laat staan:

**BUG-167.** Een account met uitsluitend `view_vehicles` krijgt **200** op `contracts/generate`,
`generate-default`, `generate-versioned` én `contracts/data` — dat laatste met adres, telefoonnummer
en rijbewijsnummer van de klant — en schrijft daarbij gewoon `documents`-rijen weg. Alleen de
schadecheckroutes geven inmiddels 403. Zolang de permissievraag onbeslist is, staat inzage in
klantgegevens open voor de laagste rol die er is.

**BUG-170.** Eén APK-herinnering voor één voertuig leverde **drie** verzonden mails op: de huidige
houder, iemand die het voertuig in 2021 huurde, en iemand van wie de huur pas in juli 2027 begint.
`server/routes/notifications.ts:130-143` koppelt voertuig aan reservering aan klant zonder filter op
status of datum en zonder ontdubbeling.

### 7.3 Half gerepareerd — de bug is kleiner geworden, niet weg

Voor elk hiervan slaagt een deel van de gedocumenteerde regressietest en een ander deel niet; de
exacte bewijsregel staat in de tabel van §3.

BUG-054 (tekst als prijs wordt stil `NULL`) · BUG-055 (documenten overleven het verwijderen van hun
reservering) · BUG-096 (een anoniem verzoek maakt nog steeds een sessierij) · BUG-119
(`contracts/data` geeft nog een verzonnen contractnummer voor een placeholder en voor een
onderhoudsblok) · BUG-125 (een barcode mag het kenteken van een ánder voertuig zijn) · BUG-127 (de
kilometerstand van het voertuig loopt niet mee met een correctie) · BUG-148 (twee van de vier
foutmeldingen nog generiek) · BUG-149 (laatste servicebeurt mag in de toekomst en boven de
tellerstand liggen) · BUG-150 (geen definitief legen van de prullenbak; uploads nog op kenteken
gesleuteld) · BUG-153 (huurdagen verschillen tussen contract en financieel rapport) · BUG-157
(contractnummer met en zonder voorloopnul naast elkaar) · BUG-172 (bij twee tabbladen wint de
laatste opslag stil) · BUG-179 (achtergrond van een ánder sjabloon is selecteerbaar; een verwijderde
achtergrond blijft aangewezen) · BUG-181 (zonder standaardsjabloon wordt gewoon de eerste rij
gebruikt) · BUG-183 (een open reservering krijgt een verzonnen periode van zeven dagen) · BUG-185
(twee gelijktijdige verzendingen sturen alles dubbel) · BUG-194 (lege naam, `fields:null` en
negatieve labelmaten worden nog geaccepteerd; drie routes geven nog 500) · BUG-209 en BUG-219
(`download-files` en `download-code` geven nog 500 door `tar` zonder `--force-local`) · BUG-210 (het
reserveringenscherm scrolt horizontaal op tabletbreedte) · BUG-212 (geen verbindingsindicator, vijf
rapportcomponenten zonder foutafhandeling) · BUG-228 en BUG-230 (telkens één van de genoemde plekken
nog ongewijzigd) · BUG-205 (lijsten zonder paginering, volledige voertuig- en klantrij nog ingebed —
formeel een eigenaarsbeslissing).

### 7.4 Bestaande gegevens die niet opgeschoond mogen worden

Het plan verbiedt in §1.2.3 elke wijziging aan bestaande gegevens. Voor deze twee is het **codepad**
beoordeeld en de **gegevensvoorraad** geteld.

| Bug | Codepad voor nieuwe rijen | Nog aanwezige oude rijen |
|---|---|---|
| **BUG-143** | **Dicht** — een reservering of onderhoudsblok op een niet-bestaand voertuig geeft 404 "Vehicle not found" | **258 weesrijen**, alle van het type `maintenance_block`; nog steeds geen foreign key op `reservations.vehicle_id` |
| **BUG-144** | **Niet dicht** — een statuswijziging naar `picked_up` geeft 200 op een verhuring die pas op 2026-11-11 begint, met lege ophaaldatum en lege ophaalkilometerstand | 363 rijen `picked_up` met een einddatum in het verleden · 123 `picked_up` met een startdatum in de toekomst · 340 blijvende `booked` |

BUG-143 is daarmee nog alleen een opschoningsvraag; **BUG-144 is ook nu nog een codegat.**

### 7.5 Terecht niet gerepareerd

BUG-057 (stacktrace in ontwikkelmodus — bewust aan `NODE_ENV` gebonden; commit `4828c2d1` voegde er
een luide startwaarschuwing aan toe) · BUG-076 en BUG-097 (door het plan weerlegd; de verharding is
er wél — de zwarte lijst is vervangen door een `isPlainFilename()`-toets en geen van de twaalf
traversalladingen leverde bestandsinhoud op) · BUG-081 en BUG-082 (door het plan uitgesteld).

Let op bij **BUG-082**: die reproduceert nog exact. Een verzonnen `X-Forwarded-For` komt letterlijk
in `active_sessions.ip_address` én in `audit_logs.ip_address` terecht, terwijl de echte tegenpartij
127.0.0.1 is. Het IP-adres in het auditspoor is dus door de client te verzinnen — dat is precies de
kolom waarnaar gekeken wordt als er ooit weer iets verdwijnt.

### 7.6 Twee randgevallen waar dit rapport zelf een keuze heeft gemaakt

**BUG-030 en BUG-049 staan op FIXED.** De inhoudelijke fout (een 500 werd een 400) is verholpen.
Hun regressietest eist letterlijk "geen `stack`-veld, ongeacht `NODE_ENV`", en in ontwikkelmodus zit
die stacktrace er nog. Dat is hetzelfde gedrag dat het plan bij BUG-057 als omgevingskwestie heeft
geclassificeerd, dus het is hier consequent zo behandeld. Wie de regressietest letterlijk leest, mag
ze NOT FIXED noemen; aan wat de code doet verandert dat niets.

**BUG-034 staat op CHANGED BY DECISION (B-09)**, met twee kanttekeningen voor de eigenaar van
OPT-006: het omzetten naar `needs_fixing` gebeurt niet meteen maar via de statussynchronisatie
(waargenomen na ongeveer 23 seconden) en draait niet terug als het blok wordt verwijderd; en een
onderhoudsblok in de **toekomst** haalt het voertuig niet uit `GET /api/vehicles/available` voor die
periode — wat wringt met B-01.
