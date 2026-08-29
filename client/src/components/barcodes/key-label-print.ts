import JsBarcode from "jsbarcode";

interface LabelVehicle {
  id: number;
  barcode: string | null;
  licensePlate: string;
  brand: string;
  model: string;
}

// Renders labels into a hidden same-origin iframe and prints it. SVG barcodes
// stay vector-sharp at any print scale. Layout targets standard key-label
// stock (~62x29mm) but prints fine on plain A4 as a grid.
export function printKeyLabels(vehicles: LabelVehicle[]): void {
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
    body { font-family: Arial, sans-serif; }
    .label {
      width: 62mm; height: 29mm; padding: 2mm;
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
      page-break-inside: avoid; break-inside: avoid;
      border: 0.2mm dashed #bbb; margin: 1mm;
    }
    .label svg { max-width: 58mm; height: auto; }
    .meta { font-size: 8pt; text-align: center; line-height: 1.2; margin-top: 0.5mm; }
    .plate { font-weight: bold; font-size: 10pt; letter-spacing: 0.5pt; }
    @media print { .label { border: none; } }
  </style></head><body></body></html>`);
  doc.close();

  for (const vehicle of printable) {
    const label = doc.createElement("div");
    label.className = "label";
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    label.appendChild(svg);
    const meta = doc.createElement("div");
    meta.className = "meta";
    const plate = doc.createElement("div");
    plate.className = "plate";
    plate.textContent = vehicle.licensePlate;
    const name = doc.createElement("div");
    name.textContent = `${vehicle.brand} ${vehicle.model}`;
    meta.appendChild(plate);
    meta.appendChild(name);
    label.appendChild(meta);
    doc.body.appendChild(label);
    JsBarcode(svg, vehicle.barcode, {
      format: "CODE128",
      displayValue: true,
      fontSize: 12,
      height: 40,
      margin: 6,
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
    plate.textContent = vehicle.licensePlate;
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
