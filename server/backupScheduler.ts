import * as cron from 'node-cron';
import { backupService, type BackupService } from './backupService';
import { cleanupStaleTempFiles, restoreToolsAvailable } from './restoreSafety';

export class BackupScheduler {
  // Shared singleton (see server/backupService.ts) so the scheduler's
  // runBackup re-entrancy guard is visible to the HTTP routes' "Back up now"
  // button and vice versa - otherwise a cron/boot-catchup run and a manual
  // click could run concurrently.
  private backupService: BackupService = backupService;
  private scheduledTask: cron.ScheduledTask | null = null;

  // Start the backup scheduler
  start(): void {
    if (this.scheduledTask) {
      console.log('Backup scheduler is already running');
      return;
    }

    // Log the resolved backup path once at startup. A missing BACKUP_PATH
    // used to fail completely silently - backups still ran, verified green,
    // and sat on ephemeral container storage until the next redeploy wiped
    // them. This does not block startup (unset is normal in local dev), it
    // just makes the resolved location legible.
    this.backupService.getBackupPathInfo()
      .then(({ path, fromEnv }) => {
        if (fromEnv) {
          console.log(`Backup path resolved to ${path} (from BACKUP_PATH)`);
        } else {
          console.warn(
            `Backup path resolved to ${path} (BACKUP_PATH is not set - falling back to ` +
            `database setting/local default; this will NOT survive a redeploy on ephemeral storage)`
          );
        }
      })
      .catch((error) => console.error('Failed to resolve backup path for logging:', error));

    // BUG-206/BUG-207: earlier versions left a 13 MB dump and a 118 MB archive
    // in os.tmpdir() after every backup, and a plaintext dump after every
    // restore — 149 files and 1.3 GB of them on the audit host. Those paths
    // now clean up after themselves; this sweeps what they, and any crash,
    // left behind.
    cleanupStaleTempFiles();

    // BUG-219: restore needs psql and pg_dump. Discovering that they are
    // missing during an emergency, after a minute-long safety backup, is too
    // late — say it once at start-up instead. Not fatal: a host that only
    // serves the app is still a working host.
    restoreToolsAvailable()
      .then(({ ok, missing }) => {
        if (!ok) {
          console.warn(
            `PostgreSQL client tools missing (${missing.join(', ')}): backups and restores will fail on this host. ` +
            `Install postgresql-client, or set PG_BIN_DIR to the directory that holds them.`
          );
        }
      })
      .catch(() => { /* never block start-up on a probe */ });

    // Schedule backup to run at 2:00 AM every day
    this.scheduledTask = cron.schedule('0 2 * * *', async () => {
      console.log('Starting scheduled backup...');
      try {
        await this.backupService.runBackup('scheduled');
        console.log('Scheduled backup completed successfully');

        // Run cleanup after successful backup
        await this.backupService.cleanupOldBackups();
        console.log('Backup cleanup completed');

      } catch (error) {
        console.error('Scheduled backup failed:', error);
      }
    }, {
      timezone: "Europe/Amsterdam" // Adjust to your timezone
    });

    this.scheduledTask.start();
    console.log('Backup scheduler started - backups will run daily at 2:00 AM');

    this.scheduleCatchUpIfOverdue();
  }

  /**
   * node-cron only fires if the process happens to be alive at 02:00. A
   * container that restarts, sleeps, or redeploys across that window simply
   * never backs up, and nothing noticed for ten months. If the last verified
   * success is over a day old, run one shortly after boot.
   */
  private scheduleCatchUpIfOverdue(): void {
    const DELAY_MS = 5 * 60 * 1000; // let startup migrations finish first
    setTimeout(async () => {
      try {
        const last = await this.backupService.getOldestLastSuccessfulRun();
        const ageMs = last?.finishedAt ? Date.now() - new Date(last.finishedAt).getTime() : Infinity;
        if (ageMs > 24 * 60 * 60 * 1000) {
          const age = Number.isFinite(ageMs) ? `${Math.round(ageMs / 3600000)}h old` : 'none on record';
          console.log(`Last verified backup is ${age} — running catch-up backup now`);
          await this.backupService.runBackup('catchup');
          await this.backupService.cleanupOldBackups();
        }
      } catch (error) {
        console.error('Catch-up backup failed:', error);
      }
    }, DELAY_MS).unref();
  }

  // Stop the backup scheduler
  stop(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
      console.log('Backup scheduler stopped');
    }
  }

  /**
   * BUG-221(b): this added a day unconditionally and then a SECOND day when it
   * was already past 02:00, so it was always at least one day wrong. The
   * schedule is 02:00 local time daily; the next run is today's 02:00 while
   * that is still ahead, and tomorrow's otherwise.
   */
  getStatus(): { isRunning: boolean; nextRun?: string; nextRunFormatted?: string } {
    if (!this.scheduledTask) {
      return { isRunning: false };
    }

    const nextRun = new Date();
    nextRun.setHours(2, 0, 0, 0);
    if (nextRun.getTime() <= Date.now()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return {
      isRunning: true,
      nextRun: nextRun.toISOString()
    };
  }

  // Run backup immediately (for testing)
  async runNow(): Promise<void> {
    console.log('Running backup manually...');
    await this.backupService.runBackup();
    await this.backupService.cleanupOldBackups();
  }
}