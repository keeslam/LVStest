import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ExternalLink, Info, Loader2, Printer, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { buildTapeLabelXml, findDymoService, listDymoTapePrinters, printDymoLabel, DYMO_SERVICE_ORIGINS, type DymoTapePrinter } from "@/lib/dymo-label";
import { OUTPUT_BROWSER, OUTPUT_DOWNLOAD, OUTPUT_PRINTER_PREFIX, readKeyLabelOutput, saveKeyLabelOutput } from "@/components/barcodes/label-layout-picker";

/** The page the browser shows for DYMO's own web service: open it once to accept its certificate. */
export const DYMO_CERTIFICATE_URL = `${DYMO_SERVICE_ORIGINS[0]}/DYMO/DLS/Printing/StatusConnected`;

type Status = "searching" | "found" | "none";

/**
 * Settings > Printers (deze pc), Kees 2026-10-19. A browser cannot list the printers of a pc; the DYMO
 * label makers it can see through DYMO Connect's web service on this pc. Shows whether that service
 * answers (and what to do when it does not, usually a blocked certificate), which label makers it
 * knows, lets this pc pick the one key labels go to by default (kept in this browser, as every pc has
 * its own printers) and prints a test label. Ordinary A4 printers stay the browser's print dialog.
 */
export function PrintersPanel() {
  const { t } = useTranslation("settings");
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("searching");
  const [origin, setOrigin] = useState<string | null>(null);
  const [printers, setPrinters] = useState<DymoTapePrinter[]>([]);
  const [output, setOutput] = useState(() => readKeyLabelOutput().output);
  const [testing, setTesting] = useState<string | null>(null);

  const search = useCallback(async () => {
    setStatus("searching");
    try {
      const found = await findDymoService();
      const list = found ? await listDymoTapePrinters(found) : [];
      setOrigin(found);
      setPrinters(list);
      setStatus(found ? "found" : "none");
    } catch {
      setOrigin(null);
      setPrinters([]);
      setStatus("none");
    }
  }, []);
  useEffect(() => { void search(); }, [search]);

  const choose = (value: string) => {
    setOutput(value);
    saveKeyLabelOutput(value);
    toast({ title: t("printers.savedTitle"), description: t("printers.savedDescription") });
  };

  const testPrint = async (printer: DymoTapePrinter) => {
    if (!origin) return;
    setTesting(printer.name);
    try {
      const xml = buildTapeLabelXml({
        tapeWidthMm: readKeyLabelOutput().tapeWidthMm, lengthMm: 48, code: "TEST",
        lines: [{ text: t("printers.testLabelText"), fontPt: 10, bold: true }, { text: new Date().toLocaleDateString("nl-NL"), fontPt: 8, bold: false }],
      });
      await printDymoLabel(origin, printer.name, xml, t("printers.testLabelText"));
      toast({ title: t("printers.testSentTitle"), description: t("printers.testSentDescription", { name: printer.name }) });
    } catch (e) {
      toast({ title: t("printers.testFailedTitle"), description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  // A remembered label maker that this pc does not know (another pc's, or unplugged) still shows, marked.
  const savedPrinter = output.startsWith(OUTPUT_PRINTER_PREFIX) ? output.slice(OUTPUT_PRINTER_PREFIX.length) : null;
  const savedMissing = savedPrinter !== null && !printers.some((p) => p.name === savedPrinter);

  return (
    <div className="space-y-6" data-testid="printers-panel">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />{t("printers.title")}</CardTitle>
          <CardDescription>{t("printers.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid="dymo-status">
            <div className="flex items-center gap-2 text-sm">
              {status === "searching" && <><Loader2 className="h-4 w-4 animate-spin" />{t("printers.searching")}</>}
              {status === "found" && <><CheckCircle2 className="h-4 w-4 text-green-600" />{t("printers.found", { count: printers.length })}</>}
              {status === "none" && <><XCircle className="h-4 w-4 text-red-600" />{t("printers.notFound")}</>}
            </div>
            <Button size="sm" variant="outline" onClick={() => void search()} disabled={status === "searching"} data-testid="button-printers-search">
              <RefreshCw className="mr-1 h-4 w-4" />{t("printers.searchAgain")}
            </Button>
          </div>

          {status === "none" && (
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="dymo-help">
              <p className="font-medium">{t("printers.helpTitle")}</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>{t("printers.helpInstall")}</li>
                <li>
                  {t("printers.helpCertificate")}
                  <div className="mt-1">
                    <Button size="sm" variant="outline" asChild data-testid="button-dymo-certificate">
                      <a href={DYMO_CERTIFICATE_URL} target="_blank" rel="noreferrer"><ShieldAlert className="mr-1 h-4 w-4" />{t("printers.allowCertificate")}<ExternalLink className="ml-1 h-3 w-3" /></a>
                    </Button>
                  </div>
                  <p className="mt-1 text-xs">{t("printers.helpCertificateResult")}</p>
                </li>
                <li>{t("printers.helpSearchAgain")}</li>
              </ol>
            </div>
          )}

          {status === "found" && (
            <ul className="divide-y rounded-md border" data-testid="dymo-printers">
              {printers.map((p) => (
                <li key={p.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid={`dymo-printer-${p.name}`}>
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.modelName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.isConnected
                      ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{t("printers.connected")}</Badge>
                      : <Badge variant="secondary">{t("printers.notConnected")}</Badge>}
                    {output === `${OUTPUT_PRINTER_PREFIX}${p.name}` && <Badge variant="outline">{t("printers.inUse")}</Badge>}
                    <Button size="sm" variant="outline" onClick={() => void testPrint(p)} disabled={!p.isConnected || testing !== null} data-testid={`button-test-print-${p.name}`}>
                      {testing === p.name ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />}{t("printers.testPrint")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1">
            <Label htmlFor="key-label-output">{t("printers.keyLabelOutput")}</Label>
            <Select value={output} onValueChange={choose}>
              <SelectTrigger id="key-label-output" className="max-w-md" data-testid="select-key-label-output"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={OUTPUT_BROWSER}>{t("printers.outputBrowser")}</SelectItem>
                {printers.map((p) => (
                  <SelectItem key={p.name} value={`${OUTPUT_PRINTER_PREFIX}${p.name}`}>{t("printers.outputPrinter", { name: p.name })}</SelectItem>
                ))}
                {savedMissing && <SelectItem value={output}>{t("printers.outputMissing", { name: savedPrinter })}</SelectItem>}
                <SelectItem value={OUTPUT_DOWNLOAD}>{t("printers.outputDownload")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("printers.keyLabelOutputHint")}</p>
            {savedMissing && <p className="text-xs text-amber-700" data-testid="saved-printer-missing">{t("printers.savedMissing", { name: savedPrinter })}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Info className="h-5 w-5" />{t("printers.otherTitle")}</CardTitle>
          <CardDescription>{t("printers.otherDescription")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
