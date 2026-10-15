/**
 * B-45 — the DYMO .label XML for a key label on 12 mm tape, and the web-service client.
 * The XML structure was checked against DYMO Connect's own web service (RenderLabel) on the desk pc.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildTapeLabelXml, dymoLabelFileName, findDymoService, listDymoTapePrinters, mmToTwips,
  parseTapePrinters, printDymoLabel, tapeLinesFromFields,
} from "@/lib/dymo-label";
import { builtInTapeFields } from "@/components/barcodes/key-label-print";

afterEach(() => vi.unstubAllGlobals());

describe("buildTapeLabelXml", () => {
  it("is a ContinuousLabel for the tape width with a fixed length in twips, the exact code and the text", () => {
    const xml = buildTapeLabelXml({
      tapeWidthMm: 12, lengthMm: 48, code: "VEH-000004-S",
      lines: [{ text: "12-XT-102  Reserve", fontPt: 8.5, bold: true }],
    });
    expect(xml).toContain('<ContinuousLabel Version="8.0" Units="twips">');
    expect(xml).toContain("<PaperName>12mm</PaperName>");
    expect(xml).toContain("<Id>Tape12mm</Id>");
    expect(xml).toContain("<LengthMode>Fixed</LengthMode>");
    expect(xml).toContain(`<LabelLength>${mmToTwips(48)}</LabelLength>`);
    expect(mmToTwips(48)).toBe(2721);
    expect(xml).toContain("<Text>VEH-000004-S</Text>");
    expect(xml).toContain("<Type>Code128Auto</Type>");
    expect(xml).toContain("<TextPosition>None</TextPosition>");
    expect(xml).toContain("<String>12-XT-102  Reserve</String>");
    expect(xml).toContain('Size="9" Bold="True"');
    expect(xml.match(/<Cell>/g)).toHaveLength(2);
  });

  it("escapes XML characters and leaves out the text cell when there is no text", () => {
    const xml = buildTapeLabelXml({ tapeWidthMm: 9, lengthMm: 30, code: "VEH-000001", lines: [{ text: "A & B <C>", fontPt: 6, bold: false }] });
    expect(xml).toContain("<String>A &amp; B &lt;C&gt;</String>");
    expect(xml).toContain("<PaperName>9mm</PaperName>");
    const bare = buildTapeLabelXml({ tapeWidthMm: 12, lengthMm: 48, code: "VEH-000001", lines: [] });
    expect(bare.match(/<Cell>/g)).toHaveLength(1);
    expect(bare).not.toContain("<TextObject>");
  });
});

describe("tapeLinesFromFields", () => {
  const vehicle = { id: 4, barcode: "VEH-000004-S", licensePlate: "12-XT-102", brand: "VW", model: "Golf" };

  it("turns the built-in tape fields into one line: plate and Reserve, bold, from the code", () => {
    const lines = tapeLinesFromFields(builtInTapeFields({ tapeWidthMm: 12, lengthMm: 48 }), vehicle);
    expect(lines).toEqual([{ text: "12-XT-102  Reserve", fontPt: 8.5, bold: true }]);
  });

  it("groups a template's text fields by height, left to right, and skips empty values", () => {
    const lines = tapeLinesFromFields([
      { id: "b", name: "Barcode", x: 3, y: 1, fontSize: 10, isBold: false, source: "barcode", textAlign: "left" },
      { id: "t", name: "Auto Lease LAM", x: 30, y: 7.6, fontSize: 6, isBold: false, source: "staticText", textAlign: "left" },
      { id: "p", name: "Kenteken", x: 3, y: 7.5, fontSize: 7, isBold: true, source: "licensePlate", textAlign: "left" },
      { id: "c", name: "Bedrijf", x: 3, y: 10, fontSize: 6, isBold: false, source: "company", textAlign: "left" },
      { id: "m", name: "Merk", x: 3, y: 4, fontSize: 6, isBold: false, source: "brand", textAlign: "left" },
    ], vehicle);
    expect(lines).toEqual([
      { text: "VW", fontPt: 6, bold: false },
      { text: "12-XT-102  Auto Lease LAM", fontPt: 7, bold: true },
    ]);
  });
});

describe("file name", () => {
  it("names the file after the plate and the code", () => {
    expect(dymoLabelFileName("12-XT-102", "VEH-000004-S")).toBe("sleutellabel-12-XT-102-VEH-000004-S.label");
  });
});

describe("DYMO web service client", () => {
  const printersXml = '"<Printers><TapePrinter><Name>DYMO LabelManager 420P</Name><ModelName>DYMO LabelManager 420P</ModelName><IsConnected>True</IsConnected><IsLocal>True</IsLocal><IsAutoCutSupported>True</IsAutoCutSupported></TapePrinter><LabelWriterPrinter><Name>LW</Name></LabelWriterPrinter></Printers>"';

  it("parses only tape printers out of GetPrinters", () => {
    expect(parseTapePrinters(JSON.parse(printersXml))).toEqual([
      { name: "DYMO LabelManager 420P", modelName: "DYMO LabelManager 420P", isConnected: true, autoCut: true },
    ]);
  });

  it("finds the service on 127.0.0.1 first, falls back to localhost, and gives null when neither answers", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith("https://127.0.0.1:41951")) throw new TypeError("Failed to fetch");
      if (url.endsWith("/StatusConnected")) return new Response("true", { status: 200 });
      if (url.endsWith("/GetPrinters")) return new Response(printersXml, { status: 200 });
      return new Response("", { status: 404 });
    }));
    const origin = await findDymoService();
    expect(origin).toBe("https://localhost:41951");
    expect(calls[0]).toBe("https://127.0.0.1:41951/DYMO/DLS/Printing/StatusConnected");
    const printers = await listDymoTapePrinters(origin!);
    expect(printers.map(p => p.name)).toEqual(["DYMO LabelManager 420P"]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await findDymoService()).toBeNull();
  });

  it("posts the label and the tape print parameters as a form, and throws on anything but true", async () => {
    const fetchSpy = vi.fn(async () => new Response('"true"', { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await printDymoLabel("https://127.0.0.1:41951", "DYMO LabelManager 420P", "<ContinuousLabel/>", "Sleutellabel 12-XT-102");
    const [url, init] = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit]);
    expect(url).toBe("https://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("printerName")).toBe("DYMO LabelManager 420P");
    expect(body.get("labelXml")).toBe("<ContinuousLabel/>");
    expect(body.get("printParamsXml")).toContain("<CutMode>AutoCut</CutMode>");
    expect(body.get("printParamsXml")).toContain("<JobTitle>Sleutellabel 12-XT-102</JobTitle>");
    expect(body.get("printParamsXml")).toContain("<Alignment>Center</Alignment>");

    await printDymoLabel("https://127.0.0.1:41951", "DYMO LabelManager 280", "<a/>", "t", { chain: true, alignment: "Right" });
    const params = ((fetchSpy.mock.calls[1] as unknown as [string, RequestInit])[1].body as URLSearchParams).get("printParamsXml");
    expect(params).toContain("<Alignment>Right</Alignment>");
    expect(params).toContain("<CutMode>ChainMarks</CutMode>");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("Printer not found", { status: 500 })));
    await expect(printDymoLabel("https://127.0.0.1:41951", "x", "<a/>", "t")).rejects.toThrow("Printer not found");
  });
});
