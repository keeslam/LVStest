import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * A-19-4 (audit 2026-10-09): the first open of a page or dialog could take
 * seconds with nothing on screen, so the button seemed dead. This is the one
 * fallback for a lazy route or dialog: a centred spinner with "Laden…".
 * It is transient (it unmounts as soon as the chunk arrives) and carries
 * `role="status"`, so a screen reader announces it too.
 */
export function PageLoading({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="page-loading"
      className={className ?? "flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground"}
    >
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      <span className="text-sm">{t("loading.label")}</span>
    </div>
  );
}

export default PageLoading;
