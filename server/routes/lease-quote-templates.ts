import type { Request, Response, Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
// FIX-R (BUG-086): multer parses the multipart body inside the route chain, long after
// app.use(sanitizeInput) ran, so these wrappers sanitize what it parsed.
import { sanitizeUploadedFields } from "../middleware/security/sanitization";
import { hasPermission } from "../middleware/permissions.js";
import { createSecureMulterFilter, validateFileBuffer } from "../utils/security/fileUploadSecurity";
import { storage } from "../storage";
import { getRelativePath, unlinkStoredFile } from "../services/document-paths";
import { insertLeaseQuoteTemplateSchema, UserPermission } from "../../shared/schema";
import { templateFieldsSchema, coerceFieldArray } from "../../shared/template-fields";
import { LEASE_QUOTE_TEMPLATE_SOURCES } from "../../shared/lease-quotes";
import type { RouteDeps } from "./deps";

/**
 * The lease quote template's `fields` is the same jsonb blob as the transport template's:
 * same schema, same bounds, same refusal (FIX-P) - plus a source whitelist, so a customer PDF
 * can never be told to print depreciation, interest, margin or any other cost-build-up value.
 */
function validateLeaseQuoteTemplateFields(res: Response, body: any): boolean {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ message: "Template data must be an object" });
    return false;
  }
  // Absent means "leave it alone"; an explicit null does not.
  if (!("fields" in body) || body.fields === undefined) return true;
  if (body.fields === null) {
    res.status(400).json({ message: "fields must be an array of field definitions" });
    return false;
  }
  let candidate: unknown = body.fields;
  if (typeof candidate === "string") {
    const parsedArray = coerceFieldArray(candidate);
    candidate = candidate.trim() === "" || parsedArray.length > 0 ? parsedArray : candidate;
  }
  if (!Array.isArray(candidate)) {
    res.status(400).json({ message: "fields must be an array of field definitions" });
    return false;
  }
  const parsed = templateFieldsSchema.safeParse(candidate);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid template field definitions",
      error: parsed.error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    return false;
  }
  const badSource = parsed.data.find((f) => f.source !== undefined && f.source !== "" && !LEASE_QUOTE_TEMPLATE_SOURCES.includes(f.source));
  if (badSource) {
    res.status(400).json({ message: `Source "${badSource.source}" is not available on a lease quote` });
    return false;
  }
  body.fields = parsed.data;
  return true;
}

export function registerLeaseQuoteTemplateRoutes(app: Express, deps: RouteDeps): void {
  const { uploadsDir } = deps;
  const perm = hasPermission(UserPermission.MANAGE_PDF_TEMPLATES);

  app.get("/api/lease-quote-templates", perm, async (_req: Request, res: Response) => {
    try {
      const templates = await storage.getAllLeaseQuoteTemplates();
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.json(templates);
    } catch (error) {
      console.error("Error fetching lease quote templates:", error);
      res.status(500).json({ message: "Failed to fetch lease quote templates" });
    }
  });

  app.get("/api/lease-quote-templates/default", perm, async (req: Request, res: Response) => {
    try {
      const defaultTemplate = await storage.getDefaultLeaseQuoteTemplate();
      if (!defaultTemplate) {
        return res.status(404).json({ message: "No default template found" });
      }
      res.json(defaultTemplate);
    } catch (error) {
      console.error("Error fetching default lease quote template:", error);
      res.status(500).json({ message: "Failed to fetch default template" });
    }
  });

  app.get("/api/lease-quote-templates/:id", perm, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getLeaseQuoteTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (error) {
      console.error("Error fetching lease quote template:", error);
      res.status(500).json({ message: "Failed to fetch lease quote template" });
    }
  });

  app.post("/api/lease-quote-templates", perm, async (req: Request, res: Response) => {
    try {
      if (!validateLeaseQuoteTemplateFields(res, req.body)) return;
      const templateData = insertLeaseQuoteTemplateSchema.parse(req.body);
      const template = await storage.createLeaseQuoteTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating lease quote template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid template data", error: error.errors });
      } else {
        res.status(400).json({ message: "Failed to create lease quote template" });
      }
    }
  });

  app.patch("/api/lease-quote-templates/:id", perm, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });

      const existing = await storage.getLeaseQuoteTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      if (!validateLeaseQuoteTemplateFields(res, req.body)) return;
      const templateData = insertLeaseQuoteTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateLeaseQuoteTemplate(id, templateData);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating lease quote template:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid template data", error: error.errors });
      } else {
        res.status(400).json({ message: "Failed to update lease quote template" });
      }
    }
  });

  app.delete("/api/lease-quote-templates/:id", perm, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const existing = await storage.getLeaseQuoteTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const deleted = await storage.deleteLeaseQuoteTemplate(id);
      if (!deleted) return res.status(500).json({ message: "Failed to delete template" });
      res.status(200).json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting lease quote template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // ==================== BARCODE LABEL TEMPLATE ROUTES ====================
  app.get("/api/lease-quote-templates/:id/preview", perm, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getLeaseQuoteTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const { drawLeaseQuoteTemplate } = await import("../utils/lease-quote-pdf");
      const { leaseQuotePreviewData } = await import("../utils/preview-sample");
      const { sampleSignaturePng } = await import("../utils/sample-signature");
      const pdf = await drawLeaseQuoteTemplate(template, leaseQuotePreviewData(), { landlordSignaturePng: sampleSignaturePng() });
      const buffer = Buffer.from(pdf);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=lease_quote_template_preview_${id}.pdf`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error) {
      console.error("Error generating lease quote template preview:", error);
      res.status(500).json({ message: "Failed to generate template preview" });
    }
  });

  // Configure multer for lease quote background uploads — JPG/PNG images only (same as the transport template)
  const leaseQuoteBackgroundUpload = sanitizeUploadedFields(multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter('document'),
  }));

  app.post("/api/lease-quote-templates/:id/background", perm, leaseQuoteBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getLeaseQuoteTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'lease-quote-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      if (template.backgroundPath) {
        // BUG-070/FIX-B: contained delete only — this used to join cwd onto a
        // stored path column, which is an arbitrary file delete.
        await unlinkStoredFile(template.backgroundPath);
      }

      const filename = `template_${id}_background_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = getRelativePath(filePath);

      const updated = await storage.updateLeaseQuoteTemplate(id, {
        backgroundPath,
        backgroundPreviewPath: backgroundPath,
      });
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error uploading lease quote background:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.delete("/api/lease-quote-templates/:id/background", perm, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getLeaseQuoteTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      if (template.backgroundPath) {
        // BUG-070/FIX-B: contained delete only.
        await unlinkStoredFile(template.backgroundPath);
      }

      const updated = await storage.updateLeaseQuoteTemplate(id, {
        backgroundPath: null,
        backgroundPreviewPath: null,
      } as any);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error removing lease quote background:", error);
      res.status(500).json({ message: "Failed to remove background" });
    }
  });

  // Background library (multiple saved backgrounds per template, pick one active)
  app.get("/api/lease-quote-templates/backgrounds/all", perm, async (req: Request, res: Response) => {
    try {
      const backgrounds = await storage.getAllLeaseQuoteTemplateBackgrounds();
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching lease quote backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.get("/api/lease-quote-templates/:id/backgrounds", perm, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      const backgrounds = await storage.getLeaseQuoteTemplateBackgrounds(templateId);
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching lease quote backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.post("/api/lease-quote-templates/:id/backgrounds", perm, leaseQuoteBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getLeaseQuoteTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'lease-quote-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      const name = (req.body.name || req.file.originalname || 'Background').toString().slice(0, 100);
      const filename = `library_${templateId}_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = getRelativePath(filePath);

      const background = await storage.createLeaseQuoteTemplateBackground({
        templateId,
        name,
        backgroundPath,
        previewPath: backgroundPath,
      });
      res.status(201).json(background);
    } catch (error) {
      console.error("Error uploading lease quote background to library:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.post("/api/lease-quote-templates/:id/backgrounds/:backgroundId/select", perm, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(templateId) || isNaN(backgroundId)) return res.status(400).json({ message: "Invalid ID" });
      const updated = await storage.selectLeaseQuoteTemplateBackground(templateId, backgroundId);
      if (!updated) return res.status(404).json({ message: "Template or background not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error selecting lease quote background:", error);
      res.status(500).json({ message: "Failed to select background" });
    }
  });

  app.delete("/api/lease-quote-templates/:id/backgrounds/:backgroundId", perm, async (req: Request, res: Response) => {
    try {
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(backgroundId)) return res.status(400).json({ message: "Invalid background ID" });
      const background = await storage.getLeaseQuoteTemplateBackground(backgroundId);
      if (!background) return res.status(404).json({ message: "Background not found" });

      // BUG-070/FIX-B: contained delete only.
      await unlinkStoredFile(background.backgroundPath);

      const deleted = await storage.deleteLeaseQuoteTemplateBackground(backgroundId);
      if (!deleted) return res.status(500).json({ message: "Failed to delete background" });
      res.status(200).json({ message: "Background deleted successfully" });
    } catch (error) {
      console.error("Error deleting lease quote background:", error);
      res.status(500).json({ message: "Failed to delete background" });
    }
  });
}
