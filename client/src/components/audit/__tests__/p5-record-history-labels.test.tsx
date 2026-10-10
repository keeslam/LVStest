/**
 * Audit remediation P5, A-6-4 (shared with A-4-5) - the history of a record
 * showed the audit log's codes ("reservation.pickup", "customer.create") as if
 * they were text for people. They are worded now; a code nobody has worded yet
 * still shows as it is rather than disappearing.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordHistory } from "@/components/audit/record-history";
import { getQueryFn } from "@/lib/queryClient";

function entry(id: number, action: string) {
  return {
    id,
    username: "balie",
    action,
    resourceType: "reservation",
    resourceId: "3200",
    details: null,
    status: "success",
    createdAt: "2026-10-09T13:05:00.000Z",
  };
}

const logs = [
  entry(1, "reservation.pickup"),
  entry(2, "reservation.return"),
  entry(3, "reservation.revert"),
  entry(4, "reservation.status"),
  entry(5, "reservation.cancel"),
  entry(6, "reservation.create"),
  entry(7, "reservation.update"),
  entry(8, "customer.create"),
  entry(9, "vehicle.restore"),
  entry(10, "document.upload"),
  entry(11, "frobnicator.explode"),
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ logs, total: logs.length }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecordHistory resourceType="reservation" resourceId={3200} />
    </QueryClientProvider>,
  );
}

describe("A-6-4 - audit codes are worded in the record history", () => {
  it("shows Dutch words for the handover steps and the usual changes", async () => {
    renderHistory();
    const text = async (id: number) => (await screen.findByTestId(`record-history-entry-${id}`)).textContent ?? "";
    expect(await text(1)).toContain("Ophalen");
    expect(await text(2)).toContain("Inleveren");
    expect(await text(3)).toContain("Overdracht teruggedraaid");
    expect(await text(4)).toContain("Status gewijzigd");
    expect(await text(5)).toContain("Geannuleerd");
    expect(await text(6)).toContain("Reservering aangemaakt");
    expect(await text(7)).toContain("Reservering gewijzigd");
    expect(await text(8)).toContain("Klant aangemaakt");
    expect(await text(9)).toContain("Voertuig hersteld");
    expect(await text(10)).toContain("Document geüpload");
  });

  it("never shows the raw code for a known action", async () => {
    renderHistory();
    const list = await screen.findByTestId("record-history-list");
    for (const code of ["reservation.pickup", "reservation.return", "reservation.revert", "customer.create", "vehicle.restore"]) {
      expect(list.textContent, code).not.toContain(code);
    }
  });

  it("keeps an unknown code visible, so nothing is hidden", async () => {
    renderHistory();
    expect(await screen.findByTestId("record-history-entry-11")).toHaveTextContent("frobnicator.explode");
  });
});
