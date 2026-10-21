/**
 * Round 2 punt 11 part B (Kees, 2026-10-21) — "factuur ontbreekt": the list, the
 * printable PDF and the weekly mail (shared/missing-invoice.ts has the rules).
 *
 * The mail is checked every 15 minutes in the office time zone and goes once on the
 * chosen weekday from the chosen time; the day it went is kept in the app setting
 * `missing_invoice_mail_state`, so a restart does not send it twice. An empty list
 * sends nothing.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { expenses, reservations } from "../../shared/schema";
import {
  MISSING_INVOICE_MAIL_KEY,
  MISSING_INVOICE_MAIL_STATE_KEY,
  isMissingInvoiceMailDue,
  missingInvoiceMailFromSetting,
  missingInvoiceRows,
  type MissingInvoiceColumn,
  type MissingInvoiceRow,
} from "../../shared/missing-invoice";
import { officeDate } from "./lifecycle";
import { createOfficeCronTask, officeTimeZone, type OfficeCronTask } from "./office-time";
import { sanitizeForWinAnsi } from "../utils/pdf-text";
import { sendEmail } from "../utils/email-service";
import { AuditLogger } from "../utils/security/auditLogger";

/** The mail and the PDF go to the office: Dutch, like the other office documents. */
const COLUMN_LABEL: Record<MissingInvoiceColumn, string> = {
  licensePlate: "Kenteken",
  vehicle: "Merk en model",
  type: "Soort",
  period: "Periode",
  description: "Omschrijving",
  daysSinceEnd: "Dagen sinds einde",
};

const TYPE_LABEL: Record<string, string> = {
  breakdown: "Pech", tire_replacement: "Bandenwissel", brake_service: "Remmenonderhoud", engine_repair: "Motorreparatie",
  transmission_repair: "Transmissiereparatie", electrical_issue: "Elektrisch probleem", air_conditioning: "Airconditioning",
  battery_replacement: "Accuwissel", oil_change: "Olieverversing", regular_maintenance: "Regulier onderhoud",
  apk_inspection: "APK-keuring", warranty_service: "Garantieservice", accident_damage: "Ongevalschade", other: "Overig",
};

function dutchDate(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}-${m}-${y}`;
}

function plate(value: string): string {
  return value.toUpperCase();
}

export function missingInvoiceCell(row: MissingInvoiceRow, column: MissingInvoiceColumn): string {
  switch (column) {
    case "licensePlate": return plate(row.licensePlate);
    case "vehicle": return [row.brand, row.model].filter(Boolean).join(" ");
    case "type": return row.type ? TYPE_LABEL[row.type] ?? row.type : "";
    case "period": return row.startDate === row.endDate ? dutchDate(row.endDate) : `${dutchDate(row.startDate)} t/m ${dutchDate(row.endDate)}`;
    case "description": return row.description;
    case "daysSinceEnd": return String(row.daysSinceEnd);
  }
}

export async function loadMissingInvoices(): Promise<{ rows: MissingInvoiceRow[]; days: number }> {
  const settings = await storage.getSettings();
  const days = settings?.missingInvoiceDays ?? 14;
  const [visits, vehicles, linked] = await Promise.all([
    db.select().from(reservations).where(and(eq(reservations.type, "maintenance_block"), isNull(reservations.deletedAt))),
    storage.getAllVehicles(),
    db.selectDistinct({ id: expenses.maintenanceBlockId }).from(expenses).where(isNotNull(expenses.maintenanceBlockId)),
  ]);
  const withCosts = new Set(linked.map((l) => l.id as number));
  return { rows: missingInvoiceRows(visits, vehicles, withCosts, officeDate(new Date()), days), days };
}

/** A4 landscape table, repeated header on every page. */
export async function missingInvoicePdf(rows: MissingInvoiceRow[], columns: MissingInvoiceColumn[], title: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [842, 595];
  const margin = 36;
  const size = 9;
  const widthsByColumn: Record<MissingInvoiceColumn, number> = { licensePlate: 80, vehicle: 140, type: 110, period: 140, description: 220, daysSinceEnd: 80 };
  const total = columns.reduce((s, c) => s + widthsByColumn[c], 0);
  const scale = (W - 2 * margin) / total;
  const widths = columns.map((c) => widthsByColumn[c] * scale);
  const fit = (text: string, width: number, f = font) => {
    let t = sanitizeForWinAnsi(text, "missing-invoice list");
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > width - 6) t = t.slice(0, -2) + ".";
    return t;
  };

  let page = pdf.addPage([W, H]);
  let y = H - margin;
  const header = () => {
    page.drawText(sanitizeForWinAnsi(title, "title"), { x: margin, y, size: 14, font: bold, color: rgb(0, 0, 0) });
    y -= 18;
    page.drawText(`Afgedrukt op ${dutchDate(officeDate(new Date()))} - ${rows.length} bezoek(en)`, { x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 20;
    let x = margin;
    columns.forEach((c, i) => {
      page.drawText(fit(COLUMN_LABEL[c], widths[i], bold), { x, y, size, font: bold });
      x += widths[i];
    });
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 12;
  };
  header();
  if (rows.length === 0) page.drawText("Geen werkplaatsbezoeken zonder factuur.", { x: margin, y, size, font });
  for (const row of rows) {
    if (y < margin) {
      page = pdf.addPage([W, H]);
      y = H - margin;
      header();
    }
    let x = margin;
    columns.forEach((c, i) => {
      page.drawText(fit(missingInvoiceCell(row, c), widths[i]), { x, y, size, font });
      x += widths[i];
    });
    y -= 14;
  }
  return Buffer.from(await pdf.save());
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function missingInvoiceMailHtml(rows: MissingInvoiceRow[], columns: MissingInvoiceColumn[], intro: string): string {
  const head = columns.map((c) => `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ccc">${COLUMN_LABEL[c]}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(missingInvoiceCell(r, c))}</td>`).join("")}</tr>`)
    .join("");
  const introHtml = intro.trim() ? `<p>${escapeHtml(intro).replace(/\n/g, "<br>")}</p>` : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px">${introHtml}<table style="border-collapse:collapse">${`<thead><tr>${head}</tr></thead>`}<tbody>${body}</tbody></table><p style="color:#666;font-size:12px">De lijst staat ook als PDF in de bijlage.</p></div>`;
}

export type MissingInvoiceMailResult = { sent: boolean; reason?: "empty" | "no-recipients" | "send-failed"; count: number };

export async function sendMissingInvoiceMail(trigger: string): Promise<MissingInvoiceMailResult> {
  const settings = missingInvoiceMailFromSetting((await storage.getAppSettingByKey(MISSING_INVOICE_MAIL_KEY))?.value);
  const { rows } = await loadMissingInvoices();
  if (settings.recipients.length === 0) return { sent: false, reason: "no-recipients", count: rows.length };
  if (rows.length === 0) {
    void AuditLogger.system("system.missing-invoice-mail", { trigger, count: 0, sent: false, reason: "empty" });
    return { sent: false, reason: "empty", count: 0 };
  }
  const pdf = await missingInvoicePdf(rows, settings.columns, settings.subject);
  const sent = await sendEmail({
    to: settings.recipients.join(", "),
    subject: settings.subject,
    html: missingInvoiceMailHtml(rows, settings.columns, settings.intro),
    attachments: [{ filename: `facturen-ontbreken-${officeDate(new Date())}.pdf`, content: pdf }],
    logTemplate: "missing_invoice_list",
  }, "maintenance");
  void AuditLogger.system("system.missing-invoice-mail", { trigger, count: rows.length, sent, visitIds: rows.slice(0, 100).map((r) => r.visitId) }, sent ? "success" : "failure");
  return sent ? { sent: true, count: rows.length } : { sent: false, reason: "send-failed", count: rows.length };
}

/** Now in the office zone: the date, ISO weekday (1 = Monday) and HH:MM. */
function officeNow(): { day: string; weekday: number; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: officeTimeZone(), weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { day: officeDate(new Date()), weekday, time: `${get("hour").replace("24", "00")}:${get("minute")}` };
}

async function writeState(day: string): Promise<void> {
  const existing = await storage.getAppSettingByKey(MISSING_INVOICE_MAIL_STATE_KEY);
  if (existing) await storage.updateAppSetting(existing.id, { value: { lastSentOn: day } as any, updatedBy: "system" });
  else await storage.createAppSetting({ key: MISSING_INVOICE_MAIL_STATE_KEY, value: { lastSentOn: day } as any, category: "system", updatedBy: "system" } as any);
}

export class MissingInvoiceScheduler {
  private task: OfficeCronTask | null = null;

  start(): void {
    if (this.task) return;
    this.task = createOfficeCronTask("*/15 * * * *", () => this.tick());
    this.task.start();
    console.log("Missing-invoice mail scheduler started - checks every 15 minutes");
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }

  private async tick(): Promise<void> {
    try {
      const settings = missingInvoiceMailFromSetting((await storage.getAppSettingByKey(MISSING_INVOICE_MAIL_KEY))?.value);
      const state = (await storage.getAppSettingByKey(MISSING_INVOICE_MAIL_STATE_KEY))?.value as { lastSentOn?: string } | undefined;
      const now = officeNow();
      if (!isMissingInvoiceMailDue(settings, now, state?.lastSentOn ?? null)) return;
      // Marked first: a mail server that hangs must not get the same list every 15 minutes.
      await writeState(now.day);
      await sendMissingInvoiceMail("scheduled");
    } catch (error) {
      console.error("Missing-invoice mail failed:", error);
      void AuditLogger.system("system.missing-invoice-mail", { trigger: "scheduled", error: error instanceof Error ? error.message : String(error) }, "failure");
    }
  }
}
