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
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
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
    const texts = Array.from(doc.querySelectorAll(".tape-content .field")).map(f => f.textContent);
    expect(texts).toEqual(["", "12-XT-102", "Hoofd"]);
  });

  it("prints the short code (V4 / S4), so the bars fit a 30 mm label; the text still says Hoofd/Reserve", async () => {
    const JsBarcode = (await import("jsbarcode")).default;
    const bars = (value: string) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, value, { format: "CODE128", displayValue: false, margin: 0 });
      return svg.querySelectorAll("rect").length;
    };
    const rects = () => lastFrameDoc().querySelectorAll(".tape-content svg")[0].querySelectorAll("rect").length;
    realPrint([vehicle], null, { tape: { tapeWidthMm: 12, lengthMm: 30 } });
    expect(rects()).toBe(bars("V4"));
    expect(rects()).toBeLessThan(bars("VEH-000004"));
    realPrint([{ ...vehicle, barcodeOverride: "VEH-000004-S" }], null, { tape: { tapeWidthMm: 12, lengthMm: 30 } });
    expect(rects()).toBe(bars("S4"));
    expect(Array.from(lastFrameDoc().querySelectorAll(".tape-content .field"))[2].textContent).toBe("Reserve");
  });

  it("a spare-key code (-S) says Reserve; several vehicles give one page each", () => {
    realPrint(
      [{ ...vehicle, barcodeOverride: "VEH-000004-S" }, { ...vehicle, id: 5, barcode: "VEH-000005", licensePlate: "AB123C" }],
      null,
      { tape: { tapeWidthMm: 12, lengthMm: 48 } },
    );
    const doc = lastFrameDoc();
    const kinds = Array.from(doc.querySelectorAll(".tape-page")).map(
      page => page.querySelectorAll(".field")[2].textContent,
    );
    expect(kinds).toEqual(["Reserve", "Hoofd"]);
    expect(doc.querySelectorAll(".tape-page")).toHaveLength(2);
  });

  it("ignores the template when the tape is chosen and clamps odd sizes", () => {
    const template = { id: 9, name: "x", labelWidthMm: 62, labelHeightMm: 29, fields: [] } as any;
    realPrint([vehicle], template, { tape: { tapeWidthMm: 7, lengthMm: 500 } });
    const css = lastFrameDoc().querySelector("style")!.textContent!;
    expect(css).toContain("@page { size: 12mm 100mm; margin: 0; }");
    expect(lastFrameDoc().querySelector(".label")).toBeNull();
    expect(normalizeTapeLayout({ tapeWidthMm: 19, lengthMm: 10 })).toEqual({ tapeWidthMm: 19, lengthMm: 15, marginSideMm: 1.5, marginVertMm: 1 });
    expect(normalizeTapeLayout(null)).toEqual({ tapeWidthMm: 12, lengthMm: 48, marginSideMm: 1.5, marginVertMm: 1 });
    expect(normalizeTapeLayout({ tapeWidthMm: 6, lengthMm: 40, marginSideMm: 99, marginVertMm: 5 })).toMatchObject({ tapeWidthMm: 6, marginSideMm: 8, marginVertMm: 1.5 });
  });

  it("a template marked as tape prints its own fields turned a quarter, Hoofd/Reserve from the code", () => {
    const template = {
      id: 9, name: "Sleutelkast-tape", labelWidthMm: 48, labelHeightMm: 12, tapePrint: true,
      fields: [
        { id: "b", name: "Barcode", x: 3, y: 1.5, fontSize: 10, isBold: false, source: "barcode", textAlign: "left", barcodeHeightMm: 5, barcodeWidthMm: 42 },
        { id: "p", name: "Kenteken", x: 3, y: 8, fontSize: 7, isBold: true, source: "licensePlate", textAlign: "left" },
        { id: "k", name: "Sleutel", x: 3, y: 8, fontSize: 7, isBold: false, source: "keyKind", textAlign: "right" },
        { id: "t", name: "Auto Lease LAM", x: 20, y: 8, fontSize: 6, isBold: false, source: "staticText", textAlign: "center" },
      ],
    } as any;
    realPrint([{ ...vehicle, barcodeOverride: "VEH-000004-S" }], template);
    const doc = lastFrameDoc();
    const css = doc.querySelector("style")!.textContent!;
    expect(css).toContain("@page { size: 12mm 48mm; margin: 0; }");
    expect(css).toMatch(/transform: translateX\(12mm\) rotate\(90deg\)/);
    expect(doc.querySelector(".label")).toBeNull();
    const fields = Array.from(doc.querySelectorAll(".tape-content .field"));
    expect(fields).toHaveLength(4);
    expect(fields.map(f => f.textContent)).toEqual(["", "12-XT-102", "Reserve", "Auto Lease LAM"]);
    expect((fields[1] as HTMLElement).style.top).toBe("8mm");
    const svg = fields[0].querySelector("svg")!;
    expect(svg.style.width).toBe("42mm");
    expect(svg.textContent ?? "").not.toContain("VEH-000004");
  });

  it("a template without the tape mark still prints the die-cut label", () => {
    const template = { id: 9, name: "x", labelWidthMm: 62, labelHeightMm: 29, tapePrint: false, fields: [] } as any;
    realPrint([vehicle], template);
    expect(lastFrameDoc().querySelector(".label")).not.toBeNull();
    expect(lastFrameDoc().querySelector(".tape-page")).toBeNull();
  });

  it("a die-cut template sets the page to its own label size, one label per page, no margin", () => {
    // A label printer (LabelWriter 280) takes its paper from the page size: without @page the
    // driver's default paper decides and the template's width/height never reach the printer.
    const template = {
      id: 9, name: "Rol 57x32", labelWidthMm: 57, labelHeightMm: 32, tapePrint: false,
      fields: [{ id: "p", name: "Kenteken", x: 2, y: 20, fontSize: 10, isBold: true, source: "licensePlate", textAlign: "left" }],
    } as any;
    realPrint([vehicle, { ...vehicle, id: 5, barcode: "VEH-000005", licensePlate: "AB123C" }], template);
    const css = lastFrameDoc().querySelector("style")!.textContent!;
    expect(css).toContain("@page { size: 57mm 32mm; margin: 0; }");
    expect(css).toMatch(/\.label\s*\{[^}]*width: 57mm; height: 32mm/);
    expect(css).toMatch(/@media print\s*\{[^}]*margin: 0/);
    expect(css).toContain("break-after: page");
    expect(lastFrameDoc().querySelectorAll(".label")).toHaveLength(2);
  });

  it("a template's barcode prints exactly the set width and height: bars only, no margin, no text under it", () => {
    const template = {
      id: 9, name: "30x12", labelWidthMm: 30, labelHeightMm: 12, tapePrint: false,
      fields: [{ id: "b", name: "Barcode", x: 3, y: 1, fontSize: 10, isBold: false, source: "barcode", textAlign: "left", barcodeHeightMm: 7, barcodeWidthMm: 24 }],
    } as any;
    realPrint([vehicle], template);
    const svg = lastFrameDoc().querySelector(".label svg") as SVGElement;
    expect(svg.querySelector("text")).toBeNull();
    expect(svg.style.width).toBe("24mm");
    expect(svg.style.height).toBe("7mm");
    // viewBox starts at the first bar: no quiet-zone padding inside the box.
    const first = svg.querySelector("rect") as SVGRectElement;
    expect(Number(first.getAttribute("x"))).toBe(0);
    const [, , w] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const last = Array.from(svg.querySelectorAll("rect")).pop() as SVGRectElement;
    expect(Number(last.getAttribute("x")) + Number(last.getAttribute("width"))).toBe(w);
  });

  it("a text field with a set width is that wide, so the plate centres under the barcode", () => {
    const template = {
      id: 9, name: "30x12", labelWidthMm: 30, labelHeightMm: 12, tapePrint: false,
      fields: [{ id: "p", name: "Kenteken", x: 3, y: 8.5, fontSize: 9, isBold: true, source: "licensePlate", textAlign: "center", textWidthMm: 24 }],
    } as any;
    realPrint([vehicle], template);
    const field = lastFrameDoc().querySelector(".label .field") as HTMLElement;
    expect(field.style.width).toBe("24mm");
    expect(field.style.textAlign).toBe("center");
    expect(field.textContent).toBe("12-XT-102");
  });

  it("without a template the original label still shows the code under the bars", () => {
    realPrint([vehicle], null);
    expect(lastFrameDoc().querySelector(".label svg text")).not.toBeNull();
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
    expect(options).toEqual({ tape: { tapeWidthMm: 12, lengthMm: 40, marginSideMm: 1.5, marginVertMm: 1 } });

    // The choice is remembered for this pc.
    const stored = JSON.parse(window.localStorage.getItem("lvs.key-label.tape")!);
    expect(stored).toEqual({ tapeWidthMm: 12, lengthMm: 40, marginSideMm: 1.5, marginVertMm: 1, preferred: true, output: "browser", chain: false, alignment: "Center", strip: false, cutGapMm: 2 });
  });

  it("offers the DYMO label maker as output when DYMO Connect answers, and prints straight to it", async () => {
    const printersXml = '"<Printers><TapePrinter><Name>DYMO LabelManager 420P</Name><ModelName>DYMO LabelManager 420P</ModelName><IsConnected>True</IsConnected><IsLocal>True</IsLocal><IsAutoCutSupported>True</IsAutoCutSupported></TapePrinter></Printers>"';
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/StatusConnected")) return new Response("true", { status: 200 });
      if (url.endsWith("/GetPrinters")) return new Response(printersXml, { status: 200 });
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    window.localStorage.setItem("lvs.key-label.tape", JSON.stringify({ tapeWidthMm: 12, lengthMm: 48, preferred: true, output: "browser" }));
    renderPanel();
    fireEvent.click(screen.getByTestId("button-inline-print-key-label"));
    const output = await screen.findByTestId("select-tape-output");
    await waitFor(() => expect(screen.getByTestId("tape-output-hint").textContent).toContain("DYMO Connect gevonden: 1 labelmaker."));

    fireEvent.keyDown(output, { key: "ArrowDown" });
    const printerOption = await screen.findByTestId("option-tape-output-printer");
    expect(printerOption).toHaveTextContent("DYMO LabelManager 420P (rechtstreeks via DYMO Connect)");
    await act(async () => { fireEvent.click(printerOption); });

    fireEvent.click(screen.getByTestId("button-key-label-print-confirm"));
    const [, , options] = printSpy.mock.calls[0];
    expect(options).toEqual({ tape: { tapeWidthMm: 12, lengthMm: 48, marginSideMm: 1.5, marginVertMm: 1 }, dymo: { mode: "print", printerName: "DYMO LabelManager 420P" } });
    expect(JSON.parse(window.localStorage.getItem("lvs.key-label.tape")!).output).toBe("printer:DYMO LabelManager 420P");
  });

  it("without DYMO Connect the output list still offers the .label file", async () => {
    window.localStorage.setItem("lvs.key-label.tape", JSON.stringify({ tapeWidthMm: 12, lengthMm: 48, preferred: true, output: "download" }));
    renderPanel();
    fireEvent.click(screen.getByTestId("button-inline-print-key-label"));
    await waitFor(() => expect(screen.getByTestId("tape-output-hint").textContent).toContain("DYMO Connect is niet gevonden op deze pc"));
    fireEvent.click(screen.getByTestId("button-key-label-print-confirm"));
    const [, , options] = printSpy.mock.calls[0];
    expect(options).toEqual({ tape: { tapeWidthMm: 12, lengthMm: 48, marginSideMm: 1.5, marginVertMm: 1 }, dymo: { mode: "download" } });
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
    expect(options).toEqual({ tape: { tapeWidthMm: 19, lengthMm: 60, marginSideMm: 1.5, marginVertMm: 1 } });
  });
});
