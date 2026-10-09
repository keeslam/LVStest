import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatDate } from "@/lib/format-utils";
import type { DeletedRecordKind } from "@shared/schema";

/**
 * Sub-project C, besluit B-36: one recycle bin per screen. This is the old
 * `DeletedVehiclesDialog` generalised: the same dialog, told which `kind` of
 * deleted record it shows (vehicle, customer, reservation, maintenance_block,
 * transport, fine) and so which title, description, empty text and row badge to
 * use. The list itself is filtered on the server (`GET /api/deleted-records?type=`),
 * so each kind has its own cap of 200 rows and a bin full of fines can never push
 * the one vehicle out of the Voertuigen list.
 *
 * Every opener is wrapped in `RequiresPermission anyOf={[MANAGE_RECYCLE_BIN]}`;
 * the routes behind it need the same right.
 */

export interface DeletedRecord {
  id: number;
  entityType: string;
  entityId: number;
  label: string;
  relatedCounts: Record<string, number> | null;
  deletedAt: string;
  deletedBy: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
}

export interface RecycleBinDialogProps {
  /** Which bin: decides the server filter and every text in the dialog. */
  kind: DeletedRecordKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a record has been put back (the screen refreshes its own list). */
  onRestored?: () => void;
}

/** `vehicle_usage_periods` / `damageChecks` -> "vehicle usage periods" / "damage checks". */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * "2 reserveringen, 5 documenten" instead of the raw `{reservations: 2, documents: 5}`.
 * A key the translations do not know prints as readable words, never as the raw
 * key. A `table.column` key is a link that was cleared on another record (the row
 * itself stayed), so those are folded into one "links cleared" part.
 */
export function describeCounts(counts: Record<string, number> | null | undefined, t: TFunction): string {
  const parts: string[] = [];
  let unlinked = 0;
  for (const [key, count] of Object.entries(counts ?? {})) {
    if (typeof count !== "number" || count <= 0) continue;
    if (key.includes(".")) {
      unlinked += count;
      continue;
    }
    parts.push(t(`counts.${key}`, { count, defaultValue: `{{count}} ${humanizeKey(key)}` }));
  }
  if (unlinked > 0) parts.push(t("counts.unlinked", { count: unlinked }));
  return parts.length > 0 ? parts.join(", ") : t("noLinkedRecords");
}

/** Restore refusals the server answers with a stable `code` (UPPER_SNAKE of the reason). */
const RESTORE_ERROR_CODES = new Set([
  "NOT_FOUND",
  "ALREADY_RESTORED",
  "UNSUPPORTED_TYPE",
  "EMPTY_SNAPSHOT",
  "ID_TAKEN",
  "LICENSE_PLATE_TAKEN",
  "BARCODE_TAKEN",
  "RESERVATION_CONFLICT",
  "DEBTOR_NUMBER_TAKEN",
]);

export function RecycleBinDialog({ kind, open, onOpenChange, onRestored }: RecycleBinDialogProps) {
  const { t } = useTranslation("recycleBin");
  const { toast } = useToast();
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data: allRecords, isLoading, isError } = useQuery<DeletedRecord[]>({
    queryKey: ["/api/deleted-records", { type: kind }],
    enabled: open,
  });
  const q = search.trim().toLowerCase();
  const records = allRecords
    // The server already filters; this keeps a cached mixed list from showing
    // another screen's rows.
    ?.filter((r) => r.entityType === kind)
    .filter((r) => !q || r.label.toLowerCase().includes(q) || (r.deletedBy ?? "").toLowerCase().includes(q) || (r.restoredBy ?? "").toLowerCase().includes(q));

  const restoreMutation = useMutation({
    mutationFn: async (record: DeletedRecord) => {
      const response = await apiRequest("POST", `/api/deleted-records/${record.id}/restore`);
      await response.json().catch(() => null);
      return record;
    },
    onSuccess: async (record) => {
      toast({
        title: t("toasts.restoredTitle"),
        description: t("toasts.restoredDescription", { label: record.label }),
      });
      await invalidateByPrefix("/api/vehicles");
      await invalidateByPrefix("/api/reservations");
      await invalidateByPrefix("/api/fines");
      // besluiten B-15 — a restored transport has to reappear on the transports
      // page too, not only in the bin.
      await invalidateByPrefix("/api/transports");
      await invalidateByPrefix("/api/customers");
      await invalidateByPrefix("/api/deleted-records");
      onRestored?.();
    },
    onError: (error: Error & { code?: string }) => {
      // The client branches on the stable `code`, never on the English message.
      const code = typeof error.code === "string" ? error.code : "";
      toast({
        title: t("toasts.restoreFailedTitle"),
        description: RESTORE_ERROR_CODES.has(code) ? t(`restoreErrors.${code}`) : t("toasts.restoreFailedDescription"),
        variant: "destructive",
      });
    },
    onSettled: () => setRestoringId(null),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-recycle-bin" data-kind={kind}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {t(`kinds.${kind}.title`)}
          </DialogTitle>
          <DialogDescription>{t(`kinds.${kind}.description`)}</DialogDescription>
        </DialogHeader>

        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} data-testid="input-deleted-search" />

        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t("loading")}</span>
          </div>
        ) : isError ? (
          <div className="py-10 text-center text-muted-foreground" data-testid="text-recycle-bin-error">
            {t("loadFailed")}
          </div>
        ) : !records || records.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground" data-testid="text-recycle-bin-empty">
            {q ? t("noMatches") : t(`kinds.${kind}.empty`)}
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <div
                key={record.id}
                className="flex items-start justify-between gap-4 rounded-md border p-3"
                data-testid={`deleted-record-${record.id}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" data-testid={`deleted-record-type-${record.id}`}>
                      {t(`kinds.${record.entityType}.badge`, { defaultValue: record.entityType })}
                    </Badge>
                    <span className="font-medium">{record.label}</span>
                    {record.restoredAt && (
                      <Badge className="bg-green-100 text-green-800">{t("restoredBadge")}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("deletedByLabel", { date: formatDate(record.deletedAt), by: record.deletedBy || t("unknown") })}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("includedLabel", { summary: describeCounts(record.relatedCounts, t) })}
                  </div>
                  {record.restoredAt && (
                    <div className="text-sm text-muted-foreground">
                      {t("restoredByLabel", { date: formatDate(record.restoredAt), by: record.restoredBy || t("unknown") })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!record.restoredAt || restoreMutation.isPending}
                    onClick={() => {
                      setRestoringId(record.id);
                      restoreMutation.mutate(record);
                    }}
                    data-testid={`button-restore-${record.id}`}
                  >
                    {restoringId === record.id && restoreMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t("restoreButton")}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
