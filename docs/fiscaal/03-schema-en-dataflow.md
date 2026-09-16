# Schema en dataflow (STOP POINT 2)

Datum 16 september 2026. Uitwerking van het goedgekeurde voorstel (`00-audit-en-voorstel.md`, besluiten
F-00 t/m F-10). Dit document is de bouwtekening: exacte tabellen, toegestane waarden, toestandsmachines,
de stroom van gegevens per proces, API-contracten en de migratiestap. Er is nog niets gebouwd.

Conventies die gevolgd worden: geen `pgEnum` (tekstkolommen met een allowlist in `shared/`), namen in
`snake_case` in de database en `camelCase` in Drizzle, tijdstempels `timestamptz`, bedragen `numeric`,
foutvorm `{ message }`, rechten via `hasPermission()`. Afwijking, bewust: perioden en peildatums in de
nieuwe tabellen zijn echte `date`-kolommen, omdat de engine op maand- en daggrenzen vergelijkt; de API
wisselt ze uit als `yyyy-MM-dd`.

---

## 1. Tabellen

Notatie: `kolom  type  NN` (not null), `→ tabel` (foreign key), `default`. Alle `id`-kolommen zijn
`serial primary key`. `created_at`/`updated_at` zijn `timestamptz NN default now()`.

### 1.1 `fiscal_rule_versions` (Drizzle `fiscalRuleVersions`)

| Kolom | Type | Opmerking |
|---|---|---|
| `rule_key` | text NN | nu alleen `pseudo_eindheffing_fossiel` (allowlist `FISCAL_RULE_KEYS`) |
| `version_number` | integer NN | oplopend per `rule_key`; **uniek `(rule_key, version_number)`** |
| `status` | text NN default `draft` | zie toestandsmachine §3 |
| `title` | text NN | bijv. "Belastingplan 2026 (wet)" |
| `effective_from` | date | verplicht vanaf `in_review` |
| `effective_until` | date | leeg = open einde; `≥ effective_from` |
| `reason_category` | text NN | `legislative_change` · `correction` · `government_guidance` · `internal_correction` · `other` |
| `reason_text` | text NN | vrije tekst, minimaal 10 tekens |
| `source_organisation` | text | verplicht bij ≥ 1 juridische parameter |
| `source_url` | text | idem; `http(s)://` |
| `legal_reference` | text | bijv. "art. 32bc Wet LB 1964" |
| `source_verified_at` | timestamptz | door wie: `source_verified_by_name` |
| `source_verified_by_name` | text | |
| `assumptions` | text | interpretatienotities |
| `created_by` / `created_by_name` | integer → users (set null) / text NN | naam gedenormaliseerd zoals `audit_logs.username` |
| `submitted_by` / `submitted_by_name` / `submitted_at` | integer / text / timestamptz | |
| `approved_by` / `approved_by_name` / `approved_at` | | |
| `published_by` / `published_by_name` / `published_at` | | |
| `rejected_by` / `rejected_by_name` / `rejected_at` / `rejection_reason` | | |
| `superseded_by_id` | integer → fiscal_rule_versions | gezet door het systeem bij publicatie van de opvolger |
| `archived_at` / `archived_by_name` | timestamptz / text | |

Indexen: `(rule_key, status)`, `(rule_key, effective_from)`.

Invarianten (service én test): per `rule_key` dekt hoogstens één **gepubliceerde** versie een datum;
een gepubliceerde rij is onveranderlijk, met één uitzondering (§3, stap "publiceren"); `effective_until
≥ effective_from`; een versie in `in_review`/`approved`/`published` heeft alle verplichte parameters.

### 1.2 `fiscal_parameter_values` (`fiscalParameterValues`)

| Kolom | Type | Opmerking |
|---|---|---|
| `rule_version_id` | integer NN → fiscal_rule_versions (cascade) | |
| `parameter_key` | text NN | moet bestaan in de definities; **uniek `(rule_version_id, parameter_key)`** |
| `value_decimal` | numeric(14,4) | percentages als procent (12,0000) |
| `value_integer` | integer | |
| `value_boolean` | boolean | |
| `value_date` | date | |
| `value_text` | text | voor `choice` |
| `value_list` | jsonb | `string[]` voor `list`; elk element uit de toegestane waarden |
| `unit` | text NN | gekopieerd uit de definitie (`percent_per_year`, `calendar_days`, `years`, `date`, `boolean`, `choice`, `list`, `text`) |
| `legal_status` | text NN | `legal` · `internal` (uit de definitie) |
| `source_url` / `source_reference` / `source_verified_at` / `source_verified_by_name` | | verplicht voor `legal` bij indienen |
| `notes` | text | |

Invariant: precies één waardekolom gevuld, passend bij het datatype van de definitie; waarde binnen
`min`/`max`/toegestane waarden.

### 1.3 `vehicle_fiscal_profiles` (`vehicleFiscalProfiles`)

| Kolom | Type | Opmerking |
|---|---|---|
| `vehicle_id` | integer NN **uniek** → vehicles (cascade) | |
| `catalog_value` | numeric(12,2) | inclusief btw en bpm |
| `catalog_value_source` | text NN default `unknown` | `rdw` · `manual` · `unknown` |
| `catalog_value_retrieved_at` | timestamptz | RDW-ophaalmoment van deze waarde |
| `catalog_value_verified_at` / `catalog_value_verified_by_name` | | kantoor heeft de waarde gecontroleerd |
| `market_value` | numeric(12,2) | waarde economisch verkeer (boven leeftijdsgrens); altijd handmatig |
| `market_value_note` / `market_value_verified_at` / `market_value_verified_by_name` | | bron en controle |
| `first_admission_date` | date | |
| `first_admission_source` | text NN default `unknown` | `rdw` · `vehicle_record` (uit `vehicles.production_date`) · `manual` · `unknown` |
| `fuel_category` | text NN default `unknown` | `fossil` · `hybrid` · `zero_emission` · `unknown` |
| `fuel_descriptions` | jsonb | `string[]`, alle RDW `brandstof_omschrijving` van de auto, onvertaald |
| `hybrid_class` | text | RDW `klasse_hybride_elektrisch_voertuig` |
| `co2_g_km` | integer | |
| `co2_source_field` | text | welk RDW-veld: `emissie_co2_gecombineerd_wltp` · `co2_uitstoot_gecombineerd` · `emis_co2_gewogen_gecombineerd_wltp` · `co2_uitstoot_gewogen` |
| `european_category` | text | RDW `europese_voertuigcategorie` (`M1`, `N1`, …) |
| `european_category_addition` | text | RDW `europese_voertuigcategorie_toevoeging` |
| `vehicle_kind` | text | RDW `voertuigsoort`, onvertaald |
| `body_type` | text | RDW `inrichting` |
| `is_driving_school_manual` | boolean NN default false | handmatig |
| `rdw_raw` | jsonb | `{ vehicle: {...m9d7-ebf2 rij}, fuels: [...8ys7-d773 rijen], retrievedAt }` |
| `rdw_retrieved_at` | timestamptz | laatste geslaagde ophaling |
| `rdw_error` | text | laatste fout (leeg na succes) |
| `rdw_verified_at` / `rdw_verified_by_name` | | kantoor heeft de RDW-gegevens bekeken |
| `manual_override` | jsonb | `{ [veld]: { value, byName, at, reason } }`; velden uit een vaste lijst |

Indexen: uniek `(vehicle_id)`, `(fuel_category)`, `(european_category)`.

Normalisatie `fuel_category`: alle brandstofrijen elektrisch of waterstof → `zero_emission`; ≥ 1
elektrisch/waterstof én ≥ 1 fossiel, of `hybrid_class` gevuld → `hybrid`; alleen fossiel (benzine,
diesel, lpg, cng, lng, alcohol) → `fossil`; anders `unknown`. De regel `ZERO_EMISSION_DEFINITION` kan de
engine bovendien `co2_g_km = 0` laten meewegen. Handmatige overschrijving wint, met reden.

### 1.4 `vehicle_usage_periods` (`vehicleUsagePeriods`)

| Kolom | Type | Opmerking |
|---|---|---|
| `reservation_id` | integer NN **uniek** → reservations (cascade) | de bron |
| `vehicle_id` | integer → vehicles (set null) | leeg bij placeholder |
| `customer_id` | integer NN → customers (cascade) | |
| `primary_driver_id` | integer → drivers (set null) | `reservations.driver_id` bij afleiding |
| `start_date` / `end_date` | date NN / date | `end_date` leeg = lopend |
| `date_basis` | text NN | `planned` (start/einddatum) · `actual` (ophaal-/innamedatum) |
| `usage_type` | text NN default `unknown` | `business_only` · `business_commuting` · `business_private` · `private` · `pool` · `multiple_drivers` · `temporary_rental` · `replacement` · `unknown` · `manual_review` · `other` |
| `private_use` / `commuting` | text NN default `unknown` | `yes` · `no` · `unknown` |
| `is_pool` | boolean NN default false | |
| `driver_count` | integer NN default 0 | afgeleid uit `reservation_driver_assignments` + `driver_id` |
| `is_replacement` | boolean NN default false | uit `reservations.type = 'replacement'` of handmatig |
| `replacement_reason` | text NN default `unknown` | `maintenance` · `repair` · `accident` · `breakdown` · `tyre_change` · `other` · `unknown` |
| `replaced_reservation_id` | integer → reservations (set null) | vervangen auto van Lam |
| `replaced_vehicle_text` | text | vervangen eigen auto van de klant |
| `provided_before_cutoff` | text NN default `unknown` | `yes` · `no` · `unknown` |
| `provided_before_cutoff_hint` | boolean NN default false | systeem vond een aaneengesloten eerdere huur van dezelfde auto bij dezelfde klant vóór 2027 (F-10) |
| `source` | text NN default `derived` | `derived` · `manual` |
| `derived_at` | timestamptz | laatste afleiding |
| `confirmed_by_kind` | text NN default `none` | `none` · `staff` · `portal` |
| `confirmed_by_id` / `confirmed_by_name` / `confirmed_at` | | |
| `reconfirm_required` | boolean NN default false | afgeleide feiten (datums, auto, bestuurders) veranderden ná een bevestiging |
| `closed_at` / `closed_reason` | timestamptz / text | `cancelled` · `deleted`; de rij blijft bestaan |
| `notes` | text | |

Indexen: uniek `(reservation_id)`, `(customer_id, vehicle_id, start_date)`, `(vehicle_id, start_date)`.

### 1.5 `fiscal_assessments` (`fiscalAssessments`) — onveranderlijk

| Kolom | Type | Opmerking |
|---|---|---|
| `usage_period_id` | integer NN → vehicle_usage_periods | |
| `customer_id` | integer NN | gedenormaliseerd voor snelle lijsten |
| `vehicle_id` / `reservation_id` | integer | |
| `period_start` | date NN | |
| `period_end` | date | zoals in de periode |
| `period_end_effective` | date NN | einde gebruikt bij open einde (`calculation_date` + `ASSESSMENT_LOOKAHEAD_DAYS`) |
| `calculation_date` | date NN | peildatum |
| `rule_key` | text NN | |
| `rule_version_id` | integer → fiscal_rule_versions | leeg bij `RULE_NOT_AVAILABLE` |
| `status` | text NN | de zeven statussen |
| `amount` | numeric(12,2) | leeg als niet berekenbaar |
| `months_charged` | integer NN default 0 | |
| `months` | jsonb NN | `[{ month: "2027-03", charged: true, reason: "charged" \| "replacement_exempt" \| "short_term_exempt" \| "transition_exempt" \| "before_rule" \| "not_private", days: 12, amount: "123.45" }]` |
| `data_quality` | text NN | `complete` · `partial` · `insufficient` |
| `explanation` | text NN | Nederlandse uitleg |
| `missing_data` | jsonb NN default `[]` | codes uit `02-variabelen.md` §E |
| `review_reasons` | jsonb NN default `[]` | |
| `inputs` | jsonb NN | snapshot van profiel, periode, bestuurders, klanttype, eerdere kortstondige perioden |
| `parameters` | jsonb NN | `[{ key, value, unit, legalStatus, sourceUrl }]` |
| `input_hash` | text NN | sha256 over de feiten van de periode en het voertuig, de parameters, de regelversie en de uitkomst (status, maanden, bedrag, ontbrekende gegevens); **niet** over de beoordelingsdatum, de horizon of het versievenster, zodat een nachtelijke beoordeling van een ongewijzigde periode niets schrijft. Gelijk = geen nieuwe rij |
| `sequence` | integer NN default 1 | herberekeningsvolgnummer per periode |
| `supersedes_id` | integer → fiscal_assessments | |
| `trigger` | text NN | `nightly` · `manual` · `recalculation` · `event` · `backfill` |
| `requested_by_id` / `requested_by_name` / `request_reason` | | verplicht bij `recalculation` |

Indexen: `(usage_period_id, sequence)`, `(customer_id, vehicle_id, period_start)`, `(rule_version_id)`,
`(status)`, `(created_at)`. Geen update- of delete-route; de storage-laag heeft alleen `insert` en `select`.

### 1.6 `fiscal_review_cases` (`fiscalReviewCases`)

| Kolom | Type | Opmerking |
|---|---|---|
| `usage_period_id` | integer NN → vehicle_usage_periods | |
| `assessment_id` | integer → fiscal_assessments | de beoordeling die de zaak opende (bijgewerkt naar de laatste) |
| `customer_id` / `vehicle_id` | integer NN / integer | |
| `reasons` | jsonb NN | codes |
| `status` | text NN default `open` | `open` · `in_progress` · `resolved` · `dismissed` |
| `assigned_to_id` / `assigned_to_name` | integer → users / text | |
| `resolution` | text | `data_completed` · `confirmed_manually` · `not_applicable` · `dismissed` |
| `resolution_note` | text | verplicht bij afsluiten |
| `resolved_by_id` / `resolved_by_name` / `resolved_at` | | |

Indexen: `(status)`, `(customer_id)`, en een **partiële unieke index** `(usage_period_id) where status in
('open','in_progress')` (één open zaak per periode; expliciet aangemaakt in de migratiestap).

### 1.7 `fiscal_audit_events` (`fiscalAuditEvents`) — alleen toevoegen

| Kolom | Type | Opmerking |
|---|---|---|
| `occurred_at` | timestamptz NN default now() | |
| `user_id` / `username` / `role` | integer / text NN / text | portaalgebruikers: `username` = e-mail, `role` = `portal_admin` |
| `permission_used` | text | het recht waarmee de route is gepasseerd (of `admin`) |
| `action` | text NN | `draft_created` · `draft_edited` · `submitted` · `approved` · `rejected` · `published` · `superseded` · `archived` · `validation_failed` · `unauthorized_attempt` · `impact_previewed` · `recalculation_requested` · `review_opened` · `review_assigned` · `review_resolved` · `usage_confirmed` · `usage_overridden` · `profile_refreshed` · `profile_overridden` |
| `entity_type` / `entity_id` | text NN / integer | `rule_version` · `parameter` · `assessment` · `review_case` · `usage_period` · `fiscal_profile` |
| `rule_key` / `rule_version_id` / `parameter_key` | | |
| `old_value` / `new_value` / `unit` | text | tekstuele weergave |
| `scope` | text NN default `GLOBAL` | |
| `effective_from` / `effective_until` | date | |
| `reason_category` / `reason_text` / `source_url` | | |
| `customer_id` / `vehicle_id` | integer | |
| `validation_result` | jsonb | `{ ok, errors: [...] }` |
| `ip_address` | text | via `firstUntrustedAddress()` (niet de kwetsbare `getClientIp()`, BUG-082) |
| `details` | jsonb | |

Indexen: `(occurred_at)`, `(rule_version_id)`, `(entity_type, entity_id)`, `(customer_id)`.

### 1.8 Wijziging `portal_customer_settings`

Zes kolommen `boolean NN default false`: `fiscal_mobility_enabled`, `pseudo_eindheffing_enabled`,
`fiscal_dashboard_enabled`, `fiscal_warnings_enabled`, `fiscal_reports_enabled`,
`driver_fiscal_visibility_enabled`. Toegevoegd aan `PortalSettingsFlags` en aan het formulier
`customer-portal-settings-form.tsx` (`FLAGS`). Accountsleutel `canViewFiscal` in `PORTAL_FEATURE_KEYS`;
in `settingsFlags()`: `canViewFiscal: allow("canViewFiscal", s.fiscalMobilityEnabled)`.

---

## 2. Gedeelde constanten en definities

- `shared/fiscal-types.ts`: alle allowlists uit §1 als `as const`-objecten met TS-typen
  (`FiscalAssessmentStatus`, `UsageType`, `ReplacementReason`, `FuelCategory`, `RuleVersionStatus`,
  `ReasonCategory`, `MissingDataCode`, `FiscalAuditAction`, …), de DTO-typen voor kantoor en portaal, en
  de Nederlandse labels voor statussen (`FISCAL_STATUS_LABELS`).
- `server/services/fiscal/definitions.ts`: het regelregister en de parameterdefinities:

```ts
interface FiscalParameterDefinition {
  key: string;                       // bijv. "PSEUDO_ENDHEFFING_RATE"
  ruleKey: "pseudo_eindheffing_fossiel";
  displayName: string;               // "Heffingspercentage pseudo-eindheffing"
  description: string;               // uitleg in het Nederlands
  category: "general" | "vehicle" | "usage" | "rental" | "replacement" | "transition" | "internal";
  dataType: "decimal" | "integer" | "boolean" | "date" | "choice" | "list";
  unit: "percent_per_year" | "calendar_days" | "years" | "date" | "boolean" | "choice" | "list" | "count";
  legalStatus: "legal" | "internal";
  required: boolean;
  min?: number; max?: number; decimals?: number;
  allowedValues?: readonly string[];  // choice/list
  usedInStep: number[];              // hoofdstuk 7 van 00-audit-en-voorstel.md
}
```

De lijst is exact tabel A van `02-variabelen.md` (27 definities). Een test bewaakt dat elke definitie
door de rekenmodule wordt gelezen en dat de rekenmodule geen andere sleutels leest (geen dode of
verborgen parameters).

---

## 3. Toestandsmachine regelversie

```
draft ──submit──▶ in_review ──approve──▶ approved ──publish──▶ published ──(opvolger)──▶ superseded
  │                   │                                            │
  │                   └──reject──▶ rejected (eindtoestand;          └──archive (alleen als
  │                                  "kopieer naar nieuw concept")       effective_until verstreken)──▶ archived
  └──archive──▶ archived
```

- **submit**: vereist `effective_from`, `reason_text`, alle verplichte parameters met geldige waarde,
  bron + referentie voor elke juridische parameter; validatie-uitkomst in de audit (`validation_result`).
- **approve / reject**: alleen vanuit `in_review`; afwijzen vereist `rejection_reason`.
- **publish**: alleen vanuit `approved`; herhaalt de validatie; controleert overlap met andere
  gepubliceerde versies van dezelfde regel. Als de directe voorganger een open `effective_until` heeft
  en zijn `effective_from` vóór de nieuwe ligt, sluit het systeem de voorganger: `effective_until :=
  effective_from − 1 dag`, `status := superseded`, `superseded_by_id := nieuwe id`. **Dit is de enige
  toegestane wijziging van een gepubliceerde rij**, uitsluitend door het systeem, met audit-events
  `published` (nieuw) en `superseded` (oud, met oude en nieuwe `effective_until`). Overlapt de nieuwe
  versie met een gesloten periode van een andere gepubliceerde versie, dan wordt publicatie geweigerd.
  Een gat tussen versies is toegestaan maar wordt in de UI als waarschuwing getoond; op datums in het
  gat is de uitkomst `RULE_NOT_AVAILABLE`.
- **archive**: concept weggooien, of een gepubliceerde versie archiveren die geheel in het verleden ligt.
- Elke andere overgang wordt geweigerd met 409 en geaudit als `validation_failed`.
- Bewerken (`PATCH`) kan alleen in `draft`; parameterwaarden horen bij de versie en volgen dezelfde regel.
- Cache: de opgeloste versie per datum wordt 60 s in het geheugen gehouden (patroon `portal-config.ts`)
  en bij elke publicatie geleegd.

Keuze op datum (`resolveForDate(ruleKey, date)`): `status` in (`published`, `superseded`) en
`effective_from ≤ date` en (`effective_until` leeg of `≥ date`). Nul rijen → `RULE_NOT_AVAILABLE`; meer
dan één → `CONFIGURATION_INVALID` (hoort door de publicatiecontrole onmogelijk te zijn, wordt toch
afgevangen). Een vervangen versie telt mee voor datums binnen haar gesloten venster: dat is de versie
die toen gold.

**Verfijning tijdens de bouw (stap 3).** Een beoordeling kiest de versie niet op de beoordelingsdatum
maar op de **datums van de periode** (`resolveForPeriod(ruleKey, start, einde)`): de vroegste
gepubliceerde versie waarvan het venster de periode raakt. Zo wordt een huur in maart 2027 die vandaag
(2026) wordt beoordeeld onder de versie van 2027 beoordeeld, en een periode die vóór de ingangsdatum
begint en erin doorloopt onder die versie met de eerdere dagen als "vóór de regel". Niets wordt te
vroeg toegepast: een versie geldt uitsluitend voor dagen binnen haar eigen venster. De
beoordelingsdatum blijft vastgelegd in de beoordeling en bepaalt de horizon van een open periode.

---

## 4. Dataflows

### 4.1 Configuratiewijziging (kantoor)

1. `POST /api/fiscal/rule-versions` (`manage_fiscal_configuration`): nieuw concept, optioneel `copyFrom`
   (waarden van een bestaande versie overnemen). Audit `draft_created`.
2. `PATCH .../:id` en `PUT .../:id/parameters` (alleen `draft`): elke gewijzigde parameter geeft een
   audit-event met `old_value`, `new_value`, `unit`. Validatie client (zod, zelfde schema) én server.
3. `POST .../:id/impact`: start het impactvoorbeeld (§4.8); `GET .../:id/impact` pollt.
4. `POST .../:id/submit` → `in_review`; `.../approve` → `approved`; `.../publish` → `published`
   (bevestigingsdialoog toont parameter, oude en nieuwe waarde, ingangs- en einddatum, bereik ALLE
   KLANTEN, aantal geraakte auto's en klanten uit het laatste impactvoorbeeld, bron, reden). Na
   publicatie: cache legen, kantoormelding "regelversie wordt actief per …" (F-06), audit.
5. Geen enkele stap raakt `fiscal_assessments`.

### 4.2 Voertuigprofiel

Bronnen, in volgorde: RDW (`m9d7-ebf2` én `8ys7-d773`, één client `server/utils/rdw-api.ts` uitgebreid
met `fetchRdwFiscalData(plate)`), het voertuigrecord (`vehicles.production_date` als terugval voor de
eerste toelating), handmatige invoer (F-08).

Momenten: (a) voertuig aangemaakt of kenteken gewijzigd → profiel aanmaken en RDW ophalen (fouten
worden in `rdw_error` gezet, nooit een exception naar de gebruiker); (b) knop "RDW opnieuw ophalen";
(c) nachtelijke taak vernieuwt profielen ouder dan 30 dagen, met de bestaande 250 ms pauze per
aanroep; (d) handmatige waarde met reden (`manual_override`, audit `profile_overridden`).

Een profielwijziging wijzigt **nooit** een bestaande beoordeling; zij markeert de open beoordelingszaken
van die auto als "opnieuw te beoordelen" en de eerstvolgende beoordeling (nachtelijk of op verzoek)
maakt een nieuwe rij als de `input_hash` verschilt.

### 4.3 Afleiding gebruiksperioden

Eén functie `syncUsagePeriodForReservation(reservationId)` in `server/services/fiscal/usage-periods.ts`,
aangeroepen vanuit de storage-laag na elke schrijfactie op een reservering:
`createReservation` (`server/database-storage.ts:1749`), `updateReservation` (`:1829`),
`softDeleteReservation` (`:2004`), `deleteReservation` (`:2061`), `restoreDeletedRecord` (`:789`) en
`assignDriverToReservation` (`server/services/driver-assignments.ts:21`). Toewijzing van een vervanger
en het invullen van een placeholder lopen via `updateReservation` en zijn dus gedekt.

Regels:
- Alleen `type in ('standard','replacement')`, `start_date ≥ 2027-01-01` (F-10), `deleted_at` leeg.
  Onderhoudsblokken nooit. Een reservering die buiten deze regels valt maar al een periode heeft, wordt
  gesloten (`closed_at`, `closed_reason`), niet verwijderd.
- Datums: `actual_pickup_date` als gevuld, anders `start_date`; `actual_return_date` als gevuld, anders
  `end_date`; `date_basis` legt vast welke. Ongeldige datum (geen `yyyy-MM-dd`) → geen periode, wel een
  beoordelingszaak met code `invalid_dates`.
- Placeholder (`vehicle_id` leeg) → periode met `vehicle_id` leeg; beoordeling geeft
  `DATA_INSUFFICIENT` (`vehicle_not_assigned`).
- Afgeleide velden worden bij elke sync opnieuw gezet: datums, auto, klant, hoofdbestuurder,
  `driver_count`, `is_replacement` (uit `type`), `replacement_reason` alleen als nog `unknown` (uit
  `maintenance_category` van het blok: `scheduled_maintenance → maintenance`, `repair → repair`),
  `replaced_reservation_id` (uit `replacement_for_reservation_id`), `provided_before_cutoff_hint`.
- Handmatige velden (`usage_type`, `private_use`, `commuting`, `is_pool`, `replacement_reason` na
  invulling, `replaced_vehicle_text`, `provided_before_cutoff`, `notes`) worden nooit overschreven.
  Verandert een afgeleid feit ná een bevestiging, dan `reconfirm_required := true`.
- Annulering (`status = cancelled`) → `closed_reason = cancelled`; de auto is niet ter beschikking gesteld.
- Eerste vulling bij deploy: idempotente stap met markerrij `migration:fiscal_usage_periods_v1` over
  alle reserveringen die aan de regels voldoen (op 16 september 2026 alleen vooruit geplande huren).

### 4.4 Beoordeling

Triggers (F-03): nachtelijke taak 03:30 (klanten met `fiscal_mobility_enabled`, perioden die overlappen
met [vandaag − 45 dagen, vandaag + `ASSESSMENT_LOOKAHEAD_DAYS`]); handmatig (`POST
/api/fiscal/assessments/run` met `customerId` of `vehicleId` of `usagePeriodId`); herberekening (met
reden, maakt altijd een nieuwe rij); event (na `usage_confirmed`, `usage_overridden`,
`profile_overridden`, `review_resolved`: alleen de geraakte periode).

Stappen in `assess.ts`:

```
inputs.ts  ── periode + profiel + bestuurders + klanttype + eerdere kortstondige perioden
            (zelfde kenteken, zelfde klant, zelfde kalenderjaar)  → FiscalInput + missing[]
resolve.ts ── versie op calculation_date → RULE_NOT_AVAILABLE / CONFIGURATION_INVALID
            parameters → ResolvedParameters (getypt, met unit en bron)
rules/pseudo-eindheffing.ts ── evaluate(input, params) → Verdict
            { status, months[], amount, missing[], reviewReasons[], facts{} }   (puur)
explain.ts ── Verdict → Nederlandse uitleg
assess.ts  ── input_hash; gelijk aan laatste rij → niets; anders insert met sequence+1
            → review case openen/bijwerken/sluiten → meldingen (F-06) → audit
```

`calendar.ts` is de enige plek die dagen telt: `calendarDaysInclusive`, `monthsTouched`,
`consecutiveDays`, `ageInYearsAt(firstAdmission, reference, AGE_REFERENCE_MOMENT)`. Kantoordatum via
`officeDate()`.

### 4.5 Beoordelingszaak

Geopend als `status ∈ {MANUAL_REVIEW_REQUIRED, DATA_INSUFFICIENT}` en er geen open zaak voor de periode
is; anders bijgewerkt (`assessment_id`, `reasons`). Afsluiten (`resolved`/`dismissed`) vereist
`resolution` + `resolution_note`, audit `review_resolved`, en start een event-beoordeling. Een zaak sluit
niet vanzelf: als een nieuwe beoordeling `APPLICABLE`/`NOT_APPLICABLE` oplevert terwijl de zaak open
staat, wordt de zaak `resolved` met `resolution = data_completed` en `resolved_by_name = "systeem"`.

### 4.6 Portaal (lezen)

Routes onder `/api/portal/fiscal/*`: `requirePortalUser` → `requireFeature("canViewFiscal")` (plafond
= `fiscal_mobility_enabled`) → bestuurdersrol bovendien `driver_fiscal_visibility_enabled`, anders 403
`PORTAL_FEATURE_DISABLED`. Alle leesfuncties in `server/services/fiscal/portal-storage.ts` nemen
`customerId` en `scope` (bestuurder: perioden waar `primary_driver_id = driverId` of een rij in
`reservation_driver_assignments` bestaat). Alleen de **laatste** beoordeling per periode; nooit
conceptversies; parameterwaarden alleen zoals ze in de uitleg staan; bedragen alleen bij
`fiscal_dashboard_enabled` (F-05), altijd met het label "schatting".

DTO `PortalFiscalVehicleDto`: `{ vehicleId, licensePlate, brand, model, periods: [{ reservationId,
startDate, endDate, status, statusLabel, explanation, ruleVersionTitle, amount?, needsInput: boolean,
missingData: string[] }] }`.

### 4.7 Portaal (bevestigen, F-02)

`PATCH /api/portal/fiscal/reservations/:id/usage` (`requirePortalRole("admin")` + feature): body
`{ privateUse, commuting, providedBeforeCutoff, replacementReason?, replacedVehicleText? }`; alleen
eigen klant (404 anders); schrijft de handmatige velden, `confirmed_by_kind = portal`, `confirmed_at`,
`reconfirm_required = false`; audit `usage_confirmed` (`username` = e-mail, `role = portal_admin`);
event-beoordeling. Kantoor overrulet via `PATCH /api/reservations/:id/usage-period` (audit
`usage_overridden`, `confirmed_by_kind = staff`).

### 4.8 Impactvoorbeeld

Fire-and-forget met statusobject per versie-id (patroon `server/routes/apk-date-changes.ts:19-126`):
`{ running, startedAt, finishedAt, error, result }`. Berekening: alle open perioden van klanten met de
hoofdschakelaar aan die overlappen met het venster [`effective_from`, `effective_until` of +12
maanden]; per periode `evaluate` met de conceptparameters én met de nu gepubliceerde parameters (of
"geen versie"); niets wordt opgeslagen. Resultaat: `{ customers, vehicles, periods, currentTotal,
draftTotal, difference, annualImpact, monthlyImpact, manualReview, dataInsufficient, byStatus,
isEstimate: true, computedAt }`. Audit `impact_previewed`.

### 4.9 Rapporten en PDF

`GET /api/reports/fiscal?customerId=&from=&to=` (`view_reports` + `view_fiscal`): laatste beoordeling
per periode, gegroepeerd per klant en status, met totalen (alleen `APPLICABLE`/`POSSIBLY_APPLICABLE`
tellen mee, apart getoond), regelversies in het bereik. CSV via `downloadCsv`. PDF per beoordeling:
`generateFiscalAssessmentPdf()` in `server/utils/pdf-generator.ts` met een nieuw sjabloontype
`fiscal_assessment`, opgeslagen via `registerGeneratedDocument()` (documenttype `fiscal_assessment`,
gekoppeld aan de auto en de reservering); een nieuwere beoordeling markeert de oudere PDF `is_stale`
(B-05). Vaste disclaimer op elke PDF en elk scherm.

### 4.10 Meldingen (F-06)

Kantoor (`custom_notifications`, `type`): `fiscal_review_required`, `fiscal_data_missing`,
`fiscal_version_active`. Klant (`portal_customer_notifications.notify`, alleen bij
`fiscal_warnings_enabled`, dedupe-tags `fiscal:<periodeId>:<soort>`): `fiscal_data_missing`,
`fiscal_review_by_lam`, `fiscal_limit_warning` (vervanging nadert `REPLACEMENT_VEHICLE_EXEMPTION_DAYS`
binnen `WARN_DAYS_BEFORE_REPLACEMENT_LIMIT`, of periode raakt een maandgrens bij
`WARN_ON_MONTH_BOUNDARY`). Mailsjablonen `portal_fiscal_data_missing`, `portal_fiscal_review`,
`portal_fiscal_limit_warning` geseed via `ensurePortalEmailTemplates()`.

---

## 5. API-contracten (kantoor)

Alle routes `hasPermission(...)`; validatie met zod; fouten `{ message, errors? }`; 409 bij een
geweigerde toestandsovergang; 404 buiten de klant (portaal).

| Route | Body / query | Antwoord |
|---|---|---|
| `GET /api/fiscal/definitions` | — | `FiscalParameterDefinition[]`, `FISCAL_RULE_KEYS` |
| `GET /api/fiscal/configuration` | — | `{ current, upcoming[], drafts[], expired[], invalid[] }` per regel, elk met parameters en labels |
| `GET /api/fiscal/rule-versions?ruleKey=&status=` | — | lijst |
| `GET /api/fiscal/rule-versions/:id` | — | versie + parameters + audit-events van de versie |
| `POST /api/fiscal/rule-versions` | `{ ruleKey, title, reasonCategory, reasonText, copyFromId? }` | versie |
| `PATCH /api/fiscal/rule-versions/:id` | metadata (alleen `draft`) | versie |
| `PUT /api/fiscal/rule-versions/:id/parameters` | `[{ key, value, sourceUrl?, sourceReference?, notes? }]` | parameters + validatie |
| `POST .../submit` · `.../approve` · `.../reject { reason }` · `.../publish { confirm: true }` · `.../archive` | | versie |
| `POST .../impact` · `GET .../impact` | — | statusobject |
| `GET /api/fiscal/audit?ruleVersionId=&entityType=&from=&to=&limit=` | — | events (max 200) |
| `GET /api/fiscal/review-cases?status=&customerId=` · `GET .../:id` | — | zaken met periode en laatste beoordeling |
| `PATCH /api/fiscal/review-cases/:id` | `{ status?, assignedToId?, resolution?, resolutionNote? }` | zaak |
| `GET /api/fiscal/assessments?customerId=&vehicleId=&usagePeriodId=&from=&to=&latestOnly=` | — | beoordelingen |
| `GET /api/fiscal/assessments/:id` | — | beoordeling incl. snapshot |
| `POST /api/fiscal/assessments/run` | `{ customerId? \| vehicleId? \| usagePeriodId? }` | `{ assessed, created, skipped }` |
| `POST /api/fiscal/assessments/recalculate` | `{ usagePeriodId, reason }` | nieuwe beoordeling |
| `GET /api/fiscal/overview` | — | aantallen per status, open zaken, actieve versie |
| `GET /api/vehicles/:id/fiscal-profile` · `PATCH` `{ field, value, reason }` · `POST .../refresh` | | profiel |
| `GET /api/reservations/:id/usage-period` · `PATCH` (handmatige velden) | | periode |
| `GET /api/reports/fiscal?customerId=&from=&to=` | — | rapport |

Portaal: §4.6 en §4.7.

---

## 6. Rechten en labels

`UserPermission`: `VIEW_FISCAL = 'view_fiscal'`, `MANAGE_FISCAL_REVIEW = 'manage_fiscal_review'`,
`MANAGE_FISCAL_CONFIGURATION = 'manage_fiscal_configuration'`, `APPROVE_FISCAL_CONFIGURATION =
'approve_fiscal_configuration'`, `PUBLISH_FISCAL_CONFIGURATION = 'publish_fiscal_configuration'`,
`VIEW_FISCAL_AUDIT_LOG = 'view_fiscal_audit_log'`. Labels in `shared/permission-labels.ts`: "Fiscaal
bekijken", "Fiscale beoordelingen en gegevens beheren", "Fiscale configuratie voorbereiden", "Fiscale
configuratie goedkeuren", "Fiscale configuratie publiceren", "Fiscale auditlog bekijken". Adminbypass
blijft (F-04).

---

## 7. Migratiestap

In `startup-migration.js`, na de portaaltabellen en vóór de laatste manifest-sync:

1. `createTableIfNotExists` voor de zeven tabellen, met foreign keys in de `CREATE TABLE`.
2. `CREATE INDEX IF NOT EXISTS` voor elke index uit §1, inclusief de partiële unieke index op
   `fiscal_review_cases`.
3. `addColumnIfNotExists('portal_customer_settings', …)` voor de zes schakelaars (`boolean NOT NULL
   DEFAULT false`).
4. Markerrij `migration:fiscal_usage_periods_v1`: eerste afleiding van gebruiksperioden (§4.3).
5. `npm run schema:export` in dezelfde commit; de drifttest bewaakt het manifest.

Terugdraaien: de zeven tabellen kunnen worden weggehaald zonder verlies van bestaande gegevens; de zes
kolommen zijn onschadelijk. Test: op een productie-vormige kloon (zoals `lvs_prodtest` bij de vorige
deploy) vóór STOP 7.

---

## 8. Punten die bij dit stopmoment expliciet goedkeuring vragen

| Nr. | Punt | Voorstel |
|---|---|---|
| S2-1 | Bij publicatie sluit het systeem een open voorganger (`effective_until`, `superseded`); de enige wijziging van een gepubliceerde rij, alleen door het systeem, geaudit. | Akkoord. |
| S2-2 | Periodedatums: werkelijke ophaal-/innamedatum als bekend, anders geplande datums; `date_basis` legt vast welke. | Akkoord. |
| S2-3 | `date`-kolommen in de nieuwe tabellen in plaats van de tekstconventie. | Akkoord. |
| S2-4 | Bevestiging door de klant schrijft in dezelfde tabel als kantoor (`confirmed_by_kind = portal`). | Akkoord. |
| S2-5 | Statussen en codes in het Engels in de database (`APPLICABLE`, `unknown`, …), Nederlandse labels in de UI. | Akkoord. |
| S2-6 | Eén open beoordelingszaak per periode; systeem sluit een zaak automatisch zodra de gegevens compleet zijn. | Akkoord. |
| S2-7 | Nachtelijk venster: perioden die overlappen met vandaag − 45 dagen tot vandaag + 31 dagen. | Akkoord. |

---

**HARD STOP: STOP POINT 2.** Na goedkeuring van dit schema en deze dataflow start stap 3: definities,
versiebeheer, resolve, kalender, rekenmodule, uitleg, snapshot en de configuratie-API, met tests.
