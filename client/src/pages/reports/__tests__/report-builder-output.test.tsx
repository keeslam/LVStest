/**
 * Report builder (phase 6, final fixes): a calculated value reads as a Dutch number on screen and in print.
 */
import { describe, it, expect } from "vitest";
import i18n from "@/i18n";
import { displayCell } from "@/pages/reports/report-builder-output";

const t = i18n.getFixedT("nl", "reports") as any;
const fines = (field: string, aggregation?: string) => ({ table: "fines", field, label: field, aggregation });

describe("displayCell: calculated values", () => {
  it("an average of money gets euros and two Dutch decimals", () => {
    expect(displayCell(t, fines("totalAmount", "AVG"), "41.6666666666666667")).toMatch(/^€\s41,67$/);
  });

  it("a sum of money keeps two decimals and the thousands dot", () => {
    expect(displayCell(t, fines("totalAmount", "SUM"), "1234.50")).toMatch(/^€\s1\.234,50$/);
  });

  it("a count has no decimals", () => {
    expect(displayCell(t, fines("id", "COUNT"), "7")).toBe("7");
    expect(displayCell(t, fines("id", "COUNT_DISTINCT"), 1200)).toBe("1.200");
  });

  it("no value stays a dash, a non-number stays as written", () => {
    expect(displayCell(t, fines("totalAmount", "SUM"), null)).toBe("-");
    expect(displayCell(t, fines("status", "MAX"), "paid")).toBe("paid");
  });
});
