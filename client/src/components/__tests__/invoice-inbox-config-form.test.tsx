import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoiceInboxConfigForm } from "@/components/expenses/invoice-inbox-config-form";

const config = {
  enabled: false, host: "imap.voorbeeld.nl", port: 993, secure: true, username: "fakturenapp@lamgroep.nl", password: "********",
  inboxFolder: "INBOX", processedFolder: "Verwerkt", pollMinutes: 15, allowedSenders: ["@garage.nl", "kees@lamgroep.nl"], totalTolerance: 1,
};
const status = { enabled: false, running: false, lastRun: null, scheduledMinutes: null, reviewCount: 0, geminiConfigured: false };

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

describe("InvoiceInboxConfigForm", () => {
  let calls: Array<{ url: string; method: string; body: any }>;

  beforeEach(() => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/api/expenses/inbox/status")) return json(status);
      if (url.endsWith("/api/expenses/inbox/config/test")) return json({ ok: true, unseen: 2 });
      if (url.endsWith("/api/expenses/inbox/config")) return json(method === "PUT" ? { ...JSON.parse(String(init!.body)), password: "********" } : config);
      return json({}, { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoiceInboxConfigForm />
    </QueryClientProvider>,
  );

  it("shows the stored settings in Dutch, one trusted sender per line, and warns when the AI key is missing", async () => {
    mount();
    expect(await screen.findByText("Facturen per e-mail (inkomend)")).toBeInTheDocument();
    expect(screen.getByLabelText("IMAP-server")).toHaveValue("imap.voorbeeld.nl");
    expect(screen.getByLabelText("Vertrouwde afzenders")).toHaveValue("@garage.nl\nkees@lamgroep.nl");
    expect(await screen.findByText(/GEMINI_API_KEY is niet ingesteld/)).toBeInTheDocument();
  });

  it("tests the connection with what is in the form and shows the unread count", async () => {
    mount();
    await screen.findByLabelText("IMAP-server");
    await userEvent.click(screen.getByRole("button", { name: "Verbinding testen" }));
    expect(await screen.findByText("Verbonden, 2 ongelezen")).toBeInTheDocument();
    const call = calls.find((c) => c.url.endsWith("/config/test"))!;
    expect(call.method).toBe("POST");
    expect(call.body).toMatchObject({ host: "imap.voorbeeld.nl", password: "********" });
  });

  it("saves the trusted senders as a list, skipping empty lines", async () => {
    mount();
    const senders = await screen.findByLabelText("Vertrouwde afzenders");
    await userEvent.clear(senders);
    await userEvent.type(senders, "@garage.nl{enter}{enter}  Facturen@Banden.nl  ");
    await userEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body.allowedSenders).toEqual(["@garage.nl", "Facturen@Banden.nl"]);
  });
});
