import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Wrench, CalendarClock } from "lucide-react";
import type { PortalRequestDto } from "@shared/portal-requests";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PeriodPicker } from "@/components/portal/period-picker";

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

/** What the customer filled in, for both maintenance and maintenance_change requests. */
export function MaintenanceSummary({ request: r, blockDate }: { request: PortalRequestDto; blockDate?: string | null }) {
  const { t } = useTranslation("portal");
  const p = r.payload as Record<string, unknown>;
  const row = (label: string, value: unknown) => value === undefined || value === null || value === "" ? null : <div className="grid gap-0.5 sm:grid-cols-3"><dt className="text-muted-foreground">{label}</dt><dd className="sm:col-span-2">{String(value)}</dd></div>;
  return (
    <dl className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm" data-testid="maintenance-summary">
      <div className="mb-1 font-medium">{t("admin.maintenance.summary")}</div>
      {r.type === "maintenance" ? (<>
        {row(t("admin.maintenance.issue"), p.issue)}
        {row(t("admin.maintenance.mileage"), p.mileage)}
        {row(t("admin.maintenance.urgent"), p.urgent ? t("requests.form.yes") : null)}
        {row(t("admin.maintenance.wantsReplacement"), p.needsReplacement ? t("requests.form.yes") : null)}
        {row(t("admin.maintenance.preferredDate"), p.preferredDate)}
      </>) : (<>
        {row(t("admin.maintenance.currentDate"), blockDate)}
        {row(t("admin.maintenance.requestedDate"), p.newDate)}
        {row(t("admin.maintenance.reason"), p.reason)}
        {row(t("admin.maintenance.wantsReplacement"), p.needsReplacement ? t("requests.form.yes") : null)}
      </>)}
    </dl>
  );
}

/** Staff put the reported maintenance in the calendar, or move an existing block. */
export function MaintenanceApproval({ request: r, onApproved }: { request: PortalRequestDto; onApproved: (blockId: number) => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const p = r.payload as Record<string, string | undefined>;
  const isChange = r.type === "maintenance_change";
  const [startDate, setStartDate] = useState((isChange ? p.newDate : p.preferredDate) || tomorrow());
  const [days, setDays] = useState(1);
  const [category, setCategory] = useState<"scheduled_maintenance" | "repair">(p.urgent ? "repair" : "scheduled_maintenance");
  const [note, setNote] = useState("");
  useEffect(() => { setStartDate((isChange ? p.newDate : p.preferredDate) || tomorrow()); setDays(1); setNote(""); }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/portal-requests/${r.id}/approve`, isChange
      ? { startDate, durationDays: days, note: note.trim() || undefined }
      : { startDate, durationDays: days, category, note: note.trim() || undefined })).json(),
    onSuccess: (data: { block: { id: number } }) => { toast({ title: t(isChange ? "admin.maintenance.moved" : "admin.maintenance.created", { id: data.block.id }) }); onApproved(data.block.id); },
    onError: (e: Error) => toast({ title: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" data-testid="maintenance-approval">
      <div className="flex items-center gap-2 font-medium">{isChange ? <CalendarClock className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}{t(isChange ? "admin.maintenance.moveTitle" : "admin.maintenance.title")}</div>
      <div className="grid gap-2 md:grid-cols-3">
        <div><Label htmlFor="ma-date">{t("admin.maintenance.date")}</Label><PeriodPicker id="ma-date" start={startDate} end="" single onChange={(s) => setStartDate(s)} testId="maintenance-date" /></div>
        <div><Label htmlFor="ma-days">{t("admin.maintenance.duration")}</Label><Input id="ma-days" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} data-testid="input-maintenance-days" /></div>
        {!isChange && (
          <div><Label htmlFor="ma-cat">{t("admin.maintenance.category")}</Label>
            <select id="ma-cat" className="w-full rounded-md border px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as "scheduled_maintenance" | "repair")} data-testid="select-maintenance-category">
              <option value="scheduled_maintenance">{t("admin.maintenance.categoryService")}</option>
              <option value="repair">{t("admin.maintenance.categoryRepair")}</option>
            </select>
          </div>
        )}
      </div>
      {p.needsReplacement && <p className="text-xs text-amber-900">{t("admin.maintenance.placeholderNote")}</p>}
      <div><Label htmlFor="ma-note">{t("admin.maintenance.note")}</Label><Textarea id="ma-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <Button size="sm" disabled={approve.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)} onClick={() => approve.mutate()} data-testid="button-approve-maintenance">{t(isChange ? "admin.maintenance.move" : "admin.maintenance.approve")}</Button>
    </div>
  );
}
