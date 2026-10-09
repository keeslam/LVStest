/**
 * Final wave of sub-project C, item 14 - the "can this person look at the fiscal
 * data" gates, checked against the right the server route actually wants.
 *
 * `useFiscalPermissions().canView` used to be true for ANY of the six fiscal
 * rights, but every fiscal GET (`/api/fiscal/overview`, `/configuration`,
 * `/definitions`, `/reports/monthly`, `/assessments`, ...) is guarded by
 * `view_fiscal` alone. An account with only manage_fiscal_review (or the audit
 * log right) therefore saw a fiscal button / tab / settings tab whose first
 * request was a 403 - the red "Kon de gegevens niet laden" toast, plus a fiscal
 * audit event per opening. `canView` now means exactly view_fiscal (an
 * administrator has it); `hasAnyRight` is the "there is something for me in the
 * fiscal settings" question, and each settings tab follows its own right.
 *
 * Runs in the jsdom project (plan section 8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({
    openFineDialog: () => {},
    openPortalRequestDialog: () => {},
    openPortalListDialog: () => {},
    openFineImportDialog: () => {},
    openNewFineDialog: () => {},
    openFineImportsDialog: () => {},
  }),
}));

import { useFiscalPermissions } from "@/components/fiscal/use-fiscal-permissions";
import { FiscalSettingsSection } from "@/components/fiscal/fiscal-settings-section";
import ReportsPage from "@/pages/reports/index";
import PortalAdminPage from "@/pages/portal-admin/index";

let requested: string[];

beforeEach(() => {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
      requested.push(url.replace(/^https?:\/\/[^/]+/, ""));
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const fiscalRequests = () => requested.filter((url) => url.startsWith("/api/fiscal"));

const ALL_FISCAL_RIGHTS_BUT_VIEW = [
  UserPermission.MANAGE_FISCAL_REVIEW,
  UserPermission.MANAGE_FISCAL_CONFIGURATION,
  UserPermission.APPROVE_FISCAL_CONFIGURATION,
  UserPermission.PUBLISH_FISCAL_CONFIGURATION,
  UserPermission.VIEW_FISCAL_AUDIT_LOG,
];

describe("useFiscalPermissions - canView is exactly view_fiscal", () => {
  it("view_fiscal: canView; an administrator: canView", () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_FISCAL];
    expect(renderHook(() => useFiscalPermissions()).result.current.canView).toBe(true);

    role = UserRole.ADMIN;
    permissions = [];
    expect(renderHook(() => useFiscalPermissions()).result.current.canView).toBe(true);
  });

  it.each(ALL_FISCAL_RIGHTS_BUT_VIEW)("%s alone is a fiscal right, but not canView", (right) => {
    role = UserRole.USER;
    permissions = [right];
    const { canView, hasAnyRight } = renderHook(() => useFiscalPermissions()).result.current;
    expect(canView).toBe(false);
    expect(hasAnyRight).toBe(true);
  });

  it("no fiscal right at all: neither", () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS];
    const { canView, hasAnyRight } = renderHook(() => useFiscalPermissions()).result.current;
    expect(canView).toBe(false);
    expect(hasAnyRight).toBe(false);
  });
});

describe("FiscalSettingsSection - every tab follows its own right", () => {
  it("review right only: just the Beoordelingen tab, and no /api/fiscal/configuration or /definitions", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_FISCAL_REVIEW];
    withClient(<FiscalSettingsSection />);

    expect(await screen.findByRole("tab", { name: "Beoordelingen" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Configuratie" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Auditlog" })).toBeNull();
    await waitFor(() => expect(fiscalRequests().some((url) => url.startsWith("/api/fiscal/review-cases"))).toBe(true));
    expect(fiscalRequests().some((url) => /\/api\/fiscal\/(configuration|definitions|overview)/.test(url))).toBe(false);
  });

  it("audit-log right only: just the Auditlog tab, opened at once", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_FISCAL_AUDIT_LOG];
    withClient(<FiscalSettingsSection />);

    expect(await screen.findByRole("tab", { name: "Auditlog" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Configuratie" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Beoordelingen" })).toBeNull();
    await waitFor(() => expect(fiscalRequests().some((url) => url.startsWith("/api/fiscal/audit"))).toBe(true));
    expect(fiscalRequests().some((url) => /\/api\/fiscal\/(configuration|definitions)/.test(url))).toBe(false);
  });

  it("a configuration-only account (no view_fiscal) gets no configuration tab either: its GETs would be refused", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_FISCAL_CONFIGURATION];
    withClient(<FiscalSettingsSection />);

    // The section is there (there is a right), but nothing it could load is allowed:
    // it names the right that is missing instead of opening a tab that would 403.
    expect(await screen.findByTestId("fiscal-settings-section")).toBeInTheDocument();
    expect(screen.getByTestId("no-data-access")).toHaveTextContent("Fiscaal bekijken");
    expect(screen.queryByRole("tab")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fiscalRequests()).toEqual([]);
  });

  it("view_fiscal and the review right: both tabs, configuration first", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_FISCAL, UserPermission.MANAGE_FISCAL_REVIEW];
    withClient(<FiscalSettingsSection />);

    expect(await screen.findByRole("tab", { name: "Configuratie" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Beoordelingen" })).toBeInTheDocument();
  });
});

describe("/reports - the fiscal tab needs view_fiscal", () => {
  it.each(ALL_FISCAL_RIGHTS_BUT_VIEW)("%s alone does not show the tab", async (right) => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, right];
    withClient(<ReportsPage />);

    expect(await screen.findByTestId("tab-report-transports")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-report-fiscal")).toBeNull();
  });

  it("view_fiscal shows it", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FISCAL];
    withClient(<ReportsPage />);

    expect(await screen.findByTestId("tab-report-fiscal")).toBeInTheDocument();
  });
});

describe("Klantenportaal page - the fiscal overview button needs view_fiscal", () => {
  it.each(ALL_FISCAL_RIGHTS_BUT_VIEW)("%s alone does not show the button", async (right) => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_PORTAL, right];
    withClient(<PortalAdminPage />);

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByTestId("button-fiscal-overview")).toBeNull();
  });

  it("view_fiscal shows it", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_PORTAL, UserPermission.VIEW_FISCAL];
    withClient(<PortalAdminPage />);

    expect(await screen.findByTestId("button-fiscal-overview")).toBeInTheDocument();
  });
});
