import { describe, it, expect } from "vitest";
import { plateUnderBarcode } from "../plate-under-barcode";

const barcode = { id: "b", name: "Barcode", x: 3, y: 1, fontSize: 10, isBold: false, source: "barcode", textAlign: "left" as const, barcodeHeightMm: 7, barcodeWidthMm: 24 };

describe("plateUnderBarcode", () => {
  it("puts a centred, bold plate right under the barcode, as wide as the barcode", () => {
    const r = plateUnderBarcode(barcode, 30, 12, "p");
    if (!r.ok) throw new Error("expected room");
    expect(r.plate).toMatchObject({ source: "licensePlate", x: 3, y: 8.5, textAlign: "center", isBold: true, textWidthMm: 24 });
    // 3.5 mm left under the plate -> 9.5 pt at line-height 1, never above 10 pt
    expect(r.plate.fontSize).toBeLessThanOrEqual(10);
    expect(r.plate.fontSize * (25.4 / 72)).toBeLessThanOrEqual(12 - 8.5);
    expect(r.barcode.barcodeWidthMm).toBe(24);
  });

  it("an automatic barcode width becomes the label width minus the margin on both sides", () => {
    const r = plateUnderBarcode({ ...barcode, barcodeWidthMm: undefined }, 30, 12, "p");
    if (!r.ok) throw new Error("expected room");
    expect(r.barcode.barcodeWidthMm).toBe(24);
    expect(r.plate.textWidthMm).toBe(24);
  });

  it("says so when there is no room under the barcode", () => {
    expect(plateUnderBarcode({ ...barcode, barcodeHeightMm: 10 }, 30, 12, "p")).toEqual({ ok: false, reason: "noRoom" });
  });
});
