import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalCustomerSettings } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FLAGS = ["portalEnabled", "canBook", "canManageDrivers", "canSubmitRequests", "canViewFines", "canViewContracts", "showPrices"] as const;

export function CustomerPortalSettingsForm({ customerId, readOnly }: { customerId: number; readOnly?: boolean }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["/api/portal-admin/customers", customerId, "settings"] as const;
  const { data } = useQuery<PortalCustomerSettings>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `/api/portal-admin/customers/${customerId}/settings`)).json(),
  });
  const [notes, setNotes] = useState("");
  useEffect(() => { setNotes(data?.internalNotes ?? ""); }, [data?.internalNotes]);

  const save = useMutation({
    mutationFn: async (patch: Partial<PortalCustomerSettings>) => (await apiRequest("PATCH", `/api/portal-admin/customers/${customerId}/settings`, patch)).json(),
    onSuccess: (row) => { queryClient.setQueryData(key, row); toast({ title: t("admin.settings.saved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  if (!data) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-medium">{t("admin.settings.title")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {FLAGS.map((flag) => (
          <div key={flag} className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor={`ps-${flag}`} className="text-sm">{t(`admin.settings.${flag}`)}</Label>
            <Switch id={`ps-${flag}`} checked={data[flag]} disabled={readOnly || save.isPending} onCheckedChange={(v) => save.mutate({ [flag]: v })} />
          </div>
        ))}
      </div>
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
