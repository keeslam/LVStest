/**
 * Turns a CJIB delivery file (XML or CSV) into CjibRecords. The real CJIB
 * layout is not known yet: every field is found through an alias list, so
 * adapting to the specification means editing CJIB_FIELDS and the fixtures
 * under server/__tests__/fixtures/cjib/.
 */
import { XMLParser } from "fast-xml-parser";
import { normalizeLicensePlate, type CjibRecord } from "../../../shared/fines";

type Field = "reference" | "licensePlate" | "offenceDate" | "offenceTime" | "description" | "offenceCode" | "location" | "amount" | "letterDate" | "dueDate";

export const CJIB_FIELDS: Record<Field, string[]> = {
  reference: ["beschikkingsnummer", "cjibnummer", "kenmerk", "zaaknummer", "referentie"],
  licensePlate: ["kenteken", "kentekennummer", "licenseplate"],
  offenceDate: ["pleegdatum", "overtredingsdatum", "datumovertreding", "datum"],
  offenceTime: ["pleegtijd", "tijd", "tijdstip", "pleegtijdstip"],
  description: ["feitomschrijving", "omschrijving", "feit", "gedraging", "omschrijvingfeit"],
  offenceCode: ["feitcode", "gedragingscode", "code"],
  location: ["pleeglocatie", "plaats", "locatie", "straat", "pleegplaats"],
  amount: ["sanctiebedrag", "boetebedrag", "totaalbedrag", "bedrag"],
  letterDate: ["dagtekening", "datumbeschikking", "beschikkingsdatum"],
  dueDate: ["vervaldatum", "uiterstebetaaldatum", "betaaldatum"],
};

/** "CJIB-nummer" -> "cjibnummer": case and punctuation do not matter. */
export const normaliseKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(row: Record<string, string>, field: Field): string | null {
  const keys = Object.keys(row);
  for (const alias of CJIB_FIELDS[field]) {
    const hit = keys.find((k) => normaliseKey(k) === alias);
    if (hit && row[hit] !== undefined && String(row[hit]).trim() !== "") return String(row[hit]).trim();
  }
  return null;
}

/** dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd, yyyymmdd -> yyyy-mm-dd */
export function parseDay(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** hh:mm, hh:mm:ss, hhmm -> hh:mm */
export function parseTime(raw: string | null): string {
  if (!raw) return "00:00";
  const s = raw.trim();
  let m = s.match(/^(\d{1,2}):(\d{2})/); if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  m = s.match(/^(\d{2})(\d{2})$/); if (m) return `${m[1]}:${m[2]}`;
  return "00:00";
}

/** "95,00", "€ 1.234,50", "410" -> number */
export function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d,.-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function toRecord(row: Record<string, string>, index: number): CjibRecord {
  const reference = pick(row, "reference");
  const plateRaw = pick(row, "licensePlate");
  const day = parseDay(pick(row, "offenceDate"));
  const amount = parseAmount(pick(row, "amount"));
  const missing = [!reference && "beschikkingsnummer", !plateRaw && "kenteken", !day && "pleegdatum", amount === null && "bedrag"].filter(Boolean);
  if (missing.length) throw new Error(`Record ${index + 1}: missing ${missing.join(", ")}`);
  const offenceCode = pick(row, "offenceCode");
  const location = pick(row, "location");
  const baseDescription = pick(row, "description") ?? (offenceCode ? `Feitcode ${offenceCode}` : "Beschikking CJIB");
  const description = location && !baseDescription.includes(location) ? `${baseDescription}, ${location}` : baseDescription;
  // Wall-clock local time, stored the way the rest of the app stores timestamps.
  const offenceAt = new Date(`${day}T${parseTime(pick(row, "offenceTime"))}:00`);
  return {
    reference: reference!, licensePlate: normalizeLicensePlate(plateRaw!), offenceAt, description: description.slice(0, 500), amount: amount!,
    letterDate: parseDay(pick(row, "letterDate")), dueDate: parseDay(pick(row, "dueDate")), offenceCode, location, raw: row,
  };
}

// ---- XML ------------------------------------------------------------------------

function flatten(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!node || typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("@_")) { out[k.slice(2)] = String(v); continue; }
    if (v === null || v === undefined) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const text = (v as any)["#text"];
      if (text !== undefined) out[k] = String(text);
      else Object.assign(out, flatten(v));
    } else if (!Array.isArray(v)) out[k] = String(v);
  }
  return out;
}

function isRecordNode(node: any): boolean {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const keys = Object.keys(node).map(normaliseKey);
  return CJIB_FIELDS.reference.some((a) => keys.includes(a)) && CJIB_FIELDS.licensePlate.some((a) => keys.includes(a));
}

/**
 * BUG-101: this walk had no depth limit, so a deeply nested XML document
 * exhausted the call stack. A RangeError there used to reach the process-level
 * handler and stop the server; a real CJIB export is a handful of levels deep,
 * so refusing anything past 100 is free.
 */
const MAX_XML_DEPTH = 100;

function collectRecordNodes(node: any, out: any[], depth = 0): void {
  if (depth > MAX_XML_DEPTH) {
    throw new Error(`XML is nested deeper than ${MAX_XML_DEPTH} levels`);
  }
  if (Array.isArray(node)) { node.forEach((n) => collectRecordNodes(n, out, depth + 1)); return; }
  if (!node || typeof node !== "object") return;
  if (isRecordNode(node)) { out.push(node); return; }
  Object.values(node).forEach((v) => collectRecordNodes(v, out, depth + 1));
}

function parseXml(text: string): Record<string, string>[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: true });
  let doc: any;
  try { doc = parser.parse(text); } catch (e) { throw new Error(`XML could not be parsed: ${(e as Error).message}`); }
  const nodes: any[] = [];
  collectRecordNodes(doc, nodes);
  return nodes.map(flatten);
}

// ---- CSV ------------------------------------------------------------------------

function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = []; let cur = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV has no data rows");
  const sep = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ";" : ",";
  const header = splitCsvLine(lines[0], sep);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, sep);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

// ---- entry ----------------------------------------------------------------------

export interface CjibParseResult { records: CjibRecord[]; rejected: Array<{ row: number; error: string; raw: Record<string, string> }> }

/** Structure errors throw; a row missing required fields lands in rejected so the rest of the file still goes through. */
export function parseCjibFile(content: Buffer | string, fileName = ""): CjibParseResult {
  const text = (Buffer.isBuffer(content) ? content.toString("utf8") : content).replace(/^﻿/, "");
  const trimmed = text.trimStart();
  const isXml = trimmed.startsWith("<") || /\.xml$/i.test(fileName);
  const rows = isXml ? parseXml(trimmed) : parseCsv(text);
  if (rows.length === 0) throw new Error("No beschikkingen found in the file");
  const result: CjibParseResult = { records: [], rejected: [] };
  rows.forEach((row, i) => {
    try { result.records.push(toRecord(row, i)); } catch (e) { result.rejected.push({ row: i + 1, error: (e as Error).message, raw: row }); }
  });
  return result;
}
