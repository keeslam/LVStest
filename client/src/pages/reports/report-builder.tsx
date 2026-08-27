import { useState } from "react";
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
import { Plus, Play, Save, Trash2, X, Filter as FilterIcon, Download, Settings, BarChart3 } from "lucide-react";
import { apiRequest, queryClient, invalidateByPrefix } from "@/lib/queryClient";
import { 
  DATA_SOURCES, 
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

export default function ReportBuilder() {
  const { t } = useTranslation("reports");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'builder' | 'saved'>('builder');
  
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>(['vehicles']);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState<ReportGrouping[]>([]);
  const [reportResults, setReportResults] = useState<any[]>([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [loadingReport, setLoadingReport] = useState<number | null>(null);

  const { data: savedReports = [], isLoading: loadingSavedReports } = useQuery<SavedReport[]>({
    queryKey: ['/api/reports/saved'],
  });

  const addColumnMutation = useMutation({
    mutationFn: async (column: ReportColumn) => {
      setColumns(prev => [...prev, column]);
    },
  });

  const removeColumn = (index: number) => {
    setColumns(prev => prev.filter((_, i) => i !== index));
  };

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
    onSuccess: (data) => {
      setReportResults(data);
      setShowResultsDialog(true);
      toast({
        title: t('reportBuilderPage.toasts.reportExecutedTitle'),
        description: t('reportBuilderPage.toasts.reportExecutedDescription', { count: data.length }),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('reportBuilderPage.toasts.executeErrorTitle'),
        description: error.message || t('reportBuilderPage.toasts.executeErrorDescription'),
        variant: "destructive",
      });
    },
  });

  const saveReportMutation = useMutation({
    mutationFn: async (config: ReportConfiguration) => {
      return await apiRequest('POST', '/api/reports/saved', config);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/reports/saved');
      setShowSaveDialog(false);
      setReportName('');
      setReportDescription('');
      toast({
        title: t('reportBuilderPage.toasts.reportSavedTitle'),
        description: t('reportBuilderPage.toasts.reportSavedDescription'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('reportBuilderPage.toasts.saveErrorTitle'),
        description: error.message || t('reportBuilderPage.toasts.saveErrorDescription'),
        variant: "destructive",
      });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/reports/saved/${id}`);
    },
    onSuccess: () => {
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
    setFilters(report.configuration.filters);
    setGroupBy(report.configuration.groupBy);
    setActiveTab('builder');
    setTimeout(() => setLoadingReport(null), 500);
  };

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

  const handleSaveReport = () => {
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
    };

    saveReportMutation.mutate(config);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('reportBuilderPage.pageTitle')}</h1>
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
                {DATA_SOURCES.map(source => (
                  <div key={source.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedDataSources.includes(source.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDataSources(prev => [...prev, source.id]);
                          } else {
                            setSelectedDataSources(prev => prev.filter(id => id !== source.id));
                          }
                        }}
                        className="h-4 w-4"
                        data-testid={`checkbox-datasource-${source.id}`}
                      />
                      <span className="font-medium">{source.name}</span>
                    </div>
                    {selectedDataSources.includes(source.id) && (
                      <div className="ml-6 space-y-1">
                        {source.fields.slice(0, 5).map(field => (
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
                            + {field.label}
                          </button>
                        ))}
                        {source.fields.length > 5 && (
                          <span className="text-xs text-muted-foreground">
                            {t('reportBuilderPage.moreFieldsCount', { count: source.fields.length - 5 })}
                          </span>
                        )}
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
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveDialog(true)}
                      disabled={columns.length === 0}
                      data-testid="button-save-report"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {t('reportBuilderPage.saveButton')}
                    </Button>
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
                            {col.label} {col.aggregation && `(${col.aggregation})`}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeColumn(idx)}
                            data-testid={`button-remove-column-${idx}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} data-testid="button-cancel-save">
              {t('reportBuilderPage.cancelButton')}
            </Button>
            <Button onClick={handleSaveReport} disabled={!reportName || saveReportMutation.isPending} data-testid="button-confirm-save">
              {saveReportMutation.isPending ? t('reportBuilderPage.savingButton') : t('reportBuilderPage.saveReportButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportResultsDialog
        open={showResultsDialog}
        onOpenChange={setShowResultsDialog}
        results={reportResults}
        columns={columns}
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
                      {field.label}
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
                      {op.replace(/_/g, ' ')}
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
                {getField(filter.table, filter.field)?.label} {filter.operator.replace(/_/g, ' ')} {filter.value}
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
  onRunReport, 
  onDeleteReport 
}: { 
  reports: SavedReport[]; 
  loading: boolean;
  loadingReport: number | null;
  onLoadReport: (report: SavedReport) => void;
  onRunReport: (report: SavedReport) => void;
  onDeleteReport: (id: number) => void;
}) {
  const { t } = useTranslation("reports");

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
                  <Badge variant="outline">{t('reportBuilderPage.filtersCount', { count: report.configuration.filters.length })}</Badge>
                  <Badge variant="outline">{report.configuration.dataSources.join(', ')}</Badge>
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
                  <Settings className="h-4 w-4 mr-1" />
                  {loadingReport === report.id ? t('reportBuilderPage.loadingButton') : t('reportBuilderPage.editButton')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => onRunReport(report)}
                  data-testid={`button-run-saved-${report.id}`}
                >
                  <Play className="h-4 w-4 mr-1" />
                  {t('reportBuilderPage.runButton')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDeleteReport(report.id)}
                  data-testid={`button-delete-report-${report.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
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
  columns 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  results: any[];
  columns: ReportColumn[];
}) {
  const { t } = useTranslation("reports");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-auto" data-testid="dialog-report-results">
        <DialogHeader>
          <DialogTitle>{t('reportBuilderPage.reportResultsTitle')}</DialogTitle>
          <DialogDescription>{t('reportBuilderPage.foundResultsCount', { count: results.length })}</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col, idx) => (
                  <TableHead key={idx}>{col.label}</TableHead>
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
                      <TableCell key={colIdx}>
                        {row[col.field] !== null && row[col.field] !== undefined 
                          ? String(row[col.field]) 
                          : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-results">
            {t('reportBuilderPage.closeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
