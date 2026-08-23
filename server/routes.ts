import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { format } from "date-fns";
import { storage } from "./storage";
import { ReportValidationError } from "./database-storage";
import { fetchVehicleInfoByLicensePlate, RDWNotFoundError, RDWTimeoutError, RDWUpstreamError } from "./utils/rdw-api";
import { generateRentalContract, generateRentalContractFromTemplate, prepareContractData } from "./utils/pdf-generator";
import { processInvoiceWithAI, generateInvoiceHash, validateParsedInvoice, type ParsedInvoice } from "./utils/invoice-scanner";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { 
  insertVehicleSchema, 
  insertCustomerSchema, 
  insertReservationSchema, 
  insertExpenseSchema, 
  insertDocumentSchema,
  insertUserSchema,
  insertPdfTemplateSchema,
  insertTemplateBackgroundSchema,
  insertTransportReportTemplateSchema,
  insertTransportReportTemplateBackgroundSchema,
  insertDriverSchema,
  insertDamageCheckTemplateSchema,
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
import multer from "multer";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import { BackupService } from "./backupService";
import { ObjectStorageService } from "./objectStorage";
import { realtimeEvents } from "./realtime-events";
import { hasPermission, requireAdmin } from "./middleware/permissions.js";
import { clearEmailConfigCache, sendEmail } from "./utils/email-service";
import { 
  getVehicleStatusContext, 
  validateManualStatusChange, 
  VehicleAvailabilityStatus 
} from "./vehicle-status-helper";
import { calculateDutchHolidays, mergeHolidaysWithOverrides } from "../shared/holidays";
import { geocodeAddress, haversineDistanceKm, nearestNeighborOrder, getRoadRouteDistances } from "./geocoding";
import { isDamageCheckDocument } from "../shared/document-types";
import { getUploadsDir } from "../shared/paths";
import { 
  createSecureMulterFilter, 
  validateAfterUpload,
  validateFileBuffer,
  isDangerousExtension,
  sanitizeFilename 
} from "./utils/security/fileUploadSecurity";

// Helper function to convert absolute paths to relative paths - works for any deployment
function getRelativePath(absolutePath: string): string {
  const uploadsDir = getUploadsDir();
  // Make path relative to uploads directory for portability
  return path.relative(process.cwd(), absolutePath);
}

// Fields on a reservation that, when changed, invalidate any previously
// generated "Contract (Unsigned)" PDFs (because they appear on the contract).
const CONTRACT_RELEVANT_FIELDS = [
  "contractNumber",
  "vehicleId",
  "customerId",
  "driverId",
  "startDate",
  "endDate",
  "totalPrice",
  "pickupMileage",
  "returnMileage",
  "fuelLevelPickup",
  "fuelLevelReturn",
  "fuelCardNumber",
  "actualPickupDate",
  "actualReturnDate",
  "deliveryRequired",
  "deliveryAddress",
  "deliveryCity",
  "deliveryPostalCode",
  "pickupLocation",
  "returnLocation",
  "notes",
] as const;

/**
 * Resolves a document.filePath (which may be stored as absolute, cwd-relative,
 * or uploads-dir-relative depending on which code path created it) to an
 * absolute path that exists on disk. Returns null if no resolution exists.
 * Refuses to resolve any path that escapes the uploads directory.
 */
function resolveDocumentFilePath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const uploadsDir = getUploadsDir();
  const candidates: string[] = [];
  if (path.isAbsolute(filePath)) {
    candidates.push(filePath);
  } else {
    candidates.push(path.join(process.cwd(), filePath));
    candidates.push(path.join(uploadsDir, filePath));
    // Some paths are stored with a leading "uploads/" — try stripping it too.
    if (filePath.startsWith("uploads/") || filePath.startsWith("uploads\\")) {
      candidates.push(path.join(uploadsDir, filePath.slice("uploads/".length)));
    }
  }
  const uploadsResolved = path.resolve(uploadsDir);
  for (const c of candidates) {
    try {
      const resolved = path.resolve(c);
      // Stay within uploads dir to avoid any traversal mishaps.
      if (!resolved.startsWith(uploadsResolved + path.sep) && resolved !== uploadsResolved) {
        continue;
      }
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      // ignore
    }
  }
  return null;
}

// Single-flight queue: ensures regeneration for a given reservation runs
// sequentially even when multiple edits arrive concurrently. Each new request
// chains onto the previous promise so we never have two regen jobs racing on
// the same reservation's documents.
const regenQueues = new Map<number, Promise<void>>();

export type ReservationPdfKinds = {
  contract?: boolean;
  damageCheck?: boolean;
};

/**
 * Schedule regeneration of unsigned PDFs (contract and/or pickup damage check)
 * for a reservation. Runs sequentially per reservation via single-flight queue.
 * Each kind is independent and silently no-ops if no existing unsigned doc of
 * that kind exists.
 */
function scheduleReservationPdfRegeneration(
  reservationId: number,
  username: string | null,
  kinds: ReservationPdfKinds = { contract: true, damageCheck: true },
): void {
  const previous = regenQueues.get(reservationId) || Promise.resolve();
  const next = previous
    .catch(() => undefined) // don't let a failed prior job poison the chain
    .then(async () => {
      if (kinds.contract) {
        await regenerateUnsignedContractsForReservation(reservationId, username);
      }
      if (kinds.damageCheck) {
        await regenerateUnsignedDamageChecksForReservation(reservationId, username);
      }
    });
  regenQueues.set(reservationId, next);
  // Clean up the map once this job (and any later chained ones) settle.
  next.finally(() => {
    if (regenQueues.get(reservationId) === next) {
      regenQueues.delete(reservationId);
    }
  });
}

// Backwards-compatible alias used in existing code paths.
function scheduleContractRegeneration(reservationId: number, username: string | null): void {
  scheduleReservationPdfRegeneration(reservationId, username, { contract: true, damageCheck: true });
}

/**
 * Regenerates the "Contract (Unsigned)" PDF documents for a reservation by
 * deleting the existing unsigned contract(s) (file + DB row) and creating one
 * new PDF using the default template. Signed contracts and other document
 * types are NEVER touched.
 *
 * Only runs if at least one unsigned contract already exists — we never
 * auto-create a contract that wasn't there before.
 *
 * Must be invoked through `scheduleContractRegeneration` to ensure per-
 * reservation serialization. Errors are logged and swallowed.
 */
async function regenerateUnsignedContractsForReservation(
  reservationId: number,
  username: string | null,
): Promise<void> {
  try {
    const reservation = await storage.getReservation(reservationId);
    if (!reservation || !reservation.vehicle) {
      return;
    }

    const allDocs = await storage.getDocumentsByReservation(reservationId);
    const unsignedContracts = allDocs.filter((d) =>
      (d.documentType || "").startsWith("Contract (Unsigned)"),
    );

    if (unsignedContracts.length === 0) {
      // Nothing to regenerate — don't auto-create a contract that never existed.
      return;
    }

    // Pick the template: default if available, else any.
    const allTemplates = await storage.getAllPdfTemplates();
    const template =
      allTemplates.find((t) => t.isDefault) || allTemplates[0];
    if (!template) {
      console.warn(
        `[contract-regen] No PDF template available for reservation #${reservationId}; skipping.`,
      );
      return;
    }

    // Generate the new PDF FIRST so we don't delete the old one if generation fails.
    const { generateRentalContractFromTemplate } = await import(
      "./utils/pdf-generator"
    );
    const newPdf = await generateRentalContractFromTemplate(
      reservation,
      template,
    );

    // Write the new file to disk.
    const sanitizedPlate = reservation.vehicle.licensePlate.replace(
      /[^a-zA-Z0-9]/g,
      "",
    );
    const uploadsDir = getUploadsDir();
    const contractsDir = path.join(
      uploadsDir,
      "contracts",
      sanitizedPlate,
    );
    if (!fs.existsSync(contractsDir)) {
      fs.mkdirSync(contractsDir, { recursive: true });
    }
    const today = new Date();
    const dateString =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, "0") +
      today.getDate().toString().padStart(2, "0");
    const fileName = `${sanitizedPlate}_contract_regen_${dateString}_${Date.now()}.pdf`;
    const absolutePath = path.join(contractsDir, fileName);
    fs.writeFileSync(absolutePath, newPdf);
    const relativePath = getRelativePath(absolutePath);

    // Re-read the unsigned contracts list right before deletion in case any
    // were added/removed while the PDF was being generated. This narrows the
    // window for losing newly created (e.g. signed) docs.
    const docsToReplace = (await storage.getDocumentsByReservation(reservationId))
      .filter((d) => (d.documentType || "").startsWith("Contract (Unsigned)"));

    // Delete the old unsigned contracts (file + DB row).
    for (const doc of docsToReplace) {
      try {
        const resolved = resolveDocumentFilePath(doc.filePath);
        if (resolved) {
          fs.unlinkSync(resolved);
        }
      } catch (fileErr) {
        console.warn(
          `[contract-regen] Could not delete file for doc ${doc.id}:`,
          fileErr,
        );
      }
      try {
        await storage.deleteDocument(doc.id);
      } catch (dbErr) {
        console.warn(
          `[contract-regen] Could not delete document row ${doc.id}:`,
          dbErr,
        );
      }
    }

    // Register the new unsigned contract document.
    await storage.createDocument({
      vehicleId: reservation.vehicleId,
      reservationId: reservation.id,
      documentType: "Contract (Unsigned)",
      fileName,
      filePath: relativePath,
      fileSize: newPdf.length,
      contentType: "application/pdf",
      createdBy: username || "System",
      notes: `Auto-regenerated after reservation data changed (replaced ${docsToReplace.length} older version${docsToReplace.length === 1 ? "" : "s"}).`,
    } as any);

    console.log(
      `[contract-regen] Regenerated unsigned contract for reservation #${reservationId} (replaced ${docsToReplace.length}).`,
    );
  } catch (err) {
    console.error(
      `[contract-regen] Failed to regenerate unsigned contracts for reservation #${reservationId}:`,
      err,
    );
  }
}

/**
 * Deletes any "superseded" pickup/return damage check PDFs (rows whose
 * documentType has been marked with " - Edited", " - Previous", or " - Old")
 * for a given reservation + checkType. Removes both the DB row and the file
 * on disk. The current active document (without those markers) is preserved.
 *
 * Called whenever a brand-new pickup or return damage check PDF is generated
 * so accumulated "previous version" entries don't pile up on the server.
 */
async function cleanupSupersededDamageCheckVersions(
  reservationId: number,
  checkType: "pickup" | "return",
): Promise<number> {
  let removed = 0;
  try {
    const prefix = `Damage Check (${checkType === "pickup" ? "Pickup" : "Return"})`;
    const docs = await storage.getDocumentsByReservation(reservationId);
    const superseded = docs.filter((d) => {
      const t = d.documentType || "";
      if (!t.startsWith(prefix)) return false;
      return (
        t.includes("Edited") ||
        t.includes("Previous") ||
        t.includes("Old")
      );
    });
    for (const doc of superseded) {
      try {
        const resolved = resolveDocumentFilePath(doc.filePath);
        if (resolved && fs.existsSync(resolved)) {
          fs.unlinkSync(resolved);
        }
      } catch (fileErr) {
        console.warn(
          `[damage-check-cleanup] Could not delete file for doc ${doc.id}:`,
          fileErr,
        );
      }
      try {
        await storage.deleteDocument(doc.id);
        removed++;
      } catch (dbErr) {
        console.warn(
          `[damage-check-cleanup] Could not delete document row ${doc.id}:`,
          dbErr,
        );
      }
    }
    if (removed > 0) {
      console.log(
        `[damage-check-cleanup] Removed ${removed} superseded ${checkType} damage check version(s) for reservation #${reservationId}.`,
      );
    }
  } catch (err) {
    console.error(
      `[damage-check-cleanup] Error cleaning up superseded ${checkType} damage checks for reservation #${reservationId}:`,
      err,
    );
  }
  return removed;
}

/**
 * Regenerates the "Damage Check (Unsigned)" PDF documents for a reservation by
 * deleting existing unsigned damage check(s) (file + DB row) and creating one
 * new PDF using the matching damage check template. Signed/Pickup/Return
 * damage checks and all other document types are NEVER touched.
 *
 * Only runs if at least one unsigned damage check already exists — we never
 * auto-create one that wasn't there before.
 *
 * Must be invoked through `scheduleReservationPdfRegeneration` to ensure
 * per-reservation serialization. Errors are logged and swallowed.
 */
/**
 * Pick the best damage check template from a list returned by
 * `getDamageCheckTemplatesByVehicle`. The storage method returns templates
 * whose vehicle attributes match OR are NULL (generic), sorted by name —
 * which means an empty unfinished template can shadow the real default.
 *
 * Preference order:
 *   1. Templates with non-empty canvasFields (i.e. an actual drawn layout)
 *      that exactly match brand+model+type.
 *   2. The default template, if it has canvasFields.
 *   3. Any template with canvasFields.
 *   4. The first matching template (legacy behaviour).
 *   5. The default template as a hard fallback.
 */
async function pickBestDamageCheckTemplate(
  matching: any[] | undefined,
  vehicle: { brand?: string | null; model?: string | null; vehicleType?: string | null },
): Promise<any | undefined> {
  const list = Array.isArray(matching) ? matching : [];
  const hasContent = (t: any) =>
    Array.isArray(t?.canvasFields) && t.canvasFields.length > 0;
  const exact = list.find(
    (t) =>
      hasContent(t) &&
      t.vehicleMake === vehicle.brand &&
      t.vehicleModel === vehicle.model &&
      (vehicle.vehicleType ? t.vehicleType === vehicle.vehicleType : true),
  );
  if (exact) return exact;
  const defaultWithContent = list.find((t) => t.isDefault && hasContent(t));
  if (defaultWithContent) return defaultWithContent;
  const anyWithContent = list.find(hasContent);
  if (anyWithContent) return anyWithContent;
  if (list.length > 0) return list[0];
  return await storage.getDefaultDamageCheckTemplate();
}

async function regenerateUnsignedDamageChecksForReservation(
  reservationId: number,
  username: string | null,
): Promise<void> {
  try {
    const reservation = await storage.getReservation(reservationId);
    if (!reservation || !reservation.vehicle) {
      return;
    }

    const allDocs = await storage.getDocumentsByReservation(reservationId);
    const unsignedDamageChecks = allDocs.filter((d) =>
      (d.documentType || "").startsWith("Damage Check (Unsigned)"),
    );

    if (unsignedDamageChecks.length === 0) {
      return; // Don't auto-create one that didn't exist.
    }

    // Find matching damage check template (by vehicle), fallback to default.
    const vehicle = reservation.vehicle;
    const matchingTemplates = await storage.getDamageCheckTemplatesByVehicle(
      vehicle.brand,
      vehicle.model,
      vehicle.vehicleType || undefined,
    );
    const damageTemplate = await pickBestDamageCheckTemplate(matchingTemplates, vehicle);

    if (!damageTemplate) {
      console.warn(
        `[damage-check-regen] No damage check template available for reservation #${reservationId}; skipping.`,
      );
      return;
    }

    // Prepare data exactly like the standalone generation endpoint.
    const vehicleData = {
      brand: vehicle.brand,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate,
      buildYear: vehicle.productionDate || undefined,
      fuel: (reservation as any).fuelLevelPickup || vehicle.fuel || undefined,
      mileage:
        (reservation as any).pickupMileage ??
        (vehicle as any).currentMileage ??
        undefined,
    };

    let reservationData: any = undefined;
    if (reservation.customer) {
      const startDate = new Date(reservation.startDate);
      const endDate = reservation.endDate
        ? new Date(reservation.endDate)
        : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const rentalDays = Math.max(
        1,
        Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      reservationData = {
        contractNumber:
          (reservation as any).contractNumber ||
          `C-${reservationId}-${format(new Date(), "yyyyMMdd")}`,
        customerName:
          `${(reservation.customer as any).firstName || ""} ${(reservation.customer as any).lastName || ""}`.trim() ||
          (reservation.customer as any).name ||
          "",
        startDate: format(startDate, "dd-MM-yyyy"),
        endDate: format(endDate, "dd-MM-yyyy"),
        rentalDays,
      };
    }

    // Pick up the latest interactive damage check for this reservation so
    // all ticked checkboxes and recorded answers carry through to the PDF.
    let latestInteractiveCheck: any = undefined;
    try {
      const checks = await storage.getInteractiveDamageChecksByReservation(reservationId);
      if (checks && checks.length > 0) {
        latestInteractiveCheck = checks[0]; // storage returns desc(checkDate), so [0] is newest
      }
    } catch (e) {
      console.warn('[damage-check-regen] Could not load interactive check:', (e as Error).message);
    }

    // Generate the new PDF FIRST so failures don't lose the old one.
    const { generateDamageCheckPDFWithTemplate } = await import(
      "./pdf-damage-check-generator"
    );
    const pdfBuffer = await generateDamageCheckPDFWithTemplate(
      vehicleData,
      damageTemplate as any,
      reservationData,
      latestInteractiveCheck,
    );

    // Write the new file to disk in the same convention as the existing endpoint.
    const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, "");
    const uploadsDir = getUploadsDir();
    const vehicleDir = path.join(uploadsDir, sanitizedPlate, "damage-checks");
    if (!fs.existsSync(vehicleDir)) {
      fs.mkdirSync(vehicleDir, { recursive: true });
    }
    const timestamp = Date.now();
    const dateString = format(new Date(), "yyyy-MM-dd");
    const fileName = `${sanitizedPlate}_DamageCheck_Unsigned_${dateString}_regen_${timestamp}.pdf`;
    const absolutePath = path.join(vehicleDir, fileName);
    fs.writeFileSync(absolutePath, pdfBuffer);
    const relativePath = `uploads/${sanitizedPlate}/damage-checks/${fileName}`;

    // Re-read to narrow the deletion window.
    const docsToReplace = (await storage.getDocumentsByReservation(reservationId))
      .filter((d) => (d.documentType || "").startsWith("Damage Check (Unsigned)"));

    for (const doc of docsToReplace) {
      try {
        const resolved = resolveDocumentFilePath(doc.filePath);
        if (resolved) {
          fs.unlinkSync(resolved);
        }
      } catch (fileErr) {
        console.warn(
          `[damage-check-regen] Could not delete file for doc ${doc.id}:`,
          fileErr,
        );
      }
      try {
        await storage.deleteDocument(doc.id);
      } catch (dbErr) {
        console.warn(
          `[damage-check-regen] Could not delete document row ${doc.id}:`,
          dbErr,
        );
      }
    }

    const savedDoc = await storage.createDocument({
      vehicleId: reservation.vehicleId,
      reservationId: reservation.id,
      documentType: "Damage Check (Unsigned)",
      fileName,
      filePath: relativePath,
      fileSize: pdfBuffer.length,
      contentType: "application/pdf",
      createdBy: username || "System",
      notes: `Auto-regenerated after reservation data changed (replaced ${docsToReplace.length} older version${docsToReplace.length === 1 ? "" : "s"}).`,
    } as any);

    try {
      realtimeEvents.documents.created(savedDoc);
    } catch {
      // realtime broadcast is best-effort
    }

    console.log(
      `[damage-check-regen] Regenerated unsigned damage check for reservation #${reservationId} (replaced ${docsToReplace.length}).`,
    );
  } catch (err) {
    console.error(
      `[damage-check-regen] Failed to regenerate unsigned damage checks for reservation #${reservationId}:`,
      err,
    );
  }
}

// ============================================================================
// Old-rental admin password override
// ============================================================================
// After 3 weeks past the actual pickup date, non-admin users editing a
// reservation must enter an admin password to confirm the change (and trigger
// PDF regeneration). Admins bypass this check entirely.
const OLD_RENTAL_LOCK_DAYS = 21;

function reservationIsOld(reservation: any | null | undefined): boolean {
  if (!reservation) return false;
  const pickup = reservation.actualPickupDate;
  if (!pickup) return false;
  const pickupTime = new Date(pickup).getTime();
  if (Number.isNaN(pickupTime)) return false;
  const ageMs = Date.now() - pickupTime;
  return ageMs > OLD_RENTAL_LOCK_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Verifies the supplied password matches any active admin user's password.
 * Returns true on match, false otherwise. Safe to fail silently.
 */
async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || typeof password !== "string") return false;
  try {
    const allUsers = await storage.getAllUsers();
    const admins = allUsers.filter(
      (u) => u.role === UserRole.ADMIN && (u as any).active !== false,
    );
    if (admins.length === 0) return false;
    const { comparePasswords } = await import("./auth");
    for (const admin of admins) {
      try {
        if (await comparePasswords(password, admin.password)) {
          return true;
        }
      } catch {
        // skip
      }
    }
  } catch (err) {
    console.error("[admin-override] Error verifying admin password:", err);
  }
  return false;
}

// Helper function to format dates consistently
function formatDate(dateString: string): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return format(date, 'dd-MM-yyyy');
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
}

export async function registerRoutes(app: Express): Promise<void> {
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
  const upload = multer({
    dest: path.join(uploadsDir, 'temp'),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for invoices
    },
    fileFilter: createSecureMulterFilter('pdf'),
  });

  // Configure multer for backup uploads (backup files) with enhanced security
  const backupUpload = multer({
    dest: path.join(uploadsDir, 'temp'),
    limits: {
      fileSize: 1000 * 1024 * 1024, // 1GB limit for backups
    },
    fileFilter: createSecureMulterFilter('backup'),
  });
  
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
  const diagramUpload = multer({
    storage: diagramStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit for images
    },
    fileFilter: createSecureMulterFilter('image'),
  });

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
  const fuelReceiptUpload = multer({
    storage: fuelReceiptStorage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for PDFs and images
    },
    fileFilter: createSecureMulterFilter('document'),
  });
  
  // Set up authentication routes and middleware
  const { requireAuth } = setupAuth(app);

  // Initialize backup service
  const backupService = new BackupService();
  const objectStorage = new ObjectStorageService();

  // ==================== USER MANAGEMENT ROUTES ====================
  // Get all users (requires MANAGE_USERS permission)
  app.get("/api/users", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Don't send passwords to client
      const safeUsers = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  
  // Get single user (requires MANAGE_USERS permission)
  app.get("/api/users/:id", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Don't send password to client
      const { password, ...userWithoutPassword } = user;
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  
  // Create user (requires MANAGE_USERS permission)
  app.post("/api/users", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Add audit trail
      const currentUser = req.user;
      const enrichedUserData = {
        ...userData,
        createdBy: currentUser.username,
        updatedBy: currentUser.username
      };
      
      // Hash password before storing
      const hashedPassword = await hashPassword(userData.password);
      
      const newUser = await storage.createUser({
        ...enrichedUserData,
        password: hashedPassword
      });
      
      // Don't send password back to client
      const { password, ...userWithoutPassword } = newUser;
      
      // Broadcast real-time update
      realtimeEvents.users.created(userWithoutPassword);
      
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(400).json({ 
        message: "Failed to create user", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Update user with self-update for own profile
  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Allow users to update their own profile, admin, or users with MANAGE_USERS permission for others
      const isSelfUpdate = id === req.user.id;
      const isAdmin = req.user.role === UserRole.ADMIN;
      const hasManageUsersPermission = req.user.permissions?.includes(UserPermission.MANAGE_USERS) || false;
      
      if (!isSelfUpdate && !isAdmin && !hasManageUsersPermission) {
        return res.status(403).json({ message: "Not authorized to update other user accounts" });
      }
      
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // If updating username, check if new username already exists
      if (req.body.username && req.body.username !== user.username) {
        const existingUser = await storage.getUserByUsername(req.body.username);
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      
      // For self-update, only allow certain fields (username, fullName, email)
      let userData;
      if (isSelfUpdate && !isAdmin && !hasManageUsersPermission) {
        const { username, fullName, email } = req.body;
        userData = {
          username,
          fullName,
          email,
          updatedBy: req.user.username
        };
        
        // Filter out undefined values
        Object.keys(userData).forEach(key => 
          userData[key] === undefined && delete userData[key]
        );
      } else {
        // Admin and users with MANAGE_USERS permission can update all fields
        userData = {
          ...req.body,
          updatedBy: req.user.username
        };
      }
      
      // Special handling for admin-only operations
      if (!isAdmin && !hasManageUsersPermission) {
        // Non-admins and users without MANAGE_USERS can't change roles or permissions
        delete userData.role;
        delete userData.permissions;
        delete userData.active;
        delete userData.hidePrices;
      }
      
      // Handle password separately
      if (userData.password) {
        // Separate password from other data
        const { password, ...otherData } = userData;
        
        // Update user data without password
        const updatedUser = await storage.updateUser(id, otherData);
        
        // Update password separately with proper hashing
        const hashedPassword = await hashPassword(password);
        await storage.updateUserPassword(id, hashedPassword);
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Don't send password back to client
        const { password: _, ...userWithoutPassword } = updatedUser;
        
        // Broadcast real-time update
        realtimeEvents.users.updated(userWithoutPassword);
        
        res.json(userWithoutPassword);
      } else {
        // Update user without password change
        const updatedUser = await storage.updateUser(id, userData);
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Don't send password back to client
        const { password: _, ...userWithoutPassword } = updatedUser;
        
        // Broadcast real-time update
        realtimeEvents.users.updated(userWithoutPassword);
        
        res.json(userWithoutPassword);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(400).json({ 
        message: "Failed to update user", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Original update user for backward compatibility
  app.patch("/api/users/:id/admin", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // If updating username, check if new username already exists
      if (req.body.username && req.body.username !== user.username) {
        const existingUser = await storage.getUserByUsername(req.body.username);
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      
      // Add audit trail
      const currentUser = req.user;
      const userData = {
        ...req.body,
        updatedBy: currentUser.username
      };
      
      // Handle password separately
      if (userData.password) {
        // Separate password from other data
        const { password, ...otherData } = userData;
        
        // Update user data without password
        const updatedUser = await storage.updateUser(id, otherData);
        
        // Update password separately with proper hashing
        const hashedPassword = await hashPassword(password);
        await storage.updateUserPassword(id, hashedPassword);
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Don't send password back to client
        const { password: pwd, ...userWithoutPassword } = updatedUser;
        return res.json(userWithoutPassword);
      } else {
        // Regular update without password change
        const updatedUser = await storage.updateUser(id, userData);
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Don't send password back to client
        const { password, ...userWithoutPassword } = updatedUser;
        return res.json(userWithoutPassword);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(400).json({ 
        message: "Failed to update user", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Set mileage override password (users can set their own)
  app.post("/api/users/:id/mileage-override-password", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Only allow users to set their own mileage override password
      if (id !== req.user.id) {
        return res.status(403).json({ message: "Can only set your own mileage override password" });
      }
      
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      
      if (password.length < 4) {
        return res.status(400).json({ message: "Password must be at least 4 characters" });
      }
      
      // Hash the password
      const hashedPassword = await hashPassword(password);
      const success = await storage.setMileageOverridePassword(id, hashedPassword);
      
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ success: true, message: "Mileage override password set successfully" });
    } catch (error) {
      console.error("Error setting mileage override password:", error);
      res.status(500).json({ message: "Failed to set mileage override password" });
    }
  });
  
  // Verify mileage override password
  app.post("/api/users/:id/verify-mileage-override", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      
      const storedHash = await storage.getMileageOverridePasswordHash(id);
      
      if (!storedHash) {
        return res.status(404).json({ message: "No mileage override password set for this user" });
      }
      
      const isValid = await verifyPassword(password, storedHash);
      
      res.json({ valid: isValid });
    } catch (error) {
      console.error("Error verifying mileage override password:", error);
      res.status(500).json({ message: "Failed to verify password" });
    }
  });
  
  // Delete user (requires MANAGE_USERS permission)
  app.delete("/api/users/:id", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Prevent deletion of the current user
      if (id === req.user.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const deleted = await storage.deleteUser(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ success: true, message: "User successfully deleted" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ 
        message: "Failed to delete user", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Update current user's password
  app.post("/api/users/change-password", requireAuth, async (req, res) => {
    try {
      // Validate request body with Zod
      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string()
          .min(8, "New password must be at least 8 characters long")
          .max(100, "New password is too long")
          .regex(/[a-z]/, "Password must contain at least one lowercase letter")
          .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
          .regex(/[0-9]/, "Password must contain at least one number"),
      });

      const validationResult = changePasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.issues.map(i => i.message) 
        });
      }

      const { currentPassword, newPassword } = validationResult.data;
      
      // Get current user
      const user = await storage.getUser(req.user.id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify current password
      const isPasswordValid = await comparePasswords(currentPassword, user.password);
      
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      
      // Hash and update new password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);
      
      res.json({ success: true, message: "Password successfully updated" });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ 
        message: "Failed to update password", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
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
      // Sync availability status with reservations first
      await storage.syncVehicleAvailabilityWithReservations();
      
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
      
      // Sync availability status with reservations before fetching
      await storage.syncVehicleAvailabilityWithReservations();
      
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
          error: parseError 
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
      
      // Check for duplicate license plate error (PostgreSQL unique constraint violation)
      if (error && typeof error === 'object' && 'code' in error) {
        // PostgreSQL error code 23505 = unique_violation
        if (error.code === '23505' || error.code === 23505) {
          // Check if it's specifically about license_plate
          const errorMessage = String(error.message || '').toLowerCase();
          if (errorMessage.includes('license_plate') || errorMessage.includes('duplicate key')) {
            return res.status(409).json({ 
              message: "A vehicle with this license plate already exists. Please use a different license plate or edit the existing vehicle.",
              field: "licensePlate"
            });
          }
        }
      }
      
      // Generic error for other types of failures
      res.status(400).json({ 
        message: "Failed to create vehicle. Please check your data and try again.", 
        error: error && typeof error === 'object' && 'message' in error ? error.message : String(error)
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
          
          // Helper function to convert Excel serial date to ISO date string
          const convertExcelDate = (value: string): string | null => {
            if (!value) return null;
            const trimmed = value.trim();
            
            // Check if it's an Excel serial date (a number)
            if (/^\d+$/.test(trimmed)) {
              const serial = parseInt(trimmed, 10);
              // Excel dates start from January 1, 1900 (serial 1)
              // But Excel incorrectly treats 1900 as a leap year, so subtract 1 for dates after Feb 28, 1900
              const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
              const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
              if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
              }
            }
            
            // Try parsing as a regular date string
            const parsed = new Date(trimmed);
            if (!isNaN(parsed.getTime())) {
              return parsed.toISOString().split('T')[0];
            }
            
            return null;
          };
          
          // Handle APK date
          if (vehicleInput.apkDate) {
            const convertedApkDate = convertExcelDate(vehicleInput.apkDate);
            if (convertedApkDate) {
              vehicleData.apkDate = convertedApkDate;
            }
          }
          
          // Handle company date (BV/Opnaam date)
          if (vehicleInput.companyDate) {
            const convertedCompanyDate = convertExcelDate(vehicleInput.companyDate);
            if (convertedCompanyDate) {
              vehicleData.companyDate = convertedCompanyDate;
            }
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
      
      console.log("Sanitized vehicle update data:", JSON.stringify(sanitizedData));

      // Get the existing vehicle first to merge with updates
      const existingVehicle = await storage.getVehicle(id);
      if (!existingVehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // For partial updates, we need to merge with existing data
      const mergedData = {
        ...existingVehicle,
        ...sanitizedData
      };

      // Parse the sanitized merged data
      const vehicleData = insertVehicleSchema.parse(mergedData);
      
      // Validate status change if availability status is being updated
      if (sanitizedData.availabilityStatus && 
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
        
        // Include warning in response if present
        if (validation.warning) {
          console.log(`[Vehicle Status] Warning for vehicle ${id}: ${validation.warning}`);
        }
      }
      
      // Preserve the registration specific tracking fields
      const { registeredToBy, companyBy } = existingVehicle;
      
      // Add user tracking information for updates
      const user = req.user;
      const dataWithTracking: Record<string, any> = {
        ...vehicleData,
        updatedBy: user ? user.username : null,
        // Preserve the registration tracking fields
        registeredToBy,
        companyBy
      };
      
      // Track mileage decrease (admin-only visibility)
      const newMileage = sanitizedData.currentMileage !== undefined ? parseInt(sanitizedData.currentMileage) : null;
      const oldMileage = existingVehicle.currentMileage;
      if (newMileage !== null && !isNaN(newMileage) && oldMileage !== null && newMileage < oldMileage) {
        dataWithTracking.mileageDecreasedBy = user ? user.username : 'unknown';
        dataWithTracking.mileageDecreasedAt = new Date();
        dataWithTracking.previousMileage = oldMileage;
        console.log(`[Mileage Decrease] Vehicle ${id}: ${oldMileage} -> ${newMileage} by ${user?.username || 'unknown'}`);
      }
      
      const vehicle = await storage.updateVehicle(id, dataWithTracking);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.vehicles.updated(vehicle);
      
      res.json(vehicle);
    } catch (error) {
      console.error("Error updating vehicle:", error);
      res.status(400).json({ 
        message: "Invalid vehicle data", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
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
        
        // Track mileage decrease (admin-only visibility)
        const newMileage = updateData.currentMileage;
        const oldMileage = vehicle.currentMileage;
        if (newMileage !== undefined && oldMileage !== null && newMileage < oldMileage) {
          dataWithTracking.mileageDecreasedBy = user ? user.username : 'unknown';
          dataWithTracking.mileageDecreasedAt = new Date();
          dataWithTracking.previousMileage = oldMileage;
          console.log(`[Mileage Decrease] Vehicle ${id}: ${oldMileage} -> ${newMileage} by ${user?.username || 'unknown'}`);
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
        error: error instanceof Error ? error.message : "Unknown error" 
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
          } else if ('id' in req.user) {
            try {
              const userId = req.user.id;
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
        return res.status(400).json({ message: `Error toggling registration status: ${error.message}` });
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
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Delete vehicle
  app.delete("/api/vehicles/:id", hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle ID" });
      }

      const deleted = await storage.deleteVehicle(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.vehicles.deleted({ id });
      
      res.json({ success: true, message: "Vehicle successfully deleted" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting vehicle", error });
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
  app.get("/api/rdw/vehicle/:licensePlate", async (req, res) => {
    try {
      const licensePlate = req.params.licensePlate;
      const vehicleInfo = await fetchVehicleInfoByLicensePlate(licensePlate);
      res.json(vehicleInfo);
    } catch (error) {
      console.error("RDW API lookup error:", error);
      
      if (error instanceof RDWNotFoundError) {
        return res.status(404).json({ 
          message: "Vehicle not found", 
          error: error.message 
        });
      }
      
      if (error instanceof RDWTimeoutError) {
        return res.status(504).json({ 
          message: "RDW service timeout", 
          error: error.message 
        });
      }
      
      if (error instanceof RDWUpstreamError) {
        return res.status(502).json({ 
          message: "RDW service error", 
          error: error.message 
        });
      }
      
      // Fallback for unexpected errors
      res.status(500).json({ 
        message: "Failed to fetch vehicle information from RDW", 
        error: error instanceof Error ? error.message : "Unknown error" 
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
      const customers = await storage.getAllCustomers();
      const reservations = await storage.getAllReservations();
      
      const today = new Date();
      
      // Add hasActiveReservation property to each customer
      const customersWithReservations = customers.map(customer => {
        const customerReservations = reservations.filter(reservation => 
          reservation.customerId === customer.id
        );
        
        const hasActiveReservation = customerReservations.some(reservation => {
          // Handle undefined or invalid endDate
          if (!reservation.endDate || reservation.endDate === "undefined") {
            return false;
          }
          
          const startDate = new Date(reservation.startDate);
          const endDate = new Date(reservation.endDate);
          
          // Check if reservation is active (started but not ended)
          return startDate <= today && endDate >= today;
        });
        
        return {
          ...customer,
          hasActiveReservation
        };
      });
      
      res.json(customersWithReservations);
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
  app.delete("/api/customers/:id", hasPermission(UserPermission.MANAGE_CUSTOMERS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const success = await storage.deleteCustomer(id);
      
      if (!success) {
        return res.status(404).json({ message: "Customer not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.customers.deleted({ id });
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete customer", error });
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
        isNaN(excludeReservationId) ? null : excludeReservationId,
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
      const reservations = await storage.getAllReservations();
      const reservation = reservations.find(r => r.contractNumber === contractNumber);
      
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
  const damageCheckUpload = multer({
    storage: damageCheckStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: createSecureMulterFilter('document'),
  });
  
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
        
        const customerReservations = await storage.checkReservationConflicts(
          reservationData.vehicleId,
          reservationData.startDate,
          reservationData.endDate,
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
            maintenanceReservationId: reservation.id // Include the created maintenance ID
          });
        }
        
        console.log(`🔧 [Maintenance #${reservation.id}] No customer conflicts — returning 201.`);
        // No conflicts, return the created maintenance reservation
        return res.status(201).json(reservation);
      } else {
        // For regular reservations, check for conflicts normally
        const conflicts = await storage.checkReservationConflicts(
          reservationData.vehicleId,
          reservationData.startDate,
          reservationData.endDate,
          null,
          false,
          reservationData.startTime,
          reservationData.endTime
        );
        
        if (conflicts.length > 0) {
          return res.status(409).json({ 
            message: "Reservation conflicts with existing bookings",
            conflicts
          });
        }
        
        // Check for overdue reservations on this vehicle (ended 3+ days ago, not completed)
        const overdueReservations = await storage.getOverdueReservationsByVehicle(reservationData.vehicleId);
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
        const vehicle = await storage.getVehicle(reservationData.vehicleId);
        if (vehicle && (vehicle.company === "true" || vehicle.company === true)) {
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
      
      const reservation = await storage.createReservation(dataWithTracking);
      
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
            const vehicle = await storage.getVehicle(reservation.vehicleId);
            const customer = await storage.getCustomer(reservation.customerId);
            
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
                const contractsDir = path.join(process.cwd(), 'uploads', 'contracts', licensePlate);
                await fs.promises.mkdir(contractsDir, { recursive: true });
                
                const fileName = `${licensePlate}_contract_${format(new Date(), 'yyyyMMdd')}.pdf`;
                const filePath = path.join(contractsDir, fileName);
                const relativeFilePath = `uploads/contracts/${licensePlate}/${fileName}`;
                
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
      
      res.status(201).json(reservation);
    } catch (error) {
      console.error("Error creating reservation:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid reservation data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to create reservation", 
          error: error instanceof Error ? error.message : "Unknown error" 
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
        
        // Pre-validate spare vehicle availability (skip for open-ended as we can't check infinite period)
        if (!isOpenEnded) {
          const spareConflicts = await storage.checkReservationConflicts(
            spareVehicleId,
            overlapStart.toISOString().split('T')[0],
            overlapEnd.toISOString().split('T')[0],
            null
          );
          
          if (spareConflicts.length > 0) {
            throw new Error(`Spare vehicle ${spareVehicleId} is not available during the specified period`);
          }
        }
        
        return { originalReservation, overlapStart, overlapEnd: isOpenEnded ? null : overlapEnd, spareVehicleId, isOpenEnded };
      });
      
      // Execute all validations (will throw if any fail)
      const validatedAssignments = await Promise.all(validationPromises);
      
      let maintenanceReservation;
      let updatedReservations;
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
        
        // Clean up old replacement reservations using structured approach
        if (spareVehicleAssignments.length > 0) {
          // Find old replacements for the same reservations being updated
          const conflictingReservationIds = spareVehicleAssignments.map(a => a.reservationId);
          const allReservations = await storage.getAllReservations();
          const oldReplacements = allReservations.filter(r => 
            r.type === 'replacement' && 
            r.replacementForReservationId && 
            conflictingReservationIds.includes(r.replacementForReservationId)
          );
          
          for (const oldReplacement of oldReplacements) {
            await storage.deleteReservation(oldReplacement.id);
          }
        }
        
        // CREATE REPLACEMENTS FIRST for true atomicity
        const replacementPromises = validatedAssignments.map(async (validated) => {
          const { originalReservation, overlapStart, overlapEnd, spareVehicleId, isOpenEnded } = validated;
          
          // Get vehicle details for better notes
          const spareVehicle = await storage.getVehicle(spareVehicleId);
          const originalVehicle = originalReservation.vehicle || await storage.getVehicle(originalReservation.vehicleId);
          
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
          
          // Create replacement reservation for overlap period ONLY  
          return await storage.createReservation({
            vehicleId: spareVehicleId,
            customerId: originalReservation.customerId,
            startDate: startDateStr,
            endDate: endDateStr,
            type: 'replacement',
            replacementForReservationId: originalReservation.id,
            placeholderSpare: false,
            status: 'booked',
            totalPrice: 0,
            createdBy: user ? user.username : null,
            updatedBy: user ? user.username : null,
            notes: `Spare vehicle ${spareVehicleDesc} for reservation #${originalReservation.id} during maintenance of ${originalVehicleDesc}. Original rental: ${originalReservation.startDate} to ${originalEndNote}.`
          });
        });
        
        const newReplacements = await Promise.all(replacementPromises);
        
        // ONLY AFTER successful replacement creation, update maintenance
        const maintenanceWithTracking = {
          ...maintenanceData,
          updatedBy: user ? user.username : null
        };
        maintenanceReservation = await storage.updateReservation(maintenanceId, maintenanceWithTracking);
        
        updatedReservations = newReplacements;
      } else {
        // Create new maintenance block
        const maintenanceWithTracking = {
          ...maintenanceData,
          createdBy: user ? user.username : null,
          updatedBy: user ? user.username : null
        };
        maintenanceReservation = await storage.createReservation(maintenanceWithTracking);
        
        // Clean up existing placeholder reservations for the same original reservations
        if (spareVehicleAssignments.length > 0) {
          const conflictingReservationIds = spareVehicleAssignments.map((a: any) => a.reservationId);
          const allReservations = await storage.getAllReservations();
          const oldPlaceholders = allReservations.filter((r: any) => 
            r.type === 'replacement' && 
            r.replacementForReservationId && 
            conflictingReservationIds.includes(r.replacementForReservationId)
          );
          
          for (const oldPlaceholder of oldPlaceholders) {
            await storage.deleteReservation(oldPlaceholder.id);
          }
        }
        
        // Create replacement reservations using pre-validated data
        const updatePromises = validatedAssignments.map(async (validated) => {
          const { originalReservation, overlapStart, overlapEnd, spareVehicleId, isOpenEnded } = validated;
          
          // Get vehicle details for better notes
          const spareVehicle = await storage.getVehicle(spareVehicleId);
          const originalVehicle = originalReservation.vehicle || await storage.getVehicle(originalReservation.vehicleId);
          
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
          
          return await storage.createReservation({
            vehicleId: spareVehicleId,
            customerId: originalReservation.customerId,
            startDate: startDateStr,
            endDate: endDateStr,
            type: 'replacement',
            replacementForReservationId: originalReservation.id,
            placeholderSpare: false,
            status: 'booked',
            totalPrice: 0,
            createdBy: user ? user.username : null,
            updatedBy: user ? user.username : null,
            notes: `Spare vehicle ${spareVehicleDesc} for reservation #${originalReservation.id} during maintenance of ${originalVehicleDesc}. Original rental: ${originalReservation.startDate} to ${originalEndNote}.`
          });
        });
        
        updatedReservations = await Promise.all(updatePromises);
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
      console.error("Error creating maintenance with spare:", error);
      res.status(400).json({ 
        message: "Failed to create maintenance with spare vehicles", 
        error: error instanceof Error ? error.message : "Unknown error" 
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

      // Convert string fields to the correct types
      if (bodyData.vehicleId) bodyData.vehicleId = parseInt(bodyData.vehicleId);
      if (bodyData.customerId) bodyData.customerId = parseInt(bodyData.customerId);
      
      // Handle totalPrice properly - treat empty string and NaN as undefined
      if (bodyData.totalPrice === "" || bodyData.totalPrice === null) {
        bodyData.totalPrice = undefined;
      } else if (bodyData.totalPrice) {
        const parsedPrice = parseFloat(bodyData.totalPrice);
        bodyData.totalPrice = isNaN(parsedPrice) ? undefined : parsedPrice;
      }
      const reservationData = insertReservationSchema.parse(bodyData);
      
      // Check for conflicts (exclude the current reservation)
      const conflicts = await storage.checkReservationConflicts(
        reservationData.vehicleId,
        reservationData.startDate,
        reservationData.endDate,
        id,
        false,
        reservationData.startTime,
        reservationData.endTime
      );
      
      // Special handling for maintenance_block edits: customer rentals during the
      // maintenance period should NOT block the update — they should trigger the
      // spare vehicle assignment flow (same as POST /api/reservations).
      if (reservationData.type === 'maintenance_block') {
        const customerConflicts = conflicts.filter(r => r.type !== 'maintenance_block');

        // Apply the maintenance update first so the dates are persisted
        const userForMaint = req.user;
        const maintDataWithTracking = {
          ...reservationData,
          updatedBy: userForMaint ? userForMaint.username : null,
        };
        const updatedMaintenance = await storage.updateReservation(id, maintDataWithTracking);
        if (!updatedMaintenance) {
          return res.status(404).json({ message: "Reservation not found" });
        }

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
        const vehicle = await storage.getVehicle(reservationData.vehicleId);
        if (vehicle && (vehicle.company === "true" || vehicle.company === true)) {
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
      
      const reservation = await storage.updateReservation(id, dataWithTracking);
      
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Sync vehicle availability status after updating reservation
      await storage.syncVehicleAvailabilityWithReservations();
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.reservations.updated(reservation);
      
      res.json(reservation);
    } catch (error) {
      console.error("Error updating reservation:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid reservation data", 
          error: error.errors 
        });
      }
      res.status(500).json({ 
        message: "Failed to update reservation", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Update reservation status only (special endpoint for status changes)
  app.patch("/api/reservations/:id/status", hasPermission(UserPermission.MANAGE_RESERVATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      
      // Validate that status is a string and is one of the expected values
      const { status } = req.body;
      if (!status || typeof status !== 'string' || 
          !['booked', 'picked_up', 'returned', 'completed', 'cancelled'].includes(status.toLowerCase())) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      
      // Get the current reservation to check for vehicle info
      const existingReservation = await storage.getReservation(id);
      
      if (!existingReservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Validate status transition (skip for reversion flows handled below)
      const currentStatus = existingReservation.status;
      const newStatus = status.toLowerCase();
      if (!isValidReservationTransition(currentStatus, newStatus)) {
        // Allow certain reversion flows that are explicitly handled
        const isAllowedReversion = 
          (currentStatus === 'picked_up' && newStatus === 'booked') ||
          (currentStatus === 'returned' && newStatus === 'picked_up') ||
          (currentStatus === 'completed' && ['picked_up', 'booked'].includes(newStatus));
        
        if (!isAllowedReversion) {
          return res.status(400).json({ 
            message: `Invalid status transition from '${currentStatus}' to '${newStatus}'`,
            details: {
              currentStatus,
              requestedStatus: newStatus,
              hint: "Check valid transitions: booked → picked_up → completed"
            }
          });
        }
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
      
      // When reverting from "returned" to "picked_up", clear return data
      if (existingReservation.status === "returned" && status === "picked_up") {
        console.log('🔄 Reverting from returned to picked_up - clearing return data');
        dataWithTracking.actualReturnDate = null;
        dataWithTracking.returnMileage = null;
        dataWithTracking.fuelLevelReturn = null;
        dataWithTracking.fuelCost = null;
        dataWithTracking.fuelCardNumber = null;
        dataWithTracking.fuelNotes = null;
        dataWithTracking.endDate = null;
      }
      
      // When reverting from "completed" to any other status, clear completion data
      if (existingReservation.status === "completed" && status !== "completed") {
        console.log('🔄 Reverting from completed status - clearing completion data');
        dataWithTracking.completionDate = null;
        dataWithTracking.endDate = null;
      }
      
      // When marking as completed, set endDate to today (actual completion date)
      if (status === "completed") {
        // Set completion date to today
        dataWithTracking.endDate = new Date().toISOString().split('T')[0];
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
      
      // Sync vehicle availability status after status update
      await storage.syncVehicleAvailabilityWithReservations();
      
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
      
      return res.status(200).json(enrichedReservation);
    } catch (error) {
      console.error('Error updating reservation status:', error);
      res.status(500).json({ 
        message: "Failed to update reservation status", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Update reservation with damage check upload
  app.patch("/api/reservations/:id", hasPermission(UserPermission.MANAGE_RESERVATIONS), damageCheckUpload.single('damageCheckFile'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }

      // Convert string fields to the correct types (FormData sends everything as strings)
      if (req.body.vehicleId) req.body.vehicleId = parseInt(req.body.vehicleId);
      if (req.body.customerId) req.body.customerId = parseInt(req.body.customerId);
      
      // Handle driverId - convert to number or null
      if (req.body.driverId === "null" || req.body.driverId === "" || req.body.driverId === null) {
        req.body.driverId = null;
      } else if (req.body.driverId) {
        req.body.driverId = parseInt(req.body.driverId);
      }
      
      // Handle totalPrice properly - treat empty string and NaN as undefined
      if (req.body.totalPrice === "" || req.body.totalPrice === null) {
        req.body.totalPrice = undefined;
      } else if (req.body.totalPrice) {
        const parsedPrice = parseFloat(req.body.totalPrice);
        req.body.totalPrice = isNaN(parsedPrice) ? undefined : parsedPrice;
      }
      
      // Convert "null" string to actual null for nullable fields
      if (req.body.replacementForReservationId === "null" || req.body.replacementForReservationId === "") {
        req.body.replacementForReservationId = null;
      } else if (req.body.replacementForReservationId) {
        req.body.replacementForReservationId = parseInt(req.body.replacementForReservationId);
      }
      
      if (req.body.affectedRentalId === "null" || req.body.affectedRentalId === "") {
        req.body.affectedRentalId = null;
      } else if (req.body.affectedRentalId) {
        req.body.affectedRentalId = parseInt(req.body.affectedRentalId);
      }
      
      if (req.body.maintenanceDuration === "null" || req.body.maintenanceDuration === "") {
        req.body.maintenanceDuration = null;
      } else if (req.body.maintenanceDuration) {
        req.body.maintenanceDuration = parseInt(req.body.maintenanceDuration);
      }
      
      // Convert string booleans to actual booleans
      if (req.body.placeholderSpare === "true") req.body.placeholderSpare = true;
      else if (req.body.placeholderSpare === "false") req.body.placeholderSpare = false;
      
      if (req.body.isRecurring === "true") req.body.isRecurring = true;
      else if (req.body.isRecurring === "false") req.body.isRecurring = false;
      
      // Handle nullable string fields
      if (req.body.maintenanceStatus === "null" || req.body.maintenanceStatus === "") {
        req.body.maintenanceStatus = null;
      }
      if (req.body.spareAssignmentDecision === "null" || req.body.spareAssignmentDecision === "") {
        req.body.spareAssignmentDecision = null;
      }
      
      // Handle recurring reservation fields
      if (req.body.recurringParentId === "null" || req.body.recurringParentId === "") {
        req.body.recurringParentId = null;
      } else if (req.body.recurringParentId) {
        req.body.recurringParentId = parseInt(req.body.recurringParentId);
      }
      
      if (req.body.recurringDayOfWeek === "null" || req.body.recurringDayOfWeek === "") {
        req.body.recurringDayOfWeek = null;
      } else if (req.body.recurringDayOfWeek) {
        req.body.recurringDayOfWeek = parseInt(req.body.recurringDayOfWeek);
      }
      
      if (req.body.recurringDayOfMonth === "null" || req.body.recurringDayOfMonth === "") {
        req.body.recurringDayOfMonth = null;
      } else if (req.body.recurringDayOfMonth) {
        req.body.recurringDayOfMonth = parseInt(req.body.recurringDayOfMonth);
      }
      
      if (req.body.recurringEndDate === "null" || req.body.recurringEndDate === "") {
        req.body.recurringEndDate = null;
      }
      
      if (req.body.recurringFrequency === "null" || req.body.recurringFrequency === "") {
        req.body.recurringFrequency = null;
      }
      
      // Handle mileage fields
      if (req.body.pickupMileage === "null" || req.body.pickupMileage === "" || req.body.pickupMileage === null) {
        req.body.pickupMileage = null;
      } else if (req.body.pickupMileage) {
        const parsed = parseInt(req.body.pickupMileage);
        req.body.pickupMileage = isNaN(parsed) ? null : parsed;
      }
      
      if (req.body.returnMileage === "null" || req.body.returnMileage === "" || req.body.returnMileage === null) {
        req.body.returnMileage = null;
      } else if (req.body.returnMileage) {
        const parsed = parseInt(req.body.returnMileage);
        req.body.returnMileage = isNaN(parsed) ? null : parsed;
      }
      
      // Handle fuel-related fields
      // fuelLevelPickup and fuelLevelReturn are text strings (e.g., "full", "1/2", "empty")
      if (req.body.fuelLevelPickup === "null" || req.body.fuelLevelPickup === "" || req.body.fuelLevelPickup === null || req.body.fuelLevelPickup === "not_recorded") {
        req.body.fuelLevelPickup = null;
      }
      
      if (req.body.fuelLevelReturn === "null" || req.body.fuelLevelReturn === "" || req.body.fuelLevelReturn === null || req.body.fuelLevelReturn === "not_recorded") {
        req.body.fuelLevelReturn = null;
      }
      
      // fuelCost is numeric
      if (req.body.fuelCost === "null" || req.body.fuelCost === "" || req.body.fuelCost === null) {
        req.body.fuelCost = null;
      } else if (req.body.fuelCost) {
        const parsed = parseFloat(req.body.fuelCost);
        req.body.fuelCost = isNaN(parsed) ? null : parsed;
      }
      
      // Handle nullable fuel text fields
      if (req.body.fuelCardNumber === "null" || req.body.fuelCardNumber === "") {
        req.body.fuelCardNumber = null;
      }
      
      if (req.body.fuelNotes === "null" || req.body.fuelNotes === "") {
        req.body.fuelNotes = null;
      }
      
      // Normalize contractNumber: trim or null
      if (req.body.contractNumber === "null" || req.body.contractNumber === "" || req.body.contractNumber === null) {
        req.body.contractNumber = null;
      } else if (typeof req.body.contractNumber === "string") {
        req.body.contractNumber = req.body.contractNumber.trim();
      }

      // If contractNumber is being set, verify it's not in use by another reservation
      if (req.body.contractNumber) {
        const existing = await storage.getReservation(id);
        // Only validate when the value actually changes
        if (existing && existing.contractNumber !== req.body.contractNumber) {
          const all = await storage.getAllReservations();
          const duplicate = all.find(
            (r) => r.id !== id && r.contractNumber === req.body.contractNumber,
          );
          if (duplicate) {
            return res.status(409).json({
              message: `Contract number "${req.body.contractNumber}" is already used by reservation #${duplicate.id}.`,
              code: "DUPLICATE_CONTRACT_NUMBER",
              conflictingReservationId: duplicate.id,
            });
          }
        }
      }

      // For updates, bypass full schema validation and just use the raw data
      // This allows partial updates without requiring all fields
      const reservationData = req.body;

      // Load the existing reservation once so we can diff contract-relevant
      // fields after the update and trigger contract PDF regeneration.
      const existingReservationForDiff = await storage.getReservation(id);
      if (!existingReservationForDiff) {
        return res.status(404).json({ message: "Reservation not found" });
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

      // Check for conflicts only if vehicle, startDate or endDate are being updated
      if (reservationData.vehicleId && reservationData.startDate) {
        // Reuse the loaded reservation for the conflict check
        const existingReservation = existingReservationForDiff;
        
        // Determine if this is a maintenance block - check both the update data and existing reservation
        const isMaintenanceBlock = (reservationData.type === 'maintenance_block') || 
                                   (existingReservation.type === 'maintenance_block');
        
        const conflicts = await storage.checkReservationConflicts(
          reservationData.vehicleId,
          reservationData.startDate,
          reservationData.endDate || null,
          id,
          isMaintenanceBlock,
          reservationData.startTime,
          reservationData.endTime
        );
        
        if (conflicts.length > 0) {
          return res.status(409).json({ 
            message: "Reservation conflicts with existing bookings",
            conflicts
          });
        }
      }
      
      // Add user tracking information for updates
      const user = req.user;
      const dataWithTracking = {
        ...reservationData,
        updatedBy: user ? user.username : null
      };
      
      const reservation = await storage.updateReservation(id, dataWithTracking);
      
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
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
      
      res.json(reservation);
    } catch (error) {
      console.error("Error updating reservation:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid reservation data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to update reservation", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });

  // ==================== SPARE VEHICLE MANAGEMENT ROUTES ====================
  
  // Get available spare vehicles for a date range
  app.get("/api/spare-vehicles/available", requireAuth, async (req: Request, res: Response) => {
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
      
      // Get the reservation to find the vehicle
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      
      // Mark the vehicle for service
      const updatedVehicle = await storage.markVehicleForService(
        reservation.vehicleId, 
        maintenanceStatus, 
        maintenanceNote
      );
      
      if (!updatedVehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Create maintenance block if dates provided
      if (serviceStartDate) {
        await storage.createMaintenanceBlock(
          reservation.vehicleId,
          serviceStartDate,
          serviceEndDate
        );
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
      
      res.json({
        message: "Spare vehicle assigned successfully",
        replacementReservation
      });
      
    } catch (error) {
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
  app.patch("/api/reservations/:id/spare-status", requireAuth, async (req: Request, res: Response) => {
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

      if (reservation.vehicle.currentMileage && mileage < reservation.vehicle.currentMileage) {
        if (!allowMileageDecrease || !overridePassword) {
          return res.status(400).json({ 
            message: `Mileage decrease detected (${mileage} < ${reservation.vehicle.currentMileage}). Override authorization required.`,
            requiresOverride: true
          });
        }

        const user = (req as any).user;
        if (!user) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const storedHash = await storage.getMileageOverridePasswordHash(user.id);
        if (!storedHash) {
          return res.status(403).json({ 
            message: "No mileage override password set. Please set one in your profile first." 
          });
        }

        const { verifyPassword } = await import('./utils/auth');
        const isValidOverride = await verifyPassword(overridePassword, storedHash);
        
        if (!isValidOverride) {
          return res.status(403).json({ 
            message: "Invalid override password" 
          });
        }

        console.log(`✅ Mileage override authorized for user ${user.username}: ${mileage} km (was ${reservation.vehicle.currentMileage} km)`);
      }

      const updatedReservation = await storage.pickupReservation(reservationId, {
        contractNumber: contractNumber.trim(),
        pickupMileage: mileage,
        fuelLevelPickup,
        pickupDate,
        pickupNotes
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
        const { generateRentalContractFromTemplate, generateRentalContract } = await import('./utils/pdf-generator');

        let template = null;
        if (templateId) {
          template = await storage.getPdfTemplate(parseInt(templateId));
        }

        if (!template) {
          const allTemplates = await storage.getAllPdfTemplates();
          template = allTemplates.find(t => t.isDefault) || allTemplates[0];
        }

        if (!template) {
          // No custom template configured — fall back to the built-in default
          // contract layout so a "Contract (Unsigned)" document is still produced
          // (the pickup dialog always tells the user a contract was generated).
          console.warn(
            `⚠️ No PDF contract template configured for reservation ${reservationId} — using built-in default contract layout. ` +
            `Add a template under Documents → Contract Templates to customize it.`
          );
        }

        if (updatedReservation.vehicle) {
          console.log(
            template
              ? `📝 Generating contract for reservation ${reservationId} using template ${template.id}`
              : `📝 Generating contract for reservation ${reservationId} using built-in default template`
          );

          const contractPdf = template
            ? await generateRentalContractFromTemplate(updatedReservation, template)
            : await generateRentalContract(updatedReservation);

          const sanitizedPlate = updatedReservation.vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
          const uploadsDir = getUploadsDir();
          const contractsDir = path.join(uploadsDir, sanitizedPlate, 'contracts');
          
          if (!fs.existsSync(contractsDir)) {
            fs.mkdirSync(contractsDir, { recursive: true });
          }
          
          const timestamp = Date.now();
          const dateString = pickupDate || new Date().toISOString().split('T')[0];
          const fileName = `${sanitizedPlate}_contract_pickup_${dateString}_${timestamp}.pdf`;
          const filePath = path.join(contractsDir, fileName);
          const relativePath = path.relative(uploadsDir, filePath);
          
          fs.writeFileSync(filePath, contractPdf);
          console.log(`✅ Contract saved to ${relativePath}`);
          
          contractDocument = await storage.createDocument({
            vehicleId: updatedReservation.vehicleId,
            reservationId: updatedReservation.id,
            documentType: 'Contract (Unsigned)',
            fileName: fileName,
            filePath: relativePath,
            fileSize: contractPdf.length,
            contentType: 'application/pdf',
            uploadedBy: (req as any).user?.username || 'system'
          });
          
          console.log(`✅ Contract document registered in database`);
        }
      } catch (pdfError) {
        console.error("Error generating contract PDF:", pdfError);
      }

      res.json({
        ...updatedReservation,
        contractDocument
      });
    } catch (error) {
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

      // Update vehicle availability to "available" after return
      if (updatedReservation.vehicleId) {
        await storage.updateVehicle(updatedReservation.vehicleId, {
          availabilityStatus: 'available',
          currentMileage: mileage,
          currentFuelLevel: fuelLevelReturn
        });
        console.log(`✅ Vehicle ${updatedReservation.vehicleId} set to available after return`);
      }

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
              const startD = new Date(updatedReservation.startDate);
              const endD = updatedReservation.endDate
                ? new Date(updatedReservation.endDate)
                : new Date(startD.getTime() + 7 * 24 * 60 * 60 * 1000);
              damageCheckReservationData = {
                contractNumber: (updatedReservation as any).contractNumber || '',
                customerName: customerForCheck
                  ? `${(customerForCheck as any).firstName || ''} ${(customerForCheck as any).lastName || ''}`.trim() ||
                    (customerForCheck as any).name || ''
                  : '',
                startDate: format(startD, 'dd-MM-yyyy'),
                endDate: format(endD, 'dd-MM-yyyy'),
                rentalDays: Math.max(
                  1,
                  Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)),
                ),
              };
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
            
            const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
            const uploadsDir = getUploadsDir();
            const damageCheckDir = path.join(uploadsDir, sanitizedPlate, 'damage-checks');
            
            if (!fs.existsSync(damageCheckDir)) {
              fs.mkdirSync(damageCheckDir, { recursive: true });
            }
            
            const timestamp = Date.now();
            const dateString = returnDate || new Date().toISOString().split('T')[0];
            const fileName = `${sanitizedPlate}_damage_check_return_${dateString}_${timestamp}.pdf`;
            const filePath = path.join(damageCheckDir, fileName);
            const relativePath = path.relative(uploadsDir, filePath);
            
            fs.writeFileSync(filePath, damageCheckPdf);
            console.log(`✅ Damage check saved to ${relativePath}`);
            
            damageCheckDocument = await storage.createDocument({
              vehicleId: updatedReservation.vehicleId,
              reservationId: updatedReservation.id,
              documentType: 'Damage Check',
              fileName: fileName,
              filePath: relativePath,
              fileSize: damageCheckPdf.length,
              contentType: 'application/pdf',
              uploadedBy: (req as any).user?.username || 'system'
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
  app.post("/api/placeholder-reservations", requireAuth, async (req: Request, res: Response) => {
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
  app.get("/api/placeholder-reservations", requireAuth, async (req: Request, res: Response) => {
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
  app.get("/api/placeholder-reservations/needing-assignment", requireAuth, async (req: Request, res: Response) => {
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
  app.post("/api/placeholder-reservations/:id/assign-vehicle", requireAuth, async (req: Request, res: Response) => {
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
      
      res.json(updatedReservation);
      
    } catch (error) {
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

  // ==================== EXPENSE ROUTES ====================
  // Setup storage for expense receipt uploads
  const createExpenseReceiptStorage = async (req: Request, file: Express.Multer.File, callback: Function) => {
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
      const receiptsDir = path.join(baseDir, 'receipts');
      
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      if (!fs.existsSync(receiptsDir)) {
        fs.mkdirSync(receiptsDir, { recursive: true });
      }
      
      console.log(`Receipt upload storage: ${receiptsDir}`);
      callback(null, receiptsDir);
    } catch (error) {
      console.error("Error with expense receipt upload:", error);
      callback(error, false);
    }
  };

  // Configure multer for expense receipt uploads
  const expenseReceiptStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      createExpenseReceiptStorage(req, file, (err: any, result: any) => {
        if (err) return cb(err, '');
        cb(null, result);
      });
    },
    filename: async (req, file, cb) => {
      try {
        const timestamp = Date.now();
        const dateString = req.body.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const category = sanitizeFilename(req.body.category || 'unknown');
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const extension = path.extname(sanitizedOriginal) || '.pdf'; // Default to .pdf if no extension
        
        // Get vehicle license plate
        const vehicleId = parseInt(req.body.vehicleId);
        const vehicle = await storage.getVehicle(vehicleId);
        
        if (!vehicle) {
          throw new Error("Vehicle not found");
        }
        
        // Sanitize license plate for filename (remove spaces, etc.) - match the document pattern
        const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
        
        // Create filename with license plate, expense category, and date - match document pattern
        const fileName = `${sanitizedPlate}_receipt_${category.toLowerCase().replace(/\s+/g, '_')}_${dateString}_${timestamp}${extension}`;
        
        console.log(`Generated receipt filename: ${fileName}`);
        cb(null, fileName);
      } catch (error) {
        console.error("Error creating filename for expense receipt:", error);
        // Fallback to simple timestamped name if there's an error - match document pattern
        const timestamp = Date.now();
        const dateString = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const category = sanitizeFilename(req.body.category || 'unknown');
        const sanitizedOriginal = sanitizeFilename(file.originalname);
        const extension = path.extname(sanitizedOriginal) || '.pdf'; // Default to .pdf if no extension
        const fallbackName = `receipt_${category.toLowerCase().replace(/\s+/g, '_')}_${dateString}_${timestamp}${extension}`;
        console.log(`Using fallback receipt filename: ${fallbackName}`);
        cb(null, fallbackName);
      }
    }
  });
  
  // Configure multer for expense receipt uploads with enhanced security
  const expenseReceiptUpload = multer({
    storage: expenseReceiptStorage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for PDFs and images
    },
    fileFilter: createSecureMulterFilter('document'),
  });

  // Delete reservation (soft delete with user tracking)
  app.delete("/api/reservations/:id", requireAuth, async (req: Request, res: Response) => {
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
      
      // If this is a maintenance block, also delete related replacement reservations
      if (reservation.type === 'maintenance_block') {
        console.log(`🔧 Deleting maintenance block ${id} - checking for related spare vehicle reservations...`);
        
        // Get all reservations to find related replacements
        const allReservations = await storage.getAllReservations();
        
        // Find all customer rentals on the same vehicle that overlap with the maintenance
        const maintenanceStart = new Date(reservation.startDate);
        const maintenanceEnd = reservation.endDate ? new Date(reservation.endDate) : new Date('9999-12-31');
        
        const affectedRentals = allReservations.filter(r => 
          r.id !== id && 
          !r.deletedAt &&
          r.vehicleId === reservation.vehicleId &&
          r.type === 'standard' &&
          r.customerId !== null
        ).filter(r => {
          const rentalStart = new Date(r.startDate);
          const rentalEnd = r.endDate ? new Date(r.endDate) : new Date('9999-12-31');
          return rentalStart <= maintenanceEnd && rentalEnd >= maintenanceStart;
        });
        
        console.log(`📋 Found ${affectedRentals.length} customer rentals affected by this maintenance`);
        
        // Find all replacement reservations for these affected rentals
        const affectedRentalIds = affectedRentals.map(r => r.id);
        const replacementsToDelete = allReservations.filter(r =>
          r.type === 'replacement' &&
          r.replacementForReservationId !== null &&
          affectedRentalIds.includes(r.replacementForReservationId) &&
          !r.deletedAt
        );
        
        console.log(`🚗 Found ${replacementsToDelete.length} spare vehicle reservations to delete`);
        
        // Delete all related replacement reservations and their notifications
        for (const replacement of replacementsToDelete) {
          await storage.updateReservation(replacement.id, softDeleteData);
          realtimeEvents.reservations.deleted({ id: replacement.id });
          
          // Delete associated spare assignment notification if this was a placeholder
          if (replacement.placeholderSpare) {
            await storage.deleteNotificationsByTypeAndPattern("spare_assignment", `[placeholder:${replacement.id}]`);
            console.log(`🔔 Deleted spare assignment notification for placeholder ${replacement.id}`);
          }
          
          console.log(`✅ Deleted spare vehicle reservation ${replacement.id}`);
        }
      }
      
      // Delete the main reservation
      const updatedReservation = await storage.updateReservation(id, softDeleteData);
      if (updatedReservation) {
        // If this was a placeholder spare reservation, delete its notification
        if (reservation.placeholderSpare && reservation.type === 'replacement') {
          await storage.deleteNotificationsByTypeAndPattern("spare_assignment", `[placeholder:${id}]`);
          console.log(`🔔 Deleted spare assignment notification for placeholder ${id}`);
        }
        
        // Sync vehicle availability status after deleting reservation
        await storage.syncVehicleAvailabilityWithReservations();
        
        // Broadcast real-time update to all connected clients
        realtimeEvents.reservations.deleted({ id });
        
        res.status(200).json({ 
          message: "Reservation deleted successfully",
          deletedBy: user ? user.username : 'Unknown'
        });
      } else {
        res.status(500).json({ message: "Failed to delete reservation" });
      }
    } catch (error) {
      console.error("Error deleting reservation:", error);
      res.status(500).json({ 
        message: "Failed to delete reservation", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.get("/api/expenses/recent", hasPermission(UserPermission.MANAGE_EXPENSES), async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const expenses = await storage.getRecentExpenses(limit);
    res.json(expenses);
  });
  
  // Get expenses by vehicle - This MUST come before the generic :id route
  app.get("/api/expenses/vehicle/:vehicleId", hasPermission(UserPermission.MANAGE_EXPENSES), async (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }
    
    console.log(`Getting expenses for vehicle ID: ${vehicleId}`);
    const expenses = await storage.getExpensesByVehicle(vehicleId);
    res.json(expenses);
  });
  
  // Get all expenses
  app.get("/api/expenses", hasPermission(UserPermission.MANAGE_EXPENSES), async (req, res) => {
    // Prevent caching to ensure fresh data is always returned
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const expenses = await storage.getAllExpenses();
    res.json(expenses);
  });

  // Get single expense - This MUST come after the more specific routes
  app.get("/api/expenses/:id", hasPermission(UserPermission.MANAGE_EXPENSES), async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid expense ID" });
    }

    const expense = await storage.getExpense(id);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.json(expense);
  });
  
  // Get expense receipt
  app.get("/api/expenses/:id/receipt", async (req: Request, res: Response) => {
    try {
      const expense = await storage.getExpense(parseInt(req.params.id));
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }

      if (!expense.receiptFilePath) {
        return res.status(404).json({ error: "No receipt file found for this expense" });
      }

      // Check if file exists
      const filePath = path.resolve(expense.receiptFilePath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Receipt file not found on disk" });
      }

      // Serve the file
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error("Error serving receipt file:", err);
          res.status(500).json({ error: "Failed to serve receipt file" });
        }
      });
    } catch (error) {
      console.error("Error retrieving expense receipt:", error);
      res.status(500).json({ error: "Failed to retrieve expense receipt" });
    }
  });

  // Delete expense
  app.delete("/api/expenses/:id", hasPermission(UserPermission.MANAGE_EXPENSES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }
      
      // Get the expense first to check if it exists
      const expense = await storage.getExpense(id);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Delete the expense
      const success = await storage.deleteExpense(id);
      
      if (success) {
        // Broadcast real-time update to all connected clients
        realtimeEvents.expenses.deleted({ id });
        
        res.status(200).json({ message: "Expense deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete expense" });
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ 
        message: "Failed to delete expense", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Create expense with receipt upload
  app.post("/api/expenses", hasPermission(UserPermission.MANAGE_EXPENSES), expenseReceiptUpload.single('receiptFile'), async (req: Request, res: Response) => {
    try {
      // Post-upload validation if file was uploaded
      if (req.file) {
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'document'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ message: fileValidation.error });
        }
      }
      
      // Convert vehicleId to number, but leave amount as string for schema validation
      if (req.body.vehicleId) req.body.vehicleId = parseInt(req.body.vehicleId);
      // We don't convert amount because the schema now handles both string and number
      
      console.log("Standard endpoint - data being passed to schema:", req.body);
      const expenseData = insertExpenseSchema.parse(req.body);
      
      // Add user tracking information
      const user = req.user;
      const dataWithTracking = {
        ...expenseData,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null,
        receiptPath: req.file ? getRelativePath(req.file.path) : null
      };
      
      // Create expense record
      const expense = await storage.createExpense(dataWithTracking);
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.expenses.created(expense);
      
      res.status(201).json(expense);
    } catch (error) {
      console.error("Error creating expense:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid expense data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to create expense", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });
  
  // Create expense with receipt upload (Dedicated endpoint for file uploads)
  app.post("/api/expenses/with-receipt", expenseReceiptUpload.single('receiptFile'), async (req, res) => {
    try {
      console.log("Handling expense with receipt upload");
      console.log("Request body:", req.body);
      console.log("File info:", req.file);
      
      // Post-upload validation if file was uploaded
      if (req.file) {
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'document'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ message: fileValidation.error });
        }
      }
      
      // Convert vehicleId to number, but leave amount as string for schema validation
      if (req.body.vehicleId) req.body.vehicleId = parseInt(req.body.vehicleId);
      // We don't convert amount because the schema now handles both string and number
      
      console.log("Data being passed to schema:", req.body);
      const expenseData = insertExpenseSchema.parse(req.body);
      console.log("Parsed expense data:", expenseData);
      
      // Add additional metadata from the uploaded file if present
      const additionalData: any = {};
      if (req.file) {
        console.log("Processing uploaded receipt file");
        additionalData.receiptPath = getRelativePath(req.file.path);
        additionalData.receiptFilePath = req.file.path;
        additionalData.receiptFileSize = req.file.size;
        additionalData.receiptContentType = req.file.mimetype;
        console.log("File metadata:", additionalData);
      } else {
        console.log("No receipt file found in request");
      }
      
      // Create expense record
      console.log("Creating expense record with data:", { ...expenseData, ...additionalData });
      const expense = await storage.createExpense({
        ...expenseData,
        ...additionalData
      });
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.expenses.created(expense);
      
      console.log("Expense created successfully:", expense);
      res.status(201).json(expense);
    } catch (error) {
      console.error("Error creating expense with receipt:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid expense data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to create expense", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });

  // Update expense with receipt upload
  app.patch("/api/expenses/:id", expenseReceiptUpload.single('receiptFile'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }

      // Post-upload validation if file was uploaded
      if (req.file) {
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'document'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ message: fileValidation.error });
        }
      }

      // Convert vehicleId to number, but leave amount as string for schema validation
      if (req.body.vehicleId) req.body.vehicleId = parseInt(req.body.vehicleId);
      // We don't convert amount because the schema now handles both string and number
      
      console.log("Update data being passed to schema:", req.body);
      const expenseData = insertExpenseSchema.parse(req.body);
      
      // Add additional metadata from the uploaded file if present
      const additionalData: any = {};
      if (req.file) {
        additionalData.receiptPath = getRelativePath(req.file.path);
        additionalData.receiptFilePath = req.file.path;
        additionalData.receiptFileSize = req.file.size;
        additionalData.receiptContentType = req.file.mimetype;
      }
      
      // Update expense record
      const expense = await storage.updateExpense(id, {
        ...expenseData,
        ...additionalData
      });
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.expenses.updated(expense);
      
      res.json(expense);
    } catch (error) {
      console.error("Error updating expense:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid expense data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to update expense", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });
  
  // Update expense with receipt upload (Dedicated endpoint for file uploads)
  app.patch("/api/expenses/:id/with-receipt", expenseReceiptUpload.single('receiptFile'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }

      // Post-upload validation if file was uploaded
      if (req.file) {
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'document'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ message: fileValidation.error });
        }
      }

      // Convert vehicleId to number, but leave amount as string for schema validation
      if (req.body.vehicleId) req.body.vehicleId = parseInt(req.body.vehicleId);
      // We don't convert amount because the schema now handles both string and number
      
      console.log("Update data being passed to schema:", req.body);
      const expenseData = insertExpenseSchema.parse(req.body);
      
      // Add additional metadata from the uploaded file if present
      const additionalData: any = {};
      if (req.file) {
        additionalData.receiptPath = getRelativePath(req.file.path);
        additionalData.receiptFilePath = req.file.path;
        additionalData.receiptFileSize = req.file.size;
        additionalData.receiptContentType = req.file.mimetype;
      }
      
      // Update expense record
      const expense = await storage.updateExpense(id, {
        ...expenseData,
        ...additionalData
      });
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.expenses.updated(expense);
      
      res.json(expense);
    } catch (error) {
      console.error("Error updating expense with receipt:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid expense data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to update expense", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });

  // ==================== VEHICLE-SPECIFIC CUSTOMER ROUTES ====================
  // Get customers who have rented a specific vehicle (for APK reminders, etc.)
  app.get('/api/vehicles/:vehicleId/customers-with-reservations', requireAuth, async (req: Request, res: Response) => {
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
  const createDocumentUploadStorage = async (req: Request, file: Express.Multer.File, callback: Function) => {
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
          return callback(new Error(`Failed to create upload directory: ${error.message}`), false);
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
        return callback(new Error(`Failed to create upload directory: ${error.message}`), false);
      }
    } catch (error) {
      console.error("Error with document upload:", error);
      callback(new Error(`Document upload error: ${error.message}`), false);
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
        
        // Get vehicle license plate
        const vehicleId = parseInt(req.body.vehicleId);
        const vehicle = await storage.getVehicle(vehicleId);
        
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
          
          // Match format used in contract generation route
          const newFilename = `${sanitizedPlate}_contract_${currentDate}${extension}`;
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
  const documentUpload = multer({
    storage: documentStorage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for documents
    },
    fileFilter: createSecureMulterFilter('document'),
  });

  // Get all documents
  app.get("/api/documents", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req, res) => {
    // Prevent caching to ensure fresh data is always returned
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const documents = await storage.getAllDocuments();
    res.json(documents);
  });

  // Get documents by vehicle
  app.get("/api/documents/vehicle/:vehicleId", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(vehicleId)) {
      return res.status(400).json({ message: "Invalid vehicle ID" });
    }

    const documents = await storage.getDocumentsByVehicle(vehicleId);
    res.json(documents);
  });

  // Get documents by reservation
  app.get("/api/documents/reservation/:reservationId", hasPermission(UserPermission.MANAGE_DOCUMENTS), async (req, res) => {
    const reservationId = parseInt(req.params.reservationId);
    if (isNaN(reservationId)) {
      return res.status(400).json({ message: "Invalid reservation ID" });
    }

    const documents = await storage.getDocumentsByReservation(reservationId);
    res.json(documents);
  });

  // Get all damage check documents (must be before :id route)
  app.get("/api/documents/damage-checks", hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const allDocuments = await storage.getAllDocuments();
      const damageChecks = allDocuments.filter(doc => isDamageCheckDocument(doc.documentType));
      res.json(damageChecks);
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

    res.json(document);
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
          error: error instanceof Error ? error.message : "Unknown error" 
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
        error: error instanceof Error ? error.message : "Unknown error" 
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

      // Convert relative path to absolute path (handles both with and without uploads/ prefix)
      let absolutePath = path.join(process.cwd(), document.filePath);
      
      // Check if file exists, try adding uploads/ prefix if not found
      if (!fs.existsSync(absolutePath)) {
        const altPath = path.join(process.cwd(), 'uploads', document.filePath);
        if (fs.existsSync(altPath)) {
          absolutePath = altPath;
        } else {
          console.error(`Document file not found: ${absolutePath} or ${altPath}`);
          return res.status(404).json({ message: "Document file not found on disk" });
        }
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
        error: error instanceof Error ? error.message : "Unknown error" 
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

      // Convert relative path to absolute path (handles both with and without uploads/ prefix)
      let absolutePath = path.join(process.cwd(), document.filePath);
      
      // Check if file exists, try adding uploads/ prefix if not found
      if (!fs.existsSync(absolutePath)) {
        const altPath = path.join(process.cwd(), 'uploads', document.filePath);
        if (fs.existsSync(altPath)) {
          absolutePath = altPath;
        } else {
          console.error(`Document file not found: ${absolutePath} or ${altPath}`);
          return res.status(404).json({ message: "Document file not found on disk" });
        }
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
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Email document - MailerSend integration 
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

      // Convert relative path to absolute path
      const absolutePath = path.join(process.cwd(), document.filePath);
      
      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ message: "Document file not found on disk" });
      }

      // Use MailerSend to send email with attachment
      const { MailerSend, EmailParams, Sender, Recipient, Attachment } = require("mailersend");

      const mailerSend = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
      });

      // Read file data for attachment
      const fileData = fs.readFileSync(absolutePath);
      const base64Data = fileData.toString('base64');

      // Parse recipients (comma-separated)
      const recipientList = recipients.split(',').map((email: string) => email.trim()).filter((email: string) => email);
      
      const sentFrom = new Sender("noreply@yourdomain.com", "Car Rental System");

      const recipients_list = recipientList.map((email: string) => new Recipient(email));

      // Create attachment
      const attachment = new Attachment(base64Data, document.fileName, "attachment");

      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo(recipients_list)
        .setSubject(subject)
        .setText(message || "Please find the attached document.")
        .setHtml(`<p>${(message || "Please find the attached document.").replace(/\n/g, '<br>')}</p>`)
        .setAttachments([attachment]);

      await mailerSend.email.send(emailParams);

      res.json({ 
        message: "Email sent successfully",
        recipients: recipientList.length,
        document: document.fileName
      });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ 
        message: "Failed to send email", 
        error: error instanceof Error ? error.message : "Email service error" 
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
        
        // Convert relative path to absolute path
        const absolutePath = path.join(process.cwd(), document.filePath);
        
        // Check if file exists
        if (!fs.existsSync(absolutePath)) {
          console.warn(`Document file not found: ${absolutePath}`);
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
        error: error instanceof Error ? error.message : "Email service error" 
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

      // Try to delete the file if it exists
      if (document.filePath) {
        // Convert relative path to absolute path
        const absolutePath = path.join(process.cwd(), document.filePath);
        console.log(`Attempting to delete file at: ${absolutePath}`);
        
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
          console.log(`File deleted successfully: ${absolutePath}`);
        } else {
          console.log(`File not found at: ${absolutePath}`);
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
        error: error instanceof Error ? error.message : "Unknown error" 
      });
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

      // For now, use the standard template while we debug the custom template implementation
      let pdfBuffer: Buffer;
      
      try {
        // First, try the custom template implementation
        const templateId = req.query.templateId ? parseInt(req.query.templateId as string) : undefined;
        
        if (templateId) {
          console.log(`Generating contract with template ID: ${templateId}`);
          const template = await storage.getPdfTemplate(templateId);
          
          if (template) {
            // Make sure the template fields are properly formatted
            let fieldsLength = 0;
            if (template.fields) {
              if (typeof template.fields === 'string') {
                try {
                  const parsedFields = JSON.parse(template.fields);
                  fieldsLength = parsedFields.length;
                  // Ensure template has fields property as parsed JSON
                  template.fields = parsedFields;
                } catch (e) {
                  console.error('Error parsing template fields:', e);
                }
              } else {
                fieldsLength = template.fields.length;
              }
            }
            
            console.log(`Template has ${fieldsLength} fields`);
            
            // Use the imported function from pdf-generator.ts
            const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
            pdfBuffer = await generateRentalContractFromTemplate(reservation, template);
            console.log("Successfully generated PDF with custom template");
          } else {
            console.log("Template not found, falling back to standard template");
            pdfBuffer = await generateRentalContract(reservation);
          }
        } else {
          // Try to get the default template first
          console.log("Attempting to get default template");
          const defaultTemplate = await storage.getDefaultPdfTemplate();
          
          if (defaultTemplate) {
            console.log(`Using default template: ${defaultTemplate.name} with ID: ${defaultTemplate.id}`);
            
            // Make sure the template fields are properly formatted
            let fieldsLength = 0;
            if (defaultTemplate.fields) {
              if (typeof defaultTemplate.fields === 'string') {
                try {
                  const parsedFields = JSON.parse(defaultTemplate.fields);
                  fieldsLength = parsedFields.length;
                  // Ensure template has fields property as parsed JSON
                  defaultTemplate.fields = parsedFields;
                } catch (e) {
                  console.error('Error parsing template fields:', e);
                }
              } else {
                fieldsLength = defaultTemplate.fields.length;
              }
            }
            
            console.log(`Template has ${fieldsLength} fields`);
            
            const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
            pdfBuffer = await generateRentalContractFromTemplate(reservation, defaultTemplate);
          } else {
            // No default template found
            console.log("No default template found in database, using standard template");
            
            // Check all templates for debugging
            const allTemplates = await storage.getAllPdfTemplates();
            console.log(`Found ${allTemplates.length} total templates:`);
            for (const template of allTemplates) {
              console.log(`  - Template ID ${template.id}: "${template.name}" (isDefault: ${template.isDefault})`);
            }
            
            pdfBuffer = await generateRentalContract(reservation);
          }
        }
      } catch (error) {
        console.error("Error using custom template:", error);
        // Fall back to the old fixed template format
        pdfBuffer = await generateRentalContract(reservation);
      }
      
      // Save a copy of the contract PDF to the contracts folder and register it as a document
      try {
        // Get vehicle license plate for folder structure
        if (reservation.vehicle && reservation.vehicle.licensePlate) {
          // Ensure we remove ALL special characters including dashes for contract folders/filenames
          const sanitizedPlate = reservation.vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
          const contractsBaseDir = path.join(getUploadsDir(), 'contracts');
          const vehicleContractsDir = path.join(contractsBaseDir, sanitizedPlate);
          
          console.log(`Saving contract for vehicle with license plate: ${reservation.vehicle.licensePlate}`);
          console.log(`Sanitized plate: ${sanitizedPlate}`);
          console.log(`Contracts base directory: ${contractsBaseDir}`);
          console.log(`Vehicle contracts directory: ${vehicleContractsDir}`);
          
          // Create directories if they don't exist
          if (!fs.existsSync(contractsBaseDir)) {
            console.log(`Creating base contracts directory: ${contractsBaseDir}`);
            fs.mkdirSync(contractsBaseDir, { recursive: true });
          }
          
          if (!fs.existsSync(vehicleContractsDir)) {
            console.log(`Creating vehicle contracts directory: ${vehicleContractsDir}`);
            fs.mkdirSync(vehicleContractsDir, { recursive: true });
          }
          
          // Format date for filename
          const today = new Date();
          const currentDate = today.getFullYear().toString() + 
                             (today.getMonth() + 1).toString().padStart(2, '0') + 
                             today.getDate().toString().padStart(2, '0');
          
          const contractNumber = `C-${reservationId}-${currentDate}`;
          
          // Create a unique filename based on license plate and date
          const filename = `${sanitizedPlate}_contract_${currentDate}.pdf`;
          const filePath = path.join(vehicleContractsDir, filename);
          
          console.log(`Saving contract to file: ${filePath}`);
          
          // Save the file
          fs.writeFileSync(filePath, pdfBuffer);
          console.log(`Contract successfully saved to: ${filePath}`);
          
          // Register the contract as a document entry
          try {
            // Create document entry for the contract
            const documentData = {
              vehicleId: reservation.vehicleId,
              reservationId: reservationId, // Link to reservation
              documentType: 'Contract (Unsigned)', // Mark as unsigned
              fileName: filename,
              filePath: getRelativePath(filePath),
              fileSize: pdfBuffer.length,
              contentType: 'application/pdf',
              createdBy: req.user ? req.user.username : 'System',
              notes: `Auto-generated unsigned contract for reservation #${reservationId}`
            };
            
            // Check for existing unsigned contracts for this reservation to determine version number
            const existingDocs = await storage.getDocumentsByReservation(reservationId);
            const existingContracts = existingDocs.filter(doc => 
              doc.documentType?.startsWith('Contract (Unsigned)')
            );
            
            // Determine version number
            let versionNumber = 1;
            if (existingContracts.length > 0) {
              // Extract version numbers from existing contracts
              const versions = existingContracts.map(doc => {
                const match = doc.documentType?.match(/Contract \(Unsigned\)(?: (\d+))?/);
                return match && match[1] ? parseInt(match[1]) : 1;
              });
              versionNumber = Math.max(...versions) + 1;
            }
            
            // Update document type with version number if > 1
            if (versionNumber > 1) {
              documentData.documentType = `Contract (Unsigned) ${versionNumber}`;
              documentData.notes = `Auto-generated unsigned contract (version ${versionNumber}) for reservation #${reservationId}`;
            }
            
            const document = await storage.createDocument(documentData);
            console.log(`✅ Created document entry for unsigned contract (version ${versionNumber}): ID ${document.id}`);
            
            // Broadcast real-time update to all connected clients
            realtimeEvents.documents.created(document);
          } catch (docError) {
            console.error('Error registering contract as document:', docError);
            // Continue even if document registration fails
          }
        } else {
          console.log('Cannot save contract: Vehicle or license plate is missing');
        }
      } catch (error) {
        console.error('Error saving contract PDF copy:', error);
        console.error(error); // Print full error
        // Continue even if saving a copy fails
      }
      
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
        error: error instanceof Error ? error.message : "Unknown error" 
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
      const pdfBuffer = await generateRentalContractFromTemplate(previewData, template);
      
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
        error: error instanceof Error ? error.message : String(error) 
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
        error: error instanceof Error ? error.message : String(error) 
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

      // Get driver data if provided
      let driver = null;
      if (driverId) {
        driver = await storage.getDriver(driverId);
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

      // Create contract data with current form values
      const contractData = {
        id: reservationId,
        vehicleId,
        customerId,
        driverId,
        startDate,
        endDate,
        notes: notes || "",
        status: "pending",
        totalPrice: 0,
        vehicle,
        customer,
        driver
      };

      console.log("Generating versioned contract with current form data");

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
      const pdfBuffer = await generateRentalContractFromTemplate(contractData, template);
      
      // Save as versioned document
      if (vehicle) {
        try {
          const sanitizedPlate = vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '');
          const contractsBaseDir = path.join(getUploadsDir(), 'contracts');
          const vehicleContractsDir = path.join(contractsBaseDir, sanitizedPlate);
          
          // Create directories if they don't exist
          if (!fs.existsSync(contractsBaseDir)) {
            fs.mkdirSync(contractsBaseDir, { recursive: true });
          }
          
          if (!fs.existsSync(vehicleContractsDir)) {
            fs.mkdirSync(vehicleContractsDir, { recursive: true });
          }
          
          // Format date for filename
          const today = new Date();
          const currentDate = today.getFullYear().toString() + 
                             (today.getMonth() + 1).toString().padStart(2, '0') + 
                             today.getDate().toString().padStart(2, '0');
          
          // Create a unique filename based on license plate and date
          const filename = `${sanitizedPlate}_contract_${currentDate}.pdf`;
          const filePath = path.join(vehicleContractsDir, filename);
          
          // Save the file
          fs.writeFileSync(filePath, pdfBuffer);
          console.log(`Contract successfully saved to: ${filePath}`);
          
          // Check for existing unsigned contracts for this reservation to determine version number
          const existingDocs = await storage.getDocumentsByReservation(reservationId);
          const existingContracts = existingDocs.filter(doc => 
            doc.documentType?.startsWith('Contract (Unsigned)')
          );
          
          // Determine version number
          let versionNumber = 1;
          if (existingContracts.length > 0) {
            // Extract version numbers from existing contracts
            const versions = existingContracts.map(doc => {
              const match = doc.documentType?.match(/Contract \(Unsigned\)(?: (\d+))?/);
              return match && match[1] ? parseInt(match[1]) : 1;
            });
            versionNumber = Math.max(...versions) + 1;
          }
          
          // Create document entry for the contract
          const documentData = {
            vehicleId: vehicleId,
            reservationId: reservationId,
            documentType: versionNumber > 1 ? `Contract (Unsigned) ${versionNumber}` : 'Contract (Unsigned)',
            fileName: filename,
            filePath: getRelativePath(filePath),
            fileSize: pdfBuffer.length,
            contentType: 'application/pdf',
            createdBy: req.user ? req.user.username : 'System',
            notes: versionNumber > 1 
              ? `Auto-generated unsigned contract (version ${versionNumber}) with current form data for reservation #${reservationId}`
              : `Auto-generated unsigned contract with current form data for reservation #${reservationId}`
          };
          
          const document = await storage.createDocument(documentData);
          console.log(`✅ Created document entry for unsigned contract (version ${versionNumber}): ID ${document.id}`);
          
          // Broadcast real-time update to all connected clients
          realtimeEvents.documents.created(document);
        } catch (docError) {
          console.error('Error registering contract as document:', docError);
          // Continue even if document registration fails
        }
      }
      
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
        error: error instanceof Error ? error.message : String(error) 
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

      // Get the default PDF template
      const defaultTemplate = await storage.getDefaultPdfTemplate();
      
      let pdfBuffer: Buffer;
      
      if (defaultTemplate) {
        console.log(`Generating contract with default template: ${defaultTemplate.name} (ID: ${defaultTemplate.id})`);
        
        // Make sure the template fields are properly formatted
        if (defaultTemplate.fields && typeof defaultTemplate.fields === 'string') {
          try {
            const parsedFields = JSON.parse(defaultTemplate.fields);
            defaultTemplate.fields = parsedFields;
          } catch (e) {
            console.error('Error parsing default template fields:', e);
          }
        }
        
        // Use the imported function from pdf-generator.ts
        const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
        pdfBuffer = await generateRentalContractFromTemplate(reservation, defaultTemplate);
        console.log("Successfully generated PDF with default template");
      } else {
        console.log("No default template found, using standard template");
        // Fall back to standard template if no default template is available
        const { generateRentalContract } = await import('./utils/pdf-generator');
        pdfBuffer = await generateRentalContract(reservation);
      }
      
      // Save the unsigned contract to documents (linked to both reservation and vehicle)
      if (reservation.vehicleId && reservation.vehicle) {
        try {
          const timestamp = Date.now();
          const dateString = format(new Date(), 'yyyy-MM-dd');
          // Guard against missing license plate
          const licensePlate = reservation.vehicle.licensePlate || 'UNKNOWN';
          const sanitizedPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '');
          const documentType = 'Contract (Unsigned)';
          
          // Create directory structure for contracts
          const vehicleDir = path.join(uploadsDir, sanitizedPlate, 'contracts');
          if (!fs.existsSync(vehicleDir)) {
            fs.mkdirSync(vehicleDir, { recursive: true });
          }
          
          // Generate filename
          const fileName = `${sanitizedPlate}_Contract_Unsigned_${dateString}_${timestamp}.pdf`;
          const filePath = path.join(vehicleDir, fileName);
          const relativeFilePath = `uploads/${sanitizedPlate}/contracts/${fileName}`;
          
          // Write PDF to file system
          fs.writeFileSync(filePath, pdfBuffer);
          console.log(`✅ Saved unsigned contract to: ${relativeFilePath}`);
          
          // Create document record linked to both reservation and vehicle
          const documentData = {
            vehicleId: reservation.vehicleId,
            reservationId: reservationId,
            documentType: documentType,
            fileName: fileName,
            filePath: relativeFilePath,
            fileSize: pdfBuffer.length,
            contentType: 'application/pdf',
            uploadDate: new Date().toISOString(),
            notes: 'Auto-generated unsigned contract',
            createdBy: req.user?.username || 'system'
          };
          
          const savedDocument = await storage.createDocument(documentData);
          console.log(`✅ Created document record for unsigned contract`);
          
          // Broadcast real-time update to all connected clients
          realtimeEvents.documents.created(savedDocument);
        } catch (saveError) {
          // Log the error but don't fail the PDF download
          console.error('⚠️ Error saving contract to documents (PDF will still download):', saveError);
        }
      }
      
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
        error: error instanceof Error ? error.message : "Unknown error" 
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
        error: error instanceof Error ? error.message : "Unknown error" 
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
        vehicle.vehicleType
      );
      
      let damageTemplate = templates.length > 0 ? templates[0] : null;
      
      if (!damageTemplate) {
        damageTemplate = await storage.getDefaultDamageCheckTemplate();
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
        buildYear: vehicle.productionDate,
        fuel: vehicle.fuel || undefined,
        mileage: vehicle.mileage || undefined,
      };

      // Prepare reservation data
      let reservationData;
      if (reservation.customer) {
        const startDate = new Date(reservation.startDate);
        const endDate = reservation.endDate ? new Date(reservation.endDate) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        const rentalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        reservationData = {
          contractNumber: `C-${reservationId}-${format(new Date(), 'yyyyMMdd')}`,
          customerName: `${reservation.customer.firstName} ${reservation.customer.lastName}`,
          startDate: format(startDate, 'dd-MM-yyyy'),
          endDate: format(endDate, 'dd-MM-yyyy'),
          rentalDays
        };
      }

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

      // Save the damage check to documents (linked to both reservation and vehicle)
      if (reservation.vehicleId && reservation.vehicle) {
        try {
          const timestamp = Date.now();
          const dateString = format(new Date(), 'yyyy-MM-dd');
          const licensePlate = reservation.vehicle.licensePlate || 'UNKNOWN';
          const sanitizedPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '');
          
          // Create directory structure for damage checks
          const vehicleDir = path.join(uploadsDir, sanitizedPlate, 'damage-checks');
          if (!fs.existsSync(vehicleDir)) {
            fs.mkdirSync(vehicleDir, { recursive: true });
          }
          
          // Check for existing damage checks for this reservation to determine version number
          const existingDocs = await storage.getDocumentsByReservation(reservationId);
          const existingDamageChecks = existingDocs.filter(doc => 
            doc.documentType?.startsWith('Damage Check (Unsigned)')
          );
          
          // Determine version number
          let versionNumber = 1;
          if (existingDamageChecks.length > 0) {
            const versions = existingDamageChecks.map(doc => {
              const match = doc.documentType?.match(/Damage Check \(Unsigned\)(?: (\d+))?/);
              return match && match[1] ? parseInt(match[1]) : 1;
            });
            versionNumber = Math.max(...versions) + 1;
          }
          
          // Generate filename with version
          const versionSuffix = versionNumber > 1 ? `_v${versionNumber}` : '';
          const fileName = `${sanitizedPlate}_DamageCheck_Unsigned_${dateString}${versionSuffix}_${timestamp}.pdf`;
          const filePath = path.join(vehicleDir, fileName);
          const relativeFilePath = `uploads/${sanitizedPlate}/damage-checks/${fileName}`;
          
          // Write PDF to file system
          fs.writeFileSync(filePath, pdfBuffer);
          console.log(`✅ Saved unsigned damage check to: ${relativeFilePath}`);
          
          // Create document record linked to both reservation and vehicle
          const documentType = versionNumber > 1 
            ? `Damage Check (Unsigned) ${versionNumber}`
            : 'Damage Check (Unsigned)';
          
          const documentData = {
            vehicleId: reservation.vehicleId,
            reservationId: reservationId,
            documentType: documentType,
            fileName: fileName,
            filePath: relativeFilePath,
            fileSize: pdfBuffer.length,
            contentType: 'application/pdf',
            uploadDate: new Date().toISOString(),
            notes: versionNumber > 1 
              ? `Auto-generated unsigned damage check (version ${versionNumber})`
              : 'Auto-generated unsigned damage check',
            createdBy: req.user?.username || 'system'
          };
          
          const savedDocument = await storage.createDocument(documentData);
          console.log(`✅ Created document record for unsigned damage check (version ${versionNumber})`);
          
          // Broadcast real-time update to all connected clients
          realtimeEvents.documents.created(savedDocument);
        } catch (saveError) {
          console.error('⚠️ Error saving damage check to documents (PDF will still download):', saveError);
        }
      }
      
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
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // ==================== PDF TEMPLATES ====================
  // Get all PDF templates
  app.get("/api/pdf-templates", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllPdfTemplates();
      // Disable caching to ensure fresh data after uploads
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(templates);
    } catch (error) {
      console.error("Error fetching PDF templates:", error);
      res.status(500).json({ 
        message: "Failed to fetch PDF templates", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get the default PDF template
  app.get("/api/pdf-templates/default", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const defaultTemplate = await storage.getDefaultPdfTemplate();
      if (!defaultTemplate) {
        return res.status(404).json({ message: "No default template found" });
      }

      res.json(defaultTemplate);
    } catch (error) {
      console.error("Error fetching default PDF template:", error);
      res.status(500).json({ 
        message: "Failed to fetch default template", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get a specific PDF template
  app.get("/api/pdf-templates/:id", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const template = await storage.getPdfTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching PDF template:", error);
      res.status(500).json({ 
        message: "Failed to fetch PDF template", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Generate preview PDF for template editor
  app.get("/api/pdf-templates/:id/preview", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      
      const template = await storage.getPdfTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Create a dummy reservation for preview purposes
      const dummyReservation: Reservation = {
        id: 0, // Use 0 to indicate preview mode
        vehicleId: 0,
        customerId: 0,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days later
        totalPrice: 750,
        status: 'Booked',
        notes: 'Preview reservation',
        vehicle: {
          id: 0,
          brand: 'Preview Brand',
          model: 'Preview Model',
          licensePlate: 'XX-YY-99',
          chassisNumber: 'PREVIEW123456789',
          currentMileage: 10000,
        },
        customer: {
          id: 0,
          name: 'Preview Customer',
          address: 'Preview Street 123',
          city: 'Preview City',
          postalCode: '1234 AB',
          phone: '0612345678',
          email: 'preview@example.com',
          driverLicenseNumber: 'PREV123456789',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: null,
      };
      
      // Make sure the template fields are properly formatted
      let fieldsLength = 0;
      if (template.fields) {
        if (typeof template.fields === 'string') {
          try {
            const parsedFields = JSON.parse(template.fields);
            fieldsLength = parsedFields.length;
            // Ensure template has fields property as parsed JSON
            template.fields = parsedFields;
          } catch (e) {
            console.error('Error parsing template fields:', e);
          }
        } else {
          fieldsLength = template.fields.length;
        }
      }
      
      console.log(`Preview template has ${fieldsLength} fields`);
      
      // Import necessary functions
      const { generateRentalContractFromTemplate } = await import('./utils/pdf-generator');
      
      // Generate PDF with the template
      const pdfBuffer = await generateRentalContractFromTemplate(dummyReservation, template);
      
      // Set headers for PDF display in browser (not forcing download)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=template_preview_${id}.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF buffer
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating template preview:", error);
      res.status(500).json({ 
        message: "Failed to generate template preview", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Create a new PDF template
  app.post("/api/pdf-templates", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      // Add user tracking information
      const user = req.user;
      
      const templateData = insertPdfTemplateSchema.parse({
        ...req.body,
        createdBy: user ? user.username : null
      });
      
      const template = await storage.createPdfTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating PDF template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid template data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to create PDF template", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });

  // Update a PDF template
  app.patch("/api/pdf-templates/:id", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      // Get existing template
      const template = await storage.getPdfTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Add user tracking information
      const user = req.user;
      
      // Log what we received from frontend
      console.log('🔍 PATCH /api/pdf-templates - Received from frontend:', {
        id,
        hasBackgroundPath: 'backgroundPath' in req.body,
        backgroundPathValue: req.body.backgroundPath,
        keys: Object.keys(req.body)
      });
      
      // Process the request body to ensure fields are properly formatted
      const requestBody = { ...req.body };
      
      // Convert fields to string if it's an object (this fixes the date handling issue)
      if (requestBody.fields && typeof requestBody.fields === 'object') {
        requestBody.fields = JSON.stringify(requestBody.fields);
      }
      
      // Remove any undefined or invalid date properties to prevent database errors
      if (requestBody.updatedAt && !(requestBody.updatedAt instanceof Date)) {
        delete requestBody.updatedAt;
      }
      
      // CRITICAL: Keep backgroundPath as-is from frontend
      // The storage layer will handle the camelCase→snake_case conversion
      // If backgroundPath is explicitly null, keep it to clear the background
      // If it's undefined, delete it to preserve existing value
      if (requestBody.backgroundPath === undefined) {
        delete requestBody.backgroundPath;
      }
      
      const templateData = {
        ...requestBody,
        updatedBy: user ? user.username : null
      };
      
      console.log('📤 Sending to storage layer:', {
        id,
        hasBackgroundPath: 'backgroundPath' in templateData,
        backgroundPathValue: templateData.backgroundPath,
        keys: Object.keys(templateData),
        fields: templateData.fields ? 'JSON string' : undefined
      });
      
      const updatedTemplate = await storage.updatePdfTemplate(id, templateData);
      if (!updatedTemplate) {
        return res.status(404).json({ message: "Failed to update template" });
      }
      
      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating PDF template:", error);
      res.status(400).json({ 
        message: "Failed to update PDF template", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Delete a PDF template
  app.delete("/api/pdf-templates/:id", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      // Get template to check if it exists
      const template = await storage.getPdfTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const deleted = await storage.deletePdfTemplate(id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete template" });
      }

      res.status(200).json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting PDF template:", error);
      res.status(500).json({ 
        message: "Failed to delete template", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Configure multer for template background uploads (memory storage) with enhanced security
  const templateBackgroundUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit for backgrounds
    },
    fileFilter: createSecureMulterFilter('document'),
  });

  // Upload template background
  app.post("/api/pdf-templates/:id/background", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), templateBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No background file provided" });
      }

      // Get template to verify it exists
      const template = await storage.getPdfTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Post-upload validation for memory-based upload - validate buffer before saving
      const bufferValidation = await validateFileBuffer(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        'document'
      );
      if (!bufferValidation.valid) {
        return res.status(400).json({ message: bufferValidation.error });
      }

      // ALWAYS use filesystem storage (same as contract PDFs)
      // Works reliably on both Replit and Coolify/Docker
      console.log('💾 Saving template background to local filesystem');
      
      const templatesDir = path.join(uploadsDir, 'templates');

      // Delete old background file if it exists (skip default template)
      if (template.backgroundPath && !template.backgroundPath.includes('rental_contract_template.pdf')) {
        const oldBackgroundPath = path.join(process.cwd(), template.backgroundPath);
        try {
          await fs.promises.unlink(oldBackgroundPath);
          console.log(`🗑️ Deleted old background: ${oldBackgroundPath}`);
        } catch (error) {
          console.error("Error deleting old background file:", error);
        }
      }

      // Save file to filesystem
      const ext = path.extname(req.file.originalname);
      const filename = `template_${id}_background${ext}`;
      const filePath = path.join(templatesDir, filename);
      
      console.log(`📤 Saving background to: ${filePath}`);
      
      await fs.promises.writeFile(filePath, req.file.buffer);
      
      // Verify file was written
      const fileExists = fs.existsSync(filePath);
      if (!fileExists) {
        throw new Error('File write verification failed');
      }
      
      const stats = fs.statSync(filePath);
      console.log(`✅ Background saved successfully (${stats.size} bytes)`);
      
      // Store relative path (like contract PDFs)
      const backgroundPath = path.relative(process.cwd(), filePath);
      console.log(`📝 Storing relative path in database: ${backgroundPath}`);

      // If PDF, generate preview image for editor
      let backgroundPreviewPath: string | null = null;
      if (ext.toLowerCase() === '.pdf') {
        try {
          console.log('🖼️ PDF detected, generating preview image...');
          const { convertPdfToPng, getPreviewPath } = await import('./utils/pdf-to-image');
          const previewPath = path.join(templatesDir, `template_${id}_background_preview.png`);
          await convertPdfToPng(filePath, previewPath);
          backgroundPreviewPath = path.relative(process.cwd(), previewPath);
          console.log(`✅ Preview image generated: ${backgroundPreviewPath}`);
        } catch (error) {
          console.error('⚠️ Failed to generate preview image:', error);
          // Continue without preview - PDF will still work for generation
        }
      } else {
        // For image files (PNG/JPG), use the same file for preview
        backgroundPreviewPath = backgroundPath;
        console.log('🖼️ Image file detected, using same file for preview');
      }

      // Update template with background and preview paths
      const updatedTemplate = await storage.updatePdfTemplate(id, {
        backgroundPath,
        backgroundPreviewPath
      });

      if (!updatedTemplate) {
        return res.status(404).json({ message: "Failed to update template" });
      }

      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error uploading template background:", error);
      res.status(400).json({ 
        message: "Failed to upload template background", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Remove template background (reset to default)
  app.delete("/api/pdf-templates/:id/background", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const template = await storage.getPdfTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Delete the custom background file if it exists (filesystem only)
      if (template.backgroundPath && !template.backgroundPath.includes('rental_contract_template.pdf')) {
        try {
          const backgroundPath = path.join(process.cwd(), template.backgroundPath);
          await fs.promises.unlink(backgroundPath);
          console.log(`🗑️ Deleted background from filesystem: ${backgroundPath}`);
        } catch (error) {
          console.error("Error deleting background:", error);
        }
      }

      // Delete the preview image if it exists
      if ((template as any).backgroundPreviewPath) {
        try {
          const previewPath = path.join(process.cwd(), (template as any).backgroundPreviewPath);
          await fs.promises.unlink(previewPath);
          console.log(`🗑️ Deleted preview image from filesystem: ${previewPath}`);
        } catch (error) {
          console.error("Error deleting preview image:", error);
        }
      }

      // Update template to remove background paths (will use default)
      const updatedTemplate = await storage.updatePdfTemplate(id, {
        backgroundPath: null,
        backgroundPreviewPath: null
      } as any);

      if (!updatedTemplate) {
        return res.status(404).json({ message: "Failed to update template" });
      }

      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error removing template background:", error);
      res.status(500).json({ 
        message: "Failed to remove template background", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // ==================== TEMPLATE BACKGROUND LIBRARY ROUTES ====================
  // Get all backgrounds across all templates (global/shared library)
  app.get("/api/pdf-templates/backgrounds/all", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const backgrounds = await storage.getAllTemplateBackgrounds();
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching all template backgrounds:", error);
      res.status(500).json({ 
        message: "Failed to fetch template backgrounds", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get all backgrounds for a specific template
  app.get("/api/pdf-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const backgrounds = await storage.getTemplateBackgrounds(templateId);
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching template backgrounds:", error);
      res.status(500).json({ 
        message: "Failed to fetch template backgrounds", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Add a background to the template library
  app.post("/api/pdf-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), templateBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Background name is required" });
      }

      const template = await storage.getPdfTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Post-upload validation for memory-based upload - validate buffer before saving
      const bufferValidation = await validateFileBuffer(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        'document'
      );
      if (!bufferValidation.valid) {
        return res.status(400).json({ message: bufferValidation.error });
      }

      // Save file to filesystem (same pattern as regular background upload)
      console.log('💾 Saving background to library filesystem');
      
      const templatesDir = path.join(uploadsDir, 'templates');
      const ext = path.extname(req.file.originalname);
      
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const filename = `template_${templateId}_${safeName}_${timestamp}${ext}`;
      const filePath = path.join(templatesDir, filename);
      
      console.log(`📤 Saving background to: ${filePath}`);
      
      // Write file from buffer (memory storage)
      await fs.promises.writeFile(filePath, req.file.buffer);
      
      // Verify file was written
      const fileExists = fs.existsSync(filePath);
      if (!fileExists) {
        throw new Error('File write verification failed');
      }
      
      const stats = fs.statSync(filePath);
      console.log(`✅ Background saved successfully (${stats.size} bytes)`);
      
      // Store relative path
      const backgroundPath = path.relative(process.cwd(), filePath);
      console.log(`📝 Storing relative path in database: ${backgroundPath}`);

      // Generate preview image if uploaded file is a PDF
      let previewPath = backgroundPath;
      if (ext.toLowerCase() === '.pdf') {
        try {
          console.log('🖼️ PDF detected, generating preview image...');
          const { convertPdfToPng } = await import('./utils/pdf-to-image');
          const previewFilename = `template_${templateId}_${safeName}_${timestamp}_preview.png`;
          const previewFullPath = path.join(templatesDir, previewFilename);
          
          await convertPdfToPng(filePath, previewFullPath);
          previewPath = path.relative(process.cwd(), previewFullPath);
          console.log(`✅ Preview image generated: ${previewPath}`);
        } catch (error) {
          console.error('⚠️ Failed to generate preview image:', error);
          // Continue without preview
        }
      } else {
        // For image files, use same file for preview
        console.log('🖼️ Image file detected, using same file for preview');
      }

      // Add background to library
      const background = await storage.createTemplateBackground({
        templateId,
        name,
        backgroundPath,
        previewPath
      });

      res.status(201).json(background);
    } catch (error) {
      console.error("Error adding background to library:", error);
      res.status(400).json({ 
        message: "Failed to add background to library", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Select a background from the library (set as active)
  app.post("/api/pdf-templates/:id/backgrounds/:backgroundId/select", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const backgroundId = parseInt(req.params.backgroundId);
      
      if (isNaN(templateId) || isNaN(backgroundId)) {
        return res.status(400).json({ message: "Invalid template or background ID" });
      }

      const updatedTemplate = await storage.selectTemplateBackground(templateId, backgroundId);
      
      if (!updatedTemplate) {
        return res.status(404).json({ message: "Template or background not found" });
      }

      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error selecting background:", error);
      res.status(500).json({ 
        message: "Failed to select background", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Delete a background from the library
  app.delete("/api/pdf-templates/:id/backgrounds/:backgroundId", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const backgroundId = parseInt(req.params.backgroundId);
      
      if (isNaN(templateId) || isNaN(backgroundId)) {
        return res.status(400).json({ message: "Invalid template or background ID" });
      }

      // Get background to retrieve file paths before deletion
      const background = await storage.getTemplateBackground(backgroundId);
      if (!background) {
        return res.status(404).json({ message: "Background not found" });
      }

      // Delete the background files from filesystem
      try {
        const backgroundPath = path.join(process.cwd(), background.backgroundPath);
        await fs.promises.unlink(backgroundPath);
        console.log(`🗑️ Deleted background file: ${backgroundPath}`);
      } catch (error) {
        console.error("Error deleting background file:", error);
      }

      // Delete the preview image if different from background
      if (background.previewPath !== background.backgroundPath) {
        try {
          const previewPath = path.join(process.cwd(), background.previewPath);
          await fs.promises.unlink(previewPath);
          console.log(`🗑️ Deleted preview file: ${previewPath}`);
        } catch (error) {
          console.error("Error deleting preview file:", error);
        }
      }

      // Delete from database
      const deleted = await storage.deleteTemplateBackground(backgroundId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Background not found" });
      }

      res.json({ message: "Background deleted successfully" });
    } catch (error) {
      console.error("Error deleting background:", error);
      res.status(500).json({ 
        message: "Failed to delete background", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // ==================== CUSTOM NOTIFICATIONS ROUTES ====================
  // Get all custom notifications
  app.get("/api/custom-notifications", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const notifications = await storage.getAllCustomNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching custom notifications:", error);
      res.status(500).json({ 
        message: "Failed to fetch custom notifications", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get unread custom notifications
  app.get("/api/custom-notifications/unread", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const notifications = await storage.getUnreadCustomNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching unread custom notifications:", error);
      res.status(500).json({ 
        message: "Failed to fetch unread custom notifications", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get custom notifications by type
  app.get("/api/custom-notifications/type/:type", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const type = req.params.type;
      const notifications = await storage.getCustomNotificationsByType(type);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching custom notifications by type:", error);
      res.status(500).json({ 
        message: "Failed to fetch custom notifications by type", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get custom notifications for current user
  app.get("/api/custom-notifications/user", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const notifications = await storage.getCustomNotificationsByUser(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching user custom notifications:", error);
      res.status(500).json({ 
        message: "Failed to fetch user custom notifications", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get single custom notification
  app.get("/api/custom-notifications/:id", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const notification = await storage.getCustomNotification(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json(notification);
    } catch (error) {
      console.error("Error fetching custom notification:", error);
      res.status(500).json({ 
        message: "Failed to fetch custom notification", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Create a new custom notification
  app.post("/api/custom-notifications", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      // Add user info to notification data
      const notificationData = {
        ...req.body,
        createdBy: req.user.username
      };
      
      // Ensure isRead is set to false for new notifications
      notificationData.isRead = false;
      
      const notification = await storage.createCustomNotification(notificationData);
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.notifications.created(notification);
      
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating custom notification:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid notification data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to create custom notification", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });

  // Update a custom notification
  app.patch("/api/custom-notifications/:id", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      // Get existing notification
      const notification = await storage.getCustomNotification(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      // Update with user info
      const notificationData = {
        ...req.body,
        updatedBy: req.user.username
      };
      
      const updatedNotification = await storage.updateCustomNotification(id, notificationData);
      if (!updatedNotification) {
        return res.status(404).json({ message: "Failed to update notification" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.notifications.updated(updatedNotification);
      
      res.json(updatedNotification);
    } catch (error) {
      console.error("Error updating custom notification:", error);
      res.status(400).json({ 
        message: "Failed to update custom notification", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Mark notification as read
  app.post("/api/custom-notifications/:id/read", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const success = await storage.markCustomNotificationAsRead(id);
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      // Get the updated notification to return
      const updatedNotification = await storage.getCustomNotification(id);
      res.json(updatedNotification || { success: true, message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ 
        message: "Failed to mark notification as read", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Mark notification as unread
  app.post("/api/custom-notifications/:id/unread", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const success = await storage.markCustomNotificationAsUnread(id);
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      // Get the updated notification to return
      const updatedNotification = await storage.getCustomNotification(id);
      res.json(updatedNotification || { success: true, message: "Notification marked as unread" });
    } catch (error) {
      console.error("Error marking notification as unread:", error);
      res.status(500).json({ 
        message: "Failed to mark notification as unread", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Delete a custom notification
  app.delete("/api/custom-notifications/:id", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const deleted = await storage.deleteCustomNotification(id);
      if (!deleted) {
        return res.status(404).json({ message: "Notification not found" });
      }

      // Broadcast real-time update to all connected clients
      realtimeEvents.notifications.deleted({ id });

      res.status(200).json({ message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Error deleting custom notification:", error);
      res.status(500).json({ 
        message: "Failed to delete notification", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Invoice scanning endpoint
  app.post("/api/expenses/scan", hasPermission(UserPermission.MANAGE_EXPENSES), upload.single('invoice'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No invoice file provided" });
      }

      const file = req.file;
      const vehicleId = req.body.vehicleId ? parseInt(req.body.vehicleId) : null;

      // Post-upload validation - verify file content is actually a PDF
      const fileValidation = await validateAfterUpload(
        file.path,
        file.originalname,
        file.mimetype,
        'pdf'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ message: fileValidation.error });
      }

      // Validate vehicle ID if provided
      if (vehicleId) {
        const vehicle = await storage.getVehicle(vehicleId);
        if (!vehicle) {
          fs.unlinkSync(file.path);
          return res.status(404).json({ message: "Vehicle not found" });
        }
      }

      try {
        // Process invoice with AI
        console.log('Processing invoice:', file.originalname);
        const parsedInvoice = await processInvoiceWithAI(file.path);

        // Validate the parsed result
        const validation = validateParsedInvoice(parsedInvoice);
        if (!validation.valid) {
          // Clean up file but still return the parsed data for manual correction
          fs.unlinkSync(file.path);
          return res.status(400).json({
            message: "Invoice validation failed",
            errors: validation.errors,
            parsedData: parsedInvoice
          });
        }

        // Generate hash to check for duplicates
        const invoiceHash = generateInvoiceHash(parsedInvoice);

        // Move file to permanent location with hash-based filename
        const permanentDir = path.join(getUploadsDir(), 'invoices');
        if (!fs.existsSync(permanentDir)) {
          fs.mkdirSync(permanentDir, { recursive: true });
        }

        const permanentPath = path.join(permanentDir, `${invoiceHash}.pdf`);
        fs.renameSync(file.path, permanentPath);

        // Return parsed invoice data
        res.json({
          success: true,
          invoice: parsedInvoice,
          invoiceHash,
          filePath: getRelativePath(permanentPath),
          suggestedVehicleId: vehicleId
        });

      } catch (processingError) {
        // Clean up file on processing error
        fs.unlinkSync(file.path);
        console.error('Invoice processing error:', processingError);
        res.status(500).json({
          message: "Failed to process invoice",
          error: processingError instanceof Error ? processingError.message : "Unknown processing error"
        });
      }

    } catch (error) {
      console.error("Error scanning invoice:", error);
      // Clean up file if it exists
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        message: "Failed to scan invoice",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Create expenses from scanned invoice
  app.post("/api/expenses/from-invoice", hasPermission(UserPermission.MANAGE_EXPENSES), async (req: Request, res: Response) => {
    try {
      const { invoice, vehicleId, filePath, invoiceHash, lineItems } = req.body;

      // Validate required fields
      if (!invoice || !vehicleId || !lineItems || !Array.isArray(lineItems)) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Validate vehicle exists
      const vehicle = await storage.getVehicle(parseInt(vehicleId));
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // Check for duplicates using invoice hash
      if (invoiceHash) {
        // This is a simple check - in production you might want to store invoice hashes in the database
        console.log('Invoice hash for duplicate check:', invoiceHash);
      }

      const createdExpenses = [];
      const currentUser = (req as any).user?.username || 'system';

      // Create expenses from line items
      for (const lineItem of lineItems) {
        try {
          const expenseData = {
            vehicleId: parseInt(vehicleId),
            category: lineItem.category || 'Other',
            amount: lineItem.amount?.toString() || '0',
            date: invoice.invoiceDate || new Date().toISOString().split('T')[0],
            description: `${lineItem.description} (Invoice: ${invoice.invoiceNumber || 'N/A'} - ${invoice.vendor || 'Unknown'})`,
            receiptFilePath: filePath || null,
            createdBy: currentUser,
            updatedBy: null
          };

          // Validate expense data
          const validatedData = insertExpenseSchema.parse(expenseData);
          const expense = await storage.createExpense(validatedData);
          createdExpenses.push(expense);

        } catch (itemError) {
          console.error('Error creating expense for line item:', lineItem, itemError);
          // Continue with other items even if one fails
        }
      }

      if (createdExpenses.length === 0) {
        return res.status(400).json({ message: "No expenses could be created" });
      }

      res.json({
        success: true,
        message: `Successfully created ${createdExpenses.length} expense(s)`,
        expenses: createdExpenses,
        invoice: {
          vendor: invoice.vendor,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          totalAmount: invoice.totalAmount
        }
      });

    } catch (error) {
      console.error("Error creating expenses from invoice:", error);
      res.status(500).json({
        message: "Failed to create expenses from invoice",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ==================== BACKUP SETTINGS ROUTES ====================
  
  // Get backup settings
  app.get("/api/backup-settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const settings = await storage.getBackupSettings();
      if (!settings) {
        return res.status(404).json({ error: "No backup settings found" });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error getting backup settings:", error);
      res.status(500).json({ error: "Failed to get backup settings" });
    }
  });

  // Create or update backup settings
  app.post("/api/backup-settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const settingsData = {
        ...req.body,
        createdBy: currentUser?.username || 'system',
        updatedBy: currentUser?.username || 'system'
      };

      const settings = await storage.createBackupSettings(settingsData);
      res.json(settings);
    } catch (error) {
      console.error("Error creating backup settings:", error);
      res.status(500).json({ error: "Failed to create backup settings" });
    }
  });

  // Update backup settings
  app.put("/api/backup-settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const currentUser = req.user as any;
      const settingsData = {
        ...req.body,
        updatedBy: currentUser?.username || 'system'
      };

      const settings = await storage.updateBackupSettings(id, settingsData);
      if (!settings) {
        return res.status(404).json({ error: "Backup settings not found" });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error updating backup settings:", error);
      res.status(500).json({ error: "Failed to update backup settings" });
    }
  });

  // ==================== BACKUP ROUTES ====================
  
  // Simple download app data (database only)
  app.get("/api/backups/download-data", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `car-rental-data-${timestamp}.sql`;
      const filepath = path.join(process.cwd(), 'temp', filename);
      
      // Create temp directory if it doesn't exist
      await fs.promises.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });
      
      // Export database using pg_dump
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }
      
      // Use pg_dump to export the database
      await execAsync(`pg_dump "${databaseUrl}" > "${filepath}"`);
      
      // Send file
      res.download(filepath, filename, async (err) => {
        // Clean up temp file after download
        try {
          await fs.promises.unlink(filepath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
        
        if (err) {
          console.error('Error sending file:', err);
        }
      });
    } catch (error) {
      console.error("Error downloading app data:", error);
      res.status(500).json({ 
        error: "Failed to download app data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Simple download app code (source files)
  app.get("/api/backups/download-code", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `car-rental-code-${timestamp}.tar.gz`;
      const filepath = path.join(process.cwd(), 'temp', filename);
      
      // Create temp directory if it doesn't exist
      await fs.promises.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });
      
      // Create tar.gz of source code excluding node_modules, .git, temp, backups, uploads
      const excludes = [
        '--exclude=node_modules',
        '--exclude=.git',
        '--exclude=temp',
        '--exclude=backups',
        '--exclude=uploads',
        '--exclude=*.log',
        '--exclude=.env',
        '--exclude=.env.*',
        '--exclude=cookies.txt',
        '--exclude=dist',
        '--exclude=build'
      ].join(' ');
      
      await execAsync(`tar -czf "${filepath}" ${excludes} -C "${process.cwd()}" .`);
      
      // Send file
      res.download(filepath, filename, async (err) => {
        // Clean up temp file after download
        try {
          await fs.promises.unlink(filepath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
        
        if (err) {
          console.error('Error sending file:', err);
        }
      });
    } catch (error) {
      console.error("Error downloading app code:", error);
      res.status(500).json({ 
        error: "Failed to download app code",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Restore app data from uploaded SQL file
  app.post("/api/backups/restore-data", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const os = await import('os');
      const execAsync = promisify(exec);

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      console.log('🔄 Starting database restore from:', req.file.path);
      console.log('📊 File size:', req.file.size, 'bytes');

      // The scheduled backups are written as .sql.gz, and .gz is an accepted
      // upload extension, but psql cannot read gzip. Restoring one used to drop
      // every table and only then fail on the binary, leaving an empty database
      // with nothing to roll back to. Decompress first, and verify the result
      // actually looks like a dump *before* anything is dropped.
      let restoreFilePath = req.file.path;
      let decompressedPath: string | null = null;

      const header = Buffer.alloc(2);
      const fd = await fs.promises.open(req.file.path, 'r');
      try {
        await fd.read(header, 0, 2, 0);
      } finally {
        await fd.close();
      }

      if (header[0] === 0x1f && header[1] === 0x8b) {
        const { createGunzip } = await import('zlib');
        const { pipeline } = await import('stream/promises');
        decompressedPath = path.join(os.tmpdir(), `restore-${Date.now()}.sql`);
        console.log('📦 Backup is gzipped — decompressing before restore');
        await pipeline(
          fs.createReadStream(req.file.path),
          createGunzip(),
          fs.createWriteStream(decompressedPath)
        );
        restoreFilePath = decompressedPath;
      }

      // Refuse anything that is not recognisably a SQL dump, while the existing
      // data is still intact.
      const probe = await fs.promises.readFile(restoreFilePath, { encoding: 'utf8', flag: 'r' })
        .then(text => text.slice(0, 4096))
        .catch(() => '');
      if (!/PostgreSQL database dump|CREATE TABLE|SET statement_timeout|INSERT INTO|COPY /i.test(probe)) {
        if (decompressedPath) {
          try { await fs.promises.unlink(decompressedPath); } catch {}
        }
        return res.status(400).json({
          error: 'That file does not look like a PostgreSQL dump, so the restore was cancelled. Nothing was changed.',
        });
      }

      // This route drops every table and restores over it, bypassing
      // backupService.restoreDatabase entirely - it has its own destructive
      // path, so it needs its own safety net. Take and verify a fresh backup
      // of the CURRENT database before anything is dropped. If this can't be
      // done, refuse to restore rather than proceed with no way back.
      const safety = await backupService.takeSafetyBackup('database');

      // Step 1: Drop all tables with CASCADE to remove dependencies
      console.log('🗑️ Dropping all existing tables...');
      const dropTablesQuery = `
        DO $$ DECLARE
          r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
        END $$;
      `;
      
      // Write query to a temp file to avoid shell escaping issues with $$
      const dropScriptPath = path.join(os.tmpdir(), `drop-tables-${Date.now()}.sql`);
      await fs.promises.writeFile(dropScriptPath, dropTablesQuery);
      
      try {
        await execAsync(`psql "${databaseUrl}" -f "${dropScriptPath}"`);
        console.log('✅ All tables dropped');
      } finally {
        // Clean up temp file
        try {
          await fs.promises.unlink(dropScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Step 2: Restore database using psql
      console.log('📥 Restoring database from backup...');
      const { stdout, stderr } = await execAsync(
        `psql "${databaseUrl}" -f "${restoreFilePath}" 2>&1`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large restores
      );

      if (stdout) {
        console.log('📝 psql stdout:', stdout.substring(0, 1000)); // Log first 1000 chars
      }
      if (stderr) {
        console.log('⚠️ psql stderr:', stderr.substring(0, 1000));
      }

      console.log('✅ Database restore completed successfully');

      // Clean up uploaded file
      try {
        await fs.promises.unlink(req.file.path);
        if (decompressedPath) await fs.promises.unlink(decompressedPath);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }

      res.json({
        success: true,
        message: 'Database restored successfully. Please refresh your browser and log in again.',
        safetyBackupFilename: safety.filename,
      });
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      console.error("❌ Error restoring app data:", error);
      // Surface the real reason (e.g. "Refusing to restore: ...") as `error`,
      // not a fixed generic string - both restore-data and restore-files are
      // read by client code that only looks at error.error, so a fixed string
      // here silently swallowed the safety-backup guard's refusal message and
      // made it indistinguishable from any other failure.
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore app data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Restore app code from uploaded tar.gz file
  app.post("/api/backups/restore-code", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Extract tar.gz to current directory (will overwrite existing files)
      await execAsync(`tar -xzf "${req.file.path}" -C "${process.cwd()}"`);

      // Clean up uploaded file
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }

      res.json({
        success: true,
        message: 'Code restored successfully. The application will restart automatically.',
      });

      // Restart the application after a short delay
      setTimeout(() => {
        process.exit(0); // PM2 or the process manager will restart the app
      }, 2000);
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }
      
      console.error("Error restoring app code:", error);
      res.status(500).json({ 
        error: "Failed to restore app code",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Download uploaded files (uploads directory)
  app.get("/api/backups/download-files", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `car-rental-files-${timestamp}.tar.gz`;
      const filepath = path.join(process.cwd(), 'temp', filename);
      
      // Create temp directory if it doesn't exist
      await fs.promises.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });
      
      const uploadsDir = path.join(process.cwd(), 'uploads');
      
      // Check if uploads directory exists
      try {
        await fs.promises.access(uploadsDir);
      } catch {
        // If uploads directory doesn't exist, create an empty archive
        await execAsync(`tar -czf "${filepath}" -T /dev/null`);
        return res.download(filepath, filename, async (err) => {
          try {
            await fs.promises.unlink(filepath);
          } catch (cleanupError) {
            console.error('Error cleaning up temp file:', cleanupError);
          }
          if (err) {
            console.error('Error sending file:', err);
          }
        });
      }
      
      // Create tar.gz of uploads directory
      await execAsync(`tar -czf "${filepath}" -C "${process.cwd()}" uploads`);
      
      // Send file
      res.download(filepath, filename, async (err) => {
        // Clean up temp file after download
        try {
          await fs.promises.unlink(filepath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
        
        if (err) {
          console.error('Error sending file:', err);
        }
      });
    } catch (error) {
      console.error("Error downloading uploaded files:", error);
      res.status(500).json({ 
        error: "Failed to download uploaded files",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Restore uploaded files from tar.gz archive
  app.post("/api/backups/restore-files", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // This route extracts straight over uploads/, bypassing
      // backupService.restoreFiles entirely - it has its own destructive
      // path, so it needs its own safety net. Take and verify a fresh backup
      // of the CURRENT uploads/ before anything is overwritten. If this can't
      // be done, refuse to restore rather than proceed with no way back.
      const safety = await backupService.takeSafetyBackup('files');

      // Extract tar.gz to current directory (will restore uploads folder)
      await execAsync(`tar -xzf "${req.file.path}" -C "${process.cwd()}"`);

      // Clean up uploaded file
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }

      res.json({
        success: true,
        message: 'All uploaded files have been restored successfully.',
        safetyBackupFilename: safety.filename,
      });
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      console.error("Error restoring uploaded files:", error);
      // Surface the real reason (e.g. "Refusing to restore: ...") as `error`,
      // not a fixed generic string - see the matching comment in
      // /api/backups/restore-data's catch block above.
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore uploaded files",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // List available backups
  app.get("/api/backups/list", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const type = req.query.type as 'database' | 'files' | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const backups = await backupService.listBackups(type);
      
      // Limit results if specified
      const limitedBackups = limit ? backups.slice(0, limit) : backups;
      
      res.json(limitedBackups);
    } catch (error) {
      console.error("Error listing backups:", error);
      res.status(500).json({ 
        error: "Failed to list backups",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Download a specific backup file
  app.get("/api/backups/download/:filename", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Security: prevent directory traversal
      if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      
      const backupSettings = await db.select().from(backupSettingsTable).limit(1);
      const settings = backupSettings[0];
      const backupPath = settings?.localPath || path.join(process.cwd(), 'backups');
      
      // Search for the file in the backup directory structure
      const findFile = (dir: string): string | null => {
        if (!fs.existsSync(dir)) return null;
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            const found = findFile(itemPath);
            if (found) return found;
          } else if (item === filename) {
            return itemPath;
          }
        }
        return null;
      };
      
      const filePath = findFile(backupPath);
      
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup file not found' });
      }
      
      // Send the file
      res.download(filePath, filename);
    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({ 
        error: "Failed to download backup",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get backup status
  app.get("/api/backups/status", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const status = await backupService.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting backup status:", error);
      res.status(500).json({ error: "Failed to get backup status" });
    }
  });

  // Get backup health (staleness) for UI warnings
  app.get("/api/backups/health", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const last = await backupService.getLastSuccessfulRun();
      const status = await backupService.getStatus();
      const lastSuccessAt = last?.finishedAt ? new Date(last.finishedAt).toISOString() : null;
      const ageHours = lastSuccessAt
        ? Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 3600000)
        : null;
      res.json({
        lastSuccessAt,
        ageHours,
        stale: ageHours === null || ageHours > 48,
        lastError: status.lastError ?? null,
      });
    } catch (error) {
      console.error('Error reading backup health:', error);
      res.status(500).json({ message: 'Error reading backup health' });
    }
  });

  // List available backups
  app.get("/api/backups", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const type = req.query.type as 'database' | 'files' | undefined;
      const backups = await backupService.listBackups(type);
      res.json(backups);
    } catch (error) {
      console.error("Error listing backups:", error);
      res.status(500).json({ error: "Failed to list backups" });
    }
  });

  // Run backup manually
  app.post("/api/backups/run", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const result = await backupService.runBackup();
      res.json({
        success: true,
        message: "Backup completed successfully",
        backups: result
      });
    } catch (error) {
      console.error("Error running backup:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to run backup" 
      });
    }
  });

  // Download backup file
  app.get("/api/backups/download/:type/:filename", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { type, filename } = req.params;
      
      if (!['database', 'files'].includes(type)) {
        return res.status(400).json({ error: "Invalid backup type" });
      }

      // Use BackupService to download from either storage type
      const result = await backupService.downloadBackup(filename, type as 'database' | 'files');
      
      if (!result) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', result.contentType);
      
      // Stream the file
      result.stream.pipe(res);
      
    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({ error: "Failed to download backup" });
    }
  });

  // Delete backup file
  app.delete("/api/backups/:type/:filename", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { type, filename } = req.params;
      
      if (!['database', 'files'].includes(type)) {
        return res.status(400).json({ error: "Invalid backup type" });
      }

      await backupService.deleteBackup(filename, type as 'database' | 'files');
      
      res.json({
        success: true,
        message: "Backup deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting backup:", error);
      res.status(500).json({ error: "Failed to delete backup" });
    }
  });

  // Cleanup old backups
  app.post("/api/backups/cleanup", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      await backupService.cleanupOldBackups();
      res.json({
        success: true,
        message: "Old backups cleaned up successfully"
      });
    } catch (error) {
      console.error("Error cleaning up backups:", error);
      res.status(500).json({ error: "Failed to cleanup old backups" });
    }
  });

  // Upload backup file
  app.post("/api/backups/upload", hasPermission(UserPermission.MANAGE_BACKUPS), backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No backup file provided" });
      }

      const file = req.file;
      const backupType = req.body.type; // 'database' or 'files'

      // Post-upload validation - verify file content matches backup type
      const fileValidation = await validateAfterUpload(
        file.path,
        file.originalname,
        file.mimetype,
        'backup'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
      }

      // Validate backup type
      if (!backupType || !['database', 'files'].includes(backupType)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: "Invalid or missing backup type. Must be 'database' or 'files'" });
      }

      // Validate file extension based on type
      const validExtensions = {
        database: ['.sql', '.sql.gz'],
        files: ['.tar.gz', '.tgz']
      };

      const fileExtension = file.originalname.toLowerCase();
      const isValidExtension = validExtensions[backupType as keyof typeof validExtensions].some(ext => 
        fileExtension.endsWith(ext)
      );

      if (!isValidExtension) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ 
          error: `Invalid file extension for ${backupType} backup. Expected: ${validExtensions[backupType as keyof typeof validExtensions].join(', ')}`
        });
      }

      // Create backup directory if it doesn't exist
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Generate a unique filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const originalName = file.originalname.replace(/\.[^/.]+$/, ""); // Remove extension
      const extension = file.originalname.substring(file.originalname.lastIndexOf('.'));
      const newFilename = `uploaded-${backupType}-${timestamp}-${originalName}${extension}`;
      const destinationPath = path.join(backupDir, newFilename);

      // Move the uploaded file to backups directory
      fs.renameSync(file.path, destinationPath);

      // Create manifest entry
      const manifest = {
        timestamp: new Date().toISOString(),
        type: backupType,
        filename: newFilename,
        size: fs.statSync(destinationPath).size,
        checksum: 'uploaded', // We could calculate actual checksum if needed
        metadata: {
          uploaded: true,
          originalName: file.originalname
        }
      };

      res.json({
        success: true,
        message: `${backupType} backup uploaded successfully`,
        backup: manifest
      });

    } catch (error) {
      // Clean up file on error
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Error uploading backup:", error);
      res.status(500).json({ 
        error: "Failed to upload backup",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ==================== BACKUP RESTORE ROUTES ====================
  
  // Restore database from backup
  app.post("/api/backups/restore/database", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { filename, confirmFilename } = req.body ?? {};

      if (!filename) {
        return res.status(400).json({ error: "Backup filename is required" });
      }

      // Restoring overwrites live data. Require the caller to type/echo the
      // exact backup filename before any destructive work begins.
      if (confirmFilename !== filename) {
        return res.status(400).json({
          error: 'Confirmation does not match. Type the exact backup filename to confirm this restore.',
        });
      }

      // Validation: check if backup exists
      const backups = await backupService.listBackups('database');
      const backupExists = backups.some(backup => backup.filename === filename);
      
      if (!backupExists) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      // Run restore
      const result = await backupService.restoreDatabase(filename);

      // The safety backup's own backup_runs row was recorded before the
      // restore ran, but a successful restore's --clean dump drops and
      // recreates every table, including backup_runs - so that row is gone
      // by the time this response is built. The file itself is still on disk
      // and findable via listBackups; surface its name here so the operator
      // isn't left guessing which file is their way back.
      res.json({
        success: true,
        message: "Database restore completed successfully",
        warning: "Please restart the application for changes to take full effect",
        safetyBackupFilename: result.safetyBackupFilename,
      });
    } catch (error) {
      console.error("Error restoring database:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore database"
      });
    }
  });

  // Restore files from backup
  app.post("/api/backups/restore/files", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      // targetPath is intentionally NOT accepted from the request body.
      // restoreFiles archives getUploadsDir() for its safety backup but would
      // extract into targetPath if given one - an unvalidated caller-supplied
      // path would let the safety net be taken over uploads/ while the
      // destructive tar --overwrite lands somewhere else entirely, defeating
      // the guard on exactly the path it exists to protect. Nothing in the UI
      // sends targetPath; restoreFiles(filename) always extracts to its
      // default (process.cwd()), matching where it archives from.
      const { filename } = req.body;

      if (!filename) {
        return res.status(400).json({ error: "Backup filename is required" });
      }

      // Validation: check if backup exists
      const backups = await backupService.listBackups('files');
      const backupExists = backups.some(backup => backup.filename === filename);

      if (!backupExists) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      // Run restore
      const result = await backupService.restoreFiles(filename);

      res.json({
        success: true,
        message: "Files restore completed successfully",
        safetyBackupFilename: result.safetyBackupFilename,
      });
    } catch (error) {
      console.error("Error restoring files:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to restore files"
      });
    }
  });

  // Complete system restore (database + files)
  app.post("/api/backups/restore/complete", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { databaseBackup, filesBackup, confirmDatabaseBackup, confirmFilesBackup } = req.body ?? {};

      if (!databaseBackup || !filesBackup) {
        return res.status(400).json({
          error: "Both database and files backup filenames are required"
        });
      }

      // This is the most destructive restore path (database + files). Require
      // the caller to type/echo both exact filenames before any destructive
      // work begins.
      if (confirmDatabaseBackup !== databaseBackup || confirmFilesBackup !== filesBackup) {
        return res.status(400).json({
          error: 'Confirmation does not match. Type the exact database and files backup filenames to confirm this restore.',
        });
      }

      // Validation: check if both backups exist
      const [databaseBackups, filesBackups] = await Promise.all([
        backupService.listBackups('database'),
        backupService.listBackups('files')
      ]);
      
      const dbBackupExists = databaseBackups.some(backup => backup.filename === databaseBackup);
      const filesBackupExists = filesBackups.some(backup => backup.filename === filesBackup);
      
      if (!dbBackupExists) {
        return res.status(404).json({ error: "Database backup file not found" });
      }
      
      if (!filesBackupExists) {
        return res.status(404).json({ error: "Files backup file not found" });
      }

      // Run complete restore
      const result = await backupService.restoreComplete(databaseBackup, filesBackup);

      // The database safety backup's own backup_runs row is dropped by the
      // --clean dump this restore just applied - the file survives on disk,
      // but the in-app trail doesn't. Surface both filenames here so the
      // operator knows their way back without having to guess.
      res.json({
        success: true,
        message: "Complete system restore finished successfully!",
        warning: "IMPORTANT: Please restart the application to ensure all changes take effect",
        databaseSafetyBackupFilename: result.databaseSafetyBackupFilename,
        filesSafetyBackupFilename: result.filesSafetyBackupFilename,
      });
    } catch (error) {
      console.error("Error performing complete restore:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to perform complete restore" 
      });
    }
  });

  // App Settings Routes
  app.get("/api/settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const settings = await storage.getAllAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/category/:category", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { category } = req.params;
      const settings = await storage.getAppSettingsByCategory(category);
      res.json(settings);
    } catch (error) {
      console.error(`Error fetching settings for category ${req.params.category}:`, error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/key/:key", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getAppSettingByKey(key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting by key:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  // Get next available contract number (must come before :id route)
  app.get("/api/settings/next-contract-number", requireAuth, async (req: Request, res: Response) => {
    try {
      const nextNumber = await storage.getNextContractNumber();
      res.json({ contractNumber: nextNumber });
    } catch (error) {
      console.error("Error generating next contract number:", error);
      res.status(500).json({ message: "Error generating contract number" });
    }
  });

  // Check if contract number exists (must come before :id route)
  app.get("/api/settings/check-contract-number/:contractNumber", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contractNumber } = req.params;
      const exists = await storage.checkContractNumberExists(contractNumber);
      res.json({ exists });
    } catch (error) {
      console.error("Error checking contract number:", error);
      res.status(500).json({ message: "Error checking contract number" });
    }
  });

  // Get conflicting contract numbers for a proposed override
  app.get("/api/settings/contract-number-conflicts/:proposedNumber", requireAuth, async (req: Request, res: Response) => {
    try {
      const proposedNumber = parseInt(req.params.proposedNumber, 10);
      if (isNaN(proposedNumber) || proposedNumber < 1) {
        return res.status(400).json({ message: "Invalid proposed number" });
      }
      const conflicts = await storage.getConflictingContractNumbers(proposedNumber);
      res.json({ conflicts, hasConflicts: conflicts.length > 0, count: conflicts.length });
    } catch (error) {
      console.error("Error checking contract number conflicts:", error);
      res.status(500).json({ message: "Error checking conflicts" });
    }
  });

  // Set contract number override (smart override feature)
  app.post("/api/settings/contract-number-override", requireAuth, async (req: Request, res: Response) => {
    try {
      const { overrideNumber } = req.body;
      
      if (overrideNumber !== null && (typeof overrideNumber !== 'number' || overrideNumber < 1)) {
        return res.status(400).json({ message: "Invalid override number. Must be a positive integer or null to clear." });
      }
      
      const username = req.user?.username || 'Unknown';
      const updatedSettings = await storage.setContractNumberOverride(overrideNumber, username);
      
      if (!updatedSettings) {
        return res.status(500).json({ message: "Failed to set override" });
      }
      
      // Return the updated settings along with the new next contract number
      const nextNumber = await storage.getNextContractNumber();
      
      res.json({ 
        success: true, 
        settings: updatedSettings,
        nextContractNumber: nextNumber,
        message: overrideNumber ? `Next contract number set to ${overrideNumber}` : 'Override cleared'
      });
    } catch (error) {
      console.error("Error setting contract number override:", error);
      res.status(500).json({ message: "Error setting override" });
    }
  });

  // Clear contract number override
  app.delete("/api/settings/contract-number-override", requireAuth, async (req: Request, res: Response) => {
    try {
      const username = req.user?.username || 'Unknown';
      const updatedSettings = await storage.clearContractNumberOverride(username);
      const nextNumber = await storage.getNextContractNumber();
      
      res.json({ 
        success: true, 
        settings: updatedSettings,
        nextContractNumber: nextNumber,
        message: 'Override cleared - using automatic numbering'
      });
    } catch (error) {
      console.error("Error clearing contract number override:", error);
      res.status(500).json({ message: "Error clearing override" });
    }
  });

  app.get("/api/settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const setting = await storage.getAppSetting(id);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.post("/api/settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const username = req.user?.username || 'Unknown';
      const settingData = {
        ...req.body,
        createdBy: username,
        updatedBy: username
      };
      
      const newSetting = await storage.createAppSetting(settingData);
      
      // Clear email config cache if this is an email setting
      if (newSetting.category === 'email') {
        clearEmailConfigCache();
      }
      
      res.status(201).json(newSetting);
    } catch (error) {
      console.error("Error creating setting:", error);
      res.status(500).json({ error: "Failed to create setting" });
    }
  });

  app.patch("/api/settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const username = req.user?.username || 'Unknown';
      const updateData = {
        ...req.body,
        updatedBy: username
      };
      
      const updatedSetting = await storage.updateAppSetting(id, updateData);
      
      if (!updatedSetting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // Clear email config cache if this is an email setting
      if (updatedSetting.category === 'email') {
        clearEmailConfigCache();
      }
      
      res.json(updatedSetting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  app.delete("/api/settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get setting before deleting to check if it's an email setting
      const setting = await storage.getAppSetting(id);
      const isEmailSetting = setting?.category === 'email';
      
      const success = await storage.deleteAppSetting(id);
      
      if (!success) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // Clear email config cache if this was an email setting
      if (isEmailSetting) {
        clearEmailConfigCache();
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting setting:", error);
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });


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
  const driverLicenseUpload = multer({
    storage: driverLicenseStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: createSecureMulterFilter('document'),
  });
  
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
        ...(req.file ? { licenseFilePath: path.relative(process.cwd(), req.file.path) } : {}),
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
        ...(req.file ? { licenseFilePath: path.relative(process.cwd(), req.file.path) } : {}),
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

      // Resolve the file path and validate it's within uploads directory
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      const requestedPath = path.resolve(process.cwd(), driver.licenseFilePath);
      
      // Security: Prevent path traversal by ensuring file is within uploads directory
      if (!requestedPath.startsWith(uploadsDir)) {
        console.error('Path traversal attempt detected:', driver.licenseFilePath);
        return res.status(403).json({ error: "Access denied" });
      }

      if (!fs.existsSync(requestedPath)) {
        return res.status(404).json({ error: "License file not found on disk" });
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
  app.post("/api/migrate/customer-drivers", requireAuth, async (req, res) => {
    try {
      const username = req.user?.username || 'system';
      const userId = req.user?.id || null;

      const customers = await storage.getCustomers();
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

  // ============================================
  // APP SETTINGS ROUTES
  // ============================================

  // Get all app settings
  app.get("/api/app-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAllAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ message: "Error fetching app settings" });
    }
  });

  // Damage check field schema (used by interactive damage check + template editor + PDF renderer)
  // Read: any authenticated user. Write: admin only.
  app.get("/api/damage-check-fields", requireAuth, async (_req: Request, res: Response) => {
    try {
      const setting = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      if (!setting) return res.json(DEFAULT_DAMAGE_CHECK_FIELDS);
      const parsed = damageCheckFieldsConfigSchema.safeParse(setting.value);
      res.json(parsed.success ? parsed.data : DEFAULT_DAMAGE_CHECK_FIELDS);
    } catch (error) {
      console.error("Error fetching damage check fields:", error);
      res.status(500).json({ message: "Error fetching damage check fields" });
    }
  });

  // Damage check header image: serve uploaded one if configured, else fall back
  // to the bundled default in attached_assets/.
  const damageCheckHeaderStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadsDir, 'damage-check');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(sanitizeFilename(file.originalname)) || '.png';
      cb(null, `header-${Date.now()}${ext}`);
    },
  });
  const damageCheckHeaderUpload = multer({
    storage: damageCheckHeaderStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter('image'),
  });

  app.get("/api/damage-check-fields/header", requireAuth, async (_req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      const setting = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      const cfg = setting?.value as any;
      const customPath = cfg?.headerImagePath as string | undefined;
      if (customPath) {
        const absolute = path.isAbsolute(customPath)
          ? customPath
          : path.join(process.cwd(), customPath);
        if (fs.existsSync(absolute)) {
          return res.sendFile(absolute);
        }
      }
      // The old fallback pointed at attached_assets/, which is gitignored and so
      // never exists in a deployed build. Report "no header configured" instead
      // of failing on a file that cannot be there; the UI shows a placeholder
      // and admins can upload one on this page.
      const fallback = path.join(process.cwd(), 'attached_assets', 'image_1779471993617.png');
      if (fs.existsSync(fallback)) {
        return res.sendFile(fallback);
      }
      return res.status(204).end();
    } catch (e) {
      res.status(500).json({ message: 'Error loading header image' });
    }
  });

  app.post("/api/damage-check-fields/header", requireAuth, requireAdmin, damageCheckHeaderUpload.single('header'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
      const relPath = path.relative(process.cwd(), req.file.path);
      const username = (req.user as any)?.username || 'system';
      const existing = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      const baseValue = (existing?.value as any) || DEFAULT_DAMAGE_CHECK_FIELDS;
      // Clean up previous uploaded file if any
      const prevPath = baseValue?.headerImagePath as string | undefined;
      if (prevPath) {
        try {
          const abs = path.isAbsolute(prevPath) ? prevPath : path.join(process.cwd(), prevPath);
          if (abs.includes(path.join('uploads', 'damage-check')) && fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch {}
      }
      const newValue = { ...baseValue, headerImagePath: relPath };
      if (existing) {
        await storage.updateAppSetting(existing.id, { value: newValue as any, updatedBy: username });
      } else {
        await storage.createAppSetting({ key: DAMAGE_CHECK_FIELDS_KEY, value: newValue as any, category: 'damage_check', updatedBy: username } as any);
      }
      res.json({ success: true, headerImagePath: relPath });
    } catch (e) {
      console.error('Header upload failed:', e);
      res.status(500).json({ message: 'Error uploading header' });
    }
  });

  app.delete("/api/damage-check-fields/header", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      if (!existing) return res.json({ success: true });
      const baseValue = (existing.value as any) || {};
      const prevPath = baseValue?.headerImagePath as string | undefined;
      if (prevPath) {
        try {
          const abs = path.isAbsolute(prevPath) ? prevPath : path.join(process.cwd(), prevPath);
          if (abs.includes(path.join('uploads', 'damage-check')) && fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch {}
      }
      const username = (req.user as any)?.username || 'system';
      const newValue = { ...baseValue, headerImagePath: null };
      await storage.updateAppSetting(existing.id, { value: newValue as any, updatedBy: username });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: 'Error resetting header' });
    }
  });

  app.put("/api/damage-check-fields", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = damageCheckFieldsConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid config", errors: parsed.error.flatten() });
      }
      // Enforce: keys unique within a group, all three group ids present
      const groupIds = parsed.data.groups.map(g => g.id).sort();
      const expected = ["delivery", "exterior", "interior"];
      if (groupIds.length !== 3 || groupIds.some((g, i) => g !== expected[i])) {
        return res.status(400).json({ message: "Must contain exactly the three groups: interior, exterior, delivery" });
      }
      for (const g of parsed.data.groups) {
        const seen = new Set<string>();
        for (const f of g.fields) {
          if (seen.has(f.key)) {
            return res.status(400).json({ message: `Duplicate field key "${f.key}" in group "${g.id}"` });
          }
          seen.add(f.key);
        }
      }
      const username = (req.user as any)?.username || "system";
      const existing = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      // Preserve headerImagePath if the client didn't send one (it's managed
      // via the dedicated upload endpoint).
      const existingHeader = (existing?.value as any)?.headerImagePath;
      const mergedValue: any = {
        ...parsed.data,
        headerImagePath: parsed.data.headerImagePath ?? existingHeader ?? null,
      };
      if (existing) {
        const updated = await storage.updateAppSetting(existing.id, {
          value: mergedValue,
          updatedBy: username,
        });
        return res.json(updated?.value ?? mergedValue);
      }
      const created = await storage.createAppSetting({
        key: DAMAGE_CHECK_FIELDS_KEY,
        value: mergedValue,
        category: "damage_check",
        description: "Editable checklist fields for the interactive damage check + template editor",
        createdBy: username,
        updatedBy: username,
      });
      res.json(created.value);
    } catch (error) {
      console.error("Error saving damage check fields:", error);
      res.status(500).json({ message: "Error saving damage check fields" });
    }
  });

  // Get app setting by key (returns single setting or null)
  // For calendar_settings, auto-calculates Dutch holidays for multiple years and merges with overrides
  app.get("/api/app-settings/key/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const setting = await storage.getAppSettingByKey(key);
      
      // Special handling for calendar_settings: auto-calculate Dutch holidays for multiple years
      if (key === 'calendar_settings' && setting?.value) {
        const currentYear = new Date().getFullYear();
        const storedDutchHolidays = setting.value.dutchHolidays || {};
        
        // Convert stored format to override format
        const overrides: Record<string, { enabled: boolean; overrideDate?: string }> = {};
        for (const [holidayKey, value] of Object.entries(storedDutchHolidays)) {
          if (typeof value === 'object' && value !== null && 'enabled' in value) {
            const holidayValue = value as { enabled: boolean; date?: string; overrideDate?: string };
            overrides[holidayKey] = {
              enabled: holidayValue.enabled,
              overrideDate: holidayValue.overrideDate
            };
          } else if (typeof value === 'boolean') {
            // Legacy format: just boolean
            overrides[holidayKey] = { enabled: value };
          }
        }
        
        // Calculate holidays for current year and next 2 years (to support calendar navigation)
        const yearsToCalculate = [currentYear, currentYear + 1, currentYear + 2];
        const dutchHolidaysByYear: Record<number, Record<string, { enabled: boolean; date: string; isOverridden: boolean; calculatedDate: string }>> = {};
        
        // Also build a flat list of all holiday dates for easy lookup
        const allHolidayDates: Record<string, { enabled: boolean; date: string; holidayKey: string; year: number }> = {};
        
        for (const year of yearsToCalculate) {
          // Only apply date overrides to current year - future years get pure calculated dates
          // But enabled/disabled state applies to all years
          const yearOverrides: Record<string, { enabled: boolean; overrideDate?: string }> = {};
          for (const [holidayKey, override] of Object.entries(overrides)) {
            yearOverrides[holidayKey] = {
              enabled: override.enabled,
              // Only include overrideDate for current year
              overrideDate: year === currentYear ? override.overrideDate : undefined
            };
          }
          
          const mergedHolidays = mergeHolidaysWithOverrides(year, yearOverrides);
          dutchHolidaysByYear[year] = mergedHolidays;
          
          // Add each holiday to the flat lookup map (keyed by date)
          for (const [holidayKey, holidayData] of Object.entries(mergedHolidays)) {
            if (holidayData.enabled) {
              allHolidayDates[holidayData.date] = {
                enabled: holidayData.enabled,
                date: holidayData.date,
                holidayKey,
                year
              };
            }
          }
        }
        
        // Return enhanced setting with multi-year auto-calculated dates
        // dutchHolidays remains for backward compatibility (current year)
        // dutchHolidaysByYear contains all years
        // allHolidayDates is a flat lookup for calendar rendering
        res.json({
          ...setting,
          value: {
            ...setting.value,
            dutchHolidays: dutchHolidaysByYear[currentYear],
            dutchHolidaysByYear,
            allHolidayDates,
            calculatedYears: yearsToCalculate
          }
        });
        return;
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching app setting by key:", error);
      res.status(500).json({ message: "Error fetching app setting" });
    }
  });

  // Get app settings by category
  app.get("/api/app-settings/:category", requireAuth, async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const settings = await storage.getAppSettingsByCategory(category);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings by category:", error);
      res.status(500).json({ message: "Error fetching app settings" });
    }
  });

  // Create or update app setting (upsert by key)
  app.post("/api/app-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { key, value, category, description } = req.body;

      // Check if setting with this key already exists
      const existing = await storage.getAppSettingByKey(key);

      if (existing) {
        // Update existing setting
        const updated = await storage.updateAppSetting(existing.id, {
          value,
          category,
          description,
          updatedBy: user ? user.username : null,
        });
        res.json(updated);
      } else {
        // Create new setting
        const created = await storage.createAppSetting({
          key,
          value,
          category,
          description,
          createdBy: user ? user.username : null,
          updatedBy: user ? user.username : null,
        });
        res.json(created);
      }
    } catch (error) {
      console.error("Error creating/updating app setting:", error);
      res.status(500).json({ message: "Error saving app setting" });
    }
  });

  // Update app setting by ID
  app.put("/api/app-settings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const id = parseInt(req.params.id);
      const { key, value, category, description } = req.body;

      const updated = await storage.updateAppSetting(id, {
        key,
        value,
        category,
        description,
        updatedBy: user ? user.username : null,
      });

      if (!updated) {
        return res.status(404).json({ message: "App setting not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating app setting:", error);
      res.status(500).json({ message: "Error updating app setting" });
    }
  });

  // Delete app setting
  app.delete("/api/app-settings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteAppSetting(id);

      if (!success) {
        return res.status(404).json({ message: "App setting not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting app setting:", error);
      res.status(500).json({ message: "Error deleting app setting" });
    }
  });

  // ============================================
  // SYSTEM SETTINGS ROUTES (Contract Numbers, etc.)
  // ============================================

  // Get system settings
  app.get("/api/system-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      if (!settings) {
        // Return default settings if none exist
        return res.json({
          contractNumberStart: 1,
          maintenanceExcludedStatuses: ["not_for_rental"],
          showApkReminders: true,
          showWarrantyReminders: true,
          showMaintenanceBlocks: true,
          apkReminderDays: 30,
          warrantyReminderDays: 30,
          tollRatePerKm: "0.15",
          depotAddress: null,
          depotCity: null,
          depotPostalCode: null
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Error fetching settings" });
    }
  });

  // Update system settings
  app.put("/api/system-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const {
        contractNumberStart,
        maintenanceExcludedStatuses,
        showApkReminders,
        showWarrantyReminders,
        showMaintenanceBlocks,
        apkReminderDays,
        warrantyReminderDays,
        tollRatePerKm,
        depotAddress,
        depotCity,
        depotPostalCode
      } = req.body;

      const updated = await storage.updateSettings({
        contractNumberStart,
        maintenanceExcludedStatuses,
        showApkReminders,
        showWarrantyReminders,
        showMaintenanceBlocks,
        apkReminderDays,
        warrantyReminderDays,
        tollRatePerKm,
        depotAddress,
        depotCity,
        depotPostalCode,
        updatedBy: user ? user.username : null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Error updating settings" });
    }
  });


  // ============================================
  // REPORTS & ANALYTICS ROUTES
  // ============================================

  // Maintenance Cost Analysis Report
  app.get("/api/reports/maintenance-costs", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const { timeRange, brand } = req.query;
      
      // Get all expenses with vehicle information
      const expenses = await storage.getAllExpenses();
      const vehicles = await storage.getAllVehicles();
      
      // Filter expenses by time range
      let filteredExpenses = expenses;
      if (timeRange && timeRange !== 'all') {
        const now = new Date();
        let cutoffDate = new Date();
        
        switch (timeRange) {
          case 'month':
            cutoffDate.setMonth(now.getMonth() - 1);
            break;
          case '3months':
            cutoffDate.setMonth(now.getMonth() - 3);
            break;
          case '6months':
            cutoffDate.setMonth(now.getMonth() - 6);
            break;
          case 'year':
            cutoffDate.setFullYear(now.getFullYear() - 1);
            break;
        }
        
        filteredExpenses = expenses.filter(e => new Date(e.date) >= cutoffDate);
      }
      
      // Filter by brand if specified
      let filteredVehicles = vehicles;
      if (brand && brand !== 'all') {
        filteredVehicles = vehicles.filter(v => v.brand === brand);
        const vehicleIds = new Set(filteredVehicles.map(v => v.id));
        filteredExpenses = filteredExpenses.filter(e => vehicleIds.has(e.vehicleId));
      }
      
      // Calculate total costs
      const totalCosts = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
      
      // Calculate average cost per vehicle
      const vehiclesWithExpenses = new Set(filteredExpenses.map(e => e.vehicleId));
      const averageCostPerVehicle = vehiclesWithExpenses.size > 0 
        ? totalCosts / vehiclesWithExpenses.size 
        : 0;
      
      // Calculate cost per km
      const totalMileage = filteredVehicles.reduce((sum, v) => 
        sum + (v.currentMileage || v.departureMileage || 0), 0);
      const averageCostPerKm = totalMileage > 0 ? totalCosts / totalMileage : 0;
      
      // Category breakdown
      const categoryMap = new Map<string, number>();
      filteredExpenses.forEach(e => {
        const current = categoryMap.get(e.category) || 0;
        categoryMap.set(e.category, current + parseFloat(e.amount.toString()));
      });
      
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, amount]) => ({
        category,
        amount,
        percentage: (amount / totalCosts) * 100
      }));
      
      // Brand comparison
      const brandMap = new Map<string, {totalCost: number, vehicles: Set<number>}>();
      filteredExpenses.forEach(e => {
        const vehicle = vehicles.find(v => v.id === e.vehicleId);
        if (vehicle) {
          const brandData = brandMap.get(vehicle.brand) || {totalCost: 0, vehicles: new Set()};
          brandData.totalCost += parseFloat(e.amount.toString());
          brandData.vehicles.add(vehicle.id);
          brandMap.set(vehicle.brand, brandData);
        }
      });
      
      const brandComparison = Array.from(brandMap.entries()).map(([brand, data]) => ({
        brand,
        totalCost: data.totalCost,
        avgCost: data.vehicles.size > 0 ? data.totalCost / data.vehicles.size : 0,
        vehicleCount: data.vehicles.size
      }));
      
      // Vehicle details
      const vehicleExpenseMap = new Map<number, {expenses: any[], totalCost: number}>();
      filteredExpenses.forEach(e => {
        const data = vehicleExpenseMap.get(e.vehicleId) || {expenses: [], totalCost: 0};
        data.expenses.push(e);
        data.totalCost += parseFloat(e.amount.toString());
        vehicleExpenseMap.set(e.vehicleId, data);
      });
      
      const vehicleDetails = Array.from(vehicleExpenseMap.entries()).map(([vehicleId, data]) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return null;
        
        const mileage = vehicle.currentMileage || vehicle.departureMileage || 0;
        return {
          vehicleId: vehicle.id,
          licensePlate: vehicle.licensePlate,
          brand: vehicle.brand,
          model: vehicle.model,
          totalCost: data.totalCost,
          costPerKm: mileage > 0 ? data.totalCost / mileage : 0,
          currentMileage: mileage,
          expenseCount: data.expenses.length
        };
      }).filter(Boolean);
      
      // Monthly trend (last 12 months)
      const monthlyMap = new Map<string, number>();
      const last12Months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = format(date, 'MMM yyyy');
        last12Months.push(monthKey);
        monthlyMap.set(monthKey, 0);
      }
      
      filteredExpenses.forEach(e => {
        const monthKey = format(new Date(e.date), 'MMM yyyy');
        if (monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + parseFloat(e.amount.toString()));
        }
      });
      
      const monthlyTrend = last12Months.map(month => ({
        month,
        amount: monthlyMap.get(month) || 0
      }));
      
      res.json({
        totalCosts,
        averageCostPerVehicle,
        averageCostPerKm,
        totalVehicles: vehiclesWithExpenses.size,
        categoryBreakdown,
        brandComparison,
        vehicleDetails,
        monthlyTrend
      });
    } catch (error) {
      console.error("Error fetching maintenance cost analysis:", error);
      res.status(500).json({ message: "Error fetching maintenance cost analysis" });
    }
  });

  // ============================================
  // REPORT BUILDER ROUTES
  // ============================================

  // Get all saved reports
  app.get("/api/reports/saved", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const reports = await storage.getAllSavedReports();
      res.json(reports);
    } catch (error) {
      console.error("Error fetching saved reports:", error);
      res.status(500).json({ message: "Error fetching saved reports" });
    }
  });

  // Save a new report
  app.post("/api/reports/saved", hasPermission(UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const config: any = req.body;

      if (!config.name) {
        return res.status(400).json({ message: "Report name is required" });
      }

      const report = await storage.createSavedReport({
        name: config.name,
        description: config.description || null,
        reportType: 'custom',
        configuration: config,
        dataSources: config.dataSources || [],
        enabled: true,
        createdBy: user ? user.username : null,
        createdByUserId: user ? user.id : null,
        updatedBy: user ? user.username : null,
      });

      res.json(report);
    } catch (error) {
      console.error("Error saving report:", error);
      res.status(500).json({ message: "Error saving report" });
    }
  });

  // Delete a saved report
  app.delete("/api/reports/saved/:id", hasPermission(UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSavedReport(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting report:", error);
      res.status(500).json({ message: "Error deleting report" });
    }
  });

  // Execute a report
  app.post("/api/reports/execute", hasPermission(UserPermission.VIEW_REPORTS, UserPermission.MANAGE_REPORTS), async (req: Request, res: Response) => {
    try {
      const config: any = req.body;

      if (!config.columns || config.columns.length === 0) {
        return res.status(400).json({ message: "No columns specified" });
      }

      const results = await storage.executeReport(config);
      res.json(results);
    } catch (error) {
      if (error instanceof ReportValidationError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error executing report:", error);
      res.status(500).json({ message: "Error executing report" });
    }
  });

  // ============================================
  // DAMAGE CHECK TEMPLATE ROUTES
  // ============================================

  // Get all damage check templates
  app.get("/api/damage-check-templates", hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllDamageCheckTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching damage check templates:", error);
      res.status(500).json({ message: "Error fetching damage check templates" });
    }
  });

  // Get damage check template by ID
  app.get("/api/damage-check-templates/:id", hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getDamageCheckTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching damage check template:", error);
      res.status(500).json({ message: "Error fetching damage check template" });
    }
  });

  // Get templates by vehicle criteria
  app.get("/api/damage-check-templates/by-vehicle", hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const { make, model, type } = req.query;
      const templates = await storage.getDamageCheckTemplatesByVehicle(
        make as string | undefined,
        model as string | undefined,
        type as string | undefined
      );
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates by vehicle:", error);
      res.status(500).json({ message: "Error fetching templates" });
    }
  });

  // Get default damage check template
  app.get("/api/damage-check-templates/default/template", hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const template = await storage.getDefaultDamageCheckTemplate();
      
      if (!template) {
        return res.status(404).json({ message: "No default template found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching default template:", error);
      res.status(500).json({ message: "Error fetching default template" });
    }
  });

  // Live preview: render a draft template to PDF without persisting it. Used
  // by the template editor's live-preview pane so editors can see exactly how
  // their inspection points / categories / diagrams will render. Accepts the
  // full draft template in the request body.
  app.post(
    "/api/damage-check-templates/preview-pdf",
    hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS),
    async (req: Request, res: Response) => {
      try {
        const draft = req.body ?? {};

        // Build a synthetic template so the generator has all fields it
        // expects. Missing fields default to sensible values so an empty
        // editor still produces a viewable preview.
        const templateForRender: any = {
          id: 0,
          name: draft.name || "Preview",
          description: draft.description ?? null,
          vehicleMake: draft.vehicleMake ?? null,
          vehicleModel: draft.vehicleModel ?? null,
          vehicleType: draft.vehicleType ?? null,
          buildYearFrom: draft.buildYearFrom ?? null,
          buildYearTo: draft.buildYearTo ?? null,
          isDefault: false,
          language: draft.language ?? "nl",
          inspectionPoints: Array.isArray(draft.inspectionPoints)
            ? draft.inspectionPoints
            : [],
          categories: Array.isArray(draft.categories) ? draft.categories : [],
          handoverChecklist: Array.isArray(draft.handoverChecklist)
            ? draft.handoverChecklist
            : [],
          canvasFields: Array.isArray(draft.canvasFields) ? draft.canvasFields : [],
          headerText: draft.headerText ?? null,
          footerText: draft.footerText ?? null,
        };

        // Sample vehicle + reservation data for the preview. Editors can
        // see how dynamic fields render without needing a real reservation.
        const sampleVehicle = {
          brand: draft.vehicleMake || "Sample Brand",
          model: draft.vehicleModel || "Sample Model",
          licensePlate: "XX-000-X",
          buildYear: "2024",
          fuel: "Diesel",
          mileage: 12345,
        };
        const sampleReservation = {
          contractNumber: "PREVIEW-0001",
          customerName: "Sample Customer",
          startDate: format(new Date(), "dd-MM-yyyy"),
          endDate: format(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            "dd-MM-yyyy",
          ),
          rentalDays: 7,
        };
        // Sample interactive check so editors can see how filled-in checklist
        // answers, fuel level, mileage and notes appear next to their labels.
        // We seed answers for every field in the active schema so a freshly
        // inserted default layout shows realistic, fully-populated output.
        const sampleChecklistData: Record<string, Record<string, string | boolean>> = {
          interior: {},
          exterior: {},
          delivery: {},
        };
        try {
          const { storage } = await import("./storage");
          const { DAMAGE_CHECK_FIELDS_KEY, DEFAULT_DAMAGE_CHECK_FIELDS } =
            await import("@shared/schema");
          const setting = await storage.getSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
          const cfg: any = (setting?.value as any) || DEFAULT_DAMAGE_CHECK_FIELDS;
          for (const g of cfg.groups || []) {
            for (const f of g.fields || []) {
              if (g.id === "delivery") {
                sampleChecklistData.delivery[f.key] = true;
              } else if (g.id === "interior" || g.id === "exterior") {
                const first = Array.isArray(f.options) && f.options[0] ? f.options[0] : "";
                sampleChecklistData[g.id][f.key] = first;
              }
            }
          }
        } catch {
          // Best-effort — preview still renders without seeded checklist data.
        }
        const sampleInteractiveCheck = {
          mileage: 12345,
          fuelLevel: "vol",
          notes: "Sample inspection notes recorded during the check.",
          checklistData: JSON.stringify(sampleChecklistData),
        };

        const { generateDamageCheckPDFWithTemplate } = await import(
          "./pdf-damage-check-generator"
        );
        const pdfBuffer = await generateDamageCheckPDFWithTemplate(
          sampleVehicle,
          templateForRender,
          sampleReservation,
          sampleInteractiveCheck,
        );

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader(
          "Content-Disposition",
          'inline; filename="template-preview.pdf"',
        );
        res.send(pdfBuffer);
      } catch (error) {
        console.error("Error generating template preview PDF:", error);
        res.status(500).json({ message: "Error generating preview" });
      }
    },
  );

  // Create new damage check template
  app.post("/api/damage-check-templates", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const templateData = {
        ...req.body,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null,
      };
      
      const template = await storage.createDamageCheckTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating damage check template:", error);
      res.status(500).json({ message: "Error creating damage check template" });
    }
  });

  // Update damage check template
  app.put("/api/damage-check-templates/:id", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user;
      const templateData = {
        ...req.body,
        updatedBy: user ? user.username : null,
      };
      
      const updated = await storage.updateDamageCheckTemplate(id, templateData);
      
      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating damage check template:", error);
      res.status(500).json({ message: "Error updating damage check template" });
    }
  });

  // Upload a single reference photo for an inspection point. Reuses the
  // diagramUpload multer config (image-only, size-limited).
  app.post(
    "/api/damage-check-templates/upload-photo",
    hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS),
    diagramUpload.single("photo"),
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const path = getRelativePath(file.path);
        res.json({ path, url: `/${path}` });
      } catch (error) {
        console.error("Error uploading inspection point photo:", error);
        res.status(500).json({ message: "Error uploading photo" });
      }
    },
  );

  // Set a single template as the default (atomically un-defaults all others)
  app.post("/api/damage-check-templates/:id/set-default", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid template id" });
      }
      const updated = await storage.setDefaultDamageCheckTemplate(id);
      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error setting default damage check template:", error);
      res.status(500).json({ message: "Error setting default damage check template" });
    }
  });

  // Clone an existing damage check template (used by the "Clone from
  // existing…" picker at the top of the templates list). The clone is created
  // as a non-default template so existing defaults are preserved.
  app.post("/api/damage-check-templates/:id/clone", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const sourceId = parseInt(req.params.id);
      if (Number.isNaN(sourceId)) {
        return res.status(400).json({ message: "Invalid template id" });
      }
      const user = req.user;
      const newName = typeof req.body?.name === "string" ? req.body.name : undefined;
      const cloned = await storage.cloneDamageCheckTemplate(
        sourceId,
        newName,
        user ? (user as any).username : undefined,
      );
      if (!cloned) {
        return res.status(404).json({ message: "Source template not found" });
      }
      res.status(201).json(cloned);
    } catch (error) {
      console.error("Error cloning damage check template:", error);
      res.status(500).json({ message: "Error cloning damage check template" });
    }
  });

  // Delete damage check template
  app.delete("/api/damage-check-templates/:id", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteDamageCheckTemplate(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting damage check template:", error);
      res.status(500).json({ message: "Error deleting damage check template" });
    }
  });

  // Configure multer for damage-check template background uploads — images only
  const damageCheckTemplateBackgroundUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter('document'),
  });

  app.post("/api/damage-check-templates/:id/background", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), damageCheckTemplateBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getDamageCheckTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'damage-check-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      if ((template as any).backgroundPath) {
        try {
          await fs.promises.unlink(path.join(process.cwd(), (template as any).backgroundPath));
        } catch (error) {
          console.error("Error deleting old damage-check template background:", error);
        }
      }

      const filename = `template_${id}_background_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = path.relative(process.cwd(), filePath);

      const updated = await storage.updateDamageCheckTemplate(id, {
        backgroundPath,
        backgroundPreviewPath: backgroundPath,
      } as any);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error uploading damage-check template background:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.delete("/api/damage-check-templates/:id/background", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getDamageCheckTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      if ((template as any).backgroundPath) {
        try {
          await fs.promises.unlink(path.join(process.cwd(), (template as any).backgroundPath));
        } catch (error) {
          console.error("Error deleting damage-check template background:", error);
        }
      }

      const updated = await storage.updateDamageCheckTemplate(id, {
        backgroundPath: null,
        backgroundPreviewPath: null,
      } as any);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error removing damage-check template background:", error);
      res.status(500).json({ message: "Failed to remove background" });
    }
  });

  app.get("/api/damage-check-templates/backgrounds/all", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const backgrounds = await storage.getAllDamageCheckTemplateBackgrounds();
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching damage-check template backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.get("/api/damage-check-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      const backgrounds = await storage.getDamageCheckTemplateBackgrounds(templateId);
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching damage-check template backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.post("/api/damage-check-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), damageCheckTemplateBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getDamageCheckTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'damage-check-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      const name = (req.body.name || req.file.originalname || 'Background').toString().slice(0, 100);
      const filename = `library_${templateId}_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = path.relative(process.cwd(), filePath);

      const background = await storage.createDamageCheckTemplateBackground({
        templateId,
        name,
        backgroundPath,
        previewPath: backgroundPath,
      });
      res.status(201).json(background);
    } catch (error) {
      console.error("Error uploading damage-check template background to library:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.post("/api/damage-check-templates/:id/backgrounds/:backgroundId/select", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(templateId) || isNaN(backgroundId)) return res.status(400).json({ message: "Invalid ID" });
      const updated = await storage.selectDamageCheckTemplateBackground(templateId, backgroundId);
      if (!updated) return res.status(404).json({ message: "Template or background not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error selecting damage-check template background:", error);
      res.status(500).json({ message: "Failed to select background" });
    }
  });

  app.delete("/api/damage-check-templates/:id/backgrounds/:backgroundId", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(backgroundId)) return res.status(400).json({ message: "Invalid background ID" });
      const background = await storage.getDamageCheckTemplateBackground(backgroundId);
      if (!background) return res.status(404).json({ message: "Background not found" });

      try {
        await fs.promises.unlink(path.join(process.cwd(), background.backgroundPath));
      } catch (error) {
        console.error("Error deleting damage-check template background file:", error);
      }

      const deleted = await storage.deleteDamageCheckTemplateBackground(backgroundId);
      if (!deleted) return res.status(500).json({ message: "Failed to delete background" });
      res.status(200).json({ message: "Background deleted successfully" });
    } catch (error) {
      console.error("Error deleting damage-check template background:", error);
      res.status(500).json({ message: "Failed to delete background" });
    }
  });

  // Export damage check template
  app.get("/api/damage-check-templates/:id/export", hasPermission(UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getDamageCheckTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Strip server-controlled fields
      const { id: _, createdAt, updatedAt, ...exportData } = template;
      
      // Log export data for debugging
      console.log(`Exporting damage check template "${template.name}":`, {
        exportDataKeys: Object.keys(exportData)
      });
      
      // Sanitize filename: replace special chars, spaces, and limit length
      const sanitizedName = template.name
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .substring(0, 50);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="damage_check_${sanitizedName}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error("Error exporting damage check template:", error);
      res.status(500).json({ message: "Error exporting damage check template" });
    }
  });

  // Import damage check template
  app.post("/api/damage-check-templates/import", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      
      // Log what we received
      console.log('Importing damage check template:', {
        receivedKeys: Object.keys(req.body)
      });

      // Add defaults for fields that might be missing from export
      const importData = {
        ...req.body,
        // Ensure defaults for required fields
        language: req.body.language || 'nl',
        isDefault: req.body.isDefault ?? false,
      };

      // Reject pre-branch exports: they use the old categories/inspectionPoints/
      // handoverChecklist vocabulary and predate canvasFields entirely. The insert
      // schema below silently strips unknown keys, so without this check such a
      // file would "successfully" import as a blank template (empty canvasFields)
      // with no error or warning.
      const hasLegacyOnly =
        ((Array.isArray(importData.inspectionPoints) && importData.inspectionPoints.length > 0) ||
         (Array.isArray(importData.categories) && importData.categories.length > 0) ||
         (Array.isArray(importData.handoverChecklist) && importData.handoverChecklist.length > 0)) &&
        !(Array.isArray(importData.canvasFields) && importData.canvasFields.length > 0);

      if (hasLegacyOnly) {
        return res.status(400).json({
          message: "This template export predates the current app version and uses a field format that's no longer supported. Please re-export it from a template that has canvasFields (open it in the layout editor and save), then import again.",
        });
      }

      // Validate the import data using the insert schema
      const validatedData = insertDamageCheckTemplateSchema.parse(importData);

      const templateData = {
        ...validatedData,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null,
      };

      const newTemplate = await storage.createDamageCheckTemplate(templateData);

      console.log('Template created:', {
        id: newTemplate.id,
        name: newTemplate.name,
      });
      
      res.json(newTemplate);
    } catch (error: any) {
      console.error("Error importing damage check template:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid template data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Error importing damage check template" });
    }
  });

  // Generate damage check PDF for a vehicle
  app.get("/api/vehicles/:id/damage-check-pdf", requireAuth, async (req: Request, res: Response) => {
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
      
      // Get current or upcoming reservation for this vehicle (optional)
      let reservationData;
      try {
        const reservations = await storage.getVehicleReservations(vehicleId);
        const currentReservation = reservations.find(r => {
          const start = new Date(r.startDate);
          const end = new Date(r.endDate);
          const now = new Date();
          return start <= now && end >= now;
        }) || reservations[0];
        
        if (currentReservation) {
          const customer = currentReservation.customerId 
            ? await storage.getCustomer(currentReservation.customerId)
            : null;
          
          const startDate = new Date(currentReservation.startDate);
          const endDate = new Date(currentReservation.endDate);
          const rentalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          
          reservationData = {
            contractNumber: `#${currentReservation.id}`,
            customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'N/A',
            startDate: format(startDate, 'dd-MM-yyyy'),
            endDate: format(endDate, 'dd-MM-yyyy'),
            rentalDays
          };
        }
      } catch (err) {
        console.warn("Could not fetch reservation data:", err);
      }
      
      const pdfBuffer = await generateDamageCheckPDFWithTemplate(
        {
          brand: vehicle.brand,
          model: vehicle.model,
          licensePlate: vehicle.licensePlate,
          buildYear: vehicle.productionDate,
          fuel: vehicle.fuel || undefined,
          mileage: vehicle.mileage || undefined,
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
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // VEHICLE DIAGRAM TEMPLATE ROUTES
  
  // Get all vehicle diagram templates
  app.get("/api/vehicle-diagram-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllVehicleDiagramTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching vehicle diagram templates:", error);
      res.status(500).json({ message: "Error fetching vehicle diagram templates" });
    }
  });

  // Get vehicle diagram template by ID
  app.get("/api/vehicle-diagram-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching vehicle diagram template:", error);
      res.status(500).json({ message: "Error fetching vehicle diagram template" });
    }
  });

  // Find matching vehicle diagram for a vehicle
  app.get("/api/vehicle-diagram-templates/match/:vehicleId", requireAuth, async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.vehicleId);
      const vehicle = await storage.getVehicle(vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Extract year from production date if available
      let year: number | undefined;
      if (vehicle.productionDate) {
        const match = vehicle.productionDate.match(/(\d{4})/);
        if (match) {
          year = parseInt(match[1]);
        }
      }
      
      console.log(`Looking for diagram template for vehicle ${vehicleId}:`, {
        brand: vehicle.brand,
        model: vehicle.model,
        year: year
      });
      
      const template = await storage.getVehicleDiagramTemplateByVehicle(
        vehicle.brand,
        vehicle.model,
        year
      );
      
      if (!template) {
        console.log(`No matching diagram template found for vehicle ${vehicleId}`);
        return res.status(404).json({ message: "No matching diagram template found" });
      }
      
      console.log(`Found matching diagram template ${template.id} for vehicle ${vehicleId}`);
      res.json(template);
    } catch (error) {
      console.error("Error finding matching diagram template:", error);
      res.status(500).json({ message: "Error finding matching diagram template" });
    }
  });

  // Create vehicle diagram template (with file upload)
  app.post("/api/vehicle-diagram-templates", requireAuth, diagramUpload.single('diagram'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Diagram image is required" });
      }
      
      // Post-upload validation - verify file content is actually an image
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'image'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ message: fileValidation.error });
      }
      
      const user = req.user;
      
      // Multer already saved the file to disk - just get the relative path
      const diagramPath = getRelativePath(req.file.path);
      console.log(`✅ Uploaded vehicle diagram to filesystem:`);
      console.log(`   Absolute path: ${req.file.path}`);
      console.log(`   Relative path: ${diagramPath}`);
      console.log(`   Uploads dir: ${uploadsDir}`);
      console.log(`   File exists: ${fs.existsSync(req.file.path)}`);
      
      const templateData = {
        make: req.body.make,
        model: req.body.model,
        yearFrom: req.body.yearFrom ? parseInt(req.body.yearFrom) : null,
        yearTo: req.body.yearTo ? parseInt(req.body.yearTo) : null,
        diagramPath: diagramPath, // Filesystem path (works everywhere)
        objectStorageKey: null, // Not using object storage anymore
        description: req.body.description || null,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null,
      };
      
      const created = await storage.createVehicleDiagramTemplate(templateData);
      
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating vehicle diagram template:", error);
      res.status(500).json({ message: "Error creating vehicle diagram template" });
    }
  });

  // Update vehicle diagram template
  app.patch("/api/vehicle-diagram-templates/:id", requireAuth, diagramUpload.single('diagram'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as Express.User | undefined;
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      let diagramPath = template.diagramPath; // Keep existing path by default
      
      // If a new diagram file was uploaded, handle it
      if (req.file) {
        // Post-upload validation - verify file content is actually an image
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'image'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ message: fileValidation.error });
        }
        
        const uploadsDir = path.join(process.cwd(), 'uploads');
        const diagramsDir = path.join(uploadsDir, 'vehicle-diagrams');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(diagramsDir)) {
          fs.mkdirSync(diagramsDir, { recursive: true });
        }
        
        // Delete old diagram file if it exists
        if (template.diagramPath) {
          try {
            const oldFilePath = path.join(process.cwd(), template.diagramPath);
            if (fs.existsSync(oldFilePath)) {
              await fs.promises.unlink(oldFilePath);
              console.log(`✅ Deleted old diagram: ${template.diagramPath}`);
            }
          } catch (err) {
            console.error("Error deleting old diagram file:", err);
          }
        }
        
        // Move new file to diagrams directory
        const newFileName = `${req.body.make}-${req.body.model}-${Date.now()}${path.extname(req.file.originalname)}`;
        const newFilePath = path.join(diagramsDir, newFileName);
        await fs.promises.rename(req.file.path, newFilePath);
        diagramPath = `uploads/vehicle-diagrams/${newFileName}`;
      }
      
      const updateData = {
        make: req.body.make,
        model: req.body.model,
        yearFrom: req.body.yearFrom ? parseInt(req.body.yearFrom) : null,
        yearTo: req.body.yearTo ? parseInt(req.body.yearTo) : null,
        diagramPath: diagramPath,
        description: req.body.description || null,
        updatedBy: user ? user.username : null,
      };
      
      const updated = await storage.updateVehicleDiagramTemplate(id, updateData);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating vehicle diagram template:", error);
      res.status(500).json({ message: "Error updating vehicle diagram template" });
    }
  });

  // Delete vehicle diagram template
  app.delete("/api/vehicle-diagram-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // First, unlink this template from any damage checks that reference it
      await storage.unlinkDiagramTemplateFromDamageChecks(id);
      
      // Delete the diagram file from filesystem
      if (template.diagramPath) {
        try {
          const filePath = path.join(process.cwd(), template.diagramPath);
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            console.log(`✅ Deleted vehicle diagram: ${template.diagramPath}`);
          }
        } catch (err) {
          console.error("Error deleting diagram file:", err);
        }
      }
      
      const deleted = await storage.deleteVehicleDiagramTemplate(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vehicle diagram template:", error);
      res.status(500).json({ message: "Error deleting vehicle diagram template" });
    }
  });

  // Serve vehicle diagram template image
  app.get("/api/vehicle-diagram-templates/:id/image", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      if (!template.diagramPath) {
        console.log(`❌ Template ${id} has no diagramPath`);
        return res.status(404).json({ message: "No diagram image available" });
      }
      
      const filePath = path.join(process.cwd(), template.diagramPath);
      console.log(`📁 Serving diagram template ${id}:`);
      console.log(`   Stored path: ${template.diagramPath}`);
      console.log(`   Resolved path: ${filePath}`);
      console.log(`   File exists: ${fs.existsSync(filePath)}`);
      console.log(`   Current working dir: ${process.cwd()}`);
      console.log(`   Uploads dir: ${uploadsDir}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found at: ${filePath}`);
        return res.status(404).json({ message: "Diagram image not found" });
      }
      
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving diagram template image:", error);
      res.status(500).json({ message: "Error serving diagram image" });
    }
  });

  // INTERACTIVE DAMAGE CHECK ROUTES
  
  // Get all interactive damage checks
  app.get("/api/interactive-damage-checks", requireAuth, async (req: Request, res: Response) => {
    try {
      const checks = await storage.getAllInteractiveDamageChecks();
      res.json(checks);
    } catch (error) {
      console.error("Error fetching interactive damage checks:", error);
      res.status(500).json({ message: "Error fetching interactive damage checks" });
    }
  });

  // Get interactive damage check by ID
  app.get("/api/interactive-damage-checks/:id", requireAuth, async (req: Request, res: Response) => {
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
  app.get("/api/interactive-damage-checks/vehicle/:vehicleId", requireAuth, async (req: Request, res: Response) => {
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
  app.get("/api/interactive-damage-checks/reservation/:reservationId", requireAuth, async (req: Request, res: Response) => {
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
  app.get("/api/interactive-damage-checks/vehicle/:vehicleId/customer/:customerId", requireAuth, async (req: Request, res: Response) => {
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
  app.post("/api/interactive-damage-checks", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const checkData = {
        ...req.body,
        checkDate: req.body.checkDate ? new Date(req.body.checkDate) : new Date(),
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
                buildYear: vehicle.productionDate,
                fuel: created.fuelLevel || vehicle.fuel || undefined,
                mileage: created.mileage || vehicle.mileage || undefined,
              },
              damageTemplate,
              reservationData,
              created
            );
            
            // Save PDF to uploads directory
            const filename = `damage_check_${created.vehicleId}_${created.checkType}_${format(new Date(created.checkDate), 'yyyy-MM-dd')}_v${created.id}.pdf`;
            const damageCheckDir = path.join(process.cwd(), 'uploads', vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '-'), 'damage-checks');
            await fs.promises.mkdir(damageCheckDir, { recursive: true });
            const filepath = path.join(damageCheckDir, filename);
            await fs.promises.writeFile(filepath, pdfBuffer);
            
            // Create document entry
            const relativePath = path.relative(process.cwd(), filepath);
            await storage.createDocument({
              vehicleId: created.vehicleId,
              reservationId: created.reservationId,
              documentType: `Damage Check (${created.checkType === 'pickup' ? 'Pickup' : 'Return'})`,
              fileName: filename,
              filePath: relativePath,
              contentType: 'application/pdf',
              fileSize: pdfBuffer.length,
              uploadedBy: user ? user.username : null,
            });

          }
        }
      } catch (pdfError) {
        console.error("Error generating damage check PDF document:", pdfError);
        // Don't fail the whole request if PDF generation fails
      }

      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating interactive damage check:", error);
      res.status(500).json({ message: "Error creating interactive damage check" });
    }
  });

  // Update interactive damage check
  app.put("/api/interactive-damage-checks/:id", requireAuth, async (req: Request, res: Response) => {
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
            const damageCheckDir = path.join(process.cwd(), 'uploads', vehicle.licensePlate.replace(/[^a-zA-Z0-9]/g, '-'), 'damage-checks');
            await fs.promises.mkdir(damageCheckDir, { recursive: true });
            const filepath = path.join(damageCheckDir, filename);
            await fs.promises.writeFile(filepath, pdfBuffer);
            
            // Create new document entry
            const relativePath = path.relative(process.cwd(), filepath);
            await storage.createDocument({
              vehicleId: updated.vehicleId,
              reservationId: updated.reservationId,
              documentType: `Damage Check (${updated.checkType === 'pickup' ? 'Pickup' : 'Return'})`,
              fileName: filename,
              filePath: relativePath,
              contentType: 'application/pdf',
              fileSize: pdfBuffer.length,
              uploadedBy: user ? user.username : null,
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
  app.get("/api/interactive-damage-checks/:id/pdf", requireAuth, async (req: Request, res: Response) => {
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
              endDate: format(new Date(reservation.endDate), 'dd-MM-yyyy'),
              rentalDays: Math.ceil((new Date(reservation.endDate).getTime() - new Date(reservation.startDate).getTime()) / (1000 * 60 * 60 * 24)),
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
          buildYear: vehicle.productionDate,
          fuel: check.fuelLevel || vehicle.fuel || undefined,
          mileage: check.mileage || vehicle.mileage || undefined,
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
  app.delete("/api/interactive-damage-checks/:id", requireAuth, async (req: Request, res: Response) => {
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
  app.get('/object-storage/*', async (req, res) => {
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
      const transport = await storage.createTransport(transportData);
      res.status(201).json(transport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transport data", errors: error.errors });
      }
      console.error("Error creating transport:", error);
      res.status(500).json({ message: "Failed to create transport" });
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
      const transport = await storage.updateTransport(id, transportData);
      if (!transport) {
        return res.status(404).json({ message: "Transport not found" });
      }
      res.json(transport);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transport data", errors: error.errors });
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
      const success = await storage.deleteTransport(id);
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

  app.get("/api/transport-report-templates/default", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const defaultTemplate = await storage.getDefaultTransportReportTemplate();
      if (!defaultTemplate) {
        return res.status(404).json({ message: "No default template found" });
      }
      res.json(defaultTemplate);
    } catch (error) {
      console.error("Error fetching default transport report template:", error);
      res.status(500).json({ message: "Failed to fetch default template" });
    }
  });

  app.get("/api/transport-report-templates/:id", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getTransportReportTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (error) {
      console.error("Error fetching transport report template:", error);
      res.status(500).json({ message: "Failed to fetch transport report template" });
    }
  });

  app.get("/api/transport-report-templates/:id/preview", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getTransportReportTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const dummyTransport = {
        id: 0,
        vehicleId: 0,
        relatedVehicleId: null,
        reservationId: null,
        customerId: 0,
        transportType: 'swap',
        status: 'scheduled',
        originAddress: 'Preview Street 1',
        originCity: 'Preview City',
        destinationAddress: 'Preview Street 2',
        destinationCity: 'Preview Destination',
        distanceKm: '25.5',
        tollCost: '3.75',
        isBreakdownOrMaintenance: false,
        billable: true,
        billableAmount: '75.00',
        invoiced: false,
        invoicedDate: null,
        scheduledDate: new Date().toISOString().split('T')[0],
        completedDate: null,
        driverName: 'Preview Driver',
        reason: 'Preview reason',
        notes: 'Preview notes',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
        createdByUser: null,
        updatedByUser: null,
        vehicle: { id: 0, brand: 'Preview Brand', model: 'Preview Model', licensePlate: 'XX-YY-99' } as any,
        customer: { id: 0, name: 'Preview Customer' } as any,
      };

      const { generateTransportReportsPdf } = await import('./utils/pdf-generator');
      const pdfBuffer = await generateTransportReportsPdf([dummyTransport as any], template);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=transport_report_template_preview_${id}.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating transport report template preview:", error);
      res.status(500).json({ message: "Failed to generate template preview" });
    }
  });

  app.post("/api/transport-report-templates", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templateData = insertTransportReportTemplateSchema.parse(req.body);
      const template = await storage.createTransportReportTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating transport report template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid template data", error: error.errors });
      } else {
        res.status(400).json({ message: "Failed to create transport report template" });
      }
    }
  });

  app.patch("/api/transport-report-templates/:id", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });

      const existing = await storage.getTransportReportTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      const templateData = insertTransportReportTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateTransportReportTemplate(id, templateData);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating transport report template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid template data", error: error.errors });
      } else {
        res.status(400).json({ message: "Failed to update transport report template" });
      }
    }
  });

  app.delete("/api/transport-report-templates/:id", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const existing = await storage.getTransportReportTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const deleted = await storage.deleteTransportReportTemplate(id);
      if (!deleted) return res.status(500).json({ message: "Failed to delete template" });
      res.status(200).json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting transport report template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Configure multer for transport report background uploads — images only
  const transportReportBackgroundUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter('document'),
  });

  app.post("/api/transport-report-templates/:id/background", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), transportReportBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getTransportReportTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'transport-report-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      if (template.backgroundPath) {
        try {
          await fs.promises.unlink(path.join(process.cwd(), template.backgroundPath));
        } catch (error) {
          console.error("Error deleting old transport report background:", error);
        }
      }

      const filename = `template_${id}_background_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = path.relative(process.cwd(), filePath);

      const updated = await storage.updateTransportReportTemplate(id, {
        backgroundPath,
        backgroundPreviewPath: backgroundPath,
      });
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error uploading transport report background:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.delete("/api/transport-report-templates/:id/background", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getTransportReportTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      if (template.backgroundPath) {
        try {
          await fs.promises.unlink(path.join(process.cwd(), template.backgroundPath));
        } catch (error) {
          console.error("Error deleting transport report background:", error);
        }
      }

      const updated = await storage.updateTransportReportTemplate(id, {
        backgroundPath: null,
        backgroundPreviewPath: null,
      } as any);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error removing transport report background:", error);
      res.status(500).json({ message: "Failed to remove background" });
    }
  });

  // Background library (multiple saved backgrounds per template, pick one active)
  app.get("/api/transport-report-templates/backgrounds/all", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const backgrounds = await storage.getAllTransportReportTemplateBackgrounds();
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching transport report backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.get("/api/transport-report-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      const backgrounds = await storage.getTransportReportTemplateBackgrounds(templateId);
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching transport report backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.post("/api/transport-report-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), transportReportBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getTransportReportTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'transport-report-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      const name = (req.body.name || req.file.originalname || 'Background').toString().slice(0, 100);
      const filename = `library_${templateId}_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = path.relative(process.cwd(), filePath);

      const background = await storage.createTransportReportTemplateBackground({
        templateId,
        name,
        backgroundPath,
        previewPath: backgroundPath,
      });
      res.status(201).json(background);
    } catch (error) {
      console.error("Error uploading transport report background to library:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.post("/api/transport-report-templates/:id/backgrounds/:backgroundId/select", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(templateId) || isNaN(backgroundId)) return res.status(400).json({ message: "Invalid ID" });
      const updated = await storage.selectTransportReportTemplateBackground(templateId, backgroundId);
      if (!updated) return res.status(404).json({ message: "Template or background not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error selecting transport report background:", error);
      res.status(500).json({ message: "Failed to select background" });
    }
  });

  app.delete("/api/transport-report-templates/:id/backgrounds/:backgroundId", hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(backgroundId)) return res.status(400).json({ message: "Invalid background ID" });
      const background = await storage.getTransportReportTemplateBackground(backgroundId);
      if (!background) return res.status(404).json({ message: "Background not found" });

      try {
        await fs.promises.unlink(path.join(process.cwd(), background.backgroundPath));
      } catch (error) {
        console.error("Error deleting transport report background file:", error);
      }

      const deleted = await storage.deleteTransportReportTemplateBackground(backgroundId);
      if (!deleted) return res.status(500).json({ message: "Failed to delete background" });
      res.status(200).json({ message: "Background deleted successfully" });
    } catch (error) {
      console.error("Error deleting transport report background:", error);
      res.status(500).json({ message: "Failed to delete background" });
    }
  });

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

      const template = templateId
        ? await storage.getTransportReportTemplate(templateId)
        : await storage.getDefaultTransportReportTemplate();

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
        const vehicleLabel = t.vehicle ? `${t.vehicle.brand}_${t.vehicle.model}` : `Vehicle_${t.vehicleId}`;
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
      const relativePath = path.relative(uploadsDir, filePath);

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