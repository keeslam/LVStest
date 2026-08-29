import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";
import { Vehicle, BarcodeLabelTemplate } from "@shared/schema";
import { BarcodeSvg } from "@/components/barcodes/barcode-svg";
import { formatLicensePlate } from "@/lib/format-utils";
import { printBarcodeBook, printKeyLabels } from "./key-label-print";

interface BarcodeBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BarcodeBookDialog({ open, onOpenChange }: BarcodeBookDialogProps) {
  const { t } = useTranslation(["barcodes", "vehicles", "common"]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  // Sticker printing reuses the barcode label templates from the Documents page.
  const { data: labelTemplates } = useQuery<BarcodeLabelTemplate[]>({
    queryKey: ["/api/barcode-label-templates"],
    enabled: open,
  });
  const [templateId, setTemplateId] = useState<string>("default");

  // Preselect the template marked as default once the list arrives.
  useEffect(() => {
    if (templateId !== "default") return;
    const preferred = labelTemplates?.find(tpl => tpl.isDefault);
    if (preferred) setTemplateId(String(preferred.id));
  }, [labelTemplates]);

  const selectedTemplate = labelTemplates?.find(tpl => String(tpl.id) === templateId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vehicles ?? [])
      .filter(v => !!v.barcode)
      .filter(v => statusFilter === "all" || v.availabilityStatus === statusFilter)
      .filter(v =>
        !q ||
        v.licensePlate.toLowerCase().replace(/-/g, "").includes(q.replace(/-/g, "")) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
      )
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
  }, [vehicles, search, statusFilter]);

  const printSet = selected.size > 0 ? filtered.filter(v => selected.has(v.id)) : filtered;

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statuses = ["all", "available", "scheduled", "rented", "needs_fixing", "not_for_rental"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <DialogHeader className="text-left">
              <DialogTitle>{t("book.title")}</DialogTitle>
              <DialogDescription>{t("book.description")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="book-label-template" className="text-xs">{t("templatePicker.label")}</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="book-label-template" className="w-48" data-testid="select-book-label-template">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("templatePicker.defaultOption")}</SelectItem>
                    {(labelTemplates ?? []).map(tpl => (
                      <SelectItem key={tpl.id} value={String(tpl.id)}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={() => printKeyLabels(printSet, selectedTemplate)}
                disabled={printSet.length === 0}
                data-testid="button-print-stickers"
              >
                <Printer className="h-4 w-4 mr-2" />
                {t("book.printStickersButton")}
              </Button>
              <Button
                onClick={() => printBarcodeBook(printSet, t("book.pageHeader"))}
                disabled={printSet.length === 0}
                data-testid="button-print-book"
              >
                <Printer className="h-4 w-4 mr-2" />
                {selected.size > 0
                  ? t("book.printSelectedButton")
                  : search || statusFilter !== "all"
                    ? t("book.printFilteredButton", { count: printSet.length })
                    : t("book.printAllButton", { count: printSet.length })}
              </Button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("book.searchPlaceholder")}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map(s => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? t("book.statusFilterAll") : t(`scanPage.status.${s}`, { defaultValue: s })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(filtered.map(v => v.id)))}>
                {t("book.selectAll")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                {t("book.deselectAll")}
              </Button>
              {selected.size > 0 && <span>{t("book.selectedCount", { count: selected.size })}</span>}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("book.noVehicles")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(vehicle => (
                <div
                  key={vehicle.id}
                  className={`border rounded-md p-4 flex flex-col items-center gap-1 ${
                    selected.size > 0 && !selected.has(vehicle.id) ? "opacity-50" : ""
                  }`}
                >
                  <div className="self-start">
                    <Checkbox
                      checked={selected.has(vehicle.id)}
                      onCheckedChange={() => toggle(vehicle.id)}
                      data-testid={`checkbox-vehicle-${vehicle.id}`}
                    />
                  </div>
                  <BarcodeSvg value={vehicle.barcode!} height={55} />
                  <div className="text-center">
                    <div className="font-bold tracking-wide">{formatLicensePlate(vehicle.licensePlate)}</div>
                    <div className="text-sm text-muted-foreground">{vehicle.brand} {vehicle.model}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
