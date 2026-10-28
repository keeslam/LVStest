/**
 * Kees, 2026-10-28 — eigen risico in two groups, car and bus. The types ticked as bus in
 * Bedrijfsregels are a bus, every other type a car. Old per-type customer amounts are
 * read as groups (the highest amount in a group).
 */
import { describe, it, expect } from "vitest";
import { contractDeductibles } from "../utils/pdf-generator";
import { busVehicleTypeKeys, customerGroupDeductibles, deductibleGroupFor, isValidCustomerDeductibles, pickupDeductibleFrom, resolveDeductibles } from "../../shared/customer-deductibles";

const rules = { busVehicleTypes: ["8 Sitter", "bestelauto"] };

describe("deductible groups", () => {
  it("counts only the ticked types as a bus, case-insensitive", () => {
    const busTypes = busVehicleTypeKeys(rules);
    expect(deductibleGroupFor("8 sitter", busTypes)).toBe("bus");
    expect(deductibleGroupFor("Bestelauto", busTypes)).toBe("bus");
    expect(deductibleGroupFor("Hatchback", busTypes)).toBe("car");
    expect(deductibleGroupFor(null, busTypes)).toBe("car");
    expect(busVehicleTypeKeys({ busVehicleTypes: "8 sitter" }).size).toBe(0);
  });

  it("prints the general car or bus amount, with 750 / 1500 and 1500 / 2500 as defaults", () => {
    expect(contractDeductibles(rules, null, "Hatchback")).toEqual(contractDeductibles(null, null, "Hatchback"));
    expect(contractDeductibles(rules, null, "Hatchback").domestic).toMatch(/750,00/);
    expect(contractDeductibles(rules, null, "Hatchback").abroad).toMatch(/1\.500,00/);
    expect(contractDeductibles(rules, null, "8 sitter").domestic).toMatch(/1\.500,00/);
    expect(contractDeductibles(rules, null, "8 sitter").abroad).toMatch(/2\.500,00/);
    const stored = { ...rules, eigenrisicoBusBinnenland: "1250", eigenrisicoBusBuitenland: "" };
    expect(contractDeductibles(stored, null, "bestelauto").domestic).toMatch(/1\.250,00/);
    expect(contractDeductibles(stored, null, "bestelauto").abroad).toMatch(/2\.500,00/);
  });

  it("uses the customer's own amount for the group, the general amount when empty", () => {
    const customer = { byGroup: { bus: { domestic: 1000, abroad: null } } };
    expect(contractDeductibles(rules, customer, "8 sitter").domestic).toMatch(/1\.000,00/);
    expect(contractDeductibles(rules, customer, "8 sitter").abroad).toMatch(/2\.500,00/);
    expect(contractDeductibles(rules, customer, "Hatchback").domestic).toMatch(/750,00/);
  });

  it("reads old per-type amounts as groups, the highest one per group", () => {
    const old = { byType: { "8 sitter": { domestic: 1200 }, bestelauto: { domestic: 1400, abroad: 2000 }, hatchback: { abroad: 900 } } };
    expect(customerGroupDeductibles(old, busVehicleTypeKeys(rules))).toEqual({
      car: { domestic: null, abroad: 900 },
      bus: { domestic: 1400, abroad: 2000 },
    });
    expect(contractDeductibles(rules, old, "8 sitter").domestic).toMatch(/1\.400,00/);
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
    expect(resolveDeductibles(rules, customer, "8 sitter")).toEqual({ group: "bus", domestic: 1000, abroad: 2500 });
    expect(resolveDeductibles({ eigenrisicoBinnenland: "800,50" }, null, "Hatchback")).toEqual({ group: "car", domestic: 800.5, abroad: 1500 });
    const confirmed = contractDeductibles(rules, customer, "8 sitter", { domestic: "1100", abroad: "3000" });
    expect(confirmed.domestic).toMatch(/1\.100,00/);
    expect(confirmed.abroad).toMatch(/3\.000,00/);
    expect(contractDeductibles(rules, customer, "8 sitter", { domestic: null, abroad: null }).domestic).toMatch(/1\.000,00/);
    expect(pickupDeductibleFrom({ domestic: 750, abroad: 1500 })).toEqual({ domestic: 750, abroad: 1500 });
    expect(pickupDeductibleFrom({ domestic: -1, abroad: 1500 })).toBeNull();
    expect(pickupDeductibleFrom({ domestic: "750", abroad: 1500 })).toBeNull();
    expect(pickupDeductibleFrom(undefined)).toBeNull();
  });
});
