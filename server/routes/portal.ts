import type { Express, RequestHandler, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
import { portalStorage, type PortalReservation } from "../services/portal-storage";
import { requireFeature, requirePortalRole, portalError, logPortalActivity } from "../portal-auth";
import { assignDriverToReservation, getDriverAssignments } from "../services/driver-assignments";
import { notifyStaffOfPortalEvent } from "../services/portal-notifications";
import { resolveDocumentFilePath } from "../services/document-paths";
import { createSecureMulterFilter, sanitizeFilename, validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { storage } from "../storage";
import { PORTAL_ERROR, type PortalReservationDto, type PortalDocumentDto, type PortalDriverDto } from "../../shared/portal-types";
import type { Driver } from "../../shared/schema";

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
    vehicle: r.vehicle ? { id: r.vehicle.id, licensePlate: r.vehicle.licensePlate, brand: r.vehicle.brand, model: r.vehicle.model } : null,
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
    licenseExpiry: d.licenseExpiry, status: d.status, hasLicenseFile: Boolean(d.licenseFilePath),
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
    res.json({ ...toReservationDto(r, ctx.settings.showPrices), driverHistory: history });
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
    const dto: PortalDocumentDto[] = docs.map((d) => ({
      id: d.id, reservationId: d.reservationId, documentType: d.documentType, kind: d.kind,
      fileName: d.fileName, uploadDate: d.uploadDate.toISOString(),
    }));
    res.json(dto);
  });

  app.get("/api/portal/documents/:id/download", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const doc = await portalStorage.getDocumentForCustomer(id, ctx.customerId, ctx.scope);
    const file = doc ? resolveDocumentFilePath(doc.filePath) : null;
    if (!doc || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    await logPortalActivity(req, "document_downloaded", { entity: "document", entityId: id });
    res.setHeader("Content-Type", doc.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(doc.fileName)}"`);
    fs.createReadStream(file).pipe(res);
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
