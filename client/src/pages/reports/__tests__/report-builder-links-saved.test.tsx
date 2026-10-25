/**
 * Rapporten herontwerp deel 3, Task 2: a saved report with linked columns. The header says
 * "Voertuig · Merk", the cell reads `vehicle.brand`, and a linked plate links to the vehicle
 * through the linked id the run fetches (hidden) when the report is a plain list.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import i18n from "@/i18n";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));

import { SavedReportView, type SavedReport } from "@/pages/reports/saved-report-view";
import { ReportFiltersProvider } from "@/pages/reports/report-filters";

let executeBody: any = null;
function installFetch(rows: any[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (path === "/api/reports/execute") {
      executeBody = JSON.parse(init.body);
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}
function renderView(report: SavedReport) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportFiltersProvider><SavedReportView report={report} /></ReportFiltersProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => { executeBody = null; });
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

const report = (extra: Partial<SavedReport["configuration"]> = {}): SavedReport => ({
  id: 5, name: "Bekeuringen met voertuig",
  configuration: {
    name: "x", dataSources: ["fines"], filters: [], groupBy: [],
    columns: [
      { table: "vehicles", field: "licensePlate", via: "vehicle", label: "Plate" },
      { table: "vehicles", field: "brand", via: "vehicle", label: "Brand" },
    ],
    ...extra,
  },
});

describe("saved report with linked columns", () => {
  it("shows linked headers and cells, and fetches the linked vehicle id hidden", async () => {
    installFetch([{ "vehicle.licensePlate": "AB12CD", "vehicle.brand": "Toyota", "vehicle.id": 4 }]);
    renderView(report());
    expect(await screen.findByText("Toyota")).toBeInTheDocument();
    expect(screen.getByText("Voertuig · Merk")).toBeInTheDocument();
    expect(screen.getByText("Voertuig · Kenteken")).toBeInTheDocument();
    expect(executeBody.columns).toHaveLength(3);
    expect(executeBody.columns[2]).toMatchObject({ table: "vehicles", field: "id", via: "vehicle" });
    expect(screen.queryByText("Voertuig · ID")).toBeNull();
  });

  it("adds no hidden id to a grouped report", async () => {
    installFetch([{ "vehicle.brand": "Toyota", id: "2" }]);
    renderView(report({
      columns: [
        { table: "vehicles", field: "brand", via: "vehicle", label: "Brand" },
        { table: "fines", field: "id", label: "ID", aggregation: "COUNT" },
      ],
      groupBy: [{ table: "vehicles", field: "brand", via: "vehicle" }],
    }));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.columns).toHaveLength(2);
  });
});

describe("links in a saved report", () => {
  it("links a linked plate of a plain list to the vehicle", async () => {
    installFetch([{ "vehicle.licensePlate": "AB12CD", "vehicle.brand": "Toyota", "vehicle.id": 4 }]);
    renderView(report());
    const button = await screen.findByRole("button", { name: /AB-12-CD|AB12CD/ });
    expect(button).toBeInTheDocument();
  });

  it("shows no link on a linked plate of a grouped report", async () => {
    installFetch([{ "vehicle.licensePlate": "AB12CD", id: "2" }]);
    renderView(report({
      columns: [
        { table: "vehicles", field: "licensePlate", via: "vehicle", label: "Plate" },
        { table: "fines", field: "id", label: "ID", aggregation: "COUNT" },
      ],
      groupBy: [{ table: "vehicles", field: "licensePlate", via: "vehicle" }],
    }));
    const cell = (await screen.findAllByText(/AB-12-CD|AB12CD/))[0];
    expect(cell.closest("button")).toBeNull();
  });
});
