import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import type { HandoverKind } from '@/lib/handover-choice';

/** Which portal-admin list opens in the shared list dialog (see portal-list-dialog.tsx). */
export type PortalListKind = 'customers' | 'accounts' | 'requests' | 'fines' | 'vehicles' | 'activity' | 'blacklist';

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
  portalList: { open: boolean; kind: PortalListKind | null; plate?: string; importFileId?: number; types?: string[] };
  fineImport: { open: boolean };
  fineImports: { open: boolean };
  expenseVehicle: { open: boolean; vehicleId: number | null };
  expense: { open: boolean; expenseId: number | null; hideVehicleExpensesLink: boolean };
  rdwApkChanges: { open: boolean };
  // OPT-002: the dashboard's "Ophalen starten" / "Innemen starten" tiles carry
  // their intent into the scan panel.
  scan: { open: boolean; intent?: HandoverKind | null };
  // OPT-021: the "N" shortcut needs a new-reservation dialog that is not a
  // trigger inside one page's markup.
  newReservation: { open: boolean };
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
  openPortalListDialog: (kind: PortalListKind, opts?: { plate?: string; importFileId?: number; types?: string[] }) => void;
  closePortalListDialog: () => void;
  openFineImportDialog: () => void;
  closeFineImportDialog: () => void;
  openFineImportsDialog: () => void;
  closeFineImportsDialog: () => void;
  openExpenseVehicleDialog: (vehicleId: number) => void;
  closeExpenseVehicleDialog: () => void;
  openExpenseDialog: (expenseId: number, hideVehicleExpensesLink?: boolean) => void;
  closeExpenseDialog: () => void;
  openRdwApkChangesDialog: () => void;
  closeRdwApkChangesDialog: () => void;
  openScanDialog: (intent?: HandoverKind | null) => void;
  closeScanDialog: () => void;
  openNewReservationDialog: () => void;
  closeNewReservationDialog: () => void;
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
    fineImports: { open: false },
    expenseVehicle: { open: false, vehicleId: null },
    expense: { open: false, expenseId: null, hideVehicleExpensesLink: false },
    rdwApkChanges: { open: false },
    scan: { open: false, intent: null },
    newReservation: { open: false },
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
  const openPortalListDialog = (kind: PortalListKind, opts?: { plate?: string; importFileId?: number; types?: string[] }) => setDialogState((prev) => ({ ...prev, portalList: { open: true, kind, plate: opts?.plate, importFileId: opts?.importFileId, types: opts?.types } }));
  const closePortalListDialog = () => setDialogState((prev) => ({ ...prev, portalList: { open: false, kind: null } }));
  const openFineImportDialog = () => setDialogState((prev) => ({ ...prev, fineImport: { open: true } }));
  const closeFineImportDialog = () => setDialogState((prev) => ({ ...prev, fineImport: { open: false } }));
  const openFineImportsDialog = () => setDialogState((prev) => ({ ...prev, fineImports: { open: true } }));
  const closeFineImportsDialog = () => setDialogState((prev) => ({ ...prev, fineImports: { open: false } }));

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

  const openScanDialog = (intent: HandoverKind | null = null) => {
    setDialogState(prev => ({
      ...prev,
      scan: { open: true, intent }
    }));
  };

  const closeScanDialog = () => {
    setDialogState(prev => ({
      ...prev,
      scan: { open: false, intent: null }
    }));
  };

  const openNewReservationDialog = () => {
    setDialogState(prev => ({ ...prev, newReservation: { open: true } }));
  };

  const closeNewReservationDialog = () => {
    setDialogState(prev => ({ ...prev, newReservation: { open: false } }));
  };

  // BUG-210 — a Radix dialog locks the scroll while it is open and restores
  // the vertical offset on close, but leaves the horizontal one behind. On a
  // 1182 px laptop, where the calendar page already scrolls sideways, that
  // left window.scrollX at 234 px and the fixed sidebar covering the page
  // heading ("Reserveringskalender" cut down to "er").
  const anyDialogOpen = Object.values(dialogState).some(
    (state) => state && typeof state === "object" && (state as { open?: boolean }).open,
  );
  useEffect(() => {
    if (anyDialogOpen) return;
    if (typeof window === "undefined" || window.scrollX === 0) return;
    window.scrollTo({ left: 0, top: window.scrollY });
  }, [anyDialogOpen]);

  // BUG-228 — a fresh object here on every render made every consumer of this
  // context re-render whenever any dialog state changed anywhere in the app.
  const contextValue = useMemo(
    () => ({
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
        openFineImportsDialog,
        closeFineImportsDialog,
        openExpenseVehicleDialog,
        closeExpenseVehicleDialog,
        openExpenseDialog,
        closeExpenseDialog,
        openRdwApkChangesDialog,
        closeRdwApkChangesDialog,
      openScanDialog,
      closeScanDialog,
      openNewReservationDialog,
      closeNewReservationDialog,
    }),
    // The callbacks are stable setState wrappers; only the state can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dialogState],
  );

  return (
    <GlobalDialogContext.Provider value={contextValue}>
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
