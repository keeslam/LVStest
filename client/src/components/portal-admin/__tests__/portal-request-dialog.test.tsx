/**
 * The staff view of one customer request (audit 2026-10-09, A-15-7 and A-15-8):
 * dates as dd-MM-yyyy, no empty "Onderwerp" label, the two reply routes told
 * apart, and a standard answer per request type.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "admin", permissions: [] }, isLoading: false }),
}));

let requestId = 1;
vi.mock("@/contexts/GlobalDialogContext", () => ({
  useGlobalDialog: () => ({
    dialogState: { portalRequest: { open: true, id: requestId } },
    closePortalRequestDialog: vi.fn(), openCustomerDialog: vi.fn(), openReservationDialog: vi.fn(), openFineDialog: vi.fn(),
  }),
}));

import { PortalRequestDialog } from "@/components/portal-admin/portal-request-dialog";

const common = { status: "new", reservationId: null, fineId: null, message: "Een bericht", staffReply: null, repliedAt: null, createdAt: "2026-09-06T17:08:23.000Z", submittedBy: "Jan", attachments: [], messages: [], customerId: 1, customerName: "Klant BV", reservationLabel: null };
const requests: Record<number, Record<string, unknown>> = {
  1: { ...common, id: 1, type: "extension", payload: { newEndDate: "2026-10-15" } },
  2: { ...common, id: 2, type: "other", payload: {} },
  3: { ...common, id: 3, type: "other", payload: { subject: "Sleutel kwijt" } },
  4: { ...common, id: 4, type: "booking", payload: { startDate: "2026-11-03", endDate: "2026-11-05", vehicleLabel: "AB-123-C" } },
  5: { ...common, id: 5, type: "damage", payload: {} },
};
const calls: Array<{ method: string; url: string; body?: string }> = [];

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(<QueryClientProvider client={client}><PortalRequestDialog /></QueryClientProvider>);
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body as string | undefined });
    const match = /\/api\/portal-requests\/(\d+)$/.exec(String(url));
    const body = method === "GET" && match ? requests[Number(match[1])] : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("aanvraag behandelen", () => {
  it("writes the requested dates as dd-MM-yyyy, like the list", async () => {
    requestId = 1;
    renderDialog();
    expect(await screen.findByText("15-10-2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-10-15")).not.toBeInTheDocument();
  });

  it("writes a booking's period as dd-MM-yyyy", async () => {
    requestId = 4;
    renderDialog();
    expect(await screen.findByText("03-11-2026")).toBeInTheDocument();
    expect(screen.getByText("05-11-2026")).toBeInTheDocument();
  });

  it("shows no 'Onderwerp' label when the customer gave no subject", async () => {
    requestId = 2;
    renderDialog();
    await screen.findByText("Een bericht");
    expect(screen.queryByText("Onderwerp")).not.toBeInTheDocument();
  });

  it("shows the subject when there is one", async () => {
    requestId = 3;
    renderDialog();
    expect(await screen.findByText("Sleutel kwijt")).toBeInTheDocument();
    expect(screen.getByText("Onderwerp")).toBeInTheDocument();
  });

  it("tells the two ways to answer without closing apart", async () => {
    requestId = 4;
    renderDialog();
    expect(await screen.findByTestId("staff-thread-send")).toHaveTextContent("Bericht plaatsen");
    expect(screen.getByText(/geen e-mail uit/)).toBeInTheDocument();
    expect(screen.getByTestId("button-answer-request")).toHaveTextContent("Antwoord mailen (blijft open)");
  });

  it("fills in a standard answer per type and lets staff edit it", async () => {
    requestId = 5;
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("standard-answer-received"));
    const box = screen.getByTestId("textarea-request-reply") as HTMLTextAreaElement;
    expect(box.value).toMatch(/nemen de schade in behandeling/);
    expect(screen.queryByTestId("standard-answer-approved")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("standard-answer-rejected"));
    expect(box.value).toMatch(/niet voldoen/);
  });

  it("offers the approval wording for an extension, and not for a booking", async () => {
    requestId = 1;
    const first = renderDialog();
    expect(await screen.findByTestId("standard-answer-approved")).toBeInTheDocument();
    first.unmount();
    requestId = 4;
    renderDialog();
    await screen.findByTestId("standard-answer-rejected");
    await waitFor(() => expect(screen.queryByTestId("standard-answer-approved")).not.toBeInTheDocument());
  });
});
