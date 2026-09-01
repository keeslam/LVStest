import { storage } from "../storage";
import { z } from "zod";
import { insertUserSchema, UserRole, UserPermission } from "../../shared/schema";
import { hashPassword, comparePasswords } from "../auth";
import { realtimeEvents } from "../realtime-events";
import { hasPermission, requireAdmin } from "../middleware/permissions.js";
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
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
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
        error: error instanceof Error ? error.message : "Unknown error" 
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
      
      // If updating username, check if new username already exists
      if (req.body.username && req.body.username !== user.username) {
        const existingUser = await storage.getUserByUsername(req.body.username);
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      
      // For self-update, only allow certain fields (username, fullName, email)
      let userData: Record<string, any>;
      if (isSelfUpdate && !isAdmin && !hasManageUsersPermission) {
        const { username, fullName, email } = req.body;
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
          ...req.body,
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
      
      // Handle password separately
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
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Original update user for backward compatibility
  app.patch("/api/users/:id/admin", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // If updating username, check if new username already exists
      if (req.body.username && req.body.username !== user.username) {
        const existingUser = await storage.getUserByUsername(req.body.username);
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      
      // Add audit trail
      const currentUser = req.user!;
      const userData = {
        ...req.body,
        updatedBy: currentUser.username
      };
      
      // Handle password separately
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
        const { password: pwd, ...userWithoutPassword } = updatedUser;
        return res.json(userWithoutPassword);
      } else {
        // Regular update without password change
        const updatedUser = await storage.updateUser(id, userData);
        
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Don't send password back to client
        const { password, ...userWithoutPassword } = updatedUser;
        return res.json(userWithoutPassword);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(400).json({ 
        message: "Failed to update user", 
        error: error instanceof Error ? error.message : "Unknown error" 
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
        return res.status(400).json({ message: "Cannot delete your own account" });
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
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Update current user's password
  app.post("/api/users/change-password", requireAuth, async (req, res) => {
    try {
      // Validate request body with Zod
      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string()
          .min(8, "New password must be at least 8 characters long")
          .max(100, "New password is too long")
          .regex(/[a-z]/, "Password must contain at least one lowercase letter")
          .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
          .regex(/[0-9]/, "Password must contain at least one number"),
      });

      const validationResult = changePasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.issues.map(i => i.message) 
        });
      }

      const { currentPassword, newPassword } = validationResult.data;
      
      // Get current user
      const user = await storage.getUser(req.user!.id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify current password
      const isPasswordValid = await comparePasswords(currentPassword, user.password);
      
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      
      // Hash and update new password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);
      
      res.json({ success: true, message: "Password successfully updated" });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ 
        message: "Failed to update password", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
}
