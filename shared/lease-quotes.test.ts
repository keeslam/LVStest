import { describe, it, expect } from "vitest";
import {
  displayStatus,
  formatQuoteNumber,
  isEditWarningStatus,
  LEASE_QUOTE_TEMPLATE_SOURCES,
  leaseQuotePayloadSchema,
} from "./lease-quotes";

const variant = (isChosen: boolean) => ({ termMonths: 48, kmPerYear: 20000, residualValue: 10000, isChosen });

describe("displayStatus", () => {
  it("derives expired for an open quote past its date", () => {
    expect(displayStatus("sent", "2026-10-01", "2026-10-27")).toBe("expired");
    expect(displayStatus("concept", "2026-10-01", "2026-10-27")).toBe("expired");
  });
  it("never expires a decided quote", () => {
    expect(displayStatus("accepted", "2026-10-01", "2026-10-27")).toBe("accepted");
    expect(displayStatus("rejected", "2026-10-01", "2026-10-27")).toBe("rejected");
  });
  it("is still valid on the last day", () => {
    expect(displayStatus("concept", "2026-10-27", "2026-10-27")).toBe("concept");
  });
});

describe("formatQuoteNumber", () => {
  it("pads the sequence to four digits", () => {
    expect(formatQuoteNumber(2026, 1)).toBe("LO-2026-0001");
    expect(formatQuoteNumber(2026, 123)).toBe("LO-2026-0123");
  });
});

describe("isEditWarningStatus", () => {
  it("warns for sent and accepted only", () => {
    expect(isEditWarningStatus("sent")).toBe(true);
    expect(isEditWarningStatus("accepted")).toBe(true);
    expect(isEditWarningStatus("concept")).toBe(false);
    expect(isEditWarningStatus("rejected")).toBe(false);
  });
});

describe("LEASE_QUOTE_TEMPLATE_SOURCES", () => {
  it("offers the customer-facing sources", () => {
    for (const s of ["quoteNumber", "monthlyPriceExclVat", "termMonths", "kmPerYear", "excessKmPrice", "shortfallKmPrice"]) {
      expect(LEASE_QUOTE_TEMPLATE_SOURCES).toContain(s);
    }
  });
  it("never offers an internal cost source", () => {
    for (const s of ["purchasePrice", "residualValue", "interest", "depreciation", "margin", "rob", "insurance", "roadTax", "otherCosts"]) {
      expect(LEASE_QUOTE_TEMPLATE_SOURCES).not.toContain(s);
    }
  });
});

describe("leaseQuotePayloadSchema", () => {
  it("accepts exactly one chosen variant", () => {
    const r = leaseQuotePayloadSchema.safeParse({ variants: [variant(false), variant(true)] });
    expect(r.success).toBe(true);
  });
  it("rejects zero chosen variants", () => {
    expect(leaseQuotePayloadSchema.safeParse({ variants: [variant(false)] }).success).toBe(false);
  });
  it("rejects two chosen variants", () => {
    expect(leaseQuotePayloadSchema.safeParse({ variants: [variant(true), variant(true)] }).success).toBe(false);
  });
  it("rejects an empty variant list", () => {
    expect(leaseQuotePayloadSchema.safeParse({ variants: [] }).success).toBe(false);
  });
  it("rejects an unknown status and strips unknown keys", () => {
    expect(leaseQuotePayloadSchema.safeParse({ status: "bogus", variants: [variant(true)] }).success).toBe(false);
    const r = leaseQuotePayloadSchema.parse({ foo: 1, variants: [variant(true)] });
    expect((r as any).foo).toBeUndefined();
  });
});
