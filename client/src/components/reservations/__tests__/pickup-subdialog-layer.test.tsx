/**
 * The pickup and return dialogs render their content at z-[60]. Every dialog they open on top of
 * themselves must sit higher, or it opens behind them and staff only see a darker screen (found while
 * photographing the user manual, 18 October 2026). The browser test
 * e2e/layer-b-tail/reservations/pickup-subdialog-layer.spec.ts walks the real flow; this one pins the
 * classes of the shared pieces.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WorkshopBlockedDialog } from "@/components/reservations/workshop-blocked-dialog";

describe("dialogs that open on top of the pickup dialog", () => {
  it("ConfirmDialog passes contentClassName to its content", () => {
    render(<ConfirmDialog open onOpenChange={() => {}} title="Vraag" description="Uitleg" onConfirm={() => {}} contentClassName="z-[70]" />);
    expect(screen.getByTestId("confirm-dialog").className).toContain("z-[70]");
  });

  it("WorkshopBlockedDialog sits above z-[60]", () => {
    render(<WorkshopBlockedDialog open onOpenChange={() => {}} refusal={{ reason: "NOT_FOR_RENTAL" } as never} onForce={() => {}} />);
    expect(screen.getByTestId("dialog-workshop-blocked").className).toContain("z-[70]");
  });

  it("every ConfirmDialog and the duplicate-contract warning in the pickup and return dialogs are raised", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../pickup-return-dialogs.tsx"), "utf8");
    const confirms = source.split("<ConfirmDialog").slice(1);
    expect(confirms.length).toBeGreaterThan(0);
    for (const block of confirms) expect(block.slice(0, 300)).toContain('contentClassName="z-[70]"');
    expect(source).toMatch(/showDuplicateWarning[\s\S]{0,200}DialogContent className="max-w-md z-\[70\]"/);
  });
});
