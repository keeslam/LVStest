import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportDef } from "./report-registry";

interface ReportPaneProps {
  def: ReportDef;
  /** Opens the print dialog. The button only shows when the report has something to print (Task 4). */
  onPrint?: () => void;
}

/** One report: its title, Afdrukken, then the report itself. */
export function ReportPane({ def, onPrint }: ReportPaneProps) {
  const { t } = useTranslation(["reports", "fiscal"]);
  const Report = def.Component;
  return (
    <section className="min-w-0 space-y-4" data-testid={`report-pane-${def.id}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold" data-testid="report-pane-title">{t(def.titleKey)}</h2>
        {onPrint && (
          <Button variant="outline" size="sm" onClick={onPrint} data-testid="button-report-print">
            <Printer className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("reports:reportsPage.shell.print")}
          </Button>
        )}
      </div>
      <Report />
    </section>
  );
}
