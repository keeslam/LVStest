import type { Express, Request, Response, NextFunction } from "express";
// FIX-R (BUG-086): multer parses the multipart body inside the route chain,
// long after app.use(sanitizeInput) ran — so these wrappers sanitize what it
// parsed.
import { sanitizeUploadedFields } from "./middleware/security/sanitization";
import { createServer, type Server } from "http";
import { format } from "date-fns";
import { storage } from "./storage";
import { ReportValidationError } from "./database-storage";
import { fetchVehicleInfoByLicensePlate, RDWNotFoundError, RDWTimeoutError, RDWUpstreamError } from "./utils/rdw-api";
import { generateRentalContractFromTemplate, prepareContractData } from "./utils/pdf-generator";
import { processInvoiceWithAI, generateInvoiceHash, validateParsedInvoice, type ParsedInvoice } from "./utils/invoice-scanner";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { 
  insertVehicleSchema, 
  insertCustomerSchema, 
  insertReservationSchema, 
  insertReservationSchemaBase,
  normaliseLicensePlate,
  isCalendarDate,
  insertSettingsSchema,
  reservations,
  vehicles,
  settings as settingsTable,
  vehicleTransports,
  interactiveDamageChecks, 
  insertExpenseSchema, 
  insertDocumentSchema,
  insertUserSchema,
  insertPdfTemplateSchema,
  insertTemplateBackgroundSchema,
  insertTransportReportTemplateSchema,
  insertBarcodeLabelTemplateSchema,
  insertTransportReportTemplateBackgroundSchema,
  insertDriverSchema,
  insertDamageCheckTemplateSchema,
  insertInteractiveDamageCheckSchema,
  insertVehicleTransportSchema,
  createPlaceholderReservationSchema,
  placeholderQuerySchema,
  placeholderNeedingAssignmentQuerySchema,
  assignVehicleToPlaceholderSchema,
  Reservation,
  UserRole,
  UserPermission,
  isValidReservationTransition,
  isValidSpareTransition,
  damageCheckFieldsConfigSchema,
  DEFAULT_DAMAGE_CHECK_FIELDS,
  DAMAGE_CHECK_FIELDS_KEY,
} from "../shared/schema";
import { getTransportSpareStatus } from "../shared/transport-spare-status";
import multer from "multer";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import { backupService } from "./backupService";
import { ObjectStorageService } from "./objectStorage";
import { realtimeEvents } from "./realtime-events";
import { hasPermission, requireAdmin } from "./middleware/permissions.js";
import { describeDbError, dbErrorBody } from "./utils/db-errors.js";
import { installAsyncErrorHandling } from "./middleware/asyncHandler.js";
import { AuditLogger } from "./utils/security/auditLogger.js";
import { auditMutations } from "./middleware/audit";
import { clearEmailConfigCache, sendEmail, testSmtpConnection } from "./utils/email-service";
import { 
  getVehicleStatusContext, 
  validateManualStatusChange, 
  VehicleAvailabilityStatus 
} from "./vehicle-status-helper";
import {
  assertReservationTransition,
  assertReservationStatusValue,
  BLOCK_TO_VEHICLE_MAINTENANCE,
  assertVehicleMaintenanceStatus,
  normalizeReservationStatus,
  decideHandover,
  StateTransitionError,
  WorkshopBlockedError,
  type HandoverOverride,
} from "./services/lifecycle";
import { calculateDutchHolidays, mergeHolidaysWithOverrides } from "../shared/holidays";
import { geocodeAddress, haversineDistanceKm, nearestNeighborOrder, getRoadRouteDistances } from "./geocoding";
import { isDamageCheckDocument } from "../shared/document-types";
import { getUploadsDir } from "../shared/paths";
import { parseBarcode, normalizeScannedCode } from "../shared/barcode";
import { 
  createSecureMulterFilter, 
  validateAfterUpload,
  validateFileBuffer,
  isDangerousExtension,
  sanitizeFilename 
} from "./utils/security/fileUploadSecurity";

import { getRelativePath, resolveDocumentFilePath } from "./services/document-paths";
import { resolveUploadsPath } from "../shared/paths";
import {
  CONTRACT_RELEVANT_FIELDS,
  scheduleReservationPdfRegeneration,
  scheduleContractRegeneration,
  cleanupSupersededDamageCheckVersions,
  pickBestDamageCheckTemplate,
} from "./services/reservation-pdf-regeneration";
import {
  registerGeneratedDocument,
  annotateDocumentFileState,
  annotateDocumentsFileState,
  contractGenerationRefusal,
  DOCUMENT_TYPE_CONTRACT_UNSIGNED,
  DOCUMENT_TYPE_DAMAGE_CHECK_UNSIGNED,
  DOCUMENT_TYPE_TRANSPORT_REPORT,
} from "./services/document-registry";
import { selectContractTemplate } from "./services/pdf-template-selection";
import { buildDamageCheckReservationData } from "./services/damage-check-data";
import { regenerateDocument } from "./services/document-regeneration";
import { BookingConflictError, warningsForVerdict, type BookingRequest, type BookabilityVerdict } from "./services/bookability";
import { bookingWarningsFor, type BookingWarning } from "../shared/booking-warnings";
import { reservationIsOld, verifyAdminPassword, authorizeMileageDecrease } from "./services/authorization";
import { assignDriverToReservation } from "./services/driver-assignments";
import { getServiceDueVehicles, scanVehiclesForServiceDue } from "./utils/service-due-scanner";
import { registerUserRoutes } from "./routes/users";
import { registerPortalAdminRoutes } from "./routes/portal-admin";
import { registerFineRoutes } from "./routes/fines";
import { registerPortalRequestRoutes } from "./routes/portal-requests";
import { registerExpenseRoutes } from "./routes/expenses";
import { registerPdfTemplateRoutes } from "./routes/pdf-templates";
import { registerCustomNotificationRoutes } from "./routes/custom-notifications";
import { registerBackupRoutes } from "./routes/backups";
import { registerSettingsRoutes } from "./routes/settings";
import { registerAppSettingsRoutes } from "./routes/app-settings";
import { registerReportRoutes } from "./routes/reports";
import { registerDamageCheckTemplateRoutes } from "./routes/damage-check-templates";
import { registerVehicleDiagramTemplateRoutes } from "./routes/vehicle-diagram-templates";
import { registerReportAndLabelTemplateRoutes } from "./routes/report-and-label-templates";
import { onMaintenanceBlockChanged, onReplacementAssigned, onRentalVehicleChanged } from "./services/portal-maintenance-events";
import type { RouteDeps } from "./routes/deps";
import { installIdParamValidation, rejectNullBytesInPath } from "./middleware/parseIntParam";
import { parsePartialUpdate, parseCreateBody, BodyValidationError } from "./middleware/validateBody";
import { sendRouteError, HttpError } from "./utils/route-errors";
import { UploadRejectedError } from "./utils/security/fileUploadSecurity";
import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * The fields that move a booking in time or onto another vehicle. A PATCH that
 * touches none of them cannot create a double booking, so the (expensive)
 * conflict check is skipped — and, more importantly, a note-only edit on a
 * reservation that already overlaps another one still saves.
 */
const SCHEDULING_FIELDS = ["vehicleId", "startDate", "endDate", "startTime", "endTime", "type"] as const;

/**
 * BUG-020 — finds a vehicle whose plate is the *same plate*, whatever separators
 * and casing it was typed with. The database's unique constraint only sees the
 * raw text, so this is the check that actually stops a duplicate.
 */
async function findVehicleByNormalisedPlate(plate: string): Promise<{ id: number } | undefined> {
  const normalised = normaliseLicensePlate(plate);
  if (!normalised) return undefined;
  const [row] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(sql`regexp_replace(upper(${vehicles.licensePlate}), '[^A-Z0-9]', '', 'g') = ${normalised}`)
    .limit(1);
  return row;
}

/**
 * BUG-039 - reservations.vehicle_id and customer_id have no FK, so nothing but
 * this check stands between a typo and an orphan row. Returns the 404 body
 * (naming the field) when a referenced row is not there, else null.
 */
async function findMissingReservationReferences(
  data: { vehicleId?: number | null; customerId?: number | null },
): Promise<{ message: string; field: string } | null> {
  if (data.vehicleId != null && !(await storage.getVehicle(data.vehicleId))) {
    return { message: "Vehicle not found", field: "vehicleId" };
  }
  if (data.customerId != null && !(await storage.getCustomer(data.customerId))) {
    return { message: "Customer not found", field: "customerId" };
  }
  return null;
}

/**
 * BUG-017 - the blacklist was checked on create and on neither edit path, so
 * swapping the vehicle or the customer of an existing reservation walked right
 * past it. Judged on the *effective* pair after the patch.
 */
async function blacklistedAfterPatch(
  patch: { vehicleId?: number | null; customerId?: number | null },
  existing: { vehicleId: number | null; customerId: number | null },
): Promise<boolean> {
  const vehicleId = patch.vehicleId ?? existing.vehicleId;
  const customerId = patch.customerId ?? existing.customerId;
  if (vehicleId == null || customerId == null) return false;
  if (vehicleId === existing.vehicleId && customerId === existing.customerId) return false;
  return storage.isCustomerBlacklistedForVehicle(vehicleId, customerId);
}

/** The 409 both PATCH handlers answer with. */
const BLACKLIST_CONFLICT = {
  message: "This customer is blacklisted for this vehicle and cannot be booked on it.",
  field: "customerId",
} as const;

export async function registerRoutes(app: Express): Promise<void> {
  // FIX-A (BUG-002, BUG-061, BUG-101): make every handler registered anywhere in
  // this process async-safe, so a rejected handler promise becomes a 500 on that
  // one request instead of an unhandledRejection that kills the server.
  installAsyncErrorHandling();

  // FIX-E (BUG-103): one validated id parser for every `:id`-style path
  // parameter on this app — including the routes the sub-modules below register
  // on it. Param callbacks run before the route's own middleware stack, so a
  // non-numeric, oversized or null-byte id is a 400 before multer, before the
  // permission check's storage reads, and before any `WHERE id = NaN`.
  installIdParamValidation(app);
  // …and the other half of BUG-103's payload set: a `%00` in the path reached
  // the string-keyed lookups (`:category`, `:key`, `:code`) as a real NUL,
  // which Postgres rejects for every column type. One early 400 covers them all.
  app.use(rejectNullBytesInPath);

  // Initialize object storage service
  const objectStorageService = new ObjectStorageService();
  
  // Create uploads directory if it doesn't exist - now works in any environment
  const uploadsDir = getUploadsDir();
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log(`✅ Created uploads directory: ${uploadsDir}`);
    } else {
      console.log(`✅ Uploads directory exists: ${uploadsDir}`);
    }
    
    // Create templates directory at startup to ensure it's inside the mounted volume
    const templatesDir = path.join(uploadsDir, 'templates');
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
      console.log(`✅ Created templates directory: ${templatesDir}`);
    } else {
      const files = fs.readdirSync(templatesDir);
      console.log(`📁 Templates directory exists with ${files.length} files:`, files);
    }
    
    // Test write permissions
    const testFile = path.join(uploadsDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✅ Uploads directory has write permissions`);
    
  } catch (error) {
    console.error(`❌ Upload directory setup failed:`, error);
    console.error(`Current working directory: ${process.cwd()}`);
    console.error(`Attempted uploads directory: ${uploadsDir}`);
    throw new Error(`Upload directory setup failed. Please ensure the application has write permissions to: ${uploadsDir}`);
  }

  // Configure multer for file uploads (PDFs for invoices/expenses) with enhanced security
  const upload = sanitizeUploadedFields(multer({
    dest: path.join(uploadsDir, 'temp'),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for invoices
    },
    fileFilter: createSecureMulterFilter('pdf'),
  }));

  // Configure multer for backup uploads (backup files) with enhanced security
  const backupUpload = sanitizeUploadedFields(multer({
    dest: path.join(uploadsDir, 'temp'),
    limits: {
      fileSize: 1000 * 1024 * 1024, // 1GB limit for backups
    },
    fileFilter: createSecureMulterFilter('backup'),
  }));
  
  // Configure multer for diagram images - using disk storage like all other uploads
  const diagramStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const diagramsDir = path.join(uploadsDir, 'vehicle-diagrams');
      if (!fs.existsSync(diagramsDir)) {
        fs.mkdirSync(diagramsDir, { recursive: true });
      }
      cb(null, diagramsDir);
    },
    filename: (req, file, cb) => {
      const sanitizedOriginal = sanitizeFilename(file.originalname);
      const ext = path.extname(sanitizedOriginal);
      const timestamp = Date.now();
      const randomSuffix = Math.round(Math.random() * 1E9);
      cb(null, `diagram-${timestamp}-${randomSuffix}${ext}`);
    }
  });

  // Configure multer for diagram images with enhanced security
  const diagramUpload = sanitizeUploadedFields(multer({
    storage: diagramStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit for images
    },
    fileFilter: createSecureMulterFilter('image'),
  }));

  // Configure multer for fuel receipt uploads
  const fuelReceiptStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        const vehicleId = parseInt(req.body.vehicleId || req.params.id);
        const vehicle = await storage.getVehicle(vehicleId);
        
        if (!vehicle) {
          return cb(new Error("Vehicle not found"), '');
        }
        
        // Always remove all special characters including dashes from license plates for folder names
        const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
        const baseDir = path.join(getUploadsDir(), sanitizedPlate);
        const fuelReceiptsDir = path.join(baseDir, 'fuel_receipt');
        
        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }
        if (!fs.existsSync(fuelReceiptsDir)) {
          fs.mkdirSync(fuelReceiptsDir, { recursive: true });
        }
        
        console.log(`Fuel receipt upload storage: ${fuelReceiptsDir}`);
        cb(null, fuelReceiptsDir);
      } catch (error) {
        console.error("Error with fuel receipt upload:", error);
        cb(error as any, '');
      }
    },
    filename: async (req, file, cb) => {
      try {
        const timestamp = Date.now();
        const dateString = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const extension = path.extname(sanitizedOriginal) || '.pdf';
        
        // Get vehicle license plate
        const vehicleId = parseInt(req.body.vehicleId || req.params.id);
        const vehicle = await storage.getVehicle(vehicleId);
        
        if (!vehicle) {
          throw new Error("Vehicle not found");
        }
        
        // Sanitize license plate for filename (remove spaces, etc.)
        const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
        
        // Create filename with license plate and date
        const fileName = `${sanitizedPlate}_fuel_receipt_${dateString}_${timestamp}${extension}`;
        
        console.log(`Generated fuel receipt filename: ${fileName}`);
        cb(null, fileName);
      } catch (error) {
        console.error("Error creating filename for fuel receipt:", error);
        // Fallback to simple timestamped name if there's an error
        const timestamp = Date.now();
        const dateString = new Date().toISOString().split('T')[0];
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const extension = path.extname(sanitizedOriginal) || '.pdf';
        const fallbackName = `fuel_receipt_${dateString}_${timestamp}${extension}`;
        console.log(`Using fallback fuel receipt filename: ${fallbackName}`);
        cb(null, fallbackName);
      }
    }
  });
  
  // Configure multer for fuel receipt uploads with enhanced security
  const fuelReceiptUpload = sanitizeUploadedFields(multer({
    storage: fuelReceiptStorage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for PDFs and images
    },
    fileFilter: createSecureMulterFilter('document'),
  }));
  
  // Set up authentication routes and middleware
  const { requireAuth } = setupAuth(app);

  // Records every data-changing request for the activity log. Registered here,
  // after auth so req.user is known, and before the routes below.
  app.use(auditMutations);

  // Shared BackupService singleton (see server/backupService.ts) - must be
  // the same instance the scheduler uses so the runBackup re-entrancy guard
  // and isRunning status reflect scheduled/catch-up runs too.
  const objectStorage = new ObjectStorageService();
  const routeDeps: RouteDeps = { upload, backupUpload, diagramUpload, fuelReceiptUpload, objectStorageService, objectStorage, uploadsDir, requireAuth };

  // ==================== ACTIVITY LOG ====================
  // Who changed what, from the audit_logs table. Same permission as user
  // management: it exposes every user's actions.
  registerUserRoutes(app, routeDeps);
  registerPortalAdminRoutes(app, routeDeps);
  registerFineRoutes(app, routeDeps);
  registerPortalRequestRoutes(app, routeDeps);
  
  /**
   * besluiten **B-03** — an administrator may force a handover of a vehicle
   * that is in the workshop, with a reason. Reads the two body fields the
   * refusal advertises (`overrideFields`) and the caller's role; the decision
   * itself is `decideHandover()`, so `/pickup` and `/status` cannot drift.
   */
  function workshopOverrideFrom(req: Request): HandoverOverride {
    const body = (req.body ?? {}) as Record<string, unknown>;
    return {
      force: body.forceWorkshopOverride === true || body.forceWorkshopOverride === 'true',
      isAdmin: (req.user as any)?.role === UserRole.ADMIN,
      reason: typeof body.forceWorkshopReason === 'string' ? body.forceWorkshopReason : null,
      username: (req.user as any)?.username ?? null,
    };
  }

  // ==================== VEHICLE ROUTES ====================
  // Get available vehicles (optionally for a specific date range)
  app.get("/api/vehicles/available", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    const { startDate, endDate, excludeVehicleId } = req.query;
    
    let vehicles;
    if (startDate) {
      // For open-ended rentals (no endDate) or specific date ranges
      // Use a far future date for open-ended rentals to check conflicts with existing rentals
      const effectiveEndDate = endDate ? (endDate as string) : '2099-12-31';
      
      vehicles = await storage.getAvailableVehiclesInRange(
        startDate as string, 
        effectiveEndDate, 
        excludeVehicleId ? parseInt(excludeVehicleId as string) : undefined
      );
    } else {
      // Fall back to basic method for compatibility when no dates provided
      vehicles = await storage.getAvailableVehicles();
    }
    
    res.json(vehicles);
  });

  // Get vehicles with APK expiring soon
  app.get("/api/vehicles/apk-expiring", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    try {
      // Get maintenance calendar settings
      const appSettings = await storage.getSettings();
      const excludedStatuses = appSettings?.maintenanceExcludedStatuses || ["not_for_rental"];
      const daysAhead = appSettings?.apkReminderDays || 30;
      
      const vehicles = await storage.getVehiclesWithApkExpiringSoon({
        daysAhead,
        excludedStatuses
      });
      res.json(vehicles);
    } catch (error) {
      console.error("Error fetching APK expiring vehicles:", error);
      res.status(500).json({ message: "Failed to fetch APK expiring vehicles" });
    }
  });

  // Get vehicles with warranty expiring soon
  app.get("/api/vehicles/warranty-expiring", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    try {
      // Get maintenance calendar settings
      const appSettings = await storage.getSettings();
      const excludedStatuses = appSettings?.maintenanceExcludedStatuses || ["not_for_rental"];
      const daysAhead = appSettings?.warrantyReminderDays || 30;
      
      const vehicles = await storage.getVehiclesWithWarrantyExpiringSoon({
        daysAhead,
        excludedStatuses
      });
      res.json(vehicles);
    } catch (error) {
      console.error("Error fetching warranty expiring vehicles:", error);
      res.status(500).json({ message: "Failed to fetch warranty expiring vehicles" });
    }
  });

  // Vehicles whose regular service is due or due soon (per-vehicle interval,
  // defaults from system settings). Feeds the maintenance calendar.
  app.get("/api/vehicles/service-due", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (_req, res) => {
    try {
      res.json(await getServiceDueVehicles());
    } catch (error) {
      console.error("Error fetching service-due vehicles:", error);
      res.status(500).json({ message: "Failed to fetch service-due vehicles" });
    }
  });

  // Manual trigger of the nightly service-due scan (refreshes the notifications)
  app.post("/api/vehicles/service-due/scan", hasPermission(UserPermission.MANAGE_VEHICLES), async (_req, res) => {
    try {
      res.json(await scanVehiclesForServiceDue());
    } catch (error) {
      console.error("Error running service-due scan:", error);
      res.status(500).json({ message: "Failed to run service-due scan" });
    }
  });

  // Get overlapping regular reservations for a vehicle during maintenance period
  app.get("/api/vehicles/:vehicleId/overlaps", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    try {
      const { vehicleId } = req.params;
      const { startDate, endDate } = req.query;

      // Validate input parameters
      const vehicleIdNum = parseInt(vehicleId);
      if (isNaN(vehicleIdNum)) {
        return res.status(400).json({ error: "Invalid vehicle ID" });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      // Get overlapping reservations for this vehicle
      const overlaps = await storage.checkReservationConflicts(
        vehicleIdNum, 
        startDate as string, 
        endDate as string,
        null // Don't exclude any reservations for overlap check
      );

      // Filter to only regular (non-maintenance) reservations and get customer info
      const regularOverlaps = [];
      for (const reservation of overlaps) {
        // Skip maintenance reservations
        if (reservation.type === 'maintenance_block') {
          continue;
        }

        // Skip if no customer assigned
        if (!reservation.customerId) {
          continue;
        }

        // Get customer information
        const customer = await storage.getCustomer(reservation.customerId);
        if (customer) {
          regularOverlaps.push({
            reservation: {
              id: reservation.id,
              startDate: reservation.startDate,
              endDate: reservation.endDate,
              status: reservation.status,
              type: reservation.type
            },
            customer: {
              id: customer.id,
              name: customer.name,
              firstName: customer.firstName,
              lastName: customer.lastName,
              email: customer.email,
              phone: customer.phone
            }
          });
        }
      }

      res.json(regularOverlaps);
    } catch (error) {
      console.error("Error fetching overlapping reservations:", error);
      res.status(500).json({ error: "Failed to fetch overlapping reservations" });
    }
  });
  
  // Get vehicle availability status breakdown
  app.get("/api/vehicles/status/breakdown", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    try {
      // BUG-217: this used to call syncVehicleAvailabilityWithReservations()
      // first — 2 SELECTs and up to 3 UPDATEs over hundreds of rows, on a read.
      // The status is now written where it changes (every reservation mutation,
      // the workshop toggle, pickup/return and the nightly scheduler), so the
      // read is a read.
      const vehicles = await storage.getAllVehicles();
      
      // Count vehicles by status
      const breakdown = {
        available: 0,
        needs_fixing: 0,
        not_for_rental: 0,
        rented: 0,
        total: vehicles.length
      };
      
      vehicles.forEach(vehicle => {
        const status = vehicle.availabilityStatus || 'available';
        if (status === 'available') breakdown.available++;
        else if (status === 'needs_fixing') breakdown.needs_fixing++;
        else if (status === 'not_for_rental') breakdown.not_for_rental++;
        else if (status === 'rented') breakdown.rented++;
      });
      
      res.json(breakdown);
    } catch (error) {
      console.error("Error fetching vehicle status breakdown:", error);
      res.status(500).json({ message: "Failed to fetch vehicle status breakdown", error });
    }
  });

  // Get all vehicles with optional search
  app.get("/api/vehicles", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    try {
      // Prevent caching to ensure fresh data is always returned
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // BUG-217: the status sync used to run here, on the single hottest read
      // path in the app (25 useQuery call sites), writing up to 3 UPDATEs per
      // list load. Reading the fleet no longer writes to it.
      const searchQuery = req.query.search as string | undefined;
      const vehicles = await storage.getAllVehicles(searchQuery);
      res.json(vehicles);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      res.status(500).json({ message: "Failed to fetch vehicles", error });
    }
  });

  // Get single vehicle
  app.get("/api/vehicles/:id", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }

    const vehicle = await storage.getVehicle(id);
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    res.json(vehicle);
  });

  // Resolve any scanned code: stored vehicle barcode, derived RES- reservation
  // code, or (fallback) a license plate typed/scanned manually.
  app.get("/api/barcodes/:code", requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    const rawCode = req.params.code.trim();
    const scannedBy = (req.user as any)?.username ?? null;
    const logScan = (matchType: "vehicle" | "reservation" | "spare_key" | "none", opts?: { vehicleId?: number | null; reservationId?: number | null; licensePlate?: string | null }) => {
      storage.logScanEvent({
        code: rawCode,
        matchType,
        vehicleId: opts?.vehicleId ?? null,
        reservationId: opts?.reservationId ?? null,
        licensePlate: opts?.licensePlate ?? null,
        scannedBy,
      }).catch(() => {});
    };
    try {
      // The scan UI only ever renders id/status/startDate/endDate/customer name,
      // but the underlying reservation rows carry the full customer PII
      // (driver license number, address, phone, email, etc). Project down to
      // just what's rendered before this vehicle-permission-gated endpoint
      // sends anything back over the wire.
      const projectReservationForScan = (r: any) => r ? ({
        id: r.id,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        customer: r.customer ? { name: r.customer.name } : null,
      }) : null;

      const parsed = parseBarcode(req.params.code);

      if (parsed.kind === "reservation") {
        const reservation = await storage.getReservation(parsed.reservationId);
        if (!reservation || reservation.deletedAt) {
          logScan("none");
          return res.status(404).json({ message: "Reservation not found for this barcode" });
        }
        const vehicle = reservation.vehicleId ? await storage.getVehicle(reservation.vehicleId) : undefined;
        logScan("reservation", { reservationId: reservation.id, vehicleId: vehicle?.id ?? null, licensePlate: vehicle?.licensePlate ?? null });
        return res.json({ type: "reservation", reservation: projectReservationForScan(reservation), vehicle: vehicle ?? null });
      }

      // Spare-key codes (VEH-000123-S) aren't stored anywhere: resolve by id
      // and only accept if that vehicle's real barcode still starts with the
      // same padded id, so a stale/reassigned id can't resolve to it.
      let scannedSpareKey = false;
      let vehicle;
      if (parsed.kind === "vehicle" && parsed.spareKey) {
        const candidate = await storage.getVehicle(parsed.vehicleId);
        if (candidate?.barcode?.startsWith("VEH-" + String(parsed.vehicleId).padStart(6, "0"))) {
          vehicle = candidate;
          scannedSpareKey = true;
        }
      }

      // Vehicle path: exact barcode match first (covers -R revisions since the
      // stored value is matched verbatim), then license-plate fallback.
      const normalized = normalizeScannedCode(req.params.code);
      if (!vehicle) {
        vehicle = await storage.getVehicleByBarcode(normalized);
      }
      if (!vehicle && parsed.kind === "unknown") {
        const plate = normalized.replace(/[-\s]/g, "");
        const all = await storage.getAllVehicles();
        vehicle = all.find(v => v.licensePlate.replace(/[-\s]/g, "").toUpperCase() === plate);
      }
      if (!vehicle) {
        logScan("none");
        return res.status(404).json({ message: "No vehicle found for this barcode" });
      }

      const today = new Date().toISOString().split("T")[0];
      // Mirror the vehicle-details page's reservation logic (vehicle-details.tsx)
      // so a scanned barcode shows the same active/upcoming rental as the vehicle
      // dialog: only standard rentals count, and "upcoming" is any future
      // non-cancelled reservation regardless of its workflow status.
      const allReservations = (await storage.getReservationsByVehicle(vehicle.id))
        .filter(r => !r.deletedAt);
      const reservations = allReservations.filter(r => r.type === "standard");

      // Nearest open maintenance block (not completed/cancelled), so scanning
      // a vehicle that's in — or headed to — the workshop shows it. Projection
      // only; blocks carry no customer data anyway.
      const maintenanceBlock = allReservations
        .filter(r => r.type === "maintenance_block" && r.maintenanceStatus !== "out" && r.status !== "cancelled")
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
      const activeMaintenance = maintenanceBlock ? {
        id: maintenanceBlock.id,
        startDate: maintenanceBlock.startDate,
        endDate: maintenanceBlock.endDate,
        maintenanceStatus: maintenanceBlock.maintenanceStatus,
        maintenanceCategory: maintenanceBlock.maintenanceCategory,
      } : null;

      const ACTIVE_STATUSES = ["picked_up", "booked", "rented", "confirmed", "pending"];
      const activeReservation = reservations.find(r =>
        // A picked-up rental stays active until returned, even past its end
        // date (overdue rentals are common and must show on scan).
        r.status === "picked_up" ||
        (ACTIVE_STATUSES.includes(r.status) &&
          r.startDate <= today &&
          (!r.endDate || r.endDate >= today))
      ) ?? null;

      // Upcoming: earliest future reservation that isn't cancelled.
      const upcomingReservation = reservations
        .filter(r => r.status !== "cancelled" && r.startDate > today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;

      const transport = await storage.getActiveTransportByVehicle(vehicle.id);
      const activeTransport = transport ? {
        id: transport.id,
        status: transport.status,
        transportType: transport.transportType,
        scheduledDate: transport.scheduledDate,
        originCity: transport.originCity,
        destinationCity: transport.destinationCity,
      } : null;

      logScan(scannedSpareKey ? "spare_key" : "vehicle", { vehicleId: vehicle.id, licensePlate: vehicle.licensePlate });
      return res.json({
        type: "vehicle",
        vehicle,
        activeReservation: projectReservationForScan(activeReservation),
        upcomingReservation: projectReservationForScan(upcomingReservation),
        activeTransport,
        activeMaintenance,
        ...(scannedSpareKey ? { scannedSpareKey: true } : {}),
      });
    } catch (error) {
      console.error("Barcode lookup failed:", error);
      return res.status(500).json({ message: "Barcode lookup failed" });
    }
  });

  // Recent scan history for the ScanPanel's "recent scans" list.
  app.get("/api/scan-events", requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const events = await storage.getRecentScanEvents(20);
      return res.json(events);
    } catch (error) {
      console.error("Failed to fetch scan events:", error);
      return res.status(500).json({ message: "Failed to fetch scan events" });
    }
  });

  app.post("/api/vehicles/:id/barcode/regenerate", requireAuth, hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle id" });
      }
      const updatedBy = (req.user as any)?.fullName || (req.user as any)?.username;
      const vehicle = await storage.regenerateVehicleBarcode(id, updatedBy);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      return res.json({ vehicle });
    } catch (error) {
      console.error("Barcode regeneration failed:", error);
      return res.status(500).json({ message: "Barcode regeneration failed" });
    }
  });

  // Get latest vehicle data (fuel level and mileage) for damage check
  app.get("/api/vehicles/:id/latest-data", requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const checkType = req.query.checkType as string | undefined; // 'pickup' or 'return'
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      const vehicle = await storage.getVehicle(id);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // Get current active reservation for this vehicle (confirmed or pending status)
      const allReservations = await storage.getAllReservations();
      const currentReservation = allReservations
        .filter(r => r.vehicleId === id && (r.status === 'confirmed' || r.status === 'pending'))
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

      let latestFuelLevel = null;
      let latestMileage = vehicle.currentMileage || null;

      // If there's an active reservation, get data from it and its damage checks
      if (currentReservation) {
        // Fuel Level: Priority 1 - Reservation fuel level fields (reservation is source of truth for fuel)
        if (checkType === 'pickup' && currentReservation.fuelLevelPickup) {
          latestFuelLevel = currentReservation.fuelLevelPickup;
        } else if (checkType === 'return' && currentReservation.fuelLevelReturn) {
          latestFuelLevel = currentReservation.fuelLevelReturn;
        }
        
        // Fuel Level: Priority 2 - Latest damage check from current reservation (fallback)
        if (!latestFuelLevel) {
          const allDamageChecks = await storage.getAllInteractiveDamageChecks();
          const currentReservationDamageChecks = allDamageChecks
            .filter(dc => dc.vehicleId === id && dc.reservationId === currentReservation.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (currentReservationDamageChecks.length > 0 && currentReservationDamageChecks[0].fuelLevel) {
            latestFuelLevel = currentReservationDamageChecks[0].fuelLevel;
          }
        }
        
        // Mileage: vehicle.currentMileage is already set above, but also check reservation as fallback
        if (!latestMileage && currentReservation.pickupMileage) {
          latestMileage = currentReservation.pickupMileage;
        }
      } else {
        // No active reservation - use vehicle's currentFuelLevel if available
        if (vehicle.currentFuelLevel) {
          latestFuelLevel = vehicle.currentFuelLevel;
        }
      }

      res.json({
        fuelLevel: latestFuelLevel,
        mileage: latestMileage
      });
    } catch (error) {
      console.error("Error fetching latest vehicle data:", error);
      res.status(500).json({ message: "Failed to fetch latest vehicle data" });
    }
  });

  // Create vehicle
  app.post("/api/vehicles", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      console.log("Received vehicle data:", JSON.stringify(req.body));
      
      // Check if required fields are present
      if (!req.body.licensePlate || !req.body.brand || !req.body.model) {
        console.log("Missing required fields in vehicle data");
        return res.status(400).json({ 
          message: "Missing required fields", 
          details: { 
            licensePlate: !req.body.licensePlate ? "License plate is required" : null,
            brand: !req.body.brand ? "Brand is required" : null,
            model: !req.body.model ? "Model is required" : null
          } 
        });
      }
      
      // Create a sanitized copy of the request body
      const sanitizedData = { ...req.body };
      
      // Ensure all values are properly formatted

      // Convert empty string values to null for numeric fields
      if (sanitizedData.departureMileage === '') sanitizedData.departureMileage = null;
      if (sanitizedData.returnMileage === '') sanitizedData.returnMileage = null;
      if (sanitizedData.monthlyPrice === '') sanitizedData.monthlyPrice = null;
      if (sanitizedData.dailyPrice === '') sanitizedData.dailyPrice = null;
      
      // Convert values for boolean fields
      const booleanFields = [
        'damageCheck', 'winterTires', 'roadsideAssistance', 'spareKey', 
        'wokNotification', 'seatcovers', 'backupbeepers', 'gps', 'adBlue'
      ];
      
      booleanFields.forEach(field => {
        if (field in sanitizedData) {
          const value = sanitizedData[field];
          sanitizedData[field] = value === true || value === 'true' || value === 1 || value === '1';
        } else {
          sanitizedData[field] = false;
        }
      });
      
      // Handle registration fields - convert to strings since they're stored as text in the DB
      if ('registeredTo' in sanitizedData) {
        const value = sanitizedData.registeredTo;
        sanitizedData.registeredTo = (value === true || value === 'true' || value === 1 || value === '1') ? "true" : "false";
      }
      
      if ('company' in sanitizedData) {
        const value = sanitizedData.company;
        sanitizedData.company = (value === true || value === 'true' || value === 1 || value === '1') ? "true" : "false";
      }
      
      // Clean date fields that are empty strings
      Object.keys(sanitizedData).forEach(key => {
        if (key.toLowerCase().includes('date') && sanitizedData[key] === "") {
          sanitizedData[key] = null;
        }
      });
      
      console.log("Sanitized vehicle data:", JSON.stringify(sanitizedData));
      
      // Validate with Zod schema
      let vehicleData;
      try {
        vehicleData = insertVehicleSchema.parse(sanitizedData);
      } catch (parseError) {
        console.error("Validation error:", parseError);
        return res.status(400).json({
          message: "Invalid vehicle data format",
          errors:
            parseError instanceof z.ZodError
              ? parseError.errors.map((e) => ({ field: e.path.join(".") || "(body)", message: e.message }))
              : [],
        });
      }
      
      // BUG-020: the unique constraint compares raw text, so "AB-123-C" and
      // "ab123c" were two vehicles. Compare the normalised form — the same
      // normalisation server/utils/rdw-api.ts uses — before the insert.
      const plateClash = await findVehicleByNormalisedPlate(vehicleData.licensePlate);
      if (plateClash) {
        return res.status(409).json({
          message: "A vehicle with this license plate already exists. Please use a different license plate or edit the existing vehicle.",
          field: "licensePlate",
          conflictingVehicleId: plateClash.id,
        });
      }

      // Add user tracking information
      const user = req.user;
      const dataWithTracking = {
        ...vehicleData,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null
      };
      
      // Set registeredToBy when registeredTo is true
      if (dataWithTracking.registeredTo === "true" && dataWithTracking.registeredToDate) {
        dataWithTracking.registeredToBy = user ? user.username : null;
      }
      
      // Set companyBy when company is true
      if (dataWithTracking.company === "true" && dataWithTracking.companyDate) {
        dataWithTracking.companyBy = user ? user.username : null;
      }
      
      // Create vehicle in database (this will throw on duplicate key)
      const vehicle = await storage.createVehicle(dataWithTracking);
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.vehicles.created(vehicle);
      
      res.status(201).json(vehicle);
    } catch (error) {
      console.error("Error creating vehicle:", error);
      
      // BUG-148: any 23505 used to be reported as a duplicate license plate, so
      // staff were told to change the plate when the barcode was the problem.
      // describeDbError() names the field from error.constraint instead.
      const dbError = describeDbError(error);
      if (dbError.recognised) {
        if (dbError.field === "licensePlate") {
          return res.status(409).json({
            message: "A vehicle with this license plate already exists. Please use a different license plate or edit the existing vehicle.",
            field: "licensePlate",
          });
        }
        return res.status(dbError.status).json(dbErrorBody(dbError));
      }
      
      // Generic error for other types of failures
      res.status(400).json({ 
        message: "Failed to create vehicle. Please check your data and try again.", 
      });
    }
  });

  // Bulk import vehicles from license plates (fetches from RDW)
  app.post("/api/vehicles/bulk-import-plates", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const { licensePlates } = req.body;
      
      if (!Array.isArray(licensePlates) || licensePlates.length === 0) {
        return res.status(400).json({ message: "Please provide an array of license plates" });
      }

      const imported: any[] = [];
      const failed: any[] = [];
      const user = req.user;

      for (const licensePlate of licensePlates) {
        try {
          // BUG-123: without this guard an empty or absent plate was normalised
          // to "" and inserted - a vehicle with a blank plate that the delete
          // confirmation could never match. bulk-import-csv already had it.
          if (typeof licensePlate !== 'string' || licensePlate.trim() === '') {
            failed.push({ licensePlate, error: "License plate is required" });
            continue;
          }

          // Normalize license plate (remove dashes and spaces)
          const normalizedPlate = licensePlate.replace(/[-\s]/g, '').toUpperCase();
          
          // Check if vehicle already exists
          const existingVehicles = await storage.getAllVehicles();
          const exists = existingVehicles.some(v => 
            v.licensePlate.replace(/[-\s]/g, '').toUpperCase() === normalizedPlate
          );
          
          if (exists) {
            failed.push({ licensePlate, error: "Vehicle already exists" });
            continue;
          }

          // Create vehicle with minimal data (user can fill in details later)
          const vehicleData = {
            licensePlate: licensePlate.toUpperCase(),
            brand: "Unknown",
            model: "Unknown",
            createdBy: user ? user.username : null,
            updatedBy: user ? user.username : null,
          };

          const vehicle = await storage.createVehicle(vehicleData as any);
          imported.push({ licensePlate, vehicle });
          
          // Broadcast real-time update
          realtimeEvents.vehicles.created(vehicle);
        } catch (error) {
          console.error(`Error importing vehicle ${licensePlate}:`, error);
          failed.push({ 
            licensePlate, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }

      res.json({ imported, failed });
    } catch (error) {
      console.error("Error in bulk import:", error);
      res.status(500).json({ message: "Failed to process bulk import" });
    }
  });

  // Bulk import vehicles from CSV data
  app.post("/api/vehicles/bulk-import-csv", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const { vehicles } = req.body;
      
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        return res.status(400).json({ message: "Please provide an array of vehicles" });
      }

      const imported: any[] = [];
      const failed: any[] = [];
      const user = req.user;

      for (const vehicleInput of vehicles) {
        try {
          const licensePlate = vehicleInput.licensePlate;
          
          if (!licensePlate) {
            failed.push({ licensePlate: "N/A", error: "License plate is required" });
            continue;
          }

          // Normalize license plate for comparison
          const normalizedPlate = licensePlate.replace(/[-\s]/g, '').toUpperCase();
          
          // Check if vehicle already exists
          const existingVehicles = await storage.getAllVehicles();
          const exists = existingVehicles.some(v => 
            v.licensePlate.replace(/[-\s]/g, '').toUpperCase() === normalizedPlate
          );
          
          if (exists) {
            failed.push({ licensePlate, error: "Vehicle already exists" });
            continue;
          }

          // Prepare vehicle data from CSV input
          const vehicleData: any = {
            licensePlate: licensePlate.toUpperCase(),
            brand: vehicleInput.brand || "Unknown",
            model: vehicleInput.model || "Unknown",
            createdBy: user ? user.username : null,
            updatedBy: user ? user.username : null,
          };

          // Map optional fields if provided
          if (vehicleInput.vehicleType) vehicleData.vehicleType = vehicleInput.vehicleType;
          if (vehicleInput.fuel) vehicleData.fuel = vehicleInput.fuel;
          if (vehicleInput.chassisNumber) vehicleData.chassisNumber = vehicleInput.chassisNumber;
          if (vehicleInput.tireSize) vehicleData.tireSize = vehicleInput.tireSize;
          if (vehicleInput.euroZone) vehicleData.euroZone = vehicleInput.euroZone;
          if (vehicleInput.internalAppointments) vehicleData.internalAppointments = vehicleInput.internalAppointments;
          
          // Combine remarks and generalInfo into remarks field
          const remarksArr: string[] = [];
          if (vehicleInput.remarks) remarksArr.push(vehicleInput.remarks);
          if (vehicleInput.generalInfo) remarksArr.push(vehicleInput.generalInfo);
          if (remarksArr.length > 0) vehicleData.remarks = remarksArr.join('\n');
          
          // Handle company field - convert to "true"/"false" string
          if (vehicleInput.company) {
            const companyValue = vehicleInput.company.toLowerCase();
            vehicleData.company = (companyValue === 'ja' || companyValue === 'yes' || companyValue === 'true' || companyValue === '1') ? "true" : vehicleInput.company;
          }
          
          // Handle registeredTo field - convert to "true"/"false" string or store the value
          if (vehicleInput.registeredTo) {
            const regValue = vehicleInput.registeredTo.toLowerCase();
            // Check if it's a BV/Opnaam indicator
            if (regValue.includes('bv') || regValue === 'ja' || regValue === 'yes' || regValue === 'true' || regValue === '1') {
              vehicleData.company = "true";
            } else if (regValue.includes('opnaam') || regValue.includes('naam')) {
              vehicleData.registeredTo = "true";
            } else {
              vehicleData.registeredTo = vehicleInput.registeredTo;
            }
          }
          
          // BUG-124: `new Date("09-03-2026")` is parsed by V8 as *American*
          // month-first, so a Dutch 9 March became 3 September; and
          // `toISOString()` then shifted the result by the local UTC offset, so
          // a date could move a further day. An unparseable date was silently
          // dropped instead of failing its row. Explicit formats, explicit
          // formatting, explicit failure.
          const convertImportDate = (value: unknown): string | null | undefined => {
            if (value == null || value === '') return null;
            const trimmed = String(value).trim();
            if (trimmed === '') return null;

            // Excel serial number (days since 1899-12-30), kept in UTC.
            if (/^\d{1,5}$/.test(trimmed)) {
              const serial = parseInt(trimmed, 10);
              const millis = Date.UTC(1899, 11, 30) + serial * 86_400_000;
              const date = new Date(millis);
              if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
              return undefined;
            }

            for (const pattern of [
              /^(?<d>\d{1,2})[-/.](?<m>\d{1,2})[-/.](?<y>\d{4})$/, // dd-mm-yyyy, dd/mm/yyyy
              /^(?<y>\d{4})[-/.](?<m>\d{1,2})[-/.](?<d>\d{1,2})$/, // yyyy-mm-dd
            ]) {
              const m = pattern.exec(trimmed);
              if (!m?.groups) continue;
              const ymd =
                m.groups.y +
                '-' + m.groups.m.padStart(2, '0') +
                '-' + m.groups.d.padStart(2, '0');
              return isCalendarDate(ymd) ? ymd : undefined;
            }
            return undefined;
          };

          // `undefined` means "given, but not a date" — that fails the row
          // instead of disappearing.
          const importDateFields = ['apkDate', 'companyDate'] as const;
          let badDateField: string | null = null;
          for (const field of importDateFields) {
            const converted = convertImportDate(vehicleInput[field]);
            if (converted === undefined) { badDateField = field; break; }
            if (converted !== null) (vehicleData as Record<string, unknown>)[field] = converted;
          }
          if (badDateField) {
            failed.push({ licensePlate, error: `${badDateField} is not a date we can read (use dd-mm-yyyy or yyyy-MM-dd)` });
            continue;
          }
          
          // Handle boolean fields
          const booleanFieldMappings: { [key: string]: string } = {
            gps: 'gps',
            roadsideAssistance: 'roadsideAssistance',
            spareKey: 'spareKey',
            winterTires: 'winterTires',
          };
          
          for (const [inputField, dbField] of Object.entries(booleanFieldMappings)) {
            if (vehicleInput[inputField]) {
              const value = vehicleInput[inputField].toLowerCase();
              vehicleData[dbField] = (value === 'ja' || value === 'yes' || value === 'true' || value === '1' || value === 'x' || value === '✓');
            }
          }
          
          // Handle production date
          if (vehicleInput.productionDate) {
            // Try to parse the date - could be year only or full date
            const dateStr = vehicleInput.productionDate.trim();
            if (/^\d{4}$/.test(dateStr)) {
              // Year only - set to January 1st of that year
              vehicleData.productionDate = `${dateStr}-01-01`;
            } else {
              vehicleData.productionDate = dateStr;
            }
          }

          const vehicle = await storage.createVehicle(vehicleData);
          imported.push({ 
            licensePlate, 
            brand: vehicle.brand,
            model: vehicle.model,
            vehicle 
          });
          
          // Broadcast real-time update
          realtimeEvents.vehicles.created(vehicle);
        } catch (error) {
          console.error(`Error importing vehicle:`, error);
          failed.push({ 
            licensePlate: vehicleInput.licensePlate || "Unknown", 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }

      res.json({ imported, failed });
    } catch (error) {
      console.error("Error in CSV bulk import:", error);
      res.status(500).json({ message: "Failed to process CSV bulk import" });
    }
  });

  // Update vehicle
  app.patch("/api/vehicles/:id", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }
      
      console.log("Received vehicle update data:", JSON.stringify(req.body));

      // Create a sanitized copy of the request body
      const sanitizedData = { ...req.body };

      // Authorization for a mileage decrease travels alongside the vehicle data,
      // but is not a vehicle field - keep it out of the update payload.
      const mileageOverridePassword = sanitizedData.mileageOverridePassword;
      delete sanitizedData.mileageOverridePassword;
      
      // Ensure all values are properly formatted

      // Convert empty string values to null for numeric fields
      if (sanitizedData.departureMileage === '') sanitizedData.departureMileage = null;
      if (sanitizedData.returnMileage === '') sanitizedData.returnMileage = null;
      if (sanitizedData.monthlyPrice === '') sanitizedData.monthlyPrice = null;
      if (sanitizedData.dailyPrice === '') sanitizedData.dailyPrice = null;
      
      // Convert values for boolean fields
      const booleanFields = [
        'damageCheck', 'winterTires', 'roadsideAssistance', 'spareKey', 
        'wokNotification', 'seatcovers', 'backupbeepers', 'gps', 'adBlue'
      ];
      
      // Only normalize the flags the request actually carries. This is a PATCH:
      // defaulting an absent flag to false turned a mileage-only edit into a
      // silent wipe of gps, spareKey, winterTires and the rest. The vehicle form
      // always sends every flag explicitly, so nothing depends on that default.
      booleanFields.forEach(field => {
        if (field in sanitizedData) {
          const value = sanitizedData[field];
          sanitizedData[field] = value === true || value === 'true' || value === 1 || value === '1';
        }
      });
      
      // Handle registration fields - convert to strings since they're stored as text in the DB
      if ('registeredTo' in sanitizedData) {
        const value = sanitizedData.registeredTo;
        sanitizedData.registeredTo = (value === true || value === 'true' || value === 1 || value === '1') ? "true" : "false";
      }
      
      if ('company' in sanitizedData) {
        const value = sanitizedData.company;
        sanitizedData.company = (value === true || value === 'true' || value === 1 || value === '1') ? "true" : "false";
      }
      
      // Clean date fields that are empty strings
      Object.keys(sanitizedData).forEach(key => {
        if (key.toLowerCase().includes('date') && sanitizedData[key] === "") {
          sanitizedData[key] = null;
        }
      });
      
      console.log("Sanitized vehicle update data:", JSON.stringify(sanitizedData));

      // Get the existing vehicle first to merge with updates
      const existingVehicle = await storage.getVehicle(id);
      if (!existingVehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // BUG-122 / FIX-D: this used to be `insertVehicleSchema.parse({...existingVehicle, ...body})`
      // followed by an UPDATE of every parsed column — a read-merge-write that
      // overwrote whatever a colleague had changed between the read and the write,
      // and that re-validated (and could therefore start rejecting) columns the
      // request never mentioned. Validate and write only what was sent.
      const vehicleData = parsePartialUpdate(sanitizedData, {
        table: vehicles,
        schema: insertVehicleSchema,
        // BUG-125: the barcode identifies the row and is assigned by the server
        // (VEH-<id>); an edit may not overwrite it, or a scan points at the
        // wrong vehicle. Admins regenerate it through the dedicated route.
        strip: ["registeredToBy", "companyBy", "mileageDecreasedBy", "mileageDecreasedAt", "previousMileage", "barcode"],
        message: "Invalid vehicle data",
      });

      // BUG-020: an edit may not land on another vehicle's plate either.
      if (vehicleData.licensePlate) {
        const clash = await findVehicleByNormalisedPlate(vehicleData.licensePlate);
        if (clash && clash.id !== id) {
          return res.status(409).json({
            message: "A vehicle with this license plate already exists. Please use a different license plate or edit the existing vehicle.",
            field: "licensePlate",
            conflictingVehicleId: clash.id,
          });
        }
      }
      
      // Validate status change if availability status is being updated.
      // BUG-021: `validateManualStatusChange` now refuses anything outside the
      // five-value enum instead of falling through to `{allowed:true}` — this
      // is where "banana_not_real" used to get in.
      let statusWarning: string | undefined;
      if (sanitizedData.availabilityStatus !== undefined &&
          sanitizedData.availabilityStatus !== existingVehicle.availabilityStatus) {
        const currentStatus = (existingVehicle.availabilityStatus || 'available') as VehicleAvailabilityStatus;
        const newStatus = sanitizedData.availabilityStatus as VehicleAvailabilityStatus;
        
        // Get all reservations to build context
        const allReservations = await storage.getAllReservations();
        const context = getVehicleStatusContext(existingVehicle, allReservations);
        
        const validation = validateManualStatusChange(currentStatus, newStatus, context);
        
        if (!validation.allowed) {
          return res.status(400).json({ 
            message: validation.error || 'Status change not allowed',
            field: 'availabilityStatus'
          });
        }
        
        // BUG-146: the state machine exists precisely to warn staff when they
        // take a booked or rented vehicle out of service. The warning was built
        // and then thrown away in a console.log; nobody ever saw it.
        statusWarning = validation.warning;

        // FIX-H — one source of truth for "is this car in the workshop". A
        // manual needs_fixing now raises the workshop flag, and a manual
        // 'available' lowers it, so vehicles.maintenance_status and
        // vehicles.availability_status can no longer contradict each other
        // (BUG-109: `available` sitting next to `in_service`).
        if (newStatus === 'needs_fixing' && existingVehicle.maintenanceStatus === 'ok') {
          vehicleData.maintenanceStatus = 'needs_service';
        } else if (newStatus === 'available' && existingVehicle.maintenanceStatus !== 'ok') {
          vehicleData.maintenanceStatus = 'ok';
          vehicleData.maintenanceNote = null;
        }
      }
      
      // The registration tracking fields no longer need to be "preserved": a
      // partial update never touches a column it was not given.
      const user = req.user;
      const dataWithTracking: Record<string, any> = {
        ...vehicleData,
        updatedBy: user ? user.username : null,
      };
      
      // A decrease needs the same authorization as one entered at pickup
      const newMileage = sanitizedData.currentMileage !== undefined ? parseInt(sanitizedData.currentMileage) : null;
      const oldMileage = existingVehicle.currentMileage;
      if (newMileage !== null && !isNaN(newMileage) && oldMileage !== null && newMileage < oldMileage) {
        const authorization = await authorizeMileageDecrease(req, mileageOverridePassword, {
          oldMileage,
          newMileage,
        });

        if (!authorization.ok) {
          return res.status(authorization.status).json(authorization.body);
        }

        dataWithTracking.mileageDecreasedBy = authorization.authorizedBy;
        dataWithTracking.mileageDecreasedAt = new Date();
        dataWithTracking.previousMileage = oldMileage;
        console.log(`[Mileage Decrease] Vehicle ${id}: ${oldMileage} -> ${newMileage} by ${authorization.authorizedBy}`);
      }
      
      const vehicle = await storage.updateVehicle(id, dataWithTracking);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.vehicles.updated(vehicle);
      
      // BUG-146: the warning travels with the response so the vehicle form can
      // show it. The body is otherwise byte-identical to what it always was.
      res.json(statusWarning ? { ...vehicle, warning: statusWarning } : vehicle);
    } catch (error) {
      // BUG-148: a duplicate barcode used to come back as the raw constraint
      // text 'duplicate key value violates unique constraint vehicles_barcode_unique'.
      sendRouteError(res, error, "Invalid vehicle data");
    }
  });
  
  // Maintenance status toggle from the barcode scan panel. Routes through
  // storage.markVehicleForService (same path used by transport swaps and
  // reservation mark-needs-service) instead of the generic PATCH above, which
  // would force-false every equipment boolean not present in this request
  // body and skip the needs_fixing/available availabilityStatus transition.
  app.patch("/api/vehicles/:id/maintenance-status", requireAuth, hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      // FIX-H — the same allowlist the rest of the app uses, in one place.
      const { status: rawStatus, note } = req.body;
      const status = assertVehicleMaintenanceStatus(rawStatus);

      const existingVehicle = await storage.getVehicle(id);
      if (!existingVehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      await storage.markVehicleForService(id, status, note);

      // BUG-154: this route was the only workshop toggle that did not touch the
      // maintenance block it belongs to, so `vehicles.maintenance_status` said
      // `in_service` while the block on the calendar still said `scheduled`, and
      // the portal customer was never told the car had gone in. Two sources of
      // truth for "is it in the workshop"; now one, and the same portal hook
      // `PATCH /api/reservations/:id` already fires.
      const today = new Date().toISOString().split('T')[0];
      const openBlocks = (await storage.getReservationsByVehicle(id)).filter((r) =>
        r.type === 'maintenance_block' &&
        !r.deletedAt &&
        r.status !== 'cancelled' &&
        r.status !== 'completed' &&
        (!r.endDate || r.endDate >= today),
      );
      const targetBlockStatus = BLOCK_TO_VEHICLE_MAINTENANCE[status];
      for (const block of openBlocks) {
        if (block.maintenanceStatus === targetBlockStatus) continue;
        const updatedBlock = await storage.updateReservation(block.id, {
          maintenanceStatus: targetBlockStatus,
          updatedBy: (req.user as any)?.username ?? null,
        } as any);
        if (updatedBlock) void onMaintenanceBlockChanged(block, updatedBlock);
      }

      const vehicle = await storage.getVehicle(id);

      // Broadcast real-time update to all connected clients
      if (vehicle) {
        realtimeEvents.vehicles.updated(vehicle);
      }

      res.json(vehicle);
    } catch (error) {
      sendRouteError(res, error, "Failed to update vehicle maintenance status");
    }
  });

  // Update vehicle mileage only (special endpoint for partial updates)
  app.patch("/api/vehicles/:id/mileage", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }
      
      // Get existing vehicle
      const vehicle = await storage.getVehicle(id);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Check if the request contains valid mileage fields
      const updateData: Record<string, any> = {};
      
      // Update currentMileage (the vehicle's current odometer reading)
      if (req.body.currentMileage !== undefined) {
        const mileage = parseInt(req.body.currentMileage);
        if (!isNaN(mileage)) {
          updateData.currentMileage = mileage;
        }
      }
      
      // Update departureMileage (when vehicle leaves/is picked up)
      if (req.body.departureMileage !== undefined) {
        const mileage = parseInt(req.body.departureMileage);
        if (!isNaN(mileage)) {
          updateData.departureMileage = mileage;
        }
      }
      
      // Update returnMileage (when vehicle is returned)
      if (req.body.returnMileage !== undefined) {
        const mileage = parseInt(req.body.returnMileage);
        if (!isNaN(mileage)) {
          updateData.returnMileage = mileage;
          // Also update currentMileage to match the return mileage
          updateData.currentMileage = mileage;
        }
      }
      
      // Only update if we have valid data
      if (Object.keys(updateData).length > 0) { // Check if we have any data to update
        // Preserve registration tracking fields
        const { registeredToBy, companyBy } = vehicle;
        
        // Add user tracking information
        const user = req.user;
        const dataWithTracking: Record<string, any> = {
          ...updateData,
          updatedBy: user ? user.username : null,
          // Preserve the registration tracking fields
          registeredToBy,
          companyBy
        };
        
        // A decrease needs the same authorization as one entered at pickup
        const newMileage = updateData.currentMileage;
        const oldMileage = vehicle.currentMileage;
        if (newMileage !== undefined && oldMileage !== null && newMileage < oldMileage) {
          const authorization = await authorizeMileageDecrease(req, req.body.mileageOverridePassword, {
            oldMileage,
            newMileage,
          });

          if (!authorization.ok) {
            return res.status(authorization.status).json(authorization.body);
          }

          dataWithTracking.mileageDecreasedBy = authorization.authorizedBy;
          dataWithTracking.mileageDecreasedAt = new Date();
          dataWithTracking.previousMileage = oldMileage;
          console.log(`[Mileage Decrease] Vehicle ${id}: ${oldMileage} -> ${newMileage} by ${authorization.authorizedBy}`);
        }
        
        const updatedVehicle = await storage.updateVehicle(id, dataWithTracking);
        
        // Broadcast real-time update to all connected clients
        realtimeEvents.vehicles.updated(updatedVehicle);
        
        return res.json(updatedVehicle);
      } else {
        return res.status(400).json({ message: "No valid mileage data provided" });
      }
    } catch (error) {
      console.error("Error updating vehicle mileage:", error);
      return res.status(500).json({ 
        message: "Failed to update vehicle mileage", 
      });
    }
  });
  
  // Toggle vehicle registration status
  app.patch("/api/vehicles/:id/toggle-registration", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      const { status } = req.body;
      if (status !== 'opnaam' && status !== 'not-opnaam' && status !== 'bv' && status !== 'not-bv') {
        return res.status(400).json({ message: "Invalid status. Must be 'opnaam', 'not-opnaam', 'bv', or 'not-bv'" });
      }
      
      const vehicle = await storage.getVehicle(id);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      const currentDate = new Date().toISOString().split('T')[0];
      
      // More extensive logging for debugging authentication state
      console.log("TOGGLE REGISTRATION - Complete authentication state:", {
        isAuthenticated: req.isAuthenticated(),
        userExists: !!req.user,
        sessionID: req.sessionID,
        userObject: req.user,
        session: req.session
      });
      
      // Get the actual user from the database if possible, to ensure we have the full object
      let username = "admin"; // Default fallback for development
      
      if (req.user) {
        if (typeof req.user === 'object') {
          if ('username' in req.user) {
            username = req.user.username;
            console.log("Found username directly in user object:", username);
          } else if ('id' in (req.user as object)) {
            try {
              const userId = (req.user as { id: number }).id;
              const fullUser = await storage.getUser(userId);
              if (fullUser && fullUser.username) {
                username = fullUser.username;
                console.log("Retrieved username from database using ID:", username);
              }
            } catch (err) {
              console.error("Error retrieving user details:", err);
            }
          } else {
            console.log("User object exists but lacks id and username properties:", req.user);
          }
        } else {
          console.log("User exists but is not an object:", typeof req.user);
        }
      } else {
        console.log("No user object in request");
      }
      
      // Create update data with user attribution
      let updateData;

      // Get the current vehicle to know its status
      const currentVehicle = await storage.getVehicle(id);
      if (!currentVehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Now we handle four cases using our specialized method instead of general update
      // 1. Setting registeredTo to true (opnaam status)
      // 2. Setting registeredTo to false (removing opnaam status)
      // 3. Setting company to true (bv status)
      // 4. Setting company to false (removing bv status)
      
      // Note: Validation for status is already done above
      
      console.log(`Updating vehicle ${id} registration status to ${status} by user:`, username);
      
      // Declare variable outside try block to maintain scope
      let updatedVehicle;
      
      try {
        // Use the dedicated method that only updates the relevant field
        updatedVehicle = await storage.updateVehicleRegistrationStatus(id, status, {
          username,
          date: currentDate
        });
        
        if (!updatedVehicle) {
          return res.status(500).json({ message: "Failed to update vehicle registration status" });
        }
        
        console.log("Database response:", JSON.stringify(updatedVehicle, null, 2));
        
        // Verify if the update was applied correctly - fetch the vehicle again
        const verifiedVehicle = await storage.getVehicle(id);
        console.log("Vehicle after update:", JSON.stringify(verifiedVehicle, null, 2));
      } catch (error) {
        console.error("Error in toggle-registration endpoint:", error);
        return res.status(400).json({ message: `Error toggling registration status: ${error instanceof Error ? error.message : String(error)}` });
      }
      
      // If we've reached here, the update was successful
      if (!updatedVehicle) {
        // This is a fallback - if somehow we get here without an error but also without data
        // Use the verified vehicle data
        updatedVehicle = await storage.getVehicle(id);
      }
      
      // Store last action to ensure history shows the correct user for this specific action
      let historyNote;
      
      if (status === 'opnaam') {
        historyNote = `Registration set to Opnaam by ${username}`;
      } else if (status === 'not-opnaam') {
        historyNote = `Opnaam registration removed by ${username}`;
      } else if (status === 'bv') {
        historyNote = `Registration set to BV by ${username}`;
      } else if (status === 'not-bv') {
        historyNote = `BV registration removed by ${username}`;
      }
        
      // Log the history action
      console.log("Vehicle registration history action:", historyNote);
      
      // Add tracking to response
      const vehicleWithAudit = {
        ...updatedVehicle,
        lastAction: historyNote
      };
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.vehicles.updated(vehicleWithAudit);
      
      res.json(vehicleWithAudit);
    } catch (error) {
      console.error("Error in toggle-registration endpoint:", error);
      res.status(400).json({ message: "Error toggling registration status", error });
    }
  });

  // Update fuel status (with optional receipt upload)
  app.patch("/api/vehicles/:id/fuel-status", 
    hasPermission(UserPermission.MANAGE_VEHICLES), 
    fuelReceiptUpload.single('receipt'),
    async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      const vehicle = await storage.getVehicle(id);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      const { fuelLevel, cost, notes } = req.body;

      // Canonical casing the app writes everywhere ("Full"/"Empty"); accept
      // any case (and legacy lowercase rows) and normalize before storing.
      const fuelLevelCanonical: Record<string, string> = {
        'empty': 'Empty', '1/4': '1/4', '1/2': '1/2', '3/4': '3/4', 'full': 'Full',
      };
      const normalizedFuelLevel = fuelLevel ? fuelLevelCanonical[fuelLevel.toLowerCase()] : undefined;
      if (fuelLevel && !normalizedFuelLevel) {
        return res.status(400).json({
          message: "Invalid fuel level. Must be one of: Empty, 1/4, 1/2, 3/4, Full"
        });
      }

      // Build update data
      const updateData: any = {
        updatedBy: req.user ? (req.user as any).username : null,
      };

      if (normalizedFuelLevel) {
        updateData.currentFuelLevel = normalizedFuelLevel;
        updateData.fuelRefillDate = new Date();
      }
      
      if (cost) {
        updateData.fuelRefillCost = cost;
      }
      
      if (notes) {
        updateData.fuelRefillNotes = notes;
      }
      
      // Handle receipt upload
      if (req.file) {
        // Post-upload validation - verify file content matches declared type
        const validation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'document'
        );
        if (!validation.valid) {
          return res.status(400).json({ message: validation.error });
        }
        
        const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
        const relativePath = path.join(sanitizedPlate, 'fuel_receipt', req.file.filename);
        updateData.fuelRefillReceipt = `uploads/${relativePath}`;
        console.log(`Fuel receipt uploaded: ${updateData.fuelRefillReceipt}`);
      }

      // Update vehicle
      const updatedVehicle = await storage.updateVehicle(id, updateData);
      
      if (!updatedVehicle) {
        return res.status(500).json({ message: "Failed to update vehicle fuel status" });
      }

      // Broadcast real-time update to all connected clients
      realtimeEvents.vehicles.updated(updatedVehicle);

      res.json(updatedVehicle);
    } catch (error) {
      console.error("Error updating fuel status:", error);
      res.status(500).json({ 
        message: "Failed to update fuel status", 
      });
    }
  });

  // What a vehicle delete would take with it. Shown in the confirmation dialog
  // so nobody removes a car without seeing the rentals attached to it.
  app.get("/api/vehicles/:id/delete-impact", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      const impact = await storage.getVehicleDeleteImpact?.(id);
      if (!impact) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // besluiten B-14 (BUG-022) — the same body the customer side has had
      // since B-08: what goes with it, and what refuses the delete.
      res.json({
        licensePlate: impact.vehicle.licensePlate,
        brand: impact.vehicle.brand,
        model: impact.vehicle.model,
        counts: impact.counts,
        blocked: impact.blockingReservations.length > 0,
        blockingReservations: impact.blockingReservations.map((r) => ({
          id: r.id, customerId: r.customerId, startDate: r.startDate, endDate: r.endDate,
          status: r.status, type: r.type,
        })),
        restorable: true,
      });
    } catch (error) {
      console.error("Error building vehicle delete impact:", error);
      res.status(500).json({ message: "Error building delete impact" });
    }
  });

  // Delete vehicle
  app.delete("/api/vehicles/:id", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      // Require the license plate to be typed back, so a stray click cannot
      // wipe a vehicle and its rentals.
      const confirmation = typeof req.body?.confirmLicensePlate === 'string'
        ? req.body.confirmLicensePlate
        : '';
      const impact = await storage.getVehicleDeleteImpact?.(id);
      if (!impact) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      const normalize = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (normalize(confirmation) !== normalize(impact.vehicle.licensePlate)) {
        await AuditLogger.logFromRequest(
          req,
          'vehicle.delete',
          'vehicle',
          id,
          { reason: 'confirmation_mismatch', licensePlate: impact.vehicle.licensePlate },
          'failure',
        );
        return res.status(400).json({
          code: "CONFIRMATION_REQUIRED",
          message: `Type the license plate ${impact.vehicle.licensePlate} to confirm deleting this vehicle.`,
        });
      }

      const result = await storage.deleteVehicle(id, {
        username: req.user?.username ?? null,
        userId: req.user?.id ?? null,
      });

      // besluiten B-14 (BUG-022) — refused while a rental is live or planned,
      // the same shape as the customer rule of B-08.
      if (!result.deleted && result.reason === 'has_live_reservations') {
        await AuditLogger.logFromRequest(
          req,
          'vehicle.delete',
          'vehicle',
          id,
          { reason: 'has_live_reservations', licensePlate: impact.vehicle.licensePlate },
          'failure',
        );
        return res.status(409).json({
          message: "Dit voertuig heeft een lopende of geplande huur en kan niet worden verwijderd.",
          code: "VEHICLE_HAS_LIVE_RESERVATIONS",
          blockingReservations: (result.blockingReservations ?? []).map((r) => ({
            id: r.id, customerId: r.customerId, startDate: r.startDate, endDate: r.endDate,
            status: r.status, type: r.type,
          })),
        });
      }

      if (!result.deleted) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      await AuditLogger.logFromRequest(
        req,
        'vehicle.delete',
        'vehicle',
        id,
        {
          licensePlate: impact.vehicle.licensePlate,
          brand: impact.vehicle.brand,
          model: impact.vehicle.model,
          cascaded: impact.counts,
        },
      );

      // Broadcast real-time update to all connected clients
      realtimeEvents.vehicles.deleted({ id });

      res.json({
        success: true,
        message: "Vehicle successfully deleted",
        restorable: true,
      });
    } catch (error) {
      // BUG-148: this used to serialise the entire pg error object — code,
      // detail with a row id, schema, table, constraint and the server source file.
      console.error("Error deleting vehicle:", error);
      const dbError = describeDbError(error, "Error deleting vehicle");
      res.status(dbError.status).json(dbErrorBody(dbError));
    }
  });

  // ==================== RECYCLE BIN ROUTES ====================
  app.get("/api/deleted-records", requireAdmin, async (req: Request, res: Response) => {
    try {
      const records = (await storage.getDeletedRecords?.(100)) || [];
      // The full snapshot can be megabytes; the list only needs the headline.
      res.json(records.map((record: any) => ({
        id: record.id,
        entityType: record.entityType,
        entityId: record.entityId,
        label: record.label,
        relatedCounts: record.relatedCounts,
        deletedAt: record.deletedAt,
        deletedBy: record.deletedBy,
        restoredAt: record.restoredAt,
        restoredBy: record.restoredBy,
      })));
    } catch (error) {
      console.error("Error listing deleted records:", error);
      res.status(500).json({ message: "Error listing deleted records" });
    }
  });

  app.post("/api/deleted-records/:id/restore", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid record ID" });
      }

      const result = await storage.restoreDeletedRecord?.(id, {
        username: req.user?.username ?? null,
      });

      if (!result || !result.restored) {
        const reasons: Record<string, string> = {
          not_found: "That deleted record no longer exists.",
          already_restored: "This record was already restored.",
          unsupported_type: "Restoring this record type is not supported yet.",
          empty_snapshot: "The stored snapshot is empty, so there is nothing to restore.",
          id_taken: "Another vehicle already uses the original ID, so it cannot be restored.",
          license_plate_taken: "A vehicle with the same license plate already exists. Delete or rename it first.",
          // BUG-126: the barcode is unique too, and used to come back as a 500.
          barcode_taken: "Another vehicle already uses the same barcode. Clear it there first.",
          // besluiten B-15 (BUG-151, BUG-140) — the reservation and transport
          // halves of the bin.
          reservation_conflict: "Deze reservering kan niet terug: het voertuig is in de tussentijd geboekt voor die periode.",
        };
        const reason = result?.reason || 'not_found';
        return res.status(reason === 'not_found' ? 404 : 409).json({
          code: reason.toUpperCase(),
          message: reasons[reason] || "Could not restore this record.",
        });
      }

      const entityType = result.record?.entityType ?? 'vehicle';
      await AuditLogger.logFromRequest(
        req,
        `${entityType}.restore` as any,
        entityType,
        result.record?.entityId,
        { restoredFromDeletedRecord: id, label: result.record?.label },
      );

      if (entityType === 'vehicle') realtimeEvents.vehicles.created({ id: result.record?.entityId });
      // besluiten B-15 — the calendar has to see a restored reservation at once,
      // otherwise the row is back but the screen still shows the free slot.
      if (entityType === 'reservation' && result.record?.entityId != null) {
        const restoredReservation = await storage.getReservation(result.record.entityId);
        if (restoredReservation) {
          realtimeEvents.reservations.updated(restoredReservation);
          await storage.recomputeVehicleAvailability(restoredReservation.vehicleId);
        }
      }

      res.json({ success: true, message: `Restored ${result.record?.label ?? 'record'}.` });
    } catch (error) {
      console.error("Error restoring deleted record:", error);
      res.status(500).json({
        message: "Error restoring deleted record",
      });
    }
  });

  // ==================== VEHICLE-CUSTOMER BLACKLIST ROUTES ====================
  // Get blacklisted customers for a vehicle
  app.get("/api/vehicles/:id/blacklist", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.id);
      if (isNaN(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      const blacklistEntries = await storage.getBlacklistedCustomersForVehicle(vehicleId);
      
      // Enrich with customer info
      const enrichedEntries = await Promise.all(
        blacklistEntries.map(async (entry) => {
          const customer = await storage.getCustomer(entry.customerId);
          const createdByUser = entry.createdBy ? await storage.getUser(entry.createdBy) : null;
          return {
            ...entry,
            customer: customer ? { id: customer.id, name: customer.name, email: customer.email } : null,
            createdByUsername: createdByUser?.username || null
          };
        })
      );

      res.json(enrichedEntries);
    } catch (error) {
      console.error("Error fetching blacklist for vehicle:", error);
      res.status(500).json({ message: "Failed to fetch blacklist" });
    }
  });

  // Get blacklisted vehicles for a customer
  app.get("/api/customers/:id/blacklist", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const blacklistEntries = await storage.getBlacklistedVehiclesForCustomer(customerId);
      
      // Enrich with vehicle info
      const enrichedEntries = await Promise.all(
        blacklistEntries.map(async (entry) => {
          const vehicle = await storage.getVehicle(entry.vehicleId);
          const createdByUser = entry.createdBy ? await storage.getUser(entry.createdBy) : null;
          return {
            ...entry,
            vehicle: vehicle ? { id: vehicle.id, licensePlate: vehicle.licensePlate, brand: vehicle.brand, model: vehicle.model } : null,
            createdByUsername: createdByUser?.username || null
          };
        })
      );

      res.json(enrichedEntries);
    } catch (error) {
      console.error("Error fetching blacklist for customer:", error);
      res.status(500).json({ message: "Failed to fetch blacklist" });
    }
  });

  // Add customer to vehicle blacklist
  app.post("/api/vehicles/:id/blacklist", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.id);
      if (isNaN(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      const { customerId, reason } = req.body;
      if (!customerId || isNaN(parseInt(customerId))) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      // Check if vehicle exists
      const vehicle = await storage.getVehicle(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // Check if customer exists
      const customer = await storage.getCustomer(parseInt(customerId));
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Check if already blacklisted
      const isBlacklisted = await storage.isCustomerBlacklistedForVehicle(vehicleId, parseInt(customerId));
      if (isBlacklisted) {
        return res.status(400).json({ message: "Customer is already blacklisted for this vehicle" });
      }

      const user = req.user;
      const entry = await storage.addToBlacklist({
        vehicleId,
        customerId: parseInt(customerId),
        reason: reason || null,
        createdBy: user?.id || null
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error("Error adding to blacklist:", error);
      res.status(500).json({ message: "Failed to add to blacklist" });
    }
  });

  // Remove from blacklist
  app.delete("/api/blacklist/:id", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid blacklist entry ID" });
      }

      const deleted = await storage.removeFromBlacklist(id);
      if (!deleted) {
        return res.status(404).json({ message: "Blacklist entry not found" });
      }

      res.json({ success: true, message: "Customer removed from blacklist" });
    } catch (error) {
      console.error("Error removing from blacklist:", error);
      res.status(500).json({ message: "Failed to remove from blacklist" });
    }
  });

  // Check if customer is blacklisted for a vehicle
  app.get("/api/vehicles/:vehicleId/blacklist/check/:customerId", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.vehicleId);
      const customerId = parseInt(req.params.customerId);
      
      if (isNaN(vehicleId) || isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid vehicle or customer ID" });
      }

      const isBlacklisted = await storage.isCustomerBlacklistedForVehicle(vehicleId, customerId);
      res.json({ isBlacklisted });
    } catch (error) {
      console.error("Error checking blacklist:", error);
      res.status(500).json({ message: "Failed to check blacklist" });
    }
  });

  // Get all blacklist entries (for filtering in reservation form)
  app.get("/api/blacklist", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      // Get all vehicles and their blacklisted customers
      const vehicles = await storage.getAllVehicles();
      const allBlacklistEntries: Array<{ vehicleId: number; customerId: number }> = [];
      
      for (const vehicle of vehicles) {
        const entries = await storage.getBlacklistedCustomersForVehicle(vehicle.id);
        for (const entry of entries) {
          allBlacklistEntries.push({ vehicleId: entry.vehicleId, customerId: entry.customerId });
        }
      }

      res.json(allBlacklistEntries);
    } catch (error) {
      console.error("Error fetching all blacklist entries:", error);
      res.status(500).json({ message: "Failed to fetch blacklist entries" });
    }
  });

  // Lookup vehicle via RDW API
  app.get("/api/rdw/vehicle/:licensePlate", requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req, res) => {
    try {
      const licensePlate = req.params.licensePlate;
      const vehicleInfo = await fetchVehicleInfoByLicensePlate(licensePlate);
      res.json(vehicleInfo);
    } catch (error) {
      console.error("RDW API lookup error:", error);
      
      if (error instanceof RDWNotFoundError) {
        return res.status(404).json({ 
          message: "Vehicle not found", 
        });
      }
      
      if (error instanceof RDWTimeoutError) {
        return res.status(504).json({ 
          message: "RDW service timeout", 
        });
      }
      
      if (error instanceof RDWUpstreamError) {
        return res.status(502).json({ 
          message: "RDW service error", 
        });
      }
      
      // Fallback for unexpected errors
      res.status(500).json({ 
        message: "Failed to fetch vehicle information from RDW", 
      });
    }
  });

  // ==================== CUSTOMER ROUTES ====================
  // Get all customers with optional search
  app.get("/api/customers", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      // Prevent caching to ensure fresh data is always returned
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const searchQuery = req.query.search as string | undefined;
      const customers = await storage.getAllCustomers(searchQuery);
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers", error });
    }
  });

  // Get customers with reservation status
  app.get("/api/customers/with-reservations", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      // BUG-226: this used to load every reservation — with its embedded
      // vehicle and customer, 8 MB of objects — to compute one boolean per
      // customer. The predicate now runs in Postgres and comes back as a set
      // of ids; the answer is identical.
      const [customers, activeCustomerIds] = await Promise.all([
        storage.getAllCustomers(),
        storage.getCustomerIdsWithActiveReservation(),
      ]);

      res.json(customers.map(customer => ({
        ...customer,
        hasActiveReservation: activeCustomerIds.has(customer.id),
      })));
    } catch (error) {
      console.error("Error fetching customers with reservations:", error);
      res.status(500).json({ message: "Failed to fetch customers with reservations", error });
    }
  });

  // Get single customer
  app.get("/api/customers/:id", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    const customer = await storage.getCustomer(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(customer);
  });

  // Create customer
  app.post("/api/customers", hasPermission(UserPermission.MANAGE_CUSTOMERS), async (req: Request, res: Response) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      
      // Add user tracking information
      const user = req.user;
      const dataWithTracking = {
        ...customerData,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null
      };
      
      const customer = await storage.createCustomer(dataWithTracking);
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.customers.created(customer);
      
      res.status(201).json(customer);
    } catch (error) {
      res.status(400).json({ message: "Invalid customer data", error });
    }
  });

  // Update customer
  app.patch("/api/customers/:id", hasPermission(UserPermission.MANAGE_CUSTOMERS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const customerData = insertCustomerSchema.partial().parse(req.body);
      
      // Add user tracking information for updates
      const user = req.user;
      const username = user ? user.username : null;
      
      // Get the current customer to check if status has changed
      const existingCustomer = await storage.getCustomer(id);
      
      if (!existingCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      
      // Add tracking information
      const dataWithTracking = {
        ...customerData,
        updatedBy: username
      };
      
      // Specifically track status changes
      if (customerData.status && customerData.status !== existingCustomer.status) {
        dataWithTracking.statusBy = username;
        dataWithTracking.statusDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      }
      
      const customer = await storage.updateCustomer(id, dataWithTracking);
      
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.customers.updated(customer);
      
      res.json(customer);
    } catch (error) {
      console.error("Customer update error:", error);
      res.status(400).json({ message: "Invalid customer data", error });
    }
  });

  // Delete customer
  /**
   * besluiten **B-08** — the impact list the delete dialog shows first. The
   * vehicle side has had this since before the audit; the customer side had
   * nothing, which is how BUG-007 (a 204 and a `booked` reservation pointing
   * at a customer that no longer exists) happened.
   */
  app.get("/api/customers/:id/delete-impact", hasPermission(UserPermission.MANAGE_CUSTOMERS), async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const impact = await storage.getCustomerDeleteImpact?.(id);
    if (!impact) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json({
      customer: { id: impact.customer.id, name: impact.customer.name, companyName: impact.customer.companyName },
      counts: impact.counts,
      blocked: impact.blockingReservations.length > 0,
      blockingReservations: impact.blockingReservations.map((r) => ({
        id: r.id, vehicleId: r.vehicleId, startDate: r.startDate, endDate: r.endDate, status: r.status,
      })),
      restorable: true,
    });
  });

  app.delete("/api/customers/:id", hasPermission(UserPermission.MANAGE_CUSTOMERS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      // besluiten B-08 — recycle bin plus a block while a current or future
      // rental exists. BUG-007 (CRITICAL): this was a bare hard delete with no
      // impact check and no snapshot.
      const user = req.user as any;
      const result = await storage.deleteCustomer(id, { username: user?.username ?? null, userId: user?.id ?? null });

      if (!result.deleted && result.reason === "has_live_reservations") {
        return res.status(409).json({
          message: "Deze klant heeft een lopende of toekomstige reservering en kan niet worden verwijderd.",
          code: "CUSTOMER_HAS_LIVE_RESERVATIONS",
          blockingReservations: (result.blockingReservations ?? []).map((r) => ({
            id: r.id, vehicleId: r.vehicleId, startDate: r.startDate, endDate: r.endDate, status: r.status,
          })),
        });
      }
      if (!result.deleted) {
        return res.status(404).json({ message: "Customer not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.customers.deleted({ id });
      
      res.status(204).send();
    } catch (error) {
      // BUG-148: no raw pg error object in the response.
      console.error("Error deleting customer:", error);
      const dbError = describeDbError(error, "Failed to delete customer");
      res.status(dbError.status).json(dbErrorBody(dbError));
    }
  });


  // ==================== RESERVATION ROUTES ====================
  // Get reservations for a date range
  app.get("/api/reservations/range", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Missing startDate or endDate query parameters" });
      }
      
      // Disable HTTP caching to ensure fresh data after deletions
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const reservations = await storage.getReservationsInDateRange(startDate, endDate);
      res.json(reservations);
    } catch (error) {
      console.error("Error getting reservations by range:", error);
      res.status(500).json({ message: "Error getting reservations" });
    }
  });
  
  app.get("/api/reservations/range/:startDate/:endDate", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const { startDate, endDate } = req.params;
    // Disable HTTP caching to ensure fresh data after deletions
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const reservations = await storage.getReservationsInDateRange(startDate, endDate);
    res.json(reservations);
  });

  // Get upcoming reservations
  app.get("/api/reservations/upcoming", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    // Disable HTTP caching to ensure fresh data after deletions
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const reservations = await storage.getUpcomingReservations();
    res.json(reservations);
  });

  // Get upcoming maintenance reservations
  app.get("/api/reservations/upcoming-maintenance", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE), async (req, res) => {
    // Disable HTTP caching to ensure fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const reservations = await storage.getUpcomingMaintenanceReservations();
    res.json(reservations);
  });

  // Get reservations by vehicle
  app.get("/api/reservations/vehicle/:vehicleId", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }

    const reservations = await storage.getReservationsByVehicle(vehicleId);
    res.json(reservations);
  });

  // Get ALL overdue reservations (picked_up but past end date - customer still has the vehicle)
  app.get("/api/reservations/overdue", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
      const overdueReservations = await storage.getAllOverdueReservations();
      res.json(overdueReservations);
    } catch (error) {
      console.error("Error fetching all overdue reservations:", error);
      res.status(500).json({ message: "Failed to fetch overdue reservations" });
    }
  });

  // Get overdue reservations for a vehicle (ended 3+ days ago, not completed)
  app.get("/api/reservations/overdue/:vehicleId", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    const daysOverdue = parseInt(req.query.days as string) || 3;
    
    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }

    try {
      const overdueReservations = await storage.getOverdueReservationsByVehicle(vehicleId, daysOverdue);
      res.json(overdueReservations);
    } catch (error) {
      console.error("Error fetching overdue reservations:", error);
      res.status(500).json({ message: "Failed to fetch overdue reservations" });
    }
  });

  // Get reservations by customer
  app.get("/api/reservations/customer/:customerId", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const customerId = parseInt(req.params.customerId);
    if (isNaN(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    const reservations = await storage.getReservationsByCustomer(customerId);
    res.json(reservations);
  });

  // Check availability
  app.get("/api/reservations/check-availability/:vehicleId/:startDate/:endDate", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    const { startDate, endDate } = req.params;
    
    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }

    const conflicts = await storage.checkReservationConflicts(vehicleId, startDate, endDate, null);
    res.json(conflicts);
  });

  // Check for conflicts using query parameters (used by reservation form)
  app.get("/api/reservations/check-conflicts", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const vehicleId = parseInt(req.query.vehicleId as string);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const excludeReservationId = req.query.excludeReservationId
      ? parseInt(req.query.excludeReservationId as string)
      : null;
    const startTime = (req.query.startTime as string) || null;
    const endTime = (req.query.endTime as string) || null;

    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }

    if (!startDate) {
      return res.status(400).json({ message: "Start date is required" });
    }

    // Handle "undefined" string or missing endDate - pass null for open-ended rentals
    const effectiveEndDate = (!endDate || endDate === "undefined") ? null : endDate;

    try {
      const conflicts = await storage.checkReservationConflicts(
        vehicleId,
        startDate,
        effectiveEndDate,
        excludeReservationId === null || isNaN(excludeReservationId) ? null : excludeReservationId,
        false,
        startTime,
        endTime
      );
      res.json(conflicts);
    } catch (error) {
      console.error("Error checking conflicts:", error);
      res.status(500).json({ message: "Failed to check conflicts" });
    }
  });

  /**
   * besluiten **B-09** — the pre-save check the booking form runs.
   *
   * `check-conflicts` answers with a bare array and twenty callers read it that
   * way, so it keeps its shape. This is the same predicate with the whole
   * verdict in the body: the conflicts that refuse the save *and* the
   * maintenance blocks that only warn (BUG-013, BUG-037), with the maintenance
   * period already formatted into the message.
   */
  app.get("/api/reservations/booking-check", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const vehicleId = parseInt(req.query.vehicleId as string);
    const startDate = req.query.startDate as string;
    const endDateRaw = req.query.endDate as string | undefined;
    const excludeRaw = req.query.excludeReservationId as string | undefined;
    const excludeReservationId = excludeRaw ? parseInt(excludeRaw) : null;

    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }
    if (!startDate || !isCalendarDate(startDate)) {
      return res.status(400).json({ message: "Start date is required" });
    }
    const endDate = (!endDateRaw || endDateRaw === "undefined") ? null : endDateRaw;
    if (endDate && !isCalendarDate(endDate)) {
      return res.status(400).json({ message: "Invalid end date" });
    }

    try {
      const verdict = await storage.isVehicleBookable({
        vehicleId,
        startDate,
        endDate,
        startTime: (req.query.startTime as string) || null,
        endTime: (req.query.endTime as string) || null,
        excludeReservationId: excludeReservationId === null || isNaN(excludeReservationId)
          ? null
          : excludeReservationId,
        isMaintenanceBlock: req.query.type === "maintenance_block",
      });

      res.json({
        bookable: verdict.bookable,
        reason: verdict.reason,
        message: verdict.message,
        conflicts: verdict.conflicts,
        warnings: warningsForVerdict(verdict),
      });
    } catch (error) {
      console.error("Error running the booking check:", error);
      res.status(500).json({ message: "Failed to check this booking" });
    }
  });

  // Get all reservations with optional search
  app.get("/api/reservations", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    try {
      // Disable HTTP caching to ensure fresh data after deletions
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const searchQuery = req.query.search as string | undefined;
      const reservations = await storage.getAllReservations(searchQuery);
      res.json(reservations);
    } catch (error) {
      console.error("Error fetching reservations:", error);
      res.status(500).json({ message: "Failed to fetch reservations", error });
    }
  });

  // Find reservation by contract number
  app.get("/api/reservations/find-by-contract/:contractNumber", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    try {
      const contractNumber = req.params.contractNumber;
      // BUG-226: an indexed lookup on a uniquely-indexed column, instead of
      // loading and enriching the whole reservation table to find one row.
      const reservation = await storage.getReservationByContractNumber(contractNumber);
      
      if (!reservation) {
        return res.json({ exists: false, reservation: null });
      }
      
      return res.json({ exists: true, reservation });
    } catch (error) {
      console.error("Error finding reservation by contract number:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single reservation
  app.get("/api/reservations/:id", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid reservation ID" });
    }

    // Disable HTTP caching to ensure fresh data after deletions
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const reservation = await storage.getReservation(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    res.json(reservation);
  });

  // Setup storage for damage check uploads
  const createDamageCheckStorage = async (req: Request, file: Express.Multer.File, callback: Function) => {
    try {
      const vehicleId = req.body.vehicleId;
      if (!vehicleId) {
        return callback(new Error("Vehicle ID is required"), false);
      }
      
      // Get vehicle details for organizing files
      const vehicle = await storage.getVehicle(parseInt(vehicleId));
      if (!vehicle) {
        return callback(new Error("Vehicle not found"), false);
      }
      
      // Always remove all special characters including dashes from license plates for folder names
      const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
      const baseDir = path.join(getUploadsDir(), sanitizedPlate);
      const damageCheckDir = path.join(baseDir, 'damage_checks');
      
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      if (!fs.existsSync(damageCheckDir)) {
        fs.mkdirSync(damageCheckDir, { recursive: true });
      }
      
      callback(null, damageCheckDir);
    } catch (error) {
      console.error("Error with damage check upload:", error);
      callback(error, false);
    }
  };

  // Configure multer for damage check uploads
  const damageCheckStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      createDamageCheckStorage(req, file, (err: any, result: any) => {
        if (err) return cb(err, '');
        cb(null, result);
      });
    },
    filename: async (req, file, cb) => {
      try {
        const timestamp = Date.now();
        const dateString = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const extension = path.extname(sanitizedOriginal);
        const startDate = req.body.startDate || dateString;
        
        // Get vehicle license plate
        const vehicleId = parseInt(req.body.vehicleId);
        const vehicle = await storage.getVehicle(vehicleId);
        
        if (!vehicle) {
          throw new Error("Vehicle not found");
        }
        
        // Sanitize license plate for filename (remove spaces, etc.)
        const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
        
        // Create filename with license plate, document type, and date
        const fileName = `${sanitizedPlate}_damage_check_${startDate}_${timestamp}${extension}`;
        
        cb(null, fileName);
      } catch (error) {
        console.error("Error creating filename for damage check:", error);
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const fallbackName = `damage_check_${Date.now()}${path.extname(sanitizedOriginal)}`;
        cb(null, fallbackName);
      }
    }
  });
  
  // Configure multer for damage check uploads with enhanced security
  const damageCheckUpload = sanitizeUploadedFields(multer({
    storage: damageCheckStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: createSecureMulterFilter('document'),
  }));
  
  // Create reservation with damage check upload
  app.post("/api/reservations", hasPermission(UserPermission.MANAGE_RESERVATIONS), damageCheckUpload.single('damageCheckFile'), async (req: Request, res: Response) => {
    try {
      // Handle JSON data that comes through multer middleware
      let bodyData = req.body;
      if (req.body.body && typeof req.body.body === 'string') {
        // This is JSON data sent through multer - parse it
        try {
          bodyData = JSON.parse(req.body.body);
        } catch (e) {
          console.error('Failed to parse JSON body:', e);
          return res.status(400).json({ message: "Invalid JSON in request body" });
        }
      }
      
      console.log('Parsed bodyData:', bodyData);
      
      // Convert string fields to the correct types
      if (bodyData.vehicleId) bodyData.vehicleId = parseInt(bodyData.vehicleId);
      if (bodyData.customerId !== null && bodyData.customerId !== undefined) {
        bodyData.customerId = parseInt(bodyData.customerId);
      }
      
      // Handle driverId - convert to integer or null
      if (bodyData.driverId !== undefined) {
        if (bodyData.driverId === '' || bodyData.driverId === null) {
          bodyData.driverId = null;
        } else {
          bodyData.driverId = parseInt(bodyData.driverId as string);
        }
      }
      
      console.log('After conversions - driverId type:', typeof bodyData.driverId, 'value:', bodyData.driverId);
      
      // Convert boolean fields from strings
      if (bodyData.placeholderSpare !== undefined) {
        bodyData.placeholderSpare = bodyData.placeholderSpare === 'true' || bodyData.placeholderSpare === true;
      }
      
      if (bodyData.deliveryRequired !== undefined) {
        bodyData.deliveryRequired = bodyData.deliveryRequired === 'true' || bodyData.deliveryRequired === true;
      }
      
      // Handle totalPrice properly - treat empty string and NaN as undefined
      if (bodyData.totalPrice === "" || bodyData.totalPrice === null) {
        bodyData.totalPrice = undefined;
      } else if (bodyData.totalPrice) {
        const parsedPrice = parseFloat(bodyData.totalPrice);
        bodyData.totalPrice = isNaN(parsedPrice) ? undefined : parsedPrice;
      }
      
      // Handle endDate - fix "undefined" string to null for open-ended rentals
      if (bodyData.endDate === "undefined" || bodyData.endDate === "" || bodyData.endDate === null) {
        bodyData.endDate = null;
      }
      
      // Convert pickupMileage to number if present
      if (bodyData.pickupMileage !== undefined && bodyData.pickupMileage !== null && bodyData.pickupMileage !== "") {
        bodyData.pickupMileage = parseInt(bodyData.pickupMileage);
      }
      
      // Convert returnMileage to number if present
      if (bodyData.returnMileage !== undefined && bodyData.returnMileage !== null && bodyData.returnMileage !== "") {
        bodyData.returnMileage = parseInt(bodyData.returnMileage);
      }
      
      const reservationData = insertReservationSchema.parse(bodyData);

      // BUG-039: reservations.vehicle_id / customer_id carry no foreign key, so
      // a booking on an id that does not exist was accepted and became an orphan
      // row nobody could explain. The maintenance_block branch below skipped even
      // the incidental getVehicle() the standard branch happened to do.
      const missingReference = await findMissingReservationReferences(reservationData);
      if (missingReference) return res.status(404).json(missingReference);

      // Refuse blacklisted vehicle/customer pairings. The reservation form hides
      // them from its dropdowns, but nothing stopped a booking created any other
      // way (calendar drag, a stale page, a direct API call) from going through.
      if (reservationData.vehicleId && reservationData.customerId) {
        const blacklisted = await storage.isCustomerBlacklistedForVehicle(
          reservationData.vehicleId,
          reservationData.customerId
        );
        if (blacklisted) {
          return res.status(409).json({
            message: "This customer is blacklisted for this vehicle and cannot be booked on it.",
            field: "customerId",
          });
        }
      }

      // Add user tracking information
      const user = req.user;
      const dataWithTracking = {
        ...reservationData,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null
      };
      
      // For maintenance blocks, always create the reservation first, then handle conflicts
      if (reservationData.type === 'maintenance_block') {
        const reservation = await storage.createReservation(dataWithTracking);
        void onMaintenanceBlockChanged(null, reservation);

        // besluiten B-09 (BUG-037) — a second block overlapping the first is
        // allowed, but the desk is told which block it lands on.
        const blockVerdict = await storage.isVehicleBookable({
          vehicleId: reservationData.vehicleId!,
          startDate: reservationData.startDate,
          endDate: reservationData.endDate ?? null,
          excludeReservationId: reservation.id,
          isMaintenanceBlock: true,
        });
        const blockWarnings = warningsForVerdict(blockVerdict);

        const customerReservations = await storage.checkReservationConflicts(
          reservationData.vehicleId!,
          reservationData.startDate,
          reservationData.endDate ?? null,
          reservation.id // Exclude the just-created maintenance reservation from conflicts
        );

        console.log(
          `🔧 [Maintenance #${reservation.id}] Conflict check for vehicle ${reservationData.vehicleId} ` +
          `period ${reservationData.startDate} → ${reservationData.endDate ?? 'open'}: ` +
          `found ${customerReservations.length} reservation(s) by date overlap (excluding maintenance ${reservation.id}).`
        );

        // ALSO query the broader picture (any non-deleted reservation on this vehicle that overlaps,
        // regardless of status) so we can tell the user when a rental was missed because of its status.
        const allReservations = await storage.getAllReservations();
        const maintStart = new Date(reservationData.startDate);
        const maintEnd = reservationData.endDate ? new Date(reservationData.endDate) : new Date('9999-12-31');
        const broadOverlapping = allReservations.filter(r =>
          r.id !== reservation.id &&
          !r.deletedAt &&
          r.vehicleId === reservationData.vehicleId &&
          r.type === 'standard' &&
          r.customerId !== null
        ).filter(r => {
          const rs = new Date(r.startDate);
          const re = r.endDate ? new Date(r.endDate) : new Date('9999-12-31');
          return rs <= maintEnd && re >= maintStart;
        });

        console.log(
          `🔧 [Maintenance #${reservation.id}] Broad overlap (any status) found ${broadOverlapping.length} standard rental(s) ` +
          `on vehicle ${reservationData.vehicleId}: ` +
          JSON.stringify(broadOverlapping.map(r => ({ id: r.id, status: r.status, startDate: r.startDate, endDate: r.endDate, customerId: r.customerId })))
        );

        // Filter to only include customer reservations (not other maintenance blocks or replacements)
        const customerConflicts = customerReservations.filter(
          r => r.type !== 'maintenance_block' && r.type !== 'replacement' && r.customerId !== null
        );

        // Fallback: if the strict status-based check missed an overlapping rental that the broad
        // check found (e.g. rental still has the vehicle but status was changed to 'returned'),
        // include those so the user gets the spare prompt instead of silently succeeding.
        const conflictIds = new Set(customerConflicts.map(r => r.id));
        for (const r of broadOverlapping) {
          if (!conflictIds.has(r.id)) {
            console.log(
              `🔧 [Maintenance #${reservation.id}] Including rental ${r.id} (status=${r.status}) via broad overlap fallback.`
            );
            customerConflicts.push(r as any);
            conflictIds.add(r.id);
          }
        }

        if (customerConflicts.length > 0) {
          console.log(
            `🔧 [Maintenance #${reservation.id}] Returning needsSpareVehicle=true with ${customerConflicts.length} conflict(s).`
          );
          return res.status(200).json({
            message: "Customer reservations found during maintenance period",
            needsSpareVehicle: true,
            conflictingReservations: customerConflicts,
            maintenanceData: reservationData,
            maintenanceReservationId: reservation.id, // Include the created maintenance ID
            ...(blockWarnings.length ? { warnings: blockWarnings } : {}),
          });
        }

        console.log(`🔧 [Maintenance #${reservation.id}] No customer conflicts — returning 201.`);
        // No conflicts, return the created maintenance reservation
        return res.status(201).json(
          blockWarnings.length ? { ...reservation, warnings: blockWarnings } : reservation,
        );
      } else {
        // FIX-F (BUG-006, BUG-107, BUG-018): the conflict check that used to
        // stand here — on its own connection, minutes of request time before
        // the insert — is gone. `createReservationChecked` below runs the one
        // predicate inside the same transaction as the INSERT, behind the
        // vehicle's advisory lock, and throws a BookingConflictError (409).

        // Check for overdue reservations on this vehicle (ended 3+ days ago, not completed)
        const overdueReservations = await storage.getOverdueReservationsByVehicle(reservationData.vehicleId!);
        if (overdueReservations.length > 0) {
          return res.status(409).json({
            message: "This vehicle has overdue reservations that must be resolved first",
            overdueReservations,
            isOverdueError: true
          });
        }
      }
      
      // Auto-convert BV → Opnaam before creating reservation (legal requirement)
      // BV vehicles cannot be driven (no insurance/road tax), Opnaam vehicles can
      try {
        const vehicle = await storage.getVehicle(reservationData.vehicleId!);
        if (vehicle && vehicle.company === "true") {
          console.log(`🔄 Auto-converting vehicle ${vehicle.id} from BV to Opnaam (required for rental)`);
          
          await storage.updateVehicle(vehicle.id, {
            registeredTo: "true",  // Set to Opnaam
            company: "false",      // Remove BV status
            registeredToDate: format(new Date(), 'yyyy-MM-dd'),
          });
          
          console.log(`✅ Vehicle ${vehicle.id} converted from BV to Opnaam`);
        }
      } catch (error) {
        console.error('Failed to convert vehicle from BV to Opnaam:', error);
        // Don't fail the reservation, just log the error
      }
      
      // besluiten B-09 (BUG-013) — the write is allowed over a maintenance
      // block, but the response says which block it lands on.
      let bookingWarnings: BookingWarning[] = [];
      const reservation = await storage.createReservationChecked(dataWithTracking, {
        onVerdict: (verdict) => { bookingWarnings = warningsForVerdict(verdict); },
      });

      // First row of the driver assignment history (see services/driver-assignments.ts)
      if (reservation.driverId) {
        await assignDriverToReservation({ reservationId: reservation.id, driverId: reservation.driverId, byUserId: req.user?.id, note: 'created' });
      }

      // Sync vehicle availability status after creating reservation
      await storage.syncVehicleAvailabilityWithReservations();
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.reservations.created(reservation);
      
      // If there's a contract preview token, finalize and save the contract
      if (bodyData.contractPreviewToken) {
        try {
          const { previewTokenService } = await import('./preview-token-service');
          const preview = previewTokenService.get(bodyData.contractPreviewToken, req.user!.id.toString());
          
          if (preview) {
            console.log(`🔄 Finalizing contract from preview token for reservation ${reservation.id}`);
            
            // IMPORTANT: Regenerate contract using FRESH reservation data, not stale preview data
            // This ensures the contract matches the actual reservation that was created
            const vehicle = await storage.getVehicle(reservation.vehicleId!);
            const customer = await storage.getCustomer(reservation.customerId!);
            
            if (vehicle && customer) {
              let template;
              if (preview.templateId) {
                template = await storage.getPdfTemplate(preview.templateId);
              } else {
                template = await storage.getDefaultPdfTemplate();
              }
              
              if (template) {
                const contractData = {
                  ...reservation,
                  vehicle,
                  customer
                };
                
                // Make sure template fields are properly formatted
                if (template.fields && typeof template.fields === 'string') {
                  try {
                    template.fields = JSON.parse(template.fields);
                  } catch (e) {
                    console.error('Error parsing template fields:', e);
                  }
                }
                
                // Generate final contract with real reservation ID
                const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
                const pdfBuffer = await generateRentalContractFromTemplate(contractData, template);
                
                // Save contract to filesystem
                const licensePlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
                // FIX-B: the uploads root, not cwd/uploads — and the stored path
                // relative to that root, so the row resolves wherever UPLOADS_DIR
                // points. BUG-184: the filename carried only the date, so two
                // contracts finalised for one plate on one day shared one file.
                const contractsDir = resolveUploadsPath('contracts', licensePlate);
                await fs.promises.mkdir(contractsDir, { recursive: true });

                const fileName = `${licensePlate}_contract_${format(new Date(), 'yyyyMMdd')}_${Date.now()}.pdf`;
                const filePath = path.join(contractsDir, fileName);
                const relativeFilePath = getRelativePath(filePath);
                
                await fs.promises.writeFile(filePath, pdfBuffer);
                console.log(`✅ Contract saved to: ${filePath}`);
                
                // Save to database
                const documentData = {
                  vehicleId: vehicle.id,
                  reservationId: reservation.id,
                  documentType: "Contract (Unsigned)",
                  fileName,
                  filePath: relativeFilePath,
                  fileSize: pdfBuffer.length,
                  contentType: "application/pdf",
                  createdBy: user ? user.username : 'System',
                  notes: `Auto-generated unsigned contract for reservation #${reservation.id}`
                };
                
                const savedDocument = await storage.createDocument(documentData);
                console.log(`✅ Created document entry for unsigned contract: ID ${savedDocument.id}`);
                
                // Broadcast document creation
                realtimeEvents.documents.created(savedDocument);
              }
            }
            
            // Delete the preview token
            previewTokenService.delete(bodyData.contractPreviewToken);
            console.log(`🗑️ Deleted preview token: ${bodyData.contractPreviewToken}`);
          }
        } catch (error) {
          console.error('Error finalizing contract from preview:', error);
          // Don't fail reservation creation if contract finalization fails
        }
      }
      
      // If there's a file, create a document record linked to the vehicle
      // and update the reservation with the damage check path
      if (req.file) {
        const documentData = {
          vehicleId: reservationData.vehicleId,
          documentType: "Damage Check",
          fileName: req.file.originalname,
          filePath: getRelativePath(req.file.path),
          fileSize: req.file.size,
          contentType: req.file.mimetype,
          createdBy: user ? user.username : `Reservation #${reservation.id}`,
          notes: `Damage check for reservation from ${reservationData.startDate} to ${reservationData.endDate}`
        };
        
        const document = await storage.createDocument(documentData);
        
        // Update the reservation with the damage check path (using relative path)
        await storage.updateReservation(reservation.id, {
          damageCheckPath: getRelativePath(req.file.path)
        });
      }
      
      res.status(201).json(
        bookingWarnings.length ? { ...reservation, warnings: bookingWarnings } : reservation,
      );
    } catch (error) {
      // FIX-F: a refused booking is a 409 with the conflicting rows, not a
      // blanket 400 — the booking form has always read `conflicts`.
      if (error instanceof BookingConflictError) {
        return res.status(error.status).json(error.toBody());
      }
      console.error("Error creating reservation:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid reservation data", error: error.errors });
      } else {
        res.status(400).json({
          message: "Failed to create reservation",
        });
      }
    }
  });

  // Create maintenance with spare vehicle assignment
  app.post("/api/reservations/maintenance-with-spare", hasPermission(UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE), async (req: Request, res: Response) => {
    try {
      console.log('Raw request body:', req.body);
      
      // Handle the case where multer wraps the JSON data
      let bodyData = req.body;
      if (req.body.body && typeof req.body.body === 'string') {
        try {
          bodyData = JSON.parse(req.body.body);
        } catch (parseError) {
          console.error('Error parsing JSON body:', parseError);
          return res.status(400).json({ message: "Invalid JSON in request body" });
        }
      }
      
      const { maintenanceId, maintenanceData, conflictingReservations, spareVehicleAssignments } = bodyData;
      
      console.log('Creating/updating maintenance with spare vehicles:', { maintenanceId, maintenanceData, conflictingReservations, spareVehicleAssignments });
      
      // Validate required data
      if (!maintenanceData) {
        return res.status(400).json({ message: "maintenanceData is required" });
      }
      if (!conflictingReservations || !Array.isArray(conflictingReservations)) {
        return res.status(400).json({ message: "conflictingReservations must be an array" });
      }
      if (!spareVehicleAssignments || !Array.isArray(spareVehicleAssignments)) {
        return res.status(400).json({ message: "spareVehicleAssignments must be an array" });
      }
      
      // PRE-VALIDATE ALL ASSIGNMENTS BEFORE ANY UPDATES (for atomicity)
      // FIX-F (BUG-121, BUG-160, BUG-173): this loop no longer decides
      // availability. It works out the period each spare is needed for and
      // refuses impossible input; whether the spare is actually free is decided
      // once, inside the write transaction, where it can also see the other
      // assignments in this same payload.
      const validationPromises = spareVehicleAssignments.map(async (assignment: any) => {
        const { reservationId, spareVehicleId, startDate: customStartDate, endDate: customEndDate } = assignment;

        const originalReservation = await storage.getReservation(reservationId);
        if (!originalReservation) {
          throw new Error(`Reservation ${reservationId} not found`);
        }

        let overlapStart: Date;
        let overlapEnd: Date;
        let isOpenEnded = false;

        // Use custom dates if provided, otherwise calculate from maintenance period
        if (customStartDate) {
          // Custom dates provided from the duration dialog
          overlapStart = new Date(customStartDate);

          if (customEndDate) {
            overlapEnd = new Date(customEndDate);
          } else {
            // Open-ended spare rental - no end date
            isOpenEnded = true;
            // For validation, use maintenance end date as a reasonable horizon
            // But we'll store null as the actual end date
            overlapEnd = new Date(maintenanceData.endDate || customStartDate);
          }

          if (isNaN(overlapStart.getTime())) {
            throw new Error(`Invalid custom start date for reservation ${reservationId}`);
          }
          if (!isOpenEnded && isNaN(overlapEnd.getTime())) {
            throw new Error(`Invalid custom end date for reservation ${reservationId}`);
          }
          if (!isOpenEnded && overlapStart > overlapEnd) {
            throw new Error(`Invalid spare rental period: end date cannot be before start date for reservation ${reservationId}`);
          }
        } else {
          // Calculate overlap from maintenance period (legacy behavior)
          const maintenanceStart = new Date(maintenanceData.startDate);
          const maintenanceEnd = new Date(maintenanceData.endDate);
          const rentalStart = new Date(originalReservation.startDate);

          // Validate dates are valid and maintenance period is valid
          if (isNaN(maintenanceStart.getTime()) || isNaN(maintenanceEnd.getTime()) || isNaN(rentalStart.getTime())) {
            throw new Error(`Invalid date format in maintenance or rental ${reservationId}`);
          }

          if (maintenanceStart > maintenanceEnd) {
            throw new Error(`Invalid maintenance period: end date cannot be before start date`);
          }

          // Handle open-ended rentals (endDate is null, undefined, or "undefined")
          if (!originalReservation.endDate || originalReservation.endDate === "undefined" || originalReservation.endDate === null) {
            // For open-ended rentals, customer has vehicle indefinitely
            // Spare vehicle assignment covers the entire maintenance period
            overlapStart = new Date(Math.max(maintenanceStart.getTime(), rentalStart.getTime()));
            overlapEnd = maintenanceEnd; // Spare vehicle for entire maintenance period

            // Validate overlap for open-ended rentals too (allow same-day overlaps)
            if (overlapStart > overlapEnd) {
              throw new Error(`No overlap between maintenance and open-ended rental ${reservationId}: rental starts after maintenance ends`);
            }
          } else {
            // For regular rentals with end dates
            const rentalEnd = new Date(originalReservation.endDate);

            if (isNaN(rentalEnd.getTime())) {
              throw new Error(`Invalid end date format in rental ${reservationId}`);
            }

            overlapStart = new Date(Math.max(maintenanceStart.getTime(), rentalStart.getTime()));
            overlapEnd = new Date(Math.min(maintenanceEnd.getTime(), rentalEnd.getTime()));

            // Allow same-day overlaps (overlapStart can equal overlapEnd)
            if (overlapStart > overlapEnd) {
              throw new Error(`No overlap between maintenance and rental ${reservationId}`);
            }
          }
        }

        return { originalReservation, overlapStart, overlapEnd: isOpenEnded ? null : overlapEnd, spareVehicleId, isOpenEnded };
      });

      // Execute all validations (will throw if any fail)
      const validatedAssignments = await Promise.all(validationPromises);

      const user = req.user;

      if (maintenanceId) {
        // Validate that maintenanceId refers to an existing maintenance_block reservation
        const existingReservation = await storage.getReservation(maintenanceId);
        if (!existingReservation) {
          return res.status(404).json({ message: "Maintenance reservation not found" });
        }
        if (existingReservation.type !== 'maintenance_block') {
          return res.status(400).json({ message: "Reservation is not a maintenance block" });
        }
      } else {
        // BUG-033: the new-block branch handed `maintenanceData` straight to
        // `createReservation`, so none of the cross-field rules of
        // `insertReservationSchema` applied on this path — a block without a
        // vehicle came back 201 and then could not be shown on the maintenance
        // calendar, which groups by vehicle. Same validation the direct
        // `POST /api/reservations` path runs.
        const blockCheck = insertReservationSchema.safeParse({
          ...maintenanceData,
          type: 'maintenance_block',
        });
        if (!blockCheck.success) {
          return res.status(400).json({
            message: "Invalid maintenance data",
            errors: blockCheck.error.errors.map((e) => ({
              field: e.path.join('.') || '(maintenanceData)',
              message: e.message,
            })),
          });
        }
      }

      // Build every replacement row up front (read-only lookups), so the
      // transaction below only writes.
      const replacementRows = await Promise.all(validatedAssignments.map(async (validated) => {
        const { originalReservation, overlapStart, overlapEnd, spareVehicleId, isOpenEnded } = validated;

        // Get vehicle details for better notes
        const spareVehicle = await storage.getVehicle(spareVehicleId);
        const originalVehicle = originalReservation.vehicle || await storage.getVehicle(originalReservation.vehicleId!);

        const originalVehicleDesc = originalVehicle ?
          `${originalVehicle.licensePlate} (${originalVehicle.brand} ${originalVehicle.model})` :
          `vehicle ${originalReservation.vehicleId}`;
        const spareVehicleDesc = spareVehicle ?
          `${spareVehicle.licensePlate} (${spareVehicle.brand} ${spareVehicle.model})` :
          `vehicle ${spareVehicleId}`;

        // Format dates, handling open-ended spare rentals
        const startDateStr = overlapStart.toISOString().split('T')[0];
        const endDateStr = isOpenEnded || !overlapEnd ? null : overlapEnd.toISOString().split('T')[0];
        const originalEndNote = originalReservation.endDate || 'open-ended';

        return {
          vehicleId: spareVehicleId,
          customerId: originalReservation.customerId,
          startDate: startDateStr,
          endDate: endDateStr,
          type: 'replacement',
          replacementForReservationId: originalReservation.id,
          placeholderSpare: false,
          status: 'booked',
          totalPrice: '0',
          createdBy: user ? user.username : null,
          updatedBy: user ? user.username : null,
          notes: `Spare vehicle ${spareVehicleDesc} for reservation #${originalReservation.id} during maintenance of ${originalVehicleDesc}. Original rental: ${originalReservation.startDate} to ${originalEndNote}.`
        };
      }));

      // FIX-F — one transaction for the block, the replaced spares and the new
      // ones, with every vehicle involved locked in ascending id order. Two
      // assignments in one payload are judged against each other (BUG-121), a
      // double click cannot create the whole set twice (BUG-173), and a refusal
      // leaves no half-written maintenance behind.
      const applied = await storage.applyMaintenanceWithSpares({
        maintenanceId: maintenanceId ?? null,
        maintenanceData: {
          ...maintenanceData,
          ...(maintenanceId
            ? { updatedBy: user ? user.username : null }
            : { createdBy: user ? user.username : null, updatedBy: user ? user.username : null }),
        },
        replacements: replacementRows,
        replacedOriginalIds: spareVehicleAssignments.map((a: any) => a.reservationId),
      });

      const maintenanceReservation = applied.maintenanceReservation;
      const updatedReservations = applied.replacements;

      void onMaintenanceBlockChanged(applied.maintenanceBefore, maintenanceReservation ?? null);
      for (const replacement of updatedReservations) {
        void onReplacementAssigned(replacement);
      }

      // Broadcast real-time updates for all created reservations
      if (maintenanceReservation) {
        realtimeEvents.reservations.created(maintenanceReservation);
      }
      if (updatedReservations) {
        for (const replacement of updatedReservations) {
          realtimeEvents.reservations.created(replacement);
        }
      }

      res.status(201).json({
        maintenanceReservation,
        updatedReservations,
        message: "Maintenance scheduled and spare vehicles assigned"
      });
    } catch (error) {
      // FIX-F: an unavailable spare — including the same spare twice in one
      // payload — is a 409 naming the conflicting rows, and nothing was written.
      if (error instanceof BookingConflictError) {
        return res.status(error.status).json(error.toBody());
      }
      // FIX-V (BUG-004): refusing to wipe an already-picked-up spare is a 409
      // with a code, not the blanket 400 below.
      if (error instanceof HttpError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      console.error("Error creating maintenance with spare:", error);
      res.status(400).json({
        message: "Failed to create maintenance with spare vehicles",
      });
    }
  });

  // Update reservation data (JSON endpoint without file upload)
  app.patch("/api/reservations/:id/basic", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      // Handle JSON data that might come through wrapped in a body property
      let bodyData = req.body;
      if (req.body.body && typeof req.body.body === 'string') {
        // This is JSON data sent in a wrapped format - parse it
        try {
          bodyData = JSON.parse(req.body.body);
        } catch (error) {
          console.error('Failed to parse wrapped JSON:', error);
          return res.status(400).json({ message: "Invalid JSON data" });
        }
      }

      // FIX-D (BUG-172): this route used to run the *full* insert schema over the
      // body and then write every parsed column back, so a dialog that posted
      // three fields silently overwrote everything a colleague had changed — and
      // any field the dialog did not know about was reset to its schema default.
      // Same generic coercion + partial validation as PATCH /:id.
      const existingBasic = await storage.getReservation(id);
      if (!existingBasic) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      const reservationData = parsePartialUpdate(bodyData, {
        table: reservations,
        schema: insertReservationSchemaBase,
        strip: ["damageCheckPath"],
        message: "Invalid reservation data",
      });

      // FIX-H (BUG-016): `/basic` ran the shape validation and then wrote
      // `status` straight through — no enum check, no transition check — so a
      // dialog could jump `booked -> completed` in one step, or persist
      // literal "garbage". Same gate as `/status` now.
      if ('status' in reservationData) {
        reservationData.status = assertReservationTransition(existingBasic.status, reservationData.status);
      }

      // BUG-017: same blacklist check as the create path and as PATCH /:id.
      if (await blacklistedAfterPatch(reservationData, existingBasic)) {
        return res.status(409).json(BLACKLIST_CONFLICT);
      }

      // BUG-111: the date-order rule lives on the merged row, not on the patch.
      const basicStartDate = (reservationData.startDate ?? existingBasic.startDate) as string | null;
      const basicEndDate = ("endDate" in reservationData ? reservationData.endDate : existingBasic.endDate) as string | null;
      if (basicStartDate && basicEndDate && basicEndDate < basicStartDate) {
        return res.status(400).json({
          message: "Invalid reservation data",
          errors: [{ field: "endDate", message: "End date must be on or after start date" }],
        });
      }

      // The effective row after this patch — what the conflict check has to judge.
      const effectiveVehicleId = (reservationData.vehicleId ?? existingBasic.vehicleId) as number | null;
      const effectiveType = (reservationData.type ?? existingBasic.type) as string;

      // Check for conflicts (exclude the current reservation) — only when this
      // patch actually moves the booking. Re-running it for a note-only edit
      // would refuse to save a reservation that already overlaps another one.
      const touchesSchedule = SCHEDULING_FIELDS.some((f) => f in reservationData);
      const conflicts = touchesSchedule && effectiveVehicleId && basicStartDate
        ? await storage.checkReservationConflicts(
            effectiveVehicleId,
            basicStartDate,
            basicEndDate ?? null,
            id,
            false,
            (reservationData.startTime ?? existingBasic.startTime) ?? null,
            (reservationData.endTime ?? existingBasic.endTime) ?? null
          )
        : [];
      
      // Special handling for maintenance_block edits: customer rentals during the
      // maintenance period should NOT block the update — they should trigger the
      // spare vehicle assignment flow (same as POST /api/reservations).
      if (effectiveType === 'maintenance_block') {
        const customerConflicts = conflicts.filter(r => r.type !== 'maintenance_block');

        // Apply the maintenance update first so the dates are persisted
        const userForMaint = req.user;
        const maintDataWithTracking = {
          ...reservationData,
          updatedBy: userForMaint ? userForMaint.username : null,
        };
        const maintBefore = existingBasic;
        const updatedMaintenance = await storage.updateReservation(id, maintDataWithTracking);
        if (!updatedMaintenance) {
          return res.status(404).json({ message: "Reservation not found" });
        }
        void onMaintenanceBlockChanged(maintBefore ?? null, updatedMaintenance);

        if (customerConflicts.length > 0) {
          return res.status(200).json({
            message: "Customer reservations found during maintenance period",
            needsSpareVehicle: true,
            conflictingReservations: customerConflicts,
            maintenanceData: reservationData,
            maintenanceReservationId: id,
          });
        }

        await storage.syncVehicleAvailabilityWithReservations();
        realtimeEvents.reservations.updated(updatedMaintenance);
        return res.json(updatedMaintenance);
      }

      if (conflicts.length > 0) {
        return res.status(409).json({ 
          message: "Reservation conflicts with existing bookings",
          conflicts
        });
      }
      
      // Auto-convert BV → Opnaam before updating reservation (legal requirement)
      // Always check and convert BV vehicles to ensure compliance
      try {
        const vehicle = effectiveVehicleId ? await storage.getVehicle(effectiveVehicleId) : undefined;
        if (vehicle && vehicle.company === "true") {
          console.log(`🔄 Auto-converting vehicle ${vehicle.id} from BV to Opnaam (required for rental)`);
          
          await storage.updateVehicle(vehicle.id, {
            registeredTo: "true",  // Set to Opnaam
            company: "false",      // Remove BV status
            registeredToDate: format(new Date(), 'yyyy-MM-dd'),
          });
          
          console.log(`✅ Vehicle ${vehicle.id} converted from BV to Opnaam`);
        }
      } catch (error) {
        console.error('Failed to convert vehicle from BV to Opnaam:', error);
        // Don't fail the reservation update, just log the error
      }
      
      // Add user tracking information for updates
      const user = req.user;
      const dataWithTracking = {
        ...reservationData,
        updatedBy: user ? user.username : null
      };

      // FIX-F (BUG-159): the same check once more, but this time inside the
      // transaction that writes — the pre-check above only decides what the
      // response looks like, it cannot keep a parallel edit out.
      const reservation = await storage.updateReservationChecked(
        id,
        dataWithTracking,
        touchesSchedule && effectiveVehicleId && basicStartDate
          ? {
              vehicleId: effectiveVehicleId,
              startDate: basicStartDate,
              endDate: basicEndDate ?? null,
              startTime: (reservationData.startTime ?? existingBasic.startTime) ?? null,
              endTime: (reservationData.endTime ?? existingBasic.endTime) ?? null,
            }
          : null,
      );

      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // besluiten B-13 (BUG-139) — `/basic` can move a rental to another car
      // too, so the same cascade runs here.
      await onRentalVehicleChanged(existingBasic, reservation);

      // BUG-133: a driver changed through this route never reached the driver
      // history, so the portal and the fines attribution kept seeing the old
      // driver. PATCH /:id has always done this; /basic did not.
      if ('driverId' in reservationData && (reservationData.driverId ?? null) !== (existingBasic.driverId ?? null)) {
        await assignDriverToReservation({
          reservationId: id,
          driverId: (reservationData.driverId as number | null) ?? null,
          byUserId: req.user?.id,
          note: 'staff',
        });
      }

      // Sync vehicle availability status after updating reservation
      await storage.syncVehicleAvailabilityWithReservations();

      // Broadcast real-time update to all connected clients
      realtimeEvents.reservations.updated(reservation);

      res.json(reservation);
    } catch (error) {
      // BUG-148: error.message here used to be the Postgres constraint text
      // ("violates foreign key constraint reservations_driver_id_drivers_id_fk").
      sendRouteError(res, error, "Failed to update reservation");
    }
  });

  /**
   * besluiten **B-04** — what hangs off this reservation, so the cancel dialog
   * can ask per item whether it goes too (the dialog itself is OPT-028,
   * phase 34). Cancelling used to touch none of it (BUG-112).
   */
  app.get("/api/reservations/:id/cancel-impact", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const reservation = await storage.getReservation(id);
    if (!reservation) return res.status(404).json({ message: "Reservation not found" });
    const impact = await storage.getReservationCancelImpact(id);
    res.json({
      transports: impact.transports.map((t) => ({ id: t.id, scheduledDate: t.scheduledDate, status: t.status, transportType: t.transportType })),
      spares: impact.spares.map((r) => ({ id: r.id, vehicleId: r.vehicleId, startDate: r.startDate, endDate: r.endDate, status: r.status })),
      placeholders: impact.placeholders.map((r) => ({ id: r.id, startDate: r.startDate, endDate: r.endDate, status: r.status })),
      drivers: impact.drivers.map((d) => ({ id: d.id, driverId: d.driverId, assignedFrom: d.assignedFrom })),
    });
  });

  // Update reservation status only (special endpoint for status changes)
  app.patch("/api/reservations/:id/status", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      
      // FIX-H — the enum and the transition table are the state machine's, not
      // this handler's. The inline allow-list used to live here and nowhere
      // else, which is why the other four writers had no rules at all.
      const { status } = req.body;
      assertReservationStatusValue(status);
      
      // Get the current reservation to check for vehicle info
      const existingReservation = await storage.getReservation(id);
      
      if (!existingReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      const currentStatus = existingReservation.status;
      // `allowReversion` keeps the documented undo steps staff rely on
      // (picked_up -> booked, completed -> picked_up, …) working on this one
      // endpoint, exactly as before.
      const newStatus = assertReservationTransition(currentStatus, status, { allowReversion: true });

      // besluiten B-03 (BUG-109 step 5) — `/status` reached `picked_up` with no
      // vehicle check whatsoever, so it walked straight past the `not_for_rental`
      // guard that `/pickup` did apply, and past the workshop flag that neither
      // applied. Same gate, same override, on both paths.
      if (newStatus === 'picked_up' && normalizeReservationStatus(currentStatus) !== 'picked_up' && existingReservation.vehicleId) {
        const vehicleForHandover = await storage.getVehicle(existingReservation.vehicleId);
        decideHandover(vehicleForHandover, workshopOverrideFrom(req));
      }
      
      // If status is "completed", check mileage validation
      if (status === "completed" && existingReservation.vehicleId && req.body.departureMileage) {
        const vehicle = await storage.getVehicle(existingReservation.vehicleId);
        
        if (vehicle && vehicle.departureMileage) {
          const returnMileage = parseInt(req.body.departureMileage);
          
          // Validate that return mileage is not less than departure mileage
          if (returnMileage < vehicle.departureMileage) {
            return res.status(400).json({ 
              message: "Return mileage cannot be less than start mileage",
              details: {
                startMileage: vehicle.departureMileage,
                returnMileage: returnMileage
              }
            });
          }
        }
      }
      
      // Add user tracking information for updates
      const user = req.user;
      const dataWithTracking: any = {
        status,
        updatedBy: user ? user.username : null
      };
      
      // Add pickup mileage when status is confirmed (picked up) OR when updating mileage for confirmed reservation
      if (req.body.startMileage !== undefined) {
        const pickupMileage = parseInt(req.body.startMileage);
        console.log('🔍 Status update - startMileage received:', req.body.startMileage, 'parsed to:', pickupMileage);
        console.log('🔍 Current status:', status, 'Existing status:', existingReservation.status);
        if (!isNaN(pickupMileage) && (status === "confirmed" || existingReservation.status === "confirmed")) {
          dataWithTracking.pickupMileage = pickupMileage;
          console.log('✅ Setting pickupMileage in dataWithTracking:', pickupMileage);
          
          // Also update the vehicle's current mileage and departureMileage
          if (existingReservation.vehicleId) {
            try {
              const vehicle = await storage.getVehicle(existingReservation.vehicleId);
              if (vehicle) {
                await storage.updateVehicle(existingReservation.vehicleId, {
                  currentMileage: pickupMileage,
                  departureMileage: pickupMileage,
                  updatedBy: user ? user.username : null,
                  registeredToBy: vehicle.registeredToBy,
                  companyBy: vehicle.companyBy
                });
              }
            } catch (error) {
              console.error("Error updating vehicle current mileage:", error);
              // Continue with reservation update even if vehicle update fails
            }
          }
        }
      }
      
      // When reverting from "picked_up" to "booked", clear pickup data
      if (existingReservation.status === "picked_up" && status === "booked") {
        console.log('🔄 Reverting from picked_up to booked - clearing pickup data');
        dataWithTracking.actualPickupDate = null;
        dataWithTracking.pickupMileage = null;
        dataWithTracking.fuelLevelPickup = null;
        dataWithTracking.contractNumber = null;
      }
      
      // When reverting from "returned" to "picked_up", clear return data.
      // BUG-128b: this also set `endDate = null`, which threw away the planned
      // end and turned the rental open-ended — conflicting with every future
      // booking on that vehicle. The planned end is not return data.
      if (normalizeReservationStatus(existingReservation.status) === "returned" && newStatus === "picked_up") {
        dataWithTracking.actualReturnDate = null;
        dataWithTracking.returnMileage = null;
        dataWithTracking.fuelLevelReturn = null;
        dataWithTracking.fuelCost = null;
        dataWithTracking.fuelCardNumber = null;
        dataWithTracking.fuelNotes = null;
      }
      
      // When reverting from "completed" to any other status, clear completion data
      if (normalizeReservationStatus(existingReservation.status) === "completed" && newStatus !== "completed") {
        dataWithTracking.completionDate = null;
      }
      
      // BUG-019 — marking a reservation completed used to overwrite `endDate`
      // with today, so a rental ending 2026-10-05 and closed today came out as
      // `end_date` < `start_date`: negative rental periods in every report and a
      // date range no widget can render. The actual close date belongs in
      // `completionDate`, which the row has always had.
      if (newStatus === "completed") {
        dataWithTracking.completionDate = existingReservation.completionDate
          ?? existingReservation.actualReturnDate
          ?? new Date().toISOString().split('T')[0];
      }
      
      // Add return mileage when completing reservation
      if (status === "completed" && req.body.departureMileage !== undefined) {
        const returnMileage = parseInt(req.body.departureMileage);
        if (!isNaN(returnMileage)) {
          dataWithTracking.returnMileage = returnMileage;
          
          // Also update the vehicle's returnMileage
          if (existingReservation.vehicleId) {
            try {
              const vehicle = await storage.getVehicle(existingReservation.vehicleId);
              if (vehicle) {
                await storage.updateVehicle(existingReservation.vehicleId, {
                  returnMileage: returnMileage,
                  updatedBy: user ? user.username : null,
                  registeredToBy: vehicle.registeredToBy,
                  companyBy: vehicle.companyBy
                });
              }
            } catch (error) {
              console.error("Error updating vehicle return mileage:", error);
              // Continue with reservation update even if vehicle update fails
            }
          }
        }
      }
      
      // Add fuel tracking fields if present in request body
      if (req.body.fuelLevelPickup !== undefined) {
        dataWithTracking.fuelLevelPickup = req.body.fuelLevelPickup;
      }
      if (req.body.fuelLevelReturn !== undefined) {
        dataWithTracking.fuelLevelReturn = req.body.fuelLevelReturn;
      }
      if (req.body.fuelCost !== undefined) {
        dataWithTracking.fuelCost = req.body.fuelCost;
      }
      if (req.body.fuelCardNumber !== undefined) {
        dataWithTracking.fuelCardNumber = req.body.fuelCardNumber;
      }
      if (req.body.fuelNotes !== undefined) {
        dataWithTracking.fuelNotes = req.body.fuelNotes;
      }
      
      console.log('📦 Data being sent to updateReservation:', JSON.stringify(dataWithTracking, null, 2));
      const reservation = await storage.updateReservation(id, dataWithTracking);
      console.log('📋 Reservation after update - pickupMileage:', reservation?.pickupMileage);
      
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // besluiten B-04 (BUG-112) — cancelling closes what the caller asked to
      // close, and nothing else. The impact travels back in the response so the
      // dialog can ask and re-submit; a silent sweep is exactly what the owner
      // decided against.
      let cancelCascade: Record<string, unknown> | undefined;
      if (newStatus === "cancelled") {
        const requested = (req.body?.cascade ?? {}) as Record<string, unknown>;
        const result = await storage.applyReservationCancelCascade(id, {
          transports: requested.transports === true,
          spares: requested.spares === true,
          placeholders: requested.placeholders === true,
          drivers: requested.drivers === true,
        }, { username: (req.user as any)?.username ?? null });
        cancelCascade = {
          applied: result.applied,
          remaining: {
            transports: result.impact.transports.length - (result.applied.transports ?? 0),
            spares: result.impact.spares.length - (result.applied.spares ?? 0),
            placeholders: result.impact.placeholders.length - (result.applied.placeholders ?? 0),
            drivers: result.impact.drivers.length - (result.applied.drivers ?? 0),
          },
        };
      }

      // FIX-H (BUG-130) — recompute *this* vehicle from the one rule. The old
      // code leaned on the fleet-wide sync, whose reset branch only touched
      // vehicles with no reservation at all, so a car with a booking 10 days out
      // stayed `rented` for ever after its rental was completed.
      await storage.recomputeVehicleAvailability(reservation.vehicleId);
      
      // Fetch related data to return enriched reservation
      const vehicle = reservation.vehicleId ? await storage.getVehicle(reservation.vehicleId) : null;
      const customer = reservation.customerId ? await storage.getCustomer(reservation.customerId) : null;
      const driver = reservation.driverId ? await storage.getDriver(reservation.driverId) : null;
      
      // Create enriched reservation object
      const enrichedReservation = {
        ...reservation,
        vehicle: vehicle || undefined,
        customer: customer || undefined,
        driver: driver || undefined
      };
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.reservations.updated(reservation);
      
      return res.status(200).json(cancelCascade ? { ...enrichedReservation, cancelCascade } : enrichedReservation);
    } catch (error) {
      // FIX-H: a refused transition is a 400 naming the states, a blocked
      // handover a 409 naming the override — never a bare 500.
      sendRouteError(res, error, "Failed to update reservation status");
    }
  });

  // Update reservation with damage check upload
  app.patch("/api/reservations/:id", hasPermission(UserPermission.MANAGE_RESERVATIONS), damageCheckUpload.single('damageCheckFile'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      // FIX-D (BUG-202, BUG-084, BUG-111, BUG-052, BUG-172): the 25 hand-written
      // "" -> null blocks that used to live here are gone. Coercion is derived
      // from the drizzle table, validation is `insertReservationSchemaBase.partial()`,
      // `id`/`created*`/`deleted*` and the server-owned path column can never come
      // from the body, and the result holds ONLY the fields this request sent —
      // so a PATCH stops rewriting columns it was never given.
      // "not_recorded" is the form's way of saying "no fuel level recorded".
      for (const key of ["fuelLevelPickup", "fuelLevelReturn"]) {
        if (req.body?.[key] === "not_recorded") req.body[key] = null;
      }
      const reservationData = parsePartialUpdate(req.body, {
        table: reservations,
        schema: insertReservationSchemaBase,
        strip: ["damageCheckPath"],
        message: "Invalid reservation data",
      });

      // FIX-H (BUG-016): the generic PATCH deliberately bypassed
      // `insertReservationSchema` ("bypass full schema validation and just use
      // the raw data"), so it was the one writer that could put any string at
      // all into `status`. It is now gated like every other path; the existing
      // row is read a few lines below, so the check happens there.

      // If contractNumber is being set, verify it's not in use by another reservation
      if (reservationData.contractNumber) {
        reservationData.contractNumber = String(reservationData.contractNumber).trim();
        const existing = await storage.getReservation(id);
        // Only validate when the value actually changes
        if (existing && existing.contractNumber !== reservationData.contractNumber) {
          const all = await storage.getAllReservations();
          const duplicate = all.find((r) => r.id !== id && r.contractNumber === reservationData.contractNumber);
          if (duplicate) {
            return res.status(409).json({
              message: `Contract number "${reservationData.contractNumber}" is already used by reservation #${duplicate.id}.`,
              code: "DUPLICATE_CONTRACT_NUMBER",
              conflictingReservationId: duplicate.id,
            });
          }
        }
      }

      // Load the existing reservation once so we can diff contract-relevant
      // fields after the update and trigger contract PDF regeneration.
      const existingReservationForDiff = await storage.getReservation(id);
      if (!existingReservationForDiff) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // FIX-H (BUG-016) — the enum and the transition table, on this path too.
      if ('status' in reservationData) {
        reservationData.status = assertReservationTransition(
          existingReservationForDiff.status,
          reservationData.status,
        );
      }

      // BUG-017: the blacklist is checked on create and, until now, on neither
      // edit path - so swapping the vehicle or the customer walked past it.
      if (await blacklistedAfterPatch(reservationData, existingReservationForDiff)) {
        return res.status(409).json(BLACKLIST_CONFLICT);
      }

      // BUG-127 — the two odometer readings were freely editable and never
      // compared with each other, so a completed rental could end up with a
      // return reading below its pickup reading. Checked on the merged row for
      // the same reason the dates are.
      const mergedPickupMileage = ("pickupMileage" in reservationData
        ? reservationData.pickupMileage
        : existingReservationForDiff.pickupMileage) as number | null;
      const mergedReturnMileage = ("returnMileage" in reservationData
        ? reservationData.returnMileage
        : existingReservationForDiff.returnMileage) as number | null;
      if (
        mergedPickupMileage != null &&
        mergedReturnMileage != null &&
        mergedReturnMileage < mergedPickupMileage
      ) {
        return res.status(400).json({
          message: "Invalid reservation data",
          errors: [{ field: "returnMileage", message: "The return mileage cannot be lower than the pickup mileage" }],
        });
      }

      // BUG-111 — the cross-field rule has to be checked on the MERGED row: a
      // partial PATCH that moves only one of the two dates can still invert the
      // range, and the per-field schema cannot see that.
      const mergedStartDate = (reservationData.startDate ?? existingReservationForDiff.startDate) as string | null;
      const mergedEndDate = ("endDate" in reservationData
        ? reservationData.endDate
        : existingReservationForDiff.endDate) as string | null;
      if (mergedStartDate && mergedEndDate && mergedEndDate < mergedStartDate) {
        return res.status(400).json({
          message: "Invalid reservation data",
          errors: [{ field: "endDate", message: "End date must be on or after start date" }],
        });
      }

      // Old-rental admin password override: if the reservation was picked up
      // more than 3 weeks ago and the editor is not an admin, require an
      // admin password to be supplied with the request body.
      if (
        req.user?.role !== UserRole.ADMIN &&
        reservationIsOld(existingReservationForDiff)
      ) {
        const adminPasswordOverride =
          (req.body && (req.body as any).adminPasswordOverride) ||
          (req.body && (req.body as any).adminOverridePassword) ||
          undefined;
        if (!adminPasswordOverride) {
          return res.status(403).json({
            code: "ADMIN_PASSWORD_REQUIRED",
            message:
              "This rental was picked up more than 3 weeks ago. Admin password required to save changes.",
          });
        }
        const ok = await verifyAdminPassword(String(adminPasswordOverride));
        if (!ok) {
          return res.status(403).json({
            code: "INVALID_ADMIN_PASSWORD",
            message: "The admin password you entered is incorrect.",
          });
        }
        // Strip the override fields so they don't leak into the persisted data.
        delete (req.body as any).adminPasswordOverride;
        delete (req.body as any).adminOverridePassword;
        console.log(
          `[admin-override] Old-rental edit on reservation #${id} approved with admin password (user: ${req.user?.username}).`,
        );
      }

      // Check for conflicts only if this patch actually moves the booking. With
      // partial updates the values to check are the *effective* ones — the old
      // code only looked when vehicleId AND startDate happened to be in the body.
      // FIX-F (BUG-106, BUG-159): the check is handed to
      // `updateReservationChecked`, which runs it inside the same transaction as
      // the UPDATE and behind the vehicle's advisory lock, so the calendar drag
      // cannot land on a slot a parallel edit just took.
      const effectiveVehicleIdForPatch = (reservationData.vehicleId ?? existingReservationForDiff.vehicleId) as number | null;
      const bookingCheckForPatch: BookingRequest | null =
        SCHEDULING_FIELDS.some((f) => f in reservationData) && effectiveVehicleIdForPatch && mergedStartDate
          ? {
              vehicleId: effectiveVehicleIdForPatch,
              startDate: mergedStartDate,
              endDate: mergedEndDate || null,
              startTime: (reservationData.startTime ?? existingReservationForDiff.startTime) ?? null,
              endTime: (reservationData.endTime ?? existingReservationForDiff.endTime) ?? null,
              isMaintenanceBlock: (reservationData.type === 'maintenance_block') ||
                                  (existingReservationForDiff.type === 'maintenance_block'),
            }
          : null;

      // Add user tracking information for updates
      const user = req.user;
      const dataWithTracking = {
        ...reservationData,
        updatedBy: user ? user.username : null
      };

      // besluiten B-09 (BUG-013) — an edit that moves a rental over a
      // maintenance block saves, and says so.
      let patchWarnings: BookingWarning[] = [];
      const reservation = await storage.updateReservationChecked(id, dataWithTracking, bookingCheckForPatch, {
        onVerdict: (verdict) => { patchWarnings = warningsForVerdict(verdict); },
      });

      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      void onMaintenanceBlockChanged(existingReservationForDiff, reservation);
      // besluiten B-13 (BUG-139) — the rental moved to another car: the block
      // stays with the physical car, its spare and the customer's maintenance
      // notification lapse, and the customer is told. Awaited so the response
      // already reflects the cascade.
      await onRentalVehicleChanged(existingReservationForDiff, reservation);

      // Keep the driver assignment history in sync with staff edits so the
      // customer portal (and later the fines attribution) sees every change.
      if ('driverId' in dataWithTracking && (dataWithTracking.driverId ?? null) !== (existingReservationForDiff.driverId ?? null)) {
        await assignDriverToReservation({
          reservationId: id,
          driverId: dataWithTracking.driverId ?? null,
          byUserId: req.user?.id,
          note: 'staff',
        });
      }

      // Detect contract-relevant changes and regenerate unsigned contract PDFs
      // in the background (fire-and-forget so we don't slow the response).
      try {
        const changedFields = CONTRACT_RELEVANT_FIELDS.filter((field) => {
          if (!(field in reservationData)) return false;
          const before = (existingReservationForDiff as any)[field];
          const after = (reservation as any)[field];
          const norm = (v: any) =>
            v === undefined || v === "" ? null : v instanceof Date ? v.toISOString() : v;
          return norm(before) !== norm(after);
        });
        if (changedFields.length > 0) {
          console.log(
            `[contract-regen] Reservation #${id} contract-relevant fields changed: ${changedFields.join(", ")} — scheduling PDF regeneration.`,
          );
          scheduleReservationPdfRegeneration(
            id,
            user ? user.username : null,
            { contract: true, damageCheck: true },
          );
        }
      } catch (regenErr) {
        console.error(
          "[contract-regen] Error scheduling regeneration:",
          regenErr,
        );
      }
      
      // If there's a file, create a document record linked to the vehicle
      // and update the reservation with the damage check path
      if (req.file) {
        const documentData = {
          vehicleId: reservationData.vehicleId,
          documentType: "Damage Check",
          fileName: req.file.originalname,
          filePath: getRelativePath(req.file.path),
          fileSize: req.file.size,
          contentType: req.file.mimetype,
          createdBy: user ? user.username : `Reservation #${reservation.id} (Updated)`,
          notes: `Updated damage check for reservation from ${reservationData.startDate} to ${reservationData.endDate}`
        };
        
        const document = await storage.createDocument(documentData);
        
        // Update the reservation with the damage check path (using relative path)
        await storage.updateReservation(reservation.id, {
          damageCheckPath: getRelativePath(req.file.path)
        });
      }
      
      // Sync vehicle availability status after updating reservation
      await storage.syncVehicleAvailabilityWithReservations();
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.reservations.updated(reservation);

      res.json(patchWarnings.length ? { ...reservation, warnings: patchWarnings } : reservation);
    } catch (error) {
      // FIX-D/BUG-148: one envelope — a validation failure names the fields, a
      // recognised constraint names our field, everything else is a bare 500.
      sendRouteError(res, error, "Failed to update reservation");
    }
  });

  // ==================== SPARE VEHICLE MANAGEMENT ROUTES ====================
  
  // Get available spare vehicles for a date range
  app.get("/api/spare-vehicles/available", requireAuth, hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, excludeVehicleId } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      
      const exclude = excludeVehicleId ? parseInt(excludeVehicleId as string) : undefined;
      const availableVehicles = await storage.getAvailableVehiclesInRange(
        startDate as string, 
        endDate as string, 
        exclude
      );
      
      res.json(availableVehicles);
    } catch (error) {
      console.error("Error getting available spare vehicles:", error);
      res.status(500).json({ message: "Error getting available vehicles" });
    }
  });

  // Mark a reservation's vehicle as needing service
  app.post("/api/reservations/:id/mark-needs-service", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.id);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      
      const { maintenanceStatus, maintenanceNote, serviceStartDate, serviceEndDate } = req.body;
      
      // Validate required fields
      if (!maintenanceStatus) {
        return res.status(400).json({ message: "maintenanceStatus is required" });
      }

      // BUG-031: this route calls storage.createMaintenanceBlock() directly and
      // so bypasses the zod refinement every other creation path runs, which is
      // how an end date before the start date got inserted.
      for (const [field, value] of [["serviceStartDate", serviceStartDate], ["serviceEndDate", serviceEndDate]] as const) {
        if (value == null || value === "") continue;
        if (typeof value !== "string" || !isCalendarDate(value)) {
          return res.status(400).json({
            message: "Invalid service date",
            errors: [{ field, message: "Use a real yyyy-MM-dd date" }],
          });
        }
      }
      if (serviceStartDate && serviceEndDate && serviceEndDate < serviceStartDate) {
        return res.status(400).json({
          message: "Invalid service date range",
          errors: [{ field: "serviceEndDate", message: "The end date must be on or after the start date" }],
        });
      }
      
      // Get the reservation to find the vehicle
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Mark the vehicle for service
      const updatedVehicle = await storage.markVehicleForService(
        reservation.vehicleId!, 
        maintenanceStatus, 
        maintenanceNote
      );
      
      if (!updatedVehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Create maintenance block if dates provided
      if (serviceStartDate) {
        const block = await storage.createMaintenanceBlock(
          reservation.vehicleId!,
          serviceStartDate,
          serviceEndDate,
          // Carry the renting customer onto the block so the maintenance
          // calendar and edit dialog show who had the vehicle.
          reservation.customerId
        );
        void onMaintenanceBlockChanged(null, block);
      }
      
      res.json({
        message: "Vehicle marked for service successfully",
        vehicle: updatedVehicle
      });
      
    } catch (error) {
      console.error("Error marking vehicle for service:", error);
      res.status(500).json({ message: "Error marking vehicle for service" });
    }
  });

  // Assign a spare vehicle to a reservation
  app.post("/api/reservations/:id/assign-spare", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const originalReservationId = parseInt(req.params.id);
      if (isNaN(originalReservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      
      const { spareVehicleId, startDate, endDate } = req.body;
      
      // Validate required fields
      if (!spareVehicleId || !startDate) {
        return res.status(400).json({ 
          message: "spareVehicleId and startDate are required" 
        });
      }
      
      const spareId = parseInt(spareVehicleId);
      if (isNaN(spareId)) {
        return res.status(400).json({ message: "Invalid spare vehicle ID" });
      }
      
      // Create replacement reservation
      const replacementReservation = await storage.createReplacementReservation(
        originalReservationId,
        spareId,
        startDate,
        endDate
      );
      void onReplacementAssigned(replacementReservation);

      res.json({
        message: "Spare vehicle assigned successfully",
        replacementReservation
      });
      
    } catch (error) {
      // FIX-F (BUG-160): an unavailable spare is a 409 with the conflicting
      // rows, not a 400 carrying a sentence the UI has to string-match.
      if (error instanceof BookingConflictError) {
        return res.status(error.status).json(error.toBody());
      }
      // FIX-V (BUG-032/BUG-004): "the current spare is already picked up" is a
      // 409 with a code, like the transport path has always answered.
      if (error instanceof HttpError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      console.error("Error assigning spare vehicle:", error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Error assigning spare vehicle" });
      }
    }
  });

  // Return vehicle from service and close replacement
  app.post("/api/reservations/:id/return-from-service", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const replacementReservationId = parseInt(req.params.id);
      if (isNaN(replacementReservationId)) {
        return res.status(400).json({ message: "Invalid replacement reservation ID" });
      }
      
      const { returnDate, mileage } = req.body;
      
      if (!returnDate) {
        return res.status(400).json({ message: "returnDate is required" });
      }
      
      // Close the replacement reservation
      const updatedReservation = await storage.closeReplacementReservation(
        replacementReservationId,
        returnDate
      );
      
      if (!updatedReservation) {
        return res.status(404).json({ 
          message: "Replacement reservation not found or invalid" 
        });
      }
      
      res.json({
        message: "Vehicle returned from service successfully",
        reservation: updatedReservation
      });
      
    } catch (error) {
      console.error("Error returning vehicle from service:", error);
      res.status(500).json({ message: "Error returning vehicle from service" });
    }
  });

  // Get spare vehicle info for a vehicle (when it has a spare assigned to its customer)
  app.get("/api/vehicles/:id/spare-assignment", hasPermission(UserPermission.VIEW_VEHICLES), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.id);
      if (isNaN(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }
      
      const spareInfo = await storage.getSpareVehicleForVehicle(vehicleId);
      
      if (!spareInfo) {
        return res.status(404).json({ message: "No spare vehicle assigned" });
      }
      
      res.json(spareInfo);
      
    } catch (error) {
      console.error("Error getting spare vehicle info:", error);
      res.status(500).json({ message: "Error getting spare vehicle info" });
    }
  });

  // Get info when a vehicle is acting as a spare for another vehicle
  app.get("/api/vehicles/:id/acting-as-spare", hasPermission(UserPermission.VIEW_VEHICLES), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.id);
      if (isNaN(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }
      
      const actingAsSpareInfo = await storage.getActingAsSpareInfo(vehicleId);
      
      if (!actingAsSpareInfo) {
        return res.status(404).json({ message: "Vehicle is not acting as a spare" });
      }
      
      res.json(actingAsSpareInfo);
      
    } catch (error) {
      console.error("Error getting acting as spare info:", error);
      res.status(500).json({ message: "Error getting acting as spare info" });
    }
  });

  // Get active replacement by original reservation
  app.get("/api/reservations/:id/active-replacement", hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const originalReservationId = parseInt(req.params.id);
      if (isNaN(originalReservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      
      const activeReplacement = await storage.getActiveReplacementByOriginal(originalReservationId);
      
      if (!activeReplacement) {
        return res.status(404).json({ message: "No active replacement found" });
      }
      
      res.json(activeReplacement);
      
    } catch (error) {
      console.error("Error getting active replacement:", error);
      res.status(500).json({ message: "Error getting active replacement" });
    }
  });

  // Update legacy notes with vehicle details
  app.post("/api/reservations/update-legacy-notes", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const updatedCount = await storage.updateLegacyNotesWithVehicleDetails();
      
      res.json({
        message: `Successfully updated ${updatedCount} reservation notes with vehicle details`,
        updatedCount
      });
      
    } catch (error) {
      console.error("Error updating legacy notes:", error);
      res.status(500).json({ message: "Error updating legacy notes" });
    }
  });

  // Update spare vehicle status
  app.patch("/api/reservations/:id/spare-status", requireAuth, hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.id);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const { spareVehicleStatus } = req.body;
      const validStatuses = ['assigned', 'ready', 'picked_up', 'returned'];
      
      if (!spareVehicleStatus || !validStatuses.includes(spareVehicleStatus)) {
        return res.status(400).json({ 
          message: "Invalid spare vehicle status. Must be one of: " + validStatuses.join(', ') 
        });
      }

      // Get current reservation to validate transition
      const existingReservation = await storage.getReservation(reservationId);
      if (!existingReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // BUG-036: `spareVehicleStatus` is a concept of replacement vehicles.
      // The route validated the value and the transition but never the row, so
      // an ordinary customer rental could be stamped 'ready' and every screen
      // that reads the column for a handover state showed nonsense.
      if (existingReservation.type !== 'replacement') {
        return res.status(400).json({
          message: "Spare vehicle status can only be set on a replacement reservation.",
          field: "spareVehicleStatus",
          details: { reservationType: existingReservation.type },
        });
      }

      // Validate spare vehicle status transition
      const currentSpareStatus = existingReservation.spareVehicleStatus;
      if (!isValidSpareTransition(currentSpareStatus, spareVehicleStatus)) {
        return res.status(400).json({ 
          message: `Invalid spare status transition from '${currentSpareStatus || 'none'}' to '${spareVehicleStatus}'`,
          details: {
            currentStatus: currentSpareStatus,
            requestedStatus: spareVehicleStatus,
            hint: "Valid transitions: assigned → ready → picked_up → returned"
          }
        });
      }

      const updatedReservation = await storage.updateReservation(reservationId, { 
        spareVehicleStatus,
        updatedBy: (req as any).user?.username 
      });

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      res.json(updatedReservation);
    } catch (error) {
      console.error("Error updating spare vehicle status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== PICKUP AND RETURN ROUTES ====================
  
  // Pickup a reservation (enter mileage/fuel, generate contract)
  app.post("/api/reservations/:id/pickup", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.id);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const { contractNumber, pickupMileage, fuelLevelPickup, pickupDate, pickupNotes, templateId, allowMileageDecrease, overridePassword, overrideContractNumber } = req.body;
      
      if (!contractNumber || contractNumber.trim() === '') {
        return res.status(400).json({
          message: "Contract number is required"
        });
      }

      // BUG-131: pickupDate was destructured and used unvalidated - it lands in
      // the reservation, in every later date comparison, and in a generated
      // filename. Only a real yyyy-MM-dd day gets through.
      if (pickupDate != null && pickupDate !== '' && (typeof pickupDate !== 'string' || !isCalendarDate(pickupDate))) {
        return res.status(400).json({
          message: "Invalid pickup date",
          errors: [{ field: "pickupDate", message: "Use a real yyyy-MM-dd date" }],
        });
      }

      // BUG-038: PATCH /:id has always pre-checked the contract number; the
      // pickup handler did not, so the second pickup with the same number hit
      // the unique constraint and the raw driver message reached the client.
      if (!overrideContractNumber) {
        const allForContract = await storage.getAllReservations();
        const duplicateContract = allForContract.find(
          (r) => r.id !== reservationId && r.contractNumber === contractNumber.trim(),
        );
        if (duplicateContract) {
          return res.status(409).json({
            message: `Contract number "${contractNumber.trim()}" is already used by reservation #${duplicateContract.id}.`,
            code: "DUPLICATE_CONTRACT_NUMBER",
            conflictingReservationId: duplicateContract.id,
          });
        }
      }

      // Handle contract number override - MUST happen BEFORE pickup to avoid unique constraint
      if (overrideContractNumber) {
        // Find and clear the contract number from any existing reservation
        const allReservations = await storage.getAllReservations();
        const existingReservation = allReservations.find(r => r.contractNumber === contractNumber.trim());
        
        if (existingReservation && existingReservation.id !== reservationId) {
          console.log(`🔄 Clearing contract number ${contractNumber} from reservation #${existingReservation.id} (override requested)`);
          await storage.updateReservation(existingReservation.id, { contractNumber: null });
        }
      }
      
      if (pickupMileage === undefined || pickupMileage === null || pickupMileage === '' || !fuelLevelPickup) {
        return res.status(400).json({ 
          message: "Pickup mileage and fuel level are required" 
        });
      }

      const mileage = parseInt(pickupMileage);
      if (isNaN(mileage) || mileage < 0) {
        return res.status(400).json({ 
          message: "Invalid mileage value" 
        });
      }

      const reservation = await storage.getReservation(reservationId);
      if (!reservation || !reservation.vehicle) {
        return res.status(404).json({ message: "Reservation or vehicle not found" });
      }

      let mileageDecreaseAuthorizedBy: string | undefined;

      if (reservation.vehicle.currentMileage && mileage < reservation.vehicle.currentMileage) {
        const authorization = await authorizeMileageDecrease(
          req,
          allowMileageDecrease ? overridePassword : undefined,
          { oldMileage: reservation.vehicle.currentMileage, newMileage: mileage },
        );

        if (!authorization.ok) {
          return res.status(authorization.status).json(authorization.body);
        }

        mileageDecreaseAuthorizedBy = authorization.authorizedBy;
      }

      const updatedReservation = await storage.pickupReservation(reservationId, {
        contractNumber: contractNumber.trim(),
        pickupMileage: mileage,
        fuelLevelPickup,
        pickupDate,
        pickupNotes,
        allowMileageDecrease: !!mileageDecreaseAuthorizedBy,
        mileageDecreaseAuthorizedBy,
        // besluiten B-03 — the administrator override for a vehicle that is in
        // the workshop or marked not for rental.
        workshopOverride: workshopOverrideFrom(req),
      });

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // Auto-clear contract number override if this contract number matches the override
      // This makes the override a "one-shot" feature
      try {
        const settings = await storage.getSettings();
        if (settings?.contractNumberOverride) {
          const usedNumber = parseInt(contractNumber.trim(), 10);
          if (!isNaN(usedNumber) && usedNumber === settings.contractNumberOverride) {
            await storage.clearContractNumberOverride('System (auto-clear after use)');
            console.log(`🔄 Auto-cleared contract number override after using ${usedNumber}`);
          }
        }
      } catch (overrideError) {
        console.error('Warning: Failed to auto-clear contract number override:', overrideError);
        // Don't fail the pickup if override clear fails
      }

      let contractDocument = null;
      try {
        // FIX-N/FIX-O: the same picker and the same registry as every other
        // contract endpoint. The legacy fixed-coordinate renderer that used to
        // be the "built-in default" is gone (BUG-164): it never applied the
        // 842-y flip, so every value it drew landed in the wrong box.
        const pickupTemplateId = templateId ? parseInt(String(templateId), 10) : undefined;
        const pickupSelection = await selectContractTemplate(
          Number.isInteger(pickupTemplateId as number) && (pickupTemplateId as number) > 0
            ? (pickupTemplateId as number)
            : undefined,
        );

        if (!pickupSelection.ok) {
          console.warn(
            `No usable contract template for reservation ${reservationId}: ${pickupSelection.message}`,
          );
        } else if (updatedReservation.vehicle) {
          const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
          console.log(
            `Generating contract for reservation ${reservationId} using template ${pickupSelection.template.id}`,
          );
          const contractPdf = await generateRentalContractFromTemplate(
            updatedReservation,
            pickupSelection.template,
          );
          contractDocument = await registerGeneratedDocument({
            documentType: DOCUMENT_TYPE_CONTRACT_UNSIGNED,
            bytes: contractPdf,
            vehicleId: updatedReservation.vehicleId ?? null,
            vehiclePlate: updatedReservation.vehicle.licensePlate,
            reservationId: updatedReservation.id,
            createdBy: (req as any).user?.username || 'system',
            notes: `Contract generated at pickup of reservation #${reservationId}`,
          });
          console.log(`Contract document registered in database`);
        }
      } catch (pdfError) {
        console.error("Error generating contract PDF:", pdfError);
      }

      res.json({
        ...updatedReservation,
        contractDocument
      });
    } catch (error) {
      // FIX-H (besluiten B-03): the workshop refusal and the override rules
      // answer with their own status and code, before the legacy string matching.
      if (error instanceof WorkshopBlockedError || error instanceof StateTransitionError) {
        return res.status(error.status).json(error.toBody());
      }
      // FIX-G (BUG-174): the loser of two parallel pickups gets a 409 with a
      // code, not a 400 built by string-matching an error message.
      if (error instanceof HttpError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      console.error("Error during reservation pickup:", error);

      if (error instanceof Error) {
        if (error.message.includes('cannot be less than')) {
          return res.status(409).json({ message: error.message });
        }
        if (error.message.includes('Cannot pickup')) {
          return res.status(400).json({ message: error.message });
        }
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Return a reservation (enter mileage/fuel, generate damage check)
  app.post("/api/reservations/:id/return", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.id);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const { returnMileage, fuelLevelReturn, returnDate, returnNotes } = req.body;

      // BUG-131: same as pickupDate - unvalidated text went into the row and
      // into a filename, and a return before the pickup was accepted.
      if (returnDate != null && returnDate !== '' && (typeof returnDate !== 'string' || !isCalendarDate(returnDate))) {
        return res.status(400).json({
          message: "Invalid return date",
          errors: [{ field: "returnDate", message: "Use a real yyyy-MM-dd date" }],
        });
      }
      if (returnDate) {
        const existingForReturn = await storage.getReservation(reservationId);
        if (existingForReturn?.actualPickupDate && returnDate < existingForReturn.actualPickupDate) {
          return res.status(400).json({
            message: "Invalid return date",
            errors: [{ field: "returnDate", message: "The return date cannot be before the pickup date" }],
          });
        }
      }

      if (returnMileage === undefined || returnMileage === null || returnMileage === '' || !fuelLevelReturn) {
        return res.status(400).json({
          message: "Return mileage and fuel level are required"
        });
      }

      const mileage = parseInt(returnMileage);
      if (isNaN(mileage) || mileage < 0) {
        return res.status(400).json({ 
          message: "Invalid mileage value" 
        });
      }

      const updatedReservation = await storage.returnReservation(reservationId, {
        returnMileage: mileage,
        fuelLevelReturn,
        returnDate,
        returnNotes
      });

      if (!updatedReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // FIX-H / besluiten B-03 — this unconditional `availabilityStatus:
      // 'available'` was the third writer of the column, and the one that
      // silently wiped a deliberate `needs_fixing` on every return (BUG-109).
      // `returnReservation` has already written the mileage and the fuel level
      // and recomputed the status from the one rule, inside its transaction.

      let damageCheckDocument = null;
      try {
        if (!updatedReservation.vehicle || !updatedReservation.vehicleId) {
          console.warn('No vehicle found for reservation, skipping damage check generation');
        } else {
          const vehicle = updatedReservation.vehicle;
          
          const allTemplates = await storage.getDamageCheckTemplatesByVehicle(
            vehicle.brand,
            vehicle.model,
            vehicle.vehicleType || undefined
          );
          
          let template = null;
          
          if (allTemplates.length > 0) {
            if (vehicle.vehicleType) {
              template = allTemplates.find(t => 
                t.vehicleMake === vehicle.brand && 
                t.vehicleModel === vehicle.model &&
                t.vehicleType === vehicle.vehicleType
              );
            }
            
            if (!template) {
              template = allTemplates.find(t => 
                t.vehicleMake === vehicle.brand && 
                t.vehicleModel === vehicle.model &&
                !t.vehicleType
              );
            }
            
            if (!template && vehicle.vehicleType) {
              template = allTemplates.find(t => 
                t.vehicleMake === vehicle.brand && 
                t.vehicleType === vehicle.vehicleType &&
                !t.vehicleModel
              );
            }
            
            if (!template && vehicle.vehicleType) {
              template = allTemplates.find(t => 
                t.vehicleType === vehicle.vehicleType &&
                !t.vehicleMake &&
                !t.vehicleModel
              );
            }
          }
          
          if (!template) {
            template = await storage.getDefaultDamageCheckTemplate();
          }

          if (template) {
            console.log(`📝 Generating damage check for reservation ${reservationId} using template ${template.id}`);
            
            const { generateDamageCheckPDFWithTemplate } = await import('./pdf-damage-check-generator');

            // Build correct vehicle / reservation payloads (the previous code
            // had them swapped, which prevented all dynamic fields and
            // checklist answers from rendering on the generated PDF).
            const damageCheckVehicleData = {
              brand: vehicle.brand,
              model: vehicle.model,
              licensePlate: vehicle.licensePlate,
              buildYear: vehicle.productionDate || undefined,
              fuel: fuelLevelReturn || vehicle.fuel || undefined,
              mileage: mileage,
            };
            let damageCheckReservationData: any = undefined;
            try {
              const customerForCheck = updatedReservation.customerId
                ? await storage.getCustomer(updatedReservation.customerId)
                : null;
              // BUG-166: one builder, and it reads the `name` column first —
              // this site preferred the two nullable ones and printed
              // "null null" wherever they were empty.
              damageCheckReservationData = buildDamageCheckReservationData(
                updatedReservation as any,
                customerForCheck as any,
              );
            } catch (e) {
              console.warn('[return-damage-check] Could not build reservation data:', (e as Error).message);
            }
            // Pick up the latest interactive damage check so all ticked
            // checkboxes and recorded answers appear on the PDF.
            let latestInteractiveCheck: any = undefined;
            try {
              const checks = await storage.getInteractiveDamageChecksByReservation(reservationId);
              if (checks && checks.length > 0) {
                latestInteractiveCheck = checks[0]; // storage returns desc(checkDate), so [0] is newest
              }
            } catch (e) {
              console.warn('[return-damage-check] Could not load interactive check:', (e as Error).message);
            }

            const damageCheckPdf = await generateDamageCheckPDFWithTemplate(
              damageCheckVehicleData,
              template,
              damageCheckReservationData,
              latestInteractiveCheck,
            );
            
            damageCheckDocument = await registerGeneratedDocument({
              documentType: 'Damage Check',
              bytes: damageCheckPdf,
              vehicleId: updatedReservation.vehicleId ?? null,
              vehiclePlate: vehicle.licensePlate,
              reservationId: updatedReservation.id,
              createdBy: (req as any).user?.username || 'system',
              notes: `Damage check recorded at return of reservation #${reservationId}`,
            });
            console.log(`✅ Damage check document registered in database`);
          }
        }
      } catch (pdfError) {
        console.error("Error generating damage check PDF:", pdfError);
      }

      res.json({
        ...updatedReservation,
        damageCheckDocument
      });
    } catch (error) {
      console.error("Error during reservation return:", error);
      
      if (error instanceof Error) {
        if (error.message.includes('cannot be less than')) {
          return res.status(409).json({ message: error.message });
        }
        if (error.message.includes('Cannot return')) {
          return res.status(400).json({ message: error.message });
        }
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== PLACEHOLDER SPARE VEHICLE ROUTES ====================
  
  // Create a placeholder spare vehicle reservation
  app.post("/api/placeholder-reservations", requireAuth, hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      // Handle the case where the body is double-wrapped (from apiRequest function)
      let requestData = req.body;
      if (req.body.body && typeof req.body.body === 'string') {
        try {
          requestData = JSON.parse(req.body.body);
          console.log("Parsed double-wrapped body:", requestData);
        } catch (e) {
          console.error("Failed to parse body.body:", e);
        }
      }
      
      // Validate request body with Zod
      const validatedData = createPlaceholderReservationSchema.parse(requestData);
      
      // Create placeholder reservation
      const placeholderReservation = await storage.createPlaceholderReservation(
        validatedData.originalReservationId,
        validatedData.customerId,
        validatedData.startDate,
        validatedData.endDate
      );
      
      res.status(201).json(placeholderReservation);
      
    } catch (error) {
      console.error("Error creating placeholder reservation:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      
      if (error instanceof Error) {
        // Map storage errors to proper HTTP status codes
        if (error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('already exists')) {
          return res.status(409).json({ message: error.message });
        }
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get placeholder reservations with optional date filtering
  app.get("/api/placeholder-reservations", requireAuth, hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      // Validate query parameters with Zod
      const validatedQuery = placeholderQuerySchema.parse(req.query);
      
      const placeholders = await storage.getPlaceholderReservations(
        validatedQuery.startDate,
        validatedQuery.endDate
      );
      
      res.json(placeholders);
      
    } catch (error) {
      console.error("Error getting placeholder reservations:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get placeholder reservations needing assignment (upcoming within specified days)
  app.get("/api/placeholder-reservations/needing-assignment", requireAuth, hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      // Validate query parameters with Zod
      const validatedQuery = placeholderNeedingAssignmentQuerySchema.parse(req.query);
      
      const placeholders = await storage.getPlaceholderReservationsNeedingAssignment(validatedQuery.daysAhead);
      
      res.json(placeholders);
      
    } catch (error) {
      console.error("Error getting placeholders needing assignment:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid query parameters", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Assign a vehicle to a placeholder reservation
  app.post("/api/placeholder-reservations/:id/assign-vehicle", requireAuth, hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      // Validate path parameter
      const placeholderReservationId = parseInt(req.params.id);
      if (isNaN(placeholderReservationId) || placeholderReservationId <= 0) {
        return res.status(400).json({ message: "Invalid placeholder reservation ID" });
      }
      
      // Validate request body with Zod
      const validatedData = assignVehicleToPlaceholderSchema.parse(req.body);
      
      // Assign vehicle to placeholder
      const updatedReservation = await storage.assignVehicleToPlaceholder(
        placeholderReservationId,
        validatedData.vehicleId,
        validatedData.endDate
      );
      
      if (!updatedReservation) {
        return res.status(404).json({
          message: "Placeholder reservation not found or invalid"
        });
      }
      void onReplacementAssigned(updatedReservation);

      res.json(updatedReservation);
      
    } catch (error) {
      // FIX-F/FIX-G (BUG-158, BUG-160): an occupied vehicle, or a placeholder
      // a parallel request already filled in, is a 409 — not a 400 built from
      // a string match on the error message.
      if (error instanceof BookingConflictError) {
        return res.status(error.status).json(error.toBody());
      }
      // FIX-V (BUG-137): a closed transport or a cancelled placeholder is a 409
      // with a code, not a 400 built by string-matching the message.
      if (error instanceof HttpError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      console.error("Error assigning vehicle to placeholder:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      
      if (error instanceof Error) {
        // Map storage errors to proper HTTP status codes
        if (error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('not available') || error.message.includes('conflict')) {
          return res.status(409).json({ message: error.message });
        }
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });


  // Delete reservation (soft delete with user tracking)
  app.delete("/api/reservations/:id", requireAuth, hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      
      // Check if reservation exists and is not already deleted
      const reservation = await storage.getReservation(id);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Check if already deleted
      if (reservation.deletedAt) {
        return res.status(410).json({ message: "Reservation already deleted" });
      }
      
      const user = req.user;
      const softDeleteData = {
        deletedAt: new Date(),
        deletedBy: user ? user.username : null,
        deletedByUser: user ? user.id : null,
        updatedBy: user ? user.username : null, // Also track who made the update
        contractNumber: null // Free up contract number when deleting reservation
      };
      
      // FIX-V — deleting a maintenance block closes **its own** spares.
      //
      // BUG-118: the cascade used to collect every customer rental on the same
      // vehicle whose period overlapped the block, and then soft-delete every
      // replacement of those rentals — regardless of which block had created
      // them. On a vehicle with two live blocks, deleting the stale one booked
      // the real one's spare away and left the customer without a car, while
      // `needing-assignment` showed nothing. The link is now explicit
      // (`maintenanceBlockId`); the date-overlap rule survives only as a
      // fallback for rows written before that column existed.
      //
      // BUG-014: the freed spare vehicles are recomputed afterwards, so they do
      // not stay `scheduled` for ever.
      const freedSpareVehicleIds: number[] = [];
      if (reservation.type === 'maintenance_block') {
        const allReservations = await storage.getAllReservations();

        const maintenanceStart = reservation.startDate;
        const maintenanceEnd = reservation.endDate || '9999-12-31';

        const legacyAffectedRentalIds = allReservations.filter(r =>
          r.id !== id &&
          !r.deletedAt &&
          r.vehicleId === reservation.vehicleId &&
          r.type === 'standard' &&
          r.customerId !== null &&
          r.startDate <= maintenanceEnd &&
          (r.endDate || '9999-12-31') >= maintenanceStart
        ).map(r => r.id);

        const replacementsToClose = allReservations.filter(r => {
          if (r.type !== 'replacement' || r.deletedAt) return false;
          if (r.maintenanceBlockId != null) return r.maintenanceBlockId === id;
          // Legacy row: no owner recorded. Match the old rule, but only within
          // the block's own period, so a spare for a different period survives.
          if (r.replacementForReservationId == null) return false;
          if (!legacyAffectedRentalIds.includes(r.replacementForReservationId)) return false;
          return r.startDate <= maintenanceEnd && (r.endDate || '9999-12-31') >= maintenanceStart;
        });

        for (const replacement of replacementsToClose) {
          // BUG-004's rule, here too: a spare that is really at the customer is
          // not swept away by deleting the workshop appointment.
          if (normalizeReservationStatus(replacement.status) === 'picked_up') {
            console.warn(`[block-delete] spare #${replacement.id} is picked up — left in place`);
            continue;
          }
          await storage.updateReservation(replacement.id, softDeleteData);
          if (replacement.vehicleId != null) freedSpareVehicleIds.push(replacement.vehicleId);
          realtimeEvents.reservations.deleted({ id: replacement.id });

          if (replacement.placeholderSpare) {
            await storage.deleteNotificationsByTypeAndPattern("spare_assignment", `[placeholder:${replacement.id}]`);
          }
        }
      }
      
      // FIX-X (BUG-090, BUG-055) — one conditional write: the precondition
      // travels with it, so two parallel deletes give one 200 and one 410
      // instead of a 500 echoing `error.message`. It also closes the open
      // driver assignment and the delivery transport in the same transaction.
      const updatedReservation = await storage.softDeleteReservation(id, {
        username: user ? user.username : null,
        userId: user ? user.id : null,
      });
      if (!updatedReservation) {
        return res.status(410).json({ message: "Reservation already deleted" });
      }
      {
        if (reservation.type === 'maintenance_block') void onMaintenanceBlockChanged(reservation, null);
        // If this was a placeholder spare reservation, delete its notification
        if (reservation.placeholderSpare && reservation.type === 'replacement') {
          await storage.deleteNotificationsByTypeAndPattern("spare_assignment", `[placeholder:${id}]`);
          console.log(`🔔 Deleted spare assignment notification for placeholder ${id}`);
        }
        
        // FIX-H/FIX-V — recompute the vehicles this delete touched: the one the
        // reservation was on, and every spare it just released (BUG-014).
        await storage.recomputeVehicleAvailability(reservation.vehicleId);
        for (const spareVehicleId of Array.from(new Set(freedSpareVehicleIds))) {
          await storage.recomputeVehicleAvailability(spareVehicleId);
        }

        await AuditLogger.logFromRequest(
          req,
          'reservation.delete',
          'reservation',
          id,
          {
            vehicleId: reservation.vehicleId,
            customerId: reservation.customerId,
            status: reservation.status,
            contractNumber: reservation.contractNumber,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
          },
        );

        // Broadcast real-time update to all connected clients
        realtimeEvents.reservations.deleted({ id });

        res.status(200).json({
          message: "Reservation deleted successfully",
          deletedBy: user ? user.username : 'Unknown'
        });
      }
    } catch (error) {
      // FIX-X (BUG-090): never `error.message` in the body.
      sendRouteError(res, error, "Failed to delete reservation");
    }
  });
  registerExpenseRoutes(app, routeDeps);

  // ==================== VEHICLE-SPECIFIC CUSTOMER ROUTES ====================
  // Get customers who have rented a specific vehicle (for APK reminders, etc.)
  app.get('/api/vehicles/:vehicleId/customers-with-reservations', requireAuth, hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.vehicleId);
      
      if (isNaN(vehicleId)) {
        return res.status(400).json({ error: 'Invalid vehicle ID' });
      }
      
      // Get ALL reservations for this vehicle (past and present)
      const vehicleReservations = await storage.getReservationsByVehicle(vehicleId);
      
      // Get unique customer details with their most recent reservation
      const customersMap = new Map();
      
      for (const reservation of vehicleReservations) {
        // Skip maintenance blocks (they don't have customers)
        if (reservation.type === 'maintenance_block' || !reservation.customerId) {
          continue;
        }
        
        // Get customer details
        const customer = await storage.getCustomer(reservation.customerId);
        const vehicle = await storage.getVehicle(vehicleId);
        
        if (customer && vehicle) {
          // Use customer ID as key to avoid duplicates
          // Keep the most recent reservation for each customer
          const existingEntry = customersMap.get(customer.id);
          const reservationDate = new Date(reservation.startDate);
          
          if (!existingEntry || new Date(existingEntry.reservation.startDate) < reservationDate) {
            customersMap.set(customer.id, {
              vehicle,
              customer,
              reservation
            });
          }
        }
      }
      
      // Convert Map to array
      const customersWithReservations = Array.from(customersMap.values());

      console.log(`Found ${customersWithReservations.length} unique customers who have rented vehicle ${vehicleId}`);
      
      res.json(customersWithReservations);
    } catch (error) {
      console.error('Error fetching customers with reservations for vehicle:', error);
      res.status(500).json({ 
        error: 'Failed to fetch customers with reservations',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ==================== DOCUMENT ROUTES ====================
  // Setup storage for document uploads
  /**
   * BUG-049 — multer's `destination` callback runs the moment the `file` part
   * appears in the stream, so `req.body.vehicleId` is only there if the client
   * happened to send that field first. Read the query parameter as well, which
   * is parsed before any part of the body.
   */
  const documentVehicleId = (req: Request): string | undefined => {
    const fromQuery = req.query?.vehicleId;
    if (typeof fromQuery === "string" && fromQuery !== "") return fromQuery;
    const fromBody = (req.body as Record<string, unknown> | undefined)?.vehicleId;
    return typeof fromBody === "string" || typeof fromBody === "number" ? String(fromBody) : undefined;
  };

  const createDocumentUploadStorage = async (req: Request, file: Express.Multer.File, callback: Function) => {
    try {
      const vehicleId = documentVehicleId(req);
      if (!vehicleId) {
        return callback(new UploadRejectedError("Vehicle ID is required. Send vehicleId before the file, or as a query parameter."), false);
      }
      
      // Get vehicle details for organizing files
      const vehicle = await storage.getVehicle(parseInt(vehicleId));
      if (!vehicle) {
        return callback(new Error("Vehicle not found"), false);
      }
      
      // Always remove all special characters including dashes from license plates for folder names
      const sanitizedPlateNoDashes = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
      
      // Special handling for Contract type documents - use the contracts folder structure
      if (req.body.documentType && req.body.documentType.toLowerCase() === 'contract') {
        const contractsBaseDir = path.join(getUploadsDir(), 'contracts');
        const vehicleContractsDir = path.join(contractsBaseDir, sanitizedPlateNoDashes);
        
        try {
          if (!fs.existsSync(contractsBaseDir)) {
            fs.mkdirSync(contractsBaseDir, { recursive: true });
          }
          
          if (!fs.existsSync(vehicleContractsDir)) {
            fs.mkdirSync(vehicleContractsDir, { recursive: true });
          }
          
          callback(null, vehicleContractsDir);
          return;
        } catch (error) {
          console.error('Failed to create contract directory:', error);
          return callback(new Error(`Failed to create upload directory: ${error instanceof Error ? error.message : String(error)}`), false);
        }
      }
      
      // Standard handling for non-contract documents - use consistent folder naming
      const baseDir = path.join(getUploadsDir(), sanitizedPlateNoDashes);
      let documentsDir = baseDir;
      
      // Organize by document type if provided
      if (req.body.documentType) {
        const sanitizedType = req.body.documentType.toLowerCase().replace(/\s+/g, '_');
        documentsDir = path.join(baseDir, sanitizedType);
      }
      
      try {
        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }
        if (!fs.existsSync(documentsDir)) {
          fs.mkdirSync(documentsDir, { recursive: true });
        }
        
        callback(null, documentsDir);
      } catch (error) {
        console.error('Failed to create document directory:', error);
        return callback(new Error(`Failed to create upload directory: ${error instanceof Error ? error.message : String(error)}`), false);
      }
    } catch (error) {
      // BUG-049: this used to hand the generic Express handler a bare Error, so
      // a missing/late vehicleId became a 500 with a stack instead of a 400.
      console.error("Error with document upload:", error);
      callback(new UploadRejectedError("Could not determine where to store this document. Send vehicleId before the file, or as a query parameter."), false);
    }
  };

  // Configure multer for document uploads
  const documentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      createDocumentUploadStorage(req, file, (err: any, result: any) => {
        if (err) return cb(err, '');
        cb(null, result);
      });
    },
    filename: async (req, file, cb) => {
      try {
        const timestamp = Date.now();
        const dateString = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const extension = path.extname(sanitizedOriginal);
        const documentType = sanitizeFilename(req.body.documentType || 'document');
        
        // Get vehicle license plate (BUG-049: query first, then the body)
        const vehicleId = parseInt(documentVehicleId(req) ?? "");
        const vehicle = Number.isInteger(vehicleId) ? await storage.getVehicle(vehicleId) : undefined;
        
        if (!vehicle) {
          throw new Error("Vehicle not found");
        }
        
        // Sanitize license plate for filename (remove spaces, etc.)
        const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
        
        // Special handling for Contract documents to match the auto-generated format
        if (documentType.toLowerCase() === 'contract') {
          const currentDate = new Date().getFullYear().toString() + 
                             (new Date().getMonth() + 1).toString().padStart(2, '0') + 
                             new Date().getDate().toString().padStart(2, '0');
          
          // BUG-184: the contract branch was the one document type without a
          // timestamp, so a second contract upload for the same plate on the same
          // day overwrote the first file on disk while still creating a second
          // documents row — and the older row then served the newer bytes. The
          // millisecond stamp is what every other branch below already does.
          const newFilename = `${sanitizedPlate}_contract_${currentDate}_${timestamp}${extension}`;
          console.log(`Creating contract filename: ${newFilename}`);
          cb(null, newFilename);
          return;
        }
        
        // Standard handling for other document types
        const newFilename = `${sanitizedPlate}_${documentType.replace(/\s+/g, '_')}_${dateString}_${timestamp}${extension}`;
        
        cb(null, newFilename);
      } catch (error) {
        console.error("Error creating filename:", error);
        // Fallback to simple timestamped name if there's an error
        const timestamp = Date.now();
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const extension = path.extname(sanitizedOriginal);
        const documentType = sanitizeFilename(req.body.documentType || 'document');
        const fallbackName = `${documentType.replace(/\s+/g, '_')}_${timestamp}${extension}`;
        cb(null, fallbackName);
      }
    }
  });
  
  // Configure multer for document uploads with enhanced security
  const documentUpload = sanitizeUploadedFields(multer({
    storage: documentStorage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for documents
    },
    fileFilter: createSecureMulterFilter('document'),
  }));

  // Get all documents
  app.get("/api/documents", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req, res) => {
    // Prevent caching to ensure fresh data is always returned
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // BUG-195: a document whose file is gone is still listed — nothing is
    // hidden or deleted without a decision — but it is now marked so the UI
    // can say so instead of only failing when somebody clicks download.
    const documents = await storage.getAllDocuments();
    res.json(annotateDocumentsFileState(documents));
  });

  // Get documents by vehicle
  app.get("/api/documents/vehicle/:vehicleId", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }

    const documents = await storage.getDocumentsByVehicle(vehicleId);
    res.json(annotateDocumentsFileState(documents));
  });

  // Get documents by reservation
  app.get("/api/documents/reservation/:reservationId", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req, res) => {
    const reservationId = parseInt(req.params.reservationId);
    if (isNaN(reservationId)) {
      return res.status(400).json({ message: "Invalid reservation ID" });
    }

    const documents = await storage.getDocumentsByReservation(reservationId);
    res.json(annotateDocumentsFileState(documents));
  });

  // Get all damage check documents (must be before :id route)
  app.get("/api/documents/damage-checks", hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const allDocuments = await storage.getAllDocuments();
      const damageChecks = allDocuments.filter(doc => isDamageCheckDocument(doc.documentType));
      res.json(annotateDocumentsFileState(damageChecks));
    } catch (error) {
      console.error("Error fetching damage checks:", error);
      res.status(500).json({ message: "Failed to fetch damage checks" });
    }
  });

  // Get single document
  app.get("/api/documents/:id", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid document ID" });
    }

    const document = await storage.getDocument(id);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.json(annotateDocumentFileState(document));
  });

  // Upload document
  app.post("/api/documents", hasPermission(UserPermission.MANAGE_DOCUMENTS), documentUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Post-upload validation - verify file content matches declared type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'document'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ message: fileValidation.error });
      }

      // Convert vehicleId and reservationId to numbers
      if (req.body.vehicleId) req.body.vehicleId = parseInt(req.body.vehicleId);
      if (req.body.reservationId) req.body.reservationId = parseInt(req.body.reservationId);
      
      // Get the filename from the path (which is the formatted name)
      const formattedFileName = path.basename(req.file.path);
      
      // Add user tracking information
      const user = req.user;
      
      const documentData = insertDocumentSchema.parse({
        ...req.body,
        fileName: formattedFileName,
        filePath: getRelativePath(req.file.path),
        fileSize: req.file.size,
        contentType: req.file.mimetype,
        createdBy: user ? user.username : null
      });
      
      const document = await storage.createDocument(documentData);
      
      // If this is an APK Inspection document and an APK date is provided, update the vehicle
      if (req.body.documentType === "APK Inspection" && req.body.apkDate && req.body.vehicleId) {
        try {
          await storage.updateVehicle(req.body.vehicleId, {
            apkDate: req.body.apkDate,
            updatedBy: user ? user.username : null
          });
        } catch (error) {
          console.error("Error updating vehicle APK date:", error);
          // Continue anyway - the document was uploaded successfully
        }
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.documents.created(document);
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid document data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to upload document", 
        });
      }
    }
  });

  // Update document
  app.patch("/api/documents/:id", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Get existing document
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Add user tracking information
      const user = req.user;
      
      // Update only allowed fields (documentType and notes)
      const documentData = {
        ...(req.body.documentType && { documentType: req.body.documentType }),
        ...(req.body.notes !== undefined && { notes: req.body.notes }),
        updatedBy: user ? user.username : null
      };
      
      const updatedDocument = await storage.updateDocument(id, documentData);
      if (!updatedDocument) {
        return res.status(404).json({ message: "Failed to update document" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.documents.updated(updatedDocument);
      
      res.json(updatedDocument);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(400).json({ 
        message: "Failed to update document", 
      });
    }
  });

  // View document (for preview/print)
  app.get("/api/documents/view/:id", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Get document details
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!document.filePath) {
        return res.status(404).json({ message: "No file path found for this document" });
      }

      // BUG-012: path.join(process.cwd(), filePath) let a stored '../package.json'
      // (or an absolute path) escape the uploads directory on view, download and
      // delete. resolveDocumentFilePath() tries exactly the same two candidates —
      // cwd-relative and uploads-relative, so legacy rows keep working — but
      // refuses anything that resolves outside uploads/.
      const absolutePath = resolveDocumentFilePath(document.filePath);
      if (!absolutePath) {
        console.error(`Document file not found or outside the uploads directory (document ${document.id}): ${document.filePath}`);
        return res.status(404).json({ message: "Document file not found on disk" });
      }

      // Set appropriate headers for inline viewing (not download)
      res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
      res.setHeader('Content-Type', document.contentType || 'application/octet-stream');

      // Serve the file
      res.sendFile(absolutePath, (err) => {
        if (err) {
          console.error("Error serving document file:", err);
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to serve document file" });
          }
        }
      });
    } catch (error) {
      console.error("Error viewing document:", error);
      res.status(500).json({ 
        message: "Failed to view document", 
      });
    }
  });

  // Download document
  app.get("/api/documents/download/:id", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Get document details
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!document.filePath) {
        return res.status(404).json({ message: "No file path found for this document" });
      }

      // BUG-012: path.join(process.cwd(), filePath) let a stored '../package.json'
      // (or an absolute path) escape the uploads directory on view, download and
      // delete. resolveDocumentFilePath() tries exactly the same two candidates —
      // cwd-relative and uploads-relative, so legacy rows keep working — but
      // refuses anything that resolves outside uploads/.
      const absolutePath = resolveDocumentFilePath(document.filePath);
      if (!absolutePath) {
        console.error(`Document file not found or outside the uploads directory (document ${document.id}): ${document.filePath}`);
        return res.status(404).json({ message: "Document file not found on disk" });
      }

      // Set appropriate headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
      res.setHeader('Content-Type', document.contentType || 'application/octet-stream');

      // Serve the file
      res.sendFile(absolutePath, (err) => {
        if (err) {
          console.error("Error serving document file:", err);
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to serve document file" });
          }
        }
      });
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ 
        message: "Failed to download document", 
      });
    }
  });

  // Email a single document using the configured SMTP settings
  app.post("/api/documents/:id/email", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const { recipients, subject, message } = req.body;
      
      if (!recipients || !subject) {
        return res.status(400).json({ message: "Recipients and subject are required" });
      }

      // Get document details
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Check if document type is allowed for email (damage or contract only)
      const allowedTypes = ['damage', 'contract'];
      const isAllowed = allowedTypes.some(type => 
        document.documentType.toLowerCase().includes(type)
      );
      
      if (!isAllowed) {
        return res.status(403).json({ 
          message: "This document type cannot be emailed. Only damage and contract documents are allowed." 
        });
      }

      if (!document.filePath) {
        return res.status(404).json({ message: "No file path found for this document" });
      }

      // FIX-B/BUG-012: the stored path resolves through the one owner, which
      // copes with both the uploads-relative and the legacy cwd-relative shape
      // and refuses anything that leaves the uploads root.
      const absolutePath = resolveDocumentFilePath(document.filePath);
      if (!absolutePath) {
        return res.status(404).json({ message: "Document file not found on disk" });
      }

      // Read file data for attachment
      const fileData = fs.readFileSync(absolutePath);

      // Parse recipients (comma-separated)
      const recipientList = recipients.split(',').map((email: string) => email.trim()).filter((email: string) => email);

      if (recipientList.length === 0) {
        return res.status(400).json({ message: "At least one valid recipient email is required" });
      }

      // Use the configured email service (respects the admin's SMTP settings)
      const emailSent = await sendEmail({
        to: recipientList.join(', '),
        subject: subject,
        text: message || "Please find the attached document.",
        html: `<p>${(message || "Please find the attached document.").replace(/\n/g, '<br>')}</p>`,
        attachments: [{
          filename: document.fileName,
          content: fileData,
        }],
      }, 'documents');

      if (!emailSent) {
        return res.status(500).json({
          message: "Failed to send email. Please check your email configuration in Settings."
        });
      }

      res.json({
        message: "Email sent successfully",
        recipients: recipientList.length,
        document: document.fileName
      });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ 
        message: "Failed to send email", 
      });
    }
  });

  // Email multiple documents - uses configured email service from settings
  app.post("/api/email/send-documents", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req: Request, res: Response) => {
    try {
      const { documentIds, recipientEmail, subject, message } = req.body;
      
      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "Document IDs array is required" });
      }
      
      if (!recipientEmail || !subject) {
        return res.status(400).json({ message: "Recipient email and subject are required" });
      }

      // Get all documents
      const documents = await Promise.all(
        documentIds.map((id: number) => storage.getDocument(id))
      );

      // Filter out null documents
      const validDocuments = documents.filter(doc => doc !== null);
      
      if (validDocuments.length === 0) {
        return res.status(404).json({ message: "No valid documents found" });
      }

      // Check if all documents are allowed types (damage or contract only)
      const allowedTypes = ['damage', 'contract'];
      const invalidDocs = validDocuments.filter(doc => {
        if (!doc) return false;
        return !allowedTypes.some(type => 
          doc.documentType.toLowerCase().includes(type)
        );
      });
      
      if (invalidDocs.length > 0) {
        return res.status(403).json({ 
          message: "Some documents cannot be emailed. Only damage and contract documents are allowed." 
        });
      }

      // Prepare attachments for all documents
      const attachments: { filename: string; content: Buffer; encoding?: string }[] = [];
      
      for (const document of validDocuments) {
        if (!document || !document.filePath) continue;
        
        // FIX-B/BUG-012: resolve through the one owner (see above).
        const absolutePath = resolveDocumentFilePath(document.filePath);
        if (!absolutePath) {
          console.warn(`Document file not found or outside uploads: ${document.filePath}`);
          continue;
        }

        // Read file data for attachment
        const fileData = fs.readFileSync(absolutePath);
        
        attachments.push({
          filename: document.fileName,
          content: fileData,
          encoding: 'base64'
        });
      }

      if (attachments.length === 0) {
        return res.status(404).json({ message: "No valid document files found" });
      }

      // Use the existing email service which gets sender address from database settings
      const emailSent = await sendEmail({
        to: recipientEmail,
        subject: subject,
        text: message || "Please find the attached documents.",
        html: `<p>${(message || "Please find the attached documents.").replace(/\n/g, '<br>')}</p>`,
        attachments: attachments
      }, 'documents');

      if (!emailSent) {
        return res.status(500).json({ 
          message: "Failed to send email. Please check your email configuration in Settings." 
        });
      }

      res.json({ 
        message: "Email sent successfully",
        recipient: recipientEmail,
        documentsAttached: attachments.length
      });
    } catch (error) {
      console.error("Error sending email with multiple documents:", error);
      res.status(500).json({ 
        message: "Failed to send email", 
      });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      // Get document to check if file exists
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // BUG-012: never unlink a path that resolves outside the uploads directory —
      // a stored '../package.json' used to be an arbitrary file delete.
      if (document.filePath) {
        const absolutePath = resolveDocumentFilePath(document.filePath);
        if (absolutePath) {
          fs.unlinkSync(absolutePath);
          console.log(`File deleted successfully: ${absolutePath}`);
        } else {
          console.warn(`Refused to delete a file outside the uploads directory (document ${document.id}): ${document.filePath}`);
        }
      }

      // Delete the document record
      const success = await storage.deleteDocument(id);
      if (!success) {
        return res.status(500).json({ message: "Failed to delete document record" });
      }

      // Broadcast real-time update to all connected clients
      realtimeEvents.documents.deleted({ id });

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ 
        message: "Failed to delete document", 
      });
    }
  });

  /**
   * B-05: the deliberate "opnieuw genereren" action. A document that no longer
   * matches its reservation is marked "verouderd" and kept; this is how the
   * employee asks for a fresh version. The old row stays in the dossier, the
   * new one gets the next version number.
   */
  app.post("/api/documents/:id/regenerate", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }
      const result = await regenerateDocument(id, req.user ? req.user.username : null);
      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }
      realtimeEvents.documents.created(result.document);
      res.status(201).json(annotateDocumentFileState(result.document));
    } catch (error) {
      sendRouteError(res, error, "Failed to regenerate document");
    }
  });

  // ==================== CONTRACT GENERATION ====================
  // Generate rental contract PDF
  app.get("/api/contracts/generate/:reservationId", requireAuth, async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.reservationId);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Load related vehicle and customer details
      if (reservation.vehicleId) {
        reservation.vehicle = await storage.getVehicle(reservation.vehicleId);
      }
      
      if (reservation.customerId) {
        reservation.customer = await storage.getCustomer(reservation.customerId);
      }

      // BUG-119: refuse the things that are not a rental before rendering.
      const refusal = contractGenerationRefusal(reservation as any);
      if (refusal) {
        return res.status(400).json({ message: refusal });
      }

      const rawTemplateId = req.query.templateId;
      let templateId: number | undefined;
      if (rawTemplateId !== undefined) {
        const parsed = parseInt(String(rawTemplateId), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ message: "Invalid template ID" });
        }
        templateId = parsed;
      }

      // FIX-N/FIX-P: one picker for every contract endpoint. An unknown id is a
      // 404 (BUG-156) and a field-less template is a 409 instead of a blank
      // contract nobody notices (BUG-028).
      const selection = await selectContractTemplate(templateId);
      if (!selection.ok) {
        return res.status(selection.status).json({ message: selection.message });
      }

      const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
      const pdfBuffer = await generateRentalContractFromTemplate(reservation, selection.template);

      // FIX-O: one helper owns the folder, the unique filename, the version
      // column and the row — and is allowed to fail loudly. This block used to
      // write the file, swallow every registration error and return 200.
      const document = await registerGeneratedDocument({
        documentType: DOCUMENT_TYPE_CONTRACT_UNSIGNED,
        bytes: pdfBuffer,
        vehicleId: reservation.vehicleId ?? null,
        vehiclePlate: reservation.vehicle?.licensePlate ?? null,
        reservationId,
        createdBy: req.user ? req.user.username : 'System',
        notes: `Unsigned contract for reservation #${reservationId}`,
      });
      realtimeEvents.documents.created(document);

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=rental_contract_${reservationId}.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF buffer
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating contract:", error);
      res.status(500).json({ 
        message: "Failed to generate contract", 
      });
    }
  });
  
  // Generate contract preview with form data (returns preview token)
  app.post("/api/contracts/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const { vehicleId, customerId, startDate, endDate, notes } = req.body;
      const templateId = req.query.templateId ? parseInt(req.query.templateId as string) : undefined;
      
      if (!vehicleId || !customerId) {
        return res.status(400).json({ message: "Vehicle ID and Customer ID are required" });
      }

      // Get vehicle and customer data
      const vehicle = await storage.getVehicle(vehicleId);
      const customer = await storage.getCustomer(customerId);
      
      if (!vehicle || !customer) {
        return res.status(404).json({ message: "Vehicle or customer not found" });
      }

      // Get the specified template or default PDF template
      let template;
      if (templateId) {
        template = await storage.getPdfTemplate(templateId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }
      } else {
        template = await storage.getDefaultPdfTemplate();
      }
      
      if (!template) {
        return res.status(404).json({ message: "PDF template not found" });
      }

      // Create preview contract data with PENDING placeholder
      const previewData = {
        id: 0, // Preview - no actual reservation ID
        vehicleId,
        customerId,
        startDate,
        endDate,
        notes: notes || "",
        status: "pending",
        totalPrice: 0,
        vehicle,
        customer
      };

      console.log("Generating contract preview with PENDING placeholder");

      // Make sure the template fields are properly formatted
      if (template.fields && typeof template.fields === 'string') {
        try {
          const parsedFields = JSON.parse(template.fields);
          template.fields = parsedFields;
        } catch (e) {
          console.error('Error parsing template fields:', e);
        }
      }

      // Use the imported function from pdf-generator.ts
      const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
      const pdfBuffer = await generateRentalContractFromTemplate(previewData as unknown as Reservation, template);
      
      // Store preview with token
      const { previewTokenService } = await import('./preview-token-service');
      const token = previewTokenService.store({
        vehicleId: parseInt(vehicleId),
        customerId: parseInt(customerId),
        startDate,
        endDate,
        notes,
        templateId: template.id,
        pdfBuffer,
        userId: req.user!.id.toString(),
      });

      console.log(`✅ Preview generated and stored with token: ${token}`);
      
      // Return token and download URL
      res.json({
        token,
        downloadUrl: `/api/contracts/preview/${token}`
      });
    } catch (error) {
      console.error("Error generating contract preview:", error);
      res.status(500).json({ 
        message: "Failed to generate contract preview", 
      });
    }
  });

  // Get contract preview by token
  app.get("/api/contracts/preview/:token", requireAuth, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { previewTokenService } = await import('./preview-token-service');
      
      const preview = previewTokenService.get(token, req.user!.id.toString());
      
      if (!preview) {
        return res.status(404).json({ message: "Preview not found or expired" });
      }

      console.log(`📄 Serving preview PDF for token: ${token}`);
      
      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="contract_preview.pdf"');
      res.setHeader('Content-Length', preview.pdfBuffer.length);
      
      // Send the PDF buffer
      res.send(preview.pdfBuffer);
    } catch (error) {
      console.error("Error retrieving contract preview:", error);
      res.status(500).json({ 
        message: "Failed to retrieve contract preview", 
      });
    }
  });

  // Generate versioned contract with form data (for edit mode)
  app.post("/api/contracts/generate-versioned/:reservationId", requireAuth, async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.reservationId);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const { vehicleId, customerId, driverId, startDate, endDate, notes } = req.body;

      // BUG-182: this endpoint took a reservation id in the path and then
      // ignored it completely — it rendered whatever vehicle and customer the
      // body named and filed the result under that reservation. A contract for
      // reservation #12 could carry reservation #99's customer. The
      // reservation must exist, and the vehicle/customer in the body must be
      // the ones it actually has.
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      if (!vehicleId || !customerId) {
        return res.status(400).json({ message: "Vehicle ID and Customer ID are required" });
      }
      const bodyVehicleId = parseInt(String(vehicleId), 10);
      const bodyCustomerId = parseInt(String(customerId), 10);
      if (!Number.isInteger(bodyVehicleId) || !Number.isInteger(bodyCustomerId)) {
        return res.status(400).json({ message: "Vehicle ID and Customer ID must be numbers" });
      }
      if (reservation.vehicleId !== bodyVehicleId || reservation.customerId !== bodyCustomerId) {
        return res.status(400).json({
          message: "The vehicle and customer must match the reservation this contract is filed under.",
        });
      }

      const vehicle = await storage.getVehicle(bodyVehicleId);
      const customer = await storage.getCustomer(bodyCustomerId);
      if (!vehicle || !customer) {
        return res.status(404).json({ message: "Vehicle or customer not found" });
      }
      reservation.vehicle = vehicle;
      reservation.customer = customer;

      // BUG-119: the same refusal as every other contract endpoint.
      const versionedRefusal = contractGenerationRefusal(reservation as any);
      if (versionedRefusal) {
        return res.status(400).json({ message: versionedRefusal });
      }

      const rawVersionedTemplateId = req.query.templateId;
      let versionedTemplateId: number | undefined;
      if (rawVersionedTemplateId !== undefined) {
        const parsed = parseInt(String(rawVersionedTemplateId), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ message: "Invalid template ID" });
        }
        versionedTemplateId = parsed;
      }
      const versionedSelection = await selectContractTemplate(versionedTemplateId);
      if (!versionedSelection.ok) {
        return res.status(versionedSelection.status).json({ message: versionedSelection.message });
      }

      // Get driver data if provided
      let driver = null;
      if (driverId) {
        driver = await storage.getDriver(driverId);
      }

      // The reservation, with the form's in-flight values layered on top.
      const contractData = {
        ...reservation,
        vehicleId: bodyVehicleId,
        customerId: bodyCustomerId,
        driverId,
        startDate: startDate || reservation.startDate,
        endDate: endDate === undefined ? reservation.endDate : endDate,
        notes: notes ?? reservation.notes ?? "",
        vehicle,
        customer,
        driver,
      };

      const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
      const pdfBuffer = await generateRentalContractFromTemplate(
        contractData as unknown as Reservation,
        versionedSelection.template,
      );

      const versionedDocument = await registerGeneratedDocument({
        documentType: DOCUMENT_TYPE_CONTRACT_UNSIGNED,
        bytes: pdfBuffer,
        vehicleId: bodyVehicleId,
        vehiclePlate: vehicle.licensePlate,
        reservationId,
        createdBy: req.user ? req.user.username : 'System',
        notes: `Unsigned contract generated from the reservation form for reservation #${reservationId}`,
      });
      realtimeEvents.documents.created(versionedDocument);

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=rental_contract_${reservationId}_v${Date.now()}.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF buffer
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating versioned contract:", error);
      res.status(500).json({ 
        message: "Failed to generate versioned contract", 
      });
    }
  });
  
  // Generate contract using default template
  app.get("/api/contracts/generate-default/:reservationId", requireAuth, async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.reservationId);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Load related vehicle and customer details
      if (reservation.vehicleId) {
        reservation.vehicle = await storage.getVehicle(reservation.vehicleId);
      }
      
      if (reservation.customerId) {
        reservation.customer = await storage.getCustomer(reservation.customerId);
      }

      // BUG-119: refuse a maintenance block / placeholder / customer-less row.
      const defaultRefusal = contractGenerationRefusal(reservation as any);
      if (defaultRefusal) {
        return res.status(400).json({ message: defaultRefusal });
      }

      const defaultSelection = await selectContractTemplate();
      if (!defaultSelection.ok) {
        return res.status(defaultSelection.status).json({ message: defaultSelection.message });
      }

      const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
      const pdfBuffer = await generateRentalContractFromTemplate(reservation, defaultSelection.template);

      // BUG-165: this used to pass `uploadDate: new Date().toISOString()` — a
      // string into a timestamp column — so the insert threw on EVERY call,
      // the catch swallowed it, and the contract was never registered.
      const savedDocument = await registerGeneratedDocument({
        documentType: DOCUMENT_TYPE_CONTRACT_UNSIGNED,
        bytes: pdfBuffer,
        vehicleId: reservation.vehicleId ?? null,
        vehiclePlate: reservation.vehicle?.licensePlate ?? null,
        reservationId,
        createdBy: req.user?.username || 'system',
        notes: 'Auto-generated unsigned contract',
      });
      realtimeEvents.documents.created(savedDocument);

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=contract_${reservationId}_unsigned.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF buffer
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating contract with default template:", error);
      res.status(500).json({ 
        message: "Failed to generate contract", 
      });
    }
  });
  
  // Get contract data as JSON (for display in browser)
  app.get("/api/contracts/data/:reservationId", requireAuth, async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.reservationId);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Load the related vehicle and customer details
      if (reservation.vehicleId) {
        reservation.vehicle = await storage.getVehicle(reservation.vehicleId);
      }
      
      if (reservation.customerId) {
        reservation.customer = await storage.getCustomer(reservation.customerId);
      }

      // Use the same data preparation as the PDF generator
      const contractData = prepareContractData(reservation);
      
      // Return the contract data as JSON
      res.json(contractData);
    } catch (error) {
      console.error("Error generating contract data:", error);
      res.status(500).json({ 
        message: "Failed to generate contract data", 
      });
    }
  });

  // ==================== DAMAGE CHECK GENERATION ====================
  // Generate damage check PDF for a reservation
  app.get("/api/damage-checks/generate/:reservationId", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.reservationId);
      if (isNaN(reservationId)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Load related data
      if (reservation.vehicleId) {
        reservation.vehicle = await storage.getVehicle(reservation.vehicleId);
      }
      
      if (reservation.customerId) {
        reservation.customer = await storage.getCustomer(reservation.customerId);
      }

      // Load driver if assigned
      let driver = null;
      if (reservation.driverId) {
        driver = await storage.getDriver(reservation.driverId);
      }

      if (!reservation.vehicle) {
        return res.status(400).json({ message: "Vehicle not found for reservation" });
      }

      // Get damage check template for the vehicle
      const vehicle = reservation.vehicle;
      const templates = await storage.getDamageCheckTemplatesByVehicle(
        vehicle.brand,
        vehicle.model,
        vehicle.vehicleType ?? undefined
      );
      
      let damageTemplate = templates.length > 0 ? templates[0] : null;
      
      if (!damageTemplate) {
        damageTemplate = (await storage.getDefaultDamageCheckTemplate()) ?? null;
      }
      
      if (!damageTemplate) {
        return res.status(404).json({ 
          message: "No damage check template found. Please create a default template first." 
        });
      }

      // Prepare vehicle data
      const vehicleData = {
        brand: vehicle.brand,
        model: vehicle.model,
        licensePlate: vehicle.licensePlate,
        buildYear: vehicle.productionDate ?? undefined,
        fuel: vehicle.fuel || undefined,
        mileage: vehicle.currentMileage || undefined,
      };

      // BUG-166: one builder, and it reads the `name` column the app actually
      // fills instead of the two nullable ones it does not — this is where
      // "null null" was printed on the customer's copy.
      const reservationData = reservation.customer
        ? buildDamageCheckReservationData(reservation as any, reservation.customer as any)
        : undefined;

      // Pick up the latest interactive damage check for this reservation so
      // all ticked checkboxes and recorded answers carry through to the PDF.
      let latestInteractiveCheck: any = undefined;
      try {
        const checks = await storage.getInteractiveDamageChecksByReservation(reservationId);
        if (checks && checks.length > 0) {
          latestInteractiveCheck = checks[0]; // storage returns desc(checkDate), so [0] is newest
        }
      } catch (e) {
        console.warn('[damage-check-generate] Could not load interactive check:', (e as Error).message);
      }

      // Generate damage check PDF
      const { generateDamageCheckPDFWithTemplate } = await import('./pdf-damage-check-generator');
      const pdfBuffer = await generateDamageCheckPDFWithTemplate(
        vehicleData,
        damageTemplate,
        reservationData,
        latestInteractiveCheck,
      );

      // BUG-165: this used to pass `uploadDate` as a string into a timestamp
      // column, so the row insert threw on every single call and the damage
      // check never appeared in the dossier. FIX-O owns the write now.
      const savedDamageCheck = await registerGeneratedDocument({
        documentType: DOCUMENT_TYPE_DAMAGE_CHECK_UNSIGNED,
        bytes: pdfBuffer,
        vehicleId: reservation.vehicleId ?? null,
        vehiclePlate: reservation.vehicle?.licensePlate ?? null,
        reservationId,
        createdBy: req.user?.username || 'system',
        notes: 'Auto-generated unsigned damage check',
      });
      realtimeEvents.documents.created(savedDamageCheck);

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=damage_check_${reservationId}_unsigned.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF buffer
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating damage check:", error);
      res.status(500).json({ 
        message: "Failed to generate damage check", 
      });
    }
  });
  registerPdfTemplateRoutes(app, routeDeps);
  registerCustomNotificationRoutes(app);
  registerBackupRoutes(app, routeDeps);
  registerSettingsRoutes(app, routeDeps);


  // ==================== DRIVER MANAGEMENT ====================
  
  // Configure multer for driver license uploads
  const driverLicenseStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const driversDir = path.join(uploadsDir, 'drivers');
      if (!fs.existsSync(driversDir)) {
        fs.mkdirSync(driversDir, { recursive: true });
      }
      cb(null, driversDir);
    },
    filename: (req, file, cb) => {
      const sanitizedOriginal = sanitizeFilename(file.originalname);
      const ext = path.extname(sanitizedOriginal);
      const timestamp = Date.now();
      const rawCustomerId = req.params.customerId || 'unknown';
      const customerId = rawCustomerId.replace(/[^a-zA-Z0-9]/g, '');
      cb(null, `license_customer${customerId}_${timestamp}${ext}`);
    }
  });
  
  // Configure multer for driver license uploads with enhanced security
  const driverLicenseUpload = sanitizeUploadedFields(multer({
    storage: driverLicenseStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: createSecureMulterFilter('document'),
  }));
  
  // Get all drivers for a specific customer
  app.get("/api/customers/:customerId/drivers", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      const customerId = parseInt(req.params.customerId);
      if (isNaN(customerId)) {
        return res.status(400).json({ error: "Invalid customer ID" });
      }
      const drivers = await storage.getDriversByCustomer(customerId);
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.status(500).json({ error: "Failed to fetch drivers" });
    }
  });

  // Get active drivers for a specific customer
  app.get("/api/customers/:customerId/drivers/active", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      const customerId = parseInt(req.params.customerId);
      if (isNaN(customerId)) {
        return res.status(400).json({ error: "Invalid customer ID" });
      }
      const drivers = await storage.getActiveDriversByCustomer(customerId);
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching active drivers:", error);
      res.status(500).json({ error: "Failed to fetch active drivers" });
    }
  });

  // Get a specific driver
  app.get("/api/drivers/:id", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid driver ID" });
      }
      const driver = await storage.getDriver(id);
      if (!driver) {
        return res.status(404).json({ error: "Driver not found" });
      }
      res.json(driver);
    } catch (error) {
      console.error("Error fetching driver:", error);
      res.status(500).json({ error: "Failed to fetch driver" });
    }
  });

  // Create a new driver
  app.post("/api/customers/:customerId/drivers", hasPermission(UserPermission.MANAGE_CUSTOMERS), driverLicenseUpload.single('licenseFile'), async (req, res) => {
    try {
      const customerId = parseInt(req.params.customerId);
      if (isNaN(customerId)) {
        return res.status(400).json({ error: "Invalid customer ID" });
      }

      // Post-upload validation if license file was uploaded
      if (req.file) {
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'document'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ error: fileValidation.error });
        }
      }

      // Handle JSON data that comes through multer middleware
      let bodyData = req.body;
      if (req.body.body && typeof req.body.body === 'string') {
        try {
          bodyData = JSON.parse(req.body.body);
        } catch (e) {
          console.error('Failed to parse JSON body:', e);
          return res.status(400).json({ message: "Invalid JSON in request body" });
        }
      }

      // Remove licenseFilePath from body data to prevent path traversal
      const { licenseFilePath, ...safeBodyData } = bodyData;
      
      const validation = insertDriverSchema.omit({ licenseFilePath: true }).safeParse({ ...safeBodyData, customerId });
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid driver data", details: validation.error.issues });
      }

      const username = req.user?.username || 'Unknown';
      const userId = req.user?.id || null;
      
      const driverData = {
        ...validation.data,
        customerId,
        // Only set licenseFilePath from multer upload, never from user input
        ...(req.file ? { licenseFilePath: getRelativePath(req.file.path) } : {}),
        createdBy: username,
        updatedBy: username,
        createdByUser: userId,
        updatedByUser: userId
      };

      const driver = await storage.createDriver(driverData);
      res.status(201).json(driver);
    } catch (error) {
      console.error("Error creating driver:", error);
      res.status(500).json({ error: "Failed to create driver" });
    }
  });

  // Update a driver
  app.patch("/api/drivers/:id", hasPermission(UserPermission.MANAGE_CUSTOMERS), driverLicenseUpload.single('licenseFile'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid driver ID" });
      }

      // Post-upload validation if license file was uploaded
      if (req.file) {
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'document'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ error: fileValidation.error });
        }
      }

      // Handle JSON data that comes through multer middleware
      let bodyData = req.body;
      if (req.body.body && typeof req.body.body === 'string') {
        try {
          bodyData = JSON.parse(req.body.body);
        } catch (e) {
          console.error('Failed to parse JSON body:', e);
          return res.status(400).json({ message: "Invalid JSON in request body" });
        }
      }

      // Remove licenseFilePath from body data to prevent path traversal
      const { licenseFilePath, ...safeBodyData } = bodyData;
      
      const validation = insertDriverSchema.omit({ licenseFilePath: true }).partial().safeParse(safeBodyData);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid driver data", details: validation.error.issues });
      }

      const username = req.user?.username || 'Unknown';
      const userId = req.user?.id || null;
      
      const updateData = {
        ...validation.data,
        // Only set licenseFilePath from multer upload, never from user input
        ...(req.file ? { licenseFilePath: getRelativePath(req.file.path) } : {}),
        updatedBy: username,
        updatedByUser: userId
      };

      const driver = await storage.updateDriver(id, updateData);
      if (!driver) {
        return res.status(404).json({ error: "Driver not found" });
      }
      res.json(driver);
    } catch (error) {
      console.error("Error updating driver:", error);
      res.status(500).json({ error: "Failed to update driver" });
    }
  });

  // Serve driver license file
  app.get("/api/drivers/:id/license", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid driver ID" });
      }

      const driver = await storage.getDriver(id);
      if (!driver || !driver.licenseFilePath) {
        return res.status(404).json({ error: "License file not found" });
      }

      // BUG-169/FIX-B: this used to compare path.resolve(cwd, licenseFilePath)
      // against a hardcoded path.resolve(cwd, 'uploads'). With UPLOADS_DIR set —
      // the production and Coolify shape — the real file lives outside cwd/uploads,
      // so the containment check failed for EVERY legitimately uploaded licence and
      // the route answered 403. resolveDocumentFilePath() resolves both the
      // uploads-relative and the legacy cwd-relative shape, then enforces
      // containment (and symlink containment, BUG-098) against the configured
      // root — the same helper the portal counterpart already used, which is why
      // that one worked and this one did not.
      const requestedPath = resolveDocumentFilePath(driver.licenseFilePath);
      if (!requestedPath) {
        console.error('Refusing driver licence outside the uploads directory:', driver.licenseFilePath);
        return res.status(403).json({ error: "Access denied" });
      }

      res.sendFile(requestedPath);
    } catch (error) {
      console.error("Error serving license file:", error);
      res.status(500).json({ error: "Failed to serve license file" });
    }
  });

  // Get country usage statistics for smart dropdown
  app.get("/api/drivers/countries/usage", hasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      const stats = await storage.getDriverCountryUsageStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting country usage stats:", error);
      res.status(500).json({ error: "Failed to get country usage statistics" });
    }
  });

  // Delete a driver
  app.delete("/api/drivers/:id", hasPermission(UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid driver ID" });
      }
      const success = await storage.deleteDriver(id);
      if (!success) {
        return res.status(404).json({ error: "Driver not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting driver:", error);
      res.status(500).json({ error: "Failed to delete driver" });
    }
  });

  // Migration endpoint: Transfer driver license data from customers to drivers table
  app.post("/api/migrate/customer-drivers", requireAuth, hasPermission(UserPermission.MANAGE_CUSTOMERS), async (req, res) => {
    try {
      const username = req.user?.username || 'system';
      const userId = req.user?.id || null;

      const customers = await storage.getAllCustomers();
      const migratedDrivers = [];
      const skippedCustomers = [];

      for (const customer of customers) {
        if (!customer.driverLicenseNumber || customer.driverLicenseNumber.trim() === '') {
          continue;
        }

        const existingDrivers = await storage.getDriversByCustomer(customer.id);
        if (existingDrivers.length > 0) {
          skippedCustomers.push({
            customerId: customer.id,
            name: customer.name,
            reason: 'Already has drivers'
          });
          continue;
        }

        const driverData = {
          customerId: customer.id,
          displayName: customer.name,
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          email: customer.email || '',
          phone: customer.phone || '',
          driverLicenseNumber: customer.driverLicenseNumber,
          licenseExpiry: null,
          isPrimaryDriver: true,
          status: 'active' as const,
          notes: 'Migrated from customer record',
          preferredLanguage: customer.preferredLanguage || 'nl',
          createdBy: username,
          createdByUser: userId
        };

        const driver = await storage.createDriver(driverData);
        migratedDrivers.push({
          customerId: customer.id,
          customerName: customer.name,
          driverId: driver.id,
          driverName: driver.displayName
        });
      }

      res.json({
        success: true,
        migrated: migratedDrivers.length,
        skipped: skippedCustomers.length,
        details: {
          migratedDrivers,
          skippedCustomers
        }
      });
    } catch (error) {
      console.error("Error migrating driver data:", error);
      res.status(500).json({ error: "Failed to migrate driver data" });
    }
  });
  registerAppSettingsRoutes(app, routeDeps);
  registerReportRoutes(app);
  registerDamageCheckTemplateRoutes(app, routeDeps);

  // Generate damage check PDF for a vehicle
  app.get("/api/vehicles/:id/damage-check-pdf", requireAuth, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.id);
      
      if (isNaN(vehicleId)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }
      
      const vehicle = await storage.getVehicle(vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // Find best matching template with strict prioritization:
      // 1. Exact match (make + model + type) - all three must match
      // 2. Make + model match (no type specified in template)
      // 3. Make + type match
      // 4. Type match only
      // 5. Default template
      let template: any = null;
      const allTemplates = await storage.getDamageCheckTemplatesByVehicle(
        vehicle.brand,
        vehicle.model,
        vehicle.vehicleType || undefined
      );
      
      if (allTemplates.length > 0) {
        // 1. Exact match: make + model + type all specified and match
        if (vehicle.vehicleType) {
          template = allTemplates.find(t => 
            t.vehicleMake === vehicle.brand && 
            t.vehicleModel === vehicle.model &&
            t.vehicleType === vehicle.vehicleType
          );
        }
        
        // 2. Make + model match (template has no type restriction)
        if (!template) {
          template = allTemplates.find(t => 
            t.vehicleMake === vehicle.brand && 
            t.vehicleModel === vehicle.model &&
            !t.vehicleType
          );
        }
        
        // 3. Make + type match (template has no model restriction)
        if (!template && vehicle.vehicleType) {
          template = allTemplates.find(t => 
            t.vehicleMake === vehicle.brand && 
            t.vehicleType === vehicle.vehicleType &&
            !t.vehicleModel
          );
        }
        
        // 4. Type match only (generic template for this vehicle type)
        if (!template && vehicle.vehicleType) {
          template = allTemplates.find(t => 
            t.vehicleType === vehicle.vehicleType &&
            !t.vehicleMake &&
            !t.vehicleModel
          );
        }
      }
      
      // 5. Fallback to default template if no specific match found
      if (!template) {
        template = await storage.getDefaultDamageCheckTemplate();
      }

      if (!template) {
        return res.status(404).json({ 
          message: "No damage check template found. Please create a default template first." 
        });
      }

      // Import PDF generator - use template-based generator
      const { generateDamageCheckPDFWithTemplate } = await import('./pdf-damage-check-generator');
      
      // BUG-183: this used to fall back to `reservations[0]` — an arbitrary,
      // often long-finished rental — so a blank damage check for a vehicle
      // printed a previous customer's name, contract number and dates. Only a
      // rental that is genuinely running today belongs on the form; when there
      // is none, the rental block stays empty and the crew fills it in by hand.
      let reservationData;
      try {
        const reservations = await storage.getReservationsByVehicle(vehicleId);
        const now = new Date();
        const runningToday = reservations.find(r => {
          if (r.type === 'maintenance_block') return false;
          if (r.status === 'cancelled' || r.status === 'completed') return false;
          const start = new Date(r.startDate);
          if (Number.isNaN(start.getTime()) || start > now) return false;
          if (!r.endDate) return true; // open-ended rental that has already started
          const end = new Date(r.endDate);
          return !Number.isNaN(end.getTime()) && end >= now;
        });

        if (runningToday) {
          const customer = runningToday.customerId
            ? await storage.getCustomer(runningToday.customerId)
            : null;
          reservationData = buildDamageCheckReservationData(runningToday as any, customer as any);
        }
      } catch (err) {
        console.warn("Could not fetch reservation data:", err);
      }
      
      const pdfBuffer = await generateDamageCheckPDFWithTemplate(
        {
          brand: vehicle.brand,
          model: vehicle.model,
          licensePlate: vehicle.licensePlate,
          buildYear: vehicle.productionDate ?? undefined,
          fuel: vehicle.fuel || undefined,
          mileage: vehicle.currentMileage || undefined,
        },
        template,
        reservationData
      );

      const filename = `damage-check-${vehicle.licensePlate.replace(/\s+/g, '')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating damage check PDF:", error);
      res.status(500).json({ 
        message: "Error generating damage check PDF", 
      });
    }
  });
  registerVehicleDiagramTemplateRoutes(app, routeDeps);

  // INTERACTIVE DAMAGE CHECK ROUTES
  
  // Get all interactive damage checks
  app.get("/api/interactive-damage-checks", requireAuth, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      // BUG-216 (technical half): the list is served without the base64
      // diagram and signature columns — 17 MB for 14 rows. The only screen
      // that reads this endpoint (the calendar's admin history) uses
      // reservationId, checkDate/createdAt and completedBy, and opens the PDF
      // route for the picture.
      const checks = await storage.getInteractiveDamageCheckSummaries();
      res.json(checks);
    } catch (error) {
      console.error("Error fetching interactive damage checks:", error);
      res.status(500).json({ message: "Error fetching interactive damage checks" });
    }
  });

  // Get interactive damage check by ID
  app.get("/api/interactive-damage-checks/:id", requireAuth, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const check = await storage.getInteractiveDamageCheck(id);
      
      if (!check) {
        return res.status(404).json({ message: "Damage check not found" });
      }
      
      res.json(check);
    } catch (error) {
      console.error("Error fetching interactive damage check:", error);
      res.status(500).json({ message: "Error fetching interactive damage check" });
    }
  });

  // Get interactive damage checks by vehicle
  app.get("/api/interactive-damage-checks/vehicle/:vehicleId", requireAuth, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.vehicleId);
      const checks = await storage.getInteractiveDamageChecksByVehicle(vehicleId);
      res.json(checks);
    } catch (error) {
      console.error("Error fetching damage checks by vehicle:", error);
      res.status(500).json({ message: "Error fetching damage checks by vehicle" });
    }
  });

  // Get interactive damage checks by reservation
  app.get("/api/interactive-damage-checks/reservation/:reservationId", requireAuth, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const reservationId = parseInt(req.params.reservationId);
      const checks = await storage.getInteractiveDamageChecksByReservation(reservationId);
      res.json(checks);
    } catch (error) {
      console.error("Error fetching damage checks by reservation:", error);
      res.status(500).json({ message: "Error fetching damage checks by reservation" });
    }
  });

  // Get recent damage checks by vehicle and customer
  app.get("/api/interactive-damage-checks/vehicle/:vehicleId/customer/:customerId", requireAuth, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.vehicleId);
      const customerId = parseInt(req.params.customerId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 3;
      const checks = await storage.getRecentDamageChecksByVehicleAndCustomer(vehicleId, customerId, limit);
      res.json(checks);
    } catch (error) {
      console.error("Error fetching damage checks by vehicle and customer:", error);
      res.status(500).json({ message: "Error fetching damage checks by vehicle and customer" });
    }
  });

  // Create interactive damage check
  app.post("/api/interactive-damage-checks", requireAuth, hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      // BUG-104: this used to be `{...req.body}` with no schema and no required-field
      // check at all, so `POST {}` reached the insert and came back as a 500.
      const checkBody = parseCreateBody(
        { ...req.body, checkDate: req.body?.checkDate ?? new Date().toISOString() },
        {
          table: interactiveDamageChecks,
          schema: insertInteractiveDamageCheckSchema,
          strip: ["completedBy"],
          message: "Invalid damage check data",
        },
      );
      const checkData = {
        ...checkBody,
        completedBy: user ? user.username : null,
      };
      
      // Check for duplicate damage check (same reservation + check type)
      if (checkData.reservationId && checkData.checkType) {
        const existingChecks = await storage.getInteractiveDamageChecksByReservation(checkData.reservationId);
        const duplicate = existingChecks.find(c => c.checkType === checkData.checkType);
        if (duplicate) {
          return res.status(409).json({ 
            message: `A ${checkData.checkType} damage check already exists for this reservation. Please edit the existing one instead.`,
            existingCheckId: duplicate.id
          });
        }
      }
      
      const created = await storage.createInteractiveDamageCheck(checkData, user?.username);
      
      // Sync fuel level and mileage to reservation
      if (created.reservationId) {
        const reservation = await storage.getReservation(created.reservationId);
        if (reservation) {
          const updateData: any = {};
          
          // Sync fuel level
          if (created.fuelLevel != null) {
            if (created.checkType === 'pickup') {
              updateData.fuelLevelPickup = created.fuelLevel;
            } else if (created.checkType === 'return') {
              updateData.fuelLevelReturn = created.fuelLevel;
            }
          }
          
          // Sync mileage (use != null to allow mileage of 0)
          if (created.mileage != null) {
            if (created.checkType === 'pickup') {
              updateData.pickupMileage = created.mileage;
            } else if (created.checkType === 'return') {
              updateData.returnMileage = created.mileage;
            }
          }
          
          if (Object.keys(updateData).length > 0) {
            await storage.updateReservation(created.reservationId, updateData);
          }
        }
      }
      
      // Sync mileage and fuel to vehicle
      if (created.vehicleId) {
        const vehicleUpdateData: any = {};
        
        if (created.mileage != null) {
          vehicleUpdateData.currentMileage = created.mileage;
          if (created.checkType === 'pickup') {
            vehicleUpdateData.departureMileage = created.mileage;
          } else if (created.checkType === 'return') {
            vehicleUpdateData.returnMileage = created.mileage;
          }
        }
        
        if (created.fuelLevel != null) {
          vehicleUpdateData.currentFuelLevel = created.fuelLevel;
        }
        
        if (Object.keys(vehicleUpdateData).length > 0) {
          await storage.updateVehicle(created.vehicleId, vehicleUpdateData);
        }
      }
      
      // Generate and save PDF as a document
      try {
        // Get vehicle data
        const vehicle = await storage.getVehicle(created.vehicleId);
        
        if (vehicle && created.reservationId) {
          // Find the appropriate damage check template
          const matchingTemplates = await storage.getDamageCheckTemplatesByVehicle(
            vehicle.brand,
            vehicle.model,
            vehicle.vehicleType || undefined
          );
          
          let damageTemplate = await pickBestDamageCheckTemplate(matchingTemplates, vehicle);
          
          if (damageTemplate) {
            // Get reservation data
            const reservation = await storage.getReservation(created.reservationId);
            let reservationData;
            if (reservation && reservation.customer) {
              reservationData = {
                contractNumber: `RES-${reservation.id}`,
                customerName: reservation.customer.name,
                startDate: format(new Date(reservation.startDate), 'dd-MM-yyyy'),
                endDate: reservation.endDate ? format(new Date(reservation.endDate), 'dd-MM-yyyy') : 'Open',
                rentalDays: reservation.endDate ? Math.ceil((new Date(reservation.endDate).getTime() - new Date(reservation.startDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
              };
            }
            
            // Generate PDF
            const { generateDamageCheckPDFWithTemplate } = await import('./pdf-damage-check-generator');
            const pdfBuffer = await generateDamageCheckPDFWithTemplate(
              {
                brand: vehicle.brand,
                model: vehicle.model,
                licensePlate: vehicle.licensePlate,
                buildYear: vehicle.productionDate ?? undefined,
                fuel: created.fuelLevel || vehicle.fuel || undefined,
                mileage: created.mileage || vehicle.currentMileage || undefined,
              },
              damageTemplate,
              reservationData,
              created
            );
            
            // Save PDF to uploads directory
            const filename = `damage_check_${created.vehicleId}_${created.checkType}_${format(new Date(created.checkDate), 'yyyy-MM-dd')}_v${created.id}.pdf`;
            const damageCheckDir = resolveUploadsPath(vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '-'), 'damage-checks');
            await fs.promises.mkdir(damageCheckDir, { recursive: true });
            const filepath = path.join(damageCheckDir, filename);
            await fs.promises.writeFile(filepath, pdfBuffer);
            
            // Create document entry
            const relativePath = getRelativePath(filepath);
            await storage.createDocument({
              vehicleId: created.vehicleId,
              reservationId: created.reservationId,
              documentType: `Damage Check (${created.checkType === 'pickup' ? 'Pickup' : 'Return'})`,
              fileName: filename,
              filePath: relativePath,
              contentType: 'application/pdf',
              fileSize: pdfBuffer.length,
              createdBy: user ? user.username : null,
            });

          }
        }
      } catch (pdfError) {
        console.error("Error generating damage check PDF document:", pdfError);
        // Don't fail the whole request if PDF generation fails
      }

      res.status(201).json(created);
    } catch (error) {
      sendRouteError(res, error, "Error creating interactive damage check");
    }
  });

  // Update interactive damage check
  app.put("/api/interactive-damage-checks/:id", requireAuth, hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;
      
      // Exclude timestamp fields from the request body to avoid date conversion issues
      const { createdAt, updatedAt, ...bodyData } = req.body;
      const checkData = {
        ...bodyData,
        checkDate: req.body.checkDate ? new Date(req.body.checkDate) : undefined,
      };
      const updated = await storage.updateInteractiveDamageCheck(id, checkData, user?.username);
      
      if (!updated) {
        return res.status(404).json({ message: "Damage check not found" });
      }
      
      // Sync fuel level and mileage to reservation
      if (updated.reservationId) {
        const reservation = await storage.getReservation(updated.reservationId);
        if (reservation) {
          const updateData: any = {};
          
          // Sync fuel level
          if (updated.fuelLevel != null) {
            if (updated.checkType === 'pickup') {
              updateData.fuelLevelPickup = updated.fuelLevel;
            } else if (updated.checkType === 'return') {
              updateData.fuelLevelReturn = updated.fuelLevel;
            }
          }
          
          // Sync mileage (use != null to allow mileage of 0)
          if (updated.mileage != null) {
            if (updated.checkType === 'pickup') {
              updateData.pickupMileage = updated.mileage;
            } else if (updated.checkType === 'return') {
              updateData.returnMileage = updated.mileage;
            }
          }
          
          if (Object.keys(updateData).length > 0) {
            await storage.updateReservation(updated.reservationId, updateData);
          }
        }
      }
      
      // Sync mileage and fuel to vehicle
      if (updated.vehicleId) {
        const vehicleUpdateData: any = {};
        
        if (updated.mileage != null) {
          vehicleUpdateData.currentMileage = updated.mileage;
          if (updated.checkType === 'pickup') {
            vehicleUpdateData.departureMileage = updated.mileage;
          } else if (updated.checkType === 'return') {
            vehicleUpdateData.returnMileage = updated.mileage;
          }
        }
        
        if (updated.fuelLevel != null) {
          vehicleUpdateData.currentFuelLevel = updated.fuelLevel;
        }
        
        if (Object.keys(vehicleUpdateData).length > 0) {
          await storage.updateVehicle(updated.vehicleId, vehicleUpdateData);
        }
      }
      
      // Regenerate PDF and mark old one as outdated
      try {
        // Get vehicle data
        const vehicle = await storage.getVehicle(updated.vehicleId);
        
        if (vehicle && updated.reservationId) {
          // Find existing PDF documents for this damage check
          const allDocs = await storage.getDocumentsByReservation(updated.reservationId);
          const existingPDFs = allDocs.filter(doc =>
            doc.documentType?.startsWith(`Damage Check (${updated.checkType === 'pickup' ? 'Pickup' : 'Return'})`) &&
            !doc.documentType?.includes('Edited') &&
            !doc.documentType?.includes('Previous') &&
            !doc.documentType?.includes('Old') &&
            doc.fileName.includes(`_v${updated.id}.pdf`)
          );

          // Mark old PDFs as "edited / previous version" — update both the
          // label AND the filename on disk so it's obvious in document lists
          // and in downloaded files which version was replaced by an edit.
          const editStamp = format(new Date(), 'yyyy-MM-dd_HHmmss');
          for (const oldDoc of existingPDFs) {
            const newLabel = `${oldDoc.documentType} - Edited (Previous Version ${editStamp})`;
            let newFileName = oldDoc.fileName;
            let newFilePath = oldDoc.filePath;
            try {
              const resolvedOld = resolveDocumentFilePath(oldDoc.filePath);
              if (resolvedOld && fs.existsSync(resolvedOld)) {
                const dir = path.dirname(resolvedOld);
                const ext = path.extname(oldDoc.fileName) || '.pdf';
                const base = oldDoc.fileName.replace(/\.[^.]+$/, '');
                newFileName = `${base}_edited_previous_${editStamp}${ext}`;
                const newAbsPath = path.join(dir, newFileName);
                fs.renameSync(resolvedOld, newAbsPath);
                newFilePath = getRelativePath(newAbsPath);
              }
            } catch (renameErr) {
              console.warn(
                `[damage-check-edit] Could not rename old PDF file for doc ${oldDoc.id}:`,
                renameErr,
              );
            }
            await storage.updateDocument(oldDoc.id, {
              documentType: newLabel,
              fileName: newFileName,
              filePath: newFilePath,
            });
          }
          
          // Find the appropriate damage check template
          const matchingTemplates = await storage.getDamageCheckTemplatesByVehicle(
            vehicle.brand,
            vehicle.model,
            vehicle.vehicleType || undefined
          );
          
          let damageTemplate = await pickBestDamageCheckTemplate(matchingTemplates, vehicle);
          
          if (damageTemplate) {
            // Get reservation data
            const reservation = await storage.getReservation(updated.reservationId);
            let reservationData;
            if (reservation && reservation.customer) {
              reservationData = {
                contractNumber: `RES-${reservation.id}`,
                customerName: reservation.customer.name,
                startDate: format(new Date(reservation.startDate), 'dd-MM-yyyy'),
                endDate: reservation.endDate ? format(new Date(reservation.endDate), 'dd-MM-yyyy') : 'Open',
                rentalDays: reservation.endDate ? Math.ceil((new Date(reservation.endDate).getTime() - new Date(reservation.startDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
              };
            }
            
            // Generate new PDF
            const { generateDamageCheckPDFWithTemplate } = await import('./pdf-damage-check-generator');
            const pdfBuffer = await generateDamageCheckPDFWithTemplate(
              {
                brand: vehicle.brand,
                model: vehicle.model,
                licensePlate: vehicle.licensePlate,
                buildYear: vehicle.productionDate || undefined,
                fuel: updated.fuelLevel || vehicle.fuel || undefined,
                mileage: updated.mileage || (vehicle as any).currentMileage || undefined,
              },
              damageTemplate,
              reservationData,
              updated
            );
            
            // Save new PDF with current timestamp in filename
            const timestamp = format(new Date(), 'yyyy-MM-dd_HHmmss');
            const filename = `damage_check_${updated.vehicleId}_${updated.checkType}_${timestamp}_v${updated.id}.pdf`;
            const damageCheckDir = resolveUploadsPath(vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '-'), 'damage-checks');
            await fs.promises.mkdir(damageCheckDir, { recursive: true });
            const filepath = path.join(damageCheckDir, filename);
            await fs.promises.writeFile(filepath, pdfBuffer);
            
            // Create new document entry
            const relativePath = getRelativePath(filepath);
            await storage.createDocument({
              vehicleId: updated.vehicleId,
              reservationId: updated.reservationId,
              documentType: `Damage Check (${updated.checkType === 'pickup' ? 'Pickup' : 'Return'})`,
              fileName: filename,
              filePath: relativePath,
              contentType: 'application/pdf',
              fileSize: pdfBuffer.length,
              createdBy: user ? user.username : null,
            });

          }
        }
      } catch (pdfError) {
        console.error("Error regenerating damage check PDF document:", pdfError);
        // Don't fail the whole request if PDF regeneration fails
      }

      // Also refresh any "Damage Check (Unsigned)" PDFs and unsigned contract
      // PDFs for the linked reservation so they reflect the new inspection data.
      if (updated.reservationId) {
        try {
          scheduleReservationPdfRegeneration(
            updated.reservationId,
            user ? user.username : null,
            { contract: true, damageCheck: true },
          );
        } catch (regenErr) {
          console.error(
            "[damage-check-regen] Error scheduling regen from interactive damage check update:",
            regenErr,
          );
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating interactive damage check:", error);
      res.status(500).json({ message: "Error updating interactive damage check" });
    }
  });

  // Generate PDF for interactive damage check
  app.get("/api/interactive-damage-checks/:id/pdf", requireAuth, hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const check = await storage.getInteractiveDamageCheck(id);
      
      if (!check) {
        return res.status(404).json({ message: "Damage check not found" });
      }
      
      // Get vehicle data
      const vehicle = await storage.getVehicle(check.vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Find the appropriate damage check template for this vehicle
      let damageTemplate;
      
      // Try to find a template matching the vehicle
      const matchingTemplates = await storage.getDamageCheckTemplatesByVehicle(
        vehicle.brand,
        vehicle.model,
        vehicle.vehicleType || undefined
      );
      
      damageTemplate = await pickBestDamageCheckTemplate(matchingTemplates, vehicle);
      
      if (!damageTemplate) {
        return res.status(404).json({ 
          message: "No damage check template found. Please create a default template first." 
        });
      }
      
      // Get reservation data if check is linked to a reservation
      let reservationData;
      if (check.reservationId) {
        try {
          const reservation = await storage.getReservation(check.reservationId);
          if (reservation && reservation.customer) {
            reservationData = {
              contractNumber: `RES-${reservation.id}`,
              customerName: reservation.customer.name,
              startDate: format(new Date(reservation.startDate), 'dd-MM-yyyy'),
              endDate: reservation.endDate ? format(new Date(reservation.endDate), 'dd-MM-yyyy') : '',
              rentalDays: reservation.endDate ? Math.ceil((new Date(reservation.endDate).getTime() - new Date(reservation.startDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
            };
          }
        } catch (err) {
          console.warn("Could not fetch reservation data:", err);
        }
      }
      
      // Import template-based PDF generator
      const { generateDamageCheckPDFWithTemplate } = await import('./pdf-damage-check-generator');
      
      // Generate PDF using custom template with vehicle data and interactive check data
      // Pull the logged-in employee's name so the "Controle door" (inspector)
      // field on the PDF auto-populates with whoever is generating the check.
      const inspectorName = (req.user as any)?.fullName || (req.user as any)?.username || '';

      const pdfBuffer = await generateDamageCheckPDFWithTemplate(
        {
          brand: vehicle.brand,
          model: vehicle.model,
          licensePlate: vehicle.licensePlate,
          buildYear: vehicle.productionDate ?? undefined,
          fuel: check.fuelLevel || vehicle.fuel || undefined,
          mileage: check.mileage || vehicle.currentMileage || undefined,
        },
        damageTemplate,
        reservationData,
        check, // Pass the interactive damage check data with diagram annotations
        inspectorName,
      );
      
      // Set response headers for PDF viewing in browser
      const filename = `damage_check_${check.vehicleId}_${check.checkType}_${format(new Date(check.checkDate), 'yyyy-MM-dd')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating damage check PDF:", error);
      res.status(500).json({ message: "Error generating damage check PDF" });
    }
  });

  // Delete interactive damage check
  app.delete("/api/interactive-damage-checks/:id", requireAuth, hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      // Capture metadata BEFORE deletion so we can also clean up any preserved
      // "Edited (Previous Version)" PDFs that belong to the same
      // reservation+checkType lineage. Storage.deleteInteractiveDamageCheck
      // only removes the currently-active PDF document.
      const existing = await storage.getInteractiveDamageCheck(id);

      const deleted = await storage.deleteInteractiveDamageCheck(id);

      if (!deleted) {
        return res.status(404).json({ message: "Damage check not found" });
      }

      if (
        existing &&
        existing.reservationId &&
        (existing.checkType === "pickup" || existing.checkType === "return")
      ) {
        await cleanupSupersededDamageCheckVersions(
          existing.reservationId,
          existing.checkType,
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting interactive damage check:", error);
      res.status(500).json({ message: "Error deleting interactive damage check" });
    }
  });

  // Serve object storage files (for template backgrounds)
  app.get('/object-storage/*', requireAuth, async (req, res) => {
    try {
      const objectPath = req.path.replace('/object-storage', '');
      console.log(`Serving object storage file: ${objectPath}`);
      
      const file = objectStorageService.getFile(objectPath);
      const [exists] = await file.exists();
      
      if (!exists) {
        return res.status(404).send('File not found in object storage');
      }
      
      await objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error('Error serving object storage file:', error);
      res.status(500).send('Error loading file from object storage');
    }
  });

  // ============================================
  // VEHICLE TRANSPORT ROUTES (swap / tow / repossession / delivery jobs)
  // ============================================

  app.get("/api/transports", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const transports = await storage.getAllTransports();
      res.json(transports);
    } catch (error) {
      console.error("Error fetching transports:", error);
      res.status(500).json({ message: "Failed to fetch transports" });
    }
  });

  app.get("/api/transports/:id", hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transport ID" });
      }
      const transport = await storage.getTransport(id);
      if (!transport) {
        return res.status(404).json({ message: "Transport not found" });
      }
      res.json(transport);
    } catch (error) {
      console.error("Error fetching transport:", error);
      res.status(500).json({ message: "Failed to fetch transport" });
    }
  });

  app.post("/api/transports", hasPermission(UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const transportData = insertVehicleTransportSchema.parse({
        ...req.body,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null,
      });
      // "One or the other" isn't enforced in the shared zod schema (it also backs
      // partial() for PATCH, where neither is normal) — enforce it here instead.
      if (transportData.isExternalVehicle) {
        if (!transportData.externalLicensePlate || transportData.externalLicensePlate.trim() === '') {
          return res.status(400).json({ message: "License plate is required for an external vehicle" });
        }
      } else if (transportData.vehicleId == null) {
        return res.status(400).json({ message: "Please select a vehicle" });
      }
      // BUG-148: there is a real FK on vehicle_id / related_vehicle_id, so a
      // non-existent id used to surface as a raw 23503 ("violates foreign key
      // constraint ...") in a 500. Check first and answer 404 naming the field.
      for (const [field, value] of [
        ["vehicleId", transportData.vehicleId],
        ["relatedVehicleId", transportData.relatedVehicleId],
      ] as const) {
        if (value == null) continue;
        const exists = await storage.getVehicle(value);
        if (!exists) {
          return res.status(404).json({ message: "Vehicle not found", field });
        }
      }
      if (transportData.customerId != null) {
        const customer = await storage.getCustomer(transportData.customerId);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found", field: "customerId" });
        }
      }

      // Spare/replacement-vehicle fields (spareRequired/relatedVehicleId/
      // isBreakdownOrMaintenance) are applied via the same atomic path PATCH uses
      // (reservation creation + maintenance status), rather than duplicating that
      // logic here — insert the row without them, then apply.
      // BUG-142: the insert happens inside applyTransportUpdate's transaction,
      // so a refused spare leaves no orphan transport row behind.
      const { relatedVehicleId, spareRequired, isBreakdownOrMaintenance, ...barebones } = transportData;
      const transport = await storage.applyTransportUpdate(0, {
        relatedVehicleId: relatedVehicleId ?? null,
        spareRequired: spareRequired ?? false,
        isBreakdownOrMaintenance: isBreakdownOrMaintenance ?? false,
      }, {
        create: {
          ...barebones,
          relatedVehicleId: null,
          spareRequired: false,
          isBreakdownOrMaintenance: false,
        },
      });
      res.status(201).json(transport);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Two messages this code raises itself, and therefore may repeat.
      if (message.includes("conflicting reservations")) {
        return res.status(409).json({ message });
      }
      if (message.includes("cannot be the same as")) {
        return res.status(400).json({ message });
      }
      sendRouteError(res, error, "Failed to create transport");
    }
  });

  app.patch("/api/transports/:id", hasPermission(UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transport ID" });
      }
      const user = req.user;
      const transportData = insertVehicleTransportSchema.partial().parse({
        ...req.body,
        updatedBy: user ? user.username : null,
      });
      const transport = await storage.applyTransportUpdate(id, transportData);
      res.json(transport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transport data", errors: error.errors });
      }
      // FIX-W (BUG-136, BUG-114, BUG-115): an unknown or illegal transport
      // status is a 400 naming the states, a spare that cannot follow the new
      // date a 409 naming the conflict — never a 500 and never a string match.
      if (error instanceof StateTransitionError) {
        return res.status(error.status).json(error.toBody());
      }
      if (error instanceof BookingConflictError) {
        return res.status(error.status).json(error.toBody());
      }
      if (error instanceof HttpError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      const message = error instanceof Error ? error.message : "Failed to update transport";
      if (message === "Transport not found") {
        return res.status(404).json({ message });
      }
      if (message.includes("conflicting reservations")) {
        return res.status(409).json({ message });
      }
      if (message.includes("cannot be the same as")) {
        return res.status(400).json({ message });
      }
      if (message.includes("already been")) {
        return res.status(400).json({ message });
      }
      console.error("Error updating transport:", error);
      res.status(500).json({ message: "Failed to update transport" });
    }
  });

  app.delete("/api/transports/:id", hasPermission(UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transport ID" });
      }
      // Release the spare reservation this transport was holding before deleting it
      // — but only while it's still 'booked' (whether that's an assigned vehicle or
      // still TBD/placeholder, and regardless of whether the original was a fleet or
      // external vehicle — none of that changes what should happen to the spare).
      // Once it's been picked up (or returned) it's a real handover on record; leave
      // that reservation alone, just no longer transport-linked.
      //
      // This soft-deletes it (same as DELETE /api/reservations/:id) rather than just
      // flipping status to 'cancelled' — a merely-cancelled row still has
      // deletedAt IS NULL, so it kept showing up in the Rental Calendar and "Beheer
      // vervangende voertuigen" TBD list forever after the transport itself was gone.
      const existing = await storage.getTransport(id);
      if (existing?.spareReservationId && existing.spareReservation?.status === 'booked') {
        const user = req.user;
        await storage.updateReservation(existing.spareReservationId, {
          deletedAt: new Date(),
          deletedBy: user ? user.username : null,
          deletedByUser: user ? user.id : null,
          updatedBy: user ? user.username : null,
          contractNumber: null,
        } as any);
        if (existing.spareReservation.placeholderSpare) {
          await storage.deleteNotificationsByTypeAndPattern("spare_assignment", `[placeholder:${existing.spareReservationId}]`);
        }
        realtimeEvents.reservations.deleted({ id: existing.spareReservationId });
      }
      // Same for the original vehicle's maintenance status — deleting the transport
      // outright (not completing/cancelling it first) shouldn't leave it stuck.
      // Skipped for external/outside vehicles, which never entered the fleet.
      if (existing?.isBreakdownOrMaintenance && !existing.isExternalVehicle && existing.vehicleId != null) {
        await storage.markVehicleForService(existing.vehicleId, 'ok');
      }
      // besluiten B-15 (BUG-140) — snapshotted into the recycle bin first, with
      // the spare reservation this route just closed.
      const success = await storage.deleteTransport(id, {
        username: req.user?.username ?? null,
        userId: req.user?.id ?? null,
      });
      if (!success) {
        return res.status(404).json({ message: "Transport not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting transport:", error);
      res.status(500).json({ message: "Failed to delete transport" });
    }
  });

  // Driving distance between two addresses, for filling in a transport's Distance
  // (km) field without the driver having to look it up themselves.
  app.post(
    "/api/delivery/estimate-distance",
    hasPermission(UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_RESERVATIONS),
    async (req: Request, res: Response) => {
      try {
        const { originAddress, originCity, originPostalCode, destinationAddress, destinationCity, destinationPostalCode } = req.body as {
          originAddress?: string; originCity?: string; originPostalCode?: string;
          destinationAddress?: string; destinationCity?: string; destinationPostalCode?: string;
        };

        const originQuery = [originAddress, originPostalCode, originCity].filter(Boolean).join(", ");
        const destinationQuery = [destinationAddress, destinationPostalCode, destinationCity].filter(Boolean).join(", ");

        if (!originQuery || !destinationQuery) {
          return res.status(400).json({ message: "Both an origin and destination address are required" });
        }

        // Sequential, not Promise.all — geocodeAddress throttles itself to Nominatim's
        // ~1 req/sec limit using shared module state, which only holds up under
        // sequential calls.
        const originCoords = await geocodeAddress(originQuery);
        const destinationCoords = await geocodeAddress(destinationQuery);

        if (!originCoords || !destinationCoords) {
          return res.status(422).json({ message: "Could not locate one or both addresses" });
        }

        // Prefer a real driving-route distance (matches what Google/Maps would show);
        // fall back to straight-line only if the routing service is unreachable.
        const roadRoute = await getRoadRouteDistances([originCoords, destinationCoords]);
        const distanceKm = roadRoute
          ? roadRoute.totalDistanceKm
          : Math.round(haversineDistanceKm(originCoords, destinationCoords) * 10) / 10;

        res.json({ distanceKm, isRoadDistance: !!roadRoute });
      } catch (error) {
        console.error("Error estimating distance:", error);
        res.status(500).json({ message: "Failed to estimate distance" });
      }
    }
  );

  // Optimize the visiting order for a day's deliveries/transports.
  // Geocodes each stop (and the configured depot address, if set) via Nominatim,
  // then greedily orders them by nearest-neighbor straight-line distance (fine for
  // picking an order — it doesn't need to be precise). The reported distances are
  // then upgraded to a real driving route via OSRM where possible, since straight-
  // line distance is never what a driver actually covers. The returned Google Maps
  // link hands off to real turn-by-turn navigation either way.
  app.post(
    "/api/delivery/optimize-route",
    hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS, UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES),
    async (req: Request, res: Response) => {
      try {
        const { stops } = req.body as {
          stops: Array<{ id: string; label: string; type: string; address?: string; city?: string; postalCode?: string }>;
        };

        if (!Array.isArray(stops) || stops.length === 0) {
          return res.status(400).json({ message: "No stops provided" });
        }
        if (stops.length > 25) {
          return res.status(400).json({ message: "Too many stops for a single route (max 25)" });
        }

        const settingsRecord = await storage.getSettings();
        const depotQuery = [settingsRecord?.depotAddress, settingsRecord?.depotPostalCode, settingsRecord?.depotCity]
          .filter(Boolean)
          .join(", ");

        const geocodedStops: Array<{ id: string; label: string; type: string; lat: number; lon: number }> = [];
        const failedStops: Array<{ id: string; label: string; type: string }> = [];

        for (const stop of stops) {
          const query = [stop.address, stop.postalCode, stop.city].filter(Boolean).join(", ");
          const coords = query ? await geocodeAddress(query) : null;
          if (coords) {
            geocodedStops.push({ id: stop.id, label: stop.label, type: stop.type, ...coords });
          } else {
            failedStops.push({ id: stop.id, label: stop.label, type: stop.type });
          }
        }

        if (geocodedStops.length === 0) {
          return res.json({ order: [], failedStops, totalDistanceKm: 0, mapsUrl: null, depotUsed: false, depotCoords: null, isRoadDistance: false });
        }

        let depotCoords = depotQuery.trim() ? await geocodeAddress(depotQuery) : null;
        const depotUsed = !!depotCoords;
        const start = depotCoords ?? { lat: geocodedStops[0].lat, lon: geocodedStops[0].lon };

        let order = nearestNeighborOrder(start, geocodedStops);
        let totalDistanceKm = Math.round(order.reduce((sum, s) => sum + s.distanceFromPreviousKm, 0) * 10) / 10;
        let isRoadDistance = false;

        const roadRoute = await getRoadRouteDistances([start, ...order.map((s) => ({ lat: s.lat, lon: s.lon }))]);
        if (roadRoute) {
          isRoadDistance = true;
          order = order.map((stop, i) => ({ ...stop, distanceFromPreviousKm: roadRoute.legDistancesKm[i] }));
          totalDistanceKm = roadRoute.totalDistanceKm;
        }

        const waypoints = order.map((s) => `${s.lat},${s.lon}`);
        const origin = depotUsed ? `${start.lat},${start.lon}` : waypoints[0];
        const destination = waypoints[waypoints.length - 1];
        const middleWaypoints = depotUsed ? waypoints.slice(0, -1) : waypoints.slice(1, -1);

        const mapsParams = new URLSearchParams({ api: "1", origin, destination, travelmode: "driving" });
        if (middleWaypoints.length > 0) {
          mapsParams.set("waypoints", middleWaypoints.join("|"));
        }
        const mapsUrl = `https://www.google.com/maps/dir/?${mapsParams.toString()}`;

        res.json({ order, failedStops, totalDistanceKm, mapsUrl, depotUsed, depotCoords: depotUsed ? start : null, isRoadDistance });
      } catch (error) {
        console.error("Error optimizing route:", error);
        res.status(500).json({ message: "Failed to optimize route" });
      }
    }
  );

  // ==================== TRANSPORT REPORT TEMPLATE ROUTES ====================
  // Same drag-position-fields model as /api/pdf-templates, kept as a fully
  // separate table/route set so it can't collide with or risk the live
  // contract template system. Backgrounds are images only (logo/letterhead),
  // not PDFs — keeps per-page embedding simple for multi-transport batches.

  app.get("/api/transport-report-templates", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllTransportReportTemplates();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.json(templates);
    } catch (error) {
      console.error("Error fetching transport report templates:", error);
      res.status(500).json({ message: "Failed to fetch transport report templates" });
    }
  });
  registerReportAndLabelTemplateRoutes(app, routeDeps);

  // Generate one PDF (one page per transport) and save it as a Document.
  // Single transport with a vehicle -> attached to that vehicle. Multiple
  // transports (or no vehicle) -> a general report, not tied to any vehicle.
  app.post("/api/delivery/transports/generate-report", hasPermission(UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const { transportIds, templateId } = req.body as { transportIds: number[]; templateId?: number };
      if (!Array.isArray(transportIds) || transportIds.length === 0) {
        return res.status(400).json({ message: "No transports specified" });
      }
      if (transportIds.length > 50) {
        return res.status(400).json({ message: "Too many transports for a single report (max 50)" });
      }

      const transports = [];
      for (const id of transportIds) {
        const transport = await storage.getTransport(id);
        if (transport) transports.push(transport);
      }
      if (transports.length === 0) {
        return res.status(404).json({ message: "None of the specified transports were found" });
      }

      // A transport that needs a replacement vehicle but still has it as TBD must not
      // be printed — the letter would be missing required information. Validated here
      // too, not just client-side, since this endpoint can be called independently.
      const tbdTransports = transports.filter(t => getTransportSpareStatus(t) === 'tbd');
      if (tbdTransports.length > 0) {
        return res.status(400).json({
          message: "A replacement vehicle is required for this transport but has not yet been selected. Please assign a replacement vehicle before generating or printing the transport letter.",
          transportIds: tbdTransports.map(t => t.id),
        });
      }

      // BUG-156: an unknown templateId used to leave `template` undefined and
      // the report was drawn with the default layout, so the operator got a
      // letter in a layout they had not chosen and no indication of it.
      let template;
      if (templateId !== undefined && templateId !== null) {
        const parsedTemplateId = parseInt(String(templateId), 10);
        if (!Number.isInteger(parsedTemplateId) || parsedTemplateId <= 0) {
          return res.status(400).json({ message: "Invalid template ID" });
        }
        template = await storage.getTransportReportTemplate(parsedTemplateId);
        if (!template) {
          return res.status(404).json({ message: "Transport report template not found" });
        }
      } else {
        template = await storage.getDefaultTransportReportTemplate();
      }

      const { generateTransportReportsPdf } = await import('./utils/pdf-generator');
      const pdfBuffer = await generateTransportReportsPdf(transports, template);

      const reportsDir = path.join(uploadsDir, 'reports');
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

      const sanitizeForFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, '_');
      const uniqueSuffix = Date.now().toString().slice(-5);
      const transportTypeLabels: Record<string, string> = {
        swap: 'Swap', tow: 'Tow', repossession: 'Repossession', delivery: 'Delivery', other: 'Other',
      };

      let fileName: string;
      let notes: string;
      if (transports.length === 1) {
        const t = transports[0];
        const dateStr = t.scheduledDate ? format(new Date(t.scheduledDate), 'dd-MM-yyyy') : format(new Date(), 'dd-MM-yyyy');
        const vehicleLabel = t.vehicle
          ? `${t.vehicle.brand}_${t.vehicle.model}`
          : t.isExternalVehicle
            ? `${t.externalBrand || 'External'}_${t.externalModel || t.externalLicensePlate || ''}`
            : `Vehicle_${t.vehicleId}`;
        fileName = `Transport_Report_${sanitizeForFilename(vehicleLabel)}_${dateStr}_${uniqueSuffix}.pdf`;
        const route = [t.originCity, t.destinationCity].filter(Boolean).join(' -> ');
        notes = `${transportTypeLabels[t.transportType] || t.transportType} scheduled ${dateStr}${route ? ` — ${route}` : ''}`;
      } else {
        const dateStr = format(new Date(), 'dd-MM-yyyy');
        fileName = `Transport_Reports_${transports.length}_vehicles_${dateStr}_${uniqueSuffix}.pdf`;
        const scheduledDates = Array.from(new Set(transports.map(t => t.scheduledDate).filter(Boolean)))
          .map(d => format(new Date(d as string), 'dd-MM-yyyy'));
        notes = `${transports.length} transports — ${scheduledDates.length === 1 ? `scheduled ${scheduledDates[0]}` : `scheduled ${scheduledDates[0]} to ${scheduledDates[scheduledDates.length - 1]}`}`;
      }

      const filePath = path.join(reportsDir, fileName);
      fs.writeFileSync(filePath, pdfBuffer);
      // BUG-029/FIX-B: this was the only document-creating route computing its
      // own path.relative(uploadsDir, …) while every other one used
      // getRelativePath(); the two only agreed while UPLOADS_DIR happened to be
      // cwd/uploads, so every report generated in production 404'd on download.
      const relativePath = getRelativePath(filePath);

      const user = req.user;
      const singleVehicleId = transports.length === 1 ? transports[0].vehicleId : null;

      const document = await storage.createDocument({
        vehicleId: singleVehicleId,
        documentType: 'transport_report',
        fileName,
        filePath: relativePath,
        fileSize: pdfBuffer.length,
        contentType: 'application/pdf',
        notes,
        createdBy: user ? user.username : null,
      } as any);

      res.status(201).json(document);
    } catch (error) {
      console.error("Error generating transport report:", error);
      res.status(500).json({ message: "Failed to generate transport report" });
    }
  });

  // Routes registered successfully
}