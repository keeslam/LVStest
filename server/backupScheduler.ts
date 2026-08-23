import * as cron from 'node-cron';
import { BackupService } from './backupService';

export class BackupScheduler {
  private backupService: BackupService;
  private scheduledTask: cron.ScheduledTask | null = null;
  
  constructor() {
    this.backupService = new BackupService();
  }

  // Start the backup scheduler
  start(): void {
    if (this.scheduledTask) {
      console.log('Backup scheduler is already running');
      return;
    }

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
      scheduled: false, // Don't start immediately
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
        const last = await this.backupService.getLastSuccessfulRun();
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

  // Get scheduler status
  getStatus(): { isRunning: boolean; nextRun?: string; nextRunFormatted?: string } {
    if (!this.scheduledTask) {
      return { isRunning: false };
    }

    // Calculate next run time (2:00 AM tomorrow)
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(2, 0, 0, 0);
    
    // If it's already past 2 AM today, next run is tomorrow
    if (now.getHours() >= 2) {
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