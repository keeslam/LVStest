import { createContext, useContext, useState, ReactNode } from 'react';

/** Which portal-admin list opens in the shared list dialog (see portal-list-dialog.tsx). */
export type PortalListKind = 'customers' | 'accounts' | 'requests' | 'fines' | 'vehicles' | 'activity';

interface DialogState {
  reservation: { open: boolean; id: number | null };
  spareAssignment: { open: boolean; id: number | null };
  apk: { open: boolean; vehicleId: number | null };
  maintenance: { open: boolean; vehicleId: number | null };
  vehicle: { open: boolean; vehicleId: number | null };
  customer: { open: boolean; customerId: number | null; initialTab?: string };
  fine: { open: boolean; id: number | null };
  newFine: { open: boolean; licensePlate?: string };
  portalRequest: { open: boolean; id: number | null };
  portalList: { open: boolean; kind: PortalListKind | null; plate?: string };
  fineImport: { open: boolean };
  expenseVehicle: { open: boolean; vehicleId: number | null };
  expense: { open: boolean; expenseId: number | null; hideVehicleExpensesLink: boolean };
  rdwApkChanges: { open: boolean };
  scan: { open: boolean };
}

interface GlobalDialogContextType {
  dialogState: DialogState;
  openReservationDialog: (id: number) => void;
  closeReservationDialog: () => void;
  openSpareAssignmentDialog: (id: number) => void;
  closeSpareAssignmentDialog: () => void;
  openAPKDialog: (vehicleId: number) => void;
  closeAPKDialog: () => void;
  openMaintenanceDialog: (vehicleId: number) => void;
  closeMaintenanceDialog: () => void;
  openVehicleDialog: (vehicleId: number) => void;
  closeVehicleDialog: () => void;
  openCustomerDialog: (customerId: number, initialTab?: string) => void;
  closeCustomerDialog: () => void;
  openFineDialog: (id: number) => void;
  closeFineDialog: () => void;
  openNewFineDialog: (prefill?: { licensePlate?: string }) => void;
  closeNewFineDialog: () => void;
  openPortalRequestDialog: (id: number) => void;
  closePortalRequestDialog: () => void;
  openPortalListDialog: (kind: PortalListKind, opts?: { plate?: string }) => void;
  closePortalListDialog: () => void;
  openFineImportDialog: () => void;
  closeFineImportDialog: () => void;
  openExpenseVehicleDialog: (vehicleId: number) => void;
  closeExpenseVehicleDialog: () => void;
  openExpenseDialog: (expenseId: number, hideVehicleExpensesLink?: boolean) => void;
  closeExpenseDialog: () => void;
  openRdwApkChangesDialog: () => void;
  closeRdwApkChangesDialog: () => void;
  openScanDialog: () => void;
  closeScanDialog: () => void;
}

const GlobalDialogContext = createContext<GlobalDialogContextType | undefined>(undefined);

export function GlobalDialogProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState>({
    reservation: { open: false, id: null },
    spareAssignment: { open: false, id: null },
    apk: { open: false, vehicleId: null },
    maintenance: { open: false, vehicleId: null },
    vehicle: { open: false, vehicleId: null },
    customer: { open: false, customerId: null },
    fine: { open: false, id: null },
    newFine: { open: false },
    portalRequest: { open: false, id: null },
    portalList: { open: false, kind: null },
    fineImport: { open: false },
    expenseVehicle: { open: false, vehicleId: null },
    expense: { open: false, expenseId: null, hideVehicleExpensesLink: false },
    rdwApkChanges: { open: false },
    scan: { open: false },
  });

  const openReservationDialog = (id: number) => {
    setDialogState(prev => ({
      ...prev,
      reservation: { open: true, id }
    }));
  };

  const closeReservationDialog = () => {
    setDialogState(prev => ({
      ...prev,
      reservation: { open: false, id: null }
    }));
  };

  const openSpareAssignmentDialog = (id: number) => {
    setDialogState(prev => ({
      ...prev,
      spareAssignment: { open: true, id }
    }));
  };

  const closeSpareAssignmentDialog = () => {
    setDialogState(prev => ({
      ...prev,
      spareAssignment: { open: false, id: null }
    }));
  };

  const openAPKDialog = (vehicleId: number) => {
    setDialogState(prev => ({
      ...prev,
      apk: { open: true, vehicleId }
    }));
  };

  const closeAPKDialog = () => {
    setDialogState(prev => ({
      ...prev,
      apk: { open: false, vehicleId: null }
    }));
  };

  const openMaintenanceDialog = (vehicleId: number) => {
    setDialogState(prev => ({
      ...prev,
      maintenance: { open: true, vehicleId }
    }));
  };

  const closeMaintenanceDialog = () => {
    setDialogState(prev => ({
      ...prev,
      maintenance: { open: false, vehicleId: null }
    }));
  };

  const openVehicleDialog = (vehicleId: number) => {
    setDialogState(prev => ({
      ...prev,
      vehicle: { open: true, vehicleId }
    }));
  };

  const closeVehicleDialog = () => {
    setDialogState(prev => ({
      ...prev,
      vehicle: { open: false, vehicleId: null }
    }));
  };

  const openCustomerDialog = (customerId: number, initialTab?: string) => {
    setDialogState(prev => ({
      ...prev,
      customer: { open: true, customerId, initialTab }
    }));
  };

  const openFineDialog = (id: number) => setDialogState((prev) => ({ ...prev, fine: { open: true, id } }));
  const closeFineDialog = () => setDialogState((prev) => ({ ...prev, fine: { open: false, id: null } }));
  const openNewFineDialog = (prefill?: { licensePlate?: string }) => setDialogState((prev) => ({ ...prev, newFine: { open: true, licensePlate: prefill?.licensePlate } }));
  const closeNewFineDialog = () => setDialogState((prev) => ({ ...prev, newFine: { open: false } }));
  const openPortalRequestDialog = (id: number) => setDialogState((prev) => ({ ...prev, portalRequest: { open: true, id } }));
  const closePortalRequestDialog = () => setDialogState((prev) => ({ ...prev, portalRequest: { open: false, id: null } }));
  const openPortalListDialog = (kind: PortalListKind, opts?: { plate?: string }) => setDialogState((prev) => ({ ...prev, portalList: { open: true, kind, plate: opts?.plate } }));
  const closePortalListDialog = () => setDialogState((prev) => ({ ...prev, portalList: { open: false, kind: null } }));
  const openFineImportDialog = () => setDialogState((prev) => ({ ...prev, fineImport: { open: true } }));
  const closeFineImportDialog = () => setDialogState((prev) => ({ ...prev, fineImport: { open: false } }));

  const closeCustomerDialog = () => {
    setDialogState(prev => ({
      ...prev,
      customer: { open: false, customerId: null }
    }));
  };

  const openExpenseVehicleDialog = (vehicleId: number) => {
    setDialogState(prev => ({
      ...prev,
      expenseVehicle: { open: true, vehicleId }
    }));
  };

  const closeExpenseVehicleDialog = () => {
    setDialogState(prev => ({
      ...prev,
      expenseVehicle: { open: false, vehicleId: null }
    }));
  };

  const openExpenseDialog = (expenseId: number, hideVehicleExpensesLink: boolean = false) => {
    setDialogState(prev => ({
      ...prev,
      expense: { open: true, expenseId, hideVehicleExpensesLink }
    }));
  };

  const closeExpenseDialog = () => {
    setDialogState(prev => ({
      ...prev,
      expense: { open: false, expenseId: null, hideVehicleExpensesLink: false }
    }));
  };

  const openRdwApkChangesDialog = () => {
    setDialogState(prev => ({
      ...prev,
      rdwApkChanges: { open: true }
    }));
  };

  const closeRdwApkChangesDialog = () => {
    setDialogState(prev => ({
      ...prev,
      rdwApkChanges: { open: false }
    }));
  };

  const openScanDialog = () => {
    setDialogState(prev => ({
      ...prev,
      scan: { open: true }
    }));
  };

  const closeScanDialog = () => {
    setDialogState(prev => ({
      ...prev,
      scan: { open: false }
    }));
  };

  return (
    <GlobalDialogContext.Provider
      value={{
        dialogState,
        openReservationDialog,
        closeReservationDialog,
        openSpareAssignmentDialog,
        closeSpareAssignmentDialog,
        openAPKDialog,
        closeAPKDialog,
        openMaintenanceDialog,
        closeMaintenanceDialog,
        openVehicleDialog,
        closeVehicleDialog,
        openCustomerDialog,
        closeCustomerDialog,
        openFineDialog,
        closeFineDialog,
        openNewFineDialog,
        closeNewFineDialog,
        openPortalRequestDialog,
        closePortalRequestDialog,
        openPortalListDialog,
        closePortalListDialog,
        openFineImportDialog,
        closeFineImportDialog,
        openExpenseVehicleDialog,
        closeExpenseVehicleDialog,
        openExpenseDialog,
        closeExpenseDialog,
        openRdwApkChangesDialog,
        closeRdwApkChangesDialog,
        openScanDialog,
        closeScanDialog,
      }}
    >
      {children}
    </GlobalDialogContext.Provider>
  );
}

export function useGlobalDialog() {
  const context = useContext(GlobalDialogContext);
  if (context === undefined) {
    throw new Error('useGlobalDialog must be used within a GlobalDialogProvider');
  }
  return context;
}
