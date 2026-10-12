import { describe, it, expect } from "vitest";
import { vehicleName } from "./vehicle-name";

describe("vehicleName", () => {
  it("does not repeat a brand the model already starts with", () => {
    expect(vehicleName("PEUGEOT", "PEUGEOT BOXER")).toBe("PEUGEOT BOXER");
    expect(vehicleName("Fiat", "FIAT DUCATO")).toBe("FIAT DUCATO");
  });
  it("joins brand and model otherwise", () => {
    expect(vehicleName("Renault", "Master T 35")).toBe("Renault Master T 35");
    expect(vehicleName("Volkswagen", "Transporter")).toBe("Volkswagen Transporter");
  });
  it("copes with a missing brand or model", () => {
    expect(vehicleName("", "Boxer")).toBe("Boxer");
    expect(vehicleName("Opel", "")).toBe("Opel");
    expect(vehicleName(null, undefined)).toBe("");
  });
  it("a model that already starts with the brand text is shown as it is", () => {
    expect(vehicleName("Ford", "Fordson Major")).toBe("Fordson Major");
  });
});
