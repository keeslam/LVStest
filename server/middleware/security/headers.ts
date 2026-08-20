import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

/**
 * Configure Helmet security headers
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for Vite in development
        "'unsafe-eval'", // Required for Vite in development
        "https://cdn.jsdelivr.net", // For external libraries
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for styled components and Tailwind
        "https://fonts.googleapis.com",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:", // Allow images from any HTTPS source
      ],
      connectSrc: [
        "'self'",
        "ws:", // WebSocket for Vite HMR
        "wss:", // Secure WebSocket for Socket.IO
      ],
      frameSrc: [
        "'self'", // In-app document/report preview (Documents page, Delivery dashboard)
        "https://www.google.com", // Route preview embed on the Delivery dashboard
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
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
