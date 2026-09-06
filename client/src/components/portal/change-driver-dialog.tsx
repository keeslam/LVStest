import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { SearchListPicker } from "@/components/ui/search-list-picker";
import { formatLicensePlate } from "@/lib/format-utils";
import { DriverFormDialog } from "./driver-form-dialog";
import { btnPrimary } from "./ui";

/** Active drivers; those already on another booked or running car are listed but cannot be chosen (one car per driver). */
const driverItems = (drivers: PortalDriverDto[], reservations: PortalReservationDto[], reservationId: number, busyLabel: (plate: string) => string) =>
  drivers.filter((d) => d.status === "active").map((d) => {
    const busy = reservations.find((r) => r.id !== reservationId && r.driver?.id === d.id && (r.status === "booked" || r.status === "picked_up"));
    return { id: d.id, label: d.displayName, disabled: Boolean(busy), sub: busy ? busyLabel(busy.vehicle?.licensePlate ? formatLicensePlate(busy.vehicle.licensePlate) : `#${busy.id}`) : d.email ?? d.phone ?? null, search: `${d.firstName ?? ""} ${d.lastName ?? ""} ${d.phone ?? ""} ${d.email ?? ""}` };
  });

const errorTitle = (e: unknown, t: (k: string) => string) => e instanceof PortalApiError ? (e.code === "PORTAL_DRIVER_BUSY" ? e.message : t(`errors.${e.code}`)) : t("errors.PORTAL_SERVER_ERROR");

/** Put another driver on this car: searchable list, or add a new driver without leaving the dialog. */
export function ChangeDriverDialog({ reservation }: { reservation: PortalReservationDto }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [driverId, setDriverId] = useState<string>(reservation.driver ? String(reservation.driver.id) : "");
  const [note, setNote] = useState("");
  const { data: drivers = [] } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn, enabled: open });
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: open });

  const mutation = useMutation({
    mutationFn: () => portalFetch("POST", `/api/portal/reservations/${reservation.id}/driver`, { driverId: Number(driverId), note: note || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal"] });
      toast({ title: t("drivers.changed") });
      setOpen(false);
    },
    onError: (e) => toast({ title: errorTitle(e, t), variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm" variant="outline" className="w-full sm:w-auto">{t("actions.changeDriver")}</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("drivers.changeDriverTitle", { plate: reservation.vehicle?.licensePlate ? formatLicensePlate(reservation.vehicle.licensePlate) : `#${reservation.id}` })}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="driver-select">{t("drivers.selectDriver")}</Label>
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-[#2a2f9c] hover:underline" data-testid="button-add-driver-inline"><UserPlus className="h-3.5 w-3.5" />{t("drivers.newInline")}</button>
              </div>
              <SearchListPicker items={driverItems(drivers, reservations, reservation.id, (plate) => t("drivers.busyIn", { plate }))} value={driverId ? Number(driverId) : null} onChange={(did) => setDriverId(did ? String(did) : "")}
                searchPlaceholder={t("drivers.search")} emptyText={t("drivers.noneFound")} changeLabel={t("actions.change")}
                hintText={(shown, total) => t("drivers.moreShown", { shown, total })} searchFrom={6} testId="portal-driver-picker" />
            </div>
            <div>
              <Label htmlFor="driver-note">{t("fields.note")}</Label>
              <Input id="driver-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("drivers.notePlaceholder")} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
              <Button className={btnPrimary} disabled={!driverId || mutation.isPending} onClick={() => mutation.mutate()}>{t("actions.save")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* New driver goes straight onto this car; the picker then shows the result. */}
      <DriverFormDialog open={adding} onOpenChange={setAdding} assignReservationId={reservation.id} onSaved={(d) => { setDriverId(String(d.id)); setOpen(false); }} />
    </>
  );
}

/** The other way round: pick a car for this driver. */
export function AssignVehicleDialog({ driver, open, onOpenChange }: { driver: PortalDriverDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reservationId, setReservationId] = useState<number | null>(null);
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: open });
  const cars = reservations.filter((r) => r.status === "booked" || r.status === "picked_up").map((r) => ({
    id: r.id,
    label: r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model} · ${formatLicensePlate(r.vehicle.licensePlate)}` : `#${r.id}`,
    sub: r.driver?.id === driver.id ? t("drivers.alreadyDriving") : r.driver ? t("drivers.currently", { name: r.driver.displayName }) : t("drivers.noDriverYet"),
    search: `${r.vehicle?.licensePlate ?? ""} ${r.driver?.displayName ?? ""} ${r.startDate}`,
  }));
  const mutation = useMutation({
    mutationFn: () => portalFetch("POST", `/api/portal/reservations/${reservationId}/driver`, { driverId: driver.id }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["portal"] }); toast({ title: t("drivers.changed") }); onOpenChange(false); setReservationId(null); },
    onError: (e) => toast({ title: errorTitle(e, t), variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("drivers.assignTitle", { name: driver.displayName })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <SearchListPicker items={cars} value={reservationId} onChange={setReservationId} searchPlaceholder={t("drivers.searchCar")} emptyText={t("drivers.noCarFound")} changeLabel={t("actions.change")}
            hintText={(shown, total) => t("drivers.moreShown", { shown, total })} searchFrom={6} testId="assign-car-picker" />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("actions.cancel")}</Button>
            <Button className={btnPrimary} disabled={!reservationId || mutation.isPending} onClick={() => mutation.mutate()}>{t("drivers.assign")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
