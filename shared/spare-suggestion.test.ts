import { describe, it, expect } from "vitest";
import { rankSpareCandidates, suggestForAll } from "./spare-suggestion";

const v = (id: number, plate: string, over: Record<string, unknown> = {}) =>
  ({ id, licensePlate: plate, brand: "Ford", model: "Transit", vehicleType: "Van", apkDate: "2030-01-01", ...over });

const original = { brand: "Ford", model: "Transit", vehicleType: "Van" };

describe("rankSpareCandidates", () => {
  it("puts the same type first, then same make and model, then same make", () => {
    const ranked = rankSpareCandidates(original, [
      v(1, "AA", { vehicleType: "SUV" }),
      v(2, "BB", { brand: "Renault", model: "Trafic" }),
      v(3, "CC", { model: "Custom" }),
      v(4, "DD"),
    ], "2026-10-25");
    expect(ranked.map((s) => s.vehicle.id)).toEqual([4, 3, 2, 1]);
    expect(ranked[0]).toMatchObject({ sameType: true, sameModel: true, sameBrand: true });
    expect(ranked[3]).toMatchObject({ sameType: false });
  });

  it("is case-insensitive and breaks ties on the plate", () => {
    const ranked = rankSpareCandidates(original, [v(1, "ZZ", { vehicleType: "van" }), v(2, "AB", { brand: "FORD", model: "transit" })], null);
    expect(ranked.map((s) => s.vehicle.id)).toEqual([2, 1]);
  });

  it("suggests a car whose APK runs out in the period, with a warning, behind an equal one without", () => {
    const ranked = rankSpareCandidates(original, [v(1, "AA", { apkDate: "2026-10-22" }), v(2, "BB")], "2026-10-25");
    expect(ranked.map((s) => s.vehicle.id)).toEqual([2, 1]);
    expect(ranked[1].apkWarning).toBe(true);
    // ... but a same-type car with an APK warning still beats another type.
    const other = rankSpareCandidates(original, [v(1, "AA", { apkDate: "2026-10-22" }), v(2, "BB", { vehicleType: "SUV" })], "2026-10-25");
    expect(other.map((s) => s.vehicle.id)).toEqual([1, 2]);
  });

  it("still ranks when the original is unknown", () => {
    expect(rankSpareCandidates(null, [v(2, "BB"), v(1, "AA")], null).map((s) => s.vehicle.id)).toEqual([1, 2]);
  });
});

describe("suggestForAll", () => {
  it("never gives the same car twice and skips rows with nothing left", () => {
    const cars = [v(1, "AA"), v(2, "BB", { vehicleType: "SUV" })];
    const result = suggestForAll([
      { key: 10, original, endDate: null, candidates: cars },
      { key: 11, original, endDate: null, candidates: cars },
      { key: 12, original, endDate: null, candidates: cars },
    ]);
    expect(Array.from(result.entries())).toEqual([[10, 1], [11, 2]]);
  });

  it("leaves out cars already chosen by hand", () => {
    const result = suggestForAll([{ key: 10, original, endDate: null, candidates: [v(1, "AA"), v(2, "BB")] }], [1]);
    expect(result.get(10)).toBe(2);
  });
});
