import { describe, it, expect } from "vitest";
import { FineStatus, isValidFineTransition, normalizeLicensePlate, CUSTOMER_VISIBLE_FINE_STATUSES } from "./fines";

describe("fines shared", () => {
  it("allows only the spec transitions", () => {
    expect(isValidFineTransition("new", "linked")).toBe(true);
    expect(isValidFineTransition("new", "charged")).toBe(false);
    expect(isValidFineTransition("linked", "new")).toBe(true);
    expect(isValidFineTransition("charged", "paid")).toBe(true);
    expect(isValidFineTransition("paid", "charged")).toBe(false);
    expect(isValidFineTransition("disputed", "cancelled")).toBe(true);
    // Cancelled by mistake can be reactivated; paid stays final.
    expect(isValidFineTransition(FineStatus.CANCELLED, FineStatus.NEW)).toBe(true);
    expect(isValidFineTransition(FineStatus.CANCELLED, FineStatus.LINKED)).toBe(true);
    expect(isValidFineTransition(FineStatus.PAID, FineStatus.NEW)).toBe(false);
  });
  it("normalises plates and hides new/cancelled from customers", () => {
    expect(normalizeLicensePlate(" 94-xt-184 ")).toBe("94XT184");
    expect(CUSTOMER_VISIBLE_FINE_STATUSES).toEqual(["linked", "charged", "paid", "disputed"]);
  });
});
