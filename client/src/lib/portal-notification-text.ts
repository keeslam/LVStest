/**
 * The title and text of a portal notification in the language the portal is shown in.
 *
 * Kees chose (2026-10-18) that the portal words a notice when it shows it, not when it is written:
 * one notice is often for every account of a customer, and each account can read another language.
 * The server stores what the notice is about (`params`: plate, car, dates...) next to a Dutch title
 * and description. A notice without params (written before this existed) or of a kind the portal
 * has no wording for is shown as stored.
 */
import type { TFunction } from "i18next";
import type { PortalNotificationDto, PortalNotificationParams } from "@shared/portal-types";
import { formatPortalCurrency, formatPortalDate } from "@/lib/portal-format";

type Text = { title: string; description: string };

const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

/** `12-10-2026 t/m 17-10-2026`, one day once, `vanaf …` when open-ended; empty without a start. */
function periodText(t: TFunction, start: unknown, end: unknown): string {
  const from = formatPortalDate(str(start) || null);
  if (!from) return "";
  if (!end) return t("notifications.words.periodFrom", { start: from });
  const to = formatPortalDate(str(end));
  return !to || to === from ? from : t("notifications.words.periodRange", { start: from, end: to });
}

/** The interpolation values of a notice, with dates, amounts and "no car yet" in the portal's language. */
function valuesOf(t: TFunction, p: PortalNotificationParams): Record<string, string> {
  const carOrNone = (value: unknown) => str(value) || t("notifications.words.noCar");
  return {
    ...Object.fromEntries(Object.entries(p).map(([key, value]) => [key, str(value)])),
    car: carOrNone(p.car),
    oldCar: carOrNone(p.oldCar),
    date: formatPortalDate(str(p.date) || null),
    endDate: formatPortalDate(str(p.endDate) || null),
    apkDate: formatPortalDate(str(p.apkDate) || null),
    amount: p.amount === undefined || p.amount === null ? "" : formatPortalCurrency(p.amount as string | number),
    period: periodText(t, p.startDate, p.endDate),
    oldPeriod: periodText(t, p.oldStartDate, p.oldEndDate),
    document: p.documentKind === "contract" ? t("notifications.words.documentContract") : t("notifications.words.documentDamageCheck"),
  };
}

/** Which description of a kind fits these values: a range, no period, or the plain one. */
function descriptionKey(type: string, p: PortalNotificationParams, values: Record<string, string>): string {
  if (["maintenance_planned", "maintenance_moved", "replacement_ready"].includes(type) && p.endDate && p.endDate !== p.date) return "descriptionRange";
  if (["reservation_cancelled", "document_available"].includes(type) && !values.period) return "descriptionNoPeriod";
  return "description";
}

export function portalNotificationText(n: PortalNotificationDto, t: TFunction, exists: (key: string) => boolean): Text {
  const p = n.params;
  const base = `notifications.kinds.${n.type}`;
  if (!p || !exists(`${base}.title`)) return { title: n.title, description: n.description };
  const values = valuesOf(t, p);
  if (n.type === "reservation_changed") {
    const changes = [
      p.datesChanged ? t("notifications.words.changesPeriod", { period: values.period, oldPeriod: values.oldPeriod }) : "",
      p.vehicleChanged ? t("notifications.words.changesVehicle", { car: values.car, oldCar: values.oldCar }) : "",
    ].filter(Boolean).join(" ");
    values.changes = changes;
  }
  const title = t(`${base}.title`, values);
  // A staff reply, or a customer's own message, is shown as it was written.
  if (p.reply || !exists(`${base}.description`)) return { title, description: n.description };
  return { title, description: t(`${base}.${descriptionKey(n.type, p, values)}`, values) };
}
