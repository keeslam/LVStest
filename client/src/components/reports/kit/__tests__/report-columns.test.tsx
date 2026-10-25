/**
 * Rapporten herontwerp deel 3, Task 3: the Kolommen button of the fixed reports. Hiding a column
 * removes it from the table, the print and the CSV and is kept per user in `report_columns`;
 * "Terug naar standaard" removes the report's key; extra fields (make of the car) come from
 * /api/vehicles, only with the vehicles right; a stored unknown column id does no harm.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserPermission, UserRole } from "@shared/schema";
import type { PrintSection } from "@/components/reports/kit/report-print";
import { installFetch, renderWithClient, vehicle, daysFromNow, openReport, capturePrints } from "@/pages/reports/__tests__/p7a-harness";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough, Pie: Passthrough,
    ComposedChart: Passthrough, AreaChart: Passthrough, Area: () => null,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});
const downloadCsv = vi.fn(() => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: any[]) => (downloadCsv as any)(...a),
}));
const captured = vi.hoisted(() => ({ sections: null as PrintSection[] | null }));
vi.mock("@/components/reports/kit/report-print", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/reports/kit/report-print")>();
  return {
    ...actual,
    useReportPrint: (sections: PrintSection[] | null) => {
      captured.sections = sections;
      actual.useReportPrint(sections);
    },
  };
});

import ReportsPage from "@/pages/reports/index";

afterEach(() => {
  vi.unstubAllGlobals();
  role = UserRole.ADMIN;
  permissions = [];
  downloadCsv.mockClear();
  captured.sections = null;
});

const fleet = [vehicle(1, "AA01BB", "Volvo", "V60"), vehicle(2, "AA02BB", "Ford", "Focus")];
const expenses = [
  { id: 1, vehicleId: 1, category: "fuel", amount: "40.00", date: daysFromNow(0), description: "tanken" },
  { id: 2, vehicleId: 2, category: "toll", amount: "5.00", date: daysFromNow(0), description: "tol" },
];

/** The fixture plus a stored `report_columns` value; returns the PUT bodies of that setting. */
function setup(stored: unknown = null, opts: { failGet?: boolean } = {}) {
  const { calls } = installFetch({ vehicles: fleet, expenses, extra: { "/api/user-settings/report_columns": stored === null ? null : { value: stored } } });
  const inner = globalThis.fetch as any;
  const puts: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (init?.method === "PUT" && url.includes("/api/user-settings/report_columns")) puts.push(JSON.parse(String(init.body)));
    if (opts.failGet && (init?.method ?? "GET") === "GET" && url.includes("/api/user-settings/report_columns")) {
      return new Response(JSON.stringify({ message: "kapot" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    return inner(input, init);
  }));
  return { puts, calls };
}

const headers = (table: HTMLElement) => within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim());
const printHeader = () => (captured.sections?.find((s) => s.kind === "table") as Extract<PrintSection, { kind: "table" }> | undefined)?.header;

describe("Kolommen: APK-overzicht", () => {
  it("kolom Model uitzetten haalt hem uit tabel en afdruk en onthoudt dat; Terug naar standaard zet hem terug", async () => {
    const { puts } = setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "apk-overview");
    const table = await screen.findByTestId("apk-overview-table");
    await waitFor(() => expect(headers(table)).toContain("Model"));

    await user.click(within(table).getByTestId("button-report-columns"));
    await user.click(await screen.findByTestId("report-column-toggle-model"));

    await waitFor(() => expect(headers(table)).not.toContain("Model"));
    expect(headers(table)).toContain("Merk");
    await waitFor(() => expect(printHeader()).toEqual(headers(table)));
    await waitFor(() => expect(puts.at(-1)).toEqual({ value: { "apk-overview": { hidden: ["model"], extra: [] } } }));

    await user.click(screen.getByTestId("button-report-columns-reset"));
    await waitFor(() => expect(headers(table)).toContain("Model"));
    await waitFor(() => expect(puts.at(-1)?.value).not.toHaveProperty("apk-overview"));
    await waitFor(() => expect(printHeader()).toContain("Model"));
  });

  it("een opgeslagen keuze met een onbekende kolom-id geeft geen fout", async () => {
    setup({ "apk-overview": { hidden: ["bestaat-niet", "model"], extra: ["vehicle.weg"] }, kapot: 5 });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "apk-overview");
    const table = await screen.findByTestId("apk-overview-table");
    await waitFor(() => expect(headers(table)).not.toContain("Model"));
    expect(headers(table)).toContain("Merk");
    expect(within(table).getAllByTestId(/^apk-overview-table-row-/)).toHaveLength(2);
  });
});

describe("Kolommen: kosten in periode", () => {
  it("extra Merk aanzetten toont het merk uit /api/vehicles, ook in de afdruk", async () => {
    const { puts } = setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "expenses", "expenses-in-period");
    const table = await screen.findByTestId("expenses-in-period-table");
    await waitFor(() => expect(within(table).getAllByTestId(/^expenses-in-period-table-row-/)).toHaveLength(2));

    await user.click(within(table).getByTestId("button-report-columns"));
    await user.click(await screen.findByTestId("report-column-extra-vehicle.brand"));

    await waitFor(() => expect(headers(table)).toContain("Merk"));
    expect(within(within(table).getByTestId("expenses-in-period-table-row-1")).getByText("Volvo")).toBeInTheDocument();
    expect(within(within(table).getByTestId("expenses-in-period-table-row-2")).getByText("Ford")).toBeInTheDocument();
    await waitFor(() => expect(printHeader()).toContain("Merk"));
    expect(puts.at(-1)).toEqual({ value: { "expenses-in-period": { hidden: [], extra: ["vehicle.brand"] } } });
  });

  it("zonder voertuigrecht geen auto-extra's en geen /api/vehicles", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.MANAGE_EXPENSES];
    const { calls } = setup({ "expenses-in-period": { hidden: [], extra: ["vehicle.brand"] } });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "expenses", "expenses-in-period");
    const table = await screen.findByTestId("expenses-in-period-table");
    await waitFor(() => expect(within(table).getAllByTestId(/^expenses-in-period-table-row-/)).toHaveLength(2));
    expect(headers(table)).not.toContain("Merk");

    await user.click(within(table).getByTestId("button-report-columns"));
    expect(await screen.findByTestId("report-column-toggle-date")).toBeInTheDocument();
    expect(screen.queryByTestId(/^report-column-extra-vehicle\./)).toBeNull();
    expect(calls.some((c) => c.split("?")[0] === "/api/vehicles")).toBe(false);
  });
});

describe("Kolommen: lijst achter een getal (CSV)", () => {
  it("een verborgen kolom staat niet in de CSV", async () => {
    setup({ "legacy-rows-expenses": { hidden: ["description"], extra: ["vehicle.model"] } });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "expenses", "expenses-by-category");
    const table = await screen.findByTestId("expenses-by-category-table");
    await user.click(await within(table).findByTestId("expenses-by-category-table-row-fuel"));
    const dialog = await screen.findByTestId("dialog-legacy-rows");
    const rows = within(dialog).getByTestId("legacy-rows-table");
    await waitFor(() => expect(headers(rows)).toContain("Model"));
    expect(headers(rows)).not.toContain("Omschrijving");

    await user.click(within(dialog).getByTestId("button-legacy-rows-csv"));
    const [, header, lines] = downloadCsv.mock.calls[0] as any[];
    expect(header).not.toContain("Omschrijving");
    expect(header).toContain("Model");
    expect((lines as string[][])[0][header.indexOf("Model")]).toBe("V60");
  });
});

describe("Kolommen: lijst achter een tegel (server)", () => {
  it("CSV en afdruk volgen de gekozen kolommen, met de klantnaam als extra veld", async () => {
    const row = { id: 1, date: "2026-03-01", amount: 12.5, vehicleId: 1, customerId: 7 };
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      const path = (typeof input === "string" ? input : input?.url ?? "").replace(/^https?:\/\/[^/]+/, "");
      if (path.startsWith("/api/user-settings/report_columns")) return json({ value: { x: { hidden: ["amount"], extra: ["customer.name"] } } });
      if (path.startsWith("/api/customers")) return json([{ id: 7, name: "Klant Zeven" }]);
      if (path.startsWith("/api/reports/x/rows")) return json({ rows: [row], total: 1, page: 1, pageSize: 50 });
      if (path.startsWith("/api/reports/x/export")) return json({ rows: [row], truncated: false });
      return json(null);
    }));
    const { ReportDetailDialog } = await import("@/components/reports/kit/report-detail-dialog");
    const user = userEvent.setup();
    renderWithClient(
      <ReportDetailDialog<typeof row, "date" | "amount">
        open onOpenChange={() => {}} title="Details" endpoint="/api/reports/x"
        params={{ from: "2026-01-01", to: "2026-12-31" }} tile="a"
        columns={[
          { id: "date", label: "Datum", sortKey: "date", cell: (r) => r.date, csv: (r) => r.date },
          { id: "amount", label: "Bedrag", sortKey: "amount", cell: (r) => String(r.amount), csv: (r) => String(r.amount) },
        ]}
        links={{ vehicleId: (r) => r.vehicleId, customerId: (r) => r.customerId }}
        defaultSort={{ key: "date", dir: "desc" }} rowKey={(r) => r.id} csvSubject="x-subject" reportName="x" testId="x"
      />,
    );
    await screen.findByText("2026-03-01");
    await waitFor(() => expect(screen.getByText("Klant Zeven")).toBeInTheDocument());
    expect(screen.queryByText("Bedrag")).toBeNull();

    await user.click(screen.getByTestId("button-x-csv"));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith("x-subject", ["Datum", "Klantnaam"], [["2026-03-01", "Klant Zeven"]]));

    await user.click(screen.getByTestId("button-report-columns"));
    expect(await screen.findByTestId("report-column-extra-vehicle.brand")).toBeInTheDocument();
    expect(screen.getByTestId("report-column-toggle-date")).toBeDisabled();
  });
});

// ---- Fix round 1 ----

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const DETAIL_LINKS = { vehicleId: (r: { vehicleId: number }) => r.vehicleId, customerId: (r: { customerId: number }) => r.customerId };

/** A ReportDetailDialog on /api/reports/x; the settings GET fails when `failGet`. */
async function renderDetail(opts: { failGet?: boolean; stored?: unknown; customerId?: number } = {}) {
  const row = { id: 1, date: "2026-03-01", amount: 12.5, vehicleId: 1, customerId: opts.customerId ?? 7 };
  const paths: string[] = [];
  const puts: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: RequestInit) => {
    const path = (typeof input === "string" ? input : input?.url ?? "").replace(/^https?:\/\/[^/]+/, "");
    paths.push(path);
    if (path.startsWith("/api/user-settings/report_columns")) {
      if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return jsonResponse({}); }
      return opts.failGet ? jsonResponse({ message: "kapot" }, 500) : jsonResponse(opts.stored ? { value: opts.stored } : null);
    }
    if (path.startsWith("/api/customers")) return jsonResponse([{ id: 7, name: "Klant Zeven" }]);
    if (path.startsWith("/api/vehicles")) return jsonResponse(fleet);
    if (path.startsWith("/api/reports/x/rows")) return jsonResponse({ rows: [row], total: 1, page: 1, pageSize: 50 });
    if (path.startsWith("/api/reports/x/export")) return jsonResponse({ rows: [row], truncated: false });
    return jsonResponse(null);
  }));
  const { ReportDetailDialog } = await import("@/components/reports/kit/report-detail-dialog");
  renderWithClient(
    <ReportDetailDialog<typeof row, "date" | "amount">
      open onOpenChange={() => {}} title="Details" endpoint="/api/reports/x"
      params={{ from: "2026-01-01", to: "2026-12-31" }} tile="a"
      columns={[
        { id: "date", label: "Datum", sortKey: "date", cell: (r) => r.date, csv: (r) => r.date },
        { id: "amount", label: "Bedrag", sortKey: "amount", cell: (r) => String(r.amount), csv: (r) => String(r.amount) },
      ]}
      links={DETAIL_LINKS}
      defaultSort={{ key: "date", dir: "desc" }} rowKey={(r) => r.id} csvSubject="x-subject" reportName="x" testId="x"
    />,
  );
  await screen.findByText("2026-03-01");
  return { paths, puts };
}

describe("Kolommen: fix round 1", () => {
  it("na een mislukte laadpoging blijft de keuze alleen in deze sessie: geen PUT die andere keuzes wist", async () => {
    const { puts } = setup(null, { failGet: true });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "apk-overview");
    const table = await screen.findByTestId("apk-overview-table");
    await waitFor(() => expect(headers(table)).toContain("Model"));
    await user.click(within(table).getByTestId("button-report-columns"));
    await user.click(await screen.findByTestId("report-column-toggle-model"));
    await waitFor(() => expect(headers(table)).not.toContain("Model"));
    await new Promise((r) => setTimeout(r, 50));
    expect(puts).toEqual([]);
  });

  it("een extra veld blijft gevuld als de instelling niet kon laden (zelfde keuze voor tonen en ophalen)", async () => {
    const user = userEvent.setup();
    const { puts } = await renderDetail({ failGet: true });
    await user.click(screen.getByTestId("button-report-columns"));
    await user.click(await screen.findByTestId("report-column-extra-customer.name"));
    await waitFor(() => expect(screen.getByText("Klant Zeven")).toBeInTheDocument());
    expect(puts).toEqual([]);
  });

  it("een verborgen sorteerkolom: de tabel valt terug op de standaardsortering", async () => {
    setup();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "expenses", "expenses-in-period");
    const table = await screen.findByTestId("expenses-in-period-table");
    await waitFor(() => expect(within(table).getAllByTestId(/^expenses-in-period-table-row-/)).toHaveLength(2));
    await user.click(within(table).getByTestId("expenses-in-period-table-sort-amount"));
    const dateHead = () => within(table).getByTestId("expenses-in-period-table-sort-date").closest("th")!;
    await waitFor(() => expect(dateHead()).toHaveAttribute("aria-sort", "none"));
    await user.click(within(table).getByTestId("button-report-columns"));
    await user.click(await screen.findByTestId("report-column-toggle-amount"));
    await waitFor(() => expect(headers(table)).not.toContain("Bedrag"));
    expect(dateHead()).toHaveAttribute("aria-sort", "descending");
  });

  it("een verborgen sorteerkolom in een serverlijst: de volgende pagina vraagt de standaardsortering", async () => {
    const user = userEvent.setup();
    const { paths } = await renderDetail();
    await user.click(screen.getByTestId("sort-x-amount"));
    await waitFor(() => expect(paths.some((p) => p.includes("sort=amount"))).toBe(true));
    await user.click(screen.getByTestId("button-report-columns"));
    await user.click(await screen.findByTestId("report-column-toggle-amount"));
    await waitFor(() => expect(paths.filter((p) => p.startsWith("/api/reports/x/rows")).at(-1)).toContain("sort=date&dir=desc"));
  });

  it("alle kolommen verborgen (oude keuze): het menu toont wat er echt staat", async () => {
    setup({ "apk-overview": { hidden: ["brand", "model", "plate", "apkDate", "status"], extra: [] } });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await openReport(user, "vehicles", "apk-overview");
    const table = await screen.findByTestId("apk-overview-table");
    await waitFor(() => expect(headers(table)).toContain("Model"));
    await user.click(within(table).getByTestId("button-report-columns"));
    expect(await screen.findByTestId("report-column-toggle-model")).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("report-column-toggle-brand")).toHaveAttribute("data-state", "checked");
  });

  it("een extra veld zonder gekoppelde klant is een lege cel zonder link", async () => {
    await renderDetail({ stored: { x: { hidden: [], extra: ["customer.name"] } }, customerId: 99 });
    await waitFor(() => expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toContain("Klantnaam"));
    const cells = within(screen.getByTestId("x-row")).getAllByRole("cell");
    expect(cells.at(-1)!.textContent).toBe("");
    expect(within(cells.at(-1)!).queryByRole("button")).toBeNull();
  });

  it("de afdruk van een serverlijst heeft het extra veld en niet de verborgen kolom", async () => {
    const prints = capturePrints();
    const user = userEvent.setup();
    await renderDetail({ stored: { x: { hidden: ["amount"], extra: ["customer.name"] } } });
    await waitFor(() => expect(screen.getByText("Klant Zeven")).toBeInTheDocument());
    await user.click(screen.getByTestId("button-x-print"));
    await waitFor(() => expect(prints.printed.length).toBeGreaterThan(0));
    prints.restore();
    expect(prints.printed[0]).toContain("Klantnaam");
    expect(prints.printed[0]).toContain("Klant Zeven");
    expect(prints.printed[0]).not.toContain("Bedrag");
  });
});
