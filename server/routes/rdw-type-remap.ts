import type { Express, Request, Response } from "express";
import { UserPermission } from "../../shared/schema";
import { hasPermission, requireAdmin } from "../middleware/permissions";
import {
  RemapCheckRunningError,
  RemapPlanMissingError,
  applyRemapPlan,
  getRemapStatus,
  startRemapCheck,
} from "../services/rdw-type-remap";

/**
 * D17 (besluiten D, spec §13): the RDW vehicle-type re-map from Instellingen > Voertuigen.
 *
 *   POST /api/vehicles/rdw-type-remap/check  MANAGE_VEHICLES  start the background check
 *   GET  /api/vehicles/rdw-type-remap/plan   MANAGE_VEHICLES  progress + the stored plan
 *   POST /api/vehicles/rdw-type-remap/apply  MANAGE_VEHICLES + role admin  apply that plan
 *
 * Registered before the `/api/vehicles/:id` routes, so "rdw-type-remap" is never read as an id.
 * The apply route writes its own audit lines (one `vehicle.type-remap` per vehicle), so the
 * generic mutation audit skips it (server/middleware/audit.ts).
 */
export function registerRdwTypeRemapRoutes(app: Express): void {
  app.post("/api/vehicles/rdw-type-remap/check", hasPermission(UserPermission.MANAGE_VEHICLES), (_req: Request, res: Response) => {
    try {
      const job = startRemapCheck();
      res.status(202).json({ job });
    } catch (error) {
      if (error instanceof RemapCheckRunningError) {
        return res.status(409).json({ message: error.message, code: error.code });
      }
      console.error("Error starting the RDW type check:", error);
      res.status(500).json({ message: "Failed to start the RDW type check" });
    }
  });

  app.get("/api/vehicles/rdw-type-remap/plan", hasPermission(UserPermission.MANAGE_VEHICLES), async (_req: Request, res: Response) => {
    try {
      res.json(await getRemapStatus());
    } catch (error) {
      console.error("Error reading the RDW type plan:", error);
      res.status(500).json({ message: "Failed to read the RDW type plan" });
    }
  });

  app.post("/api/vehicles/rdw-type-remap/apply", hasPermission(UserPermission.MANAGE_VEHICLES), requireAdmin, async (req: Request, res: Response) => {
    try {
      res.json(await applyRemapPlan({ id: req.user?.id, username: req.user?.username }));
    } catch (error) {
      if (error instanceof RemapCheckRunningError || error instanceof RemapPlanMissingError) {
        return res.status(409).json({ message: error.message, code: error.code });
      }
      console.error("Error applying the RDW type plan:", error);
      res.status(500).json({ message: "Failed to apply the RDW type plan" });
    }
  });
}
