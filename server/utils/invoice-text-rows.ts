import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * The AI reads an invoice table from a picture and sometimes shifts the rows
 * (a heading row without an amount takes the amount of the row below it). A PDF
 * made by an invoicing program has a text layer, which keeps every row together.
 * This module reads that layer and, only when its table adds up to the invoice's
 * own subtotal/total, rebuilds the line items from it.
 */

export interface TextRowLine { description: string; amount: number }
export interface RowCheckInvoice { totalAmount?: number | null; subtotalAmount?: number | null; vatAmount?: number | null }

const MONEY = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/;
const NUMBER = /^-?\d+(?:[.,]\d+)?%?$/;
const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);

const toNumber = (token: string) => Number(token.replace(/\./g, "").replace(",", "."));

/** Text rows of every page: items sharing a baseline joined left to right with " | ". */
export async function extractPdfTextRows(pdfPath: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
  ).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useSystemFonts: true }).promise;
  const out: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      const rows = new Map<number, Array<[number, string]>>();
      for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
        if (typeof item.str !== "string" || !item.transform) continue;
        const y = Math.round(item.transform[5]);
        const key = Array.from(rows.keys()).find((k) => Math.abs(k - y) <= 2) ?? y;
        const row = rows.get(key) ?? [];
        row.push([item.transform[4], item.str]);
        rows.set(key, row);
      }
      for (const y of Array.from(rows.keys()).sort((a, b) => b - a)) {
        out.push(rows.get(y)!.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(" | "));
      }
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

/**
 * Invoice lines as printed: between the header row ("Omschrijving ... Bedrag")
 * and the VAT summary, a row counts when it has a description, a quantity and a
 * money amount (the last money value on the row is the line amount). Heading
 * rows without numbers are skipped, whatever sits next to them.
 */
export function parseTableRows(rows: string[]): TextRowLine[] {
  const start = rows.findIndex((r) => /omschrijving/i.test(r) && /bedrag/i.test(r));
  if (start < 0) return [];
  const lines: TextRowLine[] = [];
  for (const row of rows.slice(start + 1)) {
    if (/^\s*\|?\s*(btwcode|excl\.?\s*btw|totaal|subtotaal)/i.test(row.replace(/\s+/g, " "))) break;
    const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
    const description = cells.find((c) => /[a-z]/i.test(c) && !MONEY.test(c) && !NUMBER.test(c));
    const numeric = cells.filter((c) => NUMBER.test(c) || MONEY.test(c));
    const money = cells.filter((c) => MONEY.test(c));
    if (!description || money.length === 0 || numeric.length < 2) continue;
    lines.push({ description: description.replace(/\s+/g, " "), amount: Math.abs(toNumber(money[money.length - 1])) });
  }
  return lines;
}

/** The amounts a table may add up to: subtotal, total minus VAT, or (no VAT stated) the total. */
export function expectedTableSums(invoice: RowCheckInvoice): number[] {
  const sums: number[] = [];
  if (cents(invoice.subtotalAmount) > 0) sums.push(cents(invoice.subtotalAmount));
  if (cents(invoice.vatAmount) > 0 && cents(invoice.totalAmount) > 0) sums.push(cents(invoice.totalAmount) - cents(invoice.vatAmount));
  if (sums.length === 0 && cents(invoice.totalAmount) > 0) sums.push(cents(invoice.totalAmount));
  return sums;
}

/**
 * The lines read from the text layer, or null when there is nothing to trust:
 * no table found, or its amounts do not add up to what the invoice states.
 */
export function linesFromTextRows(rows: string[], invoice: RowCheckInvoice): TextRowLine[] | null {
  const lines = parseTableRows(rows);
  if (lines.length === 0) return null;
  const sum = lines.reduce((acc, l) => acc + cents(l.amount), 0);
  return expectedTableSums(invoice).some((target) => Math.abs(sum - target) <= 1) ? lines : null;
}
