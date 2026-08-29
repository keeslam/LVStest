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
