import type { Request, Response } from "express";
import { format } from "date-fns";
import { storage } from "../storage";
import path from "path";
import fs from "fs";
import { UserPermission, damageCheckFieldsConfigSchema, DEFAULT_DAMAGE_CHECK_FIELDS, DAMAGE_CHECK_FIELDS_KEY } from "../../shared/schema";
import multer from "multer";
import { hasPermission, requireAdmin } from "../middleware/permissions.js";
import { clearEmailConfigCache, testSmtpConnection } from "../utils/email-service";
import { mergeHolidaysWithOverrides } from "../../shared/holidays";
import { createSecureMulterFilter, sanitizeFilename } from "../utils/security/fileUploadSecurity";
import type { Express } from "express";
import type { RouteDeps } from "./deps";

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerAppSettingsRoutes(app: Express, deps: RouteDeps): void {
  const { upload, uploadsDir, requireAuth } = deps;


  // ============================================
  // APP SETTINGS ROUTES
  // ============================================

  // Strip SMTP credentials out of a setting before it goes to a general-purpose
  // endpoint that any authenticated user (not just admins) can call. The admin-only
  // /api/app-settings/:category route below is the one place the real password is
  // still returned, since the Settings UI needs it to pre-fill the edit dialog.
  function redactAppSetting<T extends { value?: any } | undefined>(setting: T): T {
    if (!setting?.value || typeof setting.value !== 'object' || !('smtpPassword' in setting.value)) {
      return setting;
    }
    return { ...setting, value: { ...setting.value, smtpPassword: '' } };
  }

  // Get all app settings
  app.get("/api/app-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAllAppSettings();
      res.json(settings.map(redactAppSetting));
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ message: "Error fetching app settings" });
    }
  });

  // Damage check field schema (used by interactive damage check + template editor + PDF renderer)
  // Read: any authenticated user. Write: admin only.
  app.get("/api/damage-check-fields", requireAuth, async (_req: Request, res: Response) => {
    try {
      const setting = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      if (!setting) return res.json(DEFAULT_DAMAGE_CHECK_FIELDS);
      const parsed = damageCheckFieldsConfigSchema.safeParse(setting.value);
      res.json(parsed.success ? parsed.data : DEFAULT_DAMAGE_CHECK_FIELDS);
    } catch (error) {
      console.error("Error fetching damage check fields:", error);
      res.status(500).json({ message: "Error fetching damage check fields" });
    }
  });

  // Damage check header image: serve uploaded one if configured, else fall back
  // to the bundled default in attached_assets/.
  const damageCheckHeaderStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadsDir, 'damage-check');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(sanitizeFilename(file.originalname)) || '.png';
      cb(null, `header-${Date.now()}${ext}`);
    },
  });
  const damageCheckHeaderUpload = multer({
    storage: damageCheckHeaderStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter('image'),
  });

  app.get("/api/damage-check-fields/header", requireAuth, async (_req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      const setting = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      const cfg = setting?.value as any;
      const customPath = cfg?.headerImagePath as string | undefined;
      if (customPath) {
        const absolute = path.isAbsolute(customPath)
          ? customPath
          : path.join(process.cwd(), customPath);
        if (fs.existsSync(absolute)) {
          return res.sendFile(absolute);
        }
      }
      // The old fallback pointed at attached_assets/, which is gitignored and so
      // never exists in a deployed build. Report "no header configured" instead
      // of failing on a file that cannot be there; the UI shows a placeholder
      // and admins can upload one on this page.
      const fallback = path.join(process.cwd(), 'attached_assets', 'image_1779471993617.png');
      if (fs.existsSync(fallback)) {
        return res.sendFile(fallback);
      }
      return res.status(204).end();
    } catch (e) {
      res.status(500).json({ message: 'Error loading header image' });
    }
  });

  app.post("/api/damage-check-fields/header", requireAuth, requireAdmin, damageCheckHeaderUpload.single('header'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
      const relPath = path.relative(process.cwd(), req.file.path);
      const username = (req.user as any)?.username || 'system';
      const existing = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      const baseValue = (existing?.value as any) || DEFAULT_DAMAGE_CHECK_FIELDS;
      // Clean up previous uploaded file if any
      const prevPath = baseValue?.headerImagePath as string | undefined;
      if (prevPath) {
        try {
          const abs = path.isAbsolute(prevPath) ? prevPath : path.join(process.cwd(), prevPath);
          if (abs.includes(path.join('uploads', 'damage-check')) && fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch {}
      }
      const newValue = { ...baseValue, headerImagePath: relPath };
      if (existing) {
        await storage.updateAppSetting(existing.id, { value: newValue as any, updatedBy: username });
      } else {
        await storage.createAppSetting({ key: DAMAGE_CHECK_FIELDS_KEY, value: newValue as any, category: 'damage_check', updatedBy: username } as any);
      }
      res.json({ success: true, headerImagePath: relPath });
    } catch (e) {
      console.error('Header upload failed:', e);
      res.status(500).json({ message: 'Error uploading header' });
    }
  });

  app.delete("/api/damage-check-fields/header", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      if (!existing) return res.json({ success: true });
      const baseValue = (existing.value as any) || {};
      const prevPath = baseValue?.headerImagePath as string | undefined;
      if (prevPath) {
        try {
          const abs = path.isAbsolute(prevPath) ? prevPath : path.join(process.cwd(), prevPath);
          if (abs.includes(path.join('uploads', 'damage-check')) && fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch {}
      }
      const username = (req.user as any)?.username || 'system';
      const newValue = { ...baseValue, headerImagePath: null };
      await storage.updateAppSetting(existing.id, { value: newValue as any, updatedBy: username });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: 'Error resetting header' });
    }
  });

  app.put("/api/damage-check-fields", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = damageCheckFieldsConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid config", errors: parsed.error.flatten() });
      }
      // Enforce: keys unique within a group, all three group ids present
      const groupIds = parsed.data.groups.map(g => g.id).sort();
      const expected = ["delivery", "exterior", "interior"];
      if (groupIds.length !== 3 || groupIds.some((g, i) => g !== expected[i])) {
        return res.status(400).json({ message: "Must contain exactly the three groups: interior, exterior, delivery" });
      }
      for (const g of parsed.data.groups) {
        const seen = new Set<string>();
        for (const f of g.fields) {
          if (seen.has(f.key)) {
            return res.status(400).json({ message: `Duplicate field key "${f.key}" in group "${g.id}"` });
          }
          seen.add(f.key);
        }
      }
      const username = (req.user as any)?.username || "system";
      const existing = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
      // Preserve headerImagePath if the client didn't send one (it's managed
      // via the dedicated upload endpoint).
      const existingHeader = (existing?.value as any)?.headerImagePath;
      const mergedValue: any = {
        ...parsed.data,
        headerImagePath: parsed.data.headerImagePath ?? existingHeader ?? null,
      };
      if (existing) {
        const updated = await storage.updateAppSetting(existing.id, {
          value: mergedValue,
          updatedBy: username,
        });
        return res.json(updated?.value ?? mergedValue);
      }
      const created = await storage.createAppSetting({
        key: DAMAGE_CHECK_FIELDS_KEY,
        value: mergedValue,
        category: "damage_check",
        description: "Editable checklist fields for the interactive damage check + template editor",
        createdBy: username,
        updatedBy: username,
      });
      res.json(created.value);
    } catch (error) {
      console.error("Error saving damage check fields:", error);
      res.status(500).json({ message: "Error saving damage check fields" });
    }
  });

  // Get app setting by key (returns single setting or null)
  // For calendar_settings, auto-calculates Dutch holidays for multiple years and merges with overrides
  app.get("/api/app-settings/key/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const setting = redactAppSetting(await storage.getAppSettingByKey(key));

      // Special handling for calendar_settings: auto-calculate Dutch holidays for multiple years
      if (key === 'calendar_settings' && setting?.value) {
        const currentYear = new Date().getFullYear();
        const storedDutchHolidays = setting.value.dutchHolidays || {};
        
        // Convert stored format to override format
        const overrides: Record<string, { enabled: boolean; overrideDate?: string }> = {};
        for (const [holidayKey, value] of Object.entries(storedDutchHolidays)) {
          if (typeof value === 'object' && value !== null && 'enabled' in value) {
            const holidayValue = value as { enabled: boolean; date?: string; overrideDate?: string };
            overrides[holidayKey] = {
              enabled: holidayValue.enabled,
              overrideDate: holidayValue.overrideDate
            };
          } else if (typeof value === 'boolean') {
            // Legacy format: just boolean
            overrides[holidayKey] = { enabled: value };
          }
        }
        
        // Calculate holidays for current year and next 2 years (to support calendar navigation)
        const yearsToCalculate = [currentYear, currentYear + 1, currentYear + 2];
        const dutchHolidaysByYear: Record<number, Record<string, { enabled: boolean; date: string; isOverridden: boolean; calculatedDate: string }>> = {};
        
        // Also build a flat list of all holiday dates for easy lookup
        const allHolidayDates: Record<string, { enabled: boolean; date: string; holidayKey: string; year: number }> = {};
        
        for (const year of yearsToCalculate) {
          // Only apply date overrides to current year - future years get pure calculated dates
          // But enabled/disabled state applies to all years
          const yearOverrides: Record<string, { enabled: boolean; overrideDate?: string }> = {};
          for (const [holidayKey, override] of Object.entries(overrides)) {
            yearOverrides[holidayKey] = {
              enabled: override.enabled,
              // Only include overrideDate for current year
              overrideDate: year === currentYear ? override.overrideDate : undefined
            };
          }
          
          const mergedHolidays = mergeHolidaysWithOverrides(year, yearOverrides);
          dutchHolidaysByYear[year] = mergedHolidays;
          
          // Add each holiday to the flat lookup map (keyed by date)
          for (const [holidayKey, holidayData] of Object.entries(mergedHolidays)) {
            if (holidayData.enabled) {
              allHolidayDates[holidayData.date] = {
                enabled: holidayData.enabled,
                date: holidayData.date,
                holidayKey,
                year
              };
            }
          }
        }
        
        // Return enhanced setting with multi-year auto-calculated dates
        // dutchHolidays remains for backward compatibility (current year)
        // dutchHolidaysByYear contains all years
        // allHolidayDates is a flat lookup for calendar rendering
        res.json({
          ...setting,
          value: {
            ...setting.value,
            dutchHolidays: dutchHolidaysByYear[currentYear],
            dutchHolidaysByYear,
            allHolidayDates,
            calculatedYears: yearsToCalculate
          }
        });
        return;
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching app setting by key:", error);
      res.status(500).json({ message: "Error fetching app setting" });
    }
  });

  // Get app settings by category
  app.get("/api/app-settings/:category", hasPermission(UserPermission.MANAGE_SETTINGS), async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const settings = await storage.getAppSettingsByCategory(category);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings by category:", error);
      res.status(500).json({ message: "Error fetching app settings" });
    }
  });

  // Test SMTP credentials/connectivity without sending an actual email.
  // Accepts the fields straight from the (possibly unsaved) Settings form so an
  // admin can verify a change before persisting it.
  app.post("/api/app-settings/email/test", hasPermission(UserPermission.MANAGE_SETTINGS), async (req: Request, res: Response) => {
    try {
      const { smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure } = req.body;

      if (!smtpHost || !smtpUser || !smtpPassword) {
        return res.status(400).json({ success: false, userMessage: 'SMTP host, username and password are required to test the connection.' });
      }

      const result = await testSmtpConnection({
        smtpHost,
        smtpPort: smtpPort ? parseInt(smtpPort) : 587,
        smtpUser,
        smtpPassword,
        smtpSecure: !!smtpSecure,
      });

      res.json(result);
    } catch (error) {
      console.error("Error testing SMTP connection:", error);
      res.status(500).json({ success: false, userMessage: "Unexpected error while testing the connection." });
    }
  });

  // Create or update app setting (upsert by key)
  app.post("/api/app-settings", hasPermission(UserPermission.MANAGE_SETTINGS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { key, value, category, description } = req.body;

      // Check if setting with this key already exists
      const existing = await storage.getAppSettingByKey(key);

      if (existing) {
        // Update existing setting
        const updated = await storage.updateAppSetting(existing.id, {
          value,
          category,
          description,
          updatedBy: user ? user.username : null,
        });
        if (updated?.category === 'email') {
          clearEmailConfigCache();
        }
        res.json(updated);
      } else {
        // Create new setting
        const created = await storage.createAppSetting({
          key,
          value,
          category,
          description,
          createdBy: user ? user.username : null,
          updatedBy: user ? user.username : null,
        });
        if (created.category === 'email') {
          clearEmailConfigCache();
        }
        res.json(created);
      }
    } catch (error) {
      console.error("Error creating/updating app setting:", error);
      res.status(500).json({ message: "Error saving app setting" });
    }
  });

  // Update app setting by ID
  app.put("/api/app-settings/:id", hasPermission(UserPermission.MANAGE_SETTINGS), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const id = parseInt(req.params.id);
      const { key, value, category, description } = req.body;

      const updated = await storage.updateAppSetting(id, {
        key,
        value,
        category,
        description,
        updatedBy: user ? user.username : null,
      });

      if (!updated) {
        return res.status(404).json({ message: "App setting not found" });
      }

      if (updated.category === 'email') {
        clearEmailConfigCache();
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating app setting:", error);
      res.status(500).json({ message: "Error updating app setting" });
    }
  });

  // Delete app setting
  app.delete("/api/app-settings/:id", hasPermission(UserPermission.MANAGE_SETTINGS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getAppSetting(id);
      const success = await storage.deleteAppSetting(id);

      if (!success) {
        return res.status(404).json({ message: "App setting not found" });
      }

      if (existing?.category === 'email') {
        clearEmailConfigCache();
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting app setting:", error);
      res.status(500).json({ message: "Error deleting app setting" });
    }
  });

  // ============================================
  // SYSTEM SETTINGS ROUTES (Contract Numbers, etc.)
  // ============================================

  // Get system settings
  app.get("/api/system-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      if (!settings) {
        // Return default settings if none exist
        return res.json({
          contractNumberStart: 1,
          maintenanceExcludedStatuses: ["not_for_rental"],
          showApkReminders: true,
          showWarrantyReminders: true,
          showMaintenanceBlocks: true,
          apkReminderDays: 30,
          warrantyReminderDays: 30,
          tollRatePerKm: "0.15",
          depotAddress: null,
          depotCity: null,
          depotPostalCode: null
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Error fetching settings" });
    }
  });

  // Update system settings
  app.put("/api/system-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const {
        contractNumberStart,
        maintenanceExcludedStatuses,
        showApkReminders,
        showWarrantyReminders,
        showMaintenanceBlocks,
        apkReminderDays,
        warrantyReminderDays,
        tollRatePerKm,
        depotAddress,
        depotCity,
        depotPostalCode
      } = req.body;

      const updated = await storage.updateSettings({
        contractNumberStart,
        maintenanceExcludedStatuses,
        showApkReminders,
        showWarrantyReminders,
        showMaintenanceBlocks,
        apkReminderDays,
        warrantyReminderDays,
        tollRatePerKm,
        depotAddress,
        depotCity,
        depotPostalCode,
        updatedBy: user ? user.username : null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Error updating settings" });
    }
  });
}
