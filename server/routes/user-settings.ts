/**
 * Kees, 2026-10-21 — each user's own dashboard layout (which tiles and quick actions,
 * in what order). Anyone signed in reads and writes only their own row; there is no
 * way to set a colleague's. Without an own row the standard applies: the app setting
 * of the same key as saved before this change, else the app's own order.
 */
import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { userSettings } from "../../shared/schema";
import { DASHBOARD_TILES_KEY, isValidDashboardTilesValue } from "../../shared/dashboard-tiles";
import { QUICK_ACTIONS_KEY, isValidQuickActionsValue } from "../../shared/quick-actions-layout";
import { STAFF_SIGNATURE_KEY, isValidStaffSignature } from "../../shared/staff-signature";
import type { RouteDeps } from "./deps";

/** The keys a user may keep for themselves, each with its own check. */
const USER_SETTING_RULES: Record<string, (value: unknown) => boolean> = {
  [DASHBOARD_TILES_KEY]: isValidDashboardTilesValue,
  [QUICK_ACTIONS_KEY]: isValidQuickActionsValue,
  // Kees 2026-10-21: your own signature for the contracts you make (no standard).
  [STAFF_SIGNATURE_KEY]: isValidStaffSignature,
};

export function registerUserSettingRoutes(app: Express, deps: RouteDeps): void {
  const { requireAuth } = deps;

  const ruleFor = (req: Request, res: Response) => {
    const rule = USER_SETTING_RULES[req.params.key];
    if (!rule) res.status(404).json({ message: "Unknown user setting" });
    return rule;
  };

  app.get("/api/user-settings/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!ruleFor(req, res)) return;
      const userId = req.user!.id;
      const [own] = await db.select().from(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, req.params.key)));
      if (own) return res.json({ value: own.value, source: "user" });
      const standard = req.params.key === STAFF_SIGNATURE_KEY ? null : await storage.getAppSettingByKey(req.params.key);
      res.json({ value: standard?.value ?? null, source: "standard" });
    } catch (error) {
      console.error("Error reading user setting:", error);
      res.status(500).json({ message: "Error reading your setting" });
    }
  });

  app.put("/api/user-settings/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      const rule = ruleFor(req, res);
      if (!rule) return;
      const value = req.body?.value;
      if (!rule(value)) return res.status(400).json({ message: "That is not a valid value for this setting", code: "INVALID_USER_SETTING" });
      const userId = req.user!.id;
      const key = req.params.key;
      const row = await db.transaction(async (tx) => {
        await tx.delete(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)));
        const [inserted] = await tx.insert(userSettings).values({ userId, key, value, updatedAt: new Date() }).returning();
        return inserted;
      });
      res.json({ value: row.value, source: "user" });
    } catch (error) {
      console.error("Error saving user setting:", error);
      res.status(500).json({ message: "Error saving your setting" });
    }
  });

  // "Terug naar standaard": the own row goes, the standard applies again.
  app.delete("/api/user-settings/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!ruleFor(req, res)) return;
      await db.delete(userSettings).where(and(eq(userSettings.userId, req.user!.id), eq(userSettings.key, req.params.key)));
      res.status(204).end();
    } catch (error) {
      console.error("Error removing user setting:", error);
      res.status(500).json({ message: "Error going back to the standard" });
    }
  });
}
