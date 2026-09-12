/**
 * besluiten.md **B-15** (BUG-140, BUG-151) — the recycle bin now holds
 * reservations and transports next to vehicles, customers and fines, so the
 * list has to say what each row is and offer the restore on all of them.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeletedVehiclesDialog } from "@/components/vehicles/deleted-vehicles-dialog";

const records = [
  {
    id: 1, entityType: "vehicle", entityId: 900, label: "AB-123-C Volkswagen Crafter",
    relatedCounts: { reservations: 2 }, deletedAt: "2026-09-01T10:00:00.000Z",
    deletedBy: "kees", restoredAt: null, restoredBy: null,
  },
  {
    id: 2, entityType: "reservation", entityId: 3387, label: "Reservering #3387 — AB-123-C 2030-02-01",
    relatedCounts: {}, deletedAt: "2026-09-02T10:00:00.000Z",
    deletedBy: "kees", restoredAt: null, restoredBy: null,
  },
  {
    id: 3, entityType: "transport", entityId: 44, label: "Transport #44 — AB-123-C 2030-02-01",
    relatedCounts: { spareReservations: 1 }, deletedAt: "2026-09-03T10:00:00.000Z",
    deletedBy: "kees", restoredAt: null, restoredBy: null,
  },
];

function renderBin(entityType?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => records, retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DeletedVehiclesDialog open onOpenChange={() => {}} entityType={entityType} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("B-15 — the recycle bin lists reservations and transports", () => {
  it("shows all three kinds, each labelled, each with a restore button", async () => {
    renderBin();

    expect(await screen.findByTestId("deleted-record-2")).toHaveTextContent("Reservering #3387");
    expect(screen.getByTestId("deleted-record-3")).toHaveTextContent("Transport #44");

    expect(screen.getByTestId("deleted-record-type-1")).toHaveTextContent("Voertuig");
    expect(screen.getByTestId("deleted-record-type-2")).toHaveTextContent("Reservering");
    expect(screen.getByTestId("deleted-record-type-3")).toHaveTextContent("Transport");

    // BUG-151's complaint was that there was no way back at all.
    expect(screen.getByTestId("button-restore-2")).toBeEnabled();
    expect(screen.getByTestId("button-restore-3")).toBeEnabled();
  });

  it("still honours a single-type view", async () => {
    renderBin("reservation");

    expect(await screen.findByTestId("deleted-record-2")).toBeInTheDocument();
    expect(screen.queryByTestId("deleted-record-1")).toBeNull();
    expect(screen.queryByTestId("deleted-record-3")).toBeNull();
  });
});
