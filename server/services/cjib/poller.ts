import cron, { type ScheduledTask } from "node-cron";
import type { CjibConfig, CjibRunSummary } from "../../../shared/fines";
import { getCjibConfig } from "./config";
import { ftpsClient, type CjibFtpsClient } from "./ftps-client";
import { importCjibFile } from "./importer";

let client: CjibFtpsClient = ftpsClient;
/** Tests swap the FTPS client for a fake. */
export function setCjibFtpsClient(c: CjibFtpsClient): void { client = c; }

let running: Promise<CjibRunSummary> | null = null;
let lastRun: CjibRunSummary | null = null;
let task: ScheduledTask | null = null;
let scheduledMinutes: number | null = null;

export function getCjibRunState(): { running: boolean; lastRun: CjibRunSummary | null; scheduledMinutes: number | null } {
  return { running: running !== null, lastRun, scheduledMinutes };
}

/**
 * Fetch every new file from the CJIB inbox and import it. Overlapping calls
 * share one run. A connection error ends the run with that error; a bad file
 * is recorded by the importer and never stops the other files.
 */
export function runCjibImport(trigger: CjibRunSummary["trigger"], createdBy = "scheduler", configOverride?: CjibConfig): Promise<CjibRunSummary> {
  if (running) return running;
  running = (async () => {
    const summary: CjibRunSummary = { startedAt: new Date().toISOString(), finishedAt: "", trigger, files: 0, skipped: 0, created: 0, linked: 0, duplicate: 0, failed: 0, errors: [] };
    try {
      const config = configOverride ?? await getCjibConfig();
      const pattern = new RegExp(config.filePattern || ".", "i");
      const files = (await client.listInbox(config)).filter((f) => pattern.test(f.name));
      for (const remote of files) {
        try {
          const buffer = await client.download(config, remote.name);
          const { file, skipped } = await importCjibFile({ buffer, fileName: remote.name, source: "cjib_ftps", createdBy });
          summary.files += 1;
          if (skipped) summary.skipped += 1;
          else {
            summary.created += file.recordsCreated; summary.linked += file.recordsLinked;
            summary.duplicate += file.recordsDuplicate; summary.failed += file.recordsFailed;
            if (file.status === "failed") summary.errors.push(`${remote.name}: ${file.errorMessage}`);
          }
          if (file.status === "processed" || skipped) await client.moveToProcessed(config, remote.name);
        } catch (e) {
          summary.errors.push(`${remote.name}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      summary.errors.push((e as Error).message);
    }
    summary.finishedAt = new Date().toISOString();
    lastRun = summary;
    if (summary.errors.length) console.error("CJIB import finished with errors:", summary.errors);
    else console.log(`CJIB import: ${summary.files} file(s), ${summary.created} fine(s) created, ${summary.linked} linked`);
    return summary;
  })().finally(() => { running = null; });
  return running;
}

/** (Re)reads the config and (re)schedules the poll; call at start-up and after the config is saved. */
export async function startCjibScheduler(): Promise<void> {
  task?.stop(); task = null; scheduledMinutes = null;
  const config = await getCjibConfig();
  if (!config.enabled || !config.host) return;
  const minutes = Math.max(5, Math.min(1440, config.pollMinutes));
  const expression = minutes >= 60 ? `0 */${Math.max(1, Math.round(minutes / 60))} * * *` : `*/${minutes} * * * *`;
  task = cron.schedule(expression, () => { void runCjibImport("scheduler"); });
  scheduledMinutes = minutes;
  console.log(`CJIB import scheduled every ${minutes} minutes (${expression})`);
}

export function stopCjibScheduler(): void { task?.stop(); task = null; scheduledMinutes = null; }
