/**
 * Kees, 2026-10-19 (with punt 9) — which dashboard tiles are shown, and in what
 * order. One setting for everyone (`app_settings.dashboard_tiles`), changed by
 * whoever may change the app settings. Only the tiles, not the other blocks.
 *
 * Stored as `{ order: TileId[], hidden: TileId[] }`. Reading is forgiving: an
 * unknown id is dropped and a tile the stored order does not mention (a tile
 * added later) is appended, visible, so a new tile never silently disappears.
 */

export const DASHBOARD_TILES_KEY = "dashboard_tiles";
export const INVALID_DASHBOARD_TILES_CODE = "INVALID_DASHBOARD_TILES";

/** Today's order on the dashboard, plus the new licence tile at the end. */
export const DASHBOARD_TILE_IDS = ["availability", "apk", "overdue", "warranty", "licenses", "zones"] as const;
export type DashboardTileId = (typeof DASHBOARD_TILE_IDS)[number];

export interface DashboardTile {
  id: DashboardTileId;
  visible: boolean;
}

export interface DashboardTilesValue {
  order: DashboardTileId[];
  hidden: DashboardTileId[];
}

function isTileId(value: unknown): value is DashboardTileId {
  return typeof value === "string" && (DASHBOARD_TILE_IDS as readonly string[]).includes(value);
}

/** The tiles in the stored order, every known tile exactly once. */
export function dashboardTilesFromSetting(value: unknown): DashboardTile[] {
  const stored = value && typeof value === "object" ? (value as { order?: unknown; hidden?: unknown }) : {};
  const order = Array.isArray(stored.order) ? stored.order.filter(isTileId) : [];
  const hidden = new Set(Array.isArray(stored.hidden) ? stored.hidden.filter(isTileId) : []);
  const ids: DashboardTileId[] = [];
  for (const id of [...order, ...DASHBOARD_TILE_IDS]) if (!ids.includes(id)) ids.push(id);
  return ids.map((id) => ({ id, visible: !hidden.has(id) }));
}

/** What the settings card stores. */
export function dashboardTilesToSetting(tiles: DashboardTile[]): DashboardTilesValue {
  return {
    order: tiles.map((tile) => tile.id),
    hidden: tiles.filter((tile) => !tile.visible).map((tile) => tile.id),
  };
}

/** The server accepts only known ids, no duplicates, as two lists. */
export function isValidDashboardTilesValue(value: unknown): value is DashboardTilesValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { order, hidden } = value as { order?: unknown; hidden?: unknown };
  if (!Array.isArray(order) || !Array.isArray(hidden)) return false;
  if (!order.every(isTileId) || !hidden.every(isTileId)) return false;
  return new Set(order).size === order.length && new Set(hidden).size === hidden.length;
}
