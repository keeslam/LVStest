import * as cron from 'node-cron';
import { scanVehiclesForServiceDue } from './utils/service-due-scanner';

// Keeps the "service due" notifications in sync with the vehicles' odometer
// readings and last-service dates. Runs nightly (after the backup and the RDW
// APK scan) and once shortly after startup so a restart never leaves stale
// notifications behind.
export class ServiceDueScheduler {
  private scheduledTask: cron.ScheduledTask | null = null;
  private startupTimer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.scheduledTask) {
      console.log('Service-due scheduler is already running');
      return;
    }

    this.scheduledTask = cron.createTask('0 3 * * *', () => this.run('scheduled'), {
      timezone: 'Europe/Amsterdam',
    });
    this.scheduledTask.start();

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.run('startup');
    }, 60 * 1000);

    console.log('Service-due scheduler started - daily scan at 03:00 (+ one run a minute after startup)');
  }

  stop(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }
  }

  private async run(reason: string): Promise<void> {
    try {
      const result = await scanVehiclesForServiceDue();
      console.log(
        `Service-due scan (${reason}): ${result.scanned} vehicles, ${result.due} due, ${result.dueSoon} due soon, ` +
          `${result.notificationsCreated} notification(s) created, ${result.notificationsRemoved} removed`,
      );
    } catch (error) {
      console.error(`Service-due scan (${reason}) failed:`, error);
    }
  }
}
