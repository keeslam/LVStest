/**
 * D2 (besluiten D, spec §2): bulk import and plates the RDW does not know.
 *
 * The checkbox "Ook onbekende kentekens aanmaken" decides whether such a plate
 * is created; it sits above both tabs (kentekens and CSV). The result card has
 * three groups (geslaagd / waarschuwing / mislukt) and every warning is worded
 * by its code, so an RDW outage no longer reads "Niet gevonden bij de RDW".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toasts: Array<{ title?: string; description?: string; variant?: string }> = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: any) => { toasts.push(t); } }),
}));

import { VehicleBulkImportDialog } from "@/components/vehicles/vehicle-bulk-import-dialog";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let bodies: Array<{ url: string; body: any }>;
let answer: unknown;

beforeEach(() => {
  toasts.length = 0;
  bodies = [];
  answer = {
    imported: [{ licensePlate: "AA11BB", vehicle: { brand: "VW", model: "Crafter" }, enriched: true }],
    warnings: [
      { licensePlate: "SKIP01", code: "RDW_NOT_FOUND_SKIPPED", enrichmentReason: "not_found" },
      { licensePlate: "MADE01", code: "RDW_NOT_FOUND_CREATED", vehicle: { brand: "Unknown", model: "Unknown" } },
      { licensePlate: "SLOW01", code: "RDW_UNAVAILABLE_CREATED", vehicle: { brand: "Unknown", model: "Unknown" }, enrichmentReason: "timeout" },
    ],
    failed: [{ licensePlate: "DUP001", error: "Vehicle already exists", code: "VEHICLE_ALREADY_EXISTS" }],
    maxBatch: 100,
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      bodies.push({ url: String(input), body: JSON.parse(String(init.body)) });
      return json(answer);
    }
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function openDialog() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <VehicleBulkImportDialog>
        <button type="button" data-testid="open-import">open</button>
      </VehicleBulkImportDialog>
    </QueryClientProvider>,
  );
  await user.click(screen.getByTestId("open-import"));
  await screen.findByRole("dialog");
  return user;
}

describe("D2 - checkbox 'ook onbekende kentekens aanmaken'", () => {
  it("is off by default and is sent as createUnknown false", async () => {
    const user = await openDialog();
    const box = screen.getByTestId("checkbox-import-create-unknown");
    expect(box).toHaveAttribute("aria-checked", "false");

    await user.type(screen.getByRole("textbox"), "AA11BB");
    await user.click(screen.getByTestId("button-start-import"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].url).toContain("/api/vehicles/bulk-import-plates");
    expect(bodies[0].body.createUnknown).toBe(false);
  });

  it("is sent as createUnknown true once ticked", async () => {
    const user = await openDialog();
    await user.click(screen.getByTestId("checkbox-import-create-unknown"));
    expect(screen.getByTestId("checkbox-import-create-unknown")).toHaveAttribute("aria-checked", "true");

    await user.type(screen.getByRole("textbox"), "AA11BB");
    await user.click(screen.getByTestId("button-start-import"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].body.createUnknown).toBe(true);
  });

  it("is also there on the CSV tab (same checkbox, same value)", async () => {
    const user = await openDialog();
    await user.click(screen.getByTestId("checkbox-import-create-unknown"));
    await user.click(screen.getByRole("tab", { name: /csv/i }));
    expect(screen.getByTestId("checkbox-import-create-unknown")).toHaveAttribute("aria-checked", "true");
  });
});

describe("D2 - result card with three groups", () => {
  async function runImport() {
    const user = await openDialog();
    await user.type(screen.getByRole("textbox"), "AA11BB");
    await user.click(screen.getByTestId("button-start-import"));
    return screen.findByTestId("import-results");
  }

  it("lists geslaagd, waarschuwing and mislukt separately", async () => {
    const card = await runImport();
    expect(within(card).getByTestId("import-row-AA11BB")).toBeInTheDocument();
    expect(within(card).getByTestId("import-warning-SKIP01")).toBeInTheDocument();
    expect(within(card).getByTestId("import-warning-MADE01")).toBeInTheDocument();
    expect(within(card).getByTestId("import-warning-SLOW01")).toBeInTheDocument();
    // A warning row is not counted among the successes.
    expect(within(card).queryByTestId("import-row-SKIP01")).not.toBeInTheDocument();
    expect(within(card).getByText(/DUP001/)).toBeInTheDocument();
  });

  it("words each warning by its code; a timeout never reads 'Niet gevonden'", async () => {
    const card = await runImport();
    expect(within(card.querySelector('[data-testid="import-warning-SKIP01"]') as HTMLElement)
      .getByText(/niet aangemaakt/i)).toBeInTheDocument();
    expect(within(card.querySelector('[data-testid="import-warning-MADE01"]') as HTMLElement)
      .getByText(/wel aangemaakt/i)).toBeInTheDocument();
    const slow = card.querySelector('[data-testid="import-warning-SLOW01"]') as HTMLElement;
    expect(within(slow).getByText(/RDW niet bereikbaar/i)).toBeInTheDocument();
    expect(slow.textContent).not.toMatch(/niet gevonden/i);
  });

  it("the toast counts geslaagd, waarschuwing and mislukt apart", async () => {
    await runImport();
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    const description = String(toasts[0].description);
    expect(description).toMatch(/1 voertuig/);
    expect(description).toMatch(/3 met waarschuwing/);
    expect(description).toMatch(/1 mislukt/);
  });
});
