/**
 * OPT-013 — the half the proposal is really about: the status on the document.
 *
 * "De vraag 'heeft de klant het contract gekregen?' heeft geen antwoord — niet
 * aan de balie, niet achteraf." The row exists (FIX-M); this is the line that
 * answers the question where it is asked.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DocumentMailStatus,
  documentMailStatusUrl,
  latestAttempt,
} from "@/components/documents/document-mail-status";
import { getQueryFn } from "@/lib/queryClient";

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

let attempts: unknown[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  attempts = [{
    id: 9,
    recipient: "klant@example.invalid",
    result: "sent",
    failureReason: null,
    sentAt: "2026-03-09T13:05:00.000Z",
    subject: "Contract",
  }];
  fetchMock = vi.fn(async () => json({ attempts }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OPT-013 — de mailstatus op het document", () => {
  it("asks about one document", async () => {
    expect(documentMailStatusUrl(501)).toBe("/api/documents/501/email-status");
    withClient(<DocumentMailStatus documentId={501} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/documents/501/email-status");
  });

  it('says "verzonden op … aan …" in Dutch', async () => {
    withClient(<DocumentMailStatus documentId={501} />);
    const line = await screen.findByTestId("document-mail-status-501");
    expect(line).toHaveTextContent("Verzonden op");
    expect(line).toHaveTextContent("klant@example.invalid");
  });

  it("says the send failed, with the server's own reason", async () => {
    attempts = [{
      id: 10,
      recipient: "klant@example.invalid",
      result: "failed",
      failureReason: "Connection timed out",
      sentAt: "2026-03-09T14:00:00.000Z",
      subject: "Contract",
    }];
    withClient(<DocumentMailStatus documentId={501} />);
    const line = await screen.findByTestId("document-mail-status-501");
    expect(line).toHaveTextContent("Verzenden mislukt");
    expect(line).toHaveTextContent("Connection timed out");
  });

  it("shows the most recent attempt — a failure after a success is the state it is in", () => {
    const rows = [
      { id: 1, recipient: "a@x", result: "sent", failureReason: null, sentAt: "2026-03-09T10:00:00.000Z", subject: "c" },
      { id: 2, recipient: "b@x", result: "failed", failureReason: "boom", sentAt: "2026-03-09T12:00:00.000Z", subject: "c" },
    ];
    expect(latestAttempt(rows)!.id).toBe(2);
    expect(latestAttempt([])).toBeNull();
  });

  it("renders nothing for a document that was never mailed", async () => {
    attempts = [];
    const { container } = withClient(<DocumentMailStatus documentId={502} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(container.querySelector("[data-testid^='document-mail-status']")).toBeNull();
    });
  });

  it("asks nothing at all when it is not enabled", async () => {
    withClient(<DocumentMailStatus documentId={503} enabled={false} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
