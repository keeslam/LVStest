/**
 * Round 2 punt 12 (Kees, 2026-10-21) — dismissed notifications, shared by the team
 * (shared/notification-dismissal.ts). Anyone who sees the notification centre may
 * dismiss and restore; the audit middleware logs who did it.
 *
 * The schema sync does not create indexes, so a save replaces the key's row inside a
 * transaction instead of relying on a unique index.
 */
import type { Express, Request, Response } from "express";
import { eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { notificationDismissals } from "../../shared/schema";
import type { RouteDeps } from "./deps";
import { dismissalUntil, isDismissalKey, isDismissalMode } from "../../shared/notification-dismissal";

export function registerNotificationDismissalRoutes(app: Express, deps: RouteDeps): void {
  const { requireAuth } = deps;
  // The dismissals that can still hold: time-limited ones not yet ended, and every
  // "until the date changes" one (the client compares the date).
  app.get("/api/notification-dismissals", requireAuth, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({ key: notificationDismissals.key, mode: notificationDismissals.mode, until: notificationDismissals.until, fingerprint: notificationDismissals.fingerprint })
        .from(notificationDismissals)
        .where(or(isNull(notificationDismissals.until), gt(notificationDismissals.until, new Date())));
      res.json(rows);
    } catch (error) {
      console.error("Error loading notification dismissals:", error);
      res.status(500).json({ message: "Error loading dismissed notifications" });
    }
  });

  app.post("/api/notification-dismissals", requireAuth, async (req: Request, res: Response) => {
    try {
      const { key, mode, fingerprint } = req.body ?? {};
      if (!isDismissalKey(key)) return res.status(400).json({ message: "Unknown notification key" });
      if (!isDismissalMode(mode)) return res.status(400).json({ message: "mode must be week, month or until_change" });
      if (fingerprint != null && (typeof fingerprint !== "string" || fingerprint.length > 40)) {
        return res.status(400).json({ message: "Invalid fingerprint" });
      }
      const row = await db.transaction(async (tx) => {
        await tx.delete(notificationDismissals).where(eq(notificationDismissals.key, key));
        const [inserted] = await tx.insert(notificationDismissals).values({
          key,
          mode,
          until: dismissalUntil(mode, new Date()),
          fingerprint: mode === "until_change" ? (fingerprint ?? "") : null,
          dismissedBy: req.user?.username ?? null,
          dismissedByUser: req.user?.id ?? null,
        }).returning();
        return inserted;
      });
      res.status(201).json(row);
    } catch (error) {
      console.error("Error saving notification dismissal:", error);
      res.status(500).json({ message: "Error dismissing the notification" });
    }
  });

  // Back on the list: after an APK or warranty service, or by hand.
  app.delete("/api/notification-dismissals/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      if (!isDismissalKey(key)) return res.status(400).json({ message: "Unknown notification key" });
      await db.delete(notificationDismissals).where(eq(notificationDismissals.key, key));
      res.status(204).end();
    } catch (error) {
      console.error("Error removing notification dismissal:", error);
      res.status(500).json({ message: "Error restoring the notification" });
    }
  });
}
