import type { Request, Response } from "express";
import { storage } from "../storage";
import { UserPermission } from "../../shared/schema";
import { hasPermission } from "../middleware/permissions.js";
import { clearEmailConfigCache } from "../utils/email-service";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerSettingsRoutes(app: Express, deps: RouteDeps): void {
  const { requireAuth } = deps;


  // App Settings Routes
  app.get("/api/settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const settings = await storage.getAllAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/category/:category", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { category } = req.params;
      const settings = await storage.getAppSettingsByCategory(category);
      res.json(settings);
    } catch (error) {
      console.error(`Error fetching settings for category ${req.params.category}:`, error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/key/:key", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getAppSettingByKey(key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting by key:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  // Get next available contract number (must come before :id route)
  app.get("/api/settings/next-contract-number", requireAuth, async (req: Request, res: Response) => {
    try {
      const nextNumber = await storage.getNextContractNumber();
      res.json({ contractNumber: nextNumber });
    } catch (error) {
      console.error("Error generating next contract number:", error);
      res.status(500).json({ message: "Error generating contract number" });
    }
  });

  // Check if contract number exists (must come before :id route)
  app.get("/api/settings/check-contract-number/:contractNumber", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contractNumber } = req.params;
      const exists = await storage.checkContractNumberExists(contractNumber);
      res.json({ exists });
    } catch (error) {
      console.error("Error checking contract number:", error);
      res.status(500).json({ message: "Error checking contract number" });
    }
  });

  // Get conflicting contract numbers for a proposed override
  app.get("/api/settings/contract-number-conflicts/:proposedNumber", requireAuth, async (req: Request, res: Response) => {
    try {
      const proposedNumber = parseInt(req.params.proposedNumber, 10);
      if (isNaN(proposedNumber) || proposedNumber < 1) {
        return res.status(400).json({ message: "Invalid proposed number" });
      }
      const conflicts = await storage.getConflictingContractNumbers(proposedNumber);
      res.json({ conflicts, hasConflicts: conflicts.length > 0, count: conflicts.length });
    } catch (error) {
      console.error("Error checking contract number conflicts:", error);
      res.status(500).json({ message: "Error checking conflicts" });
    }
  });

  // Set contract number override (smart override feature)
  app.post("/api/settings/contract-number-override", requireAuth, async (req: Request, res: Response) => {
    try {
      const { overrideNumber } = req.body;
      
      if (overrideNumber !== null && (typeof overrideNumber !== 'number' || overrideNumber < 1)) {
        return res.status(400).json({ message: "Invalid override number. Must be a positive integer or null to clear." });
      }
      
      const username = req.user?.username || 'Unknown';
      const updatedSettings = await storage.setContractNumberOverride(overrideNumber, username);
      
      if (!updatedSettings) {
        return res.status(500).json({ message: "Failed to set override" });
      }
      
      // Return the updated settings along with the new next contract number
      const nextNumber = await storage.getNextContractNumber();
      
      res.json({ 
        success: true, 
        settings: updatedSettings,
        nextContractNumber: nextNumber,
        message: overrideNumber ? `Next contract number set to ${overrideNumber}` : 'Override cleared'
      });
    } catch (error) {
      console.error("Error setting contract number override:", error);
      res.status(500).json({ message: "Error setting override" });
    }
  });

  // Clear contract number override
  app.delete("/api/settings/contract-number-override", requireAuth, async (req: Request, res: Response) => {
    try {
      const username = req.user?.username || 'Unknown';
      const updatedSettings = await storage.clearContractNumberOverride(username);
      const nextNumber = await storage.getNextContractNumber();
      
      res.json({ 
        success: true, 
        settings: updatedSettings,
        nextContractNumber: nextNumber,
        message: 'Override cleared - using automatic numbering'
      });
    } catch (error) {
      console.error("Error clearing contract number override:", error);
      res.status(500).json({ message: "Error clearing override" });
    }
  });

  app.get("/api/settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const setting = await storage.getAppSetting(id);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.post("/api/settings", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const username = req.user?.username || 'Unknown';
      const settingData = {
        ...req.body,
        createdBy: username,
        updatedBy: username
      };
      
      const newSetting = await storage.createAppSetting(settingData);
      
      // Clear email config cache if this is an email setting
      if (newSetting.category === 'email') {
        clearEmailConfigCache();
      }
      
      res.status(201).json(newSetting);
    } catch (error) {
      console.error("Error creating setting:", error);
      res.status(500).json({ error: "Failed to create setting" });
    }
  });

  app.patch("/api/settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const username = req.user?.username || 'Unknown';
      const updateData = {
        ...req.body,
        updatedBy: username
      };
      
      const updatedSetting = await storage.updateAppSetting(id, updateData);
      
      if (!updatedSetting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // Clear email config cache if this is an email setting
      if (updatedSetting.category === 'email') {
        clearEmailConfigCache();
      }
      
      res.json(updatedSetting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  app.delete("/api/settings/:id", hasPermission(UserPermission.MANAGE_BACKUPS), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get setting before deleting to check if it's an email setting
      const setting = await storage.getAppSetting(id);
      const isEmailSetting = setting?.category === 'email';
      
      const success = await storage.deleteAppSetting(id);
      
      if (!success) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // Clear email config cache if this was an email setting
      if (isEmailSetting) {
        clearEmailConfigCache();
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting setting:", error);
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });
}
