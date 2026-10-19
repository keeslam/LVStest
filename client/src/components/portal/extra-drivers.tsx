import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserPlus, X } from "lucide-react";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import { PortalApiError, portalFetch, portalQueryFn } from "@/lib/portal-api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { formatLicensePlate } from "@/lib/format-utils";

/** Reservations a driver is on (main or extra) other than this one, booked or running: one car per driver. */
export function busyCar(reservations: PortalReservationDto[], driverId: number, exceptId: number) {
  return reservations.find((r) => r.id !== exceptId && (r.status === "booked" || r.status === "picked_up")
    && (r.driver?.id === driverId || (r.extraDrivers ?? []).some((d) => d.id === driverId)));
}

/**
 * Extra drivers on a shared car (Kees, 2026-10-18). Everyone sees who else drives; an admin who
 * manages drivers adds or removes them. The main driver and the contract stay as they are.
 */
export function ExtraDrivers({ reservation, canEdit }: { reservation: PortalReservationDto; canEdit: boolean }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const extras = reservation.extraDrivers ?? [];
  const { data: drivers = [] } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn, enabled: picking });
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: picking });
  const fail = (e: unknown) => toast({ title: e instanceof PortalApiError && e.code === "PORTAL_DRIVER_BUSY" ? e.message : t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`, { defaultValue: (e as Error).message }), variant: "destructive" });
  const done = async () => { await queryClient.invalidateQueries({ queryKey: ["portal"] }); };
  const add = useMutation({
    mutationFn: () => portalFetch("POST", `/api/portal/reservations/${reservation.id}/drivers`, { driverId: Number(choice) }),
    onSuccess: async () => { await done(); toast({ title: t("extraDrivers.added") }); setPicking(false); setChoice(""); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (driverId: number) => portalFetch("DELETE", `/api/portal/reservations/${reservation.id}/drivers/${driverId}`),
    onSuccess: async () => { await done(); toast({ title: t("extraDrivers.removed") }); },
    onError: fail,
  });
  // Who can still be added: active, not on this car already, not driving another car.
  const options = drivers.filter((d) => d.status === "active" && d.id !== reservation.driver?.id && !extras.some((e) => e.id === d.id))
    .map((d) => ({ d, busy: busyCar(reservations, d.id, reservation.id) }));

  if (!canEdit && extras.length === 0) return null;
  return (
    <div data-testid="extra-drivers">
      <h3 className="mb-1 text-sm font-semibold">{t("extraDrivers.title")}</h3>
      {extras.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {extras.map((d) => (
            <li key={d.id} className="inline-flex items-center gap-1 rounded-full bg-[#eef0fb] py-0.5 pl-2.5 pr-1 text-xs text-[#1a1d62]" data-testid={`extra-driver-${d.id}`}>
              {d.displayName}
              {canEdit && <button type="button" onClick={() => remove.mutate(d.id)} disabled={remove.isPending} aria-label={t("extraDrivers.remove", { name: d.displayName })} className="rounded-full p-0.5 hover:bg-[#dfe3f7]" data-testid={`button-remove-extra-${d.id}`}><X className="h-3 w-3" /></button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (picking ? (
        <div className="flex flex-wrap items-center gap-2">
          <select className="min-w-[12rem] rounded-md border px-2 py-1.5 text-sm" value={choice} onChange={(e) => setChoice(e.target.value)} data-testid="select-extra-driver">
            <option value="">—</option>
            {options.map(({ d, busy }) => (
              <option key={d.id} value={d.id} disabled={Boolean(busy)}>
                {d.displayName}{busy ? ` · ${t("drivers.busyIn", { plate: busy.vehicle?.licensePlate ? formatLicensePlate(busy.vehicle.licensePlate) : `#${busy.id}` })}` : ""}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => add.mutate()} disabled={!choice || add.isPending} data-testid="button-save-extra-driver">{t("extraDrivers.add")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>{t("actions.cancel")}</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPicking(true)} data-testid="button-add-extra-driver"><UserPlus className="mr-1 h-4 w-4" />{t("extraDrivers.addButton")}</Button>
      ))}
      <p className="mt-1 text-xs text-[#64748b]">{t("extraDrivers.hint")}</p>
    </div>
  );
}
