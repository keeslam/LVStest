/**
 * Punt 9 (Kees, 2026-10-19) — dashboard tile "Rijbewijzen": main drivers of a
 * booked or running rental whose licence is expired or expires within 30 days.
 * One row per driver, on their earliest such rental. Drivers without a
 * readable date are left out (the booking form and the pickup say so instead).
 */
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { customers, drivers, reservations, vehicles } from "../../shared/schema";
import { LICENSE_TILE_DAYS, licenseExpiresWithin, licenseExpiryDay } from "../../shared/driver-license";
import { LEGACY_RESERVATION_STATUS_ALIASES } from "../../shared/reservation-status";

/** booked and picked_up, plus the old spellings that still mean "booked" (pending, confirmed, ...). */
const LIVE_STATUSES = ["booked", "picked_up", ...Object.entries(LEGACY_RESERVATION_STATUS_ALIASES)
  .filter(([, to]) => to === "booked" || to === "picked_up").map(([from]) => from)];

export interface LicenseTileRow {
  driverId: number;
  driverName: string;
  customerName: string | null;
  licenseExpiry: string | null;
  expiryDay: string;
  reservationId: number;
  licensePlate: string | null;
  startDate: string;
  status: string;
}

type Candidate = Omit<LicenseTileRow, "expiryDay">;

/** Pure part: filter, one row per driver (earliest rental), soonest expiry first. */
export function pickLicenseTileRows(rows: Candidate[], today: string, days = LICENSE_TILE_DAYS): LicenseTileRow[] {
  const byDriver = new Map<number, LicenseTileRow>();
  for (const row of rows) {
    if (!licenseExpiresWithin(row.licenseExpiry, today, days)) continue;
    const expiryDay = licenseExpiryDay(row.licenseExpiry)!;
    const seen = byDriver.get(row.driverId);
    if (!seen || row.startDate < seen.startDate) byDriver.set(row.driverId, { ...row, expiryDay });
  }
  return Array.from(byDriver.values()).sort((a, b) =>
    a.expiryDay === b.expiryDay ? a.driverName.localeCompare(b.driverName) : a.expiryDay < b.expiryDay ? -1 : 1);
}

export async function licenseTileRows(today: string): Promise<LicenseTileRow[]> {
  const rows = await db
    .select({
      driverId: drivers.id,
      displayName: drivers.displayName,
      firstName: drivers.firstName,
      lastName: drivers.lastName,
      licenseExpiry: drivers.licenseExpiry,
      customerName: customers.name,
      reservationId: reservations.id,
      licensePlate: vehicles.licensePlate,
      startDate: reservations.startDate,
      status: reservations.status,
    })
    .from(reservations)
    .innerJoin(drivers, eq(drivers.id, reservations.driverId))
    .leftJoin(customers, eq(customers.id, reservations.customerId))
    .leftJoin(vehicles, eq(vehicles.id, reservations.vehicleId))
    .where(and(
      isNull(reservations.deletedAt),
      ne(reservations.type, "maintenance_block"),
      inArray(reservations.status, LIVE_STATUSES),
      isNotNull(drivers.licenseExpiry),
    ));
  return pickLicenseTileRows(rows.map((r) => ({
    driverId: r.driverId,
    driverName: (r.displayName || `${r.firstName ?? ""} ${r.lastName ?? ""}`).trim() || `#${r.driverId}`,
    customerName: r.customerName ?? null,
    licenseExpiry: r.licenseExpiry,
    reservationId: r.reservationId,
    licensePlate: r.licensePlate ?? null,
    startDate: r.startDate,
    status: r.status,
  })), today);
}
