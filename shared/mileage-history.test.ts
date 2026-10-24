import { describe, it, expect } from "vitest";
import { analyseMileage, type MileageRow } from "./mileage-history";

function row(id: number, mileage: number, date: string): MileageRow {
  return { id, mileage, recordedAt: `${date}T10:00:00.000Z`, source: "manual", actorName: null, voided: false };
}
const P = { from: "2026-01-01", to: "2026-01-31", freeKmPerDay: null };

describe("analyseMileage", () => {
  it("gereden km sinds vorige en samenvatting", () => {
    const out = analyseMileage([row(1, 10000, "2026-01-01"), row(2, 12500, "2026-02-01")], { from: "2026-01-01", to: "2026-02-28", freeKmPerDay: 50 });
    expect(out.rows[1].drivenSincePrevious).toBe(2500);
    expect(out.summary.drivenKm).toBe(2500);
    expect(out.summary.freeKm).toBe(50 * 59);
  });
  it("teruglopende stand en onlogische sprong", () => {
    const out = analyseMileage([row(1, 10000, "2026-01-01"), row(2, 9000, "2026-01-02"), row(3, 20000, "2026-01-03")], P);
    expect(out.rows[1].warning).toBe("decrease");
    expect(out.rows[2].warning).toBe("jump");
  });
  it("een vervallen regel geeft geen waarschuwing en telt niet mee", () => {
    const out = analyseMileage([row(1, 10000, "2026-01-01"), { ...row(2, 9000, "2026-01-02"), voided: true }, row(3, 10100, "2026-01-03")], P);
    expect(out.rows[1].warning).toBeNull();
    expect(out.rows[2].drivenSincePrevious).toBe(100);
    expect(out.summary.warnings).toBe(0);
  });
  it("geen of één stand: geen deling door nul", () => {
    expect(analyseMileage([], P).summary).toMatchObject({ drivenKm: 0, avgPerMonth: null, readings: 0 });
    expect(analyseMileage([row(1, 5, "2026-01-01")], P).summary.avgPerMonth).toBe(0);
  });
  it("basisregel levert gereden km voor de eerste regel maar wordt niet getoond", () => {
    const out = analyseMileage([row(2, 10300, "2026-01-05")], { ...P, baseline: row(1, 10000, "2025-12-20") });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].drivenSincePrevious).toBe(300);
    expect(out.summary.drivenKm).toBe(300);
    expect(out.summary.overFreeKm).toBeNull();
  });
  it("boven de gratis km", () => {
    const out = analyseMileage([row(1, 10000, "2026-01-01"), row(2, 11000, "2026-01-10")], { ...P, freeKmPerDay: 10 });
    expect(out.summary.freeKm).toBe(310);
    expect(out.summary.overFreeKm).toBe(690);
  });
});
