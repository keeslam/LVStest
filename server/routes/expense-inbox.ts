import type { Express, Request, Response } from "express";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import {
  EXPENSE_CATEGORIES, INBOX_STATUSES, INVOICE_INBOX_PASSWORD_MASK,
  type InboxParsedInvoice, type InboxStatus,
} from "../../shared/invoice-inbox";
import { storage } from "../storage";
import { AuditLogger } from "../utils/security/auditLogger";
import { OutboundBlockedError, OUTBOUND_BLOCKED_MESSAGE } from "../utils/security/outboundGuard";
import { getInvoiceInboxConfig, invoiceInboxConfigSchema, maskInvoiceInboxConfig, saveInvoiceInboxConfig } from "../services/invoice-inbox/config";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { computeInvoiceHash } from "../services/invoice-inbox/hash";
import { getInvoiceImapClient, getInvoiceInboxRunState, runInvoiceInboxImport, startInvoiceInboxScheduler } from "../services/invoice-inbox/poller";
import { bookInvoiceAsExpenses, groupLinesByCategory, receiptFromStoredPath, resolveInvoiceFile } from "../services/expenses/book-invoice";

const canManageSettings = hasPermission(UserPermission.MANAGE_SETTINGS);
const canManageExpenses = hasPermission(UserPermission.MANAGE_EXPENSES);
// Whoever configures the mailbox must also be able to see its state and try it.
const canRunOrSeeStatus = hasPermission(UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS);

const SERVABLE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function idParam(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "Invalid id" });
    return null;
  }
  return id;
}

const bookSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  invoice: z.object({
    vendor: z.string().trim().max(300).default(""),
    invoiceNumber: z.string().trim().max(200).default(""),
    invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Factuurdatum moet JJJJ-MM-DD zijn"),
  }),
  lineItems: z.array(z.object({
    description: z.string().trim().min(1).max(1000),
    amount: z.coerce.number().positive().max(1000000),
    category: z.enum(EXPENSE_CATEGORIES),
  })).min(1).max(200),
  groupByCategory: z.boolean().default(true),
});

const dismissSchema = z.object({ note: z.string().trim().max(500).optional() });

/** Invoices by e-mail: settings, manual run, the review list and its two decisions. */
export function registerExpenseInboxRoutes(app: Express): void {
  const actor = (req: Request) => req.user?.username ?? "system";

  // ---- settings ---------------------------------------------------------------
  app.get("/api/expenses/inbox/config", canManageSettings, async (_req, res) => {
    res.json(maskInvoiceInboxConfig(await getInvoiceInboxConfig()));
  });

  app.put("/api/expenses/inbox/config", canManageSettings, async (req, res) => {
    try {
      const saved = await saveInvoiceInboxConfig(req.body, actor(req));
      await startInvoiceInboxScheduler();
      await AuditLogger.logFromRequest(req, "expense.inbox.config", "settings", 0, { enabled: saved.enabled, host: saved.host, pollMinutes: saved.pollMinutes, senders: saved.allowedSenders.length });
      res.json(maskInvoiceInboxConfig(saved));
    } catch (e) {
      res.status(400).json({ message: e instanceof z.ZodError ? e.errors[0]?.message ?? "Invalid input" : (e as Error).message });
    }
  });

  // Connects with the posted settings (masked or empty password = the stored one) and counts unread mail.
  app.post("/api/expenses/inbox/config/test", canManageSettings, async (req, res) => {
    const parsed = invoiceInboxConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ ok: false, message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const stored = await getInvoiceInboxConfig();
    // M3: the mask (or an empty field) means "keep what is stored", and that
    // only holds for the server it was stored for — otherwise this button would
    // try the mailbox password against any host an administrator types.
    const reuseStored = parsed.data.password === INVOICE_INBOX_PASSWORD_MASK || !parsed.data.password;
    const sameTarget = parsed.data.host === stored.host && parsed.data.username === stored.username;
    if (reuseStored && !sameTarget) {
      return res.status(400).json({ ok: false, message: "Vul het wachtwoord in om een andere server te testen." });
    }
    const password = reuseStored ? stored.password : parsed.data.password;
    try {
      const unseen = await getInvoiceImapClient().withSession({ ...parsed.data, password }, async (session) => (await session.listUnseen()).length);
      res.json({ ok: true, unseen });
    } catch (e) {
      // One answer for every refused destination: the route is not a port scanner (cf. BUG-071).
      if (e instanceof OutboundBlockedError) return res.status(400).json({ ok: false, message: OUTBOUND_BLOCKED_MESSAGE });
      res.status(502).json({ ok: false, message: (e as Error).message });
    }
  });

  // ---- run and status ---------------------------------------------------------
  app.post("/api/expenses/inbox/run", canRunOrSeeStatus, async (req, res) => {
    const summary = await runInvoiceInboxImport("manual", actor(req));
    await AuditLogger.logFromRequest(req, "expense.inbox.run", "invoice_inbox", 0, summary as unknown as Record<string, unknown>);
    res.json(summary);
  });

  app.get("/api/expenses/inbox/status", canRunOrSeeStatus, async (_req, res) => {
    const config = await getInvoiceInboxConfig();
    res.json({
      enabled: config.enabled && Boolean(config.host),
      ...getInvoiceInboxRunState(),
      reviewCount: await inboxStorage.countByStatus("review"),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  // ---- items ------------------------------------------------------------------
  app.get("/api/expenses/inbox/items", canManageExpenses, async (req, res) => {
    const status = String(req.query.status ?? "review");
    if (!(INBOX_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ message: "Unknown status" });
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    res.json(await inboxStorage.list({
      status: status as InboxStatus,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    }));
  });

  app.get("/api/expenses/inbox/items/:id", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const item = await inboxStorage.get(id);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.get("/api/expenses/inbox/items/:id/file", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const item = await inboxStorage.get(id);
    // Through the one owner of stored paths, and only inside the invoice folders.
    const abs = item ? resolveInvoiceFile(item.attachmentPath) : null;
    if (!item || !abs) return res.status(404).json({ message: "No file" });
    const type = SERVABLE_TYPES.includes(item.attachmentContentType ?? "") ? item.attachmentContentType! : "application/octet-stream";
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `inline; filename="${(item.attachmentName ?? "factuur").replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(abs);
  });

  app.post("/api/expenses/inbox/items/:id/book", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const body = bookSchema.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: body.error.errors[0]?.message ?? "Invalid input" });
    const item = await inboxStorage.get(id);
    if (!item) return res.status(404).json({ message: "Not found" });
    if (item.status !== "review") return res.status(409).json({ message: "Deze factuur is al afgehandeld." });
    const { vehicleId, invoice, lineItems, groupByCategory } = body.data;
    if (!(await storage.getVehicle(vehicleId))) return res.status(404).json({ message: "Vehicle not found" });

    // An earlier attempt wrote the expenses but could not update the item:
    // finish that bookkeeping instead of booking the invoice a second time.
    const alreadyBooked = await inboxStorage.expenseIdsFor(item.id);
    if (alreadyBooked.length > 0) {
      const healed = await inboxStorage.update(item.id, {
        status: "booked", reviewReason: null, expenseIds: alreadyBooked, processedAt: new Date(), updatedBy: actor(req),
      });
      await AuditLogger.logFromRequest(req, "expense.inbox.book.healed", "invoice_inbox_item", item.id, { expenseIds: alreadyBooked });
      return res.status(409).json({ message: "Deze factuur was al geboekt; de boeking is nu afgerond.", item: healed });
    }

    const booked = await bookInvoiceAsExpenses({
      invoice, vehicleId, lineItems: groupByCategory ? groupLinesByCategory(lineItems) : lineItems,
      receipt: receiptFromStoredPath(item.attachmentPath, item.attachmentContentType ?? "application/pdf"),
      inboxItemId: item.id, createdBy: actor(req),
    });
    if (booked.expenses.length === 0) {
      return res.status(400).json({ message: "Er kon geen kostenregel worden aangemaakt.", errors: booked.errors });
    }

    // What staff corrected is what the item says from now on, duplicate check included.
    const total = item.parsed?.totalAmount ?? lineItems.reduce((sum, l) => sum + l.amount, 0);
    const parsed: InboxParsedInvoice = { currency: "EUR", ...(item.parsed ?? {}), ...invoice, totalAmount: total, lineItems };
    const updated = await inboxStorage.update(item.id, {
      status: "booked", reviewReason: null, vehicleId, expenseIds: booked.expenses.map((e) => e.id),
      parsed, invoiceHash: computeInvoiceHash(parsed),
      errorMessage: booked.errors.length ? booked.errors.join("; ").slice(0, 2000) : null,
      processedAt: new Date(), updatedBy: actor(req),
    });
    await AuditLogger.logFromRequest(req, "expense.inbox.book", "invoice_inbox_item", item.id, { vehicleId, expenses: booked.expenses.length });
    res.json({ item: updated, expenses: booked.expenses });
  });

  app.post("/api/expenses/inbox/items/:id/dismiss", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const body = dismissSchema.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: body.error.errors[0]?.message ?? "Invalid input" });
    const item = await inboxStorage.get(id);
    if (!item) return res.status(404).json({ message: "Not found" });
    if (item.status !== "review") return res.status(409).json({ message: "Deze factuur is al afgehandeld." });
    const updated = await inboxStorage.update(item.id, {
      status: "dismissed", note: body.data.note || null, processedAt: new Date(), updatedBy: actor(req),
    });
    await AuditLogger.logFromRequest(req, "expense.inbox.dismiss", "invoice_inbox_item", item.id, { note: body.data.note ?? null });
    res.json({ item: updated });
  });
}
