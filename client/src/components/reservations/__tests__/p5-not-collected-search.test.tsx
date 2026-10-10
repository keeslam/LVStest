/**
 * Audit remediation P5, A-5-3 - "Niet opgehaalde reserveringen" listed 144 rows
 * with a red Annuleren on each, no search, and a cancel step that never said
 * which rental it was about.
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { UserPermission, UserRole } from "@shared/schema";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: 1, username: "tester", role: UserRole.USER,
      permissions: [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS],
    },
    isLoading: false,
  }),
}));

import { NotCollectedDialog } from "@/components/reservations/not-collected-dialog";

const rows = [
  {
    id: 501, status: "booked", type: "standard", startDate: "2026-01-01", endDate: "2026-01-05", contractNumber: null,
    vehicle: { id: 1, brand: "Fiat", model: "Ducato", licensePlate: "E2E07G" },
    customer: { id: 1, name: "Jansen Transport" },
  },
  {
    id: 502, status: "booked", type: "standard", startDate: "2026-01-02", endDate: "2026-01-06", contractNumber: null,
    vehicle: { id: 2, brand: "Renault", model: "Master", licensePlate: "AB123C" },
    customer: { id: 2, name: "Bakker BV", companyName: "Bakker Verhuur" },
  },
  {
    id: 503, status: "booked", type: "standard", startDate: "2026-01-03", endDate: "2026-01-07", contractNumber: "1042",
    vehicle: { id: 3, brand: "Ford", model: "Transit", licensePlate: "ZZ99ZZ" },
    customer: { id: 3, name: "De Vries" },
  },
];

let requests: Array<{ url: string; method: string }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    requests.push({ url, method });
    if (url.includes("/api/reservations/not-collected")) return json(rows);
    if (/\/api\/reservations\/501$/.test(url)) return json(rows[0]);
    if (url.includes("/cancel-impact")) return json({ transports: [], spares: [], placeholders: [], drivers: [] });
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotCollectedDialog open onOpenChange={() => {}} onViewReservation={() => {}} />
    </QueryClientProvider>,
  );
}

describe("A-5-3 - search in the not-collected list", () => {
  it("filters on plate (with or without dashes), customer, company, contract number and id", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("not-collected-reservation-501");
    const search = screen.getByTestId("input-not-collected-search");

    await user.type(search, "ab-123-c");
    expect(screen.queryByTestId("not-collected-reservation-501")).toBeNull();
    expect(screen.getByTestId("not-collected-reservation-502")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "jansen");
    expect(screen.getByTestId("not-collected-reservation-501")).toBeInTheDocument();
    expect(screen.queryByTestId("not-collected-reservation-502")).toBeNull();

    await user.clear(search);
    await user.type(search, "bakker verhuur");
    expect(screen.getByTestId("not-collected-reservation-502")).toBeInTheDocument();
    expect(screen.queryByTestId("not-collected-reservation-503")).toBeNull();

    await user.clear(search);
    await user.type(search, "1042");
    expect(screen.getByTestId("not-collected-reservation-503")).toBeInTheDocument();
    expect(screen.queryByTestId("not-collected-reservation-501")).toBeNull();
  });

  it("counts what is shown and says so when nothing matches", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId("not-collected-reservation-501");
    expect(screen.getByTestId("not-collected-count")).toHaveTextContent("3 van 3");

    await user.type(screen.getByTestId("input-not-collected-search"), "nergens");
    expect(screen.getByTestId("not-collected-count")).toHaveTextContent("0 van 3");
    expect(screen.getByTestId("not-collected-no-match")).toBeInTheDocument();
    expect(screen.queryByTestId("not-collected-empty")).toBeNull();
  });
});

describe("A-5-3 - cancelling from the list asks first, and names the rental", () => {
  it("opens the cancel dialog with plate and customer; nothing is cancelled until it is confirmed", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByTestId("button-cancel-not-collected-501"));

    const dialog = await screen.findByTestId("dialog-cancel-reservation");
    const subject = await within(dialog).findByTestId("cancel-reservation-subject");
    expect(subject).toHaveTextContent("E2E07G");
    expect(subject).toHaveTextContent("Jansen Transport");

    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
    await user.click(within(dialog).getByTestId("button-abort-cancel-reservation"));
    await waitFor(() => expect(screen.queryByTestId("dialog-cancel-reservation")).toBeNull());
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
  });

  it("gives the row buttons names that include the plate", async () => {
    renderDialog();
    const cancel = await screen.findByTestId("button-cancel-not-collected-501");
    expect(cancel).toHaveAccessibleName(/E2E07G/);
    expect(screen.getByTestId("button-open-not-collected-501")).toHaveAccessibleName(/E2E07G/);
  });
});
