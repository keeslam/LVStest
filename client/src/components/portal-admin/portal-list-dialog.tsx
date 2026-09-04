import { useTranslation } from "react-i18next";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountsTable } from "./accounts-table";
import { CustomersOverviewTable } from "./customers-overview-table";
import { OnlineVehiclesTable } from "./online-vehicles-table";
import { ActivityTable } from "./activity-table";
import { RequestsTable } from "./requests-table";
import { FinesTable } from "@/components/fines/fines-table";

/**
 * One wide dialog for every portal-admin list (customers, accounts, requests,
 * fines, vehicles online, activity). Opened from the Klantenportaal dashboard
 * buttons and from links elsewhere (e.g. the fines count in a vehicle dialog).
 */
export function PortalListDialog() {
  const { t } = useTranslation("portal");
  const { dialogState, closePortalListDialog } = useGlobalDialog();
  const { open, kind, plate, importFileId } = dialogState.portalList;
  if (!kind) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closePortalListDialog()}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col" data-testid={`dialog-portal-list-${kind}`}>
        <DialogHeader><DialogTitle>{t(`admin.tabs.${kind}`)}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-auto">
          {kind === "customers" && <CustomersOverviewTable />}
          {kind === "accounts" && <AccountsTable />}
          {kind === "requests" && <RequestsTable />}
          {kind === "fines" && <FinesTable key={`${plate ?? ""}-${importFileId ?? ""}`} initialPlate={plate} importFileId={importFileId} />}
          {kind === "vehicles" && <OnlineVehiclesTable />}
          {kind === "activity" && <ActivityTable limit={200} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
