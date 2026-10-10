import { useTranslation } from "react-i18next";
import { FinesTable } from "@/components/fines/fines-table";

/**
 * Bekeuringen: the fines list as a screen of its own (A-R-1). "Boetes bekijken"
 * used to have no entry: the only list lived in the Klantenportaal screen, which
 * asks for the portal right. Same table, same dialogs; the server guards are the
 * ones the list always had (GET /api/fines: view_fines or manage_fines).
 */
export default function FinesPage() {
  const { t } = useTranslation("portal");
  return (
    <div className="space-y-4 p-4" data-testid="fines-page">
      <h1 className="text-2xl font-semibold">{t("admin.fines.pageTitle")}</h1>
      <FinesTable />
    </div>
  );
}
