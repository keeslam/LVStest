import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission, insertPortalUserSchema, updatePortalCustomerSettingsSchema, PortalUserRole, type PortalUser } from "../../shared/schema";
import { portalStorage } from "../services/portal-storage";
import { PORTAL_FEATURE_KEYS } from "../../shared/portal-types";
import { requestsStorage } from "../services/portal-requests-storage";
import { sendPortalInvite } from "../services/portal-mail";
import { getPortalConfig, savePortalConfig } from "../services/portal-config";
import { getPortalDashboard } from "../services/portal-dashboard";
import { AuditLogger } from "../utils/security/auditLogger";
import type { RouteDeps } from "./deps";

const canView = hasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
const canManage = hasPermission(UserPermission.MANAGE_PORTAL);

function publicAccount(u: PortalUser) {
  const { passwordHash, inviteTokenHash, ...rest } = u;
  return { ...rest, activated: Boolean(passwordHash), invitePending: Boolean(inviteTokenHash) };
}

function intParam(req: Request, res: Response, name: string): number | null {
  const v = parseInt(req.params[name], 10);
  if (Number.isNaN(v)) { res.status(400).json({ message: `Invalid ${name}` }); return null; }
  return v;
}

async function driverBelongsToCustomer(driverId: number | null | undefined, customerId: number): Promise<boolean> {
  if (driverId == null) return true;
  const d = await portalStorage.getDriverForCustomer(driverId, customerId);
  return Boolean(d);
}

/** Staff side of the customer portal: accounts, per-customer switches, activity, online vehicles, config. */
export function registerPortalAdminRoutes(app: Express, _deps: RouteDeps): void {
  const actor = (req: Request) => req.user?.username ?? "system";

  // ---- accounts ---------------------------------------------------------------
  app.get("/api/portal-admin/accounts", canView, async (_req, res) => {
    const rows = await portalStorage.listAllPortalUsers();
    res.json(rows.map((r) => ({ ...publicAccount(r), customerName: r.customerName })));
  });

  app.get("/api/portal-admin/customers/:customerId/accounts", canView, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    res.json((await portalStorage.listPortalUsersByCustomer(customerId)).map(publicAccount));
  });

  app.post("/api/portal-admin/customers/:customerId/accounts", canManage, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    if (!(await storage.getCustomer(customerId))) return res.status(404).json({ message: "Customer not found" });
    const parsed = insertPortalUserSchema.safeParse({ ...req.body, customerId });
    const permissionsParsed = z.record(z.enum(PORTAL_FEATURE_KEYS), z.boolean()).optional().safeParse(req.body?.permissions);
    if (!permissionsParsed.success) return res.status(400).json({ message: "Invalid permissions" });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    if (!(await driverBelongsToCustomer(parsed.data.driverId, customerId))) return res.status(400).json({ message: "Driver does not belong to this customer" });
    if (await portalStorage.getPortalUserByEmail(parsed.data.email)) return res.status(400).json({ message: "An account with this e-mail already exists" });

    const account = await portalStorage.createPortalUser({ ...parsed.data, permissions: permissionsParsed.data ?? {} }, actor(req));
    let inviteSent = false;
    try { inviteSent = (await sendPortalInvite(account, "invite")).sent; } catch (error) { console.error("portal invite failed:", error); }
    await AuditLogger.logFromRequest(req, "portal_account.create", "portal_user", account.id, { email: account.email, customerId, inviteSent });
    res.status(201).json({ account: publicAccount((await portalStorage.getPortalUser(account.id))!), inviteSent });
  });

  app.patch("/api/portal-admin/accounts/:id", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const existing = await portalStorage.getPortalUser(id);
    if (!existing) return res.status(404).json({ message: "Account not found" });
    const parsed = z.object({
      fullName: z.string().trim().min(1).max(200).optional(),
      role: z.enum([PortalUserRole.ADMIN, PortalUserRole.DRIVER]).optional(),
      driverId: z.number().int().positive().nullable().optional(),
      active: z.boolean().optional(),
      permissions: z.record(z.enum(PORTAL_FEATURE_KEYS), z.boolean()).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const role = parsed.data.role ?? existing.role;
    const driverId = parsed.data.driverId === undefined ? existing.driverId : parsed.data.driverId;
    if (role === PortalUserRole.DRIVER && driverId == null) return res.status(400).json({ message: "A driver account must be linked to a driver" });
    if (!(await driverBelongsToCustomer(driverId, existing.customerId))) return res.status(400).json({ message: "Driver does not belong to this customer" });
    const updated = await portalStorage.updatePortalUser(id, { ...parsed.data, role, driverId, updatedBy: actor(req) });
    await AuditLogger.logFromRequest(req, "portal_account.update", "portal_user", id, parsed.data);
    res.json(publicAccount(updated!));
  });

  app.post("/api/portal-admin/accounts/:id/invite", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const user = await portalStorage.getPortalUser(id);
    if (!user) return res.status(404).json({ message: "Account not found" });
    const kind = req.body?.kind === "reset" ? "reset" : "invite";
    const result = await sendPortalInvite(user, kind);
    await AuditLogger.logFromRequest(req, `portal_account.${kind}`, "portal_user", id, { sent: result.sent });
    res.json({ sent: result.sent });
  });

  app.delete("/api/portal-admin/accounts/:id", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const user = await portalStorage.getPortalUser(id);
    if (!user) return res.status(404).json({ message: "Account not found" });
    if (user.passwordHash) return res.status(400).json({ message: "Activated accounts are blocked, not deleted" });
    await portalStorage.deletePortalUser(id);
    await AuditLogger.logFromRequest(req, "portal_account.delete", "portal_user", id, { email: user.email });
    res.json({ ok: true });
  });

  // ---- customer settings ---------------------------------------------------------
  app.get("/api/portal-admin/customers/:customerId/settings", canView, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    res.json(await portalStorage.getOrCreateCustomerSettings(customerId));
  });

  app.patch("/api/portal-admin/customers/:customerId/settings", canManage, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    const parsed = updatePortalCustomerSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const row = await portalStorage.updateCustomerSettings(customerId, parsed.data, actor(req));
    await AuditLogger.logFromRequest(req, "portal_settings.update", "customer", customerId, parsed.data);
    res.json(row);
  });

  // ---- per-customer overview (online, invitations, last activity) --------------
  app.get("/api/portal-admin/customers-overview", canView, async (_req, res) => {
    res.json(await portalStorage.listCustomersOverview());
  });

  // ---- dashboard: counters, attention items, notifications, upcoming ----------
  app.get("/api/portal-admin/dashboard", canView, async (_req, res) => {
    res.json(await getPortalDashboard());
  });

  app.post("/api/portal-admin/notifications/:id/read", canView, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const ok = await storage.markCustomNotificationAsRead(id);
    if (!ok) return res.status(404).json({ message: "Notification not found" });
    res.json({ ok: true });
  });

  // ---- staff badge: unread portal notifications --------------------------------
  app.get("/api/portal-admin/unread-count", canView, async (_req, res) => {
    const unread = await storage.getUnreadCustomNotifications();
    const newRequests = await requestsStorage.countNewRequests();
    res.json({ count: unread.filter((n) => n.type.startsWith("portal_")).length + newRequests, newRequests });
  });

  app.post("/api/portal-admin/notifications/mark-read", canView, async (_req, res) => {
    const unread = await storage.getUnreadCustomNotifications();
    let marked = 0;
    for (const n of unread) {
      if (n.type.startsWith("portal_") && (await storage.markCustomNotificationAsRead(n.id))) marked += 1;
    }
    res.json({ marked });
  });

  // ---- activity ------------------------------------------------------------------
  app.get("/api/portal-admin/activity", canView, async (req, res) => {
    const rawCustomer = req.query.customerId ? parseInt(String(req.query.customerId), 10) : undefined;
    const customerId = rawCustomer !== undefined && !Number.isNaN(rawCustomer) ? rawCustomer : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500);
    res.json(await portalStorage.listActivity({ customerId, limit }));
  });

  // ---- vehicles offered online -------------------------------------------------
  app.get("/api/portal-admin/vehicles-online", canView, async (_req, res) => {
    const all = await storage.getAllVehicles();
    res.json(all.map((v) => ({
      id: v.id, licensePlate: v.licensePlate, brand: v.brand, model: v.model, vehicleType: v.vehicleType,
      availabilityStatus: v.availabilityStatus, offeredOnline: v.offeredOnline, onlineDescription: v.onlineDescription,
      dailyPrice: v.dailyPrice, monthlyPrice: v.monthlyPrice,
    })));
  });

  app.patch("/api/portal-admin/vehicles-online/:id", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const parsed = z.object({ offeredOnline: z.boolean().optional(), onlineDescription: z.string().max(2000).nullable().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    const v = await storage.updateVehicle(id, { ...parsed.data, updatedBy: actor(req) });
    if (!v) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ id: v.id, offeredOnline: v.offeredOnline, onlineDescription: v.onlineDescription });
  });

  app.post("/api/portal-admin/vehicles-online/bulk", canManage, async (req, res) => {
    const parsed = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500), offeredOnline: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    let updated = 0;
    for (const id of parsed.data.ids) {
      if (await storage.updateVehicle(id, { offeredOnline: parsed.data.offeredOnline, updatedBy: actor(req) })) updated += 1;
    }
    await AuditLogger.logFromRequest(req, "vehicle.online_bulk", "vehicle", undefined, { ids: parsed.data.ids, offeredOnline: parsed.data.offeredOnline });
    res.json({ updated });
  });

  // ---- config ------------------------------------------------------------------------
  app.get("/api/portal-admin/config", canView, async (_req, res) => res.json(await getPortalConfig()));

  app.put("/api/portal-admin/config", canManage, async (req, res) => {
    try {
      const saved = await savePortalConfig(req.body, actor(req));
      await AuditLogger.logFromRequest(req, "portal_config.update", "app_setting", "portal_config", saved as unknown as Record<string, unknown>);
      res.json(saved);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0]?.message ?? "Invalid config" });
      throw error;
    }
  });
}
