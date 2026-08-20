import { VehicleAvailabilityWidget } from "@/components/dashboard/vehicle-availability-widget";
import { ApkExpirationWidget } from "@/components/dashboard/apk-expiration-widget";
import { WarrantyExpirationWidget } from "@/components/dashboard/warranty-expiration-widget";
import { SpareVehicleAssignmentsWidget } from "@/components/dashboard/spare-vehicle-assignments-widget";
import { OverdueReservationsWidget } from "@/components/dashboard/overdue-reservations-widget";
import { UpcomingReservations } from "@/components/dashboard/upcoming-reservations";
import { RecentExpenses } from "@/components/dashboard/recent-expenses";
import { ReservationCalendar } from "@/components/dashboard/reservation-calendar";
import { QuickActions } from "@/components/dashboard/quick-actions";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <QuickActions />
      
      {/* Dashboard Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <VehicleAvailabilityWidget />
        <ApkExpirationWidget />
        <OverdueReservationsWidget />
        <WarrantyExpirationWidget />
      </div>
      
      {/* Spare Vehicles and Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpareVehicleAssignmentsWidget />
        <RecentExpenses />
      </div>
      
      {/* Upcoming Reservations */}
      <UpcomingReservations />
      
      {/* Calendar */}
      <ReservationCalendar />
    </div>
  );
}
