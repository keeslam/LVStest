/**
 * Online afspraken: the garage planner's "Afspraak Aanvraag" mails, read by the invoice inbox poller, become a
 * maintenance entry "te bevestigen" for the customer's rental. Staff confirm, cancel, link or dismiss them in the
 * maintenance calendar. Design: docs/superpowers/specs/2026-10-13-online-afspraken-design.md (akkoord Kees 2026-10-29).
 */
import { simpleParser } from "mailparser";
import { createHash } from "crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { onlineAppointments, reservations, vehicles, customers, portalUsers, type OnlineAppointment, type Reservation } from "../../shared/schema";
import {
  APPOINTMENT_DUPLICATE_WINDOW_HOURS, APPOINTMENT_REVIEW_LABELS_NL, ONLINE_APPOINTMENTS_LINK, OPEN_APPOINTMENT_STATUSES,
  appointmentCategory, normalizePlateText, parseAppointmentMail, replacementWanted,
  type AppointmentReviewReason, type OnlineAppointmentDto, type ParsedAppointmentMail,
} from "../../shared/online-appointments";
import { isAllowedSender, normalizeSender, senderAuthVerdict, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import { customerNotifications } from "./portal-customer-notifications";
import { customerDisplayName } from "./customer-display-name";
import { realtimeEvents, broadcastDataUpdate } from "../realtime-events";
import { isWeekend } from "./booking-period";
import { isoToday, normalizeReservationStatus } from "./lifecycle";
import { AuditLogger } from "../utils/security/auditLogger";

/** Written in the block's notes; confirming swaps "te bevestigen" for "bevestigd". */
const SOURCE = "Online agenda";
const TO_CONFIRM = `${SOURCE}: te bevestigen`;
const CONFIRMED = `${SOURCE}: bevestigd`;

const workText = (items: string[]) => (items.length ? items.join(", ") : "Online afspraak");
const dutchDate = (iso: string) => iso.split("-").reverse().join("-");

/** The vehicle with this plate (dashes, spaces and case ignored), or undefined. */
async function vehicleByPlate(plate: string) {
  const [row] = await db.select().from(vehicles)
    .where(sql`upper(regexp_replace(${vehicles.licensePlate}, '[^A-Za-z0-9]', '', 'g')) = ${plate}`).limit(1);
  return row;
}

/** The customer's rental of this car that is on the road or booked and covers the day; the one on the road first. */
async function rentalFor(vehicleId: number, date: string): Promise<Reservation | undefined> {
  const rows = await db.select().from(reservations).where(and(
    eq(reservations.vehicleId, vehicleId), eq(reservations.type, "standard"), isNull(reservations.deletedAt),
    inArray(reservations.status, ["booked", "picked_up"]),
    sql`${reservations.customerId} IS NOT NULL`,
    sql`${reservations.startDate} <= ${date}`, or(isNull(reservations.endDate), sql`${reservations.endDate} >= ${date}`),
  ));
  const onRoad = (r: Reservation) => Number(normalizeReservationStatus(r.status) === "picked_up");
  return rows.sort((a, b) => onRoad(b) - onRoad(a))[0];
}

/**
 * Office bell plus a refresh in every open staff session. Only the id goes over the socket: the text repeats words
 * from a mail. Never throws.
 */
async function notifyStaff(title: string, description: string, priority: "normal" | "high" = "normal"): Promise<void> {
  try {
    const n = await storage.createCustomNotification({
      title, description, date: isoToday(), type: "online_appointment", link: ONLINE_APPOINTMENTS_LINK, icon: "CalendarClock", priority, isRead: false,
    });
    broadcastDataUpdate("online-appointments", "created", { id: n.id });
  } catch (error) {
    console.error("online appointment notification failed:", error);
  }
}

/** The customer hears about it in the portal, and only when the customer has an active portal account. No e-mail. */
async function notifyCustomer(row: Pick<OnlineAppointment, "id">, customerId: number, rentalId: number, date: string, time: string, work: string[]): Promise<void> {
  try {
    const [account] = await db.select({ id: portalUsers.id }).from(portalUsers)
      .where(and(eq(portalUsers.customerId, customerId), eq(portalUsers.active, true))).limit(1);
    if (!account) return;
    await customerNotifications.notify({
      customerId, type: "online_appointment",
      title: "Afspraak aangevraagd",
      description: `Afspraak aangevraagd op ${dutchDate(date)}${time ? ` om ${time}` : ""} voor ${workText(work)}. De garage bevestigt de afspraak.`,
      params: { date, time, work: workText(work) },
      link: `/reserveringen/${rentalId}`,
      dedupeTag: `online-appointment:${row.id}`,
    });
  } catch (error) {
    console.error("online appointment customer notification failed:", error);
  }
}

/** A placeholder "TBD vervangend vervoer" for the rental on the day; an open one already there is left as it is. */
async function placeholderFor(rental: Reservation, date: string, blockId: number, by: string): Promise<void> {
  if (!rental.customerId) return;
  try {
    const [existing] = await db.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.type, "replacement"), eq(reservations.placeholderSpare, true), isNull(reservations.vehicleId),
      isNull(reservations.deletedAt), eq(reservations.replacementForReservationId, rental.id),
    )).limit(1);
    await storage.updateReservation(rental.id, { spareAssignmentDecision: "spare_assigned", updatedBy: by } as any);
    if (existing) return;
    await storage.createPlaceholderReservation(rental.id, rental.customerId, date, date, { maintenanceBlockId: blockId });
  } catch (error) {
    console.error(`online appointment: placeholder for rental #${rental.id} failed:`, error);
  }
}

/** Puts the appointment in the maintenance planner for this rental: the block, the placeholder, the customer's bell. */
async function planFor(row: OnlineAppointment, rental: Reservation, by: string): Promise<number> {
  const date = row.appointmentDate!;
  const time = row.appointmentTime ?? "";
  const work = row.workItems ?? [];
  const category = appointmentCategory(work);
  const maintenanceType = category === "scheduled_maintenance" ? "apk_inspection" : "other";
  const created = await storage.createMaintenanceBlock(rental.vehicleId!, date, date, rental.customerId);
  // Same notes shape as staff and the portal use ("{maintenanceType}: {description}\n{notes}").
  const block = (await storage.updateReservation(created.id, {
    maintenanceCategory: category, maintenanceType, maintenanceDuration: 1, affectedRentalId: rental.id, startTime: time || null,
    notes: `${maintenanceType}: ${workText(work)}\n${TO_CONFIRM}${time ? ` (${time})` : ""}`,
    createdBy: by, updatedBy: by,
  } as any))!;
  if (replacementWanted(row.replacement)) await placeholderFor(rental, date, block.id, by);
  await storage.syncVehicleAvailabilityWithReservations();
  realtimeEvents.reservations.created(block);
  if (rental.customerId) await notifyCustomer(row, rental.customerId, rental.id, date, time, work);
  return block.id;
}

export type ImportOutcome = "created" | "review" | "duplicate";

/**
 * The poller's entry: checks that the mail really comes from a planner address (the same Authentication-Results rule as
 * for invoices), then reads it. "untrusted" means: not ours, leave it to the invoice flow.
 */
export async function tryImportAppointmentMail(input: {
  raw: Buffer; messageId: string | null; subject: string | null; from: string;
  config: Pick<InvoiceInboxConfig, "appointmentSenders" | "authservId">; by?: string;
}): Promise<ImportOutcome | "untrusted"> {
  if (!isAllowedSender(input.from, input.config.appointmentSenders ?? [])) return "untrusted";
  const mail = await simpleParser(input.raw);
  // The From header must say the same as the envelope: the verdict below is about the header's domain.
  const headerFrom = normalizeSender(mail.from?.value?.[0]?.address ?? "");
  if (!headerFrom || !isAllowedSender(headerFrom, input.config.appointmentSenders ?? [])) return "untrusted";
  const lines = (mail.headerLines ?? []).filter((h) => h.key === "authentication-results").map((h) => h.line);
  const verdict = senderAuthVerdict(lines, headerFrom, input.config.authservId);
  const trusted = input.config.authservId.trim() ? verdict === "pass" : verdict !== "fail";
  if (!trusted) return "untrusted";
  const outcome = await importAppointmentMail({ raw: input.raw, messageId: input.messageId, subject: input.subject, from: headerFrom, by: input.by, parsedMail: mail });
  void AuditLogger.system("system.online-appointment-import", { outcome, messageId: input.messageId }, "success");
  return outcome;
}

/**
 * One planner mail becomes one row. Linked to a rental of a customer it also becomes a maintenance entry "te bevestigen";
 * anything that cannot be linked with certainty stays a row to check, and nothing is planned from a guess.
 */
export async function importAppointmentMail(input: {
  raw: Buffer; messageId: string | null; subject: string | null; from?: string; by?: string;
  parsedMail?: Awaited<ReturnType<typeof simpleParser>>;
}): Promise<ImportOutcome> {
  const by = input.by ?? "scheduler";
  const mail = input.parsedMail ?? await simpleParser(input.raw);
  const messageId = (input.messageId ?? mail.messageId ?? `raw:${createHash("sha256").update(input.raw).digest("hex")}`).slice(0, 500);
  const [seen] = await db.select({ id: onlineAppointments.id }).from(onlineAppointments).where(eq(onlineAppointments.messageId, messageId)).limit(1);
  if (seen) return "duplicate";

  const parsed: ParsedAppointmentMail | null = parseAppointmentMail(mail.text ?? "");
  // A NUL or other control character cannot be stored in Postgres text and is never meant.
  const subject = (input.subject ?? mail.subject ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
  const base = { messageId, subject, fromAddress: input.from ?? null, status: "review" as const };
  const toReview = async (reason: AppointmentReviewReason, extra: Partial<typeof onlineAppointments.$inferInsert> = {}): Promise<ImportOutcome> => {
    await db.insert(onlineAppointments).values({ ...base, reviewReason: reason, ...extra });
    await notifyStaff(
      "Online afspraak om te controleren",
      parsed ? `${parsed.plate} op ${dutchDate(parsed.date)}: ${APPOINTMENT_REVIEW_LABELS_NL[reason]}.` : "Een afspraakmail kon niet worden uitgelezen.",
      "high",
    );
    return "review";
  };
  if (!parsed) return toReview("unreadable");

  const fields = {
    appointmentDate: parsed.date, appointmentTime: parsed.time, plate: parsed.plate, brand: parsed.brand, model: parsed.model,
    mileage: parsed.mileage, workItems: parsed.workItems, replacement: parsed.replacement, customerName: parsed.customerName,
  };
  // The planner sends no appointment number: the same car, day and time within a day is the same appointment.
  const since = new Date(Date.now() - APPOINTMENT_DUPLICATE_WINDOW_HOURS * 3600_000);
  const [twin] = await db.select({ id: onlineAppointments.id }).from(onlineAppointments).where(and(
    eq(onlineAppointments.plate, parsed.plate), eq(onlineAppointments.appointmentDate, parsed.date), eq(onlineAppointments.appointmentTime, parsed.time),
    gte(onlineAppointments.receivedAt, since), inArray(onlineAppointments.status, ["pending", "confirmed", "review"]),
  )).limit(1);
  if (twin) return "duplicate";

  const vehicle = await vehicleByPlate(parsed.plate);
  if (!vehicle) return toReview("plate_unknown", fields);
  const rental = await rentalFor(vehicle.id, parsed.date);
  if (!rental) return toReview("no_rental", { ...fields, vehicleId: vehicle.id });
  const link = { vehicleId: vehicle.id, customerId: rental.customerId, rentalId: rental.id };
  if (isWeekend(parsed.date)) return toReview("weekend", { ...fields, ...link });
  if (parsed.date < isoToday()) return toReview("in_past", { ...fields, ...link });

  const [row] = await db.insert(onlineAppointments).values({ ...base, ...fields, ...link, status: "pending", reviewReason: null }).returning();
  const blockId = await planFor(row, rental, by);
  await db.update(onlineAppointments).set({ blockId }).where(eq(onlineAppointments.id, row.id));
  const [customer] = rental.customerId
    ? await db.select({ label: customerDisplayName() }).from(customers).where(eq(customers.id, rental.customerId))
    : [];
  await notifyStaff(
    "Online afspraak binnengekomen",
    `${vehicle.licensePlate} op ${dutchDate(parsed.date)} om ${parsed.time}: ${workText(parsed.workItems)} (${customer?.label || "klant"}). Bevestig hem in de onderhoudskalender.`,
  );
  return "created";
}

const toDto = (row: OnlineAppointment, customerLabel: string | null): OnlineAppointmentDto => ({
  id: row.id, receivedAt: row.receivedAt.toISOString(), status: row.status as OnlineAppointmentDto["status"],
  reviewReason: (row.reviewReason as AppointmentReviewReason | null) ?? null,
  date: row.appointmentDate ?? "", time: row.appointmentTime ?? "", plate: row.plate ?? "", brand: row.brand ?? "", model: row.model ?? "",
  mileage: row.mileage ?? null, workItems: row.workItems ?? [], replacement: row.replacement ?? "", customerName: row.customerName ?? "",
  customerId: row.customerId ?? null, customerLabel, vehicleId: row.vehicleId ?? null, rentalId: row.rentalId ?? null, blockId: row.blockId ?? null,
  handledBy: row.handledBy ?? null, handledAt: row.handledAt?.toISOString() ?? null,
});

const withCustomer = () => db.select({ row: onlineAppointments, label: customerDisplayName() })
  .from(onlineAppointments).leftJoin(customers, eq(customers.id, onlineAppointments.customerId));

/** What is waiting for staff: appointments to confirm and mails to check, earliest day first. */
export async function listOpenAppointments(): Promise<OnlineAppointmentDto[]> {
  const rows = await withCustomer()
    .where(inArray(onlineAppointments.status, OPEN_APPOINTMENT_STATUSES))
    .orderBy(asc(onlineAppointments.appointmentDate), asc(onlineAppointments.appointmentTime), desc(onlineAppointments.id))
    .limit(500);
  return rows.map((r) => toDto(r.row, r.label ?? null));
}

export async function countOpenAppointments(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(onlineAppointments).where(inArray(onlineAppointments.status, OPEN_APPOINTMENT_STATUSES));
  return r?.n ?? 0;
}

/** Every appointment mail, newest first, for the tab "Online afspraken" in the inbox log. */
export async function listAppointmentLog(options: { q?: string; limit?: number; offset?: number } = {}): Promise<{ items: OnlineAppointmentDto[]; total: number }> {
  const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
  const offset = Math.max(0, options.offset ?? 0);
  const q = (options.q ?? "").trim().slice(0, 100);
  let where: SQL | undefined;
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const plate = normalizePlateText(q);
    where = or(
      ilike(onlineAppointments.customerName, like), ilike(onlineAppointments.subject, like),
      sql`${onlineAppointments.workItems}::text ILIKE ${like}`,
      ...(plate ? [ilike(onlineAppointments.plate, `%${plate}%`)] : []),
    );
  }
  const [rows, [{ n }]] = await Promise.all([
    withCustomer().where(where).orderBy(desc(onlineAppointments.receivedAt), desc(onlineAppointments.id)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(onlineAppointments).where(where),
  ]);
  return { items: rows.map((r) => toDto(r.row, r.label ?? null)), total: n };
}

async function getRow(id: number): Promise<OnlineAppointment | undefined> {
  const [row] = await db.select().from(onlineAppointments).where(eq(onlineAppointments.id, id));
  return row;
}

async function getDto(id: number): Promise<OnlineAppointmentDto> {
  const [r] = await withCustomer().where(eq(onlineAppointments.id, id));
  return toDto(r.row, r.label ?? null);
}

export class AppointmentActionError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) { super(message); }
}

const stamp = (by: string) => ({ handledBy: by, handledAt: new Date() });
const ALREADY_HANDLED = () => new AppointmentActionError("Deze afspraak is al afgehandeld", 409, "ALREADY_HANDLED");

/** Staff confirmed it in the garage's planner: the entry is no longer "te bevestigen". */
export async function confirmAppointment(id: number, by: string): Promise<OnlineAppointmentDto> {
  const row = await getRow(id);
  if (!row) throw new AppointmentActionError("Afspraak niet gevonden", 404, "NOT_FOUND");
  // Claim first, so two clicks at once cannot both go through.
  const [claimed] = await db.update(onlineAppointments).set({ status: "confirmed", ...stamp(by) })
    .where(and(eq(onlineAppointments.id, id), eq(onlineAppointments.status, "pending"))).returning({ id: onlineAppointments.id });
  if (!claimed) throw ALREADY_HANDLED();
  if (row.blockId) {
    const block = await storage.getReservation(row.blockId);
    if (block) {
      const updated = await storage.updateReservation(block.id, { notes: (block.notes ?? "").replace(TO_CONFIRM, CONFIRMED), updatedBy: by } as any);
      if (updated) realtimeEvents.reservations.updated(updated);
    }
  }
  return getDto(id);
}

/** Cancelled by staff (the planner sends no mail for that): the block and its placeholder go, the car is free again. */
export async function cancelAppointment(id: number, by: string): Promise<OnlineAppointmentDto> {
  const row = await getRow(id);
  if (!row) throw new AppointmentActionError("Afspraak niet gevonden", 404, "NOT_FOUND");
  const [claimed] = await db.update(onlineAppointments).set({ status: "cancelled", ...stamp(by) })
    .where(and(eq(onlineAppointments.id, id), inArray(onlineAppointments.status, ["pending", "confirmed"]))).returning({ id: onlineAppointments.id });
  if (!claimed) throw ALREADY_HANDLED();
  if (row.blockId) {
    // Only the placeholder that still waits for a car; one with a car assigned is the office's to undo.
    await db.update(reservations).set({ status: "cancelled", updatedBy: by, updatedAt: new Date() } as any)
      .where(and(eq(reservations.maintenanceBlockId, row.blockId), eq(reservations.type, "replacement"), eq(reservations.placeholderSpare, true),
        isNull(reservations.vehicleId), isNull(reservations.deletedAt), eq(reservations.status, "booked")));
    const block = await storage.getReservation(row.blockId);
    if (block && !block.deletedAt && normalizeReservationStatus(block.status) === "booked") {
      const updated = await storage.updateReservation(row.blockId, { status: "cancelled", updatedBy: by } as any);
      await storage.syncVehicleAvailabilityWithReservations();
      if (updated) realtimeEvents.reservations.updated(updated);
    }
  }
  return getDto(id);
}

/** A mail that could not be linked, linked by hand to a rental: from here it is planned like any other. */
export async function linkAppointment(id: number, rentalId: number, by: string): Promise<OnlineAppointmentDto> {
  const row = await getRow(id);
  if (!row) throw new AppointmentActionError("Afspraak niet gevonden", 404, "NOT_FOUND");
  if (row.status !== "review") throw ALREADY_HANDLED();
  const date = row.appointmentDate;
  if (!date) throw new AppointmentActionError("Deze mail heeft geen datum en kan niet worden ingepland", 400, "NO_DATE");
  const rental = await storage.getReservation(rentalId);
  if (!rental || rental.deletedAt || rental.type !== "standard" || !rental.vehicleId || !rental.customerId
    || !["booked", "picked_up"].includes(normalizeReservationStatus(rental.status) ?? "")) {
    throw new AppointmentActionError("Kies een lopende of geplande huur van een klant", 400, "RENTAL_NOT_ACTIVE");
  }
  if (rental.startDate > date || (rental.endDate && rental.endDate < date)) {
    throw new AppointmentActionError("Deze huur loopt niet op de dag van de afspraak", 400, "RENTAL_NOT_ON_DATE");
  }
  if (isWeekend(date)) throw new AppointmentActionError("De afspraak valt in het weekend; de werkplaats is dan gesloten", 400, "WEEKEND");
  if (date < isoToday()) throw new AppointmentActionError("De afspraak ligt in het verleden", 400, "IN_PAST");
  const [claimed] = await db.update(onlineAppointments)
    .set({ status: "pending", reviewReason: null, vehicleId: rental.vehicleId, customerId: rental.customerId, rentalId: rental.id })
    .where(and(eq(onlineAppointments.id, id), eq(onlineAppointments.status, "review"))).returning();
  if (!claimed) throw ALREADY_HANDLED();
  const blockId = await planFor(claimed, rental, by);
  await db.update(onlineAppointments).set({ blockId }).where(eq(onlineAppointments.id, id));
  return getDto(id);
}

/** Not an appointment for us (a test, a car that is not ours): taken off the list. */
export async function dismissAppointment(id: number, by: string): Promise<OnlineAppointmentDto> {
  const row = await getRow(id);
  if (!row) throw new AppointmentActionError("Afspraak niet gevonden", 404, "NOT_FOUND");
  const [claimed] = await db.update(onlineAppointments).set({ status: "dismissed", ...stamp(by) })
    .where(and(eq(onlineAppointments.id, id), eq(onlineAppointments.status, "review"))).returning({ id: onlineAppointments.id });
  if (!claimed) throw ALREADY_HANDLED();
  return getDto(id);
}
