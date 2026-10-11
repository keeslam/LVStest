/**
 * D17 (besluiten D, spec §13) - Instellingen > Voertuigen > "RDW-voertuigtypes".
 *
 * The RDW mapping for the vehicle type was fixed (a 9-seat van is no SUV), but vehicles that
 * already exist keep their old type until somebody decides otherwise. "Controleren" lets the
 * server ask the RDW about every vehicle in the background and store a plan; the list shows
 * what would change; "Toepassen" (role admin only) applies exactly that plan after a
 * confirmation that names the count. Nothing changes before that.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useHasPermission } from "@/hooks/use-has-permission";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError, parseApiError } from "@/lib/api-error";
import { formatDateTime, formatLicensePlate, formatVehicleType } from "@/lib/format-utils";
import { UserPermission, UserRole } from "@shared/schema";
import type { RdwTypeRemapApplyResult, RdwTypeRemapStatus } from "@shared/rdw-type-remap";

const PLAN_KEY = "/api/vehicles/rdw-type-remap/plan";
/** How often the progress is read while the server is busy. */
const POLL_MS = 1500;

export function RdwTypeRemapCard() {
  const { t } = useTranslation(["vehicles", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = useHasPermission(UserPermission.MANAGE_VEHICLES);
  // The server wants role admin for "Toepassen"; the button mirrors that.
  const isAdmin = user?.role === UserRole.ADMIN;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading } = useQuery<RdwTypeRemapStatus>({
    queryKey: [PLAN_KEY],
    enabled: canManage,
    refetchInterval: (query) => (query.state.data?.job.status === "running" ? POLL_MS : false),
  });

  const describe = (error: unknown) => {
    const { code } = parseApiError(error);
    const known = code ? t(`vehicles:rdwTypeRemap.errors.${code}`, { defaultValue: "" }) : "";
    return known || describeApiError(error, undefined, t("vehicles:rdwTypeRemap.errors.generic"));
  };

  const checkMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/vehicles/rdw-type-remap/check", {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PLAN_KEY] });
    },
    onError: (error) => {
      toast({ title: t("vehicles:rdwTypeRemap.checkFailedTitle"), description: describe(error), variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: [PLAN_KEY] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/vehicles/rdw-type-remap/apply", {});
      return (await response.json()) as RdwTypeRemapApplyResult;
    },
    onSuccess: (result) => {
      invalidateByPrefix("/api/vehicles");
      void queryClient.invalidateQueries({ queryKey: [PLAN_KEY] });
      toast({
        title: t("vehicles:rdwTypeRemap.appliedTitle"),
        description: t("vehicles:rdwTypeRemap.appliedDescription", { applied: result.applied, skipped: result.skipped, count: result.applied }),
      });
    },
    onError: (error) => {
      toast({ title: t("vehicles:rdwTypeRemap.applyFailedTitle"), description: describe(error), variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: [PLAN_KEY] });
    },
  });

  if (!canManage) return null;

  const job = data?.job;
  const plan = data?.plan ?? null;
  const running = job?.status === "running" || checkMutation.isPending;
  const rows = plan?.rows ?? [];

  return (
    <Card data-testid="card-rdw-type-remap">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="h-5 w-5" />
          {t("vehicles:rdwTypeRemap.title")}
        </CardTitle>
        <CardDescription>{t("vehicles:rdwTypeRemap.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => checkMutation.mutate()}
            disabled={running}
            data-testid="button-rdw-remap-check"
          >
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("vehicles:rdwTypeRemap.checkButton")}
          </Button>
          {isAdmin && (
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={running || rows.length === 0 || applyMutation.isPending}
              data-testid="button-rdw-remap-apply"
            >
              {t("vehicles:rdwTypeRemap.applyButton")}
            </Button>
          )}
        </div>

        {job?.status === "running" && (
          <div className="space-y-1" data-testid="rdw-remap-progress">
            <Progress value={job.total > 0 ? Math.round((job.checked / job.total) * 100) : 0} className="h-2" />
            <p className="text-sm text-gray-600" data-testid="text-rdw-remap-progress">
              {t("vehicles:rdwTypeRemap.progress", { checked: job.checked, total: job.total })}
            </p>
          </div>
        )}
        {job?.status === "error" && (
          <p className="text-sm text-red-600" data-testid="text-rdw-remap-error">
            {t("vehicles:rdwTypeRemap.errors.REMAP_CHECK_FAILED")}
          </p>
        )}

        {!isLoading && !plan && job?.status !== "running" && (
          <p className="text-sm text-gray-500" data-testid="text-rdw-remap-no-plan">
            {t("vehicles:rdwTypeRemap.noPlan")}
          </p>
        )}

        {plan && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700" data-testid="text-rdw-remap-summary">
              {t("vehicles:rdwTypeRemap.summary", {
                count: rows.length,
                date: formatDateTime(plan.createdAt),
                checked: plan.checked,
                notFound: plan.notFound.length,
                failed: plan.failed.length,
              })}
            </p>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500" data-testid="text-rdw-remap-nothing">
                {t("vehicles:rdwTypeRemap.nothingToChange")}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border" data-testid="list-rdw-remap-rows">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2">{t("vehicles:rdwTypeRemap.columns.plate")}</th>
                      <th className="px-3 py-2">{t("vehicles:rdwTypeRemap.columns.change")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t" data-testid={`rdw-remap-row-${row.id}`}>
                        <td className="px-3 py-1.5 font-medium">{formatLicensePlate(row.plate)}</td>
                        <td className="px-3 py-1.5">
                          {row.from ? formatVehicleType(row.from) : t("vehicles:rdwTypeRemap.noType")}
                          {" → "}
                          {formatVehicleType(row.to)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(plan.notFound.length > 0 || plan.failed.length > 0) && (
              <p className="text-xs text-gray-500" data-testid="text-rdw-remap-skipped">
                {plan.notFound.length > 0 && t("vehicles:rdwTypeRemap.notFoundList", { plates: plan.notFound.map(formatLicensePlate).join(", ") })}
                {plan.notFound.length > 0 && plan.failed.length > 0 ? " " : ""}
                {plan.failed.length > 0 && t("vehicles:rdwTypeRemap.failedList", { plates: plan.failed.map(formatLicensePlate).join(", ") })}
              </p>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("vehicles:rdwTypeRemap.confirmTitle")}
        description={t("vehicles:rdwTypeRemap.confirmDescription", { count: rows.length })}
        confirmLabel={t("vehicles:rdwTypeRemap.confirmButton")}
        variant="warning"
        onConfirm={() => applyMutation.mutate()}
        confirmTestId="button-rdw-remap-apply-confirm"
      />
    </Card>
  );
}
