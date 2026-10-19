/**
 * Punt 9 (Kees, 2026-10-19) — dashboard tile "Rijbewijzen": every ACTIVE driver
 * whose licence is expired or expires within 30 days, with or without a rental
 * (Kees, later on 19-10: "met en zonder reservering"). When the driver is the
 * main driver of a booked or running rental, the row names the earliest one so
 * the tile can open it; otherwise the tile opens the customer. Drivers without
 * a readable date are left out (the booking form and the pickup say so instead).
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
  customerId: number;
  customerName: string | null;
  licenseExpiry: string | null;
  expiryDay: string;
  /** The driver's earliest booked or running rental as main driver; null when there is none. */
  reservationId: number | null;
  licensePlate: string | null;
  startDate: string | null;
}

export interface LicenseTileDriver {
  driverId: number;
  driverName: string;
  customerId: number;
  customerName: string | null;
  licenseExpiry: string | null;
}

export interface LicenseTileRental {
  driverId: number;
  reservationId: number;
  licensePlate: string | null;
  startDate: string;
}

/** Pure part: filter, attach the earliest rental, soonest expiry first. */
export function pickLicenseTileRows(
  driverRows: LicenseTileDriver[],
  rentals: LicenseTileRental[],
  today: string,
  days = LICENSE_TILE_DAYS,
): LicenseTileRow[] {
  const earliest = new Map<number, LicenseTileRental>();
  for (const rental of rentals) {
    const seen = earliest.get(rental.driverId);
    if (!seen || rental.startDate < seen.startDate) earliest.set(rental.driverId, rental);
  }
  return driverRows
    .filter((d) => licenseExpiresWithin(d.licenseExpiry, today, days))
    .map((d) => {
      const rental = earliest.get(d.driverId);
      return {
        ...d,
        expiryDay: licenseExpiryDay(d.licenseExpiry)!,
        reservationId: rental?.reservationId ?? null,
        licensePlate: rental?.licensePlate ?? null,
        startDate: rental?.startDate ?? null,
      };
    })
    .sort((a, b) =>
      a.expiryDay === b.expiryDay ? a.driverName.localeCompare(b.driverName) : a.expiryDay < b.expiryDay ? -1 : 1);
}

export async function licenseTileRows(today: string): Promise<LicenseTileRow[]> {
  const driverRows = await db
    .select({
      driverId: drivers.id,
      displayName: drivers.displayName,
      firstName: drivers.firstName,
      lastName: drivers.lastName,
      licenseExpiry: drivers.licenseExpiry,
      customerId: drivers.customerId,
      customerName: customers.name,
    })
    .from(drivers)
    .leftJoin(customers, eq(customers.id, drivers.customerId))
    .where(and(eq(drivers.status, "active"), isNotNull(drivers.licenseExpiry)));

  const candidates: LicenseTileDriver[] = driverRows.map((r) => ({
    driverId: r.driverId,
    driverName: (r.displayName || `${r.firstName ?? ""} ${r.lastName ?? ""}`).trim() || `#${r.driverId}`,
    customerId: r.customerId,
    customerName: r.customerName ?? null,
    licenseExpiry: r.licenseExpiry,
  })).filter((d) => licenseExpiresWithin(d.licenseExpiry, today, LICENSE_TILE_DAYS));
  if (candidates.length === 0) return [];

  const rentals = await db
    .select({
      driverId: reservations.driverId,
      reservationId: reservations.id,
      licensePlate: vehicles.licensePlate,
      startDate: reservations.startDate,
    })
    .from(reservations)
    .leftJoin(vehicles, eq(vehicles.id, reservations.vehicleId))
    .where(and(
      inArray(reservations.driverId, candidates.map((d) => d.driverId)),
      isNull(reservations.deletedAt),
      ne(reservations.type, "maintenance_block"),
      inArray(reservations.status, LIVE_STATUSES),
    ));

  return pickLicenseTileRows(
    candidates,
    rentals.map((r) => ({ driverId: r.driverId!, reservationId: r.reservationId, licensePlate: r.licensePlate ?? null, startDate: r.startDate })),
    today,
  );
}
