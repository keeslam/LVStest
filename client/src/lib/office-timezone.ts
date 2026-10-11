/**
 * D11 (besluiten B-41, ontwerp 7.1) — the office time zone on the client.
 *
 * The server stores it as the `app_settings` row `office_timezone` (default
 * Europe/Amsterdam, editable in App-instellingen). The client needs it in places
 * that are not React components (`officeToday()` is called from event handlers
 * and schema defaults), so it lives in a tiny external store: a module variable
 * with subscribers. `OfficeTimeZoneLoader` (mounted once a user is signed in)
 * fills it from `/api/app-settings/key/office_timezone`; the portal fills it from
 * `/api/portal/me`. Until then the default answers — which is also what a test
 * without a server sees.
 */
import { useSyncExternalStore } from "react";
import { format } from "date-fns";
import { DEFAULT_OFFICE_TIMEZONE, officeTimeZoneFromSetting, wallClockInZone } from "@shared/office-timezone";

let zone: string = DEFAULT_OFFICE_TIMEZONE;
const listeners = new Set<() => void>();

/** The zone the office works in. */
export function getOfficeTimeZone(): string {
  return zone;
}

/**
 * Takes the stored setting value (a zone name, or `{ timeZone }`); anything that
 * is not a zone this browser can format in becomes the default. Subscribers hear
 * about a real change only.
 */
export function setOfficeTimeZone(value: unknown): void {
  const next = officeTimeZoneFromSetting(value);
  if (next === zone) return;
  zone = next;
  listeners.forEach((listener) => listener());
}

export function subscribeOfficeTimeZone(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The office zone as React state: a component using it re-renders when the setting is loaded or changed. */
export function useOfficeTimeZone(): string {
  return useSyncExternalStore(subscribeOfficeTimeZone, getOfficeTimeZone, getOfficeTimeZone);
}

/**
 * A `Date` whose local fields (year … second) are the wall clock of `instant` in
 * `zone`. date-fns formats in the browser's own zone, so formatting this shifted
 * date prints the office time whatever zone the browser is in. Only meant for
 * formatting, never for storing or comparing.
 */
export function toOfficeWallClock(instant: Date, officeZone: string = zone): Date {
  const w = wallClockInZone(instant, officeZone);
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/** `yyyy-MM-ddTHH:mm[:ss[.fff]]` followed by `Z` or an offset: an instant, not a calendar date. */
const INSTANT_STRING = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

/** True for a value that names a moment in time (timestamp string with a zone, or epoch milliseconds). */
export function isInstantValue(value: unknown): boolean {
  return typeof value === "number" || (typeof value === "string" && INSTANT_STRING.test(value.trim()));
}

/** Formats a timestamp (ISO string, epoch or Date) in the office zone with a date-fns pattern; empty text for an unreadable value. */
export function formatInOfficeZone(value: string | number | Date | null | undefined, pattern: string): string {
  if (value === null || value === undefined || value === "") return "";
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  return format(toOfficeWallClock(instant), pattern);
}
