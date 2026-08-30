import JsBarcode from "jsbarcode";
import { formatLicensePlate } from "@/lib/format-utils";
import type { BarcodeLabelTemplate } from "@shared/schema";
import { BarcodeLabelField, resolveBarcodeLabelSource } from "@shared/barcode";

interface LabelVehicle {
  id: number;
  barcode: string | null;
  // When set, printed in place of `barcode` (e.g. a spare-key code that isn't
  // stored on the vehicle at all). `barcode` itself is left untouched so
  // callers can still show/require the real stored barcode elsewhere.
  barcodeOverride?: string;
  licensePlate: string;
  brand: string;
  model: string;
  vehicleType?: string | null;
  chassisNumber?: string | null;
  apkDate?: string | null;
  company?: string | null;
}

const DEFAULT_LABEL_WIDTH_MM = 62;
const DEFAULT_LABEL_HEIGHT_MM = 29;
const DEFAULT_BARCODE_HEIGHT_MM = 10;

// Layout used when no template is picked: the original hardcoded 62x29 label.
const FALLBACK_FIELDS: BarcodeLabelField[] = [
  { id: "b", name: "Barcode", x: 2, y: 3, fontSize: 10, isBold: false, source: "barcode", textAlign: "left", barcodeHeightMm: 12 },
  { id: "p", name: "Kenteken", x: 2, y: 20, fontSize: 10, isBold: true, source: "licensePlate", textAlign: "left" },
  { id: "m", name: "Merk/model", x: 2, y: 25, fontSize: 8, isBold: false, source: "vehicleFull", textAlign: "left" },
];

// A template's fields column is jsonb and older rows may hold a JSON string.
function readTemplateFields(template: BarcodeLabelTemplate): BarcodeLabelField[] {
  const raw = template.fields;
  if (Array.isArray(raw)) return raw as BarcodeLabelField[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as BarcodeLabelField[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Renders labels into a hidden same-origin iframe and prints it. SVG barcodes
// stay vector-sharp at any print scale. Layout targets standard key-label
// stock (~62x29mm) but prints fine on plain A4 as a grid. With a template, the
// template's positioned fields (x/y in mm of label space) are drawn instead.
export function printKeyLabels(vehicles: LabelVehicle[], template?: BarcodeLabelTemplate | null): void {
  const printable = vehicles.filter(v => !!(v.barcodeOverride ?? v.barcode));
  if (printable.length === 0) return;

  const widthMm = template?.labelWidthMm ?? DEFAULT_LABEL_WIDTH_MM;
  const heightMm = template?.labelHeightMm ?? DEFAULT_LABEL_HEIGHT_MM;
  const fields = template ? readTemplateFields(template) : FALLBACK_FIELDS;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; }
    .label {
      width: ${widthMm}mm; height: ${heightMm}mm; position: relative;
      display: inline-block; overflow: hidden;
      page-break-inside: avoid; break-inside: avoid;
      border: 0.2mm dashed #bbb; margin: 1mm;
    }
    .field { position: absolute; white-space: nowrap; line-height: 1; }
    .field svg { height: 100%; width: auto; }
    @media print { .label { border: none; } }
  </style></head><body></body></html>`);
  doc.close();

  for (const vehicle of printable) {
    // Dutch plates print grouped (12-XT-102); every other source is raw.
    const formatted = { ...vehicle, licensePlate: formatLicensePlate(vehicle.licensePlate) };
    const code = vehicle.barcodeOverride ?? vehicle.barcode;
    if (!code) continue;

    const label = doc.createElement("div");
    label.className = "label";

    for (const field of fields) {
      const holder = doc.createElement("div");
      holder.className = "field";
      holder.style.left = `${field.x}mm`;
      holder.style.top = `${field.y}mm`;

      if (field.source === "barcode") {
        const barcodeHeightMm = field.barcodeHeightMm ?? DEFAULT_BARCODE_HEIGHT_MM;
        // Constrain by both width and height (not height alone) so a long
        // code like VEH-000123 can't scale wider than what's left of the
        // label and clip the barcode's stop pattern at the right edge.
        const maxWidthMm = widthMm - field.x - 2;
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        holder.appendChild(svg);
        holder.style.height = `${barcodeHeightMm}mm`;
        holder.style.maxWidth = `${maxWidthMm}mm`;
        JsBarcode(svg, code, {
          format: "CODE128",
          displayValue: true,
          fontSize: 10,
          height: barcodeHeightMm * 3, // px; the svg is scaled to mm below
          margin: 4,
          background: "transparent",
        });
        svg.style.width = "auto";
        svg.style.maxWidth = `${maxWidthMm}mm`;
        svg.style.maxHeight = `${barcodeHeightMm}mm`;
      } else {
        holder.textContent = resolveBarcodeLabelSource(field.source, formatted, field.name);
        holder.style.fontSize = `${field.fontSize}pt`;
        holder.style.fontWeight = field.isBold ? "bold" : "normal";
        holder.style.textAlign = field.textAlign;
        // Non-barcode fields are absolutely positioned with an auto (shrink
        // to content) width, which makes textAlign a no-op. Give the holder
        // the remaining label width so left/center/right actually differ.
        holder.style.width = `${widthMm - field.x - 1}mm`;
        holder.style.whiteSpace = "normal";
      }

      label.appendChild(holder);
    }

    doc.body.appendChild(label);
  }

  // Give layout a tick, print, then remove the frame.
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 2000);
  }, 250);
}

// Renders the full barcode book into a hidden same-origin iframe and prints
// it, same mechanics as printKeyLabels. Kept separate from the in-dialog CSS
// print path: printing straight out of a Radix DialogContent (position:fixed,
// overflow-y-auto) gets clipped to the dialog's own viewport in Chrome, which
// would cut off a multi-page book. The iframe prints its own untouched
// document instead, so page breaks and multi-page output work correctly.
export function printBarcodeBook(vehicles: LabelVehicle[], pageHeader: string): void {
  const printable = vehicles.filter((v): v is LabelVehicle & { barcode: string } => !!v.barcode);
  if (printable.length === 0) return;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, sans-serif; }
    .book-header { font-size: 14pt; font-weight: bold; margin-bottom: 6mm; }
    .grid { display: flex; flex-wrap: wrap; gap: 4mm; }
    .entry {
      width: 85mm; padding: 4mm;
      border: 0.2mm solid #ddd; border-radius: 2mm;
      break-inside: avoid; page-break-inside: avoid;
      display: flex; flex-direction: column; align-items: center;
    }
    .entry svg { max-width: 77mm; height: auto; }
    .plate { font-weight: bold; font-size: 12pt; letter-spacing: 0.5pt; margin-top: 1mm; }
    .model { font-size: 9pt; color: #444; }
  </style></head><body></body></html>`);
  doc.close();

  const header = doc.createElement("div");
  header.className = "book-header";
  header.textContent = pageHeader;
  doc.body.appendChild(header);

  const grid = doc.createElement("div");
  grid.className = "grid";
  doc.body.appendChild(grid);

  for (const vehicle of printable) {
    const entry = doc.createElement("div");
    entry.className = "entry";
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    entry.appendChild(svg);
    const plate = doc.createElement("div");
    plate.className = "plate";
    plate.textContent = formatLicensePlate(vehicle.licensePlate);
    entry.appendChild(plate);
    const model = doc.createElement("div");
    model.className = "model";
    model.textContent = `${vehicle.brand} ${vehicle.model}`;
    entry.appendChild(model);
    grid.appendChild(entry);
    JsBarcode(svg, vehicle.barcode, {
      format: "CODE128",
      displayValue: true,
      fontSize: 12,
      height: 55,
      margin: 8,
      background: "transparent",
    });
  }

  // Give layout a tick, print, then remove the frame.
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 2000);
  }, 250);
}
