/**
 * A-8-4 (fysieke E2E-audit 2026-10-09, module 8) — a transport report for a
 * vehicle without a real brand and model was saved as
 * "Transport_Report_Unknown_Unknown_..." — a name that tells nobody which car
 * it is about. The plate carries the file name in that case.
 */
import { describe, it, expect } from "vitest";
import { transportReportVehicleLabel } from "../utils/transport-report-filename";

describe("transportReportVehicleLabel", () => {
  it("uses brand and model when the vehicle has them", () => {
    expect(transportReportVehicleLabel({ vehicle: { brand: "VW", model: "Crafter", licensePlate: "AB-12-CD" }, vehicleId: 1 })).toBe("VW_Crafter");
  });

  it("falls back to the plate when brand and model are the 'Unknown' placeholders", () => {
    expect(transportReportVehicleLabel({ vehicle: { brand: "Unknown", model: "Unknown", licensePlate: "AB-12-CD" }, vehicleId: 1 })).toBe("AB-12-CD");
  });

  it("falls back to the plate when brand and model are empty", () => {
    expect(transportReportVehicleLabel({ vehicle: { brand: "", model: null, licensePlate: "AB-12-CD" }, vehicleId: 1 })).toBe("AB-12-CD");
  });

  it("keeps the one real part when only one is a placeholder", () => {
    expect(transportReportVehicleLabel({ vehicle: { brand: "Ford", model: "Unknown", licensePlate: "AB-12-CD" }, vehicleId: 1 })).toBe("Ford");
  });

  it("uses an external vehicle's own data, plate last", () => {
    expect(transportReportVehicleLabel({ isExternalVehicle: true, externalBrand: "Opel", externalModel: "Vivaro", externalLicensePlate: "XX-99-YY", vehicleId: null })).toBe("Opel_Vivaro");
    expect(transportReportVehicleLabel({ isExternalVehicle: true, externalBrand: null, externalModel: null, externalLicensePlate: "XX-99-YY", vehicleId: null })).toBe("XX-99-YY");
    expect(transportReportVehicleLabel({ isExternalVehicle: true, externalBrand: null, externalModel: null, externalLicensePlate: null, vehicleId: null })).toBe("External");
  });

  it("falls back to the vehicle id as a last resort", () => {
    expect(transportReportVehicleLabel({ vehicleId: 42 })).toBe("Vehicle_42");
  });
});
