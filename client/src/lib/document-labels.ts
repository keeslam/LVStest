/**
 * What the document library shows for a stored document type, a generated note and a stale reason.
 *
 * documents.document_type, documents.notes and documents.stale_reason hold English text the
 * generators wrote ("Damage Check (Return)", "Damage check recorded at return of reservation
 * #3200", "handover reverted"). The server and the stale/regenerate logic match on the stored
 * values, so they stay as they are; only what is SHOWN goes through i18next (audit 2026-10-09,
 * A-10-5). Anything not recognised - a type or a note a person typed - is shown unchanged.
 */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Document types a person can pick when uploading (stored verbatim) -> label key under uploadDialog.types. */
export const UPLOAD_DOCUMENT_TYPE_KEYS: Record<string, string> = {
  "APK Inspection": "apkInspection",
  "Contract": "contract",
  "Damage Report": "damageReport",
  "Insurance": "insurance",
  "Maintenance Record": "maintenanceRecord",
  "Receipt": "receipt",
  "Registration": "registration",
  "Vehicle Photos": "vehiclePhotos",
  "Warranty": "warranty",
  "Tire Replacement": "tireReplacement",
  "Front Window Replacement": "frontWindowReplacement",
  "Repair Report": "repairReport",
  "Other": "other",
};

/** Every translatable type -> the i18n key its label lives at (documents namespace). */
export const DOCUMENT_TYPE_LABEL_KEYS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(UPLOAD_DOCUMENT_TYPE_KEYS).map(([stored, key]) => [stored, `uploadDialog.types.${key}`])),
  "Contracts": "documentLabels.type.contracts",
  "Contract (Unsigned)": "documentLabels.type.contractUnsigned",
  "Contract (Signed)": "documentLabels.type.contractSigned",
  "Damage Check": "documentLabels.type.damageCheck",
  "Damage Check (Pickup)": "documentLabels.type.damageCheckPickup",
  "Damage Check (Return)": "documentLabels.type.damageCheckReturn",
  "Damage Check (Unsigned)": "documentLabels.type.damageCheckUnsigned",
  "transport_report": "documentLabels.type.transportReport",
  "Customer Upload": "documentLabels.type.customerUpload",
};

const EDITED_VERSION = /^(.*?) - Edited \(Previous Version (.+)\)$/;

export function documentTypeLabel(t: Translate, type: string | null | undefined): string {
  const stored = (type ?? "").trim();
  if (!stored) return "";
  const direct = DOCUMENT_TYPE_LABEL_KEYS[stored];
  if (direct) return t(direct);
  // routes.ts files an edited damage check's previous version as "<type> - Edited (Previous Version <stamp>)".
  const edited = EDITED_VERSION.exec(stored);
  if (edited && DOCUMENT_TYPE_LABEL_KEYS[edited[1]]) {
    return t("documentLabels.type.editedVersion", { type: t(DOCUMENT_TYPE_LABEL_KEYS[edited[1]]), stamp: edited[2] });
  }
  return stored;
}

const NOTE_PATTERNS: Array<{ pattern: RegExp; key: string; params: (m: RegExpExecArray) => Record<string, unknown> }> = [
  { pattern: /^Damage check recorded at return of reservation #(\d+)$/, key: "documentLabels.notes.damageCheckAtReturn", params: (m) => ({ id: m[1] }) },
  { pattern: /^Auto-generated unsigned contract for reservation #(\d+)$/, key: "documentLabels.notes.contractGenerated", params: (m) => ({ id: m[1] }) },
  { pattern: /^Damage check for reservation from (\S+) to (\S+)$/, key: "documentLabels.notes.damageCheckForPeriod", params: (m) => ({ from: m[1], to: m[2] }) },
  { pattern: /^Updated damage check for reservation from (\S+) to (\S+)$/, key: "documentLabels.notes.damageCheckUpdatedForPeriod", params: (m) => ({ from: m[1], to: m[2] }) },
  { pattern: /^Regenerated on request; replaces version (\d+)\.$/, key: "documentLabels.notes.regenerated", params: (m) => ({ version: m[1] }) },
];

export function documentNotesLabel(t: Translate, notes: string | null | undefined): string {
  const text = notes ?? "";
  for (const { pattern, key, params } of NOTE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return t(key, params(match));
  }
  return text;
}

const STALE_REASON_KEYS: Record<string, string> = {
  "handover reverted": "documentLabels.staleReason.handoverReverted",
  "superseded by a newer version": "documentLabels.staleReason.superseded",
  "the reservation changed after this document was generated": "documentLabels.staleReason.reservationChanged",
};

export function staleReasonLabel(t: Translate, reason: string | null | undefined): string {
  const text = reason ?? "";
  const key = STALE_REASON_KEYS[text];
  return key ? t(key) : text;
}
