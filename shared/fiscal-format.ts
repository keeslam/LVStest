/**
 * Dutch formatting shared by the server's explanation and the client's
 * screens: money with an ordinary space, dates and months in words, and the
 * labels for parameter units and choice values.
 */

export const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

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

export function decimalNl(n: number): string {
  return String(n).replace(".", ",");
}

export const UNIT_LABELS: Record<string, string> = {
  percent_per_year: "% per jaar",
  calendar_days: "kalenderdagen",
  years: "jaar",
  count: "keer",
  date: "",
  boolean: "",
  choice: "",
  list: "",
  text: "",
};

export const CHOICE_LABELS: Record<string, string> = {
  calendar_month: "per kalendermaand",
  calendar_day: "per kalenderdag",
  full_period: "één dag telt als het hele tijdvak",
  pro_rata: "naar rato van de dagen",
  catalog_price_incl_vat_bpm: "catalogusprijs inclusief btw en bpm",
  market_value: "waarde in het economische verkeer",
  start_of_month: "begin van de kalendermaand",
  start_of_year: "begin van het kalenderjaar",
  start_of_period: "begin van de periode",
  fuel_electric_or_hydrogen_only: "uitsluitend elektrisch of waterstof als brandstof",
  co2_zero: "CO₂-uitstoot nul volgens het kentekenregister",
  plate_per_employer: "per kenteken, per werkgever",
  employer: "per werkgever",
  employee: "per werknemer",
  half_up_cents: "afronden op centen, halve cent omhoog",
  EUR: "euro",
  maintenance: "onderhoud",
  repair: "reparatie",
  accident: "schade of ongeval",
  breakdown: "pech",
  tyre_change: "bandenwissel",
  other: "anders",
};

export const CATEGORY_LABELS: Record<string, string> = {
  general: "Algemeen",
  vehicle: "Voertuig",
  usage: "Gebruik",
  transition: "Overgangsrecht",
  replacement: "Vervangend voertuig",
  rental: "Kortstondige terbeschikkingstelling",
  internal: "Intern",
};

/** Human form of a parameter value, given its data type and unit. */
export function formatParameterValue(dataType: string, unit: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (dataType) {
    case "boolean":
      return value === true || value === "true" ? "Ja" : "Nee";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateLabelNl(value) : String(value);
    case "list":
      return Array.isArray(value) ? value.map((v) => CHOICE_LABELS[String(v)] ?? String(v)).join(", ") : String(value);
    case "choice":
      return CHOICE_LABELS[String(value)] ?? String(value);
    case "decimal":
    case "integer": {
      const n = typeof value === "number" ? value : Number(value);
      const text = Number.isFinite(n) ? decimalNl(n) : String(value);
      const suffix = UNIT_LABELS[unit] ?? "";
      return suffix ? `${text} ${suffix}` : text;
    }
    default:
      return String(value);
  }
}
