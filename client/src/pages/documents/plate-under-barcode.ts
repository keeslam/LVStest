import type { BarcodeLabelField } from "@shared/barcode";

const PT_TO_MM = 25.4 / 72;
const GAP_MM = 0.5;
const MIN_FONT_PT = 5;
const MAX_FONT_PT = 10;
const SIDE_MARGIN_MM = 2;

export type PlateUnderBarcode =
  | { ok: true; barcode: BarcodeLabelField; plate: BarcodeLabelField }
  | { ok: false; reason: "noRoom" };

/**
 * The plate as a text line right under a barcode field: same left edge and exactly the
 * barcode's width, centred, so the desk can read the car without a scanner. A barcode on
 * automatic width first gets the label width minus a margin on both sides (the plate needs a
 * known width to centre under).
 */
export function plateUnderBarcode(
  barcode: BarcodeLabelField,
  labelWidthMm: number,
  labelHeightMm: number,
  id: string,
): PlateUnderBarcode {
  const round = (n: number) => Math.round(n * 10) / 10;
  const widthMm = barcode.barcodeWidthMm ?? Math.max(5, round(labelWidthMm - 2 * Math.max(barcode.x, SIDE_MARGIN_MM)));
  const heightMm = barcode.barcodeHeightMm ?? 10;
  const y = round(barcode.y + heightMm + GAP_MM);
  const availableMm = labelHeightMm - y;
  const fontSize = Math.min(MAX_FONT_PT, Math.floor((availableMm / PT_TO_MM) * 2) / 2);
  if (fontSize < MIN_FONT_PT) return { ok: false, reason: "noRoom" };
  return {
    ok: true,
    barcode: { ...barcode, barcodeWidthMm: widthMm, barcodeHeightMm: heightMm },
    plate: {
      id,
      name: "Kenteken",
      x: barcode.x,
      y,
      fontSize,
      isBold: true,
      source: "licensePlate",
      textAlign: "center",
      textWidthMm: widthMm,
    },
  };
}
