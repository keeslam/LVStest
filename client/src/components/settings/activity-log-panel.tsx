import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { formatInOfficeZone } from "@/lib/office-timezone";
import { auditActionLabel } from "@/lib/audit-action-label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, RotateCcw } from "lucide-react";

interface AuditLogEntry {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: {
    label?: string;
    operation?: string;
    path?: string;
    name?: string;
    request?: Record<string, any>;
    changes?: Array<{ field: string; from: any; to: any }>;
    [key: string]: any;
  } | null;
  ipAddress: string | null;
  status: string;
  createdAt: string;
}

interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
}

interface FilterOptions {
  users: string[];
  actions: string[];
  resourceTypes: string[];
}

/** Which rows the log shows: changes (default), the screens and dialogs opened, or both. */
type Scope = "changes" | "ui" | "all";

const PAGE_SIZE = 50;
const ANY = "__all__";
/** Changes shown inline before the row folds the rest behind "+n". */
const CHANGES_INLINE = 3;

export function ActivityLogPanel() {
  const { t } = useTranslation(["settings", "common"]);
  const [search, setSearch] = useState("");
  const [username, setUsername] = useState(ANY);
  const [action, setAction] = useState(ANY);
  const [scope, setScope] = useState<Scope>("changes");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), scope });
  if (search) params.set("search", search);
  if (username !== ANY) params.set("username", username);
  if (action !== ANY) params.set("action", action);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading } = useQuery<AuditLogResponse>({
    queryKey: [`/api/audit-logs?${params.toString()}`],
  });

  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/audit-logs/filters"],
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  const resetFilters = () => {
    setSearch("");
    setUsername(ANY);
    setAction(ANY);
    setScope("changes");
    setFrom("");
    setTo("");
    setPage(0);
  };

  // Reset to the first page whenever a filter changes - staying on page 7 of a
  // result set that now has two pages shows an empty table.
  const withReset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === "") return t('settingsPage.activityLog.emptyValue');
    return String(value);
  };

  const toggleExpanded = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // The screens-and-dialogs actions are not in the action filter list: that
  // list is built from the changes, and two entries would cover the whole view.
  const actionOptions = (filterOptions?.actions ?? []).filter((value) => !value.startsWith("screen.") && !value.startsWith("dialog."));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          {t('settingsPage.activityLog.title')}
        </CardTitle>
        <CardDescription>{t('settingsPage.activityLog.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="activity-search" className="text-xs">{t('settingsPage.activityLog.searchLabel')}</Label>
            <Input
              id="activity-search"
              value={search}
              onChange={(e) => withReset(setSearch)(e.target.value)}
              placeholder={t('settingsPage.activityLog.searchPlaceholder')}
              className="h-9"
              data-testid="input-activity-search"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t('settingsPage.activityLog.scopeLabel')}</Label>
            <Select value={scope} onValueChange={withReset((value: string) => setScope(value as Scope))}>
              <SelectTrigger className="h-9" data-testid="select-activity-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="changes">{t('settingsPage.activityLog.scopes.changes')}</SelectItem>
                <SelectItem value="ui">{t('settingsPage.activityLog.scopes.ui')}</SelectItem>
                <SelectItem value="all">{t('settingsPage.activityLog.scopes.all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t('settingsPage.activityLog.userLabel')}</Label>
            <Select value={username} onValueChange={withReset(setUsername)}>
              <SelectTrigger className="h-9" data-testid="select-activity-user">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t('settingsPage.activityLog.allUsers')}</SelectItem>
                {(filterOptions?.users ?? []).map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t('settingsPage.activityLog.actionLabel')}</Label>
            <Select value={action} onValueChange={withReset(setAction)}>
              <SelectTrigger className="h-9" data-testid="select-activity-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value={ANY}>{t('settingsPage.activityLog.allActions')}</SelectItem>
                {actionOptions.map((value) => (
                  <SelectItem key={value} value={value}>{auditActionLabel(t, value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="activity-from" className="text-xs">{t('settingsPage.activityLog.fromLabel')}</Label>
              <Input
                id="activity-from"
                type="date"
                value={from}
                onChange={(e) => withReset(setFrom)(e.target.value)}
                className="h-9"
                data-testid="input-activity-from"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="activity-to" className="text-xs">{t('settingsPage.activityLog.toLabel')}</Label>
              <Input
                id="activity-to"
                type="date"
                value={to}
                onChange={(e) => withReset(setTo)(e.target.value)}
                className="h-9"
                data-testid="input-activity-to"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground" data-testid="text-activity-count">
            {t('settingsPage.activityLog.entryCount', { count: total })}
          </p>
          <Button variant="outline" size="sm" onClick={resetFilters} data-testid="button-activity-reset">
            <RotateCcw className="h-4 w-4 mr-1" />
            {t('settingsPage.activityLog.resetFilters')}
          </Button>
        </div>

        {/* Compact on purpose: one line per row, 50 rows a page, so a day of
            screens and dialogs fits on a screen and the changes read as a list. */}
        <div className="border rounded-md overflow-hidden">
          <div className="max-h-[560px] overflow-y-auto">
            <Table className="text-xs">
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-2 whitespace-nowrap">{t('settingsPage.activityLog.columns.when')}</TableHead>
                  <TableHead className="h-8 px-2 whitespace-nowrap">{t('settingsPage.activityLog.columns.who')}</TableHead>
                  <TableHead className="h-8 px-2 whitespace-nowrap">{t('settingsPage.activityLog.columns.action')}</TableHead>
                  <TableHead className="h-8 px-2 whitespace-nowrap">{t('settingsPage.activityLog.columns.subject')}</TableHead>
                  <TableHead className="h-8 px-2">{t('settingsPage.activityLog.columns.changes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('common:status.loading')}
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('settingsPage.activityLog.noEntries')}
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((entry) => {
                    const changes = entry.details?.changes ?? [];
                    const isUi = entry.resourceType === "ui";
                    const subject = isUi
                      ? (entry.details?.name || '-')
                      : (entry.details?.label || (entry.resourceId ? `#${entry.resourceId}` : '-'));
                    const isOpen = expanded.has(entry.id);
                    const shown = isOpen ? changes : changes.slice(0, CHANGES_INLINE);
                    const hidden = changes.length - shown.length;
                    // The resource in words ("Reservering"); an unknown type shows its code.
                    const resourceLabel = entry.resourceType && !isUi
                      ? t(`common:recordHistory.actions.resources.${entry.resourceType}`, { defaultValue: entry.resourceType })
                      : null;

                    return (
                      <TableRow key={entry.id} data-testid={`activity-row-${entry.id}`} className={isUi ? "text-muted-foreground" : undefined}>
                        <TableCell className="px-2 py-1 whitespace-nowrap text-muted-foreground align-top tabular-nums">
                          {formatInOfficeZone(entry.createdAt, 'dd-MM HH:mm')}
                        </TableCell>
                        <TableCell className="px-2 py-1 whitespace-nowrap font-medium align-top">
                          {entry.username || t('settingsPage.activityLog.systemUser')}
                        </TableCell>
                        <TableCell className="px-2 py-1 whitespace-nowrap align-top">
                          <Badge
                            variant={entry.status === 'failure' ? 'destructive' : isUi ? 'outline' : 'secondary'}
                            className="text-[11px] font-normal px-1.5 py-0"
                            // The code stays reachable for anyone who needs to quote it.
                            title={entry.action}
                          >
                            {auditActionLabel(t, entry.action)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-1 align-top max-w-[260px]">
                          <span className="block truncate" title={subject}>{subject}</span>
                          {resourceLabel && (
                            <span className="block truncate text-[11px] text-muted-foreground">{resourceLabel}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1 align-top">
                          {isUi ? (
                            <span className="text-muted-foreground font-mono">{entry.details?.path || '-'}</span>
                          ) : changes.length > 0 ? (
                            <span className="leading-5">
                              {shown.map((change, index) => (
                                <span key={change.field} className="inline-block mr-2">
                                  <span className="font-medium">{change.field}: </span>
                                  <span className="line-through text-muted-foreground">{formatValue(change.from)}</span>
                                  <span className="mx-0.5">›</span>
                                  <span>{formatValue(change.to)}</span>
                                  {index < shown.length - 1 || hidden > 0 ? <span className="text-muted-foreground"> ·</span> : null}
                                </span>
                              ))}
                              {(hidden > 0 || isOpen) && changes.length > CHANGES_INLINE && (
                                <button
                                  type="button"
                                  className="text-primary hover:underline"
                                  onClick={() => toggleExpanded(entry.id)}
                                  data-testid={`button-activity-more-${entry.id}`}
                                >
                                  {isOpen
                                    ? t('settingsPage.activityLog.fewer')
                                    : t('settingsPage.activityLog.more', { count: hidden })}
                                </button>
                              )}
                            </span>
                          ) : entry.details?.operation ? (
                            <span className="text-muted-foreground">{entry.details.operation}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('settingsPage.activityLog.pageOf', { page: page + 1, pages: lastPage + 1 })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              data-testid="button-activity-prev"
            >
              {t('settingsPage.activityLog.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((current) => Math.min(current + 1, lastPage))}
              data-testid="button-activity-next"
            >
              {t('settingsPage.activityLog.next')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
