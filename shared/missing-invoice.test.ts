import { describe, it, expect } from "vitest";
import {
  DEFAULT_MISSING_INVOICE_MAIL,
  isMissingInvoiceMailDue,
  isValidMissingInvoiceMail,
  missingInvoiceMailFromSetting,
  missingInvoiceRows,
  visitDescription,
} from "./missing-invoice";

const vehicles = [{ id: 1, licensePlate: "AA11BB", brand: "Ford", model: "Transit" }];
const visit = (over: Record<string, unknown>) => ({ id: 10, vehicleId: 1, startDate: "2026-10-22", endDate: "2026-10-23", notes: "breakdown: accu leeg\nextra", ...over }) as any;

describe("missingInvoiceRows", () => {
  it("lists a visit that ended the set number of days ago without costs", () => {
    const rows = missingInvoiceRows([visit({})], vehicles, new Set(), "2026-11-06", 14);
    expect(rows).toEqual([{
      visitId: 10, vehicleId: 1, licensePlate: "AA11BB", brand: "Ford", model: "Transit", type: "breakdown",
      startDate: "2026-10-22", endDate: "2026-10-23", description: "accu leeg", daysSinceEnd: 14,
    }]);
  });

  it("leaves out visits too recent, with costs, marked as no invoice, open, or from before the start date", () => {
    expect(missingInvoiceRows([visit({})], vehicles, new Set(), "2026-11-05", 14)).toEqual([]);
    expect(missingInvoiceRows([visit({})], vehicles, new Set([10]), "2026-12-01", 14)).toEqual([]);
    expect(missingInvoiceRows([visit({ noInvoiceExpected: true })], vehicles, new Set(), "2026-12-01", 14)).toEqual([]);
    expect(missingInvoiceRows([visit({ endDate: null })], vehicles, new Set(), "2026-12-01", 14)).toEqual([]);
    expect(missingInvoiceRows([visit({ startDate: "2026-09-01", endDate: "2026-09-02" })], vehicles, new Set(), "2026-12-01", 14)).toEqual([]);
  });

  it("keeps a description that is not of the type: text shape", () => {
    expect(visitDescription("Vehicle maintenance block")).toBe("Vehicle maintenance block");
  });
});

describe("weekly mail settings", () => {
  it("reads forgivingly and validates strictly", () => {
    expect(missingInvoiceMailFromSetting(null)).toEqual(DEFAULT_MISSING_INVOICE_MAIL);
    const good = { ...DEFAULT_MISSING_INVOICE_MAIL, enabled: true, recipients: ["kantoor@example.nl"] };
    expect(isValidMissingInvoiceMail(good)).toBe(true);
    expect(isValidMissingInvoiceMail({ ...good, recipients: [] })).toBe(false);
    expect(isValidMissingInvoiceMail({ ...good, subject: "a\r\nBcc: x@y.z" })).toBe(false);
    expect(isValidMissingInvoiceMail({ ...good, columns: ["bogus"] })).toBe(false);
    expect(isValidMissingInvoiceMail({ ...good, time: "25:00" })).toBe(false);
  });

  it("is due on the chosen weekday from the chosen time, once that day", () => {
    const s = { ...DEFAULT_MISSING_INVOICE_MAIL, enabled: true, recipients: ["a@b.nl"], weekday: 1, time: "08:00" };
    expect(isMissingInvoiceMailDue(s, { day: "2026-10-26", weekday: 1, time: "08:15" }, null)).toBe(true);
    expect(isMissingInvoiceMailDue(s, { day: "2026-10-26", weekday: 1, time: "07:45" }, null)).toBe(false);
    expect(isMissingInvoiceMailDue(s, { day: "2026-10-26", weekday: 1, time: "09:00" }, "2026-10-26")).toBe(false);
    expect(isMissingInvoiceMailDue(s, { day: "2026-10-27", weekday: 2, time: "09:00" }, null)).toBe(false);
  });
});
