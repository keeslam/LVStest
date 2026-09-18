import { describe, it, expect } from "vitest";
import { decideInvoiceBooking, totalsMatch, type DecideInput } from "../services/invoice-inbox/decide";
import type { InboxParsedInvoice } from "../../shared/invoice-inbox";

const invoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR",
  totalAmount: 121, subtotalAmount: 100, vatAmount: 21,
  lineItems: [{ description: "Grote beurt", amount: 80, category: "Maintenance" }, { description: "Remblokken", amount: 20, category: "Brakes" }],
  ...over,
});

const input = (over: Partial<DecideInput> = {}): DecideInput => ({
  senderAllowed: true, duplicate: false, plates: ["V123XB"], fleetMatches: [{ id: 7, licensePlate: "V-123-XB" }],
  invoice: invoice(), tolerance: 1, today: "2026-09-18", ...over,
});

describe("decideInvoiceBooking", () => {
  it("books when every rule passes", () => {
    expect(decideInvoiceBooking(input())).toEqual({ action: "book", vehicleId: 7 });
  });

  it("names the first failing rule, in the documented order", () => {
    const everythingWrong = input({ senderAllowed: false, duplicate: true, plates: [], fleetMatches: [], invoice: invoice({ totalAmount: 999, subtotalAmount: undefined, vatAmount: undefined }) });
    expect(decideInvoiceBooking(everythingWrong)).toEqual({ action: "review", reason: "unknown_sender" });
    expect(decideInvoiceBooking({ ...everythingWrong, senderAllowed: true })).toEqual({ action: "review", reason: "duplicate" });
    expect(decideInvoiceBooking({ ...everythingWrong, senderAllowed: true, duplicate: false })).toEqual({ action: "review", reason: "no_plate" });
  });

  it("queues several plates, and one plate that is not (uniquely) in the fleet", () => {
    expect(decideInvoiceBooking(input({ plates: ["V123XB", "GH456K"], fleetMatches: [{ id: 7, licensePlate: "V-123-XB" }] }))).toEqual({ action: "review", reason: "multiple_plates" });
    expect(decideInvoiceBooking(input({ fleetMatches: [] }))).toEqual({ action: "review", reason: "plate_unknown" });
    expect(decideInvoiceBooking(input({ fleetMatches: [{ id: 7, licensePlate: "V-123-XB" }, { id: 8, licensePlate: "V123XB" }] }))).toEqual({ action: "review", reason: "plate_unknown" });
  });

  it("queues an invoice dated in the future, and books one dated today", () => {
    expect(decideInvoiceBooking(input({ invoice: invoice({ invoiceDate: "2026-09-19" }) }))).toEqual({ action: "review", reason: "total_mismatch" });
    expect(decideInvoiceBooking(input({ invoice: invoice({ invoiceDate: "2026-09-18" }) })).action).toBe("book");
  });

  it("queues an invoice whose date is unreadable", () => {
    expect(decideInvoiceBooking(input({ invoice: invoice({ invoiceDate: "10 september" }) }))).toEqual({ action: "review", reason: "total_mismatch" });
  });

  /**
   * I4: the automatic path used to book whatever the scanner returned. A quote,
   * a reminder, a made-up line equal to the total or a date that only looks like
   * one are not something to book behind a person's back.
   */
  it("never books anything that is not an invoice, right after the duplicate check", () => {
    for (const documentType of ["quote", "reminder", "credit_note", "other"]) {
      expect(decideInvoiceBooking(input({ invoice: invoice({ documentType }) }))).toEqual({ action: "review", reason: "not_invoice" });
    }
    expect(decideInvoiceBooking(input({ invoice: invoice({ documentType: "invoice" }) })).action).toBe("book");
    // Not read at all: the rule cannot fire, the rest still decides.
    expect(decideInvoiceBooking(input({ invoice: invoice({ documentType: undefined }) })).action).toBe("book");
    // Checked before the plates, so "quote" is what staff are told.
    expect(decideInvoiceBooking(input({ plates: [], fleetMatches: [], invoice: invoice({ documentType: "quote" }) })))
      .toEqual({ action: "review", reason: "not_invoice" });
    // And after the duplicate check, which still wins.
    expect(decideInvoiceBooking(input({ duplicate: true, invoice: invoice({ documentType: "quote" }) })))
      .toEqual({ action: "review", reason: "duplicate" });
  });

  it("refuses to book a line the scanner made up out of the total", () => {
    expect(decideInvoiceBooking(input({ invoice: invoice({ lineItemsFromTotal: true }) })))
      .toEqual({ action: "review", reason: "total_mismatch" });
  });

  it("insists on a date that is real, recent and not in the future", () => {
    const withDate = (invoiceDate: string) => decideInvoiceBooking(input({ invoice: invoice({ invoiceDate }) }));
    expect(withDate("")).toEqual({ action: "review", reason: "total_mismatch" });
    // Looks like a date, is not one: 31 February rolls over to 3 March.
    expect(withDate("2026-02-31")).toEqual({ action: "review", reason: "total_mismatch" });
    expect(withDate("2026-13-01")).toEqual({ action: "review", reason: "total_mismatch" });
    // 400 days before "today" is the last one that still books.
    expect(withDate("2025-08-14").action).toBe("book");
    expect(withDate("2025-08-13")).toEqual({ action: "review", reason: "total_mismatch" });
  });
});

describe("totalsMatch", () => {
  it("accepts lines that add up to the subtotal excl. VAT", () => {
    expect(totalsMatch(invoice(), 1)).toBe(true);
  });

  it("accepts lines that add up to the total incl. VAT", () => {
    expect(totalsMatch(invoice({ lineItems: [{ description: "Alles", amount: 121, category: "Maintenance" }] }), 1)).toBe(true);
  });

  it("derives the subtotal from total minus VAT when the scanner gave no subtotal", () => {
    expect(totalsMatch(invoice({ subtotalAmount: undefined }), 1)).toBe(true);
  });

  it("applies the tolerance in cents: exactly 1.00 off passes, 1.01 off fails", () => {
    const lines = (amount: number) => [{ description: "x", amount, category: "Other" }];
    expect(totalsMatch(invoice({ subtotalAmount: undefined, vatAmount: undefined, totalAmount: 100, lineItems: lines(99) }), 1)).toBe(true);
    expect(totalsMatch(invoice({ subtotalAmount: undefined, vatAmount: undefined, totalAmount: 100, lineItems: lines(98.99) }), 1)).toBe(false);
  });

  it("fails without lines", () => {
    expect(totalsMatch(invoice({ lineItems: [] }), 1)).toBe(false);
  });
});
