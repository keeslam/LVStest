/**
 * Recente scans — a row is a button: clicking it repeats the lookup of that
 * code through the same path as the scanner and the search button, so the
 * earlier result (vehicle, reservation or "geen match") comes back.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ScanPanel } from "@/components/barcodes/scan-panel";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const scans = [
  { id: 1, code: "V4", matchType: "vehicle", vehicleId: 4, reservationId: null, licensePlate: "04VKD6", scannedBy: "admin", createdAt: "2026-10-15T20:21:00.000Z" },
  { id: 2, code: "ONBEKEND", matchType: "none", vehicleId: null, reservationId: null, licensePlate: null, scannedBy: "admin", createdAt: "2026-10-14T19:12:00.000Z" },
];

async function openHistory() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => (queryKey[0] === "/api/scan-events" ? scans : []),
      },
    },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider><ScanPanel active intent={null} /></GlobalDialogProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByText("Recente scans"));
  return user;
}

describe("scan panel — repeat a recent scan", () => {
  it("renders each history row as a button with a tooltip", async () => {
    await openHistory();
    const row = await screen.findByTestId("scan-history-row-1");
    expect(row.tagName).toBe("BUTTON");
    expect(row).toHaveAttribute("title", "Opnieuw opzoeken");
  });

  it("clicking a row looks the code up again via the barcode endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: "vehicle",
        vehicle: { id: 4, licensePlate: "04VKD6", brand: "Toyota", model: "Aygo", barcode: "V4", vehicleType: "Personenauto" },
        activeReservation: null,
        upcomingReservations: [],
        activeTransport: null,
        activeMaintenance: null,
      }),
    });
    const user = await openHistory();
    await user.click(await screen.findByTestId("scan-history-row-1"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/barcodes/V4");
    expect(await screen.findByText(/Toyota/)).toBeInTheDocument();
  });

  it("a 'geen match' row shows the no-match message again, with the code in the field", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const user = await openHistory();
    await user.click(await screen.findByTestId("scan-history-row-2"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/barcodes/ONBEKEND");
    expect(await screen.findByTestId("scan-error")).toHaveTextContent('Geen voertuig of reservering gevonden voor "ONBEKEND"');
    expect(screen.getByTestId("input-barcode-scan")).toHaveValue("ONBEKEND");
  });

  it("the row answers to the keyboard (Enter)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const user = await openHistory();
    (await screen.findByTestId("scan-history-row-2")).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/barcodes/ONBEKEND", expect.anything()));
  });
});
