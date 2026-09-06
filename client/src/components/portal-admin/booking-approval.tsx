import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Check, AlertTriangle } from "lucide-react";
import type { PortalRequestDto } from "@shared/portal-requests";
import type { PortalBookingAlternativeDto } from "@shared/portal-types";
import type { Driver } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { formatLicensePlate } from "@/lib/format-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchListPicker } from "@/components/ui/search-list-picker";
import { useToast } from "@/hooks/use-toast";
import { PeriodPicker, TimeSelect } from "@/components/portal/period-picker";

type ApproveError = Error & { field?: string; conflicts?: Array<{ id: number; startDate: string; endDate: string | null }> };
interface Alternatives { startDate: string; endDate: string | null; requestedBlocked: boolean; vehicles: PortalBookingAlternativeDto[] }

const label = (v: PortalBookingAlternativeDto) => `${v.brand} ${v.model} · ${formatLicensePlate(v.licensePlate)}`;

/**
 * Turn a rental request into a booked reservation. Staff can still change the
 * period, times, driver and vehicle; suggestions are same-type vehicles that are
 * free in the period. The server re-checks blacklist, calendar and driver.
 */
export function BookingApproval({ request: r, onApproved }: { request: PortalRequestDto; onApproved: (reservationId: number) => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const p = r.payload as Record<string, string | undefined>;
  const [startDate, setStartDate] = useState(p.startDate ?? "");
  const [endDate, setEndDate] = useState(p.endDate ?? "");
  const [startTime, setStartTime] = useState(p.startTime ?? "");
  const [endTime, setEndTime] = useState(p.endTime ?? "");
  const [vehicleId, setVehicleId] = useState<number | null>(p.vehicleId ? Number(p.vehicleId) : null);
  const [driverId, setDriverId] = useState<string>(p.driverId ?? "");
  const [reply, setReply] = useState("");
  useEffect(() => { setStartDate(p.startDate ?? ""); setEndDate(p.endDate ?? ""); setStartTime(p.startTime ?? ""); setEndTime(p.endTime ?? ""); setVehicleId(p.vehicleId ? Number(p.vehicleId) : null); setDriverId(p.driverId ?? ""); setReply(""); }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && (!endDate || endDate >= startDate);
  const altKey = ["/api/portal-requests", r.id, "alternatives", startDate, endDate];
  const { data: alt } = useQuery<Alternatives>({
    queryKey: altKey, enabled: validPeriod,
    queryFn: async () => (await apiRequest("GET", `/api/portal-requests/${r.id}/alternatives?start=${startDate}&end=${endDate}`)).json(),
  });
  const { data: drivers = [] } = useQuery<Driver[]>({ queryKey: [`/api/customers/${r.customerId}/drivers/active`], enabled: Boolean(r.customerId) });

  const vehicles = alt?.vehicles ?? [];
  const chosen = vehicles.find((v) => v.id === vehicleId);
  const requested = vehicles.find((v) => v.requested);
  const suggestions = useMemo(() => vehicles.filter((v) => !v.requested && v.sameType && v.free).slice(0, 6), [vehicles]);
  const pickerItems = vehicles.map((v) => ({ id: v.id, label: label(v), sub: v.free ? t("admin.booking.free") : t("admin.booking.busy"), disabled: !v.free, search: `${v.licensePlate} ${v.vehicleType ?? ""}` }));

  const approve = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/portal-requests/${r.id}/approve`, {
      vehicleId, startDate, endDate: endDate || "", startTime: startTime || "", endTime: endTime || "",
      driverId: driverId ? Number(driverId) : null, reply: reply.trim() || undefined,
    })).json(),
    onSuccess: (data: { reservation: { id: number } }) => { toast({ title: t("admin.booking.created", { id: data.reservation.id }) }); onApproved(data.reservation.id); },
    onError: (e: ApproveError) => {
      const c = e.conflicts?.[0];
      toast({ title: c ? t("admin.requests.dialog.conflict", { id: c.id, from: c.startDate, to: c.endDate ?? "…" }) : e.message.replace(/^\d+:\s*/, ""), variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" data-testid="booking-approval">
      <div className="flex items-center gap-2 font-medium"><CalendarCheck className="h-4 w-4" />{t("admin.booking.title")}</div>
      <div className="grid gap-2 md:grid-cols-2">
        <div><Label htmlFor="ba-period">{t("admin.booking.period")}</Label><PeriodPicker id="ba-period" start={startDate} end={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} testId="booking-period" /></div>
        <div className="grid grid-cols-2 gap-2">
          <TimeSelect id="ba-st" label={t("admin.booking.pickupTime")} value={startTime} onChange={setStartTime} />
          <TimeSelect id="ba-et" label={t("admin.booking.returnTime")} value={endTime} onChange={setEndTime} />
        </div>
      </div>
      {!validPeriod && <p className="text-xs text-destructive">{t("admin.booking.invalidPeriod")}</p>}

      <div className="space-y-2">
        <Label>{t("admin.requests.dialog.vehicle")}</Label>
        {requested && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("admin.booking.requestedVehicle")}:</span>
            <button type="button" onClick={() => setVehicleId(requested.id)} className={`rounded-md border px-2 py-1 ${vehicleId === requested.id ? "border-primary bg-primary/10" : ""}`} data-testid="booking-requested">{label(requested)}</button>
            {alt?.requestedBlocked
              ? <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />{t("admin.booking.blocked")}</Badge>
              : <Badge variant={requested.free ? "secondary" : "destructive"}>{requested.free ? t("admin.booking.free") : t("admin.booking.busy")}</Badge>}
          </div>
        )}
        {alt && !requested && <p className="text-xs text-destructive">{t("admin.booking.requestedUnavailable")}</p>}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("admin.booking.suggestions")}:</span>
            {suggestions.map((v) => (
              <button key={v.id} type="button" onClick={() => setVehicleId(v.id)} className={`rounded-md border px-2 py-1 text-xs ${vehicleId === v.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`} data-testid={`booking-suggestion-${v.id}`}>{label(v)}</button>
            ))}
          </div>
        )}
        <SearchListPicker items={pickerItems} value={vehicleId} onChange={setVehicleId} searchPlaceholder={t("admin.booking.searchVehicle")} emptyText={t("admin.blacklist.noVehicle")} changeLabel={t("admin.blacklist.change")}
          hintText={(shown, total) => t("admin.blacklist.moreShown", { shown, total })} searchFrom={0} maxShown={6} listOnlyWhenTyping testId="booking-vehicle" />
        {chosen && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-green-700" />{t("admin.booking.willBook", { vehicle: label(chosen) })}{chosen.free ? "" : ` · ${t("admin.booking.busy")}`}</p>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label htmlFor="ba-driver">{t("admin.booking.driver")}</Label>
          <select id="ba-driver" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={driverId} onChange={(e) => setDriverId(e.target.value)} data-testid="booking-driver">
            <option value="">{t("admin.booking.noDriver")}</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
          </select>
          {p.driverLabel && <p className="mt-1 text-xs text-muted-foreground">{t("admin.booking.requestedDriver", { name: p.driverLabel })}</p>}
        </div>
        <div>
          <Label htmlFor="ba-reply">{t("admin.booking.reply")}</Label>
          <Textarea id="ba-reply" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("admin.booking.replyPlaceholder")} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!validPeriod || !vehicleId || approve.isPending} onClick={() => approve.mutate()} data-testid="button-approve-booking">
          <CalendarCheck className="mr-1.5 h-4 w-4" />{t("admin.booking.approve")}
        </Button>
      </div>
    </div>
  );
}
