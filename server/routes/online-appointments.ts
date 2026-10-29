import type { Express, Request, Response } from "express";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import {
  AppointmentActionError, cancelAppointment, confirmAppointment, countOpenAppointments, dismissAppointment,
  linkAppointment, listAppointmentLog, listOpenAppointments,
} from "../services/online-appointments";

// Same people as the maintenance planner: whoever may see it may read the list, whoever plans may act on it.
const canView = hasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE);
const canManage = hasPermission(UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE);
// The inbox log is read by whoever reads the invoice inbox log too.
const canReadLog = hasPermission(
  UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE,
  UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS,
);

/**
 * Appointments made in the garage's online planner, waiting in the maintenance calendar to be confirmed.
 * Every write is logged by the activity-log middleware as `online-appointment.<confirm|cancel|link|dismiss>`.
 */
export function registerOnlineAppointmentRoutes(app: Express): void {
  const actor = (req: Request) => req.user?.username ?? "system";
  const run = async (req: Request, res: Response, fn: (id: number) => Promise<unknown>) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
    try {
      return res.json(await fn(id));
    } catch (error) {
      if (error instanceof AppointmentActionError) return res.status(error.status).json({ message: error.message, code: error.code });
      console.error("online appointment action failed:", error);
      return res.status(500).json({ message: "Online afspraak kon niet worden bijgewerkt" });
    }
  };

  app.get("/api/online-appointments", canView, async (_req, res) => res.json(await listOpenAppointments()));
  app.get("/api/online-appointments/count", canView, async (_req, res) => res.json({ count: await countOpenAppointments() }));
  app.get("/api/online-appointments/log", canReadLog, async (req, res) => {
    const parsed = z.object({
      q: z.string().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Invalid query" });
    return res.json(await listAppointmentLog(parsed.data));
  });
  app.post("/api/online-appointments/:id/confirm", canManage, (req, res) => run(req, res, (id) => confirmAppointment(id, actor(req))));
  app.post("/api/online-appointments/:id/cancel", canManage, (req, res) => run(req, res, (id) => cancelAppointment(id, actor(req))));
  app.post("/api/online-appointments/:id/dismiss", canManage, (req, res) => run(req, res, (id) => dismissAppointment(id, actor(req))));
  app.post("/api/online-appointments/:id/link", canManage, (req, res) => {
    const parsed = z.object({ rentalId: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "rentalId is required" });
    return run(req, res, (id) => linkAppointment(id, parsed.data.rentalId, actor(req)));
  });
}
