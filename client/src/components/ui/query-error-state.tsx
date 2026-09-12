/**
 * BUG-212 — "Mislukte GET-requests worden als lege toestand getoond, er is geen
 * requesttimeout, geen retry en geen enkele indicatie wanneer de server
 * onbereikbaar is."
 *
 * Wave 7 gave every request a deadline and a global toast. What it did not give
 * the screens is the *inline* half of the fix proposal: a failed query still
 * rendered the component's own "geen data" state, which is the sentence an
 * employee believes. This is that state — it says the load failed, it says
 * something different when the deadline was the cause, and it offers the one
 * action that helps.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequestTimeoutError } from "@/lib/request-policy";

interface QueryErrorStateProps {
  /** Whatever react-query handed back; only its shape is used. */
  error?: unknown;
  /** `refetch` from the query. Omitted only when a retry makes no sense. */
  onRetry?: () => void;
  className?: string;
}

/** A request that ran into our own 30 s deadline, rather than a server error. */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return candidate.code === "REQUEST_TIMEOUT" || candidate.name === "RequestTimeoutError";
}

export function QueryErrorState({ error, onRetry, className }: QueryErrorStateProps) {
  const { t } = useTranslation("common");
  const timedOut = isTimeoutError(error);
  const detail = error instanceof Error ? error.message : undefined;

  return (
    <div
      role="alert"
      data-testid="query-error-state"
      className={`mx-auto max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center ${className ?? ""}`}
    >
      <div className="mb-2 flex items-center justify-center gap-2">
        {timedOut ? (
          <Clock className="h-5 w-5 text-destructive" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        )}
        <h3 className="text-base font-semibold">
          {timedOut ? t("queryError.timeoutTitle") : t("queryError.title")}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {timedOut ? t("queryError.timeoutDescription") : t("queryError.description")}
      </p>
      {detail && !timedOut && (
        <p className="mt-2 break-words text-xs text-muted-foreground/80">{detail}</p>
      )}
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry} data-testid="button-query-retry">
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("queryError.retry")}
        </Button>
      )}
    </div>
  );
}

export default QueryErrorState;
