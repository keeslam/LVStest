/**
 * B-21 — `GET /api/reservations/worklist/still-out`, the one request behind the
 * screen "Nog buiten".
 *
 * The decision refuses to let a script close the 363 `picked_up` rows: they
 * claim the car is still with the customer. "Die komen op een werklijst die
 * iemand echt naloopt." This endpoint is that worklist — vehicle, customer,
 * period and how long it has been open, in one flat answer.
 *
 * Registered before `/api/reservations/:id` so the literal path wins.
 */
import type { Express, Request, Response } from "express";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { isIsoDate } from "../../shared/today";
import { isoToday } from "../services/lifecycle";
import { buildPickupWorklist } from "../services/pickup-worklist";

const canWalkTheList = hasPermission(
  UserPermission.VIEW_RESERVATIONS,
  UserPermission.MANAGE_RESERVATIONS,
);

export function registerReservationWorklistRoutes(app: Express): void {
  app.get("/api/reservations/worklist/still-out", canWalkTheList, async (req: Request, res: Response) => {
    const raw = req.query.date;
    if (raw !== undefined && !isIsoDate(raw)) {
      return res.status(400).json({ message: "Invalid date. Use YYYY-MM-DD." });
    }
    const date = isIsoDate(raw) ? raw : isoToday();

    try {
      res.json(await buildPickupWorklist(date));
    } catch (error) {
      console.error("Failed to build the still-out worklist:", error);
      res.status(500).json({ message: "Failed to load the worklist" });
    }
  });
}
