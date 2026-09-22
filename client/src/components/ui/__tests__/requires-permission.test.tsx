/**
 * `RequiresPermission` — B-27 (docs/superpowers/specs/2026-09-21-toegang-design.md,
 * §4): a control a user may not use stays VISIBLE, greyed out and switched
 * off, with the reason — instead of the hide-the-control style every
 * existing gate in this codebase uses today.
 *
 * Allowed: the child renders untouched (no extra wrapper element, so a
 * `data-testid`, `asChild` composition or table-row layout survives).
 * Denied: the child is cloned `disabled`/`aria-disabled`, its `onClick` never
 * fires even when the (still-visible) control is clicked, and a wrapping
 * focusable `<span>` carries a `Tooltip` naming the missing right — reachable
 * both by hover AND by keyboard focus, since a disabled `<button>` cannot
 * receive focus itself (browsers skip it entirely) and swallows pointer
 * events, which is why the tooltip cannot sit on the button directly.
 *
 * Runs in the jsdom project (plan §8.8). Real i18n (setup-jsdom.ts) so a
 * missing/renamed translation key fails this test instead of silently
 * rendering the raw key.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserPermission, UserRole } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

let role: string | undefined;
let permissions: string[] | undefined;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: role === undefined ? null : { id: 1, username: "tester", role, permissions },
    isLoading: false,
  }),
}));

import { RequiresPermission } from "@/components/ui/requires-permission";

function setUser(nextRole: string, nextPermissions: string[]) {
  role = nextRole;
  permissions = nextPermissions;
}

describe("RequiresPermission", () => {
  describe("allowed", () => {
    it("renders the child untouched, with no extra wrapper element", () => {
      setUser(UserRole.USER, [UserPermission.MANAGE_VEHICLES]);
      const { container } = render(
        <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-add-vehicle">Voertuig toevoegen</Button>
        </RequiresPermission>,
      );
      // The rendered root is the button itself, not a span/div wrapper.
      expect(container.firstElementChild?.tagName).toBe("BUTTON");
      const button = screen.getByTestId("button-add-vehicle");
      expect(button).not.toBeDisabled();
      expect(button).not.toHaveAttribute("aria-disabled");
    });

    it("keeps the child's own onClick working", async () => {
      setUser(UserRole.USER, [UserPermission.MANAGE_VEHICLES]);
      const onClick = vi.fn();
      render(
        <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-add-vehicle" onClick={onClick}>Voertuig toevoegen</Button>
        </RequiresPermission>,
      );
      await userEvent.click(screen.getByTestId("button-add-vehicle"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("is allowed for role admin even with none of the required permissions", () => {
      setUser(UserRole.ADMIN, []);
      render(
        <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-add-vehicle">Voertuig toevoegen</Button>
        </RequiresPermission>,
      );
      expect(screen.getByTestId("button-add-vehicle")).not.toBeDisabled();
    });

    it("with allOf, is allowed only once every listed permission is held", () => {
      setUser(UserRole.USER, [UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]);
      render(
        <RequiresPermission allOf={[UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-quick-apk-report">APK-rapport uploaden</Button>
        </RequiresPermission>,
      );
      expect(screen.getByTestId("button-quick-apk-report")).not.toBeDisabled();
    });
  });

  describe("denied", () => {
    it("renders the child disabled and aria-disabled, keeping its data-testid", () => {
      setUser(UserRole.USER, []);
      render(
        <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-add-vehicle">Voertuig toevoegen</Button>
        </RequiresPermission>,
      );
      const button = screen.getByTestId("button-add-vehicle");
      expect(button).toBeVisible();
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-disabled", "true");
    });

    it("never fires the child's onClick, even when the control is clicked", async () => {
      setUser(UserRole.USER, []);
      const onClick = vi.fn();
      render(
        <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-add-vehicle" onClick={onClick}>Voertuig toevoegen</Button>
        </RequiresPermission>,
      );
      // A disabled button does not dispatch click at all — force it through
      // fireEvent-style pointer events to prove the handler is really gone,
      // not merely unreachable via a normal click.
      const button = screen.getByTestId("button-add-vehicle");
      button.removeAttribute("disabled"); // simulate "clicked through the wrapper" despite the disabled state
      button.click();
      expect(onClick).not.toHaveBeenCalled();
    });

    it("with allOf, is denied when only some of the listed permissions are held", () => {
      setUser(UserRole.USER, [UserPermission.MANAGE_DOCUMENTS]);
      render(
        <RequiresPermission allOf={[UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-quick-apk-report">APK-rapport uploaden</Button>
        </RequiresPermission>,
      );
      expect(screen.getByTestId("button-quick-apk-report")).toBeDisabled();
    });

    it("names the missing right in the tooltip, reusing the users-dialog label, shown on keyboard focus", async () => {
      setUser(UserRole.USER, []);
      render(
        <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-add-vehicle">Voertuig toevoegen</Button>
        </RequiresPermission>,
      );
      // The button itself is disabled and cannot receive focus (browsers skip
      // disabled form controls entirely) — Tab must land on the wrapping span.
      await userEvent.tab();
      expect(document.activeElement).not.toBe(screen.getByTestId("button-add-vehicle"));
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent("Voertuigen beheren");
      });
    });

    it("fix round 1, item 3 — combines anyOf and allOf in one tooltip phrase when both are given and both fail", async () => {
      setUser(UserRole.USER, []);
      render(
        <RequiresPermission
          anyOf={[UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE]}
          allOf={[UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]}
        >
          <Button data-testid="button-combined">Combinatie</Button>
        </RequiresPermission>,
      );
      expect(screen.getByTestId("button-combined")).toBeDisabled();
      await userEvent.tab();
      await waitFor(() => {
        const tooltip = screen.getByRole("tooltip");
        // anyOf's two options joined with "of", then joined to allOf's two
        // requirements (joined with "en") with "en" between the two groups.
        expect(tooltip).toHaveTextContent("Reserveringen beheren' of 'Onderhoud beheren' en 'Documenten bewerken en genereren' en 'Voertuigen beheren");
      });
    });

    it("fix round 1, item 4 — the wrapping span carries the child's own layout classes, so a disabled tile keeps its grid/flex box", () => {
      setUser(UserRole.USER, []);
      const { container } = render(
        <RequiresPermission anyOf={[UserPermission.MANAGE_VEHICLES]}>
          <Button data-testid="button-scan-mileage" className="h-auto w-full flex-col">
            Kilometerstand
          </Button>
        </RequiresPermission>,
      );
      const span = container.firstElementChild as HTMLElement;
      expect(span.tagName).toBe("SPAN");
      // The span, not the button, is what a CSS grid/flex parent lays out as
      // its item once this wrapper sits in between — it must carry the
      // child's own sizing classes to take the same box an allowed sibling
      // (rendered without this wrapper via Slot) would take.
      expect(span.className).toContain("w-full");
      expect(span.className).toContain("flex-col");
    });

    it("works for a DropdownMenuItem child, disabling it via Radix's own disabled prop", async () => {
      setUser(UserRole.USER, []);
      const onClick = vi.fn();
      render(
        <DropdownMenu open>
          <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <RequiresPermission anyOf={[UserPermission.MANAGE_PDF_TEMPLATES]}>
              <DropdownMenuItem data-testid="menu-item-templates" onClick={onClick}>
                Sjablonen
              </DropdownMenuItem>
            </RequiresPermission>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
      const item = await screen.findByTestId("menu-item-templates");
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAttribute("data-disabled");
    });
  });
});
