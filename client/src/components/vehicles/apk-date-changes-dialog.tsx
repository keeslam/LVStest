import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { nl, enUS } from "date-fns/locale";
import i18next from "i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, X, Trash2 } from "lucide-react";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatLicensePlate } from "@/lib/format-utils";
import { useToast } from "@/hooks/use-toast";

interface PendingApkChange {
  id: number;
  vehicleId: number;
  previousApkDate: string | null;
  newApkDate: string;
  licensePlate: string;
  brand: string;
  model: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), "d MMMM yyyy", { locale: i18next.language === "nl" ? nl : enUS });
  } catch {
    return dateStr;
  }
}

export function ApkDateChangesDialog() {
  const { t } = useTranslation(["vehicles", "common"]);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const hasAutoOpenedRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: pendingChanges = [] } = useQuery<PendingApkChange[]>({
    queryKey: ["/api/apk-date-changes"],
    staleTime: 1000 * 60,
  });

  // Open once per session as soon as the first batch of pending changes
  // arrives - closing the dialog (or resolving every item) won't reopen it
  // again until the next login.
  useEffect(() => {
    if (!hasAutoOpenedRef.current && pendingChanges.length > 0) {
      setOpen(true);
      hasAutoOpenedRef.current = true;
    }
  }, [pendingChanges.length]);

  // Drop selections for rows that got resolved elsewhere (confirmed/dismissed
  // individually, or by a bulk action) so a stale id can't inflate the count.
  useEffect(() => {
    const currentIds = new Set(pendingChanges.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pendingChanges]);

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/apk-date-changes/${id}/confirm`),
    onSuccess: () => {
      invalidateByPrefix("/api/apk-date-changes");
      invalidateByPrefix("/api/vehicles");
      toast({ title: t("common:status.success"), description: t("apkDateChanges.confirmedDescription") });
    },
    onError: (error: any) => {
      toast({ title: t("common:status.error"), description: error.message, variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/apk-date-changes/${id}/dismiss`),
    onSuccess: () => {
      invalidateByPrefix("/api/apk-date-changes");
      toast({ title: t("common:status.success"), description: t("apkDateChanges.dismissedDescription") });
    },
    onError: (error: any) => {
      toast({ title: t("common:status.error"), description: error.message, variant: "destructive" });
    },
  });

  const bulkDismissMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await apiRequest("POST", "/api/apk-date-changes/bulk-dismiss", { ids });
      return response.json();
    },
    onSuccess: (result: { dismissed: number }) => {
      invalidateByPrefix("/api/apk-date-changes");
      setSelectedIds(new Set());
      toast({
        title: t("common:status.success"),
        description: t("apkDateChanges.bulkDismissedDescription", { count: result.dismissed }),
      });
    },
    onError: (error: any) => {
      toast({ title: t("common:status.error"), description: error.message, variant: "destructive" });
    },
  });

  const allSelected = pendingChanges.length > 0 && selectedIds.size === pendingChanges.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(pendingChanges.map((c) => c.id)));
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (pendingChanges.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("apkDateChanges.title")}</DialogTitle>
          <DialogDescription>{t("apkDateChanges.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b pb-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            aria-label={t("apkDateChanges.selectAllLabel")}
            data-testid="checkbox-select-all-apk-changes"
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? t("apkDateChanges.selectedCount", { count: selectedIds.size })
              : t("apkDateChanges.selectAllLabel")}
          </span>
        </div>

        <div className="space-y-3">
          {pendingChanges.map((change) => {
            const isPending = confirmMutation.isPending || dismissMutation.isPending || bulkDismissMutation.isPending;
            return (
              <div
                key={change.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
                data-testid={`apk-date-change-${change.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox
                    checked={selectedIds.has(change.id)}
                    onCheckedChange={() => toggleSelectOne(change.id)}
                    aria-label={t("apkDateChanges.selectRowLabel")}
                    data-testid={`checkbox-select-apk-change-${change.id}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatLicensePlate(change.licensePlate)}</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {change.brand} {change.model}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="font-normal">
                        {formatDate(change.previousApkDate)}
                      </Badge>
                      <span className="text-muted-foreground">&rarr;</span>
                      <Badge className="font-normal bg-blue-100 text-blue-800 hover:bg-blue-100">
                        {formatDate(change.newApkDate)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => dismissMutation.mutate(change.id)}
                    disabled={isPending}
                    data-testid={`button-dismiss-apk-change-${change.id}`}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t("apkDateChanges.dismissButton")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => confirmMutation.mutate(change.id)}
                    disabled={isPending}
                    data-testid={`button-confirm-apk-change-${change.id}`}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {t("apkDateChanges.confirmButton")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="sm:justify-between">
          {selectedIds.size > 0 ? (
            <Button
              variant="destructive"
              onClick={() => bulkDismissMutation.mutate([...selectedIds])}
              disabled={bulkDismissMutation.isPending}
              data-testid="button-bulk-dismiss-apk-changes"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("apkDateChanges.deleteSelectedButton", { count: selectedIds.size })}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common:actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
