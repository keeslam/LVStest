import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BarcodeLabelTemplate } from "@shared/schema";
import {
  DEFAULT_TAPE_LAYOUT, DymoOutput, KeyLabelPrintOptions, MAX_TAPE_LENGTH_MM, MIN_TAPE_LENGTH_MM,
  TAPE_WIDTHS_MM, TapeLayout, normalizeTapeLayout,
} from "./key-label-print";
import { DymoTapePrinter, findDymoService, listDymoTapePrinters } from "@/lib/dymo-label";

// Layout choice for a key-label print: the built-in die-cut layout, a saved
// template, or the label maker's tape (DYMO at the desk). The tape choice, its
// sizes and the output (browser, DYMO printer, .label file) are remembered per
// browser: the printer hangs on one pc.
export const DEFAULT_LAYOUT_VALUE = "default";
export const TAPE_LAYOUT_VALUE = "dymo-tape";
const STORAGE_KEY = "lvs.key-label.tape";

export const OUTPUT_BROWSER = "browser";
export const OUTPUT_DOWNLOAD = "download";
const OUTPUT_PRINTER_PREFIX = "printer:";

interface StoredTape extends TapeLayout {
  preferred: boolean;
  // "browser" | "download" | "printer:<name>"
  output: string;
}

function loadStored(): StoredTape {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredTape>;
      return {
        ...normalizeTapeLayout(parsed),
        preferred: parsed.preferred === true,
        output: typeof parsed.output === "string" ? parsed.output : OUTPUT_BROWSER,
      };
    }
  } catch {
    // Private window or blocked storage: fall back to the defaults.
  }
  return { ...DEFAULT_TAPE_LAYOUT, preferred: false, output: OUTPUT_BROWSER };
}

function saveStored(value: StoredTape): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Nothing to do: the choice then only lasts for this page.
  }
}

export type DymoStatus = "idle" | "searching" | "found" | "none";

export interface LabelLayoutState {
  value: string;
  setValue: (value: string) => void;
  tape: TapeLayout;
  setTape: (tape: TapeLayout) => void;
  selectedTemplate: BarcodeLabelTemplate | null;
  // True for the built-in tape layout and for a template marked as tape.
  isTape: boolean;
  output: string;
  setOutput: (output: string) => void;
  dymoStatus: DymoStatus;
  printers: DymoTapePrinter[];
  printOptions: KeyLabelPrintOptions;
}

function outputToDymo(output: string, printers: DymoTapePrinter[]): DymoOutput | null {
  if (output === OUTPUT_DOWNLOAD) return { mode: "download" };
  if (output.startsWith(OUTPUT_PRINTER_PREFIX)) {
    const printerName = output.slice(OUTPUT_PRINTER_PREFIX.length);
    if (printers.some(p => p.name === printerName)) return { mode: "print", printerName };
  }
  return null;
}

export function useLabelLayout(templates: BarcodeLabelTemplate[] | undefined): LabelLayoutState {
  const [stored] = useState<StoredTape>(() => loadStored());
  const [value, setValue] = useState<string>(stored.preferred ? TAPE_LAYOUT_VALUE : DEFAULT_LAYOUT_VALUE);
  const [tape, setTape] = useState<TapeLayout>({ tapeWidthMm: stored.tapeWidthMm, lengthMm: stored.lengthMm });
  const [output, setOutput] = useState<string>(stored.output);
  const [dymoStatus, setDymoStatus] = useState<DymoStatus>("idle");
  const [printers, setPrinters] = useState<DymoTapePrinter[]>([]);

  // Preselect the template marked as default once the list arrives, unless this
  // pc prefers the tape.
  useEffect(() => {
    if (value !== DEFAULT_LAYOUT_VALUE) return;
    const preferred = templates?.find(tpl => tpl.isDefault);
    if (preferred) setValue(String(preferred.id));
  }, [templates]);

  const selectedTemplate = templates?.find(tpl => String(tpl.id) === value) ?? null;
  const isTape = value === TAPE_LAYOUT_VALUE || !!selectedTemplate?.tapePrint;

  useEffect(() => {
    saveStored({ ...tape, preferred: value === TAPE_LAYOUT_VALUE, output });
  }, [tape, value, output]);

  // Look for DYMO Connect's web service on this pc the first time a tape is chosen.
  const searched = useRef(false);
  useEffect(() => {
    if (!isTape || searched.current) return;
    searched.current = true;
    let cancelled = false;
    setDymoStatus("searching");
    (async () => {
      try {
        const origin = await findDymoService();
        const list = origin ? await listDymoTapePrinters(origin) : [];
        if (cancelled) return;
        setPrinters(list);
        setDymoStatus(list.length > 0 ? "found" : "none");
      } catch {
        if (!cancelled) setDymoStatus("none");
      }
    })();
    return () => { cancelled = true; };
  }, [isTape]);

  const dymo = isTape ? outputToDymo(output, printers) : null;
  const printOptions: KeyLabelPrintOptions = {
    ...(value === TAPE_LAYOUT_VALUE ? { tape } : {}),
    ...(dymo ? { dymo } : {}),
  };

  return { value, setValue, tape, setTape, selectedTemplate, isTape, output, setOutput, dymoStatus, printers, printOptions };
}

interface LabelLayoutPickerProps {
  id: string;
  layout: LabelLayoutState;
  templates: BarcodeLabelTemplate[] | undefined;
  selectTestId?: string;
  // Compact: label in small text and the select at a fixed width (barcode book header).
  compact?: boolean;
}

export function LabelLayoutPicker({ id, layout, templates, selectTestId, compact }: LabelLayoutPickerProps) {
  const { t } = useTranslation(["barcodes"]);
  const [lengthText, setLengthText] = useState(String(layout.tape.lengthMm));
  const isBuiltInTape = layout.value === TAPE_LAYOUT_VALUE;

  const commitLength = () => {
    const next = normalizeTapeLayout({ ...layout.tape, lengthMm: Number(lengthText) });
    layout.setTape(next);
    setLengthText(String(next.lengthMm));
  };

  // A remembered printer that is not there any more falls back to the browser in the list.
  const outputValue = layout.output.startsWith(OUTPUT_PRINTER_PREFIX)
    && !layout.printers.some(p => `${OUTPUT_PRINTER_PREFIX}${p.name}` === layout.output)
    ? OUTPUT_BROWSER
    : layout.output;

  return (
    <div className={compact ? "flex flex-wrap items-end gap-2" : "space-y-2"} data-testid="label-layout-picker">
      <div className={compact ? "space-y-1" : "space-y-2"}>
        <Label htmlFor={id} className={compact ? "text-xs" : undefined}>{t("templatePicker.label")}</Label>
        <Select value={layout.value} onValueChange={layout.setValue}>
          <SelectTrigger id={id} className={compact ? "w-56" : undefined} data-testid={selectTestId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_LAYOUT_VALUE}>{t("templatePicker.defaultOption")}</SelectItem>
            <SelectItem value={TAPE_LAYOUT_VALUE} data-testid="option-label-layout-tape">
              {t("tape.option")}
            </SelectItem>
            {(templates ?? []).map(tpl => (
              <SelectItem key={tpl.id} value={String(tpl.id)}>{tpl.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isBuiltInTape && (
        <div className={compact ? "flex items-end gap-2" : "grid grid-cols-2 gap-3"} data-testid="tape-layout-fields">
          <div className="space-y-1">
            <Label htmlFor={`${id}-tape-width`} className="text-xs">{t("tape.widthLabel")}</Label>
            <Select
              value={String(layout.tape.tapeWidthMm)}
              onValueChange={(v) => layout.setTape(normalizeTapeLayout({ ...layout.tape, tapeWidthMm: Number(v) }))}
            >
              <SelectTrigger id={`${id}-tape-width`} className="w-28" data-testid="select-tape-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAPE_WIDTHS_MM.map(w => (
                  <SelectItem key={w} value={String(w)}>{t("tape.widthOption", { width: w })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-tape-length`} className="text-xs">{t("tape.lengthLabel")}</Label>
            <Input
              id={`${id}-tape-length`}
              type="number"
              inputMode="numeric"
              min={MIN_TAPE_LENGTH_MM}
              max={MAX_TAPE_LENGTH_MM}
              className="w-28"
              value={lengthText}
              onChange={(e) => setLengthText(e.target.value)}
              onBlur={commitLength}
              onKeyDown={(e) => { if (e.key === "Enter") commitLength(); }}
              data-testid="input-tape-length"
            />
          </div>
        </div>
      )}

      {layout.isTape && (
        <div className={compact ? "space-y-1" : "space-y-1"} data-testid="tape-output">
          <Label htmlFor={`${id}-tape-output`} className="text-xs">{t("dymo.outputLabel")}</Label>
          <Select value={outputValue} onValueChange={layout.setOutput}>
            <SelectTrigger id={`${id}-tape-output`} className={compact ? "w-72" : undefined} data-testid="select-tape-output">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OUTPUT_BROWSER} data-testid="option-tape-output-browser">{t("dymo.outputBrowser")}</SelectItem>
              {layout.printers.map(p => (
                <SelectItem key={p.name} value={`${OUTPUT_PRINTER_PREFIX}${p.name}`} data-testid="option-tape-output-printer">
                  {t(p.isConnected ? "dymo.outputPrinter" : "dymo.outputPrinterOffline", { name: p.name })}
                </SelectItem>
              ))}
              <SelectItem value={OUTPUT_DOWNLOAD} data-testid="option-tape-output-download">{t("dymo.outputDownload")}</SelectItem>
            </SelectContent>
          </Select>
          {!compact && (
            <p className="text-xs text-muted-foreground" data-testid="tape-output-hint">
              {layout.dymoStatus === "searching" && t("dymo.statusSearching")}
              {layout.dymoStatus === "none" && t("dymo.statusNone")}
              {layout.dymoStatus === "found" && t("dymo.statusFound", { count: layout.printers.length })}
              {outputValue === OUTPUT_BROWSER && layout.dymoStatus !== "searching" && ` ${t("tape.hint", { width: layout.tape.tapeWidthMm, length: layout.tape.lengthMm })}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
