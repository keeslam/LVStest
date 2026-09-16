/**
 * Pseudo-eindheffing fossiele personenauto's — the pure calculation module.
 *
 * Takes the facts about one period in which a vehicle was made available to a
 * customer, plus the resolved parameters of the rule version that applies on
 * the calculation date, and returns a verdict: a status, the calendar months
 * touched with what happened in each, an amount when one can be computed, and
 * everything a human needs to see why.
 *
 * It knows no database, no clock and no fiscal numbers. Every threshold comes
 * from `params`; a missing fact is reported, never guessed, and a contradiction
 * is handed to a human. The month-by-month classification works per calendar
 * day, so an exemption that ends halfway through a month leaves the rest of
 * that month chargeable, and the partial-period rule decides what a chargeable
 * day costs.
 */
import type {
  DataQuality,
  FiscalAssessmentStatus,
  MissingDataCode,
  MonthReason,
  NotApplicableReason,
  ReplacementReason,
  ReviewReasonCode,
  TriState,
  UsageType,
  FuelCategory,
} from "../../../../shared/fiscal-types";
import type { ParameterSet, ParameterSnapshotEntry } from "../parameters";
import {
  addDays,
  ageInFullYears,
  calendarDaysInclusive,
  compareIso,
  daysInYear,
  isValidIsoDate,
  monthStart,
  monthsTouched,
  yearOf,
  yearStart,
} from "../calendar";

export interface PriorPeriodRef {
  periodId: number;
  startDate: string;
  endDate: string | null;
}

export interface FiscalInput {
  /** yyyy-MM-dd; decides the rule version and the horizon of an open-ended period. */
  calculationDate: string;
  ruleVersion: { effectiveFrom: string; effectiveUntil: string | null };
  customer: { id: number; customerType: string };
  /** `null` while the reservation is a placeholder without a vehicle. */
  vehicle: {
    id: number;
    licensePlate: string | null;
    europeanCategory: string | null;
    vehicleKind: string | null;
    fuelCategory: FuelCategory;
    co2GKm: number | null;
    firstAdmissionDate: string | null;
    catalogValue: string | null;
    marketValue: string | null;
    isDrivingSchoolManual: boolean;
  } | null;
  period: {
    id: number;
    startDate: string;
    endDate: string | null;
    /** The last day that is assessed: `endDate`, or a horizon when the period is still open. */
    endDateEffective: string;
    usageType: UsageType;
    privateUse: TriState;
    commuting: TriState;
    isPool: boolean;
    driverCount: number;
    isReplacement: boolean;
    replacementReason: ReplacementReason;
    providedBeforeCutoff: TriState;
    closedReason: string | null;
  };
  /** Earlier periods that may have used up a per-year exemption, per scope. */
  priorPeriods: {
    samePlate: PriorPeriodRef[];
    sameCustomer: PriorPeriodRef[];
    sameDriver: PriorPeriodRef[];
  };
}

export interface MonthLine {
  month: string;
  days: number;
  charged: boolean;
  reason: MonthReason;
  amount: string | null;
}

export interface VerdictFacts {
  notApplicableReason?: NotApplicableReason;
  baseKind?: "catalog_value" | "market_value";
  baseValue?: string;
  ageYearsAtStart?: number;
  replacementExemptDays?: number;
  shortTermExempt?: boolean;
  shortTermExemptionUsedBy?: number[];
  transitionApplied?: boolean;
  privateUseKnown?: "yes" | "no" | "unknown";
  openEnded: boolean;
  calendarDays: number;
}

export interface Verdict {
  status: FiscalAssessmentStatus;
  months: MonthLine[];
  monthsCharged: number;
  amount: string | null;
  dataQuality: DataQuality;
  missingData: MissingDataCode[];
  reviewReasons: ReviewReasonCode[];
  facts: VerdictFacts;
  parametersUsed: ParameterSnapshotEntry[];
}

const HARD_MISSING: ReadonlySet<MissingDataCode> = new Set<MissingDataCode>([
  "vehicle_category_unknown",
  "fuel_category_unknown",
  "first_admission_date_missing",
  "catalog_value_missing",
  "market_value_missing",
  "vehicle_not_assigned",
  "invalid_dates",
]);

type DayClass = MonthReason | "chargeable";

function centsToString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}${euros}.${rest < 10 ? "0" : ""}${rest}`;
}

function numericToCents(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Geen geldig bedrag: ${value}`);
  return Math.round(n * 100);
}

/** RDW voertuigsoort against the European category: a mismatch is a question for a human, not a decision. */
function kindConflicts(category: string, kind: string | null): boolean {
  if (!kind) return false;
  const k = kind.toLowerCase();
  if (category.startsWith("M")) return /bedrijfsauto|aanhangwagen|oplegger|motorfiets|bromfiets|trekker/.test(k);
  if (category.startsWith("N")) return /personenauto|bus/.test(k);
  return false;
}

function dominantReason(counts: Map<DayClass, number>): MonthReason {
  let best: MonthReason = "charged";
  let bestCount = -1;
  for (const [reason, count] of counts) {
    if (reason === "chargeable") continue;
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

export function evaluatePseudoEindheffing(input: FiscalInput, params: ParameterSet): Verdict {
  const missing = new Set<MissingDataCode>();
  const review = new Set<ReviewReasonCode>();
  const facts: VerdictFacts = { openEnded: input.period.endDate === null, calendarDays: 0 };
  const { period, vehicle, customer } = input;

  const build = (status: FiscalAssessmentStatus, months: MonthLine[], amount: string | null): Verdict => {
    const hard = [...missing].some((m) => HARD_MISSING.has(m));
    const dataQuality: DataQuality = hard ? "insufficient" : missing.size > 0 || facts.openEnded ? "partial" : "complete";
    return {
      status,
      months,
      monthsCharged: months.filter((m) => m.charged).length,
      amount,
      dataQuality,
      missingData: [...missing],
      reviewReasons: [...review],
      facts,
      parametersUsed: params.snapshot(),
    };
  };
  const notApplicable = (reason: NotApplicableReason, months: MonthLine[] = []): Verdict => {
    facts.notApplicableReason = reason;
    return build("NOT_APPLICABLE", months, null);
  };
  const insufficient = (): Verdict => build("DATA_INSUFFICIENT", [], null);

  // ---- 1. is there anything to assess? -------------------------------------------------
  if (period.closedReason) return notApplicable("period_closed");
  if (customer.customerType !== "business") return notApplicable("customer_type_not_business");
  if (!vehicle) {
    missing.add("vehicle_not_assigned");
    return insufficient();
  }
  const start = period.startDate;
  const end = period.endDateEffective;
  if (!isValidIsoDate(start) || !isValidIsoDate(end) || compareIso(start, end) > 0) {
    missing.add("invalid_dates");
    review.add("invalid_dates");
    return insufficient();
  }
  facts.calendarDays = calendarDaysInclusive(start, end);

  // ---- 2. is the vehicle within the rule? ----------------------------------------------
  const categoriesInScope = params.list("VEHICLE_CATEGORIES_IN_SCOPE");
  if (!vehicle.europeanCategory) {
    missing.add("vehicle_category_unknown");
  } else if (!categoriesInScope.includes(vehicle.europeanCategory)) {
    return notApplicable("vehicle_out_of_scope");
  } else if (kindConflicts(vehicle.europeanCategory, vehicle.vehicleKind)) {
    review.add("vehicle_category_conflict");
  }

  const zeroEmissionDefinition = params.choice("ZERO_EMISSION_DEFINITION");
  let isZeroEmission: boolean | null;
  if (zeroEmissionDefinition === "co2_zero") {
    isZeroEmission = vehicle.co2GKm === null ? null : vehicle.co2GKm === 0;
  } else {
    isZeroEmission = vehicle.fuelCategory === "unknown" ? null : vehicle.fuelCategory === "zero_emission";
  }
  if (isZeroEmission === null) {
    missing.add("fuel_category_unknown");
  } else if (isZeroEmission && params.boolean("ZERO_EMISSION_EXEMPT")) {
    return notApplicable("zero_emission");
  }

  if (vehicle.isDrivingSchoolManual && params.boolean("DRIVING_SCHOOL_MANUAL_EXEMPT")) {
    return notApplicable("driving_school");
  }
  if (missing.size > 0) return insufficient();

  // ---- 5. private use ---------------------------------------------------------------------
  const commutingCountsAsPrivate = params.boolean("COMMUTING_COUNTS_AS_PRIVATE");
  const privateYes = period.privateUse === "yes" || (period.commuting === "yes" && commutingCountsAsPrivate);
  const privateNo = period.privateUse === "no" && (period.commuting === "no" || !commutingCountsAsPrivate);
  facts.privateUseKnown = privateYes ? "yes" : privateNo ? "no" : "unknown";
  if (period.usageType === "manual_review") review.add("usage_manual_review");
  if (!privateYes && !privateNo) {
    if (period.privateUse === "unknown") missing.add("private_use_unknown");
    if (commutingCountsAsPrivate && period.commuting === "unknown") missing.add("commuting_unknown");
    if (period.isPool || period.driverCount > 1) review.add("pool_or_multiple_drivers");
  }
  if (params.boolean("KM_THRESHOLD_APPLIES")) review.add("km_threshold_check");
  if (privateNo && review.size === 0) return notApplicable("no_private_use");

  // ---- 3 + 4. the rule's window and the transition rule ------------------------------------
  const ruleFrom = input.ruleVersion.effectiveFrom;
  const ruleUntil = input.ruleVersion.effectiveUntil;
  const transitionCutoff = params.date("TRANSITION_PROVIDED_BEFORE_DATE");
  const transitionUntil = params.date("TRANSITION_EXEMPT_UNTIL");
  let transitionApplies = false;
  if (transitionUntil !== null && compareIso(start, transitionUntil) <= 0) {
    if (transitionCutoff !== null && compareIso(start, transitionCutoff) < 0) {
      // The dates prove it: the period began before the cutoff.
      transitionApplies = true;
    } else if (period.providedBeforeCutoff === "yes") {
      transitionApplies = true;
    } else if (period.providedBeforeCutoff === "unknown") {
      missing.add("transition_status_unknown");
    }
  }
  facts.transitionApplied = transitionApplies;

  // ---- 6. replacement vehicle --------------------------------------------------------------
  let replacementExemptLastDay: string | null = null;
  if (period.isReplacement) {
    if (period.replacementReason === "unknown") {
      review.add("replacement_reason_unknown");
    } else {
      const reasons = params.list("REPLACEMENT_VEHICLE_EXEMPTION_REASONS");
      const exemptDays = params.integer("REPLACEMENT_VEHICLE_EXEMPTION_DAYS");
      const until = params.date("REPLACEMENT_VEHICLE_EXEMPTION_UNTIL");
      const inTime = until === null || compareIso(start, until) <= 0;
      if (reasons.includes(period.replacementReason) && inTime && exemptDays > 0) {
        replacementExemptLastDay = addDays(start, exemptDays - 1);
        facts.replacementExemptDays = Math.min(exemptDays, facts.calendarDays);
      }
    }
  }
  const replacementCoversAll = replacementExemptLastDay !== null && compareIso(replacementExemptLastDay, end) >= 0;

  // ---- 7. short-term provision ---------------------------------------------------------------
  let shortTermExempt = false;
  if (!replacementCoversAll && period.endDate !== null) {
    const limitDays = params.integer("TEMPORARY_RENTAL_EXEMPTION_DAYS");
    const periodsPerYear = params.integer("TEMPORARY_RENTAL_EXEMPTION_PERIODS_PER_YEAR");
    const scope = params.choice("TEMPORARY_RENTAL_EXEMPTION_SCOPE");
    const until = params.date("TEMPORARY_RENTAL_EXEMPTION_UNTIL");
    const inTime = until === null || compareIso(start, until) < 0;
    const lengthDays = calendarDaysInclusive(start, period.endDate);
    if (inTime && limitDays > 0 && lengthDays <= limitDays) {
      if (yearOf(start) !== yearOf(period.endDate)) {
        review.add("short_term_spans_year");
      } else {
        const candidates =
          scope === "plate_per_employer"
            ? input.priorPeriods.samePlate
            : scope === "employer"
              ? input.priorPeriods.sameCustomer
              : input.priorPeriods.sameDriver;
        const year = yearOf(start);
        const usedBy = candidates
          .filter(
            (p) =>
              p.endDate !== null &&
              compareIso(p.startDate, start) < 0 &&
              yearOf(p.startDate) === year &&
              yearOf(p.endDate) === year &&
              calendarDaysInclusive(p.startDate, p.endDate) <= limitDays,
          )
          .map((p) => p.periodId);
        facts.shortTermExemptionUsedBy = usedBy;
        shortTermExempt = usedBy.length < periodsPerYear;
      }
    }
  }
  facts.shortTermExempt = shortTermExempt;

  // ---- day-by-day classification, folded into months ----------------------------------------
  const spans = monthsTouched(start, end);
  const months: MonthLine[] = [];
  const chargeableDaysPerMonth: number[] = [];
  let sawAfterRule = false;
  for (const span of spans) {
    const counts = new Map<DayClass, number>();
    let day = span.firstDay;
    while (compareIso(day, span.lastDay) <= 0) {
      let cls: DayClass;
      if (compareIso(day, ruleFrom) < 0) cls = "before_rule";
      else if (ruleUntil !== null && compareIso(day, ruleUntil) > 0) cls = "after_rule";
      else if (transitionApplies && transitionUntil !== null && compareIso(day, transitionUntil) <= 0) cls = "transition_exempt";
      else if (replacementExemptLastDay !== null && compareIso(day, replacementExemptLastDay) <= 0) cls = "replacement_exempt";
      else if (shortTermExempt) cls = "short_term_exempt";
      else cls = "chargeable";
      counts.set(cls, (counts.get(cls) ?? 0) + 1);
      day = addDays(day, 1);
    }
    if ((counts.get("after_rule") ?? 0) > 0) sawAfterRule = true;
    const chargeable = counts.get("chargeable") ?? 0;
    chargeableDaysPerMonth.push(chargeable);
    months.push({
      month: span.month,
      days: span.days,
      charged: chargeable > 0,
      reason: chargeable > 0 ? "charged" : dominantReason(counts),
      amount: null,
    });
  }
  if (sawAfterRule && months.some((m) => m.charged)) review.add("period_spans_rule_versions");

  // ---- 8 + 9. base value and amount, only for charged months --------------------------------
  let totalCents: number | null = null;
  if (months.some((m) => m.charged)) {
    if (!vehicle.firstAdmissionDate) {
      missing.add("first_admission_date_missing");
    } else {
      const ageLimit = params.integer("OLDTIMER_AGE_YEARS");
      const ageMoment = params.choice("AGE_REFERENCE_MOMENT");
      const youngBase = params.choice("BASE_VALUE_KIND");
      const oldBase = params.choice("OLDTIMER_BASE_VALUE_KIND");
      const rate = params.decimal("PSEUDO_ENDHEFFING_RATE");
      const periodUnit = params.choice("CALCULATION_PERIOD_UNIT");
      const partialRule = params.choice("PARTIAL_PERIOD_RULE");
      const rounding = params.choice("ROUNDING_MODE");
      totalCents = 0;
      facts.ageYearsAtStart = ageInFullYears(vehicle.firstAdmissionDate, start);
      spans.forEach((span, i) => {
        const line = months[i];
        if (!line.charged) return;
        const reference =
          ageMoment === "start_of_month" ? monthStart(span.firstDay) : ageMoment === "start_of_year" ? yearStart(span.firstDay) : start;
        const age = ageInFullYears(vehicle.firstAdmissionDate!, reference);
        const useOld = age > ageLimit;
        const baseKind: "catalog_value" | "market_value" = useOld
          ? oldBase === "market_value"
            ? "market_value"
            : "catalog_value"
          : youngBase === "catalog_price_incl_vat_bpm"
            ? "catalog_value"
            : "market_value";
        const baseValue = baseKind === "market_value" ? vehicle.marketValue : vehicle.catalogValue;
        if (facts.baseKind === undefined) facts.baseKind = baseKind;
        if (baseValue === null) {
          missing.add(baseKind === "market_value" ? "market_value_missing" : "catalog_value_missing");
          return;
        }
        if (facts.baseValue === undefined) facts.baseValue = baseValue;
        const baseCents = numericToCents(baseValue);
        const chargeableDays = chargeableDaysPerMonth[i];
        let raw: number;
        if (periodUnit === "calendar_day") {
          raw = (baseCents * rate * chargeableDays) / (100 * daysInYear(yearOf(span.firstDay)));
        } else if (partialRule === "pro_rata") {
          raw = (baseCents * rate * chargeableDays) / (1200 * span.daysInMonth);
        } else {
          raw = (baseCents * rate) / 1200;
        }
        const cents = rounding === "half_up_cents" ? Math.round(raw) : Math.round(raw);
        line.amount = centsToString(cents);
        totalCents! += cents;
      });
    }
  }

  // ---- status -------------------------------------------------------------------------------
  const hardMissing = [...missing].some((m) => HARD_MISSING.has(m));
  const monthsCharged = months.filter((m) => m.charged).length;
  const amount = hardMissing || totalCents === null || privateNo ? null : centsToString(totalCents);
  if (hardMissing) return build("DATA_INSUFFICIENT", months, null);
  if (review.size > 0) return build("MANUAL_REVIEW_REQUIRED", months, amount);
  if (privateNo) return notApplicable("no_private_use", months);
  if (monthsCharged === 0) {
    return notApplicable(months.every((m) => m.reason === "before_rule") ? "before_rule" : "fully_exempt", months);
  }
  if (missing.size > 0) return build("POSSIBLY_APPLICABLE", months, amount);
  return build("APPLICABLE", months, amount);
}
