/**
 * The first rule version, delivered as a DRAFT with the values from
 * docs/fiscaal/01-wettelijk-kader.md (16 September 2026). It is created
 * once, when no version of the rule exists at all, and it is never
 * published by the system: publication is a human act after the
 * verification points V1–V10 in that document have been walked.
 */
import { db } from "../../db";
import { fiscalRuleVersions } from "../../../shared/schema";
import { eq } from "drizzle-orm";
import { createDraft, setParameters, updateDraft } from "./rule-versions";
import { SYSTEM_ACTOR } from "./assess";

export const SEED_TITLE = "Belastingplan 2026 (wet) — concept, te verifiëren";

const SOURCE_ONDERNEMERSPLEIN = "https://ondernemersplein.overheid.nl/wetswijzigingen/extra-belasting-op-uitstotende-leaseautos/";
const SOURCE_TAXENCE_OFM2027 = "https://www.taxence.nl/nieuws/wetsvoorstel-overige-fiscale-maatregelen-2027/";
const SOURCE_BOVAG = "https://mijn.bovag.nl/dossiers/pseudo-eindheffing";

/** value + the source it came from; `internal` parameters carry no source. */
const SEED_PARAMETERS: Array<{ key: string; value: unknown; sourceUrl?: string; sourceReference?: string; notes?: string }> = [
  { key: "PSEUDO_ENDHEFFING_RATE", value: 12, sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "Belastingplan 2026; art. 32bc Wet LB 1964" },
  { key: "CALCULATION_PERIOD_UNIT", value: "calendar_month", sourceUrl: SOURCE_BOVAG, sourceReference: "BOVAG FAQ — te verifiëren (V5)" },
  { key: "PARTIAL_PERIOD_RULE", value: "full_period", sourceUrl: SOURCE_BOVAG, sourceReference: "BOVAG FAQ: 'ook voor een dag moet voor de hele maand worden betaald' — te verifiëren (V5)" },
  { key: "BASE_VALUE_KIND", value: "catalog_price_incl_vat_bpm", sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "catalogusprijs inclusief btw en bpm" },
  { key: "OLDTIMER_AGE_YEARS", value: 25, sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "boven 25 jaar: waarde in het economische verkeer — peilmoment te verifiëren (V4)" },
  { key: "OLDTIMER_BASE_VALUE_KIND", value: "market_value", sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "waarde in het economische verkeer" },
  { key: "AGE_REFERENCE_MOMENT", value: "start_of_month", sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "aanname, te verifiëren (V4)" },
  { key: "VEHICLE_CATEGORIES_IN_SCOPE", value: ["M1"], sourceUrl: SOURCE_BOVAG, sourceReference: "alleen personenauto's (M1); bestelauto's vallen erbuiten — te verifiëren (V2)" },
  { key: "ZERO_EMISSION_EXEMPT", value: true, sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "volledig elektrisch uitgezonderd" },
  { key: "ZERO_EMISSION_DEFINITION", value: "fuel_electric_or_hydrogen_only", sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "aanname over de definitie, te verifiëren (V2)" },
  { key: "COMMUTING_COUNTS_AS_PRIVATE", value: true, sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "woon-werkverkeer telt hierbij als privégebruik" },
  { key: "KM_THRESHOLD_APPLIES", value: false, sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "de 500-kilometergrens geldt hier niet" },
  { key: "TRANSITION_PROVIDED_BEFORE_DATE", value: "2027-01-01", sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "overgangsrecht voor auto's die vóór 1 januari 2027 ter beschikking zijn gesteld" },
  { key: "TRANSITION_EXEMPT_UNTIL", value: "2030-09-17", sourceUrl: SOURCE_ONDERNEMERSPLEIN, sourceReference: "wet: tot 17 september 2030; wetsvoorstel OFM 2027: tot en met 31 december 2030 (nog niet aangenomen)" },
  { key: "REPLACEMENT_VEHICLE_EXEMPTION_DAYS", value: 14, sourceUrl: SOURCE_TAXENCE_OFM2027, sourceReference: "wetsvoorstel OFM 2027 (15 september 2026), nog niet aangenomen (V7)" },
  { key: "REPLACEMENT_VEHICLE_EXEMPTION_REASONS", value: ["maintenance", "repair", "accident", "tyre_change"], sourceUrl: SOURCE_TAXENCE_OFM2027, sourceReference: "schade, reparatie, onderhoud, bandenwissel — nog niet aangenomen (V7)" },
  { key: "REPLACEMENT_VEHICLE_EXEMPTION_UNTIL", value: null, sourceUrl: SOURCE_TAXENCE_OFM2027, sourceReference: "einddatum onbekend; BOVAG noemt 1 januari 2031 (V7)" },
  { key: "TEMPORARY_RENTAL_EXEMPTION_DAYS", value: 7, sourceUrl: SOURCE_BOVAG, sourceReference: "kamerbrief 22 juni 2026 / wetsvoorstel OFM 2027, nog niet aangenomen (V8)" },
  { key: "TEMPORARY_RENTAL_EXEMPTION_PERIODS_PER_YEAR", value: 1, sourceUrl: SOURCE_BOVAG, sourceReference: "één periode per kalenderjaar (V8)" },
  { key: "TEMPORARY_RENTAL_EXEMPTION_SCOPE", value: "plate_per_employer", sourceUrl: SOURCE_BOVAG, sourceReference: "per kenteken, per werkgever (V8)" },
  { key: "TEMPORARY_RENTAL_EXEMPTION_UNTIL", value: "2031-01-01", sourceUrl: SOURCE_BOVAG, sourceReference: "vervalt per 1 januari 2031 (V8)" },
  { key: "DRIVING_SCHOOL_MANUAL_EXEMPT", value: true, sourceUrl: SOURCE_TAXENCE_OFM2027, sourceReference: "handgeschakelde lesauto's uitgezonderd — nog niet aangenomen" },
  { key: "ROUNDING_MODE", value: "half_up_cents" },
  { key: "CURRENCY", value: "EUR" },
  { key: "ASSESSMENT_LOOKAHEAD_DAYS", value: 31 },
  { key: "WARN_DAYS_BEFORE_REPLACEMENT_LIMIT", value: 3 },
  { key: "WARN_ON_MONTH_BOUNDARY", value: true },
];

const ASSUMPTIONS = [
  "Waarden overgenomen uit docs/fiscaal/01-wettelijk-kader.md (geraadpleegd 16 september 2026).",
  "Vóór publicatie: verificatiepunten V1 t/m V10 nalopen en per parameter de bron controleren.",
  "De 14-dagenregel (vervangend voertuig), de 7-dagenregel (kortstondig), de lesauto-uitzondering en de verlenging van het overgangsrecht tot en met 31 december 2030 komen uit het wetsvoorstel Overige fiscale maatregelen 2027 (ingediend 15 september 2026) en zijn nog geen wet.",
  "Het tijdvak per kalendermaand ('één dag is een hele maand') is alleen bij BOVAG gevonden (V5).",
].join("\n");

export async function ensureFiscalDraftVersion(): Promise<{ created: boolean; versionId: number | null }> {
  const [any] = await db.select({ id: fiscalRuleVersions.id }).from(fiscalRuleVersions).where(eq(fiscalRuleVersions.ruleKey, "pseudo_eindheffing_fossiel")).limit(1);
  if (any) return { created: false, versionId: null };

  const version = await createDraft(
    { ruleKey: "pseudo_eindheffing_fossiel", title: SEED_TITLE, reasonCategory: "legislative_change", reasonText: "Eerste inrichting: Belastingplan 2026, artikel 32bc Wet op de loonbelasting 1964, in werking per 1 januari 2027." },
    SYSTEM_ACTOR,
  );
  await updateDraft(
    version.id,
    {
      effectiveFrom: "2027-01-01",
      sourceOrganisation: "Rijksoverheid / Ondernemersplein",
      sourceUrl: SOURCE_ONDERNEMERSPLEIN,
      legalReference: "Artikel 32bc Wet op de loonbelasting 1964 (Belastingplan 2026)",
      assumptions: ASSUMPTIONS,
    },
    SYSTEM_ACTOR,
  );
  await setParameters(version.id, SEED_PARAMETERS, SYSTEM_ACTOR);
  console.log(`📐 Fiscale regelversie ${version.versionNumber} aangemaakt als concept: "${SEED_TITLE}"`);
  return { created: true, versionId: version.id };
}
