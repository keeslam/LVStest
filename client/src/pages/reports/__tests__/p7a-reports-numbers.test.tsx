/**
 * Audit A-14-8 (package P7a), the /reports overview: one fleet base for the
 * averages, a caption that states it, "nieuw" instead of "+100%" when the
 * previous month was empty, and Dutch dates on the print documents.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRole } from "@shared/schema";
import { installFetch, renderWithClient, capturePrints, vehicle, daysFromNow } from "./p7a-harness";

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
    renderWithClient(<ReportsPage />);
    const caption = await screen.findByTestId("reports-basis-caption");
    await waitFor(() => expect(caption).toHaveTextContent("4 voertuigen"));
    // 40 / 4 vehicles = EUR 10, not 40 / 1 vehicle with activity
    expect(await screen.findByText("€ 10,00")).toBeInTheDocument();
    expect(screen.getByTestId("reports-avg-basis")).toHaveTextContent("4 voertuigen");
  });

  it("shows 'nieuw' instead of +100% when the previous month had no costs", async () => {
    renderWithClient(<ReportsPage />);
    const trend = await screen.findByTestId("reports-expense-trend");
    await waitFor(() => expect(within(trend).getAllByText("€ 40,00").length).toBeGreaterThan(0));
    expect(trend).not.toHaveTextContent("+100%");
    expect(within(trend).getByTestId("trend-change-current")).toHaveTextContent("nieuw");
  });
});

describe("/reports print documents (A-14-8)", () => {
  it("writes the generated moment and the period in the house style, not 09/10/2026", async () => {
    installFetch({ vehicles: fleet, expenses: [] });
    // capture the document the iframe is given instead of opening a print dialog
    const printed: string[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string, opts?: any) => {
      const el = realCreate(tag, opts);
      if (tag === "iframe") {
        Object.defineProperty(el, "contentWindow", { value: { print: () => printed.push((el as HTMLIFrameElement).contentDocument!.body.innerHTML), document: undefined } });
      }
      return el;
    }) as any);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("print-report-apk"));
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    await waitFor(() => expect(printed.length).toBe(1));
    expect(printed[0]).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(printed[0]).toMatch(/\d{1,2} [a-z]{3}\.? \d{4} \d{2}:\d{2}/);
    vi.restoreAllMocks();
  });
});

describe("/reports customer impact print (A-14-8)", () => {
  it("leaves out customers without reservations in the period", async () => {
    installFetch({
      vehicles: fleet,
      customers: [{ id: 1, name: "Klant Met Boeking" }, { id: 2, name: "Klant Zonder Boeking" }],
      reservations: [{ id: 1, customerId: 1, vehicleId: 1, startDate: daysFromNow(-3), endDate: daysFromNow(-1), status: "completed" }],
    });
    const { printed, restore } = capturePrints();
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);
    await user.click(await screen.findByTestId("print-report-customer-impact"));
    await waitFor(() => expect(printed.length).toBe(1), { timeout: 4000 });
    expect(printed[0]).toContain("Klant Met Boeking");
    expect(printed[0]).not.toContain("Klant Zonder Boeking");
    restore();
  });
});
