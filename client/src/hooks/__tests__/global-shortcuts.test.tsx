/**
 * OPT-021 — the handler in a real DOM, plus the overview that makes the keys
 * discoverable.
 *
 * The pure rule is pinned in `client/src/lib/__tests__/keyboard-shortcuts.test.ts`.
 * What this adds is the part only a DOM can show: a keystroke aimed at a real
 * focused `<input>` — the scanner's case — must reach the field and not the
 * shortcut.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";

const handlers = {
  search: vi.fn(),
  newReservation: vi.fn(),
  scan: vi.fn(),
  help: vi.fn(),
};

function Harness({ enabled = true }: { enabled?: boolean }) {
  useGlobalShortcuts(handlers, enabled);
  return (
    <div>
      <input aria-label="gewoon veld" />
      <div data-scan-input="">
        <input aria-label="scanveld" />
      </div>
      <textarea aria-label="notitie" />
    </div>
  );
}

beforeEach(() => {
  for (const fn of Object.values(handlers)) fn.mockClear();
});

describe("OPT-021 — de globale sneltoetsen", () => {
  it("fires on the page itself", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("n");
    expect(handlers.newReservation).toHaveBeenCalledTimes(1);
    await user.keyboard("s");
    expect(handlers.scan).toHaveBeenCalledTimes(1);
    await user.keyboard("/");
    expect(handlers.search).toHaveBeenCalledTimes(1);
    await user.keyboard("?");
    expect(handlers.help).toHaveBeenCalledTimes(1);
  });

  it("stays out of an ordinary text field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByLabelText("gewoon veld") as HTMLInputElement;
    await user.click(field);
    await user.type(field, "ns/");
    expect(handlers.newReservation).not.toHaveBeenCalled();
    expect(handlers.scan).not.toHaveBeenCalled();
    expect(handlers.search).not.toHaveBeenCalled();
    // The characters landed where they were typed.
    expect(field.value).toBe("ns/");
  });

  it("stays out of the scan field while a scanner types a code", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const scanField = screen.getByLabelText("scanveld") as HTMLInputElement;
    await user.click(scanField);
    // A key-tag barcode: letters, digits, dashes, then Enter.
    await user.type(scanField, "VH-000123-R1{Enter}");
    expect(handlers.newReservation).not.toHaveBeenCalled();
    expect(handlers.scan).not.toHaveBeenCalled();
    expect(handlers.search).not.toHaveBeenCalled();
    expect(scanField.value).toBe("VH-000123-R1");
  });

  it("stays out of a textarea", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const notes = screen.getByLabelText("notitie") as HTMLTextAreaElement;
    await user.click(notes);
    await user.type(notes, "nieuwe schade");
    expect(handlers.newReservation).not.toHaveBeenCalled();
    expect(notes.value).toBe("nieuwe schade");
  });

  it("Ctrl+K reaches the search box even from inside a field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("gewoon veld"));
    await user.keyboard("{Control>}k{/Control}");
    expect(handlers.search).toHaveBeenCalledTimes(1);
  });

  it("removes its listener when disabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness enabled />);
    await user.keyboard("n");
    expect(handlers.newReservation).toHaveBeenCalledTimes(1);

    rerender(<Harness enabled={false} />);
    await user.keyboard("n");
    expect(handlers.newReservation).toHaveBeenCalledTimes(1);
  });
});

describe("OPT-021 — het sneltoetsenoverzicht", () => {
  it("lists every shortcut in Dutch, with its keys", () => {
    render(<ShortcutsDialog open onOpenChange={() => {}} />);
    expect(screen.getByText("Sneltoetsen")).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-search")).toHaveTextContent("Zoekbalk");
    expect(screen.getByTestId("shortcut-search")).toHaveTextContent("Ctrl+K");
    expect(screen.getByTestId("shortcut-newReservation")).toHaveTextContent("Nieuwe reservering");
    expect(screen.getByTestId("shortcut-scan")).toHaveTextContent("Scannen");
    expect(screen.getByTestId("shortcut-escape")).toHaveTextContent("Dialoog sluiten");
    expect(screen.getByTestId("shortcut-enter")).toHaveTextContent("Formulier versturen");
  });

  it("says why a letter shortcut sometimes does nothing", () => {
    render(<ShortcutsDialog open onOpenChange={() => {}} />);
    expect(screen.getByText(/barcodescanner/)).toBeInTheDocument();
  });
});
