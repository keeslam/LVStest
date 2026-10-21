/**
 * Round 2 punt 11 part B (Kees, 2026-10-21) — "factuur ontbreekt": the list (tile,
 * notification centre, calendar label), the printable PDF, "Nu versturen" for the
 * weekly mail, and "Geen factuur nodig" on a visit.
 */
import type { Express, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { reservations, UserPermission } from "../../shared/schema";
import { hasPermission } from "../middleware/permissions.js";
import { MAX_INT4 } from "../middleware/parseIntParam";
import { storage } from "../storage";
import { MISSING_INVOICE_MAIL_KEY, missingInvoiceMailFromSetting } from "../../shared/missing-invoice";
import { loadMissingInvoices, missingInvoicePdf, sendMissingInvoiceMail } from "../services/missing-invoices";
import { officeDate } from "../services/lifecycle";

const READ = [UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_MAINTENANCE];

export function registerMissingInvoiceRoutes(app: Express): void {
  app.get("/api/maintenance-blocks/missing-invoices", hasPermission(...READ), async (_req: Request, res: Response) => {
    try {
      res.json(await loadMissingInvoices());
    } catch (error) {
      console.error("Error loading missing invoices:", error);
      res.status(500).json({ message: "Error loading workshop visits without an invoice" });
    }
  });

  // "Lijst afdrukken": the same PDF the weekly mail attaches, with the mail's columns.
  app.get("/api/maintenance-blocks/missing-invoices.pdf", hasPermission(...READ), async (_req: Request, res: Response) => {
    try {
      const settings = missingInvoiceMailFromSetting((await storage.getAppSettingByKey(MISSING_INVOICE_MAIL_KEY))?.value);
      const { rows } = await loadMissingInvoices();
      const pdf = await missingInvoicePdf(rows, settings.columns, settings.subject);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="facturen-ontbreken-${officeDate(new Date())}.pdf"`);
      res.send(pdf);
    } catch (error) {
      console.error("Error building missing-invoice PDF:", error);
      res.status(500).json({ message: "Error building the list" });
    }
  });

  // "Nu versturen" in the settings: the weekly mail right away (still nothing when the list is empty).
  app.post("/api/maintenance-blocks/missing-invoices/send-now", hasPermission(UserPermission.MANAGE_SETTINGS), async (_req: Request, res: Response) => {
    try {
      res.json(await sendMissingInvoiceMail("manual"));
    } catch (error) {
      console.error("Error sending missing-invoice mail:", error);
      res.status(500).json({ message: "Error sending the mail" });
    }
  });

  // "Geen factuur nodig" (a free warranty visit, ...) and back.
  app.put("/api/maintenance-blocks/:id/no-invoice", hasPermission(UserPermission.MANAGE_MAINTENANCE, UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_EXPENSES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0 || id > MAX_INT4) return res.status(400).json({ message: "Invalid visit ID" });
      if (typeof req.body?.noInvoiceExpected !== "boolean") return res.status(400).json({ message: "noInvoiceExpected must be true or false" });
      const [visit] = await db.select().from(reservations).where(and(eq(reservations.id, id), isNull(reservations.deletedAt)));
      if (!visit || visit.type !== "maintenance_block") return res.status(404).json({ message: "Workshop visit not found" });
      const [updated] = await db.update(reservations)
        .set({ noInvoiceExpected: req.body.noInvoiceExpected, updatedAt: new Date(), updatedBy: req.user?.username ?? null })
        .where(eq(reservations.id, id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating no-invoice flag:", error);
      res.status(500).json({ message: "Error updating the workshop visit" });
    }
  });
}
