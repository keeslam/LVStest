/**
 * Round 2 punt 11 (Kees, 2026-10-21) — the costs of one workshop visit.
 *
 * Linked costs with their total, "Kosten toevoegen" (already tied to the car and the
 * visit), and "Nieuwe factuur gevonden": the car's unlinked expenses from the visit's
 * start up to 60 days after its end. The garage's invoice usually comes later, and
 * another invoice can arrive in between, so linking always goes through a dialog that
 * shows the invoices and lets you pick the right one (the newest is preselected).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileWarning, Link2, Plus, Receipt, Unlink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatCurrency, formatDate, formatExpenseCategory } from "@/lib/format-utils";
import { describeApiError } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

interface VisitExpense {
  id: number;
  date: string;
  category: string;
  amount: string;
  description: string | null;
}

interface VisitCostsResponse {
  linked: VisitExpense[];
  candidates: VisitExpense[];
  total: number;
  /** Part B: on the "factuur ontbreekt" list. */
  missing?: boolean;
  noInvoiceExpected?: boolean;
}

function ExpenseLine({ e }: { e: VisitExpense }) {
  return (
    <span className="min-w-0">
      <span className="font-medium">{formatCurrency(e.amount)}</span>
      <span className="text-gray-600"> · {formatExpenseCategory(e.category)} · {formatDate(e.date)}</span>
      {e.description && <span className="block truncate text-xs text-gray-500">{e.description}</span>}
    </span>
  );
}

export function VisitCosts({ visitId, vehicleId }: { visitId: number; vehicleId: number }) {
  const { t } = useTranslation("maintenance");
  const { toast } = useToast();
  const key = `/api/maintenance-blocks/${visitId}/costs`;
  const { data } = useQuery<VisitCostsResponse>({ queryKey: [key] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenId, setChosenId] = useState<number | null>(null);

  const link = useMutation({
    mutationFn: async ({ expenseId, blockId }: { expenseId: number; blockId: number | null }) => {
      await apiRequest("PUT", `/api/expenses/${expenseId}/maintenance-block`, { blockId });
    },
    onSuccess: (_r, vars) => {
      invalidateByPrefix(key);
      invalidateByPrefix("/api/expenses");
      setPickerOpen(false);
      toast({ title: vars.blockId ? t("visitCosts.linked") : t("visitCosts.unlinked") });
    },
    onError: (error) => toast({ variant: "destructive", title: t("visitCosts.linkFailed"), description: describeApiError(error) }),
  });

  const noInvoice = useMutation({
    mutationFn: async (noInvoiceExpected: boolean) => {
      await apiRequest("PUT", `/api/maintenance-blocks/${visitId}/no-invoice`, { noInvoiceExpected });
    },
    onSuccess: () => {
      invalidateByPrefix(key);
      invalidateByPrefix("/api/maintenance-blocks/missing-invoices");
    },
    onError: (error) => toast({ variant: "destructive", title: t("visitCosts.linkFailed"), description: describeApiError(error) }),
  });

  const linked = data?.linked ?? [];
  const candidates = data?.candidates ?? [];
  const openPicker = () => {
    setChosenId(candidates[0]?.id ?? null);
    setPickerOpen(true);
  };

  return (
    <div className="space-y-3" data-testid="visit-costs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Receipt className="h-4 w-4" aria-hidden="true" />
          {t("visitCosts.title")}
        </h3>
        <ExpenseAddDialog
          vehicleId={vehicleId}
          maintenanceBlockId={visitId}
          onSuccess={() => invalidateByPrefix(key)}
        >
          <Button variant="outline" size="sm" data-testid="button-visit-add-cost">
            <Plus className="h-4 w-4 mr-1" />
            {t("visitCosts.add")}
          </Button>
        </ExpenseAddDialog>
      </div>

      {data?.missing && (
        <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800" data-testid="visit-missing-invoice">
          <FileWarning className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("visitCosts.missingInvoice")}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between" data-testid="visit-invoice-found">
          <span>{t("visitCosts.invoiceFound", { count: candidates.length })}</span>
          <Button size="sm" variant="outline" className="shrink-0" onClick={openPicker} data-testid="button-visit-link-invoice">
            <Link2 className="h-4 w-4 mr-1" />
            {t("visitCosts.linkInvoice")}
          </Button>
        </div>
      )}

      {linked.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="visit-costs-empty">{t("visitCosts.none")}</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {linked.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 p-2" data-testid={`visit-cost-${e.id}`}>
              <ExpenseLine e={e} />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={() => link.mutate({ expenseId: e.id, blockId: null })}
                aria-label={t("visitCosts.unlink")}
                title={t("visitCosts.unlink")}
                data-testid={`button-visit-unlink-${e.id}`}
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </li>
          ))}
          <li className="flex justify-between p-2 font-semibold" data-testid="visit-costs-total">
            <span>{t("visitCosts.total")}</span>
            <span>{formatCurrency(data?.total ?? 0)}</span>
          </li>
        </ul>
      )}

      {linked.length === 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <Checkbox
            checked={!!data?.noInvoiceExpected}
            onCheckedChange={(v) => noInvoice.mutate(v === true)}
            disabled={noInvoice.isPending}
            data-testid="checkbox-visit-no-invoice"
          />
          {t("visitCosts.noInvoiceExpected")}
        </label>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-visit-link-invoice">
          <DialogHeader>
            <DialogTitle>{t("visitCosts.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("visitCosts.confirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {candidates.map((e) => (
              <label
                key={e.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-2 text-sm ${chosenId === e.id ? "border-primary-500 bg-primary-50" : ""}`}
                data-testid={`visit-candidate-${e.id}`}
              >
                <input
                  type="radio"
                  name="visit-invoice"
                  className="mt-1"
                  checked={chosenId === e.id}
                  onChange={() => setChosenId(e.id)}
                />
                <ExpenseLine e={e} />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>{t("common:actions.cancel")}</Button>
            <Button
              onClick={() => chosenId && link.mutate({ expenseId: chosenId, blockId: visitId })}
              disabled={!chosenId || link.isPending}
              data-testid="button-visit-link-confirm"
            >
              {t("visitCosts.confirmLink")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
