/**
 * Final wave, item 1 (final-wave-brief.md, found by Task 4,
 * task-4-report.md "Finding") — "Annuleren" in the embedded add-customer
 * form did nothing: `CustomerForm`'s cancel button only navigated to
 * `/customers` when `redirectToList` was true; the embedded case (this
 * dialog, `redirectToList={false}`) only called `form.reset()`, because the
 * form had no way to reach `CustomerAddDialog`'s own `setOpen`. The fix adds
 * an `onCancel` prop that the dialog wires to `setOpen(false)`.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

// CustomerAddDialog's default trigger is gated with RequiresPermission
// (MANAGE_CUSTOMERS), which reads useAuth() — give it an admin so the
// trigger renders without wiring up a real AuthProvider.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { CustomerAddDialog } from "@/components/customers/customer-add-dialog";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  // Nothing in this test submits the form — any fetch call would be a bug.
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <CustomerAddDialog />
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("CustomerAddDialog — Annuleren sluit de dialoog", () => {
  it("sluit de dialoog wanneer op Annuleren wordt geklikt", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("button-add-customer"));
    expect(await screen.findByLabelText("Volledige naam")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Annuleren" }));
    expect(screen.queryByLabelText("Volledige naam")).not.toBeInTheDocument();
  });
});
