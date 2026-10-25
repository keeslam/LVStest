/**
 * Report builder: save a report on a tab with a period field, and edit a saved report.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

let role: string = UserRole.ADMIN;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));

import ReportBuilder from "@/pages/reports/report-builder";

const saved = [{
  id: 7, name: "Toyota-lijst", description: "Alle Toyota's", createdBy: "x", createdAt: "2026-10-01",
  configuration: {
    name: "Toyota-lijst", description: "Alle Toyota's", dataSources: ["vehicles"], filters: [], groupBy: [],
    columns: [{ field: "brand", table: "vehicles", label: "Brand" }],
    tab: "vehicles", periodField: "apkDate",
  },
}];

let calls: { method: string; path: string; body: any }[] = [];
function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      calls.push({ method, path, body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ id: 7 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (path.startsWith("/api/reports/saved")) {
      return new Response(JSON.stringify(saved), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}
function renderBuilder(props: { editReportId?: number } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ReportBuilder {...props} /></QueryClientProvider>);
}

beforeEach(() => { calls = []; role = UserRole.ADMIN; permissions = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("saving on a tab with a period field", () => {
  it("posts tab Financieel and period field Datum overtreding", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    await user.click(screen.getByTestId("checkbox-datasource-fines"));
    await user.click(screen.getByTestId("button-add-field-offenceAt"));
    await user.click(screen.getByTestId("button-save-report"));
    await user.type(screen.getByTestId("input-report-name"), "Bekeuringen");
    await user.click(screen.getByTestId("select-saved-report-tab"));
    await user.click(await screen.findByRole("option", { name: "Financieel" }));
    await user.click(screen.getByTestId("select-saved-report-period-field"));
    await user.click(await screen.findByRole("option", { name: "Datum overtreding" }));
    await user.click(screen.getByTestId("button-confirm-save"));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toBe("/api/reports/saved");
    expect(calls[0].body.tab).toBe("financial");
    expect(calls[0].body.periodField).toBe("offenceAt");
  });

  it("offers only the tabs a report may sit on, and only date fields of the ticked source", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-add-field-brand"));
    await user.click(screen.getByTestId("button-save-report"));
    await user.click(screen.getByTestId("select-saved-report-tab"));
    expect(await screen.findByRole("option", { name: "Niet op een tabblad" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kosten" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Overzicht" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Fiscaal" })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("select-saved-report-period-field"));
    expect(await screen.findByRole("option", { name: "Geen (hele tabel)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "APK-datum" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Merk" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Datum overtreding" })).toBeNull();
  });
});

describe("editing a saved report", () => {
  it("fills the builder, Opslaan sends a PUT, Opslaan als nieuw a POST", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    expect(await screen.findByText("Voertuigen", { selector: "[data-testid='badge-saved-tab-7']" })).toBeInTheDocument();
    await user.click(await screen.findByTestId("button-edit-saved-7"));
    expect(await screen.findByText("Bewerken: Toyota-lijst")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-save-report"));
    expect(screen.getByTestId("input-report-name")).toHaveValue("Toyota-lijst");
    expect(screen.getByTestId("select-saved-report-tab")).toHaveTextContent("Voertuigen");
    expect(screen.getByTestId("select-saved-report-period-field")).toHaveTextContent("APK-datum");
    await user.click(screen.getByTestId("button-confirm-save"));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].path).toBe("/api/reports/saved/7");
    expect(calls[0].body.tab).toBe("vehicles");
    expect(calls[0].body.periodField).toBe("apkDate");

    await user.click(await screen.findByTestId("button-save-report"));
    await user.click(screen.getByTestId("button-confirm-save-as-new"));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1].method).toBe("POST");
    expect(calls[1].path).toBe("/api/reports/saved");
  });

  it("opens in edit mode when given editReportId", async () => {
    installFetch();
    renderBuilder({ editReportId: 7 });
    expect(await screen.findByText("Bewerken: Toyota-lijst")).toBeInTheDocument();
  });

  it("has no Bewerken without the right to manage reports", async () => {
    role = UserRole.USER;
    permissions = [];
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    await screen.findByTestId("button-run-saved-7");
    expect(screen.queryByTestId("button-edit-saved-7")).toBeNull();
  });

  it("shows Bewerken to someone with the right to manage reports", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_REPORTS, UserPermission.VIEW_VEHICLES];
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    expect(await screen.findByTestId("button-edit-saved-7")).toBeInTheDocument();
  });
});
