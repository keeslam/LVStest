# Fiscale mobiliteitscheck: audit en implementatievoorstel (STOP POINT 1)

Datum 16 september 2026. Branch `fix/audit-remediation` (gelijk aan `main`, in productie).
Dit document is het voorstel waarop goedkeuring nodig is voordat er substantieel wordt gebouwd.
Het wettelijk kader staat apart in [01-wettelijk-kader.md](01-wettelijk-kader.md); de volledige
inventaris van variabelen in [02-variabelen.md](02-variabelen.md).

Leesvolgorde voor een snelle beoordeling: hoofdstuk 3 (wat de app al kan en mist), hoofdstuk 4
(het ontwerp in één plaat), hoofdstuk 12 (risico's) en hoofdstuk 14 (de vragen waarop een
antwoord nodig is).

---

## 1. Doel

Een centrale, versiebeheerde en controleerbare fiscale-regelvoorziening in de bestaande applicatie,
met als eerste regel de **pseudo-eindheffing fossiele personenauto's** (artikel 32bc Wet LB 1964,
per 1 januari 2027). De applicatie helpt de klant (de werkgever) bepalen of en over welke maanden de
heffing waarschijnlijk speelt voor de auto's die Lam levert, legt elke uitkomst reproduceerbaar vast,
en laat een bevoegde medewerker de officiële parameters beheren zonder codewijziging.

Wat het niet is: een aangifte-instrument of fiscaal advies. Elke uitkomst draagt de regelversie, de
gebruikte parameters en de gegevenskwaliteit, en zegt expliciet wanneer handmatige beoordeling nodig is.

---

## 2. Samenvatting van de audit

De applicatie heeft de bouwstenen die dit onderdeel nodig heeft, maar kent de fiscaal doorslaggevende
feiten niet:

| Nodig voor de check | Aanwezig | Ontbreekt |
|---|---|---|
| Wie stelt welke auto wanneer ter beschikking aan wie | Reserveringen (auto, klant, bestuurder, periode), bestuurderswisselingen per reservering, vervangingsreserveringen gekoppeld aan onderhoudsblokken, placeholders voor nog onbekende vervangers | Gebruikstype (zakelijk, woon-werk, privé), poolstatus, reden van vervanging van de *eigen* auto van de klant, "al vóór 2027 ter beschikking gesteld" |
| Voertuiggegevens | Kenteken, merk, model, brandstof (vertaald naar Engels), datum eerste toelating (in `production_date`), voertuigsoort (vertaald naar "Sedan"/"Van") | Catalogusprijs, CO₂-uitstoot, Europese voertuigcategorie (M1/N1), leeftijd, herkomst en ophaaldatum van RDW-gegevens |
| RDW-koppeling | Eén dataset (`m9d7-ebf2`), zonder cache, zonder tijdstempel | Brandstofdataset (`8ys7-d773`) met CO₂, veld `catalogusprijs`, `europese_voertuigcategorie`, bronregistratie |
| Rechten, audit, instellingen | Rechtenmodel per gebruiker (24 rechten, adminbypass), auditlog (alleen-lezen routes), key-value instellingen met zod-patroon, klantportaal met klant- én accountniveau-schakelaars | Versiebeheer van instellingen, goedkeuringsworkflow, gestructureerde parameterhistorie |
| Uitvoer | Centrale PDF-generator (pdf-lib, sjablonen, documentregister met versies), rapportenpagina, meldingen (intern, portaal, e-mail), nachtelijke taken (node-cron) | Rapporttype "fiscaal", exportformaat CSV/PDF vanuit rapporten |
| Tests, migratie | 1085 tests, permissiematrix-test die elke route controleert, portaaltests voor tenantisolatie, additieve manifestmigratie | Niets structureels; wel: manifestmigratie maakt geen indexen of foreign keys aan (die horen in een expliciete stap) |

Conclusie: bouwen op wat er is, met vijf nieuwe tabellen voor regels/parameters/beoordelingen en twee
nieuwe tabellen voor voertuig- en gebruiksfeiten, allemaal additief.

---

## 3. Bestaande architectuur (feiten uit de audit)

Alle paden relatief aan de projectmap. Regelnummers zijn van 16 september 2026.

### 3.1 Datamodel

- Eén schema: `shared/schema.ts` (2369 regels, 47 tabellen, **geen `pgEnum`**; elke "enum" is een
  `text`-kolom met een TS-constante en een runtime-allowlist).
- `vehicles` (`shared/schema.ts:198-310`): `fuel` (Engelse waarden, `:205`), `vehicle_type` (RDW
  "Personenauto" wordt "Sedan", `server/utils/rdw-api.ts:54`), `production_date` (in werkelijkheid
  RDW `datum_eerste_toelating`, `rdw-api.ts:194`), `apk_date`, prijzen `monthly_price`/`daily_price`
  (`numeric`). Geen catalogusprijs, CO₂, voertuigcategorie of bronstempel; zoekopdracht door de hele
  code bevestigt dat.
- `customers` (`:436-506`) is het huurder-/tenantbegrip (`portal_customer_settings.customer_id` uniek,
  `drivers.customer_id` verplicht). `customer_type` `business|individual` (`:479`), KvK `:463`, btw `:465`.
- `drivers` (`:530-565`): per klant, geen directe koppeling aan voertuigen.
- `reservations` (`:859-956`): `vehicle_id` nullable (placeholder), `customer_id`, `driver_id`,
  `start_date`/`end_date` als tekst `yyyy-MM-dd` (`end_date` leeg = open einde), `type`
  `standard|replacement|maintenance_block` (`:880`), `replacement_for_reservation_id`,
  `replacement_for_transport_id`, `placeholder_spare`, `maintenance_block_id` (`:896`),
  `maintenance_category` `scheduled_maintenance|repair` (`:902`), `deleted_at` (prullenbak).
- Bestuurdershistorie per reservering: `reservation_driver_assignments` (`:669-681`), geschreven door
  `server/services/driver-assignments.ts:21-40`. Dit is de enige "wie reed wanneer"-administratie.
- Transporten (`:1827-1897`): `spare_required` + `related_vehicle_id` leeg = vervanger nog onbekend
  ("TBD"), afgeleid in `shared/transport-spare-status.ts:15`. Reserveringskant: `placeholder_spare`.
- Onderhoud is een reservering van type `maintenance_block`; er is geen aparte onderhoudstabel.
- Datumconventies: bedrijfsdatums als tekst `yyyy-MM-dd`, tijdstempels als `timestamptz` (B-22 nog
  niet toegepast in productie, `startup-migration.js:418-465`). Kantoordatum via `officeDate()`
  (`server/services/lifecycle.ts:421-444`).

### 3.2 RDW

- Eén client: `server/utils/rdw-api.ts:140` op `opendata.rdw.nl/resource/m9d7-ebf2.json`, 5 s timeout,
  velden `merk, handelsbenaming, voertuigsoort, chassis, brandstof_omschrijving,
  emissiecode_omschrijving, vervaldatum_apk, datum_eerste_toelating, datum_tenaamstelling,
  wacht_op_keuren` (`:185-200`). `catalogusprijs`, `europese_voertuigcategorie` en CO₂ worden niet
  opgevraagd; de brandstofdataset niet aangeroepen.
- Geen cache, geen bronstempel. Nachtelijke APK-scan `server/utils/rdw-apk-scanner.ts:26` (02:30),
  schrijft naar `apk_date_changes` tot bevestiging. Het enige "lange taak"-patroon: fire-and-forget +
  statusobject + pollen (`server/routes/apk-date-changes.ts:19-126`).

### 3.3 Rechten, instellingen, audit

- `UserPermission` (`shared/schema.ts:76-145`, 24 waarden), opgeslagen als `users.permissions jsonb`.
  Middleware `hasPermission(...)` (`server/middleware/permissions.ts:6-34`): 401 zonder gebruiker,
  **admin passeert altijd** (`:17-19`), anders OF-logica. Uitzondering: `authorize_mileage_decrease`
  wordt strikt gecontroleerd. De test `server/__tests__/fix-i-permission-matrix.test.ts` controleert
  dat elke route een `hasPermissionMiddleware` draagt.
- Labels voor het vinkjesscherm: `shared/permission-labels.ts:13-52` (B-23-patroon; een nieuw recht
  zonder label toont de sleutel, nooit een leeg vinkje). Vinkjes in
  `client/src/components/dialogs/users-dialog.tsx:697-735`.
- Instellingen: `app_settings` key/value met jsonb (`shared/schema.ts:1604-1615`) en het patroon
  `server/services/portal-config.ts` (zod-schema, 60 s cache, `get`/`save`). Geen versiebeheer, geen
  historie.
- Auditlog: `audit_logs` (`shared/schema.ts:2174-2187`), geschreven door
  `server/utils/security/auditLogger.ts:62-106`; `auditMutations` (`server/middleware/audit.ts:186-252`)
  legt elke mutatie op `/api` met before/after-diff vast. Alleen-lezen routes in
  `server/routes/users.ts:17-105`. Bekend gebrek BUG-082: `getClientIp()` (`auditLogger.ts:111-117`)
  vertrouwt het eerste `X-Forwarded-For`-adres.

### 3.4 Klantportaal

- Eigen inlogrealm (`server/portal-auth.ts`, cookie `portal.sid`, eigen CSRF). Tenantisolatie: de
  klant komt altijd uit de sessie (`loadContext` `:111-117`), bestuurdersaccounts krijgen een
  `scope { driverId }`, alle leesfuncties in `server/services/portal-storage.ts` nemen `customerId` +
  `scope` als verplichte argumenten (`driverScopeCondition` `:49`, `reservationBase` `:63`).
- Schakelaars per klant: `portal_customer_settings` (`shared/schema.ts:641-656`: `portal_enabled,
  can_book, can_manage_drivers, can_submit_requests, can_view_fines, can_view_contracts, show_prices,
  can_return`), per account beperkbaar via `PORTAL_FEATURE_KEYS` (`shared/portal-types.ts:43`), met
  de regel "klantinstelling is het plafond" (`portal-auth.ts:50-60`) en routewacht `requireFeature`
  (`:143`). Beheer in `client/src/components/portal-admin/customer-portal-settings-form.tsx`.
- Rollen: `admin` (hele klant) en `driver` (alleen eigen reserveringen, documenten, bekeuringen;
  aanvragen op eigen inzending; bestuurderslijst klantbreed, `server/routes/portal.ts:477`).
- Portaalclient: `client/src/pages/portal/index.tsx` (routes `/portaal/...`), navigatie
  `client/src/layouts/PortalLayout.tsx:206-215` verbergt items per schakelaar. Meldingen:
  `server/services/portal-customer-notifications.ts` met dedupe.
- Regel "geplande transport met nog onbekende auto": goedkeuring maakt een placeholder die de klant
  nooit ziet (`server/routes/portal-requests.ts:299`, `server/services/portal-vehicles.ts:26`).

### 3.5 PDF, rapporten, meldingen, taken

- PDF: `pdf-lib`, centrale generator `server/utils/pdf-generator.ts` (sjabloonvelden uit
  `pdf_templates.fields`), opslag uitsluitend via `registerGeneratedDocument()`
  (`server/services/document-registry.ts:103`) met versienummering en `is_stale` (B-05).
- Rapporten: `client/src/pages/reports/index.tsx` (zes tabbladen), server `server/routes/reports.ts`,
  aggregatie `server/utils/financial-reports.ts`. Geen CSV/PDF-export vanuit rapporten; afdrukken via
  iframe. CSV-helper bestaat (`client/src/lib/csv.ts`).
- Meldingen: `custom_notifications` (intern), `portal_notifications` (klant), socket
  `broadcastDataUpdate` (`server/realtime-events.ts:34`), mail `sendEmail()`
  (`server/utils/email-service.ts:450`) met sjablonen en `email_logs`.
- Taken: node-cron-klassen gestart in `server/index.ts:498-516` (back-up 02:00, APK 02:30,
  onderhoud 03:00, portaalalerts 04:00).

### 3.6 Rekenen en uitleggen

- Geldbedragen: `numeric` (Drizzle levert strings), afronden in centen (`shared/rental-pricing.ts:39`,
  `client/src/lib/format-utils.ts:31`), tonen met `formatCurrency` (nl-NL).
- Patroon voor een uitlegbare uitkomst: `BookabilityVerdict { bookable, reason, message, conflicts,
  ... }` met `messageFor(reason)` (`server/services/bookability.ts:64-92`). Pure gedeelde
  rekenfuncties: `shared/service-due.ts`, `shared/rental-pricing.ts`.

### 3.7 Migratie en tests

- Productie draait `node startup-migration.js && npm start`. `syncSchemaFromManifest()`
  (`startup-migration.js:233-333`) maakt ontbrekende tabellen en kolommen aan uit
  `schema-columns.json` (gegenereerd in `npm run build`); **nooit foreign keys, unieke constraints of
  indexen**. Die horen in een expliciete `createTableIfNotExists`-stap (zoals de portaaltabellen).
  Markerrijen in `app_settings` voor eenmalige datamigraties (`:353-412`).
- Tests: vitest, projecten `server` (Postgres `lvs_fixtest`, `fileParallelism: false`) en `client`
  (jsdom). Helpers `agentFor(permissions | "admin")` (`server/__tests__/helpers/app.ts:121`),
  fixtures, `dates.ts`, portaalhelpers `buildPortalTestApp()`/`buildStaffTestApp()`.

---

## 4. Ontwerp in één plaat

```
                     RDW (m9d7-ebf2 + 8ys7-d773)            Kantoor / klant
                               │                                  │
                               ▼                                  ▼
   vehicles ──1:1── vehicle_fiscal_profiles          vehicle_usage_periods ──1:1── reservations
   (bestaand)       catalogusprijs, brandstofklasse,  gebruikstype, privé, woon-werk,
                    CO₂, categorie, DET, bron+stempel  pool, vervanging+reden, vóór 2027
                               │                                  │
                               └──────────────┬───────────────────┘
                                              ▼
                              Fiscal Rules Engine (server/services/fiscal/)
                              1 valideer  2 kies regelversie op datum
                              3 los parameters op  4 toets voorwaarden
                              5 toets uitzonderingen  6 reken per kalendermaand
                              7 leg uit (NL)  8 bepaal status  9 snapshot
                                              │
              ┌───────────────────────────────┼─────────────────────────────┐
              ▼                               ▼                             ▼
   fiscal_rule_versions            fiscal_assessments                fiscal_review_cases
   + fiscal_parameter_values       (onveranderlijk, met snapshot)    (handmatige beoordeling)
   (concept → beoordeling →                    │
    goedgekeurd → gepubliceerd)                ▼
              │                    fiscal_audit_events (alleen toevoegen)
              ▼
   Beheer-UI "Fiscaal" (kantoor)   Voertuigtab "Fiscaal"   Portaal "Fiscaal" (per klantschakelaar)
```

Eén rekenimplementatie, in `server/services/fiscal/`. De client rekent nooit zelf; zij toont wat de
server heeft vastgelegd.

---

## 5. Herbruikbare onderdelen (en wat bewust niet wordt gedupliceerd)

| Behoefte | Hergebruik | Waarom niet nieuw |
|---|---|---|
| Rechtencontrole | `hasPermission()` + `UserPermission` + `permission-labels.ts` + permissiematrixtest | Eén rechtenmodel; de matrixtest bewaakt automatisch elke nieuwe route. |
| Klantschakelaars | `portal_customer_settings` + `PORTAL_FEATURE_KEYS` + `settingsFlags` (plafondregel) + `requireFeature` | Eén schakelmechanisme in het portaal; bestaande beheer-UI. |
| Tenantisolatie portaal | `PortalRequestContext { customerId, scope }` en `portal-storage.ts`-signatuur | Elke fiscale leesfunctie krijgt dezelfde verplichte `customerId` + `scope`. |
| Auditlog van HTTP-mutaties | `auditMutations` + `AuditLogger` | Blijft; daarnaast een gestructureerde fiscale audittabel (zie hoofdstuk 10). |
| Configuratie-opslag | Patroon `portal-config.ts` (zod, cache) voor *interne* fiscale instellingen | Officiële parameters krijgen wél eigen tabellen: versiebeheer en historie vragen rijen, geen jsonb-blob. |
| RDW-client | `server/utils/rdw-api.ts` uitbreiden (extra velden, tweede dataset) | Eén client, één foutafhandeling. |
| PDF | `pdf-generator.ts` + `registerGeneratedDocument()` | Eén generator, één documentregister met versies en `is_stale`. |
| Rapporten | Nieuw tabblad in `client/src/pages/reports/index.tsx`, route in `server/routes/reports.ts` | Bestaande rapportenpagina, bestaande `downloadCsv()`. |
| Meldingen | `custom_notifications`, `portal_customer_notifications.notify()` (dedupe), `sendEmail()` + sjablonen in `portal-mail.ts` | Eén meldingsketen met de B-06-conventies. |
| Nachtelijke taak | Cron-klasse zoals `ApkScanScheduler`, gestart in `server/index.ts` | Zelfde start/stop en tijdzone. |
| Lange berekening (impactvoorbeeld) | Fire-and-forget + statusobject + pollen (`apk-date-changes.ts`) | Bestaand patroon; bij de huidige omvang (honderden auto's) volstaat het. |
| Dagen tellen en kantoordatum | `shared/rental-pricing.ts:rentalDays`, `officeDate()` | Eén dagtelling in de hele app (let op de open kwestie BUG-153: inclusief/exclusief). |
| Uitlegpatroon | `BookabilityVerdict` + `messageFor()` | Zelfde vorm: uitkomst + reden + bewijs. |
| Datumhelpers in tests | `server/__tests__/helpers/dates.ts` | Nooit `toISOString()` in tests. |

---

## 6. Voorgestelde databasewijzigingen

Alle wijzigingen zijn additief. Datums in de nieuwe tabellen worden echte `date`-kolommen (geen tekst),
omdat de engine op maand- en daggrenzen vergelijkt; de API wisselt ze uit als `yyyy-MM-dd`, zoals de
rest van de app. Geen `pgEnum` (conventie: tekst + zod-allowlist).

### 6.1 Regels en parameters

**`fiscal_rule_versions`**
`id`, `rule_key` (tekst, nu alleen `pseudo_eindheffing_fossiel`), `version_number` (int; uniek per
`rule_key`), `status` (`draft | in_review | approved | published | superseded | archived | rejected`),
`title`, `effective_from` (date, verplicht bij publicatie), `effective_until` (date, leeg = open),
`reason_category` (`legislative_change | correction | government_guidance | internal_correction |
other`), `reason_text` (verplicht), `source_organisation`, `source_url`, `legal_reference`,
`source_verified_at`, `assumptions` (tekst), `created_by/at`, `submitted_by/at`, `approved_by/at`,
`published_by/at`, `rejected_by/at`, `rejection_reason`, `superseded_by_id`, `archived_at`.

**`fiscal_parameter_values`**
`id`, `rule_version_id` (FK), `parameter_key`, getypte waardekolommen `value_decimal numeric(14,4)`,
`value_integer`, `value_boolean`, `value_date`, `value_text` (precies één gevuld, afgedwongen in de
service en getest), `unit` (tekst, gekopieerd uit de definitie zodat de rij op zichzelf leesbaar
blijft), `legal_status` (`legal | internal`), `source_url`, `source_reference`, `source_verified_at`,
`notes`. Uniek `(rule_version_id, parameter_key)`.

Parameter**definities** (naam, omschrijving, categorie, datatype, eenheid, min/max, toegestane
waarden, verplicht, juridisch of intern, welke regel ze gebruikt) staan in code:
`server/services/fiscal/definitions.ts`, getypt en getest. Reden: een parameter betekent pas iets als
de rekenmodule hem gebruikt; een definitie verandert dus met code, een *waarde* verandert met de wet.
De UI leest de definities via de API, zodat de schermen zichzelf opbouwen zonder hardgecodeerde
namen. Een nieuwe fiscale variabele is dan: één definitie + gebruik in de rekenmodule + een waarde in
een nieuwe regelversie. Nooit een constante in een component, route of query.

### 6.2 Feiten over voertuig en gebruik

**`vehicle_fiscal_profiles`** (1:1 met `vehicles`)
`vehicle_id` (uniek, FK), `catalog_value numeric(12,2)`, `catalog_value_source` (`rdw | manual |
unknown`), `catalog_value_retrieved_at`, `catalog_value_verified_at/by`, `market_value numeric(12,2)`
(voor auto's ouder dan de leeftijdsgrens; handmatig), `first_admission_date date`, `fuel_category`
(`fossil | hybrid | zero_emission | unknown`, genormaliseerd uit de RDW-brandstofrijen), `co2_g_km`
(int), `european_category` (bijv. `M1`), `vehicle_kind` (RDW `voertuigsoort`, onvertaald),
`is_driving_school_manual` (bool, handmatig), `rdw_raw jsonb` (de originele RDW-waarden),
`rdw_retrieved_at`, `rdw_verified_at/by`, `manual_override jsonb` (welke velden handmatig zijn
gezet, door wie, waarom), `created_at`, `updated_at`.

De bestaande kolommen op `vehicles` blijven onaangeroerd; het profiel houdt originele én
genormaliseerde waarden met bron en tijdstip, zoals de opdracht vraagt. Een RDW-update past het
profiel aan (met nieuw `rdw_retrieved_at`), nooit een bestaande beoordeling.

**`vehicle_usage_periods`** ("terbeschikkingstellingsperiode")
`id`, `reservation_id` (uniek, FK; de bron), `vehicle_id`, `customer_id`, `start_date`,
`end_date` (leeg = open), `usage_type` (`business_only | business_commuting | business_private |
private | pool | multiple_drivers | temporary_rental | replacement | unknown | manual_review |
other`), `private_use` (`yes | no | unknown`), `commuting` (`yes | no | unknown`), `is_pool`,
`is_replacement`, `replacement_reason` (`maintenance | repair | accident | breakdown | tyre_change |
other | unknown`), `replaced_vehicle_text` (de eigen auto van de klant, vrije tekst of kenteken),
`replaced_reservation_id` (als de vervangen auto van Lam is), `provided_before_cutoff` (`yes | no |
unknown`; overgangsrecht), `confirmed_by_kind` (`staff | portal | none`), `confirmed_by_id`,
`confirmed_at`, `notes`, `created_at`, `updated_at`.

Rijen worden **afgeleid** uit reserveringen (type `standard` en `replacement`, niet verwijderd) en
nooit verwijderd; wat de app al weet wordt vooringevuld (`is_replacement` uit `type`,
`replacement_reason` uit `maintenance_category` van het gekoppelde blok, `multiple_drivers` uit de
bestuurdershistorie). Wat de app niet weet blijft `unknown` en leidt in de beoordeling tot
`DATA_INSUFFICIENT`, nooit tot een gok.

### 6.3 Beoordelingen, beoordelingswachtrij, audit

**`fiscal_assessments`** (onveranderlijk)
`id`, `kind` (`official | preview`), `customer_id`, `vehicle_id`, `reservation_id`,
`usage_period_id`, `period_start`, `period_end`, `calculation_date`, `rule_key`, `rule_version_id`,
`status` (`NOT_APPLICABLE | POSSIBLY_APPLICABLE | APPLICABLE | MANUAL_REVIEW_REQUIRED |
DATA_INSUFFICIENT | CONFIGURATION_INVALID | RULE_NOT_AVAILABLE`), `amount numeric(12,2)` (leeg als
niet berekenbaar), `months_charged` (int), `data_quality` (`complete | partial | insufficient`),
`explanation` (Nederlandse uitleg), `missing_data jsonb` (codes), `review_reasons jsonb`,
`inputs jsonb` (snapshot: voertuigprofiel, gebruiksperiode, bestuurder(s), klant), `parameters
jsonb` (snapshot: sleutel, waarde, eenheid, bron per parameter), `sequence` (1, 2, … bij
herberekening), `supersedes_id`, `requested_by`, `request_reason`, `created_at`.
Indexen op `(customer_id, vehicle_id, period_start)`, `(rule_version_id)`, `(status)`.

**`fiscal_review_cases`**
`id`, `assessment_id`, `customer_id`, `vehicle_id`, `usage_period_id`, `reasons jsonb`, `status`
(`open | in_progress | resolved | dismissed`), `assigned_to` (users), `resolution_note`,
`resolved_by/at`, `created_at`, `updated_at`. Eén open zaak per beoordeling.

**`fiscal_audit_events`** (alleen toevoegen; geen update- of delete-route; service heeft alleen
`insert`)
`id`, `occurred_at`, `user_id`, `username`, `role`, `permission_used`, `action` (`draft_created |
draft_edited | submitted | approved | rejected | published | superseded | archived |
validation_failed | unauthorized_attempt | recalculation_requested | review_resolved |
usage_confirmed | profile_overridden`), `rule_key`, `rule_version_id`, `parameter_key`,
`old_value`, `new_value`, `unit`, `scope` (altijd `GLOBAL`), `effective_from`, `effective_until`,
`reason_category`, `reason_text`, `source_url`, `validation_result jsonb`, `details jsonb`.

### 6.4 Klantschakelaars

Kolommen op `portal_customer_settings` (alle `boolean not null default false`):
`fiscal_mobility_enabled` (hoofdschakelaar), `pseudo_eindheffing_enabled`,
`fiscal_dashboard_enabled`, `fiscal_warnings_enabled`, `fiscal_reports_enabled`,
`driver_fiscal_visibility_enabled`. Daarnaast één accountsleutel `canViewFiscal` in
`PORTAL_FEATURE_KEYS`, zodat een individueel account het onderdeel ontnomen kan worden (plafondregel
blijft gelden). Uitschakelen verbergt; het verwijdert nooit beoordelingen of gegevens.

### 6.5 Migratie

- Nieuwe tabellen en kolommen komen via `schema-columns.json` (`npm run schema:export` in dezelfde
  commit; drifttest `scripts/export-schema.test.ts`).
- Foreign keys en indexen in een expliciete `createTableIfNotExists`-stap in `startup-migration.js`,
  zoals de portaaltabellen; `CREATE INDEX IF NOT EXISTS` voor bestaande omgevingen.
- Terugvalscenario: alle nieuwe tabellen kunnen worden weggehaald zonder verlies van bestaande
  gegevens; de zes nieuwe kolommen op `portal_customer_settings` hebben een default en zijn onschadelijk.
- Eerste vulling: het afleiden van `vehicle_usage_periods` uit bestaande reserveringen gebeurt door
  een idempotente stap met markerrij (`migration:fiscal_usage_periods_v1`), en alleen voor
  reserveringen vanaf een in te stellen datum (voorstel: startdatum ≥ 1 januari 2026, zodat het
  overgangsrecht beoordeeld kan worden).
- Geen `drizzle-kit push` in productie (bestaande regel).

---

## 7. Backend: de Fiscal Rules Engine

Map `server/services/fiscal/`:

| Bestand | Verantwoordelijkheid |
|---|---|
| `definitions.ts` | Regelregister en parameterdefinities (getypt). |
| `rule-versions.ts` | Versiebeheer: aanmaken concept, wijzigen (alleen `draft`), indienen, goedkeuren, afwijzen, publiceren (met validatie van overlap en gaten), archiveren. Gepubliceerde rijen zijn onveranderlijk; elke poging tot wijziging faalt met een getest foutpad. |
| `resolve.ts` | `resolveRuleVersion(ruleKey, date)`: kiest de gepubliceerde versie waarvoor `effective_from ≤ date ≤ effective_until` geldt. Nooit "de nieuwste". Geen versie → `RULE_NOT_AVAILABLE`; ongeldige set (overlap, ontbrekende verplichte parameter, waarde buiten bereik) → `CONFIGURATION_INVALID`. `resolveParameters(version)` levert getypte waarden mét eenheid en bron. |
| `calendar.ts` | Eén dagtelling en maandindeling: `calendarDaysInclusive(start, end)`, `monthsTouched(start, end)`, `consecutiveRun(...)`, leeftijd in jaren op peildatum. Gedeeld met tests; geen andere plek telt dagen. |
| `inputs.ts` | Bouwt de rekeninvoer uit profiel, gebruiksperiode, bestuurdershistorie en klant; valideert wat ontbreekt en levert `missing_data`-codes. |
| `rules/pseudo-eindheffing.ts` | De pure rekenmodule: `evaluate(input, params) → Verdict`. Kent geen database, geen datums van vandaag, geen getallen. Alle drempels komen uit `params`. |
| `explain.ts` | Nederlandse uitleg uit het verdict (sjabloon zoals in de opdracht, hoofdstuk 31), zonder stelligheid die de gegevens niet dragen. |
| `assess.ts` | Orkestratie: invoer → versie → parameters → evaluate → uitleg → status → snapshot opslaan (`kind: official`) of teruggeven (`kind: preview`). Maakt bij `MANUAL_REVIEW_REQUIRED`/`DATA_INSUFFICIENT` een beoordelingszaak (dedupe op open zaak). |
| `impact.ts` | Impactvoorbeeld voor een conceptversie: voert `assess` als `preview` uit over alle in aanmerking komende gebruiksperioden (alle klanten met de hoofdschakelaar aan), telt klanten, auto's, perioden, huidig totaal, concepttotaal, verschil, jaar- en maandimpact, aantal beoordelingen en onvoldoende-gegevensgevallen. Slaat niets op. Gelabeld "schatting". |
| `usage-periods.ts` | Afleiden en bijwerken van `vehicle_usage_periods` uit reserveringen (bij aanmaken, wijzigen, verwijderen, herstellen uit de prullenbak, bestuurderswissel). |
| `profiles.ts` | Voertuigprofiel uit RDW opbouwen/vernieuwen, handmatige overschrijving met reden, verificatie. |
| `audit.ts` | `recordFiscalEvent(...)`: alleen `insert`. |
| `scheduler.ts` | Nachtelijke taak (voorstel 03:30): profielen verversen voor auto's zonder recente ophaaldatum, gebruiksperioden bijwerken, beoordelingen voor lopende en recent afgesloten perioden van klanten met de schakelaar aan. |

Rekenlogica van de eerste regel (alle drempels als parameter, zie 02-variabelen.md):

1. **Regelversie** op de beoordelingsdatum; ontbreekt → `RULE_NOT_AVAILABLE`.
2. **Voertuig in scope?** Categorie in `VEHICLE_CATEGORIES_IN_SCOPE`, brandstofklasse ≠ `zero_emission`
   als `ZERO_EMISSION_EXEMPT`. Onbekende categorie of brandstofklasse → `DATA_INSUFFICIENT` (code
   `vehicle_category_unknown` / `fuel_category_unknown`); tegenstrijdig (RDW zegt M1, voertuigsoort
   zegt bedrijfsauto) → `MANUAL_REVIEW_REQUIRED`. Lesauto handgeschakeld en `DRIVING_SCHOOL_MANUAL_EXEMPT` → `NOT_APPLICABLE`.
3. **Periode in de tijd van de regel:** alleen kalendermaanden vanaf `effective_from`; eerder → `NOT_APPLICABLE`.
4. **Overgangsrecht:** `provided_before_cutoff = yes` → maanden tot `TRANSITION_EXEMPT_UNTIL`
   uitgezonderd; `unknown` → `POSSIBLY_APPLICABLE` met ontbrekend gegeven; `no` → doorgaan.
5. **Privégebruik:** `private_use = no` én (`commuting = no` of `COMMUTING_COUNTS_AS_PRIVATE = false`)
   → `NOT_APPLICABLE` (met de kanttekening dat de werkgever dit moet kunnen aantonen); `unknown` →
   `POSSIBLY_APPLICABLE`; anders doorgaan. Bij een poolauto of meerdere bestuurders zonder
   bevestigd gebruik → `MANUAL_REVIEW_REQUIRED`.
6. **Vervangend vervoer:** `is_replacement` met reden in `REPLACEMENT_VEHICLE_EXEMPTION_REASONS` en
   aaneengesloten lengte ≤ `REPLACEMENT_VEHICLE_EXEMPTION_DAYS` (en binnen
   `REPLACEMENT_VEHICLE_EXEMPTION_UNTIL` als gezet) → de dagen binnen de grens uitgezonderd; de dagen
   erna tellen (per maand). Reden `unknown` → `MANUAL_REVIEW_REQUIRED`.
7. **Kortstondige terbeschikkingstelling:** één periode ≤ `TEMPORARY_RENTAL_EXEMPTION_DAYS`
   aaneengesloten, ten hoogste `TEMPORARY_RENTAL_EXEMPTION_PERIODS_PER_YEAR` per kalenderjaar per
   kenteken per klant, vóór `TEMPORARY_RENTAL_EXEMPTION_UNTIL` → uitgezonderd. Een tweede periode
   van dezelfde auto bij dezelfde klant in hetzelfde jaar telt. Dit vraagt de eerdere perioden van
   dat kenteken bij die klant; die haalt `inputs.ts` op.
8. **Grondslag:** leeftijd op peildatum ≤ `OLDTIMER_AGE_YEARS` → catalogusprijs; anders marktwaarde.
   Ontbreekt de benodigde waarde → `DATA_INSUFFICIENT` (`catalog_value_missing`), nooit € 0.
9. **Bedrag:** per resterende kalendermaand `grondslag × tarief / 12`, afgerond op centen volgens
   `ROUNDING_MODE`; som over de maanden in de periode. `PARTIAL_PERIOD_RULE = full_period` maakt elke
   aangeraakte maand een hele maand. Uitkomst `APPLICABLE` met bedrag, of `POSSIBLY_APPLICABLE` met
   bedrag als indicatie wanneer een gegeven `unknown` was.
10. **Uitleg en snapshot.**

De client rekent niets; de portaal- en kantoorpagina's tonen de opgeslagen beoordeling.

### 7.1 API (staf, alle routes met `hasPermission`)

```
GET    /api/fiscal/definitions                       view_fiscal
GET    /api/fiscal/configuration                     view_fiscal        (huidig, toekomstig, concepten, verlopen)
GET    /api/fiscal/rule-versions[/:id]               view_fiscal
POST   /api/fiscal/rule-versions                     manage_fiscal_configuration   (concept)
PATCH  /api/fiscal/rule-versions/:id                 manage_fiscal_configuration   (alleen draft)
POST   /api/fiscal/rule-versions/:id/submit          manage_fiscal_configuration
POST   /api/fiscal/rule-versions/:id/approve|reject  approve_fiscal_configuration
POST   /api/fiscal/rule-versions/:id/publish         publish_fiscal_configuration
POST   /api/fiscal/rule-versions/:id/impact          manage_fiscal_configuration   (start voorbeeld)
GET    /api/fiscal/rule-versions/:id/impact          manage_fiscal_configuration   (status/resultaat)
GET    /api/fiscal/audit                             view_fiscal_audit_log
GET    /api/fiscal/review-cases[/:id]                manage_fiscal_review
PATCH  /api/fiscal/review-cases/:id                  manage_fiscal_review
GET    /api/fiscal/assessments?customerId=&vehicleId=&from=&to=   view_fiscal
POST   /api/fiscal/assessments/recalculate           manage_fiscal_review          (met reden)
GET    /api/vehicles/:id/fiscal-profile              view_fiscal
PATCH  /api/vehicles/:id/fiscal-profile              manage_fiscal_review          (handmatige waarde + reden)
POST   /api/vehicles/:id/fiscal-profile/refresh      manage_fiscal_review          (RDW opnieuw)
GET    /api/reservations/:id/usage-period            view_fiscal
PATCH  /api/reservations/:id/usage-period            manage_fiscal_review
GET    /api/reports/fiscal?customerId=&from=&to=     view_reports + view_fiscal
```

Portaal (`/api/portal/...`, klant uit de sessie, `requireFeature("canViewFiscal")` + klantschakelaar):

```
GET    /api/portal/fiscal/summary                    (klantoverzicht; bestuurdersrol: alleen eigen)
GET    /api/portal/fiscal/vehicles                   (per auto: status, uitleg, regelversie)
GET    /api/portal/fiscal/reservations/:id           (beoordeling van één huur)
PATCH  /api/portal/fiscal/reservations/:id/usage     (alleen als besloten; zie vraag Q2)
```

Onbekende routes vallen in de bestaande JSON-404. Validatie met zod; foutvorm `{ message }`.

---

## 8. Frontend

Kantoor (staf):

- Zijbalk: item **Fiscaal** (recht `view_fiscal`), pagina `/fiscaal` met tabbladen **Overzicht**
  (aantallen per status, openstaande beoordelingen, actieve regelversie), **Configuratie** (huidige
  waarden met eenheid, ingangs- en einddatum, versie, status, laatst gewijzigd, bron, wettelijke
  referentie, validatiestatus; onderscheid huidig / toekomstig / concept / verlopen / vervangen /
  ongeldig), **Regelversies** (lijst en detail met parameterwaarden en audit), **Concepten en
  beoordeling** (indienen, goedkeuren, afwijzen, publiceren), **Beoordelingen** (wachtrij),
  **Auditlog**.
- Bewerken: dialoog per conceptversie met de definities als bron voor labels, uitleg en eenheden;
  verplichte ingangsdatum, reden en bron (voor juridische parameters); validatie in client én server;
  knop "Impact tonen"; publiceren via bevestigingsdialoog met parameter, oude en nieuwe waarde,
  ingangsdatum, einddatum, "Bereik: ALLE KLANTEN", geraakte auto's en klanten, bron en reden, en de
  vaste waarschuwing: *Deze wijziging kan gevolgen hebben voor fiscale berekeningen van alle klanten
  en voertuigen die onder deze fiscale regel vallen.*
- Voertuigdialoog (`vehicle-details.tsx`): zevende tabblad **Fiscaal** (profiel met bron en
  tijdstip, handmatige waarde met reden, laatste beoordeling met uitleg, knop "RDW opnieuw ophalen").
- Reservering: blok **Gebruik** (gebruikstype, privé, woon-werk, vervanging en reden, vóór 2027) met
  bevestiging; zichtbaar wat is voorgevuld en wat nog `onbekend` is.
- Klantdialoog, tabblad Portaal: de zes fiscale schakelaars in `customer-portal-settings-form.tsx`.
- Rapporten: tabblad **Fiscaal** (vlootoverzicht per klant en status, geschatte jaar- en maandimpact,
  regelversie, periode; CSV via `downloadCsv`, PDF via de bestaande generator met een nieuw
  sjabloontype `fiscal_assessment`).
- Teksten in `client/src/locales/nl/fiscal.json` (nieuwe namespace) en `en/`; de bestaande test
  `dutch-ui-leaks.test.tsx` bewaakt de Nederlandse dekking.

Klantportaal:

- Navigatie-item **Fiscaal** (alleen bij `fiscal_mobility_enabled` én `canViewFiscal`), pagina met
  per auto: status in gewone taal, uitleg, gebruikte regelversie, periode, en "handmatige beoordeling
  door Lam Groep nodig" waar van toepassing. Bedragen alleen als besloten (vraag Q5).
  Bestuurdersrol: alleen eigen huurauto's en alleen bij `driver_fiscal_visibility_enabled`.
- Geen enkele officiële parameter is in het portaal zichtbaar als bewerkbaar; de portaalroutes kennen
  geen schrijfoperatie op regels of parameters.

---

## 9. Rechten

Nieuwe waarden in `UserPermission` (conventie: werkwoord_onderwerp), met labels in
`shared/permission-labels.ts`:

| Recht | Geeft |
|---|---|
| `view_fiscal` | Fiscale schermen, beoordelingen en de configuratie lezen. |
| `manage_fiscal_review` | Beoordelingswachtrij, gebruiksgegevens en handmatige profielwaarden bewerken, herberekening aanvragen. |
| `manage_fiscal_configuration` | Concepten aanmaken, bewerken, indienen; impact opvragen. |
| `approve_fiscal_configuration` | Goedkeuren of afwijzen. |
| `publish_fiscal_configuration` | Publiceren. |
| `view_fiscal_audit_log` | Fiscale auditlog lezen. |

Adminbypass: de bestaande middleware laat de rol `admin` alles door. Dat blijft, tenzij je voor
publiceren een strikte controle wilt zoals bij `authorize_mileage_decrease` (vraag Q4). Backend is
leidend; de client verbergt alleen. De permissiematrixtest dekt automatisch elke nieuwe route;
daarnaast expliciete tests per rol (klant, klantbeheerder, bestuurder, medewerker zonder recht,
medewerker met elk recht, admin) op UI-gedrag én directe API-aanroepen.

---

## 10. Audit

- Gestructureerd: `fiscal_audit_events` (hoofdstuk 6.3) voor elke actie op regels, parameters,
  beoordelingszaken, gebruiksbevestigingen, profieloverschrijvingen, herberekeningen en geweigerde
  pogingen (`unauthorized_attempt` wordt door de fiscale routes zelf gelogd bij 403).
- Generiek: `auditMutations` blijft elke HTTP-mutatie met diff loggen in `audit_logs`.
- Onveranderlijk: geen update- of delete-route; de service heeft alleen `insert`; een test loopt de
  routerstack na op het ontbreken van muterende routes op `/api/fiscal/audit`.
- Aanbeveling los van dit onderdeel: BUG-082 (`getClientIp`) eerst repareren met
  `firstUntrustedAddress()` uit `rateLimiter.ts`, zodat ook de fiscale audit een betrouwbaar IP krijgt.

---

## 11. Teststrategie

| Laag | Wat | Waar |
|---|---|---|
| Rekenmodule (puur) | Tabelgestuurde tests per stap uit hoofdstuk 7: scope, overgangsrecht, privé/woon-werk, vervanging (onder, op, één boven de grens; over maand- en jaargrens; reden onbekend), kortstondig (één periode, tweede periode, ander jaar, ander kenteken, andere klant), grondslag (≤ en > leeftijdsgrens, ontbrekende waarde), maandtelling en afronding. Geen enkele constante in de tests die niet uit een testparameterset komt. | `server/services/fiscal/__tests__/` (server-project, geen DB nodig) |
| Versiekeuze en validatie | Geldig/ongeldig percentage, precisie, negatief, buiten bereik; dagen als geheel getal; datums (einde vóór begin, overlap, gat, toekomstig, verlopen); keuze op datum, niet op nieuwste; gepubliceerd is onveranderlijk. | idem, met DB |
| Historie | Nieuwe versie wijzigt bestaande beoordelingen niet; RDW-update en klantschakelaar wijzigen ze niet; expliciete herberekening maakt een nieuwe rij met `sequence + 1` en `supersedes_id`. | DB-tests |
| Globaal bereik | Eén versie voor alle klanten, geen klantoverride mogelijk (geen route, geen kolom); impactvoorbeeld telt alle klanten met schakelaar aan; tenantisolatie intact. | DB-tests |
| Rechten | Matrixtest + expliciete tests per rol op elke route; portaal: klant kan geen configuratie-API bereiken (404/403), bestuurder ziet alleen eigen auto's, klant A ziet niets van klant B. | `server/__tests__/` met `agentFor`, `buildPortalTestApp` |
| Client | Configuratiescherm toont eenheden en definities, bewerkknop verborgen zonder recht, publicatiedialoog toont alle verplichte velden; portaalpagina verborgen zonder schakelaar. | jsdom-tests |
| Regressie | Volledige suite (nu 1085), typecontrole, productiebouw; daarna handmatige doorloop van klant, voertuig, bestuurder, reservering, vervanging, onderhoud, transport, rapporten, PDF, meldingen, portaal, back-up, inloggen. | bestaand |
| Prestaties | Impactvoorbeeld op een kloon van de productiedatabase; grens: onder 10 s synchroon, anders het fire-and-forget-patroon. | handmatig, met meting |

---

## 12. Risico's en onzekerheden

| Nr. | Risico | Hoe ermee om te gaan |
|---|---|---|
| R1 | **De wettekst is deels nog voorstel.** Vervanging (14 dagen), kortstondig (7 dagen), lesauto's en de verlenging tot 31-12-2030 zitten in het wetsvoorstel van 15 september 2026. | Alle drempels zijn parameters met status en bron. De eerste regelversie wordt als **concept** meegeleverd met de wettelijke waarden; publicatie is een menselijke handeling na de verificatiepunten V1–V10. |
| R2 | **De maandregel** ("één dag = hele maand") komt alleen uit BOVAG. | Parameter `PARTIAL_PERIOD_RULE`; verificatiepunt V5 vóór publicatie. |
| R3 | **De app kent privégebruik en woon-werkverkeer niet.** Zonder bevestiging blijft bijna elke uitkomst `POSSIBLY_APPLICABLE`/`DATA_INSUFFICIENT`. | Dat is de juiste uitkomst. Het gebruiksblok bij de reservering en (optioneel) bevestiging door de klant in het portaal maken het beeld scherper. |
| R4 | **Catalogusprijs ontbreekt vaak in RDW** (import, oudere auto's). | Nooit € 0; `DATA_INSUFFICIENT` plus beoordelingszaak; handmatige waarde met bron en verificatie. |
| R5 | **Vertaalde voertuigvelden** (`vehicle_type` "Sedan", `fuel` "Gasoline") zijn te grof voor de fiscale afbakening. | Het profiel bewaart de onvertaalde RDW-waarden en de genormaliseerde klasse apart. |
| R6 | **Lam is niet de werkgever.** De check is informatief; klanten kunnen hem als zekerheid opvatten. | Vaste disclaimer op elk scherm, rapport en PDF; taalgebruik "op basis van de geconfigureerde regels en de beschikbare gegevens"; nooit "gegarandeerd". |
| R7 | **Overgangsrecht** hangt af van klantkennis (auto al vóór 2027 bij deze werkgever). | Veld `provided_before_cutoff` met bevestiging; `unknown` blijft `POSSIBLY_APPLICABLE`. |
| R8 | **Dagtelling** kent een open beslissing (BUG-153: inclusief of exclusief). | Fiscale dagtelling volgt de wet (kalenderdagen, begin- en einddag inclusief); staat los van facturatie en is één functie. |
| R9 | **Reserveringsdatums zijn tekst** en kunnen theoretisch ongeldig zijn (BUG-111 is gerepareerd, oude rijen niet gegarandeerd). | Afleiding van gebruiksperioden weigert ongeldige datums en meldt ze als beoordelingszaak. |
| R10 | **Prestaties** van het impactvoorbeeld en de nachtelijke taak. | Batchgewijs, één query per tabel, geen N+1; meting op een kloon; bestaand asynchroon patroon als reserve. |
| R11 | **Adminbypass**: een admin kan alles, ook publiceren. | Bewust conform de bestaande conventie; alternatief in Q4. |
| R12 | **Migratie in productie** maakt geen indexen of FK's uit het manifest. | Expliciete stap in `startup-migration.js`, getest op een productie-vormige kloon zoals bij de vorige deploy. |
| R13 | **B-22** (timestamptz) is in productie nog niet toegepast; nieuwe `timestamptz`-kolommen zijn daar in orde, oude niet. | Fiscale tabellen gebruiken `date` voor perioden en `timestamptz` voor stempels; geen afhankelijkheid van oude kolommen. |

---

## 13. Aannames

1. De klant (`customers`) is de werkgever (inhoudingsplichtige) en de opgegeven bestuurder is zijn
   werknemer. Particuliere klanten (`customer_type = individual`) vallen buiten de check (vraag Q1).
2. Eén reservering van type `standard` of `replacement` is één terbeschikkingstellingsperiode van die
   auto aan die klant. Onderhoudsblokken en placeholders tellen niet.
3. Bij een placeholder (auto nog onbekend) is de uitkomst `DATA_INSUFFICIENT` tot de auto bekend is;
   er wordt nooit een auto verzonnen.
4. Lam's vloot bestaat uit personenauto's en bestelauto's; de categorie komt uit RDW
   (`europese_voertuigcategorie`), niet uit het vertaalde `vehicle_type`.
5. De eerste regelversie wordt als concept meegeleverd; niets is "van toepassing" voordat een
   bevoegde medewerker heeft gepubliceerd.
6. Scenario- en simulatiefunctionaliteit valt buiten deze eerste oplevering; het impactvoorbeeld is
   nadrukkelijk een schatting op een conceptversie en wordt niet opgeslagen.
7. Gewone bijtelling (22%) wordt niet gebouwd; het regelregister laat er later een aparte module voor toe.

---

## 14. Vragen waarop een antwoord nodig is

| Nr. | Vraag | Voorstel |
|---|---|---|
| Q1 | Alleen zakelijke klanten in de check, of ook particulieren? | Alleen `customer_type = business`. |
| Q2 | Mag de klant in het portaal zelf het gebruik bevestigen (privé, woon-werk, vóór 2027), of alleen kantoor? | Klantbeheerder mag bevestigen; elke bevestiging wordt geaudit en is door kantoor te overrulen. |
| Q3 | Nachtelijke beoordeling voor alle klanten met de schakelaar aan, of alleen op verzoek? | Nachtelijk, alleen lopende en recent afgesloten perioden; op verzoek altijd mogelijk. |
| Q4 | Vier-ogenprincipe bij publiceren (indiener ≠ publiceerder) en strikte controle ook voor admins? | Nee in de eerste versie: jij bent de enige beheerder. Wel volledig geaudit. |
| Q5 | Toont het portaal bedragen (schatting) of alleen status en uitleg? | Alleen status en uitleg, bedragen achter een aparte schakelaar (`fiscal_dashboard_enabled`). |
| Q6 | Welke meldingen? | Kantoor: beoordeling nodig, gegevens ontbreken, versie wordt actief. Klant (bij `fiscal_warnings_enabled`): gegevens ontbreken, beoordeling door Lam nodig, waarschuwing wanneer een vervanging de 14-dagengrens of een maandgrens nadert. Nooit conceptversies naar klanten. |
| Q7 | Plek in de zijbalk: **Fiscaal** onder Rapporten? | Ja. |
| Q8 | Wie vult een ontbrekende catalogusprijs in: kantoor of ook de klant? | Alleen kantoor, met bron. |
| Q9 | Reden van vervanging bij een gewone huur (de klant huurt omdat zijn eigen auto bij de garage staat): verplicht veld bij reserveren, of alleen in het gebruiksblok? | Optioneel veld bij reserveren, verplicht zodra iemand het gebruik bevestigt. |
| Q10 | Vanaf welke reserveringsdatum worden gebruiksperioden afgeleid? | Startdatum vanaf 1 januari 2026. |

---

## 15. Plan en stopmomenten

| Stap | Inhoud | Stopmoment |
|---|---|---|
| 1 | Dit document, het wettelijk kader en de variabeleninventaris. | **STOP 1: goedkeuring van dit voorstel en antwoord op Q1–Q10.** |
| 2 | Schema (7 tabellen, 6 kolommen), migratiestap, definities in code, dataflow uitgeschreven per scherm. | STOP 2: schema en dataflow. |
| 3 | Engine: definities, versiebeheer, resolve, kalender, rekenmodule, uitleg, snapshot; API voor configuratie; conceptversie 1 met wettelijke waarden; tests uit hoofdstuk 11 (rekenmodule, versiekeuze, historie). | STOP 3: testresultaten. |
| 4 | Kantoor-UI (Fiscaal, voertuigtab, gebruiksblok, klantschakelaars), rechten, auditlog, beoordelingswachtrij, impactvoorbeeld, publicatiedialoog; beveiligingstests. | STOP 4: beveiligingsresultaten. |
| 5 | RDW-uitbreiding en profielen, afleiding gebruiksperioden, nachtelijke taak, portaalpagina en -routes, meldingen; tenant- en zichtbaarheidstests. | STOP 5: isolatie en zichtbaarheid. |
| 6 | Rapporten en PDF, randgevallen (maand- en jaargrenzen, open einde, placeholder, meerdere bestuurders, tweede kortstondige periode), documentatie voor medewerkers en klanten. | STOP 6: randgevaltests. |
| 7 | Eindaudit uit hoofdstuk 63 van de opdracht (zoek naar hardgecodeerde fiscale waarden, dubbele logica, ontbrekende rechten), volledige regressie, productie-vormige migratietest op een kloon. | STOP 7: eindrapport. |

Deploy naar `main` gebeurt pas na STOP 7 en jouw eigen doorloop, zoals bij de audit.

---

**HARD STOP: STOP POINT 1.** Er wordt niets gebouwd voordat dit voorstel is goedgekeurd en de
vragen in hoofdstuk 14 zijn beantwoord.
