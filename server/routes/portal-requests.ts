import type { Express, Request, Response } from "express";
import fs from "fs";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { isValidRequestTransition, REQUEST_TRANSITIONS, hhmm, type PortalRequestStatusValue } from "../../shared/portal-requests";
import type { PortalBookingAlternativeDto } from "../../shared/portal-types";
import { NOT_RENTABLE } from "../services/portal-storage";
import { assignDriverToReservation } from "../services/driver-assignments";
import { realtimeEvents } from "../realtime-events";
import { requestsStorage, toRequestDto } from "../services/portal-requests-storage";
import { sendRequestReplyMail } from "../services/portal-mail";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { scheduleContractRegeneration } from "../services/reservation-pdf-regeneration";
import { resolveDocumentFilePath } from "../services/document-paths";
import { sanitizeFilename } from "../utils/security/fileUploadSecurity";
import { AuditLogger } from "../utils/security/auditLogger";
import type { RouteDeps } from "./deps";

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

  async function finish(req: Request, id: number, reply: string, status: PortalRequestStatusValue, customerId: number) {
    const updated = await requestsStorage.updateRequest(id, { staffReply: reply, repliedAt: new Date(), repliedBy: actor(req), status, handledBy: actor(req) });
    try { await sendRequestReplyMail(id); } catch (e) { console.error("request reply mail failed:", e); }
    await portalStorage.logActivity({ customerId, action: "request_replied", entity: "request", entityId: id, details: { status, by: actor(req) } });
    await AuditLogger.logFromRequest(req, "portal_request.reply", "portal_request", id, { status });
    return updated;
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
    res.json(toRequestDto(row, true));
  });

  app.get("/api/portal-requests/:id/attachments/:attachmentId", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const attachmentId = idParam(req, res, "attachmentId"); if (attachmentId === null) return;
    const att = await requestsStorage.getAttachment(attachmentId);
    const file = att && att.requestId === id ? resolveDocumentFilePath(att.filePath) : null;
    if (!att || !file) return res.status(404).json({ message: "Attachment not found" });
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(att.fileName)}"`);
    fs.createReadStream(file).pipe(res);
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
      const busy = (await portalStorage.listReservationsForCustomer(row.customerId, {})).find((r) => r.driverId === driverId && (r.status === "booked" || r.status === "picked_up"));
      if (busy) return res.status(409).json({ message: `${driver.displayName} rijdt al in ${busy.vehicle?.licensePlate ?? `#${busy.id}`}`, field: "driverId" });
    }

    const reservation = await storage.createReservation({
      customerId: row.customerId, vehicleId, driverId, startDate, endDate, startTime, endTime,
      status: "booked", type: "standard", notes: `Via klantenportaal (aanvraag #${id})`,
      createdBy: actor(req), updatedBy: actor(req),
    } as any);
    if (driverId) await assignDriverToReservation({ reservationId: reservation.id, driverId, byUserId: req.user?.id, note: `portal request #${id}` });
    await storage.syncVehicleAvailabilityWithReservations();
    realtimeEvents.reservations.created(reservation);
    await requestsStorage.updateRequest(id, { reservationId: reservation.id });
    await AuditLogger.logFromRequest(req, "reservation.create", "reservation", reservation.id, { viaPortalRequest: id, vehicleId, startDate, endDate, driverId });
    const reply = b.reply || `Goedgekeurd: reservering #${reservation.id}, ${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate}) vanaf ${startDate}${endDate ? ` tot en met ${endDate}` : ""}.`;
    const updated = await finish(req, id, reply, "done", row.customerId);
    res.json({ ...updated, reservation });
  }
}
