#!/usr/bin/env node

/**
 * Startup Migration Script for Production
 * Safely adds missing database columns before starting the application
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

console.log('🔄 Starting database migration...');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false  // Disable SSL for production database that doesn't support it
});

const db = drizzle(pool);

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  try {
    // First check if table exists
    const tableCheck = await db.execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = ${tableName}
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log(`⚠️ Table ${tableName} does not exist, skipping column ${columnName}`);
      return;
    }
    
    // Check if column exists
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${tableName} AND column_name = ${columnName}
    `);
    
    if (result.rows.length === 0) {
      console.log(`📝 Adding column ${columnName} to ${tableName}...`);
      await db.execute(sql.raw(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`));
      console.log(`✅ Added column ${columnName} to ${tableName}`);
    } else {
      console.log(`✅ Column ${columnName} already exists in ${tableName}`);
    }
  } catch (error) {
    console.error(`❌ Error adding column ${columnName} to ${tableName}:`, error.message);
    throw error;
  }
}

async function createTableIfNotExists(tableName, createTableSQL, insertDefaultSQL = null) {
  try {
    // Check if table exists
    const result = await db.execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = ${tableName}
    `);
    
    if (result.rows.length === 0) {
      console.log(`📝 Creating table ${tableName}...`);
      await db.execute(sql.raw(createTableSQL));
      console.log(`✅ Created table ${tableName}`);
      
      // Insert default data if provided
      if (insertDefaultSQL) {
        console.log(`📝 Inserting default data into ${tableName}...`);
        await db.execute(sql.raw(insertDefaultSQL));
        console.log(`✅ Inserted default data into ${tableName}`);
      }
    } else {
      console.log(`✅ Table ${tableName} already exists`);
    }
  } catch (error) {
    console.error(`❌ Error creating table ${tableName}:`, error.message);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log('🔍 Checking database schema...');
    
    // Check if core tables exist - if not, database needs initialization
    const coreTables = ['users', 'vehicles', 'customers', 'reservations'];
    const missingTables = [];
    
    for (const tableName of coreTables) {
      const result = await db.execute(sql`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = ${tableName}
      `);
      
      if (result.rows.length === 0) {
        missingTables.push(tableName);
      }
    }
    
    if (missingTables.length > 0) {
      console.error('❌ Missing core tables:', missingTables.join(', '));
      console.error('');
      console.error('🚨 DATABASE NOT INITIALIZED!');
      console.error('');
      console.error('Your database is missing required tables. This migration script is designed');
      console.error('to UPDATE existing databases, not create new ones.');
      console.error('');
      console.error('To initialize a new database, run this ONCE:');
      console.error('  npm run db:push');
      console.error('');
      console.error('After initialization, this migration script will handle safe updates.');
      console.error('');
      process.exit(1);
    }
    
    console.log('✅ All core tables present');
    
    // Create settings table if it doesn't exist (safe to create even on existing DB)
    await createTableIfNotExists(
      'settings',
      `CREATE TABLE settings (
        id SERIAL PRIMARY KEY,
        contract_number_start INTEGER DEFAULT 1 NOT NULL
      )`,
      `INSERT INTO settings (contract_number_start) VALUES (1)`
    );
    
    // Add ALL settings table columns (complete list from schema)
    // Contract number settings
    await addColumnIfNotExists('settings', 'contract_number_override', 'integer');
    
    // Maintenance calendar display settings
    await addColumnIfNotExists('settings', 'maintenance_excluded_statuses', 'text[] DEFAULT \'{not_for_rental}\'');
    await addColumnIfNotExists('settings', 'show_apk_reminders', 'boolean DEFAULT true NOT NULL');
    await addColumnIfNotExists('settings', 'apk_reminder_days', 'integer DEFAULT 30 NOT NULL');
    await addColumnIfNotExists('settings', 'show_warranty_reminders', 'boolean DEFAULT true NOT NULL');
    await addColumnIfNotExists('settings', 'warranty_reminder_days', 'integer DEFAULT 30 NOT NULL');
    await addColumnIfNotExists('settings', 'show_maintenance_blocks', 'boolean DEFAULT true NOT NULL');
    
    // Audit columns for settings
    await addColumnIfNotExists('settings', 'updated_at', 'timestamp DEFAULT NOW() NOT NULL');
    await addColumnIfNotExists('settings', 'updated_by', 'text');
    await addColumnIfNotExists('settings', 'updated_by_user_id', 'integer REFERENCES users(id)');
    
    // Add missing columns to vehicles table (only if vehicles table exists)
    await addColumnIfNotExists('vehicles', 'maintenance_status', 'text DEFAULT \'ok\' NOT NULL');
    await addColumnIfNotExists('vehicles', 'maintenance_note', 'text');
    await addColumnIfNotExists('vehicles', 'company_by', 'text');
    await addColumnIfNotExists('vehicles', 'registered_to_by', 'text');
    await addColumnIfNotExists('vehicles', 'production_date', 'text');
    await addColumnIfNotExists('vehicles', 'imei', 'text');
    await addColumnIfNotExists('vehicles', 'updated_by', 'text');
    await addColumnIfNotExists('vehicles', 'available_for_rental', 'boolean DEFAULT true NOT NULL');
    
    // Add missing columns to reservations table
    await addColumnIfNotExists('reservations', 'type', 'text DEFAULT \'standard\' NOT NULL');
    await addColumnIfNotExists('reservations', 'replacement_for_reservation_id', 'integer');
    await addColumnIfNotExists('reservations', 'placeholder_spare', 'boolean DEFAULT false NOT NULL');
    await addColumnIfNotExists('reservations', 'spare_vehicle_status', 'text DEFAULT \'assigned\'');
    await addColumnIfNotExists('reservations', 'contract_number', 'text');

    // Optional scheduled pickup/return time ("HH:MM"), used to tell an early
    // same-day pickup from a late one in the booking-conflict check.
    await addColumnIfNotExists('reservations', 'start_time', 'text');
    await addColumnIfNotExists('reservations', 'end_time', 'text');
    
    // Backfill unique contract numbers for picked up/returned/completed reservations only
    console.log('🔄 Backfilling contract numbers for picked-up reservations...');
    
    // Only backfill for reservations that have been picked up (have actual status progression)
    const reservationsResult = await db.execute(sql`
      SELECT id FROM reservations 
      WHERE (contract_number IS NULL OR contract_number = '')
      AND status IN ('picked_up', 'returned', 'completed')
      AND deleted_at IS NULL
      ORDER BY id
    `);
    
    if (reservationsResult.rows.length > 0) {
      console.log(`📝 Found ${reservationsResult.rows.length} reservations without contract numbers`);
      
      // Get all existing contract numbers to avoid collisions
      const existingNumbersResult = await db.execute(sql`
        SELECT contract_number FROM reservations 
        WHERE contract_number IS NOT NULL AND contract_number != ''
      `);
      
      // Parse all existing numeric contract numbers
      const existingNumbers = new Set();
      for (const row of existingNumbersResult.rows) {
        const num = parseInt(row.contract_number, 10);
        if (!isNaN(num)) {
          existingNumbers.add(num);
        }
      }
      
      // Get the starting number from settings
      const settingsResult = await db.execute(sql`SELECT contract_number_start FROM settings LIMIT 1`);
      let contractNumberStart = 1;
      
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].contract_number_start) {
        contractNumberStart = settingsResult.rows[0].contract_number_start;
      }
      
      // Find the maximum existing number
      let nextNumber = contractNumberStart;
      if (existingNumbers.size > 0) {
        const maxExisting = Math.max(...Array.from(existingNumbers));
        nextNumber = Math.max(contractNumberStart, maxExisting + 1);
      }
      
      console.log(`📝 Starting backfill from contract number: ${nextNumber}`);
      
      // Backfill each reservation with a unique contract number
      for (let i = 0; i < reservationsResult.rows.length; i++) {
        const reservationId = reservationsResult.rows[i].id;
        
        // Find next available number
        while (existingNumbers.has(nextNumber)) {
          nextNumber++;
        }
        
        const contractNumber = String(nextNumber).padStart(4, '0');
        
        await db.execute(sql`
          UPDATE reservations 
          SET contract_number = ${contractNumber}
          WHERE id = ${reservationId}
        `);
        
        existingNumbers.add(nextNumber);
        nextNumber++;
      }
      
      console.log(`✅ Backfilled ${reservationsResult.rows.length} contract numbers`);
    } else {
      console.log('✅ All reservations already have contract numbers');
    }
    
    // Check for duplicate contract numbers before adding constraint
    const duplicateCheck = await db.execute(sql`
      SELECT contract_number, COUNT(*) as count
      FROM reservations
      WHERE contract_number IS NOT NULL
      GROUP BY contract_number
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateCheck.rows.length > 0) {
      console.error('❌ Found duplicate contract numbers:', duplicateCheck.rows);
      throw new Error(`Cannot add unique constraint: Found ${duplicateCheck.rows.length} duplicate contract numbers. Please resolve duplicates manually.`);
    }
    
    // Add unique constraint if it doesn't exist (this is now a critical operation)
    const constraintCheck = await db.execute(sql`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'reservations' 
      AND constraint_name = 'reservations_contract_number_unique'
    `);
    
    if (constraintCheck.rows.length === 0) {
      console.log('📝 Adding unique constraint to contract_number...');
      try {
        await db.execute(sql`
          ALTER TABLE reservations 
          ADD CONSTRAINT reservations_contract_number_unique 
          UNIQUE (contract_number)
        `);
        console.log('✅ Added unique constraint to contract_number');
      } catch (error) {
        console.error('❌ CRITICAL: Failed to add unique constraint on contract_number:', error.message);
        throw error; // Fail deployment if constraint cannot be added
      }
    } else {
      console.log('✅ Unique constraint already exists on contract_number');
    }
    
    // IMPORTANT: contract_number should remain NULLABLE
    // Contract numbers are assigned during pickup, not during reservation creation
    // Remove NOT NULL constraint if it exists
    console.log('🔄 Ensuring contract_number is nullable (assigned during pickup)...');
    const columnInfo = await db.execute(sql`
      SELECT is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'reservations' 
      AND column_name = 'contract_number'
    `);
    
    if (columnInfo.rows.length > 0 && columnInfo.rows[0].is_nullable === 'NO') {
      console.log('📝 Removing NOT NULL constraint from contract_number...');
      try {
        await db.execute(sql`
          ALTER TABLE reservations 
          ALTER COLUMN contract_number DROP NOT NULL
        `);
        console.log('✅ Removed NOT NULL constraint from contract_number');
      } catch (error) {
        console.error('❌ Failed to remove NOT NULL constraint from contract_number:', error.message);
        throw error;
      }
    } else {
      console.log('✅ contract_number is already nullable');
    }
    
    // Add missing columns to customers table
    await addColumnIfNotExists('customers', 'created_by_user_id', 'integer');
    await addColumnIfNotExists('customers', 'updated_by_user_id', 'integer');
    
    // Create backup_settings table if it doesn't exist
    await createTableIfNotExists(
      'backup_settings',
      `CREATE TABLE backup_settings (
        id SERIAL PRIMARY KEY,
        storage_type TEXT NOT NULL DEFAULT 'object_storage',
        local_path TEXT,
        enable_auto_backup BOOLEAN NOT NULL DEFAULT true,
        backup_schedule TEXT NOT NULL DEFAULT '0 2 * * *',
        retention_days INTEGER NOT NULL DEFAULT 30,
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by TEXT,
        updated_by TEXT
      )`,
      `INSERT INTO backup_settings (
        storage_type, 
        local_path, 
        enable_auto_backup, 
        backup_schedule, 
        retention_days,
        created_by,
        updated_by
      ) VALUES (
        'local_filesystem',
        '/backups',
        true,
        '0 2 * * *',
        30,
        'admin',
        'admin'
      )`
    );
    
    // Create vehicle_customer_blacklist table if it doesn't exist
    await createTableIfNotExists(
      'vehicle_customer_blacklist',
      `CREATE TABLE vehicle_customer_blacklist (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id)
      )`
    );
    
    // Add created_by column if it doesn't exist (for existing tables)
    await addColumnIfNotExists('vehicle_customer_blacklist', 'created_by', 'integer REFERENCES users(id)');

    // Canvas-mode field layout for damage check templates (visual editor)
    await addColumnIfNotExists('damage_check_templates', 'canvas_fields', "jsonb NOT NULL DEFAULT '[]'::jsonb");

    // Configurable categories + handover checklist + header/footer text on
    // damage check templates. These were added after the initial deployment
    // and must be backfilled on existing production databases or PDF
    // generation fails with "column does not exist".
    await addColumnIfNotExists('damage_check_templates', 'categories', "jsonb NOT NULL DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('damage_check_templates', 'handover_checklist', "jsonb NOT NULL DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('damage_check_templates', 'header_text', 'text');
    await addColumnIfNotExists('damage_check_templates', 'footer_text', 'text');
    await addColumnIfNotExists('damage_check_templates', 'inspection_points', "jsonb NOT NULL DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('damage_check_templates', 'language', "text NOT NULL DEFAULT 'nl'");
    await addColumnIfNotExists('damage_check_templates', 'is_default', 'boolean NOT NULL DEFAULT false');
    
    // Add unique index if it doesn't exist
    const blacklistIndexCheck = await db.execute(sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'vehicle_customer_blacklist' 
      AND indexname = 'vehicle_customer_blacklist_unique'
    `);
    
    if (blacklistIndexCheck.rows.length === 0) {
      console.log('📝 Adding unique index to vehicle_customer_blacklist...');
      try {
        await db.execute(sql`
          CREATE UNIQUE INDEX vehicle_customer_blacklist_unique 
          ON vehicle_customer_blacklist(vehicle_id, customer_id)
        `);
        console.log('✅ Added unique index to vehicle_customer_blacklist');
      } catch (error) {
        console.log('⚠️ Unique index may already exist:', error.message);
      }
    } else {
      console.log('✅ Unique index already exists on vehicle_customer_blacklist');
    }
    
    // Ensure damage_check_pdf_templates base table exists before adding columns/dependents
    await createTableIfNotExists(
      'damage_check_pdf_templates',
      `CREATE TABLE damage_check_pdf_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        sections JSONB NOT NULL DEFAULT '[]',
        page_margins INTEGER NOT NULL DEFAULT 15,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`
    );
    
    // Add missing columns to damage_check_pdf_templates table
    await addColumnIfNotExists('damage_check_pdf_templates', 'page_orientation', "text DEFAULT 'portrait'");
    await addColumnIfNotExists('damage_check_pdf_templates', 'page_size', "text DEFAULT 'A4'");
    await addColumnIfNotExists('damage_check_pdf_templates', 'custom_page_width', 'integer');
    await addColumnIfNotExists('damage_check_pdf_templates', 'custom_page_height', 'integer');
    await addColumnIfNotExists('damage_check_pdf_templates', 'page_count', 'integer DEFAULT 1');
    await addColumnIfNotExists('damage_check_pdf_templates', 'tags', 'text[]');
    await addColumnIfNotExists('damage_check_pdf_templates', 'category', 'text');
    await addColumnIfNotExists('damage_check_pdf_templates', 'theme_id', 'integer');
    await addColumnIfNotExists('damage_check_pdf_templates', 'background_image', 'text');
    await addColumnIfNotExists('damage_check_pdf_templates', 'usage_count', 'integer DEFAULT 0');
    await addColumnIfNotExists('damage_check_pdf_templates', 'last_used_at', 'timestamp');
    await addColumnIfNotExists('damage_check_pdf_templates', 'created_by', 'text');
    await addColumnIfNotExists('damage_check_pdf_templates', 'updated_by', 'text');
    
    // Create damage_check_pdf_template_versions table
    await createTableIfNotExists(
      'damage_check_pdf_template_versions',
      `CREATE TABLE damage_check_pdf_template_versions (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES damage_check_pdf_templates(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        sections JSONB NOT NULL,
        settings JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by TEXT
      )`
    );
    
    // Create damage_check_pdf_template_themes table
    await createTableIfNotExists(
      'damage_check_pdf_template_themes',
      `CREATE TABLE damage_check_pdf_template_themes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        palette JSONB NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`
    );
    
    // Create damage_check_pdf_section_presets table
    await createTableIfNotExists(
      'damage_check_pdf_section_presets',
      `CREATE TABLE damage_check_pdf_section_presets (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        config JSONB NOT NULL,
        category TEXT,
        is_built_in BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`
    );
    
    // Add spare key tracking columns to vehicles table
    await addColumnIfNotExists('vehicles', 'spare_key_with_customer', 'boolean');
    await addColumnIfNotExists('vehicles', 'spare_key_customer_name', 'text');
    
    // Mileage decrease tracking columns (admin-only visibility)
    await addColumnIfNotExists('vehicles', 'mileage_decreased_by', 'text');
    await addColumnIfNotExists('vehicles', 'mileage_decreased_at', 'timestamp');
    await addColumnIfNotExists('vehicles', 'previous_mileage', 'integer');
    
    // Dutch per-km road toll rate, used to suggest a toll cost when logging a transport
    await addColumnIfNotExists('settings', 'toll_rate_per_km', "numeric NOT NULL DEFAULT '0.15'");

    // Vehicle transports: standalone swap/tow/repossession/delivery jobs that
    // don't require a reservation (unlike delivery_tasks, which does).
    await createTableIfNotExists(
      'vehicle_transports',
      `CREATE TABLE vehicle_transports (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        related_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        transport_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        origin_address TEXT,
        origin_city TEXT,
        destination_address TEXT,
        destination_city TEXT,
        distance_km NUMERIC,
        toll_cost NUMERIC,
        billable BOOLEAN NOT NULL DEFAULT false,
        billable_amount NUMERIC,
        invoiced BOOLEAN NOT NULL DEFAULT false,
        invoiced_date TEXT,
        scheduled_date TEXT NOT NULL,
        completed_date TEXT,
        driver_name TEXT,
        reason TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by TEXT,
        updated_by TEXT,
        created_by_user_id INTEGER REFERENCES users(id),
        updated_by_user_id INTEGER REFERENCES users(id)
      )`
    );
    await db.execute(sql`CREATE INDEX IF NOT EXISTS vehicle_transports_vehicle_id_idx ON vehicle_transports(vehicle_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS vehicle_transports_status_idx ON vehicle_transports(status)`);

    // Update any NULL maintenance_status values
    console.log('🔄 Updating maintenance status defaults...');
    await db.execute(sql`UPDATE vehicles SET maintenance_status = 'ok' WHERE maintenance_status IS NULL`);
    
    console.log('✅ Database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations();