import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission, insertFineSchema } from "../../shared/schema";
import { isValidFineTransition, FINE_TRANSITIONS, normalizeLicensePlate, type FineStatusValue } from "../../shared/fines";
import { finesStorage } from "../services/fines-storage";
import { findCandidates, linkFineManually, unlinkFine } from "../services/fine-attribution";
import { createFineWithAttribution } from "../services/fine-create";
import { sendFineLinkedMail } from "../services/portal-mail";
import { customerNotifications } from "../services/portal-customer-notifications";
import { getPortalConfig } from "../services/portal-config";
import { storage } from "../storage";
import { AuditLogger } from "../utils/security/auditLogger";
import { createSecureMulterFilter, sanitizeFilename, validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { resolveDocumentFilePath } from "../services/document-paths";
import { processFineLetterWithAI } from "../utils/fine-scanner";
import type { FineScanResult } from "../../shared/fines";
import { cjibConfigSchema, getCjibConfig, maskCjibConfig, saveCjibConfig } from "../services/cjib/config";
import { importCjibFile } from "../services/cjib/importer";
import { importStorage } from "../services/cjib/import-storage";
import { getCjibRunState, runCjibImport, startCjibScheduler } from "../services/cjib/poller";
import { ftpsClient } from "../services/cjib/ftps-client";
import { CJIB_PASSWORD_MASK } from "../../shared/fines";
import type { RouteDeps } from "./deps";

const canView = hasPermission(UserPermission.VIEW_FINES, UserPermission.MANAGE_FINES);
const canManage = hasPermission(UserPermission.MANAGE_FINES);
const money = (n: number) => n.toFixed(2);

function idParam(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return null; }
  return id;
}

/** Staff side of traffic fines: entry, attribution, linking, charging, letters. */
export function registerFineRoutes(app: Express, deps: RouteDeps): void {
  const actor = (req: Request) => req.user?.username ?? "system";
  const letterUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => { const dir = path.join(deps.uploadsDir, "fines"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
      filename: (_req, file, cb) => cb(null, `fine_${Date.now()}${path.extname(sanitizeFilename(file.originalname))}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter("document"),
  });

  async function storeLetter(req: Request): Promise<string | null> {
    if (!req.file) return null;
    const check = await validateAfterUpload(req.file.path, req.file.originalname, req.file.mimetype, "document");
    if (!check.valid) { fs.rmSync(req.file.path, { force: true }); throw new Error(check.error ?? "Invalid file"); }
    return path.relative(process.cwd(), req.file.path);
  }

  async function notifyLinked(fineId: number) {
    try { await sendFineLinkedMail(fineId); } catch (e) { console.error("fine linked mail failed:", e); }
    try {
      const fine = await finesStorage.getFine(fineId);
      if (fine?.customerId) {
        await customerNotifications.notify({
          customerId: fine.customerId, type: "fine_linked", title: `Nieuwe bekeuring: ${fine.licensePlate}`,
          description: `${fine.description} · € ${fine.amount}`, link: `/bekeuringen/${fineId}`, dedupeTag: `fine:${fineId}`, dedupeDays: 365,
        });
      }
    } catch (e) { console.error("fine linked notification failed:", e); }
  }

  // ---- CJIB import (FTPS) --------------------------------------------------------
  const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.get("/api/fines/imports", canView, async (_req, res) => {
    res.json(await importStorage.list(100));
  });

  app.get("/api/fines/imports/status", canView, async (_req, res) => {
    const config = await getCjibConfig();
    res.json({ enabled: config.enabled && Boolean(config.host), host: config.host, ...getCjibRunState() });
  });

  app.post("/api/fines/imports/run", canManage, async (req, res) => {
    const summary = await runCjibImport("manual", actor(req));
    await AuditLogger.logFromRequest(req, "fine.import.run", "fine_import", 0, summary as unknown as Record<string, unknown>);
    res.json(summary);
  });

  app.post("/api/fines/imports/upload", canManage, importUpload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "file is required" });
    if (!/\.(xml|csv|txt)$/i.test(req.file.originalname)) return res.status(400).json({ message: "Only XML or CSV files" });
    const result = await importCjibFile({ buffer: req.file.buffer, fileName: req.file.originalname, source: "cjib_upload", createdBy: actor(req) });
    await AuditLogger.logFromRequest(req, "fine.import.upload", "fine_import", result.file.id, { fileName: req.file.originalname, skipped: result.skipped, status: result.file.status });
    res.status(result.skipped ? 200 : 201).json(result);
  });

  app.get("/api/fines/imports/:id/file", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const file = await importStorage.get(id);
    const abs = file?.rawPath ? path.resolve(process.cwd(), file.rawPath) : null;
    if (!file || !abs || !fs.existsSync(abs)) return res.status(404).json({ message: "No file" });
    res.download(abs, file.fileName);
  });

  app.get("/api/fines/cjib-config", canManage, async (_req, res) => {
    res.json(maskCjibConfig(await getCjibConfig()));
  });

  app.put("/api/fines/cjib-config", canManage, async (req, res) => {
    try {
      const saved = await saveCjibConfig(req.body, actor(req));
      await startCjibScheduler();
      await AuditLogger.logFromRequest(req, "fine.import.config", "settings", 0, { enabled: saved.enabled, host: saved.host, pollMinutes: saved.pollMinutes });
      res.json(maskCjibConfig(saved));
    } catch (e) {
      res.status(400).json({ message: e instanceof z.ZodError ? e.errors[0]?.message ?? "Invalid input" : (e as Error).message });
    }
  });

  // Connects with the posted settings (masked password = stored one) and lists the inbox.
  app.post("/api/fines/cjib-config/test", canManage, async (req, res) => {
    const parsed = cjibConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const stored = await getCjibConfig();
    const config = { ...parsed.data, password: parsed.data.password === CJIB_PASSWORD_MASK || !parsed.data.password ? stored.password : parsed.data.password };
    try {
      const pattern = new RegExp(config.filePattern || ".", "i");
      const files = await ftpsClient.listInbox(config);
      res.json({ ok: true, files: files.map((f) => ({ ...f, matches: pattern.test(f.name) })) });
    } catch (e) {
      res.status(502).json({ ok: false, message: (e as Error).message });
    }
  });

  // Read a letter with AI and report what attribution would do; nothing is created.
  app.post("/api/fines/scan", canManage, letterUpload.single("letterFile"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "letterFile is required" });
    const tempPath = req.file.path;
    try {
      const check = await validateAfterUpload(tempPath, req.file.originalname, req.file.mimetype, "document");
      if (!check.valid) return res.status(400).json({ message: check.error ?? "Invalid file" });
      const parsed = await processFineLetterWithAI(tempPath, req.file.mimetype);
      const plate = parsed.licensePlate ? normalizeLicensePlate(parsed.licensePlate) : null;
      const vehicle = plate ? await finesStorage.getVehicleByPlate(plate) : undefined;
      const candidates = plate && parsed.offenceAt
        ? await findCandidates(plate, new Date(parsed.offenceAt))
        : { covering: [], near: [] };
      const existing = parsed.reference ? await finesStorage.findByReference(parsed.reference) : undefined;
      const result: FineScanResult = {
        parsed: { ...parsed, licensePlate: plate },
        vehicle: vehicle ? { id: vehicle.id, brand: vehicle.brand, model: vehicle.model } : null,
        candidates: {
          covering: candidates.covering.map(({ actualPickupDate: _a, actualReturnDate: _b, ...c }) => c),
          near: candidates.near.map(({ actualPickupDate: _a, actualReturnDate: _b, ...c }) => c),
        },
        duplicateOf: existing ? { id: existing.id, status: existing.status } : null,
      };
      res.json(result);
    } catch (e) {
      res.status(502).json({ message: (e as Error).message });
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  });

  app.get("/api/fines", canView, async (req, res) => {
    const q = req.query;
    res.json(await finesStorage.listFines({
      status: q.status ? String(q.status) : undefined,
      customerId: q.customerId ? parseInt(String(q.customerId), 10) : undefined,
      licensePlate: q.licensePlate ? normalizeLicensePlate(String(q.licensePlate)) : undefined,
      from: q.from ? String(q.from) : undefined,
      to: q.to ? String(q.to) : undefined,
      importFileId: q.importFileId ? parseInt(String(q.importFileId), 10) : undefined,
    }));
  });

  app.get("/api/fines/count", canView, async (req, res) => {
    if (req.query.customerId) return res.json({ count: await finesStorage.countFinesForCustomer(parseInt(String(req.query.customerId), 10)) });
    if (req.query.licensePlate) return res.json({ count: await finesStorage.countFinesForPlate(normalizeLicensePlate(String(req.query.licensePlate))) });
    res.json({ count: 0 });
  });

  app.get("/api/fines/:id", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFineRow(id);
    if (!fine) return res.status(404).json({ message: "Fine not found" });
    const candidates = fine.status === "new" ? await findCandidates(fine.licensePlate, fine.offenceAt) : undefined;
    res.json({ ...fine, candidates });
  });

  app.post("/api/fines", canManage, letterUpload.single("letterFile"), async (req, res) => {
    const parsed = insertFineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const adminFee = req.body.adminFee === undefined || req.body.adminFee === "" ? undefined : parsed.data.adminFee;
    let letterFilePath: string | null = null;
    try { letterFilePath = await storeLetter(req); } catch (e) { return res.status(400).json({ message: (e as Error).message }); }
    const result = await createFineWithAttribution({
      licensePlate: parsed.data.licensePlate, offenceAt: new Date(parsed.data.offenceAt),
      receivedAt: parsed.data.receivedAt ?? null, reference: parsed.data.reference ?? null, description: parsed.data.description,
      amount: parsed.data.amount, adminFee, letterFilePath, internalNotes: parsed.data.internalNotes ?? null, customerNote: parsed.data.customerNote ?? null,
      source: letterFilePath && req.body.scanned === "1" ? "scan" : "manual",
    }, actor(req));
    await AuditLogger.logFromRequest(req, "fine.create", "fine", result.fine.id, { plate: result.fine.licensePlate, status: result.fine.status });
    res.status(201).json(result);
  });

  app.patch("/api/fines/:id", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const existing = await finesStorage.getFine(id);
    if (!existing) return res.status(404).json({ message: "Fine not found" });
    if (existing.status === "paid" || existing.status === "cancelled") return res.status(400).json({ message: "Fine is closed" });
    const parsed = insertFineSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const amount = parsed.data.amount ?? Number(existing.amount);
    const adminFee = parsed.data.adminFee ?? Number(existing.adminFee);
    const updated = await finesStorage.updateFine(id, {
      ...(parsed.data.licensePlate ? { licensePlate: normalizeLicensePlate(parsed.data.licensePlate) } : {}),
      ...(parsed.data.offenceAt ? { offenceAt: new Date(parsed.data.offenceAt) } : {}),
      ...(parsed.data.receivedAt !== undefined ? { receivedAt: parsed.data.receivedAt } : {}),
      ...(parsed.data.reference !== undefined ? { reference: parsed.data.reference } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.internalNotes !== undefined ? { internalNotes: parsed.data.internalNotes } : {}),
      ...(parsed.data.customerNote !== undefined ? { customerNote: parsed.data.customerNote } : {}),
      amount: money(amount), adminFee: money(adminFee), totalAmount: money(amount + adminFee), updatedBy: actor(req),
    });
    await AuditLogger.logFromRequest(req, "fine.update", "fine", id, parsed.data);
    res.json(updated);
  });

  app.post("/api/fines/:id/letter", canManage, letterUpload.single("letterFile"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    if (!(await finesStorage.getFine(id))) return res.status(404).json({ message: "Fine not found" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const letterFilePath = await storeLetter(req);
      res.json(await finesStorage.updateFine(id, { letterFilePath, updatedBy: actor(req) }));
    } catch (e) { res.status(400).json({ message: (e as Error).message }); }
  });

  app.get("/api/fines/:id/letter", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFine(id);
    const file = fine?.letterFilePath ? resolveDocumentFilePath(fine.letterFilePath) : null;
    if (!fine || !file) return res.status(404).json({ message: "No letter" });
    res.setHeader("Content-Type", file.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(path.basename(file))}"`);
    fs.createReadStream(file).pipe(res);
  });

  app.post("/api/fines/:id/link", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const parsed = z.object({
      customerId: z.number().int().positive(),
      reservationId: z.number().int().positive().nullable().optional(),
      driverId: z.number().int().positive().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "customerId is required" });
    try {
      const fine = await linkFineManually(id, parsed.data, actor(req));
      await AuditLogger.logFromRequest(req, "fine.link", "fine", id, parsed.data);
      await notifyLinked(id);
      res.json(fine);
    } catch (e) { res.status(400).json({ message: (e as Error).message }); }
  });

  app.post("/api/fines/:id/unlink", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    try {
      const fine = await unlinkFine(id, actor(req));
      await AuditLogger.logFromRequest(req, "fine.unlink", "fine", id);
      res.json(fine);
    } catch (e) { res.status(404).json({ message: (e as Error).message }); }
  });

  // Cancelled by mistake: back to linked (when it has a customer) or new.
  app.post("/api/fines/:id/reactivate", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFine(id);
    if (!fine) return res.status(404).json({ message: "Fine not found" });
    if (fine.status !== "cancelled") return res.status(400).json({ message: "Only a cancelled fine can be reactivated" });
    const next: FineStatusValue = fine.customerId ? "linked" : "new";
    const updated = await finesStorage.updateFine(id, { status: next, updatedBy: actor(req) });
    await AuditLogger.logFromRequest(req, "fine.status", "fine", id, { from: "cancelled", to: next, reactivated: true });
    res.json(updated);
  });

  // Delete = move to the recycle bin (deleted_records); admins can restore it from there.
  app.delete("/api/fines/:id", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFineRow(id);
    if (!fine) return res.status(404).json({ message: "Fine not found" });
    const { customerName, driverName, ...row } = fine;
    await finesStorage.recordDeletion({
      entityType: "fine", entityId: id,
      label: `${fine.licensePlate} · ${fine.description}${fine.reference ? ` (${fine.reference})` : ""}`,
      payload: { fine: row, customerName, driverName },
      relatedCounts: { requests: 0 },
      deletedBy: actor(req), deletedByUserId: req.user?.id ?? null,
    });
    await finesStorage.deleteFine(id);
    await AuditLogger.logFromRequest(req, "fine.delete", "fine", id, { plate: fine.licensePlate, status: fine.status, customerId: fine.customerId });
    res.json({ ok: true });
  });

  app.post("/api/fines/:id/status", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFine(id);
    if (!fine) return res.status(404).json({ message: "Fine not found" });
    const parsed = z.object({ status: z.string(), invoiceReference: z.string().trim().max(100).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "status is required" });
    const next = parsed.data.status as FineStatusValue;
    if (!isValidFineTransition(fine.status, next)) {
      return res.status(400).json({ message: `Cannot go from ${fine.status} to ${next}`, allowed: FINE_TRANSITIONS[fine.status as FineStatusValue] ?? [] });
    }
    if (next === "new" && fine.status !== "cancelled") { res.json(await unlinkFine(id, actor(req))); return; }
    if (next === "linked" && fine.status === "cancelled" && !fine.customerId) return res.status(400).json({ message: "Link the fine to a customer first" });
    const patch: Record<string, unknown> = { status: next, updatedBy: actor(req) };
    if (next === "charged") { patch.chargedAt = new Date(); if (parsed.data.invoiceReference) patch.invoiceReference = parsed.data.invoiceReference; }
    if (next === "paid") patch.paidAt = new Date();
    const updated = await finesStorage.updateFine(id, patch);
    await AuditLogger.logFromRequest(req, "fine.status", "fine", id, { from: fine.status, to: next });
    res.json(updated);
  });
}
