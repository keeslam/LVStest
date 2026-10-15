/**
 * The tape label as a picture: drawn like the template, sent to DYMO Connect as one image.
 * jsdom with the real canvas package, so the pixels are real.
 */
import { describe, it, expect } from "vitest";
import { code128Modules, renderTapeLabelCanvas, renderTapeLabelPngBase64, TAPE_IMAGE_DPI } from "@/lib/tape-label-image";
import { buildTapeImageLabelXml, mmToTwips } from "@/lib/dymo-label";

const PX_PER_MM = TAPE_IMAGE_DPI / 25.4;
const vehicle = { id: 4, barcode: "V4", licensePlate: "12-XT-102", brand: "VW", model: "Golf" };
const fields = [
  { id: "b", name: "Barcode", x: 3, y: 1, fontSize: 10, isBold: false, source: "barcode", textAlign: "left" as const, barcodeHeightMm: 7, barcodeWidthMm: 24 },
  { id: "p", name: "Kenteken", x: 3, y: 8.5, fontSize: 9, isBold: true, source: "licensePlate", textAlign: "center" as const, textWidthMm: 24 },
];

function darkColumns(canvas: HTMLCanvasElement, y: number): number[] {
  const row = canvas.getContext("2d")!.getImageData(0, y, canvas.width, 1).data;
  const cols: number[] = [];
  for (let x = 0; x < canvas.width; x += 1) if (row[x * 4] < 128) cols.push(x);
  return cols;
}

describe("renderTapeLabelCanvas", () => {
  it("is exactly the label size at 360 dpi", () => {
    const canvas = renderTapeLabelCanvas({ lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "V4" });
    expect(canvas.width).toBe(Math.round(30 * PX_PER_MM));
    expect(canvas.height).toBe(Math.round(12 * PX_PER_MM));
  });

  it("draws the barcode as the Code 128 modules, a whole number of pixels each, inside its box", () => {
    const canvas = renderTapeLabelCanvas({ lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "V4" });
    const modules = code128Modules("V4");
    expect(modules).toHaveLength(57);
    const barRow = darkColumns(canvas, Math.round(4 * PX_PER_MM));
    const boxLeft = Math.round(3 * PX_PER_MM);
    const boxRight = boxLeft + Math.round(24 * PX_PER_MM);
    const spanPx = barRow[barRow.length - 1] - barRow[0] + 1;
    const boxPx = boxRight - boxLeft;
    // starts at the box and ends within a module of its right edge: same width as the template says
    expect(barRow[0]).toBeGreaterThanOrEqual(boxLeft);
    expect(Math.abs(spanPx - boxPx)).toBeLessThanOrEqual(2 * Math.round(boxPx / modules.length));
    // white left of the bars (the label's own margin) and nothing past the label
    expect(barRow.some(x => x < boxLeft)).toBe(false);
    expect(barRow[barRow.length - 1]).toBeLessThan(canvas.width);
  });

  it("puts the plate under the barcode, nothing else on the label", () => {
    const canvas = renderTapeLabelCanvas({ lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "V4" });
    // between the bars (y 1..8 mm) and the plate (from 8.5 mm) there is a white gap
    expect(darkColumns(canvas, Math.round(8.2 * PX_PER_MM))).toHaveLength(0);
    const ctx = canvas.getContext("2d")!;
    const plate = ctx.getImageData(0, Math.round(8.5 * PX_PER_MM), canvas.width, Math.round(3 * PX_PER_MM)).data;
    let dark = 0;
    for (let i = 0; i < plate.length; i += 4) if (plate[i] < 128) dark += 1;
    expect(dark).toBeGreaterThan(200);
  });
});

describe("renderTapeStripCanvas", () => {
  it("puts the labels side by side with a cut line before, between and after, the gap on both sides of each", async () => {
    const { renderTapeStripCanvas, tapeStripLengthMm, CUT_LINE_MM } = await import("@/lib/tape-label-image");
    const one = { lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "V4" };
    const canvas = renderTapeStripCanvas([one, { ...one, code: "V5" }, { ...one, code: "V6" }], 2);
    expect(tapeStripLengthMm(3, 30, 2)).toBeCloseTo(3 * 34 + 4 * CUT_LINE_MM, 5);
    expect(canvas.width).toBe(Math.round(tapeStripLengthMm(3, 30, 2) * PX_PER_MM));
    expect(canvas.height).toBe(Math.round(12 * PX_PER_MM));
    // the gap rows (y = 0.3 mm, above every field) hold only the four cut lines
    const top = darkColumns(canvas, Math.round(0.3 * PX_PER_MM));
    const step = 30 + 4 + CUT_LINE_MM;
    const lines = [0, 1, 2, 3].map(i => Math.round(i * step * PX_PER_MM));
    expect(top.length).toBeGreaterThan(0);
    expect(top.every(x => lines.some(l => x >= l - 1 && x <= l + Math.round(CUT_LINE_MM * PX_PER_MM) + 2))).toBe(true);
    expect(lines.every(l => top.some(x => x >= l && x <= l + 4))).toBe(true);
    // the third label's bars start inside its own slot, after the third line
    const bars = darkColumns(canvas, Math.round(4 * PX_PER_MM));
    expect(bars.some(x => x > lines[2] + Math.round(5 * PX_PER_MM))).toBe(true);
    // nothing between the first line and the first label's margin (the line itself is full height)
    expect(bars.some(x => x > 6 && x < lines[0] + Math.round(5 * PX_PER_MM))).toBe(false);
  });

  it("a single label gets a cut line at both ends", async () => {
    const { renderTapeStripCanvas, tapeStripLengthMm, CUT_LINE_MM } = await import("@/lib/tape-label-image");
    const canvas = renderTapeStripCanvas([{ lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "V4" }], 1.5);
    expect(tapeStripLengthMm(1, 30, 1.5)).toBeCloseTo(33 + 2 * CUT_LINE_MM, 5);
    const top = darkColumns(canvas, Math.round(0.3 * PX_PER_MM));
    expect(top.some(x => x <= 4)).toBe(true);
    expect(top.some(x => x >= canvas.width - 5)).toBe(true);
    expect(top.some(x => x > 10 && x < canvas.width - 10)).toBe(false);
  });
});

describe("buildTapeImageLabelXml", () => {
  it("is a ContinuousLabel of fixed length holding one stretched image without margins", () => {
    const png = renderTapeLabelPngBase64({ lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "V4" });
    expect(png.startsWith("iVBORw0KGgo")).toBe(true);
    const xml = buildTapeImageLabelXml({ tapeWidthMm: 12, lengthMm: 30, pngBase64: png });
    expect(xml).toContain('<ContinuousLabel Version="8.0" Units="twips">');
    expect(xml).toContain("<PaperName>12mm</PaperName>");
    expect(xml).toContain(`<LabelLength>${mmToTwips(30)}</LabelLength>`);
    expect(xml).toContain("<ScaleMode>Fill</ScaleMode>");
    expect(xml).toContain(`<Image>${png}</Image>`);
    expect(xml).toContain('<ObjectMargin Left="0" Right="0" Top="0" Bottom="0"/>');
    expect(xml.match(/<Cell>/g)).toHaveLength(1);
  });
});

describe("a code that does not fit", () => {
  it("throws instead of printing a cut-off barcode", async () => {
    const { TapeBarcodeTooWideError } = await import("@/lib/tape-label-image");
    expect(() => renderTapeLabelCanvas({ lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "S1234R2" })).toThrow(TapeBarcodeTooWideError);
    expect(() => renderTapeLabelCanvas({ lengthMm: 30, tapeWidthMm: 12, fields, vehicle, code: "S1234" })).not.toThrow();
  });
});
