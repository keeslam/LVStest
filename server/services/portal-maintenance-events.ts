import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, portalUsers, type Reservation } from "../../shared/schema";
import { storage } from "../storage";
import { customerNotifications } from "./portal-customer-notifications";
import { sendMaintenanceMail } from "./portal-mail";

export type MaintenanceEvent = "maintenance_planned" | "maintenance_moved" | "maintenance_in" | "maintenance_out" | "maintenance_cancelled";

/** Customers may ask to move maintenance until this long before it starts. */
export const CHANGE_CUTOFF_MS = 48 * 60 * 60 * 1000;

const TITLE: Record<MaintenanceEvent, string> = {
  maintenance_planned: "Onderhoud gepland", maintenance_moved: "Onderhoud verplaatst",
  maintenance_in: "Auto in onderhoud", maintenance_out: "Onderhoud klaar", maintenance_cancelled: "Onderhoud vervalt",
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
    sql`${reservations.startDate} <= ${block.endDate ?? block.startDate}`,
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
