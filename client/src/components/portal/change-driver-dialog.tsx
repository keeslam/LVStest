import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export function ChangeDriverDialog({ reservation }: { reservation: PortalReservationDto }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState<string>(reservation.driver ? String(reservation.driver.id) : "");
  const [note, setNote] = useState("");
  const { data: drivers = [] } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn, enabled: open });

  const mutation = useMutation({
    mutationFn: () => portalFetch("POST", `/api/portal/reservations/${reservation.id}/driver`, { driverId: Number(driverId), note: note || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal"] });
      toast({ title: t("drivers.changed") });
      setOpen(false);
    },
    onError: (e) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{t("actions.changeDriver")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("drivers.changeDriverTitle", { plate: reservation.vehicle?.licensePlate ?? `#${reservation.id}` })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="driver-select">{t("drivers.selectDriver")}</Label>
            <select id="driver-select" className="w-full rounded-md border px-3 py-2 text-sm" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">—</option>
              {drivers.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="driver-note">{t("fields.note")}</Label>
            <Input id="driver-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button disabled={!driverId || mutation.isPending} onClick={() => mutation.mutate()}>{t("actions.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
