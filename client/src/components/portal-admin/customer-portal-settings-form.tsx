import { describeApiError } from "@/lib/api-error";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalCustomerSettings } from "@shared/schema";
import { COMPANY_MAIL_KEYS } from "@shared/portal-mail-preferences";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FLAGS = ["portalEnabled", "canBook", "canManageDrivers", "canSubmitRequests", "canReturn", "canViewFines", "canViewContracts", "showPrices"] as const;
// Fiscal mobility check (docs/fiscaal §1.8): visibility and notifications for this customer; never a fiscal parameter.
const FISCAL_FLAGS = ["fiscalMobilityEnabled", "pseudoEindheffingEnabled", "fiscalDashboardEnabled", "fiscalWarningsEnabled", "fiscalReportsEnabled", "driverFiscalVisibilityEnabled"] as const;

// E-mails to the company address; the customer's own admin account can change these too (portal, "Mijn account").
const MAIL_FLAGS = COMPANY_MAIL_KEYS;

const ALL_FLAGS = [...FLAGS, ...FISCAL_FLAGS, ...MAIL_FLAGS] as const;

export function CustomerPortalSettingsForm({ customerId, readOnly }: { customerId: number; readOnly?: boolean }) {
  const { t, i18n } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["/api/portal-admin/customers", customerId, "settings"] as const;
  const { data } = useQuery<PortalCustomerSettings>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `/api/portal-admin/customers/${customerId}/settings`)).json(),
  });
  const [notes, setNotes] = useState("");
  // The toast fades; this line stays, so staff can see afterwards that the last change was stored.
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => { setNotes(data?.internalNotes ?? ""); }, [data?.internalNotes]);

  const save = useMutation({
    mutationFn: async (patch: Partial<PortalCustomerSettings>) => (await apiRequest("PATCH", `/api/portal-admin/customers/${customerId}/settings`, patch)).json(),
    onSuccess: (row, patch) => {
      queryClient.setQueryData(key, row);
      setSavedAt(new Date());
      // Name the switch and its new state, so the message says what was stored.
      const [flag, value] = Object.entries(patch).find(([k]) => (ALL_FLAGS as readonly string[]).includes(k)) ?? [];
      toast({ title: flag ? t("admin.settings.savedFlag", { label: t(`admin.settings.${flag}`), state: t(value ? "admin.settings.stateOn" : "admin.settings.stateOff") }) : t("admin.settings.saved") });
    },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });
  if (!data) return null;

  // A switch row: label, one line of help, and the switch itself.
  const flagRow = (flag: (typeof ALL_FLAGS)[number], extra?: { disabled?: boolean; testId?: string }) => (
    <div key={flag} className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <Label htmlFor={`ps-${flag}`} className="text-sm">{t(`admin.settings.${flag}`)}</Label>
        <p id={`ps-${flag}-help`} className="text-xs text-muted-foreground">{t(`admin.settings.help.${flag}`)}</p>
      </div>
      <Switch id={`ps-${flag}`} aria-describedby={`ps-${flag}-help`} checked={data[flag]} disabled={readOnly || save.isPending || extra?.disabled}
        onCheckedChange={(v) => save.mutate({ [flag]: v })} data-testid={extra?.testId} />
    </div>
  );
  // The dependants only mean something while the main fiscal switch is on. One that was left on stays reachable, to turn it off.
  const fiscalOff = !data.fiscalMobilityEnabled;
  const fiscalRows: ReactNode[] = FISCAL_FLAGS.map((flag) =>
    flagRow(flag, { disabled: flag !== "fiscalMobilityEnabled" && fiscalOff && !data[flag], testId: `switch-${flag}` }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{t("admin.settings.title")}</h3>
        <p className="text-xs text-green-700" role="status" aria-live="polite" data-testid="settings-saved">
          {savedAt ? t("admin.settings.savedInline", { time: savedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) }) : ""}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{FLAGS.map((flag) => flagRow(flag))}</div>
      <h4 className="text-sm font-medium">{t("admin.settings.mailTitle")}</h4>
      <div className="grid gap-3 sm:grid-cols-2">{MAIL_FLAGS.map((flag) => flagRow(flag, { testId: `switch-${flag}` }))}</div>
      <h4 className="text-sm font-medium">{t("admin.settings.fiscalTitle")}</h4>
      {fiscalOff && <p className="text-xs text-muted-foreground">{t("admin.settings.fiscalNeedsMaster")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{fiscalRows}</div>
      <div>
        <Label htmlFor="ps-notes">{t("admin.settings.internalNotes")}</Label>
        <Textarea id="ps-notes" value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} rows={4} />
        {!readOnly && (
          <Button size="sm" className="mt-2" disabled={save.isPending || notes === (data.internalNotes ?? "")} onClick={() => save.mutate({ internalNotes: notes })}>
            {t("admin.dialog.save")}
          </Button>
        )}
      </div>
    </div>
  );
}
