/**
 * What a stored custom notification looks like on screen.
 *
 * The server appends a matching key to some descriptions (`[placeholder:<id>]`
 * for a spare-vehicle request, `[service:<vehicleId>]` for a service reminder)
 * and finds its own rows again by that text (database-storage.ts, utils/
 * service-due-scanner.ts). The keys must stay in the stored data, so they are
 * removed here, at display time only (A-2-5).
 */
export interface DisplayableNotification {
  type?: string | null;
  title: string;
  description: string;
}

type Translate = (key: string, options?: Record<string, string>) => string;

const TAG = /\s*\[(?:placeholder|service):\d+\]/g;

export function stripNotificationTags(text: string): string {
  return (text ?? "").replace(TAG, "").trim();
}

export function displayNotification(
  notification: DisplayableNotification,
  t: Translate,
): { title: string; description: string } {
  const description = stripNotificationTags(notification.description);

  // The spare-assignment notification is stored in English by the server.
  // `type` is the stable code; the period is read from the ISO dates in the text.
  if (notification.type === "spare_assignment") {
    const dates = description.match(/\d{4}-\d{2}-\d{2}/g);
    if (dates && dates.length > 0) {
      return {
        title: t("dashboard:notificationDisplay.spareAssignmentTitle"),
        description: t("dashboard:notificationDisplay.spareAssignmentDescription", {
          period: dates.length > 1 ? `${dates[0]} - ${dates[1]}` : dates[0],
        }),
      };
    }
  }

  return { title: stripNotificationTags(notification.title), description };
}
