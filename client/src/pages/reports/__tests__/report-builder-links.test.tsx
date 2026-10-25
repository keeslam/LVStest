/**
 * Report builder, linked fields (rapporten herontwerp deel 3, Task 2): a group "Gekoppeld: ..." per
 * allowed link of the main source, columns / groups / filters carry `via`, the result reads
 * `${via}.${field}` and the header says "Voertuig · Merk".
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";
import i18n from "@/i18n";
import { getQueryFn } from "@/lib/queryClient";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: any[]) => toast(...a) }));

import ReportBuilder from "@/pages/reports/report-builder";
import { builderChartData } from "@/pages/reports/report-builder-chart";

let executeBody: any = null;
let executeError: unknown = null;
function installFetch(rows: any[] = []) {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (path === "/api/reports/execute") {
      executeBody = JSON.parse(init.body);
      if (executeError) return new Response(JSON.stringify(executeError), { status: 400, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}
function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ReportBuilder /></QueryClientProvider>);
}

beforeEach(() => { toast.mockClear(); executeError = null; executeBody = null; role = UserRole.ADMIN; permissions = []; });
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

async function pickFines(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
  await user.click(screen.getByTestId("checkbox-datasource-fines"));
}

describe("linked fields in the builder", () => {
  it("shows a Gekoppeld group per link of the main source", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    for (const name of ["Voertuig", "Klant", "Bestuurder", "Reservering"]) {
      expect(screen.getByText(`Gekoppeld: ${name}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("button-add-field-vehicle.brand")).toBeInTheDocument();
  });

  it("shows no linked group for a source without links", () => {
    installFetch();
    renderBuilder();
    expect(screen.queryByText(/^Gekoppeld:/)).toBeNull();
  });

  it("sends the linked column with via and shows 'Voertuig · Merk' with the cell from vehicle.brand", async () => {
    installFetch([{ "vehicle.brand": "Toyota" }]);
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    await user.click(screen.getByTestId("button-add-field-vehicle.brand"));
    await user.click(screen.getByTestId("button-run-report"));
    const dialog = await screen.findByTestId("dialog-report-results");
    expect(executeBody.columns).toEqual([{ table: "vehicles", field: "brand", via: "vehicle", label: "Brand" }]);
    expect(within(dialog).getByText("Voertuig · Merk")).toBeInTheDocument();
    expect(within(dialog).getByText("Toyota")).toBeInTheDocument();
  });

  it("keeps a plain field and the same linked field apart", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    await user.click(screen.getByTestId("button-add-field-id"));
    await user.click(screen.getByTestId("button-add-field-vehicle.id"));
    await user.click(screen.getByTestId("button-add-field-vehicle.id"));
    expect(screen.getByTestId("button-remove-column-1")).toBeInTheDocument();
    expect(screen.queryByTestId("button-remove-column-2")).toBeNull();
  });

  it("hides the customer group for a user without the customer right", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FINES];
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    expect(screen.getByText("Gekoppeld: Voertuig")).toBeInTheDocument();
    expect(screen.queryByText("Gekoppeld: Klant")).toBeNull();
    expect(screen.queryByText("Gekoppeld: Bestuurder")).toBeNull();
  });

  it("groups on a linked field and sets groupBy[0].via", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    await user.click(screen.getByTestId("select-report-group-by"));
    await user.click(await screen.findByRole("option", { name: "Voertuig · Merk" }));
    expect(screen.getByTestId("button-remove-column-0")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.groupBy).toEqual([{ table: "vehicles", field: "brand", via: "vehicle" }]);
    expect(executeBody.columns[0]).toMatchObject({ table: "vehicles", field: "brand", via: "vehicle" });
  });

  it("filters on a linked field and sends via", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    await user.click(screen.getByTestId("button-add-field-id"));
    await user.click(screen.getByTestId("button-add-filter"));
    await user.click(screen.getByTestId("select-filter-field"));
    await user.click(await screen.findByRole("option", { name: "Voertuig · Merk" }));
    await user.click(screen.getByTestId("select-filter-operator"));
    await user.click((await screen.findAllByRole("option"))[0]);
    await user.type(screen.getByTestId("input-filter-value"), "Toyota");
    await user.click(screen.getByTestId("button-confirm-filter"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.filters[0]).toMatchObject({ table: "vehicles", field: "brand", via: "vehicle", value: "Toyota" });
  });

  it("drops linked columns when the main source changes", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    await user.click(screen.getByTestId("button-add-field-vehicle.brand"));
    await user.click(screen.getByTestId("checkbox-datasource-fines"));
    expect(screen.queryByTestId("button-remove-column-0")).toBeNull();
  });

  it("hides km fields from a non-admin, direct and linked", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_REPORTS, UserPermission.VIEW_FINES];
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    expect(screen.queryByTestId("button-add-field-vehicle.currentMileage")).toBeNull();
    expect(screen.getByTestId("button-add-field-vehicle.brand")).toBeInTheDocument();
    await user.click(screen.getByTestId("checkbox-datasource-fines"));
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    expect(screen.queryByTestId("button-add-field-currentMileage")).toBeNull();
    expect(screen.getByTestId("button-add-field-brand")).toBeInTheDocument();
  });

  it("shows km fields to an admin, linked too", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    expect(screen.getByTestId("button-add-field-currentMileage")).toBeInTheDocument();
    await pickFines(user);
    expect(screen.getByTestId("button-add-field-vehicle.currentMileage")).toBeInTheDocument();
  });
});

describe("refusals and same-named fields", () => {
  it("names a linked column in the not-in-grouping toast", async () => {
    installFetch();
    executeError = { message: "x", code: "REPORT_COLUMN_NOT_GROUPED", field: "vehicle.brand" };
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    await user.click(screen.getByTestId("button-add-field-vehicle.brand"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    const description = String(toast.mock.calls.at(-1)![0].description);
    expect(description).toContain("Voertuig · Merk");
    expect(description).toMatch(/groepering/i);
  });

  it("keeps a plain filter and a linked filter on the same field name separate", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickFines(user);
    await user.click(screen.getByTestId("button-add-field-id"));
    for (const name of ["ID", "Voertuig · ID"]) {
      await user.click(screen.getByTestId("button-add-filter"));
      await user.click(screen.getByTestId("select-filter-field"));
      await user.click(await screen.findByRole("option", { name }));
      await user.click(screen.getByTestId("select-filter-operator"));
      await user.click((await screen.findAllByRole("option"))[0]);
      await user.type(screen.getByTestId("input-filter-value"), "5");
      await user.click(screen.getByTestId("button-confirm-filter"));
    }
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.filters).toHaveLength(2);
    expect(executeBody.filters[0]).toMatchObject({ table: "fines", field: "id" });
    expect(executeBody.filters[0].via).toBeUndefined();
    expect(executeBody.filters[1]).toMatchObject({ table: "vehicles", field: "id", via: "vehicle" });
  });
});

describe("chart of a linked grouping", () => {
  it("reads the group and the series from the via keys", () => {
    const t = ((k: string, o?: any) => o?.defaultValue ?? k) as any;
    const data = builderChartData(
      t,
      [{ "vehicle.brand": "Toyota", "id": "3" }],
      [
        { table: "vehicles", field: "brand", via: "vehicle", label: "Brand" },
        { table: "fines", field: "id", label: "ID", aggregation: "COUNT" },
      ],
      [{ table: "vehicles", field: "brand", via: "vehicle" }],
    );
    expect(data?.points[0].__cat).toBe("Toyota");
    expect(data?.points[0].id).toBe(3);
  });

  it("charts a calculation on a linked field", () => {
    const t = ((k: string, o?: any) => o?.defaultValue ?? k) as any;
    const data = builderChartData(
      t,
      [{ "vehicle.brand": "Toyota", "vehicle.currentMileage": "10" }],
      [
        { table: "vehicles", field: "brand", via: "vehicle", label: "Brand" },
        { table: "vehicles", field: "currentMileage", via: "vehicle", label: "km", aggregation: "SUM" },
      ],
      [{ table: "vehicles", field: "brand", via: "vehicle" }],
    );
    expect(data?.series[0].key).toBe("vehicle__currentMileage");
    expect(data?.points[0]["vehicle__currentMileage"]).toBe(10);
  });
});
