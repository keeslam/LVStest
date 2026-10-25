/**
 * Audit A-14-8 (package P7a), the /reports overview: one fleet base for the
 * averages, a caption that states it, "nieuw" instead of "+100%" when the
 * previous month was empty, and Dutch dates on the print documents.
 * Task 5 (reports redesign): the same rules, through the reports of their own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRole } from "@shared/schema";
import { installFetch, renderWithClient, printPreviewBody, vehicle, daysFromNow, chooseRange, openReport } from "./p7a-harness";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [], hidePrices: false }, isLoading: false }),
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Passthrough, BarChart: Passthrough, LineChart: Passthrough, PieChart: Passthrough, Pie: Passthrough,
    Cell: () => null, Bar: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});

import ReportsPage from "@/pages/reports/index";

afterEach(() => { vi.unstubAllGlobals(); });

const fleet = [vehicle(1, "AB123C"), vehicle(2, "CD456E", "Audi", "A3"), vehicle(3, "EF789G", "Opel", "Corsa"), vehicle(4, "GH012I")];

describe("/reports overview numbers (A-14-8)", () => {
  beforeEach(() => {
    installFetch({
      vehicles: fleet,
      // one expense this month, nothing last month: the old code printed "+100%"
      expenses: [{ id: 1, vehicleId: 1, category: "fuel", amount: "40.00", date: daysFromNow(0), description: "x" }],
    });
  });

  it("divides the average cost per vehicle over the whole fleet and says so", async () => {
    // Task 5: the average sits on Kosten > Kosten per categorie, the first report an admin sees.
    renderWithClient(<ReportsPage />);
    const caption = await screen.findByTestId("reports-basis-caption");
    await waitFor(() => expect(caption).toHaveTextContent("4 voertuigen"));
    // 40 / 4 vehicles = EUR 10, not 40 / 1 vehicle with activity
    expect(await screen.findByText("€ 10,00")).toBeInTheDocument();
    expect(screen.getByTestId("reports-avg-basis")).toHaveTextContent("4 voertuigen");
  });

  it("shows 'nieuw' instead of +100% when the previous month had no costs", async () => {
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    // Task 5: Kostentrends is a report of its own on Kosten.
    await openReport(user, "expenses", "expense-trend");
    const trend = await screen.findByTestId("reports-expense-trend");
    await waitFor(() => expect(within(trend).getAllByText("€ 40,00").length).toBeGreaterThan(0));
    expect(trend).not.toHaveTextContent("+100%");
    expect(within(trend).getByTestId("trend-change-current")).toHaveTextContent("nieuw");
  });
});

describe("/reports print documents (A-14-8)", () => {
  it("writes the period in the house style, not 09/10/2026", async () => {
    installFetch({ vehicles: fleet, expenses: [] });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    // Task 5: the APK overview is a report of its own and prints through Afdrukken of the pane.
    await openReport(user, "vehicles", "apk-overview");
    const printed = await printPreviewBody(user);
    expect(printed).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(printed).toMatch(/\d{1,2}-\d{1,2}-\d{4} t\/m \d{1,2}-\d{1,2}-\d{4}/);
  });
});

describe("/reports print header for 'Alle gegevens' (final wave A, item 9)", () => {
  it("says 'Alle gegevens' on the APK print, not the 2000 - 2050 the preset is made of", async () => {
    installFetch({ vehicles: fleet, expenses: [] });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("select-report-preset"));
    await user.click(await screen.findByRole("option", { name: "Alle gegevens" }));
    await openReport(user, "vehicles", "apk-overview");
    const printed = await printPreviewBody(user);
    expect(printed).toContain("Alle gegevens");
    expect(printed).not.toMatch(/2000|2050/);
  });

  it("does the same for a range typed by hand that equals it, and on the basis line", async () => {
    installFetch({ vehicles: fleet, expenses: [] });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await chooseRange(user, "2000-01-01", "2050-12-31");
    const caption = await screen.findByTestId("reports-basis-caption");
    await waitFor(() => expect(caption).toHaveTextContent("Alle gegevens"));
    expect(caption.textContent).not.toMatch(/2000|2050/);
    await openReport(user, "vehicles", "apk-overview");
    const printed = await printPreviewBody(user);
    expect(printed).toContain("Alle gegevens");
    expect(printed).not.toMatch(/2000|2050/);
  });
});

describe("/reports customer impact print (A-14-8)", () => {
  it("leaves out customers without reservations in the period", async () => {
    installFetch({
      vehicles: fleet,
      customers: [{ id: 1, name: "Klant Met Boeking" }, { id: 2, name: "Klant Zonder Boeking" }],
      reservations: [{ id: 1, customerId: 1, vehicleId: 1, startDate: daysFromNow(-3), endDate: daysFromNow(-1), status: "completed" }],
    });
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    // Task 2: the default period is this month now; take the last 30 days like the old default.
    await chooseRange(user, daysFromNow(-30), daysFromNow(0));
    // Task 5: Klantimpactanalyse is a report of its own and prints through Afdrukken of the pane.
    await openReport(user, "customers", "customer-impact");
    await within(await screen.findByTestId("customer-impact-table")).findByText("Klant Met Boeking");
    const printed = await printPreviewBody(user);
    expect(printed).toContain("Klant Met Boeking");
    expect(printed).not.toContain("Klant Zonder Boeking");
  });
});
