import { storage } from "../storage";
import { users, patchUserSchema } from "../../shared/schema";
import { parsePartialUpdate } from "../middleware/validateBody";
import { revokeUserSessions } from "../utils/security/sessionManager.js";
import { z } from "zod";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { insertUserSchema, UserRole, UserPermission } from "../../shared/schema";
import { hashPassword, comparePasswords } from "../auth";
import { realtimeEvents } from "../realtime-events";
import { hasPermission, recordAccessDenied, ACCESS_DENIED_ACTION } from "../middleware/permissions.js";
import { auditLogs } from "../../shared/schema";
import { canOpenPage, pageAccessFor } from "../../shared/page-access";
import { passwordPolicyIssues, passwordTooWeakBody } from "../../shared/password-policy";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

/**
 * D19: the ids of the active administrators, locked for the rest of the
 * transaction. Counting them under FOR UPDATE makes "is this the last one?"
 * and the delete/update that follows one atomic step: two admins removing each
 * other at the same moment cannot both pass the check.
 */
async function lockActiveAdminIds(tx: Pick<typeof db, "select">): Promise<number[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, UserRole.ADMIN), eq(users.active, true)))
    .orderBy(users.id)
    .for("update");
  return rows.map((r) => r.id);
}

class LastAdminError extends Error {
  readonly code = "LAST_ADMIN";
}

const lastAdminBody = () => ({
  message: "The last active administrator account cannot be removed, demoted or deactivated",
  code: "LAST_ADMIN",
});

/**
 * Security review 2026-10-18 (Middel 5): "gebruikers beheren" is a right you hand a shift leader, not
 * a back door to every other right. Someone who is not an administrator may only grant the rights
 * they hold themselves (rights the account already had may stay), and may not touch an
 * administrator's account at all. Returns the rights that go beyond that ceiling.
 */
function rightsBeyondCeiling(
  caller: { role?: string | null; permissions?: string[] | null },
  requested: unknown,
  alreadyHeld: readonly string[] = [],
): string[] {
  if (caller.role === UserRole.ADMIN || !Array.isArray(requested)) return [];
  const own = new Set(caller.permissions ?? []);
  const had = new Set(alreadyHeld);
  return requested.filter((p): p is string => typeof p === "string" && !own.has(p) && !had.has(p));
}

const ceilingBody = (rights: string[]) => ({
  message: "You can only grant rights you hold yourself",
  code: "PERMISSION_CEILING",
  permissions: rights,
});

const adminTargetBody = () => ({
  message: "Only an administrator can change or remove an administrator account",
  code: "ADMIN_ACCOUNT_PROTECTED",
});

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerUserRoutes(app: Express, deps: RouteDeps): void {
  const { requireAuth } = deps;

  app.get("/api/audit-logs", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

      const result = await storage.getAuditLogs({
        limit,
        offset,
        username: typeof req.query.username === 'string' && req.query.username ? req.query.username : undefined,
        action: typeof req.query.action === 'string' && req.query.action ? req.query.action : undefined,
        resourceType: typeof req.query.resourceType === 'string' && req.query.resourceType ? req.query.resourceType : undefined,
        // OPT-022: the filter existed in the query string and in the UI, but
        // never reached the query - one reservation's history came back as 906
        // rows.
        resourceId: typeof req.query.resourceId === 'string' && req.query.resourceId ? req.query.resourceId : undefined,
        search: typeof req.query.search === 'string' && req.query.search ? req.query.search : undefined,
        from: typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined,
        to: typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined,
        // Screens and dialogs are a view of their own; anything else is the default.
        scope: req.query.scope === 'ui' || req.query.scope === 'all' ? req.query.scope : 'changes',
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch activity log" });
    }
  });

  /**
   * OPT-022 - the "Geschiedenis" tab on the reservation, vehicle and customer
   * dialog. One record's rows, newest first.
   *
   * Permission: the *manage* permission of the record's own type (a
   * MANAGE_USERS holder keeps access to everything, as on the activity log
   * itself). The audit rows carry colleagues' usernames, so viewing a record
   * is deliberately not enough; see the note in the phase-34 report - the
   * owner has not been asked which permission this should be.
   */
  const HISTORY_PERMISSIONS: Record<string, string[]> = {
    reservation: [UserPermission.MANAGE_USERS, UserPermission.MANAGE_RESERVATIONS],
    vehicle: [UserPermission.MANAGE_USERS, UserPermission.MANAGE_VEHICLES],
    customer: [UserPermission.MANAGE_USERS, UserPermission.MANAGE_CUSTOMERS],
    expense: [UserPermission.MANAGE_USERS, UserPermission.MANAGE_EXPENSES],
    document: [UserPermission.MANAGE_USERS, UserPermission.MANAGE_DOCUMENTS],
    // Drivers belong to a customer and are managed under that customer's rights.
    driver: [UserPermission.MANAGE_USERS, UserPermission.MANAGE_CUSTOMERS],
  };

  app.get(
    "/api/audit-logs/resource/:resourceType/:resourceId",
    requireAuth,
    // Coarse gate so the default-deny net (FIX-I) sees a permission guard; the
    // per-type check below is the narrow one.
    hasPermission(
      UserPermission.MANAGE_USERS,
      UserPermission.MANAGE_RESERVATIONS,
      UserPermission.MANAGE_VEHICLES,
      UserPermission.MANAGE_CUSTOMERS,
      UserPermission.MANAGE_EXPENSES,
      UserPermission.MANAGE_DOCUMENTS,
    ),
    async (req, res) => {
    try {
      const resourceType = String(req.params.resourceType);
      const allowed = HISTORY_PERMISSIONS[resourceType];
      if (!allowed) {
        return res.status(400).json({ message: "Unsupported resource type" });
      }
      // hasPermission() is middleware; this route picks its permission set from
      // the path, so the same check runs here by hand.
      const user = req.user as { role?: string; permissions?: string[] } | undefined;
      const permitted = user?.role === "admin"
        || allowed.some((p) => (user?.permissions ?? []).includes(p));
      if (!permitted) {
        return res.status(403).json({ message: "You do not have permission to view this history" });
      }

      const resourceId = String(req.params.resourceId);
      if (!/^[0-9]{1,12}$/.test(resourceId)) {
        return res.status(400).json({ message: "Invalid resource id" });
      }

      const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 200);
      const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

      const result = await storage.getAuditLogs({ limit, offset, resourceType, resourceId });
      res.json(result);
    } catch (error) {
      console.error("Error fetching record history:", error);
      res.status(500).json({ message: "Failed to fetch record history" });
    }
  },
  );

  // Distinct values for the activity log filters
  app.get("/api/audit-logs/filters", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (_req, res) => {
    try {
      res.json(await storage.getAuditLogFilterOptions());
    } catch (error) {
      console.error("Error fetching audit log filters:", error);
      res.status(500).json({ message: "Failed to fetch activity log filters" });
    }
  });

  // ==================== D14: REFUSED ATTEMPTS ====================
  // The no-access page reports the screen it showed instead of a page. Any
  // signed-in user may report - there is nothing to guard beyond the page
  // address being sane - but a row is written only for a page the user really
  // may not open, so nobody can plant attempts that never happened, and the
  // same page is written at most once per 5 minutes.
  app.post("/api/access-denied", requireAuth, async (req, res) => {
    try {
      const raw = typeof req.body?.page === "string" ? req.body.page : "";
      const page = raw.split(/[?#]/)[0];
      if (!/^\/[A-Za-z0-9\-._~%:/]*$/.test(page) || page.length > 200) {
        return res.status(400).json({ message: "Invalid page", code: "INVALID_PAGE", field: "page" });
      }
      const user = req.user!;
      if (canOpenPage(user, page)) {
        return res.json({ recorded: false });
      }
      const recorded = await recordAccessDenied({
        userId: user.id,
        username: user.username,
        method: "GET",
        path: page,
        // /reservations/edit/1 and /Reservations/Edit/2 are one page.
        dedupeKey: `PAGE ${pageAccessFor(page)?.path ?? page}`,
        required: pageAccessFor(page)?.anyOf ?? [],
        page,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json({ recorded });
    } catch (error) {
      console.error("Error recording a refused page:", error);
      res.status(500).json({ message: "Failed to record the refused attempt" });
    }
  });

  // The administrator dashboard banner and its list: what was refused since
  // `since` (the previous login), newest first.
  app.get("/api/access-denied", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
      if (!since || Number.isNaN(since.getTime())) {
        return res.status(400).json({ message: "A valid since date is required", code: "INVALID_SINCE", field: "since" });
      }
      const where = and(eq(auditLogs.action, ACCESS_DENIED_ACTION), gt(auditLogs.createdAt, since));
      const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(200);
      const [totals] = await db
        .select({
          count: sql<number>`count(*)::int`,
          users: sql<number>`count(distinct coalesce(${auditLogs.username}, ''))::int`,
        })
        .from(auditLogs)
        .where(where);
      res.json({
        since: since.toISOString(),
        count: Number(totals?.count) || 0,
        users: Number(totals?.users) || 0,
        entries: rows.map((row) => {
          const details = (row.details ?? {}) as Record<string, unknown>;
          return {
            id: row.id,
            userId: row.userId,
            username: row.username,
            createdAt: row.createdAt,
            method: details.method ?? null,
            path: details.path ?? null,
            required: Array.isArray(details.required) ? details.required : [],
            page: details.page ?? null,
            summary: details.summary === true,
          };
        }),
      });
    } catch (error) {
      console.error("Error fetching refused attempts:", error);
      res.status(500).json({ message: "Failed to fetch refused attempts" });
    }
  });

  // ==================== USER MANAGEMENT ROUTES ====================
  // Get all users (requires MANAGE_USERS permission)
  app.get("/api/users", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();

      // D19: the dialog disables the delete button of the last active admin;
      // the server counts, the client only reads this flag.
      const activeAdmins = allUsers.filter((u) => u.role === UserRole.ADMIN && u.active);

      // Don't send passwords to client
      const safeUsers = allUsers.map(user => {
        const { password, mileageOverridePasswordHash: _mileageOverrideHash, ...userWithoutPassword } = user;
        return {
          ...userWithoutPassword,
          isLastAdmin: activeAdmins.length === 1 && activeAdmins[0].id === user.id,
        };
      });
      
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  
  // Get single user (requires MANAGE_USERS permission)
  app.get("/api/users/:id", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Don't send password to client
      const { password, mileageOverridePasswordHash: _mileageOverrideHash, ...userWithoutPassword } = user;
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  
  // Create user (requires MANAGE_USERS permission)
  app.post("/api/users", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);

      // A new account needs a real password. An empty or whitespace-only one was
      // hashed and stored, which gave an account nobody could sign in to with the
      // intended secret (the edit form already treats a blank password as "no
      // change", so create must not accept what edit ignores). The create dialog
      // checks the same thing before it posts; this is the server's own backstop.
      if (typeof userData.password !== "string" || userData.password.trim() === "") {
        return res.status(400).json({
          message: "A password is required to create an account",
          code: "PASSWORD_REQUIRED",
          field: "password",
        });
      }

      // BUG-001: manage_users is a permission you hand a shift leader. It must
      // not be a route to creating administrators — only a real admin may set
      // role:"admin".
      if (userData.role === UserRole.ADMIN && req.user!.role !== UserRole.ADMIN) {
        return res.status(403).json({ message: "Only an administrator can create an administrator account" });
      }

      const beyondOnCreate = rightsBeyondCeiling(req.user!, userData.permissions);
      if (beyondOnCreate.length > 0) {
        return res.status(403).json(ceilingBody(beyondOnCreate));
      }

      // D12: checked after the 403 above, so rights are judged first.
      const weakness = passwordPolicyIssues(userData.password);
      if (weakness.length > 0) {
        return res.status(400).json(passwordTooWeakBody(weakness));
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists", code: "USERNAME_EXISTS", field: "username" });
      }
      
      // Add audit trail
      const currentUser = req.user!;
      const enrichedUserData = {
        ...userData,
        createdBy: currentUser.username,
        updatedBy: currentUser.username
      };
      
      // Hash password before storing
      const hashedPassword = await hashPassword(userData.password);
      
      const newUser = await storage.createUser({
        ...enrichedUserData,
        password: hashedPassword
      });
      
      // Don't send password back to client
      const { password, mileageOverridePasswordHash: _mileageOverrideHash, ...userWithoutPassword } = newUser;
      
      // Broadcast real-time update
      realtimeEvents.users.created(userWithoutPassword);
      
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(400).json({ 
        message: "Failed to create user", 
      });
    }
  });
  
  // Update user with self-update for own profile
  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Allow users to update their own profile, admin, or users with MANAGE_USERS permission for others
      const currentUser = req.user!;
      const isSelfUpdate = id === currentUser.id;
      const isAdmin = currentUser.role === UserRole.ADMIN;
      const hasManageUsersPermission = currentUser.permissions?.includes(UserPermission.MANAGE_USERS) || false;
      
      if (!isSelfUpdate && !isAdmin && !hasManageUsersPermission) {
        return res.status(403).json({ message: "Not authorized to update other user accounts" });
      }
      
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Security review 2026-10-18 (Middel 5): an administrator's account is changed by administrators only.
      if (!isSelfUpdate && !isAdmin && user.role === UserRole.ADMIN) {
        return res.status(403).json(adminTargetBody());
      }
      
      // BUG-063: the body is validated against a closed field list instead of
      // being spread, so `id`, `createdAt`, `createdBy` and every other column
      // simply cannot be written from a request.
      const patch = parsePartialUpdate(req.body, {
        table: users,
        schema: patchUserSchema,
        message: "Invalid user data",
      }) as Record<string, any>;

      // The users dialog sends `password: ""` when "Nieuw wachtwoord (leeg laten om
      // te behouden)" is left empty. Only a non-empty string is a password change;
      // anything else (empty, whitespace-only, null, absent) means "no change", so
      // the key is dropped here, before anything reads it: the BUG-063 rule below
      // must not refuse a manager who merely saved a colleague without touching
      // the password, and the value must never reach storage (it used to be
      // written as the stored hash, after which the user could not log in).
      if (typeof patch.password !== "string" || patch.password.trim() === "") {
        delete patch.password;
      }

      // BUG-063: resetting *another* account's password was reachable for anyone
      // with manage_users. A password may only be set on your own row, or by a
      // real administrator.
      if (patch.password !== undefined && !isSelfUpdate && !isAdmin) {
        return res.status(403).json({
          message: "Only an administrator can set another account's password",
          field: "password",
        });
      }

      // D12: nobody sets their own password through PATCH any more - that is
      // "Wachtwoord wijzigen", which asks for the current password. An admin
      // may still reset another account (the users dialog), under the rule.
      if (patch.password !== undefined) {
        if (isSelfUpdate) {
          return res.status(400).json({
            message: "Use change-password to change your own password",
            code: "USE_CHANGE_PASSWORD",
            field: "password",
          });
        }
        const weakness = passwordPolicyIssues(patch.password);
        if (weakness.length > 0) {
          return res.status(400).json(passwordTooWeakBody(weakness));
        }
      }

      // If updating username, check if new username already exists
      if (patch.username && patch.username !== user.username) {
        const existingUser = await storage.getUserByUsername(patch.username);
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists", code: "USERNAME_EXISTS", field: "username" });
        }
      }

      // For self-update, only allow certain fields (username, fullName, email)
      let userData: Record<string, any>;
      if (isSelfUpdate && !isAdmin && !hasManageUsersPermission) {
        // No password here: any password on a self-update was already answered
        // with USE_CHANGE_PASSWORD above.
        const { username, fullName, email } = patch;
        userData = {
          username,
          fullName,
          email,
          updatedBy: currentUser.username
        };

        // Filter out undefined values
        Object.keys(userData).forEach(key => 
          userData[key] === undefined && delete userData[key]
        );
      } else {
        // Admin and users with MANAGE_USERS permission can update all fields
        userData = {
          ...patch,
          updatedBy: currentUser.username
        };
      }
      
      // Special handling for admin-only operations
      if (!isAdmin && !hasManageUsersPermission) {
        // Non-admins and users without MANAGE_USERS can't change roles or permissions
        delete userData.role;
        delete userData.permissions;
        delete userData.active;
        delete userData.hidePrices;
      }

      // BUG-001: two privilege-escalation doors closed. A caller who is not a
      // real admin may never set role:"admin" on anybody, and may never touch
      // role or permissions on their *own* row — which is how a manager with
      // manage_users promoted itself to admin during the audit.
      if (!isAdmin) {
        if (userData.role === UserRole.ADMIN) {
          return res.status(403).json({ message: "Only an administrator can grant the admin role" });
        }
        if (isSelfUpdate) {
          delete userData.role;
          delete userData.permissions;
        }
        const beyondOnUpdate = rightsBeyondCeiling(currentUser, userData.permissions, user.permissions ?? []);
        if (beyondOnUpdate.length > 0) {
          return res.status(403).json(ceilingBody(beyondOnUpdate));
        }
      }
      
      // Security review 2026-10-18 (Hoog 3): an account that is switched off, or whose password
      // someone else resets, is logged out everywhere at once. A user changing their own password
      // here keeps the session they are using; their other sessions end.
      const endSessionsAfterSave = async () => {
        if (userData.active !== false && !userData.password) return;
        const revoked = await revokeUserSessions(id, isSelfUpdate && userData.active !== false ? req.sessionID : undefined);
        if (revoked > 0) console.log(`🔒 Ended ${revoked} session(s) of user ${id} after ${userData.active === false ? "deactivation" : "password reset"}`);
      };

      // D19: demoting or deactivating an active administrator is checked against
      // the other active administrators, under a lock, in the same transaction
      // as the write. Everything else keeps the unguarded path below.
      const losesAdminSeat =
        user.role === UserRole.ADMIN &&
        user.active &&
        ((userData.role !== undefined && userData.role !== UserRole.ADMIN) || userData.active === false);
      if (losesAdminSeat) {
        try {
          const { password: newPassword, ...otherData } = userData;
          const updatedUser = await db.transaction(async (tx) => {
            const adminIds = await lockActiveAdminIds(tx);
            if (adminIds.length <= 1 && adminIds.includes(id)) throw new LastAdminError();
            const [row] = await tx
              .update(users)
              .set({ ...otherData, updatedAt: new Date() })
              .where(eq(users.id, id))
              .returning();
            return row;
          });
          if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
          }
          if (newPassword) {
            await storage.updateUserPassword(id, await hashPassword(newPassword));
          }
          const { password: _hidden, mileageOverridePasswordHash: _mileageOverrideHash, ...safeUser } = updatedUser;
          await endSessionsAfterSave();
          realtimeEvents.users.updated(safeUser);
          return res.json(safeUser);
        } catch (error) {
          if (error instanceof LastAdminError) {
            return res.status(409).json(lastAdminBody());
          }
          throw error;
        }
      }

      // Handle password separately (a blank one was already dropped from `patch`
      // above, and `userData` is built from `patch`).
      if (userData.password) {
        // Separate password from other data
        const { password, ...otherData } = userData;
        
        // Update user data without password
        const updatedUser = await storage.updateUser(id, otherData);
        
        // Update password separately with proper hashing
        const hashedPassword = await hashPassword(password);
        await storage.updateUserPassword(id, hashedPassword);
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Don't send password back to client
        const { password: _, mileageOverridePasswordHash: _mileageOverrideHash, ...userWithoutPassword } = updatedUser;
        await endSessionsAfterSave();
        
        // Broadcast real-time update
        realtimeEvents.users.updated(userWithoutPassword);
        
        res.json(userWithoutPassword);
      } else {
        // Update user without password change
        const updatedUser = await storage.updateUser(id, userData);
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Don't send password back to client
        const { password: _, mileageOverridePasswordHash: _mileageOverrideHash, ...userWithoutPassword } = updatedUser;
        await endSessionsAfterSave();
        
        // Broadcast real-time update
        realtimeEvents.users.updated(userWithoutPassword);
        
        res.json(userWithoutPassword);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(400).json({ 
        message: "Failed to update user", 
      });
    }
  });
  
  // Delete user (requires MANAGE_USERS permission)
  app.delete("/api/users/:id", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Prevent deletion of the current user
      if (id === req.user!.id) {
        return res.status(400).json({ message: "Cannot delete your own account", code: "CANNOT_DELETE_SELF" });
      }

      // Security review 2026-10-18 (Middel 5): only an administrator removes an administrator.
      if (req.user!.role !== UserRole.ADMIN) {
        const target = await storage.getUser(id);
        if (target?.role === UserRole.ADMIN) {
          return res.status(403).json(adminTargetBody());
        }
      }
      
      // D19: the last active administrator is refused (409); another admin may
      // be deleted. Count and delete happen in one transaction, the admins
      // locked, so two simultaneous deletes cannot empty the table of admins.
      // (The old storage.deleteUser swallowed every error as "not found", which
      // hid a foreign-key refusal behind a 404; here only a missing row is a 404.)
      const outcome = await db.transaction(async (tx) => {
        const adminIds = await lockActiveAdminIds(tx);
        if (adminIds.length <= 1 && adminIds.includes(id)) return "last-admin" as const;
        const removed = await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id });
        return removed.length > 0 ? ("deleted" as const) : ("missing" as const);
      });

      if (outcome === "last-admin") {
        return res.status(409).json(lastAdminBody());
      }
      if (outcome === "missing") {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ success: true, message: "User successfully deleted" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ 
        message: "Failed to delete user", 
      });
    }
  });
  
  // Update current user's password
  app.post("/api/users/change-password", requireAuth, async (req, res) => {
    try {
      // Validate request body with Zod
      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        // The strength rule is the shared D12 policy, applied below so the
        // answer carries a stable code instead of English text.
        newPassword: z.string().max(100, "New password is too long"),
      });

      const validationResult = changePasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.issues.map(i => i.message) 
        });
      }

      const { currentPassword, newPassword } = validationResult.data;

      const weakness = passwordPolicyIssues(newPassword);
      if (weakness.length > 0) {
        return res.status(400).json(passwordTooWeakBody(weakness));
      }
      
      // Get current user
      const user = await storage.getUser(req.user!.id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify current password
      const isPasswordValid = await comparePasswords(currentPassword, user.password);
      
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect", code: "CURRENT_PASSWORD_INCORRECT" });
      }
      
      // Hash and update new password.
      // BUG-189: the write carries the old hash as its precondition, so two
      // tabs submitting the same current password cannot both succeed — the
      // second is told its "current password" is no longer current, which by
      // then is exactly true.
      const hashedPassword = await hashPassword(newPassword);
      const changed = await storage.updateUserPasswordIfCurrent(user.id, user.password, hashedPassword);
      if (!changed) {
        return res.status(400).json({ message: "Current password is incorrect", code: "CURRENT_PASSWORD_INCORRECT" });
      }

      // BUG-091: a password change left every other session of this account
      // logged in, so changing it after a compromise changed nothing for the
      // attacker. Every session but the caller's own is revoked, and its row
      // is removed from the store so the cookie cannot be loaded again.
      try {
        const revoked = await revokeUserSessions(user.id, req.sessionID);
        if (revoked > 0) {
          console.log(`[password-change] Revoked ${revoked} other session(s) for user #${user.id}.`);
        }
      } catch (revokeError) {
        console.error("Failed to revoke other sessions after a password change:", revokeError);
      }

      res.json({ success: true, message: "Password successfully updated" });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ 
        message: "Failed to update password", 
      });
    }
  });
}
