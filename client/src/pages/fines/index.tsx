import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { FinesTable } from "@/components/fines/fines-table";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";

/**
 * Bekeuringen: the fines list as a screen of its own (A-R-1). "Boetes bekijken"
 * used to have no entry: the only list lived in the Klantenportaal screen, which
 * asks for the portal right. Same table, same dialogs; the server guards are the
 * ones the list always had (GET /api/fines: view_fines or manage_fines).
 */
export default function FinesPage() {
  const { t } = useTranslation("portal");
  // Kees, 2026-10-19: a notification about one fine links to /fines?bekeuring=<id> and opens it here.
  // The parameter is taken off the address afterwards, so going back or reloading does not reopen it.
  const search = useSearch();
  const [, navigate] = useLocation();
  const { openFineDialog } = useGlobalDialog();
  useEffect(() => {
    const id = Number(new URLSearchParams(search).get("bekeuring"));
    if (!Number.isInteger(id) || id <= 0) return;
    openFineDialog(id);
    navigate("/fines", { replace: true });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4 p-4" data-testid="fines-page">
      <h1 className="text-2xl font-semibold">{t("admin.fines.pageTitle")}</h1>
      <FinesTable />
    </div>
  );
}
