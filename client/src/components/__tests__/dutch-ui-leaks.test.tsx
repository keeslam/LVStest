/**
 * PHASE 57 / WAVE 13 item 7 — de kleine Nederlands/UX-lekken.
 *
 * besluiten **B-18** is about generated documents, but the reason behind it —
 * the desk reads Dutch — holds for the screens as well, and PHASE 57 wrote down
 * where it does not: the scan screen printed the stored fuel level (`Full`) and
 * the stored reservation status (`cancelled`) verbatim, and the "Voertuig
 * markeren voor onderhoud" dialog said *Markeer () als onderhoud nodig…* with
 * empty brackets where the brand, model and plate belong, because the vehicle
 * was never handed to it.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/reservations/reservation-add-dialog", () => ({
  ReservationAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/expenses/expense-add-dialog", () => ({
  ExpenseAddDialog: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/documents/inline-document-upload", () => ({
  InlineDocumentUpload: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: () => null,
  ReturnDialog: () => null,
}));
// ReservationForm now reads useHasPermission() -> useAuth() to gate its
// customers query (task-7-report.md); this test predates that and never
// wrapped its render in an AuthProvider, so it needs the same mock the
// other component tests use.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { ScanPanel } from "@/components/barcodes/scan-panel";
import { ServiceVehicleDialog } from "@/components/reservations/service-vehicle-dialog";
import { ReservationForm } from "@/components/reservations/reservation-form";
import {
  formatFuelLevel,
  formatMaintenanceType,
  formatMaintenanceCategory,
  formatReservationStatus,
} from "@/lib/format-utils";

const vehicle = {
  id: 1821,
  licensePlate: "HL-02-HL",
  brand: "Volkswagen",
  model: "Crafter",
  barcode: "VEH-001821",
  maintenanceStatus: "ok",
  currentFuelLevel: "Full",
  currentMileage: 25600,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    const u = String(url);
    if (u.startsWith("/api/barcodes/")) {
      return json({
        type: "vehicle",
        vehicle,
        activeReservation: {
          id: 3366, status: "cancelled", startDate: "2026-10-05", endDate: "2026-10-08",
          customer: { name: "Handleiding-klant Bv" },
        },
        upcomingReservation: null,
        activeTransport: null,
        activeMaintenance: null,
      });
    }
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderScanPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ScanPanel active intent={null} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("WAVE 13 item 7 — het scanscherm spreekt Nederlands", () => {
  it("shows the fuel level and the reservation status in Dutch, not as stored", async () => {
    const user = userEvent.setup();
    renderScanPanel();

    const input = document.querySelector("input") as HTMLInputElement;
    await user.type(input, "VEH-001821{Enter}");
    await screen.findByTestId("button-scan-again");

    // "Full" and "cancelled" came straight out of the database.
    expect(screen.getByTestId("scan-result-vehicle")).toHaveTextContent("Vol");
    expect(screen.queryByText(/\bFull\b/)).toBeNull();
    expect(screen.getByText("Geannuleerd")).toBeInTheDocument();
    expect(screen.queryByText(/\bcancelled\b/)).toBeNull();
  });
});

describe("WAVE 13 item 7 — 'Markeer () als...'", () => {
  it("names the vehicle instead of leaving empty brackets", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } } });
    render(
      <QueryClientProvider client={client}>
        <ServiceVehicleDialog
          open
          onOpenChange={() => {}}
          reservationId={3364}
          vehicle={vehicle as any}
        />
      </QueryClientProvider>,
    );

    const description = await screen.findByTestId("service-vehicle-description");
    expect(description).toHaveTextContent("Volkswagen");
    expect(description).toHaveTextContent("Crafter");
    expect(description).toHaveTextContent("HL-02-HL");
    // The shape PHASE 57 saw: "Markeer () als onderhoud nodig ...".
    expect(description.textContent).not.toMatch(/\(\s*\)/);
  });
});

describe("WAVE 13 item 7 — de stored waarden die de balie te zien kreeg", () => {
  it("reads a stored maintenance type, category, status and fuel level in Dutch", () => {
    // "breakdown" stood in the Onderhoudstype line of "Onderhoud voltooien".
    expect(formatMaintenanceType("breakdown")).toBe("Pech");
    expect(formatMaintenanceType("oil_change")).toBe("Olieverversing");
    // "repair" stood in the global search and the notification centre.
    expect(formatMaintenanceCategory("repair")).toBe("Reparatie");
    expect(formatMaintenanceCategory("scheduled_maintenance")).toBe("Gepland");
    expect(formatReservationStatus("picked_up")).toBe("Opgehaald");
    expect(formatReservationStatus("cancelled")).toBe("Geannuleerd");
    expect(formatFuelLevel("Full")).toBe("Vol");
  });

  it("never hands back an empty string for a value it does not know", () => {
    // A new type nobody translated yet must still read as words, not as a key.
    expect(formatMaintenanceType("clutch_repair")).toBe("Clutch Repair");
    expect(formatMaintenanceType(null)).toBe("");
  });
});

describe("WAVE 13 item 7 — 'Huur zonder einddatum' is geen standaard", () => {
  it("starts a new reservation with an end date, not open-ended", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: async () => [] } },
    });
    render(
      <QueryClientProvider client={client}>
        <GlobalDialogProvider>
          <ReservationForm />
        </GlobalDialogProvider>
      </QueryClientProvider>,
    );

    const checkbox = await screen.findByTestId("checkbox-open-ended-rental");
    // PHASE 57 found this ticked on every new booking, because the edit-mode
    // derivation `!initialData?.endDate` answers "true" when there is no
    // initialData at all.
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });
});
