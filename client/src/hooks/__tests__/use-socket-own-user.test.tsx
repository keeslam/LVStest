/**
 * A-18-4 — a rights change applies to a user who is already signed in. The server
 * reads the user per request, so it enforces the new rights at once; the client's
 * cached /api/user (screens, greyed buttons) used to lag until its own refresh.
 * The 'users updated' event for the signed-in user's own id now refetches it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const handlers: Record<string, (...args: any[]) => void> = {};
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event: string, fn: (...args: any[]) => void) => { handlers[event] = fn; },
    disconnect: vi.fn(),
    id: "s1",
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 6 }, isLoading: false }),
}));
const stableToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: stableToast }) }));
const invalidateQueries = vi.fn();
vi.mock("@/lib/queryClient", () => ({ queryClient: { invalidateQueries: (...a: unknown[]) => invalidateQueries(...a) } }));
vi.mock("@/lib/cache-utils", () => ({
  invalidateVehicleData: vi.fn(),
  invalidateReservationData: vi.fn(),
  invalidateCustomerData: vi.fn(),
  invalidateExpenseData: vi.fn(),
  invalidateDocumentData: vi.fn(),
  invalidateNotificationData: vi.fn(),
}));
vi.mock("@/i18n", () => ({ default: { t: (k: string) => k } }));

import { SocketProvider } from "@/hooks/use-socket";

beforeEach(() => {
  invalidateQueries.mockClear();
  render(<SocketProvider><span /></SocketProvider>);
});

const refetchedOwnUser = () =>
  invalidateQueries.mock.calls.some(([arg]) => JSON.stringify(arg?.queryKey) === JSON.stringify(["/api/user"]) && arg?.refetchType !== "none");

describe("SocketProvider - own user", () => {
  it("refetches /api/user when the signed-in user's own account is updated", () => {
    handlers["data-update"]({ entityType: "users", action: "updated", data: { id: 6, permissions: ["view_vehicles"] } });
    expect(refetchedOwnUser()).toBe(true);
  });

  it("leaves /api/user alone when somebody else's account is updated", () => {
    handlers["data-update"]({ entityType: "users", action: "updated", data: { id: 7 } });
    expect(refetchedOwnUser()).toBe(false);
  });
});
