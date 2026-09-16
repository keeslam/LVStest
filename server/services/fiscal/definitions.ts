/**
 * The fiscal rule register and the definitions of every configurable
 * parameter.
 *
 * A definition says what a parameter means, its type and unit, its bounds and
 * whether it is a statutory value (needs a source) or internal housekeeping.
 * It never holds a value: values belong to a rule version in the database and
 * are only valid once that version is published. The screens build themselves
 * from these definitions, so a parameter is added here, read in the
 * calculation module, and given a value in a new version — never as a
 * constant somewhere else. A test (definitions.test.ts) keeps the calculation
 * module and this list in step.
 */
import type {
  FiscalRuleKey,
  LegalStatus,
  ParameterCategory,
  ParameterDataType,
  ParameterUnit,
} from "../../../shared/fiscal-types";
import { REPLACEMENT_REASONS } from "../../../shared/fiscal-types";

export interface FiscalRuleDefinition {
  key: FiscalRuleKey;
  displayName: string;
  description: string;
}

export interface FiscalParameterDefinition {
  key: string;
  ruleKey: FiscalRuleKey;
  displayName: string;
  description: string;
  category: ParameterCategory;
  dataType: ParameterDataType;
  unit: ParameterUnit;
  legalStatus: LegalStatus;
  required: boolean;
  /** Who reads it: the pure calculation module, the assessment layer around it, or the notification logic. */
  usedBy: "rule" | "assess" | "notifications";
  min?: number;
  max?: number;
  decimals?: number;
  allowedValues?: readonly string[];
}

export const FISCAL_RULES: readonly FiscalRuleDefinition[] = [
  {
    key: "pseudo_eindheffing_fossiel",
    displayName: "Pseudo-eindheffing fossiele personenauto's",
    description:
      "Heffing voor werkgevers die een personenauto die niet volledig emissievrij is mede voor privédoeleinden " +
      "(inclusief woon-werkverkeer) ter beschikking stellen aan een werknemer. Artikel 32bc Wet op de loonbelasting 1964.",
  },
];

const RULE: FiscalRuleKey = "pseudo_eindheffing_fossiel";

export const EUROPEAN_CATEGORIES = ["M1", "M2", "M3", "N1", "N2", "N3", "L", "O", "T", "other"] as const;

export const FISCAL_PARAMETER_DEFINITIONS: readonly FiscalParameterDefinition[] = [
  // ---- general -------------------------------------------------------------------
  {
    key: "PSEUDO_ENDHEFFING_RATE",
    ruleKey: RULE,
    displayName: "Heffingspercentage pseudo-eindheffing",
    description:
      "Percentage per jaar over de grondslag (de catalogusprijs of, boven de leeftijdsgrens, de waarde in het economische verkeer). " +
      "Vul een procent in: 12 betekent 12 %, niet 0,12.",
    category: "general",
    dataType: "decimal",
    unit: "percent_per_year",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    min: 0,
    max: 100,
    decimals: 2,
  },
  {
    key: "CALCULATION_PERIOD_UNIT",
    ruleKey: RULE,
    displayName: "Tijdvak van de heffing",
    description: "De eenheid waarover de heffing wordt berekend: per kalendermaand (het jaarpercentage gedeeld door twaalf) of per kalenderdag.",
    category: "general",
    dataType: "choice",
    unit: "choice",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: ["calendar_month", "calendar_day"],
  },
  {
    key: "PARTIAL_PERIOD_RULE",
    ruleKey: RULE,
    displayName: "Gedeeltelijk tijdvak",
    description:
      "Wat er gebeurt als de auto maar een deel van het tijdvak ter beschikking staat: het hele tijdvak telt (één dag is een hele maand) of naar rato van de dagen.",
    category: "general",
    dataType: "choice",
    unit: "choice",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: ["full_period", "pro_rata"],
  },
  {
    key: "ROUNDING_MODE",
    ruleKey: RULE,
    displayName: "Afronding",
    description: "Hoe een berekend bedrag per tijdvak wordt afgerond. Interne rekeninstelling, geen wettelijke parameter.",
    category: "internal",
    dataType: "choice",
    unit: "choice",
    legalStatus: "internal",
    required: true,
    usedBy: "rule",
    allowedValues: ["half_up_cents"],
  },
  {
    key: "CURRENCY",
    ruleKey: RULE,
    displayName: "Valuta",
    description: "De valuta waarin bedragen worden vastgelegd en getoond. Interne instelling voor de weergave.",
    category: "internal",
    dataType: "choice",
    unit: "choice",
    legalStatus: "internal",
    required: true,
    usedBy: "assess",
    allowedValues: ["EUR"],
  },

  // ---- vehicle ---------------------------------------------------------------------
  {
    key: "BASE_VALUE_KIND",
    ruleKey: RULE,
    displayName: "Grondslag tot en met de leeftijdsgrens",
    description: "Welke waarde de grondslag vormt voor auto's tot en met de leeftijdsgrens: de catalogusprijs inclusief btw en bpm.",
    category: "vehicle",
    dataType: "choice",
    unit: "choice",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: ["catalog_price_incl_vat_bpm"],
  },
  {
    key: "OLDTIMER_AGE_YEARS",
    ruleKey: RULE,
    displayName: "Leeftijdsgrens oudere auto",
    description: "Leeftijd in volle jaren sinds de datum van eerste toelating waarboven niet de catalogusprijs maar een andere grondslag geldt.",
    category: "vehicle",
    dataType: "integer",
    unit: "years",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    min: 0,
    max: 100,
  },
  {
    key: "OLDTIMER_BASE_VALUE_KIND",
    ruleKey: RULE,
    displayName: "Grondslag boven de leeftijdsgrens",
    description: "Welke waarde de grondslag vormt voor auto's boven de leeftijdsgrens: de waarde in het economische verkeer.",
    category: "vehicle",
    dataType: "choice",
    unit: "choice",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: ["market_value"],
  },
  {
    key: "AGE_REFERENCE_MOMENT",
    ruleKey: RULE,
    displayName: "Peilmoment voor de leeftijd",
    description: "Op welk moment de leeftijd van de auto wordt bepaald: aan het begin van elke kalendermaand, aan het begin van het kalenderjaar of aan het begin van de periode.",
    category: "vehicle",
    dataType: "choice",
    unit: "choice",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: ["start_of_month", "start_of_year", "start_of_period"],
  },
  {
    key: "VEHICLE_CATEGORIES_IN_SCOPE",
    ruleKey: RULE,
    displayName: "Voertuigcategorieën binnen de regel",
    description: "De Europese voertuigcategorieën (uit het kentekenregister) waarvoor de heffing geldt, bijvoorbeeld M1 voor personenauto's.",
    category: "vehicle",
    dataType: "list",
    unit: "list",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: EUROPEAN_CATEGORIES,
  },
  {
    key: "ZERO_EMISSION_EXEMPT",
    ruleKey: RULE,
    displayName: "Volledig emissievrij uitgezonderd",
    description: "Of een volledig emissievrije auto buiten de heffing valt.",
    category: "vehicle",
    dataType: "boolean",
    unit: "boolean",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
  },
  {
    key: "ZERO_EMISSION_DEFINITION",
    ruleKey: RULE,
    displayName: "Definitie van emissievrij",
    description: "Hoe wordt bepaald dat een auto volledig emissievrij is: uitsluitend elektrisch of waterstof als brandstof, of een CO₂-uitstoot van nul volgens het kentekenregister.",
    category: "vehicle",
    dataType: "choice",
    unit: "choice",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: ["fuel_electric_or_hydrogen_only", "co2_zero"],
  },
  {
    key: "DRIVING_SCHOOL_MANUAL_EXEMPT",
    ruleKey: RULE,
    displayName: "Handgeschakelde lesauto uitgezonderd",
    description: "Of een handgeschakelde lesauto buiten de heffing valt. Aangekondigd in het wetsvoorstel Overige fiscale maatregelen 2027.",
    category: "vehicle",
    dataType: "boolean",
    unit: "boolean",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
  },

  // ---- usage -------------------------------------------------------------------------
  {
    key: "COMMUTING_COUNTS_AS_PRIVATE",
    ruleKey: RULE,
    displayName: "Woon-werkverkeer telt als privégebruik",
    description: "Of woon-werkverkeer voor deze heffing als privégebruik geldt. Anders dan bij de gewone bijtelling is dat hier het geval.",
    category: "usage",
    dataType: "boolean",
    unit: "boolean",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
  },
  {
    key: "KM_THRESHOLD_APPLIES",
    ruleKey: RULE,
    displayName: "Kilometergrens van toepassing",
    description: "Of een kilometergrens voor privégebruik (zoals de 500-kilometergrens van de bijtelling) meeweegt. Staat die aan, dan kan de applicatie dat niet zelf controleren en vraagt zij handmatige beoordeling.",
    category: "usage",
    dataType: "boolean",
    unit: "boolean",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
  },

  // ---- transition ---------------------------------------------------------------------
  {
    key: "TRANSITION_PROVIDED_BEFORE_DATE",
    ruleKey: RULE,
    displayName: "Overgangsrecht: ter beschikking gesteld vóór",
    description: "Een auto die vóór deze datum aan dezelfde werkgever ter beschikking is gesteld valt onder het overgangsrecht.",
    category: "transition",
    dataType: "date",
    unit: "date",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
  },
  {
    key: "TRANSITION_EXEMPT_UNTIL",
    ruleKey: RULE,
    displayName: "Overgangsrecht: uitgezonderd tot en met",
    description: "Tot en met welke dag een auto onder het overgangsrecht buiten de heffing blijft. Vanaf de dag erna telt de heffing.",
    category: "transition",
    dataType: "date",
    unit: "date",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
  },

  // ---- replacement ----------------------------------------------------------------------
  {
    key: "REPLACEMENT_VEHICLE_EXEMPTION_DAYS",
    ruleKey: RULE,
    displayName: "Vervangend voertuig: vrijstellingsdagen",
    description: "Aantal aaneengesloten kalenderdagen, geteld vanaf de eerste dag van de vervanging, waarin een vervangende auto buiten de heffing blijft. De dagen erna tellen mee.",
    category: "replacement",
    dataType: "integer",
    unit: "calendar_days",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    min: 0,
    max: 366,
  },
  {
    key: "REPLACEMENT_VEHICLE_EXEMPTION_REASONS",
    ruleKey: RULE,
    displayName: "Vervangend voertuig: toegestane redenen",
    description: "De redenen van vervanging waarvoor de vrijstellingsdagen gelden, bijvoorbeeld onderhoud, reparatie, schade of een bandenwissel.",
    category: "replacement",
    dataType: "list",
    unit: "list",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: REPLACEMENT_REASONS.filter((r) => r !== "unknown"),
  },
  {
    key: "REPLACEMENT_VEHICLE_EXEMPTION_UNTIL",
    ruleKey: RULE,
    displayName: "Vervangend voertuig: regel geldig tot en met",
    description: "Laatste dag waarop een vervanging mag beginnen om onder de vrijstellingsdagen te vallen. Leeg als de regel geen einddatum heeft.",
    category: "replacement",
    dataType: "date",
    unit: "date",
    legalStatus: "legal",
    required: false,
    usedBy: "rule",
  },

  // ---- rental (short-term provision) ------------------------------------------------------
  {
    key: "TEMPORARY_RENTAL_EXEMPTION_DAYS",
    ruleKey: RULE,
    displayName: "Kortstondige terbeschikkingstelling: vrijstellingsdagen",
    description: "Maximale lengte in aaneengesloten kalenderdagen van een periode die buiten de heffing blijft. Een periode die langer duurt telt volledig mee.",
    category: "rental",
    dataType: "integer",
    unit: "calendar_days",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    min: 0,
    max: 366,
  },
  {
    key: "TEMPORARY_RENTAL_EXEMPTION_PERIODS_PER_YEAR",
    ruleKey: RULE,
    displayName: "Kortstondig: aantal perioden per kalenderjaar",
    description: "Hoeveel van zulke korte perioden per kalenderjaar buiten de heffing blijven. Daarna tellen ook korte perioden mee.",
    category: "rental",
    dataType: "integer",
    unit: "count",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    min: 0,
    max: 52,
  },
  {
    key: "TEMPORARY_RENTAL_EXEMPTION_SCOPE",
    ruleKey: RULE,
    displayName: "Kortstondig: telt per",
    description: "Waarvoor het aantal perioden wordt bijgehouden: per kenteken bij dezelfde werkgever, per werkgever ongeacht de auto, of per werknemer.",
    category: "rental",
    dataType: "choice",
    unit: "choice",
    legalStatus: "legal",
    required: true,
    usedBy: "rule",
    allowedValues: ["plate_per_employer", "employer", "employee"],
  },
  {
    key: "TEMPORARY_RENTAL_EXEMPTION_UNTIL",
    ruleKey: RULE,
    displayName: "Kortstondig: regel vervalt op",
    description: "Vanaf deze datum geldt de vrijstelling voor kortstondige terbeschikkingstelling niet meer. Leeg als de regel geen einddatum heeft.",
    category: "rental",
    dataType: "date",
    unit: "date",
    legalStatus: "legal",
    required: false,
    usedBy: "rule",
  },

  // ---- internal (assessment and notifications) ---------------------------------------------
  {
    key: "ASSESSMENT_LOOKAHEAD_DAYS",
    ruleKey: RULE,
    displayName: "Nachtelijke beoordeling: vooruitkijken",
    description: "Hoeveel dagen na de beoordelingsdatum een periode zonder einddatum wordt doorgerekend. Interne instelling voor de nachtelijke beoordeling.",
    category: "internal",
    dataType: "integer",
    unit: "calendar_days",
    legalStatus: "internal",
    required: true,
    usedBy: "assess",
    min: 0,
    max: 366,
  },
  {
    key: "WARN_DAYS_BEFORE_REPLACEMENT_LIMIT",
    ruleKey: RULE,
    displayName: "Waarschuwing vóór de vervangingsgrens",
    description: "Hoeveel dagen vóór het einde van de vrijstellingsdagen van een vervanging de klant een waarschuwing krijgt. Interne meldingsinstelling.",
    category: "internal",
    dataType: "integer",
    unit: "calendar_days",
    legalStatus: "internal",
    required: true,
    usedBy: "notifications",
    min: 0,
    max: 30,
  },
  {
    key: "WARN_ON_MONTH_BOUNDARY",
    ruleKey: RULE,
    displayName: "Waarschuwen bij een maandgrens",
    description: "Of de klant een waarschuwing krijgt wanneer een periode een nieuwe kalendermaand ingaat en daarmee een extra tijdvak kost. Interne meldingsinstelling.",
    category: "internal",
    dataType: "boolean",
    unit: "boolean",
    legalStatus: "internal",
    required: true,
    usedBy: "notifications",
  },
];

const BY_KEY = new Map(FISCAL_PARAMETER_DEFINITIONS.map((d) => [d.key, d]));

export function definitionFor(key: string): FiscalParameterDefinition {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Onbekende fiscale parameter: ${key}`);
  return def;
}

export function definitionsForRule(ruleKey: FiscalRuleKey): FiscalParameterDefinition[] {
  return FISCAL_PARAMETER_DEFINITIONS.filter((d) => d.ruleKey === ruleKey);
}

export function ruleDefinition(ruleKey: FiscalRuleKey): FiscalRuleDefinition {
  const rule = FISCAL_RULES.find((r) => r.key === ruleKey);
  if (!rule) throw new Error(`Onbekende fiscale regel: ${ruleKey}`);
  return rule;
}
