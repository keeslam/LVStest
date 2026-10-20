import { describe, it, expect } from "vitest";
import {
  QUICK_ACTION_IDS,
  isValidQuickActionsValue,
  quickActionsFromSetting,
  quickActionsLayout,
  quickActionsToSetting,
} from "./quick-actions-layout";

describe("quickActionsLayout", () => {
  it("without a setting keeps today's dashboard: six tiles, the rest buttons", () => {
    const { tiles, buttons } = quickActionsLayout(null);
    expect(tiles).toEqual(QUICK_ACTION_IDS.slice(0, 6));
    expect(buttons).toEqual(QUICK_ACTION_IDS.slice(6));
  });

  it("follows the stored order, leaves unticked actions out and moves the seventh to the buttons", () => {
    const order = ["log-expense", "scan", "start-pickup", "add-vehicle", "fuel-status", "registration", "start-return"];
    const { tiles, buttons } = quickActionsLayout({ order, hidden: ["scan"] });
    expect(tiles).toEqual(["log-expense", "start-pickup", "add-vehicle", "fuel-status", "registration", "start-return"]);
    expect(buttons[0]).toBe("availability"); // not in the stored order: appended, visible
    expect(buttons).not.toContain("scan");
  });

  it("gives fewer tiles when fewer than six are ticked", () => {
    const hidden = QUICK_ACTION_IDS.filter((id) => id !== "scan" && id !== "availability");
    expect(quickActionsLayout({ order: [], hidden })).toEqual({ tiles: ["scan", "availability"], buttons: [] });
  });
});

describe("quick actions setting", () => {
  it("drops unknown ids and round-trips", () => {
    const actions = quickActionsFromSetting({ order: ["bogus", "apk-report"], hidden: ["bogus", "scan"] });
    expect(actions[0]).toEqual({ id: "apk-report", visible: true });
    expect(actions.find((a) => a.id === "scan")?.visible).toBe(false);
    expect(actions).toHaveLength(QUICK_ACTION_IDS.length);
    const value = quickActionsToSetting(actions);
    expect(quickActionsToSetting(quickActionsFromSetting(value))).toEqual(value);
  });

  it("the server accepts only two lists of known ids without duplicates", () => {
    expect(isValidQuickActionsValue({ order: ["scan"], hidden: [] })).toBe(true);
    expect(isValidQuickActionsValue({ order: ["scan", "scan"], hidden: [] })).toBe(false);
    expect(isValidQuickActionsValue({ order: ["bogus"], hidden: [] })).toBe(false);
    expect(isValidQuickActionsValue(["scan"])).toBe(false);
  });
});
