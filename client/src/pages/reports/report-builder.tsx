import { describeApiError } from "@/lib/api-error";
import { PrintButtonInner, ReportPrintProvider, useReportPrint, type PrintSection } from "@/components/reports/kit/report-print";
import { chartSvgFromRef } from "@/lib/report-document-print";
import { ReportFiltersProvider, useOptionalReportFilters } from "@/pages/reports/report-filters";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Play, Save, Trash2, X, Pencil, Filter as FilterIcon, Download, Printer, Settings, BarChart3 } from "lucide-react";
import { apiRequest, queryClient, invalidateByPrefix } from "@/lib/queryClient";
import { UserPermission } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useHasPermission } from "@/hooks/use-has-permission";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { downloadCsv } from "@/lib/csv";
import { ReportBuilderChart } from "@/pages/reports/report-builder-chart";
import { formatDateTime } from "@/lib/format-utils";
import {
  sourceLabel, fieldLabel, linkedFieldLabel, resultKey, operatorLabel, aggregationLabel, outputHeader, headerLabel, unpackExecuteResult, csvCell, displayCell, reportFileSubject,
  withCalcInfo, columnLabel, calcErrorText, csvHeader, calcDisplayNumber, cleanTotals, totalChoicesFor, totalsRow, type TotalKind,
} from "@/pages/reports/report-builder-output";
import { CalculatedFieldDialog, calcRefsOf, isNumericCalc, numericUsersOf, parseDutchNumber, dutchNumberText } from "@/pages/reports/calculated-field-dialog";
import { MAX_CALCULATED_FIELDS, referencedFields, type CalculatedField } from "@shared/report-formula";
import {
  DATA_SOURCES,
  canUseReportSource,
  canUseReportField,
  getDataSource,
  getReportLink,
  type DataSourceField,
  type ReportSourceLink,
  type ReportSourceUser,
  SAVED_REPORT_TABS,
  type SavedReportTab,
  type ReportConfiguration, 
  type ReportColumn, 
  type ReportFilter, 
  type ReportGrouping,
  type AggregationFunction,
  type FilterOperator,
  getField,
  numberOperators,
  textOperators,
} from "@shared/report-builder-config";

interface SavedReport {
  id: number;
  name: string;
  description?: string;
  configuration: ReportConfiguration;
  createdBy: string;
  createdAt: string;
}

/** A field to pick: of a ticked source itself, or (via) of the row a link of the main source points at. */
interface PickableField {
  via?: string;
  field: DataSourceField;
}

const pickKey = (via: string | undefined, table: string, name: string) => (via ? `${via}:${table}.${name}` : `${table}.${name}`);

/** The links of the main source whose target the user may use, with the fields of the target they may use. */
function linkedGroupsOf(user: ReportSourceUser | null | undefined, mainId: string | undefined): Array<{ link: ReportSourceLink; fields: DataSourceField[] }> {
  const links = getDataSource(mainId ?? "")?.links ?? [];
  return links.flatMap((link) => {
    const target = getDataSource(link.target);
    if (!target || !canUseReportSource(user, target)) return [];
    const fields = target.fields.filter((f) => canUseReportField(user, target, f));
    return fields.length > 0 ? [{ link, fields }] : [];
  });
}

/** Every field a grouping or filter can use: the ticked sources' own, then the linked ones of the main source. */
function pickableFieldsOf(user: ReportSourceUser | null | undefined, selected: string[]): PickableField[] {
  const own = DATA_SOURCES
    .filter((ds) => selected.includes(ds.id) && canUseReportSource(user, ds))
    .flatMap((ds) => ds.fields.filter((f) => canUseReportField(user, ds, f)).map((field) => ({ field })));
  const linked = linkedGroupsOf(user, selected[0]).flatMap((g) => g.fields.map((field) => ({ via: g.link.name, field })));
  return [...own, ...linked];
}

/**
 * What a calculated field may use: the fields of the main source and of its links. A second ticked
 * source is not part of a row of the main source, so the server would refuse its fields.
 */
export function calcPickableFields(user: ReportSourceUser | null | undefined, selected: string[]): PickableField[] {
  return pickableFieldsOf(user, selected.slice(0, 1));
}

type Entry = { via?: string; table: string; field: string; calc?: string };
const sameField = (a: Entry, b: Entry) =>
  a.table === b.table && a.field === b.field && (a.via ?? "") === (b.via ?? "") && (a.calc ?? "") === (b.calc ?? "");

const CALC_PREFIX = "calc:";

/** The first free id "calc1", "calc2", ... */
function nextCalcId(calcs: CalculatedField[]): string {
  let n = 1;
  while (calcs.some((c) => c.id === `calc${n}`)) n++;
  return `calc${n}`;
}

/**
 * Calculations a column may get: a text calculated field can only be counted (Aantal), and a percent
 * has no Som (a ratio does not add up): Gemiddelde, Kleinste, Grootste and the counts.
 */
export function aggregationsFor(col: ReportColumn, calcs: CalculatedField[]): AggregationFunction[] {
  if (col.calc) {
    const calc = calcs.find((c) => c.id === col.calc);
    if (!isNumericCalc(calc)) return ['COUNT'];
    return calc?.type === 'percent'
      ? ['AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT']
      : ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT'];
  }
  return getField(col.table, col.field)?.aggregatable
    ? ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT']
    : ['COUNT', 'COUNT_DISTINCT'];
}

/** Filter operators of a calculated field: those of a number or of a text. */
const calcOperators = (calc: CalculatedField | undefined): FilterOperator[] => (isNumericCalc(calc) ? numberOperators : textOperators);

/** The value of a filter as typed: a percent filter holds the ratio, shown again as "25 %". */
function filterValueText(filter: ReportFilter, calcs: CalculatedField[]): string {
  const calc = filter.calc ? calcs.find(c => c.id === filter.calc) : undefined;
  if (calc?.type === 'percent' && typeof filter.value === 'number') {
    return `${dutchNumberText(Math.round(calcDisplayNumber('percent', filter.value) * 1e6) / 1e6)} %`;
  }
  return filter.value === null || filter.value === undefined ? '' : String(filter.value);
}

/**
 * Calculated fields that point at a field no longer offered (another main source, an unticked
 * source, a link that is gone), or at such a calculated field. They cannot run until changed.
 */
function brokenCalcIds(calcs: CalculatedField[], available: PickableField[]): Set<string> {
  const keys = new Set(available.map(p => pickKey(p.via, p.field.table, p.field.name)));
  const broken = new Set<string>();
  for (const calc of calcs) {
    if (referencedFields([calc]).some(r => !keys.has(pickKey(r.via, r.table, r.field)))) broken.add(calc.id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const calc of calcs) {
      if (!broken.has(calc.id) && calcRefsOf(calc).some(id => broken.has(id))) { broken.add(calc.id); grew = true; }
    }
  }
  return broken;
}

const GROUP_NONE = "__none";
const NO_TAB = "__no_tab";
const NO_PERIOD_FIELD = "__no_period_field";

/**
 * Task 3 opens the builder on a saved report with <ReportBuilder editReportId={id} />: the report is
 * loaded as soon as the saved list is there, and the builder is in edit mode.
 */
export default function ReportBuilder({ editReportId }: { editReportId?: number } = {}) {
  const { t } = useTranslation("reports");
  const { toast } = useToast();
  // Each source is only offered to someone who may use it (customers and drivers, fines, km history, ...); the server checks too.
  const { user } = useAuth();
  const offeredSources = DATA_SOURCES.filter((source) => canUseReportSource(user, source));
  const [activeTab, setActiveTab] = useState<'builder' | 'saved'>('builder');
  
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>(['vehicles']);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState<ReportGrouping[]>([]);
  const [calculatedFields, setCalculatedFields] = useState<CalculatedField[]>([]);
  // The calculated field dialog: open for a new field (no editing) or for one being changed.
  const [calcDialog, setCalcDialog] = useState<{ editing?: CalculatedField } | null>(null);
  // The calculated fields of the report that was last run, for its output.
  const [resultCalcs, setResultCalcs] = useState<CalculatedField[]>([]);
  // Totaalregel per column (by result key), and those of the report that was last run.
  const [totals, setTotals] = useState<Record<string, TotalKind>>({});
  const [resultTotals, setResultTotals] = useState<Record<string, TotalKind> | undefined>(undefined);
  const [reportResults, setReportResults] = useState<any[]>([]);
  // Whether the last run was cut at the row limit.
  const [resultTruncated, setResultTruncated] = useState(false);
  // The columns and name of the report that was last run. A saved report is run without opening
  // it in the builder, so the result must not borrow the builder's own (possibly empty) columns.
  const [resultColumns, setResultColumns] = useState<ReportColumn[]>([]);
  const [resultName, setResultName] = useState('');
  // The grouping of the report that was last run (not the editor's live state): decides if the result gets a chart.
  const [resultGroupBy, setResultGroupBy] = useState<ReportGrouping[]>([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [loadingReport, setLoadingReport] = useState<number | null>(null);
  // The tab and period field a report is saved with; editingReport is set while a saved report is being edited.
  const [saveTab, setSaveTab] = useState<string>(NO_TAB);
  const [savePeriodField, setSavePeriodField] = useState<string>(NO_PERIOD_FIELD);
  const [editingReport, setEditingReport] = useState<{ id: number; name: string } | null>(null);
  const canManageReports = useHasPermission(UserPermission.MANAGE_REPORTS);

  const { data: savedReports = [], isLoading: loadingSavedReports } = useQuery<SavedReport[]>({
    queryKey: ['/api/reports/saved'],
  });

  const addColumnMutation = useMutation({
    mutationFn: async (column: ReportColumn) => {
      // The same plain column twice cannot be grouped: a second click adds nothing.
      setColumns(prev => prev.some(c => !c.aggregation && sameField(c, column)) ? prev : [...prev, column]);
    },
  });

  // Removing the last plain column of the grouped field also clears that group.
  const removeColumn = (index: number) => {
    const removed = columns[index];
    const rest = columns.filter((_, i) => i !== index);
    setColumns(rest);
    if (removed && !removed.aggregation && !rest.some(c => !c.aggregation && sameField(c, removed))) {
      setGroupBy(prev => prev.filter(g => !sameField(g, removed)));
    }
  };

  // Unticking a source takes its columns and its group along.
  const untickSource = (id: string) => {
    const table = DATA_SOURCES.find(ds => ds.id === id)?.table;
    const next = selectedDataSources.filter(x => x !== id);
    setSelectedDataSources(next);
    if (!table) return;
    // Another main source has other links: what was picked through the old links goes too.
    const mainChanged = next[0] !== selectedDataSources[0];
    const gone = (e: { via?: string; table: string }) => (e.via ? mainChanged : e.table === table);
    setColumns(prev => prev.filter(c => !gone(c)));
    setGroupBy(prev => prev.filter(g => !gone(g)));
    if (mainChanged) setFilters(prev => prev.filter(f => !f.via));
  };

  const setColumnAggregation = (index: number, aggregation: AggregationFunction | undefined) => {
    // The result key ends in the aggregation: a chosen total moves along when it still fits the column.
    const old = withCalcInfo(columns, calculatedFields)[index];
    if (old) {
      const { aggregation: _a, ...plain } = old;
      const next = aggregation ? { ...plain, aggregation } : plain;
      const kind = totals[resultKey(old)];
      if (kind) {
        setTotals(prev => {
          const { [resultKey(old)]: _gone, ...rest } = prev;
          return totalChoicesFor(next).includes(kind) ? { ...rest, [resultKey(next)]: kind } : rest;
        });
      }
    }
    setColumns(prev => prev.map((col, i) => {
      if (i !== index) return col;
      const { aggregation: _old, ...rest } = col;
      return aggregation ? { ...rest, aggregation } : rest;
    }));
  };

  const groupFields = pickableFieldsOf(user, selectedDataSources);
  const linkedGroups = linkedGroupsOf(user, selectedDataSources[0]);
  // Calculated fields that point at a field no longer offered: flagged, and not offered until changed.
  const calcFields = calcPickableFields(user, selectedDataSources);
  const brokenCalcs = brokenCalcIds(calculatedFields, calcFields);
  const offeredCalcs = calculatedFields.filter(c => !brokenCalcs.has(c.id));
  const brokenCalcStop = (): boolean => {
    const first = calculatedFields.find(c => brokenCalcs.has(c.id));
    if (!first) return false;
    toast({
      title: t('reportBuilderPage.calc.brokenTitle'),
      description: t('reportBuilderPage.calc.errors.UNKNOWN_FIELD', { name: first.name }),
      variant: "destructive",
    });
    return true;
  };

  // One group field. Picking it adds its column when missing and drops a calculation on it.
  const changeGroup = (value: string) => {
    if (value === GROUP_NONE) {
      setGroupBy([]);
      return;
    }
    if (value.startsWith(CALC_PREFIX)) {
      const calc = calculatedFields.find(c => c.id === value.slice(CALC_PREFIX.length));
      if (!calc) return;
      const target = { table: '', field: '', calc: calc.id };
      setGroupBy([target]);
      setColumns(prev => {
        const at = prev.findIndex(c => sameField(c, target));
        if (at === -1) return [...prev, { ...target, label: calc.name }];
        return prev.map((c, i) => {
          if (i !== at) return c;
          const { aggregation: _old, ...rest } = c;
          return rest;
        });
      });
      return;
    }
    const picked = groupFields.find(f => pickKey(f.via, f.field.table, f.field.name) === value);
    if (!picked) return;
    const { via, field: def } = picked;
    const target = { table: def.table, field: def.name, ...(via ? { via } : {}) };
    setGroupBy([target]);
    setColumns(prev => {
      const at = prev.findIndex(c => sameField(c, target));
      if (at === -1) return [...prev, { ...target, label: def.label }];
      return prev.map((c, i) => {
        if (i !== at) return c;
        const { aggregation: _old, ...rest } = c;
        return rest;
      });
    });
  };

  const changeGroupMonth = (month: boolean) => {
    setGroupBy(prev => prev.map(g => {
      const { period: _old, ...rest } = g;
      return month ? { ...rest, period: 'month' as const } : rest;
    }));
  };

  const isGroupColumn = (col: ReportColumn) =>
    !col.aggregation && groupBy.some(g => sameField(g, col));

  const addFilterMutation = useMutation({
    mutationFn: async (filter: ReportFilter) => {
      setFilters(prev => [...prev, filter]);
    },
  });

  const removeFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const calcText = (key: string, options?: Record<string, unknown>) => String(t(`reportBuilderPage.calc.${key}`, options));

  const saveCalculatedField = (data: Omit<CalculatedField, 'id'>) => {
    const editing = calcDialog?.editing;
    if (editing) {
      const calc: CalculatedField = { ...data, id: editing.id };
      // A field others calculate with must stay a number: making it text would break them.
      const users = isNumericCalc(editing) && !isNumericCalc(calc) ? numericUsersOf(editing.id, calculatedFields) : [];
      if (users.length > 0) {
        toast({
          title: calcText('inUseChangeTitle'),
          description: calcText('inUse', { name: editing.name, others: users.map(u => u.name).join(', ') }),
          variant: "destructive",
        });
        return;
      }
      setCalculatedFields(prev => prev.map(c => (c.id === calc.id ? calc : c)));
      // A changed kind can make a calculation or filter on it unfit: those are dropped.
      const numeric = isNumericCalc(calc);
      setColumns(prev => prev.map(col => {
        if (col.calc !== calc.id || !col.aggregation) return col;
        if (numeric && !(calc.type === 'percent' && col.aggregation === 'SUM')) return col;
        if (!numeric && col.aggregation === 'COUNT') return col;
        const { aggregation: _old, ...rest } = col;
        return rest;
      }));
      setFilters(prev => prev.filter(f => f.calc !== calc.id || calcOperators(calc).includes(f.operator)));
    } else {
      if (calculatedFields.length >= MAX_CALCULATED_FIELDS) {
        toast({ title: calcText('maxReachedTitle'), description: calcText('maxReached', { max: MAX_CALCULATED_FIELDS }), variant: "destructive" });
        return;
      }
      setCalculatedFields(prev => [...prev, { ...data, id: nextCalcId(prev) }]);
    }
    setCalcDialog(null);
  };

  // A field another calculated field uses cannot go: that one would break.
  const deleteCalculatedField = (calc: CalculatedField) => {
    const users = calculatedFields.filter(c => c.id !== calc.id && calcRefsOf(c).includes(calc.id));
    if (users.length > 0) {
      toast({
        title: calcText('inUseTitle'),
        description: calcText('inUse', { name: calc.name, others: users.map(u => u.name).join(', ') }),
        variant: "destructive",
      });
      return;
    }
    setCalculatedFields(prev => prev.filter(c => c.id !== calc.id));
    setColumns(prev => prev.filter(c => c.calc !== calc.id));
    setFilters(prev => prev.filter(f => f.calc !== calc.id));
    setGroupBy(prev => prev.filter(g => g.calc !== calc.id));
  };

  /** Only calculated fields go along, and only when there are any: an old report stays as it was. */
  const withCalcs = (config: ReportConfiguration): ReportConfiguration => {
    const withFields = calculatedFields.length > 0 ? { ...config, calculatedFields } : config;
    // Totals only for columns that are still there and still allow the choice.
    const kept = cleanTotals(withCalcInfo(config.columns, calculatedFields), totals);
    return kept ? { ...withFields, totals: kept } : withFields;
  };

  const runReportMutation = useMutation({
    mutationFn: async (config: ReportConfiguration) => {
      const res = await apiRequest('POST', '/api/reports/execute', config);
      return unpackExecuteResult(await res.json());
    },
    onSuccess: (data, config) => {
      setReportResults(data.rows);
      setResultTruncated(data.truncated);
      setResultColumns(config.columns);
      setResultName(config.name);
      setResultGroupBy(config.groupBy ?? []);
      setResultCalcs(config.calculatedFields ?? []);
      setResultTotals(config.totals);
      setShowResultsDialog(true);
      toast({
        title: t('reportBuilderPage.toasts.reportExecutedTitle'),
        description: t('reportBuilderPage.toasts.reportExecutedDescription', { count: data.rows.length }),
      });
    },
    onError: (error: any, config: ReportConfiguration) => {
      // The server names the column that is missing from the grouping ("fines.status").
      // A linked column is named "<link>.<field>" ("vehicle.brand"), a plain one "<table>.<field>" ("fines.status").
      const named = error?.code === 'REPORT_COLUMN_NOT_GROUPED' && typeof error.field === 'string' ? error.field : "";
      const dot = named.indexOf('.');
      const prefix = dot > 0 ? named.slice(0, dot) : "";
      const rest = dot > 0 ? named.slice(dot + 1) : "";
      const link = prefix ? getReportLink(config.dataSources[0], prefix) : undefined;
      const table = link ? getDataSource(link.target)?.table ?? prefix : prefix;
      // A calculated column is named "calc.<id>": say its own name.
      const calcName = prefix === 'calc' ? config.calculatedFields?.find(c => c.id === rest)?.name ?? rest : null;
      const description = dot > 0
        ? t('reportBuilderPage.toasts.columnNotGrouped', {
            column: calcName ?? linkedFieldLabel(t, link ? prefix : undefined, table, rest, getField(table, rest)?.label),
          })
        : calcErrorText(t, error, config.calculatedFields)
          ?? describeApiError(error, undefined, t('reportBuilderPage.toasts.executeErrorDescription'));
      toast({
        title: t('reportBuilderPage.toasts.executeErrorTitle'),
        description,
        variant: "destructive",
      });
    },
  });

  const saveReportMutation = useMutation({
    mutationFn: async ({ config, updateId }: { config: ReportConfiguration; updateId?: number }) => {
      return updateId !== undefined
        ? await apiRequest('PUT', `/api/reports/saved/${updateId}`, config)
        : await apiRequest('POST', '/api/reports/saved', config);
    },
    onSuccess: (_data, variables) => {
      invalidateByPrefix('/api/reports/saved');
      setShowSaveDialog(false);
      if (variables.updateId === undefined) {
        // A new report: the builder is free again; an update keeps the report open for more changes.
        setReportName('');
        setReportDescription('');
        setEditingReport(null);
        setSaveTab(NO_TAB);
        setSavePeriodField(NO_PERIOD_FIELD);
      } else {
        setEditingReport({ id: variables.updateId, name: variables.config.name });
      }
      toast({
        title: t('reportBuilderPage.toasts.reportSavedTitle'),
        description: t('reportBuilderPage.toasts.reportSavedDescription'),
      });
    },
    onError: (error: any, variables) => {
      toast({
        title: t('reportBuilderPage.toasts.saveErrorTitle'),
        description: calcErrorText(t, error, variables.config.calculatedFields)
          ?? describeApiError(error, undefined, t('reportBuilderPage.toasts.saveErrorDescription')),
        variant: "destructive",
      });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/reports/saved/${id}`);
      return id;
    },
    onSuccess: (id) => {
      setEditingReport((current) => (current && current.id === id ? null : current));
      invalidateByPrefix('/api/reports/saved');
      toast({
        title: t('reportBuilderPage.toasts.reportDeletedTitle'),
        description: t('reportBuilderPage.toasts.reportDeletedDescription'),
      });
    },
  });

  const loadSavedReport = (report: SavedReport) => {
    setLoadingReport(report.id);
    setSelectedDataSources(report.configuration.dataSources);
    setColumns(report.configuration.columns);
    setFilters(report.configuration.filters ?? []);
    setGroupBy(report.configuration.groupBy ?? []);
    setCalculatedFields(report.configuration.calculatedFields ?? []);
    setTotals(report.configuration.totals ?? {});
    setReportName(report.name);
    setReportDescription(report.description ?? report.configuration.description ?? '');
    setSaveTab(report.configuration.tab ?? NO_TAB);
    setSavePeriodField(report.configuration.periodField || NO_PERIOD_FIELD);
    setEditingReport(null);
    setActiveTab('builder');
    setTimeout(() => setLoadingReport(null), 500);
  };

  const canEditReport = (report: SavedReport) => canManageReports && report.configuration.dataSources.every((id) => {
    const source = getDataSource(id);
    return !!source && canUseReportSource(user, source);
  });

  const editSavedReport = (report: SavedReport) => {
    loadSavedReport(report);
    setEditingReport({ id: report.id, name: report.name });
  };

  // Task 3 opens the builder on one report.
  const [openedEditId, setOpenedEditId] = useState<number | null>(null);
  useEffect(() => {
    if (editReportId === undefined || openedEditId === editReportId) return;
    const report = savedReports.find((r) => r.id === editReportId);
    if (!report) return;
    setOpenedEditId(editReportId);
    if (canEditReport(report)) editSavedReport(report);
    else loadSavedReport(report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editReportId, savedReports, openedEditId]);

  // The period field is a date field of the main (first ticked) source.
  const mainSource = getDataSource(selectedDataSources[0] ?? '');
  const periodFieldOptions = (mainSource?.fields ?? []).filter((f) => f.type === 'date' && canUseReportField(user, mainSource!, f));
  const savedPeriodField = periodFieldOptions.some((f) => f.name === savePeriodField) ? savePeriodField : NO_PERIOD_FIELD;

  const handleRunReport = () => {
    if (columns.length === 0) {
      toast({
        title: t('reportBuilderPage.toasts.noColumnsTitle'),
        description: t('reportBuilderPage.toasts.noColumnsDescription'),
        variant: "destructive",
      });
      return;
    }
    if (brokenCalcStop()) return;

    const config: ReportConfiguration = withCalcs({
      name: reportName || t('reportBuilderPage.untitledReport'),
      description: reportDescription,
      dataSources: selectedDataSources,
      columns,
      filters,
      groupBy,
    });

    runReportMutation.mutate(config);
  };

  const handleSaveReport = (asNew = false) => {
    if (!reportName) {
      toast({
        title: t('reportBuilderPage.toasts.reportNameRequiredTitle'),
        description: t('reportBuilderPage.toasts.reportNameRequiredDescription'),
        variant: "destructive",
      });
      return;
    }
    if (brokenCalcStop()) return;

    const config: ReportConfiguration = withCalcs({
      name: reportName,
      description: reportDescription,
      dataSources: selectedDataSources,
      columns,
      filters,
      groupBy,
      ...(saveTab !== NO_TAB ? { tab: saveTab as SavedReportTab } : {}),
      ...(savedPeriodField !== NO_PERIOD_FIELD ? { periodField: savedPeriodField } : {}),
    });

    saveReportMutation.mutate({ config, updateId: editingReport && !asNew ? editingReport.id : undefined });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">
            {editingReport ? t('reportBuilderPage.editingTitle', { name: editingReport.name }) : t('reportBuilderPage.pageTitle')}
          </h1>
          {editingReport && (
            <Button variant="link" className="h-auto p-0" onClick={() => setEditingReport(null)} data-testid="button-stop-editing">
              {t('reportBuilderPage.stopEditingButton')}
            </Button>
          )}
          <p className="text-muted-foreground">{t('reportBuilderPage.pageDescription')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'builder' ? 'default' : 'outline'}
            onClick={() => setActiveTab('builder')}
            data-testid="button-builder-tab"
          >
            <Settings className="h-4 w-4 mr-2" />
            {t('reportBuilderPage.builderTabButton')}
          </Button>
          <Button
            variant={activeTab === 'saved' ? 'default' : 'outline'}
            onClick={() => setActiveTab('saved')}
            data-testid="button-saved-tab"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('reportBuilderPage.savedReportsTabButton')}
          </Button>
        </div>
      </div>

      {activeTab === 'builder' ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>{t('reportBuilderPage.dataSourcesTitle')}</CardTitle>
                <CardDescription>{t('reportBuilderPage.dataSourcesDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {offeredSources.map(source => (
                  <div key={source.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedDataSources.includes(source.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDataSources(prev => [...prev, source.id]);
                          } else {
                            untickSource(source.id);
                          }
                        }}
                        className="h-4 w-4"
                        data-testid={`checkbox-datasource-${source.id}`}
                      />
                      <span className="font-medium">{sourceLabel(t, source.id, source.name)}</span>
                    </div>
                    {selectedDataSources.includes(source.id) && (
                      <div className="ml-6 space-y-1">
                        {source.fields.filter(field => canUseReportField(user, source, field)).map(field => (
                          <button
                            key={field.name}
                            onClick={() => addColumnMutation.mutate({
                              field: field.name,
                              table: field.table,
                              label: field.label,
                            })}
                            className="text-sm text-muted-foreground hover:text-foreground block w-full text-left py-1"
                            data-testid={`button-add-field-${field.name}`}
                          >
                            + {fieldLabel(t, field.table, field.name, field.label)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {linkedGroups.map(({ link, fields }) => (
                  <div key={link.name} className="space-y-2" data-testid={`linked-group-${link.name}`}>
                    <span className="font-medium">{t(`reportBuilderPage.linkedGroup.${link.name}`)}</span>
                    <div className="ml-6 space-y-1">
                      {fields.map(field => (
                        <button
                          key={field.name}
                          onClick={() => addColumnMutation.mutate({
                            field: field.name,
                            table: field.table,
                            via: link.name,
                            label: field.label,
                          })}
                          className="text-sm text-muted-foreground hover:text-foreground block w-full text-left py-1"
                          data-testid={`button-add-field-${link.name}.${field.name}`}
                        >
                          + {fieldLabel(t, field.table, field.name, field.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="space-y-2 border-t pt-4" data-testid="calculated-fields-section">
                  <span className="font-medium">{calcText('sectionTitle')}</span>
                  <div className="ml-6 space-y-1">
                    {calculatedFields.map(calc => (
                      <div key={calc.id} className="flex items-center gap-1">
                        <div className="flex-1">
                          <button
                            onClick={() => addColumnMutation.mutate({ table: '', field: '', calc: calc.id, label: calc.name })}
                            disabled={brokenCalcs.has(calc.id)}
                            className={brokenCalcs.has(calc.id)
                              ? "text-sm text-destructive block w-full text-left py-1 cursor-not-allowed"
                              : "text-sm text-muted-foreground hover:text-foreground block w-full text-left py-1"}
                            data-testid={`button-add-calc-${calc.id}`}
                          >
                            + {calc.name}
                          </button>
                          {brokenCalcs.has(calc.id) && (
                            <p className="text-xs text-destructive" data-testid={`calc-broken-${calc.id}`}>{calcText('brokenField')}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setCalcDialog({ editing: calc })}
                          aria-label={calcText('editAria', { name: calc.name })}
                          title={calcText('editAria', { name: calc.name })}
                          data-testid={`button-edit-calc-${calc.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => deleteCalculatedField(calc)}
                          aria-label={calcText('deleteAria', { name: calc.name })}
                          title={calcText('deleteAria', { name: calc.name })}
                          data-testid={`button-delete-calc-${calc.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setCalcDialog({})}
                    disabled={selectedDataSources.length === 0}
                    data-testid="button-add-calculated-field"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {calcText('addButton')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-9 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>{t('reportBuilderPage.reportConfigTitle')}</CardTitle>
                    <CardDescription>{t('reportBuilderPage.reportConfigDescription')}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <RequiresPermission anyOf={[UserPermission.MANAGE_REPORTS]}>
                      <Button
                        variant="outline"
                        onClick={() => setShowSaveDialog(true)}
                        disabled={columns.length === 0}
                        data-testid="button-save-report"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {t('reportBuilderPage.saveButton')}
                      </Button>
                    </RequiresPermission>
                    <Button
                      onClick={handleRunReport}
                      disabled={columns.length === 0 || runReportMutation.isPending}
                      data-testid="button-run-report"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {runReportMutation.isPending ? t('reportBuilderPage.runningButton') : t('reportBuilderPage.runReportButton')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>{t('reportBuilderPage.columnsLabelWithCount', { count: columns.length })}</Label>
                  </div>
                  <div className="border rounded-lg p-4 space-y-2 min-h-[100px]">
                    {columns.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-4">
                        {t('reportBuilderPage.clickFieldsHint')}
                      </p>
                    ) : (
                      withCalcInfo(columns, calculatedFields).map((col, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-secondary rounded">
                          <span className="text-sm">
                            {headerLabel(t, col)}
                          </span>
                          <div className="flex items-center gap-2">
                          {!isGroupColumn(col) && (
                            <Select
                              value={col.aggregation ?? 'none'}
                              onValueChange={(value) => setColumnAggregation(idx, value === 'none' ? undefined : value as AggregationFunction)}
                            >
                              <SelectTrigger className="h-8 w-[170px]" aria-label={t('reportBuilderPage.aggregation.label')} data-testid={`select-column-aggregation-${idx}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t('reportBuilderPage.aggregation.none')}</SelectItem>
                                {aggregationsFor(col, calculatedFields).map(agg => (
                                  <SelectItem key={agg} value={agg}>{aggregationLabel(t, agg)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Select
                            value={totals[resultKey(col)] && totalChoicesFor(col).includes(totals[resultKey(col)]) ? totals[resultKey(col)] : 'none'}
                            onValueChange={(value) => setTotals(prev => {
                              const { [resultKey(col)]: _old, ...rest } = prev;
                              return value === 'none' ? rest : { ...rest, [resultKey(col)]: value as TotalKind };
                            })}
                          >
                            <SelectTrigger className="h-8 w-[170px]" aria-label={t('reportBuilderPage.totals.label')} data-testid={`select-column-total-${idx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t('reportBuilderPage.totals.none')}</SelectItem>
                              {totalChoicesFor(col).map(kind => (
                                <SelectItem key={kind} value={kind}>{aggregationLabel(t, kind)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeColumn(idx)}
                            data-testid={`button-remove-column-${idx}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <Label>{t('reportBuilderPage.groupBy.label')}</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Select
                      value={groupBy[0] ? (groupBy[0].calc ? `${CALC_PREFIX}${groupBy[0].calc}` : pickKey(groupBy[0].via, groupBy[0].table, groupBy[0].field)) : GROUP_NONE}
                      onValueChange={changeGroup}
                    >
                      <SelectTrigger className="w-[260px]" data-testid="select-report-group-by">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GROUP_NONE}>{t('reportBuilderPage.groupBy.none')}</SelectItem>
                        {groupFields.map(({ via, field }) => (
                          <SelectItem key={pickKey(via, field.table, field.name)} value={pickKey(via, field.table, field.name)}>
                            {linkedFieldLabel(t, via, field.table, field.name, field.label)}
                          </SelectItem>
                        ))}
                        {offeredCalcs.map(calc => (
                          <SelectItem key={calc.id} value={`${CALC_PREFIX}${calc.id}`}>{calc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {groupBy[0] && !groupBy[0].calc && getField(groupBy[0].table, groupBy[0].field)?.type === 'date' && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={groupBy[0].period === 'month'}
                          onChange={(e) => changeGroupMonth(e.target.checked)}
                          className="h-4 w-4"
                          data-testid="checkbox-group-by-month"
                        />
                        {t('reportBuilderPage.groupBy.perMonth')}
                      </label>
                    )}
                  </div>
                </div>

                <FilterBuilder
                  filters={filters}
                  dataSources={selectedDataSources}
                  calcs={calculatedFields}
                  offeredCalcs={offeredCalcs}
                  onAddFilter={(filter) => addFilterMutation.mutate(filter)}
                  onRemoveFilter={removeFilter}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <SavedReportsTab
          reports={savedReports}
          loading={loadingSavedReports}
          loadingReport={loadingReport}
          onLoadReport={loadSavedReport}
          onEditReport={editSavedReport}
          canEdit={canEditReport}
          onRunReport={(report) => runReportMutation.mutate(report.configuration)}
          onDeleteReport={(id) => deleteReportMutation.mutate(id)}
        />
      )}

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-save-report">
          <DialogHeader>
            <DialogTitle>{t('reportBuilderPage.saveReportDialogTitle')}</DialogTitle>
            <DialogDescription>{t('reportBuilderPage.saveReportDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="report-name">{t('reportBuilderPage.reportNameLabel')}</Label>
              <Input
                id="report-name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder={t('reportBuilderPage.reportNamePlaceholder')}
                data-testid="input-report-name"
              />
            </div>
            <div>
              <Label htmlFor="report-description">{t('reportBuilderPage.descriptionLabel')}</Label>
              <Textarea
                id="report-description"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder={t('reportBuilderPage.describeReportPlaceholder')}
                data-testid="textarea-report-description"
              />
            </div>
            <div>
              <Label>{t('reportBuilderPage.tabLabel')}</Label>
              <Select value={saveTab} onValueChange={setSaveTab}>
                <SelectTrigger data-testid="select-saved-report-tab">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TAB}>{t('reportBuilderPage.noTab')}</SelectItem>
                  {SAVED_REPORT_TABS.map((id) => (
                    <SelectItem key={id} value={id}>{t(`reportsPage.tabs.${id}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('reportBuilderPage.periodFieldLabel')}</Label>
              <Select value={savedPeriodField} onValueChange={setSavePeriodField}>
                <SelectTrigger data-testid="select-saved-report-period-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PERIOD_FIELD}>{t('reportBuilderPage.noPeriodField')}</SelectItem>
                  {periodFieldOptions.map((f) => (
                    <SelectItem key={f.name} value={f.name}>{fieldLabel(t, f.table, f.name, f.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} data-testid="button-cancel-save">
              {t('reportBuilderPage.cancelButton')}
            </Button>
            <RequiresPermission anyOf={[UserPermission.MANAGE_REPORTS]}>
              <Button onClick={() => handleSaveReport()} disabled={!reportName || saveReportMutation.isPending} data-testid="button-confirm-save">
                {saveReportMutation.isPending
                  ? t('reportBuilderPage.savingButton')
                  : editingReport ? t('reportBuilderPage.saveButton') : t('reportBuilderPage.saveReportButton')}
              </Button>
            </RequiresPermission>
            {editingReport && (
              <RequiresPermission anyOf={[UserPermission.MANAGE_REPORTS]}>
                <Button variant="outline" onClick={() => handleSaveReport(true)} disabled={!reportName || saveReportMutation.isPending} data-testid="button-confirm-save-as-new">
                  {t('reportBuilderPage.saveAsNewButton')}
                </Button>
              </RequiresPermission>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {calcDialog && (
        <CalculatedFieldDialog
          initial={calcDialog.editing}
          fields={calcFields}
          earlier={calcDialog.editing
            ? calculatedFields.slice(0, Math.max(0, calculatedFields.findIndex(c => c.id === calcDialog.editing!.id)))
            : calculatedFields}
          sampleRow={reportResults[0] ?? null}
          onSave={saveCalculatedField}
          onClose={() => setCalcDialog(null)}
        />
      )}

      <ReportResultsDialog
        open={showResultsDialog}
        onOpenChange={setShowResultsDialog}
        results={reportResults}
        columns={withCalcInfo(resultColumns, resultCalcs)}
        reportName={resultName}
        groupBy={resultGroupBy}
        totals={resultTotals}
        truncated={resultTruncated}
      />
    </div>
  );
}

function FilterBuilder({
  filters,
  dataSources,
  calcs,
  offeredCalcs,
  onAddFilter,
  onRemoveFilter
}: {
  filters: ReportFilter[];
  dataSources: string[];
  calcs: CalculatedField[];
  /** The calculated fields that can be picked now (not those pointing at a field that is gone). */
  offeredCalcs: CalculatedField[];
  onAddFilter: (filter: ReportFilter) => void;
  onRemoveFilter: (index: number) => void;
}) {
  const { t } = useTranslation("reports");
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilter, setNewFilter] = useState<Partial<ReportFilter>>({});

  const { user } = useAuth();
  const availableFields = pickableFieldsOf(user, dataSources);

  const selectedCalc = newFilter.calc ? calcs.find(c => c.id === newFilter.calc) : undefined;
  const selectedField = newFilter.field && newFilter.table
    ? getField(newFilter.table, newFilter.field)
    : null;
  // A calculated field offers the operators of a number or of a text, as the server allows them.
  const operators = selectedCalc ? calcOperators(selectedCalc) : selectedField?.operators;

  const handleAddFilter = () => {
    if ((selectedCalc || (newFilter.field && newFilter.table)) && newFilter.operator) {
      // A percent is typed as a percentage (25) and goes to the server as the ratio (0.25).
      const percent = selectedCalc?.type === 'percent' ? parseDutchNumber(String(newFilter.value ?? '')) : null;
      onAddFilter((percent !== null ? { ...newFilter, value: percent / 100 } : newFilter) as ReportFilter);
      setNewFilter({});
      setShowAddFilter(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <Label>{t('reportBuilderPage.filtersLabelWithCount', { count: filters.length })}</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddFilter(!showAddFilter)}
          data-testid="button-add-filter"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('reportBuilderPage.addFilterButton')}
        </Button>
      </div>

      {showAddFilter && (
        <Card className="p-4 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>{t('reportBuilderPage.fieldLabel')}</Label>
              <Select
                value={newFilter.calc ? `${CALC_PREFIX}${newFilter.calc}` : newFilter.field ? pickKey(newFilter.via, newFilter.table!, newFilter.field) : undefined}
                onValueChange={(value) => {
                  if (value.startsWith(CALC_PREFIX)) {
                    setNewFilter({ field: '', table: '', calc: value.slice(CALC_PREFIX.length) });
                    return;
                  }
                  const picked = availableFields.find(f => pickKey(f.via, f.field.table, f.field.name) === value);
                  if (picked) {
                    setNewFilter({ field: picked.field.name, table: picked.field.table, ...(picked.via ? { via: picked.via } : {}) });
                  }
                }}
              >
                <SelectTrigger data-testid="select-filter-field">
                  <SelectValue placeholder={t('reportBuilderPage.selectFieldPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map(({ via, field }) => (
                    <SelectItem key={pickKey(via, field.table, field.name)} value={pickKey(via, field.table, field.name)}>
                      {linkedFieldLabel(t, via, field.table, field.name, field.label)}
                    </SelectItem>
                  ))}
                  {offeredCalcs.map(calc => (
                    <SelectItem key={calc.id} value={`${CALC_PREFIX}${calc.id}`}>{calc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('reportBuilderPage.operatorLabel')}</Label>
              <Select
                value={newFilter.operator}
                onValueChange={(value) => setNewFilter({ ...newFilter, operator: value as FilterOperator })}
                disabled={!operators}
              >
                <SelectTrigger data-testid="select-filter-operator">
                  <SelectValue placeholder={t('reportBuilderPage.selectOperatorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {operators?.map(op => (
                    <SelectItem key={op} value={op}>
                      {operatorLabel(t, op)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('reportBuilderPage.valueLabel')}</Label>
              <Input
                value={newFilter.value?.toString() || ''}
                onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                placeholder={t('reportBuilderPage.enterValuePlaceholder')}
                data-testid="input-filter-value"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setShowAddFilter(false)} data-testid="button-cancel-filter">
              {t('reportBuilderPage.cancelButton')}
            </Button>
            <Button size="sm" onClick={handleAddFilter} data-testid="button-confirm-filter">
              {t('reportBuilderPage.addFilterButton')}
            </Button>
          </div>
        </Card>
      )}

      <div className="border rounded-lg p-4 space-y-2 min-h-[80px]">
        {filters.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            {t('reportBuilderPage.noFiltersApplied')}
          </p>
        ) : (
          filters.map((filter, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-secondary rounded">
              <span className="text-sm">
                {filter.calc
                  ? calcs.find(c => c.id === filter.calc)?.name ?? filter.calc
                  : linkedFieldLabel(t, filter.via, filter.table, filter.field, getField(filter.table, filter.field)?.label)} {operatorLabel(t, filter.operator)} {filterValueText(filter, calcs)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveFilter(idx)}
                data-testid={`button-remove-filter-${idx}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SavedReportsTab({ 
  reports, 
  loading,
  loadingReport,
  onLoadReport,
  onEditReport,
  canEdit,
  onRunReport,
  onDeleteReport 
}: { 
  reports: SavedReport[]; 
  loading: boolean;
  loadingReport: number | null;
  onLoadReport: (report: SavedReport) => void;
  onEditReport: (report: SavedReport) => void;
  canEdit: (report: SavedReport) => boolean;
  onRunReport: (report: SavedReport) => void;
  onDeleteReport: (id: number) => void;
}) {
  const { t } = useTranslation("reports");
  // A-14-7: a saved report cannot be restored, so deleting it asks first, by name.
  const [reportToDelete, setReportToDelete] = useState<SavedReport | null>(null);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">{t('reportBuilderPage.loadingSavedReports')}</div>;
  }

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('reportBuilderPage.noSavedReportsTitle')}</p>
            <p className="text-sm">{t('reportBuilderPage.noSavedReportsDescription')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <ConfirmDialog
        open={reportToDelete !== null}
        onOpenChange={(open) => { if (!open) setReportToDelete(null); }}
        title={t('reportBuilderPage.deleteConfirmTitle')}
        description={t('reportBuilderPage.deleteConfirmDescription', { name: reportToDelete?.name ?? '' })}
        confirmLabel={t('reportBuilderPage.deleteConfirmButton')}
        confirmTestId="confirm-delete-saved-report"
        onConfirm={() => { if (reportToDelete) onDeleteReport(reportToDelete.id); }}
      />
      {reports.map(report => (
        <Card key={report.id}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>{report.name}</CardTitle>
                {report.description && (
                  <CardDescription>{report.description}</CardDescription>
                )}
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline">{t('reportBuilderPage.columnsCount', { count: report.configuration.columns.length })}</Badge>
                  <Badge variant="outline">{t('reportBuilderPage.filtersCount', { count: (report.configuration.filters ?? []).length })}</Badge>
                  <Badge variant="outline">{report.configuration.dataSources.map((id) => sourceLabel(t, id)).join(', ')}</Badge>
                  {report.configuration.tab && (
                    <Badge variant="secondary" data-testid={`badge-saved-tab-${report.id}`}>{t(`reportsPage.tabs.${report.configuration.tab}`)}</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onLoadReport(report)}
                  disabled={loadingReport === report.id}
                  data-testid={`button-load-report-${report.id}`}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('reportBuilderPage.useAsStartButton')}
                </Button>
                {canEdit(report) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditReport(report)}
                    disabled={loadingReport === report.id}
                    data-testid={`button-edit-saved-${report.id}`}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    {loadingReport === report.id ? t('reportBuilderPage.loadingButton') : t('reportBuilderPage.editButton')}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => onRunReport(report)}
                  data-testid={`button-run-saved-${report.id}`}
                >
                  <Play className="h-4 w-4 mr-1" />
                  {t('reportBuilderPage.runButton')}
                </Button>
                <RequiresPermission anyOf={[UserPermission.MANAGE_REPORTS]}>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setReportToDelete(report)}
                    aria-label={t('reportBuilderPage.deleteReportAria', { name: report.name })}
                    title={t('reportBuilderPage.deleteReportAria', { name: report.name })}
                    data-testid={`button-delete-report-${report.id}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </RequiresPermission>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

/** Tells the print dialog what the results hold. */
function PrintRegistrar({ sections }: { sections: PrintSection[] | null }) {
  useReportPrint(sections);
  return null;
}

function ReportResultsDialog({
  open,
  onOpenChange,
  results,
  columns,
  reportName,
  groupBy,
  totals,
  truncated = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: any[];
  columns: ReportColumn[];
  reportName: string;
  groupBy: ReportGrouping[];
  totals?: Record<string, TotalKind>;
  truncated?: boolean;
}) {
  const { t } = useTranslation("reports");
  // Over every result row; empty cells are skipped. A list cut at the row limit says so.
  const totalLabel = t(truncated ? 'reportBuilderPage.totals.totalTruncated' : 'reportBuilderPage.totals.total');
  const truncatedNote = truncated ? t('reportBuilderPage.totals.truncatedNote') : null;
  const totalCells = totalsRow(t, results, columns, totals, totalLabel);
  const header = outputHeader(t, columns);
  const canOutput = results.length > 0 && columns.length > 0;
  const chartRef = useRef<HTMLDivElement>(null);
  const hasFilters = useOptionalReportFilters() !== null;

  // A-14-1: the same writer as every other CSV in the application (Dutch decimals and dates, dated file name, "file made" toast).
  const exportCsv = () => {
    downloadCsv(
      reportFileSubject(reportName || t('reportBuilderPage.untitledReport')),
      csvHeader(t, columns, header),
      (() => {
        const body = results.map((row) => columns.map((col) => csvCell(t, col, row[resultKey(col)])));
        const last = totalsRow(t, results, columns, totals, totalLabel, true);
        const lines = last ? [...body, last] : body;
        return truncatedNote ? [...lines, [truncatedNote]] : lines;
      })(),
    );
  };

  // Afdrukken: the print dialog of the reports (no tiles; the chart when grouped; the table with its totals).
  const printTitle = reportName || t('reportBuilderPage.untitledReport');
  const printRows = results.map((row) => columns.map((col) => displayCell(t, col, row[resultKey(col)])));
  const printSections: PrintSection[] | null = canOutput ? [
    ...(truncatedNote ? [{ kind: 'note' as const, text: truncatedNote }] : []),
    ...(groupBy.length > 0 ? [{ kind: 'chart' as const, getSvg: () => chartSvgFromRef(chartRef) }] : []),
    {
      kind: 'table' as const, id: 'report-builder-results', header, columnIds: columns.map((col) => resultKey(col)),
      allRows: () => ({ rows: printRows, truncated: false }),
      pageRows: printRows,
      totals: totalCells ?? undefined,
      pageTotals: totalCells ?? undefined,
    },
  ] : null;
  const printButton = (
    <ReportPrintProvider ignored={{ period: true, vehicle: true }}>
      <PrintRegistrar sections={printSections} />
      <PrintButtonInner title={printTitle} />
    </ReportPrintProvider>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-auto" data-testid="dialog-report-results">
        <DialogHeader>
          <DialogTitle>{t('reportBuilderPage.reportResultsTitle')}</DialogTitle>
          <DialogDescription>{t('reportBuilderPage.foundResultsCount', { count: results.length })}</DialogDescription>
        </DialogHeader>
        {truncatedNote && (
          <p className="text-sm text-muted-foreground" data-testid="report-truncated-note">{truncatedNote}</p>
        )}
        <div ref={chartRef}>
          <ReportBuilderChart rows={results} columns={columns} groupBy={groupBy} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col, idx) => (
                  <TableHead key={idx}>{header[idx]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                    {t('reportBuilderPage.noResultsFound')}
                  </TableCell>
                </TableRow>
              ) : (
                results.map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {columns.map((col, colIdx) => (
                      <TableCell key={colIdx}>{displayCell(t, col, row[resultKey(col)])}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
              {totalCells && results.length > 0 && (
                <TableRow className="font-medium" data-testid="row-report-totals">
                  {totalCells.map((cell, colIdx) => <TableCell key={colIdx}>{cell}</TableCell>)}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={exportCsv} disabled={!canOutput} data-testid="button-export-report-csv">
            <Download className="h-4 w-4 mr-2" />
            {t('reportBuilderPage.exportCsvButton')}
          </Button>
          {hasFilters ? printButton : <ReportFiltersProvider>{printButton}</ReportFiltersProvider>}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-results">
            {t('reportBuilderPage.closeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
