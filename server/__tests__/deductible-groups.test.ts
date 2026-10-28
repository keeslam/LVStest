/**
 * Kees, 2026-10-28 — eigen risico in two groups, car and bus. The vehicle card says which;
 * left empty, the vehicle type decides. Old per-type customer amounts are read as groups
 * (the highest amount in a group). The pickup dialog's confirmed amount wins on the contract.
 */
import { describe, it, expect } from "vitest";
import { contractDeductibles } from "../utils/pdf-generator";
import { autoDeductibleGroup, customerGroupDeductibles, deductibleGroupFor, isValidCustomerDeductibles, pickupDeductibleFrom, resolveDeductibles } from "../../shared/customer-deductibles";
import { insertVehicleSchema } from "../../shared/schema";

describe("deductible groups", () => {
  it("makes vans, trucks, buses, delivery vehicles and 8+ seaters a bus, the rest a car", () => {
    for (const type of ["Van", "Truck", "bestelauto", "Bestelbus", "minibus", "be truck", "VW Transporter", "8 sitter", "9 siter", "9-zitter"]) {
      expect(autoDeductibleGroup(type), type).toBe("bus");
    }
    for (const type of ["Hatchback", "SUV", "Sedan", "Stationwagen", "Coupe", "Scooter", "Trailer", "aanhangwagen", "caravan", "5 sitter", "", null]) {
      expect(autoDeductibleGroup(type), String(type)).toBe("car");
    }
  });

  it("uses the group on the vehicle card over the automatic one", () => {
    expect(deductibleGroupFor({ vehicleType: "Van", deductibleGroup: "car" })).toBe("car");
    expect(deductibleGroupFor({ vehicleType: "SUV", deductibleGroup: "bus" })).toBe("bus");
    expect(deductibleGroupFor({ vehicleType: "Van", deductibleGroup: null })).toBe("bus");
    expect(deductibleGroupFor({ vehicleType: "Van", deductibleGroup: "truck" })).toBe("bus");
    expect(insertVehicleSchema.shape.deductibleGroup.safeParse("truck").success).toBe(false);
    expect(insertVehicleSchema.shape.deductibleGroup.safeParse(null).success).toBe(true);
  });

  it("prints the general car or bus amount, with 750 / 1500 and 1500 / 2500 as defaults", () => {
    expect(contractDeductibles(null, null, "Hatchback").domestic).toMatch(/750,00/);
    expect(contractDeductibles(null, null, "Hatchback").abroad).toMatch(/1\.500,00/);
    expect(contractDeductibles(null, null, { vehicleType: "Van" }).domestic).toMatch(/1\.500,00/);
    expect(contractDeductibles(null, null, { vehicleType: "Van" }).abroad).toMatch(/2\.500,00/);
    const stored = { eigenrisicoBusBinnenland: "1250", eigenrisicoBusBuitenland: "" };
    expect(contractDeductibles(stored, null, { vehicleType: "SUV", deductibleGroup: "bus" }).domestic).toMatch(/1\.250,00/);
    expect(contractDeductibles(stored, null, { vehicleType: "SUV", deductibleGroup: "bus" }).abroad).toMatch(/2\.500,00/);
  });

  it("uses the customer's own amount for the group, the general amount when empty", () => {
    const customer = { byGroup: { bus: { domestic: 1000, abroad: null } } };
    expect(contractDeductibles(null, customer, "Van").domestic).toMatch(/1\.000,00/);
    expect(contractDeductibles(null, customer, "Van").abroad).toMatch(/2\.500,00/);
    expect(contractDeductibles(null, customer, "Hatchback").domestic).toMatch(/750,00/);
  });

  it("reads old per-type amounts as groups, the highest one per group", () => {
    const old = { byType: { "8 sitter": { domestic: 1200 }, bestelauto: { domestic: 1400, abroad: 2000 }, hatchback: { abroad: 900 } } };
    expect(customerGroupDeductibles(old)).toEqual({
      car: { domestic: null, abroad: 900 },
      bus: { domestic: 1400, abroad: 2000 },
    });
    expect(contractDeductibles(null, old, "8 sitter").domestic).toMatch(/1\.400,00/);
  });

  it("accepts groups and the old shape, refuses unknown groups and bad amounts", () => {
    expect(isValidCustomerDeductibles({ byGroup: { car: { domestic: 500 }, bus: { abroad: null } } })).toBe(true);
    expect(isValidCustomerDeductibles({ byType: { van: { domestic: 250 } } })).toBe(true);
    expect(isValidCustomerDeductibles({ byGroup: { truck: { domestic: 500 } } })).toBe(false);
    expect(isValidCustomerDeductibles({ byGroup: { car: { domestic: -1 } } })).toBe(false);
    expect(isValidCustomerDeductibles({})).toBe(false);
  });

  it("proposes the amount for the pickup dialog and prints the confirmed one", () => {
    const customer = { byGroup: { bus: { domestic: 1000 } } };
    expect(resolveDeductibles(null, customer, { vehicleType: "Van" })).toEqual({ group: "bus", domestic: 1000, abroad: 2500 });
    expect(resolveDeductibles({ eigenrisicoBinnenland: "800,50" }, null, "Hatchback")).toEqual({ group: "car", domestic: 800.5, abroad: 1500 });
    const confirmed = contractDeductibles(null, customer, "Van", { domestic: "1100", abroad: "3000" });
    expect(confirmed.domestic).toMatch(/1\.100,00/);
    expect(confirmed.abroad).toMatch(/3\.000,00/);
    expect(contractDeductibles(null, customer, "Van", { domestic: null, abroad: null }).domestic).toMatch(/1\.000,00/);
    expect(pickupDeductibleFrom({ domestic: 750, abroad: 1500 })).toEqual({ domestic: 750, abroad: 1500 });
    expect(pickupDeductibleFrom({ domestic: -1, abroad: 1500 })).toBeNull();
    expect(pickupDeductibleFrom({ domestic: "750", abroad: 1500 })).toBeNull();
    expect(pickupDeductibleFrom(undefined)).toBeNull();
  });
});
