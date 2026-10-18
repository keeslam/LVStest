import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search, UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatLicensePlate } from "@/lib/format-utils";
import { formatInOfficeZone } from "@/lib/office-timezone";

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

/**
 * Who drives: a pill with a person icon, the word "Bestuurder" and the name,
 * so a customer never mistakes it for the contact person or the account.
 */
export function DriverChip({ name, className = "" }: { name: string | null | undefined; className?: string }) {
  const { t } = useTranslation("portal");
  if (!name) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[#dfe2ff] bg-[#eef0fb] py-0.5 pl-1.5 pr-2.5 text-xs text-[#1a1d62] ${className}`} title={`${t("fields.driver")}: ${name}`} data-testid="driver-chip">
      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#5f6fd3]">{t("fields.driver")}</span>
      <span className="truncate font-medium">{name}</span>
    </span>
  );
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

/** Under a list that shows only its first rows: the count and a way to the full, searchable list. */
export function MoreFooter({ shown, total, onMore, testId }: { shown: number; total: number; onMore: () => void; testId?: string }) {
  const { t } = useTranslation("portal");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[#64748b]">
      <span>{t("overview.shown", { shown, total })}</span>
      <button type="button" onClick={onMore} className="inline-flex items-center gap-1 rounded-full border border-[#e6e8f0] bg-white px-3 py-1 text-xs font-medium text-[#1a1d62] hover:bg-[#eef0fb]" data-testid={testId}>
        <Search className="h-3.5 w-3.5" />{t("overview.viewAll")}
      </button>
    </div>
  );
}

/** Rows per page of a long portal list (Kees, 2026-10-18: customers with 80-100 cars). */
export const PORTAL_PAGE_SIZE = 20;

/** "‹ Vorige · Pagina 2 van 5 · Volgende ›" under a long list; renders nothing for a single page. */
export function Pager({ page, pages, onPage, testId = "pager" }: { page: number; pages: number; onPage: (page: number) => void; testId?: string }) {
  const { t } = useTranslation("portal");
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[#e6e8f0] px-3 py-2 text-xs text-[#64748b] sm:px-4" data-testid={testId}>
      <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)} data-testid="pager-prev"><ChevronLeft className="mr-1 h-4 w-4" />{t("lists.pager.prev")}</Button>
      <span>{t("lists.pager.page", { page: page + 1, pages })}</span>
      <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} data-testid="pager-next">{t("lists.pager.next")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
    </div>
  );
}

/**
 * A long list a page at a time: `shown` is this page's rows, `pager` the controls (nothing for one
 * page). Back to page 1 whenever `resetKey` changes (a new search or filter).
 */
export function usePortalPages<T>(items: T[], resetKey: string, testId?: string): { shown: T[]; pager: ReactNode } {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / PORTAL_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  return {
    shown: items.slice(current * PORTAL_PAGE_SIZE, (current + 1) * PORTAL_PAGE_SIZE),
    pager: <Pager page={current} pages={pages} onPage={setPage} testId={testId} />,
  };
}

/** Quick filters above a list: one pill per option with its count; the chosen one is filled. */
export function FilterChips<K extends string>({ options, value, onChange, testIdPrefix }: {
  options: Array<{ key: K; label: string; count: number }>; value: K; onChange: (key: K) => void; testIdPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={`${testIdPrefix}-filters`}>
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={value === o.key}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${value === o.key ? "border-[#1a1d62] bg-[#1a1d62] text-white" : "border-[#e6e8f0] bg-white text-[#1a1d62] hover:bg-[#eef0fb]"}`}
          data-testid={`${testIdPrefix}-filter-${o.key}`}>
          {o.label} <span className="opacity-70">{o.count}</span>
        </button>
      ))}
    </div>
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
  const flat = (v: string) => v.replace(/[-\s]/g, "");
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
  // Whole calendar days between the office's today and the date, not between two clock times in the browser's zone.
  const ymd = (v: string) => { const [y, m, d] = v.slice(0, 10).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  return Math.round((ymd(iso) - ymd(formatInOfficeZone(new Date(), "yyyy-MM-dd"))) / 86_400_000);
}

/** What a list page shows while its data loads: not an empty page that looks like "nothing here". */
export function PortalLoading() {
  const { t } = useTranslation("portal");
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true" data-testid="portal-loading">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white ring-1 ring-[#e6e8f0]" />)}
    </div>
  );
}

/** What a page shows when its data could not be loaded: an honest message and a way to try again, not an empty list. */
export function PortalLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("portal");
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center" role="alert" data-testid="portal-load-error">
      <p className="text-sm font-medium text-amber-900">{t("loadError.title")}</p>
      <p className="mt-1 text-sm text-amber-800">{t("loadError.body")}</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-[#1a1d62] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#2a2f9c]" data-testid="portal-load-retry">{t("loadError.retry")}</button>
    </div>
  );
}
