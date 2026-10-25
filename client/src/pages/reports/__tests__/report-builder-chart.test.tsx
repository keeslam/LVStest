/**
 * Report builder chart (phase 6): the points, series and pie slices of a grouped result.
 */
import { describe, it, expect } from "vitest";
import i18n from "@/i18n";
import { formatDateNl } from "@/lib/format-date-nl";
import { builderChartData, pieSlices } from "@/pages/reports/report-builder-chart";

const t = i18n.getFixedT("nl", "reports") as any;
const cols = [{ table: "fines", field: "offenceAt", label: "x" }, { table: "fines", field: "totalAmount", label: "y", aggregation: "SUM" as const }];
const month = [{ table: "fines", field: "offenceAt", period: "month" as const }];

describe("builderChartData", () => {
  it("punten en reeksen uit het resultaat", () => {
    const d = builderChartData(t, [{ offenceAt: "2019-02", totalAmount: "80.00" }, { offenceAt: null, totalAmount: "x" }], cols, month)!;
    expect(d.points).toEqual([{ name: formatDateNl("2019-02-01T12:00:00", "MMM yyyy"), totalAmount: 80 }, { name: "-", totalAmount: 0 }]);
    expect(d.series).toEqual([{ key: "totalAmount", label: "Totaalbedrag (Som)" }]);
    expect(d.truncated).toBe(false);
  });

  it("zonder groep geen grafiek, zonder berekening geen reeks", () => {
    expect(builderChartData(t, [], cols, [])).toBeNull();
    expect(builderChartData(t, [{ status: "new" }], [{ table: "fines", field: "status", label: "s" }], [{ table: "fines", field: "status" }])!.series).toEqual([]);
  });

  it("hoogstens 50 groepen", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ status: `s${i}`, id: "1" }));
    const d = builderChartData(t, rows, [{ table: "fines", field: "status", label: "s" }, { table: "fines", field: "id", label: "i", aggregation: "COUNT" }], [{ table: "fines", field: "status" }])!;
    expect(d.points).toHaveLength(50);
    expect(d.truncated).toBe(true);
  });
});

describe("pieSlices", () => {
  it("taart: tien grootste plus Overig, alleen positief", () => {
    const points = [...Array.from({ length: 12 }, (_, i) => ({ name: `g${i}`, v: 12 - i })), { name: "nul", v: 0 }, { name: "min", v: -4 }];
    const slices = pieSlices(points, "v", "Overig");
    expect(slices).toHaveLength(11);
    expect(slices[0]).toEqual({ name: "g0", value: 12 });
    expect(slices[10]).toEqual({ name: "Overig", value: 3 });
  });
});
