import { ImapFlow } from "imapflow";
import type { InvoiceInboxConfig } from "../../../shared/invoice-inbox";
import { assertAllowedImapTarget } from "./config";

export interface InboxMessageRef { uid: number; messageId: string | null; from: string | null; subject: string | null; size: number | null }

/** What the poller needs from one open mailbox; swapped for a fake in tests. */
export interface InvoiceImapSession {
  listUnseen(): Promise<InboxMessageRef[]>;
  fetchRaw(uid: number): Promise<Buffer>;
  /** Move to the processed folder, or mark read when none is configured or the move fails. */
  markProcessed(uid: number): Promise<void>;
}

export interface InvoiceImapClient {
  withSession<T>(config: InvoiceInboxConfig, fn: (session: InvoiceImapSession) => Promise<T>): Promise<T>;
}

function openSession(client: ImapFlow, config: InvoiceInboxConfig): InvoiceImapSession {
  return {
    async listUnseen() {
      const refs: InboxMessageRef[] = [];
      // No other command may run while this generator is open (imapflow deadlocks).
      for await (const message of client.fetch({ seen: false }, { uid: true, envelope: true, size: true })) {
        refs.push({
          uid: message.uid,
          messageId: message.envelope?.messageId ?? null,
          from: message.envelope?.from?.[0]?.address ?? null,
          subject: message.envelope?.subject ?? null,
          size: message.size ?? null,
        });
      }
      return refs.sort((a, b) => a.uid - b.uid);
    },
    async fetchRaw(uid) {
      // `source` is fetched with BODY.PEEK, so a mail that fails to import stays unseen.
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) throw new Error(`Bericht ${uid} kon niet worden opgehaald`);
      return message.source;
    },
    async markProcessed(uid) {
      if (config.processedFolder) {
        try { await client.mailboxCreate(config.processedFolder); } catch { /* exists already */ }
        try {
          const moved = await client.messageMove(String(uid), config.processedFolder, { uid: true });
          if (moved) return;
        } catch (error) {
          console.warn(`Factuurmail ${uid} kon niet naar "${config.processedFolder}" worden verplaatst:`, (error as Error).message);
        }
      }
      // Fallback, and the configured behaviour without a folder: the item is
      // already stored by hash, read-marking only keeps the mail out of the next listing.
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    },
  };
}

export const imapClient: InvoiceImapClient = {
  async withSession(config, fn) {
    if (!config.host) throw new Error("IMAP-host is niet ingesteld");
    // Every connection — the poller's and the admin's "test connection" — passes
    // the port pair and the private-range check first (cf. BUG-071).
    await assertAllowedImapTarget(config.host, config.port);
    const client = new ImapFlow({
      host: config.host, port: config.port, secure: config.secure,
      auth: { user: config.username, pass: config.password },
      tls: { rejectUnauthorized: true },
      logger: false,
    });
    // An ImapFlow instance is an EventEmitter: an unhandled "error" event would
    // take the whole server process down.
    client.on("error", (error: Error) => console.error("IMAP connection error:", error.message));
    await client.connect();
    try {
      const lock = await client.getMailboxLock(config.inboxFolder || "INBOX");
      try {
        return await fn(openSession(client, config));
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { client.close(); }
    }
  },
};
