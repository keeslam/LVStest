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
    // I5: the socket reaches every open staff session, and the title repeats
    // words a stranger chose. Only the id goes out; the client shows its own
    // translated sentence and refetches the list.
    broadcastDataUpdate("invoice-inbox", "created", { id: notification.id });
  } catch (error) {
    console.error("invoice inbox notification failed:", error);
  }
}
