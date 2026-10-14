/**
 * B-45 — DYMO label maker at the desk (LabelManager 420P on 12 mm D1 tape).
 *
 * Windows gives that printer no real port (it prints to a .prn file), so the
 * app talks to the DYMO web service that DYMO Connect installs on the desk pc
 * (https://127.0.0.1:41951) and hands it a label in DYMO's own .label format
 * (ContinuousLabel, DYMO Label v8 XML; DYMO Connect opens and prints it too).
 * The same XML is what the "Download .label" option writes to a file.
 */
import type { BarcodeLabelField, BarcodeLabelVehicle } from "@shared/barcode";
import { resolveBarcodeLabelSource } from "@shared/barcode";

export const DYMO_SERVICE_ORIGINS = ["https://127.0.0.1:41951", "https://localhost:41951"] as const;
const DYMO_SERVICE_PATH = "/DYMO/DLS/Printing";
const PROBE_TIMEOUT_MS = 2500;

export interface DymoTapePrinter {
  name: string;
  modelName: string;
  isConnected: boolean;
  autoCut: boolean;
}

export interface TapeLine {
  text: string;
  fontPt: number;
  bold: boolean;
}

export interface TapeLabelInput {
  tapeWidthMm: number;
  lengthMm: number;
  code: string;
  lines: TapeLine[];
}

const TWIPS_PER_MM = 1440 / 25.4;

export function mmToTwips(mm: number): number {
  return Math.round(mm * TWIPS_PER_MM);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tapePaperName(tapeWidthMm: number): string {
  return `${Math.round(tapeWidthMm)}mm`;
}

/**
 * The text fields of a tape layout as lines: fields on the same height (to the
 * half millimetre) form one line, left to right, two spaces apart. The line
 * takes the biggest font and is bold when any of its fields is.
 */
export function tapeLinesFromFields(fields: BarcodeLabelField[], vehicle: BarcodeLabelVehicle): TapeLine[] {
  const rows = new Map<number, { x: number; text: string; fontPt: number; bold: boolean }[]>();
  for (const field of fields) {
    if (field.source === "barcode") continue;
    const text = resolveBarcodeLabelSource(field.source, vehicle, field.name).trim();
    if (!text) continue;
    const key = Math.round(field.y * 2) / 2;
    const row = rows.get(key) ?? [];
    row.push({ x: field.x, text, fontPt: field.fontSize, bold: field.isBold });
    rows.set(key, row);
  }
  return Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => {
      row.sort((a, b) => a.x - b.x);
      return {
        text: row.map(r => r.text).join("  "),
        fontPt: Math.max(...row.map(r => r.fontPt)),
        bold: row.some(r => r.bold),
      };
    });
}

function textObjectXml(line: TapeLine, name: string): string {
  return `        <TextObject>
          <Name>${name}</Name>
          <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
          <LinkedObjectName></LinkedObjectName>
          <Rotation>Rotation0</Rotation>
          <IsMirrored>False</IsMirrored>
          <IsVariable>False</IsVariable>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <TextFitMode>ShrinkToFit</TextFitMode>
          <UseFullFontHeight>True</UseFullFontHeight>
          <Verticalized>False</Verticalized>
          <StyledText>
            <Element>
              <String>${escapeXml(line.text)}</String>
              <Attributes>
                <Font Family="Arial" Size="${Math.max(4, Math.round(line.fontPt))}" Bold="${line.bold ? "True" : "False"}" Italic="False" Underline="False" Strikeout="False"/>
                <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
              </Attributes>
            </Element>
          </StyledText>
        </TextObject>`;
}

function cellXml(objectXml: string): string {
  return `      <Cell>
${objectXml}
        <ObjectMargin Left="100" Right="100" Top="0" Bottom="0"/>
        <Length>0</Length>
        <LengthMode>Auto</LengthMode>
        <BorderWidth>0</BorderWidth>
        <BorderStyle>Solid</BorderStyle>
        <BorderColor Alpha="255" Red="0" Green="0" Blue="0"/>
      </Cell>`;
}

/**
 * One tape label in DYMO Label v8's ContinuousLabel format: the Code 128
 * barcode with exactly the VEH-code (no text under the bars) and the text lines
 * next to it, on a fixed label length so every key label is the same size.
 */
export function buildTapeLabelXml(input: TapeLabelInput): string {
  const lengthTwips = mmToTwips(input.lengthMm);
  const barcode = `        <BarcodeObject>
          <Name>BARCODE</Name>
          <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          <BackColor Alpha="255" Red="255" Green="255" Blue="255"/>
          <LinkedObjectName></LinkedObjectName>
          <Rotation>Rotation0</Rotation>
          <IsMirrored>False</IsMirrored>
          <IsVariable>False</IsVariable>
          <Text>${escapeXml(input.code)}</Text>
          <Type>Code128Auto</Type>
          <Size>Small</Size>
          <TextPosition>None</TextPosition>
          <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
          <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False"/>
          <TextEmbedding>None</TextEmbedding>
          <ECLevel>0</ECLevel>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <QuietZonesPadding Left="0" Right="0" Top="0" Bottom="0"/>
        </BarcodeObject>`;
  const textCells = input.lines.length > 0
    ? [cellXml(textObjectXml(
        {
          text: input.lines.map(l => l.text).join("\n"),
          fontPt: Math.max(...input.lines.map(l => l.fontPt)),
          bold: input.lines.some(l => l.bold),
        },
        "TEXT",
      ))]
    : [];
  return `<?xml version="1.0" encoding="utf-8"?>
<ContinuousLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Tape${tapePaperName(input.tapeWidthMm)}</Id>
  <PaperName>${tapePaperName(input.tapeWidthMm)}</PaperName>
  <LengthMode>Fixed</LengthMode>
  <LabelLength>${lengthTwips}</LabelLength>
  <RootCell>
    <Length>${lengthTwips}</Length>
    <LengthMode>Fixed</LengthMode>
    <BorderWidth>0</BorderWidth>
    <BorderStyle>Solid</BorderStyle>
    <BorderColor Alpha="255" Red="0" Green="0" Blue="0"/>
    <SubcellsOrientation>Horizontal</SubcellsOrientation>
    <Subcells>
${[cellXml(barcode), ...textCells].join("\n")}
    </Subcells>
  </RootCell>
</ContinuousLabel>
`;
}

export interface TapeImageLabelInput {
  tapeWidthMm: number;
  lengthMm: number;
  /** Base64 PNG of the whole label, as long as `lengthMm` and as high as the tape is wide. */
  pngBase64: string;
}

/**
 * The same ContinuousLabel as buildTapeLabelXml, but with one picture filling the label
 * (no margins, stretched to the fixed length): the layout is drawn by the app exactly like the
 * template, so DYMO has no say in sizes or positions.
 */
export function buildTapeImageLabelXml(input: TapeImageLabelInput): string {
  const lengthTwips = mmToTwips(input.lengthMm);
  const image = `        <ImageObject>
          <Name>LABEL</Name>
          <ForeColor Alpha="255" Red="0" Green="0" Blue="0"/>
          <BackColor Alpha="0" Red="255" Green="255" Blue="255"/>
          <LinkedObjectName></LinkedObjectName>
          <Rotation>Rotation0</Rotation>
          <IsMirrored>False</IsMirrored>
          <IsVariable>False</IsVariable>
          <Image>${input.pngBase64}</Image>
          <ScaleMode>Fill</ScaleMode>
          <BorderWidth>0</BorderWidth>
          <BorderColor Alpha="255" Red="0" Green="0" Blue="0"/>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
        </ImageObject>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<ContinuousLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Tape${tapePaperName(input.tapeWidthMm)}</Id>
  <PaperName>${tapePaperName(input.tapeWidthMm)}</PaperName>
  <LengthMode>Fixed</LengthMode>
  <LabelLength>${lengthTwips}</LabelLength>
  <RootCell>
    <Length>${lengthTwips}</Length>
    <LengthMode>Fixed</LengthMode>
    <BorderWidth>0</BorderWidth>
    <BorderStyle>Solid</BorderStyle>
    <BorderColor Alpha="255" Red="0" Green="0" Blue="0"/>
    <SubcellsOrientation>Horizontal</SubcellsOrientation>
    <Subcells>
      <Cell>
${image}
        <ObjectMargin Left="0" Right="0" Top="0" Bottom="0"/>
        <Length>${lengthTwips}</Length>
        <LengthMode>Fixed</LengthMode>
        <BorderWidth>0</BorderWidth>
        <BorderStyle>Solid</BorderStyle>
        <BorderColor Alpha="255" Red="0" Green="0" Blue="0"/>
      </Cell>
    </Subcells>
  </RootCell>
</ContinuousLabel>
`;
}

/** sleutellabel-12-XT-102-VEH-000004.label */
export function dymoLabelFileName(plate: string, code: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `sleutellabel-${safe(plate)}-${safe(code)}.label`;
}

function tapePrintParamsXml(jobTitle: string): string {
  return `<TapePrintParams><Copies>1</Copies><JobTitle>${escapeXml(jobTitle)}</JobTitle><Alignment>Center</Alignment><CutMode>AutoCut</CutMode></TapePrintParams>`;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = PROBE_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The origin of a running DYMO web service on this pc, or null. */
export async function findDymoService(): Promise<string | null> {
  for (const origin of DYMO_SERVICE_ORIGINS) {
    try {
      const res = await fetchWithTimeout(`${origin}${DYMO_SERVICE_PATH}/StatusConnected`);
      if (res.ok && (await res.text()).trim() === "true") return origin;
    } catch {
      // not running, blocked, or the certificate is not trusted: try the next one
    }
  }
  return null;
}

// GetPrinters answers a JSON string holding XML.
function unwrapServiceText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('"')) {
    try {
      return String(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function parseTapePrinters(xml: string): DymoTapePrinter[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return Array.from(doc.getElementsByTagName("TapePrinter")).map(node => ({
    name: node.getElementsByTagName("Name")[0]?.textContent?.trim() ?? "",
    modelName: node.getElementsByTagName("ModelName")[0]?.textContent?.trim() ?? "",
    isConnected: node.getElementsByTagName("IsConnected")[0]?.textContent?.trim().toLowerCase() === "true",
    autoCut: node.getElementsByTagName("IsAutoCutSupported")[0]?.textContent?.trim().toLowerCase() === "true",
  })).filter(p => p.name);
}

export async function listDymoTapePrinters(origin: string): Promise<DymoTapePrinter[]> {
  const res = await fetchWithTimeout(`${origin}${DYMO_SERVICE_PATH}/GetPrinters`);
  if (!res.ok) throw new Error(`GetPrinters ${res.status}`);
  return parseTapePrinters(unwrapServiceText(await res.text()));
}

/** Sends one label to the printer; the service answers "true" when it accepted the job. */
export async function printDymoLabel(origin: string, printerName: string, labelXml: string, jobTitle: string): Promise<void> {
  const body = new URLSearchParams({
    printerName,
    printParamsXml: tapePrintParamsXml(jobTitle),
    labelXml,
    labelSetXml: "",
  });
  const res = await fetchWithTimeout(
    `${origin}${DYMO_SERVICE_PATH}/PrintLabel`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
    15000,
  );
  const text = unwrapServiceText(await res.text());
  if (!res.ok || text.toLowerCase() !== "true") {
    throw new Error(text || `PrintLabel ${res.status}`);
  }
}
