/**
 * Report builder (phase 6): sources per right, every field clickable, grouping and calculations,
 * month values in the table and the CSV.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";
import i18n from "@/i18n";
import { getQueryFn } from "@/lib/queryClient";
import { formatDateNl } from "@/lib/format-date-nl";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
const downloadCsv = vi.fn(() => "x.csv");
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...a: any[]) => (downloadCsv as any)(...a),
}));

import ReportBuilder from "@/pages/reports/report-builder";

let executeBody: any = null;
function installFetch(rows: any[] = []) {
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
function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ReportBuilder /></QueryClientProvider>);
}

beforeEach(() => {
  downloadCsv.mockClear();
  executeBody = null;
  role = UserRole.ADMIN;
  permissions = [];
});
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

const has = (id: string) => screen.queryByTestId(`checkbox-datasource-${id}`) !== null;

describe("sources per right", () => {
  it("offers the five new sources to an admin, in Dutch", () => {
    installFetch();
    renderBuilder();
    for (const id of ["fines", "transports", "workshop_visits", "damage_checks", "mileage_readings"]) expect(has(id)).toBe(true);
    for (const text of ["Bekeuringen", "Transporten", "Werkplaatsbezoeken", "Schadechecks", "Km-historie"]) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("offers only fines, vehicles, reservations and expenses to a user with the fines right", () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FINES];
    installFetch();
    renderBuilder();
    for (const id of ["fines", "vehicles", "reservations", "expenses"]) expect(has(id)).toBe(true);
    for (const id of ["transports", "workshop_visits", "damage_checks", "mileage_readings", "customers", "drivers"]) expect(has(id)).toBe(false);
  });

  it("offers workshop visits with the maintenance right, not transports", () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.MANAGE_MAINTENANCE];
    installFetch();
    renderBuilder();
    expect(has("workshop_visits")).toBe(true);
    expect(has("transports")).toBe(false);
  });

  it("never offers km history to a non-admin", () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES];
    installFetch();
    renderBuilder();
    expect(has("mileage_readings")).toBe(false);
  });
});

describe("fields, grouping and calculations", () => {
  it("shows every field of a source", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-mileage_readings"));
    expect(screen.getByTestId("button-add-field-voidedAt")).toBeInTheDocument();
    expect(screen.queryByText(/meer\.\.\./)).toBeNull();
  });

  it("groups per month and sends the calculation", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-fines"));
    await user.click(screen.getByTestId("button-add-field-offenceAt"));
    await user.click(screen.getByTestId("button-add-field-totalAmount"));
    await user.click(screen.getByTestId("select-report-group-by"));
    await user.click(await screen.findByRole("option", { name: "Datum overtreding" }));
    await user.click(await screen.findByTestId("checkbox-group-by-month"));
    await user.click(screen.getByTestId("select-column-aggregation-1"));
    await user.click(await screen.findByRole("option", { name: "Som" }));
    expect(screen.queryByTestId("select-column-aggregation-0")).toBeNull();
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.groupBy).toEqual([{ table: "fines", field: "offenceAt", period: "month" }]);
    expect(executeBody.columns).toMatchObject([
      { table: "fines", field: "offenceAt" },
      { table: "fines", field: "totalAmount", aggregation: "SUM" },
    ]);
  });

  it("adds the group as a column when it is missing", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-fines"));
    await user.click(screen.getByTestId("select-report-group-by"));
    await user.click(await screen.findByRole("option", { name: "Status" }));
    expect(await screen.findByTestId("button-remove-column-0")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.columns[0]).toMatchObject({ field: "status" });
  });
});

describe("month values", () => {
  it("shows the month in the table and writes mm-jjjj in the CSV", async () => {
    installFetch([{ offenceAt: "2019-02", totalAmount: "80.00" }]);
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-fines"));
    await user.click(screen.getByTestId("button-add-field-offenceAt"));
    await user.click(screen.getByTestId("button-add-field-totalAmount"));
    await user.click(screen.getByTestId("select-report-group-by"));
    await user.click(await screen.findByRole("option", { name: "Datum overtreding" }));
    await user.click(await screen.findByTestId("checkbox-group-by-month"));
    await user.click(screen.getByTestId("select-column-aggregation-1"));
    await user.click(await screen.findByRole("option", { name: "Som" }));
    await user.click(screen.getByTestId("button-run-report"));
    const dialog = await screen.findByTestId("dialog-report-results");
    expect(within(dialog).getByText(formatDateNl("2019-02-01T12:00:00", "MMM yyyy"))).toBeInTheDocument();
    await user.click(within(dialog).getByText("Exporteren naar CSV"));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect((downloadCsv.mock.calls[0] as any[])[2]).toEqual([["02-2019", "80,00"]]);
  });
});
