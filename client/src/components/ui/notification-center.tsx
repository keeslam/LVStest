import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { Vehicle, Reservation, CustomNotification } from "@shared/schema";
import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";
import { useNotificationDataPermissions } from "@/hooks/use-has-permission";

export function NotificationCenter() {
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

  const isDismissed = (key: string): boolean => {
    const dismissedTimestamp = localStorage.getItem(key);
    if (!dismissedTimestamp) return false;
    const dismissedDate = new Date(parseInt(dismissedTimestamp));
    const daysSinceDismissal = differenceInDays(today, dismissedDate);
    if (daysSinceDismissal > 7) {
      localStorage.removeItem(key);
      return false;
    }
    return true;
  };

  const apkExpiringItems = apkExpiringVehicles.filter(
    (vehicle) => !isDismissed(`dismissed_apk_${vehicle.id}`)
  );

  const warrantyExpiringItems = warrantyExpiringVehicles.filter(
    (vehicle) => !isDismissed(`dismissed_warranty_${vehicle.id}`)
  );

  const upcomingReservationItems = upcomingReservations.filter((reservation) => {
    const daysUntil = differenceInDays(new Date(reservation.startDate), today);
    return daysUntil >= 0 && daysUntil <= 2;
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
