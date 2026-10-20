/**
 * Punt 15 / OPT-032 (Kees, 2026-10-20) — a finished key-cabinet audit is kept
 * for good, readable by anyone who may view vehicles, and printable on A4
 * with the missing keys, the keys that should not hang there, every scanned
 * key, a note and a signature line.
 *
 * The client sends vehicle ids; the server turns them into snapshots (plate,
 * brand, model) so the record shows what was true on the day of the audit.
 */

export const KEY_AUDIT_MODES = ["main", "spare"] as const;
export type KeyAuditModeValue = (typeof KEY_AUDIT_MODES)[number];

export const KEY_AUDIT_NOTE_MAX = 2000;
const MAX_IDS = 5000;

export interface KeyAuditInput {
  mode: KeyAuditModeValue;
  expectedCount: number;
  missingIds: number[];
  unexpectedIds: number[];
  scannedIds: number[];
  note: string | null;
}

function ids(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_IDS) return null;
  if (!value.every((v) => Number.isInteger(v) && v > 0)) return null;
  return Array.from(new Set(value as number[]));
}

/** Checks what the dialog sends on Afronden; names the field that is wrong. */
export function parseKeyAuditInput(body: Record<string, unknown> | null | undefined):
  { ok: true; value: KeyAuditInput } | { ok: false; field: string } {
  const mode = body?.mode;
  if (typeof mode !== "string" || !(KEY_AUDIT_MODES as readonly string[]).includes(mode)) return { ok: false, field: "mode" };
  const expectedCount = body?.expectedCount;
  if (!Number.isInteger(expectedCount) || (expectedCount as number) < 0 || (expectedCount as number) > MAX_IDS) return { ok: false, field: "expectedCount" };
  const missingIds = ids(body?.missingIds);
  if (!missingIds) return { ok: false, field: "missingIds" };
  const unexpectedIds = ids(body?.unexpectedIds);
  if (!unexpectedIds) return { ok: false, field: "unexpectedIds" };
  const scannedIds = ids(body?.scannedIds);
  if (!scannedIds) return { ok: false, field: "scannedIds" };
  const rawNote = body?.note;
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== "string") return { ok: false, field: "note" };
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > KEY_AUDIT_NOTE_MAX) return { ok: false, field: "note" };
  return {
    ok: true,
    value: { mode: mode as KeyAuditModeValue, expectedCount: expectedCount as number, missingIds, unexpectedIds, scannedIds, note: note || null },
  };
}
