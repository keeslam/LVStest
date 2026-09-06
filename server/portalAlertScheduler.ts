import * as cron from "node-cron";
import { scanVehicleAlertsForPortal } from "./services/portal-customer-notifications";

/**
 * Daily at 04:00 (and once a minute after startup): tells portal customers
 * about an APK that is about to expire and about service that is due on the
 * vehicles they have on the road. Same pattern as ServiceDueScheduler.
 */
export class PortalAlertScheduler {
  private task: cron.ScheduledTask | null = null;
  private startupTimer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.task) return;
    this.task = cron.createTask("0 4 * * *", () => this.run("scheduled"), { timezone: "Europe/Amsterdam" });
    this.task.start();
    this.startupTimer = setTimeout(() => this.run("startup"), 60_000);
    console.log("Portal alert scheduler started - daily APK/service scan at 04:00 (+ one run a minute after startup)");
  }

  stop(): void {
    if (this.task) { this.task.stop(); this.task = null; }
    if (this.startupTimer) { clearTimeout(this.startupTimer); this.startupTimer = null; }
  }

  private async run(reason: string): Promise<void> {
    try {
      const result = await scanVehicleAlertsForPortal();
      if (result.apk || result.service) console.log(`Portal alert scan (${reason}): ${result.apk} APK, ${result.service} service notifications created`);
    } catch (error) {
      console.error(`Portal alert scan (${reason}) failed:`, error);
    }
  }
}
