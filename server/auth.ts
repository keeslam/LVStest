import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User, UserRole, insertUserSchema } from "../shared/schema";
import { pool } from "./db";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";

// Security imports
import { AuditLogger } from "./utils/security/auditLogger.js";
import { checkAccountLockout, recordLoginAttempt, clearFailedAttempts, loginLimiter } from "./middleware/security/rateLimiter.js";
import { trackSession } from "./utils/security/sessionManager.js";
import { csrfProtection } from "./middleware/security/csrf.js";
import { useSecureCookies } from "./utils/secure-cookies.js";

// Extend Express.User interface with our User type properties
declare global {
  namespace Express {
    // Use 'interface' to extend the Express User type
    interface User extends Omit<import('../shared/schema').User, 'password'> {}
  }
}



const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  // Always hash passwords properly - no development exceptions
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  // Always use proper password comparison - no development exceptions
  try {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
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
function resolveSessionSecret(): string {
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

export function setupAuth(app: Express) {
  // Determine storage type based on storage implementation
  const useDatabase = storage.constructor.name === 'DatabaseStorage';
  
  const sessionSettings: session.SessionOptions = {
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset session maxAge on every request
    store: createSessionStore(useDatabase),
    cookie: {
      maxAge: 15 * 60 * 1000, // 15 minutes inactivity timeout
      secure: useSecureCookies(), // On in production; set SECURE_COOKIES=false for an HTTP-only deployment
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
  if (cookieCfg.secure) {
    console.log('   Serving over plain HTTP? Set SECURE_COOKIES=false or the browser will discard the session cookie.');
  }

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

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

    // Check for account lockout before attempting login
    if (username) {
      const lockStatus = await checkAccountLockout(username, ipAddress);
      if (lockStatus.locked) {
        const minutes = Math.ceil((lockStatus.remainingTime || 0) / 60);
        
        // Log failed login attempt (only if username exists)
        if (username) {
          await recordLoginAttempt(username, ipAddress, userAgent, false, 'account_locked');
          await AuditLogger.log({
            username,
            action: 'user.login.failed',
            details: { reason: 'account_locked', attemptsCount: lockStatus.attemptsCount },
            ipAddress,
            userAgent,
            status: 'failure',
          });
        }

        return res.status(429).json({
          message: `Account temporarily locked due to too many failed login attempts. Please try again in ${minutes} minute(s).`,
          remainingTime: lockStatus.remainingTime,
        });
      }
    }

    passport.authenticate("local", async (err: any, user: User | false, info: { message?: string }) => {
      if (err) return next(err);
      
      if (!user) {
        // Record failed login attempt (only if username exists)
        if (username) {
          await recordLoginAttempt(username, ipAddress, userAgent, false, 'invalid_credentials');
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
        await recordLoginAttempt(username, ipAddress, userAgent, false, 'account_disabled');
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
          
          // Record successful login attempt
          await recordLoginAttempt(username, ipAddress, userAgent, true);
          
          // Clear failed login attempts
          await clearFailedAttempts(username);
          
          // Track active session
          const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
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

  app.post("/api/logout", csrfProtection, async (req: Request, res: Response, next: NextFunction) => {
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
    
    req.logout((err: any) => {
      if (err) return next(err);
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
  return { requireAuth };
}