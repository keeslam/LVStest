/**
 * OPT-011 — "Opmerkingenbevestiging per opmerking in plaats van per ophaling".
 *
 * Today every pickup of every vehicle that has *any* text in `remarks` shows
 * "BELANGRIJK: Bekijk deze opmerkingen voordat het voertuig vertrekt" with an
 * "Ik bevestig & ga door" button — 50x a day, for notes that have been there
 * for months. A warning that always fires is not a warning; the employee clicks
 * it away and misses the one that mattered.
 *
 * The rule, from the report: ask again only when the remark text has changed
 * since the last confirmed pickup of that vehicle. Deliberately scoped, never
 * switched off — an unchanged but important remark is still shown on screen,
 * it just no longer demands a click.
 *
 * Shared so the dialog and the pickup route agree on what "changed" means.
 */
export interface RemarkConfirmationState {
  remarks?: string | null;
  remarksConfirmedText?: string | null;
}

/** Whitespace-insensitive: re-indenting a note is not a new warning. */
export function normalizeRemarks(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function hasRemarks(vehicle: RemarkConfirmationState | null | undefined): boolean {
  return normalizeRemarks(vehicle?.remarks) !== "";
}

/**
 * True when the employee must confirm before this vehicle may leave: there is
 * a remark, and it is not the one that was confirmed at the last pickup.
 */
export function needsRemarkConfirmation(vehicle: RemarkConfirmationState | null | undefined): boolean {
  const current = normalizeRemarks(vehicle?.remarks);
  if (current === "") return false;
  return current !== normalizeRemarks(vehicle?.remarksConfirmedText);
}
