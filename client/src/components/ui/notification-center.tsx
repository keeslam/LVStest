import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { Vehicle, Reservation, CustomNotification } from "@shared/schema";
import { NotificationCenterDialog } from "@/components/notifications/notification-center-dialog";

export function NotificationCenter() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const today = new Date();

  const { data: apkExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/apk-expiring"],
  });

  const { data: warrantyExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/warranty-expiring"],
  });

  const { data: upcomingReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming"],
  });

  const { data: upcomingMaintenanceReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming-maintenance"],
  });

  const { data: customNotifications = [] } = useQuery<CustomNotification[]>({
    queryKey: ["/api/custom-notifications/unread"],
  });

  const { data: placeholderReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/placeholder-reservations/needing-assignment"],
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
