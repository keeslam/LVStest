/**
 * A-1-7 — the realtime socket must not connect on /auth (no session yet: the
 * handshake is refused with "unauthorized" and the console fills with noise).
 * It connects once a user is loaded and disconnects again on logout.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const ioMock = vi.fn();
const disconnect = vi.fn();
vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => {
    ioMock(...args);
    return { on: vi.fn(), disconnect, id: "s1" };
  },
}));

let currentUser: { id: number } | null = null;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: currentUser, isLoading: false }),
}));
const stableToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: stableToast }) }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { invalidateQueries: vi.fn() } }));
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
  ioMock.mockClear();
  disconnect.mockClear();
});

describe("SocketProvider", () => {
  it("does not open a socket while nobody is signed in", () => {
    currentUser = null;
    render(<SocketProvider><span /></SocketProvider>);
    expect(ioMock).not.toHaveBeenCalled();
  });

  it("opens a socket once a user is loaded and closes it on unmount", () => {
    currentUser = { id: 4 };
    const view = render(<SocketProvider><span /></SocketProvider>);
    expect(ioMock).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("closes the socket when the user signs out", () => {
    currentUser = { id: 4 };
    const view = render(<SocketProvider><span /></SocketProvider>);
    currentUser = null;
    view.rerender(<SocketProvider><span /></SocketProvider>);
    expect(disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(1);
  });
});
