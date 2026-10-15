import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { Vehicle, BarcodeLabelTemplate } from "@shared/schema";
import { formatSpareKeyBarcode } from "@shared/barcode";
import { BarcodeSvg } from "./barcode-svg";
import { printKeyLabels } from "./key-label-print";
import { KeyLabelKind, LabelLayoutPicker, useLabelLayout } from "./label-layout-picker";

interface KeyLabelPrintPanelProps {
  vehicle: Vehicle;
}

type PrintTarget = KeyLabelKind;

/**
 * Barcode plus the two key-label print buttons, for placing directly on a page.
 * The same controls live inside VehicleBarcodeDialog; this is the version you
 * do not have to open a dialog for.
 *
 * The template is chosen at print time instead of from a dropdown parked in the
 * panel: it only matters once you actually print, and the dropdown made the
 * panel twice as wide as it needed to be.
 */
export function KeyLabelPrintPanel({ vehicle }: KeyLabelPrintPanelProps) {
  const { t } = useTranslation(["barcodes", "common"]);

  // GET is requireAuth only, so any staff member can pick a layout.
  const { data: labelTemplates } = useQuery<BarcodeLabelTemplate[]>({
    queryKey: ["/api/barcode-label-templates"],
  });
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null);
  // The spare key preselects its own default template (falls back to the main one).
  const layout = useLabelLayout(labelTemplates, printTarget ?? "main");

  const print = () => {
    if (!printTarget) return;
    printKeyLabels(
      printTarget === "spare"
        // The spare-key code is derived, never stored, so it is passed as an
        // override instead of touching vehicle.barcode.
        ? [{ ...vehicle, barcodeOverride: formatSpareKeyBarcode(vehicle.id) }]
        : [vehicle],
      layout.selectedTemplate,
      layout.printOptions,
    );
    setPrintTarget(null);
  };

  if (!vehicle.barcode) return null;

  return (
    <>
      <div className="rounded-lg border bg-card px-3 py-2 flex flex-wrap items-center gap-2" data-testid="panel-key-label-print">
        <div className="rounded bg-white px-1.5 py-0.5 border">
          <BarcodeSvg value={vehicle.barcode} height={28} className="h-auto max-w-[130px]" />
        </div>

        <Button
          size="sm"
          className="h-8"
          onClick={() => setPrintTarget("main")}
          data-testid="button-inline-print-key-label"
        >
          <Printer className="h-4 w-4 mr-2" />
          {t("label.printKeyLabelShort")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setPrintTarget("spare")}
          data-testid="button-inline-print-spare-key-label"
        >
          <Printer className="h-4 w-4 mr-2" />
          {t("label.printSpareKeyLabelShort")}
        </Button>
      </div>

      <Dialog open={printTarget !== null} onOpenChange={(open) => { if (!open) setPrintTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-key-label-template">
          <DialogHeader>
            <DialogTitle>
              {t(printTarget === "spare" ? "label.printSpareKeyLabel" : "label.printKeyLabel")}
            </DialogTitle>
            <DialogDescription>{t("templatePicker.pickDescription")}</DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <LabelLayoutPicker
              id="key-label-template-picker"
              layout={layout}
              templates={labelTemplates}
              selectTestId="select-key-label-template-picker"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintTarget(null)} data-testid="button-key-label-cancel">
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={print} data-testid="button-key-label-print-confirm">
              <Printer className="h-4 w-4 mr-2" />
              {t("templatePicker.printButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
