/**
 * Kees, 2026-10-21 — Profiel > Handtekening: your own signature for the contracts you
 * generate ("Handtekening verhuurder" in the template). Draw it, or upload a picture;
 * either way it is stored as a PNG (shared/staff-signature.ts).
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, Trash2, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignaturePad, type SignaturePadHandle } from "@/components/portal/signature-pad";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { STAFF_SIGNATURE_KEY } from "@shared/staff-signature";

const KEY = `/api/user-settings/${STAFF_SIGNATURE_KEY}`;

/** Any picture the browser can read, scaled to fit 600x200 and turned into a PNG. */
function imageFileToPng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(600 / img.width, 200 / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}

export function StaffSignatureCard() {
  const { t } = useTranslation(["common"]);
  const { toast } = useToast();
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const { data } = useQuery<{ value?: { png?: string } | null; source?: string }>({ queryKey: [KEY] });
  const current = data?.source === "user" ? data.value?.png ?? null : null;

  const save = useMutation({
    mutationFn: async (png: string) => { await apiRequest("PUT", KEY, { value: { png } }); },
    onSuccess: () => {
      invalidateByPrefix("/api/user-settings");
      pad.current?.clear();
      toast({ title: t("signature.saved") });
    },
    onError: (error) => toast({ variant: "destructive", title: t("signature.saveFailed"), description: describeApiError(error) }),
  });
  const remove = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", KEY); },
    onSuccess: () => { invalidateByPrefix("/api/user-settings"); toast({ title: t("signature.removed") }); },
    onError: (error) => toast({ variant: "destructive", title: t("signature.saveFailed"), description: describeApiError(error) }),
  });

  return (
    <div className="space-y-4" data-testid="staff-signature-card">
      <p className="text-sm text-muted-foreground">{t("signature.description")}</p>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("signature.current")}</p>
        {current ? (
          <div className="flex items-center gap-3">
            <img src={current} alt={t("signature.current")} className="h-20 rounded border bg-white p-1" data-testid="staff-signature-image" />
            <Button variant="outline" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending} data-testid="button-remove-signature">
              <Trash2 className="h-4 w-4 mr-1" />{t("signature.remove")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="staff-signature-none">{t("signature.none")}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("signature.draw")}</p>
        <SignaturePad ref={pad} label={t("signature.draw")} onChange={setHasInk} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => pad.current?.clear()} disabled={!hasInk}>
            <Eraser className="h-4 w-4 mr-1" />{t("signature.clear")}
          </Button>
          <Button size="sm" onClick={() => { const png = pad.current?.toDataUrl(); if (png) save.mutate(png); }} disabled={!hasInk || save.isPending} data-testid="button-save-drawn-signature">
            {t("signature.saveDrawn")}
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              data-testid="input-signature-upload"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try { save.mutate(await imageFileToPng(file)); }
                catch { toast({ variant: "destructive", title: t("signature.notImage") }); }
              }}
            />
            <span className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-gray-50">
              <Upload className="h-4 w-4 mr-1" />{t("signature.upload")}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
