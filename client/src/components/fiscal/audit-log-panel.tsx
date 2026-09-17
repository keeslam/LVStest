import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditEvent } from "./types";

/** The fiscal audit trail: read only, newest first. */
export function AuditLogPanel() {
  const { t } = useTranslation("fiscal");
  const { data = [], isLoading } = useQuery<AuditEvent[]>({ queryKey: ["/api/fiscal/audit", { limit: 200 }] });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("audit.title")}</CardTitle>
        <CardDescription>{t("audit.description")}</CardDescription>
      </CardHeader>
      <CardContent>
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
                    <td className="py-1 pr-2 whitespace-nowrap">{new Date(e.occurredAt).toLocaleString("nl-NL")}</td>
                    <td className="py-1 pr-2">{e.username}{e.role ? <span className="text-muted-foreground"> ({e.role})</span> : null}</td>
                    <td className="py-1 pr-2">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</td>
                    <td className="py-1 pr-2">
                      {e.entityType}{e.entityId !== null ? ` #${e.entityId}` : ""}
                      {e.ruleVersionId !== null ? ` · versie-id ${e.ruleVersionId}` : ""}
                      {e.parameterKey ? ` · ${e.parameterKey}` : ""}
                    </td>
                    <td className="py-1 pr-2">{e.oldValue !== null || e.newValue !== null ? `${e.oldValue ?? "—"} → ${e.newValue ?? "—"}${e.unit ? ` (${e.unit})` : ""}` : ""}</td>
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
