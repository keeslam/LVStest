import { useTranslation } from "react-i18next";
import { PrintButtonInner, ReportPrintProvider } from "@/components/reports/kit/report-print";
import type { ReportDef } from "./report-registry";

interface ReportPaneProps {
  def: ReportDef;
}

/** One report: its title, Afdrukken (when the report registered something to print), then the report itself. */
export function ReportPane({ def }: ReportPaneProps) {
  const { t } = useTranslation(["reports", "fiscal"]);
  const Report = def.Component;
  const title = t(def.titleKey);
  return (
    <ReportPrintProvider>
      <section className="min-w-0 space-y-4" data-testid={`report-pane-${def.id}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold" data-testid="report-pane-title">{title}</h2>
          <PrintButtonInner title={title} />
        </div>
        {def.noteKey && (
          <p className="-mt-2 text-sm text-muted-foreground" data-testid="report-pane-note">{t(def.noteKey)}</p>
        )}
        <Report />
      </section>
    </ReportPrintProvider>
  );
}
