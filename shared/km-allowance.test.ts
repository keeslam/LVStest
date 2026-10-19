import { describe, it, expect } from "vitest";
import {
  extraKmSettlement,
  isValidKmAllowance,
  kmAllowanceFromSetting,
  kmRateForVehicle,
  parseReturnExtraCosts,
  vehicleTypeKey,
} from "./km-allowance";

const setting = kmAllowanceFromSetting({
  byType: {
    SUV: { freeKmPerDay: 200, pricePerKm: 0.25 },
    van: { freeKmPerDay: 150, pricePerKm: 0.35 },
    other: { freeKmPerDay: 100, pricePerKm: 0.2 },
  },
});

describe("kmRateForVehicle", () => {
  it("uses the vehicle type default, case-insensitive", () => {
    expect(kmRateForVehicle({ vehicleType: "Van" }, setting)).toEqual({ freeKmPerDay: 150, pricePerKm: 0.35 });
    expect(kmRateForVehicle({ vehicleType: "suv" }, setting)).toEqual({ freeKmPerDay: 200, pricePerKm: 0.25 });
  });

  it("lets the vehicle override each value on its own", () => {
    expect(kmRateForVehicle({ vehicleType: "Van", freeKmPerDay: 300 }, setting)).toEqual({ freeKmPerDay: 300, pricePerKm: 0.35 });
    expect(kmRateForVehicle({ vehicleType: "Van", extraKmPrice: "0.5" }, setting)).toEqual({ freeKmPerDay: 150, pricePerKm: 0.5 });
  });

  it("falls back to the 'other' row for an unknown or empty type", () => {
    expect(kmRateForVehicle({ vehicleType: "Scooter" }, setting)).toEqual({ freeKmPerDay: 100, pricePerKm: 0.2 });
    expect(kmRateForVehicle({ vehicleType: null }, setting)).toEqual({ freeKmPerDay: 100, pricePerKm: 0.2 });
  });

  it("has no rate without a setting", () => {
    expect(kmRateForVehicle({ vehicleType: "SUV" }, { byType: {} })).toEqual({ freeKmPerDay: null, pricePerKm: null });
  });
});

describe("extraKmSettlement", () => {
  const base = { pickupDate: "2026-10-01", returnDate: "2026-10-03", pickupMileage: 10_000, rate: { freeKmPerDay: 200, pricePerKm: 0.25 } };

  it("charges the km above days x free km", () => {
    // 3 days (1 t/m 3 oktober) x 200 = 600 free; 800 driven -> 200 extra x 0.25 = 50.
    expect(extraKmSettlement({ ...base, returnMileage: 10_800 })).toEqual({ days: 3, driven: 800, freeKm: 600, extraKm: 200, cost: 50 });
  });

  it("charges nothing within the free km", () => {
    expect(extraKmSettlement({ ...base, returnMileage: 10_500 })?.cost).toBe(0);
  });

  it("rounds to cents", () => {
    expect(extraKmSettlement({ ...base, returnMileage: 10_603, rate: { freeKmPerDay: 200, pricePerKm: 0.333 } })?.cost).toBe(1);
  });

  it("is null when something is missing", () => {
    expect(extraKmSettlement({ ...base, returnMileage: 10_800, rate: { freeKmPerDay: null, pricePerKm: 0.25 } })).toBeNull();
    expect(extraKmSettlement({ ...base, returnMileage: null })).toBeNull();
    expect(extraKmSettlement({ ...base, returnMileage: 10_800, pickupDate: null })).toBeNull();
  });
});

describe("setting", () => {
  it("normalises the type keys", () => {
    expect(vehicleTypeKey(" SUV ")).toBe("suv");
    expect(vehicleTypeKey("")).toBe("other");
    expect(Object.keys(setting.byType).sort()).toEqual(["other", "suv", "van"]);
  });

  it("validates what is stored", () => {
    expect(isValidKmAllowance({ byType: { suv: { freeKmPerDay: 200, pricePerKm: 0.25 }, van: { freeKmPerDay: null, pricePerKm: null } } })).toBe(true);
    expect(isValidKmAllowance({ byType: { suv: { freeKmPerDay: -1, pricePerKm: 0.25 } } })).toBe(false);
    expect(isValidKmAllowance({ byType: { suv: { freeKmPerDay: "200", pricePerKm: 0.25 } } })).toBe(false);
    expect(isValidKmAllowance({ byType: [] })).toBe(false);
    expect(isValidKmAllowance(null)).toBe(false);
  });
});

describe("parseReturnExtraCosts", () => {
  it("reads amounts, a comma as decimal point, and empty as nothing", () => {
    expect(parseReturnExtraCosts({ fuelCost: "25,50", extraKm: 200, extraKmCost: 50 })).toEqual({ ok: true, value: { fuelCost: 25.5, extraKm: 200, extraKmCost: 50 } });
    expect(parseReturnExtraCosts({})).toEqual({ ok: true, value: { fuelCost: null, extraKm: null, extraKmCost: null } });
  });

  it("names the wrong field", () => {
    expect(parseReturnExtraCosts({ fuelCost: -1 })).toEqual({ ok: false, field: "fuelCost" });
    expect(parseReturnExtraCosts({ extraKm: 2.5 })).toEqual({ ok: false, field: "extraKm" });
    expect(parseReturnExtraCosts({ extraKmCost: "veel" })).toEqual({ ok: false, field: "extraKmCost" });
  });
});
