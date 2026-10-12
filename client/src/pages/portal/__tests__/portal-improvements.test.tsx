/**
 * Customer portal, 2026-10-12 review: honest loading and error states, a 404 instead of a silent overview, a
 * document named after its car, a real confirmation dialog, the session-expired notice, and the document's
 * language and title.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

const portalFetch = vi.fn();
vi.mock("@/lib/portal-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal-api")>();
  return { ...actual, portalFetch: (...args: unknown[]) => portalFetch(...args) };
});
vi.mock("@/hooks/use-portal-dialogs", () => ({ usePortalDialogs: () => ({ openDocument: () => {}, openReservation: () => {}, openFine: () => {}, openList: () => {} }) }));

import { PortalApiError } from "@/lib/portal-api";
import { PortalAuthProvider, usePortalAuth, SESSION_EXPIRED_FLAG } from "@/hooks/use-portal-auth";
import { PortalLoading, PortalLoadError } from "@/components/portal/ui";
import PortalNotFoundPage from "@/pages/portal/not-found";
import PortalLoginPage from "@/pages/portal/login";
import { DocumentRow } from "@/components/portal/rows";
import { usePortalDocumentMeta } from "@/layouts/PortalLayout";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const withClient = (ui: React.ReactNode, qc = client()) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => { portalFetch.mockReset(); try { sessionStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { document.documentElement.lang = ""; });

describe("loading and error states", () => {
  it("tells the user data is loading, with a status for screen readers", () => {
    withClient(<PortalLoading />);
    expect(screen.getByTestId("portal-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("says loading failed (not 'nothing here') and retries on request", async () => {
    const retry = vi.fn();
    withClient(<PortalLoadError onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/niet worden geladen/i);
    await userEvent.click(screen.getByTestId("portal-load-retry"));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("unknown portal address", () => {
  it("says the page does not exist and links back to the overview", () => {
    withClient(<PortalNotFoundPage />);
    expect(screen.getByTestId("portal-not-found")).toHaveTextContent(/bestaat niet/i);
    expect(screen.getByRole("link", { name: /overzicht/i })).toBeInTheDocument();
  });
});

describe("a document is named after its car", () => {
  const reservation = { id: 7, status: "picked_up", type: "standard", startDate: "2026-09-01", endDate: null, contractNumber: "1011", vehicle: { id: 1, licensePlate: "11ZSZ3", brand: "PEUGEOT", model: "PEUGEOT BOXER" }, driver: null };
  const doc = { id: 5, reservationId: 7, documentType: "contract", kind: "contract" as const, fileName: "31XT121_contract_pickup_2026-09-06_1788717261858.pdf", uploadDate: "2026-09-06T10:00:00.000Z", ack: null };

  function row() {
    const qc = client();
    qc.setQueryData(["portal", "/api/portal/reservations"], [reservation]);
    return withClient(<DocumentRow document={doc} />, qc);
  }

  it("shows the car, the contract number and a plain date; the file name is only a tooltip", () => {
    row();
    const title = screen.getByText(/Contract · /);
    expect(title).toHaveTextContent("PEUGEOT BOXER");
    expect(title).not.toHaveTextContent("PEUGEOT PEUGEOT");
    expect(title).toHaveAttribute("title", doc.fileName);
    expect(screen.getByText(/contract 1011/)).toBeInTheDocument();
    expect(screen.getByText(/06-09-2026/)).toBeInTheDocument();
    expect(screen.queryByText(doc.fileName)).toBeNull();
  });

  it("asks for approval in a dialog of the page (not window.confirm) and only then sends it", async () => {
    const confirm = vi.spyOn(window, "confirm");
    portalFetch.mockResolvedValue({});
    row();
    await userEvent.click(screen.getByTestId("button-ack-5"));
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByTestId("ack-dialog-5")).toBeInTheDocument();
    expect(portalFetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("button-ack-confirm-5"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", "/api/portal/documents/5/ack"));
    confirm.mockRestore();
  });

  it("sends nothing when the dialog is cancelled", async () => {
    row();
    await userEvent.click(screen.getByTestId("button-ack-5"));
    await userEvent.click(await screen.findByRole("button", { name: /annuleren/i }));
    expect(portalFetch).not.toHaveBeenCalled();
  });
});

describe("session expiry", () => {
  const me = { id: 1, email: "k@example.com", fullName: "K", role: "admin", customerId: 2, customerName: "Klant", language: "nl", languageOverride: null, settings: {}, info: {}, mailPreferences: {} };

  function Probe() {
    const { me: current } = usePortalAuth();
    const q = useQuery({ queryKey: ["portal", "/api/portal/reservations"], queryFn: async () => { throw new PortalApiError(401, "PORTAL_NOT_AUTHENTICATED", "Not authenticated"); }, retry: false, enabled: false });
    return <div><span data-testid="who">{current ? "in" : "out"}</span><button onClick={() => q.refetch()}>go</button></div>;
  }

  it("a 401 from any page request logs the page out and leaves a note for the login page", async () => {
    portalFetch.mockImplementation(async (_m: string, url: string) => { if (url === "/api/portal/me") return me; throw new Error("unexpected " + url); });
    withClient(<PortalAuthProvider><Probe /></PortalAuthProvider>);
    expect(await screen.findByText("in")).toBeInTheDocument();
    await act(async () => { await userEvent.click(screen.getByText("go")); });
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("out"));
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBe("1");
  });

  it("the login page says the session ended, once", async () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, "1");
    portalFetch.mockResolvedValue(null);
    withClient(<PortalAuthProvider><PortalLoginPage /></PortalAuthProvider>);
    expect(await screen.findByTestId("session-expired")).toHaveTextContent(/sessie is verlopen/i);
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull();
  });

  it("the login page shows no note when the session did not just end", async () => {
    portalFetch.mockResolvedValue(null);
    withClient(<PortalAuthProvider><PortalLoginPage /></PortalAuthProvider>);
    await screen.findByTestId("portal-login-form");
    expect(screen.queryByTestId("session-expired")).toBeNull();
  });
});

describe("document language and title", () => {
  function Meta() { usePortalDocumentMeta(); return null; }
  it("sets lang and a portal title, and puts them back when the portal closes", () => {
    document.title = "Auto Lease LAM";
    const { unmount } = render(<Meta />);
    expect(document.documentElement.lang).toBe("nl");
    expect(document.title).toBe("Klantenportaal");
    unmount();
    expect(document.title).toBe("Auto Lease LAM");
  });
});
