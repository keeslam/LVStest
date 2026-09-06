import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import type { PortalFineDto } from "@shared/fines";
import { PortalRequestType, REQUEST_NEEDS, type PortalRequestTypeValue } from "@shared/portal-requests";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { btnPrimary } from "./ui";

export function RequestForm({ initialType, reservationId: initialReservation, fineId: initialFine, onSubmitted }: { initialType?: PortalRequestTypeValue; reservationId?: number; fineId?: number; onSubmitted: (id: number) => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const { me } = usePortalAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<PortalRequestTypeValue>(initialType ?? PortalRequestType.OTHER);
  const [reservationId, setReservationId] = useState(initialReservation ? String(initialReservation) : "");
  const [fineId, setFineId] = useState(initialFine ? String(initialFine) : "");
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const needs = REQUEST_NEEDS[type];
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: needs === "reservation" });
  const { data: fines = [] } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: needs === "fine" });
  const openReservations = reservations.filter((r) => r.status === "booked" || r.status === "picked_up");

  const submit = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append("type", type);
      body.append("message", message);
      body.append("payload", JSON.stringify(payload));
      if (needs === "reservation") body.append("reservationId", reservationId);
      if (needs === "fine") body.append("fineId", fineId);
      files.slice(0, 5).forEach((f) => body.append("attachments", f));
      return portalFetch<{ id: number }>("POST", "/api/portal/requests", body);
    },
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/requests"] });
      toast({ title: t("requests.submitted") });
      onSubmitted(r.id);
    },
    onError: (e) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`, { defaultValue: (e as Error).message }), variant: "destructive" }),
  });
  const setP = (k: string) => (e: ChangeEvent<HTMLInputElement>) => setPayload({ ...payload, [k]: e.target.value });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (files.length > 5) { toast({ title: t("errors.PORTAL_ATTACHMENT_LIMIT"), variant: "destructive" }); return; }
    submit.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="portal-request-form">
      <div>
        <Label htmlFor="rq-type">{t("requests.chooseType")}</Label>
        <select id="rq-type" className="w-full rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => { setType(e.target.value as PortalRequestTypeValue); setPayload({}); }}>
          {Object.values(PortalRequestType).filter((v) => v !== "early_return" || me?.settings.canReturn).map((v) => <option key={v} value={v}>{t(`requests.type.${v}`)}</option>)}
        </select>
      </div>
      {needs === "reservation" && (
        <div>
          <Label htmlFor="rq-res">{t("requests.form.reservation")}</Label>
          <select id="rq-res" className="w-full rounded-md border px-3 py-2 text-sm" value={reservationId} onChange={(e) => setReservationId(e.target.value)} required>
            <option value="">—</option>
            {openReservations.map((r) => (
              <option key={r.id} value={r.id}>#{r.id} {r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model} ${r.vehicle.licensePlate}` : ""} {r.startDate} – {r.endDate ?? "…"}</option>
            ))}
          </select>
        </div>
      )}
      {needs === "fine" && (
        <div>
          <Label htmlFor="rq-fine">{t("requests.form.fine")}</Label>
          <select id="rq-fine" className="w-full rounded-md border px-3 py-2 text-sm" value={fineId} onChange={(e) => setFineId(e.target.value)} required>
            <option value="">—</option>
            {fines.map((f) => <option key={f.id} value={f.id}>#{f.id} {f.licensePlate} {new Date(f.offenceAt).toLocaleDateString()} € {f.totalAmount}</option>)}
          </select>
        </div>
      )}
      {type === "extension" && <div><Label htmlFor="rq-end">{t("requests.form.newEndDate")}</Label><Input id="rq-end" type="date" value={payload.newEndDate ?? ""} onChange={setP("newEndDate")} required /></div>}
      {type === "early_return" && <div><Label htmlFor="rq-ret">{t("requests.form.returnDate")}</Label><Input id="rq-ret" type="date" value={payload.returnDate ?? ""} onChange={setP("returnDate")} required /></div>}
      {type === "damage" && (
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="rq-loc">{t("requests.form.location")}</Label><Input id="rq-loc" value={payload.location ?? ""} onChange={setP("location")} /></div>
          <div><Label htmlFor="rq-when">{t("requests.form.occurredAt")}</Label><Input id="rq-when" value={payload.occurredAt ?? ""} onChange={setP("occurredAt")} /></div>
        </div>
      )}
      {type === "other" && <div><Label htmlFor="rq-subj">{t("requests.form.subject")}</Label><Input id="rq-subj" value={payload.subject ?? ""} onChange={setP("subject")} required /></div>}
      <div><Label htmlFor="rq-msg">{t("requests.form.message")}</Label><Textarea id="rq-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required /></div>
      <div><Label htmlFor="rq-files">{t("requests.form.photos")}</Label><Input id="rq-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></div>
      <Button type="submit" className={btnPrimary} disabled={submit.isPending} data-testid="button-submit-request">{t("requests.form.send")}</Button>
    </form>
  );
}
