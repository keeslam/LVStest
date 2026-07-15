import { useState } from "react";
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
        title: "Report executed successfully",
        description: `Found ${data.length} results`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error executing report",
        description: error.message || "Failed to run report",
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
        title: "Report saved successfully",
        description: "Your report configuration has been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving report",
        description: error.message || "Failed to save report",
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
        title: "Report deleted",
        description: "Report has been removed",
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
        title: "No columns selected",
        description: "Please add at least one column to your report",
        variant: "destructive",
      });
      return;
    }

    const config: ReportConfiguration = {
      name: reportName || 'Untitled Report',
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
        title: "Report name required",
        description: "Please enter a name for your report",
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
          <h1 className="text-3xl font-bold">Custom Report Builder</h1>
          <p className="text-muted-foreground">Create custom reports from your data</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'builder' ? 'default' : 'outline'}
            onClick={() => setActiveTab('builder')}
            data-testid="button-builder-tab"
          >
            <Settings className="h-4 w-4 mr-2" />
            Builder
          </Button>
          <Button
            variant={activeTab === 'saved' ? 'default' : 'outline'}
            onClick={() => setActiveTab('saved')}
            data-testid="button-saved-tab"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Saved Reports
          </Button>
        </div>
      </div>

      {activeTab === 'builder' ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Data Sources</CardTitle>
                <CardDescription>Select tables to query</CardDescription>
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
                            +{source.fields.length - 5} more...
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
                    <CardTitle>Report Configuration</CardTitle>
                    <CardDescription>Build your custom report</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveDialog(true)}
                      disabled={columns.length === 0}
                      data-testid="button-save-report"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                    <Button
                      onClick={handleRunReport}
                      disabled={columns.length === 0 || runReportMutation.isPending}
                      data-testid="button-run-report"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {runReportMutation.isPending ? 'Running...' : 'Run Report'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Columns ({columns.length})</Label>
                  </div>
                  <div className="border rounded-lg p-4 space-y-2 min-h-[100px]">
                    {columns.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-4">
                        Click on fields from data sources to add columns
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
            <DialogTitle>Save Report</DialogTitle>
            <DialogDescription>Give your report a name and description</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="report-name">Report Name *</Label>
              <Input
                id="report-name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g., Monthly Revenue Report"
                data-testid="input-report-name"
              />
            </div>
            <div>
              <Label htmlFor="report-description">Description</Label>
              <Textarea
                id="report-description"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Describe what this report shows..."
                data-testid="textarea-report-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} data-testid="button-cancel-save">
              Cancel
            </Button>
            <Button onClick={handleSaveReport} disabled={!reportName || saveReportMutation.isPending} data-testid="button-confirm-save">
              {saveReportMutation.isPending ? 'Saving...' : 'Save Report'}
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
        <Label>Filters ({filters.length})</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddFilter(!showAddFilter)}
          data-testid="button-add-filter"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Filter
        </Button>
      </div>
      
      {showAddFilter && (
        <Card className="p-4 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Field</Label>
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
                  <SelectValue placeholder="Select field" />
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
              <Label>Operator</Label>
              <Select
                value={newFilter.operator}
                onValueChange={(value) => setNewFilter({ ...newFilter, operator: value as FilterOperator })}
                disabled={!selectedField}
              >
                <SelectTrigger data-testid="select-filter-operator">
                  <SelectValue placeholder="Select operator" />
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
              <Label>Value</Label>
              <Input
                value={newFilter.value?.toString() || ''}
                onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                placeholder="Enter value"
                data-testid="input-filter-value"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setShowAddFilter(false)} data-testid="button-cancel-filter">
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddFilter} data-testid="button-confirm-filter">
              Add Filter
            </Button>
          </div>
        </Card>
      )}

      <div className="border rounded-lg p-4 space-y-2 min-h-[80px]">
        {filters.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No filters applied
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
  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading saved reports...</div>;
  }

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No saved reports yet</p>
            <p className="text-sm">Create and save a report to see it here</p>
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
                  <Badge variant="outline">{report.configuration.columns.length} columns</Badge>
                  <Badge variant="outline">{report.configuration.filters.length} filters</Badge>
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
                  {loadingReport === report.id ? 'Loading...' : 'Edit'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => onRunReport(report)}
                  data-testid={`button-run-saved-${report.id}`}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Run
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-auto" data-testid="dialog-report-results">
        <DialogHeader>
          <DialogTitle>Report Results</DialogTitle>
          <DialogDescription>Found {results.length} results</DialogDescription>
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
                    No results found
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
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
