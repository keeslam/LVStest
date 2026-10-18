import { forwardRef, useImperativeHandle, useRef } from "react";

export interface SignaturePadHandle {
  /** The drawing as a PNG data URL, or null while nothing has been drawn. */
  toDataUrl(): string | null;
  clear(): void;
}

const WIDTH = 600;
const HEIGHT = 200;

/**
 * A plain canvas to sign on with a finger, pen or mouse. Pointer events cover all three; `touch-action:
 * none` stops the page from scrolling while the customer signs on a phone.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void; label: string }>(
  function SignaturePad({ onChange, label }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const hasInk = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT };
    };
    const ctx = () => {
      const c = canvasRef.current?.getContext("2d");
      if (c) { c.lineWidth = 2.5; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#0f172a"; }
      return c;
    };

    useImperativeHandle(ref, () => ({
      toDataUrl: () => (hasInk.current && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null),
      clear: () => {
        ctx()?.clearRect(0, 0, WIDTH, HEIGHT);
        hasInk.current = false;
        onChange?.(false);
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={label}
        data-testid="signature-pad"
        className="block w-full touch-none rounded-lg border-2 border-dashed border-[#cbd5e1] bg-white"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drawing.current = true;
          last.current = point(e);
          const c = ctx();
          if (c) { c.beginPath(); c.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); c.fillStyle = "#0f172a"; c.fill(); }
          if (!hasInk.current) { hasInk.current = true; onChange?.(true); }
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const p = point(e);
          const c = ctx();
          if (c) { c.beginPath(); c.moveTo(last.current.x, last.current.y); c.lineTo(p.x, p.y); c.stroke(); }
          last.current = p;
        }}
        onPointerUp={() => { drawing.current = false; last.current = null; }}
        onPointerLeave={() => { drawing.current = false; last.current = null; }}
      />
    );
  },
);
