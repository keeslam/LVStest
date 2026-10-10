/**
 * Final wave A, item 6 (P11 follow-up, minor 2): one `comparableTemplate` for the three template
 * editors, with the contract editor's whitelist semantics. Two versions are "the same" for the
 * unsaved-changes check when everything the person can edit is equal; what the server adds on its own
 * (updatedAt, the background paths, ids of the stored row) never makes an editor dirty.
 */
import { describe, it, expect } from "vitest";
import { comparableTemplate } from "@/pages/documents/comparable-template";

const field = { id: "f1", name: "Kenteken", x: 10, y: 20, fontSize: 12, isBold: false, source: "licensePlate", textAlign: "left" as const };
const template = { id: 3, name: "Standaard", isDefault: true, fields: [field], updatedAt: "2026-10-01T10:00:00Z", backgroundPath: "/a.pdf", backgroundPreviewPath: "/a.png" };

describe("comparableTemplate", () => {
  it("is equal for the same edit state, whatever the server added on its own", () => {
    const fromServer = { ...template, updatedAt: "2026-10-09T10:00:00Z", backgroundPath: null, backgroundPreviewPath: null, id: 3, somethingNew: "x" };
    expect(comparableTemplate(fromServer)).toBe(comparableTemplate(template));
  });

  it("treats missing flags and an undefined field list like false and empty", () => {
    expect(comparableTemplate({ name: "A", isDefault: undefined as any, fields: undefined as any }))
      .toBe(comparableTemplate({ name: "A", isDefault: false, fields: [] }));
    expect(comparableTemplate({ ...template, fields: [{ ...field, locked: undefined }] }))
      .toBe(comparableTemplate({ ...template, fields: [{ ...field, locked: false }] }));
  });

  it("differs for everything the editor lets the person change", () => {
    const base = comparableTemplate(template);
    expect(comparableTemplate({ ...template, name: "Anders" })).not.toBe(base);
    expect(comparableTemplate({ ...template, isDefault: false })).not.toBe(base);
    expect(comparableTemplate({ ...template, fields: [] })).not.toBe(base);
    for (const change of [{ x: 11 }, { y: 21 }, { fontSize: 14 }, { isBold: true }, { source: "brand" }, { textAlign: "right" as const }, { locked: true }, { name: "Plaat" }]) {
      expect(comparableTemplate({ ...template, fields: [{ ...field, ...change }] }), JSON.stringify(change)).not.toBe(base);
    }
  });

  it("ignores a key the editor does not edit, but compares the extras an editor names (a barcode label's size and bar sizes)", () => {
    const label = { ...template, labelWidthMm: 62, labelHeightMm: 29, fields: [{ ...field, barcodeHeightMm: 10 }] };
    const options = { templateKeys: ["labelWidthMm", "labelHeightMm"], fieldKeys: ["barcodeHeightMm", "barcodeWidthMm"] } as const;
    expect(comparableTemplate(label)).toBe(comparableTemplate({ ...label, labelWidthMm: 30 }));
    expect(comparableTemplate({ ...label, labelWidthMm: 30 }, options)).not.toBe(comparableTemplate(label, options));
    expect(comparableTemplate({ ...label, fields: [{ ...field, barcodeHeightMm: 12 }] }, options)).not.toBe(comparableTemplate(label, options));
    expect(comparableTemplate({ ...label, fields: [{ ...field, barcodeWidthMm: 40 }] }, options)).not.toBe(comparableTemplate(label, options));
  });
});
