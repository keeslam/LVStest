/**
 * OPT-016 — the UI half: a bulk action reports a result per row.
 *
 * "Een groene toast verbergt een halve batch" — the dialog showed
 * "N bijgewerkt" and cleared the whole selection, whether or not every row had
 * gone through. Now the rows that failed are named with their own reason and
 * stay selected, so a retry is one click.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toasts: Array<{ title?: string; description?: string; variant?: string }> = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: any) => { toasts.push(t); } }),
}));

const openRdwApkChangesDialog = vi.fn();
const closeRdwApkChangesDialog = vi.fn();
vi.mock("@/contexts/GlobalDialogContext", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/contexts/GlobalDialogContext");
  return {
    ...actual,
    useGlobalDialog: () => ({
      dialogState: { rdwApkChanges: { open: true } },
      openRdwApkChangesDialog,
      closeRdwApkChangesDialog,
    }),
  };
});

import { ApkDateChangesDialog } from "@/components/vehicles/apk-date-changes-dialog";

const pending = [
  { id: 11, vehicleId: 1, licensePlate: "AB123C", brand: "VW", model: "Crafter", previousApkDate: "2026-01-01", newApkDate: "2027-01-01", status: "pending", detectedAt: "2026-09-01T10:00:00.000Z" },
  { id: 12, vehicleId: 2, licensePlate: "CD456E", brand: "VW", model: "Caddy", previousApkDate: "2026-02-01", newApkDate: "2027-02-01", status: "pending", detectedAt: "2026-09-01T10:00:00.000Z" },
];

let bulkResponse: unknown;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, queryFn: async () => pending },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ApkDateChangesDialog />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toasts.length = 0;
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
  bulkResponse = {
    results: [{ id: 11, ok: true }, { id: 12, ok: false, reason: "not_pending", message: "Already confirmed." }],
    succeeded: 1,
    failed: 1,
    confirmed: 1,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    if (String(url).includes("bulk-")) return json(bulkResponse);
    return json(pending);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function selectAllAndConfirm() {
  const user = userEvent.setup();
  renderDialog();
  await user.click(await screen.findByTestId("checkbox-select-all-apk-changes"));
  await user.click(await screen.findByTestId("button-bulk-confirm-apk-changes"));
  return user;
}

describe("OPT-016 — de bulkactie vertelt wat er per rij gebeurde", () => {
  it("names the failed row and its reason instead of one green count", async () => {
    await selectAllAndConfirm();
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    const last = toasts.at(-1)!;
    expect(last.title).toBe("1 gelukt, 1 mislukt");
    expect(last.description).toContain("#12");
    expect(last.description).toContain("Al afgehandeld");
  });

  it("keeps exactly the failed rows selected, so a retry is one click", async () => {
    await selectAllAndConfirm();
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    await waitFor(() => {
      expect((screen.getByTestId("checkbox-select-apk-change-12") as HTMLElement).getAttribute("data-state")).toBe("checked");
      expect((screen.getByTestId("checkbox-select-apk-change-11") as HTMLElement).getAttribute("data-state")).toBe("unchecked");
    });
  });

  it("a batch where everything worked is still one plain success message", async () => {
    bulkResponse = { results: [{ id: 11, ok: true }, { id: 12, ok: true }], succeeded: 2, failed: 0, confirmed: 2 };
    await selectAllAndConfirm();
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    const last = toasts.at(-1)!;
    expect(last.variant).toBeUndefined();
    expect(last.description).toContain("2");
  });

  it("a batch where nothing worked is reported as a failure", async () => {
    bulkResponse = {
      results: [
        { id: 11, ok: false, reason: "not_found", message: "gone" },
        { id: 12, ok: false, reason: "error", message: "database is down" },
      ],
      succeeded: 0,
      failed: 2,
      confirmed: 0,
    };
    await selectAllAndConfirm();
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    const last = toasts.at(-1)!;
    expect(last.variant).toBe("destructive");
    expect(last.title).toBe("Geen enkele regel is verwerkt");
    expect(last.description).toContain("Bestaat niet meer");
    // An unrecognised reason falls back to the server's own message.
    expect(last.description).toContain("database is down");
  });
});
