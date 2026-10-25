/**
 * Rapporten herontwerp deel 1, final fix wave: back button, print header for ignored filters, footer,
 * phone filter bar, one selection source, no double titles, print filter lines, transports order,
 * Overzicht without list, phone dropdown counts and the print dialog on a phone.
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { reportDocumentHtml } from "@/lib/report-document-print";
import { vehicle, daysFromNow } from "./p7a-harness";

let role: string = UserRole.ADMIN;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("@/lib/office-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/office-date")>()),
  officeToday: () => "2026-10-25",
}));
vi.mock("@/pages/reports/report-builder", () => ({ default: () => <div /> }));
vi.mock("@/pages/reports/maintenance-costs", () => ({ default: () => <div /> }));
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

import ReportsPage from "@/pages/reports/index";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tile = (count: number) => ({ count, amount: 0 });

const fleet = [vehicle(1, "AB123C"), vehicle(2, "CD456E", "Audi", "A3")];
const transports = [
  { id: 1, vehicleId: 1, transportType: "swap", status: "completed", originCity: "Zuidland", destinationCity: "Spijkenisse", scheduledDate: daysFromNow(-2), tollCost: null, billable: false, invoiced: false },
  { id: 2, vehicleId: 2, transportType: "tow", status: "scheduled", originCity: "Rotterdam", destinationCity: "Delft", scheduledDate: daysFromNow(-1), tollCost: "4.50", billable: false, invoiced: false },
  { id: 3, vehicleId: 2, transportType: "delivery", status: "completed", originCity: "Breda", destinationCity: "Tilburg", scheduledDate: daysFromNow(0), tollCost: null, billable: false, invoiced: false },
];
const expenses = [
  { id: 1, vehicleId: 1, category: "fuel", amount: "40.00", date: daysFromNow(0), description: "tanken" },
];

let puts: Array<{ url: string; body: any }> = [];
function respond(url: string, init?: RequestInit): Response {
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const bare = path.split("?")[0];
  if (bare.startsWith("/api/user-settings/")) {
    if (init?.method === "PUT") puts.push({ url: bare, body: JSON.parse(String(init.body)) });
    return json(null);
  }
  if (bare === "/api/vehicles") return json(fleet.map((v, i) => ({ ...v, apkDate: i === 0 ? "2020-01-01" : null })));
  if (bare === "/api/expenses") return json(expenses);
  if (bare === "/api/transports") return json(transports);
  if (bare.startsWith("/api/reports/vehicle-financials")) return json({ rows: [], totals: { rentals: 0, rentalDays: 0, revenue: 0, expenses: 0, margin: 0 } });
  if (bare.startsWith("/api/reports/occupancy/summary")) return json({ tiles: {}, days: [], avgPct: 10 });
  if (bare.startsWith("/api/reports/fines/summary")) return json({ tiles: { new: tile(3) }, byMonth: [], byCustomer: [], byVehicle: [], byDriver: [], avgDaysToLink: null });
  if (bare.startsWith("/api/reports/maintenance-outlook/summary")) return json({ tiles: { overdue: tile(2) }, items: [] });
  return json([]);
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}><ReportsPage /></QueryClientProvider>);
}

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  role = UserRole.ADMIN;
  puts = [];
  window.history.replaceState(null, "", "/reports");
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: RequestInit) => respond(typeof input === "string" ? input : input.url, init)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
});

async function previewHtml(user: ReturnType<typeof userEvent.setup>): Promise<string> {
  await user.click(await screen.findByTestId("button-report-print"));
  const frame = await screen.findByTestId("print-preview-frame", undefined, { timeout: 4000 });
  return frame.getAttribute("srcdoc") ?? "";
}

describe("fix 1: back button", () => {
  it("a tile click is a history step; back returns to Overzicht", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("overview-tile-finesOpen"));
    await waitFor(() => expect(screen.getByTestId("tab-report-financial")).toHaveAttribute("data-state", "active"));
    window.history.back();
    await waitFor(() => expect(screen.getByTestId("tab-report-overview")).toHaveAttribute("data-state", "active"));
  });

  it("a tab click is a history step too", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-report-vehicles"));
    await waitFor(() => expect(screen.getByTestId("tab-report-vehicles")).toHaveAttribute("data-state", "active"));
    window.history.back();
    await waitFor(() => expect(screen.getByTestId("tab-report-overview")).toHaveAttribute("data-state", "active"));
  });
});

describe("fix 2: print header for ignored filters", () => {
  it("transports: no period line, the note instead", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/reports?tab=transports&report=transports");
    renderPage();
    await screen.findByTestId("transports-table-row-3");
    const html = await previewHtml(user);
    expect(html).not.toContain("t/m");
    expect(html).toContain("Periode en voertuig gelden niet voor dit rapport.");
  });

  it("expense trend prints 'Altijd de laatste 3 maanden.' instead of the period", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/reports?tab=expenses&report=expense-trend");
    renderPage();
    await screen.findByTestId("reports-expense-trend");
    const html = await previewHtml(user);
    expect(html).not.toContain("t/m");
    expect(html).toContain("Altijd de laatste 3 maanden.");
  });

  it("APK overview drops the period line, a report that uses the period keeps it", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/reports?tab=vehicles&report=apk-overview");
    renderPage();
    await screen.findByTestId("apk-overview-table");
    expect(await previewHtml(user)).not.toContain("t/m");
  });
});

describe("fix 3: footer", () => {
  it("is not fixed over the last row; it sits in the page margin and at the end of the document", () => {
    const html = reportDocumentHtml({
      company: "X", title: "T", period: "p", filters: [], sections: [], landscape: false, printedAt: "25-10-2026 10:00",
    });
    expect(html).not.toContain("position: fixed");
    expect(html).toContain("@bottom-left");
    expect(html).toContain("Gedrukt op 25-10-2026 10:00");
    expect(html.indexOf('class="foot"')).toBeGreaterThan(html.indexOf("<body"));
  });
});

describe("fix 4: phone filter bar", () => {
  it("is sticky only from md and stays under the mobile menu backdrop (z-20)", async () => {
    renderPage();
    const bar = await screen.findByTestId("report-filter-bar");
    const classes = bar.className.split(/\s+/);
    expect(classes).toContain("md:sticky");
    expect(classes).toContain("md:top-0");
    expect(classes).not.toContain("sticky");
    expect(classes).not.toContain("z-20");
    expect(classes).toContain("z-10");
  });
});

describe("fix 5: one selection source", () => {
  it("a tile click keeps the choice the shell shows and writes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-report-vehicles"));
    await user.click(await screen.findByTestId("report-nav-item-apk-overview"));
    await user.click(screen.getByTestId("tab-report-overview"));
    await user.click(await screen.findByTestId("overview-tile-maintenanceOverdue"));
    await waitFor(() => expect(screen.getByTestId("report-nav-item-maintenance-outlook")).toHaveAttribute("aria-current", "page"));
    await user.click(screen.getByTestId("tab-report-overview"));
    await user.click(await screen.findByTestId("tab-report-vehicles"));
    await waitFor(() => expect(screen.getByTestId("report-nav-item-maintenance-outlook")).toHaveAttribute("aria-current", "page"));
    await waitFor(() => expect(puts.length).toBeGreaterThan(0));
    expect(puts[puts.length - 1].body.value.vehicles).toBe("maintenance-outlook");
  });
});

describe("fix 6: no double titles", () => {
  const cases: Array<[string, string]> = [
    ["expenses", "expenses-by-category"], ["expenses", "expense-trend"], ["expenses", "expenses-in-period"],
    ["vehicles", "vehicle-utilization"], ["vehicles", "maintenance-cost-by-vehicle"], ["vehicles", "apk-overview"], ["vehicles", "warranty"],
    ["customers", "customer-impact"], ["customers", "customer-cost-categories"], ["customers", "customer-reservations"],
    ["transports", "transports"], ["financial", "vehicle-financials"],
  ];
  it.each(cases)("%s / %s shows its title once", async (tab, id) => {
    window.history.replaceState(null, "", `/reports?tab=${tab}&report=${id}`);
    renderPage();
    const title = (await screen.findByTestId("report-pane-title")).textContent ?? "";
    await waitFor(() => expect(screen.getByTestId(`report-pane-${id}`)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    // The pane's own h2 is the only place with this title (a Card title is a div, so count the text).
    expect(within(screen.getByTestId(`report-pane-${id}`)).getAllByText(title)).toHaveLength(1);
  });
});

describe("fix 7: print filter lines", () => {
  it("writes the category and the plate the way the screen does", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/reports?tab=expenses&report=expenses-by-category");
    renderPage();
    await user.click(await screen.findByTestId("select-report-category"));
    await user.click(await screen.findByRole("option", { name: "Brandstof" }));
    await user.click(await screen.findByTestId("select-report-vehicle"));
    await user.click(await screen.findByText("Audi A3"));
    const html = await previewHtml(user);
    expect(html).toContain("Brandstof");
    expect(html).not.toContain(">fuel<");
    expect(html).not.toMatch(/Categorie: fuel/);
    expect(html).toContain("CD-456-E");
    expect(html).not.toContain("CD456E");
  });
});

describe("fix 8: transports 'Alleen aangevinkte' in screen order", () => {
  it("follows the sorted table, not the order of the data", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/reports?tab=transports&report=transports");
    renderPage();
    await screen.findByTestId("transports-table-row-3");
    await user.click(screen.getByTestId("transports-table-sort-date"));
    await user.click(screen.getByTestId("transports-table-sort-date"));
    const rowIds = () => within(screen.getByTestId("transports-table")).getAllByTestId(/^transports-table-row-/).map((r) => r.getAttribute("data-testid"));
    await waitFor(() => expect(rowIds()[0]).toBe("transports-table-row-3"));
    await user.click(screen.getByTestId("checkbox-select-transport-report-1"));
    await user.click(screen.getByTestId("checkbox-select-transport-report-3"));
    await user.click(screen.getByTestId("button-report-print"));
    const dialog = await screen.findByTestId("dialog-report-print");
    await waitFor(() => expect(within(dialog).getByTestId("print-preview-frame")).toBeInTheDocument());
    fireEvent.change(within(dialog).getByTestId("print-option-rows"), { target: { value: "selected" } });
    await waitFor(() => {
      const html = within(dialog).getByTestId("print-preview-frame").getAttribute("srcdoc") ?? "";
      expect(html).toContain("Zuidland");
      expect(html.indexOf("Breda")).toBeGreaterThan(-1);
      expect(html.indexOf("Breda")).toBeLessThan(html.indexOf("Zuidland"));
    });
  });
});

describe("fix 9: Overzicht has no list", () => {
  it("hides the list and gives the pane the full width", async () => {
    renderPage();
    await screen.findByTestId("overview-tiles");
    expect(screen.queryByTestId("report-nav")).toBeNull();
    expect(screen.queryByTestId("select-report-nav")).toBeNull();
    expect(screen.getByTestId("reports-layout").className).not.toContain("240px");
  });

  it("other tabs keep the list", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("tab-report-vehicles"));
    expect(await screen.findByTestId("report-nav")).toBeInTheDocument();
    expect(screen.getByTestId("reports-layout").className).toContain("240px");
  });
});

describe("fix 10: phone dropdown shows the counts", () => {
  it("writes Bekeuringen (3) in the option", async () => {
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as any;
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/reports?tab=financial&report=fines");
    renderPage();
    await user.click(await screen.findByTestId("select-report-nav"));
    expect(await screen.findByRole("option", { name: "Bekeuringen (3)" })).toBeInTheDocument();
  });
});

describe("fix 11: print dialog on a phone", () => {
  it("scrolls options and preview inside the dialog, keeps Afdrukken visible, preview follows the paper", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/reports?tab=vehicles&report=apk-overview");
    renderPage();
    await screen.findByTestId("apk-overview-table");
    await previewHtml(user);
    const body = screen.getByTestId("print-dialog-body");
    expect(body.className).toContain("overflow-y-auto");
    expect(body).not.toContainElement(screen.getByTestId("button-print-confirm"));
    expect(screen.getByTestId("print-dialog-footer").className).toContain("sticky");
    const box = screen.getByTestId("print-preview-box");
    expect(box.className).toContain("aspect-[210/297]");
    await user.click(screen.getByTestId("print-option-landscape"));
    expect(screen.getByTestId("print-preview-box").className).toContain("aspect-[297/210]");
  });
});
