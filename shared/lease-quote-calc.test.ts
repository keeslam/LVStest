import { describe, it, expect } from "vitest";
import { calculateLeaseVariant, parseDutchAmount, roundCents, type LeaseCostInputs } from "./lease-quote-calc";

const costs: LeaseCostInputs = {
  purchasePrice: 17318,
  interestRatePercent: 9,
  robPerYear: 275,
  otherCostsPerYear: 350,
  insurancePerMonth: 97.8,
  roadTaxPerMonth: 34,
  marginPerMonth: 0,
};
const variant = { termMonths: 48, kmPerYear: 20000, residualValue: 10000 };

describe("calculateLeaseVariant", () => {
  it("matches Kees's Excel", () => {
    const r = calculateLeaseVariant(costs, variant);
    expect(roundCents(r.totalPerMonth!)).toBe(466.23);
    expect(roundCents(r.depreciation!)).toBe(152.46);
    expect(roundCents(r.interest)).toBe(129.89);
    expect(roundCents(r.rob)).toBe(22.92);
    expect(roundCents(r.otherCosts)).toBe(29.17);
    expect(roundCents(r.costPerKm!)).toBe(0.28);
    expect(r.robTotalOverTerm).toBe(1100);
    expect(r.warnings).toEqual([]);
  });

  it("margin adds to the total", () => {
    const r = calculateLeaseVariant({ ...costs, marginPerMonth: 25 }, variant);
    expect(roundCents(r.totalPerMonth!)).toBe(491.23);
  });

  it("term 0 gives no depreciation and no total", () => {
    const r = calculateLeaseVariant(costs, { ...variant, termMonths: 0 });
    expect(r.depreciation).toBeNull();
    expect(r.totalPerMonth).toBeNull();
    expect(r.warnings).toContain("term_missing");
  });

  it("km 0 gives no cost per km", () => {
    const r = calculateLeaseVariant(costs, { ...variant, kmPerYear: 0 });
    expect(r.costPerKm).toBeNull();
    expect(r.warnings).toContain("km_missing");
    expect(roundCents(r.totalPerMonth!)).toBe(466.23);
  });

  it("residual above purchase warns", () => {
    const r = calculateLeaseVariant(costs, { ...variant, residualValue: 20000 });
    expect(r.warnings).toContain("residual_above_purchase");
  });
});

describe("parseDutchAmount", () => {
  it("parses Dutch formatted amounts", () => {
    expect(parseDutchAmount("17.318,50")).toBe(17318.5);
    expect(parseDutchAmount("9,5")).toBe(9.5);
    expect(parseDutchAmount("350")).toBe(350);
    expect(parseDutchAmount("€ 1.100")).toBe(1100);
    expect(parseDutchAmount("")).toBeNull();
    expect(parseDutchAmount("abc")).toBeNull();
  });
});
