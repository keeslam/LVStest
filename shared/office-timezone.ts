/**
 * D11 (besluiten B-41, ontwerp 7.1) — the time zone the office works in.
 *
 * "Today", the date on a document, the hour a cron job fires: all of it used to
 * say `Europe/Amsterdam` in ~15 places. The zone is now an `app_settings` row
 * (`office_timezone`, default Europe/Amsterdam) that App-instellingen can change;
 * everything that needs the office calendar asks for the zone and passes it to
 * the helpers below. Server (`services/office-time.ts`) and client
 * (`lib/office-timezone.ts`) keep the current value; this file is pure.
 *
 * All offsets are worked out per instant through `Intl`, so summer and winter
 * time follow from the zone's own rules and nothing assumes "+1 or +2".
 */

/** `app_settings.key` of the setting. */
export const OFFICE_TIMEZONE_KEY = "office_timezone";

/** The zone the application used before it became a setting, and the fallback while nothing is stored. */
export const DEFAULT_OFFICE_TIMEZONE = "Europe/Amsterdam";

/** Stable error code of the settings route when the stored name is not a zone. */
export const INVALID_OFFICE_TIMEZONE_CODE = "INVALID_OFFICE_TIMEZONE";

/** True for an IANA zone name this runtime can format in. */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone a stored `office_timezone` value stands for: the bare name, or an
 * object carrying `timeZone`. Anything else (missing row, garbage) is the
 * default, so a bad row can never stop the application from knowing the date.
 */
export function officeTimeZoneFromSetting(value: unknown): string {
  const candidate =
    typeof value === "string"
      ? value.trim()
      : value && typeof value === "object" && typeof (value as { timeZone?: unknown }).timeZone === "string"
        ? (value as { timeZone: string }).timeZone.trim()
        : "";
  return isValidTimeZone(candidate) ? candidate : DEFAULT_OFFICE_TIMEZONE;
}

/** The calendar date (`yyyy-MM-dd`) of an instant in `zone`. */
export function dateInZone(instant: Date, zone: string): string {
  // `en-CA` renders as yyyy-MM-dd, which is exactly the shape the API stores.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall clock of an instant in `zone`, as numbers. */
export function wallClockInZone(instant: Date, zone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Minutes the zone is ahead of UTC at `instant` (negative west of Greenwich). */
export function zoneOffsetMinutes(zone: string, instant: Date): number {
  const w = wallClockInZone(instant, zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // The instant has no sub-second wall clock; drop its milliseconds for the comparison.
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** `UTC+02:00` / `UTC-04:00`: what the settings screen shows next to the zone. */
export function zoneOffsetLabel(zone: string, instant: Date): string {
  const minutes = zoneOffsetMinutes(zone, instant);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** True when the zone changes its clocks during the year of `instant` (its January and July offsets differ). */
export function observesDaylightSaving(zone: string, instant: Date): boolean {
  const year = instant.getUTCFullYear();
  return zoneOffsetMinutes(zone, new Date(Date.UTC(year, 0, 1))) !== zoneOffsetMinutes(zone, new Date(Date.UTC(year, 6, 1)));
}

/** True while the zone is on summer time at `instant` (it observes daylight saving and is on the larger offset). */
export function isDaylightSavingTime(zone: string, instant: Date): boolean {
  if (!observesDaylightSaving(zone, instant)) return false;
  const year = instant.getUTCFullYear();
  const larger = Math.max(
    zoneOffsetMinutes(zone, new Date(Date.UTC(year, 0, 1))),
    zoneOffsetMinutes(zone, new Date(Date.UTC(year, 6, 1))),
  );
  return zoneOffsetMinutes(zone, instant) === larger;
}

/**
 * The instant at which the wall clock in `zone` reads `date` + `time`
 * (`yyyy-MM-dd`, `HH:mm`). Works for any zone and across a clock change: the
 * offset is taken at the guess and checked once more at the corrected instant.
 */
export function zonedDateTimeToInstant(date: string, time: string, zone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wall - zoneOffsetMinutes(zone, new Date(wall)) * 60_000;
  const corrected = wall - zoneOffsetMinutes(zone, new Date(instant)) * 60_000;
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** The Europe/* zones the runtime knows, sorted; always contains the default. */
export function europeanTimeZones(): string[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  const europe = new Set(all.filter((z) => z.startsWith("Europe/")));
  europe.add(DEFAULT_OFFICE_TIMEZONE);
  return [...europe].sort();
}
