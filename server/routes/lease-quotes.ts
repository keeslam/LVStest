import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sanitizeUploadedFields } from "../middleware/security/sanitization";
import { createSecureMulterFilter, sanitizeFilename, validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { assertWithinUploads, getUploadsDir } from "../../shared/paths";
import { customers, leaseQuoteFiles, leaseQuotes } from "../../shared/schema";
import { scanDealerQuote } from "../utils/dealer-quote-scanner";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { LEASE_QUOTE_STATUSES, leaseQuotePayloadSchema, suggestedPurchasePrice } from "../../shared/lease-quotes";
import {
  copyLeaseQuote, createLeaseQuote, deleteLeaseQuote, getLeaseQuote, getLeaseQuoteSettings, listLeaseQuotes,
  quoteFilesFolder, updateLeaseQuote, updateLeaseQuoteSettings,
} from "../services/lease-quotes";
import { storage } from "../storage";
import { companyName } from "../services/company-name";
import { officeTimeZone } from "../services/office-time";
import { generateLeaseQuotePdf, prepareLeaseQuoteData } from "../utils/lease-quote-pdf";
import { loadStaffSignaturePng } from "../utils/pdf-generator";
import { currentRequestUserId } from "../services/request-user";
import type { RouteDeps } from "./deps";

const canManage = hasPermission(UserPermission.MANAGE_LEASE_QUOTES);

const amount = z.number().finite().min(0);
const settingsSchema = z.object({
  interestRatePercent: amount.max(100).optional(),
  marginPerMonth: amount.optional(),
  robPerYear: amount.optional(),
  otherCostsPerYear: amount.optional(),
  excessKmPrice: amount.optional(),
  shortfallKmPrice: amount.optional(),
  validityDays: z.number().int().min(1).max(3650).optional(),
});

function idParam(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ message: "Invalid id" }); return null; }
  return id;
}

function badRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({ message: "Validation error", errors: error.errors });
}

const actorName = (req: Request) => req.user?.username ?? null;

/** "2026-10-27-2359" in office time, for the generated file name. */
function fileStamp(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: officeTimeZone(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`;
}

class QuoteNotFoundError extends Error {}

async function quoteExists(id: number): Promise<boolean> {
  const [row] = await db.select({ id: leaseQuotes.id }).from(leaseQuotes).where(eq(leaseQuotes.id, id));
  return !!row;
}

/** A file row only counts when it belongs to the quote in the URL. */
async function findQuoteFile(quoteId: number, fileId: number) {
  const [row] = await db.select().from(leaseQuoteFiles).where(and(eq(leaseQuoteFiles.id, fileId), eq(leaseQuoteFiles.quoteId, quoteId)));
  return row ?? null;
}

function fileIds(req: Request, res: Response): { id: number; fileId: number } | null {
  const id = idParam(req, res); if (id === null) return null;
  const fileId = parseInt(req.params.fileId, 10);
  if (!Number.isInteger(fileId) || fileId < 1) { res.status(400).json({ message: "Invalid id" }); return null; }
  return { id, fileId };
}

// Dealer quotes: PDF or photo, 10 MB, stored below uploads/lease-quotes/<id>/ (the quote must exist first).
const dealerUpload = sanitizeUploadedFields(multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id < 1) return cb(new QuoteNotFoundError(), "");
      quoteExists(id).then((found) => {
        if (!found) return cb(new QuoteNotFoundError(), "");
        const dir = path.join(getUploadsDir(), quoteFilesFolder(id));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      }, (e) => cb(e, ""));
    },
    filename: (_req, file, cb) => cb(null, `dealer_${Date.now()}${path.extname(sanitizeFilename(file.originalname))}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: createSecureMulterFilter("document"),
}));

export function registerLeaseQuoteRoutes(app: Express, _deps?: RouteDeps) {
  // /settings is registered before /:id so it is never read as an id.
  app.get("/api/lease-quotes/settings", canManage, async (_req, res) => {
    res.json(await getLeaseQuoteSettings());
  });

  app.put("/api/lease-quotes/settings", canManage, async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    res.json(await updateLeaseQuoteSettings(parsed.data, actorName(req)));
  });

  app.get("/api/lease-quotes", canManage, async (req, res) => {
    const status = typeof req.query.status === "string" && req.query.status !== "" ? req.query.status : undefined;
    if (status && status !== "expired" && !(LEASE_QUOTE_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ message: "Unknown status" });
    }
    const result = await listLeaseQuotes({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      sort: typeof req.query.sort === "string" ? req.query.sort : undefined,
      dir: typeof req.query.dir === "string" ? req.query.dir : undefined,
    });
    res.json(result);
  });

  app.get("/api/lease-quotes/:id", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const quote = await getLeaseQuote(id);
    if (!quote) return res.status(404).json({ message: "Lease quote not found" });
    res.json(quote);
  });

  // An empty body creates a concept with defaults; a body must be a complete payload (variants included).
  app.post("/api/lease-quotes", canManage, async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (Object.keys(body).length === 0) {
      return res.status(201).json(await createLeaseQuote({}, actorName(req)));
    }
    const parsed = leaseQuotePayloadSchema.safeParse(body);
    if (!parsed.success) return badRequest(res, parsed.error);
    res.status(201).json(await createLeaseQuote(parsed.data, actorName(req)));
  });

  app.patch("/api/lease-quotes/:id", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const parsed = leaseQuotePayloadSchema.safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    const chosen = parsed.data.variants.find((v) => v.isChosen);
    if (!chosen || chosen.termMonths < 1) {
      return res.status(400).json({ message: "The chosen variant needs a term of at least 1 month" });
    }
    const quote = await updateLeaseQuote(id, parsed.data, actorName(req));
    if (!quote) return res.status(404).json({ message: "Lease quote not found" });
    res.json(quote);
  });

  app.post("/api/lease-quotes/:id/copy", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const parsed = z.object({ withAttachments: z.boolean() }).safeParse(req.body ?? {});
    if (!parsed.success) return badRequest(res, parsed.error);
    const copy = await copyLeaseQuote(id, parsed.data.withAttachments, actorName(req));
    if (!copy) return res.status(404).json({ message: "Lease quote not found" });
    res.status(201).json(copy);
  });

  // Delete = move to the recycle bin (deleted_records); the audit middleware writes lease_quote.delete.
  app.delete("/api/lease-quotes/:id", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const deleted = await deleteLeaseQuote(id, { username: actorName(req), userId: req.user?.id ?? null });
    if (!deleted) return res.status(404).json({ message: "Lease quote not found" });
    res.json({ ok: true, quoteNumber: deleted.quoteNumber });
  });

  // ---- Files: dealer quotes (uploaded) and generated customer PDFs -------------------
  app.post("/api/lease-quotes/:id/files", canManage, (req, res, next) => {
    dealerUpload.single("file")(req, res, (err?: unknown) => {
      if (err instanceof QuoteNotFoundError) return res.status(404).json({ message: "Lease quote not found" });
      if (err) return next(err);
      next();
    });
  }, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const check = await validateAfterUpload(req.file.path, req.file.originalname, req.file.mimetype, "document");
      if (!check.valid) {
        fs.rmSync(req.file.path, { force: true });
        return res.status(400).json({ message: check.error ?? "Invalid file", code: "LEASE_FILE_INVALID" });
      }
      const [row] = await db.insert(leaseQuoteFiles).values({
        quoteId: id,
        kind: "dealer",
        fileName: sanitizeFilename(req.file.originalname),
        filePath: `${quoteFilesFolder(id)}/${req.file.filename}`,
        fileSize: req.file.size,
        contentType: req.file.mimetype,
        createdBy: actorName(req),
      }).returning();
      res.status(201).json(row);
    } catch (e) {
      fs.rmSync(req.file.path, { force: true });
      console.error("Lease quote file could not be stored:", e);
      res.status(500).json({ message: "The file could not be stored", code: "LEASE_FILE_FAILED" });
    }
  });

  // Customer PDF: drawn with the default template, stored as a generated copy (a record of what the customer got).
  app.post("/api/lease-quotes/:id/pdf", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const quote = await getLeaseQuote(id);
    if (!quote) return res.status(404).json({ message: "Lease quote not found" });
    const template = await storage.getDefaultLeaseQuoteTemplate();
    if (!template) return res.status(409).json({ message: "There is no PDF template for lease quotes yet", code: "LEASE_NO_TEMPLATE" });
    const chosen = quote.variants.find((v) => v.isChosen);
    if (!chosen) return res.status(409).json({ message: "The quote has no chosen variant", code: "LEASE_NO_VARIANT" });
    let abs = "";
    try {
      const customer = quote.customerId
        ? (await db.select().from(customers).where(eq(customers.id, quote.customerId)))[0] ?? null
        : null;
      const data = prepareLeaseQuoteData(quote, chosen, customer, { companyName: companyName() });
      // The landlord signature is the one of the staff member making this request (Profiel); none = box stays empty.
      const landlordSignaturePng = await loadStaffSignaturePng(currentRequestUserId() ?? req.user?.id ?? null);
      const pdf = await generateLeaseQuotePdf(data, template, { landlordSignaturePng });
      const fileName = `${quote.quoteNumber}-${fileStamp()}.pdf`;
      const stored = `generated_${Date.now()}_${Math.round(Math.random() * 1e6)}.pdf`;
      const dir = path.join(getUploadsDir(), quoteFilesFolder(id));
      fs.mkdirSync(dir, { recursive: true });
      abs = assertWithinUploads(path.join(dir, stored), "lease quote file");
      fs.writeFileSync(abs, pdf);
      const [row] = await db.insert(leaseQuoteFiles).values({
        quoteId: id, kind: "generated", fileName, filePath: `${quoteFilesFolder(id)}/${stored}`,
        fileSize: pdf.length, contentType: "application/pdf", createdBy: actorName(req),
      }).returning();
      res.status(201).json(row);
    } catch (e) {
      if (abs) fs.rmSync(abs, { force: true });
      console.error("Lease quote PDF could not be generated:", e);
      res.status(500).json({ message: "The PDF could not be generated", code: "LEASE_PDF_FAILED" });
    }
  });

  // Reads a dealer quote with the AI. Only proposes values; the quote is never changed here.
  app.post("/api/lease-quotes/:id/files/:fileId/scan", canManage, async (req, res) => {
    const ids = fileIds(req, res); if (ids === null) return;
    const file = await findQuoteFile(ids.id, ids.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });
    try {
      const abs = assertWithinUploads(path.join(getUploadsDir(), file.filePath), "lease quote file");
      const parsed = await scanDealerQuote(abs, file.contentType ?? "application/pdf");
      res.json({ parsed, suggestion: suggestedPurchasePrice(parsed) });
    } catch (e) {
      // The scanner's text (key names, provider errors) stays in the log.
      console.error("Dealer quote scan failed:", e instanceof Error ? e.message : e);
      res.status(502).json({ message: "The quote could not be read", code: "LEASE_SCAN_FAILED" });
    }
  });

  app.get("/api/lease-quotes/:id/files/:fileId", canManage, async (req, res) => {
    const ids = fileIds(req, res); if (ids === null) return;
    const file = await findQuoteFile(ids.id, ids.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });
    let abs: string;
    try { abs = assertWithinUploads(path.join(getUploadsDir(), file.filePath), "lease quote file"); }
    catch { return res.status(404).json({ message: "File not found" }); }
    if (!fs.existsSync(abs)) return res.status(404).json({ message: "File not found" });
    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(file.fileName)}"`);
    fs.createReadStream(abs).pipe(res);
  });

  // Generated PDFs are a record of what the customer received; only dealer files can be removed.
  app.delete("/api/lease-quotes/:id/files/:fileId", canManage, async (req, res) => {
    const ids = fileIds(req, res); if (ids === null) return;
    const file = await findQuoteFile(ids.id, ids.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });
    if (file.kind !== "dealer") return res.status(409).json({ message: "A generated PDF cannot be deleted", code: "LEASE_FILE_GENERATED" });
    await db.delete(leaseQuoteFiles).where(eq(leaseQuoteFiles.id, file.id));
    try { fs.rmSync(assertWithinUploads(path.join(getUploadsDir(), file.filePath), "lease quote file"), { force: true }); }
    catch (e) { console.warn("Lease quote file left on disk:", e instanceof Error ? e.message : e); }
    res.json({ ok: true });
  });
}
