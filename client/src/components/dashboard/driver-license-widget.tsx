/**
 * Punt 9 (Kees, 2026-10-19) — tile "Rijbewijzen": main drivers of a booked or
 * running rental whose licence is expired or expires within 30 days
 * (GET /api/reservations/driver-licenses-expiring). The eye opens the rental.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Eye, IdCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatLicensePlate } from "@/lib/format-utils";
import { ReservationViewDialog } from "@/components/reservations/reservation-view-dialog";
import { UserPermission } from "@shared/schema";
import { useHasPermission } from "@/hooks/use-has-permission";
import { NoDataAccess } from "@/components/ui/no-data-access";
import { officeToday } from "@/lib/office-date";
import { formatDutchDate } from "@shared/booking-warnings";

interface LicenseTileRow {
  driverId: number;
  driverName: string;
  customerName: string | null;
  licenseExpiry: string | null;
  expiryDay: string;
  reservationId: number;
  licensePlate: string | null;
  startDate: string;
  status: string;
}

export function DriverLicenseWidget() {
  const { t } = useTranslation("dashboard");
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);
  const canViewReservations = useHasPermission(UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS);
  const { data: rows = [], isLoading, error } = useQuery<LicenseTileRow[]>({
    queryKey: ["/api/reservations/driver-licenses-expiring"],
    enabled: canViewReservations,
  });
  const today = officeToday();

  return (
    <Card className="overflow-hidden h-full">
      <CardHeader className="bg-amber-600 py-3 px-4 flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base font-medium text-white">{t("licenseWidget.title")}</CardTitle>
        <IdCard className="h-5 w-5 text-white" aria-hidden="true" />
      </CardHeader>
      <CardContent className="p-4">
        {!canViewReservations ? (
          <NoDataAccess permission={UserPermission.VIEW_RESERVATIONS} />
        ) : (
          <>
            <div className="mb-3">
              <div className="text-xl font-semibold">{isLoading ? "-" : rows.length}</div>
              <p className="text-xs text-gray-500">{t("licenseWidget.subtitle")}</p>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {isLoading ? null : error ? (
                <div className="text-center py-4 text-red-500">{t("licenseWidget.loadFailed")}</div>
              ) : rows.length === 0 ? (
                <div className="text-center py-4 text-gray-500">{t("licenseWidget.none")}</div>
              ) : (
                rows.map((row) => {
                  const expired = row.expiryDay < today;
                  return (
                    <div key={row.driverId} className="flex items-center p-2 border rounded-md hover:bg-gray-50" data-testid={`license-row-${row.driverId}`}>
                      <div className="ml-1 flex-grow min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{row.driverName}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {[row.customerName, row.licensePlate ? formatLicensePlate(row.licensePlate) : null].filter(Boolean).join(" · ")}
                        </div>
                        <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-xs rounded-full ${expired ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                          {t(expired ? "licenseWidget.expiredOn" : "licenseWidget.expiresOn", { date: formatDutchDate(row.expiryDay) })}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0 ml-2 h-8 w-8 p-0"
                        onClick={() => setSelectedReservationId(row.reservationId)}
                        aria-label={t("licenseWidget.openRental")}
                        data-testid={`button-license-reservation-${row.reservationId}`}
                      >
                        <Eye className="h-4 w-4 text-gray-500 hover:text-gray-700" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </CardContent>

      {selectedReservationId && (
        <ReservationViewDialog
          reservationId={selectedReservationId}
          open={!!selectedReservationId}
          onOpenChange={(open) => !open && setSelectedReservationId(null)}
        />
      )}
    </Card>
  );
}
