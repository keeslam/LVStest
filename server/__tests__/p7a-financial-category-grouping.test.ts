/**
 * Audit A-14-2 carry-over from P1: report grouping runs on lower(btrim(category)),
 * so a dump restored before the next boot cannot split one category in two.
 */
import { describe, it, expect } from "vitest";
import { buildVehicleFinancials } from "../utils/financial-reports";

describe("buildVehicleFinancials category grouping", () => {
  it("adds 'Fuel', 'fuel' and ' fuel ' into one category key", () => {
    const vehicles: any[] = [{ id: 1, licensePlate: "AB-123-C", brand: "Toyota", model: "Yaris", dailyPrice: null }];
    const expenses: any[] = [
      { vehicleId: 1, category: "fuel", amount: "10.00", date: "2026-09-01" },
      { vehicleId: 1, category: "Fuel", amount: "5.50", date: "2026-09-02" },
      { vehicleId: 1, category: " fuel ", amount: "4.50", date: "2026-09-03" },
      { vehicleId: 1, category: "toll", amount: "1.00", date: "2026-09-03" },
    ];
    const report = buildVehicleFinancials(vehicles, [], expenses, { from: "2026-09-01", to: "2026-09-30" });
    expect(report.rows[0].expensesByCategory).toEqual({ fuel: 20, toll: 1 });
    expect(report.rows[0].expenses).toBeCloseTo(21, 2);
  });
});
