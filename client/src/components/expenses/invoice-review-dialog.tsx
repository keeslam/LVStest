import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { UserPermission, type InvoiceInboxItem, type Vehicle } from "@shared/schema";
import { useHasPermission } from "@/hooks/use-has-permission";
import type { InboxLineItem } from "@shared/invoice-inbox";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatCurrency, formatExpenseCategory } from "@/lib/format-utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { useToast } from "@/hooks/use-toast";
import { InvoiceLineItemsTable } from "./invoice-line-items-table";
import { officeToday } from "@/lib/office-date";

/** What the API sends: timestamps arrive as strings, and the list adds the plate. */
export type InboxListItem = Omit<InvoiceInboxItem, "receivedAt" | "processedAt" | "mailDate"> & {
  receivedAt: string; processedAt: string | null; mailDate: string | null; vehiclePlate: string | null;
};

interface Props {
  item: InboxListItem | null;
  vehicles: Vehicle[];
  onClose: () => void;
}


/** Attachment on the left; what the app read, editable, on the right. Read-only for handled items. */
export function InvoiceReviewDialog({ item: listItem, vehicles, onClose }: Props) {
  const { t } = useTranslation("expenses");
  const { toast } = useToast();
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [lines, setLines] = useState<InboxLineItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [note, setNote] = useState("");
  // What "Opnieuw uitlezen" sent back; it replaces the list's copy of this item.
  const [rescanned, setRescanned] = useState<InboxListItem | null>(null);
  const item = listItem && rescanned?.id === listItem.id ? rescanned : listItem;

  /** Fill the form from what the app read. keepVehicle: a vehicle picked by hand survives a new reading. */
  const fillForm = (source: InboxListItem, keepVehicle: string) => {
    const parsedLines = source.parsed?.lineItems ?? [];
    setVendor(source.parsed?.vendor ?? "");
    setInvoiceNumber(source.parsed?.invoiceNumber ?? "");
    setInvoiceDate(/^\d{4}-\d{2}-\d{2}$/.test(source.parsed?.invoiceDate ?? "") ? source.parsed!.invoiceDate : officeToday());
    setVehicleId(source.vehicleId ? String(source.vehicleId) : keepVehicle);
    setLines(parsedLines);
    // A line of 0 (a free part on the invoice) cannot be booked; ticked, it greyed out Boeken.
    setSelected(new Set(parsedLines.flatMap((l, i) => (l.amount > 0 ? [i] : []))));
  };

  useEffect(() => {
    setRescanned(null);
    if (!listItem) return;
    fillForm(listItem, "");
    setGroupByCategory(true);
    setNote("");
  }, [listItem?.id]);

  const done = (title: string) => {
    toast({ title });
    invalidateByPrefix("/api/expenses");
    onClose();
  };

  const book = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/expenses/inbox/items/${item!.id}/book`, {
      vehicleId: Number(vehicleId),
      invoice: { vendor, invoiceNumber, invoiceDate },
      lineItems: lines.filter((_, i) => selected.has(i)).map(({ description, amount, category }) => ({ description, amount, category })),
      groupByCategory,
    })).json(),
    onSuccess: (r: { expenses: unknown[] }) => done(t("invoiceInbox.dialog.bookedToast", { count: r.expenses.length })),
    onError: (e: Error) => toast({ title: t("invoiceInbox.dialog.bookFailed"), description: e.message, variant: "destructive" }),
  });
  const dismiss = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/expenses/inbox/items/${item!.id}/dismiss`, { note: note.trim() || undefined })).json(),
    onSuccess: () => done(t("invoiceInbox.dialog.dismissedToast")),
    onError: (e: Error) => toast({ title: t("invoiceInbox.dialog.dismissFailed"), description: e.message, variant: "destructive" }),
  });

  const trust = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/expenses/inbox/items/${item!.id}/trust-sender`, {})).json(),
    onSuccess: (r: { sender: string }) => toast({ title: t("invoiceInbox.dialog.trustSenderToast", { sender: r.sender }) }),
    onError: (e: Error) => toast({ title: t("invoiceInbox.dialog.trustSenderFailed"), description: e.message, variant: "destructive" }),
  });
  const rescan = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/expenses/inbox/items/${item!.id}/rescan`, {})).json(),
    // Stay open on the new reading. Closing used to drop the vehicle picked by
    // hand (a plate outside the fleet), which left Boeken grey after reopening.
    onSuccess: (r: { item: InboxListItem }) => {
      const fresh = { ...item!, ...r.item, vehiclePlate: item!.vehiclePlate };
      setRescanned(fresh);
      fillForm(fresh, vehicleId);
      invalidateByPrefix("/api/expenses");
      toast({ title: t("invoiceInbox.dialog.rescanToast") });
    },
    onError: (e: Error) => toast({ title: t("invoiceInbox.dialog.rescanFailed"), description: e.message, variant: "destructive" }),
  });
  const canTrustSender = useHasPermission(UserPermission.MANAGE_SETTINGS);

  if (!item) return null;

  const readOnly = item.status !== "review";
  const chosen = lines.filter((_, i) => selected.has(i));
  // Why Boeken is grey, said under the button rather than left to guess.
  const blockedBy = vehicleId === "" ? "noVehicle"
    : !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ? "noDate"
    : chosen.length === 0 ? "noLines"
    : chosen.some((l) => l.description.trim() === "") ? "lineDescription"
    : chosen.some((l) => !(l.amount > 0)) ? "lineAmount"
    : null;
  const canBook = !readOnly && blockedBy === null;
  const fileUrl = `/api/expenses/inbox/items/${item.id}/file`;
  const isImage = (item.attachmentContentType ?? "").startsWith("image/");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>{readOnly ? t("invoiceInbox.dialog.titleReadOnly") : t("invoiceInbox.dialog.title")}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? (item.reviewReason ? t("invoiceInbox.dialog.wasInReview", { reason: t(`invoiceInbox.reasons.${item.reviewReason}`) }) : null)
              : <>{item.reviewReason ? `${t(`invoiceInbox.reasons.${item.reviewReason}`)}. ` : ""}{t("invoiceInbox.dialog.description")}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
          <div className="min-h-[300px] overflow-hidden rounded border">
            {!item.attachmentPath ? (
              <p className="p-4 text-sm text-muted-foreground">{t("invoiceInbox.dialog.noAttachment")}</p>
            ) : isImage ? (
              <img src={fileUrl} alt={t("invoiceInbox.dialog.previewTitle")} className="h-full w-full object-contain" />
            ) : (
              <iframe src={fileUrl} title={t("invoiceInbox.dialog.previewTitle")} className="h-full w-full border-0" />
            )}
          </div>

          <div className="space-y-4 overflow-y-auto pr-1">
            {item.errorMessage && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{t("invoiceInbox.dialog.appMessage", { message: item.errorMessage })}</div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="inbox-vendor">{t("invoiceInbox.dialog.vendor")}</Label>
                <Input id="inbox-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <Label htmlFor="inbox-number">{t("invoiceInbox.dialog.invoiceNumber")}</Label>
                <Input id="inbox-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <Label htmlFor="inbox-date">{t("invoiceInbox.dialog.invoiceDate")}</Label>
                <Input id="inbox-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={readOnly} />
              </div>
            </div>

            <div>
              {/* M9: the trigger is a button, so the label is tied to it by id. */}
              <Label id="inbox-vehicle-label">{t("invoiceInbox.dialog.vehicle")}</Label>
              <VehicleSelector
                vehicles={vehicles} value={vehicleId} onChange={setVehicleId}
                placeholder={t("invoiceInbox.dialog.vehiclePlaceholder")} disabled={readOnly} className="w-full"
                ariaLabelledBy="inbox-vehicle-label" data-testid="select-inbox-vehicle"
              />
              {(item.parsed?.plates?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{t("invoiceInbox.dialog.platesFound", { plates: item.parsed!.plates!.join(", ") })}</p>
              )}
            </div>

            {readOnly ? (
              <ul className="space-y-1 text-sm">
                {lines.map((line, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b py-1">
                    <span>{line.description} · {formatExpenseCategory(line.category)}</span>
                    <span>{formatCurrency(line.amount)}</span>
                  </li>
                ))}
                {item.note && <li className="pt-2 text-muted-foreground">{item.note}</li>}
              </ul>
            ) : (
              <>
                <InvoiceLineItemsTable items={lines} selected={selected} onItemsChange={setLines} onSelectedChange={setSelected} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setLines([...lines, { description: "", amount: 0, category: "other" }]); setSelected(new Set([...Array.from(selected), lines.length])); }}
                    data-testid="button-inbox-add-line"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />{t("invoiceInbox.dialog.addLine")}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Switch id="inbox-group" checked={groupByCategory} onCheckedChange={setGroupByCategory} />
                    <Label htmlFor="inbox-group" className="text-sm">{t("invoiceInbox.dialog.groupByCategory")}</Label>
                  </div>
                </div>
                <div>
                  <Label htmlFor="inbox-note">{t("invoiceInbox.dialog.dismissNote")}</Label>
                  <Input id="inbox-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                </div>
                {canTrustSender && item.fromAddress && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                    <span>{item.fromAddress}<span className="block text-xs text-muted-foreground">{t("invoiceInbox.dialog.trustSenderHint")}</span></span>
                    <Button variant="outline" size="sm" onClick={() => trust.mutate()} disabled={trust.isPending || trust.isSuccess} data-testid="button-inbox-trust-sender">
                      {trust.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.dialog.trustSender")}
                    </Button>
                  </div>
                )}
                <div className="flex justify-between gap-2 border-t pt-4">
                  <Button variant="outline" onClick={() => rescan.mutate()} disabled={rescan.isPending || !item.attachmentPath} data-testid="button-inbox-rescan">
                    {rescan.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.dialog.rescan")}
                  </Button>
                  <Button variant="outline" onClick={() => dismiss.mutate()} disabled={dismiss.isPending || book.isPending} data-testid="button-inbox-dismiss">
                    {dismiss.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.dialog.dismiss")}
                  </Button>
                  <Button onClick={() => book.mutate()} disabled={!canBook || book.isPending || dismiss.isPending} data-testid="button-inbox-book">
                    {book.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.dialog.book")}
                  </Button>
                </div>
                {blockedBy && (
                  <p className="text-right text-sm text-amber-700" data-testid="text-inbox-book-blocked">{t(`invoiceInbox.dialog.bookBlocked.${blockedBy}`)}</p>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
