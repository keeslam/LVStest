/**
 * OPT-022 — the "Geschiedenis" tab.
 *
 * The server half (the `resourceId` filter and the per-record endpoint) is
 * pinned in `server/__tests__/opt-022-record-history.test.ts`. This is the tab
 * itself: it asks for exactly one record, it renders the field-level changes
 * the audit log has always stored, and a viewer without the permission gets an
 * explanation instead of a red error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordHistory, recordHistoryUrl, formatHistoryValue } from "@/components/audit/record-history";
import { getQueryFn } from "@/lib/queryClient";

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const rows = {
  logs: [
    {
      id: 11,
      username: "balie",
      action: "reservation.update",
      resourceType: "reservation",
      resourceId: "3563",
      details: { changes: [{ field: "endDate", from: "2026-03-10", to: "2026-03-12" }] },
      status: "success",
      createdAt: "2026-03-09T13:05:00.000Z",
    },
    {
      id: 10,
      username: null,
      action: "reservation.create",
      resourceType: "reservation",
      resourceId: "3563",
      details: { operation: "create" },
      status: "success",
      createdAt: "2026-03-08T09:00:00.000Z",
    },
  ],
  total: 2,
};

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => respond(200, rows));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OPT-022 — Geschiedenis per record", () => {
  it("asks for exactly one record instead of the whole activity log", async () => {
    withClient(<RecordHistory resourceType="reservation" resourceId={3563} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("/api/audit-logs/resource/reservation/3563");
    expect(recordHistoryUrl("vehicle", 42)).toBe("/api/audit-logs/resource/vehicle/42");
  });

  it("renders the field-level change with its old and new value", async () => {
    withClient(<RecordHistory resourceType="reservation" resourceId={3563} />);
    expect(await screen.findByTestId("record-history-list")).toBeInTheDocument();
    expect(screen.getByText("endDate:")).toBeInTheDocument();
    expect(screen.getByText("2026-03-10")).toBeInTheDocument();
    expect(screen.getByText("2026-03-12")).toBeInTheDocument();
    expect(screen.getByText("balie")).toBeInTheDocument();
  });

  it("names the system where the audit row has no username", async () => {
    withClient(<RecordHistory resourceType="reservation" resourceId={3563} />);
    expect(await screen.findByTestId("record-history-entry-10")).toBeInTheDocument();
    expect(screen.getByText("Systeem")).toBeInTheDocument();
  });

  it("says so in Dutch when the record has no history yet", async () => {
    fetchMock.mockImplementation(async () => respond(200, { logs: [], total: 0 }));
    withClient(<RecordHistory resourceType="customer" resourceId={7} />);
    expect(await screen.findByTestId("record-history-empty")).toHaveTextContent(
      "Er is nog niets gewijzigd aan dit record.",
    );
  });

  it("explains a 403 instead of showing a failure", async () => {
    fetchMock.mockImplementation(async () => respond(403, { message: "nope" }));
    withClient(<RecordHistory resourceType="vehicle" resourceId={9} />);
    expect(await screen.findByTestId("record-history-forbidden")).toHaveTextContent(
      "Je hebt geen rechten om de geschiedenis van dit record te bekijken.",
    );
  });

  it("reports a real failure as a failure", async () => {
    fetchMock.mockImplementation(async () => respond(500, { message: "boom" }));
    withClient(<RecordHistory resourceType="vehicle" resourceId={9} />);
    expect(await screen.findByTestId("record-history-error")).toHaveTextContent(
      "De geschiedenis kon niet geladen worden.",
    );
  });

  it("never renders [object Object] for a structured value", () => {
    expect(formatHistoryValue({ a: 1 })).toBe('{"a":1}');
    expect(formatHistoryValue(null)).toBe("—");
    expect(formatHistoryValue("")).toBe("—");
    expect(formatHistoryValue(true)).toBe("ja");
  });
});
