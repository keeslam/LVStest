/**
 * "Aanvragen" in het Klantenportaal-beheer: de kolomkoppen sorteren de tabel.
 * Standaard nieuwste eerst; een klik op een kop sorteert op die kolom, nog een
 * klik draait de richting om. De status sorteert op werkvolgorde (Nieuw,
 * In behandeling, Afgehandeld, Afgewezen), niet alfabetisch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequestsTable, sortRequests } from "@/components/portal-admin/requests-table";
import type { PortalRequestDto } from "@shared/portal-requests";

vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({ openPortalRequestDialog: vi.fn(), openFineDialog: vi.fn(), openReservationDialog: vi.fn(), openCustomerDialog: vi.fn(), openVehicleDialog: vi.fn(), openPortalListDialog: vi.fn() }),
}));

const base = { reservationId: null, fineId: null, payload: {}, staffReply: null, repliedAt: null, attachments: [], messages: [], reservationLabel: null };
const rows: PortalRequestDto[] = [
  { ...base, id: 1, type: "extension", status: "done", message: "Zes weken erbij", createdAt: "2026-10-13T20:19:00.000Z", submittedBy: "Portaal Test", customerId: 179, customerName: "Klant 179 B.V." },
  { ...base, id: 2, type: "booking", status: "new", message: "ik heb hem nodig", createdAt: "2026-10-15T08:00:00.000Z", submittedBy: "Anna", customerId: 5, customerName: "Audit Testklant" },
  { ...base, id: 3, type: "damage", status: "in_progress", message: "Kras op de deur", createdAt: "2026-10-14T12:00:00.000Z", submittedBy: "Bas", customerId: 9, customerName: "Zebra Lease" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><RequestsTable /></QueryClientProvider>);
}

/** De id's van de getoonde rijen, van boven naar beneden. */
function order(): number[] {
  return screen.getAllByTestId(/^row-request-/).map((row) => Number(row.getAttribute("data-testid")!.replace("row-request-", "")));
}

describe("aanvragen sorteren op kolomkop", () => {
  it("shows the newest request first by default", async () => {
    renderTable();
    await screen.findByTestId("row-request-1");
    expect(order()).toEqual([2, 3, 1]);
    expect(screen.getByTestId("sort-request-date").closest("th")).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts by customer on a click and flips on the second click", async () => {
    renderTable();
    await screen.findByTestId("row-request-1");
    await userEvent.click(screen.getByTestId("sort-request-customer"));
    expect(order()).toEqual([2, 1, 3]);
    expect(screen.getByTestId("sort-request-customer").closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByTestId("sort-request-date").closest("th")).toHaveAttribute("aria-sort", "none");
    await userEvent.click(screen.getByTestId("sort-request-customer"));
    expect(order()).toEqual([3, 1, 2]);
  });

  it("sorts the status in work order and the type by its Dutch name", async () => {
    renderTable();
    await screen.findByTestId("row-request-1");
    await userEvent.click(screen.getByTestId("sort-request-status"));
    expect(order()).toEqual([2, 3, 1]); // Nieuw, In behandeling, Afgehandeld
    await userEvent.click(screen.getByTestId("sort-request-type"));
    const types = screen.getAllByTestId(/^row-request-/).map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(types).toEqual([...types].sort((a, b) => a!.localeCompare(b!, "nl")));
  });
});

describe("sortRequests", () => {
  it("keeps equal values in their original order", () => {
    const same = rows.map((r) => ({ ...r, status: "new" as const }));
    expect(sortRequests(same, { key: "status", dir: "asc" }, (t) => t).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(sortRequests(same, { key: "status", dir: "desc" }, (t) => t).map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
