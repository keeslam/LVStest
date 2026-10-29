/**
 * Appointments from the garage's online planner, in the maintenance calendar: confirm, cancel (after a question),
 * link a mail that could not be matched, or ignore it. Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPermission, UserRole } from "@shared/schema";

let permissions: string[] = [UserPermission.MANAGE_MAINTENANCE];
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: UserRole.USER, permissions, hidePrices: false }, isLoading: false }),
}));

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }), toast: toastSpy }));

import { getQueryFn } from "@/lib/queryClient";
import { OnlineAppointmentsDialog } from "@/components/maintenance/online-appointments-dialog";

const base = {
  receivedAt: "2098-11-01T10:00:00.000Z", reviewReason: null, mileage: 120, customerId: 1, vehicleId: 2, rentalId: 3, blockId: 4,
  handledBy: null, handledAt: null, brand: "RENAULT", model: "TWINGO", customerName: "Dhr. Lam",
};
const items = [
  { ...base, id: 1, status: "pending", date: "2098-11-05", time: "08:00", plate: "XXLL20", workItems: ["APK"], replacement: "Leenauto", customerLabel: "Klant BV" },
  { ...base, id: 2, status: "pending", date: "2098-11-06", time: "09:30", plate: "AABB12", workItems: ["Grote beurt"], replacement: "Geen", customerLabel: "Andere BV" },
  { ...base, id: 3, status: "review", reviewReason: "plate_unknown", date: "2098-11-07", time: "10:00", plate: "ZZ99ZZ", workItems: ["APK"], replacement: "", customerLabel: null, vehicleId: null, rentalId: null, customerId: null, blockId: null },
  { ...base, id: 4, status: "review", reviewReason: "unreadable", date: "", time: "", plate: "", workItems: [], replacement: "", customerName: "", customerLabel: null, vehicleId: null, rentalId: null, customerId: null, blockId: null },
];
const calls: Array<{ method: string; url: string; body?: string }> = [];
let answer: (method: string, url: string) => Response = (method) =>
  new Response(JSON.stringify(method === "GET" ? items : {}), { status: 200, headers: { "Content-Type": "application/json" } });

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><OnlineAppointmentsDialog open onOpenChange={() => {}} /></QueryClientProvider>);
}

beforeEach(() => {
  calls.length = 0;
  toastSpy.mockClear();
  permissions = [UserPermission.MANAGE_MAINTENANCE];
  answer = (method) => new Response(JSON.stringify(method === "GET" ? items : {}), { status: 200, headers: { "Content-Type": "application/json" } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body as string | undefined });
    return answer(method, String(url));
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("online afspraken", () => {
  it("lists what is to confirm and what is to check, with date, time, car, work and a TBD badge only where one is wanted", async () => {
    renderDialog();
    expect(await screen.findByText("2 afspraken om te bevestigen")).toBeInTheDocument();
    expect(screen.getByText("2 afspraken om te controleren")).toBeInTheDocument();
    const first = screen.getByTestId("appointment-1");
    expect(first).toHaveTextContent("05-11-2098 · 08:00");
    expect(first).toHaveTextContent("Klant BV");
    expect(first).toHaveTextContent("APK");
    expect(screen.getByTestId("appointment-replacement-1")).toHaveTextContent("TBD vervangend vervoer");
    expect(screen.queryByTestId("appointment-replacement-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("appointment-reason-3")).toHaveTextContent("Het kenteken staat niet in de vloot.");
    expect(screen.getByTestId("appointment-reason-4")).toHaveTextContent("De mail kon niet worden gelezen.");
  });

  it("confirms with one click", async () => {
    renderDialog();
    await userEvent.click(await screen.findByTestId("appointment-confirm-1"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/online-appointments/1/confirm"))).toBe(true));
  });

  it("asks before cancelling, and says that the customer is not told", async () => {
    renderDialog();
    await userEvent.click(await screen.findByTestId("appointment-cancel-1"));
    expect(screen.getByText(/De klant krijgt hier geen bericht van/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/cancel"))).toBe(false);
    await userEvent.click(screen.getByTestId("appointment-cancel-yes"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/online-appointments/1/cancel"))).toBe(true));
  });

  it("links a mail to a rental only once a reservation number is filled in, and an unreadable mail can only be ignored", async () => {
    renderDialog();
    const link = await screen.findByTestId("appointment-link-3");
    expect(link).toBeDisabled();
    await userEvent.type(screen.getByTestId("appointment-rental-3"), "7a7");
    await userEvent.click(link);
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/api/online-appointments/3/link"))?.body).toBe(JSON.stringify({ rentalId: 77 })));
    expect(screen.queryByTestId("appointment-link-4")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("appointment-dismiss-4"));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/online-appointments/4/dismiss"))).toBe(true));
  });

  it("explains a refusal from the server in plain words", async () => {
    answer = (method) => method === "GET"
      ? new Response(JSON.stringify(items), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ message: "x", code: "RENTAL_NOT_ON_DATE" }), { status: 400, headers: { "Content-Type": "application/json" } });
    renderDialog();
    await userEvent.type(await screen.findByTestId("appointment-rental-3"), "5");
    await userEvent.click(screen.getByTestId("appointment-link-3"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "Deze huur loopt niet op de dag van de afspraak.", variant: "destructive" })));
  });

  it("shows the list but no buttons to someone who may only look", async () => {
    permissions = [UserPermission.VIEW_RESERVATIONS];
    renderDialog();
    expect(await screen.findByTestId("appointment-1")).toBeInTheDocument();
    expect(screen.queryByTestId("appointment-confirm-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("appointment-dismiss-4")).not.toBeInTheDocument();
  });
});
