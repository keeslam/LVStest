/**
 * Round 2 punt 11 part B (Kees, 2026-10-21) — the notification centre's settings,
 * now real. The old card only showed a toast ("in a real application, save these
 * settings"); these are the same values as App-instellingen > Kalender:
 * APK, warranty, low-emission zone / Move IZI, upcoming rentals and "factuur
 * ontbreekt" days (system settings), plus the weekly "factuur ontbreekt" mail
 * (app setting `missing_invoice_mail`). Saving needs "Instellingen beheren".
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { useHasPermission } from "@/hooks/use-has-permission";
import { UserPermission } from "@shared/schema";
import {
  MISSING_INVOICE_COLUMNS,
  MISSING_INVOICE_MAIL_KEY,
  missingInvoiceMailFromSetting,
  type MissingInvoiceMailSettings,
} from "@shared/missing-invoice";

type DayKey = "apkReminderDays" | "warrantyReminderDays" | "zoneReminderDays" | "upcomingReservationDays" | "missingInvoiceDays";
const DAY_FIELDS: Array<{ key: DayKey; fallback: number }> = [
  { key: "apkReminderDays", fallback: 30 },
  { key: "warrantyReminderDays", fallback: 30 },
  { key: "zoneReminderDays", fallback: 30 },
  { key: "upcomingReservationDays", fallback: 2 },
  { key: "missingInvoiceDays", fallback: 14 },
];

type SystemSettings = Partial<Record<DayKey, number>> & { updatedAt?: string };

export function NotificationSettingsCard({ className }: { className?: string }) {
  const { t } = useTranslation("notifications");
  const { toast } = useToast();
  const canManage = useHasPermission(UserPermission.MANAGE_SETTINGS);
  const { data: system } = useQuery<SystemSettings>({ queryKey: ["/api/system-settings"] });
  const { data: mailSetting, isSuccess: mailLoaded } = useQuery<{ value?: unknown } | null>({
    queryKey: [`/api/app-settings/key/${MISSING_INVOICE_MAIL_KEY}`],
    enabled: canManage,
  });

  const [days, setDays] = useState<Record<DayKey, string>>(() =>
    Object.fromEntries(DAY_FIELDS.map((f) => [f.key, String(f.fallback)])) as Record<DayKey, string>,
  );
  const [mail, setMail] = useState<MissingInvoiceMailSettings>(missingInvoiceMailFromSetting(null));
  const [recipients, setRecipients] = useState("");

  useEffect(() => {
    if (!system) return;
    setDays(Object.fromEntries(DAY_FIELDS.map((f) => [f.key, String(system[f.key] ?? f.fallback)])) as Record<DayKey, string>);
  }, [system]);
  useEffect(() => {
    if (!mailLoaded) return;
    const m = missingInvoiceMailFromSetting(mailSetting?.value);
    setMail(m);
    setRecipients(m.recipients.join(", "));
  }, [mailLoaded, mailSetting]);

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = { updatedAt: system?.updatedAt ?? undefined };
      for (const f of DAY_FIELDS) {
        const n = parseInt(days[f.key], 10);
        patch[f.key] = Number.isInteger(n) && n > 0 && n <= 365 ? n : f.fallback;
      }
      await apiRequest("PUT", "/api/system-settings", patch);
      const value = { ...mail, recipients: recipients.split(/[,;\s]+/).map((r) => r.trim()).filter(Boolean) };
      await apiRequest("POST", "/api/app-settings", {
        key: MISSING_INVOICE_MAIL_KEY,
        value,
        category: "notifications",
        description: "Wekelijkse mail met werkplaatsbezoeken zonder factuur",
      });
    },
    onSuccess: () => {
      invalidateByPrefix("/api/system-settings");
      invalidateByPrefix("/api/app-settings");
      invalidateByPrefix("/api/maintenance-blocks/missing-invoices");
      invalidateByPrefix("/api/vehicles/");
      toast({ title: t("settingsCard.saved") });
    },
    onError: (error) => toast({ variant: "destructive", title: t("settingsCard.saveFailed"), description: describeApiError(error) }),
  });

  const sendNow = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/maintenance-blocks/missing-invoices/send-now")).json(),
    onSuccess: (r: { sent: boolean; reason?: string; count: number }) => {
      toast({
        title: r.sent ? t("settingsCard.sendNowSent", { count: r.count }) : t(`settingsCard.sendNowNot.${r.reason ?? "send-failed"}`),
        variant: r.sent ? "default" : "destructive",
      });
    },
    onError: (error) => toast({ variant: "destructive", title: t("settingsCard.saveFailed"), description: describeApiError(error) }),
  });

  const toggleColumn = (c: (typeof MISSING_INVOICE_COLUMNS)[number], on: boolean) =>
    setMail((m) => ({ ...m, columns: MISSING_INVOICE_COLUMNS.filter((x) => (x === c ? on : m.columns.includes(x))) }));

  return (
    <Card className={className} data-testid="notification-settings-card">
      <CardHeader>
        <CardTitle>{t("notificationsPage.settingsCardTitle")}</CardTitle>
        <CardDescription>{canManage ? t("settingsCard.description") : t("settingsCard.readOnly")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {DAY_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`notif-${f.key}`} className="text-sm">{t(`settingsCard.days.${f.key}`)}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`notif-${f.key}`}
                  type="number"
                  min={1}
                  max={365}
                  className="w-20"
                  value={days[f.key]}
                  disabled={!canManage}
                  onChange={(e) => setDays((d) => ({ ...d, [f.key]: e.target.value }))}
                  data-testid={`input-notif-${f.key}`}
                />
                <span className="text-sm text-muted-foreground">{t("settingsCard.daysUnit")}</span>
              </div>
            </div>
          ))}
        </div>

        {canManage && (
          <div className="space-y-3 border-t pt-4" data-testid="missing-invoice-mail-settings">
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" />{t("settingsCard.mail.title")}</Label>
              <Switch checked={mail.enabled} onCheckedChange={(v) => setMail((m) => ({ ...m, enabled: v }))} data-testid="switch-missing-invoice-mail" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mail-recipients" className="text-sm">{t("settingsCard.mail.recipients")}</Label>
              <Input id="mail-recipients" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="administratie@bedrijf.nl, kees@bedrijf.nl" data-testid="input-mail-recipients" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-sm">{t("settingsCard.mail.weekday")}</Label>
                <Select value={String(mail.weekday)} onValueChange={(v) => setMail((m) => ({ ...m, weekday: Number(v) }))}>
                  <SelectTrigger data-testid="select-mail-weekday"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <SelectItem key={d} value={String(d)}>{t(`settingsCard.weekdays.${d}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mail-time" className="text-sm">{t("settingsCard.mail.time")}</Label>
                <Input id="mail-time" type="time" value={mail.time} onChange={(e) => setMail((m) => ({ ...m, time: e.target.value }))} data-testid="input-mail-time" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mail-subject" className="text-sm">{t("settingsCard.mail.subject")}</Label>
              <Input id="mail-subject" value={mail.subject} maxLength={200} onChange={(e) => setMail((m) => ({ ...m, subject: e.target.value }))} data-testid="input-mail-subject" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mail-intro" className="text-sm">{t("settingsCard.mail.intro")}</Label>
              <Textarea id="mail-intro" rows={3} value={mail.intro} maxLength={2000} onChange={(e) => setMail((m) => ({ ...m, intro: e.target.value }))} data-testid="input-mail-intro" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">{t("settingsCard.mail.columns")}</Label>
              <div className="grid grid-cols-2 gap-1">
                {MISSING_INVOICE_COLUMNS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={mail.columns.includes(c)} onCheckedChange={(v) => toggleColumn(c, v === true)} data-testid={`checkbox-mail-column-${c}`} />
                    {t(`settingsCard.columns.${c}`)}
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("settingsCard.mail.hint")}</p>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => sendNow.mutate()} disabled={sendNow.isPending} data-testid="button-mail-send-now">
              <Send className="h-4 w-4 mr-1" />
              {t("settingsCard.sendNow")}
            </Button>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-notification-settings">
              {t("settingsCard.save")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
