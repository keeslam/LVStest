import { useState } from "react";
import { useDismissedNotifications } from "@/hooks/use-dismissed-notifications";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { Vehicle, Reservation, CustomNotification } from "@shared/schema";
import type { ZoneExpiringRow } from "@shared/zone-expiry";
import type { MissingInvoiceRow } from "@shared/missing-invoice";
import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";
import { useNotificationDataPermissions } from "@/hooks/use-has-permission";

export function NotificationCenter() {
  const { t } = useTranslation("common");
  const [dialogOpen, setDialogOpen] = useState(false);
  const today = new Date();
  // Task 2 (docs/superpowers/specs/2026-09-21-toegang-design.md, §2; fact
  // sheet, "Global (every page, via MainLayout)"): this widget mounts on
  // every staff page regardless of that page's own permission, so each of
  // its queries is gated with exactly the permission(s) its own server route
  // accepts (verified directly against server/routes.ts, not just the fact
  // sheet, since its line numbers may have drifted). Fix round 1: shared
  // with notification-center-dialog.tsx, the other half of this same
  // widget, via one hook so the two files can't drift apart.
  const { canViewVehicles, canViewReservations, canViewUpcomingMaintenance, canViewNotifications } =
    useNotificationDataPermissions();

  const { data: apkExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/apk-expiring"],
    enabled: canViewVehicles,
  });

  const { data: warrantyExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/warranty-expiring"],
    enabled: canViewVehicles,
  });

  // Round 2 punt 9: low-emission-zone and Move IZI end dates.
  const { data: zoneExpiringRows = [] } = useQuery<ZoneExpiringRow[]>({
    queryKey: ["/api/vehicles/zone-expiring"],
    enabled: canViewVehicles,
  });

  // Round 2 punt 11 part B: workshop visits whose invoice is missing, and the
  // number of days ahead for upcoming rentals (notification settings, default 2).
  const { data: missingInvoiceData } = useQuery<{ rows: MissingInvoiceRow[] }>({
    queryKey: ["/api/maintenance-blocks/missing-invoices"],
    enabled: canViewVehicles,
  });
  const { data: notificationSystemSettings } = useQuery<{ upcomingReservationDays?: number }>({ queryKey: ["/api/system-settings"] });
  const upcomingDays = notificationSystemSettings?.upcomingReservationDays ?? 2;

  const { data: upcomingReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming"],
    enabled: canViewReservations,
  });

  const { data: upcomingMaintenanceReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming-maintenance"],
    enabled: canViewUpcomingMaintenance,
  });

  const { data: customNotifications = [] } = useQuery<CustomNotification[]>({
    queryKey: ["/api/custom-notifications/unread"],
    enabled: canViewNotifications,
  });

  const { data: placeholderReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/placeholder-reservations/needing-assignment"],
    enabled: canViewReservations,
  });

  // Round 2 punt 12: the team's dismissals (server), the same as the notification centre.
  const { isDismissed } = useDismissedNotifications();

  const apkExpiringItems = apkExpiringVehicles.filter(
    (vehicle) => !isDismissed(`dismissed_apk_${vehicle.id}`, vehicle.apkDate)
  );

  const warrantyExpiringItems = warrantyExpiringVehicles.filter(
    (vehicle) => !isDismissed(`dismissed_warranty_${vehicle.id}`, vehicle.warrantyEndDate)
  );

  const zoneExpiringItems = zoneExpiringRows.filter(
    (z) => !isDismissed(`dismissed_zone_${z.kind}_${z.id}`, z.date)
  );

  const missingInvoiceItems = (missingInvoiceData?.rows ?? []).filter(
    (m) => !isDismissed(`dismissed_missing_invoice_${m.visitId}`, m.endDate)
  );

  const upcomingReservationItems = upcomingReservations.filter((reservation) => {
    const daysUntil = differenceInDays(new Date(reservation.startDate), today);
    return daysUntil >= 0 && daysUntil <= upcomingDays;
  });

  const upcomingMaintenanceItems = upcomingMaintenanceReservations.filter((reservation) => {
    const daysUntil = differenceInDays(new Date(reservation.startDate), today);
    return daysUntil >= 0 && daysUntil <= 7;
  });

  const nonSpareCustomNotifications = customNotifications.filter(
    (n) => !n.title.includes("Spare Vehicle Assignment")
  );

  const totalNotifications =
    apkExpiringItems.length +
    warrantyExpiringItems.length +
    zoneExpiringItems.length +
    missingInvoiceItems.length +
    upcomingReservationItems.length +
    upcomingMaintenanceItems.length +
    placeholderReservations.length +
    nonSpareCustomNotifications.length;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setDialogOpen(true)}
        // A-2-12: an icon-only button needs a name; the count is part of it.
        aria-label={totalNotifications > 0 ? `${t("a11y.notifications")} (${totalNotifications})` : t("a11y.notifications")}
        data-testid="button-notification-center"
      >
        <Bell className="h-5 w-5" />
        {totalNotifications > 0 && (
          <Badge
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            variant="destructive"
          >
            {totalNotifications}
          </Badge>
        )}
      </Button>

      <NotificationCenterDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
