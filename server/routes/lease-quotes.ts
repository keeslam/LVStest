import type { Express, Request, Response } from "express";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { LEASE_QUOTE_STATUSES, leaseQuotePayloadSchema } from "../../shared/lease-quotes";
import {
  copyLeaseQuote, createLeaseQuote, deleteLeaseQuote, getLeaseQuote, getLeaseQuoteSettings, listLeaseQuotes,
  updateLeaseQuote, updateLeaseQuoteSettings,
} from "../services/lease-quotes";
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
}
