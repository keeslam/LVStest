import { scanVehiclesForApkChanges } from './utils/rdw-apk-scanner';
import { createOfficeCronTask, type OfficeCronTask } from './services/office-time';
import { AuditLogger } from './utils/security/auditLogger';

/** How many ids one audit row names; the counts are always complete. */
const MAX_IDS_IN_AUDIT_ROW = 100;

export class ApkScanScheduler {
  private scheduledTask: OfficeCronTask | null = null;

  start(): void {
    if (this.scheduledTask) {
      console.log('APK scan scheduler is already running');
      return;
    }

    // Runs shortly after the nightly backup (02:00) so the two don't compete
    // for startup resources.
    // D11: runs in the office time zone setting and moves with it.
    this.scheduledTask = createOfficeCronTask('30 2 * * *', async () => {
      console.log('Starting scheduled RDW APK scan...');
      try {
        const result = await scanVehiclesForApkChanges();
        console.log(`RDW APK scan completed: ${result.scanned} scanned, ${result.changesFound} changes found, ${result.errors} errors`);
        // The activity log is where staff look for "why did this change
        // overnight"; the scan is the only writer of apk_date_changes besides them.
        void AuditLogger.system('system.apk-scan', {
          trigger: 'scheduled',
          scanned: result.scanned,
          changesFound: result.changesFound,
          errors: result.errors,
          vehicleIds: result.changedVehicleIds.slice(0, MAX_IDS_IN_AUDIT_ROW),
        });
      } catch (error) {
        console.error('Scheduled RDW APK scan failed:', error);
        void AuditLogger.system('system.apk-scan', {
          trigger: 'scheduled',
          error: error instanceof Error ? error.message : String(error),
        }, 'failure');
      }
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
