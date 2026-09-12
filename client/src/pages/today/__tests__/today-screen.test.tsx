/**
 * OPT-001 — het werkdagscherm "Vandaag", in the jsdom project.
 *
 * What is pinned here is the owner's decision, not a layout: `besluiten.md`
 * B-17 says the screen shows exactly three groups — today's pickups and
 * returns with the button to do them, today's maintenance and transport
 * including the spares still to be assigned, and the new portal requests — and
 * that there is **no** "te laat terug" list. Each of those is an assertion
 * below, the absent one included.
 *
 * The clock is frozen: this screen is about "vandaag", so a test that read the
 * real one would mean something different every day it ran.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { TodayBoard } from "@shared/today";

const openSpareAssignmentDialog = vi.fn();
const openPortalRequestDialog = vi.fn();
const openReservationDialog = vi.fn();

vi.mock("@/contexts/GlobalDialogContext", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/contexts/GlobalDialogContext");
  return {
    ...actual,
    useGlobalDialog: () => ({
      openSpareAssignmentDialog,
      openPortalRequestDialog,
      openReservationDialog,
      dialogState: {},
    }),
  };
});

// The handover itself is the scan panel's / calendar's dialog, unchanged. What
// this screen is responsible for is opening the *right* one for the right row.
vi.mock("@/components/reservations/pickup-return-dialogs", () => ({
  PickupDialog: ({ open, reservation }: any) =>
    open ? <div data-testid={`pickup-dialog-${reservation.id}`} /> : null,
  ReturnDialog: ({ open, reservation }: any) =>
    open ? <div data-testid={`return-dialog-${reservation.id}`} /> : null,
}));

vi.mock("@/components/delivery/transport-dialog", () => ({
  TransportDialog: ({ open, editingTransport }: any) =>
    open ? <div data-testid={`transport-dialog-${editingTransport.id}`} /> : null,
}));

import TodayPage from "@/pages/today";
import { localToday } from "@/hooks/use-today-board";

/** The frozen day. Nothing in this file reads the real clock. */
const FROZEN_NOW = new Date(2032, 5, 15, 9, 0, 0); // Tuesday 15 June 2032
const FROZEN_DAY = "2032-06-15";

function emptyBoard(): TodayBoard {
  return {
    date: FROZEN_DAY,
    pickups: [],
    returns: [],
    maintenance: [],
    transports: [],
    spareAssignments: [],
    portalRequests: [],
    counts: {
      pickups: 0,
      returns: 0,
      maintenance: 0,
      transports: 0,
      spareAssignments: 0,
      portalRequests: 0,
      total: 0,
    },
  };
}

function fullBoard(): TodayBoard {
  const board = emptyBoard();
  board.pickups = [
    {
      id: 101,
      handover: "pickup",
      startDate: FROZEN_DAY,
      endDate: "2032-06-20",
      startTime: "09:30",
      endTime: null,
      vehicleId: 11,
      licensePlate: "12ABC3",
      vehicleLabel: "Opel Vivaro",
      customerName: "Bakkerij Jansen",
      contractNumber: "2032-0101",
      placeholderSpare: false,
    },
  ];
  board.returns = [
    {
      id: 202,
      handover: "return",
      startDate: "2032-06-10",
      endDate: FROZEN_DAY,
      startTime: null,
      endTime: "16:00",
      vehicleId: 22,
      licensePlate: "45DEF6",
      vehicleLabel: "Ford Transit",
      customerName: "Loodgieter De Vries",
      contractNumber: null,
      placeholderSpare: false,
    },
  ];
  board.maintenance = [
    {
      id: 303,
      startDate: "2032-06-14",
      endDate: "2032-06-16",
      vehicleId: 33,
      licensePlate: "78GHI9",
      vehicleLabel: "Fiat Ducato",
      maintenanceStatus: "in",
      maintenanceCategory: "repair",
      customerName: null,
    },
  ];
  board.transports = [
    {
      id: 404,
      scheduledDate: FROZEN_DAY,
      status: "scheduled",
      transportType: "tow",
      vehicleId: 44,
      licensePlate: "01JKL2",
      vehicleLabel: "MAN TGE",
      route: "Waalwijk → Tilburg",
      driverName: "Piet",
      customerName: null,
      spareTbd: true,
    },
  ];
  board.spareAssignments = [
    {
      id: 505,
      startDate: FROZEN_DAY,
      endDate: "2032-06-18",
      customerName: "Bakkerij Jansen",
      originalLicensePlate: "78GHI9",
    },
  ];
  board.portalRequests = [
    {
      id: 606,
      type: "extension",
      status: "new",
      customerName: "Loodgieter De Vries",
      message: "Kunnen wij de bus een week langer houden?",
      createdAt: "2032-06-15T07:12:00.000Z",
      reservationLabel: "45DEF6 2032-06-10 - 2032-06-15",
    },
  ];
  board.counts = {
    pickups: 1,
    returns: 1,
    maintenance: 1,
    transports: 1,
    spareAssignments: 1,
    portalRequests: 1,
    total: 6,
  };
  return board;
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(board: TodayBoard) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/today")) {
      return new Response(JSON.stringify(board), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (/^\/api\/reservations\/\d+$/.test(url)) {
      const id = Number(url.split("/").pop());
      return new Response(JSON.stringify({ id, status: "booked", vehicle: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (/^\/api\/transports\/\d+$/.test(url)) {
      const id = Number(url.split("/").pop());
      return new Response(JSON.stringify({ id, transportType: "tow", status: "scheduled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderToday() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <TodayPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  openSpareAssignmentDialog.mockClear();
  openPortalRequestDialog.mockClear();
  openReservationDialog.mockClear();
  // Only `Date` is faked: react-query and testing-library keep their real
  // timers, so nothing here waits on a clock that never moves.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OPT-001 — the day is asked for once, for the browser's own today", () => {
  it("localToday is the local calendar day, not the UTC one", () => {
    // 00:30 in Amsterdam on 16 June is still 22:30 UTC on the 15th. The
    // employee's "vandaag" is the one on their wall, which is why the screen
    // sends its own date rather than letting the server guess.
    expect(localToday(new Date(2032, 5, 16, 0, 30, 0))).toBe("2032-06-16");
    expect(localToday(FROZEN_NOW)).toBe(FROZEN_DAY);
  });

  it("loads the whole screen with one request", async () => {
    stubFetch(fullBoard());
    renderToday();
    await screen.findByTestId("today-group-handovers");

    const todayCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).startsWith("/api/today"),
    );
    expect(todayCalls).toHaveLength(1);
    expect(String(todayCalls[0][0])).toBe(`/api/today?date=${FROZEN_DAY}`);
    // And nothing else: no reservation list, no vehicle list, no transport
    // list. That is the whole point of the endpoint (BUG-203/BUG-204).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OPT-001 — B-17's three groups", () => {
  beforeEach(() => stubFetch(fullBoard()));

  it("shows exactly the three groups the owner chose, under 'Openstaande punten'", async () => {
    renderToday();
    expect(await screen.findByText("Openstaande punten")).toBeInTheDocument();
    expect(screen.getByTestId("today-group-handovers")).toHaveTextContent(
      "Vandaag ophalen en innemen",
    );
    expect(screen.getByTestId("today-group-maintenance")).toHaveTextContent(
      "Onderhoud en transport vandaag",
    );
    expect(screen.getByTestId("today-group-portal")).toHaveTextContent(
      "Nieuwe portaalaanvragen",
    );
    expect(screen.getByTestId("today-open-count")).toHaveTextContent("6");
  });

  it("group 2 holds the block, the transport and the spare that still needs a vehicle", async () => {
    renderToday();
    const group = await screen.findByTestId("today-group-maintenance");
    expect(group).toContainElement(screen.getByTestId("today-maintenance-303"));
    expect(group).toContainElement(screen.getByTestId("today-transport-404"));
    expect(group).toContainElement(screen.getByTestId("today-spare-505"));
    // "inclusief vervangers die nog toegewezen moeten worden" — the transport
    // whose spare is still TBD says so where the employee can see it.
    expect(screen.getByTestId("today-transport-spare-tbd-404")).toBeInTheDocument();
  });

  it("B-17: there is no 'te laat terug' list anywhere on the screen", async () => {
    renderToday();
    await screen.findByTestId("today-group-handovers");
    expect(screen.queryByText(/te laat/i)).toBeNull();
    expect(screen.queryByText(/achterstallig/i)).toBeNull();
    expect(screen.queryByTestId("today-group-overdue")).toBeNull();
  });

  it("is Dutch, from the locale files — no key leaks through", async () => {
    renderToday();
    await screen.findByTestId("today-group-handovers");
    expect(screen.getByTestId("today-title")).toHaveTextContent("Vandaag");
    expect(screen.getByTestId("today-date")).toHaveTextContent("dinsdag 15 juni 2032");
    expect(document.body.textContent).not.toMatch(/today\.[a-zA-Z]/);
  });
});

describe("OPT-001 — every row acts where it stands", () => {
  beforeEach(() => stubFetch(fullBoard()));

  it("a pickup starts the pickup dialog for that reservation", async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByTestId("button-today-pickup-101"));
    expect(await screen.findByTestId("pickup-dialog-101")).toBeInTheDocument();
    expect(screen.queryByTestId("return-dialog-101")).toBeNull();
  });

  it("a return starts the return dialog for that reservation", async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByTestId("button-today-return-202"));
    expect(await screen.findByTestId("return-dialog-202")).toBeInTheDocument();
    expect(screen.queryByTestId("pickup-dialog-202")).toBeNull();
  });

  it("an unassigned spare opens the assignment", async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByTestId("button-today-assign-spare-505"));
    expect(openSpareAssignmentDialog).toHaveBeenCalledWith(505);
  });

  it("a portal request opens its review", async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByTestId("button-today-review-request-606"));
    expect(openPortalRequestDialog).toHaveBeenCalledWith(606);
  });

  it("a maintenance block opens the block itself", async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByTestId("button-today-maintenance-303"));
    expect(openReservationDialog).toHaveBeenCalledWith(303);
  });

  it("a transport opens the transports page's own dialog", async () => {
    const user = userEvent.setup();
    renderToday();
    await user.click(await screen.findByTestId("button-today-transport-404"));
    expect(await screen.findByTestId("transport-dialog-404")).toBeInTheDocument();
  });

  it("the row's own reservation is fetched only when the button is pressed", async () => {
    const user = userEvent.setup();
    renderToday();
    await screen.findByTestId("today-group-handovers");
    expect(
      fetchMock.mock.calls.filter((c) => /^\/api\/reservations\//.test(String(c[0]))),
    ).toHaveLength(0);

    await user.click(screen.getByTestId("button-today-pickup-101"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/reservations/101"),
      ).toHaveLength(1),
    );
  });
});

describe("OPT-001 — the empty state", () => {
  it("says so plainly instead of showing three empty cards", async () => {
    stubFetch(emptyBoard());
    renderToday();

    const empty = await screen.findByTestId("today-empty-state");
    expect(empty).toHaveTextContent("Er staat niets open");
    expect(screen.queryByTestId("today-group-handovers")).toBeNull();
    expect(screen.queryByTestId("today-group-maintenance")).toBeNull();
    expect(screen.queryByTestId("today-group-portal")).toBeNull();
    expect(screen.queryByText("Openstaande punten")).toBeNull();
  });

  it("a group with nothing in it is not rendered while the others are", async () => {
    const board = fullBoard();
    board.portalRequests = [];
    board.counts.portalRequests = 0;
    board.counts.total = 5;
    stubFetch(board);
    renderToday();

    await screen.findByTestId("today-group-handovers");
    expect(screen.getByTestId("today-group-maintenance")).toBeInTheDocument();
    expect(screen.queryByTestId("today-group-portal")).toBeNull();
    expect(screen.queryByTestId("today-empty-state")).toBeNull();
  });
});
