import { storage } from "../storage";
import { broadcastDataUpdate } from "../realtime-events";
import { sendEmail } from "../utils/email-service";
import { getPortalConfig } from "./portal-config";
import { getPortalTemplate, renderTemplate, PORTAL_TEMPLATE } from "./portal-mail";

export interface PortalStaffEvent {
  /** e.g. 'portal_driver_change', later 'portal_booking_request', 'portal_request' */
  kind: string;
  title: string;
  description: string;
  /** In-app link, e.g. `/reservations/edit/12` */
  link?: string;
  customerId: number;
}

/**
 * One place every "a customer did something in the portal" goes through:
 * an in-app notification for staff plus an e-mail to the configured address.
 * Parts 2 (bookings) and 4 (requests) call this too. Never throws: a failed
 * notification must not fail the customer's action.
 */
export async function notifyStaffOfPortalEvent(event: PortalStaffEvent): Promise<void> {
  try {
    const notification = await storage.createCustomNotification({
      title: event.title,
      description: event.description,
      date: new Date().toISOString().slice(0, 10),
      type: event.kind,
      link: event.link ?? "",
      icon: "Users",
      priority: "normal",
      isRead: false,
    });
    // Live toast + badge in every open staff session (see use-socket.tsx).
    broadcastDataUpdate("portal", event.kind, {
      notificationId: notification.id, title: event.title, description: event.description,
      link: event.link ?? "", customerId: event.customerId,
    });
  } catch (error) {
    console.error("portal notification (in-app) failed:", error);
  }

  try {
    const config = await getPortalConfig();
    if (!config.notificationEmail) {
      console.warn("portal notification e-mail skipped: no notificationEmail in portal_config");
      return;
    }
    const customer = await storage.getCustomer(event.customerId);
    const template = await getPortalTemplate(PORTAL_TEMPLATE.STAFF);
    const vars = {
      title: event.title,
      description: event.description,
      company: customer?.companyName || customer?.name || String(event.customerId),
      link: event.link ?? "",
    };
    await sendEmail({
      to: config.notificationEmail,
      subject: renderTemplate(template.subject, vars),
      html: renderTemplate(template.content, vars),
    }, "custom");
  } catch (error) {
    console.error("portal notification (e-mail) failed:", error);
  }
}
