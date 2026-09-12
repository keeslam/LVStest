/**
 * BUG-225 — "Klikken naast de nieuwe-reserveringsdialoog gooit alles weg wat
 * er is ingetypt."
 *
 * The guard is wired into `reservation-add-dialog.tsx`, but that dialog mounts
 * the 3 000-line reservation form and a dozen queries behind it. What has to be
 * proven is the *interaction*: a real Radix dialog, a real pointer-down on the
 * backdrop, and the dialog still standing. So the test mounts the same Radix
 * `Dialog`/`DialogContent` with the same guard, which is exactly what the
 * reservation dialog does.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createDirtyCloseGuard } from "@/components/dialogs/dirty-close-guard";

function DialogHarness({ onBlocked }: { onBlocked: () => void }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState("");
  const dirtyRef = useRef(false);
  dirtyRef.current = value.length > 0;

  const keepOpenBecauseDirty = createDirtyCloseGuard({
    isDirty: () => dirtyRef.current,
    onBlocked,
  });

  return (
    <>
      <button>ergens anders op het scherm</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onPointerDownOutside={(e) => {
            if (keepOpenBecauseDirty(e)) return;
          }}
          onInteractOutside={(e) => {
            if (keepOpenBecauseDirty(e)) return;
          }}
        >
          <DialogHeader>
            <DialogTitle>Nieuwe reservering</DialogTitle>
          </DialogHeader>
          <input
            aria-label="contractnummer"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Radix attaches its document-level `pointerdown` listener in a `setTimeout(0)`
 * after the layer mounts, so an outside click fired in the same tick as the
 * render reaches nobody. One macrotask of waiting is the difference between
 * testing the dismiss behaviour and testing nothing at all.
 */
const afterRadixArmedItsListeners = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("BUG-225 — a dialog with typed-in data survives a click outside", () => {
  it("keeps the dialog and every typed character after a pointer-down on the backdrop", async () => {
    const user = userEvent.setup();
    const onBlocked = vi.fn();
    render(<DialogHarness onBlocked={onBlocked} />);

    const input = screen.getByLabelText("contractnummer");
    await user.type(input, "CN-2026-0042");
    expect(input).toHaveValue("CN-2026-0042");
    await afterRadixArmedItsListeners();

    // The accident: a click next to the dialog.
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    // Nothing was thrown away, and the user was told why the click did nothing.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("contractnummer")).toHaveValue("CN-2026-0042");
    await waitFor(() => expect(onBlocked).toHaveBeenCalled());
  });

  it("still closes on an outside click while nothing has been typed", async () => {
    const onBlocked = vi.fn();
    render(<DialogHarness onBlocked={onBlocked} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await afterRadixArmedItsListeners();

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    // An empty form is not worth protecting: the old behaviour stays.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("the close button is still a decision and still closes a dirty dialog", async () => {
    const user = userEvent.setup();
    const onBlocked = vi.fn();
    render(<DialogHarness onBlocked={onBlocked} />);

    await user.type(screen.getByLabelText("contractnummer"), "CN-2026-0042");
    await user.click(screen.getByRole("button", { name: /close|sluiten/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
