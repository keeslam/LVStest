import { describeApiError } from "@/lib/api-error";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Globe, Car } from "lucide-react";

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
  const [returnInstructions, setReturnInstructions] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [phone, setPhone] = useState("");
  // A-12-10: the fee a new fine starts with. Kept as text while typing; validated on save.
  const [fineAdminFee, setFineAdminFee] = useState("0");
  const [feeError, setFeeError] = useState(false);
  useEffect(() => {
    if (!data) return;
    setOrigins(data.allowedFrameOrigins.join("\n"));
    setEmail(data.notificationEmail);
    setBaseUrl(data.portalBaseUrl);
    setPickupAddress(data.pickupAddress ?? ""); setOpeningHours(data.openingHours ?? ""); setPickupInstructions(data.pickupInstructions ?? ""); setReturnInstructions(data.returnInstructions ?? ""); setDeliveryNote(data.deliveryNote ?? ""); setPrivacyUrl(data.privacyUrl ?? "");
    setPhone(data.phone ?? "");
    setFineAdminFee(String(data.fineAdminFee ?? 0)); setFeeError(false);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", KEY[0], {
      allowedFrameOrigins: origins.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      notificationEmail: email.trim(),
      portalBaseUrl: baseUrl.trim().replace(/\/$/, ""),
      pickupAddress: pickupAddress.trim(), openingHours: openingHours.trim(), pickupInstructions: pickupInstructions.trim(), returnInstructions: returnInstructions.trim(), deliveryNote: deliveryNote.trim(), privacyUrl: privacyUrl.trim(),
      phone: phone.trim(),
      fineAdminFee: Number(fineAdminFee),
      onlineBookingEnabled: data?.onlineBookingEnabled ?? true,
    })).json(),
    onSuccess: (saved) => { queryClient.setQueryData(KEY, saved); toast({ title: t("admin.config.saved") }); },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });

  // Kees, 2026-10-18: renting the online vehicles on or off for the whole portal. Saved at once, like a
  // light switch; the rest of the stored configuration goes along unchanged.
  const toggleOnlineBooking = useMutation({
    mutationFn: async (onlineBookingEnabled: boolean) => (await apiRequest("PUT", KEY[0], { ...data, onlineBookingEnabled })).json(),
    onSuccess: (saved: PortalConfig) => {
      // A server that does not know the switch yet (still running older code) answers without it.
      if (typeof saved.onlineBookingEnabled !== "boolean") {
        toast({ title: t("admin.config.onlineBookingNotSaved"), variant: "destructive" });
        return;
      }
      queryClient.setQueryData(KEY, saved);
      toast({ title: saved.onlineBookingEnabled ? t("admin.config.onlineBookingOnDone") : t("admin.config.onlineBookingOffDone") });
    },
    onError: (e: Error) => toast({ title: describeApiError(e), variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />{t("admin.config.title")}</CardTitle>
        <CardDescription>{t("admin.config.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-md border p-3" data-testid="portal-online-booking-switch-row">
          <div className="space-y-1">
            <Label htmlFor="pc-online-booking" className="flex items-center gap-2 font-medium"><Car className="h-4 w-4" />{t("admin.config.onlineBookingEnabled")}</Label>
            <p className="text-xs text-muted-foreground">{t("admin.config.onlineBookingEnabledHint")}</p>
          </div>
          <Switch id="pc-online-booking" checked={data?.onlineBookingEnabled ?? true} disabled={!data || toggleOnlineBooking.isPending}
            onCheckedChange={(v) => toggleOnlineBooking.mutate(v)} data-testid="switch-portal-online-booking" />
        </div>
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
          <div className="md:col-span-2"><Label htmlFor="pc-return">{t("admin.config.returnInstructions")}</Label><Textarea id="pc-return" rows={2} value={returnInstructions} onChange={(e) => setReturnInstructions(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{t("admin.config.returnInstructionsHint")}</p></div>
          <div className="md:col-span-2"><Label htmlFor="pc-delivery-note">{t("admin.config.deliveryNote")}</Label><Textarea id="pc-delivery-note" rows={2} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{t("admin.config.deliveryNoteHint")}</p></div>
          <div><Label htmlFor="pc-privacy">{t("admin.config.privacyUrl")}</Label><Input id="pc-privacy" type="url" value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} /></div>
          <div><Label htmlFor="pc-phone">{t("admin.config.phone")}</Label><Input id="pc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="border-t pt-4 md:w-1/2">
          <Label htmlFor="pc-fine-fee">{t("admin.config.fineAdminFee")}</Label>
          <Input id="pc-fine-fee" type="number" inputMode="decimal" min="0" step="0.01" value={fineAdminFee}
            onChange={(e) => { setFineAdminFee(e.target.value); setFeeError(false); }} aria-invalid={feeError} aria-describedby="pc-fine-fee-help"
            data-testid="input-portal-fine-admin-fee" />
          <p id="pc-fine-fee-help" className={`mt-1 text-xs ${feeError ? "text-destructive" : "text-muted-foreground"}`} data-testid={feeError ? "portal-config-fee-error" : undefined}>
            {feeError ? t("admin.config.fineAdminFeeInvalid") : t("admin.config.fineAdminFeeHelp")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t("admin.config.templatesHint")}</p>
        <Button onClick={() => { const fee = Number(fineAdminFee); if (fineAdminFee.trim() === "" || !Number.isFinite(fee) || fee < 0) { setFeeError(true); return; } save.mutate(); }} disabled={save.isPending} data-testid="button-save-portal-config">{t("admin.dialog.save")}</Button>
      </CardContent>
    </Card>
  );
}
