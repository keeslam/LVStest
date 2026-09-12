/**
 * besluiten.md **B-09** (BUG-013, BUG-037) — "waarschuwen, de medewerker mag
 * doorgaan."
 *
 * The banner the booking form shows *before* the save when the requested period
 * runs over a maintenance block, or when a second block overlaps an existing
 * one. It is deliberately a warning, not an error: nothing here disables the
 * submit button — only a real double booking does that.
 *
 * The wording (including the maintenance period) comes from the server, via
 * `shared/booking-warnings.ts`, so the message the form shows and the message
 * the write returns cannot drift.
 */
import type { BookingWarning } from "@shared/booking-warnings";

export function MaintenanceWarningBanner({ warnings }: { warnings: BookingWarning[] }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      className="p-4 bg-amber-50 border border-amber-400 rounded-md flex items-start gap-2 text-amber-900 mt-4"
      data-testid="warning-maintenance-overlap"
      role="status"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className="space-y-1">
        {warnings.map((warning, index) => (
          <div key={`${warning.code}-${index}`}>{warning.message}</div>
        ))}
      </div>
    </div>
  );
}
