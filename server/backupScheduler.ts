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
        await this.backupService.runBackup();
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