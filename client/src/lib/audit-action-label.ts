import type { TFunction } from "i18next";

/**
 * Wording for the audit log's action codes ("reservation.pickup").
 *
 * The codes are the server's stable vocabulary, not text for people (A-6-4, and
 * "customer.create" in A-4-5). The middleware writes `<resource>.<first path
 * segment after the id>` (server/middleware/audit.ts), or `<resource>.<create|
 * update|delete>` for a plain write, and the recycle bin writes
 * `<entityType>.purge`. So:
 *
 *  - a known sub-action has a sentence of its own ("Contract gemaakt");
 *  - an ordinary verb is composed ("Reservering aangemaakt");
 *  - a known resource with a sub-action nobody has worded yet reads
 *    "Reservering: <sub>" - recognisable and never the bare code;
 *  - a code of an unknown resource is returned unchanged, so a new server action
 *    shows up as itself instead of vanishing or being worded wrongly.
 *
 * Not listed on purpose: `reservation.cancel` and `reservation.purge` - no route
 * writes them as such (cancelling goes through `reservation.status`, a purge
 * through the generic `<entityType>.purge` verb below).
 *
 * All texts live in the `common` namespace under `recordHistory.actions`.
 */

/** Sub-actions that have a sentence of their own, per resource. */
const SUB_ACTIONS: Record<string, readonly string[]> = {
  reservation: [
    "pickup", "return", "status", "revert", "contract", "assign-spare", "basic", "usage-period",
    "spare-status", "complete-maintenance", "mark-needs-service", "return-from-service",
  ],
  vehicle: [
    "mileage", "fuel-status", "maintenance-status", "barcode", "toggle-registration", "fiscal-profile", "blacklist",
  ],
  document: ["email", "regenerate"],
  fine: ["letter", "link", "unlink", "reactivate", "status"],
  expense: ["with-receipt"],
  "apk-date-change": ["confirm", "dismiss"],
  // Background runs (server/utils/security/auditLogger.ts AuditLogger.system): one row per run.
  system: ["apk-scan", "service-due-scan", "fiscal-nightly", "cjib-import", "invoice-inbox-import", "backup"],
};

const RESOURCES = [
  "reservation", "vehicle", "customer", "document", "expense", "transport", "fine", "driver", "maintenance", "blacklist",
  // The recycle bin writes `<entityType>.purge` with the entity type as it is stored, underscore and all.
  "maintenance_block",
  // Routers that were mounted outside the audit middleware until 2026-10 and now show up in the log.
  "email-template", "email-log", "notification", "apk-date-change",
  "system",
] as const;

const VERBS = ["create", "update", "delete", "restore", "upload", "purge"] as const;

type Translate = TFunction | ((key: string, options?: Record<string, unknown>) => string);

export function auditActionLabel(t: Translate, action: string): string {
  const translate = t as (key: string, options?: Record<string, unknown>) => string;

  const dot = action.indexOf(".");
  if (dot <= 0) return action;
  const resource = action.slice(0, dot);
  const sub = action.slice(dot + 1);
  if (!(RESOURCES as readonly string[]).includes(resource)) return action;

  if (SUB_ACTIONS[resource]?.includes(sub)) {
    return translate(`recordHistory.actions.subActions.${resource}.${sub}`);
  }

  const resourceLabel = translate(`recordHistory.actions.resources.${resource}`);
  if ((VERBS as readonly string[]).includes(sub)) {
    return translate("recordHistory.actions.composed", {
      resource: resourceLabel,
      verb: translate(`recordHistory.actions.verbs.${sub}`),
    });
  }
  return translate("recordHistory.actions.unknownSub", { resource: resourceLabel, sub });
}
