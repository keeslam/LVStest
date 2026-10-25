import fs from "fs";
import path from "path";
import { insertExpenseSchema, type Expense, type InsertExpense } from "../../../shared/schema";
import { toUploadsRelative } from "../../../shared/paths";
import { normalizeExpenseCategory } from "../../../shared/expense-categories";
import { storage } from "../../storage";
import { realtimeEvents } from "../../realtime-events";
import { getRelativePath, resolveDocumentFilePath } from "../document-paths";

export interface BookableLine { description: string; amount: number; category: string }
export interface InvoiceReceipt { relativePath: string; fileName: string; size: number; contentType: string }

export interface BookInvoiceInput {
  invoice: { vendor?: string; invoiceNumber?: string; invoiceDate: string };
  vehicleId: number;
  lineItems: BookableLine[];
  receipt?: InvoiceReceipt | null;
  inboxItemId?: number | null;
  createdBy: string;
}
export interface BookInvoiceResult { expenses: Expense[]; errors: string[] }

/** Mailed invoices land in the first folder, manual scans in the second. */
const INVOICE_DIRS = ["invoice-inbox", "invoices"];

/**
 * Absolute path of a stored invoice file, or null. Goes through the one owner
 * of stored paths (BUG-060) and additionally insists on the two invoice
 * folders, because the manual route hands in a path that came from the client.
 */
export function resolveInvoiceFile(storedPath: string | null | undefined): string | null {
  const abs = resolveDocumentFilePath(storedPath);
  if (!abs) return null;
  const relative = toUploadsRelative(abs);
  return relative !== null && INVOICE_DIRS.some((dir) => relative.startsWith(`${dir}/`)) ? abs : null;
}

export function receiptFromStoredPath(storedPath: string | null | undefined, contentType = "application/pdf"): InvoiceReceipt | null {
  const abs = resolveInvoiceFile(storedPath);
  if (!abs) return null;
  return { relativePath: getRelativePath(abs), fileName: path.basename(abs), size: fs.statSync(abs).size, contentType };
}

/** One line per category, the way the scanner dialog groups by default. Sums in cents. */
export function groupLinesByCategory(lines: BookableLine[]): BookableLine[] {
  const groups = new Map<string, { cents: number; descriptions: string[] }>();
  for (const line of lines) {
    const category = normalizeExpenseCategory(line.category);
    const group = groups.get(category) ?? { cents: 0, descriptions: [] };
    group.cents += Math.round((Number(line.amount) || 0) * 100);
    if (line.description && !group.descriptions.includes(line.description)) group.descriptions.push(line.description);
    groups.set(category, group);
  }
  return Array.from(groups.entries()).map(([category, group]) => ({
    category, amount: group.cents / 100, description: group.descriptions.join(" • ").slice(0, 500),
  }));
}

/**
 * Expenses are always booked excl. VAT. Garage invoices usually list their lines
 * excl. VAT, but some list them incl. VAT. When the lines are closer to the
 * stated total than to the excl.-VAT amount (subtotal, or total minus VAT), the
 * lines are scaled down to that amount in proportion, largest-remainder rounded
 * so the result sums to exactly it in cents. Otherwise they stay as they are.
 */
export function linesExclVat(
  lines: BookableLine[],
  invoice: { totalAmount?: number | null; subtotalAmount?: number | null; vatAmount?: number | null },
): BookableLine[] {
  const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);
  const totalCents = toCents(invoice.totalAmount);
  const exclCents = toCents(invoice.subtotalAmount) > 0
    ? toCents(invoice.subtotalAmount)
    : toCents(invoice.vatAmount) > 0 ? totalCents - toCents(invoice.vatAmount) : 0;
  const lineCents = lines.map((line) => toCents(line.amount));
  const sumCents = lineCents.reduce((acc, c) => acc + c, 0);
  if (totalCents <= 0 || exclCents <= 0 || exclCents >= totalCents || sumCents <= 0 || lineCents.some((c) => c < 0)) return lines;
  if (Math.abs(sumCents - totalCents) >= Math.abs(sumCents - exclCents)) return lines;

  const exact = lineCents.map((c) => (c * exclCents) / sumCents);
  const scaled = exact.map(Math.floor);
  let remainder = exclCents - scaled.reduce((acc, c) => acc + c, 0);
  const byFraction = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    scaled[index] += 1;
    remainder -= 1;
  }
  return lines.map((line, index) => ({ ...line, amount: scaled[index] / 100 }));
}

export function invoiceExpenseDescription(line: BookableLine, invoice: { vendor?: string; invoiceNumber?: string }): string {
  const number = String(invoice.invoiceNumber ?? "").trim() || "onbekend";
  const vendor = String(invoice.vendor ?? "").trim() || "onbekende leverancier";
  return `${line.description} (Factuur ${number}, ${vendor})`;
}

/**
 * The one place an invoice becomes expenses — mail import, review dialog and
 * manual scan all end here. A line that fails validation is reported and does
 * not stop the others.
 */
export async function bookInvoiceAsExpenses(input: BookInvoiceInput): Promise<BookInvoiceResult> {
  const expenses: Expense[] = [];
  const errors: string[] = [];
  for (const line of input.lineItems) {
    try {
      const validated = insertExpenseSchema.parse({
        vehicleId: input.vehicleId,
        category: normalizeExpenseCategory(line.category),
        amount: line.amount,
        date: input.invoice.invoiceDate,
        description: invoiceExpenseDescription(line, input.invoice),
        supplier: String(input.invoice.vendor ?? "").trim().slice(0, 120) || null,
        createdBy: input.createdBy,
        updatedBy: null,
      });
      // Server-set fields: the insert schema deliberately omits them (BUG-060).
      const serverFields = {
        inboxItemId: input.inboxItemId ?? null,
        receiptFile: input.receipt?.fileName ?? null,
        receiptFilePath: input.receipt?.relativePath ?? null,
        receiptFileSize: input.receipt?.size ?? null,
        receiptContentType: input.receipt?.contentType ?? null,
      };
      const expense = await storage.createExpense({ ...validated, ...serverFields } as InsertExpense);
      realtimeEvents.expenses.created(expense);
      expenses.push(expense);
    } catch (error) {
      errors.push(`${line.description}: ${(error as Error).message}`);
    }
  }
  return { expenses, errors };
}
