import { describe, it, expect } from "vitest";
import {
  DASHBOARD_TILE_IDS,
  dashboardTilesFromSetting,
  dashboardTilesToSetting,
  isValidDashboardTilesValue,
} from "./dashboard-tiles";

describe("dashboardTilesFromSetting", () => {
  it("shows every tile in the default order without a setting", () => {
    expect(dashboardTilesFromSetting(null)).toEqual(DASHBOARD_TILE_IDS.map((id) => ({ id, visible: true })));
  });

  it("follows the stored order and hides what is hidden", () => {
    const tiles = dashboardTilesFromSetting({ order: ["licenses", "apk", "availability", "overdue", "warranty", "zones", "missingInvoices"], hidden: ["warranty"] });
    expect(tiles.map((t) => t.id)).toEqual(["licenses", "apk", "availability", "overdue", "warranty", "zones", "missingInvoices"]);
    expect(tiles.find((t) => t.id === "warranty")?.visible).toBe(false);
  });

  it("drops unknown ids and appends tiles the stored order does not know yet", () => {
    const tiles = dashboardTilesFromSetting({ order: ["overdue", "bogus", "apk"], hidden: ["bogus"] });
    expect(tiles.map((t) => t.id)).toEqual(["overdue", "apk", "availability", "warranty", "licenses", "zones", "missingInvoices"]);
    expect(tiles.every((t) => t.visible)).toBe(true);
  });
});

describe("round trip and validation", () => {
  it("stores what it reads", () => {
    const value = { order: ["warranty", "availability", "apk", "overdue", "licenses", "zones", "missingInvoices"], hidden: ["apk"] };
    expect(dashboardTilesToSetting(dashboardTilesFromSetting(value))).toEqual(value);
  });

  it("accepts a proper value and refuses anything else", () => {
    expect(isValidDashboardTilesValue({ order: ["apk"], hidden: [] })).toBe(true);
    expect(isValidDashboardTilesValue(null)).toBe(false);
    expect(isValidDashboardTilesValue([])).toBe(false);
    expect(isValidDashboardTilesValue({ order: ["apk", "apk"], hidden: [] })).toBe(false);
    expect(isValidDashboardTilesValue({ order: ["<script>"], hidden: [] })).toBe(false);
    expect(isValidDashboardTilesValue({ order: ["apk"] })).toBe(false);
  });
});
