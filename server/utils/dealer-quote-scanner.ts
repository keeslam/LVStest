/**
 * Reads a dealer's price quote (PDF or photo) with Google Gemini and returns the fields the
 * lease quote form needs. Same set-up as the fine scanner: the file goes inline to the model
 * with a strict JSON response schema; models are tried cheapest first.
 * The result is only ever a proposal: nothing is applied until the user confirms it.
 */
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import type { ParsedDealerQuote } from "../../shared/lease-quotes";

const GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"];

const PROMPT = `You are reading a price quote ("offerte") that a car dealer made for a vehicle a Dutch lease/rental company wants to buy.

Extract:
- dealerName: the dealer or selling company, or null.
- make: the vehicle make (e.g. "Volkswagen"), or null.
- model: the model (e.g. "Golf"), or null.
- trim: the version/trim line/engine variant (e.g. "1.5 eTSI Life Business"), or null.
- catalogPrice: the list price of the vehicle in euro as a number, or null.
- options: the total of optional extras in euro as a number, or null.
- discount: the discount in euro as a POSITIVE number, or null.
- bpm: the BPM amount in euro as a number, or null.
- deliveryCosts: the delivery/handling costs ("afleverkosten", "rijklaarmaakkosten") in euro as a number, or null.
- totalExclVat: the total price excluding VAT in euro. If the quote shows a total excl. VAT that includes BPM and delivery costs, use that total. Null if not printed.
- totalInclVat: the total price including VAT in euro, or null.
- deliveryTime: the delivery time as printed (e.g. "8-10 weken"), or null.
- quoteDate: the date of the quote, YYYY-MM-DD, or null.
- validUntil: the date until which the quote is valid, YYYY-MM-DD, or null.

All amounts are plain numbers in euro (no symbols, dot as decimal separator). Use null when a value is not printed on the quote; never guess or calculate a value that is not there.

Respond ONLY with the JSON object.`;

const nullableString = { type: "string", nullable: true };
const nullableNumber = { type: "number", nullable: true };
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    dealerName: nullableString, make: nullableString, model: nullableString, trim: nullableString,
    catalogPrice: nullableNumber, options: nullableNumber, discount: nullableNumber, bpm: nullableNumber,
    deliveryCosts: nullableNumber, totalExclVat: nullableNumber, totalInclVat: nullableNumber,
    deliveryTime: nullableString, quoteDate: nullableString, validUntil: nullableString,
  },
} as const;

const text = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s === "" ? null : s;
};
const money = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Cleans a raw model answer into a ParsedDealerQuote. Exported for tests. */
export function normaliseParsedDealerQuote(raw: any): ParsedDealerQuote {
  return {
    dealerName: text(raw?.dealerName, 200), make: text(raw?.make, 100), model: text(raw?.model, 100), trim: text(raw?.trim, 200),
    catalogPrice: money(raw?.catalogPrice), options: money(raw?.options), discount: money(raw?.discount), bpm: money(raw?.bpm),
    deliveryCosts: money(raw?.deliveryCosts), totalExclVat: money(raw?.totalExclVat), totalInclVat: money(raw?.totalInclVat),
    deliveryTime: text(raw?.deliveryTime, 100), quoteDate: day(raw?.quoteDate), validUntil: day(raw?.validUntil),
  };
}

export async function processDealerQuoteWithAI(filePath: string, mimeType: string): Promise<ParsedDealerQuote> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const ai = new GoogleGenAI({ apiKey });
  const data = fs.readFileSync(filePath).toString("base64");

  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA as any },
        contents: [{ inlineData: { data, mimeType } }, PROMPT],
      });
      const parsed = normaliseParsedDealerQuote(JSON.parse(response.text || "{}"));
      console.log(`dealer quote scanned with ${model}: ${parsed.make} ${parsed.model} excl=${parsed.totalExclVat}`);
      return parsed;
    } catch (error) {
      lastError = error;
      console.warn(`dealer quote scan with ${model} failed:`, error instanceof Error ? error.message : error);
    }
  }
  throw new Error(`Dealer quote could not be read: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

export type DealerQuoteScanner = typeof processDealerQuoteWithAI;
let scanner: DealerQuoteScanner = processDealerQuoteWithAI;
/** Tests swap the Gemini scanner for a fake; null restores the real one. */
export function setDealerQuoteScanner(replacement: DealerQuoteScanner | null): void {
  scanner = replacement ?? processDealerQuoteWithAI;
}
/** What the routes call, so a test can inject a stub. */
export const scanDealerQuote: DealerQuoteScanner = (filePath, mimeType) => scanner(filePath, mimeType);
