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
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatDate } from "@/lib/format-utils";

interface DeletedRecord {
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

interface DeletedVehiclesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored?: () => void;
}

const describeCounts = (counts: Record<string, number> | null, t: TFunction) => {
  if (!counts) return "";
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${key}`);
  return parts.length > 0 ? parts.join(", ") : t('deletedVehiclesDialog.noLinkedRecords');
};

export function DeletedVehiclesDialog({ open, onOpenChange, onRestored }: DeletedVehiclesDialogProps) {
  const { t } = useTranslation("vehicles");
  const { toast } = useToast();
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const { data: records, isLoading, refetch } = useQuery<DeletedRecord[]>({
    queryKey: ["/api/deleted-records"],
    enabled: open,
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/deleted-records/${id}/restore`);
      return await response.json();
    },
    onSuccess: async (data) => {
      toast({
        title: t('deletedVehiclesDialog.toasts.restoredTitle'),
        description: data?.message || t('deletedVehiclesDialog.toasts.restoredDescription'),
      });
      await invalidateByPrefix("/api/vehicles");
      await invalidateByPrefix("/api/reservations");
      await refetch();
      onRestored?.();
    },
    onError: (error: Error) => {
      toast({
        title: t('deletedVehiclesDialog.toasts.restoreFailedTitle'),
        description: error.message || t('deletedVehiclesDialog.toasts.restoreFailedDescription'),
        variant: "destructive",
      });
    },
    onSettled: () => setRestoringId(null),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {t('deletedVehiclesDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('deletedVehiclesDialog.description')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t('deletedVehiclesDialog.loading')}</span>
          </div>
        ) : !records || records.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            {t('deletedVehiclesDialog.noDeletedVehicles')}
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
                    <span className="font-medium">{record.label}</span>
                    {record.restoredAt && (
                      <Badge className="bg-green-100 text-green-800">{t('deletedVehiclesDialog.restoredBadge')}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('deletedVehiclesDialog.deletedByLabel', { date: formatDate(record.deletedAt), by: record.deletedBy || t('deletedVehiclesDialog.unknown') })}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('deletedVehiclesDialog.includedLabel', { summary: describeCounts(record.relatedCounts, t) })}
                  </div>
                  {record.restoredAt && (
                    <div className="text-sm text-muted-foreground">
                      {t('deletedVehiclesDialog.restoredByLabel', { date: formatDate(record.restoredAt), by: record.restoredBy || t('deletedVehiclesDialog.unknown') })}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!record.restoredAt || restoreMutation.isPending}
                  onClick={() => {
                    setRestoringId(record.id);
                    restoreMutation.mutate(record.id);
                  }}
                  data-testid={`button-restore-${record.id}`}
                >
                  {restoringId === record.id && restoreMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {t('deletedVehiclesDialog.restoreButton')}
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
