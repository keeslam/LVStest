/**
 * Audit A-14-1, A-14-6 (package P7a): the report builder.
 * - the result can be exported to CSV through the shared writer (Dutch cells) and printed;
 * - sources, fields and operators read Dutch (and English when the language is English);
 *   the stored definitions keep the English identifiers;
 * - running a saved report shows the columns of that report, not of the open builder.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import i18n from "@/i18n";
import { getQueryFn } from "@/lib/queryClient";
import { capturePrints } from "./p7a-harness";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));
const downloadCsv = vi.fn(() => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: any[]) => (downloadCsv as any)(...a),
}));

import ReportBuilder from "@/pages/reports/report-builder";

const saved = [{
  id: 7, name: "Toyota-lijst", description: "", createdBy: "x", createdAt: "2026-10-01",
  configuration: {
    name: "Toyota-lijst", dataSources: ["vehicles"], filters: [], groupBy: [],
    columns: [{ field: "brand", table: "vehicles", label: "Brand" }, { field: "model", table: "vehicles", label: "Model" }],
  },
}];

let executeBody: any = null;
function installFetch(rows: any[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (path === "/api/reports/execute") {
      executeBody = JSON.parse(init.body);
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
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

beforeEach(() => { downloadCsv.mockClear(); executeBody = null; });
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

describe("report builder labels (A-14-6)", () => {
  it("shows sources, fields and operators in Dutch", async () => {
    installFetch([]);
    const user = userEvent.setup();
    renderBuilder();
    for (const source of ["Voertuigen", "Klanten", "Reserveringen", "Kosten", "Chauffeurs"]) expect(screen.getByText(source)).toBeInTheDocument();
    expect(screen.getByTestId("button-add-field-licensePlate")).toHaveTextContent("+ Kenteken");
    expect(screen.getByTestId("button-add-field-brand")).toHaveTextContent("+ Merk");
    expect(screen.queryByText("Vehicles")).toBeNull();
    expect(screen.queryByText(/License Plate/)).toBeNull();

    await user.click(screen.getByTestId("button-add-filter"));
    await user.click(screen.getByTestId("select-filter-field"));
    await user.click(await screen.findByRole("option", { name: "Merk" }));
    await user.click(screen.getByTestId("select-filter-operator"));
    const operators = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(operators).toEqual(expect.arrayContaining(["is gelijk aan", "bevat", "begint met", "is leeg"]));
    expect(operators).not.toContain("equals");
  });

  it("reads English when the language is English", async () => {
    await i18n.changeLanguage("en");
    installFetch([]);
    renderBuilder();
    expect(screen.getByText("Vehicles")).toBeInTheDocument();
    expect(screen.getByTestId("button-add-field-licensePlate")).toHaveTextContent("+ License Plate");
  });

  it("keeps the English identifiers in what it runs and saves", async () => {
    installFetch([{ licensePlate: "AB123C" }]);
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-add-field-licensePlate"));
    await user.click(screen.getByTestId("button-run-report"));
    await screen.findByTestId("dialog-report-results");
    expect(executeBody.dataSources).toEqual(["vehicles"]);
    expect(executeBody.columns[0]).toMatchObject({ field: "licensePlate", table: "vehicles" });
  });
});

describe("report builder output (A-14-1)", () => {
  const rows = [
    { licensePlate: "AB123C", amount: "1234.5", date: "2026-10-09", gps: true },
    { licensePlate: "=CMD()", amount: null, date: null, gps: false },
  ];

  async function runWithColumns(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId("checkbox-datasource-expenses"));
    await user.click(screen.getByTestId("button-add-field-licensePlate"));
    await user.click(screen.getByTestId("button-add-field-amount"));
    await user.click(screen.getByTestId("button-add-field-date"));
    await user.click(screen.getByTestId("button-run-report"));
    return screen.findByTestId("dialog-report-results");
  }

  it("exports the result as CSV through the shared writer: Dutch header, Dutch cells", async () => {
    installFetch(rows);
    const user = userEvent.setup();
    renderBuilder();
    await runWithColumns(user);
    await user.click(screen.getByTestId("button-export-report-csv"));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [subject, header, cells] = downloadCsv.mock.calls[0] as any[];
    expect(subject).toMatch(/^rapport-/);
    expect(header).toEqual(["Kenteken", "Bedrag", "Datum"]);
    expect(cells).toEqual([
      ["AB-123-C", "1234,50", "09-10-2026"],
      ["=CMD()", "", ""],
    ]);
  });

  it("prints the result with the same header and cells", async () => {
    installFetch(rows);
    const { printed, restore } = capturePrints();
    const user = userEvent.setup();
    renderBuilder();
    await runWithColumns(user);
    await user.click(screen.getByTestId("button-print-report"));
    await waitFor(() => expect(printed.length).toBe(1), { timeout: 4000 });
    expect(printed[0]).toContain("<th>Kenteken</th>");
    expect(printed[0]).toContain("AB-123-C");
    expect(printed[0]).toContain("9 okt. 2026");
    expect(printed[0]).not.toContain("<script");
    expect(printed[0]).toContain("=CMD()");
    restore();
  });

  it("gives the export and print buttons only when there is a result to export", async () => {
    installFetch([]);
    const user = userEvent.setup();
    renderBuilder();
    await runWithColumns(user);
    expect(screen.getByTestId("button-export-report-csv")).toBeDisabled();
    expect(screen.getByTestId("button-print-report")).toBeDisabled();
  });
});

describe("running a saved report", () => {
  it("shows the columns of the saved report in the result", async () => {
    installFetch([{ brand: "TOYOTA", model: "Yaris" }]);
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    await user.click(await screen.findByTestId("button-run-saved-7"));
    const dialog = await screen.findByTestId("dialog-report-results");
    expect(within(dialog).getByRole("columnheader", { name: "Merk" })).toBeInTheDocument();
    expect(within(dialog).getByText("TOYOTA")).toBeInTheDocument();
  });
});
