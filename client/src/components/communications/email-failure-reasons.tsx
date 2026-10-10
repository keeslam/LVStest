import { useTranslation } from "react-i18next";
import { summariseFailureReasons } from "@shared/email-failure";
import { failureLines } from "@/lib/email-failure-text";

/**
 * The reason of a failed mail, in Dutch, with what the log stored kept as the
 * technical detail (audit 2026-10-09, module 13, finding 2).
 */
export function EmailFailureReasons({ reason, testIdPrefix = "email-log" }: { reason: string; testIdPrefix?: string }) {
  const { t } = useTranslation("notifications");
  const lines = failureLines(t as any, reason);
  const { details } = summariseFailureReasons(reason);

  return (
    <div className="space-y-1" data-testid={`${testIdPrefix}-failure`}>
      <div className="text-sm text-yellow-800 break-words" data-testid={`${testIdPrefix}-reason`}>
        <strong>{t("customerCommunications.history.failureReasonLabel")}</strong>{" "}
        {lines.map((line, index) => (
          <span key={index} className="block">{line}</span>
        ))}
      </div>
      <div className="text-xs text-yellow-900/80 break-words" data-testid={`${testIdPrefix}-raw`}>
        <span className="font-medium">{t("customerCommunications.failure.rawLabel")}</span>
        {details.map((detail, index) => (
          <span key={index} className="block font-mono">{detail}</span>
        ))}
      </div>
    </div>
  );
}
