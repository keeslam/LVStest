/**
 * B-21 — het scherm "Nog buiten".
 *
 * Besluit B-21 splitst de ~790 oude, niet-afgesloten reserveringen. De
 * `booked`-rijen die nooit zijn opgehaald en de rijen met een verouderde
 * status worden door `scripts/close-returned-reservations.ts` afgesloten. De
 * 363 rijen op `picked_up` **niet**: die beweren dat de auto nog buiten staat,
 * en dat kan geen script weten. "Die komen op een werklijst die iemand echt
 * naloopt" — dit is die werklijst.
 *
 * Per regel: voertuig, klant, de afgesproken periode, de werkelijke
 * ophaaldatum en hoe lang het al openstaat. De actie is de bestaande
 * inname-dialoog (via `HandoverLauncher`, dezelfde die het scanpaneel, de
 * kalender en "Vandaag" openen) plus een link naar de reservering zelf voor
 * alles wat daar al kan — annuleren, wijzigen, historie. Dit scherm voegt geen
 * tweede manier toe om iets te doen.
 *
 * De peildatum is die van de browser, niet die van de server: het kantoor
 * staat in Amsterdam en de container draait op UTC, en tussen middernacht en
 * 02:00 CEST zijn dat twee verschillende dagen.
 */
import { useState } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, LogIn, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { formatLicensePlate } from "@/lib/format-utils";
import { invalidateByPrefix } from "@/lib/queryClient";
import { localToday } from "@/hooks/use-today-board";
import {
  HandoverLauncher,
  type HandoverRequest,
} from "@/components/today/handover-launcher";
import type { StillOutWorklist } from "@shared/still-out";

function plate(value: string | null): string {
  return value ? formatLicensePlate(value) : "—";
}

function dutchDate(value: string | null): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "d MMMM yyyy", { locale: nl });
  } catch {
    return value;
  }
}

export function stillOutQueryKey(date: string): readonly unknown[] {
  return ["/api/reservations/worklist/still-out", { date }];
}

export default function StillOutPage() {
  const date = localToday();
  const { data, isLoading, error, refetch, isFetching } = useQuery<StillOutWorklist>({
    queryKey: stillOutQueryKey(date),
  });
  const [handover, setHandover] = useState<HandoverRequest | null>(null);

  const refreshAfterAction = () => {
    invalidateByPrefix("/api/reservations");
    invalidateByPrefix("/api/vehicles");
    invalidateByPrefix("/api/today");
  };

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-xl font-semibold" data-testid="still-out-title">
          Nog buiten
        </h2>
        <p className="text-sm text-gray-500" data-testid="still-out-subtitle">
          Verhuringen die als opgehaald staan en waarvan de einddatum voorbij is. Deze worden
          bewust niet automatisch afgesloten — loop ze na en neem in of corrigeer per regel.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => refetch()}
        disabled={isFetching}
        data-testid="button-still-out-refresh"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        Vernieuwen
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="still-out-loading">
        {heading}
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        {heading}
        <QueryErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <Card data-testid="still-out-empty">
          <CardContent className="py-8 text-center text-sm text-gray-500">
            Er staat geen enkele verhuring meer open. De werklijst is leeg.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      <Card data-testid="still-out-list">
        <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
          <CardTitle className="text-base font-medium">Na te lopen verhuringen</CardTitle>
          <Badge variant="secondary" data-testid="still-out-count">
            {data.total}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          {data.rows.map((row) => (
            <div
              key={row.reservationId}
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-gray-50"
              data-testid={`still-out-row-${row.reservationId}`}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {plate(row.licensePlate)}
                    {row.vehicleLabel ? ` ${row.vehicleLabel}` : ""}
                  </span>
                  <Badge variant="destructive" data-testid={`still-out-days-${row.reservationId}`}>
                    {row.daysOpen} dagen open
                  </Badge>
                  {row.contractNumber && (
                    <Badge variant="outline">Contract {row.contractNumber}</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">
                  {row.customerLabel ?? "Geen klant"} · {dutchDate(row.startDate)} t/m{" "}
                  {dutchDate(row.endDate)}
                  {row.actualPickupDate ? ` · opgehaald ${dutchDate(row.actualPickupDate)}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setHandover({ reservationId: row.reservationId, kind: "return" })}
                data-testid={`button-still-out-return-${row.reservationId}`}
                className="flex-shrink-0"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Innemen
              </Button>
              <Button
                size="sm"
                variant="outline"
                asChild
                className="flex-shrink-0"
                data-testid={`link-still-out-open-${row.reservationId}`}
              >
                <Link href={`/reservations/edit/${row.reservationId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Openen
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <HandoverLauncher
        request={handover}
        onClose={() => setHandover(null)}
        onSuccess={refreshAfterAction}
      />
    </div>
  );
}
