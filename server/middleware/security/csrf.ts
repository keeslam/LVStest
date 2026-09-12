import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { useSecureCookies } from '../../utils/secure-cookies.js';

/**
 * BUG-096, second half — an anonymous visitor used to be handed a session.
 *
 * `generateCsrfToken` wrote `req.session.csrfSecret` on **every** request, so
 * despite `saveUninitialized: false` the session was modified and a row was
 * written for every visitor: phase 19 measured 50 requests without a cookie
 * producing 50 new `session` rows, 24 of which were answered with a 401 to
 * begin with. Only the interval sweep of connect-pg-simple ever cleaned them
 * up, and the table stood at 59 % dead tuples.
 *
 * A CSRF secret only means something once there is a privileged session to
 * forge a request against. So an anonymous visitor gets a token signed with a
 * process-wide key instead, and `req.session` is not touched at all — no row.
 * The moment the visitor logs in, `attachCsrfToken` mints a real per-session
 * secret and the anonymous key is no longer accepted for that request, so a
 * token any third party could fetch can never authorise an authenticated
 * mutation.
 *
 * Keyed off SESSION_SECRET when it is configured, so every instance behind a
 * load balancer accepts the same anonymous token; otherwise per process,
 * which is exactly as stable as the session secret itself in that case.
 */
const ANONYMOUS_CSRF_KEY = crypto
  .createHash('sha256')
  .update('csrf:anonymous:' + (process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString('hex')))
  .digest('hex');

function isAuthenticatedRequest(req: Request): boolean {
  const maybe = req as Request & { isAuthenticated?: () => boolean; user?: unknown };
  if (typeof maybe.isAuthenticated === 'function') return maybe.isAuthenticated();
  return !!maybe.user;
}

declare module 'express-session' {
  interface SessionData {
    csrfSecret?: string;
  }
}

/**
 * Generate CSRF token
 */
export function generateCsrfToken(req: Request & { session: any }): string {
  // Generate or retrieve secret. BUG-096: only a request that already has a
  // session, or one that is authenticated and therefore about to need one,
  // may create it — writing it for an anonymous visitor is what produced a
  // `session` row per bot.
  let secret: string | undefined = req.session?.csrfSecret;
  if (!secret) {
    if (req.session && isAuthenticatedRequest(req)) {
      secret = crypto.randomBytes(32).toString('hex');
      req.session.csrfSecret = secret;
    } else {
      secret = ANONYMOUS_CSRF_KEY;
    }
  }

  // Generate token by hashing secret with timestamp
  const timestamp = Date.now().toString();
  const hash = crypto
    .createHmac('sha256', secret)
    .update(timestamp)
    .digest('hex');

  // Token is timestamp + hash
  return `${timestamp}.${hash}`;
}

/**
 * Verify CSRF token
 */
function verifyCsrfToken(token: string, secret: string): boolean {
  try {
    const [timestamp, hash] = token.split('.');
    
    if (!timestamp || !hash) {
      return false;
    }

    // Check if token is not too old (24 hours)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return false;
    }

    // Verify hash
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(timestamp)
      .digest('hex');

    // BUG-096: `hash === expectedHash` compares byte by byte and returns on the
    // first difference, so how long it takes leaks how much of a guess was
    // right. Both sides are fixed-length hex here, but the comparison is the
    // thing an attacker measures, so it is constant-time.
    const suppliedBuf = Buffer.from(hash, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (suppliedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(suppliedBuf, expectedBuf);
  } catch (error) {
    return false;
  }
}


export interface CsrfOptions {
  cookieName: string;
  sameSite: 'strict' | 'lax';
  /** Paths (exact match on req.path) that carry no session yet and are exempt. */
  exemptPaths: string[];
}

/**
 * Builds a CSRF pair (attach + protect) for one cookie name. The staff app and
 * the customer portal each get their own instance, because they run on
 * different session cookies with different SameSite rules.
 */
export function createCsrfMiddleware(options: CsrfOptions) {
  const exempt = new Set(options.exemptPaths);

  function csrfProtection(req: Request & { session: any }, res: Response, next: NextFunction): void {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    // Login has no pre-existing session to forge a request against - the standard
    // exemption. Every other mutating route runs on an authenticated session and
    // is in scope, including /api/register (which itself requires an admin session).
    // baseUrl + path: when mounted under app.use('/api/portal', …) req.path is
    // relative, and the exemptions are written as full paths.
    if (exempt.has((req.baseUrl || '') + req.path)) return next();

    const token = req.get('X-CSRF-Token') || req.body?._csrf;
    if (!token) {
      res.status(403).json({ message: 'CSRF token missing', code: 'CSRF_MISSING' });
      return;
    }
    // BUG-096: an anonymous caller has no per-session secret any more, so it
    // is checked against the process-wide anonymous key — which lets the
    // request through CSRF and straight into the 401 it deserves, without a
    // `session` row ever being written. An *authenticated* request never
    // falls back: it must present a token bound to its own session secret.
    const secret = req.session?.csrfSecret
      ?? (isAuthenticatedRequest(req) ? undefined : ANONYMOUS_CSRF_KEY);
    if (!secret || !verifyCsrfToken(token, secret)) {
      res.status(403).json({ message: 'Invalid CSRF token', code: 'CSRF_INVALID' });
      return;
    }
    next();
  }

  function attachCsrfToken(req: Request & { session: any }, res: Response, next: NextFunction): void {
    const token = generateCsrfToken(req);
    res.locals.csrfToken = token;
    // res.cookie only takes a boolean, so resolve 'auto' against this request.
    // req.secure accounts for X-Forwarded-Proto because the app sets trust proxy.
    const secureSetting = useSecureCookies();
    const secure = secureSetting === 'auto' ? req.secure : secureSetting;
    res.cookie(options.cookieName, token, {
      httpOnly: false, // Allow JavaScript to read it
      secure,
      sameSite: options.sameSite,
    });
    next();
  }

  return { csrfProtection, attachCsrfToken };
}

// Staff defaults: unchanged behaviour for every existing caller.
const staffCsrf = createCsrfMiddleware({ cookieName: 'XSRF-TOKEN', sameSite: 'strict', exemptPaths: ['/api/login'] });
export const csrfProtection = staffCsrf.csrfProtection;
export const attachCsrfToken = staffCsrf.attachCsrfToken;
