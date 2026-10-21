/**
 * Round 2 punt 11 part B (Kees, 2026-10-21) — dashboard tile "Factuur ontbreekt":
 * workshop visits that ended the set number of days ago without a linked invoice,
 * with "Lijst afdrukken" (the same PDF the weekly mail attaches).
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileWarning, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { UserPermission } from "@shared/schema";
import type { MissingInvoiceRow } from "@shared/missing-invoice";
import { useHasPermission } from "@/hooks/use-has-permission";
import { NoDataAccess } from "@/components/ui/no-data-access";

export function MissingInvoiceWidget() {
  const { t } = useTranslation("dashboard");
  const { openVehicleDialog } = useGlobalDialog();
  const canView = useHasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_MAINTENANCE);
  const { data, isLoading } = useQuery<{ rows: MissingInvoiceRow[]; days: number }>({
    queryKey: ["/api/maintenance-blocks/missing-invoices"],
    enabled: canView,
  });
  const rows = data?.rows ?? [];

  return (
    <Card className="overflow-hidden h-full">
      <CardHeader className="bg-primary-700 py-3 px-4 flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base font-medium text-gray-900">{t("missingInvoiceWidget.title")}</CardTitle>
        <FileWarning className="h-5 w-5 text-gray-900" aria-hidden="true" />
      </CardHeader>
      <CardContent className="p-4">
        {!canView ? (
          <NoDataAccess permission={UserPermission.VIEW_VEHICLES} />
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-xl font-semibold" data-testid="missing-invoice-count">{isLoading ? "-" : rows.length}</div>
                <p className="text-xs text-gray-500">{t("missingInvoiceWidget.subtitle", { days: data?.days ?? 14 })}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("/api/maintenance-blocks/missing-invoices.pdf", "_blank", "noopener")}
                data-testid="button-print-missing-invoices"
              >
                <Printer className="h-4 w-4 mr-1" />
                {t("missingInvoiceWidget.print")}
              </Button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {!isLoading && rows.length === 0 && (
                <div className="text-center py-4 text-gray-500">{t("missingInvoiceWidget.none")}</div>
              )}
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.visitId}
                  className="w-full flex items-center p-2 border rounded-md hover:bg-gray-50 text-left"
                  onClick={() => openVehicleDialog(row.vehicleId)}
                  data-testid={`missing-invoice-row-${row.visitId}`}
                >
                  <div className="flex-grow min-w-0">
                    <div className="text-sm font-medium text-gray-900">{formatLicensePlate(row.licensePlate)}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {formatDate(row.endDate)}{row.description ? ` · ${row.description}` : ""}
                    </div>
                  </div>
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-red-50 text-red-700 shrink-0">
                    {t("missingInvoiceWidget.daysAgo", { count: row.daysSinceEnd })}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
