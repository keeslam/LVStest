import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { useSecureCookies } from '../../utils/secure-cookies.js';

declare module 'express-session' {
  interface SessionData {
    csrfSecret?: string;
  }
}

/**
 * Generate CSRF token
 */
export function generateCsrfToken(req: Request & { session: any }): string {
  // Generate or retrieve secret
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = crypto.randomBytes(32).toString('hex');
  }

  // Generate token by hashing secret with timestamp
  const timestamp = Date.now().toString();
  const hash = crypto
    .createHmac('sha256', req.session.csrfSecret)
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

    return hash === expectedHash;
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
    if (exempt.has(req.path)) return next();

    const token = req.get('X-CSRF-Token') || req.body?._csrf;
    if (!token) {
      res.status(403).json({ message: 'CSRF token missing', code: 'CSRF_MISSING' });
      return;
    }
    const secret = req.session?.csrfSecret;
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
