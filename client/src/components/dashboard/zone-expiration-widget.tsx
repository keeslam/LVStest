/**
 * Round 2 punt 9 (Kees, 2026-10-20) — dashboard tile: low-emission-zone and Move IZI
 * end dates within the reminder days of the settings (GET /api/vehicles/zone-expiring).
 * Same look as the warranty tile; a click opens the vehicle.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Leaf } from "lucide-react";
import { invalidateByPrefix } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { UserPermission } from "@shared/schema";
import type { ZoneExpiringRow } from "@shared/zone-expiry";
import { useHasPermission } from "@/hooks/use-has-permission";
import { NoDataAccess } from "@/components/ui/no-data-access";

function daysUntil(day: string): number {
  const target = new Date(`${day}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function ZoneExpirationWidget() {
  const { t } = useTranslation("dashboard");
  const { openVehicleDialog } = useGlobalDialog();
  const canViewVehicles = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES);
  const { data: rows, isLoading } = useQuery<ZoneExpiringRow[]>({
    queryKey: ["/api/vehicles/zone-expiring"],
    enabled: canViewVehicles,
  });

  return (
    <Card className="overflow-hidden h-full">
      <CardHeader className="bg-primary-700 py-3 px-4 flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base font-medium text-gray-900">{t("zoneWidget.title")}</CardTitle>
        <Leaf className="h-5 w-5 text-gray-900" aria-hidden="true" />
      </CardHeader>
      <CardContent className="p-4">
        {!canViewVehicles ? (
          <NoDataAccess permission={UserPermission.VIEW_VEHICLES} />
        ) : (
          <>
            <div className="mb-3">
              <div className="text-xl font-semibold" data-testid="zone-widget-count">{isLoading ? "-" : rows?.length || 0}</div>
              <p className="text-xs text-gray-500">{t("zoneWidget.subtitle")}</p>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {!isLoading && (rows?.length ?? 0) === 0 && (
                <div className="text-center py-4 text-gray-500">{t("zoneWidget.none")}</div>
              )}
              {rows?.map((row) => {
                const days = daysUntil(row.date);
                const urgent = days <= 14;
                return (
                  <button
                    type="button"
                    key={`${row.kind}-${row.id}`}
                    className="w-full flex items-center p-2 border rounded-md hover:bg-gray-50 text-left"
                    onClick={() => {
                      invalidateByPrefix(`/api/vehicles/${row.id}`);
                      openVehicleDialog(row.id);
                    }}
                    data-testid={`zone-widget-row-${row.kind}-${row.id}`}
                  >
                    <div className="flex-grow min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {formatLicensePlate(row.licensePlate)}
                        <span className="ml-2 text-xs font-normal text-gray-500">{t(`zoneWidget.${row.kind}`)}</span>
                      </div>
                      <div className="flex items-center">
                        <div className="text-xs text-gray-500">{formatDate(row.date)}</div>
                        <div className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${urgent ? "bg-warning-50 text-warning-500" : "bg-primary-100 text-primary-600"}`}>
                          {days < 0
                            ? t("apkWidget.daysOverdue", { count: Math.abs(days) })
                            : t("apkWidget.daysRemaining", { count: days })}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
