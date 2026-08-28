import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Check, X, RotateCw } from "lucide-react";
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

        <div className="space-y-3">
          {pendingChanges.map((change) => {
            const isPending = confirmMutation.isPending || dismissMutation.isPending;
            return (
              <div
                key={change.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
                data-testid={`apk-date-change-${change.id}`}
              >
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

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common:actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
