import type { Request, Response } from "express";
import { format } from "date-fns";
import { storage } from "../storage";
import path from "path";
import fs from "fs";
import { insertDamageCheckTemplateSchema, UserPermission, DEFAULT_DAMAGE_CHECK_FIELDS, DAMAGE_CHECK_FIELDS_KEY } from "../../shared/schema";
import multer from "multer";
import { hasPermission } from "../middleware/permissions.js";
import { createSecureMulterFilter, validateFileBuffer } from "../utils/security/fileUploadSecurity";
import { getRelativePath } from "../services/document-paths";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerDamageCheckTemplateRoutes(app: Express, deps: RouteDeps): void {
  const { upload, diagramUpload, uploadsDir } = deps;


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
          const { storage } = await import("../storage");
          const { DAMAGE_CHECK_FIELDS_KEY, DEFAULT_DAMAGE_CHECK_FIELDS } =
            await import("@shared/schema");
          const setting = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
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
          "../pdf-damage-check-generator"
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
}
