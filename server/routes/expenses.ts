import multer from "multer";
// FIX-R (BUG-086): multer parses the multipart body inside the route chain,
// long after app.use(sanitizeInput) ran — so these wrappers sanitize what it
// parsed.
import { sanitizeUploadedFields } from "../middleware/security/sanitization";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { processInvoiceWithAI, generateInvoiceHash, validateParsedInvoice } from "../utils/invoice-scanner";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { insertExpenseSchema, UserPermission } from "../../shared/schema";
import { realtimeEvents } from "../realtime-events";
import { hasPermission } from "../middleware/permissions.js";
import { getUploadsDir } from "../../shared/paths";
import { validateAfterUpload, sanitizeFilename, createSecureMulterFilter } from "../utils/security/fileUploadSecurity";
import { getRelativePath, resolveDocumentFilePath } from "../services/document-paths";
import { bookInvoiceAsExpenses, receiptFromStoredPath, resolveInvoiceFile, type BookInvoiceResult } from "../services/expenses/book-invoice";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { computeInvoiceHash, sha256 } from "../services/invoice-inbox/hash";
import { INTERRUPTED_BOOKING_MESSAGE, type InboxParsedInvoice } from "../../shared/invoice-inbox";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

/**
 * C2 — the only content types a receipt may be served with inline. Everything
 * else (including a row with no stored type and an unfamiliar extension) goes
 * out as `application/octet-stream` with `Content-Disposition: attachment`.
 */
const SERVABLE_RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const RECEIPT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp",
};

/**
 * The type a receipt may be served with, or null for "hand it over as a
 * download". Receipts uploaded by staff carry the content type multer read;
 * rows written before that field existed fall back to their extension, and only
 * for the four types above.
 */
export function servableReceiptType(storedType: string | null | undefined, filePath: string): string | null {
  const declared = String(storedType ?? "").toLowerCase().trim().split(";")[0].trim();
  if (declared) return SERVABLE_RECEIPT_TYPES.includes(declared) ? declared : null;
  return RECEIPT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerExpenseRoutes(app: Express, deps: RouteDeps): void {
  const { upload } = deps;

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
  const expenseReceiptUpload = sanitizeUploadedFields(multer({
    storage: expenseReceiptStorage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for PDFs and images
    },
    fileFilter: createSecureMulterFilter('document'),
  }));


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
  app.get("/api/expenses/:id/receipt", hasPermission(UserPermission.MANAGE_EXPENSES), async (req: Request, res: Response) => {
    try {
      const expense = await storage.getExpense(parseInt(req.params.id));
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }

      if (!expense.receiptFilePath) {
        return res.status(404).json({ error: "No receipt file found for this expense" });
      }

      // BUG-060: path.resolve() on a stored string served any absolute path in
      // the container. Everything now goes through resolveDocumentFilePath(),
      // which refuses anything outside the uploads directory.
      const filePath = resolveDocumentFilePath(expense.receiptFilePath);
      if (!filePath) {
        console.warn(`Refused receipt path outside the uploads directory (expense ${expense.id}): ${expense.receiptFilePath}`);
        return res.status(404).json({ error: "Receipt file not found on disk" });
      }

      // C2: res.sendFile() derived the Content-Type from the file name, and a
      // mailed invoice used to be stored under the name its sender chose — so a
      // `.html` "invoice" was served as text/html on the app's own origin. The
      // type comes from an allowlist applied to the stored content type now;
      // anything else is a download, and nothing is ever sniffed.
      const type = servableReceiptType(expense.receiptContentType, filePath);
      const fileName = path.basename(expense.receiptFile || filePath).replace(/[^A-Za-z0-9._-]/g, "_");
      res.setHeader("Content-Type", type ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `${type ? "inline" : "attachment"}; filename="${fileName}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");

      // Serve the file
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error("Error serving receipt file:", err);
          if (!res.headersSent) res.status(500).json({ error: "Failed to serve receipt file" });
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
        });
      }
    }
  });
  
  // Create expense with receipt upload (Dedicated endpoint for file uploads)
  app.post("/api/expenses/with-receipt", hasPermission(UserPermission.MANAGE_EXPENSES), expenseReceiptUpload.single('receiptFile'), async (req, res) => {
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
        });
      }
    }
  });

  // Update expense with receipt upload
  app.patch("/api/expenses/:id", hasPermission(UserPermission.MANAGE_EXPENSES), expenseReceiptUpload.single('receiptFile'), async (req, res) => {
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
        });
      }
    }
  });
  
  // Update expense with receipt upload (Dedicated endpoint for file uploads)
  app.patch("/api/expenses/:id/with-receipt", hasPermission(UserPermission.MANAGE_EXPENSES), expenseReceiptUpload.single('receiptFile'), async (req, res) => {
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
        });
      }
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
      });
    }
  });


  // Create expenses from scanned invoice
  const fromInvoiceSchema = z.object({
    invoice: z.object({
      vendor: z.string().max(300).optional().default(""),
      invoiceNumber: z.string().max(200).optional().default(""),
      invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      totalAmount: z.coerce.number().min(0).optional().default(0),
    }).passthrough(),
    vehicleId: z.coerce.number().int().positive(),
    filePath: z.string().max(1000).nullable().optional(),
    lineItems: z.array(z.object({
      description: z.string().trim().min(1).max(1000),
      amount: z.coerce.number().positive().max(1000000),
      category: z.string().trim().min(1).max(100),
    })).min(1).max(200),
  });

  app.post("/api/expenses/from-invoice", hasPermission(UserPermission.MANAGE_EXPENSES), async (req: Request, res: Response) => {
    try {
      const parsedBody = fromInvoiceSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const { invoice, vehicleId, filePath, lineItems } = parsedBody.data;
      const invoiceDate = invoice.invoiceDate ?? new Date().toISOString().split('T')[0];

      const vehicle = await storage.getVehicle(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // The path comes from the client: only a file inside the invoice folders counts (BUG-060).
      const receipt = receiptFromStoredPath(filePath);
      const receiptAbsolute = receipt ? resolveInvoiceFile(filePath) : null;
      const attachmentHash = receiptAbsolute ? sha256(fs.readFileSync(receiptAbsolute)) : sha256(`manual:${crypto.randomUUID()}`);
      const invoiceHash = computeInvoiceHash({ ...invoice, invoiceDate });

      // Same file, or same invoice in another file, already booked or waiting for review?
      const sameFile = await inboxStorage.getByAttachmentHash(attachmentHash);
      const sameInvoice = invoiceHash ? await inboxStorage.findActiveByInvoiceHash(invoiceHash) : undefined;
      const clash = [sameFile, sameInvoice].find((i) => i && (i.status === "booked" || i.status === "review"));
      if (clash) {
        return res.status(409).json({
          message: clash.status === "booked"
            ? "Deze factuur is al geboekt."
            : "Deze factuur staat al bij Ontvangen facturen ter controle. Boek hem daar.",
          inboxItemId: clash.id,
          status: clash.status,
        });
      }

      const currentUser = (req as any).user?.username || 'system';
      const parsedForItem = { ...invoice, invoiceDate, currency: (invoice as any).currency ?? "EUR", lineItems } as unknown as InboxParsedInvoice;
      const itemData = {
        attachmentName: receipt?.fileName ?? null, attachmentPath: receipt?.relativePath ?? null,
        attachmentContentType: receipt?.contentType ?? null, invoiceHash, parsed: parsedForItem,
        status: "review", reviewReason: null, vehicleId, errorMessage: null, updatedBy: currentUser,
      };
      // A dismissed item for the same file is taken over instead of violating the unique hash.
      const item = sameFile
        ? (await inboxStorage.update(sameFile.id, itemData))!
        : await inboxStorage.create({ ...itemData, attachmentHash, createdBy: currentUser });

      // From here the inbox item exists (created or taken over above); if
      // anything below throws, the item must not be left as "review" with no
      // reason — that state means "importer was interrupted mid-booking" and
      // would otherwise wait forever for a mail that will never arrive.
      let booked: BookInvoiceResult;
      try {
        booked = await bookInvoiceAsExpenses({
          invoice: { vendor: invoice.vendor, invoiceNumber: invoice.invoiceNumber, invoiceDate },
          vehicleId, lineItems, receipt, inboxItemId: item.id, createdBy: currentUser,
        });

        if (booked.expenses.length === 0) {
          await inboxStorage.update(item.id, { reviewReason: "parse_failed", errorMessage: booked.errors.join("; ").slice(0, 2000) || "Boeken mislukt" });
          return res.status(400).json({ message: "No expenses could be created" });
        }

        await inboxStorage.update(item.id, {
          status: "booked", reviewReason: null, expenseIds: booked.expenses.map((e) => e.id),
          errorMessage: booked.errors.length ? booked.errors.join("; ").slice(0, 2000) : null,
          processedAt: new Date(), updatedBy: currentUser,
        });
      } catch (error) {
        try {
          const expenseIds = await inboxStorage.expenseIdsFor(item.id);
          if (expenseIds.length > 0) {
            await inboxStorage.update(item.id, {
              status: "booked", reviewReason: null, expenseIds, processedAt: new Date(), updatedBy: currentUser,
            });
          } else {
            await inboxStorage.update(item.id, { reviewReason: "parse_failed", errorMessage: INTERRUPTED_BOOKING_MESSAGE });
          }
        } catch (compensationError) {
          console.error("Failed to update inbox item after a booking error:", compensationError);
        }
        throw error;
      }

      res.json({
        success: true,
        message: `Successfully created ${booked.expenses.length} expense(s)`,
        expenses: booked.expenses,
        inboxItemId: item.id,
        invoice: {
          vendor: invoice.vendor,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate,
          totalAmount: invoice.totalAmount
        }
      });

    } catch (error) {
      console.error("Error creating expenses from invoice:", error);
      res.status(500).json({
        message: "Failed to create expenses from invoice",
      });
    }
  });
}
