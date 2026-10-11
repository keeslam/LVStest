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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
 *
 * Emptying the bin (besluit B-38): a checkbox per row, a "definitief verwijderen"
 * button per row and, in the toolbar, "selected" and "all" buttons. Nothing is deleted
 * before ONE confirmation (`dialog-confirm-purge`) that names the count and the kind
 * and says it cannot be undone. One row goes through `DELETE /api/deleted-records/:id`,
 * a selection through `POST /api/deleted-records/purge { ids }`, the whole bin through
 * `{ entityType: kind, all: true }`. What the server answers is shown by its stable
 * `code`, never by its English message.
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
  /**
   * Driver bin only (besluit B-41 D8): show the drivers of this one customer. "Prullenbak
   * leegmaken" then removes exactly the rows shown, never another customer's drivers.
   */
  customerId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a record has been put back (the screen refreshes its own list). */
  onRestored?: () => void;
  /** Called after records have been removed for good. */
  onPurged?: () => void;
}

/** What the purge routes answer: how many were removed, and what was not (or not entirely). */
interface PurgeAnswer {
  purged: number;
  failed: Array<{ id: number; code: string; message?: string }>;
}

/** What the confirmation dialog is asking about. */
type PurgeTarget =
  | { mode: "one"; record: DeletedRecord }
  | { mode: "selected"; ids: number[] }
  | { mode: "all" };

/** Codes the purge routes answer; anything else gets one generic sentence. */
const PURGE_ERROR_CODES = new Set(["NOT_FOUND", "PURGE_FAILED", "FILE_REMOVAL_FAILED", "FISCAL_DATA_PRESENT"]);

/**
 * What a restore or a purge changes: whatever fed this bin, plus every bin list. One list
 * for both, so a screen added to the one is never forgotten for the other. Besluiten B-15:
 * a restored transport has to reappear on the transports page too, not only in the bin.
 * Documents too: purging a reservation deletes its own contracts and damage checks and
 * detaches the others, so an open document list must not keep showing them.
 */
const BIN_CHANGE_PREFIXES = [
  "/api/vehicles",
  "/api/reservations",
  "/api/fines",
  "/api/transports",
  "/api/customers",
  // Sub-project D (B-41 D8): an expense comes back in the cost lists; a driver in the customer's drivers
  // (`/api/customers/:id/drivers` is covered above, `/api/drivers` is its own prefix).
  "/api/expenses",
  "/api/drivers",
  "/api/documents",
  "/api/deleted-records",
];

/** Refreshes every screen a restore or a purge can change (one batched pass). */
function invalidateBinScreens() {
  return Promise.all(BIN_CHANGE_PREFIXES.map((prefix) => invalidateByPrefix(prefix)));
}

/** The server lists a bin at 200 rows per kind; a full list may be only part of it. */
const BIN_LIST_CAP = 200;

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
  // Sub-project D (B-41 D8): the customer of a deleted driver is gone (or in the customer bin).
  "CUSTOMER_MISSING",
]);

/** Warnings a successful restore carries (besluit B-41 D8); anything else is ignored. */
const RESTORE_WARNING_CODES = new Set(["VEHICLE_MISSING"]);

export function RecycleBinDialog({ kind, customerId, open, onOpenChange, onRestored, onPurged }: RecycleBinDialogProps) {
  const { t } = useTranslation("recycleBin");
  const { toast } = useToast();
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmTarget, setConfirmTarget] = useState<PurgeTarget | null>(null);
  // A-3-9: rows that were already put back are history, not work to do; they stay
  // out of the list until asked for.
  const [showRestored, setShowRestored] = useState(false);

  const { data: allRecords, isLoading, isError } = useQuery<DeletedRecord[]>({
    queryKey: ["/api/deleted-records", { type: kind, ...(customerId != null ? { customerId } : {}) }],
    enabled: open,
  });
  const q = search.trim().toLowerCase();
  // The server already filters; this keeps a cached mixed list from showing
  // another screen's rows.
  const kindRecords = allRecords?.filter((r) => r.entityType === kind);
  const restoredCount = kindRecords?.filter((r) => r.restoredAt).length ?? 0;
  const visibleRecords = kindRecords?.filter((r) => showRestored || !r.restoredAt);
  const records = visibleRecords?.filter(
    (r) => !q || r.label.toLowerCase().includes(q) || (r.deletedBy ?? "").toLowerCase().includes(q) || (r.restoredBy ?? "").toLowerCase().includes(q),
  );

  const restoreMutation = useMutation({
    mutationFn: async (record: DeletedRecord) => {
      const response = await apiRequest("POST", `/api/deleted-records/${record.id}/restore`);
      const body = await response.json().catch(() => null);
      const warnings: string[] = Array.isArray(body?.warnings)
        ? body.warnings.filter((w: unknown): w is string => typeof w === "string" && RESTORE_WARNING_CODES.has(w))
        : [];
      return { record, warnings };
    },
    onSuccess: async ({ record, warnings }) => {
      toast({
        title: t("toasts.restoredTitle"),
        description: (
          <>
            <span className="block">{t("toasts.restoredDescription", { label: record.label })}</span>
            {warnings.map((code) => (
              <span key={code} className="block" data-testid={`text-restore-warning-${code}`}>{t(`toasts.warnings.${code}`)}</span>
            ))}
          </>
        ),
      });
      await invalidateBinScreens();
      onRestored?.();
    },
    onError: (error: Error & { code?: string; conflictingCustomerName?: string }) => {
      // The client branches on the stable `code`, never on the English message.
      const code = typeof error.code === "string" ? error.code : "";
      // A taken debtor number also carries who holds it, as a structured field of its
      // own (besluit B-35); without a name the sentence stays whole instead of
      // printing an empty placeholder.
      const holder = typeof error.conflictingCustomerName === "string" ? error.conflictingCustomerName.trim() : "";
      const description = !RESTORE_ERROR_CODES.has(code)
        ? t("toasts.restoreFailedDescription")
        : code === "DEBTOR_NUMBER_TAKEN" && !holder
          ? t("restoreErrors.DEBTOR_NUMBER_TAKEN_UNNAMED")
          : t(`restoreErrors.${code}`, { name: holder });
      toast({
        title: t("toasts.restoreFailedTitle"),
        description,
        variant: "destructive",
      });
    },
    onSettled: () => setRestoringId(null),
  });

  const purgeMutation = useMutation({
    mutationFn: async (target: PurgeTarget): Promise<PurgeAnswer> => {
      const response =
        target.mode === "one"
          ? await apiRequest("DELETE", `/api/deleted-records/${target.record.id}`)
          : await apiRequest(
              "POST",
              "/api/deleted-records/purge",
              target.mode === "selected" ? { ids: target.ids } : { entityType: kind, all: true },
            );
      return (await response.json()) as PurgeAnswer;
    },
    onSuccess: async (answer) => {
      const lines: string[] = [];
      if (answer.purged > 0) lines.push(t("purge.toasts.purged", { count: answer.purged }));
      // One sentence per kind of trouble, however many records ran into it.
      const codes = [...new Set((answer.failed ?? []).map((f) => f.code))];
      for (const code of codes) {
        lines.push(PURGE_ERROR_CODES.has(code) ? t(`purge.errors.${code}`) : t("purge.toasts.failedDescription"));
      }
      toast({
        title: codes.length > 0 ? t("purge.toasts.partialTitle") : t("purge.toasts.purgedTitle"),
        description: (
          <>
            {lines.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </>
        ),
        variant: codes.length > 0 ? "destructive" : undefined,
      });
      setConfirmTarget(null);
      setSelected(new Set());
      // Same screens as a restore.
      await invalidateBinScreens();
      onPurged?.();
    },
    onError: async (error: Error & { code?: string }) => {
      // The client branches on the stable `code`, never on the English message.
      const code = typeof error.code === "string" ? error.code : "";
      toast({
        title: t("purge.toasts.failedTitle"),
        description: PURGE_ERROR_CODES.has(code) ? t(`purge.errors.${code}`) : t("purge.toasts.failedDescription"),
        variant: "destructive",
      });
      setConfirmTarget(null);
      // The record may be gone already (NOT_FOUND) or still there (PURGE_FAILED): the list tells.
      await invalidateByPrefix("/api/deleted-records");
    },
  });

  // Selection works on what is shown: a search narrows what "select all" means.
  const shownIds = records?.map((r) => r.id) ?? [];
  const selectedShown = shownIds.filter((id) => selected.has(id));
  const allShownSelected = shownIds.length > 0 && selectedShown.length === shownIds.length;
  const toggleOne = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of shownIds) {
        if (allShownSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  /** The confirm text: how many, of what, and that there is no way back. */
  const noun = (count: number) => t(`kinds.${kind}.noun`, { count });
  const confirmSummary = (target: PurgeTarget): string => {
    if (target.mode === "one") return t("purge.confirmOne", { label: target.record.label });
    if (target.mode === "selected") return t("purge.confirmCount", { count: target.ids.length, noun: noun(target.ids.length) });
    // "Empty the bin" empties EVERYTHING of the kind on the server, also rows that this
    // (possibly stale, at most 200 long) list does not show: the text says so and the
    // count is only what the list shows.
    const shown = kindRecords?.length ?? 0;
    const plural = t(`kinds.${kind}.noun_other`);
    const base = shown >= BIN_LIST_CAP
      ? t("purge.confirmAllCapped", { count: shown, noun: plural })
      : t("purge.confirmAll", { count: shown, noun: plural });
    // Restored rows are hidden from the list but belong to "everything": say so (A-3-9 follow-up).
    return !showRestored && restoredCount > 0 ? `${base} ${t("purge.confirmAllRestoredHidden", { count: restoredCount })}` : base;
  };

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

        {!isLoading && !isError && restoredCount > 0 && (
          <label className="flex items-center gap-2 text-sm" data-testid="label-show-restored">
            <Checkbox
              checked={showRestored}
              onCheckedChange={(on) => setShowRestored(on === true)}
              data-testid="checkbox-show-restored"
            />
            {t("showRestored", { count: restoredCount })}
          </label>
        )}

        {!isLoading && !isError && (
          <div className="flex flex-wrap items-center justify-between gap-2" data-testid="recycle-bin-toolbar">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allShownSelected ? true : selectedShown.length > 0 ? "indeterminate" : false}
                disabled={shownIds.length === 0}
                onCheckedChange={toggleAllShown}
                data-testid="checkbox-deleted-select-all"
              />
              {t("purge.selectAll")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedShown.length === 0 || purgeMutation.isPending}
                onClick={() => setConfirmTarget({ mode: "selected", ids: selectedShown })}
                data-testid="button-purge-selected"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("purge.selectedButton", { count: selectedShown.length })}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!kindRecords || kindRecords.length === 0 || purgeMutation.isPending}
                onClick={() =>
                  // A bin filtered to one customer never empties "everything of the kind" on the server.
                  setConfirmTarget(customerId != null
                    ? { mode: "selected", ids: (kindRecords ?? []).map((r) => r.id) }
                    : { mode: "all" })}
                data-testid="button-purge-all"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("purge.allButton")}
              </Button>
            </div>
          </div>
        )}

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
                <Checkbox
                  className="mt-1"
                  checked={selected.has(record.id)}
                  onCheckedChange={(on) => toggleOne(record.id, on === true)}
                  aria-label={t("purge.selectRow", { label: record.label })}
                  data-testid={`checkbox-deleted-record-${record.id}`}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                <div className="flex flex-wrap items-center justify-end gap-2">
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={purgeMutation.isPending}
                    onClick={() => setConfirmTarget({ mode: "one", record })}
                    data-testid={`button-purge-${record.id}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("purge.rowButton")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(next) => {
          // Cancel and Escape work; while the request runs the dialog stays put.
          if (!next && !purgeMutation.isPending) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-purge">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              {t("purge.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget && (
                <>
                  <span className="block font-medium text-foreground" data-testid="text-confirm-purge-summary">
                    {confirmSummary(confirmTarget)}
                  </span>
                  <span className="mt-2 block">{t(`kinds.${kind}.purgeNote`)}</span>
                  <span className="mt-2 block">{t("purge.filesKept")}</span>
                  <span className="mt-2 block font-medium text-foreground">{t("purge.irreversible")}</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeMutation.isPending} data-testid="button-cancel-purge">
              {t("purge.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={purgeMutation.isPending || confirmTarget === null}
              onClick={() => confirmTarget && purgeMutation.mutate(confirmTarget)}
              data-testid="button-confirm-purge"
            >
              {purgeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("purge.confirmButton")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
