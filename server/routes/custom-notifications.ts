import type { Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { UserPermission } from "../../shared/schema";
import { realtimeEvents } from "../realtime-events";
import { hasPermission } from "../middleware/permissions.js";
import type { Express } from "express";

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerCustomNotificationRoutes(app: Express): void {

  // ==================== CUSTOM NOTIFICATIONS ROUTES ====================
  // Get all custom notifications
  app.get("/api/custom-notifications", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const notifications = await storage.getAllCustomNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching custom notifications:", error);
      res.status(500).json({ 
        message: "Failed to fetch custom notifications", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get unread custom notifications
  app.get("/api/custom-notifications/unread", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const notifications = await storage.getUnreadCustomNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching unread custom notifications:", error);
      res.status(500).json({ 
        message: "Failed to fetch unread custom notifications", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get custom notifications by type
  app.get("/api/custom-notifications/type/:type", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const type = req.params.type;
      const notifications = await storage.getCustomNotificationsByType(type);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching custom notifications by type:", error);
      res.status(500).json({ 
        message: "Failed to fetch custom notifications by type", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get custom notifications for current user
  app.get("/api/custom-notifications/user", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const notifications = await storage.getCustomNotificationsByUser(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching user custom notifications:", error);
      res.status(500).json({ 
        message: "Failed to fetch user custom notifications", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get single custom notification
  app.get("/api/custom-notifications/:id", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const notification = await storage.getCustomNotification(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json(notification);
    } catch (error) {
      console.error("Error fetching custom notification:", error);
      res.status(500).json({ 
        message: "Failed to fetch custom notification", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Create a new custom notification
  app.post("/api/custom-notifications", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      // Add user info to notification data
      const notificationData = {
        ...req.body,
        createdBy: req.user!.username
      };
      
      // Ensure isRead is set to false for new notifications
      notificationData.isRead = false;
      
      const notification = await storage.createCustomNotification(notificationData);
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.notifications.created(notification);
      
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating custom notification:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid notification data", error: error.errors });
      } else {
        res.status(400).json({ 
          message: "Failed to create custom notification", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }
  });

  // Update a custom notification
  app.patch("/api/custom-notifications/:id", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      // Get existing notification
      const notification = await storage.getCustomNotification(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      // Update with user info
      const notificationData = {
        ...req.body,
        updatedBy: req.user!.username
      };
      
      const updatedNotification = await storage.updateCustomNotification(id, notificationData);
      if (!updatedNotification) {
        return res.status(404).json({ message: "Failed to update notification" });
      }
      
      // Broadcast real-time update to all connected clients
      realtimeEvents.notifications.updated(updatedNotification);
      
      res.json(updatedNotification);
    } catch (error) {
      console.error("Error updating custom notification:", error);
      res.status(400).json({ 
        message: "Failed to update custom notification", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Mark notification as read
  app.post("/api/custom-notifications/:id/read", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const success = await storage.markCustomNotificationAsRead(id);
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      // Get the updated notification to return
      const updatedNotification = await storage.getCustomNotification(id);
      res.json(updatedNotification || { success: true, message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ 
        message: "Failed to mark notification as read", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Mark notification as unread
  app.post("/api/custom-notifications/:id/unread", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const success = await storage.markCustomNotificationAsUnread(id);
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      // Get the updated notification to return
      const updatedNotification = await storage.getCustomNotification(id);
      res.json(updatedNotification || { success: true, message: "Notification marked as unread" });
    } catch (error) {
      console.error("Error marking notification as unread:", error);
      res.status(500).json({ 
        message: "Failed to mark notification as unread", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Delete a custom notification
  app.delete("/api/custom-notifications/:id", hasPermission(UserPermission.MANAGE_NOTIFICATIONS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const deleted = await storage.deleteCustomNotification(id);
      if (!deleted) {
        return res.status(404).json({ message: "Notification not found" });
      }

      // Broadcast real-time update to all connected clients
      realtimeEvents.notifications.deleted({ id });

      res.status(200).json({ message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Error deleting custom notification:", error);
      res.status(500).json({ 
        message: "Failed to delete notification", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
}
