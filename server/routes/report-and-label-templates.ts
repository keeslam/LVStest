import type { Request, Response } from "express";
import { storage } from "../storage";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { insertTransportReportTemplateSchema, insertBarcodeLabelTemplateSchema, UserPermission } from "../../shared/schema";
import multer from "multer";
import { hasPermission } from "../middleware/permissions.js";
import { createSecureMulterFilter, validateFileBuffer } from "../utils/security/fileUploadSecurity";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerReportAndLabelTemplateRoutes(app: Express, deps: RouteDeps): void {
  const { upload, uploadsDir, requireAuth } = deps;


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
        relatedVehicleId: 0,
        reservationId: null,
        customerId: 0,
        spareRequired: true,
        spareReservationId: null,
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
        relatedVehicle: { id: 0, brand: 'Replacement Brand', model: 'Replacement Model', licensePlate: 'AA-BB-11' } as any,
        customer: { id: 0, name: 'Preview Customer' } as any,
      };

      const { generateTransportReportsPdf } = await import('../utils/pdf-generator');
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

  // ==================== BARCODE LABEL TEMPLATE ROUTES ====================
  // Clone of the transport report template routes above (same drag-position
  // fields model), for key-label sticker templates. Two deliberate differences:
  // no background/preview endpoints (labels print on blank sticker stock), and
  // the GETs are requireAuth only — normal staff need to read the template list
  // to pick a layout in the print dialogs. Writes still need MANAGE_PDF_TEMPLATES.

  app.get("/api/barcode-label-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const templates = await storage.getBarcodeLabelTemplates();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.json(templates);
    } catch (error) {
      console.error("Error fetching barcode label templates:", error);
      res.status(500).json({ message: "Failed to fetch barcode label templates" });
    }
  });

  app.get("/api/barcode-label-templates/default", requireAuth, async (req: Request, res: Response) => {
    try {
      const defaultTemplate = await storage.getDefaultBarcodeLabelTemplate();
      if (!defaultTemplate) {
        return res.status(404).json({ message: "No default template found" });
      }
      res.json(defaultTemplate);
    } catch (error) {
      console.error("Error fetching default barcode label template:", error);
      res.status(500).json({ message: "Failed to fetch default template" });
    }
  });

  app.get("/api/barcode-label-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getBarcodeLabelTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (error) {
      console.error("Error fetching barcode label template:", error);
      res.status(500).json({ message: "Failed to fetch barcode label template" });
    }
  });

  app.post("/api/barcode-label-templates", requireAuth, hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const templateData = insertBarcodeLabelTemplateSchema.parse(req.body);
      const template = await storage.createBarcodeLabelTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating barcode label template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid template data", error: error.errors });
      } else {
        res.status(400).json({ message: "Failed to create barcode label template" });
      }
    }
  });

  app.patch("/api/barcode-label-templates/:id", requireAuth, hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });

      const existing = await storage.getBarcodeLabelTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      const templateData = insertBarcodeLabelTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateBarcodeLabelTemplate(id, templateData);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating barcode label template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid template data", error: error.errors });
      } else {
        res.status(400).json({ message: "Failed to update barcode label template" });
      }
    }
  });

  app.delete("/api/barcode-label-templates/:id", requireAuth, hasPermission(UserPermission.MANAGE_PDF_TEMPLATES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const existing = await storage.getBarcodeLabelTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const deleted = await storage.deleteBarcodeLabelTemplate(id);
      if (!deleted) return res.status(500).json({ message: "Failed to delete template" });
      res.status(200).json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting barcode label template:", error);
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
}
