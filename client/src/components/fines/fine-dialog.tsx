import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Customer, Driver } from "@shared/schema";
import { FINE_TRANSITIONS, type FineStatusValue } from "@shared/fines";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FineStatusBadge } from "./fine-status-badge";
import { CustomerSearchPicker } from "@/components/customers/customer-search-picker";
import { useCanManageFines, type FineRow } from "./fines-table";

interface Candidate { id: number; customerId: number | null; customerName: string | null; startDate: string; endDate: string | null; driverId: number | null; driverName: string | null }
type FineDetail = FineRow & {
  reference: string | null; receivedAt: string | null; letterFilePath: string | null; internalNotes: string | null; customerNote: string | null;
  source?: string | null; importFileId?: number | null;
  invoiceReference: string | null; linkedBy: string | null; linkedAt: string | null; driverId: number | null;
  candidates?: { covering: Candidate[]; near: Candidate[] };
};

/** View/edit one fine: attribution picker while `new`, status actions afterwards. Driven by GlobalDialogContext. */
export function FineDialog() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { dialogState, closeFineDialog, openCustomerDialog, openReservationDialog } = useGlobalDialog();
  const canManage = useCanManageFines();
  const id = dialogState.fine.id;
  const open = dialogState.fine.open && id !== null;
  const key = ["/api/fines", id];
  const { data: fine } = useQuery<FineDetail>({ queryKey: key, queryFn: async () => (await apiRequest("GET", `/api/fines/${id}`)).json(), enabled: open });

  const [edit, setEdit] = useState({ description: "", amount: "", adminFee: "", reference: "", internalNotes: "", customerNote: "" });
  const [pick, setPick] = useState({ customerId: "", reservationId: "", driverId: "" });
  useEffect(() => {
    if (fine) setEdit({ description: fine.description, amount: fine.amount, adminFee: fine.adminFee, reference: fine.reference ?? "", internalNotes: fine.internalNotes ?? "", customerNote: fine.customerNote ?? "" });
  }, [fine]);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open && fine?.status === "new" });
  const { data: drivers = [] } = useQuery<Driver[]>({ queryKey: [`/api/customers/${pick.customerId}/drivers`], enabled: open && pick.customerId !== "" });

  const done = () => { queryClient.invalidateQueries({ queryKey: key }); invalidateByPrefix("/api/fines"); };
  const call = useMutation({
    mutationFn: async ({ method, url, body }: { method: string; url: string; body?: unknown }) => (await apiRequest(method, url, body)).json(),
    onSuccess: () => { done(); toast({ title: t("admin.fines.dialog.saved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const closed = fine?.status === "paid" || fine?.status === "cancelled";
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/fines/${id}`),
    onSuccess: () => { invalidateByPrefix("/api/fines"); invalidateByPrefix("/api/portal-admin"); invalidateByPrefix("/api/deleted-records"); toast({ title: t("admin.fines.dialog.deleted") }); closeFineDialog(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const allowed = fine ? (FINE_TRANSITIONS[fine.status as FineStatusValue] ?? []) : [];
  const setStatus = (status: string) => {
    const invoiceReference = status === "charged" ? window.prompt(t("admin.fines.fields.invoiceReference")) ?? undefined : undefined;
    call.mutate({ method: "POST", url: `/api/fines/${id}/status`, body: { status, invoiceReference } });
  };
  const choose = (c: Candidate) => setPick({ customerId: String(c.customerId ?? ""), reservationId: String(c.id), driverId: c.driverId ? String(c.driverId) : "" });
  const disabled = !canManage || closed;

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeFineDialog()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{t("admin.fines.dialog.title", { id })} {fine && <FineStatusBadge status={fine.status} />}</DialogTitle>
          {fine?.source === "cjib" && <p className="text-xs text-muted-foreground" data-testid="fine-source">{t("admin.fines.cjib.sourceLine", { file: fine.importFileId ?? "?" })}</p>}
        </DialogHeader>
        {fine && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><Label>{t("admin.fines.fields.plate")}</Label><div className="font-mono">{fine.licensePlate}</div></div>
              <div><Label>{t("admin.fines.fields.offenceAt")}</Label><div>{new Date(fine.offenceAt).toLocaleString()}</div></div>
              <div><Label htmlFor="fd-desc">{t("admin.fines.fields.description")}</Label><Input id="fd-desc" value={edit.description} disabled={disabled} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div><Label htmlFor="fd-ref">{t("admin.fines.fields.reference")}</Label><Input id="fd-ref" value={edit.reference} disabled={disabled} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></div>
              <div><Label htmlFor="fd-amount">{t("admin.fines.fields.amount")}</Label><Input id="fd-amount" type="number" step="0.01" value={edit.amount} disabled={disabled} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></div>
              <div><Label htmlFor="fd-fee">{t("admin.fines.fields.adminFee")}</Label><Input id="fd-fee" type="number" step="0.01" value={edit.adminFee} disabled={disabled} onChange={(e) => setEdit({ ...edit, adminFee: e.target.value })} /></div>
              <div><Label htmlFor="fd-cn">{t("admin.fines.fields.customerNote")}</Label><Textarea id="fd-cn" rows={2} value={edit.customerNote} disabled={disabled} onChange={(e) => setEdit({ ...edit, customerNote: e.target.value })} /></div>
              <div><Label htmlFor="fd-in">{t("admin.fines.fields.internalNotes")}</Label><Textarea id="fd-in" rows={2} value={edit.internalNotes} disabled={disabled} onChange={(e) => setEdit({ ...edit, internalNotes: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {fine.customerId && <Button size="sm" variant="link" className="px-0" onClick={() => openCustomerDialog(fine.customerId!, "portal")}>{t("admin.fines.dialog.openCustomer")}: {fine.customerName}</Button>}
              {fine.reservationId && <Button size="sm" variant="link" className="px-0" onClick={() => openReservationDialog(fine.reservationId!)}>{t("admin.fines.dialog.openReservation")} #{fine.reservationId}</Button>}
              {fine.driverName && <span>· {fine.driverName}</span>}
              {fine.linkedBy && <span className="text-muted-foreground">· {t("admin.fines.dialog.linkedBy", { by: fine.linkedBy, at: fine.linkedAt ? new Date(fine.linkedAt).toLocaleString() : "" })}</span>}
              {fine.letterFilePath && <Button asChild size="sm" variant="outline"><a href={`/api/fines/${id}/letter`} target="_blank" rel="noopener">{t("admin.fines.dialog.viewLetter")}</a></Button>}
            </div>

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
                      <select id="fd-drv" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={pick.driverId} onChange={(e) => setPick({ ...pick, driverId: e.target.value })} data-testid="select-fine-driver">
                        <option value="">{t("admin.fines.dialog.pickDriver")}</option>
                        {drivers.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <Button size="sm" disabled={!pick.customerId || call.isPending} data-testid="button-link-fine"
                  onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/link`, body: { customerId: Number(pick.customerId), reservationId: pick.reservationId ? Number(pick.reservationId) : null, driverId: pick.driverId ? Number(pick.driverId) : null } })}>
                  {t("admin.fines.dialog.link")}
                </Button>
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {!closed && <Button size="sm" onClick={() => call.mutate({ method: "PATCH", url: `/api/fines/${id}`, body: { ...edit, amount: Number(edit.amount), adminFee: Number(edit.adminFee) } })}>{t("admin.fines.dialog.save")}</Button>}
                {allowed.includes("new") && fine.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/unlink` })}>{t("admin.fines.dialog.unlink")}</Button>}
                {allowed.includes("charged") && <Button size="sm" variant="outline" onClick={() => setStatus("charged")} data-testid="button-charge-fine">{t("admin.fines.dialog.charge")}</Button>}
                {allowed.includes("paid") && <Button size="sm" variant="outline" onClick={() => setStatus("paid")}>{t("admin.fines.dialog.paid")}</Button>}
                {allowed.includes("disputed") && <Button size="sm" variant="outline" onClick={() => setStatus("disputed")}>{t("admin.fines.dialog.dispute")}</Button>}
                {allowed.includes("linked") && fine.status === "disputed" && <Button size="sm" variant="outline" onClick={() => setStatus("linked")}>{t("admin.fines.dialog.link")}</Button>}
                {allowed.includes("cancelled") && <Button size="sm" variant="destructive" onClick={() => setStatus("cancelled")}>{t("admin.fines.dialog.cancel")}</Button>}
                {fine.status === "cancelled" && <Button size="sm" onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/reactivate` })} data-testid="button-reactivate-fine">{t("admin.fines.dialog.reactivate")}</Button>}
                {fine.status === "paid" && <span className="text-sm text-muted-foreground">{t("admin.fines.dialog.closed")}</span>}
                <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={remove.isPending}
                  onClick={() => { if (window.confirm(t("admin.fines.dialog.deleteConfirm"))) remove.mutate(); }} data-testid="button-delete-fine">
                  {t("admin.fines.dialog.delete")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
