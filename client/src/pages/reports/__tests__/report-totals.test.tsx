/**
 * Report builder, totals row (rapporten herontwerp deel 4, Task 4): computeTotals skips empty
 * cells, the totals row shows under the table, in the CSV (last line "Totaal") and on paper
 * ("Alle regels" over every row, "Alleen deze pagina" labelled "Totaal (deze pagina)"), and the
 * Totaalregel choice per column follows the kind of the column (percent only Gemiddelde).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import i18n from "@/i18n";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
const csvSpy = vi.fn();
vi.mock("@/lib/csv", async (importOriginal) => ({ ...(await importOriginal<object>()), downloadCsv: (...a: unknown[]) => csvSpy(...a) }));
vi.mock("@/lib/audit-events", async (importOriginal) => ({ ...(await importOriginal<object>()), reportClientAction: vi.fn() }));

import ReportBuilder from "@/pages/reports/report-builder";
import { computeTotals, totalChoicesFor, totalsRow, cleanTotals, type OutputColumn } from "@/pages/reports/report-builder-output";
import { SavedReportView, type SavedReport } from "@/pages/reports/saved-report-view";
import { ReportFiltersProvider } from "@/pages/reports/report-filters";
import { ReportPrintProvider, PrintButtonInner } from "@/components/reports/kit/report-print";

const t = ((k: string) => k) as any;
const col = (field: string, extra: Partial<OutputColumn> = {}): OutputColumn => ({ table: "expenses", field, label: field, ...extra });

describe("computeTotals", () => {
  const rows = [{ amount: "10" }, { amount: null }, { amount: 5 }, { amount: "" }];
  const c = [col("amount")];

  it("sums, averages and counts, skipping empty cells", () => {
    expect(computeTotals(rows, c, { amount: "SUM" })).toEqual({ amount: 15 });
    expect(computeTotals(rows, c, { amount: "AVG" })).toEqual({ amount: 7.5 });
    expect(computeTotals(rows, c, { amount: "COUNT" })).toEqual({ amount: 2 });
  });

  it("gives no sum when nothing can be added, and 0 for a count", () => {
    expect(computeTotals([{ amount: null }], c, { amount: "SUM" })).toEqual({});
    expect(computeTotals([{ amount: null }], c, { amount: "COUNT" })).toEqual({ amount: 0 });
  });

  it("ignores a choice that does not fit: a percent only averages, a text only counts", () => {
    const pct = { table: "", field: "", calc: "p", label: "Marge", calcType: "percent" as const };
    const txt = { table: "", field: "", calc: "s", label: "Klasse", calcType: "text" as const };
    expect(totalChoicesFor(pct)).toEqual(["AVG"]);
    expect(totalChoicesFor(txt)).toEqual(["COUNT"]);
    expect(totalChoicesFor(col("description"))).toEqual(["COUNT"]);
    expect(totalChoicesFor(col("amount"))).toEqual(["SUM", "AVG", "COUNT"]);
    expect(computeTotals([{ "calc.p": 0.2 }, { "calc.p": 0.4 }], [pct], { "calc.p": "SUM" })).toEqual({});
    expect(computeTotals([{ "calc.p": 0.2 }, { "calc.p": 0.4 }], [pct], { "calc.p": "AVG" })[`calc.p`]).toBeCloseTo(0.3);
    expect(cleanTotals([pct, c[0]], { "calc.p": "SUM", amount: "SUM" })).toEqual({ amount: "SUM" });
  });

  it("an aggregated column gets Som and Aantal only (no average of averages)", () => {
    expect(totalChoicesFor(col("amount", { aggregation: "AVG" }))).toEqual(["SUM", "COUNT"]);
    expect(totalChoicesFor({ table: "", field: "", calc: "a", label: "x", calcType: "money", aggregation: "SUM" })).toEqual(["SUM", "COUNT"]);
  });

  it("shows a percent total x 100, with the label in the first column", () => {
    const pct = { table: "", field: "", calc: "p", label: "Marge", calcType: "percent" as const };
    const cells = totalsRow(t, [{ "calc.p": 0.2 }, { "calc.p": 0.4 }], [col("description"), pct], { "calc.p": "AVG" }, "Totaal");
    expect(cells).toEqual(["Totaal", "30,00 %"]);
    expect(totalsRow(t, [{ "calc.p": 0.25 }], [col("description"), pct], { "calc.p": "AVG" }, "Totaal", true)).toEqual(["Totaal", "25,00"]);
    expect(totalsRow(t, [{ amount: 1 }], [col("amount")], {}, "Totaal")).toBeNull();
  });
});

const rows = Array.from({ length: 12 }, (_, i) => ({ amount: String(i + 1), description: `d${i + 1}` }));
const savedReport: SavedReport = {
  id: 5, name: "Kosten",
  configuration: {
    name: "Kosten", dataSources: ["expenses"], filters: [], groupBy: [],
    columns: [
      { table: "expenses", field: "description", label: "Omschrijving" },
      { table: "expenses", field: "amount", label: "Bedrag" },
    ],
    totals: { amount: "SUM" },
  } as any,
};

function renderSaved(report: SavedReport = savedReport) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } })));
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportFiltersProvider>
        <ReportPrintProvider>
          <PrintButtonInner title="Kosten" />
          <SavedReportView report={report} />
        </ReportPrintProvider>
      </ReportFiltersProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => csvSpy.mockClear());
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

describe("money totals", () => {
  it("a Som of a plain amount field shows euros, like its cells", () => {
    const t = i18n.getFixedT("nl", "reports");
    const amount: OutputColumn = { table: "expenses", field: "amount", label: "Bedrag" } as OutputColumn;
    const row = totalsRow(t, [{ amount: "104.00" }, { amount: "110.00" }], [amount], { amount: "SUM" }, "Totaal");
    expect(row?.[0]).toMatch(/^Totaal: €\s214,00$/);
  });

  it("an aggregated Som of an amount field shows euros too", () => {
    const t = i18n.getFixedT("nl", "reports");
    const summed: OutputColumn = { table: "expenses", field: "amount", label: "Bedrag", aggregation: "SUM" } as OutputColumn;
    const row = totalsRow(t, [{ "amount.SUM": "104.00" }, { "amount.SUM": "110.00" }], [summed], { "amount.SUM": "SUM" }, "Totaal");
    expect(row?.[0]).toMatch(/^Totaal: €\s214,00$/);
  });
});

describe("saved report with a totals row", () => {
  it("shows the total under the table, over all rows", async () => {
    renderSaved();
    const row = await screen.findByTestId("saved-report-table-totals");
    expect(row).toHaveTextContent("Totaal");
    expect(row).toHaveTextContent("78,00");
  });

  it("has no totals row when the report has no totals", async () => {
    renderSaved({ ...savedReport, configuration: { ...savedReport.configuration, totals: undefined } });
    await screen.findByTestId("saved-report-table");
    await screen.findByTestId("saved-report-table-row-0");
    expect(screen.queryByTestId("saved-report-table-totals")).toBeNull();
  });

  it("ends the CSV with a line that starts with Totaal", async () => {
    const user = userEvent.setup();
    renderSaved();
    await screen.findByTestId("saved-report-table-totals");
    await user.click(screen.getByTestId("button-saved-report-csv"));
    const [, , body] = csvSpy.mock.calls[0];
    expect(body).toHaveLength(13);
    expect(body[12]).toEqual(["Totaal", "78,00"]);
  });

  const srcDoc = () => (screen.getByTestId("print-preview-frame") as HTMLIFrameElement).getAttribute("srcdoc") ?? "";

  it("prints the total of all rows for Alle regels, and of the page for Alleen deze pagina", async () => {
    const user = userEvent.setup();
    renderSaved();
    await screen.findByTestId("saved-report-table-totals");
    await user.click(await screen.findByTestId("button-report-print"));
    const dialog = await screen.findByTestId("dialog-report-print");
    await waitFor(() => expect(srcDoc()).toContain("<tfoot>"));
    expect(srcDoc()).toMatch(/<tfoot><tr><td>Totaal<\/td><td>€\s78,00<\/td>/);
    expect(srcDoc()).not.toContain("Totaal (deze pagina)");
    await user.selectOptions(within(dialog).getByTestId("print-option-rows"), "page");
    await waitFor(() => expect(srcDoc()).toContain("Totaal (deze pagina)"));
    // rows 1 to 10 on the first page: 55
    expect(srcDoc()).toMatch(/<td>Totaal \(deze pagina\)<\/td><td>€\s55,00<\/td>/);
  });
});

describe("Totaalregel in the builder", () => {
  function renderBuilder() {
    const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
    return render(<QueryClientProvider client={client}><ReportBuilder /></QueryClientProvider>);
  }
  let executeBody: any = null;
  function installFetch(result: any[] = []) {
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      if (path === "/api/reports/execute") {
        executeBody = JSON.parse(init.body);
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  }

  it("offers Som, Gemiddelde and Aantal on a number column, and Aantal only on text", async () => {
    const user = userEvent.setup();
    installFetch();
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-expenses"));
    await user.click(screen.getByTestId("button-add-field-amount"));
    await user.click(screen.getByTestId("button-add-field-description"));
    await user.click(screen.getByTestId("select-column-total-0"));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Geen", "Som", "Gemiddelde", "Aantal"]);
    await user.click(screen.getByRole("option", { name: "Som" }));
    await user.click(screen.getByTestId("select-column-total-1"));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Geen", "Aantal"]);
  });

  it("sends totals, and shows the total row in the results with the CSV ending in Totaal", async () => {
    const user = userEvent.setup();
    installFetch([{ amount: "10", description: "a" }, { amount: null, description: "b" }, { amount: "5", description: "c" }]);
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-expenses"));
    await user.click(screen.getByTestId("button-add-field-description"));
    await user.click(screen.getByTestId("button-add-field-amount"));
    await user.click(screen.getByTestId("select-column-total-1"));
    await user.click(await screen.findByRole("option", { name: "Som" }));
    await user.click(screen.getByTestId("button-run-report"));
    const dialog = await screen.findByTestId("dialog-report-results");
    expect(executeBody.totals).toEqual({ amount: "SUM" });
    expect(within(dialog).getByTestId("row-report-totals")).toHaveTextContent("Totaal");
    expect(within(dialog).getByTestId("row-report-totals")).toHaveTextContent("15,00");
    await user.click(within(dialog).getByTestId("button-export-report-csv"));
    const body = csvSpy.mock.calls[0][2];
    expect(body[body.length - 1]).toEqual(["Totaal", "15,00"]);
  });
});
