/**
 * PHASE 57 / WAVE 13 item 4 — the client half of "Terug van onderhoud".
 *
 * The server half (spare closed, workshop flag cleared, today's block closed,
 * availability re-derived) is asserted in
 * `server/__tests__/wave13-return-from-service.test.ts`. What is asserted here
 * is what the desk sees: the form's own fields reach the server, and a refusal
 * comes back in Dutch instead of the English "Could not load the data — No
 * active replacement found" that PHASE 57 met after a successful return.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ReturnFromServiceDialog } from "@/components/reservations/return-from-service-dialog";

const SPARE_ID = 3366;

const replacement = { id: SPARE_ID, vehicleId: 1821, type: "replacement" } as any;
const original = {
  id: 3364,
  vehicleId: 1820,
  vehicle: { id: 1820, brand: "Volkswagen", model: "Crafter", licensePlate: "HL-01-HL" },
} as any;

let posts: Array<{ url: string; body: any }>;
let failWith: { status: number; body: unknown } | null;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  posts = [];
  failWith = null;
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/return-from-service")) {
      posts.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
      if (failWith) return jsonResponse(failWith.body, failWith.status);
      return jsonResponse({ message: "Het voertuig is terug van onderhoud." });
    }
    return jsonResponse([]);
  }));
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
      <ReturnFromServiceDialog
        open
        onOpenChange={() => {}}
        replacementReservation={replacement}
        originalReservation={original}
      />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("WAVE 13 — 'Terug van onderhoud' in het scherm", () => {
  it("sends the form's own fields to the replacement's return-from-service route", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-return-mileage"), "123456");
    await user.type(screen.getByTestId("textarea-service-notes"), "Remmen vervangen");
    await user.click(screen.getByTestId("button-submit-return"));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toContain(`/api/reservations/${SPARE_ID}/return-from-service`);
    expect(posts[0].body.mileage).toBe("123456");
    expect(posts[0].body.notes).toBe("Remmen vervangen");
    expect(posts[0].body.returnDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Not the fetch-init wrapper the old call site built by hand.
    expect(posts[0].body.body).toBeUndefined();
  });

  it("shows a refusal in Dutch, not the server's English", async () => {
    failWith = {
      status: 404,
      body: {
        message:
          "Deze reservering is geen vervangingsreservering, dus er is hier niets terug te nemen van onderhoud.",
      },
    };
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("button-submit-return"));

    expect(await screen.findByText(/geen vervangingsreservering/i)).toBeInTheDocument();
    expect(screen.queryByText(/No active replacement found/i)).toBeNull();
    expect(screen.queryByText(/Could not load the data/i)).toBeNull();
  });
});
