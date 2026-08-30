import JsBarcode from "jsbarcode";
import { createCanvas } from "canvas";

// Code 128 PNG for embedding into pdf-lib documents (contracts etc.).
export function renderBarcodePng(value: string): Buffer {
  const canvas = createCanvas(1, 1);
  JsBarcode(canvas as unknown as HTMLCanvasElement, value, {
    format: "CODE128",
    displayValue: true,
    fontSize: 14,
    height: 50,
    margin: 8,
    background: "#ffffff",
  });
  return (canvas as any).toBuffer("image/png");
}
