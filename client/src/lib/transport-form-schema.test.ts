/**
 * A-8-4 (fysieke E2E-audit 2026-10-09, module 8) — the transport form said
 * "Please select a vehicle" on a Dutch screen. Its messages now come from the
 * locale files.
 */
import { describe, it, expect } from "vitest";
import nl from "../locales/nl/delivery.json";
import en from "../locales/en/delivery.json";
import { makeTransportFormSchema } from "./transport-form-schema";

const t = (key: string) => key;
const schema = makeTransportFormSchema(t);

function messages(values: Record<string, unknown>) {
  const res = schema.safeParse({ transportType: "swap", scheduledDate: "2026-10-10", ...values });
  return res.success ? {} : Object.fromEntries(res.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("makeTransportFormSchema", () => {
  it("asks for a vehicle through the translator", () => {
    expect(messages({ vehicleId: "" }).vehicleId).toBe("transportDialog.validation.vehicleRequired");
  });
  it("asks for the plate of an external vehicle through the translator", () => {
    expect(messages({ isExternalVehicle: true, externalLicensePlate: " " }).externalLicensePlate)
      .toBe("transportDialog.validation.licensePlateRequired");
  });
  it("asks for a date and a type through the translator", () => {
    expect(messages({ vehicleId: "1", scheduledDate: "" }).scheduledDate).toBe("transportDialog.validation.scheduledDateRequired");
    expect(messages({ vehicleId: "1", transportType: undefined }).transportType).toBe("transportDialog.validation.transportTypeRequired");
  });
  it("accepts a valid transport", () => {
    expect(messages({ vehicleId: "1" })).toEqual({});
  });
  it("has the four messages in both languages", () => {
    for (const lang of [nl, en] as any[]) {
      for (const key of ["vehicleRequired", "licensePlateRequired", "scheduledDateRequired", "transportTypeRequired"]) {
        expect(lang.transportDialog.validation[key], key).toBeTruthy();
      }
    }
  });
});
