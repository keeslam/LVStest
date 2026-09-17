/**
 * The Dutch explanation of a verdict, in the shape the brief prescribes:
 * status, why, rule version, the parameters that mattered, the months, what
 * is missing, and the disclaimer. It never says more than the status allows.
 */
import {
  FISCAL_DISCLAIMER,
  FISCAL_STATUS_LABELS,
  MISSING_DATA_LABELS,
  MONTH_REASON_LABELS,
  REVIEW_REASON_LABELS,
  type MonthReason,
  type NotApplicableReason,
} from "../../../shared/fiscal-types";
import type { MonthLine, Verdict } from "./rules/pseudo-eindheffing";
import type { ParameterSnapshotEntry } from "./parameters";

export interface ExplainedVersion {
  title: string;
  versionNumber: number;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
}

import { formatEuro, monthLabelNl, dateLabelNl, decimalNl } from "../../../shared/fiscal-format";
export { formatEuro, monthLabelNl, dateLabelNl };

const MONTH_REASON_NL: Record<MonthReason, string> = MONTH_REASON_LABELS;

const NOT_APPLICABLE_NL: Record<NotApplicableReason, string> = {
  customer_type_not_business: "De klant is geen zakelijke klant en dus geen werkgever in de zin van deze regel.",
  vehicle_out_of_scope: "De Europese voertuigcategorie van de auto valt buiten de regel.",
  zero_emission: "De auto is volledig emissievrij.",
  driving_school: "Een handgeschakelde lesauto is uitgezonderd.",
  no_private_use: "Privégebruik en woon-werkverkeer zijn uitgesloten; de werkgever moet dat kunnen aantonen.",
  before_rule: "De periode ligt geheel vóór de ingangsdatum van de regel.",
  period_closed: "De reservering is geannuleerd of verwijderd; de auto is niet ter beschikking gesteld.",
  fully_exempt: "Alle dagen van de periode vallen onder een vrijstelling.",
};

function param(entries: ParameterSnapshotEntry[], key: string): ParameterSnapshotEntry | undefined {
  return entries.find((e) => e.key === key);
}


function monthLine(m: MonthLine): string {
  const amount = m.amount ? `, ${formatEuro(m.amount)}` : "";
  const provisional = m.settled ? "" : " (voorlopig)";
  return `- ${monthLabelNl(m.month)}: ${m.days} ${m.days === 1 ? "dag" : "dagen"}, ${MONTH_REASON_NL[m.reason]}${amount}${provisional}`;
}

function centsOf(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function euroFromCents(cents: number): string {
  return formatEuro(`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`);
}

/**
 * Besluit F-15: what is fixed and what is still provisional, and the sum per
 * calendar year. Only written when there is an amount.
 */
function amountLines(v: Verdict): string[] {
  if (!v.amount) return [];
  const lines: string[] = [];
  const charged = v.months.filter((m) => m.amount !== null);
  const settled = charged.filter((m) => m.settled);
  const provisional = charged.filter((m) => !m.settled);
  if (provisional.length > 0) {
    if (settled.length > 0) lines.push(`Vastgelegd tot en met ${monthLabelNl(settled[settled.length - 1].month)}: ${formatEuro(v.settledAmount ?? "0.00")}`);
    else lines.push("Vastgelegd: nog geen afgesloten maand.");
    lines.push(`Voorlopig (${provisional.length === 1 ? "lopende maand" : "lopende en volgende maanden"}): ${formatEuro(v.provisionalAmount ?? "0.00")}`);
  }
  const years = new Map<string, { cents: number; provisional: boolean }>();
  for (const m of charged) {
    const year = m.month.slice(0, 4);
    const entry = years.get(year) ?? { cents: 0, provisional: false };
    entry.cents += centsOf(m.amount!);
    if (!m.settled) entry.provisional = true;
    years.set(year, entry);
  }
  if (years.size > 0) {
    lines.push("Per kalenderjaar:");
    for (const [year, entry] of [...years.entries()].sort()) {
      lines.push(`- ${year}: ${euroFromCents(entry.cents)}${entry.provisional ? " (voorlopig)" : ""}`);
    }
  }
  return lines;
}

function why(v: Verdict): string {
  switch (v.status) {
    case "APPLICABLE":
      return (
        "De auto valt onder de regel en is mede voor privédoeleinden ter beschikking gesteld. " +
        `Over ${v.monthsCharged} ${v.monthsCharged === 1 ? "kalendermaand" : "kalendermaanden"} is de heffing van toepassing.`
      );
    case "POSSIBLY_APPLICABLE":
      return (
        "De beschikbare voertuig- en gebruiksgegevens voldoen aan de basisvoorwaarden, maar aanvullende informatie is nodig " +
        "om de uitkomst definitief te beoordelen. Het berekende bedrag is een indicatie."
      );
    case "NOT_APPLICABLE": {
      const reason = v.facts.notApplicableReason;
      let text = reason ? NOT_APPLICABLE_NL[reason] : "De regel is niet van toepassing.";
      if (reason === "fully_exempt") {
        const kinds = [...new Set(v.months.map((m) => m.reason))].filter((r) => r !== "charged").map((r) => MONTH_REASON_NL[r]);
        if (kinds.length) text += ` Toegepast: ${kinds.join("; ")}.`;
      }
      return text;
    }
    case "MANUAL_REVIEW_REQUIRED":
      return (
        "De gegevens spreken elkaar tegen of vragen een keuze die de applicatie niet zelf mag maken. " +
        (v.amount ? "Het berekende bedrag is een indicatie tot de beoordeling is afgerond." : "Er is geen bedrag vastgesteld.")
      );
    case "DATA_INSUFFICIENT":
      return "Er ontbreken gegevens zonder welke de regel niet kan worden toegepast. Er is geen bedrag berekend.";
    case "CONFIGURATION_INVALID":
      return "De fiscale configuratie is ongeldig; een beheerder moet de regelversie en de parameters controleren.";
    case "RULE_NOT_AVAILABLE":
      return "Op de beoordelingsdatum geldt geen gepubliceerde regelversie. Er is niets berekend.";
  }
}

export function explainVerdict(v: Verdict, version: ExplainedVersion | null): string {
  const lines: string[] = [];
  lines.push("Fiscale beoordeling — Pseudo-eindheffing fossiele personenauto's", "");
  lines.push(`Status: ${FISCAL_STATUS_LABELS[v.status]}`, "");
  lines.push("Waarom:", why(v), "");

  lines.push("Gebruikte regelversie:");
  if (version) {
    const validity = version.effectiveFrom
      ? ` (versie ${version.versionNumber}, geldig vanaf ${dateLabelNl(version.effectiveFrom)}${version.effectiveUntil ? ` tot en met ${dateLabelNl(version.effectiveUntil)}` : ""})`
      : ` (versie ${version.versionNumber})`;
    lines.push(`${version.title}${validity}`);
  } else {
    lines.push("Geen gepubliceerde regelversie geldt op de beoordelingsdatum.");
  }
  lines.push("");

  const p = v.parametersUsed;
  const rate = param(p, "PSEUDO_ENDHEFFING_RATE");
  if (rate && typeof rate.value === "number") lines.push(`Heffingspercentage: ${decimalNl(rate.value)} % per jaar`);
  const repl = param(p, "REPLACEMENT_VEHICLE_EXEMPTION_DAYS");
  if (repl && typeof repl.value === "number") lines.push(`Vrijstellingsdagen vervangend voertuig: ${repl.value} kalenderdagen`);
  const short = param(p, "TEMPORARY_RENTAL_EXEMPTION_DAYS");
  if (short && typeof short.value === "number") lines.push(`Vrijstellingsdagen kortstondige terbeschikkingstelling: ${short.value} kalenderdagen`);
  const transition = param(p, "TRANSITION_EXEMPT_UNTIL");
  if (transition && typeof transition.value === "string") lines.push(`Overgangsrecht tot en met: ${dateLabelNl(transition.value)}`);
  if (v.facts.baseKind && v.facts.baseValue) {
    const kind = v.facts.baseKind === "catalog_value" ? "catalogusprijs" : "waarde in het economische verkeer";
    lines.push(`Grondslag: ${kind} ${formatEuro(v.facts.baseValue)}`);
  }
  if (lines[lines.length - 1] !== "") lines.push("");

  if (v.months.length) {
    lines.push("Beoordelingsperiode:", ...v.months.map(monthLine));
    if (v.facts.final) {
      lines.push(`Eindberekening: de auto is ingeleverd; de periode is afgesloten en beoordeeld tot en met ${dateLabelNl(v.facts.assessedThrough)}. Alle maanden zijn vastgelegd.`);
    } else if (v.facts.openEnded) {
      lines.push(`(De einddatum is nog niet bekend; beoordeeld tot en met ${dateLabelNl(v.facts.assessedThrough)}. De lopende maand is voorlopig; bij het inleveren volgt de eindberekening.)`);
    }
    lines.push(...amountLines(v));
    if (v.amount) {
      const indicative = v.status === "POSSIBLY_APPLICABLE" || v.status === "MANUAL_REVIEW_REQUIRED" ? " (indicatie)" : "";
      lines.push(`Totaal: ${formatEuro(v.amount)}${indicative}`);
    }
    lines.push("");
  }

  if (v.missingData.length) {
    lines.push("Ontbrekende informatie:", ...v.missingData.map((c) => `- ${MISSING_DATA_LABELS[c]}`), "");
  }
  if (v.reviewReasons.length) {
    lines.push("Handmatige beoordeling omdat:", ...v.reviewReasons.map((c) => `- ${REVIEW_REASON_LABELS[c]}`), "");
  }

  lines.push(FISCAL_DISCLAIMER);
  return lines.join("\n");
}
