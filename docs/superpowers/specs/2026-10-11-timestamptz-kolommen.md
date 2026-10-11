# Kolommen met tijdzone: wat staat er nu in? (B-22, deelproject D)

Status: werkdocument voor Kees, 12-10-2026. Bij besluit B-22 (omzetting van de database naar tijdzone-bewuste
kolommen) en B-41 D11 (stappenplan). Gemaakt uit `schema-columns.json` (alle kolommen van het soort
`timestamp with time zone`), `shared/schema.ts` (de standaardwaarden) en een nalopen van alle code in
`server/`, `scripts/` en `startup-migration.js` die zo'n kolom schrijft. Er is **niets uitgevoerd** en geen code
aangeraakt; dit is een lijst en een plan.

## 1. Waar het om gaat

Volgens B-22 staan alle tijdkolommen in productie nog als `timestamp without time zone`: een kale klokstand zonder zone. Wat erin
staat, hangt af van **wie** het schreef:

- **De databasestandaard `now()`.** Postgres schrijft de klokstand in de tijdzone van de databasesessie. Is die
  Europe/Amsterdam, dan staat er de **Nederlandse klokstand** (21:18 in plaats van 19:18 UTC).
- **De app met `new Date()`.** Drizzle schrijft dat als ISO-tekst in UTC, en de kolom bewaart de klokstand van die
  tekst: de **UTC-klokstand** (19:18).

De omzetting (`scripts/migrate-timestamps-to-timestamptz.ts`, ook gestart door `TIMESTAMPTZ_MIGRATION=apply`) leest
**elke** bestaande waarde als Nederlandse klokstand (`AT TIME ZONE 'Europe/Amsterdam'`). Dat klopt voor de ene soort en
brengt de andere soort 1 of 2 uur te vroeg (zomer 2 uur, winter 1 uur): de getoonde tijd loopt dan achter. Die rijen zijn nu juist nog goed. Er is geen kolom die per rij
bijhoudt wie schreef, dus geen omzetting kan dat achteraf per rij uit elkaar halen. Deze lijst zegt **per kolom** welke
soort er (hoofdzakelijk) in zit.

## 2. Twee aannames die je eerst moet controleren

1. **De tijdzone van de Postgres-server in productie.** Het script en de eerdere analyse gaan uit van Europe/Amsterdam.
   Dat is aangetoond op de ontwikkelomgeving (BUG-224), maar **nergens in deze repository staat een tijdzone voor de
   productiedatabase** (geen `TZ`, geen `PGTZ`, geen `timezone` in de Dockerfile, in nixpacks of in de verbinding). Een
   standaard Postgres-container staat op UTC. Is dat in productie zo, dan zit er in alle "NL"-kolommen onder **UTC** en
   moet de omzetting daar `AT TIME ZONE 'UTC'` gebruiken in plaats van Amsterdam. Controleer eerst met `SHOW timezone;`
   op productie (stap 1 in het plan).
2. **De tijdzone van het Node-proces** (de container van de app). Waarden die de app als gewone parameter doorgeeft in
   plaats van via Drizzle (bij `pdf_templates.updated_at`, ruwe SQL, `database-storage.ts:4212`) krijgen de klokstand van het
   proces; de CJIB-parser (`services/cjib/parser.ts:78`) leest een tijd zonder zone ook in de zone van het proces. In
   een container zonder `TZ` is dat UTC.

## 3. Hoe de klassen te lezen

| Klasse | Wat er in staat | Wat de Amsterdam-regel ermee doet |
|---|---|---|
| **NL** | Alleen de kolomstandaard `now()` (of `to_timestamp()`): de klokstand van de databasesessie | Klopt, **als** aanname 1 klopt |
| **UTC** | De app schrijft `new Date()` of een tijdstip als ISO-tekst: de UTC-klokstand | Fout na de omzetting: de getoonde tijd komt 1 of 2 uur te vroeg |
| **Gemengd** | Standaard `now()` bij aanmaken en `new Date()` bij elke wijziging, in dezelfde kolom (alle `updated_at` die de app zelf zet) | Per rij verschillend: een rij die nooit is gewijzigd klopt, een gewijzigde rij komt 1 of 2 uur te vroeg |
| **Onbekend (invoer)** | De waarde komt van een gebruiker, een bestand of een formulier en wordt door de code ingelezen | Onzeker; hangt af van wat de bron stuurde. Controleer met bekende rijen |
| **Geen schrijver** | Geen enkele code in `server/` of `scripts/` schrijft deze kolom | Geen invloed op nieuwe gegevens; een oude rij kan uit een import of eerdere code komen |

## 4. Samenvatting

136 kolommen in 54 tabellen:

| Klasse | Aantal |
|---|---|
| NL (kolomstandaard) | 57 |
| NL via `to_timestamp()` (`session.expire`) | 1 |
| UTC (de app schrijft) | 38 |
| Gemengd (`updated_at`) | 23 |
| Onbekend (invoer) | 4 |
| Geen schrijver | 13 |

Het manifest telt nu 136 van zulke kolommen; de kop van het script noemt er 101 (de stand van toen). Het
rapport (stap 3) telt de kolommen die in de database nog echt zonder zone zijn.

Wat dit betekent: 58 kolommen (vooral `created_at`) kloppen met de Amsterdam-regel; 38 kolommen
zijn zuiver UTC en komen 1 of 2 uur te vroeg; 23 `updated_at`-kolommen zijn per rij verschillend. Dat de `updated_at`-kolommen
gemengd zijn, ziet de gebruiker vooral als "bijgewerkt" op een dossier; de UTC-kolommen met een verloopmoment
(`active_sessions.expires_at`, `portal_users.invite_expires_at`, `portal_users.email_change_expires_at`) laten een uitnodiging of
sessie 1 of 2 uur eerder verlopen.

## 5. De lijst per tabel

### active_sessions

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `last_activity` | Gemengd | standaard bij aanmaken; `utils/security/sessionManager.ts:32,59` zet `lastActivity: new Date()` bij elk verzoek |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `expires_at` | UTC | `utils/security/sessionManager.ts:14`, doorgegeven vanuit `auth.ts:485` (`new Date(Date.now() + cookieMaxAge)`) |

### apk_date_changes

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `detected_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `resolved_at` | UTC | `routes/apk-date-changes.ts:58,84,208,234` |

### app_settings

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:5880` |

### audit_logs

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### backup_runs

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `started_at` | UTC | `backupService.ts:157` (`startedAt: new Date()`) |
| `finished_at` | UTC | `backupService.ts:172,800` |

### backup_settings

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | NL | alleen de kolomstandaard; de app zet hem bij wijzigen nergens zelf, dus hij blijft op het moment van aanmaken staan |

### barcode_label_templates

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:4485` |

### custom_notifications

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | NL | alleen de kolomstandaard; de app zet hem bij wijzigen nergens zelf, dus hij blijft op het moment van aanmaken staan |

### customers

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | NL | alleen de kolomstandaard; de app zet hem bij wijzigen nergens zelf, dus hij blijft op het moment van aanmaken staan |

### damage_check_template_backgrounds

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### damage_check_templates

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:6532` |

### deleted_records

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `deleted_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `restored_at` | UTC | `database-storage.ts:853` en zes gelijke plekken |

### delivery_tasks

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `scheduled_delivery_time` | Geen schrijver | geen schrijver in `server/` of `scripts/` (de tabel wordt alleen door het definitief verwijderen gelezen); een waarde kan alleen uit oudere code of een import komen |
| `scheduled_pickup_time` | Geen schrijver | geen schrijver in `server/` of `scripts/` (de tabel wordt alleen door het definitief verwijderen gelezen); een waarde kan alleen uit oudere code of een import komen |
| `estimated_delivery_time` | Geen schrijver | geen schrijver in `server/` of `scripts/` (de tabel wordt alleen door het definitief verwijderen gelezen); een waarde kan alleen uit oudere code of een import komen |
| `estimated_pickup_time` | Geen schrijver | geen schrijver in `server/` of `scripts/` (de tabel wordt alleen door het definitief verwijderen gelezen); een waarde kan alleen uit oudere code of een import komen |
| `delivery_completed_at` | Geen schrijver | geen schrijver in `server/` of `scripts/` (de tabel wordt alleen door het definitief verwijderen gelezen); een waarde kan alleen uit oudere code of een import komen |
| `pickup_completed_at` | Geen schrijver | geen schrijver in `server/` of `scripts/` (de tabel wordt alleen door het definitief verwijderen gelezen); een waarde kan alleen uit oudere code of een import komen |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | NL | alleen de kolomstandaard; de app zet hem bij wijzigen nergens zelf, dus hij blijft op het moment van aanmaken staan |

### documents

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `upload_date` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `stale_since` | UTC | `services/document-registry.ts:174,230`, `services/reservation-revert.ts:508` |

### drivers

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:6142` |

### expenses

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | NL | alleen de kolomstandaard; de app zet hem bij wijzigen nergens zelf, dus hij blijft op het moment van aanmaken staan |

### fine_import_files

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `received_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `processed_at` | UTC | `services/cjib/importer.ts:72,87` |

### fines

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `offence_at` | Onbekend (invoer) | invoer: `routes/fines.ts:248` (`new Date(<tekst uit het formulier>)`), `services/cjib/parser.ts:78` (datum en tijd uit het CJIB-bestand zonder zone, door Node gelezen als lokale tijd van het proces). Hangt af van wat de bron stuurde en van de tijdzone van het serverproces |
| `linked_at` | UTC | `services/fine-attribution.ts:84,102` |
| `charged_at` | Geen schrijver | geen schrijver sinds D9 (de dode takken zijn weg); kan alleen in oude rijen staan |
| `paid_at` | Geen schrijver | idem |
| `customer_notified_at` | UTC | `routes/fines.ts:342` (nieuw in deelproject D) |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/fines-storage.ts:52` |

### fiscal_assessments

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### fiscal_audit_events

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `occurred_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### fiscal_parameter_values

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `source_verified_at` | Onbekend (invoer) | invoer: `services/fiscal/rule-versions.ts:277` (`new Date(<datum uit het formulier>)`) |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/fiscal/rule-versions.ts:355` |

### fiscal_review_cases

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `resolved_at` | UTC | `services/fiscal/assess.ts:188`, `services/fiscal/review-cases.ts:114` |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/fiscal/assess.ts:161` |

### fiscal_rule_versions

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `source_verified_at` | Onbekend (invoer) | invoer: `services/fiscal/rule-versions.ts:277` |
| `submitted_at` | UTC | `services/fiscal/rule-versions.ts:484` |
| `approved_at` | UTC | `services/fiscal/rule-versions.ts:488` |
| `published_at` | UTC | `services/fiscal/rule-versions.ts:561` |
| `rejected_at` | UTC | `services/fiscal/rule-versions.ts:493` |
| `archived_at` | UTC | `services/fiscal/rule-versions.ts:598` |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/fiscal/rule-versions.ts:439` |

### interactive_damage_checks

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `check_date` | Onbekend (invoer) | invoer: `routes.ts:8491` (`req.body.checkDate ?? new Date().toISOString()`): de browser stuurt een tijdstip, de server vult anders UTC in |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:6880` |

### invoice_inbox_items

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `mail_date` | UTC | de datumkop van de mail als echt tijdstip: `services/invoice-inbox/importer.ts:395` |
| `received_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `processed_at` | UTC | `routes/expense-inbox.ts:213,235,261`, `services/invoice-inbox/importer.ts:284,371` |

### invoice_inbox_runs

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `started_at` | UTC | `services/invoice-inbox/run-log.ts:49` (`new Date(summary.startedAt)`, ISO-tekst) |
| `finished_at` | UTC | `services/invoice-inbox/run-log.ts:50` |

### login_attempts

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `attempted_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### password_history

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### pdf_templates

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:4212 (ruwe SQL; zie de opmerking onder de tabel)` |

### portal_activity_log

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### portal_customer_settings

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/portal-storage.ts:151` |

### portal_document_acks

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `acked_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### portal_notifications

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### portal_request_attachments

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### portal_request_messages

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### portal_requests

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `replied_at` | UTC | `routes/portal-requests.ts:50` |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/portal-requests-storage.ts:122` |

### portal_users

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `invite_expires_at` | UTC | `services/portal-mail.ts:240` |
| `email_change_expires_at` | UTC | `services/portal-mail.ts:270` |
| `last_login_at` | UTC | `portal-auth.ts:308` |
| `last_seen_at` | UTC | `portal-auth.ts:259` |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/portal-storage.ts:128` |

### reservation_driver_assignments

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `assigned_from` | UTC | `services/driver-assignments.ts:46` (`assignedFrom: at`, `at = new Date()`) |
| `assigned_until` | UTC | `services/driver-assignments.ts:39`, `database-storage.ts:2185,2255` |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### reservations

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:3118 en nog ± 25 plekken` |
| `deleted_at` | UTC | `database-storage.ts:2226`, `routes.ts:6443` (zacht verwijderen) |

### saved_reports

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `last_run_at` | Geen schrijver | geen schrijver in `server/` of `scripts/` |
| `next_run_at` | Geen schrijver | geen schrijver |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | NL | alleen de kolomstandaard; de app zet hem bij wijzigen nergens zelf, dus hij blijft op het moment van aanmaken staan |

### scan_events

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### session

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `expire` | NL (bibliotheek) | geschreven door `connect-pg-simple` met `to_timestamp(...)`: de databasesessie zet dat om naar haar eigen tijdzone, net als `now()`. Sessies leven kort; na de omzetting lezen en schrijven beide kanten weer hetzelfde |

### settings

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:5959` |

### template_backgrounds

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### transport_report_template_backgrounds

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### transport_report_templates

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:4405` |

### users

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `last_login_at` | UTC | `auth.ts:459` (nieuw in deelproject D) |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:263, routes/users.ts:484` |

### vehicle_customer_blacklist

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |

### vehicle_diagram_templates

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:6712` |

### vehicle_fiscal_profiles

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `catalog_value_retrieved_at` | UTC | `services/fiscal/profiles.ts:302` |
| `catalog_value_verified_at` | UTC | `services/fiscal/profiles.ts:136` |
| `market_value_verified_at` | UTC | `services/fiscal/profiles.ts:139` |
| `rdw_retrieved_at` | UTC | `services/fiscal/profiles.ts:288` |
| `rdw_verified_at` | Geen schrijver | geen schrijver gevonden |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/fiscal/profiles.ts:76` |

### vehicle_transports

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:2022` |

### vehicle_usage_periods

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `derived_at` | UTC | `services/fiscal/usage-periods.ts:159,195,219` |
| `confirmed_at` | UTC | `services/fiscal/usage-periods.ts:295` |
| `closed_at` | UTC | `services/fiscal/usage-periods.ts:159` |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `services/fiscal/usage-periods.ts:159` |

### vehicle_waitlist

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `contacted_at` | Geen schrijver | geen schrijver gevonden |
| `fulfilled_at` | Geen schrijver | geen schrijver gevonden |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | NL | alleen de kolomstandaard; de app zet hem bij wijzigen nergens zelf, dus hij blijft op het moment van aanmaken staan |

### vehicles

| Kolom | Klasse | Wie schrijft de waarde |
|---|---|---|
| `remarks_confirmed_at` | UTC | `routes.ts:5855` |
| `mileage_decreased_at` | UTC | `database-storage.ts:3141`, `routes.ts:1691,1889,5018` |
| `fuel_refill_date` | UTC | `routes.ts:2122` (`updateData.fuelRefillDate = new Date()`) |
| `created_at` | NL | alleen de kolomstandaard `now()`; geen schrijver met een eigen waarde gevonden |
| `updated_at` | Gemengd | standaard bij aanmaken; bij wijzigen `updatedAt: new Date()` in `database-storage.ts:3254, 5568` |

## 6. Opmerkingen bij enkele kolommen

- **`pdf_templates.updated_at`** wordt met ruwe SQL gezet (`updated_at = ${new Date()}`, `database-storage.ts:4212`). Een
  `Date` als gewone parameter gaat als tekst met de offset van het Node-proces naar de database, en een kolom zonder zone
  negeert die offset: er staat dus de klokstand van het proces (UTC als het proces op UTC draait). Daarom "gemengd" met de
  kanttekening van aanname 2.
- **`login_attempts.attempted_at`** (NL) wordt altijd binnen de database vergeleken met `now()`
  (`middleware/security/rateLimiter.ts`); na de omzetting blijft dat kloppen en blijft de eerdere reparatie van het
  vergrendelen-na-vijf-pogingen-probleem (BUG-008) werken.
- **`session.expire`** komt van `connect-pg-simple`. Zo'n sessie leeft hooguit enkele uren; wie op het moment van de
  omzetting ingelogd is, kan opnieuw moeten inloggen. Plan het venster daarom buiten kantooruren.
- **`fines.offence_at`**: een formulier dat een tijd zonder zone stuurt, wordt in de zone van het proces gelezen (UTC)
  en als die klokstand bewaard. Dat is bij de Amsterdam-regel zelfs *goed* (14:30 getypt, 14:30 bewaard, na de omzetting
  14:30 Amsterdam). Stuurt de browser een ISO-tijd met `Z`, dan is het UTC-klokstand en komt de waarde 1 of 2 uur te vroeg. Zonder
  proefrij niet te zeggen; controleer een bekeuring waarvan je het tijdstip kent.
- **De kolommen `source_verified_at` (twee tabellen) en `check_date`** hebben dezelfde onzekerheid: de bron is een formulier.
- **`updated_at` die nooit wordt gezet** (`customers`, `expenses`, `custom_notifications`, `backup_settings`,
  `saved_reports`, `delivery_tasks`, `vehicle_waitlist`): hij blijft op het moment van aanmaken staan, ook als het record
  wordt gewijzigd. Dat is geen fout van de omzetting maar van de app, en valt hier buiten.
- **Scripts** (`scripts/close-returned-reservations.ts`, `scripts/replace-vehicles-from-rdw.ts`) zetten `updatedAt: new Date()`:
  UTC, hetzelfde als de app.
- **Het nalopen is een momentopname van de code op de branch `feat/besluiten-d`.** Oudere versies van de app, imports en
  handmatige SQL kunnen andere waarden hebben geschreven; de lijst zegt wat de code *nu* doet, niet wat er vroeger gebeurde.

## 7. Wat het script nu wel en niet doet

- `scripts/migrate-timestamps-to-timestamptz.ts` past **één regel** toe op alle kolommen: Europe/Amsterdam. Een regel per
  kolom (bijvoorbeeld `AT TIME ZONE 'UTC'` voor de 38 UTC-kolommen) bestaat er **niet** in; dat zou een kleine
  wijziging van het script en van `startup-migration.js` zijn, en is nog niet gedaan en niet besloten.
- `--report` toont de tabelgroottes, welke kolommen nog omgezet moeten worden en voor vijf tabellen hoeveel rijen een
  verschil van meer dan 50 minuten hebben tussen `created_at` en `updated_at` (een grove schatting van het aantal
  UTC-rijen in een gemengde kolom). Het rapport blijft zoals het is.
- Een omzetting neemt een ACCESS EXCLUSIVE-slot en herschrijft de tabel. Kolommen die al `timestamptz` zijn, worden
  overgeslagen; het script is dus veilig om twee keer te draaien.

## 8. Stappenplan voor Kees

Niets hiervan staat in de branch als uitgevoerd werk; elke stap is een eigen actie, met Kees erbij.

1. **De aannames controleren (productie, alleen lezen).** Open een SQL-venster op de productiedatabase: `SHOW timezone;`
   en kijk of dat Europe/Amsterdam of UTC is. Controleer de zone van de app-container (`date` in de container, of de
   omgevingsvariabele `TZ`). Noteer ook een rij waarvan je het echte tijdstip kent (bijvoorbeeld een document dat je
   vanochtend om 09:15 hebt aangemaakt) en haal de ruwe waarde op: staat er 09:15 (Nederlandse klokstand) of 07:15 (UTC-klokstand)? Dat
   zegt in één keer of "NL" in deze lijst echt Nederlandse klokstand betekent.
2. **Back-up.** App-instellingen → Back-upbeheer → **Nu back-uppen**, wacht op de geslaagde melding, download het bestand en
   bewaar het buiten de server. Schrijf de bestandsnaam op.
3. **Kloon en rapport.** Zet de back-up terug in een aparte, lege database (een kloon, niet productie) en draai daar
   `npx tsx scripts/migrate-timestamps-to-timestamptz.ts --report` (zonder `--apply`). Het rapport blijft zoals het is; lees
   het aantal kolommen, de tabelgroottes (hoelang het herschrijven duurt) en de telling van verschuivende rijen.
4. **De regel per kolom kiezen.** Beslis met deze lijst of de Amsterdam-regel voor alles mag (de 38 UTC-kolommen en de
   gemengde rijen komen dan 1 of 2 uur te vroeg) of dat de zuivere UTC-kolommen een eigen regel krijgen. Klopt aanname 1 niet (de
   database staat op UTC), dan verandert de regel van de NL-kolommen mee. Dit is een besluit van Kees; het script moet
   daarna eventueel worden aangepast.
5. **Oefenen op de kloon.** Draai de omzetting op de kloon (het script weigert `--apply` tenzij de database `lvs_fixtest`
   heet; geef de kloon die naam, of gebruik `--i-know-what-i-am-doing` bewust), meet de duur en controleer in de kloon
   de drie tijden uit stap 7. Pas daarna productie.
6. **Onderhoudsvenster.** Kies een rustig moment buiten kantooruren en buiten 02:00–04:00 (de planners en de nachtelijke
   back-up). Maak vlak ervoor een verse back-up (stap 2). Start de app **één keer** met `TIMESTAMPTZ_MIGRATION=apply`
   (Coolify: omgevingsvariabele, herstart) en volg het containerlog: `B-22: converting … column(s)` en daarna `B-22:
   converted …`. Zet de variabele daarna weer weg. Mislukt een kolom, dan staat dat met naam in het log; de rest is wel
   omgezet en een tweede start probeert alleen de overgebleven kolommen.
7. **Controle met drie bekende tijden.** Vergelijk wat de app laat zien met de klok: (a) het document uit stap 1 onder
   **Reserveringsdocumenten**: het uur moet kloppen; (b) een gebeurtenis die je net zelf deed in het activiteitenlog
   (App-instellingen → Activiteit): wanneer; (c) de tijd van een wijziging die je net maakte, onder **Geschiedenis** van
   die reservering. Controleer ook
   `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND data_type='timestamp without time zone';`:
   alles uit het manifest moet weg zijn.
8. **Terugvallen.** Klopt een van de drie tijden niet, herstel dan de back-up uit stap 6 (Back-upbeheer → Herstellen; alles
   sinds die back-up gaat verloren, dus doe dit snel) en lees de
   aanname in stap 1 opnieuw.
