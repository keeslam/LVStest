/**
 * OPT-022 — "Geschiedenis" per record.
 *
 * The audit log records every change with field-level `from`/`to` and the
 * employee's name — the workflow report calls it the strongest part of the
 * system. What it could not do was answer a question about one record:
 * `GET /api/audit-logs?resourceId=3563` came back with 906 rows because the
 * filter was never read, and `?search=3563` with none.
 *
 * The filter now works (`server/routes/users.ts`, `getAuditLogs`), and this is
 * the surface that uses it: the same list the activity log renders, scoped to
 * one reservation, vehicle or customer.
 *
 * Permission: the endpoint answers 403 unless the viewer holds the *manage*
 * permission for that record type. A 403 renders as a short explanation rather
 * than an error — a counter clerk opening a reservation should not be met with
 * a red box for a tab they were never meant to use.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeNl } from "@/lib/format-date-nl";

export type RecordHistoryResourceType = "reservation" | "vehicle" | "customer";

export interface RecordHistoryEntry {
  id: number;
  username: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: {
    label?: string;
    operation?: string;
    changes?: Array<{ field: string; from: unknown; to: unknown }>;
    [key: string]: unknown;
  } | null;
  status: string;
  createdAt: string;
}

interface RecordHistoryResponse {
  logs: RecordHistoryEntry[];
  total: number;
}

/** Same rendering rule as the activity log: never "[object Object]". */
export function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "ja" : "nee";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function recordHistoryUrl(resourceType: RecordHistoryResourceType, resourceId: number): string {
  return `/api/audit-logs/resource/${resourceType}/${resourceId}`;
}

interface RecordHistoryProps {
  resourceType: RecordHistoryResourceType;
  resourceId: number;
  /** Rendered above the list; omitted when the caller supplies its own heading. */
  showHeading?: boolean;
}

export function RecordHistory({ resourceType, resourceId, showHeading = true }: RecordHistoryProps) {
  const { t } = useTranslation("common");

  const { data, isLoading, error } = useQuery<RecordHistoryResponse>({
    queryKey: [recordHistoryUrl(resourceType, resourceId)],
    enabled: Number.isInteger(resourceId) && resourceId > 0,
    // The rows never change while a dialog is open unless this employee makes
    // them change, and the dialogs invalidate on save.
    staleTime: 30_000,
    retry: false,
  });

  const forbidden = (error as { httpStatus?: number } | null)?.httpStatus === 403;

  const entries = data?.logs ?? [];

  return (
    <div className="space-y-3" data-testid={`record-history-${resourceType}-${resourceId}`}>
      {showHeading && (
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t('recordHistory.title')}</h3>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('status.loading')}</p>
      ) : forbidden ? (
        <p className="text-sm text-muted-foreground" data-testid="record-history-forbidden">
          {t('recordHistory.notPermitted')}
        </p>
      ) : error ? (
        <p className="text-sm text-muted-foreground" data-testid="record-history-error">
          {t('recordHistory.loadFailed')}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="record-history-empty">
          {t('recordHistory.empty')}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="record-history-list">
          {entries.map((entry) => {
            const changes = entry.details?.changes ?? [];
            return (
              <li key={entry.id} className="border rounded-md p-3" data-testid={`record-history-entry-${entry.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={entry.status === 'failure' ? 'destructive' : 'secondary'}
                    className="text-xs font-mono"
                  >
                    {entry.action}
                  </Badge>
                  <span className="text-sm font-medium">
                    {entry.username || t('recordHistory.systemUser')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTimeNl(entry.createdAt)}
                  </span>
                </div>
                {changes.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {changes.map((change) => (
                      <li key={change.field}>
                        <span className="font-medium">{change.field}: </span>
                        <span className="line-through text-muted-foreground">{formatHistoryValue(change.from)}</span>
                        <span className="mx-1">›</span>
                        <span>{formatHistoryValue(change.to)}</span>
                      </li>
                    ))}
                  </ul>
                ) : entry.details?.operation ? (
                  <p className="mt-2 text-xs text-muted-foreground">{entry.details.operation}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
