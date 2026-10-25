/**
 * Report builder (phase 6, final fixes): readable server refusals, no duplicate plain column,
 * a saved report without groupBy or filters still opens.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import i18n from "@/i18n";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: any[]) => toast(...a) }));

import ReportBuilder from "@/pages/reports/report-builder";

let executeBody: any = null;
let executeAnswer: { status: number; body: unknown } = { status: 200, body: [] };
let saved: any[] = [];
function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (path === "/api/reports/execute") {
      executeBody = JSON.parse(init.body);
      return json(executeAnswer.body, executeAnswer.status);
    }
    if (path.startsWith("/api/reports/saved")) return json(saved);
    return json([]);
  }));
}
function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ReportBuilder /></QueryClientProvider>);
}

beforeEach(() => {
  toast.mockClear();
  executeBody = null;
  executeAnswer = { status: 200, body: [] };
  saved = [];
});
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

describe("readable refusals", () => {
  it("names the column that is not in the grouping", async () => {
    installFetch();
    executeAnswer = { status: 400, body: { message: "x", code: "REPORT_COLUMN_NOT_GROUPED", field: "fines.status" } };
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("checkbox-datasource-fines"));
    await user.click(screen.getByTestId("button-add-field-status"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    const description = String(toast.mock.calls.at(-1)![0].description);
    expect(description).toContain("Status");
    expect(description).toMatch(/groepering/i);
    expect(description).not.toBe("Uitvoeren van rapport mislukt");
  });

  it.each([
    ["REPORT_PERIOD_NOT_DATE", /datum/i],
    ["REPORT_PERIOD_UNKNOWN", /maand/i],
    ["REPORT_FIELD_REMOVED", /bestaat niet meer/i],
    ["REPORT_COLUMN_DUPLICATE", /twee keer/i],
  ])("%s has its own sentence", async (code, pattern) => {
    installFetch();
    executeAnswer = { status: 400, body: { message: "x", code, field: "fines.status" } };
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-add-field-brand"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    const description = String(toast.mock.calls.at(-1)![0].description);
    expect(description).toMatch(pattern);
  });
});

describe("no duplicate plain column", () => {
  it("clicking a field twice adds it once", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-add-field-brand"));
    await user.click(screen.getByTestId("button-add-field-brand"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.columns).toHaveLength(1);
  });
});

describe("a saved report without groupBy or filters", () => {
  it("opens in the builder", async () => {
    installFetch();
    saved = [{
      id: 9, name: "Oud rapport", description: "", createdBy: "x", createdAt: "2026-10-01",
      configuration: { name: "Oud rapport", dataSources: ["vehicles"], columns: [{ field: "brand", table: "vehicles", label: "Brand" }] },
    }];
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId("button-saved-tab"));
    await user.click(await screen.findByTestId("button-load-report-9"));
    await user.click(await screen.findByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.groupBy).toEqual([]);
    expect(executeBody.filters).toEqual([]);
  });
});
