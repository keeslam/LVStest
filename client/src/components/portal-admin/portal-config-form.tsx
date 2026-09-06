import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalConfig } from "@shared/portal-types";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Globe } from "lucide-react";

const KEY = ["/api/portal-admin/config"];

export function PortalConfigForm() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<PortalConfig>({ queryKey: KEY, queryFn: async () => (await apiRequest("GET", KEY[0])).json() });
  const [origins, setOrigins] = useState("");
  const [email, setEmail] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [pickupInstructions, setPickupInstructions] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (!data) return;
    setOrigins(data.allowedFrameOrigins.join("\n"));
    setEmail(data.notificationEmail);
    setBaseUrl(data.portalBaseUrl);
    setPickupAddress(data.pickupAddress ?? ""); setOpeningHours(data.openingHours ?? ""); setPickupInstructions(data.pickupInstructions ?? ""); setPrivacyUrl(data.privacyUrl ?? "");
    setPhone(data.phone ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", KEY[0], {
      allowedFrameOrigins: origins.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      notificationEmail: email.trim(),
      portalBaseUrl: baseUrl.trim().replace(/\/$/, ""),
      pickupAddress: pickupAddress.trim(), openingHours: openingHours.trim(), pickupInstructions: pickupInstructions.trim(), privacyUrl: privacyUrl.trim(),
      phone: phone.trim(),
    })).json(),
    onSuccess: (saved) => { queryClient.setQueryData(KEY, saved); toast({ title: t("admin.config.saved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />{t("admin.config.title")}</CardTitle>
        <CardDescription>{t("admin.config.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="pc-origins">{t("admin.config.allowedFrameOrigins")}</Label>
          <Textarea id="pc-origins" rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={"https://lamgroep.nl\nhttps://www.lamgroep.nl"} />
        </div>
        <div>
          <Label htmlFor="pc-email">{t("admin.config.notificationEmail")}</Label>
          <Input id="pc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pc-base">{t("admin.config.portalBaseUrl")}</Label>
          <Input id="pc-base" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
          <div><Label htmlFor="pc-addr">{t("admin.config.pickupAddress")}</Label><Input id="pc-addr" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} /></div>
          <div><Label htmlFor="pc-hours">{t("admin.config.openingHours")}</Label><Input id="pc-hours" value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} /></div>
          <div className="md:col-span-2"><Label htmlFor="pc-instr">{t("admin.config.pickupInstructions")}</Label><Textarea id="pc-instr" rows={2} value={pickupInstructions} onChange={(e) => setPickupInstructions(e.target.value)} /></div>
          <div><Label htmlFor="pc-privacy">{t("admin.config.privacyUrl")}</Label><Input id="pc-privacy" type="url" value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} /></div>
          <div><Label htmlFor="pc-phone">{t("admin.config.phone")}</Label><Input id="pc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">{t("admin.config.templatesHint")}</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-portal-config">{t("admin.dialog.save")}</Button>
      </CardContent>
    </Card>
  );
}
