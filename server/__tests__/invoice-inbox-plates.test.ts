import { describe, it, expect } from "vitest";
import { extractPlates } from "../services/invoice-inbox/plates";
import { computeInvoiceHash, sha256 } from "../services/invoice-inbox/hash";
import type { InboxParsedInvoice } from "../../shared/invoice-inbox";

const invoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: "Garage Jansen B.V.", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR",
  totalAmount: 121, lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }], ...over,
});

describe("extractPlates", () => {
  it("normalises the plate the scanner named: dashes, spaces, lower case", () => {
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "v-123-xb" } }))).toEqual(["V123XB"]);
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: " 12 abc 3 " } }))).toEqual(["12ABC3"]);
  });

  it("collects every plate the scanner listed, once each", () => {
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "V-123-XB", licensePlates: ["V123XB", "GH-456-K"] } }))).toEqual(["V123XB", "GH456K"]);
  });

  it("finds a dashed Dutch plate inside a line description", () => {
    const found = extractPlates(invoice({ lineItems: [{ description: "APK keuring kenteken 12-ABC-3 incl. afmelden", amount: 45, category: "Registration" }] }));
    expect(found).toEqual(["12ABC3"]);
  });

  it("does not mistake dates, article numbers or phone numbers for plates", () => {
    const found = extractPlates(invoice({ lineItems: [
      { description: "Werkzaamheden 12-09-2026, order 45-67-89", amount: 10, category: "Other" },
      { description: "Oliefilter art. OC-1234-X tel 010-123-4567", amount: 10, category: "Maintenance" },
    ] }));
    expect(found).toEqual([]);
  });

  it("ignores values that cannot be a plate", () => {
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "onbekend" } }))).toEqual([]);
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "" } }))).toEqual([]);
    expect(extractPlates(invoice())).toEqual([]);
  });
});

describe("computeInvoiceHash", () => {
  it("is stable across spelling noise in vendor and number", () => {
    const a = computeInvoiceHash({ vendor: "Garage Jansen B.V.", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", totalAmount: 121 });
    const b = computeInvoiceHash({ vendor: " garage  jansen BV ", invoiceNumber: " 2026-0412 ", invoiceDate: "2026-09-10", totalAmount: 121.0 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes with number, date or total", () => {
    const base = { vendor: "G", invoiceNumber: "1", invoiceDate: "2026-09-10", totalAmount: 10 };
    const h = computeInvoiceHash(base);
    expect(computeInvoiceHash({ ...base, invoiceNumber: "2" })).not.toBe(h);
    expect(computeInvoiceHash({ ...base, invoiceDate: "2026-09-11" })).not.toBe(h);
    expect(computeInvoiceHash({ ...base, totalAmount: 10.01 })).not.toBe(h);
  });

  it("is null without an invoice number, so such invoices are never called duplicates", () => {
    expect(computeInvoiceHash({ vendor: "Shell", invoiceNumber: "  ", invoiceDate: "2026-09-10", totalAmount: 60 })).toBeNull();
  });

  it("sha256 hashes bytes and text alike", () => {
    expect(sha256("abc")).toBe(sha256(Buffer.from("abc")));
  });
});
