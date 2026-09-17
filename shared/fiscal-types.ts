/**
 * Fiscal mobility check — the vocabulary shared by server and client.
 *
 * Everything here is a closed list stored as `text` in the database (the
 * schema has no pgEnum) and validated against these constants. Codes are
 * English identifiers; the Dutch labels the screens show live next to them
 * so a code never reaches a user unlabelled.
 *
 * No fiscal *values* live here. Rates, day counts and dates are parameters of
 * a published rule version (see server/services/fiscal/definitions.ts for the
 * definitions and the database for the values).
 */

export const FISCAL_RULE_KEYS = ["pseudo_eindheffing_fossiel"] as const;
export type FiscalRuleKey = (typeof FISCAL_RULE_KEYS)[number];

export const FISCAL_ASSESSMENT_STATUSES = [
  "NOT_APPLICABLE",
  "POSSIBLY_APPLICABLE",
  "APPLICABLE",
  "MANUAL_REVIEW_REQUIRED",
  "DATA_INSUFFICIENT",
  "CONFIGURATION_INVALID",
  "RULE_NOT_AVAILABLE",
] as const;
export type FiscalAssessmentStatus = (typeof FISCAL_ASSESSMENT_STATUSES)[number];

export const FISCAL_STATUS_LABELS: Record<FiscalAssessmentStatus, string> = {
  NOT_APPLICABLE: "Niet van toepassing",
  POSSIBLY_APPLICABLE: "Mogelijk van toepassing",
  APPLICABLE: "Van toepassing",
  MANUAL_REVIEW_REQUIRED: "Handmatige beoordeling nodig",
  DATA_INSUFFICIENT: "Gegevens ontbreken",
  CONFIGURATION_INVALID: "Configuratie ongeldig",
  RULE_NOT_AVAILABLE: "Geen regelversie beschikbaar",
};

export const DATA_QUALITIES = ["complete", "partial", "insufficient"] as const;
export type DataQuality = (typeof DATA_QUALITIES)[number];

export const RULE_VERSION_STATUSES = ["draft", "in_review", "approved", "published", "superseded", "archived", "rejected"] as const;
export type RuleVersionStatus = (typeof RULE_VERSION_STATUSES)[number];

export const RULE_VERSION_STATUS_LABELS: Record<RuleVersionStatus, string> = {
  draft: "Concept",
  in_review: "Ter beoordeling",
  approved: "Goedgekeurd",
  published: "Gepubliceerd",
  superseded: "Vervangen",
  archived: "Gearchiveerd",
  rejected: "Afgewezen",
};

export const REASON_CATEGORIES = ["legislative_change", "correction", "government_guidance", "internal_correction", "other"] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

export const REASON_CATEGORY_LABELS: Record<ReasonCategory, string> = {
  legislative_change: "Wetswijziging",
  correction: "Correctie",
  government_guidance: "Nieuwe overheidsinformatie",
  internal_correction: "Interne configuratiecorrectie",
  other: "Anders",
};

export const LEGAL_STATUSES = ["legal", "internal"] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];

export const PARAMETER_DATA_TYPES = ["decimal", "integer", "boolean", "date", "choice", "list"] as const;
export type ParameterDataType = (typeof PARAMETER_DATA_TYPES)[number];

export const PARAMETER_UNITS = ["percent_per_year", "calendar_days", "years", "date", "boolean", "choice", "list", "count"] as const;
export type ParameterUnit = (typeof PARAMETER_UNITS)[number];

export const PARAMETER_CATEGORIES = ["general", "vehicle", "usage", "rental", "replacement", "transition", "internal"] as const;
export type ParameterCategory = (typeof PARAMETER_CATEGORIES)[number];

// ---- vehicle facts -------------------------------------------------------------

export const FUEL_CATEGORIES = ["fossil", "hybrid", "zero_emission", "unknown"] as const;
export type FuelCategory = (typeof FUEL_CATEGORIES)[number];

export const VALUE_SOURCES = ["rdw", "manual", "vehicle_record", "unknown"] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

// ---- usage periods -------------------------------------------------------------

export const USAGE_TYPES = [
  "business_only",
  "business_commuting",
  "business_private",
  "private",
  "pool",
  "multiple_drivers",
  "temporary_rental",
  "replacement",
  "unknown",
  "manual_review",
  "other",
] as const;
export type UsageType = (typeof USAGE_TYPES)[number];

export const TRI_STATES = ["yes", "no", "unknown"] as const;
export type TriState = (typeof TRI_STATES)[number];

export const REPLACEMENT_REASONS = ["maintenance", "repair", "accident", "breakdown", "tyre_change", "other", "unknown"] as const;
export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number];

export const REPLACEMENT_REASON_LABELS: Record<ReplacementReason, string> = {
  maintenance: "Onderhoud",
  repair: "Reparatie",
  accident: "Schade of ongeval",
  breakdown: "Pech",
  tyre_change: "Bandenwissel",
  other: "Anders",
  unknown: "Onbekend",
};

export const DATE_BASES = ["planned", "actual"] as const;
export type DateBasis = (typeof DATE_BASES)[number];

export const USAGE_SOURCES = ["derived", "manual"] as const;
export const CONFIRMED_BY_KINDS = ["none", "staff", "portal"] as const;
export type ConfirmedByKind = (typeof CONFIRMED_BY_KINDS)[number];

export const CLOSED_REASONS = ["cancelled", "deleted", "out_of_scope"] as const;

// ---- assessments ---------------------------------------------------------------

export const MISSING_DATA_CODES = [
  "vehicle_category_unknown",
  "fuel_category_unknown",
  "first_admission_date_missing",
  "catalog_value_missing",
  "market_value_missing",
  "usage_unknown",
  "private_use_unknown",
  "commuting_unknown",
  "replacement_reason_unknown",
  "transition_status_unknown",
  "vehicle_not_assigned",
  "period_end_open",
  "invalid_dates",
] as const;
export type MissingDataCode = (typeof MISSING_DATA_CODES)[number];

export const MISSING_DATA_LABELS: Record<MissingDataCode, string> = {
  vehicle_category_unknown: "Europese voertuigcategorie onbekend",
  fuel_category_unknown: "Brandstofklasse onbekend",
  first_admission_date_missing: "Datum eerste toelating ontbreekt",
  catalog_value_missing: "Catalogusprijs ontbreekt",
  market_value_missing: "Waarde in het economische verkeer ontbreekt",
  usage_unknown: "Gebruik niet bevestigd",
  private_use_unknown: "Privégebruik niet bevestigd",
  commuting_unknown: "Woon-werkverkeer niet bevestigd",
  replacement_reason_unknown: "Reden van vervanging onbekend",
  transition_status_unknown: "Niet bekend of de auto al vóór de ingangsdatum ter beschikking was gesteld",
  vehicle_not_assigned: "Voertuig nog niet toegewezen",
  period_end_open: "Einddatum nog niet bekend",
  invalid_dates: "Ongeldige datums in de reservering",
};

export const REVIEW_REASON_CODES = [
  "vehicle_category_conflict",
  "pool_or_multiple_drivers",
  "usage_manual_review",
  "replacement_reason_unknown",
  "short_term_spans_year",
  "period_spans_rule_versions",
  "km_threshold_check",
  "invalid_dates",
] as const;
export type ReviewReasonCode = (typeof REVIEW_REASON_CODES)[number];

export const REVIEW_REASON_LABELS: Record<ReviewReasonCode, string> = {
  vehicle_category_conflict: "Voertuigcategorie en voertuigsoort spreken elkaar tegen",
  pool_or_multiple_drivers: "Poolauto of meerdere bestuurders zonder bevestigd gebruik",
  usage_manual_review: "Gebruik gemarkeerd voor handmatige beoordeling",
  replacement_reason_unknown: "Vervanging zonder bekende reden",
  short_term_spans_year: "Kortstondige periode loopt over een jaargrens",
  period_spans_rule_versions: "Periode valt deels buiten de gebruikte regelversie",
  km_threshold_check: "Kilometergrens moet handmatig worden gecontroleerd",
  invalid_dates: "Ongeldige datums",
};

export const NOT_APPLICABLE_REASONS = [
  "customer_type_not_business",
  "vehicle_out_of_scope",
  "zero_emission",
  "driving_school",
  "no_private_use",
  "before_rule",
  "period_closed",
  "fully_exempt",
] as const;
export type NotApplicableReason = (typeof NOT_APPLICABLE_REASONS)[number];

export const MONTH_REASONS = [
  "charged",
  "replacement_exempt",
  "short_term_exempt",
  "transition_exempt",
  "before_rule",
  "after_rule",
] as const;
export type MonthReason = (typeof MONTH_REASONS)[number];

export const ASSESSMENT_TRIGGERS = ["nightly", "manual", "recalculation", "event", "backfill"] as const;
export type AssessmentTrigger = (typeof ASSESSMENT_TRIGGERS)[number];

// ---- review cases ----------------------------------------------------------------

export const REVIEW_CASE_STATUSES = ["open", "in_progress", "resolved", "dismissed"] as const;
export type ReviewCaseStatus = (typeof REVIEW_CASE_STATUSES)[number];

export const REVIEW_RESOLUTIONS = ["data_completed", "confirmed_manually", "not_applicable", "dismissed"] as const;
export type ReviewResolution = (typeof REVIEW_RESOLUTIONS)[number];

// ---- audit -------------------------------------------------------------------------

export const FISCAL_AUDIT_ACTIONS = [
  "draft_created",
  "draft_edited",
  "submitted",
  "approved",
  "rejected",
  "published",
  "superseded",
  "archived",
  "validation_failed",
  "unauthorized_attempt",
  "impact_previewed",
  "recalculation_requested",
  "review_opened",
  "review_assigned",
  "review_resolved",
  "usage_confirmed",
  "usage_overridden",
  "profile_refreshed",
  "profile_overridden",
] as const;
export type FiscalAuditAction = (typeof FISCAL_AUDIT_ACTIONS)[number];

export const FISCAL_AUDIT_ENTITY_TYPES = ["rule_version", "parameter", "assessment", "review_case", "usage_period", "fiscal_profile", "route"] as const;
export type FiscalAuditEntityType = (typeof FISCAL_AUDIT_ENTITY_TYPES)[number];

/** The one scope this implementation supports (00-audit-en-voorstel.md, hoofdstuk 12 of the brief). */
export const FISCAL_SCOPE_GLOBAL = "GLOBAL";

/** Wording that goes with every result, on screen, in reports and in PDFs. */
export const FISCAL_DISCLAIMER =
  "Berekening op basis van de geconfigureerde fiscale regels en de beschikbare gegevens. " +
  "Dit is geen fiscaal advies en geen aangifte; bij twijfel is handmatige beoordeling nodig.";

// ---- customer portal DTOs (docs/fiscaal §4.6) --------------------------------------------------------

export interface PortalFiscalPeriodDto {
  reservationId: number;
  usagePeriodId: number;
  vehicleId: number | null;
  licensePlate: string | null;
  startDate: string;
  endDate: string | null;
  isReplacement: boolean;
  replacementReason: string;
  replacedVehicleText: string | null;
  usageType: string;
  privateUse: string;
  commuting: string;
  providedBeforeCutoff: string;
  providedBeforeCutoffHint: boolean;
  isPool: boolean;
  confirmedByKind: string;
  confirmedAt: string | null;
  reconfirmRequired: boolean;
  /** `null` until the first assessment. */
  status: FiscalAssessmentStatus | null;
  statusLabel: string;
  /** Only present when the customer's dashboard switch is on (besluit F-05). */
  amount?: string | null;
  explanation: string | null;
  missingData: string[];
  reviewReasons: string[];
  ruleVersionTitle: string | null;
  assessedAt: string | null;
  /** The customer can still improve the outcome by answering the usage questions. */
  needsInput: boolean;
}

export interface PortalFiscalVehicleDto {
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  periods: PortalFiscalPeriodDto[];
}

export interface PortalFiscalSummaryDto {
  periods: number;
  needsInput: number;
  unassessed: number;
  byStatus: Record<FiscalAssessmentStatus, number>;
  dashboardEnabled: boolean;
  warningsEnabled: boolean;
  reportsEnabled: boolean;
}
