import { describe, it, expect } from "vitest";
import { inFleetOrSelected, isOutOfFleet, parseOutOfFleetInput } from "./out-of-fleet";

describe("isOutOfFleet / inFleetOrSelected", () => {
  const fleet = [
    { id: 1, outOfFleetDate: null },
    { id: 2, outOfFleetDate: "2026-10-01" },
    { id: 3 },
  ];

  it("knows a vehicle out of the fleet by its date", () => {
    expect(isOutOfFleet(fleet[0])).toBe(false);
    expect(isOutOfFleet(fleet[1])).toBe(true);
    expect(isOutOfFleet(null)).toBe(false);
  });

  it("hides vehicles out of the fleet from pickers, except the one already chosen", () => {
    expect(inFleetOrSelected(fleet).map((v) => v.id)).toEqual([1, 3]);
    expect(inFleetOrSelected(fleet, 2).map((v) => v.id)).toEqual([1, 2, 3]);
  });
});

describe("parseOutOfFleetInput", () => {
  it("accepts a sale with price and buyer", () => {
    expect(parseOutOfFleetInput({ date: "2026-10-20", reason: "sold", salePrice: "12.500,5".replace(".", ""), buyer: " Garage X ", note: "" }))
      .toEqual({ ok: true, value: { date: "2026-10-20", reason: "sold", salePrice: 12500.5, buyer: "Garage X", note: null } });
  });

  it("drops price and buyer for anything but a sale", () => {
    expect(parseOutOfFleetInput({ date: "2026-10-20", reason: "scrapped", salePrice: 100, buyer: "X", note: "Total loss" }))
      .toEqual({ ok: true, value: { date: "2026-10-20", reason: "scrapped", salePrice: null, buyer: null, note: "Total loss" } });
  });

  it("names the wrong field", () => {
    expect(parseOutOfFleetInput({ date: "2026-02-30", reason: "sold" })).toEqual({ ok: false, field: "date" });
    expect(parseOutOfFleetInput({ date: "20-10-2026", reason: "sold" })).toEqual({ ok: false, field: "date" });
    expect(parseOutOfFleetInput({ date: "2026-10-20", reason: "stolen" })).toEqual({ ok: false, field: "reason" });
    expect(parseOutOfFleetInput({ date: "2026-10-20", reason: "sold", salePrice: -5 })).toEqual({ ok: false, field: "salePrice" });
    expect(parseOutOfFleetInput({ date: "2026-10-20", reason: "other", note: "x".repeat(2001) })).toEqual({ ok: false, field: "note" });
  });
});
