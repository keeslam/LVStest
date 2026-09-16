# Inventaris van variabelen: pseudo-eindheffing fossiele personenauto's

Elke variabele die de uitkomst kan beïnvloeden, met: betekenis, of hij juridisch relevant is, waar hij
vandaan komt, of verificatie nodig is, of hij in de berekeningssnapshot hoort, en welke stap van de
rekenmodule hem gebruikt (stapnummers verwijzen naar hoofdstuk 7 van
[00-audit-en-voorstel.md](00-audit-en-voorstel.md)). Bereik is voor alle configureerbare parameters
**GLOBAAL (alle klanten)**.

Kolom "Bron": **CONFIG** = parameter in een regelversie · **RDW** = kentekenregister · **AFGELEID** =
berekend uit andere gegevens · **HANDMATIG** = ingevoerd door kantoor of (indien besloten) klant ·
**RESERVERING** = al aanwezig in de reservering.

## A. Configureerbare parameters (regelversie)

Alle waarden hieronder zijn *voorbeeldwaarden uit de bronnen van 16 september 2026*, geen vastgestelde
waarheid; zie de status per regel in [01-wettelijk-kader.md](01-wettelijk-kader.md). Ze worden in de
eerste **concept**versie ingevuld en pas door publicatie geldig.

| Sleutel | Nederlandse naam | Type, eenheid | Juridisch | Voorbeeldwaarde | Grenzen | Stap |
|---|---|---|---|---|---|---|
| `PSEUDO_ENDHEFFING_RATE` | Heffingspercentage pseudo-eindheffing | decimaal, **procent per jaar** (12 = 12%, niet 0,12) | ja | 12 | 0–100, 2 decimalen | 9 |
| `CALCULATION_PERIOD_UNIT` | Tijdvak | keuze: `calendar_month` \| `calendar_day` | ja | `calendar_month` | — | 9 |
| `PARTIAL_PERIOD_RULE` | Gedeeltelijk tijdvak | keuze: `full_period` (één dag = heel tijdvak) \| `pro_rata` | ja (V5) | `full_period` | — | 9 |
| `BASE_VALUE_KIND` | Grondslag | keuze: `catalog_price_incl_vat_bpm` | ja | `catalog_price_incl_vat_bpm` | — | 8 |
| `OLDTIMER_AGE_YEARS` | Leeftijdsgrens oudere auto | geheel, jaren sinds eerste toelating | ja (V4) | 25 | 0–100 | 8 |
| `OLDTIMER_BASE_VALUE_KIND` | Grondslag boven leeftijdsgrens | keuze: `market_value` | ja | `market_value` | — | 8 |
| `AGE_REFERENCE_MOMENT` | Peilmoment leeftijd | keuze: `start_of_month` \| `start_of_year` \| `start_of_period` | ja (V4) | `start_of_month` | — | 8 |
| `VEHICLE_CATEGORIES_IN_SCOPE` | Voertuigcategorieën binnen de regel | lijst uit `M1, N1, N2, N3, L, other` | ja (V2) | `M1` | ≥ 1 | 2 |
| `ZERO_EMISSION_EXEMPT` | Volledig emissievrij uitgezonderd | ja/nee | ja | ja | — | 2 |
| `ZERO_EMISSION_DEFINITION` | Definitie emissievrij | keuze: `co2_zero` \| `fuel_electric_or_hydrogen_only` | ja (V2) | `fuel_electric_or_hydrogen_only` | — | 2 |
| `COMMUTING_COUNTS_AS_PRIVATE` | Woon-werkverkeer telt als privé | ja/nee | ja | ja | — | 5 |
| `KM_THRESHOLD_APPLIES` | 500-kilometergrens van toepassing | ja/nee | ja | nee | — | 5 |
| `TRANSITION_PROVIDED_BEFORE_DATE` | Overgangsrecht: ter beschikking gesteld vóór | datum | ja | 2027-01-01 | — | 4 |
| `TRANSITION_EXEMPT_UNTIL` | Overgangsrecht: uitgezonderd tot en met | datum | ja (wet 2030-09-17, voorstel 2030-12-31) | 2030-09-17 | ≥ vorige | 4 |
| `REPLACEMENT_VEHICLE_EXEMPTION_DAYS` | Vervangend voertuig: vrijstellingsdagen | geheel, **aaneengesloten kalenderdagen** | ja (voorstel, V7) | 14 | 0–366 | 6 |
| `REPLACEMENT_VEHICLE_EXEMPTION_REASONS` | Vervangend voertuig: toegestane redenen | lijst uit `maintenance, repair, accident, breakdown, tyre_change, other` | ja (V7) | `maintenance, repair, accident, tyre_change` | — | 6 |
| `REPLACEMENT_VEHICLE_EXEMPTION_UNTIL` | Vervangend voertuig: regel geldig tot | datum of leeg | ja (V7) | leeg | — | 6 |
| `TEMPORARY_RENTAL_EXEMPTION_DAYS` | Kortstondige terbeschikkingstelling: vrijstellingsdagen | geheel, **aaneengesloten kalenderdagen** | ja (voorstel, V8) | 7 | 0–366 | 7 |
| `TEMPORARY_RENTAL_EXEMPTION_PERIODS_PER_YEAR` | Kortstondig: aantal perioden per kalenderjaar | geheel | ja (V8) | 1 | 0–52 | 7 |
| `TEMPORARY_RENTAL_EXEMPTION_SCOPE` | Kortstondig: telt per | keuze: `plate_per_employer` \| `employee` \| `employer` | ja (V8) | `plate_per_employer` | — | 7 |
| `TEMPORARY_RENTAL_EXEMPTION_UNTIL` | Kortstondig: regel geldig tot | datum | ja (voorstel) | 2031-01-01 | — | 7 |
| `DRIVING_SCHOOL_MANUAL_EXEMPT` | Handgeschakelde lesauto uitgezonderd | ja/nee | ja (voorstel) | ja | — | 2 |
| `ROUNDING_MODE` | Afronding | keuze: `half_up_cents` | intern | `half_up_cents` | — | 9 |
| `CURRENCY` | Valuta | tekst | intern | `EUR` | — | 9 |
| `ASSESSMENT_LOOKAHEAD_DAYS` | Nachtelijke beoordeling: vooruitkijken | geheel, dagen | intern | 31 | 0–366 | taak |
| `WARN_DAYS_BEFORE_REPLACEMENT_LIMIT` | Waarschuwing vóór de vervangingsgrens | geheel, dagen | intern | 3 | 0–30 | meldingen |
| `WARN_ON_MONTH_BOUNDARY` | Waarschuwen bij maandgrens | ja/nee | intern | ja | — | meldingen |

Regels voor elke parameter: één definitie in `server/services/fiscal/definitions.ts` (naam, uitleg,
type, eenheid, grenzen, juridisch/intern, verplicht); één waarde per regelversie; juridische
parameters vereisen bron en referentie; elke waarde inclusief eenheid en bron in de snapshot van elke
beoordeling. Percentages worden overal als *procent* opgeslagen en getoond (12, niet 0,12); de
rekenmodule deelt zelf door 100.

## B. Voertuigvariabelen

| Variabele | Betekenis | Juridisch | Bron | Verificatie | Snapshot | Stap |
|---|---|---|---|---|---|---|
| Kenteken | Sleutel naar RDW en naar "per kenteken"-regels | ja | `vehicles.license_plate` (genormaliseerd via `normaliseLicensePlate`) | nee | ja | 7 |
| Europese voertuigcategorie | M1 personenauto, N1 bestelauto, … | ja | RDW `europese_voertuigcategorie` → profiel `european_category` | ja bij ontbreken of conflict | ja | 2 |
| Voertuigsoort (RDW) | "Personenauto", "Bedrijfsauto", … onvertaald | ja (kruiscontrole) | RDW `voertuigsoort` → profiel `vehicle_kind` (het vertaalde `vehicles.vehicle_type` wordt niet gebruikt) | bij conflict met categorie | ja | 2 |
| Brandstof(fen) | Alle brandstofrijen van de auto | ja | RDW dataset `8ys7-d773` → profiel `rdw_raw.fuels[]` | nee | ja | 2 |
| Brandstofklasse | `fossil`, `hybrid`, `zero_emission`, `unknown` | ja | AFGELEID uit brandstofrijen volgens `ZERO_EMISSION_DEFINITION` | ja bij `unknown` | ja | 2 |
| CO₂-uitstoot (g/km) | Ondersteunt de emissievrij-toets | ja | RDW `co2_uitstoot_gecombineerd` (of WLTP-veld) → `co2_g_km` | nee | ja | 2 |
| Datum eerste toelating | Basis voor leeftijd | ja | RDW `datum_eerste_toelating` → profiel `first_admission_date` (`vehicles.production_date` alleen als terugval) | ja bij ontbreken | ja | 8 |
| Leeftijd op peilmoment | Jaren sinds eerste toelating | ja | AFGELEID (`calendar.ts`) | nee | ja | 8 |
| Catalogusprijs | Grondslag ≤ leeftijdsgrens (incl. btw en bpm) | ja | RDW `catalogusprijs` of HANDMATIG (met bron) → `catalog_value`, `catalog_value_source` | ja bij handmatig; altijd bij ontbreken | ja | 8 |
| Waarde economisch verkeer | Grondslag > leeftijdsgrens | ja | HANDMATIG → `market_value` | ja | ja | 8 |
| Handgeschakelde lesauto | Uitzondering | ja (voorstel) | HANDMATIG → `is_driving_school_manual` | ja | ja | 2 |
| RDW opgehaald op / geverifieerd op | Herkomst en versheid | nee (wel bewijs) | profiel `rdw_retrieved_at`, `rdw_verified_at/by` | — | ja | alle |
| Originele RDW-waarden | Reproduceerbaarheid | nee (wel bewijs) | profiel `rdw_raw` | — | ja | alle |
| Handmatige overschrijvingen | Welke velden, door wie, waarom | nee (wel bewijs) | profiel `manual_override` | — | ja | alle |

Niet gebruikt in versie 1 maar wel geïnventariseerd: massa, inrichting/carrosserie, zuinigheidslabel,
bruto bpm, datum eerste tenaamstelling in Nederland. Zij worden in `rdw_raw` bewaard voor later.

## C. Gebruiks- en toewijzingsvariabelen

| Variabele | Betekenis | Juridisch | Bron | Verificatie | Snapshot | Stap |
|---|---|---|---|---|---|---|
| Klant (werkgever) | Wie de auto ter beschikking krijgt en de heffing draagt | ja | RESERVERING `customer_id` | nee | ja | alle |
| Klanttype | Zakelijk of particulier | ja (Q1) | `customers.customer_type` | nee | ja | 1 |
| Bestuurder(s) | Werknemer(s) aan wie de auto ter beschikking staat | ja | RESERVERING `driver_id` + `reservation_driver_assignments` | nee | ja | 5 |
| Meerdere bestuurders | Meer dan één bestuurder in de periode | ja | AFGELEID uit bestuurdershistorie | ja bij onbevestigd gebruik | ja | 5 |
| Poolauto | Geen vaste bestuurder | ja | HANDMATIG `is_pool` (voorstel: voorinvulling als geen bestuurder) | ja | ja | 5 |
| Gebruikstype | `business_only`, `business_commuting`, `business_private`, `private`, `pool`, `multiple_drivers`, `temporary_rental`, `replacement`, `unknown`, `manual_review`, `other` | ja | HANDMATIG `usage_type`, voorinvulling uit reservering | ja | ja | 5 |
| Privégebruik | Ja, nee, onbekend | ja | HANDMATIG `private_use` | ja | ja | 5 |
| Woon-werkverkeer | Ja, nee, onbekend | ja | HANDMATIG `commuting` | ja | ja | 5 |
| Bevestigd door | Kantoor, portaal, niemand | nee (wel bewijs) | `confirmed_by_kind/id/at` | — | ja | 5 |
| Periode: begin | Eerste dag ter beschikking | ja | RESERVERING `start_date` (of `actual_pickup_date` als eerder/later; keuze vast te leggen bij STOP 2) | nee | ja | 3, 6, 7, 9 |
| Periode: einde | Laatste dag; leeg = nog lopend | ja | RESERVERING `end_date` / `actual_return_date` | nee | ja | 3, 6, 7, 9 |
| Open einde | Beoordeling tot beoordelingsdatum, gemarkeerd als voorlopig | ja | AFGELEID | nee | ja | 9 |
| Kalenderdagen in periode | Begin- en einddag inclusief | ja | AFGELEID (`calendar.ts`) | nee | ja | 6, 7 |
| Aangeraakte kalendermaanden | Elke maand met ≥ 1 dag | ja | AFGELEID | nee | ja | 9 |
| Kalenderjaar | Voor "per kalenderjaar"-tellingen en maandgrenzen | ja | AFGELEID | nee | ja | 7 |
| Aaneengesloten dagen | Voor de 14- en 7-dagenregels | ja | AFGELEID | nee | ja | 6, 7 |
| Eerdere kortstondige perioden | Zelfde kenteken, zelfde klant, zelfde kalenderjaar | ja | AFGELEID uit eerdere gebruiksperioden | nee | ja (verwijzingen) | 7 |
| Vóór 2027 ter beschikking gesteld | Overgangsrecht | ja | HANDMATIG `provided_before_cutoff`; voorinvulling als er een aaneengesloten eerdere reservering van dezelfde auto bij dezelfde klant is | ja | ja | 4 |
| Vervanging | De huur vervangt een andere auto | ja | RESERVERING `type = replacement` of HANDMATIG `is_replacement` | ja bij handmatig | ja | 6 |
| Reden van vervanging | Onderhoud, reparatie, ongeval, pech, bandenwissel, anders, onbekend | ja | AFGELEID uit `maintenance_category` van het blok, anders HANDMATIG | ja bij `unknown` | ja | 6 |
| Vervangen auto | Van Lam (reserveringsverwijzing) of van de klant (tekst) | ja | `replaced_reservation_id` / `replaced_vehicle_text` | nee | ja | 6 |
| Placeholder / auto nog onbekend | Transport gepland, vervanger nog niet gekozen | ja | RESERVERING `placeholder_spare`, transport `related_vehicle_id` leeg | — | ja | 1 (→ `DATA_INSUFFICIENT`) |
| Reservering verwijderd | Prullenbak | nee | `deleted_at` | — | ja | afleiding (periode wordt gesloten, niet verwijderd) |

## D. Klant- en systeemvariabelen

| Variabele | Betekenis | Juridisch | Bron | Snapshot |
|---|---|---|---|---|
| Fiscale schakelaars per klant | Zichtbaarheid en meldingen; **nooit** de parameters | nee | `portal_customer_settings.fiscal_*` | nee (staat los van de beoordeling) |
| Accountrecht `canViewFiscal` | Per portaalaccount ontnemen | nee | `portal_users.permissions` | nee |
| Beoordelingsdatum | Peildatum voor versiekeuze en open einde | ja | kantoordatum (`officeDate`) of expliciet meegegeven | ja |
| Regelversie | Welke versie is gebruikt | ja | AFGELEID (`resolve.ts`) | ja |
| Aanvrager en reden van herberekening | Verantwoording | nee (wel bewijs) | `requested_by`, `request_reason` | ja |

## E. Uitkomstvariabelen (in elke beoordeling vastgelegd)

Status, bedrag (of leeg), aantal geheven maanden, per maand het bedrag en de reden (geheven,
uitgezonderd door vervanging, uitgezonderd kortstondig, overgangsrecht, buiten regel), ontbrekende
gegevens (codes), beoordelingsredenen, gegevenskwaliteit, uitleg in het Nederlands, regelversie,
parameters met eenheid en bron, invoersnapshot, volgnummer en verwijzing naar de vervangen
beoordeling.

Codes voor ontbrekende gegevens (eerste set): `vehicle_category_unknown`, `fuel_category_unknown`,
`first_admission_date_missing`, `catalog_value_missing`, `market_value_missing`,
`usage_unknown`, `private_use_unknown`, `commuting_unknown`, `replacement_reason_unknown`,
`transition_status_unknown`, `vehicle_not_assigned` (placeholder), `period_end_open`,
`customer_type_not_business`, `rule_version_missing`, `configuration_invalid`.
