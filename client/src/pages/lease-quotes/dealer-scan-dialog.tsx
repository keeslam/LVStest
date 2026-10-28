import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ParsedDealerQuote } from "@shared/lease-quotes";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format-utils";

export interface DealerScanResponse {
  parsed: ParsedDealerQuote;
  suggestion: { amount: number | null; onlyInclVat: boolean };
}

export type ScanTextField = "dealerName" | "vehicleMake" | "vehicleModel" | "vehicleTrim" | "deliveryTime";
export type ScanAmountField = "catalogPrice" | "options" | "discount" | "bpm" | "deliveryCosts" | "totalExclVat" | "totalInclVat";

/** What "Overnemen" hands to the editor: only the ticked values. */
export interface ScanApplied {
  text: Partial<Record<ScanTextField, string>>;
  breakdown: Partial<Record<ScanAmountField, number>>;
  purchasePrice?: number;
  /** The dealer's own date and validity have no field of their own; they go into Opmerkingen as a line. */
  notesLine?: string;
}

type RowKey = "purchasePrice" | keyof ParsedDealerQuote;
interface Row { key: RowKey; value: string | number | null; kind: "amount" | "text" | "date" }

/** "2026-10-31" -> "31-10-2026"; anything else is shown as the scanner gave it. */
function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

const TEXT_TARGET: Partial<Record<keyof ParsedDealerQuote, ScanTextField>> = {
  dealerName: "dealerName", make: "vehicleMake", model: "vehicleModel", trim: "vehicleTrim", deliveryTime: "deliveryTime",
};
const AMOUNT_KEYS: ScanAmountField[] = ["catalogPrice", "options", "discount", "bpm", "deliveryCosts", "totalExclVat", "totalInclVat"];

function rowsOf(data: DealerScanResponse): Row[] {
  const p = data.parsed;
  return [
    { key: "purchasePrice", value: data.suggestion.amount, kind: "amount" },
    { key: "dealerName", value: p.dealerName, kind: "text" },
    { key: "make", value: p.make, kind: "text" },
    { key: "model", value: p.model, kind: "text" },
    { key: "trim", value: p.trim, kind: "text" },
    ...AMOUNT_KEYS.map((key): Row => ({ key, value: p[key], kind: "amount" })),
    { key: "deliveryTime", value: p.deliveryTime, kind: "text" },
    { key: "quoteDate", value: p.quoteDate, kind: "date" },
    { key: "validUntil", value: p.validUntil, kind: "date" },
  ];
}

interface DealerScanDialogProps {
  quoteId: number;
  /** The dealer file just uploaded (or picked from the list); null = closed. */
  file: { id: number; fileName: string } | null;
  onClose: () => void;
  onApply: (applied: ScanApplied) => void;
}

/**
 * Reads a dealer quote with the AI scanner and shows every field with an "overnemen" tick.
 * Nothing reaches the quote until "Overnemen"; even then it is only written into the form, not saved.
 */
export function DealerScanDialog({ quoteId, file, onClose, onApply }: DealerScanDialogProps) {
  const { t } = useTranslation("leaseQuotes");
  const fileId = file?.id ?? null;
  // A query (not an effect + mutation) so a remount never sends the file to the AI twice.
  const scan = useQuery<DealerScanResponse>({
    queryKey: ["lease-quote-scan", quoteId, fileId],
    queryFn: async () => (await apiRequest("POST", `/api/lease-quotes/${quoteId}/files/${fileId}/scan`, {})).json(),
    enabled: fileId !== null,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [ticked, setTicked] = useState<Partial<Record<RowKey, boolean>>>({});

  const rows = scan.data ? rowsOf(scan.data) : [];
  const onlyInclVat = scan.data?.suggestion.onlyInclVat ?? false;

  // Ticked by default when the scanner found a value.
  useEffect(() => {
    if (!scan.data) return;
    setTicked(Object.fromEntries(rowsOf(scan.data).map((r) => [r.key, r.value !== null && r.value !== ""])));
  }, [scan.data]);

  const show = (row: Row) => {
    if (row.value === null || row.value === "") return <span className="text-muted-foreground">{t("scan.notFound")}</span>;
    if (row.kind === "amount") return formatCurrency(Number(row.value));
    if (row.kind === "date") return formatIsoDate(String(row.value));
    return String(row.value);
  };

  function apply() {
    const applied: ScanApplied = { text: {}, breakdown: {} };
    const notes: string[] = [];
    for (const row of rows) {
      if (!ticked[row.key] || row.value === null || row.value === "") continue;
      if (row.key === "purchasePrice") applied.purchasePrice = Number(row.value);
      else if ((AMOUNT_KEYS as string[]).includes(row.key)) applied.breakdown[row.key as ScanAmountField] = Number(row.value);
      else if (row.key === "quoteDate") notes.push(t("scan.notesDate", { date: formatIsoDate(String(row.value)) }));
      else if (row.key === "validUntil") notes.push(t("scan.notesValid", { date: formatIsoDate(String(row.value)) }));
      else {
        const target = TEXT_TARGET[row.key as keyof ParsedDealerQuote];
        if (target) applied.text[target] = String(row.value);
      }
    }
    if (notes.length) applied.notesLine = t("scan.notesLine", { parts: notes.join(", ") });
    onApply(applied);
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-dealer-scan">
        <DialogHeader>
          <DialogTitle>{t("scan.title")}</DialogTitle>
          <DialogDescription>{file ? t("scan.description", { name: file.fileName }) : null}</DialogDescription>
        </DialogHeader>

        {scan.isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" data-testid="text-scan-reading">
            <Loader2 className="h-4 w-4 animate-spin" />{t("scan.reading")}
          </p>
        ) : scan.isError || !scan.data ? (
          <p className="py-4 text-sm text-destructive" data-testid="text-scan-failed">{t("scan.failed")}</p>
        ) : (
          <div className="space-y-3">
            {onlyInclVat && (
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-testid="text-scan-only-incl-vat">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t("scan.onlyInclVat")}
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 font-normal">{t("scan.field")}</th>
                  <th className="py-1.5 font-normal">{t("scan.value")}</th>
                  <th className="py-1.5 text-right font-normal">{t("scan.take")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const empty = row.value === null || row.value === "";
                  const id = `scan-take-${row.key}`;
                  return (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="py-1.5 pr-2"><label htmlFor={id}>{t(`scan.fields.${row.key}`)}</label></td>
                      <td className="py-1.5 pr-2">{show(row)}</td>
                      <td className="py-1.5 text-right">
                        <Checkbox
                          id={id}
                          checked={!!ticked[row.key]}
                          disabled={empty}
                          aria-label={`${t(`scan.fields.${row.key}`)}: ${t("scan.take")}`}
                          onCheckedChange={(v) => setTicked((cur) => ({ ...cur, [row.key]: v === true }))}
                          data-testid={`checkbox-scan-${row.key}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} data-testid="button-scan-cancel">
            {scan.data ? t("scan.cancel") : t("scan.close")}
          </Button>
          {scan.data && (
            <Button onClick={apply} data-testid="button-scan-apply">{t("scan.apply")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
