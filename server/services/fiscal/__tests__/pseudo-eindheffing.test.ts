/**
 * The pseudo-eindheffing calculation module, tested as a pure function.
 *
 * Every threshold below comes from TEST_VALUES — a parameter set the test
 * owns. Nothing in these numbers is a claim about the law; they are the values
 * from the sources of 16 September 2026 (docs/fiscaal/01-wettelijk-kader.md),
 * used here only so the arithmetic can be checked by hand:
 * catalogusprijs 36 000 × 12 % / 12 = 360,00 per kalendermaand.
 */
import { describe, it, expect } from "vitest";
import { evaluatePseudoEindheffing, type FiscalInput } from "../rules/pseudo-eindheffing";
import { ParameterSet } from "../parameters";
import { definitionsForRule } from "../definitions";

const TEST_VALUES: Record<string, unknown> = {
  PSEUDO_ENDHEFFING_RATE: 12,
  CALCULATION_PERIOD_UNIT: "calendar_month",
  PARTIAL_PERIOD_RULE: "full_period",
  BASE_VALUE_KIND: "catalog_price_incl_vat_bpm",
  OLDTIMER_AGE_YEARS: 25,
  OLDTIMER_BASE_VALUE_KIND: "market_value",
  AGE_REFERENCE_MOMENT: "start_of_month",
  VEHICLE_CATEGORIES_IN_SCOPE: ["M1"],
  ZERO_EMISSION_EXEMPT: true,
  ZERO_EMISSION_DEFINITION: "fuel_electric_or_hydrogen_only",
  COMMUTING_COUNTS_AS_PRIVATE: true,
  KM_THRESHOLD_APPLIES: false,
  TRANSITION_PROVIDED_BEFORE_DATE: "2027-01-01",
  TRANSITION_EXEMPT_UNTIL: "2030-09-17",
  REPLACEMENT_VEHICLE_EXEMPTION_DAYS: 14,
  REPLACEMENT_VEHICLE_EXEMPTION_REASONS: ["maintenance", "repair", "accident", "tyre_change"],
  REPLACEMENT_VEHICLE_EXEMPTION_UNTIL: null,
  TEMPORARY_RENTAL_EXEMPTION_DAYS: 7,
  TEMPORARY_RENTAL_EXEMPTION_PERIODS_PER_YEAR: 1,
  TEMPORARY_RENTAL_EXEMPTION_SCOPE: "plate_per_employer",
  TEMPORARY_RENTAL_EXEMPTION_UNTIL: "2031-01-01",
  DRIVING_SCHOOL_MANUAL_EXEMPT: true,
  ROUNDING_MODE: "half_up_cents",
  CURRENCY: "EUR",
  ASSESSMENT_LOOKAHEAD_DAYS: 31,
  WARN_DAYS_BEFORE_REPLACEMENT_LIMIT: 3,
  WARN_ON_MONTH_BOUNDARY: true,
};

function params(overrides: Record<string, unknown> = {}): ParameterSet {
  return ParameterSet.fromValues(definitionsForRule("pseudo_eindheffing_fossiel"), { ...TEST_VALUES, ...overrides });
}

type Deep<T> = { [K in keyof T]?: T[K] extends object | null ? Deep<NonNullable<T[K]>> | null : T[K] };

function input(overrides: Deep<FiscalInput> = {}): FiscalInput {
  const base: FiscalInput = {
    calculationDate: "2027-03-15",
    ruleVersion: { effectiveFrom: "2027-01-01", effectiveUntil: null },
    customer: { id: 1, customerType: "business" },
    vehicle: {
      id: 10,
      licensePlate: "AB123C",
      europeanCategory: "M1",
      vehicleKind: "Personenauto",
      fuelCategory: "fossil",
      co2GKm: 120,
      firstAdmissionDate: "2024-05-01",
      catalogValue: "36000.00",
      marketValue: null,
      isDrivingSchoolManual: false,
    },
    period: {
      id: 100,
      startDate: "2027-03-01",
      endDate: "2027-03-31",
      endDateEffective: "2027-03-31",
      usageType: "business_private",
      privateUse: "yes",
      commuting: "unknown",
      isPool: false,
      driverCount: 1,
      isReplacement: false,
      replacementReason: "unknown",
      providedBeforeCutoff: "no",
      closedReason: null,
    },
    priorPeriods: { samePlate: [], sameCustomer: [], sameDriver: [] },
  };
  return {
    ...base,
    ...overrides,
    ruleVersion: { ...base.ruleVersion, ...(overrides.ruleVersion ?? {}) },
    customer: { ...base.customer, ...(overrides.customer ?? {}) },
    vehicle: overrides.vehicle === null ? null : { ...base.vehicle!, ...(overrides.vehicle ?? {}) },
    period: { ...base.period, ...(overrides.period ?? {}) },
    priorPeriods: { ...base.priorPeriods, ...(overrides.priorPeriods ?? {}) },
  } as FiscalInput;
}

describe("pseudo-eindheffing — scope of the rule", () => {
  it("charges a fossil M1 with confirmed private use for the one month it touches", () => {
    const v = evaluatePseudoEindheffing(input(), params());
    expect(v.status).toBe("APPLICABLE");
    expect(v.amount).toBe("360.00");
    expect(v.monthsCharged).toBe(1);
    expect(v.months).toEqual([{ month: "2027-03", days: 31, charged: true, reason: "charged", amount: "360.00" }]);
    expect(v.dataQuality).toBe("complete");
    expect(v.missingData).toEqual([]);
    expect(v.reviewReasons).toEqual([]);
  });

  it("one day in a month charges the whole month: two calendar months cost two months", () => {
    const v = evaluatePseudoEindheffing(input({ period: { startDate: "2027-03-25", endDate: "2027-04-07", endDateEffective: "2027-04-07" } }), params());
    expect(v.status).toBe("APPLICABLE");
    expect(v.months.map((m) => [m.month, m.days, m.charged])).toEqual([["2027-03", 7, true], ["2027-04", 7, true]]);
    expect(v.amount).toBe("720.00");
  });

  it("a fully electric car is not covered", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { fuelCategory: "zero_emission", co2GKm: 0 } }), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.facts.notApplicableReason).toBe("zero_emission");
    expect(v.amount).toBeNull();
  });

  it("a hybrid is covered", () => {
    expect(evaluatePseudoEindheffing(input({ vehicle: { fuelCategory: "hybrid" } }), params()).status).toBe("APPLICABLE");
  });

  it("a van (N1) is outside the configured categories", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { europeanCategory: "N1", vehicleKind: "Bedrijfsauto" } }), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.facts.notApplicableReason).toBe("vehicle_out_of_scope");
  });

  it("an unknown category means the data is insufficient, never a guess", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { europeanCategory: null } }), params());
    expect(v.status).toBe("DATA_INSUFFICIENT");
    expect(v.missingData).toContain("vehicle_category_unknown");
    expect(v.amount).toBeNull();
    expect(v.dataQuality).toBe("insufficient");
  });

  it("an unknown fuel category means the data is insufficient", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { fuelCategory: "unknown" } }), params());
    expect(v.status).toBe("DATA_INSUFFICIENT");
    expect(v.missingData).toContain("fuel_category_unknown");
  });

  it("category and vehicle kind that contradict each other need a human", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { europeanCategory: "M1", vehicleKind: "Bedrijfsauto" } }), params());
    expect(v.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(v.reviewReasons).toContain("vehicle_category_conflict");
  });

  it("a private customer is not an employer", () => {
    const v = evaluatePseudoEindheffing(input({ customer: { customerType: "individual" } }), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.facts.notApplicableReason).toBe("customer_type_not_business");
  });

  it("a manual driving-school car is exempt when the parameter says so", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { isDrivingSchoolManual: true } }), params());
    expect(v.facts.notApplicableReason).toBe("driving_school");
    const w = evaluatePseudoEindheffing(input({ vehicle: { isDrivingSchoolManual: true } }), params({ DRIVING_SCHOOL_MANUAL_EXEMPT: false }));
    expect(w.status).toBe("APPLICABLE");
  });

  it("a placeholder without a vehicle cannot be assessed", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: null }), params());
    expect(v.status).toBe("DATA_INSUFFICIENT");
    expect(v.missingData).toEqual(["vehicle_not_assigned"]);
  });

  it("a closed (cancelled) period was never made available", () => {
    const v = evaluatePseudoEindheffing(input({ period: { closedReason: "cancelled" } }), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.facts.notApplicableReason).toBe("period_closed");
  });

  it("months before the rule's effective date are not charged", () => {
    const only = evaluatePseudoEindheffing(input({ calculationDate: "2026-12-20", period: { startDate: "2026-12-01", endDate: "2026-12-20", endDateEffective: "2026-12-20" } }), params());
    expect(only.status).toBe("NOT_APPLICABLE");
    expect(only.facts.notApplicableReason).toBe("before_rule");

    // A period that began before the cutoff was, by its own dates, provided
    // before the cutoff: the transition rule applies whatever the flag says.
    const spanning = evaluatePseudoEindheffing(input({ calculationDate: "2027-01-15", period: { startDate: "2026-12-20", endDate: "2027-01-10", endDateEffective: "2027-01-10" } }), params());
    expect(spanning.status).toBe("NOT_APPLICABLE");
    expect(spanning.facts.notApplicableReason).toBe("fully_exempt");
    expect(spanning.months.map((m) => [m.month, m.reason])).toEqual([["2026-12", "before_rule"], ["2027-01", "transition_exempt"]]);

    const onCutoff = evaluatePseudoEindheffing(input({ calculationDate: "2027-01-15", period: { startDate: "2027-01-01", endDate: "2027-01-10", endDateEffective: "2027-01-10" } }), params());
    expect(onCutoff.status).toBe("APPLICABLE");
    expect(onCutoff.amount).toBe("360.00");
  });
});

describe("pseudo-eindheffing — private use", () => {
  it("no private use and no commuting means the levy does not apply", () => {
    const v = evaluatePseudoEindheffing(input({ period: { privateUse: "no", commuting: "no" } }), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.facts.notApplicableReason).toBe("no_private_use");
  });

  it("commuting alone counts as private use when the parameter says so", () => {
    const yes = evaluatePseudoEindheffing(input({ period: { privateUse: "no", commuting: "yes" } }), params());
    expect(yes.status).toBe("APPLICABLE");
    const no = evaluatePseudoEindheffing(input({ period: { privateUse: "no", commuting: "yes" } }), params({ COMMUTING_COUNTS_AS_PRIVATE: false }));
    expect(no.status).toBe("NOT_APPLICABLE");
  });

  it("unconfirmed private use gives a possible result with an indicative amount", () => {
    const v = evaluatePseudoEindheffing(input({ period: { privateUse: "unknown", commuting: "unknown" } }), params());
    expect(v.status).toBe("POSSIBLY_APPLICABLE");
    expect(v.amount).toBe("360.00");
    expect(v.missingData).toEqual(expect.arrayContaining(["private_use_unknown", "commuting_unknown"]));
    expect(v.dataQuality).toBe("partial");
  });

  it("a pool car or several drivers without confirmed use needs a human; confirmed use does not", () => {
    const pool = evaluatePseudoEindheffing(input({ period: { isPool: true, privateUse: "unknown" } }), params());
    expect(pool.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(pool.reviewReasons).toContain("pool_or_multiple_drivers");
    const many = evaluatePseudoEindheffing(input({ period: { driverCount: 3, privateUse: "unknown" } }), params());
    expect(many.reviewReasons).toContain("pool_or_multiple_drivers");
    const confirmed = evaluatePseudoEindheffing(input({ period: { driverCount: 3, privateUse: "yes" } }), params());
    expect(confirmed.status).toBe("APPLICABLE");
  });

  it("a period marked for manual review stays with a human", () => {
    const v = evaluatePseudoEindheffing(input({ period: { usageType: "manual_review" } }), params());
    expect(v.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(v.reviewReasons).toContain("usage_manual_review");
  });

  it("a kilometre threshold, when configured to apply, cannot be checked automatically", () => {
    const v = evaluatePseudoEindheffing(input(), params({ KM_THRESHOLD_APPLIES: true }));
    expect(v.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(v.reviewReasons).toContain("km_threshold_check");
  });
});

describe("pseudo-eindheffing — transition rule", () => {
  it("a car provided before the cutoff is exempt until the configured date", () => {
    const v = evaluatePseudoEindheffing(input({ period: { providedBeforeCutoff: "yes" } }), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.facts.notApplicableReason).toBe("fully_exempt");
    expect(v.months[0].reason).toBe("transition_exempt");
  });

  it("the month in which the exemption ends is charged as soon as one day falls after it", () => {
    const v = evaluatePseudoEindheffing(
      input({ calculationDate: "2030-10-01", period: { providedBeforeCutoff: "yes", startDate: "2030-08-20", endDate: "2030-09-30", endDateEffective: "2030-09-30" } }),
      params(),
    );
    expect(v.status).toBe("APPLICABLE");
    expect(v.months.map((m) => [m.month, m.reason])).toEqual([["2030-08", "transition_exempt"], ["2030-09", "charged"]]);
    expect(v.amount).toBe("360.00");
  });

  it("an unknown transition status is a possible result, not a silent assumption", () => {
    const v = evaluatePseudoEindheffing(input({ period: { providedBeforeCutoff: "unknown" } }), params());
    expect(v.status).toBe("POSSIBLY_APPLICABLE");
    expect(v.missingData).toContain("transition_status_unknown");
    expect(v.amount).toBe("360.00");
  });

  it("after the transition end date the transition status no longer matters", () => {
    const v = evaluatePseudoEindheffing(
      input({ calculationDate: "2031-03-15", period: { providedBeforeCutoff: "unknown", startDate: "2031-03-01", endDate: "2031-03-31", endDateEffective: "2031-03-31" } }),
      params(),
    );
    expect(v.status).toBe("APPLICABLE");
    expect(v.missingData).not.toContain("transition_status_unknown");
  });
});

describe("pseudo-eindheffing — replacement vehicle", () => {
  const replacement = (startDate: string, endDate: string, reason = "maintenance") =>
    input({ period: { isReplacement: true, replacementReason: reason as any, startDate, endDate, endDateEffective: endDate, usageType: "replacement" } });

  it("a replacement within the day limit is exempt", () => {
    const v = evaluatePseudoEindheffing(replacement("2027-03-01", "2027-03-10"), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.facts.notApplicableReason).toBe("fully_exempt");
    expect(v.months[0].reason).toBe("replacement_exempt");
    expect(v.facts.replacementExemptDays).toBe(10);
  });

  it("exactly the limit is exempt; one day more charges the month", () => {
    expect(evaluatePseudoEindheffing(replacement("2027-03-01", "2027-03-14"), params()).status).toBe("NOT_APPLICABLE");
    const over = evaluatePseudoEindheffing(replacement("2027-03-01", "2027-03-15"), params());
    expect(over.status).toBe("APPLICABLE");
    expect(over.facts.replacementExemptDays).toBe(14);
    expect(over.amount).toBe("360.00");
  });

  it("exempt days that run into the next month leave that month uncharged when nothing follows", () => {
    const v = evaluatePseudoEindheffing(replacement("2027-03-25", "2027-04-05"), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.months.map((m) => m.reason)).toEqual(["replacement_exempt", "replacement_exempt"]);
  });

  it("a replacement with an unknown reason needs a human", () => {
    const v = evaluatePseudoEindheffing(replacement("2027-03-01", "2027-03-10", "unknown"), params());
    expect(v.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(v.reviewReasons).toContain("replacement_reason_unknown");
  });

  it("a reason outside the configured list gets no exemption", () => {
    const v = evaluatePseudoEindheffing(replacement("2027-03-01", "2027-03-10", "breakdown"), params());
    expect(v.status).toBe("APPLICABLE");
    expect(v.months[0].reason).toBe("charged");
  });

  it("a replacement rule with an end date does not apply after it", () => {
    const v = evaluatePseudoEindheffing(replacement("2027-03-01", "2027-03-10"), params({ REPLACEMENT_VEHICLE_EXEMPTION_UNTIL: "2027-02-28" }));
    expect(v.status).toBe("APPLICABLE");
  });
});

describe("pseudo-eindheffing — short-term provision", () => {
  const short = (startDate: string, endDate: string, prior: FiscalInput["priorPeriods"] = { samePlate: [], sameCustomer: [], sameDriver: [] }) =>
    input({ period: { startDate, endDate, endDateEffective: endDate, usageType: "temporary_rental" }, priorPeriods: prior });

  it("one period within the day limit in a calendar year is exempt", () => {
    const v = evaluatePseudoEindheffing(short("2027-03-01", "2027-03-07"), params());
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.months[0].reason).toBe("short_term_exempt");
  });

  it("one day over the limit is charged", () => {
    const v = evaluatePseudoEindheffing(short("2027-03-01", "2027-03-08"), params());
    expect(v.status).toBe("APPLICABLE");
  });

  it("a second short period of the same plate at the same customer in the same year is charged", () => {
    const prior = { samePlate: [{ periodId: 99, startDate: "2027-01-10", endDate: "2027-01-12" }], sameCustomer: [], sameDriver: [] };
    const v = evaluatePseudoEindheffing(short("2027-03-01", "2027-03-05", prior), params());
    expect(v.status).toBe("APPLICABLE");
    expect(v.facts.shortTermExemptionUsedBy).toEqual([99]);
  });

  it("a prior short period in another calendar year does not use up this year's exemption", () => {
    const prior = { samePlate: [{ periodId: 98, startDate: "2026-12-01", endDate: "2026-12-03" }], sameCustomer: [], sameDriver: [] };
    expect(evaluatePseudoEindheffing(short("2027-03-01", "2027-03-05", prior), params()).status).toBe("NOT_APPLICABLE");
  });

  it("a prior period longer than the limit did not use the exemption", () => {
    const prior = { samePlate: [{ periodId: 97, startDate: "2027-01-10", endDate: "2027-01-30" }], sameCustomer: [], sameDriver: [] };
    expect(evaluatePseudoEindheffing(short("2027-03-01", "2027-03-05", prior), params()).status).toBe("NOT_APPLICABLE");
  });

  it("the exemption is gone after its end date", () => {
    const v = evaluatePseudoEindheffing(
      input({ calculationDate: "2031-02-10", period: { startDate: "2031-02-01", endDate: "2031-02-05", endDateEffective: "2031-02-05" } }),
      params(),
    );
    expect(v.status).toBe("APPLICABLE");
  });

  it("a short period across a year boundary needs a human", () => {
    const v = evaluatePseudoEindheffing(input({ calculationDate: "2028-01-05", period: { startDate: "2027-12-29", endDate: "2028-01-03", endDateEffective: "2028-01-03" } }), params());
    expect(v.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(v.reviewReasons).toContain("short_term_spans_year");
  });

  it("the scope parameter decides which prior periods count", () => {
    const prior = { samePlate: [], sameCustomer: [{ periodId: 96, startDate: "2027-01-10", endDate: "2027-01-12" }], sameDriver: [] };
    expect(evaluatePseudoEindheffing(short("2027-03-01", "2027-03-05", prior), params()).status).toBe("NOT_APPLICABLE");
    expect(evaluatePseudoEindheffing(short("2027-03-01", "2027-03-05", prior), params({ TEMPORARY_RENTAL_EXEMPTION_SCOPE: "employer" })).status).toBe("APPLICABLE");
  });
});

describe("pseudo-eindheffing — base value and amount", () => {
  it("a missing catalogue value blocks the calculation instead of yielding zero", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { catalogValue: null } }), params());
    expect(v.status).toBe("DATA_INSUFFICIENT");
    expect(v.missingData).toContain("catalog_value_missing");
    expect(v.amount).toBeNull();
  });

  it("above the age limit the market value is the base", () => {
    const missing = evaluatePseudoEindheffing(input({ vehicle: { firstAdmissionDate: "2001-01-01" } }), params());
    expect(missing.status).toBe("DATA_INSUFFICIENT");
    expect(missing.missingData).toContain("market_value_missing");
    const v = evaluatePseudoEindheffing(input({ vehicle: { firstAdmissionDate: "2001-01-01", marketValue: "8000.00" } }), params());
    expect(v.status).toBe("APPLICABLE");
    expect(v.amount).toBe("80.00");
    expect(v.facts.baseKind).toBe("market_value");
  });

  it("a missing first admission date blocks the age decision", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { firstAdmissionDate: null } }), params());
    expect(v.status).toBe("DATA_INSUFFICIENT");
    expect(v.missingData).toContain("first_admission_date_missing");
  });

  it("rounds each month to whole cents, half up", () => {
    const v = evaluatePseudoEindheffing(input({ vehicle: { catalogValue: "33333.33" } }), params());
    expect(v.amount).toBe("333.33");
    const w = evaluatePseudoEindheffing(input({ vehicle: { catalogValue: "10000.50" } }), params());
    // 10000,50 × 12 % / 12 = 100,005 → 100,01
    expect(w.amount).toBe("100.01");
  });

  it("pro rata, when configured, charges only the days in the month", () => {
    // Eight days, so the short-term exemption (seven in TEST_VALUES) does not swallow it.
    const v = evaluatePseudoEindheffing(input({ period: { startDate: "2027-03-24", endDate: "2027-03-31", endDateEffective: "2027-03-31" } }), params({ PARTIAL_PERIOD_RULE: "pro_rata" }));
    // 360 × 8 / 31 = 92,90
    expect(v.amount).toBe("92.90");
  });

  it("an open-ended period is assessed up to the effective end and marked as such", () => {
    const v = evaluatePseudoEindheffing(input({ period: { endDate: null, endDateEffective: "2027-04-15" } }), params());
    expect(v.status).toBe("APPLICABLE");
    expect(v.facts.openEnded).toBe(true);
    expect(v.dataQuality).toBe("partial");
    expect(v.months.map((m) => m.month)).toEqual(["2027-03", "2027-04"]);
  });

  it("records the parameters it used, with units, for the snapshot", () => {
    const v = evaluatePseudoEindheffing(input(), params());
    const rate = v.parametersUsed.find((p) => p.key === "PSEUDO_ENDHEFFING_RATE");
    expect(rate).toMatchObject({ value: 12, unit: "percent_per_year", legalStatus: "legal" });
  });
});
