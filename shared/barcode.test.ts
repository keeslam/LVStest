import { describe, it, expect } from "vitest";
import {
  parseBarcode, normalizeScannedCode, shortKeyLabelCode, expandShortKeyCode,
  formatVehicleBarcode, formatSpareKeyBarcode,
} from "./barcode";

// A 30x12 mm key label has ~24 mm for the bars: VEH-000123 (123 modules) is too fine to scan,
// so the label carries a short code that the scanner side expands back to the stored code.
describe("short key-label codes", () => {
  it("shortens main, revised and spare codes", () => {
    expect(shortKeyLabelCode("VEH-000123")).toBe("V123");
    expect(shortKeyLabelCode("VEH-000123-R2")).toBe("V123R2");
    expect(shortKeyLabelCode("VEH-000123-S")).toBe("S123");
    expect(shortKeyLabelCode(formatSpareKeyBarcode(45))).toBe("S45");
    expect(shortKeyLabelCode("VEH-000123-R2-S")).toBe("S123R2");
  });

  it("leaves anything else (reservation, unknown) untouched", () => {
    expect(shortKeyLabelCode("RES-000009")).toBe("RES-000009");
    expect(shortKeyLabelCode("ABC")).toBe("ABC");
  });

  it("is much shorter: at most 5 characters for ids up to 9999", () => {
    expect(shortKeyLabelCode(formatVehicleBarcode(9999)).length).toBeLessThanOrEqual(5);
  });

  it("expands back to the stored code, any case, with scanner whitespace", () => {
    expect(expandShortKeyCode("V123")).toBe("VEH-000123");
    expect(expandShortKeyCode(" v123r2\r\n")).toBe("VEH-000123-R2");
    expect(expandShortKeyCode("S123")).toBe("VEH-000123-S");
    expect(expandShortKeyCode("S123R2")).toBe("VEH-000123-R2-S");
    expect(expandShortKeyCode("VEH-000123")).toBeNull();
    expect(expandShortKeyCode("V")).toBeNull();
    expect(expandShortKeyCode("12-XT-102")).toBeNull();
    expect(expandShortKeyCode("V12AB")).toBeNull();
  });

  it("round-trips through parseBarcode and normalizeScannedCode", () => {
    for (const code of ["VEH-000123", "VEH-000123-R3", "VEH-000123-S", "VEH-001234-R2-S"]) {
      expect(normalizeScannedCode(shortKeyLabelCode(code))).toBe(code);
    }
    expect(parseBarcode("V123")).toEqual({ kind: "vehicle", vehicleId: 123 });
    expect(parseBarcode("S123")).toEqual({ kind: "vehicle", vehicleId: 123, spareKey: true });
    expect(parseBarcode("VEH-000123")).toEqual({ kind: "vehicle", vehicleId: 123 });
  });
});
