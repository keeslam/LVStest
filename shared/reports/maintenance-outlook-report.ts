/**
 * Rapporten fase 3, onderdeel 7: the maintenance and APK outlook on Rapporten > Voertuigen.
 * What the server (server/services/reports/maintenance-outlook-report.ts) and the card agree on.
 *
 * The period is the horizon: `from` is today (and the "today" of the service forecast), `to`
 * is from + N months. One APK row per vehicle with an APK date, one service row per vehicle
 * with an expected service date. Overdue = due before `from`, however long ago.
 * The km fields are only filled for admins; the server sets them to null for everyone else.
 */
import type { ReportTileTotal } from "../report-kit";

/** apk / service = due within [from, to]; overdue = due before from; all = overdue plus within. amount is always 0. */
export const MAINTENANCE_OUTLOOK_TILES = ["apk", "service", "overdue", "all"] as const;
export type MaintenanceOutlookTile = (typeof MAINTENANCE_OUTLOOK_TILES)[number];

export const MAINTENANCE_OUTLOOK_SORTS = ["dueDate", "licensePlate", "kind"] as const;
export type MaintenanceOutlookSort = (typeof MAINTENANCE_OUTLOOK_SORTS)[number];

/** Horizon choices in months; the card sends from = today and to = from + N months. */
export const MAINTENANCE_OUTLOOK_HORIZONS = [1, 2, 3, 6, 12] as const;
export const DEFAULT_OUTLOOK_HORIZON = 3;

/** Monday of the ISO week of a yyyy-mm-dd day, as yyyy-mm-dd. */
export function isoWeekStart(ymd: string): string {
  const t = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  const weekday = (new Date(t).getUTCDay() + 6) % 7; // Monday 0 ... Sunday 6
  return new Date(t - weekday * 86_400_000).toISOString().slice(0, 10);
}

export interface MaintenanceOutlookRow {
  /** `${vehicleId}-${kind}` */
  id: string;
  vehicleId: number;
  licensePlate: string;
  brand: string;
  model: string;
  kind: "apk" | "service";
  /** yyyy-mm-dd */
  dueDate: string;
  /** Monday of the ISO week of dueDate. */
  weekStart: string;
  /** dueDate before the horizon's from. */
  overdue: boolean;
  /** apk for an APK row; km or months: which service limit is reached first. */
  basis: "apk" | "km" | "months";
  /** Too few km readings for a km prediction (service rows only). */
  tooFewReadings: boolean;
  /** Admin only; null for everyone else. */
  currentMileage: number | null;
  nextServiceMileage: number | null;
  kmUntilService: number | null;
  kmPerDay: number | null;
  amount: 0;
}

export interface MaintenanceOutlookWeek {
  /** Monday, yyyy-mm-dd */
  weekStart: string;
  apk: number;
  service: number;
  /** Ordered by dueDate, then license plate. */
  items: Array<{ vehicleId: number; licensePlate: string; kind: "apk" | "service"; dueDate: string }>;
}

export interface MaintenanceOutlookSummary {
  tiles: Record<MaintenanceOutlookTile, ReportTileTotal>;
  /** Only rows within [from, to], weeks ascending. */
  byWeek: MaintenanceOutlookWeek[];
}
