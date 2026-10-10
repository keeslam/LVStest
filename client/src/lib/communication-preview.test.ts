/**
 * Audit 2026-10-09, module 13, finding 3 (A-13-3): the preview filled the
 * placeholders for the first recipient only, with "[Kenteken]" for what it did
 * not know, and showed "N/A" as the vehicle even after a vehicle was ticked.
 * The recipients and the placeholder values are now built per recipient, the
 * way the send route resolves them.
 */
import { describe, it, expect } from "vitest";
import {
  autoEmailField, emailOptionsOf, placeholderValuesFor, buildRecipients, renderForRecipient, emptyPlaceholders,
  MASS_SEND_THRESHOLD,
} from "./communication-preview";

const customerA: any = { id: 1, name: "Audit Testklant B.v.", email: "a@e2e.invalid", emailForMOT: "apk@e2e.invalid", emailGeneral: null, emailForInvoices: null };
const customerB: any = { id: 2, name: "Tweede Klant", email: null, emailForMOT: "alleen-apk@e2e.invalid", emailGeneral: null, emailForInvoices: null };
const customerC: any = { id: 3, name: "Derde Klant", email: null, emailForMOT: null, emailGeneral: "algemeen@e2e.invalid", emailForInvoices: null };
const vehicle1: any = { id: 10, licensePlate: "97GRD4", brand: "Toyota", model: "Yaris", apkDate: "2026-12-31" };
const vehicle2: any = { id: 11, licensePlate: "12ABCD", brand: "Ford", model: "Focus", apkDate: null };
const items: any[] = [
  { vehicle: vehicle1, customer: customerA },
  { vehicle: vehicle2, customer: null },
];

describe("which address the send route uses", () => {
  it("auto is the primary address, then the general one, and nothing else (as the route does for a saved template)", () => {
    expect(autoEmailField(customerA)).toBe("email");
    expect(autoEmailField(customerC)).toBe("emailGeneral");
    expect(autoEmailField(customerB)).toBeNull();
  });

  it("lists every address a customer has", () => {
    expect(emailOptionsOf(customerA).map((o) => o.field)).toEqual(["email", "emailForMOT"]);
    expect(emailOptionsOf(customerB).map((o) => o.field)).toEqual(["emailForMOT"]);
  });
});

describe("placeholder values per recipient", () => {
  it("takes customer and vehicle data the way the route does", () => {
    expect(placeholderValuesFor(vehicle1, customerA)).toEqual({
      customerName: "Audit Testklant B.v.",
      vehiclePlate: "97-GRD-4",
      vehicleBrand: "Toyota",
      vehicleModel: "Yaris",
      apkDate: new Date("2026-12-31").toLocaleDateString("nl-NL"),
    });
  });

  it("is empty for what is not known (a customer without a vehicle has no plate)", () => {
    expect(placeholderValuesFor(null, customerA)).toMatchObject({ vehiclePlate: "", vehicleBrand: "", vehicleModel: "", apkDate: "" });
  });
});

describe("recipients", () => {
  it("APK/Onderhoud: one per ticked vehicle, with its renter, and a vehicle without a renter goes to the office", () => {
    const rows = buildRecipients({ mode: "apk", selectedVehicles: [vehicle1, vehicle2], selectedCustomers: [], vehicleItems: items });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Audit Testklant B.v.", vehicleLicense: "97-GRD-4", emailField: "email", email: "a@e2e.invalid", office: false });
    expect(rows[1]).toMatchObject({ office: true, vehicleLicense: "12-AB-CD" });
  });

  it("Aangepast: ticked customers AND the renters of ticked vehicles, a customer once", () => {
    const rows = buildRecipients({
      mode: "custom", selectedVehicles: [vehicle1], selectedCustomers: [customerA, customerC], vehicleItems: items,
    });
    expect(rows.map((r) => r.name)).toEqual(["Audit Testklant B.v.", "Derde Klant"]);
    expect(rows[0].vehicleLicense).toBe("97-GRD-4");
    expect(rows[1].vehicleLicense).toBeNull();
    // The values of the first recipient carry the vehicle, the second has none.
    expect(rows[0].values.vehiclePlate).toBe("97-GRD-4");
    expect(rows[1].values.vehiclePlate).toBe("");
  });

  it("a customer with no address the route accepts is marked, not hidden", () => {
    const rows = buildRecipients({ mode: "custom", selectedVehicles: [], selectedCustomers: [customerB], vehicleItems: items });
    expect(rows[0]).toMatchObject({ emailField: null, email: null });
    expect(rows[0].emailOptions).toHaveLength(1);
  });
});

describe("rendering", () => {
  it("fills both brace styles with the recipient's own values", () => {
    const [row] = buildRecipients({ mode: "apk", selectedVehicles: [vehicle1], selectedCustomers: [], vehicleItems: items });
    expect(renderForRecipient("Beste {customerName} / {{customerName}}, {vehiclePlate} {{ vehicleBrand }}", row)).toBe(
      "Beste Audit Testklant B.v. / Audit Testklant B.v., 97-GRD-4 Toyota",
    );
  });

  it("names the placeholders that come out empty for a recipient", () => {
    const rows = buildRecipients({ mode: "custom", selectedVehicles: [], selectedCustomers: [customerA], vehicleItems: items });
    expect(emptyPlaceholders("Kenteken {vehiclePlate}, naam {customerName}, apk {{apkDate}}", rows[0])).toEqual(["vehiclePlate", "apkDate"]);
  });

  it("asks for a second look from 25 recipients on", () => {
    expect(MASS_SEND_THRESHOLD).toBe(25);
  });
});
