import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto, PortalVehicleDto, PortalDriverDto } from "@shared/portal-types";
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
import { PeriodPicker, TimeSelect } from "./period-picker";
import { ReservationPicker } from "./reservation-picker";
import { formatPortalDate } from "./reservation-card";

const tomorrowIso = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

export function RequestForm({ initialType, reservationId: initialReservation, fineId: initialFine, vehicleId: initialVehicle, startDate: initialStart, endDate: initialEnd, blockId, blockDate, onSubmitted }: { initialType?: PortalRequestTypeValue; reservationId?: number; fineId?: number; vehicleId?: number; startDate?: string; endDate?: string; blockId?: number; blockDate?: string; onSubmitted: (id: number) => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const { me } = usePortalAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<PortalRequestTypeValue>(initialType ?? PortalRequestType.OTHER);
  const [reservationId, setReservationId] = useState(initialReservation ? String(initialReservation) : blockId ? String(blockId) : "");
  const [fineId, setFineId] = useState(initialFine ? String(initialFine) : "");
  const [payload, setPayload] = useState<Record<string, string>>({
    ...(initialVehicle ? { vehicleId: String(initialVehicle) } : {}),
    ...(initialType === "booking" ? { startDate: initialStart ?? new Date().toISOString().slice(0, 10), endDate: initialEnd ?? "" } : {}),
  });
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const needs = REQUEST_NEEDS[type];
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: needs === "reservation" });
  const { data: fines = [] } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: needs === "fine" });
  const periodOk = /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate ?? "") && (!payload.endDate || payload.endDate >= payload.startDate);
  const vehiclesUrl = `/api/portal/vehicles?start=${payload.startDate ?? ""}&end=${payload.endDate ?? ""}`;
  const { data: vehicles = [], isFetching: loadingVehicles } = useQuery<PortalVehicleDto[]>({ queryKey: ["portal", vehiclesUrl], queryFn: portalQueryFn, enabled: type === "booking" && periodOk && Boolean(me?.settings.canBook) });
  const canPickDriver = me?.role === "admin" && Boolean(me.settings.canManageDrivers);
  const { data: drivers = [] } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn, enabled: type === "booking" && canPickDriver });
  const openReservations = reservations.filter((r) => r.status === "booked" || r.status === "picked_up");
  const chosen = reservations.find((r) => String(r.id) === reservationId);
  /** Extension: days × the vehicle's day price, only when prices are shown and the new date is later. */
  const extensionEstimate = (() => {
    if (type !== "extension" || !me?.settings.showPrices || !chosen?.endDate || !chosen.vehicle?.dailyPrice || !payload.newEndDate) return null;
    const days = Math.round((new Date(payload.newEndDate).getTime() - new Date(chosen.endDate).getTime()) / 86_400_000);
    if (days <= 0) return null;
    const total = days * Number(chosen.vehicle.dailyPrice);
    return { days, perDay: Number(chosen.vehicle.dailyPrice), total };
  })();
  const canBook = Boolean(me?.settings.canBook);

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
    if (needs === "reservation" && !reservationId) { toast({ title: t("requests.form.pickReservationFirst"), variant: "destructive" }); return; }
    if (type === "maintenance_change" && !payload.newDate) { toast({ title: t("requests.form.newDate"), variant: "destructive" }); return; }
    submit.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="portal-request-form">
      <div>
        <Label htmlFor="rq-type">{t("requests.chooseType")}</Label>
        <select id="rq-type" className="w-full rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => { setType(e.target.value as PortalRequestTypeValue); setPayload({}); }}>
          {Object.values(PortalRequestType).filter((v) => (v !== "early_return" || me?.settings.canReturn) && (v !== "booking" || canBook) && (v !== "maintenance_change" || type === "maintenance_change")).map((v) => <option key={v} value={v}>{t(`requests.type.${v}`)}</option>)}
        </select>
      </div>
      {type === "maintenance_change" && (
        <div className="rounded-md border bg-[#f8fafc] px-3 py-2 text-sm" data-testid="change-current-date">
          <span className="text-[#64748b]">{t("requests.form.currentMaintenanceDate")}: </span>{blockDate ? formatPortalDate(blockDate) : `#${blockId}`}
        </div>
      )}
      {needs === "reservation" && type !== "maintenance_change" && (
        <div>
          <Label>{t("requests.form.reservation")}</Label>
          <ReservationPicker reservations={openReservations} value={reservationId ? Number(reservationId) : null} onChange={(id) => setReservationId(id ? String(id) : "")} />
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
      {type === "booking" && (
        <div className="space-y-3">
          {/* Period first: the vehicle list below only shows what is free in it. */}
          <div>
            <Label htmlFor="rq-period">{t("requests.form.period")}</Label>
            <PeriodPicker id="rq-period" start={payload.startDate ?? ""} end={payload.endDate ?? ""} onChange={(startDate, endDate) => setPayload({ ...payload, startDate, endDate })} testId="request-period" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TimeSelect id="rq-stime" label={t("requests.form.pickupTime")} value={payload.startTime ?? ""} onChange={(v) => setPayload({ ...payload, startTime: v })} testId="request-start-time" />
            <TimeSelect id="rq-etime" label={t("requests.form.returnTime")} value={payload.endTime ?? ""} onChange={(v) => setPayload({ ...payload, endTime: v })} testId="request-end-time" />
          </div>
          <div>
            <Label htmlFor="rq-vehicle">{t("requests.form.vehicle")}</Label>
            <select id="rq-vehicle" className="w-full rounded-md border px-3 py-2 text-sm" value={payload.vehicleId ?? ""} onChange={(e) => setPayload({ ...payload, vehicleId: e.target.value })} required disabled={!periodOk} data-testid="select-request-vehicle">
              <option value="">{!periodOk ? t("requests.form.pickPeriodFirst") : loadingVehicles ? "…" : vehicles.length === 0 ? t("requests.form.noneFree") : "—"}</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} · {v.licensePlate}</option>)}
            </select>
            {periodOk && !loadingVehicles && payload.vehicleId && !vehicles.some((v) => String(v.id) === payload.vehicleId) && <p className="mt-1 text-xs text-[#a32d2d]">{t("requests.form.vehicleNotFree")}</p>}
          </div>
          {canPickDriver && (
            <div>
              <Label htmlFor="rq-driver">{t("requests.form.driver")}</Label>
              <select id="rq-driver" className="w-full rounded-md border px-3 py-2 text-sm" value={payload.driverId ?? ""} onChange={(e) => setPayload({ ...payload, driverId: e.target.value })} data-testid="select-request-driver">
                <option value="">{t("requests.form.driverLater")}</option>
                {drivers.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select>
            </div>
          )}
          <p className="text-xs text-[#64748b]">{t("requests.form.bookingHint")}</p>
        </div>
      )}
      {type === "extension" && (
        <div>
          <Label htmlFor="rq-end">{t("requests.form.newEndDate")}</Label>
          <Input id="rq-end" type="date" value={payload.newEndDate ?? ""} min={chosen?.endDate ?? undefined} onChange={setP("newEndDate")} required />
          {extensionEstimate && <p className="mt-1 text-xs text-[#64748b]" data-testid="extension-estimate">{t("requests.form.extensionEstimate", { days: extensionEstimate.days, perDay: extensionEstimate.perDay.toFixed(2), total: extensionEstimate.total.toFixed(2) })}</p>}
        </div>
      )}
      {type === "maintenance" && (
        <div className="space-y-2">
          <div><Label htmlFor="rq-issue">{t("requests.form.issue")}</Label><Input id="rq-issue" value={payload.issue ?? ""} onChange={setP("issue")} placeholder={t("requests.form.issuePlaceholder")} required data-testid="input-maintenance-issue" /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><Label htmlFor="rq-km">{t("requests.form.mileage")}</Label><Input id="rq-km" type="number" min={0} inputMode="numeric" value={payload.mileage ?? ""} onChange={setP("mileage")} /></div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={payload.urgent === "true"} onChange={(e) => setPayload({ ...payload, urgent: e.target.checked ? "true" : "" })} />{t("requests.form.urgent")}</label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={payload.needsReplacement === "true"} onChange={(e) => setPayload({ ...payload, needsReplacement: e.target.checked ? "true" : "" })} data-testid="checkbox-needs-replacement" />{t("requests.form.needsReplacement")}</label>
          <div>
            <Label htmlFor="rq-pref">{t("requests.form.preferredDate")}</Label>
            <PeriodPicker id="rq-pref" start={payload.preferredDate ?? ""} end="" single disableWeekends minDate={tomorrowIso()} onChange={(s) => setPayload({ ...payload, preferredDate: s })} testId="request-preferred-date" />
            <p className="mt-1 text-xs text-[#64748b]">{t("requests.form.weekdaysOnly")}</p>
          </div>
          <p className="text-xs text-[#64748b]">{t("requests.form.maintenanceHint")}</p>
        </div>
      )}
      {type === "maintenance_change" && (
        <div className="space-y-2">
          <div>
            <Label htmlFor="rq-newdate">{t("requests.form.newDate")}</Label>
            <PeriodPicker id="rq-newdate" start={payload.newDate ?? ""} end="" single disableWeekends minDate={tomorrowIso()} onChange={(s) => setPayload({ ...payload, newDate: s })} testId="request-new-date" />
            <p className="mt-1 text-xs text-[#64748b]">{t("requests.form.weekdaysOnly")}</p>
          </div>
          <div><Label htmlFor="rq-reason">{t("requests.form.reason")}</Label><Input id="rq-reason" value={payload.reason ?? ""} onChange={setP("reason")} required data-testid="input-change-reason" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={payload.needsReplacement === "true"} onChange={(e) => setPayload({ ...payload, needsReplacement: e.target.checked ? "true" : "" })} />{t("requests.form.stillNeedsReplacement")}</label>
          <p className="text-xs text-[#64748b]">{t("requests.form.changeHint")}</p>
        </div>
      )}
      {type === "mileage" && (
        <div>
          <Label htmlFor="rq-km2">{t("requests.form.mileage")}</Label>
          <Input id="rq-km2" type="number" min={0} inputMode="numeric" value={payload.mileage ?? ""} onChange={setP("mileage")} required data-testid="input-mileage" />
          <p className="mt-1 text-xs text-[#64748b]">{t("requests.form.mileageHint")}</p>
        </div>
      )}
      {type === "early_return" && <div><Label htmlFor="rq-ret">{t("requests.form.returnDate")}</Label><Input id="rq-ret" type="date" value={payload.returnDate ?? ""} onChange={setP("returnDate")} required /></div>}
      {type === "damage" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
