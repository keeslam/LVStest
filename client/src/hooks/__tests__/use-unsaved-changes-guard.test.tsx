/**
 * A-3-10, A-4-8 (audit 2026-10-09): Escape / Annuleren discarded what was typed
 * in the vehicle and customer forms without a word. Dirty asks "Wijzigingen
 * verwerpen?", clean closes at once. One vehicle dialog and one customer dialog.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] }, isLoading: false }),
}));

import { VehicleAddDialog } from "@/components/vehicles/vehicle-add-dialog";
import { CustomerAddDialog } from "@/components/customers/customer-add-dialog";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>{node}</GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("vehicle add dialog", () => {
  it("closes at once on Escape while nothing was typed", async () => {
    const user = userEvent.setup();
    renderWith(<VehicleAddDialog />);
    await user.click(screen.getByTestId("button-add-vehicle"));
    expect(await screen.findByTestId("input-vehicle-license-plate")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("input-vehicle-license-plate")).not.toBeInTheDocument());
    expect(screen.queryByText("Wijzigingen verwerpen?")).not.toBeInTheDocument();
  });

  it("asks before Escape discards typed input, and keeps the input when told to keep editing", async () => {
    const user = userEvent.setup();
    renderWith(<VehicleAddDialog />);
    await user.click(screen.getByTestId("button-add-vehicle"));
    const plate = await screen.findByTestId("input-vehicle-license-plate");
    await user.type(plate, "AB123C");
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Wijzigingen verwerpen?")).toBeInTheDocument();
    expect(screen.getByTestId("input-vehicle-license-plate")).toHaveDisplayValue(/AB.?123.?C/);

    await user.click(screen.getByRole("button", { name: "Verder bewerken" }));
    await waitFor(() => expect(screen.queryByText("Wijzigingen verwerpen?")).not.toBeInTheDocument());
    expect(screen.getByTestId("input-vehicle-license-plate")).toHaveDisplayValue(/AB.?123.?C/);
  });

  it("closes after the discard is confirmed", async () => {
    const user = userEvent.setup();
    renderWith(<VehicleAddDialog />);
    await user.click(screen.getByTestId("button-add-vehicle"));
    await user.type(await screen.findByTestId("input-vehicle-license-plate"), "AB123C");
    await user.click(screen.getByRole("button", { name: "Annuleren" }));
    await user.click(await screen.findByTestId("button-discard-changes"));
    await waitFor(() => expect(screen.queryByTestId("input-vehicle-license-plate")).not.toBeInTheDocument());
  });
});

describe("customer add dialog", () => {
  it("closes at once on Annuleren while clean", async () => {
    const user = userEvent.setup();
    renderWith(<CustomerAddDialog />);
    await user.click(screen.getByTestId("button-add-customer"));
    expect(await screen.findByLabelText("Volledige naam")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Annuleren" }));
    await waitFor(() => expect(screen.queryByLabelText("Volledige naam")).not.toBeInTheDocument());
    expect(screen.queryByText("Wijzigingen verwerpen?")).not.toBeInTheDocument();
  });

  it("asks when a click next to the dialog or Annuleren would discard input", async () => {
    const user = userEvent.setup();
    renderWith(<CustomerAddDialog />);
    await user.click(screen.getByTestId("button-add-customer"));
    await user.type(await screen.findByLabelText("Volledige naam"), "Audit Testklant");
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Wijzigingen verwerpen?")).toBeInTheDocument();
    expect(screen.getByLabelText("Volledige naam")).toHaveValue("Audit Testklant");
    await user.click(screen.getByRole("button", { name: "Verder bewerken" }));
    await waitFor(() => expect(screen.queryByText("Wijzigingen verwerpen?")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Annuleren" }));
    expect(await screen.findByText("Wijzigingen verwerpen?")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-discard-changes"));
    await waitFor(() => expect(screen.queryByLabelText("Volledige naam")).not.toBeInTheDocument());
  });
});
