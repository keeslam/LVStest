/**
 * Rapporten herontwerp deel 2, Task 3: a saved builder report on its tab. It runs within the
 * period of the filter bar (on its period field) and the chosen vehicle (when the main source has
 * a vehicle column), and shows a table, a chart when grouped, CSV and the print. Bewerken opens
 * the report builder on it (Rapporten beheren and the right for every source).
 */
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { Download, Settings } from "lucide-react";
import {
  canUseReportSource, getDataSource, getField, getReportLink,
  type ReportColumn, type ReportConfiguration, type ReportScope,
} from "@shared/report-builder-config";
import { UserPermission } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ReportTable, type ReportTableColumn, type ReportTableView } from "@/components/reports/kit/report-table";
import { useReportPrint, type PrintSection } from "@/components/reports/kit/report-print";
import { EntityLink, type EntityKind } from "@/components/reports/entity-link";
import { useAuth } from "@/hooks/use-auth";
import { useHasPermission } from "@/hooks/use-has-permission";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { downloadCsv } from "@/lib/csv";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { ReportBuilderChart } from "./report-builder-chart";
import {
  aggregationLabel, calcErrorText, columnLabel, csvCell, csvHeader, displayCell, reportFileSubject, resultKey, withCalcInfo, type OutputColumn,
} from "./report-builder-output";
import { isAllDataRange, useReportFilters } from "./report-filters";
import { tablePrintSection } from "./legacy/table-print";

export interface SavedReport {
  id: number;
  name: string;
  description?: string | null;
  configuration: ReportConfiguration;
}

export const SAVED_REPORT_PREFIX = "saved-";

/** Opens the report builder dialog of the reports shell, on a saved report when an id is given. */
export const ReportBuilderOpenerContext = createContext<((editReportId?: number) => void) | null>(null);

type Row = Record<string, unknown> & { __row: number };

/** The record a column links to: the plate and vehicle id open the vehicle, the customer id the customer. */
function linkOf(column: ReportColumn, row: Row): { kind: EntityKind; id: number } | null {
  if (column.aggregation) return null;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  if (column.via) {
    // A field of the linked vehicle or customer links to it through the id the run also fetched (see withLinkIds).
    const kind = LINK_ID_FIELDS[column.via];
    if (!kind || !kind.fields.includes(column.field)) return null;
    const id = num(row[`${column.via}.id`]);
    return id == null ? null : { kind: kind.kind, id };
  }
  if (column.field === "customerId") {
    const id = num(row[column.field]);
    return id == null ? null : { kind: "customer", id };
  }
  if (column.field === "vehicleId") {
    const id = num(row[column.field]);
    return id == null ? null : { kind: "vehicle", id };
  }
  if (column.field === "licensePlate") {
    // The plate links when the row also carries the vehicle (its id, or the vehicles source's own id).
    const id = num(row.vehicleId) ?? (column.table === "vehicles" ? num(row.id) : null);
    return id == null ? null : { kind: "vehicle", id };
  }
  return null;
}

/** Linked columns that open the vehicle or customer, and so need its id in the result. */
const LINK_ID_FIELDS: Record<string, { kind: EntityKind; fields: string[] }> = {
  vehicle: { kind: "vehicle", fields: ["licensePlate", "id"] },
  customer: { kind: "customer", fields: ["name", "id"] },
};

/**
 * The configuration to run: a plain list (no grouping, no calculation) with a linked plate or customer name
 * also fetches the linked row's id, hidden, so the cell can link. A grouped report cannot take an extra column.
 */
function withLinkIds(config: ReportConfiguration): ReportConfiguration {
  if ((config.groupBy ?? []).length > 0 || config.columns.some((c) => c.aggregation)) return config;
  const extra: ReportColumn[] = [];
  for (const [via, kind] of Object.entries(LINK_ID_FIELDS)) {
    const needs = config.columns.some((c) => c.via === via && kind.fields.includes(c.field));
    const has = config.columns.some((c) => c.via === via && c.field === "id");
    const target = getReportLink(config.dataSources[0], via)?.target;
    const table = target ? getDataSource(target)?.table : undefined;
    if (needs && !has && table) extra.push({ table, field: "id", via, label: "ID" });
  }
  return extra.length > 0 ? { ...config, columns: [...config.columns, ...extra] } : config;
}

function numericSort(column: OutputColumn): boolean {
  if (column.calc) return !!column.aggregation || column.calcType !== "text";
  return !!column.aggregation || getField(column.table, column.field)?.type === "number";
}

export function SavedReportView({ report }: { report: SavedReport }) {
  const { t } = useTranslation("reports");
  const tt = t as unknown as TFunction;
  const { from, to, vehicleId, compare } = useReportFilters();
  const { user } = useAuth();
  const openBuilder = useContext(ReportBuilderOpenerContext);
  const canManage = useHasPermission(UserPermission.MANAGE_REPORTS);
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ReportTableView<Row> | null>(null);

  const config = report.configuration;
  const mainSource = getDataSource(config.dataSources[0] ?? "");
  const hasPeriod = !!config.periodField;
  const hasVehicle = !!mainSource?.vehicleField;
  // The period only goes along when the report has a period field and the range is not "Alle gegevens":
  // otherwise rows with an empty date field would be dropped for nothing.
  const usePeriod = hasPeriod && !isAllDataRange(from, to);
  const scope = useMemo<ReportScope>(() => ({
    ...(usePeriod ? { from, to } : {}),
    ...(hasVehicle && vehicleId !== "all" && /^\d+$/.test(vehicleId) ? { vehicleId: Number(vehicleId) } : {}),
  }), [from, to, vehicleId, hasVehicle, usePeriod]);

  const canEdit = canManage && config.dataSources.every((id) => {
    const source = getDataSource(id);
    return !!source && canUseReportSource(user, source);
  });

  // Keyed on the configuration and the scope: a change in the filter bar or an edit runs it again.
  const runConfig = useMemo(() => withLinkIds(config), [config]);
  const { data, isLoading, error } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/reports/execute", runConfig, scope],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/reports/execute", { ...runConfig, scope });
      return await res.json();
    },
  });

  const rows = useMemo<Row[]>(() => (Array.isArray(data) ? data : []).map((r, i) => ({ ...r, __row: i })), [data]);
  // Calculated columns carry their field's name and kind (money, percent, number, text).
  const columns = useMemo(() => withCalcInfo(config.columns, config.calculatedFields), [config]);
  const groupBy = config.groupBy ?? [];

  const tableColumns = useMemo<ReportTableColumn<Row>[]>(() => columns.map((col, i) => {
    const key = resultKey(col);
    const text = (r: Row) => displayCell(tt, col, r[key]);
    return {
      id: `${i}-${col.calc ? `calc.${col.calc}` : `${col.via ? `${col.via}:` : ""}${col.table}.${col.field}`}${col.aggregation ? `.${col.aggregation}` : ""}`,
      label: columnLabel(tt, col) + (col.aggregation ? ` (${aggregationLabel(tt, col.aggregation)})` : ""),
      cell: (r: Row) => {
        const link = linkOf(col, r);
        return link ? <EntityLink kind={link.kind} id={link.id} label={text(r)} /> : text(r);
      },
      text,
      sortValue: (r: Row) => {
        const v = r[key];
        if (v === null || v === undefined || v === "") return null;
        if (numericSort(col)) {
          const n = Number(v);
          return Number.isFinite(n) ? n : String(v);
        }
        return String(v);
      },
      align: numericSort(col) ? "right" as const : undefined,
    };
  }), [columns, tt]);

  const exportCsv = () => {
    const shown = view?.all ?? rows;
    downloadCsv(reportFileSubject(report.name), csvHeader(tt, columns, tableColumns.map((c) => c.label)), shown.map((r) => columns.map((col) => csvCell(tt, col, r[resultKey(col)]))));
  };

  const notes: string[] = [];
  if (!hasPeriod) notes.push(t("reportsPage.shell.notes.periodNotForReport"));
  if (!hasVehicle) notes.push(t("reportsPage.shell.notes.vehicleNotForReport"));
  if (compare !== "none") notes.push(t("reportsPage.shell.notes.compareNotForReport"));

  const sections: PrintSection[] = [
    ...notes.map((text): PrintSection => ({ kind: "note", text })),
    ...(groupBy.length > 0 ? [{ kind: "chart" as const, getSvg: () => chartSvgFromRef(chartRef) }] : []),
    tablePrintSection({ id: `saved-report-${report.id}`, columns: tableColumns, rows, view }),
  ];
  useReportPrint(data ? sections : null);

  return (
    <div className="space-y-4" data-testid={`saved-report-${report.id}`}>
      {(report.description || config.description) && (
        <p className="text-sm text-muted-foreground">{report.description || config.description}</p>
      )}
      {!hasPeriod && (
        <p className="text-sm text-muted-foreground" data-testid="saved-report-period-note">{t("reportsPage.shell.notes.periodNotForReport")}</p>
      )}
      {!hasVehicle && (
        <p className="text-sm text-muted-foreground" data-testid="saved-report-vehicle-note">{t("reportsPage.shell.notes.vehicleNotForReport")}</p>
      )}
      {compare !== "none" && (
        <p className="text-sm text-muted-foreground" data-testid="saved-report-compare-note">{t("reportsPage.shell.notes.compareNotForReport")}</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {canEdit && openBuilder && (
          <Button variant="outline" size="sm" onClick={() => openBuilder(report.id)} data-testid="button-edit-saved-report">
            <Settings className="mr-1 h-4 w-4" />
            {t("reportBuilderPage.editButton")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0} data-testid="button-saved-report-csv">
          <Download className="mr-1 h-4 w-4" />
          {t("reportKit.csv")}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground" data-testid="saved-report-loading">{t("reportKit.loading")}</p>
      ) : error ? (
        <p className="text-sm text-destructive" data-testid="saved-report-error">
          {calcErrorText(tt, error, config.calculatedFields)
            ?? describeApiError(error, undefined, t("reportBuilderPage.toasts.executeErrorDescription"))}
        </p>
      ) : (
        <>
          {groupBy.length > 0 && (
            <div ref={chartRef}>
              <ReportBuilderChart rows={rows} columns={columns} groupBy={groupBy} />
            </div>
          )}
          <ReportTable
            rows={rows}
            columns={tableColumns}
            rowKey={(r) => r.__row}
            testId="saved-report-table"
            resetKey={`${usePeriod ? `${from}|${to}` : ""}|${vehicleId}`}
            onView={setView}
          />
        </>
      )}
    </div>
  );
}
