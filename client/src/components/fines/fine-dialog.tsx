import { formatDateTime, formatLicensePlate, formatCurrency } from "@/lib/format-utils";
import { describeApiError } from "@/lib/api-error";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useFilePreview } from "@/components/documents/use-file-preview";
import { UserPermission, type Customer, type Driver } from "@shared/schema";
import { useHasPermission } from "@/hooks/use-has-permission";
import { FINE_TRANSITIONS, type FineStatusValue } from "@shared/fines";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FineStatusBadge } from "./fine-status-badge";
import { CustomerSearchPicker } from "@/components/customers/customer-search-picker";
import { SearchListPicker } from "@/components/ui/search-list-picker";
import { useCanManageFines, type FineRow } from "./fines-table";

interface Candidate { id: number; customerId: number | null; customerName: string | null; startDate: string; endDate: string | null; driverId: number | null; driverName: string | null }
type FineDetail = FineRow & {
  reference: string | null; receivedAt: string | null; letterFilePath: string | null; internalNotes: string | null; customerNote: string | null;
  source?: string | null; importFileId?: number | null;
  invoiceReference: string | null; linkedBy: string | null; linkedAt: string | null; driverId: number | null;
  /** B-41 D10: when "Klant informeren" last mailed the customer; and, for managers on a linked fine, the address it would go to (null = none known). */
  customerNotifiedAt?: string | null; notifyAddress?: string | null;
  candidates?: { covering: Candidate[]; near: Candidate[] };
  /** B-64: plate or moment were corrected and the linked reservation did not have the car then. */
  linkMismatch?: boolean;
};

/** The browser's own clock, the same way the new-fine form reads its datetime-local field. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** View/edit one fine: attribution picker while `new`, status actions afterwards. Driven by GlobalDialogContext. */
export function FineDialog() {
  const { t } = useTranslation("portal");
  const preview = useFilePreview();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { dialogState, closeFineDialog, openCustomerDialog, openReservationDialog } = useGlobalDialog();
  const canManage = useCanManageFines();
  const id = dialogState.fine.id;
  const open = dialogState.fine.open && id !== null;
  const key = ["/api/fines", id];
  const { data: fine } = useQuery<FineDetail>({ queryKey: key, queryFn: async () => (await apiRequest("GET", `/api/fines/${id}`)).json(), enabled: open });

  const [edit, setEdit] = useState({ licensePlate: "", offenceAt: "", description: "", amount: "", adminFee: "", reference: "", internalNotes: "", customerNote: "" });
  const [pick, setPick] = useState({ customerId: "", reservationId: "", driverId: "" });
  // A-19-6 / A-12-6: the delete asks in our own dialog (window.confirm is ignored by the built-in browser), naming plate and amount.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A-12-5: "Bekeuring annuleren" cancels the FINE, so it asks first; closing the dialog is a separate "Sluiten".
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  useEffect(() => {
    if (fine) setEdit({ licensePlate: fine.licensePlate, offenceAt: toLocalInput(fine.offenceAt), description: fine.description, amount: fine.amount, adminFee: fine.adminFee, reference: fine.reference ?? "", internalNotes: fine.internalNotes ?? "", customerNote: fine.customerNote ?? "" });
  }, [fine]);
  // Linking a fine to a customer reads the customer list (and a customer's drivers): view_customers or
  // manage_customers. A view_fines-only account on the Bekeuringen screen must not fire those requests,
  // or the refused answer shows the red "Kon de gegevens niet laden" toast.
  const canListCustomers = useHasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS);
  const canPickCustomer = canManage && canListCustomers;
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open && fine?.status === "new" && canPickCustomer });
  const { data: drivers = [] } = useQuery<Driver[]>({ queryKey: [`/api/customers/${pick.customerId}/drivers`], enabled: open && pick.customerId !== "" && canPickCustomer });

  const done = () => { queryClient.invalidateQueries({ queryKey: key }); invalidateByPrefix("/api/fines"); };
  // A-12-8: every action names what it did ("gekoppeld", "ontkoppeld", ...) instead of the save text.
  type Outcome = "saved" | "linked" | "unlinked" | "cancelled" | "reactivated" | "reattributed";
  const call = useMutation({
    mutationFn: async ({ method, url, body }: { method: string; url: string; body?: unknown; outcome: Outcome }) => (await apiRequest(method, url, body)).json(),
    onSuccess: (_data, { outcome }) => { done(); toast({ title: t(`admin.fines.dialog.outcome.${outcome}`) }); },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });
  // B-41 D10: nothing is mailed on create, import or link; this button is the one way the customer is told.
  const [confirmingNotify, setConfirmingNotify] = useState(false);
  type NotifyAnswer = { sent: boolean; reason?: "NO_CUSTOMER" | "NO_EMAIL" | "PORTAL_DISABLED" | "MAIL_FAILED" };
  const notify = useMutation({
    mutationFn: async (): Promise<NotifyAnswer> => (await apiRequest("POST", `/api/fines/${id}/notify-customer`)).json(),
    onSuccess: (answer) => {
      done();
      if (answer.sent) toast({ title: t("admin.fines.dialog.outcome.informed") });
      else toast({ title: t(`admin.fines.dialog.notifyReason.${answer.reason ?? "MAIL_FAILED"}`), variant: "destructive" });
    },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });
  const closed = fine?.status === "cancelled";
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/fines/${id}`),
    onSuccess: () => { invalidateByPrefix("/api/fines"); invalidateByPrefix("/api/portal-admin"); invalidateByPrefix("/api/deleted-records"); toast({ title: t("admin.fines.dialog.deleted") }); closeFineDialog(); },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });
  const allowed = fine ? (FINE_TRANSITIONS[fine.status as FineStatusValue] ?? []) : [];
  const setStatus = (status: string, outcome: Outcome) => call.mutate({ method: "POST", url: `/api/fines/${id}/status`, body: { status }, outcome });
  const choose = (c: Candidate) => setPick({ customerId: String(c.customerId ?? ""), reservationId: String(c.id), driverId: c.driverId ? String(c.driverId) : "" });
  const disabled = !canManage || closed;
  // Unsaved typing in the detail: Escape, the X and "Sluiten" ask before throwing it away (same hook as the other forms).
  const plateChanged = !!fine && edit.licensePlate.trim() !== "" && edit.licensePlate.trim().toUpperCase() !== fine.licensePlate.toUpperCase();
  const momentChanged = !!fine && edit.offenceAt !== "" && edit.offenceAt !== toLocalInput(fine.offenceAt);
  const dirty = !!fine && (plateChanged || momentChanged || edit.description !== fine.description || edit.amount !== fine.amount || edit.reference !== (fine.reference ?? "")
    || edit.internalNotes !== (fine.internalNotes ?? "") || edit.customerNote !== (fine.customerNote ?? ""));
  const guard = useUnsavedChangesGuard({ close: closeFineDialog });
  // Plate and moment only go along when they changed, so a plain save never triggers a new link.
  const saveBody = () => {
    const { licensePlate, offenceAt, ...rest } = edit;
    return {
      ...rest, amount: Number(edit.amount), adminFee: Number(edit.adminFee),
      ...(plateChanged ? { licensePlate: licensePlate.trim() } : {}),
      ...(momentChanged ? { offenceAt: new Date(offenceAt).toISOString() } : {}),
    };
  };
  useEffect(() => { guard.setDirty(dirty); }, [dirty, guard.setDirty]);

  if (!open) return null;
  return (<>
    {preview.dialog}
    <Dialog open={open} onOpenChange={guard.onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{t("admin.fines.dialog.title", { id })} {fine && <FineStatusBadge status={fine.status} />}</DialogTitle>
          <DialogDescription className="sr-only">{t("admin.fines.dialog.description")}</DialogDescription>
          {fine?.source === "cjib" && <p className="text-xs text-muted-foreground" data-testid="fine-source">{t("admin.fines.cjib.sourceLine", { file: fine.importFileId ?? "?" })}</p>}
        </DialogHeader>
        {fine && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* B-64: plate and moment can be corrected; a fine without a customer is linked again on save. */}
              <div><Label htmlFor="fd-plate">{t("admin.fines.fields.plate")}</Label><Input id="fd-plate" className="font-mono uppercase" value={edit.licensePlate} disabled={disabled} onChange={(e) => setEdit({ ...edit, licensePlate: e.target.value })} data-testid="input-fine-plate" /></div>
              <div><Label htmlFor="fd-at">{t("admin.fines.fields.offenceAt")}</Label><Input id="fd-at" type="datetime-local" value={edit.offenceAt} disabled={disabled} onChange={(e) => setEdit({ ...edit, offenceAt: e.target.value })} data-testid="input-fine-offence-at" /></div>
              <div><Label htmlFor="fd-desc">{t("admin.fines.fields.description")}</Label><Input id="fd-desc" value={edit.description} disabled={disabled} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div><Label htmlFor="fd-ref">{t("admin.fines.fields.reference")}</Label><Input id="fd-ref" value={edit.reference} disabled={disabled} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></div>
              <div><Label htmlFor="fd-amount">{t("admin.fines.fields.amount")}</Label><Input id="fd-amount" type="number" step="0.01" value={edit.amount} disabled={disabled} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></div>
              {/* A-12-11: the list shows the total, so the detail says what it is made of. */}
              <div><Label>{t("admin.fines.fields.adminFee")}</Label><div data-testid="fine-admin-fee">{formatCurrency(fine.adminFee)}</div></div>
              <div><Label>{t("admin.fines.fields.total")}</Label><div className="font-medium" data-testid="fine-total">{formatCurrency(fine.totalAmount)}</div></div>
              <div><Label htmlFor="fd-cn">{t("admin.fines.fields.customerNote")}</Label><Textarea id="fd-cn" rows={2} value={edit.customerNote} disabled={disabled} onChange={(e) => setEdit({ ...edit, customerNote: e.target.value })} /></div>
              <div><Label htmlFor="fd-in">{t("admin.fines.fields.internalNotes")}</Label><Textarea id="fd-in" rows={2} value={edit.internalNotes} disabled={disabled} onChange={(e) => setEdit({ ...edit, internalNotes: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {fine.customerId && <Button size="sm" variant="link" className="px-0" onClick={() => openCustomerDialog(fine.customerId!, "portal")}>{t("admin.fines.dialog.openCustomer")}: {fine.customerName}</Button>}
              {fine.reservationId && <Button size="sm" variant="link" className="px-0" onClick={() => openReservationDialog(fine.reservationId!)}>{t("admin.fines.dialog.openReservation")} #{fine.reservationId}</Button>}
              {fine.driverName && <span>· {fine.driverName}</span>}
              {fine.customerNotifiedAt && <span className="text-muted-foreground" data-testid="fine-notified-at">· {t("admin.fines.dialog.notifiedAt", { at: formatDateTime(fine.customerNotifiedAt) })}</span>}
              {fine.linkedBy && <span className="text-muted-foreground">· {t("admin.fines.dialog.linkedBy", { by: fine.linkedBy, at: fine.linkedAt ? formatDateTime(fine.linkedAt) : "" })}</span>}
              {fine.letterFilePath && <Button size="sm" variant="outline" onClick={() => preview.open(`/api/fines/${id}/letter`, t("admin.fines.dialog.viewLetter"))} data-testid="button-view-letter">{t("admin.fines.dialog.viewLetter")}</Button>}
            </div>

            {fine.linkMismatch && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2" data-testid="fine-link-mismatch">
                <p>{t("admin.fines.dialog.linkMismatch", { id: fine.reservationId })}</p>
                {canManage && allowed.includes("new") && (
                  <Button size="sm" variant="outline" disabled={call.isPending} data-testid="button-reattribute-fine"
                    onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/reattribute`, outcome: "reattributed" })}>
                    {t("admin.fines.dialog.reattribute")}
                  </Button>
                )}
              </div>
            )}

            {fine.status === "new" && canManage && (
              <div className="rounded-md border p-3 space-y-2" data-testid="fine-link-panel">
                <p className="text-sm">{t("admin.fines.dialog.notLinked")}</p>
                {fine.candidates && fine.candidates.covering.length > 0 && (<>
                  <p className="text-xs font-medium">{t("admin.fines.dialog.covering")}</p>
                  <div className="flex flex-wrap gap-1">
                    {fine.candidates.covering.map((c) => <Button key={c.id} size="sm" variant={pick.reservationId === String(c.id) ? "default" : "outline"} onClick={() => choose(c)}>#{c.id} {c.customerName} {c.startDate}–{c.endDate ?? "…"}{c.driverName ? ` · ${c.driverName}` : ""}</Button>)}
                  </div>
                </>)}
                {fine.candidates && fine.candidates.near.length > 0 && (<>
                  <p className="text-xs font-medium">{t("admin.fines.dialog.near")}</p>
                  <div className="flex flex-wrap gap-1">
                    {fine.candidates.near.map((c) => <Button key={c.id} size="sm" variant={pick.reservationId === String(c.id) ? "default" : "outline"} onClick={() => choose(c)}>#{c.id} {c.customerName} {c.startDate}–{c.endDate ?? "…"}</Button>)}
                  </div>
                </>)}
                {fine.candidates && fine.candidates.covering.length + fine.candidates.near.length === 0 && <p className="text-xs text-muted-foreground">{t("admin.fines.dialog.noCandidates")}</p>}
                {!canPickCustomer ? (
                  <p className="text-xs text-muted-foreground" data-testid="fine-no-customer-right">{t("admin.fines.dialog.noCustomerRight")}</p>
                ) : (<>
                <div className="space-y-3">
                  <div>
                    <Label>{t("admin.fines.dialog.chooseCustomer")}</Label>
                    <CustomerSearchPicker customers={customers} value={pick.customerId ? Number(pick.customerId) : null}
                      onChange={(cid) => setPick({ customerId: cid ? String(cid) : "", reservationId: "", driverId: "" })}
                      searchPlaceholder={t("admin.fines.dialog.searchCustomer")} emptyText={t("admin.fines.dialog.noCustomer")} changeLabel={t("admin.fines.dialog.changeCustomer")}
                      hintText={(shown, total) => t("admin.fines.dialog.moreCustomers", { shown, total })} />
                  </div>
                  {pick.customerId && (
                    <div>
                      <Label htmlFor="fd-drv">{t("admin.fines.dialog.chooseDriver")}</Label>
                      <SearchListPicker items={drivers.map((d) => ({ id: d.id, label: d.displayName, sub: d.status === "inactive" ? t("admin.accounts.status.blocked") : null, search: `${d.firstName ?? ""} ${d.lastName ?? ""} ${d.email ?? ""}` }))}
                        value={pick.driverId ? Number(pick.driverId) : null} onChange={(did) => setPick({ ...pick, driverId: did ? String(did) : "" })}
                        searchPlaceholder={t("admin.fines.dialog.searchDriver")} emptyText={t("admin.fines.dialog.noDriver")} changeLabel={t("admin.fines.dialog.changeCustomer")}
                        hintText={(shown, total) => t("admin.fines.dialog.moreCustomers", { shown, total })} searchFrom={6} testId="fine-driver-picker" />
                    </div>
                  )}
                </div>
                <Button size="sm" disabled={!pick.customerId || call.isPending} data-testid="button-link-fine"
                  onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/link`, body: { customerId: Number(pick.customerId), reservationId: pick.reservationId ? Number(pick.reservationId) : null, driverId: pick.driverId ? Number(pick.driverId) : null }, outcome: "linked" })}>
                  {t("admin.fines.dialog.link")}
                </Button>
                </>)}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t pt-3">
              {/* Closes the dialog and nothing else: the fine itself is left as it is (A-12-5). */}
              <Button size="sm" variant="outline" onClick={guard.requestClose} data-testid="button-close-fine">{t("common:actions.close")}</Button>
              {canManage && (<>
                {!closed && <Button size="sm" data-testid="button-save-fine-detail" onClick={() => call.mutate({ method: "PATCH", url: `/api/fines/${id}`, body: saveBody(), outcome: "saved" })}>{t("admin.fines.dialog.save")}</Button>}
                {fine.status === "linked" && fine.customerId && (
                  <Button size="sm" variant="outline" disabled={notify.isPending} onClick={() => setConfirmingNotify(true)} data-testid="button-notify-customer">
                    {fine.customerNotifiedAt ? t("admin.fines.dialog.notifyAgain") : t("admin.fines.dialog.notifyCustomer")}
                  </Button>
                )}
                {allowed.includes("new") && fine.status !== "cancelled" && <Button size="sm" variant="outline" data-testid="button-unlink-fine" onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/unlink`, outcome: "unlinked" })}>{t("admin.fines.dialog.unlink")}</Button>}
                {allowed.includes("linked") && ["disputed", "charged", "paid"].includes(fine.status) && <Button size="sm" variant="outline" onClick={() => setStatus("linked", "linked")}>{t("admin.fines.dialog.link")}</Button>}
                {allowed.includes("cancelled") && <Button size="sm" variant="destructive" onClick={() => setConfirmingCancel(true)} data-testid="button-cancel-fine">{t("admin.fines.dialog.cancelFine")}</Button>}
                {fine.status === "cancelled" && <Button size="sm" onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/reactivate`, outcome: "reactivated" })} data-testid="button-reactivate-fine">{t("admin.fines.dialog.reactivate")}</Button>}
                <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={remove.isPending}
                  onClick={() => setConfirmingDelete(true)} data-testid="button-delete-fine">
                  {t("admin.fines.dialog.delete")}
                </Button>
              </>)}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    <ConfirmDialog {...guard.confirmProps} />
    {fine && (
      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title={t("admin.fines.dialog.cancelTitle")}
        description={t("admin.fines.dialog.cancelConfirmNamed", { plate: formatLicensePlate(fine.licensePlate), amount: formatCurrency(fine.totalAmount ?? fine.amount) })}
        confirmLabel={t("admin.fines.dialog.cancelFine")}
        cancelLabel={t("admin.fines.dialog.cancelKeep")}
        confirmTestId="button-confirm-cancel-fine"
        onConfirm={() => setStatus("cancelled", "cancelled")}
      />
    )}
    {fine && (
      <ConfirmDialog
        open={confirmingNotify}
        onOpenChange={setConfirmingNotify}
        variant="info"
        title={t("admin.fines.dialog.notifyTitle")}
        description={t(fine.customerNotifiedAt ? "admin.fines.dialog.notifyConfirmAgain" : "admin.fines.dialog.notifyConfirm", {
          plate: formatLicensePlate(fine.licensePlate), amount: formatCurrency(fine.totalAmount ?? fine.amount),
          address: fine.notifyAddress || t("admin.fines.dialog.notifyNoAddress"), at: fine.customerNotifiedAt ? formatDateTime(fine.customerNotifiedAt) : "",
        })}
        confirmLabel={fine.customerNotifiedAt ? t("admin.fines.dialog.notifyAgain") : t("admin.fines.dialog.notifyCustomer")}
        cancelLabel={t("admin.fines.dialog.notifyKeep")}
        confirmTestId="button-confirm-notify-customer"
        onConfirm={() => notify.mutate()}
      />
    )}
    {fine && (
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("admin.fines.dialog.deleteTitle")}
        description={t("admin.fines.dialog.deleteConfirmNamed", { plate: formatLicensePlate(fine.licensePlate), amount: formatCurrency(fine.totalAmount ?? fine.amount) })}
        confirmLabel={t("admin.fines.dialog.deleteConfirmButton")}
        confirmTestId="button-confirm-delete-fine"
        onConfirm={() => remove.mutate()}
      />
    )}
  </>);
}
