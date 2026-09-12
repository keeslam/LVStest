import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { isPortalPath } from '../../portal-paths';
import { getPortalConfig } from '../../services/portal-config';
import { isValidFrameOrigin } from '../../../shared/frame-origins';

/**
 * FIX-U (BUG-078). `unsafe-inline` and `unsafe-eval` in script-src are what
 * Vite's dev server needs; shipping them to production means the CSP stops
 * being a defence against injected script at all. The built bundle has no
 * inline script (client/index.html loads one module file), so production gets
 * a script-src without either token.
 *
 * style-src deliberately keeps 'unsafe-inline': the UI is built on Radix
 * primitives, which position every popover, select and tooltip through an
 * inline style attribute. Dropping it there does not harden anything an
 * attacker can reach (no script executes from a style) and it visibly breaks
 * the application, so removing it needs a nonce/hash pass over the component
 * library — recorded as a follow-up, not smuggled into a bug-fix wave.
 */
/**
 * The directive set, as a function of the environment, so the production shape
 * can be asserted from a test that is itself not running in production.
 */
export function buildCspDirectives(isProduction: boolean): Record<string, string[] | null> {
  return {
    defaultSrc: ["'self'"],
    // Dev keeps the two Vite tokens; production has neither. The
    // cdn.jsdelivr.net entry is gone — nothing in the client ever loaded from
    // it (zero references in client/ and in the built bundle).
    scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    // See the note above: Radix positions its overlays through inline style
    // attributes, so this token cannot be dropped without a nonce pass.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    // `https:` allowed an injected <img> to beacon to any host on the
    // internet. Everything the app renders is its own upload (same origin), a
    // data: URI (the damage-check diagrams) or a blob: preview.
    imgSrc: ["'self'", 'data:', 'blob:'],
    // `ws:` is Vite's HMR socket and has no business in a deployed build.
    connectSrc: isProduction ? ["'self'", 'wss:'] : ["'self'", 'ws:', 'wss:'],
    frameSrc: [
      "'self'", // In-app document/report preview (Documents page, Delivery dashboard)
      'https://www.google.com', // Route preview embed on the Delivery dashboard
    ],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: isProduction ? [] : null,
  };
}

/**
 * Configure Helmet security headers
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: buildCspDirectives(process.env.NODE_ENV === 'production') as any,
  },

  // X-Frame-Options: Prevent clickjacking from other sites, while still allowing
  // our own document/report preview iframes (same-origin) to embed our own pages.
  frameguard: {
    action: 'sameorigin',
  },

  // X-Content-Type-Options: Prevent MIME type sniffing
  noSniff: true,

  // Strict-Transport-Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false,
  },

  // X-Download-Options for IE8+
  ieNoOpen: true,

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
});

/**
 * Additional custom security headers
 */
export function customSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Remove X-Powered-By header (already done by helmet, but just in case)
  res.removeHeader('X-Powered-By');

  // Add custom headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN (not DENY) so the in-app document/report preview iframes
  // (Documents page, Delivery dashboard) can embed our own pages.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
}

/**
 * The customer portal is embedded in an <iframe> on the public website, so on
 * portal paths the frame-ancestors directive names the allowed parents and
 * X-Frame-Options (which cannot express "these origins") is dropped. Helmet's
 * CSP has already been written by the time this runs; only the
 * frame-ancestors part of it is replaced.
 */
export async function portalFrameHeaders(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isPortalPath(req.path)) return next();
  try {
    const config = await getPortalConfig();
    // FIX-U (BUG-087): the configured origins are interpolated straight into a
    // response header, so anything that is not a bare scheme://host[:port]
    // could add a directive of its own ("https://a.example/; script-src *" is
    // a valid URL and passed the old z.string().url() check). Save-time
    // validation refuses those now; this second pass means a row written by
    // another path — POST /api/app-settings with the portal_config key, a
    // restored backup — still cannot rewrite the CSP.
    const origins = config.allowedFrameOrigins.filter(isValidFrameOrigin).join(' ');
    const existing = String(res.getHeader('Content-Security-Policy') ?? '');
    const withoutFrame = existing
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && !d.startsWith('frame-ancestors'));
    res.setHeader(
      'Content-Security-Policy',
      [...withoutFrame, `frame-ancestors 'self'${origins ? ' ' + origins : ''}`].join('; '),
    );
    // Only drop X-Frame-Options when there is actually a cross-origin parent to
    // allow. With an empty (or entirely rejected) list the portal is
    // same-origin-only, and the older header stays as the second lock.
    if (origins) res.removeHeader('X-Frame-Options');
  } catch (error) {
    console.warn('⚠️ portalFrameHeaders: falling back to same-origin framing:', error);
  }
  next();
}
