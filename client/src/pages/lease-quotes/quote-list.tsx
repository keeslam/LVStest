import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, Copy, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { LEASE_QUOTE_STATUSES, type LeaseQuoteDisplayStatus } from "@shared/lease-quotes";
import { UserPermission } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePager } from "@/components/ui/table-pager";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RequiresPermission } from "@/components/ui/requires-permission";
import { RecycleBinDialog } from "@/components/recycle-bin/recycle-bin-dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format-utils";
import { describeApiError } from "@/lib/api-error";
import { CopyQuoteDialog } from "./copy-quote-dialog";

interface QuoteRow {
  id: number;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  status: string;
  displayStatus: LeaseQuoteDisplayStatus;
  customerName: string | null;
  vehicle: string | null;
  licensePlate: string | null;
  monthlyPrice: number | null;
}

const ALL = "all";
const PAGE_SIZES = [25, 50, 100] as const;

/** "2026-10-31" -> "31-10-2026"; ISO dates are formatted as text so no timezone can shift them. */
function formatIsoDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "–";
}

const STATUS_VARIANT: Record<LeaseQuoteDisplayStatus, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  concept: "secondary",
  sent: "default",
  accepted: "success",
  rejected: "destructive",
  expired: "outline",
};

export function QuoteList({ onOpenQuote }: {
  /** Hook point for the quote editor: called with the id of the quote to open (row click, new quote, after a copy). */
  onOpenQuote: (id: number) => void;
}) {
  const { t } = useTranslation("leaseQuotes");
  const { toast } = useToast();
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText.trim());
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [copyId, setCopyId] = useState<number | null>(null);
  const [deleteRow, setDeleteRow] = useState<QuoteRow | null>(null);
  const [binOpen, setBinOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<{ rows: QuoteRow[]; total: number }>({
    queryKey: ["/api/lease-quotes", { search: search || undefined, status: status === ALL ? undefined : status, page, pageSize }],
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const createQuote = useMutation({
    mutationFn: async () => (await (await apiRequest("POST", "/api/lease-quotes", {})).json()) as { id: number },
    onSuccess: async (created) => {
      await invalidateByPrefix("/api/lease-quotes");
      onOpenQuote(created.id);
    },
    onError: (error) => toast({ title: t("create.failed"), description: describeApiError(error), variant: "destructive" }),
  });

  const deleteQuote = useMutation({
    mutationFn: async (id: number) => (await (await apiRequest("DELETE", `/api/lease-quotes/${id}`)).json()) as { ok: boolean; quoteNumber: string },
    onSuccess: async (result) => {
      await Promise.all([invalidateByPrefix("/api/lease-quotes"), invalidateByPrefix("/api/deleted-records")]);
      toast({ title: t("delete.done", { number: result.quoteNumber }) });
      setDeleteRow(null);
    },
    onError: (error) => {
      toast({ title: t("delete.failed"), description: describeApiError(error), variant: "destructive" });
      setDeleteRow(null);
    },
  });

  // The PDF is drawn on the server and stored as a copy; the new file is opened right away.
  const makePdf = useMutation({
    mutationFn: async (row: QuoteRow) => {
      const res = await apiRequest("POST", `/api/lease-quotes/${row.id}/pdf`, {});
      return { row, file: (await res.json()) as { id: number } };
    },
    onSuccess: ({ row, file }) => {
      toast({ title: t("pdf.done", { number: row.quoteNumber }) });
      window.open(`/api/lease-quotes/${row.id}/files/${file.id}`, "_blank", "noopener");
    },
    onError: (error) => toast({ title: t("pdf.failed"), description: describeApiError(error), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:w-80"
          placeholder={t("search")}
          aria-label={t("search")}
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
          data-testid="input-search-lease-quotes"
        />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-48" aria-label={t("statusFilter")} data-testid="select-status-lease-quotes">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
            {[...LEASE_QUOTE_STATUSES, "expired" as const].map((s) => (
              <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-wrap gap-2">
          {/* B-36: this screen's own recycle bin. */}
          <RequiresPermission anyOf={[UserPermission.MANAGE_RECYCLE_BIN]}>
            <Button variant="outline" onClick={() => setBinOpen(true)} data-testid="button-open-recycle-bin-lease-quotes">
              <Archive className="h-4 w-4 mr-2" />
              {t("recycleBin:kinds.lease_quote.openButton")}
            </Button>
          </RequiresPermission>
          <Button onClick={() => createQuote.mutate()} disabled={createQuote.isPending} data-testid="button-new-lease-quote">
            {createQuote.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {t("newQuote")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <p className="py-8 text-center text-destructive">{t("loadFailed")}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground" data-testid="text-no-lease-quotes">
          {search || status !== ALL ? t("noResults") : t("empty")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.number")}</TableHead>
              <TableHead>{t("columns.date")}</TableHead>
              <TableHead>{t("columns.customer")}</TableHead>
              <TableHead>{t("columns.vehicle")}</TableHead>
              <TableHead>{t("columns.licensePlate")}</TableHead>
              <TableHead className="text-right">{t("columns.monthly")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.validUntil")}</TableHead>
              <TableHead className="text-right">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onOpenQuote(row.id)}
                data-testid={`row-lease-quote-${row.id}`}
              >
                <TableCell className="font-medium whitespace-nowrap">{row.quoteNumber}</TableCell>
                <TableCell className="whitespace-nowrap">{formatIsoDate(row.quoteDate)}</TableCell>
                <TableCell>{row.customerName || <span className="text-muted-foreground">{t("noCustomer")}</span>}</TableCell>
                <TableCell>{row.vehicle || "–"}</TableCell>
                <TableCell className="whitespace-nowrap">{row.licensePlate || "–"}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatCurrency(row.monthlyPrice)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[row.displayStatus] ?? "secondary"}>{t(`status.${row.displayStatus}`)}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{formatIsoDate(row.validUntil)}</TableCell>
                <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" title={t("actions.copy")} aria-label={t("actions.copy")} onClick={() => setCopyId(row.id)} data-testid={`button-copy-lease-quote-${row.id}`}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={t("actions.pdf")} aria-label={t("actions.pdf")} disabled={makePdf.isPending} onClick={() => makePdf.mutate(row)} data-testid={`button-pdf-lease-quote-${row.id}`}>
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={t("actions.delete")} aria-label={t("actions.delete")} onClick={() => setDeleteRow(row)} data-testid={`button-delete-lease-quote-${row.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <TablePager
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        pageSize={pageSize}
        total={total}
        setPage={setPage}
        setPageSize={(n) => { setPageSize(n); setPage(1); }}
        sizes={PAGE_SIZES}
        testId="lease-quotes"
      />

      <CopyQuoteDialog
        quoteId={copyId}
        onOpenChange={(open) => { if (!open) setCopyId(null); }}
        onCopied={(created) => onOpenQuote(created.id)}
      />

      <AlertDialog open={deleteRow !== null} onOpenChange={(open) => { if (!open && !deleteQuote.isPending) setDeleteRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.description", { number: deleteRow?.quoteNumber ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteQuote.isPending}>{t("delete.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteQuote.isPending}
              onClick={() => deleteRow && deleteQuote.mutate(deleteRow.id)}
              data-testid="button-confirm-delete-lease-quote"
            >
              {t("delete.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecycleBinDialog
        kind="lease_quote"
        open={binOpen}
        onOpenChange={setBinOpen}
        onRestored={() => { void invalidateByPrefix("/api/lease-quotes"); }}
        onPurged={() => { void invalidateByPrefix("/api/lease-quotes"); }}
      />
    </div>
  );
}
