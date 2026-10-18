/**
 * BUG-079 — redaction for anything that is written to the container log.
 *
 * The request logger used to write every /api response body to the log
 * verbatim, which put the SMTP password, portal tokens and the backup path in
 * Coolify's log permanently. Response-body logging is off by default now; this
 * is the second line of defence for when someone turns it on to debug.
 */
const REDACTED_KEYS = new Set([
  'password', 'smtppassword', 'cjibpassword', 'token', 'csrftoken', 'secret',
  'apikey', 'passwordhash', 'mileageoverridepasswordhash', 'authorization',
  'databaseurl', 'sessionsecret',
]);

export function redactForLog(value: any, depth = 0): any {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactForLog(v, depth + 1));
  const out: Record<string, any> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redactForLog(v, depth + 1);
  }
  return out;
}

/**
 * Security review 2026-10-18 (Laag 10): the request log keeps the query string (which filter, which
 * page) but not what people typed. A search for a customer's name, e-mail address or phone number
 * used to end up in the server log verbatim. Numbers, dates, true/false and short plain words
 * (status=booked, sort=desc) stay; every other value becomes "***".
 */
export function redactQueryForLog(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const path = url.slice(0, q);
  const params = new URLSearchParams(url.slice(q + 1));
  const kept: string[] = [];
  for (const [key, value] of params) {
    const plain = /^-?\d+(\.\d+)?$/.test(value)
      || /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/.test(value)
      || /^(true|false)$/i.test(value)
      || (/^[a-z_]{1,20}$/.test(value) && !/(search|query|^q$|name|email|mail|phone|tel|plate|kenteken|zoek)/i.test(key));
    kept.push(`${encodeURIComponent(key)}=${plain ? encodeURIComponent(value) : "***"}`);
  }
  return kept.length ? `${path}?${kept.join("&")}` : path;
}
