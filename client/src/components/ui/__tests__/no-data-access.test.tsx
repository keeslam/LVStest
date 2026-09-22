/**
 * B-29 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3) —
 * `NoDataAccess` is the one muted line a gated query's own consumer renders
 * instead of a list/card/column whose data needed a permission outside the
 * screen's own family. Runs in the jsdom project (plan §8.8). Real i18n
 * (setup-jsdom.ts) so a missing/renamed translation key fails this test
 * instead of silently rendering the raw key.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserPermission } from "@shared/schema";
import { NoDataAccess } from "@/components/ui/no-data-access";

describe("NoDataAccess", () => {
  it("shows the data-testid and names the permission, reusing the users-dialog label", () => {
    render(<NoDataAccess permission={UserPermission.VIEW_VEHICLES} />);
    const root = screen.getByTestId("no-data-access");
    expect(root).toBeInTheDocument();
    // "Voertuigen bekijken" is PERMISSION_LABELS[VIEW_VEHICLES] in
    // shared/permission-labels.ts — the same label users-dialog.tsx renders
    // for this permission's checkbox.
    expect(root.textContent).toContain("'Voertuigen bekijken'");
  });

  it("names a different permission for a different family", () => {
    render(<NoDataAccess permission={UserPermission.VIEW_RESERVATIONS} />);
    expect(screen.getByTestId("no-data-access").textContent).toContain("'Reserveringen bekijken'");
  });

  it("accepts a className for layout inside its caller", () => {
    render(<NoDataAccess permission={UserPermission.VIEW_VEHICLES} className="my-4" />);
    expect(screen.getByTestId("no-data-access")).toHaveClass("my-4");
  });
});
