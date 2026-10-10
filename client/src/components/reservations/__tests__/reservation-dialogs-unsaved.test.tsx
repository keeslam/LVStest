/**
 * Final wave A, item 6: the reservation add and edit dialogs use the shared unsaved-changes guard
 * (client/src/hooks/use-unsaved-changes-guard.ts). Escape, the X, a click next to the dialog and the
 * form's own Annuleren/Sluiten ask "Wijzigingen verwerpen?" once something was typed and close at once
 * while the form is clean; a dialog nested inside (quick add driver, customer search ...) still closes
 * on its own Escape without the parent asking anything.
 *
 * The 3 000-line reservation form is a stub that does what the real one does towards the dialog: it
 * reports dirtiness, has a Cancel button, and hosts a nested Radix dialog.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

vi.mock("@/components/reservations/reservation-form", () => ({
  ReservationForm: ({ onDirtyChange, onCancel }: { onDirtyChange?: (dirty: boolean) => void; onCancel?: () => void }) => {
    const [value, setValue] = useState("");
    const [nested, setNested] = useState(false);
    return (
      <div>
        <input
          aria-label="opmerkingen"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onDirtyChange?.(e.target.value.length > 0);
          }}
        />
        <button type="button" onClick={onCancel}>stub-annuleren</button>
        <button type="button" onClick={() => setNested(true)}>stub-open-sub</button>
        <Dialog open={nested} onOpenChange={setNested}>
          <DialogContent>
            <DialogTitle>Sub-dialoog</DialogTitle>
            <DialogDescription>Snel een chauffeur toevoegen</DialogDescription>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
}));

const reservation = { id: 3339, vehicleId: 42, customerId: 12, startDate: "2030-01-01", endDate: "2030-01-05", status: "booked", type: "standard" } as any;

const { ReservationAddDialog } = await import("@/components/reservations/reservation-add-dialog");
const { ReservationEditDialog } = await import("@/components/reservations/reservation-edit-dialog");

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: async () => reservation, retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const DIALOGS = [
  ["add dialog", () => <AddHarness />],
  ["edit dialog", () => <EditHarness />],
] as const;

function AddHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <ReservationAddDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
function EditHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <ReservationEditDialog open={open} onOpenChange={setOpen} reservationId={reservation.id} />
    </>
  );
}

describe.each(DIALOGS)("reservation %s", (_name, harness) => {
  it("closes on Escape at once while nothing was typed", async () => {
    const user = userEvent.setup();
    withClient(harness());
    await screen.findByLabelText("opmerkingen");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
    expect(screen.queryByText("Wijzigingen verwerpen?")).toBeNull();
  });

  it("asks on Escape once something was typed, keeps the text on 'Verder bewerken' and closes on 'Verwerpen'", async () => {
    const user = userEvent.setup();
    withClient(harness());
    await user.type(await screen.findByLabelText("opmerkingen"), "afspraak met de klant");
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Wijzigingen verwerpen?")).toBeInTheDocument();
    expect(screen.getByTestId("state")).toHaveTextContent("open");

    await user.click(screen.getByRole("button", { name: "Verder bewerken" }));
    await waitFor(() => expect(screen.queryByText("Wijzigingen verwerpen?")).toBeNull());
    expect(screen.getByLabelText("opmerkingen")).toHaveValue("afspraak met de klant");

    await user.click(screen.getByRole("button", { name: "stub-annuleren" }));
    await user.click(await screen.findByTestId("button-discard-changes"));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
  });

  it("the form's own cancel button closes at once while clean", async () => {
    const user = userEvent.setup();
    withClient(harness());
    await user.click(await screen.findByRole("button", { name: "stub-annuleren" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
  });

  it("a nested dialog closes on its own Escape and the parent neither closes nor asks", async () => {
    const user = userEvent.setup();
    withClient(harness());
    await user.type(await screen.findByLabelText("opmerkingen"), "x");
    await user.click(screen.getByRole("button", { name: "stub-open-sub" }));
    expect(await screen.findByText("Sub-dialoog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Sub-dialoog")).toBeNull());
    expect(screen.getByTestId("state")).toHaveTextContent("open");
    expect(screen.getByLabelText("opmerkingen")).toHaveValue("x");
    expect(screen.queryByText("Wijzigingen verwerpen?")).toBeNull();
  });
});
