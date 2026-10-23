import { createCanvas } from "canvas";

let cached: Buffer | null = null;

/**
 * Kees 2026-10-23: a made-up signature for template previews, so a signature box shows how a
 * real signature will sit in it. A few pen strokes on a transparent background; never used
 * on a real document.
 */
export function sampleSignaturePng(): Buffer {
  if (cached) return cached;
  const canvas = createCanvas(360, 120);
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "#1e3a8a";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(20, 80);
  ctx.bezierCurveTo(40, 10, 70, 10, 75, 70);
  ctx.bezierCurveTo(80, 110, 110, 30, 130, 60);
  ctx.bezierCurveTo(150, 90, 170, 20, 195, 55);
  ctx.bezierCurveTo(215, 85, 240, 40, 265, 62);
  ctx.bezierCurveTo(285, 80, 310, 50, 340, 45);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(60, 95);
  ctx.bezierCurveTo(140, 88, 230, 92, 320, 84);
  ctx.stroke();
  cached = canvas.toBuffer("image/png");
  return cached;
}

/** The same signature as a data URL, the form the damage-check generator reads. */
export function sampleSignatureDataUrl(): string {
  return `data:image/png;base64,${sampleSignaturePng().toString("base64")}`;
}
