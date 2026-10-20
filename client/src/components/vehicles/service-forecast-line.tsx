/**
 * Punt 6 (Kees, 2026-10-20) — the expected date of the next service on the
 * vehicle card: the earlier of the km limit at the average pace and the date
 * by months (GET /api/vehicles/:id/service-forecast). With too few readings
 * it says so and predicts nothing.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import type { ServiceForecast } from "@shared/service-forecast";
import { formatDutchDate } from "@shared/booking-warnings";

export function ServiceForecastLine({ vehicleId }: { vehicleId: number }) {
  const { t } = useTranslation("vehicles");
  const { data } = useQuery<{ forecast: ServiceForecast }>({ queryKey: [`/api/vehicles/${vehicleId}/service-forecast`] });
  const forecast = data?.forecast;
  if (!forecast) return null;

  if (forecast.tooFewReadings) {
    return (
      <p className="mt-3 text-sm text-gray-500" data-testid="text-service-forecast">
        {t("details.maintenance.forecastTooFew")}
      </p>
    );
  }
  if (!forecast.expectedDate) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-md bg-white/70 p-2 text-sm" data-testid="text-service-forecast">
      <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
      <div>
        <p className="font-medium">{t("details.maintenance.forecastExpected", { date: formatDutchDate(forecast.expectedDate) })}</p>
        <p className="text-gray-600">
          {t("details.maintenance.forecastPace", { km: (forecast.kmPerDay ?? 0).toLocaleString("nl-NL") })}
          {" · "}
          {t(forecast.basis === "km" ? "details.maintenance.forecastBasisKm" : "details.maintenance.forecastBasisMonths")}
        </p>
      </div>
    </div>
  );
}
