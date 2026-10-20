/**
 * Punt 15 / OPT-032 (Kees, 2026-10-20) — "Eerdere controles": every saved
 * key-cabinet audit, newest first, as a compact table. A row opens the audit
 * with its lists; it can be printed again from there.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLicensePlate } from "@/lib/format-utils";
import type { KeyAudit, KeyAuditVehicle } from "@shared/schema";
import { printKeyAudit } from "./key-audit-print";

interface KeyAuditSummary {
  id: number;
  mode: string;
  finishedAt: string;
  performedByName: string | null;
  expectedCount: number;
  scannedCount: number;
  missingCount: number;
  unexpectedCount: number;
  note: string | null;
}

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));

export function KeyAuditHistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("barcodes");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: audits = [], isLoading } = useQuery<KeyAuditSummary[]>({ queryKey: ["/api/key-audits"], enabled: open });
  const { data: selected } = useQuery<KeyAudit>({ queryKey: [`/api/key-audits/${selectedId}`], enabled: open && selectedId !== null });

  const list = (title: string, items: KeyAuditVehicle[], tone: string) => (
    <div>
      <h3 className={`text-sm font-semibold mb-1 ${tone}`}>{title} ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="text-sm columns-1 sm:columns-2 gap-6">
          {items.map((v) => (
            <li key={v.vehicleId} className="break-inside-avoid py-0.5">
              <span className="font-medium">{formatLicensePlate(v.licensePlate)}</span>
              <span className="text-gray-500"> {[v.brand, v.model].filter(Boolean).join(" ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelectedId(null); }}>
      <DialogContent className="max-w-[min(95vw,64rem)] max-h-[90vh] overflow-y-auto" data-testid="dialog-key-audit-history">
        <DialogHeader>
          <DialogTitle>{t("keyAuditHistory.title")}</DialogTitle>
          <DialogDescription>{t("keyAuditHistory.description")}</DialogDescription>
        </DialogHeader>

        {selectedId !== null ? (
          !selected ? (
            <p className="text-sm text-muted-foreground">{t("keyAuditHistory.loading")}</p>
          ) : (
            <div className="space-y-4" data-testid="key-audit-detail">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedId(null)} data-testid="button-key-audit-back">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t("keyAuditHistory.back")}
                </Button>
                <Button size="sm" onClick={() => printKeyAudit(selected)} data-testid="button-key-audit-history-print">
                  <Printer className="h-4 w-4 mr-1" />
                  {t("keyAudit.printButton")}
                </Button>
              </div>
              <p className="text-sm">
                <span className="font-semibold">{t(selected.mode === "spare" ? "keyAuditHistory.modeSpare" : "keyAuditHistory.modeMain")}</span>
                {" · "}{dateTime(selected.finishedAt as unknown as string)}
                {" · "}{selected.performedByName || "—"}
                {" · "}{t("keyAuditHistory.countsLine", { scanned: selected.scannedCount, expected: selected.expectedCount })}
              </p>
              {list(t("keyAuditHistory.missing"), selected.missing, "text-red-700")}
              {list(t("keyAuditHistory.unexpected"), selected.unexpected, "text-amber-700")}
              {list(t("keyAuditHistory.scanned"), selected.scanned, "text-gray-700")}
              {selected.note && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">{t("keyAuditHistory.note")}</h3>
                  <p className="text-sm whitespace-pre-line rounded-md border p-2">{selected.note}</p>
                </div>
              )}
            </div>
          )
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">{t("keyAuditHistory.loading")}</p>
        ) : audits.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-key-audit-history-empty">{t("keyAuditHistory.empty")}</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table data-testid="table-key-audit-history">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("keyAuditHistory.colWhen")}</TableHead>
                  <TableHead>{t("keyAuditHistory.colCabinet")}</TableHead>
                  <TableHead>{t("keyAuditHistory.colBy")}</TableHead>
                  <TableHead className="text-right">{t("keyAuditHistory.colScanned")}</TableHead>
                  <TableHead className="text-right">{t("keyAuditHistory.colMissing")}</TableHead>
                  <TableHead className="text-right">{t("keyAuditHistory.colUnexpected")}</TableHead>
                  <TableHead>{t("keyAuditHistory.colNote")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map((a) => (
                  <TableRow key={a.id} className="text-sm" data-testid={`key-audit-row-${a.id}`}>
                    <TableCell className="py-1.5 whitespace-nowrap">{dateTime(a.finishedAt)}</TableCell>
                    <TableCell className="py-1.5 whitespace-nowrap">{t(a.mode === "spare" ? "keyAuditHistory.modeSpare" : "keyAuditHistory.modeMain")}</TableCell>
                    <TableCell className="py-1.5 whitespace-nowrap">{a.performedByName || "—"}</TableCell>
                    <TableCell className="py-1.5 text-right whitespace-nowrap">{a.scannedCount} / {a.expectedCount}</TableCell>
                    <TableCell className={`py-1.5 text-right ${a.missingCount > 0 ? "text-red-700 font-medium" : ""}`}>{a.missingCount}</TableCell>
                    <TableCell className={`py-1.5 text-right ${a.unexpectedCount > 0 ? "text-amber-700 font-medium" : ""}`}>{a.unexpectedCount}</TableCell>
                    <TableCell className="py-1.5 max-w-[16rem] truncate" title={a.note ?? undefined}>{a.note ?? ""}</TableCell>
                    <TableCell className="py-1.5 text-right">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setSelectedId(a.id)} data-testid={`button-key-audit-open-${a.id}`}>
                        {t("keyAuditHistory.open")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
