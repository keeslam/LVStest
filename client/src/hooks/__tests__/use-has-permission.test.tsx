/**
 * `useHasPermission` — the client-side mirror of the server's OR-logic
 * `hasPermission(...)` middleware (server/middleware/permissions.ts): true
 * for role `admin` (which bypasses every server-side check), else true when
 * the signed-in user holds at least one of the given permissions.
 *
 * This is the hook findings 1-4 in task-6-report.md ("Findings for the
 * owner") are gated with. Two of the five queries live on pages large enough
 * that rendering the whole page in jsdom is impractical
 * (`client/src/pages/documents/index.tsx`,
 * `client/src/pages/reservations/calendar.tsx`); per the task-6b brief, this
 * hook test stands in for a component test on those two, and the E2E layer
 * (`npm run e2e:a`) covers the actual pages.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserPermission, UserRole } from "@shared/schema";

let role: string | undefined;
let permissions: string[] | undefined;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: role === undefined ? null : { id: 1, username: "tester", role, permissions },
    isLoading: false,
  }),
}));

import { useHasPermission, useHasAllPermissions } from "@/hooks/use-has-permission";

function Probe({ anyOf }: { anyOf: string[] }) {
  const allowed = useHasPermission(...anyOf);
  return <span data-testid="result">{String(allowed)}</span>;
}

function renderProbe(anyOf: string[]) {
  return render(<Probe anyOf={anyOf} />);
}

function AllProbe({ allOf }: { allOf: string[] }) {
  const allowed = useHasAllPermissions(...allOf);
  return <span data-testid="result">{String(allowed)}</span>;
}

function renderAllProbe(allOf: string[]) {
  return render(<AllProbe allOf={allOf} />);
}

describe("useHasPermission", () => {
  it("is true for role admin even with an empty permission list", () => {
    role = UserRole.ADMIN;
    permissions = [];
    renderProbe([UserPermission.MANAGE_NOTIFICATIONS]);
    expect(screen.getByTestId("result")).toHaveTextContent("true");
  });

  it("is true when the user holds one of the given permissions", () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_CUSTOMERS];
    renderProbe([UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS]);
    expect(screen.getByTestId("result")).toHaveTextContent("true");
  });

  it("is false when the user holds none of the given permissions", () => {
    role = UserRole.CLEANER;
    permissions = [];
    renderProbe([UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS]);
    expect(screen.getByTestId("result")).toHaveTextContent("false");
  });

  it("treats a missing permissions array as none held", () => {
    role = UserRole.USER;
    permissions = undefined;
    renderProbe([UserPermission.MANAGE_PDF_TEMPLATES]);
    expect(screen.getByTestId("result")).toHaveTextContent("false");
  });

  it("is false with no signed-in user", () => {
    role = undefined;
    permissions = undefined;
    renderProbe([UserPermission.MANAGE_EXPENSES]);
    expect(screen.getByTestId("result")).toHaveTextContent("false");
  });
});

/**
 * `useHasAllPermissions` — Task 3 addition (docs/superpowers/specs/2026-09-21-toegang-design.md,
 * §4): `RequiresPermission`'s `allOf` prop, for a control whose action needs
 * several rights together (e.g. the dashboard's APK-report-upload tile needs
 * both MANAGE_DOCUMENTS and MANAGE_VEHICLES). AND logic, mirrored the same
 * way as `useHasPermission`'s OR logic: role `admin` always passes.
 */
describe("useHasAllPermissions", () => {
  it("is true for role admin even with an empty permission list", () => {
    role = UserRole.ADMIN;
    permissions = [];
    renderAllProbe([UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]);
    expect(screen.getByTestId("result")).toHaveTextContent("true");
  });

  it("is true when the user holds every given permission", () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES];
    renderAllProbe([UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]);
    expect(screen.getByTestId("result")).toHaveTextContent("true");
  });

  it("is false when the user holds only some of the given permissions", () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_DOCUMENTS];
    renderAllProbe([UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]);
    expect(screen.getByTestId("result")).toHaveTextContent("false");
  });

  it("is false when the user holds none of the given permissions", () => {
    role = UserRole.CLEANER;
    permissions = [];
    renderAllProbe([UserPermission.MANAGE_DOCUMENTS, UserPermission.MANAGE_VEHICLES]);
    expect(screen.getByTestId("result")).toHaveTextContent("false");
  });

  it("is true with an empty requirement list (nothing to satisfy)", () => {
    role = UserRole.USER;
    permissions = [];
    renderAllProbe([]);
    expect(screen.getByTestId("result")).toHaveTextContent("true");
  });

  it("is false with no signed-in user", () => {
    role = undefined;
    permissions = undefined;
    renderAllProbe([UserPermission.MANAGE_DOCUMENTS]);
    expect(screen.getByTestId("result")).toHaveTextContent("false");
  });
});
