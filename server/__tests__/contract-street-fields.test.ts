/**
 * 2026-10-17: contract forms have a box for the street and one for the house number. Nearly
 * every customer was typed with only "Hoofdstraat 1" in the address line, so the contract
 * data reads the street and number from there when no street name was stored.
 */
import { describe, it, expect } from "vitest";
import { prepareContractData } from "../utils/pdf-generator";

const reservation = (customer: Record<string, unknown>) => ({
  id: 1, contractNumber: "C-1", startDate: "2026-10-01", endDate: "2026-10-08", totalPrice: "100",
  vehicle: { licensePlate: "AB123C", brand: "Opel", model: "Vivaro", chassisNumber: "" },
  customer: { name: "Klant", city: "Utrecht", postalCode: "1234 AB", phone: "", driverLicenseNumber: "", ...customer },
}) as any;

describe("prepareContractData street name and house number", () => {
  it("reads street and number from the address line when no street name was stored", () => {
    const data = prepareContractData(reservation({ streetName: null, address: "Van der Helstlaan 4A" }));
    expect(data.customerAddress).toBe("Van der Helstlaan 4A");
    expect(data.customerStreetName).toBe("Van der Helstlaan");
    expect(data.customerHouseNumber).toBe("4A");
  });

  it("prints street and number together when the address line holds only the number", () => {
    const data = prepareContractData(reservation({ streetName: "Kerkweg", address: "47a" }));
    expect(data.customerAddress).toBe("Kerkweg 47A");
    expect(data.customerStreetName).toBe("Kerkweg");
    expect(data.customerHouseNumber).toBe("47A");
  });

  it("keeps a stored street name and copes with a missing customer", () => {
    expect(prepareContractData(reservation({ streetName: "Coolsingel", address: "Hoofdstraat 12-3" })).customerStreetName).toBe("Coolsingel");
    expect(prepareContractData(reservation({ streetName: "Coolsingel", address: "Hoofdstraat 12-3" })).customerHouseNumber).toBe("12-3");
    const none = prepareContractData({ ...reservation({}), customer: null });
    expect(none.customerStreetName).toBe("");
    expect(none.customerHouseNumber).toBe("");
  });
});
