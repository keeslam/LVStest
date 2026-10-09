import { describe, it, expect } from "vitest";
import { blockStatusForForm } from "./maintenance-status";

/**
 * Audit module 7, finding 2: the maintenance edit dialog opened a still planned
 * block with Status "Binnen" because every stored value other than in/out fell
 * back to "in". The Status the dialogs show for a stored block value is decided
 * here, once.
 */
describe("blockStatusForForm", () => {
  it("shows a planned block as scheduled", () => {
    expect(blockStatusForForm("scheduled")).toBe("scheduled");
  });

  it("treats a missing value as scheduled, like the server (an older block without the field counts as scheduled)", () => {
    expect(blockStatusForForm(null)).toBe("scheduled");
    expect(blockStatusForForm(undefined)).toBe("scheduled");
    expect(blockStatusForForm("")).toBe("scheduled");
    expect(blockStatusForForm("  ")).toBe("scheduled");
  });

  it("treats an unknown value as scheduled rather than as a car that has arrived", () => {
    expect(blockStatusForForm("something-else")).toBe("scheduled");
    expect(blockStatusForForm("needs_service")).toBe("scheduled");
  });

  it("keeps in and out, and reads the legacy in_service as in", () => {
    expect(blockStatusForForm("in")).toBe("in");
    expect(blockStatusForForm("out")).toBe("out");
    expect(blockStatusForForm("in_service")).toBe("in");
  });

  it("ignores case and surrounding spaces", () => {
    expect(blockStatusForForm(" IN ")).toBe("in");
    expect(blockStatusForForm("Out")).toBe("out");
    expect(blockStatusForForm("Scheduled")).toBe("scheduled");
  });
});
