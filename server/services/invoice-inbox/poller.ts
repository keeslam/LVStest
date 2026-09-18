import cron, { type ScheduledTask } from "node-cron";
import type { InvoiceInboxConfig, InvoiceInboxRunSummary } from "../../../shared/invoice-inbox";
import { getInvoiceInboxConfig } from "./config";
import { imapClient, type InvoiceImapClient } from "./imap-client";
import { importInvoiceMail, recordOversizeMail, MAX_MAIL_BYTES } from "./importer";
import { notifyInvoiceInbox } from "./notify";

/** Bounds one run: every mail can cost a Gemini call. The rest waits for the next run. */
export const MAX_MAILS_PER_RUN = 25;
const FAILURES_BEFORE_WARNING = 3;

let client: InvoiceImapClient = imapClient;
/** Tests swap the IMAP client for a fake; null restores the real one. */
export function setInvoiceImapClient(replacement: InvoiceImapClient | null): void { client = replacement ?? imapClient; }
export function getInvoiceImapClient(): InvoiceImapClient { return client; }

let running: Promise<InvoiceInboxRunSummary> | null = null;
let lastRun: InvoiceInboxRunSummary | null = null;
let task: ScheduledTask | null = null;
let scheduledMinutes: number | null = null;
let consecutiveFailures = 0;

export function getInvoiceInboxRunState(): { running: boolean; lastRun: InvoiceInboxRunSummary | null; scheduledMinutes: number | null } {
  return { running: running !== null, lastRun, scheduledMinutes };
}

export function resetInvoiceInboxPollerForTests(): void {
  running = null; lastRun = null; consecutiveFailures = 0;
}

/**
 * Read every unseen mail and import it. Overlapping calls share one run. A
 * connection error ends the run with that error; a mail whose import throws
 * stays unseen and is retried next run, without stopping the other mails.
 */
export function runInvoiceInboxImport(
  trigger: InvoiceInboxRunSummary["trigger"], createdBy = "scheduler", configOverride?: InvoiceInboxConfig,
): Promise<InvoiceInboxRunSummary> {
  if (running) return running;
  running = (async () => {
    const summary: InvoiceInboxRunSummary = {
      startedAt: new Date().toISOString(), finishedAt: "", trigger,
      mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0, errors: [],
    };
    let connected = false;
    try {
      const config = configOverride ?? await getInvoiceInboxConfig();
      if (!config.host) throw new Error("IMAP-host is niet ingesteld");
      await client.withSession(config, async (session) => {
        connected = true;
        const refs = (await session.listUnseen()).slice(0, MAX_MAILS_PER_RUN);
        for (const ref of refs) {
          summary.mails += 1;
          try {
            if ((ref.size ?? 0) > MAX_MAIL_BYTES) {
              const outcome = await recordOversizeMail(ref, createdBy);
              summary[outcome] += 1;
              await session.markProcessed(ref.uid);
              continue;
            }
            const raw = await session.fetchRaw(ref.uid);
            const result = await importInvoiceMail({ raw, config, createdBy });
            summary.attachments += result.attachments;
            summary.booked += result.booked;
            summary.review += result.review;
            summary.skipped += result.skipped;
            await session.markProcessed(ref.uid);
          } catch (error) {
            summary.failed += 1;
            summary.errors.push(`${ref.subject ?? `bericht ${ref.uid}`}: ${(error as Error).message}`);
          }
        }
      });
    } catch (error) {
      summary.errors.push((error as Error).message);
    }

    if (connected) consecutiveFailures = 0;
    else {
      consecutiveFailures += 1;
      if (consecutiveFailures === FAILURES_BEFORE_WARNING) {
        await notifyInvoiceInbox({
          title: "Postvak facturen onbereikbaar",
          description: `De app kon het postvak ${FAILURES_BEFORE_WARNING} keer achter elkaar niet uitlezen: ${summary.errors[0] ?? "onbekende fout"}. Controleer de instellingen onder E-mail.`,
          priority: "high",
        });
      }
    }

    summary.finishedAt = new Date().toISOString();
    lastRun = summary;
    if (summary.errors.length) console.error("Invoice inbox run finished with errors:", summary.errors);
    else console.log(`Invoice inbox: ${summary.mails} mail(s), ${summary.booked} booked, ${summary.review} for review, ${summary.skipped} skipped`);
    return summary;
  })().finally(() => { running = null; });
  return running;
}

export function cronExpressionFor(pollMinutes: number): string {
  const minutes = Math.max(5, Math.min(1440, Math.round(Number(pollMinutes) || 15)));
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.round(minutes / 60);
  return hours >= 24 ? "0 0 * * *" : `0 */${hours} * * *`;
}

/** (Re)reads the config and (re)schedules the poll; call at start-up and after the config is saved. */
export async function startInvoiceInboxScheduler(): Promise<void> {
  stopInvoiceInboxScheduler();
  const config = await getInvoiceInboxConfig();
  if (!config.enabled || !config.host) return;
  const expression = cronExpressionFor(config.pollMinutes);
  task = cron.schedule(expression, () => { void runInvoiceInboxImport("scheduler"); }, { timezone: "Europe/Amsterdam" });
  scheduledMinutes = Math.max(5, Math.min(1440, config.pollMinutes));
  console.log(`Invoice inbox scheduled every ${scheduledMinutes} minutes (${expression})`);
}

export function stopInvoiceInboxScheduler(): void {
  task?.stop(); task = null; scheduledMinutes = null;
}
