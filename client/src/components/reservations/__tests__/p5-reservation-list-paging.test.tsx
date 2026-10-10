/**
 * Audit remediation P5, A-5-4 and A-5-5 - the list view put every reservation
 * (366 active ones in the audit) into the DOM at once, which is why opening it
 * took seconds with nothing on screen, and it had no address of its own.
 *
 * Now: a page at a time ("Toon meer"), a visible loading state, and the open
 * tab is reported to the caller so the calendar can put it in the URL.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserRole } from "@shared/schema";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.ADMIN, permissions: [] }, isLoading: false }),
}));

import { ReservationListDialog, RESERVATION_LIST_PAGE_SIZE } from "@/components/reservations/reservation-list-dialog";

function reservation(id: number, status: string, plate: string) {
  return {
    id,
    status,
    type: "standard",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    contractNumber: null,
    totalPrice: null,
    vehicle: { id, brand: "Fiat", model: "Ducato", licensePlate: plate },
    customer: { id, name: `Klant ${id}` },
  };
}

const active = Array.from({ length: 366 }, (_, i) => reservation(i + 1, "booked", `AA${String(i + 1).padStart(4, "0")}`));
const history = Array.from({ length: 120 }, (_, i) => reservation(1000 + i, "completed", `ZZ${String(i + 1).padStart(4, "0")}`));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let holdReservations: Promise<void> | null;

beforeEach(() => {
  holdReservations = null;
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url === "/api/reservations") {
      if (holdReservations) await holdReservations;
      return json([...active, ...history]);
    }
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(props: Partial<React.ComponentProps<typeof ReservationListDialog>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <ReservationListDialog open onOpenChange={() => {}} {...props} />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

const cards = () => document.querySelectorAll('[data-testid^="reservation-card-"]');

describe("A-5-5 - the list shows a page at a time", () => {
  it("renders one page of the 366 active reservations, then more on request", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("reservation-card-1");
    expect(cards()).toHaveLength(RESERVATION_LIST_PAGE_SIZE);
    expect(screen.getByTestId("list-shown-current")).toHaveTextContent(`${RESERVATION_LIST_PAGE_SIZE} van 366`);

    await user.click(screen.getByTestId("button-load-more-current"));
    expect(cards()).toHaveLength(RESERVATION_LIST_PAGE_SIZE * 2);

    // The last page has no button left to press.
    for (let i = 0; i < 6; i++) {
      const more = screen.queryByTestId("button-load-more-current");
      if (!more) break;
      await user.click(more);
    }
    expect(cards()).toHaveLength(366);
    expect(screen.queryByTestId("button-load-more-current")).toBeNull();
  });

  it("searches the whole list, not only the page on screen, and starts again from the first page", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("reservation-card-1");
    expect(screen.queryByTestId("reservation-card-366")).toBeNull();

    await user.type(screen.getByTestId("input-current-search"), "aa0366");
    expect(await screen.findByTestId("reservation-card-366")).toBeInTheDocument();
    expect(cards()).toHaveLength(1);
    expect(screen.queryByTestId("button-load-more-current")).toBeNull();
  });
});

describe("A-5-4 - something is on screen while the list loads", () => {
  it("shows a loading status, not an empty box", async () => {
    let release!: () => void;
    holdReservations = new Promise<void>((resolve) => { release = resolve; });
    renderDialog();
    const loading = await screen.findByTestId("reservation-list-loading");
    expect(loading).toHaveAttribute("role", "status");
    expect(loading).toHaveTextContent("Laden");
    release();
    await screen.findByTestId("reservation-card-1");
    expect(screen.queryByTestId("reservation-list-loading")).toBeNull();
  });
});

describe("A-5-5 - the open tab can be put in a link", () => {
  it("opens on the requested tab", async () => {
    renderDialog({ initialTab: "history" });
    expect(await screen.findByTestId("input-history-search")).toBeInTheDocument();
    await screen.findByTestId("reservation-card-1000");
  });

  it("reports the tab the employee switches to", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    renderDialog({ onTabChange });
    await screen.findByTestId("reservation-card-1");
    await user.click(screen.getByRole("tab", { name: /Geschiedenis/ }));
    await waitFor(() => expect(onTabChange).toHaveBeenLastCalledWith("history"));
  });
});
