/**
 * BUG-222 — "Tabletlayout: de zijbalk blijft uitgeklapt en tabellen worden
 * afgekapt" — and BUG-210 — "De kalenderpagina scrollt horizontaal bij 1182 px,
 * en na het sluiten van een dialoog blijft de viewport verschoven".
 *
 * The plan says the layout itself is not unit-testable and must be checked by
 * hand at 768 / 1024 / 1182 px, and that is still true: jsdom has no layout
 * engine and no Tailwind, so nothing here measures a pixel. What it *can* do is
 * hold the two decisions that produced the defect, because both are one token
 * in the DOM and both were silently wrong before:
 *
 *   - the sidebar is permanent from `lg` (1024 px) up, not from `md` (768 px),
 *     which is exactly tablet width — that is the whole of BUG-222's first half;
 *   - the main column carries `min-w-0`, without which a wide child widens the
 *     page body instead of scrolling in its own container (BUG-210).
 *
 * The one runtime behaviour of BUG-210 that a DOM *can* prove — the horizontal
 * scroll offset left behind by a closed dialog — is tested below for real.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MainLayout from "@/layouts/MainLayout";
import { GlobalDialogProvider, useGlobalDialog } from "@/contexts/GlobalDialogContext";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 1, username: "medewerker", role: "user", permissions: null, hidePrices: false },
    isLoading: false,
    logoutMutation: { mutate: () => {}, isPending: false },
  }),
}));

function renderLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: async () => [], retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalDialogProvider>
        <MainLayout>
          <p>pagina-inhoud</p>
        </MainLayout>
      </GlobalDialogProvider>
    </QueryClientProvider>,
  );
}

describe("BUG-222 / BUG-210 — the tablet breakpoint and the main column", () => {
  it("keeps the sidebar a drawer at tablet width: every breakpoint token is lg, never md", () => {
    const { container } = renderLayout();

    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    // Permanent from 1024 px up...
    expect(aside!.className).toContain("lg:translate-x-0");
    // ...and never from 768 px, which is the tablet width the audit measured.
    expect(aside!.className).not.toContain("md:translate-x-0");

    const header = container.querySelector("header");
    expect(header!.className).toContain("lg:ml-64");
    expect(header!.className).not.toContain("md:ml-64");

    // The hamburger exists below lg, so a tablet can still reach the menu.
    const toggles = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.className.includes("lg:hidden"),
    );
    expect(toggles.length).toBeGreaterThan(0);
    expect(
      Array.from(container.querySelectorAll("button")).some((b) => b.className.includes("md:hidden")),
    ).toBe(false);
  });

  it("gives the main column min-w-0 so a wide child scrolls itself instead of the page", () => {
    const { container } = renderLayout();

    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main!.className).toContain("min-w-0");
    expect(main!.className).toContain("lg:ml-64");
    expect(screen.getByText("pagina-inhoud")).toBeInTheDocument();
  });
});

describe("BUG-210 — a closed dialog does not leave the viewport shifted sideways", () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: scrollTo });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "scrollX", { configurable: true, writable: true, value: 0 });
  });

  function DialogDriver() {
    const { openVehicleDialog, closeVehicleDialog } = useGlobalDialog();
    return (
      <>
        <button onClick={() => openVehicleDialog(42)}>open</button>
        <button onClick={() => closeVehicleDialog()}>sluit</button>
      </>
    );
  }

  it("resets a leftover horizontal offset when the last dialog closes", async () => {
    render(
      <GlobalDialogProvider>
        <DialogDriver />
      </GlobalDialogProvider>,
    );

    // The 1182 px laptop: the calendar is scrolled sideways behind the dialog.
    act(() => {
      screen.getByText("open").click();
    });
    Object.defineProperty(window, "scrollX", { configurable: true, writable: true, value: 234 });
    scrollTo.mockClear();

    act(() => {
      screen.getByText("sluit").click();
    });

    // Without this the fixed sidebar stays parked over the page heading.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 0 }));
  });

  it("does not touch the scroll position when there was no offset to begin with", () => {
    Object.defineProperty(window, "scrollX", { configurable: true, writable: true, value: 0 });

    render(
      <GlobalDialogProvider>
        <DialogDriver />
      </GlobalDialogProvider>,
    );

    act(() => {
      screen.getByText("open").click();
    });
    scrollTo.mockClear();
    act(() => {
      screen.getByText("sluit").click();
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
