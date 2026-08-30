import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeSvgProps {
  value: string;
  /** Bar height in px (not counting text). Print labels use taller bars. */
  height?: number;
  /**
   * Rendered width in px. When set, the barcode is stretched (non-uniform)
   * to exactly this width, filling the parent's height. Unset keeps the
   * natural width JsBarcode produces.
   */
  width?: number;
  className?: string;
}

// Code 128 SVG barcode with the human-readable value underneath. SVG keeps
// print output vector-crisp; JsBarcode adds the required quiet zone via margin.
export function BarcodeSvg({ value, height = 60, width, className }: BarcodeSvgProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    const svg = ref.current;
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height,
        margin: 10, // quiet zone
        background: "transparent",
        lineColor: "#000000",
      });
      if (width != null) {
        // Stretch to the requested width: promote the rendered size to a
        // viewBox so CSS sizing scales the drawing instead of cropping it.
        const w = parseFloat(svg.getAttribute("width") || "0");
        const h = parseFloat(svg.getAttribute("height") || "0");
        if (w && h) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.width = `${width}px`;
        svg.style.height = "100%";
      } else {
        svg.removeAttribute("preserveAspectRatio");
        svg.style.width = "";
        svg.style.height = "";
      }
    } catch (error) {
      console.error("Barcode render failed for value:", value, error);
    }
  }, [value, height, width]);

  if (!value) return null;
  return <svg ref={ref} className={className} data-testid={`barcode-${value}`} />;
}
