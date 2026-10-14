/**
 * A tape label drawn exactly like its template (barcode box, plate under it, every text field)
 * as a picture. DYMO's own barcode and text objects cannot be placed or sized to the
 * millimetre, so the label goes to DYMO Connect as one image the size of the label: what the
 * editor shows is what the tape gets.
 *
 * 360 dpi = twice the 180 dpi of the label makers: bars are a whole number of printer dots.
 */
import JsBarcode from "jsbarcode";
import { BarcodeLabelField, BarcodeLabelVehicle, resolveBarcodeLabelSource } from "@shared/barcode";

export const TAPE_IMAGE_DPI = 360;
const PX_PER_MM = TAPE_IMAGE_DPI / 25.4;
const PX_PER_PT = TAPE_IMAGE_DPI / 72;
// Thinnest bar that still reads: 4 px = 0.28 mm = 2 printer dots.
const MIN_MODULE_PX = 4;
const DEFAULT_BARCODE_HEIGHT_MM = 10;

// The bar/space pattern of a Code 128 code, one entry per module (true = bar).
export function code128Modules(code: string): boolean[] {
  const probe = document.createElement("canvas");
  JsBarcode(probe, code, { format: "CODE128", width: 1, height: 1, margin: 0, displayValue: false, background: "#ffffff", lineColor: "#000000" });
  const row = probe.getContext("2d")!.getImageData(0, 0, probe.width, 1).data;
  const modules: boolean[] = [];
  for (let x = 0; x < probe.width; x += 1) modules.push(row[x * 4] < 128);
  return modules;
}

/** The code needs more width than the label has even with the thinnest readable bars. */
export class TapeBarcodeTooWideError extends Error {
  constructor(code: string) {
    super(`barcode ${code} does not fit the label`);
    this.name = "TapeBarcodeTooWideError";
  }
}

export interface TapeImageInput {
  lengthMm: number;
  tapeWidthMm: number;
  fields: BarcodeLabelField[];
  vehicle: BarcodeLabelVehicle;
  code: string;
}

export function renderTapeLabelCanvas(input: TapeImageInput): HTMLCanvasElement {
  const { lengthMm, tapeWidthMm, fields, vehicle, code } = input;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(lengthMm * PX_PER_MM);
  canvas.height = Math.round(tapeWidthMm * PX_PER_MM);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";

  for (const field of fields) {
    const left = Math.round(field.x * PX_PER_MM);
    const top = Math.round(field.y * PX_PER_MM);
    if (field.source === "barcode") {
      const modules = code128Modules(code);
      const heightPx = Math.round((field.barcodeHeightMm ?? DEFAULT_BARCODE_HEIGHT_MM) * PX_PER_MM);
      const boxPx = field.barcodeWidthMm
        ? Math.round(field.barcodeWidthMm * PX_PER_MM)
        : Math.max(0, canvas.width - left - Math.round(2 * PX_PER_MM));
      // Whole printer dots per module (2 px each at 360 dpi): every bar prints the same width.
      // Rounded to the dot nearest the box, never thinner than MIN_MODULE_PX, and never off the label.
      let dotsPerModule = Math.max(MIN_MODULE_PX / 2, Math.round(boxPx / 2 / modules.length));
      while (dotsPerModule > MIN_MODULE_PX / 2 && left + dotsPerModule * 2 * modules.length > canvas.width) dotsPerModule -= 1;
      const moduleWidthPx = dotsPerModule * 2;
      const barsPx = moduleWidthPx * modules.length;
      const start = left + Math.max(0, Math.floor((boxPx - barsPx) / 2));
      if (start + barsPx > canvas.width) throw new TapeBarcodeTooWideError(code);
      modules.forEach((bar, index) => {
        if (bar) ctx.fillRect(start + index * moduleWidthPx, top, moduleWidthPx, heightPx);
      });
    } else {
      const text = resolveBarcodeLabelSource(field.source, vehicle, field.name).trim();
      if (!text) continue;
      const boxPx = Math.round((field.textWidthMm ?? lengthMm - field.x - 1) * PX_PER_MM);
      ctx.font = `${field.isBold ? "bold " : ""}${Math.round(field.fontSize * PX_PER_PT)}px Arial, Helvetica, sans-serif`;
      ctx.textBaseline = "top";
      const anchor = field.textAlign === "center" ? left + boxPx / 2 : field.textAlign === "right" ? left + boxPx : left;
      ctx.textAlign = field.textAlign;
      ctx.fillText(text, anchor, top);
    }
  }
  return canvas;
}

/** Base64 PNG (no data: prefix) of the label, for DYMO's ImageObject. */
export function renderTapeLabelPngBase64(input: TapeImageInput): string {
  return renderTapeLabelCanvas(input).toDataURL("image/png").split(",")[1] ?? "";
}
