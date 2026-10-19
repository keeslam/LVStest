/**
 * Punt 1 (Kees, 2026-10-19) — extra costs settled at return count as revenue
 * of the vehicle, and are also reported apart.
 */
import { describe, it, expect } from "vitest";
import { buildVehicleFinancials } from "../utils/financial-reports";

const vehicle = { id: 1, licensePlate: "AB123C", brand: "VW", model: "Polo", dailyPrice: "40" } as any;
const rental = (over: Record<string, unknown>) => ({
  id: 10, vehicleId: 1, type: "standard", status: "completed", startDate: "2026-10-01", endDate: "2026-10-03",
  actualReturnDate: "2026-10-03", totalPrice: "120", deletedAt: null, ...over,
}) as any;

describe("buildVehicleFinancials with extra costs", () => {
  it("adds fuel and extra km to revenue and reports them apart", () => {
    const report = buildVehicleFinancials([vehicle], [rental({ fuelCost: "25.50", extraKmCost: "50" })], [], { from: "2026-10-01", to: "2026-10-31" });
    expect(report.rows[0].revenue).toBe(195.5);
    expect(report.rows[0].extraCosts).toBe(75.5);
    expect(report.totals.extraCosts).toBe(75.5);
  });

  it("is unchanged without extra costs", () => {
    const report = buildVehicleFinancials([vehicle], [rental({})], [], { from: "2026-10-01", to: "2026-10-31" });
    expect(report.rows[0].revenue).toBe(120);
    expect(report.rows[0].extraCosts).toBe(0);
  });
});
