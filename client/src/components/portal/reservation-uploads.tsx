import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Image as ImageIcon, Upload } from "lucide-react";
import { CUSTOMER_UPLOAD_MAX_BYTES, type PortalUploadDto } from "@shared/portal-types";
import { PortalApiError, portalFetch, portalQueryFn } from "@/lib/portal-api";
import { formatPortalDateMedium } from "@/lib/portal-format";
import { useFilePreview } from "@/components/documents/use-file-preview";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { btnPrimary } from "./ui";

const ACCEPTED = /\.(pdf|jpe?g|png)$/i;

/**
 * Documents the customer adds to a reservation (Kees, 2026-10-18): a PDF or photo up to 10 MB with a
 * short description, for example a damage photo or a fuel receipt. The office sees it with the
 * reservation's documents and gets a notice. The server checks the content and who may upload.
 */
export function ReservationUploads({ reservationId, canUpload }: { reservationId: number; canUpload: boolean }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const preview = useFilePreview();
  const url = `/api/portal/reservations/${reservationId}/uploads`;
  const { data: uploads = [] } = useQuery<PortalUploadDto[]>({ queryKey: ["portal", url], queryFn: portalQueryFn });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");

  const send = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("description", description.trim());
      body.append("file", file!);
      return portalFetch<PortalUploadDto>("POST", url, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal", url] });
      toast({ title: t("uploads.sent") });
      setOpen(false); setFile(null); setDescription("");
    },
    onError: (e) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`, { defaultValue: (e as Error).message }), variant: "destructive" }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !description.trim()) return;
    if (!ACCEPTED.test(file.name)) { toast({ title: t("uploads.wrongType"), variant: "destructive" }); return; }
    if (file.size > CUSTOMER_UPLOAD_MAX_BYTES) { toast({ title: t("errors.PORTAL_FILE_TOO_LARGE"), variant: "destructive" }); return; }
    send.mutate();
  }

  if (!canUpload && uploads.length === 0) return null;
  return (
    <div data-testid="reservation-uploads">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("uploads.title", { count: uploads.length })}</h3>
        {canUpload && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="button-add-upload"><Upload className="mr-1 h-4 w-4" />{t("uploads.add")}</Button>}
      </div>
      {open && (
        <form onSubmit={onSubmit} className="mb-2 space-y-2 rounded-md border p-3" data-testid="upload-form">
          <div>
            <Label htmlFor="up-desc">{t("uploads.description")}</Label>
            <Input id="up-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder={t("uploads.descriptionPlaceholder")} required data-testid="input-upload-description" />
          </div>
          <div>
            <Label htmlFor="up-file">{t("uploads.file")}</Label>
            <Input id="up-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="input-upload-file" />
            <p className="mt-1 text-xs text-[#64748b]">{t("uploads.hint")}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setFile(null); setDescription(""); }}>{t("uploads.cancel")}</Button>
            <Button type="submit" size="sm" className={btnPrimary} disabled={send.isPending || !file || !description.trim()} data-testid="button-send-upload">{t("uploads.send")}</Button>
          </div>
        </form>
      )}
      {uploads.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-2 px-3 py-2" data-testid={`upload-${u.id}`}>
              {u.contentType.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0 text-[#1a1d62]" /> : <FileText className="h-4 w-4 shrink-0 text-[#a32d2d]" />}
              <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => preview.open(`/api/portal/uploads/${u.id}/file?inline=1`, u.description)}>
                <span className="block truncate font-medium">{u.description}</span>
                <span className="block truncate text-xs text-[#64748b]">{u.fileName} · {formatPortalDateMedium(u.uploadedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview.dialog}
    </div>
  );
}
