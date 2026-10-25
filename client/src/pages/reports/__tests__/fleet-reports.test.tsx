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
const downloadCsv = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv,
}));
vi.mock("@/lib/office-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/office-date")>()),
  officeToday: () => "2026-11-02",
}));

import { calendarWeeks, occupancyBucket } from "@/pages/reports/occupancy-heatmap";
import { OccupancyReportCard } from "@/pages/reports/occupancy-report-card";
import { MaintenanceOutlookCard } from "@/pages/reports/maintenance-outlook-card";
import { FleetMileageReportCard } from "@/pages/reports/fleet-mileage-report-card";
import type { FleetMileageRow, FleetMileageSummary } from "@shared/reports/fleet-mileage-report";
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

function mileageSummaryStub(): FleetMileageSummary {
  return {
    tiles: {
      driven: { count: 1, amount: 900 },
      warnings: { count: 1, amount: 0 },
      sparse: { count: 2, amount: 0 },
    },
    byMonth: [
      { month: "2026-01", km: 600, vehicles: 1 },
      { month: "2026-02", km: 300, vehicles: 1 },
      { month: "2026-03", km: 0, vehicles: 0 },
    ],
  };
}

const mileageVehicleRow: FleetMileageRow = {
  kind: "vehicle", id: "v-3", vehicleId: 3, licensePlate: "AB12CD", brand: "Ford", model: "Transit",
  drivenKm: 900, avgPerMonth: 300, freeKm: 1000, overFreeKm: 0, readings: 4, warnings: 1,
  firstReading: "2026-01-05T10:00:00.000Z", lastReading: "2026-02-20T10:00:00.000Z",
  kmByMonth: { "2026-01": 600, "2026-02": 300 }, amount: 900,
};

beforeEach(() => {
  role = "user";
  downloadCsv.mockReset();
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
    if (path.startsWith("/api/reports/fleet-mileage/summary")) return json(mileageSummaryStub());
    if (path.startsWith("/api/reports/fleet-mileage/rows")) {
      return json({ rows: [mileageVehicleRow], total: 1, page: 1, pageSize: 50 });
    }
    if (path.startsWith("/api/reports/occupancy/export")) {
      return json({
        rows: [{
          vehicleId: 3, licensePlate: "AB12CD", brand: "Ford", model: "Transit", fleetDays: 31,
          rentedDays: 14, replacementDays: 1, workshopDays: 2, availableDays: 14, pct: 45.16, amount: 14,
        }],
        total: 1, truncated: false,
      });
    }
    if (path.startsWith("/api/reports/maintenance-outlook/export")) {
      return json({ rows: [{ ...outlookRow(true), currentMileage: 78000, kmUntilService: 2000, kmPerDay: 98.44 }], total: 1, truncated: false });
    }
    if (path.startsWith("/api/reports/fleet-mileage/export")) return json({ rows: [mileageVehicleRow], total: 1, truncated: false });
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

  it("CSV: dagen zonder decimalen, procent met 1 decimaal", async () => {
    permissions = ["view_reports", "view_reservations"];
    const user = userEvent.setup();
    renderCard("2026-03-01", "2026-03-10");
    await user.click(await screen.findByTestId("button-occupancy-tile-rented"));
    await user.click(await screen.findByTestId("button-occupancy-report-csv"));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const rows = downloadCsv.mock.calls[0][2] as unknown[][];
    expect(rows[0].slice(2)).toEqual(["31", "14", "2", "1", "14", "45,2"]);
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

  it("CSV (admin): km zonder decimalen, km per dag met 1 decimaal", async () => {
    permissions = ["view_reports", "view_vehicles"];
    role = "admin";
    const user = userEvent.setup();
    renderOutlook();
    await user.click(await screen.findByTestId("button-outlook-tile-service"));
    await user.click(await screen.findByTestId("button-maintenance-outlook-csv"));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const rows = downloadCsv.mock.calls[0][2] as unknown[][];
    expect(rows[0].slice(-3)).toEqual(["78000", "2000", "98,4"]);
  });
});

function renderMileage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="host"><FleetMileageReportCard from="2026-01-01" to="2026-03-31" vehicleId="all" /></div>
    </QueryClientProvider>,
  );
}

describe("Kilometerstanden vloot - kaart (alleen admin)", () => {
  it("een medewerker met alle rechten ziet geen kaart en doet geen verzoek", async () => {
    permissions = ["view_reports", "manage_reports", "view_vehicles", "manage_vehicles", "view_reservations"];
    role = "user";
    renderMileage();
    expect(await screen.findByTestId("host")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("card-fleet-mileage-report")).not.toBeInTheDocument();
    expect(fetchedPaths().some((p) => p.startsWith("/api/reports/fleet-mileage"))).toBe(false);
  });

  it("admin: tegel toont het aantal auto's, klik toont de maandkolommen en de CSV eindigt op de maandlabels", async () => {
    permissions = ["view_reports"];
    role = "admin";
    const user = userEvent.setup();
    renderMileage();
    await waitFor(() => expect(screen.getByTestId("fleet-mileage-tile-driven-value").textContent).toBe("1"));
    expect(fetchedPaths()).toContain("/api/reports/fleet-mileage/summary?from=2026-01-01&to=2026-03-31");
    expect(screen.getByTestId("fleet-mileage-month-chart")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-fleet-mileage-tile-driven"));
    expect(await screen.findByRole("columnheader", { name: "jan. 2026" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "600" })).toBeInTheDocument();
    await user.click(await screen.findByTestId("button-fleet-mileage-csv"));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const [subject, header, rows] = downloadCsv.mock.calls[0] as [string, string[], unknown[][]];
    expect(subject).toBe("kilometerstanden-vloot");
    expect(header.slice(-3)).toEqual(["jan. 2026", "feb. 2026", "mrt. 2026"]);
    expect(rows[0].slice(-3)).toEqual(["600", "300", "0"]);
  });
});
