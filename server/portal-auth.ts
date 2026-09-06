import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { hashPassword, comparePasswords } from "./auth";
import { useSecureCookies } from "./utils/secure-cookies.js";
import { createCsrfMiddleware } from "./middleware/security/csrf.js";
import { checkAccountLockout, recordLoginAttempt, clearFailedAttempts, loginLimiter } from "./middleware/security/rateLimiter.js";
import { portalStorage, type PortalScope } from "./services/portal-storage";
import { sendPortalInvite, sendEmailChangeMail, sendNewDeviceMail } from "./services/portal-mail";
import { getPortalConfig } from "./services/portal-config";
import { randomBytes } from "crypto";
import { notifyStaffOfPortalEvent } from "./services/portal-notifications";
import { hashInviteToken } from "./services/portal-tokens";
import { PortalUserRole, type PortalUser, type PortalCustomerSettings, type PortalKnownDevice } from "../shared/schema";
import { PORTAL_ERROR, type PortalErrorCode, type PortalMe, type PortalSettingsFlags, type PortalCompanyEmails } from "../shared/portal-types";

export interface PortalRequestContext {
  user: PortalUser;
  customerId: number;
  settings: PortalCustomerSettings;
  scope: PortalScope;
}

declare global {
  namespace Express {
    interface Request {
      portalUser?: PortalRequestContext;
    }
  }
}

export const PORTAL_PASSWORD_MIN = 10;
const PORTAL_SESSION_MAX_AGE = 60 * 60 * 1000; // 1 hour of inactivity, rolling
const LOCKOUT_PREFIX = "portal:";

export function portalError(res: Response, status: number, code: PortalErrorCode, error: string) {
  return res.status(status).json({ error, code });
}

/** Effective features: the customer setting is the ceiling, the account can only take a feature away. */
export function settingsFlags(s: PortalCustomerSettings, user?: Pick<PortalUser, "permissions">): PortalSettingsFlags {
  const p = (user?.permissions ?? {}) as Record<string, boolean | undefined>;
  const allow = (key: string, customerValue: boolean) => customerValue && p[key] !== false;
  return {
    portalEnabled: s.portalEnabled,
    canBook: allow("canBook", s.canBook), canManageDrivers: allow("canManageDrivers", s.canManageDrivers),
    canSubmitRequests: allow("canSubmitRequests", s.canSubmitRequests), canViewFines: allow("canViewFines", s.canViewFines),
    canViewContracts: allow("canViewContracts", s.canViewContracts), showPrices: allow("showPrices", s.showPrices),
    canReturn: allow("canReturn", s.canReturn),
  };
}

async function buildMe(ctx: PortalRequestContext): Promise<PortalMe> {
  const [customer, config] = await Promise.all([storage.getCustomer(ctx.customerId), getPortalConfig()]);
  const languageOverride = ctx.user.language === "en" || ctx.user.language === "nl" ? ctx.user.language : null;
  const company: PortalCompanyEmails | undefined = ctx.user.role === "admin" && customer
    ? { email: customer.email ?? null, emailForMOT: customer.emailForMOT ?? null, emailForInvoices: customer.emailForInvoices ?? null, emailGeneral: customer.emailGeneral ?? null }
    : undefined;
  return {
    id: ctx.user.id, email: ctx.user.email, fullName: ctx.user.fullName,
    role: ctx.user.role as "admin" | "driver", driverId: ctx.user.driverId,
    customerId: ctx.customerId,
    customerName: customer?.companyName || customer?.name || "",
    language: languageOverride ?? (customer?.preferredLanguage === "en" ? "en" : "nl"),
    languageOverride,
    pendingEmail: ctx.user.pendingEmail && ctx.user.emailChangeExpiresAt && ctx.user.emailChangeExpiresAt.getTime() > Date.now() ? ctx.user.pendingEmail : null,
    company,
    settings: settingsFlags(ctx.settings, ctx.user),
    info: { pickupAddress: config.pickupAddress, openingHours: config.openingHours, pickupInstructions: config.pickupInstructions, privacyUrl: config.privacyUrl },
  };
}

const DEVICE_COOKIE = "portal_device";
const MAX_KNOWN_DEVICES = 10;

/**
 * Remembers the browser in a long-lived cookie. A login from a browser this
 * account has not used before gets a warning mail (not on the very first login).
 */
async function rememberDevice(req: Request, res: Response, user: PortalUser): Promise<void> {
  const ua = (req.get("user-agent") || "unknown").slice(0, 300);
  const now = new Date().toISOString();
  const known: PortalKnownDevice[] = Array.isArray(user.knownDevices) ? [...user.knownDevices] : [];
  // No cookie-parser in this app: read the header directly.
  const cookieId = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(DEVICE_COOKIE + "="))?.slice(DEVICE_COOKIE.length + 1) || null;
  const seen = cookieId ? known.find((d) => d.id === cookieId) : undefined;
  if (seen) {
    seen.lastSeen = now; seen.ua = ua;
  } else {
    const id = randomBytes(16).toString("hex");
    const sec = useSecureCookies(); res.cookie(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: sec === "auto" ? undefined : sec, maxAge: 400 * 86_400_000, path: "/api/portal" });
    const firstLoginEver = known.length === 0 && !user.lastLoginAt;
    known.push({ id, ua, firstSeen: now, lastSeen: now });
    if (!firstLoginEver) {
      try { await sendNewDeviceMail(user, { ua, ip: req.ip || "onbekend", at: now }); } catch (e) { console.error("new device mail failed:", e); }
    }
  }
  await portalStorage.updatePortalUser(user.id, { knownDevices: known.slice(-MAX_KNOWN_DEVICES) });
}

/** Loads user + settings; returns a reason when the account may not be used. */
async function loadContext(userId: number): Promise<{ ctx?: PortalRequestContext; code?: PortalErrorCode }> {
  const user = await portalStorage.getPortalUser(userId);
  if (!user || !user.active) return { code: PORTAL_ERROR.ACCOUNT_BLOCKED };
  const settings = await portalStorage.getOrCreateCustomerSettings(user.customerId);
  if (!settings.portalEnabled) return { code: PORTAL_ERROR.PORTAL_DISABLED };
  const scope: PortalScope = user.role === PortalUserRole.DRIVER ? { driverId: user.driverId } : {};
  return { ctx: { user, customerId: user.customerId, settings, scope } };
}

export async function logPortalActivity(
  req: Request,
  action: string,
  extra: { entity?: string; entityId?: number; details?: Record<string, unknown>; customerId?: number; portalUserId?: number } = {},
): Promise<void> {
  const ctx = req.portalUser;
  const customerId = extra.customerId ?? ctx?.customerId;
  if (!customerId) return;
  try {
    await portalStorage.logActivity({
      customerId,
      portalUserId: extra.portalUserId ?? ctx?.user.id ?? null,
      action,
      entity: extra.entity ?? null,
      entityId: extra.entityId ?? null,
      details: extra.details ?? null,
      ip: req.ip || req.socket.remoteAddress || null,
    });
  } catch (error) {
    console.error("portal activity log failed:", error);
  }
}

export function requireFeature(flag: keyof PortalSettingsFlags): RequestHandler {
  return (req, res, next) => {
    if (!req.portalUser) return portalError(res, 401, PORTAL_ERROR.NOT_AUTHENTICATED, "Not authenticated");
    if (!settingsFlags(req.portalUser.settings, req.portalUser.user)[flag]) return portalError(res, 403, PORTAL_ERROR.FEATURE_DISABLED, "This feature is disabled for your account");
    next();
  };
}

export function requirePortalRole(role: "admin"): RequestHandler {
  return (req, res, next) => {
    if (!req.portalUser) return portalError(res, 401, PORTAL_ERROR.NOT_AUTHENTICATED, "Not authenticated");
    if (req.portalUser.user.role !== role) return portalError(res, 403, PORTAL_ERROR.ROLE_FORBIDDEN, "Not allowed for your role");
    next();
  };
}

const passwordSchema = z.string().min(PORTAL_PASSWORD_MIN, `Password must be at least ${PORTAL_PASSWORD_MIN} characters`);

export function setupPortalAuth(app: Express): { requirePortalUser: RequestHandler } {
  const PostgresSessionStore = connectPg(session);
  const portalPassport = new passport.Passport();

  const portalSession = session({
    name: "portal.sid",
    secret: process.env.SESSION_SECRET || "portal-dev-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PostgresSessionStore({ pool, createTableIfMissing: true }),
    cookie: {
      maxAge: PORTAL_SESSION_MAX_AGE,
      secure: useSecureCookies(),
      httpOnly: true,
      // lax (not strict): the first navigation into the iframe on the website
      // must carry the cookie. Portal and site are same-site by deployment rule.
      sameSite: "lax",
    },
  });

  const csrf = createCsrfMiddleware({
    cookieName: "PORTAL-XSRF-TOKEN",
    sameSite: "lax",
    exemptPaths: ["/api/portal/login", "/api/portal/forgot", "/api/portal/activate", "/api/portal/email/confirm"],
  });

  portalPassport.use("portal-local", new LocalStrategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
    try {
      const user = await portalStorage.getPortalUserByEmail(email);
      if (!user || !user.passwordHash) return done(null, false);
      const ok = await comparePasswords(password, user.passwordHash);
      return ok ? done(null, user as unknown as Express.User) : done(null, false);
    } catch (error) {
      return done(error);
    }
  }));
  portalPassport.serializeUser((user: any, done) => done(null, { kind: "portal", id: (user as PortalUser).id }));
  portalPassport.deserializeUser(async (serialized: any, done) => {
    if (!serialized || serialized.kind !== "portal") return done(null, false);
    try {
      const user = await portalStorage.getPortalUser(serialized.id);
      done(null, (user ?? false) as unknown as Express.User | false);
    } catch (error) {
      done(error);
    }
  });

  app.use("/api/portal", portalSession, portalPassport.initialize(), portalPassport.session(), csrf.attachCsrfToken, csrf.csrfProtection);

  // last_seen_at is written at most once a minute per user, so the staff
  // "online" overview costs no extra write on ordinary requests.
  const lastSeenWrites = new Map<number, number>();
  const LAST_SEEN_THROTTLE_MS = 60_000;
  const touchLastSeen = (userId: number) => {
    const now = Date.now();
    if ((lastSeenWrites.get(userId) ?? 0) > now - LAST_SEEN_THROTTLE_MS) return;
    lastSeenWrites.set(userId, now);
    portalStorage.updatePortalUser(userId, { lastSeenAt: new Date(now) }).catch((e) => console.error("portal last_seen update failed:", e));
  };

  const requirePortalUser: RequestHandler = async (req, res, next) => {
    const raw = req.user as unknown as PortalUser | undefined;
    if (!raw || !(req as any).isAuthenticated?.()) return portalError(res, 401, PORTAL_ERROR.NOT_AUTHENTICATED, "Not authenticated");
    const { ctx, code } = await loadContext(raw.id);
    if (!ctx) {
      req.logout(() => undefined);
      return portalError(res, 403, code!, "Account is not available");
    }
    req.portalUser = ctx;
    touchLastSeen(ctx.user.id);
    next();
  };

  app.get("/api/portal/csrf-token", (_req, res) => res.json({ token: res.locals.csrfToken }));

  app.post("/api/portal/login", loginLimiter, async (req, res, next) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "E-mail and password are required");
    const email = parsed.data.email.trim().toLowerCase();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ua = req.get("user-agent") || "unknown";
    const lockKey = LOCKOUT_PREFIX + email;

    const lock = await checkAccountLockout(lockKey, ip);
    if (lock.locked) return portalError(res, 429, PORTAL_ERROR.LOCKED, "Too many attempts, try again later");

    portalPassport.authenticate("portal-local", async (err: any, user: PortalUser | false) => {
      if (err) return next(err);
      if (!user) {
        await recordLoginAttempt(lockKey, ip, ua, false, "invalid_credentials");
        return portalError(res, 401, PORTAL_ERROR.INVALID_CREDENTIALS, "Invalid e-mail or password");
      }
      const { ctx, code } = await loadContext(user.id);
      if (!ctx) {
        await recordLoginAttempt(lockKey, ip, ua, false, code);
        return portalError(res, 403, code!, "Account is not available");
      }
      req.session.regenerate((regenErr: any) => {
        if (regenErr) return next(regenErr);
        req.login(user as unknown as Express.User, async (loginErr: any) => {
          if (loginErr) return next(loginErr);
          await recordLoginAttempt(lockKey, ip, ua, true);
          await clearFailedAttempts(lockKey);
          await rememberDevice(req, res, user);
          await portalStorage.updatePortalUser(user.id, { lastLoginAt: new Date() });
          req.portalUser = ctx;
          await logPortalActivity(req, "login");
          res.json(await buildMe(ctx));
        });
      });
    })(req, res, next);
  });

  app.post("/api/portal/logout", async (req, res) => {
    if (req.user) {
      const raw = req.user as unknown as PortalUser;
      await logPortalActivity(req, "logout", { customerId: raw.customerId, portalUserId: raw.id });
    }
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("portal.sid");
        res.json({ ok: true });
      });
    });
  });

  app.get("/api/portal/me", requirePortalUser, async (req, res) => {
    res.json(await buildMe(req.portalUser!));
  });

  app.patch("/api/portal/me", requirePortalUser, async (req, res) => {
    const parsed = z.object({ fullName: z.string().trim().min(1).max(200).optional(), language: z.enum(["nl", "en"]).nullable().optional() }).safeParse(req.body);
    if (!parsed.success || (parsed.data.fullName === undefined && parsed.data.language === undefined)) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Nothing to save");
    const patch: Record<string, unknown> = { updatedBy: req.portalUser!.user.email };
    if (parsed.data.fullName !== undefined) patch.fullName = parsed.data.fullName;
    if (parsed.data.language !== undefined) patch.language = parsed.data.language;
    await portalStorage.updatePortalUser(req.portalUser!.user.id, patch);
    const { ctx } = await loadContext(req.portalUser!.user.id);
    res.json(await buildMe(ctx!));
  });

  // Change the login address: the new address gets a confirmation link; nothing changes until it is used.
  app.post("/api/portal/me/email", requirePortalUser, async (req, res) => {
    const parsed = z.object({ newEmail: z.string().trim().email().max(200), currentPassword: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const user = req.portalUser!.user;
    if (!user.passwordHash || !(await comparePasswords(parsed.data.currentPassword, user.passwordHash))) {
      return portalError(res, 400, PORTAL_ERROR.INVALID_CREDENTIALS, "Current password is incorrect");
    }
    const newEmail = parsed.data.newEmail.toLowerCase();
    if (newEmail === user.email.toLowerCase()) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Dit is al uw e-mailadres");
    const taken = await portalStorage.getPortalUserByEmail(newEmail);
    if (taken && taken.id !== user.id) return portalError(res, 409, PORTAL_ERROR.EMAIL_IN_USE, "Dit e-mailadres is al in gebruik");
    try { await sendEmailChangeMail(user, newEmail); } catch (error) { console.error("email change mail failed:", error); return portalError(res, 500, PORTAL_ERROR.SERVER, "Mail could not be sent"); }
    await logPortalActivity(req, "email_change_requested", { details: { newEmail } });
    res.json({ ok: true, pendingEmail: newEmail });
  });

  app.post("/api/portal/me/email/cancel", requirePortalUser, async (req, res) => {
    await portalStorage.updatePortalUser(req.portalUser!.user.id, { pendingEmail: null, emailChangeTokenHash: null, emailChangeExpiresAt: null, updatedBy: req.portalUser!.user.email });
    res.json({ ok: true });
  });

  // Public: the link from the mail. Works without being logged in.
  // No login limiter here: the token is 256 random bits, and the limiter would count against real logins.
  app.post("/api/portal/email/confirm", async (req, res) => {
    const parsed = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid token");
    const user = await portalStorage.getPortalUserByEmailChangeTokenHash(hashInviteToken(parsed.data.token));
    if (!user || !user.pendingEmail) return portalError(res, 400, PORTAL_ERROR.TOKEN_INVALID, "This link is not valid");
    if (!user.emailChangeExpiresAt || user.emailChangeExpiresAt.getTime() < Date.now()) return portalError(res, 400, PORTAL_ERROR.TOKEN_EXPIRED, "This link has expired");
    const taken = await portalStorage.getPortalUserByEmail(user.pendingEmail);
    if (taken && taken.id !== user.id) return portalError(res, 409, PORTAL_ERROR.EMAIL_IN_USE, "Dit e-mailadres is inmiddels in gebruik");
    const oldEmail = user.email;
    await portalStorage.updatePortalUser(user.id, { email: user.pendingEmail, pendingEmail: null, emailChangeTokenHash: null, emailChangeExpiresAt: null, updatedBy: user.pendingEmail });
    await portalStorage.logActivity({ customerId: user.customerId, portalUserId: user.id, action: "email_changed", details: { from: oldEmail, to: user.pendingEmail } });
    res.json({ ok: true, email: user.pendingEmail });
  });

  // Company contact addresses (APK, invoices, general): admin accounts may keep them up to date.
  app.patch("/api/portal/me/company", requirePortalUser, async (req, res) => {
    const ctx = req.portalUser!;
    if (ctx.user.role !== "admin") return portalError(res, 403, PORTAL_ERROR.ROLE_FORBIDDEN, "Only admin accounts can change company details");
    const optionalEmail = z.union([z.string().trim().email().max(200), z.literal("")]).optional();
    const parsed = z.object({ email: optionalEmail, emailForMOT: optionalEmail, emailForInvoices: optionalEmail, emailGeneral: optionalEmail }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid e-mail address");
    const data: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) data[k] = v === "" ? null : v;
    if (Object.keys(data).length === 0) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Nothing to save");
    const customer = await storage.updateCustomer(ctx.customerId, data as any);
    if (!customer) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Customer not found");
    await logPortalActivity(req, "company_emails_updated", { entity: "customer", entityId: ctx.customerId, details: data });
    await notifyStaffOfPortalEvent({
      kind: "portal_customer_update",
      title: `E-mailadressen gewijzigd: ${customer.companyName || customer.name}`,
      description: `${ctx.user.fullName} heeft via het portaal bijgewerkt: ${Object.keys(data).join(", ")}.`,
      link: `/customers/${ctx.customerId}`, customerId: ctx.customerId,
    });
    const { ctx: fresh } = await loadContext(ctx.user.id);
    res.json(await buildMe(fresh!));
  });

  app.post("/api/portal/me/password", requirePortalUser, async (req, res) => {
    const parsed = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const user = req.portalUser!.user;
    if (!user.passwordHash || !(await comparePasswords(parsed.data.currentPassword, user.passwordHash))) {
      return portalError(res, 400, PORTAL_ERROR.INVALID_CREDENTIALS, "Current password is incorrect");
    }
    await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword(parsed.data.newPassword), updatedBy: user.email });
    await logPortalActivity(req, "password_changed");
    res.json({ ok: true });
  });

  // Always 200: never reveal whether an address exists.
  app.post("/api/portal/forgot", loginLimiter, async (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (parsed.success) {
      const user = await portalStorage.getPortalUserByEmail(parsed.data.email);
      if (user && user.active) {
        try { await sendPortalInvite(user, "reset"); } catch (error) { console.error("portal reset mail failed:", error); }
      }
    }
    res.json({ ok: true });
  });

  app.post("/api/portal/activate", loginLimiter, async (req, res, next) => {
    const parsed = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), password: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const user = await portalStorage.getPortalUserByInviteTokenHash(hashInviteToken(parsed.data.token));
    if (!user) return portalError(res, 400, PORTAL_ERROR.TOKEN_INVALID, "This link is not valid");
    if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
      return portalError(res, 400, PORTAL_ERROR.TOKEN_EXPIRED, "This link has expired");
    }
    await portalStorage.updatePortalUser(user.id, {
      passwordHash: await hashPassword(parsed.data.password),
      inviteTokenHash: null, inviteExpiresAt: null, updatedBy: user.email,
    });
    const { ctx, code } = await loadContext(user.id);
    if (!ctx) return portalError(res, 403, code!, "Account is not available");
    req.session.regenerate((regenErr: any) => {
      if (regenErr) return next(regenErr);
      req.login(ctx.user as unknown as Express.User, async (loginErr: any) => {
        if (loginErr) return next(loginErr);
        req.portalUser = ctx;
        await logPortalActivity(req, "activate");
        res.json(await buildMe(ctx));
      });
    });
  });

  return { requirePortalUser };
}
