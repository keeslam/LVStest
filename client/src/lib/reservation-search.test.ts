import { describe, it, expect } from "vitest";
import { reservationMatchesSearch } from "@/lib/reservation-search";

const row = {
  id: 3200,
  contractNumber: "1012",
  vehicle: { licensePlate: "AB123C", brand: "Fiat", model: "Ducato" },
  customer: { name: "Jansen", companyName: "Jansen Transport BV" },
};

describe("reservationMatchesSearch", () => {
  it("matches every field it promises to", () => {
    for (const query of ["ab-123-c", "AB123", "fiat", "ducato", "fiat ducato", "jansen", "transport bv", "1012", "3200"]) {
      expect(reservationMatchesSearch(row, query), query).toBe(true);
    }
  });

  it("does not match something else, and an empty query matches everything", () => {
    expect(reservationMatchesSearch(row, "renault")).toBe(false);
    expect(reservationMatchesSearch(row, "9999")).toBe(false);
    expect(reservationMatchesSearch(row, "   ")).toBe(true);
  });

  it("copes with missing relations", () => {
    expect(reservationMatchesSearch({ id: 7 }, "fiat")).toBe(false);
    expect(reservationMatchesSearch({ id: 7, vehicle: null, customer: null }, "7")).toBe(true);
  });
});
