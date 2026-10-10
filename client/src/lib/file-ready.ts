/**
 * A-19-8 (audit 2026-10-09, module 19): outputs (CSV, PDF, reports) gave no
 * feedback about the file they made. `notifyFileReady` is the one toast every
 * download site calls: "Bestand gemaakt: boetes-2026-10-10.csv (12 kB)".
 */
import i18n from "@/i18n";
import { toast } from "@/hooks/use-toast";

/** "512 B", "12 kB", "1,5 MB": short, with a decimal comma. */
export function fileSizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${text.replace(".", ",")} ${units[unit]}`;
}

/** Tells the user which file was made and, when known, how big it is. */
export function notifyFileReady(name: string, sizeBytes?: number): void {
  const size = sizeBytes === undefined ? "" : fileSizeText(sizeBytes);
  toast({
    title: String(i18n.t("common:fileReady.title")),
    description: String(i18n.t("common:fileReady.description", { name, size: size ? ` (${size})` : "" })),
  });
}
