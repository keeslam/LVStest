import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { saveCsvFile, type Cell } from "@/lib/csv";
import { portalFetch } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { btnSecondary } from "@/components/portal/ui";

export type PortalExportList = "vehicles" | "drivers" | "reservations";

/**
 * "Exporteren (CSV)" above a portal list (Kees, 2026-10-18). The file is built in the browser from
 * the rows the customer already sees (the current filter or search, every page), so it holds nothing
 * the screen does not; the server only writes down who exported which list. Formula protection and
 * the Dutch Excel conventions come from lib/csv.
 */
export function PortalExportButton({ list, rows }: { list: PortalExportList; rows: () => { header: string[]; rows: Cell[][] } }) {
  const { t } = useTranslation("portal");
  const onClick = () => {
    const file = rows();
    saveCsvFile(t(`export.file.${list}`), file.header, file.rows);
    // Best effort: a failed log line must not take the customer's file away.
    portalFetch("POST", "/api/portal/exports", { list, rows: file.rows.length }).catch(() => {});
  };
  return (
    <Button variant="outline" className={btnSecondary} onClick={onClick} data-testid={`button-export-${list}`}>
      <Download className="mr-1.5 h-4 w-4" />{t("export.button")}
    </Button>
  );
}
