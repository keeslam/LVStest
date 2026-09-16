import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { isPortalPath } from "./portal-paths";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { DatabaseStorage } from "./database-storage";
import { User, UserRole, insertUserSchema } from "../shared/schema";
import { pool } from "./db";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";

// Security imports
import { AuditLogger } from "./utils/security/auditLogger.js";
import { checkAccountLockout, recordLoginAttempt, clearFailedAttempts, loginLimiter, reserveLoginAttempt, settleLoginAttempt, trustProxyHops } from "./middleware/security/rateLimiter.js";
import { trackSession, revokeSession } from "./utils/security/sessionManager.js";
import { csrfProtection, attachCsrfToken } from "./middleware/security/csrf.js";
import { useSecureCookies } from "./utils/secure-cookies.js";

// Extend Express.User interface with our User type properties
declare global {
  namespace Express {
    // Use 'interface' to extend the Express User type
    interface User extends Omit<import('../shared/schema').User, 'password'> {}
  }
}



// promisify() types the 3-argument overload; scrypt also takes an options object.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options?: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * BUG-094 — scrypt ran on Node's defaults (N=16384), which is the value the
 * scrypt paper called adequate in 2009 and no cost parameter was recorded
 * anywhere, so raising it later would have invalidated every stored hash.
 *
 * Two changes: the parameters are explicit, and they are written into the hash
 * string, so the cost can be raised again by editing one constant - old hashes
 * keep verifying with the parameters they were made with, and
 * `needsRehash()` tells the login handler to upgrade them in place.
 *
 * N is 2^16 rather than the 2^17 the remediation plan suggested: 2^17 costs
 * ~285 ms per hash on this hardware against ~136 ms for 2^16, and every request
 * of the test suite that logs in pays it twice. The number lives in the hash
 * now, so raising it is a one-line change plus a login.
 */
export const SCRYPT_PARAMS = { N: 1 << 16, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
const SCRYPT_KEYLEN = 64;

/** `<hash>.<salt>.s<N>.<r>.<p>` for new hashes; `<hash>.<salt>` is the legacy form. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, SCRYPT_KEYLEN, { ...SCRYPT_PARAMS })) as Buffer;
  return `${buf.toString("hex")}.${salt}.s${SCRYPT_PARAMS.N}.${SCRYPT_PARAMS.r}.${SCRYPT_PARAMS.p}`;
}

/** The parameters a stored hash was made with - Node's defaults when unstated. */
function paramsOf(stored: string): { N: number; r: number; p: number; maxmem: number } {
  const parts = stored.split(".");
  const marker = parts[2];
  if (marker && marker.startsWith("s")) {
    const N = Number(marker.slice(1));
    const r = Number(parts[3]);
    const p = Number(parts[4]);
    if (Number.isFinite(N) && Number.isFinite(r) && Number.isFinite(p)) {
      return { N, r, p, maxmem: SCRYPT_PARAMS.maxmem };
    }
  }
  // Legacy hash: Node's own defaults, which is what produced it.
  return { N: 16384, r: 8, p: 1, maxmem: SCRYPT_PARAMS.maxmem };
}

/** True when this hash was made with weaker parameters than we use today. */
export function needsRehash(stored: string): boolean {
  const params = paramsOf(stored);
  return params.N < SCRYPT_PARAMS.N || params.r !== SCRYPT_PARAMS.r || params.p !== SCRYPT_PARAMS.p;
}

export async function comparePasswords(supplied: string, stored: string) {
  // Always use proper password comparison - no development exceptions
  try {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, hashedBuf.length, paramsOf(stored))) as Buffer;
    if (hashedBuf.length !== suppliedBuf.length) return false;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error("Error comparing passwords");
    return false;
  }
}

// Generate a strong random session secret
function generateSessionSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * The signing secret for session cookies.
 *
 * Falling back to a random value is fine for a throwaway dev run, but in a
 * deployment it means the secret changes on every container start, and differs
 * between replicas. Cookies signed with one secret are rejected by the other,
 * which looks exactly like a broken login: the request succeeds, and every
 * request after it comes back 401. Say so loudly rather than limping on.
 */
export function resolveSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  const message =
    'SESSION_SECRET is not set — falling back to a random secret. ' +
    'Sessions will be dropped on every restart, and will fail immediately if more ' +
    'than one instance is running. Set SESSION_SECRET in the deployment environment.';

  if (process.env.NODE_ENV === 'production') {
    console.error(`❌ ${message}`);
  } else {
    console.warn(`⚠️ ${message}`);
  }

  return generateSessionSecret();
}

// Create session store based on whether we're using a database or memory storage
function createSessionStore(useDatabase: boolean) {
  if (useDatabase) {
    const PostgresSessionStore = connectPg(session);
    return new PostgresSessionStore({ 
      pool,
      createTableIfMissing: true 
    });
  } else {
    const MemoryStore = createMemoryStore(session);
    return new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }
}

/**
 * Whether sessions can live in Postgres, decided on what the storage *is*.
 *
 * This used to be `storage.constructor.name === 'DatabaseStorage'`. A bundler is
 * free to rename a class, and esbuild does exactly that as soon as the class
 * refers to itself by name (it emits `class _DatabaseStorage`). The production
 * build then failed the check and quietly kept every staff session in process
 * memory, so each deploy or restart would log everyone out. `instanceof` does
 * not depend on the name.
 */
export function usesDatabaseStorage(candidate: unknown): boolean {
  return candidate instanceof DatabaseStorage;
}

export function setupAuth(app: Express) {
  // Determine storage type based on storage implementation
  const useDatabase = usesDatabaseStorage(storage);
  
  const sessionSettings: session.SessionOptions = {
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset session maxAge on every request
    store: createSessionStore(useDatabase),
    cookie: {
      maxAge: 15 * 60 * 1000, // 15 minutes inactivity timeout
      secure: useSecureCookies(), // 'auto' by default: Secure only when the request is HTTPS
      httpOnly: true, // Prevent XSS attacks
      sameSite: 'strict' // Strict CSRF protection - blocks all cross-site requests
    }
  };

  // Print what the session cookie will actually look like. A "Secure" cookie
  // over plain HTTP is silently dropped by the browser, which presents as a
  // successful login followed by 401 on everything.
  const cookieCfg = sessionSettings.cookie!;
  console.log(
    `🔐 Session cookie: secure=${cookieCfg.secure} sameSite=${cookieCfg.sameSite} ` +
    `store=${useDatabase ? 'postgres' : 'memory'} secret=${process.env.SESSION_SECRET ? 'from env' : 'RANDOM (not configured)'}`
  );
  if (cookieCfg.secure === true) {
    console.log('   secure=true forces HTTPS-only cookies. Over plain http:// the browser discards them and every request after login returns 401.');
  } else if (cookieCfg.secure === 'auto') {
    console.log('   auto: the cookie is marked Secure only for HTTPS requests (X-Forwarded-Proto is honoured behind a proxy).');
  }

  // BUG-009: how many proxies really sit in front of this process is
  // configuration, not a hardcoded 1. Behind Coolify (production) that is one
  // hop; a process you can reach directly must trust no forwarding header at
  // all, or `X-Forwarded-For` decides both `req.ip` and the login rate-limit
  // bucket. Set TRUST_PROXY_HOPS to the number of proxies that really append
  // to the chain.
  const hops = trustProxyHops();
  app.set("trust proxy", hops);
  console.log(
    `🌐 trust proxy: ${hops} hop(s)` +
    (hops === 0
      ? " — X-Forwarded-For is ignored. Set TRUST_PROXY_HOPS if a reverse proxy sits in front of this process."
      : " — the last entry of X-Forwarded-For is treated as written by that proxy."),
  );
  // express-session refuses to run when req.session already exists, so the
  // customer portal (its own cookie, its own Passport instance, see
  // portal-auth.ts) can only mount its stack if the staff stack skips portal
  // paths entirely.
  const unlessPortal = (mw: RequestHandler): RequestHandler => (req, res, next) =>
    isPortalPath(req.path) ? next() : mw(req, res, next);

  // Kept as a named value so the Socket.IO handshake can run the very same
  // middleware to validate a connection (BUG-005).
  const sessionMiddleware = session(sessionSettings);
  app.use(unlessPortal(sessionMiddleware));
  app.use(unlessPortal(passport.initialize()));
  app.use(unlessPortal(passport.session()));

  // CSRF protection must be wired here, before any route (including the ones
  // registered below in this same function — /api/login, /api/register,
  // /api/logout, /api/user) so every response gets the token cookie and every
  // mutating request is checked. Registering it later in index.ts, after
  // setupAuth() returns, would skip all of these routes entirely, since
  // Express only runs middleware registered before the route that matches.
  app.use(unlessPortal(attachCsrfToken));
  app.use(unlessPortal(csrfProtection));

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Incorrect username" });
        }
        
        const passwordMatches = await comparePasswords(password, user.password);
        
        if (!passwordMatches) {
          return done(null, false, { message: "Incorrect password" });
        }
        
        return done(null, user);
      } catch (error) {
        console.error("Authentication error:", error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        if (process.env.NODE_ENV === "development") {
          console.error(`Failed to deserialize user with ID ${id} - user not found`);
        }
        return done(null, false);
      }
      
      // Remove excessive logging - only log in debug mode
      if (process.env.DEBUG === "auth" && process.env.NODE_ENV === "development") {
        console.log(`Deserialized user: ${user.username} (${user.role})`);
      }
      
      done(null, user);
    } catch (error) {
      console.error(`Error deserializing user with ID ${id}`);
      done(error);
    }
  });

  // Authentication middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Admin authentication middleware
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    if (req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ message: "Not authorized. Admin access required." });
    }
    
    next();
  };

  // Register authentication routes (admin only)
  app.post("/api/register", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body using Zod schema
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Add audit trail (user is guaranteed to exist due to requireAdmin middleware)
      const currentUser = req.user!;
      const enrichedUserData = {
        ...userData,
        createdBy: currentUser.username,
        updatedBy: currentUser.username
      };

      // Hash password and create user
      const hashedPassword = await hashPassword(userData.password);
      const user = await storage.createUser({
        ...enrichedUserData,
        password: hashedPassword,
      });

      // Return user without password (don't auto-login to preserve admin session)
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid input data", 
          error: error.message 
        });
      }
      next(error);
    }
  });

  app.post("/api/login", loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
    const { username } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // BUG-161: the attempt is recorded and counted in one transaction BEFORE
    // the password is compared, so a burst of parallel guesses is refused after
    // the threshold instead of all running a full scrypt comparison first.
    let attemptId: number | null = null;
    if (username) {
      const gate = await reserveLoginAttempt(username, ipAddress, userAgent);
      attemptId = gate.attemptId;
      if (gate.locked) {
        await settleLoginAttempt(attemptId, { success: false, failureReason: 'account_locked' });
        const minutes = Math.ceil((gate.remainingTime || 0) / 60);
        await AuditLogger.log({
          username,
          action: 'user.login.failed',
          details: { reason: 'account_locked', attemptsCount: gate.attemptsCount },
          ipAddress,
          userAgent,
          status: 'failure',
        });

        return res.status(429).json({
          message: `Account temporarily locked due to too many failed login attempts. Please try again in ${minutes} minute(s).`,
          remainingTime: gate.remainingTime,
        });
      }
    }

    passport.authenticate("local", async (err: any, user: User | false, info: { message?: string }) => {
      if (err) return next(err);
      
      if (!user) {
        // The provisional row from reserveLoginAttempt() becomes the real one.
        if (username) {
          await settleLoginAttempt(attemptId, { success: false, failureReason: 'invalid_credentials' });
          await AuditLogger.log({
            username,
            action: 'user.login.failed',
            details: { reason: info?.message || 'invalid_credentials' },
            ipAddress,
            userAgent,
            status: 'failure',
          });
        }
        
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }

      // Check if user account is active
      if (!user.active) {
        await settleLoginAttempt(attemptId, { success: false, failureReason: 'account_disabled' });
        await AuditLogger.log({
          userId: user.id,
          username: user.username,
          action: 'user.login.failed',
          details: { reason: 'account_disabled' },
          ipAddress,
          userAgent,
          status: 'failure',
        });
        
        return res.status(403).json({ message: "Account has been disabled" });
      }
      
      // Regenerate session to prevent session fixation attacks
      const oldSession = req.session;
      req.session.regenerate((regenerateErr: any) => {
        if (regenerateErr) {
          console.error('Session regeneration failed:', regenerateErr);
          // Continue with login even if regeneration fails
        }
        
        // Copy old session data if needed (excluding sensitive data)
        if (oldSession) {
          Object.assign(req.session, {
            cookie: oldSession.cookie
          });
        }
        
        req.login(user, async (err: any) => {
          if (err) return next(err);

          // BUG-047: session.regenerate() above replaced the session and threw
          // away its csrfSecret, but attachCsrfToken already ran earlier in the
          // pipeline - so the XSRF-TOKEN the client got back from /api/login
          // was signed with a secret that no longer existed, and its very next
          // mutating request came back CSRF_INVALID. Mint the token again here,
          // against the NEW session, and overwrite the cookie.
          attachCsrfToken(req as any, res, () => {});

          // Record successful login attempt
          await settleLoginAttempt(attemptId, { success: true });

          // Clear failed login attempts
          await clearFailedAttempts(username);

          // BUG-094: upgrade a hash that was made with weaker parameters, now
          // that we have the plaintext in hand and know it is correct.
          try {
            const stored = await storage.getUser(user.id);
            if (stored?.password && needsRehash(stored.password) && typeof req.body?.password === 'string') {
              await storage.updateUserPassword(user.id, await hashPassword(req.body.password));
            }
          } catch (rehashError) {
            console.error('Password rehash after login failed:', rehashError);
          }

          // BUG-095: the tracked session used to claim a 30-day lifetime while
          // the cookie expires after 15 minutes of inactivity, so active_sessions
          // filled up with rows for sessions that had been gone for weeks.
          const cookieMaxAge = req.session.cookie.maxAge ?? 15 * 60 * 1000;
          const sessionExpiry = new Date(Date.now() + cookieMaxAge);
          await trackSession(req.sessionID, user.id, user.username, req, sessionExpiry);
          
          // Log successful login
          await AuditLogger.log({
            userId: user.id,
            username: user.username,
            action: 'user.login',
            details: { role: user.role },
            ipAddress,
            userAgent,
            status: 'success',
          });
          
          // Return user without password
          const { password, ...userWithoutPassword } = user;
          res.status(200).json(userWithoutPassword);
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as User | undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    
    // Log logout before destroying session
    if (user) {
      await AuditLogger.log({
        userId: user.id,
        username: user.username,
        action: 'user.logout',
        ipAddress,
        userAgent,
        status: 'success',
      });
    }
    
    // BUG-095: logging out destroyed the session but left its active_sessions
    // row behind, so the "where am I logged in" list kept showing sessions that
    // no longer existed - and revoking by that list did nothing.
    const sessionId = req.sessionID;
    req.logout(async (err: any) => {
      if (err) return next(err);
      try {
        await revokeSession(sessionId);
      } catch (revokeError) {
        console.error('Failed to remove the tracked session on logout:', revokeError);
      }
      res.status(200).json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Return user without password
    const { password, ...userWithoutPassword } = req.user as User;
    res.json(userWithoutPassword);
  });

  // Heartbeat endpoint to keep session alive during user activity
  app.post("/api/session/heartbeat", requireAuth, (req: Request, res: Response) => {
    // Session is automatically touched by express-session with rolling=true
    // This endpoint just needs to exist so client can make requests to refresh the session
    res.status(200).json({ message: "Session refreshed" });
  });

  // Re-authenticate endpoint (verify password without creating new session)
  app.post("/api/reauthenticate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      const user = req.user as User;
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      
      // Get the full user record with password
      const fullUser = await storage.getUserByUsername(user.username);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify password
      const passwordMatches = await comparePasswords(password, fullUser.password);
      
      if (!passwordMatches) {
        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
        const userAgent = req.get('user-agent') || 'unknown';
        
        await AuditLogger.log({
          userId: user.id,
          username: user.username,
          action: 'user.reauthenticate.failed',
          details: { reason: 'invalid_password' },
          ipAddress,
          userAgent,
          status: 'failure',
        });
        
        return res.status(401).json({ message: "Invalid password" });
      }
      
      // Password is correct
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';
      
      await AuditLogger.log({
        userId: user.id,
        username: user.username,
        action: 'user.reauthenticate',
        details: { reason: 'inactivity_prompt' },
        ipAddress,
        userAgent,
        status: 'success',
      });
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Re-authentication error:", error);
      res.status(500).json({ message: "Re-authentication failed" });
    }
  });

  // Return the auth middleware
  return { requireAuth, sessionMiddleware };
}