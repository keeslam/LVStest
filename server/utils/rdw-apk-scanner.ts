import { storage } from "../storage";
import { fetchVehicleInfoByLicensePlate, RDWNotFoundError } from "./rdw-api";

export interface ApkScanResult {
  scanned: number;
  changesFound: number;
  errors: number;
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
  const vehicles = await storage.getAllVehicles();
  const result: ApkScanResult = { scanned: 0, changesFound: 0, errors: 0 };

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

      const existingPending = await storage.getPendingApkDateChangeForVehicle(vehicle.id);

      if (existingPending) {
        if (existingPending.newApkDate !== rdwApkDate) {
          await storage.updateApkDateChange(existingPending.id, {
            newApkDate: rdwApkDate,
            previousApkDate: vehicle.apkDate,
          });
          result.changesFound++;
        }
        continue;
      }

      await storage.createApkDateChange({
        vehicleId: vehicle.id,
        previousApkDate: vehicle.apkDate,
        newApkDate: rdwApkDate,
        status: "pending",
      });
      result.changesFound++;
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
