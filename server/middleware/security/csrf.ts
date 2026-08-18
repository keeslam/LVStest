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

/**
 * Middleware to verify CSRF token on state-changing requests
 */
export function csrfProtection(req: Request & { session: any }, res: Response, next: NextFunction): void {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Login has no pre-existing session to forge a request against — the standard
  // exemption. Every other mutating route runs on an authenticated session and
  // is in scope, including /api/register (which itself requires an admin session).
  if (req.path === '/api/login') {
    return next();
  }

  // Get token from header or body
  const token = req.get('X-CSRF-Token') || req.body._csrf;

  if (!token) {
    res.status(403).json({
      message: 'CSRF token missing',
    });
    return;
  }

  // Verify token
  const secret = req.session.csrfSecret;
  if (!secret || !verifyCsrfToken(token, secret)) {
    res.status(403).json({
      message: 'Invalid CSRF token',
    });
    return;
  }

  next();
}

/**
 * Middleware to attach CSRF token to response
 */
export function attachCsrfToken(req: Request & { session: any }, res: Response, next: NextFunction): void {
  // Generate token
  const token = generateCsrfToken(req);
  
  // Attach to response locals for templates
  res.locals.csrfToken = token;
  
  // res.cookie only takes a boolean, so resolve 'auto' against this request.
  // req.secure accounts for X-Forwarded-Proto because the app sets trust proxy.
  const secureSetting = useSecureCookies();
  const secure = secureSetting === 'auto' ? req.secure : secureSetting;

  // Set cookie for client-side access
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false, // Allow JavaScript to read it
    secure,
    sameSite: 'strict',
  });

  next();
}
