import { createContext, useContext, useState, ReactNode } from 'react';

interface DialogState {
  reservation: { open: boolean; id: number | null };
  spareAssignment: { open: boolean; id: number | null };
  apk: { open: boolean; vehicleId: number | null };
  maintenance: { open: boolean; vehicleId: number | null };
  vehicle: { open: boolean; vehicleId: number | null };
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
}

const GlobalDialogContext = createContext<GlobalDialogContextType | undefined>(undefined);

export function GlobalDialogProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState>({
    reservation: { open: false, id: null },
    spareAssignment: { open: false, id: null },
    apk: { open: false, vehicleId: null },
    maintenance: { open: false, vehicleId: null },
    vehicle: { open: false, vehicleId: null },
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
