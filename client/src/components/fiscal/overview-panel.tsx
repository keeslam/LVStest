import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FISCAL_ASSESSMENT_STATUSES, FISCAL_STATUS_LABELS } from "@shared/fiscal-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { OverviewResponse } from "./types";

const TONE: Record<string, string> = {
  APPLICABLE: "border-red-200 bg-red-50",
  POSSIBLY_APPLICABLE: "border-amber-200 bg-amber-50",
  NOT_APPLICABLE: "border-green-200 bg-green-50",
  MANUAL_REVIEW_REQUIRED: "border-amber-300 bg-amber-100",
  DATA_INSUFFICIENT: "border-slate-300 bg-slate-100",
  CONFIGURATION_INVALID: "border-red-300 bg-red-100",
  RULE_NOT_AVAILABLE: "border-slate-200 bg-slate-50",
};

export function OverviewPanel() {
  const { t } = useTranslation("fiscal");
  const { data, isLoading, error } = useQuery<OverviewResponse>({ queryKey: ["/api/fiscal/overview"] });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (error || !data) return <p className="text-sm text-destructive">{t("common.error", { message: (error as Error)?.message ?? "" })}</p>;

  return (
    <div className="space-y-4">
      {data.currentVersionStatus === "RULE_NOT_AVAILABLE" && (
        <Alert data-testid="overview-no-version">
          <AlertDescription>{t("overview.noVersion")}</AlertDescription>
        </Alert>
      )}
      {data.currentVersionStatus === "CONFIGURATION_INVALID" && (
        <Alert variant="destructive">
          <AlertDescription>{t("overview.configInvalid")}</AlertDescription>
        </Alert>
      )}
      {data.currentVersion && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("overview.currentVersion")}: </span>
          <span className="font-medium">{data.currentVersion.title}</span> <span className="text-muted-foreground">({t("config.version", { n: data.currentVersion.versionNumber })})</span>
        </p>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("overview.title")}</CardTitle>
          <CardDescription>{t("common.disclaimer")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {FISCAL_ASSESSMENT_STATUSES.map((status) => (
              <div key={status} className={`rounded-md border p-3 ${TONE[status]}`} data-testid={`tile-${status}`}>
                <div className="text-2xl font-semibold">{data.byStatus[status] ?? 0}</div>
                <div className="text-xs text-muted-foreground">{FISCAL_STATUS_LABELS[status]}</div>
              </div>
            ))}
            <div className="rounded-md border p-3" data-testid="tile-open-periods">
              <div className="text-2xl font-semibold">{data.openPeriods}</div>
              <div className="text-xs text-muted-foreground">{t("overview.openPeriods")}</div>
            </div>
            <div className="rounded-md border p-3" data-testid="tile-unassessed">
              <div className="text-2xl font-semibold">{data.unassessedPeriods}</div>
              <div className="text-xs text-muted-foreground">{t("overview.unassessed")}</div>
            </div>
            <div className="rounded-md border p-3" data-testid="tile-open-cases">
              <div className="text-2xl font-semibold">{data.openReviewCases}</div>
              <div className="text-xs text-muted-foreground">{t("overview.openCases")}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
