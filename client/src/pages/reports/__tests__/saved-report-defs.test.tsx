/**
 * Part 2 final fixes: who sees a saved report on a tab (portal and office gates, broken
 * configuration), and the edit right of a saved report with an unknown source.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
vi.mock("@/lib/office-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/office-date")>()),
  officeToday: () => "2026-10-25",
}));

import { savedReportDefs, type ReportAccess } from "@/pages/reports/report-registry";
import { SavedReportView, ReportBuilderOpenerContext, type SavedReport } from "@/pages/reports/saved-report-view";
import { ReportFiltersProvider } from "@/pages/reports/report-filters";
import { ReportPrintProvider } from "@/components/reports/kit/report-print";

const accessFor = (perms: string[]): ReportAccess => ({ isAdmin: false, has: (p) => perms.includes(p), canViewFiscal: false });
const userFor = (perms: string[]) => ({ role: "user", permissions: perms });

const report = (tab: string, source = "fines", extra: Record<string, unknown> = {}): SavedReport => ({
  id: 1, name: "R",
  configuration: {
    name: "R", dataSources: [source], filters: [], groupBy: [],
    columns: [{ field: "id", table: source, label: "Id" }], tab, ...extra,
  } as any,
});

function visibleFor(r: SavedReport, perms: string[]) {
  const [def] = savedReportDefs([r], userFor(perms));
  return def.visible(accessFor(perms));
}

describe("savedReportDefs visibility", () => {
  const base = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FINES];

  it("on Portaal it also needs the portal right", () => {
    expect(visibleFor(report("portal"), base)).toBe(false);
    expect(visibleFor(report("portal"), [...base, UserPermission.VIEW_PORTAL])).toBe(true);
  });

  it("on Kantoor it also needs a right the office tab is built on", () => {
    expect(visibleFor(report("office"), base)).toBe(false);
    expect(visibleFor(report("office"), [...base, UserPermission.MANAGE_EXPENSES])).toBe(true);
    expect(visibleFor(report("office"), [...base, UserPermission.VIEW_DAMAGE_CHECKS])).toBe(true);
    expect(visibleFor(report("office"), [...base, UserPermission.VIEW_VEHICLES])).toBe(true);
  });

  it("other tabs only need the report right and the source rights", () => {
    expect(visibleFor(report("financial"), base)).toBe(true);
  });

  it("a configuration without dataSources is not visible and does not crash", () => {
    const broken = report("financial");
    delete (broken.configuration as any).dataSources;
    expect(() => savedReportDefs([broken], userFor(base))).not.toThrow();
    expect(visibleFor(broken, base)).toBe(false);
    const empty = report("financial");
    (empty.configuration as any).dataSources = [];
    expect(visibleFor(empty, base)).toBe(false);
  });
});

function renderView(r: SavedReport, compare: "none" | "previous" = "none") {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportFiltersProvider initial={{ compare }}>
        <ReportPrintProvider>
          <ReportBuilderOpenerContext.Provider value={() => {}}>
            <SavedReportView report={r} />
          </ReportBuilderOpenerContext.Provider>
        </ReportPrintProvider>
      </ReportFiltersProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => { vi.unstubAllGlobals(); role = UserRole.ADMIN; permissions = []; });

describe("saved report view", () => {
  it("offers Bewerken only when every source is known", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
    const { unmount } = renderView(report("financial"));
    expect(await screen.findByTestId("button-edit-saved-report")).toBeInTheDocument();
    unmount();
    renderView(report("financial", "gone-source"));
    await screen.findByTestId("saved-report-1");
    expect(screen.queryByTestId("button-edit-saved-report")).toBeNull();
  });

  it("says that comparing does not apply when the filter bar compares", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
    const { unmount } = renderView(report("financial"), "previous");
    expect(await screen.findByTestId("saved-report-compare-note")).toHaveTextContent("Vergelijken geldt niet voor dit rapport.");
    unmount();
    renderView(report("financial"), "none");
    await screen.findByTestId("saved-report-1");
    expect(screen.queryByTestId("saved-report-compare-note")).toBeNull();
  });
});
