/**
 * OPT-001 — the dashboard's entry to "Vandaag".
 *
 * B-17 decided the *content* of the work-day screen and left open whether it
 * replaces the dashboard. The smaller, reversible option was taken: a new
 * route plus this prominent entry, with every existing dashboard widget left
 * where it was. What is pinned here is that the entry is prominent, that it
 * tells the employee whether anything is open before they click, and that it
 * costs no extra request — it shares the screen's own query key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { TodayBoard } from "@shared/today";
import { TodayEntry } from "@/components/dashboard/today-entry";
import { todayBoardQueryKey, localToday } from "@/hooks/use-today-board";

const FROZEN_NOW = new Date(2032, 5, 15, 9, 0, 0);

function board(total: number): TodayBoard {
  return {
    date: "2032-06-15",
    pickups: [],
    returns: [],
    maintenance: [],
    transports: [],
    spareAssignments: [],
    portalRequests: [],
    counts: {
      pickups: total,
      returns: 0,
      maintenance: 0,
      transports: 0,
      spareAssignments: 0,
      portalRequests: 0,
      total,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderEntry(total: number) {
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(board(total)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) },
    },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <TodayEntry />
    </QueryClientProvider>,
  );
  return { ...result, client };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OPT-001 — the dashboard entry to Vandaag", () => {
  it("names the screen and links to it", async () => {
    renderEntry(4);
    const entry = await screen.findByTestId("dashboard-today-entry");
    expect(entry).toHaveTextContent("Vandaag");
    expect(screen.getByTestId("button-open-today").closest("a")).toHaveAttribute(
      "href",
      "/vandaag",
    );
  });

  it("says how much is open before the employee clicks", async () => {
    renderEntry(4);
    expect(await screen.findByText("4 openstaande punten")).toBeInTheDocument();
  });

  it("says so when nothing is open", async () => {
    renderEntry(0);
    expect(await screen.findByText("Er staat niets open")).toBeInTheDocument();
  });

  it("uses the screen's own query key, so opening Vandaag costs no second request", async () => {
    const { client } = renderEntry(2);
    await screen.findByTestId("dashboard-today-entry");
    expect(client.getQueryData(todayBoardQueryKey(localToday()))).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/today?date=2032-06-15");
  });
});
