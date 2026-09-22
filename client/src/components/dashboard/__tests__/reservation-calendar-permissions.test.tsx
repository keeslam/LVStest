/**
 * `ReservationCalendar` (dashboard widget) — Task 4
 * (docs/superpowers/specs/2026-09-21-toegang-design.md, §4), two of the "four
 * dashboard controls Task 3 left" (task-3-report.md §8): the inline "Edit"
 * button and `button-assign-vehicle`, both inside the hover card shown for a
 * calendar entry. Both end in a MANAGE_RESERVATIONS-guarded route
 * (`PATCH /api/reservations/:id` — server/routes.ts:4118 — and `POST
 * /api/placeholder-reservations/:id/assign-vehicle` — server/routes.ts:5430 —
 * verified directly).
 *
 * Runs in the jsdom project (plan §8.8). Real timers: the HoverCard's own
 * `openDelay` needs to actually elapse for its content (and the buttons
 * inside it) to mount.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

let role: string = UserRole.USER;
let permissions: string[] = [];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions }, isLoading: false }),
}));

import { ReservationCalendar } from "@/components/dashboard/reservation-calendar";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const todayIso = new Date().toISOString().slice(0, 10);

function renderCalendar() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/reservations/range")) {
        return json([
          {
            id: 99,
            status: "booked",
            placeholderSpare: true,
            startDate: todayIso,
            endDate: todayIso,
            vehicle: null,
            customer: { name: "Test Klant" },
          },
        ]);
      }
      return json(null);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReservationCalendar />
    </QueryClientProvider>,
  );
}

describe("ReservationCalendar (dashboard) — hover card actions require manage_reservations", () => {
  it("shows the inline Edit and Assign controls visible-but-disabled without manage_reservations", async () => {
    role = UserRole.USER;
    // Task 5: view_reservations is what makes the calendar's own data (and so
    // this hover card) render at all; manage_reservations (still absent
    // here) is the separate, narrower right each action button checks.
    permissions = [UserPermission.VIEW_RESERVATIONS];
    renderCalendar();

    const trigger = await screen.findByText("TBD");
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);

    const editButton = await screen.findByText("Bewerken", {}, { timeout: 3000 });
    expect(editButton.closest("button")).toHaveAttribute("aria-disabled", "true");

    const assignButton = await screen.findByTestId("button-assign-vehicle");
    expect(assignButton).toBeVisible();
    expect(assignButton).toHaveAttribute("aria-disabled", "true");
  });

  it("enables both controls for a user holding manage_reservations", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.MANAGE_RESERVATIONS];
    renderCalendar();

    const trigger = await screen.findByText("TBD");
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);

    const editButton = await screen.findByText("Bewerken", {}, { timeout: 3000 });
    expect(editButton.closest("button")).not.toBeDisabled();

    const assignButton = await screen.findByTestId("button-assign-vehicle");
    expect(assignButton).not.toBeDisabled();
  });
});

/**
 * Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §3) — the
 * dashboard's own permission is VIEW_DASHBOARD; this mini calendar's own
 * data needs the reservation family instead (GET /api/reservations/range,
 * routes.ts:2616). A visible hole (the whole grid), so denied renders
 * NoDataAccess instead of the calendar.
 */
describe("ReservationCalendar (dashboard) — the calendar's own data needs view_reservations/manage_reservations", () => {
  it("shows NoDataAccess and fires no /api/reservations/range request without either permission", async () => {
    role = UserRole.USER;
    permissions = [];
    renderCalendar();

    expect(await screen.findByTestId("no-data-access")).toHaveTextContent("Reserveringen bekijken");
    expect(screen.queryByText("TBD")).not.toBeInTheDocument();
  });

  it("renders the calendar grid with view_reservations alone", async () => {
    role = UserRole.USER;
    permissions = [UserPermission.VIEW_RESERVATIONS];
    renderCalendar();

    expect(await screen.findByText("TBD")).toBeInTheDocument();
    expect(screen.queryByTestId("no-data-access")).not.toBeInTheDocument();
  });
});
