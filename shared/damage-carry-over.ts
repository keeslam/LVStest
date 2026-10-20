/**
 * Kees, 2026-10-20 (round 2, punt 5) — a new pickup damage check starts with the
 * damage already known: the markers and drawn lines of the vehicle's newest check
 * (pickup or return, of any rental). They become ordinary markers of the new check,
 * so the check the customer signs shows all damage; repaired damage is removed by
 * hand. Each carried marker remembers the check it came from.
 */

export interface CarriedMarkerLike {
  id: string;
  carriedFrom?: number;
  [key: string]: unknown;
}

export interface DamageCheckLike {
  id: number;
  checkType?: string | null;
  checkDate?: string | Date | null;
  createdAt?: string | Date | null;
  damageMarkers?: unknown;
  drawingPaths?: unknown;
}

function parseList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function time(check: DamageCheckLike): number {
  const value = check.checkDate ?? check.createdAt;
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/** The newest check of the vehicle that has any damage to carry over, or null. */
export function carryOverSource<T extends DamageCheckLike>(checks: T[]): T | null {
  const sorted = [...checks].sort((a, b) => time(b) - time(a) || b.id - a.id);
  const newest = sorted[0];
  if (!newest) return null;
  const { markers, paths } = carriedDamage(newest);
  return markers.length > 0 || paths.length > 0 ? newest : null;
}

/** The source's markers (fresh ids, marked with where they came from) and lines. */
export function carriedDamage(source: DamageCheckLike): { markers: CarriedMarkerLike[]; paths: string[] } {
  const markers = parseList(source.damageMarkers)
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m, i) => ({ ...m, id: `carried-${source.id}-${i}`, carriedFrom: source.id }) as CarriedMarkerLike);
  const paths = parseList(source.drawingPaths).filter((p): p is string => typeof p === "string" && p.trim() !== "");
  return { markers, paths };
}
