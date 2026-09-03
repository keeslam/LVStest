import type { Express, Request, Response } from "express";
import fs from "fs";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { isValidRequestTransition, REQUEST_TRANSITIONS, type PortalRequestStatusValue } from "../../shared/portal-requests";
import { requestsStorage, toRequestDto } from "../services/portal-requests-storage";
import { sendRequestReplyMail } from "../services/portal-mail";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { scheduleContractRegeneration } from "../services/reservation-pdf-regeneration";
import { resolveDocumentFilePath } from "../services/document-paths";
import { sanitizeFilename } from "../utils/security/fileUploadSecurity";
import { AuditLogger } from "../utils/security/auditLogger";
import type { RouteDeps } from "./deps";

const canView = hasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
const canManage = hasPermission(UserPermission.MANAGE_PORTAL);

function idParam(req: Request, res: Response, name = "id"): number | null {
  const id = parseInt(req.params[name], 10);
  if (Number.isNaN(id)) { res.status(400).json({ message: `Invalid ${name}` }); return null; }
  return id;
}

/** Staff inbox for customer requests: take, reply, reject, approve extensions/early returns. */
export function registerPortalRequestRoutes(app: Express, _deps: RouteDeps): void {
  const actor = (req: Request) => req.user?.username ?? "system";

  async function finish(req: Request, id: number, reply: string, status: PortalRequestStatusValue, customerId: number) {
    const updated = await requestsStorage.updateRequest(id, { staffReply: reply, repliedAt: new Date(), repliedBy: actor(req), status, handledBy: actor(req) });
    try { await sendRequestReplyMail(id); } catch (e) { console.error("request reply mail failed:", e); }
    await portalStorage.logActivity({ customerId, action: "request_replied", entity: "request", entityId: id, details: { status, by: actor(req) } });
    await AuditLogger.logFromRequest(req, "portal_request.reply", "portal_request", id, { status });
    return updated;
  }

  app.get("/api/portal-requests", canView, async (req, res) => {
    const rows = await requestsStorage.listRequests({
      status: req.query.status ? String(req.query.status) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      customerId: req.query.customerId ? parseInt(String(req.query.customerId), 10) : undefined,
    });
    res.json(rows.map((r) => toRequestDto(r, true)));
  });

  app.get("/api/portal-requests/count-new", canView, async (_req, res) => res.json({ count: await requestsStorage.countNewRequests() }));

  app.get("/api/portal-requests/:id", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    res.json(toRequestDto(row, true));
  });

  app.get("/api/portal-requests/:id/attachments/:attachmentId", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const attachmentId = idParam(req, res, "attachmentId"); if (attachmentId === null) return;
    const att = await requestsStorage.getAttachment(attachmentId);
    const file = att && att.requestId === id ? resolveDocumentFilePath(att.filePath) : null;
    if (!att || !file) return res.status(404).json({ message: "Attachment not found" });
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(att.fileName)}"`);
    fs.createReadStream(file).pipe(res);
  });

  app.post("/api/portal-requests/:id/take", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (!isValidRequestTransition(row.status, "in_progress")) {
      return res.status(400).json({ message: "Cannot take this request", allowed: REQUEST_TRANSITIONS[row.status as PortalRequestStatusValue] });
    }
    res.json(await requestsStorage.updateRequest(id, { status: "in_progress", handledBy: actor(req) }));
  });

  app.post("/api/portal-requests/:id/reply", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    const parsed = z.object({ reply: z.string().trim().max(4000).optional(), status: z.enum(["done", "rejected", "in_progress"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "status is required" });
    const reply = parsed.data.reply ?? "";
    if (parsed.data.status !== "in_progress" && !reply) return res.status(400).json({ message: "A reply is required" });
    if (row.status !== parsed.data.status && !isValidRequestTransition(row.status, parsed.data.status)) {
      return res.status(400).json({ message: `Cannot go from ${row.status} to ${parsed.data.status}`, allowed: REQUEST_TRANSITIONS[row.status as PortalRequestStatusValue] });
    }
    res.json(await finish(req, id, reply, parsed.data.status, row.customerId));
  });

  app.post("/api/portal-requests/:id/approve", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (row.type !== "extension" && row.type !== "early_return") return res.status(400).json({ message: "Only extensions and early returns can be approved" });
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const reservation = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!reservation || !reservation.vehicleId) return res.status(400).json({ message: "Reservation not found" });
    const newEnd = String(row.type === "extension" ? row.payload.newEndDate : row.payload.returnDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) return res.status(400).json({ message: "Request has no valid date" });
    const conflicts = (await storage.checkReservationConflicts(reservation.vehicleId, reservation.startDate, newEnd, reservation.id))
      .filter((c) => c.id !== reservation.id);
    if (conflicts.length > 0) {
      return res.status(409).json({
        message: "Conflicts with another reservation",
        conflicts: conflicts.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, customerId: c.customerId })),
      });
    }
    await storage.updateReservation(reservation.id, { endDate: newEnd, updatedBy: actor(req) } as any);
    scheduleContractRegeneration(reservation.id, actor(req));
    await AuditLogger.logFromRequest(req, "reservation.update", "reservation", reservation.id, { endDate: newEnd, viaPortalRequest: id });
    const reply = row.type === "extension" ? `Goedgekeurd: nieuwe einddatum ${newEnd}.` : `Goedgekeurd: inleverdatum ${newEnd}.`;
    res.json(await finish(req, id, reply, "done", row.customerId));
  });
}
