import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import https from 'https';
import http from 'http';
import express, { Request, Response, NextFunction } from "express";
import { Server as SocketIOServer } from 'socket.io';
import { setSocketInstance } from "./realtime-events";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { BackupScheduler } from "./backupScheduler";
import { ApkScanScheduler } from "./apkScanScheduler";
import { ServiceDueScheduler } from "./serviceDueScheduler";
import { initializeDefaultAdmin, displayDeploymentInfo } from "./initAdmin";
import notificationRoutes from "./routes/notifications.js";
import vehiclesWithReservationsRoutes from "./routes/vehicles-with-reservations.js";
import filteredVehiclesRoutes from "./routes/filtered-vehicles.js";
import emailTemplatesRoutes from "./routes/email-templates.js";
import emailLogsRoutes from "./routes/email-logs.js";
import apkDateChangesRoutes from "./routes/apk-date-changes.js";
import { hasPermission } from "./middleware/permissions.js";
import { UserPermission } from "../shared/schema.js";

// Security middleware imports
import { securityHeaders, customSecurityHeaders } from "./middleware/security/headers.js";
import { sanitizeInput } from "./middleware/security/sanitization.js";
import { apiLimiter } from "./middleware/security/rateLimiter.js";
import { startSessionCleanupScheduler } from "./utils/security/sessionManager.js";

// Graceful shutdown implementation
let server: any = null;
let io: SocketIOServer | null = null;
let backupScheduler: any = null;
let apkScanScheduler: any = null;
let serviceDueScheduler: any = null;
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log(`🔄 Shutdown already in progress, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`🛑 ${signal} received, starting graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Forced shutdown - graceful shutdown timed out');
    process.exit(1);
  }, 10000); // 10 second timeout
  
  try {
    // Close WebSocket connections
    if (io) {
      console.log('🔄 Closing WebSocket connections...');
      io.close();
      console.log('✅ WebSocket connections closed');
    }
    
    // Stop accepting new requests
    if (server) {
      console.log('🔄 Stopping HTTP server...');
      await new Promise<void>((resolve) => {
        server.close((err: any) => {
          if (err) {
            console.error('❌ Error closing HTTP server:', err);
          } else {
            console.log('✅ HTTP server closed');
          }
          resolve();
        });
      });
    }
    
    // Stop backup scheduler
    if (backupScheduler) {
      console.log('🔄 Stopping backup scheduler...');
      backupScheduler.stop();
      console.log('✅ Backup scheduler stopped');
    }

    // Stop APK scan scheduler
    if (apkScanScheduler) {
      console.log('🔄 Stopping APK scan scheduler...');
      apkScanScheduler.stop();
      console.log('✅ APK scan scheduler stopped');
    }

    // Stop service-due scan scheduler
    if (serviceDueScheduler) {
      serviceDueScheduler.stop();
      console.log('✅ Service-due scheduler stopped');
    }
    
    // Close database connections
    try {
      console.log('🔄 Closing database connections...');
      const { pool } = await import('./db');
      await pool.end();
      console.log('✅ Database connection pool closed');
    } catch (dbError) {
      console.error('⚠️ Error with database cleanup:', dbError);
    }
    
    clearTimeout(shutdownTimeout);
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
    
  } catch (error) {
    clearTimeout(shutdownTimeout);
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Add process error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error.message);
  console.error('Stack trace:', error.stack);
  
  // Always perform graceful shutdown for fatal errors
  gracefulShutdown('UNCAUGHT_EXCEPTION').catch(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED PROMISE REJECTION at:', promise);
  console.error('Reason:', reason);
  
  // Log and perform graceful shutdown for fatal errors
  gracefulShutdown('UNHANDLED_REJECTION').catch(() => {
    process.exit(1);
  });
});

// Signal handlers for graceful shutdown
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch(() => {
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch(() => {
    process.exit(1);
  });
});

// ESM __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..'); // /app in Docker

// Setup Express
const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// Security: Apply security headers first
app.use(securityHeaders);
app.use(customSecurityHeaders);

// Security: Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Middleware - Increase limits for damage check diagrams with base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Security: Sanitize all inputs to prevent XSS
app.use(sanitizeInput);

// Setup authentication (includes session middleware). This also wires up CSRF
// protection (attachCsrfToken + csrfProtection) and registers /api/login,
// /api/register, and /api/logout — see setupAuth() in auth.ts for why the
// CSRF middleware has to live inside that same call rather than after it.
const { requireAuth } = setupAuth(app);

// Real-time WebSocket event system
function setupSocketIO(server: any) {
  // Determine allowed origins for CORS
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = isProduction 
    ? [
        process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
        process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : undefined,
        'https://*.replit.app',
        'https://*.replit.dev'
      ].filter((origin): origin is string => Boolean(origin))
    : "*"; // Allow all origins in development
  
  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      credentials: true
    },
    pingTimeout: 60000, // Increase ping timeout for stability
    pingInterval: 25000
  });

  // Set the socket instance for the realtime-events module
  setSocketInstance(io);

  io.on('connection', (socket) => {
    console.log(`👤 User connected: ${socket.id}`);

    // Send welcome message
    socket.emit('connected', { 
      message: 'Connected to Car Rental Manager',
      timestamp: new Date().toISOString()
    });

    socket.on('disconnect', () => {
      console.log(`👤 User disconnected: ${socket.id}`);
    });
  });

  console.log('🔗 Socket.IO server initialized for real-time updates');
  return io;
}


// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestPath = req.path;
  // Log the query string too. Without it a filtered list request and a full
  // one both read as "GET /api/vehicles", which makes log forensics guesswork.
  const requestUrl = req.originalUrl || requestPath;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson: any) {
    capturedJsonResponse = bodyJson;
    return originalResJson.call(res, bodyJson);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (requestPath.startsWith("/api")) {
      const actor = (req as any).user?.username;
      let logLine = `${req.method} ${requestUrl} ${res.statusCode} in ${duration}ms`;
      // Destructive calls get the user attached — "who deleted this" should
      // never again be unanswerable from the logs.
      if (req.method === "DELETE" && actor) logLine += ` [by ${actor}]`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 200) logLine = logLine.slice(0, 199) + "…";
      console.log(logLine);
    }
  });

  next();
});

// Health check
app.get('/health', async (_req, res) => {
  try {
    // Test database connection and get pool stats
    const dbStatus = await testDatabaseConnection();
    const { getPoolStats } = await import('./db');
    const poolStats = await getPoolStats();
    
    res.json({
      status: dbStatus.connected ? 'OK' : 'ERROR',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        ...dbStatus,
        pool: poolStats
      },
      envVars: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        SESSION_SECRET: !!process.env.SESSION_SECRET,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      error: error instanceof Error ? error.message : 'Unknown error',
      database: { connected: false, error: 'Connection test failed' },
      envVars: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        SESSION_SECRET: !!process.env.SESSION_SECRET,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  }
});

// Helper function to test database connection
async function testDatabaseConnection() {
  try {
    const { storage } = await import('./storage');
    // Try to get a user count or similar simple operation
    const users = await storage.getAllUsers();
    return { 
      connected: true, 
      userCount: users.length,
      message: 'Database connection successful'
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
      message: 'Database connection failed'
    };
  }
}

// Serve uploads directory for static files (diagrams, documents, etc.)
// Gated behind requireAuth: these files include customer contracts, damage-check
// photos, and license scans, which must never be reachable by an unauthenticated
// request that merely guesses or obtains a file path.
const uploadsPath = path.join(process.cwd(), 'uploads');
app.use('/uploads', requireAuth, express.static(uploadsPath));
console.log('📁 Serving uploads from:', uploadsPath);

// API root
app.get('/api', (_req, res) => {
  res.json({
    message: 'Car Rental Manager API',
    version: '1.0.0',
    endpoints: ['/health', '/api/*'],
    frontend: '/'
  });
});

// Register API routes FIRST (before production static files)  
app.use('/api/notifications', requireAuth, hasPermission(UserPermission.MANAGE_NOTIFICATIONS), notificationRoutes);
app.use('/api/vehicles/with-reservations', requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES, UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS), vehiclesWithReservationsRoutes);
app.use('/api/vehicles/filtered', requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), filteredVehiclesRoutes);
app.use('/api/email-templates', requireAuth, hasPermission(UserPermission.MANAGE_EMAIL_TEMPLATES), emailTemplatesRoutes);
app.use('/api/email-logs', requireAuth, hasPermission(UserPermission.MANAGE_EMAIL_TEMPLATES), emailLogsRoutes);
app.use('/api/apk-date-changes', requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), apkDateChangesRoutes);
await registerRoutes(app);

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  // In production, the built server is in dist/server/index.js
  // and the frontend is in dist/public/
  // So we need to go up from dist/server to dist, then to public
  const publicPath = path.join(__dirname, '..', 'public');
  const indexPath = path.join(publicPath, 'index.html');
  
  console.log('📦 Production build configuration:');
  console.log('   __dirname:', __dirname);
  console.log('   App root:', appRoot);
  console.log('   Public path:', publicPath);
  console.log('   Index path:', indexPath);
  console.log('   Public exists:', fs.existsSync(publicPath));
  console.log('   Index exists:', fs.existsSync(indexPath));

  try {
    if (fs.existsSync(publicPath)) {
      console.log('✅ Public directory found');

      app.use(express.static(publicPath, { index: false, maxAge: '1y', etag: true }));

      const assetsPath = path.join(publicPath, 'assets');
      if (fs.existsSync(assetsPath)) {
        app.use('/assets', express.static(assetsPath, { maxAge: '1y', etag: true }));
        console.log('✅ Assets directory found');
      } else {
        console.warn('⚠️ Assets directory not found at:', assetsPath);
      }
    } else {
      console.warn('⚠️ Public directory NOT found at:', publicPath);
    }
  } catch (fsError) {
    console.error('❌ File system error:', fsError);
  }

  // SPA fallback - MUST be last, after all API routes
  app.get('*', (req: Request, res: Response) => {
    // Only log non-asset requests to reduce noise
    if (!req.path.startsWith('/assets/') && !req.path.endsWith('.js') && !req.path.endsWith('.css')) {
      console.log('🔍 SPA Fallback for:', req.path);
    }
    
    if (req.path.startsWith('/api')) {
      console.log('❌ API route not found:', req.path);
      return res.status(404).json({ error: 'API endpoint not found' });
    }

    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.error('❌ index.html not found at:', indexPath);
      res.status(404).json({
        error: 'Frontend not built',
        message: 'index.html not found. Run "npm run build" to generate frontend assets',
        path: indexPath
      });
    }
  });
}

// Vite will be set up after server creation

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Error:', err.message);
  console.error('Stack:', err.stack);

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;

  res.status(status).json({
    error: 'Server Error',
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Initialize backup scheduler
backupScheduler = new BackupScheduler();
backupScheduler.start();

// Initialize RDW APK-date scan scheduler
apkScanScheduler = new ApkScanScheduler();
apkScanScheduler.start();

// Initialize regular-service due scan scheduler (notifications)
serviceDueScheduler = new ServiceDueScheduler();
serviceDueScheduler.start();

// Initialize session cleanup scheduler (runs every hour)
const sessionCleanupScheduler = startSessionCleanupScheduler(60);
console.log('🔒 Session cleanup scheduler started - runs hourly');

// SSL/HTTPS Configuration
const sslKeyPath = process.env.SSL_KEY_PATH;
const sslCertPath = process.env.SSL_CERT_PATH;
const enableHTTPS = process.env.ENABLE_HTTPS === 'true' && sslKeyPath && sslCertPath;

// Server startup function
async function startServer() {
  if (enableHTTPS) {
    // Check if certificate files exist
    if (!fs.existsSync(sslKeyPath!) || !fs.existsSync(sslCertPath!)) {
      console.error('❌ SSL certificate files not found!');
      console.error(`Key path: ${sslKeyPath}`);
      console.error(`Cert path: ${sslCertPath}`);
      console.log('🔄 Falling back to HTTP mode...');
      startHTTPServer();
      return;
    }

    try {
      // Read SSL certificate files
      const sslOptions = {
        key: fs.readFileSync(sslKeyPath!),
        cert: fs.readFileSync(sslCertPath!)
      };

      // Create HTTPS server
      server = https.createServer(sslOptions, app);
      
      // Setup Socket.IO for real-time updates
      setupSocketIO(server);
      
      // Set up Vite dev server for HTTPS
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔄 Development mode - Setting up Vite dev server for HTTPS');
        const { setupVite } = await import("./vite");
        await setupVite(app, server);
      }
      
      server.listen(port, '0.0.0.0', async () => {
        console.log('\n🎉 CAR RENTAL MANAGER STARTED SUCCESSFULLY!');
        console.log(`🔒 HTTPS Server:  https://0.0.0.0:${port}`);
        console.log(`📱 Frontend:      https://localhost:${port}/`);
        console.log(`🔍 Health check:  https://localhost:${port}/health`);
        console.log(`🔐 SSL Mode:      ✅ (Using ZeroSSL certificates)`);
        console.log(`🐳 Docker mode:   ${process.env.NODE_ENV === 'production' ? '✅' : '❌'}`);
        console.log(`💾 Backup Scheduler: ✅ (Nightly at 2:00 AM)`);
        console.log('=======================================\n');
        
        await initializeDefaultAdmin();
        displayDeploymentInfo();
      });

    } catch (error) {
      console.error('❌ Failed to start HTTPS server:', error);
      console.log('🔄 Falling back to HTTP mode...');
      await startHTTPServer();
    }
  } else {
    await startHTTPServer();
  }
}

// HTTP server fallback
async function startHTTPServer() {
  server = http.createServer(app);
  
  // Setup Socket.IO for real-time updates
  setupSocketIO(server);
  
  server.listen(port, '0.0.0.0', async () => {
    console.log('\n🎉 CAR RENTAL MANAGER STARTED SUCCESSFULLY!');
    console.log(`🌐 HTTP Server:   http://0.0.0.0:${port}`);
    console.log(`📱 Frontend:      http://localhost:${port}/`);
    console.log(`🔍 Health check:  http://localhost:${port}/health`);
    console.log(`🔓 SSL Mode:      ❌ (HTTP only)`);
    console.log(`🐳 Docker mode:   ${process.env.NODE_ENV === 'production' ? '✅' : '❌'}`);
    console.log(`💾 Backup Scheduler: ✅ (Nightly at 2:00 AM)`);
    console.log('=======================================\n');
    
    await initializeDefaultAdmin();
    displayDeploymentInfo();
  });
  
  // Set up Vite dev server for HTTP after server creation
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔄 Development mode - Setting up Vite dev server for HTTP');
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  }
}

// Start the server
startServer();
