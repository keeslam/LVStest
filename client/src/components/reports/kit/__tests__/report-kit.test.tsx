/**
 * Rapporten fase 2, Task 2 - the client report kit: tiles are buttons, the detail
 * dialog asks the server for one page at a time and sorts on the server, CSV
 * fetches every row through /export, and the print HTML escapes user text.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/lib/csv", async (orig) => ({ ...(await orig<typeof import("@/lib/csv")>()), downloadCsv: vi.fn() }));

import { downloadCsv } from "@/lib/csv";
import { ReportTiles } from "@/components/reports/kit/report-tiles";
import { ReportDetailDialog, type ReportColumn } from "@/components/reports/kit/report-detail-dialog";
import { ReportBreakdownTable } from "@/components/reports/kit/report-breakdown-table";
import { ReportMonthChart } from "@/components/reports/kit/report-month-chart";
import { reportTableHtml } from "@/lib/report-table-print";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
function pathOf(input: unknown): string {
  const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return url.replace(/^https?:\/\/[^/]+/, "");
}
const fetchedPaths = () => fetchMock.mock.calls.map(([input]) => pathOf(input));
const rowPaths = () => fetchedPaths().filter((p) => p.startsWith("/api/reports/x/rows"));
const lastPath = () => rowPaths()[rowPaths().length - 1];

interface Row { id: number; date: string; amount: number }
const ROW: Row = { id: 1, date: "2026-03-01", amount: 12.5 };

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/x/rows")) return json({ rows: [ROW], total: 1, page: 1, pageSize: 50 });
    if (path.startsWith("/api/reports/x/export")) return json({ rows: [ROW], truncated: false });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(downloadCsv).mockClear();
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

const COLUMNS: ReportColumn<Row, "date" | "amount">[] = [
  { id: "date", label: "Datum", sortKey: "date", cell: (r) => r.date, csv: () => "01-03-2026" },
  { id: "amount", label: "Bedrag", sortKey: "amount", align: "right", cell: (r) => String(r.amount), csv: () => "12,50" },
];

/** Rows answer with 120 rows in total, so the pager shows and page 2 exists. */
function manyRows() {
  fetchMock.mockImplementation(async (input: unknown) => {
    const path = pathOf(input);
    const q = new URLSearchParams(path.split("?")[1] ?? "");
    if (path.startsWith("/api/reports/x/rows")) {
      return json({ rows: [ROW], total: 120, page: Number(q.get("page")), pageSize: Number(q.get("pageSize")) });
    }
    return json({ rows: [ROW], truncated: false });
  });
}

function dialog(tile = "a", open = true) {
  return (
    <ReportDetailDialog<Row, "date" | "amount">
      open={open}
      onOpenChange={() => {}}
      title="Details"
      endpoint="/api/reports/x"
      params={{ from: "2026-01-01", to: "2026-12-31" }}
      tile={tile}
      columns={COLUMNS}
      defaultSort={{ key: "date", dir: "desc" }}
      rowKey={(r) => r.id}
      csvSubject="x-subject"
      reportName="x"
      testId="x"
    />
  );
}

function renderKept(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return { rerender: (next: React.ReactNode) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}

function openDialog() {
  return withClient(
    <ReportDetailDialog<Row, "date" | "amount">
      open
      onOpenChange={() => {}}
      title="Details"
      endpoint="/api/reports/x"
      params={{ from: "2026-01-01", to: "2026-12-31" }}
      tile="a"
      columns={COLUMNS}
      defaultSort={{ key: "date", dir: "desc" }}
      rowKey={(r) => r.id}
      csvSubject="x-subject"
      reportName="x"
      testId="x"
    />,
  );
}

describe("report kit", () => {
  it("een tegel is een knop die zijn id doorgeeft", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ReportTiles testIdPrefix="t" tiles={[{ id: "legacy", label: "Oud", value: "2" }]} onOpen={onOpen} />);
    const tile = screen.getByTestId("button-t-tile-legacy");
    expect(tile.tagName).toBe("BUTTON");
    expect(tile).toHaveAttribute("type", "button");
    await user.click(tile);
    expect(onOpen).toHaveBeenCalledWith("legacy");
  });

  it("de dialoog vraagt één pagina van de server en sorteert opnieuw", async () => {
    const user = userEvent.setup();
    openDialog();
    await waitFor(() => expect(lastPath()).toBe("/api/reports/x/rows?from=2026-01-01&to=2026-12-31&tile=a&sort=date&dir=desc&page=1&pageSize=50"));
    expect(await screen.findByText("2026-03-01")).toBeInTheDocument();
  });

  it("sorteren zet de dialoog terug op pagina 1", async () => {
    manyRows();
    const user = userEvent.setup();
    renderKept(dialog());
    await screen.findByText("2026-03-01");
    await user.click(screen.getByTestId("pager-x-next-page"));
    await waitFor(() => expect(lastPath()).toContain("sort=date&dir=desc&page=2&pageSize=50"));
    await user.click(screen.getByTestId("sort-x-amount"));
    await waitFor(() => expect(lastPath()).toBe("/api/reports/x/rows?from=2026-01-01&to=2026-12-31&tile=a&sort=amount&dir=asc&page=1&pageSize=50"));
  });

  it("een andere paginagrootte zet de dialoog terug op pagina 1", async () => {
    manyRows();
    const user = userEvent.setup();
    renderKept(dialog());
    await screen.findByText("2026-03-01");
    await user.click(screen.getByTestId("pager-x-next-page"));
    await waitFor(() => expect(lastPath()).toContain("page=2&pageSize=50"));
    await user.selectOptions(screen.getByTestId("pager-x-page-size"), "25");
    await waitFor(() => expect(lastPath()).toContain("page=1&pageSize=25"));
  });

  it("een andere tegel in dezelfde dialoog begint opnieuw: standaardsortering, pagina 1", async () => {
    manyRows();
    const user = userEvent.setup();
    const { rerender } = renderKept(dialog("a"));
    await screen.findByText("2026-03-01");
    await user.click(screen.getByTestId("pager-x-next-page"));
    await user.click(screen.getByTestId("sort-x-amount"));
    await user.click(screen.getByTestId("pager-x-next-page"));
    await waitFor(() => expect(lastPath()).toContain("tile=a&sort=amount&dir=asc&page=2"));
    const before = rowPaths().length;
    rerender(dialog("b"));
    await waitFor(() => expect(lastPath()).toBe("/api/reports/x/rows?from=2026-01-01&to=2026-12-31&tile=b&sort=date&dir=desc&page=1&pageSize=50"));
    // No request for tile b with the old page or sort went out first.
    expect(rowPaths().slice(before).every((p) => p.includes("sort=date&dir=desc&page=1"))).toBe(true);
  });

  it("opnieuw openen begint opnieuw: standaardsortering, pagina 1", async () => {
    manyRows();
    const user = userEvent.setup();
    const { rerender } = renderKept(dialog("a"));
    await screen.findByText("2026-03-01");
    await user.click(screen.getByTestId("sort-x-amount"));
    await user.click(screen.getByTestId("pager-x-next-page"));
    await waitFor(() => expect(lastPath()).toContain("sort=amount&dir=asc&page=2"));
    rerender(dialog("a", false));
    const before = rowPaths().length;
    rerender(dialog("a", true));
    await waitFor(() => expect(rowPaths().length).toBeGreaterThan(before));
    expect(rowPaths().slice(before).every((p) => p.endsWith("tile=a&sort=date&dir=desc&page=1&pageSize=50"))).toBe(true);
  });

  it("CSV haalt alle rijen via /export", async () => {
    const user = userEvent.setup();
    openDialog();
    await screen.findByText("2026-03-01");
    await user.click(screen.getByTestId("button-x-csv"));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    expect(fetchedPaths()).toContain("/api/reports/x/export?from=2026-01-01&to=2026-12-31&tile=a&sort=date&dir=desc");
    expect(downloadCsv).toHaveBeenCalledWith("x-subject", ["Datum", "Bedrag"], [["01-03-2026", "12,50"]]);
  });

  it("een lege pagina toont de lege tekst", async () => {
    fetchMock.mockImplementation(async () => json({ rows: [], total: 0, page: 1, pageSize: 50 }));
    openDialog();
    expect(await screen.findByTestId("x-empty")).toBeInTheDocument();
  });

  it("afdrukken escapet gebruikerstekst", () => {
    const html = reportTableHtml({ title: "T", subtitle: "S", header: ["Omschrijving"], rows: [["<script>x</script>"]] });
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>x");
  });

  it("de uitsplitsing toont de naam voor 'geen' en de bedragen", () => {
    render(
      <ReportBreakdownTable
        title="Per klant"
        nullLabel="Geen klant"
        money
        testId="b"
        rows={[{ key: 1, label: "Jansen", count: 2, amount: 50 }, { key: null, label: null, count: 1, amount: 10 }]}
      />,
    );
    expect(screen.getByText("Jansen")).toBeInTheDocument();
    expect(screen.getByText("Geen klant")).toBeInTheDocument();
    expect(screen.getByText("€ 50,00")).toBeInTheDocument();
  });

  it("een lege grafiek toont 'geen gegevens'", () => {
    render(<ReportMonthChart data={[]} series={[{ key: "a", label: "A", color: "#000" }]} testId="c" />);
    expect(screen.getByTestId("c-empty")).toBeInTheDocument();
  });
});
