/**
 * Punt 15 / OPT-032 (Kees, 2026-10-20) — the A4 print of a key-cabinet audit:
 * cabinet, date and time, who, the counts, the missing keys, the keys that
 * should not hang there, every scanned key, the note and a signature line.
 * Printed documents stay Dutch (B-18), whatever the screen language.
 */
import i18n from "@/i18n";
import { toast } from "@/hooks/use-toast";
import { formatLicensePlate } from "@/lib/format-utils";
import type { KeyAudit, KeyAuditVehicle } from "@shared/schema";

type PrintableAudit = Pick<KeyAudit, "mode" | "finishedAt" | "performedByName" | "expectedCount" | "scannedCount" | "missing" | "unexpected" | "scanned" | "note">;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function dutchDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d);
}

/** The whole print page as HTML. Pure, so it can be tested without a printer. */
export function buildKeyAuditPrintHtml(audit: PrintableAudit): string {
  const t = i18n.getFixedT("nl", "barcodes");
  const section = (title: string, list: KeyAuditVehicle[], empty: string) => `
    <h2>${escapeHtml(title)} (${list.length})</h2>
    ${list.length === 0
      ? `<p class="empty">${escapeHtml(empty)}</p>`
      : `<table><thead><tr><th>${escapeHtml(t("keyAuditPrint.plate"))}</th><th>${escapeHtml(t("keyAuditPrint.vehicle"))}</th></tr></thead><tbody>${
        list.map((v) => `<tr><td>${escapeHtml(formatLicensePlate(v.licensePlate))}</td><td>${escapeHtml([v.brand, v.model].filter(Boolean).join(" "))}</td></tr>`).join("")
      }</tbody></table>`}`;
  const title = t(audit.mode === "spare" ? "keyAuditPrint.titleSpare" : "keyAuditPrint.titleMain");
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; }
  h1 { font-size: 16pt; margin: 0 0 4mm; }
  h2 { font-size: 11pt; margin: 6mm 0 2mm; }
  .meta td { padding: 0.5mm 4mm 0.5mm 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 1mm 2mm; }
  tbody tr { border-top: 0.2mm solid #ccc; }
  th { border-bottom: 0.4mm solid #333; }
  .empty { color: #555; margin: 0; }
  .note { white-space: pre-line; border: 0.2mm solid #999; padding: 2mm; }
  .sign { margin-top: 12mm; display: flex; gap: 10mm; }
  .sign div { flex: 1; border-top: 0.3mm solid #333; padding-top: 1mm; }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <table class="meta"><tbody>
    <tr><td>${escapeHtml(t("keyAuditPrint.when"))}</td><td>${escapeHtml(dutchDateTime(audit.finishedAt as unknown as string))}</td></tr>
    <tr><td>${escapeHtml(t("keyAuditPrint.by"))}</td><td>${escapeHtml(audit.performedByName || "—")}</td></tr>
    <tr><td>${escapeHtml(t("keyAuditPrint.counts"))}</td><td>${escapeHtml(t("keyAuditPrint.countsValue", { scanned: audit.scannedCount, expected: audit.expectedCount, missing: audit.missing.length, unexpected: audit.unexpected.length }))}</td></tr>
  </tbody></table>
  ${section(t("keyAuditPrint.missing"), audit.missing, t("keyAuditPrint.noneMissing"))}
  ${section(t("keyAuditPrint.unexpected"), audit.unexpected, t("keyAuditPrint.noneUnexpected"))}
  ${section(t("keyAuditPrint.scanned"), audit.scanned, t("keyAuditPrint.noneScanned"))}
  <h2>${escapeHtml(t("keyAuditPrint.note"))}</h2>
  <div class="note">${audit.note ? escapeHtml(audit.note) : "&nbsp;"}</div>
  <div class="sign"><div>${escapeHtml(t("keyAuditPrint.checkedBy"))}</div><div>${escapeHtml(t("keyAuditPrint.signature"))}</div><div>${escapeHtml(t("keyAuditPrint.date"))}</div></div>
</body></html>`;
}

/** Prints through a hidden same-origin iframe, like the key labels. */
export function printKeyAudit(audit: PrintableAudit): void {
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(buildKeyAuditPrintHtml(audit));
  doc.close();
  setTimeout(() => {
    const t = i18n.getFixedT(null, "barcodes");
    toast({ title: t("keyAuditPrint.toastTitle"), description: t("keyAuditPrint.toastDescription") });
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 2000);
  }, 250);
}
