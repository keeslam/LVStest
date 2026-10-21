/**
 * Round 2 punt 11 part B (Kees, 2026-10-21) — "factuur ontbreekt".
 *
 * A workshop visit that ended `settings.missingInvoiceDays` days ago (default 14)
 * and still has no linked cost is missing its invoice. It shows in the notification
 * centre, on a dashboard tile and on the visit, and a weekly mail can send the list
 * (table in the mail plus a PDF; nothing when the list is empty).
 *
 * Only visits that ended on or after MISSING_INVOICE_FROM (1 October 2026, the month
 * this was built) count: visits from before
 * costs could be linked to a visit at all would otherwise all show up at once.
 * "Geen factuur nodig" on a visit (`noInvoiceExpected`) takes it off the list.
 */
import { maintenanceTypeOf } from "./maintenance-type";

export const MISSING_INVOICE_FROM = "2026-10-01";
export const MISSING_INVOICE_MAIL_KEY = "missing_invoice_mail";
export const MISSING_INVOICE_MAIL_STATE_KEY = "missing_invoice_mail_state";
export const INVALID_MISSING_INVOICE_MAIL_CODE = "INVALID_MISSING_INVOICE_MAIL";

export const MISSING_INVOICE_COLUMNS = ["licensePlate", "vehicle", "type", "period", "description", "daysSinceEnd"] as const;
export type MissingInvoiceColumn = (typeof MISSING_INVOICE_COLUMNS)[number];

export interface MissingInvoiceRow {
  visitId: number;
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  type: string | null;
  startDate: string;
  endDate: string;
  description: string;
  daysSinceEnd: number;
}

function ymd(value: string | null | undefined): string | null {
  const day = (value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** The description part of "type: description\nnotes", or the first line. */
export function visitDescription(notes: string | null | undefined): string {
  const first = (notes ?? "").split("\n")[0] ?? "";
  const colon = first.indexOf(":");
  return (colon >= 0 && maintenanceTypeOf({ notes: first }) ? first.slice(colon + 1) : first).trim();
}

export function missingInvoiceRows(
  visits: Array<{ id: number; vehicleId: number | null; startDate: string; endDate?: string | null; maintenanceType?: string | null; notes?: string | null; noInvoiceExpected?: boolean | null }>,
  vehicles: Array<{ id: number; licensePlate: string; brand?: string | null; model?: string | null }>,
  visitIdsWithCosts: Set<number>,
  today: string,
  days: number,
): MissingInvoiceRow[] {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const rows: MissingInvoiceRow[] = [];
  for (const visit of visits) {
    const end = ymd(visit.endDate);
    if (!end || visit.vehicleId == null || visit.noInvoiceExpected || visitIdsWithCosts.has(visit.id)) continue;
    if (end < MISSING_INVOICE_FROM) continue;
    const since = daysBetween(end, today);
    if (since < days) continue;
    const vehicle = byId.get(visit.vehicleId);
    if (!vehicle) continue;
    rows.push({
      visitId: visit.id,
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand ?? "",
      model: vehicle.model ?? "",
      type: maintenanceTypeOf(visit),
      startDate: ymd(visit.startDate) ?? end,
      endDate: end,
      description: visitDescription(visit.notes),
      daysSinceEnd: since,
    });
  }
  return rows.sort((a, b) => b.daysSinceEnd - a.daysSinceEnd || a.licensePlate.localeCompare(b.licensePlate));
}

/** Instellingen for the weekly mail. `weekday` is 1 (Monday) to 7 (Sunday). */
export interface MissingInvoiceMailSettings {
  enabled: boolean;
  recipients: string[];
  weekday: number;
  time: string;
  subject: string;
  intro: string;
  columns: MissingInvoiceColumn[];
}

export const DEFAULT_MISSING_INVOICE_MAIL: MissingInvoiceMailSettings = {
  enabled: false,
  recipients: [],
  weekday: 1,
  time: "08:00",
  subject: "Werkplaatsbezoeken zonder factuur",
  intro: "Voor deze werkplaatsbezoeken is nog geen factuur binnen.",
  columns: [...MISSING_INVOICE_COLUMNS],
};

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function missingInvoiceMailFromSetting(value: unknown): MissingInvoiceMailSettings {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const columns = Array.isArray(v.columns)
    ? MISSING_INVOICE_COLUMNS.filter((c) => (v.columns as unknown[]).includes(c))
    : [...DEFAULT_MISSING_INVOICE_MAIL.columns];
  return {
    enabled: v.enabled === true,
    recipients: Array.isArray(v.recipients) ? v.recipients.filter((r): r is string => typeof r === "string" && EMAIL.test(r.trim())).map((r) => r.trim()) : [],
    weekday: Number.isInteger(v.weekday) && (v.weekday as number) >= 1 && (v.weekday as number) <= 7 ? (v.weekday as number) : DEFAULT_MISSING_INVOICE_MAIL.weekday,
    time: typeof v.time === "string" && TIME.test(v.time) ? v.time : DEFAULT_MISSING_INVOICE_MAIL.time,
    subject: typeof v.subject === "string" && v.subject.trim() ? v.subject.trim().slice(0, 200) : DEFAULT_MISSING_INVOICE_MAIL.subject,
    intro: typeof v.intro === "string" ? v.intro.slice(0, 2000) : DEFAULT_MISSING_INVOICE_MAIL.intro,
    columns: columns.length > 0 ? columns : [...DEFAULT_MISSING_INVOICE_MAIL.columns],
  };
}

/** The server accepts only a well-formed value (no line breaks in the subject: it is a mail header). */
export function isValidMissingInvoiceMail(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== "boolean") return false;
  if (!Array.isArray(v.recipients) || !v.recipients.every((r) => typeof r === "string" && EMAIL.test(r.trim()))) return false;
  if (v.enabled && v.recipients.length === 0) return false;
  if (!Number.isInteger(v.weekday) || (v.weekday as number) < 1 || (v.weekday as number) > 7) return false;
  if (typeof v.time !== "string" || !TIME.test(v.time)) return false;
  if (typeof v.subject !== "string" || !v.subject.trim() || /[\r\n]/.test(v.subject) || v.subject.length > 200) return false;
  if (typeof v.intro !== "string" || v.intro.length > 2000) return false;
  if (!Array.isArray(v.columns) || v.columns.length === 0 || !v.columns.every((c) => (MISSING_INVOICE_COLUMNS as readonly string[]).includes(c as string))) return false;
  return true;
}

/**
 * Whether the weekly mail is due now: switched on, the chosen weekday, at or after the
 * chosen time, and not already sent today. `weekday` of now is 1 (Monday) to 7.
 */
export function isMissingInvoiceMailDue(
  settings: MissingInvoiceMailSettings,
  now: { day: string; weekday: number; time: string },
  lastSentOn: string | null,
): boolean {
  return settings.enabled && settings.recipients.length > 0 && now.weekday === settings.weekday && now.time >= settings.time && lastSentOn !== now.day;
}
