/**
 * Reports redesign parts 3-4, final fix wave (client): a run cut at 1000 rows says so (note, totals
 * label, CSV, print), the same field with two aggregations stays two columns, headings are the
 * same in the builder and on a tab, a percent has no Som, the calculated-field dialog offers only
 * the main source and its links.
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

import ReportBuilder, { aggregationsFor, calcPickableFields } from "@/pages/reports/report-builder";
import { computeTotals, csvCell, displayCell, outputHeader, resultKey, unpackExecuteResult, type OutputColumn } from "@/pages/reports/report-builder-output";
import { SavedReportView, type SavedReport } from "@/pages/reports/saved-report-view";
import { ReportFiltersProvider } from "@/pages/reports/report-filters";
import { ReportPrintProvider, PrintButtonInner } from "@/components/reports/kit/report-print";

const NOTE = "Eerste 1000 regels — het totaal is niet volledig.";
const tNl = i18n.getFixedT("nl", "reports") as any;
const sumCol: OutputColumn = { table: "expenses", field: "amount", label: "Bedrag", aggregation: "SUM" };
const avgCol: OutputColumn = { table: "expenses", field: "amount", label: "Bedrag", aggregation: "AVG" };

beforeEach(() => csvSpy.mockClear());
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

describe("the result of a run", () => {
  it("unpacks { rows, truncated } and still reads a plain list", () => {
    expect(unpackExecuteResult({ rows: [{ a: 1 }], truncated: true })).toEqual({ rows: [{ a: 1 }], truncated: true });
    expect(unpackExecuteResult([{ a: 1 }])).toEqual({ rows: [{ a: 1 }], truncated: false });
    expect(unpackExecuteResult(null)).toEqual({ rows: [], truncated: false });
  });
});

describe("one field, two aggregations", () => {
  it("keys an aggregated column with its aggregation, so Som and Gemiddelde do not share a result", () => {
    expect(resultKey(sumCol)).toBe("amount.SUM");
    expect(resultKey(avgCol)).toBe("amount.AVG");
    expect(resultKey({ ...sumCol, via: "vehicle", field: "price" })).toBe("vehicle.price.SUM");
    expect(resultKey({ field: "", calc: "p", aggregation: "AVG" })).toBe("calc.p.AVG");
    expect(resultKey({ field: "amount" })).toBe("amount");
  });

  it("totals of the two columns are separate", () => {
    const rows = [{ "amount.SUM": "10", "amount.AVG": "2" }, { "amount.SUM": "20", "amount.AVG": "4" }];
    expect(computeTotals(rows, [sumCol, avgCol], { "amount.SUM": "SUM", "amount.AVG": "COUNT" })).toEqual({ "amount.SUM": 30, "amount.AVG": 2 });
  });
});

describe("column headings", () => {
  it("name the aggregation, the same for the builder and a tab", () => {
    expect(outputHeader(tNl, [sumCol, avgCol])).toEqual(["Bedrag (Som)", "Bedrag (Gemiddelde)"]);
    expect(outputHeader(tNl, [{ table: "expenses", field: "amount", label: "Bedrag" }])).toEqual(["Bedrag"]);
  });
});

describe("percent fields", () => {
  const pct = { id: "p", name: "Marge", kind: "formula", type: "percent", formula: { kind: "number", value: 1 } } as any;
  const money = { ...pct, id: "m", type: "money" };
  it("offer Gemiddelde, Kleinste and Grootste but no Som", () => {
    const aggs = aggregationsFor({ table: "", field: "", calc: "p", label: "Marge" } as any, [pct]);
    expect(aggs).not.toContain("SUM");
    expect(aggs).toEqual(expect.arrayContaining(["AVG", "MIN", "MAX"]));
    expect(aggregationsFor({ table: "", field: "", calc: "m", label: "x" } as any, [money])).toContain("SUM");
  });
});

describe("the calculated-field dialog", () => {
  it("offers the fields of the main source and its links, not a second ticked source", () => {
    const admin = { role: UserRole.ADMIN, permissions: [] } as any;
    const fields = calcPickableFields(admin, ["fines", "vehicles"]);
    expect(fields.some((f) => !f.via && f.field.table === "fines")).toBe(true);
    expect(fields.some((f) => f.via === "vehicle")).toBe(true);
    expect(fields.some((f) => !f.via && f.field.table === "vehicles")).toBe(false);
  });
});

const savedReport: SavedReport = {
  id: 9, name: "Kosten",
  configuration: {
    name: "Kosten", dataSources: ["expenses"], filters: [], groupBy: [],
    columns: [{ table: "expenses", field: "amount", label: "Bedrag", aggregation: "SUM" }],
    totals: { "amount.SUM": "SUM" },
  } as any,
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
}

describe("a run cut at 1000 rows on a tab", () => {
  function renderSaved(truncated: boolean) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ rows: [{ "amount.SUM": "10" }, { "amount.SUM": "5" }], truncated }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    return render(
      <QueryClientProvider client={client()}>
        <ReportFiltersProvider><ReportPrintProvider>
          <PrintButtonInner title="Kosten" />
          <SavedReportView report={savedReport} />
        </ReportPrintProvider></ReportFiltersProvider>
      </QueryClientProvider>,
    );
  }

  it("says so above the table, labels the total, and puts the note in the CSV and on paper", async () => {
    const user = userEvent.setup();
    renderSaved(true);
    expect(await screen.findByTestId("report-truncated-note")).toHaveTextContent(NOTE);
    const total = await screen.findByTestId("saved-report-table-totals");
    expect(total).toHaveTextContent("Totaal (eerste 1000 regels)");
    expect(total).toHaveTextContent("15,00");
    expect(screen.getByRole("columnheader", { name: /Bedrag \(Som\)/ })).toBeInTheDocument();
    await user.click(screen.getByTestId("button-saved-report-csv"));
    const [, header, body] = csvSpy.mock.calls[0];
    expect(header).toEqual(["Bedrag (Som)"]);
    expect(body[body.length - 2][0]).toContain("Totaal (eerste 1000 regels)");
    expect(body[body.length - 1]).toEqual([NOTE]);
    await user.click(await screen.findByTestId("button-report-print"));
    await screen.findByTestId("dialog-report-print");
    const srcDoc = () => (screen.getByTestId("print-preview-frame") as HTMLIFrameElement).getAttribute("srcdoc") ?? "";
    await waitFor(() => expect(srcDoc()).toContain(NOTE));
  });

  it("says nothing when the list is complete", async () => {
    renderSaved(false);
    const total = await screen.findByTestId("saved-report-table-totals");
    expect(total).toHaveTextContent("Totaal");
    expect(total).not.toHaveTextContent("eerste 1000");
    expect(screen.queryByTestId("report-truncated-note")).toBeNull();
  });
});

describe("a run cut at 1000 rows in the builder", () => {
  it("shows the note, the truncated total label, the same heading and the note in the CSV", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      const body = url.endsWith("/api/reports/execute") ? { rows: [{ "amount.SUM": "10" }], truncated: true } : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    render(<QueryClientProvider client={client()}><ReportBuilder /></QueryClientProvider>);
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-expenses"));
    await user.click(screen.getByTestId("button-add-field-amount"));
    await user.click(screen.getByTestId("select-column-aggregation-0"));
    await user.click(await screen.findByRole("option", { name: "Som" }));
    await user.click(screen.getByTestId("select-column-total-0"));
    await user.click(await screen.findByRole("option", { name: "Som" }));
    await user.click(screen.getByTestId("button-run-report"));
    const dialog = await screen.findByTestId("dialog-report-results");
    expect(within(dialog).getByTestId("report-truncated-note")).toHaveTextContent(NOTE);
    expect(within(dialog).getByTestId("row-report-totals")).toHaveTextContent("Totaal (eerste 1000 regels)");
    expect(within(dialog).getByRole("columnheader", { name: "Bedrag (Som)" })).toBeInTheDocument();
    await user.click(within(dialog).getByTestId("button-export-report-csv"));
    const [, header, body] = csvSpy.mock.calls[0];
    expect(header).toEqual(["Bedrag (Som)"]);
    expect(body[body.length - 1]).toEqual([NOTE]);
    // Afdrukken is the print dialog of the reports: rows choice, the note and the total in the document.
    await user.click(within(dialog).getByTestId("button-report-print"));
    const frame = await screen.findByTestId("print-preview-frame");
    await waitFor(() => expect(frame.getAttribute("srcdoc") ?? "").toContain(NOTE));
    expect(frame.getAttribute("srcdoc")).toContain("Totaal (eerste 1000 regels)");
    expect(screen.getByTestId("print-option-rows")).toBeInTheDocument();
    expect(screen.queryByTestId("print-option-tiles")).toBeNull();
  });
});

describe("plain number and status cells", () => {
  const col = (table: string, field: string): OutputColumn => ({ table, field, label: field });
  it("shows an amount as money, a number with Dutch separators, and an id as it is", () => {
    expect(displayCell(tNl, col("reservations", "totalPrice"), "104.00").replace(/\s/g, " ")).toBe("€ 104,00");
    expect(displayCell(tNl, col("expenses", "amount"), 1234.5).replace(/\s/g, " ")).toBe("€ 1.234,50");
    expect(displayCell(tNl, col("vehicles", "currentMileage"), "123456")).toBe("123.456");
    expect(displayCell(tNl, col("customers", "corporateDiscount"), "7.50")).toBe("7,5");
    expect(displayCell(tNl, col("vehicles", "id"), "1234")).toBe("1234");
    expect(displayCell(tNl, col("fines", "vehicleId"), "1234")).toBe("1234");
  });
  it("leaves the CSV as it was", () => {
    expect(csvCell(tNl, col("reservations", "totalPrice"), "104.00")).toBe("104,00");
  });
  it("shows the transport status in words, on screen and in the CSV", () => {
    const status = col("vehicle_transports", "status");
    expect(displayCell(tNl, status, "scheduled")).toBe("Gepland");
    expect(csvCell(tNl, status, "in_progress")).toBe("Onderweg");
    expect(displayCell(tNl, status, "odd")).toBe("odd");
    expect(displayCell(tNl, col("fines", "status"), "new")).toBe("new");
  });
});
