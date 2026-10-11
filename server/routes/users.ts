import { storage } from "../storage";
import { users, patchUserSchema } from "../../shared/schema";
import { parsePartialUpdate } from "../middleware/validateBody";
import { revokeUserSessions } from "../utils/security/sessionManager.js";
import { z } from "zod";
import { insertUserSchema, UserRole, UserPermission } from "../../shared/schema";
import { hashPassword, comparePasswords } from "../auth";
import { realtimeEvents } from "../realtime-events";
import { hasPermission } from "../middleware/permissions.js";
import { passwordPolicyIssues, passwordTooWeakBody } from "../../shared/password-policy";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

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

  // ==================== USER MANAGEMENT ROUTES ====================
  // Get all users (requires MANAGE_USERS permission)
  app.get("/api/users", requireAuth, hasPermission(UserPermission.MANAGE_USERS), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Don't send passwords to client
      const safeUsers = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
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
      const { password, ...userWithoutPassword } = user;
      
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
      const { password, ...userWithoutPassword } = newUser;
      
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
        const { username, fullName, email, password } = patch;
        userData = {
          username,
          fullName,
          email,
          password,
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
        const { password: _, ...userWithoutPassword } = updatedUser;
        
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
        const { password: _, ...userWithoutPassword } = updatedUser;
        
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
      
      const deleted = await storage.deleteUser(id);
      
      if (!deleted) {
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
