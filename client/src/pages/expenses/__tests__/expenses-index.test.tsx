/**
 * Kostenoverzicht (2026-10-16) for thousands of rows: a section per category
 * with its newest five and a dialog for the rest, or one paged and sortable
 * table; the server does the sorting, paging and summing, so the page only
 * ever asks for one page while counts and sums span the whole selection; the
 * CSV export takes the whole selection, not the page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));
const openExpenseDialog = vi.fn();
vi.mock("@/contexts/GlobalDialogContext", () => ({ useGlobalDialog: () => ({ openExpenseDialog }) }));
vi.mock("@/components/invoice-scanner", () => ({ InvoiceScanner: () => null }));
vi.mock("@/components/expenses/invoice-inbox-dialog", () => ({ InvoiceInboxButton: () => null }));
vi.mock("@/components/expenses/expense-add-dialog", () => ({ ExpenseAddDialog: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/recycle-bin/recycle-bin-dialog", () => ({ RecycleBinDialog: () => null }));
const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/csv")>()), downloadCsv: (...args: unknown[]) => downloadCsv(...args) }));

import ExpensesIndex from "@/pages/expenses/index";

const pad = (n: number) => String(n).padStart(2, "0");
/** 120 rows: five "tires", the rest fuel and toll in turns, dated through 2026, amounts 1.50 upward. */
const ROWS = Array.from({ length: 120 }, (_, i) => {
  const vehicleId = (i % 3) + 1;
  return {
    id: i + 1,
    vehicleId,
    category: i < 5 ? "tires" : i % 2 ? "fuel" : "toll",
    amount: ((i + 1) * 1.5).toFixed(2),
    date: `2026-${pad(1 + (i % 12))}-${pad(1 + (i % 28))}`,
    description: `Post ${i + 1}`,
    vehicle: { id: vehicleId, licensePlate: `AA-00${vehicleId}-B`, brand: "Opel", model: "Vivaro" },
  };
});
type Row = typeof ROWS[number];
const cents = (rows: Row[]) => rows.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);

/** A tiny GET /api/expenses in memory: the same filters, sort, paging and summary the server offers. */
function select(params: URLSearchParams): Row[] {
  let rows = ROWS.slice();
  const q = params.get("q")?.toLowerCase();
  if (q) rows = rows.filter((r) => r.description.toLowerCase().includes(q) || r.category.includes(q) || `${r.vehicle.brand} ${r.vehicle.model}`.toLowerCase().includes(q) || r.vehicle.licensePlate.replace(/-/g, "").toLowerCase().includes(q.replace(/-/g, "")));
  if (params.get("category")) rows = rows.filter((r) => r.category === params.get("category"));
  if (params.get("vehicleId")) rows = rows.filter((r) => String(r.vehicleId) === params.get("vehicleId"));
  if (params.get("from")) rows = rows.filter((r) => r.date >= params.get("from")!);
  if (params.get("to")) rows = rows.filter((r) => r.date <= params.get("to")!);
  const sort = params.get("sort") ?? "date";
  const dir = params.get("dir") === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const c = sort === "amount" ? Number(a.amount) - Number(b.amount)
      : sort === "category" ? a.category.localeCompare(b.category)
      : sort === "description" ? a.description.localeCompare(b.description)
      : sort === "plate" ? a.vehicle.licensePlate.localeCompare(b.vehicle.licensePlate)
      : a.date.localeCompare(b.date) || a.id - b.id;
    return c * dir;
  });
  return rows;
}

const requested: string[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  requested.length = 0;
  downloadCsv.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url, "http://localhost");
    requested.push(url.pathname + url.search);
    const params = url.searchParams;
    if (url.pathname === "/api/expenses/facets") {
      return json({ vehicles: [1, 2, 3].map((id) => ({ id, licensePlate: `AA-00${id}-B`, brand: "Opel", model: "Vivaro" })), categories: ["fuel", "tires", "toll"] });
    }
    if (url.pathname === "/api/expenses/summary") {
      const rows = select(params);
      const recent = Number(params.get("recent") ?? "5");
      const groups = new Map<string, Row[]>();
      for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
      const byCategory = [...groups.entries()]
        .map(([category, items]) => ({ category, count: items.length, amount: cents(items) / 100, recent: items.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, recent) }))
        .sort((a, b) => b.amount - a.amount);
      return json({ total: rows.length, totalAmount: cents(rows) / 100, byCategory });
    }
    if (url.pathname === "/api/expenses") {
      const rows = select(params);
      if (!params.has("page") && !params.has("pageSize")) return json(rows);
      const page = Number(params.get("page") ?? "1");
      const pageSize = Number(params.get("pageSize") ?? "50");
      return json({ rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, totalAmount: cents(rows) / 100, page, pageSize });
    }
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ExpensesIndex />
    </QueryClientProvider>,
  );
}
const lastListRequest = () => requested.filter((r) => r.startsWith("/api/expenses?")).pop() ?? "";
const lastSummaryRequest = () => requested.filter((r) => r.startsWith("/api/expenses/summary")).pop() ?? "";

describe("Kostenoverzicht per categorie", () => {
  it("shows a folded section per category; a click unfolds at most five rows, the sum over the whole category, and a button for the rest", async () => {
    const user = userEvent.setup();
    renderPage();
    const fuel = await screen.findByTestId("expense-section-fuel");
    const fuelRows = ROWS.filter((r) => r.category === "fuel");
    // Folded: headline with count and sum, no rows.
    expect(within(fuel).queryAllByTestId(/^section-fuel-expense-/)).toHaveLength(0);
    expect(within(fuel).getByTestId("button-expense-section-toggle-fuel")).toHaveAttribute("aria-expanded", "false");
    await user.click(within(fuel).getByTestId("button-expense-section-toggle-fuel"));
    expect(within(fuel).getByTestId("button-expense-section-toggle-fuel")).toHaveAttribute("aria-expanded", "true");
    expect(within(fuel).getAllByTestId(/^section-fuel-expense-/)).toHaveLength(5);
    expect(within(fuel).getByText(`(${fuelRows.length} kostenposten)`)).toBeInTheDocument();
    expect(within(fuel).getByTestId("expense-section-total-fuel")).toHaveTextContent("5.481,00");
    expect(within(fuel).getByTestId("button-expense-section-all-fuel")).toHaveTextContent(`Alle ${fuelRows.length} tonen`);
    // Five tyres rows: every one is on screen once unfolded, so no button. A second click folds again.
    const tires = screen.getByTestId("expense-section-tires");
    await user.click(within(tires).getByTestId("button-expense-section-toggle-tires"));
    expect(within(tires).getAllByTestId(/^section-tires-expense-/)).toHaveLength(5);
    expect(within(tires).queryByTestId("button-expense-section-all-tires")).toBeNull();
    await user.click(within(tires).getByTestId("button-expense-section-toggle-tires"));
    expect(within(tires).queryAllByTestId(/^section-tires-expense-/)).toHaveLength(0);
    expect(within(fuel).getAllByTestId(/^section-fuel-expense-/)).toHaveLength(5);
    // The page never asked for the whole list.
    expect(requested.some((r) => r === "/api/expenses")).toBe(false);
    // The count and sum above the sections span the whole selection.
    expect(screen.getByTestId("expense-selection-summary")).toHaveTextContent("120 kostenposten");
    expect(screen.getByTestId("expense-total")).toHaveTextContent("10.890,00");
  });

  it("opens the whole category in a dialog with a paged table, scoped to that category", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-expense-section-toggle-toll"));
    await user.click(await screen.findByTestId("button-expense-section-all-toll"));
    const dialog = await screen.findByTestId("expense-category-dialog");
    expect(within(dialog).getByRole("heading", { name: "Tol" })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getAllByTestId(/^row-expense-/)).toHaveLength(25));
    expect(lastListRequest()).toContain("category=toll");
    expect(lastListRequest()).toContain("page=1");
    const tollCount = ROWS.filter((r) => r.category === "toll").length;
    expect(within(dialog).getByTestId("expenses-toll-rows-shown")).toHaveTextContent(`25 van ${tollCount} getoond`);
    await user.click(within(dialog).getByTestId("expenses-toll-next-page"));
    await waitFor(() => expect(lastListRequest()).toContain("page=2"));
    expect(lastListRequest()).toContain("category=toll");
  });
});

describe("zoeken en sorteren in de kop van de categoriedialoog", () => {
  it("the dialog search and sort picker go to the server, scoped to the category, and the column headers follow the picker", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-expense-section-toggle-fuel"));
    await user.click(await screen.findByTestId("button-expense-section-all-fuel"));
    const dialog = await screen.findByTestId("expense-category-dialog");
    await waitFor(() => expect(within(dialog).getAllByTestId(/^row-expense-/)).toHaveLength(25));
    await user.type(within(dialog).getByTestId("expense-dialog-search"), "Post 1");
    await waitFor(() => expect(lastListRequest()).toContain("category=fuel&q=Post+1&sort=date&dir=desc&page=1"));
    // "Post 1", "Post 10".., "Post 100".. of the fuel rows (odd ids from 6 on): 1x..
    const fuelMatches = ROWS.filter((r) => r.category === "fuel" && r.description.includes("Post 1")).length;
    await waitFor(() => expect(within(dialog).getByTestId("expenses-fuel-rows-shown")).toHaveTextContent(`van ${fuelMatches} getoond`));
    await user.selectOptions(within(dialog).getByTestId("expense-dialog-sort"), "amount:desc");
    await waitFor(() => expect(lastListRequest()).toContain("q=Post+1&sort=amount&dir=desc&page=1"));
    expect(within(dialog).getByTestId("sort-expenses-fuel-amount").closest("th")).toHaveAttribute("aria-sort", "descending");
    // A click on a column header is reflected in the picker.
    await user.click(within(dialog).getByTestId("sort-expenses-fuel-date"));
    await waitFor(() => expect(lastListRequest()).toContain("sort=date&dir=desc"));
    expect((within(dialog).getByTestId("expense-dialog-sort") as HTMLSelectElement).value).toBe("date:desc");
  });
});

describe("Kostenoverzicht als tabel", () => {
  it("sorts on the server by column header, both directions, and pages from 1 again", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-view-table"));
    await waitFor(() => expect(screen.getAllByTestId(/^row-expense-/)).toHaveLength(50));
    expect(lastListRequest()).toContain("sort=date&dir=desc&page=1&pageSize=50");
    await user.click(screen.getByTestId("expenses-next-page"));
    await waitFor(() => expect(lastListRequest()).toContain("page=2"));
    await user.click(screen.getByTestId("sort-expenses-amount"));
    await waitFor(() => expect(lastListRequest()).toContain("sort=amount&dir=asc&page=1"));
    const first = screen.getAllByTestId(/^row-expense-/)[0];
    expect(first).toHaveTextContent("1,50");
    await user.click(screen.getByTestId("sort-expenses-amount"));
    await waitFor(() => expect(lastListRequest()).toContain("sort=amount&dir=desc&page=1"));
    await waitFor(() => expect(screen.getAllByTestId(/^row-expense-/)[0]).toHaveTextContent("180,00"));
    expect(screen.getByTestId("expenses-rows-shown")).toHaveTextContent("50 van 120 getoond");
  });

  it("a row is one line: short date, bold plate, badge, cut-off description with tooltip", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("button-view-table"));
    const row = await screen.findByTestId("row-expense-120");
    expect(row).toHaveTextContent("08-12-2026");
    expect(within(row).getByText("AA-003-B")).toHaveClass("font-semibold");
    expect(within(row).getByText("Post 120")).toHaveAttribute("title", "Post 120");
    expect(within(row).getByText("Post 120")).toHaveClass("truncate");
  });
});

describe("filters, periods and export", () => {
  it("the search goes to the server and narrows the summary and the sections", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("expense-section-fuel");
    await user.type(screen.getByTestId("expense-search"), "Post 11");
    await waitFor(() => expect(lastSummaryRequest()).toContain("q=Post+11"));
    // Post 11, Post 110 … Post 119: eleven rows.
    await waitFor(() => expect(screen.getByTestId("expense-selection-summary")).toHaveTextContent("11 kostenposten"));
  });

  it("a quick period fills the bounds, a second click clears them again", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("expense-section-fuel");
    await user.click(screen.getByTestId("button-period-thisYear"));
    const year = new Date().getFullYear();
    await waitFor(() => expect(lastSummaryRequest()).toContain(`from=${year}-01-01&to=${year}-12-31`));
    expect(screen.getByTestId("button-period-thisYear")).toHaveAttribute("aria-pressed", "true");
    expect((screen.getByLabelText("Van") as HTMLInputElement).value).toBe(`${year}-01-01`);
    await user.click(screen.getByTestId("button-period-thisYear"));
    await waitFor(() => expect(lastSummaryRequest()).not.toContain("from="));
  });

  it("the CSV export asks for the whole selection without a page and writes every row", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("expense-section-fuel");
    await user.click(await screen.findByTestId("button-expense-section-toggle-fuel"));
    await user.click(await screen.findByTestId("button-expense-section-all-fuel"));
    await screen.findByTestId("expense-category-dialog");
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("button-export-expenses"));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const exportRequest = requested.filter((r) => r.startsWith("/api/expenses?") && !r.includes("page")).pop();
    expect(exportRequest).toBe("/api/expenses?sort=date&dir=desc");
    const [, , rows] = downloadCsv.mock.calls[0] as [string, string[], string[][]];
    expect(rows).toHaveLength(120);
    // Newest date in the fixture is 28-12-2026 (Post 84).
    expect(rows[0]).toEqual(["28-12-2026", "AA-003-B", "Brandstof", "Post 84", "126,00"]);
  });
});
