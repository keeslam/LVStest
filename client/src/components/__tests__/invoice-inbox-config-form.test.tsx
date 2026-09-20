import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
// The card carries the "Logboek" button, which reads the user to decide whether
// it may offer a PDF; outside the app there is no AuthProvider to read it from.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role: "admin", permissions: [] } }),
}));
import { InvoiceInboxConfigForm } from "@/components/expenses/invoice-inbox-config-form";

const config = {
  enabled: false, host: "imap.voorbeeld.nl", port: 993, secure: true, username: "fakturenapp@lamgroep.nl", password: "********",
  inboxFolder: "INBOX", processedFolder: "Verwerkt", pollMinutes: 15, allowedSenders: ["@garage.nl", "kees@lamgroep.nl"],
  authservId: "", totalTolerance: 1,
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
      if (url.endsWith("/api/expenses/inbox/config/test")) return json({ ok: true, unseen: 2, diagnostics: { server: "Dovecot", exists: 5, searchUnseen: 0 }, folders: [
        { path: "INBOX", messages: 5, unseen: 2, specialUse: "\Inbox" },
        { path: "Junk", messages: 1, unseen: 1, specialUse: "\Junk" },
      ] });
      if (url.endsWith("/api/expenses/inbox/config")) return json(method === "PUT" ? { ...JSON.parse(String(init!.body)), password: "********" } : config);
      return json({}, { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoiceInboxConfigForm />
      <Toaster />
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
    // Where a mail that is NOT picked up sits: every folder with its counts.
    expect(screen.getByText("INBOX: 5 berichten, 2 ongelezen")).toBeInTheDocument();
    expect(screen.getByText("Junk: 1 berichten, 1 ongelezen")).toBeInTheDocument();
    expect(screen.getByText(/ongelezen mail uit de map INBOX/)).toBeInTheDocument();
    // The server's own search misses the unread mail (the STRATO case): say so, and say it is handled.
    expect(screen.getByText(/zoekfunctie van deze mailserver vindt ongelezen mail niet/)).toBeInTheDocument();
    expect(screen.getByText("Technisch: Dovecot; de map telt 5 berichten; de zoekopdracht van de server vond 0 ongelezen.")).toBeInTheDocument();
    // Which mailbox was actually opened: a second mailbox on another domain is an easy mix-up.
    expect(screen.getByText("Ingelogd als fakturenapp@lamgroep.nl op imap.voorbeeld.nl")).toBeInTheDocument();
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

  /**
   * I2: without the name of our own mail server the app cannot tell a real
   * sender from a forged one, and a mail claiming to be from a trusted address
   * is booked automatically. The card says so, in amber, until it is filled in.
   */
  it("asks for the name of our own mail server and warns while it is empty", async () => {
    mount();
    const field = await screen.findByLabelText("Naam van jullie mailserver (Authentication-Results)");
    expect(field).toHaveValue("");
    expect(screen.getByTestId("invoice-inbox-authserv-warning")).toHaveTextContent(/Een vervalst afzenderadres/);

    await userEvent.type(field, "mx.host.nl");
    expect(screen.queryByTestId("invoice-inbox-authserv-warning")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body.authservId).toBe("mx.host.nl");
  });

  /** M10: the toast used to put the raw server message where the title belongs. */
  it("shows a translated title with the server's message underneath when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/api/expenses/inbox/status")) return json(status);
      if (url.endsWith("/api/expenses/inbox/run")) return json({ message: "Postvak onbereikbaar" }, { status: 502 });
      if (url.endsWith("/api/expenses/inbox/config")) {
        if (method === "PUT") return json({ message: "Alleen poort 993 (TLS) of 143 (STARTTLS) is toegestaan" }, { status: 400 });
        return json(config);
      }
      return json({}, { status: 404 });
    }));

    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Opslaan" }));
    expect(await screen.findByText("Opslaan mislukt")).toBeInTheDocument();
    expect(await screen.findByText(/Alleen poort 993/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Nu ophalen" }));
    expect(await screen.findByText("Ophalen mislukt")).toBeInTheDocument();
    expect(await screen.findByText(/Postvak onbereikbaar/)).toBeInTheDocument();
  });

  it("still renders with its values when the status check is refused, and does not hammer it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/api/expenses/inbox/status")) return json({ message: "Not authorized" }, { status: 403 });
      if (url.endsWith("/api/expenses/inbox/config/test")) return json({ ok: true, unseen: 2, diagnostics: { server: "Dovecot", exists: 5, searchUnseen: 0 }, folders: [
        { path: "INBOX", messages: 5, unseen: 2, specialUse: "\Inbox" },
        { path: "Junk", messages: 1, unseen: 1, specialUse: "\Junk" },
      ] });
      if (url.endsWith("/api/expenses/inbox/config")) return json(method === "PUT" ? { ...JSON.parse(String(init!.body)), password: "********" } : config);
      return json({}, { status: 404 });
    }));

    mount();
    expect(await screen.findByLabelText("IMAP-server")).toHaveValue("imap.voorbeeld.nl");
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/expenses/inbox/status"))).toBe(true));
    expect(screen.queryByText(/GEMINI_API_KEY is niet ingesteld/)).not.toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/api/expenses/inbox/status")).length).toBe(1);
  });
});
