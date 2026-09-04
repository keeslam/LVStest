/**
 * Company details shown in the portal's own header and footer when it runs as
 * a standalone site (portaal.lamgroep.nl). Mirrors lamgroep_info() in the
 * WordPress theme; keep the two in step.
 */
export const PORTAL_SITE = {
  organization: "Lam Groep",
  leaseBrand: "AutoLease",
  siteUrl: "https://lamgroep.nl",
  contactUrl: "https://lamgroep.nl/nl/contact/",
  privacyUrl: "https://lamgroep.nl/nl/privacy/",
  street: "Kerkweg 47a",
  postalCode: "3214 VC",
  city: "Zuidland",
  phoneDisplay: "0181 - 45 10 40",
  phoneE164: "+31181451040",
  email: "info@lamgroep.nl",
} as const;

/** Theme colours (src/css/app.css in the WordPress theme). */
export const PORTAL_COLORS = {
  brand800: "#1a1d62",
  brand950: "#0b0d28",
  accent500: "#f5a623",
  ink50: "#f8fafc",
} as const;

/** True when the portal is shown inside the website's iframe rather than as its own page. */
export function isEmbedded(): boolean {
  try { return window.parent !== window; } catch { return true; }
}
