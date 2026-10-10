/**
 * A-12-7 (audit 2026-10-09): the fines export wrote "95.00" and a plate without dashes.
 * It now goes through the shared CSV writer: decimal comma, dashed plate, no seconds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csv", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/csv")>()), downloadCsv: download }));

import { FinesTable } from "@/components/fines/fines-table";

const ROW = { id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:30Z", description: "Te hard", amount: "100.00", adminFee: "12.50", totalAmount: "112.50", status: "linked", customerId: 3, customerName: "Jansen BV", driverName: null, reservationId: 9 };

beforeEach(() => {
  download.mockClear();
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([ROW]), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });

describe("fines CSV export", () => {
  it("writes the amount with a decimal comma, the plate with dashes and the time without seconds", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><GlobalDialogProvider><FinesTable /></GlobalDialogProvider></QueryClientProvider>);
    await screen.findByTestId("row-fine-7");
    await user.click(screen.getByTestId("button-export-fines"));
    expect(download).toHaveBeenCalledTimes(1);
    const [, header, rows] = download.mock.calls[0] as [string, string[], string[][]];
    expect(header).toEqual(["Kenteken", "Datum", "Omschrijving", "Klant", "Bestuurder", "Bedrag", "Status"]);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("AB-123-C");
    expect(rows[0][1]).toMatch(/^\d{2}-\d{2}-2026 \d{2}:\d{2}$/);
    expect(rows[0][5]).toBe("112,50");
  });
});
