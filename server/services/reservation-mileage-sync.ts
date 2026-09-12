/**
 * BUG-127, second half — "de kilometerstand van het voertuig loopt niet mee
 * met een correctie".
 *
 * The first half is closed: `PATCH /api/reservations/:id` now refuses a return
 * reading below the pickup reading. What it still did not do is carry a
 * *corrected* return reading through to the vehicle, so `vehicles.current_mileage`
 * and the rental it came from drifted apart — and the correction walked past
 * the authorization that every other mileage writer has to pass
 * (`authorizeMileageDecrease`, besluit-independent, BUG-041/BUG-065).
 *
 * The rule this module owns is narrow on purpose: the vehicle's odometer only
 * follows the **most recent** return on that vehicle. Editing a rental from
 * two years ago corrects that rental's own paperwork and nothing else — its
 * reading is not "where the car stands now".
 */
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations } from "../../shared/schema";

/**
 * Is `reservationId` the newest rental on this vehicle that carries a return
 * reading? Ordered the way a human would: by the day the car actually came
 * back, falling back to the agreed end date, and by id for same-day ties.
 */
export async function isLatestReturnForVehicle(
  vehicleId: number,
  reservationId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.vehicleId, vehicleId),
        isNull(reservations.deletedAt),
        ne(reservations.type, "maintenance_block"),
        isNotNull(reservations.returnMileage),
      ),
    )
    .orderBy(
      desc(sql`COALESCE(${reservations.actualReturnDate}, ${reservations.completionDate}, ${reservations.endDate})`),
      desc(reservations.id),
    )
    .limit(1);

  // Nothing on the vehicle carries a return reading yet, so the row being
  // edited becomes the newest one by definition.
  if (rows.length === 0) return true;
  return rows[0].id === reservationId;
}
