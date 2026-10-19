/**
 * Punt 9 (Kees, 2026-10-19) — the licence of the main driver at pickup.
 *
 * "Vinkje bevestigen": with an expired licence the car only leaves once the
 * employee has ticked "Rijbewijs gecontroleerd"; the tick is written to the
 * reservation's history. An unknown date is only a note, never a refusal.
 * Only the main driver (`reservations.driver_id`) is checked; extra drivers are
 * the portal's and the contract names the main driver only.
 */
import { DRIVER_LICENSE_EXPIRED_CODE, licenseExpiryDay, licenseStateOn, type LicenseState } from "../../shared/driver-license";

export interface DriverLicenseInfo {
  driverId: number;
  driverName: string;
  /** The stored text, as the office typed it. */
  licenseExpiry: string | null;
  /** The same day as yyyy-MM-dd, or null when it cannot be read. */
  expiryDay: string | null;
  state: LicenseState;
}

type DriverLike = { id: number; displayName?: string | null; firstName?: string | null; lastName?: string | null; licenseExpiry?: string | null };

export function driverDisplayName(driver: DriverLike): string {
  return (driver.displayName || `${driver.firstName ?? ""} ${driver.lastName ?? ""}`).trim() || `#${driver.id}`;
}

/** The licence of `driver` on `day`, or null when there is no driver. */
export function driverLicenseInfo(driver: DriverLike | null | undefined, day: string): DriverLicenseInfo | null {
  if (!driver) return null;
  return {
    driverId: driver.id,
    driverName: driverDisplayName(driver),
    licenseExpiry: driver.licenseExpiry ?? null,
    expiryDay: licenseExpiryDay(driver.licenseExpiry),
    state: licenseStateOn(driver.licenseExpiry, day),
  };
}

/** 409: the caller resolves it by confirming that the licence was checked. */
export class DriverLicenseExpiredError extends Error {
  readonly status = 409;
  readonly code = DRIVER_LICENSE_EXPIRED_CODE;

  constructor(readonly info: DriverLicenseInfo) {
    super(`Het rijbewijs van ${info.driverName} is verlopen (${info.licenseExpiry}). Bevestig dat het rijbewijs is gecontroleerd.`);
    this.name = "DriverLicenseExpiredError";
  }

  toBody(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      driverId: this.info.driverId,
      driverName: this.info.driverName,
      licenseExpiry: this.info.licenseExpiry,
    };
  }
}

/**
 * Throws when the licence is expired and nobody ticked the box. Returns true
 * when the pickup goes ahead on a confirmed expired licence (so the route
 * writes the history row), false otherwise.
 */
export function assertDriverLicenseChecked(info: DriverLicenseInfo | null, confirmed: boolean): boolean {
  if (!info || info.state !== "expired") return false;
  if (!confirmed) throw new DriverLicenseExpiredError(info);
  return true;
}
