/**
 * B-41 D10: a fine mails nobody when it is created, imported or linked. The
 * customer hears about it when staff press "Klant informeren" in the fine's
 * detail: a confirmation names the address, a success says so and shows the
 * date, and every refusal reason has its own sentence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { GlobalDialogProvider } from "@/contexts/GlobalDialogContext";
import { Toaster } from "@/components/ui/toaster";

let permissions: string[] = ["manage_fines"];
let role = "user";
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "t", role, permissions, hidePrices: false }, isLoading: false }),
}));

import { FinesTable } from "@/components/fines/fines-table";
import { FineDialog } from "@/components/fines/fine-dialog";

let status = "linked";
let customerNotifiedAt: string | null = null;
let notifyAddress: string | null = "jansen@voorbeeld.test";
let notifyAnswer: unknown = { sent: true };
const row = () => ({ id: 7, licensePlate: "AB123C", offenceAt: "2026-10-01T10:00:00Z", description: "Te hard", amount: "100.00", adminFee: "0.00", totalAmount: "100.00", status, customerId: status === "new" ? null : 3, customerName: "Jansen BV", driverName: null, reservationId: 9 });
const detail = () => ({ ...row(), reference: null, receivedAt: null, letterFilePath: null, internalNotes: null, customerNote: null, invoiceReference: null, linkedBy: "t", linkedAt: null, driverId: null, customerNotifiedAt, notifyAddress, candidates: { covering: [], near: [] } });

const calls: string[] = [];
beforeEach(() => {
  status = "linked"; customerNotifiedAt = null; notifyAddress = "jansen@voorbeeld.test"; notifyAnswer = { sent: true }; permissions = ["manage_fines"]; role = "user";
  calls.length = 0;
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = (typeof input === "string" ? input : (input as Request).url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${url}`);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === "/api/fines/7/notify-customer") return json(notifyAnswer);
    if (url === "/api/fines/7" && method === "GET") return json(detail());
    if (url.startsWith("/api/fines")) return json([row()]);
    return json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); });

function renderIt() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalDialogProvider><FinesTable /><FineDialog /><Toaster /></GlobalDialogProvider>
    </QueryClientProvider>,
  );
}
const open = async (user: ReturnType<typeof userEvent.setup>) => { await user.click(await screen.findByTestId("row-fine-7")); };
const posts = () => calls.filter((c) => c === "POST /api/fines/7/notify-customer");

describe("FineDialog: Klant informeren", () => {
  it("is offered on a linked fine, asks first and names the address, then mails and says so", async () => {
    const user = userEvent.setup();
    renderIt();
    await open(user);
    const button = await screen.findByTestId("button-notify-customer");
    expect(button.textContent).toBe("Klant informeren");
    expect(screen.queryByTestId("fine-notified-at")).toBeNull();
    await user.click(button);
    const description = await screen.findByTestId("confirm-dialog-description");
    expect(description.textContent).toContain("jansen@voorbeeld.test");
    expect(posts()).toEqual([]);
    await user.click(screen.getByTestId("button-confirm-notify-customer"));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(await screen.findByText("Klant geïnformeerd.")).toBeTruthy();
  });

  it("after a mail it shows the date and the button reads Opnieuw informeren", async () => {
    customerNotifiedAt = "2026-10-11T08:30:00Z";
    const user = userEvent.setup();
    renderIt();
    await open(user);
    expect((await screen.findByTestId("fine-notified-at")).textContent).toMatch(/Klant geïnformeerd op 11 okt. 2026/);
    expect(screen.getByTestId("button-notify-customer").textContent).toBe("Opnieuw informeren");
  });

  it("is not offered on a fine that is not linked, nor to a viewer", async () => {
    status = "new";
    const user = userEvent.setup();
    const first = renderIt();
    await open(user);
    await screen.findByTestId("button-close-fine");
    expect(screen.queryByTestId("button-notify-customer")).toBeNull();
    first.unmount();

    status = "linked"; permissions = ["view_fines"]; queryClient.clear();
    renderIt();
    await open(userEvent.setup());
    await screen.findByTestId("button-close-fine");
    expect(screen.queryByTestId("button-notify-customer")).toBeNull();
  });

  it.each([
    ["NO_CUSTOMER", /geen klant/i],
    ["NO_EMAIL", /geen e-mailadres/i],
    ["PORTAL_DISABLED", /portaal staat uit/i],
    ["MAIL_FAILED", /mail kon niet worden verstuurd/i],
  ])("a refusal with reason %s gets its own sentence, not a success", async (reason, sentence) => {
    notifyAnswer = { sent: false, reason };
    const user = userEvent.setup();
    renderIt();
    await open(user);
    await user.click(await screen.findByTestId("button-notify-customer"));
    await user.click(await screen.findByTestId("button-confirm-notify-customer"));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(await screen.findByText(sentence)).toBeTruthy();
    expect(screen.queryByText("Klant geïnformeerd.")).toBeNull();
  });
});
