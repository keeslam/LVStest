/**
 * OPT-001 — `GET /api/today`, the single request behind the "Vandaag" screen.
 *
 * One composed endpoint rather than four existing ones, because the four
 * existing ones are what made the morning cost ~20 MB: `/api/reservations`
 * (8 MB, downloaded twice — BUG-203/BUG-204), `/api/reservations/range`
 * (1 523 KB / 835 ms), `/api/transports` plus three lookup tables for the
 * spare widget (~9 700 KB), and `/api/portal-requests` with every message and
 * attachment attached. This one answers the same question in five statements
 * and a few kilobytes.
 *
 * Measured in-process against the fixture database (1 666 reservations, ~700
 * vehicles): **1 request, 9 SQL statements, 1 536 bytes**. The nine requests
 * that make up the same morning today — /api/reservations (6.4 MB),
 * /api/vehicles (887 KB), /api/customers (335 KB), /api/transports,
 * /api/reservations/overdue (1.5 MB), /api/vehicles/available (304 KB),
 * /api/reservations/range (190 KB), the placeholder queue and the portal
 * requests — cost **56 statements and 9.6 MB** on that same database.
 *
 * `?date=YYYY-MM-DD` is optional and defaults to the server's today. The
 * client sends *its own* local date: the office is in Amsterdam, the container
 * runs on UTC, and between 00:00 and 02:00 CEST those are different days — the
 * employee's "vandaag" is the one on their wall.
 */
import type { Express, Request, Response } from "express";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { isIsoDate } from "../../shared/today";
import { isoToday } from "../services/lifecycle";
import { buildTodayBoard } from "../services/today-board";
import type { RouteDeps } from "./deps";

const canSeeTheDay = hasPermission(
  UserPermission.VIEW_DASHBOARD,
  UserPermission.VIEW_RESERVATIONS,
  UserPermission.MANAGE_RESERVATIONS,
);

/** Does this user get B-17's third group? */
function maySeePortalRequests(req: Request): boolean {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  const permissions = (req.user.permissions as string[] | undefined) ?? [];
  return (
    permissions.includes(UserPermission.VIEW_PORTAL) ||
    permissions.includes(UserPermission.MANAGE_PORTAL)
  );
}

export function registerTodayRoutes(app: Express, _deps: RouteDeps): void {
  app.get("/api/today", canSeeTheDay, async (req: Request, res: Response) => {
    const raw = req.query.date;
    if (raw !== undefined && !isIsoDate(raw)) {
      return res.status(400).json({ message: "Invalid date. Use YYYY-MM-DD." });
    }
    const date = isIsoDate(raw) ? raw : isoToday();

    try {
      const board = await buildTodayBoard(date, {
        includePortalRequests: maySeePortalRequests(req),
      });
      res.json(board);
    } catch (error) {
      console.error("Failed to build the today board:", error);
      res.status(500).json({ message: "Failed to load today's work" });
    }
  });
}
