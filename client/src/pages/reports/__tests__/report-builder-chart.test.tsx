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
    const d = builderChartData(t, [{ offenceAt: "2019-02", "totalAmount.SUM": "80.00" }, { offenceAt: null, "totalAmount.SUM": "x" }], cols, month)!;
    expect(d.points).toEqual([{ __cat: formatDateNl("2019-02-01T12:00:00", "MMM yyyy"), totalAmount__SUM: 80 }, { __cat: "-", totalAmount__SUM: 0 }]);
    expect(d.series).toEqual([{ key: "totalAmount__SUM", label: "Totaalbedrag (Som)" }]);
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
    const points = [...Array.from({ length: 12 }, (_, i) => ({ __cat: `g${i}`, v: 12 - i })), { __cat: "nul", v: 0 }, { __cat: "min", v: -4 }];
    const slices = pieSlices(points, "v", "Overig");
    expect(slices).toHaveLength(11);
    expect(slices[0]).toEqual({ name: "g0", value: 12 });
    expect(slices[10]).toEqual({ name: "Overig", value: 3 });
  });
});

describe("a series on a field called name", () => {
  it("keeps the category apart from the series", () => {
    const columns = [{ table: "customers", field: "city", label: "c" }, { table: "customers", field: "name", label: "n", aggregation: "COUNT" as const }];
    const d = builderChartData(t, [{ city: "Breda", "name.COUNT": "4" }, { city: "Ede", "name.COUNT": "2" }], columns, [{ table: "customers", field: "city" }])!;
    expect(d.points).toEqual([{ __cat: "Breda", name__COUNT: 4 }, { __cat: "Ede", name__COUNT: 2 }]);
    expect(pieSlices(d.points, "name__COUNT", "Overig")).toEqual([{ name: "Breda", value: 4 }, { name: "Ede", value: 2 }]);
  });
});
