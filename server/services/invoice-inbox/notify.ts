import { storage } from "../../storage";
import { broadcastDataUpdate } from "../../realtime-events";

export interface InvoiceInboxEvent {
  title: string;
  description: string;
  priority?: "normal" | "high";
}

/**
 * In-app notification plus a live toast in every open staff session (see
 * client/src/hooks/use-socket.tsx, entity type "invoice-inbox"). No e-mail:
 * the invoice already arrived by e-mail. Never throws — a failed notification
 * must not fail the import.
 */
export async function notifyInvoiceInbox(event: InvoiceInboxEvent): Promise<void> {
  try {
    const notification = await storage.createCustomNotification({
      title: event.title,
      description: event.description,
      date: new Date().toISOString().slice(0, 10),
      type: "invoice_inbox",
      link: "/expenses?inbox=1",
      icon: "Receipt",
      priority: event.priority ?? "normal",
      isRead: false,
    });
    broadcastDataUpdate("invoice-inbox", "created", {
      notificationId: notification.id, title: event.title, description: event.description, link: "/expenses?inbox=1",
    });
  } catch (error) {
    console.error("invoice inbox notification failed:", error);
  }
}
