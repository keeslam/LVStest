/**
 * Round 2 punt 11 (Kees, 2026-10-21) — the kind of workshop visit.
 *
 * It used to live only as the prefix of the notes ("breakdown: lekke band"),
 * parsed back with `notes.split(':')` in half a dozen places; a colon in a
 * description broke it. It is now `reservations.maintenanceType`. Rows written
 * before the column keep working: the prefix is read when it is a known kind.
 * The notes keep their shape, because the edit dialog and the portal request
 * still read the description from them.
 */

export const MAINTENANCE_TYPES = [
  "breakdown",
  "tire_replacement",
  "brake_service",
  "engine_repair",
  "transmission_repair",
  "electrical_issue",
  "air_conditioning",
  "battery_replacement",
  "oil_change",
  "regular_maintenance",
  "apk_inspection",
  "warranty_service",
  "accident_damage",
  "other",
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export function isMaintenanceType(value: unknown): value is MaintenanceType {
  return typeof value === "string" && (MAINTENANCE_TYPES as readonly string[]).includes(value);
}

/** The known kind at the start of the notes ("breakdown: ..."), or null. */
export function maintenanceTypeFromNotes(notes: string | null | undefined): MaintenanceType | null {
  const head = (notes ?? "").split(":")[0].trim().toLowerCase().replace(/\s+/g, "_");
  return isMaintenanceType(head) ? head : null;
}

/** The visit's kind: the column, else the notes' prefix, else null. */
export function maintenanceTypeOf(block: { maintenanceType?: string | null; notes?: string | null } | null | undefined): MaintenanceType | null {
  if (!block) return null;
  return isMaintenanceType(block.maintenanceType) ? block.maintenanceType : maintenanceTypeFromNotes(block.notes);
}

/**
 * What the lists print as the kind: the known kind, else whatever the notes start
 * with (the legacy "Vehicle maintenance block" has its own translation).
 */
export function maintenanceTypeKey(block: { maintenanceType?: string | null; notes?: string | null } | null | undefined): string | undefined {
  return maintenanceTypeOf(block) ?? block?.notes?.split(":")[0] ?? undefined;
}
