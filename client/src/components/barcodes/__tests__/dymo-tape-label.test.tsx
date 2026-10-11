/**
 * B-45 — key labels on the DYMO label maker's tape.
 *
 * The desk's LabelManager 420P only prints its tape portrait through the Windows driver, so a
 * landscape key label (62x29) came out cut off at 12 mm. The tape layout makes every label a
 * portrait page the size of the tape and turns the content a quarter onto it: the barcode runs
 * along the tape, the plate and "Hoofd"/"Reserve" underneath.
 *
 * Runs in the jsdom project. jsbarcode is real here (the viewBox stretch depends on its output).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: toastSpy,
}));
const printSpy = vi.hoisted(() => vi.fn());
vi.mock("@/components/barcodes/key-label-print", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/barcodes/key-label-print")>();
  return { ...real, printKeyLabels: printSpy };
});

import { normalizeTapeLayout } from "@/components/barcodes/key-label-print";
import { KeyLabelPrintPanel } from "@/components/barcodes/key-label-print-panel";

// The real print function (the mock above only covers the panel's import).
const realPrint = (await vi.importActual<typeof import("@/components/barcodes/key-label-print")>(
  "@/components/barcodes/key-label-print",
)).printKeyLabels;

const vehicle = {
  id: 4, barcode: "VEH-000004", licensePlate: "12XT102", brand: "Volkswagen", model: "Golf",
  status: "available",
} as any;

function lastFrameDoc(): Document {
  const frames = document.querySelectorAll("iframe");
  const frame = frames[frames.length - 1] as HTMLIFrameElement;
  return frame.contentDocument!;
}

describe("printKeyLabels with a tape layout", () => {
  beforeEach(() => {
    toastSpy.mockClear();
    const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")!.get!;
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (this: HTMLIFrameElement) {
      const win = original.call(this) as Window | null;
      if (win) {
        win.focus = vi.fn();
        win.print = vi.fn();
      }
      return win;
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.querySelectorAll("iframe").forEach(f => f.remove());
  });

  it("makes a portrait page the size of the tape and turns the content a quarter onto it", () => {
    realPrint([vehicle], null, { tape: { tapeWidthMm: 12, lengthMm: 48 } });
    const doc = lastFrameDoc();
    const css = doc.querySelector("style")!.textContent!;
    expect(css).toContain("@page { size: 12mm 48mm; margin: 0; }");
    expect(css).toMatch(/\.tape-content\s*\{[^}]*width: 48mm; height: 12mm/);
    expect(css).toMatch(/transform: translateX\(12mm\) rotate\(90deg\)/);
    const pages = doc.querySelectorAll(".tape-page");
    expect(pages).toHaveLength(1);
  });

  it("prints the exact VEH-code as the barcode (stretched over the tape), the plate and Hoofd", () => {
    realPrint([vehicle], null, { tape: { tapeWidthMm: 12, lengthMm: 48 } });
    const doc = lastFrameDoc();
    const svg = doc.querySelector(".tape-content svg")!;
    // jsbarcode wrote the bars; the size moved into a viewBox so CSS stretches instead of crops.
    expect(svg.querySelectorAll("rect").length).toBeGreaterThan(10);
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 \d+(\.\d+)? \d+(\.\d+)?$/);
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg.hasAttribute("width")).toBe(false);
    // No human-readable code under the bars: the plate is what the desk reads.
    expect(svg.textContent ?? "").not.toContain("VEH-000004");
    expect(doc.querySelector(".tape-plate")!.textContent).toBe("12-XT-102");
    expect(doc.querySelector(".tape-kind")!.textContent).toBe("Hoofd");
  });

  it("a spare-key code (-S) says Reserve; several vehicles give one page each", () => {
    realPrint(
      [{ ...vehicle, barcodeOverride: "VEH-000004-S" }, { ...vehicle, id: 5, barcode: "VEH-000005", licensePlate: "AB123C" }],
      null,
      { tape: { tapeWidthMm: 12, lengthMm: 48 } },
    );
    const doc = lastFrameDoc();
    const kinds = Array.from(doc.querySelectorAll(".tape-kind")).map(el => el.textContent);
    expect(kinds).toEqual(["Reserve", "Hoofd"]);
    expect(doc.querySelectorAll(".tape-page")).toHaveLength(2);
  });

  it("ignores the template when the tape is chosen and clamps odd sizes", () => {
    const template = { id: 9, name: "x", labelWidthMm: 62, labelHeightMm: 29, fields: [] } as any;
    realPrint([vehicle], template, { tape: { tapeWidthMm: 7, lengthMm: 500 } });
    const css = lastFrameDoc().querySelector("style")!.textContent!;
    expect(css).toContain("@page { size: 12mm 100mm; margin: 0; }");
    expect(lastFrameDoc().querySelector(".label")).toBeNull();
    expect(normalizeTapeLayout({ tapeWidthMm: 19, lengthMm: 10 })).toEqual({ tapeWidthMm: 19, lengthMm: 30 });
    expect(normalizeTapeLayout(null)).toEqual({ tapeWidthMm: 12, lengthMm: 48 });
  });

  it("toasts the printer settings for the tape once the print window opens", () => {
    realPrint([vehicle], null, { tape: { tapeWidthMm: 12, lengthMm: 48 } });
    expect(toastSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const arg = toastSpy.mock.calls[0][0];
    expect(arg.title).toBe("Afdrukvenster geopend");
    expect(arg.description).toContain("12-XT-102");
    expect(arg.description).toContain("papier 12 mm, staand");
  });
});

describe("KeyLabelPrintPanel with the tape layout", () => {
  beforeEach(() => {
    printSpy.mockClear();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPanel() {
    const qc = new QueryClient({
      defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={qc}>
        <KeyLabelPrintPanel vehicle={vehicle} />
      </QueryClientProvider>,
    );
  }

  it("offers the DYMO tape, shows width and length, and prints with the tape sizes", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("button-inline-print-key-label"));
    const select = await screen.findByTestId("select-key-label-template-picker");
    expect(screen.queryByTestId("tape-layout-fields")).toBeNull();

    // Radix Select in jsdom: open with the keyboard and pick the option.
    fireEvent.keyDown(select, { key: "ArrowDown" });
    const option = await screen.findByTestId("option-label-layout-tape");
    expect(option).toHaveTextContent("DYMO-tape (labelmaker, staand)");
    await act(async () => { fireEvent.click(option); });

    expect(await screen.findByTestId("tape-layout-fields")).toBeInTheDocument();
    const length = screen.getByTestId("input-tape-length") as HTMLInputElement;
    expect(length.value).toBe("48");
    fireEvent.change(length, { target: { value: "40" } });
    fireEvent.blur(length);
    expect(length.value).toBe("40");

    fireEvent.click(screen.getByTestId("button-key-label-print-confirm"));
    expect(printSpy).toHaveBeenCalledTimes(1);
    const [vehicles, template, options] = printSpy.mock.calls[0];
    expect(vehicles).toEqual([vehicle]);
    expect(template).toBeNull();
    expect(options).toEqual({ tape: { tapeWidthMm: 12, lengthMm: 40 } });

    // The choice is remembered for this pc.
    const stored = JSON.parse(window.localStorage.getItem("lvs.key-label.tape")!);
    expect(stored).toEqual({ tapeWidthMm: 12, lengthMm: 40, preferred: true });
  });

  it("starts on the tape when this pc preferred it last time", async () => {
    window.localStorage.setItem("lvs.key-label.tape", JSON.stringify({ tapeWidthMm: 19, lengthMm: 60, preferred: true }));
    renderPanel();
    fireEvent.click(screen.getByTestId("button-inline-print-spare-key-label"));
    expect(await screen.findByTestId("tape-layout-fields")).toBeInTheDocument();
    expect((screen.getByTestId("input-tape-length") as HTMLInputElement).value).toBe("60");
    fireEvent.click(screen.getByTestId("button-key-label-print-confirm"));
    const [vehicles, , options] = printSpy.mock.calls[0];
    expect(vehicles[0].barcodeOverride).toBe("VEH-000004-S");
    expect(options).toEqual({ tape: { tapeWidthMm: 19, lengthMm: 60 } });
  });
});
