import { eq } from "drizzle-orm";
import { db } from "../db";
import { vehicles } from "../../shared/schema";

/**
 * B-63 — every odometer reading a customer reports in the portal is kept on the
 * vehicle as "Door klant ingevulde km-stand", whether or not staff take it over.
 * Written straight to the row: it is not an edit of the vehicle by staff and must
 * not trip the mileage-decrease bookkeeping of updateVehicle.
 */
export async function recordCustomerReportedMileage(vehicleId: number, km: number, at: Date = new Date()): Promise<void> {
  await db.update(vehicles)
    .set({ customerReportedMileage: km, customerReportedMileageAt: at })
    .where(eq(vehicles.id, vehicleId));
}

export type MileageTakeOver =
  | { ok: true; previous: number | null; mileage: number }
  | { ok: false; reason: "not_higher"; current: number; reported: number };

/** Staff take a reported reading over as current mileage only when it is higher. */
export function decideMileageTakeOver(current: number | null | undefined, reported: number): MileageTakeOver {
  const now = current ?? null;
  if (now !== null && reported <= now) return { ok: false, reason: "not_higher", current: now, reported };
  return { ok: true, previous: now, mileage: reported };
}
