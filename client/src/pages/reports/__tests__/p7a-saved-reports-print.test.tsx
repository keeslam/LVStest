/**
 * Audit A-14-7, A-14-9 (package P7a).
 * - deleting a saved report asks first (ConfirmDialog naming the report) and the
 *   delete control has an accessible name and a tooltip; cancel does nothing;
 * - the five print buttons of /reports say what they print.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { installFetch as installReportsFetch, renderWithClient, vehicle } from "./p7a-harness";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough, Pie: Passthrough,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});

import ReportBuilder from "@/pages/reports/report-builder";
import ReportsPage from "@/pages/reports/index";

const saved = [{
  id: 7, name: "Toyota-lijst", description: "", createdBy: "x", createdAt: "2026-10-01",
  configuration: { name: "Toyota-lijst", dataSources: ["vehicles"], filters: [], groupBy: [], columns: [{ field: "brand", table: "vehicles", label: "Brand" }] },
}];

let deleted: string[] = [];
function installBuilderFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (init?.method === "DELETE") {
      deleted.push(path);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (path.startsWith("/api/reports/saved")) {
      return new Response(JSON.stringify(saved), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}
function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ReportBuilder /></QueryClientProvider>);
}

beforeEach(() => { deleted = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("deleting a saved report (A-14-7)", () => {
  it("has an accessible name and a tooltip that name the report", async () => {
    installBuilderFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    const button = await screen.findByTestId("button-delete-report-7");
    expect(button).toHaveAccessibleName("Rapport verwijderen: Toyota-lijst");
    expect(button).toHaveAttribute("title", "Rapport verwijderen: Toyota-lijst");
  });

  it("asks first, naming the report, and a click on cancel deletes nothing", async () => {
    installBuilderFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    await user.click(await screen.findByTestId("button-delete-report-7"));
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent("Toyota-lijst");
    expect(deleted).toEqual([]);
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(deleted).toEqual([]);
    expect(screen.getByText("Toyota-lijst")).toBeInTheDocument();
  });

  it("deletes after the confirmation", async () => {
    installBuilderFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    await user.click(await screen.findByTestId("button-delete-report-7"));
    await user.click(await screen.findByTestId("confirm-delete-saved-report"));
    await waitFor(() => expect(deleted).toEqual(["/api/reports/saved/7"]));
  });
});

describe("print buttons of /reports (A-14-9)", () => {
  it("say what they print: a visible 'Afdrukken: ...', the report's full name as aria-label and tooltip", async () => {
    installReportsFetch({ vehicles: [vehicle(1, "AB123C")] });
    renderWithClient(<ReportsPage />);
    const expected: Array<[string, string, string]> = [
      ["print-report-apk", "Afdrukken: APK", "Afdrukken: APK-vervalrapport"],
      ["print-report-warranty", "Afdrukken: Garantie", "Afdrukken: Garantievervalrapport"],
      ["print-report-expenses", "Afdrukken: Kosten", "Afdrukken: Kostenrapport"],
      ["print-report-utilization", "Afdrukken: Benutting", "Afdrukken: Voertuigbenuttingsrapport"],
      ["print-report-customer-impact", "Afdrukken: Klanten", "Afdrukken: Klantimpactanalyserapport"],
    ];
    for (const [testId, visible, full] of expected) {
      const button = await screen.findByTestId(testId);
      expect(button).toHaveTextContent(visible);
      expect(button).toHaveAccessibleName(full);
      expect(button).toHaveAttribute("title", full);
    }
  });
});
