/**
 * "Blacklist" voor duizenden blokkades: zoeken, filter op online voertuigen,
 * één klant of voertuig uitlichten door erop te klikken, sorteerbare
 * kolomkoppen en pagina's van 50.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { PortalBlacklistEntryDto } from "@shared/portal-types";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "admin", permissions: [] }, isLoading: false }),
}));

import { BlacklistTable, sortBlacklist } from "@/components/portal-admin/blacklist-table";

const BRANDS = ["Opel", "Volkswagen", "Ford", "Renault", "Peugeot"];
/** 130 blokkades over 20 klanten en 40 voertuigen. */
const entries: PortalBlacklistEntryDto[] = Array.from({ length: 130 }, (_, i) => ({
  id: i + 1,
  vehicleId: (i % 40) + 1,
  licensePlate: `AA${String((i % 40) + 1).padStart(3, "0")}B`,
  brand: BRANDS[i % BRANDS.length],
  model: `Model ${String.fromCharCode(65 + (i % 26))}`,
  offeredOnline: i % 4 === 0,
  customerId: (i % 20) + 1,
  customerName: `Klant ${String((i % 20) + 1).padStart(2, "0")} B.V.`,
  reason: i % 3 === 0 ? `Reden ${i + 1}` : null,
  createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 200))).toISOString(),
}));

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><BlacklistTable /></QueryClientProvider>);
}
const rows = () => screen.getAllByTestId(/^blacklist-row-/);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(entries), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("blacklist — overzicht voor duizenden blokkades", () => {
  it("shows 50 per page, newest first, with a summary and pager", async () => {
    renderTable();
    await screen.findByTestId("blacklist-pagination");
    expect(rows()).toHaveLength(50);
    expect(screen.getByTestId("blacklist-summary")).toHaveTextContent("130 blokkades bij 20 klanten");
    expect(screen.getByTestId("blacklist-count")).toHaveTextContent("130 blokkades");
    expect(screen.getByTestId("sort-blacklist-since").closest("th")).toHaveAttribute("aria-sort", "descending");
    await userEvent.click(screen.getByTestId("blacklist-next-page"));
    expect(screen.getByTestId("blacklist-page-indicator")).toHaveTextContent("2 / 3");
    expect(screen.getByTestId("blacklist-pagination")).toHaveTextContent("51–100 van 130");
  });

  it("highlights one customer on a click on the name, and clears it again", async () => {
    renderTable();
    await screen.findByTestId("blacklist-pagination");
    // Nieuwste eerst, dus de bovenste rij is niet per se blokkade 1: neem de klant die daar staat.
    const first = within(rows()[0]).getByTestId(/blacklist-focus-customer-/);
    const name = first.textContent!;
    await userEvent.click(first);
    expect(screen.getByTestId("blacklist-focus")).toHaveTextContent(`Klant: ${name}`);
    const expected = entries.filter((e) => e.customerName === name).length;
    expect(rows()).toHaveLength(expected);
    expect(screen.getByTestId("blacklist-count")).toHaveTextContent(`${expected} van 130 blokkades`);
    rows().forEach((row) => expect(within(row).getByTestId(/blacklist-focus-customer-/)).toHaveTextContent(name));
    await userEvent.click(screen.getByTestId("blacklist-focus-clear"));
    expect(screen.queryByTestId("blacklist-focus")).not.toBeInTheDocument();
    expect(rows()).toHaveLength(50);
  });

  it("filters on online vehicles and sorts on a column head", async () => {
    renderTable();
    await screen.findByTestId("blacklist-pagination");
    await userEvent.click(screen.getByTestId("blacklist-only-online"));
    const online = entries.filter((e) => e.offeredOnline).length;
    expect(screen.getByTestId("blacklist-count")).toHaveTextContent(`${online} van 130 blokkades`);
    await userEvent.click(screen.getByTestId("blacklist-clear-filters"));
    await userEvent.click(screen.getByTestId("sort-blacklist-customer"));
    const names = rows().map((row) => within(row).getByTestId(/blacklist-focus-customer-/).textContent!);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "nl")));
    await userEvent.click(screen.getByTestId("sort-blacklist-customer"));
    expect(within(rows()[0]).getByTestId(/blacklist-focus-customer-/)).toHaveTextContent("Klant 20 B.V.");
  });
});

describe("sortBlacklist", () => {
  it("sorts on date and keeps equal values in their original order", () => {
    const same = entries.slice(0, 5).map((e) => ({ ...e, createdAt: "2026-05-01T00:00:00.000Z" }));
    expect(sortBlacklist(same, { key: "since", dir: "desc" }).map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    const dates = sortBlacklist(entries, { key: "since", dir: "asc" }).map((e) => e.createdAt);
    expect(dates).toEqual([...dates].sort());
  });
});
