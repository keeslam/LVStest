import type { Express, Request, Response } from "express";
import fs from "fs";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { isValidRequestTransition, REQUEST_TRANSITIONS, hhmm, type PortalRequestStatusValue } from "../../shared/portal-requests";
import type { PortalBookingAlternativeDto } from "../../shared/portal-types";
import { NOT_RENTABLE } from "../services/portal-storage";
import { assignDriverToReservation, driverBusyElsewhere } from "../services/driver-assignments";
import { realtimeEvents } from "../realtime-events";
import { customerNotifications } from "../services/portal-customer-notifications";
import { requestsStorage, toRequestDto } from "../services/portal-requests-storage";
import { sendRequestReplyMail, requestReplyMailOptedOut } from "../services/portal-mail";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { scheduleContractRegeneration } from "../services/reservation-pdf-regeneration";
import { resolveDocumentFilePath } from "../services/document-paths";
import { setSafeFileHeaders } from "../utils/portal-files";
import { sanitizeFilename } from "../utils/security/fileUploadSecurity";
import { AuditLogger } from "../utils/security/auditLogger";
import { onMaintenanceBlockChanged, findPortalCustomerForBlock } from "../services/portal-maintenance-events";
import { isWeekend } from "../services/booking-period";
import { BookingConflictError, warningsForVerdict } from "../services/bookability";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { isoToday, normalizeReservationStatus } from "../services/lifecycle";
import type { RouteDeps } from "./deps";
import { portalCompanyName } from "../services/company-name";
import { decideMileageTakeOver } from "../services/portal-mileage";
import { recordMileageReadingLogged } from "../services/mileage-history";

const canView = hasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
const canManage = hasPermission(UserPermission.MANAGE_PORTAL);

function idParam(req: Request, res: Response, name = "id"): number | null {
  const id = parseInt(req.params[name], 10);
  if (Number.isNaN(id)) { res.status(400).json({ message: `Invalid ${name}` }); return null; }
  return id;
}

/** Staff inbox for customer requests: take, reply, reject, approve extensions/early returns. */
export function registerPortalRequestRoutes(app: Express, _deps: RouteDeps): void {
  const actor = (req: Request) => req.user?.username ?? "system";

  async function hasBlockFor(requestId: number): Promise<boolean> {
    const [b] = await db.select({ id: reservations.id }).from(reservations).where(and(eq(reservations.portalRequestId, requestId), isNull(reservations.deletedAt))).limit(1);
    return Boolean(b);
  }
  const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const STATUS_LABEL: Record<string, string> = { done: "afgehandeld", rejected: "afgewezen", in_progress: "in behandeling" };
  async function finish(req: Request, id: number, reply: string, status: PortalRequestStatusValue, customerId: number) {
    const updated = await requestsStorage.updateRequest(id, { staffReply: reply, repliedAt: new Date(), repliedBy: actor(req), status, handledBy: actor(req) });
    if (reply) await requestsStorage.addMessage({ requestId: id, author: "staff", authorName: actor(req), body: reply });
    await customerNotifications.notify({
      customerId, type: `request_${status}`,
      title: `Aanvraag #${id} ${STATUS_LABEL[status] ?? status}`,
      description: reply ? reply.slice(0, 300) : `${portalCompanyName()} heeft uw aanvraag #${id} ${STATUS_LABEL[status] ?? status}.`,
      // The staff reply is shown as written; the portal words only the title and the reply-less sentence.
      params: { id, reply: reply ? reply.slice(0, 300) : null, company: portalCompanyName() },
      link: `/aanvragen/${id}`,
    });
    // BUG-155: whether the customer actually got the mail is part of the
    // answer, not something to swallow into the log. The caller passes it on as
    // `mailSent`, so the staff screen can say "reply saved, mail failed".
    let mailSent = false, mailOptedOut = false;
    try {
      mailOptedOut = await requestReplyMailOptedOut(id);
      mailSent = await sendRequestReplyMail(id);
    } catch (e) { console.error("request reply mail failed:", e); }
    await portalStorage.logActivity({ customerId, action: "request_replied", entity: "request", entityId: id, details: { status, by: actor(req) } });
    await AuditLogger.logFromRequest(req, "portal_request.reply", "portal_request", id, { status });
    return { ...(updated as Record<string, unknown>), mailSent, mailOptedOut } as typeof updated & { mailSent: boolean; mailOptedOut: boolean };
  }

  app.get("/api/portal-requests", canView, async (req, res) => {
    const rows = await requestsStorage.listRequests({
      status: req.query.status ? String(req.query.status) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      customerId: req.query.customerId ? parseInt(String(req.query.customerId), 10) : undefined,
    });
    res.json(rows.map((r) => toRequestDto(r, true)));
  });

  app.get("/api/portal-requests/count-new", canView, async (_req, res) => res.json({ count: await requestsStorage.countNewRequests() }));

  app.get("/api/portal-requests/:id", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    const dto = toRequestDto(row, true);
    if (row.type !== "mileage") return res.json(dto);
    // B-63: staff see what the car is on now, so they know whether "Overnemen" applies.
    const vehicle = await mileageVehicle(row);
    res.json({
      ...dto,
      mileageVehicle: vehicle ? { id: vehicle.id, licensePlate: vehicle.licensePlate, currentMileage: vehicle.currentMileage ?? null } : null,
    });
  });

  async function mileageVehicle(row: Row) {
    const rental = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    return rental?.vehicleId ? storage.getVehicle(rental.vehicleId) : undefined;
  }

  // B-63: take a reported reading over as the car's current mileage, only when it is higher.
  // The request stays open; staff still answer the customer.
  app.post("/api/portal-requests/:id/apply-mileage", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row || row.type !== "mileage") return res.status(404).json({ message: "Request not found" });
    const p = row.payload as Record<string, unknown>;
    if (p.mileageAppliedAt) return res.status(409).json({ message: "De km-stand is al overgenomen", code: "MILEAGE_ALREADY_APPLIED" });
    const reported = Number(p.mileage);
    if (!Number.isInteger(reported) || reported < 0) return res.status(400).json({ message: "Geen geldige km-stand in de aanvraag" });
    const vehicle = await mileageVehicle(row);
    if (!vehicle) return res.status(400).json({ message: "Geen auto bij deze aanvraag" });
    const decision = decideMileageTakeOver(vehicle.currentMileage, reported);
    if (!decision.ok) {
      return res.status(409).json({
        message: `Niet overgenomen: de auto staat al op ${decision.current} km, de klant meldde ${decision.reported} km`,
        code: "MILEAGE_NOT_HIGHER", current: decision.current, reported: decision.reported,
      });
    }
    const updated = await storage.updateVehicle(vehicle.id, { currentMileage: decision.mileage, updatedBy: actor(req) });
    // Rapporten fase 1 - the customer's reading goes into the km history under their own name.
    if (updated) {
      await recordMileageReadingLogged({
        vehicleId: vehicle.id, mileage: decision.mileage, recordedAt: row.createdAt ?? new Date(),
        source: "portal", sourceTable: "portal_requests", sourceId: id,
        actorName: row.submittedBy || row.customerName || "portal",
      }, `portal request ${id} apply-mileage`);
    }
    await requestsStorage.updateRequest(id, { payload: { ...p, mileageAppliedAt: new Date().toISOString(), mileageAppliedBy: actor(req) } });
    if (updated) realtimeEvents.vehicles.updated(updated);
    await AuditLogger.logFromRequest(req, "vehicle.update", "vehicle", vehicle.id, { currentMileage: { from: decision.previous, to: decision.mileage }, viaPortalRequest: id });
    res.json({ vehicleId: vehicle.id, previous: decision.previous, currentMileage: decision.mileage });
  });

  app.get("/api/portal-requests/:id/attachments/:attachmentId", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const attachmentId = idParam(req, res, "attachmentId"); if (attachmentId === null) return;
    const att = await requestsStorage.getAttachment(attachmentId);
    const file = att && att.requestId === id ? resolveDocumentFilePath(att.filePath) : null;
    if (!att || !file) return res.status(404).json({ message: "Attachment not found" });
    setSafeFileHeaders(res, att.contentType, att.fileName, true, sanitizeFilename(att.fileName));
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  });

  // Staff add to the conversation without closing the request.
  app.post("/api/portal-requests/:id/messages", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    const parsed = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Message is required" });
    const msg = await requestsStorage.addMessage({ requestId: id, author: "staff", authorName: actor(req), body: parsed.data.body });
    if (row.status === "new") await requestsStorage.updateRequest(id, { status: "in_progress", handledBy: actor(req) });
    await customerNotifications.notify({ customerId: row.customerId, type: "request_message", title: `Nieuw bericht bij aanvraag #${id}`, description: parsed.data.body.slice(0, 300), params: { id }, link: `/aanvragen/${id}` });
    await portalStorage.logActivity({ customerId: row.customerId, action: "request_message_staff", entity: "request", entityId: id, details: { by: actor(req) } });
    res.status(201).json({ id: msg.id, author: "staff", authorName: msg.authorName, body: msg.body, createdAt: msg.createdAt.toISOString() });
  });

  app.post("/api/portal-requests/:id/take", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (!isValidRequestTransition(row.status, "in_progress")) {
      return res.status(400).json({ message: "Cannot take this request", allowed: REQUEST_TRANSITIONS[row.status as PortalRequestStatusValue] });
    }
    res.json(await requestsStorage.updateRequest(id, { status: "in_progress", handledBy: actor(req) }));
  });

  app.post("/api/portal-requests/:id/reply", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    const parsed = z.object({ reply: z.string().trim().max(4000).optional(), status: z.enum(["done", "rejected", "in_progress"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "status is required" });
    const reply = parsed.data.reply ?? "";
    if (parsed.data.status !== "in_progress" && !reply) return res.status(400).json({ message: "A reply is required" });
    if (row.status !== parsed.data.status && !isValidRequestTransition(row.status, parsed.data.status)) {
      return res.status(400).json({ message: `Cannot go from ${row.status} to ${parsed.data.status}`, allowed: REQUEST_TRANSITIONS[row.status as PortalRequestStatusValue] });
    }
    // Closing a rental request as "done" without a reservation would tell the customer it is
    // arranged while nothing is in the calendar: only approve (creates it) or reject can close it.
    if (row.type === "booking" && parsed.data.status === "done" && !row.reservationId) {
      return res.status(400).json({ message: "Een huuraanvraag kan alleen worden afgehandeld via Goedkeuren (maakt de reservering) of Afwijzen", code: "BOOKING_NEEDS_RESERVATION" });
    }
    // Same for a name change: "done" without Goedkeuren would tell the customer it is changed while the record is not.
    if (row.type === "company_name_change" && parsed.data.status === "done") {
      return res.status(400).json({ message: "Een naamwijziging kan alleen worden afgehandeld via Goedkeuren (past de naam aan) of Afwijzen", code: "COMPANY_NAME_NEEDS_APPROVAL" });
    }
    if (row.type === "maintenance" && parsed.data.status === "done" && !(await hasBlockFor(id))) {
      return res.status(400).json({ message: "Een onderhoudsmelding kan alleen worden afgehandeld via Inplannen (zet het in de kalender) of Afwijzen", code: "MAINTENANCE_NEEDS_BLOCK" });
    }
    res.json(await finish(req, id, reply, parsed.data.status, row.customerId));
  });

  const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const bookingPeriod = (row: { payload: Record<string, unknown> }, q: Record<string, unknown>) => ({
    startDate: typeof q.start === "string" && q.start ? q.start : String(row.payload.startDate ?? ""),
    endDate: (typeof q.end === "string" ? q.end : String(row.payload.endDate ?? "")) || null,
  });

  /**
   * Vehicles staff could put on a rental request: the requested one first, then the same
   * type, then the rest; each flagged free/busy for the period and never a blacklisted one.
   */
  app.get("/api/portal-requests/:id/alternatives", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (row.type !== "booking") return res.status(400).json({ message: "Only rental requests have alternatives" });
    const { startDate, endDate } = bookingPeriod(row, req.query as Record<string, unknown>);
    if (!isoDate.safeParse(startDate).success) return res.status(400).json({ message: "Invalid period" });
    const requestedId = Number(row.payload.vehicleId);
    const [all, blocks, busy] = await Promise.all([
      storage.getAllVehicles(),
      portalStorage.listBlacklist(),
      portalStorage.listBusyVehicleIds(startDate, endDate),
    ]);
    const blocked = new Set(blocks.filter((b) => b.customerId === row.customerId).map((b) => b.vehicleId));
    const requested = all.find((v) => v.id === requestedId);
    const list: PortalBookingAlternativeDto[] = all
      .filter((v) => !blocked.has(v.id) && !NOT_RENTABLE.includes(v.availabilityStatus))
      .map((v) => ({
        id: v.id, licensePlate: v.licensePlate, brand: v.brand, model: v.model, vehicleType: v.vehicleType, availabilityStatus: v.availabilityStatus,
        offeredOnline: v.offeredOnline, requested: v.id === requestedId, sameType: Boolean(requested?.vehicleType) && v.vehicleType === requested?.vehicleType, free: !busy.has(v.id),
      }))
      .sort((a, b) => Number(b.requested) - Number(a.requested) || Number(b.sameType) - Number(a.sameType) || Number(b.free) - Number(a.free) || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
    res.json({ startDate, endDate, requestedBlocked: blocked.has(requestedId), vehicles: list });
  });

  app.post("/api/portal-requests/:id/approve", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (row.type === "booking") return approveBooking(req, res, id, row);
    if (row.type === "maintenance") return approveMaintenance(req, res, id, row);
    if (row.type === "maintenance_change") return approveMaintenanceChange(req, res, id, row);
    if (row.type === "company_name_change") return approveCompanyName(req, res, id, row);
    if (row.type === "cancellation") return approveCancellation(req, res, id, row);
    if (row.type !== "extension" && row.type !== "early_return") return res.status(400).json({ message: "Only extensions, early returns and rental requests can be approved" });
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const reservation = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!reservation || !reservation.vehicleId) return res.status(400).json({ message: "Reservation not found" });
    const newEnd = String(row.type === "extension" ? row.payload.newEndDate : row.payload.returnDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) return res.status(400).json({ message: "Request has no valid date" });
    const conflicts = (await storage.checkReservationConflicts(reservation.vehicleId, reservation.startDate, newEnd, reservation.id))
      .filter((c) => c.id !== reservation.id);
    if (conflicts.length > 0) {
      return res.status(409).json({
        message: "Conflicts with another reservation",
        conflicts: conflicts.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, customerId: c.customerId })),
      });
    }
    await storage.updateReservation(reservation.id, { endDate: newEnd, updatedBy: actor(req) } as any);
    scheduleContractRegeneration(reservation.id, actor(req));
    await AuditLogger.logFromRequest(req, "reservation.update", "reservation", reservation.id, { endDate: newEnd, viaPortalRequest: id });
    const reply = row.type === "extension" ? `Goedgekeurd: nieuwe einddatum ${newEnd}.` : `Goedgekeurd: inleverdatum ${newEnd}.`;
    res.json(await finish(req, id, reply, "done", row.customerId));
  });

  /**
   * Approving a cancellation (Kees, 2026-10-18) cancels the reservation the way the office's own
   * cancel does: status cancelled, its open transports, spare cars and driver assignment closed, the
   * vehicle's availability recomputed and the calendar told. The 48 hours were checked when the
   * customer asked; staff may still approve later. A car already picked up is never cancelled here.
   * The customer hears it through the request's own notice and mail, so no second "reservation
   * cancelled" mail goes out.
   */
  async function approveCancellation(req: Request, res: Response, id: number, row: NonNullable<Awaited<ReturnType<typeof requestsStorage.getRequest>>>) {
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const before = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!before || before.deletedAt || before.customerId !== row.customerId) return res.status(400).json({ message: "Reservation not found" });
    if (before.status !== "booked") return res.status(409).json({ message: "Only a booked reservation can be cancelled this way" });
    const reservation = await storage.updateReservation(before.id, { status: "cancelled", updatedBy: actor(req) } as any);
    if (!reservation) return res.status(400).json({ message: "Reservation not found" });
    const cascade = await storage.applyReservationCancelCascade(before.id, { transports: true, spares: true, placeholders: true, drivers: true }, { username: actor(req) });
    if (reservation.vehicleId) await storage.recomputeVehicleAvailability(reservation.vehicleId);
    realtimeEvents.reservations.updated(reservation);
    await AuditLogger.logFromRequest(req, "reservation.status", "reservation", before.id, { from: before.status, to: "cancelled", viaPortalRequest: id, cascade });
    res.json(await finish(req, id, `Goedgekeurd: reservering #${before.id} is geannuleerd.`, "done", row.customerId));
  }

  /**
   * Approving a name change writes the new company name to the customer record. For a business
   * the short `name` mirrors the company name, so it moves along when it still equals the old one.
   * Contracts that were already generated keep the old name until they are regenerated.
   */
  async function approveCompanyName(req: Request, res: Response, id: number, row: NonNullable<Awaited<ReturnType<typeof requestsStorage.getRequest>>>) {
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const newName = String((row.payload as Record<string, unknown>).newName ?? "").trim();
    if (newName.length < 2) return res.status(400).json({ message: "Request has no valid company name" });
    const customer = await storage.getCustomer(row.customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    const previous = customer.companyName || customer.name;
    const patch: Record<string, string> = { companyName: newName };
    if (customer.name === previous) patch.name = newName;
    await storage.updateCustomer(row.customerId, patch as any);
    await AuditLogger.logFromRequest(req, "customer.update", "customer", row.customerId, { companyName: newName, previousName: previous, viaPortalRequest: id });
    res.json(await finish(req, id, `Goedgekeurd: de bedrijfsnaam is nu "${newName}".`, "done", row.customerId));
  }

  /**
   * Approving a rental request creates the reservation (status booked) so it lands in the
   * calendar and the normal flow. Staff may change vehicle, period, times and driver first;
   * blacklist, calendar conflicts and the one-car-per-driver rule are checked here regardless.
   */
  async function approveBooking(req: Request, res: Response, id: number, row: NonNullable<Awaited<ReturnType<typeof requestsStorage.getRequest>>>) {
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const parsed = z.object({
      vehicleId: z.number().int().positive().optional(),
      startDate: isoDate.optional(),
      endDate: z.union([isoDate, z.literal(""), z.null()]).optional(),
      startTime: z.union([hhmm, z.literal(""), z.null()]).optional(),
      endTime: z.union([hhmm, z.literal(""), z.null()]).optional(),
      driverId: z.number().int().positive().nullable().optional(),
      reply: z.string().trim().max(4000).optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const b = parsed.data;
    const p = row.payload as Record<string, unknown>;
    const vehicleId = b.vehicleId ?? Number(p.vehicleId);
    const startDate = b.startDate ?? String(p.startDate ?? "");
    const endDate = (b.endDate !== undefined ? b.endDate : String(p.endDate ?? "")) || null;
    const startTime = (b.startTime !== undefined ? b.startTime : (p.startTime as string | undefined)) || null;
    const endTime = (b.endTime !== undefined ? b.endTime : (p.endTime as string | undefined)) || null;
    const driverId = b.driverId !== undefined ? b.driverId : p.driverId ? Number(p.driverId) : null;
    if (!isoDate.safeParse(startDate).success) return res.status(400).json({ message: "Request has no valid start date" });
    if (endDate && endDate < startDate) return res.status(400).json({ message: "End date must be after the start date", field: "endDate" });

    const vehicle = await storage.getVehicle(vehicleId);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found", field: "vehicleId" });
    if (await portalStorage.isVehicleBlockedForCustomer(vehicleId, row.customerId)) return res.status(409).json({ message: "Deze klant staat op de blacklist voor dit voertuig", field: "vehicleId" });
    if (NOT_RENTABLE.includes(vehicle.availabilityStatus)) return res.status(409).json({ message: "Dit voertuig is niet verhuurbaar (status " + vehicle.availabilityStatus + ")", field: "vehicleId" });
    const conflicts = await storage.checkReservationConflicts(vehicleId, startDate, endDate, null, false, startTime, endTime);
    if (conflicts.length > 0) {
      return res.status(409).json({
        message: "Conflicts with another reservation", field: "vehicleId",
        conflicts: conflicts.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, customerId: c.customerId })),
      });
    }
    if (driverId) {
      const driver = await portalStorage.getDriverForCustomer(driverId, row.customerId);
      if (!driver || driver.status !== "active") return res.status(400).json({ message: "Driver not found for this customer", field: "driverId" });
      // One car per driver, as main or as extra driver (Kees, 2026-10-18).
      const busy = await driverBusyElsewhere(driverId, 0);
      if (busy) return res.status(409).json({ message: `${driver.displayName} rijdt al in ${busy.licensePlate ?? `#${busy.id}`}`, field: "driverId" });
    }

    // FIX-F — the approval is a booking like any other: the predicate runs
    // inside the insert's transaction, behind the vehicle's advisory lock, so
    // approving a portal request can no longer land on a slot the office took
    // in the meantime (the pre-check above only shapes the response).
    let reservation;
    try {
      reservation = await storage.createReservationChecked({
        customerId: row.customerId, vehicleId, driverId, startDate, endDate, startTime, endTime,
        status: "booked", type: "standard", notes: `Via klantenportaal (aanvraag #${id})`,
        createdBy: actor(req), updatedBy: actor(req),
      } as any);
    } catch (error) {
      if (error instanceof BookingConflictError) {
        return res.status(error.status).json({
          message: error.status === 409 ? "Conflicts with another reservation" : error.message,
          field: "vehicleId",
          conflicts: error.verdict.conflicts.map((c) => ({
            id: c.id, startDate: c.startDate, endDate: c.endDate, customerId: c.customerId,
          })),
        });
      }
      throw error;
    }
    if (driverId) await assignDriverToReservation({ reservationId: reservation.id, driverId, byUserId: req.user?.id, note: `portal request #${id}` });
    await storage.syncVehicleAvailabilityWithReservations();
    realtimeEvents.reservations.created(reservation);
    await requestsStorage.updateRequest(id, { reservationId: reservation.id });
    await AuditLogger.logFromRequest(req, "reservation.create", "reservation", reservation.id, { viaPortalRequest: id, vehicleId, startDate, endDate, driverId });
    const reply = b.reply || `Goedgekeurd: reservering #${reservation.id}, ${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate}) vanaf ${startDate}${endDate ? ` tot en met ${endDate}` : ""}.`;
    const updated = await finish(req, id, reply, "done", row.customerId);
    res.json({ ...updated, reservation });
  }

  type Row = NonNullable<Awaited<ReturnType<typeof requestsStorage.getRequest>>>;

  /**
   * Clips a maintenance block's period to where the rental it displaces actually runs;
   * null when they no longer overlap. A picked-up rental is already on the road, so its
   * start never bounds the clip — only its end (if any) does.
   */
  function clipToRental(blockStart: string, blockEnd: string, rental: { startDate: string; endDate: string | null; status: string }): { start: string; end: string } | null {
    const start = rental.status === "picked_up" ? blockStart : (rental.startDate > blockStart ? rental.startDate : blockStart);
    const end = rental.endDate && rental.endDate < blockEnd ? rental.endDate : blockEnd;
    return start > end ? null : { start, end };
  }

  /** Creates the placeholder spare for a rental, clipped to the block/rental overlap; a stale unassigned one moves to the new period instead (same as the staff flow). */
  async function ensurePlaceholderSpare(rental: { id: number; customerId: number | null; startDate: string; endDate: string | null; status: string }, blockStart: string, blockEnd: string, requestId: number, updatedBy: string): Promise<void> {
    if (!rental.customerId) return;
    const clipped = clipToRental(blockStart, blockEnd, rental);
    if (!clipped) {
      console.error(`ensurePlaceholderSpare: block ${blockStart}..${blockEnd} does not overlap rental #${rental.id} (${rental.startDate}..${rental.endDate ?? "open"}), skipping placeholder (portal request #${requestId})`);
      return;
    }
    try {
      const [existing] = await db.select().from(reservations).where(and(
        eq(reservations.type, "replacement"),
        eq(reservations.placeholderSpare, true),
        isNull(reservations.vehicleId),
        isNull(reservations.deletedAt),
        eq(reservations.replacementForReservationId, rental.id),
      )).limit(1);
      if (existing) {
        const startDate = clipped.start, endDate = clipped.end;
        await storage.updateReservation(existing.id, { startDate, endDate, updatedBy } as any);
        return;
      }
      await storage.createPlaceholderReservation(rental.id, rental.customerId, clipped.start, clipped.end);
    } catch (e) {
      console.error(`createPlaceholderReservation failed for rental #${rental.id} (portal request #${requestId}):`, e);
    }
  }

  /** "Ingepland op 2026-10-02 tot en met 2026-10-03. <note>" */
  function scheduledReply(verb: "Ingepland op" | "Verplaatst naar", startDate: string, endDate: string, days: number, note?: string): string {
    return `${verb} ${startDate}${days > 1 ? ` tot en met ${endDate}` : ""}.${note ? ` ${note}` : ""}`;
  }

  /** Puts the reported maintenance in the calendar; a placeholder spare when the customer asked for one. */
  async function approveMaintenance(req: Request, res: Response, id: number, row: Row) {
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const parsed = z.object({
      startDate: isoDate, durationDays: z.number().int().min(1).max(60).default(1),
      category: z.enum(["scheduled_maintenance", "repair"]).default("repair"), note: z.string().trim().max(2000).optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "startDate is required", field: "startDate" });
    const b = parsed.data;
    if (isWeekend(b.startDate)) return res.status(400).json({ message: "Kies een werkdag: de werkplaats is in het weekend gesloten", field: "startDate", code: "MAINTENANCE_WEEKEND" });
    // BUG-138a: approving with a date in the past created a block and a spare
    // request for days that had already gone by, told the customer "onderhoud
    // gepland op <vorige week>", and left the placeholder in needing-assignment
    // for ever. The customer form already refuses it; the approval did not.
    if (b.startDate < isoToday()) {
      return res.status(400).json({ message: "Onderhoud kan niet in het verleden worden ingepland", field: "startDate", code: "MAINTENANCE_IN_PAST" });
    }
    const rental = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!rental?.vehicleId) return res.status(400).json({ message: "Reservation not found" });
    // BUG-138b: a cancelled or finished rental has no car to service and no
    // customer waiting for a replacement, yet the approval planned both and
    // stamped spare_assignment_decision on the cancelled row.
    const rentalStatus = normalizeReservationStatus(rental.status);
    if (rentalStatus !== "booked" && rentalStatus !== "picked_up") {
      return res.status(400).json({ message: "De verhuring is niet meer actief; onderhoud kan niet worden ingepland", field: "reservationId", code: "RENTAL_NOT_ACTIVE" });
    }

    // BUG-141: claim the request before doing any of the work. Two staff
    // members approving the same request at the same moment used to create two
    // maintenance blocks, two replies and two customer notifications; the
    // transition is now the first write and only one caller can make it.
    const claim = await requestsStorage.claimForApproval(id, actor(req));
    if (!claim) return res.status(409).json({ message: "Request is already closed", code: "ALREADY_HANDLED" });

    try {
    const p = row.payload as Record<string, unknown>;
    const endDate = addDays(b.startDate, b.durationDays - 1);
    const created = await storage.createMaintenanceBlock(rental.vehicleId, b.startDate, endDate, rental.customerId);
    // Same notes shape staff use directly ("{maintenanceType}: {description}\n{notes}"), so the
    // calendar and view dialog parse it the same way regardless of where the block came from.
    const maintenanceType = b.category === "scheduled_maintenance" ? "regular_maintenance" : "other";
    const block = (await storage.updateReservation(created.id, {
      maintenanceCategory: b.category, maintenanceDuration: b.durationDays, portalRequestId: id, affectedRentalId: rental.id,
      notes: `${maintenanceType}: ${String(p.issue ?? "")}\nPortaal aanvraag #${id}${p.urgent ? " (dringend)" : ""}${b.note ? `\n${b.note}` : ""}`,
      createdBy: actor(req), updatedBy: actor(req),
    } as any))!;
    if (p.needsReplacement) {
      // The spare decision lives on the rental, same as when staff assign it directly.
      await storage.updateReservation(rental.id, { spareAssignmentDecision: "spare_assigned" } as any);
      await ensurePlaceholderSpare(rental, b.startDate, endDate, id, actor(req));
    }
    const km = Number(p.mileage);
    if (Number.isFinite(km) && km > 0) {
      const vehicle = await storage.getVehicle(rental.vehicleId);
      if (vehicle && km > (vehicle.currentMileage ?? 0)) {
        await storage.updateVehicle(vehicle.id, { currentMileage: km });
        // Rapporten fase 1 - taken over automatically, so the system is the actor.
        await recordMileageReadingLogged({
          vehicleId: vehicle.id, mileage: km, recordedAt: row.createdAt ?? new Date(),
          source: "portal", sourceTable: "portal_requests", sourceId: id, actorName: "systeem",
        }, `portal request ${id} maintenance approval`);
      }
    }
    await storage.syncVehicleAvailabilityWithReservations();
    realtimeEvents.reservations.created(block);
    await onMaintenanceBlockChanged(null, block);
    await AuditLogger.logFromRequest(req, "reservation.create", "reservation", block.id, { viaPortalRequest: id, maintenance: true });
    const reply = scheduledReply("Ingepland op", b.startDate, endDate, b.durationDays, b.note);
    const updated = await finish(req, id, reply, "done", row.customerId);
    res.json({ ...updated, block });
    } catch (error) {
      await claim.release().catch(() => {});
      throw error;
    }
  }

  /** Moves the block (and its placeholder spare) to the date staff confirm. */
  async function approveMaintenanceChange(req: Request, res: Response, id: number, row: Row) {
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const parsed = z.object({ startDate: isoDate, durationDays: z.number().int().min(1).max(60).optional(), note: z.string().trim().max(2000).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "startDate is required", field: "startDate" });
    const b = parsed.data;
    if (isWeekend(b.startDate)) return res.status(400).json({ message: "Kies een werkdag: de werkplaats is in het weekend gesloten", field: "startDate", code: "MAINTENANCE_WEEKEND" });
    const before = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!before || before.type !== "maintenance_block" || before.deletedAt) return res.status(400).json({ message: "Maintenance block not found" });
    if (before.maintenanceStatus !== "scheduled") return res.status(409).json({ message: "Het onderhoud is al gestart" });
    const days = b.durationDays ?? before.maintenanceDuration ?? 1;
    const endDate = addDays(b.startDate, days - 1);
    // besluiten **B-09** (BUG-037) — this used to be a 409 "Conflicts with
    // another maintenance block". Two overlapping blocks on one car are now
    // allowed; staff get the warning instead, with the period of the block they
    // land on.
    const blockVerdict = await storage.isVehicleBookable({
      vehicleId: before.vehicleId!,
      startDate: b.startDate,
      endDate,
      excludeReservationId: before.id,
      isMaintenanceBlock: true,
    });
    const blockWarnings = warningsForVerdict(blockVerdict);
    const p = row.payload as Record<string, unknown>;
    // A block staff planned directly in the calendar has no affectedRentalId: fall back to
    // whichever rental has this vehicle on the road, and persist it so it sticks from here on.
    const rentalId = before.affectedRentalId ?? (await findPortalCustomerForBlock(before))?.rental.id ?? null;
    const after = (await storage.updateReservation(before.id, { startDate: b.startDate, endDate, maintenanceDuration: days, affectedRentalId: rentalId, updatedBy: actor(req) } as any))!;
    await storage.syncVehicleAvailabilityWithReservations();
    if (rentalId) {
      const rental = await storage.getReservation(rentalId);
      // BUG-117: this looked for placeholderSpare = true only. Once staff had
      // actually assigned a car, the query found nothing, so the assigned spare
      // stayed booked on the *old* dates (a car blocked on days with no
      // maintenance) and ensurePlaceholderSpare created a **second** live
      // replacement for the same rental, with the customer told twice. Every
      // live replacement moves with the block now; an assigned one is checked
      // against the new period first.
      const [placeholder] = await db.select().from(reservations).where(and(
        eq(reservations.replacementForReservationId, rentalId),
        eq(reservations.type, "replacement"),
        isNull(reservations.deletedAt),
        sql`${reservations.status} NOT IN ('cancelled','completed','returned')`,
      )).limit(1);
      if (placeholder) {
        const clipped = rental ? clipToRental(b.startDate, endDate, rental) : { start: b.startDate, end: endDate };
        if (clipped) {
          if (placeholder.vehicleId != null) {
            // An assigned spare is a real booking: moving it passes the same
            // conflict check as any other move, or staff are told to reassign.
            const spareConflicts = (await storage.checkReservationConflicts(
              placeholder.vehicleId, clipped.start, clipped.end, placeholder.id,
            )).filter((c) => c.id !== placeholder.id);
            if (spareConflicts.length > 0) {
              return res.status(409).json({
                message: "De toegewezen vervanger is niet vrij in de nieuwe periode; wijs eerst een andere auto toe",
                code: "SPARE_CONFLICT",
                conflicts: spareConflicts.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate })),
              });
            }
          }
          await storage.updateReservation(placeholder.id, { startDate: clipped.start, endDate: clipped.end, updatedBy: actor(req) } as any);
        } else {
          console.error(`approveMaintenanceChange: moved block ${b.startDate}..${endDate} no longer overlaps rental #${rentalId}; leaving replacement #${placeholder.id} untouched (portal request #${id})`);
        }
      } else if (p.needsReplacement && rental) {
        await ensurePlaceholderSpare(rental, b.startDate, endDate, id, actor(req));
      }
    }
    realtimeEvents.reservations.updated(after);
    await onMaintenanceBlockChanged(before, after);
    await AuditLogger.logFromRequest(req, "reservation.update", "reservation", after.id, { viaPortalRequest: id, startDate: b.startDate, endDate });
    const reply = scheduledReply("Verplaatst naar", b.startDate, endDate, days, b.note);
    const updated = await finish(req, id, reply, "done", row.customerId);
    res.json({ ...updated, block: after, ...(blockWarnings.length ? { warnings: blockWarnings } : {}) });
  }
}
