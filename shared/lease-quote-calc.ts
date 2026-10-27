// Lease price calculation shared by server and client. All amounts excl. btw.
// Results are unrounded; callers round for display/storage with roundCents.

export interface LeaseCostInputs {
  purchasePrice: number;
  interestRatePercent: number;
  robPerYear: number;
  otherCostsPerYear: number;
  insurancePerMonth: number;
  roadTaxPerMonth: number;
  marginPerMonth: number;
}

export interface LeaseVariantInputs {
  termMonths: number;
  kmPerYear: number;
  residualValue: number;
}

export type LeaseWarning = "residual_above_purchase" | "term_missing" | "km_missing";

export interface LeaseVariantResult {
  depreciation: number | null;
  interest: number;
  rob: number;
  insurance: number;
  roadTax: number;
  otherCosts: number;
  margin: number;
  totalPerMonth: number | null;
  costPerKm: number | null;
  robTotalOverTerm: number | null;
  warnings: LeaseWarning[];
}

export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateLeaseVariant(costs: LeaseCostInputs, variant: LeaseVariantInputs): LeaseVariantResult {
  const warnings: LeaseWarning[] = [];
  const termOk = variant.termMonths > 0;
  const kmOk = variant.kmPerYear > 0;
  if (!termOk) warnings.push("term_missing");
  if (!kmOk) warnings.push("km_missing");
  if (variant.residualValue > costs.purchasePrice) warnings.push("residual_above_purchase");

  const depreciation = termOk ? (costs.purchasePrice - variant.residualValue) / variant.termMonths : null;
  // Interest over the full purchase price (as in the Excel), not the average outstanding amount.
  const interest = (costs.purchasePrice * costs.interestRatePercent) / 100 / 12;
  const rob = costs.robPerYear / 12;
  const otherCosts = costs.otherCostsPerYear / 12;
  const insurance = costs.insurancePerMonth;
  const roadTax = costs.roadTaxPerMonth;
  const margin = costs.marginPerMonth;

  const totalPerMonth =
    depreciation === null ? null : depreciation + interest + rob + insurance + roadTax + otherCosts + margin;
  const costPerKm = totalPerMonth !== null && kmOk ? totalPerMonth / (variant.kmPerYear / 12) : null;

  return {
    depreciation,
    interest,
    rob,
    insurance,
    roadTax,
    otherCosts,
    margin,
    totalPerMonth,
    costPerKm,
    robTotalOverTerm: termOk ? (costs.robPerYear * variant.termMonths) / 12 : null,
    warnings,
  };
}

/** Parses Dutch-formatted amounts ("17.318,50", "€ 1.100", "9,5"). Returns null when no number is found. */
export function parseDutchAmount(input: string): number | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[€\s]/g, "");
  if (!/^-?[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
