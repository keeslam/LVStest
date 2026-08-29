import { invalidateByPrefix } from "@/lib/queryClient";
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalDialog } from '@/contexts/GlobalDialogContext';
import { ReservationViewDialog } from '@/components/reservations/reservation-view-dialog';
import { ReservationEditDialog } from '@/components/reservations/reservation-edit-dialog';
import { SpareVehicleDialog } from '@/components/reservations/spare-vehicle-dialog';
import { ApkInspectionDialog } from '@/components/vehicles/apk-inspection-dialog';
import { VehicleViewDialog } from '@/components/vehicles/vehicle-view-dialog';
import { ExpenseViewDialog } from '@/components/expenses/expense-view-dialog';
import { ExpenseDetailDialog } from '@/components/expenses/expense-detail-dialog';
import { ScanDialog } from '@/components/barcodes/scan-dialog';
import { Vehicle, Reservation } from '@shared/schema';

export function GlobalDialogs() {
  const queryClient = useQueryClient();
  const [editReservationId, setEditReservationId] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  const {
    dialogState,
    closeReservationDialog,
    closeSpareAssignmentDialog,
    closeAPKDialog,
    closeMaintenanceDialog,
    closeVehicleDialog,
    closeExpenseVehicleDialog,
    closeExpenseDialog,
    closeScanDialog,
  } = useGlobalDialog();
  
  const handleEditReservation = (reservationId: number) => {
    console.log('GlobalDialogs handleEditReservation called with:', reservationId);
    setEditReservationId(reservationId);
    setEditDialogOpen(true);
    closeReservationDialog();
  };

  // Fetch reservation data when dialog is open
  const { data: reservation } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${dialogState.reservation.id}`],
    enabled: dialogState.reservation.open && !!dialogState.reservation.id,
  });

  // Fetch placeholder reservation data for spare assignment
  const { data: placeholderReservation } = useQuery<Reservation>({
    queryKey: [`/api/reservations/${dialogState.spareAssignment.id}`],
    enabled: dialogState.spareAssignment.open && !!dialogState.spareAssignment.id,
  });

  // Fetch vehicle data for APK dialog
  const { data: apkVehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${dialogState.apk.vehicleId}`],
    enabled: dialogState.apk.open && !!dialogState.apk.vehicleId,
  });

  // Fetch vehicle data for maintenance dialog
  const { data: maintenanceVehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${dialogState.maintenance.vehicleId}`],
    enabled: dialogState.maintenance.open && !!dialogState.maintenance.vehicleId,
  });

  return (
    <>
      {/* Reservation Details Dialog */}
      <ReservationViewDialog
        open={dialogState.reservation.open}
        onOpenChange={closeReservationDialog}
        reservationId={dialogState.reservation.id}
        onEdit={handleEditReservation}
      />
      
      {/* Reservation Edit Dialog */}
      <ReservationEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        reservationId={editReservationId}
        onSuccess={() => {
          setEditDialogOpen(false);
          invalidateByPrefix('/api/reservations');
        }}
      />

      {/* Spare Assignment Dialog */}
      {placeholderReservation && (
        <SpareVehicleDialog
          open={dialogState.spareAssignment.open}
          onOpenChange={closeSpareAssignmentDialog}
          originalReservation={placeholderReservation}
          onSuccess={() => {
            closeSpareAssignmentDialog();
          }}
        />
      )}

      {/* APK Dialog */}
      {apkVehicle && (
        <ApkInspectionDialog
          open={dialogState.apk.open}
          onOpenChange={closeAPKDialog}
          vehicle={apkVehicle}
          onSuccess={() => {
            closeAPKDialog();
          }}
        />
      )}

      {/* Maintenance/Warranty Dialog - Opens vehicle maintenance tab */}
      {maintenanceVehicle && (
        <ApkInspectionDialog
          open={dialogState.maintenance.open}
          onOpenChange={closeMaintenanceDialog}
          vehicle={maintenanceVehicle}
          onSuccess={() => {
            closeMaintenanceDialog();
          }}
        />
      )}

      {/* Vehicle Details Dialog */}
      <VehicleViewDialog
        open={dialogState.vehicle.open}
        onOpenChange={closeVehicleDialog}
        vehicleId={dialogState.vehicle.vehicleId}
      />

      {/* Vehicle Expenses Dialog */}
      {dialogState.expenseVehicle.vehicleId !== null && (
        <ExpenseViewDialog
          open={dialogState.expenseVehicle.open}
          onOpenChange={closeExpenseVehicleDialog}
          vehicleId={dialogState.expenseVehicle.vehicleId}
        />
      )}

      {/* Expense Detail Dialog */}
      <ExpenseDetailDialog
        open={dialogState.expense.open}
        onOpenChange={closeExpenseDialog}
        expenseId={dialogState.expense.expenseId}
        hideVehicleExpensesLink={dialogState.expense.hideVehicleExpensesLink}
      />

      {/* Barcode Scan Dialog */}
      <ScanDialog
        open={dialogState.scan.open}
        onOpenChange={(open) => !open && closeScanDialog()}
      />
    </>
  );
}
