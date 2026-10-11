import { runNightlyFiscalRun } from './services/fiscal/nightly';
import { createOfficeCronTask, type OfficeCronTask } from './services/office-time';

/**
 * Fiscal mobility check (docs/fiscaal, besluit F-03): the nightly assessment
 * of open periods for customers with the check switched on, after the
 * service-due scan (03:00) so the RDW calls do not compete with the APK scan.
 */
export class FiscalScheduler {
  private scheduledTask: OfficeCronTask | null = null;

  start(): void {
    if (this.scheduledTask) {
      console.log('Fiscal scheduler is already running');
      return;
    }
    // D11: runs in the office time zone setting and moves with it.
    this.scheduledTask = createOfficeCronTask('30 3 * * *', async () => {
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
    });
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
