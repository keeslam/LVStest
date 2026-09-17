import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { dateLabelNl } from "@shared/fiscal-format";
import { MISSING_DATA_LABELS, REVIEW_REASON_LABELS, REVIEW_RESOLUTIONS, type MissingDataCode, type ReviewReasonCode } from "@shared/fiscal-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFiscalPermissions } from "./use-fiscal-permissions";
import type { ReviewCaseRow } from "./types";

function reasonLabel(code: string): string {
  return MISSING_DATA_LABELS[code as MissingDataCode] ?? REVIEW_REASON_LABELS[code as ReviewReasonCode] ?? code;
}

/** The queue of periods a person must decide on (03-schema-en-dataflow.md §4.5). */
export function ReviewQueue() {
  const { t } = useTranslation("fiscal");
  const { userId } = useFiscalPermissions();
  const queryClient = useQueryClient();
  const openKey = ["/api/fiscal/review-cases", { status: "open" }] as const;
  const busyKey = ["/api/fiscal/review-cases", { status: "in_progress" }] as const;
  const { data: open = [] } = useQuery<ReviewCaseRow[]>({ queryKey: openKey });
  const { data: busy = [] } = useQuery<ReviewCaseRow[]>({ queryKey: busyKey });
  const rows = [...busy, ...open];
  const [resolving, setResolving] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string>("confirmed_manually");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => (await apiRequest("PATCH", `/api/fiscal/review-cases/${id}`, body)).json(),
    onSuccess: () => {
      setError(null);
      setResolving(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal/review-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal/overview"] });
    },
    onError: (e: Error) => setError(e.message.replace(/^\d{3}:\s*/, "")),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("review.title")}</CardTitle>
        <CardDescription>{t("review.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("review.none")}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">{t("review.customer")}</th>
                  <th className="py-1 pr-2 font-normal">{t("review.vehicle")}</th>
                  <th className="py-1 pr-2 font-normal">{t("review.period")}</th>
                  <th className="py-1 pr-2 font-normal">{t("review.reasons")}</th>
                  <th className="py-1 pr-2 font-normal">{t("review.status")}</th>
                  <th className="py-1 pr-2 font-normal">{t("review.assigned")}</th>
                  <th className="py-1 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t align-top" data-testid={`review-case-${c.id}`}>
                    <td className="py-2 pr-2">{c.customerName ?? c.customerId}</td>
                    <td className="py-2 pr-2">
                      {c.licensePlate ?? "—"}
                      {c.reservationId && <div className="text-xs text-muted-foreground">{t("review.reservation", { id: c.reservationId })}</div>}
                    </td>
                    <td className="py-2 pr-2">
                      {c.periodStart ? dateLabelNl(c.periodStart) : "—"} t/m {c.periodEnd ? dateLabelNl(c.periodEnd) : "…"}
                    </td>
                    <td className="py-2 pr-2">
                      <ul className="list-disc pl-4">
                        {c.reasons.map((r) => (
                          <li key={r}>{reasonLabel(r)}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2 pr-2">{t(`review.statuses.${c.status}`)}</td>
                    <td className="py-2 pr-2">{c.assignedToName ?? t("review.unassigned")}</td>
                    <td className="py-2">
                      {resolving === c.id ? (
                        <div className="space-y-1">
                          <select className="w-full rounded-md border px-2 py-1 text-xs" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                            {REVIEW_RESOLUTIONS.map((r) => (
                              <option key={r} value={r}>{t(`review.resolutions.${r}`)}</option>
                            ))}
                          </select>
                          <Input className="h-8 text-xs" placeholder={t("review.resolutionNote")} value={note} onChange={(e) => setNote(e.target.value)} />
                          <div className="flex gap-1">
                            <Button size="sm" disabled={!note.trim() || patch.isPending} onClick={() => patch.mutate({ id: c.id, body: { status: resolution === "dismissed" ? "dismissed" : "resolved", resolution, resolutionNote: note } })}>{t("review.save")}</Button>
                            <Button size="sm" variant="ghost" onClick={() => setResolving(null)}>{t("review.cancel")}</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {c.assignedToId !== userId && userId !== null && (
                            <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: c.id, body: { status: "in_progress", assignedToId: userId } })}>{t("review.assignToMe")}</Button>
                          )}
                          <Button size="sm" onClick={() => { setResolving(c.id); setNote(""); }}>{t("review.resolve")}</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
