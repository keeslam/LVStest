export type BlockMaintenanceStatus = "scheduled" | "in" | "out";

/**
 * The Status the maintenance dialogs show for the value stored on a block.
 *
 * A missing or unknown value is "scheduled" - the same reading the server has
 * (`isOpenBlockMaintenanceStatus` in `server/services/lifecycle.ts`: an older
 * block without the field counts as scheduled). The edit dialog used to fall
 * back to "in" for everything but in/out, so opening a block that was merely
 * planned showed "Binnen" and saving it moved the block - and, through the
 * server's status mapping, the car - into the workshop. The legacy `in_service`
 * some older code paths wrote onto blocks means "in".
 */
export function blockStatusForForm(raw: string | null | undefined): BlockMaintenanceStatus {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "in" || value === "in_service") return "in";
  if (value === "out") return "out";
  return "scheduled";
}
