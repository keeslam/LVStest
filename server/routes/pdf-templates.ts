import type { Request, Response } from "express";
import { storage } from "../storage";
import { generateRentalContractFromTemplate } from "../utils/pdf-generator";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { insertPdfTemplateSchema, Reservation, UserPermission } from "../../shared/schema";
import multer from "multer";
import { hasPermission } from "../middleware/permissions.js";
import { createSecureMulterFilter, validateFileBuffer } from "../utils/security/fileUploadSecurity";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerPdfTemplateRoutes(app: Express, deps: RouteDeps): void {
  const { upload, uploadsDir } = deps;


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
      const dummyReservation = {
        id: 0, // Use 0 to indicate preview mode
        vehicleId: 0,
        customerId: 0,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days later
        totalPrice: '750',
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
      } as unknown as Reservation;
      
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
          fieldsLength = (template.fields as unknown[]).length;
        }
      }
      
      console.log(`Preview template has ${fieldsLength} fields`);
      
      // Import necessary functions
      const { generateRentalContractFromTemplate } = await import('../utils/pdf-generator');
      
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
          const { convertPdfToPng, getPreviewPath } = await import('../utils/pdf-to-image');
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
          const { convertPdfToPng } = await import('../utils/pdf-to-image');
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
}
