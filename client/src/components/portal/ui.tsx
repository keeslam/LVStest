import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatLicensePlate } from "@/lib/format-utils";

/**
 * Small visual vocabulary of the customer portal: brand colours from the
 * website (blue #1a1d62, orange #f5a623), one colour per status, the Dutch
 * yellow licence plate, initials avatars. Every portal page uses these so the
 * screens read as one product on a phone, a tablet and a desktop.
 */

export const PORTAL = {
  brand: "#1a1d62", brandDeep: "#0b0d28", brandSoft: "#eef0fb", brandMid: "#2a2f9c",
  accent: "#f5a623", accentDeep: "#b06f0a",
  ink: "#0f172a", inkSoft: "#64748b", line: "#e6e8f0", canvas: "#f3f5fb",
} as const;

/** Primary and secondary button classes on top of the shadcn Button. */
export const btnPrimary = "bg-[#f5a623] text-[#1a1d62] hover:bg-[#f9bf55] font-semibold shadow-sm";
export const btnSecondary = "border-[#cbd5e1] bg-white text-[#0f172a] hover:border-[#5f6fd3] hover:text-[#1a1d62]";

type Tone = "green" | "blue" | "amber" | "purple" | "red" | "gray";
const TONES: Record<Tone, { bg: string; text: string; border: string; dot: string }> = {
  green: { bg: "bg-[#e1f5ee]", text: "text-[#085041]", border: "border-l-[#1d9e75]", dot: "bg-[#1d9e75]" },
  blue: { bg: "bg-[#e6f1fb]", text: "text-[#0c447c]", border: "border-l-[#378add]", dot: "bg-[#378add]" },
  amber: { bg: "bg-[#faeeda]", text: "text-[#633806]", border: "border-l-[#ef9f27]", dot: "bg-[#ef9f27]" },
  purple: { bg: "bg-[#eeedfe]", text: "text-[#3c3489]", border: "border-l-[#7f77dd]", dot: "bg-[#7f77dd]" },
  red: { bg: "bg-[#fcebeb]", text: "text-[#791f1f]", border: "border-l-[#e24b4a]", dot: "bg-[#e24b4a]" },
  gray: { bg: "bg-[#f1efe8]", text: "text-[#444441]", border: "border-l-[#b4b2a9]", dot: "bg-[#b4b2a9]" },
};

const RESERVATION_TONE: Record<string, Tone> = { picked_up: "green", booked: "blue", returned: "purple", completed: "gray", cancelled: "red" };
const FINE_TONE: Record<string, Tone> = { new: "amber", linked: "amber", charged: "purple", paid: "green", disputed: "red", cancelled: "gray" };
const REQUEST_TONE: Record<string, Tone> = { new: "amber", in_progress: "blue", done: "green", rejected: "red" };

export function toneFor(kind: "reservation" | "fine" | "request", status: string): Tone {
  const map = kind === "reservation" ? RESERVATION_TONE : kind === "fine" ? FINE_TONE : REQUEST_TONE;
  return map[status] ?? "gray";
}
export const toneClasses = (tone: Tone) => TONES[tone];

export function StatusBadge({ kind, status, label }: { kind: "reservation" | "fine" | "request"; status: string; label: string }) {
  const c = TONES[toneFor(kind, status)];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{label}
    </span>
  );
}

/** Dutch yellow plate. */
export function Plate({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded border border-[#c9a800] bg-[#f7d117] px-1.5 font-mono text-xs font-bold tracking-wide text-[#111]" aria-label={value}>
      {formatLicensePlate(value)}
    </span>
  );
}

export function initials(name: string | null | undefined): string {
  return (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function Avatar({ name, size = "sm", accent }: { name: string | null | undefined; size?: "sm" | "lg"; accent?: boolean }) {
  const dims = size === "lg" ? "h-11 w-11 text-sm" : "h-6 w-6 text-[10px]";
  const colours = accent ? "bg-[#f5a623] text-[#1a1d62]" : "bg-[#dfe2ff] text-[#1a1d62]";
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dims} ${colours}`} aria-hidden="true">{initials(name)}</span>;
}

/** Page title row: h1 left, actions right; wraps on narrow screens. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#1a1d62] sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-[#64748b]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A section within a page. */
export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#2a2f9c]">
        {title}{count !== undefined && <span className="rounded-full bg-[#eef0fb] px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-[#1a1d62]">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

/** Empty state that invites an action instead of apologising. */
export function EmptyState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef0fb] text-[#2a2f9c]">{icon}</span>
      <p className="max-w-sm text-sm text-[#64748b]">{text}</p>
      {action}
    </div>
  );
}

/** Clickable list row with a coloured left edge; the whole card is the button. */
export function ListCard({ tone, onClick, children, testId }: { tone: Tone; onClick?: () => void; children: ReactNode; testId?: string }) {
  const c = TONES[tone];
  const cls = `flex w-full items-center justify-between gap-2 rounded-xl border border-[#e6e8f0] border-l-[5px] ${c.border} bg-white px-3 py-3 text-left shadow-sm transition-colors sm:gap-3 sm:px-4`;
  if (!onClick) return <div className={cls} data-testid={testId}>{children}</div>;
  return <button type="button" onClick={onClick} className={`${cls} hover:bg-[#f8f9ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a623]`} data-testid={testId}>{children}</button>;
}

/** Dashboard tile: number + label on a tinted background, optional click. */
export function Tile({ tone, icon, value, label, onClick, testId }: { tone: Tone; icon: ReactNode; value: number | string; label: string; onClick?: () => void; testId?: string }) {
  const c = TONES[tone];
  const inner = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${c.dot}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block text-2xl font-bold leading-none ${c.text}`}>{value}</span>
        <span className={`mt-1 block text-[11px] leading-tight ${c.text} opacity-80 sm:truncate sm:text-xs`}>{label}</span>
      </span>
    </>
  );
  const cls = `flex min-h-[64px] items-center gap-3 rounded-2xl px-3 py-3 sm:px-4 ${c.bg}`;
  if (!onClick) return <div className={cls} data-testid={testId}>{inner}</div>;
  return <button type="button" onClick={onClick} className={`${cls} text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5a623]`} data-testid={testId}>{inner}</button>;
}

/** Search state for a list page: `hit(...fields)` tells whether a row matches the typed text. */
export function usePortalSearch() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Plates are typed with or without dashes (38-XT-128 / 38XT128); match both ways.
  const flat = (v: string) => v.replace(/[-s]/g, "");
  const qFlat = flat(q);
  const hit = (...parts: Array<string | number | null | undefined>) => {
    if (!q) return true;
    const text = parts.filter((p) => p !== null && p !== undefined && p !== "").join(" ").toLowerCase();
    return text.includes(q) || (qFlat.length > 0 && flat(text).includes(qFlat));
  };
  return { query, setQuery, q, hit };
}

export function SearchBox({ value, onChange, placeholder, testId = "portal-search" }: { value: string; onChange: (v: string) => void; placeholder: string; testId?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-white pl-9" data-testid={testId} />
    </div>
  );
}

/** "Goedemorgen" / "Goedemiddag" / "Goedenavond" by the visitor's clock. */
export function useGreeting(): string {
  const { t } = useTranslation("portal");
  const h = new Date().getHours();
  return t(h < 12 ? "greeting.morning" : h < 18 ? "greeting.afternoon" : "greeting.evening");
}

/** Whole days from today to an ISO date (negative = in the past). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
