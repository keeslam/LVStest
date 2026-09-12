import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, portalUsers, type Reservation } from "../../shared/schema";
import { storage } from "../storage";
import { customerNotifications } from "./portal-customer-notifications";
import { sendMaintenanceMail } from "./portal-mail";

export type MaintenanceEvent = "maintenance_planned" | "maintenance_moved" | "maintenance_in" | "maintenance_out" | "maintenance_cancelled"
  /** besluiten B-13 (BUG-139): the rental moved to another car, so the block is not theirs any more. */
  | "maintenance_unlinked";

/** Customers may ask to move maintenance until this long before it starts. */
export const CHANGE_CUTOFF_MS = 48 * 60 * 60 * 1000;

const TITLE: Record<MaintenanceEvent, string> = {
  maintenance_planned: "Onderhoud gepland", maintenance_moved: "Onderhoud verplaatst",
  maintenance_in: "Auto in onderhoud", maintenance_out: "Onderhoud klaar", maintenance_cancelled: "Onderhoud vervalt",
  maintenance_unlinked: "Onderhoud hoort niet meer bij uw huur",
};

/** Block start as an instant: startDate + startTime, or 08:00 Amsterdam time when no time is set. */
export function maintenanceStartsAt(block: Pick<Reservation, "startDate" | "startTime">): Date {
  const time = block.startTime && /^\d{2}:\d{2}$/.test(block.startTime) ? block.startTime : "08:00";
  // Offset for Europe/Amsterdam on that date (+01:00 or +02:00).
  const probe = new Date(`${block.startDate}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false }).format(probe);
  const offset = Number(local) - 12; // 1 or 2
  return new Date(`${block.startDate}T${time}:00${offset === 2 ? "+02:00" : "+01:00"}`);
}

export function canCustomerChangeMaintenance(block: Pick<Reservation, "startDate" | "startTime" | "maintenanceStatus">, now = new Date()): boolean {
  if (block.maintenanceStatus !== "scheduled") return false;
  return maintenanceStartsAt(block).getTime() - now.getTime() >= CHANGE_CUTOFF_MS;
}

/** The customer (with a portal account) who has this vehicle on the road during the block. */
export async function findPortalCustomerForBlock(block: Pick<Reservation, "vehicleId" | "startDate" | "endDate">): Promise<{ customerId: number; rental: Reservation } | null> {
  if (!block.vehicleId) return null;
  const rows = await db.select().from(reservations).where(and(
    eq(reservations.vehicleId, block.vehicleId), eq(reservations.status, "picked_up"), eq(reservations.type, "standard"), isNull(reservations.deletedAt),
    or(isNull(reservations.endDate), sql`${reservations.endDate} >= ${block.startDate}`),
  )).limit(1);
  const rental = rows[0];
  if (!rental?.customerId) return null;
  const [account] = await db.select({ id: portalUsers.id }).from(portalUsers).where(and(eq(portalUsers.customerId, rental.customerId), eq(portalUsers.active, true))).limit(1);
  return account ? { customerId: rental.customerId, rental } : null;
}

const alive = (r: Reservation | null): r is Reservation => Boolean(r && !r.deletedAt && r.status !== "cancelled");

function classify(before: Reservation | null, after: Reservation | null): MaintenanceEvent | null {
  const b = alive(before) ? before : null, a = alive(after) ? after : null;
  if (!b && a) return a.maintenanceStatus === "in" ? "maintenance_in" : a.maintenanceStatus === "out" ? null : "maintenance_planned";
  if (b && !a) return b.maintenanceStatus === "out" ? null : "maintenance_cancelled";
  if (!b || !a) return null;
  if (b.maintenanceStatus !== a.maintenanceStatus) {
    if (a.maintenanceStatus === "in") return "maintenance_in";
    if (a.maintenanceStatus === "out") return "maintenance_out";
    if (a.maintenanceStatus === "scheduled") return "maintenance_planned";
  }
  if (a.maintenanceStatus === "scheduled" && (b.startDate !== a.startDate || (b.endDate ?? "") !== (a.endDate ?? ""))) return "maintenance_moved";
  return null;
}

/**
 * Called at every write point of a maintenance block (create, edit, status, delete)
 * with the row before and after. Tells the customer who has the car what changed.
 * Idempotent through the dedupe tag; never throws.
 */
export async function onMaintenanceBlockChanged(before: Reservation | null, after: Reservation | null): Promise<MaintenanceEvent | null> {
  try {
    const block = alive(after) ? after : before;
    if (!block || block.type !== "maintenance_block") return null;
    const event = classify(before, after);
    if (!event) return null;
    const target = await findPortalCustomerForBlock(block);
    if (!target) return null;
    const vehicle = block.vehicleId ? await storage.getVehicle(block.vehicleId) : undefined;
    if (!vehicle) return null;
    const car = `${vehicle.brand} ${vehicle.model}`;
    const date = block.startDate, endDate = block.endDate ?? null;
    const tag = event === "maintenance_moved" ? `maint:${block.id}:moved:${date}:${endDate ?? ""}` : event === "maintenance_planned" ? `maint:${block.id}:planned:${date}` : `maint:${block.id}:${event.replace("maintenance_", "")}`;
    const description = {
      maintenance_planned: `${car} (${vehicle.licensePlate}) staat ingepland voor onderhoud op ${date}${endDate && endDate !== date ? ` tot en met ${endDate}` : ""}. Breng de auto op de afgesproken dag naar Lam Groep.`,
      maintenance_moved: `Het onderhoud van ${car} (${vehicle.licensePlate}) is verplaatst naar ${date}${endDate && endDate !== date ? ` tot en met ${endDate}` : ""}.`,
      maintenance_in: `${car} (${vehicle.licensePlate}) is bij Lam Groep in onderhoud.`,
      maintenance_out: `${car} (${vehicle.licensePlate}) is klaar en kan worden opgehaald.`,
      maintenance_cancelled: `Het geplande onderhoud van ${car} (${vehicle.licensePlate}) op ${date} gaat niet door. Lam Groep neemt contact op voor een nieuwe datum.`,
      maintenance_unlinked: unlinkedDescription(car, vehicle.licensePlate, date),
    }[event];
    const created = await customerNotifications.notify({
      customerId: target.customerId, type: event, title: `${TITLE[event]}: ${vehicle.licensePlate}`, description,
      link: `/voertuigen?block=${block.id}`, dedupeTag: tag, dedupeDays: 365,
    });
    if (!created) return null;
    try { await sendMaintenanceMail(target.customerId, { plate: vehicle.licensePlate, car, event: TITLE[event], date, endDate }); } catch (e) { console.error("maintenance mail failed:", e); }
    return event;
  } catch (e) {
    console.error("onMaintenanceBlockChanged failed:", e);
    return null;
  }
}

function unlinkedDescription(car: string, plate: string, date: string): string {
  return `Het onderhoud van ${car} (${plate}) op ${date} hoort niet meer bij uw huur: u rijdt inmiddels in een andere auto. Het eventueel gereserveerde vervangend vervoer vervalt daarmee. Lam Groep neemt contact op als er voor uw huidige auto onderhoud nodig is.`;
}

/**
 * besluiten **B-13** (BUG-139) — "Huur verhuist naar een andere auto: het
 * onderhoudsblok blijft bij de fysieke auto. De gekoppelde vervanger en de
 * bijbehorende klantmelding vervallen; de klant krijgt bericht dat het
 * onderhoud niet meer bij zijn huur hoort."
 *
 * Called after the vehicle of a rental has actually changed. Everything here is
 * about the *old* car: the block stays exactly where it is, only its link to a
 * rental that has moved away is cut, so the portal stops offering the customer
 * a maintenance appointment for a vehicle they no longer drive.
 *
 * Never throws — a failure here may not undo a saved reservation.
 */
export async function onRentalVehicleChanged(
  before: Pick<Reservation, "id" | "type" | "vehicleId" | "customerId">,
  after: Pick<Reservation, "id" | "vehicleId">,
): Promise<{ blocks: number[]; replacements: number[]; notified: boolean }> {
  const empty = { blocks: [] as number[], replacements: [] as number[], notified: false };
  try {
    if (before.type === "maintenance_block") return empty;
    if (before.vehicleId == null || before.vehicleId === after.vehicleId) return empty;

    const blocks = await db.select().from(reservations).where(and(
      eq(reservations.affectedRentalId, before.id),
      eq(reservations.type, "maintenance_block"),
      isNull(reservations.deletedAt),
      sql`${reservations.status} <> 'cancelled'`,
    ));
    if (blocks.length === 0) return empty;

    const touchedBlocks: number[] = [];
    const cancelledReplacements: number[] = [];
    let notified = false;

    for (const block of blocks) {
      // The spare that was booked *for this block*. `maintenanceBlockId` is the
      // explicit link FIX-V added (BUG-118); the rental link is the fallback for
      // rows written before that column existed.
      const replacements = await db.select().from(reservations).where(and(
        eq(reservations.type, "replacement"),
        isNull(reservations.deletedAt),
        sql`${reservations.status} NOT IN ('cancelled','completed','returned')`,
        or(
          eq(reservations.maintenanceBlockId, block.id),
          and(
            isNull(reservations.maintenanceBlockId),
            eq(reservations.replacementForReservationId, before.id),
          ),
        ),
      ));

      for (const replacement of replacements) {
        // BUG-004's rule: a spare that is really at the customer is a handover
        // on record, not something an administrative change may sweep away.
        if (replacement.status === "picked_up") continue;
        await db.update(reservations).set({
          status: "cancelled",
          notes: `${replacement.notes ?? ""}\n[B-13] Vervallen: huur #${before.id} staat sinds deze wijziging op een andere auto, het onderhoud blijft bij de oorspronkelijke auto.`.trim(),
          updatedAt: new Date(),
        }).where(eq(reservations.id, replacement.id));
        cancelledReplacements.push(replacement.id);
      }

      // The block itself stays on the physical car; only the link to a rental
      // that is no longer on that car is cut.
      await db.update(reservations)
        .set({ affectedRentalId: null, updatedAt: new Date() })
        .where(eq(reservations.id, block.id));
      touchedBlocks.push(block.id);

      if (before.customerId != null) {
        // The "Onderhoud gepland" the customer is holding is no longer true.
        await customerNotifications.removeByDedupePrefix(before.customerId, `maint:${block.id}:`);

        const [account] = await db.select({ id: portalUsers.id }).from(portalUsers)
          .where(and(eq(portalUsers.customerId, before.customerId), eq(portalUsers.active, true))).limit(1);
        if (account) {
          const vehicle = block.vehicleId ? await storage.getVehicle(block.vehicleId) : undefined;
          if (vehicle) {
            const car = `${vehicle.brand} ${vehicle.model}`;
            const created = await customerNotifications.notify({
              customerId: before.customerId,
              type: "maintenance_unlinked",
              title: `${TITLE.maintenance_unlinked}: ${vehicle.licensePlate}`,
              description: unlinkedDescription(car, vehicle.licensePlate, block.startDate),
              link: `/reserveringen/${before.id}`,
              dedupeTag: `maint:${block.id}:unlinked:${before.id}`,
              dedupeDays: 365,
            });
            if (created) {
              notified = true;
              try {
                await sendMaintenanceMail(before.customerId, {
                  plate: vehicle.licensePlate, car, event: TITLE.maintenance_unlinked,
                  date: block.startDate, endDate: block.endDate ?? null,
                });
              } catch (e) { console.error("maintenance unlinked mail failed:", e); }
            }
          }
        }
      }
    }

    return { blocks: touchedBlocks, replacements: cancelledReplacements, notified };
  } catch (e) {
    console.error("onRentalVehicleChanged failed:", e);
    return empty;
  }
}

/** A replacement got a real vehicle: tell the customer of the original rental. Returns false when nothing was sent. */
export async function onReplacementAssigned(replacement: Reservation): Promise<boolean> {
  try {
    if (replacement.type !== "replacement" || !replacement.vehicleId || replacement.placeholderSpare || !replacement.replacementForReservationId) return false;
    const rental = await storage.getReservation(replacement.replacementForReservationId);
    if (!rental?.customerId) return false;
    const [account] = await db.select({ id: portalUsers.id }).from(portalUsers).where(and(eq(portalUsers.customerId, rental.customerId), eq(portalUsers.active, true))).limit(1);
    if (!account) return false;
    const spare = await storage.getVehicle(replacement.vehicleId);
    if (!spare) return false;
    const car = `${spare.brand} ${spare.model}`;
    const created = await customerNotifications.notify({
      customerId: rental.customerId, type: "replacement_ready", title: `Vervangend vervoer: ${spare.licensePlate}`,
      description: `${car} (${spare.licensePlate}) staat voor u klaar als vervangend vervoer vanaf ${replacement.startDate}${replacement.endDate ? ` tot en met ${replacement.endDate}` : ""}. Neem uw rijbewijs mee bij het ophalen.`,
      link: `/reserveringen/${replacement.id}`, dedupeTag: `spare:${replacement.id}:${replacement.vehicleId}`, dedupeDays: 365,
    });
    if (!created) return false;
    try { await sendMaintenanceMail(rental.customerId, { plate: spare.licensePlate, car, event: "Vervangend vervoer staat klaar", date: replacement.startDate, endDate: replacement.endDate ?? null }); } catch (e) { console.error("replacement mail failed:", e); }
    return true;
  } catch (e) {
    console.error("onReplacementAssigned failed:", e);
    return false;
  }
}
