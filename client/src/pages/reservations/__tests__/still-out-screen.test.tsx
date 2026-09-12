/**
 * B-21 — het scherm "Nog buiten", in the jsdom project.
 *
 * What is pinned here is the decision, not a layout. B-21 says the 363
 * `picked_up` rows are **not** closed by a script but go on "een werklijst die
 * iemand echt naloopt". So the screen has to (a) show the four things that let
 * an employee decide — vehicle, customer, period, how long it has been open —
 * and (b) act through the handover dialog that already exists, not through a
 * second implementation of "innemen".
 *
 * The clock is frozen: the screen asks for its own today, so a test that read
 * the real one would send a different URL every day it ran.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { StillOutWorklist } from "@shared/still-out";

// The handover itself is the calendar's / scan panel's dialog, unchanged. What
// this screen is responsible for is opening the *right* one for the right row.
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: ({ open, reservation }: any) =>
    open ? <div data-testid={`pickup-dialog-${reservation.id}`} /> : null,
  ReturnDialog: ({ open, reservation }: any) =>
    open ? <div data-testid={`return-dialog-${reservation.id}`} /> : null,
}));

import StillOutPage from "@/pages/reservations/still-out";

const FROZEN_NOW = new Date(2032, 5, 15, 9, 0, 0); // Tuesday 15 June 2032
const FROZEN_DAY = "2032-06-15";

function emptyList(): StillOutWorklist {
  return { today: FROZEN_DAY, total: 0, rows: [] };
}

function fullList(): StillOutWorklist {
  return {
    today: FROZEN_DAY,
    total: 2,
    rows: [
      {
        reservationId: 901,
        vehicleId: 11,
        licensePlate: "12ABC3",
        vehicleLabel: "Opel Vivaro",
        customerId: 5,
        customerLabel: "Bakkerij Jansen",
        startDate: "2031-11-01",
        endDate: "2031-11-08",
        actualPickupDate: "2031-11-01",
        contractNumber: "2031-0044",
        daysOpen: 220,
      },
      {
        reservationId: 902,
        vehicleId: 22,
        licensePlate: "45DEF6",
        vehicleLabel: "Ford Transit",
        customerId: null,
        customerLabel: null,
        startDate: "2032-05-01",
        endDate: "2032-05-10",
        actualPickupDate: null,
        contractNumber: null,
        daysOpen: 36,
      },
    ],
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(list: StillOutWorklist) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/reservations/worklist/still-out")) {
      return new Response(JSON.stringify(list), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (/^\/api\/reservations\/\d+$/.test(url)) {
      const id = Number(url.split("/").pop());
      return new Response(JSON.stringify({ id, status: "picked_up", vehicle: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StillOutPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("B-21 — de werklijst 'Nog buiten'", () => {
  it("asks for its own today, once", async () => {
    stubFetch(fullList());
    renderScreen();
    await screen.findByTestId("still-out-list");

    const calls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/reservations/worklist/still-out"),
    );
    expect(calls).toHaveLength(1);
    expect(String(calls[0][0])).toBe(`/api/reservations/worklist/still-out?date=${FROZEN_DAY}`);
  });

  it("shows vehicle, customer, period and how long it has been open", async () => {
    stubFetch(fullList());
    renderScreen();
    await screen.findByTestId("still-out-row-901");

    const row = screen.getByTestId("still-out-row-901");
    expect(row.textContent).toContain("Opel Vivaro");
    expect(row.textContent).toContain("Bakkerij Jansen");
    expect(row.textContent).toContain("1 november 2031");
    expect(row.textContent).toContain("8 november 2031");
    expect(screen.getByTestId("still-out-days-901").textContent).toContain("220");
    expect(screen.getByTestId("still-out-days-902").textContent).toContain("36");
    expect(screen.getByTestId("still-out-count").textContent).toContain("2");
  });

  it("a row without a customer still renders", async () => {
    stubFetch(fullList());
    renderScreen();
    const row = await screen.findByTestId("still-out-row-902");
    expect(row.textContent).toContain("Geen klant");
  });

  it("the action is the existing return dialog, not a second one", async () => {
    stubFetch(fullList());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderScreen();
    await screen.findByTestId("still-out-row-901");

    await user.click(screen.getByTestId("button-still-out-return-901"));
    expect(await screen.findByTestId("return-dialog-901")).toBeTruthy();
    expect(screen.queryByTestId("pickup-dialog-901")).toBeNull();
  });

  it("every row also links to the reservation itself", async () => {
    stubFetch(fullList());
    renderScreen();
    await screen.findByTestId("still-out-row-901");
    const element = screen.getByTestId("link-still-out-open-901");
    const link = element.tagName === "A" ? element : element.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/reservations/edit/901");
  });

  it("says so plainly when the list is empty", async () => {
    stubFetch(emptyList());
    renderScreen();
    expect(await screen.findByTestId("still-out-empty")).toBeTruthy();
  });
});
