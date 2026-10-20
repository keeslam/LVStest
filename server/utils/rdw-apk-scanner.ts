import { storage } from "../storage";
import { fetchVehicleInfoByLicensePlate, RDWNotFoundError } from "./rdw-api";

export interface ApkScanResult {
  scanned: number;
  changesFound: number;
  errors: number;
  /** The vehicles a pending change was created or updated for; the audit row names them. */
  changedVehicleIds: number[];
}

// Small delay between requests so a full-fleet scan doesn't hammer RDW's
// public API with a burst of near-simultaneous requests.
const REQUEST_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compares every vehicle's stored APK expiry date against the RDW open data
 * API and records a pending apk_date_changes row for each discrepancy found.
 * A vehicle that already has a pending row gets that row's newApkDate
 * updated in place instead of a second row being created, so an unresolved
 * discrepancy that keeps shifting (or is scanned again before being
 * confirmed/dismissed) never produces duplicates.
 */
export async function scanVehiclesForApkChanges(): Promise<ApkScanResult> {
  // Punt 7: a vehicle out of the fleet (sold, scrapped) is no longer checked at the RDW.
  const vehicles = (await storage.getAllVehicles()).filter((v) => !v.outOfFleetDate);
  // BUG-230: this ran one `getPendingApkDateChangeForVehicle` SELECT per
  // vehicle — 665 statements a night on top of 665 external calls. The pending
  // rows are a short list; read them once.
  const pendingByVehicle = new Map<number, Awaited<ReturnType<typeof storage.getPendingApkDateChangeForVehicle>>>();
  for (const pending of await storage.getPendingApkDateChanges()) {
    if (pending.vehicleId !== null && pending.vehicleId !== undefined && !pendingByVehicle.has(pending.vehicleId)) {
      pendingByVehicle.set(pending.vehicleId, pending as any);
    }
  }
  const result: ApkScanResult = { scanned: 0, changesFound: 0, errors: 0, changedVehicleIds: [] };

  for (const vehicle of vehicles) {
    if (!vehicle.licensePlate) {
      continue;
    }

    result.scanned++;

    try {
      const rdwInfo = await fetchVehicleInfoByLicensePlate(vehicle.licensePlate);
      const rdwApkDate = rdwInfo.apkDate;

      if (!rdwApkDate || rdwApkDate === vehicle.apkDate) {
        continue;
      }

      const existingPending = pendingByVehicle.get(vehicle.id);

      if (existingPending) {
        if (existingPending.newApkDate !== rdwApkDate) {
          await storage.updateApkDateChange(existingPending.id, {
            newApkDate: rdwApkDate,
            previousApkDate: vehicle.apkDate,
          });
          result.changesFound++; result.changedVehicleIds.push(vehicle.id);
        }
        continue;
      }

      await storage.createApkDateChange({
        vehicleId: vehicle.id,
        previousApkDate: vehicle.apkDate,
        newApkDate: rdwApkDate,
        status: "pending",
      });
      result.changesFound++; result.changedVehicleIds.push(vehicle.id);
    } catch (error) {
      // A vehicle with no RDW record (e.g. exported, scrapped) is not an
      // error worth counting - everything else (timeout, upstream failure) is.
      if (!(error instanceof RDWNotFoundError)) {
        result.errors++;
        console.error(`RDW APK scan: failed to check ${vehicle.licensePlate}:`, error instanceof Error ? error.message : error);
      }
    }

    await delay(REQUEST_DELAY_MS);
  }

  return result;
}
