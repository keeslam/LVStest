/**
 * Onderhoudsanalyse: the CSV button next to a table of the window. Exports the rows as the table
 * shows them (search and sort applied, every page) with the columns on screen.
 */
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { reportTableCsv, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";

export function AnalysisCsvButton<R>({ columns, rows, view, name, testId }: {
  columns: ReportTableColumn<R>[];
  rows: R[];
  view: ReportTableView<R> | null;
  /** File name subject, e.g. "onderhoud-voertuigen". */
  name: string;
  testId: string;
}) {
  const { t } = useTranslation("reports");
  const exportCsv = () => {
    const [header, ...lines] = reportTableCsv(columns, view?.all ?? rows);
    downloadCsv(name, header, lines);
  };
  return (
    <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={rows.length === 0} data-testid={testId}>
      <Download className="mr-1 h-4 w-4" aria-hidden="true" />{t("reportKit.csv")}
    </Button>
  );
}
