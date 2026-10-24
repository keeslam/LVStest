import { describe, it, expect } from "vitest";
import { fillMonths } from "./report-kit";

describe("fillMonths", () => {
  it("sorteert en vult ontbrekende maanden aan", () => {
    const rows = fillMonths([{ month: "2026-03", v: 1 }, { month: "2026-01", v: 2 }], (m) => ({ month: m, v: 0 }));
    expect(rows.map((r) => r.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(rows.map((r) => r.v)).toEqual([2, 0, 1]);
  });

  it("over de jaargrens", () => {
    const rows = fillMonths([{ month: "2026-02" }, { month: "2025-11" }], (m) => ({ month: m }));
    expect(rows.map((r) => r.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("lege invoer geeft een lege lijst", () => {
    expect(fillMonths([], (m) => ({ month: m }))).toEqual([]);
  });
});
