import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { requireFeature, requirePortalRole, portalError, logPortalActivity, revokePortalSessionsExcept } from "../portal-auth";
import { PORTAL_ERROR, PORTAL_FEATURE_KEYS, type PortalAccountPermissions, type PortalColleagueDto } from "../../shared/portal-types";
import { PortalUserRole, type PortalUser } from "../../shared/schema";
import { portalStorage } from "../services/portal-storage";
import { sendPortalInvite } from "../services/portal-mail";
import { notifyStaffOfPortalEvent } from "../services/portal-notifications";
import { AuditLogger } from "../utils/security/auditLogger";
import { storage } from "../storage";

/**
 * Colleagues (Kees, 2026-10-18): an admin account of a customer invites other admins and drivers and
 * can block or unblock them, without staff in between. The rules:
 *   - only an admin, and only while the office has not switched it off for this customer
 *     (portal_customer_settings.can_invite_colleagues);
 *   - nobody gets more than the inviter: every feature the inviter's own account has taken away
 *     (permissions key false) is taken away from the new account too;
 *   - an account with rights the acting admin lacks cannot be blocked or unblocked by them;
 *   - nobody blocks themself; a driver account is tied to an active driver of the same company,
 *     one account per driver;
 *   - the office is told of every invitation and every block.
 */
export function registerPortalColleagueRoutes(app: Express, deps: { requirePortalUser: RequestHandler }): void {
  const guard = [deps.requirePortalUser, requirePortalRole("admin"), requireFeature("canInviteColleagues")];
  const ctxOf = (req: Request) => req.portalUser!;

  /** The features this account has taken away (its own ceiling). */
  const restricted = (u: Pick<PortalUser, "permissions">) =>
    PORTAL_FEATURE_KEYS.filter((k) => (u.permissions as PortalAccountPermissions | null)?.[k] === false);
  /** True when `target` may use something `actor` may not, so `actor` must leave it alone. */
  const exceeds = (target: PortalUser, actor: PortalUser) => restricted(actor).some((k) => !restricted(target).includes(k));

  const toDto = (u: PortalUser, driverName: string | null, selfId: number): PortalColleagueDto => ({
    id: u.id, fullName: u.fullName, email: u.email, role: u.role as PortalColleagueDto["role"],
    driver: u.driverId ? { id: u.driverId, displayName: driverName ?? "" } : null,
    active: u.active, activated: Boolean(u.passwordHash), invitePending: Boolean(u.inviteTokenHash),
    lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null, isSelf: u.id === selfId,
  });
  async function list(req: Request): Promise<PortalColleagueDto[]> {
    const ctx = ctxOf(req);
    const users = await portalStorage.listPortalUsersByCustomer(ctx.customerId);
    const drivers = new Map((await portalStorage.listDriversForCustomer(ctx.customerId)).map((d) => [d.id, d.displayName]));
    return users.map((u) => toDto(u, u.driverId ? drivers.get(u.driverId) ?? null : null, ctx.user.id))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName));
  }
  async function tellOffice(req: Request, title: string, description: string) {
    const ctx = ctxOf(req);
    const customer = await storage.getCustomer(ctx.customerId);
    await notifyStaffOfPortalEvent({
      kind: "portal_customer_update", title: `${title}: ${customer?.companyName || customer?.name || ctx.customerId}`,
      description, link: `/customers/${ctx.customerId}`, customerId: ctx.customerId,
    });
  }
  const audit = (req: Request, action: string, id: number, details: Record<string, unknown>) =>
    AuditLogger.log({
      username: `portaal:${ctxOf(req).user.email}`, action, resourceType: "portal_user", resourceId: String(id),
      details: { customerId: ctxOf(req).customerId, ...details }, ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined,
    }).catch((e: Error) => console.error("portal colleague audit failed:", e.message));

  app.get("/api/portal/colleagues", ...guard, async (req, res) => { res.json(await list(req)); });

  app.post("/api/portal/colleagues", ...guard, async (req, res) => {
    const ctx = ctxOf(req);
    const parsed = z.object({
      fullName: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(200),
      role: z.enum([PortalUserRole.ADMIN, PortalUserRole.DRIVER]),
      driverId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const b = parsed.data;
    let driverId: number | null = null;
    if (b.role === PortalUserRole.DRIVER) {
      const driver = b.driverId ? await portalStorage.getDriverForCustomer(b.driverId, ctx.customerId) : undefined;
      if (!driver || driver.status !== "active") return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found");
      const taken = (await portalStorage.listPortalUsersByCustomer(ctx.customerId)).find((u) => u.driverId === driver.id && u.active);
      if (taken) return portalError(res, 409, PORTAL_ERROR.DRIVER_HAS_ACCOUNT, "This driver already has an account");
      driverId = driver.id;
    }
    if (await portalStorage.getPortalUserByEmail(b.email)) return portalError(res, 409, PORTAL_ERROR.EMAIL_IN_USE, "An account with this e-mail already exists");
    // Never more than the inviter: their own restrictions come along.
    const permissions = Object.fromEntries(restricted(ctx.user).map((k) => [k, false])) as PortalAccountPermissions;
    const account = await portalStorage.createPortalUser(
      { customerId: ctx.customerId, email: b.email, fullName: b.fullName, role: b.role, driverId, permissions } as any,
      `portaal:${ctx.user.email}`,
    );
    let inviteSent = false;
    try { inviteSent = (await sendPortalInvite(account, "invite")).sent; } catch (error) { console.error("portal colleague invite failed:", error); }
    await logPortalActivity(req, "colleague_invited", { entity: "portal_user", entityId: account.id, details: { email: account.email, role: account.role } });
    await audit(req, "portal.colleague_invited", account.id, { email: account.email, role: account.role, driverId, restricted: Object.keys(permissions), inviteSent });
    await tellOffice(req, "Collega uitgenodigd", `${ctx.user.fullName} heeft ${account.fullName} (${account.email}) uitgenodigd als ${account.role === "admin" ? "beheerder" : "bestuurder"}.`);
    res.status(201).json({ colleagues: await list(req), inviteSent });
  });

  /** The colleague, only when it is this company's and the acting admin may touch it. */
  async function target(req: Request, res: Response): Promise<PortalUser | null> {
    const ctx = ctxOf(req);
    const id = parseInt(req.params.id, 10);
    const user = Number.isNaN(id) ? undefined : await portalStorage.getPortalUser(id);
    if (!user || user.customerId !== ctx.customerId) { portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Account not found"); return null; }
    if (user.id === ctx.user.id) { portalError(res, 400, PORTAL_ERROR.VALIDATION, "You cannot change your own account here"); return null; }
    if (exceeds(user, ctx.user)) { portalError(res, 403, PORTAL_ERROR.ROLE_FORBIDDEN, "This account has rights you do not have"); return null; }
    return user;
  }

  app.patch("/api/portal/colleagues/:id", ...guard, async (req, res) => {
    const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "active is required");
    const user = await target(req, res); if (!user) return;
    const ctx = ctxOf(req);
    await portalStorage.updatePortalUser(user.id, { active: parsed.data.active, updatedBy: `portaal:${ctx.user.email}` });
    // A blocked colleague is logged out everywhere at once.
    if (!parsed.data.active) await revokePortalSessionsExcept(user.id);
    await logPortalActivity(req, parsed.data.active ? "colleague_unblocked" : "colleague_blocked", { entity: "portal_user", entityId: user.id, details: { email: user.email } });
    await audit(req, parsed.data.active ? "portal.colleague_unblocked" : "portal.colleague_blocked", user.id, { email: user.email });
    await tellOffice(req, parsed.data.active ? "Collega weer toegelaten" : "Collega geblokkeerd", `${ctx.user.fullName} heeft het portaalaccount van ${user.fullName} (${user.email}) ${parsed.data.active ? "weer toegelaten" : "geblokkeerd"}.`);
    res.json(await list(req));
  });

  app.post("/api/portal/colleagues/:id/invite", ...guard, async (req, res) => {
    const user = await target(req, res); if (!user) return;
    if (user.passwordHash) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "This account is already activated");
    if (!user.active) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "This account is blocked");
    let sent = false;
    try { sent = (await sendPortalInvite(user, "invite")).sent; } catch (error) { console.error("portal colleague invite failed:", error); }
    await logPortalActivity(req, "colleague_invite_resent", { entity: "portal_user", entityId: user.id, details: { email: user.email } });
    res.json({ inviteSent: sent });
  });
}
