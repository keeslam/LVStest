/**
 * Kees, 2026-10-20 — which "Snelle acties" the dashboard shows, and how. One
 * setting for everyone (`app_settings.dashboard_quick_actions`), changed by
 * whoever may change the app settings, next to the dashboard tiles.
 *
 * Every action is either a large tile (at most six, fewer is fine) or a compact
 * button below the tiles, each list in its own order; an unticked action is not
 * shown. A tile someone has no right to is simply left out for that person.
 *
 * Stored as `{ tiles: ActionId[], buttons: ActionId[], hidden: ActionId[] }`.
 * Reading is forgiving: unknown ids are dropped, tiles past the sixth become
 * buttons, and an action the setting does not mention (added later) is appended
 * to the buttons, visible, so it never silently disappears.
 */

export const QUICK_ACTIONS_KEY = "dashboard_quick_actions";
export const INVALID_QUICK_ACTIONS_CODE = "INVALID_QUICK_ACTIONS";

/** At most this many actions are large tiles. */
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

export type QuickActionPlace = "tile" | "button";

export interface QuickActionChoice {
  id: QuickActionId;
  place: QuickActionPlace;
  visible: boolean;
}

export interface QuickActionsValue {
  tiles: QuickActionId[];
  buttons: QuickActionId[];
  hidden: QuickActionId[];
}

function isActionId(value: unknown): value is QuickActionId {
  return typeof value === "string" && (QUICK_ACTION_IDS as readonly string[]).includes(value);
}

function idList(value: unknown): QuickActionId[] {
  return Array.isArray(value) ? value.filter(isActionId) : [];
}

/** Every known action exactly once: the tiles in order, then the buttons in order. */
export function quickActionsFromSetting(value: unknown): QuickActionChoice[] {
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!stored || !Array.isArray(stored.tiles)) {
    return QUICK_ACTION_IDS.map((id, i) => ({ id, place: i < MAX_QUICK_ACTION_TILES ? "tile" : "button", visible: true }));
  }
  const hidden = new Set(idList(stored.hidden));
  const seen = new Set<QuickActionId>();
  const tiles: QuickActionId[] = [];
  const buttons: QuickActionId[] = [];
  for (const id of idList(stored.tiles)) {
    if (seen.has(id)) continue;
    seen.add(id);
    (tiles.length < MAX_QUICK_ACTION_TILES ? tiles : buttons).push(id);
  }
  for (const id of [...idList(stored.buttons), ...QUICK_ACTION_IDS]) {
    if (seen.has(id)) continue;
    seen.add(id);
    buttons.push(id);
  }
  return [
    ...tiles.map((id) => ({ id, place: "tile" as const, visible: !hidden.has(id) })),
    ...buttons.map((id) => ({ id, place: "button" as const, visible: !hidden.has(id) })),
  ];
}

/** What the settings card stores. */
export function quickActionsToSetting(actions: QuickActionChoice[]): QuickActionsValue {
  return {
    tiles: actions.filter((action) => action.place === "tile").map((action) => action.id),
    buttons: actions.filter((action) => action.place === "button").map((action) => action.id),
    hidden: actions.filter((action) => !action.visible).map((action) => action.id),
  };
}

/** What the dashboard shows: the ticked tiles and the ticked buttons, each in order. */
export function quickActionsLayout(value: unknown): { tiles: QuickActionId[]; buttons: QuickActionId[] } {
  const shown = quickActionsFromSetting(value).filter((action) => action.visible);
  return {
    tiles: shown.filter((action) => action.place === "tile").map((action) => action.id),
    buttons: shown.filter((action) => action.place === "button").map((action) => action.id),
  };
}

/** The server accepts three lists of known ids, at most six tiles, no action twice. */
export function isValidQuickActionsValue(value: unknown): value is QuickActionsValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { tiles, buttons, hidden } = value as { tiles?: unknown; buttons?: unknown; hidden?: unknown };
  if (!Array.isArray(tiles) || !Array.isArray(buttons) || !Array.isArray(hidden)) return false;
  if (!tiles.every(isActionId) || !buttons.every(isActionId) || !hidden.every(isActionId)) return false;
  if (tiles.length > MAX_QUICK_ACTION_TILES) return false;
  const placed = [...tiles, ...buttons];
  return new Set(placed).size === placed.length && new Set(hidden).size === hidden.length;
}
