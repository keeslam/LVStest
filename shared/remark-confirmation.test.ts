/**
 * OPT-011 — unchanged remark: no prompt. Edited remark: the prompt returns.
 */
import { describe, it, expect } from "vitest";
import { needsRemarkConfirmation, hasRemarks, normalizeRemarks } from "./remark-confirmation";

describe("OPT-011 — bevestigen per opmerking", () => {
  it("asks when a vehicle has a remark nobody has confirmed yet", () => {
    expect(needsRemarkConfirmation({ remarks: "Deuk linksachter", remarksConfirmedText: null })).toBe(true);
  });

  it("does not ask again for the same remark", () => {
    expect(needsRemarkConfirmation({
      remarks: "Deuk linksachter",
      remarksConfirmedText: "Deuk linksachter",
    })).toBe(false);
  });

  it("asks again as soon as the remark is edited", () => {
    expect(needsRemarkConfirmation({
      remarks: "Deuk linksachter EN ruit gebarsten",
      remarksConfirmedText: "Deuk linksachter",
    })).toBe(true);
  });

  it("does not treat re-indenting as a new remark", () => {
    expect(needsRemarkConfirmation({
      remarks: "  Deuk   linksachter\n",
      remarksConfirmedText: "Deuk linksachter",
    })).toBe(false);
  });

  it("never asks for a vehicle without a remark", () => {
    expect(needsRemarkConfirmation({ remarks: null })).toBe(false);
    expect(needsRemarkConfirmation({ remarks: "   " })).toBe(false);
    expect(needsRemarkConfirmation(null)).toBe(false);
  });

  it("a removed remark leaves no lingering prompt", () => {
    expect(needsRemarkConfirmation({ remarks: "", remarksConfirmedText: "Deuk linksachter" })).toBe(false);
  });

  it("still reports that a vehicle carries a remark, confirmed or not", () => {
    // The banner stays on screen either way; only the click goes away.
    expect(hasRemarks({ remarks: "Deuk", remarksConfirmedText: "Deuk" })).toBe(true);
    expect(hasRemarks({ remarks: " " })).toBe(false);
    expect(normalizeRemarks(undefined)).toBe("");
  });
});
