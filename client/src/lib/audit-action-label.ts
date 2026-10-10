import type { TFunction } from "i18next";

/**
 * Wording for the audit log's action codes ("reservation.pickup").
 *
 * The codes are the server's stable vocabulary, not text for people (A-6-4, and
 * "customer.create" in A-4-5). Known sub-actions have a sentence of their own;
 * the ordinary `<resource>.<verb>` pairs are composed ("Reservering aangemaakt");
 * a code that is neither is returned unchanged, so a new server action shows up
 * as itself instead of vanishing or being worded wrongly.
 *
 * All texts live in the `common` namespace under `recordHistory.actions`.
 */

/** Codes that mean more than their verb. */
const SPECIAL_ACTIONS: Record<string, string> = {
  "reservation.pickup": "reservationPickup",
  "reservation.return": "reservationReturn",
  "reservation.status": "reservationStatus",
  "reservation.cancel": "reservationCancel",
  "reservation.revert": "reservationRevert",
  "reservation.purge": "reservationPurge",
};

const RESOURCES = [
  "reservation", "vehicle", "customer", "document", "expense", "transport", "fine", "driver", "maintenance",
] as const;

const VERBS = ["create", "update", "delete", "restore", "upload"] as const;

type Translate = TFunction | ((key: string, options?: Record<string, unknown>) => string);

export function auditActionLabel(t: Translate, action: string): string {
  const translate = t as (key: string, options?: Record<string, unknown>) => string;

  const special = SPECIAL_ACTIONS[action];
  if (special) return translate(`recordHistory.actions.${special}`);

  const dot = action.indexOf(".");
  if (dot > 0) {
    const resource = action.slice(0, dot);
    const verb = action.slice(dot + 1);
    if ((RESOURCES as readonly string[]).includes(resource) && (VERBS as readonly string[]).includes(verb)) {
      return translate("recordHistory.actions.composed", {
        resource: translate(`recordHistory.actions.resources.${resource}`),
        verb: translate(`recordHistory.actions.verbs.${verb}`),
      });
    }
  }
  return action;
}
