/**
 * Fix round 3 (onderhoudsanalyse): a fixed text table gets stable row keys (its first cell), so the rows
 * picked in the print dialog do not shift when the rows come in another order.
 */
import { describe, it, expect } from "vitest";
import { textTablePrintSection } from "../report-breakdown-table";

describe("textTablePrintSection row keys", () => {
  it("keys a row by its first cell", async () => {
    const section = textTablePrintSection("t", "Titel", ["Naam", "Aantal"], [["Garage A", "1"], ["Garage B", "2"], ["Garage A", "3"]])!;
    expect(section.kind).toBe("table");
    const data = await (section as Extract<typeof section, { kind: "table" }>).allRows();
    expect(data.rowKeys).toEqual(["Garage A", "Garage B", "Garage A"]);
  });
});
