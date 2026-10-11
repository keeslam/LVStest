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
  unsupportedPlaceholders, KNOWN_PLACEHOLDERS, MASS_SEND_THRESHOLD,
} from "./communication-preview";

const customerA: any = { id: 1, name: "Audit Testklant B.v.", email: "a@e2e.invalid", emailForMOT: "apk@e2e.invalid", emailGeneral: null, emailForInvoices: null, phone: "06-11111111" };
const customerB: any = { id: 2, name: "Tweede Klant", email: null, emailForMOT: "alleen-apk@e2e.invalid", emailGeneral: null, emailForInvoices: null };
const customerC: any = { id: 3, name: "Derde Klant", email: null, emailForMOT: null, emailGeneral: "algemeen@e2e.invalid", emailForInvoices: null };
const vehicle1: any = { id: 10, licensePlate: "97GRD4", brand: "Toyota", model: "Yaris", apkDate: "2026-12-31", lastServiceDate: "2026-03-04" };
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
  it("takes customer and vehicle data the way the route does (D15: all eleven keys)", () => {
    const values = placeholderValuesFor(vehicle1, customerA, {
      companyName: "Garage Voorbeeld",
      reservation: { startDate: "2026-10-01", endDate: "2026-10-09" },
    });
    expect(values).toEqual({
      customerName: "Audit Testklant B.v.",
      vehiclePlate: "97-GRD-4",
      vehicleBrand: "Toyota",
      vehicleModel: "Yaris",
      apkDate: new Date("2026-12-31").toLocaleDateString("nl-NL"),
      companyName: "Garage Voorbeeld",
      customerEmail: "a@e2e.invalid",
      customerPhone: "06-11111111",
      reservationStart: "01-10-2026",
      reservationEnd: "09-10-2026",
      maintenanceDate: "",
    });
    expect(Object.keys(values).sort()).toEqual([...KNOWN_PLACEHOLDERS].sort());
  });

  it("fills maintenanceDate only for a maintenance template", () => {
    expect(placeholderValuesFor(vehicle1, customerA, { category: "maintenance" }).maintenanceDate).toBe("04-03-2026");
    expect(placeholderValuesFor(vehicle1, customerA, { category: "custom" }).maintenanceDate).toBe("");
  });

  it("defaults the company name and leaves reservation dates empty without a reservation", () => {
    expect(placeholderValuesFor(vehicle1, customerA)).toMatchObject({ companyName: "Autolease Lam", reservationStart: "", reservationEnd: "" });
  });

  it("is empty for what is not known (a customer without a vehicle has no plate)", () => {
    expect(placeholderValuesFor(null, customerA)).toMatchObject({ vehiclePlate: "", vehicleBrand: "", vehicleModel: "", apkDate: "", maintenanceDate: "" });
  });
});

describe("recipients carry the reservation of their vehicle (D15)", () => {
  it("the dates of the running reservation reach the values of that recipient only", () => {
    const withReservation: any[] = [
      { vehicle: vehicle1, customer: customerA, reservation: { startDate: "2026-10-01", endDate: "2026-10-09" } },
      { vehicle: vehicle2, customer: null },
    ];
    const rows = buildRecipients({ mode: "apk", selectedVehicles: [vehicle1, vehicle2], selectedCustomers: [], vehicleItems: withReservation, companyName: "Garage Voorbeeld" });
    expect(rows[0].values).toMatchObject({ reservationStart: "01-10-2026", reservationEnd: "09-10-2026", companyName: "Garage Voorbeeld" });
    expect(rows[1].values.reservationStart).toBe("");
  });

  it("a customer picked without a vehicle has no reservation dates, and the chosen address fills customerEmail", () => {
    const [row] = buildRecipients({ mode: "custom", selectedVehicles: [], selectedCustomers: [customerA], vehicleItems: items });
    expect(row.values.reservationStart).toBe("");
    expect(renderForRecipient("{customerEmail}", row)).toBe("a@e2e.invalid");
    expect(renderForRecipient("{customerEmail}", { ...row, email: "apk@e2e.invalid" })).toBe("apk@e2e.invalid");
  });

  it("the category of the template reaches maintenanceDate", () => {
    const [row] = buildRecipients({ mode: "custom", selectedVehicles: [vehicle1], selectedCustomers: [], vehicleItems: items, category: "maintenance" });
    expect(row.values.maintenanceDate).toBe("04-03-2026");
  });
});

describe("the preview shows the maintenance date the server sends (df-review Minor 1)", () => {
  const noServiceDate = { ...vehicle1, lastServiceDate: null };

  it("takes the row's maintenanceDate (a maintenance block) when the vehicle has no service date", () => {
    const rows: any[] = [{ vehicle: noServiceDate, customer: customerA, maintenanceDate: "2026-10-12" }];
    const [row] = buildRecipients({ mode: "custom", selectedVehicles: [noServiceDate], selectedCustomers: [], vehicleItems: rows, category: "maintenance" });
    expect(row.values.maintenanceDate).toBe("12-10-2026");
  });

  it("the row's answer wins over the vehicle row, and null means the placeholder is empty, as in the mail", () => {
    const withBoth: any[] = [{ vehicle: vehicle1, customer: customerA, maintenanceDate: "2026-10-12" }];
    expect(buildRecipients({ mode: "custom", selectedVehicles: [vehicle1], selectedCustomers: [], vehicleItems: withBoth, category: "maintenance" })[0].values.maintenanceDate).toBe("12-10-2026");
    const none: any[] = [{ vehicle: noServiceDate, customer: customerA, maintenanceDate: null }];
    expect(buildRecipients({ mode: "custom", selectedVehicles: [noServiceDate], selectedCustomers: [], vehicleItems: none, category: "maintenance" })[0].values.maintenanceDate).toBe("");
  });

  it("is empty for other categories whatever the row says", () => {
    const rows: any[] = [{ vehicle: noServiceDate, customer: customerA, maintenanceDate: "2026-10-12" }];
    expect(buildRecipients({ mode: "custom", selectedVehicles: [noServiceDate], selectedCustomers: [], vehicleItems: rows, category: "custom" })[0].values.maintenanceDate).toBe("");
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

describe("unsupported placeholders", () => {
  it("none of the eleven known keys is reported, a typo is", () => {
    const all = KNOWN_PLACEHOLDERS.map((key) => `{${key}}`).join(" ");
    expect(unsupportedPlaceholders(all)).toEqual([]);
    expect(unsupportedPlaceholders("{customerName} {{companyNaam}} {css}")).toEqual(["companyNaam", "css"]);
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
