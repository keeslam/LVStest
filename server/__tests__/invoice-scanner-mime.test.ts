import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent }; constructor(_options: unknown) {} },
}));

import { processInvoiceWithAI } from "../utils/invoice-scanner";

const reply = (body: Record<string, unknown>) => ({ text: JSON.stringify(body) });
const base = {
  vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR", totalAmount: 121,
  lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }],
};

describe("invoice scanner: mime type, VAT and plates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-"));
  const file = path.join(dir, "factuur.bin");
  let previousKey: string | undefined;

  beforeAll(() => {
    fs.writeFileSync(file, Buffer.from("inhoud"));
    previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  });
  beforeEach(() => generateContent.mockReset());

  it("sends a PDF mime type by default, as the manual scan always did", async () => {
    generateContent.mockResolvedValue(reply(base));
    await processInvoiceWithAI(file);
    const request = generateContent.mock.calls[0][0];
    expect(request.contents[0].inlineData.mimeType).toBe("application/pdf");
    expect(request.contents[0].inlineData.data).toBe(Buffer.from("inhoud").toString("base64"));
  });

  it("sends the mime type it was given for a photo of an invoice", async () => {
    generateContent.mockResolvedValue(reply(base));
    await processInvoiceWithAI(file, "image/jpeg");
    expect(generateContent.mock.calls[0][0].contents[0].inlineData.mimeType).toBe("image/jpeg");
  });

  it("asks for, and returns, the VAT split and every plate on the invoice", async () => {
    generateContent.mockResolvedValue(reply({ ...base, subtotalAmount: 100, vatAmount: "21.00", vehicleInfo: { licensePlate: "V-123-XB", licensePlates: ["V-123-XB", "", "GH-456-K"] } }));
    const parsed = await processInvoiceWithAI(file);
    expect(parsed.subtotalAmount).toBe(100);
    expect(parsed.vatAmount).toBe(21);
    expect(parsed.vehicleInfo?.licensePlates).toEqual(["V-123-XB", "GH-456-K"]);
    const request = generateContent.mock.calls[0][0];
    expect(request.config.responseSchema.properties).toHaveProperty("subtotalAmount");
    expect(request.config.responseSchema.properties).toHaveProperty("vatAmount");
    expect(request.config.responseSchema.properties.vehicleInfo.properties).toHaveProperty("licensePlates");
    expect(String(request.contents[1])).toContain("licensePlates");
  });

  it("leaves the new fields undefined when the invoice does not state them", async () => {
    generateContent.mockResolvedValue(reply(base));
    const parsed = await processInvoiceWithAI(file);
    expect(parsed.subtotalAmount).toBeUndefined();
    expect(parsed.vatAmount).toBeUndefined();
    expect(parsed.vehicleInfo).toBeUndefined();
  });

  it("reads amounts written the Dutch or the English way, and trims plates", async () => {
    generateContent.mockResolvedValue(reply({ ...base, subtotalAmount: "1.234,56", vatAmount: "€ 259,26", vehicleInfo: { licensePlate: "V-123-XB", licensePlates: [" V-123-XB ", "GH-456-K"] } }));
    const parsed = await processInvoiceWithAI(file);
    expect(parsed.subtotalAmount).toBe(1234.56);
    expect(parsed.vatAmount).toBe(259.26);
    expect(parsed.vehicleInfo?.licensePlates).toEqual(["V-123-XB", "GH-456-K"]);

    generateContent.mockResolvedValue(reply({ ...base, subtotalAmount: "1,234.56", vatAmount: "1.234" }));
    const parsed2 = await processInvoiceWithAI(file);
    expect(parsed2.subtotalAmount).toBe(1234.56);
    expect(parsed2.vatAmount).toBe(1234);
  });
});
