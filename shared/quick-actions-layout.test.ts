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

  it("allows fewer than six tiles and leaves unticked actions out", () => {
    const { tiles, buttons } = quickActionsLayout({
      tiles: ["log-expense", "scan", "start-pickup"],
      buttons: ["fuel-status", "registration"],
      hidden: ["scan", "registration"],
    });
    expect(tiles).toEqual(["log-expense", "start-pickup"]);
    expect(buttons.slice(0, 1)).toEqual(["fuel-status"]);
    expect(buttons).not.toContain("registration");
    expect(buttons).toContain("start-return"); // not mentioned: appended to the buttons, visible
  });

  it("turns a seventh tile into a button", () => {
    const tiles = QUICK_ACTION_IDS.slice(0, 7);
    const layout = quickActionsLayout({ tiles, buttons: [], hidden: [] });
    expect(layout.tiles).toHaveLength(6);
    expect(layout.buttons[0]).toBe(QUICK_ACTION_IDS[6]);
  });
});

describe("quick actions setting", () => {
  it("drops unknown ids, keeps every action once and round-trips", () => {
    const actions = quickActionsFromSetting({ tiles: ["bogus", "apk-report"], buttons: ["apk-report", "scan"], hidden: ["bogus", "scan"] });
    expect(actions[0]).toEqual({ id: "apk-report", place: "tile", visible: true });
    expect(actions.find((a) => a.id === "scan")).toEqual({ id: "scan", place: "button", visible: false });
    expect(actions).toHaveLength(QUICK_ACTION_IDS.length);
    const value = quickActionsToSetting(actions);
    expect(quickActionsToSetting(quickActionsFromSetting(value))).toEqual(value);
  });

  it("the server accepts at most six tiles and no action twice", () => {
    expect(isValidQuickActionsValue({ tiles: ["scan"], buttons: ["start-pickup"], hidden: [] })).toBe(true);
    expect(isValidQuickActionsValue({ tiles: [], buttons: [], hidden: [] })).toBe(true);
    expect(isValidQuickActionsValue({ tiles: QUICK_ACTION_IDS.slice(0, 7), buttons: [], hidden: [] })).toBe(false);
    expect(isValidQuickActionsValue({ tiles: ["scan"], buttons: ["scan"], hidden: [] })).toBe(false);
    expect(isValidQuickActionsValue({ tiles: ["bogus"], buttons: [], hidden: [] })).toBe(false);
    expect(isValidQuickActionsValue({ order: ["scan"], hidden: [] })).toBe(false);
  });
});
