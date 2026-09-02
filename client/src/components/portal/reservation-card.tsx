import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatLicensePlate } from "@/lib/format-utils";

export function formatPortalDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}-${m}-${y}` : value;
}

export function ReservationCard({ reservation, showPrice }: { reservation: PortalReservationDto; showPrice: boolean }) {
  const { t } = useTranslation("portal");
  const r = reservation;
  return (
    <Link href={`/reserveringen/${r.id}`} className="block">
      <Card className="hover:bg-muted/40 transition-colors">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">
              {r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : t("reservations.spareFor", { id: r.replacementForReservationId })}
              {r.vehicle && <span className="ml-2 font-mono text-sm text-muted-foreground">{formatLicensePlate(r.vehicle.licensePlate)}</span>}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatPortalDate(r.startDate)} – {r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}
              {r.driver && <> · {r.driver.displayName}</>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showPrice && r.totalPrice && <span className="text-sm">€ {r.totalPrice}</span>}
            <Badge variant="outline">{t(`reservations.status.${r.status}`, { defaultValue: r.status })}</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
