/**
 * BUG-225, one dialog further — "Klikken naast de dialoog gooit alles weg wat
 * er is ingetypt."
 *
 * Wave 9 protected the *new* reservation dialog. The edit dialog had the same
 * defect, and it is the worse of the two: the typing there is on top of a real
 * reservation. The rule itself lives in `dirty-close-guard.ts` and is tested
 * against a bare Radix dialog in `components/__tests__/dirty-dialog.test.tsx`;
 * what this file proves is the **wiring** — the edit dialog really hands the
 * form an `onDirtyChange` and really consults the guard before closing.
 *
 * The 3 000-line reservation form is replaced by a stub that does what the real
 * one does: it reports dirtiness when something is typed.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/reservations/reservation-form", () => ({
  ReservationForm: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => {
    const [value, setValue] = useState("");
    return (
      <input
        aria-label="opmerkingen"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onDirtyChange?.(e.target.value.length > 0);
        }}
      />
    );
  },
}));

const { ReservationEditDialog } = await import("@/components/reservations/reservation-edit-dialog");

const reservation = {
  id: 3339, vehicleId: 42, customerId: 12,
  startDate: "2030-01-01", endDate: "2030-01-05", status: "booked", type: "standard",
} as any;

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => reservation, retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  const result = render(
    <QueryClientProvider client={client}>
      <ReservationEditDialog open onOpenChange={onOpenChange} reservationId={reservation.id} />
    </QueryClientProvider>,
  );
  return { ...result, onOpenChange };
}

/** Radix arms its document-level pointerdown listener one macrotask after mount. */
const afterRadixArmedItsListeners = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BUG-225 — the reservation edit dialog keeps what was typed", () => {
  it("survives a click next to the dialog once something has been typed", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const input = await screen.findByLabelText("opmerkingen");
    await user.type(input, "nieuwe afspraak met de klant");
    expect(input).toHaveValue("nieuwe afspraak met de klant");
    await afterRadixArmedItsListeners();

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(screen.getByTestId("dialog-reservation-edit")).toBeInTheDocument();
    expect(screen.getByLabelText("opmerkingen")).toHaveValue("nieuwe afspraak met de klant");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("still closes on an outside click while nothing has been typed", async () => {
    const { onOpenChange } = renderDialog();

    await screen.findByLabelText("opmerkingen");
    await afterRadixArmedItsListeners();

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    // An untouched form is not worth protecting: the old behaviour stays.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
