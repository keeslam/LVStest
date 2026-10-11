import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BarcodeLabelTemplate } from "@shared/schema";
import {
  DEFAULT_TAPE_LAYOUT, KeyLabelPrintOptions, MAX_TAPE_LENGTH_MM, MIN_TAPE_LENGTH_MM,
  TAPE_WIDTHS_MM, TapeLayout, normalizeTapeLayout,
} from "./key-label-print";

// Layout choice for a key-label print: the built-in die-cut layout, a saved
// template, or the label maker's tape (DYMO at the desk). The tape choice and
// its sizes are remembered per browser: the printer hangs on one pc.
export const DEFAULT_LAYOUT_VALUE = "default";
export const TAPE_LAYOUT_VALUE = "dymo-tape";
const STORAGE_KEY = "lvs.key-label.tape";

interface StoredTape extends TapeLayout {
  preferred: boolean;
}

function loadStored(): StoredTape {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredTape>;
      return { ...normalizeTapeLayout(parsed), preferred: parsed.preferred === true };
    }
  } catch {
    // Private window or blocked storage: fall back to the defaults.
  }
  return { ...DEFAULT_TAPE_LAYOUT, preferred: false };
}

function saveStored(value: StoredTape): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Nothing to do: the choice then only lasts for this page.
  }
}

export interface LabelLayoutState {
  value: string;
  setValue: (value: string) => void;
  tape: TapeLayout;
  setTape: (tape: TapeLayout) => void;
  selectedTemplate: BarcodeLabelTemplate | null;
  printOptions: KeyLabelPrintOptions;
}

export function useLabelLayout(templates: BarcodeLabelTemplate[] | undefined): LabelLayoutState {
  const [stored] = useState<StoredTape>(() => loadStored());
  const [value, setValue] = useState<string>(stored.preferred ? TAPE_LAYOUT_VALUE : DEFAULT_LAYOUT_VALUE);
  const [tape, setTape] = useState<TapeLayout>({ tapeWidthMm: stored.tapeWidthMm, lengthMm: stored.lengthMm });

  // Preselect the template marked as default once the list arrives, unless this
  // pc prefers the tape.
  useEffect(() => {
    if (value !== DEFAULT_LAYOUT_VALUE) return;
    const preferred = templates?.find(tpl => tpl.isDefault);
    if (preferred) setValue(String(preferred.id));
  }, [templates]);

  useEffect(() => {
    saveStored({ ...tape, preferred: value === TAPE_LAYOUT_VALUE });
  }, [tape, value]);

  const selectedTemplate = templates?.find(tpl => String(tpl.id) === value) ?? null;
  const printOptions: KeyLabelPrintOptions = value === TAPE_LAYOUT_VALUE ? { tape } : {};

  return { value, setValue, tape, setTape, selectedTemplate, printOptions };
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
  const isTape = layout.value === TAPE_LAYOUT_VALUE;

  const commitLength = () => {
    const next = normalizeTapeLayout({ ...layout.tape, lengthMm: Number(lengthText) });
    layout.setTape(next);
    setLengthText(String(next.lengthMm));
  };

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

      {isTape && (
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
          {!compact && (
            <p className="col-span-2 text-xs text-muted-foreground" data-testid="tape-layout-hint">
              {t("tape.hint", { width: layout.tape.tapeWidthMm, length: layout.tape.lengthMm })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
