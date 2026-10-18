import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine, ExternalLink, Lock } from "lucide-react";
import type { PortalDocumentDto, PortalSigningInfoDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { btnPrimary, btnSecondary } from "./ui";

/**
 * Read the contract, draw a signature, type the name, agree, send (Kees, 2026-10-18). The fingerprint
 * of the file shown here goes along, so the server refuses when the contract changed in the meantime.
 */
export function SignContractDialog({ document: d, onClose }: { document: PortalDocumentDto | null; onClose: () => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const open = d !== null;
  // The same steps for a contract and a damage form; only the words differ.
  const k = (key: string) => t(d?.kind === "damage_check" ? `documents.sign.${key}Damage` : `documents.sign.${key}`);
  const { data: info, isLoading, isError } = useQuery<PortalSigningInfoDto>({
    queryKey: ["portal", `/api/portal/documents/${d?.id}/signing`], queryFn: portalQueryFn, enabled: open, staleTime: 0,
  });
  useEffect(() => { if (open) { setAgree(false); setHasInk(false); } }, [open, d?.id]);
  useEffect(() => { if (info?.signerName) setName(info.signerName); }, [info?.signerName]);

  const errorText = (e: unknown) => {
    const code = e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR";
    return t(`errors.${code}`, { defaultValue: t("errors.PORTAL_SERVER_ERROR") });
  };
  const sign = useMutation({
    mutationFn: () => {
      const signature = pad.current?.toDataUrl();
      if (!signature || !info) throw new PortalApiError(400, "PORTAL_INVALID_SIGNATURE", "empty");
      return portalFetch("POST", `/api/portal/documents/${d!.id}/sign`, { name: name.trim(), agree: true, signature, documentSha256: info.sha256 });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal"] });
      toast({ title: k("done") });
      onClose();
    },
    onError: async (e) => {
      toast({ title: errorText(e), variant: "destructive" });
      // A newer version or a signature from a colleague: show the list as it is now.
      if (e instanceof PortalApiError && e.status === 409) await queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
  });

  const ready = name.trim().length >= 2 && agree && hasInk && info?.canSign && !sign.isPending;
  const url = d ? `/api/portal/documents/${d.id}/download?inline=1` : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto" data-testid="sign-contract-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" />{k("title")}</DialogTitle>
          <DialogDescription>{k("intro")}</DialogDescription>
        </DialogHeader>
        {isError ? <p className="p-4 text-center text-sm text-muted-foreground">{t("errors.PORTAL_NOT_FOUND")}</p>
          : isLoading || !info ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          : !info.canSign ? <p className="rounded-lg bg-[#f1f5f9] p-4 text-sm text-[#334155]" data-testid="sign-not-allowed">{info.status === "to_sign" ? k("adminOnly") : k("notSignable")}</p>
          : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0f172a]">{k("step1")}</span>
                  <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-[#2a2f9c] underline"><ExternalLink className="h-3.5 w-3.5" />{t("documents.sign.openFull")}</a>
                </div>
                <iframe src={url} title={k("previewTitle")} className="h-[45vh] w-full rounded-lg border border-[#e6e8f0]" data-testid="sign-contract-preview" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sign-name" className="font-semibold">{t("documents.sign.step2")}</Label>
                <Input id="sign-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="name" data-testid="input-sign-name" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0f172a]">{t("documents.sign.step3")}</span>
                  <button type="button" className="text-xs text-[#2a2f9c] underline" onClick={() => pad.current?.clear()} data-testid="button-clear-signature">{t("documents.sign.clear")}</button>
                </div>
                <SignaturePad ref={pad} onChange={setHasInk} label={t("documents.sign.padLabel")} />
                <p className="text-xs text-[#64748b]">{t("documents.sign.padHint")}</p>
              </div>
              <label className="flex items-start gap-2 text-sm text-[#0f172a]">
                <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" data-testid="checkbox-sign-agree" />
                <span>{k("agree")}</span>
              </label>
              <p className="flex items-start gap-1.5 text-xs text-[#64748b]"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("documents.sign.recorded")}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" className={btnSecondary} onClick={onClose}>{t("actions.cancel")}</Button>
                <Button className={btnPrimary} disabled={!ready} onClick={() => sign.mutate()} data-testid="button-sign-submit">
                  {sign.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PenLine className="mr-1 h-4 w-4" />}{t("documents.sign.submit")}
                </Button>
              </div>
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
