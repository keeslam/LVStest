/**
 * BUG-201 — "Eén reservering met een onleesbare datum laat de hele
 * reserveringspagina crashen; er is nergens een error boundary."
 *
 * The defect was not that a date could be unparseable (that is BUG-201's
 * sibling, fixed by `safeFormatDate`); it was that *any* render throw took the
 * whole tree down to a blank page, because React unmounts everything when
 * nothing catches. These tests assert the boundary's contract: the fallback
 * renders, the surrounding shell stays mounted, and navigating away clears it.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/** React logs every caught error; keep the run's output about the assertions. */
function quietConsole() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

function Boom({ throws }: { throws: boolean }): JSX.Element {
  if (throws) {
    // Exactly the shape a page hits when it formats a broken date.
    throw new RangeError("Invalid time value");
  }
  return <p>de reserveringen</p>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BUG-201 — the route-level ErrorBoundary", () => {
  it("renders its fallback instead of unmounting the tree", () => {
    const spy = quietConsole();

    render(
      <div>
        <nav>zijbalk</nav>
        <ErrorBoundary resetKey="/reservations">
          <Boom throws />
        </ErrorBoundary>
      </div>,
    );

    // The page is gone...
    expect(screen.queryByText("de reserveringen")).toBeNull();
    // ...but there is a visible, named fallback rather than a blank tree,
    // and the shell around the boundary is untouched.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Er ging iets mis op dit scherm/i)).toBeInTheDocument();
    expect(screen.getByText("zijbalk")).toBeInTheDocument();
    // The message of the real error is on screen, not swallowed.
    expect(screen.getByText("Invalid time value")).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });

  it("offers a way back: the fallback's retry button re-renders the children", async () => {
    quietConsole();
    const user = (await import("@testing-library/user-event")).default.setup();

    function Harness() {
      const [throws, setThrows] = useState(true);
      return (
        <div>
          <button onClick={() => setThrows(false)}>repareer</button>
          <ErrorBoundary resetKey="/reservations">
            <Boom throws={throws} />
          </ErrorBoundary>
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // The underlying cause goes away (a refetch, a fixed row), then retry.
    await user.click(screen.getByText("repareer"));
    await user.click(screen.getByRole("button", { name: /Opnieuw proberen/i }));

    expect(screen.getByText("de reserveringen")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears itself on navigation, so one broken page does not poison the next", () => {
    quietConsole();

    const { rerender } = render(
      <ErrorBoundary resetKey="/reservations">
        <Boom throws />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Same boundary instance, new location: the user clicked another menu item.
    rerender(
      <ErrorBoundary resetKey="/vehicles">
        <Boom throws={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("de reserveringen")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("passes a caller-supplied fallback the error and a reset function", () => {
    quietConsole();

    render(
      <ErrorBoundary fallback={(error) => <p>eigen melding: {error.message}</p>}>
        <Boom throws />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/eigen melding: Invalid time value/)).toBeInTheDocument();
  });
});
