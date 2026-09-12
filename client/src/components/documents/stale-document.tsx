/**
 * B-05 (OPT-014, BUG-027) — "Verouderde documenten na een wijziging".
 *
 * The owner's decision: the old document is kept and visibly marked
 * "verouderd"; the version number lives in its own column; and the employee
 * generates a new version **deliberately**, with a button, rather than the
 * server silently replacing a contract behind their back.
 *
 * Wave 6 built the server half — `documents.is_stale` / `stale_reason` /
 * `version` and `POST /api/documents/:id/regenerate`. Until now nothing on
 * screen showed any of it, so in practice the decision did not exist for the
 * people it was made for. These are the two pieces of UI it needs.
 */
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import type { Document } from "@shared/schema";

/**
 * The document types the server can produce again — mirrors
 * `REGENERATABLE_DOCUMENT_TYPES` in `server/services/document-regeneration.ts`.
 * An uploaded scan has no generator, so offering the button would be a lie.
 */
export const REGENERATABLE_DOCUMENT_TYPES = [
  "Contract (Unsigned)",
  "Damage Check (Unsigned)",
];

export function canRegenerateDocument(document: Pick<Document, "documentType" | "reservationId">): boolean {
  if (!document.reservationId) return false;
  return REGENERATABLE_DOCUMENT_TYPES.includes(document.documentType || "");
}

/**
 * The "verouderd" marker. Also carries the version, because "verouderd" only
 * means something next to "there is a version 2".
 */
export function StaleDocumentBadge({
  document,
  className,
}: {
  document: Pick<Document, "isStale" | "staleReason" | "version">;
  className?: string;
}) {
  const { t } = useTranslation("documents");
  const version = document.version ?? 1;

  if (!document.isStale) {
    // Not stale: the version is still worth showing once there is more than one.
    if (version <= 1) return null;
    return (
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs text-gray-600 ${className ?? ""}`}
        data-testid="document-version"
      >
        {t("staleness.versionLabel", { version })}
      </span>
    );
  }

  return (
    <span
      role="status"
      data-testid="document-stale-badge"
      title={
        document.staleReason
          ? `${t("staleness.badgeTitle")} ${t("staleness.reasonLabel", { reason: document.staleReason })}`
          : t("staleness.badgeTitle")
      }
      className={`inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ${className ?? ""}`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {t("staleness.badge")}
      {version > 1 && <span className="font-normal">· {t("staleness.versionLabel", { version })}</span>}
    </span>
  );
}

/**
 * The deliberate action. It never runs on its own and never replaces the file
 * it was started from: the server files a new version and keeps the old one.
 */
export function RegenerateDocumentButton({
  document,
  onRegenerated,
  size = "sm",
}: {
  document: Pick<Document, "id" | "documentType" | "reservationId" | "vehicleId">;
  onRegenerated?: () => void;
  size?: "sm" | "default";
}) {
  const { t } = useTranslation("documents");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/documents/${document.id}/regenerate`, {});
      return (await response.json()) as Document;
    },
    onSuccess: (created) => {
      toast({
        title: t("staleness.regeneratedTitle"),
        description: t("staleness.regeneratedDescription", {
          version: created?.version ?? 1,
          fileName: created?.fileName ?? "",
        }),
      });
      void invalidateByPrefix("/api/documents");
      if (document.vehicleId) void invalidateByPrefix(`/api/documents/vehicle/${document.vehicleId}`);
      if (document.reservationId) {
        void invalidateByPrefix(`/api/documents/reservation/${document.reservationId}`);
      }
      onRegenerated?.();
    },
    onError: (error: Error) => {
      toast({
        title: t("staleness.failedTitle"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!canRegenerateDocument(document)) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      data-testid={`button-regenerate-document-${document.id}`}
    >
      <RefreshCw
        className={`mr-1 h-3.5 w-3.5 ${mutation.isPending ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {mutation.isPending ? t("staleness.regenerating") : t("staleness.regenerate")}
    </Button>
  );
}
