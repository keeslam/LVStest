/**
 * The Dutch explanation of a verdict. It must say what was decided, with
 * which rule version and parameters, what is missing, and never claim more
 * certainty than the status carries.
 */
import { describe, it, expect } from "vitest";
import { explainVerdict } from "../explain";
import type { Verdict } from "../rules/pseudo-eindheffing";

const version = { title: "Belastingplan 2026 (wet)", versionNumber: 1, effectiveFrom: "2027-01-01", effectiveUntil: null };

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: "APPLICABLE",
    months: [
      { month: "2027-03", days: 7, charged: true, reason: "charged", amount: "360.00", settled: true },
      { month: "2027-04", days: 7, charged: true, reason: "charged", amount: "360.00", settled: true },
    ],
    monthsCharged: 2,
    amount: "720.00",
    settledAmount: "720.00",
    provisionalAmount: "0.00",
    dataQuality: "complete",
    missingData: [],
    reviewReasons: [],
    facts: { openEnded: false, final: false, assessedThrough: "2027-04-07", calendarDays: 14, baseKind: "catalog_value", baseValue: "36000.00", ageYearsAtStart: 2, transitionApplied: false, shortTermExempt: false, privateUseKnown: "yes" },
    parametersUsed: [
      { key: "PSEUDO_ENDHEFFING_RATE", dataType: "decimal", value: 12, unit: "percent_per_year", legalStatus: "legal", sourceUrl: "https://example.invalid/wet", sourceReference: "art. 32bc" },
      { key: "REPLACEMENT_VEHICLE_EXEMPTION_DAYS", dataType: "integer", value: 14, unit: "calendar_days", legalStatus: "legal" },
      { key: "TEMPORARY_RENTAL_EXEMPTION_DAYS", dataType: "integer", value: 7, unit: "calendar_days", legalStatus: "legal" },
      { key: "CURRENCY", dataType: "choice", value: "EUR", unit: "choice", legalStatus: "internal" },
    ],
    ...overrides,
  };
}

describe("uitleg van een fiscale beoordeling", () => {
  it("states status, months, amount, rule version and the key parameters", () => {
    const text = explainVerdict(verdict(), version);
    expect(text).toContain("Status: Van toepassing");
    expect(text).toContain("Belastingplan 2026 (wet)");
    expect(text).toContain("versie 1");
    expect(text).toContain("Heffingspercentage: 12 % per jaar");
    expect(text).toContain("maart 2027");
    expect(text).toContain("april 2027");
    expect(text).toContain("€ 720,00");
    expect(text).toContain("catalogusprijs");
    expect(text).toContain("€ 36.000,00");
    expect(text).toContain("Vrijstellingsdagen vervangend voertuig: 14 kalenderdagen");
  });

  it("lists what is missing and softens the wording for a possible result", () => {
    const text = explainVerdict(
      verdict({ status: "POSSIBLY_APPLICABLE", dataQuality: "partial", missingData: ["private_use_unknown", "transition_status_unknown"] }),
      version,
    );
    expect(text).toContain("Status: Mogelijk van toepassing");
    expect(text).toContain("Ontbrekende informatie:");
    expect(text).toContain("Privégebruik niet bevestigd");
    expect(text).toContain("indicatie");
    expect(text).not.toMatch(/gegarandeerd|zeker/i);
  });

  it("explains why a result is not applicable", () => {
    const text = explainVerdict(
      verdict({ status: "NOT_APPLICABLE", amount: null, settledAmount: null, provisionalAmount: null, monthsCharged: 0, months: [{ month: "2027-03", days: 5, charged: false, reason: "short_term_exempt", amount: null, settled: true }], facts: { openEnded: false, final: true, assessedThrough: "2027-03-05", calendarDays: 5, notApplicableReason: "fully_exempt", shortTermExempt: true } }),
      version,
    );
    expect(text).toContain("Status: Niet van toepassing");
    expect(text).toContain("kortstondig");
    expect(text).toContain("maart 2027");
  });

  it("names the review reasons when a human must decide", () => {
    const text = explainVerdict(verdict({ status: "MANUAL_REVIEW_REQUIRED", reviewReasons: ["vehicle_category_conflict"] }), version);
    expect(text).toContain("Status: Handmatige beoordeling nodig");
    expect(text).toContain("Voertuigcategorie en voertuigsoort spreken elkaar tegen");
  });

  it("says so when no rule version is available", () => {
    const text = explainVerdict(verdict({ status: "RULE_NOT_AVAILABLE", months: [], monthsCharged: 0, amount: null, parametersUsed: [] }), null);
    expect(text).toContain("Status: Geen regelversie beschikbaar");
    expect(text).not.toContain("versie 1");
  });

  it("ends with the disclaimer", () => {
    expect(explainVerdict(verdict(), version)).toMatch(/geen fiscaal advies/i);
  });
});

describe("uitleg — open einde en eindberekening (F-15)", () => {
  it("marks the provisional month, sums per calendar year, and names the final calculation", () => {
    const open = verdict({
      months: [
        { month: "2027-12", days: 31, charged: true, reason: "charged", amount: "360.00", settled: true },
        { month: "2028-01", days: 15, charged: true, reason: "charged", amount: "360.00", settled: false },
      ],
      amount: "720.00",
      settledAmount: "360.00",
      provisionalAmount: "360.00",
      facts: { openEnded: true, final: false, assessedThrough: "2028-01-31", calendarDays: 46, baseKind: "catalog_value", baseValue: "36000.00" },
    });
    const text = explainVerdict(open, version);
    expect(text).toContain("januari 2028: 15 dagen, geheven, € 360,00 (voorlopig)");
    expect(text).toContain("Vastgelegd tot en met december 2027: € 360,00");
    expect(text).toContain("Voorlopig (lopende maand): € 360,00");
    expect(text).toContain("2027: € 360,00");
    expect(text).toContain("2028: € 360,00 (voorlopig)");
    expect(text).toContain("beoordeeld tot en met 31 januari 2028");
    expect(text).not.toContain("Eindberekening");

    const final = verdict({ facts: { openEnded: false, final: true, assessedThrough: "2027-04-07", calendarDays: 14, baseKind: "catalog_value", baseValue: "36000.00" } });
    const finalText = explainVerdict(final, version);
    expect(finalText).toContain("Eindberekening");
    expect(finalText).not.toContain("voorlopig");
  });
});
