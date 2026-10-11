/**
 * A-2-9 (fysieke E2E-audit 2026-10-09, module 2) — "Recente scans" listed only
 * a time ("23:34"); an older scan could not be placed. It shows date and time.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ScanPanel } from "@/components/barcodes/scan-panel";
import { setOfficeTimeZone } from "@/lib/office-timezone";

afterEach(() => setOfficeTimeZone(null));

async function showHistory(createdAt: string) {
  {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          queryFn: async ({ queryKey }) =>
            queryKey[0] === "/api/scan-events"
              ? [{ id: 1, code: "VH-1-R1", licensePlate: "AB123C", scannedBy: "kees", createdAt }]
              : [],
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
  }
}

describe("scan panel — recent scans", () => {
  it("shows the date as well as the time of each scan, on the office clock", async () => {
    await showHistory("2026-10-09T21:34:00.000Z"); // 23:34 in Amsterdam (CEST)
    expect(await screen.findByText("09-10-2026 23:34")).toBeInTheDocument();
  });

  it("follows the office time zone setting, not the browser's (D11)", async () => {
    setOfficeTimeZone("America/Curacao"); // UTC-4 all year
    await showHistory("2026-10-09T21:34:00.000Z");
    expect(await screen.findByText("09-10-2026 17:34")).toBeInTheDocument();
  });
});
