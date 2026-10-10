/**
 * Audit A-3-8 / A-3-11 — the vehicle list.
 *
 * A-3-8: the "Sorteren op" list mixed sort keys with filters ("Reparatie nodig", "Opnaam", "BV",
 * "Niet opgegeven"), so the two could not be combined or told apart. Now a sort select and a
 * separate filter select.
 * A-3-11: the pagination only had Vorige/Volgende; with 95 vehicles there was no jump to a page.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [], hidePrices: false }, isLoading: false }),
}));

import VehiclesIndex from "@/pages/vehicles/index";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// 25 vehicles, ids 1..25. Plates ZZ-001-A is id 1 so "license" order differs from id order.
function vehicle(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    licensePlate: `AA-${String(100 - id).padStart(3, "0")}-B`,
    brand: id % 2 ? "Volkswagen" : "Audi",
    model: `Model ${id}`,
    vehicleType: "Sedan",
    availabilityStatus: "available",
    apkDate: `2027-0${(id % 9) + 1}-15`,
    registeredTo: null,
    company: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}
const fleet = Array.from({ length: 25 }, (_, i) => {
  const id = i + 1;
  // ids 3 and 5 need fixing; id 3 is also registered to a company (BV)
  if (id === 3) return vehicle(id, { availabilityStatus: "needs_fixing", company: "true" });
  if (id === 5) return vehicle(id, { availabilityStatus: "needs_fixing" });
  return vehicle(id);
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      return path === "/api/vehicles" ? json(fleet) : json([]);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path: "/vehicles", static: true });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <Router hook={hook}>
          <VehiclesIndex />
        </Router>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

/** Plates in the table body, in order. */
function tablePlates(): string[] {
  const table = screen.getAllByRole("table")[0];
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => (row.textContent ?? "").match(/[A-Z]{2}-\d{3}-[A-Z]/)?.[0] ?? "");
}

async function choose(user: ReturnType<typeof userEvent.setup>, triggerTestId: string, optionName: string) {
  await user.click(screen.getByTestId(triggerTestId));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("A-3-8 — sorting and filtering are separate controls", () => {
  it("the sort list holds only sort keys and the filter list holds the former filter entries", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("select-vehicle-sort");

    await user.click(screen.getByTestId("select-vehicle-sort"));
    const sortOptions = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(sortOptions).toEqual([
      "Standaard (ID)",
      "Kenteken",
      "Merk",
      "APK-datum (eerst vroegste)",
      "APK-datum (eerst laatste)",
      "Beschikbaarheid (beschikbaar eerst)",
      "Beschikbaarheid (gereserveerd eerst)",
    ]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByTestId("select-vehicle-filter"));
    const filterOptions = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(filterOptions).toEqual(["Alle voertuigen", "Reparatie nodig", "Opnaam", "BV", "Niet opgegeven"]);
  });

  it("a filter and a sort key work together: the repair-needed vehicles, ordered by plate", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("select-vehicle-sort");

    await choose(user, "select-vehicle-filter", "Reparatie nodig");
    // ids 3 and 5 -> plates AA-097-B and AA-095-B; by id that is 097 then 095.
    await waitFor(() => expect(tablePlates()).toEqual(["AA-097-B", "AA-095-B"]));

    await choose(user, "select-vehicle-sort", "Kenteken");
    await waitFor(() => expect(tablePlates()).toEqual(["AA-095-B", "AA-097-B"]));
  });
});

describe("A-3-11 — jump to a page", () => {
  it("typing a page number shows that page", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByTestId("input-go-to-page");
    expect(tablePlates()).toHaveLength(10);
    expect(screen.getByText(/Pagina 1 van 3/)).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "3{Enter}");

    await waitFor(() => expect(tablePlates()).toHaveLength(5)); // 25 vehicles: page 3 holds the last five
    expect(screen.getByText(/Pagina 3 van 3/)).toBeInTheDocument();
  });

  it("an empty or non-numeric entry is ignored and a number below 1 goes to the first page", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByTestId("input-go-to-page");
    await user.clear(input);
    await user.type(input, "2{Enter}");
    await waitFor(() => expect(screen.getByText(/Pagina 2 van 3/)).toBeInTheDocument());

    await user.type(input, "{Enter}"); // empty
    await user.type(input, "abc{Enter}"); // a number input takes no letters: still empty
    expect(screen.getByText(/Pagina 2 van 3/)).toBeInTheDocument();

    await user.type(input, "0{Enter}");
    await waitFor(() => expect(screen.getByText(/Pagina 1 van 3/)).toBeInTheDocument());
  });

  it("a page number beyond the last page goes to the last page", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByTestId("input-go-to-page");
    await user.clear(input);
    await user.type(input, "99{Enter}");
    await waitFor(() => expect(screen.getByText(/Pagina 3 van 3/)).toBeInTheDocument());
  });
});
