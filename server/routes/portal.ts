import type { Express, RequestHandler, Request, Response } from "express";
// FIX-R (BUG-086): multer parses the multipart body inside the route chain,
// long after app.use(sanitizeInput) ran — so these wrappers sanitize what it
// parsed.
import { sanitizeUploadedFields } from "../middleware/security/sanitization";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
import { registerPortalFiscalRoutes } from "./portal-fiscal";
import { registerPortalColleagueRoutes } from "./portal-colleagues";
import { addressLookupHandler } from "./address-lookup";
import { addressLookupLimiter, portalSignLimiter } from "../middleware/security/rateLimiter.js";
import { signingStates, sha256OfDocument, signContract, signedCopyIntegrity } from "../services/contract-signing";
import { signContractSchema, SIGNABLE_LABEL_NL } from "../../shared/contract-signing";
import { PORTAL_MAIL_PHRASES } from "../services/portal-mail-texts";
import { sendContractSignedMails } from "../services/portal-mail";
import { AuditLogger } from "../utils/security/auditLogger";
import { formatDateForLanguage, formatDateTimeForLanguage } from "../utils/locale-format";
import { officeTimeZone } from "../services/office-time";
import { portalStorage, type PortalReservation } from "../services/portal-storage";
import { overlaps, isWeekend } from "../services/booking-period";
import { customerNotifications, type NotificationViewer } from "../services/portal-customer-notifications";
import { getServiceDueVehicles } from "../utils/service-due-scanner";
import { setSafeFileHeaders } from "../utils/portal-files";
import { handoverOf } from "../../shared/portal-handover";
import { settingsFlags, requireFeature, requirePortalRole, portalError, logPortalActivity, type PortalRequestContext } from "../portal-auth";
import { assignDriverToReservation, getDriverAssignments } from "../services/driver-assignments";
import { notifyStaffOfPortalEvent } from "../services/portal-notifications";
import { resolveDocumentFilePath, getRelativePath } from "../services/document-paths";
import { createSecureMulterFilter, sanitizeFilename, validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { storage } from "../storage";
import { CUSTOMER_UPLOAD_DOCUMENT_TYPE, CUSTOMER_UPLOAD_MAX_BYTES, type PortalUploadDto } from "../../shared/portal-types";
import { realtimeEvents } from "../realtime-events";
import type { Document } from "../../shared/schema";
import { PORTAL_ERROR, type PortalReservationDto, type PortalDocumentDto, type PortalDriverDto, type PortalSigningInfoDto } from "../../shared/portal-types";
import type { Driver } from "../../shared/schema";
import { finesStorage, type FineListRow } from "../services/fines-storage";
import type { PortalFineDto } from "../../shared/fines";
import { requestsStorage, toRequestDto } from "../services/portal-requests-storage";
import { requestPayloadSchemas, REQUEST_NEEDS, PortalRequestType } from "../../shared/portal-requests";
import { listMyVehicles } from "../services/portal-vehicles";
import { findPortalCustomerForBlock, canCustomerChangeMaintenance } from "../services/portal-maintenance-events";
import { cancellationState } from "../services/portal-cancellation";
import { installAsyncErrorHandling } from "../middleware/asyncHandler.js";
import { vehicleName } from "../../shared/vehicle-name";
import { SUPPORTED_LANGUAGES } from "../../shared/languages";

export function toFineDto(f: FineListRow): PortalFineDto {
  return {
    id: f.id, licensePlate: f.licensePlate, offenceAt: f.offenceAt.toISOString(), description: f.description, reference: f.reference,
    amount: f.amount, adminFee: f.adminFee, totalAmount: f.totalAmount, status: f.status as PortalFineDto["status"],
    customerNote: f.customerNote, driver: f.driverId ? { id: f.driverId, displayName: f.driverName ?? "" } : null,
    reservationId: f.reservationId, hasLetter: Boolean(f.letterFilePath), createdAt: f.createdAt.toISOString(),
  };
}

const REQUEST_LABEL: Record<string, string> = { booking: "huuraanvraag", extension: "verlenging", early_return: "eerder inleveren", damage: "schademelding", maintenance: "onderhoudsmelding", maintenance_change: "wijziging onderhoud", mileage: "kilometerstand", fine_question: "vraag over bekeuring", company_name_change: "wijziging bedrijfsnaam", cancellation: "annulering", other: "overig" };

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
    handover: handoverOf(r),
  };
  // Prices are omitted entirely (not nulled) unless the customer's switch is on.
  if (showPrices) dto.totalPrice = r.totalPrice;
  return dto;
}

/** Streams a file; a read error ends the response instead of crashing the process. */
function streamFile(file: string, res: import("express").Response): void {
  const stream = fs.createReadStream(file);
  stream.on("error", (error) => {
    console.error("portal file stream failed:", error.message);
    if (!res.headersSent) res.status(404).json({ code: PORTAL_ERROR.NOT_FOUND, message: "File not available" });
    else res.destroy();
  });
  stream.pipe(res);
}

/**
 * The history of who drove a rental: names and dates, plus the customer's own note. The staff user ids and the
 * staff-written notes ("portal request #12") stay on the server.
 */
export function toDriverHistoryDto(rows: Array<{ id: number; driverId: number | null; driverName: string | null; assignedFrom: string | Date; assignedUntil: string | Date | null; note: string | null; assignedByPortalUserId: number | null }>) {
  return rows.map((a) => ({
    id: a.id, driverId: a.driverId, driverName: a.driverName,
    assignedFrom: a.assignedFrom instanceof Date ? a.assignedFrom.toISOString() : a.assignedFrom,
    assignedUntil: a.assignedUntil instanceof Date ? a.assignedUntil.toISOString() : a.assignedUntil,
    note: a.assignedByPortalUserId ? a.note : null,
  }));
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
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

function idParam(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid id"); return null; }
  return id;
}

export function registerPortalRoutes(app: Express, deps: PortalRouteDeps): void {
  // FIX-A (BUG-002): a rejected handler promise must become a 400/500 on that
  // request, never an unhandledRejection that takes the whole process down.
  installAsyncErrorHandling();
  const { requirePortalUser, uploadsDir } = deps;
  const ctxOf = (req: Request) => req.portalUser!;
  // Fiscal mobility check (docs/fiscaal): the customer side, in this same realm.
  registerPortalFiscalRoutes(app, { requirePortalUser });
  registerPortalColleagueRoutes(app, { requirePortalUser });
  // Same lookup as the staff app, behind the portal session.
  app.get("/api/portal/address-lookup", requirePortalUser, addressLookupLimiter, addressLookupHandler);

  // ---- reservations ---------------------------------------------------------
  app.get("/api/portal/reservations", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const rows = await portalStorage.listReservationsForCustomer(ctx.customerId, ctx.scope);
    res.json(rows.map((r) => toReservationDto(r, settingsFlags(ctx.settings, ctx.user).showPrices)));
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
    const openCancel = r.status === "booked"
      ? (await requestsStorage.listRequestsForCustomer(ctx.customerId, {})).find((q) => q.type === "cancellation" && q.reservationId === r.id && (q.status === "new" || q.status === "in_progress"))
      : undefined;
    res.json({
      ...toReservationDto(r, settingsFlags(ctx.settings, ctx.user).showPrices), driverHistory: toDriverHistoryDto(history), serviceDue,
      cancellation: cancellationState(r, openCancel?.id ?? null),
    });
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
    res.json({ ...toReservationDto(updated!, settingsFlags(ctx.settings, ctx.user).showPrices), driverHistory: toDriverHistoryDto(await getDriverAssignments(id)) });
  });

  // ---- documents ------------------------------------------------------------
  app.get("/api/portal/documents", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const ctx = ctxOf(req);
    const docs = await portalStorage.listDocumentsForCustomer(ctx.customerId, ctx.scope);
    const acks = await portalStorage.getDocumentAcks(docs.map((d) => d.id));
    const signing = await signingStates(docs);
    const dto: PortalDocumentDto[] = docs.map((d) => {
      const ack = acks.get(d.id);
      return {
        id: d.id, reservationId: d.reservationId, documentType: d.documentType, kind: d.kind,
        fileName: d.fileName, uploadDate: d.uploadDate.toISOString(),
        ack: ack ? { by: ack.name, at: ack.ackedAt.toISOString() } : null,
        signing: signing.get(d.id) ?? null,
      };
    });
    res.json(dto);
  });

  // ---- signing a contract or damage form (Kees, 2026-10-18) ------------------------------------
  // Every route looks the document up through getDocumentForCustomer, so another customer's id is a
  // 404 exactly like an id that does not exist. Only administrators sign; drivers may look.
  app.get("/api/portal/documents/:id/signing", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const doc = await portalStorage.getDocumentForCustomer(id, ctx.customerId, ctx.scope);
    if (!doc) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    const state = (await signingStates([doc, ...(await portalStorage.listDocumentsForCustomer(ctx.customerId, ctx.scope)).filter((d) => d.id !== doc.id && d.reservationId === doc.reservationId)])).get(doc.id);
    const sha256 = await sha256OfDocument(doc);
    if (!state || !sha256) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    const info: PortalSigningInfoDto = {
      documentId: doc.id, status: state.status, sha256,
      canSign: state.status === "to_sign" && ctx.user.role === "admin",
      signerName: ctx.user.fullName,
    };
    res.json(info);
  });

  app.post("/api/portal/documents/:id/sign", requirePortalUser, requireFeature("canViewContracts"), requirePortalRole("admin"), portalSignLimiter, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const parsed = signContractSchema.safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Name, agreement, signature and document fingerprint are required");
    const doc = await portalStorage.getDocumentForCustomer(id, ctx.customerId, ctx.scope);
    if (!doc) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    const customer = await storage.getCustomer(ctx.customerId);
    const userAgent = req.get("user-agent") ?? null;
    const result = await signContract({
      doc, customerId: ctx.customerId, companyName: customer?.companyName || customer?.name || null,
      signer: { id: ctx.user.id, email: ctx.user.email }, input: parsed.data,
      ip: req.ip ?? null, userAgent, language: ctx.user.language ?? null,
    });
    if (!result.ok) {
      await logPortalActivity(req, "contract_sign_refused", { entity: "document", entityId: id, details: { code: result.code } });
      return portalError(res, result.status, result.code === "FILE_MISSING" ? PORTAL_ERROR.NOT_FOUND : PORTAL_ERROR[result.code], result.message);
    }
    const { signature, signedDocument, kind } = result;
    const labelNl = SIGNABLE_LABEL_NL[kind];
    // From here the signature exists. Logging and telling people about it must never turn a signed
    // contract into an error for the customer: each step stands on its own.
    const safely = async (what: string, step: () => Promise<unknown>) => {
      try { await step(); } catch (e) { console.error(`contract signed: ${what} failed:`, (e as Error).message); }
    };
    await safely("portal activity", () => logPortalActivity(req, "contract_signed", {
      entity: "document", entityId: id,
      details: { signatureId: signature.id, signedDocumentId: signedDocument.id, reservationId: doc.reservationId, originalSha256: signature.originalSha256, signedSha256: signature.signedSha256 },
    }));
    // The staff activity log too, so "who signed what" is in the same place as every office action.
    await safely("audit log", () => AuditLogger.log({
      username: `portaal:${ctx.user.email}`, action: "portal.contract_signed", resourceType: "document", resourceId: String(signedDocument.id),
      details: { signatureId: signature.id, originalDocumentId: id, reservationId: doc.reservationId, customerId: ctx.customerId, signerName: signature.signerName },
      ipAddress: req.ip ?? undefined, userAgent: userAgent ?? undefined,
    }));
    const reservation = doc.reservationId ? await portalStorage.getReservationForCustomer(doc.reservationId, ctx.customerId, ctx.scope).catch(() => undefined) : undefined;
    const plate = reservation?.vehicle?.licensePlate ?? `#${doc.reservationId}`;
    await safely("staff notification", () => notifyStaffOfPortalEvent({
      kind: "portal_contract_signed",
      title: `${labelNl} getekend: ${plate}`,
      description: `${signature.signerName} (${ctx.user.email}) heeft ${kind === "contract" ? "het contract" : "de schadecheck"} van reservering #${doc.reservationId} digitaal getekend in het klantenportaal.`,
      link: `/reservations/edit/${doc.reservationId}`, customerId: ctx.customerId,
    }));
    await safely("customer notification", () => customerNotifications.notify({
      customerId: ctx.customerId, type: "contract_signed",
      title: `${labelNl} getekend: ${plate}`,
      description: `${signature.signerName} heeft ${kind === "contract" ? "het contract" : "de schadecheck"} digitaal getekend. Het getekende exemplaar staat bij uw documenten.`,
      params: { plate, signer: signature.signerName, at: signature.signedAt.toISOString(), documentKind: kind === "contract" ? "contract" : "damageCheck" },
      link: "/documenten", dedupeTag: `signed:${signature.id}`, dedupeDays: 365,
    }));
    await safely("mail", () => sendContractSignedMails(ctx.customerId, ctx.user, (language) => ({
      plate, signer: signature.signerName,
      document: PORTAL_MAIL_PHRASES[language].document[kind === "contract" ? "contract" : "damageCheck"],
      at: formatDateTimeForLanguage(signature.signedAt, language, officeTimeZone()),
      car: reservation?.vehicle ? `${vehicleName(reservation.vehicle.brand, reservation.vehicle.model)} ${reservation.vehicle.licensePlate}` : "-",
      period: [reservation?.startDate, reservation?.endDate].filter(Boolean).map((d) => formatDateForLanguage(d!, language)).join(" - ") || "-",
    })));
    res.status(201).json({ signedDocumentId: signedDocument.id, signedBy: signature.signerName, signedAt: signature.signedAt.toISOString() });
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
      link: doc.reservationId ? `/reservations/edit/${doc.reservationId}` : undefined, customerId: ctx.customerId,
    });
    res.json({ by: ack.name, at: ack.ackedAt.toISOString() });
  });

  // ---- exports (Kees, 2026-10-18) -----------------------------------------------------------------
  // The CSV is built in the browser from what the customer already sees; this only writes down who
  // exported which list and how many rows, like the office's own activity log does for staff exports.
  app.post("/api/portal/exports", requirePortalUser, async (req, res) => {
    const parsed = z.object({ list: z.enum(["vehicles", "drivers", "reservations"]), rows: z.number().int().min(0).max(100_000) }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid export");
    if (parsed.data.list === "drivers" && ctxOf(req).user.role !== "admin") return portalError(res, 403, PORTAL_ERROR.ROLE_FORBIDDEN, "Not allowed for your role");
    await logPortalActivity(req, "export", { details: parsed.data });
    res.json({ ok: true });
  });

  // ---- notifications for the customer -------------------------------------------------------
  // A driver account only hears about the rentals it drives: null = no restriction (admin accounts).
  async function driverReservationIds(ctx: PortalRequestContext): Promise<Set<number> | null> {
    if (!ctx.scope.driverId) return null;
    return new Set((await portalStorage.listReservationsForCustomer(ctx.customerId, ctx.scope)).map((r) => r.id));
  }
  // Also per feature: no fine notices without fines, no document notices without contracts, no request replies without requests.
  async function notificationViewer(ctx: PortalRequestContext): Promise<NotificationViewer> {
    const f = settingsFlags(ctx.settings, ctx.user);
    return {
      driverReservationIds: await driverReservationIds(ctx),
      allowType: (type) => !(type.startsWith("fine") && !f.canViewFines) && !((type === "document_available" || type.startsWith("contract_")) && !f.canViewContracts) && !(type.startsWith("request_") && !f.canSubmitRequests)
        // Only administrators sign, so only they are asked to.
        && !(type === "contract_to_sign" && ctx.user.role !== "admin"),
    };
  }
  app.get("/api/portal/notifications", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const rows = await customerNotifications.listForUser(ctx.customerId, ctx.user.id, 100, await notificationViewer(ctx));
    res.json(rows.map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.description, params: n.params ?? null, link: n.link, isRead: n.isRead, createdAt: n.createdAt.toISOString() })));
  });
  app.get("/api/portal/notifications/unread-count", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    res.json({ count: await customerNotifications.countUnread(ctx.customerId, ctx.user.id, await notificationViewer(ctx)) });
  });
  app.post("/api/portal/notifications/read", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const parsed = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid input");
    await customerNotifications.markRead(ctx.customerId, parsed.data.ids ?? "all", ctx.user.id, await notificationViewer(ctx));
    res.json({ ok: true });
  });

  app.get("/api/portal/documents/:id/download", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const doc = await portalStorage.getDocumentForCustomer(id, ctx.customerId, ctx.scope);
    const file = doc ? resolveDocumentFilePath(doc.filePath) : null;
    if (!doc || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    // A contract signed in the portal is only handed out as it was signed (its hash is on the audit row).
    if ((await signedCopyIntegrity(id)) === "changed") {
      await AuditLogger.log({ username: `portaal:${ctx.user.email}`, action: "portal.signed_contract_changed", resourceType: "document", resourceId: String(id), status: "failure", details: { customerId: ctx.customerId } });
      return portalError(res, 409, PORTAL_ERROR.DOCUMENT_CHANGED, "This signed contract no longer matches its signature. Please contact us.");
    }
    await logPortalActivity(req, "document_downloaded", { entity: "document", entityId: id });
    setSafeFileHeaders(res, doc.contentType, doc.fileName, req.query.inline === "1", sanitizeFilename(doc.fileName));
    streamFile(file, res);
  });

  // ---- documents the customer uploads (Kees, 2026-10-18) -------------------------------------------
  // PDF, JPG or PNG up to 10 MB with a description, on a reservation the user may see: an admin any of
  // the company's, a driver only their own car (the portal scope). The file lands in the office's
  // documents next to the reservation's contract, under <uploads>/<PLATE>/customer_upload/; staff
  // are told. The content is checked, not just the name.
  const toUploadDto = (d: Document): PortalUploadDto => ({
    id: d.id, reservationId: d.reservationId!, fileName: d.fileName, contentType: d.contentType, fileSize: d.fileSize,
    description: d.notes ?? "", uploadedAt: new Date(d.uploadDate).toISOString(),
  });
  const customerUpload = sanitizeUploadedFields(multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(uploadsDir, "portal-uploads", "incoming");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(sanitizeFilename(file.originalname)).toLowerCase();
        cb(null, `upload_c${req.portalUser?.customerId ?? "portal"}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: CUSTOMER_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: createSecureMulterFilter("document"),
  }));

  app.get("/api/portal/reservations/:id/uploads", requirePortalUser, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    if (!(await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope))) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found");
    res.json((await portalStorage.listUploadsForReservation(id)).map(toUploadDto));
  });

  app.post("/api/portal/reservations/:id/uploads", requirePortalUser,
    (req, res, next) => customerUpload.single("file")(req, res, (err: any) => {
      if (!err) return next();
      if (err?.code === "LIMIT_FILE_SIZE") return portalError(res, 400, PORTAL_ERROR.FILE_TOO_LARGE, "The file is larger than 10 MB");
      return portalError(res, 400, PORTAL_ERROR.VALIDATION, err?.message ?? "Invalid file");
    }),
    async (req, res) => {
      const file = req.file;
      const discard = () => { if (file) fs.rmSync(file.path, { force: true }); };
      const id = idParam(req, res); if (id === null) { discard(); return; }
      const ctx = ctxOf(req);
      const reservation = await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope);
      if (!reservation) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found"); }
      if (reservation.status === "cancelled") { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, "This reservation is cancelled"); }
      if (!file) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "No file uploaded");
      const description = z.string().trim().min(1).max(300).safeParse(req.body?.description);
      if (!description.success) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, "A description is required"); }
      const check = await validateAfterUpload(file.path, file.originalname, file.mimetype, "document");
      if (!check.valid) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, check.error ?? "Invalid file"); }

      // Filed like the office's own documents: per plate, then per type.
      const plate = (reservation.vehicle?.licensePlate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const folder = path.join(uploadsDir, plate || "portal-uploads", "customer_upload");
      fs.mkdirSync(folder, { recursive: true });
      const ext = path.extname(file.path);
      const stored = path.join(folder, `${plate || `RES${id}`}_CustomerUpload_${new Date().toISOString().slice(0, 10)}_${Date.now()}${ext}`);
      fs.renameSync(file.path, stored);
      const doc = await storage.createDocument({
        vehicleId: reservation.vehicleId ?? null, reservationId: id, documentType: CUSTOMER_UPLOAD_DOCUMENT_TYPE,
        fileName: sanitizeFilename(file.originalname), filePath: getRelativePath(stored), fileSize: file.size,
        contentType: check.detectedMimeType ?? file.mimetype, notes: description.data, createdBy: `portaal:${ctx.user.email}`,
      } as any);
      realtimeEvents.documents.created(doc);
      await logPortalActivity(req, "document_uploaded", { entity: "document", entityId: doc.id, details: { reservationId: id, fileName: doc.fileName } });
      await AuditLogger.log({
        username: `portaal:${ctx.user.email}`, action: "portal.document_uploaded", resourceType: "document", resourceId: String(doc.id),
        details: { customerId: ctx.customerId, reservationId: id, fileName: doc.fileName, fileSize: doc.fileSize }, ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined,
      }).catch((e: Error) => console.error("portal upload audit failed:", e.message));
      const customer = await storage.getCustomer(ctx.customerId);
      await notifyStaffOfPortalEvent({
        kind: "portal_document_upload",
        title: `Document van klant${reservation.vehicle?.licensePlate ? ` (${reservation.vehicle.licensePlate})` : ""}: ${customer?.companyName || customer?.name || ctx.customerId}`,
        description: `${description.data} · ${doc.fileName}`.slice(0, 200), link: `/reservations/edit/${id}`, customerId: ctx.customerId,
      });
      res.status(201).json(toUploadDto(doc));
    });

  app.get("/api/portal/uploads/:id/file", requirePortalUser, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const doc = await portalStorage.getUploadForCustomer(id, ctx.customerId, ctx.scope);
    const file = doc ? resolveDocumentFilePath(doc.filePath) : null;
    if (!doc || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    await logPortalActivity(req, "document_downloaded", { entity: "document", entityId: id });
    setSafeFileHeaders(res, doc.contentType, doc.fileName, req.query.inline === "1", sanitizeFilename(doc.fileName));
    streamFile(file, res);
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
    setSafeFileHeaders(res, null, file, true, sanitizeFilename(path.basename(file)));
    streamFile(file, res);
  });

  // ---- requests -----------------------------------------------------------------
  const requestScope = (req: Request) => (ctxOf(req).user.role === "driver" ? { portalUserId: ctxOf(req).user.id } : {});
  const attachmentUpload = sanitizeUploadedFields(multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => { const dir = path.join(uploadsDir, "portal-requests"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
      filename: (req, file, cb) => cb(null, `req_c${req.portalUser?.customerId ?? 0}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(sanitizeFilename(file.originalname))}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: createSecureMulterFilter("document"),
  }));
  const requireRequests: RequestHandler[] = [requirePortalUser, requireFeature("canSubmitRequests")];

  // Before anything is written to disk: one customer cannot pile up open requests (each one also mails staff).
  const MAX_OPEN_REQUESTS = 30;
  const MAX_MESSAGES_PER_REQUEST = 200;
  const capOpenRequests: RequestHandler = async (req, res, next) => {
    if ((await requestsStorage.countOpenForCustomer(ctxOf(req).customerId)) >= MAX_OPEN_REQUESTS) {
      return portalError(res, 429, PORTAL_ERROR.TOO_MANY_OPEN, "Too many open requests");
    }
    next();
  };


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
    if (row.messages.length >= MAX_MESSAGES_PER_REQUEST) return portalError(res, 429, PORTAL_ERROR.TOO_MANY_OPEN, "Too many messages on this request");
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
    // One statement checks the status again: a request staff took in the meantime is not deleted.
    const atts = await requestsStorage.deleteRequestIfStatus(id, "new");
    if (!atts) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Alleen een aanvraag die nog niet in behandeling is kan worden ingetrokken");
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
    setSafeFileHeaders(res, att.contentType, att.fileName, true, sanitizeFilename(att.fileName));
    streamFile(file, res);
  });

  app.post("/api/portal/requests", ...requireRequests, capOpenRequests, (req, res, next) => {
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
      type: z.enum([PortalRequestType.BOOKING, PortalRequestType.EXTENSION, PortalRequestType.EARLY_RETURN, PortalRequestType.DAMAGE, PortalRequestType.MAINTENANCE, PortalRequestType.MAINTENANCE_CHANGE, PortalRequestType.MILEAGE, PortalRequestType.FINE_QUESTION, PortalRequestType.CANCELLATION, PortalRequestType.OTHER]),
      message: z.string().trim().min(1).max(4000),
      reservationId: z.coerce.number().int().positive().optional(),
      fineId: z.coerce.number().int().positive().optional(),
      // BUG-002: a bare JSON.parse here threw a SyntaxError that zod's safeParse
      // does not catch, which escaped the async handler and killed the process.
      // ctx.addIssue + z.NEVER turns it into the 400 the adjacent "valid JSON but
      // not an object" case already produced.
      payload: z.preprocess((v, ctx) => {
        if (typeof v !== "string") return v ?? {};
        try {
          return JSON.parse(v || "{}");
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "payload is not valid JSON" });
          return z.NEVER;
        }
      }, z.record(z.unknown())),
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
      if (!settingsFlags(ctx.settings, ctx.user).canViewFines) { discard(); return portalError(res, 403, PORTAL_ERROR.FEATURE_DISABLED, "Fines are not available for your account"); }
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
      // A driver account books for itself only, whatever driverId the client sent; labels are never taken from the client.
      delete p.driverLabel;
      const driverId = ctx.user.role === "driver" ? (ctx.user.driverId ?? null) : p.driverId ? Number(p.driverId) : null;
      if (!driverId) delete p.driverId;
      if (driverId) {
        const driver = await portalStorage.getDriverForCustomer(driverId, ctx.customerId);
        if (!driver || driver.status !== "active") { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found"); }
        p.driverId = String(driver.id);
        p.driverLabel = driver.displayName;
      }
      p.vehicleLabel = `${vehicleName(check.vehicle.brand, check.vehicle.model)} · ${check.vehicle.licensePlate}`;
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
    if (type === "cancellation" && reservation) {
      const state = cancellationState(reservation, null);
      if (state.reason === "too_late") { discard(); return portalError(res, 400, PORTAL_ERROR.CANCEL_TOO_LATE, "Cancelling is possible until 48 hours before the start"); }
      if (!state.allowed) { discard(); return portalError(res, 400, PORTAL_ERROR.CANCEL_NOT_ALLOWED, "Only a booked reservation that has not started can be cancelled"); }
    }
    if (type === "maintenance" || type === "maintenance_change" || type === "cancellation") {
      const openSame = (await requestsStorage.listRequestsForCustomer(ctx.customerId, {})).find((r) => r.type === type && r.reservationId === reservationId && (r.status === "new" || r.status === "in_progress"));
      if (openSame) { discard(); return portalError(res, 409, PORTAL_ERROR.DUPLICATE_REQUEST, `Er staat al een aanvraag (#${openSame.id}) open hiervoor`); }
    }
    if (type === "maintenance" && p.preferredDate && p.preferredDate < today) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "Preferred date must be today or later"); }
    if (type === "maintenance" && p.preferredDate && isWeekend(p.preferredDate)) { discard(); return portalError(res, 400, PORTAL_ERROR.MAINTENANCE_WEEKEND, "Weekend"); }
    if (type === "maintenance_change" && block) {
      if (!canCustomerChangeMaintenance(block)) { discard(); return portalError(res, 400, PORTAL_ERROR.MAINTENANCE_TOO_LATE, "Maintenance starts within 48 hours"); }
      if (p.newDate <= today) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "New date must be tomorrow or later"); }
      if (isWeekend(p.newDate)) { discard(); return portalError(res, 400, PORTAL_ERROR.MAINTENANCE_WEEKEND, "Weekend"); }
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
      await requestsStorage.addAttachment({ requestId: created.id, fileName: sanitizeFilename(f.originalname), filePath: getRelativePath(f.path), contentType: f.mimetype, fileSize: f.size });
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
    res.json(await listMyVehicles(ctx.customerId, ctx.scope, requestScope(req)));
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

  // Only the screens of an admin with the drivers switch read this list; a driver account must not get its colleagues' contact data and licence numbers.
  app.get("/api/portal/drivers", ...manageDrivers, async (req, res) => {
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

  const licenseUpload = sanitizeUploadedFields(multer({
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
  }));

  app.post("/api/portal/drivers/:id/license", ...manageDrivers, licenseUpload.single("licenseFile"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const existing = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    if (!existing) { if (req.file) fs.rmSync(req.file.path, { force: true }); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found"); }
    if (!req.file) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "No file uploaded");
    const check = await validateAfterUpload(req.file.path, req.file.originalname, req.file.mimetype, "document");
    if (!check.valid) { fs.rmSync(req.file.path, { force: true }); return portalError(res, 400, PORTAL_ERROR.VALIDATION, check.error ?? "Invalid file"); }
    const driver = await storage.updateDriver(id, { licenseFilePath: getRelativePath(req.file.path), updatedBy: ctx.user.email });
    // The previous licence file is replaced, not left behind.
    const previous = existing.licenseFilePath ? resolveDocumentFilePath(existing.licenseFilePath) : null;
    if (previous && previous !== req.file.path) fs.rmSync(previous, { force: true });
    await logPortalActivity(req, "driver_license_uploaded", { entity: "driver", entityId: id });
    res.json(toDriverDto(driver!));
  });

  app.get("/api/portal/drivers/:id/license", ...manageDrivers, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const driver = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    const file = driver?.licenseFilePath ? resolveDocumentFilePath(driver.licenseFilePath) : null;
    if (!driver || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "No licence file");
    // Security review 2026-10-18 (Laag 12): the same safe headers as every other portal file (type from the name, nosniff, sandbox).
    setSafeFileHeaders(res, null, file, true, sanitizeFilename(path.basename(file)));
    streamFile(file, res);
  });
}
