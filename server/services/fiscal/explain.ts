/**
 * The Dutch explanation of a verdict, in the shape the brief prescribes:
 * status, why, rule version, the parameters that mattered, the months, what
 * is missing, and the disclaimer. It never says more than the status allows.
 */
import {
  FISCAL_DISCLAIMER,
  FISCAL_STATUS_LABELS,
  MISSING_DATA_LABELS,
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

const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

const MONTH_REASON_NL: Record<MonthReason, string> = {
  charged: "geheven",
  replacement_exempt: "vrijgesteld (vervangend voertuig)",
  short_term_exempt: "vrijgesteld (kortstondige terbeschikkingstelling)",
  transition_exempt: "vrijgesteld (overgangsrecht)",
  before_rule: "vóór de ingangsdatum van de regel",
  after_rule: "buiten de geldigheid van deze regelversie",
};

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

/** `€ 36.000,00` with an ordinary space, from a numeric string such as `36000.00`. */
export function formatEuro(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  const cents = Math.round(Math.abs(n) * 100);
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  const grouped = euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}€ ${grouped},${rest < 10 ? "0" : ""}${rest}`;
}

/** `maart 2027` from `2027-03`. */
export function monthLabelNl(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS_NL[Number(m) - 1]} ${y}`;
}

/** `17 september 2030` from `2030-09-17`. */
export function dateLabelNl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS_NL[Number(m) - 1]} ${y}`;
}

function param(entries: ParameterSnapshotEntry[], key: string): ParameterSnapshotEntry | undefined {
  return entries.find((e) => e.key === key);
}

function decimalNl(n: number): string {
  return String(n).replace(".", ",");
}

function monthLine(m: MonthLine): string {
  const amount = m.amount ? `, ${formatEuro(m.amount)}` : "";
  return `- ${monthLabelNl(m.month)}: ${m.days} ${m.days === 1 ? "dag" : "dagen"}, ${MONTH_REASON_NL[m.reason]}${amount}`;
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
    if (v.facts.openEnded) lines.push("(De einddatum is nog niet bekend; beoordeeld tot de beoordelingshorizon.)");
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
