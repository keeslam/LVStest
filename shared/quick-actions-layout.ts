/**
 * Kees, 2026-10-20 — which "Snelle acties" the dashboard shows, and in what
 * order. One setting for everyone (`app_settings.dashboard_quick_actions`),
 * changed by whoever may change the app settings, next to the dashboard tiles.
 *
 * The first six ticked actions are the large tiles; the other ticked actions
 * are the compact buttons below them; an unticked action is not shown. A tile
 * someone has no right to is simply left out for that person (no shifting up).
 *
 * Stored as `{ order: ActionId[], hidden: ActionId[] }`, read as forgivingly as
 * the dashboard tiles: unknown ids dropped, actions added later appended visible.
 */

export const QUICK_ACTIONS_KEY = "dashboard_quick_actions";
export const INVALID_QUICK_ACTIONS_CODE = "INVALID_QUICK_ACTIONS";

/** At most this many ticked actions become large tiles; the rest are buttons. */
export const MAX_QUICK_ACTION_TILES = 6;

/** Today's order on the dashboard: the first six are today's tiles. */
export const QUICK_ACTION_IDS = [
  "start-pickup",
  "start-return",
  "scan",
  "availability",
  "new-reservation",
  "interactive-damage-check",
  "add-vehicle",
  "add-customer",
  "rdw-apk-scan",
  "document-upload",
  "log-expense",
  "fuel-status",
  "registration",
  "apk-report",
  "apk-notifications",
] as const;
export type QuickActionId = (typeof QUICK_ACTION_IDS)[number];

export interface QuickActionChoice {
  id: QuickActionId;
  visible: boolean;
}

export interface QuickActionsValue {
  order: QuickActionId[];
  hidden: QuickActionId[];
}

function isActionId(value: unknown): value is QuickActionId {
  return typeof value === "string" && (QUICK_ACTION_IDS as readonly string[]).includes(value);
}

/** The actions in the stored order, every known action exactly once. */
export function quickActionsFromSetting(value: unknown): QuickActionChoice[] {
  const stored = value && typeof value === "object" ? (value as { order?: unknown; hidden?: unknown }) : {};
  const order = Array.isArray(stored.order) ? stored.order.filter(isActionId) : [];
  const hidden = new Set(Array.isArray(stored.hidden) ? stored.hidden.filter(isActionId) : []);
  const ids: QuickActionId[] = [];
  for (const id of [...order, ...QUICK_ACTION_IDS]) if (!ids.includes(id)) ids.push(id);
  return ids.map((id) => ({ id, visible: !hidden.has(id) }));
}

/** What the settings card stores. */
export function quickActionsToSetting(actions: QuickActionChoice[]): QuickActionsValue {
  return {
    order: actions.map((action) => action.id),
    hidden: actions.filter((action) => !action.visible).map((action) => action.id),
  };
}

/** The dashboard's split: the first six shown actions as tiles, the rest as buttons. */
export function quickActionsLayout(value: unknown): { tiles: QuickActionId[]; buttons: QuickActionId[] } {
  const shown = quickActionsFromSetting(value).filter((action) => action.visible).map((action) => action.id);
  return { tiles: shown.slice(0, MAX_QUICK_ACTION_TILES), buttons: shown.slice(MAX_QUICK_ACTION_TILES) };
}

/** The server accepts only known ids, no duplicates, as two lists. */
export function isValidQuickActionsValue(value: unknown): value is QuickActionsValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { order, hidden } = value as { order?: unknown; hidden?: unknown };
  if (!Array.isArray(order) || !Array.isArray(hidden)) return false;
  if (!order.every(isActionId) || !hidden.every(isActionId)) return false;
  return new Set(order).size === order.length && new Set(hidden).size === hidden.length;
}
