/**
 * Kees, 2026-10-19: the reservation shows its driver history to the office, folded until opened.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DriverHistoryRow } from "@shared/portal-types";
import { DriverHistoryPanel } from "@/components/reservations/extra-drivers-note";

const rows: DriverHistoryRow[] = [
  { id: 1, driverId: 10, driverName: "Jan", from: "2026-09-01T08:00:00.000Z", until: "2026-09-05T08:00:00.000Z", isExtra: false, setBy: { kind: "staff", name: "Kees" }, note: null },
  { id: 2, driverId: 11, driverName: "Piet", from: "2026-09-03T08:00:00.000Z", until: null, isExtra: true, setBy: { kind: "portal", name: "Klantbeheerder" }, note: null },
];

function renderPanel(data: DriverHistoryRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["/api/reservations/7/driver-history"], data);
  return render(<QueryClientProvider client={qc}><DriverHistoryPanel reservationId={7} /></QueryClientProvider>);
}

describe("bestuurdershistorie", () => {
  it("is folded, then shows who drove, main or extra, and who set it", async () => {
    renderPanel(rows);
    expect(screen.getByTestId("button-driver-history")).toHaveTextContent("Bestuurdershistorie (2 regels)");
    expect(screen.queryByTestId("driver-history-1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("button-driver-history"));
    expect(screen.getByTestId("driver-history-1")).toHaveTextContent("hoofdbestuurder");
    expect(screen.getByTestId("driver-history-1")).toHaveTextContent("ingesteld door Kees (kantoor)");
    expect(screen.getByTestId("driver-history-2")).toHaveTextContent("extra bestuurder");
    expect(screen.getByTestId("driver-history-2")).toHaveTextContent("Klantbeheerder (klantenportaal)");
    expect(screen.getByTestId("driver-history-2")).toHaveTextContent("nu");
  });

  it("shows nothing without history", () => {
    renderPanel([]);
    expect(screen.queryByTestId("driver-history-panel")).not.toBeInTheDocument();
  });
});
