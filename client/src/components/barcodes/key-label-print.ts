import JsBarcode from "jsbarcode";
import i18n from "@/i18n";
import { toast } from "@/hooks/use-toast";
import { formatLicensePlate } from "@/lib/format-utils";
import type { BarcodeLabelTemplate } from "@shared/schema";
import { BarcodeLabelField, resolveBarcodeLabelSource, shortKeyLabelCode } from "@shared/barcode";
import { notifyFileReady } from "@/lib/file-ready";
import { buildTapeLabelXml, dymoLabelFileName, findDymoService, printDymoLabel, tapeLinesFromFields } from "@/lib/dymo-label";

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

// Key labels carry the short code (V123 / S123): a 30x12 mm label has no room for the bars of
// VEH-000123. The scanner side turns it back into the stored code (normalizeScannedCode).
function printedKeyCode(vehicle: LabelVehicle): string | undefined {
  const code = vehicle.barcodeOverride ?? vehicle.barcode;
  return code ? shortKeyLabelCode(code) : undefined;
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

// Continuous tape of a DYMO label maker (LabelManager 420P at the desk). The
// Windows driver only prints the tape portrait: the page is as wide as the
// tape and as long as the label. The content is laid out along the tape
// (lengthMm wide, tapeWidthMm high) and turned a quarter onto that page, so the
// barcode runs along the tape instead of being cut off at 12 mm.
export interface TapeLayout {
  tapeWidthMm: number;
  lengthMm: number;
}

export const TAPE_WIDTHS_MM = [9, 12, 19] as const;
export const DEFAULT_TAPE_LAYOUT: TapeLayout = { tapeWidthMm: 12, lengthMm: 48 };
export const MIN_TAPE_LENGTH_MM = 30;
export const MAX_TAPE_LENGTH_MM = 100;

// Where a tape label goes: the browser's print window (default), straight to a
// DYMO label maker through the DYMO web service on this pc, or a .label file
// for DYMO Connect.
export type DymoOutput =
  | { mode: "print"; printerName: string }
  | { mode: "download" };

export interface KeyLabelPrintOptions {
  // When set, the labels are printed with the built-in tape layout instead of
  // on the (template's) die-cut label; the template is then not used.
  tape?: TapeLayout | null;
  // Only used for a tape layout (built-in or a tape template).
  dymo?: DymoOutput | null;
}

export function normalizeTapeLayout(raw: Partial<TapeLayout> | null | undefined): TapeLayout {
  const width = Number(raw?.tapeWidthMm);
  const length = Number(raw?.lengthMm);
  return {
    tapeWidthMm: (TAPE_WIDTHS_MM as readonly number[]).includes(width) ? width : DEFAULT_TAPE_LAYOUT.tapeWidthMm,
    lengthMm: Number.isFinite(length)
      ? Math.min(MAX_TAPE_LENGTH_MM, Math.max(MIN_TAPE_LENGTH_MM, Math.round(length)))
      : DEFAULT_TAPE_LAYOUT.lengthMm,
  };
}

// The print head covers less than the tape: ~9 of 12 mm on a LabelManager.
// Keeping the content inside that band stops the driver from scaling it down.
function printableTapeHeightMm(tapeWidthMm: number): number {
  if (tapeWidthMm <= 9) return 6.5;
  if (tapeWidthMm <= 12) return 9;
  return 15;
}

const TAPE_SIDE_MARGIN_MM = 3;

// The built-in tape layout as template fields, so the tape path and the
// template path draw labels the same way. Barcode over the full length,
// plate bottom-left, Hoofd/Reserve bottom-right.
export function builtInTapeFields(tape: TapeLayout): BarcodeLabelField[] {
  const bandMm = printableTapeHeightMm(tape.tapeWidthMm);
  const topMm = (tape.tapeWidthMm - bandMm) / 2;
  const barcodeHeightMm = Math.round(bandMm * 0.6 * 10) / 10;
  // 1 mm = 2.835 pt; the text line takes ~30% of the band, between 6 and 10 pt.
  const fontSize = Math.min(10, Math.max(6, Math.round(bandMm * 0.3 * 2.835 * 2) / 2));
  const textY = Math.round((topMm + barcodeHeightMm + 0.4) * 10) / 10;
  const contentWidthMm = tape.lengthMm - 2 * TAPE_SIDE_MARGIN_MM;
  return [
    { id: "b", name: "Barcode", x: TAPE_SIDE_MARGIN_MM, y: topMm, fontSize: 10, isBold: false, source: "barcode", textAlign: "left", barcodeHeightMm, barcodeWidthMm: contentWidthMm },
    { id: "p", name: "Kenteken", x: TAPE_SIDE_MARGIN_MM, y: textY, fontSize, isBold: true, source: "licensePlate", textAlign: "left" },
    { id: "k", name: "Sleutel", x: TAPE_SIDE_MARGIN_MM, y: textY, fontSize, isBold: false, source: "keyKind", textAlign: "right" },
  ];
}

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

function makePrintFrame(): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  return frame;
}

// Draws one label's positioned fields (x/y in mm of label space) into `label`.
// `showBarcodeValue` prints the code under the bars; a tape has no room for it.
function appendLabelFields(
  doc: Document,
  label: HTMLElement,
  fields: BarcodeLabelField[],
  vehicle: LabelVehicle,
  code: string,
  widthMm: number,
  showBarcodeValue: boolean,
): void {
  // Dutch plates print grouped (12-XT-102); every other source is raw. The
  // printed code goes in as `barcode` so "keyKind" can tell Hoofd from Reserve.
  const formatted = { ...vehicle, licensePlate: formatLicensePlate(vehicle.licensePlate), barcode: code };

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
        displayValue: showBarcodeValue,
        fontSize: 10,
        height: barcodeHeightMm * 3, // px; the svg is scaled to mm below
        margin: showBarcodeValue ? 4 : 0,
        background: "transparent",
      });
      const explicitWidthMm = field.barcodeWidthMm
        ? Math.min(field.barcodeWidthMm, maxWidthMm)
        : null;
      if (explicitWidthMm) {
        // Stretch to the template's exact width: promote the rendered size
        // to a viewBox so CSS sizing scales the drawing instead of cropping.
        const w = parseFloat(svg.getAttribute("width") || "0");
        const h = parseFloat(svg.getAttribute("height") || "0");
        if (w && h) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.width = `${explicitWidthMm}mm`;
        svg.style.height = `${barcodeHeightMm}mm`;
      } else {
        svg.style.width = "auto";
        svg.style.maxWidth = `${maxWidthMm}mm`;
        svg.style.maxHeight = `${barcodeHeightMm}mm`;
      }
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
}

function openPrintWindow(frame: HTMLIFrameElement, title: string, description: string): void {
  // Give layout a tick, print, then remove the frame.
  setTimeout(() => {
    // A-3-13: this only opens the browser's own print window; whether anything reaches a printer
    // is decided there. The toast says so instead of the dialog just closing without a word.
    toast({ title, description });
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 2000);
  }, 250);
}

// Renders labels into a hidden same-origin iframe and prints it. SVG barcodes
// stay vector-sharp at any print scale. Layout targets standard key-label
// stock (~62x29mm) but prints fine on plain A4 as a grid. With a template, the
// template's positioned fields (x/y in mm of label space) are drawn instead.
// A tape template (tapePrint) or the built-in tape option prints one portrait
// page per label with the content turned a quarter (see TapeLayout).
export function printKeyLabels(
  vehicles: LabelVehicle[],
  template?: BarcodeLabelTemplate | null,
  options?: KeyLabelPrintOptions,
): void {
  const printable = vehicles.filter(v => !!(v.barcodeOverride ?? v.barcode));
  if (printable.length === 0) return;

  const tapeJob = options?.tape
    ? (() => { const tape = normalizeTapeLayout(options.tape); return { tape, fields: builtInTapeFields(tape) }; })()
    : template?.tapePrint
      ? { tape: { lengthMm: template.labelWidthMm, tapeWidthMm: template.labelHeightMm }, fields: readTemplateFields(template) }
      : null;
  if (tapeJob) {
    if (options?.dymo) {
      void outputDymoLabels(printable, tapeJob.tape, tapeJob.fields, options.dymo);
    } else {
      printTapeLabels(printable, tapeJob.tape, tapeJob.fields);
    }
    return;
  }

  const widthMm = template?.labelWidthMm ?? DEFAULT_LABEL_WIDTH_MM;
  const heightMm = template?.labelHeightMm ?? DEFAULT_LABEL_HEIGHT_MM;
  const fields = template ? readTemplateFields(template) : FALLBACK_FIELDS;

  const frame = makePrintFrame();
  const doc = frame.contentDocument!;
  doc.open();
  // A chosen template is the paper: the page is exactly its label size, one label per
  // page, so a label printer (LabelWriter) gets the template's size instead of whatever
  // paper its driver defaults to. Without a template the original flowing layout stays.
  const pagePerLabel = template
    ? `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    html, body { width: ${widthMm}mm; }
    .label { display: block; break-after: page; page-break-after: always; }
    .label:last-child { break-after: auto; page-break-after: auto; }
    @media print { .label { margin: 0; } }`
    : "";
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
    ${pagePerLabel}
  </style></head><body></body></html>`);
  doc.close();

  for (const vehicle of printable) {
    const code = printedKeyCode(vehicle);
    if (!code) continue;
    const label = doc.createElement("div");
    label.className = "label";
    appendLabelFields(doc, label, fields, vehicle, code, widthMm, !template);
    doc.body.appendChild(label);
  }

  openPrintWindow(
    frame,
    String(i18n.t("barcodes:label.printOpenedTitle")),
    String(
      i18n.t("barcodes:label.printOpenedDescription", {
        count: printable.length,
        plate: formatLicensePlate(printable[0].licensePlate),
      }),
    ),
  );
}

// One tape label per page: the page is the tape (portrait, tapeWidthMm x
// lengthMm) and the content (lengthMm x tapeWidthMm, fields in mm of that
// landscape space) is turned a quarter onto it. Barcodes print without the
// code under the bars: the plate is what the desk reads, and a 12 mm tape has
// no room for both.
function printTapeLabels(printable: LabelVehicle[], tape: TapeLayout, fields: BarcodeLabelField[]): void {
  const { tapeWidthMm, lengthMm } = tape;

  const frame = makePrintFrame();
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${tapeWidthMm}mm ${lengthMm}mm; margin: 0; }
    html, body { width: ${tapeWidthMm}mm; }
    body { font-family: Arial, sans-serif; }
    .tape-page {
      width: ${tapeWidthMm}mm; height: ${lengthMm}mm; position: relative; overflow: hidden;
      break-after: page; page-break-after: always;
    }
    .tape-page:last-child { break-after: auto; page-break-after: auto; }
    .tape-content {
      position: absolute; left: 0; top: 0;
      width: ${lengthMm}mm; height: ${tapeWidthMm}mm; overflow: hidden;
      transform-origin: 0 0; transform: translateX(${tapeWidthMm}mm) rotate(90deg);
    }
    .field { position: absolute; white-space: nowrap; line-height: 1; }
    .field svg { height: 100%; width: auto; display: block; }
  </style></head><body></body></html>`);
  doc.close();

  for (const vehicle of printable) {
    const code = printedKeyCode(vehicle);
    if (!code) continue;
    const page = doc.createElement("div");
    page.className = "tape-page";
    const content = doc.createElement("div");
    content.className = "tape-content";
    page.appendChild(content);
    appendLabelFields(doc, content, fields, vehicle, code, lengthMm, false);
    doc.body.appendChild(page);
  }

  // Same as the die-cut path: only the browser's print window opens; the toast says which
  // printer settings make the tape come out right.
  openPrintWindow(
    frame,
    String(i18n.t("barcodes:label.printOpenedTitle")),
    String(
      i18n.t("barcodes:tape.printOpenedDescription", {
        count: printable.length,
        plate: formatLicensePlate(printable[0].licensePlate),
        width: tapeWidthMm,
      }),
    ),
  );
}

// The tape labels as DYMO .label XML: one file per label, or one print job per
// label on the chosen DYMO printer through the DYMO web service on this pc.
async function outputDymoLabels(
  printable: LabelVehicle[],
  tape: TapeLayout,
  fields: BarcodeLabelField[],
  output: DymoOutput,
): Promise<void> {
  const jobs = printable.flatMap(vehicle => {
    const code = printedKeyCode(vehicle);
    if (!code) return [];
    const plate = formatLicensePlate(vehicle.licensePlate);
    const lines = tapeLinesFromFields(fields, { ...vehicle, licensePlate: plate, barcode: code });
    const xml = buildTapeLabelXml({ tapeWidthMm: tape.tapeWidthMm, lengthMm: tape.lengthMm, code, lines });
    return [{ plate, code, xml }];
  });
  if (jobs.length === 0) return;

  if (output.mode === "download") {
    for (const job of jobs) {
      const name = dymoLabelFileName(job.plate, job.code);
      const blob = new Blob([job.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (jobs.length === 1) notifyFileReady(name, blob.size);
    }
    if (jobs.length > 1) {
      toast({
        title: String(i18n.t("common:fileReady.title")),
        description: String(i18n.t("barcodes:dymo.filesReady", { count: jobs.length })),
      });
    }
    return;
  }

  const origin = await findDymoService();
  if (!origin) {
    toast({
      title: String(i18n.t("barcodes:dymo.notFoundTitle")),
      description: String(i18n.t("barcodes:dymo.notFoundDescription")),
      variant: "destructive",
    });
    return;
  }
  let printed = 0;
  try {
    for (const job of jobs) {
      await printDymoLabel(origin, output.printerName, job.xml, `${i18n.t("barcodes:dymo.jobTitle")} ${job.plate}`);
      printed += 1;
    }
    toast({
      title: String(i18n.t("barcodes:dymo.printedTitle")),
      description: String(i18n.t("barcodes:dymo.printedDescription", { count: printed, printer: output.printerName })),
    });
  } catch (error) {
    toast({
      title: String(i18n.t("barcodes:dymo.failedTitle")),
      description: String(i18n.t("barcodes:dymo.failedDescription", {
        printed,
        count: jobs.length,
        reason: error instanceof Error ? error.message : String(error),
      })),
      variant: "destructive",
    });
  }
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

  const frame = makePrintFrame();
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

  // Same as printKeyLabels: this only opens the browser's print window, and the toast says so.
  openPrintWindow(
    frame,
    String(i18n.t("barcodes:book.printOpenedTitle")),
    String(i18n.t("barcodes:book.printOpenedDescription", { count: printable.length })),
  );
}
