import { describe, it, expect, vi } from "vitest";
import type { ImapFlow } from "imapflow";

// The real assertAllowedImapTarget resolves DNS (assertPublicHost); the
// session-lifecycle tests use a fake client and must never touch the network.
vi.mock("../services/invoice-inbox/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/invoice-inbox/config")>();
  return { ...actual, assertAllowedImapTarget: vi.fn(async () => {}) };
});

import { DEFAULT_INVOICE_INBOX_CONFIG, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import { runImapSession } from "../services/invoice-inbox/imap-client";

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
});
