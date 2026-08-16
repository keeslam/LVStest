/**
 * Whether cookies should be sent with the Secure flag.
 *
 * Defaults to enabled in production, but SECURE_COOKIES is an explicit override
 * so a deployment reachable over plain HTTP (a LAN test box, a staging VM with
 * no TLS yet) can turn it off.
 *
 * Without that escape hatch the failure is silent and confusing: the browser
 * refuses to store a Secure cookie over HTTP, so POST /api/login returns 200
 * and the UI reports a successful login, while every request after it arrives
 * with no session and comes back 401.
 *
 * Mirrors the DATABASE_SSL handling in server/db.ts.
 */
export function useSecureCookies(): boolean {
  const setting = process.env.SECURE_COOKIES?.toLowerCase();

  if (setting === 'false' || setting === '0' || setting === 'disable') {
    console.log('🍪 Secure cookie flag disabled via SECURE_COOKIES');
    return false;
  }

  if (setting === 'true' || setting === '1' || setting === 'enable') {
    return true;
  }

  return process.env.NODE_ENV === 'production';
}
