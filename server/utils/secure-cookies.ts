/**
 * Whether cookies should be sent with the Secure flag.
 *
 * Default is 'auto': express-session marks the cookie Secure only when the
 * request actually arrived over HTTPS. Combined with `trust proxy`, that covers
 * both cases without configuration — TLS terminated at a proxy sets
 * X-Forwarded-Proto and the cookie is Secure, while a box reached over plain
 * http:// gets a normal cookie instead of one the browser silently discards.
 *
 * Hardcoding secure=true in production was the cause of a confusing failure:
 * POST /api/login returned 200 while every request after it returned 401,
 * because no cookie was ever issued.
 *
 * SECURE_COOKIES still forces the decision either way when you want to be
 * explicit — set it to true to require HTTPS-only cookies.
 */
export function useSecureCookies(): boolean | 'auto' {
  const setting = process.env.SECURE_COOKIES?.toLowerCase();

  if (setting === 'false' || setting === '0' || setting === 'disable') {
    console.log('🍪 Secure cookie flag disabled via SECURE_COOKIES');
    return false;
  }

  if (setting === 'true' || setting === '1' || setting === 'enable') {
    return true;
  }

  return 'auto';
}
