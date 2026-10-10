/**
 * Audit remediation P5, A-6-3 - "Mail naar klant":
 *  - a failed send showed the server's English sentence as it was;
 *  - the send button was disabled without saying which field was missing;
 *  - the customer's ordinary e-mail address (the plain `email` column) was never
 *    suggested, only the two special-purpose ones, so the form opened on
 *    "Aangepast e-mailadres".
 *
 * Runs in the jsdom project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/hooks/use-toast");
  return { ...actual, useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }) };
});

import { EmailDocumentDialog } from "@/components/documents/email-document-dialog";

const doc = {
  id: 1, vehicleId: 1, reservationId: 3200, documentType: "Contract (Unsigned)", fileName: "contract.pdf",
  contentType: "application/pdf",
} as any;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let sendAnswer: () => Response;

beforeEach(() => {
  toastSpy.mockClear();
  sendAnswer = () => json({ message: "Email sent successfully" });
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.includes("/api/email/send-documents") && init?.method === "POST") return sendAnswer();
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog(customer: Record<string, unknown> | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EmailDocumentDialog
        open
        onOpenChange={() => {}}
        documents={[doc]}
        defaultDocumentIds={[1]}
        customer={customer as any}
        reservation={{ id: 3200 } as any}
      />
    </QueryClientProvider>,
  );
}

describe("A-6-3 - the customer's address is suggested", () => {
  it("falls back to the plain e-mail address when there is no general or invoice address", async () => {
    renderDialog({ id: 5, name: "Audit Testklant", email: "audit@e2e.invalid" });
    const trigger = await screen.findByTestId("select-recipient");
    await waitFor(() => expect(trigger).toHaveTextContent("audit@e2e.invalid"));
    expect(screen.queryByTestId("input-custom-email")).toBeNull();
  });

  it("still prefers the general address over the plain one", async () => {
    renderDialog({ id: 5, name: "K", email: "plain@e2e.invalid", emailGeneral: "algemeen@e2e.invalid" });
    const trigger = await screen.findByTestId("select-recipient");
    await waitFor(() => expect(trigger).toHaveTextContent("algemeen@e2e.invalid"));
  });
});

describe("A-6-3 - the disabled send button says what is missing", () => {
  it("lists the missing subject, and lets go once it is filled", async () => {
    const user = userEvent.setup();
    renderDialog({ id: 5, name: "K", email: "audit@e2e.invalid" });
    const send = await screen.findByTestId("button-send-email");
    const hint = await screen.findByTestId("email-send-hint");
    expect(send).toBeDisabled();
    expect(hint).toHaveTextContent(/onderwerp/i);
    expect(hint).not.toHaveTextContent(/document/i);

    await user.type(screen.getByTestId("input-email-subject"), "Uw contract");
    await waitFor(() => expect(send).not.toBeDisabled());
    expect(screen.queryByTestId("email-send-hint")).toBeNull();
  });

  it("asks for an address when the customer has none", async () => {
    renderDialog({ id: 5, name: "K" });
    const hint = await screen.findByTestId("email-send-hint");
    expect(hint).toHaveTextContent(/e-mailadres/i);
  });
});

describe("A-6-3 - a failed send is worded in Dutch", () => {
  it("translates the server's code instead of showing its English sentence", async () => {
    sendAnswer = () => json(
      { message: "Failed to send email. Please check your email configuration in Settings.", code: "EMAIL_SEND_FAILED" },
      500,
    );
    const user = userEvent.setup();
    renderDialog({ id: 5, name: "K", email: "audit@e2e.invalid" });
    await user.type(await screen.findByTestId("input-email-subject"), "Uw contract");
    await user.click(screen.getByTestId("button-send-email"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls.map((c) => c[0]).find((c) => c.variant === "destructive");
    expect(toast).toBeTruthy();
    expect(String(toast.description)).not.toMatch(/failed|configuration/i);
    expect(String(toast.description)).toMatch(/e-mail/i);
  });

  it("never shows an unknown server sentence either", async () => {
    sendAnswer = () => json({ message: "Something odd happened on the server" }, 500);
    const user = userEvent.setup();
    renderDialog({ id: 5, name: "K", email: "audit@e2e.invalid" });
    await user.type(await screen.findByTestId("input-email-subject"), "Uw contract");
    await user.click(screen.getByTestId("button-send-email"));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    const toast = toastSpy.mock.calls.map((c) => c[0]).find((c) => c.variant === "destructive");
    expect(String(toast.description)).not.toMatch(/odd|server/i);
  });
});
