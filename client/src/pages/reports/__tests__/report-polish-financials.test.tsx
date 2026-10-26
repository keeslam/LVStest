/**
 * Rapport-polish (Kees, 2026-10-26), 3: the print of "Kosten en opbrengst per voertuig" has the
 * margin as an amount only (no stray "–" for a margin without revenue) and a total under Marge,
 * also when only some rows are picked.
 */
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { PrintSection } from "@/components/reports/kit/report-print";
import { pickedRowTotals } from "@/lib/report-document-print";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const P = ({ children }: any) => React.createElement("div", null, children);
  return { ResponsiveContainer: P, BarChart: P, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null };
});
const captured = vi.hoisted(() => ({ sections: null as PrintSection[] | null }));
vi.mock("@/components/reports/kit/report-print", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/reports/kit/report-print")>();
  return { ...actual, useReportPrint: (s: PrintSection[] | null) => { captured.sections = s; actual.useReportPrint(s); } };
});

import { VehicleFinancialsReport } from "@/pages/reports/legacy/vehicle-financials-report";
import { ReportFiltersProvider } from "@/pages/reports/report-filters";

const data = {
  rows: [
    { vehicleId: 1, licensePlate: "AA11BB", brand: "Opel", model: "Vivaro", dailyPrice: 50, rentals: 1, rentalDays: 2, revenue: 100, expenses: 40, expensesByCategory: {}, margin: 60 },
    { vehicleId: 2, licensePlate: "CC22DD", brand: "Fiat", model: "Ducato", dailyPrice: null, rentals: 0, rentalDays: 0, revenue: 0, expenses: 710, expensesByCategory: {}, margin: -710 },
  ],
  totals: { rentals: 1, rentalDays: 2, revenue: 100, expenses: 750, margin: -650 },
};

describe("3. Print of Kosten en opbrengst per voertuig", () => {
  it("prints the margin as an amount, with a total that adds up over picked rows too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } })));
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><ReportFiltersProvider initial={{ from: "2026-01-01", to: "2026-12-31" }}><VehicleFinancialsReport /></ReportFiltersProvider></QueryClientProvider>);
    let table!: Extract<PrintSection, { kind: "table" }>;
    await waitFor(async () => {
      table = captured.sections!.find((s) => s.kind === "table") as typeof table;
      expect(table.totals?.some((c) => c.includes("650"))).toBe(true);
      expect((await table.allRows()).rows).toHaveLength(2);
    });
    const col = table.columnIds!.indexOf("margin");
    const { rows } = await table.allRows();
    expect(rows[1][col]).toMatch(/710,00$/);
    expect(rows[1][col]).not.toContain("–");
    expect(rows.every((r) => !r[col].includes("%"))).toBe(true);
    // The total survives picking one row: it is the sum of the picked margins.
    const picked = pickedRowTotals(rows, [rows[0]], table.totals!, "gekozen");
    expect(picked[col]).toMatch(/60,00$/);
  });
});
