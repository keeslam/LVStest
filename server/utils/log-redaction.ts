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
