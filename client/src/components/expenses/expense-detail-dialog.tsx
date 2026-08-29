import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Tag, FileText, FileCheck, Truck, Pencil, Trash2 } from "lucide-react";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { Price } from "@/components/ui/price";
import { Expense, Vehicle } from "@shared/schema";
import { ExpenseForm } from "./expense-form";
import { PdfPreviewDialog } from "@/components/documents/pdf-preview-dialog";

interface ExpenseDetailDialogProps {
  expenseId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hideVehicleExpensesLink?: boolean;
}

export function ExpenseDetailDialog({ expenseId, open, onOpenChange, hideVehicleExpensesLink = false }: ExpenseDetailDialogProps) {
  const { t } = useTranslation(["expenses", "common"]);
  const { toast } = useToast();
  const { openVehicleDialog, openExpenseVehicleDialog } = useGlobalDialog();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);

  useEffect(() => {
    if (open) setMode("view");
  }, [open, expenseId]);

  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: [`/api/expenses/${expenseId}`],
    enabled: open && !!expenseId,
  });

  const { data: vehicle, isLoading: isLoadingVehicle } = useQuery<Vehicle>({
    queryKey: [`/api/vehicles/${expense?.vehicleId}`],
    enabled: open && !!expense?.vehicleId,
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!expenseId) throw new Error("No expense ID provided");
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete expense");
      }
      return await response.json();
    },
    onSuccess: async () => {
      toast({
        title: t('viewDialog.expenseDeletedTitle'),
        description: t('viewDialog.expenseDeletedDescription'),
      });
      await invalidateRelatedQueries('expenses', {
        id: expenseId ?? undefined,
        vehicleId: expense?.vehicleId,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('viewDialog.deleteExpenseErrorTitle'),
        description: error.message || t('viewDialog.deleteExpenseErrorDescription'),
        variant: "destructive",
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={mode === "edit" ? "max-w-4xl max-h-[90vh] overflow-y-auto" : "max-w-3xl max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t('addPage.editExpenseTitle') : t('indexPage.viewExpenseDetailsDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit" ? t('indexPage.editExpenseDialogDescription') : t('indexPage.viewExpenseDetailsDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : !expense ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('detailsPage.expenseNotFoundTitle')}
          </div>
        ) : mode === "edit" ? (
          <ExpenseForm
            editMode={true}
            initialData={{
              id: expense.id,
              vehicleId: expense.vehicleId,
              category: expense.category,
              amount: Number(expense.amount),
              date: expense.date,
              description: expense.description || "",
              receiptUrl: expense.receiptUrl || "",
            }}
            onSuccess={() => {
              setMode("view");
              invalidateRelatedQueries('expenses', { id: expense.id, vehicleId: expense.vehicleId });
            }}
          />
        ) : (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.dateLabel')}</h3>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-primary" />
                    <span>{formatDate(expense.date)}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.categoryLabel')}</h3>
                  <div className="flex items-center">
                    <Tag className="h-4 w-4 mr-2 text-primary" />
                    <Badge>{expense.category}</Badge>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.amountLabel')}</h3>
                  <div className="text-2xl font-bold">
                    {<Price value={Number(expense.amount || 0)} />}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.vehicleLabel')}</h3>
                  <div className="flex items-center">
                    <Truck className="h-4 w-4 mr-2 text-primary" />
                    {isLoadingVehicle ? (
                      <Skeleton className="h-6 w-28" />
                    ) : vehicle ? (
                      <button
                        type="button"
                        onClick={() => openVehicleDialog(vehicle.id)}
                        className="text-blue-600 hover:underline"
                      >
                        {vehicle.brand} {vehicle.model} ({formatLicensePlate(vehicle.licensePlate)})
                      </button>
                    ) : (
                      <span className="text-muted-foreground">{t('detailsPage.vehicleNotFound')}</span>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.descriptionLabel')}</h3>
                  <div className="flex items-start">
                    <FileText className="h-4 w-4 mr-2 mt-1 text-primary" />
                    <p className="text-sm">
                      {expense.description || t('detailsPage.noDescriptionProvided')}
                    </p>
                  </div>
                </div>

                {expense.receiptFilePath && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">{t('detailsPage.receiptLabel')}</h3>
                    <div className="flex items-center">
                      <FileCheck className="h-4 w-4 mr-2 text-primary" />
                      <button
                        type="button"
                        onClick={() => setReceiptPreviewOpen(true)}
                        className="text-blue-600 hover:underline"
                      >
                        {t('detailsPage.viewReceiptLink')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {vehicle && !hideVehicleExpensesLink && (
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openExpenseVehicleDialog(vehicle.id)}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  {t('detailsPage.viewAllVehicleExpensesButton')}
                </Button>
              </div>
            )}

            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between text-sm text-muted-foreground">
                <div>{t('detailsPage.createdLabel', { date: expense.createdAt ? formatDate(expense.createdAt) : t('detailsPage.notAvailable') })}</div>
                {expense.createdBy && <div>{t('detailsPage.byLabel', { name: expense.createdBy })}</div>}
              </div>
              {expense.updatedAt && expense.createdAt && expense.updatedAt !== expense.createdAt && (
                <div className="flex justify-between text-sm text-muted-foreground mt-1">
                  <div>{t('detailsPage.updatedLabel', { date: formatDate(expense.updatedAt) })}</div>
                  {expense.updatedBy && <div>{t('detailsPage.byLabel', { name: expense.updatedBy })}</div>}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setMode("edit")}
                className="flex-1"
                data-testid="button-edit-from-dialog"
              >
                <Pencil className="h-4 w-4 mr-2" />
                {t('detailsPage.editExpenseButton')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-delete-from-dialog">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('detailsPage.deleteButton')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('detailsPage.confirmDeleteTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('detailsPage.confirmDeleteDescription')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteExpenseMutation.mutate()}
                      disabled={deleteExpenseMutation.isPending}
                    >
                      {deleteExpenseMutation.isPending ? t('detailsPage.deletingButton') : t('detailsPage.deleteButton')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.close')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {expense && (
        <PdfPreviewDialog
          open={receiptPreviewOpen}
          onOpenChange={setReceiptPreviewOpen}
          url={`/api/expenses/${expense.id}/receipt`}
          title={t('detailsPage.receiptLabel')}
        />
      )}
    </Dialog>
  );
}
