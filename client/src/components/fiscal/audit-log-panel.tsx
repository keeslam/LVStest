import { formatDateTime } from "@/lib/format-utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FISCAL_AUDIT_ACTIONS } from "@shared/fiscal-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AuditEvent } from "./types";

/** What the system writes by itself, many times a day; it hides the changes people made. */
const AUTOMATIC_ACTION = "profile_refreshed";
const plateKey = (value: string) => value.replace(/[^a-z0-9]/gi, "").toUpperCase();

/** The fiscal audit trail: read only, newest first, filterable by action and plate. */
export function AuditLogPanel() {
  const { t } = useTranslation("fiscal");
  const [action, setAction] = useState("all");
  const [hideRefreshes, setHideRefreshes] = useState(true);
  const [plate, setPlate] = useState("");
  // Filtering happens on the server, so the 200 rows are the ones asked for and not whatever came last.
  const params: Record<string, string | number> = { limit: 200 };
  if (action !== "all") params.action = action;
  else if (hideRefreshes) params.excludeAction = AUTOMATIC_ACTION;
  const { data: rows = [], isLoading } = useQuery<AuditEvent[]>({ queryKey: ["/api/fiscal/audit", params] });
  const wanted = plateKey(plate);
  const data = wanted ? rows.filter((e) => plateKey(e.licensePlate ?? "").includes(wanted)) : rows;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("audit.title")}</CardTitle>
        <CardDescription>{t("audit.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="audit-filter-action" className="text-xs text-muted-foreground">{t("audit.filterAction")}</label>
            <select id="audit-filter-action" className="block h-9 rounded-md border px-2 text-sm" value={action} onChange={(e) => setAction(e.target.value)} data-testid="audit-filter-action">
              <option value="all">{t("audit.allActions")}</option>
              {FISCAL_AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{t(`audit.actions.${a}`, { defaultValue: a })}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="audit-filter-plate" className="text-xs text-muted-foreground">{t("audit.filterVehicle")}</label>
            <Input id="audit-filter-plate" className="h-9 w-40" value={plate} placeholder={t("audit.filterVehiclePlaceholder")} onChange={(e) => setPlate(e.target.value)} data-testid="audit-filter-plate" />
          </div>
          <div className="flex items-center gap-2 pb-2 text-sm">
            <input id="audit-hide-refreshes" type="checkbox" checked={hideRefreshes && action === "all"} disabled={action !== "all"} onChange={(e) => setHideRefreshes(e.target.checked)} data-testid="audit-hide-refreshes" />
            <label htmlFor="audit-hide-refreshes">{t("audit.hideRefreshes")}</label>
          </div>
        </div>
        {!isLoading && data.length > 0 && <p className="mb-2 text-xs text-muted-foreground" data-testid="audit-shown">{t("audit.shown", { count: data.length })}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!isLoading && data.length === 0 && <p className="text-sm text-muted-foreground">{t("audit.none")}</p>}
        {data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">{t("audit.when")}</th>
                  <th className="py-1 pr-2 font-normal">{t("audit.who")}</th>
                  <th className="py-1 pr-2 font-normal">{t("audit.action")}</th>
                  <th className="py-1 pr-2 font-normal">{t("audit.what")}</th>
                  <th className="py-1 pr-2 font-normal">{t("audit.oldNew")}</th>
                  <th className="py-1 font-normal">{t("audit.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className="border-t align-top" data-testid={`audit-event-${e.id}`}>
                    <td className="py-1 pr-2 whitespace-nowrap">{formatDateTime(e.occurredAt)}</td>
                    <td className="py-1 pr-2">{e.username}{e.role ? <span className="text-muted-foreground"> ({e.role})</span> : null}</td>
                    <td className="py-1 pr-2">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</td>
                    <td className="py-1 pr-2">
                      {t(`audit.entities.${e.entityType}`, { defaultValue: e.entityType })}
                      {e.licensePlate ? ` ${e.licensePlate}` : e.entityId !== null ? ` #${e.entityId}` : ""}
                      {e.ruleVersionId !== null ? ` · versie-id ${e.ruleVersionId}` : ""}
                      {e.parameterKey ? ` · ${e.parameterLabel ?? e.parameterKey}` : ""}
                    </td>
                    <td className="py-1 pr-2">{e.oldValue !== null || e.newValue !== null ? `${e.oldValueLabel ?? e.oldValue ?? "—"} → ${e.newValueLabel ?? e.newValue ?? "—"}${e.unit ? ` (${e.unit})` : ""}` : ""}</td>
                    <td className="py-1">{e.reasonText ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
