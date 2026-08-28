import * as cron from 'node-cron';
import { scanVehiclesForApkChanges } from './utils/rdw-apk-scanner';

export class ApkScanScheduler {
  private scheduledTask: cron.ScheduledTask | null = null;

  start(): void {
    if (this.scheduledTask) {
      console.log('APK scan scheduler is already running');
      return;
    }

    // Runs shortly after the nightly backup (02:00) so the two don't compete
    // for startup resources.
    this.scheduledTask = cron.schedule('30 2 * * *', async () => {
      console.log('Starting scheduled RDW APK scan...');
      try {
        const result = await scanVehiclesForApkChanges();
        console.log(`RDW APK scan completed: ${result.scanned} scanned, ${result.changesFound} changes found, ${result.errors} errors`);
      } catch (error) {
        console.error('Scheduled RDW APK scan failed:', error);
      }
    }, {
      scheduled: false,
      timezone: "Europe/Amsterdam"
    });

    this.scheduledTask.start();
    console.log('APK scan scheduler started - daily RDW scan at 02:30');
  }

  stop(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }
  }
}
