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

async function backfillAndDropLegacyDamageCheckFields() {
  // One-time backfill: convert any damage_check_templates row that still
  // only has legacy categories/inspection_points/handover_checklist data
  // (canvas_fields empty) into equivalent canvas_fields, mirroring
  // scripts/migrate-damage-check-legacy-fields.ts's algorithm, then drop
  // the legacy columns and the dead damageCheckPdfTemplates family
  // tables. Safe to run on every startup — once done, the legacy columns
  // no longer exist so this is a fast no-op (early return below).
  const tableCheck = await db.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'damage_check_templates'
  `);
  if (tableCheck.rows.length === 0) {
    console.log('⚠️ Table damage_check_templates does not exist, skipping legacy damage-check backfill');
    return;
  }

  const columnCheck = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'damage_check_templates' AND column_name IN ('categories', 'inspection_points', 'handover_checklist')
  `);
  const legacyColumnsPresent = columnCheck.rows.map(r => r.column_name);

  if (legacyColumnsPresent.length > 0) {
    console.log('📝 Backfilling canvas_fields from legacy damage-check template data...');
    const result = await db.execute(sql`
      SELECT id, name, canvas_fields, categories, inspection_points, handover_checklist
      FROM damage_check_templates
    `);

    const newId = () => `f_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const mkField = (type, x, y, name, extra = {}) => ({
      id: newId(), type, x, y, fontSize: 11, isBold: false, textAlign: 'left', page: 1, name, ...extra,
    });

    function convertTemplate(categories, inspectionPoints, handoverChecklist) {
      const out = [];
      const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
      const pointsByCategory = new Map();
      for (const p of inspectionPoints) {
        if (!pointsByCategory.has(p.category)) pointsByCategory.set(p.category, []);
        pointsByCategory.get(p.category).push(p);
      }
      let gridY = 30;
      const GRID_X = 30, ROW_H = 18, HEAD_H = 22;
      for (const cat of sortedCategories) {
        const pts = pointsByCategory.get(cat.id) || [];
        if (pts.length === 0) continue;
        out.push(mkField('text', GRID_X, gridY, cat.label, { fontSize: 13, isBold: true }));
        gridY += HEAD_H;
        for (const p of pts) {
          if (p.position) {
            const x = Math.round(p.position.x * 595);
            const y = Math.round(p.position.y * 842);
            out.push(mkField('inspection', x, y, p.name, { damageTypes: p.damageTypes }));
          } else {
            out.push(mkField('inspection', GRID_X, gridY, p.name, { damageTypes: p.damageTypes }));
            gridY += ROW_H;
          }
        }
        gridY += 8;
      }
      const uncategorized = inspectionPoints.filter(p => !categories.some(c => c.id === p.category));
      for (const p of uncategorized) {
        out.push(mkField('inspection', GRID_X, gridY, p.name, { damageTypes: p.damageTypes }));
        gridY += ROW_H;
      }
      gridY += 10;
      const sortedHandover = [...handoverChecklist].sort((a, b) => a.order - b.order);
      for (const item of sortedHandover) {
        if (item.type === 'checkbox') {
          out.push(mkField('checkbox', GRID_X, gridY, item.label));
        } else {
          out.push(mkField('text', GRID_X, gridY, item.label));
        }
        gridY += ROW_H;
      }
      return out;
    }

    let migrated = 0;
    for (const row of result.rows) {
      const categories = row.categories || [];
      const inspectionPoints = row.inspection_points || [];
      const handoverChecklist = row.handover_checklist || [];
      const hasLegacyData = categories.length > 0 || inspectionPoints.length > 0 || handoverChecklist.length > 0;
      const hasCanvasFields = Array.isArray(row.canvas_fields) && row.canvas_fields.length > 0;
      if (!hasLegacyData || hasCanvasFields) continue;

      const converted = convertTemplate(categories, inspectionPoints, handoverChecklist);
      await db.execute(sql`
        UPDATE damage_check_templates SET canvas_fields = ${JSON.stringify(converted)}::jsonb WHERE id = ${row.id}
      `);
      console.log(`  ✅ Backfilled template ${row.id} ("${row.name}"): ${converted.length} canvasFields from legacy data`);
      migrated++;
    }
    console.log(`✅ Legacy damage-check backfill complete: ${migrated} template(s) converted`);

    // Single atomic statement rather than three separate awaits: if the
    // process dies between individual DROPs, the next boot would find a
    // subset of the columns still present and the SELECT above — which
    // names all three unconditionally — would throw "column does not
    // exist", exiting non-zero and preventing the app from ever starting.
    console.log('📝 Dropping legacy damage_check_templates columns...');
    await db.execute(sql`
      ALTER TABLE damage_check_templates
        DROP COLUMN IF EXISTS categories,
        DROP COLUMN IF EXISTS inspection_points,
        DROP COLUMN IF EXISTS handover_checklist
    `);
    console.log('✅ Dropped legacy damage_check_templates columns');
  } else {
    console.log('✅ Legacy damage_check_templates columns already absent, nothing to backfill/drop');
  }

  console.log('📝 Dropping dead damageCheckPdfTemplates family tables...');
  await db.execute(sql`DROP TABLE IF EXISTS damage_check_pdf_section_presets`);
  await db.execute(sql`DROP TABLE IF EXISTS damage_check_pdf_template_versions`);
  await db.execute(sql`DROP TABLE IF EXISTS damage_check_pdf_template_themes`);
  await db.execute(sql`DROP TABLE IF EXISTS damage_check_pdf_templates`);
  console.log('✅ Dropped damageCheckPdfTemplates family tables (if present)');
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
    
    // Per-user "hide prices" flag, admin-assignable like role/permissions/active
    await addColumnIfNotExists('users', 'hide_prices', 'boolean DEFAULT false NOT NULL');

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

    // Barcode tracking: permanent per-vehicle scan code printed on key labels
    await addColumnIfNotExists('vehicles', 'barcode', 'TEXT');
    try {
      await db.execute(sql`
        UPDATE vehicles
        SET barcode = 'VEH-' || LPAD(id::text, 6, '0')
        WHERE barcode IS NULL
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS vehicles_barcode_unique_idx
        ON vehicles (barcode)
      `);
      console.log('✅ Vehicle barcodes backfilled and unique index ensured');
    } catch (error) {
      console.error('⚠️ Vehicle barcode backfill failed:', error.message);
    }

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

    // Create backup_runs table if it doesn't exist. This is the run-history
    // ledger backupService.startRun/finishRun/getStatus depend on - if it's
    // missing, every backup attempt throws, getStatus() swallows the
    // exception and reports no error, and the UI shows "Never" with no
    // explanation: byte-for-byte the original silent-failure bug. The
    // Docker path (startup-migration.js, this file) never ran `db:push`,
    // so this table needs its own explicit DDL here, matching
    // shared/schema.ts's backupRuns definition column-for-column.
    await createTableIfNotExists(
      'backup_runs',
      `CREATE TABLE backup_runs (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMP,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        filename TEXT,
        size_bytes INTEGER,
        checksum TEXT,
        verified BOOLEAN NOT NULL DEFAULT false,
        file_pruned BOOLEAN NOT NULL DEFAULT false,
        error TEXT,
        trigger TEXT NOT NULL
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

    // Header/footer text + language + default flag on damage check templates.
    await addColumnIfNotExists('damage_check_templates', 'header_text', 'text');
    await addColumnIfNotExists('damage_check_templates', 'footer_text', 'text');
    await addColumnIfNotExists('damage_check_templates', 'language', "text NOT NULL DEFAULT 'nl'");
    await addColumnIfNotExists('damage_check_templates', 'is_default', 'boolean NOT NULL DEFAULT false');

    // One-time backfill of legacy categories/inspection_points/handover_checklist
    // data into canvas_fields, then drop those legacy columns and the dead
    // damageCheckPdfTemplates family tables. Must run after canvas_fields is
    // guaranteed to exist (immediately above). Safe on every startup.
    await backfillAndDropLegacyDamageCheckFields();

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
    
    // Add spare key tracking columns to vehicles table
    await addColumnIfNotExists('vehicles', 'spare_key_with_customer', 'boolean');
    await addColumnIfNotExists('vehicles', 'spare_key_customer_name', 'text');
    
    // Mileage decrease tracking columns (admin-only visibility)
    await addColumnIfNotExists('vehicles', 'mileage_decreased_by', 'text');
    await addColumnIfNotExists('vehicles', 'mileage_decreased_at', 'timestamp');
    await addColumnIfNotExists('vehicles', 'previous_mileage', 'integer');
    
    // Dutch per-km road toll rate, used to suggest a toll cost when logging a transport
    await addColumnIfNotExists('settings', 'toll_rate_per_km', "numeric NOT NULL DEFAULT '0.15'");

    // Depot / home base address, used as the starting point for route optimization
    await addColumnIfNotExists('settings', 'depot_address', 'text');
    await addColumnIfNotExists('settings', 'depot_city', 'text');
    await addColumnIfNotExists('settings', 'depot_postal_code', 'text');

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

    // Breakdown/maintenance swaps default to not billable — this is our cost, not the customer's
    await addColumnIfNotExists('vehicle_transports', 'is_breakdown_or_maintenance', 'boolean NOT NULL DEFAULT false');

    // Spare/replacement-vehicle workflow for transports (any type, not just swap).
    await addColumnIfNotExists('vehicle_transports', 'spare_required', 'boolean NOT NULL DEFAULT false');
    await addColumnIfNotExists('vehicle_transports', 'spare_reservation_id', 'integer REFERENCES reservations(id) ON DELETE SET NULL');
    // spare_picked_up_at was superseded by deriving status from the linked
    // spare reservation's own status (shared/transport-spare-status.ts) —
    // dropped rather than left as a dead, never-read column.
    await db.execute(sql`ALTER TABLE vehicle_transports DROP COLUMN IF EXISTS spare_picked_up_at`);

    // Outside/customer-owned vehicles (e.g. a garage pickup) that never enter the
    // fleet — described by the external_* columns instead of a real vehicle_id.
    await addColumnIfNotExists('vehicle_transports', 'is_external_vehicle', 'boolean NOT NULL DEFAULT false');
    await addColumnIfNotExists('vehicle_transports', 'external_license_plate', 'text');
    await addColumnIfNotExists('vehicle_transports', 'external_brand', 'text');
    await addColumnIfNotExists('vehicle_transports', 'external_model', 'text');
    await addColumnIfNotExists('vehicle_transports', 'external_color', 'text');
    await addColumnIfNotExists('vehicle_transports', 'external_owner_name', 'text');
    await addColumnIfNotExists('vehicle_transports', 'external_owner_phone', 'text');

    const transportsVehicleIdInfo = await db.execute(sql`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vehicle_transports'
      AND column_name = 'vehicle_id'
    `);
    if (transportsVehicleIdInfo.rows.length > 0 && transportsVehicleIdInfo.rows[0].is_nullable === 'NO') {
      console.log('📝 Removing NOT NULL constraint from vehicle_transports.vehicle_id...');
      try {
        await db.execute(sql`ALTER TABLE vehicle_transports ALTER COLUMN vehicle_id DROP NOT NULL`);
        console.log('✅ Removed NOT NULL constraint from vehicle_transports.vehicle_id');
      } catch (error) {
        console.error('❌ Failed to remove NOT NULL constraint from vehicle_transports.vehicle_id:', error.message);
        throw error;
      }
    } else {
      console.log('✅ vehicle_transports.vehicle_id is already nullable');
    }

    // Links a spare reservation back to the standalone Transport it was created
    // for (as opposed to replacement_for_reservation_id, which links back to a
    // customer rental) — lets the Rental Calendar and "Beheer vervangende
    // voertuigen" dashboard recognize transport-created spares the same way they
    // already recognize reservation-created ones.
    await addColumnIfNotExists('reservations', 'replacement_for_transport_id', 'integer REFERENCES vehicle_transports(id) ON DELETE SET NULL');

    // One-time backfill: existing transport-linked spare reservations were created
    // with type 'standard' before this column existed, making them invisible to
    // both features above. Idempotent — once type flips to 'replacement' the WHERE
    // clause no longer matches, so re-running this is a no-op.
    const backfillResult = await db.execute(sql`
      UPDATE reservations r
      SET type = 'replacement', replacement_for_transport_id = vt.id
      FROM vehicle_transports vt
      WHERE vt.spare_reservation_id = r.id
      AND r.type = 'standard'
    `);
    if (backfillResult.rowCount > 0) {
      console.log(`✅ Backfilled ${backfillResult.rowCount} transport-linked spare reservation(s) to type 'replacement'`);
    }

    // One-time backfill: earlier transport-linked spares got an auto-generated
    // note naming internal transport/reservation ids (e.g. "...covering
    // reservation #223") or, for external vehicles, brand/model/plate with no
    // indication it's an outside vehicle — staff-facing text now names the
    // actual vehicle being replaced, and flags external ones as such. Only
    // touches notes still in one of those older auto-generated shapes, so a
    // manually-edited note is left alone; idempotent since a fixed note no
    // longer matches either WHERE pattern below.
    const notesBackfillResult = await db.execute(sql`
      UPDATE reservations r
      SET notes = CASE
        WHEN v.id IS NOT NULL THEN 'Replacement vehicle for ' || v.brand || ' ' || v.model || ' (' || v.license_plate || ')'
        WHEN vt.is_external_vehicle AND trim(concat_ws(' ', vt.external_brand, vt.external_model)) != ''
          THEN 'Replacement vehicle for ' || trim(concat_ws(' ', vt.external_brand, vt.external_model)) ||
               CASE WHEN vt.external_license_plate IS NOT NULL THEN ' (' || vt.external_license_plate || ')' ELSE '' END ||
               ' — external vehicle'
        ELSE 'Replacement vehicle for transport #' || vt.id
      END
      FROM vehicle_transports vt
      LEFT JOIN vehicles v ON v.id = vt.vehicle_id
      WHERE r.replacement_for_transport_id = vt.id
      AND (
        r.notes LIKE 'Replacement vehicle for transport #%(covering reservation #%'
        OR (vt.is_external_vehicle AND r.notes LIKE 'Replacement vehicle for %' AND r.notes NOT LIKE '%external vehicle%')
      )
    `);
    if (notesBackfillResult.rowCount > 0) {
      console.log(`✅ Backfilled ${notesBackfillResult.rowCount} transport-linked spare reservation note(s) to name the replaced vehicle`);
    }

    // One-time backfill: reservations flagged deliveryRequired before the
    // auto-created-transport sync existed (server/database-storage.ts
    // syncDeliveryTransport, wired into createReservation/updateReservation) have
    // no linked vehicle_transports row, so they show up in the dashboard's
    // "Levering" tab as a bare reservation with no print/edit/complete actions.
    // Promotes each one to a real transport, same shape syncDeliveryTransport
    // creates going forward. Idempotent — only reservations still missing a
    // linked transport (LEFT JOIN ... IS NULL) match.
    const deliveryTransportBackfillResult = await db.execute(sql`
      INSERT INTO vehicle_transports (
        vehicle_id, customer_id, transport_type, destination_address, destination_city,
        scheduled_date, billable, billable_amount, reservation_id, status,
        is_external_vehicle, spare_required, is_breakdown_or_maintenance, invoiced
      )
      SELECT
        r.vehicle_id, r.customer_id, 'delivery', r.delivery_address, r.delivery_city,
        r.start_date, (r.delivery_fee IS NOT NULL), r.delivery_fee, r.id, 'scheduled',
        false, false, false, false
      FROM reservations r
      LEFT JOIN vehicle_transports vt ON vt.reservation_id = r.id
      WHERE r.delivery_required = true
      AND r.vehicle_id IS NOT NULL
      AND r.deleted_at IS NULL
      AND vt.id IS NULL
    `);
    if (deliveryTransportBackfillResult.rowCount > 0) {
      console.log(`✅ Backfilled ${deliveryTransportBackfillResult.rowCount} delivery reservation(s) to a linked transport`);
    }

    // Documents can now be "general reports" that aren't tied to one vehicle
    // (e.g. a multi-vehicle transport summary), so vehicle_id must be nullable.
    const documentsVehicleIdInfo = await db.execute(sql`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'documents'
      AND column_name = 'vehicle_id'
    `);
    if (documentsVehicleIdInfo.rows.length > 0 && documentsVehicleIdInfo.rows[0].is_nullable === 'NO') {
      console.log('📝 Removing NOT NULL constraint from documents.vehicle_id...');
      try {
        await db.execute(sql`ALTER TABLE documents ALTER COLUMN vehicle_id DROP NOT NULL`);
        console.log('✅ Removed NOT NULL constraint from documents.vehicle_id');
      } catch (error) {
        console.error('❌ Failed to remove NOT NULL constraint from documents.vehicle_id:', error.message);
        throw error;
      }
    } else {
      console.log('✅ documents.vehicle_id is already nullable');
    }

    // Transport report templates: same drag-position-fields model as pdf_templates,
    // kept in a separate table so this can't collide with the live contract templates.
    await createTableIfNotExists(
      'transport_report_templates',
      `CREATE TABLE transport_report_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        is_default BOOLEAN DEFAULT false,
        background_path TEXT,
        background_preview_path TEXT,
        template_preview_path TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        fields JSONB DEFAULT '[]'
      )`
    );

    await createTableIfNotExists(
      'transport_report_template_backgrounds',
      `CREATE TABLE transport_report_template_backgrounds (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES transport_report_templates(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        background_path TEXT NOT NULL,
        preview_path TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`
    );

    // Seed the default Dutch "Driver Handoff Sheet" transport report template on fresh installs
    // (only if no templates exist yet, so this never overwrites a template someone has customized)
    const existingTransportTemplates = await db.execute(sql`SELECT id FROM transport_report_templates LIMIT 1`);
    if (existingTransportTemplates.rows.length === 0) {
      console.log('🔄 Seeding default transport report template (Driver Handoff Sheet)...');
      const defaultTransportReportFields = [
        { id: 'field-voertuig', name: 'Voertuig', x: 50, y: 40, fontSize: 22, isBold: true, source: 'lblVoertuig', textAlign: 'left', locked: false },
        { id: 'field-kenteken', name: 'Kenteken', x: 50, y: 100, fontSize: 18, isBold: true, source: 'lblKenteken', textAlign: 'left', locked: false },
        { id: 'field-type', name: 'Soort Transport', x: 50, y: 150, fontSize: 14, isBold: false, source: 'lblType', textAlign: 'left', locked: false },
        { id: 'field-status', name: 'Status', x: 50, y: 180, fontSize: 14, isBold: false, source: 'lblStatus', textAlign: 'left', locked: false },
        { id: 'field-datum', name: 'Datum', x: 50, y: 210, fontSize: 14, isBold: false, source: 'lblDatum', textAlign: 'left', locked: false },
        { id: 'field-van', name: 'Van', x: 50, y: 260, fontSize: 14, isBold: false, source: 'lblVan', textAlign: 'left', locked: false },
        { id: 'field-naar', name: 'Naar', x: 50, y: 290, fontSize: 14, isBold: false, source: 'lblNaar', textAlign: 'left', locked: false },
        { id: 'field-afstand', name: 'Afstand', x: 50, y: 330, fontSize: 14, isBold: false, source: 'lblAfstand', textAlign: 'left', locked: false },
        { id: 'field-tolkosten', name: 'Tolkosten', x: 50, y: 360, fontSize: 14, isBold: false, source: 'lblTolkosten', textAlign: 'left', locked: false },
        { id: 'field-chauffeur', name: 'Chauffeur', x: 50, y: 400, fontSize: 14, isBold: false, source: 'lblChauffeur', textAlign: 'left', locked: false },
        { id: 'field-reden', name: 'Reden', x: 50, y: 440, fontSize: 14, isBold: false, source: 'lblReden', textAlign: 'left', locked: false },
        { id: 'field-notities', name: 'Notities', x: 50, y: 470, fontSize: 14, isBold: false, source: 'lblNotities', textAlign: 'left', locked: false },
        { id: 'field-klant', name: 'Klant', x: 50, y: 510, fontSize: 14, isBold: false, source: 'lblKlant', textAlign: 'left', locked: false },
        { id: 'field-factureerbaar', name: 'Factureerbaar', x: 50, y: 550, fontSize: 14, isBold: false, source: 'lblFactureerbaar', textAlign: 'left', locked: false },
        { id: 'field-bedrag', name: 'Bedrag', x: 50, y: 590, fontSize: 14, isBold: false, source: 'lblBedrag', textAlign: 'left', locked: false },
        { id: 'field-gegenereerd', name: 'Gegenereerd op', x: 50, y: 790, fontSize: 9, isBold: false, source: 'lblGegenereerd', textAlign: 'left', locked: false },
      ];
      await db.execute(sql`
        INSERT INTO transport_report_templates (name, is_default, fields)
        VALUES ('Driver Handoff Sheet', true, ${JSON.stringify(defaultTransportReportFields)}::jsonb)
      `);
      console.log('✅ Default transport report template seeded');
    } else {
      console.log('✅ Transport report templates already exist, skipping seed');
    }

    // Recycle bin for vehicle deletes. Without this table a delete cannot be
    // recorded or undone, so it must exist before the app serves traffic.
    await createTableIfNotExists('deleted_records', `
      CREATE TABLE deleted_records (
        id serial PRIMARY KEY,
        entity_type text NOT NULL,
        entity_id integer NOT NULL,
        label text NOT NULL,
        payload jsonb NOT NULL,
        related_counts jsonb,
        deleted_at timestamp DEFAULT now() NOT NULL,
        deleted_by text,
        deleted_by_user_id integer,
        restored_at timestamp,
        restored_by text
      );
      CREATE INDEX deleted_records_entity_idx ON deleted_records (entity_type, entity_id);
      CREATE INDEX deleted_records_deleted_at_idx ON deleted_records (deleted_at);
    `);

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