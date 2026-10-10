/**
 * A-3-9: a bin kept listing rows that had already been put back (30 restored
 * "Annuleertest" fines). Restored rows are hidden by default; a checkbox shows
 * them again, with their "teruggezet door" line and a disabled restore button.
 *
 * Runs in the jsdom project, real i18n (setup-jsdom.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { RecycleBinDialog } from "@/components/recycle-bin/recycle-bin-dialog";

const row = (over: Record<string, unknown>) => ({
  entityId: 1,
  relatedCounts: {},
  deletedAt: "2026-09-01T10:00:00.000Z",
  deletedBy: "kees",
  restoredAt: null,
  restoredBy: null,
  entityType: "fine",
  ...over,
});

const ROWS = [
  row({ id: 1, label: "Boete AB-123-C" }),
  row({ id: 2, label: "Annuleertest 1", restoredAt: "2026-09-05T10:00:00.000Z", restoredBy: "anna" }),
  row({ id: 3, label: "Annuleertest 2", restoredAt: "2026-09-05T10:00:00.000Z", restoredBy: "anna" }),
];

beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(ROWS), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

function renderBin() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RecycleBinDialog kind="fine" open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("RecycleBinDialog - restored rows (A-3-9)", () => {
  it("hides restored rows by default and says how many are hidden", async () => {
    renderBin();
    expect(await screen.findByTestId("deleted-record-1")).toBeInTheDocument();
    expect(screen.queryByTestId("deleted-record-2")).toBeNull();
    expect(screen.queryByTestId("deleted-record-3")).toBeNull();
    expect(screen.getByTestId("label-show-restored")).toHaveTextContent("Teruggezette items ook tonen (2)");
  });

  it("the checkbox brings them back, with who restored them and a disabled restore button", async () => {
    const user = userEvent.setup();
    renderBin();
    await screen.findByTestId("deleted-record-1");
    await user.click(screen.getByTestId("checkbox-show-restored"));

    const restored = await screen.findByTestId("deleted-record-2");
    expect(restored).toHaveTextContent("Teruggezet");
    expect(restored).toHaveTextContent("anna");
    expect(screen.getByTestId("button-restore-2")).toBeDisabled();
    expect(screen.getByTestId("button-restore-1")).toBeEnabled();
  });

  it("offers no checkbox when nothing in the bin was restored", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([ROWS[0]]), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    renderBin();
    await screen.findByTestId("deleted-record-1");
    expect(screen.queryByTestId("checkbox-show-restored")).toBeNull();
  });
});
