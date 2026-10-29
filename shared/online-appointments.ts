/**
 * Appointments made in the garage's online planner (Garagesoftware) arrive as one "Afspraak Aanvraag" mail each. The app
 * reads them into the maintenance planner. Design: docs/superpowers/specs/2026-10-13-online-afspraken-design.md
 */

export const ONLINE_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'review', 'dismissed'] as const;
export type OnlineAppointmentStatus = typeof ONLINE_APPOINTMENT_STATUSES[number];

/** The ones still waiting for staff: shown in the maintenance calendar's dialog and counted on its button. */
export const OPEN_APPOINTMENT_STATUSES: OnlineAppointmentStatus[] = ['pending', 'review'];

export const APPOINTMENT_REVIEW_REASONS = ['unreadable', 'plate_unknown', 'no_rental', 'weekend', 'in_past'] as const;
export type AppointmentReviewReason = typeof APPOINTMENT_REVIEW_REASONS[number];

/** Why a mail did not become a maintenance entry; for server-written notifications. The client has its own i18n keys. */
export const APPOINTMENT_REVIEW_LABELS_NL: Record<AppointmentReviewReason, string> = {
  unreadable: 'de mail kon niet worden uitgelezen',
  plate_unknown: 'het kenteken staat niet in de vloot',
  no_rental: 'geen lopende of geplande huur van een klant voor deze auto op die dag',
  weekend: 'de afspraak valt in het weekend',
  in_past: 'de afspraak ligt in het verleden',
};

/** Where an appointment mail is moved to once it is handled. */
export const APPOINTMENTS_FOLDER = 'online afspraken';

/** The office notification and the bell link open the dialog straight away. */
export const ONLINE_APPOINTMENTS_LINK = '/maintenance?onlineAppointments=1';

export interface ParsedAppointmentMail {
  /** ISO date and HH:MM. */
  date: string;
  time: string;
  /** Upper-case, no dashes. */
  plate: string;
  brand: string;
  model: string;
  mileage: number | null;
  workItems: string[];
  /** What the mail says under "Vervangend vervoer", or "". */
  replacement: string;
  customerName: string;
}

/**
 * The planner mail is recognised by its sender (checked by the caller, against `appointmentSenders`) and the subject
 * "Afspraak Aanvraag". Other mail from the planner (a confirmation, say) is not an appointment request and is left alone.
 */
export function isPlannerMailSubject(subject: string | null | undefined): boolean {
  return /afspraak\s*-?\s*aanvraag/i.test(String(subject ?? ''));
}

const clean = (text: string): string =>
  String(text ?? '').replace(/\r/g, '').replace(/[ ​]/g, ' ').replace(/[ \t]+/g, ' ');

const LABELS = ['Voertuig gegevens', 'Kenteken', 'Merk', 'Model', 'Tellerstand', 'Werkzaamheden', 'Vervangend vervoer', 'Met vriendelijke groet'];

/** The lines after `label:` up to the next known label, or a blank line once something was read. */
function section(text: string, label: string): string[] {
  const lines = text.split('\n').map((l) => l.trim());
  const start = lines.findIndex((l) => l.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (start === -1) return [];
  const first = lines[start].slice(label.length + 1).trim();
  const out: string[] = first ? [first] : [];
  // A label with its value on the same line is a one-line field.
  if (first && label !== 'Werkzaamheden') return out;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (LABELS.some((l) => line.toLowerCase().startsWith(l.toLowerCase()))) break;
    if (line) out.push(line);
    // A blank line ends the block once something was read; before that it is just spacing.
    else if (out.length > 0) break;
  }
  return out;
}

export function normalizePlateText(value: string): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

const isoFromDutch = (d: string, m: string, y: string): string | null => {
  const day = Number(d), month = Number(m), year = Number(y);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Reads the plain text of the "Afspraak Aanvraag" mail. Null when the date, the time or the plate cannot be found with
 * certainty: such a mail goes to "Te controleren" and nothing is planned from a guess.
 */
export function parseAppointmentMail(rawText: string): ParsedAppointmentMail | null {
  const text = clean(rawText);
  const when = /afspraak maken voor\s+(\d{1,2})-(\d{1,2})-(\d{4})\s+om\s+(\d{1,2}):(\d{2})/i.exec(text);
  const plateLine = section(text, 'Kenteken')[0] ?? '';
  const plate = normalizePlateText(plateLine);
  if (!when || plate.length < 4 || plate.length > 8) return null;
  const date = isoFromDutch(when[1], when[2], when[3]);
  const hour = Number(when[4]), minute = Number(when[5]);
  if (!date || hour > 23 || minute > 59) return null;

  const mileageText = (section(text, 'Tellerstand')[0] ?? '').replace(/[^\d]/g, '');
  const greeting = /Geachte\s+([^,\n]+),/i.exec(text);
  return {
    date,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    plate,
    brand: (section(text, 'Merk')[0] ?? '').slice(0, 100),
    model: (section(text, 'Model')[0] ?? '').slice(0, 100),
    mileage: mileageText && mileageText.length <= 9 ? Number(mileageText) : null,
    workItems: section(text, 'Werkzaamheden')
      .flatMap((l) => l.split(/\s*[,;]\s*/))
      .map((l) => l.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 20),
    replacement: (section(text, 'Vervangend vervoer')[0] ?? '').trim().slice(0, 100),
    customerName: (greeting?.[1] ?? '').trim().slice(0, 200),
  };
}

/** Anything but empty, "geen" or "nee" asks for a replacement car; the planner has no other word for none. */
export function replacementWanted(replacement: string | null | undefined): boolean {
  return !/^(|geen|nee|-|n\.?v\.?t\.?)$/i.test(String(replacement ?? '').trim());
}

/** What the maintenance planner files it under: APK is regular maintenance (scheduled_maintenance), everything else a repair. */
export function appointmentCategory(workItems: string[]): 'scheduled_maintenance' | 'repair' {
  if (workItems.length === 0) return 'repair';
  return workItems.every((w) => /\bapk\b/i.test(w) && !/vervangen|reparatie/i.test(w))
    ? 'scheduled_maintenance'
    : 'repair';
}

/** Two mails for the same car, day and time within a day of each other are one appointment (the planner sends no number). */
export const APPOINTMENT_DUPLICATE_WINDOW_HOURS = 24;

export interface OnlineAppointmentDto {
  id: number;
  receivedAt: string;
  status: OnlineAppointmentStatus;
  reviewReason: AppointmentReviewReason | null;
  date: string;
  time: string;
  plate: string;
  brand: string;
  model: string;
  mileage: number | null;
  workItems: string[];
  replacement: string;
  customerName: string;
  /** The linked customer, from the rental. */
  customerId: number | null;
  customerLabel: string | null;
  vehicleId: number | null;
  rentalId: number | null;
  blockId: number | null;
  handledBy: string | null;
  handledAt: string | null;
}
