import { describe, it, expect, vi } from "vitest";
import type { ImapFlow } from "imapflow";

// The real assertAllowedImapTarget resolves DNS (assertPublicHost); the
// session-lifecycle tests use a fake client and must never touch the network.
vi.mock("../services/invoice-inbox/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/invoice-inbox/config")>();
  return { ...actual, assertAllowedImapTarget: vi.fn(async () => {}) };
});

import { DEFAULT_INVOICE_INBOX_CONFIG, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import { imapOptions, runImapSession } from "../services/invoice-inbox/imap-client";

const config: InvoiceInboxConfig = { ...DEFAULT_INVOICE_INBOX_CONFIG, host: "imap.example.test", username: "u", password: "p" };

function fakeClient() {
  return {
    on: vi.fn(),
    connect: vi.fn(async () => {}),
    getMailboxLock: vi.fn(async () => ({ release: vi.fn() })),
    logout: vi.fn(async () => {}),
    close: vi.fn(),
  };
}
type FakeClient = ReturnType<typeof fakeClient>;
const asImap = (client: FakeClient) => client as unknown as ImapFlow;

describe("invoice inbox IMAP session lifecycle", () => {
  it("closes the connection when the login is refused", async () => {
    const client = fakeClient();
    client.connect.mockRejectedValueOnce(new Error("Invalid credentials"));
    await expect(runImapSession(config, async () => "ok", () => asImap(client))).rejects.toThrow("Invalid credentials");
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(client.getMailboxLock).not.toHaveBeenCalled();
    expect(client.logout).not.toHaveBeenCalled();
  });

  it("releases the lock and logs out after a normal session", async () => {
    const client = fakeClient();
    const calls: string[] = [];
    client.on.mockImplementation((event: string) => { calls.push(`on:${event}`); });
    client.connect.mockImplementation(async () => { calls.push("connect"); });
    const lock = { release: vi.fn(() => { calls.push("release"); }) };
    client.getMailboxLock.mockImplementation(async (path: string) => { calls.push(`lock:${path}`); return lock; });
    client.logout.mockImplementation(async () => { calls.push("logout"); });

    const result = await runImapSession(config, async () => "klaar", () => asImap(client));

    expect(result).toBe("klaar");
    expect(calls).toEqual(["on:error", "connect", "lock:INBOX", "release", "logout"]);
    expect(client.close).not.toHaveBeenCalled();
  });

  it("releases the lock and logs out when the session callback throws", async () => {
    const client = fakeClient();
    const lock = { release: vi.fn() };
    client.getMailboxLock.mockResolvedValue(lock);
    await expect(runImapSession(config, async () => { throw new Error("kapot"); }, () => asImap(client))).rejects.toThrow("kapot");
    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it("falls back to close() when logout fails", async () => {
    const client = fakeClient();
    const lock = { release: vi.fn() };
    client.getMailboxLock.mockResolvedValue(lock);
    client.logout.mockRejectedValueOnce(new Error("logout mislukt"));

    const result = await runImapSession(config, async () => "klaar", () => asImap(client));

    expect(result).toBe("klaar");
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing host before touching the network", async () => {
    const factory = vi.fn();
    await expect(runImapSession({ ...config, host: "" }, async () => "x", factory)).rejects.toThrow("IMAP-host is niet ingesteld");
    expect(factory).not.toHaveBeenCalled();
  });

  /** M4: imapflow marks a refused login; "Invalid credentials" says nothing to staff. */
  it("says in plain Dutch that the login was refused", async () => {
    const client = fakeClient();
    const refused = Object.assign(new Error("Invalid credentials"), { authenticationFailed: true });
    client.connect.mockRejectedValueOnce(refused);
    await expect(runImapSession(config, async () => "ok", () => asImap(client)))
      .rejects.toThrow("Inloggen geweigerd: controleer gebruikersnaam en wachtwoord.");
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("hands the addresses the outbound guard resolved to the client factory", async () => {
    const client = fakeClient();
    client.getMailboxLock.mockResolvedValue({ release: vi.fn() });
    const factory = vi.fn(() => asImap(client));
    await runImapSession(config, async () => "ok", factory);
    expect(factory).toHaveBeenCalledTimes(1);
    // The mocked guard resolves nothing, so the host name is used as before.
    expect(factory.mock.calls[0][1]).toEqual([]);
  });
});

/** I3 + M2: what the real client is actually told to connect with. */
describe("imapOptions", () => {
  it("forces STARTTLS on port 143, where it used to be opportunistic", () => {
    const options = imapOptions({ ...config, port: 143, secure: false });
    expect(options).toMatchObject({ host: "imap.example.test", port: 143, secure: false, doSTARTTLS: true });
    expect(options.tls).toMatchObject({ rejectUnauthorized: true });
  });

  it("does not ask for STARTTLS on an implicit-TLS connection", () => {
    expect(imapOptions({ ...config, port: 993, secure: true }).doSTARTTLS).toBeUndefined();
  });

  it("pins the connection to the address the guard resolved, keeping the name for TLS", () => {
    const options = imapOptions(config, ["198.51.100.7"]);
    expect(options.host).toBe("198.51.100.7");
    expect(options.tls).toMatchObject({ rejectUnauthorized: true, servername: "imap.example.test" });
  });

  it("falls back to the host name when the guard resolved nothing", () => {
    const options = imapOptions(config, []);
    expect(options.host).toBe("imap.example.test");
    expect((options.tls as Record<string, unknown>).servername).toBeUndefined();
  });
});
