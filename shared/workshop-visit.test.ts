import { describe, it, expect } from "vitest";
import { downtimeByModel, downtimeRows, invoiceCandidateWindow, visitDaysInPeriod } from "./workshop-visit";
import { maintenanceTypeKey, maintenanceTypeOf } from "./maintenance-type";

describe("maintenanceTypeOf", () => {
  it("reads the column, else a known prefix of the notes", () => {
    expect(maintenanceTypeOf({ maintenanceType: "tire_replacement", notes: "breakdown: x" })).toBe("tire_replacement");
    expect(maintenanceTypeOf({ notes: "breakdown: lekke band: achter" })).toBe("breakdown");
    expect(maintenanceTypeOf({ notes: "Vehicle maintenance block" })).toBeNull();
    expect(maintenanceTypeKey({ notes: "Vehicle maintenance block" })).toBe("Vehicle maintenance block");
  });
});

describe("invoiceCandidateWindow", () => {
  it("runs from the start of the visit to 60 days after its end", () => {
    expect(invoiceCandidateWindow({ startDate: "2026-10-01", endDate: "2026-10-05" }, "2026-10-21")).toEqual({ from: "2026-10-01", to: "2026-12-04" });
  });
  it("uses today for a visit that is still open", () => {
    expect(invoiceCandidateWindow({ startDate: "2026-10-01", endDate: null }, "2026-10-21")).toEqual({ from: "2026-10-01", to: "2026-12-20" });
  });
});

describe("downtime", () => {
  it("counts the days inside the period, both ends included", () => {
    expect(visitDaysInPeriod({ startDate: "2026-09-28", endDate: "2026-10-03" }, "2026-10-01", "2026-10-31", "2026-10-21")).toBe(3);
    expect(visitDaysInPeriod({ startDate: "2026-11-01", endDate: "2026-11-03" }, "2026-10-01", "2026-10-31", "2026-10-21")).toBe(0);
  });

  it("sums visits, days, breakdowns and linked costs per vehicle and per model", () => {
    const vehicles = [
      { id: 1, licensePlate: "AA11BB", brand: "Ford", model: "Transit" },
      { id: 2, licensePlate: "CC22DD", brand: "Ford", model: "Transit" },
    ];
    const visits = [
      { id: 10, vehicleId: 1, startDate: "2026-10-01", endDate: "2026-10-02", maintenanceType: "breakdown" },
      { id: 11, vehicleId: 1, startDate: "2026-10-10", endDate: "2026-10-10", notes: "oil_change: olie" },
      { id: 12, vehicleId: 2, startDate: "2026-10-05", endDate: "2026-10-09", notes: "breakdown: accu" },
    ];
    const costs = [{ maintenanceBlockId: 10, amount: "120.50" }, { maintenanceBlockId: 12, amount: 80 }, { maintenanceBlockId: null, amount: 999 }];
    const rows = downtimeRows(vehicles, visits, costs, "2026-10-01", "2026-10-31", "2026-10-21");
    expect(rows).toEqual([
      { vehicleId: 2, licensePlate: "CC22DD", brand: "Ford", model: "Transit", visits: 1, days: 5, breakdowns: 1, costs: 80 },
      { vehicleId: 1, licensePlate: "AA11BB", brand: "Ford", model: "Transit", visits: 2, days: 3, breakdowns: 1, costs: 120.5 },
    ]);
    expect(downtimeByModel(rows)).toEqual([{ brand: "Ford", model: "Transit", vehicles: 2, visits: 3, days: 8, breakdowns: 2, costs: 200.5 }]);
  });
});
