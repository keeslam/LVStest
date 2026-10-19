import { AuditLogger } from "../utils/security/auditLogger";
import { moveOrphanBlocksToBin } from "../../scripts/orphan-blocks-to-bin";
import { closeStaleReservations } from "../../scripts/close-returned-reservations";
import { normalizeLicensePlates } from "../../scripts/normalize-license-plates";

/**
 * One-off data cleanups, run at start-up only when their flag says `apply` (Kees, 2026-10-19), the
 * same way TIMESTAMPTZ_MIGRATION=apply runs the B-22 conversion in startup-migration.js. They were
 * dry-run on lvs_prodtest and run for real on a scratch copy first; the report is
 * docs/audit/proefdraai-opschonen-2026-10-19.md. Off by default. Make a backup in Coolify first.
 *
 * The order is fixed, because it matters: most "legacy status" rows were orphan blocks, so the
 * orphans go to the bin before the stale reservations are closed.
 *
 *   1. CLEANUP_ORPHAN_BLOCKS=apply       BUG-143: maintenance blocks on a vehicle that no longer exists
 *                                        go to the Onderhoud bin (they can be restored from there).
 *   2. CLEANUP_STALE_RESERVATIONS=apply  B-02/B-21: never-collected bookings past their end -> cancelled,
 *                                        a legacy status past its end -> completed. `picked_up` is
 *                                        never touched (worklist "Nog buiten"); end dates never change.
 *   3. CLEANUP_NORMALIZE_PLATES=apply    B-10: plates stored normalised plus the unique index; stops by
 *                                        itself at the first collision and changes nothing then.
 *
 * Every step is idempotent: a second start with the flag still set finds nothing left to do. Each
 * writes one `system.cleanup-*` row to the activity log. A failing step is logged and the server
 * starts anyway.
 */
export const CLEANUP_FLAGS = {
  orphans: "CLEANUP_ORPHAN_BLOCKS",
  stale: "CLEANUP_STALE_RESERVATIONS",
  plates: "CLEANUP_NORMALIZE_PLATES",
} as const;

export interface OneOffCleanupSummary {
  ran: Array<keyof typeof CLEANUP_FLAGS>;
  failed: Array<keyof typeof CLEANUP_FLAGS>;
}

export async function runOneOffCleanups(env: NodeJS.ProcessEnv = process.env): Promise<OneOffCleanupSummary> {
  const on = (key: keyof typeof CLEANUP_FLAGS) => env[CLEANUP_FLAGS[key]] === "apply";
  const summary: OneOffCleanupSummary = { ran: [], failed: [] };
  if (!on("orphans") && !on("stale") && !on("plates")) return summary;

  if (on("orphans")) {
    try {
      const r = await moveOrphanBlocksToBin({ dryRun: false });
      console.log(`🧹 BUG-143: ${r.moved} van ${r.found} losse onderhoudsblok(ken) naar de prullenbak van Onderhoud${r.failed.length ? `, ${r.failed.length} mislukt` : ""}.`);
      await AuditLogger.system("system.cleanup-orphan-blocks", { found: r.found, moved: r.moved, failed: r.failed.slice(0, 50) }, r.failed.length ? "failure" : "success");
      (r.failed.length ? summary.failed : summary.ran).push("orphans");
    } catch (e) {
      console.error("BUG-143 cleanup failed:", e);
      await AuditLogger.system("system.cleanup-orphan-blocks", { error: e instanceof Error ? e.message : String(e) }, "failure").catch(() => {});
      summary.failed.push("orphans");
    }
  }

  if (on("stale")) {
    try {
      const r = await closeStaleReservations({ dryRun: false });
      console.log(`🧹 B-21 (peildag ${r.today}): ${r.neverPickedUp.closed} nooit opgehaald geannuleerd, ${r.legacyStatus.closed + r.returned.closed} afgerond; ${r.stillOutWorklist} blijven op "Nog buiten".`);
      await AuditLogger.system("system.cleanup-stale-reservations", {
        today: r.today, returnedClosed: r.returned.closed, neverPickedUpCancelled: r.neverPickedUp.closed,
        legacyCompleted: r.legacyStatus.closed, stillOutWorklist: r.stillOutWorklist,
      });
      summary.ran.push("stale");
    } catch (e) {
      console.error("B-21 cleanup failed:", e);
      await AuditLogger.system("system.cleanup-stale-reservations", { error: e instanceof Error ? e.message : String(e) }, "failure").catch(() => {});
      summary.failed.push("stale");
    }
  }

  if (on("plates")) {
    try {
      const r = await normalizeLicensePlates({ dryRun: false });
      if (r.collisions.length > 0) {
        console.warn(`🧹 B-10: ${r.collisions.length} botsing(en) gevonden; niets gewijzigd. Zie het activiteitenlog.`);
      } else {
        console.log(`🧹 B-10: ${r.normalised} kenteken(s) gelijkgetrokken; unieke index staat.`);
      }
      await AuditLogger.system("system.cleanup-normalize-plates", {
        candidates: r.candidates, normalised: r.normalised, indexCreated: r.indexCreated,
        collisions: r.collisions.slice(0, 50).map((c) => ({ normalised: c.normalised, vehicleIds: c.vehicles.map((v) => v.id) })),
      }, r.collisions.length > 0 ? "failure" : "success");
      (r.collisions.length > 0 ? summary.failed : summary.ran).push("plates");
    } catch (e) {
      console.error("B-10 cleanup failed:", e);
      await AuditLogger.system("system.cleanup-normalize-plates", { error: e instanceof Error ? e.message : String(e) }, "failure").catch(() => {});
      summary.failed.push("plates");
    }
  }

  console.log("🧹 Eenmalige opschoning klaar. Haal de CLEANUP_*-vlaggen weer weg in Coolify (nog een keer draaien doet niets, maar zo blijft het duidelijk).");
  return summary;
}
