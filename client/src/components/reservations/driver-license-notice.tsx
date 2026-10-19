/**
 * Punt 9 (Kees, 2026-10-19) — the licence of the chosen driver in the booking
 * form. Measured on the start of the rental only; saving is always allowed
 * (like the B-09 maintenance banner). An unknown date is a quiet grey line.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { licenseExpiryDay, licenseStateOn } from "@shared/driver-license";
import { formatDutchDate } from "@shared/booking-warnings";

type DriverLike = { displayName?: string | null; firstName?: string | null; lastName?: string | null; licenseExpiry?: string | null };

export function DriverLicenseNotice({ driver, startDate }: { driver: DriverLike | null | undefined; startDate: string | null | undefined }) {
  const { t } = useTranslation("reservations");
  if (!driver) return null;
  const name = (driver.displayName || `${driver.firstName ?? ""} ${driver.lastName ?? ""}`).trim();
  const state = licenseStateOn(driver.licenseExpiry, startDate);

  if (state === "expired") {
    return (
      <div
        className="mt-2 p-3 bg-amber-50 border border-amber-400 rounded-md flex items-start gap-2 text-amber-900 text-sm"
        data-testid="warning-license-expired"
        role="status"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {t("form.licenseExpiredWarning", {
            name,
            date: formatDutchDate(licenseExpiryDay(driver.licenseExpiry)),
            start: formatDutchDate(startDate),
          })}
        </span>
      </div>
    );
  }
  // No start date yet says nothing about the licence; only a missing expiry date gets the note.
  if (state === "unknown" && !licenseExpiryDay(driver.licenseExpiry)) {
    return (
      <p className="mt-2 text-sm text-muted-foreground" data-testid="note-license-unknown">
        {t("form.licenseUnknownNote", { name })}
      </p>
    );
  }
  return null;
}
