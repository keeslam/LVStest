import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeSvgProps {
  value: string;
  /** Bar height in px (not counting text). Print labels use taller bars. */
  height?: number;
  className?: string;
}

// Code 128 SVG barcode with the human-readable value underneath. SVG keeps
// print output vector-crisp; JsBarcode adds the required quiet zone via margin.
export function BarcodeSvg({ value, height = 60, className }: BarcodeSvgProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height,
        margin: 10, // quiet zone
        background: "transparent",
        lineColor: "#000000",
      });
    } catch (error) {
      console.error("Barcode render failed for value:", value, error);
    }
  }, [value, height]);

  if (!value) return null;
  return <svg ref={ref} className={className} data-testid={`barcode-${value}`} />;
}
