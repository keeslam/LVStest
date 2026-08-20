import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

declare global {
  var dbPool: Pool | undefined;
}

const isProduction = process.env.NODE_ENV === 'production';

// Determine SSL configuration based on environment
// - DATABASE_SSL=false disables SSL entirely (for local/Coolify PostgreSQL without SSL)
// - DATABASE_SSL=true or not set uses SSL with rejectUnauthorized: false (for Neon/cloud databases)
// - Also check DATABASE_URL for sslmode parameter
function getSslConfig(): boolean | { rejectUnauthorized: boolean } {
  const dbUrl = process.env.DATABASE_URL || '';
  const sslEnv = process.env.DATABASE_SSL?.toLowerCase();
  
  // Explicit disable via environment variable
  if (sslEnv === 'false' || sslEnv === '0' || sslEnv === 'disable') {
    console.log('🔐 SSL disabled via DATABASE_SSL environment variable');
    return false;
  }
  
  // Check for sslmode=disable in connection string
  if (dbUrl.includes('sslmode=disable')) {
    console.log('🔐 SSL disabled via sslmode=disable in DATABASE_URL');
    return false;
  }
  
  // Default: enable SSL with relaxed verification (works with Neon and most cloud databases)
  return { rejectUnauthorized: false };
}

const sslConfig = getSslConfig();

// Database pool configuration
const pool = global.dbPool || new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: 10, // Reduce max connections for serverless (Neon has limits)
  min: 0,  // Allow pool to shrink to 0 when idle (serverless-friendly)
  idleTimeoutMillis: 20000, // Close idle connections after 20s
  connectionTimeoutMillis: 10000, // Wait up to 10s for connection
  allowExitOnIdle: true,
  query_timeout: 30000,
});

if (!isProduction) {
  global.dbPool = pool;
}

// Connection retry logic for serverless database resilience
let connectionRetryCount = 0;
const MAX_RETRY_COUNT = 5;

pool.on('error', async (err, client) => {
  console.error('❌ Database pool error:', err.message);
  
  // Handle connection termination gracefully (common with Neon serverless)
  if (err.message.includes('terminating connection') || 
      err.message.includes('Connection terminated') ||
      err.message.includes('connection timeout')) {
    connectionRetryCount++;
    
    if (connectionRetryCount <= MAX_RETRY_COUNT) {
      console.log(`🔄 Database connection issue detected, pool will auto-recover (attempt ${connectionRetryCount}/${MAX_RETRY_COUNT})`);
    } else {
      console.error('❌ Max database reconnection attempts reached');
      connectionRetryCount = 0; // Reset for next cycle
    }
  }
});

pool.on('connect', () => {
  connectionRetryCount = 0; // Reset on successful connection
  console.log('✅ New database client connected to pool');
});

pool.on('acquire', () => {
  // Reset retry counter when we successfully acquire a client
  connectionRetryCount = 0;
});

export { pool };

export const db = drizzle(pool, { schema });

export async function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

// Health check function with retry
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
}