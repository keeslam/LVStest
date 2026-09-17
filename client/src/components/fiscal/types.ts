/**
 * The shapes the fiscal screens read from the API. Vocabulary and labels come
 * from shared/fiscal-types.ts; these are the row shapes of the routes.
 */
import type { FiscalAssessmentStatus, RuleVersionStatus } from "@shared/fiscal-types";

export interface FiscalParameterDefinition {
  key: string;
  ruleKey: string;
  displayName: string;
  description: string;
  category: string;
  dataType: "decimal" | "integer" | "boolean" | "date" | "choice" | "list";
  unit: string;
  legalStatus: "legal" | "internal";
  required: boolean;
  usedBy: "rule" | "assess" | "notifications";
  min?: number;
  max?: number;
  decimals?: number;
  allowedValues?: readonly string[];
}

export interface FiscalRuleDefinition {
  key: string;
  displayName: string;
  description: string;
}

export interface DefinitionsResponse {
  rules: FiscalRuleDefinition[];
  parameters: FiscalParameterDefinition[];
}

export interface ValidationIssue {
  key: string;
  message: string;
}

export interface VersionValidation {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface RuleVersionRow {
  id: number;
  ruleKey: string;
  versionNumber: number;
  status: RuleVersionStatus;
  title: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  reasonCategory: string;
  reasonText: string;
  sourceOrganisation: string | null;
  sourceUrl: string | null;
  legalReference: string | null;
  sourceVerifiedAt: string | null;
  assumptions: string | null;
  createdByName: string;
  submittedByName: string | null;
  approvedByName: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
  rejectedByName: string | null;
  rejectionReason: string | null;
  supersededById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParameterSource {
  sourceUrl?: string | null;
  sourceReference?: string | null;
}

export interface VersionDetail extends RuleVersionRow {
  values: Record<string, unknown>;
  sources: Record<string, ParameterSource>;
  validation: VersionValidation;
  audit?: AuditEvent[];
}

export interface ConfigurationResponse {
  today: string;
  rules: Array<{
    rule: FiscalRuleDefinition;
    current: VersionDetail | null;
    upcoming: VersionDetail[];
    drafts: VersionDetail[];
    expired: VersionDetail[];
    archived: VersionDetail[];
  }>;
}

export interface OverviewResponse {
  byStatus: Record<FiscalAssessmentStatus, number>;
  openPeriods: number;
  unassessedPeriods: number;
  openReviewCases: number;
  currentVersion: { id: number; title: string; versionNumber: number } | null;
  currentVersionStatus: "ok" | "RULE_NOT_AVAILABLE" | "CONFIGURATION_INVALID";
}

export interface ImpactResult {
  isEstimate: true;
  versionId: number;
  currentVersionId: number | null;
  windowFrom: string;
  windowTo: string;
  computedAt: string;
  customers: number;
  vehicles: number;
  periods: number;
  currentTotal: string;
  draftTotal: string;
  difference: string;
  annualImpact: string;
  monthlyImpact: string;
  manualReview: number;
  dataInsufficient: number;
  byStatus: Record<FiscalAssessmentStatus, number>;
}

export interface ImpactState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: ImpactResult | null;
}

export interface AuditEvent {
  id: number;
  occurredAt: string;
  username: string;
  role: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  ruleVersionId: number | null;
  parameterKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  unit: string | null;
  reasonText: string | null;
  customerId: number | null;
  vehicleId: number | null;
  details: Record<string, unknown> | null;
}

export interface ReviewCaseRow {
  id: number;
  usagePeriodId: number;
  assessmentId: number | null;
  customerId: number;
  vehicleId: number | null;
  reasons: string[];
  status: "open" | "in_progress" | "resolved" | "dismissed";
  assignedToId: number | null;
  assignedToName: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  licensePlate: string | null;
  customerName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  reservationId: number | null;
  assessmentStatus: string | null;
}

export interface AssessmentRow {
  id: number;
  usagePeriodId: number;
  customerId: number;
  vehicleId: number | null;
  reservationId: number | null;
  periodStart: string;
  periodEnd: string | null;
  periodEndEffective: string;
  calculationDate: string;
  ruleVersionId: number | null;
  status: FiscalAssessmentStatus;
  amount: string | null;
  monthsCharged: number;
  months: Array<{ month: string; days: number; charged: boolean; reason: string; amount: string | null }>;
  dataQuality: string;
  explanation: string;
  missingData: string[];
  reviewReasons: string[];
  sequence: number;
  trigger: string;
  createdAt: string;
}

export interface UsagePeriodResponse {
  id: number;
  reservationId: number;
  vehicleId: number | null;
  customerId: number;
  startDate: string;
  endDate: string | null;
  dateBasis: "planned" | "actual";
  usageType: string;
  privateUse: "yes" | "no" | "unknown";
  commuting: "yes" | "no" | "unknown";
  isPool: boolean;
  driverCount: number;
  isReplacement: boolean;
  replacementReason: string;
  replacedVehicleText: string | null;
  providedBeforeCutoff: "yes" | "no" | "unknown";
  providedBeforeCutoffHint: boolean;
  confirmedByKind: "none" | "staff" | "portal";
  confirmedByName: string | null;
  confirmedAt: string | null;
  reconfirmRequired: boolean;
  closedAt: string | null;
  closedReason: string | null;
  notes: string | null;
  latestAssessment: Pick<AssessmentRow, "id" | "status" | "amount" | "explanation" | "missingData" | "reviewReasons"> | null;
}

export interface FiscalProfileResponse {
  id: number;
  vehicleId: number;
  catalogValue: string | null;
  catalogValueSource: string;
  catalogValueVerifiedByName: string | null;
  marketValue: string | null;
  firstAdmissionDate: string | null;
  firstAdmissionSource: string;
  fuelCategory: string;
  co2GKm: number | null;
  europeanCategory: string | null;
  vehicleKind: string | null;
  isDrivingSchoolManual: boolean;
  rdwRetrievedAt: string | null;
  rdwError: string | null;
  manualOverride: Record<string, { value: unknown; byName: string; at: string; reason: string }> | null;
  latestAssessments?: AssessmentRow[];
}
