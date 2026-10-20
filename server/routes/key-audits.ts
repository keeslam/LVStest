/**
 * Punt 15 / OPT-032 (Kees, 2026-10-20) — finished key-cabinet audits.
 * Saved on "Afronden", kept for good, readable by anyone who may view vehicles
 * (the mount in middleware/staff-routers.ts sets that right).
 *
 *   POST /api/key-audits      save a finished audit (vehicle ids -> snapshots)
 *   GET  /api/key-audits      the list, newest first (no vehicle lists)
 *   GET  /api/key-audits/:id  one audit with its lists, for the print
 */
import { Router, type Request, type Response } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { installIdParamValidation } from "../middleware/parseIntParam";
import { db } from "../db";
import { keyAudits, vehicles, type KeyAuditVehicle } from "../../shared/schema";
import { parseKeyAuditInput } from "../../shared/key-audit";

const router = Router();
installIdParamValidation(router);

router.post("/", async (req: Request, res: Response) => {
  const input = parseKeyAuditInput(req.body);
  if (!input.ok) {
    return res.status(400).json({ message: "Invalid key-cabinet audit", errors: [{ field: input.field, message: "Check this field" }] });
  }
  try {
    const { mode, expectedCount, missingIds, unexpectedIds, scannedIds, note } = input.value;
    const allIds = Array.from(new Set([...missingIds, ...unexpectedIds, ...scannedIds]));
    const rows = allIds.length === 0 ? [] : await db
      .select({ id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model })
      .from(vehicles)
      .where(inArray(vehicles.id, allIds));
    const byId = new Map(rows.map((v) => [v.id, v]));
    // An id that no longer exists is still written down by its id, never silently dropped.
    const snapshot = (list: number[]): KeyAuditVehicle[] => list.map((id) => {
      const v = byId.get(id);
      return { vehicleId: id, licensePlate: v?.licensePlate ?? `#${id}`, brand: v?.brand ?? null, model: v?.model ?? null };
    });
    const user = req.user as { id?: number; fullName?: string | null; username?: string } | undefined;
    const [saved] = await db.insert(keyAudits).values({
      mode,
      performedBy: user?.id ?? null,
      performedByName: user?.fullName || user?.username || null,
      expectedCount,
      scannedCount: scannedIds.length,
      missing: snapshot(missingIds),
      unexpected: snapshot(unexpectedIds),
      scanned: snapshot(scannedIds),
      note,
    }).returning();
    res.status(201).json(saved);
  } catch (error) {
    console.error("Error saving the key-cabinet audit:", error);
    res.status(500).json({ message: "The key-cabinet audit could not be saved" });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: keyAudits.id,
        mode: keyAudits.mode,
        finishedAt: keyAudits.finishedAt,
        performedByName: keyAudits.performedByName,
        expectedCount: keyAudits.expectedCount,
        scannedCount: keyAudits.scannedCount,
        missing: keyAudits.missing,
        unexpected: keyAudits.unexpected,
        note: keyAudits.note,
      })
      .from(keyAudits)
      .orderBy(desc(keyAudits.finishedAt))
      .limit(500);
    res.json(rows.map(({ missing, unexpected, ...r }) => ({
      ...r,
      missingCount: Array.isArray(missing) ? missing.length : 0,
      unexpectedCount: Array.isArray(unexpected) ? unexpected.length : 0,
    })));
  } catch (error) {
    console.error("Error listing key-cabinet audits:", error);
    res.status(500).json({ message: "Failed to load the key-cabinet audits" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const [audit] = await db.select().from(keyAudits).where(eq(keyAudits.id, Number(req.params.id)));
    if (!audit) return res.status(404).json({ message: "Key-cabinet audit not found" });
    res.json(audit);
  } catch (error) {
    console.error("Error loading the key-cabinet audit:", error);
    res.status(500).json({ message: "Failed to load the key-cabinet audit" });
  }
});

export default router;
