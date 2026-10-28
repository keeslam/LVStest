/**
 * Kees, 2026-10-20 (round 2, punt 2): the contract can carry the odometer and fuel
 * level at pickup and the deductible. Before the pickup the readings stay empty so
 * they can be written in by hand. The editor's other offered fields now print too.
 */
import { describe, it, expect } from "vitest";
import { contractDeductibles, contractFuelLevel, prepareContractData } from "../utils/pdf-generator";

const reservation = (over: Record<string, unknown> = {}) => ({
  id: 1, contractNumber: "C-1", startDate: "2026-10-01", endDate: "2026-10-08", totalPrice: "100",
  vehicle: { licensePlate: "AB123C", brand: "Opel", model: "Vivaro", chassisNumber: "", vehicleType: "Bestelbus", fuel: "Diesel", apkDate: "2027-03-15" },
  customer: { name: "Klant", city: "Utrecht", postalCode: "1234 AB", phone: "", driverLicenseNumber: "", email: "k@example.nl", companyName: "Klant BV" },
  ...over,
}) as any;

describe("contract pickup readings and deductible", () => {
  it("leaves the pickup readings empty before the pickup", () => {
    const data = prepareContractData(reservation());
    expect(data.pickupMileage).toBe("");
    expect(data.fuelLevelPickup).toBe("");
  });

  it("prints the readings written down at pickup, in Dutch", () => {
    const data = prepareContractData(reservation({ pickupMileage: 12345, fuelLevelPickup: "Full" }));
    expect(data.pickupMileage).toBe("12.345 km");
    expect(data.fuelLevelPickup).toBe("vol");
    expect(contractFuelLevel("3/4")).toBe("3/4");
    expect(contractFuelLevel("empty")).toBe("leeg");
  });

  it("prints the deductible from the business rules, or the settings form's defaults", () => {
    const saved = prepareContractData(reservation(), { eigenrisicoBinnenland: "750", eigenrisicoBuitenland: "1500" });
    expect(saved.deductibleDomestic).toMatch(/750,00/);
    expect(saved.deductibleAbroad).toMatch(/1\.500,00/);
    // Kees 2026-10-28: the car defaults are 750 / 1500.
    expect(contractDeductibles(null).domestic).toMatch(/750,00/);
    expect(contractDeductibles({ eigenrisicoBinnenland: "" }).abroad).toMatch(/1\.500,00/);
  });

  it("fills the fields the template editor has long offered", () => {
    const data = prepareContractData(reservation());
    expect(data.vehicleType).toBe("Bestelbus");
    expect(data.fuelType).toBe("Diesel");
    expect(data.apkDate).toBe("15-03-2027");
    expect(data.customerEmail).toBe("k@example.nl");
    expect(data.companyName).toBe("Klant BV");
  });
});
