import * as cron from 'node-cron';
import { runNightlyFiscalRun } from './services/fiscal/nightly';

/**
 * Fiscal mobility check (docs/fiscaal, besluit F-03): the nightly assessment
 * of open periods for customers with the check switched on, after the
 * service-due scan (03:00) so the RDW calls do not compete with the APK scan.
 */
export class FiscalScheduler {
  private scheduledTask: cron.ScheduledTask | null = null;

  start(): void {
    if (this.scheduledTask) {
      console.log('Fiscal scheduler is already running');
      return;
    }
    this.scheduledTask = cron.createTask('30 3 * * *', async () => {
      console.log('Starting nightly fiscal run...');
      try {
        const r = await runNightlyFiscalRun();
        console.log(
          `Nightly fiscal run completed: ${r.customers} customers, ${r.periodsAssessed} periods, ${r.assessmentsCreated} new assessments, ` +
          `${r.profilesRefreshed} profiles refreshed, ${r.staffNotifications} staff and ${r.customerNotifications} customer notifications, ${r.versionsActivated} versions activated`,
        );
      } catch (error) {
        console.error('Nightly fiscal run failed:', error);
      }
    }, { timezone: 'Europe/Amsterdam' });
    this.scheduledTask.start();
    console.log('Fiscal scheduler started - nightly run at 03:30');
  }

  stop(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }
  }
}
