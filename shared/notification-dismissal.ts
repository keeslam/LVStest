/**
 * Round 2 punt 12 (Kees, 2026-10-21) — dismissing an APK, warranty, low-emission
 * zone / Move IZI or missing-invoice notification now counts for the whole team.
 *
 * At dismiss time you choose how long: 1 week (the default, as before), 1 month, or
 * "until the date changes" — that one holds while the date the notice was about (the
 * APK date, warranty end, zone end, visit end) is still the same, so a new date brings
 * the notice back. Who dismissed what is in the activity log.
 */

export const DISMISSAL_MODES = ["week", "month", "until_change"] as const;
export type DismissalMode = (typeof DISMISSAL_MODES)[number];

/** The keys the notification centre uses: dismissed_apk_12, dismissed_zone_moveIzi_12, ... */
const KEY = /^dismissed_(apk|warranty|zone_(euroZone|moveIzi)|missing_invoice)_\d{1,10}$/;

export function isDismissalKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

export function isDismissalMode(value: unknown): value is DismissalMode {
  return typeof value === "string" && (DISMISSAL_MODES as readonly string[]).includes(value);
}

/** When a time-limited dismissal ends; null for "until the date changes". */
export function dismissalUntil(mode: DismissalMode, now: Date): Date | null {
  if (mode === "until_change") return null;
  const until = new Date(now);
  if (mode === "week") until.setDate(until.getDate() + 7);
  else until.setMonth(until.getMonth() + 1);
  return until;
}

export interface DismissalLike {
  key: string;
  mode: string;
  until: string | Date | null;
  fingerprint: string | null;
}

/**
 * Whether the dismissal still hides the notice: a time-limited one until its end, an
 * "until the date changes" one while the notice's date is the one it was dismissed for.
 */
export function dismissalHolds(d: DismissalLike | undefined, now: Date, currentFingerprint?: string | null): boolean {
  if (!d) return false;
  if (d.mode === "until_change") {
    return (d.fingerprint ?? "") === (currentFingerprint ?? "");
  }
  return d.until != null && new Date(d.until).getTime() > now.getTime();
}
