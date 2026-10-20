import { describe, it, expect } from "vitest";
import { carriedDamage, carryOverSource } from "./damage-carry-over";

const marker = (x: number) => ({ id: `m${x}`, x, y: 0.5, type: "scratch", severity: "minor", notes: "kras" });

describe("carryOverSource", () => {
  it("takes the vehicle's newest check, pickup or return", () => {
    const checks = [
      { id: 1, checkType: "pickup", checkDate: "2026-10-01T09:00:00Z", damageMarkers: JSON.stringify([marker(0.1)]) },
      { id: 2, checkType: "return", checkDate: "2026-10-10T09:00:00Z", damageMarkers: JSON.stringify([marker(0.2), marker(0.3)]) },
    ];
    expect(carryOverSource(checks)?.id).toBe(2);
  });

  it("gives nothing when the newest check has no damage, or there is no check", () => {
    expect(carryOverSource([{ id: 3, checkDate: "2026-10-10", damageMarkers: "[]", drawingPaths: null }])).toBeNull();
    expect(carryOverSource([])).toBeNull();
  });
});

describe("carriedDamage", () => {
  it("copies markers with fresh ids and their source, and the drawn lines", () => {
    const { markers, paths } = carriedDamage({ id: 7, damageMarkers: [marker(0.2)], drawingPaths: JSON.stringify(["0.1,0.1 0.2,0.2", ""]) });
    expect(markers).toEqual([{ ...marker(0.2), id: "carried-7-0", carriedFrom: 7 }]);
    expect(paths).toEqual(["0.1,0.1 0.2,0.2"]);
  });

  it("survives broken stored JSON", () => {
    expect(carriedDamage({ id: 8, damageMarkers: "{oops", drawingPaths: "nope" })).toEqual({ markers: [], paths: [] });
  });
});
