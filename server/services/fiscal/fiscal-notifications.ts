/**
 * The notifications of besluit F-06.
 *
 * Staff: a review is needed, data is missing, a rule version becomes active.
 * Customer (only with the customer's `fiscal_warnings_enabled` on): data is
 * missing, Lam Groep must review, a replacement approaches its exemption
 * limit, a period is about to enter a new calendar month. Never a draft,
 * never an internal parameter. Every notification is deduplicated, so the
 * nightly run can send them every night without repeating itself.
 */
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../db";
import { customNotifications, portalCustomerSettings } from "../../../shared/schema";
import { storage } from "../../storage";
import { broadcastDataUpdate } from "../../realtime-events";
import { customerNotifications } from "../portal-customer-notifications";

export type StaffFiscalType = "fiscal_review_required" | "fiscal_data_missing" | "fiscal_version_active";
export type CustomerFiscalType = "fiscal_data_missing" | "fiscal_review_by_lam" | "fiscal_limit_warning" | "fiscal_month_boundary";

const STAFF_DEDUPE_DAYS = 30;

/** In-app notification for staff; one per (type, link) per 30 days. */
export async function notifyStaffFiscal(input: { type: StaffFiscalType; title: string; description: string; link: string; today: string }): Promise<boolean> {
  const since = new Date(Date.now() - STAFF_DEDUPE_DAYS * 86_400_000);
  const [dup] = await db
    .select({ id: customNotifications.id })
    .from(customNotifications)
    .where(and(eq(customNotifications.type, input.type), eq(customNotifications.link, input.link), gt(customNotifications.createdAt, since)))
    .limit(1);
  if (dup) return false;
  try {
    const notification = await storage.createCustomNotification({
      title: input.title,
      description: input.description,
      date: input.today,
      type: input.type,
      link: input.link,
      icon: "Calculator",
      priority: "normal",
      isRead: false,
    });
    broadcastDataUpdate("notifications", "created", { id: notification.id });
    return true;
  } catch (error) {
    console.error("[fiscal] staff notification failed:", error);
    return false;
  }
}

/** Portal notification for a customer, only when the customer has the check and the warnings on. */
export async function notifyCustomerFiscal(customerId: number, input: { type: CustomerFiscalType; title: string; description: string; link?: string; dedupeTag: string; dedupeDays?: number }): Promise<boolean> {
  const [settings] = await db
    .select({ enabled: portalCustomerSettings.fiscalMobilityEnabled, warnings: portalCustomerSettings.fiscalWarningsEnabled })
    .from(portalCustomerSettings)
    .where(eq(portalCustomerSettings.customerId, customerId));
  if (!settings?.enabled || !settings.warnings) return false;
  try {
    const row = await customerNotifications.notify({
      customerId,
      type: input.type,
      title: input.title,
      description: input.description,
      link: input.link ?? "/fiscaal",
      dedupeTag: input.dedupeTag,
      dedupeDays: input.dedupeDays ?? 30,
    });
    return row !== null;
  } catch (error) {
    console.error("[fiscal] customer notification failed:", error);
    return false;
  }
}
