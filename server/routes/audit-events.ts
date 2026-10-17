import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { RouteDeps } from "./deps";
import { describeRead, recordRead } from "../middleware/audit";
import { AuditLogger } from "../utils/security/auditLogger";

/**
 * What the browser printed or exported without the server seeing it.
 *
 * The audit middleware logs every file the server serves. Two things it cannot
 * see: a print made from a preview the browser already loaded (no second
 * request), and a label, barcode book or report the client renders itself.
 * The client reports those here (client/src/lib/audit-events.ts).
 *
 * The caller decides nothing about the row but the *what*: the user, IP and
 * time come from the session, the action must be one of the few below or a
 * path the middleware itself tracks, and the details are capped. So a client
 * can at most say "I printed this", never "someone else did".
 */

/** The client-side actions that may be reported. Anything else is refused. */
const CLIENT_ACTIONS = new Set(["label.print", "barcode-book.print", "report.print", "report.export"]);
const MAX_DETAILS_CHARS = 4000;

const printedSchema = z.object({ printedUrl: z.string().min(1).max(500) }).strict();
const actionSchema = z.object({
  action: z.string().min(1).max(60),
  resourceType: z.string().min(1).max(60).optional(),
  resourceId: z.number().int().positive().optional(),
  details: z.record(z.unknown()).optional(),
}).strict();

export function registerAuditEventRoutes(app: Express, { requireAuth }: RouteDeps): void {
  app.post("/api/audit-events", requireAuth, async (req: Request, res: Response) => {
    try {
      const printed = printedSchema.safeParse(req.body);
      if (printed.success) {
        let path: string;
        try {
          path = new URL(printed.data.printedUrl, "http://local").pathname;
        } catch {
          return res.status(400).json({ message: "printedUrl is not a path" });
        }
        const read = describeRead(path, "print");
        if (!read) {
          return res.status(400).json({ message: "printedUrl is not a file the activity log tracks" });
        }
        await recordRead(req, read, { path, source: "client" });
        return res.status(204).end();
      }

      const parsed = actionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid audit event", errors: parsed.error.issues });
      }
      const { action, resourceType, resourceId, details } = parsed.data;
      if (!CLIENT_ACTIONS.has(action)) {
        return res.status(400).json({ message: "Unknown client action" });
      }
      if (details && JSON.stringify(details).length > MAX_DETAILS_CHARS) {
        return res.status(400).json({ message: "details too large" });
      }
      await AuditLogger.logFromRequest(
        req,
        action,
        resourceType ?? action.split(".")[0],
        resourceId,
        { ...(details ?? {}), source: "client" },
        "success",
      );
      return res.status(204).end();
    } catch (error) {
      console.error("Error recording client audit event:", error);
      return res.status(500).json({ message: "Failed to record audit event" });
    }
  });
}
