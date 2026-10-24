/**
 * Rapporten fase 3 - the fleet report cards on Rapporten > Voertuigen.
 * Occupancy heatmap: needs the report right AND the reservations right (no card,
 * no request without them), asks nothing for a period over a year, and a click on
 * a day shows that day's tiles whose list is asked for that one day.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { formatLicensePlate } from "@/lib/format-utils";
import type { OccupancyDay, OccupancySummary } from "@shared/reports/occupancy-report";

let permissions: string[] = [];
let role = "user";
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions, hidePrices: false }, isLoading: false }),
}));
vi.mock("@/lib/office-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/office-date")>()),
  officeToday: () => "2026-11-02",
}));

import { calendarWeeks, occupancyBucket } from "@/pages/reports/occupancy-heatmap";
import { OccupancyReportCard } from "@/pages/reports/occupancy-report-card";
import { MaintenanceOutlookCard } from "@/pages/reports/maintenance-outlook-card";
import type { MaintenanceOutlookRow, MaintenanceOutlookSummary } from "@shared/reports/maintenance-outlook-report";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
function pathOf(input: unknown): string {
  const url = typeof input === "string" ? input : (input as Request)?.url ?? "";
  return url.replace(/^https?:\/\/[^/]+/, "");
}
const fetchedPaths = () => fetchMock.mock.calls.map(([input]) => pathOf(input));

/** Every day from `from` to `to` with a fleet of 2 and nothing rented. */
function daysOf(from: string, to: string): OccupancyDay[] {
  const out: OccupancyDay[] = [];
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += 86_400_000) {
    const date = new Date(ms).toISOString().slice(0, 10);
    out.push({ date, fleet: 2, rented: 0, replacement: 0, workshop: 0, available: 2, pct: 0 });
  }
  return out;
}

function summaryStub(): OccupancySummary {
  const days = daysOf("2026-03-01", "2026-03-10").map((d) =>
    d.date === "2026-03-03" ? { ...d, rented: 1, workshop: 1, available: 0, pct: 50 } : d);
  return {
    tiles: {
      rented: { count: 1, amount: 1 },
      replacement: { count: 0, amount: 0 },
      workshop: { count: 1, amount: 1 },
      available: { count: 2, amount: 18 },
    },
    days,
    avgPct: 5,
  };
}

function outlookSummaryStub(): MaintenanceOutlookSummary {
  return {
    tiles: {
      apk: { count: 1, amount: 0 },
      service: { count: 1, amount: 0 },
      overdue: { count: 0, amount: 0 },
      all: { count: 2, amount: 0 },
    },
    byWeek: [{
      weekStart: "2026-11-09", apk: 1, service: 0,
      items: [{ vehicleId: 3, licensePlate: "AB12CD", kind: "apk", dueDate: "2026-11-12" }],
    }],
  };
}

function outlookRow(admin: boolean): MaintenanceOutlookRow {
  return {
    id: "3-service", vehicleId: 3, licensePlate: "AB12CD", brand: "Ford", model: "Transit", kind: "service",
    dueDate: "2026-11-20", weekStart: "2026-11-16", overdue: false, basis: "km", tooFewReadings: false,
    currentMileage: admin ? 98000 : null, nextServiceMileage: admin ? 100000 : null,
    kmUntilService: admin ? 2000 : null, kmPerDay: admin ? 100 : null, amount: 0,
  };
}

beforeEach(() => {
  role = "user";
  fetchMock = vi.fn(async (input: unknown) => {
    const path = pathOf(input);
    if (path.startsWith("/api/reports/occupancy/summary")) return json(summaryStub());
    if (path.startsWith("/api/reports/occupancy/rows")) {
      return json({
        rows: [{
          vehicleId: 3, licensePlate: "AB12CD", brand: "Ford", model: "Transit", fleetDays: 1,
          rentedDays: 1, replacementDays: 0, workshopDays: 0, availableDays: 0, pct: 100, amount: 1,
        }],
        total: 1, page: 1, pageSize: 50,
      });
    }
    if (path.startsWith("/api/reports/maintenance-outlook/summary")) return json(outlookSummaryStub());
    if (path.startsWith("/api/reports/maintenance-outlook/rows")) {
      return json({ rows: [outlookRow(role === "admin")], total: 1, page: 1, pageSize: 50 });
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard(from: string, to: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="host"><OccupancyReportCard from={from} to={to} vehicleId="all" /></div>
    </QueryClientProvider>,
  );
}

describe("Bezettings-heatmap - helpers", () => {
  it("calendarWeeks: 1–10 maart 2026 (zondag t/m dinsdag) is drie weken", () => {
    const w = calendarWeeks(daysOf("2026-03-01", "2026-03-10"));
    expect(w.map((r) => r.map((d) => d?.date ?? null))).toEqual([
      [null, null, null, null, null, null, "2026-03-01"],
      ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"],
      ["2026-03-09", "2026-03-10", null, null, null, null, null],
    ]);
  });

  it("calendarWeeks: geen dagen is geen weken", () => {
    expect(calendarWeeks([])).toEqual([]);
  });

  it("occupancyBucket", () => expect([null, 0, 25, 25.1, 100].map(occupancyBucket)).toEqual(["none", 0, 1, 2, 4]));
});

describe("Bezettings-heatmap - kaart", () => {
  it("zonder reserveringenrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_reports", "view_vehicles"];
    renderCard("2026-03-01", "2026-03-10");
    expect(await screen.findByTestId("host")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-occupancy-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/occupancy"))).toBe(false);
  });

  it("zonder rapportrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_reservations", "view_vehicles"];
    renderCard("2026-03-01", "2026-03-10");
    expect(await screen.findByTestId("host")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-occupancy-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/occupancy"))).toBe(false);
  });

  it("periode van 2000 t/m 2050: geen verzoek en de melding", async () => {
    permissions = ["view_reports", "view_reservations"];
    renderCard("2000-01-01", "2050-12-31");
    expect(await screen.findByTestId("occupancy-period-too-long")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/occupancy"))).toBe(false);
  });

  it("periode van precies 366 dagen wordt wel gevraagd", async () => {
    permissions = ["view_reports", "view_reservations"];
    renderCard("2028-01-01", "2028-12-31");
    await waitFor(() => expect(fetchedPaths().some((p) => p.startsWith("/api/reports/occupancy/summary"))).toBe(true));
    expect(screen.queryByTestId("occupancy-period-too-long")).not.toBeInTheDocument();
  });

  it("klik op een dag en dan op Verhuurd vraagt de lijst van die dag", async () => {
    permissions = ["view_reports", "view_reservations"];
    const user = userEvent.setup();
    renderCard("2026-03-01", "2026-03-10");
    await waitFor(() => expect(screen.getByTestId("occupancy-tile-available-value").textContent).toBe("2"));
    expect(fetchedPaths()).toContain("/api/reports/occupancy/summary?from=2026-03-01&to=2026-03-10");
    const cell = await screen.findByTestId("occupancy-day-2026-03-03");
    expect(cell.getAttribute("title")).toContain("1");
    await user.click(cell);
    expect(screen.getByTestId("occupancy-day-tile-rented-value").textContent).toBe("1");
    expect(screen.getByTestId("occupancy-day-tile-available-value").textContent).toBe("0");
    await user.click(screen.getByTestId("button-occupancy-day-tile-rented"));
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/occupancy/rows?from=2026-03-03&to=2026-03-03&tile=rented&sort=licensePlate&dir=asc&page=1&pageSize=50",
    ));
    expect(await screen.findByText("AB-12-CD", { exact: false })).toBeInTheDocument();
  });

  it("een periodetegel vraagt de lijst van de hele periode", async () => {
    permissions = ["view_reports", "view_reservations"];
    const user = userEvent.setup();
    renderCard("2026-03-01", "2026-03-10");
    await user.click(await screen.findByTestId("button-occupancy-tile-workshop"));
    await waitFor(() => expect(fetchedPaths()).toContain(
      "/api/reports/occupancy/rows?from=2026-03-01&to=2026-03-10&tile=workshop&sort=licensePlate&dir=asc&page=1&pageSize=50",
    ));
  });
});

function renderOutlook() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="host"><MaintenanceOutlookCard /></div>
    </QueryClientProvider>,
  );
}

describe("Onderhoud en APK vooruit - kaart", () => {
  it("zonder voertuigenrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_reports", "view_reservations"];
    renderOutlook();
    expect(await screen.findByTestId("host")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-maintenance-outlook")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/maintenance-outlook"))).toBe(false);
  });

  it("zonder rapportrecht geen kaart en geen verzoek", async () => {
    permissions = ["view_vehicles"];
    renderOutlook();
    expect(await screen.findByTestId("host")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-maintenance-outlook")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/maintenance-outlook"))).toBe(false);
  });

  it("vraagt standaard 3 maanden vooruit en bij 6 maanden de nieuwe einddatum", async () => {
    permissions = ["view_reports", "view_vehicles"];
    const user = userEvent.setup();
    renderOutlook();
    await waitFor(() => expect(fetchedPaths()).toContain("/api/reports/maintenance-outlook/summary?from=2026-11-02&to=2027-02-02"));
    await user.selectOptions(screen.getByTestId("select-outlook-horizon"), "6");
    await waitFor(() => expect(fetchedPaths()).toContain("/api/reports/maintenance-outlook/summary?from=2026-11-02&to=2027-05-02"));
  });

  it("toont de weken met kenteken", async () => {
    permissions = ["view_reports", "view_vehicles"];
    renderOutlook();
    const week = await screen.findByTestId("outlook-week-2026-11-09");
    expect(week.textContent).toContain(formatLicensePlate("AB12CD"));
    expect(week.textContent).toContain("Week 46");
  });

  it("niet-admin ziet geen km-kolommen; admin wel, met de stand", async () => {
    permissions = ["view_reports", "view_vehicles"];
    const user = userEvent.setup();
    const first = renderOutlook();
    await user.click(await screen.findByTestId("button-outlook-tile-service"));
    expect(await screen.findByText("Vervaldatum")).toBeInTheDocument();
    expect(screen.queryByText("Km tot beurt")).not.toBeInTheDocument();
    expect(screen.queryByText("Huidige stand")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("null");
    first.unmount();

    role = "admin";
    renderOutlook();
    await user.click(await screen.findByTestId("button-outlook-tile-service"));
    expect(await screen.findByText("Km tot beurt")).toBeInTheDocument();
    expect(await screen.findByText("2.000")).toBeInTheDocument();
  });
});
