import { describeApiError } from "@/lib/api-error";
import { HtmlPreviewDialog } from "@/components/documents/html-preview-dialog";
import { useEffect, useState } from "react";
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
import { Plus, Play, Save, Trash2, X, Filter as FilterIcon, Download, Printer, Settings, BarChart3 } from "lucide-react";
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
  sourceLabel, fieldLabel, operatorLabel, aggregationLabel, outputHeader, csvCell, displayCell, buildReportTableHtml, reportFileSubject,
} from "@/pages/reports/report-builder-output";
import {
  DATA_SOURCES,
  canUseReportSource,
  getDataSource,
  SAVED_REPORT_TABS,
  type SavedReportTab,
  type ReportConfiguration, 
  type ReportColumn, 
  type ReportFilter, 
  type ReportGrouping,
  type AggregationFunction,
  type FilterOperator,
  getField
} from "@shared/report-builder-config";

interface SavedReport {
  id: number;
  name: string;
  description?: string;
  configuration: ReportConfiguration;
  createdBy: string;
  createdAt: string;
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
  const [reportResults, setReportResults] = useState<any[]>([]);
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
      setColumns(prev => prev.some(c => !c.aggregation && c.table === column.table && c.field === column.field) ? prev : [...prev, column]);
    },
  });

  // Removing the last plain column of the grouped field also clears that group.
  const removeColumn = (index: number) => {
    const removed = columns[index];
    const rest = columns.filter((_, i) => i !== index);
    setColumns(rest);
    if (removed && !removed.aggregation && !rest.some(c => !c.aggregation && c.table === removed.table && c.field === removed.field)) {
      setGroupBy(prev => prev.filter(g => !(g.table === removed.table && g.field === removed.field)));
    }
  };

  // Unticking a source takes its columns and its group along.
  const untickSource = (id: string) => {
    const table = DATA_SOURCES.find(ds => ds.id === id)?.table;
    setSelectedDataSources(prev => prev.filter(x => x !== id));
    if (!table) return;
    setColumns(prev => prev.filter(c => c.table !== table));
    setGroupBy(prev => prev.filter(g => g.table !== table));
  };

  const setColumnAggregation = (index: number, aggregation: AggregationFunction | undefined) => {
    setColumns(prev => prev.map((col, i) => {
      if (i !== index) return col;
      const { aggregation: _old, ...rest } = col;
      return aggregation ? { ...rest, aggregation } : rest;
    }));
  };

  const groupFields = offeredSources
    .filter(ds => selectedDataSources.includes(ds.id))
    .flatMap(ds => ds.fields);

  // One group field. Picking it adds its column when missing and drops a calculation on it.
  const changeGroup = (value: string) => {
    if (value === GROUP_NONE) {
      setGroupBy([]);
      return;
    }
    const dot = value.indexOf('.');
    const table = value.slice(0, dot);
    const name = value.slice(dot + 1);
    const field = groupFields.find(f => f.table === table && f.name === name);
    if (!field) return;
    setGroupBy([{ table, field: name }]);
    setColumns(prev => {
      const at = prev.findIndex(c => c.table === table && c.field === name);
      if (at === -1) return [...prev, { field: name, table, label: field.label }];
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
    !col.aggregation && groupBy.some(g => g.table === col.table && g.field === col.field);

  const addFilterMutation = useMutation({
    mutationFn: async (filter: ReportFilter) => {
      setFilters(prev => [...prev, filter]);
    },
  });

  const removeFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const runReportMutation = useMutation({
    mutationFn: async (config: ReportConfiguration) => {
      const res = await apiRequest('POST', '/api/reports/execute', config);
      return await res.json();
    },
    onSuccess: (data, config) => {
      setReportResults(data);
      setResultColumns(config.columns);
      setResultName(config.name);
      setResultGroupBy(config.groupBy ?? []);
      setShowResultsDialog(true);
      toast({
        title: t('reportBuilderPage.toasts.reportExecutedTitle'),
        description: t('reportBuilderPage.toasts.reportExecutedDescription', { count: data.length }),
      });
    },
    onError: (error: any) => {
      // The server names the column that is missing from the grouping ("fines.status").
      const dot = error?.code === 'REPORT_COLUMN_NOT_GROUPED' && typeof error.field === 'string' ? error.field.indexOf('.') : -1;
      const description = dot > 0
        ? t('reportBuilderPage.toasts.columnNotGrouped', {
            column: fieldLabel(t, error.field.slice(0, dot), error.field.slice(dot + 1), getField(error.field.slice(0, dot), error.field.slice(dot + 1))?.label),
          })
        : describeApiError(error, undefined, t('reportBuilderPage.toasts.executeErrorDescription'));
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
    onError: (error: any) => {
      toast({
        title: t('reportBuilderPage.toasts.saveErrorTitle'),
        description: describeApiError(error, undefined, t('reportBuilderPage.toasts.saveErrorDescription')),
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
  const periodFieldOptions = (getDataSource(selectedDataSources[0] ?? '')?.fields ?? []).filter((f) => f.type === 'date');
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

    const config: ReportConfiguration = {
      name: reportName || t('reportBuilderPage.untitledReport'),
      description: reportDescription,
      dataSources: selectedDataSources,
      columns,
      filters,
      groupBy,
    };

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

    const config: ReportConfiguration = {
      name: reportName,
      description: reportDescription,
      dataSources: selectedDataSources,
      columns,
      filters,
      groupBy,
      ...(saveTab !== NO_TAB ? { tab: saveTab as SavedReportTab } : {}),
      ...(savedPeriodField !== NO_PERIOD_FIELD ? { periodField: savedPeriodField } : {}),
    };

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
                        {source.fields.map(field => (
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
                      columns.map((col, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-secondary rounded">
                          <span className="text-sm">
                            {fieldLabel(t, col.table, col.field, col.label)} {col.aggregation && `(${aggregationLabel(t, col.aggregation)})`}
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
                                {(['SUM', 'AVG', 'MIN', 'MAX'] as const)
                                  .filter(() => getField(col.table, col.field)?.aggregatable)
                                  .map(agg => (
                                    <SelectItem key={agg} value={agg}>{aggregationLabel(t, agg)}</SelectItem>
                                  ))}
                                <SelectItem value="COUNT">{aggregationLabel(t, 'COUNT')}</SelectItem>
                                <SelectItem value="COUNT_DISTINCT">{aggregationLabel(t, 'COUNT_DISTINCT')}</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
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
                      value={groupBy[0] ? `${groupBy[0].table}.${groupBy[0].field}` : GROUP_NONE}
                      onValueChange={changeGroup}
                    >
                      <SelectTrigger className="w-[260px]" data-testid="select-report-group-by">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GROUP_NONE}>{t('reportBuilderPage.groupBy.none')}</SelectItem>
                        {groupFields.map(field => (
                          <SelectItem key={`${field.table}.${field.name}`} value={`${field.table}.${field.name}`}>
                            {fieldLabel(t, field.table, field.name, field.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {groupBy[0] && getField(groupBy[0].table, groupBy[0].field)?.type === 'date' && (
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

      <ReportResultsDialog
        open={showResultsDialog}
        onOpenChange={setShowResultsDialog}
        results={reportResults}
        columns={resultColumns}
        reportName={resultName}
        groupBy={resultGroupBy}
      />
    </div>
  );
}

function FilterBuilder({ 
  filters, 
  dataSources, 
  onAddFilter, 
  onRemoveFilter 
}: { 
  filters: ReportFilter[]; 
  dataSources: string[];
  onAddFilter: (filter: ReportFilter) => void;
  onRemoveFilter: (index: number) => void;
}) {
  const { t } = useTranslation("reports");
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilter, setNewFilter] = useState<Partial<ReportFilter>>({});

  const availableFields = DATA_SOURCES
    .filter(ds => dataSources.includes(ds.id))
    .flatMap(ds => ds.fields);

  const selectedField = newFilter.field && newFilter.table 
    ? getField(newFilter.table, newFilter.field)
    : null;

  const handleAddFilter = () => {
    if (newFilter.field && newFilter.table && newFilter.operator) {
      onAddFilter(newFilter as ReportFilter);
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
                value={newFilter.field}
                onValueChange={(value) => {
                  const field = availableFields.find(f => f.name === value);
                  if (field) {
                    setNewFilter({ field: value, table: field.table });
                  }
                }}
              >
                <SelectTrigger data-testid="select-filter-field">
                  <SelectValue placeholder={t('reportBuilderPage.selectFieldPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map(field => (
                    <SelectItem key={`${field.table}-${field.name}`} value={field.name}>
                      {fieldLabel(t, field.table, field.name, field.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('reportBuilderPage.operatorLabel')}</Label>
              <Select
                value={newFilter.operator}
                onValueChange={(value) => setNewFilter({ ...newFilter, operator: value as FilterOperator })}
                disabled={!selectedField}
              >
                <SelectTrigger data-testid="select-filter-operator">
                  <SelectValue placeholder={t('reportBuilderPage.selectOperatorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {selectedField?.operators.map(op => (
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
                {fieldLabel(t, filter.table, filter.field, getField(filter.table, filter.field)?.label)} {operatorLabel(t, filter.operator)} {filter.value}
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

function ReportResultsDialog({
  open,
  onOpenChange,
  results,
  columns,
  reportName,
  groupBy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: any[];
  columns: ReportColumn[];
  reportName: string;
  groupBy: ReportGrouping[];
}) {
  const { t } = useTranslation("reports");
  const header = outputHeader(t, columns);
  const canOutput = results.length > 0 && columns.length > 0;
  // The print preview, same dialog as the overview reports and the PDFs.
  const [printPreview, setPrintPreview] = useState<{ title: string; html: string } | null>(null);

  // A-14-1: the same writer as every other CSV in the application (Dutch decimals and dates, dated file name, "file made" toast).
  const exportCsv = () => {
    downloadCsv(
      reportFileSubject(reportName || t('reportBuilderPage.untitledReport')),
      header,
      results.map((row) => columns.map((col) => csvCell(t, col, row[col.field]))),
    );
  };

  const printResults = () => {
    const title = reportName || t('reportBuilderPage.untitledReport');
    setPrintPreview({
      title,
      html: buildReportTableHtml({
        title,
        subtitle: t('reportBuilderPage.printSubtitle', { date: formatDateTime(Date.now()), count: results.length }),
        header,
        rows: results.map((row) => columns.map((col) => displayCell(t, col, row[col.field]))),
      }),
    });
  };

  return (
    <>
    <HtmlPreviewDialog
      open={printPreview !== null}
      onOpenChange={(isOpen) => { if (!isOpen) setPrintPreview(null); }}
      html={printPreview?.html ?? null}
      title={printPreview?.title ?? ''}
      reportName={printPreview?.title ?? ''}
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-auto" data-testid="dialog-report-results">
        <DialogHeader>
          <DialogTitle>{t('reportBuilderPage.reportResultsTitle')}</DialogTitle>
          <DialogDescription>{t('reportBuilderPage.foundResultsCount', { count: results.length })}</DialogDescription>
        </DialogHeader>
        <ReportBuilderChart rows={results} columns={columns} groupBy={groupBy} />
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
                      <TableCell key={colIdx}>{displayCell(t, col, row[col.field])}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={exportCsv} disabled={!canOutput} data-testid="button-export-report-csv">
            <Download className="h-4 w-4 mr-2" />
            {t('reportBuilderPage.exportCsvButton')}
          </Button>
          <Button variant="outline" onClick={printResults} disabled={!canOutput} data-testid="button-print-report">
            <Printer className="h-4 w-4 mr-2" />
            {t('reportBuilderPage.printButton')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-results">
            {t('reportBuilderPage.closeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
