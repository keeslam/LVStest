/**
 * Reads a traffic-fine letter (CJIB, gemeente, parkeerbeheer, buitenlandse
 * boete) with Google Gemini and returns the fields the fine form needs.
 * Same set-up as the invoice scanner: the file goes inline to the model with
 * a strict JSON response schema; models are tried cheapest first.
 */
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import type { ParsedFineLetter } from "../../shared/fines";

const GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"];

const PROMPT = `You are reading a traffic fine letter (Dutch "bekeuring"/"beschikking", often from CJIB, a municipality, a parking company, or a foreign authority) for a car rental company that must recharge the fine to the customer who rented the vehicle.

Extract:
- licensePlate: the vehicle registration on the letter, Dutch plates without dashes/spaces (e.g. "94XT184"). Null if not present.
- offenceAt: the moment of the OFFENCE (not the letter date) as ISO 8601 with time, e.g. "2026-07-26T21:17:00". If only a date is known use "T00:00:00". Null if unknown.
- letterDate: the date printed on the letter, YYYY-MM-DD. Null if unknown.
- reference: the case number / beschikkingsnummer / CJIB-nummer / kenmerk exactly as printed. Null if none.
- description: short Dutch description of the offence (e.g. "Snelheid 12 km/u te hard, A2 Utrecht"), max 200 characters, including the location when printed.
- amount: the amount to pay in euro as a number (no symbols). Use the base amount if administration costs are listed separately; if only a total is present use it. Null if unknown.
- dueDate: payment deadline YYYY-MM-DD, or null.
- issuer: who sent the letter (e.g. "CJIB", "Gemeente Amsterdam"), or null.
- confidence: per field "high", "medium" or "low" for licensePlate, offenceAt, amount and reference.

Respond ONLY with the JSON object.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    licensePlate: { type: "string", nullable: true },
    offenceAt: { type: "string", nullable: true },
    letterDate: { type: "string", nullable: true },
    reference: { type: "string", nullable: true },
    description: { type: "string" },
    amount: { type: "number", nullable: true },
    dueDate: { type: "string", nullable: true },
    issuer: { type: "string", nullable: true },
    confidence: {
      type: "object",
      properties: {
        licensePlate: { type: "string" }, offenceAt: { type: "string" }, amount: { type: "string" }, reference: { type: "string" },
      },
    },
  },
  required: ["description", "confidence"],
} as const;

function normalisePlate(raw: string | null | undefined): string | null {
  const plate = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return plate.length >= 4 ? plate : null;
}

function normaliseDateTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?/);
  if (!m) return null;
  return `${m[1]}T${m[2] ?? "00:00"}:00`;
}

const normaliseDay = (raw: string | null | undefined): string | null => (raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null);
const level = (v: unknown): "high" | "medium" | "low" => (v === "high" || v === "medium" ? v : "low");

/** Cleans a raw model answer into a ParsedFineLetter. Exported for tests. */
export function normaliseParsedFine(raw: any): ParsedFineLetter {
  return {
    licensePlate: normalisePlate(raw?.licensePlate),
    offenceAt: normaliseDateTime(raw?.offenceAt),
    letterDate: normaliseDay(raw?.letterDate),
    reference: raw?.reference ? String(raw.reference).trim().slice(0, 100) : null,
    description: String(raw?.description ?? "").trim().slice(0, 500),
    amount: typeof raw?.amount === "number" && raw.amount >= 0 ? Math.round(raw.amount * 100) / 100 : null,
    dueDate: normaliseDay(raw?.dueDate),
    issuer: raw?.issuer ? String(raw.issuer).trim().slice(0, 100) : null,
    confidence: {
      licensePlate: level(raw?.confidence?.licensePlate), offenceAt: level(raw?.confidence?.offenceAt),
      amount: level(raw?.confidence?.amount), reference: level(raw?.confidence?.reference),
    },
  };
}

export async function processFineLetterWithAI(filePath: string, mimeType: string): Promise<ParsedFineLetter> {
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
      const parsed = normaliseParsedFine(JSON.parse(response.text || "{}"));
      console.log(`fine letter scanned with ${model}: plate=${parsed.licensePlate} at=${parsed.offenceAt} amount=${parsed.amount}`);
      return parsed;
    } catch (error) {
      lastError = error;
      console.warn(`fine letter scan with ${model} failed:`, error instanceof Error ? error.message : error);
    }
  }
  throw new Error(`Fine letter could not be read: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}
