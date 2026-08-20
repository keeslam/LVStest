#!/usr/bin/env node

/**
 * Database Initialization Script for Production Deployment
 * 
 * This script intelligently handles database setup:
 * 1. If database is empty (no tables), runs db:push to create all tables
 * 2. If database has tables, runs the safe migration script to add missing columns
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pkg from 'pg';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

console.log('🔄 Starting database initialization check...');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

const db = drizzle(pool);

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env }
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function isDatabaseEmpty() {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    const tableCount = parseInt(result.rows[0].count, 10);
    console.log(`📊 Found ${tableCount} tables in database`);
    
    return tableCount === 0;
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    return true; // Assume empty if we can't check
  }
}

async function hasCoreTables() {
  try {
    const coreTables = ['users', 'vehicles', 'customers', 'reservations'];
    
    for (const tableName of coreTables) {
      const result = await db.execute(sql`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = ${tableName}
      `);
      
      if (result.rows.length === 0) {
        console.log(`⚠️ Missing core table: ${tableName}`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error checking core tables:', error.message);
    return false;
  }
}

async function main() {
  try {
    const isEmpty = await isDatabaseEmpty();
    const hasCoreTablesResult = isEmpty ? false : await hasCoreTables();
    
    if (isEmpty || !hasCoreTablesResult) {
      console.log('🏗️ Database needs initialization - running schema push...');
      
      try {
        // Run db:push to create all tables from schema
        await runCommand('npm', ['run', 'db:push']);
        console.log('✅ Database schema created successfully');
      } catch (error) {
        console.error('⚠️ db:push failed, trying with --force...');
        try {
          await runCommand('npx', ['drizzle-kit', 'push', '--force']);
          console.log('✅ Database schema created with --force');
        } catch (forceError) {
          console.error('❌ Failed to initialize database:', forceError.message);
          console.error('');
          console.error('Please ensure your DATABASE_URL is correct and the database is accessible.');
          process.exit(1);
        }
      }
    } else {
      console.log('✅ Database already has core tables');
    }
    
    // Always run the safe migration script to add any missing columns
    console.log('🔄 Running safe migration script...');
    await runCommand('node', ['startup-migration.js']);
    console.log('✅ Migration completed successfully');
    
    await pool.end();
    console.log('🎉 Database initialization complete!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
