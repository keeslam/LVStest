import multer from "multer";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { processInvoiceWithAI, generateInvoiceHash, validateParsedInvoice } from "../utils/invoice-scanner";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { insertExpenseSchema, UserPermission } from "../../shared/schema";
import { realtimeEvents } from "../realtime-events";
import { hasPermission } from "../middleware/permissions.js";
import { getUploadsDir } from "../../shared/paths";
import { validateAfterUpload, sanitizeFilename, createSecureMulterFilter } from "../utils/security/fileUploadSecurity";
import { getRelativePath } from "../services/document-paths";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

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
  const expenseReceiptUpload = multer({
    storage: expenseReceiptStorage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for PDFs and images
    },
    fileFilter: createSecureMulterFilter('document'),
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
}
