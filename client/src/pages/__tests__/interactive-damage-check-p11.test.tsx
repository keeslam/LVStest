/**
 * Audit remediation P11 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 11), the parts of the
 * interactive damage check that can be seen without a browser:
 *
 *  A-11-1  a diagram that is a thin strip cannot be drawn on - the check says so
 *  A-11-2  after "Check opslaan" the toast says it was saved, not "Check geladen"
 *  A-11-3  a diagram of another model is announced as a stand-in
 *  A-11-6  a chosen option is visibly (and accessibly) chosen
 *  A-11-7  "Alles goed" fills the empty fields of a block and leaves given answers alone
 *  A-11-8  saving shows progress and, afterwards, that it is done
 *  A-11-9  the check explains how it relates to the PDF made at return
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getQueryFn } from "@/lib/queryClient";
import { DEFAULT_DAMAGE_CHECK_FIELDS } from "@shared/schema";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

import InteractiveDamageCheck from "@/pages/interactive-damage-check";

const VEHICLE = { id: 7, brand: "Mitsubishi", model: "Spacestar", licensePlate: "AA-11-BB", vehicleType: "Car" };
const DIAGRAM = { id: 1, make: "Mitsubishi", model: "Spacestar", yearFrom: null, yearTo: null, diagramPath: "x.png", description: null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let matchBody: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toastSpy.mockClear();
  // jsdom + the canvas package refuse drawImage for an image that never loaded; a recording stub is all the page needs here.
  const context = new Proxy({}, { get: () => () => {}, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
  matchBody = { ...DIAGRAM, fit: "model" };
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/vehicles") return json([VEHICLE]);
    if (url === "/api/damage-check-fields") return json(DEFAULT_DAMAGE_CHECK_FIELDS);
    if (url === "/api/vehicle-diagram-templates/match/7") return json(matchBody);
    if (url === "/api/vehicle-diagram-templates/1") return json(DIAGRAM);
    if (url === "/api/interactive-damage-checks" && method === "POST") return json({ id: 15 }, 201);
    if (url === "/api/interactive-damage-checks/15" && method === "GET") {
      return json({ id: 15, vehicleId: 7, reservationId: null, checkType: "pickup", damageMarkers: "[]", drawingPaths: "[]", checklistData: JSON.stringify({ interior: {}, exterior: {}, delivery: {} }), diagramTemplateId: 1 });
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderCheck(props: Partial<React.ComponentProps<typeof InteractiveDamageCheck>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  const { hook } = memoryLocation({ path: "/interactive-damage-check", static: true });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <InteractiveDamageCheck initialVehicleId={7} {...props} />
      </Router>
    </QueryClientProvider>,
  );
}

/** jsdom never loads an image: tell the page what the browser would have measured. */
function loadImage(width: number, height: number) {
  const image = document.querySelector("img[src*='/api/vehicle-diagram-templates/']") as HTMLImageElement;
  Object.defineProperty(image, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(image, "naturalHeight", { value: height, configurable: true });
  fireEvent.load(image);
}

describe("A-11-3 - a diagram that is not for this model", () => {
  it("is announced as a stand-in, naming whose diagram it is", async () => {
    matchBody = { ...DIAGRAM, make: "Fiat", model: "Ducato", fit: "fallback" };
    renderCheck();
    const notice = await screen.findByTestId("damage-check-diagram-fallback");
    expect(notice).toHaveTextContent("Geen diagram voor dit model");
    expect(notice).toHaveTextContent("Fiat Ducato");
  });

  it("is silent when the diagram really is for the model", async () => {
    renderCheck();
    await waitFor(() => expect(document.querySelector("img[src*='/api/vehicle-diagram-templates/1/image']")).not.toBeNull());
    expect(screen.queryByTestId("damage-check-diagram-fallback")).toBeNull();
  });
});

describe("A-11-1 - a diagram nobody can draw on", () => {
  it("warns with the measured size when the image is a flat strip", async () => {
    renderCheck();
    await waitFor(() => expect(document.querySelector("img[src*='/api/vehicle-diagram-templates/1/image']")).not.toBeNull());
    loadImage(1198, 24);
    const warning = await screen.findByTestId("damage-check-diagram-unusable");
    expect(warning).toHaveTextContent("Dit diagram is niet bruikbaar");
    expect(warning).toHaveTextContent("1198 × 24");
  });

  it("says nothing for a normal diagram", async () => {
    renderCheck();
    await waitFor(() => expect(document.querySelector("img[src*='/api/vehicle-diagram-templates/1/image']")).not.toBeNull());
    loadImage(1200, 600);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId("damage-check-diagram-unusable")).toBeNull();
  });
});

describe("A-11-2 / A-11-8 - saving", () => {
  it("says it was saved and never 'Check geladen' for the check it just created", async () => {
    const user = userEvent.setup();
    renderCheck();
    await waitFor(() => expect(screen.getByTestId("button-save-check")).toBeEnabled());
    await user.click(screen.getByTestId("button-save-check"));

    await waitFor(() => expect(toastSpy.mock.calls.map(([c]) => c.description), JSON.stringify(toastSpy.mock.calls)).toContain("Schadecheck succesvol opgeslagen"));
    // The page reloads the check it just created (editing mode); give that reload time to finish.
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u) === "/api/interactive-damage-checks/15" && (i?.method ?? "GET") === "GET")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(toastSpy.mock.calls.map(([c]) => c.title)).not.toContain("Check geladen");
    // A-11-8: the form itself tells that it is done.
    expect(screen.getByTestId("damage-check-save-status")).toHaveTextContent(/Opgeslagen om \d{2}:\d{2}/);
    expect(screen.getByTestId("button-print-check")).toBeEnabled();
  });

  it("still says 'Check geladen' when somebody opens an existing check (the toast is not gone, only the false one)", async () => {
    renderCheck({ editingCheckId: 15 });
    await waitFor(() => expect(toastSpy.mock.calls.map(([c]) => c.title)).toContain("Check geladen"));
  });
});

describe("A-11-9 - what this check is next to the return PDF", () => {
  it("explains it on the page", async () => {
    renderCheck();
    expect(await screen.findByTestId("damage-check-relation-note")).toHaveTextContent("laatst opgeslagen check");
  });
});

describe("A-11-6 / A-11-7 - the checklist", () => {
  it("marks a chosen option as pressed and shows which fields are still unanswered", async () => {
    const user = userEvent.setup();
    renderCheck();
    const chip = await screen.findByTestId("chip-interior-carInterior-schoon");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("unanswered-interior-carInterior")).toBeInTheDocument();
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("unanswered-interior-carInterior")).toBeNull();
    expect(screen.getByTestId("chip-interior-carInterior-vuil")).toHaveAttribute("aria-pressed", "false");
  });

  it("'Alles goed' fills the empty fields of one block, keeps a given answer and counts the progress", async () => {
    const user = userEvent.setup();
    renderCheck();
    await user.click(await screen.findByTestId("chip-interior-carInterior-vuil"));
    expect(screen.getByTestId("checklist-progress-interior")).toHaveTextContent("1 van 9 ingevuld");

    await user.click(screen.getByTestId("button-all-good-interior"));

    expect(screen.getByTestId("chip-interior-carInterior-vuil")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("chip-interior-carInterior-schoon")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("chip-interior-windowDamage-nee")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("chip-interior-jack-ja")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("checklist-progress-interior")).toHaveTextContent("9 van 9 ingevuld");
    // The other blocks are untouched.
    expect(screen.getByTestId("checklist-progress-exterior")).toHaveTextContent("0 van 12 ingevuld");
  });

  it("'Alles goed' on the delivery block ticks every box", async () => {
    const user = userEvent.setup();
    renderCheck();
    await user.click(await screen.findByTestId("button-all-good-delivery"));
    expect(screen.getByTestId("checklist-progress-delivery")).toHaveTextContent("11 van 11 ingevuld");
  });
});
