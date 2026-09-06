import type { Express, RequestHandler, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
import { portalStorage, type PortalReservation } from "../services/portal-storage";
import { overlaps } from "../services/booking-period";
import { customerNotifications } from "../services/portal-customer-notifications";
import { getServiceDueVehicles } from "../utils/service-due-scanner";
import { settingsFlags, requireFeature, requirePortalRole, portalError, logPortalActivity } from "../portal-auth";
import { assignDriverToReservation, getDriverAssignments } from "../services/driver-assignments";
import { notifyStaffOfPortalEvent } from "../services/portal-notifications";
import { resolveDocumentFilePath } from "../services/document-paths";
import { createSecureMulterFilter, sanitizeFilename, validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { storage } from "../storage";
import { PORTAL_ERROR, type PortalReservationDto, type PortalDocumentDto, type PortalDriverDto } from "../../shared/portal-types";
import type { Driver } from "../../shared/schema";
import { finesStorage, type FineListRow } from "../services/fines-storage";
import type { PortalFineDto } from "../../shared/fines";
import { requestsStorage, toRequestDto } from "../services/portal-requests-storage";
import { requestPayloadSchemas, REQUEST_NEEDS, PortalRequestType } from "../../shared/portal-requests";
import { listMyVehicles } from "../services/portal-vehicles";
import { findPortalCustomerForBlock, canCustomerChangeMaintenance } from "../services/portal-maintenance-events";

export function toFineDto(f: FineListRow): PortalFineDto {
  return {
    id: f.id, licensePlate: f.licensePlate, offenceAt: f.offenceAt.toISOString(), description: f.description, reference: f.reference,
    amount: f.amount, adminFee: f.adminFee, totalAmount: f.totalAmount, status: f.status as PortalFineDto["status"],
    customerNote: f.customerNote, driver: f.driverId ? { id: f.driverId, displayName: f.driverName ?? "" } : null,
    reservationId: f.reservationId, hasLetter: Boolean(f.letterFilePath), createdAt: f.createdAt.toISOString(),
  };
}

const REQUEST_LABEL: Record<string, string> = { booking: "huuraanvraag", extension: "verlenging", early_return: "eerder inleveren", damage: "schademelding", maintenance: "onderhoudsmelding", maintenance_change: "wijziging onderhoud", mileage: "kilometerstand", fine_question: "vraag over bekeuring", other: "overig" };

export interface PortalRouteDeps {
  requirePortalUser: RequestHandler;
  uploadsDir: string;
}

const ACTIVE_STATUSES = ["booked", "picked_up"];

export function toReservationDto(r: PortalReservation, showPrices: boolean): PortalReservationDto {
  const dto: PortalReservationDto = {
    id: r.id, status: r.status, type: r.type,
    startDate: r.startDate, endDate: r.endDate, startTime: r.startTime, endTime: r.endTime,
    actualPickupDate: r.actualPickupDate, actualReturnDate: r.actualReturnDate,
    pickupMileage: r.pickupMileage, returnMileage: r.returnMileage,
    contractNumber: r.contractNumber,
    vehicle: r.vehicle ? { id: r.vehicle.id, licensePlate: r.vehicle.licensePlate, brand: r.vehicle.brand, model: r.vehicle.model, apkDate: r.vehicle.apkDate ?? null, ...(showPrices ? { dailyPrice: r.vehicle.dailyPrice ?? null } : {}) } : null,
    driver: r.driver ? { id: r.driver.id, displayName: r.driver.displayName } : null,
    replacementForReservationId: r.replacementForReservationId,
  };
  // Prices are omitted entirely (not nulled) unless the customer's switch is on.
  if (showPrices) dto.totalPrice = r.totalPrice;
  return dto;
}

export function toDriverDto(d: Driver): PortalDriverDto {
  return {
    id: d.id, displayName: d.displayName, firstName: d.firstName, lastName: d.lastName,
    email: d.email, phone: d.phone, driverLicenseNumber: d.driverLicenseNumber,
    licenseExpiry: d.licenseExpiry, licenseOrigin: d.licenseOrigin, preferredLanguage: d.preferredLanguage, notes: d.notes,
    status: d.status, hasLicenseFile: Boolean(d.licenseFilePath),
  };
}

const driverInputSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  firstName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  email: z.union([z.string().email(), z.literal("")]).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  driverLicenseNumber: z.string().trim().max(50).nullable().optional(),
  licenseExpiry: z.string().trim().max(20).nullable().optional(),
  licenseOrigin: z.string().trim().max(100).nullable().optional(),
  preferredLanguage: z.enum(["nl", "en"]).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

function idParam(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid id"); return null; }
  return id;
}

export function registerPortalRoutes(app: Express, deps: PortalRouteDeps): void {
  const { requirePortalUser, uploadsDir } = deps;
  const ctxOf = (req: Request) => req.portalUser!;

  // ---- reservations ---------------------------------------------------------
  app.get("/api/portal/reservations", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const rows = await portalStorage.listReservationsForCustomer(ctx.customerId, ctx.scope);
    res.json(rows.map((r) => toReservationDto(r, ctx.settings.showPrices)));
  });

  app.get("/api/portal/reservations/:id", requirePortalUser, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const r = await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope);
    if (!r) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found");
    const history = await getDriverAssignments(id);
    let serviceDue: "due" | "soon" | null = null;
    if (r.vehicleId && r.status === "picked_up") {
      const due = (await getServiceDueVehicles()).find((v) => v.id === r.vehicleId);
      serviceDue = due?.serviceDue.isServiceDue ? "due" : due?.serviceDue.isServiceDueSoon ? "soon" : null;
    }
    res.json({ ...toReservationDto(r, settingsFlags(ctx.settings, ctx.user).showPrices), driverHistory: history, serviceDue });
  });

  app.post("/api/portal/reservations/:id/driver", requirePortalUser, requireFeature("canManageDrivers"), requirePortalRole("admin"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const parsed = z.object({ driverId: z.number().int().positive(), note: z.string().trim().max(500).optional() }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "driverId is required");
    const r = await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope);
    if (!r) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found");
    if (!ACTIVE_STATUSES.includes(r.status)) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Only booked or running rentals can change driver");
    const driver = await portalStorage.getDriverForCustomer(parsed.data.driverId, ctx.customerId);
    if (!driver || driver.status !== "active") return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found");
    // One car per driver: a driver who is already on another booked or running car cannot be put on this one.
    const busy = (await portalStorage.listReservationsForCustomer(ctx.customerId, ctx.scope))
      .find((other) => other.id !== id && other.driverId === driver.id && ACTIVE_STATUSES.includes(other.status));
    if (busy) return portalError(res, 400, PORTAL_ERROR.DRIVER_BUSY, `${driver.displayName} rijdt al in ${busy.vehicle?.licensePlate ?? `#${busy.id}`}`);

    await assignDriverToReservation({ reservationId: id, driverId: driver.id, byPortalUserId: ctx.user.id, note: parsed.data.note });
    await logPortalActivity(req, "driver_assigned", { entity: "reservation", entityId: id, details: { driverId: driver.id, previousDriverId: r.driverId } });
    await notifyStaffOfPortalEvent({
      kind: "portal_driver_change",
      title: `Bestuurder gewijzigd: ${r.vehicle?.licensePlate ?? `#${id}`}`,
      description: `${ctx.user.fullName} heeft ${driver.displayName} als bestuurder ingesteld${r.driver ? ` (was ${r.driver.displayName})` : ""}.`,
      link: `/reservations/edit/${id}`,
      customerId: ctx.customerId,
    });
    const updated = await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope);
    res.json({ ...toReservationDto(updated!, ctx.settings.showPrices), driverHistory: await getDriverAssignments(id) });
  });

  // ---- documents ------------------------------------------------------------
  app.get("/api/portal/documents", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const ctx = ctxOf(req);
    const docs = await portalStorage.listDocumentsForCustomer(ctx.customerId, ctx.scope);
    const acks = await portalStorage.getDocumentAcks(docs.map((d) => d.id));
    const dto: PortalDocumentDto[] = docs.map((d) => {
      const ack = acks.get(d.id);
      return {
        id: d.id, reservationId: d.reservationId, documentType: d.documentType, kind: d.kind,
        fileName: d.fileName, uploadDate: d.uploadDate.toISOString(),
        ack: ack ? { by: ack.name, at: ack.ackedAt.toISOString() } : null,
      };
    });
    res.json(dto);
  });

  // "Gezien en akkoord" on a contract: recorded once, with name, time and address.
  app.post("/api/portal/documents/:id/ack", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const docs = await portalStorage.listDocumentsForCustomer(ctx.customerId, ctx.scope);
    const doc = docs.find((d) => d.id === id);
    if (!doc) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    const ack = await portalStorage.ackDocument({ documentId: id, customerId: ctx.customerId, portalUserId: ctx.user.id, name: ctx.user.fullName, ip: req.ip ?? null });
    await logPortalActivity(req, "document_acknowledged", { entity: "document", entityId: id, details: { fileName: doc.fileName, kind: doc.kind } });
    await notifyStaffOfPortalEvent({
      kind: "portal_document_ack",
      title: `Contract gezien en akkoord: ${doc.fileName}`,
      description: `${ctx.user.fullName} heeft ${doc.kind === "contract" ? "het contract" : "het document"} van reservering #${doc.reservationId ?? "?"} gezien en akkoord gegeven.`,
      link: doc.reservationId ? `/reservations/${doc.reservationId}` : undefined, customerId: ctx.customerId,
    });
    res.json({ by: ack.name, at: ack.ackedAt.toISOString() });
  });

  // ---- notifications for the customer -------------------------------------------------------
  app.get("/api/portal/notifications", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const rows = await customerNotifications.listForUser(ctx.customerId, ctx.user.id);
    res.json(rows.map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.description, link: n.link, isRead: n.isRead, createdAt: n.createdAt.toISOString() })));
  });
  app.get("/api/portal/notifications/unread-count", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    res.json({ count: await customerNotifications.countUnread(ctx.customerId, ctx.user.id) });
  });
  app.post("/api/portal/notifications/read", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const parsed = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid input");
    await customerNotifications.markRead(ctx.customerId, parsed.data.ids ?? "all", ctx.user.id);
    res.json({ ok: true });
  });

  app.get("/api/portal/documents/:id/download", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const doc = await portalStorage.getDocumentForCustomer(id, ctx.customerId, ctx.scope);
    const file = doc ? resolveDocumentFilePath(doc.filePath) : null;
    if (!doc || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    await logPortalActivity(req, "document_downloaded", { entity: "document", entityId: id });
    res.setHeader("Content-Type", doc.contentType || "application/octet-stream");
    const disposition = req.query.inline === "1" ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${sanitizeFilename(doc.fileName)}"`);
    fs.createReadStream(file).pipe(res);
  });

  // ---- fines ------------------------------------------------------------------
  app.get("/api/portal/fines", requirePortalUser, requireFeature("canViewFines"), async (req, res) => {
    const ctx = ctxOf(req);
    res.json((await finesStorage.listFinesForCustomer(ctx.customerId, ctx.scope)).map(toFineDto));
  });

  app.get("/api/portal/fines/:id", requirePortalUser, requireFeature("canViewFines"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const fine = await finesStorage.getFineForCustomer(id, ctx.customerId, ctx.scope);
    if (!fine) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Fine not found");
    res.json(toFineDto(fine));
  });

  app.get("/api/portal/fines/:id/letter", requirePortalUser, requireFeature("canViewFines"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const fine = await finesStorage.getFineForCustomer(id, ctx.customerId, ctx.scope);
    const file = fine?.letterFilePath ? resolveDocumentFilePath(fine.letterFilePath) : null;
    if (!fine || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Letter not found");
    await logPortalActivity(req, "fine_letter_downloaded", { entity: "fine", entityId: id });
    res.setHeader("Content-Type", file.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(path.basename(file))}"`);
    fs.createReadStream(file).pipe(res);
  });

  // ---- requests -----------------------------------------------------------------
  const requestScope = (req: Request) => (ctxOf(req).user.role === "driver" ? { portalUserId: ctxOf(req).user.id } : {});
  const attachmentUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => { const dir = path.join(uploadsDir, "portal-requests"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
      filename: (req, file, cb) => cb(null, `req_c${req.portalUser?.customerId ?? 0}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(sanitizeFilename(file.originalname))}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: createSecureMulterFilter("document"),
  });
  const requireRequests: RequestHandler[] = [requirePortalUser, requireFeature("canSubmitRequests")];

  app.get("/api/portal/requests", ...requireRequests, async (req, res) => {
    const ctx = ctxOf(req);
    res.json((await requestsStorage.listRequestsForCustomer(ctx.customerId, requestScope(req))).map((r) => toRequestDto(r, false)));
  });

  app.get("/api/portal/requests/:id", ...requireRequests, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequestForCustomer(id, ctxOf(req).customerId, requestScope(req));
    if (!row) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Request not found");
    res.json(toRequestDto(row, false));
  });

  // The customer adds to the conversation on an open request; staff see it in the inbox.
  app.post("/api/portal/requests/:id/messages", ...requireRequests, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const parsed = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Message is required");
    const row = await requestsStorage.getRequestForCustomer(id, ctx.customerId, requestScope(req));
    if (!row) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Request not found");
    if (row.status === "done" || row.status === "rejected") return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Deze aanvraag is afgehandeld; stuur een nieuwe aanvraag");
    const msg = await requestsStorage.addMessage({ requestId: id, author: "customer", authorName: ctx.user.fullName, body: parsed.data.body });
    await logPortalActivity(req, "request_message", { entity: "request", entityId: id });
    const customer = await storage.getCustomer(ctx.customerId);
    await notifyStaffOfPortalEvent({
      kind: "portal_request_message",
      title: `Reactie op aanvraag #${id}: ${customer?.companyName || customer?.name || ctx.customerId}`,
      description: parsed.data.body.slice(0, 200), link: `/portal-admin?request=${id}`, customerId: ctx.customerId,
    });
    res.status(201).json({ id: msg.id, author: "customer", authorName: msg.authorName, body: msg.body, createdAt: msg.createdAt.toISOString() });
  });

  // A customer may withdraw a request nobody has picked up yet.
  app.delete("/api/portal/requests/:id", ...requireRequests, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const row = await requestsStorage.getRequestForCustomer(id, ctx.customerId, requestScope(req));
    if (!row) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Request not found");
    if (row.status !== "new") return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Alleen een aanvraag die nog niet in behandeling is kan worden ingetrokken");
    const atts = await requestsStorage.deleteRequest(id);
    for (const a of atts) { const file = resolveDocumentFilePath(a.filePath); if (file) fs.rmSync(file, { force: true }); }
    await logPortalActivity(req, "request_withdrawn", { entity: "request", entityId: id, details: { type: row.type } });
    res.json({ ok: true });
  });

  app.get("/api/portal/requests/:id/attachments/:attachmentId", ...requireRequests, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const attachmentId = parseInt(req.params.attachmentId, 10);
    const row = await requestsStorage.getRequestForCustomer(id, ctxOf(req).customerId, requestScope(req));
    const att = row?.attachments.find((a) => a.id === attachmentId);
    const file = att ? resolveDocumentFilePath(att.filePath) : null;
    if (!att || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Attachment not found");
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(att.fileName)}"`);
    fs.createReadStream(file).pipe(res);
  });

  app.post("/api/portal/requests", ...requireRequests, (req, res, next) => {
    attachmentUpload.array("attachments", 5)(req, res, (err: any) => {
      if (err?.code === "LIMIT_FILE_COUNT" || err?.code === "LIMIT_UNEXPECTED_FILE") return portalError(res, 400, PORTAL_ERROR.ATTACHMENT_LIMIT, "At most 5 attachments");
      if (err) return portalError(res, 400, PORTAL_ERROR.VALIDATION, err.message ?? "Upload failed");
      next();
    });
  }, async (req, res) => {
    const ctx = ctxOf(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const discard = () => files.forEach((f) => fs.rmSync(f.path, { force: true }));
    const base = z.object({
      type: z.enum([PortalRequestType.BOOKING, PortalRequestType.EXTENSION, PortalRequestType.EARLY_RETURN, PortalRequestType.DAMAGE, PortalRequestType.MAINTENANCE, PortalRequestType.MAINTENANCE_CHANGE, PortalRequestType.MILEAGE, PortalRequestType.FINE_QUESTION, PortalRequestType.OTHER]),
      message: z.string().trim().min(1).max(4000),
      reservationId: z.coerce.number().int().positive().optional(),
      fineId: z.coerce.number().int().positive().optional(),
      payload: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "{}") : v ?? {}), z.record(z.unknown())),
    }).safeParse(req.body);
    if (!base.success) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, base.error.errors[0]?.message ?? "Invalid input"); }
    const { type, message, reservationId, fineId } = base.data;
    const payload = requestPayloadSchemas[type].safeParse(base.data.payload);
    if (!payload.success) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, payload.error.errors[0]?.message ?? "Invalid details"); }

    const needs = REQUEST_NEEDS[type];
    let reservation: PortalReservation | undefined;
    let block: Awaited<ReturnType<typeof storage.getReservation>> | undefined;
    if (needs === "reservation") {
      if (!reservationId) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, "reservationId is required"); }
      if (type === "maintenance_change") {
        // The linked reservation is the maintenance block; it is "ours" when we have the car on the road during it.
        block = await storage.getReservation(reservationId);
        const owner = block && block.type === "maintenance_block" && !block.deletedAt ? await findPortalCustomerForBlock(block) : null;
        if (!block || !owner || owner.customerId !== ctx.customerId) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Maintenance not found"); }
        if (ctx.scope.driverId && owner.rental.driverId !== ctx.scope.driverId) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Maintenance not found"); }
      } else {
        reservation = await portalStorage.getReservationForCustomer(reservationId, ctx.customerId, ctx.scope);
        if (!reservation) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found"); }
      }
    }
    if (needs === "fine") {
      if (!fineId || !(await finesStorage.getFineForCustomer(fineId, ctx.customerId, ctx.scope))) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Fine not found"); }
    }
    const today = new Date().toISOString().slice(0, 10);
    const p = payload.data as Record<string, string>;
    if (type === "booking") {
      // The blacklist is enforced here, whatever the client showed.
      if (!settingsFlags(ctx.settings, ctx.user).canBook) { discard(); return portalError(res, 403, PORTAL_ERROR.FEATURE_DISABLED, "Online booking is disabled for your account"); }
      const vehicleId = Number(p.vehicleId);
      const check = await portalStorage.canCustomerBookVehicle(vehicleId, ctx.customerId, { forPeriod: true });
      if (!check.ok) {
        discard();
        if (check.reason === "blocked") return portalError(res, 403, PORTAL_ERROR.VEHICLE_BLOCKED, "Dit voertuig is voor uw bedrijf niet beschikbaar");
        if (check.reason === "not_available") return portalError(res, 409, PORTAL_ERROR.VEHICLE_UNAVAILABLE, "Dit voertuig is op dit moment niet beschikbaar");
        return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Vehicle not offered online");
      }
      if (p.startDate < today) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "Start date must be today or later"); }
      if (p.endDate && p.endDate < p.startDate) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "End date must be after the start date"); }
      // Free in the requested period? (calendar, not just today's status)
      const busy = await portalStorage.listBusyVehicleIds(p.startDate, p.endDate || null);
      if (busy.has(vehicleId)) { discard(); return portalError(res, 409, PORTAL_ERROR.VEHICLE_UNAVAILABLE, "Dit voertuig is in deze periode niet beschikbaar"); }
      // One open request per vehicle and period.
      const duplicate = (await requestsStorage.listRequestsForCustomer(ctx.customerId, {})).find((r) =>
        r.type === "booking" && (r.status === "new" || r.status === "in_progress") && Number((r.payload as Record<string, unknown>).vehicleId) === vehicleId
        && overlaps(String((r.payload as Record<string, unknown>).startDate), String((r.payload as Record<string, unknown>).endDate || "") || null, p.startDate, p.endDate || null));
      if (duplicate) { discard(); return portalError(res, 409, PORTAL_ERROR.DUPLICATE_REQUEST, `Er staat al een aanvraag (#${duplicate.id}) open voor dit voertuig in deze periode`); }
      // Driver: chosen by an admin, or the driver-role user themself.
      const driverId = p.driverId ? Number(p.driverId) : ctx.user.role === "driver" && ctx.user.driverId ? ctx.user.driverId : null;
      if (driverId) {
        const driver = await portalStorage.getDriverForCustomer(driverId, ctx.customerId);
        if (!driver || driver.status !== "active") { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found"); }
        p.driverId = String(driver.id);
        p.driverLabel = driver.displayName;
      }
      p.vehicleLabel = `${check.vehicle.brand} ${check.vehicle.model} · ${check.vehicle.licensePlate}`;
    }
    if (type === "extension" && reservation?.endDate && p.newEndDate <= reservation.endDate) {
      discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "New end date must be after the current end date");
    }
    if (type === "early_return" && !settingsFlags(ctx.settings, ctx.user).canReturn) {
      discard(); return portalError(res, 403, PORTAL_ERROR.FEATURE_DISABLED, "Returning a vehicle early is disabled for your account");
    }
    if (type === "early_return" && reservation && (p.returnDate < today || (reservation.endDate && p.returnDate >= reservation.endDate))) {
      discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "Return date must be before the current end date");
    }
    if (type === "maintenance" || type === "maintenance_change") {
      const openSame = (await requestsStorage.listRequestsForCustomer(ctx.customerId, {})).find((r) => r.type === type && r.reservationId === reservationId && (r.status === "new" || r.status === "in_progress"));
      if (openSame) { discard(); return portalError(res, 409, PORTAL_ERROR.DUPLICATE_REQUEST, `Er staat al een aanvraag (#${openSame.id}) open hiervoor`); }
    }
    if (type === "maintenance" && p.preferredDate && p.preferredDate < today) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "Preferred date must be today or later"); }
    if (type === "maintenance_change" && block) {
      if (!canCustomerChangeMaintenance(block)) { discard(); return portalError(res, 400, PORTAL_ERROR.MAINTENANCE_TOO_LATE, "Maintenance starts within 48 hours"); }
      if (p.newDate <= today) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "New date must be tomorrow or later"); }
    }

    for (const f of files) {
      const check = await validateAfterUpload(f.path, f.originalname, f.mimetype, "document");
      if (!check.valid) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, check.error ?? "Invalid file"); }
    }
    const created = await requestsStorage.createRequest({
      customerId: ctx.customerId, portalUserId: ctx.user.id, type,
      reservationId: needs === "reservation" ? reservationId! : null,
      fineId: needs === "fine" ? fineId! : null,
      payload: payload.data as Record<string, unknown>, message,
    });
    for (const f of files) {
      await requestsStorage.addAttachment({ requestId: created.id, fileName: sanitizeFilename(f.originalname), filePath: path.relative(process.cwd(), f.path), contentType: f.mimetype, fileSize: f.size });
    }
    await logPortalActivity(req, "request_submitted", { entity: "request", entityId: created.id, details: { type } });
    const customer = await storage.getCustomer(ctx.customerId);
    const isMaint = type === "maintenance" || type === "maintenance_change";
    const plate = reservation?.vehicle?.licensePlate ?? (block?.vehicleId ? (await storage.getVehicle(block.vehicleId))?.licensePlate : undefined);
    await notifyStaffOfPortalEvent({
      kind: isMaint ? "portal_maintenance" : "portal_request",
      title: isMaint
        ? `${type === "maintenance" ? "Onderhoudsmelding" : "Wijziging onderhoud"} ${plate ?? ""}${(p.urgent as unknown) === true || p.urgent === "true" ? " (dringend)" : ""}: ${customer?.companyName || customer?.name || ctx.customerId}`
        : `Nieuwe aanvraag (${REQUEST_LABEL[type]}${type === "booking" ? ` ${p.vehicleLabel}` : ""}): ${customer?.companyName || customer?.name || ctx.customerId}`,
      description: message.slice(0, 200), link: `/portal-admin?request=${created.id}`, customerId: ctx.customerId,
      priority: isMaint && ((p.urgent as unknown) === true || p.urgent === "true") ? "high" : "normal",
    });
    const row = await requestsStorage.getRequest(created.id);
    res.status(201).json(toRequestDto(row!, false));
  });

  // The vehicles the customer has on the road, with maintenance and replacement state.
  app.get("/api/portal/vehicles/mine", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    res.json(await listMyVehicles(ctx.customerId, ctx.scope));
  });

  // ---- vehicles offered online -------------------------------------------------
  // ?start=YYYY-MM-DD[&end=YYYY-MM-DD]: only vehicles free in that period (calendar checked).
  app.get("/api/portal/vehicles", requirePortalUser, requireFeature("canBook"), async (req, res) => {
    const ctx = ctxOf(req);
    // The client sends end= (empty) for an open end.
    const day = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional();
    const period = z.object({ start: day, end: day }).safeParse(req.query);
    if (!period.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Use YYYY-MM-DD");
    const start = period.data.start || undefined, end = period.data.end || undefined;
    if (start && end && end < start) return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "End date must be after the start date");
    let rows = await portalStorage.listOnlineVehiclesForCustomer(ctx.customerId, { forPeriod: Boolean(start) });
    if (start) {
      const busy = await portalStorage.listBusyVehicleIds(start, end ?? null);
      rows = rows.filter((v) => !busy.has(v.id));
    }
    const showPrices = settingsFlags(ctx.settings, ctx.user).showPrices;
    res.json(rows.map((v) => ({
      id: v.id, licensePlate: v.licensePlate, brand: v.brand, model: v.model, vehicleType: v.vehicleType, fuel: v.fuel,
      availabilityStatus: v.availabilityStatus, description: v.onlineDescription,
      ...(showPrices ? { dailyPrice: v.dailyPrice, monthlyPrice: v.monthlyPrice } : {}),
    })));
  });

  // ---- drivers ----------------------------------------------------------------
  const manageDrivers: RequestHandler[] = [requirePortalUser, requireFeature("canManageDrivers"), requirePortalRole("admin")];

  app.get("/api/portal/drivers", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const rows = await portalStorage.listDriversForCustomer(ctx.customerId);
    res.json(rows.map(toDriverDto));
  });

  app.post("/api/portal/drivers", ...manageDrivers, async (req, res) => {
    const ctx = ctxOf(req);
    const parsed = driverInputSchema.safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    // Quick add on the customer side: a name plus one way to reach the driver.
    if (!parsed.data.email && !parsed.data.phone?.trim()) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Vul een e-mailadres of telefoonnummer in");
    const driver = await storage.createDriver({ ...parsed.data, customerId: ctx.customerId, status: "active", createdBy: ctx.user.email, updatedBy: ctx.user.email });
    await logPortalActivity(req, "driver_created", { entity: "driver", entityId: driver.id });
    res.status(201).json(toDriverDto(driver));
  });

  app.patch("/api/portal/drivers/:id", ...manageDrivers, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const existing = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    if (!existing) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found");
    const parsed = driverInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const driver = await storage.updateDriver(id, { ...parsed.data, updatedBy: ctx.user.email });
    await logPortalActivity(req, "driver_updated", { entity: "driver", entityId: id, details: parsed.data });
    res.json(toDriverDto(driver!));
  });

  // No hard delete from the portal: deactivate via PATCH status=inactive.
  app.delete("/api/portal/drivers/:id", requirePortalUser, (_req, res) => portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Not available"));

  const licenseUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(uploadsDir, "drivers");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(sanitizeFilename(file.originalname));
        cb(null, `license_customer${req.portalUser?.customerId ?? "portal"}_${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter("document"),
  });

  app.post("/api/portal/drivers/:id/license", ...manageDrivers, licenseUpload.single("licenseFile"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const existing = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    if (!existing) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found");
    if (!req.file) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "No file uploaded");
    const check = await validateAfterUpload(req.file.path, req.file.originalname, req.file.mimetype, "document");
    if (!check.valid) { fs.rmSync(req.file.path, { force: true }); return portalError(res, 400, PORTAL_ERROR.VALIDATION, check.error ?? "Invalid file"); }
    const driver = await storage.updateDriver(id, { licenseFilePath: path.relative(process.cwd(), req.file.path), updatedBy: ctx.user.email });
    await logPortalActivity(req, "driver_license_uploaded", { entity: "driver", entityId: id });
    res.json(toDriverDto(driver!));
  });

  app.get("/api/portal/drivers/:id/license", ...manageDrivers, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const driver = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    const file = driver?.licenseFilePath ? resolveDocumentFilePath(driver.licenseFilePath) : null;
    if (!driver || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "No licence file");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(path.basename(file))}"`);
    fs.createReadStream(file).pipe(res);
  });
}
